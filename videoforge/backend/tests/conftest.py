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
    """Ajustes aislados: el cache va a un directorio temporal, no al del usuario."""
    cache = tmp_path_factory.mktemp("forge-cache")
    s = Settings.load()
    s = s.model_copy(update={"cache_dir": cache})
    s.ensure_dirs()
    return s


@pytest.fixture(scope="session")
def sample_video(tmp_path_factory: pytest.TempPathFactory, settings: Settings) -> Path:
    out = tmp_path_factory.mktemp("media") / "fixture.mp4"
    return make_fixture(out, settings)
