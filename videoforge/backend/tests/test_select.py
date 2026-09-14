"""Tests de la seleccion: que entra en el montaje y que se recorta."""

from __future__ import annotations

import pytest

from forge.analysis.types import (
    Analysis,
    AudioAnalysis,
    SilenceRange,
    Transcript,
    TranscriptSegment,
    Word,
)
from forge.media import MediaInfo, VideoStream
from forge.plan.select import _merge, _subtract, plan_selection
from forge.plan.styles import PacingRules, load_style


def _analysis(duration=30.0, silences=None, words=None) -> Analysis:
    media = MediaInfo(
        path="a.mp4", size_bytes=1, duration=duration,
        video=VideoStream(index=0, codec="h264", width=1920, height=1080, fps=30),
    )
    transcript = None
    if words is not None:
        transcript = Transcript(
            language="es",
            segments=[TranscriptSegment(start=0, end=duration, text="x", words=words)],
        )
    return Analysis(
        media=media,
        audio=AudioAnalysis(silences=[SilenceRange(start=a, end=b) for a, b in (silences or [])]),
        transcript=transcript,
    )


# -- utilidades de intervalos ---------------------------------------------


def test_merge_fusiona_solapes() -> None:
    assert _merge([(0, 2), (1, 3), (5, 6)]) == [(0, 3), (5, 6)]


def test_merge_lista_vacia() -> None:
    assert _merge([]) == []


def test_subtract_parte_un_intervalo_en_dos() -> None:
    assert _subtract([(0, 10)], [(4, 6)]) == [(0, 4), (6, 10)]


def test_subtract_elimina_si_lo_cubre_entero() -> None:
    assert _subtract([(2, 5)], [(0, 10)]) == []


def test_subtract_sin_solape_no_cambia_nada() -> None:
    assert _subtract([(0, 3)], [(5, 8)]) == [(0, 3)]


# -- recorte de silencios --------------------------------------------------


def test_sin_silencios_se_conserva_todo() -> None:
    sel = plan_selection(_analysis(), load_style("tutorial").pacing)
    assert sel.keeps == [(0.0, 30.0)]
    assert sel.removals == []


def test_recorta_un_silencio_largo_dejando_pausa() -> None:
    sel = plan_selection(_analysis(silences=[(10.0, 14.0)]), load_style("tutorial").pacing)
    quitado = sel.removed_seconds
    assert 0 < quitado < 4.0, "debe quedar algo de pausa, no cortarse en seco"
    assert sel.kept_seconds == pytest.approx(30.0 - quitado, abs=0.01)


def test_no_recorta_una_pausa_corta() -> None:
    """Las pausas breves son el ritmo del habla, no tiempo muerto."""
    sel = plan_selection(_analysis(silences=[(10.0, 10.3)]), load_style("tutorial").pacing)
    assert sel.removals == []


def test_un_estilo_puede_no_recortar_nada() -> None:
    sel = plan_selection(_analysis(silences=[(10.0, 20.0)]), load_style("cinematic").pacing)
    assert sel.keeps == [(0.0, 30.0)]


# -- proteccion de palabras ------------------------------------------------


def test_una_palabra_dentro_de_un_silencio_no_se_corta() -> None:
    """El silencio es acustico; si la transcripcion ve una palabra ahi, manda."""
    palabra = Word(start=12.0, end=12.5, text="bajito")
    sel = plan_selection(
        _analysis(silences=[(10.0, 16.0)], words=[palabra]),
        load_style("tutorial").pacing,
    )
    for r in sel.removals:
        assert not (r.start < palabra.end and r.end > palabra.start), (
            f"el recorte {r.start}-{r.end} se come la palabra"
        )


def test_la_proteccion_parte_el_recorte_en_dos() -> None:
    palabra = Word(start=13.0, end=13.4, text="hola")
    sel = plan_selection(
        _analysis(silences=[(10.0, 18.0)], words=[palabra]),
        load_style("tutorial").pacing,
    )
    assert len(sel.removals) == 2


# -- muletillas ------------------------------------------------------------


def test_quita_muletillas_cuando_el_estilo_lo_pide() -> None:
    words = [Word(start=5.0, end=5.3, text="eh"), Word(start=6.0, end=6.5, text="seguimos")]
    sel = plan_selection(_analysis(words=words), load_style("tutorial").pacing)
    assert any(r.reason == "muletilla" for r in sel.removals)


def test_no_quita_muletillas_si_el_estilo_no_lo_pide() -> None:
    words = [Word(start=5.0, end=5.3, text="eh")]
    reglas = PacingRules(remove_fillers=False, remove_silence=False)
    assert plan_selection(_analysis(words=words), reglas).removals == []


def test_una_palabra_normal_nunca_se_confunde_con_muletilla() -> None:
    words = [Word(start=5.0, end=5.6, text="este")]  # 'este' SI es muletilla en es
    otras = [Word(start=7.0, end=7.6, text="motor")]
    sel = plan_selection(_analysis(words=words + otras), load_style("tutorial").pacing)
    for r in sel.removals:
        assert not (r.start < 7.6 and r.end > 7.0)


# -- microcortes -----------------------------------------------------------


def test_no_deja_fragmentos_mas_cortos_que_el_minimo() -> None:
    """Dos recortes muy juntos dejarian un trozo inutil en medio."""
    reglas = PacingRules(
        remove_silence=True, silence_min=0.3, silence_keep=0.05,
        speech_pad=0.02, min_clip=1.5, remove_fillers=False,
    )
    sel = plan_selection(_analysis(silences=[(5.0, 7.0), (7.4, 9.0)]), reglas)
    for a, b in sel.keeps:
        assert b - a >= 1.5 - 0.01, f"fragmento demasiado corto: {a}-{b}"


def test_los_trozos_conservados_van_en_orden_y_sin_solapes() -> None:
    reglas = load_style("tutorial").pacing
    sel = plan_selection(_analysis(silences=[(3, 5), (9, 12), (20, 26)]), reglas)
    for anterior, siguiente in zip(sel.keeps, sel.keeps[1:]):
        assert anterior[1] <= siguiente[0]
    assert sel.keeps[0][0] >= 0.0
    assert sel.keeps[-1][1] <= 30.0


def test_el_informe_de_motivos_cuadra_con_lo_quitado() -> None:
    sel = plan_selection(_analysis(silences=[(5, 9), (15, 20)]), load_style("tutorial").pacing)
    assert sum(sel.reasons().values()) == pytest.approx(sel.removed_seconds, abs=0.01)


def test_guia_sintetica_se_recorta_de_forma_realista() -> None:
    from forge.fixtures import synthetic_guide_analysis

    a = synthetic_guide_analysis(300.0)
    sel = plan_selection(a, load_style("tutorial").pacing)
    reduccion = 1 - sel.kept_seconds / a.duration
    assert 0.1 < reduccion < 0.5, f"reduccion poco creible: {reduccion:.0%}"
