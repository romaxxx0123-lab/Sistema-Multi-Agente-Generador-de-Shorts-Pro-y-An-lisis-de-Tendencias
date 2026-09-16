"""Que la app monte de verdad un video entero, con **cualquier** estilo.

Cada pieza tenia su prueba y la suite entera pasaba, pero nadie habia montado
un video de punta a punta con los seis estilos. Al hacerlo salieron tres cosas
que ninguna prueba veia:

1. `documentary` **reventaba**. `ScreenUse.busy` desempaquetaba el puntero como
   una tupla y `CursorTrack.at` devuelve una muestra. No se veia porque las
   pruebas de colocacion usaban un puntero de mentira que si devolvia tupla: el
   de verdad no habia pasado nunca por ahi. Uno de los seis estilos estaba
   muerto.

2. `cinematic` devolvia **el video sin tocar**: un clip, cero cortes, cero
   subtitulos. Su estilo tenia el umbral de silencio puesto en 1,6s y el
   interruptor apagado, asi que no habia nada que generase un corte --- mientras
   su propia banda pedia de 3 a 11 cortes por minuto.

3. Y el medidor de saturacion decia **"en el punto"** de los seis, incluido el
   que no habia cortado nada. La nota es una media ponderada, y la media tapa un
   cero: el hueco de los cortes lo compensaba la densidad de efectos.

Asi que esta prueba monta el video entero con todos los estilos y mira lo unico
que importa: que no pete, que de verdad edite, y que el medidor diga lo que
falta en vez de bendecirlo todo.
"""

from __future__ import annotations

import pytest

from forge.analysis.pipeline import analyze
from forge.config import Settings
from forge.demo import build_demo_video, demo_screen_text, demo_transcript
from forge.plan.planner import build_edl
from forge.plan.styles import list_styles, load_style
from forge.saturation.score import evaluate


@pytest.fixture(scope="module")
def guia(tmp_path_factory, settings: Settings):
    """La guia realista del generador, con su transcripcion y su pantalla."""
    out = tmp_path_factory.mktemp("estilos") / "guia.mp4"
    video, timing = build_demo_video(out, settings)
    analisis, _ = analyze(video, settings, force={"all"}, skip_speech=True)
    analisis.transcript = demo_transcript(timing)
    analisis.screen_text = demo_screen_text(timing)
    return analisis


@pytest.mark.parametrize("estilo", list_styles())
def test_cada_estilo_monta_el_video_sin_reventar(guia, estilo: str) -> None:
    """Lo primero de todo: que salga un montaje."""
    edl = build_edl(guia, estilo)
    assert edl.timeline, estilo
    assert edl.duration > 0, estilo


@pytest.mark.parametrize("estilo", list_styles())
def test_cada_estilo_edita_de_verdad(guia, estilo: str) -> None:
    """Devolver el original tal cual no es un montaje, es no hacer nada.

    Es lo que hacia `cinematic`: un clip de 241 segundos y a correr. Un estilo
    puede editar poco --- eso es una decision legitima --- pero ninguno puede
    entregar el video intacto y llamarlo montaje.
    """
    edl = build_edl(guia, estilo)
    assert len(edl.timeline) > 1, f"{estilo} devolvio el video en un solo clip"
    assert edl.compression > 0.01, f"{estilo} no recorto nada ({edl.compression:.1%})"


@pytest.mark.parametrize("estilo", list_styles())
def test_cada_estilo_alcanza_su_propia_banda_de_ritmo(guia, estilo: str) -> None:
    """Un estilo no puede pedir un ritmo que su propia configuracion impide.

    `cinematic` pedia de 3 a 11 cortes por minuto con el recorte de silencios
    apagado, que es lo unico que produce cortes: no podia cumplirlo nunca.

    Los estilos pensados para material de montaje rapido (`gaming-hype` pide de
    18 a 48 cortes por minuto, `vlog` de 8 a 30) si se quedan cortos sobre una
    guia hablada, y eso **no es un fallo**: es que ese estilo no le va a este
    material, y el medidor lo dice. Lo que se comprueba aqui es que el estilo
    llegue al **minimo de su banda o al de un estilo pausado**, lo que sea menor.
    """
    edl = build_edl(guia, estilo)
    banda = load_style(estilo).band("cuts_per_minute")
    assert banda is not None, estilo
    cortes = len(edl.cut_points()) / (edl.duration / 60)
    assert cortes >= min(banda.lo, 3.0), (
        f"{estilo} da {cortes:.1f} cortes/min y su banda empieza en {banda.lo}"
    )


@pytest.mark.parametrize("estilo", list_styles())
def test_cada_estilo_monta_una_guia_larga_con_puntero(estilo: str) -> None:
    """La guia de un minuto no llega a poner rotulos de seccion, y ahi petaba.

    Los rotulos piden capitulos de 90 segundos y al menos dos, asi que solo
    aparecen en formato largo --- que es el caso de uso real. Sin una prueba que
    monte veinte minutos **con el puntero puesto**, el unico camino que llama a
    `ScreenUse.busy` con un `CursorTrack` de verdad no lo recorria nadie.

    Va sobre el analisis sintetico, que no necesita video: cuesta milisegundos.
    """
    from forge.analysis.cursor import CursorSample, CursorTrack
    from forge.fixtures import synthetic_guide_analysis

    analisis = synthetic_guide_analysis(duration=1200.0)
    analisis.cursor = CursorTrack(rate=2.0, samples=[
        CursorSample(at=i / 2, x=0.2 + (i % 40) / 100, y=0.3 + (i % 25) / 100)
        for i in range(2400)
    ])

    edl = build_edl(analisis, estilo)
    assert edl.timeline, estilo
    assert edl.duration > 0, estilo


# -- y que el medidor no bendiga lo que no ha pasado -------------------------


def test_un_montaje_sin_un_solo_corte_no_esta_en_el_punto(guia) -> None:
    """La media tapaba un cero. Ahora una carencia manda sobre la media."""
    edl = build_edl(guia, "tutorial")
    # Se le quita el montaje: un unico clip con el video entero.
    plano = edl.model_copy(deep=True)
    plano.timeline = plano.timeline[:1]
    plano.timeline[0].source_start = 0.0
    plano.timeline[0].source_end = guia.duration

    reporte = evaluate(plano, guia)
    assert reporte.shortfalls, "cero cortes tiene que salir como carencia"
    assert "cuts_per_minute" in [r.name for r in reporte.shortfalls]
    assert reporte.verdict == "sub-editado"
    assert reporte.is_under_edited
    assert not reporte.in_the_pocket


def test_el_medidor_dice_que_falta_y_no_solo_una_nota(guia) -> None:
    """Una carencia tiene nombre: sirve para arreglarla."""
    edl = build_edl(guia, "gaming-hype")
    reporte = evaluate(edl, guia)
    for r in reporte.shortfalls:
        assert r.counts, "una metrica que no vota no puede ser una carencia"
        assert r.status == "bajo"
        assert r.value < r.band.lo


def test_un_estilo_no_paga_por_apagar_una_herramienta(guia) -> None:
    """`cinematic` no quiere subtitulos, y le puntuaban la velocidad de lectura.

    Salia a 0 palabras por minuto contra una banda de [70, 180] y le hundia la
    nota por hacer justo lo que su estilo dice.
    """
    assert not load_style("cinematic").captions.enabled

    edl = build_edl(guia, "cinematic")
    reporte = evaluate(edl, guia)
    lectura = next(r for r in reporte.readings if r.name == "caption_wpm")
    assert not lectura.counts, "no puede votar una metrica de algo que esta apagado"
    assert "caption_wpm" not in [r.name for r in reporte.shortfalls]


# -- el fichero que traes tu -------------------------------------------------


def test_avisa_cuando_el_fichero_trae_dos_pistas_de_audio(
    tmp_path, settings: Settings
) -> None:
    """Una captura de juego suele traer el juego y el microfono por separado.

    Todo el pipeline usa **una sola** pista --- la primera que elige ffmpeg ---
    y la otra se pierde. Medido sobre un fichero con el juego delante y la voz
    detras: cero silencios encontrados (el juego suena todo el rato), cero
    recorte, y la voz sin llegar ni al analisis ni al video exportado. Sin un
    solo error por ningun lado.

    Mezclar las pistas esta pendiente; lo que se fija aqui es que **deje de ser
    invisible**.
    """
    import subprocess

    from forge.analysis.pipeline import analyze
    from forge.tools import ffmpeg_bin

    video = tmp_path / "dos-pistas.mp4"
    subprocess.run(
        [str(ffmpeg_bin(settings)), "-y", "-hide_banner", "-loglevel", "error",
         "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=24:duration=6",
         "-f", "lavfi", "-i", "anoisesrc=d=6:c=pink:a=0.25",
         "-f", "lavfi", "-i", "sine=frequency=200:duration=6",
         "-map", "0:v", "-map", "1:a", "-map", "2:a",
         "-c:v", "libx264", "-preset", "ultrafast", "-crf", "30",
         "-pix_fmt", "yuv420p", "-c:a", "aac", str(video)],
        check=True, capture_output=True,
    )

    analisis, avisos = analyze(video, settings, force={"all"}, skip_speech=True)

    assert len(analisis.media.audio_streams) == 2, "el sondeo tiene que verlas"
    assert any("pistas de audio" in a for a in avisos), avisos


def test_un_fichero_normal_no_avisa_de_nada(sample_video, settings: Settings) -> None:
    """Y con una sola pista no se dice nada, que es lo normal."""
    from forge.analysis.pipeline import analyze

    analisis, avisos = analyze(sample_video, settings, skip_speech=True)
    assert len(analisis.media.audio_streams) <= 1
    assert not any("pistas de audio" in a for a in avisos), avisos
