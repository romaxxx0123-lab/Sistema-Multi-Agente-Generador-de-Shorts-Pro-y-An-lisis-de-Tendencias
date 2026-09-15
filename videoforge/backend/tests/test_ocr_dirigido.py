"""La pantalla se lee donde hablas de ella, no en una rejilla ciega.

El OCR se muestreaba cada N segundos para saber **de que va** el video: los
menus y titulos que se repiten identifican el programa. Para eso una rejilla
espaciada sobra.

Pero el mismo dato se usa ahora para otra cosa -- senalar el boton que nombras
-- y ahi la rejilla no vale. En un video de veinte minutos cae cada treinta
segundos, y una lectura solo sirve para los cuatro segundos de alrededor: el 73%
del video quedaba sin nada que leer. Decir "dale al boton de Guardar" en un
hueco no podia senalar nada, y el fallo era invisible: no da error, simplemente
no aparece el zoom.

La correccion no es leer mas: es leer **donde importa**. Los momentos en los que
senalas salen del transcript, que ya esta calculado, y son unas decenas de
fotogramas de mas.
"""

from __future__ import annotations

from forge.analysis.pipeline import (
    OCR_MAX_TARGETED,
    OCR_MIN_GAP,
    ocr_timestamps,
)
from forge.analysis.types import Transcript, TranscriptSegment, Word
from forge.understand.on_screen import MAX_OCR_DISTANCE

VIDEO = 1200.0  # veinte minutos, el formato para el que esta pensado esto


def _frase(t0: float, texto: str) -> TranscriptSegment:
    palabras, t = [], t0
    for p in texto.split():
        palabras.append(Word(start=round(t, 2), end=round(t + 0.28, 2), text=p))
        t += 0.34
    return TranscriptSegment(start=t0, end=round(t, 2), text=texto, words=palabras)


def _transcript(momentos: list[float], texto: str = "dale al boton de guardar"):
    return Transcript(language="es", segments=[_frase(m, texto) for m in momentos])


def _alcanza(instantes: list[float], t: float) -> bool:
    return any(abs(x - t) <= MAX_OCR_DISTANCE for x in instantes)


# -- lo que ya hacia ------------------------------------------------------


def test_sin_transcripcion_es_la_rejilla_de_siempre() -> None:
    instantes = ocr_timestamps(VIDEO)
    assert 35 <= len(instantes) <= 40
    pasos = {round(b - a, 1) for a, b in zip(instantes, instantes[1:])}
    assert pasos == {30.0}, "la rejilla tiene que seguir siendo regular"


def test_un_video_corto_no_se_lee_mas_veces_de_la_cuenta() -> None:
    """El paso tiene un minimo: en un video de un minuto, 40 lecturas seria
    leer casi cada segundo para nada."""
    instantes = ocr_timestamps(60.0)
    assert all(b - a >= 2.9 for a, b in zip(instantes, instantes[1:]))


def test_sin_video_no_hay_nada_que_leer() -> None:
    assert ocr_timestamps(0.0) == []
    assert ocr_timestamps(-5.0) == []


# -- lo que hace ahora ----------------------------------------------------


def test_donde_senalas_hay_lectura_y_antes_no_la_habia() -> None:
    # Momentos escogidos en los huecos de la rejilla de treinta segundos.
    momentos = [100.0, 201.5, 355.0, 620.0, 981.0]
    rejilla = ocr_timestamps(VIDEO)
    dirigidos = ocr_timestamps(VIDEO, _transcript(momentos))

    assert not any(_alcanza(rejilla, m) for m in momentos), (
        "el test no prueba nada si la rejilla ya llegaba"
    )
    assert all(_alcanza(dirigidos, m) for m in momentos)


def test_lo_que_cuesta_son_unos_pocos_fotogramas() -> None:
    momentos = [100.0, 201.5, 355.0, 620.0, 981.0]
    rejilla = ocr_timestamps(VIDEO)
    dirigidos = ocr_timestamps(VIDEO, _transcript(momentos))
    assert len(dirigidos) - len(rejilla) <= len(momentos)


def test_hablar_sin_senalar_no_anade_lecturas() -> None:
    """Si no senalas nada, no hay nada que leer aparte de la rejilla."""
    charla = _transcript([100.0, 300.0], "y esto lo aprendi de un companero")
    assert ocr_timestamps(VIDEO, charla) == ocr_timestamps(VIDEO)


def test_un_video_donde_senalas_sin_parar_no_dispara_el_coste() -> None:
    muchos = [10.0 + i * 2.0 for i in range(500)]
    instantes = ocr_timestamps(VIDEO, _transcript(muchos))
    assert len(instantes) <= 40 + OCR_MAX_TARGETED


def test_las_lecturas_salen_ordenadas_y_sin_repetir() -> None:
    momentos = [100.0, 100.4, 100.8, 400.0]
    instantes = ocr_timestamps(VIDEO, _transcript(momentos))
    assert instantes == sorted(instantes)
    assert len(set(instantes)) == len(instantes)
    assert all(b - a >= OCR_MIN_GAP for a, b in zip(instantes, instantes[1:])), (
        "leer dos veces el mismo fotograma es tiempo de Tesseract tirado"
    )


def test_ninguna_lectura_se_sale_del_video() -> None:
    instantes = ocr_timestamps(120.0, _transcript([0.2, 119.8]))
    assert all(0.0 <= t < 120.0 for t in instantes)
