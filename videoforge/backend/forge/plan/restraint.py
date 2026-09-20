"""Que cada efecto se justifique, y que el quinto no valga lo que el primero.

Tres frenos, y el primero es el que de verdad evita la sobreedicion: **un efecto
tiene que justificarse, no ocupar un cupo**.

Cada planner elige los mejores N candidatos que le permite su cupo, y ahi esta
el fallo de fondo: si el cupo da para trece zooms, salen trece zooms, aunque el
decimotercero valga 0.14 sobre 1. Medido en una guia de 20 minutos con
`tutorial`: los zooms iban de 0.97 a **0.14**, y cuatro de los trece estaban por
debajo de 0.25. Nadie los pidio; estaban ahi porque quedaba sitio.

Peor todavia: habia efectos cuyo valor era **una constante**. Las veintidos
transiciones valian 0.35 **todas**, y sin embargo el planner sabia
perfectamente cuales marcaban el principio de un capitulo y cuales solo caian
donde la imagen ya cambiaba sola. Sabia la diferencia y la tiraba. Ahora una
transicion de capitulo vale 0.60 y una decorativa 0.28, y el suelo se lleva las
segundas: a veces la edicion no hace falta, y no hacerla es la decision.


Cada planner tiene un cupo: "hasta doce zooms por minuto", "hasta diez efectos
de sonido por minuto". Y cumpliendolo al pie de la letra sale esto, medido
sobre una guia de 20 minutos con el estilo `gaming-hype`:

    310 efectos visibles en 13.2 min
    158 zooms + 132 sonidos + 20 transiciones
    el 45% empieza a menos de UN segundo del anterior
    racha de ONCE zooms seguidos

Ninguna regla se ha saltado: el cupo es de doce por minuto y se han puesto doce
por minuto. El problema es que **un cupo dice cuantos, y no dice como**. Y asi
es como una edicion automatica se delata: no por hacer cosas raras, sino por
hacer la misma cosa una y otra vez hasta que deja de significar nada. Un zoom
subraya; cinco zooms seguidos son el fondo de pantalla.

Lo que falta es lo que un montador lleva puesto sin pensarlo: **acabo de hacer
esto**. Y son dos cosas distintas:

1. **La racha.** Diez zooms seguidos sin nada por medio no es un estilo
   nervioso, es un bucle. Un montador alterna: subraya, corta, ensena, subraya.
   Aqui una racha se adelgaza quedandose con los que mas aportan, y los demas se
   van a reservas. Esto **no baja el ritmo del estilo**, lo obliga a variar.

2. **El exceso sobre lo que el propio estilo pidio.** Cada uso deja una huella
   que se apaga con la constante de tiempo que el estilo declara: si quiere doce
   zooms por minuto, usarlos mucho mas seguido que cada cinco segundos es
   repetirse *para ese estilo*. Asi `documentary` sigue siendo sobrio y
   `gaming-hype` sigue siendo nervioso, pero ninguno se queda en bucle.

Lo que no pasa el corte no se borra: **se manda a reservas**. Si luego el
montaje se queda corto, el auto-balanceador puede recuperarlo -- y lo hara en el
tramo que este mas vacio, que es justo donde repetirse no cansa.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from .edl import EDL, EffectKind

#: Efectos que no ocupan una capa de pantalla: no se ven como una cosa encima
#: del video, son el video. Tiene que coincidir con `saturation.metrics.
#: AMBIENT_KINDS`, y hay una prueba que lo comprueba --- no se puede importar de
#: alli porque `saturation` importa de `plan`, no al reves.
AMBIENT_KINDS = (EffectKind.GRADE, EffectKind.MUSIC)

#: Cuantas capas se aceptan si el estilo no dice nada. Tres es lo que cabe sin
#: que el video sea el fondo de los adornos: lo que se dice, una cosa senalada y
#: una de contexto.
DEFAULT_MAX_LAYERS = 3

#: Ritmo al que el estilo usa cada recurso, si no lo dice en otro sitio. Se usa
#: solo como respaldo: casi todos salen de los ajustes del estilo.
DEFAULT_RATE = 4.0

#: Cuanto descuenta la fatiga como maximo. A 0.7, un recurso muy repetido
#: conserva el 30% de su valor: sigue pudiendo entrar si era buenisimo.
FATIGUE_WEIGHT = 0.7
#: Por debajo de este valor efectivo, el efecto pasa a reservas. Es el mismo
#: orden de magnitud que el valor de un efecto de relleno.
VALUE_FLOOR = 0.42

#: Lo que tiene que valer un efecto para entrar en el montaje, con el
#: deslizador de intensidad en el medio. No es un tope de cuantos: es un suelo
#: de **por que**. Un efecto que no llega aqui no es que sobre por carga, es que
#: no tiene nada que decir.
MIN_JUSTIFIED = 0.30


def justification_bar(intensity: int) -> float:
    """Cuanto hay que justificar un efecto, segun la intensidad que pidas.

    Es lo que el deslizador deberia haber significado siempre: no "pon mas
    cosas", sino **cuanto te tengo que convencer para ponerlas**. A 0 hay que
    convencer mucho (0.45) y el montaje queda limpio; a 100 casi nada (0.15) y
    entra hasta lo decorativo.
    """
    i = max(0, min(100, intensity))
    return round(MIN_JUSTIFIED * (1.5 - i / 100.0), 4)


#: Los subtitulos y el color no cansan: van de principio a fin por definicion.
NEVER_TIRED = (EffectKind.CAPTION, EffectKind.GRADE, EffectKind.MUSIC)

#: Tope de retiradas del freno de capas, por seguridad: cada vuelta quita
#: uno, asi que con esto sobra para cualquier montaje sensato.
MAX_CAP_PASSES = 200

#: Cuantos usos seguidos del mismo recurso, sin nada por medio, se aceptan
#: antes de considerarlo un bucle. Dos seguidos los hace cualquiera; a partir
#: del cuarto ya no subraya nada, es el fondo.
RUN_LIMIT = 3
#: Y a que distancia deja de contar como racha. Es un numero perceptivo y no
#: del estilo: lo que convierte tres usos en un bucle es que el espectador
#: todavia se acuerde del anterior. Diez transiciones repartidas a una por
#: minuto no son una racha aunque no haya nada entre ellas.
RUN_SECONDS = 20.0


def rate_for(kind: EffectKind, style) -> float:
    """Cada cuanto pide el estilo ese recurso, en usos por minuto."""
    if kind in (EffectKind.PUNCH_IN, EffectKind.KEN_BURNS):
        return float(getattr(style.emphasis, "max_punch_per_minute", DEFAULT_RATE))
    if kind is EffectKind.SFX:
        return float(getattr(style.sfx, "max_per_minute", DEFAULT_RATE))
    if kind is EffectKind.BROLL:
        return float(getattr(style.broll, "max_per_minute", DEFAULT_RATE))
    if kind is EffectKind.CALLOUT:
        return float(getattr(style.callouts, "max_per_minute", DEFAULT_RATE))
    return DEFAULT_RATE


def fatigue(previous: list[float], at: float, rate: float) -> float:
    """Cuanto se ha gastado ese recurso justo antes de este momento.

    Suma de huellas que se apagan, con la constante de tiempo que pide el
    estilo. Usandolo exactamente al ritmo pedido queda alrededor de 0.6; usandolo
    al doble de seguido, por encima de 1.5.
    """
    if rate <= 0:
        return 0.0
    tau = 60.0 / rate
    return sum(math.exp(-(at - t) / tau) for t in previous if t < at)


@dataclass(frozen=True)
class Tired:
    """Un efecto que se manda a reservas por repetido."""

    effect_id: str
    kind: str
    start: float
    fatigue: float
    value: float


def runs(efectos: list) -> list[list]:
    """Agrupa los usos seguidos del mismo recurso, sin nada por medio.

    "Seguidos" es en el montaje, no en la lista de su tipo: si entre dos zooms
    hay un sonido y una transicion, el ojo ha visto otra cosa por medio y la
    racha se rompe. Y "cerca" (`RUN_SECONDS`): dos usos a un minuto no son una
    racha por mucho que no haya nada entre ellos.

    Esta es **la** definicion de racha del proyecto: la usa tanto el freno de
    aqui como la metrica de repeticion del medidor de saturacion, para que lo
    que se corrige y lo que se mide sean la misma cosa.
    """
    grupos: list[list] = []
    actual: list = []
    for efecto in efectos:
        if (
            actual
            and efecto.kind is actual[-1].kind
            and efecto.start - actual[-1].start <= RUN_SECONDS
        ):
            actual.append(efecto)
            continue
        if len(actual) > 1:
            grupos.append(actual)
        actual = [efecto]
    if len(actual) > 1:
        grupos.append(actual)
    return grupos


def _layers_at(efectos: list, at: float) -> list:
    """Lo que se ve encima del video en un instante."""
    return [
        e for e in efectos
        if e.kind not in AMBIENT_KINDS and e.start <= at < e.end
    ]


def _worst_layer(encima: list):
    """De lo que hay apilado, lo que menos falta hace.

    Los subtitulos no cuentan: son lo que se esta diciendo, no un adorno, y si
    hay que elegir entre el texto de la frase y el recuadro que la ilustra, se
    va el recuadro. Lo demas se ordena por lo que aporta frente a lo que pesa,
    igual que en el balanceador.
    """
    quitables = [
        e for e in encima
        if e.kind not in NEVER_TIRED and not getattr(e, "locked", False)
    ]
    if not quitables:
        return None
    return min(quitables, key=lambda e: (e.value_score / max(e.cost_weight, 1e-6), -e.cost_weight))


def cap_layers(edl: EDL, style) -> tuple[list[Tired], list[str]]:
    """Que no haya mas cosas encima del video de las que el estilo admite.

    Los dos frenos anteriores miran **cada recurso por separado**: que un zoom se
    justifique, que no salgan cinco zooms seguidos. Ninguno de los dos ve lo que
    pasa cuando cinco planners distintos aciertan en el mismo segundo. Medido en
    la guia de Palworld de veinte minutos, con el estilo `palworld` --- que
    declara un maximo de tres capas --- en el segundo 282 habia:

        caption      280.05-282.41    lo que estas diciendo
        punch_in     282.13-283.93    un acercamiento
        callout      281.60-283.40    un recuadro sobre lo que nombras
        lower_third  281.60-283.40    y su etiqueta

    Cuatro cosas a la vez, en doce instantes del montaje. Cada una estaba bien
    puesta por su cuenta y ninguna regla se salto: es que nadie contaba el total.
    Y el medidor lo veia (`max_layers = 4` sobre una banda de 0 a 3) pero lo
    decia **despues**, cuando ya estaba hecho.

    Se retira lo que menos aporta hasta entrar en el tope, empezando por el
    instante mas apilado. Como en los otros dos frenos, lo retirado va a
    reservas: si luego hace falta algo en un tramo vacio, sigue disponible.
    """
    banda = style.band("max_layers")
    tope = int(banda.hi) if banda and banda.hi >= 1 else DEFAULT_MAX_LAYERS
    if tope < 1:
        tope = DEFAULT_MAX_LAYERS

    cansados: list[Tired] = []
    # Los instantes donde algo empieza o acaba son los unicos donde el numero de
    # capas puede cambiar: basta mirar ahi y no muestrear el video entero.
    for _ in range(MAX_CAP_PASSES):
        efectos = list(edl.effects)
        instantes = sorted({e.start for e in efectos if e.kind not in AMBIENT_KINDS})
        peor_at, peor_n = None, 0
        for at in instantes:
            n = len(_layers_at(efectos, at))
            if n > peor_n:
                peor_at, peor_n = at, n
        if peor_at is None or peor_n <= tope:
            break

        victima = _worst_layer(_layers_at(efectos, peor_at))
        if victima is None:
            # Solo quedan subtitulos apilados: no es sobreedicion, es que hablas
            # seguido. No se toca.
            break

        cansados.append(Tired(
            effect_id=victima.id, kind=victima.kind.value,
            start=round(victima.start, 3), fatigue=float(peor_n),
            value=round(victima.value_score, 3),
        ))
        edl.demote_effect(victima.id)

    notas: list[str] = []
    if cansados:
        por_tipo: dict[str, int] = {}
        for c in cansados:
            por_tipo[c.kind] = por_tipo.get(c.kind, 0) + 1
        detalle = ", ".join(f"{n} {k}" for k, n in sorted(por_tipo.items()))
        notas.append(
            f"{len(cansados)} efectos retirados por apilarse: el estilo admite "
            f"{tope} cosas encima del video a la vez ({detalle})."
        )
    return cansados, notas


def apply_restraint(edl: EDL, style) -> tuple[list[Tired], list[str]]:
    """Manda a reservas lo que solo esta ahi porque tocaba.

    Devuelve (lo retirado, notas para el informe). Modifica el EDL en el sitio.
    """
    visibles = [
        e for e in sorted(edl.effects, key=lambda e: (e.start, e.id))
        if e.kind not in NEVER_TIRED and not getattr(e, "locked", False)
    ]

    usados: dict[EffectKind, list[float]] = {}
    cansados: list[Tired] = []

    # 0. Lo que no se justifica no entra, aunque quedara cupo de sobra. Este es
    #    el freno que evita la sobreedicion: los demas solo reparten.
    suelo = justification_bar(edl.intensity)
    injustificados: set[str] = set()
    for efecto in visibles:
        if efecto.value_score < suelo:
            injustificados.add(efecto.id)
            cansados.append(Tired(
                effect_id=efecto.id, kind=efecto.kind.value,
                start=round(efecto.start, 3), fatigue=0.0,
                value=round(efecto.value_score, 3),
            ))
    visibles = [e for e in visibles if e.id not in injustificados]

    # 1. Las rachas: se adelgazan quedandose con lo que mas aporta.
    en_bucle: set[str] = set()
    for grupo in runs(visibles):
        if len(grupo) <= RUN_LIMIT:
            continue
        mejores = sorted(grupo, key=lambda e: -e.value_score)[:RUN_LIMIT]
        conservados = {e.id for e in mejores}
        for efecto in grupo:
            if efecto.id not in conservados:
                en_bucle.add(efecto.id)
                cansados.append(Tired(
                    effect_id=efecto.id, kind=efecto.kind.value,
                    start=round(efecto.start, 3), fatigue=float(len(grupo)),
                    value=round(efecto.value_score, 3),
                ))

    # 2. Y el exceso sobre el ritmo que el propio estilo pidio.
    for efecto in visibles:
        if efecto.id in en_bucle:
            continue

        ritmo = rate_for(efecto.kind, style)
        carga = fatigue(usados.get(efecto.kind, []), efecto.start, ritmo)
        # Hasta el ritmo que pide el estilo no se descuenta nada: el estilo
        # manda, y lo que se persigue es el exceso **sobre lo que pidio**.
        exceso = max(0.0, carga - 1.0)
        valor = efecto.value_score / (1.0 + FATIGUE_WEIGHT * exceso)

        if exceso > 0 and valor < VALUE_FLOOR:
            cansados.append(Tired(
                effect_id=efecto.id, kind=efecto.kind.value,
                start=round(efecto.start, 3), fatigue=round(carga, 2),
                value=round(valor, 3),
            ))
            continue

        usados.setdefault(efecto.kind, []).append(efecto.start)

    for t in cansados:
        edl.demote_effect(t.effect_id)

    notas: list[str] = []
    if cansados:
        por_tipo: dict[str, int] = {}
        for t in cansados:
            por_tipo[t.kind] = por_tipo.get(t.kind, 0) + 1
        detalle = ", ".join(f"{n} {k}" for k, n in sorted(por_tipo.items()))
        partes: list[str] = []
        if injustificados:
            partes.append(f"{len(injustificados)} por no justificarse")
        if en_bucle:
            partes.append(f"{len(en_bucle)} por venir en racha")
        resto = len(cansados) - len(injustificados) - len(en_bucle)
        if resto > 0:
            partes.append(f"{resto} por repetirse de mas")
        notas.append(
            f"{len(cansados)} efectos se quedan fuera ({', '.join(partes)}): "
            f"{detalle}. A veces no editar es la decision."
        )
    return cansados, notas
