"""Que un corte se pague lo que cuesta.

En una guia grabada de pantalla, un corte **se ve**: la imagen da un salto y el
espectador lo nota aunque no sepa nombrarlo. Hasta aqui la seleccion no se
hacia esa pregunta. Quitaba los silencios que pasaban del umbral, les devolvia
un poco de aire por los lados, alargaba los trozos demasiado cortos... y lo que
quedaba recortado, recortado se quedaba, valiera lo que valiera.

Medido sobre una guia de 20 minutos (260 clips): **28 cortes -- el 11% -- se
ahorraban menos de tres decimas cada uno, 2 segundos entre los 28**. Es el peor
negocio posible: un salto visible a cambio de nada. Y el 15% ahorraba menos de
medio segundo.

Asi que aqui se hace la pregunta que faltaba, con dos partes:

1. **Cuanto cuesta este corte.** No cuesta lo mismo en todos los sitios: si en
   ese instante el plano ya cambia -- hay un corte de escena, o la pantalla se
   esta moviendo -- el salto queda escondido detras de un cambio que iba a pasar
   igual. Cortar ahi es casi gratis. En mitad de una pantalla quieta, en cambio,
   el corte es lo unico que se mueve.
2. **Cuanto se gana.** Los segundos que se quitan, y **por que**. Quitar un
   "eeeh" no es lo mismo que quitar una pausa: la pausa no molesta a nadie, la
   muletilla si. Y una toma fallida hay que quitarla dure lo que dure, porque lo
   que sobra ahi no es tiempo, es un error.

Lo que no se paga, no se corta: el silencio se queda, y nadie lo echa de menos.
"""

from __future__ import annotations

from dataclasses import dataclass

#: Lo que tiene que ahorrar un corte en mitad de una pantalla quieta para que
#: compense verlo. Por debajo de esto el espectador nota el salto y no nota la
#: pausa que le has quitado.
MIN_WORTH = 0.45
#: Y lo que basta cuando el corte queda escondido tras un cambio de plano.
MIN_WORTH_HIDDEN = 0.12
#: Lo cerca que tiene que estar un cambio de plano para esconder el corte.
SHOT_SNAP = 0.40
#: Movimiento por encima del cual la pantalla ya esta cambiando sola.
MOVING = 0.05

#: Lo que vale quitar cada cosa, comparado con quitar un silencio. Una toma
#: fallida o algo que tu mismo mandas saltar se quitan siempre; una muletilla
#: vale mas que una pausa porque molesta; una pausa solo vale el tiempo.
WORTH_BY_REASON = {
    "silencio": 1.0,
    "muletilla": 2.5,
    "toma fallida": 100.0,
    "te lo saltas": 100.0,
}


@dataclass(frozen=True)
class CutJudgement:
    """Si ese recorte compensa, y con que cuentas."""

    keep_cut: bool
    cost: float
    worth: float
    reason: str

    def __bool__(self) -> bool:
        return self.keep_cut


def cut_cost(analysis, at: float) -> float:
    """Como de visible es un corte en ese instante, de 0 a 1.

    Cero cuando el plano ya cambia ahi y el salto pasa desapercibido; uno
    cuando la pantalla esta quieta y el corte es lo unico que se mueve.
    """
    if analysis is None:
        return 1.0

    # 1. ¿Hay un cambio de plano justo ahi? Entonces el salto ya estaba.
    for shot in getattr(analysis, "shots", None) or ():
        if abs(shot.start - at) <= SHOT_SNAP or abs(shot.end - at) <= SHOT_SNAP:
            return 0.0

    # 2. ¿Se esta moviendo la pantalla? Un corte dentro de un movimiento se
    #    disimula; en una guia esto es el momento de arrastrar una ventana o de
    #    hacer scroll.
    movimiento = getattr(analysis, "motion", None)
    if movimiento is not None:
        pico = movimiento.peak_between(max(0.0, at - 0.25), at + 0.25)
        if pico >= MOVING:
            return max(0.0, 1.0 - min(1.0, pico / (MOVING * 3)))

    return 1.0


def judge_cut(analysis, start: float, end: float, reason: str) -> CutJudgement:
    """Decide si ese recorte compensa el corte que deja."""
    ahorro = max(0.0, end - start)
    factor = WORTH_BY_REASON.get(reason, 1.0)
    # El corte se paga dos veces, una por cada punta, asi que se mira la mas
    # cara: entrar limpio y salir con un salto sigue siendo un salto.
    coste = max(cut_cost(analysis, start), cut_cost(analysis, end))
    umbral = MIN_WORTH_HIDDEN + (MIN_WORTH - MIN_WORTH_HIDDEN) * coste

    if ahorro * factor >= umbral:
        return CutJudgement(True, round(coste, 3), round(ahorro, 3), reason)
    return CutJudgement(
        False, round(coste, 3), round(ahorro, 3),
        f"{reason} de {ahorro:.2f}s: no compensa el salto",
    )
