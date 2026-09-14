"""Utilidades comunes de los tests.

El video de prueba se genera una sola vez por sesion: crearlo cuesta unos
segundos y todos los tests pueden compartirlo sin tocarlo.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from forge.config import Settings
from forge.fixtures import make_fixture


@pytest.fixture(scope="session")
def settings(tmp_path_factory: pytest.TempPathFactory) -> Settings:
    """Ajustes aislados: el cache va a un directorio temporal, no al del usuario.

    Los binarios se resuelven ANTES de mover el cache y se fijan explicitamente.
    Si no, al apuntar `cache_dir` a un temporal vacio se perderia el ffprobe que
    vive en el cache real, y los tests acabarian ejercitando el camino de
    respaldo en vez del principal sin que nadie se entere.
    """
    from forge.tools import ffmpeg_bin, ffprobe_bin

    real = Settings.load()
    ffmpeg = ffmpeg_bin(real)
    ffprobe = ffprobe_bin(real)

    cache = tmp_path_factory.mktemp("forge-cache")
    s = real.model_copy(
        update={"cache_dir": cache, "ffmpeg_path": ffmpeg, "ffprobe_path": ffprobe}
    )
    s.ensure_dirs()
    return s


@pytest.fixture(scope="session")
def sample_video(tmp_path_factory: pytest.TempPathFactory, settings: Settings) -> Path:
    out = tmp_path_factory.mktemp("media") / "fixture.mp4"
    return make_fixture(out, settings)
