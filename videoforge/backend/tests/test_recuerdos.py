"""Volver a lo que ya ensenaste, y no ilustrar lo que no se sabe si dijiste.

Dos mejoras del analisis que se notan justo en la insercion de material:

1. **El recorte del propio video estaba muerto.** `SelfProvider` solo devolvia
   algo si lo que nombrabas se habia **leido en pantalla**, y leer la pantalla
   necesita tesseract instalado. Sin el -- que es el caso por defecto -- el
   unico proveedor que se anuncia como "siempre disponible" no devolvia nada
   nunca. Y la ocasion buena no necesita OCR ninguna: cuando dices "como vimos
   antes", lo que hay que ensenar es lo de antes, y eso esta en la
   transcripcion.

2. **La transcripcion no esta igual de segura de todo lo que oye.** El material
   se coloca sobre lo mas distintivo que dices, y lo mas distintivo de una guia
   son los nombres propios y la jerga, que es justo donde una transcripcion
   falla. Sin mirar la confianza, el sistema tiende a ilustrar las palabras con
   mas papeletas de estar mal oidas.
"""

from __future__ import annotations

import pytest

from forge.analysis.types import Transcript, TranscriptSegment, Word
from forge.assets.providers import SelfProvider
from forge.assets.types import AssetQuery
from forge.fixtures import synthetic_guide_analysis
from forge.plan.broll import MIN_HEAD_CONFIDENCE, find_topic_moments
from forge.plan.planner import build_edl
from forge.understand.speech_cues import CueKind, find_recalls


def _frase(texto: str, inicio: float, *, prob: dict[str, float] | None = None):
    t = inicio
    palabras = []
    for p in texto.split():
        palabras.append(Word(
            start=round(t, 2), end=round(t + 0.35, 2), text=p,
            probability=(prob or {}).get(p),
        ))
        t += 0.45
    return TranscriptSegment(start=inicio, end=round(t, 2), text=texto, words=palabras)


def _transcript(frases) -> Transcript:
    return Transcript(language="es", segments=list(frases))


# -- volver a algo ----------------------------------------------------------


@pytest.mark.parametrize("frase", [
    "como vimos antes esto se configura aqui",
    "te decia que el menu estaba arriba",
    "acuerdate de la casilla que marcamos",
    "volvemos al panel de ajustes",
    "lo de antes del firewall",
    "al principio dije que era importante",
])
def test_pillar_cuando_vuelves_a_algo(frase: str) -> None:
    assert find_recalls(_transcript([_frase(frase, 0.0)]))


@pytest.mark.parametrize("frase", [
    # Hacia delante, que es lo que mas se dice y lo facil de confundir.
    "vamos a ver como se configura esto",
    "ahora vamos a mirar el menu",
    "antes de nada vamos a instalar el programa",
    "antes de seguir cierra la ventana",
    "ahora te explico como funciona",
    # Y esto vuelve a algo, pero no de este video.
    "como vimos en el video anterior esto es facil",
    "lo explique en el tutorial pasado",
])
def test_no_confundirlo_con_ir_hacia_delante(frase: str) -> None:
    assert find_recalls(_transcript([_frase(frase, 0.0)])) == []


def test_el_recorte_propio_funciona_sin_ocr() -> None:
    """El caso que estaba muerto: sin tesseract no salia nunca material propio."""
    a = synthetic_guide_analysis(300.0, with_transcript=False)
    a.screen_text = []            # sin OCR, que es lo normal sin tesseract
    a.transcript = _transcript([
        _frase("abrimos el panel de ajustes del router", 10.0),
        _frase("ahora configuramos otra cosa distinta", 40.0),
        _frase("como vimos antes el router se configura aqui", 100.0),
    ])
    a.cues = find_recalls(a.transcript)
    assert a.cues and a.cues[0].kind is CueKind.RECALL

    proveedor = SelfProvider(a)
    resultados = proveedor.search(AssetQuery(
        text="router ajustes", head="router", at_timeline=100.5, seconds=3.0,
    ))
    assert resultados, "al pedir volver atras tiene que salir el momento anterior"
    assert "vuelves a lo de antes" in resultados[0].reason
    # Y lo que se ensena es cuando hablabas de eso, no un trozo cualquiera.
    assert 9.0 <= resultados[0].source_start <= 14.0


def test_sin_pedir_volver_atras_no_se_ensena_nada() -> None:
    """La regla conservadora de siempre: un hueco no se nota."""
    a = synthetic_guide_analysis(300.0, with_transcript=False)
    a.screen_text = []
    a.transcript = _transcript([
        _frase("abrimos el panel de ajustes del router", 10.0),
        _frase("el router va bien ahora mismo", 100.0),
    ])
    a.cues = find_recalls(a.transcript)
    assert a.cues == []
    assert SelfProvider(a).search(AssetQuery(
        text="router", head="router", at_timeline=100.5, seconds=3.0,
    )) == []


def test_volver_a_algo_que_nunca_dijiste_no_ensena_nada() -> None:
    """Un "recuerda que..." sobre algo nuevo no tiene nada que recuperar.

    Es lo que hace inofensivos los falsos positivos de la deteccion: la senal
    por si sola nunca mete material; hace falta ademas haberlo dicho antes.
    """
    a = synthetic_guide_analysis(300.0, with_transcript=False)
    a.screen_text = []
    a.transcript = _transcript([
        _frase("empezamos con el escritorio vacio", 10.0),
        _frase("recuerda que tienes que guardar siempre", 100.0),
    ])
    a.cues = find_recalls(a.transcript)
    assert a.cues, "la formula se detecta"
    assert SelfProvider(a).search(AssetQuery(
        text="guardar", head="guardar", at_timeline=100.5, seconds=3.0,
    )) == []


def test_no_se_ensena_lo_que_se_acaba_de_ver() -> None:
    """Ensenar como recuerdo lo que esta en pantalla ahora no recuerda nada."""
    a = synthetic_guide_analysis(300.0, with_transcript=False)
    a.screen_text = []
    a.transcript = _transcript([
        _frase("el router esta aqui mismo", 98.0),
        _frase("como vimos antes el router se configura asi", 101.0),
    ])
    a.cues = find_recalls(a.transcript)
    assert SelfProvider(a).search(AssetQuery(
        text="router", head="router", at_timeline=101.5, seconds=3.0,
    )) == []


# -- lo que la transcripcion no tiene claro ---------------------------------


#: Una guia donde lo distintivo es una palabra rara -- el caso tipico: nombres
#: propios y jerga son lo que mas puntua y lo que peor se oye.
GUIA = [
    "configuramos el gorlaxion porque el gorlaxion manda",
    "el menu de ajustes tiene varias casillas",
    "guardamos los cambios en el menu",
    "revisamos las casillas otra vez",
]


def _cabezas(confianza: float | None) -> list[str]:
    a = synthetic_guide_analysis(120.0, with_transcript=False)
    a.transcript = _transcript([
        _frase(f, i * 20.0, prob={"gorlaxion": confianza} if confianza else None)
        for i, f in enumerate(GUIA)
    ])
    return [m.head for m in find_topic_moments(build_edl(a, "tutorial"), a.transcript)]


def test_no_se_ilustra_una_palabra_mal_oida() -> None:
    """Mal oida: no se busca material de algo que no se sabe si dijiste."""
    assert "gorlaxion" not in _cabezas(0.20)


def test_la_misma_palabra_bien_oida_si_se_ilustra() -> None:
    """Y el control, que es lo que prueba que decide la confianza y no otra cosa.

    Misma frase, mismo reparto de palabras: lo unico que cambia es lo segura
    que esta la transcripcion.
    """
    assert "gorlaxion" in _cabezas(0.95)


def test_sin_dato_de_confianza_todo_sigue_igual() -> None:
    """No tener el dato no es lo mismo que tenerlo malo.

    Una transcripcion sin confianzas se comporta **exactamente** como antes:
    la palabra rara sigue siendo la cabeza.
    """
    assert "gorlaxion" in _cabezas(None)

    a = synthetic_guide_analysis(300.0)
    assert all(w.probability is None for w in a.transcript.words)
    assert find_topic_moments(build_edl(a, "tutorial"), a.transcript)


def test_el_umbral_es_prudente() -> None:
    """Un suelo alto apartaria palabras bien oidas."""
    assert 0.3 <= MIN_HEAD_CONFIDENCE <= 0.6


# -- y como se ensena, que era lo peor --------------------------------------
#
# Un recuerdo se resolvia con `mode="full"` y `rect=(0,0,1,1)`: el video se iba
# entero a otro momento, sin marco ni marca de ninguna clase. Eso no se lee como
# un recuerdo --- se lee como un salto de montaje o como un fallo. Ahora es una
# tarjeta con marco **abajo a la izquierda**, encima de lo que estas contando.


def test_un_recuerdo_es_una_tarjeta_abajo_a_la_izquierda() -> None:
    from forge.assets.types import Asset, AssetKind
    from forge.plan.broll import RECALL_EDGE, RECALL_HEIGHT, recall_rect

    asset = Asset(id="x", kind=AssetKind.SELF, provider="self", width=1920, height=1080)
    rect = recall_rect(asset, 1920, 1080)

    assert rect.x == pytest.approx(RECALL_EDGE), "pegada a la izquierda"
    assert rect.y + rect.h == pytest.approx(1.0 - RECALL_EDGE), "pegada abajo"
    assert rect.w < 0.5 and rect.h < 0.5, "no puede taparlo todo"


def test_el_recuerdo_no_se_mueve_de_su_esquina() -> None:
    """Que salga cada vez en un rincon distinto impide reconocerlo."""
    from forge.assets.types import Asset, AssetKind
    from forge.plan.broll import recall_rect

    formas = [(1920, 1080), (1080, 1920), (1440, 1080)]
    sitios = {
        (recall_rect(Asset(id="x", kind=AssetKind.SELF, provider="self",
                           width=w, height=h), 1920, 1080).x,
         recall_rect(Asset(id="x", kind=AssetKind.SELF, provider="self",
                           width=w, height=h), 1920, 1080).y)
        for w, h in formas
    }
    assert len(sitios) == 1, sitios


def test_el_recuerdo_lleva_marco() -> None:
    """Sin marco, una imagen pegada encima se lee como un fallo de reproduccion."""
    from forge.assets.types import Asset, AssetKind
    from forge.plan.edl import BrollEffect, Rect
    from forge.render.graph import RECALL_BORDER_COLOR, _broll_branch

    asset = Asset(id="x", kind=AssetKind.SELF, provider="self",
                  source_start=10.0, source_end=13.0, width=1920, height=1080)
    rect = Rect(x=0.04, y=0.62, w=0.3, h=0.34)

    tarjeta, _ = _broll_branch(
        BrollEffect(id="b0", start=1.0, end=4.0, asset_id="x", mode="recall",
                    rect=rect),
        asset, 0, "[bx]", 1920, 1080, 30.0,
    )
    assert "pad=" in tarjeta, tarjeta
    assert RECALL_BORDER_COLOR in tarjeta, tarjeta

    # Y una ventanita normal no lleva marco: el marco es lo que dice "esto es
    # material de antes".
    ventanita, _ = _broll_branch(
        BrollEffect(id="b1", start=1.0, end=4.0, asset_id="x", mode="pip",
                    rect=rect),
        asset, 0, "[bx]", 1920, 1080, 30.0,
    )
    assert "pad=" not in ventanita, ventanita


# -- los dos relojes, que es lo que lo tenia roto de raiz --------------------


def test_el_proveedor_compara_en_el_reloj_del_original() -> None:
    """`at_timeline` es del montaje y las palabras son del original.

    Comparar uno con otro dejaba "vuelves a algo de antes" sin cumplirse
    **nunca** en cuanto el montaje recortaba un segundo, que es siempre. Con la
    guia sintetica: el recuerdo cae en el segundo 125,7 del original y en el
    81,1 del montaje, y con 81,1 la ventana de +-3s no lo alcanza ni de lejos.
    """
    from forge.analysis.types import Transcript, TranscriptSegment, Word
    from forge.assets.providers import SelfProvider
    from forge.understand.speech_cues import SpeechCue

    guia = synthetic_guide_analysis(120.0)
    guia.transcript = Transcript(language="es", segments=[
        TranscriptSegment(start=10.0, end=12.0, text="abrimos el inventario", words=[
            Word(start=10.0, end=10.6, text="abrimos"),
            Word(start=10.7, end=11.2, text="el"),
            Word(start=11.3, end=12.0, text="inventario"),
        ]),
        TranscriptSegment(start=100.0, end=102.0, text="como vimos el inventario", words=[
            Word(start=100.0, end=100.5, text="como"),
            Word(start=100.6, end=101.0, text="vimos"),
            Word(start=101.1, end=101.4, text="el"),
            Word(start=101.5, end=102.0, text="inventario"),
        ]),
    ])
    guia.screen_text = []
    guia.cues = [SpeechCue(kind=CueKind.RECALL, start=100.0, end=101.0,
                           phrase="como vimos", strength=0.9)]

    proveedor = SelfProvider(guia)
    # El reloj del montaje dice 60; el del original, 100. Solo el segundo vale.
    query = AssetQuery(text="inventario", head="inventario", seconds=2.0,
                       at_timeline=60.0, at_source=100.0)
    assert proveedor.search(query), "con el reloj bueno encuentra lo de antes"

    sin_origen = AssetQuery(text="inventario", head="inventario", seconds=2.0,
                            at_timeline=60.0)
    assert not proveedor.search(sin_origen), "y sin el, no: 60 no cae en la senal"


def test_lo_que_esta_siempre_en_pantalla_no_senala_ningun_momento() -> None:
    """La barra de objetos de un juego no se quita nunca.

    Preguntar "¿donde se vio 'Esfera de Pal'?" devolvia un rato cualquiera, y el
    recuerdo acababa ensenando un momento que no tenia nada que ver: medido en
    la guia de Palworld, se iba a la pantalla de espera de una expedicion en vez
    de a donde se explicaba la esfera.
    """
    from forge.analysis.ocr import ScreenText, WordBox
    from forge.assets.providers import UBIQUITOUS_SHARE, SelfProvider

    guia = synthetic_guide_analysis(120.0)
    siempre = [
        ScreenText(at=float(t), words=["Esfera", "Pico"], boxes=[
            WordBox(text="Esfera", x=0.1, y=0.9, w=0.1, h=0.03),
            WordBox(text="Pico", x=0.25, y=0.9, w=0.06, h=0.03),
        ])
        for t in range(0, 120, 3)
    ]
    guia.screen_text = siempre
    proveedor = SelfProvider(guia)

    assert UBIQUITOUS_SHARE < 1.0
    assert proveedor._donde_se_vio("esfera", 100.0) == [], (
        "una palabra que sale en todas las lecturas no distingue ningun momento"
    )

    # Y una que sale en un momento concreto, si.
    guia.screen_text = siempre[:3] + [
        ScreenText(at=30.0, words=["Paldium"], boxes=[
            WordBox(text="Paldium", x=0.3, y=0.4, w=0.1, h=0.03),
        ])
    ]
    assert proveedor._donde_se_vio("paldium", 100.0), "esta si senala un momento"


# -- y que el look sea del estilo, no del codigo ----------------------------


def test_la_tarjeta_la_viste_el_estilo() -> None:
    """Como se ve el recuerdo es una decision de look, no de montaje.

    Un video de un juego quiere el marco de ese juego y una guia de una app
    quiere uno neutro, asi que va en el JSON del estilo y no en el codigo.
    """
    from forge.plan.styles import load_style

    neutro = load_style("tutorial").recall
    juego = load_style("palworld").recall

    assert neutro.title == "", "el estilo neutro no pone titulillo"
    assert juego.title == "ANTES"
    assert juego.border_color != neutro.border_color


def test_el_estilo_decide_el_tamano_de_la_tarjeta() -> None:
    from forge.assets.types import Asset, AssetKind
    from forge.plan.broll import recall_rect
    from forge.plan.styles import RecallRules

    asset = Asset(id="x", kind=AssetKind.SELF, provider="self", width=1920, height=1080)
    pequena = recall_rect(asset, 1920, 1080, RecallRules(height=0.2, edge=0.02))

    assert pequena.h == pytest.approx(0.2)
    assert pequena.x == pytest.approx(0.02)
    assert pequena.y + pequena.h == pytest.approx(1.0 - 0.02)


def test_el_color_del_estilo_llega_al_render() -> None:
    """Un `#RRGGBB` del JSON tiene que salir como `0xRRGGBB` en el filtro.

    ffmpeg no entiende la almohadilla: con ella el filtro se queda sin color y
    el render falla entero.
    """
    from forge.assets.types import Asset, AssetKind
    from forge.plan.edl import BrollEffect, Rect
    from forge.render.graph import _broll_branch

    asset = Asset(id="x", kind=AssetKind.SELF, provider="self",
                  source_start=1.0, source_end=4.0, width=1920, height=1080)
    cadena, _ = _broll_branch(
        BrollEffect(id="b", start=1.0, end=4.0, asset_id="x", mode="recall",
                    rect=Rect(x=0.04, y=0.62, w=0.3, h=0.32),
                    border_color="#D2B48C", border=0.026),
        asset, 0, "[b]", 1920, 1080, 30.0,
    )
    assert "color=0xD2B48C" in cadena, cadena
    assert "#" not in cadena, "ffmpeg no entiende la almohadilla"


def test_el_titulillo_sale_sobre_la_tarjeta_y_solo_si_el_estilo_lo_pide() -> None:
    from forge.plan.edl import BrollEffect, EffectKind, Rect
    from forge.plan.planner import _recall_titles
    from forge.plan.styles import RecallRules

    tarjeta = BrollEffect(
        id="b0", start=10.0, end=13.0, asset_id="x", mode="recall",
        rect=Rect(x=0.04, y=0.64, w=0.3, h=0.32),
    )
    otro = BrollEffect(id="b1", start=20.0, end=23.0, asset_id="y", mode="full")

    titulos = _recall_titles([tarjeta, otro], RecallRules(title="ANTES"))
    assert len(titulos) == 1, "solo la tarjeta lleva titulillo"
    t = titulos[0]
    assert t.kind is EffectKind.LOWER_THIRD
    assert t.title == "ANTES"
    assert t.start == tarjeta.start and t.end == tarjeta.end
    # Sangrado dentro del marco, no pegado a su borde exterior.
    from forge.plan.planner import RECALL_CAPTION_INSET

    assert t.rect.x == pytest.approx(tarjeta.rect.x + RECALL_CAPTION_INSET)
    assert t.rect.y < tarjeta.rect.y, "justo encima"

    assert _recall_titles([tarjeta], RecallRules(title="")) == []


# -- una foto enmarcada, no un recorte apaisado -----------------------------


def test_la_tarjeta_puede_ser_cuadrada() -> None:
    """Con la forma del material sale apaisada y no parece una foto aparte.

    Un recorte 16:9 en la esquina se lee como un trozo de otro video pegado
    ahi; un cuadrado enmarcado se lee como una foto puesta a proposito.
    """
    from forge.assets.types import Asset, AssetKind
    from forge.plan.broll import recall_rect
    from forge.plan.styles import RecallRules

    apaisado = Asset(id="x", kind=AssetKind.SELF, provider="self",
                     width=1920, height=1080)

    libre = recall_rect(apaisado, 1920, 1080, RecallRules(height=0.4, max_width=0.9))
    cuadrada = recall_rect(
        apaisado, 1920, 1080, RecallRules(height=0.4, aspect=1.0, max_width=0.9)
    )

    # En pantalla, no en fracciones: 0.4 de alto son 432 px y el cuadrado tiene
    # que medir lo mismo de ancho.
    assert cuadrada.w * 1920 == pytest.approx(cuadrada.h * 1080, rel=0.02)
    assert libre.w > cuadrada.w, "con la forma del material sale mas ancha"


def test_el_pie_va_dentro_del_marco() -> None:
    """La banda es parte de la tarjeta, no una etiqueta flotando encima."""
    from forge.plan.edl import BrollEffect, Rect
    from forge.plan.planner import _recall_titles
    from forge.plan.styles import RecallRules

    tarjeta = BrollEffect(
        id="b0", start=10.0, end=13.0, asset_id="x", mode="recall",
        rect=Rect(x=0.04, y=0.56, w=0.225, h=0.40),
        label="ANTES · Esfera", bar=0.2,
    )
    pie = _recall_titles([tarjeta], RecallRules(bar=0.2, border_color="#8A5A2B"))[0]

    arriba, abajo = tarjeta.rect.y, tarjeta.rect.y + tarjeta.rect.h
    assert arriba < pie.rect.y < abajo, "el pie va dentro de la tarjeta"
    assert pie.rect.y + pie.rect.h == pytest.approx(abajo, abs=1e-3), "pegado abajo"
    assert pie.color == "#8A5A2B", "del color del marco, para que sea el pie y no otra caja"
    assert pie.title == "ANTES · Esfera"


def test_sin_banda_el_pie_se_queda_encima() -> None:
    """El comportamiento de antes sigue disponible."""
    from forge.plan.edl import BrollEffect, Rect
    from forge.plan.planner import _recall_titles
    from forge.plan.styles import RecallRules

    tarjeta = BrollEffect(
        id="b0", start=10.0, end=13.0, asset_id="x", mode="recall",
        rect=Rect(x=0.04, y=0.6, w=0.3, h=0.34),
    )
    pie = _recall_titles([tarjeta], RecallRules(title="ANTES", bar=0.0))[0]
    assert pie.rect.y < tarjeta.rect.y


def test_el_pie_dice_de_que_es_el_recuerdo() -> None:
    """"ANTES" a secas cuenta la mitad: se ve una foto de hace un rato y no se
    sabe de que."""
    from forge.plan.broll import _recall_caption
    from forge.plan.styles import RecallRules

    class _M:
        head = "esfera"

    assert _recall_caption(RecallRules(title="ANTES"), _M()) == "ANTES · Esfera"
    assert _recall_caption(RecallRules(title=""), _M()) == "Esfera"

    class _SinTema:
        head = ""

    assert _recall_caption(RecallRules(title="ANTES"), _SinTema()) == "ANTES"


def test_la_banda_sale_del_propio_marco_en_el_render() -> None:
    """La imagen se ancla arriba y lo que queda abajo es marco: una foto con su
    pie, no un recorte con una pegatina."""
    import re

    from forge.assets.types import Asset, AssetKind
    from forge.plan.edl import BrollEffect, Rect
    from forge.render.graph import _broll_branch

    asset = Asset(id="x", kind=AssetKind.SELF, provider="self",
                  source_start=1.0, source_end=4.0, width=1280, height=720)

    def alto_imagen(bar: float) -> int:
        cadena, _ = _broll_branch(
            BrollEffect(id="b", start=1.0, end=4.0, asset_id="x", mode="recall",
                        rect=Rect(x=0.04, y=0.52, w=0.225, h=0.40),
                        border_color="#8A5A2B", border=0.03, bar=bar),
            asset, 0, "[b]", 1280, 720, 30.0,
        )
        return int(re.search(r"crop=(\d+):(\d+)", cadena).group(2))

    assert alto_imagen(0.2) < alto_imagen(0.0), "la banda le quita alto a la imagen"
