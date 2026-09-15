"""Sonidos que acompanan a algo que pasa en la imagen.

Los estilos llevaban `sfx.enabled` y `max_per_minute` desde el principio --
`gaming-hype` pedia diez por minuto -- y no sonaba ninguno: estaban el
sintetizador, el tipo de efecto y la mezcla en el render, pero **nadie los
colocaba**. Prometer y no hacer es peor que no prometer.

La regla que los hace coherentes es una sola: **un sonido no va solo**. Un
"whoosh" sin nada que se mueva es ruido; el mismo whoosh sobre una transicion
es lo que hace que la transicion se note menos rara. Asi que cada sonido se
engancha a un efecto que ya esta decidido:

    transicion   -> whoosh    la imagen cambia
    rotulo       -> riser     entra un grafico
    zoom         -> impact    la camara se acerca de golpe

Y si ese efecto desaparece -- porque el balanceador lo quito o porque quedaba
debajo de un b-roll -- el sonido se va con el (ver `conflicts.py`). Un sonido
sin motivo es la forma mas barata de que un montaje automatico se note.
"""

from __future__ import annotations

from .edl import EDL, BaseEffect, EffectKind, SfxEffect
from .styles import SfxRules, budget

#: Que sonido acompana a que, y cuanto aporta. El orden importa: cuando no
#: caben todos, se quedan los primeros.
ANCLAS: tuple[tuple[EffectKind, str, float], ...] = (
    (EffectKind.TRANSITION, "whoosh", 0.55),
    (EffectKind.TEXT_CARD, "riser", 0.5),
    (EffectKind.PUNCH_IN, "impact", 0.4),
)
#: Separacion minima entre dos sonidos. Mas juntos se pisan y cansan.
MIN_GAP = 2.0
#: Lo que cuesta un sonido en el medidor de saturacion. Poco: no tapa nada.
SFX_COST = 0.25
#: Un sonido se coloca un pelin antes de lo que acompana, que es como se monta:
#: el oido llega antes que el ojo.
LEAD = 0.06


def plan_sfx(edl: EDL, rules: SfxRules) -> list[SfxEffect]:
    """Coloca sonidos sobre los efectos visuales que ya estan decididos."""
    if not rules.enabled or edl.duration <= 0 or rules.max_per_minute <= 0:
        return []

    maximo = budget(rules.max_per_minute, edl.duration, 0.5)
    if maximo <= 0:
        return []

    candidatos: list[tuple[float, float, str, BaseEffect]] = []
    for kind, sonido, valor in ANCLAS:
        for efecto in edl.effects:
            if efecto.kind is kind:
                candidatos.append((valor, efecto.start, sonido, efecto))

    # Por valor primero y por tiempo despues, para que al llenarse el cupo se
    # queden los que acompanan a algo mas gordo.
    candidatos.sort(key=lambda c: (-c[0], c[1]))

    puestos: list[float] = []
    salida: list[SfxEffect] = []
    for valor, cuando, sonido, ancla in candidatos:
        if len(salida) >= maximo:
            break
        inicio = max(0.0, cuando - LEAD)
        if any(abs(inicio - t) < MIN_GAP for t in puestos):
            continue
        puestos.append(inicio)
        salida.append(
            SfxEffect(
                id=f"sfx{len(salida):03d}",
                start=round(inicio, 3),
                end=round(min(edl.duration, inicio + 1.2), 3),
                asset_id=sonido,
                gain_db=rules.gain_db,
                value_score=valor,
                cost_weight=SFX_COST,
                rationale=f"{sonido} en {inicio:.1f}s: acompana {ancla.kind.value}",
            )
        )

    salida.sort(key=lambda e: e.start)
    return salida
