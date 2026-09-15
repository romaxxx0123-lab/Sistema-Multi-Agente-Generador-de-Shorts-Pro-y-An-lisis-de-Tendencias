"""Efectos que dejan sin sentido a otros efectos.

Cada planner decide bien lo suyo y ninguno mira lo que han decidido los demas.
Por separado las decisiones son razonables; juntas, no:

- un b-roll a pantalla completa **tapa el video base**, asi que el recuadro que
  senala un boton senala una imagen que ya no esta, y el zoom se acerca a algo
  que no se ve;
- Ken Burns existe para que un plano quieto no parezca congelado; si ese plano
  ya lleva un zoom de enfasis, quieto no esta, y los dos movimientos se suman;
- una espera anunciada se acelera hasta ocho veces: un acercamiento ahi dentro
  no se lee como un zoom, se lee como un tiron;
- un rotulo de capitulo y un b-roll a la vez son dos graficos a la vez.

El balanceador de saturacion tampoco lo veia: solo compara efectos **del mismo
tipo** entre si. Asi que esto va aparte, se pasa al cerrar el montaje y despues
de cada cosa que el balanceador anada.

Quitar es lo correcto y no solo lo comodo: un efecto tapado no se ve, pero
**cuenta** en el medidor de saturacion y ocupa un hueco que podria llevar algo
que si se vea.
"""

from __future__ import annotations

from .edl import EDL, BaseEffect, BrollEffect, EffectKind

#: Efectos que trabajan sobre el video base y por tanto desaparecen debajo de
#: un b-roll a pantalla completa.
UNDER_BROLL = (EffectKind.CALLOUT, EffectKind.PUNCH_IN, EffectKind.KEN_BURNS)
#: Los que son movimiento de camara: dos a la vez es uno de mas.
MOVIMIENTO = (EffectKind.PUNCH_IN, EffectKind.KEN_BURNS)
#: Lo que puede acompanar un sonido. Sin uno de estos delante, el sonido suena
#: solo y no acompana nada.
ANCLAS_DE_SONIDO = (EffectKind.TRANSITION, EffectKind.TEXT_CARD, EffectKind.PUNCH_IN)
#: Por encima de esta velocidad, el clip es un avance rapido.
FAST_FORWARD = 1.05


def _solapan(a: BaseEffect, b: BaseEffect) -> bool:
    return a.start < b.end and b.start < a.end


def _full_brolls(edl: EDL) -> list[BrollEffect]:
    return [
        e for e in edl.effects
        if isinstance(e, BrollEffect) and e.mode == "full"
    ]


def _fast_ranges(edl: EDL) -> list[tuple[float, float]]:
    """Tramos del montaje que van acelerados."""
    salida: list[tuple[float, float]] = []
    cursor = 0.0
    for clip in edl.timeline:
        if clip.speed > FAST_FORWARD:
            salida.append((cursor, cursor + clip.duration))
        cursor += clip.duration
    return salida


def find_conflicts(edl: EDL) -> list[tuple[BaseEffect, str]]:
    """Que efectos sobran y por que, sin tocar nada."""
    sobran: list[tuple[BaseEffect, str]] = []
    ya: set[str] = set()

    def marcar(efecto: BaseEffect, motivo: str) -> None:
        if efecto.id not in ya and not efecto.locked:
            ya.add(efecto.id)
            sobran.append((efecto, motivo))

    brolls = _full_brolls(edl)
    for efecto in edl.effects:
        if efecto.kind in UNDER_BROLL:
            tapa = next((b for b in brolls if _solapan(b, efecto)), None)
            if tapa is not None:
                marcar(efecto, f"queda debajo del b-roll de {tapa.start:.0f}s")

    # Dos movimientos de camara a la vez: se queda el que tiene un motivo.
    # Ken Burns no lo tiene -- es relleno para planos quietos -- y el zoom de
    # enfasis si: ahi se esta senalando o enfatizando algo.
    zooms = [e for e in edl.effects if e.kind is EffectKind.PUNCH_IN]
    for efecto in edl.effects:
        if efecto.kind is EffectKind.KEN_BURNS:
            choca = next((z for z in zooms if _solapan(z, efecto)), None)
            if choca is not None:
                marcar(efecto, "ese plano ya lleva un zoom, no esta quieto")

    rapidos = _fast_ranges(edl)
    for efecto in edl.effects:
        if efecto.kind not in MOVIMIENTO:
            continue
        if any(a < efecto.end and efecto.start < b for a, b in rapidos):
            marcar(efecto, "cae dentro de un avance rapido")

    # Un rotulo de capitulo abre una parte del video: lo que sobra es el b-roll.
    cartas = [e for e in edl.effects if e.kind is EffectKind.TEXT_CARD]
    for efecto in brolls:
        choca = next((c for c in cartas if _solapan(c, efecto)), None)
        if choca is not None:
            marcar(efecto, "coincide con el rotulo de un capitulo")

    # Un sonido acompana algo que pasa en la imagen. Si eso que acompanaba ya
    # no esta -- lo quito el balanceador, o quedaba debajo de un b-roll -- el
    # sonido se queda sonando solo, que es la forma mas barata de que un
    # montaje automatico se note.
    fuera = {e.id for e, _ in sobran}
    visuales = [
        e for e in edl.effects
        if e.kind in ANCLAS_DE_SONIDO and e.id not in fuera
    ]
    for efecto in edl.effects:
        if efecto.kind is not EffectKind.SFX:
            continue
        if not any(_solapan(v, efecto) or abs(v.start - efecto.start) < 0.5 for v in visuales):
            marcar(efecto, "sonaria sin que pase nada en la imagen")

    return sobran


def conflicts_with(edl: EDL, candidato: BaseEffect) -> str:
    """Si anadir ese efecto chocaria con lo que ya hay, dice por que.

    Lo usa el balanceador antes de recuperar un candidato: subir la densidad
    metiendo algo que no se va a ver no sube nada.
    """
    if candidato.kind in UNDER_BROLL:
        tapa = next((b for b in _full_brolls(edl) if _solapan(b, candidato)), None)
        if tapa is not None:
            return f"queda debajo del b-roll de {tapa.start:.0f}s"
    if candidato.kind in MOVIMIENTO:
        if any(a < candidato.end and candidato.start < b for a, b in _fast_ranges(edl)):
            return "cae dentro de un avance rapido"
        otros = [
            e for e in edl.effects
            if e.kind in MOVIMIENTO and e.id != candidato.id and _solapan(e, candidato)
        ]
        if otros:
            return "ahi ya hay un movimiento de camara"
    if isinstance(candidato, BrollEffect) and candidato.mode == "full":
        cartas = [
            e for e in edl.effects
            if e.kind is EffectKind.TEXT_CARD and _solapan(e, candidato)
        ]
        if cartas:
            return "coincide con el rotulo de un capitulo"
    return ""


def resolve(edl: EDL) -> list[str]:
    """Quita los efectos que otro efecto deja sin sentido. Devuelve las notas."""
    sobran = find_conflicts(edl)
    if not sobran:
        return []

    fuera = {e.id for e, _ in sobran}
    edl.effects = [e for e in edl.effects if e.id not in fuera]

    porque: dict[str, int] = {}
    for _, motivo in sobran:
        porque[motivo] = porque.get(motivo, 0) + 1
    detalle = ", ".join(
        f"{n} {motivo}" if n > 1 else motivo for motivo, n in sorted(porque.items())
    )
    return [f"Quitados {len(sobran)} efectos que no se verian: {detalle}."]
