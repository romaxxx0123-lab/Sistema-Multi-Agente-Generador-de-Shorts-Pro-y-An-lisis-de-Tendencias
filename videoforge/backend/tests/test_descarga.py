"""Traer a disco el material que un banco solo describe.

Este fichero existe por un agujero que no daba ningun error. Los proveedores de
stock devuelven una ficha con una **direccion**, no un fichero; el render,
cuando no encuentra el fichero, se salta ese material, y el comentario decia
"se omite en vez de tumbar el render por una descarga que fallo".

Esa descarga no existia. Con una clave de Pexels o de Pixabay configurada, el
montaje escribia "material de apoyo en 60s porque ahi hablas de X" y el video
salia sin un solo material, sin un aviso, y sin forma de notarlo salvo abriendo
el fichero y mirando.

Las pruebas van con `file://`, que `urllib` abre igual que `https://`: asi se
prueba la descarga entera -- cache, tope de tamano, escritura atomica, fallo --
sin depender de la red.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from forge.assets.download import MAX_BYTES, ensure_local, target_path
from forge.assets.types import Asset, AssetKind


@pytest.fixture()
def clip(tmp_path: Path) -> Asset:
    fichero = tmp_path / "origen.mp4"
    fichero.write_bytes(b"x" * 4096)
    return Asset(
        id="pixabay-7", kind=AssetKind.VIDEO, provider="pixabay",
        source_url=fichero.as_uri(),
    )


def test_el_material_de_un_banco_acaba_en_disco(clip: Asset, tmp_path: Path) -> None:
    destino = ensure_local(clip, tmp_path / "cache")
    assert destino is not None and destino.is_file()
    assert destino.stat().st_size == 4096


def test_no_se_baja_dos_veces(clip: Asset, tmp_path: Path) -> None:
    """Un montaje de veinte minutos se reencuadra varias veces."""
    cache = tmp_path / "cache"
    primero = ensure_local(clip, cache)
    antes = primero.stat().st_mtime_ns

    roto = clip.model_copy(update={"source_url": "file:///no/existe.mp4"})
    segundo = ensure_local(roto, cache)

    assert segundo == primero, "estaba en cache: no hacia falta la direccion"
    assert primero.stat().st_mtime_ns == antes


def test_un_material_enorme_no_se_baja(clip: Asset, tmp_path: Path) -> None:
    """Un clip 4K de cien megas para verse dos segundos no compensa."""
    assert ensure_local(clip, tmp_path / "cache", max_bytes=100) is None


def test_una_descarga_cortada_no_deja_un_fichero_a_medias(
    clip: Asset, tmp_path: Path
) -> None:
    """Si no, el siguiente render lo toma por bueno y mete un clip roto."""
    cache = tmp_path / "cache"
    assert ensure_local(clip, cache, max_bytes=100) is None

    carpeta = cache / "broll"
    quedan = list(carpeta.iterdir()) if carpeta.is_dir() else []
    assert quedan == [], f"quedaron restos: {quedan}"
    assert not target_path(clip, cache).exists()


def test_si_falla_la_descarga_se_sigue_montando(tmp_path: Path) -> None:
    perdido = Asset(
        id="pexels-1", kind=AssetKind.VIDEO, provider="pexels",
        source_url="file:///no/existe/tampoco.mp4",
    )
    assert ensure_local(perdido, tmp_path / "cache") is None


def test_el_material_propio_no_se_baja(tmp_path: Path) -> None:
    suelto = Asset(id="self-1", kind=AssetKind.SELF, provider="self")
    assert ensure_local(suelto, tmp_path / "cache") is None


def test_lo_que_ya_esta_en_disco_se_queda_donde_esta(tmp_path: Path) -> None:
    fichero = tmp_path / "mio.png"
    fichero.write_bytes(b"y" * 10)
    local = Asset(id="local-x", kind=AssetKind.IMAGE, provider="local", path=fichero)
    assert ensure_local(local, tmp_path / "cache") == fichero


def test_la_extension_sale_de_la_direccion(tmp_path: Path) -> None:
    """Ffmpeg necesita saber que contenedor es; `.mp4` a ciegas no vale."""
    imagen = Asset(
        id="pixabay-9", kind=AssetKind.IMAGE, provider="pixabay",
        source_url="https://x/y/foto.jpg?token=abc",
    )
    assert target_path(imagen, tmp_path).suffix == ".jpg"

    raro = Asset(
        id="pexels-2", kind=AssetKind.VIDEO, provider="pexels",
        source_url="https://player.vimeo.com/external/12345",
    )
    assert target_path(raro, tmp_path).suffix == ".mp4"


def test_la_direccion_sobrevive_a_guardar_el_montaje() -> None:
    """Estaba en `__dict__` y el EDL se guarda en JSON: se perdia.

    Y al volver a renderizar un montaje guardado, ese material ya no se podia
    traer: quedaba una ficha sin fichero y sin forma de conseguirlo.
    """
    from forge.assets.types import AssetBundle

    bundle = AssetBundle()
    bundle.add(Asset(id="pexels-3", kind=AssetKind.VIDEO, provider="pexels",
                     source_url="https://x/y.mp4"))
    vuelta = AssetBundle.model_validate_json(bundle.model_dump_json())
    assert vuelta.get("pexels-3").source_url == "https://x/y.mp4"


def test_el_tope_por_defecto_es_razonable() -> None:
    """Ni tan bajo que descarte clips normales ni tan alto que no sirva."""
    assert 20 * 1024 * 1024 <= MAX_BYTES <= 200 * 1024 * 1024
