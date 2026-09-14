"""Tests del cache por huella de contenido."""

from __future__ import annotations

from pathlib import Path

from forge.cache import JobCache, fingerprint_file
from forge.config import Settings


def _escribir(path: Path, datos: bytes) -> Path:
    path.write_bytes(datos)
    return path


def test_huella_es_estable(tmp_path: Path) -> None:
    f = _escribir(tmp_path / "a.bin", b"contenido" * 1000)
    assert fingerprint_file(f) == fingerprint_file(f)


def test_huella_cambia_con_el_contenido(tmp_path: Path) -> None:
    a = _escribir(tmp_path / "a.bin", b"x" * 5000)
    b = _escribir(tmp_path / "b.bin", b"y" * 5000)
    assert fingerprint_file(a) != fingerprint_file(b)


def test_huella_cambia_con_el_tamano(tmp_path: Path) -> None:
    a = _escribir(tmp_path / "a.bin", b"x" * 5000)
    b = _escribir(tmp_path / "b.bin", b"x" * 5001)
    assert fingerprint_file(a) != fingerprint_file(b)


def test_ficheros_pequenos_se_hashean_enteros(tmp_path: Path) -> None:
    """Por debajo del umbral el modo rapido y el completo deben coincidir."""
    f = _escribir(tmp_path / "a.bin", b"z" * 1024)
    assert fingerprint_file(f, fast=True) == fingerprint_file(f, fast=False)


def test_huella_rapida_detecta_cambio_al_final(tmp_path: Path) -> None:
    """El muestreo cubre el final, que es donde un corte deja huella."""
    grande = bytearray(b"a" * (40 * 1024 * 1024))
    a = _escribir(tmp_path / "a.bin", bytes(grande))
    grande[-100:] = b"b" * 100
    b = _escribir(tmp_path / "b.bin", bytes(grande))
    assert fingerprint_file(a, fast=True) != fingerprint_file(b, fast=True)


def test_escribir_y_leer_etapa(settings: Settings, sample_video: Path) -> None:
    jc = JobCache(settings, sample_video)
    assert jc.read("prueba") is None
    jc.write("prueba", {"valor": 42})
    assert jc.read("prueba") == {"valor": 42}
    assert jc.has("prueba")


def test_version_distinta_invalida_la_etapa(settings: Settings, sample_video: Path) -> None:
    """Si cambia el codigo que genera la etapa, el cache viejo no debe colarse."""
    jc = JobCache(settings, sample_video)
    jc.write("versionada", {"valor": 1}, version=1)
    assert jc.read("versionada", version=1) == {"valor": 1}
    assert jc.read("versionada", version=2) is None


def test_json_corrupto_se_trata_como_ausente(settings: Settings, sample_video: Path) -> None:
    jc = JobCache(settings, sample_video)
    jc.write("rota", {"a": 1})
    jc.stage_file("rota").write_text("{esto no es json")
    assert jc.read("rota") is None


def test_clear_borra_las_etapas(settings: Settings, sample_video: Path) -> None:
    jc = JobCache(settings, sample_video)
    jc.write("uno", {"a": 1})
    jc.artifact("grande.bin").write_bytes(b"0" * 2048)
    assert jc.size_on_disk() > 0
    jc.clear()
    assert jc.read("uno") is None
    assert jc.root.is_dir()


def test_el_mismo_video_comparte_carpeta(settings: Settings, sample_video: Path) -> None:
    a = JobCache(settings, sample_video)
    b = JobCache(settings, sample_video)
    assert a.root == b.root
