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
from collections import Counter

from ..analysis.types import Transcript
from ..assets.providers import tokenize
from .captions import TRAILING_STOPWORDS
from .edl import EDL, Chapter, TextCardEffect
from ..understand.segments import SegmentRole
from .styles import ChapterRules

#: Pausa que sugiere cambio de tema.
TOPIC_GAP = 1.1
#: Longitud maxima del titulo generado.
TITLE_CHARS = 52
#: Palabras que se miran para construirlo. Mas que esto divaga.
TITLE_WORDS = 9
#: Arranques que no dicen nada del capitulo. Van de mas largo a mas corto para
#: que "vamos a ver" gane a "vamos", y se aplican en cadena: "bueno, vamos a ver
#: el apartado..." tiene dos seguidos.
_ARRANQUES = re.compile(
    r"^(?:"
    r"por (?:ultimo|cierto)|lo (?:primero|siguiente) es|en este video|"
    r"siguiente punto|vamos a (?:ver|hablar de|empezar con)|vamos con|"
    r"ahora (?:vamos a|abrimos|toca)|lo que (?:vamos a )?hacemos es|"
    r"y|entonces|bueno|vale|asi que|ahora|pues|luego|despues|mira|fijate"
    r")\b[\s,]*",
    re.IGNORECASE,
)
#: Con menos palabras que esto, lo que queda ya no describe nada y se prefiere
#: titular por los terminos propios del capitulo.
MIN_TITLE_WORDS = 3
#: Cuantos terminos se usan en ese caso.
TOPIC_TITLE_WORDS = 3


def _strip_openers(texto: str) -> str:
    """Quita los arranques encadenados del principio de la frase."""
    anterior = None
    while texto and texto != anterior:
        anterior = texto
        texto = _ARRANQUES.sub("", texto, count=1).lstrip(" ,.;:-")
    return texto


def _clean_title(words) -> str:
    """Construye un titulo legible con las primeras palabras del capitulo."""
    texto = " ".join(w.text for w in words[:TITLE_WORDS]).strip()
    # Cortamos en la primera frase si la hay.
    corte = re.search(r"[.!?]", texto)
    if corte and corte.start() > 12:
        texto = texto[: corte.start()]

    texto = _strip_openers(texto).strip(" ,.;:-")
    if len(texto) > TITLE_CHARS:
        texto = texto[:TITLE_CHARS].rsplit(" ", 1)[0]

    # Cortar a las nueve palabras deja titulos que acaban en el aire ("Los
    # proyectos del apartado 2 cada"). Se quitan las palabras de funcion del
    # final, igual que en los subtitulos.
    partes = texto.split()
    while len(partes) > 2 and partes[-1].strip(".,;:").lower() in TRAILING_STOPWORDS:
        partes.pop()
    texto = " ".join(partes)
    return texto[:1].upper() + texto[1:] if texto else "Capitulo"


def _topic_title(bloque, resto) -> str:
    """Titula por los terminos propios del capitulo, no por como empieza.

    Se usa cuando quitar el arranque deja la frase en nada ("bueno, vamos a
    ver"). Es el mismo criterio que el material de apoyo: la palabra que este
    capitulo usa y los demas no es de lo que va este capitulo.
    """
    mias = Counter(tokenize(" ".join(w.text for w in bloque)))
    if not mias:
        return ""
    otras = Counter(tokenize(" ".join(w.text for b in resto for w in b)))
    puntuadas = sorted(
        mias.items(),
        key=lambda kv: (-(kv[1] / (1 + otras.get(kv[0], 0))), kv[0]),
    )
    elegidas = [p for p, _ in puntuadas[:TOPIC_TITLE_WORDS]]
    if not elegidas:
        return ""
    texto = " ".join(elegidas)
    return texto[:1].upper() + texto[1:]


def _titles_for(bloques) -> list[str]:
    """Titulo de cada capitulo, con reserva por terminos propios."""
    titulos: list[str] = []
    for i, bloque in enumerate(bloques):
        texto = _clean_title(bloque)
        if len(texto.split()) < MIN_TITLE_WORDS:
            resto = [b for j, b in enumerate(bloques) if j != i]
            texto = _topic_title(bloque, resto) or texto
        titulos.append(texto)
    return titulos


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


#: Tope de capitulos, sea cual sea la duracion. Por encima de esto la lista
#: deja de ayudar a orientarse, que es para lo unico que sirve.
MAX_CHAPTERS = 8


#: Papeles que abren una parte nueva del video. Un aviso o un consejo pasan
#: *dentro* de un paso, no lo sustituyen, asi que no abren capitulo.
_ABREN_CAPITULO = frozenset({
    SegmentRole.INTRO, SegmentRole.STEP, SegmentRole.RECAP, SegmentRole.OUTRO,
})


def _chapter_cuts_from_narrative(edl: EDL, narrative, minimo: float) -> list[float]:
    """Instantes de montaje donde empieza una parte nueva, segun lo que se dice.

    Es mejor senal que la pausa: una persona hace pausas largas por muchos
    motivos (piensa, bebe agua, se corta), pero solo dice "ahora vamos a" o "lo
    siguiente es" cuando de verdad cambia de asunto.
    """
    cortes: list[float] = []
    ultimo = 0.0
    for tramo in narrative:
        if tramo.role not in _ABREN_CAPITULO or tramo.start <= 0:
            continue
        t = edl.source_to_timeline(tramo.start)
        if t is None or t - ultimo < minimo or edl.duration - t < minimo:
            continue
        cortes.append(round(t, 3))
        ultimo = t
    return cortes


def plan_chapters(
    edl: EDL, transcript: Transcript, rules: ChapterRules, narrative=None
) -> list[Chapter]:
    """Divide el montaje en capitulos.

    Con `narrative` los capitulos siguen **lo que se dice** ("ahora vamos a...",
    "lo siguiente es..."), que es cuando de verdad cambia el asunto. Sin ella se
    cae a las pausas largas, que aciertan bastante pero no distinguen un cambio
    de tema de un trago de agua.
    """
    if not rules.enabled or not transcript.words:
        return []

    palabras = _map_words(edl, transcript)
    if not palabras:
        return []

    # La duracion minima de un capitulo no puede ser un numero fijo: con 45
    # segundos, una guia de 17 minutos sale con **veinte** capitulos, uno cada
    # 51 segundos. Eso no son capitulos, es una lista de frases, y ademas
    # planta veinte rotulos en pantalla. Un capitulo tiene que ser una parte
    # reconocible del video, asi que la duracion minima crece con el.
    minimo = max(rules.min_seconds, edl.duration / MAX_CHAPTERS)

    # Un video mas corto que dos capitulos minimos no necesita capitulos.
    if edl.duration < minimo * 2:
        return []

    # Primero se deciden los cortes; los titulos despues, cuando ya se sabe lo
    # que dice cada capitulo **y lo que dicen los demas**, que es lo que permite
    # titular por lo propio de cada uno.
    marcados = set(_chapter_cuts_from_narrative(edl, narrative or [], minimo))

    inicios: list[float] = []
    bloques: list[list[_Mapped]] = []
    inicio_tl = 0.0
    bloque: list[_Mapped] = []

    for anterior, siguiente in zip(palabras, palabras[1:]):
        bloque.append(anterior)
        # La pausa se mide en el original: ahi es donde la persona respiro.
        hueco = siguiente.source_start - anterior.source_end
        # La duracion se mide en el montaje: es lo que dura en pantalla.
        largo_suficiente = (anterior.tl_start - inicio_tl) >= minimo
        queda_sitio = (edl.duration - siguiente.tl_start) >= minimo

        # Si la estructura ya dijo que aqui empieza una parte nueva, no hace
        # falta que ademas haya una pausa larga: decir "ahora vamos a" es una
        # senal mas fuerte que respirar hondo.
        abre_parte = any(abs(siguiente.tl_start - c) < 0.35 for c in marcados)
        pausa_de_tema = hueco >= TOPIC_GAP

        if (abre_parte or pausa_de_tema) and largo_suficiente and queda_sitio:
            inicios.append(round(inicio_tl, 3))
            bloques.append(bloque)
            inicio_tl = round(siguiente.tl_start, 3)
            bloque = []

    bloque.append(palabras[-1])
    inicios.append(round(inicio_tl, 3))
    bloques.append(bloque)

    titulos = _titles_for(bloques)
    # El primer capitulo siempre arranca en cero, aunque la voz entre despues.
    inicios[0] = 0.0
    return [
        Chapter(start=inicio, title=titulo)
        for inicio, titulo in zip(inicios, titulos)
    ]


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
