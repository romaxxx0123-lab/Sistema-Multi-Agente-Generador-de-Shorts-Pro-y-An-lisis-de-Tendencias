"""Deteccion de planos (cambios de escena).

Se combinan **dos detectores**, porque cada uno ve lo que al otro se le escapa:

- **PySceneDetect** compara el contenido en HSV contra un umbral absoluto. Va
  muy bien en material grabado con camara, donde un corte cambia medio
  fotograma de golpe.
- **Un detector adaptativo propio** busca picos en la curva de diferencia
  *relativos a su vecindad*, sin umbral absoluto.

El segundo no es solo una red de seguridad: es imprescindible en grabaciones de
pantalla. Al pasar de una pantalla oscura de una aplicacion a otra igual de
oscura, la diferencia media es de **uno a tres niveles de gris sobre 255**.
PySceneDetect no la ve ni bajando su umbral a 3, mientras que ese cambio destaca
clarisimamente sobre una vecindad que esta practicamente a cero.

Como los dos pueden acertar en sitios distintos, se toma la union y luego se
fusionan los planos demasiado cortos.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np

from ..config import Settings
from .types import MotionTrack, Shot

#: Umbral de PySceneDetect. 27 es su valor por defecto y funciona bien con
#: material real; bajarlo trocea de mas en video con grano.
DEFAULT_THRESHOLD = 27.0
#: Un "plano" mas corto que esto no es un plano, es un parpadeo.
MIN_SHOT_SECONDS = 0.4
#: Salto sobre la vecindad que el detector adaptativo considera un corte.
ADAPTIVE_DIFF_JUMP = 0.28
#: Valor minimo de la curva normalizada para considerar un pico. Ver la
#: explicacion en `_adaptive_cut_times`: junto al suelo de normalizacion
#: equivale a exigir medio nivel de gris de cambio real.
SPIKE_LEVEL = 0.5


def _merge_short_shots(bounds: list[float], duration: float, min_seconds: float) -> list[Shot]:
    """Convierte instantes de corte en planos, fusionando los demasiado cortos."""
    cuts = [b for b in sorted(set(bounds)) if 0.0 < b < duration]

    kept: list[float] = []
    last = 0.0
    for c in cuts:
        if c - last >= min_seconds:
            kept.append(c)
            last = c

    # Si el ultimo plano queda demasiado corto, absorbemos su corte inicial.
    if kept and duration - kept[-1] < min_seconds:
        kept.pop()

    edges = [0.0, *kept, duration]
    return [
        Shot(index=i, start=round(edges[i], 3), end=round(edges[i + 1], 3))
        for i in range(len(edges) - 1)
    ]


def _adaptive_cut_times(motion: MotionTrack) -> list[float]:
    """Instantes donde la diferencia entre fotogramas destaca sobre su vecindad.

    Comparar con la mediana local y no con un umbral global es lo que permite
    ver un corte de poco contraste: lo que importa no es cuanto cambia, sino
    cuanto cambia **respecto a lo que venia pasando**.
    """
    if not motion.diff or motion.rate <= 0:
        return []

    arr = np.asarray(motion.diff, dtype=np.float32)
    # Ventana de un segundo a cada lado: lo bastante ancha para que un corte no
    # contamine su propia referencia.
    window = max(3, int(motion.rate))
    padded = np.pad(arr, window, mode="edge")
    local = np.array(
        [np.median(padded[i : i + 2 * window + 1]) for i in range(len(arr))],
        dtype=np.float32,
    )

    # Dos condiciones a la vez: que destaque sobre su vecindad y que ademas sea
    # un valor alto de la curva.
    #
    # La segunda es la que frena el ruido del codec, y funciona gracias a como
    # se normaliza la curva en `motion.py`: se divide por el percentil 95 del
    # video, pero con un suelo de MIN_SIGNIFICANT_DIFF. En un plano fijo ese
    # suelo es el que manda, asi que exigir `> 0.5` equivale a exigir medio
    # nivel de gris de cambio real. Sin ese suelo, un video totalmente estatico
    # veria su propio ruido amplificado hasta 1.0 y todo serian cortes.
    destaca = arr - local > ADAPTIVE_DIFF_JUMP
    spikes = np.where(destaca & (arr > SPIKE_LEVEL))[0]
    return [float(i) / motion.rate for i in spikes]


def _shots_from_motion(motion: MotionTrack, duration: float, min_seconds: float) -> list[Shot]:
    """Planos deducidos solo de la curva de diferencia."""
    tiempos = _adaptive_cut_times(motion)
    if not tiempos:
        return [Shot(index=0, start=0.0, end=duration)]
    return _merge_short_shots(tiempos, duration, min_seconds)


def detect_shots(
    proxy_video: Path,
    duration: float,
    settings: Settings,
    *,
    threshold: float = DEFAULT_THRESHOLD,
    min_seconds: float = MIN_SHOT_SECONDS,
    motion: MotionTrack | None = None,
) -> list[Shot]:
    """Devuelve la lista de planos del video."""
    bounds: list[float] | None = None
    try:
        from scenedetect import ContentDetector, SceneManager, open_video

        video = open_video(str(proxy_video))
        manager = SceneManager()
        manager.add_detector(
            ContentDetector(
                threshold=threshold,
                min_scene_len=max(1, int(min_seconds * video.frame_rate)),
            )
        )
        manager.detect_scenes(video, show_progress=False)
        scenes = manager.get_scene_list()
        # get_scene_list devuelve pares (inicio, fin); nos basta con los inicios
        # a partir del segundo, que son los cortes reales. La propiedad
        # `seconds` es la forma moderna; `get_seconds()` cubre versiones viejas.
        bounds = [
            float(getattr(s[0], "seconds", None) or s[0].get_seconds())
            for s in scenes[1:]
        ]
    except ImportError:
        bounds = None
    except Exception:
        # Un codec que PySceneDetect no digiere no debe tumbar el analisis.
        bounds = None

    # Los dos detectores se complementan: se toma la union. Sin esto, una
    # grabacion de pantalla entera se analiza como un unico plano, y la
    # saliencia (donde mirar) se calcula una sola vez para todo el video.
    adaptativos = _adaptive_cut_times(motion) if motion is not None else []
    todos = list(bounds or []) + adaptativos

    if not todos and bounds is None and motion is None:
        return [Shot(index=0, start=0.0, end=duration)]

    return _merge_short_shots(todos, duration, min_seconds)
