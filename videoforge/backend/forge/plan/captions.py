"""Agrupa las palabras transcritas en lineas de subtitulo.

Dos reglas que separan un subtitulo usable de un volcado de texto:

- **Nunca cruzar un corte.** Una linea que sigue en pantalla despues de un corte
  delata el montaje y se lee mal.
- **Partir por las pausas del habla**, no solo por numero de caracteres. Cortar
  donde la persona respira hace que el subtitulo siga el ritmo de lo que dice.

Los tiempos de salida ya estan en la linea de tiempo montada, no en el original.
"""

from __future__ import annotations

from ..analysis.types import Transcript, Word
from .edl import EDL, CaptionEffect
from .styles import CaptionRules

#: Valor base de un subtitulo: alto, porque sostiene la retencion y la
#: accesibilidad. El coste visual es moderado y constante.
CAPTION_VALUE = 0.85
CAPTION_COST = 0.30
#: Margen para mapear el final de una palabra sin caerse al clip siguiente.
_EPS = 1e-3


def _map_word(edl: EDL, word: Word) -> Word | None:
    """Pasa una palabra del tiempo del original al del montaje."""
    inicio = edl.source_to_timeline(word.start)
    if inicio is None:
        return None
    fin = edl.source_to_timeline(max(word.start, word.end - _EPS))
    if fin is None or fin <= inicio:
        fin = inicio + (word.end - word.start)
    return Word(
        start=round(inicio, 3),
        end=round(fin, 3),
        text=word.text,
        probability=word.probability,
    )


def _crosses_cut(cuts: list[float], a: float, b: float) -> bool:
    return any(a < c < b for c in cuts)


def group_words(
    words: list[Word], rules: CaptionRules, cuts: list[float]
) -> list[list[Word]]:
    """Parte una lista de palabras (ya en tiempo de montaje) en lineas."""
    lineas: list[list[Word]] = []
    actual: list[Word] = []

    def cerrar() -> None:
        if actual:
            lineas.append(list(actual))
            actual.clear()

    for w in words:
        if not actual:
            actual.append(w)
            continue

        anterior = actual[-1]
        texto = " ".join(x.text for x in actual)
        hueco = w.start - anterior.end
        duracion = w.end - actual[0].start

        if (
            len(actual) >= rules.max_words
            or len(texto) + 1 + len(w.text) > rules.max_chars
            or duracion > rules.max_duration
            or hueco > rules.split_gap
            or _crosses_cut(cuts, anterior.end, w.start)
        ):
            cerrar()
        actual.append(w)

    cerrar()
    return lineas


def plan_captions(
    edl: EDL, transcript: Transcript, rules: CaptionRules
) -> list[CaptionEffect]:
    """Genera los subtitulos del montaje."""
    if not rules.enabled or not transcript.words:
        return []

    mapeadas = [m for w in transcript.words if (m := _map_word(edl, w))]
    if not mapeadas:
        return []

    mapeadas.sort(key=lambda w: w.start)
    cortes = edl.cut_points()

    efectos: list[CaptionEffect] = []
    for i, linea in enumerate(group_words(mapeadas, rules, cortes)):
        texto = " ".join(w.text for w in linea)
        efectos.append(
            CaptionEffect(
                id=f"cap{i:04d}",
                start=linea[0].start,
                end=linea[-1].end,
                words=linea,
                style=rules.style,
                position=rules.position,
                value_score=CAPTION_VALUE,
                cost_weight=CAPTION_COST,
                rationale=f'subtitulo: "{texto[:60]}"',
            )
        )
    return efectos


def reading_speed_wpm(captions: list[CaptionEffect]) -> float:
    """Velocidad media de lectura exigida, en palabras por minuto.

    Por encima de ~250 el espectador no llega a leer; es una de las metricas
    del motor de saturacion.
    """
    total_palabras = sum(len(c.words) for c in captions)
    total_segundos = sum(c.duration for c in captions)
    if total_segundos <= 0:
        return 0.0
    return total_palabras / total_segundos * 60.0
