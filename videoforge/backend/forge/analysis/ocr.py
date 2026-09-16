"""Lee el texto que aparece en pantalla.

En material de guias esto es la senal mas fuerte que existe para saber de que
va el video: los menus, los botones y los titulos dicen literalmente el nombre
del programa o del juego. Ninguna red neuronal lo hace mejor que leerlo.

Hay **dos motores**, y se usa el que haya:

- **RapidOCR** (PP-OCRv4 en ONNX). Se instala con `pip` y **los modelos viajan
  dentro del paquete** (16 MB), asi que no hay nada que descargar despues ni
  ningun programa del sistema que instalar. Es el preferido.
- **Tesseract**, que es libre pero externo: hay que instalarlo aparte con el
  gestor de paquetes del sistema.

Esto importa mas de lo que parece. Hasta aqui el unico motor era Tesseract, y
sin el `screen_text` se quedaba **vacio**; con el vacio se caen de golpe los
recuadros sobre lo que nombras, senalar por nombre, el material sacado del
propio video por lo que se vio en pantalla y la lectura dirigida. O sea: en
cualquier instalacion sin Tesseract -- que es la instalacion por defecto -- la
app estaba **ciega a la pantalla**, que en una guia es justo donde esta el
contenido.

Medido sobre una captura de interfaz en espanol, RapidOCR lee los cinco bloques
con 0.95-1.00 de confianza y su posicion, en 0.44 s por fotograma. Se come los
acentos ("Configuracion" por "Configuración"), y da igual: aqui todo se compara
sin acentos.

Si no hay ninguno de los dos, se avisa y el sistema sigue con el resto de
senales: el OCR nunca decide solo.
"""

from __future__ import annotations

import shutil
import subprocess
from collections import Counter
from functools import lru_cache
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

from ..config import Settings
from .frames import extract_frames_at

#: Resolucion a la que se pasa el fotograma al OCR. Subirla mejora poco y
#: multiplica el tiempo; bajarla se come el texto pequeno.
OCR_WIDTH = 1280
OCR_HEIGHT = 720
#: Confianza minima de Tesseract para quedarnos con una palabra.
MIN_CONFIDENCE = 60.0
#: Palabras mas cortas que esto son casi siempre ruido del OCR.
MIN_LENGTH = 3


@dataclass
class WordBox:
    """Una palabra leida y **donde** estaba, en fracciones del fotograma.

    La posicion es la mitad util del OCR en una guia: saber que en pantalla
    pone "Ajustes" esta bien, pero saber que pone "Ajustes" *ahi* es lo que
    permite senalarlo cuando se nombra.
    """

    text: str
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


@dataclass
class ScreenText:
    """Texto leido en un instante concreto."""

    at: float
    words: list[str] = field(default_factory=list)
    boxes: list[WordBox] = field(default_factory=list)

    @property
    def text(self) -> str:
        return " ".join(self.words)


def tesseract_available() -> bool:
    return shutil.which("tesseract") is not None


def rapidocr_available() -> bool:
    """Si esta el motor que trae sus propios modelos."""
    from importlib.util import find_spec

    try:
        return find_spec("rapidocr_onnxruntime") is not None
    except (ImportError, ValueError):
        return False


def ocr_available() -> bool:
    return rapidocr_available() or tesseract_available()


def engine_name() -> str:
    """Cual se va a usar, para poder decirlo en `forge doctor`."""
    if rapidocr_available():
        return "rapidocr"
    if tesseract_available():
        return "tesseract"
    return ""


@lru_cache(maxsize=1)
def _rapidocr():
    """El motor, cargado una sola vez (tarda 0.2 s en arrancar)."""
    from rapidocr_onnxruntime import RapidOCR

    return RapidOCR()


def split_line(
    texto: str, caja: tuple[float, float, float, float], conf: float
) -> list[tuple[str, float, tuple[float, float, float, float]]]:
    """Parte una linea leida en palabras, repartiendo su caja.

    RapidOCR lee **lineas** y Tesseract lee **palabras**, y todo lo que hay
    detras (senalar lo que nombras, encuadrar un boton) trabaja con palabras.
    Se reparte el ancho de la linea proporcionalmente a las letras de cada
    palabra, contando los espacios.

    Es una aproximacion, y hay que decirlo: en una fuente de ancho variable la
    caja de cada palabra sale desplazada unos pixeles. Para lo que se usa --
    dibujar un recuadro alrededor de un termino o acercarse a el -- sobra.
    """
    palabras = texto.split()
    if not palabras:
        return []
    left, top, ancho, alto = caja
    total = sum(len(p) for p in palabras) + len(palabras) - 1
    if total <= 0:
        return []

    salida: list[tuple[str, float, tuple[float, float, float, float]]] = []
    cursor = 0
    for palabra in palabras:
        x = left + ancho * cursor / total
        w = ancho * len(palabra) / total
        salida.append((palabra, conf, (x, top, w, alto)))
        cursor += len(palabra) + 1
    return salida


def _run_rapidocr(frame: np.ndarray) -> list[tuple[str, float, tuple[float, float, float, float]]]:
    """Lee un fotograma y devuelve (palabra, confianza 0-100, caja en pixeles)."""
    try:
        resultado, _ = _rapidocr()(frame)
    except Exception:
        # Un motor que peta no puede tumbar el analisis: sin texto se sigue.
        return []

    salida: list[tuple[str, float, tuple[float, float, float, float]]] = []
    for linea in resultado or []:
        puntos, texto, confianza = linea[0], linea[1], float(linea[2])
        xs = [p[0] for p in puntos]
        ys = [p[1] for p in puntos]
        caja = (min(xs), min(ys), max(xs) - min(xs), max(ys) - min(ys))
        salida += split_line(texto, caja, confianza * 100.0)
    return salida


def _run_tesseract(image_path: Path, lang: str) -> list[tuple[str, float, tuple[int, int, int, int]]]:
    """Devuelve (palabra, confianza, caja) de una imagen.

    La caja viene en pixeles de la imagen que se le paso, en columnas 6-9 del
    TSV: left, top, width, height.
    """
    proc = subprocess.run(
        ["tesseract", str(image_path), "stdout", "-l", lang, "--psm", "11", "tsv"],
        capture_output=True,
        text=True,
        timeout=120,
    )
    if proc.returncode != 0:
        return []

    salida: list[tuple[str, float, tuple[int, int, int, int]]] = []
    for linea in (proc.stdout or "").splitlines()[1:]:
        columnas = linea.split("\t")
        if len(columnas) < 12:
            continue
        texto = columnas[11].strip()
        try:
            confianza = float(columnas[10])
            caja = tuple(int(columnas[i]) for i in (6, 7, 8, 9))
        except ValueError:
            continue
        if texto and confianza >= 0:
            salida.append((texto, confianza, caja))
    return salida


def read_screen_text(
    proxy_video: Path,
    settings: Settings,
    timestamps: list[float],
    *,
    lang: str = "spa+eng",
    min_confidence: float = MIN_CONFIDENCE,
) -> list[ScreenText]:
    """Lee el texto en pantalla en los instantes indicados."""
    if not ocr_available():
        return []

    usa_rapid = rapidocr_available()

    import cv2

    resultados: list[ScreenText] = []
    temporal = settings.cache_dir / "ocr"
    temporal.mkdir(parents=True, exist_ok=True)

    frames = extract_frames_at(
        proxy_video, settings, timestamps, width=OCR_WIDTH, height=OCR_HEIGHT
    )
    for ts, frame in zip(timestamps, frames):
        if usa_rapid:
            lecturas = _run_rapidocr(cv2.cvtColor(frame, cv2.COLOR_RGB2BGR))
        else:
            destino = temporal / "frame.png"
            cv2.imwrite(str(destino), cv2.cvtColor(frame, cv2.COLOR_RGB2BGR))
            try:
                lecturas = _run_tesseract(destino, lang)
            except (subprocess.TimeoutExpired, OSError):
                continue

        cajas = [
            WordBox(
                text=texto,
                x=round(left / OCR_WIDTH, 4),
                y=round(top / OCR_HEIGHT, 4),
                w=round(ancho / OCR_WIDTH, 4),
                h=round(alto / OCR_HEIGHT, 4),
            )
            for texto, confianza, (left, top, ancho, alto) in lecturas
            if confianza >= min_confidence
            and len(texto) >= MIN_LENGTH
            and any(c.isalpha() for c in texto)
            and ancho > 0
            and alto > 0
        ]
        if cajas:
            resultados.append(
                ScreenText(
                    at=round(ts, 3),
                    words=[c.text for c in cajas],
                    boxes=cajas,
                )
            )

    return resultados


def recurring_terms(readings: list[ScreenText], *, min_appearances: int = 2) -> list[tuple[str, int]]:
    """Terminos que se repiten en pantalla a lo largo del video.

    Un texto que aparece una sola vez suele ser ruido o contenido de paso; el
    que se repite es casi siempre el nombre de la aplicacion, del juego o de la
    seccion, que es justo lo que interesa para identificar el video.
    """
    cuenta: Counter[str] = Counter()
    for lectura in readings:
        # `set` por lectura para que un menu con la palabra repetida no cuente
        # como muchas apariciones distintas.
        cuenta.update({p.lower() for p in lectura.words})
    return [(t, n) for t, n in cuenta.most_common(30) if n >= min_appearances]
