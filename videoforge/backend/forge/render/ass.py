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


def parse_hex(color: str) -> tuple[int, int, int]:
    """`#1f4fd8` -> (31, 79, 216). Lo que no se entienda sale azul."""
    limpio = str(color).strip().lstrip("#")
    if len(limpio) == 3:
        limpio = "".join(c * 2 for c in limpio)
    try:
        return tuple(int(limpio[i:i + 2], 16) for i in (0, 2, 4))  # type: ignore[return-value]
    except (ValueError, IndexError):
        return (31, 79, 216)


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
    #: margen inferior/superior como fraccion de la altura. No baja del 9%:
    #: por debajo de eso el subtitulo se mete donde el reproductor pinta la
    #: barra de progreso y los controles, y en YouTube queda tapado justo
    #: mientras alguien busca un momento del video.
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
        margin_ratio=0.10,
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
        margin_ratio=0.11,
    ),
    "minimal": CaptionTheme(
        size_ratio=0.045,
        primary=(255, 255, 255),
        secondary=(255, 255, 255),
        outline_width=1.5,
        shadow=0.8,
        bold=False,
        margin_ratio=0.09,
        boxed=True,
    ),
}
DEFAULT_THEME = "clean"

#: Estilo de los rotulos de capitulo. Van arriba a la izquierda, que es donde
#: no estorban: los subtitulos viven abajo y el contenido de una guia suele
#: estar en el centro. Con caja, porque un titulo sobre una interfaz clara sin
#: fondo no se lee.
CARD_SIZE_RATIO = 0.042
#: Margen del rotulo. Tiene que dejar pasar la barra de titulo de la aplicacion
#: que se este grabando: con un 5,5% el rotulo caia justo encima de ella y se
#: leian las dos cosas superpuestas. Una barra de menu tipica ocupa el 8% de la
#: altura, asi que se baja por debajo.
CARD_MARGIN_RATIO = 0.115
#: Milisegundos de entrada y salida del rotulo. ASS lo hace nativo con \fad,
#: asi que no hace falta tocar el grafo de filtros.
CARD_FADE_MS = 260

#: Tamano del texto de un rotulo de seccion, respecto al alto del fotograma.
#: Mas pequeno que una tarjeta de capitulo a proposito: la tarjeta anuncia, el
#: rotulo acompana.
LABEL_SIZE_RATIO = 0.030
#: Cuerpo de letra de una placa, por defecto.
PLATE_SIZE_RATIO = 0.040
#: Entra y sale con un fundido corto, como las tarjetas.
LABEL_FADE_MS = 240


def _font_in_dir(familia: str, fonts_dir) -> bool:
    """Si esa familia esta en la carpeta de fuentes del proyecto.

    Hace falta porque fontconfig solo conoce las del sistema, y las del
    proyecto viven en `assets/fonts/` --- que es de donde las lee libass al
    renderizar. Sin esto, pedir una fuente propia caia siempre en la general.
    """
    fc_scan = shutil.which("fc-scan")
    if not fc_scan or not fonts_dir or not Path(fonts_dir).is_dir():
        return False
    for fichero in Path(fonts_dir).iterdir():
        if fichero.suffix.lower() not in (".ttf", ".otf", ".ttc"):
            continue
        try:
            proc = subprocess.run(
                [fc_scan, "--format=%{family}", str(fichero)],
                capture_output=True, text=True, timeout=10,
            )
        except Exception:
            continue
        familias = (proc.stdout or "").lower()
        if familia.lower() in familias:
            return True
    return False


def resolve_font(preferida: str | None = None, fonts_dir=None) -> str:
    """Elige una familia disponible en el sistema.

    Preguntamos a fontconfig en vez de dar por hecho que existe una fuente
    concreta: si no, libass cae a su ultimo recurso y el subtitulo sale con otra
    cara distinta en cada maquina.

    Con `preferida` se pregunta **solo por esa**: sirve para que un estilo pueda
    pedir su letra de cartel y saber si la tiene o no, en vez de llevarse la
    primera de la lista general.
    """
    if preferida and _font_in_dir(preferida, fonts_dir):
        return preferida

    fc_match = shutil.which("fc-match")
    if not fc_match:
        return "" if preferida else "DejaVu Sans"

    for familia in ((preferida,) if preferida else FONT_CANDIDATES):
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

    return "" if preferida else "DejaVu Sans"


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


#: Ancho medio de un caracter en fraccion del cuerpo de letra, con la fuente en
#: negrita que usan las placas. Es una estimacion --- aqui no hay forma de medir
#: el texto, eso lo hace libass al dibujar --- pero basta para lo unico que se
#: necesita: que el texto no se salga de su placa.
PLATE_CHAR_W = 0.62
#: Y lo que ocupa una linea de alto, contando el interlineado.
PLATE_LINE_H = 1.30


def _plate_lines(texto: str, ancho_px: float, size: int, spacing: float = 0.0) -> list[str]:
    """Parte el texto en las lineas que caben a lo ancho de la placa.

    El `spacing` cuenta: una placa va espaciada --- es lo que le da el aire de
    logo --- y con 27 caracteres son 54 px mas, que es justo lo que hacia que el
    texto se saliera por los dos lados.
    """
    avance = size * PLATE_CHAR_W + max(0.0, spacing)
    caben = max(6, int(ancho_px * 0.92 / avance))
    palabras = texto.split()
    lineas: list[str] = []
    actual: list[str] = []
    for palabra in palabras:
        prueba = " ".join(actual + [palabra])
        if actual and len(prueba) > caben:
            lineas.append(" ".join(actual))
            actual = [palabra]
        else:
            actual.append(palabra)
    if actual:
        lineas.append(" ".join(actual))
    return lineas or [texto]


def _plate_text(rect, width: int, height: int, texto: str, plates, size: int) -> str:
    """El texto de una placa: centrado, en mayusculas y **ajustado a su sitio**.

    Un titulo de capitulo es una frase entera. Sin ajustar, se sale de la placa
    por los dos lados y queda peor que sin placa: se parte en las lineas que
    caben y, si aun asi no cabe de alto, se baja el cuerpo de letra.
    """
    if getattr(plates, "upper", True):
        texto = texto.upper()

    ancho_px = width * rect.w
    alto_px = height * rect.h

    espaciado = getattr(plates, "spacing", 3.0) * height / 1080.0
    lineas = _plate_lines(texto, ancho_px, size, espaciado)
    # Si con ese cuerpo de letra no cabe de alto, se baja hasta que quepa. Dos
    # lineas en una banda estrecha es lo normal en una tarjeta de capitulo.
    cuerpo = size
    while cuerpo > 10 and len(lineas) * cuerpo * PLATE_LINE_H > alto_px * 0.9:
        cuerpo = int(cuerpo * 0.9)
        lineas = _plate_lines(texto, ancho_px, cuerpo, espaciado)

    cx = int(round(width * (rect.x + rect.w / 2)))
    cy = int(round(height * (rect.y + rect.h / 2)))
    tamano = "" if cuerpo == size else f"\\fs{cuerpo}"
    return (
        f"{{\\an5\\pos({cx},{cy}){tamano}"
        f"\\fad({LABEL_FADE_MS},{LABEL_FADE_MS})}}"
        + "\\N".join(lineas)
    )


def build_ass(
    captions: list[CaptionEffect],
    width: int,
    height: int,
    *,
    theme_name: str = DEFAULT_THEME,
    font: str | None = None,
    karaoke: bool = True,
    cards: list | None = None,
    labels: list | None = None,
    plates=None,
    fonts_dir=None,
) -> str:
    """Devuelve el contenido completo de un fichero .ass.

    Los rotulos de capitulo van en este mismo fichero, con su propio estilo.
    Podrian dibujarse con `drawtext` en el grafo de filtros, pero entonces
    tendrian otra fuente, otro contorno y otra forma de desvanecerse que los
    subtitulos, y ademas habria que resolver a mano el salto de linea. Aqui
    salen del mismo motor de texto y no pueden descuadrarse entre si.
    """
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

    card_size = max(14, int(round(height * CARD_SIZE_RATIO)))
    card_margen = max(16, int(round(height * CARD_MARGIN_RATIO)))
    label_size = max(12, int(round(height * LABEL_SIZE_RATIO)))

    # La letra de una placa: cuerpo grande, contorno gordo y espaciada, que es
    # lo que hace que un texto parezca un logo y no un subtitulo. `BorderStyle:
    # 1` --- contorno y sombra, sin caja --- porque detras va una imagen y la
    # caja la taparia. Anclado al centro (5) para que caiga en medio de la
    # placa sin tener que medir el texto.
    plate_size = max(14, int(round(height * getattr(plates, "size", PLATE_SIZE_RATIO))))
    # Una placa quiere letra de cartel, que no es la de un subtitulo. Si el
    # estilo nombra una y esta instalada, se usa; si no, la misma que el resto,
    # que es mejor que caer en la de ultimo recurso de libass.
    plate_font = familia
    pedida = (getattr(plates, "font", "") or "").strip()
    if pedida:
        plate_font = resolve_font(pedida, fonts_dir) or familia
    plate_fill = _ass_color(*parse_hex(getattr(plates, "text_color", "#F6EFE2")))
    plate_outline = _ass_color(*parse_hex(getattr(plates, "outline_color", "#18222E")))
    plate_bordes = max(2.0, plate_size * getattr(plates, "outline", 0.16))
    plate_sombra = max(1.0, plate_bordes * 0.4)
    plate_spacing = getattr(plates, "spacing", 3.0) * height / 1080.0

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
Style: Label,{familia},{label_size},{_ass_color(255, 255, 255)},{_ass_color(255, 255, 255)},{_ass_color(31, 79, 216)},{_ass_color(0, 0, 0, 0x30)},-1,0,0,0,100,100,0,0,3,{max(6.0, label_size * 0.35):.1f},0,7,0,0,0,1
Style: Card,{familia},{card_size},{_ass_color(255, 255, 255)},{_ass_color(255, 255, 255)},{outline},{_ass_color(0, 0, 0, 0x30)},-1,0,0,0,100,100,0,0,3,{max(2.0, theme.outline_width * 0.8):.1f},0,7,{card_margen},{card_margen},{card_margen},1
Style: Plate,{plate_font},{plate_size},{plate_fill},{plate_fill},{plate_outline},{_ass_color(0, 0, 0, 0x40)},-1,0,0,0,100,100,{plate_spacing:.1f},0,1,{plate_bordes:.1f},{plate_sombra:.1f},5,0,0,0,1

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

    for i, card in enumerate(cards or []):
        texto = _escape(getattr(card, "text", "") or "")
        if not texto:
            continue

        if getattr(card, "background", "") and getattr(card, "rect", None):
            # Igual que un rotulo con fondo: sin caja, centrado en la placa y
            # con la letra de placa. La caja del estilo `Card` taparia el arte.
            lineas.append(
                f"Dialogue: 1,{_timestamp(card.start)},{_timestamp(card.end)},Plate,,0,0,0,,"
                + _plate_text(card.rect, width, height, texto, plates, plate_size)
            )
            continue

        subtitulo = _escape(getattr(card, "subtitle", "") or "")
        if subtitulo:
            texto = f"{texto}\\N{{\\fs{int(card_size * 0.62)}}}{subtitulo}"
        lineas.append(
            f"Dialogue: 1,{_timestamp(card.start)},{_timestamp(card.end)},Card,,0,0,0,,"
            f"{{\\fad({CARD_FADE_MS},{CARD_FADE_MS})}}{texto}"
        )

    for label in labels or []:
        texto = _escape(getattr(label, "title", "") or "")
        if not texto:
            continue
        rect = getattr(label, "rect", None)

        if getattr(label, "background", "") and rect is not None:
            lineas.append(
                f"Dialogue: 1,{_timestamp(label.start)},{_timestamp(label.end)},Plate,,0,0,0,,"
                + _plate_text(rect, width, height, texto, plates, plate_size)
            )
            continue

        x = int(round(width * (getattr(rect, "x", 0.05) if rect else 0.05)))
        y = int(round(height * (getattr(rect, "y", 0.08) if rect else 0.08)))
        r, g, b = parse_hex(getattr(label, "color", "#1f4fd8"))
        # `BorderStyle: 3` pinta la caja con el color de contorno, asi que el
        # color del rotulo va ahi. Se manda por linea y no por estilo para que
        # el estilo pueda cambiarlo sin tocar la cabecera.
        lineas.append(
            f"Dialogue: 1,{_timestamp(label.start)},{_timestamp(label.end)},Label,,0,0,0,,"
            f"{{\\an7\\pos({x},{y})\\3c{_ass_color(r, g, b)}"
            f"\\fad({LABEL_FADE_MS},{LABEL_FADE_MS})}}{texto}"
        )

    # Los dialogos tienen que ir ordenados por tiempo de inicio.
    lineas.sort(key=lambda linea: linea.split(",")[1])
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
