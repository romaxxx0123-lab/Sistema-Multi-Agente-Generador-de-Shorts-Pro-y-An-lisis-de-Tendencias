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
