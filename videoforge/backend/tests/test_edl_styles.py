"""Tests del esquema EDL y de los presets de estilo."""

from __future__ import annotations

import pytest

from forge.errors import PlanError
from forge.plan.edl import (
    EDL,
    CaptionEffect,
    Clip,
    EffectKind,
    PunchInEffect,
    Rect,
    RenderSpec,
)
from forge.plan.styles import Band, describe_styles, list_styles, load_style


def _edl(clips=None, effects=None) -> EDL:
    return EDL(
        source="a.mp4",
        source_duration=100.0,
        render=RenderSpec(width=1920, height=1080, fps=30),
        timeline=clips if clips is not None else [Clip(id="c0", source_start=0, source_end=10)],
        effects=effects or [],
    )


# -- Rect ------------------------------------------------------------------


def test_rect_centrado_tiene_el_zoom_pedido() -> None:
    r = Rect.centered(0.5, 0.5, 2.0)
    assert r.zoom == pytest.approx(2.0)
    assert r.center == pytest.approx((0.5, 0.5))


def test_rect_fuera_de_marco_se_mete_dentro() -> None:
    r = Rect(x=0.9, y=0.9, w=0.5, h=0.5).clamped()
    assert r.x + r.w <= 1.0 + 1e-9
    assert r.y + r.h <= 1.0 + 1e-9


def test_rect_centrado_junto_al_borde_no_se_sale() -> None:
    r = Rect.centered(0.02, 0.98, 3.0)
    assert 0.0 <= r.x and r.x + r.w <= 1.0 + 1e-9
    assert 0.0 <= r.y and r.y + r.h <= 1.0 + 1e-9


# -- tiempos ---------------------------------------------------------------


def test_la_duracion_solo_depende_de_los_clips() -> None:
    """Invariante del proyecto: los efectos no cambian la duracion."""
    e = _edl()
    antes = e.duration
    e.effects.append(
        CaptionEffect(id="x", start=0, end=5, words=[]),
    )
    assert e.duration == antes


def test_la_velocidad_acorta_el_clip() -> None:
    e = _edl([Clip(id="c", source_start=0, source_end=10, speed=2.0)])
    assert e.duration == pytest.approx(5.0)


def test_compresion_refleja_lo_recortado() -> None:
    e = _edl([Clip(id="c", source_start=0, source_end=25)])
    assert e.compression == pytest.approx(0.75)


def test_mapeo_de_tiempos_ida_y_vuelta() -> None:
    e = _edl([
        Clip(id="a", source_start=0, source_end=10),
        Clip(id="b", source_start=20, source_end=30),
    ])
    tl = e.source_to_timeline(25.0)
    assert tl == pytest.approx(15.0)
    assert e.timeline_to_source(tl) == pytest.approx(25.0)


def test_un_instante_recortado_no_tiene_equivalente() -> None:
    e = _edl([
        Clip(id="a", source_start=0, source_end=10),
        Clip(id="b", source_start=20, source_end=30),
    ])
    assert e.source_to_timeline(15.0) is None


def test_los_cortes_son_los_limites_entre_clips() -> None:
    e = _edl([
        Clip(id="a", source_start=0, source_end=10),
        Clip(id="b", source_start=20, source_end=25),
        Clip(id="c", source_start=40, source_end=43),
    ])
    assert e.cut_points() == pytest.approx([10.0, 15.0])


# -- efectos ---------------------------------------------------------------


def test_eficiencia_ordena_que_sobra_primero() -> None:
    bueno = CaptionEffect(id="b", start=0, end=1, value_score=0.9, cost_weight=0.3)
    malo = PunchInEffect(id="m", start=0, end=1, value_score=0.2, cost_weight=0.8)
    assert bueno.efficiency > malo.efficiency


def test_quitar_un_efecto_por_id() -> None:
    e = _edl(effects=[CaptionEffect(id="cap1", start=0, end=1)])
    assert e.remove_effect("cap1") is True
    assert e.remove_effect("cap1") is False
    assert e.effects == []


def test_efectos_por_tipo_y_por_instante() -> None:
    e = _edl(effects=[
        CaptionEffect(id="c1", start=0, end=5),
        PunchInEffect(id="p1", start=3, end=8),
    ])
    assert len(e.effects_of(EffectKind.CAPTION)) == 1
    assert len(e.effects_at(4.0)) == 2
    assert len(e.effects_at(6.0)) == 1


def test_el_edl_sobrevive_a_ida_y_vuelta_json() -> None:
    """El EDL se guarda y se recarga; la union discriminada debe reconstruirse."""
    e = _edl(effects=[
        CaptionEffect(id="c1", start=0, end=5),
        PunchInEffect(id="p1", start=3, end=8, rect=Rect.centered(0.4, 0.6, 1.2)),
    ])
    recargado = EDL.model_validate_json(e.model_dump_json())
    assert isinstance(recargado.effects[0], CaptionEffect)
    assert isinstance(recargado.effects[1], PunchInEffect)
    assert recargado.effects[1].rect.zoom == pytest.approx(1.2, abs=0.01)


def test_marcadores_de_capitulo_con_formato_de_youtube() -> None:
    from forge.plan.edl import Chapter

    e = _edl()
    e.chapters = [Chapter(start=0, title="Intro"), Chapter(start=125, title="Ajustes")]
    assert e.chapter_markers() == "0:00 Intro\n2:05 Ajustes"


def test_marcador_pasa_a_horas_en_videos_largos() -> None:
    from forge.plan.edl import Chapter

    assert Chapter(start=3725, title="x").timestamp() == "1:02:05"


# -- estilos ---------------------------------------------------------------


def test_estan_los_seis_estilos() -> None:
    nombres = list_styles()
    assert {"tutorial", "gaming-hype", "cinematic", "documentary", "vlog", "clean-corporate"} <= set(nombres)


def test_un_estilo_inexistente_sugiere_los_que_hay() -> None:
    with pytest.raises(PlanError) as exc:
        load_style("no-existe")
    assert "tutorial" in (exc.value.hint or "")


def test_todos_los_estilos_traen_sus_bandas() -> None:
    requeridas = {
        "cuts_per_minute", "effect_density_mean", "effect_density_peak",
        "overlay_coverage", "text_coverage", "max_layers",
        "sfx_per_minute", "transitions_per_minute", "caption_wpm",
        "motion_conflicts_per_minute",
    }
    for estilo in describe_styles():
        assert requeridas <= set(estilo.saturation), f"{estilo.name} no define todas"


def test_las_bandas_son_coherentes() -> None:
    for estilo in describe_styles():
        for metrica, banda in estilo.saturation.items():
            assert banda.lo <= banda.hi, f"{estilo.name}.{metrica} esta al reves"


def test_gaming_admite_mas_carga_que_tutorial() -> None:
    """Lo que en una guia es sobrecarga, en un short es lo normal."""
    guia = load_style("tutorial")
    short = load_style("gaming-hype")
    assert short.saturation["effect_density_mean"].hi > guia.saturation["effect_density_mean"].hi
    assert short.pacing.cuts_per_minute.hi > guia.pacing.cuts_per_minute.hi


def test_banda_mide_la_distancia_al_rango() -> None:
    b = Band(lo=10, hi=20)
    assert b.contains(15) and not b.contains(25)
    assert b.distance(15) == 0
    assert b.distance(25) == 5
    assert b.distance(4) == 6


def test_banda_escalada_por_intensidad() -> None:
    b = Band(lo=10, hi=20).scaled(1.5)
    assert (b.lo, b.hi) == (15, 30)
