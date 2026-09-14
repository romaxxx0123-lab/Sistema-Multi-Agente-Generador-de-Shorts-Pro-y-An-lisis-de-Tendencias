"""Agrupa las palabras transcritas en lineas de subtitulo.

Tres reglas separan un subtitulo usable de un volcado de texto:

- **Partir por las pausas del habla**, no solo por numero de caracteres. Cortar
  donde la persona respira hace que el subtitulo siga el ritmo de lo que dice.

- **Distinguir los cortes duros de los blandos.** Un corte entre dos frases o
  entre dos planos si obliga a cerrar la linea. Pero el corte que crea el propio
  montaje al quitar un silencio o una muletilla **dentro de una misma frase** no:
  ahi la voz sigue diciendo lo mismo, y cerrar la linea parte la frase en
  pedazos sueltos. Quitar "este" de "hola en este video" no debe producir
  "hola en" seguido de "video vamos a...", que es exactamente lo que pasaba.

- **No terminar una linea con una palabra de funcion.** Cortar despues de "de",
  "el" o "que" se lee mal; esas palabras se empujan a la linea siguiente.

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

#: Palabras con las que no se debe cerrar una linea: van pegadas a la siguiente.
#: Son articulos, preposiciones y conjunciones, en espanol e ingles.
TRAILING_STOPWORDS = frozenset(
    {
        "el", "la", "los", "las", "un", "una", "unos", "unas", "lo", "al", "del",
        "de", "en", "con", "por", "para", "sin", "sobre", "entre", "hacia",
        "y", "o", "u", "e", "que", "se", "su", "sus", "mi", "tu", "a",
        "the", "a", "an", "of", "in", "on", "to", "for", "and", "or", "with",
    }
)
#: Una linea no deberia quedarse con menos palabras que esto si se puede evitar.
MIN_WORDS_PER_LINE = 2


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


def hard_cuts(edl: EDL, transcript: Transcript) -> list[float]:
    """Cortes que obligan a cerrar la linea de subtitulo.

    Un corte es **blando** si las palabras que tiene justo antes y justo despues
    pertenecen a la misma frase del transcript: lo creo el propio montaje al
    quitar un silencio o una muletilla, la voz no se ha interrumpido, y mantener
    la linea entera se lee mucho mejor que trocearla.

    Cualquier otro corte es **duro**: cambio de frase o cambio de plano.
    """
    # A cada palabra se le anota a que frase pertenece, en tiempo de montaje.
    anotadas: list[tuple[float, float, int]] = []
    for indice, segmento in enumerate(transcript.segments):
        for w in segmento.words:
            inicio = edl.source_to_timeline(w.start)
            if inicio is None:
                continue
            fin = edl.source_to_timeline(max(w.start, w.end - _EPS))
            anotadas.append((inicio, fin if fin is not None else inicio, indice))
    anotadas.sort()

    duros: list[float] = []
    for corte in edl.cut_points():
        antes = [a for a in anotadas if a[1] <= corte + _EPS]
        despues = [a for a in anotadas if a[0] >= corte - _EPS]
        if not antes or not despues:
            duros.append(corte)
            continue
        # Misma frase a los dos lados => corte blando.
        if antes[-1][2] != despues[0][2]:
            duros.append(corte)
    return duros


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
    return _rebalance_trailing(lineas)


def _rebalance_trailing(lines: list[list[Word]]) -> list[list[Word]]:
    """Empuja a la linea siguiente las palabras de funcion que quedan al final."""
    for i in range(len(lines) - 1):
        actual = lines[i]
        while (
            len(actual) > MIN_WORDS_PER_LINE
            and actual[-1].text.strip(".,;:!?").lower() in TRAILING_STOPWORDS
        ):
            lines[i + 1].insert(0, actual.pop())
    return lines


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
    # Solo los cortes duros cierran linea; los que creo el propio montaje dentro
    # de una frase se cruzan sin problema.
    cortes = hard_cuts(edl, transcript)

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
