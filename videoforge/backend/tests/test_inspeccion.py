"""Mirar el material antes de meterlo.

Antes de esto, decidir que material entra en el montaje era una comparacion de
palabras y nada mas: si el nombre del fichero llevaba la palabra correcta,
entraba. Nadie miraba nunca el fichero. Asi que un clip negro, uno desenfocado,
uno ampliado desde 160x90 o un "video" que en realidad es un fotograma
congelado entraban igual de bien -- y el de un banco de stock entraba **sin
haberlo visto nadie**, porque el renderer lo descargaba y lo pegaba.

Aqui se genera con ffmpeg un juego de casos con defecto **conocido** y se
comprueba el veredicto de cada uno. Los umbrales de `assets/inspect.py` salen de
estas medidas, no de una intuicion.

El caso que manda en el diseno es `sujeto.mp4`: sujeto enfocado sobre fondo
desenfocado. Es material perfectamente bueno y con la nitidez **media** se
habria tirado (media 113 frente a un umbral de 120). De ahi que la nitidez se
mida por rejilla y quedandose con el trozo mejor: lo que no vale no es lo que
tiene poco detalle de media, es lo que no tiene **ni un trozo** enfocado.
"""

from __future__ import annotations

import subprocess
from pathlib import Path

import pytest

from forge.assets.inspect import (
    MIN_SHARPNESS,
    Inspection,
    inspect_cached,
    inspect_media,
    sharpness,
)
from forge.config import Settings
from forge.tools import ffmpeg_bin

#: Cada caso: nombre, cadena de filtros sobre `testsrc2`, y si debe pasar.
CASOS: tuple[tuple[str, str, bool], ...] = (
    ("bueno", "null", True),
    ("oscuro", "eq=brightness=-0.42", True),
    ("sujeto", "", True),          # se monta aparte: nitido sobre desenfocado
    ("buzon", "scale=1280:360,pad=1280:720:0:180:black", True),
    ("pilar", "scale=405:720,pad=1280:720:437:0:black", True),
    ("negro", "eq=brightness=-1.0", False),
    ("blanco", "eq=brightness=1.0", False),
    ("quemado", "eq=brightness=0.55", False),
    ("plano", "hue=s=0,eq=contrast=0.12:brightness=0.1", False),
    ("borroso", "boxblur=14:2", False),
    ("desenfocado", "boxblur=4:1", False),
    ("ampliado", "scale=160:90,scale=1280:720:flags=bicubic", False),
    ("congelado", "", False),      # se monta aparte: un fotograma repetido
)


def _generar(destino: Path, filtros: str, settings: Settings) -> Path:
    cmd = [
        str(ffmpeg_bin(settings)), "-y", "-loglevel", "error",
        "-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=25:duration=4",
    ]
    if filtros:
        cmd += ["-vf", filtros]
    cmd += ["-c:v", "libx264", "-crf", "20", "-pix_fmt", "yuv420p", str(destino)]
    subprocess.run(cmd, check=True, capture_output=True)
    return destino


@pytest.fixture(scope="module")
def material(tmp_path_factory, settings: Settings) -> dict[str, Path]:
    """El juego de casos, generado una vez."""
    d = tmp_path_factory.mktemp("inspeccion")
    ff = str(ffmpeg_bin(settings))
    ficheros: dict[str, Path] = {}

    for nombre, filtros, _ in CASOS:
        if nombre in ("sujeto", "congelado"):
            continue
        ficheros[nombre] = _generar(d / f"{nombre}.mp4", filtros, settings)

    # Bokeh de verdad: el fondo desenfocado y el sujeto nitido encima.
    subprocess.run(
        [ff, "-y", "-loglevel", "error", "-f", "lavfi",
         "-i", "testsrc2=size=1280x720:rate=25:duration=4",
         "-filter_complex",
         "[0:v]split=2[a][b];[a]boxblur=14:2[fondo];"
         "[b]crop=380:380:450:170[suj];[fondo][suj]overlay=450:170",
         "-c:v", "libx264", "-crf", "20", "-pix_fmt", "yuv420p",
         str(d / "sujeto.mp4")],
        check=True, capture_output=True,
    )
    ficheros["sujeto"] = d / "sujeto.mp4"

    # Congelado: un fotograma real repetido cuatro segundos. Es el caso que se
    # cuela con cualquier medida estatica, porque cada fotograma esta perfecto.
    subprocess.run(
        [ff, "-y", "-loglevel", "error", "-f", "lavfi",
         "-i", "testsrc2=size=1280x720:rate=25:duration=1",
         "-frames:v", "1", str(d / "uno.png")],
        check=True, capture_output=True,
    )
    subprocess.run(
        [ff, "-y", "-loglevel", "error", "-loop", "1", "-i", str(d / "uno.png"),
         "-t", "4", "-r", "25", "-c:v", "libx264", "-crf", "20",
         "-pix_fmt", "yuv420p", str(d / "congelado.mp4")],
        check=True, capture_output=True,
    )
    ficheros["congelado"] = d / "congelado.mp4"

    # Y una imagen fija, que es material legitimo y tiene que pasar.
    subprocess.run(
        [ff, "-y", "-loglevel", "error", "-f", "lavfi",
         "-i", "smptebars=size=1280x720:duration=1", "-frames:v", "1",
         str(d / "imagen.jpg")],
        check=True, capture_output=True,
    )
    ficheros["imagen"] = d / "imagen.jpg"
    return ficheros


@pytest.mark.parametrize("nombre,_filtros,debe_pasar", CASOS, ids=[c[0] for c in CASOS])
def test_veredicto_de_cada_caso(
    nombre: str, _filtros: str, debe_pasar: bool, material, settings: Settings
) -> None:
    vista = inspect_media(material[nombre], settings)
    assert vista.measured, f"{nombre}: no se pudo medir"
    assert bool(vista) is debe_pasar, f"{nombre}: {vista.reason} ({vista})"


def test_una_imagen_fija_es_material_valido(material, settings: Settings) -> None:
    """Y no "no se movia", que es el fallo obvio de medir el movimiento.

    Ademas una foto dura 0.04 s y el filtro `fps` de ffmpeg se la come: pedirle
    "un fotograma por segundo" a un JPEG no devolvia **ninguno**.
    """
    vista = inspect_media(material["imagen"], settings)
    assert vista.ok, vista.reason
    assert vista.movement == 0.0


def test_el_congelado_se_pilla_por_el_movimiento(material, settings: Settings) -> None:
    """Cada fotograma esta nitido y bien expuesto: solo lo delata que no cambia."""
    vista = inspect_media(material["congelado"], settings)
    assert not vista.ok
    assert "congelado" in vista.reason
    assert vista.sharpness > MIN_SHARPNESS   # nitido, y aun asi no sirve


def test_el_sujeto_enfocado_sobre_fondo_borroso_se_queda(
    material, settings: Settings
) -> None:
    """El caso que decide como se mide la nitidez.

    Con la media no llegaria al umbral; con el mejor trozo de la rejilla, si. Y
    lo que de verdad hay que tirar -- desenfocado entero y ampliado -- no tiene
    ningun trozo bueno, asi que se cae igual.
    """
    bueno = inspect_media(material["sujeto"], settings)
    assert bueno.ok, bueno.reason
    assert bueno.sharpness >= MIN_SHARPNESS

    for malo in ("desenfocado", "ampliado"):
        vista = inspect_media(material[malo], settings)
        assert not vista.ok and "enfocado" in vista.reason
        # Y con holgura: entre lo peor que se acepta y lo mejor que se rechaza
        # hay un factor de varias veces, no un pelo.
        assert vista.sharpness * 4 < bueno.sharpness


def test_las_barras_negras_se_miden_y_no_se_inventan(
    material, settings: Settings
) -> None:
    """El buzon deja 1280x360 utiles de 1280x720; un clip oscuro no lleva barras.

    Lo segundo importa tanto como lo primero: un clip simplemente oscuro tiene
    columnas por debajo del umbral de negro, y recortarselas seria comerse la
    imagen. Una barra de verdad es negro **plano**.
    """
    buzon = inspect_media(material["buzon"], settings)
    assert buzon.ok and buzon.crop is not None
    assert buzon.crop.w == 1280 and buzon.crop.h == 360
    assert buzon.crop.x == 0 and buzon.crop.y == 180
    assert buzon.usable_height == 360

    pilar = inspect_media(material["pilar"], settings)
    assert pilar.crop is not None
    # Dentro del contenido real (x=437, 405 de ancho), sin colar barra.
    assert pilar.crop.x >= 437 - 2
    assert pilar.crop.x + pilar.crop.w <= 437 + 405 + 2
    assert 380 < pilar.crop.w <= 405

    oscuro = inspect_media(material["oscuro"], settings)
    assert oscuro.ok and oscuro.crop is None, "un clip oscuro no lleva barras"


def test_lo_que_no_se_puede_mirar_pasa(tmp_path: Path, settings: Settings) -> None:
    """No poder mirar no es lo mismo que haber visto algo malo.

    El sistema funcionaba sin mirar nada, asi que un fichero ilegible no puede
    dejar el montaje sin material de apoyo.
    """
    vacio = tmp_path / "vacio.mp4"
    vacio.write_bytes(b"")
    vista = inspect_media(vacio, settings)
    assert vista.ok and not vista.measured

    assert inspect_media(tmp_path / "no-existe.mp4", settings).ok


def test_mirar_dos_veces_el_mismo_fichero_no_lo_mira_dos_veces(
    material, settings: Settings
) -> None:
    primera = inspect_cached(material["bueno"], settings)
    segunda = inspect_cached(material["bueno"], settings)
    assert primera is segunda


def test_la_nitidez_es_la_del_mejor_trozo() -> None:
    """Sin ffmpeg por medio: la medida, sobre datos hechos a mano."""
    import numpy as np

    plano = np.full((64, 64), 128, dtype=np.uint8)
    assert sharpness(plano) == 0.0

    # Un solo cuadrante con detalle fino: la media seria baja, el maximo no.
    con_detalle = plano.copy()
    con_detalle[:16, :16] = np.tile(
        np.array([[0, 255], [255, 0]], dtype=np.uint8), (8, 8)
    )
    assert sharpness(con_detalle) > 1000


def test_el_veredicto_se_puede_usar_como_condicion() -> None:
    assert not Inspection(False, "x")
    assert Inspection(True, "x")
