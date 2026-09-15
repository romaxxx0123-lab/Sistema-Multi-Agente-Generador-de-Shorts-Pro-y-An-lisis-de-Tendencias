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
    def is_under_edited(self) -> bool:
        return self.score < UNDER_EDITED

    @property
    def in_the_pocket(self) -> bool:
        return UNDER_EDITED <= self.score <= BUSY

    def problems(self) -> list[MetricReading]:
        """Metricas fuera de banda, las peores primero."""
        fuera = [r for r in self.readings if r.status != "dentro"]
        return sorted(fuera, key=lambda r: -abs(r.position - 0.5) * r.weight)

    def summary(self) -> str:
        return f"{self.score:.0f}/100 · {self.verdict} (estilo {self.style}, intensidad {self.intensity})"


#: Puntuacion minima de una metrica de techo. Que no baje de aqui es lo que
#: impide que "no hay ningun problema" se confunda con "falta contenido".
CEILING_FLOOR = 40.0


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


def verdict_for(score: float) -> str:
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
        peso_efectivo = 0.0 if (_is_ceiling(banda_base) and estado != "alto") else peso

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
        verdict=verdict_for(score),
        style=preset.name,
        intensity=intens,
        metrics=metrics,
        readings=lecturas,
        heatmap=heatmap(curva),
        hot_windows=hot_windows(curva, umbral),
    )
