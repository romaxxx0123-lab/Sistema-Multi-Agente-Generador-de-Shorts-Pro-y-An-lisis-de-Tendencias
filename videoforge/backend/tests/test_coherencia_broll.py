"""Que lo que se inserta sea de lo que se esta hablando.

El fallo, dicho como lo dijo quien lo sufrio: *"cuando suma una imagen hablando
de Palworld no me metas una de Minecraft porque es un videojuego"*. Y era
exactamente eso: bastaba **una** palabra en comun para colar un material.

    dices:     palworld, base
    fichero:   minecraft-videojuego-base.png
    en comun:  base                             -> dentro, con un 70%

La pregunta estaba mal hecha. "Tiene algo en comun" no es "es esto". Aqui se
pregunta por dos cosas, y las dos tienen que salir bien:

1. que el material lleve **la cabeza** de lo que se busca -- lo concreto que se
   acaba de nombrar -- y no solo palabras de contexto;
2. que no vaya de algo que **en el video no se menciona nunca**. Eso pilla el
   caso feo: la cabeza es generica ("base"), el fichero es de Minecraft, y
   Minecraft no sale en todo el video.

Lo segundo se deduce de tu propia biblioteca, sin saber nada del mundo: la
etiqueta que lleva un solo fichero dice **cual** es ese fichero; la que llevan
varios agrupa.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from forge.assets.coherence import judge
from forge.assets.providers import LocalProvider, StockProvider
from forge.assets.types import AssetQuery

#: Una biblioteca como la que tendria cualquiera: varios juegos, todos
#: etiquetados como videojuego.
FICHEROS = [
    "minecraft-videojuego-base.png",
    "palworld-videojuego-granja.mp4",
    "pokemon-videojuego-combate.png",
    "zelda-videojuego-mapa.png",
    "escritorio-ordenador-ventanas.jpg",
    "cocina-receta.jpg",
]

#: Lo que se dice en el video entero.
VOCABULARIO = (
    "hoy montamos la base de palworld con los pals que capturamos ayer "
    "la granja da comida a los pals mientras trabajan"
).split()


@pytest.fixture()
def biblioteca(tmp_path: Path) -> Path:
    for nombre in FICHEROS:
        (tmp_path / nombre).write_bytes(b"x" * 64)
    return tmp_path


def _buscar(directorio: Path, cabeza: str, contexto: str = "videojuego base"):
    return LocalProvider(directorio).search(AssetQuery(
        text=f"{cabeza} {contexto}",
        head=cabeza,
        context=contexto,
        vocabulary=VOCABULARIO,
    ))


# -- el caso que lo motivo ------------------------------------------------


def test_hablando_de_palworld_no_entra_minecraft(biblioteca: Path) -> None:
    resultados = _buscar(biblioteca, "palworld")
    nombres = [r.path.name for r in resultados if r.path]

    assert "palworld-videojuego-granja.mp4" in nombres
    assert not any("minecraft" in n for n in nombres)
    assert not any("pokemon" in n or "zelda" in n for n in nombres)


def test_ni_aunque_la_palabra_en_comun_sea_la_importante(biblioteca: Path) -> None:
    """El caso feo: la cabeza es generica y el fichero es de otro juego.

    "Base" la comparten Minecraft y el video, asi que la primera regla no lo
    para. Lo para la segunda: ese fichero es de Minecraft, y Minecraft no se
    nombra en todo el video.
    """
    nombres = [r.path.name for r in _buscar(biblioteca, "base") if r.path]
    assert not any("minecraft" in n for n in nombres), nombres


def test_lo_que_no_se_puede_confirmar_no_se_pone(biblioteca: Path) -> None:
    """Un hueco no se nota; una imagen equivocada la ve todo el mundo."""
    assert _buscar(biblioteca, "servidores") == []
    assert _buscar(biblioteca, "kubernetes") == []


def test_el_material_correcto_sigue_entrando_con_sus_otras_etiquetas(
    biblioteca: Path,
) -> None:
    """La segunda regla no puede cargarse el acierto.

    "Granja" solo la lleva el fichero de Palworld, asi que es identidad suya; y
    en el video se dice "granja". Pero aunque no se dijera, lo que manda es que
    la cabeza ("palworld") ya identifica el fichero: lo demas lo describe.
    """
    sin_granja = [p for p in VOCABULARIO if p != "granja"]
    resultados = LocalProvider(biblioteca).search(AssetQuery(
        text="palworld base", head="palworld", context="base",
        vocabulary=sin_granja,
    ))
    assert [r.path.name for r in resultados if r.path] == [
        "palworld-videojuego-granja.mp4"
    ]


def test_explica_por_que_lo_pone(biblioteca: Path) -> None:
    resultado = _buscar(biblioteca, "palworld")[0]
    assert "palworld" in resultado.reason.lower()


# -- la regla, por separado ----------------------------------------------


def test_el_sujeto_es_la_primera_etiqueta() -> None:
    """`minecraft-videojuego-base.png` es una foto DE Minecraft."""
    from forge.assets.coherence import subject

    assert subject(["minecraft", "videojuego", "base"]) == subject(["minecraft"])
    assert subject(["palworld", "videojuego"]) != subject(["minecraft", "videojuego"])


def test_de_lo_que_describe_un_material_se_puede_no_decir_nada() -> None:
    """Una foto de Palworld sigue siendo de Palworld sin decir "granja"."""
    assert judge(
        ["palworld", "videojuego", "granja"],
        head="palworld",
        vocabulary=["palworld", "base"],
    )


def test_pero_de_lo_que_es_hay_que_hablar() -> None:
    veredicto = judge(
        ["minecraft", "videojuego", "base"],
        head="base",
        vocabulary=["base", "palworld"],
    )
    assert not veredicto
    assert "minecraft" in veredicto.reason


def test_la_raiz_basta_para_que_coincidan() -> None:
    """Escribirlo en singular en el fichero y en plural al hablar no cuesta."""
    assert judge(["drivers", "nvidia"], head="driver", vocabulary=["drivers"])
    assert judge(["driver", "nvidia"], head="drivers", vocabulary=["driver"])


def test_sin_etiquetas_no_hay_nada_que_comprobar() -> None:
    assert not judge([], head="palworld")


# -- los bancos de stock --------------------------------------------------


def _banco(hits: list[dict]) -> StockProvider:
    proveedor = StockProvider("pixabay", "clave")
    proveedor._request = lambda url, headers: {"hits": hits}  # type: ignore[method-assign]
    return proveedor


def _hit(id_: int, tags: str) -> dict:
    return {
        "id": id_, "duration": 8, "user": "Alguien", "tags": tags,
        "videos": {"large": {"width": 1920, "height": 1080, "url": "http://x.mp4"}},
    }


def test_un_banco_siempre_devuelve_algo_y_eso_no_es_encontrarlo() -> None:
    """Pedirle "palworld" a un banco de stock da mandos y pantallas sueltas."""
    banco = _banco([
        _hit(1, "gaming, mando, consola"),
        _hit(2, "pantalla, ordenador, juego"),
    ])
    assert banco.search(AssetQuery(text="palworld", head="palworld")) == []


def test_y_si_de_verdad_lo_tiene_entra() -> None:
    banco = _banco([_hit(3, "granja, campo, cultivo")])
    resultados = banco.search(AssetQuery(
        text="granja campo", head="granja", vocabulary=["granja", "campo"]
    ))
    assert len(resultados) == 1
    assert "granja" in resultados[0].reason
