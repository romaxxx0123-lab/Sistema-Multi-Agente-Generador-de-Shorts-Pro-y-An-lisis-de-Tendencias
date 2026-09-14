"""Modelos de lo que sabemos de un fichero de entrada."""

from __future__ import annotations

from pathlib import Path

from pydantic import BaseModel


class VideoStream(BaseModel):
    index: int
    codec: str
    width: int
    height: int
    fps: float
    pix_fmt: str | None = None
    bit_rate: int | None = None
    nb_frames: int | None = None
    #: rotacion declarada en metadatos (0/90/180/270)
    rotation: int = 0

    @property
    def display_width(self) -> int:
        """Ancho tal y como se ve, ya aplicada la rotacion de metadatos."""
        return self.height if self.rotation in (90, 270) else self.width

    @property
    def display_height(self) -> int:
        return self.width if self.rotation in (90, 270) else self.height

    @property
    def aspect(self) -> float:
        return self.display_width / self.display_height if self.display_height else 0.0

    @property
    def is_vertical(self) -> bool:
        return self.aspect < 1.0


class AudioStream(BaseModel):
    index: int
    codec: str
    sample_rate: int | None = None
    channels: int | None = None
    channel_layout: str | None = None
    bit_rate: int | None = None


class MediaInfo(BaseModel):
    """Resultado de sondear el fichero. Es la entrada de todo el pipeline."""

    path: Path
    size_bytes: int
    duration: float
    format_name: str | None = None
    bit_rate: int | None = None
    video: VideoStream | None = None
    audio: AudioStream | None = None

    @property
    def has_video(self) -> bool:
        return self.video is not None

    @property
    def has_audio(self) -> bool:
        return self.audio is not None

    def summary(self) -> str:
        parts = [f"{self.duration:.2f}s"]
        if self.video:
            v = self.video
            parts.append(
                f"{v.display_width}x{v.display_height} @ {v.fps:.3f}fps {v.codec}"
            )
            if v.rotation:
                parts.append(f"rot {v.rotation}deg")
        else:
            parts.append("sin video")
        if self.audio:
            a = self.audio
            parts.append(f"audio {a.codec} {a.sample_rate}Hz {a.channels}ch")
        else:
            parts.append("sin audio")
        parts.append(f"{self.size_bytes / 1_048_576:.1f} MiB")
        return " · ".join(parts)
