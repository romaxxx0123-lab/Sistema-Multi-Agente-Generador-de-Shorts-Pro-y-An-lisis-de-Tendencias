"""Orquestador del analisis: ejecuta cada etapa y la cachea por separado.

Cachear por etapa y no de golpe es lo que hace viable el formato largo. Si el
analisis de una guia de 20 minutos se corta en la transcripcion, al reintentar
no vuelve a detectar planos ni a medir el audio: retoma donde estaba.

La version de cada etapa **se calcula sola**, a partir del codigo que la produce:
si cambia `audio.py`, la cache de la etapa de audio queda invalidada y las demas
siguen sirviendo. Antes era un numero que habia que acordarse de subir a mano, y
paso lo que tenia que pasar: se reescribieron los detectores de silencio y de
planos y nadie lo subio, asi que un video ya analizado seguia dando el montaje
viejo. En la guia de prueba, 6 clips donde tocaban 10, sin ningun aviso.
"""

from __future__ import annotations

import hashlib
from collections.abc import Callable
from importlib import import_module
from pathlib import Path

from ..cache import JobCache
from ..config import Device, Settings, Tier, resolve_model_plan
from ..errors import AnalysisError, ForgeError
from ..ingest.proxy import ProxyBundle, build_proxy
from ..media import MediaInfo
from ..tools import effective_device, probe
from .audio import analyze_audio
from .motion import analyze_motion, rate_for_duration
from ..understand.segments import detect_segments
from ..understand.speech_cues import find_all
from .cursor import CursorSample, CursorTrack, track_cursor
from .ocr import ScreenText, WordBox, read_screen_text, tesseract_available
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

def _code_version(*modules: str) -> str:
    """Huella del codigo que produce una etapa.

    Se hashea el fuente de los modulos implicados. Cualquier cambio en ellos
    (un umbral, un detector nuevo, un formato de salida distinto) invalida esa
    etapa y solo esa, sin depender de que nadie se acuerde de nada.
    """
    h = hashlib.sha256()
    for nombre in sorted(modules):
        try:
            fichero = getattr(import_module(nombre), "__file__", None)
            h.update(Path(fichero).read_bytes() if fichero else nombre.encode())
        except (OSError, ImportError):
            # Empaquetado sin fuentes: se cae a algo estable en vez de romper.
            h.update(nombre.encode())
    return h.hexdigest()[:12]


#: Modulos de los que depende cada etapa. `types` esta en todas porque define
#: como se serializa lo que se guarda.
_STAGE_CODE = {
    "probe": ("forge.tools", "forge.media"),
    "motion": ("forge.analysis.motion",),
    # Los planos se deducen tambien de la curva de movimiento.
    "shots": ("forge.analysis.shots", "forge.analysis.motion"),
    "focus": ("forge.analysis.saliency",),
    "audio": ("forge.analysis.audio",),
    "transcript": ("forge.analysis.speech",),
    "screen_text": ("forge.analysis.ocr",),
    "cursor": ("forge.analysis.cursor",),
}

#: Version efectiva de cada etapa, calculada una vez al importar.
STAGE_VERSIONS = {
    etapa: _code_version("forge.analysis.types", *modulos)
    for etapa, modulos in _STAGE_CODE.items()
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
    "screen_text": "leyendo el texto en pantalla",
    "cursor": "siguiendo el puntero",
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
        #: texto en pantalla leido, si se pidio
        self.screen_text: list[ScreenText] = []
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

    def _cursor(self, bundle: ProxyBundle, force: bool) -> CursorTrack | None:
        """Por donde anduvo el puntero del raton.

        En una grabacion de pantalla es la mejor senal de donde hay que mirar.
        En material donde no hay puntero -- una camara, un juego -- no encuentra
        nada, y eso es lo correcto: esa senal no aplica a ese material.
        """
        v = STAGE_VERSIONS["cursor"]
        if not force and (cached := self.cache.read("cursor", v)) is not None:
            return CursorTrack(
                rate=cached.get("rate", 4.0),
                samples=[CursorSample(**m) for m in cached.get("samples", [])],
            )
        self.progress("cursor", STAGE_LABELS["cursor"])
        pista = track_cursor(bundle.video, self.settings)
        self.cache.write(
            "cursor",
            {"rate": pista.rate, "samples": [s.__dict__ for s in pista.samples]},
            v,
        )
        return pista if pista.samples else None

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

    def _screen_text(
        self, bundle: ProxyBundle, force: bool, transcript: Transcript | None = None
    ) -> list[ScreenText]:
        """Lee el texto en pantalla, y lo lee **donde hablas de ella**.

        Es opcional: sin Tesseract el resto del analisis no cambia, solo se
        pierde la senal mas literal para identificar el video.
        """
        if not tesseract_available():
            self.warnings.append(
                "Sin lectura de texto en pantalla: Tesseract no esta instalado "
                "(CachyOS/Arch: sudo pacman -S tesseract tesseract-data-spa)."
            )
            return []

        instantes = ocr_timestamps(bundle.duration, transcript)
        # La huella de los instantes entra en la version de la etapa: leer otros
        # fotogramas es otra cosa, y el cache tiene que saberlo.
        v = f"{STAGE_VERSIONS['screen_text']}+{_fingerprint(instantes)}"
        if not force and (cached := self.cache.read("screen_text", v)) is not None:
            return [
                ScreenText(
                    at=x["at"],
                    words=x.get("words", []),
                    boxes=[WordBox(**c) for c in x.get("boxes", [])],
                )
                for x in cached
            ]

        self.progress("screen_text", STAGE_LABELS["screen_text"])
        lecturas = read_screen_text(bundle.video, self.settings, instantes)
        self.cache.write(
            "screen_text", [x.__dict__ for x in lecturas], v
        )
        return lecturas

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
        skip_ocr: bool = False,
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
        # El puntero: barato (una pasada a 4/s sobre el proxy, mas ligera que la
        # del movimiento) y es la mejor senal de donde mirar en una grabacion de
        # pantalla, que es el caso de uso.
        cursor = self._cursor(bundle, forced("cursor"))
        shots = self._shots(bundle, motion, forced("shots"))
        focus = self._focus(bundle, shots, forced("focus"))
        audio = self._audio(bundle, forced("audio"))
        transcript = (
            None if skip_speech else self._transcript(bundle, forced("transcript"), language)
        )
        # El OCR va despues del transcript a proposito: lo que se dice decide
        # que fotogramas merece la pena leer.
        self.screen_text = (
            []
            if skip_ocr
            else self._screen_text(bundle, forced("screen_text"), transcript)
        )

        return Analysis(
            media=info,
            shots=shots,
            motion=motion,
            focus=focus,
            audio=audio,
            transcript=transcript,
            screen_text=self.screen_text,
            cursor=cursor,
            # Que es cada parte del video. Sale de lo que se dice, asi que no
            # cuesta una pasada mas: se deduce del transcript que ya tenemos.
            narrative=detect_segments(transcript, info.duration),
            # Lo que pides al montaje sin saberlo: donde senalas, que enfatizas
            # y donde te corriges. Sale del transcript y de la curva de nivel
            # que ya se calculo, asi que no cuesta ninguna pasada mas.
            cues=find_all(
                transcript, audio, self.settings.cache_dir.parent, self.screen_text,
                cursor,
            ),
        )


#: Cuantas lecturas de pantalla se reparten por el video para saber **de que
#: va**: los menus y titulos que se repiten. Cuarenta bastan para eso.
OCR_GRID = 40
#: Y nunca mas espaciadas que esto, para un video corto.
OCR_MIN_STEP = 3.0
#: Ademas se lee en los momentos en los que senalas algo. Tope, para que un
#: video donde senalas sin parar no se convierta en mil llamadas a Tesseract.
OCR_MAX_TARGETED = 120
#: Dos lecturas mas juntas que esto son la misma: en una guia la pantalla
#: cambia despacio.
OCR_MIN_GAP = 1.5


def ocr_timestamps(
    duration: float,
    transcript: Transcript | None = None,
    *,
    grid: int = OCR_GRID,
    max_targeted: int = OCR_MAX_TARGETED,
) -> list[float]:
    """En que instantes se lee la pantalla.

    Dos criterios distintos, porque el texto en pantalla sirve para dos cosas:

    - **identificar el video**: ahi interesa el texto que se repite (menus,
      titulos), y para eso basta una rejilla espaciada;
    - **senalar lo que nombras**: ahi no vale una rejilla. En un video de veinte
      minutos la rejilla cae cada treinta segundos, y una lectura solo sirve
      para los cuatro segundos de alrededor: el 73% del video quedaba fuera de
      alcance. Si dices "dale al boton de Guardar" en un hueco, no habia nada
      que leer y no se podia senalar nada.

    Asi que se lee ademas **en los momentos en los que senalas**, que salen del
    transcript y no cuestan nada de averiguar. Son unas pocas decenas de
    fotogramas de mas, y son justo los que importan.
    """
    if duration <= 0:
        return []

    paso = max(OCR_MIN_STEP, duration / max(1, grid))
    instantes = _frange(paso / 2, duration, paso)

    if transcript is not None:
        from ..understand.speech_cues import CueKind, find_pointing

        senales = [c for c in find_pointing(transcript) if c.kind is CueKind.POINT]
        # Si hay mas de las que caben, se quedan las mas claras: senalar y decir
        # donde pesa mas que nombrar de pasada.
        senales.sort(key=lambda c: (-c.strength, c.start))
        instantes += [c.mid for c in senales[:max_targeted]]

    # Se ordenan y se juntan las que caen casi encima: leer dos veces el mismo
    # fotograma es tiempo de Tesseract tirado.
    ordenados: list[float] = []
    for t in sorted(instantes):
        t = round(min(max(0.0, t), max(0.0, duration - 0.05)), 3)
        if not ordenados or t - ordenados[-1] >= OCR_MIN_GAP:
            ordenados.append(t)
    return ordenados


def _fingerprint(valores: list[float]) -> str:
    h = hashlib.sha256(",".join(f"{v:.3f}" for v in valores).encode())
    return h.hexdigest()[:8]


def _frange(start: float, stop: float, step: float) -> list[float]:
    """`range` para flotantes, sin arrastrar error acumulado."""
    if step <= 0:
        return []
    n = int((stop - start) / step)
    return [round(start + i * step, 3) for i in range(max(0, n))]


def analyze(
    source: Path | str,
    settings: Settings | None = None,
    *,
    tier: Tier | None = None,
    force: set[str] | None = None,
    skip_speech: bool = False,
    skip_ocr: bool = False,
    language: str | None = None,
    progress: ProgressFn | None = None,
) -> tuple[Analysis, list[str]]:
    """Analiza un video. Devuelve el analisis y la lista de avisos."""
    run = AnalysisRun(source, settings, tier=tier, progress=progress)
    result = run.run(
        force=force, skip_speech=skip_speech, skip_ocr=skip_ocr, language=language
    )
    return result, run.warnings


def analyze_run(
    source: Path | str,
    settings: Settings | None = None,
    *,
    tier: Tier | None = None,
    force: set[str] | None = None,
    skip_speech: bool = False,
    skip_ocr: bool = False,
    language: str | None = None,
    progress: ProgressFn | None = None,
) -> tuple[Analysis, "AnalysisRun"]:
    """Como `analyze`, pero devuelve la pasada entera.

    Hace falta para llegar a las senales que no viven en `Analysis`, como el
    texto en pantalla, que solo usa la identificacion de contenido.
    """
    run = AnalysisRun(source, settings, tier=tier, progress=progress)
    result = run.run(
        force=force, skip_speech=skip_speech, skip_ocr=skip_ocr, language=language
    )
    return result, run
