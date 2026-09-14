"""Senala en pantalla lo que se esta nombrando.

Es lo que hace un editor humano en una guia y lo que ningun montaje automatico
hace: cuando dices "pulsa en Configuracion avanzada", aparece un recuadro
alrededor de ese boton. No hay que adivinar nada, porque las dos mitades del
dato ya existen:

- el **transcript** dice que palabra se esta diciendo y cuando,
- el **OCR** dice que texto hay en pantalla y **donde**.

Solo se marca cuando las dos coinciden. Eso lo hace conservador por
construccion: si lo que dices no esta escrito en pantalla, no se inventa un
recuadro en cualquier sitio, que es justo el fallo que convierte un recurso util
en ruido.
"""

from __future__ import annotations

import unicodedata

from ..analysis.ocr import ScreenText, WordBox
from ..analysis.types import Transcript
from .edl import EDL, CalloutEffect, Rect
from .styles import CalloutRules, budget

#: Valor de un recuadro: alto en una guia, es de lo que mas se agradece.
CALLOUT_VALUE = 0.8
#: Y cuesta bastante: es un elemento grafico encima de la imagen.
CALLOUT_COST = 0.55

#: Margen que se deja alrededor del texto detectado, en fracciones de pantalla.
PADDING_X = 0.012
PADDING_Y = 0.016

#: Cuanto puede separarse la lectura de OCR del momento en que se dice la
#: palabra. Las lecturas van muestreadas cada pocos segundos, y lo que hay en
#: pantalla cambia despacio en una guia.
MAX_OCR_DISTANCE = 4.0

#: Palabras demasiado comunes para senalar nada: coincidirian con cualquier
#: interfaz.
_IGNORADAS = frozenset(
    {
        "que", "para", "con", "por", "los", "las", "una", "este", "esta",
        "del", "más", "mas", "muy", "the", "and", "for", "you", "your",
        "aqui", "aqui", "ahora", "bien", "todo", "toda", "esto", "eso",
    }
)
#: Por debajo de esto una palabra coincide por casualidad.
MIN_LENGTH = 4


def _normalize(texto: str) -> str:
    """Minusculas y sin acentos: el OCR se los come la mitad de las veces."""
    limpio = "".join(
        c for c in unicodedata.normalize("NFD", texto.lower())
        if unicodedata.category(c) != "Mn"
    )
    return "".join(c for c in limpio if c.isalnum())


def _readings_near(readings: list[ScreenText], t: float) -> ScreenText | None:
    """La lectura de pantalla mas cercana a un instante del original."""
    candidatas = [r for r in readings if abs(r.at - t) <= MAX_OCR_DISTANCE]
    if not candidatas:
        return None
    return min(candidatas, key=lambda r: abs(r.at - t))


def _group_boxes(boxes: list[WordBox]) -> Rect:
    """Rectangulo que envuelve varias palabras contiguas, con su margen."""
    x0 = min(b.x for b in boxes) - PADDING_X
    y0 = min(b.y for b in boxes) - PADDING_Y
    x1 = max(b.x + b.w for b in boxes) + PADDING_X
    y1 = max(b.y + b.h for b in boxes) + PADDING_Y
    return Rect(
        x=max(0.0, x0),
        y=max(0.0, y0),
        w=min(1.0, x1) - max(0.0, x0),
        h=min(1.0, y1) - max(0.0, y0),
    ).clamped()


def _matching_boxes(lectura: ScreenText, dicha: str) -> list[WordBox]:
    """Las cajas de pantalla cuyo texto es la palabra que se acaba de decir.

    Si la palabra aparece varias veces sueltas por la pantalla no se marca
    ninguna: senalar la equivocada es peor que no senalar.
    """
    iguales = [b for b in lectura.boxes if _normalize(b.text) == dicha]
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


def plan_callouts(
    edl: EDL,
    transcript: Transcript | None,
    screen_text: list[ScreenText],
    rules: CalloutRules,
) -> tuple[list[CalloutEffect], list[CalloutEffect]]:
    """Coloca recuadros donde lo dicho coincide con lo escrito en pantalla.

    Devuelve (elegidos, reservas), como los demas planners: las reservas quedan
    para que el auto-balanceador pueda subir la densidad si se queda corto.
    """
    if not rules.enabled or transcript is None or not screen_text or edl.duration <= 0:
        return [], []

    maximo = budget(rules.max_per_minute, edl.duration, rules.seconds * 2)
    if maximo <= 0:
        return [], []

    candidatos: list[CalloutEffect] = []
    for palabra in transcript.words:
        dicha = _normalize(palabra.text)
        if len(dicha) < MIN_LENGTH or dicha in _IGNORADAS:
            continue

        lectura = _readings_near(screen_text, palabra.start)
        if lectura is None:
            continue
        cajas = _matching_boxes(lectura, dicha)
        if not cajas:
            continue

        inicio = edl.source_to_timeline(palabra.start)
        if inicio is None:
            continue
        fin = min(edl.duration, inicio + rules.seconds)
        if fin - inicio < rules.seconds * 0.6:
            continue

        etiqueta = " ".join(c.text for c in cajas)
        candidatos.append(
            CalloutEffect(
                id=f"call{len(candidatos):03d}",
                start=round(inicio, 3),
                end=round(fin, 3),
                rect=_group_boxes(cajas),
                label=etiqueta,
                shape="box",
                value_score=CALLOUT_VALUE,
                cost_weight=CALLOUT_COST,
                rationale=f'recuadro sobre "{etiqueta}": ahi lo estas nombrando',
            )
        )

    # Se reparten con separacion: dos recuadros seguidos cansan mas que ayudan.
    elegidos: list[CalloutEffect] = []
    reservas: list[CalloutEffect] = []
    for efecto in candidatos:
        cabe = len(elegidos) < maximo
        separado = all(efecto.start - e.end >= rules.min_gap for e in elegidos)
        if cabe and separado:
            elegidos.append(efecto)
        else:
            reservas.append(efecto)
    return elegidos, reservas
