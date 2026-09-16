"""El rotulo que dice donde estas: caja de color con el nombre de la seccion.

La idea es la de television -- un rectangulo con texto que te situa -- y el
texto no es una plantilla: es el titulo que el sistema dedujo **de lo que
dices**. El tipo `LowerThirdEffect` estaba en el esquema desde F2 y no lo
planificaba ni lo dibujaba nadie.

Lo dificil de esto no es dibujarlo, es **no ponerlo**. Un rotulo mal puesto es
peor que ninguno, y se puede poner mal de tres maneras: diciendo dos veces lo
mismo (la tarjeta de capitulo ya dice el titulo al empezar), poniendolo donde no
hace falta (en una seccion corta nadie se ha perdido) y poniendolo encima de lo
que estas ensenando.
"""

from __future__ import annotations

import subprocess

import numpy as np
import pytest

from forge.analysis.frames import extract_frames_at
from forge.config import Settings
from forge.fixtures import synthetic_guide_analysis
from forge.plan.edl import (
    EDL,
    Chapter,
    Clip,
    EffectKind,
    LowerThirdEffect,
    Rect,
    RenderSpec,
    TextCardEffect,
)
from forge.analysis.types import Transcript, TranscriptSegment, Word
from forge.plan.labels import (
    LABEL_WORDS,
    _caja,
    _es_concreto,
    _se_parecen,
    plan_labels,
)
from forge.plan.placement import ScreenUse
from forge.plan.planner import build_edl
from forge.plan.styles import load_style
from forge.render.ass import build_ass, parse_hex
from forge.render.renderer import render
from forge.tools import ffmpeg_bin
from forge.understand.speech_cues import CueKind, SpeechCue


def _edl(chapters, duration: float = 600.0) -> EDL:
    return EDL(
        source="a.mp4", source_duration=duration, style="tutorial",
        render=RenderSpec(width=1920, height=1080, fps=30.0),
        timeline=[Clip(id="c0", source_start=0.0, source_end=duration)],
        chapters=list(chapters),
    )


# -- cuando SI ---------------------------------------------------------------


#: Dos secciones, que es lo minimo para que un rotulo conteste algo.
DOS = [
    Chapter(start=0.0, title="Expediciones Palworld"),
    Chapter(start=300.0, title="Cocina de pociones"),
]


def test_una_seccion_larga_con_nombre_concreto_lleva_rotulo() -> None:
    edl = _edl(DOS)
    rotulo = plan_labels(edl, load_style("tutorial"))[0]
    assert rotulo.title == "Expediciones Palworld"
    assert rotulo.color.startswith("#")


def test_no_sale_encima_de_la_tarjeta_del_capitulo() -> None:
    """La tarjeta anuncia el cambio; el rotulo recuerda donde estas.

    Decir las dos cosas a la vez no informa el doble, estorba el doble.
    """
    estilo = load_style("tutorial")
    rotulo = plan_labels(_edl(DOS), estilo)[0]
    assert rotulo.start > estilo.chapters.card_seconds + 1.0


# -- como se llama la seccion -------------------------------------------------


def _transcript(frases) -> Transcript:
    segmentos = []
    for texto, inicio in frases:
        t = inicio
        palabras = []
        for palabra in texto.split():
            palabras.append(Word(start=round(t, 2), end=round(t + 0.35, 2), text=palabra))
            t += 0.45
        segmentos.append(TranscriptSegment(start=inicio, end=t, text=texto, words=palabras))
    return Transcript(language="es", segments=segmentos)


def test_el_nombre_sale_de_lo_que_dices_ahi_y_no_del_titulo() -> None:
    """El fallo de la primera version: el titulo de un capitulo es una FRASE.

    Salian rotulos como "El siguiente paso es el importante", y eso no situa a
    nadie. Un rotulo es un nombre; el ejemplo a imitar tiene dos palabras.
    """
    edl = _edl([
        Chapter(start=0.0, title="Bueno vamos a ver esto que es importante"),
        Chapter(start=300.0, title="Y ahora lo siguiente que toca"),
    ])
    transcript = _transcript([
        ("configuramos el router wifi de casa", 10.0),
        ("el router lleva su contrasena wifi", 60.0),
        ("ahora revisamos el firewall del sistema", 310.0),
        ("el firewall bloquea las conexiones", 360.0),
    ])
    rotulos = plan_labels(edl, load_style("tutorial"), transcript=transcript)

    assert rotulos
    for r in rotulos:
        assert len(r.title.split()) <= LABEL_WORDS, r.title
        assert r.title[0].isupper()
    nombres = " ".join(r.title.lower() for r in rotulos)
    assert "router" in nombres or "firewall" in nombres


def test_sin_transcripcion_se_cae_al_titulo_recortado() -> None:
    edl = _edl([
        Chapter(start=0.0, title="Expediciones Palworld nocturnas"),
        Chapter(start=300.0, title="Otra seccion distinta"),
    ])
    rotulos = plan_labels(edl, load_style("tutorial"))
    assert rotulos[0].title == "Expediciones Palworld"


def test_la_caja_se_mide_por_el_texto() -> None:
    """Reservarle a "Firewall" el mismo hueco que a "Expediciones Palworld"
    hace que la decision de donde ponerlo se tome con un tamano que no es."""
    corto, _ = _caja("Firewall")
    largo, _ = _caja("Expediciones Palworld")
    assert corto < largo


def test_no_se_repite_lo_mismo_con_otras_palabras() -> None:
    assert _se_parecen("Seccion terminamos", "Terminamos seccion")
    assert _se_parecen("Ajustes abrimos", "Abrimos ajustes")
    assert not _se_parecen("Router wifi", "Firewall sistema")

    edl = _edl([
        Chapter(start=0.0, title="Primera seccion"),
        Chapter(start=200.0, title="Segunda seccion"),
        Chapter(start=400.0, title="Tercera seccion"),
    ])
    transcript = _transcript([
        ("abrimos los ajustes del router", 10.0),
        ("los ajustes del router otra vez", 210.0),
        ("ahora el firewall del sistema", 410.0),
    ])
    rotulos = plan_labels(edl, load_style("tutorial"), transcript=transcript)
    titulos = [r.title for r in rotulos]
    assert len(titulos) == len(set(titulos))
    for a, b in zip(titulos, titulos[1:]):
        assert not _se_parecen(a, b)


# -- cuando NO ---------------------------------------------------------------


def test_con_un_solo_capitulo_no_hay_nada_que_situar() -> None:
    """Un rotulo de seccion contesta "en cual estas". Si solo hay una, no
    contesta nada -- y encima el nombre sale mal, porque se calcula
    contrastando lo que se dice ahi con lo que se dice en el resto, y no hay
    resto: en una prueba salia "Chrome base", dos palabras de dos temas.
    """
    edl = _edl([Chapter(start=0.0, title="Expediciones Palworld")])
    assert plan_labels(edl, load_style("tutorial")) == []


def test_un_capitulo_que_es_casi_todo_el_video_tampoco() -> None:
    edl = _edl([
        Chapter(start=0.0, title="Expediciones Palworld"),
        Chapter(start=560.0, title="Un cierre muy corto"),
    ])
    rotulos = plan_labels(edl, load_style("tutorial"))
    assert all(r.start > 500.0 for r in rotulos) or rotulos == []


def test_en_una_seccion_corta_la_tarjeta_ya_basta() -> None:
    """Nadie se ha perdido todavia en cuarenta segundos."""
    edl = _edl([
        Chapter(start=0.0, title="Expediciones Palworld"),
        Chapter(start=40.0, title="Otra cosa distinta"),
    ], duration=80.0)
    assert plan_labels(edl, load_style("tutorial")) == []


@pytest.mark.parametrize("titulo", ["Parte 3 (2)", "vale", "ok", "", "  "])
def test_un_titulo_que_no_dice_nada_no_merece_rotulo(titulo: str) -> None:
    """`chapters.py` numera cuando no consigue sacar un nombre de lo que dices.

    Un rectangulo azul que ponga "Parte 3" no situa a nadie.
    """
    assert not _es_concreto(titulo)
    edl = _edl([Chapter(start=0.0, title=titulo),
                Chapter(start=300.0, title="Cocina de pociones")])
    assert not any(r.start < 300.0 for r in plan_labels(edl, load_style("tutorial")))


def test_sin_capitulos_no_hay_rotulos() -> None:
    assert plan_labels(_edl([]), load_style("tutorial")) == []


def test_se_puede_apagar_en_el_estilo() -> None:
    estilo = load_style("tutorial")
    estilo.labels.enabled = False
    assert plan_labels(_edl(DOS), estilo) == []


# -- donde -------------------------------------------------------------------


def test_se_aparta_de_lo_que_estas_senalando() -> None:
    """Misma regla que la ventanita de material: no tapar lo que ensenas."""
    edl = _edl(DOS)
    libre = plan_labels(edl, load_style("tutorial"))[0]

    estorbo = [SpeechCue(kind=CueKind.POINT, start=0.0, end=600.0, strength=0.9,
                         box=(libre.rect.x, libre.rect.y, 0.3, 0.2))]
    movido = plan_labels(edl, load_style("tutorial"),
                         ScreenUse(cues=estorbo))[0]
    assert (movido.rect.x, movido.rect.y) != (libre.rect.x, libre.rect.y)
    assert "movido" in movido.rationale


def test_un_broll_a_pantalla_completa_lo_deja_sin_sentido() -> None:
    """Debajo de un material a pantalla completa no se ve nada."""
    from forge.plan.conflicts import conflicts_with
    from forge.plan.edl import BrollEffect

    edl = _edl([Chapter(start=0.0, title="Expediciones Palworld")])
    edl.effects = [BrollEffect(id="b0", start=10.0, end=20.0, mode="full")]
    rotulo = LowerThirdEffect(id="l0", start=12.0, end=15.0, title="X")
    assert conflicts_with(edl, rotulo)


def test_no_coincide_con_la_tarjeta_de_un_capitulo() -> None:
    from forge.plan.conflicts import resolve

    edl = _edl([Chapter(start=0.0, title="Expediciones Palworld")])
    edl.effects = [
        TextCardEffect(id="card0", start=10.0, end=12.4, text="Otro capitulo"),
        LowerThirdEffect(id="l0", start=11.0, end=14.0, title="Expediciones"),
    ]
    notas = resolve(edl)
    assert [e.id for e in edl.effects] == ["card0"]
    assert notas


# -- en un montaje entero ----------------------------------------------------


@pytest.fixture(scope="module")
def guia():
    return synthetic_guide_analysis(duration=1200.0)


def test_una_guia_larga_lleva_unos_pocos(guia) -> None:
    """Unos pocos: uno por seccion larga, no uno cada dos minutos."""
    edl = build_edl(guia, "tutorial")
    rotulos = [e for e in edl.effects if e.kind is EffectKind.LOWER_THIRD]
    assert 1 <= len(rotulos) <= len(edl.chapters)
    assert all(_es_concreto(r.title) for r in rotulos)
    # Y no se pisan entre ellos.
    for a, b in zip(sorted(rotulos, key=lambda e: e.start),
                    sorted(rotulos, key=lambda e: e.start)[1:]):
        assert b.start > a.end


def test_el_medidor_los_cuenta_como_texto(guia) -> None:
    """Los rotulos de capitulo no se contaban en su dia; estos si."""
    from forge.saturation.metrics import TEXT_KINDS, compute_metrics

    assert EffectKind.LOWER_THIRD in TEXT_KINDS
    edl = build_edl(guia, "tutorial")
    assert compute_metrics(edl).text_coverage > 0


# -- y que se vea de verdad --------------------------------------------------


def test_el_rectangulo_sale_en_el_video(tmp_path, settings: Settings) -> None:
    """Render de verdad, y se miran los pixeles.

    Es la unica forma de saber que un rotulo existe: el proyecto ya tuvo
    rotulos de capitulo que se planificaban y no se dibujaban nunca.
    """
    fuente = tmp_path / "base.mp4"
    subprocess.run(
        [str(ffmpeg_bin(settings)), "-y", "-loglevel", "error",
         "-f", "lavfi", "-i", "color=c=0x303030:s=1280x720:r=25:d=6",
         "-f", "lavfi", "-i", "sine=frequency=300:duration=6",
         "-c:v", "libx264", "-crf", "22", "-pix_fmt", "yuv420p",
         "-c:a", "aac", str(fuente)],
        check=True, capture_output=True,
    )

    edl = EDL(
        source=str(fuente), source_duration=6.0, style="tutorial",
        render=RenderSpec(width=1280, height=720, fps=25.0),
        timeline=[Clip(id="c0", source_start=0.0, source_end=5.0)],
        effects=[LowerThirdEffect(
            id="l0", start=1.0, end=4.0, title="Expediciones Palworld",
            rect=Rect(x=0.05, y=0.08, w=0.34, h=0.09), color="#1f4fd8",
        )],
    )
    salida = render(edl, tmp_path / "out.mp4", settings, two_pass_audio=False)

    con, sin = extract_frames_at(salida.path, settings, [2.5, 4.8],
                                 width=1280, height=720)
    y, x = int(720 * 0.08), int(1280 * 0.05)
    caja = con[y:y + 60, x:x + 200].reshape(-1, 3).astype(int)
    vacio = sin[y:y + 60, x:x + 200].reshape(-1, 3).astype(int)

    # Donde va el rotulo hay azul, y donde ya no esta, no.
    azules = int(((caja[:, 2] - caja[:, 0]) > 40).sum())
    assert azules > len(caja) * 0.25, azules
    assert int(((vacio[:, 2] - vacio[:, 0]) > 40).sum()) == 0


def test_el_color_sale_del_estilo() -> None:
    assert parse_hex("#1f4fd8") == (31, 79, 216)
    assert parse_hex("nada") == (31, 79, 216)

    rotulo = LowerThirdEffect(id="l0", start=1.0, end=3.0, title="Palworld",
                              color="#cc2200")
    texto = build_ass([], 1920, 1080, labels=[rotulo])
    assert "Style: Label" in texto
    assert "\\3c&H000022CC" in texto      # BGR, que es como los quiere ASS


# -- lo que se aprendio mirando la salida -----------------------------------


def test_el_nombre_se_saca_del_tramo_correcto_del_video() -> None:
    """Los dos relojes, que aqui mordieron.

    Los capitulos van en tiempo de **montaje** y las palabras de la
    transcripcion en tiempo del **original**. Compararlos directamente parece
    funcionar -- el primer capitulo empieza en cero en los dos -- y se estropea
    segun avanza el video, porque el montaje ha quitado por el camino un tercio
    del original. El sintoma era un rotulo con palabras de otra seccion.
    """
    from forge.plan.labels import _nombre

    transcript = _transcript([
        ("el router wifi de la casa pide contrasena", 0.0),
        ("la impresora tiene papel atascado dentro", 100.0),
    ])

    class _Edl:
        """Un montaje que ha quitado 50 s por el camino."""

        @staticmethod
        def source_to_timeline(t: float) -> float:
            return t if t < 50.0 else t - 50.0

    capitulo = Chapter(start=50.0, title="lo siguiente")
    # En tiempo de montaje, 50-100 es la impresora (en el original, 100-150).
    nombre = _nombre(capitulo, 50.0, 100.0, transcript, _Edl())
    assert "mpresora" in nombre or "apel" in nombre, nombre
    assert "outer" not in nombre and "ifi" not in nombre, nombre


def test_un_rotulo_no_se_llama_con_un_verbo() -> None:
    """Un titulo de capitulo puede ser una accion; un rotulo dice un sitio."""
    from forge.plan.labels import _solo_nombres

    assert _solo_nombres("abrimos ajustes") == "ajustes"
    assert _solo_nombres("casilla marcar") == "casilla"
    # Si al quitar las acciones no queda nada, mas vale eso que ningun rotulo.
    assert _solo_nombres("vamos configurar") == "vamos configurar"


def test_se_juzga_el_nombre_que_se_ve_y_no_el_titulo() -> None:
    """El capitulo "De la impresora" no pasaba el filtro por tener una sola
    palabra larga, y su rotulo habria sido "Impresora", que esta bien."""
    from forge.plan.labels import _nombre

    class _Cap:
        title = "De la impresora"

    assert _nombre(_Cap(), 0.0, 10.0, None) == "Impresora"
    assert _es_concreto("Impresora")


def test_una_ventanita_no_se_pone_encima_de_un_rotulo() -> None:
    """Las dos cosas prefieren la misma esquina, asi que sin decirselo acaban
    una encima de la otra."""
    from forge.plan.placement import ScreenUse, corners, place

    rotulo = LowerThirdEffect(
        id="l0", start=10.0, end=14.0, title="Router wifi",
        rect=Rect(x=0.65, y=0.05, w=0.3, h=0.08),
    )
    base = corners(0.3, 0.4)[0][1]
    pantalla = ScreenUse(overlays=[rotulo])

    ocupado = pantalla.busy(5.0, 9.0, timeline=(11.0, 13.0))
    assert rotulo.rect in ocupado
    colocado, movida = place(base, ocupado)
    assert movida and colocado != base

    # Y fuera de su tramo, el rotulo no estorba a nadie.
    assert pantalla.busy(5.0, 9.0, timeline=(20.0, 22.0)) == []


def test_en_una_guia_con_temas_sale_uno_por_tema() -> None:
    """La prueba de fuego: una guia de router, impresora y firewall."""
    from forge.analysis.types import Transcript
    from forge.plan.planner import build_edl

    guion = (
        ["vamos a configurar el router wifi de la casa",
         "abrimos la pagina del router en el navegador",
         "el router pide una contrasena wifi nueva",
         "escribimos la contrasena wifi larga y segura",
         "el router guarda la contrasena y reinicia",
         "la wifi del router ya funciona con la contrasena"]
        + ["ahora vamos con la impresora de la oficina",
           "la impresora tiene papel atascado dentro",
           "sacamos el papel atascado de la impresora",
           "la bandeja de papel de la impresora va floja",
           "ponemos papel nuevo en la bandeja de la impresora",
           "la impresora ya imprime el papel sin atascarse"]
        + ["por ultimo el firewall del sistema operativo",
           "el firewall bloquea las conexiones raras de fuera",
           "abrimos las reglas del firewall del sistema",
           "cada regla del firewall deja pasar un puerto",
           "creamos una regla de firewall para ese puerto",
           "el firewall queda con sus reglas puestas"]
    )
    segmentos = []
    t = 0.0
    for texto in guion:
        palabras = []
        for palabra in texto.split():
            palabras.append(Word(start=round(t, 2), end=round(t + 0.38, 2), text=palabra))
            t += 0.48
        segmentos.append(
            TranscriptSegment(start=palabras[0].start, end=t, text=texto, words=palabras)
        )
        t += 22.0

    analisis = synthetic_guide_analysis(t + 30.0)
    analisis.transcript = Transcript(language="es", segments=segmentos)
    edl = build_edl(analisis, "tutorial")

    titulos = [e.title.lower() for e in edl.effects
               if e.kind is EffectKind.LOWER_THIRD]
    assert len(titulos) == 3, titulos
    assert any("router" in t for t in titulos)
    assert any("impresora" in t for t in titulos)
    assert any("firewall" in t for t in titulos)


# -- el marcador de velocidad ------------------------------------------------


def _con_espera(duracion_espera: float = 98.0):
    """Una guia donde anuncias una espera larga y el montaje la acelera."""
    from forge.analysis.types import SilenceRange, Transcript
    from forge.understand.speech_cues import find_all

    guion = [
        ("vamos a instalar el programa en el ordenador", 0.0),
        ("esto tarda un buen rato asi que espera", 12.0),
        ("ya esta instalado el programa del ordenador", 20.0 + duracion_espera),
        ("ahora configuramos las opciones del programa", 40.0 + duracion_espera),
    ]
    segmentos = []
    for texto, inicio in guion:
        t = inicio
        palabras = []
        for palabra in texto.split():
            palabras.append(Word(start=round(t, 2), end=round(t + 0.38, 2), text=palabra))
            t += 0.48
        segmentos.append(TranscriptSegment(start=inicio, end=t, text=texto, words=palabras))

    a = synthetic_guide_analysis(80.0 + duracion_espera)
    a.transcript = Transcript(language="es", segments=segmentos)
    a.cues = find_all(a.transcript, a.audio)
    a.audio.silences = [SilenceRange(start=20.0, end=20.0 + duracion_espera)]
    return a


def test_el_video_ya_no_se_acelera_en_silencio() -> None:
    """El fallo: el montaje pasaba una espera a 24x y no lo decia en ninguna
    parte. Eso no se lee como una decision de montaje, se lee como un fallo de
    reproduccion."""
    from forge.plan.planner import build_edl

    edl = build_edl(_con_espera(), "tutorial")

    acelerados = [c for c in edl.timeline if c.speed > 1.5]
    assert acelerados, "hace falta un tramo acelerado para que haya algo que decir"

    marcadores = [
        e for e in edl.effects
        if e.kind is EffectKind.LOWER_THIRD and e.title.startswith("x")
    ]
    assert len(marcadores) == len(acelerados)
    assert marcadores[0].title == "x24"        # 98s a 4s en pantalla
    assert any("velocidad" in n for n in edl.notes)


def test_el_marcador_dura_lo_que_dura_el_acelerado() -> None:
    from forge.plan.labels import fast_ranges
    from forge.plan.planner import build_edl

    edl = build_edl(_con_espera(), "tutorial")
    (tramo,) = fast_ranges(edl)
    marcador = next(e for e in edl.effects
                    if e.kind is EffectKind.LOWER_THIRD and e.title.startswith("x"))
    assert (marcador.start, marcador.end) == (round(tramo[0], 3), round(tramo[1], 3))


def test_el_marcador_no_se_puede_podar() -> None:
    """No compite por el presupuesto: explica algo que el montaje ya hizo.

    Si el balanceador se lo llevara, el video volveria a acelerarse en silencio.
    """
    from forge.plan.planner import build_edl
    from forge.saturation.balance import rebalance

    analisis = _con_espera()
    edl = build_edl(analisis, "tutorial")
    marcador = next(e for e in edl.effects
                    if e.kind is EffectKind.LOWER_THIRD and e.title.startswith("x"))
    assert marcador.locked

    rebalance(edl, analisis, intensity=0)      # la intensidad mas exigente
    assert any(e.id == marcador.id for e in edl.effects)


def test_un_acelerado_de_un_parpadeo_no_lleva_cartel() -> None:
    """Medio segundo a 8x no se percibe como una aceleracion, es un corte."""
    from forge.plan.edl import EDL, RenderSpec
    from forge.plan.labels import plan_speed_tags

    edl = EDL(
        source="a.mp4", source_duration=100.0, style="tutorial",
        render=RenderSpec(width=1920, height=1080, fps=30.0),
        timeline=[
            Clip(id="c0", source_start=0.0, source_end=10.0),
            Clip(id="c1", source_start=10.0, source_end=13.5, speed=8.0),  # 0.44s
            Clip(id="c2", source_start=20.0, source_end=30.0),
        ],
    )
    assert plan_speed_tags(edl, load_style("tutorial")) == []


def test_un_cambio_de_ritmo_pequeno_tampoco() -> None:
    from forge.plan.edl import EDL, RenderSpec
    from forge.plan.labels import plan_speed_tags

    edl = EDL(
        source="a.mp4", source_duration=100.0, style="tutorial",
        render=RenderSpec(width=1920, height=1080, fps=30.0),
        timeline=[Clip(id="c0", source_start=0.0, source_end=40.0, speed=1.2)],
    )
    assert plan_speed_tags(edl, load_style("tutorial")) == []


# -- el cartel dice de que va, no cuenta el video ---------------------------
#
# El cartel de capitulo llevaba el titulo entero --- "Hola en este video
# montamos la base de cero" --- y eso no es un cartel: no da tiempo a leerlo y
# encima tapa el video. Un cartel se lee de un vistazo o no se lee.


def test_el_cartel_lleva_una_palabra_no_la_frase() -> None:
    from forge.plan.chapters import chapter_cards, card_text
    from forge.plan.edl import Chapter
    from forge.plan.styles import ChapterRules

    capitulo = Chapter(
        start=0.0,
        title="Hola en este video montamos la base de cero",
        topic="Rutas tarda afinidad",
    )
    assert card_text(capitulo) == "Rutas", "ni la frase ni la lista de terminos"

    cartel = chapter_cards([capitulo], ChapterRules())[0]
    assert cartel.text == "Rutas"
    assert len(cartel.text.split()) <= 3, "un cartel se lee de un vistazo"


def test_sin_nombre_corto_no_hay_cartel() -> None:
    """Mas vale ninguno que uno que no dice nada.

    El capitulo sigue en la lista de YouTube --- ahi una frase se lee bien ---
    pero no pone cartel.
    """
    from forge.plan.chapters import chapter_cards
    from forge.plan.edl import Chapter
    from forge.plan.styles import ChapterRules

    sin_tema = Chapter(start=0.0, title="Bueno vamos a ver esto", topic="")
    assert chapter_cards([sin_tema], ChapterRules()) == []


def test_el_cartel_prefiere_lo_que_nombra_algo() -> None:
    """Un cartel dice donde estas, y para eso valen los nombres."""
    from forge.plan.chapters import card_text
    from forge.plan.edl import Chapter

    assert card_text(Chapter(start=0, title="x", topic="abrimos expediciones")) == (
        "expediciones"
    )


def test_el_estilo_puede_clavar_el_rotulo_en_una_esquina() -> None:
    """Un rotulo que sale cada vez en un sitio distinto no se reconoce.

    Con la esquina fija se pierde la posibilidad de esquivar lo que haya debajo,
    y esa es la decision.
    """
    from forge.plan.labels import _esquina_fija

    abajo_izq = _esquina_fija("abajo a la izquierda", 0.3, 0.08)
    assert abajo_izq is not None
    assert abajo_izq.x < 0.1, "a la izquierda"
    assert abajo_izq.y + abajo_izq.h > 0.9, "abajo"

    assert _esquina_fija("", 0.3, 0.08) is None, "sin pedir nada, donde no estorbe"
    assert _esquina_fija("en el techo", 0.3, 0.08) is None, "un nombre que no existe"


def test_el_estilo_palworld_los_pone_abajo_a_la_izquierda() -> None:
    from forge.plan.styles import load_style

    assert load_style("palworld").labels.corner == "abajo a la izquierda"
    assert load_style("tutorial").labels.corner == "", "el neutro sigue decidiendo"
