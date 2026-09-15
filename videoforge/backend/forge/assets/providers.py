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
from ..config import Settings
from .coherence import judge, tag_stem
from .inspect import Inspection, inspect_cached
from .language import PEXELS_LOCALES, PIXABAY_LANGS, Translator, bank_query
from .types import Asset, AssetKind, AssetQuery


#: Trozos de una direccion que no dicen nada del contenido.
_RUIDO_URL = frozenset({"https", "http", "www", "com", "video", "videos", "photo"})


def _first_word(texto: str) -> str:
    """La cabeza de una consulta cuando no viene dada: su primera palabra."""
    palabras = tokenize(texto)
    return palabras[0] if palabras else ""

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
#: Lo cerca que puede estar el recorte del momento en el que se usa. Ensenar
#: como recuerdo lo que se esta viendo ahora mismo no recuerda nada.
MIN_SELF_DISTANCE = 8.0


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

    def _donde_se_vio(self, cabeza: str, ahora: float) -> list[tuple[float, str]]:
        """Momentos en los que eso que nombras estuvo **escrito en pantalla**.

        Es lo que convierte un recorte del propio video en un recurso con
        sentido: dices "la pestana de Ajustes" y se ensena el momento en el que
        Ajustes se veia. Un recordatorio, que es justo para lo que un editor
        usa un plano de archivo del propio material.

        Se prefiere lo **ya visto**: ensenar algo que todavia no has explicado
        confunde en vez de recordar.
        """
        raiz = tag_stem(cabeza)
        if not raiz:
            return []
        vistos = [
            (lectura.at, texto)
            for lectura in self.analysis.screen_text
            for texto in lectura.words
            if tag_stem(texto) == raiz
        ]
        anteriores = [v for v in vistos if v[0] < ahora - MIN_SELF_DISTANCE]
        posteriores = [v for v in vistos if v[0] > ahora + MIN_SELF_DISTANCE]
        anteriores.sort(key=lambda v: -v[0])
        posteriores.sort(key=lambda v: v[0])
        return anteriores + posteriores

    def search(self, query: AssetQuery) -> list[Asset]:
        """Un recorte del propio video, pero solo si viene a cuento.

        Antes elegia por **interes visual** y el montaje lo anunciaba como
        "material de apoyo porque ahi hablas de X", que era falso: ese recorte
        no tenia nada que ver con X, era el plano con mas contraste. Ahora solo
        sale cuando lo que nombras se vio en pantalla en otro momento, y lo que
        se ensena es ese momento.
        """
        media = self.analysis.media
        cabeza = query.head or _first_word(query.text)
        ahora = query.at_timeline
        candidatos: list[Asset] = []

        for i, (cuando, texto) in enumerate(self._donde_se_vio(cabeza, ahora)):
            shot = self.analysis.shot_at(cuando)
            mitad = query.seconds / 2
            inicio = max(0.0, cuando - mitad)
            fin = inicio + query.seconds
            if shot is not None:
                # Sin salirse del plano: cruzar un corte dentro de un b-roll se
                # ve como un fallo de montaje.
                inicio = max(inicio, shot.start)
                fin = min(max(fin, inicio + 0.5), shot.end)
            if fin - inicio < 0.5:
                continue

            foco = self.analysis.focus_at(cuando)
            nitidez = foco.concentration if foco is not None else 0.5
            candidatos.append(
                Asset(
                    id=f"self-{int(cuando * 10):05d}",
                    kind=AssetKind.SELF,
                    provider=self.name,
                    source_start=round(inicio, 3),
                    source_end=round(fin, 3),
                    width=media.video.display_width if media.video else 0,
                    height=media.video.display_height if media.video else 0,
                    duration=round(fin - inicio, 3),
                    query=query.text,
                    reason=(
                        f'de tu propio video: ahi se veia "{texto}" en pantalla '
                        f"({cuando:.0f}s)"
                    ),
                    license="propio",
                    # Sigue por debajo de una coincidencia de etiquetas, que es
                    # material buscado a proposito; pero ya no es relleno.
                    relevance=round(
                        SELF_MAX_RELEVANCE * (0.7 + 0.3 * nitidez), 3
                    ),
                )
            )
            if len(candidatos) >= query.limit:
                break

        return candidatos


class LocalProvider:
    """Tu carpeta de material etiquetado.

    Las etiquetas salen de tres sitios, en este orden: un `tags.json` junto a
    los ficheros con la forma `{"fichero.mp4": ["etiqueta", "otra"]}`, **las
    carpetas** en las que esta el fichero, y el nombre del fichero (separado
    por guiones o guiones bajos).

    Y antes de ofrecer nada, se **mira** el fichero: cuanto dura de verdad, que
    tamano tiene y si se ve algo (ver `assets/inspect.py`). Las dos cosas
    arreglan fallos que estaban a la vista:

    - Sin las carpetas como etiqueta, la forma natural de ordenar material --
      `assets/palworld/base-01.mp4` -- daba las etiquetas `["base"]`, sin
      rastro de Palworld, asi que la regla de coherencia descartaba tu propio
      material justo cuando hablabas de Palworld.
    - Sin mirar el fichero, el `Asset` salia con `width`, `height` y `duration`
      a cero, y `plan/broll.py::fit_asset` esta escrito alrededor de esos tres
      numeros: toda la parte de "adaptate a lo que has conseguido" se aplicaba
      solo al material de los bancos, que si manda metadatos, y con tu
      biblioteca se saltaba entera.
    """

    name = "local"

    def __init__(
        self,
        directory: Path,
        *,
        settings: Settings | None = None,
        look: bool = True,
    ) -> None:
        self.directory = Path(directory)
        self.settings = settings
        self.look = look
        self._tags = self._load_tags()
        #: lo que se ha descartado al mirarlo, y por que. Para poder contarlo.
        self.rejected: list[tuple[Path, str]] = []

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

    def _folder_tags(self, path: Path) -> list[str]:
        """Las carpetas en las que esta el fichero, de fuera hacia dentro.

        De fuera hacia dentro porque asi la primera es el sujeto: en
        `palworld/bases/nocturna.mp4`, el material es **de Palworld** y lo de
        bases y nocturna lo describe.
        """
        try:
            relativa = path.parent.relative_to(self.directory)
        except ValueError:
            return []
        etiquetas: list[str] = []
        for parte in relativa.parts:
            etiquetas += tokenize(parte.replace("-", " ").replace("_", " "))
        return etiquetas

    def _tags_for(self, path: Path) -> list[str]:
        """Las etiquetas de un fichero, **en orden**.

        El orden importa: la primera dice de que es el material y las demas lo
        describen (ver `assets/coherence.py`). Primero las de `tags.json`, que
        son las que escribes tu a mano; despues las carpetas, que es como se
        ordena el material de verdad; y al final el nombre del fichero.
        """
        etiquetas: list[str] = list(self._tags.get(path.name, []))
        etiquetas += self._folder_tags(path)
        etiquetas += tokenize(path.stem.replace("-", " ").replace("_", " "))
        vistas: set[str] = set()
        return [t for t in etiquetas if not (t in vistas or vistas.add(t))]

    def _look_at(self, path: Path) -> Inspection | None:
        """Mira el fichero, si toca mirarlo."""
        if not self.look:
            return None
        return inspect_cached(path, self.settings)

    def search(self, query: AssetQuery) -> list[Asset]:
        if not self.directory.is_dir():
            return []

        resultados: list[Asset] = []
        self.rejected = []

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
            veredicto = judge(
                etiquetas,
                head=query.head or _first_word(query.text),
                context=f"{query.text} {query.context}",
                vocabulary=query.vocabulary,
            )
            if not veredicto:
                continue

            # Y ahora que se sabe que **viene a cuento**, se mira si **se ve**.
            # En este orden porque mirar cuesta (ffprobe y unos fotogramas) y
            # la mayoria de los ficheros de una biblioteca no vienen a cuento.
            vista = self._look_at(path)
            if vista is not None and not vista.ok:
                self.rejected.append((path, vista.reason))
                continue

            comunes = set(veredicto.overlap)
            # El suelo de 0.4 deja el material propio (tope SELF_MAX_RELEVANCE)
            # siempre por debajo; el resto sube con lo que encaje de verdad.
            pedidas = set(tokenize(query.text)) or comunes
            relevancia = (
                0.4 + 0.6 * len(comunes & pedidas) / len(pedidas) if pedidas else 0.4
            )
            medido = {}
            if vista is not None and vista.measured:
                # El tamano que se apunta es el **util**: si el material lleva
                # barras negras, lo que hay para ensenar es lo de dentro, y es
                # con eso con lo que hay que decidir si tapa la pantalla.
                medido = {
                    "width": vista.usable_width,
                    "height": vista.usable_height,
                    "duration": round(vista.duration, 3),
                    "crop": vista.crop if vista.crop and vista.crop.is_useful() else None,
                }
            resultados.append(
                Asset(
                    id=f"local-{path.stem}",
                    kind=kind,
                    provider=self.name,
                    path=path,
                    query=query.text,
                    reason=f"de tu biblioteca: {veredicto.reason}",
                    license="propio",
                    relevance=round(min(1.0, relevancia), 3),
                    **medido,
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

    def __init__(
        self,
        name: str,
        api_key: str,
        *,
        timeout: float = 15.0,
        translator: Translator | None = None,
    ) -> None:
        self.name = name
        self.api_key = api_key
        self.timeout = timeout
        self.translator = translator

    # -- peticion (separada para poder sustituirla en los tests) -----------

    def _request(self, url: str, headers: dict[str, str]) -> dict:
        peticion = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(peticion, timeout=self.timeout) as respuesta:
            return json.loads(respuesta.read().decode("utf-8"))

    def _fetch(self, query: AssetQuery, texto: str | None = None) -> dict:
        """Pide al banco, **diciendole en que idioma se le habla**.

        Faltaba, y no era un detalle: se le mandaba "impresora" sin mas y
        contestaba etiquetando en ingles, que es lo unico que sabe hacer si no
        se le dice nada. Ver `assets/language.py`.
        """
        texto = texto if texto is not None else query.text
        idioma = (query.language or "es").lower()[:2]

        if self.name == "pexels":
            params: dict[str, object] = {
                "query": texto,
                "per_page": query.limit,
                "orientation": query.orientation,
            }
            if idioma in PEXELS_LOCALES:
                params["locale"] = PEXELS_LOCALES[idioma]
            return self._request(
                f"https://api.pexels.com/videos/search?{urllib.parse.urlencode(params)}",
                {"Authorization": self.api_key},
            )

        params = {
            "key": self.api_key,
            "q": texto,
            "per_page": max(3, query.limit),
            "safesearch": "true",
        }
        if idioma in PIXABAY_LANGS:
            # Pixabay tambien **localiza sus etiquetas** con esto, que es lo que
            # hace que la regla de coherencia pueda cumplirse en espanol.
            params["lang"] = idioma
        return self._request(
            f"https://pixabay.com/api/videos/?{urllib.parse.urlencode(params)}", {}
        )

    @staticmethod
    def _tags_de(item: dict) -> list[str]:
        """Con que viene etiquetado un resultado del banco.

        Hace falta para poder comprobar que es de lo que hablas. Pixabay manda
        `tags` separadas por comas. Pexels no manda etiquetas, pero su `url`
        lleva el titulo dentro ("/video/man-typing-on-a-laptop-1234/"), que
        para esto sirve igual.
        """
        crudas = item.get("tags")
        if isinstance(crudas, str):
            etiquetas = [t.strip() for t in crudas.split(",")]
        elif isinstance(crudas, list):
            etiquetas = [str(t) for t in crudas]
        else:
            etiquetas = []
        for campo in ("alt", "url"):
            valor = item.get(campo)
            if isinstance(valor, str):
                etiquetas += re.split(r"[^\w]+", valor)
        return [
            t for t in etiquetas
            if t and not t.isdigit() and t.lower() not in _RUIDO_URL
        ]

    def _parse(self, datos: dict, query: AssetQuery, alias: tuple[str, ...] = ()) -> list[Asset]:
        salida: list[Asset] = []

        if self.name == "pexels":
            for item in datos.get("videos", []) or []:
                ficheros = item.get("video_files") or []
                if not ficheros:
                    continue
                # El de mayor altura que siga siendo razonable para 1080p.
                mejor = max(ficheros, key=lambda f: f.get("height") or 0)
                veredicto = self._coherente(item, query, alias)
                if not veredicto:
                    continue
                salida.append(
                    Asset(
                        id=f"pexels-{item.get('id')}",
                        kind=AssetKind.VIDEO,
                        provider=self.name,
                        width=mejor.get("width") or 0,
                        height=mejor.get("height") or 0,
                        duration=float(item.get("duration") or 0),
                        query=query.text,
                        reason=f"Pexels · {veredicto.reason}",
                        license="Pexels License",
                        attribution=f"Pexels / {(item.get('user') or {}).get('name', 'desconocido')}",
                        relevance=0.6,
                        source_url=str(mejor.get("link") or ""),
                    )
                )
        else:
            for item in datos.get("hits", []) or []:
                videos = (item.get("videos") or {})
                mejor = videos.get("large") or videos.get("medium") or {}
                if not mejor:
                    continue
                veredicto = self._coherente(item, query, alias)
                if not veredicto:
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
                        reason=f"Pixabay · {veredicto.reason}",
                        license="Pixabay Content License",
                        attribution=f"Pixabay / {item.get('user', 'desconocido')}",
                        relevance=0.6,
                        source_url=str(mejor.get("url") or ""),
                    )
                )

        return salida

    def _coherente(self, item: dict, query: AssetQuery, alias: tuple[str, ...] = ()):
        """Que el resultado sea de lo que se nombra, y no de lo que el banco tenga.

        Un banco de stock **siempre** devuelve algo: si le pides "palworld" te
        da lo que mas se le parezca, que sera un mando o una pantalla con
        cualquier otro juego. Pedirlo no es encontrarlo, asi que el resultado
        se comprueba contra sus propias etiquetas y, si no lleva lo que
        nombras, no entra.
        """
        return judge(
            self._tags_de(item),
            head=query.head or _first_word(query.text),
            context=f"{query.text} {query.context}",
            vocabulary=query.vocabulary,
            # Un banco manda las etiquetas como quiere: ahi no hay un sujeto en
            # primera posicion del que fiarse, asi que solo se comprueba que
            # lleve lo que nombras.
            subject_first=False,
            # ...o como lo llame el banco en su idioma, que sigue siendo lo que
            # nombras. Sin esto la regla era imposible de cumplir en espanol.
            head_aliases=alias,
        )

    def search(self, query: AssetQuery) -> list[Asset]:
        # Se busca con el termino que el banco tiene indexado, y se guarda como
        # lo llama el para poder comprobar despues que ha traido eso.
        texto, alias = bank_query(
            query.text,
            query.head or _first_word(query.text),
            query.language,
            self.translator,
        )
        try:
            datos = self._fetch(query, texto)
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError):
            # Un banco caido o sin red no puede tumbar el montaje.
            return []
        return self._parse(datos, query, alias)


# ---------------------------------------------------------------------------
# Registro
# ---------------------------------------------------------------------------


def build_providers(
    analysis: Analysis | None = None,
    *,
    local_dir: Path | None = None,
    allow_network: bool = True,
    settings: Settings | None = None,
) -> list[BrollProvider]:
    """Monta la lista de proveedores disponibles, por orden de preferencia."""
    proveedores: list[BrollProvider] = []

    if local_dir is not None and Path(local_dir).is_dir():
        proveedores.append(LocalProvider(local_dir, settings=settings))

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
