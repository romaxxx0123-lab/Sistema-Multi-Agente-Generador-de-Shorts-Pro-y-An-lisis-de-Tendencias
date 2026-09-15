"""Senalar el boton que nombras, no el tercio de pantalla donde cae.

Antes, "senalar" se resolvia con una tabla de zonas: dices "arriba a la
derecha" y el zoom va al 78% / 25% de la imagen. Funciona cuando dices donde
esta, pero la forma normal de senalar algo en una guia no es por su sitio, es
**por su nombre**: *"justo donde pone Ajustes"*, *"dale al boton de Guardar"*.

Las dos mitades del dato ya estaban en el proyecto y no se cruzaban: el
transcript sabe que palabra dices y cuando, y el OCR sabe que pone en pantalla y
donde. Cruzarlas convierte un zoom aproximado en un zoom al elemento.

Lo que estos tests fijan sobre todo es lo conservador: sin OCR se comporta como
antes, una palabra que sale dos veces en pantalla no se senala, y si lo que
dices y lo que se lee se contradicen, gana lo que dices.
"""

from __future__ import annotations

from forge.analysis.ocr import ScreenText, WordBox
from forge.analysis.types import Transcript, TranscriptSegment, Word
from forge.plan.callouts import plan_callouts
from forge.plan.edl import EDL, Clip, RenderSpec
from forge.plan.styles import CalloutRules
from forge.understand.speech_cues import CueKind, find_pointing


def _transcript(texto: str, inicio: float = 10.0) -> Transcript:
    palabras, t = [], inicio
    for p in texto.split():
        palabras.append(Word(start=round(t, 2), end=round(t + 0.28, 2), text=p))
        t += 0.34
    return Transcript(language="es", segments=[
        TranscriptSegment(start=inicio, end=round(t, 2), text=texto, words=palabras),
    ])


def _pantalla(at: float, cajas: list[tuple[str, float, float]]) -> ScreenText:
    return ScreenText(
        at=at,
        words=[t for t, _, _ in cajas],
        boxes=[WordBox(text=t, x=x, y=y, w=0.09, h=0.03) for t, x, y in cajas],
    )


#: Un menu arriba a la izquierda y un boton abajo a la derecha.
PANTALLA = [_pantalla(10.5, [("Archivo", 0.05, 0.04), ("Guardar", 0.80, 0.90)])]


def _punto(frase: str, pantalla=None):
    senales = [c for c in find_pointing(_transcript(frase), pantalla)
               if c.kind is CueKind.POINT]
    return senales[0] if senales else None


# -- nombrar es senalar ---------------------------------------------------


def test_donde_pone_algo_es_senalar_aunque_no_haya_ocr() -> None:
    """Era la unica de las cincuenta frases medidas que no reconocia."""
    senal = _punto("justo donde pone ajustes")
    assert senal is not None
    assert senal.region is None, "sin OCR no puede saber donde esta"


def test_con_el_texto_de_pantalla_apunta_al_elemento() -> None:
    senal = _punto("justo donde pone guardar", PANTALLA)
    assert senal is not None
    assert senal.target == "Guardar"
    x, y = senal.region
    assert 0.78 < x < 0.92 and 0.86 < y < 0.96, (x, y)
    assert senal.strength > 0.95
    assert "Guardar" in senal.rationale


def test_las_formas_normales_de_decirlo() -> None:
    for frase in (
        "dale al boton de guardar",
        "pincha en guardar",
        "pulsa sobre el guardar",
        "el boton de guardar",
        "busca el guardar",
        "haz clic en guardar",
    ):
        senal = _punto(frase, PANTALLA)
        assert senal is not None and senal.target == "Guardar", frase


def test_nombrar_a_secas_solo_cuenta_si_se_lee_en_pantalla() -> None:
    """"Se llama X" dirige la mirada solo si X esta escrito ahi."""
    assert _punto("esto se llama guardar", PANTALLA) is not None
    assert _punto("el programa se llama gestor de tareas", PANTALLA) is None
    assert _punto("el programa se llama gestor de tareas") is None


# -- y cuando no ----------------------------------------------------------


def test_sin_ocr_se_comporta_como_antes() -> None:
    senal = _punto("mira este boton de arriba a la derecha")
    assert senal is not None
    assert senal.region == (0.78, 0.25)
    assert senal.target == ""


def test_una_palabra_repetida_en_pantalla_no_se_senala() -> None:
    """Senalar el sitio equivocado es peor que no senalar."""
    dos_veces = [_pantalla(10.5, [("Guardar", 0.1, 0.2), ("Guardar", 0.7, 0.8)])]
    senal = _punto("dale al boton de guardar", dos_veces)
    assert senal is not None
    assert senal.target == "" and senal.region is None


def test_si_lo_que_dices_y_lo_que_se_lee_se_contradicen_ganas_tu() -> None:
    """El OCR se equivoca; tu sabes lo que estabas senalando.

    "Guardar" se leyo abajo a la derecha y la frase dice arriba a la izquierda.
    Uno de los dos esta mal y no hay forma de saber cual, asi que se queda la
    zona dicha en vez de mandar el zoom al lado contrario de la pantalla.
    """
    senal = _punto("pincha en guardar arriba a la izquierda", PANTALLA)
    assert senal is not None
    assert senal.target == ""
    assert senal.region == (0.22, 0.25)


def test_una_desviacion_pequena_no_es_una_contradiccion() -> None:
    """Las zonas son gruesas: "arriba a la izquierda" es un tercio entero."""
    senal = _punto("pincha en archivo arriba a la izquierda", PANTALLA)
    assert senal is not None and senal.target == "Archivo"


def test_lo_que_no_esta_en_pantalla_no_inventa_sitio() -> None:
    senal = _punto("dale al boton de exportar", PANTALLA)
    assert senal is not None
    assert senal.target == "" and senal.region is None


# -- los recuadros siguen a lo que senalas --------------------------------


def _edl(duracion: float = 30.0) -> EDL:
    return EDL(
        source="a.mp4",
        source_duration=duracion,
        render=RenderSpec(width=1920, height=1080, fps=30),
        timeline=[Clip(id="c0", source_start=0.0, source_end=duracion)],
    )


def _dos_momentos() -> tuple[Transcript, list[ScreenText]]:
    """Nombrar "Archivo" de pasada, y mas tarde senalar "Guardar"."""
    palabras = [
        Word(start=2.0, end=2.4, text="el"),
        Word(start=2.4, end=3.0, text="Archivo"),
        Word(start=3.0, end=3.6, text="ese"),
        Word(start=20.0, end=20.4, text="dale"),
        Word(start=20.4, end=20.7, text="al"),
        Word(start=20.7, end=21.2, text="boton"),
        Word(start=21.2, end=21.4, text="de"),
        Word(start=21.4, end=22.0, text="Guardar"),
    ]
    t = Transcript(language="es", segments=[
        TranscriptSegment(start=2.0, end=3.6, text="el Archivo ese",
                          words=palabras[:3]),
        TranscriptSegment(start=20.0, end=22.0, text="dale al boton de Guardar",
                          words=palabras[3:]),
    ])
    pantalla = [
        _pantalla(2.5, [("Archivo", 0.05, 0.04), ("Guardar", 0.80, 0.90)]),
        _pantalla(21.0, [("Archivo", 0.05, 0.04), ("Guardar", 0.80, 0.90)]),
    ]
    return t, pantalla


def test_el_recuadro_que_senalas_vale_mas_que_el_que_solo_nombras() -> None:
    t, pantalla = _dos_momentos()
    cues = find_pointing(t, pantalla)
    marcas, reservas = plan_callouts(_edl(), t, pantalla, CalloutRules(), cues)

    por_etiqueta = {m.label: m for m in marcas + reservas}
    assert por_etiqueta["Guardar"].value_score > por_etiqueta["Archivo"].value_score
    assert "senalas" in por_etiqueta["Guardar"].rationale


def test_cuando_solo_cabe_uno_sobrevive_el_que_senalas() -> None:
    """Y esta es la diferencia que se ve en el video montado.

    En treinta segundos el estilo deja sitio para un recuadro. Sin saber donde
    senalas, se lo queda el primero que salga; sabiendolo, se lo queda aquel al
    que dices "dale al boton de".
    """
    t, pantalla = _dos_momentos()

    antes, _ = plan_callouts(_edl(30.0), t, pantalla, CalloutRules())
    assert [m.label for m in antes] == ["Archivo"], "el primero por orden"

    cues = find_pointing(t, pantalla)
    marcas, reservas = plan_callouts(_edl(30.0), t, pantalla, CalloutRules(), cues)
    assert [m.label for m in marcas] == ["Guardar"]
    assert [r.label for r in reservas] == ["Archivo"]


def test_sin_senales_no_se_pierde_ningun_candidato() -> None:
    """Lo que no entra queda de reserva, para el auto-balanceador."""
    t, pantalla = _dos_momentos()
    marcas, reservas = plan_callouts(_edl(), t, pantalla, CalloutRules())
    assert sorted(m.label for m in marcas + reservas) == ["Archivo", "Guardar"]


# -- y el zoom encuadra lo que senalas ------------------------------------


def test_el_zoom_se_acerca_segun_el_tamano_de_lo_que_senalas() -> None:
    """Antes el zoom era el mismo para todo, porque no sabia a que se acercaba.

    Sabiendo el tamano del elemento se puede encuadrar: un boton pequeno pide
    mucho mas acercamiento que un panel que ya ocupa media pantalla.
    """
    from forge.plan.emphasis import _framing_zoom
    from forge.plan.styles import load_style

    reglas = load_style("tutorial").emphasis
    boton = _framing_zoom((0.8, 0.9, 0.09, 0.03), reglas)
    panel = _framing_zoom((0.1, 0.1, 0.30, 0.60), reglas)

    assert boton > panel
    assert boton <= reglas.punch_zoom_max, "en pantalla grabada, mas ya se ve"
    assert panel == reglas.punch_zoom, "lo grande no necesita mas del de serie"
    assert _framing_zoom(None, reglas) == reglas.punch_zoom, "sin OCR, como antes"


def test_no_se_acerca_tanto_que_corte_lo_que_senalas() -> None:
    """Un zoom que corta el elemento es peor que no acercarse."""
    from forge.plan.emphasis import _framing_zoom
    from forge.plan.styles import load_style

    reglas = load_style("tutorial").emphasis
    barra = _framing_zoom((0.04, 0.9, 0.92, 0.05), reglas)
    assert barra < reglas.punch_zoom
    assert 0.92 + 0.02 <= 1.0 / barra, "tiene que seguir cabiendo entero"


def test_lo_que_ocupa_la_pantalla_entera_no_lleva_zoom() -> None:
    """No hay a donde acercarse, y un zoom de 1,0 solo gasta cupo."""
    from forge.analysis.types import Analysis
    from forge.media import MediaInfo, VideoStream
    from forge.plan.edl import EDL, Clip, RenderSpec
    from forge.plan.emphasis import _pointed_candidates
    from forge.plan.styles import load_style
    from forge.understand.speech_cues import CueKind, SpeechCue

    a = Analysis(
        media=MediaInfo(
            path="x.mp4", size_bytes=1, duration=20.0,
            video=VideoStream(index=0, codec="h264", width=1280, height=720, fps=30.0),
            has_audio=True,
        ),
    )
    edl = EDL(source="x.mp4", source_duration=20.0,
              render=RenderSpec(width=1280, height=720, fps=30),
              timeline=[Clip(id="c0", source_start=0.0, source_end=20.0)])

    def senal(box):
        return SpeechCue(kind=CueKind.POINT, start=5.0, end=6.6, phrase="dale al",
                         strength=0.98, region=(0.5, 0.5), target="X", box=box)

    a.cues = [senal((0.02, 0.02, 0.96, 0.96))]
    assert _pointed_candidates(edl, a, load_style("tutorial").emphasis) == []

    a.cues = [senal((0.8, 0.9, 0.09, 0.03))]
    assert _pointed_candidates(edl, a, load_style("tutorial").emphasis)
