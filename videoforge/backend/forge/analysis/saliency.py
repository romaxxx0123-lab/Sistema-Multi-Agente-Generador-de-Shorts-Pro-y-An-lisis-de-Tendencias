"""Donde mira el ojo en cada plano.

Implementa el residuo espectral (Hou & Zhang, 2007) directamente con FFT: son
unas pocas lineas de numpy y evita depender de `opencv-contrib`, que no viene en
las ruedas headless.

Lo importante no es solo *donde* mirar, sino **cuanto** destaca esa zona. Si la
saliencia esta repartida por todo el fotograma no hay nada a lo que acercarse, y
un zoom seria arbitrario. Por eso devolvemos tambien una `concentracion`: el
planner solo hace punch-in cuando hay algo que enfocar de verdad.

Para una guia esto es justo lo que hace falta: el ojo va al menu, al boton o al
texto que estas senalando, y ahi es donde debe ir el encuadre.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np

from ..config import Settings
from .frames import extract_frames_at
from .types import Shot, ShotFocus

#: Resolucion del mapa de saliencia. Pequena a proposito: el residuo espectral
#: funciona mejor a baja resolucion y asi cuesta milisegundos.
MAP_WIDTH = 96
MAP_HEIGHT = 54
#: Fotogramas que se muestrean por plano.
SAMPLES_PER_SHOT = 3
#: Por debajo de esta concentracion consideramos que no hay foco claro.
FLAT_THRESHOLD = 0.08
#: Desviacion tipica minima (en niveles 0-255) para que merezca la pena mirar.
#: Un fotograma liso da exactamente 0; material real ronda 30-70. Ademas de no
#: tener nada que enfocar, el residuo espectral se dispara numericamente sobre
#: una imagen de varianza cero, asi que este guardia evita las dos cosas.
MIN_CONTRAST = 2.0


def _spectral_residual(gray: np.ndarray) -> np.ndarray:
    """Mapa de saliencia de una imagen en escala de grises."""
    import cv2

    if float(gray.std()) < MIN_CONTRAST:
        # Fotograma plano: no hay nada que destaque sobre nada.
        return np.zeros(gray.shape, dtype=np.float32)

    img = gray.astype(np.float32) / 255.0
    spectrum = np.fft.fft2(img)
    log_amplitude = np.log(np.abs(spectrum) + 1e-8)
    phase = np.angle(spectrum)

    # El "residuo" es lo que el espectro tiene de inesperado respecto a su
    # propia media local: justo lo que destaca sobre el fondo.
    smoothed = cv2.blur(log_amplitude, (3, 3))
    residual = log_amplitude - smoothed

    reconstructed = np.fft.ifft2(np.exp(residual + 1j * phase))
    saliency = np.abs(reconstructed) ** 2
    saliency = cv2.GaussianBlur(saliency, (9, 9), 2.5)

    lo, hi = float(saliency.min()), float(saliency.max())
    if hi - lo < 1e-9:
        return np.zeros_like(saliency)
    return (saliency - lo) / (hi - lo)


def _focus_from_map(saliency: np.ndarray) -> tuple[float, float, float]:
    """Centro de atencion y como de concentrada esta.

    La concentracion se mide como la fraccion de saliencia que cae en el 10% de
    pixeles mas salientes: si esta repartida, el valor baja y el planner
    entiende que no hay nada que enfocar.
    """
    total = float(saliency.sum())
    if total <= 1e-9:
        return 0.5, 0.5, 0.0

    h, w = saliency.shape
    ys, xs = np.mgrid[0:h, 0:w]
    cx = float((saliency * xs).sum() / total) / max(w - 1, 1)
    cy = float((saliency * ys).sum() / total) / max(h - 1, 1)

    plano = np.sort(saliency.ravel())[::-1]
    top = max(1, int(len(plano) * 0.10))
    fraccion = float(plano[:top].sum() / total)
    # Con saliencia uniforme, el 10% de pixeles tiene el 10% de la masa; por eso
    # reescalamos para que "uniforme" sea 0 y "todo en un punto" sea 1.
    concentracion = max(0.0, (fraccion - 0.10) / 0.90)

    return (
        min(1.0, max(0.0, cx)),
        min(1.0, max(0.0, cy)),
        min(1.0, concentracion),
    )


def analyze_saliency(
    proxy_video: Path,
    shots: list[Shot],
    settings: Settings,
    *,
    samples_per_shot: int = SAMPLES_PER_SHOT,
) -> list[ShotFocus]:
    """Calcula el foco de atencion de cada plano."""
    import cv2

    focos: list[ShotFocus] = []
    for shot in shots:
        # Evitamos los bordes del plano, donde puede haber transicion.
        margen = min(0.2, shot.duration * 0.15)
        inicio, fin = shot.start + margen, max(shot.start + margen, shot.end - margen)
        if fin <= inicio:
            instantes = [shot.start + shot.duration / 2]
        else:
            instantes = [
                inicio + (fin - inicio) * (i + 0.5) / samples_per_shot
                for i in range(samples_per_shot)
            ]

        frames = extract_frames_at(
            proxy_video, settings, instantes, width=MAP_WIDTH, height=MAP_HEIGHT
        )
        if not frames:
            focos.append(ShotFocus(shot_index=shot.index, cx=0.5, cy=0.5, concentration=0.0))
            continue

        mapas = [
            _spectral_residual(cv2.cvtColor(f, cv2.COLOR_RGB2GRAY)) for f in frames
        ]
        promedio = np.mean(mapas, axis=0)
        cx, cy, concentracion = _focus_from_map(promedio)

        focos.append(
            ShotFocus(
                shot_index=shot.index,
                cx=round(cx, 4),
                cy=round(cy, 4),
                concentration=round(concentracion, 4),
            )
        )

    return focos
