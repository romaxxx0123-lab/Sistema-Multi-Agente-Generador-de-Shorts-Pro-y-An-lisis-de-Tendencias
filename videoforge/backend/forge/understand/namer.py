"""Ponerle nombre a una seccion, con la cuenta o con un modelo local.

Hasta aqui el nombre salia de **contar**: que palabras usa este tramo que no
usan los demas. Funciona, y esta medido; pero cuenta, no entiende, y hay un
sitio donde eso se acaba. Sobre la guia de Palworld:

    "vamos con la estacion de expediciones"

"estacion" y "expediciones" estan en la misma frase, las dos se dicen dos veces
y las dos son exclusivas de esa seccion. **No hay nada que contar que las
separe**: saber cual de las dos nombra la cosa es entender la frase, y eso es
justo lo que hace un modelo de lenguaje y no hace una estadistica.

Asi que aqui conviven las dos, con tres reglas que son lo que hace que meter un
modelo no estropee nada:

1. **No puede inventar.** El nombre tiene que salir de palabras que dijiste en
   esa seccion. Si el modelo devuelve otra cosa --- y lo hara --- se descarta y
   manda la cuenta. Un cartel con una palabra que no dijiste es peor que uno
   flojo.
2. **Se puede apagar.** Sin modelo configurado no se llama a nada y todo sale
   exactamente igual que antes. Es la misma regla que ya cumplen el OCR y la
   transcripcion.
3. **Se mide.** `forge eval-nombres` compara los dos contra nombres escritos a
   mano y da el porcentaje de cada uno. Si el modelo no gana, se queda apagado.

El modelo se habla por HTTP contra un servidor local --- Ollama o el `server` de
llama.cpp, que exponen la misma idea --- en vez de cargarse dentro del proceso.
Asi no hay que compilar nada, el modelo lo eliges tu, y el proyecto no tiene que
saber nada de pesos ni de cuantizaciones.
"""

from __future__ import annotations

import json
import re
import unicodedata
from dataclasses import dataclass, field
from urllib import error, request

from .topics import content_stems, label
from .text import normalize

#: Lo que se le pide. Corto y cerrado a proposito: lo que se quiere del modelo
#: es una eleccion entre palabras que ya estan ahi, no que escriba un titulo.
PROMPT = """Eres el rotulista de un video. Te doy lo que se dice en una seccion.

Responde SOLO con el nombre de esa seccion: una palabra, dos como mucho.
Tiene que ser una palabra que aparezca en el texto. Sin comillas, sin punto,
sin explicar nada.

Texto:
{texto}

Nombre:"""

#: Palabras como mucho en la respuesta.
MAX_WORDS = 2
#: Y letras, para cortar una respuesta que se va por las ramas.
MAX_CHARS = 40


def _sin_tildes(texto: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFD", texto)
        if unicodedata.category(c) != "Mn"
    )


@dataclass(frozen=True)
class Section:
    """Una seccion con lo que hace falta para nombrarla."""

    #: lo que se dice en ella
    text: str
    #: y lo que se dice en las demas, que es con lo que se compara
    others: str = ""
    #: su primera frase, que es donde se anuncia el tema
    opening: str = ""


def stat_name(section: Section, words: int = 3) -> str:
    """El nombre por la cuenta: lo que esta seccion dice y las otras no."""
    return label([section.text], [section.others], words, opening=section.opening)


def _palabras_dichas(texto: str) -> set[str]:
    """Las palabras de la seccion, normalizadas para comparar."""
    return {_sin_tildes(p) for p in normalize(texto).split() if len(p) > 2}


def clean_answer(bruto: str, section: Section) -> str:
    """Valida lo que devolvio el modelo. Vacio = no vale, manda la cuenta.

    Un modelo local pequeno hace tres cosas con una pregunta asi: contestar bien,
    contestar con una parrafada, e **inventarse** una palabra que suena al tema
    pero no esta en el video. Las tres se filtran aqui, y la tercera es la que
    importa: un cartel que dice algo que no dijiste es peor que uno flojo.
    """
    if not bruto:
        return ""
    # Primera linea, sin comillas ni adornos.
    texto = bruto.strip().splitlines()[0] if bruto.strip() else ""
    texto = texto.strip().strip('"\'`*.:;,()[]{}')
    texto = re.sub(r"\s+", " ", texto)
    if not texto or len(texto) > MAX_CHARS:
        return ""

    palabras = texto.split()
    if not palabras or len(palabras) > MAX_WORDS:
        return ""

    # Y lo que decide: cada palabra tiene que haberse dicho en la seccion.
    dichas = _palabras_dichas(section.text)
    for p in palabras:
        if _sin_tildes(p.lower().strip(".,;:")) not in dichas:
            return ""

    limpio = " ".join(palabras)
    return limpio[:1].upper() + limpio[1:]


@dataclass
class LocalModel:
    """Un modelo de lenguaje corriendo en tu maquina, por HTTP.

    Vale Ollama (`http://localhost:11434`) y el `server` de llama.cpp. No se
    carga nada dentro del proceso: asi no hay que compilar, el modelo lo eliges
    tu, y este proyecto no tiene que saber de pesos ni de cuantizaciones.
    """

    endpoint: str = "http://localhost:11434"
    model: str = "qwen2.5:7b"
    timeout: float = 20.0
    #: cuantas veces se pidio y cuantas se uso, para poder contarlo
    asked: int = field(default=0, init=False)
    used: int = field(default=0, init=False)

    def _post(self, ruta: str, cuerpo: dict) -> dict:
        datos = json.dumps(cuerpo).encode()
        req = request.Request(
            f"{self.endpoint.rstrip('/')}{ruta}",
            data=datos,
            headers={"Content-Type": "application/json"},
        )
        with request.urlopen(req, timeout=self.timeout) as resp:
            return json.loads(resp.read().decode())

    def generate(self, prompt: str) -> str:
        """Una respuesta, o vacio si el servidor no esta o falla.

        Que el modelo no conteste no puede tumbar un montaje: es una mejora
        opcional, y sin ella queda el nombre por la cuenta.
        """
        self.asked += 1
        try:
            datos = self._post("/api/generate", {
                "model": self.model,
                "prompt": prompt,
                "stream": False,
                # Nombrar no es escribir: sin creatividad y con pocas fichas.
                "options": {"temperature": 0.0, "num_predict": 12},
            })
        except (error.URLError, OSError, ValueError, json.JSONDecodeError):
            return ""
        respuesta = datos.get("response") or datos.get("text") or ""
        return respuesta if isinstance(respuesta, str) else ""

    def available(self) -> bool:
        """Si hay alguien escuchando ahi."""
        try:
            with request.urlopen(
                f"{self.endpoint.rstrip('/')}/api/tags", timeout=min(3.0, self.timeout)
            ) as resp:
                return resp.status == 200
        except (error.URLError, OSError):
            return False


def model_name(section: Section, modelo: LocalModel) -> str:
    """El nombre segun el modelo, ya validado. Vacio si no sirve."""
    if not section.text.strip():
        return ""
    bruto = modelo.generate(PROMPT.format(texto=section.text[:2000]))
    limpio = clean_answer(bruto, section)
    if limpio:
        modelo.used += 1
    return limpio


def name_section(section: Section, modelo: LocalModel | None = None) -> tuple[str, str]:
    """El nombre de una seccion y de donde salio.

    Devuelve `(nombre, "modelo" | "cuenta")`. El modelo manda cuando contesta
    algo valido; si no hay modelo, o no contesta, o se inventa una palabra, la
    cuenta tiene siempre la ultima palabra --- nunca se queda sin nombre por
    culpa de una pieza opcional.
    """
    if modelo is not None:
        del_modelo = model_name(section, modelo)
        if del_modelo:
            return del_modelo, "modelo"
    return stat_name(section), "cuenta"
