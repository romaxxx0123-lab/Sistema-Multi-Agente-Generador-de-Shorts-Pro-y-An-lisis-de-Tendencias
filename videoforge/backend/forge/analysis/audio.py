"""Analisis de audio: silencios y sonoridad, en una sola pasada de ffmpeg.

No hace falta ninguna libreria de audio para esto: `silencedetect` y `ebur128`
vienen en cualquier build de ffmpeg y son justo las dos medidas que necesita el
montaje.

Los silencios son la funcion de mayor impacto del proyecto en formato largo: en
una guia de 20 minutos, quitar el tiempo muerto recorta facilmente un 15-25% de
duracion sin perder una sola palabra.
"""

from __future__ import annotations

import re
from pathlib import Path

from ..config import Settings
from ..tools import ffmpeg_bin, run
from .types import AudioAnalysis, Loudness, SilenceRange

#: Umbral de silencio. -32 dB deja pasar la respiracion y el ruido de sala pero
#: marca las pausas reales entre frases.
DEFAULT_NOISE_DB = -32.0
#: Pausas mas cortas que esto son el ritmo natural del habla, no tiempo muerto.
DEFAULT_MIN_SILENCE = 0.35

_SILENCE_START = re.compile(r"silence_start:\s*(-?[\d.]+)")
_SILENCE_END = re.compile(r"silence_end:\s*(-?[\d.]+)")
_EBUR_I = re.compile(r"^\s*I:\s*(-?[\d.]+)\s*LUFS", re.MULTILINE)
_EBUR_THRESH = re.compile(r"^\s*Threshold:\s*(-?[\d.]+)\s*LUFS", re.MULTILINE)
_EBUR_LRA = re.compile(r"^\s*LRA:\s*(-?[\d.]+)\s*LU", re.MULTILINE)
_EBUR_PEAK = re.compile(r"^\s*Peak:\s*(-?[\d.]+)\s*dBFS", re.MULTILINE)


def _first_float(pattern: re.Pattern[str], text: str) -> float | None:
    m = pattern.search(text)
    if not m:
        return None
    try:
        return float(m.group(1))
    except ValueError:
        return None


def parse_silences(stderr: str, duration: float) -> list[SilenceRange]:
    """Empareja los `silence_start` / `silence_end` que imprime ffmpeg."""
    starts = [float(m) for m in _SILENCE_START.findall(stderr)]
    ends = [float(m) for m in _SILENCE_END.findall(stderr)]

    ranges: list[SilenceRange] = []
    for i, start in enumerate(starts):
        # Un silencio que llega al final del fichero no tiene `silence_end`.
        end = ends[i] if i < len(ends) else duration
        start = max(0.0, start)
        end = min(duration, end)
        if end > start:
            ranges.append(SilenceRange(start=round(start, 3), end=round(end, 3)))
    return ranges


def parse_loudness(stderr: str) -> Loudness:
    """Lee el bloque `Summary` de ebur128."""
    # El resumen va al final; nos quedamos con esa parte para que los valores
    # por bloque que ebur128 imprime durante el analisis no confundan al regex.
    tail = stderr[stderr.rfind("Summary:") :] if "Summary:" in stderr else stderr
    return Loudness(
        integrated_lufs=_first_float(_EBUR_I, tail),
        loudness_range=_first_float(_EBUR_LRA, tail),
        true_peak_db=_first_float(_EBUR_PEAK, tail),
        threshold_lufs=_first_float(_EBUR_THRESH, tail),
    )


def analyze_audio(
    audio_path: Path,
    duration: float,
    settings: Settings,
    *,
    noise_db: float = DEFAULT_NOISE_DB,
    min_silence: float = DEFAULT_MIN_SILENCE,
) -> AudioAnalysis:
    """Detecta silencios y mide sonoridad en una sola pasada."""
    proc = run(
        [
            ffmpeg_bin(settings),
            "-hide_banner", "-nostdin",
            "-i", audio_path,
            "-af",
            f"silencedetect=noise={noise_db}dB:d={min_silence},ebur128=peak=true",
            "-f", "null",
            "-",
        ],
        timeout=None,
        check=False,
    )
    stderr = proc.stderr or ""
    return AudioAnalysis(
        silences=parse_silences(stderr, duration),
        loudness=parse_loudness(stderr),
        silence_threshold_db=noise_db,
    )


def speech_ranges(
    analysis: AudioAnalysis, duration: float, *, pad: float = 0.0
) -> list[tuple[float, float]]:
    """El complemento de los silencios: donde si hay sonido.

    `pad` ensancha cada tramo para no cortar el ataque de la primera palabra ni
    la cola de la ultima, que es el error tipico al recortar por silencios.
    """
    ranges: list[tuple[float, float]] = []
    cursor = 0.0
    for s in analysis.silences:
        if s.start > cursor:
            ranges.append((cursor, s.start))
        cursor = max(cursor, s.end)
    if cursor < duration:
        ranges.append((cursor, duration))

    if pad:
        ranges = [(max(0.0, a - pad), min(duration, b + pad)) for a, b in ranges]
        merged: list[tuple[float, float]] = []
        for a, b in ranges:
            if merged and a <= merged[-1][1]:
                merged[-1] = (merged[-1][0], max(merged[-1][1], b))
            else:
                merged.append((a, b))
        ranges = merged

    return [(round(a, 3), round(b, 3)) for a, b in ranges if b > a]
