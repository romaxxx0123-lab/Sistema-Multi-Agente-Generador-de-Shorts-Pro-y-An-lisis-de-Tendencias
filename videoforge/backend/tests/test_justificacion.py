"""Un efecto tiene que justificarse, no ocupar un cupo.

Es el freno que faltaba contra la sobreedicion, y el fallo era de raiz: cada
planner elige los mejores N que le permite su cupo, asi que **si el cupo da para
trece zooms, salen trece zooms**. Medido en una guia de 20 minutos con
`tutorial`: los zooms iban de 0.97 a **0.14** sobre 1, y cuatro de los trece
estaban por debajo de 0.25. Nadie los pidio; estaban ahi porque quedaba sitio.

Y habia algo peor: efectos cuyo valor era **una constante**. Las veintidos
transiciones valian 0.35 todas, y sin embargo el planner sabia perfectamente
cuales marcaban el principio de un capitulo y cuales caian donde la imagen ya
cambiaba sola. Sabia la diferencia y la tiraba a la basura.

Ahora los valores dicen la verdad, hay un suelo por debajo del cual un efecto no
entra, y el deslizador de intensidad es lo que siempre debio ser: no "pon mas
cosas", sino **cuanto me tienes que convencer**.
"""

from __future__ import annotations

import pytest

from forge.fixtures import synthetic_guide_analysis
from forge.plan.edl import EffectKind
from forge.plan.planner import build_edl
from forge.plan.restraint import MIN_JUSTIFIED, justification_bar
from forge.saturation.score import evaluate


@pytest.fixture(scope="module")
def guia():
    return synthetic_guide_analysis(duration=1200.0)


def _visibles(edl) -> list:
    return [e for e in edl.effects
            if e.kind.value not in ("grade", "caption", "music")]


# -- el suelo ---------------------------------------------------------------


def test_el_deslizador_es_cuanto_hay_que_convencer() -> None:
    assert justification_bar(50) == MIN_JUSTIFIED
    assert justification_bar(0) > justification_bar(50) > justification_bar(100)
    assert justification_bar(100) > 0


def test_a_mas_intensidad_entra_mas_cosa(guia) -> None:
    """Y el deslizador por fin decide algo de verdad."""
    cuentas = [len(_visibles(build_edl(guia, "tutorial", intensity=i)))
               for i in (0, 50, 100)]
    assert cuentas[0] < cuentas[2]
    assert cuentas == sorted(cuentas)


def test_lo_que_no_se_justifica_no_entra(guia) -> None:
    edl = build_edl(guia, "tutorial")
    suelo = justification_bar(edl.intensity)
    assert all(e.value_score >= suelo for e in _visibles(edl))


def test_lo_descartado_se_queda_en_reserva_y_se_dice(guia) -> None:
    """No se borra: el balanceador puede recuperarlo si el estilo lo pide."""
    edl = build_edl(guia, "tutorial")
    assert edl.candidates
    assert any("no justificarse" in n for n in edl.notes)
    assert any("A veces no editar es la decision" in n for n in edl.notes)


# -- los valores dicen la verdad --------------------------------------------


def test_una_transicion_de_capitulo_vale_mas_que_una_decorativa(guia) -> None:
    """Antes valian las dos 0.35, y el planner sabia cual era cual."""
    edl = build_edl(guia, "tutorial", intensity=100)   # que entren todas
    transiciones = [e for e in edl.effects if e.kind is EffectKind.TRANSITION]
    capitulo = [e for e in transiciones if "capitulo" in e.rationale]
    plano = [e for e in transiciones if "cambia el plano" in e.rationale]

    assert capitulo and plano
    assert min(e.value_score for e in capitulo) > max(e.value_score for e in plano)


def test_solo_sobreviven_las_de_capitulo_en_una_guia(guia) -> None:
    """En una guia de pantalla, un fundido donde la imagen ya cambiaba decora."""
    edl = build_edl(guia, "tutorial")
    transiciones = [e for e in edl.effects if e.kind is EffectKind.TRANSITION]
    assert transiciones
    assert all("capitulo" in e.rationale for e in transiciones)


def test_el_apetito_del_estilo_decide_si_lo_decorativo_se_queda(guia) -> None:
    """No lo decido yo: `fraction` es lo que el estilo declara que le gustan.

    Con 0.12 (una guia) una transicion decorativa no se sostiene sola; con 0.35
    (gaming) es parte del lenguaje del estilo y se queda.
    """
    guia_edl = build_edl(guia, "tutorial")
    hype_edl = build_edl(guia, "gaming-hype")

    def decorativas(edl) -> int:
        return sum(1 for e in edl.effects
                   if e.kind is EffectKind.TRANSITION and "cambia el plano" in e.rationale)

    assert decorativas(guia_edl) == 0
    assert decorativas(hype_edl) > 0


# -- y el medidor no obliga a rellenar --------------------------------------


def test_el_balanceador_no_repone_lo_que_no_se_justificaba(guia) -> None:
    """Es la trampa que cerraba el circulo de la sobreedicion.

    Un montaje limpio que el medidor lee como "sub-editado" se rellenaba con los
    efectos que el planner acababa de descartar **por no justificarse**: la app
    se sobreeditaba sola para contentar a su propio medidor.
    """
    from forge.saturation.balance import _best_candidate

    edl = build_edl(guia, "tutorial")
    suelo = justification_bar(edl.intensity)
    flojos = [c for c in edl.candidates if c.value_score < suelo]
    assert flojos, "en esta guia se descarto algo por flojo"

    elegido = _best_candidate(edl)
    assert elegido is None or elegido.value_score >= suelo


def test_el_montaje_limpio_sigue_estando_en_el_punto(guia) -> None:
    """Quitar veinte efectos no deja el video sub-editado: sobraban."""
    edl = build_edl(guia, "tutorial")
    reporte = evaluate(edl, guia)
    assert not reporte.is_under_edited, reporte.score
    assert len(_visibles(edl)) < 30


def test_lo_que_de_verdad_dice_algo_se_queda(guia) -> None:
    """El recorte no puede llevarse lo que sostiene el montaje."""
    edl = build_edl(guia, "tutorial")
    tipos = {e.kind for e in _visibles(edl)}
    assert EffectKind.TEXT_CARD in tipos, "los rotulos de capitulo se quedan"
    assert EffectKind.PUNCH_IN in tipos, "los zooms que valian se quedan"
    zooms = [e for e in _visibles(edl) if e.kind is EffectKind.PUNCH_IN]
    assert max(e.value_score for e in zooms) > 0.9
