"""Lectura de fotogramas por tuberia desde ffmpeg.

Usamos ffmpeg y no `cv2.VideoCapture` a proposito: el posicionamiento de OpenCV
en ficheros largos es inconsistente segun el codec, mientras que pedirle a
ffmpeg un flujo a `fps` fijo da siempre los mismos fotogramas en los mismos
instantes. Que el analisis sea reproducible importa mas que ahorrarse un proceso.
"""

from __future__ import annotations

import subprocess
from collections.abc import Iterator
from pathlib import Path

import numpy as np

from ..config import Settings
from ..errors import AnalysisError
from ..tools import ffmpeg_bin

#: Resolucion de trabajo para movimiento: suficiente para ver a donde va la
#: escena y lo bastante pequena para que el flujo optico sea instantaneo.
MOTION_WIDTH = 160
MOTION_HEIGHT = 90


def iter_gray_frames(
    path: Path,
    settings: Settings,
    *,
    rate: float,
    width: int = MOTION_WIDTH,
    height: int = MOTION_HEIGHT,
) -> Iterator[np.ndarray]:
    """Devuelve fotogramas en escala de grises a `rate` por segundo."""
    cmd = [
        str(ffmpeg_bin(settings)),
        "-hide_banner", "-loglevel", "error", "-nostdin",
        "-i", str(path),
        "-vf", f"fps={rate:g},scale={width}:{height}:flags=bilinear,format=gray",
        "-f", "rawvideo",
        "-pix_fmt", "gray",
        "-",
    ]
    frame_bytes = width * height
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    assert proc.stdout is not None
    try:
        while True:
            buf = proc.stdout.read(frame_bytes)
            if not buf or len(buf) < frame_bytes:
                break
            yield np.frombuffer(buf, dtype=np.uint8).reshape(height, width)
    finally:
        # Cerramos la tuberia antes de esperar: si el consumidor abandona pronto
        # (p. ej. un `break`), ffmpeg debe recibir SIGPIPE y no quedarse colgado.
        try:
            proc.stdout.close()
        except OSError:
            pass
        err = b""
        if proc.stderr is not None:
            err = proc.stderr.read() or b""
            proc.stderr.close()
        code = proc.wait()
        # 141 = SIGPIPE, esperado cuando el consumidor para antes de tiempo.
        if code not in (0, 141, -13) and b"error" in err.lower():
            raise AnalysisError(
                f"ffmpeg fallo leyendo fotogramas de {path.name}",
                hint=err.decode("utf-8", "replace")[-800:],
            )


def extract_frames_at(
    path: Path,
    settings: Settings,
    timestamps: list[float],
    *,
    width: int = 224,
    height: int = 224,
) -> list[np.ndarray]:
    """Saca fotogramas RGB en instantes concretos (para vision y OCR).

    Hace una llamada a ffmpeg por instante, asi que esta pensado para decenas o
    centenares de fotogramas, no para recorrer el video entero.
    """
    out: list[np.ndarray] = []
    ffmpeg = str(ffmpeg_bin(settings))
    for ts in timestamps:
        cmd = [
            ffmpeg,
            "-hide_banner", "-loglevel", "error", "-nostdin",
            # El seek antes de -i es el rapido (por keyframes); suficiente aqui.
            "-ss", f"{max(0.0, ts):.3f}",
            "-i", str(path),
            "-frames:v", "1",
            "-vf", f"scale={width}:{height}:flags=bilinear",
            "-f", "rawvideo",
            "-pix_fmt", "rgb24",
            "-",
        ]
        proc = subprocess.run(cmd, capture_output=True)
        expected = width * height * 3
        if proc.returncode != 0 or len(proc.stdout) < expected:
            continue
        out.append(
            np.frombuffer(proc.stdout[:expected], dtype=np.uint8).reshape(height, width, 3)
        )
    return out
