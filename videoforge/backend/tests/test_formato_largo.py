"""Tests del caso de uso real: una guia de veinte minutos.

Casi todo lo demas se prueba sobre un video de un minuto, y eso esconde una
clase entera de problemas: los que solo aparecen al **acumular**. Un ritmo que
en un minuto es agradable, sostenido veinte, cansa; una regla con un numero fijo
de segundos que funciona en un video corto se descuadra en uno largo.

Los tres que se encontraron asi, y que estos tests fijan:

- **Sesenta zooms.** El estilo permitia 3,5 por minuto, que en un minuto son
  tres y en veinte minutos son sesenta: un zoom cada diecisiete segundos durante
  toda la guia. Y el medidor de saturacion ni se enteraba, porque **no tenia una
  metrica de zooms**: solo los veia diluidos en la densidad general.
- **Veinte capitulos.** La duracion minima de un capitulo era fija (45 s), asi
  que cuanto mas largo el video, mas capitulos. Veinte capitulos no orientan a
  nadie, y ademas plantaban veinte rotulos en pantalla.
- **Subtitulos recortados.** Quitado el silencio, la voz ocupa el 95% del
  montaje, asi que los subtitulos tambien. Eso se salia de la banda de texto en
  pantalla, y lo unico que mueve esa metrica son los propios subtitulos: el
  balanceador se ponia a quitar justo lo que hay que conservar.

Aqui no se genera el video de veinte minutos (cuesta minutos): se construye el
**montaje** a esa escala, que es donde estan los tres fallos.
"""

from __future__ import annotations

import pytest

from forge.analysis.types import Transcript, TranscriptSegment, Word
from forge.fixtures import synthetic_guide_analysis
from forge.plan.chapters import MAX_CHAPTERS
from forge.plan.edl import EffectKind
from forge.plan.planner import build_edl
from forge.plan.styles import load_style
from forge.saturation.balance import NEVER_PRUNE, rebalance
from forge.saturation.score import evaluate

#: Veinte minutos.
LARGO = 1200.0


def _transcript_largo(duracion: float) -> Transcript:
    """Habla continua con pausas, como una guia de verdad."""
    segmentos = []
    t = 0.5
    i = 0
    while t < duracion - 6.0:
        palabras = []
        for p in ("vamos", "a", "ver", "el", "apartado", f"numero{i}", "de", "la", "configuracion"):
            palabras.append(Word(start=round(t, 3), end=round(t + 0.32, 3), text=p))
            t += 0.42
        segmentos.append(
            TranscriptSegment(start=palabras[0].start, end=palabras[-1].end,
                              text=" ".join(w.text for w in palabras), words=palabras)
        )
        # Pausa corta casi siempre, larga de vez en cuando (cambio de tema).
        t += 1.6 if i % 7 == 6 else 0.35
        i += 1
    return Transcript(language="es", segments=segmentos)


@pytest.fixture(scope="module")
def guia_larga():
    a = synthetic_guide_analysis(LARGO)
    a.transcript = _transcript_largo(LARGO)
    return a


@pytest.fixture(scope="module")
def montaje_largo(guia_larga):
    return build_edl(guia_larga, "tutorial")


# -- ritmo sostenido -------------------------------------------------------


def test_el_ritmo_de_zoom_aguanta_veinte_minutos(montaje_largo) -> None:
    zooms = len(montaje_largo.effects_of(EffectKind.PUNCH_IN))
    por_minuto = zooms / (montaje_largo.duration / 60)
    assert por_minuto <= 2.0, (
        f"{zooms} zooms en {montaje_largo.duration / 60:.0f} minutos "
        f"({por_minuto:.1f} por minuto) es un zoom cada {60 / por_minuto:.0f} s sin parar"
    )


def test_el_medidor_ve_los_zooms(montaje_largo, guia_larga) -> None:
    """Sin esta metrica, sesenta zooms le parecian normales."""
    reporte = evaluate(montaje_largo, guia_larga)
    lectura = next((r for r in reporte.readings if r.name == "zooms_per_minute"), None)
    assert lectura is not None, "el motor de saturacion no mide los zooms"
    assert lectura.value == pytest.approx(
        len(montaje_largo.effects_of(EffectKind.PUNCH_IN))
        / (montaje_largo.duration / 60), abs=0.01
    )


def test_todos_los_estilos_declaran_su_banda_de_zoom() -> None:
    for nombre in ("tutorial", "documentary", "cinematic", "vlog",
                   "gaming-hype", "clean-corporate"):
        estilo = load_style(nombre)
        assert estilo.band("zooms_per_minute") is not None, nombre


# -- capitulos que orientan ------------------------------------------------


def test_un_video_largo_no_se_llena_de_capitulos(montaje_largo) -> None:
    assert montaje_largo.chapters, "veinte minutos deberian tener capitulos"
    assert len(montaje_largo.chapters) <= MAX_CHAPTERS, (
        f"{len(montaje_largo.chapters)} capitulos en "
        f"{montaje_largo.duration / 60:.0f} minutos: uno cada "
        f"{montaje_largo.duration / 60 / len(montaje_largo.chapters):.1f} min"
    )


def test_hay_un_rotulo_por_capitulo_y_no_mas(montaje_largo) -> None:
    rotulos = montaje_largo.effects_of(EffectKind.TEXT_CARD)
    assert len(rotulos) == len(montaje_largo.chapters)


def test_el_capitulo_minimo_crece_con_el_video(guia_larga) -> None:
    """La misma regla fija que daba 20 capitulos aqui daria 2 en un video corto."""
    corto = synthetic_guide_analysis(300.0)
    corto.transcript = _transcript_largo(300.0)
    edl_corto = build_edl(corto, "tutorial")
    edl_largo = build_edl(guia_larga, "tutorial")

    def _media(edl) -> float:
        return edl.duration / max(1, len(edl.chapters))

    assert _media(edl_largo) > _media(edl_corto), (
        "en un video mas largo los capitulos tienen que ser mas largos, no mas"
    )


# -- los subtitulos no son decoracion --------------------------------------


def test_el_balanceador_no_quita_subtitulos() -> None:
    assert EffectKind.CAPTION in NEVER_PRUNE


def test_una_guia_larga_conserva_todos_sus_subtitulos(montaje_largo, guia_larga) -> None:
    antes = len(montaje_largo.effects_of(EffectKind.CAPTION))
    assert antes > 100, "el montaje de prueba deberia estar lleno de subtitulos"

    copia = montaje_largo.model_copy(deep=True)
    rebalance(copia, guia_larga)
    assert len(copia.effects_of(EffectKind.CAPTION)) == antes


def test_la_banda_de_texto_admite_una_guia_hablada(montaje_largo, guia_larga) -> None:
    """Quitado el silencio, el texto en pantalla ronda el 95%: es lo normal."""
    reporte = evaluate(montaje_largo, guia_larga)
    lectura = next(r for r in reporte.readings if r.name == "text_coverage")
    assert lectura.band.contains(lectura.value), (
        f"cobertura de texto {lectura.value:.2f} fuera de "
        f"{lectura.band.lo}-{lectura.band.hi} en una guia hablada"
    )


# -- el conjunto -----------------------------------------------------------


def test_el_montaje_de_veinte_minutos_sigue_siendo_sobrio(montaje_largo, guia_larga) -> None:
    reporte = evaluate(montaje_largo, guia_larga)
    assert reporte.in_the_pocket, f"{reporte.score}/100 {reporte.verdict}"
    assert not reporte.is_oversaturated


def test_no_se_pasa_recortando_en_formato_largo(montaje_largo) -> None:
    """Cuanto recorta depende del material; lo que se fija aqui es el tope.

    El porcentaje real se mide sobre la guia generada de veinte minutos, que no
    cabe en la suite porque cuesta minutos generarla: ahi el montaje pasa de
    20,0 a 17,1 minutos, un -15%. Este fixture tiene poco tiempo muerto, asi que
    aqui lo unico comprobable es que recorta algo y que no se desboca.
    """
    assert montaje_largo.compression > 0.0, "no recorto nada"
    assert montaje_largo.compression < 0.4, (
        f"recorto un {montaje_largo.compression:.0%}, se esta comiendo el video"
    )
    # Y la linea de tiempo sigue siendo continua y creciente: con 251 clips,
    # un solapamiento o un hueco pasaria desapercibido en cualquier otra medida.
    bordes = [(c.source_start, c.source_end) for c in montaje_largo.timeline]
    assert all(b > a for a, b in bordes), "algun clip esta invertido"
    assert all(
        bordes[i][1] <= bordes[i + 1][0] for i in range(len(bordes) - 1)
    ), "dos clips se solapan en el original"


# -- titulos de capitulo ---------------------------------------------------


def test_el_titulo_no_se_queda_en_el_arranque_de_la_frase() -> None:
    """Un capitulo titulado "Siguiente punto los proyectos" no dice nada.

    Los titulos van a la descripcion de YouTube tal cual, asi que son lo mas
    visible que produce el planner fuera del propio video.
    """
    from forge.plan.chapters import _clean_title

    class _W:
        def __init__(self, texto: str) -> None:
            self.text = texto

    def titulo(frase: str) -> str:
        return _clean_title([_W(p) for p in frase.split()])

    assert titulo("siguiente punto los proyectos del apartado dos") == (
        "Los proyectos del apartado dos"
    )
    assert titulo("bueno vamos a ver el limite de memoria") == "El limite de memoria"
    assert titulo("por ultimo guardamos los cambios") == "Guardamos los cambios"


def test_el_titulo_no_acaba_en_una_palabra_de_funcion() -> None:
    from forge.plan.chapters import _clean_title

    class _W:
        def __init__(self, texto: str) -> None:
            self.text = texto

    for frase in ("ahora se abre el panel de la",
                  "vamos a revisar el limite de",
                  "entonces pulsamos el boton y"):
        titulo = _clean_title([_W(p) for p in frase.split()])
        assert titulo.split()[-1].lower() not in ("de", "la", "y", "el", "del"), titulo


def test_si_no_queda_frase_se_titula_por_lo_que_dice() -> None:
    """"Bueno, vale, pues nada" no da titulo; los terminos propios si."""
    from forge.plan.chapters import _titles_for

    class _W:
        def __init__(self, texto: str) -> None:
            self.text = texto

    def bloque(frase: str):
        return [_W(p) for p in frase.split()]

    titulos = _titles_for([
        bloque("bueno vale pues"),
        bloque("configuramos el cortafuegos del servidor de casa"),
    ])
    assert "cortafuegos" not in titulos[0].lower()
    assert titulos[0] != "Pues", f"deberia haber tirado de terminos propios: {titulos[0]}"


def test_los_titulos_de_una_guia_larga_son_legibles(montaje_largo) -> None:
    for c in montaje_largo.chapters:
        assert c.title and c.title != "Capitulo", "capitulo sin titulo"
        assert len(c.title) <= 60, c.title
        assert c.title[0].isupper(), c.title
