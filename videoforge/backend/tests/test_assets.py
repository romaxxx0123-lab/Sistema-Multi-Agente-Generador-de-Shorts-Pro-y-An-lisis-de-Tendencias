"""Tests del material de apoyo: efectos de sonido y proveedores."""

from __future__ import annotations

import json
import wave
from pathlib import Path

import numpy as np
import pytest

from forge.analysis.types import ShotFocus
from forge.assets.providers import (
    LocalProvider,
    SelfProvider,
    StockProvider,
    build_providers,
    search_all,
    tokenize,
)
from forge.assets.sfx import GENERATORS, ensure_all, ensure_sfx, normalize, write_wav
from forge.assets.types import Asset, AssetBundle, AssetKind, AssetQuery
from forge.fixtures import synthetic_guide_analysis


# -- efectos de sonido -----------------------------------------------------


@pytest.mark.parametrize("nombre", sorted(GENERATORS))
def test_cada_efecto_suena(nombre: str) -> None:
    senal = GENERATORS[nombre]()
    assert senal.size > 0
    assert float(np.abs(senal).max()) > 0.01


def test_el_riser_sube_y_el_impacto_cae() -> None:
    """La envolvente es lo que distingue un efecto de un ruido cualquiera."""
    riser = GENERATORS["riser"]()
    impacto = GENERATORS["impact"]()
    assert np.abs(riser[-2000:]).mean() > np.abs(riser[:2000]).mean()
    assert np.abs(impacto[:2000]).mean() > np.abs(impacto[-2000:]).mean()


def test_todos_acaban_en_silencio() -> None:
    """Sin rampa final, la muestra cortaria en seco y se oiria un clic."""
    for nombre, generador in GENERATORS.items():
        senal = generador()
        assert float(np.abs(senal[-50:]).max()) < 0.05, f"{nombre} corta en seco"


def test_normalize_deja_margen_antes_de_saturar() -> None:
    fuerte = np.array([5.0, -5.0, 2.0], dtype=np.float32)
    assert float(np.abs(normalize(fuerte)).max()) == pytest.approx(0.89, abs=0.01)


def test_normalize_no_divide_por_cero() -> None:
    silencio = np.zeros(100, dtype=np.float32)
    assert float(np.abs(normalize(silencio)).max()) == 0.0


def test_el_wav_es_valido(tmp_path: Path) -> None:
    destino = write_wav(GENERATORS["pop"](), tmp_path / "pop.wav")
    with wave.open(str(destino)) as fh:
        assert fh.getnchannels() == 1
        assert fh.getsampwidth() == 2
        assert fh.getframerate() == 48000
        assert fh.getnframes() > 100


def test_se_generan_una_vez_y_se_reutilizan(tmp_path: Path) -> None:
    primero = ensure_sfx(tmp_path, "whoosh")
    marca = primero.stat().st_mtime_ns
    segundo = ensure_sfx(tmp_path, "whoosh")
    assert segundo == primero
    assert segundo.stat().st_mtime_ns == marca


def test_un_efecto_inexistente_falla_claro(tmp_path: Path) -> None:
    with pytest.raises(KeyError):
        ensure_sfx(tmp_path, "inventado")


def test_se_genera_el_catalogo_entero(tmp_path: Path) -> None:
    rutas = ensure_all(tmp_path)
    assert set(rutas) == set(GENERATORS)
    assert all(p.is_file() for p in rutas.values())


# -- tokenizacion ----------------------------------------------------------


def test_tokenize_quita_las_palabras_vacias() -> None:
    assert tokenize("el menu de los ajustes") == ["menu", "ajustes"]


def test_tokenize_admite_acentos() -> None:
    assert "configuración" in tokenize("la configuración del sistema")


# -- proveedor del propio video -------------------------------------------


def _con_pantalla(duracion: float = 300.0, textos=(("Ajustes", 20.0), ("Ajustes", 45.0))):
    """Una guia en la que el OCR leyo algo en pantalla en momentos concretos."""
    from forge.analysis.ocr import ScreenText, WordBox

    a = synthetic_guide_analysis(duracion)
    a.screen_text = [
        ScreenText(at=t, words=[texto],
                   boxes=[WordBox(text=texto, x=0.1, y=0.1, w=0.1, h=0.04)])
        for texto, t in textos
    ]
    return a


def test_el_propio_video_recuerda_donde_se_vio_lo_que_nombras() -> None:
    """Un recorte del propio video vale como **recordatorio**, no como relleno.

    Antes elegia por interes visual y el montaje lo anunciaba como "material de
    apoyo porque ahi hablas de X". Era falso: ese recorte era el plano con mas
    contraste del video y no tenia nada que ver con X.
    """
    a = _con_pantalla()
    resultados = SelfProvider(a).search(
        AssetQuery(text="ajustes menu", head="ajustes", seconds=3.0, at_timeline=90.0)
    )
    assert resultados
    assert all(r.is_self for r in resultados)
    assert all(r.source_end > r.source_start for r in resultados)
    assert "Ajustes" in resultados[0].reason
    # Y ensena uno de los momentos en los que se veia, no un plano cualquiera.
    assert any(abs(resultados[0].source_start - t) < 5.0 for t in (20.0, 45.0))


def test_si_no_se_vio_nunca_no_ensena_nada() -> None:
    """Mejor un hueco que un trozo del video que no viene a cuento."""
    a = _con_pantalla()
    assert SelfProvider(a).search(
        AssetQuery(text="kubernetes", head="kubernetes", at_timeline=90.0)
    ) == []


def test_no_recuerda_lo_que_se_esta_viendo_ahora_mismo() -> None:
    a = _con_pantalla(textos=(("Ajustes", 88.0),))
    assert SelfProvider(a).search(
        AssetQuery(text="ajustes", head="ajustes", at_timeline=90.0)
    ) == []


def test_prefiere_lo_ya_visto_a_lo_que_todavia_no_has_explicado() -> None:
    a = _con_pantalla(textos=(("Ajustes", 20.0), ("Ajustes", 200.0)))
    resultados = SelfProvider(a).search(
        AssetQuery(text="ajustes", head="ajustes", at_timeline=100.0)
    )
    assert resultados[0].source_start < 100.0, "ensenar lo que no has contado confunde"


def test_descarta_los_planos_sin_foco_claro() -> None:
    """Sin nada que destaque, un recorte seria arbitrario."""
    a = synthetic_guide_analysis(300.0)
    a.focus = [ShotFocus(shot_index=s.index, concentration=0.01) for s in a.shots]
    assert SelfProvider(a).search(AssetQuery(text="x")) == []


def test_el_recorte_cae_dentro_de_su_plano() -> None:
    a = synthetic_guide_analysis(300.0)
    for asset in SelfProvider(a).search(AssetQuery(text="x", seconds=3.0)):
        shot = next(s for s in a.shots if f"{s.index:03d}" in asset.id)
        assert shot.start <= asset.source_start
        assert asset.source_end <= shot.end + 1e-6


# -- biblioteca local ------------------------------------------------------


@pytest.fixture
def biblioteca(tmp_path: Path) -> Path:
    for nombre in (
        "google-datacenter-servidores.jpg",
        "palworld-base-construccion.mp4",
        "gato-durmiendo.png",
        "notas.txt",
    ):
        (tmp_path / nombre).write_bytes(b"x" * 100)
    return tmp_path


def test_encuentra_por_etiquetas_del_nombre(biblioteca: Path) -> None:
    resultados = LocalProvider(biblioteca).search(AssetQuery(text="base de palworld"))
    assert len(resultados) == 1
    assert "palworld" in resultados[0].id


def test_no_devuelve_lo_que_no_encaja(biblioteca: Path) -> None:
    resultados = LocalProvider(biblioteca).search(AssetQuery(text="servidores de google"))
    assert all("gato" not in r.id for r in resultados)


def test_ignora_ficheros_que_no_son_material(biblioteca: Path) -> None:
    resultados = LocalProvider(biblioteca).search(AssetQuery(text="notas"))
    assert all(not r.id.endswith("notas") for r in resultados)


def test_lee_las_etiquetas_del_fichero_lateral(biblioteca: Path) -> None:
    (biblioteca / "tags.json").write_text(
        json.dumps({"gato-durmiendo.png": ["mascota", "descanso"]})
    )
    resultados = LocalProvider(biblioteca).search(AssetQuery(text="mascota"))
    assert len(resultados) == 1
    assert "gato" in resultados[0].id


def test_un_tags_json_corrupto_no_rompe_nada(biblioteca: Path) -> None:
    (biblioteca / "tags.json").write_text("{ esto no es json")
    assert LocalProvider(biblioteca).search(AssetQuery(text="palworld"))


def test_una_carpeta_inexistente_devuelve_vacio(tmp_path: Path) -> None:
    assert LocalProvider(tmp_path / "no-existe").search(AssetQuery(text="x")) == []


# -- bancos gratuitos ------------------------------------------------------


def test_pexels_se_interpreta_bien() -> None:
    respuesta = {
        "videos": [
            {
                "id": 123,
                "duration": 12,
                "user": {"name": "Alguien"},
                "video_files": [
                    {"height": 720, "width": 1280, "link": "http://x/720.mp4"},
                    {"height": 1080, "width": 1920, "link": "http://x/1080.mp4"},
                ],
            }
        ]
    }
    respuesta["videos"][0]["url"] = "https://www.pexels.com/video/gente-en-una-oficina-123/"
    proveedor = StockProvider("pexels", "clave")
    proveedor._request = lambda url, headers: respuesta  # type: ignore[method-assign]

    resultados = proveedor.search(AssetQuery(text="oficina"))
    assert len(resultados) == 1
    assert resultados[0].height == 1080, "debe quedarse con la mejor calidad"
    assert "Alguien" in resultados[0].attribution
    assert resultados[0].license


def test_pixabay_se_interpreta_bien() -> None:
    respuesta = {
        "hits": [
            {"id": 7, "duration": 8, "user": "Otro", "tags": "ciudad, calle, noche",
             "videos": {"large": {"width": 1920, "height": 1080, "url": "http://x.mp4"}}}
        ]
    }
    proveedor = StockProvider("pixabay", "clave")
    proveedor._request = lambda url, headers: respuesta  # type: ignore[method-assign]

    resultados = proveedor.search(AssetQuery(text="ciudad"))
    assert len(resultados) == 1
    assert resultados[0].provider == "pixabay"
    assert "Otro" in resultados[0].attribution


def test_un_banco_caido_no_tumba_el_montaje() -> None:
    """Sin red, el sistema tiene que seguir montando con lo que tenga."""
    def _falla(url, headers):
        raise OSError("sin red")

    proveedor = StockProvider("pexels", "clave")
    proveedor._request = _falla  # type: ignore[method-assign]
    assert proveedor.search(AssetQuery(text="x")) == []


# -- registro --------------------------------------------------------------


def test_sin_claves_ni_carpeta_queda_el_propio_video() -> None:
    a = synthetic_guide_analysis(120.0)
    nombres = [p.name for p in build_providers(a, allow_network=False)]
    assert nombres == ["self"]


def test_la_carpeta_local_va_antes_que_el_propio_video(biblioteca: Path) -> None:
    a = synthetic_guide_analysis(120.0)
    nombres = [p.name for p in build_providers(a, local_dir=biblioteca, allow_network=False)]
    assert nombres.index("local") < nombres.index("self")


def test_un_proveedor_roto_no_impide_a_los_demas() -> None:
    class Roto:
        name = "roto"

        def search(self, query):
            raise RuntimeError("boom")

    a = _con_pantalla(120.0, (("Ajustes", 20.0),))
    resultados = search_all(
        [Roto(), SelfProvider(a)],
        AssetQuery(text="ajustes", head="ajustes", at_timeline=60.0),
    )
    assert resultados


def test_los_resultados_salen_ordenados_por_relevancia(biblioteca: Path) -> None:
    a = synthetic_guide_analysis(120.0)
    proveedores = build_providers(a, local_dir=biblioteca, allow_network=False)
    resultados = search_all(proveedores, AssetQuery(text="palworld base"))
    relevancias = [r.relevance for r in resultados]
    assert relevancias == sorted(relevancias, reverse=True)


# -- coleccion de assets ---------------------------------------------------


def test_los_creditos_salen_de_los_assets_externos() -> None:
    bundle = AssetBundle()
    bundle.add(Asset(id="a", kind=AssetKind.SELF, provider="self", license="propio"))
    bundle.add(Asset(id="b", kind=AssetKind.VIDEO, provider="pexels",
                     license="Pexels License", attribution="Pexels / Alguien"))
    creditos = bundle.credits()
    assert "Pexels" in creditos
    assert "a:" not in creditos, "el material propio no necesita credito"
