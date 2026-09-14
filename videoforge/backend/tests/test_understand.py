"""Tests de la colocacion de b-roll y de la identificacion de contenido."""

from __future__ import annotations

import copy
from pathlib import Path

import pytest

from forge.analysis.ocr import ScreenText, recurring_terms
from forge.analysis.types import Transcript, TranscriptSegment, Word
from forge.analysis.vision import NullTagger, preprocess
from forge.assets.providers import build_providers
from forge.assets.types import AssetBundle
from forge.fixtures import synthetic_guide_analysis
from forge.plan.broll import find_topic_moments, plan_broll
from forge.plan.planner import build_edl
from forge.plan.styles import load_style
from forge.understand.profile import Domain, build_profile


def _transcript_por_temas(temas: list[tuple[str, float]]) -> Transcript:
    """Transcript donde cada tramo habla de algo distinto."""
    segmentos = []
    for texto, inicio in temas:
        t = inicio
        palabras = []
        for p in texto.split():
            palabras.append(Word(start=round(t, 2), end=round(t + 0.35, 2), text=p))
            t += 0.45
        segmentos.append(
            TranscriptSegment(start=inicio, end=t, text=texto, words=palabras)
        )
    return Transcript(language="es", segments=segmentos)


TEMAS = [
    ("vamos a configurar el router de la casa", 0.0),
    ("el router necesita la contrasena wifi", 40.0),
    ("ahora abrimos el panel de google chrome", 80.0),
    ("en chrome buscamos la pagina de ajustes", 120.0),
    ("la base de datos guarda toda la informacion", 160.0),
    ("esa base tiene que estar protegida", 200.0),
    ("por ultimo revisamos el firewall del sistema", 240.0),
]


@pytest.fixture
def analysis_por_temas():
    a = synthetic_guide_analysis(300.0)
    a.transcript = _transcript_por_temas(TEMAS)
    return a


@pytest.fixture
def biblioteca(tmp_path: Path) -> Path:
    for nombre in (
        "router-wifi-casa.mp4",
        "google-chrome-navegador.jpg",
        "base-de-datos-servidor.mp4",
        "firewall-seguridad.png",
    ):
        (tmp_path / nombre).write_bytes(b"x" * 100)
    return tmp_path


# -- deteccion de temas ----------------------------------------------------


def test_encuentra_donde_se_nombra_algo_concreto(analysis_por_temas) -> None:
    edl = build_edl(analysis_por_temas, "tutorial")
    momentos = find_topic_moments(edl, analysis_por_temas.transcript)
    assert momentos
    consultas = " ".join(m.query for m in momentos)
    assert "chrome" in consultas or "base" in consultas


def test_las_palabras_comunes_no_disparan_b_roll() -> None:
    """Si todo el video dice lo mismo, no hay nada distintivo que ilustrar."""
    a = synthetic_guide_analysis(300.0)
    a.transcript = _transcript_por_temas([("esto es lo mismo siempre", t) for t in range(0, 280, 20)])
    edl = build_edl(a, "tutorial")
    assert find_topic_moments(edl, a.transcript) == []


def test_los_momentos_salen_en_tiempo_de_montaje(analysis_por_temas) -> None:
    edl = build_edl(analysis_por_temas, "tutorial")
    for m in find_topic_moments(edl, analysis_por_temas.transcript):
        assert 0 <= m.start < edl.duration + 1e-6


# -- colocacion ------------------------------------------------------------


def test_coloca_material_donde_se_nombra_algo(analysis_por_temas, biblioteca) -> None:
    edl = build_edl(analysis_por_temas, "tutorial")
    bundle = AssetBundle()
    proveedores = build_providers(analysis_por_temas, local_dir=biblioteca, allow_network=False)

    elegidos, _ = plan_broll(
        edl, analysis_por_temas.transcript, proveedores, load_style("tutorial").broll, bundle
    )
    assert elegidos
    assert all(e.asset_id in bundle.assets for e in elegidos)


def test_elige_el_material_que_encaja_con_lo_que_se_dice(
    analysis_por_temas, biblioteca
) -> None:
    """Es el requisito de fondo: si hablas de Chrome, sale Chrome."""
    edl = build_edl(analysis_por_temas, "tutorial")
    bundle = AssetBundle()
    proveedores = build_providers(analysis_por_temas, local_dir=biblioteca, allow_network=False)

    elegidos, _ = plan_broll(
        edl, analysis_por_temas.transcript, proveedores, load_style("tutorial").broll, bundle
    )
    por_consulta = {e.query: bundle.get(e.asset_id) for e in elegidos}
    aciertos = [
        q for q, asset in por_consulta.items()
        if asset and any(p in (asset.id or "") for p in q.split())
    ]
    assert aciertos, f"ninguna consulta encontro material acorde: {list(por_consulta)}"


def test_nunca_repite_el_mismo_material(analysis_por_temas) -> None:
    edl = build_edl(analysis_por_temas, "tutorial")
    bundle = AssetBundle()
    proveedores = build_providers(analysis_por_temas, allow_network=False)

    elegidos, _ = plan_broll(
        edl, analysis_por_temas.transcript, proveedores, load_style("tutorial").broll, bundle
    )
    usados = [e.asset_id for e in elegidos]
    assert len(usados) == len(set(usados))


def test_respeta_el_tope_de_cobertura(analysis_por_temas) -> None:
    """El material de apoyo no puede tapar el video mas de lo que dice el estilo."""
    edl = build_edl(analysis_por_temas, "tutorial")
    reglas = load_style("tutorial").broll
    bundle = AssetBundle()

    elegidos, _ = plan_broll(
        edl, analysis_por_temas.transcript,
        build_providers(analysis_por_temas, allow_network=False), reglas, bundle,
    )
    cubierto = sum(e.duration for e in elegidos)
    assert cubierto <= reglas.max_coverage * edl.duration + 1e-6


def test_respeta_la_separacion_minima(analysis_por_temas) -> None:
    edl = build_edl(analysis_por_temas, "tutorial")
    reglas = load_style("tutorial").broll
    elegidos, _ = plan_broll(
        edl, analysis_por_temas.transcript,
        build_providers(analysis_por_temas, allow_network=False), reglas, AssetBundle(),
    )
    for anterior, siguiente in zip(elegidos, elegidos[1:]):
        assert siguiente.start - anterior.start >= reglas.min_gap - 1e-6


def test_sin_transcripcion_no_hay_b_roll() -> None:
    """Sin saber de que se habla, insertar material seria decorar a ciegas."""
    a = synthetic_guide_analysis(300.0, with_transcript=False)
    edl = build_edl(a, "tutorial")
    elegidos, reservas = plan_broll(
        edl, None, build_providers(a, allow_network=False), load_style("tutorial").broll,
        AssetBundle(),
    )
    assert elegidos == [] and reservas == []


def test_el_estilo_puede_desactivarlo(analysis_por_temas) -> None:
    edl = build_edl(analysis_por_temas, "tutorial")
    reglas = load_style("clean-corporate").broll
    assert not reglas.enabled
    elegidos, _ = plan_broll(
        edl, analysis_por_temas.transcript,
        build_providers(analysis_por_temas, allow_network=False), reglas, AssetBundle(),
    )
    assert elegidos == []


def test_cada_insercion_explica_por_que(analysis_por_temas, biblioteca) -> None:
    edl = build_edl(analysis_por_temas, "tutorial")
    elegidos, _ = plan_broll(
        edl, analysis_por_temas.transcript,
        build_providers(analysis_por_temas, local_dir=biblioteca, allow_network=False),
        load_style("tutorial").broll, AssetBundle(),
    )
    for e in elegidos:
        assert "hablas de" in e.rationale
        assert e.query


def test_el_planner_lo_integra(analysis_por_temas, biblioteca) -> None:
    from forge.plan.edl import EffectKind

    bundle = AssetBundle()
    edl = build_edl(
        analysis_por_temas, "tutorial",
        providers=build_providers(analysis_por_temas, local_dir=biblioteca, allow_network=False),
        assets=bundle,
    )
    assert edl.effects_of(EffectKind.BROLL)
    assert bundle.assets
    assert any("Material de apoyo" in n for n in edl.notes)


# -- identificacion de contenido -------------------------------------------


def test_una_guia_hablada_y_quieta_es_un_tutorial() -> None:
    a = synthetic_guide_analysis(300.0)
    perfil = build_profile(a)
    assert perfil.domain is Domain.TUTORIAL
    assert perfil.suggested_style == "tutorial"


def test_hablada_pero_muy_movida_es_gameplay_comentado() -> None:
    a = synthetic_guide_analysis(300.0)
    a.motion.flow = [0.8] * len(a.motion.flow)
    assert build_profile(a).domain is Domain.GAMEPLAY_COMENTADO


def test_sin_voz_y_movida_es_gameplay() -> None:
    a = synthetic_guide_analysis(300.0)
    a.transcript = None
    a.motion.flow = [0.8] * len(a.motion.flow)
    assert build_profile(a).domain is Domain.GAMEPLAY


def test_sin_voz_y_quieta_es_material_silencioso() -> None:
    a = synthetic_guide_analysis(300.0)
    a.transcript = None
    a.motion.flow = [0.02] * len(a.motion.flow)
    assert build_profile(a).domain is Domain.SILENCIOSO


def test_la_voz_manda_sobre_la_pista_de_audio_declarada() -> None:
    """Lo que importa es si alguien habla, no lo que diga el contenedor."""
    a = synthetic_guide_analysis(300.0)
    a.media.audio = None
    assert build_profile(a).domain is Domain.TUTORIAL


def test_el_texto_en_pantalla_identifica_el_tema() -> None:
    a = synthetic_guide_analysis(300.0)
    pantalla = [
        ScreenText(at=float(t), words=["Palworld", "Construir"] if t % 2 else ["Palworld", "Inventario"])
        for t in range(0, 30, 3)
    ]
    perfil = build_profile(a, screen_text=pantalla)
    assert perfil.topic == "palworld"
    assert any(e.source == "pantalla" for e in perfil.entities)


def test_mas_fuentes_dan_mas_confianza() -> None:
    a = synthetic_guide_analysis(300.0)
    pantalla = [ScreenText(at=float(t), words=["Palworld"]) for t in range(0, 30, 3)]
    assert build_profile(a, screen_text=pantalla).confidence > build_profile(a).confidence


def test_el_perfil_dice_que_senales_le_faltan() -> None:
    perfil = build_profile(synthetic_guide_analysis(300.0))
    assert perfil.missing
    assert any("CLIP" in m for m in perfil.missing)


def test_nunca_sale_un_perfil_vacio() -> None:
    """El ritmo esta siempre disponible: en el peor caso se sabe eso."""
    a = synthetic_guide_analysis(300.0, with_transcript=False)
    perfil = build_profile(a)
    assert perfil.domain is not Domain.DESCONOCIDO
    assert perfil.suggested_style
    assert perfil.confidence > 0


def test_las_palabras_clave_son_las_distintivas(analysis_por_temas) -> None:
    claves = build_profile(analysis_por_temas).keywords
    assert claves
    assert any(k in ("router", "chrome", "base", "firewall") for k in claves)


# -- OCR y vision (utilidades sin dependencias) ----------------------------


def test_los_terminos_recurrentes_ganan_a_los_de_paso() -> None:
    lecturas = [
        ScreenText(at=1, words=["Palworld", "Menu", "Construir"]),
        ScreenText(at=5, words=["Palworld", "Inventario"]),
        ScreenText(at=9, words=["Palworld", "Construir"]),
    ]
    terminos = dict(recurring_terms(lecturas))
    assert terminos["palworld"] == 3
    assert "menu" not in terminos, "aparece una sola vez: es ruido"


def test_una_palabra_repetida_en_la_misma_pantalla_cuenta_una_vez() -> None:
    lecturas = [ScreenText(at=1, words=["Menu", "Menu", "Menu"])]
    assert recurring_terms(lecturas, min_appearances=2) == []


def test_el_preprocesado_de_clip_tiene_la_forma_correcta() -> None:
    import numpy as np

    salida = preprocess(np.full((224, 224, 3), 128, dtype=np.uint8))
    assert salida.shape == (1, 3, 224, 224)
    assert salida.dtype == np.float32


def test_sin_modelo_el_etiquetador_no_estorba() -> None:
    tagger = NullTagger()
    assert not tagger.available
    assert tagger.tag([], []) == []
