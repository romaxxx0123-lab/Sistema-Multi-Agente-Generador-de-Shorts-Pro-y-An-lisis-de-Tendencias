"""Donde esta el cursor del raton, que en una guia es donde esta la mirada.

Para decidir a donde acercarse, el proyecto tenia una sola senal: la saliencia
por residuo espectral, que mide **contraste**. En una pantalla de ordenador el
contraste esta repartido por todas partes -- una interfaz es texto negro sobre
blanco de punta a punta -- asi que esa medida, que funciona bien con una cara o
un paisaje, aqui dice poco.

Y hay una senal mucho mejor delante: **el puntero**. Quien graba una guia lo
lleva a lo que va a explicar *antes* de nombrarlo, y lo deja quieto ahi
mientras habla de eso. No hay mapa de saliencia que compita con eso.

No hace falta ningun modelo. En una grabacion de pantalla el puntero es el
unico objeto que cumple las tres cosas a la vez: **es pequeno**, **se mueve
solo** y **la pantalla de alrededor esta quieta**. Se encuentra restando
fotogramas consecutivos y quedandose con los cambios pequenos; los cambios
grandes son otra cosa (se abrio un menu, cambio la ventana) y ahi no se
inventa nada.

Lo que **no** hace: seguirlo en video que se mueve entero (un juego, una camara
en mano). Ahi no encuentra nada, y no encontrar nada es el comportamiento
correcto: significa que esa senal no aplica a ese material.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

from ..config import Settings
from .frames import iter_gray_frames

#: Cuantas veces por segundo se mira. El puntero se mueve rapido, pero para
#: saber **donde se para** no hace falta mas: cuatro por segundo es el mismo
#: ritmo con el que se mide el movimiento.
DEFAULT_RATE = 4.0
#: Cuanto tiene que cambiar un pixel para contar como cambio.
DIFF_THRESHOLD = 28
#: Resolucion a la que se mira. Mas fina que la del movimiento (160x90) porque
#: aqui hace falta **la posicion**, no solo cuanto se movio: a 160 de ancho,
#: cada pixel son doce en 1080p y el zoom apuntaria con esa precision.
CURSOR_WIDTH = 320
CURSOR_HEIGHT = 180
#: Tamano del cambio que puede ser un puntero, en pixeles de ese fotograma. Un
#: puntero ocupa ahi unas decenas; por debajo es ruido de compresion y por
#: encima es la interfaz cambiando.
MIN_AREA = 3
MAX_AREA = 250
#: Cuanto tiene que haberse alejado del fondo para contar como "aqui ha
#: llegado algo". Un margen pequeno, solo para no contar ruido de compresion.
APPROACH_MARGIN = 4.0
#: Cuanto se actualiza el fondo en cada muestra. Bajo a proposito: la interfaz
#: cambia poco y de golpe, y un fondo rapido se traga el puntero.
BACKGROUND_ALPHA = 0.2
#: Y cuanto cambio puede haber en total: si media pantalla se movio, lo que
#: paso no es que el raton se moviera.
MAX_TOTAL_CHANGED = 0.06
#: Salto maximo entre dos muestras seguidas, en fracciones de pantalla. Mas que
#: esto y no es el mismo puntero: es otro cambio en otro sitio.
MAX_JUMP = 0.35
#: Por debajo de este movimiento entre muestras, el puntero esta **quieto**, que
#: es la parte que interesa: donde se para es de lo que se esta hablando.
RESTING_MOVE = 0.02


@dataclass(frozen=True)
class CursorSample:
    """Donde estaba el puntero en un instante, en fracciones de pantalla."""

    at: float
    x: float
    y: float
    #: cuanto se movio respecto a la muestra anterior, en fracciones
    move: float = 0.0

    @property
    def resting(self) -> bool:
        return self.move <= RESTING_MOVE


@dataclass
class CursorTrack:
    """El recorrido del puntero, con huecos donde no se pudo ver."""

    rate: float = DEFAULT_RATE
    samples: list[CursorSample] = field(default_factory=list)

    def __bool__(self) -> bool:
        return bool(self.samples)

    @property
    def coverage(self) -> float:
        """Que fraccion de las miradas encontraron puntero."""
        return len(self.samples) / max(1, self._expected)

    _expected: int = 0

    def at(self, t: float, window: float = 1.0) -> CursorSample | None:
        """La muestra mas cercana a ese instante, si hay alguna cerca."""
        cerca = [s for s in self.samples if abs(s.at - t) <= window]
        return min(cerca, key=lambda s: abs(s.at - t)) if cerca else None

    def resting_at(self, t: float, window: float = 2.0) -> tuple[float, float] | None:
        """Donde estaba el puntero **parado** alrededor de ese instante.

        Es lo que sirve para encuadrar: el puntero de paso no dice nada, el
        puntero parado encima de algo dice que se esta hablando de eso.
        """
        quietas = [
            s for s in self.samples
            if abs(s.at - t) <= window and s.resting
        ]
        if not quietas:
            return None
        elegida = min(quietas, key=lambda s: abs(s.at - t))
        return (elegida.x, elegida.y)


def _components(mask: np.ndarray) -> list[tuple[float, float, int]]:
    """Los grupos de pixeles cambiados, con su centro y su tamano."""
    import cv2

    numero, _, stats, centroides = cv2.connectedComponentsWithStats(
        mask.astype(np.uint8), connectivity=8
    )
    salida: list[tuple[float, float, int]] = []
    for i in range(1, numero):
        area = int(stats[i, cv2.CC_STAT_AREA])
        salida.append((float(centroides[i][0]), float(centroides[i][1]), area))
    return salida


def track_cursor(
    proxy_video: Path,
    settings: Settings,
    *,
    rate: float = DEFAULT_RATE,
    width: int = CURSOR_WIDTH,
    height: int = CURSOR_HEIGHT,
) -> CursorTrack:
    """Recorre el proxy y devuelve por donde anduvo el puntero.

    No se restan fotogramas **consecutivos**, que es lo primero que se intenta y
    no funciona: un puntero que se mueve deja **dos** manchas, donde estaba y
    donde esta, y no hay forma de saber cual es cual mirando solo esa resta.
    (Medido: cero detecciones en un video de prueba con el puntero a la vista
    todo el rato.)

    Se compara contra un **fondo** que se va aprendiendo: la interfaz esta
    quieta, asi que al cabo de unas muestras el fondo es la interfaz y lo unico
    que se sale de el es el puntero. Una sola mancha, y es la de ahora.

    Y cuando no se ve nada, no se pierde el rastro: si la pantalla no cambia es
    que el puntero sigue donde estaba, **parado**. Eso no es un hueco en los
    datos, es justo el dato que interesa.
    """
    fondo: np.ndarray | None = None
    previo: np.ndarray | None = None
    muestras: list[CursorSample] = []
    ultimo: tuple[float, float] | None = None
    vistos = 0

    for indice, frame in enumerate(
        iter_gray_frames(proxy_video, settings, rate=rate, width=width, height=height)
    ):
        actual = frame.astype(np.float32)
        if fondo is None:
            fondo, previo = actual, actual
            continue
        vistos += 1

        # Lo que se busca es **donde ha llegado** el puntero, y eso son dos
        # condiciones sobre cada pixel:
        #
        #   1. que no pertenezca al fondo (ahi hay algo que la escena no tiene);
        #   2. que se haya **alejado** del fondo respecto al fotograma anterior.
        #
        # La segunda es la que resuelve la ambiguedad de raiz. Restar
        # fotogramas consecutivos da siempre dos manchas -- de donde se fue y
        # a donde llego -- y mirar solo el fondo da tres, porque el fondo tarda
        # un par de muestras en olvidar por donde paso. Pero el sitio del que
        # se fue se **acerco** al fondo (volvio a ser la interfaz de siempre) y
        # el sitio al que llego se alejo. Sin saber si el puntero es claro o
        # oscuro, ni de que color es la interfaz.
        distancia = np.abs(actual - fondo)
        distancia_antes = np.abs(previo - fondo)
        cambiado = float((np.abs(actual - previo) >= DIFF_THRESHOLD).mean())
        previo = actual
        mask = (distancia >= DIFF_THRESHOLD) & (distancia > distancia_antes + APPROACH_MARGIN)

        elegido: tuple[float, float] | None = None
        if 0.0 < cambiado <= MAX_TOTAL_CHANGED and mask.any():
            candidatos = [
                (cx / width, cy / height)
                for cx, cy, area in _components(mask)
                if MIN_AREA <= area <= MAX_AREA
            ]
            if candidatos:
                if ultimo is not None:
                    cerca = [p for p in candidatos if math.dist(p, ultimo) <= MAX_JUMP]
                    elegido = (
                        min(cerca, key=lambda p: math.dist(p, ultimo)) if cerca
                        else (candidatos[0] if len(candidatos) == 1 else None)
                    )
                else:
                    # Al arrancar, solo si no hay ambiguedad: mejor empezar
                    # tarde que seguir a un parpadeo de la interfaz.
                    elegido = candidatos[0] if len(candidatos) == 1 else None

        quieto = False
        if elegido is None and ultimo is not None and cambiado <= MAX_TOTAL_CHANGED:
            # La pantalla no cambio: el puntero sigue donde estaba, parado. No
            # es un hueco en los datos, es el dato que interesa.
            elegido, quieto = ultimo, True

        if elegido is not None:
            muestras.append(
                CursorSample(
                    at=round(indice / rate, 3),
                    x=round(elegido[0], 4),
                    y=round(elegido[1], 4),
                    move=0.0 if quieto or ultimo is None else round(math.dist(elegido, ultimo), 4),
                )
            )
            ultimo = elegido

        # El fondo aprende despacio y **en todas partes**: dejar fuera lo que
        # esta en la mascara parece mas fino y es peor, porque entonces el
        # puntero del primer fotograma se queda en el fondo para siempre y
        # fabrica un fantasma permanente. (Medido: dos manchas en cada muestra
        # y cero detecciones.)
        fondo = fondo * (1.0 - BACKGROUND_ALPHA) + actual * BACKGROUND_ALPHA

    pista = CursorTrack(rate=rate, samples=muestras)
    pista._expected = max(1, vistos)
    return pista
