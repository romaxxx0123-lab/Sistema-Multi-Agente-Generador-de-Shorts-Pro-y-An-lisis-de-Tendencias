"""Tests de los recuadros que senalan lo que se nombra.

Es el recurso que mas se parece a lo que hace un editor humano en una guia, y
tambien el que mas dano hace si se equivoca: un recuadro alrededor de algo que
no es lo que estas diciendo es peor que no poner nada. Por eso casi todos estos
tests comprueban **cuando NO se pone**.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest

from forge.analysis.frames import extract_frames_at
from forge.analysis.ocr import ScreenText, WordBox
from forge.analysis.pipeline import analyze
from forge.analysis.types import Transcript, TranscriptSegment, Word
from forge.config import Settings
from forge.plan.callouts import plan_callouts
from forge.plan.edl import EDL, CalloutEffect, Clip, EffectKind, Rect, RenderSpec
from forge.plan.planner import build_edl
from forge.plan.styles import CalloutRules
from forge.render.renderer import render


def _edl(duracion: float = 10.0) -> EDL:
    return EDL(
        source="a.mp4",
        source_duration=duracion,
        render=RenderSpec(width=1920, height=1080, fps=30),
        timeline=[Clip(id="c0", source_start=0.0, source_end=duracion)],
    )


def _transcript(pares: list[tuple[float, str]]) -> Transcript:
    palabras = [Word(start=t, end=t + 0.4, text=p) for t, p in pares]
    return Transcript(
        language="es",
        segments=[TranscriptSegment(
            start=palabras[0].start, end=palabras[-1].end,
            text=" ".join(p for _, p in pares), words=palabras,
        )],
    )


def _pantalla(at: float, cajas: list[tuple[str, float, float]]) -> ScreenText:
    return ScreenText(
        at=at,
        words=[t for t, _, _ in cajas],
        boxes=[WordBox(text=t, x=x, y=y, w=0.12, h=0.03) for t, x, y in cajas],
    )


# -- cuando si ------------------------------------------------------------


def test_senala_la_palabra_que_se_dice_y_esta_en_pantalla() -> None:
    edl = _edl()
    t = _transcript([(1.0, "pulsa"), (2.0, "Ajustes"), (3.0, "ahi")])
    pantalla = [_pantalla(2.0, [("Ajustes", 0.1, 0.4), ("Memoria", 0.1, 0.5)])]

    marcas, _ = plan_callouts(edl, t, pantalla, CalloutRules())
    assert len(marcas) == 1
    assert marcas[0].label == "Ajustes"
    # El recuadro envuelve la caja detectada, con su margen.
    assert marcas[0].rect.x < 0.1 and marcas[0].rect.y < 0.4
    assert marcas[0].rect.w > 0.12


def test_el_acento_no_impide_la_coincidencia() -> None:
    """El OCR se come los acentos la mitad de las veces."""
    edl = _edl()
    t = _transcript([(2.0, "configuración")])
    pantalla = [_pantalla(2.0, [("Configuracion", 0.2, 0.3)])]
    assert len(plan_callouts(edl, t, pantalla, CalloutRules())[0]) == 1


def test_agrupa_las_palabras_pegadas_en_un_solo_recuadro() -> None:
    """"Configuracion avanzada" es un boton, no dos."""
    edl = _edl()
    t = _transcript([(2.0, "configuracion")])
    pantalla = [ScreenText(
        at=2.0,
        words=["Configuracion", "avanzada"],
        boxes=[
            WordBox(text="Configuracion", x=0.10, y=0.40, w=0.14, h=0.03),
            WordBox(text="avanzada", x=0.25, y=0.40, w=0.09, h=0.03),
        ],
    )]
    marcas, _ = plan_callouts(edl, t, pantalla, CalloutRules())
    assert marcas[0].label == "Configuracion avanzada"
    assert marcas[0].rect.w > 0.24, "el recuadro corta la segunda palabra"


# -- cuando no ------------------------------------------------------------


def test_si_la_palabra_sale_dos_veces_no_se_senala_ninguna() -> None:
    """Senalar la equivocada es peor que no senalar."""
    edl = _edl()
    t = _transcript([(2.0, "memoria")])
    pantalla = [_pantalla(2.0, [("Memoria", 0.1, 0.3), ("Memoria", 0.6, 0.7)])]
    assert plan_callouts(edl, t, pantalla, CalloutRules())[0] == []


def test_no_se_senala_lo_que_no_esta_en_pantalla() -> None:
    edl = _edl()
    t = _transcript([(2.0, "servidor")])
    pantalla = [_pantalla(2.0, [("Ajustes", 0.1, 0.4)])]
    assert plan_callouts(edl, t, pantalla, CalloutRules())[0] == []


def test_las_palabras_comunes_no_disparan_recuadros() -> None:
    edl = _edl()
    t = _transcript([(2.0, "esta"), (3.0, "para")])
    pantalla = [_pantalla(2.0, [("esta", 0.1, 0.4), ("para", 0.3, 0.4)])]
    assert plan_callouts(edl, t, pantalla, CalloutRules())[0] == []


def test_una_lectura_de_pantalla_lejana_no_vale() -> None:
    """Lo que habia en pantalla hace veinte segundos ya no esta."""
    edl = _edl(60.0)
    t = _transcript([(40.0, "Ajustes")])
    pantalla = [_pantalla(2.0, [("Ajustes", 0.1, 0.4)])]
    assert plan_callouts(edl, t, pantalla, CalloutRules())[0] == []


def test_sin_ocr_no_pasa_nada() -> None:
    edl = _edl()
    t = _transcript([(2.0, "Ajustes")])
    assert plan_callouts(edl, t, [], CalloutRules()) == ([], [])


def test_se_respeta_la_separacion_minima() -> None:
    edl = _edl(60.0)
    t = _transcript([(2.0, "Ajustes"), (4.0, "Memoria"), (40.0, "Proyectos")])
    pantalla = [
        _pantalla(2.0, [("Ajustes", 0.1, 0.3)]),
        _pantalla(4.0, [("Memoria", 0.1, 0.4)]),
        _pantalla(40.0, [("Proyectos", 0.1, 0.5)]),
    ]
    elegidos, reservas = plan_callouts(edl, t, pantalla, CalloutRules(min_gap=12.0))
    assert [e.label for e in elegidos] == ["Ajustes", "Proyectos"]
    assert [e.label for e in reservas] == ["Memoria"]


def test_desactivado_no_pone_ninguno() -> None:
    edl = _edl()
    t = _transcript([(2.0, "Ajustes")])
    pantalla = [_pantalla(2.0, [("Ajustes", 0.1, 0.4)])]
    assert plan_callouts(edl, t, pantalla, CalloutRules(enabled=False)) == ([], [])


# -- que se vea en el video -----------------------------------------------


def test_el_recuadro_se_dibuja_de_verdad(
    sample_video: Path, settings: Settings, tmp_path: Path
) -> None:
    """Se renderiza con y sin recuadro y se resta: lo que queda es el trazo."""
    analysis, _ = analyze(sample_video, settings, skip_speech=True)
    edl = build_edl(analysis, "tutorial")
    # Sin subtitulos y **sin zooms**: aqui se comprueba la posicion a secas.
    # Lo que pasa cuando ademas hay un zoom tiene su propio test debajo.
    edl.effects = [
        e for e in edl.effects
        if e.kind not in (EffectKind.CAPTION, EffectKind.PUNCH_IN, EffectKind.KEN_BURNS)
    ]

    marca = CalloutEffect(
        id="call000",
        start=1.0,
        end=min(3.0, edl.duration),
        rect=Rect(x=0.30, y=0.30, w=0.30, h=0.20),
        label="prueba",
    )

    sin = tmp_path / "sin.mp4"
    render(edl, sin, settings)
    edl.effects = [*edl.effects, marca]
    con = tmp_path / "con.mp4"
    render(edl, con, settings)

    t = 2.0
    a = extract_frames_at(sin, settings, [t], width=640, height=360)[0]
    b = extract_frames_at(con, settings, [t], width=640, height=360)[0]
    diferencia = np.abs(b.astype(int) - a.astype(int)).max(axis=2)

    filas = np.where(diferencia.max(axis=1) > 40)[0]
    columnas = np.where(diferencia.max(axis=0) > 40)[0]
    assert len(filas) and len(columnas), "no se dibujo nada"

    # El trazo cae donde se pidio, no en cualquier sitio.
    assert abs(filas.min() / 360 - 0.30) < 0.05, f"arriba en {filas.min() / 360:.2f}"
    assert abs(filas.max() / 360 - 0.50) < 0.05, f"abajo en {filas.max() / 360:.2f}"
    assert abs(columnas.min() / 640 - 0.30) < 0.05
    assert abs(columnas.max() / 640 - 0.60) < 0.05

    # Y es un recuadro, no un relleno: el centro no se toca.
    centro = diferencia[int(360 * 0.38):int(360 * 0.42), int(640 * 0.40):int(640 * 0.50)]
    assert centro.max() <= 40, "el recuadro tapa lo que deberia estar senalando"


def test_el_recuadro_no_esta_antes_de_su_momento(
    sample_video: Path, settings: Settings, tmp_path: Path
) -> None:
    analysis, _ = analyze(sample_video, settings, skip_speech=True)
    edl = build_edl(analysis, "tutorial")
    edl.effects = [e for e in edl.effects if e.kind is not EffectKind.CAPTION]
    sin = tmp_path / "sin2.mp4"
    render(edl, sin, settings)

    edl.effects = [*edl.effects, CalloutEffect(
        id="call000", start=4.0, end=min(6.0, edl.duration),
        rect=Rect(x=0.30, y=0.30, w=0.30, h=0.20), label="prueba",
    )]
    con = tmp_path / "con2.mp4"
    render(edl, con, settings)

    a = extract_frames_at(sin, settings, [1.5], width=640, height=360)[0]
    b = extract_frames_at(con, settings, [1.5], width=640, height=360)[0]
    assert np.abs(b.astype(int) - a.astype(int)).max() <= 40, (
        "el recuadro aparece fuera de su ventana"
    )


def test_el_recuadro_se_acerca_con_la_imagen(
    sample_video: Path, settings: Settings, tmp_path: Path
) -> None:
    """El fallo que motivo la auditoria, medido en el fotograma.

    El recuadro se calculaba en coordenadas del fotograma de **salida** y se
    dibujaba **despues** del zoom, asi que con un zoom activo senalaba otro
    sitio: con 1,45 se iba 134 px, y un boton de menu mide 170. Y no era un
    caso raro, era el normal: el zoom y el recuadro se colocan por la misma
    senal, que es que estas senalando algo.

    Ahora la caja se dibuja dentro del clip, antes del zoom, asi que el zoom se
    la lleva con la imagen. Aqui se renderiza con zoom y se comprueba que el
    trazo cae donde el recorte dice, no donde caia antes.
    """
    from forge.plan.edl import PunchInEffect

    analysis, _ = analyze(sample_video, settings, skip_speech=True)
    edl = build_edl(analysis, "tutorial")
    edl.effects = [
        e for e in edl.effects
        if e.kind not in (EffectKind.CAPTION, EffectKind.PUNCH_IN, EffectKind.KEN_BURNS)
    ]

    rect = Rect(x=0.30, y=0.30, w=0.30, h=0.20)
    zoom = 1.4
    recorte = Rect.centered(0.5, 0.5, zoom)   # zoom al centro, sin deriva

    marca = CalloutEffect(id="call000", start=1.0, end=min(3.0, edl.duration), rect=rect)
    punch = PunchInEffect(
        id="punch000", start=0.5, end=min(3.5, edl.duration),
        rect=recorte, ease_seconds=0.2, drift=0.0,
    )

    sin = tmp_path / "sin-zoom.mp4"
    edl.effects = [*edl.effects, punch]
    render(edl, sin, settings)
    con = tmp_path / "con-zoom.mp4"
    edl.effects = [*edl.effects, marca]
    render(edl, con, settings)

    t = 2.0
    a = extract_frames_at(sin, settings, [t], width=640, height=360)[0]
    b = extract_frames_at(con, settings, [t], width=640, height=360)[0]
    diferencia = np.abs(b.astype(int) - a.astype(int)).max(axis=2)
    columnas = np.where(diferencia.max(axis=0) > 40)[0]
    assert len(columnas), "no se dibujo nada"

    # Donde tiene que verse el borde izquierdo: el recorte lo acerca.
    esperado = (rect.x - recorte.x) / recorte.w
    visto = columnas.min() / 640
    assert abs(visto - esperado) < 0.05, f"se ve en {visto:.2f} y toca en {esperado:.2f}"
    # Y desde luego ya no donde se pintaba antes.
    assert abs(visto - rect.x) > 0.03, "sigue pintandose en el fotograma de salida"


# -- y la cara del recuadro, que tambien es del estilo -----------------------
#
# Un trazo de un color se pierde sobre una imagen movida y llena de colores, que
# es exactamente lo que es un gameplay. Con esto un estilo le da la cara de su
# juego sin tocar una linea de codigo.


def _marca():
    from forge.plan.edl import CalloutEffect, Rect

    return CalloutEffect(
        id="c0", start=1.0, end=3.0, label="paldium 5",
        rect=Rect(x=0.3, y=0.4, w=0.2, h=0.1),
    )


def test_el_recuadro_de_siempre_sigue_siendo_un_trazo() -> None:
    """Lo nuevo esta apagado por defecto: nadie cambia de aspecto sin pedirlo."""
    from forge.plan.styles import CalloutRules
    from forge.render.graph import _callout_filters

    filtros = _callout_filters([_marca()], 1920, 1080, CalloutRules())
    assert filtros
    assert all("t=fill" not in f for f in filtros), "sin relleno ni esquinas"


def test_el_estilo_puede_darle_cara_de_interfaz_de_juego() -> None:
    from forge.plan.styles import CalloutRules
    from forge.render.graph import _callout_filters

    reglas = CalloutRules(
        color="FFD700", edge_color="#14171C",
        fill=0.2, fill_color="#1E2126",
        corner=0.2, corner_color="#F6EFE2",
    )
    filtros = _callout_filters([_marca()], 1920, 1080, reglas)
    juntos = " ".join(filtros)

    assert "0x1E2126" in juntos, "falta el relleno"
    assert "0x14171C" in juntos, "falta el filo oscuro"
    assert "0xFFD700" in juntos, "falta el trazo"
    assert juntos.count("0xF6EFE2") >= 8, "ocho trazos: dos por esquina"
    assert "#" not in juntos, "ffmpeg no entiende la almohadilla"


def test_el_filo_va_por_fuera_del_trazo() -> None:
    """Si va por dentro tapa lo que se quiere resaltar."""
    import re

    from forge.plan.styles import CalloutRules
    from forge.render.graph import _callout_filters

    filtros = _callout_filters(
        [_marca()], 1920, 1080,
        CalloutRules(color="FFD700", edge_color="#14171C", thickness=0.004),
    )
    trazo = next(f for f in filtros if "0xFFD700" in f)
    filo = next(f for f in filtros if "0x14171C" in f)

    def caja(f):
        return {k: int(v) for k, v in re.findall(r"\b([xywh])=(\d+)", f)}

    t, e = caja(trazo), caja(filo)
    assert e["x"] < t["x"] and e["y"] < t["y"]
    assert e["w"] > t["w"] and e["h"] > t["h"]


def test_la_etiqueta_dice_que_hay_dentro_del_recuadro() -> None:
    """El recuadro dice donde mirar; la etiqueta dice que es."""
    from forge.plan.edl import EffectKind
    from forge.plan.planner import _callout_labels
    from forge.plan.styles import CalloutRules

    marca = _marca()

    assert _callout_labels([marca], CalloutRules()) == [], "apagada por defecto"

    etiquetas = _callout_labels([marca], CalloutRules(label=True, label_color="#8A5A2B"))
    assert len(etiquetas) == 1
    e = etiquetas[0]
    assert e.kind is EffectKind.LOWER_THIRD
    assert e.title == "paldium 5"
    assert e.color == "#8A5A2B"
    assert e.start == marca.start and e.end == marca.end
    assert e.rect.y < marca.rect.y, "encima del recuadro, no dentro"
    assert e.rect.x == pytest.approx(marca.rect.x), "alineada con el"


def test_el_estilo_palworld_trae_la_cara_puesta() -> None:
    from forge.plan.styles import load_style

    juego = load_style("palworld").callouts
    neutro = load_style("tutorial").callouts

    assert juego.corner > 0 and juego.fill > 0 and juego.edge_color
    assert juego.label is True
    assert neutro.corner == 0 and neutro.fill == 0 and not neutro.edge_color
    assert neutro.label is False


# -- lo que solo se ve ampliando el fotograma -------------------------------


def test_las_esquinas_no_parten_el_trazo() -> None:
    """Dibujadas encima, se leen como un agujero.

    Un trocito claro justo donde la linea dorada se interrumpe, cuatro veces:
    el recuadro parece roto por las esquinas en vez de reforzado. Van por fuera,
    envolviendo.
    """
    import re

    from forge.plan.styles import CalloutRules
    from forge.render.graph import _callout_filters

    filtros = _callout_filters(
        [_marca()], 1920, 1080,
        CalloutRules(color="FFD700", corner=0.2, corner_color="F6EFE2"),
    )

    def caja(f):
        return {k: int(v) for k, v in re.findall(r"\b([xywh])=(\d+)", f)}

    trazo = caja(next(f for f in filtros if "0xFFD700" in f))
    # Cada pieza se emite una vez por tramo del fundido; aqui solo interesa la
    # geometria, asi que se quita el repetido.
    esquinas = [
        dict(g) for g in {
            tuple(sorted(caja(f).items())) for f in filtros if "0xF6EFE2" in f
        }
    ]
    assert len(esquinas) == 8, "dos trazos por esquina"

    # La de arriba a la izquierda tiene que empezar antes que el trazo.
    arriba_izq = [e for e in esquinas if e["x"] < trazo["x"] and e["y"] < trazo["y"]]
    assert len(arriba_izq) == 2, esquinas


def test_el_brazo_de_la_esquina_no_es_un_cuadradito() -> None:
    """En un recuadro bajito, una fraccion del lado menor sale tan corta como el
    propio grosor: 8 px de brazo con 8 px de trazo es un cuadrado, no una L."""
    import re

    from forge.plan.edl import CalloutEffect, Rect
    from forge.plan.styles import CalloutRules
    from forge.render.graph import _callout_filters

    bajito = CalloutEffect(
        id="c1", start=1.0, end=3.0, label="x",
        rect=Rect(x=0.3, y=0.4, w=0.25, h=0.035),   # 38 px de alto a 1080
    )
    reglas = CalloutRules(color="FFD700", thickness=0.004, corner=0.2,
                          corner_color="F6EFE2")
    filtros = _callout_filters([bajito], 1920, 1080, reglas)

    def caja(f):
        return {k: int(v) for k, v in re.findall(r"\b([xywh])=(\d+)", f)}

    esquinas = [
        dict(g) for g in {
            tuple(sorted(caja(f).items())) for f in filtros if "0xF6EFE2" in f
        }
    ]
    brazos = [max(e["w"], e["h"]) for e in esquinas]
    gordos = [min(e["w"], e["h"]) for e in esquinas]
    assert min(brazos) >= min(gordos) * 2, (brazos, gordos)


def test_la_etiqueta_deja_sitio_a_su_propia_caja() -> None:
    """La caja de un rotulo la dibuja ASS y se ajusta sola al texto.

    Colocarla con el hueco del alto nominal la dejaba pisando el recuadro, que
    es tapar justo lo que se esta senalando.
    """
    from forge.plan.planner import LABEL_BOX_HEIGHT, _callout_labels
    from forge.plan.styles import CalloutRules
    from forge.render.ass import LABEL_SIZE_RATIO

    assert LABEL_BOX_HEIGHT > LABEL_SIZE_RATIO, (
        "el cuerpo de letra no es el alto de la caja: ASS le anade relleno"
    )

    marca = _marca()
    etiqueta = _callout_labels([marca], CalloutRules(label=True))[0]
    assert etiqueta.rect.y + LABEL_BOX_HEIGHT <= marca.rect.y + 1e-6, (
        "la etiqueta entera tiene que caber encima del recuadro"
    )
