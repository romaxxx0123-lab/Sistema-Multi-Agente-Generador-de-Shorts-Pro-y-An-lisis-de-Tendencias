"""Un modelo local para las decisiones de juicio, sin que pueda estropear nada.

El nombre de una seccion salia de **contar**: que palabras usa este tramo que no
usan los demas. Esta medido y funciona, pero cuenta, no entiende, y hay un sitio
donde eso se acaba. Sobre la guia de Palworld:

    "vamos con la estacion de expediciones"

"estacion" y "expediciones" estan en la misma frase, las dos se dicen dos veces y
las dos son exclusivas de esa seccion: **no hay nada que contar que las separe**.
Medido sobre las tres secciones de la guia, la cuenta acierta 2 de 3 y falla
justo en esa.

Aqui se prueba lo unico que se puede probar sin pesos: que la integracion hace
lo que promete. La calidad del modelo la mide `forge eval-nombres` en la maquina
de quien lo use --- aqui no hay forma de descargar ninguno.
"""

from __future__ import annotations

import json
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

import pytest

from forge.understand.namer import (
    LocalModel,
    Section,
    clean_answer,
    model_name,
    name_section,
    stat_name,
)

EVAL = Path(__file__).resolve().parents[2] / "eval" / "nombres-palworld.json"


def _seccion(nombre: str) -> Section:
    """La misma seccion que mide `forge eval-nombres`, leida del mismo fichero.

    Importa que sea **el mismo texto**: un resumen escrito a mano para la prueba
    cuenta palabras distintas, y entonces la prueba mide una cuenta que nadie
    ejecuta. Con el fichero de evaluacion, lo que aqui falla es lo que falla en
    la maquina de quien lo use.
    """
    casos = json.loads(EVAL.read_text(encoding="utf-8"))
    caso = next(c for c in casos if c["seccion"] == nombre)
    return Section(
        text=caso["texto"],
        others=caso["otras"],
        opening=caso["apertura"],
    )


SECCION = _seccion("expediciones")


# -- el servidor de mentira, que es lo que hace esto medible -----------------


def _servidor(respuesta: str, *, estado: int = 200):
    """Un Ollama de mentira que siempre contesta lo mismo."""

    class Mango(BaseHTTPRequestHandler):
        def do_POST(self):  # noqa: N802
            largo = int(self.headers.get("Content-Length", 0))
            self.rfile.read(largo)
            cuerpo = json.dumps({"response": respuesta}).encode()
            self.send_response(estado)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(cuerpo)))
            self.end_headers()
            self.wfile.write(cuerpo)

        def do_GET(self):  # noqa: N802
            self.send_response(200)
            self.send_header("Content-Length", "2")
            self.end_headers()
            self.wfile.write(b"{}")

        def log_message(self, *a):  # silencio
            pass

    srv = HTTPServer(("127.0.0.1", 0), Mango)
    hilo = threading.Thread(target=srv.serve_forever, daemon=True)
    hilo.start()
    return srv


@pytest.fixture
def ollama():
    """Levanta el servidor de mentira y devuelve un `LocalModel` apuntando a el."""
    creados = []

    def hacer(respuesta: str, **kw):
        srv = _servidor(respuesta, **kw)
        creados.append(srv)
        puerto = srv.server_address[1]
        return LocalModel(endpoint=f"http://127.0.0.1:{puerto}", timeout=5.0)

    yield hacer
    for srv in creados:
        srv.shutdown()


# -- que funcione ------------------------------------------------------------


def test_el_modelo_nombra_la_seccion(ollama) -> None:
    """Y acierta donde la cuenta falla, que es el motivo de todo esto."""
    modelo = ollama("Expediciones")

    del_modelo, origen = name_section(SECCION, modelo)
    assert del_modelo == "Expediciones"
    assert origen == "modelo"

    por_cuenta = stat_name(SECCION)
    assert "expediciones" not in por_cuenta.lower(), (
        "si la cuenta ya acertara, esta prueba no probaria nada"
    )


def test_sin_modelo_todo_sale_como_antes() -> None:
    """La pieza es opcional: sin ella, el nombre es el de siempre."""
    nombre, origen = name_section(SECCION, None)
    assert origen == "cuenta"
    assert nombre == stat_name(SECCION)


# -- y sobre todo, que no pueda estropear nada ------------------------------


def test_lo_que_se_inventa_se_tira(ollama) -> None:
    """Un cartel con una palabra que no dijiste es peor que uno flojo.

    Es lo que mas hace un modelo pequeno con una pregunta asi: contestar algo
    que suena al tema y no esta en el video.
    """
    modelo = ollama("Mazmorras")

    assert model_name(SECCION, modelo) == "", "'mazmorras' no se dice en la seccion"
    nombre, origen = name_section(SECCION, modelo)
    assert origen == "cuenta", "y entonces manda la cuenta"
    assert nombre == stat_name(SECCION)


@pytest.mark.parametrize("respuesta", [
    "Claro, el nombre de esta seccion seria: Expediciones",
    "La seccion trata sobre las expediciones y las rutas disponibles",
    "",
    "   ",
    "expediciones rutas estacion bosque",
])
def test_una_parrafada_tampoco_vale(ollama, respuesta: str) -> None:
    """Se pide una palabra o dos. Lo que no lo sea, no se usa."""
    modelo = ollama(respuesta)
    assert model_name(SECCION, modelo) == "", respuesta


def test_un_servidor_caido_no_tumba_el_montaje() -> None:
    """Que el modelo no conteste es una mejora que falta, no un error."""
    modelo = LocalModel(endpoint="http://127.0.0.1:1", timeout=0.4)

    assert modelo.generate("hola") == ""
    assert not modelo.available()
    nombre, origen = name_section(SECCION, modelo)
    assert origen == "cuenta" and nombre


def test_un_servidor_que_responde_basura_tampoco(ollama) -> None:
    modelo = ollama("no soy json", estado=500)
    nombre, origen = name_section(SECCION, modelo)
    assert origen == "cuenta" and nombre


def test_se_cuenta_cuantas_veces_sirvio(ollama) -> None:
    """Para poder decir "de veinte preguntas, catorce valieron"."""
    modelo = ollama("Expediciones")
    for _ in range(3):
        name_section(SECCION, modelo)
    assert modelo.asked == 3
    assert modelo.used == 3

    inutil = ollama("Mazmorras")
    name_section(SECCION, inutil)
    assert inutil.asked == 1 and inutil.used == 0


# -- el filtro, pieza a pieza -----------------------------------------------


@pytest.mark.parametrize("bruto,esperado", [
    ("Expediciones", "Expediciones"),
    ('  "expediciones".  ', "Expediciones"),
    ("expediciones\nY tambien rutas", "Expediciones"),
    ("**Rutas**", "Rutas"),
    ("Expediciones de Pal", ""),      # tres palabras
    ("Mazmorras", ""),                # inventada
    ("x", ""),                        # ni siquiera es una palabra del texto
])
def test_el_filtro(bruto: str, esperado: str) -> None:
    assert clean_answer(bruto, SECCION) == esperado


def test_el_modelo_se_configura_por_entorno(monkeypatch) -> None:
    """Apagado por defecto: sin endpoint no se llama a nada."""
    from forge.config import Settings

    monkeypatch.delenv("FORGE_MODEL_ENDPOINT", raising=False)
    assert Settings.load().local_model() is None

    monkeypatch.setenv("FORGE_MODEL_ENDPOINT", "http://localhost:11434")
    monkeypatch.setenv("FORGE_MODEL", "llama3.1:8b")
    modelo = Settings.load().local_model()
    assert modelo is not None
    assert modelo.model == "llama3.1:8b"
