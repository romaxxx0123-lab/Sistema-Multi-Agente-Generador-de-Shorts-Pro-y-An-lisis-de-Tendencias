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


# -- y el papel del tramo tambien manda ----------------------------------


def _analisis_con_aviso():
    """Una guia donde en 40s se avisa de algo y en 80s no."""
    from forge.analysis.types import Transcript, TranscriptSegment, Word
    from forge.fixtures import synthetic_guide_analysis
    from forge.understand.segments import detect_segments

    a = synthetic_guide_analysis(150.0)
    frases = [
        (10.0, "vamos a configurar el servidor de correo con calma"),
        (40.0, "ojo con esto que si lo pones mal no arranca el servidor"),
        (80.0, "por cierto el servidor tiene un panel que casi nadie usa"),
    ]
    segmentos = []
    for inicio, texto in frases:
        ws, t = [], inicio
        for p in texto.split():
            ws.append(Word(start=round(t, 2), end=round(t + 0.3, 2), text=p))
            t += 0.4
        segmentos.append(TranscriptSegment(start=inicio, end=round(t, 2), text=texto, words=ws))
    a.transcript = Transcript(language="es", segments=segmentos)
    a.narrative = detect_segments(a.transcript, a.duration)
    return a


def test_un_aviso_no_se_tapa_con_material_de_apoyo() -> None:
    """Es el momento del video que menos se puede tapar."""
    from forge.plan.broll import _role_weight
    from forge.plan.styles import load_style
    from forge.understand.segments import SegmentRole, role_at

    a = _analisis_con_aviso()
    pacing = load_style("tutorial").pacing
    assert role_at(a.narrative, 41.0) is SegmentRole.WARNING, "el fixture no avisa"

    peso, papel = _role_weight(a.narrative, 41.0, pacing)
    assert peso == 0.0 and papel == "aviso"


def test_en_una_digresion_se_agradece_mas_que_en_un_paso() -> None:
    """Donde la pantalla importa menos, una imagen de apoyo estorba menos."""
    from forge.plan.broll import _role_weight
    from forge.plan.styles import load_style
    from forge.understand.segments import NarrativeSegment, SegmentRole

    pacing = load_style("tutorial").pacing
    pasos = [NarrativeSegment(start=0.0, end=100.0, role=SegmentRole.STEP, confidence=0.9)]
    digresiones = [
        NarrativeSegment(start=0.0, end=100.0, role=SegmentRole.ASIDE, confidence=0.9)
    ]

    digresion, _ = _role_weight(digresiones, 50.0, pacing)
    paso, _ = _role_weight(pasos, 50.0, pacing)
    assert digresion > paso


# -- y que lo que entra encaje en el hueco y en el montaje ----------------

from forge.plan.broll import (  # noqa: E402
    MIN_USEFUL_SECONDS,
    _pauses,
    _snap,
    fit_asset,
)
from forge.assets.types import Asset, AssetKind  # noqa: E402


def _clip(segundos: float, ancho: int = 1920, alto: int = 1080) -> Asset:
    return Asset(
        id="x", kind=AssetKind.VIDEO, provider="pixabay",
        width=ancho, height=alto, duration=segundos,
    )


def test_no_se_ensena_mas_de_lo_que_el_material_tiene() -> None:
    """Un clip de dos segundos en un hueco de cuatro se repetia a la vista."""
    modo, duracion = fit_asset(_clip(2.0), 4.0, "full", 1920, 1080)
    assert duracion == 2.0 and modo == "full"


def test_un_material_demasiado_corto_no_vale() -> None:
    assert fit_asset(_clip(0.6), 3.0, "full", 1920, 1080) is None


def test_un_clip_vertical_no_se_pone_a_pantalla_completa() -> None:
    """Recortarlo a 16:9 deja una rendija; en ventanita se ve entero."""
    modo, _ = fit_asset(_clip(5.0, ancho=1080, alto=1920), 3.0, "full", 1920, 1080)
    assert modo == "pip"


def test_un_material_de_poca_resolucion_tampoco() -> None:
    """Ampliar 480p a 1080 se ve, y se ve mal."""
    modo, _ = fit_asset(_clip(5.0, ancho=854, alto=480), 3.0, "full", 1920, 1080)
    assert modo == "pip"
    assert fit_asset(_clip(5.0, ancho=320, alto=180), 3.0, "full", 1920, 1080) is None


def test_lo_que_encaja_se_queda_como_estaba() -> None:
    modo, duracion = fit_asset(_clip(8.0), 2.6, "full", 1920, 1080)
    assert modo == "full" and duracion == 2.6


def test_sin_datos_del_material_no_se_inventa_nada() -> None:
    """Un recorte del propio video no trae dimensiones: se deja pasar."""
    suelto = Asset(id="s", kind=AssetKind.SELF, provider="self")
    assert fit_asset(suelto, 2.6, "full", 1920, 1080) == ("full", 2.6)


def test_se_entra_por_la_pausa_mas_cercana() -> None:
    """Aparecer a mitad de palabra es lo que delata una insercion automatica."""
    from forge.analysis.types import Transcript, TranscriptSegment, Word

    palabras = [
        Word(start=0.0, end=0.4, text="hola"),
        Word(start=0.5, end=0.9, text="esto"),
        Word(start=2.0, end=2.4, text="sigue"),   # pausa de 1,1 s antes
    ]
    tr = Transcript(language="es", segments=[
        TranscriptSegment(start=0.0, end=2.4, text="hola esto sigue", words=palabras)
    ])
    pausas = _pauses(tr)
    assert 0.9 in pausas

    assert _snap(pausas, 1.3) == 0.9, "se va a la pausa"
    assert _snap(pausas, 30.0) == 30.0, "sin pausa cerca, se queda donde estaba"


def test_la_ventanita_tiene_la_forma_del_material() -> None:
    """Una ventanita cuadrada para un clip vertical vuelve a recortarlo."""
    from forge.plan.broll import pip_rect

    vertical = pip_rect(_clip(5.0, ancho=1080, alto=1920), 1920, 1080)
    apaisado = pip_rect(_clip(5.0, ancho=1280, alto=720), 1920, 1080)

    assert vertical.w < apaisado.w
    # Proporcion respetada: el recuadro del vertical es mas alto que ancho.
    assert (vertical.w * 1920) / (vertical.h * 1080) < 1.0
    assert abs((apaisado.w * 1920) / (apaisado.h * 1080) - 16 / 9) < 0.05
    # Y las dos quedan arriba, lejos de los subtitulos.
    assert vertical.y < 0.2 and apaisado.y < 0.2
