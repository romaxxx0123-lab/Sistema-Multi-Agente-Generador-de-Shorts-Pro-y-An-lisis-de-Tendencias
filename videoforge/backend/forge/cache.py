"""Cache por huella de contenido, con versionado por etapa.

Un video de 20 minutos tarda en analizarse. Como el usuario va a iterar sobre el
*estilo* mucho mas a menudo que sobre el *video*, guardamos cada etapa en disco
y la reutilizamos mientras el fichero de origen no cambie.

Dos detalles que importan en formato largo:

- **Huella rapida**: hashear 4 GB entero cuesta mas que muchas etapas del
  analisis, asi que por defecto muestreamos principio/medio/final junto al
  tamano. Es suficiente para detectar "es otro fichero" sin leerlo entero.
- **Version por etapa**: si cambia el codigo que genera una etapa, su cache
  queda invalidada sola en vez de devolver datos viejos con formato nuevo.
"""

from __future__ import annotations

import hashlib
import json
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

    def read(self, stage: str, version: int = 1) -> dict[str, Any] | None:
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

    def write(self, stage: str, data: Any, version: int = 1) -> None:
        """Guarda una etapa de forma atomica, para no dejar JSON a medias."""
        f = self.stage_file(stage)
        tmp = f.with_suffix(".json.tmp")
        tmp.write_text(
            json.dumps(
                {"_version": version, "source": str(self.source), "data": data},
                ensure_ascii=False,
                indent=2,
                default=str,
            )
        )
        tmp.replace(f)

    def has(self, stage: str, version: int = 1) -> bool:
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
