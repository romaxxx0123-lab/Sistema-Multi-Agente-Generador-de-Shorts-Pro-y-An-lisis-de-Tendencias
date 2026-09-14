"""Tests de la capa de herramientas externas."""

from __future__ import annotations

from pathlib import Path

import pytest

from forge import tools
from forge.config import Device, Settings
from forge.errors import ProbeError, ToolchainError
from forge.fixtures import TOTAL_SECONDS


def test_parse_listing_ignora_la_leyenda() -> None:
    """`-filters` no separa la leyenda con guiones, asi que hay que filtrarla."""
    salida = (
        "Filters:\n"
        "  T.. = Timeline support\n"
        "  A = Audio input/output\n"
        " ... abench            A->A       Benchmark part of a filtergraph.\n"
        " TSC zoompan           V->V       Ken Burns effect.\n"
    )
    nombres = tools._parse_listing(salida)
    assert nombres == {"abench", "zoompan"}
    assert "=" not in nombres


def test_parse_listing_encoders_con_separador() -> None:
    salida = (
        "Encoders:\n"
        " V..... = Video\n"
        " ------\n"
        " V....D libx264              H.264\n"
        " A....D aac                  AAC\n"
    )
    assert tools._parse_listing(salida) == {"libx264", "aac"}


def test_capabilities_encuentra_lo_necesario(settings: Settings) -> None:
    caps = tools.capabilities(settings)
    assert caps.missing_required() == []
    assert caps.has_encoder("libx264")
    assert len(caps.filters) > 100


def test_probe_lee_el_fixture(sample_video: Path, settings: Settings) -> None:
    info = tools.probe(sample_video, settings)
    assert info.duration == pytest.approx(TOTAL_SECONDS, abs=0.2)
    assert info.has_video and info.has_audio
    assert info.video is not None and info.audio is not None
    assert (info.video.width, info.video.height) == (640, 360)
    assert info.video.fps == pytest.approx(30.0, abs=0.01)
    assert info.audio.sample_rate == 48000
    assert not info.video.is_vertical


def test_probe_fallback_sin_ffprobe(sample_video: Path, settings: Settings) -> None:
    """Sin ffprobe seguimos sacando lo esencial parseando la salida de ffmpeg."""
    info = tools._probe_with_ffmpeg(sample_video, tools.ffmpeg_bin(settings))
    assert info.duration == pytest.approx(TOTAL_SECONDS, abs=0.2)
    assert info.video is not None
    assert (info.video.width, info.video.height) == (640, 360)
    assert info.audio is not None
    assert info.audio.sample_rate == 48000


def test_probe_falla_claro_si_no_existe(settings: Settings, tmp_path: Path) -> None:
    with pytest.raises(ProbeError, match="no existe"):
        tools.probe(tmp_path / "no-esta.mp4", settings)


def test_probe_falla_claro_si_esta_vacio(settings: Settings, tmp_path: Path) -> None:
    vacio = tmp_path / "vacio.mp4"
    vacio.touch()
    with pytest.raises(ProbeError, match="vacio"):
        tools.probe(vacio, settings)


def test_binario_inexistente_da_pista(settings: Settings, tmp_path: Path) -> None:
    roto = settings.model_copy(update={"ffmpeg_path": tmp_path / "no-existe"})
    with pytest.raises(ToolchainError) as exc:
        tools.ffmpeg_bin(roto)
    assert exc.value.hint is not None


def test_device_explicito_manda(settings: Settings) -> None:
    """Si el usuario fuerza un dispositivo no lo sobreescribimos."""
    forzado = settings.model_copy(update={"device": Device.CPU})
    assert tools.effective_device(forzado) is Device.CPU


def test_rotacion_afecta_a_las_dimensiones_mostradas() -> None:
    from forge.media import VideoStream

    v = VideoStream(index=0, codec="h264", width=1920, height=1080, fps=30, rotation=90)
    assert (v.display_width, v.display_height) == (1080, 1920)
    assert v.is_vertical
