"""Tests con material que se parece al real, no a un patron de test.

El fixture de barras de color sirve para probar mecanica, pero esconde dos
problemas que solo aparecen con material de verdad:

- tiene **silencio digital perfecto**, que no existe en ninguna grabacion. Con
  ruido de sala, `silencedetect` de ffmpeg no encuentra un solo silencio, porque
  mide picos y el ruido gaussiano los tiene 12 dB por encima de su RMS.
- tiene **cambios de escena brutales**. Una grabacion de pantalla pasa de una
  interfaz oscura a otra igual de oscura, con uno a tres niveles de gris de
  diferencia, y PySceneDetect no ve nada ni bajando su umbral a 3.

Los dos fallos dejaban el sistema inutil en el caso de uso principal (guias de
formato largo) sin que ningun test se quejara.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from forge.analysis.audio import (
    analyze_audio,
    choose_threshold_db,
    find_silences,
    read_window_levels,
)
from forge.analysis.pipeline import analyze
from forge.analysis.speech import find_fillers
from forge.analysis.types import Transcript, TranscriptSegment, Word
from forge.config import Settings
from forge.demo import build_demo_video, build_timing, demo_transcript
from forge.plan.captions import hard_cuts, reading_speed_wpm
from forge.plan.edl import EffectKind
from forge.plan.planner import build_edl
from forge.saturation.score import evaluate


@pytest.fixture(scope="module")
def guia(tmp_path_factory: pytest.TempPathFactory, settings: Settings):
    """Una guia falsa pero realista: grabacion de pantalla y habla con pausas."""
    out = tmp_path_factory.mktemp("demo") / "guia.mp4"
    video, timing = build_demo_video(out, settings)
    return video, timing


@pytest.fixture(scope="module")
def analisis(guia, settings: Settings):
    video, timing = guia
    resultado, _ = analyze(video, settings, force={"all"}, skip_speech=True)
    resultado.transcript = demo_transcript(timing)
    return resultado, timing


# -- silencios sobre ruido de sala real ------------------------------------


def test_el_umbral_se_deduce_del_propio_audio(analisis, settings: Settings) -> None:
    from forge.cache import JobCache

    resultado, _ = analisis
    wav = JobCache(settings, resultado.media.path).artifact("audio_16k.wav")
    niveles, _ = read_window_levels(wav)
    umbral, suelo, voz = choose_threshold_db(niveles)

    assert voz - suelo > 15, "el material deberia separar claramente voz y fondo"
    assert suelo < umbral < voz, "el umbral tiene que caer entre los dos niveles"


def test_encuentra_las_pausas_reales_del_guion(analisis) -> None:
    resultado, timing = analisis
    largas = [
        round(fin, 1) for _ini, fin, beat in timing.phrases if beat.pause > 0.6
    ]
    detectados = [s.start for s in resultado.audio.silences]

    encontradas = [p for p in largas if any(abs(d - p) < 0.6 for d in detectados)]
    assert len(encontradas) == len(largas), (
        f"encontro {len(encontradas)} de {len(largas)} pausas"
    )


def test_un_umbral_fijo_de_pico_no_habria_servido(analisis, settings: Settings) -> None:
    """Deja constancia del motivo del cambio: con -32 dB de pico no hay nada."""
    from forge.cache import JobCache

    resultado, _ = analisis
    wav = JobCache(settings, resultado.media.path).artifact("audio_16k.wav")
    niveles, duracion = read_window_levels(wav)
    umbral_adaptado, suelo, _voz = choose_threshold_db(niveles)

    assert suelo < -32.0, "el fondo esta por debajo del umbral fijo clasico"
    assert umbral_adaptado != -32.0
    assert find_silences(niveles, 0.02, umbral_adaptado, 0.5, duracion)


def test_sin_separacion_clara_no_se_inventa_un_umbral() -> None:
    """Con ruido constante no hay dos poblaciones: mejor un umbral conservador."""
    import numpy as np

    plano = np.full(500, -25.0, dtype=np.float32)
    umbral, _suelo, _voz = choose_threshold_db(plano)
    assert umbral == -32.0


# -- planos en una grabacion de pantalla -----------------------------------


def test_detecta_los_cambios_de_pantalla(analisis) -> None:
    """Cambios de bajo contraste que PySceneDetect no ve por si solo."""
    resultado, timing = analisis

    esperados = []
    anterior = None
    for inicio, _fin, beat in timing.phrases:
        if anterior is not None and beat.screen != anterior:
            esperados.append(round(inicio, 2))
        anterior = beat.screen

    detectados = [s.start for s in resultado.shots[1:]]
    acertados = [e for e in esperados if any(abs(d - e) < 0.5 for d in detectados)]
    assert len(acertados) == len(esperados), (
        f"detecto {len(acertados)} de {len(esperados)} cambios: {detectados}"
    )


def test_cada_plano_tiene_su_propio_foco(analisis) -> None:
    """Con un unico plano, la saliencia se calcularia una vez para todo."""
    resultado, _ = analisis
    assert len(resultado.shots) > 1
    assert len(resultado.focus) == len(resultado.shots)


# -- muletillas que no son muletillas --------------------------------------


def _transcript(pares) -> Transcript:
    palabras = [Word(start=a, end=b, text=t) for a, b, t in pares]
    return Transcript(
        language="es",
        segments=[TranscriptSegment(start=0, end=99, text="x", words=palabras)],
    )


def test_este_como_demostrativo_no_se_quita() -> None:
    """Quitar el 'este' de 'en este video' deja 'en video'."""
    t = _transcript([(0, 0.3, "en"), (0.35, 0.7, "este"), (0.75, 1.2, "video")])
    assert find_fillers(t) == []


def test_este_como_vacilacion_si_se_quita() -> None:
    """La pausa que viene detras es lo que lo delata."""
    t = _transcript([(0, 0.3, "y"), (0.35, 0.7, "este"), (1.4, 1.9, "abrimos")])
    assert [w.text for w in find_fillers(t)] == ["este"]


def test_los_sonidos_inequivocos_se_quitan_siempre() -> None:
    t = _transcript([(0, 0.3, "y"), (0.35, 0.5, "eh"), (0.55, 1.0, "seguimos")])
    assert [w.text for w in find_fillers(t)] == ["eh"]


def test_bueno_pegado_a_la_frase_no_se_quita() -> None:
    t = _transcript([(0, 0.4, "bueno"), (0.45, 0.9, "seguimos")])
    assert find_fillers(t) == []


def test_en_la_guia_solo_se_quitan_las_muletillas_de_verdad(analisis) -> None:
    resultado, _ = analisis
    edl = build_edl(resultado, "tutorial")

    perdidas = [
        w.text for w in resultado.transcript.words
        if edl.source_to_timeline(w.start) is None
    ]
    assert perdidas, "deberia haber quitado alguna muletilla"
    assert all(p.lower() in ("eh", "em", "mmm", "ehm") for p in perdidas), (
        f"se comio palabras de verdad: {perdidas}"
    )


# -- subtitulos que se leen ------------------------------------------------


def test_un_corte_dentro_de_una_frase_es_blando() -> None:
    """Quitar una vacilacion en mitad de una frase no debe trocear el subtitulo.

    Se construye el caso a proposito en vez de esperar a que salga: con las
    muletillas ya bien filtradas casi todo lo que se recorta cae entre frases,
    asi que un video concreto puede no tener ningun corte blando y el mecanismo
    seguir siendo necesario.
    """
    from forge.plan.edl import EDL, Clip, RenderSpec

    # Una sola frase, con un trozo quitado en medio.
    palabras = [Word(start=t, end=t + 0.3, text=p)
                for t, p in ((0.0, "abrimos"), (0.4, "el"), (2.0, "menu"), (2.4, "lateral"))]
    transcript = Transcript(
        language="es",
        segments=[TranscriptSegment(start=0.0, end=2.7, text="abrimos el menu lateral",
                                     words=palabras)],
    )
    edl = EDL(
        source="a.mp4", source_duration=3.0,
        render=RenderSpec(width=1920, height=1080, fps=30),
        timeline=[
            Clip(id="c0", source_start=0.0, source_end=0.8),
            Clip(id="c1", source_start=1.9, source_end=3.0),
        ],
    )

    assert edl.cut_points(), "el montaje de prueba deberia tener un corte"
    assert hard_cuts(edl, transcript) == [], "el corte cae dentro de la frase: es blando"


def test_un_corte_entre_dos_frases_es_duro() -> None:
    from forge.plan.edl import EDL, Clip, RenderSpec

    primera = [Word(start=0.0, end=0.4, text="hola")]
    segunda = [Word(start=2.0, end=2.5, text="seguimos")]
    transcript = Transcript(
        language="es",
        segments=[
            TranscriptSegment(start=0.0, end=0.4, text="hola", words=primera),
            TranscriptSegment(start=2.0, end=2.5, text="seguimos", words=segunda),
        ],
    )
    edl = EDL(
        source="a.mp4", source_duration=3.0,
        render=RenderSpec(width=1920, height=1080, fps=30),
        timeline=[
            Clip(id="c0", source_start=0.0, source_end=0.6),
            Clip(id="c1", source_start=1.9, source_end=3.0),
        ],
    )

    assert hard_cuts(edl, transcript) == edl.cut_points()


def test_ninguna_linea_se_queda_en_una_palabra(analisis) -> None:
    resultado, _ = analisis
    edl = build_edl(resultado, "tutorial")
    lineas = edl.effects_of(EffectKind.CAPTION)

    sueltas = [c for c in lineas if len(c.words) < 2]
    assert not sueltas, f"lineas de una sola palabra: {[c.text for c in sueltas]}"


def test_ninguna_linea_acaba_en_preposicion(analisis) -> None:
    resultado, _ = analisis
    edl = build_edl(resultado, "tutorial")

    malas = [
        c.text for c in edl.effects_of(EffectKind.CAPTION)
        if c.words and c.words[-1].text.lower() in ("de", "el", "la", "en", "y", "que", "por")
    ]
    assert not malas, f"lineas cortadas en mal sitio: {malas}"


def test_los_subtitulos_se_leen_a_velocidad_humana(analisis) -> None:
    resultado, _ = analisis
    edl = build_edl(resultado, "tutorial")
    wpm = reading_speed_wpm(edl.effects_of(EffectKind.CAPTION))
    assert 60 < wpm < 250, f"{wpm:.0f} palabras por minuto no es legible"


# -- el montaje en conjunto ------------------------------------------------


def test_el_montaje_de_una_guia_es_sobrio(analisis) -> None:
    """El caso de uso principal no debe salir recargado."""
    resultado, _ = analisis
    edl = build_edl(resultado, "tutorial")
    reporte = evaluate(edl, resultado)

    assert reporte.in_the_pocket, f"{reporte.score}/100 {reporte.verdict}"
    assert not reporte.is_oversaturated


def test_recorta_tiempo_muerto_sin_pasarse(analisis) -> None:
    resultado, _ = analisis
    edl = build_edl(resultado, "tutorial")
    assert 0.08 < edl.compression < 0.35, f"recorto un {edl.compression:.0%}"


def test_el_ritmo_de_corte_es_razonable(analisis) -> None:
    resultado, _ = analisis
    edl = build_edl(resultado, "tutorial")
    ritmo = len(edl.cut_points()) / (edl.duration / 60)
    assert 3 < ritmo < 25, f"{ritmo:.1f} cortes por minuto"


def test_los_zooms_son_contados(analisis) -> None:
    """En una guia, un zoom cada pocos segundos marea."""
    resultado, _ = analisis
    edl = build_edl(resultado, "tutorial")
    zooms = edl.effects_of(EffectKind.PUNCH_IN)
    por_minuto = len(zooms) / (edl.duration / 60)
    assert por_minuto <= 4.0, f"{por_minuto:.1f} zooms por minuto es demasiado"
