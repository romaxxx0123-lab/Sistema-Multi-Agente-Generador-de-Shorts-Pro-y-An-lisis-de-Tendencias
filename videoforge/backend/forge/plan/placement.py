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
#: Alto de la banda de subtitulos. Se mide desde abajo o desde arriba segun
#: donde esten puestos: **no siempre estan abajo**. `captions.py` los sube
#: cuando el foco del plano esta en la parte baja, y dar por hecho que van
#: abajo ponia la ventanita justo encima de ellos en esos planos.
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


#: Cada cuanto se mira donde esta el puntero dentro de la insercion. Mirar
#: solo el principio y el final deja pasar un puntero que cruza por medio.
CURSOR_STEP = 0.5


@dataclass
class ScreenUse:
    """Que partes del fotograma estan ocupadas, y cuando.

    Se arma una vez por montaje a partir del analisis, y responde a la unica
    pregunta que le hace el planner: "en este instante, que no puedo tapar".

    Ojo con los dos relojes: `cues` y `cursor` van en tiempo del **video
    original**, y los subtitulos en tiempo del **montaje**. Por eso `busy` pide
    los dos tramos.
    """

    cues: list = field(default_factory=list)
    cursor: object | None = None
    #: los subtitulos ya planificados, con su posicion real
    captions: list = field(default_factory=list)
    #: y lo demas que ya se ha colocado en una esquina (los rotulos de
    #: seccion). Sin esto, cada cosa elige esquina sin saber de las otras, y
    #: como todas prefieren la misma por defecto, acaban una encima de otra.
    overlays: list = field(default_factory=list)
    #: rejilla de ocupacion del video de debajo, si el analisis la trae
    focus_at: object | None = None

    def caption_bands(self, inicio: float, fin: float) -> list[Rect]:
        """La banda que ocupan los subtitulos en ese tramo del **montaje**."""
        bandas: list[Rect] = []
        arriba = abajo = False
        for c in self.captions:
            if c.end < inicio or c.start > fin:
                continue
            if getattr(c, "position", "bottom") == "top":
                arriba = True
            else:
                abajo = True
        if arriba:
            bandas.append(Rect(x=0.0, y=0.0, w=1.0, h=CAPTION_BAND))
        if abajo:
            bandas.append(Rect(x=0.0, y=1.0 - CAPTION_BAND, w=1.0, h=CAPTION_BAND))
        return bandas

    def grid(self, at: float) -> list[float]:
        """Cuanto hay en cada tercio del video de debajo, en ese instante."""
        if self.focus_at is None:
            return []
        foco = self.focus_at(at)
        return list(getattr(foco, "grid", []) or []) if foco is not None else []

    def busy(
        self,
        start: float,
        end: float,
        *,
        timeline: tuple[float, float] | None = None,
    ) -> list[Rect]:
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
            pasos = max(2, int((end - start) / CURSOR_STEP) + 1)
            for i in range(pasos):
                t = start + (end - start) * i / (pasos - 1)
                punto = self.cursor.at(t)
                if punto is None:
                    continue
                cx, cy = punto
                zonas.append(Rect(
                    x=max(0.0, cx - CURSOR_HALO), y=max(0.0, cy - CURSOR_HALO),
                    w=CURSOR_HALO * 2, h=CURSOR_HALO * 2,
                ))

        if timeline is not None:
            zonas += self.caption_bands(*timeline)
            inicio_tl, fin_tl = timeline
            for puesto in self.overlays:
                if puesto.end < inicio_tl or puesto.start > fin_tl:
                    continue
                rect = getattr(puesto, "rect", None)
                if rect is not None and rect.w > 0 and rect.h > 0:
                    zonas.append(rect)

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


#: Cuanto pesa la ocupacion del video de debajo frente a tapar algo concreto.
#: Bajo a proposito: tapar lo que senalas es un fallo, y tapar una zona con
#: cosas es solo menos elegante. Sirve para desempatar, no para mandar.
GRID_WEIGHT = 0.25


def _grid_cost(rect: Rect, grid: list[float]) -> float:
    """Cuanto hay debajo de ese rectangulo, segun la rejilla de tercios."""
    if len(grid) != 9:
        return 0.0
    total = peso = 0.0
    for fila in range(3):
        for columna in range(3):
            celda = Rect(x=columna / 3, y=fila / 3, w=1 / 3, h=1 / 3)
            comun = _overlap(rect, celda)
            if comun > 0:
                total += grid[fila * 3 + columna] * comun
                peso += comun
    return total / peso if peso else 0.0


def place(
    base: Rect, avoid: list[Rect], grid: list[float] | None = None
) -> tuple[Rect, str]:
    """Elige donde va la ventanita, y devuelve tambien por que.

    Dos criterios, y en este orden: lo primero es **no tapar** lo que senalas,
    nombras o los subtitulos; despues, a igualdad, ponerla donde el video de
    debajo esta mas vacio. Lo segundo no manda sobre lo primero: taparle a
    alguien lo que esta explicando es un fallo, y ponerla sobre una zona con
    cosas es solo menos elegante.

    Se queda donde estaba salvo que moverse compense de verdad. Cambiar de
    esquina en cada insercion se ve nervioso.
    """
    rejilla = grid or []
    if not avoid and not rejilla:
        return base, ""

    def coste(rect: Rect) -> float:
        return (
            sum(_overlap(rect, z) for z in avoid)
            + GRID_WEIGHT * _grid_cost(rect, rejilla)
        )

    coste_base = coste(base)
    opciones = [
        (coste(rect), i, nombre, rect)
        for i, (nombre, rect) in enumerate(corners(base.w, base.h))
    ]
    mejor, _, nombre, rect = min(opciones, key=lambda o: (round(o[0], 5), o[1]))

    # El umbral es un 1% de pantalla tapada, que es lo que se empieza a notar.
    if coste_base <= mejor + 0.01:
        return base, ""
    return rect, nombre
