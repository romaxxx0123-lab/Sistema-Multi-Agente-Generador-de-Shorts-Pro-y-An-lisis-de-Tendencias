"""El examen: una guia de pantalla entera, con la verdad apuntada.

Hasta aqui cada pieza del analisis se probaba por su cuenta con un banco de
pruebas hecho a su medida, y eso esconde justo lo que mas importa: si el
conjunto **acierta sobre un video que no se hizo para el**.

`forge/screenguide.py` genera una guia de 130 segundos con la estructura de una
de verdad -- tres temas, cosas que aparecen y desaparecen, una espera larga
anunciada, un aviso, muletillas -- y **apunta la verdad**: en que segundo pasa
cada cosa y en que parte de la pantalla. Aqui se compara lo que hay con lo que
el analisis encuentra.

Tres fallos salieron de este examen, y los tres estaban en sitios donde las
pruebas a medida decian que todo iba bien:

1. El detector de sucesos solo miraba en los **cortes de plano**, y el panel de
   la impresora del segundo 31 cambia el **0.78%** del cuadro: demasiado poco
   para que haya corte. Un suceso de manual, invisible. Ahora se barre el video
   entero (5/5 sucesos, 1.2s de calculo para 130s de video).
2. Los refuerzos multiplicaban el valor de los candidatos a zoom **sin techo**,
   y un candidato colocado por contraste llegaba a **1.559** mientras el
   colocado sobre lo que acababa de aparecer valia 1.41. Ganaba el que no sabia
   a donde miraba. Ahora cada tipo tiene su techo.
3. Dos de las catorce frases del guion pedian un corte que nadie habia
   anunciado, por dos homografos: "la contrasena es **corta**" y "la impresora
   esta **lista**". Una de las dos era el **aviso** de la guia.
"""

from __future__ import annotations

import math

import pytest

from forge.analysis.changes import change_near
from forge.analysis.pipeline import analyze
from forge.analysis.ocr import ocr_available
from forge.config import Settings
from forge.plan.edl import EffectKind
from forge.plan.planner import build_edl
from forge.screenguide import make_screen_guide, transcript_of
from forge.understand.segments import detect_segments
from forge.understand.speech_cues import find_all


@pytest.fixture(scope="module")
def guia(tmp_path_factory, settings: Settings):
    d = tmp_path_factory.mktemp("guia")
    return make_screen_guide(d / "guia.mp4", settings)


@pytest.fixture(scope="module")
def analisis(guia, settings: Settings):
    """El analisis de la guia, con su transcripcion puesta a mano.

    La transcripcion se inyecta porque aqui no hay pesos de whisper -- el audio
    es un tono, no voz -- pero todo lo demas (imagen, niveles, texto en
    pantalla, sucesos) sale del video de verdad.
    """
    a, _ = analyze(guia.path, settings, skip_speech=True)
    a.transcript = transcript_of(guia)
    a.narrative = detect_segments(a.transcript, a.duration)
    a.cues = find_all(a.transcript, a.audio, None, a.screen_text, a.cursor)
    return a


# -- lo que el analisis ve --------------------------------------------------


def test_encuentra_los_cinco_sucesos_y_donde(analisis, guia) -> None:
    """Los cinco, incluido el que ningun corte de plano marca."""
    fallos = []
    for suceso in guia.events:
        cambio = change_near(analisis.changes, suceso.at, window=2.5)
        if cambio is None:
            fallos.append((suceso.name, "no lo ve"))
            continue
        error = math.hypot(cambio.cx - suceso.cx, cambio.cy - suceso.cy)
        if error > 0.12:
            fallos.append((suceso.name, round(error, 3)))
    assert not fallos, fallos


def test_no_se_inventa_sucesos(analisis, guia) -> None:
    """Barrer el video entero podria traer basura. No la trae."""
    inventados = [
        round(c.at, 1)
        for c in analisis.changes
        if not any(abs(c.at - e.at) <= 2.5 for e in guia.events)
    ]
    assert inventados == [], inventados


def test_el_panel_de_la_impresora_no_es_un_corte_de_plano(analisis) -> None:
    """La prueba de que el barrido hacia falta.

    El suceso del segundo 31 se ve perfectamente -- un panel se sustituye por
    otro -- pero cambia tan poca imagen que el detector de planos no lo llama
    corte. Con la version que solo miraba en los cortes, este suceso no existia.
    """
    cortes = [s.start for s in analisis.shots]
    assert not any(abs(c - 31.0) < 1.5 for c in cortes), cortes
    assert change_near(analisis.changes, 31.0, window=2.5) is not None


def test_encuentra_la_espera_anunciada(analisis, guia) -> None:
    """44 segundos callado en medio de la guia: lo mas recortable que hay."""
    assert analisis.audio is not None
    inicio, fin = guia.wait
    largos = [s for s in analisis.audio.silences if s.end - s.start > 20.0]
    assert largos, [(round(s.start), round(s.end)) for s in analisis.audio.silences]
    espera = max(largos, key=lambda s: s.end - s.start)
    assert abs(espera.start - inicio) < 3.0, espera
    assert abs(espera.end - fin) < 3.0, espera


@pytest.mark.skipif(not ocr_available(), reason="no hay motor de OCR instalado")
def test_lee_la_interfaz(analisis) -> None:
    leidas = {p.lower() for linea in analisis.screen_text for p in linea.words}
    esperadas = (
        "router", "contrasena", "guardar", "cambios",
        "impresora", "bandeja", "firewall", "puerto",
    )
    faltan = [p for p in esperadas if p not in leidas]
    assert not faltan, (faltan, sorted(leidas))


def test_entiende_lo_que_se_dice(analisis) -> None:
    from forge.understand.speech_cues import CueKind

    tipos = {c.kind for c in analisis.cues}
    assert CueKind.POINT in tipos, [c.phrase for c in analisis.cues]
    assert CueKind.WAIT in tipos, "no vio la espera anunciada"
    assert CueKind.RECALL in tipos, "no vio el 'como vimos antes'"
    # En esta guia nadie anuncia ningun corte. Los dos SKIP que salian eran los
    # homografos ("corta", "lista") y no debe quedar ninguno.
    assert CueKind.SKIP not in tipos, [c.phrase for c in analisis.cues]
    papeles = {s.role.value for s in analisis.narrative}
    assert "aviso" in papeles, papeles


def test_no_pide_cortar_el_aviso(analisis) -> None:
    """El tercer fallo del examen, y el mas caro de los tres.

    De las catorce frases del guion, dos se marcaban como "aqui se corta" y
    ninguna lo pedia: "si la contrasena es **corta** no protege nada" y "ya esta
    la impresora **lista**". Raices de "cortar" y de "listo" sobre palabras que
    ahi son adjetivos. La primera es el **aviso** de la guia --- la linea mas
    importante del video --- y el montaje tenia permiso para tirarla.
    """
    from forge.understand.speech_cues import CueKind

    saltos = [c for c in analisis.cues if c.kind is CueKind.SKIP]
    for cue in saltos:
        assert not (16.0 < cue.start < 24.0), f"quiere cortar el aviso: {cue}"
        assert not (95.0 < cue.start < 102.0), f"corte inventado: {cue}"


# -- y que hace el montaje con ello -----------------------------------------


def test_la_espera_anunciada_deja_de_ocupar_el_video(analisis, guia) -> None:
    """44 segundos de espera que acaban ocupando menos de cinco.

    No se cortan del todo a proposito: **la anunciaste** ("esto tarda un buen
    rato asi que espera"), asi que cortarla dejaria la frase sin sentido. Se
    acelera y se marca. Lo que se mide aqui es lo unico que importa al que
    mira: cuanto ocupa en el video final.
    """
    edl = build_edl(analisis, "tutorial")
    assert edl.duration < guia.duration * 0.75, edl.duration

    inicio, fin = guia.wait
    ocupa = sum(
        max(0.0, min(c.source_end, fin) - max(c.source_start, inicio)) / max(c.speed, 1e-6)
        for c in edl.timeline
    )
    # Medido: 44s de espera acaban ocupando 5.2s, un 12% de lo que duraba.
    assert ocupa < (fin - inicio) * 0.20, f"la espera ocupa {ocupa:.1f}s del montaje"
    assert any("espera" in n for n in edl.notes), edl.notes


def test_el_zoom_va_a_lo_que_sabe_y_no_a_lo_que_contrasta(analisis) -> None:
    """El segundo fallo del examen, en su sitio.

    Los refuerzos multiplican, y multiplicar un candidato **ciego** -- colocado
    donde hay mas contraste -- lo ponia por encima de uno **informado**. Medido
    en esta misma guia: 1.559 el ciego contra 1.41 el que sabia que ahi acababa
    de aparecer algo.
    """
    edl = build_edl(analisis, "tutorial")
    zooms = [e for e in edl.effects if e.kind is EffectKind.PUNCH_IN]
    assert zooms, "el estilo tutorial pone alguno"
    for zoom in zooms:
        assert (
            "acaba de aparecer" in zoom.rationale
            or "senalas" in zoom.rationale
            or "dices" in zoom.rationale
        ), zoom.rationale


def test_el_orden_de_las_senales_no_lo_rompe_ningun_refuerzo() -> None:
    """Lo que dices > lo que pasa en pantalla > donde hay contraste."""
    from forge.plan.emphasis import (
        CEILING_APPEARED,
        CEILING_POINTED,
        CEILING_SALIENCY,
    )

    assert CEILING_POINTED > CEILING_APPEARED > CEILING_SALIENCY


def test_el_montaje_explica_cada_decision(analisis) -> None:
    edl = build_edl(analisis, "tutorial")
    for efecto in edl.effects:
        assert efecto.rationale, efecto
