"""Donde cabe la ventanita sin taparte lo que estas ensenando.

`pip_rect` colocaba el material **siempre** arriba a la derecha:

    PIP_TOP = 0.07
    PIP_RIGHT = 0.95

Y ese sitio no es neutral. En una guia, arriba a la derecha suele haber algo:
la barra de pestanas, el menu de la ventana, el boton que acabas de nombrar. Si
lo que estas explicando esta justo ahi, la ventanita se planta encima de
exactamente aquello de lo que hablas -- que es el peor sitio posible, y ademas
el sistema **sabia** donde estaba:

- `cues` trae la caja del texto que nombras, leida por OCR (`speech_cues.py`).
- `cursor` trae donde tienes el puntero en cada instante (`analysis/cursor.py`).
- los subtitulos viven abajo, y tampoco se tapan.

Nadie miraba ninguna de las tres. Aqui se miran, y con una regla conservadora:
**se queda en la esquina de siempre salvo que ahi estorbe**. Cambiar de esquina
en cada insercion se ve nervioso; cambiarla solo cuando hace falta se lee como
una decision.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from .edl import Rect

#: Margen al borde del fotograma: una ventanita pegada al canto se ve como un
#: error de encuadre.
EDGE = 0.05
#: Alto de la banda de subtitulos, medido desde abajo. Los subtitulos van
#: centrados y abajo salvo que el planner los suba.
CAPTION_BAND = 0.28
#: Cuanto ocupa el puntero, en fraccion de pantalla. No es su tamano real: es
#: la zona alrededor de el que hay que dejar libre para que se siga leyendo lo
#: que esta senalando.
CURSOR_HALO = 0.14
#: Por debajo de esta fuerza, una senal del habla no manda lo suficiente como
#: para mover nada.
MIN_CUE_STRENGTH = 0.35


def _overlap(a: Rect, b: Rect) -> float:
    """Area comun de dos rectangulos, en fraccion de pantalla."""
    ancho = max(0.0, min(a.x + a.w, b.x + b.w) - max(a.x, b.x))
    alto = max(0.0, min(a.y + a.h, b.y + b.h) - max(a.y, b.y))
    return ancho * alto


@dataclass
class ScreenUse:
    """Que partes del fotograma estan ocupadas, y cuando.

    Se arma una vez por montaje a partir del analisis, y responde a la unica
    pregunta que le hace el planner: "en este instante, que no puedo tapar".
    """

    cues: list = field(default_factory=list)
    cursor: object | None = None
    captions: bool = True

    def busy(self, start: float, end: float) -> list[Rect]:
        """Lo que no se puede tapar entre esos dos instantes del **origen**."""
        zonas: list[Rect] = []

        for cue in self.cues:
            if getattr(cue, "strength", 0.0) < MIN_CUE_STRENGTH:
                continue
            if cue.end < start or cue.start > end:
                continue
            caja = getattr(cue, "box", None)
            if caja:
                x, y, w, h = caja
                zonas.append(Rect(x=x, y=y, w=w, h=h))
            elif getattr(cue, "region", None):
                # Dijiste la zona pero no se pudo leer que habia: se reserva un
                # cuadrado alrededor, que es lo que se sabe.
                rx, ry = cue.region
                zonas.append(Rect(
                    x=max(0.0, rx - CURSOR_HALO), y=max(0.0, ry - CURSOR_HALO),
                    w=CURSOR_HALO * 2, h=CURSOR_HALO * 2,
                ))

        if self.cursor is not None:
            for t in (start, (start + end) / 2, end):
                punto = self.cursor.at(t)
                if punto is None:
                    continue
                cx, cy = punto
                zonas.append(Rect(
                    x=max(0.0, cx - CURSOR_HALO), y=max(0.0, cy - CURSOR_HALO),
                    w=CURSOR_HALO * 2, h=CURSOR_HALO * 2,
                ))

        if self.captions:
            zonas.append(Rect(x=0.0, y=1.0 - CAPTION_BAND, w=1.0, h=CAPTION_BAND))

        return zonas

    def pointing(self, start: float, end: float) -> bool:
        """Si en ese tramo estas senalando algo concreto de la pantalla."""
        return any(
            getattr(c, "strength", 0.0) >= MIN_CUE_STRENGTH
            and getattr(c, "box", None) is not None
            and not (c.end < start or c.start > end)
            for c in self.cues
        )


def corners(w: float, h: float) -> list[tuple[str, Rect]]:
    """Las cuatro esquinas posibles para una ventanita de ese tamano.

    En orden de preferencia. La primera es la de siempre: si nada estorba, el
    montaje queda igual que antes, y eso es a proposito.
    """
    derecha = round(1.0 - EDGE - w, 4)
    abajo = round(1.0 - EDGE - h, 4)
    return [
        ("arriba a la derecha", Rect(x=derecha, y=EDGE, w=w, h=h)),
        ("arriba a la izquierda", Rect(x=EDGE, y=EDGE, w=w, h=h)),
        ("abajo a la derecha", Rect(x=derecha, y=abajo, w=w, h=h)),
        ("abajo a la izquierda", Rect(x=EDGE, y=abajo, w=w, h=h)),
    ]


def place(base: Rect, avoid: list[Rect]) -> tuple[Rect, str]:
    """Elige donde va la ventanita, y devuelve tambien por que.

    Se queda donde estaba si ahi no tapa nada; si tapa, se va a la esquina que
    menos tape. Si todas tapan algo -- una pantalla llena de cosas --, se queda
    con la menos mala, que sigue siendo mejor que no mirar.
    """
    if not avoid:
        return base, ""

    tapa_base = sum(_overlap(base, z) for z in avoid)
    opciones = [
        (sum(_overlap(rect, z) for z in avoid), i, nombre, rect)
        for i, (nombre, rect) in enumerate(corners(base.w, base.h))
    ]
    mejor_tapa, _, nombre, rect = min(opciones, key=lambda o: (round(o[0], 5), o[1]))

    # Moverse tiene que compensar: si la de siempre ya es de las buenas, se
    # queda. El umbral es un 1% de pantalla, que es lo que se empieza a notar.
    if tapa_base <= mejor_tapa + 0.01:
        return base, ""
    return rect, nombre
