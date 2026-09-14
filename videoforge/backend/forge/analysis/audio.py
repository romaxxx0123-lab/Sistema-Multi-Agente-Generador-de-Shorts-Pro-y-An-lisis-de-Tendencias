"""Analisis de audio: silencios y sonoridad.

Los silencios son la funcion de mayor impacto del proyecto en formato largo: en
una guia de 20 minutos, quitar el tiempo muerto recorta facilmente un 15-25% de
duracion sin perder una sola palabra. Por eso detectarlos bien no es un detalle.

**Por que no se usa `silencedetect` de ffmpeg.** Mide el *pico* de la senal, no
su valor eficaz. El ruido de sala de cualquier grabacion real es ruido casi
gaussiano, cuyos picos quedan unos 12 dB por encima de su RMS: un fondo que
suena a -36 dB RMS tiene picos a -24 dB. Con un umbral fijo razonable, por
ejemplo -32 dB, `silencedetect` **no encuentra un solo silencio** en una
grabacion normal. Solo funciona con silencio digital perfecto, que no existe
fuera de un fichero sintetico.

Aqui se miden ventanas de RMS y se elige el umbral **a partir del propio
audio**: se estiman el suelo de ruido y el nivel de voz, y se corta entre los
dos. Asi funciona igual con un microfono silencioso que con uno ruidoso.

La sonoridad si se mide con `ebur128` de ffmpeg, que implementa el estandar.
"""

from __future__ import annotations

import re
import wave
from pathlib import Path

import numpy as np

from ..config import Settings
from ..tools import ffmpeg_bin, run
from .types import AudioAnalysis, Loudness, SilenceRange

#: Umbral de respaldo, solo para grabaciones donde no se distingue voz de fondo.
DEFAULT_NOISE_DB = -32.0
#: Pausas mas cortas que esto son el ritmo natural del habla, no tiempo muerto.
DEFAULT_MIN_SILENCE = 0.35
#: Ventana de medida del RMS. 20 ms es el orden de un fonema.
RMS_WINDOW_SECONDS = 0.02
#: Percentiles con los que se estiman el suelo de ruido y el nivel de voz.
FLOOR_PERCENTILE = 10
SPEECH_PERCENTILE = 90
#: Separacion minima entre fondo y voz para fiarse de la estimacion.
MIN_SEPARATION_DB = 10.0
#: Donde se pone el corte entre los dos niveles. Mas cerca del fondo que de la
#: voz, para no comerse el final flojo de las palabras.
THRESHOLD_POSITION = 0.25
#: Margenes de seguridad respecto a cada nivel.
MARGIN_ABOVE_FLOOR_DB = 4.0
MARGIN_BELOW_SPEECH_DB = 6.0

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


def read_window_levels(
    wav_path: Path, *, window_seconds: float = RMS_WINDOW_SECONDS
) -> tuple[np.ndarray, float]:
    """Nivel RMS en dB de cada ventana del audio, y su duracion.

    Lee el WAV por trozos para que un audio de veinte minutos no tenga que caber
    entero en memoria.
    """
    with wave.open(str(wav_path), "rb") as fh:
        canales = fh.getnchannels()
        ancho = fh.getsampwidth()
        tasa = fh.getframerate()
        total = fh.getnframes()

        if ancho != 2:
            raise ValueError(f"se esperaba PCM de 16 bits, no de {ancho * 8}")

        por_ventana = max(1, int(window_seconds * tasa))
        niveles: list[float] = []
        resto = np.empty(0, dtype=np.float32)

        while True:
            crudo = fh.readframes(por_ventana * 512)
            if not crudo:
                break
            muestras = np.frombuffer(crudo, dtype=np.int16).astype(np.float32) / 32768.0
            if canales > 1:
                muestras = muestras.reshape(-1, canales).mean(axis=1)

            datos = np.concatenate([resto, muestras]) if resto.size else muestras
            completas = len(datos) // por_ventana
            if completas:
                bloque = datos[: completas * por_ventana].reshape(completas, por_ventana)
                rms = np.sqrt((bloque**2).mean(axis=1))
                niveles.extend((20.0 * np.log10(rms + 1e-9)).tolist())
            resto = datos[completas * por_ventana :]

    duracion = total / tasa if tasa else 0.0
    return np.asarray(niveles, dtype=np.float32), duracion


def choose_threshold_db(levels: np.ndarray) -> tuple[float, float, float]:
    """Elige el umbral de silencio a partir del propio audio.

    Devuelve (umbral, suelo de ruido, nivel de voz), todo en dB.
    """
    if levels.size == 0:
        return DEFAULT_NOISE_DB, DEFAULT_NOISE_DB, 0.0

    suelo = float(np.percentile(levels, FLOOR_PERCENTILE))
    voz = float(np.percentile(levels, SPEECH_PERCENTILE))

    # Sin separacion clara no hay dos poblaciones que separar: puede ser musica
    # continua, ruido constante o un audio ya muy comprimido. En ese caso es mas
    # honesto usar un umbral fijo conservador que inventarse uno.
    if voz - suelo < MIN_SEPARATION_DB:
        return DEFAULT_NOISE_DB, suelo, voz

    umbral = suelo + (voz - suelo) * THRESHOLD_POSITION
    umbral = max(umbral, suelo + MARGIN_ABOVE_FLOOR_DB)
    umbral = min(umbral, voz - MARGIN_BELOW_SPEECH_DB)
    return float(umbral), suelo, voz


def find_silences(
    levels: np.ndarray,
    window_seconds: float,
    threshold_db: float,
    min_silence: float,
    duration: float,
) -> list[SilenceRange]:
    """Tramos continuos por debajo del umbral que duran lo suficiente."""
    if levels.size == 0:
        return []

    bajo = levels < threshold_db
    minimo_ventanas = max(1, int(round(min_silence / window_seconds)))

    rangos: list[SilenceRange] = []
    inicio: int | None = None
    for i, silencioso in enumerate(bajo):
        if silencioso and inicio is None:
            inicio = i
        elif not silencioso and inicio is not None:
            if i - inicio >= minimo_ventanas:
                rangos.append(
                    SilenceRange(
                        start=round(inicio * window_seconds, 3),
                        end=round(min(duration, i * window_seconds), 3),
                    )
                )
            inicio = None
    if inicio is not None and len(bajo) - inicio >= minimo_ventanas:
        rangos.append(
            SilenceRange(start=round(inicio * window_seconds, 3), end=round(duration, 3))
        )

    return rangos


def measure_loudness(audio_path: Path, settings: Settings) -> Loudness:
    """Sonoridad EBU R128 con ffmpeg, que implementa el estandar."""
    proc = run(
        [
            ffmpeg_bin(settings), "-hide_banner", "-nostdin",
            "-i", audio_path,
            "-af", "ebur128=peak=true",
            "-f", "null", "-",
        ],
        timeout=None,
        check=False,
    )
    return parse_loudness(proc.stderr or "")


def analyze_audio(
    audio_path: Path,
    duration: float,
    settings: Settings,
    *,
    noise_db: float | None = None,
    min_silence: float = DEFAULT_MIN_SILENCE,
) -> AudioAnalysis:
    """Detecta silencios y mide sonoridad.

    Si no se fuerza `noise_db`, el umbral se deduce del propio audio.
    """
    niveles, duracion_wav = read_window_levels(audio_path)
    duracion = duracion_wav or duration

    if noise_db is None:
        umbral, _suelo, _voz = choose_threshold_db(niveles)
    else:
        umbral = noise_db

    silencios = find_silences(niveles, RMS_WINDOW_SECONDS, umbral, min_silence, duracion)

    return AudioAnalysis(
        silences=silencios,
        loudness=measure_loudness(audio_path, settings),
        silence_threshold_db=round(umbral, 2),
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
