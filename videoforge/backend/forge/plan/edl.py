"""El EDL: la decision de montaje, en un JSON tipado, inspeccionable y editable.

La separacion importante de todo el proyecto esta aqui:

- **`timeline`** son los cortes: que trozos del original entran, en que orden y a
  que velocidad. Solo esto determina la duracion del resultado.
- **`effects`** es todo lo que se superpone encima: subtitulos, zooms, b-roll,
  rotulos, SFX, transiciones, color.

De ahi sale un invariante del que depende el motor de saturacion: **quitar o
anadir efectos nunca cambia la duracion del video**. El auto-balanceador puede
podar todo lo que quiera sin descuadrar el montaje.

Cada efecto ademas carga su propia justificacion (`value_score`, `cost_weight`,
`rationale`), que es lo que permite decidir *cual* sobra y explicarselo al
usuario en vez de recortar a ciegas.
"""

from __future__ import annotations

from enum import Enum
from pathlib import Path
from typing import Annotated, Literal, Union

from pydantic import BaseModel, Field

from ..analysis.types import Word

#: Subir esto invalida EDLs guardados con un formato anterior.
EDL_VERSION = 1


class Rect(BaseModel):
    """Rectangulo en coordenadas normalizadas 0..1 sobre el fotograma."""

    x: float = 0.0
    y: float = 0.0
    w: float = 1.0
    h: float = 1.0

    def clamped(self) -> "Rect":
        """Devuelve el rectangulo metido a la fuerza dentro del fotograma."""
        w = min(1.0, max(0.01, self.w))
        h = min(1.0, max(0.01, self.h))
        x = min(1.0 - w, max(0.0, self.x))
        y = min(1.0 - h, max(0.0, self.y))
        return Rect(x=x, y=y, w=w, h=h)

    @property
    def zoom(self) -> float:
        """Cuanto amplia respecto al fotograma completo (1.0 = sin zoom)."""
        return 1.0 / max(self.w, 1e-6)

    @property
    def center(self) -> tuple[float, float]:
        return self.x + self.w / 2, self.y + self.h / 2

    @classmethod
    def centered(cls, cx: float, cy: float, zoom: float) -> "Rect":
        """Rectangulo centrado en (cx, cy) con el zoom dado."""
        w = 1.0 / max(zoom, 1.0)
        return cls(x=cx - w / 2, y=cy - w / 2 * 1.0, w=w, h=w).clamped()


class Clip(BaseModel):
    """Un trozo del video original colocado en la linea de tiempo."""

    id: str
    source_start: float
    source_end: float
    #: >1 acelera, <1 ralentiza. El audio mantiene el tono (rubberband).
    speed: float = 1.0
    #: por que se conservo este trozo, para poder explicar el montaje
    reason: str = ""

    @property
    def source_duration(self) -> float:
        return max(0.0, self.source_end - self.source_start)

    @property
    def duration(self) -> float:
        """Lo que ocupa en la linea de tiempo, ya aplicada la velocidad."""
        return self.source_duration / max(self.speed, 1e-6)


class EffectKind(str, Enum):
    CAPTION = "caption"
    PUNCH_IN = "punch_in"
    KEN_BURNS = "ken_burns"
    BROLL = "broll"
    TEXT_CARD = "text_card"
    CALLOUT = "callout"
    LOWER_THIRD = "lower_third"
    SFX = "sfx"
    MUSIC = "music"
    TRANSITION = "transition"
    GRADE = "grade"


class BaseEffect(BaseModel):
    """Campos comunes a todo lo que se superpone al montaje.

    Los tiempos son SIEMPRE de la linea de tiempo montada, no del original.
    """

    id: str
    start: float
    end: float
    #: cuanto aporta (0..1): relevancia, oportunidad, novedad
    value_score: float = 0.5
    #: cuanta carga visual anade (0..1): lo que penaliza la saturacion
    cost_weight: float = 0.5
    #: frase explicando por que esta aqui; es lo que ve el usuario
    rationale: str = ""
    #: si el usuario lo fija, el auto-balanceador no puede quitarlo
    locked: bool = False

    @property
    def duration(self) -> float:
        return max(0.0, self.end - self.start)

    @property
    def efficiency(self) -> float:
        """Valor por unidad de carga: el criterio para podar."""
        return self.value_score / max(self.cost_weight, 1e-6)

    def overlaps(self, start: float, end: float) -> bool:
        return self.start < end and self.end > start


class CaptionEffect(BaseEffect):
    kind: Literal[EffectKind.CAPTION] = EffectKind.CAPTION
    words: list[Word] = Field(default_factory=list)
    style: str = "default"
    #: "bottom", "center", "top"; el planner lo elige esquivando lo importante
    position: str = "bottom"

    @property
    def text(self) -> str:
        return " ".join(w.text for w in self.words)


class PunchInEffect(BaseEffect):
    """Zoom de enfasis hacia una zona concreta."""

    kind: Literal[EffectKind.PUNCH_IN] = EffectKind.PUNCH_IN
    rect: Rect = Field(default_factory=Rect)
    #: segundos que tarda en entrar el zoom
    ease_seconds: float = 0.3


class KenBurnsEffect(BaseEffect):
    """Deriva lenta para que un plano estatico no parezca congelado."""

    kind: Literal[EffectKind.KEN_BURNS] = EffectKind.KEN_BURNS
    rect_start: Rect = Field(default_factory=Rect)
    rect_end: Rect = Field(default_factory=Rect)


class BrollEffect(BaseEffect):
    """Imagen o video insertado sobre el material base."""

    kind: Literal[EffectKind.BROLL] = EffectKind.BROLL
    asset_id: str = ""
    #: "full" tapa el fotograma; "pip"/"corner" lo dejan a la vista
    mode: str = "full"
    rect: Rect = Field(default_factory=Rect)
    opacity: float = 1.0
    #: consulta con la que se busco, para poder explicarlo y re-buscar
    query: str = ""


class TextCardEffect(BaseEffect):
    """Rotulo de capitulo o titular a pantalla."""

    kind: Literal[EffectKind.TEXT_CARD] = EffectKind.TEXT_CARD
    text: str = ""
    subtitle: str = ""
    style: str = "default"


class CalloutEffect(BaseEffect):
    """Recuadro o flecha senalando algo en pantalla."""

    kind: Literal[EffectKind.CALLOUT] = EffectKind.CALLOUT
    rect: Rect = Field(default_factory=Rect)
    label: str = ""
    shape: str = "box"


class LowerThirdEffect(BaseEffect):
    kind: Literal[EffectKind.LOWER_THIRD] = EffectKind.LOWER_THIRD
    title: str = ""
    subtitle: str = ""


class SfxEffect(BaseEffect):
    kind: Literal[EffectKind.SFX] = EffectKind.SFX
    asset_id: str = ""
    gain_db: float = -6.0


class MusicEffect(BaseEffect):
    kind: Literal[EffectKind.MUSIC] = EffectKind.MUSIC
    asset_id: str = ""
    gain_db: float = -18.0
    #: agachar la musica bajo la voz con sidechain
    duck: bool = True


class TransitionEffect(BaseEffect):
    kind: Literal[EffectKind.TRANSITION] = EffectKind.TRANSITION
    #: "cut" no gasta saturacion; el resto si
    transition: str = "fade"


class GradeEffect(BaseEffect):
    kind: Literal[EffectKind.GRADE] = EffectKind.GRADE
    preset: str = "neutral"
    #: 0..1; a 0 no se nota, a 1 es agresivo
    intensity: float = 0.5


Effect = Annotated[
    Union[
        CaptionEffect,
        PunchInEffect,
        KenBurnsEffect,
        BrollEffect,
        TextCardEffect,
        CalloutEffect,
        LowerThirdEffect,
        SfxEffect,
        MusicEffect,
        TransitionEffect,
        GradeEffect,
    ],
    Field(discriminator="kind"),
]


class Chapter(BaseModel):
    """Un capitulo del montaje, para rotulos y para la descripcion de YouTube."""

    start: float
    title: str

    def timestamp(self) -> str:
        m, s = divmod(int(self.start), 60)
        h, m = divmod(m, 60)
        return f"{h}:{m:02d}:{s:02d}" if h else f"{m}:{s:02d}"


class RenderSpec(BaseModel):
    """Como se debe encodear el resultado."""

    width: int
    height: int
    fps: float
    #: LUFS objetivo; -14 es el estandar de las plataformas
    target_lufs: float = -14.0
    crf: int = 18
    preset: str = "medium"

    @property
    def aspect(self) -> float:
        return self.width / self.height if self.height else 0.0


class EDL(BaseModel):
    """La decision de montaje completa."""

    version: int = EDL_VERSION
    source: Path
    source_duration: float
    style: str = "tutorial"
    #: 0..100; reescala las bandas de saturacion del estilo
    intensity: int = 50
    render: RenderSpec
    timeline: list[Clip] = Field(default_factory=list)
    effects: list[Effect] = Field(default_factory=list)
    chapters: list[Chapter] = Field(default_factory=list)
    #: notas del planner para el usuario (que quito y por que)
    notes: list[str] = Field(default_factory=list)

    # -- tiempos -----------------------------------------------------------

    @property
    def duration(self) -> float:
        """Duracion del montaje. Depende solo de `timeline`, nunca de efectos."""
        return sum(c.duration for c in self.timeline)

    @property
    def compression(self) -> float:
        """Cuanto se ha recortado respecto al original (0.25 = un 25% menos)."""
        if not self.source_duration:
            return 0.0
        return 1.0 - (self.duration / self.source_duration)

    def clip_starts(self) -> list[float]:
        """Instante de la linea de tiempo en el que empieza cada clip."""
        starts: list[float] = []
        t = 0.0
        for c in self.timeline:
            starts.append(t)
            t += c.duration
        return starts

    def cut_points(self) -> list[float]:
        """Cortes internos del montaje (sin contar el inicio)."""
        return self.clip_starts()[1:]

    def source_to_timeline(self, t: float) -> float | None:
        """Convierte un instante del original a instante del montaje.

        Devuelve None si ese instante fue descartado en el corte.
        """
        cursor = 0.0
        for c in self.timeline:
            if c.source_start <= t < c.source_end:
                return cursor + (t - c.source_start) / max(c.speed, 1e-6)
            cursor += c.duration
        return None

    def timeline_to_source(self, t: float) -> float | None:
        """Convierte un instante del montaje al original."""
        cursor = 0.0
        for c in self.timeline:
            if cursor <= t < cursor + c.duration:
                return c.source_start + (t - cursor) * c.speed
            cursor += c.duration
        return None

    # -- efectos -----------------------------------------------------------

    def effects_of(self, kind: EffectKind) -> list[BaseEffect]:
        return [e for e in self.effects if e.kind is kind]

    def effects_at(self, t: float) -> list[BaseEffect]:
        return [e for e in self.effects if e.start <= t < e.end]

    def remove_effect(self, effect_id: str) -> bool:
        antes = len(self.effects)
        self.effects = [e for e in self.effects if e.id != effect_id]
        return len(self.effects) < antes

    def sorted_effects(self) -> list[BaseEffect]:
        return sorted(self.effects, key=lambda e: (e.start, e.kind.value))

    def chapter_markers(self) -> str:
        """Capitulos en el formato que YouTube espera en la descripcion."""
        return "\n".join(f"{c.timestamp()} {c.title}" for c in self.chapters)
