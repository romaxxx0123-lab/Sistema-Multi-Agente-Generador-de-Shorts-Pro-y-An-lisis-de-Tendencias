"""Donde cambia el tema, mirando de que se habla.

Los capitulos salian de dos senales: las formulas de enlace ("ahora vamos a") y
las **pausas largas**. La primera es buena. La segunda es un apano, y este
fichero es la medida de lo malo que era: en una guia de tres temas escrita a
proposito **sin una sola formula de enlace**, las pausas largas no encuentran
ninguno de los dos cambios y se inventan seis; y en un video de un solo tema se
inventan quince capitulos.

No es raro: en una guia se respira hondo cada poco, para pensar, para beber
agua, mientras el ordenador trabaja. Una pausa dice que has respirado.

La senal que si dice algo es el **vocabulario**. Mientras hablas de instalar el
driver dices "driver", "tarjeta", "version"; cuando pasas al microfono esas
palabras desaparecen y aparecen otras. Comparar el vocabulario de dos ventanas
consecutivas da una curva, y los valles de esa curva son los cambios de tema.
Es TextTiling (Hearst, 1997), de antes de las redes neuronales, y funciona
porque mide algo real.
"""

from __future__ import annotations

import pytest

from forge.analysis.types import Transcript, TranscriptSegment, Word
from forge.understand.topics import find_boundaries, label

#: Una guia de tres temas SIN NINGUNA formula de enlace. Nadie dice "ahora
#: vamos a" ni "el siguiente paso": un editor humano ve los tres bloques a la
#: primera, y hay que verlos por lo que se habla.
TEMAS = [
    [
        "lo que tenemos delante es la pagina de descargas de nvidia",
        "aqui hay que elegir el modelo exacto de la tarjeta grafica",
        "si pones un modelo que no es el tuyo el driver no instala",
        "la version que interesa es la estudio si trabajas con video",
        "la game ready esta pensada para jugar y cambia cada semana",
        "descargo el instalador del driver y lo abro",
        "el instalador pregunta si quieres una instalacion limpia",
        "una instalacion limpia borra los perfiles antiguos del driver",
        "eso quita muchos problemas raros de la tarjeta grafica",
        "durante la instalacion la pantalla parpadea un par de veces",
        "es normal porque el driver reinicia el modo de video",
        "al terminar conviene comprobar la version del driver instalado",
    ],
    [
        "el microfono que uso es un condensador conectado por usb",
        "en el panel de sonido aparece como dispositivo de entrada",
        "el nivel de entrada del microfono viene muy alto de fabrica",
        "si el nivel satura la voz suena rota y no hay quien lo arregle",
        "bajo la ganancia hasta que los picos de voz queden a menos doce",
        "el monitor de nivel tiene que moverse en la zona verde",
        "conviene activar el filtro de graves para quitar el retumbe",
        "el retumbe entra por la mesa cuando escribes con el teclado",
        "una pantalla antipop delante del microfono quita las pes",
        "hablo siempre a la misma distancia del microfono",
        "si me acerco mucho la voz gana graves y se emborrona",
        "grabo treinta segundos de prueba y escucho el resultado",
    ],
    [
        "el proyecto terminado se exporta desde el menu de archivo",
        "el formato que sube mejor a youtube es mp cuatro",
        "la tasa de bits para mil ochenta esta bien en dieciseis megas",
        "en cuatro ka hay que subir la tasa de bits bastante mas",
        "el audio se exporta en aac a ciento noventa y dos kilobits",
        "la exportacion tarda segun lo larga que sea la linea de tiempo",
        "cuando acaba el fichero queda en la carpeta de salida",
        "subo el fichero al estudio de youtube arrastrandolo",
        "mientras se sube se puede ir escribiendo el titulo",
        "la miniatura se cambia despues aunque el video ya este subido",
        "la descripcion admite marcas de tiempo para los capitulos",
        "el video queda oculto hasta que le doy a publicar",
    ],
]

#: Y pausas largas **donde no cambia el tema**, que es lo que pasa de verdad al
#: hablar: se respira hondo en mitad de una explicacion.
PAUSAS_ENGANOSAS = {(0, 4), (0, 8), (1, 3), (1, 7), (2, 5), (2, 9)}

PAUSA_NORMAL, PAUSA_LARGA, PALABRA = 0.35, 1.6, 0.42
#: El umbral con el que se abria capitulo por pausa.
TOPIC_GAP = 1.1
#: Margen para dar por bueno un cambio de tema encontrado.
TOLERANCIA = 8.0


def _montar(temas: list[list[str]], pausas: set) -> tuple[Transcript, list[float]]:
    palabras, segmentos, t = [], [], 0.0
    verdad: list[float] = []
    for i, tema in enumerate(temas):
        if i:
            verdad.append(round(t, 2))
        for j, frase in enumerate(tema):
            ws = []
            for p in frase.split():
                ws.append(Word(start=round(t, 2), end=round(t + PALABRA * 0.8, 2), text=p))
                t += PALABRA
            segmentos.append(TranscriptSegment(
                start=ws[0].start, end=ws[-1].end, text=frase, words=ws
            ))
            palabras += ws
            t += PAUSA_LARGA if (i, j) in pausas else PAUSA_NORMAL
    return Transcript(language="es", segments=segmentos), verdad


def _por_pausas(transcript: Transcript) -> list[float]:
    ws = transcript.words
    return [
        round(b.start, 2)
        for a, b in zip(ws, ws[1:])
        if b.start - a.end >= TOPIC_GAP
    ]


def _aciertos(encontrados: list[float], verdad: list[float]) -> tuple[int, int]:
    ok = sum(1 for v in verdad if any(abs(c - v) <= TOLERANCIA for c in encontrados))
    inventados = sum(
        1 for c in encontrados if all(abs(c - v) > TOLERANCIA for v in verdad)
    )
    return ok, inventados


# -- lo que se gana -------------------------------------------------------


def test_encuentra_los_cambios_de_tema_sin_una_sola_formula() -> None:
    transcript, verdad = _montar(TEMAS, PAUSAS_ENGANOSAS)
    fronteras = find_boundaries(transcript, min_seconds=30.0)

    ok, inventados = _aciertos([f.time for f in fronteras], verdad)
    assert ok == len(verdad), f"encuentra {ok} de {len(verdad)}"
    assert inventados == 0, f"se inventa {inventados}"


def test_las_pausas_no_encontraban_ninguno() -> None:
    """El punto de comparacion, para que la mejora no sea una opinion."""
    transcript, verdad = _montar(TEMAS, PAUSAS_ENGANOSAS)

    ok, inventados = _aciertos(_por_pausas(transcript), verdad)
    assert ok == 0 and inventados >= 5, (
        "si las pausas empiezan a acertar, este fichero deja de medir nada"
    )


def test_un_video_de_un_solo_tema_no_fabrica_capitulos() -> None:
    """Lo importante de los dos criterios de profundidad.

    Un video monotematico siempre tiene un valle que es el mas profundo de los
    suyos, asi que un criterio solo relativo le inventaba un capitulo igual.
    """
    uno = [TEMAS[0] * 3]
    transcript, _ = _montar(uno, {(0, j) for j in range(0, 36, 3)})

    assert find_boundaries(transcript, min_seconds=30.0) == []
    assert len(_por_pausas(transcript)) >= 10, "las pausas si se lo inventaban"


def test_dice_que_deja_de_decirse_y_que_empieza_a_decirse() -> None:
    """Sin explicacion no se puede revisar, y esto se equivoca a veces."""
    transcript, _ = _montar(TEMAS, PAUSAS_ENGANOSAS)
    frontera = find_boundaries(transcript, min_seconds=30.0)[0]

    assert frontera.before and frontera.after
    assert set(frontera.before) != set(frontera.after)
    assert "cambia el tema" in frontera.rationale


def test_el_corte_cae_al_principio_de_una_frase() -> None:
    """Un capitulo que empieza a mitad de frase se lee como un fallo."""
    transcript, _ = _montar(TEMAS, PAUSAS_ENGANOSAS)
    inicios = {round(f.words[0].start, 2) for f in transcript.segments}

    for frontera in find_boundaries(transcript, min_seconds=30.0):
        assert round(frontera.time, 2) in inicios, frontera


# -- titular por el asunto, no por como empieza la frase ------------------


def test_titula_con_lo_que_este_tramo_dice_y_los_demas_no() -> None:
    propios = [" ".join(TEMAS[1])]
    ajenos = [" ".join(TEMAS[0] + TEMAS[2])]

    titulo = label(propios, ajenos, 3).lower()
    assert "microfono" in titulo or "nivel" in titulo, titulo
    # Y no con lo que dicen todos.
    assert "video" not in titulo and "pantalla" not in titulo


def test_el_titulo_sale_en_palabras_que_se_puedan_leer() -> None:
    """Las raices sirven para comparar y no para titular: "instal driv" no."""
    titulo = label([" ".join(TEMAS[0])], [" ".join(TEMAS[2])], 3)
    assert titulo
    for palabra in titulo.lower().split():
        assert len(palabra) >= 4
        # Una raiz cortada no es una palabra de la frase; estas si lo son.
        assert palabra in " ".join(TEMAS[0]).lower()


@pytest.mark.parametrize("frases", [[], ["hola"], ["hola que tal"] * 3])
def test_sin_material_suficiente_no_se_inventa_nada(frases) -> None:
    transcript, _ = _montar([frases] if frases else [], set())
    assert find_boundaries(transcript) == []
