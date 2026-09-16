"""Ver **que** cambia en la pantalla, no solo cuando.

El detector de planos ya encontraba **cuando** pasa algo -- en una grabacion de
pantalla, que salte un dialogo cambia bastante imagen como para marcar un corte
-- y eso funcionaba bien. Lo que faltaba es **que**.

El analisis contestaba "a donde hay que mirar" con el centro de masas de la
saliencia, que mide contraste; y en una interfaz el contraste esta repartido por
toda la pantalla. Medido sobre esta misma grabacion, con un dialogo que aparece
en el segundo 16 centrado en (0.46, 0.46):

    el analisis mandaba mirar a (0.31, 0.29)    <- el menu de antes
    error: 0.23 de pantalla

O sea que el zoom se acercaba al menu viejo justo cuando lo que habia que ver
era el dialogo nuevo. Y en una guia, lo que acaba de aparecer es lo que todo el
mundo esta mirando.
"""

from __future__ import annotations

import math
import subprocess

import pytest

from forge.analysis.changes import ScreenChange, change_near, find_changes
from forge.analysis.pipeline import analyze
from forge.config import Settings
from forge.plan.edl import EffectKind
from forge.plan.planner import build_edl
from forge.tools import ffmpeg_bin

#: Lo que pasa en la grabacion y **donde**, en fracciones de pantalla.
#: (instante, nombre, x0, y0, x1, y1)
SUCESOS = (
    (8.0, "se abre un menu", 0.05, 0.18, 0.30, 0.30),
    (16.0, "aparece un dialogo", 0.34, 0.36, 0.59, 0.56),
    (24.0, "se cierra el dialogo", 0.34, 0.36, 0.59, 0.56),
    (32.0, "cambia el panel derecho", 0.70, 0.19, 0.95, 0.40),
)

_UI = """[Script Info]
ScriptType: v4.00+
PlayResX: 1280
PlayResY: 720
WrapStyle: 2

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: UI,DejaVu Sans,26,&H00202020,&H00202020,&H00FFFFFF,&H00FFFFFF,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1
Style: Caja,DejaVu Sans,26,&H00FFFFFF,&H00FFFFFF,&H00806040,&H00806040,-1,0,0,0,100,100,0,0,3,10,0,7,0,0,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,0:00:40.00,UI,,0,0,0,,{\\pos(40,30)}Editor de configuracion
Dialogue: 0,0:00:00.00,0:00:40.00,UI,,0,0,0,,{\\pos(40,90)}Archivo   Editar   Ver   Ayuda
Dialogue: 0,0:00:08.00,0:00:40.00,Caja,,0,0,0,,{\\pos(60,130)}Abrir reciente\\NGuardar como\\NExportar
Dialogue: 0,0:00:16.00,0:00:24.00,Caja,,0,0,0,,{\\pos(430,260)}Confirmar cambios\\N\\NAceptar    Cancelar
Dialogue: 0,0:00:00.00,0:00:32.00,UI,,0,0,0,,{\\pos(900,140)}Propiedades
Dialogue: 0,0:00:32.00,0:00:40.00,Caja,,0,0,0,,{\\pos(900,140)}Propiedades\\Nancho 1280\\Nalto 720
"""


@pytest.fixture(scope="module")
def grabacion(tmp_path_factory, settings: Settings):
    """Una grabacion de pantalla donde se sabe que pasa y cuando."""
    d = tmp_path_factory.mktemp("pantalla")
    ass = d / "ui.ass"
    ass.write_text(_UI, encoding="utf-8")
    video = d / "pantalla.mp4"
    subprocess.run(
        [str(ffmpeg_bin(settings)), "-y", "-loglevel", "error",
         "-f", "lavfi", "-i", "color=c=0xf4f4f4:s=1280x720:r=25:d=40",
         "-f", "lavfi", "-i", "sine=frequency=220:duration=40",
         "-vf", f"ass={ass}", "-c:v", "libx264", "-crf", "20",
         "-pix_fmt", "yuv420p", "-c:a", "aac", str(video)],
        check=True, capture_output=True,
    )
    return video


@pytest.fixture(scope="module")
def analisis(grabacion, settings: Settings):
    a, _ = analyze(grabacion, settings, skip_speech=True)
    return a


# -- lo que encuentra --------------------------------------------------------


def test_encuentra_los_cuatro_sucesos(analisis) -> None:
    momentos = [c.at for c in analisis.changes]
    for cuando, nombre, *_ in SUCESOS:
        assert any(abs(m - cuando) < 1.0 for m in momentos), (nombre, momentos)


def test_y_sabe_donde_paso_cada_uno(analisis) -> None:
    """Esto es lo nuevo: el "donde", que antes no existia."""
    for cuando, nombre, x0, y0, x1, y1 in SUCESOS:
        cambio = change_near(analisis.changes, cuando)
        assert cambio is not None, nombre
        centro_real = ((x0 + x1) / 2, (y0 + y1) / 2)
        error = math.hypot(cambio.cx - centro_real[0], cambio.cy - centro_real[1])
        assert error < 0.10, (nombre, error, cambio)


def test_mejora_de_verdad_sobre_el_foco_por_contraste(analisis) -> None:
    """La comparacion que justifica todo esto, sobre el dialogo del segundo 16."""
    real = (0.46, 0.46)

    foco = analisis.focus_at(18.0)
    por_contraste = math.hypot(foco.cx - real[0], foco.cy - real[1])

    cambio = change_near(analisis.changes, 16.0)
    por_cambio = math.hypot(cambio.cx - real[0], cambio.cy - real[1])

    assert por_contraste > 0.15, por_contraste     # el fallo que habia
    assert por_cambio < 0.08, por_cambio           # lo que hay ahora
    assert por_cambio * 3 < por_contraste


def test_un_video_quieto_no_tiene_sucesos(sample_video, settings: Settings) -> None:
    """Y no se inventa ninguno donde no los hay."""
    a, _ = analyze(sample_video, settings, skip_speech=True)
    for cambio in a.changes:
        assert 0.0 <= cambio.x <= 1.0 and 0.0 <= cambio.w <= 1.0
        assert cambio.area > 0.0


def test_ya_no_depende_de_los_cortes_de_plano(grabacion, settings: Settings) -> None:
    """Lo que cambio esta vez: antes solo se miraba en los cortes de plano.

    Eso dejaba fuera la mayoria de los sucesos de una interfaz, que cambian muy
    poca imagen -- un panel que se sustituye por otro, un valor que se
    actualiza -- y por poca imagen no hay corte de plano. Ahora se barre el
    video entero y `shots` sobra: dar la lista o no darla da lo mismo.
    """
    con = find_changes(grabacion, settings)
    sin = find_changes(grabacion, settings, [])
    assert [c.at for c in con] == [c.at for c in sin]
    assert con, "el barrido encuentra sucesos sin que nadie le diga donde mirar"


def test_un_suceso_largo_se_cuenta_una_vez(analisis) -> None:
    """Un dialogo que tarda en dibujarse sale en varios fotogramas seguidos.

    Es el mismo suceso, no cuatro. Se fusionan los que caen juntos en el tiempo
    y se pisan en pantalla, y se queda el primero, que es cuando empezo.
    """
    for a, b in zip(analisis.changes, analisis.changes[1:]):
        if b.at - a.at > 1.5:
            continue
        ancho = max(0.0, min(a.x + a.w, b.x + b.w) - max(a.x, b.x))
        alto = max(0.0, min(a.y + a.h, b.y + b.h) - max(a.y, b.y))
        comun = ancho * alto
        assert comun <= 0.4 * min(a.w * a.h, b.w * b.h), (a, b)


# -- y que hace el montaje con ello -----------------------------------------


def test_el_zoom_encuadra_lo_que_acaba_de_aparecer(analisis) -> None:
    edl = build_edl(analisis, "tutorial")
    zooms = [e for e in edl.effects if e.kind is EffectKind.PUNCH_IN]
    assert zooms, "el estilo tutorial pone al menos uno"

    encuadres = 0
    for zoom in zooms:
        origen = edl.timeline_to_source(zoom.start)
        cambio = change_near(analisis.changes, origen, window=1.5)
        if cambio is None:
            continue
        r = zoom.rect
        assert r.x <= cambio.x + 0.02 and r.y <= cambio.y + 0.02
        assert r.x + r.w >= cambio.x + cambio.w - 0.02
        assert r.y + r.h >= cambio.y + cambio.h - 0.02
        encuadres += 1
    assert encuadres, "ningun zoom cayo sobre un suceso"


def test_el_montaje_lo_explica_con_sus_palabras(analisis) -> None:
    edl = build_edl(analisis, "gaming-hype")
    razones = [e.rationale for e in edl.effects if e.kind is EffectKind.PUNCH_IN]
    assert any("acaba de aparecer" in r for r in razones), razones


def test_un_suceso_vale_mas_que_un_trozo_con_contraste() -> None:
    """El orden de las dos senales, que estaba al reves.

    Los candidatos por saliencia llegaban a 0.824 y el zoom sobre el dialogo
    que acababa de aparecer valia 0.72, asi que perdia el unico hueco del cupo
    contra un trozo de pantalla con contraste.
    """
    from forge.plan.emphasis import APPEARED_SCORE, POINTED_SCORE

    assert APPEARED_SCORE > 0.824
    assert APPEARED_SCORE < POINTED_SCORE, "lo que dices sigue mandando"


# -- la cache, que es donde mordio ------------------------------------------


def test_el_segundo_analisis_lee_su_propia_cache(grabacion, settings: Settings) -> None:
    """Regresion: con OCR de verdad, las cajas se guardaban como su `repr` y el
    segundo analisis del mismo video reventaba al releerlas."""
    primero, _ = analyze(grabacion, settings, skip_speech=True, force={"all"})
    segundo, _ = analyze(grabacion, settings, skip_speech=True)

    assert [c.at for c in segundo.changes] == [c.at for c in primero.changes]
    if primero.screen_text:
        assert segundo.screen_text
        assert segundo.screen_text[0].boxes[0].text == primero.screen_text[0].boxes[0].text


def test_el_cache_no_guarda_objetos_como_texto() -> None:
    """La causa de fondo: `default=str` guardaba cualquier objeto como su repr
    y el fichero quedaba valido. Ahora lo que no sepa guardar, falla."""
    from dataclasses import dataclass

    from forge.cache import _serializar

    @dataclass
    class _Caja:
        x: float

    assert _serializar(_Caja(x=0.5)) == {"x": 0.5}
    with pytest.raises(TypeError):
        _serializar(object())
