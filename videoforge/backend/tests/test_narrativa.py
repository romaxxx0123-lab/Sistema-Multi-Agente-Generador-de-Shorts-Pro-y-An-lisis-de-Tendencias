"""Tests de lo que la app entiende del video a partir de lo que se dice.

Hasta aqui el montaje sabia donde respiras, no de que hablas: los capitulos
salian de las pausas y todo el video se editaba igual. Pero las partes de una
guia no valen lo mismo, ni para quien la hace ni para quien la ve: la intro se
la salta casi todo el mundo, un aviso es el momento que vienen a buscar, y una
digresion es justo lo que sobra.

Se detecta por las marcas del discurso, que en material explicativo son muy
fijas. Lo importante de estos tests no es que acierte siempre, sino que **falle
por el lado seguro**: sin marcas reconocibles no se inventa una estructura, y
el montaje se comporta exactamente como antes.
"""

from __future__ import annotations

import pytest

from forge.analysis.types import Transcript, TranscriptSegment, Word
from forge.plan.edl import EffectKind
from forge.plan.planner import build_edl
from forge.plan.styles import RoleRules, load_style
from forge.understand.segments import (
    SegmentRole,
    detect_segments,
    role_at,
    summarize,
)


def _transcript(frases: list[tuple[float, str]], paso: float = 3.0) -> Transcript:
    segmentos = []
    for inicio, texto in frases:
        palabras, t = [], inicio
        for p in texto.split():
            palabras.append(Word(start=round(t, 3), end=round(t + 0.25, 3), text=p))
            t += 0.3
        segmentos.append(
            TranscriptSegment(start=inicio, end=round(t, 3), text=texto, words=palabras)
        )
    return Transcript(language="es", segments=segmentos)


# -- lo que reconoce -------------------------------------------------------


@pytest.mark.parametrize(
    "frase,papel",
    [
        ("hola en este video vamos a configurar el panel", SegmentRole.INTRO),
        ("bienvenidos un dia mas al canal", SegmentRole.INTRO),
        ("lo primero es abrir la aplicacion", SegmentRole.STEP),
        ("ahora vamos con la segunda parte", SegmentRole.STEP),
        ("el tercer paso es guardar los cambios", SegmentRole.STEP),
        ("ojo con esto que es delicado", SegmentRole.WARNING),
        ("esto es lo importante sin esto no funciona", SegmentRole.WARNING),
        ("fijate bien en este boton", SegmentRole.WARNING),
        ("un truco que uso yo siempre", SegmentRole.TIP),
        ("te recomiendo dejarlo por defecto", SegmentRole.TIP),
        ("en resumen hemos configurado el panel", SegmentRole.RECAP),
        ("nos vemos en el siguiente video", SegmentRole.OUTRO),
        ("gracias por ver y suscribete", SegmentRole.OUTRO),
        ("por cierto esto no viene al caso", SegmentRole.ASIDE),
    ],
)
def test_reconoce_las_marcas_del_discurso(frase: str, papel: SegmentRole) -> None:
    # Se pone una frase neutra delante para que no mande la posicion.
    tr = _transcript([(0.0, "vamos moviendo cosas por la pantalla"), (10.0, frase)])
    segmentos = detect_segments(tr, 30.0)
    assert role_at(segmentos, 10.5) is papel, summarize(segmentos)


def test_los_acentos_no_importan() -> None:
    """El habla transcrita los pone mal la mitad de las veces."""
    frase = "atenci%s a este paso que es delicado y se falla mucho"
    con = detect_segments(_transcript([(0.0, "x"), (10.0, frase % "ón")]), 40.0)
    sin = detect_segments(_transcript([(0.0, "x"), (10.0, frase % "on")]), 40.0)
    assert role_at(con, 10.5) is role_at(sin, 10.5) is SegmentRole.WARNING


def test_un_aviso_corto_no_se_pierde() -> None:
    """"ojo!" dura medio segundo y es justo lo que no se puede perder.

    Los tramos cortos se absorben en el anterior para que la estructura no se
    trocee, y eso borraba del mapa las marcas mas contundentes, que suelen ser
    las mas breves.
    """
    tr = _transcript([
        (0.0, "vamos moviendo cosas por la pantalla tranquilamente"),
        (10.0, "ojo"),
        (12.0, "y seguimos con lo que estabamos viendo antes"),
    ])
    segmentos = detect_segments(tr, 30.0)
    assert SegmentRole.WARNING in {s.role for s in segmentos}, summarize(segmentos)


def test_un_demostrativo_no_es_un_resumen() -> None:
    """"activamos esta casilla" no es "y ya esta"; es el mismo error que 'este'."""
    segmentos = detect_segments(
        _transcript([(0.0, "x"), (10.0, "y activamos esta casilla de aqui")]), 30.0
    )
    assert role_at(segmentos, 10.5) is not SegmentRole.RECAP


def test_la_marca_tiene_que_abrir_la_frase() -> None:
    """Una marca de discurso en la palabra veinte ya no enlaza nada."""
    tarde = "estuvimos mirando la pantalla un rato largo hasta que por fin ahora si"
    segmentos = detect_segments(_transcript([(0.0, "x"), (10.0, tarde)]), 30.0)
    assert role_at(segmentos, 10.5) is not SegmentRole.STEP


# -- lo que NO se inventa --------------------------------------------------


def test_sin_transcripcion_no_hay_estructura() -> None:
    assert detect_segments(None, 60.0) == []


def test_sin_marcas_reconocibles_todo_es_cuerpo() -> None:
    """Un video donde nadie enlaza nada no tiene estructura que leer."""
    tr = _transcript([
        (0.0, "movemos el raton por la pantalla"),
        (10.0, "seguimos moviendo cosas de sitio"),
        (20.0, "cambiamos un par de valores mas"),
    ])
    papeles = {s.role for s in detect_segments(tr, 60.0)}
    # Solo los priores de posicion, que son deliberadamente debiles.
    assert papeles <= {SegmentRole.BODY, SegmentRole.INTRO, SegmentRole.OUTRO}


def test_cada_decision_se_explica() -> None:
    tr = _transcript([(0.0, "hola en este video"), (10.0, "ojo con esto")])
    for s in detect_segments(tr, 30.0):
        assert s.rationale, "un tramo sin explicacion no se puede revisar"
        if s.cue:
            assert s.cue in s.rationale


# -- los tramos cubren el video entero -------------------------------------


def test_los_tramos_no_dejan_huecos() -> None:
    """Las pausas caen entre frases, y es ahi donde el montaje decide recortar.

    Sin cubrir los huecos, la estructura se entendia bien y no servia de nada:
    toda pausa caia en tierra de nadie y se trataba como cuerpo.
    """
    tr = _transcript([(0.0, "hola en este video"), (10.0, "ahora vamos con esto"),
                      (20.0, "nos vemos en el siguiente")])
    segmentos = detect_segments(tr, 30.0)

    assert segmentos[0].start == 0.0
    assert segmentos[-1].end == pytest.approx(30.0)
    for anterior, siguiente in zip(segmentos, segmentos[1:]):
        assert anterior.end == siguiente.start, "hay un hueco entre dos tramos"


# -- y que cambie la edicion -----------------------------------------------


def _analisis_con_estructura():
    from forge.analysis.types import Analysis, AudioAnalysis, SilenceRange
    from forge.media import MediaInfo, VideoStream

    tr = _transcript([
        (1.0, "hola en este video vamos a configurar el panel de ajustes"),
        (12.0, "ahora vamos con la parte importante de la configuracion"),
        (24.0, "ojo con esto que si no lo haces no te va a funcionar nada"),
        (40.0, "nos vemos en el siguiente video hasta la proxima"),
    ])
    a = Analysis(
        media=MediaInfo(
            path="x.mp4", size_bytes=1000, duration=52.0,
            video=VideoStream(index=0, codec="h264", width=1280, height=720, fps=30.0),
            has_audio=True,
        ),
        audio=AudioAnalysis(duration=52.0, silences=[
            SilenceRange(start=9.0, end=12.0),    # tras la intro
            SilenceRange(start=21.0, end=24.0),   # tras el paso
            SilenceRange(start=33.0, end=36.0),   # dentro del aviso
            SilenceRange(start=48.0, end=52.0),   # tras el cierre
        ]),
        transcript=tr,
    )
    a.narrative = detect_segments(tr, 52.0)
    return a


def test_el_aviso_conserva_mas_aire_que_la_intro() -> None:
    """Es la idea entera: no se recorta igual lo que no vale lo mismo."""
    from forge.plan.select import plan_selection

    analisis = _analisis_con_estructura()
    reglas = load_style("tutorial").pacing

    seleccion = plan_selection(analisis, reglas, analisis.narrative)
    por_motivo = seleccion.reasons()

    quitado_intro = por_motivo.get("silencio en intro", 0.0)
    quitado_aviso = por_motivo.get("silencio en aviso", 0.0)
    assert quitado_intro > quitado_aviso, (
        f"intro {quitado_intro:.2f}s vs aviso {quitado_aviso:.2f}s: "
        "deberia apretar mas en la intro"
    )


def test_el_informe_dice_de_que_parte_sale_cada_recorte() -> None:
    """Con el desglose entre parentesis, no como entradas al mismo nivel.

    Iba todo suelto -- "173s de silencio, 77s de silencio en paso, 74s de
    silencio en aviso, 51s de silencio en intro" -- que son cuatro entradas
    para decir una cosa y encima la suma no cuadraba a ojo con el total.
    """
    analisis = _analisis_con_estructura()
    edl = build_edl(analisis, "tutorial")
    recortes = next(n for n in edl.notes if "Recortados" in n)

    assert "de silencio (" in recortes, recortes
    assert "intro" in recortes or "cierre" in recortes, recortes
    # Una sola entrada por tipo de recorte.
    assert recortes.count("de silencio") == 1, recortes


def test_la_estructura_entendida_se_cuenta() -> None:
    analisis = _analisis_con_estructura()
    edl = build_edl(analisis, "tutorial")
    assert any("Estructura entendida" in n for n in edl.notes), edl.notes


def test_sin_estructura_el_montaje_no_cambia() -> None:
    """La garantia de que esto no puede empeorar un video que no entiende."""
    from forge.plan.select import plan_selection

    analisis = _analisis_con_estructura()
    reglas = load_style("tutorial").pacing

    con = plan_selection(analisis, reglas, [])
    neutro = RoleRules(intro=1.0, step=1.0, warning=1.0, tip=1.0,
                       recap=1.0, outro=1.0, aside=1.0, body=1.0)
    sin = plan_selection(
        analisis, reglas.model_copy(update={"roles": neutro}), analisis.narrative
    )
    assert [(round(a, 2), round(b, 2)) for a, b in con.keeps] == [
        (round(a, 2), round(b, 2)) for a, b in sin.keeps
    ]


def test_el_zoom_prefiere_los_avisos() -> None:
    from forge.plan.emphasis import _narrative_boost

    analisis = _analisis_con_estructura()
    en_aviso = _narrative_boost(analisis.narrative, 28.0)
    en_intro = _narrative_boost(analisis.narrative, 3.0)
    assert en_aviso > 1.0 < 1 / en_intro, f"aviso {en_aviso}, intro {en_intro}"


def test_los_capitulos_siguen_lo_que_se_dice() -> None:
    """Decir "ahora vamos a" es mejor senal de cambio de tema que una pausa."""
    from forge.plan.chapters import _chapter_cuts_from_narrative

    analisis = _analisis_con_estructura()
    edl = build_edl(analisis, "tutorial")
    cortes = _chapter_cuts_from_narrative(edl, analisis.narrative, 5.0)
    assert cortes, "no encontro ningun cambio de parte"


# -- una intro pasa una vez, y al principio -------------------------------


def test_una_formula_de_intro_a_mitad_de_video_no_es_una_intro() -> None:
    """Medido en la guia de veinte minutos: salian 39 intros repartidas.

    Y no es cosmetico: cada una se editaba **como una intro**, o sea que se
    apretaba mas el recorte y los zooms valian menos justo ahi.
    """
    from forge.understand.segments import SegmentRole, _match

    frase = "vamos a ver como se configura esto"
    from forge.understand.segments import MIN_CONFIDENCE

    al_principio = _match(frase, 0.02)
    a_mitad = _match(frase, 0.55)

    assert al_principio is not None and al_principio[0] is SegmentRole.INTRO
    assert al_principio[1] >= MIN_CONFIDENCE
    # A mitad de video la misma frase se cree a medias, y con eso no llega a
    # papel: `detect_segments` la deja como cuerpo.
    assert a_mitad is None or a_mitad[1] < MIN_CONFIDENCE


def test_en_los_primeros_segundos_si_lo_es() -> None:
    from forge.understand.segments import SegmentRole, _match

    for frase in (
        "hoy vamos a configurar el servidor",
        "en este video os traigo una cosa",
        "antes de empezar una aclaracion",
    ):
        encaje = _match(frase, 0.01)
        assert encaje is not None and encaje[0] is SegmentRole.INTRO, frase


def test_el_resumen_de_estructura_cabe_en_una_linea() -> None:
    """Escribia un tramo por frase: 215 en una guia de veinte minutos."""
    from forge.understand.segments import NarrativeSegment, SegmentRole, summarize

    muchos = [
        NarrativeSegment(
            start=float(i) * 4, end=float(i) * 4 + 4,
            role=SegmentRole.STEP if i % 2 else SegmentRole.BODY, confidence=0.7,
        )
        for i in range(215)
    ]
    resumen = summarize(muchos)
    assert len(resumen) < 200, resumen
    assert "215 tramos" in resumen
    assert "x108" in resumen or "x107" in resumen

    # Con pocos tramos se sigue viendo uno a uno, que es mas util.
    pocos = muchos[:5]
    assert summarize(pocos).count("·") == 4
