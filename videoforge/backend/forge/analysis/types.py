"""Lo que el sistema llega a saber del video tras analizarlo.

Estos modelos son la frontera entre "mirar el video" y "decidir el montaje".
El planner de F2 solo lee de aqui: no vuelve a tocar el fichero.
"""

from __future__ import annotations

from pydantic import BaseModel, Field

from ..media import MediaInfo
from ..understand.segments import NarrativeSegment
from ..understand.speech_cues import SpeechCue
from .changes import ScreenChange
from .cursor import CursorTrack
from .ocr import ScreenText


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

    def peak_between(self, start: float, end: float) -> float:
        """El movimiento **maximo** del tramo, no el promedio.

        Para decidir si cabe un zoom importa el pico y no la media: un tramo
        quieto con un barrido de camara en medio da una media baja y hace que
        el zoom se lea como un tiron justo en ese barrido.
        """
        if not self.flow or self.rate <= 0:
            return 0.0
        a = max(0, int(start * self.rate))
        b = min(len(self.flow), max(a + 1, int(end * self.rate)))
        return max(self.flow[a:b]) if b > a else 0.0


class ShotFocus(BaseModel):
    """Donde mira el ojo dentro de un plano.

    `concentration` es la clave: a 0 la atencion esta repartida por todo el
    fotograma y acercarse seria arbitrario; cerca de 1 hay un punto claro al que
    ir. El planner usa este valor para decidir si hace punch-in o lo deja estar.
    """

    shot_index: int
    cx: float = 0.5
    cy: float = 0.5
    concentration: float = 0.0
    #: Cuanto **hay** en cada tercio del fotograma: 9 celdas 0..1, por filas.
    #: El centro de atencion dice a donde mirar; esto dice donde no hay nada,
    #: que es otra pregunta y la que hace falta para colocar una ventanita sin
    #: taparle nada al video de debajo.
    grid: list[float] = Field(default_factory=list)

    @property
    def has_focus(self) -> bool:
        return self.concentration >= 0.08

    def busiest(self) -> float:
        return max(self.grid) if self.grid else 0.0

    def cell(self, fila: int, columna: int) -> float:
        """Lo que hay en esa celda, o 0 si no se calculo la rejilla."""
        if len(self.grid) != 9:
            return 0.0
        return self.grid[fila * 3 + columna]


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
    #: Curva de nivel en dB, muestreada a `envelope_rate` por segundo. Se
    #: calculaba ya para encontrar los silencios y se tiraba. Guardarla permite
    #: saber **que palabras dices mas fuerte**, que es prosodia de verdad y sale
    #: gratis: no hace falta ninguna pasada mas sobre el audio.
    envelope: list[float] = Field(default_factory=list)
    envelope_rate: float = 20.0

    @property
    def silent_seconds(self) -> float:
        return sum(s.duration for s in self.silences)

    def is_silent_at(self, t: float) -> bool:
        return any(s.start <= t < s.end for s in self.silences)

    def level_at(self, t: float) -> float | None:
        """Nivel en dB en ese instante, o None si no hay curva."""
        if not self.envelope or self.envelope_rate <= 0:
            return None
        i = int(t * self.envelope_rate)
        if not 0 <= i < len(self.envelope):
            return None
        return self.envelope[i]

    def level_between(self, start: float, end: float) -> float | None:
        """Nivel medio de un tramo, para medir el de una palabra."""
        if not self.envelope or self.envelope_rate <= 0 or end <= start:
            return None
        a = max(0, int(start * self.envelope_rate))
        b = min(len(self.envelope), max(a + 1, int(end * self.envelope_rate)))
        if a >= b:
            return None
        tramo = self.envelope[a:b]
        return sum(tramo) / len(tramo)

    def speech_level(self, around: float | None = None, window: float = 8.0) -> float | None:
        """Nivel tipico de la voz, de todo el video o **alrededor de un punto**.

        Es la referencia contra la que se mide el enfasis. La mediana y no la
        media porque un grito o un golpe no pueden mover la referencia.

        Con `around` se mide solo lo que hay cerca, y eso es lo correcto: una
        persona baja la voz durante una frase entera y aun asi acentua dentro de
        ella. Medido sobre la guia de prueba, la palabra que el guion acentua 6
        dB quedaba a +2,2 dB de la mediana global -- por debajo de cualquier
        umbral razonable -- porque esa frase iba baja entera. Contra la mediana
        local vuelve a estar a +6.
        """
        if not self.envelope or self.envelope_rate <= 0:
            return None

        if around is None:
            desde, hasta = 0, len(self.envelope)
        else:
            medio = int(around * self.envelope_rate)
            radio = max(1, int(window * self.envelope_rate / 2))
            desde = max(0, medio - radio)
            hasta = min(len(self.envelope), medio + radio)

        hablando = [
            v for i, v in enumerate(self.envelope[desde:hasta], start=desde)
            if v > self.silence_threshold_db
            and not self.is_silent_at(i / self.envelope_rate)
        ]
        if not hablando:
            # Cerca no hay voz: se cae a la referencia global antes que mentir.
            return self.speech_level() if around is not None else None
        hablando.sort()
        return hablando[len(hablando) // 2]


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
    focus: list[ShotFocus] = Field(default_factory=list)
    audio: AudioAnalysis | None = None
    transcript: Transcript | None = None
    #: Texto leido en pantalla, con su posicion. Vacio si no hay OCR: nada de
    #: lo que depende de el es obligatorio.
    screen_text: list[ScreenText] = Field(default_factory=list)
    #: Por donde anduvo el puntero del raton. En una grabacion de pantalla es
    #: la mejor senal de donde hay que mirar, mejor que cualquier mapa de
    #: saliencia: quien graba lo lleva a lo que va a explicar.
    cursor: CursorTrack | None = None
    #: que cambio en la pantalla y donde (ver `analysis/changes.py`). En una
    #: guia, lo que acaba de aparecer es lo que se esta mirando.
    changes: list[ScreenChange] = Field(default_factory=list)
    #: Que es cada parte del video segun lo que se dice en ella (intro, paso,
    #: aviso, cierre...). Vacio si no hay transcripcion o si nadie enlaza nada.
    narrative: list[NarrativeSegment] = Field(default_factory=list)
    #: Momentos sueltos en los que lo que se dice pide algo del montaje:
    #: senalar un sitio de la pantalla, enfatizar, o corregirse.
    cues: list[SpeechCue] = Field(default_factory=list)

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

    def focus_of(self, shot_index: int) -> ShotFocus | None:
        return next((f for f in self.focus if f.shot_index == shot_index), None)

    def focus_at(self, t: float) -> ShotFocus | None:
        shot = self.shot_at(t)
        return self.focus_of(shot.index) if shot else None

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
