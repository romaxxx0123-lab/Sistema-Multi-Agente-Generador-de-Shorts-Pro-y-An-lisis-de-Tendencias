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
from ..understand.topics import find_boundaries, label
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
    """Construye un titulo legible con las primeras palabras del capitulo.

    Solo con las de **su primera frase**: pegar el final de una frase con el
    principio de la siguiente daba titulos que no son de nadie ("Como se
    configura esto ahora guardamos").
    """
    primera = getattr(words[0], "frase", None) if words else None
    if primera is not None:
        words = [w for w in words if getattr(w, "frase", primera) == primera]
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


#: Palabras del arranque de un tramo que cuentan como "lo que anuncias". Una
#: frase hablada de una guia ronda las diez o doce.
OPENING_WORDS = 12


def _topic_title(bloque, resto, modelo=None) -> str:
    """Titula por los terminos propios del capitulo, no por como empieza.

    Se usa cuando quitar el arranque deja la frase en nada ("bueno, vamos a
    ver"). El criterio es el mismo que separa los temas: la palabra que este
    capitulo usa y los demas no es de lo que va este capitulo.

    Y **donde** se dice cuenta: un tema se anuncia al empezar y se detalla
    despues, asi que lo que se dice en la primera frase pesa mas que lo que se
    repite luego (ver `OPENING_BOOST` en `understand/topics.py`).
    """
    from ..understand.namer import Section, name_section

    seccion = Section(
        text=" ".join(w.text for w in bloque),
        others=" ".join(w.text for b in resto for w in b),
        opening=" ".join(w.text for w in bloque[:OPENING_WORDS]),
    )
    nombre, _ = name_section(seccion, modelo)
    return nombre


def _titles_for(bloques) -> list[str]:
    """Titulo de cada capitulo, con reserva por terminos propios.

    Y sin repetirse: dos capitulos con el mismo nombre no orientan a nadie, que
    es para lo unico que sirve una lista de capitulos. Cuando el titulo por
    frase sale repetido se prueba con los terminos propios del tramo, que por
    definicion son los que lo distinguen de los demas.
    """
    titulos: list[str] = []
    vistos: set[str] = set()
    for i, bloque in enumerate(bloques):
        resto = [b for j, b in enumerate(bloques) if j != i]
        texto = _clean_title(bloque)
        if len(texto.split()) < MIN_TITLE_WORDS or texto.lower() in vistos:
            propio = _topic_title(bloque, resto)
            if propio and propio.lower() not in vistos:
                texto = propio
        if texto.lower() in vistos:
            # Ni por frase ni por terminos: se numera antes que repetir.
            texto = f"{texto} ({i + 1})"
        vistos.add(texto.lower())
        titulos.append(texto)
    return titulos


class _Mapped:
    """Una palabra con sus dos tiempos a la vez.

    Hace falta llevar los dos: las pausas que delatan un cambio de tema solo
    existen en el ORIGINAL (el corte se las come), pero la longitud minima de un
    capitulo hay que medirla en el MONTAJE, que es lo que vera el espectador.
    """

    __slots__ = ("source_start", "source_end", "tl_start", "text", "frase")

    def __init__(
        self,
        source_start: float,
        source_end: float,
        tl_start: float,
        text: str,
        frase: int = 0,
    ) -> None:
        self.frase = frase
        self.source_start = source_start
        self.source_end = source_end
        self.tl_start = tl_start
        self.text = text


def _map_words(edl: EDL, transcript: Transcript) -> list[_Mapped]:
    """Palabras que sobrevivieron al corte, con tiempo de origen y de montaje."""
    out: list[_Mapped] = []
    for i, frase in enumerate(transcript.segments):
        for w in frase.words:
            t = edl.source_to_timeline(w.start)
            if t is None:
                continue
            out.append(_Mapped(w.start, w.end, t, w.text, i))
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
    edl: EDL,
    transcript: Transcript,
    rules: ChapterRules,
    narrative=None,
    modelo=None,
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

    # Y donde cambia el **vocabulario**, que es lo que de verdad dice que se ha
    # pasado a otro asunto. Va en tiempo del original, como la narrativa.
    temas = 0
    for frontera in find_boundaries(transcript, min_seconds=minimo):
        t = edl.source_to_timeline(frontera.time)
        if t is not None and minimo <= t <= edl.duration - minimo:
            marcados.add(round(t, 3))
            temas += 1

    # Con senal de contenido, las pausas dejan de abrir capitulos. Se midio por
    # que: en una guia sintetica de tres temas sin ninguna formula de enlace,
    # las pausas largas no encontraron **ninguno** de los tres cambios y se
    # inventaron seis; y en un video de un solo tema se inventaron quince. Una
    # pausa dice que has respirado, no que hayas cambiado de asunto. Cuando no
    # hay ninguna senal de contenido (sin transcripcion util, video muy corto)
    # se siguen usando, porque es mejor eso que nada.
    solo_contenido = bool(marcados)

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
        pausa_de_tema = hueco >= TOPIC_GAP and not solo_contenido

        if (abre_parte or pausa_de_tema) and largo_suficiente and queda_sitio:
            inicios.append(round(inicio_tl, 3))
            bloques.append(bloque)
            inicio_tl = round(siguiente.tl_start, 3)
            bloque = []

    bloque.append(palabras[-1])
    inicios.append(round(inicio_tl, 3))
    bloques.append(bloque)

    titulos = _titles_for(bloques)
    # Y el nombre corto de cada uno, que es lo que va al cartel de pantalla.
    temas = [
        _topic_title(bloque, [b for j, b in enumerate(bloques) if j != i], modelo)
        for i, bloque in enumerate(bloques)
    ]
    # El primer capitulo siempre arranca en cero, aunque la voz entre despues.
    inicios[0] = 0.0
    return [
        Chapter(start=inicio, title=titulo, topic=tema)
        for inicio, titulo, tema in zip(inicios, titulos, temas)
    ]


#: Palabras como mucho en un cartel de pantalla. Un cartel se lee de un vistazo
#: o no se lee: con la frase entera del capitulo --- "Hola en este video
#: montamos la base de cero" --- no da tiempo, y encima tapa el video. Lo que se
#: quiere ver ahi es de que va esto: "Expediciones".
#:
#: Y **una**, no tres. Varios terminos distintivos seguidos no son un nombre,
#: son una lista: medido sobre una guia de Palworld, el capitulo de las
#: expediciones se titulaba "Rutas tarda afinidad" y el de capturar, "Capturar
#: sube probabilidad". Con uno quedan "Rutas" y "Capturar", que es lo que se
#: espera de un cartel de seccion: de que va esto, no un resumen.
#:
#: (Se sigue tirando primero de los verbos, asi que el que queda es el nombre
#: cuando hay alguno.)
CARD_MAX_WORDS = 1


def card_text(chapter: Chapter) -> str:
    """Lo que dice el cartel de un capitulo: su nombre corto.

    Se quitan las acciones y se deja lo que **nombra** algo: un cartel dice
    donde estas, y para eso valen los nombres, no los verbos. Si al quitarlas no
    queda nada se devuelve lo que habia, porque hay secciones que de verdad van
    de hacer algo.
    """
    from .labels import _solo_nombres

    texto = (chapter.topic or "").strip()
    if not texto:
        return ""
    palabras = _solo_nombres(texto).split()[:CARD_MAX_WORDS]
    return " ".join(palabras)


def chapter_cards(chapters: list[Chapter], rules: ChapterRules) -> list[TextCardEffect]:
    """Carteles en pantalla al empezar cada capitulo.

    Solo los que tienen un nombre corto. Un capitulo del que no se saca un
    nombre claro sigue estando en la lista de YouTube --- ahi una frase se lee
    bien --- pero no pone cartel: mas vale ninguno que uno que no dice nada.
    """
    if not rules.show_cards:
        return []
    salida = []
    for i, c in enumerate(chapters):
        texto = card_text(c)
        if not texto:
            continue
        salida.append(TextCardEffect(
            id=f"card{i:03d}",
            start=round(c.start, 3),
            end=round(c.start + rules.card_seconds, 3),
            text=texto,
            value_score=0.6,
            cost_weight=0.35,
            rationale=f'cartel "{texto}" en {c.timestamp()}: de eso va el capitulo',
        ))
    return salida
