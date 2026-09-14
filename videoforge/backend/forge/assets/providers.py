"""De donde sale el material de apoyo.

Cuatro proveedores, enchufables y en orden de fiabilidad:

- **`self`**: del propio video. Cero dependencias y siempre disponible. En una
  guia es util de verdad: recuperar un momento anterior ampliado mientras se
  explica lo que pasaba ahi.
- **`local`**: tu carpeta de material, etiquetada. Sin red y sin dudas de
  licencia.
- **`pexels` / `pixabay`**: bancos gratuitos. Necesitan una clave (gratuita) y
  conexion. Son opcionales a proposito: el sistema funciona sin ellos.

Todos devuelven `Asset`, asi que el planner no sabe ni le importa de donde
salio cada pieza.
"""

from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Protocol, runtime_checkable

from ..analysis.types import Analysis
from .types import Asset, AssetKind, AssetQuery

#: Extensiones que reconocemos en la carpeta local.
VIDEO_EXTS = {".mp4", ".mov", ".mkv", ".webm", ".m4v"}
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}

#: Palabras demasiado comunes para servir de etiqueta.
_STOPWORDS = frozenset(
    {
        "el", "la", "los", "las", "un", "una", "de", "del", "y", "o", "que",
        "en", "con", "por", "para", "a", "al", "es", "se", "su", "lo", "the",
        "of", "and", "to", "in", "for", "a", "an", "is", "on", "with",
    }
)


def tokenize(text: str) -> list[str]:
    """Parte un texto en palabras utiles para comparar."""
    palabras = re.findall(r"[\wÀ-ɏ]+", text.lower())
    return [p for p in palabras if len(p) > 2 and p not in _STOPWORDS]


@runtime_checkable
class BrollProvider(Protocol):
    """Lo unico que tiene que saber hacer un proveedor."""

    name: str

    def search(self, query: AssetQuery) -> list[Asset]:
        ...


# ---------------------------------------------------------------------------
# Del propio video
# ---------------------------------------------------------------------------


#: Tope de relevancia del material sacado del propio video. Cualquier
#: coincidencia real de palabras queda por encima.
SELF_MAX_RELEVANCE = 0.35


class SelfProvider:
    """Material sacado del propio video de origen.

    No entiende la consulta: elige por **interes visual**, usando la saliencia
    que ya calculamos. Es honesto decirlo, porque significa que sirve como
    recurso de apoyo generico (un recordatorio, un plano de detalle) y no para
    ilustrar un concepto concreto.

    A cambio no necesita red, ni claves, ni licencias, y siempre esta.
    """

    name = "self"

    def __init__(self, analysis: Analysis, *, min_concentration: float = 0.25) -> None:
        self.analysis = analysis
        self.min_concentration = min_concentration

    def search(self, query: AssetQuery) -> list[Asset]:
        media = self.analysis.media
        candidatos: list[Asset] = []

        for shot in self.analysis.shots:
            foco = self.analysis.focus_of(shot.index)
            if foco is None or foco.concentration < self.min_concentration:
                continue
            if shot.duration < max(1.0, query.seconds * 0.6):
                continue

            # Se toma del centro del plano, lejos de los cortes.
            centro = shot.start + shot.duration / 2
            mitad = min(query.seconds, shot.duration) / 2

            candidatos.append(
                Asset(
                    id=f"self-{shot.index:03d}",
                    kind=AssetKind.SELF,
                    provider=self.name,
                    source_start=round(max(shot.start, centro - mitad), 3),
                    source_end=round(min(shot.end, centro + mitad), 3),
                    width=media.video.display_width if media.video else 0,
                    height=media.video.display_height if media.video else 0,
                    duration=round(min(query.seconds, shot.duration), 3),
                    query=query.text,
                    reason=(
                        f"recorte del plano {shot.index} ({shot.start:.0f}s), "
                        f"donde la imagen tiene mas interes visual"
                    ),
                    license="propio",
                    # Un recorte del propio video no ilustra de lo que se esta
                    # hablando: es un recurso de relleno, por bonito que sea el
                    # plano. Por eso su relevancia vive en una banda por debajo
                    # de cualquier coincidencia real de palabras. Antes se
                    # usaba la concentracion de la saliencia tal cual, en la
                    # misma escala que los demas, y un plano vistoso le ganaba
                    # a un material que si hablaba del tema: se decia "Chrome"
                    # y salia un trozo del mismo video.
                    relevance=round(foco.concentration * SELF_MAX_RELEVANCE, 3),
                )
            )

        candidatos.sort(key=lambda a: -a.relevance)
        return candidatos[: query.limit]


# ---------------------------------------------------------------------------
# Carpeta local
# ---------------------------------------------------------------------------


class LocalProvider:
    """Tu carpeta de material etiquetado.

    Las etiquetas salen del nombre del fichero (separadas por guiones o guiones
    bajos) y, si existe, de un `tags.json` junto a los ficheros con la forma
    `{"fichero.mp4": ["etiqueta", "otra"]}`.
    """

    name = "local"

    def __init__(self, directory: Path) -> None:
        self.directory = Path(directory)
        self._tags = self._load_tags()

    def _load_tags(self) -> dict[str, list[str]]:
        fichero = self.directory / "tags.json"
        if not fichero.is_file():
            return {}
        try:
            datos = json.loads(fichero.read_text())
        except (json.JSONDecodeError, OSError):
            return {}
        if not isinstance(datos, dict):
            return {}
        return {
            str(k): [str(x).lower() for x in v]
            for k, v in datos.items()
            if isinstance(v, list)
        }

    def _tags_for(self, path: Path) -> set[str]:
        etiquetas = set(self._tags.get(path.name, []))
        etiquetas.update(tokenize(path.stem.replace("-", " ").replace("_", " ")))
        return etiquetas

    def search(self, query: AssetQuery) -> list[Asset]:
        if not self.directory.is_dir():
            return []

        buscadas = set(tokenize(query.text)) | set(tokenize(query.context))
        resultados: list[Asset] = []

        for path in sorted(self.directory.rglob("*")):
            if not path.is_file():
                continue
            ext = path.suffix.lower()
            if ext in VIDEO_EXTS:
                kind = AssetKind.VIDEO
            elif ext in IMAGE_EXTS:
                kind = AssetKind.IMAGE
            else:
                continue

            etiquetas = self._tags_for(path)
            comunes = buscadas & etiquetas
            if buscadas and not comunes:
                continue

            # Cualquier coincidencia de palabras vale mas que un relleno: el
            # suelo de 0.4 deja el material propio (tope SELF_MAX_RELEVANCE)
            # siempre por debajo.
            relevancia = (
                0.4 + 0.6 * len(comunes) / len(buscadas) if buscadas else 0.4
            )
            resultados.append(
                Asset(
                    id=f"local-{path.stem}",
                    kind=kind,
                    provider=self.name,
                    path=path,
                    query=query.text,
                    reason=(
                        f"de tu biblioteca, coincide en: {', '.join(sorted(comunes))}"
                        if comunes
                        else "de tu biblioteca"
                    ),
                    license="propio",
                    relevance=round(min(1.0, relevancia), 3),
                )
            )

        resultados.sort(key=lambda a: -a.relevance)
        return resultados[: query.limit]


# ---------------------------------------------------------------------------
# Bancos gratuitos
# ---------------------------------------------------------------------------


class StockProvider:
    """Banco de video e imagen gratuito (Pexels o Pixabay).

    Necesita una clave gratuita en `PEXELS_API_KEY` o `PIXABAY_API_KEY`. Si no
    esta, el proveedor no se registra y el resto del sistema sigue igual: es
    justo el motivo de tener varios proveedores.
    """

    def __init__(self, name: str, api_key: str, *, timeout: float = 15.0) -> None:
        self.name = name
        self.api_key = api_key
        self.timeout = timeout

    # -- peticion (separada para poder sustituirla en los tests) -----------

    def _request(self, url: str, headers: dict[str, str]) -> dict:
        peticion = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(peticion, timeout=self.timeout) as respuesta:
            return json.loads(respuesta.read().decode("utf-8"))

    def _fetch(self, query: AssetQuery) -> dict:
        if self.name == "pexels":
            params = urllib.parse.urlencode(
                {
                    "query": query.text,
                    "per_page": query.limit,
                    "orientation": query.orientation,
                }
            )
            return self._request(
                f"https://api.pexels.com/videos/search?{params}",
                {"Authorization": self.api_key},
            )

        params = urllib.parse.urlencode(
            {
                "key": self.api_key,
                "q": query.text,
                "per_page": max(3, query.limit),
                "safesearch": "true",
            }
        )
        return self._request(f"https://pixabay.com/api/videos/?{params}", {})

    def _parse(self, datos: dict, query: AssetQuery) -> list[Asset]:
        salida: list[Asset] = []

        if self.name == "pexels":
            for item in datos.get("videos", []) or []:
                ficheros = item.get("video_files") or []
                if not ficheros:
                    continue
                # El de mayor altura que siga siendo razonable para 1080p.
                mejor = max(ficheros, key=lambda f: f.get("height") or 0)
                salida.append(
                    Asset(
                        id=f"pexels-{item.get('id')}",
                        kind=AssetKind.VIDEO,
                        provider=self.name,
                        width=mejor.get("width") or 0,
                        height=mejor.get("height") or 0,
                        duration=float(item.get("duration") or 0),
                        query=query.text,
                        reason=f"resultado de Pexels para '{query.text}'",
                        license="Pexels License",
                        attribution=f"Pexels / {(item.get('user') or {}).get('name', 'desconocido')}",
                        relevance=0.6,
                    ).model_copy(update={"path": None})
                )
                salida[-1].__dict__["_download_url"] = mejor.get("link")
        else:
            for item in datos.get("hits", []) or []:
                videos = (item.get("videos") or {})
                mejor = videos.get("large") or videos.get("medium") or {}
                if not mejor:
                    continue
                salida.append(
                    Asset(
                        id=f"pixabay-{item.get('id')}",
                        kind=AssetKind.VIDEO,
                        provider=self.name,
                        width=mejor.get("width") or 0,
                        height=mejor.get("height") or 0,
                        duration=float(item.get("duration") or 0),
                        query=query.text,
                        reason=f"resultado de Pixabay para '{query.text}'",
                        license="Pixabay Content License",
                        attribution=f"Pixabay / {item.get('user', 'desconocido')}",
                        relevance=0.6,
                    )
                )
                salida[-1].__dict__["_download_url"] = mejor.get("url")

        return salida

    def search(self, query: AssetQuery) -> list[Asset]:
        try:
            datos = self._fetch(query)
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError):
            # Un banco caido o sin red no puede tumbar el montaje.
            return []
        return self._parse(datos, query)


# ---------------------------------------------------------------------------
# Registro
# ---------------------------------------------------------------------------


def build_providers(
    analysis: Analysis | None = None,
    *,
    local_dir: Path | None = None,
    allow_network: bool = True,
) -> list[BrollProvider]:
    """Monta la lista de proveedores disponibles, por orden de preferencia."""
    proveedores: list[BrollProvider] = []

    if local_dir is not None and Path(local_dir).is_dir():
        proveedores.append(LocalProvider(local_dir))

    if allow_network:
        for nombre, variable in (("pexels", "PEXELS_API_KEY"), ("pixabay", "PIXABAY_API_KEY")):
            clave = os.environ.get(variable, "").strip()
            if clave:
                proveedores.append(StockProvider(nombre, clave))

    # El ultimo, porque siempre devuelve algo y taparia a los demas.
    if analysis is not None:
        proveedores.append(SelfProvider(analysis))

    return proveedores


def search_all(providers: list[BrollProvider], query: AssetQuery) -> list[Asset]:
    """Busca en todos los proveedores y devuelve los resultados ordenados."""
    resultados: list[Asset] = []
    for proveedor in providers:
        try:
            resultados.extend(proveedor.search(query))
        except Exception:
            # Un proveedor roto no debe impedir que los demas respondan.
            continue
    resultados.sort(key=lambda a: -a.relevance)
    return resultados
