"""Leer la pantalla, que en una guia es donde esta el contenido.

Hasta aqui el unico motor de OCR era **Tesseract**, un programa del sistema que
hay que instalar aparte. Sin el, `screen_text` se quedaba vacio -- y con el
vacio se caen de golpe cuatro cosas que ya estaban escritas y probadas:

- los recuadros sobre lo que nombras,
- senalar por nombre en vez de por zona,
- el material sacado del propio video por lo que se vio en pantalla,
- la lectura dirigida a los momentos en los que hablas de la pantalla.

Es decir: en la instalacion por defecto la app estaba **ciega a la pantalla**.

Ahora hay un segundo motor, **RapidOCR** (PP-OCRv4 en ONNX), que se instala con
`pip` y **trae los modelos dentro del paquete**: no hay nada que descargar
despues ni ningun programa del sistema que poner.
"""

from __future__ import annotations

import subprocess
from pathlib import Path

import pytest

from forge.analysis.ocr import (
    engine_name,
    ocr_available,
    rapidocr_available,
    read_screen_text,
    split_line,
)
from forge.analysis.types import Transcript, TranscriptSegment, Word
from forge.config import Settings
from forge.tools import ffmpeg_bin
from forge.understand.speech_cues import CueKind, find_all

#: Una interfaz de verdad, escrita con el mismo motor de texto que usa el
#: render (libass): hay titulos, un campo y un boton de color.
_UI = """[Script Info]
ScriptType: v4.00+
PlayResX: 1280
PlayResY: 720
WrapStyle: 2

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: UI,DejaVu Sans,28,&H00202020,&H00202020,&H00FFFFFF,&H00FFFFFF,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1
Style: Boton,DejaVu Sans,26,&H00FFFFFF,&H00FFFFFF,&H00C04010,&H00C04010,-1,0,0,0,100,100,0,0,3,6,0,7,0,0,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,0:01:00.00,UI,,0,0,0,,{\\pos(60,50)}Ajustes de red
Dialogue: 0,0:00:00.00,0:01:00.00,UI,,0,0,0,,{\\pos(60,140)}Contrasena del router
Dialogue: 0,0:00:00.00,0:01:00.00,UI,,0,0,0,,{\\pos(700,140)}Configuracion avanzada
Dialogue: 0,0:00:00.00,0:01:00.00,Boton,,0,0,0,,{\\pos(700,400)}Guardar cambios
"""

necesita_ocr = pytest.mark.skipif(
    not ocr_available(), reason="no hay ningun motor de OCR instalado"
)


@pytest.fixture(scope="module")
def pantalla(tmp_path_factory, settings: Settings) -> Path:
    d = tmp_path_factory.mktemp("pantalla")
    ass = d / "ui.ass"
    ass.write_text(_UI, encoding="utf-8")
    video = d / "pantalla.mp4"
    subprocess.run(
        [str(ffmpeg_bin(settings)), "-y", "-loglevel", "error",
         "-f", "lavfi", "-i", "color=c=0xf2f2f2:s=1280x720:r=25:d=30",
         "-vf", f"ass={ass}", "-c:v", "libx264", "-crf", "22",
         "-pix_fmt", "yuv420p", str(video)],
        check=True, capture_output=True,
    )
    return video


def _transcript():
    frases = [("pulsa en guardar cambios cuando termines", 3.0),
              ("la contrasena del router va en ese campo", 10.0)]
    segmentos = []
    for texto, inicio in frases:
        t = inicio
        palabras = []
        for palabra in texto.split():
            palabras.append(Word(start=round(t, 2), end=round(t + 0.38, 2), text=palabra))
            t += 0.45
        segmentos.append(TranscriptSegment(start=inicio, end=t, text=texto, words=palabras))
    return Transcript(language="es", segments=segmentos)


# -- que lee ----------------------------------------------------------------


@necesita_ocr
def test_lee_lo_que_pone_en_pantalla(pantalla, settings: Settings) -> None:
    lecturas = read_screen_text(pantalla, settings, [3.0, 10.0])
    assert lecturas, "no leyo nada"

    palabras = " ".join(lecturas[0].words).lower()
    for esperada in ("ajustes", "router", "guardar", "cambios"):
        assert esperada in palabras, (esperada, palabras)


@necesita_ocr
def test_lee_tambien_donde_esta_cada_cosa(pantalla, settings: Settings) -> None:
    """Saber que pone "Guardar" esta bien; saber **donde** es lo que sirve."""
    (lectura, *_) = read_screen_text(pantalla, settings, [3.0])
    guardar = next(b for b in lectura.boxes if b.text.lower() == "guardar")
    ajustes = next(b for b in lectura.boxes if b.text.lower() == "ajustes")

    # El boton esta abajo a la derecha; el titulo, arriba a la izquierda.
    assert guardar.cx > 0.5 and guardar.cy > 0.5
    assert ajustes.cx < 0.3 and ajustes.cy < 0.2


def test_una_linea_se_reparte_en_palabras() -> None:
    """RapidOCR lee lineas y todo lo de detras trabaja con palabras."""
    palabras = split_line("Guardar cambios", (100.0, 50.0, 200.0, 30.0), 0.98)
    assert [p[0] for p in palabras] == ["Guardar", "cambios"]
    (_, _, caja1), (_, _, caja2) = palabras
    assert caja1[0] == 100.0
    assert caja2[0] > caja1[0] + caja1[2] * 0.8      # la segunda va detras
    assert abs((caja2[0] + caja2[2]) - 300.0) < 6.0  # y acaban donde la linea


def test_una_linea_vacia_no_da_palabras() -> None:
    assert split_line("   ", (0.0, 0.0, 10.0, 10.0), 0.9) == []


# -- y que hace la app con ello ---------------------------------------------


@necesita_ocr
def test_senalar_pasa_de_una_zona_a_un_boton(pantalla, settings: Settings) -> None:
    """La medida de lo que cambia: sin leer la pantalla, "pulsa en" no tiene
    objetivo; leyendola, apunta al boton exacto."""
    transcript = _transcript()
    lecturas = read_screen_text(pantalla, settings, [3.0, 10.0])

    ciego = [c for c in find_all(transcript, None, None, None)
             if c.kind is CueKind.POINT]
    viendo = [c for c in find_all(transcript, None, None, lecturas)
              if c.kind is CueKind.POINT]

    assert ciego and viendo
    assert ciego[0].target == "" and ciego[0].box is None
    assert "guardar" in viendo[0].target.lower()
    x, y, w, h = viendo[0].box
    assert 0.5 < x + w / 2 < 0.75 and 0.45 < y + h / 2 < 0.7


@necesita_ocr
def test_el_montaje_pone_el_recuadro_donde_esta_el_boton(
    pantalla, settings: Settings
) -> None:
    """Y esto es lo que se ve en el video: un recuadro sobre lo que nombras."""
    from forge.fixtures import synthetic_guide_analysis
    from forge.plan.edl import EffectKind
    from forge.plan.planner import build_edl

    transcript = _transcript()
    lecturas = read_screen_text(pantalla, settings, [3.0, 10.0])

    def montar(screen_text):
        a = synthetic_guide_analysis(60.0, with_transcript=False)
        a.transcript = transcript
        a.screen_text = screen_text
        a.cues = find_all(transcript, a.audio, None, screen_text or None)
        return build_edl(a, "tutorial")

    sin_ocr = [e for e in montar([]).effects if e.kind is EffectKind.CALLOUT]
    con_ocr = [e for e in montar(lecturas).effects if e.kind is EffectKind.CALLOUT]

    assert sin_ocr == []
    assert con_ocr, "leyendo la pantalla tiene que salir el recuadro"
    marca = con_ocr[0]
    assert "guardar" in marca.rationale.lower()
    assert 0.5 < marca.rect.x + marca.rect.w / 2 < 0.75


@necesita_ocr
def test_se_dice_con_que_motor_se_lee() -> None:
    assert engine_name() in ("rapidocr", "tesseract")
    if rapidocr_available():
        assert engine_name() == "rapidocr", "el que trae sus modelos va primero"
