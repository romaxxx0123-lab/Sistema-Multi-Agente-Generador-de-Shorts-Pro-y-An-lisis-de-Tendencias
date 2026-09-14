"""Tests del generador de video sintetico."""

from __future__ import annotations

from pathlib import Path

import pytest

from forge import tools
from forge.config import Settings
from forge.fixtures import (
    DEFAULT_SCENES,
    TOTAL_SECONDS,
    scene_boundaries,
    silent_ranges,
)


def test_el_fixture_dura_lo_previsto(sample_video: Path, settings: Settings) -> None:
    info = tools.probe(sample_video, settings)
    assert info.duration == pytest.approx(TOTAL_SECONDS, abs=0.2)


def test_los_cortes_caen_dentro_del_video() -> None:
    bounds = scene_boundaries()
    assert len(bounds) == len(DEFAULT_SCENES) - 1
    assert all(0 < b < TOTAL_SECONDS for b in bounds)
    assert bounds == sorted(bounds)


def test_hay_tramos_de_silencio_y_de_sonido() -> None:
    """El analisis de audio necesita las dos cosas para poder distinguirlas."""
    silencios = silent_ranges()
    assert silencios, "el fixture debe tener silencios"
    duracion_silencio = sum(b - a for a, b in silencios)
    assert 0 < duracion_silencio < TOTAL_SECONDS


def test_hay_escenas_con_y_sin_movimiento() -> None:
    assert any(s.high_motion for s in DEFAULT_SCENES)
    assert any(not s.high_motion for s in DEFAULT_SCENES)


def test_el_fixture_es_reproducible(tmp_path: Path, settings: Settings) -> None:
    """Dos generaciones seguidas deben dar el mismo material analizable."""
    from forge.fixtures import make_fixture

    a = make_fixture(tmp_path / "a.mp4", settings)
    b = make_fixture(tmp_path / "b.mp4", settings)
    ia, ib = tools.probe(a, settings), tools.probe(b, settings)
    assert ia.duration == pytest.approx(ib.duration, abs=0.05)
    assert ia.video and ib.video
    assert (ia.video.width, ia.video.height) == (ib.video.width, ib.video.height)
