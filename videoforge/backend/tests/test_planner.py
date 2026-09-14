"""Tests de subtitulos, enfasis, capitulos y del planner completo."""

from __future__ import annotations

import pytest

from forge.analysis.types import (
    Analysis,
    MotionTrack,
    Shot,
    ShotFocus,
    Transcript,
    TranscriptSegment,
    Word,
)
from forge.fixtures import synthetic_guide_analysis
from forge.plan.captions import group_words, plan_captions, reading_speed_wpm
from forge.plan.chapters import _clean_title, plan_chapters
from forge.plan.edl import EDL, CaptionEffect, Clip, EffectKind, RenderSpec
from forge.plan.emphasis import plan_punch_ins
from forge.plan.planner import build_edl
from forge.plan.styles import CaptionRules, EmphasisRules, load_style


def _edl(clips=None) -> EDL:
    return EDL(
        source="a.mp4",
        source_duration=100.0,
        render=RenderSpec(width=1920, height=1080, fps=30),
        timeline=clips or [Clip(id="c0", source_start=0, source_end=100)],
    )


def _words(pares) -> list[Word]:
    return [Word(start=a, end=b, text=t) for a, b, t in pares]


# -- agrupacion de subtitulos ---------------------------------------------


def test_parte_por_numero_de_palabras() -> None:
    reglas = CaptionRules(max_words=3, max_chars=999, max_duration=999, split_gap=999)
    ws = _words([(i * 0.5, i * 0.5 + 0.4, f"p{i}") for i in range(7)])
    lineas = group_words(ws, reglas, [])

    # Siete palabras de tres en tres darian 3+3+1, y esa ultima linea suelta
    # parpadea medio segundo en pantalla. Se reparte para que no quede huerfana.
    assert [len(l) for l in lineas] == [3, 2, 2]
    assert all(len(l) <= reglas.max_words for l in lineas)
    assert sum(len(l) for l in lineas) == len(ws), "no se puede perder ninguna palabra"
    assert [w.text for l in lineas for w in l] == [w.text for w in ws], (
        "el orden de las palabras tiene que ser el mismo"
    )


def test_parte_por_numero_de_caracteres() -> None:
    reglas = CaptionRules(max_words=99, max_chars=12, max_duration=999, split_gap=999)
    ws = _words([(0, 0.4, "palabra"), (0.5, 0.9, "larguisima"), (1.0, 1.4, "mas")])
    assert len(group_words(ws, reglas, [])) > 1


def test_parte_por_pausa_larga() -> None:
    """Cortar donde la persona respira hace que el subtitulo siga el habla."""
    reglas = CaptionRules(max_words=99, max_chars=999, max_duration=999, split_gap=0.5)
    ws = _words([(0, 0.4, "hola"), (0.5, 0.9, "que"), (3.0, 3.4, "tal")])
    lineas = group_words(ws, reglas, [])
    assert len(lineas) == 2
    assert [w.text for w in lineas[1]] == ["tal"]


def test_nunca_cruza_un_corte() -> None:
    """Una linea que sigue en pantalla tras un corte delata el montaje."""
    reglas = CaptionRules(max_words=99, max_chars=999, max_duration=999, split_gap=999)
    ws = _words([(0, 0.4, "antes"), (0.5, 0.9, "del"), (1.2, 1.6, "despues")])
    lineas = group_words(ws, reglas, cuts=[1.0])
    assert len(lineas) == 2
    assert [w.text for w in lineas[1]] == ["despues"]


def test_los_subtitulos_salen_en_tiempo_de_montaje() -> None:
    edl = _edl([
        Clip(id="a", source_start=0, source_end=10),
        Clip(id="b", source_start=50, source_end=60),
    ])
    tr = Transcript(language="es", segments=[
        TranscriptSegment(start=50, end=51, text="hola", words=_words([(50.0, 50.5, "hola")]))
    ])
    caps = plan_captions(edl, tr, CaptionRules())
    assert len(caps) == 1
    assert caps[0].start == pytest.approx(10.0, abs=0.01)


def test_las_palabras_recortadas_no_se_subtitulan() -> None:
    edl = _edl([Clip(id="a", source_start=0, source_end=10)])
    tr = Transcript(language="es", segments=[
        TranscriptSegment(start=0, end=60, text="x", words=_words([
            (1.0, 1.4, "dentro"), (30.0, 30.4, "fuera")
        ]))
    ])
    caps = plan_captions(edl, tr, CaptionRules())
    assert "fuera" not in " ".join(c.text for c in caps)


def test_estilo_sin_subtitulos_no_genera_ninguno() -> None:
    tr = Transcript(language="es", segments=[
        TranscriptSegment(start=0, end=1, text="hola", words=_words([(0, 0.5, "hola")]))
    ])
    assert plan_captions(_edl(), tr, CaptionRules(enabled=False)) == []


def test_velocidad_de_lectura() -> None:
    caps = [CaptionEffect(id="c", start=0, end=2, words=_words([(0, 0.4, "a"), (0.5, 0.9, "b")]))]
    assert reading_speed_wpm(caps) == pytest.approx(60.0)


def test_velocidad_de_lectura_sin_subtitulos() -> None:
    assert reading_speed_wpm([]) == 0.0


# -- zooms de enfasis ------------------------------------------------------


def _analysis_para_zoom(concentracion: float, movimiento: float) -> Analysis:
    a = synthetic_guide_analysis(120.0, with_transcript=False)
    a.focus = [ShotFocus(shot_index=s.index, cx=0.5, cy=0.5, concentration=concentracion) for s in a.shots]
    a.motion = MotionTrack(rate=4.0, diff=[0.1] * 480, flow=[movimiento] * 480)
    return a


def test_no_hace_zoom_si_no_hay_nada_que_enfocar() -> None:
    """Saliencia repartida = acercarse seria arbitrario."""
    a = _analysis_para_zoom(concentracion=0.02, movimiento=0.0)
    edl = _edl([Clip(id="c", source_start=0, source_end=120)])
    elegidos, reservas = plan_punch_ins(edl, a, EmphasisRules())
    assert elegidos == []
    assert reservas == []


def test_no_hace_zoom_sobre_un_plano_que_ya_se_mueve() -> None:
    """Acercarse sobre camara en movimiento marea."""
    a = _analysis_para_zoom(concentracion=0.9, movimiento=0.95)
    edl = _edl([Clip(id="c", source_start=0, source_end=120)])
    elegidos, reservas = plan_punch_ins(edl, a, EmphasisRules())
    assert elegidos == []
    assert reservas == []


def test_hace_zoom_cuando_hay_foco_y_quietud() -> None:
    a = _analysis_para_zoom(concentracion=0.9, movimiento=0.05)
    edl = _edl([Clip(id="c", source_start=0, source_end=120)])
    zooms, _ = plan_punch_ins(edl, a, EmphasisRules())
    assert zooms
    assert all(z.rect.zoom > 1.0 for z in zooms)


def test_respeta_la_separacion_minima_entre_zooms() -> None:
    a = _analysis_para_zoom(concentracion=0.9, movimiento=0.05)
    edl = _edl([Clip(id="c", source_start=0, source_end=120)])
    reglas = EmphasisRules(punch_min_gap=20.0, max_punch_per_minute=60)
    zooms, _ = plan_punch_ins(edl, a, reglas)
    for anterior, siguiente in zip(zooms, zooms[1:]):
        assert siguiente.start - anterior.start >= 20.0 - 1e-6


def test_respeta_el_maximo_por_minuto() -> None:
    a = _analysis_para_zoom(concentracion=0.9, movimiento=0.05)
    edl = _edl([Clip(id="c", source_start=0, source_end=120)])
    reglas = EmphasisRules(max_punch_per_minute=1.0, punch_min_gap=1.0)
    elegidos, _ = plan_punch_ins(edl, a, reglas)
    assert len(elegidos) <= 2


def test_un_zoom_no_se_queda_a_medias_en_un_corte() -> None:
    a = _analysis_para_zoom(concentracion=0.9, movimiento=0.05)
    edl = _edl([Clip(id=f"c{i}", source_start=i * 10, source_end=i * 10 + 10) for i in range(12)])
    reglas = EmphasisRules(punch_min_gap=1.0, max_punch_per_minute=60, punch_seconds=2.0)
    cortes = edl.cut_points()
    elegidos, reservas = plan_punch_ins(edl, a, reglas)
    # Ni los elegidos ni las reservas pueden quedarse a medias en un corte.
    for z in elegidos + reservas:
        assert not any(z.start < c < z.end for c in cortes)


def test_las_reservas_respetan_las_mismas_reglas_que_los_elegidos() -> None:
    """Una reserva es un zoom valido que no entro por tope de ritmo, no un descarte."""
    a = _analysis_para_zoom(concentracion=0.9, movimiento=0.05)
    edl = _edl([Clip(id="c", source_start=0, source_end=120)])
    reglas = EmphasisRules(max_punch_per_minute=1.0, punch_min_gap=5.0)

    elegidos, reservas = plan_punch_ins(edl, a, reglas)
    assert reservas, "deberia haber quedado alguna reserva"
    todos = sorted(elegidos + reservas, key=lambda z: z.start)
    for anterior, siguiente in zip(todos, todos[1:]):
        assert siguiente.start - anterior.start >= reglas.punch_min_gap - 1e-6


def test_estilo_sin_zoom_no_genera_ninguno() -> None:
    a = _analysis_para_zoom(concentracion=0.9, movimiento=0.05)
    assert plan_punch_ins(_edl(), a, EmphasisRules(punch_in=False)) == ([], [])


# -- capitulos -------------------------------------------------------------


def test_las_pausas_se_buscan_en_el_original_no_en_el_montaje() -> None:
    """El corte se come las pausas: si se buscan en el montaje, no hay ninguna."""
    a = synthetic_guide_analysis(300.0)
    edl = build_edl(a, "tutorial")
    assert len(edl.chapters) >= 3, "deberia encontrar varios cambios de tema"


def test_los_capitulos_respetan_la_duracion_minima() -> None:
    a = synthetic_guide_analysis(300.0)
    edl = build_edl(a, "tutorial")
    reglas = load_style("tutorial").chapters
    for anterior, siguiente in zip(edl.chapters, edl.chapters[1:]):
        assert siguiente.start - anterior.start >= reglas.min_seconds - 1e-6


def test_el_primer_capitulo_empieza_en_cero() -> None:
    a = synthetic_guide_analysis(300.0)
    edl = build_edl(a, "tutorial")
    assert edl.chapters[0].start == 0.0


def test_un_video_corto_no_lleva_capitulos() -> None:
    """Partir 40 segundos en capitulos no aporta nada."""
    a = synthetic_guide_analysis(40.0)
    corto = build_edl(a, "tutorial")
    assert plan_chapters(corto, a.transcript, load_style("tutorial").chapters) == []
    assert corto.chapters == []


def test_el_titulo_se_limpia() -> None:
    ws = _words([(0, 0.3, "entonces"), (0.4, 0.7, "abrimos"), (0.8, 1.1, "el"), (1.2, 1.5, "menu")])
    titulo = _clean_title(ws)
    assert not titulo.lower().startswith("entonces")
    assert titulo[0].isupper()


def test_el_titulo_no_se_alarga_sin_control() -> None:
    ws = _words([(i * 0.4, i * 0.4 + 0.3, "palabralarga") for i in range(30)])
    assert len(_clean_title(ws)) <= 56


# -- planner completo ------------------------------------------------------


def test_montaje_completo_de_una_guia() -> None:
    a = synthetic_guide_analysis(300.0)
    edl = build_edl(a, "tutorial")

    assert 0.1 < edl.compression < 0.5, "recorte poco creible para una guia"
    assert edl.timeline
    assert edl.effects_of(EffectKind.CAPTION)
    assert edl.chapters
    assert edl.notes


def test_los_clips_no_se_solapan_ni_se_salen_del_original() -> None:
    a = synthetic_guide_analysis(300.0)
    edl = build_edl(a, "tutorial")
    for c in edl.timeline:
        assert 0 <= c.source_start < c.source_end <= a.duration + 1e-6
    for anterior, siguiente in zip(edl.timeline, edl.timeline[1:]):
        assert anterior.source_end <= siguiente.source_start + 1e-6


def test_todos_los_efectos_caen_dentro_del_montaje() -> None:
    a = synthetic_guide_analysis(300.0)
    edl = build_edl(a, "tutorial")
    for e in edl.effects:
        assert e.start >= -1e-6
        assert e.end <= edl.duration + 1e-6
        assert e.end > e.start


def test_todo_efecto_trae_su_justificacion() -> None:
    """Es lo que permite explicar el montaje en vez de imponerlo."""
    a = synthetic_guide_analysis(300.0)
    edl = build_edl(a, "tutorial")
    for e in edl.effects:
        assert e.rationale, f"{e.kind} sin justificacion"
        assert 0.0 <= e.value_score <= 1.0
        assert 0.0 <= e.cost_weight <= 1.0


@pytest.mark.parametrize(
    "estilo", ["tutorial", "gaming-hype", "cinematic", "documentary", "vlog", "clean-corporate"]
)
def test_todos_los_estilos_producen_un_montaje_valido(estilo: str) -> None:
    a = synthetic_guide_analysis(300.0)
    edl = build_edl(a, estilo)
    assert edl.duration > 0
    assert edl.timeline
    assert edl.style == estilo


def test_gaming_corta_mas_que_cinematic() -> None:
    a = synthetic_guide_analysis(300.0)
    rapido = build_edl(a, "gaming-hype")
    lento = build_edl(a, "cinematic")
    ritmo_rapido = len(rapido.cut_points()) / (rapido.duration / 60)
    ritmo_lento = len(lento.cut_points()) / (lento.duration / 60)
    assert ritmo_rapido > ritmo_lento


def test_sin_transcripcion_se_monta_igual_pero_avisa() -> None:
    a = synthetic_guide_analysis(300.0, with_transcript=False)
    edl = build_edl(a, "tutorial")
    assert edl.timeline
    assert edl.effects_of(EffectKind.CAPTION) == []
    assert any("transcripcion" in n.lower() for n in edl.notes)


def test_el_montaje_es_determinista() -> None:
    a = synthetic_guide_analysis(300.0)
    uno = build_edl(a, "tutorial")
    otro = build_edl(a, "tutorial")
    assert uno.model_dump_json() == otro.model_dump_json()
