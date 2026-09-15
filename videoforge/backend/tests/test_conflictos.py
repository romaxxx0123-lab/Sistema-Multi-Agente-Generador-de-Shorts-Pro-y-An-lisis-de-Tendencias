"""Efectos que dejan sin sentido a otros efectos.

Cada planner decide bien lo suyo y ninguno mira lo que han decidido los demas.
Por separado las decisiones son razonables; juntas, no: un recuadro que senala
un boton **debajo** de un b-roll a pantalla completa senala una imagen que ya
no esta, y un zoom dentro de un tramo acelerado ocho veces no se lee como un
zoom sino como un tiron.

El balanceador de saturacion tampoco lo veia: solo comparaba efectos del mismo
tipo entre si.

Quitarlos es lo correcto y no solo lo comodo: un efecto tapado no se ve pero
**cuenta** en el medidor de saturacion, y ocupa un hueco que podria llevar algo
que si se vea.
"""

from __future__ import annotations

from forge.plan.conflicts import conflicts_with, resolve
from forge.plan.edl import (
    EDL,
    BrollEffect,
    CalloutEffect,
    Clip,
    EffectKind,
    KenBurnsEffect,
    PunchInEffect,
    Rect,
    RenderSpec,
    TextCardEffect,
)


def _edl(clips=None, duracion: float = 60.0) -> EDL:
    return EDL(
        source="a.mp4",
        source_duration=duracion,
        render=RenderSpec(width=1920, height=1080, fps=30),
        timeline=clips or [Clip(id="c0", source_start=0.0, source_end=duracion)],
    )


def _broll(start=10.0, end=14.0, mode="full") -> BrollEffect:
    return BrollEffect(id="br0", start=start, end=end, asset_id="a1", mode=mode)


def _callout(start=11.0, end=13.0) -> CalloutEffect:
    return CalloutEffect(
        id="ca0", start=start, end=end,
        rect=Rect(x=0.3, y=0.3, w=0.2, h=0.1), label="Guardar",
    )


def _punch(start=11.0, end=13.0) -> PunchInEffect:
    return PunchInEffect(id="pu0", start=start, end=end, rect=Rect.centered(0.5, 0.5, 1.3))


# -- debajo de un b-roll no se ve nada ------------------------------------


def test_entre_un_recuadro_y_un_broll_gana_el_recuadro() -> None:
    """Senalar el boton que nombras es ensenar; el material solo ilustra.

    Los dos se colocan por la misma senal -- estas nombrando algo -- asi que
    chocan a menudo. El material de apoyo puede esperar dos segundos; lo que no
    puede es taparte justo lo que estas explicando.
    """
    edl = _edl()
    edl.effects = [_broll(), _callout()]

    notas = resolve(edl)
    assert [e.kind for e in edl.effects] == [EffectKind.CALLOUT]
    assert notas and "recuadro" in notas[0]


def test_y_el_zoom_que_habia_debajo_de_ese_broll_se_salva() -> None:
    """Si el b-roll se va, lo que tapaba deja de estar tapado."""
    edl = _edl()
    edl.effects = [_broll(), _callout(), _punch()]

    resolve(edl)
    assert sorted(e.id for e in edl.effects) == ["ca0", "pu0"]


def test_y_un_zoom_tambien() -> None:
    edl = _edl()
    edl.effects = [_broll(), _punch()]

    resolve(edl)
    assert [e.kind for e in edl.effects] == [EffectKind.BROLL]


def test_un_broll_en_ventanita_no_tapa_nada() -> None:
    """En PiP el video base se sigue viendo, asi que no hay conflicto."""
    edl = _edl()
    edl.effects = [_broll(mode="pip"), _callout()]

    assert resolve(edl) == []
    assert len(edl.effects) == 2


# -- dos movimientos de camara a la vez -----------------------------------


def test_ken_burns_sobra_donde_ya_hay_un_zoom() -> None:
    """Ken Burns es relleno para planos quietos; con zoom no esta quieto."""
    edl = _edl()
    edl.effects = [
        _punch(),
        KenBurnsEffect(
            id="kb0", start=10.0, end=15.0,
            rect_start=Rect(), rect_end=Rect.centered(0.5, 0.5, 1.06),
        ),
    ]

    resolve(edl)
    assert [e.id for e in edl.effects] == ["pu0"], "se queda el que tiene motivo"


# -- dentro de un avance rapido -------------------------------------------


def test_un_zoom_dentro_de_una_espera_acelerada_sobra() -> None:
    edl = _edl(clips=[
        Clip(id="c0", source_start=0.0, source_end=10.0),
        Clip(id="c1", source_start=10.0, source_end=90.0, speed=8.0),
        Clip(id="c2", source_start=90.0, source_end=100.0),
    ])
    edl.effects = [PunchInEffect(id="pu0", start=11.0, end=13.0, rect=Rect())]

    notas = resolve(edl)
    assert edl.effects == []
    assert "avance rapido" in notas[0]


def test_fuera_del_tramo_acelerado_el_zoom_se_queda() -> None:
    edl = _edl(clips=[
        Clip(id="c0", source_start=0.0, source_end=10.0),
        Clip(id="c1", source_start=10.0, source_end=90.0, speed=8.0),
    ])
    edl.effects = [PunchInEffect(id="pu0", start=2.0, end=4.0, rect=Rect())]

    assert resolve(edl) == []
    assert len(edl.effects) == 1


# -- dos graficos a la vez ------------------------------------------------


def test_el_rotulo_de_capitulo_gana_al_broll() -> None:
    """El rotulo abre una parte del video; el b-roll puede ir un poco despues."""
    edl = _edl()
    edl.effects = [
        _broll(start=10.0, end=14.0),
        TextCardEffect(id="tc0", start=11.0, end=13.0, text="Instalar drivers"),
    ]

    resolve(edl)
    assert [e.id for e in edl.effects] == ["tc0"]


# -- lo que no se toca ----------------------------------------------------


def test_sin_conflicto_no_se_quita_nada() -> None:
    edl = _edl()
    edl.effects = [_broll(start=10.0, end=14.0), _callout(start=20.0, end=22.0)]

    assert resolve(edl) == []
    assert len(edl.effects) == 2


def test_un_efecto_bloqueado_no_se_quita() -> None:
    """Si alguien lo fijo a mano, manda esa decision."""
    edl = _edl()
    zoom = _punch()
    zoom.locked = True
    edl.effects = [_broll(), zoom]

    resolve(edl)
    assert len(edl.effects) == 2


def test_y_si_el_bloqueado_es_el_broll_el_recuadro_cede() -> None:
    """Debajo no se veria de todas formas, asi que se quita en vez de dejarlo."""
    edl = _edl()
    material = _broll()
    material.locked = True
    edl.effects = [material, _callout()]

    resolve(edl)
    assert [e.id for e in edl.effects] == ["br0"]


def test_la_nota_dice_cuantos_y_por_que() -> None:
    edl = _edl()
    edl.effects = [
        _broll(), _punch(),
        KenBurnsEffect(id="kb0", start=11.0, end=13.0,
                       rect_start=Rect(), rect_end=Rect.centered(0.5, 0.5, 1.06)),
    ]

    notas = resolve(edl)
    assert "2" in notas[0] and "no se verian" in notas[0]


# -- y el balanceador no puede volver a meterlos --------------------------


def test_el_balanceador_no_recupera_lo_que_no_se_veria() -> None:
    edl = _edl()
    edl.effects = [_broll()]

    assert conflicts_with(edl, _callout())
    assert not conflicts_with(edl, _callout(start=30.0, end=32.0))
