"""Ejecuta el render: del EDL a un MP4 real.

Tres decisiones que ahorran tiempo y disgustos:

- **Validacion en seco**: antes de encodear 20 minutos se corre el mismo grafo
  durante 1 segundo contra `null`. Si hay un error de sintaxis en los filtros,
  salta en un segundo en vez de a los diez minutos.
- **Masterizado en dos pasadas**: se mide la sonoridad del audio ya montado y
  luego se normaliza con esas medidas. `loudnorm` en una sola pasada es
  dinamico y bombea; con las medidas reales la correccion es lineal y limpia.
- **Progreso de verdad**, leido de `-progress` de ffmpeg, no estimado.
"""

from __future__ import annotations

import json
import re
import subprocess
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path

from ..config import Settings
from ..errors import RenderError
from ..plan.edl import EDL, EffectKind
from ..tools import Capabilities, capabilities, ffmpeg_bin
from .ass import write_ass
from .graph import build_graph

ProgressFn = Callable[[float, str], None]

#: Altura del render de previsualizacion.
PREVIEW_HEIGHT = 540
#: Cuanto stderr guardamos al fallar.
_ERR_TAIL = 3000

_LOUDNORM_JSON = re.compile(r"\{[^{}]*\"input_i\"[^{}]*\}", re.DOTALL)


@dataclass
class RenderResult:
    path: Path
    duration: float
    seconds_taken: float
    encoder: str
    applied: list[str] = field(default_factory=list)
    measured_lufs: float | None = None
    preview: bool = False

    def summary(self) -> str:
        velocidad = self.duration / self.seconds_taken if self.seconds_taken else 0
        return (
            f"{self.path.name} · {self.duration:.1f}s · {self.seconds_taken:.1f}s "
            f"de render ({velocidad:.1f}x) · {self.encoder}"
        )


def _video_codec_args(caps: Capabilities, edl: EDL, *, preview: bool, use_gpu: bool) -> tuple[list[str], str]:
    """Elige encoder y calidad."""
    if use_gpu and caps.can_nvenc:
        # p4/p7 son los presets de calidad de NVENC; cq es su equivalente a CRF.
        preset = "p4" if preview else "p6"
        cq = 28 if preview else 21
        return (
            ["-c:v", "h264_nvenc", "-preset", preset, "-rc", "vbr", "-cq", str(cq), "-b:v", "0"],
            f"h264_nvenc ({preset}, cq {cq})",
        )
    preset = "veryfast" if preview else edl.render.preset
    crf = 28 if preview else edl.render.crf
    return (
        ["-c:v", "libx264", "-preset", preset, "-crf", str(crf)],
        f"libx264 ({preset}, crf {crf})",
    )


def _run_with_progress(
    cmd: list[str],
    total_seconds: float,
    progress: ProgressFn | None,
    label: str,
) -> str:
    """Lanza ffmpeg y traduce su `-progress` a una fraccion 0..1."""
    proc = subprocess.Popen(
        cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, bufsize=1
    )
    assert proc.stdout is not None

    for linea in proc.stdout:
        if not progress or not total_seconds:
            continue
        if linea.startswith("out_time_ms="):
            try:
                micros = int(linea.split("=", 1)[1])
            except ValueError:
                continue
            # out_time_ms viene en microsegundos pese al nombre.
            progress(min(1.0, micros / 1e6 / total_seconds), label)

    stderr = proc.stderr.read() if proc.stderr else ""
    if proc.stderr:
        proc.stderr.close()
    proc.stdout.close()

    if proc.wait() != 0:
        raise RenderError(
            f"ffmpeg fallo durante: {label}",
            hint=stderr[-_ERR_TAIL:] if stderr else None,
        )
    return stderr


def _dry_run(ffmpeg: Path, source: Path, graph, settings: Settings) -> None:
    """Comprueba el grafo con un segundo de video antes del render completo."""
    cmd = [
        str(ffmpeg), "-hide_banner", "-nostdin", "-y",
        "-i", str(source),
        "-filter_complex", graph.filter_complex,
        "-map", graph.video_label,
    ]
    if graph.audio_label:
        cmd += ["-map", graph.audio_label]
    cmd += ["-t", "1", "-f", "null", "-"]

    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    if proc.returncode != 0:
        raise RenderError(
            "El grafo de filtros no es valido (detectado en la prueba de 1 segundo).",
            hint=(proc.stderr or "")[-_ERR_TAIL:],
        )


def _measure_loudness(
    ffmpeg: Path, source: Path, edl: EDL, settings: Settings, target_lufs: float
) -> dict | None:
    """Primera pasada: mide la sonoridad del audio ya montado."""
    graph = build_graph(edl, has_audio=True, target_lufs=None, audio_only=True)
    if not graph.audio_label:
        return None

    cmd = [
        str(ffmpeg), "-hide_banner", "-nostdin",
        "-i", str(source),
        "-filter_complex",
        graph.filter_complex
        + f";{graph.audio_label}loudnorm=I={target_lufs:.1f}:TP=-1.5:LRA=11:print_format=json[ameasure]",
        "-map", "[ameasure]",
        "-f", "null", "-",
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=None)
    if proc.returncode != 0:
        return None

    m = _LOUDNORM_JSON.search(proc.stderr or "")
    if not m:
        return None
    try:
        datos = json.loads(m.group(0))
    except json.JSONDecodeError:
        return None
    # Un audio totalmente mudo devuelve -inf y romperia la segunda pasada.
    if any(
        str(datos.get(k, "")).lstrip("-").startswith("inf")
        for k in ("input_i", "input_tp", "input_lra", "input_thresh")
    ):
        return None
    return datos


def render(
    edl: EDL,
    out: Path | str,
    settings: Settings | None = None,
    *,
    preview: bool = False,
    use_gpu: bool = True,
    two_pass_audio: bool = True,
    fonts_dir: Path | None = None,
    work_dir: Path | None = None,
    progress: ProgressFn | None = None,
) -> RenderResult:
    """Renderiza el EDL a un fichero de video."""
    settings = settings or Settings.load()
    settings.ensure_dirs()
    caps = capabilities(settings)
    ffmpeg = ffmpeg_bin(settings)

    source = Path(edl.source)
    if not source.is_file():
        raise RenderError(
            f"No encuentro el video original: {source}",
            hint="El EDL guarda la ruta del fichero; si lo has movido, vuelve a planificar.",
        )

    out = Path(out).expanduser()
    out.parent.mkdir(parents=True, exist_ok=True)
    work = Path(work_dir) if work_dir else out.parent
    work.mkdir(parents=True, exist_ok=True)

    inicio = time.time()

    # En previsualizacion bajamos la resolucion para iterar rapido; la relacion
    # de aspecto se mantiene para que el encuadre sea el mismo que el final.
    edl_render = edl
    if preview and edl.render.height > PREVIEW_HEIGHT:
        escala = PREVIEW_HEIGHT / edl.render.height
        ancho = int(edl.render.width * escala) // 2 * 2
        edl_render = edl.model_copy(deep=True)
        edl_render.render.width = ancho
        edl_render.render.height = PREVIEW_HEIGHT

    # -- subtitulos ---------------------------------------------------------
    ass_path: str | None = None
    captions = [e for e in edl_render.effects if e.kind is EffectKind.CAPTION]
    if captions:
        tema = captions[0].style
        destino = work / f"{out.stem}.ass"
        write_ass(
            captions,
            destino,
            edl_render.render.width,
            edl_render.render.height,
            theme_name=tema,
        )
        ass_path = str(destino.resolve())

    fonts = str(fonts_dir.resolve()) if fonts_dir and fonts_dir.is_dir() else None
    target_lufs = edl_render.render.target_lufs

    from ..tools import probe

    has_audio = probe(source, settings).has_audio

    # -- validacion en seco -------------------------------------------------
    if progress:
        progress(0.0, "validando el grafo de filtros")
    graph_seco = build_graph(
        edl_render, has_audio=has_audio, ass_path=ass_path, fonts_dir=fonts,
        target_lufs=target_lufs if not two_pass_audio else None,
    )
    _dry_run(ffmpeg, source, graph_seco, settings)

    # -- medida de sonoridad ------------------------------------------------
    medidas = None
    if has_audio and two_pass_audio and not preview:
        if progress:
            progress(0.0, "midiendo la sonoridad del montaje")
        medidas = _measure_loudness(ffmpeg, source, edl_render, settings, target_lufs)

    # -- render final -------------------------------------------------------
    graph = build_graph(
        edl_render,
        has_audio=has_audio,
        ass_path=ass_path,
        fonts_dir=fonts,
        target_lufs=target_lufs,
        loudnorm_measured=medidas,
    )
    codec_args, nombre_encoder = _video_codec_args(caps, edl_render, preview=preview, use_gpu=use_gpu)

    cmd = [
        str(ffmpeg), "-hide_banner", "-nostdin", "-y",
        "-progress", "pipe:1", "-nostats", "-loglevel", "error",
        "-i", str(source),
        "-filter_complex", graph.filter_complex,
        "-map", graph.video_label,
    ]
    if graph.audio_label:
        cmd += ["-map", graph.audio_label, "-c:a", "aac", "-b:a", "192k"]
    else:
        cmd += ["-an"]
    cmd += codec_args
    cmd += ["-pix_fmt", "yuv420p", "-movflags", "+faststart"]
    if settings.threads:
        cmd += ["-threads", str(settings.threads)]
    cmd += [str(out)]

    _run_with_progress(cmd, edl_render.duration, progress, "renderizando")

    if not out.is_file() or out.stat().st_size < 1024:
        raise RenderError(f"El render termino pero {out.name} esta vacio.")

    return RenderResult(
        path=out,
        duration=edl_render.duration,
        seconds_taken=time.time() - inicio,
        encoder=nombre_encoder,
        applied=graph.applied,
        measured_lufs=float(medidas["input_i"]) if medidas else None,
        preview=preview,
    )
