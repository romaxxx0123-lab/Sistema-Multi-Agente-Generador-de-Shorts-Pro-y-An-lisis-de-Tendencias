"""Segmenta el montaje en capitulos a partir de lo que se dice.

En una guia de 20 minutos los capitulos valen doble: sirven de rotulo en pantalla
y se exportan tal cual a la descripcion de YouTube.

La segmentacion se apoya en las pausas largas del habla, que en material
explicativo casi siempre coinciden con el cambio de tema ("...y ya esta. Ahora
vamos a ver..."). No pretende ser un modelo de temas: pretende acertar donde la
persona respira hondo antes de cambiar de asunto.
"""

from __future__ import annotations

import re

from ..analysis.types import Transcript
from .edl import EDL, Chapter, TextCardEffect
from .styles import ChapterRules

#: Pausa que sugiere cambio de tema.
TOPIC_GAP = 1.1
#: Longitud maxima del titulo generado.
TITLE_CHARS = 52
#: Palabras que se miran para construirlo. Mas que esto divaga.
TITLE_WORDS = 9
#: Palabras que no aportan nada como inicio de titulo.
_ARRANQUES = re.compile(
    r"^(?:y|entonces|bueno|vale|asi que|ahora|pues|luego|despues)\s+", re.IGNORECASE
)


def _clean_title(words) -> str:
    """Construye un titulo legible con las primeras palabras del capitulo."""
    texto = " ".join(w.text for w in words[:TITLE_WORDS]).strip()
    # Cortamos en la primera frase si la hay.
    corte = re.search(r"[.!?]", texto)
    if corte and corte.start() > 12:
        texto = texto[: corte.start()]

    texto = _ARRANQUES.sub("", texto).strip(" ,.;:-")
    if len(texto) > TITLE_CHARS:
        texto = texto[:TITLE_CHARS].rsplit(" ", 1)[0] + "..."
    return texto[:1].upper() + texto[1:] if texto else "Capitulo"


class _Mapped:
    """Una palabra con sus dos tiempos a la vez.

    Hace falta llevar los dos: las pausas que delatan un cambio de tema solo
    existen en el ORIGINAL (el corte se las come), pero la longitud minima de un
    capitulo hay que medirla en el MONTAJE, que es lo que vera el espectador.
    """

    __slots__ = ("source_start", "source_end", "tl_start", "text")

    def __init__(self, source_start: float, source_end: float, tl_start: float, text: str) -> None:
        self.source_start = source_start
        self.source_end = source_end
        self.tl_start = tl_start
        self.text = text


def _map_words(edl: EDL, transcript: Transcript) -> list[_Mapped]:
    """Palabras que sobrevivieron al corte, con tiempo de origen y de montaje."""
    out: list[_Mapped] = []
    for w in transcript.words:
        t = edl.source_to_timeline(w.start)
        if t is None:
            continue
        out.append(_Mapped(w.start, w.end, t, w.text))
    out.sort(key=lambda m: m.tl_start)
    return out


def plan_chapters(edl: EDL, transcript: Transcript, rules: ChapterRules) -> list[Chapter]:
    """Divide el montaje en capitulos."""
    if not rules.enabled or not transcript.words:
        return []

    palabras = _map_words(edl, transcript)
    if not palabras:
        return []
    # Un video mas corto que dos capitulos minimos no necesita capitulos.
    if edl.duration < rules.min_seconds * 2:
        return []

    capitulos: list[Chapter] = []
    inicio_tl = 0.0
    bloque: list[_Mapped] = []

    for anterior, siguiente in zip(palabras, palabras[1:]):
        bloque.append(anterior)
        # La pausa se mide en el original: ahi es donde la persona respiro.
        hueco = siguiente.source_start - anterior.source_end
        # La duracion se mide en el montaje: es lo que dura en pantalla.
        largo_suficiente = (anterior.tl_start - inicio_tl) >= rules.min_seconds
        queda_sitio = (edl.duration - siguiente.tl_start) >= rules.min_seconds

        if hueco >= TOPIC_GAP and largo_suficiente and queda_sitio:
            capitulos.append(
                Chapter(start=round(inicio_tl, 3), title=_clean_title(bloque))
            )
            inicio_tl = round(siguiente.tl_start, 3)
            bloque = []

    bloque.append(palabras[-1])
    if bloque:
        capitulos.append(Chapter(start=round(inicio_tl, 3), title=_clean_title(bloque)))

    # El primer capitulo siempre arranca en cero, aunque la voz entre despues.
    if capitulos:
        capitulos[0] = Chapter(start=0.0, title=capitulos[0].title)
    return capitulos


def chapter_cards(chapters: list[Chapter], rules: ChapterRules) -> list[TextCardEffect]:
    """Rotulos en pantalla al empezar cada capitulo."""
    if not rules.show_cards:
        return []
    return [
        TextCardEffect(
            id=f"card{i:03d}",
            start=round(c.start, 3),
            end=round(c.start + rules.card_seconds, 3),
            text=c.title,
            value_score=0.6,
            cost_weight=0.35,
            rationale=f"rotulo de capitulo en {c.timestamp()}",
        )
        for i, c in enumerate(chapters)
    ]
