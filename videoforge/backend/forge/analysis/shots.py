"""Deteccion de planos (cambios de escena).

Usamos PySceneDetect sobre el proxy, pero con una red de seguridad: si la
libreria no esta instalada o falla con un codec raro, deducimos los cortes de
la curva `diff` que ya calculamos en el analisis de movimiento. Preferimos un
resultado algo peor a que el pipeline entero se caiga.
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
#: Para el plan B: salto en la curva `diff` que consideramos un corte.
FALLBACK_DIFF_JUMP = 0.28


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


def _shots_from_motion(motion: MotionTrack, duration: float, min_seconds: float) -> list[Shot]:
    """Plan B: los cortes son picos aislados en la diferencia entre fotogramas."""
    if not motion.diff or motion.rate <= 0:
        return [Shot(index=0, start=0.0, end=duration)]

    arr = np.asarray(motion.diff, dtype=np.float32)
    # Un corte es un pico local, no una zona movida: comparamos cada muestra con
    # la mediana de su entorno en vez de con un umbral global.
    window = max(3, int(motion.rate))
    padded = np.pad(arr, window, mode="edge")
    local = np.array(
        [np.median(padded[i : i + 2 * window + 1]) for i in range(len(arr))],
        dtype=np.float32,
    )
    spikes = np.where(arr - local > FALLBACK_DIFF_JUMP)[0]
    bounds = [float(i) / motion.rate for i in spikes]
    return _merge_short_shots(bounds, duration, min_seconds)


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

    if bounds is None:
        if motion is not None:
            return _shots_from_motion(motion, duration, min_seconds)
        return [Shot(index=0, start=0.0, end=duration)]

    return _merge_short_shots(bounds, duration, min_seconds)
