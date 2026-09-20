"""Interfaz de linea de comandos de VideoForge."""

from __future__ import annotations

import json
from pathlib import Path

import typer
from rich.console import Console
from rich.panel import Panel
from rich.table import Table

from . import __version__
from .cache import JobCache
from .config import Device, Settings, Tier, resolve_model_plan
from .errors import ForgeError

app = typer.Typer(
    name="forge",
    help="Analiza un video, lo monta de verdad y mide que no quede sobresaturado.",
    no_args_is_help=True,
    add_completion=False,
)
cache_app = typer.Typer(name="cache", help="Gestiona el cache de analisis.", no_args_is_help=True)
app.add_typer(cache_app)

console = Console()
err_console = Console(stderr=True)

OK = "[green]OK[/green]"
BAD = "[red]FALTA[/red]"
WARN = "[yellow]AVISO[/yellow]"


def _fail(exc: ForgeError) -> typer.Exit:
    """Imprime un error de forma legible y corta la ejecucion."""
    err_console.print(f"[bold red]Error:[/bold red] {exc.message}")
    if exc.hint:
        err_console.print(f"[dim]{exc.hint}[/dim]")
    return typer.Exit(code=1)


@app.command()
def version() -> None:
    """Muestra la version."""
    console.print(f"VideoForge {__version__}")


@app.command()
def doctor() -> None:
    """Comprueba el entorno: ffmpeg, filtros necesarios, GPU y perfil elegido.

    Es lo primero que hay que ejecutar tras instalar. Nunca falla por tener una
    GPU no soportada: lo reporta y sigue en CPU.
    """
    from . import tools

    settings = Settings.load()
    settings.ensure_dirs()

    table = Table(show_header=False, box=None, padding=(0, 2))

    try:
        caps = tools.capabilities(settings)
    except ForgeError as exc:
        raise _fail(exc) from exc

    table.add_row("ffmpeg", f"{OK} [dim]{caps.ffmpeg}[/dim]")
    table.add_row("", f"[dim]{caps.version}[/dim]")
    if caps.ffprobe:
        table.add_row("ffprobe", f"{OK} [dim]{caps.ffprobe}[/dim]")
    else:
        table.add_row(
            "ffprobe",
            f"{WARN} no encontrado; se sondea con ffmpeg (menos preciso)",
        )

    missing = caps.missing_required()
    if missing:
        table.add_row("filtros", f"{BAD} faltan: {', '.join(missing)}")
    else:
        table.add_row("filtros", f"{OK} los {len(caps.REQUIRED_FILTERS)} necesarios estan")

    table.add_row("encoders", f"[dim]{len(caps.encoders)} disponibles[/dim]")
    table.add_row("libx264", OK if caps.has_encoder("libx264") else BAD)

    if caps.has_cuda:
        table.add_row("GPU", f"{OK} [dim]{caps.gpu_name}[/dim]")
        table.add_row(
            "NVENC",
            f"{OK} h264_nvenc" if caps.can_nvenc else f"{WARN} ffmpeg sin h264_nvenc; se usara libx264",
        )
    else:
        table.add_row("GPU", "[dim]sin GPU NVIDIA detectada; todo en CPU[/dim]")

    # Leer la pantalla no es un extra: en una guia es donde esta el contenido,
    # y sin motor se caen los recuadros, senalar por nombre y el material
    # sacado del propio video.
    from .analysis.ocr import engine_name as _ocr_engine

    motor_ocr = _ocr_engine()
    table.add_row(
        "pantalla",
        f"{OK} se lee con {motor_ocr}" if motor_ocr else
        f"{WARN} nadie lee la pantalla: pip install rapidocr-onnxruntime",
    )

    device = tools.effective_device(settings)
    plan = resolve_model_plan(settings.tier, device)
    table.add_row("dispositivo", f"[bold]{device.value}[/bold]")
    table.add_row("perfil", plan.describe())
    table.add_row("cache", f"[dim]{settings.cache_dir}[/dim]")

    console.print(Panel(table, title="forge doctor", border_style="cyan"))

    if missing:
        err_console.print(
            "[red]Tu build de ffmpeg no trae filtros imprescindibles para el render.[/red]"
        )
        raise typer.Exit(code=1)


@app.command()
def probe(
    source: Path = typer.Argument(..., help="Video de entrada."),
    json_out: bool = typer.Option(False, "--json", help="Saca JSON en vez de tabla."),
) -> None:
    """Muestra los metadatos del video."""
    from . import tools

    settings = Settings.load()
    try:
        info = tools.probe(source, settings)
    except ForgeError as exc:
        raise _fail(exc) from exc

    if json_out:
        console.print_json(info.model_dump_json())
        return

    table = Table(show_header=False, box=None, padding=(0, 2))
    table.add_row("fichero", str(info.path))
    table.add_row("duracion", f"{info.duration:.3f} s")
    table.add_row("tamano", f"{info.size_bytes / 1_048_576:.2f} MiB")
    if info.format_name:
        table.add_row("contenedor", info.format_name)
    if info.video:
        v = info.video
        table.add_row("video", f"{v.codec} · {v.display_width}x{v.display_height} · {v.fps:.3f} fps")
        if v.pix_fmt:
            table.add_row("pix_fmt", v.pix_fmt)
        if v.rotation:
            table.add_row("rotacion", f"{v.rotation}deg")
        table.add_row("orientacion", "vertical" if v.is_vertical else "horizontal")
    else:
        table.add_row("video", "[yellow]ninguno[/yellow]")
    if info.audio:
        a = info.audio
        table.add_row("audio", f"{a.codec} · {a.sample_rate} Hz · {a.channels} canales")
    else:
        table.add_row("audio", "[yellow]ninguno[/yellow]")

    console.print(Panel(table, title="probe", border_style="cyan"))


@app.command()
def analyze(
    source: Path = typer.Argument(..., help="Video de entrada."),
    tier: str = typer.Option(None, "--tier", help="light, balanced o max. Por defecto el de la config."),
    language: str = typer.Option(None, "--lang", help="Fuerza el idioma (ej. es). Por defecto autodetecta."),
    no_speech: bool = typer.Option(False, "--no-speech", help="Salta la transcripcion."),
    force: str = typer.Option(None, "--force", help="Etapas a rehacer separadas por coma, o 'all'."),
    json_out: bool = typer.Option(False, "--json", help="Saca el analisis completo en JSON."),
) -> None:
    """Analiza el video: planos, movimiento, silencios, sonoridad y voz.

    Cada etapa se cachea por separado, asi que repetir el comando sobre el mismo
    fichero es instantaneo y una interrupcion se retoma donde iba.
    """
    from .analysis.pipeline import analyze as run_analysis
    from .config import Tier

    settings = Settings.load()
    try:
        tier_value = Tier(tier.lower()) if tier else None
    except ValueError as exc:
        err_console.print(f"[bold red]Error:[/bold red] tier desconocido: {tier}")
        raise typer.Exit(code=1) from exc

    forced = {s.strip() for s in force.split(",")} if force else None

    with console.status("[cyan]analizando...", spinner="dots") as status:
        def on_progress(stage: str, message: str) -> None:
            status.update(f"[cyan]{message}...")

        try:
            result, warnings = run_analysis(
                source,
                settings,
                tier=tier_value,
                force=forced,
                skip_speech=no_speech,
                language=language,
                progress=on_progress,
            )
        except ForgeError as exc:
            raise _fail(exc) from exc

    if json_out:
        console.print_json(result.model_dump_json())
        for w in warnings:
            err_console.print(f"[yellow]aviso:[/yellow] {w}")
        return

    table = Table(show_header=False, box=None, padding=(0, 2))
    table.add_row("duracion", f"{result.duration:.2f} s")
    table.add_row("planos", str(len(result.shots)))
    if result.shots:
        medio = sum(s.duration for s in result.shots) / len(result.shots)
        table.add_row("plano medio", f"{medio:.2f} s")

    if result.audio:
        a = result.audio
        pct = (a.silent_seconds / result.duration * 100) if result.duration else 0
        table.add_row(
            "silencio",
            f"{a.silent_seconds:.2f} s ({pct:.0f}%) en {len(a.silences)} tramos",
        )
        if a.loudness.integrated_lufs is not None:
            table.add_row("sonoridad", f"{a.loudness.integrated_lufs:.1f} LUFS")
        if a.loudness.true_peak_db is not None:
            table.add_row("pico real", f"{a.loudness.true_peak_db:.1f} dBFS")
    else:
        table.add_row("audio", "[yellow]sin pista de audio[/yellow]")

    if result.transcript:
        t = result.transcript
        table.add_row("idioma", f"{t.language} ({(t.language_probability or 0) * 100:.0f}%)")
        table.add_row("voz", f"{len(t.words)} palabras en {t.speech_seconds:.1f} s")
        table.add_row("modelo", t.model or "-")
        table.add_row("proporcion de voz", f"{result.speech_ratio * 100:.0f}%")
    else:
        table.add_row("voz", "[dim]no transcrita[/dim]")

    console.print(Panel(table, title=f"analisis · {Path(source).name}", border_style="cyan"))

    if result.shots and len(result.shots) <= 40:
        shots_table = Table(box=None, padding=(0, 2))
        shots_table.add_column("#", justify="right", style="dim")
        shots_table.add_column("inicio", justify="right")
        shots_table.add_column("fin", justify="right")
        shots_table.add_column("dur", justify="right")
        shots_table.add_column("movimiento")
        for sh in result.shots:
            energia = result.motion.mean_between(sh.start, sh.end) if result.motion else 0.0
            barra = "#" * int(round(energia * 20))
            shots_table.add_row(
                str(sh.index),
                f"{sh.start:.2f}",
                f"{sh.end:.2f}",
                f"{sh.duration:.2f}",
                f"[cyan]{barra}[/cyan] {energia:.2f}",
            )
        console.print(shots_table)

    for w in warnings:
        err_console.print(f"[yellow]aviso:[/yellow] {w}")


@app.command()
def styles() -> None:
    """Lista los estilos de montaje disponibles."""
    from .plan.styles import describe_styles

    for s in describe_styles():
        console.print(f"[bold cyan]{s.name}[/bold cyan] — {s.label}")
        console.print(f"  [dim]{s.description}[/dim]")
        p = s.pacing
        console.print(
            f"  [dim]ritmo {p.cuts_per_minute.lo:.0f}-{p.cuts_per_minute.hi:.0f} cortes/min · "
            f"subtitulos {'si' if s.captions.enabled else 'no'} · "
            f"zoom {'si' if s.emphasis.punch_in else 'no'} · "
            f"capitulos {'si' if s.chapters.enabled else 'no'}[/dim]"
        )
        console.print()


@app.command()
def plan(
    source: Path = typer.Argument(..., help="Video de entrada."),
    style: str = typer.Option("tutorial", "--style", "-s", help="Estilo de montaje."),
    intensity: int = typer.Option(50, "--intensity", "-i", min=0, max=100, help="Cuanta edicion quieres (0-100)."),
    tier: str = typer.Option(None, "--tier", help="light, balanced o max."),
    no_speech: bool = typer.Option(False, "--no-speech", help="Salta la transcripcion."),
    no_ocr: bool = typer.Option(False, "--no-ocr", help="No leer el texto en pantalla (quita los recuadros)."),
    out: Path = typer.Option(None, "--out", "-o", help="Guarda el EDL en un JSON."),
    json_out: bool = typer.Option(False, "--json", help="Saca el EDL por pantalla en JSON."),
    broll: bool = typer.Option(False, "--broll", help="Inserta material de apoyo."),
    offline: bool = typer.Option(False, "--offline", help="Solo material local, sin bancos de internet."),
) -> None:
    """Analiza el video y decide el montaje, sin renderizar todavia.

    Produce un EDL: la lista de decisiones de edicion. Cada efecto lleva su
    justificacion, asi que se puede revisar antes de gastar un render.
    """
    from .analysis.pipeline import analyze as run_analysis
    from .config import Tier
    from .plan.edl import EffectKind
    from .plan.planner import build_edl

    settings = Settings.load()
    try:
        tier_value = Tier(tier.lower()) if tier else None
    except ValueError as exc:
        err_console.print(f"[bold red]Error:[/bold red] tier desconocido: {tier}")
        raise typer.Exit(code=1) from exc

    with console.status("[cyan]trabajando...", spinner="dots") as status:
        def on_progress(stage: str, message: str) -> None:
            status.update(f"[cyan]{message}...")

        try:
            analysis, warnings = run_analysis(
                source, settings, tier=tier_value, skip_speech=no_speech,
                skip_ocr=no_ocr, progress=on_progress,
            )
            status.update("[cyan]decidiendo el montaje...")
            edl = build_edl(
                analysis, style, intensity=intensity,
                providers=_broll_providers(
                    analysis, enabled=broll, offline=offline, settings=settings
                ),
            )
        except ForgeError as exc:
            raise _fail(exc) from exc

    if out:
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(edl.model_dump_json(indent=2))

    if json_out:
        console.print_json(edl.model_dump_json())
        return

    resumen = Table(show_header=False, box=None, padding=(0, 2))
    resumen.add_row("estilo", f"{edl.style} · intensidad {edl.intensity}")
    resumen.add_row("original", f"{edl.source_duration:.1f} s")
    resumen.add_row(
        "montaje",
        f"[bold]{edl.duration:.1f} s[/bold] "
        f"([green]-{edl.compression:.0%}[/green])" if edl.compression > 0 else f"{edl.duration:.1f} s",
    )
    resumen.add_row("clips", str(len(edl.timeline)))
    if edl.duration:
        resumen.add_row("ritmo", f"{len(edl.cut_points()) / (edl.duration / 60):.1f} cortes/min")
    resumen.add_row("efectos", str(len(edl.effects)))
    if edl.chapters:
        resumen.add_row("capitulos", str(len(edl.chapters)))
    console.print(Panel(resumen, title=f"montaje · {Path(source).name}", border_style="cyan"))

    conteo: dict[str, int] = {}
    for e in edl.effects:
        conteo[e.kind.value] = conteo.get(e.kind.value, 0) + 1
    if conteo:
        tabla = Table(box=None, padding=(0, 2))
        tabla.add_column("efecto")
        tabla.add_column("cuantos", justify="right")
        tabla.add_column("ejemplo de por que", style="dim")
        for kind, n in sorted(conteo.items(), key=lambda kv: -kv[1]):
            ejemplo = next((e.rationale for e in edl.effects if e.kind.value == kind), "")
            tabla.add_row(kind, str(n), ejemplo[:64])
        console.print(tabla)

    if analysis is not None and analysis.narrative:
        console.print("\n[bold]Lo que entendio del video[/bold]")
        tabla = Table(show_header=True, header_style="dim", box=None, padding=(0, 2))
        tabla.add_column("parte"); tabla.add_column("desde"); tabla.add_column("dura")
        tabla.add_column("por que")
        for tramo in analysis.narrative:
            tabla.add_row(
                f"[cyan]{tramo.role.value}[/cyan]",
                f"{int(tramo.start // 60)}:{int(tramo.start % 60):02d}",
                f"{tramo.duration:.0f}s",
                f"[dim]{tramo.rationale}[/dim]",
            )
        console.print(tabla)

    if analysis is not None and analysis.cues:
        console.print("\n[bold]Lo que le pediste al montaje sin saberlo[/bold]")
        for c in analysis.cues[:14]:
            console.print(
                f"  [cyan]{int(c.start // 60)}:{int(c.start % 60):02d}[/cyan]"
                f"  [dim]{c.rationale}[/dim]"
            )
        if len(analysis.cues) > 14:
            console.print(f"  [dim]... y {len(analysis.cues) - 14} mas[/dim]")

    if edl.chapters:
        console.print("\n[bold]Capitulos[/bold] [dim](listos para la descripcion de YouTube)[/dim]")
        for c in edl.chapters:
            console.print(f"  [cyan]{c.timestamp()}[/cyan] {c.title}")

    if edl.notes:
        console.print()
        for n in edl.notes:
            console.print(f"[dim]· {n}[/dim]")

    if out:
        console.print(f"\nEDL guardado en [bold]{out}[/bold]")

    for w in warnings:
        err_console.print(f"[yellow]aviso:[/yellow] {w}")


@app.command()
def render(
    source: Path = typer.Argument(None, help="Video de entrada. Omitelo si usas --from-edl."),
    out: Path = typer.Option(None, "--out", "-o", help="Fichero de salida. Por defecto <nombre>-editado.mp4."),
    style: str = typer.Option("tutorial", "--style", "-s", help="Estilo de montaje."),
    intensity: int = typer.Option(50, "--intensity", "-i", min=0, max=100, help="Cuanta edicion quieres (0-100)."),
    from_edl: Path = typer.Option(None, "--from-edl", help="Renderiza un EDL ya guardado en vez de planificar."),
    preview: bool = typer.Option(False, "--preview", help="Render rapido a baja resolucion para iterar."),
    tier: str = typer.Option(None, "--tier", help="light, balanced o max."),
    no_speech: bool = typer.Option(False, "--no-speech", help="Salta la transcripcion."),
    no_ocr: bool = typer.Option(False, "--no-ocr", help="No leer el texto en pantalla (quita los recuadros)."),
    no_gpu: bool = typer.Option(False, "--no-gpu", help="Fuerza encoder por CPU."),
    balance: bool = typer.Option(False, "--balance", help="Reajusta los efectos si el montaje se sale de banda."),
    broll: bool = typer.Option(False, "--broll", help="Inserta material de apoyo."),
    offline: bool = typer.Option(False, "--offline", help="Solo material local, sin bancos de internet."),
    save_edl: Path = typer.Option(None, "--save-edl", help="Guarda tambien el EDL usado."),
) -> None:
    """Monta el video y lo renderiza a un MP4 real.

    Analiza, decide el montaje y encodea. Con --preview saca una version rapida
    a baja resolucion para revisar el montaje antes del render definitivo.
    """
    from .analysis.pipeline import analyze as run_analysis
    from .config import Tier
    from .plan.edl import EDL
    from .plan.planner import build_edl
    from .assets.types import AssetBundle
    from .render.renderer import render as do_render

    settings = Settings.load()
    bundle = AssetBundle()
    # Solo hay analisis si partimos del video; con --from-edl no lo tenemos, y
    # el balanceador sabe funcionar sin el (pierde la deteccion de zooms sobre
    # planos que ya se mueven, pero el resto de metricas salen del propio EDL).
    analysis = None

    if from_edl:
        try:
            edl = EDL.model_validate_json(from_edl.read_text())
        except (OSError, ValueError) as exc:
            err_console.print(f"[bold red]Error:[/bold red] no pude leer el EDL: {exc}")
            raise typer.Exit(code=1) from exc
        origen = Path(edl.source)
    elif source:
        origen = source
        try:
            tier_value = Tier(tier.lower()) if tier else None
        except ValueError as exc:
            err_console.print(f"[bold red]Error:[/bold red] tier desconocido: {tier}")
            raise typer.Exit(code=1) from exc

        with console.status("[cyan]analizando...", spinner="dots") as status:
            def on_progress(stage: str, message: str) -> None:
                status.update(f"[cyan]{message}...")

            try:
                analysis, warnings = run_analysis(
                    source, settings, tier=tier_value, skip_speech=no_speech,
                    skip_ocr=no_ocr, progress=on_progress,
                )
                status.update("[cyan]decidiendo el montaje...")
                elegido = _resolve_style(style, analysis)
                edl = build_edl(
                    analysis, elegido, intensity=intensity,
                    providers=_broll_providers(
                    analysis, enabled=broll, offline=offline, settings=settings
                ),
                    assets=bundle,
                )
            except ForgeError as exc:
                raise _fail(exc) from exc
        for w in warnings:
            err_console.print(f"[yellow]aviso:[/yellow] {w}")
    else:
        err_console.print("[bold red]Error:[/bold red] indica un video o usa --from-edl.")
        raise typer.Exit(code=1)

    if balance:
        from .saturation.balance import rebalance

        informe = rebalance(edl, analysis, intensity=intensity)
        if informe.changed:
            console.print(f"[bold]Auto-balanceo:[/bold] {informe.summary()}")
        else:
            console.print(f"[dim]Auto-balanceo: {informe.summary()}[/dim]")

    if save_edl:
        save_edl.parent.mkdir(parents=True, exist_ok=True)
        save_edl.write_text(edl.model_dump_json(indent=2))

    destino = out or origen.with_name(f"{origen.stem}-editado{'-preview' if preview else ''}.mp4")

    console.print(
        f"[dim]{edl.source_duration:.1f}s -> {edl.duration:.1f}s · "
        f"{len(edl.timeline)} clips · {len(edl.effects)} efectos[/dim]"
    )

    from rich.progress import BarColumn, Progress, TextColumn, TimeRemainingColumn

    with Progress(
        TextColumn("[cyan]{task.description}"),
        BarColumn(),
        TextColumn("{task.percentage:>3.0f}%"),
        TimeRemainingColumn(),
        console=console,
    ) as barra:
        tarea = barra.add_task("preparando", total=100)

        def on_render(fraction: float, label: str) -> None:
            barra.update(tarea, completed=fraction * 100, description=label)

        try:
            resultado = do_render(
                edl, destino, settings,
                preview=preview,
                use_gpu=not no_gpu,
                fonts_dir=ASSETS_DIR / "fonts",
                music_dir=ASSETS_DIR / "music",
                assets=bundle,
                progress=on_render,
            )
        except ForgeError as exc:
            raise _fail(exc) from exc
        barra.update(tarea, completed=100, description="listo")

    tabla = Table(show_header=False, box=None, padding=(0, 2))
    tabla.add_row("salida", f"[bold]{resultado.path}[/bold]")
    tabla.add_row("duracion", f"{resultado.duration:.1f} s")
    tabla.add_row("render", f"{resultado.seconds_taken:.1f} s ({resultado.duration / max(resultado.seconds_taken, 1e-6):.1f}x tiempo real)")
    tabla.add_row("encoder", resultado.encoder)
    tabla.add_row("aplicado", ", ".join(resultado.applied))
    if resultado.measured_lufs is not None:
        objetivo = edl.render.target_lufs
        linea = f"{resultado.measured_lufs:.1f} LUFS en el fichero (objetivo {objetivo:.0f})"
        if resultado.measured_lufs < objetivo - 1.0:
            linea += " · el material es muy dinamico y apretarlo mas lo aplastaria"
        tabla.add_row("audio", linea)
    if resultado.preview:
        tabla.add_row("", "[yellow]es una previsualizacion, no el render final[/yellow]")
    console.print(Panel(tabla, title="render", border_style="green"))

    if edl.chapters:
        console.print("\n[bold]Capitulos[/bold] [dim](copia esto en la descripcion)[/dim]")
        console.print(edl.chapter_markers())


#: Rampa de bloques para el mapa de calor en terminal.
_HEAT_BLOCKS = " .:-=+*#%@"


def _heatmap_line(valores: list[float]) -> str:
    """Dibuja la curva de densidad como una linea de bloques coloreados."""
    salida = []
    for v in valores:
        idx = min(len(_HEAT_BLOCKS) - 1, int(v * len(_HEAT_BLOCKS)))
        bloque = _HEAT_BLOCKS[idx]
        color = "green" if v < 0.45 else ("yellow" if v < 0.72 else "red")
        salida.append(f"[{color}]{bloque}[/{color}]")
    return "".join(salida)


def _print_saturation(report, console_out) -> None:
    """Imprime el diagnostico de saturacion."""
    color = {
        "sub-editado": "blue",
        "en el punto": "green",
        "cargado": "yellow",
        "sobresaturado": "red",
        # Le falta montaje donde importa y le sobra donde no: no es un punto
        # de la escala, es las dos cosas a la vez.
        "descompensado": "magenta",
    }.get(report.verdict, "white")

    aguja = Table(show_header=False, box=None, padding=(0, 2))
    aguja.add_row("saturacion", f"[bold {color}]{report.score:.0f}/100[/bold {color}]  {report.verdict}")
    aguja.add_row("estilo", f"{report.style} · intensidad {report.intensity}")
    aguja.add_row(
        "escala",
        "[dim]0 |[/dim][blue]sub-editado[/blue][dim]| 28 |[/dim][green]en el punto[/green]"
        "[dim]| 68 |[/dim][yellow]cargado[/yellow][dim]| 85 |[/dim][red]sobresaturado[/red][dim]| 100[/dim]",
    )
    console_out.print(Panel(aguja, title="saturacion", border_style=color))

    if report.heatmap:
        console_out.print("[bold]Densidad a lo largo del montaje[/bold]")
        console_out.print("  " + _heatmap_line(report.heatmap))
        console_out.print(
            f"  [dim]0:00{' ' * max(0, len(report.heatmap) - 10)}"
            f"{report.metrics.duration / 60:.0f}:{int(report.metrics.duration % 60):02d}[/dim]"
        )

    tabla = Table(box=None, padding=(0, 2))
    tabla.add_column("metrica")
    tabla.add_column("valor", justify="right")
    tabla.add_column("banda del estilo", justify="center")
    tabla.add_column("")
    for r in sorted(report.readings, key=lambda x: (x.status == "dentro", -x.weight)):
        marca = {"bajo": "[blue]bajo[/blue]", "alto": "[red]alto[/red]"}.get(r.status, "[green]ok[/green]")
        if not r.counts:
            marca += " [dim](no puntua)[/dim]"
        tabla.add_row(
            r.name,
            f"{r.value:.2f}",
            f"{r.band.lo:.2f} - {r.band.hi:.2f}",
            f"{marca}  [dim]{r.advice}[/dim]",
        )
    console_out.print(tabla)

    if report.hot_windows:
        console_out.print(
            f"\n[yellow]Zonas mas cargadas:[/yellow] "
            + ", ".join(f"{a:.0f}-{b:.0f}s" for a, b in report.hot_windows[:6])
        )


@app.command()
def saturation(
    source: Path = typer.Argument(None, help="Video de entrada. Omitelo si usas --from-edl."),
    style: str = typer.Option("tutorial", "--style", "-s", help="Estilo de montaje."),
    intensity: int = typer.Option(50, "--intensity", "-i", min=0, max=100, help="Cuanta edicion quieres (0-100)."),
    from_edl: Path = typer.Option(None, "--from-edl", help="Analiza un EDL ya guardado."),
    balance: bool = typer.Option(False, "--balance", help="Reajusta el montaje hasta entrar en banda."),
    out: Path = typer.Option(None, "--out", "-o", help="Guarda el EDL (reajustado si usas --balance)."),
    no_speech: bool = typer.Option(False, "--no-speech", help="Salta la transcripcion."),
) -> None:
    """Mide si el montaje esta sobresaturado para el estilo elegido.

    La escala no es absoluta: la misma carga puede ser "en el punto" en un short
    de gameplay y "sobresaturado" en una guia. Con --balance, ademas de medir,
    ajusta los efectos hasta entrar en banda sin cambiar la duracion.
    """
    from .analysis.pipeline import analyze as run_analysis
    from .plan.edl import EDL
    from .plan.planner import build_edl
    from .saturation.balance import rebalance
    from .saturation.score import evaluate

    settings = Settings.load()
    analysis = None

    if from_edl:
        try:
            edl = EDL.model_validate_json(from_edl.read_text())
        except (OSError, ValueError) as exc:
            err_console.print(f"[bold red]Error:[/bold red] no pude leer el EDL: {exc}")
            raise typer.Exit(code=1) from exc
    elif source:
        with console.status("[cyan]analizando...", spinner="dots") as status:
            def on_progress(stage: str, message: str) -> None:
                status.update(f"[cyan]{message}...")

            try:
                analysis, warnings = run_analysis(
                    source, settings, skip_speech=no_speech, progress=on_progress
                )
                edl = build_edl(analysis, style, intensity=intensity)
            except ForgeError as exc:
                raise _fail(exc) from exc
        for w in warnings:
            err_console.print(f"[yellow]aviso:[/yellow] {w}")
    else:
        err_console.print("[bold red]Error:[/bold red] indica un video o usa --from-edl.")
        raise typer.Exit(code=1)

    try:
        if balance:
            duracion_antes = edl.duration
            informe = rebalance(edl, analysis, intensity=intensity)
            console.print(f"[bold]{informe.summary()}[/bold]")
            if informe.removed:
                console.print("\n[dim]Lo que quito:[/dim]")
                for c in informe.removed[:8]:
                    console.print(f"  [red]-[/red] {c.describe()}")
                if len(informe.removed) > 8:
                    console.print(f"  [dim]... y {len(informe.removed) - 8} mas[/dim]")
            if informe.added:
                console.print("\n[dim]Lo que anadio:[/dim]")
                for c in informe.added[:8]:
                    console.print(f"  [green]+[/green] {c.describe()}")
            console.print(
                f"\n[dim]Duracion del montaje: {duracion_antes:.1f}s "
                f"-> {edl.duration:.1f}s (los efectos no la cambian)[/dim]\n"
            )
            reporte = informe.after
        else:
            reporte = evaluate(edl, analysis, intensity=intensity)
    except ForgeError as exc:
        raise _fail(exc) from exc

    _print_saturation(reporte, console)

    if out:
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(edl.model_dump_json(indent=2))
        console.print(f"\nEDL guardado en [bold]{out}[/bold]")


#: Carpeta de material del proyecto.
ASSETS_DIR = Path(__file__).resolve().parent.parent.parent / "assets"


def _resolve_style(style: str, analysis) -> str:
    """Resuelve 'auto' mirando que clase de material es.

    Evita que haya que saberse los estilos de memoria: una guia hablada y
    quieta pide `tutorial`, un gameplay sin voz pide `gaming-hype`.
    """
    if style != "auto":
        return style

    from .understand.profile import build_profile

    perfil = build_profile(analysis)
    console.print(
        f"[dim]Estilo elegido automaticamente: [bold]{perfil.suggested_style}[/bold] "
        f"(material {perfil.domain.value})[/dim]"
    )
    return perfil.suggested_style


def _broll_providers(analysis, *, enabled: bool, offline: bool, settings=None):
    """Proveedores de material de apoyo, si se pidieron."""
    if not enabled:
        return None
    from .assets.providers import build_providers

    return build_providers(
        analysis, local_dir=ASSETS_DIR / "broll", allow_network=not offline,
        settings=settings,
    )


@app.command()
def identify(
    source: Path = typer.Argument(..., help="Video de entrada."),
    no_ocr: bool = typer.Option(False, "--no-ocr", help="No leer el texto en pantalla."),
    no_speech: bool = typer.Option(False, "--no-speech", help="Salta la transcripcion."),
) -> None:
    """Dice de que va el video: tipo de material, tema y de donde lo deduce.

    Ninguna senal decide sola. El texto en pantalla es la mas literal, la voz
    aporta el tema, y el ritmo (cuanta voz y cuanto movimiento) separa una guia
    de un gameplay sin necesitar ningun modelo.
    """
    from .analysis.pipeline import analyze_run
    from .analysis.vision import build_tagger, tag_video
    from .understand.profile import build_profile

    settings = Settings.load()

    with console.status("[cyan]analizando...", spinner="dots") as status:
        def on_progress(stage: str, message: str) -> None:
            status.update(f"[cyan]{message}...")

        try:
            analysis, run = analyze_run(
                source, settings, skip_speech=no_speech, skip_ocr=no_ocr, progress=on_progress
            )
            status.update("[cyan]identificando el contenido...")
            tagger = build_tagger(settings, run.device)
            etiquetas = []
            if tagger.available:
                instantes = [
                    s.start + s.duration / 2 for s in analysis.shots[:40]
                ]
                etiquetas = tag_video(
                    run.cache.artifact(f"proxy_{run.plan.analysis_height}p.mp4"),
                    settings, instantes, tagger,
                )
            perfil = build_profile(
                analysis, screen_text=run.screen_text, vision_tags=etiquetas
            )
        except ForgeError as exc:
            raise _fail(exc) from exc

    tabla = Table(show_header=False, box=None, padding=(0, 2))
    tabla.add_row("tipo de material", f"[bold]{perfil.domain.value}[/bold]")
    if perfil.topic:
        tabla.add_row("tema", f"[bold cyan]{perfil.topic}[/bold cyan]")
    tabla.add_row("confianza", f"{perfil.confidence:.0%}")
    tabla.add_row("voz", f"{perfil.speech_ratio:.0%} del video")
    tabla.add_row("movimiento", f"{perfil.motion_level:.0%}")
    tabla.add_row("estilo sugerido", f"[bold]{perfil.suggested_style}[/bold]")
    console.print(Panel(tabla, title=f"identificacion · {Path(source).name}", border_style="cyan"))

    if perfil.entities:
        console.print("[bold]En que se basa[/bold]")
        for e in perfil.top_entities(8):
            color = {"pantalla": "green", "vision": "magenta", "voz": "blue"}.get(e.source, "white")
            console.print(f"  [{color}]{e.source:9s}[/{color}] {e.label}  [dim]{e.confidence:.0%}[/dim]")

    if perfil.keywords:
        console.print(f"\n[dim]Palabras clave: {', '.join(perfil.keywords[:10])}[/dim]")

    if perfil.missing:
        console.print("\n[yellow]Senales no disponibles:[/yellow]")
        for m in perfil.missing:
            console.print(f"  [dim]· {m}[/dim]")

    for w in run.warnings:
        err_console.print(f"[yellow]aviso:[/yellow] {w}")


@app.command()
def serve(
    host: str = typer.Option("127.0.0.1", "--host", help="Interfaz donde escuchar."),
    port: int = typer.Option(8000, "--port", help="Puerto."),
    reload: bool = typer.Option(False, "--reload", help="Recarga al cambiar el codigo."),
) -> None:
    """Levanta la API web.

    La interfaz vive aparte, en `videoforge/frontend`: se arranca con
    `npm run dev` y habla con esta API a traves de su proxy.
    """
    try:
        import uvicorn
    except ImportError as exc:
        err_console.print(
            '[bold red]Error:[/bold red] falta uvicorn. Instalalo con: pip install -e ".[api]"'
        )
        raise typer.Exit(code=1) from exc

    console.print(f"API en [bold]http://{host}:{port}[/bold]  ·  documentacion en /docs")
    console.print("[dim]La interfaz web se arranca aparte desde videoforge/frontend[/dim]")
    uvicorn.run("forge.api.app:app", host=host, port=port, reload=reload)


@app.command()
def demo(
    out: Path = typer.Option(Path("demo"), "--out", "-o", help="Carpeta donde dejar los ficheros."),
    style: str = typer.Option("tutorial", "--style", "-s", help="Estilo de montaje."),
    minutes: float = typer.Option(
        None, "--minutes", "-m", min=0.5,
        help="Duracion de la guia. Por defecto, un minuto.",
    ),
) -> None:
    """Genera una guia de ejemplo y la monta entera, para ver el resultado.

    Fabrica una grabacion de pantalla realista con voz y pausas, la analiza, la
    monta y la renderiza. Deja el original y el editado uno al lado del otro
    para poder compararlos.

    Sirve para comprobar que la instalacion funciona de punta a punta sin tener
    que subir nada. Con `--minutes 20` genera una guia de formato largo, que es
    donde salen los problemas que un video de un minuto no ensena: un ritmo
    agradable durante un minuto, sostenido veinte, cansa.
    """
    from .analysis.pipeline import analyze as run_analysis
    from .demo import build_demo_video, demo_screen_text, demo_transcript
    from .plan.planner import build_edl
    from .render.renderer import render as do_render
    from .saturation.score import evaluate

    settings = Settings.load()
    out.mkdir(parents=True, exist_ok=True)
    original = out / "guia-original.mp4"
    editado = out / "guia-editada.mp4"

    with console.status("[cyan]generando la guia de ejemplo...", spinner="dots") as status:
        try:
            _, timing = build_demo_video(original, settings, minutes=minutes)

            status.update("[cyan]analizando...")
            analysis, _ = run_analysis(original, settings, force={"all"}, skip_speech=True)
            # El guion de la demo hace de transcripcion y su pantalla hace de
            # OCR: asi se puede probar el montaje completo, recuadros incluidos,
            # aunque no haya ni modelo de voz ni Tesseract instalados.
            analysis.transcript = demo_transcript(timing)
            analysis.screen_text = demo_screen_text(timing)

            status.update("[cyan]decidiendo el montaje...")
            edl = build_edl(analysis, style)
            reporte = evaluate(edl, analysis)

            status.update("[cyan]renderizando...")
            resultado = do_render(
                edl, editado, settings,
                fonts_dir=ASSETS_DIR / "fonts",
                music_dir=ASSETS_DIR / "music",
            )
        except ForgeError as exc:
            raise _fail(exc) from exc

    tabla = Table(show_header=False, box=None, padding=(0, 2))
    tabla.add_row("original", f"{original}  [dim]{edl.source_duration:.1f}s[/dim]")
    tabla.add_row("editado", f"[bold]{editado}[/bold]  [dim]{edl.duration:.1f}s[/dim]")
    tabla.add_row("recorte", f"[green]-{edl.compression:.0%}[/green] de tiempo muerto")
    tabla.add_row("ritmo", f"{len(edl.cut_points()) / (edl.duration / 60):.1f} cortes/min")
    tabla.add_row("saturacion", f"{reporte.score:.0f}/100 · {reporte.verdict}")
    tabla.add_row("encoder", resultado.encoder)
    console.print(Panel(tabla, title="demo", border_style="green"))

    conteo: dict[str, int] = {}
    for e in edl.effects:
        conteo[e.kind.value] = conteo.get(e.kind.value, 0) + 1
    console.print("[bold]Lo que hizo[/bold]")
    for kind, n in sorted(conteo.items(), key=lambda kv: -kv[1]):
        ejemplo = next((e.rationale for e in edl.effects if e.kind.value == kind), "")
        console.print(f"  {n:3d} × {kind:12s} [dim]{ejemplo[:60]}[/dim]")

    console.print(f"\n[dim]Abre los dos ficheros y comparalos.[/dim]")


@app.command("eval-nombres")
def eval_nombres(
    fichero: Path = typer.Argument(
        ..., help="JSON con las secciones y el nombre que deberian llevar."
    ),
) -> None:
    """Mide el modelo local contra la cuenta al nombrar secciones.

    El fichero es una lista de secciones con el nombre que tu le pondrias:

        [
          {"esperado": "expediciones",
           "texto": "vamos con la estacion de expediciones ...",
           "otras": "colocamos la caja de pals ..."},
          ...
        ]

    Aqui no hay forma de bajar los pesos de ningun modelo, asi que este numero
    **lo sacas tu**: si el modelo no le gana a la cuenta, se queda apagado y no
    se ha perdido nada. Configura `FORGE_MODEL_ENDPOINT` antes de ejecutarlo.
    """
    from .understand.namer import Section, model_name, stat_name

    settings = Settings.load()
    modelo = settings.local_model()

    try:
        casos = json.loads(fichero.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        err_console.print(f"[bold red]Error:[/bold red] no pude leer {fichero}: {exc}")
        raise typer.Exit(code=1)

    if modelo is None:
        console.print(
            f"{WARN} sin modelo configurado: solo se mide la cuenta. "
            "Pon [bold]FORGE_MODEL_ENDPOINT[/bold] (p. ej. http://localhost:11434)."
        )
    elif not modelo.available():
        console.print(f"{WARN} nadie contesta en {modelo.endpoint}: solo la cuenta.")
        modelo = None

    tabla = Table(box=None, padding=(0, 2))
    for columna in ("esperado", "cuenta", "modelo"):
        tabla.add_column(columna)

    aciertos_cuenta = aciertos_modelo = 0
    for caso in casos:
        seccion = Section(
            text=caso.get("texto", ""),
            others=caso.get("otras", ""),
            opening=caso.get("apertura") or caso.get("texto", "")[:120],
        )
        esperado = (caso.get("esperado") or "").strip().lower()
        por_cuenta = stat_name(seccion)
        por_modelo = model_name(seccion, modelo) if modelo else ""

        bien_cuenta = esperado and esperado in por_cuenta.lower()
        bien_modelo = esperado and esperado in por_modelo.lower()
        aciertos_cuenta += bool(bien_cuenta)
        aciertos_modelo += bool(bien_modelo)

        def marca(texto: str, bien: bool) -> str:
            if not texto:
                return "[dim]-[/dim]"
            return f"[green]{texto}[/green]" if bien else f"[red]{texto}[/red]"

        tabla.add_row(esperado, marca(por_cuenta, bien_cuenta), marca(por_modelo, bien_modelo))

    total = len(casos) or 1
    console.print(tabla)
    console.print(
        f"\n  cuenta  [bold]{aciertos_cuenta}/{len(casos)}[/bold] "
        f"({aciertos_cuenta / total:.0%})"
    )
    if modelo is not None:
        console.print(
            f"  modelo  [bold]{aciertos_modelo}/{len(casos)}[/bold] "
            f"({aciertos_modelo / total:.0%})"
            f"  [dim]· {modelo.used} de {modelo.asked} respuestas validas[/dim]"
        )
        mejor = "el modelo" if aciertos_modelo > aciertos_cuenta else "la cuenta"
        if aciertos_modelo == aciertos_cuenta:
            mejor = "empate: se queda la cuenta, que no necesita nada instalado"
        console.print(f"\n  Gana [bold]{mejor}[/bold].")


@app.command()
def fonts() -> None:
    """Copia a `assets/fonts/` las fuentes libres instaladas con pip.

    Vienen en paquetes de PyPI (`pip install -e ".[fonts]"`), asi que no hay
    nada que bajar de ninguna web ni licencia que mirar: son OFL. Se copian aqui
    porque es la carpeta que el render le pasa a libass, y asi el video sale
    igual en cualquier maquina aunque el sistema no tenga esa fuente instalada.
    """
    destino = ASSETS_DIR / "fonts"
    destino.mkdir(parents=True, exist_ok=True)

    import importlib.util

    copiadas: list[str] = []
    for paquete in ("font_fredoka_one", "font_source_sans_pro"):
        spec = importlib.util.find_spec(paquete)
        if spec is None or not spec.submodule_search_locations:
            console.print(f"  {WARN} falta {paquete.replace('_', '-')}")
            continue
        carpeta = Path(list(spec.submodule_search_locations)[0]) / "files"
        for fichero in sorted(carpeta.glob("*.ttf")):
            # Solo los cortes que se usan: el paquete trae doce y pesan.
            if "Black" in fichero.name or "FredokaOne" in fichero.name:
                (destino / fichero.name).write_bytes(fichero.read_bytes())
                copiadas.append(fichero.name)

    if not copiadas:
        console.print(
            f"{WARN} no se copio ninguna. Instalalas con "
            "[bold]pip install -e \".[fonts]\"[/bold]."
        )
        raise typer.Exit(code=1)

    for nombre in copiadas:
        console.print(f"  {OK} {nombre}")
    console.print(f"\nEn [bold]{destino}[/bold]. Nombralas en el estilo, en `plates.font`.")


@app.command("make-fixture")
def make_fixture_cmd(
    out: Path = typer.Argument(Path("fixture.mp4"), help="Fichero de salida."),
) -> None:
    """Genera el video sintetico de pruebas (no necesita red ni assets)."""
    from .fixtures import DEFAULT_SCENES, TOTAL_SECONDS, make_fixture

    settings = Settings.load()
    try:
        path = make_fixture(out, settings)
    except ForgeError as exc:
        raise _fail(exc) from exc

    console.print(f"Generado [bold]{path}[/bold] · {TOTAL_SECONDS:g}s · {len(DEFAULT_SCENES)} escenas")


@cache_app.command("info")
def cache_info(source: Path = typer.Argument(..., help="Video de entrada.")) -> None:
    """Dice que hay cacheado para un video."""
    settings = Settings.load()
    settings.ensure_dirs()
    try:
        jc = JobCache(settings, source)
    except OSError as exc:
        err_console.print(f"[bold red]Error:[/bold red] {exc}")
        raise typer.Exit(code=1) from exc

    stages = sorted(p.stem for p in jc.root.glob("*.json"))
    table = Table(show_header=False, box=None, padding=(0, 2))
    table.add_row("huella", jc.fingerprint)
    table.add_row("carpeta", str(jc.root))
    table.add_row("etapas", ", ".join(stages) if stages else "[dim]ninguna[/dim]")
    table.add_row("en disco", f"{jc.size_on_disk() / 1_048_576:.2f} MiB")
    console.print(Panel(table, title="cache", border_style="cyan"))


@cache_app.command("clear")
def cache_clear(source: Path = typer.Argument(..., help="Video de entrada.")) -> None:
    """Borra lo cacheado de un video."""
    settings = Settings.load()
    settings.ensure_dirs()
    jc = JobCache(settings, source)
    freed = jc.size_on_disk()
    jc.clear()
    console.print(f"Cache borrado · liberados {freed / 1_048_576:.2f} MiB")


if __name__ == "__main__":
    app()
