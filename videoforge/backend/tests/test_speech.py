"""Tests de la transcripcion.

El modelo real necesita descargar pesos, asi que aqui usamos un doble con la
misma forma que devuelve faster-whisper. Lo que se prueba es *nuestro* codigo:
el mapeo a los tipos del proyecto, el filtrado de palabras sin tiempo y la
deteccion de muletillas.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import pytest

from forge.analysis import speech
from forge.analysis.types import Transcript, TranscriptSegment, Word
from forge.config import Device, Settings, Tier, resolve_model_plan


@dataclass
class _Palabra:
    start: float | None
    end: float | None
    word: str
    probability: float = 0.9


@dataclass
class _Segmento:
    start: float
    end: float
    text: str
    words: list[_Palabra] = field(default_factory=list)


@dataclass
class _Info:
    language: str = "es"
    language_probability: float = 0.98
    duration: float = 10.0


class _ModeloFalso:
    def __init__(self, segmentos: list[_Segmento], info: _Info | None = None) -> None:
        self._segmentos = segmentos
        self._info = info or _Info()
        self.kwargs: dict = {}

    def transcribe(self, path: str, **kwargs):
        self.kwargs = kwargs
        return iter(self._segmentos), self._info


@pytest.fixture
def plan():
    return resolve_model_plan(Tier.LIGHT, Device.CPU)


def _instalar(monkeypatch: pytest.MonkeyPatch, modelo: _ModeloFalso) -> None:
    monkeypatch.setattr(speech, "_load_model", lambda p, s, d: (modelo, "cpu"))


def test_mapea_segmentos_y_palabras(
    monkeypatch: pytest.MonkeyPatch, settings: Settings, plan, tmp_path: Path
) -> None:
    modelo = _ModeloFalso(
        [
            _Segmento(0.0, 2.0, " Hola que tal ", [
                _Palabra(0.0, 0.5, " Hola"),
                _Palabra(0.6, 1.2, " que"),
                _Palabra(1.3, 2.0, " tal"),
            ]),
        ]
    )
    _instalar(monkeypatch, modelo)

    t = speech.transcribe(tmp_path / "a.wav", settings, plan, Device.CPU)

    assert t.language == "es"
    assert len(t.segments) == 1
    assert t.segments[0].text == "Hola que tal"
    assert [w.text for w in t.words] == ["Hola", "que", "tal"]
    assert t.model == "base@cpu"


def test_descarta_palabras_sin_tiempo(
    monkeypatch: pytest.MonkeyPatch, settings: Settings, plan, tmp_path: Path
) -> None:
    """Whisper a veces devuelve palabras sin timestamp; romperian el karaoke."""
    modelo = _ModeloFalso(
        [
            _Segmento(0.0, 2.0, "a b c", [
                _Palabra(0.0, 0.5, "a"),
                _Palabra(None, 1.0, "b"),
                _Palabra(1.0, None, "c"),
                _Palabra(1.2, 1.5, "   "),
            ])
        ]
    )
    _instalar(monkeypatch, modelo)

    t = speech.transcribe(tmp_path / "a.wav", settings, plan, Device.CPU)
    assert [w.text for w in t.words] == ["a"]


def test_pide_timestamps_por_palabra_y_vad(
    monkeypatch: pytest.MonkeyPatch, settings: Settings, plan, tmp_path: Path
) -> None:
    """Sin word_timestamps no hay subtitulos karaoke; sin VAD, Whisper alucina."""
    modelo = _ModeloFalso([])
    _instalar(monkeypatch, modelo)

    speech.transcribe(tmp_path / "a.wav", settings, plan, Device.CPU, language="es")

    assert modelo.kwargs["word_timestamps"] is True
    assert modelo.kwargs["vad_filter"] is True
    assert modelo.kwargs["language"] == "es"


def test_el_progreso_avanza(
    monkeypatch: pytest.MonkeyPatch, settings: Settings, plan, tmp_path: Path
) -> None:
    modelo = _ModeloFalso(
        [_Segmento(0.0, 5.0, "uno"), _Segmento(5.0, 10.0, "dos")],
        _Info(duration=10.0),
    )
    _instalar(monkeypatch, modelo)

    visto: list[float] = []
    speech.transcribe(
        tmp_path / "a.wav", settings, plan, Device.CPU, progress=visto.append
    )
    assert visto == [0.5, 1.0]


def test_falta_de_dependencia_da_instruccion_clara(
    monkeypatch: pytest.MonkeyPatch, settings: Settings, plan, tmp_path: Path
) -> None:
    from forge.errors import AnalysisError

    def _sin_libreria(*args, **kwargs):
        raise ImportError("no module named faster_whisper")

    monkeypatch.setattr(speech, "_load_model", _sin_libreria)
    with pytest.raises(ImportError):
        speech.transcribe(tmp_path / "a.wav", settings, plan, Device.CPU)

    # Y el helper de dependencia ausente explica como instalarla.
    err = speech._missing_dependency()
    assert isinstance(err, AnalysisError)
    assert "pip install" in (err.hint or "")


# -- muletillas ------------------------------------------------------------


def _transcript(palabras: list[str], lang: str = "es") -> Transcript:
    words = [Word(start=i, end=i + 0.4, text=w) for i, w in enumerate(palabras)]
    return Transcript(language=lang, segments=[
        TranscriptSegment(start=0, end=len(palabras), text=" ".join(palabras), words=words)
    ])


def test_detecta_muletillas_en_espanol() -> None:
    t = _transcript(["entonces", "eh", "ponemos", "esto", "osea", "aqui"])
    assert [w.text for w in speech.find_fillers(t)] == ["eh", "osea"]


def test_las_muletillas_ignoran_puntuacion_y_mayusculas() -> None:
    t = _transcript(["Eh,", "vale.", "seguimos"])
    assert {w.text for w in speech.find_fillers(t)} == {"Eh,", "vale."}


def test_muletillas_en_ingles() -> None:
    t = _transcript(["so", "um", "we", "basically", "do"], lang="en")
    assert [w.text for w in speech.find_fillers(t)] == ["um", "basically"]


def test_idioma_desconocido_cae_a_espanol() -> None:
    t = _transcript(["eh", "hola"], lang="xx")
    assert [w.text for w in speech.find_fillers(t)] == ["eh"]


def test_transcript_sin_palabras_no_da_muletillas() -> None:
    assert speech.find_fillers(Transcript()) == []
