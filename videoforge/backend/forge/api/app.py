"""API HTTP de VideoForge.

El flujo que expone es el mismo que el de la linea de comandos: subir, analizar,
identificar, planificar, medir la saturacion, ajustar y renderizar. Cada paso
deja su resultado disponible por separado, para que la interfaz pueda enseñar el
montaje y dejar revisarlo **antes** de gastar un render.
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Body, FastAPI, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field

from .. import __version__
from ..config import Settings, Tier
from ..errors import ForgeError
from .jobs import Job, JobState, JobStore, run_in_thread

#: Extensiones que aceptamos subir.
ALLOWED_SUFFIXES = {".mp4", ".mov", ".mkv", ".webm", ".m4v", ".avi"}
#: Tope de subida. Un video de 20 minutos en 4K cabe de sobra.
MAX_UPLOAD_BYTES = 8 * 1024 * 1024 * 1024


class PlanRequest(BaseModel):
    style: str = "tutorial"
    intensity: int = Field(default=50, ge=0, le=100)
    broll: bool = False
    offline: bool = False
    balance: bool = False


class AnalyzeRequest(BaseModel):
    tier: str | None = None
    skip_speech: bool = False
    ocr: bool = False
    language: str | None = None


class RenderRequest(BaseModel):
    preview: bool = False
    use_gpu: bool = True


def _job_or_404(store: JobStore, job_id: str) -> Job:
    job = store.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="no existe ese trabajo")
    return job


def _require_idle(job: Job) -> None:
    if job.busy:
        raise HTTPException(status_code=409, detail="el trabajo ya esta ocupado")


def create_app(settings: Settings | None = None) -> FastAPI:
    """Monta la aplicacion. Se pasa `settings` en los tests para aislar el cache."""
    settings = settings or Settings.load()
    settings.ensure_dirs()
    store = JobStore(settings)

    app = FastAPI(title="VideoForge", version=__version__)
    # La interfaz corre en otro puerto durante el desarrollo.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.state.settings = settings
    app.state.store = store

    api = APIRouter(prefix="/api")

    # -- informacion general ------------------------------------------------

    @api.get("/health")
    def health() -> dict[str, Any]:
        from ..tools import capabilities, effective_device

        try:
            caps = capabilities(settings)
            toolchain = {
                "ffmpeg": str(caps.ffmpeg),
                "version": caps.version,
                "missing_filters": caps.missing_required(),
                "gpu": caps.gpu_name,
                "nvenc": caps.can_nvenc,
            }
        except ForgeError as exc:
            toolchain = {"error": str(exc)}

        return {
            "version": __version__,
            "device": effective_device(settings).value,
            "tier": settings.tier.value,
            "toolchain": toolchain,
        }

    @api.get("/styles")
    def styles() -> list[dict[str, Any]]:
        from ..plan.styles import describe_styles

        return [
            {
                "name": s.name,
                "label": s.label,
                "description": s.description,
                "cuts_per_minute": [s.pacing.cuts_per_minute.lo, s.pacing.cuts_per_minute.hi],
                "captions": s.captions.enabled,
                "punch_in": s.emphasis.punch_in,
                "chapters": s.chapters.enabled,
                "broll": s.broll.enabled,
            }
            for s in describe_styles()
        ]

    # -- trabajos -----------------------------------------------------------

    @api.get("/jobs")
    def list_jobs() -> list[dict[str, Any]]:
        return [j.to_dict() for j in store.list()]

    @api.post("/jobs", status_code=201)
    async def create_job(file: UploadFile) -> dict[str, Any]:
        nombre = Path(file.filename or "video.mp4").name
        if Path(nombre).suffix.lower() not in ALLOWED_SUFFIXES:
            raise HTTPException(
                status_code=415,
                detail=f"formato no admitido: {Path(nombre).suffix or 'sin extension'}",
            )

        datos = await file.read()
        if not datos:
            raise HTTPException(status_code=400, detail="el fichero esta vacio")
        if len(datos) > MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=413, detail="el fichero es demasiado grande")

        return store.create(nombre, datos).to_dict()

    @api.get("/jobs/{job_id}")
    def get_job(job_id: str) -> dict[str, Any]:
        return _job_or_404(store, job_id).to_dict()

    @api.delete("/jobs/{job_id}")
    def delete_job(job_id: str) -> dict[str, Any]:
        if not store.delete(job_id):
            raise HTTPException(status_code=404, detail="no existe ese trabajo")
        return {"deleted": job_id}

    # -- progreso en vivo ---------------------------------------------------

    @api.get("/jobs/{job_id}/events")
    async def job_events(job_id: str) -> StreamingResponse:
        """Progreso por SSE mientras hay una tarea en marcha.

        El contrato es: el stream se cierra en cuanto el trabajo queda ocioso,
        y el cliente abre uno nuevo al lanzar la siguiente etapa. Es mas simple
        y mas robusto que mantenerlo abierto entre fases, y evita el fallo de
        dejar conexiones colgadas para siempre en los estados intermedios
        (`analizado`, `planificado`), que no son finales pero si de reposo.
        """
        job = _job_or_404(store, job_id)

        async def stream():
            cola = job.subscribe()
            # Se sondea cada segundo para poder cerrar pronto, y se manda un
            # latido de vez en cuando para que los proxies no corten por
            # inactividad.
            sin_eventos = 0
            try:
                while True:
                    try:
                        evento = await asyncio.to_thread(cola.get, True, 1.0)
                    except Exception:
                        sin_eventos += 1
                        if not job.busy:
                            break
                        if sin_eventos % 15 == 0:
                            yield ": ping\n\n"
                        continue
                    sin_eventos = 0
                    yield f"data: {json.dumps(evento.as_dict())}\n\n"
            finally:
                job.unsubscribe(cola)

        return StreamingResponse(
            stream(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    # -- analisis -----------------------------------------------------------

    def _do_analyze(job: Job, req: AnalyzeRequest) -> None:
        from ..analysis.pipeline import analyze_run
        from ..analysis.vision import build_tagger, tag_video
        from ..understand.profile import build_profile

        job.set_state(JobState.ANALIZANDO, "empezando el analisis", 0.0)

        etapas = ["probe", "proxy", "motion", "shots", "focus", "audio", "transcript", "screen_text"]

        def on_progress(stage: str, message: str) -> None:
            avance = (etapas.index(stage) + 1) / len(etapas) if stage in etapas else job.fraction
            job.emit(message, avance)

        tier = Tier(req.tier.lower()) if req.tier else None
        analysis, run = analyze_run(
            job.source,
            settings,
            tier=tier,
            skip_speech=req.skip_speech,
            skip_ocr=not req.ocr,
            language=req.language,
            progress=on_progress,
        )

        job.emit("identificando el contenido", 0.95)
        tagger = build_tagger(settings, run.device)
        etiquetas = []
        if tagger.available:
            instantes = [s.start + s.duration / 2 for s in analysis.shots[:40]]
            proxy = run.cache.artifact(f"proxy_{run.plan.analysis_height}p.mp4")
            etiquetas = tag_video(proxy, settings, instantes, tagger)

        perfil = build_profile(
            analysis, screen_text=run.screen_text, vision_tags=etiquetas
        )

        job.analysis = json.loads(analysis.model_dump_json())
        job.profile = json.loads(perfil.model_dump_json())
        job.warnings = run.warnings
        job.set_state(JobState.ANALIZADO, "analisis terminado", 1.0)

    @api.post("/jobs/{job_id}/analyze")
    def analyze_job(job_id: str, req: AnalyzeRequest = Body(default=AnalyzeRequest())) -> dict[str, Any]:
        job = _job_or_404(store, job_id)
        _require_idle(job)
        run_in_thread(job, _do_analyze, job, req)
        return job.to_dict()

    @api.get("/jobs/{job_id}/analysis")
    def get_analysis(job_id: str) -> dict[str, Any]:
        job = _job_or_404(store, job_id)
        if job.analysis is None:
            raise HTTPException(status_code=409, detail="todavia no se ha analizado")
        return job.analysis

    @api.get("/jobs/{job_id}/profile")
    def get_profile(job_id: str) -> dict[str, Any]:
        job = _job_or_404(store, job_id)
        if job.profile is None:
            raise HTTPException(status_code=409, detail="todavia no se ha analizado")
        return job.profile

    # -- montaje ------------------------------------------------------------

    def _load_analysis(job: Job):
        from ..analysis.types import Analysis

        if job.analysis is None:
            raise ForgeError("hay que analizar el video antes de montarlo")
        return Analysis.model_validate(job.analysis)

    def _do_plan(job: Job, req: PlanRequest) -> None:
        from ..assets.providers import build_providers
        from ..assets.types import AssetBundle
        from ..plan.planner import build_edl
        from ..saturation.balance import rebalance
        from ..saturation.score import evaluate

        job.set_state(JobState.PLANIFICANDO, "decidiendo el montaje", 0.2)
        analysis = _load_analysis(job)

        proveedores = None
        if req.broll:
            proveedores = build_providers(
                analysis,
                local_dir=Path(__file__).resolve().parents[3] / "assets" / "broll",
                allow_network=not req.offline,
            )

        bundle = AssetBundle()
        edl = build_edl(
            analysis, req.style, intensity=req.intensity,
            providers=proveedores, assets=bundle,
        )

        job.balance = None
        if req.balance:
            job.emit("reajustando la carga visual", 0.7)
            informe = rebalance(edl, analysis, intensity=req.intensity)
            job.balance = {
                "summary": informe.summary(),
                "removed": [c.__dict__ for c in informe.removed],
                "added": [c.__dict__ for c in informe.added],
                "before": informe.before.score,
                "after": informe.after.score,
            }

        reporte = evaluate(edl, analysis, intensity=req.intensity)

        job.edl = json.loads(edl.model_dump_json())
        job.assets = {k: json.loads(v.model_dump_json()) for k, v in bundle.assets.items()}
        job.saturation = _saturation_dict(reporte)
        job.set_state(JobState.PLANIFICADO, "montaje listo para revisar", 1.0)

    @api.post("/jobs/{job_id}/plan")
    def plan_job(job_id: str, req: PlanRequest = Body(default=PlanRequest())) -> dict[str, Any]:
        job = _job_or_404(store, job_id)
        _require_idle(job)
        if job.analysis is None:
            raise HTTPException(status_code=409, detail="hay que analizar el video primero")
        run_in_thread(job, _do_plan, job, req)
        return job.to_dict()

    @api.get("/jobs/{job_id}/edl")
    def get_edl(job_id: str) -> dict[str, Any]:
        job = _job_or_404(store, job_id)
        if job.edl is None:
            raise HTTPException(status_code=409, detail="todavia no hay montaje")
        return job.edl

    @api.put("/jobs/{job_id}/edl")
    def put_edl(job_id: str, edl: dict = Body(...)) -> dict[str, Any]:
        """Guarda un montaje editado a mano y lo vuelve a medir."""
        from ..plan.edl import EDL
        from ..saturation.score import evaluate

        job = _job_or_404(store, job_id)
        try:
            validado = EDL.model_validate(edl)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=f"EDL invalido: {exc}") from exc

        analysis = _load_analysis(job) if job.analysis else None
        job.edl = json.loads(validado.model_dump_json())
        job.saturation = _saturation_dict(evaluate(validado, analysis))
        job.save()
        return job.saturation

    @api.get("/jobs/{job_id}/saturation")
    def get_saturation(job_id: str) -> dict[str, Any]:
        job = _job_or_404(store, job_id)
        if job.saturation is None:
            raise HTTPException(status_code=409, detail="todavia no hay montaje")
        return job.saturation

    @api.post("/jobs/{job_id}/balance")
    def balance_job(job_id: str, intensity: int = Body(default=50, embed=True)) -> dict[str, Any]:
        """Reajusta los efectos hasta entrar en banda, sin tocar la duracion."""
        from ..plan.edl import EDL
        from ..saturation.balance import rebalance

        job = _job_or_404(store, job_id)
        if job.edl is None:
            raise HTTPException(status_code=409, detail="todavia no hay montaje")

        edl = EDL.model_validate(job.edl)
        analysis = _load_analysis(job) if job.analysis else None
        duracion_antes = edl.duration

        informe = rebalance(edl, analysis, intensity=intensity)

        job.edl = json.loads(edl.model_dump_json())
        job.saturation = _saturation_dict(informe.after)
        job.balance = {
            "summary": informe.summary(),
            "removed": [c.__dict__ for c in informe.removed],
            "added": [c.__dict__ for c in informe.added],
            "before": informe.before.score,
            "after": informe.after.score,
            # La duracion no cambia nunca: se devuelve para que la UI lo enseñe.
            "duration_before": round(duracion_antes, 3),
            "duration_after": round(edl.duration, 3),
        }
        job.save()
        return job.balance

    # -- render -------------------------------------------------------------

    def _do_render(job: Job, req: RenderRequest) -> None:
        from ..assets.types import Asset, AssetBundle
        from ..plan.edl import EDL
        from ..render.renderer import render as do_render

        job.set_state(JobState.RENDERIZANDO, "preparando el render", 0.0)
        edl = EDL.model_validate(job.edl)

        bundle = AssetBundle()
        for asset_id, datos in (getattr(job, "assets", None) or {}).items():
            bundle.add(Asset.model_validate(datos))

        salida = job.root / ("preview.mp4" if req.preview else "resultado.mp4")

        def on_render(fraction: float, label: str) -> None:
            job.emit(label, fraction)

        resultado = do_render(
            edl, salida, settings,
            preview=req.preview,
            use_gpu=req.use_gpu,
            fonts_dir=Path(__file__).resolve().parents[3] / "assets" / "fonts",
            work_dir=job.root,
            assets=bundle,
            progress=on_render,
        )

        job.result = {
            "path": str(resultado.path),
            "filename": resultado.path.name,
            "duration": resultado.duration,
            "seconds_taken": round(resultado.seconds_taken, 2),
            "encoder": resultado.encoder,
            "applied": resultado.applied,
            "measured_lufs": resultado.measured_lufs,
            "preview": resultado.preview,
            "size_bytes": resultado.path.stat().st_size,
        }
        job.set_state(JobState.LISTO, "render terminado", 1.0)

    @api.post("/jobs/{job_id}/render")
    def render_job(job_id: str, req: RenderRequest = Body(default=RenderRequest())) -> dict[str, Any]:
        job = _job_or_404(store, job_id)
        _require_idle(job)
        if job.edl is None:
            raise HTTPException(status_code=409, detail="hay que montar el video primero")
        run_in_thread(job, _do_render, job, req)
        return job.to_dict()

    @api.get("/jobs/{job_id}/result")
    def download_result(job_id: str) -> FileResponse:
        job = _job_or_404(store, job_id)
        if not job.result:
            raise HTTPException(status_code=409, detail="todavia no hay render")
        ruta = Path(job.result["path"])
        if not ruta.is_file():
            raise HTTPException(status_code=410, detail="el fichero ya no esta")
        return FileResponse(
            ruta, media_type="video/mp4",
            filename=f"{Path(job.source).stem}-editado.mp4",
        )

    @api.get("/jobs/{job_id}/chapters")
    def get_chapters(job_id: str) -> dict[str, Any]:
        """Capitulos en el formato que espera la descripcion de YouTube."""
        from ..plan.edl import EDL

        job = _job_or_404(store, job_id)
        if job.edl is None:
            raise HTTPException(status_code=409, detail="todavia no hay montaje")
        edl = EDL.model_validate(job.edl)
        return {
            "markers": edl.chapter_markers(),
            "chapters": [{"start": c.start, "title": c.title, "timestamp": c.timestamp()}
                         for c in edl.chapters],
        }

    app.include_router(api)
    return app


def _saturation_dict(report) -> dict[str, Any]:
    """Pasa el informe de saturacion a algo que la interfaz pueda pintar."""
    return {
        "score": report.score,
        "verdict": report.verdict,
        "style": report.style,
        "intensity": report.intensity,
        "heatmap": report.heatmap,
        "hot_windows": report.hot_windows,
        "metrics": report.metrics.as_dict(),
        "duration": report.metrics.duration,
        "readings": [
            {
                "name": r.name,
                "value": r.value,
                "band": [r.band.lo, r.band.hi],
                "status": r.status,
                "score": r.score,
                "counts": r.counts,
                "advice": r.advice,
            }
            for r in report.readings
        ],
    }


#: Punto de entrada para `uvicorn forge.api.app:app`.
app = create_app()
