"""Curva de energia de movimiento del video.

Calculamos dos senales por cada par de fotogramas consecutivos:

- **diff**: diferencia media absoluta. Es baratisima y se dispara en los cortes,
  pero tambien con un simple cambio de luz.
- **flow**: magnitud media del flujo optico (Farneback). Cuesta mas pero
  distingue movimiento real de un cambio de iluminacion, que es justo lo que el
  planner necesita para decidir si puede meter un zoom sin marear.

Las dos se normalizan *dentro del propio video*: lo que importa al montar no es
el valor absoluto sino que tramos se mueven mas que el resto.
"""

from __future__ import annotations

import numpy as np

from ..config import Settings
from .frames import MOTION_HEIGHT, MOTION_WIDTH, iter_gray_frames
from .types import MotionTrack

#: Muestras por segundo de la curva. Por debajo de esto se pierden gestos
#: cortos; por encima, el coste sube sin aportar al montaje.
DEFAULT_RATE = 8.0
#: En videos largos bajamos el muestreo para que el analisis no se dispare.
LONG_VIDEO_SECONDS = 420.0
LONG_VIDEO_RATE = 4.0
#: Por debajo de este flujo (en pixeles) consideramos que es ruido del codec y
#: no movimiento. Evita que un video estatico salga con la curva al maximo.
MIN_SIGNIFICANT_FLOW = 0.25
#: Igual para la diferencia bruta, en unidades 0..1.
MIN_SIGNIFICANT_DIFF = 0.004


def rate_for_duration(duration: float) -> float:
    """Muestreo adecuado a la duracion del video."""
    return LONG_VIDEO_RATE if duration > LONG_VIDEO_SECONDS else DEFAULT_RATE


def _normalize(raw: list[float], floor: float) -> list[float]:
    """Lleva la senal a 0..1 relativa al propio video.

    Usamos el percentil 95 y no el maximo para que un unico fotograma raro (un
    flash, un corte) no aplaste el resto de la curva.
    """
    if not raw:
        return []
    arr = np.asarray(raw, dtype=np.float32)
    scale = float(np.percentile(arr, 95))
    scale = max(scale, floor)
    return np.clip(arr / scale, 0.0, 1.0).astype(float).tolist()


def analyze_motion(
    proxy_video,
    settings: Settings,
    *,
    rate: float = DEFAULT_RATE,
) -> MotionTrack:
    """Recorre el proxy y devuelve la curva de movimiento."""
    import cv2

    raw_diff: list[float] = []
    raw_flow: list[float] = []
    previous: np.ndarray | None = None

    for frame in iter_gray_frames(
        proxy_video, settings, rate=rate, width=MOTION_WIDTH, height=MOTION_HEIGHT
    ):
        if previous is not None:
            diff = float(np.mean(np.abs(frame.astype(np.int16) - previous.astype(np.int16))))
            raw_diff.append(diff / 255.0)

            flow = cv2.calcOpticalFlowFarneback(
                previous, frame,
                None,
                0.5,  # pyr_scale
                3,    # levels
                15,   # winsize
                3,    # iterations
                5,    # poly_n
                1.2,  # poly_sigma
                0,
            )
            magnitude = np.sqrt(flow[..., 0] ** 2 + flow[..., 1] ** 2)
            raw_flow.append(float(np.mean(magnitude)))
        previous = frame

    # La curva describe intervalos entre fotogramas; repetimos la primera
    # muestra al principio para que el indice i corresponda al instante i/rate.
    if raw_diff:
        raw_diff.insert(0, raw_diff[0])
        raw_flow.insert(0, raw_flow[0])

    return MotionTrack(
        rate=rate,
        diff=_normalize(raw_diff, MIN_SIGNIFICANT_DIFF),
        flow=_normalize(raw_flow, MIN_SIGNIFICANT_FLOW),
    )
