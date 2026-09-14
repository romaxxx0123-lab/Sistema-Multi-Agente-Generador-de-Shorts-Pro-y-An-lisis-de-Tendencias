"""Interfaz de linea de comandos de VideoForge."""

from __future__ import annotations

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
