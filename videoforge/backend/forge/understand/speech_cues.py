"""Lo que le estas pidiendo al montaje sin saberlo.

`segments.py` lee la estructura del video (que parte es cada tramo). Esto lee lo
otro: los **momentos sueltos** en los que lo que dices pide una decision de
edicion concreta.

- **Senalas** ("mira aqui", "este boton de arriba a la derecha"). Cuando
  senalas, estas dirigiendo la mirada de quien ve a un sitio concreto **en ese
  instante**, y a veces incluso dices a cual: *arriba a la derecha*. Eso es
  mejor informacion que cualquier mapa de saliencia, porque la saliencia dice
  donde hay contraste y tu dices donde hay que mirar.

- **Enfatizas**. Por dos vias a la vez: las palabras ("esto es clave", "sobre
  todo") y el **nivel de voz**, que ya se mide para encontrar los silencios y se
  estaba tirando. Una silaba dicha cuatro decibelios por encima de tu media es
  enfasis de verdad, medido, no adivinado.

- **Te corriges** ("no, perdon, mejor dicho"). Eso marca la toma anterior como
  fallida, y es de lo poco que se puede quitar entero sin perder contenido:
  literalmente estas diciendo que lo que acabas de decir no vale.

Las tres se detectan por formulas fijas, se explican solas y fallan por el lado
seguro: sin formula reconocible no hay senal, y el montaje se comporta igual que
antes.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from enum import Enum
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from ..analysis.types import AudioAnalysis, Transcript, Word


class CueKind(str, Enum):
    """Que te esta pidiendo el montaje en ese momento."""

    POINT = "senala"
    EMPHASIS = "enfasis"
    RETAKE = "se corrige"
    WAIT = "toca esperar"
    SKIP = "se salta"


@dataclass
class SpeechCue:
    """Un momento en el que lo que dices pide algo concreto."""

    kind: CueKind
    start: float
    end: float
    #: la formula que lo delato, para poder explicarlo y revisarlo
    phrase: str = ""
    #: 0..1
    strength: float = 0.5
    #: zona de la pantalla, si llegaste a decir cual
    region: tuple[float, float] | None = None

    @property
    def mid(self) -> float:
        return (self.start + self.end) / 2

    @property
    def rationale(self) -> str:
        donde = ""
        if self.kind is CueKind.WAIT:
            return f'{self.kind.value}: avisas con "{self.phrase}"'
        if self.kind is CueKind.SKIP:
            return f'{self.kind.value}: dices "{self.phrase}"'
        if self.region:
            donde = f" hacia ({self.region[0]:.0%}, {self.region[1]:.0%})"
        if self.phrase:
            return f'{self.kind.value}{donde}: dices "{self.phrase}"'
        return f"{self.kind.value}{donde}: lo dices mas alto"


# ---------------------------------------------------------------------------
# Senalar
# ---------------------------------------------------------------------------

#: Formulas con las que se dirige la mirada a algo de la pantalla.
_DEIXIS = (
    r"(mira|mirad|fijate|fijaos|ves|veis|observa)\b",
    r"(aqui|ahi|alli)\b",
    r"(este|esta|esto|estos|estas)\s+(boton|menu|campo|casilla|icono|panel|opcion|pestana|barra|cuadro)\b",
    r"(justo|precisamente)\s+(aqui|ahi)\b",
    r"(lo|la)\s+(ves|veis)\b",
)

#: Nombrar la zona a secas, sin formula de senalar delante.
_SOLO_ZONA = r"\b(arriba|abajo|izquierda|derecha|esquina)\b"

#: Zonas nombrables y su centro en la pantalla. Los valores no son 0 ni 1: lo
#: que se nombra "arriba" no es el borde, es el tercio de arriba.
_ZONAS_X = {"izquierda": 0.22, "derecha": 0.78, "centro": 0.5, "medio": 0.5}
_ZONAS_Y = {"arriba": 0.25, "abajo": 0.75, "centro": 0.5, "medio": 0.5}
#: Cuantas palabras alrededor de la formula se miran buscando la zona. Diez,
#: porque la gente la dice larga: en "este boton de arriba a la derecha del
#: todo", el "derecha" cae siete palabras despues de la marca. Con seis se
#: cogia la altura y se perdia el lado, y el zoom apuntaba al centro.
REGION_WINDOW = 10

#: Ventana que se le da al momento de senalar, en segundos.
POINT_SECONDS = 1.6


# ---------------------------------------------------------------------------
# Enfasis
# ---------------------------------------------------------------------------

_ENFASIS_LEXICO = (
    (r"(muy|super|mega)\s+importante\b", 0.95),
    (r"\b(clave|fundamental|imprescindible|esencial)\b", 0.9),
    (r"sobre todo\b", 0.7),
    (r"lo (mas|unico) (importante|dificil|raro)\b", 0.9),
    (r"(esto|eso) es lo que\b", 0.6),
    (r"\b(nunca|jamas|siempre)\b", 0.55),
)

#: Cuantos dB por encima del nivel **de alrededor** cuenta como enfasis.
#: Medido contra las palabras que el generador acentua a proposito:
#:
#:     umbral   aciertos   falsos positivos
#:       2,5       6/6            3
#:       3,0       6/6            0
#:       3,5       6/6            0
#:       4,0       5/6            0
#:
#: 3,2 cae en el centro de la meseta donde la respuesta es estable, no en el
#: borde: ajustarlo al limite es como se consigue un numero bonito que se rompe
#: con el primer video distinto.
EMPHASIS_DB = 3.2
#: Y un tope, porque un golpe en la mesa o un click no son enfasis.
EMPHASIS_MAX_DB = 18.0
#: Palabras demasiado cortas no llevan el acento de la frase.
EMPHASIS_MIN_CHARS = 4


# ---------------------------------------------------------------------------
# Correcciones
# ---------------------------------------------------------------------------

_CORRECCIONES = (
    (r"^(no|nop),?\s+(perdon|perdona|perdonad)\b", 0.95),
    (r"^(perdon|perdona|perdonad)\b", 0.85),
    (r"^(mejor dicho|quiero decir|o sea no|es decir no)\b", 0.9),
    (r"^(me he (equivocado|liado)|me equivoque)\b", 0.95),
    (r"^(a ver|espera|espera espera),?\s+(no|que no)\b", 0.85),
    (r"^(nada|bueno) no,?\s", 0.7),
)

#: Cuanto se puede retirar hacia atras al detectar una correccion. Es poco a
#: proposito: lo que se quita es una frase fallida, no un parrafo.
RETAKE_MAX_SECONDS = 3.5


# ---------------------------------------------------------------------------
# Esperas y saltos: cuando narras tu propio montaje
# ---------------------------------------------------------------------------

#: Avisos de que ahora viene una espera. Lo que sigue no es tiempo muerto que
#: haya que tirar: es un proceso que hay que **ver pasar**, solo que deprisa.
_ESPERAS = (
    (r"(esto|eso) (va a |suele )?(tardar|tarda)\b", 0.9),
    (r"mientras (carga|se instala|se copia|termina|acaba)\b", 0.9),
    (r"(esperamos|hay que esperar|toca esperar)\b", 0.9),
    (r"(esto|eso) (va|tarda) (un poco |bastante )?(lento|rato)\b", 0.85),
    (r"(se tarda|tarda un rato|tarda lo suyo)\b", 0.9),
    (r"(en lo que|mientras) (carga|instala|descarga)\b", 0.8),
    (r"(this|it) (takes|will take) a (while|bit)\b", 0.85),
)

#: Y avisos de que lo que viene sobra directamente.
_SALTOS = (
    (r"(esto|eso) (os |te )?(lo )?(salto|me lo salto)\b", 0.95),
    (r"(no hace falta|no hace falta que) (que )?(veais|veas|lo veas|lo veais)\b", 0.9),
    (r"(os|te) (ahorro|lo ahorro)\b", 0.9),
    (r"(me salto|nos saltamos) (esto|esta parte)\b", 0.95),
    (r"(esto|esta parte) (no|tampoco) (aporta|interesa|hace falta)\b", 0.85),
)


def _find_announcements(
    transcript: "Transcript | None",
    patrones: tuple[tuple[str, float], ...],
    kind: CueKind,
) -> list[SpeechCue]:
    """Frases en las que narras lo que hay que hacer con lo que viene ahora.

    El tramo marcado empieza **donde acaba la frase**: lo que se anuncia es lo
    que viene despues, no la frase que lo anuncia.
    """
    if transcript is None:
        return []

    salida: list[SpeechCue] = []
    for frase in transcript.segments:
        texto = _normalize(frase.text)
        for patron, peso in patrones:
            encaje = re.search(patron, texto)
            if not encaje:
                continue
            salida.append(
                SpeechCue(
                    kind=kind,
                    start=round(frase.end, 3),
                    end=round(frase.end, 3),
                    phrase=encaje.group(0),
                    strength=peso,
                )
            )
            break
    return salida


def find_waits(transcript: "Transcript | None") -> list[SpeechCue]:
    """Momentos en los que avisas de que toca esperar."""
    return _find_announcements(transcript, _ESPERAS, CueKind.WAIT)


def find_skips(transcript: "Transcript | None") -> list[SpeechCue]:
    """Momentos en los que dices que lo que viene sobra."""
    return _find_announcements(transcript, _SALTOS, CueKind.SKIP)


def _normalize(texto: str) -> str:
    limpio = "".join(
        c for c in unicodedata.normalize("NFD", texto.lower())
        if unicodedata.category(c) != "Mn"
    )
    return re.sub(r"[^a-z0-9\s]", " ", limpio)


def _find_region(palabras: list[str], desde: int) -> tuple[float, float] | None:
    """La zona de pantalla que se nombra cerca de esa posicion, si la hay."""
    ventana = palabras[max(0, desde - 2) : desde + REGION_WINDOW]
    x = next((v for p in ventana if (v := _ZONAS_X.get(p)) is not None), None)
    y = next((v for p in ventana if (v := _ZONAS_Y.get(p)) is not None), None)
    if x is None and y is None:
        return None
    # Lo que no se dijo se deja al centro: "a la derecha" no dice nada de la
    # altura, asi que apuntar al centro vertical es lo honesto.
    return (x if x is not None else 0.5, y if y is not None else 0.5)


def find_pointing(transcript: "Transcript | None") -> list[SpeechCue]:
    """Momentos en los que senalas algo de la pantalla."""
    if transcript is None:
        return []

    salida: list[SpeechCue] = []
    for frase in transcript.segments:
        if not frase.words:
            continue
        palabras = [_normalize(w.text).strip() for w in frase.words]
        texto = " ".join(palabras)

        # Nombrar una zona de la pantalla ya es senalar, aunque no se use
        # ninguna formula: "lo tienes arriba a la derecha" dirige la mirada
        # igual que "mira arriba a la derecha". Cuenta menos, porque tambien se
        # dice de pasada, pero no contarlo era perder la senal entera.
        marcas = list(_DEIXIS)
        if not any(re.search(pat, texto) for pat in _DEIXIS):
            marcas = [_SOLO_ZONA]

        for patron in marcas:
            for encaje in re.finditer(patron, texto):
                # De la posicion en caracteres a la palabra que la contiene.
                indice = texto[: encaje.start()].count(" ")
                if indice >= len(frase.words):
                    continue
                palabra = frase.words[indice]
                region = _find_region(palabras, indice)
                solo_zona = patron is _SOLO_ZONA
                if solo_zona and region is None:
                    continue
                salida.append(
                    SpeechCue(
                        kind=CueKind.POINT,
                        start=round(palabra.start, 3),
                        end=round(palabra.start + POINT_SECONDS, 3),
                        phrase=encaje.group(0),
                        # Senalar y ademas decir donde es una senal mucho mas
                        # fuerte que senalar a secas; nombrar la zona sin
                        # senalar, la mas floja de las tres.
                        strength=0.45 if solo_zona else (0.9 if region else 0.55),
                        region=region,
                    )
                )
    return _dedupe(salida)


def find_emphasis(
    transcript: "Transcript | None", audio: "AudioAnalysis | None" = None
) -> list[SpeechCue]:
    """Momentos que dices con enfasis, por las palabras o por el nivel de voz."""
    if transcript is None:
        return []

    salida: list[SpeechCue] = []

    for frase in transcript.segments:
        texto = _normalize(frase.text)
        for patron, peso in _ENFASIS_LEXICO:
            encaje = re.search(patron, texto)
            if not encaje:
                continue
            indice = texto[: encaje.start()].count(" ")
            palabra = frase.words[min(indice, len(frase.words) - 1)] if frase.words else None
            if palabra is None:
                continue
            salida.append(
                SpeechCue(
                    kind=CueKind.EMPHASIS,
                    start=round(palabra.start, 3),
                    end=round(palabra.end + 0.6, 3),
                    phrase=encaje.group(0),
                    strength=peso,
                )
            )

    salida += _acoustic_emphasis(transcript, audio)
    return _dedupe(salida)


def _acoustic_emphasis(
    transcript: "Transcript", audio: "AudioAnalysis | None"
) -> list[SpeechCue]:
    """Palabras dichas claramente por encima de tu nivel normal."""
    if audio is None or audio.speech_level() is None:
        return []

    salida: list[SpeechCue] = []
    for w in transcript.words:
        if len(w.text) < EMPHASIS_MIN_CHARS:
            continue
        nivel = audio.level_between(w.start, w.end)
        # La referencia es **local**: lo que importa es si esa palabra destaca
        # sobre lo que la rodea, no sobre el video entero. Quien baja la voz
        # durante una frase sigue acentuando dentro de ella.
        referencia = audio.speech_level(around=w.start)
        if nivel is None or referencia is None:
            continue
        subida = nivel - referencia
        if not EMPHASIS_DB <= subida <= EMPHASIS_MAX_DB:
            continue
        salida.append(
            SpeechCue(
                kind=CueKind.EMPHASIS,
                start=round(w.start, 3),
                end=round(w.end + 0.4, 3),
                phrase="",
                strength=round(min(1.0, 0.45 + subida / 20.0), 3),
            )
        )
    return salida


def find_retakes(transcript: "Transcript | None") -> list[SpeechCue]:
    """Momentos en los que te corriges: la toma anterior no vale.

    El tramo que se marca es **lo de antes**, no la correccion: cuando dices
    "no, perdon", lo que sobra es lo que acabas de decir mal.
    """
    if transcript is None:
        return []

    salida: list[SpeechCue] = []
    for anterior, frase in zip(transcript.segments, transcript.segments[1:]):
        texto = _normalize(frase.text).strip()
        for patron, peso in _CORRECCIONES:
            if not re.search(patron, texto):
                continue
            # Solo se retira lo justo: la cola de la frase anterior.
            inicio = max(anterior.start, anterior.end - RETAKE_MAX_SECONDS)
            if anterior.end <= inicio:
                break
            salida.append(
                SpeechCue(
                    kind=CueKind.RETAKE,
                    start=round(inicio, 3),
                    end=round(anterior.end, 3),
                    phrase=re.search(patron, texto).group(0),
                    strength=peso,
                )
            )
            break
    return salida


def _dedupe(cues: list[SpeechCue]) -> list[SpeechCue]:
    """Se queda la senal mas fuerte cuando varias caen casi en el mismo sitio."""
    cues.sort(key=lambda c: (c.start, -c.strength))
    salida: list[SpeechCue] = []
    for c in cues:
        if salida and c.kind is salida[-1].kind and c.start - salida[-1].start < 0.4:
            if c.strength > salida[-1].strength:
                salida[-1] = c
            continue
        salida.append(c)
    return salida


def find_all(
    transcript: "Transcript | None", audio: "AudioAnalysis | None" = None
) -> list[SpeechCue]:
    """Todas las senales de lo que se dice, ordenadas en el tiempo."""
    todas = (
        find_pointing(transcript)
        + find_emphasis(transcript, audio)
        + find_retakes(transcript)
        + find_waits(transcript)
        + find_skips(transcript)
    )
    todas.sort(key=lambda c: c.start)
    return todas


def cues_of(cues: list[SpeechCue], kind: CueKind) -> list[SpeechCue]:
    return [c for c in cues if c.kind is kind]
