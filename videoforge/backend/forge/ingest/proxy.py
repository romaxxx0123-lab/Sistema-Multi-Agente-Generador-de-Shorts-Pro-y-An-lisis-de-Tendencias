"""Prepara el material de trabajo: un proxy ligero y el audio suelto.

Analizar directamente un fichero de 20 minutos en 4K es tirar tiempo: la
deteccion de planos, el flujo optico y la vision no ganan nada con esa
resolucion. Generamos una vez un proxy pequeno y un WAV mono a 16 kHz (lo que
espera Whisper) y todo el analisis trabaja sobre ellos.

**El render final nunca usa el proxy**: parte siempre del fichero original.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from ..cache import JobCache
from ..config import ModelPlan, Settings
from ..media import MediaInfo
from ..tools import ffmpeg_bin, run

#: Mas de esto no aporta al analisis y encarece cada etapa.
MAX_ANALYSIS_FPS = 30.0
#: Whisper trabaja a 16 kHz mono; darle mas es desperdiciar disco.
SPEECH_SAMPLE_RATE = 16000


@dataclass
class ProxyBundle:
    """Material derivado listo para analizar."""

    video: Path
    audio: Path | None
    height: int
    fps: float
    duration: float

    @property
    def has_audio(self) -> bool:
        return self.audio is not None and self.audio.is_file()


def _target_height(info: MediaInfo, plan: ModelPlan) -> int:
    """Altura del proxy, sin escalar nunca hacia arriba."""
    if not info.video:
        return plan.analysis_height
    src = info.video.display_height
    return min(plan.analysis_height, src) if src else plan.analysis_height


def _target_fps(info: MediaInfo) -> float:
    src = info.video.fps if info.video and info.video.fps else MAX_ANALYSIS_FPS
    return min(MAX_ANALYSIS_FPS, src) if src > 0 else MAX_ANALYSIS_FPS


def _usable(path: Path) -> bool:
    return path.is_file() and path.stat().st_size > 1024


def build_proxy(
    info: MediaInfo,
    cache: JobCache,
    settings: Settings,
    plan: ModelPlan,
    *,
    force: bool = False,
) -> ProxyBundle:
    """Genera (o reutiliza) el proxy de video y el WAV de audio."""
    ffmpeg = ffmpeg_bin(settings)
    height = _target_height(info, plan)
    fps = _target_fps(info)

    proxy = cache.artifact(f"proxy_{height}p.mp4")
    if force or not _usable(proxy):
        cmd = [
            ffmpeg, "-hide_banner", "-y", "-nostdin",
            "-i", info.path,
            # -2 mantiene la proporcion y garantiza ancho par, que x264 exige.
            "-vf", f"scale=-2:{height}:flags=bilinear",
            "-r", f"{fps:g}",
            "-an",
            "-c:v", "libx264",
            "-preset", "veryfast",
            "-crf", "26",
            "-pix_fmt", "yuv420p",
            "-movflags", "+faststart",
            proxy,
        ]
        if settings.threads:
            cmd[3:3] = ["-threads", str(settings.threads)]
        run(cmd, timeout=None)

    audio: Path | None = None
    if info.has_audio:
        audio = cache.artifact("audio_16k.wav")
        if force or not _usable(audio):
            run(
                [
                    ffmpeg, "-hide_banner", "-y", "-nostdin",
                    "-i", info.path,
                    "-vn",
                    "-ac", "1",
                    "-ar", str(SPEECH_SAMPLE_RATE),
                    "-c:a", "pcm_s16le",
                    audio,
                ],
                timeout=None,
            )

    return ProxyBundle(
        video=proxy,
        audio=audio,
        height=height,
        fps=fps,
        duration=info.duration,
    )
