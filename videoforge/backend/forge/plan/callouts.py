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

Y **nombrar no es senalar**: que digas una palabra que esta escrita en pantalla
solo prueba que ese objeto existe; decir "dale al boton de Guardar" pide que lo
miren. Los dos valen un recuadro, pero caben pocos por minuto, asi que cuando no
caben todos se quedan los que senalas -- antes se quedaban los primeros del
video, por el mero hecho de ir antes.
"""

from __future__ import annotations

from ..analysis.ocr import ScreenText, WordBox
from ..analysis.types import Transcript
from ..understand.on_screen import (
    bounds,
    boxes_for_word,
    is_pointable,
    normalize_word,
    reading_near,
)
from ..understand.speech_cues import CueKind, SpeechCue
from .edl import EDL, CalloutEffect, Rect
from .styles import CalloutRules, budget

#: Valor de un recuadro: alto en una guia, es de lo que mas se agradece.
CALLOUT_VALUE = 0.8
#: Y cuesta bastante: es un elemento grafico encima de la imagen.
CALLOUT_COST = 0.55


def _group_boxes(boxes: list[WordBox]) -> Rect:
    """Rectangulo que envuelve varias palabras contiguas, con su margen."""
    x, y, w, h = bounds(boxes)
    return Rect(x=x, y=y, w=w, h=h).clamped()


#: Cuanto sube el valor de un recuadro cuando ademas estas senalando ahi. Que
#: la palabra coincida con la pantalla dice que **existe** el objeto; que
#: ademas digas "dale al boton de guardar" dice que quieres que lo miren.
POINTED_BOOST = 1.35
#: Margen alrededor de la senal dentro del que se considera que es la misma.
POINT_WINDOW = 1.5


def _pointed_at(cues: list[SpeechCue], t: float, etiqueta: str) -> SpeechCue | None:
    """La senal de "mira aqui" que cae sobre ese instante, si la hay."""
    nombre = normalize_word(etiqueta)
    for c in cues or ():
        if c.kind is not CueKind.POINT:
            continue
        if not (c.start - POINT_WINDOW <= t <= c.end + POINT_WINDOW):
            continue
        # Si la senal ya sabe que se nombraba, tiene que ser esto mismo.
        if c.target and normalize_word(c.target) not in nombre:
            continue
        return c
    return None


def plan_callouts(
    edl: EDL,
    transcript: Transcript | None,
    screen_text: list[ScreenText],
    rules: CalloutRules,
    cues: list[SpeechCue] | None = None,
) -> tuple[list[CalloutEffect], list[CalloutEffect]]:
    """Coloca recuadros donde lo dicho coincide con lo escrito en pantalla.

    Con `cues` se distingue ademas **nombrar** de **senalar**. Que digas una
    palabra que esta escrita en pantalla solo prueba que el objeto existe;
    decir "dale al boton de guardar" pide que lo miren. Los dos valen, pero
    cuando no caben todos, los senalados van primero.

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
        dicha = normalize_word(palabra.text)
        if not is_pointable(dicha):
            continue

        lectura = reading_near(screen_text, palabra.start)
        if lectura is None:
            continue
        cajas = boxes_for_word(lectura, dicha)
        if not cajas:
            continue

        inicio = edl.source_to_timeline(palabra.start)
        if inicio is None:
            continue
        fin = min(edl.duration, inicio + rules.seconds)
        if fin - inicio < rules.seconds * 0.6:
            continue

        etiqueta = " ".join(c.text for c in cajas)
        senal = _pointed_at(cues, palabra.start, etiqueta)
        valor = CALLOUT_VALUE * (POINTED_BOOST if senal else 1.0)
        porque = (
            f'recuadro sobre "{etiqueta}": ahi lo senalas ("{senal.phrase}")'
            if senal else
            f'recuadro sobre "{etiqueta}": ahi lo estas nombrando'
        )
        candidatos.append(
            CalloutEffect(
                id=f"call{len(candidatos):03d}",
                start=round(inicio, 3),
                end=round(fin, 3),
                rect=_group_boxes(cajas),
                label=etiqueta,
                shape="box",
                value_score=round(min(1.0, valor), 3),
                cost_weight=CALLOUT_COST,
                rationale=porque,
            )
        )

    # Se reparten con separacion: dos recuadros seguidos cansan mas que ayudan.
    # Se recorren por valor y no por orden de aparicion, que es lo que hace que
    # al llenarse el cupo sobrevivan los que senalas y no simplemente los
    # primeros del video.
    elegidos: list[CalloutEffect] = []
    reservas: list[CalloutEffect] = []
    for efecto in sorted(candidatos, key=lambda e: (-e.value_score, e.start)):
        cabe = len(elegidos) < maximo
        separado = all(
            efecto.start - e.end >= rules.min_gap
            or e.start - efecto.end >= rules.min_gap
            for e in elegidos
        )
        if cabe and separado:
            elegidos.append(efecto)
        else:
            reservas.append(efecto)
    elegidos.sort(key=lambda e: e.start)
    reservas.sort(key=lambda e: e.start)
    return elegidos, reservas
