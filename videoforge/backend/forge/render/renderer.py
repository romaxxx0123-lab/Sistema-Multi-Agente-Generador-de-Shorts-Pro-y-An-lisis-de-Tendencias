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

from ..assets.sfx import GENERATORS, ensure_sfx
from ..assets.types import AssetBundle
from ..config import Settings
from ..errors import ForgeError, RenderError
from ..plan.edl import EDL, EffectKind
from ..tools import Capabilities, capabilities, ffmpeg_bin, probe
from .ass import write_ass
from .graph import LIMITER_MARGIN_DB, TRUE_PEAK_CEILING_DB, build_graph

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


def _inputs(source: Path, graph) -> list[str]:
    """Argumentos de entrada: el video original primero, luego los extras.

    El orden importa: los indices que el grafo escribio ([1:v], [2:a]...) se
    corresponden con esta lista, asi que hay que respetarla tal cual.
    """
    cmd = ["-i", str(source)]
    for bloque in graph.input_args:
        cmd.extend(bloque)
    return cmd


def _dry_run(ffmpeg: Path, source: Path, graph, settings: Settings) -> None:
    """Comprueba el grafo con un segundo de video antes del render completo."""
    cmd = [
        str(ffmpeg), "-hide_banner", "-nostdin", "-y",
        *_inputs(source, graph),
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
    ffmpeg: Path,
    source: Path,
    edl: EDL,
    settings: Settings,
    target_lufs: float,
    sfx_paths: dict[str, str] | None = None,
    voice_rules=None,
    master_gain_db: float | None = None,
) -> dict | None:
    """Mide la sonoridad del audio ya montado.

    Incluye los efectos de sonido y el tratamiento de voz: los dos cambian el
    nivel, y medir sin ellos dejaria el master fuera del objetivo. Con
    `master_gain_db` mide el resultado **despues** del master, que es lo que
    de verdad va a oir el espectador.
    """
    graph = build_graph(
        edl, has_audio=True, target_lufs=None, audio_only=True, sfx_paths=sfx_paths,
        voice_rules=voice_rules, master_gain_db=master_gain_db,
    )
    if not graph.audio_label:
        return None

    cmd = [
        str(ffmpeg), "-hide_banner", "-nostdin",
        *_inputs(source, graph),
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


#: Cuanta sonoridad se le deja perder al limitador. Por encima de esto ya no
#: esta recortando picos sueltos, esta apretando la voz entera.
MASTER_MAX_LOSS_DB = 1.0
#: Cuantas pasadas de prueba se permiten para encontrar la ganancia. Cada una
#: es solo de audio, asi que son baratas al lado del render.
MASTER_PROBES = 3


def _plan_master(
    medir,
    base_i: float,
    base_tp: float,
    target_lufs: float,
    progress: ProgressFn | None = None,
) -> tuple[float, float | None]:
    """Busca la ganancia del master midiendo, no estimando.

    Subir hasta el objetivo de sonoridad casi siempre deja el pico por encima
    del techo, y el limitador tiene que recortar la diferencia. Cuanto cuesta
    ese recorte **depende del material**: en una voz con picos sueltos no
    cuesta nada, y en una ya densa cada dB de recorte se lleva casi un dB de
    sonoridad, con lo que subir mas solo distorsiona.

    Medido sobre la guia de prueba: hasta +1,5 dB el limitador se come 0,02 dB;
    a +4,5 dB ya se come 2,0. Por eso no vale una regla fija, y por eso se
    prueba: se busca la ganancia mas alta cuya perdida no pase de
    `MASTER_MAX_LOSS_DB`. Si el material no da para llegar al objetivo, el
    master se queda por debajo, que es lo correcto.

    Devuelve (ganancia, sonoridad medida con esa ganancia o None).
    """
    ideal = target_lufs - base_i
    techo = TRUE_PEAK_CEILING_DB - LIMITER_MARGIN_DB
    # Si cabe entera bajo el techo no hay nada que decidir.
    if ideal <= 0.0 or base_tp + ideal <= techo:
        return ideal, None

    bajo = max(0.0, techo - base_tp)   # justo donde el limitador empieza a tocar
    alto = ideal
    if bajo >= alto:
        return alto, None

    mejor, mejor_i = bajo, None
    for vuelta in range(MASTER_PROBES):
        medio = (bajo + alto) / 2.0
        if progress:
            # En una guia de veinte minutos cada prueba tarda medio minuto. Sin
            # decir por donde va, parece que se ha colgado.
            progress(0.0, f"ajustando el master ({vuelta + 1}/{MASTER_PROBES})")
        medida = medir(medio)
        if medida is None:
            break
        conseguido = float(medida["input_i"])
        if (base_i + medio) - conseguido <= MASTER_MAX_LOSS_DB:
            mejor, mejor_i, bajo = medio, conseguido, medio
        else:
            alto = medio
    return mejor, mejor_i


#: Cuanto puede desviarse la duracion del fichero respecto a lo planificado.
#: Un render cortado a mitad se queda muy por debajo; medio segundo de margen
#: cubre el redondeo al ultimo fotograma y el cierre del contenedor.
DURATION_TOLERANCE = 0.5


def _check_output(path: Path, expected: float, settings: Settings) -> None:
    """Comprueba que lo que salio es un video entero y reproducible.

    Mirar solo el tamano no vale: un render cortado a mitad ocupa megas y
    parece correcto. Lo que lo delata es que no se puede leer (le falta el
    indice, que se escribe al final) o que dura menos de lo planificado.
    """
    if not path.is_file() or path.stat().st_size < 1024:
        raise RenderError(f"El render termino pero {path.name} esta vacio.")

    try:
        info = probe(path, settings)
    except ForgeError as exc:
        raise RenderError(
            "El render termino pero el fichero no se puede leer: se corto a medias.",
            hint="Vuelve a lanzarlo; no se ha tocado el render anterior si lo habia.",
        ) from exc

    if not info.has_video:
        raise RenderError("El render termino pero el fichero no tiene video.")

    if expected > 0 and info.duration < expected - DURATION_TOLERANCE:
        raise RenderError(
            f"El render se quedo en {info.duration:.1f}s de los "
            f"{expected:.1f}s planificados.",
            hint="Se corto antes de acabar. Vuelve a lanzarlo.",
        )


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
    assets: AssetBundle | None = None,
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
    # Los rotulos de capitulo van en el mismo .ass que los subtitulos: mismo
    # motor de texto, misma fuente, mismo contorno. Antes se planificaban y no
    # se dibujaba ninguno, asi que el EDL prometia capitulos en pantalla que no
    # existian en el video (y el medidor de saturacion los contaba como texto).
    ass_path: str | None = None
    captions = [e for e in edl_render.effects if e.kind is EffectKind.CAPTION]
    cards = [e for e in edl_render.effects if e.kind is EffectKind.TEXT_CARD]
    if captions or cards:
        tema = captions[0].style if captions else "clean"
        destino = work / f"{out.stem}.ass"
        write_ass(
            captions,
            destino,
            edl_render.render.width,
            edl_render.render.height,
            theme_name=tema,
            cards=cards,
        )
        ass_path = str(destino.resolve())

    fonts = str(fonts_dir.resolve()) if fonts_dir and fonts_dir.is_dir() else None
    target_lufs = edl_render.render.target_lufs

    # El tratamiento de voz lo define el estilo. Si el estilo ya no existe (un
    # EDL guardado hace tiempo), se sigue sin el en vez de fallar.
    voice_rules = None
    callout_rules = None
    try:
        from ..plan.styles import load_style

        estilo = load_style(edl_render.style)
        voice_rules = estilo.voice
        callout_rules = estilo.callouts
    except ForgeError:
        pass

    # -- efectos de sonido --------------------------------------------------
    # Se sintetizan al vuelo la primera vez y quedan cacheados. No se
    # distribuyen ficheros de audio: asi no hay problema de licencias nunca.
    sfx_paths: dict[str, str] = {}
    for efecto in edl_render.effects:
        nombre = getattr(efecto, "asset_id", "")
        if efecto.kind is EffectKind.SFX and nombre in GENERATORS and nombre not in sfx_paths:
            sfx_paths[nombre] = str(ensure_sfx(settings.cache_dir, nombre))

    has_audio = probe(source, settings).has_audio

    # -- validacion en seco -------------------------------------------------
    if progress:
        progress(0.0, "validando el grafo de filtros")
    graph_seco = build_graph(
        edl_render, has_audio=has_audio, ass_path=ass_path, fonts_dir=fonts,
        target_lufs=target_lufs if not two_pass_audio else None,
        assets=assets, sfx_paths=sfx_paths, voice_rules=voice_rules,
        callout_rules=callout_rules,
    )
    _dry_run(ffmpeg, source, graph_seco, settings)

    # -- master de audio ----------------------------------------------------
    # Dos pasadas de medicion, las dos solo de audio y por tanto baratas:
    #   1. cuanto suena el montaje ya tratado -> de donde se parte
    #   2. unas pocas pruebas con ganancia     -> hasta donde se puede subir
    #
    # La ultima prueba es ademas la que se informa: el limitador se come parte
    # de la ganancia, asi que sin medirla el informe diria un numero que no es
    # el del fichero.
    medidas = None
    master_gain = None
    sonoridad_final = None
    if has_audio and two_pass_audio and not preview:
        if progress:
            progress(0.0, "midiendo la sonoridad del montaje")
        medidas = _measure_loudness(
            ffmpeg, source, edl_render, settings, target_lufs, sfx_paths, voice_rules
        )
        if medidas:
            def _con_ganancia(g: float):
                return _measure_loudness(
                    ffmpeg, source, edl_render, settings, target_lufs, sfx_paths,
                    voice_rules, master_gain_db=g,
                )

            master_gain, sonoridad_final = _plan_master(
                _con_ganancia, float(medidas["input_i"]),
                float(medidas["input_tp"]), target_lufs, progress,
            )
            if sonoridad_final is None:
                comprobacion = _con_ganancia(master_gain)
                if comprobacion:
                    sonoridad_final = float(comprobacion["input_i"])
                else:
                    # Si no se puede comprobar no se arriesga un master a ciegas.
                    master_gain = None

    # -- render final -------------------------------------------------------
    graph = build_graph(
        edl_render,
        has_audio=has_audio,
        ass_path=ass_path,
        fonts_dir=fonts,
        target_lufs=target_lufs,
        loudnorm_measured=medidas,
        assets=assets,
        sfx_paths=sfx_paths,
        voice_rules=voice_rules,
        master_gain_db=master_gain,
        callout_rules=callout_rules,
    )
    codec_args, nombre_encoder = _video_codec_args(caps, edl_render, preview=preview, use_gpu=use_gpu)

    cmd = [
        str(ffmpeg), "-hide_banner", "-nostdin", "-y",
        "-progress", "pipe:1", "-nostats", "-loglevel", "error",
        *_inputs(source, graph),
        "-filter_complex", graph.filter_complex,
        "-map", graph.video_label,
    ]
    if graph.audio_label:
        cmd += ["-map", graph.audio_label, "-c:a", "aac", "-b:a", "192k"]
    else:
        cmd += ["-an"]
    cmd += codec_args
    # Sin estas etiquetas, muchos reproductores adivinan el espacio de color y
    # el video se ve lavado o demasiado contrastado segun donde se abra. Son
    # gratis y evitan un problema que parece un fallo de la edicion.
    cmd += [
        "-pix_fmt", "yuv420p",
        "-colorspace", "bt709",
        "-color_primaries", "bt709",
        "-color_trc", "bt709",
        "-movflags", "+faststart",
    ]
    if settings.threads:
        cmd += ["-threads", str(settings.threads)]
    # Se escribe a un fichero aparte y se mueve al sitio al terminar. Un render
    # de veinte minutos que se corta a mitad (un Ctrl-C, un apagon, quedarse sin
    # disco) dejaba en el destino un MP4 a medias, sin indice y sin las ultimas
    # escenas, que **pasaba la comprobacion de tamano** y se daba por bueno. Y
    # si habia un render anterior bueno, lo habia machacado.
    # La extension se conserva al final: ffmpeg deduce el contenedor de ella, y
    # con un ".parcial" al final se queda sin saber que formato escribir.
    parcial = out.with_name(f".{out.stem}.parcial{out.suffix}")
    parcial.unlink(missing_ok=True)
    cmd += [str(parcial)]

    try:
        _run_with_progress(cmd, edl_render.duration, progress, "renderizando")
        _check_output(parcial, edl_render.duration, settings)
    except BaseException:
        # Tambien con Ctrl-C: lo que no se deja es un fichero a medias por ahi.
        parcial.unlink(missing_ok=True)
        raise

    out.unlink(missing_ok=True)
    parcial.replace(out)

    return RenderResult(
        path=out,
        duration=edl_render.duration,
        seconds_taken=time.time() - inicio,
        encoder=nombre_encoder,
        applied=graph.applied,
        measured_lufs=(
            sonoridad_final if sonoridad_final is not None
            else (float(medidas["input_i"]) if medidas else None)
        ),
        preview=preview,
    )
