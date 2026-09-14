"""Efectos de sonido sintetizados en el momento.

Se generan proceduralmente con numpy en vez de distribuir ficheros de audio.
No es una limitacion: es la unica forma de que el proyecto traiga efectos sin
arrastrar un problema de licencias, y ademas permite afinarlos (mas grave, mas
largo) sin buscar otro fichero.

Son los cuatro que de verdad se usan al montar: barrido, golpe, subida y clic.
"""

from __future__ import annotations

import struct
import wave
from pathlib import Path

import numpy as np

SAMPLE_RATE = 48000


def _envelope(n: int, attack: float, decay: float, sample_rate: int) -> np.ndarray:
    """Envolvente de ataque y caida exponencial."""
    t = np.arange(n) / sample_rate
    total = n / sample_rate
    ataque = np.clip(t / max(attack, 1e-4), 0.0, 1.0)
    caida = np.exp(-np.maximum(0.0, t - attack) / max(decay, 1e-4))
    # Rampa final para que no quede un corte seco al acabar la muestra.
    salida = np.clip((total - t) / 0.01, 0.0, 1.0)
    return (ataque * caida * salida).astype(np.float32)


def _noise(n: int, seed: int) -> np.ndarray:
    return np.random.default_rng(seed).standard_normal(n).astype(np.float32)


def _one_pole_lowpass(x: np.ndarray, cutoff_hz: np.ndarray, sample_rate: int) -> np.ndarray:
    """Filtro paso bajo de un polo con frecuencia de corte variable.

    Un barrido de corte sobre ruido es exactamente lo que suena a "whoosh", y
    con un polo basta: lo que importa es el movimiento, no la pendiente.
    """
    alpha = 1.0 - np.exp(-2.0 * np.pi * np.clip(cutoff_hz, 20.0, sample_rate / 2.2) / sample_rate)
    salida = np.zeros_like(x)
    acumulado = 0.0
    for i in range(len(x)):
        acumulado += alpha[i] * (x[i] - acumulado)
        salida[i] = acumulado
    return salida


def whoosh(seconds: float = 0.45, sample_rate: int = SAMPLE_RATE, seed: int = 1) -> np.ndarray:
    """Barrido de aire: ruido con el corte subiendo y bajando."""
    n = int(seconds * sample_rate)
    corte = 400.0 + 6000.0 * np.sin(np.linspace(0, np.pi, n)) ** 2
    senal = _one_pole_lowpass(_noise(n, seed), corte, sample_rate)
    return senal * _envelope(n, 0.08, 0.18, sample_rate)


def impact(seconds: float = 0.35, sample_rate: int = SAMPLE_RATE, seed: int = 2) -> np.ndarray:
    """Golpe: seno grave que cae de tono, con un poco de ruido al ataque."""
    n = int(seconds * sample_rate)
    t = np.arange(n) / sample_rate
    frecuencia = 110.0 * np.exp(-t * 9.0) + 38.0
    cuerpo = np.sin(2 * np.pi * np.cumsum(frecuencia) / sample_rate).astype(np.float32)
    chasquido = _noise(n, seed) * np.exp(-t * 60.0)
    return (cuerpo * 0.85 + chasquido * 0.25) * _envelope(n, 0.002, 0.10, sample_rate)


def riser(seconds: float = 1.2, sample_rate: int = SAMPLE_RATE, seed: int = 3) -> np.ndarray:
    """Subida de tension: tono ascendente con ruido filtrado encima."""
    n = int(seconds * sample_rate)
    t = np.arange(n) / sample_rate
    frecuencia = 180.0 * np.exp(t / max(seconds, 1e-6) * 1.6)
    tono = np.sin(2 * np.pi * np.cumsum(frecuencia) / sample_rate).astype(np.float32)
    corte = 500.0 + 5000.0 * (t / max(seconds, 1e-6))
    aire = _one_pole_lowpass(_noise(n, seed), corte, sample_rate)
    subida = (t / max(seconds, 1e-6)).astype(np.float32)
    return (tono * 0.45 + aire * 0.5) * subida * _envelope(n, 0.05, 4.0, sample_rate)


def pop(seconds: float = 0.12, sample_rate: int = SAMPLE_RATE, seed: int = 4) -> np.ndarray:
    """Clic breve, para acompanar la aparicion de un rotulo."""
    n = int(seconds * sample_rate)
    t = np.arange(n) / sample_rate
    frecuencia = 900.0 * np.exp(-t * 25.0) + 300.0
    tono = np.sin(2 * np.pi * np.cumsum(frecuencia) / sample_rate).astype(np.float32)
    return tono * _envelope(n, 0.001, 0.03, sample_rate)


#: Catalogo disponible.
GENERATORS = {
    "whoosh": whoosh,
    "impact": impact,
    "riser": riser,
    "pop": pop,
}


def normalize(signal: np.ndarray, peak: float = 0.89) -> np.ndarray:
    """Ajusta el pico sin llegar a 1.0, para no saturar al convertir a entero."""
    maximo = float(np.max(np.abs(signal))) if signal.size else 0.0
    if maximo < 1e-9:
        return signal
    return (signal / maximo * peak).astype(np.float32)


def write_wav(signal: np.ndarray, path: Path, sample_rate: int = SAMPLE_RATE) -> Path:
    """Escribe la senal como WAV PCM de 16 bits."""
    path.parent.mkdir(parents=True, exist_ok=True)
    muestras = np.clip(normalize(signal), -1.0, 1.0)
    enteros = (muestras * 32767.0).astype(np.int16)

    with wave.open(str(path), "wb") as fh:
        fh.setnchannels(1)
        fh.setsampwidth(2)
        fh.setframerate(sample_rate)
        fh.writeframes(struct.pack(f"<{len(enteros)}h", *enteros.tolist()))
    return path


def ensure_sfx(cache_dir: Path, name: str, sample_rate: int = SAMPLE_RATE) -> Path:
    """Devuelve el WAV del efecto, generandolo la primera vez."""
    if name not in GENERATORS:
        raise KeyError(f"efecto de sonido desconocido: {name}")

    destino = cache_dir / "sfx" / f"{name}.wav"
    if destino.is_file() and destino.stat().st_size > 1000:
        return destino
    return write_wav(GENERATORS[name](sample_rate=sample_rate), destino, sample_rate)


def ensure_all(cache_dir: Path) -> dict[str, Path]:
    """Genera todo el catalogo."""
    return {nombre: ensure_sfx(cache_dir, nombre) for nombre in GENERATORS}
