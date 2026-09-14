"""Puente con el mundo exterior: ffmpeg, ffprobe y deteccion de GPU.

Todo el proyecto pasa por aqui para ejecutar binarios. Dos objetivos:

1. **Portabilidad**: encontrar ffmpeg/ffprobe en varias fuentes en vez de exigir
   una instalacion concreta del sistema.
2. **Degradacion elegante**: si falta ffprobe sabemos sacar los metadatos del
   propio ffmpeg; si no hay GPU se cae a CPU con un aviso, nunca con un crash.
"""

from __future__ import annotations

import json
import re
import shutil
import subprocess
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

from .config import Device, Settings
from .errors import ProbeError, ToolchainError
from .media import AudioStream, MediaInfo, VideoStream

#: Recortamos el stderr de ffmpeg al reportar errores: los logs completos son
#: enormes y lo util casi siempre esta al final.
_STDERR_TAIL_CHARS = 2400


# --------------------------------------------------------------------------
# Localizacion de binarios
# --------------------------------------------------------------------------


def _imageio_ffmpeg() -> Path | None:
    try:
        import imageio_ffmpeg
    except ImportError:
        return None
    try:
        return Path(imageio_ffmpeg.get_ffmpeg_exe())
    except Exception:
        return None


def _resolve(name: str, explicit: Path | None, settings: Settings) -> Path:
    """Busca un binario en orden: explicito -> cache de forge -> PATH -> wheels."""
    if explicit:
        p = Path(explicit).expanduser()
        if p.is_file():
            return p
        raise ToolchainError(
            f"La ruta indicada para {name} no existe: {p}",
            hint=f"Revisa FORGE_{name.upper()} o quita la variable para autodetectar.",
        )

    cached = settings.bin_dir / name
    if cached.is_file():
        return cached

    found = shutil.which(name)
    if found:
        return Path(found)

    if name == "ffmpeg":
        if wheel := _imageio_ffmpeg():
            return wheel

    raise ToolchainError(
        f"No encuentro {name}.",
        hint=(
            "Instalalo con el gestor de tu sistema (CachyOS/Arch: `sudo pacman -S ffmpeg`; "
            "Debian/Ubuntu: `sudo apt install ffmpeg`; macOS: `brew install ffmpeg`), "
            f"o indica la ruta con FORGE_{name.upper()}=/ruta/a/{name}."
        ),
    )


def ffmpeg_bin(settings: Settings) -> Path:
    return _resolve("ffmpeg", settings.ffmpeg_path, settings)


def ffprobe_bin(settings: Settings) -> Path | None:
    """ffprobe es opcional: sin el sondeamos con ffmpeg, aunque con menos detalle."""
    try:
        return _resolve("ffprobe", settings.ffprobe_path, settings)
    except ToolchainError:
        return None


# --------------------------------------------------------------------------
# Ejecucion
# --------------------------------------------------------------------------


def run(
    cmd: list[str | Path],
    *,
    timeout: float | None = None,
    check: bool = True,
    capture: bool = True,
) -> subprocess.CompletedProcess:
    """Ejecuta un comando y convierte el fallo en un error legible."""
    argv = [str(c) for c in cmd]
    try:
        proc = subprocess.run(
            argv,
            capture_output=capture,
            text=True,
            timeout=timeout,
        )
    except FileNotFoundError as exc:
        raise ToolchainError(f"No se pudo ejecutar {argv[0]}: {exc}") from exc
    except subprocess.TimeoutExpired as exc:
        raise ToolchainError(
            f"{argv[0]} excedio el tiempo limite ({timeout}s).",
            hint="Sube el limite o usa un perfil de calidad menor.",
        ) from exc

    if check and proc.returncode != 0:
        tail = (proc.stderr or "")[-_STDERR_TAIL_CHARS:]
        raise ToolchainError(
            f"{argv[0]} fallo con codigo {proc.returncode}.",
            hint=f"Ultimas lineas:\n{tail}" if tail else None,
        )
    return proc


# --------------------------------------------------------------------------
# Capacidades de ffmpeg y del equipo
# --------------------------------------------------------------------------


@dataclass
class Capabilities:
    """Lo que esta build de ffmpeg y esta maquina pueden hacer de verdad."""

    ffmpeg: Path
    ffprobe: Path | None
    version: str
    encoders: set[str] = field(default_factory=set)
    filters: set[str] = field(default_factory=set)
    has_cuda: bool = False
    gpu_name: str | None = None

    def has_encoder(self, name: str) -> bool:
        return name in self.encoders

    def has_filter(self, name: str) -> bool:
        return name in self.filters

    @property
    def can_nvenc(self) -> bool:
        return self.has_cuda and self.has_encoder("h264_nvenc")

    #: Filtros sin los que el renderer no puede hacer su trabajo.
    REQUIRED_FILTERS = ("zoompan", "overlay", "ass", "loudnorm", "sidechaincompress")

    def missing_required(self) -> list[str]:
        return [f for f in self.REQUIRED_FILTERS if not self.has_filter(f)]


#: Los flags de la primera columna en `-encoders`/`-filters` (p.ej. "V....D",
#: "TSC", "..."). Sirve para distinguir una fila de datos de la leyenda.
_FLAGS_RE = re.compile(r"^[A-Z.|]{3,6}$")


def _parse_listing(output: str) -> set[str]:
    """Extrae nombres de `ffmpeg -encoders` / `-filters`.

    Los dos comandos imprimen formatos distintos: `-encoders` separa la leyenda
    con una linea de guiones, mientras que `-filters` no separa nada. En lugar
    de buscar el separador, reconocemos las filas de datos por su columna de
    flags y descartamos las lineas de leyenda, que llevan " = ".
    """
    names: set[str] = set()
    for line in output.splitlines():
        if " = " in line or not line.startswith(" "):
            continue
        parts = line.split()
        if len(parts) >= 2 and _FLAGS_RE.match(parts[0]):
            names.add(parts[1])
    return names


def detect_gpu() -> tuple[bool, str | None]:
    """Detecta GPU NVIDIA sin depender de PyTorch ni de bindings CUDA."""
    smi = shutil.which("nvidia-smi")
    if not smi:
        return False, None
    try:
        proc = subprocess.run(
            [smi, "--query-gpu=name", "--format=csv,noheader"],
            capture_output=True,
            text=True,
            timeout=15,
        )
    except Exception:
        return False, None
    if proc.returncode != 0:
        return False, None
    name = (proc.stdout or "").strip().splitlines()
    return (True, name[0].strip()) if name else (False, None)


@lru_cache(maxsize=4)
def _capabilities_cached(ffmpeg: str, ffprobe: str | None) -> Capabilities:
    ver = run([ffmpeg, "-hide_banner", "-version"], timeout=30).stdout or ""
    version = ver.splitlines()[0] if ver else "desconocida"
    encoders = _parse_listing(
        run([ffmpeg, "-hide_banner", "-encoders"], timeout=30).stdout or ""
    )
    filters = _parse_listing(
        run([ffmpeg, "-hide_banner", "-filters"], timeout=30).stdout or ""
    )
    has_cuda, gpu_name = detect_gpu()
    return Capabilities(
        ffmpeg=Path(ffmpeg),
        ffprobe=Path(ffprobe) if ffprobe else None,
        version=version,
        encoders=encoders,
        filters=filters,
        has_cuda=has_cuda,
        gpu_name=gpu_name,
    )


def capabilities(settings: Settings) -> Capabilities:
    fm = ffmpeg_bin(settings)
    fp = ffprobe_bin(settings)
    return _capabilities_cached(str(fm), str(fp) if fp else None)


def effective_device(settings: Settings) -> Device:
    """Resuelve `auto` mirando la maquina; respeta una eleccion explicita."""
    if settings.device is not Device.AUTO:
        return settings.device
    has_cuda, _ = detect_gpu()
    return Device.CUDA if has_cuda else Device.CPU


# --------------------------------------------------------------------------
# Sondeo de medios
# --------------------------------------------------------------------------


def _fps_from(stream: dict) -> float:
    """Saca los fps de un stream, prefiriendo la tasa real a la media."""
    for key in ("r_frame_rate", "avg_frame_rate"):
        raw = stream.get(key)
        if not raw or raw in ("0/0", "0/1"):
            continue
        try:
            num, _, den = raw.partition("/")
            n, d = float(num), float(den or 1)
            if d and n:
                return n / d
        except ValueError:
            continue
    return 0.0


def _rotation_from(stream: dict) -> int:
    """La rotacion vive en dos sitios distintos segun el contenedor."""
    tags = stream.get("tags") or {}
    if "rotate" in tags:
        try:
            return int(float(tags["rotate"])) % 360
        except (TypeError, ValueError):
            pass
    for side in stream.get("side_data_list") or []:
        if "rotation" in side:
            try:
                # ffprobe da la rotacion del display matrix en negativo
                return int(-float(side["rotation"])) % 360
            except (TypeError, ValueError):
                pass
    return 0


def _int_or_none(value) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _float_or_none(value) -> float | None:
    try:
        f = float(value)
    except (TypeError, ValueError):
        return None
    return f if f == f else None  # descarta NaN


def _probe_with_ffprobe(path: Path, ffprobe: Path) -> MediaInfo:
    proc = run(
        [
            ffprobe,
            "-v", "error",
            "-print_format", "json",
            "-show_format",
            "-show_streams",
            path,
        ],
        timeout=120,
    )
    try:
        data = json.loads(proc.stdout or "{}")
    except json.JSONDecodeError as exc:
        raise ProbeError(f"ffprobe devolvio algo que no es JSON para {path}") from exc

    fmt = data.get("format") or {}
    streams = data.get("streams") or []

    video = next((s for s in streams if s.get("codec_type") == "video"), None)
    audio = next((s for s in streams if s.get("codec_type") == "audio"), None)

    vs = None
    if video:
        vs = VideoStream(
            index=_int_or_none(video.get("index")) or 0,
            codec=video.get("codec_name") or "desconocido",
            width=_int_or_none(video.get("width")) or 0,
            height=_int_or_none(video.get("height")) or 0,
            fps=_fps_from(video),
            pix_fmt=video.get("pix_fmt"),
            bit_rate=_int_or_none(video.get("bit_rate")),
            nb_frames=_int_or_none(video.get("nb_frames")),
            rotation=_rotation_from(video),
        )

    aus = None
    if audio:
        aus = AudioStream(
            index=_int_or_none(audio.get("index")) or 0,
            codec=audio.get("codec_name") or "desconocido",
            sample_rate=_int_or_none(audio.get("sample_rate")),
            channels=_int_or_none(audio.get("channels")),
            channel_layout=audio.get("channel_layout"),
            bit_rate=_int_or_none(audio.get("bit_rate")),
        )

    duration = _float_or_none(fmt.get("duration"))
    if duration is None and video:
        duration = _float_or_none(video.get("duration"))
    if duration is None and vs and vs.nb_frames and vs.fps:
        duration = vs.nb_frames / vs.fps

    if duration is None:
        raise ProbeError(
            f"No pude determinar la duracion de {path}.",
            hint="El fichero puede estar corrupto o incompleto.",
        )

    return MediaInfo(
        path=path,
        size_bytes=path.stat().st_size,
        duration=duration,
        format_name=fmt.get("format_name"),
        bit_rate=_int_or_none(fmt.get("bit_rate")),
        video=vs,
        audio=aus,
    )


_DUR_RE = re.compile(r"Duration:\s*(\d+):(\d+):(\d+\.?\d*)")
_VIDEO_RE = re.compile(
    r"Stream #\d+:(\d+).*?: Video:\s*([\w.]+).*?(\d{2,5})x(\d{2,5})"
)
_FPS_RE = re.compile(r"(\d+\.?\d*)\s+fps")
_AUDIO_RE = re.compile(
    r"Stream #\d+:(\d+).*?: Audio:\s*([\w.]+).*?(\d+)\s*Hz.*?,\s*([\w.()]+)"
)


def _probe_with_ffmpeg(path: Path, ffmpeg: Path) -> MediaInfo:
    """Plan B cuando no hay ffprobe: parsear la cabecera que ffmpeg escribe.

    Da menos campos que ffprobe, pero es suficiente para no bloquear al usuario
    por no tener un binario extra instalado.
    """
    proc = run([ffmpeg, "-hide_banner", "-i", path], check=False, timeout=120)
    text = proc.stderr or ""

    m = _DUR_RE.search(text)
    if not m:
        raise ProbeError(
            f"No pude leer {path} ni con ffprobe ni con ffmpeg.",
            hint="Comprueba que el fichero existe y es un video valido.",
        )
    duration = int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3))

    vs = None
    if vm := _VIDEO_RE.search(text):
        fps_m = _FPS_RE.search(text[vm.start(): vm.start() + 400])
        vs = VideoStream(
            index=int(vm.group(1)),
            codec=vm.group(2),
            width=int(vm.group(3)),
            height=int(vm.group(4)),
            fps=float(fps_m.group(1)) if fps_m else 0.0,
        )

    aus = None
    if am := _AUDIO_RE.search(text):
        layout = am.group(4)
        channels = {"mono": 1, "stereo": 2}.get(layout)
        aus = AudioStream(
            index=int(am.group(1)),
            codec=am.group(2),
            sample_rate=int(am.group(3)),
            channels=channels,
            channel_layout=layout,
        )

    return MediaInfo(
        path=path,
        size_bytes=path.stat().st_size,
        duration=duration,
        video=vs,
        audio=aus,
    )


def probe(path: Path | str, settings: Settings | None = None) -> MediaInfo:
    """Lee los metadatos del fichero de entrada."""
    settings = settings or Settings.load()
    p = Path(path).expanduser()
    if not p.is_file():
        raise ProbeError(f"El fichero no existe: {p}")
    if p.stat().st_size == 0:
        raise ProbeError(f"El fichero esta vacio: {p}")

    fp = ffprobe_bin(settings)
    if fp:
        return _probe_with_ffprobe(p, fp)
    return _probe_with_ffmpeg(p, ffmpeg_bin(settings))
