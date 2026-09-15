"""Zooms de enfasis y deriva de camara.

Un punch-in mal puesto marea; bien puesto es lo que hace que una guia parezca
editada por una persona. Solo se pone cuando se cumplen tres cosas a la vez:

1. **Hay algo que enfocar**: la saliencia del plano esta concentrada, no
   repartida por todo el fotograma.
2. **El plano no se mueve ya demasiado**: acercarse sobre una camara que ya se
   mueve es la receta del mareo.
3. **Ha pasado tiempo desde el anterior**: el estilo fija la separacion minima.

Si no se cumplen, no se hace zoom. Preferimos un montaje sobrio a uno nervioso.
"""

from __future__ import annotations

from ..analysis.types import Analysis
from .edl import EDL, KenBurnsEffect, PunchInEffect, Rect
from ..understand.segments import SegmentRole, role_at
from .styles import EmphasisRules, budget

#: Cada cuanto se evalua un posible zoom, en segundos de montaje.
CANDIDATE_STEP = 0.5
#: Concentracion minima de saliencia para que haya algo a lo que acercarse.
MIN_CONCENTRATION = 0.15


def _candidate_score(concentration: float, motion: float) -> float:
    """Cuanto merece la pena acercarse aqui."""
    return concentration * (1.0 - min(1.0, motion))


#: Cuanto vale un zoom segun la parte del video donde cae. Un aviso o un
#: consejo son momentos que la gente viene a buscar; la intro y el cierre se los
#: salta casi todo el mundo, asi que ahi un zoom es decoracion.
_PESO_NARRATIVO = {
    SegmentRole.WARNING: 1.6,
    SegmentRole.TIP: 1.3,
    SegmentRole.STEP: 1.1,
    SegmentRole.BODY: 1.0,
    SegmentRole.RECAP: 0.9,
    SegmentRole.INTRO: 0.6,
    SegmentRole.OUTRO: 0.5,
    SegmentRole.ASIDE: 0.5,
}


def _narrative_boost(narrative, source_time: float) -> float:
    """Multiplicador del valor de un zoom segun que parte del video sea."""
    if not narrative:
        return 1.0
    return _PESO_NARRATIVO.get(role_at(narrative, source_time), 1.0)


def plan_punch_ins(
    edl: EDL, analysis: Analysis, rules: EmphasisRules
) -> tuple[list[PunchInEffect], list[PunchInEffect]]:
    """Coloca los zooms de enfasis.

    Devuelve (elegidos, candidatos). Los candidatos son zooms que cumplen todas
    las condiciones pero no entraron por el tope de ritmo del estilo. Guardarlos
    permite al auto-balanceador subir la carga con decisiones que el planner ya
    valido, en vez de improvisar.
    """
    if not rules.punch_in or edl.duration <= 0:
        return [], []

    maximo = budget(rules.max_punch_per_minute, edl.duration, rules.punch_seconds * 2)

    # 1. Proponer candidatos a lo largo del montaje y puntuarlos.
    candidatos: list[tuple[float, float, float, float]] = []  # (score, t, cx, cy)
    t = rules.punch_seconds
    while t < edl.duration - rules.punch_seconds:
        origen = edl.timeline_to_source(t)
        if origen is None:
            t += CANDIDATE_STEP
            continue

        foco = analysis.focus_at(origen)
        movimiento = analysis.motion.value_at(origen) if analysis.motion else 0.0

        if (
            foco is not None
            and foco.concentration >= MIN_CONCENTRATION
            and movimiento <= rules.max_motion_for_punch
        ):
            puntos = _candidate_score(foco.concentration, movimiento)
            # Donde se avisa de algo ("ojo con esto", "fijate bien en este
            # boton") es justo donde un zoom vale mas: no es que la imagen sea
            # mas interesante ahi, es que lo que se esta diciendo lo es. Sin
            # esto, los zooms caen donde la saliencia da mas alta, que puede ser
            # cualquier sitio.
            puntos *= _narrative_boost(analysis.narrative, origen)
            candidatos.append((puntos, t, foco.cx, foco.cy))
        t += CANDIDATE_STEP

    # 2. Elegir los mejores respetando la separacion minima.
    cortes = edl.cut_points()
    elegidos: list[tuple[float, float, float, float]] = []
    reservas: list[tuple[float, float, float, float]] = []

    for score, inicio, cx, cy in sorted(candidatos, key=lambda c: -c[0]):
        fin = min(edl.duration, inicio + rules.punch_seconds)
        # Un zoom que se queda a medias al llegar un corte se ve como un fallo.
        if any(inicio < c < fin for c in cortes):
            continue
        ya_puestos = elegidos + reservas
        if any(abs(inicio - otro[1]) < rules.punch_min_gap for otro in ya_puestos):
            continue

        if len(elegidos) < maximo:
            elegidos.append((score, inicio, cx, cy))
        elif len(reservas) < maximo + 4:
            # Solo guardamos unas cuantas reservas: mas no aportan y engordan
            # el EDL sin motivo.
            reservas.append((score, inicio, cx, cy))

    elegidos.sort(key=lambda c: c[1])
    reservas.sort(key=lambda c: c[1])

    coste = min(1.0, (rules.punch_zoom - 1.0) * 2.5)

    def construir(lote, prefijo):
        return [
            PunchInEffect(
                id=f"{prefijo}{i:03d}",
                start=round(inicio, 3),
                end=round(min(edl.duration, inicio + rules.punch_seconds), 3),
                rect=Rect.centered(cx, cy, rules.punch_zoom),
                drift=rules.punch_drift,
                value_score=round(score, 3),
                cost_weight=round(coste, 3),
                rationale=(
                    f"zoom a ({cx:.0%}, {cy:.0%}): la atencion se concentra ahi "
                    f"y el plano esta quieto"
                ),
            )
            for i, (score, inicio, cx, cy) in enumerate(lote)
        ]

    return construir(elegidos, "punch"), construir(reservas, "punchalt")


def plan_ken_burns(edl: EDL, analysis: Analysis, rules: EmphasisRules) -> list[KenBurnsEffect]:
    """Deriva lenta sobre los planos largos y quietos, para que respiren."""
    if not rules.ken_burns:
        return []

    efectos: list[KenBurnsEffect] = []
    inicio_tl = 0.0
    for i, clip in enumerate(edl.timeline):
        fin_tl = inicio_tl + clip.duration
        movimiento = (
            analysis.motion.mean_between(clip.source_start, clip.source_end)
            if analysis.motion
            else 0.0
        )
        # Solo tiene sentido en planos largos que de otro modo pareceran fijos.
        if clip.duration >= 3.0 and movimiento < 0.2:
            foco = analysis.focus_at(clip.source_start)
            cx, cy = (foco.cx, foco.cy) if foco else (0.5, 0.5)
            efectos.append(
                KenBurnsEffect(
                    id=f"kb{i:03d}",
                    start=round(inicio_tl, 3),
                    end=round(fin_tl, 3),
                    rect_start=Rect(),
                    rect_end=Rect.centered(cx, cy, rules.ken_burns_zoom),
                    value_score=0.45,
                    cost_weight=0.18,
                    rationale="deriva lenta: el plano es largo y esta practicamente quieto",
                )
            )
        inicio_tl = fin_tl

    return efectos
