"""Tests del render real: comprueban el MP4 que sale, no solo el comando."""

from __future__ import annotations

import re
import subprocess
from pathlib import Path

import numpy as np
import pytest

from forge.analysis.frames import extract_frames_at
from forge.analysis.pipeline import analyze
from forge.analysis.types import ShotFocus, Transcript, TranscriptSegment, Word
from forge.config import Settings
from forge.errors import RenderError
from forge.plan.edl import PunchInEffect, Rect
from forge.plan.planner import build_edl
from forge.render.renderer import render
from forge.tools import ffmpeg_bin, probe


def _medir_lufs(path: Path, settings: Settings) -> tuple[float, float]:
    """Sonoridad integrada y pico real del fichero renderizado."""
    proc = subprocess.run(
        [str(ffmpeg_bin(settings)), "-hide_banner", "-nostdin", "-i", str(path),
         "-af", "ebur128=peak=true", "-f", "null", "-"],
        capture_output=True, text=True, timeout=300,
    )
    cola = proc.stderr[proc.stderr.rfind("Summary:"):]
    lufs = float(re.search(r"I:\s*(-?[\d.]+)", cola).group(1))
    peak = float(re.search(r"Peak:\s*(-?[\d.]+)", cola).group(1))
    return lufs, peak


@pytest.fixture(scope="module")
def edl_basico(sample_video: Path, settings: Settings):
    analysis, _ = analyze(sample_video, settings, skip_speech=True)
    return build_edl(analysis, "tutorial")


@pytest.fixture(scope="module")
def render_basico(edl_basico, settings: Settings, tmp_path_factory):
    out = tmp_path_factory.mktemp("render") / "basico.mp4"
    return render(edl_basico, out, settings)


# -- el fichero que sale ---------------------------------------------------


def test_produce_un_mp4_reproducible(render_basico, settings: Settings) -> None:
    assert render_basico.path.is_file()
    assert render_basico.path.stat().st_size > 10_000
    info = probe(render_basico.path, settings)
    assert info.has_video and info.has_audio


def test_la_duracion_coincide_con_el_edl(render_basico, edl_basico, settings: Settings) -> None:
    """El montaje que se planifico es el que sale, al fotograma."""
    info = probe(render_basico.path, settings)
    assert info.duration == pytest.approx(edl_basico.duration, abs=0.15)


def test_el_resultado_es_mas_corto_que_el_original(render_basico, edl_basico) -> None:
    assert edl_basico.duration < edl_basico.source_duration


def test_conserva_resolucion_y_fps(render_basico, edl_basico, settings: Settings) -> None:
    info = probe(render_basico.path, settings)
    assert info.video is not None
    assert info.video.width == edl_basico.render.width
    assert info.video.height == edl_basico.render.height
    assert info.video.fps == pytest.approx(edl_basico.render.fps, abs=0.1)


def test_el_pixel_format_es_compatible(render_basico, settings: Settings) -> None:
    """yuv420p es lo unico que reproducen todas las plataformas."""
    info = probe(render_basico.path, settings)
    assert info.video is not None
    assert info.video.pix_fmt == "yuv420p"


# -- audio masterizado -----------------------------------------------------


def test_el_audio_queda_en_el_objetivo_de_sonoridad(render_basico, settings: Settings) -> None:
    lufs, _ = _medir_lufs(render_basico.path, settings)
    assert lufs == pytest.approx(-14.0, abs=1.5), f"salio a {lufs} LUFS"


def test_el_pico_real_no_satura(render_basico, settings: Settings) -> None:
    _, peak = _medir_lufs(render_basico.path, settings)
    assert peak <= -1.0, f"pico real en {peak} dBFS"


def test_la_medicion_en_dos_pasadas_se_usa(render_basico) -> None:
    assert render_basico.measured_lufs is not None
    assert "audio a -14 LUFS" in render_basico.applied


# -- subtitulos quemados ---------------------------------------------------


def test_los_subtitulos_acaban_en_la_imagen(
    sample_video: Path, settings: Settings, tmp_path: Path
) -> None:
    analysis, _ = analyze(sample_video, settings, skip_speech=True)
    palabras = [Word(start=0.4 + i * 0.45, end=0.7 + i * 0.45, text=t)
                for i, t in enumerate(["abrimos", "el", "menu"])]
    analysis.transcript = Transcript(
        language="es",
        segments=[TranscriptSegment(start=0.4, end=2.0, text="abrimos el menu", words=palabras)],
    )
    edl = build_edl(analysis, "tutorial")
    assert edl.effects_of(__import__("forge.plan.edl", fromlist=["EffectKind"]).EffectKind.CAPTION)

    out = tmp_path / "subs.mp4"
    render(edl, out, settings)

    original = extract_frames_at(sample_video, settings, [0.8], width=640, height=360)[0]
    editado = extract_frames_at(out, settings, [0.8], width=640, height=360)[0]

    banda_original = original[300:355, :, :]
    banda_editada = editado[300:355, :, :]
    blancos = int((banda_editada.min(axis=2) > 200).sum())
    cambio = float(np.abs(banda_editada.astype(int) - banda_original.astype(int)).mean())

    assert blancos > 150, "no hay texto claro en la banda de subtitulos"
    assert cambio > 10, "la banda inferior no cambio respecto al original"


# -- zoom ------------------------------------------------------------------


def _frame_exacto(path: Path, t: float, settings: Settings, w: int = 640, h: int = 360):
    """Fotograma en un instante exacto.

    Se usa `-ss` DESPUES de `-i` (busqueda exacta). La busqueda rapida, que va
    antes, salta al keyframe anterior y devolveria otro fotograma.
    """
    proc = subprocess.run(
        [str(ffmpeg_bin(settings)), "-hide_banner", "-loglevel", "error", "-nostdin",
         "-i", str(path), "-ss", f"{t:.3f}", "-frames:v", "1",
         "-vf", f"scale={w}:{h}", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
        capture_output=True, timeout=300,
    )
    return np.frombuffer(proc.stdout[: w * h * 3], dtype=np.uint8).reshape(h, w, 3)


@pytest.fixture(scope="module")
def base_sin_zoom(sample_video: Path, settings: Settings, tmp_path_factory):
    """Montaje de referencia sin zooms ni efectos que alteren la imagen."""
    analysis, _ = analyze(sample_video, settings, skip_speech=True)
    edl = build_edl(analysis, "tutorial")
    edl.effects = [
        e for e in edl.effects if e.kind.value not in ("punch_in", "transition", "grade")
    ]
    out = tmp_path_factory.mktemp("zoom") / "sin.mp4"
    render(edl, out, settings)
    return edl, out


@pytest.mark.parametrize("cx,cy", [(0.5, 0.5), (0.75, 0.5), (0.25, 0.25)])
def test_el_zoom_encuadra_donde_se_le_pide(
    base_sin_zoom, settings: Settings, tmp_path: Path, cx: float, cy: float
) -> None:
    """Comprobacion geometrica: el fotograma con zoom x2 debe ser exactamente
    la ventana de medio tamano centrada donde toca, ampliada a pantalla.

    Medir "cuanto detalle hay" no vale: depende del contenido, y un zoom
    descentrado puede dar la misma cifra que uno correcto.
    """
    import cv2

    base, sin_path = base_sin_zoom
    con = base.model_copy(deep=True)
    con.effects.append(
        PunchInEffect(id="z", start=0.5, end=4.0, ease_seconds=0.2,
                      rect=Rect.centered(cx, cy, 2.0), rationale="prueba")
    )
    con_path = tmp_path / f"zoom-{cx}-{cy}.mp4"
    render(con, con_path, settings)

    sin_img = _frame_exacto(sin_path, 1.5, settings).astype(np.float32)
    con_img = _frame_exacto(con_path, 1.5, settings).astype(np.float32)

    h, w, _ = sin_img.shape
    vw, vh = w // 2, h // 2
    x0 = int(max(0, min(w - vw, cx * w - vw / 2)))
    y0 = int(max(0, min(h - vh, cy * h - vh / 2)))
    esperado = cv2.resize(sin_img[y0:y0 + vh, x0:x0 + vw], (w, h), interpolation=cv2.INTER_CUBIC)

    diferencia = float(np.abs(con_img - esperado).mean())
    assert diferencia < 15, f"el encuadre no coincide (diferencia {diferencia:.1f}/255)"


def test_fuera_del_tramo_el_zoom_no_afecta(
    base_sin_zoom, settings: Settings, tmp_path: Path
) -> None:
    base, sin_path = base_sin_zoom
    con = base.model_copy(deep=True)
    con.effects.append(
        PunchInEffect(id="z", start=3.0, end=4.5, ease_seconds=0.2,
                      rect=Rect.centered(0.5, 0.5, 2.0), rationale="prueba")
    )
    con_path = tmp_path / "tardio.mp4"
    render(con, con_path, settings)

    a = _frame_exacto(sin_path, 0.5, settings).astype(np.float32)
    b = _frame_exacto(con_path, 0.5, settings).astype(np.float32)
    assert float(np.abs(a - b).mean()) < 5, "el zoom afecto fuera de su tramo"


def test_el_zoom_no_altera_el_numero_de_fotogramas(
    base_sin_zoom, settings: Settings, tmp_path: Path
) -> None:
    """zoompan podria descuadrar el timing y desincronizar los subtitulos."""
    base, sin_path = base_sin_zoom
    con = base.model_copy(deep=True)
    con.effects.append(
        PunchInEffect(id="z", start=1.0, end=3.0, rect=Rect.centered(0.5, 0.5, 1.5),
                      rationale="prueba")
    )
    con_path = tmp_path / "frames.mp4"
    render(con, con_path, settings)

    assert probe(con_path, settings).duration == pytest.approx(
        probe(sin_path, settings).duration, abs=0.05
    )


# -- validacion y modos ----------------------------------------------------


def test_la_prueba_en_seco_caza_un_grafo_invalido(
    edl_basico, settings: Settings, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Un error de filtros debe saltar en 1 segundo, no a los 10 minutos."""
    from forge.render import renderer

    original = renderer.build_graph

    def _roto(*args, **kwargs):
        g = original(*args, **kwargs)
        g.filter_complex += ";[vout]filtroquenoexiste=1[vroto]"
        return g

    monkeypatch.setattr(renderer, "build_graph", _roto)
    with pytest.raises(RenderError, match="1 segundo"):
        render(edl_basico, tmp_path / "roto.mp4", settings)


def test_el_preview_baja_la_resolucion(edl_basico, settings: Settings, tmp_path: Path) -> None:
    alto = edl_basico.model_copy(deep=True)
    alto.render.width, alto.render.height = 1920, 1080

    out = tmp_path / "preview.mp4"
    resultado = render(alto, out, settings, preview=True)
    info = probe(out, settings)

    assert resultado.preview
    assert info.video is not None
    assert info.video.height == 540
    assert info.video.width == 960  # mantiene la proporcion 16:9


def test_el_preview_no_toca_el_edl_original(edl_basico, settings: Settings, tmp_path: Path) -> None:
    antes = edl_basico.render.height
    render(edl_basico, tmp_path / "p.mp4", settings, preview=True)
    assert edl_basico.render.height == antes


def test_un_video_sin_audio_se_renderiza_igual(
    settings: Settings, tmp_path: Path, sample_video: Path
) -> None:
    from forge.tools import run

    mudo = tmp_path / "mudo.mp4"
    run([ffmpeg_bin(settings), "-hide_banner", "-y", "-nostdin",
         "-i", sample_video, "-an", "-c:v", "copy", mudo], timeout=300)

    analysis, _ = analyze(mudo, settings, force={"all"})
    edl = build_edl(analysis, "tutorial")
    resultado = render(edl, tmp_path / "mudo-editado.mp4", settings)

    info = probe(resultado.path, settings)
    assert info.has_video
    assert not info.has_audio


def test_si_falta_el_original_lo_dice_claro(edl_basico, settings: Settings, tmp_path: Path) -> None:
    movido = edl_basico.model_copy(deep=True)
    movido.source = tmp_path / "no-esta.mp4"
    with pytest.raises(RenderError, match="No encuentro el video original"):
        render(movido, tmp_path / "x.mp4", settings)


def test_el_resultado_se_describe_solo(render_basico) -> None:
    resumen = render_basico.summary()
    assert "libx264" in resumen or "nvenc" in resumen
    assert "render" in resumen


# -- material de apoyo compuesto en el render ------------------------------


def test_el_b_roll_acaba_en_la_imagen(
    base_sin_zoom, settings: Settings, tmp_path: Path
) -> None:
    """Un overlay tiene que tapar la imagen mientras dura, y solo mientras dura."""
    from forge.assets.types import Asset, AssetBundle, AssetKind
    from forge.plan.edl import BrollEffect

    base, sin_path = base_sin_zoom

    bundle = AssetBundle()
    bundle.add(
        Asset(id="self-x", kind=AssetKind.SELF, provider="self",
              source_start=10.6, source_end=12.4)
    )
    con = base.model_copy(deep=True)
    con.effects.append(
        BrollEffect(id="brx", start=1.0, end=3.0, asset_id="self-x",
                    mode="full", rationale="prueba")
    )

    con_path = tmp_path / "broll.mp4"
    resultado = render(con, con_path, settings, assets=bundle)
    assert any("b-roll" in a for a in resultado.applied)

    dentro_sin = _frame_exacto(sin_path, 2.0, settings).astype(np.float32)
    dentro_con = _frame_exacto(con_path, 2.0, settings).astype(np.float32)
    assert float(np.abs(dentro_con - dentro_sin).mean()) > 15, "el b-roll no tapa nada"

    fuera_sin = _frame_exacto(sin_path, 0.3, settings).astype(np.float32)
    fuera_con = _frame_exacto(con_path, 0.3, settings).astype(np.float32)
    assert float(np.abs(fuera_con - fuera_sin).mean()) < 5, "afecta fuera de su tramo"


def test_el_b_roll_no_cambia_la_duracion(
    base_sin_zoom, settings: Settings, tmp_path: Path
) -> None:
    from forge.assets.types import Asset, AssetBundle, AssetKind
    from forge.plan.edl import BrollEffect

    base, sin_path = base_sin_zoom
    bundle = AssetBundle()
    bundle.add(Asset(id="s", kind=AssetKind.SELF, provider="self",
                     source_start=10.6, source_end=12.4))
    con = base.model_copy(deep=True)
    con.effects.append(
        BrollEffect(id="b", start=1.0, end=3.0, asset_id="s", rationale="x")
    )

    out = tmp_path / "dur.mp4"
    render(con, out, settings, assets=bundle)
    assert probe(out, settings).duration == pytest.approx(
        probe(sin_path, settings).duration, abs=0.05
    )


def test_un_asset_que_falta_no_tumba_el_render(
    base_sin_zoom, settings: Settings, tmp_path: Path
) -> None:
    """Una descarga fallida no puede costar el render entero."""
    from forge.assets.types import Asset, AssetBundle, AssetKind
    from forge.plan.edl import BrollEffect

    base, _ = base_sin_zoom
    bundle = AssetBundle()
    bundle.add(
        Asset(id="roto", kind=AssetKind.VIDEO, provider="pexels",
              path=tmp_path / "no-existe.mp4")
    )
    con = base.model_copy(deep=True)
    con.effects.append(
        BrollEffect(id="b", start=1.0, end=3.0, asset_id="roto", rationale="x")
    )

    resultado = render(con, tmp_path / "falta.mp4", settings, assets=bundle)
    assert resultado.path.is_file()
    assert not any("b-roll" in a for a in resultado.applied)


def test_los_efectos_de_sonido_se_oyen(
    base_sin_zoom, settings: Settings, tmp_path: Path
) -> None:
    """Se sintetizan al vuelo y tienen que llegar a la mezcla final."""
    import wave

    from forge.plan.edl import SfxEffect
    from forge.tools import run as run_cmd

    base, sin_path = base_sin_zoom
    con = base.model_copy(deep=True)
    instantes = [5.0, 6.0, 7.0]
    for i, t in enumerate(instantes):
        con.effects.append(
            SfxEffect(id=f"s{i}", start=t, end=t + 0.4, asset_id="impact",
                      gain_db=-3.0, rationale="prueba")
        )

    con_path = tmp_path / "sfx.mp4"
    resultado = render(con, con_path, settings)
    assert any("efectos de sonido" in a for a in resultado.applied)

    def envolvente(video: Path) -> tuple[np.ndarray, int]:
        wav = tmp_path / f"{video.stem}.wav"
        run_cmd([ffmpeg_bin(settings), "-hide_banner", "-loglevel", "error", "-y",
                 "-nostdin", "-i", video, "-ac", "1", "-ar", "48000",
                 "-c:a", "pcm_s16le", wav], timeout=300)
        with wave.open(str(wav)) as fh:
            datos = np.frombuffer(fh.readframes(fh.getnframes()), dtype=np.int16)
        muestras = datos.astype(np.float32) / 32768.0
        paso = 48000 // 200
        recorte = muestras[: len(muestras) // paso * paso].reshape(-1, paso)
        return np.abs(recorte).max(axis=1), 200

    sin_env, tasa = envolvente(sin_path)
    con_env, _ = envolvente(con_path)

    for t in instantes:
        i = int(t * tasa)
        ventana = slice(i, i + int(0.4 * tasa))
        assert float(con_env[ventana].max()) > float(sin_env[ventana].max()) * 1.5, (
            f"no se oye el golpe en {t}s"
        )

    # Y donde no hay efecto, el audio no se toca.
    i = int(2.0 * tasa)
    assert float(con_env[i:i + 40].max()) == pytest.approx(
        float(sin_env[i:i + 40].max()), rel=0.2
    )
