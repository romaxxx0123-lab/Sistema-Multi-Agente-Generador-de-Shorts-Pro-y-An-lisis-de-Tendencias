"""Construye el EDL completo a partir del analisis y un estilo.

Orden de trabajo, que no es arbitrario:

1. **Seleccion**: que entra y que se va. Define la duracion, y todo lo demas se
   coloca sobre esa linea de tiempo ya recortada.
2. **Enriquecimiento**: subtitulos, zooms, capitulos, transiciones y color.

Como los efectos se anaden *despues* del corte, quitarlos nunca descuadra el
montaje. Ese invariante es lo que permite al auto-balanceador de F4 podar sin
miedo.
"""

from __future__ import annotations

from ..analysis.types import Analysis
from ..assets.providers import BrollProvider
from ..assets.types import AssetBundle
from ..errors import PlanError
from .broll import plan_broll
from .captions import plan_captions
from .chapters import chapter_cards, plan_chapters
from .edl import EDL, Clip, GradeEffect, RenderSpec, TransitionEffect
from .emphasis import plan_ken_burns, plan_punch_ins
from .select import plan_selection
from .styles import StylePreset, load_style

#: Resolucion de respaldo si el sondeo no trajo dimensiones.
FALLBACK_SIZE = (1920, 1080)
FALLBACK_FPS = 30.0


def _render_spec(analysis: Analysis) -> RenderSpec:
    v = analysis.media.video
    if v and v.display_width and v.display_height:
        width, height = v.display_width, v.display_height
    else:
        width, height = FALLBACK_SIZE
    fps = v.fps if v and v.fps else FALLBACK_FPS
    # x264 exige dimensiones pares.
    return RenderSpec(width=width - width % 2, height=height - height % 2, fps=fps)


def _build_timeline(analysis: Analysis, style: StylePreset) -> tuple[list[Clip], list[str]]:
    """Corta el video y explica por que."""
    seleccion = plan_selection(analysis, style.pacing)

    clips = [
        Clip(
            id=f"clip{i:04d}",
            source_start=a,
            source_end=b,
            reason="tramo con contenido",
        )
        for i, (a, b) in enumerate(seleccion.keeps)
    ]

    notas: list[str] = []
    quitado = seleccion.removed_seconds
    if quitado > 0:
        porcentaje = quitado / analysis.duration * 100 if analysis.duration else 0
        detalle = ", ".join(
            f"{segundos:.1f}s de {motivo}"
            for motivo, segundos in sorted(
                seleccion.reasons().items(), key=lambda kv: -kv[1]
            )
        )
        notas.append(f"Recortados {quitado:.1f}s ({porcentaje:.0f}%): {detalle}.")
    else:
        notas.append("No habia tiempo muerto que recortar.")

    return clips, notas


def _plan_transitions(edl: EDL, style: StylePreset) -> list[TransitionEffect]:
    """Pone transicion en una fraccion de los cortes; el resto van secos."""
    rules = style.transitions
    cortes = edl.cut_points()
    if not rules.enabled or not cortes or rules.fraction <= 0:
        return []

    cuantas = max(1, int(len(cortes) * rules.fraction))
    # Repartidas de forma regular, para que no se amontonen al principio.
    paso = max(1, len(cortes) // cuantas)
    elegidos = cortes[::paso][:cuantas]

    return [
        TransitionEffect(
            id=f"trans{i:03d}",
            start=round(max(0.0, t - rules.duration / 2), 3),
            end=round(min(edl.duration, t + rules.duration / 2), 3),
            transition=rules.default,
            value_score=0.35,
            cost_weight=0.30,
            rationale=f"transicion {rules.default} en el corte de {t:.1f}s",
        )
        for i, t in enumerate(elegidos)
    ]


def _plan_grade(edl: EDL, style: StylePreset) -> list[GradeEffect]:
    rules = style.grade
    if rules.intensity <= 0.01:
        return []
    return [
        GradeEffect(
            id="grade000",
            start=0.0,
            end=round(edl.duration, 3),
            preset=rules.preset,
            intensity=rules.intensity,
            value_score=0.5,
            # El color cubre todo el video, pero su carga percibida es baja
            # mientras no sea agresivo.
            cost_weight=round(min(1.0, rules.intensity * 0.4), 3),
            rationale=f"color '{rules.preset}' al {rules.intensity:.0%}",
        )
    ]


def build_edl(
    analysis: Analysis,
    style_name: str = "tutorial",
    *,
    intensity: int = 50,
    style_dir=None,
    providers: list[BrollProvider] | None = None,
    assets: AssetBundle | None = None,
) -> EDL:
    """Construye el montaje completo.

    Si se le pasan proveedores, tambien coloca material de apoyo y deja los
    assets resueltos en `assets`, que el renderer necesita para componerlos.
    """
    style = load_style(style_name, style_dir)

    clips, notas = _build_timeline(analysis, style)
    if not clips:
        raise PlanError(
            "La seleccion se quedo sin material.",
            hint="Prueba un estilo menos agresivo o revisa si el audio es todo silencio.",
        )

    edl = EDL(
        source=analysis.media.path,
        source_duration=analysis.duration,
        style=style.name,
        intensity=intensity,
        render=_render_spec(analysis),
        timeline=clips,
        notes=notas,
    )

    efectos: list = []
    if analysis.transcript:
        efectos += plan_captions(edl, analysis.transcript, style.captions, analysis)
        capitulos = plan_chapters(edl, analysis.transcript, style.chapters)
        edl.chapters = capitulos
        efectos += chapter_cards(capitulos, style.chapters)
    else:
        edl.notes.append("Sin transcripcion: no hay subtitulos ni capitulos.")

    zooms, zooms_reserva = plan_punch_ins(edl, analysis, style.emphasis)
    efectos += zooms
    efectos += plan_ken_burns(edl, analysis, style.emphasis)
    reservas = list(zooms_reserva)

    if providers:
        bundle = assets if assets is not None else AssetBundle()
        brolls, brolls_reserva = plan_broll(
            edl, analysis.transcript, providers, style.broll, bundle
        )
        efectos += brolls
        reservas += brolls_reserva
        if brolls:
            edl.notes.append(
                f"Material de apoyo en {len(brolls)} momentos donde nombras algo concreto."
            )

    edl.candidates = reservas

    edl.effects = efectos
    # Las transiciones y el color dependen de la linea de tiempo ya cerrada.
    edl.effects += _plan_transitions(edl, style)
    edl.effects += _plan_grade(edl, style)

    edl.notes.append(
        f"Montaje: {edl.duration:.1f}s en {len(edl.timeline)} clips "
        f"con {len(edl.effects)} efectos."
    )
    return edl
