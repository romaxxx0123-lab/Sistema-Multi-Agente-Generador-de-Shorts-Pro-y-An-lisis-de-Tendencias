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

from typing import NamedTuple

from ..analysis.types import Analysis
from .edl import EDL, KenBurnsEffect, PunchInEffect, Rect
from ..understand.segments import SegmentRole, role_at
from ..understand.speech_cues import CueKind
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


#: Cuanto sube el valor de un zoom si ahi se esta senalando o enfatizando algo.
CUE_BOOST = {CueKind.POINT: 1.4, CueKind.EMPHASIS: 1.35}
#: Margen alrededor de la senal en el que cuenta, en segundos.
CUE_WINDOW = 1.2
#: Puntuacion de un zoom colocado por lo que se dice. Alta a proposito: decir
#: "mira arriba a la derecha" es la senal mas clara que existe de que ahi hay
#: algo que ver, mucho mas que cualquier medida de la imagen.
POINTED_SCORE = 0.95


def _cue_boost(cues, source_time: float) -> float:
    """Multiplicador si en ese instante se senala o se enfatiza algo."""
    if not cues:
        return 1.0
    factor = 1.0
    for c in cues:
        if c.start - CUE_WINDOW <= source_time <= c.end + CUE_WINDOW:
            factor = max(factor, CUE_BOOST.get(c.kind, 1.0))
    return factor


#: Por debajo de esto, acercarse no se nota y solo gasta cupo.
MIN_USEFUL_ZOOM = 1.03

#: Aire que se deja a cada lado de lo que se encuadra, en fracciones de
#: pantalla. Un boton pegado al borde del recorte se lee como un fallo.
TARGET_MARGIN = 0.04


class _Candidate(NamedTuple):
    """Un zoom propuesto, antes de saber si cabe en el ritmo del estilo."""

    score: float
    start: float
    cx: float
    cy: float
    #: cuanto se acerca. Fijo para los que salen de la saliencia; calculado
    #: cuando se sabe **que** se encuadra.
    zoom: float
    #: el texto de pantalla que se estaba nombrando, si lo habia
    target: str = ""


def _framing_zoom(box, rules) -> float:
    """Cuanto hay que acercarse para que eso que nombras se vea de verdad.

    El zoom de enfasis es el mismo para todo (1,18), porque hasta ahora no se
    sabia a **que** se acercaba. Sabiendo el tamano del elemento se puede
    encuadrar: un boton de un 9% de ancho pide mucho mas acercamiento que un
    panel que ya ocupa media pantalla.

    Con un zoom `z` se ve `1/z` de la imagen, asi que algo de ancho `w` pasa a
    ocupar `w * z`. Despejando para que ocupe lo que pide el estilo sale el
    zoom, y se recorta por dos sitios: por arriba, porque en una grabacion de
    pantalla lo que se gana en tamano se pierde en nitidez; y por el tamano del
    propio elemento, porque un zoom que **corta** lo que estas senalando es
    peor que no acercarse. Eso ultimo es lo que hace que un panel ancho salga
    con un zoom minimo o con ninguno, en vez de quedarse a medias.
    """
    if not box:
        return rules.punch_zoom
    ancho = max(box[2], box[3], 0.01)
    deseado = rules.punch_target_share / ancho
    # El zoom mas cerrado en el que eso todavia cabe entero, con aire.
    cabe = 1.0 / min(1.0, ancho + 2 * TARGET_MARGIN)
    tope = max(1.0, min(rules.punch_zoom_max, cabe))
    return round(min(max(deseado, rules.punch_zoom), tope), 3)


def _pointed_candidates(edl: EDL, analysis: Analysis, rules) -> list:
    """Zooms colocados por lo que se dice, apuntando a lo que se nombra."""
    salida = []
    for c in analysis.cues:
        if c.kind is not CueKind.POINT or c.region is None:
            continue
        t = edl.source_to_timeline(c.start)
        if t is None or t < 0.2 or t > edl.duration - rules.punch_seconds:
            continue
        # El movimiento se mira en **toda la ventana** del zoom y por su pico,
        # no en el instante en que empieza. Medido en la guia de veinte
        # minutos, cuatro de diecinueve zooms arrancaban sobre imagen quieta
        # (0,08) y acababan sobre un barrido de camara (0,58): el planner los
        # daba por buenos y el medidor de saturacion los contaba como conflicto
        # despues, cuando ya estaban puestos.
        movimiento = (
            analysis.motion.peak_between(c.start, c.start + rules.punch_seconds)
            if analysis.motion else 0.0
        )
        if movimiento > rules.max_motion_for_punch:
            continue
        zoom = _framing_zoom(c.box, rules)
        if zoom < MIN_USEFUL_ZOOM:
            # Lo que senalas ocupa ya casi toda la pantalla: no hay a donde
            # acercarse. Un zoom de 1,0 no es un zoom, es un efecto vacio que
            # ocupa sitio en el cupo y suma en el medidor de saturacion.
            continue
        salida.append(_Candidate(
            score=POINTED_SCORE * c.strength,
            start=t,
            cx=c.region[0],
            cy=c.region[1],
            zoom=zoom,
            target=c.target,
        ))
    return salida


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
    candidatos: list[_Candidate] = []
    t = rules.punch_seconds
    while t < edl.duration - rules.punch_seconds:
        origen = edl.timeline_to_source(t)
        if origen is None:
            t += CANDIDATE_STEP
            continue

        foco = analysis.focus_at(origen)
        movimiento = (
            analysis.motion.peak_between(origen, origen + rules.punch_seconds)
            if analysis.motion else 0.0
        )

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
            puntos *= _cue_boost(analysis.cues, origen)
            candidatos.append(_Candidate(puntos, t, foco.cx, foco.cy, rules.punch_zoom))
        t += CANDIDATE_STEP

    # Donde dices **donde** hay que mirar ("este boton de arriba a la derecha"),
    # el encuadre lo decide lo que dices, no el mapa de saliencia. La saliencia
    # sabe donde hay contraste; tu sabes donde hay que mirar, y eso gana.
    candidatos += _pointed_candidates(edl, analysis, rules)

    # 2. Elegir los mejores respetando la separacion minima.
    cortes = edl.cut_points()
    elegidos: list[_Candidate] = []
    reservas: list[_Candidate] = []

    for candidato in sorted(candidatos, key=lambda c: -c.score):
        inicio = candidato.start
        fin = min(edl.duration, inicio + rules.punch_seconds)
        # Un zoom que se queda a medias al llegar un corte se ve como un fallo.
        if any(inicio < c < fin for c in cortes):
            continue
        ya_puestos = elegidos + reservas
        if any(abs(inicio - otro.start) < rules.punch_min_gap for otro in ya_puestos):
            continue

        if len(elegidos) < maximo:
            elegidos.append(candidato)
        elif len(reservas) < maximo + 4:
            # Solo guardamos unas cuantas reservas: mas no aportan y engordan
            # el EDL sin motivo.
            reservas.append(candidato)

    elegidos.sort(key=lambda c: c.start)
    reservas.sort(key=lambda c: c.start)

    def construir(lote, prefijo):
        efectos = []
        for i, (score, inicio, cx, cy, zoom, nombre) in enumerate(lote):
            # Un zoom mas cerrado molesta mas: cuesta en proporcion a lo que se
            # acerca, no un valor fijo para todos.
            coste = min(1.0, (zoom - 1.0) * 2.5)
            porque = (
                f'zoom sobre "{nombre}": ahi lo estas senalando'
                if nombre else
                f"zoom a ({cx:.0%}, {cy:.0%}): la atencion se concentra ahi "
                f"y el plano esta quieto"
            )
            efectos.append(PunchInEffect(
                id=f"{prefijo}{i:03d}",
                start=round(inicio, 3),
                end=round(min(edl.duration, inicio + rules.punch_seconds), 3),
                rect=Rect.centered(cx, cy, zoom),
                drift=rules.punch_drift,
                value_score=round(score, 3),
                cost_weight=round(coste, 3),
                rationale=porque,
            ))
        return efectos

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
