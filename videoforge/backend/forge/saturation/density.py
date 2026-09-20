"""La senal de densidad D(t): cuanta carga visual soporta el espectador.

Es el nucleo del medidor. Tres ideas la sostienen:

1. **No todos los efectos pesan igual.** Un subtitulo acompana; un b-roll a
   pantalla completa sustituye lo que estabas viendo. El peso de cada tipo sale
   de `KIND_WEIGHT`, y se multiplica por el `cost_weight` que el planner le puso
   a ese efecto concreto.

2. **Los cortes tambien cargan.** Un corte es un evento cognitivo aunque no haya
   ningun efecto encima. Sin contarlos, un montaje a 40 cortes por minuto sin
   efectos daria "sub-editado", que es justo al reves de la verdad.

3. **La fatiga se arrastra.** Un golpe no se agota en su instante: deja resaca.
   Por eso la senal se convoluciona con un nucleo asimetrico que sube rapido y
   baja despacio, como la percepcion real.
"""

from __future__ import annotations

import numpy as np

from ..plan.edl import EDL, EffectKind

#: Muestras por segundo de la senal.
RATE = 4.0

#: Cuanto carga cada tipo de efecto, en relacion a los demas.
KIND_WEIGHT: dict[EffectKind, float] = {
    EffectKind.CAPTION: 0.45,
    EffectKind.PUNCH_IN: 1.00,
    EffectKind.KEN_BURNS: 0.35,
    EffectKind.BROLL: 1.25,
    EffectKind.TEXT_CARD: 1.00,
    EffectKind.CALLOUT: 0.80,
    EffectKind.LOWER_THIRD: 0.55,
    EffectKind.SFX: 0.85,
    # La musica y el color son ambiente: estan siempre y el ojo los normaliza.
    EffectKind.MUSIC: 0.15,
    EffectKind.GRADE: 0.10,
    EffectKind.TRANSITION: 1.10,
}

#: Carga instantanea de un corte.
CUT_IMPULSE = 0.9

#: Carga acumulada que se considera saturacion total (D = 1.0).
#:
#: Calibrado empiricamente contra las bandas de los estilos: con este valor, los
#: montajes que produce el planner para `tutorial`, `documentary` y
#: `gaming-hype` caen dentro de su banda, un montaje deliberadamente
#: sobrecargado se clava en 0.99, y `cinematic` aplicado a una guia hablada
#: queda por debajo, que es el diagnostico correcto. Tocarlo desplaza todas las
#: lecturas a la vez, asi que hay un test que lo fija.
DENSITY_REFERENCE = 1.0

#: Nucleo de fatiga, en segundos. Sube rapido y baja despacio.
ATTACK_SECONDS = 0.4
DECAY_SECONDS = 1.6


def _fatigue_kernel(rate: float = RATE) -> np.ndarray:
    """Nucleo asimetrico de ataque rapido y caida lenta."""
    n_attack = max(1, int(ATTACK_SECONDS * rate))
    n_decay = max(1, int(DECAY_SECONDS * rate))

    subida = np.linspace(0.0, 1.0, n_attack, endpoint=False)
    bajada = np.exp(-np.linspace(0.0, 3.0, n_decay))
    kernel = np.concatenate([subida, [1.0], bajada])
    return kernel / kernel.sum()


def raw_load(edl: EDL, rate: float = RATE) -> np.ndarray:
    """Carga bruta por muestra, antes de aplicar la fatiga."""
    n = max(1, int(round(edl.duration * rate)))
    carga = np.zeros(n, dtype=np.float32)

    for e in edl.effects:
        peso = KIND_WEIGHT.get(e.kind, 0.5) * max(0.0, e.cost_weight)
        if peso <= 0:
            continue
        a = max(0, int(e.start * rate))
        b = min(n, max(a + 1, int(e.end * rate)))
        carga[a:b] += peso

    for corte in edl.cut_points():
        i = min(n - 1, max(0, int(corte * rate)))
        carga[i] += CUT_IMPULSE

    return carga


def unclipped_curve(edl: EDL, rate: float = RATE) -> np.ndarray:
    """La misma senal, **sin recortar en 1.0**.

    La curva de lectura se recorta porque una escala 0..1 es lo que se puede
    pintar y comparar entre estilos. Pero recortar tira justo el dato que
    necesita quien tiene que arreglarlo: **cuanto** se pasa.

    Medido en la guia de Palworld con `gaming-hype`: el pico (percentil 95) daba
    1.000 clavado, es decir mas del 5% del montaje pegado al techo. El
    balanceador podaba un sonido, la carga bruta bajaba de 3.1 a 2.2 --- una
    mejora real --- y la curva recortada seguia dando 1.0 en ese tramo. Leia "no
    he mejorado nada", deshacia la poda, la descartaba, y repetia con la
    siguiente hasta agotar los 400 intentos: cero cambios con el exceso intacto.

    Asi que el medidor sigue leyendo la curva recortada, que esta calibrada y
    tiene su prueba, y el balanceador mira esta, que tiene pendiente.
    """
    carga = raw_load(edl, rate)
    if carga.size == 0:
        return carga

    kernel = _fatigue_kernel(rate)
    # 'same' mantiene la longitud; el desfase del nucleo asimetrico es de
    # decimas de segundo y no afecta a la lectura.
    suavizada = np.convolve(carga, kernel, mode="same")
    return (suavizada / DENSITY_REFERENCE).astype(np.float32)


def density_curve(edl: EDL, rate: float = RATE) -> np.ndarray:
    """Senal D(t) en 0..1, ya con la fatiga aplicada."""
    curva = unclipped_curve(edl, rate)
    if curva.size == 0:
        return curva
    return np.clip(curva, 0.0, 1.0).astype(np.float32)


def hot_windows(
    curve: np.ndarray, threshold: float, rate: float = RATE, min_seconds: float = 0.5
) -> list[tuple[float, float]]:
    """Tramos donde la densidad se pasa del umbral.

    Son las zonas que el auto-balanceador ataca primero: podar donde ya se esta
    por debajo no arregla nada y empobrece el montaje.
    """
    if curve.size == 0:
        return []

    por_encima = curve > threshold
    ventanas: list[tuple[float, float]] = []
    inicio: int | None = None

    for i, activo in enumerate(por_encima):
        if activo and inicio is None:
            inicio = i
        elif not activo and inicio is not None:
            ventanas.append((inicio / rate, i / rate))
            inicio = None
    if inicio is not None:
        ventanas.append((inicio / rate, len(curve) / rate))

    return [(round(a, 2), round(b, 2)) for a, b in ventanas if b - a >= min_seconds]


def heatmap(curve: np.ndarray, columns: int = 60) -> list[float]:
    """Resume la curva en pocas columnas, para pintarla en la UI o la terminal.

    Se usa el maximo de cada tramo y no la media: un pico de sobrecarga de medio
    segundo es justo lo que hay que ver, y promediando desaparece.
    """
    if curve.size == 0:
        return []
    if curve.size <= columns:
        return [round(float(v), 3) for v in curve]

    bordes = np.linspace(0, curve.size, columns + 1).astype(int)
    return [
        round(float(curve[a:b].max()), 3) if b > a else 0.0
        for a, b in zip(bordes, bordes[1:])
    ]
