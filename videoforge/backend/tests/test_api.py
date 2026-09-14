"""Tests de la API HTTP."""

from __future__ import annotations

import json
import time
from pathlib import Path

import pytest

pytest.importorskip("fastapi")

from fastapi.testclient import TestClient  # noqa: E402

from forge.api.app import create_app  # noqa: E402
from forge.api.jobs import Job, JobState, JobStore  # noqa: E402
from forge.config import Settings  # noqa: E402


@pytest.fixture
def api_settings(tmp_path: Path, settings: Settings) -> Settings:
    """Ajustes con cache propio por test, para que los trabajos no se mezclen."""
    s = settings.model_copy(update={"cache_dir": tmp_path / "cache"})
    s.ensure_dirs()
    return s


@pytest.fixture
def client(api_settings: Settings) -> TestClient:
    return TestClient(create_app(api_settings))


@pytest.fixture
def video_bytes(sample_video: Path) -> bytes:
    return sample_video.read_bytes()


def _subir(client: TestClient, datos: bytes, nombre: str = "fixture.mp4") -> str:
    respuesta = client.post("/api/jobs", files={"file": (nombre, datos, "video/mp4")})
    assert respuesta.status_code == 201
    return respuesta.json()["id"]


def _esperar(client: TestClient, job_id: str, estados: set[str], limite: float = 240.0) -> dict:
    inicio = time.time()
    estado = {}
    while time.time() - inicio < limite:
        estado = client.get(f"/api/jobs/{job_id}").json()
        if estado["state"] in estados:
            return estado
        time.sleep(0.2)
    raise AssertionError(f"el trabajo se quedo en {estado.get('state')}")


# -- informacion general ---------------------------------------------------


def test_health_describe_el_entorno(client: TestClient) -> None:
    datos = client.get("/api/health").json()
    assert datos["version"]
    assert datos["device"] in ("cpu", "cuda")
    assert "toolchain" in datos


def test_lista_los_estilos(client: TestClient) -> None:
    estilos = client.get("/api/styles").json()
    nombres = {e["name"] for e in estilos}
    assert {"tutorial", "gaming-hype", "cinematic"} <= nombres
    assert all(e["label"] and e["description"] for e in estilos)


# -- subida ----------------------------------------------------------------


def test_sube_un_video(client: TestClient, video_bytes: bytes) -> None:
    datos = client.post(
        "/api/jobs", files={"file": ("fixture.mp4", video_bytes, "video/mp4")}
    ).json()
    assert datos["state"] == "creado"
    assert datos["id"]


def test_rechaza_un_formato_que_no_es_video(client: TestClient) -> None:
    respuesta = client.post("/api/jobs", files={"file": ("notas.txt", b"hola", "text/plain")})
    assert respuesta.status_code == 415


def test_rechaza_un_fichero_vacio(client: TestClient) -> None:
    respuesta = client.post("/api/jobs", files={"file": ("v.mp4", b"", "video/mp4")})
    assert respuesta.status_code == 400


def test_un_trabajo_inexistente_da_404(client: TestClient) -> None:
    assert client.get("/api/jobs/no-existe").status_code == 404


def test_se_puede_borrar_un_trabajo(client: TestClient, video_bytes: bytes) -> None:
    job_id = _subir(client, video_bytes)
    assert client.delete(f"/api/jobs/{job_id}").status_code == 200
    assert client.get(f"/api/jobs/{job_id}").status_code == 404


def test_el_listado_los_devuelve(client: TestClient, video_bytes: bytes) -> None:
    _subir(client, video_bytes)
    _subir(client, video_bytes)
    assert len(client.get("/api/jobs").json()) == 2


# -- orden de las etapas ---------------------------------------------------


def test_no_se_puede_montar_sin_analizar(client: TestClient, video_bytes: bytes) -> None:
    job_id = _subir(client, video_bytes)
    respuesta = client.post(f"/api/jobs/{job_id}/plan", json={"style": "tutorial"})
    assert respuesta.status_code == 409


def test_no_se_puede_renderizar_sin_montar(client: TestClient, video_bytes: bytes) -> None:
    job_id = _subir(client, video_bytes)
    assert client.post(f"/api/jobs/{job_id}/render", json={}).status_code == 409


def test_los_resultados_no_existen_antes_de_tiempo(client: TestClient, video_bytes: bytes) -> None:
    job_id = _subir(client, video_bytes)
    for ruta in ("analysis", "profile", "edl", "saturation", "result"):
        assert client.get(f"/api/jobs/{job_id}/{ruta}").status_code == 409


# -- flujo completo --------------------------------------------------------


@pytest.fixture
def job_analizado(client: TestClient, video_bytes: bytes) -> str:
    job_id = _subir(client, video_bytes)
    client.post(f"/api/jobs/{job_id}/analyze", json={"skip_speech": True})
    estado = _esperar(client, job_id, {"analizado", "error"})
    assert estado["state"] == "analizado", estado.get("error")
    return job_id


def test_el_analisis_deja_sus_resultados(client: TestClient, job_analizado: str) -> None:
    analisis = client.get(f"/api/jobs/{job_analizado}/analysis").json()
    assert analisis["shots"]
    assert analisis["media"]["duration"] > 0

    perfil = client.get(f"/api/jobs/{job_analizado}/profile").json()
    assert perfil["domain"]
    assert perfil["suggested_style"]


@pytest.fixture
def job_montado(client: TestClient, job_analizado: str) -> str:
    client.post(
        f"/api/jobs/{job_analizado}/plan",
        json={"style": "tutorial", "intensity": 50, "broll": True, "offline": True},
    )
    estado = _esperar(client, job_analizado, {"planificado", "error"})
    assert estado["state"] == "planificado", estado.get("error")
    return job_analizado


def test_el_montaje_recorta_el_video(client: TestClient, job_montado: str) -> None:
    edl = client.get(f"/api/jobs/{job_montado}/edl").json()
    assert edl["timeline"]
    duracion = sum(
        (c["source_end"] - c["source_start"]) / c["speed"] for c in edl["timeline"]
    )
    assert duracion < edl["source_duration"]


def test_el_montaje_trae_su_medida_de_saturacion(client: TestClient, job_montado: str) -> None:
    saturacion = client.get(f"/api/jobs/{job_montado}/saturation").json()
    assert 0 <= saturacion["score"] <= 100
    assert saturacion["verdict"]
    assert saturacion["heatmap"]
    assert saturacion["readings"]


def test_el_reajuste_no_cambia_la_duracion(client: TestClient, job_montado: str) -> None:
    """El invariante del proyecto, comprobado tambien por la API."""
    informe = client.post(f"/api/jobs/{job_montado}/balance", json={"intensity": 5}).json()
    assert informe["duration_before"] == informe["duration_after"]
    assert "summary" in informe


def test_se_puede_guardar_un_montaje_editado(client: TestClient, job_montado: str) -> None:
    edl = client.get(f"/api/jobs/{job_montado}/edl").json()
    antes = len(edl["effects"])
    edl["effects"] = edl["effects"][: max(0, antes - 1)]

    respuesta = client.put(f"/api/jobs/{job_montado}/edl", json=edl)
    assert respuesta.status_code == 200
    assert "score" in respuesta.json()
    assert len(client.get(f"/api/jobs/{job_montado}/edl").json()["effects"]) == antes - 1


def test_un_montaje_invalido_se_rechaza(client: TestClient, job_montado: str) -> None:
    assert client.put(f"/api/jobs/{job_montado}/edl", json={"esto": "no vale"}).status_code == 422


def test_los_capitulos_salen_en_formato_youtube(client: TestClient, job_montado: str) -> None:
    datos = client.get(f"/api/jobs/{job_montado}/chapters").json()
    assert "markers" in datos and "chapters" in datos


def test_el_render_produce_un_fichero_descargable(client: TestClient, job_montado: str) -> None:
    client.post(f"/api/jobs/{job_montado}/render", json={"preview": True})
    estado = _esperar(client, job_montado, {"listo", "error"}, limite=300)
    assert estado["state"] == "listo", estado.get("error")

    respuesta = client.get(f"/api/jobs/{job_montado}/result")
    assert respuesta.status_code == 200
    assert respuesta.headers["content-type"] == "video/mp4"
    assert len(respuesta.content) > 10_000
    assert "editado" in respuesta.headers.get("content-disposition", "")


# -- progreso --------------------------------------------------------------


def test_el_progreso_se_publica(client: TestClient, video_bytes: bytes) -> None:
    job_id = _subir(client, video_bytes)
    client.post(f"/api/jobs/{job_id}/analyze", json={"skip_speech": True})
    _esperar(client, job_id, {"analizado", "error"})

    with client.stream("GET", f"/api/jobs/{job_id}/events") as respuesta:
        assert respuesta.status_code == 200
        assert "text/event-stream" in respuesta.headers["content-type"]


def test_los_eventos_se_guardan_para_quien_llega_tarde(
    api_settings: Settings, tmp_path: Path
) -> None:
    store = JobStore(api_settings)
    job = store.create("v.mp4", b"x" * 100)
    for i in range(5):
        job.emit(f"paso {i}", i / 5)

    cola = job.subscribe()
    assert cola.qsize() >= 5, "un cliente que se conecta tarde debe ver lo ya ocurrido"


def test_los_eventos_no_crecen_sin_limite(api_settings: Settings) -> None:
    from forge.api.jobs import MAX_EVENTS

    store = JobStore(api_settings)
    job = store.create("v.mp4", b"x" * 100)
    for i in range(MAX_EVENTS + 120):
        job.emit(f"paso {i}")
    assert len(job.events) <= MAX_EVENTS


# -- persistencia ----------------------------------------------------------


def test_los_trabajos_sobreviven_a_un_reinicio(
    api_settings: Settings, video_bytes: bytes
) -> None:
    """Lo que mas cuesta rehacer es el analisis: no puede perderse al reiniciar."""
    primera = TestClient(create_app(api_settings))
    job_id = _subir(primera, video_bytes)
    primera.post(f"/api/jobs/{job_id}/analyze", json={"skip_speech": True})
    _esperar(primera, job_id, {"analizado", "error"})

    segunda = TestClient(create_app(api_settings))
    recuperado = segunda.get(f"/api/jobs/{job_id}")
    assert recuperado.status_code == 200
    assert recuperado.json()["state"] == "analizado"
    assert segunda.get(f"/api/jobs/{job_id}/analysis").status_code == 200


def test_un_trabajo_interrumpido_no_revive_en_marcha(api_settings: Settings) -> None:
    """Si el servidor se apago a mitad, hay que poder relanzarlo, no esperarlo."""
    store = JobStore(api_settings)
    job = store.create("v.mp4", b"x" * 2000)
    job.state = JobState.RENDERIZANDO
    job.save()

    recuperado = Job.load(job.root)
    assert recuperado is not None
    assert recuperado.state is JobState.ERROR
    assert "interrumpido" in (recuperado.error or "")


def test_no_se_lanzan_dos_tareas_a_la_vez(
    client: TestClient, video_bytes: bytes, monkeypatch: pytest.MonkeyPatch
) -> None:
    job_id = _subir(client, video_bytes)
    store: JobStore = client.app.state.store
    store.get(job_id).busy = True

    assert client.post(f"/api/jobs/{job_id}/analyze", json={}).status_code == 409


def test_el_stream_se_cierra_cuando_el_trabajo_queda_ocioso(
    client: TestClient, video_bytes: bytes
) -> None:
    """Un estado intermedio no es final, pero si de reposo: no puede colgar."""
    job_id = _subir(client, video_bytes)
    client.post(f"/api/jobs/{job_id}/analyze", json={"skip_speech": True})
    estado = _esperar(client, job_id, {"analizado", "error"})
    assert estado["state"] == "analizado"

    inicio = time.time()
    with client.stream("GET", f"/api/jobs/{job_id}/events") as respuesta:
        list(respuesta.iter_lines())
    assert time.time() - inicio < 20, "el stream se quedo colgado"
