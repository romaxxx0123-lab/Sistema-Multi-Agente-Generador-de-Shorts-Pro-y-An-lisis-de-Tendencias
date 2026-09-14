"""Que es este video: fusion de todas las senales en un solo perfil.

Ninguna senal decide sola, y es a proposito:

- el **texto en pantalla** dice literalmente el nombre del juego o del programa,
  pero solo si hay texto y Tesseract esta instalado;
- la **vision** reconoce la escena, pero es opcional y puede equivocarse;
- lo que se **dice** identifica el tema aunque no se vea nada distintivo;
- el **ritmo** (cuanta voz y cuanto movimiento) separa una guia de un gameplay
  sin necesitar ningun modelo.

El ritmo esta siempre disponible, asi que el perfil nunca sale vacio: en el
peor caso dice "esto es material hablado y quieto", que ya sirve para elegir
estilo. Cada conclusion lleva su fuente y su confianza.
"""

from __future__ import annotations

import math
from collections import Counter
from enum import Enum

from pydantic import BaseModel, Field

from ..analysis.ocr import ScreenText, recurring_terms
from ..analysis.types import Analysis
from ..analysis.vision import VisionTag
from ..assets.providers import tokenize

#: Por encima de esta proporcion de voz, el video es "hablado".
SPEECH_HEAVY = 0.42
#: Por encima de este movimiento medio, es "movido".
MOTION_HIGH = 0.35
#: Palabras clave que se extraen del transcript.
TOP_KEYWORDS = 12


class Domain(str, Enum):
    """De que tipo es el material."""

    TUTORIAL = "tutorial"
    GAMEPLAY_COMENTADO = "gameplay-comentado"
    GAMEPLAY = "gameplay"
    CHARLA = "charla"
    SILENCIOSO = "silencioso"
    DESCONOCIDO = "desconocido"


#: Estilo que mejor le sienta a cada dominio.
STYLE_FOR_DOMAIN = {
    Domain.TUTORIAL: "tutorial",
    Domain.GAMEPLAY_COMENTADO: "vlog",
    Domain.GAMEPLAY: "gaming-hype",
    Domain.CHARLA: "documentary",
    Domain.SILENCIOSO: "cinematic",
    Domain.DESCONOCIDO: "tutorial",
}


class Evidence(BaseModel):
    """Algo que se ha identificado, con de donde salio."""

    label: str
    confidence: float
    source: str  # "pantalla" | "vision" | "voz" | "ritmo"

    def describe(self) -> str:
        return f"{self.label} ({self.confidence:.0%}, {self.source})"


class ContentProfile(BaseModel):
    """Lo que sabemos de que trata el video."""

    domain: Domain = Domain.DESCONOCIDO
    topic: str = ""
    entities: list[Evidence] = Field(default_factory=list)
    keywords: list[str] = Field(default_factory=list)
    speech_ratio: float = 0.0
    motion_level: float = 0.0
    suggested_style: str = "tutorial"
    #: 0..1, cuanta confianza hay en la identificacion
    confidence: float = 0.0
    #: senales que no estaban disponibles, para poder decirlo al usuario
    missing: list[str] = Field(default_factory=list)

    def summary(self) -> str:
        partes = [f"{self.domain.value}"]
        if self.topic:
            partes.append(self.topic)
        partes.append(f"voz {self.speech_ratio:.0%}")
        partes.append(f"movimiento {self.motion_level:.0%}")
        return " · ".join(partes)

    def top_entities(self, n: int = 5) -> list[Evidence]:
        return sorted(self.entities, key=lambda e: -e.confidence)[:n]


def _classify(speech_ratio: float, motion_level: float, has_speech: bool) -> Domain:
    """Separa los tipos de material con las dos senales siempre disponibles.

    La presencia de voz se decide por la transcripcion y no por si el fichero
    declara pista de audio: un video puede traer pista muda, y al reves, lo que
    importa para clasificar es si alguien habla, que es justo lo que el
    transcript demuestra.
    """
    if not has_speech or speech_ratio < 0.05:
        return Domain.SILENCIOSO if motion_level < MOTION_HIGH else Domain.GAMEPLAY

    if speech_ratio >= SPEECH_HEAVY:
        # Habla mucho: la diferencia esta en si la imagen se mueve.
        return Domain.TUTORIAL if motion_level < MOTION_HIGH else Domain.GAMEPLAY_COMENTADO

    if motion_level >= MOTION_HIGH:
        return Domain.GAMEPLAY
    return Domain.CHARLA


def _keywords(analysis: Analysis) -> list[str]:
    """Palabras distintivas de lo que se dice.

    Se ponderan por rareza dentro del propio video: una palabra que sale en
    todas las frases no distingue nada, aunque sea la mas repetida.
    """
    if not analysis.transcript:
        return []

    frases = [tokenize(s.text) for s in analysis.transcript.segments]
    frases = [f for f in frases if f]
    if not frases:
        return []

    total_frases = len(frases)
    documentos: Counter[str] = Counter()
    for f in frases:
        documentos.update(set(f))
    global_counts: Counter[str] = Counter()
    for f in frases:
        global_counts.update(f)

    puntuaciones = {
        palabra: n * math.log(1 + total_frases / documentos[palabra])
        for palabra, n in global_counts.items()
        if documentos[palabra] > 0
    }
    return [p for p, _ in sorted(puntuaciones.items(), key=lambda kv: -kv[1])[:TOP_KEYWORDS]]


def build_profile(
    analysis: Analysis,
    *,
    screen_text: list[ScreenText] | None = None,
    vision_tags: list[VisionTag] | None = None,
) -> ContentProfile:
    """Fusiona todas las senales disponibles en un perfil."""
    motion_level = (
        float(sum(analysis.motion.flow) / len(analysis.motion.flow))
        if analysis.motion and analysis.motion.flow
        else 0.0
    )
    speech_ratio = analysis.speech_ratio
    hay_voz = bool(analysis.transcript and analysis.transcript.words)
    dominio = _classify(speech_ratio, motion_level, hay_voz)

    entidades: list[Evidence] = []
    faltan: list[str] = []

    # -- texto en pantalla: la senal mas literal que hay ---------------------
    if screen_text:
        lecturas = recurring_terms(screen_text)
        maximo = max((n for _, n in lecturas), default=1)
        for termino, apariciones in lecturas[:6]:
            entidades.append(
                Evidence(
                    label=termino,
                    # Cuantas mas veces aparece en pantalla, mas seguro es que
                    # forma parte de la interfaz y no es contenido de paso.
                    confidence=round(min(0.95, 0.45 + 0.5 * apariciones / max(maximo, 1)), 3),
                    source="pantalla",
                )
            )
    else:
        faltan.append("texto en pantalla (falta Tesseract o no hay texto)")

    # -- vision -------------------------------------------------------------
    if vision_tags:
        por_etiqueta: dict[str, list[float]] = {}
        for tag in vision_tags:
            por_etiqueta.setdefault(tag.label, []).append(tag.score)
        for etiqueta, scores in sorted(
            por_etiqueta.items(), key=lambda kv: -sum(kv[1])
        )[:4]:
            entidades.append(
                Evidence(
                    label=etiqueta,
                    confidence=round(min(0.95, sum(scores) / len(scores)), 3),
                    source="vision",
                )
            )
    else:
        faltan.append("reconocimiento visual (falta el modelo CLIP)")

    # -- voz ----------------------------------------------------------------
    keywords = _keywords(analysis)
    for palabra in keywords[:4]:
        entidades.append(Evidence(label=palabra, confidence=0.4, source="voz"))
    if not analysis.transcript:
        faltan.append("transcripcion (falta faster-whisper o no hay audio)")

    # El tema se toma de la fuente mas fiable que haya.
    tema = ""
    for fuente in ("pantalla", "vision", "voz"):
        candidatos = [e for e in entidades if e.source == fuente]
        if candidatos:
            tema = max(candidatos, key=lambda e: e.confidence).label
            break

    # La confianza global sube con el numero de fuentes que coinciden: el ritmo
    # siempre esta, asi que nunca es cero del todo.
    fuentes = {e.source for e in entidades}
    confianza = 0.25 + 0.25 * len(fuentes)
    if tema:
        mejor = max((e.confidence for e in entidades if e.label == tema), default=0.0)
        confianza = min(0.95, confianza * 0.6 + mejor * 0.4)

    return ContentProfile(
        domain=dominio,
        topic=tema,
        entities=entidades,
        keywords=keywords,
        speech_ratio=round(speech_ratio, 3),
        motion_level=round(motion_level, 3),
        suggested_style=STYLE_FOR_DOMAIN[dominio],
        confidence=round(min(0.95, confianza), 3),
        missing=faltan,
    )
