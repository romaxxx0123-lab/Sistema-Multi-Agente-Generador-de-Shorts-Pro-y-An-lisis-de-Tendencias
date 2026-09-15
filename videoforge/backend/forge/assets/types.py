"""Material de apoyo: lo que se puede insertar sobre el video base."""

from __future__ import annotations

from enum import Enum
from pathlib import Path

from pydantic import BaseModel, Field


class AssetKind(str, Enum):
    VIDEO = "video"
    IMAGE = "image"
    #: recorte del propio video de origen, no hay fichero aparte
    SELF = "self"
    AUDIO = "audio"


class Crop(BaseModel):
    """Un recorte en pixeles del material, para dejar fuera lo que no es imagen.

    Un clip 2.35:1 dentro de un 16:9 dice que mide 1280x720 y de imagen tiene
    la mitad; el resto son barras negras. Sin esto, la decision de "esto tapa
    la pantalla o va en ventanita" se tomaba con un numero falso, y encima el
    montaje pegaba las barras encima del video.
    """

    x: int = 0
    y: int = 0
    w: int = 0
    h: int = 0

    def is_useful(self) -> bool:
        return self.w > 1 and self.h > 1


class Asset(BaseModel):
    """Una pieza de material de apoyo, venga de donde venga."""

    id: str
    kind: AssetKind
    provider: str
    #: fichero en disco; vacio en los assets derivados del propio video
    path: Path | None = None
    #: para `SELF`: que tramo del original se reutiliza
    source_start: float = 0.0
    source_end: float = 0.0
    width: int = 0
    height: int = 0
    duration: float = 0.0
    #: consulta que lo trajo, para poder explicar la decision y re-buscar
    query: str = ""
    #: por que se eligio este y no otro
    reason: str = ""
    #: de donde se baja, cuando el proveedor solo da una ficha. Es un campo del
    #: modelo y no un apano en `__dict__` porque el EDL se guarda en JSON: en
    #: `__dict__` la direccion se perdia al guardarlo, y al volver a renderizar
    #: ese material ya no se podia traer.
    source_url: str = ""
    license: str = ""
    attribution: str = ""
    #: 0..1, cuanto encaja con la consulta segun el proveedor
    relevance: float = 0.5
    #: barras negras que hay que quitarle al pegarlo (ver `assets/inspect.py`).
    #: `width` y `height` son ya los utiles, los de dentro del recorte.
    crop: Crop | None = None

    @property
    def is_self(self) -> bool:
        return self.kind is AssetKind.SELF

    @property
    def aspect(self) -> float:
        return self.width / self.height if self.height else 0.0

    @property
    def is_vertical(self) -> bool:
        return 0.0 < self.aspect < 1.0

    def credit_line(self) -> str:
        """Linea de atribucion para el fichero de creditos del render."""
        if self.is_self:
            return ""
        partes = [p for p in (self.attribution, self.license) if p]
        return f"{self.id}: {' · '.join(partes)}" if partes else ""


class AssetQuery(BaseModel):
    """Lo que se le pide a un proveedor."""

    text: str
    seconds: float = 3.0
    orientation: str = "landscape"  # landscape | portrait | any
    limit: int = 8
    #: momento del montaje para el que se busca, por si el proveedor lo
    #: necesita (el proveedor `self` lo usa para no repetir lo que ya se ve)
    at_timeline: float = 0.0
    #: contexto adicional (lo que se dice alrededor), para desempatar
    context: str = ""
    #: la palabra concreta que se esta nombrando. El resto de `text` es
    #: contexto: compartirlo no convierte un material en el que hace falta.
    head: str = ""
    #: todo lo que se dice o se lee en pantalla **en todo el video**. Sirve
    #: para descartar material que va de algo que ahi no se menciona nunca.
    vocabulary: list[str] = Field(default_factory=list)
    #: el idioma en el que hablas, tal como lo dice la transcripcion. Hace
    #: falta porque a un banco de stock se le estaba preguntando en espanol y
    #: exigiendole despues que respondiera con etiquetas en espanol, cosa que
    #: no hace nunca (ver `assets/language.py`).
    language: str = "es"


class AssetBundle(BaseModel):
    """Los assets resueltos de un montaje, con sus creditos."""

    assets: dict[str, Asset] = Field(default_factory=dict)

    def add(self, asset: Asset) -> Asset:
        self.assets[asset.id] = asset
        return asset

    def get(self, asset_id: str) -> Asset | None:
        return self.assets.get(asset_id)

    def credits(self) -> str:
        lineas = [a.credit_line() for a in self.assets.values()]
        lineas = [l for l in lineas if l]
        if not lineas:
            return ""
        return "Material de apoyo utilizado:\n" + "\n".join(f"  {l}" for l in sorted(lineas))
