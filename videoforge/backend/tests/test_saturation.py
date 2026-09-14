"""Tests del motor de saturacion: densidad, metricas y puntuacion."""

from __future__ import annotations

import numpy as np
import pytest

from forge.fixtures import synthetic_guide_analysis
from forge.plan.edl import (
    EDL,
    BrollEffect,
    CalloutEffect,
    CaptionEffect,
    Clip,
    GradeEffect,
    PunchInEffect,
    Rect,
    RenderSpec,
    SfxEffect,
    TransitionEffect,
)
from forge.plan.planner import build_edl
from forge.plan.styles import Band, load_style
from forge.saturation.density import (
    DENSITY_REFERENCE,
    RATE,
    _fatigue_kernel,
    density_curve,
    heatmap,
    hot_windows,
    raw_load,
)
from forge.saturation.metrics import compute_metrics
from forge.saturation.score import (
    BUSY,
    UNDER_EDITED,
    _is_ceiling,
    _score_metric,
    evaluate,
    intensity_factor,
    verdict_for,
)


def _edl(effects=None, clips=None, duration=60.0, style="tutorial") -> EDL:
    return EDL(
        source="a.mp4",
        source_duration=duration,
        style=style,
        render=RenderSpec(width=1920, height=1080, fps=30),
        timeline=clips or [Clip(id="c0", source_start=0, source_end=duration)],
        effects=effects or [],
    )


# -- nucleo de fatiga ------------------------------------------------------


def test_el_nucleo_conserva_la_energia() -> None:
    assert float(_fatigue_kernel().sum()) == pytest.approx(1.0)


def test_el_nucleo_sube_rapido_y_baja_despacio() -> None:
    """La fatiga visual llega de golpe y se va poco a poco."""
    k = _fatigue_kernel()
    pico = int(np.argmax(k))
    assert pico < len(k) / 2, "el pico deberia estar en la primera mitad"


# -- carga bruta -----------------------------------------------------------


def test_un_montaje_vacio_no_carga_nada() -> None:
    assert float(raw_load(_edl()).sum()) == 0.0


def test_los_cortes_cargan_aunque_no_haya_efectos() -> None:
    """Sin esto, un montaje picadisimo sin efectos daria 'sub-editado'."""
    picado = _edl(clips=[Clip(id=f"c{i}", source_start=i * 2.0, source_end=(i + 1) * 2.0)
                          for i in range(30)])
    assert float(raw_load(picado).sum()) > 0


def test_un_broll_carga_mas_que_un_subtitulo() -> None:
    """Un subtitulo acompana; un b-roll sustituye lo que estabas viendo."""
    sub = _edl([CaptionEffect(id="c", start=0, end=10, cost_weight=0.5)])
    broll = _edl([BrollEffect(id="b", start=0, end=10, cost_weight=0.5)])
    assert raw_load(broll).sum() > raw_load(sub).sum()


def test_el_color_apenas_carga() -> None:
    """Esta todo el rato y el ojo lo normaliza."""
    grade = _edl([GradeEffect(id="g", start=0, end=60, cost_weight=1.0)])
    callout = _edl([CalloutEffect(id="k", start=0, end=60, cost_weight=1.0)])
    assert raw_load(grade).sum() < raw_load(callout).sum() / 3


def test_el_cost_weight_del_efecto_se_respeta() -> None:
    barato = _edl([BrollEffect(id="b", start=0, end=10, cost_weight=0.2)])
    caro = _edl([BrollEffect(id="b", start=0, end=10, cost_weight=0.9)])
    assert raw_load(caro).sum() > raw_load(barato).sum() * 3


# -- curva de densidad -----------------------------------------------------


def test_la_curva_esta_normalizada() -> None:
    e = _edl([BrollEffect(id=f"b{i}", start=i, end=i + 1.5, cost_weight=1.0) for i in range(50)])
    curva = density_curve(e)
    assert curva.min() >= 0.0
    assert curva.max() <= 1.0


def test_la_curva_cubre_toda_la_duracion() -> None:
    curva = density_curve(_edl(duration=60.0))
    assert len(curva) == pytest.approx(60.0 * RATE, abs=2)


def test_la_fatiga_se_arrastra_despues_del_efecto() -> None:
    """Un golpe deja resaca: la carga no se corta en seco al acabar."""
    e = _edl([SfxEffect(id="s", start=10.0, end=10.3, cost_weight=1.0)], duration=30.0)
    curva = density_curve(e)
    despues = curva[int(11.0 * RATE)]
    lejos = curva[int(20.0 * RATE)]
    assert despues > lejos


def test_la_referencia_de_densidad_esta_calibrada() -> None:
    """Fija la calibracion: tocarla desplaza todas las lecturas a la vez.

    Con este valor los montajes que produce el planner caen dentro de la banda
    de su estilo, y uno deliberadamente sobrecargado se va al tope.
    """
    assert DENSITY_REFERENCE == 1.0

    a = synthetic_guide_analysis(300.0)
    for estilo in ("tutorial", "documentary", "gaming-hype"):
        edl = build_edl(a, estilo)
        media = float(density_curve(edl).mean())
        banda = load_style(estilo).saturation["effect_density_mean"]
        assert banda.contains(media), f"{estilo}: densidad {media:.3f} fuera de {banda.lo}-{banda.hi}"


def test_un_montaje_saturado_llega_al_tope() -> None:
    efectos = []
    t = 0.0
    while t < 55:
        efectos += [
            BrollEffect(id=f"b{t}", start=t, end=t + 2, cost_weight=0.9),
            CalloutEffect(id=f"c{t}", start=t, end=t + 2, cost_weight=0.9),
            SfxEffect(id=f"s{t}", start=t, end=t + 0.4, cost_weight=0.9),
            PunchInEffect(id=f"p{t}", start=t, end=t + 1.5, cost_weight=0.9),
        ]
        t += 2.0
    assert float(density_curve(_edl(efectos)).mean()) > 0.9


# -- zonas calientes y mapa ------------------------------------------------


def test_detecta_la_zona_caliente() -> None:
    curva = np.zeros(int(60 * RATE), dtype=np.float32)
    curva[int(20 * RATE): int(25 * RATE)] = 0.9
    ventanas = hot_windows(curva, threshold=0.7)
    assert len(ventanas) == 1
    assert ventanas[0][0] == pytest.approx(20.0, abs=0.5)


def test_ignora_picos_demasiado_breves() -> None:
    curva = np.zeros(int(60 * RATE), dtype=np.float32)
    curva[100] = 0.95
    assert hot_windows(curva, threshold=0.7, min_seconds=0.5) == []


def test_el_mapa_usa_el_maximo_de_cada_tramo() -> None:
    """Promediando, un pico de medio segundo desapareceria del mapa."""
    curva = np.zeros(400, dtype=np.float32)
    curva[10] = 1.0
    assert max(heatmap(curva, columns=20)) == pytest.approx(1.0)


def test_el_mapa_respeta_el_numero_de_columnas() -> None:
    assert len(heatmap(np.zeros(400, dtype=np.float32), columns=30)) == 30


# -- metricas --------------------------------------------------------------


def test_la_cobertura_no_cuenta_dos_veces_los_solapes() -> None:
    e = _edl([
        CaptionEffect(id="a", start=0, end=10),
        CaptionEffect(id="b", start=5, end=15),
    ], duration=60.0)
    assert compute_metrics(e).text_coverage == pytest.approx(15.0 / 60.0, abs=0.01)


def test_las_capas_cuentan_los_efectos_simultaneos() -> None:
    e = _edl([
        CaptionEffect(id="a", start=0, end=10),
        PunchInEffect(id="b", start=2, end=8),
        BrollEffect(id="c", start=3, end=5),
    ])
    assert compute_metrics(e).max_layers == 3


def test_el_ambiente_no_cuenta_como_capa() -> None:
    """El color y la musica estan siempre; no son una capa mas."""
    e = _edl([
        GradeEffect(id="g", start=0, end=60),
        CaptionEffect(id="a", start=0, end=10),
    ])
    assert compute_metrics(e).max_layers == 1


def test_los_cortes_por_minuto() -> None:
    e = _edl(clips=[Clip(id=f"c{i}", source_start=i * 10.0, source_end=(i + 1) * 10.0)
                     for i in range(6)])
    assert compute_metrics(e).cuts_per_minute == pytest.approx(5.0, abs=0.1)


def test_detecta_los_zooms_sobre_planos_que_ya_se_mueven() -> None:
    """Es un fallo invisible para el resto de metricas: el efecto es uno solo."""
    a = synthetic_guide_analysis(120.0, with_transcript=False)
    a.motion.flow = [0.95] * len(a.motion.flow)
    e = _edl([PunchInEffect(id="p", start=10, end=12, rect=Rect.centered(0.5, 0.5, 1.3))],
             duration=120.0)
    assert compute_metrics(e, a).motion_conflicts_per_minute > 0


def test_sin_analisis_no_hay_conflictos_de_movimiento() -> None:
    e = _edl([PunchInEffect(id="p", start=10, end=12)])
    assert compute_metrics(e, None).motion_conflicts_per_minute == 0.0


# -- puntuacion ------------------------------------------------------------


def test_dentro_de_banda_puntua_entre_33_y_67() -> None:
    banda = Band(lo=10, hi=20)
    for valor in (10, 12, 15, 18, 20):
        puntos, _, estado = _score_metric(valor, banda)
        assert estado == "dentro"
        assert 33.0 <= puntos <= 67.0


def test_por_debajo_de_la_banda_puntua_bajo() -> None:
    puntos, _, estado = _score_metric(5, Band(lo=10, hi=20))
    assert estado == "bajo"
    assert puntos < 33.0


def test_por_encima_de_la_banda_puntua_alto() -> None:
    puntos, _, estado = _score_metric(30, Band(lo=10, hi=20))
    assert estado == "alto"
    assert puntos > 67.0


def test_una_metrica_de_techo_no_penaliza_por_estar_a_cero() -> None:
    """Cero conflictos de movimiento es lo ideal, no una carencia."""
    banda = Band(lo=0, hi=5)
    assert _is_ceiling(banda)
    puntos, _, estado = _score_metric(0, banda)
    assert estado == "dentro"
    assert puntos >= 40.0


def test_una_metrica_de_techo_si_penaliza_al_pasarse() -> None:
    puntos, _, estado = _score_metric(12, Band(lo=0, hi=5))
    assert estado == "alto"
    assert puntos > 67.0


def test_las_metricas_de_techo_no_votan_si_no_son_problema() -> None:
    a = synthetic_guide_analysis(300.0)
    reporte = evaluate(build_edl(a, "tutorial"), a)
    techos_ok = [r for r in reporte.readings if _is_ceiling(r.band) and r.status != "alto"]
    assert techos_ok
    assert all(not r.counts for r in techos_ok)


def test_los_veredictos_cubren_toda_la_escala() -> None:
    assert verdict_for(10) == "sub-editado"
    assert verdict_for(50) == "en el punto"
    assert verdict_for(75) == "cargado"
    assert verdict_for(95) == "sobresaturado"


def test_el_deslizador_de_intensidad() -> None:
    assert intensity_factor(50) == pytest.approx(1.0)
    assert intensity_factor(0) < 1.0
    assert intensity_factor(100) > 1.0


def test_menos_intensidad_hace_que_el_mismo_montaje_lea_mas_cargado() -> None:
    """Pedir menos edicion estrecha las bandas: lo mismo pasa a ser demasiado."""
    a = synthetic_guide_analysis(300.0)
    edl = build_edl(a, "tutorial")
    assert evaluate(edl, a, intensity=0).score > evaluate(edl, a, intensity=100).score


def test_la_escala_ordena_los_montajes_de_menos_a_mas_cargados() -> None:
    a = synthetic_guide_analysis(300.0)

    vacio = build_edl(a, "tutorial")
    vacio.timeline = [Clip(id="c", source_start=0, source_end=300)]
    vacio.effects = []

    normal = build_edl(a, "tutorial")

    cargado = build_edl(a, "tutorial")
    t = 0.0
    while t < cargado.duration - 3:
        cargado.effects += [
            BrollEffect(id=f"b{int(t)}", start=t, end=t + 2.5, cost_weight=0.9, value_score=0.3),
            CalloutEffect(id=f"k{int(t)}", start=t + 0.5, end=t + 2.0, cost_weight=0.8, value_score=0.25),
        ]
        t += 4.0

    s_vacio = evaluate(vacio, a).score
    s_normal = evaluate(normal, a).score
    s_cargado = evaluate(cargado, a).score
    assert s_vacio < s_normal < s_cargado
    assert s_vacio < UNDER_EDITED
    assert s_cargado > BUSY


def test_el_diagnostico_explica_que_pasa() -> None:
    a = synthetic_guide_analysis(300.0)
    edl = build_edl(a, "tutorial")
    edl.effects += [
        TransitionEffect(id=f"t{i}", start=i * 2.0, end=i * 2.0 + 0.3, cost_weight=0.9)
        for i in range(60)
    ]
    problemas = evaluate(edl, a).problems()
    assert problemas
    assert any(p.advice for p in problemas)


def test_la_misma_carga_se_juzga_distinto_segun_el_estilo() -> None:
    """Lo que en una guia sobra, en un short es lo normal."""
    a = synthetic_guide_analysis(300.0)
    guia = build_edl(a, "tutorial")

    como_short = guia.model_copy(deep=True)
    como_short.style = "gaming-hype"

    assert evaluate(guia, a).score > evaluate(como_short, a).score
