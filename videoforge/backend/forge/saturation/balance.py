"""Auto-balanceador: lleva el montaje a su banda, sin tocar la duracion.

Es un bucle de control determinista, no una heuristica de una pasada:

1. Diagnostica el montaje.
2. Si se pasa, busca **donde** se pasa y quita de ahi el efecto con peor
   relacion valor/coste. Podar donde ya se esta por debajo no arregla nada y
   empobrece el montaje.
3. Si se queda corto, asciende el mejor candidato que el planner habia dejado en
   reserva.
4. Repite hasta entrar en banda, agotarse las opciones o dejar de mejorar.

**Por banda, no por nota media.** Este bucle se guiaba solo por la puntuacion
global contra [28, 68], y con eso no hacia absolutamente nada. Medido sobre la
guia de Palworld de veinte minutos, con los siete estilos:

    estilo           nota  se pasaba de su banda         cambios
    palworld         53.0  max_layers 4 sobre 0-3              0
    vlog             48.7  pico 0.874 sobre 0.850              0
    gaming-hype      44.5  pico 1.000 sobre 0.950              0
    (y los otros cuatro)                                       0

Cero movimientos en los siete. Las siete notas caen dentro de [28, 68], asi que
el bucle se paraba en la primera vuelta --- con 182 efectos en reservas y 133
ventanas calientes esperando. El motor de autorregulacion estaba, de hecho,
apagado: una media reparte un exceso entre trece metricas y se lo come.

Ahora el que manda es **lo mal que esta**, y eso se mide de lo grave a lo fino:
cuantas metricas se pasan de su banda, cuantas no llegan, y solo al final la
distancia de la nota. Un movimiento se acepta si ese trio baja, y se deshace si
no. Asi se acabaron dos comportamientos que eran el mismo fallo de fondo:

- promover un efecto de reserva que no arregla ninguna carencia pero tampoco
  rompe nada --- llenar el cupo por llenarlo --- ya no se acepta: el trio no baja;
- y un montaje al que le falta montaje **y** le sobra (el caso de
  `gaming-hype`) ya no se rellena mas: primero se poda lo que se pasa, y las
  carencias que ninguna reserva arregla se reportan en vez de taparse.

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
from ..plan.restraint import justification_bar
from ..plan.styles import StylePreset, load_style
from .density import RATE, density_curve, unclipped_curve
from .metrics import layers_curve
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


def _window_of_excess(edl: EDL, name: str, seconds: float = 3.0) -> tuple[float, float]:
    """Donde se pasa **esa** metrica, que no siempre es donde mas densidad hay.

    `max_layers` es el ejemplo claro: dice que en algun momento hay cuatro cosas
    encima, y ese momento puede ser un tramo tranquilo donde coinciden un
    subtitulo, un recuadro, un rotulo y una placa. Podar en la ventana mas
    caliente de la curva de densidad no quita ni una de las cuatro.
    """
    if name == "max_layers":
        capas = layers_curve(edl)
        if capas.size:
            i = int(np.argmax(capas))
            ancho = max(1, int(seconds * RATE))
            return max(0.0, (i - ancho // 2) / RATE), (i + ancho // 2 + 1) / RATE
    return _hottest_window(edl, seconds)


def _excess_pressure(edl: EDL, report: SaturationReport) -> float:
    """Cuanto dura el exceso, no solo si lo hay.

    Hace falta porque un **maximo** no baja quitando una cosa. `max_layers` dice
    "en algun momento hay cuatro capas", y en la guia de Palworld eso pasaba en
    doce instantes distintos: al podar el primero el maximo seguia siendo cuatro,
    la cuenta de excesos seguia siendo uno, y el balanceador leia "no he
    mejorado", deshacia la poda y la descartaba. Cero cambios, con el exceso
    intacto.

    Lo que si baja con cada poda es **que parte del montaje esta por encima del
    techo**, y eso es ademas lo que de verdad importa: cuatro cosas encima
    durante seis segundos no es lo mismo que durante cuatro minutos.
    """
    total = 0.0
    for r in report.excesses:
        if r.name == "max_layers":
            capas = layers_curve(edl)
            if capas.size:
                total += float((capas > r.band.hi).sum()) / capas.size
                continue
        if r.name in ("effect_density_peak", "effect_density_mean"):
            # Sin recortar: donde la carga esta pegada al techo, la curva de
            # lectura da 1.0 antes y despues de podar, y el bucle no ve el
            # progreso que si esta habiendo. Ver `density.unclipped_curve`.
            curva = unclipped_curve(edl)
            if curva.size:
                exceso = np.clip(curva - r.band.hi, 0.0, None)
                total += float(exceso.sum()) / curva.size
                continue
        # Las demas son tasas o proporciones sobre el montaje entero: no tienen
        # un "donde", asi que lo que mide el exceso es lo lejos que se queda.
        total += max(0.0, r.position - 1.0)
    return round(total, 9)


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
    # El suelo de justificacion tambien vale aqui, y esto importa mas de lo que
    # parece: sin ello, un montaje limpio que el medidor lee como "sub-editado"
    # se rellenaba con los efectos que el planner acababa de descartar **por no
    # justificarse**. Es decir, la app se sobreeditaba sola para contentar a su
    # propio medidor.
    suelo = justification_bar(edl.intensity)
    disponibles = [
        c
        for c in edl.candidates
        if c.value_score >= suelo
        and not any(
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

    def mal(r: SaturationReport) -> tuple[int, int, float, float]:
        """Lo mal que esta el montaje, de lo grave a lo fino.

        El orden es lo que decide todo lo demas, y lo que decide es una sola
        cosa: **ningun movimiento puede cambiar un problema por otro**. Primero
        cuantas metricas se quedan cortas, luego cuantas se pasan; asi una poda
        que arregla un exceso abriendo un hueco se rechaza, y un relleno que tapa
        un hueco creando un exceso tambien.

        No es teorico. Con el exceso delante, `gaming-hype` sobre la guia de
        veinte minutos quitaba **cien efectos** para bajar el pico de 1.000 a su
        banda y terminaba en "sub-editado" con tres carencias nuevas: cambiaba
        estar cargado por estar vacio y lo llamaba arreglado. Con las carencias
        delante, poda lo que puede podar sin abrir un hueco y **lo que no se
        puede arreglar asi se reporta**, que es lo que tiene que pasar: que
        `gaming-hype` no le va a una guia hablada no lo arregla ningun bucle.

        El tercer numero es **cuanto dura** el exceso, y sin el los dos primeros
        no sirven para un maximo: quitar una de las cuatro capas de un instante
        no baja el maximo del montaje, asi que la cuenta de excesos no se mueve y
        el bucle cree que no ha avanzado. Ver `_excess_pressure`.

        Comparar tuplas da un bucle que no oscila: cada movimiento aceptado baja
        algo acotado y ninguno puede subir lo que esta mas a la izquierda.
        """
        if r.score > target_high:
            lejos = r.score - target_high
        elif r.score < target_low:
            lejos = target_low - r.score
        else:
            lejos = 0.0
        return (
            len(r.shortfalls),
            len(r.excesses),
            _excess_pressure(edl, r),
            round(lejos, 6),
        )

    def fuera_de_banda(r: SaturationReport) -> int:
        """-1 si se queda corto, +1 si se pasa, 0 si esta en banda.

        Mira las bandas de verdad, no solo la nota: un estilo puede pasarse de
        `max_layers` con la nota en 53 y eso es pasarse igual.
        """
        if r.excesses or r.score > target_high:
            return 1
        if r.shortfalls or r.score < target_low:
            return -1
        return 0

    # Aqui habia un freno de mano: si un movimiento cruzaba al otro lado de la
    # banda, se deshacia y se paraba el bucle. Con la nota como unico criterio
    # hacia falta; con el trio de `mal` no solo no hace falta, es que estorba.
    # Podar el exceso de `gaming-hype` deja al descubierto las carencias que ya
    # tenia debajo --- pasa de "se pasa" a "le falta" --- y ese freno leia el
    # cambio de signo como haberse pasado de largo: deshacia la unica poda
    # acertada y se iba. Cada movimiento ya se acepta solo si `mal` baja, asi que
    # ninguno puede empeorar nada y no hay nada que deshacer al final.
    while vueltas < max_iterations:
        direccion = fuera_de_banda(actual)
        if direccion == 0:
            break

        vueltas += 1
        # Se mide **antes** de tocar nada. `mal` mira el EDL para saber cuanto
        # dura el exceso, asi que llamarlo despues de mutar mezcla el informe
        # viejo con el montaje nuevo y sale empate siempre: era esto lo que
        # dejaba el balanceador en cero cambios incluso podando bien.
        antes = mal(actual)

        if direccion > 0:
            # Se poda donde se pasa **esa** metrica. Si lo que sobra es carga en
            # general (la nota por encima del techo), la ventana mas caliente.
            peor = max(actual.excesses, key=lambda r: r.position, default=None)
            inicio, fin_ventana = (
                _window_of_excess(edl, peor.name) if peor else _hottest_window(edl)
            )
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
            # --- deja una metrica por debajo de su banda, o abre otro exceso ---
            # se deshace y no se vuelve a intentar con ese efecto.
            if mal(siguiente) >= antes:
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

            # Y aqui esta el freno que faltaba: si el candidato no arregla
            # ninguna carencia, no entra. Antes bastaba con que no bajase la
            # nota, y eso es "llenar el cupo porque queda sitio", que es
            # exactamente como se sobreedita un video.
            if mal(siguiente) >= antes:
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

        actual = siguiente

    final = evaluate(edl, analysis, style=preset, intensity=intens)
    return BalanceReport(before=inicial, after=final, changes=cambios, iterations=vueltas)
