"""Lee el texto que aparece en pantalla.

En material de guias esto es la senal mas fuerte que existe para saber de que
va el video: los menus, los botones y los titulos dicen literalmente el nombre
del programa o del juego. Ninguna red neuronal lo hace mejor que leerlo.

Depende de Tesseract, que es libre pero externo. Si no esta, se avisa y el
sistema sigue con el resto de senales: OCR nunca decide solo.
"""

from __future__ import annotations

import shutil
import subprocess
from collections import Counter
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
class ScreenText:
    """Texto leido en un instante concreto."""

    at: float
    words: list[str] = field(default_factory=list)

    @property
    def text(self) -> str:
        return " ".join(self.words)


def tesseract_available() -> bool:
    return shutil.which("tesseract") is not None


def _run_tesseract(image_path: Path, lang: str) -> list[tuple[str, float]]:
    """Devuelve (palabra, confianza) de una imagen."""
    proc = subprocess.run(
        ["tesseract", str(image_path), "stdout", "-l", lang, "--psm", "11", "tsv"],
        capture_output=True,
        text=True,
        timeout=120,
    )
    if proc.returncode != 0:
        return []

    salida: list[tuple[str, float]] = []
    for linea in (proc.stdout or "").splitlines()[1:]:
        columnas = linea.split("\t")
        if len(columnas) < 12:
            continue
        texto = columnas[11].strip()
        try:
            confianza = float(columnas[10])
        except ValueError:
            continue
        if texto and confianza >= 0:
            salida.append((texto, confianza))
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
    if not tesseract_available():
        return []

    import cv2

    resultados: list[ScreenText] = []
    temporal = settings.cache_dir / "ocr"
    temporal.mkdir(parents=True, exist_ok=True)

    frames = extract_frames_at(
        proxy_video, settings, timestamps, width=OCR_WIDTH, height=OCR_HEIGHT
    )
    for ts, frame in zip(timestamps, frames):
        destino = temporal / "frame.png"
        cv2.imwrite(str(destino), cv2.cvtColor(frame, cv2.COLOR_RGB2BGR))
        try:
            lecturas = _run_tesseract(destino, lang)
        except (subprocess.TimeoutExpired, OSError):
            continue

        palabras = [
            texto
            for texto, confianza in lecturas
            if confianza >= min_confidence and len(texto) >= MIN_LENGTH and any(c.isalpha() for c in texto)
        ]
        if palabras:
            resultados.append(ScreenText(at=round(ts, 3), words=palabras))

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
