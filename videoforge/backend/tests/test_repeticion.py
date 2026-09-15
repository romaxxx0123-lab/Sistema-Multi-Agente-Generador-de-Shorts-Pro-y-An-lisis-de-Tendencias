"""Que el quinto no valga lo que valia el primero.

Cada planner tiene su cupo ("hasta doce zooms por minuto") y cumpliendolo al pie
de la letra salia esto, medido sobre una guia de 20 minutos con `gaming-hype`:
310 efectos, **una racha de once zooms seguidos**, y el 45% empezando a menos de
un segundo del anterior.

Lo que importa de esa medida es que **no se salta ninguna regla**: el cupo es de
doce por minuto y se pusieron doce por minuto. Un cupo dice cuantos y no dice
como, y asi es como se delata una edicion automatica: no por hacer cosas raras,
sino por hacer la misma una y otra vez hasta que deja de significar nada.

(De los amontonamientos, en cambio, casi todos resultaron ser **pares
intencionados**: 79 de los 102 pares a menos de medio segundo eran un sonido con
el zoom al que va anclado. Eso es el diseno funcionando, y por eso no se toca.)
"""

from __future__ import annotations

import pytest

from forge.fixtures import synthetic_guide_analysis
from forge.plan.edl import (
    EDL,
    CaptionEffect,
    Clip,
    EffectKind,
    PunchInEffect,
    Rect,
    RenderSpec,
    SfxEffect,
    TransitionEffect,
)
from forge.plan.planner import build_edl
from forge.plan.restraint import RUN_LIMIT, RUN_SECONDS, apply_restraint, runs
from forge.plan.styles import load_style
from forge.saturation.metrics import compute_metrics
from forge.saturation.score import evaluate


def _zoom(i: int, t: float, valor: float = 0.5) -> PunchInEffect:
    return PunchInEffect(
        id=f"z{i}", start=t, end=t + 1.0, rect=Rect(x=0.2, y=0.2, w=0.6, h=0.6),
        value_score=valor, cost_weight=0.4, rationale="zoom",
    )


def _edl(efectos) -> EDL:
    return EDL(
        source="a.mp4", source_duration=600.0, style="tutorial",
        render=RenderSpec(width=1920, height=1080, fps=30.0),
        timeline=[Clip(id="c0", source_start=0.0, source_end=600.0)],
        effects=list(efectos),
    )


# -- que es una racha -------------------------------------------------------


def test_lo_seguido_del_mismo_tipo_es_una_racha() -> None:
    grupos = runs([_zoom(i, i * 2.0) for i in range(5)])
    assert len(grupos) == 1 and len(grupos[0]) == 5


def test_otra_cosa_por_medio_rompe_la_racha() -> None:
    """El ojo ha visto algo distinto: ya no es un bucle."""
    efectos = [
        _zoom(0, 0.0), _zoom(1, 2.0),
        SfxEffect(id="s", start=3.0, end=3.3, asset_id="whoosh", rationale="golpe"),
        _zoom(2, 4.0), _zoom(3, 6.0),
    ]
    grupos = runs(efectos)
    assert [len(g) for g in grupos] == [2, 2]


def test_lo_espaciado_no_es_una_racha() -> None:
    """Era el fallo de la primera version de la metrica.

    Marcaba `documentary` como repetitivo (0.58) porque sus transiciones van
    seguidas... a cuarenta y seis segundos unas de otras. Nadie se acuerda de la
    anterior: eso no es un bucle, es el ritmo del estilo.
    """
    separados = [_zoom(i, i * (RUN_SECONDS + 5.0)) for i in range(5)]
    assert runs(separados) == []


# -- que se hace con ella ---------------------------------------------------


def test_una_racha_se_adelgaza_quedandose_con_lo_mejor() -> None:
    valores = [0.3, 0.9, 0.2, 0.8, 0.25, 0.85, 0.1, 0.4, 0.15, 0.35]
    edl = _edl(_zoom(i, i * 2.0, v) for i, v in enumerate(valores))
    retirados, notas = apply_restraint(edl, load_style("tutorial"))

    quedan = [e for e in edl.effects if e.kind is EffectKind.PUNCH_IN]
    assert len(quedan) == RUN_LIMIT
    # Y los que quedan son los que mas aportaban, no los tres primeros.
    assert sorted(e.value_score for e in quedan) == [0.8, 0.85, 0.9]
    assert notas and "racha" in notas[0]


def test_lo_retirado_no_se_pierde_sino_que_va_a_reservas() -> None:
    """Para que el auto-balanceador pueda recuperarlo si hace falta.

    Y lo recuperara en el tramo mas vacio, que es justo donde repetirse no
    cansa.
    """
    edl = _edl(_zoom(i, i * 2.0) for i in range(8))
    retirados, _ = apply_restraint(edl, load_style("tutorial"))

    assert len(edl.effects) + len(edl.candidates) == 8, "no se pierde ninguno"
    assert len(edl.candidates) == len(retirados)
    assert len(edl.effects) <= RUN_LIMIT
    # Ocho zooms en dieciseis segundos en una guia: ademas de la racha salta el
    # otro freno, el de pasarse del ritmo que el propio estilo pidio.
    assert len(edl.effects) < RUN_LIMIT


def test_lo_que_no_cansa_no_se_toca() -> None:
    """Los subtitulos van de principio a fin: no son un recurso que se gaste."""
    subtitulos = [
        CaptionEffect(id=f"s{i}", start=i * 2.0, end=i * 2.0 + 1.8, text="hola")
        for i in range(10)
    ]
    edl = _edl(subtitulos)
    retirados, _ = apply_restraint(edl, load_style("tutorial"))
    assert retirados == []


def test_un_efecto_fijado_no_se_retira() -> None:
    efectos = [_zoom(i, i * 2.0) for i in range(8)]
    for e in efectos:
        e.locked = True
    edl = _edl(efectos)
    retirados, _ = apply_restraint(edl, load_style("tutorial"))
    assert retirados == []


# -- y en un montaje de verdad ----------------------------------------------


@pytest.fixture(scope="module")
def guia():
    return synthetic_guide_analysis(duration=1200.0)


def _rachas(edl) -> int:
    visibles = sorted(
        (e for e in edl.effects
         if e.kind.value not in ("grade", "music", "caption")),
        key=lambda e: e.start,
    )
    grupos = runs(visibles)
    return max((len(g) for g in grupos), default=0)


def test_se_rompe_el_bucle_sin_vaciar_el_estilo(guia) -> None:
    """`gaming-hype` tiene que seguir siendo nervioso, pero no en bucle."""
    edl = build_edl(guia, "gaming-hype")
    assert _rachas(edl) <= RUN_LIMIT

    visibles = [e for e in edl.effects
                if e.kind.value not in ("grade", "music", "caption")]
    # No se ha desmontado el estilo: sigue habiendo mucho, solo que variado.
    assert len(visibles) > 200


def test_un_estilo_sobrio_no_se_entera(guia) -> None:
    """Si no te repetias, esto no te cambia el montaje."""
    edl = build_edl(guia, "tutorial")
    assert not any("racha" in n for n in edl.notes)


# -- y se mide ---------------------------------------------------------------


def test_la_repeticion_ahora_se_mide(guia) -> None:
    """La densidad no la veia: once zooms seguidos y once efectos variados dan
    la misma densidad y en pantalla no se parecen en nada."""
    edl = build_edl(guia, "gaming-hype")
    solo_zooms = edl.model_copy(update={"effects": [
        e for e in edl.effects
        if e.kind in (EffectKind.PUNCH_IN, EffectKind.CAPTION, EffectKind.GRADE)
    ]})

    assert compute_metrics(solo_zooms).repeated_share == 1.0
    lectura = next(
        r for r in evaluate(solo_zooms, guia).readings if r.name == "repeated_share"
    )
    assert lectura.status == "alto"
    assert "varia" in lectura.advice


@pytest.mark.parametrize(
    "estilo", ["tutorial", "gaming-hype", "documentary", "vlog", "cinematic"]
)
def test_un_montaje_normal_se_queda_dentro_de_banda(estilo: str, guia) -> None:
    """La banda esta calibrada, no puesta a ojo: los montajes reales dan entre
    0.00 y 0.15, un montaje monotono da 1.00, y el techo esta en medio."""
    edl = build_edl(guia, estilo)
    lectura = next(
        r for r in evaluate(edl, guia).readings if r.name == "repeated_share"
    )
    assert lectura.status != "alto", lectura.value
