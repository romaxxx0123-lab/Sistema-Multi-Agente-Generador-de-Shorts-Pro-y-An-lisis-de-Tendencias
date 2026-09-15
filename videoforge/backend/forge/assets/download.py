"""Traer a disco el material que un banco solo describe.

Los proveedores de stock devuelven una ficha con una **direccion**, no un
fichero. Y el render, cuando no encuentra el fichero, se salta ese material:

    if not asset.is_self and (asset.path is None or not ...is_file()):
        continue   # "se omite en vez de tumbar el render por una descarga
                   #  que fallo"

Esa descarga no existia. Con una clave de Pexels o de Pixabay configurada, el
montaje decia "material de apoyo en 60s porque ahi hablas de X" y el video
salia sin un solo material, sin un aviso y sin forma de notarlo salvo mirando
el fichero. Era el mismo agujero que tenian los efectos de sonido y la musica,
con el agravante de que aqui si habia trabajo hecho a los dos lados.

Lo que se pide de una descarga en un montaje que puede tardar una hora:

- **que no cueste dos veces**: el fichero queda cacheado por identificador, asi
  que reencuadrar o cambiar de estilo no vuelve a bajarlo;
- **que no crezca sin limite**: hay un tope por fichero, porque un clip 4K de
  un banco puede pasar de cien megas y no se va a ver mas que dos segundos;
- **que no bloquee**: tiempo limite por descarga, y si falla se sigue sin ese
  material en vez de tumbar el render;
- **que se escriba entero o no se escriba**: se baja a un temporal y se renombra
  al final, para que una descarga cortada no deje un fichero a medias que el
  siguiente render tome por bueno.
"""

from __future__ import annotations

import shutil
import urllib.error
import urllib.request
from pathlib import Path

from .types import Asset

#: Tope por fichero. Un clip de apoyo se ve dos o tres segundos; si el banco
#: ofrece cien megas de 4K, no compensa ni el tiempo ni el disco.
MAX_BYTES = 80 * 1024 * 1024
#: Tiempo limite de una descarga.
TIMEOUT = 45.0
#: Extension por defecto cuando la direccion no dice cual es.
DEFAULT_EXT = ".mp4"
#: Extensiones que se aceptan tal cual de una direccion.
KNOWN_EXTS = (".mp4", ".mov", ".webm", ".mkv", ".m4v", ".jpg", ".jpeg", ".png", ".webp")


def target_path(asset: Asset, cache_dir: Path) -> Path:
    """Donde vive en disco ese material, se haya bajado ya o no."""
    sufijo = next(
        (e for e in KNOWN_EXTS if asset.source_url.lower().split("?")[0].endswith(e)),
        DEFAULT_EXT,
    )
    return Path(cache_dir) / "broll" / f"{asset.id}{sufijo}"


def ensure_local(
    asset: Asset,
    cache_dir: Path,
    *,
    timeout: float = TIMEOUT,
    max_bytes: int = MAX_BYTES,
    opener=urllib.request.urlopen,
) -> Path | None:
    """Deja el material en disco y devuelve su ruta, o `None` si no se pudo.

    `opener` se puede sustituir en los tests: asi se prueba la descarga entera
    -- cache, tope de tamano, escritura atomica -- sin depender de la red.
    """
    if asset.is_self:
        return None
    if asset.path is not None and Path(asset.path).is_file():
        return Path(asset.path)
    if not asset.source_url:
        return None

    destino = target_path(asset, cache_dir)
    if destino.is_file() and destino.stat().st_size > 0:
        return destino

    destino.parent.mkdir(parents=True, exist_ok=True)
    temporal = destino.with_name(f".{destino.name}.parcial")
    try:
        with opener(asset.source_url, timeout=timeout) as respuesta:
            declarado = respuesta.headers.get("Content-Length") if respuesta.headers else None
            if declarado and declarado.isdigit() and int(declarado) > max_bytes:
                return None
            escrito = 0
            with temporal.open("wb") as salida:
                while trozo := respuesta.read(1 << 16):
                    escrito += len(trozo)
                    if escrito > max_bytes:
                        # Bancos que no declaran el tamano: se corta al vuelo.
                        raise ValueError("el material pesa mas de lo razonable")
                    salida.write(trozo)
    except (urllib.error.URLError, TimeoutError, OSError, ValueError):
        temporal.unlink(missing_ok=True)
        return None

    if escrito <= 0:
        temporal.unlink(missing_ok=True)
        return None
    shutil.move(str(temporal), str(destino))
    return destino
