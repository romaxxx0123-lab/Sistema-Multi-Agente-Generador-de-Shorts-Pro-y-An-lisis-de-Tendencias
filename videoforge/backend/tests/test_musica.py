"""Musica de fondo, que hasta ahora el estilo prometia y no existia.

`MusicRules` (activada, ganancia, agachado) estaba en cuatro de los seis
estilos y **no tenia un solo consumidor** en todo el codigo. Elegias
`documentary` o `vlog` y no sonaba nada.

Aqui se implementa con el mismo trato que la biblioteca de b-roll: la musica la
pones tu en `assets/music/`. Sin fichero no se rompe nada y el render lo dice.

Lo que de verdad separa "musica de fondo" de "musica encima" es el
**agachado**: la musica se aparta sola mientras hablas y vuelve cuando callas.
Eso es lo que se mide aqui, y se mide de verdad, comparando el nivel con y sin
agachado en un tramo donde hay voz.
"""

from __future__ import annotations

import re
import subprocess
from pathlib import Path

import numpy as np
import pytest

from forge.analysis.pipeline import analyze
from forge.assets.sfx import SAMPLE_RATE, write_wav
from forge.config import Settings
from forge.plan.edl import EffectKind, MusicEffect
from forge.plan.planner import build_edl
from forge.render.renderer import render
from forge.tools import ffmpeg_bin


@pytest.fixture(scope="module")
def musica(tmp_path_factory) -> Path:
    """Una carpeta de musica con una pista continua."""
    carpeta = tmp_path_factory.mktemp("musica")
    t = np.arange(int(SAMPLE_RATE * 12.0)) / SAMPLE_RATE
    # Un acorde grave y constante: facil de medir y no se confunde con los
    # tonos del fixture (440, 660, 880 Hz).
    senal = 0.3 * (np.sin(2 * np.pi * 110 * t) + np.sin(2 * np.pi * 165 * t))
    write_wav(senal.astype(np.float32), carpeta / "fondo.wav")
    return carpeta


#: La musica de prueba vive en 110 y 165 Hz y los tonos del fixture en 440 y
#: mas arriba. Filtrando por debajo de 250 Hz se mide **la musica**, no la
#: mezcla: medir la suma no vale, porque la domina la voz y un agachado de 8 dB
#: en la musica apenas mueve el total.
BANDA_MUSICA = "lowpass=f=250,"


def _nivel(
    path: Path, settings: Settings, desde: float, hasta: float, filtro: str = BANDA_MUSICA
) -> float:
    """Nivel RMS en dB de un tramo del fichero, en la banda que se pida."""
    proc = subprocess.run(
        [str(ffmpeg_bin(settings)), "-hide_banner", "-nostdin",
         "-ss", f"{desde}", "-to", f"{hasta}", "-i", str(path),
         "-af", f"{filtro}astats=metadata=1:reset=0", "-f", "null", "-"],
        capture_output=True, text=True, timeout=300,
    )
    valores = [float(m) for m in re.findall(r"RMS level dB:\s*(-?[\d.]+)", proc.stderr)]
    assert valores, proc.stderr[-800:]
    return max(valores)


@pytest.fixture(scope="module")
def edl_con_musica(sample_video: Path, settings: Settings):
    analysis, _ = analyze(sample_video, settings, skip_speech=True)
    return build_edl(analysis, "tutorial"), analysis


def _con_musica(edl, duck: bool):
    copia = edl.model_copy(deep=True)
    copia.effects = [e for e in copia.effects if e.kind is not EffectKind.MUSIC]
    copia.effects.append(
        MusicEffect(id="mus", start=0.0, end=copia.duration, asset_id="music",
                    gain_db=-12.0, duck=duck)
    )
    return copia


# -- lo que el estilo prometia -------------------------------------------


def test_el_estilo_que_pide_musica_la_pone_en_el_plan(sample_video, settings) -> None:
    analysis, _ = analyze(sample_video, settings, skip_speech=True)
    edl = build_edl(analysis, "documentary")
    musicas = [e for e in edl.effects if e.kind is EffectKind.MUSIC]
    assert len(musicas) == 1
    assert musicas[0].end > musicas[0].start
    assert "musica" in musicas[0].rationale


def test_el_estilo_que_no_la_pide_no_la_pone(sample_video, settings) -> None:
    analysis, _ = analyze(sample_video, settings, skip_speech=True)
    edl = build_edl(analysis, "tutorial")
    assert not [e for e in edl.effects if e.kind is EffectKind.MUSIC]


def test_sin_carpeta_de_musica_el_render_sigue(edl_con_musica, settings, tmp_path) -> None:
    """Como un b-roll que no se pudo descargar: se avisa y se monta igual."""
    edl, _ = edl_con_musica
    salida = tmp_path / "sin-musica.mp4"
    resultado = render(_con_musica(edl, duck=True), salida, settings, music_dir=None)
    assert Path(resultado.path).is_file()


# -- y lo que la hace musica de fondo y no musica encima -----------------


def _edl_sin_cortes(sample_video: Path, duracion: float = 8.0):
    """El video entero, sin montar.

    Hace falta para esto: el montaje **quita los silencios**, y sin silencios
    no se puede comprobar que la musica vuelve cuando callas.
    """
    from forge.plan.edl import EDL, Clip, RenderSpec

    return EDL(
        source=str(sample_video),
        source_duration=duracion,
        render=RenderSpec(width=640, height=360, fps=30),
        timeline=[Clip(id="c0", source_start=0.0, source_end=duracion)],
    )


def test_la_musica_se_agacha_mientras_hablas(
    sample_video: Path, settings, musica: Path, tmp_path
) -> None:
    """La medida, que es lo unico que distingue las dos cosas.

    En el fixture hay tono (que hace de voz) en los primeros segundos y
    silencio de verdad entre 4,5 y 6,5. Con agachado, la musica se aparta en el
    tono y vuelve en el silencio; sin agachado se queda encima todo el rato.
    """
    edl = _edl_sin_cortes(sample_video)

    con = tmp_path / "duck.mp4"
    sin = tmp_path / "sin-duck.mp4"
    render(_con_musica(edl, duck=True), con, settings, music_dir=musica,
           two_pass_audio=False)
    render(_con_musica(edl, duck=False), sin, settings, music_dir=musica,
           two_pass_audio=False)

    # En un tramo con voz, la mezcla con agachado tiene que sonar mas baja.
    hablando_con = _nivel(con, settings, 0.5, 1.5)
    hablando_sin = _nivel(sin, settings, 0.5, 1.5)
    assert hablando_con < hablando_sin - 3.0, (
        f"con agachado {hablando_con:.1f} dB y sin el {hablando_sin:.1f} dB"
    )

    # Y cuando callas, vuelve: en el silencio del fixture (4,5-6,5 s) las dos
    # mezclas tienen que sonar practicamente igual.
    callado_con = _nivel(con, settings, 5.6, 6.4)
    callado_sin = _nivel(sin, settings, 5.6, 6.4)
    assert abs(callado_con - callado_sin) < 2.5, (
        f"la musica no vuelve: {callado_con:.1f} vs {callado_sin:.1f} dB"
    )


def test_el_agachado_aparece_en_el_grafo(edl_con_musica) -> None:
    from forge.render.graph import build_graph

    edl, _ = edl_con_musica
    grafo = build_graph(
        _con_musica(edl, duck=True), has_audio=True, music_path="/tmp/x.wav"
    )
    assert "sidechaincompress" in grafo.filter_complex

    plano = build_graph(
        _con_musica(edl, duck=False), has_audio=True, music_path="/tmp/x.wav"
    )
    assert "sidechaincompress" not in plano.filter_complex
