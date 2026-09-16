"""El rotulo que dice donde estas: caja de color con el nombre de la seccion.

La idea es la de television: un rectangulo con texto que te situa. Aqui el
texto no es una plantilla ni lo escribe nadie a mano -- sale de lo que el video
**esta tratando** en ese tramo.

Y ahi estaba el fallo de la primera version: usaba el titulo del capitulo tal
cual, que es una **frase**. Salian rotulos como "El siguiente paso es el
importante" o "Importante fijate boton", y un rotulo asi no situa a nadie: un
rotulo es un **nombre**. El ejemplo que hay que imitar tiene dos palabras
("Expediciones Palworld"), no cinco.

Un titulo de capitulo puede permitirse ser una frase porque se lee una vez, en
una lista, con su minuto delante. Un rotulo se lee de reojo mientras hablas.
Asi que el texto sale de `understand/topics.py::label`, que contesta "¿de que va
esto?" con los terminos que ese tramo usa y los demas no, en la forma en que los
dijiste -- y se corta a dos palabras.

Lo dificil de esto no es dibujarlo, es **no ponerlo**. Un rotulo mal puesto es
peor que ninguno, y hay tres formas facilisimas de ponerlo mal:

1. **Decir dos veces lo mismo.** Al empezar un capitulo ya sale su tarjeta con
   el titulo. Un rotulo ahi mismo diciendo lo mismo no informa, decora. Por eso
   el rotulo **no acompana al cambio, acompana a la seccion**: sale despues,
   cuando la tarjeta ya se ha ido, para quien llega a mitad y no sabe de que se
   esta hablando.
2. **Ponerlo donde no hace falta.** En una seccion de cuarenta segundos la
   tarjeta del principio basta y sobra: nadie se ha perdido todavia. El rotulo
   solo tiene sentido en secciones largas.
3. **Ponerlo encima de lo que estas ensenando.** La posicion no es fija: se
   elige como la de la ventanita de material (`plan/placement.py`), apartandose
   de lo que senalas, del puntero, de los subtitulos y de la zona llena.

Y por encima de todo eso pasa el mismo filtro que el resto del montaje: un
rotulo tiene que **justificarse** (`plan/restraint.py`). Un capitulo largo con
un titulo concreto lo justifica; uno que se llama "Parte 3" no.
"""

from __future__ import annotations

import re

from ..understand.topics import label as topic_label
from .edl import EDL, LowerThirdEffect, Rect
from .placement import ScreenUse, place

#: Cuantas palabras puede tener un rotulo. Es un nombre, no una frase: con dos
#: se lee de reojo, con cinco hay que pararse a leerlo y entonces ya no estas
#: mirando el video.
LABEL_WORDS = 2

#: Alto de la caja y ancho **por caracter**, en fracciones del fotograma. El
#: ancho no puede ser fijo: reservarle a "Firewall" el mismo hueco que a
#: "Expediciones Palworld" hace que la decision de donde ponerlo se tome con un
#: tamano que no es el suyo.
LABEL_HEIGHT = 0.075
LABEL_CHAR_WIDTH = 0.0165
LABEL_PADDING = 0.03
LABEL_MAX_WIDTH = 0.45

#: Que fraccion del montaje puede ocupar un capitulo y seguir siendo "una
#: seccion". Un rotulo de seccion contesta **en cual de ellas estas**; si solo
#: hay una, no contesta nada -- y encima el nombre sale mal, porque se calcula
#: contrastando lo que se dice ahi con lo que se dice en el resto, y no hay
#: resto: en una prueba de 12 minutos con un unico capitulo salia "Chrome base",
#: dos palabras de dos temas distintos.
MAX_PARTE_DEL_VIDEO = 0.7

#: Un titulo que es un numero de parte no orienta a nadie, y es lo que
#: `chapters.py` pone cuando no consigue sacar un nombre de lo que dices.
_NUMERADO = re.compile(r"\(\d+\)\s*$")
#: Ni uno de una sola palabra corta ("bien", "vale").
MIN_TITULO = 2
#: Dos rotulos que comparten esta fraccion de palabras estan diciendo lo mismo
#: con otras palabras ("Seccion terminamos" y "Terminamos seccion"), y el
#: segundo no informa de ningun cambio. Se compara con **todos** los anteriores
#: y no solo con el ultimo: un rotulo repetido a los diez minutos sigue siendo
#: un rotulo repetido.
MAX_PARECIDO = 0.5


def _es_concreto(titulo: str) -> bool:
    """Si ese titulo dice de que va la seccion o es un relleno."""
    limpio = titulo.strip()
    if not limpio or _NUMERADO.search(limpio):
        return False
    palabras = [p for p in limpio.split() if len(p) > 2]
    return len(palabras) >= MIN_TITULO


def _caja(texto: str) -> tuple[float, float]:
    """El hueco que ocupa ese texto, para decidir donde cabe."""
    ancho = min(LABEL_MAX_WIDTH, LABEL_PADDING + len(texto) * LABEL_CHAR_WIDTH)
    return round(ancho, 4), LABEL_HEIGHT


def _nombre(capitulo, inicio: float, fin: float, transcript) -> str:
    """Como se llama esa seccion, en dos palabras.

    De lo que se dice **ahi** frente a lo que se dice en el resto del video: la
    palabra que solo sale aqui es el asunto de aqui. Si no se puede sacar (sin
    transcripcion, o un tramo sin nada distintivo), se cae al titulo del
    capitulo, que es lo que habia antes.
    """
    if transcript is not None:
        propias = [w.text for w in transcript.words if inicio <= w.start < fin]
        ajenas = [w.text for w in transcript.words if not (inicio <= w.start < fin)]
        if propias:
            nombre = topic_label([" ".join(propias)], [" ".join(ajenas)], LABEL_WORDS)
            if nombre:
                return nombre[:1].upper() + nombre[1:]

    corto = " ".join(capitulo.title.split()[:LABEL_WORDS])
    return corto[:1].upper() + corto[1:] if corto else ""


def _se_parecen(a: str, b: str) -> bool:
    """Si dos rotulos dicen lo mismo con otras palabras."""
    from ..assets.coherence import tag_stems

    uno, otro = tag_stems(a.split()), tag_stems(b.split())
    if not uno or not otro:
        return False
    return len(uno & otro) / min(len(uno), len(otro)) > MAX_PARECIDO


def plan_labels(
    edl: EDL, style, screen: ScreenUse | None = None, transcript=None
) -> list[LowerThirdEffect]:
    """Un rotulo por seccion que lo merezca, y ninguno mas."""
    rules = style.labels
    if not rules.enabled or edl.duration <= 0:
        return []
    # Con un solo capitulo no hay secciones entre las que situarse.
    if len(edl.chapters) < 2:
        return []

    inicios = [c.start for c in edl.chapters] + [edl.duration]
    salida: list[LowerThirdEffect] = []

    for i, capitulo in enumerate(edl.chapters):
        largo = inicios[i + 1] - capitulo.start
        if largo < rules.min_chapter_seconds:
            continue
        if largo > edl.duration * MAX_PARTE_DEL_VIDEO:
            continue
        if not _es_concreto(capitulo.title):
            continue

        # El nombre sale de lo que se dice ahi, no del titulo del capitulo.
        nombre = _nombre(capitulo, capitulo.start, inicios[i + 1], transcript)
        if not nombre or not _es_concreto(nombre + " x"):
            continue
        # Y no se repite nada de lo ya dicho, ni con otras palabras ni en otro
        # orden: un rotulo que no anuncia un cambio no hace falta.
        if any(_se_parecen(puesto.title, nombre) for puesto in salida):
            continue

        # Despues de la tarjeta, no encima: la tarjeta anuncia el cambio y el
        # rotulo recuerda donde estas.
        inicio = capitulo.start + style.chapters.card_seconds + rules.after_card
        fin = inicio + rules.seconds
        if fin > capitulo.start + largo - 1.0 or fin > edl.duration:
            continue

        ancho, alto = _caja(nombre)
        base = Rect(x=0.05, y=0.08, w=ancho, h=alto)
        movida = ""
        if screen is not None:
            origen_inicio = edl.timeline_to_source(inicio)
            origen_fin = edl.timeline_to_source(fin)
            if origen_inicio is not None:
                base, movida = place(
                    base,
                    screen.busy(
                        origen_inicio, origen_fin or origen_inicio,
                        timeline=(inicio, fin),
                    ),
                    screen.grid(origen_inicio),
                )

        # Lo que aporta: cuanto mas larga la seccion, mas se agradece saber en
        # cual estas. Media hora de video sin una sola referencia se hace larga;
        # un capitulo de minuto y medio casi no la necesita.
        valor = min(0.72, 0.34 + largo / 600.0)

        salida.append(
            LowerThirdEffect(
                id=f"label{i:03d}",
                start=round(inicio, 3),
                end=round(fin, 3),
                title=nombre,
                rect=base,
                color=rules.color,
                value_score=round(valor, 3),
                cost_weight=0.30,
                rationale=(
                    f'rotulo "{nombre}" en {inicio:.0f}s: llevas '
                    f"{largo / 60:.0f} min hablando de eso"
                    + (f" · movido {movida} para no taparlo" if movida else "")
                ),
            )
        )

    return salida
