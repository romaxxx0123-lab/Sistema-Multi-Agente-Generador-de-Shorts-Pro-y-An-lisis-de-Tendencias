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


def test_los_subtitulos_cuentan_como_ocupado() -> None:
    """Una ventanita abajo tapa los subtitulos, que tambien son lo que dices."""
    banda = Rect(x=0.0, y=1.0 - CAPTION_BAND, w=1.0, h=CAPTION_BAND)
    # Con algo arriba a la derecha y a la izquierda, lo unico libre es abajo...
    # pero abajo estan los subtitulos, asi que gana la menos mala de arriba.
    colocado, _ = place(BASE, [banda])
    assert colocado.y + colocado.h <= 1.0 - CAPTION_BAND + 1e-6


def test_el_puntero_tambien_cuenta() -> None:
    """Donde esta el puntero es donde estas mirando: ahi no se tapa."""

    class _Puntero:
        def at(self, t):
            return (0.88, 0.10)   # arriba a la derecha

    pantalla = ScreenUse(cues=[], cursor=_Puntero(), captions=False)
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
    assert ScreenUse(cues=[floja], captions=False).busy(10.0, 12.0) == []


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
    con_senal = _planear(montaje, ScreenUse(cues=senales, captions=True))
    assert con_senal
    assert all(e.mode != "full" for e in con_senal)
    # Y la ventanita se aparta de lo senalado.
    assert all(e.rect.x + e.rect.w <= 0.70 + 1e-6 for e in con_senal)
    assert any("no te tapo" in e.rationale for e in con_senal)


def test_sin_datos_de_pantalla_se_comporta_igual_que_antes(montaje) -> None:
    """Un analisis sin `cues` ni puntero no puede cambiar el montaje."""
    sin_nada = _planear(montaje, ScreenUse(cues=[], cursor=None, captions=False))
    igual = _planear(montaje, None)
    assert [(e.start, e.mode, e.asset_id) for e in sin_nada] == [
        (e.start, e.mode, e.asset_id) for e in igual
    ]
