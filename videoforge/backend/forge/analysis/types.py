"""Lo que el sistema llega a saber del video tras analizarlo.

Estos modelos son la frontera entre "mirar el video" y "decidir el montaje".
El planner de F2 solo lee de aqui: no vuelve a tocar el fichero.
"""

from __future__ import annotations

from pydantic import BaseModel, Field

from ..media import MediaInfo


class Shot(BaseModel):
    """Un plano continuo, entre dos cambios de escena."""

    index: int
    start: float
    end: float

    @property
    def duration(self) -> float:
        return self.end - self.start

    def contains(self, t: float) -> bool:
        return self.start <= t < self.end


class MotionTrack(BaseModel):
    """Curva de movimiento muestreada a intervalo fijo.

    `diff` es el cambio bruto entre fotogramas (barato, detecta cortes) y `flow`
    la magnitud media del flujo optico (mas caro, distingue movimiento real de
    un cambio de iluminacion).
    """

    #: muestras por segundo de la curva
    rate: float
    diff: list[float] = Field(default_factory=list)
    flow: list[float] = Field(default_factory=list)

    def time_at(self, i: int) -> float:
        return i / self.rate if self.rate else 0.0

    def value_at(self, t: float) -> float:
        """Energia de movimiento en el instante t, en 0..1."""
        if not self.flow:
            return 0.0
        i = int(t * self.rate)
        i = max(0, min(len(self.flow) - 1, i))
        return self.flow[i]

    def mean_between(self, start: float, end: float) -> float:
        if not self.flow or end <= start:
            return 0.0
        a = max(0, int(start * self.rate))
        b = min(len(self.flow), max(a + 1, int(end * self.rate)))
        window = self.flow[a:b]
        return sum(window) / len(window) if window else 0.0


class SilenceRange(BaseModel):
    """Un tramo sin voz ni sonido relevante: candidato numero uno a recortarse."""

    start: float
    end: float

    @property
    def duration(self) -> float:
        return self.end - self.start


class Loudness(BaseModel):
    """Medidas EBU R128 del audio original."""

    integrated_lufs: float | None = None
    loudness_range: float | None = None
    true_peak_db: float | None = None
    threshold_lufs: float | None = None


class AudioAnalysis(BaseModel):
    silences: list[SilenceRange] = Field(default_factory=list)
    loudness: Loudness = Field(default_factory=Loudness)
    #: umbral en dB usado para detectar los silencios, para poder explicarlo
    silence_threshold_db: float = -32.0

    @property
    def silent_seconds(self) -> float:
        return sum(s.duration for s in self.silences)

    def is_silent_at(self, t: float) -> bool:
        return any(s.start <= t < s.end for s in self.silences)


class Word(BaseModel):
    """Una palabra con su instante exacto: la base de los subtitulos karaoke."""

    start: float
    end: float
    text: str
    probability: float | None = None


class TranscriptSegment(BaseModel):
    start: float
    end: float
    text: str
    words: list[Word] = Field(default_factory=list)


class Transcript(BaseModel):
    language: str | None = None
    language_probability: float | None = None
    segments: list[TranscriptSegment] = Field(default_factory=list)
    #: modelo usado, para saber si merece la pena reanalizar con otro perfil
    model: str | None = None

    @property
    def words(self) -> list[Word]:
        return [w for s in self.segments for w in s.words]

    @property
    def text(self) -> str:
        return " ".join(s.text.strip() for s in self.segments).strip()

    @property
    def speech_seconds(self) -> float:
        return sum(s.end - s.start for s in self.segments)

    def words_between(self, start: float, end: float) -> list[Word]:
        return [w for w in self.words if w.start < end and w.end > start]


class Analysis(BaseModel):
    """Todo lo que sabemos del video, listo para que el planner decida."""

    media: MediaInfo
    shots: list[Shot] = Field(default_factory=list)
    motion: MotionTrack | None = None
    audio: AudioAnalysis | None = None
    transcript: Transcript | None = None

    @property
    def duration(self) -> float:
        return self.media.duration

    @property
    def speech_ratio(self) -> float:
        """Cuanto del video es voz. Alto = guia/tutorial; bajo = gameplay."""
        if not self.transcript or not self.duration:
            return 0.0
        return min(1.0, self.transcript.speech_seconds / self.duration)

    def shot_at(self, t: float) -> Shot | None:
        return next((s for s in self.shots if s.contains(t)), None)

    def summary(self) -> str:
        bits = [f"{self.duration:.1f}s", f"{len(self.shots)} planos"]
        if self.audio:
            bits.append(f"{self.audio.silent_seconds:.1f}s en silencio")
            if self.audio.loudness.integrated_lufs is not None:
                bits.append(f"{self.audio.loudness.integrated_lufs:.1f} LUFS")
        if self.transcript:
            bits.append(f"{len(self.transcript.words)} palabras")
            if self.transcript.language:
                bits.append(f"idioma {self.transcript.language}")
        return " · ".join(bits)
