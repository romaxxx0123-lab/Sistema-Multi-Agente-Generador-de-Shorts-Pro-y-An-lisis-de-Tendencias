"""Auto-balanceador: lleva el montaje a su banda, sin tocar la duracion.

Es un bucle de control determinista, no una heuristica de una pasada:

1. Diagnostica el montaje.
2. Si se pasa, busca la **ventana mas caliente** de la curva de densidad y quita
   de ahi el efecto con peor relacion valor/coste. Podar donde ya se esta por
   debajo no arregla nada y empobrece el montaje.
3. Si se queda corto, asciende el mejor candidato que el planner habia dejado en
   reserva.
4. Repite hasta entrar en banda, agotarse las opciones o dejar de mejorar.

Solo toca `effects`, nunca `timeline`, asi que **la duracion del montaje no
cambia** por mucho que pode. Los efectos marcados como `locked` por el usuario
son intocables.

Cada cambio queda registrado con su motivo: el objetivo no es solo arreglar el
montaje sino poder explicar que se quito y por que.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from ..analysis.types import Analysis
from ..plan.conflicts import conflicts_with
from ..plan.edl import EDL, BaseEffect, EffectKind
from ..plan.styles import StylePreset, load_style
from .density import RATE, density_curve
from .score import BUSY, UNDER_EDITED, SaturationReport, evaluate

#: Tipos que no se podan: son ambiente, cuestan poco y quitarlos no descarga
#: nada pero si empobrece el resultado.
NEVER_PRUNE = (EffectKind.GRADE, EffectKind.MUSIC, EffectKind.CAPTION)
#: Los subtitulos no se tocan. Son contenido, no decoracion: sostienen la
#: retencion y la accesibilidad, y en una guia en la que se ha quitado el
#: silencio la voz ocupa casi todo, asi que el texto en pantalla ronda el 95%.
#: Si esa metrica se sale de banda, los subtitulos son lo unico que la mueve, y
#: el balanceador se ponia a quitar justo lo que hay que conservar. Cuando
#: sobra texto, lo que sobra son los rotulos, no lo que se esta diciendo.

#: Tope de vueltas, por seguridad.
MAX_ITERATIONS = 400
#: Margen al comparar puntuaciones. Solo sirve para no deshacer un movimiento
#: por ruido de coma flotante.
EPSILON = 1e-6


@dataclass
class Change:
    """Un movimiento del balanceador."""

    action: str  # "quitado" | "anadido"
    effect_id: str
    kind: str
    start: float
    end: float
    reason: str

    def describe(self) -> str:
        return f"{self.action} {self.kind} en {self.start:.1f}s: {self.reason}"


@dataclass
class BalanceReport:
    """Que hizo el balanceador y con que resultado."""

    before: SaturationReport
    after: SaturationReport
    changes: list[Change] = field(default_factory=list)
    iterations: int = 0

    @property
    def removed(self) -> list[Change]:
        return [c for c in self.changes if c.action == "quitado"]

    @property
    def added(self) -> list[Change]:
        return [c for c in self.changes if c.action == "anadido"]

    @property
    def changed(self) -> bool:
        return bool(self.changes)

    def summary(self) -> str:
        if not self.changes:
            return f"Sin cambios: {self.before.score:.0f}/100, {self.before.verdict}."
        partes = []
        if self.removed:
            partes.append(f"quitados {len(self.removed)}")
        if self.added:
            partes.append(f"anadidos {len(self.added)}")
        return (
            f"{' y '.join(partes)} efectos · "
            f"{self.before.score:.0f} -> {self.after.score:.0f}/100 "
            f"({self.before.verdict} -> {self.after.verdict})"
        )


def _hottest_window(edl: EDL, seconds: float = 3.0) -> tuple[float, float]:
    """La ventana de `seconds` con mas densidad acumulada."""
    curva = density_curve(edl)
    if curva.size == 0:
        return 0.0, edl.duration

    ancho = max(1, int(seconds * RATE))
    if curva.size <= ancho:
        return 0.0, edl.duration

    # Suma deslizante por suma acumulada: exacta y de una pasada.
    acumulado = np.concatenate([[0.0], np.cumsum(curva)])
    sumas = acumulado[ancho:] - acumulado[:-ancho]
    i = int(np.argmax(sumas))
    return i / RATE, (i + ancho) / RATE


#: Ancho de la ventana con la que se busca el tramo mas vacio. Una zona muerta
#: de montaje no se mide en segundos sueltos: son decenas de segundos sin que
#: pase nada.
COLD_SECONDS = 20.0


def _coldest_window(edl: EDL, seconds: float = COLD_SECONDS) -> tuple[float, float]:
    """El tramo mas vacio del montaje.

    Es el simetrico de `_hottest_window`, y faltaba. Al podar se miraba **donde**
    sobraba (la ventana mas cargada), pero al anadir se cogia el mejor candidato
    del video entero sin mirar donde caia: se podia meter otro efecto en un
    tramo ya cargado mientras un minuto y medio seguido se quedaba sin nada.
    Un montaje no se juzga por su media, se ve en orden.
    """
    curva = density_curve(edl)
    if curva.size == 0:
        return 0.0, edl.duration

    ancho = max(1, int(seconds * RATE))
    if curva.size <= ancho:
        return 0.0, edl.duration

    acumulado = np.concatenate([[0.0], np.cumsum(curva)])
    sumas = acumulado[ancho:] - acumulado[:-ancho]
    i = int(np.argmin(sumas))
    return i / RATE, (i + ancho) / RATE


def _prunable(edl: EDL, start: float, end: float) -> list[BaseEffect]:
    """Efectos que se pueden quitar dentro de una ventana."""
    return [
        e
        for e in edl.effects
        if e.kind not in NEVER_PRUNE and not e.locked and e.overlaps(start, end)
    ]


def _worst(effects: list[BaseEffect]) -> BaseEffect | None:
    """El efecto que menos aporta por lo que cuesta.

    La eficiencia (valor/coste) ordena sola: los subtitulos, con valor alto y
    coste bajo, sobreviven a casi todo; las transiciones decorativas caen
    primero. No hace falta una lista de prioridades escrita a mano.
    """
    return min(effects, key=lambda e: (e.efficiency, -e.cost_weight)) if effects else None


def _best_candidate(
    edl: EDL, start: float | None = None, end: float | None = None
) -> BaseEffect | None:
    """El candidato en reserva que mas aporta y no pisa a otro efecto.

    "No pisa" es de dos maneras: ni a otro del mismo tipo (dos zooms encimados)
    ni a uno de otro tipo que lo dejaria sin verse (un recuadro debajo de un
    b-roll). Lo segundo faltaba, y subir la densidad metiendo algo que no se ve
    no sube ninguna densidad: solo la del medidor.

    Con `start`/`end` se busca **dentro de ese tramo**, que es como se pone algo
    donde de verdad hace falta en vez de donde ya habia.
    """
    disponibles = [
        c
        for c in edl.candidates
        if not any(
            e.kind is c.kind and e.overlaps(c.start, c.end) for e in edl.effects
        )
        and not conflicts_with(edl, c)
        and (start is None or c.overlaps(start, end))
    ]
    return max(disponibles, key=lambda e: e.efficiency) if disponibles else None


def rebalance(
    edl: EDL,
    analysis: Analysis | None = None,
    *,
    style: StylePreset | None = None,
    intensity: int | None = None,
    target_low: float = UNDER_EDITED,
    target_high: float = BUSY,
    max_iterations: int = MAX_ITERATIONS,
) -> BalanceReport:
    """Ajusta los efectos hasta que el montaje entre en su banda.

    Modifica el EDL en el sitio. La duracion nunca cambia.
    """
    preset = style or load_style(edl.style)
    intens = edl.intensity if intensity is None else intensity

    inicial = evaluate(edl, analysis, style=preset, intensity=intens)
    actual = inicial
    cambios: list[Change] = []
    vueltas = 0
    #: efectos cuya retirada resulto contraproducente; no se reintentan
    descartados: set[str] = set()

    def fuera_de_banda(r: SaturationReport) -> int:
        """-1 si se queda corto, +1 si se pasa, 0 si esta en banda."""
        if r.score > target_high:
            return 1
        if r.score < target_low:
            return -1
        return 0

    while vueltas < max_iterations:
        direccion = fuera_de_banda(actual)
        if direccion == 0:
            break

        vueltas += 1

        if direccion > 0:
            inicio, fin_ventana = _hottest_window(edl)
            candidatos_poda = [
                e for e in _prunable(edl, inicio, fin_ventana) if e.id not in descartados
            ]
            if not candidatos_poda:
                # Nada que podar en la zona caliente: se mira todo el montaje.
                candidatos_poda = [
                    e for e in _prunable(edl, 0.0, edl.duration) if e.id not in descartados
                ]
            victima = _worst(candidatos_poda)
            if victima is None:
                break

            edl.demote_effect(victima.id)
            siguiente = evaluate(edl, analysis, style=preset, intensity=intens)

            # Quitar algo casi siempre descarga, pero si resulta que empeora
            # (p. ej. deja una metrica por debajo de su banda), se deshace y no
            # se vuelve a intentar con ese efecto.
            if siguiente.score > actual.score + EPSILON:
                edl.promote_candidate(victima.id)
                descartados.add(victima.id)
                continue

            cambios.append(
                Change(
                    action="quitado",
                    effect_id=victima.id,
                    kind=victima.kind.value,
                    start=victima.start,
                    end=victima.end,
                    reason=(
                        f"era lo que menos aportaba ({victima.value_score:.2f} de valor "
                        f"por {victima.cost_weight:.2f} de carga) en el tramo mas cargado "
                        f"({inicio:.1f}-{fin_ventana:.1f}s)"
                    ),
                )
            )
        else:
            # Se anade **donde falta**, no donde ya hay. Mirar solo la media
            # dejaba tramos enteros sin nada mientras se recargaban otros.
            frio_inicio, frio_fin = _coldest_window(edl)
            candidato = _best_candidate(edl, frio_inicio, frio_fin)
            en_el_hueco = candidato is not None
            if candidato is None:
                candidato = _best_candidate(edl)
            if candidato is None:
                break

            edl.promote_candidate(candidato.id)
            siguiente = evaluate(edl, analysis, style=preset, intensity=intens)

            if siguiente.score < actual.score - EPSILON:
                edl.demote_effect(candidato.id)
                descartados.add(candidato.id)
                continue

            cambios.append(
                Change(
                    action="anadido",
                    effect_id=candidato.id,
                    kind=candidato.kind.value,
                    start=candidato.start,
                    end=candidato.end,
                    reason=(
                        "el montaje se quedaba corto para el estilo elegido"
                        + (
                            f" y ese tramo ({frio_inicio:.0f}-{frio_fin:.0f}s) "
                            "era el mas vacio"
                            if en_el_hueco else ""
                        )
                    ),
                )
            )

        # Pasarse al otro lado es peor que quedarse justo fuera: se deshace el
        # ultimo movimiento y se para.
        if fuera_de_banda(siguiente) == -direccion:
            ultimo = cambios.pop()
            if ultimo.action == "quitado":
                edl.promote_candidate(ultimo.effect_id)
            else:
                edl.demote_effect(ultimo.effect_id)
            break

        actual = siguiente

    final = evaluate(edl, analysis, style=preset, intensity=intens)
    return BalanceReport(before=inicial, after=final, changes=cambios, iterations=vueltas)
