"""Como se **encuentra** el material de apoyo, y como se comprueba.

Cuatro fallos, todos comprobados en el codigo antes de tocarlo y explicados en
`ANALISIS-INSERCION-MULTIMEDIA.md`:

1. Nadie miraba los pixeles de lo que se insertaba (eso se prueba en
   `test_inspeccion.py`).
2. Una biblioteca ordenada por carpetas era **invisible**: las etiquetas salian
   de `tags.json` y del nombre del fichero, nunca de la carpeta, asi que
   `assets/palworld/base-01.mp4` se etiquetaba `["base"]` y la regla de
   coherencia lo descartaba justo cuando hablabas de Palworld.
3. Al material propio no se le median `width`, `height` ni `duration` -- se
   quedaban a cero -- y `fit_asset` esta escrito alrededor de esos tres
   numeros: toda la adaptacion a "lo que has conseguido" se saltaba con tu
   biblioteca y solo se aplicaba a los bancos.
4. A los bancos se les preguntaba en espanol sin decirles el idioma y despues se
   les exigia responder con etiquetas en espanol, que no hacen nunca. La regla
   de coherencia era literalmente imposible de cumplir, asi que el camino del
   stock estaba muerto.
"""

from __future__ import annotations

import subprocess
import urllib.parse
from pathlib import Path

import pytest

from forge.assets.language import GlossaryTranslator, bank_query
from forge.assets.providers import LocalProvider, StockProvider
from forge.assets.types import AssetQuery
from forge.config import Settings
from forge.plan.broll import MIN_USEFUL_SECONDS, fit_asset
from forge.tools import ffmpeg_bin


def _clip(destino: Path, settings: Settings, *, filtros: str = "null",
          tamano: str = "1280x720", duracion: float = 2.0) -> Path:
    destino.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [str(ffmpeg_bin(settings)), "-y", "-loglevel", "error",
         "-f", "lavfi", "-i", f"testsrc2=size={tamano}:rate=25:duration={duracion}",
         "-vf", filtros, "-c:v", "libx264", "-crf", "22", "-pix_fmt", "yuv420p",
         str(destino)],
        check=True, capture_output=True,
    )
    return destino


@pytest.fixture(scope="module")
def biblioteca(tmp_path_factory, settings: Settings) -> Path:
    """Una biblioteca ordenada **por carpetas**, que es como se ordena de verdad."""
    raiz = tmp_path_factory.mktemp("biblioteca")
    _clip(raiz / "palworld" / "base-nocturna.mp4", settings)
    _clip(raiz / "minecraft" / "base-nocturna.mp4", settings)
    _clip(raiz / "palworld" / "granja-apagada.mp4", settings,
          filtros="eq=brightness=-1.0")
    _clip(raiz / "impresora" / "atasco.mp4", settings, tamano="720x1280")
    _clip(raiz / "sellado" / "junta-vieja.mp4", settings, tamano="320x180")
    return raiz


def _buscar(biblioteca: Path, settings: Settings, **kw) -> list:
    return LocalProvider(biblioteca, settings=settings).search(AssetQuery(**kw))


# -- la biblioteca ---------------------------------------------------------


def test_la_carpeta_es_una_etiqueta(biblioteca: Path, settings: Settings) -> None:
    """Es el fallo 2: asi ordenado, antes no salia nada.

    Los dos ficheros se llaman igual (`base-nocturna.mp4`) y lo unico que los
    distingue es la carpeta. Si la carpeta no cuenta, los dos se etiquetan
    `["base", "nocturna"]`, ninguno lleva "palworld" y los dos se caen.
    """
    resultados = _buscar(
        biblioteca, settings,
        text="la base de palworld", head="palworld",
        vocabulary=["palworld", "base"],
    )
    assert [r.id for r in resultados] == ["local-base-nocturna"]
    assert "palworld" in str(resultados[0].path)


def test_la_carpeta_de_fuera_es_el_sujeto(biblioteca: Path, settings: Settings) -> None:
    """Y sirve para lo contrario: descartar lo que va de otra cosa.

    Se habla de "la base" en un video donde Minecraft no se nombra nunca. El
    clip de Minecraft lleva la etiqueta que se pide -- "base" -- pero **es de**
    Minecraft, y eso no se menciona: fuera. Es el caso Palworld/Minecraft, ahora
    con la carpeta como sujeto.
    """
    resultados = _buscar(
        biblioteca, settings,
        text="la base", head="base", vocabulary=["base", "palworld"],
    )
    rutas = [str(r.path) for r in resultados]
    assert any("palworld" in r for r in rutas)
    assert not any("minecraft" in r for r in rutas)


def test_el_material_propio_se_mide(biblioteca: Path, settings: Settings) -> None:
    """Fallo 3: salia con tamano y duracion a cero."""
    (material,) = _buscar(
        biblioteca, settings,
        text="palworld", head="palworld", vocabulary=["palworld"],
        limit=1,
    )
    assert (material.width, material.height) == (1280, 720)
    assert material.duration == pytest.approx(2.0, abs=0.15)


def test_un_clip_corto_ya_no_estira_el_hueco(
    biblioteca: Path, settings: Settings
) -> None:
    """La consecuencia del fallo 3, medida donde se notaba.

    Un clip de 2 s en un hueco de 5 s: con la duracion a cero, `fit_asset`
    aceptaba los 5 s enteros y el material se repetia a la vista.
    """
    (material,) = _buscar(
        biblioteca, settings,
        text="palworld", head="palworld", vocabulary=["palworld"], limit=1,
    )
    modo, segundos = fit_asset(material, 5.0, "full", 1920, 1080)
    assert segundos == pytest.approx(material.duration, abs=0.01)
    assert segundos >= MIN_USEFUL_SECONDS


def test_un_clip_vertical_pasa_a_ventanita(
    biblioteca: Path, settings: Settings
) -> None:
    """Otra consecuencia: sin medirlo, un vertical se recortaba a pantalla completa."""
    (material,) = _buscar(
        biblioteca, settings,
        text="la impresora", head="impresora", vocabulary=["impresora"], limit=1,
    )
    assert material.is_vertical
    modo, _ = fit_asset(material, 2.0, "full", 1920, 1080)
    assert modo == "pip"


def test_un_clip_demasiado_pequeno_no_se_usa(
    biblioteca: Path, settings: Settings
) -> None:
    """La regla ya estaba; hasta ahora no le llegaba tu biblioteca.

    Un 320x180 en un montaje 1080p hay que ampliarlo seis veces, y eso se ve.
    Sin medir el fichero, `fit_asset` no tenia con que decidirlo y lo aceptaba.
    """
    (material,) = _buscar(
        biblioteca, settings,
        text="el sellado", head="sellado", vocabulary=["sellado"], limit=1,
    )
    assert material.height == 180
    assert fit_asset(material, 3.0, "full", 1920, 1080) is None


def test_no_se_ofrece_material_que_no_se_ve(
    biblioteca: Path, settings: Settings
) -> None:
    """Fallo 1 en la biblioteca: el clip negro esta bien etiquetado y no sirve."""
    proveedor = LocalProvider(biblioteca, settings=settings)
    resultados = proveedor.search(AssetQuery(
        text="la granja de palworld", head="granja",
        vocabulary=["granja", "palworld"],
    ))
    assert [r.id for r in resultados] == []
    assert [str(p.name) for p, _ in proveedor.rejected] == ["granja-apagada.mp4"]
    assert "negro" in proveedor.rejected[0][1]


def test_sin_mirar_se_ofrece_igual(biblioteca: Path, settings: Settings) -> None:
    """Mirar se puede desactivar, y entonces el comportamiento es el de antes."""
    proveedor = LocalProvider(biblioteca, settings=settings, look=False)
    resultados = proveedor.search(AssetQuery(
        text="la granja de palworld", head="granja",
        vocabulary=["granja", "palworld"],
    ))
    assert len(resultados) == 1
    assert resultados[0].duration == 0.0


# -- los bancos ------------------------------------------------------------


class _Banco(StockProvider):
    """Un banco que no llama a nadie y apunta lo que se le pidio."""

    def __init__(self, nombre: str, respuesta: dict) -> None:
        super().__init__(nombre, "clave")
        self.respuesta = respuesta
        self.url = ""

    def _request(self, url: str, headers: dict) -> dict:
        self.url = url
        return self.respuesta


def _params(url: str) -> dict[str, str]:
    return dict(urllib.parse.parse_qsl(urllib.parse.urlsplit(url).query))


_HIT_IMPRESORA = {
    "id": 1, "tags": "printer, office, paper", "duration": 8,
    "videos": {"large": {"url": "https://x/v.mp4", "width": 1920, "height": 1080}},
}


def test_al_banco_se_le_dice_en_que_idioma_se_le_habla() -> None:
    """Fallo 4, la mitad de ida: no se mandaba idioma ninguno."""
    pixabay = _Banco("pixabay", {"hits": []})
    pixabay.search(AssetQuery(text="impresora", head="impresora", language="es"))
    assert _params(pixabay.url)["lang"] == "es"

    pexels = _Banco("pexels", {"videos": []})
    pexels.search(AssetQuery(text="impresora", head="impresora", language="es"))
    assert _params(pexels.url)["locale"] == "es-ES"


def test_se_busca_con_el_termino_que_el_banco_tiene_indexado() -> None:
    """Un banco tiene su material indexado en ingles: se le pide en ingles."""
    banco = _Banco("pixabay", {"hits": [_HIT_IMPRESORA]})
    banco.search(AssetQuery(
        text="la impresora de casa", head="impresora",
        vocabulary=["impresora", "casa"], language="es",
    ))
    assert _params(banco.url)["q"] == "printer"


def test_una_etiqueta_en_ingles_vale_como_la_cabeza_en_espanol() -> None:
    """Fallo 4, la mitad de vuelta: la regla era imposible de cumplir.

    Dices "impresora", el banco etiqueta "printer", y `judge` exigia la palabra
    espanola entre las etiquetas. No esta nunca, asi que **nada** de un banco
    pasaba la coherencia.
    """
    banco = _Banco("pixabay", {"hits": [_HIT_IMPRESORA]})
    resultados = banco.search(AssetQuery(
        text="la impresora de casa", head="impresora",
        vocabulary=["impresora", "casa"], language="es",
    ))
    assert len(resultados) == 1
    assert resultados[0].source_url == "https://x/v.mp4"


def test_pero_sigue_sin_colar_lo_que_va_de_otra_cosa() -> None:
    """Que es el motivo de que la regla exista: un banco siempre devuelve algo."""
    otro = dict(_HIT_IMPRESORA, id=2, tags="cat, animal, pet")
    banco = _Banco("pixabay", {"hits": [otro]})
    assert banco.search(AssetQuery(
        text="la impresora de casa", head="impresora",
        vocabulary=["impresora", "casa"], language="es",
    )) == []


def test_lo_que_no_esta_en_el_glosario_se_manda_tal_cual() -> None:
    """Y no se inventa una traduccion, que seria peor que no traducir.

    "Palworld" no se traduce porque es un nombre propio; y un termino que
    simplemente no este en el glosario tampoco. Se manda tal cual con el idioma
    puesto, y si asi no se puede confirmar la coherencia, no se pone nada.
    """
    banco = _Banco("pixabay", {"hits": []})
    banco.search(AssetQuery(text="palworld base", head="palworld", language="es"))
    assert _params(banco.url)["q"] == "palworld base"


def test_en_ingles_no_se_traduce_nada() -> None:
    assert bank_query("the printer", "printer", "en") == ("the printer", ())


def test_el_glosario_entiende_plurales_y_acentos() -> None:
    t = GlossaryTranslator()
    assert t.equivalents("pestañas") == ("tab",)
    assert t.equivalents("ratón") == ("mouse", "computer mouse")
    assert t.equivalents("palworld") == ()
    assert t.equivalents("impresora", to="fr") == ()


# -- lo que se descarga tampoco entra a ciegas ------------------------------


def test_el_material_descargado_se_mira_antes_de_pegarlo(
    sample_video: Path, settings: Settings, tmp_path: Path, monkeypatch
) -> None:
    """Un banco manda una ficha con etiquetas, no el video.

    Lo que hay dentro del fichero no lo habia visto nadie: se descargaba y se
    pegaba. Aqui el banco "entrega" un clip negro y el montaje tiene que salir
    sin el, diciendolo.
    """
    from forge.assets.types import Asset, AssetBundle, AssetKind
    from forge.plan.edl import EDL, BrollEffect, Clip, RenderSpec
    from forge.render import renderer as modulo
    from forge.render.renderer import render

    negro = _clip(tmp_path / "negro.mp4", settings, filtros="eq=brightness=-1.0",
                  duracion=3.0)
    monkeypatch.setattr(modulo, "ensure_local", lambda asset, cache: negro)

    asset = Asset(
        id="stock-1", kind=AssetKind.VIDEO, provider="pixabay",
        width=1280, height=720, duration=3.0,
        source_url="https://ejemplo/negro.mp4", query="impresora",
    )
    bundle = AssetBundle()
    bundle.add(asset)

    edl = EDL(
        source=str(sample_video),
        source_duration=8.0,
        render=RenderSpec(width=640, height=360, fps=25.0),
        timeline=[Clip(id="c0", source_start=0.0, source_end=4.0)],
        effects=[BrollEffect(id="b0", start=0.5, end=3.0, asset_id="stock-1")],
    )

    resultado = render(edl, tmp_path / "salida.mp4", settings,
                       assets=bundle, two_pass_audio=False)

    assert resultado.path.is_file()
    descartes = [a for a in resultado.applied if "descartados al verlos" in a]
    assert descartes and "negro" in descartes[0]
    assert not any("b-roll" in a for a in resultado.applied)
