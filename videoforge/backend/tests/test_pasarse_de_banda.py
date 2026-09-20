"""Lo que sobra, medido igual que lo que falta.

El medidor aprendio a avisar de lo que **falta** cuando se vio que la media
escondia un cero: `cinematic` devolvia el video sin un solo corte y la nota
salia "en el punto". Se arreglo, y quedo la mitad de arriba sin tocar --- que es
peor, porque este proyecto existe para no sobresaturar.

Medido sobre la guia de Palworld de veinte minutos, con los siete estilos:

    estilo        nota  veredicto      se pasaba de su propia banda
    palworld      53.0  en el punto    max_layers 4 sobre una banda de 0-3
    vlog          48.7  en el punto    pico 0.874 sobre un techo de 0.850
    gaming-hype   44.5  sub-editado    pico 1.000 sobre un techo de 0.950

Los tres se pasaban de lo que ellos mismos declaran y el medidor los bendecia:
una media reparte un exceso entre trece metricas y se lo come. Y el
auto-balanceador, que decide por esa misma nota, hacia **cero cambios en los
siete** --- con 182 efectos en reservas y 133 ventanas calientes esperando. El
motor de autorregulacion estaba, de hecho, apagado.

Aqui se fija lo que tiene que seguir siendo verdad.
"""

from __future__ import annotations

import numpy as np
import pytest

from forge.fixtures import synthetic_guide_analysis

from forge.plan.edl import (
    BrollEffect,
    CalloutEffect,
    EffectKind,
    LowerThirdEffect,
    PunchInEffect,
    SfxEffect,
)
from forge.plan.planner import build_edl
from forge.plan.restraint import AMBIENT_KINDS as PLAN_AMBIENT, cap_layers
from forge.plan.styles import list_styles, load_style
from forge.saturation.balance import rebalance
from forge.saturation.density import density_curve, unclipped_curve
from forge.saturation.metrics import AMBIENT_KINDS as METRIC_AMBIENT, layers_curve
from forge.saturation.score import BUSY, evaluate, verdict_for


@pytest.fixture(scope="module")
def analysis():
    return synthetic_guide_analysis(300.0)


@pytest.fixture(scope="module")
def guia_larga():
    """Una guia larga en la que se **nombra lo que se ve**.

    Hace falta que sea asi para reproducir el apilamiento: los recuadros solo
    salen cuando dices una palabra que esta en la pantalla, y cada recuadro trae
    su etiqueta. Con eso, un subtitulo y un acercamiento ya son cuatro cosas.

    Sobre una guia de 300 segundos no llega a pasar --- lo comprobe --- y por eso
    una prueba corta no habria cazado nada.
    """
    from forge.analysis.ocr import ScreenText, WordBox
    from forge.understand.speech_cues import find_all

    a = synthetic_guide_analysis(600.0)
    palabras = ("ajustes", "boton", "casilla")
    a.screen_text = [
        ScreenText(
            at=t,
            words=[palabras[i % 3]],
            boxes=[WordBox(text=palabras[i % 3], x=0.55, y=0.25, w=0.18, h=0.06)],
        )
        for i, t in enumerate(x * 5.0 for x in range(1, 120))
    ]
    a.cues = find_all(a.transcript, a.audio, None, a.screen_text, a.cursor)
    return a


def _apilado(analysis, estilo: str = "tutorial"):
    """Un montaje con cuatro cosas encima del video en el mismo instante.

    Es el caso de verdad, no uno inventado: en el segundo 282 de la guia de
    Palworld coincidian un subtitulo, un acercamiento, un recuadro y su
    etiqueta. Cada uno bien puesto por su cuenta; nadie contaba el total.
    """
    edl = build_edl(analysis, estilo)
    at = edl.duration / 2
    edl.effects += [
        PunchInEffect(id="z900", start=at, end=at + 1.8, value_score=0.88,
                      cost_weight=1.0, rationale="acercamiento"),
        CalloutEffect(id="k900", start=at - 0.4, end=at + 1.4, value_score=0.80,
                      cost_weight=0.55, rationale="recuadro"),
        LowerThirdEffect(id="r900", start=at - 0.4, end=at + 1.4, text="X",
                         value_score=0.80, cost_weight=0.12, rationale="etiqueta"),
    ]
    return edl, at


# -- el veredicto ----------------------------------------------------------


def test_pasarse_de_su_propia_banda_no_es_en_el_punto() -> None:
    """Una nota de 53 con una metrica fuera no es un montaje en su punto."""
    from forge.saturation.score import MetricReading
    from forge.plan.styles import Band

    banda = Band(lo=0.0, hi=3.0)
    fuera = MetricReading(
        name="max_layers", value=4.0, band=banda, position=1.33,
        status="alto", score=78.0, weight=1.0, counts=True,
    )
    assert verdict_for(53.0, [fuera]) == "cargado"
    assert verdict_for(53.0, []) == "en el punto", "sin excesos, la nota manda"


def test_faltar_y_sobrar_a_la_vez_tiene_su_propio_nombre() -> None:
    """Es lo que le pasa a `gaming-hype` sobre una guia hablada.

    Le falta ritmo donde importa (9.6 cortes por minuto contra una banda que
    empieza en 18) y le sobra carga donde no (el pico clavado en 1.000). Decir
    "sub-editado" invita a anadir mas de lo que ya sobra; decir "cargado"
    esconde el hueco.
    """
    from forge.saturation.score import MetricReading
    from forge.plan.styles import Band

    corto = MetricReading(
        name="cuts_per_minute", value=9.6, band=Band(lo=18.0, hi=48.0),
        position=-0.28, status="bajo", score=23.0, weight=1.0, counts=True,
    )
    pasado = MetricReading(
        name="effect_density_peak", value=1.0, band=Band(lo=0.0, hi=0.95),
        position=1.05, status="alto", score=68.0, weight=1.0, counts=True,
    )
    assert verdict_for(44.5, [corto, pasado]) == "descompensado"


def test_un_exceso_que_no_vota_no_cuenta(analysis) -> None:
    """Una herramienta apagada no puede pasarse de nada.

    Es la otra mitad de la regla que ya protegia a `cinematic` por no llevar
    subtitulos: si el estilo no enciende los efectos de sonido, su banda de
    sonidos no es ni un hueco ni un exceso.
    """
    edl = build_edl(analysis, "cinematic")
    rep = evaluate(edl, analysis, style=load_style("cinematic"))
    for r in rep.readings:
        if not r.counts:
            assert r not in rep.excesses and r not in rep.shortfalls


# -- el tope de capas, que es preventivo ------------------------------------


@pytest.mark.parametrize("estilo", list_styles())
def test_el_estilo_dice_cuantas_cosas_caben_encima(guia_larga, estilo: str) -> None:
    """Y no se cuenta despues: no se llega a apilar.

    Sin el freno, sobre esta misma guia:

        palworld          4 capas sobre un tope de 3, en 3 instantes
        clean-corporate   3 capas sobre un tope de 2, en 4 instantes

    Los dos estilos que declaran el tope mas bajo son justo los que se pasaban,
    que es lo que cabia esperar y nadie estaba mirando.
    """
    banda = load_style(estilo).band("max_layers")
    assert banda is not None, estilo
    edl = build_edl(guia_larga, estilo)
    capas = layers_curve(edl)
    assert capas.size, estilo
    assert capas.max() <= banda.hi, (
        f"{estilo}: {capas.max():.0f} cosas encima del video en "
        f"{(capas > banda.hi).sum()} instantes, y el estilo admite {banda.hi:.0f}"
    )


def test_lo_que_se_retira_por_apilarse_va_a_reservas(analysis) -> None:
    """No se borra: si luego hace falta algo en un tramo vacio, sigue ahi."""
    edl, _ = _apilado(analysis)
    reservas_antes = len(edl.candidates)
    retirados, notas = cap_layers(edl, load_style("tutorial"))

    assert retirados, "cuatro capas sobre un tope de tres y no retiro nada"
    assert len(edl.candidates) == reservas_antes + len(retirados)
    assert notas and "apilarse" in notas[0]


def test_el_tope_no_toca_los_subtitulos(analysis) -> None:
    """Lo que se esta diciendo no es un adorno.

    Si hay que elegir entre el texto de la frase y el recuadro que la ilustra,
    se va el recuadro. Y si lo unico apilado son subtitulos, no se toca nada:
    eso no es sobreedicion, es que hablas seguido.
    """
    edl, _ = _apilado(analysis)
    subtitulos_antes = len(edl.effects_of(EffectKind.CAPTION))
    cap_layers(edl, load_style("tutorial"))
    assert len(edl.effects_of(EffectKind.CAPTION)) == subtitulos_antes


def test_las_dos_listas_de_ambiente_dicen_lo_mismo() -> None:
    """Estan duplicadas a proposito y esta prueba es el precio.

    `saturation` importa de `plan`, asi que `plan` no puede importar de
    `saturation`: la lista de lo que no ocupa una capa vive en los dos sitios.
    Si se separan, el freno cuenta capas que el medidor no cuenta y el montaje
    pierde efectos por un exceso que nadie mide.
    """
    assert set(PLAN_AMBIENT) == set(METRIC_AMBIENT)


# -- el balanceador, que antes no se movia ---------------------------------


def test_el_balanceador_se_mueve_cuando_se_pasa_una_banda(analysis) -> None:
    """Aunque la nota este en medio de [28, 68], que es lo que lo tenia parado."""
    edl, _ = _apilado(analysis)
    # El freno preventivo no ha corrido: aqui se apila a mano para dejar al
    # balanceador el trabajo que tiene que saber hacer.
    preset = load_style("tutorial")
    antes = evaluate(edl, analysis, style=preset)
    assert antes.excesses, "el montaje de prueba tiene que pasarse de algo"
    assert 28.0 <= antes.score <= BUSY, (
        "y su nota tiene que estar dentro, que es el caso que se escapaba"
    )

    info = rebalance(edl, analysis, style=preset)
    despues = evaluate(edl, analysis, style=preset)

    assert info.changes, "se pasaba de su banda y no movio nada"
    assert len(despues.excesses) < len(antes.excesses) or not despues.excesses


def test_el_balanceador_no_cambia_un_problema_por_otro(analysis) -> None:
    """Quitar cien efectos para bajar el pico y acabar vacio no es arreglarlo.

    Es lo que hacia `gaming-hype` sobre la guia de Palworld de veinte minutos:
    **-100 efectos**, el pico dentro de banda, tres carencias nuevas y el
    veredicto cambiado de "descompensado" a "sub-editado". Cambiaba estar
    cargado por estar vacio y lo llamaba arreglado.

    El caso se construye a mano porque sobre una guia sintetica no sale solo, y
    lo que hace falta es preciso: que **lo unico que se puede podar sea tambien
    lo unico que sostiene una metrica con suelo**. `gaming-hype` pide entre el 5%
    y el 45% de metraje con material de apoyo, asi que dos insertos de ocho
    segundos dan 8.1% --- dentro --- y quitar uno deja 4.0%, por debajo del suelo.
    Con mucha carga encima, esos dos insertos son ademas los que pasan el pico de
    densidad de su techo. Podarlos arregla el exceso y abre el hueco: es el
    cambalache que no se puede hacer.
    """
    edl = build_edl(analysis, "gaming-hype")
    preset = load_style("gaming-hype")

    for e in list(edl.effects):
        if e.kind not in (EffectKind.GRADE, EffectKind.MUSIC, EffectKind.CAPTION):
            edl.demote_effect(e.id)
    edl.candidates = []  # sin reservas: la unica salida seria podar
    largo = edl.duration
    edl.effects += [
        BrollEffect(id=f"bb{i}", start=largo * (0.2 + 0.2 * i),
                    end=largo * (0.2 + 0.2 * i) + 8.0,
                    value_score=0.5, cost_weight=12.0, rationale="apoyo")
        for i in range(2)
    ]

    antes = evaluate(edl, analysis, style=preset)
    assert antes.excesses, "el caso necesita un exceso que podar"
    assert not [r for r in antes.shortfalls if r.name == "overlay_coverage"], (
        "y que el material de apoyo empiece dentro de su banda"
    )

    rebalance(edl, analysis, style=preset)
    despues = evaluate(edl, analysis, style=preset)

    assert len(despues.shortfalls) <= len(antes.shortfalls), (
        "abrio un hueco nuevo para tapar un exceso: "
        f"{[r.name for r in antes.shortfalls]} -> {[r.name for r in despues.shortfalls]}"
    )


def test_podar_de_verdad_baja_la_carga(analysis) -> None:
    """La prueba de la regresion que dejaba el balanceador en cero cambios.

    `mal()` mira el EDL para saber cuanto dura el exceso, y se estaba llamando
    **despues** de mutarlo: comparaba el informe viejo contra el montaje nuevo,
    salia empate, y deshacia cada poda acertada una por una hasta agotar los 400
    intentos. Con la poda buena delante de las narices.
    """
    edl, _ = _apilado(analysis)
    preset = load_style("tutorial")
    carga_antes = float(unclipped_curve(edl).sum())

    info = rebalance(edl, analysis, style=preset)

    assert info.changes
    assert float(unclipped_curve(edl).sum()) < carga_antes


# -- la senal que el controlador necesita ----------------------------------


def test_la_curva_sin_recortar_deja_ver_cuanto_se_pasa(analysis) -> None:
    """Porque la recortada se clava en 1.0 y esconde el progreso.

    Con `gaming-hype` el pico daba 1.000 exacto: mas del 5% del montaje pegado
    al techo. Se podaba un sonido, la carga bruta bajaba de verdad, y la curva
    recortada seguia dando 1.0. El balanceador leia "no he mejorado".
    """
    edl = build_edl(analysis, "gaming-hype")
    # Carga a lo bestia para forzar el recorte.
    at = 10.0
    edl.effects += [
        PunchInEffect(id=f"zz{i}", start=at, end=at + 2.0, value_score=0.5,
                      cost_weight=2.0, rationale="carga")
        for i in range(8)
    ]

    recortada = density_curve(edl)
    cruda = unclipped_curve(edl)

    assert recortada.max() == pytest.approx(1.0), "hace falta que este saturada"
    assert cruda.max() > 1.0, "la cruda tiene que poder pasar de 1.0"
    assert np.all(cruda >= recortada - 1e-6)
    # Y donde no hay saturacion, son la misma cosa.
    tranquilo = recortada < 0.99
    assert np.allclose(cruda[tranquilo], recortada[tranquilo], atol=1e-6)


# -- y lo contrario de sobreeditar: editar donde de verdad hace falta ---------


def test_la_transicion_de_capitulo_no_la_echa_una_decorativa() -> None:
    """El cupo se recortaba por orden de tiempo, y eso tira lo bueno de despues.

    Medido sobre la guia de Palworld de veinte minutos con `palworld` y con
    `tutorial`: **18 motivos para un cupo de 16**, y el que se quedaba fuera era
    justo el unico cambio de capitulo --- 0.60 de valor --- mientras entraban 16
    decorativas de 0.234 que el suelo de justificacion mataba justo despues.

    El montaje acababa con **cero transiciones**: las 16 que pasaron el cupo no
    se justificaban, y la unica que informaba de algo no llego a pasarlo por
    ocurrir tarde. El planner sabia perfectamente cual era cual y lo perdia al
    ordenar.
    """
    from forge.plan.chapters import Chapter
    from forge.plan.edl import EDL, Clip, RenderSpec
    from forge.plan.planner import _plan_transitions

    class _Plano:
        def __init__(self, i): self.index = i

    class _Analisis:
        """Cada clip es un plano distinto: todos los cortes cambian de plano."""
        def shot_at(self, t):
            return _Plano(int(t // 2.0))

    # Veinte clips de dos segundos: diecinueve cortes, todos con cambio de plano.
    clips = [
        Clip(id=f"c{i}", source_start=i * 2.0, source_end=(i + 1) * 2.0)
        for i in range(20)
    ]
    edl = EDL(
        source="x.mp4", source_duration=40.0, style="tutorial", intensity=50,
        render=RenderSpec(width=1920, height=1080, fps=30.0), timeline=clips,
    )
    # Y un capitulo que empieza **al final**, que es lo que lo condenaba.
    edl.chapters = [
        Chapter(index=0, start=0.0, end=34.0, title="Primero"),
        Chapter(index=1, start=34.0, end=40.0, title="El ultimo"),
    ]

    estilo = load_style("tutorial")
    puestas = _plan_transitions(edl, estilo, _Analisis())

    cupo = max(1, int(len(edl.cut_points()) * estilo.transitions.fraction))
    assert len(puestas) == cupo, "el cupo del estilo se sigue respetando"
    assert any("capitulo" in e.rationale for e in puestas), (
        "la transicion de capitulo llegaba tarde y se quedaba fuera; "
        f"puestas: {[e.rationale[-40:] for e in puestas]}"
    )
    # Y siguen en orden de tiempo, que es como se les ponen los identificadores.
    assert [e.start for e in puestas] == sorted(e.start for e in puestas)
