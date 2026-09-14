"""Genera videos de prueba deterministas con ffmpeg.

Los tests no deben depender de un video real del usuario ni de descargar nada.
El fixture esta construido a proposito para ejercitar el analisis:

- escenas visualmente muy distintas -> la deteccion de planos tiene que verlas;
- alternancia de escenas estaticas y con mucho movimiento -> la curva de energia
  tiene que subir y bajar;
- tramos con tono y tramos en silencio -> la deteccion de silencios y el calculo
  de sonoridad tienen material con el que trabajar.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from .config import Settings
from .tools import ffmpeg_bin, run


@dataclass(frozen=True)
class Scene:
    """Una escena del fixture: fuente de video, de audio y duracion."""

    video: str
    audio: str
    seconds: float
    #: para que los tests puedan comprobar lo que se espera de cada tramo
    label: str
    high_motion: bool
    silent: bool


#: Guion fijo del fixture. No cambiarlo a la ligera: hay tests que dependen del
#: numero de planos y de donde caen los silencios.
DEFAULT_SCENES: tuple[Scene, ...] = (
    Scene("smptebars", "sine=frequency=440", 2.0, "barras-estatica", False, False),
    Scene("testsrc2", "sine=frequency=660", 2.5, "testsrc-movimiento", True, False),
    Scene("color=c=navy", "anullsrc", 2.0, "azul-silencio", False, True),
    Scene("mandelbrot", "sine=frequency=880", 2.5, "mandelbrot-movimiento", True, False),
    Scene("color=c=darkgreen", "anullsrc", 1.5, "verde-silencio", False, True),
    Scene("rgbtestsrc", "sine=frequency=520", 2.0, "rgb-estatica", False, False),
)

TOTAL_SECONDS = sum(s.seconds for s in DEFAULT_SCENES)


def make_fixture(
    out: Path | str,
    settings: Settings | None = None,
    *,
    scenes: tuple[Scene, ...] = DEFAULT_SCENES,
    width: int = 640,
    height: int = 360,
    fps: int = 30,
    sample_rate: int = 48000,
    overwrite: bool = True,
) -> Path:
    """Crea el video de prueba en `out` y devuelve su ruta."""
    settings = settings or Settings.load()
    out = Path(out).expanduser()
    out.parent.mkdir(parents=True, exist_ok=True)
    if out.exists() and not overwrite:
        return out

    cmd: list[str] = [str(ffmpeg_bin(settings)), "-hide_banner", "-y", "-nostdin"]

    for sc in scenes:
        # Una fuente puede venir ya con opciones ("color=c=navy"); en ese caso
        # las siguientes se encadenan con ":" en vez de abrir con "=".
        sep = ":" if "=" in sc.video else "="
        cmd += [
            "-f", "lavfi",
            "-t", f"{sc.seconds}",
            "-i", f"{sc.video}{sep}size={width}x{height}:rate={fps}",
        ]
    for sc in scenes:
        src = (
            f"{sc.audio}=r={sample_rate}:cl=stereo"
            if sc.audio == "anullsrc"
            else f"{sc.audio}:sample_rate={sample_rate}"
        )
        cmd += ["-f", "lavfi", "-t", f"{sc.seconds}", "-i", src]

    n = len(scenes)
    parts = []
    # Igualamos formato de pixel y base de tiempos antes de concatenar: sin esto
    # concat falla en cuanto dos fuentes lavfi diferen.
    for i in range(n):
        parts.append(f"[{i}:v]format=yuv420p,setsar=1,fps={fps}[v{i}]")
    for i in range(n):
        parts.append(f"[{n + i}:a]aformat=sample_rates={sample_rate}:channel_layouts=stereo[a{i}]")

    vrefs = "".join(f"[v{i}]" for i in range(n))
    arefs = "".join(f"[a{i}]" for i in range(n))
    parts.append(f"{vrefs}concat=n={n}:v=1:a=0[vout]")
    parts.append(f"{arefs}concat=n={n}:v=0:a=1[aout]")

    cmd += [
        "-filter_complex", ";".join(parts),
        "-map", "[vout]",
        "-map", "[aout]",
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-crf", "20",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "128k",
        "-movflags", "+faststart",
        str(out),
    ]

    run(cmd, timeout=600)
    return out


def scene_boundaries(scenes: tuple[Scene, ...] = DEFAULT_SCENES) -> list[float]:
    """Instantes exactos donde cambia de escena (util para validar tests)."""
    bounds: list[float] = []
    t = 0.0
    for sc in scenes[:-1]:
        t += sc.seconds
        bounds.append(round(t, 3))
    return bounds


def silent_ranges(scenes: tuple[Scene, ...] = DEFAULT_SCENES) -> list[tuple[float, float]]:
    """Tramos que deberian detectarse como silencio."""
    ranges: list[tuple[float, float]] = []
    t = 0.0
    for sc in scenes:
        if sc.silent:
            ranges.append((round(t, 3), round(t + sc.seconds, 3)))
        t += sc.seconds
    return ranges
