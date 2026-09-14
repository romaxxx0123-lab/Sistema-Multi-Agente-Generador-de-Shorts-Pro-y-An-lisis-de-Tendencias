"""Tests del analisis de movimiento y la deteccion de planos."""

from __future__ import annotations

from pathlib import Path

import pytest

from forge.analysis.motion import _normalize, analyze_motion, rate_for_duration
from forge.analysis.shots import _merge_short_shots, _shots_from_motion, detect_shots
from forge.analysis.types import MotionTrack
from forge.config import Settings
from forge.fixtures import DEFAULT_SCENES, TOTAL_SECONDS, scene_boundaries


# -- normalizacion ---------------------------------------------------------


def test_normalize_lleva_el_maximo_cerca_de_uno() -> None:
    salida = _normalize([0.0, 0.5, 1.0, 2.0], floor=0.01)
    assert max(salida) == pytest.approx(1.0)
    assert min(salida) == 0.0


def test_normalize_no_amplifica_el_ruido() -> None:
    """Un video estatico solo tiene ruido de codec: debe quedar cerca de cero."""
    ruido = [0.001, 0.002, 0.0015, 0.001]
    salida = _normalize(ruido, floor=0.25)
    assert max(salida) < 0.05


def test_normalize_ignora_un_pico_aislado() -> None:
    """Usamos el percentil 95 para que un flash no aplaste el resto de la curva."""
    senal = [0.4] * 50 + [10.0]
    salida = _normalize(senal, floor=0.01)
    assert salida[0] == pytest.approx(1.0, abs=0.05)


def test_normalize_lista_vacia() -> None:
    assert _normalize([], floor=0.1) == []


def test_muestreo_baja_en_videos_largos() -> None:
    assert rate_for_duration(60.0) > rate_for_duration(1800.0)


# -- curva real sobre el fixture -------------------------------------------


@pytest.fixture(scope="module")
def motion_real(sample_video: Path, settings: Settings) -> MotionTrack:
    from forge.cache import JobCache
    from forge.config import Device, Tier, resolve_model_plan
    from forge.ingest.proxy import build_proxy
    from forge.tools import probe

    info = probe(sample_video, settings)
    cache = JobCache(settings, sample_video)
    bundle = build_proxy(info, cache, settings, resolve_model_plan(Tier.LIGHT, Device.CPU))
    return analyze_motion(bundle.video, settings, rate=8.0)


def test_la_curva_cubre_todo_el_video(motion_real: MotionTrack) -> None:
    assert len(motion_real.flow) == pytest.approx(TOTAL_SECONDS * 8, abs=3)
    assert all(0.0 <= v <= 1.0 for v in motion_real.flow)


def test_distingue_escenas_estaticas_de_escenas_con_movimiento(
    motion_real: MotionTrack,
) -> None:
    """La escena de testsrc2 se mueve mucho mas que las de color plano."""
    con_movimiento = motion_real.mean_between(2.1, 4.4)
    estatica = motion_real.mean_between(0.1, 1.9)
    assert con_movimiento > 0.3
    assert estatica < 0.1
    assert con_movimiento > estatica * 5


def test_value_at_no_se_sale_de_rango(motion_real: MotionTrack) -> None:
    assert 0.0 <= motion_real.value_at(-5.0) <= 1.0
    assert 0.0 <= motion_real.value_at(9999.0) <= 1.0


def test_mean_between_con_rango_invalido(motion_real: MotionTrack) -> None:
    assert motion_real.mean_between(5.0, 5.0) == 0.0
    assert motion_real.mean_between(5.0, 1.0) == 0.0


# -- planos ----------------------------------------------------------------


def test_merge_descarta_planos_demasiado_cortos() -> None:
    planos = _merge_short_shots([1.0, 1.05, 3.0], duration=6.0, min_seconds=0.5)
    assert [p.start for p in planos] == [0.0, 1.0, 3.0]


def test_merge_absorbe_un_corte_pegado_al_final() -> None:
    """Un corte a 0.1s del final dejaria un plano inutil."""
    planos = _merge_short_shots([5.95], duration=6.0, min_seconds=0.5)
    assert len(planos) == 1
    assert planos[0].end == 6.0


def test_merge_ignora_cortes_fuera_del_video() -> None:
    planos = _merge_short_shots([-1.0, 0.0, 99.0], duration=6.0, min_seconds=0.4)
    assert len(planos) == 1


def test_los_planos_cubren_el_video_sin_huecos() -> None:
    planos = _merge_short_shots([2.0, 4.0], duration=6.0, min_seconds=0.4)
    assert planos[0].start == 0.0
    assert planos[-1].end == 6.0
    for anterior, siguiente in zip(planos, planos[1:]):
        assert anterior.end == siguiente.start


def test_deteccion_real_encuentra_todos_los_cortes(
    sample_video: Path, settings: Settings, motion_real: MotionTrack
) -> None:
    from forge.cache import JobCache
    from forge.config import Device, Tier, resolve_model_plan
    from forge.ingest.proxy import build_proxy
    from forge.tools import probe

    info = probe(sample_video, settings)
    cache = JobCache(settings, sample_video)
    bundle = build_proxy(info, cache, settings, resolve_model_plan(Tier.LIGHT, Device.CPU))

    planos = detect_shots(bundle.video, TOTAL_SECONDS, settings, motion=motion_real)
    assert len(planos) == len(DEFAULT_SCENES)
    detectados = [p.start for p in planos[1:]]
    for detectado, esperado in zip(detectados, scene_boundaries()):
        assert detectado == pytest.approx(esperado, abs=0.15)


def test_el_plan_b_tambien_encuentra_los_cortes(motion_real: MotionTrack) -> None:
    """Sin PySceneDetect deducimos los cortes de la curva de diferencia."""
    planos = _shots_from_motion(motion_real, TOTAL_SECONDS, 0.4)
    detectados = [p.start for p in planos[1:]]
    for detectado, esperado in zip(detectados, scene_boundaries()):
        assert detectado == pytest.approx(esperado, abs=0.3)


def test_el_plan_b_sin_datos_devuelve_un_solo_plano() -> None:
    planos = _shots_from_motion(MotionTrack(rate=0), 10.0, 0.4)
    assert len(planos) == 1
    assert (planos[0].start, planos[0].end) == (0.0, 10.0)
