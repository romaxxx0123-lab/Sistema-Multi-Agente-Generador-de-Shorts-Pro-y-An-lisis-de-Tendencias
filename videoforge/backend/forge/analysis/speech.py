"""Transcripcion con timestamps por palabra (faster-whisper).

Dos motivos para exigir timestamps a nivel de palabra y no de frase:

1. Los subtitulos karaoke necesitan saber cuando empieza *cada palabra*.
2. El montaje de una guia se apoya en el texto: los cortes limpios caen entre
   palabras, y el zoom de enfasis se ancla a la palabra acentuada.

Usa CTranslate2 por debajo, no PyTorch, asi que la instalacion es ligera.
"""

from __future__ import annotations

from collections.abc import Callable
from pathlib import Path

from ..config import Device, ModelPlan, Settings
from ..errors import AnalysisError
from .types import Transcript, TranscriptSegment, Word

#: Muletillas que el planner puede recortar. Se comparan en minusculas y sin
#: signos de puntuacion.
FILLER_WORDS: dict[str, frozenset[str]] = {
    "es": frozenset({"eh", "em", "mmm", "este", "osea", "bueno", "digamos", "vale"}),
    "en": frozenset({"uh", "um", "erm", "like", "basically", "actually"}),
}

ProgressFn = Callable[[float], None]


def _missing_dependency() -> AnalysisError:
    return AnalysisError(
        "faster-whisper no esta instalado, no puedo transcribir.",
        hint='Instalalo con: pip install -e ".[speech]"',
    )


def _device_args(device: Device, plan: ModelPlan) -> tuple[str, str]:
    if device is Device.CUDA:
        return "cuda", plan.whisper_compute
    return "cpu", "int8"


def _load_model(plan: ModelPlan, settings: Settings, device: Device):
    """Carga el modelo, cayendo a CPU si la GPU no es utilizable.

    Este fallback no es decorativo: las GPU muy nuevas (Blackwell, `sm_120`)
    necesitan builds recientes de CTranslate2, y cuando faltan los kernels el
    error salta al cargar. Preferimos ir lento en CPU a no funcionar.
    """
    try:
        from faster_whisper import WhisperModel
    except ImportError as exc:
        raise _missing_dependency() from exc

    dev, compute = _device_args(device, plan)
    try:
        return WhisperModel(
            plan.whisper_model,
            device=dev,
            compute_type=compute,
            download_root=str(settings.models_dir),
        ), dev
    except Exception as exc:
        if dev == "cpu":
            raise AnalysisError(
                f"No pude cargar el modelo de transcripcion '{plan.whisper_model}'.",
                hint=str(exc),
            ) from exc
        # Segundo intento en CPU.
        try:
            return WhisperModel(
                plan.whisper_model,
                device="cpu",
                compute_type="int8",
                download_root=str(settings.models_dir),
            ), "cpu"
        except Exception as cpu_exc:
            raise AnalysisError(
                "No pude cargar el modelo de transcripcion ni en GPU ni en CPU.",
                hint=f"GPU: {exc}\nCPU: {cpu_exc}",
            ) from cpu_exc


def transcribe(
    audio_path: Path,
    settings: Settings,
    plan: ModelPlan,
    device: Device,
    *,
    language: str | None = None,
    beam_size: int = 5,
    progress: ProgressFn | None = None,
) -> Transcript:
    """Transcribe el audio y devuelve segmentos con palabras temporizadas."""
    model, used_device = _load_model(plan, settings, device)

    segments_iter, info = model.transcribe(
        str(audio_path),
        language=language,
        beam_size=beam_size,
        word_timestamps=True,
        # El VAD evita que Whisper alucine texto sobre musica o silencio, que es
        # su fallo mas molesto en video real.
        vad_filter=True,
        vad_parameters={"min_silence_duration_ms": 400},
    )

    total = float(getattr(info, "duration", 0.0) or 0.0)
    segments: list[TranscriptSegment] = []
    for seg in segments_iter:
        words = [
            Word(
                start=round(float(w.start), 3),
                end=round(float(w.end), 3),
                text=w.word.strip(),
                probability=getattr(w, "probability", None),
            )
            for w in (seg.words or [])
            if w.start is not None and w.end is not None and w.word.strip()
        ]
        segments.append(
            TranscriptSegment(
                start=round(float(seg.start), 3),
                end=round(float(seg.end), 3),
                text=seg.text.strip(),
                words=words,
            )
        )
        if progress and total:
            progress(min(1.0, float(seg.end) / total))

    return Transcript(
        language=getattr(info, "language", None),
        language_probability=getattr(info, "language_probability", None),
        segments=segments,
        model=f"{plan.whisper_model}@{used_device}",
    )


def _normalize(text: str) -> str:
    return "".join(c for c in text.lower() if c.isalnum())


def find_fillers(transcript: Transcript) -> list[Word]:
    """Localiza muletillas segun el idioma detectado."""
    lang = (transcript.language or "es").lower()
    vocab = FILLER_WORDS.get(lang, FILLER_WORDS["es"])
    return [w for w in transcript.words if _normalize(w.text) in vocab]
