"""Puntuacion de saturacion: una cifra, un veredicto y el porque.

La escala esta construida para que se lea sola:

    0 ────── 33 ─────────── 67 ────── 85 ────── 100
    sub-editado   en el punto      cargado   sobresaturado

Dentro de la banda del estilo, la puntuacion cae entre 33 y 67. Por debajo
significa que el montaje se queda corto para ese estilo; por encima, que se pasa.
No es una escala absoluta: la misma carga es "en el punto" en `gaming-hype` y
"sobresaturado" en `tutorial`, y eso es intencionado.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable

from ..analysis.types import Analysis
from ..plan.edl import EDL
from ..plan.styles import Band, StylePreset, load_style
from .density import density_curve, heatmap, hot_windows
from .metrics import Metrics, compute_metrics

#: Cuanto pesa cada metrica en la puntuacion final. La densidad manda porque es
#: la que de verdad describe la carga percibida; las demas matizan.
WEIGHTS: dict[str, float] = {
    "effect_density_mean": 2.5,
    "effect_density_peak": 1.5,
    "cuts_per_minute": 1.5,
    "motion_conflicts_per_minute": 1.2,
    "overlay_coverage": 1.0,
    "max_layers": 1.0,
    "text_coverage": 0.8,
    "caption_wpm": 0.8,
    "sfx_per_minute": 0.6,
    "callouts_per_minute": 0.7,
    "zooms_per_minute": 1.1,
    # Repetirse cansa tanto como cargar: once zooms seguidos y once efectos
    # variados dan la misma densidad y no se parecen en nada en pantalla.
    "repeated_share": 1.2,
    "transitions_per_minute": 0.6,
}

#: Fronteras del veredicto.
UNDER_EDITED = 28.0
BUSY = 68.0
OVERSATURATED = 85.0

#: Que hacer cuando una metrica se sale, en cristiano.
ADVICE: dict[str, tuple[str, str]] = {
    "cuts_per_minute": ("el montaje va lento para este estilo", "hay demasiados cortes: se hace nervioso"),
    "effect_density_mean": ("hay poco encima del video", "hay demasiado encima del video a lo largo de todo el montaje"),
    "effect_density_peak": ("ningun momento destaca", "hay momentos con demasiadas cosas a la vez"),
    "overlay_coverage": ("apenas se usa material de apoyo", "el b-roll tapa el video demasiado rato"),
    "text_coverage": ("falta texto en pantalla", "hay texto en pantalla casi todo el rato"),
    "max_layers": ("nunca se superponen elementos", "se amontonan demasiados elementos a la vez"),
    "sfx_per_minute": ("no hay efectos de sonido", "demasiados efectos de sonido"),
    "callouts_per_minute": ("", "hay demasiados recuadros senalando cosas"),
    "zooms_per_minute": ("la camara no se mueve nunca", "hay un zoom cada pocos segundos: cansa"),
    "transitions_per_minute": ("los cortes van todos secos", "demasiadas transiciones: distraen del contenido"),
    "caption_wpm": ("los subtitulos se quedan mucho rato en pantalla", "los subtitulos pasan demasiado rapido para leerlos"),
    "repeated_share": (
        "",
        "se repite el mismo recurso en racha: varia, que a la tercera vez deja "
        "de subrayar nada",
    ),
    "motion_conflicts_per_minute": ("", "hay zooms sobre planos que ya se mueven: marea"),
}


def intensity_factor(intensity: int) -> float:
    """Traduce el deslizador 0-100 a un multiplicador de las bandas.

    A 50 no cambia nada; a 0 exige la mitad de carga; a 100, una vez y media.
    """
    return 0.5 + max(0, min(100, intensity)) / 100.0


@dataclass
class MetricReading:
    """Como queda una metrica respecto a su banda."""

    name: str
    value: float
    band: Band
    #: 0 = en el minimo de la banda, 1 = en el maximo; fuera se sale del rango
    position: float
    status: str  # "bajo" | "dentro" | "alto"
    score: float
    weight: float
    #: si esta metrica entra en la media o solo se muestra
    counts: bool = True

    @property
    def advice(self) -> str:
        bajo, alto = ADVICE.get(self.name, ("", ""))
        if self.status == "bajo":
            return bajo
        if self.status == "alto":
            return alto
        return ""


@dataclass
class SaturationReport:
    """Diagnostico completo de un montaje."""

    score: float
    verdict: str
    style: str
    intensity: int
    metrics: Metrics
    readings: list[MetricReading] = field(default_factory=list)
    heatmap: list[float] = field(default_factory=list)
    hot_windows: list[tuple[float, float]] = field(default_factory=list)

    @property
    def is_oversaturated(self) -> bool:
        return self.score > BUSY

    @property
    def shortfalls(self) -> list[MetricReading]:
        """Lo que el montaje **no** tiene y su estilo pedia.

        Solo cuentan las metricas que votan: una banda de techo a cero no pide
        nada, y una herramienta que el estilo tiene apagada tampoco.
        """
        return [r for r in self.readings if r.counts and r.status == "bajo"]

    @property
    def excesses(self) -> list[MetricReading]:
        """Lo que el montaje tiene **de mas** de lo que su estilo pedia.

        El simetrico de `shortfalls`, y faltaba. La media escondia un cero por
        abajo --- eso ya se arreglo --- pero escondia igual de bien un exceso por
        arriba: `palworld` apilaba **cuatro capas** sobre una banda que acaba en
        tres y la nota salia 53, "en el punto". Nadie cobraba por pasarse.
        """
        return [r for r in self.readings if r.counts and r.status == "alto"]

    @property
    def is_overloaded(self) -> bool:
        """Se pasa de lo que el propio estilo declaro, se note en la nota o no."""
        return self.score > BUSY or bool(self.excesses)

    @property
    def is_under_edited(self) -> bool:
        return self.score < UNDER_EDITED or bool(self.shortfalls)

    @property
    def in_the_pocket(self) -> bool:
        return (
            not self.shortfalls
            and not self.excesses
            and UNDER_EDITED <= self.score <= BUSY
        )

    def problems(self) -> list[MetricReading]:
        """Metricas fuera de banda, las peores primero."""
        fuera = [r for r in self.readings if r.status != "dentro"]
        return sorted(fuera, key=lambda r: -abs(r.position - 0.5) * r.weight)

    def summary(self) -> str:
        return f"{self.score:.0f}/100 · {self.verdict} (estilo {self.style}, intensidad {self.intensity})"


#: Puntuacion minima de una metrica de techo. Que no baje de aqui es lo que
#: impide que "no hay ningun problema" se confunda con "falta contenido".
CEILING_FLOOR = 40.0


#: Metricas que solo existen si el estilo tiene esa herramienta encendida.
#: Puntuar a `cinematic` por no tener subtitulos, cuando el propio estilo dice
#: que no los quiere, es cobrarle por obedecer: su velocidad de lectura salia
#: 0 palabras por minuto contra una banda de [70, 180] y le hundia la nota.
DEPENDS_ON: dict[str, Callable[[StylePreset], bool]] = {
    "caption_wpm": lambda p: p.captions.enabled,
    "callouts_per_minute": lambda p: p.callouts.enabled,
    "sfx_per_minute": lambda p: p.sfx.enabled,
    "transitions_per_minute": lambda p: p.transitions.enabled,
}


def _is_ceiling(band: Band) -> bool:
    """Distingue metricas de techo de metricas de objetivo.

    Una banda que empieza en 0 no dice "hace falta algo de esto", dice "esto
    sobra a partir de aqui". Cero conflictos de movimiento es lo ideal, no una
    carencia; cero efectos de sonido en una guia tampoco falta. Tratarlas como
    metricas de objetivo hace que un montaje impecable en esos aspectos arrastre
    la media hacia "sub-editado", que es justo al reves.
    """
    return band.lo <= 1e-9


def _score_metric(value: float, band: Band) -> tuple[float, float, str]:
    """Puntua una metrica: devuelve (puntuacion, posicion, estado)."""
    ancho = band.hi - band.lo
    if ancho <= 1e-9:
        # Banda degenerada: solo puede estar dentro o fuera.
        dentro = abs(value - band.lo) < 1e-6
        return (50.0, 0.5, "dentro") if dentro else (100.0, 2.0, "alto")

    posicion = (value - band.lo) / ancho

    if _is_ceiling(band):
        # Solo puede empujar hacia la saturacion, nunca hacia la carencia.
        if posicion > 1.0:
            return min(100.0, 67.0 + 33.0 * (posicion - 1.0)), posicion, "alto"
        recorrido = 67.0 - CEILING_FLOOR
        return CEILING_FLOOR + recorrido * max(0.0, posicion), posicion, "dentro"

    if posicion < 0.0:
        # Una banda entera por debajo del minimo ya es un 0.
        return max(0.0, 33.0 * (1.0 + posicion)), posicion, "bajo"
    if posicion > 1.0:
        # Una banda entera por encima del maximo ya es un 100.
        return min(100.0, 67.0 + 33.0 * (posicion - 1.0)), posicion, "alto"
    return 33.0 + 34.0 * posicion, posicion, "dentro"


def verdict_for(score: float, readings: list[MetricReading] | None = None) -> str:
    """El veredicto, que no es solo la media.

    La media esconde un cero. Medido sobre una guia de cuatro minutos montada
    con los seis estilos: `cinematic` devolvia el video **sin un solo corte** ---
    un clip, 241 segundos, el original tal cual --- y la nota salia 30.6, "en el
    punto", porque el hueco de los cortes (0 contra una banda de 3 a 11) lo
    tapaba la densidad de efectos, que si estaba dentro. Tres de los seis
    estilos se quedaban por debajo de su propia banda de ritmo y el medidor no
    decia nada de ninguno.

    Asi que una metrica que **vota** y se queda por debajo de su banda es un
    hueco, y un hueco no es "en el punto" por mucho que la media salga.

    Y la mitad de arriba tenia el mismo agujero, que es peor porque este
    proyecto existe para no sobresaturar. Medido sobre la guia de Palworld de
    veinte minutos:

        palworld    53.0  "en el punto"   max_layers = 4 sobre una banda de 0-3
        vlog        48.7  "en el punto"   pico = 0.874 sobre un techo de 0.850

    Los dos se pasaban de la banda que ellos mismos declaran y el medidor los
    bendecia, porque la media reparte un exceso entre trece metricas y se lo
    come. El medidor existe para avisar de lo que falta **y de lo que sobra**;
    avisar solo de una de las dos cosas es hacer media faena.
    """
    falta = bool(readings and any(r.counts and r.status == "bajo" for r in readings))
    sobra = bool(readings and any(r.counts and r.status == "alto" for r in readings))

    # Las dos cosas a la vez no es un caso raro: es lo que le pasa a
    # `gaming-hype` sobre una guia hablada. Da 9.6 cortes por minuto contra una
    # banda que empieza en 18 --- se queda a la mitad --- y al mismo tiempo clava
    # el pico de densidad en 1.00 sobre un techo de 0.95, con 133 ventanas
    # calientes en 16 minutos: 134 zooms y 152 sonidos. Le falta montaje donde
    # importa y le sobra donde no. Llamarlo "sub-editado" invita a anadir mas de
    # lo que ya sobra, y llamarlo "cargado" esconde el hueco.
    if falta and sobra:
        return "descompensado"
    if sobra:
        return "sobresaturado" if score > OVERSATURATED else "cargado"
    if falta:
        return "sub-editado"
    if score < UNDER_EDITED:
        return "sub-editado"
    if score <= BUSY:
        return "en el punto"
    if score <= OVERSATURATED:
        return "cargado"
    return "sobresaturado"


def evaluate(
    edl: EDL,
    analysis: Analysis | None = None,
    *,
    style: StylePreset | None = None,
    intensity: int | None = None,
) -> SaturationReport:
    """Diagnostica un montaje contra las bandas de su estilo."""
    preset = style or load_style(edl.style)
    intens = edl.intensity if intensity is None else intensity
    factor = intensity_factor(intens)

    metrics = compute_metrics(edl, analysis)
    valores = metrics.as_dict()

    lecturas: list[MetricReading] = []
    total_ponderado = 0.0
    total_pesos = 0.0

    for nombre, valor in valores.items():
        banda_base = preset.band(nombre)
        if banda_base is None:
            continue
        banda = banda_base.scaled(factor)
        puntuacion, posicion, estado = _score_metric(valor, banda)
        peso = WEIGHTS.get(nombre, 1.0)

        # Una metrica de techo que no se ha pasado no aporta informacion sobre
        # si falta o sobra montaje: solo sabe decir "aqui no hay problema". Se
        # sigue mostrando, pero no vota, para que no sostenga artificialmente la
        # puntuacion de un montaje que en realidad esta vacio.
        apagada = not DEPENDS_ON.get(nombre, lambda _p: True)(preset)
        peso_efectivo = (
            0.0
            if apagada or (_is_ceiling(banda_base) and estado != "alto")
            else peso
        )

        lecturas.append(
            MetricReading(
                name=nombre,
                value=round(valor, 3),
                band=banda,
                position=round(posicion, 3),
                status=estado,
                score=round(puntuacion, 1),
                weight=peso,
                counts=peso_efectivo > 0,
            )
        )
        total_ponderado += puntuacion * peso_efectivo
        total_pesos += peso_efectivo

    # Si no vota nadie es que todo son metricas de techo y ninguna se ha
    # pasado: el montaje no tiene ningun problema de saturacion.
    score = total_ponderado / total_pesos if total_pesos else 50.0

    curva = density_curve(edl)
    banda_pico = preset.band("effect_density_peak")
    umbral = (banda_pico.scaled(factor).hi if banda_pico else 0.7)

    return SaturationReport(
        score=round(score, 1),
        verdict=verdict_for(score, lecturas),
        style=preset.name,
        intensity=intens,
        metrics=metrics,
        readings=lecturas,
        heatmap=heatmap(curva),
        hot_windows=hot_windows(curva, umbral),
    )
