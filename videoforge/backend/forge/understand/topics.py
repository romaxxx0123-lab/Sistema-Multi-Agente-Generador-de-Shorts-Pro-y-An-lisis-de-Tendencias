"""Donde cambia el tema, mirando **de que** se habla y no como se dice.

Los capitulos salian de dos senales: las formulas de enlace ("ahora vamos a") y
las **pausas largas**. La primera es buena y la segunda es un apano, porque en
una guia de veinte minutos se respira hondo constantemente: para pensar, para
beber agua, mientras el ordenador trabaja. Una pausa no es un cambio de tema, y
al reves, quien no anuncia nada cambia de tema sin dejar ninguna marca.

Aqui la senal es otra, y no hace falta ningun modelo para verla: **el
vocabulario**. Mientras hablas de instalar los drivers dices "driver", "tarjeta",
"version", "instalar"; cuando pasas a configurar el microfono esas palabras
desaparecen y aparecen otras. Comparando el vocabulario de dos ventanas
consecutivas sale una curva de cohesion, y los **valles** de esa curva son los
sitios donde el tema cambia. Es la idea de TextTiling (Hearst, 1997), que es de
antes de las redes neuronales y sigue funcionando porque mide algo real.

Dos detalles que hacen que esto sirva en un montaje y no solo en un papel:

- la frontera se **encaja en la pausa mas cercana**. El vocabulario dice *que*
  ahi cambia el tema; la pausa dice *donde* cortar sin partir una frase. Es lo
  que hace un editor: corta en la respiracion mas cercana al cambio.
- de cada tramo se sacan sus **terminos propios** -- los que usa el y no usan
  los demas -- que es lo que permite titularlo por su asunto en vez de por como
  empieza la primera frase.
"""

from __future__ import annotations

import math
from collections import Counter
from dataclasses import dataclass

from .meaning import stem
from .text import normalize

#: Palabras que aparecen en cualquier tramo y por tanto no distinguen ninguno.
#: Sin una lista asi, la cohesion mide sobre todo "cuanto se habla".
STOPWORDS = frozenset(
    """
    el la los las un una unos unas de del al lo y o u que se su sus mi tu
    en con por para a ante bajo desde hasta hacia sobre tras entre sin segun
    es son era eran ser soy eres somos sois estar esta estan estoy estamos
    hay ha han he has hemos habeis habia habian hacer hace hago haces hacemos
    este esta esto estos estas ese esa eso esos esas aquel aquella aquello
    aqui ahi alli ahora luego despues antes siempre nunca tambien tampoco
    muy mas menos mucho mucha muchos muchas poco poca pocos pocas todo toda
    todos todas algo alguien nada nadie cada otro otra otros otras mismo misma
    si no ni pero aunque porque como cuando donde cual quien cuanto cuanta
    yo tu el ella nosotros vosotros ellos ellas me te le nos os les lo la
    ya pues bueno vale entonces asi bien mal solo tan tanto vez veces
    va van vamos voy vas ir puede pueden puedo puedes podemos
    ver veis vemos veo mira mirad dice decir digo dices da dar doy das
    queda quedan tiene tienen tengo tienes tenemos
    """.split()
)

#: Palabras por ventana de comparacion. Una ventana corta reacciona a
#: cualquier frase suelta; una larga se come los cambios de tema cortos. En
#: material hablado, medio centenar de palabras es algo asi como veinte
#: segundos, que es la unidad a la que se cambia de asunto.
WINDOW_WORDS = 50
#: Y nunca menos de esto, que por debajo cualquier frase suelta hace un valle.
MIN_WINDOW = 18
#: Cuanto avanza la ventana. La mitad, para que cada frontera se mire dos veces.
STEP_WORDS = 25
#: Suavizado de la curva: cuantas medidas se promedian a cada lado.
SMOOTH = 1
#: Un valle cuenta como cambio de tema si es mas profundo que la media de los
#: valles menos una desviacion y pico. Ese criterio relativo es el de
#: TextTiling y se adapta solo a como hable cada uno.
DEPTH_FACTOR = 1.2
#: Pero **solo** relativo no vale, y esto se vio midiendo: un video de un solo
#: tema siempre tiene un valle que es el mas profundo de los suyos, asi que el
#: criterio relativo le fabricaba un capitulo igual. La caida tiene que ser
#: ademas grande de verdad. Medido sobre dos guias sinteticas, los valles de
#: los cambios reales caen en 0,33 y 0,16, y el ruido de un video monotematico
#: no pasa de 0,10; el listo esta en medio, donde el vocabulario se renueva de
#: verdad en vez de variar un poco.
MIN_DEPTH = 0.12
#: Lo mas lejos que se busca una pausa para encajar ahi el corte.
SNAP_SECONDS = 3.0


@dataclass(frozen=True)
class Boundary:
    """Un sitio donde cambia el tema, y cuanto se nota."""

    time: float
    depth: float
    #: lo que deja de decirse y lo que empieza a decirse, para explicarlo
    before: tuple[str, ...] = ()
    after: tuple[str, ...] = ()

    @property
    def rationale(self) -> str:
        if self.before and self.after:
            return (
                f'cambia el tema: se deja de hablar de "{", ".join(self.before)}"'
                f' y se pasa a "{", ".join(self.after)}"'
            )
        return "cambia el vocabulario"


def content_stems(texto: str) -> list[str]:
    """Las raices de las palabras que dicen algo, en orden."""
    return [
        stem(p)
        for p in normalize(texto).split()
        if len(p) > 2 and p not in STOPWORDS
    ]


def _cosine(a: Counter, b: Counter) -> float:
    if not a or not b:
        return 0.0
    comunes = set(a) & set(b)
    if not comunes:
        return 0.0
    producto = sum(a[t] * b[t] for t in comunes)
    na = math.sqrt(sum(v * v for v in a.values()))
    nb = math.sqrt(sum(v * v for v in b.values()))
    return producto / (na * nb) if na and nb else 0.0


def cohesion(
    stems: list[str], *, window: int = WINDOW_WORDS, step: int = STEP_WORDS
) -> list[tuple[int, float]]:
    """Cuanto se parece el vocabulario a cada lado de cada punto.

    Devuelve `(indice de palabra, parecido)`. Bajo = ahi se habla de otra cosa.
    """
    if len(stems) < window * 2:
        return []
    salida: list[tuple[int, float]] = []
    for corte in range(window, len(stems) - window + 1, step):
        izquierda = Counter(stems[corte - window : corte])
        derecha = Counter(stems[corte : corte + window])
        salida.append((corte, _cosine(izquierda, derecha)))
    return salida


def _smooth(valores: list[float], radio: int = SMOOTH) -> list[float]:
    if radio <= 0:
        return list(valores)
    salida = []
    for i in range(len(valores)):
        trozo = valores[max(0, i - radio) : i + radio + 1]
        salida.append(sum(trozo) / len(trozo))
    return salida


def _depths(curva: list[float]) -> list[tuple[int, float]]:
    """Profundidad de cada valle: cuanto baja respecto a los picos de al lado.

    Lo que importa no es que la cohesion sea baja, sino que **caiga**. Un video
    con vocabulario pobre tiene la curva baja entera y no por eso cambia de
    tema cada dos frases.
    """
    salida: list[tuple[int, float]] = []
    for i in range(1, len(curva) - 1):
        if curva[i] > curva[i - 1] or curva[i] > curva[i + 1]:
            continue
        izq = curva[i]
        j = i
        while j > 0 and curva[j - 1] >= curva[j]:
            j -= 1
            izq = curva[j]
        der = curva[i]
        k = i
        while k < len(curva) - 1 and curva[k + 1] >= curva[k]:
            k += 1
            der = curva[k]
        salida.append((i, (izq - curva[i]) + (der - curva[i])))
    return salida


def topic_terms(propios: list[str], ajenos: list[str], n: int = 3) -> tuple[str, ...]:
    """Los terminos que este tramo usa y los demas no.

    Es lo que responde a "¿de que va esto?" sin ningun modelo: la palabra que
    solo aparece aqui es el asunto de aqui.
    """
    mios = Counter(propios)
    if not mios:
        return ()
    otros = Counter(ajenos)
    puntuados = sorted(
        mios.items(),
        key=lambda kv: (-(kv[1] / (1 + otros.get(kv[0], 0))), -kv[1], kv[0]),
    )
    return tuple(t for t, _ in puntuados[:n])


def _adaptive_window(total: int) -> int:
    """Ventana de comparacion segun lo que dure el video.

    Fija no sirve: cincuenta palabras de contenido son media guia de tres
    minutos y un suspiro de una de veinte. La ventana tiene que ser lo bastante
    corta para que quepan varias en cada tema.
    """
    return max(MIN_WINDOW, min(WINDOW_WORDS, total // 6))


def _refine(
    stems: list[str], inicios: list[int], centro: int, window: int
) -> int:
    """Afina la frontera hasta el **principio de frase** que mejor parte el tema.

    La ventana da la zona, no el punto: con un paso de veinte palabras, el valle
    cae donde cae. Y un capitulo no puede empezar en mitad de una frase. Asi que
    entre los comienzos de frase de esa zona se elige el que deja el vocabulario
    mas distinto a un lado y a otro, que es exactamente la definicion de "aqui
    cambia el tema".
    """
    candidatos = [
        i for i in inicios if abs(i - centro) <= window and window <= i <= len(stems) - window
    ]
    if not candidatos:
        return centro
    def parecido(i: int) -> float:
        return _cosine(Counter(stems[i - window : i]), Counter(stems[i : i + window]))
    return min(candidatos, key=lambda i: (parecido(i), abs(i - centro)))


def find_boundaries(
    transcript,
    *,
    min_seconds: float = 0.0,
    snap: float = SNAP_SECONDS,
    depth_factor: float = DEPTH_FACTOR,
) -> list[Boundary]:
    """Los sitios donde cambia el tema, en tiempo del original.

    La frontera se devuelve ya afinada al principio de frase que mejor separa
    los dos vocabularios, que es donde se puede cortar sin partir nada.
    """
    if transcript is None or not getattr(transcript, "segments", None):
        return []

    utiles: list = []
    inicios: list[int] = []
    #: Donde empieza de verdad la frase que abre en cada indice. No es lo mismo
    #: que la primera palabra util: "EL microfono que uso..." empieza en "el",
    #: y un capitulo que arranca en "microfono" se ve empezado a medias.
    arranque: dict[int, float] = {}
    for frase in transcript.segments:
        if not frase.words:
            continue
        primera = True
        for w in frase.words:
            limpio = normalize(w.text).strip()
            if not limpio or len(limpio) <= 2 or limpio in STOPWORDS:
                continue
            if primera:
                inicios.append(len(utiles))
                arranque[len(utiles)] = frase.words[0].start
                primera = False
            utiles.append((w, stem(limpio)))

    window = _adaptive_window(len(utiles))
    if len(utiles) < window * 2:
        return []

    stems = [s for _, s in utiles]
    medidas = cohesion(stems, window=window, step=max(5, window // 2))
    if len(medidas) < 3:
        return []

    curva = _smooth([v for _, v in medidas])
    profundidades = _depths(curva)
    if not profundidades:
        return []

    valores = [d for _, d in profundidades]
    media = sum(valores) / len(valores)
    desviacion = (
        math.sqrt(sum((v - media) ** 2 for v in valores) / len(valores))
        if len(valores) > 1
        else 0.0
    )
    # Los dos criterios a la vez: relativo para adaptarse a cada video, y
    # absoluto para no inventar un capitulo donde no cambia nada.
    corte = max(MIN_DEPTH, media - depth_factor * desviacion)

    fronteras: list[Boundary] = []
    for indice, profundidad in profundidades:
        if profundidad < corte or profundidad <= 0:
            continue
        centro = _refine(stems, inicios, medidas[indice][0], window)
        momento = arranque.get(centro, utiles[min(centro, len(utiles) - 1)][0].start)
        if fronteras and momento - fronteras[-1].time < max(min_seconds, 1.0):
            continue
        fronteras.append(
            Boundary(
                time=round(momento, 3),
                depth=round(profundidad, 4),
                before=topic_terms(
                    stems[max(0, centro - window) : centro],
                    stems[centro : centro + window],
                ),
                after=topic_terms(
                    stems[centro : centro + window],
                    stems[max(0, centro - window) : centro],
                ),
            )
        )
    return fronteras


def _snap_to_pause(words, t: float, ventana: float) -> float:
    """Mueve el corte a la pausa mas cercana, si hay alguna cerca.

    El vocabulario dice **que** ahi cambia el tema, pero no cae en un sitio
    donde se pueda cortar: cae en mitad de una frase. La pausa dice **donde**.
    """
    mejor, mejor_hueco = t, 0.0
    for anterior, siguiente in zip(words, words[1:]):
        if abs(anterior.end - t) > ventana:
            continue
        hueco = siguiente.start - anterior.end
        if hueco > mejor_hueco and hueco >= 0.25:
            mejor, mejor_hueco = siguiente.start, hueco
    return mejor


def _surface_forms(textos) -> dict[str, Counter]:
    """Para cada raiz, con que palabras se ha dicho de verdad."""
    formas: dict[str, Counter] = {}
    for texto in textos:
        for palabra in normalize(texto).split():
            if len(palabra) <= 2 or palabra in STOPWORDS:
                continue
            formas.setdefault(stem(palabra), Counter())[palabra] += 1
    return formas


def label(propios: list[str], ajenos: list[str], n: int = 3) -> str:
    """De que va un tramo, en palabras que se puedan leer.

    `topic_terms` devuelve raices ("instal", "driv"), que sirven para comparar
    y no para titular nada. Aqui se elige la raiz y se devuelve **la forma en
    que se dijo**, que es la que entiende quien lee el capitulo.
    """
    formas = _surface_forms(propios)
    raices = topic_terms(
        [s for t in propios for s in content_stems(t)],
        [s for t in ajenos for s in content_stems(t)],
        n,
    )
    palabras = [formas[r].most_common(1)[0][0] for r in raices if r in formas]
    if not palabras:
        return ""
    texto = " ".join(palabras)
    return texto[:1].upper() + texto[1:]
