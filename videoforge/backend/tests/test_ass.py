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
