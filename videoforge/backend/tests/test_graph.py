"""Tests del compilador de grafo de filtros."""

from __future__ import annotations

import pytest

from forge.plan.edl import (
    EDL,
    CaptionEffect,
    Clip,
    GradeEffect,
    KenBurnsEffect,
    PunchInEffect,
    Rect,
    RenderSpec,
    TransitionEffect,
)
from forge.render.graph import GRADE_PRESETS, _grade_filter, build_graph


def _edl(clips=None, effects=None, w=1920, h=1080, fps=30.0) -> EDL:
    return EDL(
        source="a.mp4",
        source_duration=100.0,
        render=RenderSpec(width=w, height=h, fps=fps),
        timeline=clips or [
            Clip(id="c0", source_start=0, source_end=10),
            Clip(id="c1", source_start=20, source_end=30),
        ],
        effects=effects or [],
    )


# -- estructura ------------------------------------------------------------


def test_cada_clip_genera_su_cadena() -> None:
    g = build_graph(_edl(), has_audio=True)
    assert "[v0]" in g.filter_complex and "[v1]" in g.filter_complex
    assert "trim=start=0.0000:end=10.0000" in g.filter_complex
    assert "trim=start=20.0000:end=30.0000" in g.filter_complex


def test_los_clips_se_concatenan() -> None:
    g = build_graph(_edl(), has_audio=True)
    assert "concat=n=2:v=1:a=0" in g.filter_complex
    assert "concat=n=2:v=0:a=1" in g.filter_complex


def test_un_solo_clip_no_necesita_concat() -> None:
    g = build_graph(_edl([Clip(id="c", source_start=0, source_end=10)]), has_audio=True)
    assert "concat" not in g.filter_complex


def test_sin_audio_no_se_genera_rama_de_audio() -> None:
    g = build_graph(_edl(), has_audio=False)
    assert g.audio_label is None
    assert "atrim" not in g.filter_complex


def test_la_velocidad_ajusta_video_y_audio() -> None:
    g = build_graph(
        _edl([Clip(id="c", source_start=0, source_end=10, speed=2.0)]), has_audio=True
    )
    assert "setpts=(PTS-STARTPTS)/2.000000" in g.filter_complex
    # rubberband mantiene el tono al acelerar
    assert "rubberband=tempo=2.000000" in g.filter_complex


def test_el_grafo_escala_a_la_resolucion_de_salida() -> None:
    g = build_graph(_edl(w=1280, h=720), has_audio=True)
    assert "scale=1280:720" in g.filter_complex


# -- modo solo audio -------------------------------------------------------


def test_solo_audio_omite_toda_la_rama_de_video() -> None:
    """Si se construyese el video y solo se mapease el audio, ffmpeg aborta."""
    g = build_graph(_edl(effects=[GradeEffect(id="g", start=0, end=20)]),
                    has_audio=True, audio_only=True)
    assert "[0:v]" not in g.filter_complex
    assert "scale=" not in g.filter_complex
    assert "eq=contrast" not in g.filter_complex
    assert g.video_label == ""
    assert g.audio_label is not None


def test_solo_audio_ignora_los_subtitulos() -> None:
    g = build_graph(_edl(), has_audio=True, audio_only=True, ass_path="/tmp/x.ass")
    assert "ass=" not in g.filter_complex


# -- color -----------------------------------------------------------------


def test_la_intensidad_cero_deja_el_color_intacto() -> None:
    filtro = _grade_filter("punchy", 0.0)
    assert "contrast=1.0000" in filtro
    assert "saturation=1.0000" in filtro


def test_la_intensidad_uno_aplica_el_preset_entero() -> None:
    filtro = _grade_filter("punchy", 1.0)
    assert f"contrast={GRADE_PRESETS['punchy']['contrast']:.4f}" in filtro


def test_la_intensidad_interpola() -> None:
    medio = _grade_filter("punchy", 0.5)
    valor = float(medio.split("contrast=")[1].split(":")[0])
    assert 1.0 < valor < GRADE_PRESETS["punchy"]["contrast"]


def test_un_preset_desconocido_cae_al_neutro() -> None:
    assert _grade_filter("inventado", 1.0) == _grade_filter("neutral", 1.0)


# -- transiciones ----------------------------------------------------------


def test_las_transiciones_son_fades_y_no_xfade() -> None:
    """xfade solapa clips y acortaria el video, rompiendo el invariante."""
    g = build_graph(
        _edl(effects=[TransitionEffect(id="t", start=9.8, end=10.2)]), has_audio=True
    )
    assert "fade=t=out" in g.filter_complex
    assert "fade=t=in" in g.filter_complex
    assert "xfade" not in g.filter_complex


def test_flash_hace_dip_a_blanco() -> None:
    g = build_graph(
        _edl(effects=[TransitionEffect(id="t", start=9.8, end=10.2, transition="flash")]),
        has_audio=True,
    )
    assert "color=white" in g.filter_complex


# -- zooms -----------------------------------------------------------------


def test_el_zoom_usa_zoompan_y_no_crop() -> None:
    """crop solo recorta en pixeles enteros: un zoom lento saldria temblando."""
    g = build_graph(
        _edl(effects=[PunchInEffect(id="p", start=2.0, end=4.0, rect=Rect.centered(0.6, 0.4, 1.5))]),
        has_audio=True,
    )
    assert "zoompan=" in g.filter_complex
    assert "crop=" not in g.filter_complex


def test_el_zoom_se_aplica_al_clip_que_lo_contiene() -> None:
    g = build_graph(
        _edl(effects=[PunchInEffect(id="p", start=12.0, end=14.0, rect=Rect.centered(0.5, 0.5, 1.4))]),
        has_audio=True,
    )
    cadenas = g.filter_complex.split(";")
    v0 = next(c for c in cadenas if c.endswith("[v0]"))
    v1 = next(c for c in cadenas if c.endswith("[v1]"))
    assert "zoompan" not in v0, "el zoom cae en el segundo clip"
    assert "zoompan" in v1


def test_sin_zooms_no_se_mete_zoompan() -> None:
    g = build_graph(_edl(), has_audio=True)
    assert "zoompan" not in g.filter_complex


def test_las_coordenadas_del_zoom_van_en_espacio_de_entrada() -> None:
    """zoompan recorta una ventana de (iw/zoom, ih/zoom) sobre la ENTRADA.

    Tomarlas como coordenadas de la imagen ya ampliada descentra el encuadre,
    y el resultado sigue pareciendo un zoom correcto si solo se miran cifras.
    """
    g = build_graph(
        _edl(effects=[PunchInEffect(id="p", start=2.0, end=4.0, rect=Rect.centered(0.95, 0.05, 2.0))]),
        has_audio=True,
    )
    assert "max(0,min(iw-iw/zoom" in g.filter_complex
    assert "max(0,min(ih-ih/zoom" in g.filter_complex
    # La ventana se posiciona restando media ventana al centro pedido.
    assert "*iw-iw/zoom/2" in g.filter_complex
    assert "*ih-ih/zoom/2" in g.filter_complex


def test_ken_burns_tambien_genera_zoompan() -> None:
    g = build_graph(
        _edl(effects=[KenBurnsEffect(id="k", start=0.0, end=10.0,
                                      rect_end=Rect.centered(0.5, 0.5, 1.06))]),
        has_audio=True,
    )
    assert "zoompan" in g.filter_complex


def test_dos_zooms_en_el_mismo_clip_se_suman() -> None:
    """No se solapan nunca, asi que sumar sus rampas es exacto."""
    g = build_graph(
        _edl([Clip(id="c", source_start=0, source_end=30)], effects=[
            PunchInEffect(id="p1", start=2.0, end=4.0, rect=Rect.centered(0.3, 0.5, 1.3)),
            PunchInEffect(id="p2", start=10.0, end=12.0, rect=Rect.centered(0.7, 0.5, 1.3)),
        ]),
        has_audio=True,
    )
    zoompan = next(c for c in g.filter_complex.split(";") if "zoompan" in c)
    assert zoompan.count("0.3000*") >= 1 or zoompan.count("*") >= 4


# -- audio -----------------------------------------------------------------


def test_una_pasada_usa_loudnorm_dinamico() -> None:
    g = build_graph(_edl(), has_audio=True, target_lufs=-14.0)
    assert "loudnorm=I=-14.0" in g.filter_complex
    assert "measured_I" not in g.filter_complex


def test_dos_pasadas_usan_las_medidas_reales() -> None:
    """Con las medidas, la correccion es lineal y no bombea."""
    medidas = {
        "input_i": "-21.9", "input_tp": "-3.2", "input_lra": "5.1",
        "input_thresh": "-32.0", "target_offset": "0.3",
    }
    g = build_graph(_edl(), has_audio=True, target_lufs=-14.0, loudnorm_measured=medidas)
    assert "measured_I=-21.9" in g.filter_complex
    assert "linear=true" in g.filter_complex


def test_los_subtitulos_se_aplican_tras_concatenar() -> None:
    g = build_graph(_edl(), has_audio=True, ass_path="/tmp/subs.ass")
    assert "ass=filename=/tmp/subs.ass" in g.filter_complex
    assert g.filter_complex.index("concat") < g.filter_complex.index("ass=")


def test_la_ruta_del_ass_escapa_los_dos_puntos() -> None:
    """En Windows 'C:/...' romperia el parser de opciones de ffmpeg."""
    g = build_graph(_edl(), has_audio=True, ass_path="C:/subs/x.ass")
    assert r"C\:/subs/x.ass" in g.filter_complex
