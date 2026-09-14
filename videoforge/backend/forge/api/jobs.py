"""Estado de los trabajos: subir, analizar, montar y renderizar.

El trabajo pesado (analisis y render) es codigo bloqueante que llama a ffmpeg,
asi que corre en un hilo aparte y **nunca** en el bucle de eventos: si no, la
API dejaria de responder mientras se encodea un video de veinte minutos.

Cada trabajo persiste su estado en disco. Reiniciar el servidor no pierde el
analisis, que es justo lo que mas cuesta rehacer.
"""

from __future__ import annotations

import json
import queue
import threading
import time
import traceback
import uuid
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any

from ..config import Settings
from ..errors import ForgeError

#: Cuantos eventos de progreso se guardan por trabajo. Los suficientes para que
#: un cliente que se conecta tarde vea que ha pasado, sin crecer sin limite.
MAX_EVENTS = 400


class JobState(str, Enum):
    CREADO = "creado"
    ANALIZANDO = "analizando"
    ANALIZADO = "analizado"
    PLANIFICANDO = "planificando"
    PLANIFICADO = "planificado"
    RENDERIZANDO = "renderizando"
    LISTO = "listo"
    ERROR = "error"


@dataclass
class ProgressEvent:
    """Un paso del trabajo, tal y como lo ve el cliente."""

    state: str
    message: str
    fraction: float = 0.0
    at: float = field(default_factory=time.time)

    def as_dict(self) -> dict[str, Any]:
        return {
            "state": self.state,
            "message": self.message,
            "fraction": round(self.fraction, 4),
            "at": self.at,
        }


class Job:
    """Un video subido y todo lo que se ha hecho con el."""

    def __init__(self, job_id: str, source: Path, root: Path) -> None:
        self.id = job_id
        self.source = source
        self.root = root
        self.state = JobState.CREADO
        self.message = "subido"
        self.fraction = 0.0
        self.error: str | None = None
        self.created_at = time.time()

        #: resultados de cada etapa, serializados
        self.analysis: dict | None = None
        self.profile: dict | None = None
        self.edl: dict | None = None
        self.saturation: dict | None = None
        self.balance: dict | None = None
        self.result: dict | None = None
        self.warnings: list[str] = []

        self.events: list[ProgressEvent] = []
        #: colas de los clientes conectados por SSE
        self._subscribers: list[queue.Queue] = []
        self._lock = threading.Lock()
        #: evita lanzar dos tareas a la vez sobre el mismo trabajo
        self.busy = False

    # -- progreso ----------------------------------------------------------

    def emit(self, message: str, fraction: float | None = None) -> None:
        """Publica un paso y lo reparte a los clientes conectados."""
        with self._lock:
            if fraction is not None:
                self.fraction = max(0.0, min(1.0, fraction))
            self.message = message
            evento = ProgressEvent(self.state.value, message, self.fraction)
            self.events.append(evento)
            if len(self.events) > MAX_EVENTS:
                del self.events[: len(self.events) - MAX_EVENTS]
            suscriptores = list(self._subscribers)

        for cola in suscriptores:
            try:
                cola.put_nowait(evento)
            except queue.Full:
                # Un cliente lento no puede frenar el trabajo.
                pass

    def subscribe(self) -> queue.Queue:
        cola: queue.Queue = queue.Queue(maxsize=200)
        with self._lock:
            self._subscribers.append(cola)
            historico = list(self.events[-20:])
        for evento in historico:
            cola.put_nowait(evento)
        return cola

    def unsubscribe(self, cola: queue.Queue) -> None:
        with self._lock:
            if cola in self._subscribers:
                self._subscribers.remove(cola)

    def set_state(self, state: JobState, message: str, fraction: float | None = None) -> None:
        self.state = state
        self.emit(message, fraction)

    def fail(self, exc: Exception) -> None:
        self.error = str(exc)
        self.state = JobState.ERROR
        self.emit(f"error: {exc}")

    # -- persistencia ------------------------------------------------------

    def to_dict(self, *, full: bool = False) -> dict[str, Any]:
        datos: dict[str, Any] = {
            "id": self.id,
            "source": self.source.name,
            "state": self.state.value,
            "message": self.message,
            "fraction": round(self.fraction, 4),
            "error": self.error,
            "created_at": self.created_at,
            "warnings": self.warnings,
            "has_analysis": self.analysis is not None,
            "has_edl": self.edl is not None,
            "has_result": self.result is not None,
        }
        if full:
            datos.update(
                {
                    "analysis": self.analysis,
                    "profile": self.profile,
                    "edl": self.edl,
                    "saturation": self.saturation,
                    "balance": self.balance,
                    "result": self.result,
                }
            )
        return datos

    def save(self) -> None:
        destino = self.root / "job.json"
        tmp = destino.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(self.to_dict(full=True), ensure_ascii=False, default=str))
        tmp.replace(destino)

    @classmethod
    def load(cls, root: Path) -> "Job | None":
        fichero = root / "job.json"
        if not fichero.is_file():
            return None
        try:
            datos = json.loads(fichero.read_text())
        except (json.JSONDecodeError, OSError):
            return None

        origen = next((p for p in (root / "source").glob("*") if p.is_file()), None)
        if origen is None:
            return None

        job = cls(datos.get("id", root.name), origen, root)
        job.state = JobState(datos.get("state", "creado"))
        # Un trabajo que se quedo a medias al apagar el servidor no puede
        # revivir en marcha: se marca como error para que se pueda relanzar.
        if job.state in (JobState.ANALIZANDO, JobState.PLANIFICANDO, JobState.RENDERIZANDO):
            job.state = JobState.ERROR
            job.error = "interrumpido al reiniciar el servidor"
        job.message = datos.get("message", "")
        job.fraction = datos.get("fraction", 0.0)
        job.error = datos.get("error") or job.error
        job.created_at = datos.get("created_at", time.time())
        job.warnings = datos.get("warnings", [])
        job.analysis = datos.get("analysis")
        job.profile = datos.get("profile")
        job.edl = datos.get("edl")
        job.saturation = datos.get("saturation")
        job.balance = datos.get("balance")
        job.result = datos.get("result")
        return job


class JobStore:
    """Registro de trabajos, con su carpeta en disco."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.root = settings.cache_dir / "api-jobs"
        self.root.mkdir(parents=True, exist_ok=True)
        self._jobs: dict[str, Job] = {}
        self._lock = threading.Lock()
        self._load_existing()

    def _load_existing(self) -> None:
        for carpeta in sorted(self.root.iterdir()):
            if not carpeta.is_dir():
                continue
            job = Job.load(carpeta)
            if job is not None:
                self._jobs[job.id] = job

    def create(self, filename: str, data: bytes) -> Job:
        job_id = uuid.uuid4().hex[:12]
        carpeta = self.root / job_id
        (carpeta / "source").mkdir(parents=True, exist_ok=True)

        # Se conserva la extension: ffmpeg la usa para elegir el demuxer.
        nombre = Path(filename).name or "video.mp4"
        destino = carpeta / "source" / nombre
        destino.write_bytes(data)

        job = Job(job_id, destino, carpeta)
        job.emit("video subido", 0.0)
        job.save()
        with self._lock:
            self._jobs[job_id] = job
        return job

    def get(self, job_id: str) -> Job | None:
        with self._lock:
            return self._jobs.get(job_id)

    def list(self) -> list[Job]:
        with self._lock:
            return sorted(self._jobs.values(), key=lambda j: -j.created_at)

    def delete(self, job_id: str) -> bool:
        import shutil

        with self._lock:
            job = self._jobs.pop(job_id, None)
        if job is None:
            return False
        shutil.rmtree(job.root, ignore_errors=True)
        return True


def run_in_thread(job: Job, fn, *args, **kwargs) -> threading.Thread:
    """Ejecuta una tarea bloqueante fuera del bucle de eventos.

    El analisis y el render llaman a ffmpeg y pueden tardar minutos; hacerlo en
    el hilo de la API la dejaria muda mientras tanto.
    """

    def _envoltorio() -> None:
        try:
            fn(*args, **kwargs)
        except ForgeError as exc:
            job.fail(exc)
        except Exception as exc:  # pragma: no cover - red de seguridad
            job.error = f"{exc}\n{traceback.format_exc()[-1500:]}"
            job.state = JobState.ERROR
            job.emit(f"error inesperado: {exc}")
        finally:
            job.busy = False
            job.save()

    job.busy = True
    hilo = threading.Thread(target=_envoltorio, daemon=True)
    hilo.start()
    return hilo
