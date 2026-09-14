"""Decide donde insertar material de apoyo y que buscar.

El problema real no es conseguir b-roll, es saber **cuando merece la pena**.
Meterlo cada X segundos es lo que hace que un video automatico se note; hay que
ponerlo donde se esta nombrando algo concreto.

Para detectarlo se puntuan las palabras con TF-IDF sobre el propio transcript:
una palabra que aparece mucho en este tramo pero poco en el resto del video es
justo lo que ese tramo esta tratando. No hace falta ningun modelo de lenguaje,
no depende del idioma, y explica su decision sola ("aqui dices 'Google'").
"""

from __future__ import annotations

import math
from collections import Counter
from dataclasses import dataclass

from ..analysis.types import Transcript, Word
from ..assets.providers import BrollProvider, search_all, tokenize
from ..assets.types import Asset, AssetBundle, AssetQuery
from .edl import EDL, BrollEffect
from .styles import BrollRules

#: Duracion de la ventana en la que se busca de que se esta hablando.
WINDOW_SECONDS = 6.0
#: Puntuacion minima para considerar que se esta nombrando algo concreto.
MIN_TOPIC_SCORE = 0.35
#: Cuantas palabras forman la consulta.
QUERY_WORDS = 2


@dataclass
class TopicMoment:
    """Un momento del montaje donde se nombra algo concreto."""

    start: float
    end: float
    query: str
    score: float
    context: str


def _windows(transcript_words: list[Word], duration: float) -> list[tuple[float, float, list[str]]]:
    """Parte el montaje en ventanas con las palabras que caen en cada una."""
    if duration <= 0:
        return []

    salida: list[tuple[float, float, list[str]]] = []
    t = 0.0
    while t < duration:
        fin = min(duration, t + WINDOW_SECONDS)
        palabras = [w.text for w in transcript_words if t <= w.start < fin]
        salida.append((t, fin, tokenize(" ".join(palabras))))
        t = fin
    return salida


def find_topic_moments(
    edl: EDL, transcript: Transcript, *, min_score: float = MIN_TOPIC_SCORE
) -> list[TopicMoment]:
    """Localiza los momentos donde se nombra algo lo bastante distintivo."""
    # Las palabras se pasan a tiempo de montaje: es donde iran los efectos.
    en_montaje: list[Word] = []
    for w in transcript.words:
        t = edl.source_to_timeline(w.start)
        if t is None:
            continue
        en_montaje.append(Word(start=t, end=t + (w.end - w.start), text=w.text))
    en_montaje.sort(key=lambda w: w.start)

    ventanas = _windows(en_montaje, edl.duration)
    if len(ventanas) < 2:
        return []

    # Documento = ventana. Una palabra en pocas ventanas es distintiva.
    apariciones: Counter[str] = Counter()
    for _, _, palabras in ventanas:
        apariciones.update(set(palabras))
    total = len(ventanas)

    momentos: list[TopicMoment] = []
    for inicio, fin, palabras in ventanas:
        if not palabras:
            continue
        frecuencias = Counter(palabras)
        puntuaciones = {
            palabra: (n / len(palabras)) * math.log(total / apariciones[palabra])
            for palabra, n in frecuencias.items()
            if apariciones[palabra] > 0
        }
        if not puntuaciones:
            continue

        mejores = sorted(puntuaciones.items(), key=lambda kv: -kv[1])[:QUERY_WORDS]
        # Se normaliza por el maximo teorico para que el umbral sea comparable
        # entre videos de distinta longitud.
        maximo_teorico = math.log(total) if total > 1 else 1.0
        score = mejores[0][1] / maximo_teorico if maximo_teorico else 0.0

        if score < min_score:
            continue

        momentos.append(
            TopicMoment(
                start=round(inicio, 3),
                end=round(fin, 3),
                query=" ".join(p for p, _ in mejores),
                score=round(min(1.0, score), 3),
                context=" ".join(palabras[:20]),
            )
        )

    momentos.sort(key=lambda m: -m.score)
    return momentos


def _respects_spacing(candidato: float, puestos: list[float], min_gap: float) -> bool:
    return all(abs(candidato - otro) >= min_gap for otro in puestos)


def plan_broll(
    edl: EDL,
    transcript: Transcript | None,
    providers: list[BrollProvider],
    rules: BrollRules,
    bundle: AssetBundle,
) -> tuple[list[BrollEffect], list[BrollEffect]]:
    """Coloca material de apoyo donde se nombra algo concreto.

    Devuelve (elegidos, reservas), igual que el planner de zooms: las reservas
    quedan disponibles para el auto-balanceador.
    """
    if not rules.enabled or transcript is None or not providers or edl.duration <= 0:
        return [], []

    momentos = find_topic_moments(edl, transcript)
    if not momentos:
        return [], []

    maximo = max(0, int(rules.max_per_minute * edl.duration / 60.0))
    tope_cobertura = rules.max_coverage * edl.duration

    elegidos: list[BrollEffect] = []
    reservas: list[BrollEffect] = []
    instantes: list[float] = []
    cobertura = 0.0
    cortes = edl.cut_points()
    #: ver dos veces el mismo recurso canta mas que no poner ninguno
    usados: set[str] = set()

    for i, momento in enumerate(momentos):
        duracion = min(rules.default_seconds, momento.end - momento.start)
        if duracion < 1.0:
            continue

        inicio = momento.start
        fin = inicio + duracion
        if fin > edl.duration:
            continue
        if not _respects_spacing(inicio, instantes, rules.min_gap):
            continue

        # A diferencia de un zoom, un b-roll a pantalla completa NO tiene que
        # evitar los cortes: los tapa. En una guia muy recortada los cortes
        # caen cada pocos segundos, asi que exigir que no los cruce dejaria el
        # montaje sin un solo material de apoyo. En modo PiP si se nota, y ahi
        # si conviene esquivarlos.
        if rules.mode != "full" and any(inicio < c < fin for c in cortes):
            continue

        consulta = AssetQuery(
            text=momento.query,
            seconds=duracion,
            orientation="portrait" if edl.render.aspect < 1 else "landscape",
            at_timeline=inicio,
            context=momento.context,
        )
        resultados = search_all(providers, consulta)
        # Se prefiere material que no se haya usado ya; si todo esta usado, se
        # deja pasar este momento en vez de repetir.
        frescos = [r for r in resultados if r.id not in usados]
        if not frescos:
            continue

        asset: Asset = frescos[0]
        usados.add(asset.id)
        bundle.add(asset)

        efecto = BrollEffect(
            id=f"broll{i:03d}",
            start=round(inicio, 3),
            end=round(fin, 3),
            asset_id=asset.id,
            mode=rules.mode,
            query=momento.query,
            # Lo que aporta depende de lo concreto que sea lo que se nombra y de
            # lo bien que encaje el material encontrado.
            value_score=round(min(1.0, 0.45 + momento.score * 0.35 + asset.relevance * 0.2), 3),
            cost_weight=0.65 if rules.mode == "full" else 0.45,
            rationale=(
                f"material de apoyo en {inicio:.0f}s porque ahi hablas de "
                f"'{momento.query}' · {asset.reason}"
            ),
        )

        cabe = cobertura + duracion <= tope_cobertura
        if len(elegidos) < maximo and cabe:
            elegidos.append(efecto)
            instantes.append(inicio)
            cobertura += duracion
        elif len(reservas) < maximo + 3:
            reservas.append(efecto)
            instantes.append(inicio)

    elegidos.sort(key=lambda e: e.start)
    reservas.sort(key=lambda e: e.start)
    return elegidos, reservas
