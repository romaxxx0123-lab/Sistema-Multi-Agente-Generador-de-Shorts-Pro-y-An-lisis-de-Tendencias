"""Mirar el material antes de meterlo en el montaje.

Hasta aqui, decidir que material se inserta era una operacion **de palabras**:
la cabeza de lo que dices tenia que estar entre las etiquetas del fichero y con
eso entraba. Nadie miraba nunca el material. Asi que un clip negro, uno
desenfocado, uno ampliado desde 160x90 o un "video" que en realidad es un
fotograma congelado entraban igual, con solo llamarse bien. Y el de un banco de
stock entraba **sin haberlo visto nadie**: se descargaba y se pegaba.

Aqui se mira. Cinco medidas sobre fotogramas del propio fichero:

- **brillo** y **contraste**: si esta casi negro, quemado o plano, no hay nada
  que ensenar.
- **nitidez**: varianza del laplaciano, pero por **rejilla y quedandose con el
  maximo**, no con la media. Ese detalle es el que hace que funcione: un plano
  con el sujeto enfocado y el fondo desenfocado tiene la media por el suelo y
  sin embargo es material perfectamente bueno; lo que no vale es lo que **no
  tiene ni un trozo nitido**, que es justo lo que le pasa a un clip ampliado o
  desenfocado entero.
- **movimiento**: un video cuyos fotogramas son identicos es un fotograma
  congelado, y en el montaje se lee como un fallo de reproduccion.
- **barras negras**: cuanto del fotograma es material y cuanto es relleno. No
  es un motivo para rechazarlo, es un dato que hacia falta: un clip 2.35:1
  dentro de un 16:9 dice que mide 1280x720 y de alto util tiene la mitad, asi
  que la decision de "esto tapa la pantalla o va en ventanita" se estaba
  tomando con un numero falso.

Los fotogramas se leen con ffmpeg y no con `cv2.VideoCapture`, por lo mismo que
el resto del analisis (ver `analysis/frames.py`): posicionar con OpenCV depende
del codec, y pedirselo a ffmpeg da siempre los mismos fotogramas.

Los umbrales estan medidos, no elegidos a ojo: `tests/test_inspeccion.py`
genera con ffmpeg el juego de casos (bueno, negro, blanco, quemado, plano,
desenfocado, ampliado, congelado, buzon, barras laterales y bokeh de verdad) y
comprueba el veredicto de cada uno.
"""

from __future__ import annotations

import subprocess
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from ..config import Settings
from ..errors import ForgeError
from ..tools import ffmpeg_bin, probe
from .types import Crop

#: Alto al que se miran los fotogramas. Las medidas dependen de la resolucion,
#: asi que hay que normalizarla o los umbrales no significan nada.
SAMPLE_HEIGHT = 360
#: Cuantos fotogramas se miran, repartidos por toda la duracion.
MAX_FRAMES = 6
#: Rejilla para la nitidez local.
GRID = 4

#: Por debajo de esto no hay ni un trozo enfocado en todo el fotograma.
MIN_SHARPNESS = 120.0
#: Ventana de exposicion utilizable (media 0..1).
MIN_BRIGHTNESS = 0.05
MAX_BRIGHTNESS = 0.93
#: Desviacion tipica minima: por debajo es un tono plano, no una imagen.
MIN_CONTRAST = 0.05
#: Diferencia media entre fotogramas muestreados. Cero es un congelado; el
#: grano de cualquier material real ya pasa de aqui.
MIN_MOVEMENT = 0.002

#: Nivel de gris por debajo del cual una fila o columna puede ser barra.
BAR_LEVEL = 18
#: Y lo lisa que tiene que ser. Sin esto, un clip simplemente oscuro se
#: recortaba solo: sus columnas de los lados tambien bajan de `BAR_LEVEL`, pero
#: tienen textura. Una barra de verdad es negro plano.
BAR_FLATNESS = 6.0
#: Solo merece la pena recortar si las barras se comen algo de verdad.
MAX_USABLE = 0.97


@dataclass(frozen=True)
class Inspection:
    """Lo que se ve al mirar un fichero de material."""

    ok: bool
    reason: str
    #: `False` cuando no se ha podido mirar (sin ffmpeg, fichero ilegible). En
    #: ese caso `ok` es `True` -- no se bloquea el montaje por no poder mirar --
    #: pero nadie debe fiarse de las medidas ni sobreescribir nada con ellas.
    measured: bool = False
    width: int = 0
    height: int = 0
    duration: float = 0.0
    brightness: float = 0.0
    contrast: float = 0.0
    sharpness: float = 0.0
    movement: float = 0.0
    #: Recorte que deja fuera las barras negras, en pixeles del original.
    crop: Crop | None = None

    def __bool__(self) -> bool:
        return self.ok

    @property
    def usable_width(self) -> int:
        return self.crop.w if self.crop else self.width

    @property
    def usable_height(self) -> int:
        return self.crop.h if self.crop else self.height


#: Lo que se devuelve cuando no se ha podido mirar. Deja pasar el material: el
#: sistema funcionaba antes sin mirar nada, y no poder mirar no es un defecto
#: del material.
UNKNOWN = Inspection(True, "no se pudo mirar", measured=False)


def _laplacian_var(tile: np.ndarray) -> float:
    """Varianza del laplaciano de un trozo: cuanto detalle fino tiene."""
    if tile.shape[0] < 3 or tile.shape[1] < 3:
        return 0.0
    g = tile.astype(np.float64)
    lap = (
        4.0 * g[1:-1, 1:-1]
        - g[:-2, 1:-1] - g[2:, 1:-1] - g[1:-1, :-2] - g[1:-1, 2:]
    )
    return float(lap.var())


def sharpness(gray: np.ndarray, grid: int = GRID) -> float:
    """El trozo **mas nitido** del fotograma.

    Por rejilla y maximo: ver el porque en la cabecera del modulo.
    """
    h, w = gray.shape
    mejor = 0.0
    for i in range(grid):
        for j in range(grid):
            trozo = gray[
                i * h // grid:(i + 1) * h // grid,
                j * w // grid:(j + 1) * w // grid,
            ]
            mejor = max(mejor, _laplacian_var(trozo))
    return mejor


def _bars(gray: np.ndarray) -> tuple[int, int, int, int] | None:
    """Cuantas filas/columnas de barra negra hay por cada lado."""
    def es_barra(medias: np.ndarray, desvios: np.ndarray, i: int) -> bool:
        return bool(medias[i] < BAR_LEVEL and desvios[i] < BAR_FLATNESS)

    def barra(medias: np.ndarray, desvios: np.ndarray) -> tuple[int, int]:
        n = len(medias)
        inicio = 0
        while inicio < n and es_barra(medias, desvios, inicio):
            inicio += 1
        fin = 0
        while fin < n - inicio and es_barra(medias, desvios, n - 1 - fin):
            fin += 1
        return inicio, fin

    arriba, abajo = barra(gray.mean(axis=1), gray.std(axis=1))
    izq, der = barra(gray.mean(axis=0), gray.std(axis=0))
    if arriba + abajo >= gray.shape[0] or izq + der >= gray.shape[1]:
        # Fotograma entero negro (un fundido, p. ej.): no dice nada de la forma.
        return None
    return arriba, abajo, izq, der


def _con_margen(barra: int) -> int:
    """Una fila de margen si hay barra; nada si no la hay."""
    return barra + 1 if barra > 0 else 0


def _read_frames(
    path: Path, settings: Settings, width: int, height: int, rate: float
) -> list[np.ndarray]:
    """Fotogramas en gris, a `width`x`height`, `rate` por segundo.

    Con `rate` a cero no se remuestrea. Hace falta para las imagenes: una foto
    dura 0.04 s y el filtro `fps` la tira, asi que pidiendole "un fotograma por
    segundo" a un JPEG no salia **ninguno**.
    """
    remuestreo = f"fps={rate:g}," if rate > 0 else ""
    cmd = [
        str(ffmpeg_bin(settings)),
        "-hide_banner", "-loglevel", "error", "-nostdin",
        "-i", str(path),
        "-vf", f"{remuestreo}scale={width}:{height}:flags=bilinear,format=gray",
        "-frames:v", str(MAX_FRAMES),
        "-f", "rawvideo", "-pix_fmt", "gray", "-",
    ]
    salida = subprocess.run(cmd, capture_output=True, timeout=120).stdout
    tamano = width * height
    return [
        np.frombuffer(salida[i * tamano:(i + 1) * tamano], dtype=np.uint8).reshape(
            height, width
        )
        for i in range(len(salida) // tamano)
    ]


def inspect_media(
    path: Path | str, settings: Settings | None = None, *, is_video: bool | None = None
) -> Inspection:
    """Mira un fichero de material y dice si sirve.

    Devuelve `UNKNOWN` (que deja pasar) si no se puede ni abrir el fichero: no
    poder mirar no es lo mismo que haber visto algo malo.
    """
    p = Path(path)
    settings = settings or Settings.load()
    try:
        info = probe(p, settings)
    except (ForgeError, OSError, ValueError):
        return UNKNOWN
    if info.video is None:
        return UNKNOWN

    ancho = info.video.display_width or 0
    alto = info.video.display_height or 0
    duracion = float(info.duration or 0.0)
    if ancho <= 0 or alto <= 0:
        return UNKNOWN

    if is_video is None:
        is_video = duracion > 0.2

    # Alto fijo y ancho proporcional: las medidas dependen de la resolucion, y
    # deformar la imagen para normalizarla falsearia justamente la nitidez.
    alto_m = min(SAMPLE_HEIGHT, alto)
    ancho_m = max(16, int(round(ancho * alto_m / alto)) // 2 * 2)
    # Reparte los fotogramas por toda la duracion en vez de coger los primeros:
    # los primeros de un clip de stock suelen ser un fundido desde negro.
    rate = MAX_FRAMES / duracion if duracion > 0.5 else 0.0

    try:
        frames = _read_frames(p, settings, ancho_m, alto_m, rate)
    except (subprocess.SubprocessError, OSError, ForgeError):
        return UNKNOWN
    if not frames:
        return Inspection(False, "no se pudo leer ni un fotograma", measured=True,
                          width=ancho, height=alto, duration=duracion)

    brillo = float(np.mean([f.mean() for f in frames]) / 255)
    contraste = float(np.mean([f.std() for f in frames]) / 255)
    nitidez = float(np.mean([sharpness(f) for f in frames]))
    movimiento = 0.0
    if len(frames) > 1:
        movimiento = float(
            np.mean([
                np.abs(a.astype(np.float32) - b.astype(np.float32)).mean()
                for a, b in zip(frames, frames[1:])
            ]) / 255
        )

    # Barras: solo cuenta lo que es barra en **todos** los fotogramas mirados,
    # que es lo conservador -- asi un fotograma oscuro no recorta el clip.
    medidas = [b for b in (_bars(f) for f in frames) if b is not None]
    crop: Crop | None = None
    if medidas:
        # Una fila mas por cada lado con barra: al reducir el fotograma a 360
        # de alto, la fila del borde mezcla barra con imagen y deja de ser
        # negro plano, asi que la deteccion se queda una fila corta y colaba
        # una raya negra dentro del recorte.
        arriba = _con_margen(min(m[0] for m in medidas))
        abajo = _con_margen(min(m[1] for m in medidas))
        izq = _con_margen(min(m[2] for m in medidas))
        der = _con_margen(min(m[3] for m in medidas))
        util_alto = (alto_m - arriba - abajo) / alto_m
        util_ancho = (ancho_m - izq - der) / ancho_m
        if util_alto < MAX_USABLE or util_ancho < MAX_USABLE:
            # De vuelta a pixeles del original, y pares: muchos codecs no
            # aceptan dimensiones impares.
            # De vuelta a pixeles del original. Se redondea el origen hacia
            # dentro y el tamano hacia abajo: antes perder un pixel de imagen
            # que dejar dentro uno de barra, que en pantalla es una raya negra.
            escala_y = alto / alto_m
            escala_x = ancho / ancho_m
            y = -(-int(arriba * escala_y) // 2) * 2
            x = -(-int(izq * escala_x) // 2) * 2
            crop = Crop(
                x=x,
                y=y,
                w=max(2, (min(ancho, int((ancho_m - der) * escala_x)) - x) // 2 * 2),
                h=max(2, (min(alto, int((alto_m - abajo) * escala_y)) - y) // 2 * 2),
            )

    base = {
        "measured": True,
        "width": ancho,
        "height": alto,
        "duration": duracion,
        "brightness": round(brillo, 4),
        "contrast": round(contraste, 4),
        "sharpness": round(nitidez, 1),
        "movement": round(movimiento, 5),
        "crop": crop,
    }

    if brillo < MIN_BRIGHTNESS:
        return Inspection(False, "esta casi negro", **base)
    if brillo > MAX_BRIGHTNESS:
        return Inspection(False, "esta quemado de luz", **base)
    if contraste < MIN_CONTRAST:
        return Inspection(False, "es un tono plano, no se distingue nada", **base)
    if nitidez < MIN_SHARPNESS:
        return Inspection(
            False, "no tiene ni un trozo enfocado: esta borroso o ampliado", **base
        )
    if is_video and len(frames) > 1 and movimiento < MIN_MOVEMENT:
        return Inspection(False, "no se mueve: es un fotograma congelado", **base)

    detalle = f"nitidez {nitidez:.0f}, brillo {brillo:.2f}"
    if crop is not None:
        detalle += f", con barras negras ({crop.w}x{crop.h} util)"
    return Inspection(True, detalle, **base)


#: Lo ya mirado, por (fichero, tamano, fecha). Un montaje consulta la
#: biblioteca muchas veces y mirar el mismo fichero veinte veces es tonteria.
_VISTO: dict[tuple[str, int, int], Inspection] = {}


def inspect_cached(path: Path | str, settings: Settings | None = None) -> Inspection:
    """Como `inspect_media`, pero sin volver a mirar el mismo fichero.

    La clave lleva tamano y fecha de modificacion: si cambias el fichero, se
    vuelve a mirar. No entra en la clave la configuracion, que en un proceso es
    siempre la misma.
    """
    p = Path(path)
    try:
        st = p.stat()
    except OSError:
        return UNKNOWN
    clave = (str(p), st.st_size, int(st.st_mtime))
    if clave not in _VISTO:
        if len(_VISTO) > 512:
            _VISTO.clear()
        _VISTO[clave] = inspect_media(p, settings)
    return _VISTO[clave]
