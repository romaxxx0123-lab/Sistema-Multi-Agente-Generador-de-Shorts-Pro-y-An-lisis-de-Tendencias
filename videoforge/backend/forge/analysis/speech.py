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

#: Sonidos que **nunca** son una palabra de verdad: se quitan siempre.
ALWAYS_FILLERS: dict[str, frozenset[str]] = {
    "es": frozenset({"eh", "em", "mmm", "ehm", "esto..."}),
    "en": frozenset({"uh", "um", "erm", "uhm"}),
}

#: Palabras que **a veces** son muletilla y a veces no. "este" es muletilla en
#: "y este... lo abrimos", pero es un demostrativo perfectamente normal en "en
#: este video". Quitarlas a ciegas rompe la frase, que es mucho peor que dejar
#: una muletilla puesta, asi que solo se quitan cuando van seguidas de una
#: vacilacion: esa pausa es justo la firma acustica de la muletilla.
CONTEXTUAL_FILLERS: dict[str, frozenset[str]] = {
    "es": frozenset({"este", "osea", "bueno", "digamos", "vale", "pues", "nada"}),
    "en": frozenset({"like", "basically", "actually", "literally", "right"}),
}

#: Pausa despues de la palabra que la delata como vacilacion.
HESITATION_GAP = 0.25

#: Compatibilidad: la union de las dos listas, para quien solo quiera consultarlas.
FILLER_WORDS: dict[str, frozenset[str]] = {
    idioma: ALWAYS_FILLERS[idioma] | CONTEXTUAL_FILLERS[idioma]
    for idioma in ALWAYS_FILLERS
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
    """Localiza las muletillas que se pueden quitar sin romper la frase.

    Las inequivocas ("eh", "um") se quitan siempre. Las ambiguas ("este",
    "bueno") solo si va detras una vacilacion, porque si no son palabras de
    pleno derecho: quitar el "este" de "en este video" deja "en video".
    """
    lang = (transcript.language or "es").lower()
    if lang not in ALWAYS_FILLERS:
        lang = "es"
    siempre = ALWAYS_FILLERS[lang]
    contextuales = CONTEXTUAL_FILLERS[lang]

    palabras = transcript.words
    encontradas: list[Word] = []

    for i, w in enumerate(palabras):
        normalizada = _normalize(w.text)
        if normalizada in siempre:
            encontradas.append(w)
            continue
        if normalizada not in contextuales:
            continue
        # Hay vacilacion si despues viene una pausa, o si es lo ultimo que se
        # dice antes de callarse.
        siguiente = palabras[i + 1] if i + 1 < len(palabras) else None
        if siguiente is None or siguiente.start - w.end >= HESITATION_GAP:
            encontradas.append(w)

    return encontradas
