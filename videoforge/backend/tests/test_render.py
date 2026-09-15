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


def test_el_master_se_mide_de_verdad(render_basico) -> None:
    """La sonoridad que se informa es la del fichero, no la de la primera pasada.

    Antes se informaba la medida *antes* de masterizar, que es justo el numero
    que no vale: el limitador se come parte de la ganancia.
    """
    assert render_basico.measured_lufs is not None
    master = [a for a in render_basico.applied if a.startswith("master ")]
    assert master, render_basico.applied
    assert "-1.5 dBTP" in master[0]


# -- subtitulos quemados ---------------------------------------------------


def test_los_subtitulos_acaban_en_la_imagen(
    sample_video: Path, settings: Settings, tmp_path: Path
) -> None:
    """Se renderiza el mismo montaje con y sin subtitulos y se restan.

    Comparar contra el video original no sirve: el fixture tiene una barra
    clara justo donde va el texto, asi que contar pixeles blancos daba el mismo
    numero con subtitulos y sin ellos, y el test pasaba sin comprobar nada.
    Restando dos renders identicos salvo los subtitulos, lo que queda **es** el
    texto.
    """
    from forge.plan.edl import EffectKind

    analysis, _ = analyze(sample_video, settings, skip_speech=True)
    palabras = [Word(start=0.4 + i * 0.45, end=0.7 + i * 0.45, text=t)
                for i, t in enumerate(["abrimos", "el", "menu"])]
    analysis.transcript = Transcript(
        language="es",
        segments=[TranscriptSegment(start=0.4, end=2.0, text="abrimos el menu", words=palabras)],
    )
    edl = build_edl(analysis, "tutorial")
    subtitulos = edl.effects_of(EffectKind.CAPTION)
    assert subtitulos, "el estilo tutorial deberia poner subtitulos"

    con = tmp_path / "con-subs.mp4"
    render(edl, con, settings)

    edl.effects = [e for e in edl.effects if e.kind is not EffectKind.CAPTION]
    sin = tmp_path / "sin-subs.mp4"
    render(edl, sin, settings)

    # Un instante que cae dentro del primer subtitulo, en tiempo de montaje.
    t = (subtitulos[0].start + subtitulos[0].end) / 2.0
    a = extract_frames_at(sin, settings, [t], width=640, height=360)[0]
    b = extract_frames_at(con, settings, [t], width=640, height=360)[0]

    diferencia = np.abs(b.astype(int) - a.astype(int)).max(axis=2)
    tocados = int((diferencia > 40).sum())
    assert tocados > 300, f"solo cambiaron {tocados} pixeles: no hay texto quemado"

    # Y esta donde el plan dijo que estaria. En este fixture el foco cae abajo,
    # asi que el subtitulo se sube: eso es la colocacion consciente de la
    # saliencia, y se comprueba aqui de punta a punta.
    filas = np.where(diferencia.max(axis=1) > 40)[0]
    centro = float(filas.mean()) / 360.0
    if subtitulos[0].position == "top":
        assert centro < 0.35, f"se pidio arriba y el texto salio a {centro:.0%} de altura"
    else:
        assert centro > 0.65, f"se pidio abajo y el texto salio a {centro:.0%} de altura"


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


def test_el_b_roll_entra_y_sale_con_un_fundido(
    base_sin_zoom, settings: Settings, tmp_path: Path
) -> None:
    """Aparecer de golpe a pantalla completa se lee como un fallo.

    Se mide cuanto tapa el material en tres instantes: recien entrado, en medio
    y recien salido. En los bordes tiene que tapar **menos** que en el centro,
    que es lo que significa que hay fundido.
    """
    from forge.assets.types import Asset, AssetBundle, AssetKind
    from forge.plan.edl import BrollEffect

    base, sin_path = base_sin_zoom
    bundle = AssetBundle()
    bundle.add(
        Asset(id="self-y", kind=AssetKind.SELF, provider="self",
              source_start=10.6, source_end=12.4)
    )
    con = base.model_copy(deep=True)
    con.effects.append(
        BrollEffect(id="bry", start=1.0, end=4.0, asset_id="self-y",
                    mode="full", rationale="prueba")
    )
    con_path = tmp_path / "broll-fade.mp4"
    render(con, con_path, settings, assets=bundle)

    def tapa(t: float) -> float:
        a = _frame_exacto(sin_path, t, settings).astype(np.float32)
        b = _frame_exacto(con_path, t, settings).astype(np.float32)
        return float(np.abs(b - a).mean())

    entrando, medio = tapa(1.05), tapa(2.5)
    assert entrando < medio * 0.8, f"entra de golpe: {entrando:.1f} vs {medio:.1f}"
    assert medio > 10, "el material no tapa nada en medio"


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


# -- la imagen tiene que sobrevivir al render ------------------------------


def _brillo_medio(path: Path, t: float, settings: Settings) -> float:
    """Luminosidad media de un fotograma, en 0-255."""
    proc = subprocess.run(
        [str(ffmpeg_bin(settings)), "-hide_banner", "-loglevel", "error", "-nostdin",
         "-i", str(path), "-ss", f"{t:.3f}", "-frames:v", "1",
         "-vf", "scale=160:90", "-f", "rawvideo", "-pix_fmt", "gray", "-"],
        capture_output=True, timeout=300,
    )
    datos = np.frombuffer(proc.stdout[: 160 * 90], dtype=np.uint8)
    return float(datos.mean()) if datos.size else 0.0


def test_la_imagen_sobrevive_al_render(
    sample_video: Path, settings: Settings, tmp_path: Path
) -> None:
    """El render no puede apagar la imagen.

    Este es el test que faltaba: durante un tiempo el renderer producia un MP4
    con la duracion correcta, los streams correctos, el audio correcto y los
    subtitulos correctos... **completamente negro**, porque `fade=t=out` deja el
    video a oscuras desde la transicion hasta el final. Ninguna comprobacion de
    duracion, formato o sonido lo detecta: hay que mirar la luminosidad.
    """
    analysis, _ = analyze(sample_video, settings, skip_speech=True)
    edl = build_edl(analysis, "tutorial")

    out = tmp_path / "brillo.mp4"
    render(edl, out, settings)

    for t in (1.0, 3.0, 6.0):
        origen = edl.timeline_to_source(t)
        assert origen is not None
        original = _brillo_medio(sample_video, origen, settings)
        editado = _brillo_medio(out, t, settings)
        assert editado > original * 0.5, (
            f"en {t}s la imagen se apago: {editado:.1f} frente a {original:.1f}"
        )


def test_una_transicion_solo_oscurece_su_propio_tramo(
    base_sin_zoom, settings: Settings, tmp_path: Path
) -> None:
    """Una transicion es un parpadeo, no un apagon."""
    from forge.plan.edl import TransitionEffect

    base, _ = base_sin_zoom
    con = base.model_copy(deep=True)
    centro = min(4.0, base.duration / 2)
    con.effects.append(
        TransitionEffect(id="t", start=centro - 0.12, end=centro + 0.12, rationale="prueba")
    )

    out = tmp_path / "transicion.mp4"
    render(con, out, settings)

    en_la_transicion = _brillo_medio(out, centro, settings)
    despues = _brillo_medio(out, centro + 1.0, settings)
    antes = _brillo_medio(out, max(0.2, centro - 1.0), settings)

    assert en_la_transicion < 12, "la transicion no oscurece nada"
    assert despues > 20, "el video se quedo oscuro despues de la transicion"
    assert antes > 20, "el video ya estaba oscuro antes de la transicion"


def test_el_zoom_sigue_moviendose_mientras_aguanta(
    sample_video: Path, settings: Settings, tmp_path: Path
) -> None:
    """Un zoom que entra y se queda clavado deja la imagen congelada.

    En una grabacion de pantalla el contenido tampoco se mueve, asi que durante
    los casi dos segundos que dura el zoom no cambia un solo pixel y parece un
    fotograma pegado.

    Se comparan **dos renders identicos salvo la deriva**, en el mismo instante:
    asi lo unico que cambia entre ellos es el encuadre. Comparar dos instantes
    del mismo render no sirve, porque el contenido cambia por su cuenta y tapa
    el efecto.

    El montaje es de un solo clip a proposito: un zoom que cruza un corte se
    reinicia en el clip siguiente (cada clip lleva su propio `zoompan`), y eso
    enturbiaria la medida.
    """
    from forge.plan.edl import EDL, Clip, RenderSpec

    info = probe(sample_video, settings)

    def _render_con(deriva: float, nombre: str) -> Path:
        edl = EDL(
            source=str(sample_video),
            source_duration=info.duration,
            render=RenderSpec(width=640, height=360, fps=30),
            timeline=[Clip(id="c0", source_start=0.0, source_end=6.0)],
            effects=[
                PunchInEffect(
                    id="p0", start=1.0, end=5.0,
                    rect=Rect.centered(0.5, 0.5, 1.30),
                    ease_seconds=0.3, drift=deriva,
                )
            ],
        )
        salida = tmp_path / nombre
        render(edl, salida, settings)
        return salida

    con = _render_con(0.25, "con-deriva.mp4")
    sin = _render_con(0.0, "sin-deriva.mp4")

    def _diferencia(t: float) -> float:
        a = _frame_exacto(sin, t, settings)
        b = _frame_exacto(con, t, settings)
        return float(np.abs(b.astype(int) - a.astype(int)).mean())

    # Los instantes se eligen sobre tramos con textura: en un tramo de color
    # plano, ampliar no cambia un solo pixel y la medida daria cero aunque el
    # zoom este funcionando.
    medidas = [(t, _diferencia(t)) for t in (1.4, 2.5, 3.5)]

    assert medidas[0][1] < 5.0, f"nada mas entrar ya deberia coincidir: {medidas}"
    assert medidas[-1][1] > 8.0, f"la deriva no se nota al final: {medidas}"
    assert [d for _, d in medidas] == sorted(d for _, d in medidas), (
        f"la deriva tiene que crecer de forma continua: {medidas}"
    )


# -- rotulos de capitulo ---------------------------------------------------


def test_el_rotulo_de_capitulo_se_dibuja(
    sample_video: Path, settings: Settings, tmp_path: Path
) -> None:
    """Los capitulos se planificaban y no se dibujaba ni uno.

    El EDL prometia rotulos que no existian en el video, y el medidor de
    saturacion los contaba como texto en pantalla. Aqui se renderiza el mismo
    montaje con y sin rotulo y se resta.
    """
    from forge.plan.edl import EDL, Clip, RenderSpec, TextCardEffect

    info = probe(sample_video, settings)

    def _render(con_rotulo: bool, nombre: str) -> Path:
        edl = EDL(
            source=str(sample_video),
            source_duration=info.duration,
            render=RenderSpec(width=640, height=360, fps=30),
            timeline=[Clip(id="c0", source_start=0.0, source_end=6.0)],
            effects=(
                [TextCardEffect(id="k0", start=1.0, end=4.0,
                                text="Ajustes generales", subtitle="capitulo 1")]
                if con_rotulo else []
            ),
        )
        salida = tmp_path / nombre
        render(edl, salida, settings)
        return salida

    con = _render(True, "con-rotulo.mp4")
    sin = _render(False, "sin-rotulo.mp4")

    a = _frame_exacto(sin, 2.5, settings)
    b = _frame_exacto(con, 2.5, settings)
    diferencia = np.abs(b.astype(int) - a.astype(int)).max(axis=2)
    assert int((diferencia > 40).sum()) > 500, "no se dibujo el rotulo"

    # Arriba, para no chocar con los subtitulos, que van abajo.
    filas = np.where(diferencia.max(axis=1) > 40)[0]
    assert filas.mean() / 360 < 0.35, f"el rotulo salio a {filas.mean() / 360:.0%} de altura"

    # Y se va cuando le toca.
    fuera = np.abs(
        _frame_exacto(con, 5.2, settings).astype(int)
        - _frame_exacto(sin, 5.2, settings).astype(int)
    ).max()
    assert fuera <= 40, "el rotulo sigue en pantalla despues de su tramo"


# -- un render cortado no deja basura --------------------------------------


def test_un_render_a_medias_no_se_da_por_bueno(
    sample_video: Path, settings: Settings, tmp_path: Path
) -> None:
    """Mirar el tamano no basta: un MP4 cortado ocupa megas y parece correcto.

    Paso de verdad: un render de veinte minutos se corto a mitad y dejo un
    fichero de 9 MB sin indice, ilegible, que pasaba la comprobacion de tamano
    y se daba por terminado.
    """
    from forge.render.renderer import _check_output

    # Se reproduce como pasa de verdad: ffmpeg escribe el indice (`moov`) al
    # **final**, asi que un render interrumpido se queda sin el y el fichero es
    # ilegible aunque ocupe megas. Truncar un MP4 ya terminado no serviria de
    # ejemplo: ese lleva el indice delante por `+faststart` y se sigue leyendo.
    sin_indice = tmp_path / "a-medias.mp4"
    subprocess.run(
        [str(ffmpeg_bin(settings)), "-hide_banner", "-loglevel", "error", "-y",
         "-i", str(sample_video), "-c:v", "libx264", "-preset", "ultrafast",
         "-an", str(sin_indice)],
        check=True, capture_output=True, timeout=300,
    )
    datos = sin_indice.read_bytes()
    assert len(datos) > 3000
    sin_indice.write_bytes(datos[: len(datos) // 3])

    with pytest.raises(RenderError) as exc:
        _check_output(sin_indice, probe(sample_video, settings).duration, settings)
    mensaje = str(exc.value).lower()
    assert "no se puede leer" in mensaje or "se quedo en" in mensaje, mensaje


def test_un_render_completo_pasa_la_comprobacion(
    sample_video: Path, settings: Settings
) -> None:
    from forge.render.renderer import _check_output

    _check_output(sample_video, probe(sample_video, settings).duration, settings)


def test_un_render_mas_corto_de_lo_planificado_falla(
    sample_video: Path, settings: Settings
) -> None:
    """Un fichero legible pero que se quedo a mitad tampoco vale."""
    from forge.render.renderer import _check_output

    real = probe(sample_video, settings).duration
    with pytest.raises(RenderError, match="se quedo en"):
        _check_output(sample_video, real + 5.0, settings)


def test_si_el_render_falla_no_se_toca_el_anterior(
    sample_video: Path, settings: Settings, tmp_path: Path, monkeypatch
) -> None:
    """Relanzar un render que falla no puede costarte el que ya tenias.

    Se corta el encode a mitad a proposito, que es justo lo que pasa con un
    Ctrl-C o un apagon: lo que importa es que el destino siga como estaba y que
    no quede ningun fichero a medias rondando.
    """
    from forge.plan.edl import EDL, Clip, RenderSpec
    from forge.render import renderer as modulo

    destino = tmp_path / "salida.mp4"
    destino.write_bytes(b"el render bueno de ayer")

    edl = EDL(
        source=str(sample_video),
        source_duration=probe(sample_video, settings).duration,
        render=RenderSpec(width=640, height=360, fps=30),
        timeline=[Clip(id="c0", source_start=0.0, source_end=2.0)],
    )

    real = modulo._run_with_progress
    visto: list[Path] = []

    def _cortar(cmd, duracion, progress, etiqueta):
        if etiqueta == "renderizando":
            # El fichero a medias existe justo antes de reventar.
            parcial = Path(cmd[-1])
            parcial.write_bytes(b"datos a medias" * 200)
            visto.append(parcial)
            raise KeyboardInterrupt
        return real(cmd, duracion, progress, etiqueta)

    monkeypatch.setattr(modulo, "_run_with_progress", _cortar)

    with pytest.raises(KeyboardInterrupt):
        render(edl, destino, settings)

    assert visto, "no llego a lanzarse el encode"
    assert destino.read_bytes() == b"el render bueno de ayer", (
        "se cargo el render anterior"
    )
    assert not visto[0].exists(), f"quedo {visto[0].name} a medias"
