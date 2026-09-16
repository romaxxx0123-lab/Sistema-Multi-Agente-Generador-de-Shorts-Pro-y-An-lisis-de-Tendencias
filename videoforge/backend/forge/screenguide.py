"""Una guia de pantalla sintetica, con la verdad conocida.

Todo lo que se mide en este proyecto necesita material sobre el que medir, y
hasta aqui habia dos bancos de pruebas y a los dos les faltaba la mitad:

- `make_fixture` genera un **video** de escenas de color con tonos: sirve para
  probar el render y el recorte, pero no tiene ni interfaz ni voz, asi que no
  se puede comprobar nada de lo que el analisis entiende.
- `synthetic_guide_analysis` fabrica un **Analysis** con forma de guia: sirve
  para probar el planner, pero no hay video detras, asi que tampoco se puede
  comprobar si el analisis **acierta**.

Aqui estan las dos cosas a la vez y con la **verdad apuntada**: un video de
pantalla de verdad, con su interfaz, sus sucesos en instantes conocidos y una
transcripcion que los nombra. Con eso se puede preguntar lo unico que importa:
*¿el analisis encuentra lo que hay?* y *¿el montaje hace lo que toca?*

No pretende parecerse a una grabacion real en textura --- es texto sobre gris ---
sino tener **la misma estructura**: secciones con tema propio, cosas que
aparecen y desaparecen, una pausa larga anunciada, un aviso, y elementos de
interfaz que se nombran al hablar.
"""

from __future__ import annotations

import subprocess
from dataclasses import dataclass, field
from pathlib import Path

from .config import Settings
from .tools import ffmpeg_bin

WIDTH, HEIGHT = 1280, 720


@dataclass(frozen=True)
class UiEvent:
    """Algo que aparece en la pantalla, y donde. La verdad a comprobar."""

    at: float
    name: str
    #: caja en fracciones de pantalla
    x: float
    y: float
    w: float
    h: float

    @property
    def cx(self) -> float:
        return self.x + self.w / 2

    @property
    def cy(self) -> float:
        return self.y + self.h / 2


@dataclass(frozen=True)
class Said:
    """Una frase, con el instante en que empieza."""

    at: float
    text: str


@dataclass
class ScreenGuide:
    """El video, lo que pasa en el y lo que se dice."""

    path: Path
    events: tuple[UiEvent, ...]
    said: tuple[Said, ...]
    duration: float
    chapters: tuple[tuple[float, str], ...] = ()
    #: (inicio, fin) de la espera que se anuncia
    wait: tuple[float, float] | None = None


# -- el guion ---------------------------------------------------------------

#: Lo que se dice, en orden. Tiene lo que tiene una guia de verdad: muletillas,
#: un aviso, una espera anunciada y tres temas bien distintos.
GUION: tuple[Said, ...] = (
    Said(1.0, "vamos a configurar el router wifi de esta casa"),
    Said(6.0, "abrimos el panel del router en el navegador"),
    Said(11.0, "eh aqui hay que escribir la contrasena del wifi"),
    Said(17.0, "ojo con esto si la contrasena es corta no protege nada"),
    Said(24.0, "pulsa en guardar cambios cuando la tengas"),
    Said(30.0, "ahora vamos con la impresora de la oficina"),
    Said(36.0, "la impresora tiene el papel atascado dentro"),
    Said(42.0, "sacamos el papel atascado de la bandeja"),
    Said(48.0, "esto tarda un buen rato asi que espera"),
    Said(96.0, "ya esta la impresora lista otra vez"),
    Said(102.0, "por ultimo el firewall del sistema operativo"),
    Said(108.0, "el firewall bloquea las conexiones raras de fuera"),
    Said(114.0, "como vimos antes el router necesita su contrasena"),
    Said(120.0, "y con eso terminamos la guia"),
)

#: Lo que pasa en la pantalla. Coincide con lo que se dice, como en una guia.
EVENTOS: tuple[UiEvent, ...] = (
    UiEvent(6.5, "se abre el panel del router", 0.03, 0.17, 0.30, 0.22),
    UiEvent(12.0, "aparece el campo de contrasena", 0.33, 0.35, 0.30, 0.13),
    UiEvent(25.0, "se resalta guardar cambios", 0.55, 0.53, 0.22, 0.10),
    UiEvent(31.0, "se abre el panel de la impresora", 0.03, 0.17, 0.34, 0.22),
    UiEvent(103.0, "se abre el panel del firewall", 0.66, 0.17, 0.30, 0.30),
)

#: La espera anunciada en el segundo 48: casi un minuto sin hablar.
ESPERA = (50.0, 94.0)

#: Los textos de la interfaz, que el OCR tiene que poder leer.
_DIALOGOS = (
    (0.0, 130.0, "UI", 40, 30, "Panel de administracion"),
    (6.5, 130.0, "Caja", 40, 130, "Router\\NEstado conectado\\NWifi activo"),
    (12.0, 130.0, "Caja", 430, 260, "Contrasena del wifi\\N**********"),
    (25.0, 130.0, "Boton", 700, 390, "Guardar cambios"),
    (31.0, 130.0, "Caja", 40, 130, "Impresora HP\\NBandeja de papel\\NAtascada"),
    (103.0, 130.0, "Caja", 850, 130, "Firewall\\NReglas activas\\NPuerto 443\\NPuerto 80"),
)

_ESTILOS = """[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: UI,DejaVu Sans,30,&H00202020,&H00202020,&H00FFFFFF,&H00FFFFFF,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1
Style: Caja,DejaVu Sans,26,&H00FFFFFF,&H00FFFFFF,&H00806040,&H00806040,-1,0,0,0,100,100,0,0,3,10,0,7,0,0,0,1
Style: Boton,DejaVu Sans,26,&H00FFFFFF,&H00FFFFFF,&H00C04010,&H00C04010,-1,0,0,0,100,100,0,0,3,8,0,7,0,0,0,1
"""


def _timestamp(t: float) -> str:
    h, resto = divmod(max(0.0, t), 3600)
    m, s = divmod(resto, 60)
    return f"{int(h)}:{int(m):02d}:{s:05.2f}"


def _ass(duration: float) -> str:
    lineas = []
    for inicio, fin, estilo, x, y, texto in _DIALOGOS:
        lineas.append(
            f"Dialogue: 0,{_timestamp(inicio)},{_timestamp(min(fin, duration))},"
            f"{estilo},,0,0,0,,{{\\pos({x},{y})}}{texto}"
        )
    return (
        "[Script Info]\nScriptType: v4.00+\n"
        f"PlayResX: {WIDTH}\nPlayResY: {HEIGHT}\nWrapStyle: 2\n\n"
        + _ESTILOS
        + "\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, "
        "MarginV, Effect, Text\n"
        + "\n".join(lineas)
        + "\n"
    )


def _audio_filter(duration: float) -> str:
    """Voz sintetica: hay sonido donde se habla y silencio donde no.

    No son palabras -- no hay sintetizador aqui -- pero el analisis de audio
    mide **nivel**, y eso es lo que tiene que encontrar: donde hay voz y donde
    no. La transcripcion va aparte, como dato.
    """
    tramos = []
    for dicho in GUION:
        fin = dicho.at + max(1.4, len(dicho.text.split()) * 0.42)
        tramos.append(f"between(t,{dicho.at:.2f},{min(fin, duration):.2f})")
    return (
        f"sine=frequency=210:duration={duration:.2f},"
        f"volume='if({'+'.join(tramos)},0.7,0.02)':eval=frame"
    )


def make_screen_guide(
    out: Path | str, settings: Settings | None = None, *, overwrite: bool = True
) -> ScreenGuide:
    """Genera la guia y devuelve el video junto con la verdad conocida."""
    settings = settings or Settings.load()
    out = Path(out).expanduser()
    out.parent.mkdir(parents=True, exist_ok=True)
    duracion = 130.0

    if not out.exists() or overwrite:
        ass = out.with_suffix(".ass")
        ass.write_text(_ass(duracion), encoding="utf-8")
        subprocess.run(
            [
                str(ffmpeg_bin(settings)), "-y", "-hide_banner", "-loglevel", "error",
                "-f", "lavfi", "-i",
                f"color=c=0xf4f4f4:s={WIDTH}x{HEIGHT}:r=25:d={duracion}",
                "-f", "lavfi", "-i", _audio_filter(duracion),
                "-vf", f"ass={ass}",
                "-c:v", "libx264", "-crf", "20", "-pix_fmt", "yuv420p",
                "-c:a", "aac", "-shortest", str(out),
            ],
            check=True, capture_output=True, timeout=300,
        )

    return ScreenGuide(
        path=out,
        events=EVENTOS,
        said=GUION,
        duration=duracion,
        chapters=((0.0, "router"), (30.0, "impresora"), (102.0, "firewall")),
        wait=ESPERA,
    )


def transcript_of(guide: ScreenGuide):
    """La transcripcion de la guia, con tiempos por palabra."""
    from .analysis.types import Transcript, TranscriptSegment, Word

    segmentos = []
    for dicho in guide.said:
        t = dicho.at
        palabras = []
        for palabra in dicho.text.split():
            palabras.append(
                Word(start=round(t, 2), end=round(t + 0.32, 2), text=palabra)
            )
            t += 0.42
        segmentos.append(
            TranscriptSegment(
                start=dicho.at, end=round(t, 2), text=dicho.text, words=palabras
            )
        )
    return Transcript(language="es", segments=segmentos)
