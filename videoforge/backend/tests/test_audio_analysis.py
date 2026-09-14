"""Tests del analisis de audio."""

from __future__ import annotations

from pathlib import Path

import pytest

from forge.analysis.audio import (
    analyze_audio,
    parse_loudness,
    parse_silences,
    speech_ranges,
)
from forge.analysis.types import AudioAnalysis, SilenceRange
from forge.config import Settings
from forge.fixtures import TOTAL_SECONDS, silent_ranges

SALIDA_EBUR = """
[Parsed_ebur128_1 @ 0x55] t: 1.0  M: -22.3 S: -22.1 I: -20.0 LUFS
[Parsed_ebur128_1 @ 0x55] Summary:

  Integrated loudness:
    I:         -23.4 LUFS
    Threshold: -33.9 LUFS

  Loudness range:
    LRA:         6.2 LU
    Threshold: -43.6 LUFS

  True peak:
    Peak:       -1.5 dBFS
"""


def test_parse_silences_empareja_inicio_y_fin() -> None:
    salida = (
        "[silencedetect @ 0x1] silence_start: 4.5\n"
        "[silencedetect @ 0x1] silence_end: 6.5 | silence_duration: 2.0\n"
        "[silencedetect @ 0x1] silence_start: 9.0\n"
        "[silencedetect @ 0x1] silence_end: 10.5 | silence_duration: 1.5\n"
    )
    rangos = parse_silences(salida, 12.5)
    assert [(r.start, r.end) for r in rangos] == [(4.5, 6.5), (9.0, 10.5)]


def test_silencio_abierto_al_final_se_cierra_con_la_duracion() -> None:
    """ffmpeg no imprime `silence_end` si el video acaba en silencio."""
    salida = "silence_start: 8.0\n"
    rangos = parse_silences(salida, 10.0)
    assert [(r.start, r.end) for r in rangos] == [(8.0, 10.0)]


def test_los_silencios_se_recortan_a_la_duracion() -> None:
    salida = "silence_start: 5.0\nsilence_end: 99.0\n"
    assert parse_silences(salida, 10.0)[0].end == 10.0


def test_parse_loudness_usa_el_resumen_final() -> None:
    """Los valores por bloque que ebur128 va imprimiendo no deben colarse."""
    l = parse_loudness(SALIDA_EBUR)
    assert l.integrated_lufs == -23.4  # no -20.0, que es un valor intermedio
    assert l.loudness_range == 6.2
    assert l.true_peak_db == -1.5
    assert l.threshold_lufs == -33.9


def test_parse_loudness_sin_datos_no_revienta() -> None:
    l = parse_loudness("nada util aqui")
    assert l.integrated_lufs is None


def test_speech_ranges_es_el_complemento_de_los_silencios() -> None:
    a = AudioAnalysis(
        silences=[SilenceRange(start=2.0, end=4.0), SilenceRange(start=7.0, end=8.0)]
    )
    assert speech_ranges(a, 10.0) == [(0.0, 2.0), (4.0, 7.0), (8.0, 10.0)]


def test_speech_ranges_con_margen_fusiona_solapes() -> None:
    """Un margen grande puede unir dos tramos; no deben quedar solapados."""
    a = AudioAnalysis(
        silences=[SilenceRange(start=2.0, end=2.4), SilenceRange(start=2.6, end=3.0)]
    )
    rangos = speech_ranges(a, 5.0, pad=0.5)
    assert rangos == [(0.0, 5.0)]


def test_speech_ranges_sin_silencios_devuelve_todo() -> None:
    assert speech_ranges(AudioAnalysis(), 10.0) == [(0.0, 10.0)]


def test_analisis_real_detecta_los_silencios_del_fixture(
    sample_video: Path, settings: Settings, tmp_path: Path
) -> None:
    from forge.cache import JobCache
    from forge.config import Device, Tier, resolve_model_plan
    from forge.ingest.proxy import build_proxy
    from forge.tools import probe

    info = probe(sample_video, settings)
    cache = JobCache(settings, sample_video)
    bundle = build_proxy(info, cache, settings, resolve_model_plan(Tier.LIGHT, Device.CPU))
    assert bundle.audio is not None

    resultado = analyze_audio(bundle.audio, TOTAL_SECONDS, settings)
    esperados = silent_ranges()
    assert len(resultado.silences) == len(esperados)
    for detectado, (a, b) in zip(resultado.silences, esperados):
        assert detectado.start == pytest.approx(a, abs=0.15)
        assert detectado.end == pytest.approx(b, abs=0.15)
    assert resultado.loudness.integrated_lufs is not None
