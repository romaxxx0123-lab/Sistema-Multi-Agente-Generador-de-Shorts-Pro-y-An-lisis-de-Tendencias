"""Tests del generador de subtitulos ASS."""

from __future__ import annotations

import pytest

from forge.analysis.types import Word
from forge.plan.edl import CaptionEffect
from forge.render.ass import (
    THEMES,
    _ass_color,
    _escape,
    _karaoke_text,
    _timestamp,
    build_ass,
    resolve_font,
)


def _cap(start=1.0, end=3.0, palabras=None, **kw) -> CaptionEffect:
    words = [Word(start=a, end=b, text=t) for a, b, t in (palabras or [])]
    return CaptionEffect(id="c", start=start, end=end, words=words, **kw)


# -- formato ---------------------------------------------------------------


def test_color_invierte_los_canales() -> None:
    """ASS usa &HAABBGGRR: alfa primero y BGR, no RGB."""
    assert _ass_color(255, 0, 0) == "&H000000FF"   # rojo puro
    assert _ass_color(0, 0, 255) == "&H00FF0000"   # azul puro
    assert _ass_color(255, 255, 255) == "&H00FFFFFF"


def test_color_con_alfa() -> None:
    assert _ass_color(0, 0, 0, 0x80) == "&H80000000"


def test_timestamp_con_centesimas() -> None:
    assert _timestamp(0.0) == "0:00:00.00"
    assert _timestamp(65.25) == "0:01:05.25"
    assert _timestamp(3725.5) == "1:02:05.50"


def test_timestamp_no_admite_negativos() -> None:
    assert _timestamp(-3.0) == "0:00:00.00"


def test_escape_neutraliza_el_marcado() -> None:
    """Unas llaves en el texto se interpretarian como etiquetas ASS."""
    assert "{" not in _escape("texto {con} llaves").replace("\\{", "")
    assert "\n" not in _escape("dos\nlineas")


# -- karaoke ---------------------------------------------------------------


def test_cada_palabra_lleva_su_etiqueta_de_tiempo() -> None:
    texto = _karaoke_text(_cap(1.0, 2.5, [(1.0, 1.4, "hola"), (1.5, 2.0, "que")]))
    assert texto.count("\\k") >= 2
    assert "hola" in texto and "que" in texto


def test_el_hueco_entre_palabras_consume_karaoke() -> None:
    """Si el hueco no contase, el resalte se adelantaria a lo largo de la linea."""
    texto = _karaoke_text(_cap(1.0, 3.0, [(1.0, 1.4, "a"), (2.0, 2.4, "b")]))
    # 0.6s de hueco = 60 centesimas
    assert "\\k60" in texto


def test_sin_palabras_cae_al_texto_plano() -> None:
    c = CaptionEffect(id="c", start=0, end=1, words=[])
    assert _karaoke_text(c) == ""


def test_los_tiempos_de_karaoke_suman_la_duracion() -> None:
    c = _cap(1.0, 2.6, [(1.0, 1.5, "uno"), (1.6, 2.1, "dos"), (2.1, 2.6, "tres")])
    import re

    total = sum(int(x) for x in re.findall(r"\\k(\d+)", _karaoke_text(c)))
    assert total == pytest.approx(160, abs=3)  # 1.6s en centesimas


# -- documento completo ----------------------------------------------------


def test_el_ass_tiene_sus_tres_secciones() -> None:
    salida = build_ass([_cap(palabras=[(1.0, 1.4, "hola")])], 1920, 1080)
    assert "[Script Info]" in salida
    assert "[V4+ Styles]" in salida
    assert "[Events]" in salida
    assert "Dialogue: 0," in salida


def test_la_resolucion_se_declara() -> None:
    """Sin PlayRes, libass escala el texto mal al cambiar de resolucion."""
    salida = build_ass([], 1280, 720)
    assert "PlayResX: 1280" in salida
    assert "PlayResY: 720" in salida


def test_el_tamano_de_fuente_escala_con_la_altura() -> None:
    pequeno = build_ass([_cap()], 640, 360)
    grande = build_ass([_cap()], 1920, 1080)
    def size(s: str) -> int:
        linea = next(l for l in s.splitlines() if l.startswith("Style: Default"))
        return int(linea.split(",")[2])
    assert size(grande) > size(pequeno) * 2


@pytest.mark.parametrize("tema", sorted(THEMES))
def test_todos_los_temas_generan_ass_valido(tema: str) -> None:
    salida = build_ass([_cap(palabras=[(1.0, 1.4, "hola")])], 1920, 1080, theme_name=tema)
    assert "Style: Default" in salida
    assert salida.count("Dialogue:") == 1


def test_un_tema_inexistente_cae_al_por_defecto() -> None:
    assert "Style: Default" in build_ass([_cap()], 1920, 1080, theme_name="no-existe")


def test_la_posicion_cambia_la_alineacion() -> None:
    def alineacion(pos: str) -> int:
        salida = build_ass([_cap(position=pos)], 1920, 1080)
        linea = next(l for l in salida.splitlines() if l.startswith("Style: Default"))
        return int(linea.split(",")[18])
    assert alineacion("bottom") == 2
    assert alineacion("center") == 5
    assert alineacion("top") == 8


def test_los_subtitulos_salen_ordenados() -> None:
    caps = [
        _cap(5.0, 6.0, [(5.0, 5.5, "tarde")]),
        _cap(1.0, 2.0, [(1.0, 1.5, "pronto")]),
    ]
    salida = build_ass(caps, 1920, 1080)
    assert salida.index("pronto") < salida.index("tarde")


def test_sin_subtitulos_el_fichero_sigue_siendo_valido() -> None:
    salida = build_ass([], 1920, 1080)
    assert "[Events]" in salida
    assert "Dialogue:" not in salida


def test_la_fuente_elegida_existe_en_el_sistema() -> None:
    assert resolve_font()


def test_se_escribe_a_disco(tmp_path) -> None:
    from forge.render.ass import write_ass

    destino = write_ass([_cap(palabras=[(1.0, 1.4, "hola")])], tmp_path / "s.ass", 1920, 1080)
    assert destino.is_file()
    assert "Dialogue:" in destino.read_text(encoding="utf-8")


# -- rotulos de capitulo ---------------------------------------------------


def test_el_rotulo_deja_pasar_la_barra_de_titulo() -> None:
    """En una grabacion de pantalla, arriba del todo esta el menu de la app.

    Con el margen anterior el rotulo de capitulo caia justo encima de la barra
    de titulo y se leian las dos cosas a la vez. Se ve en cuanto se mira un
    fotograma, y en ninguna medida numerica.
    """
    from forge.render.ass import CARD_MARGIN_RATIO

    alto = 720
    # Una barra de menu tipica ocupa unos 56 px de 720, un 7,8%.
    assert CARD_MARGIN_RATIO * alto > 56


def test_el_rotulo_y_los_subtitulos_no_se_pisan() -> None:
    """Uno arriba y otro abajo: no pueden solaparse nunca."""
    from forge.plan.edl import TextCardEffect
    from forge.render.ass import build_ass

    caption = CaptionEffect(
        id="c0", start=0.0, end=3.0,
        words=[Word(start=0.0, end=1.0, text="hola"), Word(start=1.0, end=2.0, text="mundo")],
    )
    card = TextCardEffect(id="k0", start=0.0, end=3.0, text="Primer capitulo")
    salida = build_ass([caption], 1920, 1080, cards=[card])

    estilos = {
        linea.split(",")[0].removeprefix("Style: "): linea.split(",")
        for linea in salida.splitlines() if linea.startswith("Style: ")
    }
    # Alineacion (campo 18): 7 es arriba-izquierda, 2 abajo-centro.
    assert estilos["Card"][18] == "7"
    assert estilos["Default"][18] == "2"


def test_el_rotulo_se_desvanece_sin_tocar_el_grafo() -> None:
    from forge.plan.edl import TextCardEffect
    from forge.render.ass import build_ass

    salida = build_ass([], 1920, 1080, cards=[
        TextCardEffect(id="k0", start=1.0, end=3.0, text="Ajustes")
    ])
    assert "\\fad(" in salida
    assert ",Card,," in salida


def test_los_dialogos_salen_ordenados_en_el_tiempo() -> None:
    """libass tolera el desorden, pero un .ass desordenado es ilegible a ojo."""
    from forge.plan.edl import TextCardEffect
    from forge.render.ass import build_ass

    caption = CaptionEffect(
        id="c0", start=5.0, end=6.0,
        words=[Word(start=5.0, end=6.0, text="tarde")],
    )
    card = TextCardEffect(id="k0", start=0.0, end=2.0, text="Pronto")
    lineas = [
        l for l in build_ass([caption], 1920, 1080, cards=[card]).splitlines()
        if l.startswith("Dialogue:")
    ]
    tiempos = [l.split(",")[1] for l in lineas]
    assert tiempos == sorted(tiempos)


# -- placas: el rotulo con una imagen detras --------------------------------
#
# Un rotulo era una caja de color con texto. Con una imagen detras --- el arte
# del juego --- el texto tiene que ir **sin caja** (la caja taparia la imagen),
# centrado en la placa y con la letra de un logo: cuerpo grande, contorno gordo
# y espaciado.


def _placa_card(texto: str, **kw):
    from forge.plan.edl import Rect, TextCardEffect

    return TextCardEffect(
        id="c0", start=1.0, end=4.0, text=texto,
        background="portada.webp",
        rect=Rect(x=0.05, y=0.07, w=0.42, h=0.13),
        **kw,
    )


def test_un_rotulo_sin_fondo_sigue_siendo_una_caja_de_color() -> None:
    from forge.plan.edl import LowerThirdEffect, Rect
    from forge.plan.styles import PlateRules
    from forge.render.ass import build_ass

    label = LowerThirdEffect(
        id="l0", start=1.0, end=4.0, title="Expediciones",
        rect=Rect(x=0.05, y=0.8, w=0.3, h=0.09),
    )
    salida = build_ass([], 1280, 720, labels=[label], plates=PlateRules())
    dialogo = next(l for l in salida.splitlines() if "Dialogue" in l)
    assert ",Label," in dialogo, dialogo
    assert "Expediciones" in dialogo, "ni mayusculas ni centrado"


def test_con_fondo_el_texto_va_sin_caja_y_centrado() -> None:
    from forge.plan.edl import LowerThirdEffect, Rect
    from forge.plan.styles import PlateRules
    from forge.render.ass import build_ass

    label = LowerThirdEffect(
        id="l0", start=1.0, end=4.0, title="Expediciones",
        rect=Rect(x=0.05, y=0.8, w=0.3, h=0.09), background="portada.webp",
    )
    salida = build_ass(
        [], 1280, 720, labels=[label], plates=PlateRules(background="portada.webp")
    )
    dialogo = next(l for l in salida.splitlines() if "Dialogue" in l)
    estilo = next(l for l in salida.splitlines() if l.startswith("Style: Plate"))

    assert ",Plate," in dialogo
    assert "EXPEDICIONES" in dialogo, "en mayusculas, como un logo"
    assert "\\an5" in dialogo, "centrado en la placa"
    # `BorderStyle` 1 = contorno y sombra, sin caja. Con 3 la caja taparia la
    # imagen. El indice se saca de la linea `Format:`, no a mano.
    formato = next(
        l for l in salida.splitlines() if l.startswith("Format: Name,")
    )
    nombres = [c.strip() for c in formato.split(":", 1)[1].split(",")]
    campos = [c.strip() for c in estilo.split(":", 1)[1].split(",")]
    assert campos[nombres.index("BorderStyle")] == "1", dict(zip(nombres, campos))


def test_la_tarjeta_de_capitulo_tambien() -> None:
    from forge.plan.styles import PlateRules
    from forge.render.ass import build_ass

    salida = build_ass(
        [], 1280, 720, cards=[_placa_card("Las expediciones")],
        plates=PlateRules(background="portada.webp"),
    )
    dialogo = next(l for l in salida.splitlines() if "Dialogue" in l)
    assert ",Plate," in dialogo, "con la caja del estilo Card se taparia el arte"
    assert "LAS EXPEDICIONES" in dialogo


def test_el_texto_no_se_sale_de_la_placa() -> None:
    """Un titulo de capitulo es una frase entera.

    Sin ajustar se sale por los dos lados y queda peor que sin placa. Y el
    espaciado cuenta: con 27 caracteres son 54 px mas, que era justo lo que se
    salia.
    """
    from forge.plan.styles import PlateRules
    from forge.render.ass import PLATE_CHAR_W, build_ass

    ancho_placa = 1280 * 0.42
    reglas = PlateRules(background="portada.webp", size=0.040, spacing=3.5)
    salida = build_ass(
        [], 1280, 720,
        cards=[_placa_card("Hola en este video montamos la base de cero")],
        plates=reglas,
    )
    dialogo = next(l for l in salida.splitlines() if "Dialogue" in l)
    cuerpo = int(round(720 * reglas.size))
    espaciado = reglas.spacing * 720 / 1080.0

    texto = dialogo.split("}", 1)[1]
    assert "\\N" in texto, "una frase entera tiene que partirse"
    for linea in texto.split("\\N"):
        ancho = len(linea) * (cuerpo * PLATE_CHAR_W + espaciado)
        assert ancho <= ancho_placa, (linea, round(ancho), round(ancho_placa))


def test_la_placa_puede_pedir_su_propia_fuente() -> None:
    """Una placa quiere letra de cartel, que no es la de un subtitulo.

    Cual es depende de lo que tengas instalado, asi que se nombra en el estilo
    y no se adivina. Si no esta, se usa la general en vez de dejar que libass
    caiga en su ultimo recurso.
    """
    from forge.plan.edl import LowerThirdEffect, Rect
    from forge.plan.styles import PlateRules
    from forge.render.ass import build_ass, resolve_font

    general = resolve_font()
    otra = next(
        (f for f in ("Liberation Sans", "FreeSans", "DejaVu Serif")
         if resolve_font(f) and f != general),
        None,
    )

    label = LowerThirdEffect(
        id="l0", start=1.0, end=4.0, title="Expediciones",
        rect=Rect(x=0.05, y=0.8, w=0.3, h=0.09), background="portada.webp",
    )

    def familia_de_placa(pedida: str) -> str:
        salida = build_ass(
            [], 1280, 720, labels=[label],
            plates=PlateRules(background="portada.webp", font=pedida),
        )
        estilo = next(l for l in salida.splitlines() if l.startswith("Style: Plate"))
        return estilo.split(",")[1]

    assert familia_de_placa("") == general, "sin pedir nada, la de siempre"
    assert familia_de_placa("Fuente Que No Existe 123") == general, (
        "una fuente que no esta no puede dejar la placa sin fuente"
    )
    if otra:
        assert familia_de_placa(otra) == otra
