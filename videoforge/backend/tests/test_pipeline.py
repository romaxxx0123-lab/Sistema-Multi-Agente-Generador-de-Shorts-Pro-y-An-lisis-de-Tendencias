"""Tests del orquestador de analisis: cacheo, reanudacion y degradacion."""

from __future__ import annotations

from pathlib import Path

import pytest

from forge.analysis import pipeline
from forge.analysis.pipeline import AnalysisRun, analyze
from forge.cache import JobCache
from forge.config import Settings
from forge.errors import AnalysisError
from forge.fixtures import DEFAULT_SCENES, TOTAL_SECONDS, silent_ranges
from forge.tools import ffmpeg_bin, run


@pytest.fixture(scope="module")
def video_sin_audio(tmp_path_factory: pytest.TempPathFactory, sample_video: Path, settings: Settings) -> Path:
    out = tmp_path_factory.mktemp("mudo") / "sin_audio.mp4"
    run([ffmpeg_bin(settings), "-hide_banner", "-y", "-nostdin",
         "-i", sample_video, "-an", "-c:v", "copy", out], timeout=300)
    return out


def test_analisis_completo_del_fixture(sample_video: Path, settings: Settings) -> None:
    resultado, avisos = analyze(sample_video, settings, skip_speech=True, force={"all"})

    assert resultado.duration == pytest.approx(TOTAL_SECONDS, abs=0.2)
    assert len(resultado.shots) == len(DEFAULT_SCENES)
    assert resultado.motion is not None and resultado.motion.flow
    assert resultado.audio is not None
    assert len(resultado.audio.silences) == len(silent_ranges())
    assert resultado.transcript is None  # lo saltamos explicitamente
    # El OCR se intenta siempre; si Tesseract no esta, avisa y sigue. Cualquier
    # otro aviso si seria un problema.
    assert [a for a in avisos if "Tesseract" not in a] == []


def test_sin_tesseract_el_analisis_sigue_entero(
    sample_video: Path, settings: Settings
) -> None:
    """El OCR no es obligatorio: sin el se avisa, pero no falta nada mas."""
    from forge.analysis.ocr import tesseract_available

    resultado, avisos = analyze(sample_video, settings, skip_speech=True, force={"all"})
    if tesseract_available():
        pytest.skip("con Tesseract instalado este caso no se puede provocar")

    assert any("Tesseract" in a for a in avisos)
    assert resultado.screen_text == []
    assert resultado.shots and resultado.audio is not None


def test_con_skip_ocr_ni_siquiera_avisa(sample_video: Path, settings: Settings) -> None:
    _, avisos = analyze(sample_video, settings, skip_speech=True, skip_ocr=True)
    assert [a for a in avisos if "Tesseract" in a] == []


def test_los_planos_cubren_todo_el_video(sample_video: Path, settings: Settings) -> None:
    resultado, _ = analyze(sample_video, settings, skip_speech=True)
    assert resultado.shots[0].start == 0.0
    assert resultado.shots[-1].end == pytest.approx(resultado.duration, abs=0.2)
    for anterior, siguiente in zip(resultado.shots, resultado.shots[1:]):
        assert anterior.end == siguiente.start


def test_la_segunda_pasada_no_recalcula(
    sample_video: Path, settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Si la etapa esta cacheada no debe volver a ejecutarse."""
    analyze(sample_video, settings, skip_speech=True, force={"all"})

    def _explota(*args, **kwargs):
        raise AssertionError("no deberia recalcularse: estaba cacheado")

    monkeypatch.setattr(pipeline, "analyze_motion", _explota)
    monkeypatch.setattr(pipeline, "detect_shots", _explota)
    monkeypatch.setattr(pipeline, "analyze_audio", _explota)

    resultado, _ = analyze(sample_video, settings, skip_speech=True)
    assert len(resultado.shots) == len(DEFAULT_SCENES)


def test_force_rehace_solo_la_etapa_pedida(
    sample_video: Path, settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    analyze(sample_video, settings, skip_speech=True, force={"all"})

    llamadas: list[str] = []
    original = pipeline.analyze_motion

    def _espia(*args, **kwargs):
        llamadas.append("motion")
        return original(*args, **kwargs)

    def _no_tocar(*args, **kwargs):
        raise AssertionError("esta etapa no se pidio rehacer")

    monkeypatch.setattr(pipeline, "analyze_motion", _espia)
    monkeypatch.setattr(pipeline, "analyze_audio", _no_tocar)

    analyze(sample_video, settings, skip_speech=True, force={"motion"})
    assert llamadas == ["motion"]


def test_subir_la_version_de_una_etapa_invalida_su_cache(
    sample_video: Path, settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Un cambio de codigo no debe devolver datos viejos con formato nuevo."""
    analyze(sample_video, settings, skip_speech=True, force={"all"})

    llamadas: list[str] = []
    original = pipeline.detect_shots

    def _espia(*args, **kwargs):
        llamadas.append("shots")
        return original(*args, **kwargs)

    monkeypatch.setattr(pipeline, "detect_shots", _espia)
    monkeypatch.setitem(pipeline.STAGE_VERSIONS, "shots", 99)

    analyze(sample_video, settings, skip_speech=True)
    assert llamadas == ["shots"]


def test_un_video_sin_audio_avisa_pero_analiza(
    video_sin_audio: Path, settings: Settings
) -> None:
    resultado, avisos = analyze(video_sin_audio, settings, force={"all"})

    assert resultado.audio is None
    assert resultado.transcript is None
    assert len(resultado.shots) == len(DEFAULT_SCENES)  # el video sigue analizandose
    assert any("audio" in a.lower() for a in avisos)


def test_sin_faster_whisper_se_degrada_a_aviso(
    sample_video: Path, settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Sin transcripcion se puede montar igual: no debe tumbar el analisis."""
    from forge.analysis import speech

    def _sin_modelo(*args, **kwargs):
        raise AnalysisError("faster-whisper no esta instalado", hint="pip install")

    monkeypatch.setattr(speech, "transcribe", _sin_modelo)

    resultado, avisos = analyze(sample_video, settings, force={"transcript"})
    assert resultado.transcript is None
    assert any("transcripcion" in a.lower() for a in avisos)
    assert len(resultado.shots) == len(DEFAULT_SCENES)


def test_un_fichero_sin_video_da_error_claro(settings: Settings, tmp_path: Path, sample_video: Path) -> None:
    solo_audio = tmp_path / "solo.m4a"
    run([ffmpeg_bin(settings), "-hide_banner", "-y", "-nostdin",
         "-i", sample_video, "-vn", "-c:a", "aac", solo_audio], timeout=300)

    with pytest.raises(AnalysisError, match="no tiene pista de video"):
        analyze(solo_audio, settings)


def test_el_progreso_reporta_las_etapas(sample_video: Path, settings: Settings) -> None:
    etapas: list[str] = []
    analyze(
        sample_video,
        settings,
        skip_speech=True,
        force={"all"},
        progress=lambda stage, msg: etapas.append(stage),
    )
    assert {"probe", "proxy", "motion", "shots", "audio"} <= set(etapas)


def test_el_proxy_no_escala_hacia_arriba(sample_video: Path, settings: Settings) -> None:
    """El fixture es 360p: pedir un perfil de 1080p no debe agrandarlo."""
    from forge.config import Tier

    run_max = AnalysisRun(sample_video, settings, tier=Tier.MAX)
    info = run_max._probe(force=False)
    bundle = run_max._proxy(info, force=True)
    assert bundle.height == 360


def test_el_cache_vive_en_la_carpeta_del_video(sample_video: Path, settings: Settings) -> None:
    analyze(sample_video, settings, skip_speech=True)
    jc = JobCache(settings, sample_video)
    assert jc.has("probe", pipeline.STAGE_VERSIONS["probe"])
    assert jc.has("shots", pipeline.STAGE_VERSIONS["shots"])
