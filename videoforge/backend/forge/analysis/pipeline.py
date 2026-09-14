"""Orquestador del analisis: ejecuta cada etapa y la cachea por separado.

Cachear por etapa y no de golpe es lo que hace viable el formato largo. Si el
analisis de una guia de 20 minutos se corta en la transcripcion, al reintentar
no vuelve a detectar planos ni a medir el audio: retoma donde estaba.

Cada etapa lleva su propia version. Si cambia el codigo que genera una, solo se
invalida esa, no el analisis entero.
"""

from __future__ import annotations

from collections.abc import Callable
from pathlib import Path

from ..cache import JobCache
from ..config import Device, Settings, Tier, resolve_model_plan
from ..errors import AnalysisError, ForgeError
from ..ingest.proxy import ProxyBundle, build_proxy
from ..media import MediaInfo
from ..tools import effective_device, probe
from .audio import analyze_audio
from .motion import analyze_motion, rate_for_duration
from .saliency import analyze_saliency
from .shots import detect_shots
from .types import (
    Analysis,
    AudioAnalysis,
    MotionTrack,
    Shot,
    ShotFocus,
    Transcript,
)

#: Subir la version de una etapa invalida su cache sin tocar las demas.
STAGE_VERSIONS = {
    "probe": 1,
    "motion": 1,
    "shots": 1,
    "focus": 1,
    "audio": 1,
    "transcript": 1,
}

#: Etapa -> nombre legible, para los mensajes de progreso.
STAGE_LABELS = {
    "probe": "sondeando el fichero",
    "proxy": "preparando proxy de analisis",
    "motion": "midiendo movimiento",
    "shots": "detectando planos",
    "focus": "buscando el foco de atencion",
    "audio": "analizando audio",
    "transcript": "transcribiendo voz",
}

ProgressFn = Callable[[str, str], None]


def _noop(stage: str, message: str) -> None:  # pragma: no cover - trivial
    pass


class AnalysisRun:
    """Una pasada de analisis sobre un fichero concreto."""

    def __init__(
        self,
        source: Path | str,
        settings: Settings | None = None,
        *,
        tier: Tier | None = None,
        progress: ProgressFn | None = None,
    ) -> None:
        self.settings = settings or Settings.load()
        self.settings.ensure_dirs()
        self.source = Path(source).expanduser().resolve()
        self.progress = progress or _noop
        self.device = effective_device(self.settings)
        self.plan = resolve_model_plan(tier or self.settings.tier, self.device)
        self.cache = JobCache(self.settings, self.source)
        #: avisos no fatales (p. ej. sin transcripcion por falta de dependencia)
        self.warnings: list[str] = []

    # -- etapas ------------------------------------------------------------

    def _probe(self, force: bool) -> MediaInfo:
        v = STAGE_VERSIONS["probe"]
        if not force and (cached := self.cache.read("probe", v)):
            return MediaInfo.model_validate(cached)
        self.progress("probe", STAGE_LABELS["probe"])
        info = probe(self.source, self.settings)
        if not info.has_video:
            raise AnalysisError(
                f"{self.source.name} no tiene pista de video.",
                hint="VideoForge edita video; para audio suelto no hay nada que montar.",
            )
        self.cache.write("probe", info.model_dump(mode="json"), v)
        return info

    def _proxy(self, info: MediaInfo, force: bool) -> ProxyBundle:
        self.progress("proxy", STAGE_LABELS["proxy"])
        return build_proxy(info, self.cache, self.settings, self.plan, force=force)

    def _motion(self, bundle: ProxyBundle, force: bool) -> MotionTrack:
        v = STAGE_VERSIONS["motion"]
        if not force and (cached := self.cache.read("motion", v)):
            return MotionTrack.model_validate(cached)
        self.progress("motion", STAGE_LABELS["motion"])
        track = analyze_motion(
            bundle.video, self.settings, rate=rate_for_duration(bundle.duration)
        )
        self.cache.write("motion", track.model_dump(mode="json"), v)
        return track

    def _shots(self, bundle: ProxyBundle, motion: MotionTrack, force: bool) -> list[Shot]:
        v = STAGE_VERSIONS["shots"]
        if not force and (cached := self.cache.read("shots", v)) is not None:
            return [Shot.model_validate(s) for s in cached]
        self.progress("shots", STAGE_LABELS["shots"])
        shots = detect_shots(bundle.video, bundle.duration, self.settings, motion=motion)
        self.cache.write("shots", [s.model_dump(mode="json") for s in shots], v)
        return shots

    def _focus(self, bundle: ProxyBundle, shots: list[Shot], force: bool) -> list[ShotFocus]:
        v = STAGE_VERSIONS["focus"]
        if not force and (cached := self.cache.read("focus", v)) is not None:
            return [ShotFocus.model_validate(f) for f in cached]
        self.progress("focus", STAGE_LABELS["focus"])
        focus = analyze_saliency(bundle.video, shots, self.settings)
        self.cache.write("focus", [f.model_dump(mode="json") for f in focus], v)
        return focus

    def _audio(self, bundle: ProxyBundle, force: bool) -> AudioAnalysis | None:
        if not bundle.has_audio:
            self.warnings.append("El video no tiene audio: sin silencios ni sonoridad.")
            return None
        v = STAGE_VERSIONS["audio"]
        if not force and (cached := self.cache.read("audio", v)):
            return AudioAnalysis.model_validate(cached)
        self.progress("audio", STAGE_LABELS["audio"])
        assert bundle.audio is not None
        result = analyze_audio(bundle.audio, bundle.duration, self.settings)
        self.cache.write("audio", result.model_dump(mode="json"), v)
        return result

    def _transcript(self, bundle: ProxyBundle, force: bool, language: str | None) -> Transcript | None:
        if not bundle.has_audio:
            return None
        v = STAGE_VERSIONS["transcript"]
        if not force and (cached := self.cache.read("transcript", v)):
            return Transcript.model_validate(cached)

        self.progress("transcript", STAGE_LABELS["transcript"])
        from .speech import transcribe

        assert bundle.audio is not None
        try:
            result = transcribe(
                bundle.audio, self.settings, self.plan, self.device, language=language
            )
        except ForgeError as exc:
            # Sin transcripcion se puede montar igualmente (peor, pero se puede),
            # asi que lo degradamos a aviso en vez de tumbar el analisis.
            self.warnings.append(f"Sin transcripcion: {exc.message}")
            return None

        self.cache.write("transcript", result.model_dump(mode="json"), v)
        return result

    # -- ejecucion ---------------------------------------------------------

    def run(
        self,
        *,
        force: set[str] | None = None,
        skip_speech: bool = False,
        language: str | None = None,
    ) -> Analysis:
        """Ejecuta el analisis completo, reutilizando lo que ya este cacheado."""
        force = force or set()
        everything = "all" in force

        def forced(stage: str) -> bool:
            return everything or stage in force

        info = self._probe(forced("probe"))
        bundle = self._proxy(info, forced("proxy"))
        motion = self._motion(bundle, forced("motion"))
        shots = self._shots(bundle, motion, forced("shots"))
        focus = self._focus(bundle, shots, forced("focus"))
        audio = self._audio(bundle, forced("audio"))
        transcript = (
            None if skip_speech else self._transcript(bundle, forced("transcript"), language)
        )

        return Analysis(
            media=info,
            shots=shots,
            motion=motion,
            focus=focus,
            audio=audio,
            transcript=transcript,
        )


def analyze(
    source: Path | str,
    settings: Settings | None = None,
    *,
    tier: Tier | None = None,
    force: set[str] | None = None,
    skip_speech: bool = False,
    language: str | None = None,
    progress: ProgressFn | None = None,
) -> tuple[Analysis, list[str]]:
    """Analiza un video. Devuelve el analisis y la lista de avisos."""
    run = AnalysisRun(source, settings, tier=tier, progress=progress)
    result = run.run(force=force, skip_speech=skip_speech, language=language)
    return result, run.warnings
