"""Que el quinto no valga lo que valia el primero.

Cada planner tiene un cupo: "hasta doce zooms por minuto", "hasta diez efectos
de sonido por minuto". Y cumpliendolo al pie de la letra sale esto, medido
sobre una guia de 20 minutos con el estilo `gaming-hype`:

    310 efectos visibles en 13.2 min
    158 zooms + 132 sonidos + 20 transiciones
    el 45% empieza a menos de UN segundo del anterior
    racha de ONCE zooms seguidos

Ninguna regla se ha saltado: el cupo es de doce por minuto y se han puesto doce
por minuto. El problema es que **un cupo dice cuantos, y no dice como**. Y asi
es como una edicion automatica se delata: no por hacer cosas raras, sino por
hacer la misma cosa una y otra vez hasta que deja de significar nada. Un zoom
subraya; cinco zooms seguidos son el fondo de pantalla.

Lo que falta es lo que un montador lleva puesto sin pensarlo: **acabo de hacer
esto**. Y son dos cosas distintas:

1. **La racha.** Diez zooms seguidos sin nada por medio no es un estilo
   nervioso, es un bucle. Un montador alterna: subraya, corta, ensena, subraya.
   Aqui una racha se adelgaza quedandose con los que mas aportan, y los demas se
   van a reservas. Esto **no baja el ritmo del estilo**, lo obliga a variar.

2. **El exceso sobre lo que el propio estilo pidio.** Cada uso deja una huella
   que se apaga con la constante de tiempo que el estilo declara: si quiere doce
   zooms por minuto, usarlos mucho mas seguido que cada cinco segundos es
   repetirse *para ese estilo*. Asi `documentary` sigue siendo sobrio y
   `gaming-hype` sigue siendo nervioso, pero ninguno se queda en bucle.

Lo que no pasa el corte no se borra: **se manda a reservas**. Si luego el
montaje se queda corto, el auto-balanceador puede recuperarlo -- y lo hara en el
tramo que este mas vacio, que es justo donde repetirse no cansa.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from .edl import EDL, EffectKind

#: Ritmo al que el estilo usa cada recurso, si no lo dice en otro sitio. Se usa
#: solo como respaldo: casi todos salen de los ajustes del estilo.
DEFAULT_RATE = 4.0

#: Cuanto descuenta la fatiga como maximo. A 0.7, un recurso muy repetido
#: conserva el 30% de su valor: sigue pudiendo entrar si era buenisimo.
FATIGUE_WEIGHT = 0.7
#: Por debajo de este valor efectivo, el efecto pasa a reservas. Es el mismo
#: orden de magnitud que el valor de un efecto de relleno.
VALUE_FLOOR = 0.42

#: Los subtitulos y el color no cansan: van de principio a fin por definicion.
NEVER_TIRED = (EffectKind.CAPTION, EffectKind.GRADE, EffectKind.MUSIC)

#: Cuantos usos seguidos del mismo recurso, sin nada por medio, se aceptan
#: antes de considerarlo un bucle. Dos seguidos los hace cualquiera; a partir
#: del cuarto ya no subraya nada, es el fondo.
RUN_LIMIT = 3
#: Y a que distancia deja de contar como racha. Es un numero perceptivo y no
#: del estilo: lo que convierte tres usos en un bucle es que el espectador
#: todavia se acuerde del anterior. Diez transiciones repartidas a una por
#: minuto no son una racha aunque no haya nada entre ellas.
RUN_SECONDS = 20.0


def rate_for(kind: EffectKind, style) -> float:
    """Cada cuanto pide el estilo ese recurso, en usos por minuto."""
    if kind in (EffectKind.PUNCH_IN, EffectKind.KEN_BURNS):
        return float(getattr(style.emphasis, "max_punch_per_minute", DEFAULT_RATE))
    if kind is EffectKind.SFX:
        return float(getattr(style.sfx, "max_per_minute", DEFAULT_RATE))
    if kind is EffectKind.BROLL:
        return float(getattr(style.broll, "max_per_minute", DEFAULT_RATE))
    if kind is EffectKind.CALLOUT:
        return float(getattr(style.callouts, "max_per_minute", DEFAULT_RATE))
    return DEFAULT_RATE


def fatigue(previous: list[float], at: float, rate: float) -> float:
    """Cuanto se ha gastado ese recurso justo antes de este momento.

    Suma de huellas que se apagan, con la constante de tiempo que pide el
    estilo. Usandolo exactamente al ritmo pedido queda alrededor de 0.6; usandolo
    al doble de seguido, por encima de 1.5.
    """
    if rate <= 0:
        return 0.0
    tau = 60.0 / rate
    return sum(math.exp(-(at - t) / tau) for t in previous if t < at)


@dataclass(frozen=True)
class Tired:
    """Un efecto que se manda a reservas por repetido."""

    effect_id: str
    kind: str
    start: float
    fatigue: float
    value: float


def runs(efectos: list) -> list[list]:
    """Agrupa los usos seguidos del mismo recurso, sin nada por medio.

    "Seguidos" es en el montaje, no en la lista de su tipo: si entre dos zooms
    hay un sonido y una transicion, el ojo ha visto otra cosa por medio y la
    racha se rompe. Y "cerca" (`RUN_SECONDS`): dos usos a un minuto no son una
    racha por mucho que no haya nada entre ellos.

    Esta es **la** definicion de racha del proyecto: la usa tanto el freno de
    aqui como la metrica de repeticion del medidor de saturacion, para que lo
    que se corrige y lo que se mide sean la misma cosa.
    """
    grupos: list[list] = []
    actual: list = []
    for efecto in efectos:
        if (
            actual
            and efecto.kind is actual[-1].kind
            and efecto.start - actual[-1].start <= RUN_SECONDS
        ):
            actual.append(efecto)
            continue
        if len(actual) > 1:
            grupos.append(actual)
        actual = [efecto]
    if len(actual) > 1:
        grupos.append(actual)
    return grupos


def apply_restraint(edl: EDL, style) -> tuple[list[Tired], list[str]]:
    """Manda a reservas lo que solo esta ahi porque tocaba.

    Devuelve (lo retirado, notas para el informe). Modifica el EDL en el sitio.
    """
    visibles = [
        e for e in sorted(edl.effects, key=lambda e: (e.start, e.id))
        if e.kind not in NEVER_TIRED and not getattr(e, "locked", False)
    ]

    usados: dict[EffectKind, list[float]] = {}
    cansados: list[Tired] = []

    # 1. Las rachas: se adelgazan quedandose con lo que mas aporta.
    en_bucle: set[str] = set()
    for grupo in runs(visibles):
        if len(grupo) <= RUN_LIMIT:
            continue
        mejores = sorted(grupo, key=lambda e: -e.value_score)[:RUN_LIMIT]
        conservados = {e.id for e in mejores}
        for efecto in grupo:
            if efecto.id not in conservados:
                en_bucle.add(efecto.id)
                cansados.append(Tired(
                    effect_id=efecto.id, kind=efecto.kind.value,
                    start=round(efecto.start, 3), fatigue=float(len(grupo)),
                    value=round(efecto.value_score, 3),
                ))

    # 2. Y el exceso sobre el ritmo que el propio estilo pidio.
    for efecto in visibles:
        if efecto.id in en_bucle:
            continue

        ritmo = rate_for(efecto.kind, style)
        carga = fatigue(usados.get(efecto.kind, []), efecto.start, ritmo)
        # Hasta el ritmo que pide el estilo no se descuenta nada: el estilo
        # manda, y lo que se persigue es el exceso **sobre lo que pidio**.
        exceso = max(0.0, carga - 1.0)
        valor = efecto.value_score / (1.0 + FATIGUE_WEIGHT * exceso)

        if exceso > 0 and valor < VALUE_FLOOR:
            cansados.append(Tired(
                effect_id=efecto.id, kind=efecto.kind.value,
                start=round(efecto.start, 3), fatigue=round(carga, 2),
                value=round(valor, 3),
            ))
            continue

        usados.setdefault(efecto.kind, []).append(efecto.start)

    for t in cansados:
        edl.demote_effect(t.effect_id)

    notas: list[str] = []
    if cansados:
        por_tipo: dict[str, int] = {}
        for t in cansados:
            por_tipo[t.kind] = por_tipo.get(t.kind, 0) + 1
        detalle = ", ".join(f"{n} {k}" for k, n in sorted(por_tipo.items()))
        bucles = len(en_bucle)
        notas.append(
            f"{len(cansados)} efectos pasan a reserva por repetirse ({detalle})"
            + (f", {bucles} de ellos por venir en racha" if bucles else "")
            + ": el cuarto seguido ya no subraya nada."
        )
    return cansados, notas
