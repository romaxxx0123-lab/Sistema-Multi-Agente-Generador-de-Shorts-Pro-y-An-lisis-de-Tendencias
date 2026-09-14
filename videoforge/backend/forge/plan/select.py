"""Decide que trozos del original entran en el montaje.

Es la etapa de mas impacto en formato largo: en una guia de 20 minutos, quitar
el tiempo muerto y las muletillas recorta facilmente entre un 15% y un 25% sin
perder una sola idea.

La garantia que hace esto seguro es el cruce de dos senales independientes:

- la **deteccion de silencios** es acustica (mide dB), asi que puede marcar como
  silencio una palabra dicha en voz baja;
- la **transcripcion** es semantica y sabe donde hay palabras.

Antes de aplicar ningun recorte restamos los intervalos de las palabras reales,
de modo que **nunca se corta dentro de una palabra**. Las muletillas son la
unica excepcion, y solo si el estilo lo pide explicitamente.
"""

from __future__ import annotations

from dataclasses import dataclass

from ..analysis.types import Analysis
from .styles import PacingRules

#: Margen alrededor de una muletilla al quitarla, para no dejar un chasquido.
FILLER_PAD = 0.03


@dataclass
class Removal:
    """Un tramo que se va a quitar, con el motivo."""

    start: float
    end: float
    reason: str

    @property
    def duration(self) -> float:
        return max(0.0, self.end - self.start)


@dataclass
class Selection:
    """Resultado de la seleccion."""

    keeps: list[tuple[float, float]]
    removals: list[Removal]

    @property
    def kept_seconds(self) -> float:
        return sum(b - a for a, b in self.keeps)

    @property
    def removed_seconds(self) -> float:
        return sum(r.duration for r in self.removals)

    def reasons(self) -> dict[str, float]:
        """Segundos quitados por cada motivo."""
        out: dict[str, float] = {}
        for r in self.removals:
            out[r.reason] = out.get(r.reason, 0.0) + r.duration
        return out


def _merge(ranges: list[tuple[float, float]]) -> list[tuple[float, float]]:
    """Fusiona intervalos solapados o pegados."""
    if not ranges:
        return []
    ordered = sorted(ranges)
    out = [ordered[0]]
    for a, b in ordered[1:]:
        if a <= out[-1][1]:
            out[-1] = (out[-1][0], max(out[-1][1], b))
        else:
            out.append((a, b))
    return out


def _subtract(
    ranges: list[tuple[float, float]], holes: list[tuple[float, float]]
) -> list[tuple[float, float]]:
    """Quita `holes` de `ranges`. Es lo que protege las palabras."""
    result = list(ranges)
    for ha, hb in _merge(holes):
        nuevo: list[tuple[float, float]] = []
        for a, b in result:
            if hb <= a or ha >= b:
                nuevo.append((a, b))
                continue
            if a < ha:
                nuevo.append((a, ha))
            if hb < b:
                nuevo.append((hb, b))
        result = nuevo
    return [(a, b) for a, b in result if b > a]


def _complement(
    removed: list[tuple[float, float]], duration: float
) -> list[tuple[float, float]]:
    """Lo que queda del video tras quitar los tramos marcados."""
    keeps: list[tuple[float, float]] = []
    cursor = 0.0
    for a, b in _merge(removed):
        if a > cursor:
            keeps.append((cursor, a))
        cursor = max(cursor, b)
    if cursor < duration:
        keeps.append((cursor, duration))
    return [(a, b) for a, b in keeps if b > a]


def _silence_removals(analysis: Analysis, rules: PacingRules) -> list[Removal]:
    """Recorta los silencios largos, dejando una pausa natural."""
    if not analysis.audio or not rules.remove_silence:
        return []

    # Los dos margenes son distintos a proposito. Tras la ultima palabra la voz
    # se apaga sola y se puede recortar antes; en cambio el ataque de la
    # siguiente empieza antes de lo que marca el detector, asi que ahi hay que
    # dejar mas aire o se pierde la primera consonante.
    margen_cola = max(rules.silence_keep / 2.0, rules.tail_pad)
    margen_entrada = max(rules.silence_keep / 2.0, rules.speech_pad)

    out: list[Removal] = []
    for i, s in enumerate(analysis.audio.silences):
        if s.duration <= rules.silence_min:
            continue

        es_cabecera = s.start <= 0.05
        es_cola = s.end >= analysis.duration - 0.05

        if es_cabecera:
            # Al principio no hay voz anterior que proteger, asi que se recorta
            # DESDE CERO y se deja solo un respiro antes de la primera palabra.
            # Recortar el centro en vez del principio dejaba un clip minusculo
            # al arrancar, que la fusion de fragmentos cortos volvia a estirar:
            # el video seguia empezando con el mismo silencio.
            start = 0.0
            end = max(0.0, s.end - rules.head_keep)
        elif es_cola:
            # Al final, simetrico: se deja una cola corta y se tira el resto.
            start = s.start + margen_cola
            end = analysis.duration
        else:
            start = s.start + margen_cola
            end = s.end - margen_entrada

        if end > start:
            out.append(Removal(start=round(start, 3), end=round(end, 3), reason="silencio"))
    return out


def _filler_removals(analysis: Analysis, rules: PacingRules) -> list[Removal]:
    """Quita muletillas ('eh', 'osea', 'um'...)."""
    if not rules.remove_fillers or not analysis.transcript:
        return []

    from ..analysis.speech import find_fillers

    return [
        Removal(
            start=max(0.0, w.start - FILLER_PAD),
            end=w.end + FILLER_PAD,
            reason="muletilla",
        )
        for w in find_fillers(analysis.transcript)
    ]


def _protected_ranges(analysis: Analysis, rules: PacingRules) -> list[tuple[float, float]]:
    """Intervalos que no se pueden tocar: las palabras que si son contenido."""
    if not analysis.transcript:
        return []

    protegidas = set()
    if rules.remove_fillers:
        from ..analysis.speech import find_fillers

        protegidas = {(w.start, w.end) for w in find_fillers(analysis.transcript)}

    return [
        (w.start, w.end)
        for w in analysis.transcript.words
        if (w.start, w.end) not in protegidas
    ]


def _grow_short_keeps(
    keeps: list[tuple[float, float]], min_clip: float, duration: float
) -> list[tuple[float, float]]:
    """Evita microcortes: alarga los fragmentos demasiado breves.

    Un trozo de 0.3 s entre dos recortes no se sostiene en pantalla. En vez de
    tirarlo (perderiamos contenido) le devolvemos parte del hueco contiguo,
    que era silencio, hasta que alcance la duracion minima.
    """
    if not keeps:
        return keeps

    out: list[tuple[float, float]] = []
    for i, (a, b) in enumerate(keeps):
        if b - a >= min_clip:
            out.append((a, b))
            continue

        falta = min_clip - (b - a)
        limite_izq = out[-1][1] if out else 0.0
        limite_der = keeps[i + 1][0] if i + 1 < len(keeps) else duration

        margen_izq = max(0.0, a - limite_izq)
        margen_der = max(0.0, limite_der - b)

        toma_izq = min(margen_izq, falta / 2)
        toma_der = min(margen_der, falta - toma_izq)
        # Si por un lado no habia hueco, se intenta recuperar por el otro.
        toma_izq = min(margen_izq, falta - toma_der)

        nuevo = (max(limite_izq, a - toma_izq), min(limite_der, b + toma_der))
        if out and nuevo[0] <= out[-1][1]:
            out[-1] = (out[-1][0], max(out[-1][1], nuevo[1]))
        else:
            out.append(nuevo)

    return [(round(a, 3), round(b, 3)) for a, b in out if b > a]


def plan_selection(analysis: Analysis, rules: PacingRules) -> Selection:
    """Calcula que se conserva y que se quita, con el motivo de cada recorte."""
    duration = analysis.duration
    removals = _silence_removals(analysis, rules) + _filler_removals(analysis, rules)

    if not removals:
        return Selection(keeps=[(0.0, round(duration, 3))], removals=[])

    # Las palabras reales son intocables: restamos sus intervalos de lo que
    # ibamos a quitar. Aqui es donde la deteccion acustica deja de mandar.
    protegidas = _protected_ranges(analysis, rules)
    por_motivo: dict[str, list[tuple[float, float]]] = {}
    for r in removals:
        por_motivo.setdefault(r.reason, []).append((r.start, r.end))

    finales: list[Removal] = []
    for motivo, rangos in por_motivo.items():
        for a, b in _subtract(_merge(rangos), protegidas):
            finales.append(Removal(start=round(a, 3), end=round(b, 3), reason=motivo))

    keeps = _complement([(r.start, r.end) for r in finales], duration)
    keeps = _grow_short_keeps(keeps, rules.min_clip, duration)

    # Tras alargar fragmentos cortos, lo que de verdad se quito cambia: lo
    # recalculamos para que el informe al usuario sea exacto y no optimista.
    reales: list[Removal] = []
    for a, b in _complement(keeps, duration):
        motivo = next(
            (r.reason for r in finales if r.start < b and r.end > a), "silencio"
        )
        reales.append(Removal(start=round(a, 3), end=round(b, 3), reason=motivo))

    return Selection(keeps=keeps, removals=reales)
