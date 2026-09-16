"""El rotulo que dice donde estas: caja de color con el nombre de la seccion.

La idea es la de television: un rectangulo con texto que te situa. Aqui el
texto no es una plantilla ni lo escribe nadie a mano -- sale de lo que el video
**esta tratando** en ese tramo, que es el titulo del capitulo que el sistema ya
dedujo de lo que dices.

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

from .edl import EDL, LowerThirdEffect, Rect
from .placement import ScreenUse, place

#: Tamano de la caja, en fracciones del fotograma. No es el texto: es el hueco
#: que se le reserva para decidir donde cabe sin tapar nada.
LABEL_WIDTH = 0.34
LABEL_HEIGHT = 0.09

#: Un titulo que es un numero de parte no orienta a nadie, y es lo que
#: `chapters.py` pone cuando no consigue sacar un nombre de lo que dices.
_NUMERADO = re.compile(r"\(\d+\)\s*$")
#: Ni uno de una sola palabra corta ("bien", "vale").
MIN_TITULO = 2


def _es_concreto(titulo: str) -> bool:
    """Si ese titulo dice de que va la seccion o es un relleno."""
    limpio = titulo.strip()
    if not limpio or _NUMERADO.search(limpio):
        return False
    palabras = [p for p in limpio.split() if len(p) > 2]
    return len(palabras) >= MIN_TITULO


def plan_labels(
    edl: EDL, style, screen: ScreenUse | None = None
) -> list[LowerThirdEffect]:
    """Un rotulo por seccion que lo merezca, y ninguno mas."""
    rules = style.labels
    if not rules.enabled or not edl.chapters or edl.duration <= 0:
        return []

    inicios = [c.start for c in edl.chapters] + [edl.duration]
    salida: list[LowerThirdEffect] = []

    for i, capitulo in enumerate(edl.chapters):
        largo = inicios[i + 1] - capitulo.start
        if largo < rules.min_chapter_seconds:
            continue
        if not _es_concreto(capitulo.title):
            continue

        # Despues de la tarjeta, no encima: la tarjeta anuncia el cambio y el
        # rotulo recuerda donde estas.
        inicio = capitulo.start + style.chapters.card_seconds + rules.after_card
        fin = inicio + rules.seconds
        if fin > capitulo.start + largo - 1.0 or fin > edl.duration:
            continue

        base = Rect(x=0.05, y=0.08, w=LABEL_WIDTH, h=LABEL_HEIGHT)
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
                title=capitulo.title,
                rect=base,
                color=rules.color,
                value_score=round(valor, 3),
                cost_weight=0.30,
                rationale=(
                    f'rotulo "{capitulo.title}" en {inicio:.0f}s: llevas '
                    f"{largo / 60:.0f} min en esa seccion"
                    + (f" · movido {movida} para no taparlo" if movida else "")
                ),
            )
        )

    return salida
