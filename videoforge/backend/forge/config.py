"""Configuracion global: donde se cachea, que dispositivo se usa y con que calidad.

La idea central es el *perfil*: el usuario elige `light`/`balanced`/`max` (o deja
`auto`) y de ahi salen automaticamente los tamanos de modelo, el muestreo de
fotogramas y la resolucion de analisis. Asi nadie tiene que saber que modelo de
Whisper le entra en la GPU.
"""

from __future__ import annotations

import os
from enum import Enum
from pathlib import Path

from pydantic import BaseModel, Field


class Device(str, Enum):
    AUTO = "auto"
    CUDA = "cuda"
    CPU = "cpu"


class Tier(str, Enum):
    """Cuanta calidad de analisis pedimos, a costa de tiempo."""

    LIGHT = "light"
    BALANCED = "balanced"
    MAX = "max"


class ModelPlan(BaseModel):
    """Parametros de analisis ya resueltos para un (tier, device) concreto."""

    tier: Tier
    device: Device
    whisper_model: str
    whisper_compute: str
    clip_model: str
    #: segundos entre fotogramas muestreados para vision/OCR
    frame_stride: float
    #: altura del proxy de analisis (el render final usa el original)
    analysis_height: int
    #: segundos por trozo al analizar en modo reanudable
    chunk_seconds: float

    def describe(self) -> str:
        return (
            f"{self.tier.value}/{self.device.value} · whisper={self.whisper_model}"
            f" ({self.whisper_compute}) · clip={self.clip_model}"
            f" · 1 frame/{self.frame_stride:g}s · proxy {self.analysis_height}p"
        )


#: Tabla de perfiles. Se resuelve el compute type segun el dispositivo real.
_TIER_TABLE: dict[Tier, dict] = {
    Tier.LIGHT: dict(
        whisper_model="base",
        clip_model="ViT-B-32",
        frame_stride=2.0,
        analysis_height=480,
        chunk_seconds=300.0,
    ),
    Tier.BALANCED: dict(
        whisper_model="small",
        clip_model="ViT-B-32",
        frame_stride=1.0,
        analysis_height=720,
        chunk_seconds=420.0,
    ),
    Tier.MAX: dict(
        whisper_model="large-v3",
        clip_model="ViT-L-14",
        frame_stride=0.5,
        analysis_height=1080,
        chunk_seconds=600.0,
    ),
}


def resolve_model_plan(tier: Tier, device: Device) -> ModelPlan:
    """Convierte (tier, device) en parametros concretos de analisis."""
    row = dict(_TIER_TABLE[tier])
    # En GPU float16 es mas rapido y cabe de sobra; en CPU int8 es la unica
    # opcion razonable en tiempo.
    if device is Device.CUDA:
        compute = "float16" if tier is Tier.MAX else "int8_float16"
    else:
        compute = "int8"
    return ModelPlan(tier=tier, device=device, whisper_compute=compute, **row)


def _default_cache_dir() -> Path:
    env = os.environ.get("FORGE_CACHE_DIR")
    if env:
        return Path(env).expanduser()
    base = os.environ.get("XDG_CACHE_HOME")
    root = Path(base).expanduser() if base else Path.home() / ".cache"
    return root / "videoforge"


class Settings(BaseModel):
    """Ajustes efectivos de una ejecucion."""

    cache_dir: Path = Field(default_factory=_default_cache_dir)
    work_dir: Path = Field(default_factory=lambda: Path.cwd() / "work")
    device: Device = Device.AUTO
    tier: Tier = Tier.BALANCED
    #: rutas explicitas a los binarios; si son None se autodetectan
    ffmpeg_path: Path | None = None
    ffprobe_path: Path | None = None
    #: 0 = que ffmpeg decida
    threads: int = 0
    #: huella rapida (muestreo) en vez de sha256 completo: importante en
    #: ficheros de varios GB, donde hashear entero cuesta mas que analizar.
    fast_fingerprint: bool = True

    @classmethod
    def load(cls) -> "Settings":
        """Construye los ajustes desde variables de entorno FORGE_*."""
        data: dict = {}
        if v := os.environ.get("FORGE_CACHE_DIR"):
            data["cache_dir"] = Path(v).expanduser()
        if v := os.environ.get("FORGE_WORK_DIR"):
            data["work_dir"] = Path(v).expanduser()
        if v := os.environ.get("FORGE_DEVICE"):
            data["device"] = Device(v.lower())
        if v := os.environ.get("FORGE_TIER"):
            data["tier"] = Tier(v.lower())
        if v := os.environ.get("FORGE_FFMPEG"):
            data["ffmpeg_path"] = Path(v).expanduser()
        if v := os.environ.get("FORGE_FFPROBE"):
            data["ffprobe_path"] = Path(v).expanduser()
        if v := os.environ.get("FORGE_THREADS"):
            data["threads"] = int(v)
        if v := os.environ.get("FORGE_FULL_HASH"):
            data["fast_fingerprint"] = v.lower() not in ("1", "true", "yes")
        return cls(**data)

    @property
    def bin_dir(self) -> Path:
        """Donde `forge setup` deja binarios descargados."""
        return self.cache_dir / "bin"

    @property
    def models_dir(self) -> Path:
        return self.cache_dir / "models"

    @property
    def jobs_dir(self) -> Path:
        return self.cache_dir / "jobs"

    def ensure_dirs(self) -> None:
        for d in (self.cache_dir, self.bin_dir, self.models_dir, self.jobs_dir):
            d.mkdir(parents=True, exist_ok=True)
