"""Tests del master de audio: el tratamiento de voz y el nivel de salida.

Aqui casi todo se **mide sobre audio de verdad** en vez de comprobar que la
cadena de filtros dice lo que esperabamos. Es la unica forma de haber visto que
el filtro `deesser` de ffmpeg, con la intensidad que llevabamos, se llevaba por
delante 4,7 dB de sonoridad y 8,7 dB de pico: la cadena "decia" de-esser y lo
que hacia era destrozar la voz.
"""

from __future__ import annotations

import re
import subprocess
from pathlib import Path

import numpy as np
import pytest

from forge.config import Settings
from forge.plan.styles import VoiceRules
from forge.render.graph import (
    LIMITER_MARGIN_DB,
    TRUE_PEAK_CEILING_DB,
    _emit_audio_chain,
    deesser_subgraph,
    master_chain,
    voice_chain,
)
from forge.render.renderer import MASTER_MAX_LOSS_DB, _plan_master
from forge.tools import ffmpeg_bin


# -- utilidades de medida --------------------------------------------------


def _grafo(etapas: list) -> str:
    """Cadena de filtros completa, de [0:a] a [aout]."""
    partes: list[str] = []
    _emit_audio_chain(partes, "[0:a]", etapas, "[aout]")
    return ";".join(partes)


def _medir(settings: Settings, fuente: str, etapas: list) -> tuple[float, float]:
    """Sonoridad integrada y pico real de una fuente pasada por unas etapas.

    Se mapea `[aout]` explicitamente: con una salida sin etiquetar ffmpeg puede
    acabar cogiendo la entrada sin procesar, y el test mediria el audio crudo
    creyendo que mide el tratado.
    """
    grafo = _grafo(etapas) + ";[aout]ebur128=peak=true[medido]"
    proc = subprocess.run(
        [str(ffmpeg_bin(settings)), "-hide_banner", "-nostdin",
         "-f", "lavfi", "-i", fuente, "-filter_complex", grafo,
         "-map", "[medido]", "-f", "null", "-"],
        capture_output=True, text=True, timeout=300,
    )
    cola = proc.stderr[proc.stderr.rfind("Summary:"):]
    assert "I:" in cola, proc.stderr[-1500:]
    return (
        float(re.search(r"I:\s*(-?[\d.]+)", cola).group(1)),
        float(re.search(r"Peak:\s*(-?[\d.]+)", cola).group(1)),
    )


def _banda(settings: Settings, fuente: str, etapas: list, tmp: Path,
           baja: float, alta: float) -> float:
    """Energia media de la fuente en una banda de frecuencia, en dB."""
    salida = tmp / f"banda-{baja:.0f}-{len(etapas)}.wav"
    subprocess.run(
        [str(ffmpeg_bin(settings)), "-y", "-hide_banner", "-loglevel", "error",
         "-f", "lavfi", "-i", fuente, "-filter_complex", _grafo(etapas),
         "-map", "[aout]", "-c:a", "pcm_s16le", str(salida)],
        check=True, capture_output=True, timeout=300,
    )

    import wave

    with wave.open(str(salida), "rb") as w:
        sr = w.getframerate()
        d = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16)
        d = d.astype(np.float64) / 32768.0
        if w.getnchannels() > 1:
            d = d.reshape(-1, w.getnchannels()).mean(axis=1)

    n = 1 << 14
    espectro = np.zeros(n // 2 + 1)
    ventana = np.hanning(n)
    trozos = 0
    for i in range(0, len(d) - n, n // 2):
        espectro += np.abs(np.fft.rfft(d[i : i + n] * ventana)) ** 2
        trozos += 1
    espectro /= max(trozos, 1)
    f = np.fft.rfftfreq(n, 1 / sr)
    energia = espectro[(f >= baja) & (f < alta)].sum()
    return 10 * np.log10(energia + 1e-20)


#: Una voz falsa pero util: un tono grave con armonicos y un siseo agudo
#: intermitente encima, que es lo que un de-esser tiene que atacar.
VOZ_SINTETICA = (
    "aevalsrc="
    "0.25*sin(2*PI*180*t)+0.12*sin(2*PI*540*t)"
    # La coma de gt() va escapada: si no, ffmpeg la lee como separador de
    # opciones del filtro.
    r"+0.35*random(0)*gt(sin(2*PI*1.3*t)\,0.8)"
    ":d=6:s=48000"
)


# -- de-esser --------------------------------------------------------------


#: La misma voz sin el siseo: sirve para comprobar la transparencia.
VOZ_LIMPIA = "aevalsrc=0.25*sin(2*PI*180*t)+0.12*sin(2*PI*540*t):d=4:s=48000"


def test_el_deesser_es_transparente_si_no_hay_sibilancia(settings: Settings) -> None:
    """Sin nada que quitar en la banda alta, la salida es la entrada.

    Es la propiedad que justifica construirlo restando en vez de partir la voz
    en dos bandas y volver a juntarlas: el cruce de filtros no vuelve a sumar
    plano, y se veia en la medida (2,4 dB de diferencia sin comprimir nada).
    """
    crudo = _medir(settings, VOZ_LIMPIA, [])
    pasado = _medir(settings, VOZ_LIMPIA, [deesser_subgraph(0.6)])
    assert pasado[0] == pytest.approx(crudo[0], abs=0.1)
    assert pasado[1] == pytest.approx(crudo[1], abs=0.1)


def test_el_deesser_baja_la_sibilancia_y_respeta_la_voz(
    settings: Settings, tmp_path: Path
) -> None:
    etapas = [deesser_subgraph(0.6)]
    agudos_antes = _banda(settings, VOZ_SINTETICA, [], tmp_path, 6000, 12000)
    agudos_despues = _banda(settings, VOZ_SINTETICA, etapas, tmp_path, 6000, 12000)
    graves_antes = _banda(settings, VOZ_SINTETICA, [], tmp_path, 100, 800)
    graves_despues = _banda(settings, VOZ_SINTETICA, etapas, tmp_path, 100, 800)

    assert agudos_despues < agudos_antes - 6.0, (
        f"la sibilancia apenas bajo: {agudos_antes:.1f} -> {agudos_despues:.1f} dB"
    )
    assert graves_despues == pytest.approx(graves_antes, abs=0.1), (
        "el de-esser toco la parte de la voz que no le corresponde"
    )


def test_la_cadena_de_voz_no_usa_el_deesser_de_ffmpeg() -> None:
    """Deja constancia de por que no se usa: ver el docstring de deesser_subgraph."""
    assert "deesser=" not in _grafo(voice_chain(VoiceRules()))


# -- estructura de la cadena ----------------------------------------------


def test_las_etapas_planas_se_juntan_en_una_sola_cadena() -> None:
    partes: list[str] = []
    _emit_audio_chain(partes, "[a]", ["highpass=f=80", "volume=2dB"], "[aout]")
    assert partes == ["[a]highpass=f=80,volume=2dB[aout]"]


def test_un_subgrafo_corta_la_cadena_y_se_reengancha() -> None:
    partes: list[str] = []
    _emit_audio_chain(
        partes, "[a]", ["highpass=f=80", deesser_subgraph(0.3), "volume=2dB"], "[aout]"
    )
    grafo = ";".join(partes)
    assert "[a]" in grafo
    # Empieza en la entrada, acaba en la salida, y no queda ninguna etiqueta
    # intermedia sin consumir.
    assert grafo.startswith("[a]highpass=f=80")
    assert grafo.endswith("volume=2dB[aout]")
    etiquetas = re.findall(r"\[([a-z]+\d+[a-z0-9]*)\]", grafo)
    for etiqueta in set(etiquetas):
        assert etiquetas.count(etiqueta) == 2, f"[{etiqueta}] no esta emparejada"


def test_sin_etapas_la_cadena_sigue_siendo_valida() -> None:
    partes: list[str] = []
    _emit_audio_chain(partes, "[a]", [], "[aout]")
    assert partes == ["[a]anull[aout]"]


# -- limitador -------------------------------------------------------------


def test_el_limitador_deja_margen_para_el_pico_entre_muestras() -> None:
    """`alimiter` mira el pico de muestra; el pico real se sale por encima."""
    cadena = ",".join(master_chain(6.0))
    limite = float(re.search(r"alimiter=limit=([\d.]+)", cadena).group(1))
    en_db = 20 * np.log10(limite)
    assert en_db == pytest.approx(TRUE_PEAK_CEILING_DB - LIMITER_MARGIN_DB, abs=0.05)
    assert en_db < TRUE_PEAK_CEILING_DB


def test_el_limitador_trabaja_sobremuestreado() -> None:
    cadena = master_chain(6.0)
    subida = next(i for i, f in enumerate(cadena) if f.startswith("aresample=1920"))
    limitador = next(i for i, f in enumerate(cadena) if f.startswith("alimiter"))
    bajada = next(i for i, f in enumerate(cadena) if f == "aresample=48000")
    assert subida < limitador < bajada


def test_el_master_de_verdad_respeta_el_techo(settings: Settings) -> None:
    """Se sube una senal hasta pasarse y se comprueba el pico del resultado."""
    fuente = "sine=f=440:d=4:r=48000,volume=-20dB"
    _, pico = _medir(settings, fuente, master_chain(25.0))
    assert pico <= TRUE_PEAK_CEILING_DB, f"pico real en {pico} dBFS"


# -- eleccion de la ganancia ----------------------------------------------


def _medidor(perdida_por_db: float, base_i: float, base_tp: float):
    """Simula el limitador: solo pierde a partir de donde empieza a recortar."""
    desde = (TRUE_PEAK_CEILING_DB - LIMITER_MARGIN_DB) - base_tp

    def medir(g: float) -> dict:
        perdida = perdida_por_db * max(0.0, g - desde)
        return {"input_i": str(base_i + g - perdida)}

    return medir


def test_si_cabe_bajo_el_techo_se_sube_del_tiron() -> None:
    """Sin necesidad de limitar no hay nada que decidir ni que medir."""
    llamadas = []

    def medir(g):
        llamadas.append(g)
        return {"input_i": "-14.0"}

    g, medido = _plan_master(medir, base_i=-20.0, base_tp=-12.0, target_lufs=-14.0)
    assert g == pytest.approx(6.0)
    assert medido is None
    assert llamadas == [], "no hacia falta ninguna pasada de prueba"


def test_con_material_facil_se_llega_al_objetivo() -> None:
    """Picos sueltos: el limitador apenas cuesta, asi que se sube entero."""
    g, medido = _plan_master(
        _medidor(0.0, -24.0, -4.0), base_i=-24.0, base_tp=-4.0, target_lufs=-14.0
    )
    assert g == pytest.approx(10.0, abs=1.5)
    assert medido == pytest.approx(-14.0, abs=1.5)


def test_con_material_denso_no_se_aprieta() -> None:
    """Si cada dB de ganancia se pierde casi entero, subir solo distorsiona."""
    base_i, base_tp = -24.0, -4.0
    medir = _medidor(0.9, base_i, base_tp)
    g, _ = _plan_master(medir, base_i=base_i, base_tp=base_tp, target_lufs=-14.0)

    assert g < 10.0, "subio hasta el objetivo aplastando el material"
    perdida = (base_i + g) - float(medir(g)["input_i"])
    assert perdida <= MASTER_MAX_LOSS_DB + 1e-6, f"perdio {perdida:.2f} dB por el camino"


def test_nunca_se_devuelve_mas_ganancia_de_la_que_hace_falta() -> None:
    g, _ = _plan_master(
        _medidor(0.0, -12.0, -1.0), base_i=-12.0, base_tp=-1.0, target_lufs=-14.0
    )
    assert g <= 0.0, "el audio ya estaba por encima del objetivo"


def test_si_la_medida_falla_no_se_masteriza_a_ciegas() -> None:
    g, medido = _plan_master(
        lambda _g: None, base_i=-24.0, base_tp=-4.0, target_lufs=-14.0
    )
    assert medido is None
    # Se queda en el punto donde el limitador todavia no toca.
    assert g == pytest.approx(
        (TRUE_PEAK_CEILING_DB - LIMITER_MARGIN_DB) - (-4.0), abs=1e-6
    )
