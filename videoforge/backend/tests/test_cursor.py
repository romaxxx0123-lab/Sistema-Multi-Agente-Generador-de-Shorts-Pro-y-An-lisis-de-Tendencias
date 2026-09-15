"""Seguir el puntero del raton, que en una guia es donde esta la mirada.

Para decidir a donde acercarse habia una sola senal: la saliencia por residuo
espectral, que mide **contraste**. En una pantalla de ordenador el contraste
esta repartido por todas partes -- una interfaz es texto oscuro sobre claro de
punta a punta -- asi que esa medida, que va bien con una cara o un paisaje, aqui
dice poco.

Y hay una senal mejor delante: quien graba lleva el puntero a lo que va a
explicar **antes** de nombrarlo, y lo deja quieto ahi mientras habla de eso.

Sin ningun modelo: el puntero es el unico objeto que es pequeno, se mueve solo y
tiene la pantalla quieta alrededor. Lo que costo acertar fue **cual de las
manchas es**, y eso esta explicado en `analysis/cursor.py`: restar fotogramas
consecutivos da dos manchas (de donde se fue y a donde llego) y mirar solo el
fondo da tres. La que vale es la que **se alejo** del fondo.

Las pruebas van sobre una grabacion de pantalla sintetica con una trayectoria
**conocida**, asi que el error se mide en pixeles y no se opina.
"""

from __future__ import annotations

import statistics
import subprocess
from pathlib import Path

import pytest

from forge.analysis.cursor import CursorSample, CursorTrack, track_cursor
from forge.config import Settings
from forge.tools import ffmpeg_bin

#: La trayectoria del puntero en el video de prueba: baja en diagonal cuatro
#: segundos, se para cuatro, y vuelve.
CURSOR_SIZE = 14
WIDTH, HEIGHT = 1280, 720


def _verdad(t: float) -> tuple[float, float]:
    if t < 4:
        x, y = 100 + 180 * t, 80 + 120 * t
    elif t < 8:
        x, y = 820, 560
    else:
        x, y = 820 - 150 * (t - 8), 560 - 100 * (t - 8)
    mitad = CURSOR_SIZE / 2
    return (x + mitad) / WIDTH, (y + mitad) / HEIGHT


@pytest.fixture(scope="module")
def pantalla(tmp_path_factory, settings: Settings) -> Path:
    """Una grabacion de pantalla sintetica con interfaz quieta y puntero."""
    destino = tmp_path_factory.mktemp("cursor") / "pantalla.mp4"
    # El puntero se anima con `overlay`, no con `drawbox`: drawbox evalua sus
    # parametros una sola vez y el cuadrado se queda congelado (ya paso).
    fondo = (
        f"color=c=0xf0f0f0:s={WIDTH}x{HEIGHT}:r=30:d=12,"
        "drawgrid=w=80:h=45:t=2:c=0xc8c8c8,"
        "drawbox=x=40:y=20:w=300:h=40:color=0x505050@1:t=fill,"
        "drawbox=x=700:y=340:w=260:h=60:color=0x707070@1:t=fill"
    )
    subprocess.run(
        [
            str(ffmpeg_bin(settings)), "-y", "-hide_banner", "-loglevel", "error",
            "-f", "lavfi", "-i", fondo,
            "-f", "lavfi", "-i", f"color=c=black:s={CURSOR_SIZE}x{CURSOR_SIZE}:r=30:d=12",
            "-filter_complex",
            "[0:v][1:v]overlay="
            "x='if(lt(t,4), 100+180*t, if(lt(t,8), 820, 820-150*(t-8)))':"
            "y='if(lt(t,4), 80+120*t, if(lt(t,8), 560, 560-100*(t-8)))'[v]",
            "-map", "[v]", "-c:v", "libx264", "-crf", "20", "-pix_fmt", "yuv420p",
            str(destino),
        ],
        check=True, timeout=300,
    )
    return destino


@pytest.fixture(scope="module")
def pista(pantalla: Path, settings: Settings) -> CursorTrack:
    return track_cursor(pantalla, settings)


# -- lo encuentra, y con cuanto error ------------------------------------


def test_encuentra_el_puntero_casi_siempre(pista: CursorTrack) -> None:
    assert pista.coverage > 0.8, f"solo lo vio el {pista.coverage:.0%} de las veces"


def test_el_error_es_de_pocos_pixeles(pista: CursorTrack) -> None:
    """Lo que importa para apuntar un zoom: unos pocos pixeles en 1280."""
    errores = [
        (((s.x - _verdad(s.at)[0]) ** 2 + (s.y - _verdad(s.at)[1]) ** 2) ** 0.5) * WIDTH
        for s in pista.samples
    ]
    assert errores
    assert statistics.median(errores) < 45, f"mediana {statistics.median(errores):.0f} px"
    assert max(errores) < 90, f"el peor {max(errores):.0f} px"


def test_sabe_donde_se_paro(pista: CursorTrack) -> None:
    """Es la parte que sirve: el puntero de paso no dice nada, el parado si."""
    parado = pista.resting_at(6.0)
    assert parado is not None
    vx, vy = _verdad(6.0)
    error = (((parado[0] - vx) ** 2 + (parado[1] - vy) ** 2) ** 0.5) * WIDTH
    assert error < 30, f"{error:.0f} px de donde estaba de verdad"


def test_distingue_moverse_de_estar_quieto(pista: CursorTrack) -> None:
    moviendose = [s for s in pista.samples if 1.0 <= s.at <= 3.5]
    quietas = [s for s in pista.samples if 5.0 <= s.at <= 7.5]

    assert moviendose and quietas
    assert not any(s.resting for s in moviendose), "se movia y dice que no"
    assert all(s.resting for s in quietas), "estaba quieto y dice que se movia"


# -- y cuando no aplica, no se inventa nada ------------------------------


def test_en_video_que_se_mueve_entero_no_encuentra_puntero(
    sample_video: Path, settings: Settings
) -> None:
    """El fixture normal es barras, ruido y mandelbrot: ahi no hay raton.

    Y no encontrar nada es el comportamiento correcto, no un fallo: significa
    que esa senal no aplica a ese material.
    """
    pista = track_cursor(sample_video, settings)
    assert pista.coverage < 0.5, f"se invento un puntero el {pista.coverage:.0%}"


def test_una_pista_vacia_no_estorba() -> None:
    vacia = CursorTrack()
    assert not vacia
    assert vacia.at(5.0) is None
    assert vacia.resting_at(5.0) is None


# -- lo que cambia en el montaje -----------------------------------------


def test_senalar_sin_decir_donde_ya_apunta_a_algun_sitio() -> None:
    """"Mira esto de aqui" no decia donde, asi que no habia zoom que colocar."""
    from forge.analysis.types import Transcript, TranscriptSegment, Word
    from forge.understand.speech_cues import find_pointing

    palabras, t = [], 10.0
    for p in "mira esto de aqui".split():
        palabras.append(Word(start=round(t, 2), end=round(t + 0.28, 2), text=p))
        t += 0.34
    tr = Transcript(language="es", segments=[
        TranscriptSegment(start=10.0, end=round(t, 2), text="mira esto de aqui",
                          words=palabras)
    ])
    puntero = CursorTrack(samples=[
        CursorSample(at=10.0 + i * 0.25, x=0.82, y=0.31, move=0.0) for i in range(8)
    ])

    sin = find_pointing(tr)
    con = find_pointing(tr, None, puntero)

    assert all(c.region is None for c in sin), "sin puntero no habia donde apuntar"
    assert con and all(c.region == (0.82, 0.31) for c in con)
    assert con[0].strength > sin[0].strength
    assert "puntero" in con[0].rationale


def test_si_dices_una_zona_y_el_puntero_esta_en_otra_ganas_tu() -> None:
    """Igual que con el OCR: el puntero afina, no contradice."""
    from forge.analysis.types import Transcript, TranscriptSegment, Word
    from forge.understand.speech_cues import find_pointing

    palabras, t = [], 10.0
    for p in "lo tienes abajo a la izquierda".split():
        palabras.append(Word(start=round(t, 2), end=round(t + 0.28, 2), text=p))
        t += 0.34
    tr = Transcript(language="es", segments=[
        TranscriptSegment(start=10.0, end=round(t, 2),
                          text="lo tienes abajo a la izquierda", words=palabras)
    ])
    puntero = CursorTrack(samples=[
        CursorSample(at=10.0 + i * 0.25, x=0.9, y=0.1, move=0.0) for i in range(8)
    ])

    cues = find_pointing(tr, None, puntero)
    assert cues
    x, _y = cues[0].region
    assert x < 0.5, "el puntero estaba a la derecha y dijiste izquierda"
