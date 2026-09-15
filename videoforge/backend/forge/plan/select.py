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


#: Nombre en ingles del papel, que es como se llaman los campos de RoleRules.
_CAMPO_POR_PAPEL = {
    "intro": "intro", "paso": "step", "aviso": "warning", "consejo": "tip",
    "resumen": "recap", "cierre": "outro", "digresion": "aside", "cuerpo": "body",
}


def _role_factor(segments, t: float, rules: PacingRules) -> tuple[float, str]:
    """Cuanto apretar el recorte en ese instante, y como se llama esa parte."""
    if not segments:
        return 1.0, ""
    from ..understand.segments import role_at

    papel = role_at(segments, t).value
    return rules.roles.factor(_CAMPO_POR_PAPEL.get(papel, "body")), papel


def _silence_removals(
    analysis: Analysis, rules: PacingRules, segments=None
) -> list[Removal]:
    """Recorta los silencios largos, dejando una pausa natural.

    Cuanto se recorta depende de **que parte del video** sea. Una pausa de medio
    segundo en mitad de un aviso es parte de como se dice ("...sin esto, no
    funciona"); la misma pausa en la intro es tiempo que nadie va a ver.
    """
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
        factor, papel = _role_factor(segments, (s.start + s.end) / 2, rules)
        if factor <= 0:
            # Factor cero = esta parte no se toca en absoluto.
            continue
        if s.duration <= rules.silence_min / factor:
            continue

        # El papel tambien decide **cuanto** se deja, no solo si se recorta.
        # Solo se aprieta por el lado seguro: la cola de una palabra se apaga
        # sola y recortarla no se nota, mientras que el margen de ENTRADA
        # protege la primera consonante de la palabra siguiente y ese no se
        # toca nunca, sea cual sea la parte.
        cola = margen_cola / factor
        cabecera = rules.head_keep / factor

        es_cabecera = s.start <= 0.05
        es_cola = s.end >= analysis.duration - 0.05

        if es_cabecera:
            # Al principio no hay voz anterior que proteger, asi que se recorta
            # DESDE CERO y se deja solo un respiro antes de la primera palabra.
            # Recortar el centro en vez del principio dejaba un clip minusculo
            # al arrancar, que la fusion de fragmentos cortos volvia a estirar:
            # el video seguia empezando con el mismo silencio.
            start = 0.0
            end = max(0.0, s.end - cabecera)
        elif es_cola:
            # Al final, simetrico: se deja una cola corta y se tira el resto.
            start = s.start + cola
            end = analysis.duration
        else:
            start = s.start + cola
            end = s.end - margen_entrada

        if end > start:
            motivo = f"silencio en {papel}" if papel and papel != "cuerpo" else "silencio"
            out.append(Removal(start=round(start, 3), end=round(end, 3), reason=motivo))
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


def _retake_removals(analysis: Analysis, rules: PacingRules) -> list[Removal]:
    """Quita la toma que tu mismo das por mala.

    Cuando dices "no, perdon" o "mejor dicho", lo que sobra es lo de **antes**.
    Es de lo poco que se puede quitar entero sin perder contenido, porque lo
    estas diciendo tu: eso no valia.

    Va con las mismas reglas que las muletillas (`remove_fillers`), porque es el
    mismo permiso: quitar palabras dichas, no solo silencio.
    """
    if not rules.remove_fillers or not analysis.cues:
        return []

    from ..understand.speech_cues import CueKind

    return [
        Removal(start=round(c.start, 3), end=round(c.end, 3), reason="toma fallida")
        for c in analysis.cues
        if c.kind is CueKind.RETAKE
    ]


def _protected_ranges(analysis: Analysis, rules: PacingRules) -> list[tuple[float, float]]:
    """Intervalos que no se pueden tocar: las palabras que si son contenido."""
    if not analysis.transcript:
        return []

    protegidas = set()
    tomas_malas: list[tuple[float, float]] = []
    if rules.remove_fillers:
        from ..analysis.speech import find_fillers
        from ..understand.speech_cues import CueKind

        protegidas = {(w.start, w.end) for w in find_fillers(analysis.transcript)}
        # Las palabras de una toma que tu mismo das por mala tampoco se
        # protegen. Si no, el recorte se anula solo: se marca para quitar y
        # acto seguido se devuelve entero por ser "contenido".
        tomas_malas = [
            (c.start, c.end) for c in analysis.cues if c.kind is CueKind.RETAKE
        ]

    return [
        (w.start, w.end)
        for w in analysis.transcript.words
        if (w.start, w.end) not in protegidas
        and not any(a <= w.start and w.end <= b for a, b in tomas_malas)
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


def plan_selection(
    analysis: Analysis, rules: PacingRules, segments=None
) -> Selection:
    """Calcula que se conserva y que se quita, con el motivo de cada recorte.

    Con `segments` (los tramos narrativos que salen de lo que se dice) el
    recorte deja de ser uniforme: aprieta en la intro, en el cierre y en las
    digresiones, y no toca los avisos.
    """
    duration = analysis.duration
    removals = (
        _silence_removals(analysis, rules, segments)
        + _filler_removals(analysis, rules)
        + _retake_removals(analysis, rules)
    )

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
