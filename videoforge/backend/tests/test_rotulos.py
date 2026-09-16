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
