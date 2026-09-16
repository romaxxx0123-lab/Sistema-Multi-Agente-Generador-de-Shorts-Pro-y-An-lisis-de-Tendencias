"""Cache por huella de contenido, con versionado por etapa.

Un video de 20 minutos tarda en analizarse. Como el usuario va a iterar sobre el
*estilo* mucho mas a menudo que sobre el *video*, guardamos cada etapa en disco
y la reutilizamos mientras el fichero de origen no cambie.

Dos detalles que importan en formato largo:

- **Huella rapida**: hashear 4 GB entero cuesta mas que muchas etapas del
  analisis, asi que por defecto muestreamos principio/medio/final junto al
  tamano. Es suficiente para detectar "es otro fichero" sin leerlo entero.
- **Version por etapa**: si cambia el codigo que genera una etapa, su cache
  queda invalidada sola en vez de devolver datos viejos con formato nuevo. La
  version la calcula `analysis.pipeline` hasheando el fuente de esa etapa, asi
  que no depende de acordarse de subir un numero.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import asdict, is_dataclass
from enum import Enum
import shutil
from pathlib import Path
from typing import Any

from .config import Settings

#: Cuanto leemos de cada zona en el modo de huella rapida.
_SAMPLE_BYTES = 4 * 1024 * 1024
#: Por debajo de este tamano hasheamos entero: no compensa muestrear.
_FULL_HASH_UNDER = 16 * 1024 * 1024
_FINGERPRINT_LEN = 24


def fingerprint_file(path: Path, *, fast: bool = True) -> str:
    """Identifica el contenido de un fichero de forma estable."""
    path = Path(path)
    size = path.stat().st_size
    h = hashlib.sha256()
    h.update(str(size).encode())

    if not fast or size <= _FULL_HASH_UNDER:
        with path.open("rb") as fh:
            for chunk in iter(lambda: fh.read(1024 * 1024), b""):
                h.update(chunk)
        return h.hexdigest()[:_FINGERPRINT_LEN]

    # Muestreo: principio, medio y final. Un re-encode o un corte cambian
    # practicamente siempre alguna de las tres zonas.
    with path.open("rb") as fh:
        for offset in (0, max(0, size // 2 - _SAMPLE_BYTES // 2), max(0, size - _SAMPLE_BYTES)):
            fh.seek(offset)
            h.update(fh.read(_SAMPLE_BYTES))
    return h.hexdigest()[:_FINGERPRINT_LEN]


def _serializar(objeto):
    """Como se guarda en JSON lo que JSON no sabe guardar.

    Antes aqui habia `default=str`, y eso es una trampa silenciosa: cualquier
    objeto que no supiera serializar se guardaba como su `repr` --
    `"WordBox(text='Ajustes', x=0.08, ...)"` -- y el fichero quedaba
    perfectamente valido. El fallo no aparecia al escribir sino **al volver a
    leer**, y ni siquiera siempre.

    Y mordio: las cajas del OCR se guardaban asi, de modo que el **segundo**
    analisis de un video con texto en pantalla reventaba al leer su propia
    cache. Nadie lo habia visto porque sin motor de OCR nunca habia cajas que
    guardar.

    Ahora lo que tiene campos se convierte a diccionario de verdad, y lo que no
    se sabe guardar **falla**, que es lo que tiene que hacer: un fallo al
    escribir se arregla en el sitio; una cache corrupta se descubre semanas
    despues y con suerte.
    """
    if isinstance(objeto, Path):
        return str(objeto)
    if is_dataclass(objeto) and not isinstance(objeto, type):
        return asdict(objeto)
    volcar = getattr(objeto, "model_dump", None)
    if callable(volcar):
        return volcar(mode="json")
    if isinstance(objeto, Enum):
        return objeto.value
    raise TypeError(
        f"El cache no sabe guardar un {type(objeto).__name__}. Conviertelo a "
        "diccionario en la etapa antes de escribirlo."
    )


class JobCache:
    """Carpeta de trabajo asociada a un fichero de entrada concreto."""

    def __init__(self, settings: Settings, source: Path | str) -> None:
        self.settings = settings
        self.source = Path(source).expanduser().resolve()
        self.fingerprint = fingerprint_file(
            self.source, fast=settings.fast_fingerprint
        )
        self.root = settings.jobs_dir / self.fingerprint
        self.artifacts = self.root / "artifacts"
        self.root.mkdir(parents=True, exist_ok=True)
        self.artifacts.mkdir(parents=True, exist_ok=True)

    # -- rutas -------------------------------------------------------------

    def stage_file(self, stage: str) -> Path:
        return self.root / f"{stage}.json"

    def artifact(self, name: str) -> Path:
        """Ruta para un fichero grande (proxy, wav, fotogramas, render)."""
        p = self.artifacts / name
        p.parent.mkdir(parents=True, exist_ok=True)
        return p

    # -- etapas ------------------------------------------------------------

    def read(self, stage: str, version: object = 1) -> dict[str, Any] | None:
        """Devuelve los datos de la etapa, o None si no hay o estan obsoletos."""
        f = self.stage_file(stage)
        if not f.is_file():
            return None
        try:
            payload = json.loads(f.read_text())
        except (json.JSONDecodeError, OSError):
            return None
        if not isinstance(payload, dict):
            return None
        if payload.get("_version") != version:
            return None
        return payload.get("data")

    def write(self, stage: str, data: Any, version: object = 1) -> None:
        """Guarda una etapa de forma atomica, para no dejar JSON a medias."""
        f = self.stage_file(stage)
        tmp = f.with_suffix(".json.tmp")
        tmp.write_text(
            json.dumps(
                {"_version": version, "source": str(self.source), "data": data},
                ensure_ascii=False,
                indent=2,
                default=_serializar,
            )
        )
        tmp.replace(f)

    def has(self, stage: str, version: object = 1) -> bool:
        return self.read(stage, version) is not None

    def invalidate(self, stage: str) -> None:
        self.stage_file(stage).unlink(missing_ok=True)

    def clear(self) -> None:
        """Borra todo lo cacheado de este video."""
        shutil.rmtree(self.root, ignore_errors=True)
        self.root.mkdir(parents=True, exist_ok=True)
        self.artifacts.mkdir(parents=True, exist_ok=True)

    def size_on_disk(self) -> int:
        return sum(f.stat().st_size for f in self.root.rglob("*") if f.is_file())
