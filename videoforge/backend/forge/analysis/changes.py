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

Aqui se calcula comparando el fotograma de antes con el de despues de cada
cambio de plano y quedandose con la **region que cambio**. Dos guardas:

- si lo que cambia es una miseria, no es un suceso, es ruido de compresion;
- si cambia media pantalla, no ha "aparecido algo", ha cambiado todo, y ahi no
  hay ninguna region que senalar.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np

from ..config import Settings
from .frames import extract_frames_at

#: Resolucion a la que se comparan los fotogramas. Con esto sobra para saber
#: **donde** esta el cambio, y es instantaneo.
DIFF_WIDTH = 320
DIFF_HEIGHT = 180
#: Cuanto se mira antes y despues del corte.
GAP = 0.35
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


def find_changes(
    proxy_video: Path,
    settings: Settings,
    shots,
    *,
    gap: float = GAP,
) -> list[ScreenChange]:
    """Que cambio en cada corte de plano, y donde."""
    if not shots:
        return []

    import cv2

    instantes: list[float] = []
    for shot in shots:
        if shot.start <= gap:
            continue
        instantes += [shot.start - gap, shot.start + gap]
    if not instantes:
        return []

    frames = extract_frames_at(
        proxy_video, settings, instantes, width=DIFF_WIDTH, height=DIFF_HEIGHT
    )
    if len(frames) < len(instantes):
        return []

    salida: list[ScreenChange] = []
    for i in range(0, len(instantes), 2):
        antes = cv2.cvtColor(frames[i], cv2.COLOR_RGB2GRAY)
        despues = cv2.cvtColor(frames[i + 1], cv2.COLOR_RGB2GRAY)
        region = _region(antes, despues)
        if region is None:
            continue
        x, y, w, h, area = region
        salida.append(
            ScreenChange(
                at=round(instantes[i] + gap, 3),
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
