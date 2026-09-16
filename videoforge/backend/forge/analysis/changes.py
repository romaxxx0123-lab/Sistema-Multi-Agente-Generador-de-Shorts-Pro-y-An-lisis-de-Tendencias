"""Que ha cambiado en la pantalla, no solo cuando.

El detector de planos ya encuentra **cuando** pasa algo: en una grabacion de
pantalla, abrir un menu o que salte un dialogo cambia bastante la imagen como
para que se marque un corte, y eso funciona bien.

Lo que faltaba es **que**. El analisis contestaba "a donde hay que mirar" con el
centro de masas de la saliencia, que mide contraste; y en una interfaz el
contraste esta repartido por toda la pantalla, asi que el centro cae en
cualquier sitio. Medido sobre una grabacion con un dialogo que aparece en el
segundo 16, centrado en (0.46, 0.46):

    el analisis manda mirar a (0.31, 0.29)     <- el menu de antes
    error: 0.23 de pantalla

O sea que el zoom se acercaba al menu viejo justo cuando lo que habia que ver
era el dialogo nuevo. Y en una guia **lo que acaba de aparecer es lo que se esta
mirando**: no hay senal de atencion mas fuerte que esa.

Aqui se calcula comparando fotogramas seguidos y quedandose con la **region que
cambio**.

La primera version solo miraba los **cortes de plano**, y eso dejaba fuera la
mayoria: medido sobre una guia sintetica de cinco sucesos, el panel del router
que se sustituye por el de la impresora cambia el **0.78%** del cuadro, muy poco
para que el detector de planos lo llame corte -- y sin embargo es un suceso de
manual, con su region perfectamente localizable. En una interfaz casi todo es
asi: un panel que cambia de contenido, un valor que se actualiza, una opcion que
se marca. Por eso se barre el video entero.

Dos guardas:

- si lo que cambia es una miseria, no es un suceso, es ruido de compresion;
- si cambia media pantalla, no ha "aparecido algo", ha cambiado todo, y ahi no
  hay ninguna region que senalar.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np

from ..config import Settings
from .frames import iter_gray_frames

#: Resolucion a la que se comparan los fotogramas. Con esto sobra para saber
#: **donde** esta el cambio, y es instantaneo.
DIFF_WIDTH = 320
DIFF_HEIGHT = 180
#: Cada cuanto se mira. Dos veces por segundo basta para que un suceso no se
#: escape y es mas barato que la pasada de movimiento, que va a cuatro.
RATE = 2.0
#: Dos sucesos mas juntos que esto en el tiempo, y que se pisen en pantalla, son
#: el mismo suceso visto dos veces.
MERGE_SECONDS = 1.5
#: Diferencia de gris a partir de la cual un pixel ha cambiado de verdad.
THRESHOLD = 22
#: Por debajo de esta fraccion del fotograma no es un suceso, es ruido.
MIN_AREA = 0.004
#: Y por encima de esta ha cambiado todo, que no es lo mismo que haber
#: aparecido algo.
MAX_AREA = 0.55
#: Margen que se le deja alrededor a lo que aparecio, en fracciones.
PAD = 0.01


@dataclass(frozen=True)
class ScreenChange:
    """Algo que aparecio (o desaparecio) en la pantalla, y donde."""

    at: float
    x: float
    y: float
    w: float
    h: float
    #: fraccion del fotograma que cambio
    area: float

    @property
    def cx(self) -> float:
        return self.x + self.w / 2

    @property
    def cy(self) -> float:
        return self.y + self.h / 2

    @property
    def box(self) -> tuple[float, float, float, float]:
        return (self.x, self.y, self.w, self.h)


def _region(antes: np.ndarray, despues: np.ndarray) -> tuple[float, float, float, float, float] | None:
    """La zona que cambio entre dos fotogramas, en fracciones."""
    import cv2

    diff = cv2.absdiff(antes, despues)
    _, mascara = cv2.threshold(diff, THRESHOLD, 255, cv2.THRESH_BINARY)
    # Se cierran los huecos: el texto de un dialogo cambia por letras sueltas y
    # lo que interesa es el dialogo entero, no cada letra.
    mascara = cv2.morphologyEx(
        mascara, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, (9, 9))
    )

    alto, ancho = mascara.shape
    total = float(alto * ancho)
    cambiado = float(np.count_nonzero(mascara)) / total
    if cambiado < MIN_AREA or cambiado > MAX_AREA:
        return None

    n, _, stats, _ = cv2.connectedComponentsWithStats(mascara, connectivity=8)
    if n <= 1:
        return None
    # El componente 0 es el fondo; de los demas, el mas grande es el suceso.
    i = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    x, y, w, h, area = stats[i]
    if area / total < MIN_AREA:
        return None

    return (
        float(max(0.0, x / ancho - PAD)),
        float(max(0.0, y / alto - PAD)),
        float(min(1.0, w / ancho + PAD * 2)),
        float(min(1.0, h / alto + PAD * 2)),
        float(round(cambiado, 4)),
    )


def _se_pisan(a: ScreenChange, b: tuple[float, float, float, float]) -> bool:
    """Si dos regiones se solapan de verdad."""
    x, y, w, h = b
    ancho = max(0.0, min(a.x + a.w, x + w) - max(a.x, x))
    alto = max(0.0, min(a.y + a.h, y + h) - max(a.y, y))
    comun = ancho * alto
    return comun > 0.4 * min(a.w * a.h, w * h)


def find_changes(
    proxy_video: Path,
    settings: Settings,
    shots=None,
    *,
    rate: float = RATE,
) -> list[ScreenChange]:
    """Que cambia en la pantalla a lo largo del video, y donde.

    `shots` ya no hace falta y se acepta para no romper a quien la llamara con
    el orden viejo: lo que se barre es el video entero.
    """
    import cv2

    frames = list(
        iter_gray_frames(
            proxy_video, settings, rate=rate, width=DIFF_WIDTH, height=DIFF_HEIGHT
        )
    )
    if len(frames) < 2:
        return []

    salida: list[ScreenChange] = []
    for i in range(1, len(frames)):
        region = _region(frames[i - 1], frames[i])
        if region is None:
            continue
        x, y, w, h, area = region
        at = round(i / rate, 3)

        # Un suceso que dura mas de un fotograma sale varias veces seguidas: es
        # el mismo. Se queda el primero, que es cuando empezo a pasar.
        if salida and at - salida[-1].at <= MERGE_SECONDS and _se_pisan(
            salida[-1], (x, y, w, h)
        ):
            continue

        salida.append(
            ScreenChange(
                at=at,
                x=round(float(x), 4), y=round(float(y), 4),
                w=round(float(w), 4), h=round(float(h), 4),
                area=float(area),
            )
        )
    return salida


def change_near(changes, at: float, window: float = 1.2) -> ScreenChange | None:
    """El cambio de pantalla mas cercano a ese instante, si lo hay."""
    cerca = [c for c in changes or () if abs(c.at - at) <= window]
    return min(cerca, key=lambda c: abs(c.at - at)) if cerca else None
