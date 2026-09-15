"""Decide donde insertar material de apoyo y que buscar.

El problema real no es conseguir b-roll, es saber **cuando merece la pena**.
Meterlo cada X segundos es lo que hace que un video automatico se note; hay que
ponerlo donde se esta nombrando algo concreto.

Para detectarlo se puntuan las palabras con TF-IDF sobre el propio transcript:
una palabra que aparece mucho en este tramo pero poco en el resto del video es
justo lo que ese tramo esta tratando. No hace falta ningun modelo de lenguaje,
no depende del idioma, y explica su decision sola ("aqui dices 'Google'").
"""

from __future__ import annotations

import math
from collections import Counter
from dataclasses import dataclass

from ..analysis.types import Transcript, Word
from ..assets.providers import BrollProvider, search_all, tokenize
from ..assets.types import Asset, AssetBundle, AssetQuery
from .edl import EDL, BrollEffect, Rect
from .styles import BrollRules, budget

#: Duracion maxima de la ventana en la que se busca de que se esta hablando.
WINDOW_SECONDS = 6.0
#: Una pausa mas larga que esto cierra la ventana: ya se esta hablando de otra
#: cosa.
WINDOW_GAP = 1.5
#: Con menos palabras que esto la ventana no dice nada. Una de una sola palabra
#: da siempre TF-IDF maximo para esa palabra, que es como se colaban consultas
#: absurdas: una frase partida por la rejilla dejaba "informacion" sola en su
#: ventana y ganaba a "base de datos".
MIN_WORDS_IN_WINDOW = 3
#: Puntuacion minima para considerar que se esta nombrando algo concreto.
MIN_TOPIC_SCORE = 0.35
#: Cuantas palabras forman la consulta.
QUERY_WORDS = 2


@dataclass
class TopicMoment:
    """Un momento del montaje donde se nombra algo concreto."""

    start: float
    end: float
    query: str
    score: float
    context: str

    @property
    def head(self) -> str:
        """Lo concreto que se nombra ahi: la primera palabra de la consulta.

        La consulta lleva dos palabras, y no valen lo mismo. La primera es la
        que mas distingue a este tramo de los demas; la segunda acompana.
        """
        return self.query.split()[0] if self.query else ""


def _windows(transcript_words: list[Word], duration: float) -> list[tuple[float, float, list[str]]]:
    """Agrupa las palabras en ventanas siguiendo el habla, no un reloj.

    Con una rejilla fija de 6 segundos pasaban dos cosas malas: en un video
    largo la mayoria de ventanas salian vacias y estropeaban el IDF, y una
    frase que cruzaba el limite de la rejilla se partia, dejando su ultima
    palabra sola en la ventana siguiente. Una ventana de una sola palabra le da
    a esa palabra la puntuacion maxima, asi que las consultas acababan siendo
    justo los restos de las frases.

    Aqui cada ventana empieza donde empieza a hablar y se cierra al llegar al
    maximo de duracion o al encontrar una pausa.
    """
    if duration <= 0 or not transcript_words:
        return []

    salida: list[tuple[float, float, list[str]]] = []
    actual: list[Word] = []

    def cerrar() -> None:
        if len(actual) >= MIN_WORDS_IN_WINDOW:
            salida.append((
                actual[0].start,
                min(duration, actual[-1].end),
                tokenize(" ".join(w.text for w in actual)),
            ))
        actual.clear()

    for w in transcript_words:
        if actual and (
            w.start - actual[-1].end > WINDOW_GAP
            or w.end - actual[0].start > WINDOW_SECONDS
        ):
            cerrar()
        actual.append(w)
    cerrar()
    return salida


def find_topic_moments(
    edl: EDL, transcript: Transcript, *, min_score: float = MIN_TOPIC_SCORE
) -> list[TopicMoment]:
    """Localiza los momentos donde se nombra algo lo bastante distintivo."""
    # Las palabras se pasan a tiempo de montaje: es donde iran los efectos.
    en_montaje: list[Word] = []
    for w in transcript.words:
        t = edl.source_to_timeline(w.start)
        if t is None:
            continue
        en_montaje.append(Word(start=t, end=t + (w.end - w.start), text=w.text))
    en_montaje.sort(key=lambda w: w.start)

    ventanas = _windows(en_montaje, edl.duration)
    if len(ventanas) < 2:
        return []

    # Documento = ventana. Una palabra en pocas ventanas es distintiva.
    apariciones: Counter[str] = Counter()
    veces: Counter[str] = Counter()
    for _, _, palabras in ventanas:
        apariciones.update(set(palabras))
        veces.update(palabras)
    total = len(ventanas)

    momentos: list[TopicMoment] = []
    for inicio, fin, palabras in ventanas:
        if not palabras:
            continue
        frecuencias = Counter(palabras)
        puntuaciones = {
            palabra: (n / len(palabras)) * math.log(total / apariciones[palabra])
            for palabra, n in frecuencias.items()
            if apariciones[palabra] > 0
        }
        if not puntuaciones:
            continue

        # Para *elegir* las palabras se prefiere lo que el video trata, no lo
        # que solo se nombro de pasada. TF-IDF a secas premia a la palabra que
        # aparece una unica vez en todo el video, y eso no es un tema: de "la
        # base de datos guarda toda la informacion" sacaba "informacion" en vez
        # de "base de datos". Un termino al que se vuelve varias veces si es un
        # tema, y es lo que merece material de apoyo.
        mejores = sorted(
            puntuaciones.items(),
            key=lambda kv: (-kv[1] * (1.0 + math.log(veces[kv[0]])), kv[0]),
        )[:QUERY_WORDS]

        # Se normaliza contra el maximo que esa ventana podria dar (una palabra
        # suya que no salga en ninguna otra), para que el umbral signifique lo
        # mismo en una ventana de cuatro palabras que en una de diez.
        maximo = math.log(total) / len(palabras) if total > 1 else 1.0
        score = (max(puntuaciones[p] for p, _ in mejores) / maximo) if maximo else 0.0

        if score < min_score:
            continue

        momentos.append(
            TopicMoment(
                start=round(inicio, 3),
                end=round(fin, 3),
                query=" ".join(p for p, _ in mejores),
                score=round(min(1.0, score), 3),
                context=" ".join(palabras[:20]),
            )
        )

    # A igualdad de puntuacion manda el tema al que mas se vuelve: si solo cabe
    # un b-roll, mejor ilustrar lo que vertebra el video que un detalle suelto.
    momentos.sort(key=lambda m: (-m.score, -max(veces[p] for p in m.query.split())))
    return momentos


def _respects_spacing(candidato: float, puestos: list[float], min_gap: float) -> bool:
    return all(abs(candidato - otro) >= min_gap for otro in puestos)


# ---------------------------------------------------------------------------
# Que el material quepa en el hueco, y el hueco en lo que se dice
# ---------------------------------------------------------------------------

#: Lo minimo que puede durar un material para que se lea como una decision y
#: no como un parpadeo.
MIN_USEFUL_SECONDS = 1.2
#: Cuanto se busca una pausa del habla para entrar o salir. Entrar a mitad de
#: palabra es lo que hace que una insercion automatica se note.
PAUSE_SNAP = 1.1
#: Que hueco entre dos palabras cuenta como pausa.
MIN_PAUSE = 0.16
#: Altura minima del material respecto al montaje para ponerlo a pantalla
#: completa. Un clip de 480p ampliado a 1080 se ve, y se ve mal.
MIN_FULL_HEIGHT = 0.75
#: Y por debajo de esto no vale ni en ventanita.
MIN_ANY_HEIGHT = 0.35
#: Diferencia de forma que ya no se puede recortar sin perder casi todo: un
#: clip vertical dentro de un montaje apaisado.
MAX_ASPECT_MISMATCH = 0.34
#: Alto de la ventanita cuando el material no da para pantalla completa, y
#: donde se apoya: arriba a la derecha, que es donde no estan los subtitulos.
PIP_HEIGHT = 0.40
PIP_TOP = 0.07
PIP_RIGHT = 0.95
#: Ancho maximo, para que una ventanita no acabe siendo media pantalla.
PIP_MAX_WIDTH = 0.46


def pip_rect(asset: Asset, render_w: int, render_h: int) -> Rect:
    """La ventanita, con **la forma del material** y no con una fija.

    Una ventanita cuadrada para un clip vertical vuelve a recortarlo, que es
    justo lo que se queria evitar al no ponerlo a pantalla completa. Se fija el
    alto y el ancho sale de su proporcion.
    """
    forma = asset.aspect or (render_w / max(render_h, 1))
    ancho = PIP_HEIGHT * render_h * forma / max(render_w, 1)
    ancho = min(PIP_MAX_WIDTH, max(0.12, ancho))
    return Rect(
        x=round(max(0.02, PIP_RIGHT - ancho), 4),
        y=PIP_TOP,
        w=round(ancho, 4),
        h=PIP_HEIGHT,
    )


def _pauses(transcript: Transcript) -> list[float]:
    """Instantes del original en los que la voz se para un momento."""
    palabras = transcript.words
    salida = [
        round(anterior.end, 3)
        for anterior, siguiente in zip(palabras, palabras[1:])
        if siguiente.start - anterior.end >= MIN_PAUSE
    ]
    if palabras:
        salida.append(round(palabras[-1].end, 3))
    return salida


def _snap(instantes: list[float], t: float, ventana: float = PAUSE_SNAP) -> float:
    """Mueve un instante a la pausa mas cercana, si hay alguna cerca."""
    cerca = [p for p in instantes if abs(p - t) <= ventana]
    return min(cerca, key=lambda p: abs(p - t)) if cerca else t


def fit_asset(
    asset: Asset, seconds: float, mode: str, render_w: int, render_h: int
) -> tuple[str, float] | None:
    """Como entra **ese** material en el hueco, o `None` si no entra.

    Es la parte que faltaba: se decidia donde poner material mirando solo lo
    que se decia, y luego se metia lo que viniera con una duracion fija y a
    pantalla completa, fuera lo que fuese. Un clip de dos segundos en un hueco
    de cuatro se repetia a la vista; uno vertical se recortaba hasta dejar una
    rendija; uno de 480p se ampliaba al triple.

    Aqui se mira lo que **se ha conseguido** y se decide en consecuencia:
    cuanto dura de verdad, y si da para tapar la pantalla o solo para una
    ventanita.
    """
    # 1. Nunca mas de lo que el material tiene: repetirse se ve.
    if asset.duration > 0:
        seconds = min(seconds, asset.duration)
    if seconds < MIN_USEFUL_SECONDS:
        return None

    # 2. La forma y el tamano deciden si puede tapar el fotograma.
    if asset.height <= 0 or render_h <= 0:
        return mode, seconds

    alto_relativo = asset.height / render_h
    if alto_relativo < MIN_ANY_HEIGHT:
        return None

    forma_montaje = render_w / max(render_h, 1)
    desajuste = (
        abs(asset.aspect - forma_montaje) / forma_montaje if asset.aspect else 0.0
    )
    if mode == "full" and (
        alto_relativo < MIN_FULL_HEIGHT or desajuste > MAX_ASPECT_MISMATCH
    ):
        # No da para pantalla completa, pero en una ventanita se ve bien: ahi
        # ni se nota la ampliacion ni hay que recortarlo hasta deformarlo.
        return "pip", seconds
    return mode, seconds


#: Papeles en los que tapar la pantalla es justo lo que no hay que hacer. En un
#: aviso ("ojo, si no haces esto no funciona") lo que se ve es lo que hay que
#: mirar, y taparlo con una imagen de archivo es el peor momento posible.
NO_TAPAR = ("aviso",)
#: Y en los demas, cuanto se agradece ahi una imagen de apoyo. Sale del mismo
#: sitio que el recorte: donde se puede recortar mas es donde la pantalla
#: importa menos.
def _role_weight(narrative, t: float, rules) -> tuple[float, str]:
    if not narrative:
        return 1.0, ""
    from ..understand.segments import role_at

    papel = role_at(narrative, t).value
    if papel in NO_TAPAR:
        return 0.0, papel
    return min(1.3, rules.roles.factor(_CAMPO_POR_PAPEL.get(papel, "body"))), papel


_CAMPO_POR_PAPEL = {
    "intro": "intro", "paso": "step", "aviso": "warning", "consejo": "tip",
    "resumen": "recap", "cierre": "outro", "digresion": "aside", "cuerpo": "body",
}


def plan_broll(
    edl: EDL,
    transcript: Transcript | None,
    providers: list[BrollProvider],
    rules: BrollRules,
    bundle: AssetBundle,
    screen_terms: list[str] | None = None,
    narrative=None,
    pacing=None,
) -> tuple[list[BrollEffect], list[BrollEffect]]:
    """Coloca material de apoyo donde se nombra algo concreto.

    Devuelve (elegidos, reservas), igual que el planner de zooms: las reservas
    quedan disponibles para el auto-balanceador.
    """
    if not rules.enabled or transcript is None or not providers or edl.duration <= 0:
        return [], []

    momentos = find_topic_moments(edl, transcript)
    if not momentos:
        return [], []

    # Todo lo que se dice en el video (y lo que se lee en pantalla, si lo hay).
    # Sirve para descartar material que va de algo que aqui no se menciona
    # nunca: es lo que separa una foto de Palworld de una de Minecraft cuando
    # las dos estan etiquetadas como "videojuego".
    idioma = (transcript.language or "es").lower()[:2]
    vocabulario = tokenize(" ".join(w.text for w in transcript.words))
    vocabulario += tokenize(" ".join(screen_terms or ()))

    maximo = budget(rules.max_per_minute, edl.duration, rules.default_seconds * 2)
    tope_cobertura = rules.max_coverage * edl.duration

    elegidos: list[BrollEffect] = []
    reservas: list[BrollEffect] = []
    instantes: list[float] = []
    cobertura = 0.0
    cortes = edl.cut_points()
    #: ver dos veces el mismo recurso canta mas que no poner ninguno
    usados: set[str] = set()

    # Las pausas del habla, ya en tiempo de montaje: es donde se puede entrar y
    # salir sin partir una palabra.
    pausas = [
        t for t in (edl.source_to_timeline(p) for p in _pauses(transcript))
        if t is not None
    ]

    for i, momento in enumerate(momentos):
        duracion = min(rules.default_seconds, momento.end - momento.start)
        if duracion < 1.0:
            continue

        # Se entra en la pausa mas cercana: un material que aparece a mitad de
        # palabra se lee como un fallo, y el hueco entre dos frases es
        # exactamente donde un editor lo mete.
        inicio = _snap(pausas, momento.start)
        fin = inicio + duracion
        if fin > edl.duration:
            continue

        # Que parte del video es esto. Un aviso no se tapa nunca: es el momento
        # que menos se puede tapar de todo el video.
        origen = edl.timeline_to_source(inicio)
        peso_papel, papel = (
            _role_weight(narrative, origen, pacing)
            if origen is not None and pacing is not None
            else (1.0, "")
        )
        if peso_papel <= 0.0:
            continue
        if not _respects_spacing(inicio, instantes, rules.min_gap):
            continue

        consulta = AssetQuery(
            text=momento.query,
            seconds=duracion,
            orientation="portrait" if edl.render.aspect < 1 else "landscape",
            at_timeline=inicio,
            context=momento.context,
            # La cabeza es lo concreto que se nombra ahi; lo demas es contexto
            # y no basta para elegir material (ver assets/coherence.py).
            head=momento.head,
            vocabulary=vocabulario,
            # En el idioma en el que hablas, que es dato de la transcripcion.
            # A un banco hay que decirselo o responde en ingles y la regla de
            # coherencia no se puede cumplir (ver `assets/language.py`).
            language=idioma,
        )
        resultados = search_all(providers, consulta)
        # Se prefiere material que no se haya usado ya; si todo esta usado, se
        # deja pasar este momento en vez de repetir.
        frescos = [r for r in resultados if r.id not in usados]
        if not frescos:
            continue

        # Y de lo que se ha conseguido, el primero que **quepa**: la relevancia
        # ordena, pero un material que no da para el hueco no vale por muy
        # relevante que sea.
        encaje = None
        for candidato in frescos:
            encaje = fit_asset(
                candidato, duracion, rules.mode, edl.render.width, edl.render.height
            )
            if encaje is not None:
                asset = candidato
                break
        if encaje is None:
            continue
        modo, duracion_real = encaje

        # La salida tambien busca pausa, y nunca se alarga mas de lo pedido.
        fin = _snap(pausas, inicio + duracion_real, PAUSE_SNAP / 2)
        fin = min(max(fin, inicio + MIN_USEFUL_SECONDS), inicio + duracion_real + 0.4)
        if fin > edl.duration:
            fin = inicio + duracion_real
        if fin - inicio < MIN_USEFUL_SECONDS:
            continue

        # A diferencia de un zoom, un b-roll a pantalla completa NO tiene que
        # evitar los cortes: los tapa. En una guia muy recortada los cortes
        # caen cada pocos segundos, asi que exigir que no los cruce dejaria el
        # montaje sin un solo material de apoyo. En ventanita si se nota, y ahi
        # si conviene esquivarlos. Se mira el modo **real**, que lo decide el
        # material y no el estilo: un clip vertical acaba en ventanita aunque
        # el estilo pidiera pantalla completa.
        if modo != "full" and any(inicio < c < fin for c in cortes):
            continue

        usados.add(asset.id)
        bundle.add(asset)

        efecto = BrollEffect(
            id=f"broll{i:03d}",
            start=round(inicio, 3),
            end=round(fin, 3),
            asset_id=asset.id,
            mode=modo,
            rect=(
                pip_rect(asset, edl.render.width, edl.render.height)
                if modo != "full" else Rect()
            ),
            query=momento.query,
            # Lo que aporta depende de lo concreto que sea lo que se nombra y de
            # lo bien que encaje el material encontrado.
            value_score=round(
                min(1.0, (0.45 + momento.score * 0.35 + asset.relevance * 0.2) * peso_papel),
                3,
            ),
            cost_weight=0.65 if modo == "full" else 0.45,
            rationale=(
                f"material de apoyo en {inicio:.0f}s porque ahi hablas de "
                f"'{momento.query}'{f' ({papel})' if papel else ''}"
                f"{'' if modo == 'full' else ' (en ventanita: no da para mas)'}"
                f" · {asset.reason}"
            ),
        )

        # La cobertura se cuenta con lo que de verdad va a durar, no con lo
        # que se pidio: el material manda sobre el plan.
        real = fin - inicio
        cabe = cobertura + real <= tope_cobertura
        if len(elegidos) < maximo and cabe:
            elegidos.append(efecto)
            instantes.append(inicio)
            cobertura += real
        elif len(reservas) < maximo + 3:
            reservas.append(efecto)
            instantes.append(inicio)

    elegidos.sort(key=lambda e: e.start)
    reservas.sort(key=lambda e: e.start)
    return elegidos, reservas
