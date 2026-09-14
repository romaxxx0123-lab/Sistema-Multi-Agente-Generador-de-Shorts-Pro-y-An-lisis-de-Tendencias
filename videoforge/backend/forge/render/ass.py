"""Genera subtitulos ASS con karaoke palabra a palabra.

Se usa ASS y no `drawtext` por tres motivos concretos:

- **Karaoke real**: la etiqueta `\\k` resalta cada palabra en su instante exacto,
  que es justo lo que dan los timestamps por palabra de Whisper.
- **Contorno y sombra de verdad**, que es lo que hace un subtitulo legible sobre
  cualquier fondo. Con `drawtext` habria que apilar capas a mano.
- **Un solo fichero** para todo el video en vez de un filtro por linea, lo que
  mantiene el grafo de ffmpeg manejable aunque haya cientos de subtitulos.

Los colores en ASS van en formato `&HAABBGGRR`: alfa primero y los canales al
reves que en HTML. Es una fuente de errores clasica, asi que se construyen con
`_ass_color()` y nunca a mano.
"""

from __future__ import annotations

import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path

from ..plan.edl import CaptionEffect

#: Familias que buscamos, por orden. La primera que exista en el sistema gana.
FONT_CANDIDATES = (
    "Inter",
    "Montserrat",
    "Roboto",
    "Open Sans",
    "DejaVu Sans",
    "Liberation Sans",
    "FreeSans",
    "Arial",
)

#: Alineacion ASS (teclado numerico): 2 abajo, 5 centro, 8 arriba.
_ALIGNMENT = {"bottom": 2, "center": 5, "top": 8}

#: A partir de esta longitud la linea se parte en dos. Un subtitulo de una sola
#: linea muy larga obliga a barrer la pantalla con la vista; en dos lineas
#: equilibradas se lee de un golpe.
WRAP_CHARS = 30


def _ass_color(r: int, g: int, b: int, alpha: int = 0) -> str:
    """Color en el formato de ASS: alfa + BGR, con 0 = totalmente opaco."""
    return f"&H{alpha:02X}{b:02X}{g:02X}{r:02X}"


@dataclass(frozen=True)
class CaptionTheme:
    """Aspecto de un estilo de subtitulo."""

    #: tamano como fraccion de la altura del video
    size_ratio: float
    #: color de la palabra ya dicha (el resalte del karaoke)
    primary: tuple[int, int, int]
    #: color de la palabra aun no dicha
    secondary: tuple[int, int, int]
    outline_width: float
    shadow: float
    bold: bool
    #: margen inferior/superior como fraccion de la altura
    margin_ratio: float
    #: caja semitransparente detras del texto en vez de solo contorno
    boxed: bool = False


#: Temas referenciados por los presets de estilo.
THEMES: dict[str, CaptionTheme] = {
    "clean": CaptionTheme(
        size_ratio=0.055,
        primary=(255, 255, 255),
        secondary=(190, 190, 190),
        outline_width=3.0,
        shadow=1.5,
        bold=True,
        margin_ratio=0.075,
    ),
    "impact": CaptionTheme(
        size_ratio=0.085,
        primary=(255, 214, 0),
        secondary=(255, 255, 255),
        outline_width=5.0,
        shadow=2.0,
        bold=True,
        margin_ratio=0.12,
    ),
    "bold": CaptionTheme(
        size_ratio=0.068,
        primary=(255, 255, 255),
        secondary=(200, 200, 200),
        outline_width=4.0,
        shadow=2.0,
        bold=True,
        margin_ratio=0.09,
    ),
    "minimal": CaptionTheme(
        size_ratio=0.045,
        primary=(255, 255, 255),
        secondary=(255, 255, 255),
        outline_width=1.5,
        shadow=0.8,
        bold=False,
        margin_ratio=0.06,
        boxed=True,
    ),
}
DEFAULT_THEME = "clean"


def resolve_font() -> str:
    """Elige una familia disponible en el sistema.

    Preguntamos a fontconfig en vez de dar por hecho que existe una fuente
    concreta: si no, libass cae a su ultimo recurso y el subtitulo sale con otra
    cara distinta en cada maquina.
    """
    fc_match = shutil.which("fc-match")
    if not fc_match:
        return "DejaVu Sans"

    for familia in FONT_CANDIDATES:
        try:
            proc = subprocess.run(
                [fc_match, "--format=%{family}", familia],
                capture_output=True, text=True, timeout=10,
            )
        except Exception:
            continue
        encontrada = (proc.stdout or "").strip()
        # fc-match siempre devuelve algo; solo vale si nos dio lo que pedimos.
        if encontrada and familia.lower() in encontrada.lower():
            return familia

    return "DejaVu Sans"


def _timestamp(seconds: float) -> str:
    """Instante en el formato de ASS: H:MM:SS.cc"""
    seconds = max(0.0, seconds)
    centis = int(round(seconds * 100))
    h, resto = divmod(centis, 360000)
    m, resto = divmod(resto, 6000)
    s, cs = divmod(resto, 100)
    return f"{h}:{m:02d}:{s:02d}.{cs:02d}"


def _escape(text: str) -> str:
    """Neutraliza lo que ASS interpretaria como marcado."""
    return (
        text.replace("\\", "\\\\")
        .replace("{", "\\{")
        .replace("}", "\\}")
        .replace("\n", " ")
        .strip()
    )


def split_balanced(words: list[str], max_chars: int = WRAP_CHARS) -> int:
    """Indice por el que partir una linea larga en dos mitades parejas.

    Devuelve 0 si no hace falta partir. Se busca el punto que deja las dos
    lineas mas iguales, no simplemente el que llena la primera: dos lineas de
    18 y 4 caracteres se leen peor que dos de 11.
    """
    texto = " ".join(words)
    if len(texto) <= max_chars or len(words) < 2:
        return 0

    mejor_indice = 0
    mejor_diferencia = None
    for i in range(1, len(words)):
        izquierda = len(" ".join(words[:i]))
        derecha = len(" ".join(words[i:]))
        diferencia = abs(izquierda - derecha)
        if mejor_diferencia is None or diferencia < mejor_diferencia:
            mejor_diferencia = diferencia
            mejor_indice = i
    return mejor_indice


def _karaoke_text(caption: CaptionEffect) -> str:
    """Texto con una etiqueta `\\k` por palabra, en centesimas de segundo."""
    if not caption.words:
        return _escape(caption.text)

    corte = split_balanced([w.text for w in caption.words])

    partes: list[str] = []
    cursor = caption.start
    for indice, w in enumerate(caption.words):
        if corte and indice == corte:
            # Salto de linea duro de ASS.
            partes.append("\\N")
        # El hueco antes de la palabra tambien consume tiempo de karaoke; si no
        # se contase, el resalte se adelantaria mas y mas a lo largo de la linea.
        hueco = max(0.0, w.start - cursor)
        if hueco > 0.01:
            partes.append(f"{{\\k{int(round(hueco * 100))}}}")
        duracion = max(0.01, w.end - w.start)
        partes.append(f"{{\\k{int(round(duracion * 100))}}}{_escape(w.text)} ")
        cursor = w.end

    return "".join(partes).rstrip()


def build_ass(
    captions: list[CaptionEffect],
    width: int,
    height: int,
    *,
    theme_name: str = DEFAULT_THEME,
    font: str | None = None,
    karaoke: bool = True,
) -> str:
    """Devuelve el contenido completo de un fichero .ass."""
    theme = THEMES.get(theme_name, THEMES[DEFAULT_THEME])
    familia = font or resolve_font()

    size = max(12, int(round(height * theme.size_ratio)))
    margen = max(10, int(round(height * theme.margin_ratio)))
    margen_lateral = max(20, int(round(width * 0.06)))

    primary = _ass_color(*theme.primary)
    secondary = _ass_color(*theme.secondary)
    outline = _ass_color(0, 0, 0)
    # Con caja, el fondo es un negro semitransparente; si no, invisible.
    back = _ass_color(0, 0, 0, 0x40 if theme.boxed else 0x80)
    border_style = 3 if theme.boxed else 1

    posicion = captions[0].position if captions else "bottom"
    alineacion = _ALIGNMENT.get(posicion, 2)

    cabecera = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {width}
PlayResY: {height}
WrapStyle: 2
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.709

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,{familia},{size},{primary},{secondary},{outline},{back},{-1 if theme.bold else 0},0,0,0,100,100,0,0,{border_style},{theme.outline_width},{theme.shadow},{alineacion},{margen_lateral},{margen_lateral},{margen},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""

    lineas: list[str] = []
    for c in sorted(captions, key=lambda x: x.start):
        texto = _karaoke_text(c) if karaoke else _escape(c.text)
        if not texto:
            continue
        # Cada linea lleva su propia alineacion: el planner puede mandar un
        # subtitulo arriba cuando lo importante del plano esta abajo.
        alineacion_linea = _ALIGNMENT.get(c.position, alineacion)
        prefijo = f"{{\\an{alineacion_linea}}}" if alineacion_linea != alineacion else ""
        lineas.append(
            f"Dialogue: 0,{_timestamp(c.start)},{_timestamp(c.end)},Default,,0,0,0,,{prefijo}{texto}"
        )

    return cabecera + "\n".join(lineas) + "\n"


def write_ass(
    captions: list[CaptionEffect],
    path: Path,
    width: int,
    height: int,
    **kwargs,
) -> Path:
    """Escribe el .ass en disco y devuelve su ruta."""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(build_ass(captions, width, height, **kwargs), encoding="utf-8")
    return path
