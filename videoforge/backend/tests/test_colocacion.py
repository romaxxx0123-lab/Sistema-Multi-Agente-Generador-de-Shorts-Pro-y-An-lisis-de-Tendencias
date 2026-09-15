"""Que el material entre **cuando dices la palabra** y **donde no estorbe**.

Es la segunda mitad de "que un modelo local la busque y la ponga segun lo que
digo" (ver ANALISIS-MODELO-LOCAL.md). Y ahi el modelo no era el problema: el
dato que hacia falta ya estaba calculado y nadie lo miraba.

Tres fallos, los tres medidos antes de tocar nada:

1. **Cuando.** `find_topic_moments` agrupa el habla en ventanas de hasta seis
   segundos y `plan_broll` colocaba el material al principio de la ventana. En
   la guia sintetica eso dejaba la imagen a 1,78 s de mediana de la palabra que
   ilustra, con casos de 6,6 s: entraba mientras hablabas todavia de otra cosa.
2. **Donde.** La ventanita iba siempre arriba a la derecha, que en una guia es
   justo donde suele estar lo que explicas (pestanas, menus, el boton que
   nombras) -- y el sistema sabia donde estaba, porque `cues` trae la caja del
   texto que nombras y `cursor` donde tienes el puntero.
3. **Tapando.** Un b-roll a pantalla completa mientras senalas algo lo tapa.
   Antes se resolvia tirando el material entero; no taparlo es mejor.
"""

from __future__ import annotations

import statistics

import pytest

from forge.analysis.types import Transcript, TranscriptSegment, Word
from forge.assets.providers import build_providers, tokenize
from forge.assets.types import AssetBundle
from forge.fixtures import synthetic_guide_analysis
from forge.plan.broll import _pauses, _snap, _when_said, find_topic_moments, plan_broll
from forge.plan.edl import Rect
from forge.plan.edl import CaptionEffect
from forge.plan.placement import CAPTION_BAND, ScreenUse, corners, place
from forge.plan.planner import build_edl
from forge.plan.styles import load_style
from forge.understand.speech_cues import CueKind, SpeechCue


# -- cuando ----------------------------------------------------------------


def _distancias(edl, transcript, momentos, donde) -> list[float]:
    """Cuanto se aleja cada colocacion de la palabra que ilustra."""
    palabras = [
        (edl.source_to_timeline(w.start), w.text) for w in transcript.words
    ]
    palabras = [(t, x) for t, x in palabras if t is not None]
    salida = []
    for m in momentos:
        dichas = [
            t for t, txt in palabras
            if m.start - 0.01 <= t <= m.end + 0.01 and m.head in tokenize(txt)
        ]
        if dichas:
            salida.append(min(abs(donde(m) - d) for d in dichas))
    return salida


def test_el_material_entra_cuando_dices_la_palabra() -> None:
    """La medida del fallo y la de su arreglo, sobre los mismos 31 momentos."""
    a = synthetic_guide_analysis(duration=300.0)
    edl = build_edl(a, "tutorial")
    momentos = find_topic_moments(edl, a.transcript)
    assert len(momentos) > 20, "hacen falta bastantes momentos para que la medida valga"

    pausas = [
        t for t in (edl.source_to_timeline(p) for p in _pauses(a.transcript))
        if t is not None
    ]
    antes = _distancias(edl, a.transcript, momentos, lambda m: _snap(pausas, m.start))
    ahora = _distancias(
        edl, a.transcript, momentos,
        lambda m: _snap(pausas, m.head_at if m.head_at > 0 else m.start),
    )

    assert statistics.median(ahora) < 0.6, statistics.median(ahora)
    assert max(ahora) < 1.5, max(ahora)
    # Y que de verdad es mejor que lo de antes, no solo que pasa un umbral.
    assert statistics.median(ahora) * 3 < statistics.median(antes)
    assert sum(d > 2.0 for d in ahora) == 0
    assert sum(d > 2.0 for d in antes) > 5


def test_la_palabra_se_busca_en_la_transcripcion() -> None:
    palabras = [
        Word(start=10.0, end=10.4, text="abrimos"),
        Word(start=10.5, end=11.0, text="los"),
        Word(start=11.1, end=11.8, text="ajustes"),
    ]
    assert _when_said(palabras, "ajustes", 10.0, 12.0) == 11.1
    # Fuera de la ventana no cuenta.
    assert _when_said(palabras, "ajustes", 0.0, 5.0) == 0.0
    # Y si no se encuentra, se cae al principio, que es lo que se hacia antes.
    assert _when_said(palabras, "impresora", 10.0, 12.0) == 10.0


def test_el_material_no_se_sale_del_tema() -> None:
    """Aunque la palabra se diga al final de la ventana.

    Si se dice en el ultimo medio segundo, colocar ahi el material lo dejaria
    ilustrando ya el tema siguiente. Se recorta al tema, o no se pone.
    """
    a = synthetic_guide_analysis(duration=300.0)
    edl = build_edl(a, "tutorial")
    for m in find_topic_moments(edl, a.transcript):
        assert m.start <= m.head_at <= m.end + 1e-6


# -- donde -----------------------------------------------------------------


BASE = corners(0.3, 0.4)[0][1]   # la de siempre: arriba a la derecha


def test_sin_estorbos_no_se_mueve() -> None:
    """La regla conservadora: cambiar de esquina cada vez se ve nervioso."""
    colocado, movida = place(BASE, [])
    assert colocado == BASE and movida == ""


def test_se_aparta_de_lo_que_senalas() -> None:
    senalado = Rect(x=0.70, y=0.04, w=0.25, h=0.18)
    colocado, movida = place(BASE, [senalado])
    assert colocado != BASE
    assert movida == "arriba a la izquierda"
    # Y de verdad ya no lo tapa.
    assert colocado.x + colocado.w <= senalado.x


def _subtitulo(inicio: float, fin: float, position: str) -> CaptionEffect:
    return CaptionEffect(
        id=f"cap{inicio}", start=inicio, end=fin, text="lo que dices",
        position=position,
    )


def test_los_subtitulos_cuentan_como_ocupado() -> None:
    """Una ventanita encima de los subtitulos tapa tambien lo que dices."""
    banda = Rect(x=0.0, y=1.0 - CAPTION_BAND, w=1.0, h=CAPTION_BAND)
    colocado, _ = place(BASE, [banda])
    assert colocado.y + colocado.h <= 1.0 - CAPTION_BAND + 1e-6


def test_los_subtitulos_no_siempre_estan_abajo() -> None:
    """El fallo que tenia esto al entregarlo: darlo por hecho.

    `captions.py` sube los subtitulos cuando el foco del plano esta abajo. La
    ventanita, que va arriba a la derecha por defecto, se les plantaba encima
    justo en esos planos -- y encima el "evita la banda de abajo" apartaba de
    una zona que estaba libre.
    """
    pantalla = ScreenUse(captions=[_subtitulo(0.0, 20.0, "top")])
    bandas = pantalla.busy(0.0, 5.0, timeline=(1.0, 4.0))
    assert bandas == [Rect(x=0.0, y=0.0, w=1.0, h=CAPTION_BAND)]

    colocado, movida = place(BASE, bandas)
    assert movida, "con los subtitulos arriba hay que apartarse"
    assert colocado.y >= CAPTION_BAND - 1e-6

    # Y con ellos abajo, que es lo normal, la de siempre sigue valiendo.
    abajo = ScreenUse(captions=[_subtitulo(0.0, 20.0, "bottom")])
    colocado, movida = place(BASE, abajo.busy(0.0, 5.0, timeline=(1.0, 4.0)))
    assert (colocado, movida) == (BASE, "")


def test_fuera_del_tramo_los_subtitulos_no_cuentan() -> None:
    pantalla = ScreenUse(captions=[_subtitulo(50.0, 60.0, "top")])
    assert pantalla.busy(0.0, 5.0, timeline=(1.0, 4.0)) == []


def test_el_puntero_se_mira_a_lo_largo_de_la_insercion() -> None:
    """No solo al principio y al final: puede cruzar por medio."""

    class _Cruza:
        def at(self, t):
            return (0.85, 0.12) if 11.0 < t < 11.6 else (0.1, 0.9)

    pantalla = ScreenUse(cursor=_Cruza())
    zonas = pantalla.busy(10.0, 13.0)
    assert any(z.x > 0.5 and z.y < 0.4 for z in zonas), "se perdio el paso del puntero"


# -- donde el video de debajo esta vacio ------------------------------------


def _rejilla(llenas: list[tuple[int, int]]) -> list[float]:
    g = [0.05] * 9
    for fila, col in llenas:
        g[fila * 3 + col] = 0.95
    return g


def test_la_ventanita_va_donde_el_video_esta_vacio() -> None:
    """A igualdad de no tapar nada, la esquina mas vacia.

    Sin esto la ventanita iba siempre a la misma esquina aunque justo ahi
    estuviera todo el contenido del video y el otro lado estuviera en blanco.
    """
    # Todo el contenido a la derecha: se va a la izquierda.
    derecha_llena = _rejilla([(0, 2), (1, 2), (2, 2)])
    colocado, movida = place(BASE, [], derecha_llena)
    assert colocado.x < 0.5 and "izquierda" in movida

    # Y al reves, para probar que decide la rejilla y no una preferencia fija.
    izquierda_llena = _rejilla([(0, 0), (1, 0), (2, 0)])
    colocado, movida = place(BASE, [], izquierda_llena)
    assert colocado.x > 0.5


def test_tapar_lo_que_senalas_pesa_mas_que_una_zona_con_cosas() -> None:
    """El orden de los dos criterios, que no es negociable.

    La izquierda esta llena de contenido, pero arriba a la derecha es justo lo
    que estas senalando: se va de ahi igualmente. Tapar una zona con cosas es
    menos elegante; taparte lo que explicas es un fallo.
    """
    from forge.plan.placement import _overlap

    senalado = Rect(x=0.70, y=0.04, w=0.25, h=0.18)
    izquierda_llena = _rejilla([(0, 0), (1, 0)])
    colocado, _ = place(BASE, [senalado], izquierda_llena)
    assert _overlap(colocado, senalado) == 0.0
    # Y sin nada que senalar, la misma rejilla sí la manda a la derecha.
    solo_rejilla, _ = place(BASE, [], izquierda_llena)
    assert solo_rejilla.x > 0.5


def test_el_puntero_tambien_cuenta() -> None:
    """Donde esta el puntero es donde estas mirando: ahi no se tapa."""

    class _Puntero:
        def at(self, t):
            return (0.88, 0.10)   # arriba a la derecha

    pantalla = ScreenUse(cues=[], cursor=_Puntero())
    zonas = pantalla.busy(10.0, 12.0)
    assert zonas
    colocado, movida = place(BASE, zonas)
    assert movida and colocado != BASE


def test_si_todo_estorba_se_queda_con_la_menos_mala() -> None:
    """Una pantalla llena no puede dejar el montaje sin material."""
    todo = [Rect(x=0.0, y=0.0, w=1.0, h=1.0)]
    colocado, _ = place(BASE, todo)
    assert colocado == BASE      # ninguna mejora: se queda donde estaba


def test_una_senal_floja_no_mueve_nada() -> None:
    floja = SpeechCue(
        kind=CueKind.POINT, start=10.0, end=12.0, strength=0.1,
        box=(0.70, 0.04, 0.25, 0.18),
    )
    assert ScreenUse(cues=[floja]).busy(10.0, 12.0) == []


# -- y el modo ---------------------------------------------------------------


def _transcript(temas) -> Transcript:
    segmentos = []
    for texto, inicio in temas:
        t = inicio
        palabras = []
        for p in texto.split():
            palabras.append(Word(start=round(t, 2), end=round(t + 0.35, 2), text=p))
            t += 0.45
        segmentos.append(TranscriptSegment(start=inicio, end=t, text=texto, words=palabras))
    return Transcript(language="es", segments=segmentos)


TEMAS = [
    ("vamos a configurar el router de la casa", 0.0),
    ("el router necesita la contrasena wifi", 40.0),
    ("ahora abrimos el panel de google chrome", 80.0),
    ("en chrome buscamos la pagina de ajustes", 120.0),
    ("la base de datos guarda toda la informacion", 160.0),
    ("esa base tiene que estar protegida", 200.0),
    ("por ultimo revisamos el firewall del sistema", 240.0),
]


@pytest.fixture
def montaje(tmp_path):
    a = synthetic_guide_analysis(300.0)
    a.transcript = _transcript(TEMAS)
    for nombre in ("router-wifi-casa.mp4", "google-chrome-navegador.jpg",
                   "base-de-datos-servidor.mp4", "firewall-seguridad.png"):
        (tmp_path / nombre).write_bytes(b"x" * 100)
    edl = build_edl(a, "tutorial")
    proveedores = build_providers(a, local_dir=tmp_path, allow_network=False)
    return a, edl, proveedores


def _planear(montaje, screen):
    a, edl, proveedores = montaje
    return plan_broll(
        edl, a.transcript, proveedores, load_style("tutorial").broll,
        AssetBundle(), screen=screen,
    )[0]


def test_si_senalas_algo_el_material_no_tapa_la_pantalla(montaje) -> None:
    """Y asi deja de perderse: antes `conflicts.py` lo tiraba entero."""
    a, edl, _ = montaje
    completos = _planear(montaje, None)
    assert completos, "hace falta material para poder comparar"
    assert any(e.mode == "full" for e in completos)

    # Ahora se senala algo durante todo el video.
    senales = [
        SpeechCue(kind=CueKind.POINT, start=t, end=t + 30.0, strength=0.9,
                  box=(0.70, 0.04, 0.25, 0.18))
        for t in range(0, 300, 30)
    ]
    con_senal = _planear(montaje, ScreenUse(cues=senales))
    assert con_senal
    assert all(e.mode != "full" for e in con_senal)
    # Y la ventanita se aparta de lo senalado.
    assert all(e.rect.x + e.rect.w <= 0.70 + 1e-6 for e in con_senal)
    assert any("no te tapo" in e.rationale for e in con_senal)


def test_sin_datos_de_pantalla_se_comporta_igual_que_antes(montaje) -> None:
    """Un analisis sin `cues` ni puntero no puede cambiar el montaje."""
    sin_nada = _planear(montaje, ScreenUse(cues=[], cursor=None))
    igual = _planear(montaje, None)
    assert [(e.start, e.mode, e.asset_id) for e in sin_nada] == [
        (e.start, e.mode, e.asset_id) for e in igual
    ]


# -- y hasta cuando se queda ------------------------------------------------


def test_el_tema_no_acaba_donde_acaba_la_ventana() -> None:
    """Las tres reglas de hasta cuando se queda el material, una por una.

    Importa desde que el material entra **en la palabra**: la palabra suele
    caer al final de la ventana, y cortar ahi dejaba las inserciones sin sitio.
    Pero el limite de verdad no es la ventana ni el tema: es el instante en que
    nombras **otra cosa**.
    """
    from forge.plan.broll import MAX_OVERFLOW, TopicMoment

    def momento(**kw) -> TopicMoment:
        base = dict(start=10.0, end=16.0, query="impresora papel", score=0.8,
                    context="", head_at=15.0)
        return TopicMoment(**{**base, **kw})

    # 1. Sigues nombrando lo mismo: el material llega hasta donde llega el tema.
    assert momento(topic_end=22.0).room_until == 22.0

    # 2. Nada nuevo a la vista: un margen corto tras rematar la frase.
    assert momento(next_topic_at=30.0).room_until == 16.0 + MAX_OVERFLOW

    # 3. Nombras otra cosa: se acaba ahi, aunque el tema siguiera vivo. Se
    #    puede hablar de dos cosas a la vez; ilustrar la de antes mientras
    #    nombras la nueva es justo el fallo que se estaba arreglando.
    assert momento(topic_end=22.0, next_topic_at=17.5).room_until == 17.5


def test_en_una_guia_de_verdad_manda_casi_siempre_la_cosa_siguiente() -> None:
    """Y conviene saberlo: en una guia se nombra algo nuevo cada pocos segundos."""
    a = synthetic_guide_analysis(duration=300.0)
    edl = build_edl(a, "tutorial")
    momentos = find_topic_moments(edl, a.transcript)
    assert [m for m in momentos if m.topic_end > m.end], "hay temas que cruzan"
    for m in momentos:
        assert m.room_until >= m.end - 1e-6 or m.room_until == m.next_topic_at


def test_el_material_se_va_cuando_nombras_otra_cosa() -> None:
    """El limite de verdad, y no el final de una frase."""
    a = synthetic_guide_analysis(duration=300.0)
    edl = build_edl(a, "tutorial")
    for m in find_topic_moments(edl, a.transcript):
        if m.next_topic_at > 0:
            assert m.room_until <= m.next_topic_at + 1e-6


def test_entrar_en_la_palabra_casi_no_cuesta_inserciones() -> None:
    """La medida del efecto secundario que tuvo entrar en la palabra.

    Colocar el material en la palabra (que cae tarde en la ventana) dejaba 2 de
    31 momentos sin hueco suficiente y acortaba la media un 13%. Dejar que siga
    mientras no nombres otra cosa devuelve uno de los dos y casi toda la
    duracion; el que queda se pierde a proposito, porque ahi ya estas nombrando
    otra cosa y el material sobraba.
    """
    from forge.plan.styles import load_style

    a = synthetic_guide_analysis(duration=300.0)
    edl = build_edl(a, "tutorial")
    momentos = find_topic_moments(edl, a.transcript)
    reglas = load_style("tutorial").broll
    pausas = [
        t for t in (edl.source_to_timeline(p) for p in _pauses(a.transcript))
        if t is not None
    ]

    def caben(hasta_de) -> tuple[int, float]:
        duraciones = []
        for m in momentos:
            hasta = hasta_de(m)
            dur = min(reglas.default_seconds, hasta - m.start)
            if dur < 1.0:
                continue
            inicio = _snap(pausas, m.head_at or m.start)
            inicio = min(max(inicio, m.start), max(m.start, hasta - 1.2))
            dur = min(dur, max(0.0, hasta - inicio))
            if dur >= 1.2:
                duraciones.append(dur)
        return len(duraciones), sum(duraciones) / len(duraciones)

    cortando, media_cortando = caben(lambda m: m.end)
    ahora, media_ahora = caben(lambda m: m.room_until)
    assert ahora > cortando
    assert ahora >= len(momentos) - 1
    assert media_ahora > media_cortando
