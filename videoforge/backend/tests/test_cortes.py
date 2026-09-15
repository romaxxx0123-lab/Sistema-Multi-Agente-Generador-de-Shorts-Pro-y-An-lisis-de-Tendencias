"""Que un corte se pague lo que cuesta.

En una grabacion de pantalla un corte **se ve**: la imagen da un salto. La
seleccion no se hacia esa pregunta -- quitaba lo que pasaba del umbral y ya --,
y medido sobre una guia de 20 minutos salia el peor negocio posible: **28
cortes, el 11%, ahorraban menos de tres decimas cada uno; 2 segundos entre los
28**.

Lo que se anade es el juicio que faltaba, con las dos mitades:

- **cuanto cuesta**: si en ese instante el plano ya cambia, o la pantalla se
  esta moviendo, el salto queda escondido detras de algo que iba a pasar igual;
  en mitad de una pantalla quieta el corte es lo unico que se mueve;
- **cuanto se gana**: los segundos, y por que. Una pausa solo vale el tiempo;
  una muletilla molesta; una toma fallida hay que quitarla dure lo que dure.
"""

from __future__ import annotations

import statistics

import pytest

from forge.analysis.types import MotionTrack, Shot
from forge.fixtures import synthetic_guide_analysis
from forge.plan.cuts import (
    MIN_WORTH,
    MOVING,
    SHOT_SNAP,
    cut_cost,
    judge_cut,
)
from forge.plan.planner import build_edl
from forge.plan.select import plan_selection
from forge.plan.styles import load_style


class _Analisis:
    """Lo minimo que mira `cuts.py`: los planos y el movimiento."""

    def __init__(self, shots=(), movimiento: float = 0.0) -> None:
        self.shots = list(shots)
        self.motion = MotionTrack(rate=4.0, flow=[movimiento] * 400)


# -- lo que cuesta un corte -------------------------------------------------


def test_en_una_pantalla_quieta_el_corte_se_ve_entero() -> None:
    assert cut_cost(_Analisis(), 10.0) == 1.0


def test_donde_el_plano_ya_cambia_el_corte_es_gratis() -> None:
    """El salto queda detras de un cambio que iba a pasar igual."""
    a = _Analisis(shots=[Shot(index=0, start=0.0, end=10.0),
                         Shot(index=1, start=10.0, end=20.0)])
    assert cut_cost(a, 10.0) == 0.0
    assert cut_cost(a, 10.0 + SHOT_SNAP / 2) == 0.0
    # Y a medio plano vuelve a costar lo suyo.
    assert cut_cost(a, 15.0) == 1.0


def test_con_la_pantalla_moviendose_el_corte_se_disimula() -> None:
    quieta = cut_cost(_Analisis(movimiento=0.0), 10.0)
    moviendose = cut_cost(_Analisis(movimiento=MOVING * 2), 10.0)
    assert moviendose < quieta


# -- lo que gana ------------------------------------------------------------


def test_una_pausa_corta_no_vale_un_salto() -> None:
    assert not judge_cut(_Analisis(), 10.0, 10.2, "silencio")


def test_una_pausa_larga_si() -> None:
    assert judge_cut(_Analisis(), 10.0, 10.0 + MIN_WORTH + 0.1, "silencio")


def test_una_muletilla_vale_mas_que_una_pausa() -> None:
    """"Eeeh" molesta; una pausa de la misma duracion no molesta a nadie."""
    assert not judge_cut(_Analisis(), 10.0, 10.2, "silencio")
    assert judge_cut(_Analisis(), 10.0, 10.2, "muletilla")


def test_una_toma_fallida_se_quita_dure_lo_que_dure() -> None:
    """Ahi lo que sobra no es tiempo, es un error."""
    assert judge_cut(_Analisis(), 10.0, 10.05, "toma fallida")
    assert judge_cut(_Analisis(), 10.0, 10.05, "te lo saltas")


def test_la_misma_pausa_si_vale_si_el_corte_no_se_nota() -> None:
    """La otra mitad del juicio: donde cortar cuesta poco, se corta."""
    quieta = _Analisis()
    con_cambio = _Analisis(shots=[Shot(index=0, start=0.0, end=10.0),
                                  Shot(index=1, start=10.0, end=20.0)])
    assert not judge_cut(quieta, 9.9, 10.1, "silencio")
    assert judge_cut(con_cambio, 9.9, 10.1, "silencio")


def test_el_corte_se_paga_por_su_punta_mas_cara() -> None:
    """Entrar limpio y salir con un salto sigue siendo un salto."""
    a = _Analisis(shots=[Shot(index=0, start=0.0, end=10.0),
                         Shot(index=1, start=10.0, end=30.0)])
    # Empieza escondido en el cambio de plano y acaba lejos, ya en mitad del
    # siguiente: si se mirase la punta barata, esto pasaria.
    fuera = judge_cut(a, 10.0, 10.0 + MIN_WORTH - 0.01, "silencio")
    assert not fuera and fuera.cost == 1.0
    # Y el mismo recorte entero dentro del cambio de plano si pasa.
    assert judge_cut(a, 9.9, 10.1, "silencio")


# -- y el efecto en el montaje ----------------------------------------------


@pytest.fixture(scope="module")
def guia():
    return synthetic_guide_analysis(duration=1200.0)


def _cortes(seleccion) -> list[float]:
    return [round(r.duration, 3) for r in seleccion.removals]


def test_desaparecen_los_cortes_que_no_ahorran_nada(guia) -> None:
    """La medida del fallo, sobre la guia de 20 minutos."""
    reglas = load_style("tutorial").pacing
    seleccion = plan_selection(guia, reglas, guia.narrative)

    quitados = _cortes(seleccion)
    inutiles = [q for q in quitados if q < 0.3]
    descartados = [r.duration for r in seleccion.unworthy_cuts]

    assert descartados, "en esta guia habia cortes que no compensaban"
    # Lo que se descarto era calderilla: muchos cortes, casi ningun segundo.
    assert sum(descartados) < 2.0
    assert len(descartados) > 10
    # Y lo que queda casi no tiene cortes de miseria. Los pocos que quedan son
    # los que caen donde el plano ya cambiaba, que no se ven.
    assert len(inutiles) <= len(descartados) / 4


def test_no_se_pierde_metraje_por_no_cortar(guia) -> None:
    """El precio de los 25 saltos que se evitan es de un segundo."""
    reglas = load_style("tutorial").pacing
    seleccion = plan_selection(guia, reglas, guia.narrative)
    perdido = sum(r.duration for r in seleccion.unworthy_cuts)
    assert perdido < 0.01 * seleccion.kept_seconds


def test_ya_no_quedan_fragmentos_de_tartamudeo(guia) -> None:
    """Efecto de regalo: al no cortar, los trozos sueltos se unen al vecino.

    Un trozo de menos de un segundo entre dos saltos no se lee como montaje,
    se lee como un fallo de reproduccion.
    """
    edl = build_edl(guia, "tutorial")
    duraciones = [c.source_end - c.source_start for c in edl.timeline]
    assert min(duraciones) >= 1.0, min(duraciones)
    assert statistics.median(duraciones) > 2.0


def test_el_montaje_lo_cuenta(guia) -> None:
    edl = build_edl(guia, "tutorial")
    assert any("cortes no se hicieron" in n for n in edl.notes)
