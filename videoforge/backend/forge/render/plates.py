"""Preparar la imagen que va detras de un rotulo.

Un arte de portada trae **el titulo del juego pintado en medio**, y ese titulo
es justo lo que no puede salir detras del texto del rotulo: quedan dos textos
superpuestos y no se lee ninguno.

Esconderlo recortando otra franja es un apano --- se pierde media imagen --- asi
que aqui se quita. No con `inpaint`: relleno sobre una zona grande y un fondo
tan detallado deja un manchurron (medido sobre esta misma portada, una banda
borrosa de lado a lado). Lo que funciona es **quitar la franja y coser**: la
composicion de un arte de portada es horizontal --- cielo arriba, personajes y
suelo abajo --- asi que juntar lo de arriba con lo de abajo sigue pareciendo la
misma imagen, y el degradado de la costura la hace invisible.

El titulo se encuentra solo: es lo unico **blanco puro** (muy claro y sin nada
de color) de la franja de en medio. El cielo tambien es claro, pero es azul.
"""

from __future__ import annotations

import hashlib
from pathlib import Path

#: Un pixel del titulo: casi blanco y practicamente sin color.
WHITE_V = 230
WHITE_S = 45
#: Donde puede vivir un titulo. Pegado a un borde no es un titulo.
BAND_TOP = 0.28
BAND_BOTTOM = 0.72
#: Fraccion del pico de blanco que todavia cuenta como cuerpo de letra...
CORE_SHARE = 0.30
#: ...y la que cuenta como las rayitas finas del logo, que son mucho mas
#: delgadas y se quedaban fuera del corte anterior.
RULE_SHARE = 0.05
#: Margen de seguridad alrededor de la franja.
MARGIN = 6
#: Cuanto mas blanca tiene que ser la fila del titulo que una fila cualquiera.
PEAK_OVER_BACKGROUND = 3.0
#: Y un minimo absoluto, para una imagen sin practicamente nada blanco.
MIN_PEAK = 12.0
#: Filas con las que se funde la costura.
BLEND = 20
#: Si la franja se lleva mas que esto de la imagen, no era un titulo: se deja la
#: imagen como estaba antes que devolver una tira.
MAX_SHARE = 0.55


def _band(blanco, height: int) -> tuple[int, int] | None:
    """La franja de filas que ocupa el titulo, si hay alguno."""
    import numpy as np

    por_fila = blanco.sum(axis=1).astype("float32")
    arriba, abajo = int(height * BAND_TOP), int(height * BAND_BOTTOM)
    dentro = np.zeros_like(por_fila)
    dentro[arriba:abajo] = por_fila[arriba:abajo]
    if dentro.max() <= 0:
        return None
    pico = int(dentro.argmax())

    # Un titulo **destaca**: sus filas son mucho mas blancas que las demas. Sin
    # esta comprobacion, una imagen clara entera --- nieve, un fondo blanco ---
    # da un pico como cualquier otra y se le corta una franja de en medio por
    # nada, que detras de un rotulo es peor que el titulo.
    fondo = float(np.median(por_fila))
    if dentro[pico] < max(MIN_PEAK, fondo * PEAK_OVER_BACKGROUND):
        return None

    def extender(desde: int, paso: int, corte: float) -> int:
        y = desde
        while arriba < y + paso < abajo and dentro[y + paso] > corte:
            y += paso
        return y

    nucleo = dentro[pico] * CORE_SHARE
    y0, y1 = extender(pico, -1, nucleo), extender(pico, +1, nucleo)
    rayita = dentro[pico] * RULE_SHARE
    y0, y1 = extender(y0, -1, rayita), extender(y1, +1, rayita)
    return max(0, y0 - MARGIN), min(height, y1 + 1 + MARGIN)


def strip_title(path: Path, cache_dir: Path) -> Path:
    """Devuelve la imagen sin el titulo, cacheada por contenido.

    Si no encuentra ningun titulo --- o si lo que encuentra se lleva media
    imagen, que quiere decir que se equivoco --- devuelve la original.
    """
    import cv2
    import numpy as np

    path = Path(path)
    firma = hashlib.sha256(path.read_bytes()).hexdigest()[:16]
    destino = Path(cache_dir) / f"placa-{firma}.png"
    if destino.is_file():
        return destino

    img = cv2.imread(str(path), cv2.IMREAD_COLOR)
    if img is None:
        return path
    alto, _ = img.shape[:2]

    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    blanco = ((hsv[:, :, 2] > WHITE_V) & (hsv[:, :, 1] < WHITE_S)).astype(np.int32)

    franja = _band(blanco, alto)
    if franja is None:
        return path
    y0, y1 = franja
    if (y1 - y0) > alto * MAX_SHARE or y1 - y0 < 4:
        return path

    imgf = img.astype(np.float32)
    arriba, abajo = imgf[:y0], imgf[y1:]
    n = min(BLEND, len(arriba), len(abajo))
    if n < 2:
        return path
    k = np.linspace(0.0, 1.0, n).reshape(-1, 1, 1)
    costura = arriba[-n:] * (1 - k) + abajo[:n] * k
    salida = np.vstack([arriba[:-n], costura, abajo[n:]])

    destino.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(destino), salida.astype(np.uint8))
    return destino
