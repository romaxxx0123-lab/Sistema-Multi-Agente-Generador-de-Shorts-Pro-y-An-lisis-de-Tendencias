"""Las metricas que describen cuanto se ha editado un montaje.

Cada una mide una forma distinta de cargar al espectador, y cada estilo define
su banda objetivo para cada una. Lo que en una guia es sobrecarga, en un short
de gameplay es el minimo esperable: por eso el diagnostico no es absoluto sino
relativo al estilo elegido.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from ..analysis.types import Analysis
from ..plan.captions import reading_speed_wpm
from ..plan.edl import EDL, CaptionEffect, EffectKind
from .density import RATE, density_curve

#: Tipos que tapan la imagen de fondo.
OVERLAY_KINDS = (EffectKind.BROLL,)
#: Tipos que ponen texto en pantalla.
TEXT_KINDS = (EffectKind.CAPTION, EffectKind.TEXT_CARD, EffectKind.LOWER_THIRD)
#: Ambiente: estan todo el rato y el ojo los normaliza, asi que no cuentan
#: como "capas simultaneas".
AMBIENT_KINDS = (EffectKind.GRADE, EffectKind.MUSIC)

#: Por encima de este movimiento, meter un zoom es un conflicto.
MOTION_CONFLICT_THRESHOLD = 0.55


@dataclass
class Metrics:
    """Vector de metricas de un montaje."""

    duration: float
    cuts_per_minute: float
    effect_density_mean: float
    effect_density_peak: float
    overlay_coverage: float
    text_coverage: float
    max_layers: float
    sfx_per_minute: float
    transitions_per_minute: float
    caption_wpm: float
    motion_conflicts_per_minute: float
    callouts_per_minute: float = 0.0
    zooms_per_minute: float = 0.0
    #: Que parte del montaje se apoya en repetir el mismo recurso. La densidad
    #: no distingue once zooms seguidos de once efectos variados, y en pantalla
    #: no se parecen en nada: lo primero deja de significar algo a la tercera
    #: vez. Por eso hace falta medirlo aparte.
    repeated_share: float = 0.0

    def as_dict(self) -> dict[str, float]:
        return {
            "cuts_per_minute": self.cuts_per_minute,
            "effect_density_mean": self.effect_density_mean,
            "effect_density_peak": self.effect_density_peak,
            "overlay_coverage": self.overlay_coverage,
            "text_coverage": self.text_coverage,
            "max_layers": self.max_layers,
            "sfx_per_minute": self.sfx_per_minute,
            "callouts_per_minute": self.callouts_per_minute,
            "zooms_per_minute": self.zooms_per_minute,
            "transitions_per_minute": self.transitions_per_minute,
            "caption_wpm": self.caption_wpm,
            "motion_conflicts_per_minute": self.motion_conflicts_per_minute,
            "repeated_share": self.repeated_share,
        }


def _coverage(edl: EDL, kinds: tuple[EffectKind, ...]) -> float:
    """Fraccion del montaje cubierta por esos tipos, sin contar solapes dos veces."""
    if edl.duration <= 0:
        return 0.0

    intervalos = sorted(
        (e.start, e.end) for e in edl.effects if e.kind in kinds and e.end > e.start
    )
    if not intervalos:
        return 0.0

    total = 0.0
    inicio, fin = intervalos[0]
    for a, b in intervalos[1:]:
        if a <= fin:
            fin = max(fin, b)
        else:
            total += fin - inicio
            inicio, fin = a, b
    total += fin - inicio
    return min(1.0, total / edl.duration)


def layers_curve(edl: EDL, rate: float = RATE) -> np.ndarray:
    """Cuantos efectos no ambientales hay encima en cada instante.

    Se expone porque el maximo no basta: saber que en algun momento hay cuatro
    capas no dice **donde**, y el balanceador necesita el donde para podar ahi y
    no en la ventana mas caliente de la curva de densidad, que puede ser otra.
    """
    if edl.duration <= 0:
        return np.zeros(0, dtype=np.int16)

    n = max(1, int(round(edl.duration * rate)))
    capas = np.zeros(n, dtype=np.int16)
    for e in edl.effects:
        if e.kind in AMBIENT_KINDS:
            continue
        a = max(0, int(e.start * rate))
        b = min(n, max(a + 1, int(e.end * rate)))
        capas[a:b] += 1
    return capas


def _max_layers(edl: EDL, rate: float = RATE) -> float:
    """Maximo de efectos no ambientales activos a la vez."""
    capas = layers_curve(edl, rate)
    return float(capas.max()) if capas.size else 0.0


def _per_minute(count: int, duration: float) -> float:
    return count / (duration / 60.0) if duration > 0 else 0.0


def _motion_conflicts(edl: EDL, analysis: Analysis | None) -> int:
    """Zooms colocados donde la imagen ya se mueve mucho.

    Acercarse sobre una camara que ya se mueve marea, y es un fallo que no
    aparece en ninguna otra metrica: el efecto es uno solo y parece inofensivo.
    """
    if analysis is None or analysis.motion is None:
        return 0

    conflictos = 0
    for e in edl.effects:
        if e.kind not in (EffectKind.PUNCH_IN, EffectKind.KEN_BURNS):
            continue
        origen = edl.timeline_to_source((e.start + e.end) / 2)
        if origen is None:
            continue
        if analysis.motion.value_at(origen) > MOTION_CONFLICT_THRESHOLD:
            conflictos += 1
    return conflictos


def _repeated_share(edl: EDL) -> float:
    """Que fraccion de los efectos llega en racha del mismo recurso.

    Cero si el montaje alterna siempre; uno si todo viene en rachas. Se cuenta
    en el montaje y no por tipos: si entre dos zooms hay un rotulo, el ojo ha
    visto otra cosa por medio y la racha se rompe. Y cuenta el tiempo: usos
    espaciados no son una racha aunque no haya nada entre ellos.
    """
    from ..plan.restraint import NEVER_TIRED, RUN_LIMIT, runs

    visibles = sorted(
        (e for e in edl.effects if e.kind not in NEVER_TIRED),
        key=lambda e: (e.start, e.id),
    )
    if len(visibles) < RUN_LIMIT:
        return 0.0

    # Misma definicion de racha que usa el freno del planner, para que lo que
    # se mide y lo que se corrige sean la misma cosa.
    en_racha = sum(len(g) for g in runs(visibles) if len(g) >= RUN_LIMIT)
    return round(en_racha / len(visibles), 4)


def compute_metrics(edl: EDL, analysis: Analysis | None = None) -> Metrics:
    """Calcula todas las metricas de un montaje."""
    curva = density_curve(edl)
    captions = [e for e in edl.effects if isinstance(e, CaptionEffect)]

    return Metrics(
        duration=edl.duration,
        cuts_per_minute=_per_minute(len(edl.cut_points()), edl.duration),
        effect_density_mean=float(curva.mean()) if curva.size else 0.0,
        # El pico usa el percentil 95 y no el maximo: un unico fotograma
        # cargado no describe el montaje, pero arruinaria la lectura.
        effect_density_peak=float(np.percentile(curva, 95)) if curva.size else 0.0,
        overlay_coverage=_coverage(edl, OVERLAY_KINDS),
        text_coverage=_coverage(edl, TEXT_KINDS),
        max_layers=_max_layers(edl),
        sfx_per_minute=_per_minute(len(edl.effects_of(EffectKind.SFX)), edl.duration),
        callouts_per_minute=_per_minute(
            len(edl.effects_of(EffectKind.CALLOUT)), edl.duration
        ),
        # Los zooms no se median. El motor solo los veia diluidos en la
        # densidad general, asi que una guia de 20 minutos con sesenta
        # zooms (uno cada 17 segundos, la pelicula entera) le parecia
        # perfectamente normal.
        zooms_per_minute=_per_minute(
            len(edl.effects_of(EffectKind.PUNCH_IN))
            + len(edl.effects_of(EffectKind.KEN_BURNS)),
            edl.duration,
        ),
        transitions_per_minute=_per_minute(
            len(edl.effects_of(EffectKind.TRANSITION)), edl.duration
        ),
        repeated_share=_repeated_share(edl),
        caption_wpm=reading_speed_wpm(captions),
        motion_conflicts_per_minute=_per_minute(
            _motion_conflicts(edl, analysis), edl.duration
        ),
    )
