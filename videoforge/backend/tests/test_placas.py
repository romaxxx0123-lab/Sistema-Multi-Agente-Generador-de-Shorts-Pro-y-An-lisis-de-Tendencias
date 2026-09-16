"""Quitarle a un arte de portada el titulo del juego.

Un arte de portada trae el titulo pintado **en medio**, y ese titulo es justo lo
que no puede salir detras del texto de un rotulo: quedan dos textos superpuestos
y no se lee ninguno.

Esconderlo recortando otra franja es un apano --- se pierde media imagen. Y
`inpaint` tampoco sirve: relleno sobre una zona grande y un fondo detallado deja
un manchurron (medido sobre una portada real, una banda borrosa de lado a lado).
Lo que funciona es quitar la franja y coser: la composicion de un arte de
portada es horizontal --- cielo arriba, personajes y suelo abajo --- asi que
juntar lo de arriba con lo de abajo sigue pareciendo la misma imagen.
"""

from __future__ import annotations

import numpy as np
import pytest

from forge.render.plates import strip_title


@pytest.fixture
def portada(tmp_path):
    """Un arte falso con su titulo blanco en medio, como el de verdad."""
    import cv2

    alto, ancho = 360, 640
    img = np.zeros((alto, ancho, 3), np.uint8)
    # Cielo azul arriba (claro pero con color) y suelo verde abajo.
    img[: alto // 2] = (200, 150, 90)
    img[alto // 2:] = (60, 110, 60)
    # Y el titulo, blanco puro, en la franja de en medio.
    cv2.putText(img, "PALWORLD", (60, int(alto * 0.52)),
                cv2.FONT_HERSHEY_SIMPLEX, 3.0, (255, 255, 255), 12, cv2.LINE_AA)
    ruta = tmp_path / "portada.png"
    cv2.imwrite(str(ruta), img)
    return ruta


def _blanco_puro(ruta) -> int:
    import cv2

    img = cv2.imread(str(ruta), cv2.IMREAD_COLOR)
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    return int(((hsv[:, :, 2] > 230) & (hsv[:, :, 1] < 45)).sum())


def test_el_titulo_desaparece(portada, tmp_path) -> None:
    antes = _blanco_puro(portada)
    assert antes > 2000, "el fixture tiene que traer un titulo de verdad"

    limpia = strip_title(portada, tmp_path / "cache")
    assert limpia != portada, "tiene que devolver otra imagen"
    assert _blanco_puro(limpia) < antes * 0.05, "sigue habiendo titulo"


def test_lo_demas_se_conserva(portada, tmp_path) -> None:
    """Quitar la franja no puede llevarse la imagen entera."""
    import cv2

    original = cv2.imread(str(portada))
    limpia = cv2.imread(str(strip_title(portada, tmp_path / "cache")))

    assert limpia.shape[1] == original.shape[1], "el ancho no se toca"
    assert limpia.shape[0] > original.shape[0] * 0.45, "se llevo media imagen"
    assert limpia.shape[0] < original.shape[0], "algo tenia que quitar"


def test_una_imagen_sin_titulo_se_deja_como_esta(tmp_path) -> None:
    """Si no hay nada blanco en medio, no hay nada que quitar."""
    import cv2

    img = np.zeros((360, 640, 3), np.uint8)
    img[:] = (120, 90, 60)
    ruta = tmp_path / "lisa.png"
    cv2.imwrite(str(ruta), img)

    assert strip_title(ruta, tmp_path / "cache") == ruta


def test_no_se_lleva_media_imagen_por_equivocarse(tmp_path) -> None:
    """Un arte casi todo blanco no tiene titulo: tiene mucho blanco.

    Sin esta guarda, lo que se devuelve es una tira de pixeles en vez de una
    imagen, y eso detras de un rotulo es peor que el titulo.
    """
    import cv2

    img = np.full((360, 640, 3), 250, np.uint8)
    ruta = tmp_path / "blanca.png"
    cv2.imwrite(str(ruta), img)

    assert strip_title(ruta, tmp_path / "cache") == ruta


def test_se_cachea_por_contenido(portada, tmp_path) -> None:
    """Limpiar la imagen cuesta; hacerlo en cada render, no."""
    cache = tmp_path / "cache"
    primera = strip_title(portada, cache)
    segunda = strip_title(portada, cache)
    assert primera == segunda
    assert primera.parent == cache
