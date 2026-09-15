"""Atar lo que se dice a lo que esta escrito en la pantalla.

Las dos mitades del dato ya existen por separado: el transcript dice **que
palabra** se esta diciendo y **cuando**, y el OCR dice **que texto** hay en
pantalla y **donde**. Cruzarlas es lo que separa "senalar hacia el tercio de
arriba" de senalar el boton exacto que se acaba de nombrar.

Vive aqui, y no dentro del planner de recuadros que fue el primero en usarlo,
porque lo necesitan dos sitios: el recuadro que rodea el boton y el **zoom** que
lo encuadra. Un zoom al tercio correcto de la pantalla y un zoom al boton son
cosas distintas para quien lo ve.

Es conservador a proposito: si la palabra dicha no esta escrita en pantalla, no
devuelve nada, y quien llama se queda con lo que tuviera. Y si esta escrita en
**varios** sitios a la vez, tampoco devuelve nada: senalar el sitio equivocado
es peor que no senalar.
"""

from __future__ import annotations

import unicodedata
from typing import TYPE_CHECKING

if TYPE_CHECKING:  # importarlo de verdad arrastraria numpy y cv2 hasta aqui,
    # y esto es texto y aritmetica.
    from ..analysis.ocr import ScreenText, WordBox

#: Cuanto puede separarse la lectura de OCR del momento en que se dice la
#: palabra. Las lecturas van muestreadas cada pocos segundos, y lo que hay en
#: pantalla cambia despacio en una guia.
MAX_OCR_DISTANCE = 4.0

#: Palabras demasiado comunes para senalar nada: coincidirian con cualquier
#: interfaz.
IGNORED = frozenset(
    {
        "que", "para", "con", "por", "los", "las", "una", "este", "esta",
        "del", "mas", "muy", "the", "and", "for", "you", "your",
        "aqui", "ahora", "bien", "todo", "toda", "esto", "eso",
    }
)

#: Ademas, al buscar **el nombre** de lo que se senala se saltan las palabras
#: del propio andamiaje de la frase: en "dale al boton de guardar", el nombre es
#: "guardar", no "boton". Solo se ignoran para eso; como palabra suelta, si en
#: pantalla pone "Menu" y dices "menu", es una coincidencia buena.
SCAFFOLDING = frozenset(
    {
        "donde", "pone", "dice", "boton", "botones", "opcion", "opciones",
        "menu", "pestana", "casilla", "icono", "campo", "apartado", "cuadro",
        "desplegable", "parte", "sitio", "cosa", "clic", "click", "sobre",
        "arriba", "abajo", "izquierda", "derecha", "esquina", "justo",
    }
)
#: Por debajo de esto una palabra coincide por casualidad.
MIN_LENGTH = 4

#: Cuantas palabras despues de la formula se busca el nombre del objetivo. En
#: "dale al boton de guardar" el nombre cae a tres palabras de "dale".
NAME_LOOKAHEAD = 4

#: Margen que se deja alrededor del texto detectado, en fracciones de pantalla.
PADDING_X = 0.012
PADDING_Y = 0.016


def normalize_word(texto: str) -> str:
    """Minusculas y sin acentos: el OCR se los come la mitad de las veces."""
    limpio = "".join(
        c for c in unicodedata.normalize("NFD", texto.lower())
        if unicodedata.category(c) != "Mn"
    )
    return "".join(c for c in limpio if c.isalnum())


def is_pointable(dicha: str) -> bool:
    """Si esa palabra es lo bastante especifica para senalar algo con ella."""
    return len(dicha) >= MIN_LENGTH and dicha not in IGNORED


def reading_near(
    readings: "list[ScreenText]", t: float, max_distance: float = MAX_OCR_DISTANCE
) -> "ScreenText | None":
    """La lectura de pantalla mas cercana a un instante del original."""
    candidatas = [r for r in readings if abs(r.at - t) <= max_distance]
    if not candidatas:
        return None
    return min(candidatas, key=lambda r: abs(r.at - t))


def boxes_for_word(lectura: "ScreenText", dicha: str) -> "list[WordBox]":
    """Las cajas de pantalla cuyo texto es la palabra que se acaba de decir.

    Si la palabra aparece varias veces sueltas por la pantalla no se marca
    ninguna: senalar la equivocada es peor que no senalar.
    """
    iguales = [b for b in lectura.boxes if normalize_word(b.text) == dicha]
    if len(iguales) != 1:
        return []

    # Se extiende a las palabras pegadas **a los dos lados** en la misma linea:
    # "Configuracion avanzada" es un boton, y hay que senalarlo entero tanto si
    # se dice "configuracion" como si se dice "avanzada".
    elegidas = list(iguales)
    for hacia_la_derecha in (True, False):
        while len(elegidas) < 4:
            borde = elegidas[-1] if hacia_la_derecha else elegidas[0]
            vecinas = [
                b for b in lectura.boxes
                if b not in elegidas
                and abs(b.cy - borde.cy) < borde.h * 0.6
                and 0 <= (
                    b.x - (borde.x + borde.w) if hacia_la_derecha
                    else borde.x - (b.x + b.w)
                ) < borde.h * 1.2
            ]
            if len(vecinas) != 1:
                break
            if hacia_la_derecha:
                elegidas.append(vecinas[0])
            else:
                elegidas.insert(0, vecinas[0])
    return elegidas


def bounds(boxes: "list[WordBox]") -> tuple[float, float, float, float]:
    """Rectangulo (x, y, w, h) que envuelve varias cajas, con su margen."""
    x0 = max(0.0, min(b.x for b in boxes) - PADDING_X)
    y0 = max(0.0, min(b.y for b in boxes) - PADDING_Y)
    x1 = min(1.0, max(b.x + b.w for b in boxes) + PADDING_X)
    y1 = min(1.0, max(b.y + b.h for b in boxes) + PADDING_Y)
    return x0, y0, max(0.0, x1 - x0), max(0.0, y1 - y0)


def locate(
    palabras: "list[Word]",
    desde: int,
    readings: "list[ScreenText] | None",
    *,
    lookahead: int = NAME_LOOKAHEAD,
) -> tuple[str, tuple[float, float]] | None:
    """El nombre que se dice a partir de `desde` y donde esta en la pantalla.

    Devuelve `(nombre leido en pantalla, centro)` o `None`. Se prueban las
    palabras siguientes en orden, porque el nombre del objetivo va detras de la
    formula: "dale **al boton de guardar**".
    """
    if not readings:
        return None
    for palabra in palabras[desde : desde + lookahead + 1]:
        dicha = normalize_word(palabra.text)
        if not is_pointable(dicha) or dicha in SCAFFOLDING:
            continue
        lectura = reading_near(readings, palabra.start)
        if lectura is None:
            continue
        cajas = boxes_for_word(lectura, dicha)
        if not cajas:
            continue
        x, y, w, h = bounds(cajas)
        etiqueta = " ".join(c.text for c in cajas)
        return etiqueta, (round(x + w / 2, 4), round(y + h / 2, 4))
    return None
