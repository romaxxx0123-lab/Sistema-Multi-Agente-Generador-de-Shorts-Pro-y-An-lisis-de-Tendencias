"""Tests del auto-balanceador."""

from __future__ import annotations

import pytest

from forge.fixtures import synthetic_guide_analysis
from forge.plan.edl import (
    BrollEffect,
    CalloutEffect,
    CaptionEffect,
    Clip,
    EffectKind,
    SfxEffect,
)
from forge.plan.planner import build_edl
from forge.saturation.balance import _worst, rebalance
from forge.saturation.score import BUSY, UNDER_EDITED, evaluate


@pytest.fixture(scope="module")
def analysis():
    return synthetic_guide_analysis(300.0)


def _sobrecargado(analysis):
    """Montaje con montones de efectos de relleno de poco valor."""
    edl = build_edl(analysis, "tutorial")
    t = 0.0
    while t < edl.duration - 3:
        edl.effects += [
            BrollEffect(id=f"b{int(t)}", start=t, end=t + 2.5, cost_weight=0.9,
                        value_score=0.30, rationale="relleno"),
            CalloutEffect(id=f"k{int(t)}", start=t + 0.5, end=t + 2.0, cost_weight=0.8,
                          value_score=0.25, rationale="relleno"),
            SfxEffect(id=f"s{int(t)}", start=t, end=t + 0.4, cost_weight=0.8,
                      value_score=0.20, rationale="relleno"),
        ]
        t += 4.0
    return edl


def _sub_editado(analysis):
    """Pocos cortes y nada encima, pero con reservas disponibles."""
    edl = build_edl(analysis, "tutorial")
    edl.timeline = [
        Clip(id=f"c{i}", source_start=i * 60.0, source_end=min(300.0, (i + 1) * 60.0))
        for i in range(5)
    ]
    for e in list(edl.effects):
        if e.kind is not EffectKind.GRADE:
            edl.demote_effect(e.id)
    return edl


# -- el invariante ---------------------------------------------------------


def test_podar_no_cambia_la_duracion(analysis) -> None:
    """Es el invariante que sostiene todo: los efectos no tocan el montaje."""
    edl = _sobrecargado(analysis)
    antes = edl.duration
    clips_antes = [(c.source_start, c.source_end) for c in edl.timeline]

    rebalance(edl, analysis)

    assert edl.duration == pytest.approx(antes)
    assert [(c.source_start, c.source_end) for c in edl.timeline] == clips_antes


def test_anadir_tampoco_cambia_la_duracion(analysis) -> None:
    edl = _sub_editado(analysis)
    antes = edl.duration
    rebalance(edl, analysis)
    assert edl.duration == pytest.approx(antes)


# -- podar -----------------------------------------------------------------


def test_baja_la_saturacion_de_un_montaje_sobrecargado(analysis) -> None:
    edl = _sobrecargado(analysis)
    informe = rebalance(edl, analysis)

    assert informe.before.score > BUSY
    assert informe.after.score < informe.before.score
    assert informe.after.score <= BUSY + 1
    assert informe.removed


def test_quita_primero_lo_que_menos_aporta(analysis) -> None:
    """La eficiencia (valor/coste) ordena sola: no hay lista escrita a mano."""
    edl = _sobrecargado(analysis)
    subtitulos_antes = len(edl.effects_of(EffectKind.CAPTION))

    informe = rebalance(edl, analysis)

    quitados = {c.kind for c in informe.removed}
    assert quitados, "no quito nada"
    assert "caption" not in quitados, "los subtitulos deberian sobrevivir"
    assert len(edl.effects_of(EffectKind.CAPTION)) == subtitulos_antes


def test_nunca_quita_el_color_ni_la_musica(analysis) -> None:
    edl = _sobrecargado(analysis)
    rebalance(edl, analysis)
    assert edl.effects_of(EffectKind.GRADE)


def test_respeta_los_efectos_fijados_por_el_usuario(analysis) -> None:
    edl = _sobrecargado(analysis)
    for e in edl.effects:
        if e.kind is EffectKind.BROLL:
            e.locked = True
    fijados = {e.id for e in edl.effects if e.locked}

    informe = rebalance(edl, analysis)

    quitados = {c.effect_id for c in informe.removed}
    assert not (fijados & quitados)
    assert fijados <= {e.id for e in edl.effects}


def test_ataca_las_zonas_mas_cargadas(analysis) -> None:
    """Podar donde ya se esta por debajo empobrece sin arreglar nada."""
    edl = build_edl(analysis, "tutorial")
    # Todo el relleno concentrado en la primera mitad.
    t = 0.0
    while t < edl.duration / 2:
        edl.effects += [
            BrollEffect(id=f"b{int(t)}", start=t, end=t + 2.0, cost_weight=0.9, value_score=0.2),
            CalloutEffect(id=f"k{int(t)}", start=t, end=t + 2.0, cost_weight=0.9, value_score=0.2),
        ]
        t += 2.5

    informe = rebalance(edl, analysis)
    if informe.removed:
        en_la_primera_mitad = sum(1 for c in informe.removed if c.start < edl.duration / 2)
        assert en_la_primera_mitad / len(informe.removed) > 0.8


def test_los_efectos_quitados_quedan_en_reserva(analysis) -> None:
    """Se pueden recuperar si el usuario sube la intensidad."""
    edl = _sobrecargado(analysis)
    reservas_antes = len(edl.candidates)
    informe = rebalance(edl, analysis)
    assert len(edl.candidates) == reservas_antes + len(informe.removed)


# -- anadir ----------------------------------------------------------------


def test_sube_la_carga_de_un_montaje_sub_editado(analysis) -> None:
    edl = _sub_editado(analysis)
    informe = rebalance(edl, analysis)

    assert informe.before.score < UNDER_EDITED
    assert informe.after.score > informe.before.score
    assert informe.added


def test_solo_asciende_candidatos_que_no_pisan_a_otros(analysis) -> None:
    edl = _sub_editado(analysis)
    rebalance(edl, analysis)
    zooms = sorted(edl.effects_of(EffectKind.PUNCH_IN), key=lambda e: e.start)
    for anterior, siguiente in zip(zooms, zooms[1:]):
        assert siguiente.start >= anterior.end - 1e-6


# -- comportamiento general ------------------------------------------------


def test_un_montaje_en_banda_se_deja_en_paz(analysis) -> None:
    edl = build_edl(analysis, "tutorial")
    efectos_antes = {e.id for e in edl.effects}

    informe = rebalance(edl, analysis)

    assert not informe.changed
    assert informe.iterations == 0
    assert {e.id for e in edl.effects} == efectos_antes


def test_el_bucle_termina(analysis) -> None:
    edl = _sobrecargado(analysis)
    informe = rebalance(edl, analysis, max_iterations=500)
    assert informe.iterations < 500


def test_es_determinista(analysis) -> None:
    uno = _sobrecargado(analysis)
    otro = _sobrecargado(analysis)
    a = rebalance(uno, analysis)
    b = rebalance(otro, analysis)
    assert [c.effect_id for c in a.changes] == [c.effect_id for c in b.changes]
    assert a.after.score == b.after.score


def test_cada_cambio_explica_su_motivo(analysis) -> None:
    edl = _sobrecargado(analysis)
    informe = rebalance(edl, analysis)
    for c in informe.changes:
        assert c.reason
        assert c.describe()


def test_el_resumen_cuenta_lo_que_paso(analysis) -> None:
    edl = _sobrecargado(analysis)
    informe = rebalance(edl, analysis)
    resumen = informe.summary()
    assert "->" in resumen
    # El resumen redondea, no trunca.
    assert f"{informe.after.score:.0f}" in resumen
    assert informe.after.verdict in resumen


def test_la_intensidad_cambia_cuanto_poda(analysis) -> None:
    """Pedir menos edicion debe recortar mas."""
    poco = _sobrecargado(analysis)
    mucho = _sobrecargado(analysis)

    informe_poco = rebalance(poco, analysis, intensity=0)
    informe_mucho = rebalance(mucho, analysis, intensity=100)

    assert len(informe_poco.removed) > len(informe_mucho.removed)


def test_worst_elige_por_eficiencia() -> None:
    bueno = CaptionEffect(id="bueno", start=0, end=1, value_score=0.9, cost_weight=0.3)
    malo = SfxEffect(id="malo", start=0, end=1, value_score=0.2, cost_weight=0.9)
    assert _worst([bueno, malo]) is malo


def test_worst_con_lista_vacia() -> None:
    assert _worst([]) is None


# -- donde se anade, no solo cuanto -----------------------------------------


def test_lo_que_falta_se_pone_donde_falta(analysis) -> None:
    """El balanceador era asimetrico y eso se notaba en el montaje.

    Al podar miraba **donde** sobraba -- la ventana mas cargada -- pero al
    anadir cogia el mejor candidato del video entero sin mirar donde caia. Con
    un tramo ya cargado y otro vacio, metia lo nuevo donde ya habia cosas y
    dejaba el hueco como estaba. Un montaje no se juzga por su media: se ve en
    orden, y un minuto sin que pase nada se nota.
    """
    from forge.plan.edl import PunchInEffect, Rect
    from forge.saturation.balance import _best_candidate, _coldest_window

    edl = build_edl(analysis, "tutorial")
    edl.candidates = []
    # Dos reservas igual de buenas: una en un tramo lleno, otra en el vacio.
    lleno = min(e.start for e in edl.effects if e.kind is EffectKind.CAPTION)
    vacio, _ = _coldest_window(edl)
    for nombre, t in (("en-lo-lleno", lleno + 1.0), ("en-el-hueco", vacio + 2.0)):
        edl.candidates.append(PunchInEffect(
            id=nombre, start=t, end=t + 2.0, rect=Rect(x=0.2, y=0.2, w=0.6, h=0.6),
            value_score=0.7, cost_weight=0.4, rationale="reserva",
        ))

    inicio, fin = _coldest_window(edl)
    elegido = _best_candidate(edl, inicio, fin)
    assert elegido is not None and elegido.id == "en-el-hueco"

    # Y sin acotar tramo, el de siempre: el mejor sin mirar donde cae.
    assert _best_candidate(edl) is not None


def test_el_tramo_mas_vacio_no_es_el_mas_cargado(analysis) -> None:
    from forge.saturation.balance import _coldest_window, _hottest_window

    edl = build_edl(analysis, "tutorial")
    frio = _coldest_window(edl)
    caliente = _hottest_window(edl)
    assert not (frio[0] <= caliente[0] < frio[1])


def test_se_dice_que_se_relleno_el_hueco(analysis) -> None:
    edl = _sub_editado(analysis)
    informe = rebalance(edl, analysis, intensity=90)
    if informe.added:
        assert any("vacio" in c.reason or "corto" in c.reason for c in informe.added)
