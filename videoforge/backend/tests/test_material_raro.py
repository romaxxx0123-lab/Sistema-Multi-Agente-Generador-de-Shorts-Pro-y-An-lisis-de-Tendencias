"""Tests con ficheros que no se parecen al material de pruebas.

Una grabacion real de YouTube trae cosas que ningun fixture sintetico tiene:
fps variable (lo que sacan OBS y ShareX), 4K, vertical, metadatos de rotacion,
audio en 5.1 o mono a 44,1 kHz, musica de fondo a nivel constante. Pasar una
bateria de ficheros asi por el sistema entero encontro el fallo mas grave de
todo el proyecto, y encima escondido detras de un "todo OK":

**Un audio de nivel plano borraba el video entero.** Sin separacion entre el
fondo y la voz, el umbral de silencio se ponia un poco por encima del suelo (que
suena de lo mas razonable) y caia **por encima de la senal entera**: el 100% del
video pasaba a ser silencio y el montaje se lo comia todo. Doce segundos de
entrada, ocho decimas de salida, sin un solo error. Pasa con musica de fondo
constante, con una voz ya muy comprimida, o con un tono.

Y habia un test que fijaba esa conducta como la correcta.
"""

from __future__ import annotations

import numpy as np
import pytest

from forge.analysis.audio import choose_threshold_db, find_silences
from forge.analysis.types import Analysis, AudioAnalysis, SilenceRange
from forge.media import MediaInfo, VideoStream
from forge.plan.planner import MIN_KEEP_RATIO, _build_timeline
from forge.plan.styles import load_style


def _analisis(duracion: float, silencios: list[tuple[float, float]]) -> Analysis:
    return Analysis(
        media=MediaInfo(
            path="x.mp4", size_bytes=1000, duration=duracion,
            video=VideoStream(index=0, codec="h264", width=1280, height=720, fps=30.0),
            has_audio=True,
        ),
        audio=AudioAnalysis(
            duration=duracion,
            silences=[SilenceRange(start=a, end=b) for a, b in silencios],
        ),
    )


# -- el umbral nunca puede quedar por encima del audio ----------------------


@pytest.mark.parametrize("nivel", [-6.0, -25.0, -60.0])
def test_un_audio_plano_no_se_marca_como_silencio(nivel: float) -> None:
    """El nivel absoluto da igual: lo que importa es que no hay dos poblaciones."""
    plano = np.full(400, nivel, dtype=np.float32)
    umbral, _suelo, _voz = choose_threshold_db(plano)
    assert umbral < plano.min()
    assert find_silences(plano, 0.02, umbral, 0.5, 8.0) == []


def test_un_audio_casi_plano_tampoco() -> None:
    """Musica de fondo constante: varia un poco, pero no separa voz de fondo."""
    rng = np.random.default_rng(0)
    casi = (-24.0 + rng.normal(0, 1.2, 400)).astype(np.float32)
    umbral, _s, _v = choose_threshold_db(casi)
    assert find_silences(casi, 0.02, umbral, 0.5, 8.0) == []


def test_con_voz_y_pausas_si_se_marca() -> None:
    """La proteccion no puede dejar el detector inutil."""
    senal = np.full(400, -14.0, dtype=np.float32)
    senal[120:220] = -52.0
    umbral, suelo, voz = choose_threshold_db(senal)
    assert suelo < umbral < voz
    silencios = find_silences(senal, 0.02, umbral, 0.5, 8.0)
    assert len(silencios) == 1
    assert silencios[0].start == pytest.approx(120 * 0.02, abs=0.1)


# -- red de seguridad del montaje ------------------------------------------


def test_un_montaje_no_puede_comerse_el_video(caplog) -> None:
    """Aunque el detector se equivoque, no se entrega un video de dos segundos."""
    estilo = load_style("tutorial")
    # El caso patologico: "todo es silencio".
    clips, notas = _build_timeline(_analisis(60.0, [(0.0, 60.0)]), estilo)

    conservado = sum(c.source_end - c.source_start for c in clips)
    assert conservado == pytest.approx(60.0, abs=0.1), (
        f"se quedo con {conservado:.1f}s de 60"
    )
    assert any("No se recorto nada" in n for n in notas), notas


def test_la_red_no_se_dispara_con_un_recorte_normal() -> None:
    """Quitar un 20% de tiempo muerto es lo normal y tiene que pasar."""
    estilo = load_style("tutorial")
    silencios = [(i * 10.0, i * 10.0 + 2.0) for i in range(6)]  # 12s de 60
    clips, notas = _build_timeline(_analisis(60.0, silencios), estilo)

    conservado = sum(c.source_end - c.source_start for c in clips)
    assert conservado < 59.0, "no recorto nada"
    assert conservado > 60.0 * MIN_KEEP_RATIO
    assert not any("No se recorto nada" in n for n in notas)


def test_el_limite_esta_donde_se_dice() -> None:
    """Un recorte agresivo pero plausible pasa; uno absurdo, no."""
    estilo = load_style("tutorial")

    # Se deja justo por encima del limite: tiene que recortar de verdad.
    aceptable = _analisis(100.0, [(0.0, 100.0 * (1 - MIN_KEEP_RATIO) * 0.9)])
    clips, notas = _build_timeline(aceptable, estilo)
    assert not any("No se recorto nada" in n for n in notas)

    # Y por debajo, se protege.
    absurdo = _analisis(100.0, [(0.0, 99.0)])
    clips, notas = _build_timeline(absurdo, estilo)
    assert any("No se recorto nada" in n for n in notas)
