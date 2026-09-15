"""Tests de lo que se saca de lo que dices, momento a momento.

`segments.py` lee la **estructura** (que parte del video es cada tramo). Esto
lee los **momentos sueltos** en los que lo que dices pide una decision concreta:

- **senalas** ("mira aqui", "este boton de arriba a la derecha"). Y a veces
  dices *donde*, que es mejor informacion que cualquier mapa de saliencia: la
  saliencia sabe donde hay contraste, tu sabes donde hay que mirar.
- **enfatizas**, por las palabras y por el nivel de voz.
- **te corriges** ("no, perdon"), que marca la toma anterior como fallida.
"""

from __future__ import annotations

import pytest

from forge.analysis.types import (
    Analysis,
    AudioAnalysis,
    Transcript,
    TranscriptSegment,
    Word,
)
from forge.media import MediaInfo, VideoStream
from forge.plan.styles import load_style
from forge.understand.speech_cues import (
    EMPHASIS_DB,
    CueKind,
    find_all,
    find_emphasis,
    find_pointing,
    find_retakes,
)


def _frase(inicio: float, texto: str) -> TranscriptSegment:
    palabras, t = [], inicio
    for p in texto.split():
        palabras.append(Word(start=round(t, 3), end=round(t + 0.28, 3), text=p))
        t += 0.34
    return TranscriptSegment(start=inicio, end=round(t, 3), text=texto, words=palabras)


def _transcript(*frases: tuple[float, str]) -> Transcript:
    return Transcript(language="es", segments=[_frase(i, t) for i, t in frases])


# -- senalar ---------------------------------------------------------------


def test_reconoce_que_estas_senalando() -> None:
    cues = find_pointing(_transcript((0.0, "mira aqui como cambia el valor")))
    assert cues and cues[0].kind is CueKind.POINT


@pytest.mark.parametrize(
    "frase,esperado",
    [
        ("pulsa este boton de la izquierda del todo", (0.22, 0.5)),
        ("lo tienes arriba a la derecha de la pantalla", (0.78, 0.25)),
        ("fijate en esta casilla de abajo", (0.5, 0.75)),
        ("mira este menu de aqui arriba", (0.5, 0.25)),
    ],
)
def test_saca_de_lo_que_dices_a_que_zona_apuntar(frase: str, esperado) -> None:
    """Es lo que ningun analisis de imagen puede saber: lo dices tu."""
    cues = [c for c in find_pointing(_transcript((0.0, frase))) if c.region]
    assert cues, f"no saco la zona de: {frase}"
    assert cues[0].region == pytest.approx(esperado, abs=0.01)


def test_senalar_sin_decir_donde_sigue_valiendo_pero_menos() -> None:
    con = find_pointing(_transcript((0.0, "mira este boton de la derecha")))
    sin = find_pointing(_transcript((0.0, "mira esto que pasa ahora")))
    assert con[0].strength > sin[0].strength


def test_una_zona_a_medias_no_se_inventa_la_otra_mitad() -> None:
    """"a la derecha" no dice nada de la altura: se queda en el centro."""
    cues = [c for c in find_pointing(_transcript((0.0, "esta opcion de la derecha"))) if c.region]
    assert cues[0].region[1] == pytest.approx(0.5)


# -- enfasis ---------------------------------------------------------------


def test_reconoce_el_enfasis_por_las_palabras() -> None:
    cues = find_emphasis(_transcript((0.0, "esto es muy importante para que funcione")))
    assert any(c.kind is CueKind.EMPHASIS for c in cues)


def _audio_con_pico(en: float, subida_db: float) -> AudioAnalysis:
    """Curva de nivel plana con una palabra mas alta en un punto."""
    ritmo = 25.0
    curva = [-20.0] * int(30 * ritmo)
    for i in range(int(en * ritmo), int((en + 0.3) * ritmo)):
        curva[i] = -20.0 + subida_db
    return AudioAnalysis(
        silences=[], silence_threshold_db=-40.0,
        envelope=curva, envelope_rate=ritmo,
    )


def test_reconoce_el_enfasis_por_el_nivel_de_voz() -> None:
    """Prosodia de verdad, medida, no adivinada por las palabras."""
    tr = _transcript((0.0, "cambiamos el valor cuarenta a sesenta y listo"))
    palabra = tr.words[3]
    audio = _audio_con_pico(palabra.start, EMPHASIS_DB + 3)

    por_nivel = [c for c in find_emphasis(tr, audio) if not c.phrase]
    assert por_nivel, "no vio una palabra 6 dB por encima del resto"
    assert por_nivel[0].start == pytest.approx(palabra.start, abs=0.3)


def test_una_variacion_normal_no_es_enfasis() -> None:
    tr = _transcript((0.0, "cambiamos el valor cuarenta a sesenta y listo"))
    audio = _audio_con_pico(tr.words[3].start, EMPHASIS_DB - 1.5)
    assert [c for c in find_emphasis(tr, audio) if not c.phrase] == []


def test_sin_curva_de_nivel_no_se_adivina_la_prosodia() -> None:
    tr = _transcript((0.0, "cambiamos el valor cuarenta a sesenta"))
    assert [c for c in find_emphasis(tr, None) if not c.phrase] == []


def test_la_referencia_del_enfasis_es_local() -> None:
    """Quien baja la voz en una frase sigue acentuando dentro de ella.

    Medido sobre la guia de prueba: la palabra que el guion acentua 6 dB quedaba
    a +2,2 dB de la mediana **global** porque esa frase iba baja entera, y no se
    detectaba. Contra la mediana local vuelve a estar a +6.
    """
    ritmo = 25.0
    curva = [-14.0] * int(30 * ritmo)
    # Un tramo entero mas bajo, con un acento dentro.
    for i in range(int(10 * ritmo), int(16 * ritmo)):
        curva[i] = -24.0
    for i in range(int(12 * ritmo), int(12.3 * ritmo)):
        curva[i] = -24.0 + EMPHASIS_DB + 2
    audio = AudioAnalysis(silences=[], silence_threshold_db=-40.0,
                          envelope=curva, envelope_rate=ritmo)

    global_ = audio.speech_level()
    local = audio.speech_level(around=12.0)
    assert local < global_ - 5, "la referencia local no siguio al tramo bajo"
    assert audio.level_between(12.0, 12.3) - local >= EMPHASIS_DB


# -- correcciones ----------------------------------------------------------


@pytest.mark.parametrize(
    "correccion",
    ["no perdon es el verde", "mejor dicho el de arriba",
     "perdona me he liado otra vez", "a ver no que no era ese"],
)
def test_reconoce_que_te_estas_corrigiendo(correccion: str) -> None:
    cues = find_retakes(_transcript((0.0, "pulsamos el boton azul"), (5.0, correccion)))
    assert cues and cues[0].kind is CueKind.RETAKE


def test_lo_que_se_quita_es_lo_de_ANTES() -> None:
    """Cuando dices "no, perdon", lo que sobra es lo que acabas de decir."""
    tr = _transcript((0.0, "pulsamos el boton azul de arriba"), (5.0, "no perdon es el verde"))
    c = find_retakes(tr)[0]
    assert c.end <= 5.0, "se esta quitando la correccion en vez de la toma mala"
    assert c.start >= 0.0


def test_no_se_lleva_por_delante_medio_video() -> None:
    """Lo que sobra es una frase fallida, no un parrafo."""
    tr = Transcript(language="es", segments=[
        TranscriptSegment(start=0.0, end=40.0, text="una parrafada muy larga",
                          words=[Word(start=0.0, end=40.0, text="larga")]),
        _frase(41.0, "no perdon me he liado"),
    ])
    c = find_retakes(tr)[0]
    assert c.end - c.start <= 4.0, f"se retira {c.end - c.start:.1f}s"


def test_sin_permiso_para_quitar_palabras_no_se_quita_nada() -> None:
    """Las tomas fallidas van con el mismo permiso que las muletillas."""
    from forge.plan.select import plan_selection

    tr = _transcript((1.0, "pulsamos el boton azul"), (6.0, "no perdon es el verde"))
    a = Analysis(
        media=MediaInfo(path="x.mp4", size_bytes=1, duration=12.0,
                        video=VideoStream(index=0, codec="h264", width=1280,
                                          height=720, fps=30.0), has_audio=True),
        audio=AudioAnalysis(silences=[]),
        transcript=tr,
    )
    a.cues = find_all(tr)
    reglas = load_style("tutorial").pacing

    assert "toma fallida" in plan_selection(a, reglas, []).reasons()
    sin = reglas.model_copy(update={"remove_fillers": False})
    assert "toma fallida" not in plan_selection(a, sin, []).reasons()


def test_la_toma_fallida_no_se_protege_a_si_misma() -> None:
    """Las palabras dichas estan protegidas; estas no, o el recorte se anula.

    Se marcaba para quitar y acto seguido se devolvia entera por ser
    "contenido", asi que no se quitaba nada y no lo delataba ningun error.
    """
    from forge.plan.select import plan_selection

    tr = _transcript((1.0, "pulsamos el boton azul de la parte de arriba"),
                     (6.0, "no perdon es el verde"))
    a = Analysis(
        media=MediaInfo(path="x.mp4", size_bytes=1, duration=12.0,
                        video=VideoStream(index=0, codec="h264", width=1280,
                                          height=720, fps=30.0), has_audio=True),
        audio=AudioAnalysis(silences=[]),
        transcript=tr,
    )
    a.cues = find_all(tr)
    quitado = plan_selection(a, load_style("tutorial").pacing, []).reasons()
    assert quitado.get("toma fallida", 0) > 1.0, quitado


# -- y que cambie el montaje ----------------------------------------------


def test_el_zoom_apunta_donde_dices() -> None:
    from forge.plan.edl import EDL, Clip, RenderSpec
    from forge.plan.emphasis import _pointed_candidates

    tr = _transcript((1.0, "pulsa este boton de arriba a la derecha del todo"))
    a = Analysis(
        media=MediaInfo(path="x.mp4", size_bytes=1, duration=20.0,
                        video=VideoStream(index=0, codec="h264", width=1280,
                                          height=720, fps=30.0), has_audio=True),
        transcript=tr,
    )
    a.cues = find_all(tr)
    edl = EDL(source="x.mp4", source_duration=20.0,
              render=RenderSpec(width=1280, height=720, fps=30),
              timeline=[Clip(id="c0", source_start=0.0, source_end=20.0)])

    candidatos = _pointed_candidates(edl, a, load_style("tutorial").emphasis)
    assert candidatos, "no coloco ningun zoom por lo que se dice"
    _score, _t, cx, cy = candidatos[0]
    assert cx > 0.6 and cy < 0.4, f"apunto a ({cx:.2f}, {cy:.2f}) diciendo 'arriba a la derecha'"


def test_sin_senales_el_montaje_no_cambia() -> None:
    """La garantia de que esto no puede empeorar un video que no entiende."""
    from forge.plan.emphasis import _cue_boost

    assert _cue_boost([], 5.0) == 1.0


def test_cada_senal_se_explica() -> None:
    cues = find_all(_transcript(
        (0.0, "mira este boton de la derecha"),
        (5.0, "no perdon era el otro"),
    ))
    assert cues
    for c in cues:
        assert c.rationale and (c.phrase in c.rationale or "mas alto" in c.rationale)


# -- cuando narras tu propio montaje ---------------------------------------


def _analisis_con(tr: Transcript, duracion: float, silencios=()) -> Analysis:
    from forge.analysis.types import SilenceRange

    a = Analysis(
        media=MediaInfo(path="x.mp4", size_bytes=1, duration=duracion,
                        video=VideoStream(index=0, codec="h264", width=1280,
                                          height=720, fps=30.0), has_audio=True),
        audio=AudioAnalysis(
            duration=duracion,
            silences=[SilenceRange(start=a_, end=b_) for a_, b_ in silencios],
        ),
        transcript=tr,
    )
    a.cues = find_all(tr)
    return a


@pytest.mark.parametrize(
    "aviso",
    ["esto tarda un rato", "mientras carga vamos viendo",
     "esperamos a que termine", "esto va bastante lento"],
)
def test_reconoce_que_avisas_de_una_espera(aviso: str) -> None:
    from forge.understand.speech_cues import find_waits

    assert find_waits(_transcript((0.0, aviso)))


def test_una_espera_anunciada_se_acelera_en_vez_de_cortarse() -> None:
    """Cortarla es lo facil y es peor: quien mira quiere **ver** que paso.

    Ademas resucita `Clip.speed`, que el renderer soportaba desde el principio
    (setpts + rubberband, con tests) y que ningun sitio del planner usaba.
    """
    from forge.plan.planner import build_edl

    tr = _transcript((1.0, "le damos a instalar y esto tarda un rato"),
                     (35.0, "ya esta listo asi que seguimos"))
    edl = build_edl(_analisis_con(tr, 40.0, [(4.5, 34.5)]), "tutorial")

    acelerados = [c for c in edl.timeline if c.speed > 1.0]
    assert acelerados, "la espera se corto en vez de acelerarse"
    c = acelerados[0]
    assert c.source_start == pytest.approx(4.5, abs=0.5)
    assert c.duration < 6.0, f"acelerada sigue durando {c.duration:.1f}s"
    # Y sigue estando: es lo que la diferencia de cortarla.
    assert c.source_duration > 20.0


def test_una_espera_muy_larga_se_acelera_mas() -> None:
    """Treinta segundos a 8x son cuatro; dos minutos a 8x son quince."""
    from forge.plan.planner import build_edl

    tr = _transcript((1.0, "esto tarda un rato"), (130.0, "ya esta"))
    edl = build_edl(_analisis_con(tr, 135.0, [(3.0, 129.0)]), "tutorial")
    c = next(c for c in edl.timeline if c.speed > 1.0)
    assert c.duration <= 4.5, f"{c.duration:.1f}s acelerada"
    assert c.speed > 8.0


def test_un_silencio_sin_avisar_se_corta_como_siempre() -> None:
    from forge.plan.planner import build_edl

    tr = _transcript((1.0, "abrimos el menu de configuracion"), (35.0, "y seguimos"))
    edl = build_edl(_analisis_con(tr, 40.0, [(4.5, 34.5)]), "tutorial")
    assert all(c.speed == 1.0 for c in edl.timeline)


def test_solo_se_aceleran_silencios() -> None:
    """Acelerar tu voz ocho veces seria ininteligible.

    Sale gratis por construccion: la espera se busca entre los **silencios**
    detectados, asi que nunca puede caer sobre algo que estas diciendo.
    """
    from forge.plan.select import _announced_waits

    tr = _transcript((1.0, "esto tarda un rato"), (6.0, "pero sigo hablando aqui"))
    a = _analisis_con(tr, 20.0, [])   # sin silencios
    assert _announced_waits(a, load_style("tutorial").pacing) == []


@pytest.mark.parametrize(
    "salto",
    ["esto os lo salto", "no hace falta que veais esto",
     "me salto esta parte", "os ahorro esto"],
)
def test_reconoce_que_dices_que_algo_sobra(salto: str) -> None:
    from forge.understand.speech_cues import find_skips

    assert find_skips(_transcript((0.0, salto)))


def test_lo_que_dices_que_sobra_se_quita() -> None:
    from forge.plan.select import plan_selection

    tr = _transcript((1.0, "ahora copiamos los ficheros pero esto os lo salto"),
                     (40.0, "y con esto ya lo tenemos"))
    a = _analisis_con(tr, 46.0)
    quitado = plan_selection(a, load_style("tutorial").pacing, []).reasons()
    assert quitado.get("te lo saltas", 0) > 5.0, quitado


def test_saltarse_algo_no_se_lleva_medio_video() -> None:
    """Si no vuelves a hablar en mucho rato, eso es una espera, no un salto."""
    from forge.plan.select import SKIP_MAX_SECONDS, _skip_removals

    tr = _transcript((1.0, "esto os lo salto"))
    a = _analisis_con(tr, 600.0)
    quitados = _skip_removals(a, load_style("tutorial").pacing)
    assert quitados and quitados[0].duration <= SKIP_MAX_SECONDS + 0.1


def test_sin_permiso_no_se_salta_nada() -> None:
    from forge.plan.select import plan_selection

    tr = _transcript((1.0, "esto os lo salto"), (40.0, "y ya esta"))
    a = _analisis_con(tr, 46.0)
    reglas = load_style("tutorial").pacing.model_copy(update={"remove_fillers": False})
    assert "te lo saltas" not in plan_selection(a, reglas, []).reasons()


def test_el_montaje_explica_las_esperas() -> None:
    from forge.plan.planner import build_edl

    tr = _transcript((1.0, "esto tarda un rato"), (35.0, "ya esta"))
    edl = build_edl(_analisis_con(tr, 40.0, [(4.5, 34.5)]), "tutorial")
    assert any("espera" in n for n in edl.notes), edl.notes
    assert any("espera" in c.reason for c in edl.timeline if c.speed > 1.0)
