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
