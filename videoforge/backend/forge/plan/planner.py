"""Construye el EDL completo a partir del analisis y un estilo.

Orden de trabajo, que no es arbitrario:

1. **Seleccion**: que entra y que se va. Define la duracion, y todo lo demas se
   coloca sobre esa linea de tiempo ya recortada.
2. **Enriquecimiento**: subtitulos, zooms, capitulos, transiciones y color.

Como los efectos se anaden *despues* del corte, quitarlos nunca descuadra el
montaje. Ese invariante es lo que permite al auto-balanceador de F4 podar sin
miedo.
"""

from __future__ import annotations

from ..analysis.ocr import recurring_terms
from ..analysis.types import Analysis
from ..assets.providers import BrollProvider
from ..assets.types import AssetBundle
from ..errors import PlanError
from .broll import plan_broll
from .callouts import plan_callouts
from .conflicts import resolve
from .captions import plan_captions
from .chapters import chapter_cards, plan_chapters
from .edl import (
    EDL,
    Clip,
    EffectKind,
    GradeEffect,
    LowerThirdEffect,
    MusicEffect,
    Rect,
    RenderSpec,
    TransitionEffect,
)
from .labels import plan_labels, plan_speed_tags
from .placement import ScreenUse
from .restraint import apply_restraint
from .emphasis import plan_ken_burns, plan_punch_ins
from .select import plan_selection
from .sfx import plan_sfx
from .styles import StylePreset, load_style

#: Resolucion de respaldo si el sondeo no trajo dimensiones.
FALLBACK_SIZE = (1920, 1080)
FALLBACK_FPS = 30.0


def _render_spec(analysis: Analysis) -> RenderSpec:
    v = analysis.media.video
    if v and v.display_width and v.display_height:
        width, height = v.display_width, v.display_height
    else:
        width, height = FALLBACK_SIZE
    fps = v.fps if v and v.fps else FALLBACK_FPS
    # x264 exige dimensiones pares.
    return RenderSpec(width=width - width % 2, height=height - height % 2, fps=fps)


#: Por debajo de esta fraccion del original, el montaje deja de ser un montaje.
#: Recortar tiempo muerto quita entre un 10% y un 30% de una guia; quedarse con
#: menos de un tercio significa que la deteccion de silencio se ha equivocado,
#: no que el video fuera casi todo silencio.
MIN_KEEP_RATIO = 0.35


def _clips_with_speed(seleccion) -> list[Clip]:
    """Convierte lo conservado en clips, partiendo donde va acelerado.

    Una espera que tu mismo anunciaste ("esto tarda un rato") no se recorta: se
    parte en su propio clip y se acelera. Es lo que hace un editor, y es mejor
    que cortarla porque quien mira **ve** que el proceso pasa.
    """
    clips: list[Clip] = []
    for a, b in seleccion.keeps:
        # Los tramos acelerados que caen dentro de este trozo, en orden.
        dentro = sorted(
            (max(a, x), min(b, y), v)
            for x, y, v in seleccion.speed_ranges
            if x < b and y > a and min(b, y) - max(a, x) > 0.2
        )

        cursor = a
        for inicio, fin, velocidad in dentro:
            if inicio - cursor > 0.05:
                clips.append(Clip(
                    id=f"clip{len(clips):04d}", source_start=round(cursor, 3),
                    source_end=round(inicio, 3), reason="tramo con contenido",
                ))
            clips.append(Clip(
                id=f"clip{len(clips):04d}", source_start=round(inicio, 3),
                source_end=round(fin, 3), speed=velocidad,
                reason=f"espera que anuncias, a {velocidad:.0f}x",
            ))
            cursor = fin

        if b - cursor > 0.05:
            clips.append(Clip(
                id=f"clip{len(clips):04d}", source_start=round(cursor, 3),
                source_end=round(b, 3), reason="tramo con contenido",
            ))
    return clips


def _build_timeline(analysis: Analysis, style: StylePreset) -> tuple[list[Clip], list[str]]:
    """Corta el video y explica por que."""
    seleccion = plan_selection(analysis, style.pacing, analysis.narrative)
    notas: list[str] = []
    if analysis.narrative:
        from ..understand.segments import summarize

        notas.append(f"Estructura entendida: {summarize(analysis.narrative)}.")
    if seleccion.unworthy_cuts:
        # Un corte se ve. Los que ahorraban una miseria no se hacen, y se dice:
        # es una decision de montaje, no un despiste (ver `plan/cuts.py`).
        ganancia = sum(r.duration for r in seleccion.unworthy_cuts)
        notas.append(
            f"{len(seleccion.unworthy_cuts)} cortes no se hicieron: entre todos "
            f"ahorraban {ganancia:.1f}s y cada uno se habria visto."
        )
    if seleccion.speed_ranges:
        ahorro = sum(
            (b - a) - (b - a) / v for a, b, v in seleccion.speed_ranges
        )
        notas.append(
            f"{len(seleccion.speed_ranges)} espera(s) que anuncias van aceleradas "
            f"en vez de cortadas: se ven y ocupan {ahorro:.0f}s menos."
        )

    # Red de seguridad. Si la seleccion se lleva casi todo el video, lo que
    # pasa no es que el video fuera silencio: es que el detector se equivoco, y
    # el resultado es un fichero de dos segundos entregado como si fuera el
    # montaje. Paso de verdad con audio de nivel plano (musica constante, una
    # voz ya muy comprimida, un tono): el umbral caia por encima de la senal
    # entera, todo era silencio, y el montaje salia con el 2% del original sin
    # un solo error por ningun lado.
    #
    # En ese caso no se recorta nada y se dice por que. Entregar el video sin
    # tocar es un mal resultado; entregar dos segundos es una perdida de datos.
    conservado = sum(b - a for a, b in seleccion.keeps)
    if analysis.duration > 0 and conservado < analysis.duration * MIN_KEEP_RATIO:
        notas.append(
            f"No se recorto nada: el analisis marcaba como silencio el "
            f"{100 - conservado / analysis.duration * 100:.0f}% del video, que no "
            f"puede ser. Suele pasar con musica de fondo constante o con un audio "
            f"ya muy comprimido, donde no se distingue la voz del fondo."
        )
        return [
            Clip(id="clip0000", source_start=0.0, source_end=analysis.duration,
                 reason="video completo: la deteccion de silencio no era fiable")
        ], notas

    clips = _clips_with_speed(seleccion)

    quitado = seleccion.removed_seconds
    if quitado > 0:
        porcentaje = quitado / analysis.duration * 100 if analysis.duration else 0
        # Agrupado por **que** se quito, con el desglose por papel entre
        # parentesis. Antes iba todo al mismo nivel -- "173s de silencio, 77s
        # de silencio en paso, 74s de silencio en aviso, 51s de silencio en
        # intro" -- que son cuatro entradas para decir una cosa, y ademas la
        # suma no cuadraba a ojo con el total.
        por_tipo: dict[str, float] = {}
        por_papel: dict[str, dict[str, float]] = {}
        for motivo, segundos in seleccion.reasons().items():
            clave, _, papel = motivo.partition(" en ")
            por_tipo[clave] = por_tipo.get(clave, 0.0) + segundos
            if papel:
                por_papel.setdefault(clave, {})[papel] = (
                    por_papel.setdefault(clave, {}).get(papel, 0.0) + segundos
                )

        partes = []
        for motivo, segundos in sorted(por_tipo.items(), key=lambda kv: -kv[1]):
            desglose = sorted(
                por_papel.get(motivo, {}).items(), key=lambda kv: -kv[1]
            )[:4]
            donde = (
                " (" + ", ".join(f"{p} {v:.0f}s" for p, v in desglose) + ")"
                if desglose else ""
            )
            partes.append(f"{segundos:.1f}s de {motivo}{donde}")
        detalle = ", ".join(partes)
        notas.append(f"Recortados {quitado:.1f}s ({porcentaje:.0f}%): {detalle}.")
    else:
        notas.append("No habia tiempo muerto que recortar.")

    return clips, notas


#: Margen para dar por bueno que un corte cae en el mismo sitio que otra cosa.
TRANSITION_SNAP = 0.35


def _cambia_el_plano(edl: EDL, analysis: Analysis, t: float) -> bool:
    """Si a los dos lados del corte se ve **otra cosa**.

    Se mira en el original y a los dos lados, no en el montaje: un corte puede
    haberse comido un silencio largo que se llevaba por delante un cambio de
    plano, y entonces el corte si cambia la imagen aunque el silencio no.
    """
    antes = edl.timeline_to_source(max(0.0, t - 0.05))
    despues = edl.timeline_to_source(min(edl.duration - 1e-3, t + 0.05))
    if antes is None or despues is None:
        return False
    a, b = analysis.shot_at(antes), analysis.shot_at(despues)
    return a is not None and b is not None and a.index != b.index


def _plan_transitions(
    edl: EDL, style: StylePreset, analysis: Analysis | None = None
) -> list[TransitionEffect]:
    """Pone transicion donde de verdad cambia algo.

    Antes se repartia una fraccion de los cortes de forma regular
    (`cortes[::paso]`), **sin mirar que corte era**. En una guia la mayoria de
    los cortes son silencios quitados dentro del mismo plano: ahi la imagen no
    cambia, y un fundido es un bajon de brillo en mitad de una pantalla quieta.

    Un corte merece transicion cuando a los dos lados se ve otra cosa (cambia
    el plano) o cuando ahi empieza un capitulo. Las dos cosas las sabe el
    sistema y no las usaba ninguna.
    """
    rules = style.transitions
    cortes = edl.cut_points()
    if not rules.enabled or not cortes or rules.fraction <= 0:
        return []

    capitulos = [c.start for c in edl.chapters]
    # El motivo no es un adorno del informe: decide **cuanto vale** esa
    # transicion. Empezar un capitulo es un cambio de verdad -- se pasa a otra
    # cosa -- y marcarlo ayuda a seguir el video. Que cambie el plano es solo
    # que la imagen ya cambiaba sola, y ahi un fundido decora, no informa.
    #
    # Cuanto vale decorar no lo decido yo, lo dice el estilo: `fraction` es su
    # apetito declarado de transiciones. Con 0.12 (una guia) una transicion
    # decorativa no se sostiene sola; con 0.50 (cine) es parte del lenguaje del
    # estilo y se queda.
    decorativa = round(0.18 + 0.45 * rules.fraction, 3)
    motivos: list[tuple[float, str, float]] = []
    for t in cortes:
        titulo = next(
            (c.title for c in edl.chapters if abs(c.start - t) <= TRANSITION_SNAP),
            None,
        )
        if titulo is not None and t > 0.01:
            motivos.append((t, f'ahi empieza el capitulo "{titulo}"', 0.60))
        elif analysis is not None and _cambia_el_plano(edl, analysis, t):
            motivos.append((t, "ahi cambia el plano", decorativa))

    if not motivos:
        if analysis is not None or capitulos:
            # Se sabia donde mirar y no habia nada: una guia de pantalla no
            # cambia de plano, y eso no es un fallo, es que no van transiciones.
            return []
        # Sin analisis no hay forma de saberlo; se cae al reparto de antes.
        cuantas = max(1, int(len(cortes) * rules.fraction))
        paso = max(1, len(cortes) // cuantas)
        # Sin saber que corte es, la transicion no informa de nada: vale lo
        # justo para que el suelo de justificacion la deje fuera salvo que el
        # estilo pida mucha carga.
        motivos = [(t, "corte repartido", 0.18) for t in cortes[::paso][:cuantas]]

    # El tope del estilo se sigue respetando: si cambia de plano cada dos
    # segundos, tampoco se pone una transicion en cada uno.
    tope = max(1, int(len(cortes) * rules.fraction))
    elegidos = motivos[:tope]

    return [
        TransitionEffect(
            id=f"trans{i:03d}",
            start=round(max(0.0, t - rules.duration / 2), 3),
            end=round(min(edl.duration, t + rules.duration / 2), 3),
            transition=rules.default,
            value_score=valor,
            cost_weight=0.30,
            rationale=f"transicion {rules.default} en {t:.1f}s: {motivo}",
        )
        for i, (t, motivo, valor) in enumerate(elegidos)
    ]


def _plan_grade(edl: EDL, style: StylePreset) -> list[GradeEffect]:
    rules = style.grade
    if rules.intensity <= 0.01:
        return []
    return [
        GradeEffect(
            id="grade000",
            start=0.0,
            end=round(edl.duration, 3),
            preset=rules.preset,
            intensity=rules.intensity,
            value_score=0.5,
            # El color cubre todo el video, pero su carga percibida es baja
            # mientras no sea agresivo.
            cost_weight=round(min(1.0, rules.intensity * 0.4), 3),
            rationale=f"color '{rules.preset}' al {rules.intensity:.0%}",
        )
    ]


#: Alto real de la caja de un rotulo, en fraccion de la altura del fotograma:
#: el cuerpo de letra (`LABEL_SIZE_RATIO`) mas el relleno que le pone ASS.
#: Sirve para colocar cosas **encima** de un rotulo sin que se pisen.
LABEL_BOX_HEIGHT = 0.075
#: Sangria del pie dentro del marco de la tarjeta.
RECALL_CAPTION_INSET = 0.012


#: Sitio de la placa de una tarjeta de capitulo: banda ancha arriba a la
#: izquierda, que es donde ya va su texto.
CARD_PLATE = Rect(x=0.05, y=0.07, w=0.42, h=0.13)


def _put_plates(efectos, rules) -> None:
    """Le pone a cada rotulo la imagen de fondo del estilo.

    Va aqui y no en cada planner porque el fondo es **uno para todos**: que
    cada rotulo tenga su propia cara se lee como un error, no como una
    decision, igual que pasaba con los colores.

    La tarjeta de capitulo no tenia sitio propio --- su texto lo coloca ASS con
    su margen --- asi que se le da uno: la imagen no se ajusta sola al texto.
    """
    fondo = (getattr(rules, "background", "") or "").strip()
    if not fondo:
        return
    for e in efectos:
        if e.kind is EffectKind.LOWER_THIRD:
            e.background = fondo
        elif e.kind is EffectKind.TEXT_CARD:
            e.background = fondo
            if e.rect is None:
                e.rect = CARD_PLATE.model_copy()


def _callout_labels(marcas, rules) -> list[LowerThirdEffect]:
    """La etiqueta con el nombre de lo que recuadra cada marca.

    El recuadro dice **donde** mirar y la etiqueta dice **que** es, que en una
    guia de un juego es la mitad del trabajo: un cuadro dorado sobre un numero
    no explica que ese numero son los fragmentos que te faltan.

    Sale como rotulo porque es una caja de color con texto, igual que el
    titulillo del recuerdo, y asi cuenta en el medidor como texto en pantalla.
    """
    if not getattr(rules, "label", False):
        return []
    salida = []
    for i, marca in enumerate(marcas):
        texto = (marca.label or "").strip()
        if not texto:
            continue
        # La caja del rotulo la dibuja ASS y se ajusta sola al texto, asi que
        # de esto solo manda la **esquina de arriba a la izquierda**. Hay que
        # dejar sitio para el alto real de esa caja (fuente + relleno): con el
        # hueco justo del alto nominal, la etiqueta caia encima del recuadro y
        # tapaba justo lo que se estaba senalando.
        alto = LABEL_BOX_HEIGHT
        salida.append(LowerThirdEffect(
            id=f"calloutl{i:03d}",
            start=marca.start,
            end=marca.end,
            title=texto,
            rect=Rect(
                x=round(marca.rect.x, 4),
                y=round(max(0.0, marca.rect.y - alto), 4),
                w=min(max(marca.rect.w, 0.1), 0.3),
                h=alto,
            ),
            color=getattr(rules, "label_color", "#1f4fd8"),
            value_score=marca.value_score,
            cost_weight=0.12,
            rationale=f'"{texto}": dice que es lo que hay dentro del recuadro',
        ))
    return salida


def _recall_titles(brolls, rules) -> list[LowerThirdEffect]:
    """El pie de la tarjeta del recuerdo.

    Si la tarjeta lleva banda (`bar`), el texto va **dentro del marco**, sobre
    ella, y la caja del rotulo se pinta del color del propio marco para que se
    vea como el pie de una foto y no como otra etiqueta pegada encima. Sin
    banda, se queda por encima de la tarjeta, que es lo que habia.
    """
    fijo = (getattr(rules, "title", "") or "").strip()
    banda = max(0.0, getattr(rules, "bar", 0.0))
    salida = []
    for i, b in enumerate(brolls):
        if b.mode != "recall":
            continue
        texto = (b.label or fijo).strip()
        if not texto:
            continue
        if banda > 0.0:
            # El pie ocupa la banda de la tarjeta, sangrado por los cuatro
            # lados: con el ancho entero se salia por la derecha justo lo que
            # se le habia sangrado por la izquierda.
            alto = round(b.rect.h * banda - RECALL_CAPTION_INSET, 4)
            y = round(b.rect.y + b.rect.h - b.rect.h * banda, 4)
            ancho = round(max(0.05, b.rect.w - RECALL_CAPTION_INSET * 2), 4)
            color = getattr(rules, "border_color", "") or getattr(
                rules, "title_color", "#1f4fd8"
            )
        else:
            alto = LABEL_BOX_HEIGHT
            y = round(max(0.0, b.rect.y - alto), 4)
            ancho = b.rect.w
            color = getattr(rules, "title_color", "#1f4fd8")
        salida.append(LowerThirdEffect(
            id=f"recallt{i:03d}",
            start=b.start,
            end=b.end,
            title=texto,
            rect=Rect(
                x=round(b.rect.x + RECALL_CAPTION_INSET, 4),
                y=y,
                w=ancho,
                h=alto,
            ),
            color=color,
            value_score=b.value_score,
            cost_weight=0.12,
            rationale=f'"{texto}": el pie de la tarjeta, para saber de que es',
        ))
    return salida


def build_edl(
    analysis: Analysis,
    style_name: str = "tutorial",
    *,
    intensity: int = 50,
    style_dir=None,
    providers: list[BrollProvider] | None = None,
    assets: AssetBundle | None = None,
) -> EDL:
    """Construye el montaje completo.

    Si se le pasan proveedores, tambien coloca material de apoyo y deja los
    assets resueltos en `assets`, que el renderer necesita para componerlos.
    """
    style = load_style(style_name, style_dir)

    clips, notas = _build_timeline(analysis, style)
    if not clips:
        raise PlanError(
            "La seleccion se quedo sin material.",
            hint="Prueba un estilo menos agresivo o revisa si el audio es todo silencio.",
        )

    edl = EDL(
        source=analysis.media.path,
        source_duration=analysis.duration,
        style=style.name,
        intensity=intensity,
        render=_render_spec(analysis),
        timeline=clips,
        notes=notas,
    )

    efectos: list = []
    if analysis.transcript:
        efectos += plan_captions(edl, analysis.transcript, style.captions, analysis)
        capitulos = plan_chapters(
            edl, analysis.transcript, style.chapters, analysis.narrative
        )
        edl.chapters = capitulos
        efectos += chapter_cards(capitulos, style.chapters)
    else:
        edl.notes.append("Sin transcripcion: no hay subtitulos ni capitulos.")

    zooms, zooms_reserva = plan_punch_ins(edl, analysis, style.emphasis)
    efectos += zooms
    efectos += plan_ken_burns(edl, analysis, style.emphasis)
    reservas = list(zooms_reserva)

    # Recuadros sobre lo que se nombra. Necesita OCR con posiciones; sin
    # Tesseract la lista viene vacia y aqui no pasa nada.
    marcas, marcas_reserva = plan_callouts(
        edl, analysis.transcript, analysis.screen_text, style.callouts, analysis.cues
    )
    efectos += marcas
    efectos += _callout_labels(marcas, style.callouts)
    reservas += marcas_reserva
    if marcas:
        edl.notes.append(
            f"Senalados {len(marcas)} elementos de la pantalla justo cuando los nombras."
        )

    pantalla = ScreenUse(
        cues=list(analysis.cues),
        cursor=analysis.cursor,
        captions=[e for e in efectos if e.kind is EffectKind.CAPTION],
        focus_at=analysis.focus_at,
    )

    # Rotulos de seccion: la caja con el nombre de donde estas. No acompanan al
    # cambio de capitulo -- para eso esta la tarjeta -- sino a la seccion, y
    # solo si es larga y tiene un nombre concreto (ver `plan/labels.py`).
    rotulos = plan_labels(edl, style, pantalla, analysis.transcript)
    efectos += rotulos
    # Lo que ya ocupa una esquina lo tiene que saber quien coloque despues: si
    # no, el material en ventanita se planta encima del rotulo, porque los dos
    # prefieren la misma esquina.
    # Y el "x8" mientras el video va acelerado. Va aparte de los rotulos
    # porque no compite con nada: explica algo que el montaje ya hizo.
    marcas_velocidad = plan_speed_tags(edl, style, pantalla)
    efectos += marcas_velocidad
    if marcas_velocidad:
        edl.notes.append(
            f"{len(marcas_velocidad)} marcador(es) de velocidad: el video se "
            "acelera ahi y ahora lo dice."
        )

    pantalla.overlays = list(rotulos) + list(marcas_velocidad)
    if rotulos:
        edl.notes.append(
            f"{len(rotulos)} rotulos de seccion en los capitulos largos."
        )

    if providers:
        bundle = assets if assets is not None else AssetBundle()
        brolls, brolls_reserva = plan_broll(
            edl,
            analysis.transcript,
            providers,
            style.broll,
            bundle,
            screen_terms=[t for t, _ in recurring_terms(analysis.screen_text)],
            narrative=analysis.narrative,
            pacing=style.pacing,
            recall=style.recall,
            # Lo que ya se sabe de la pantalla: donde senalas, donde tienes el
            # puntero y donde van los subtitulos (**ya planificados**, con su
            # posicion real: no siempre van abajo). Sirve para no plantar la
            # ventanita encima de lo que estas ensenando.
            screen=pantalla,
        )
        efectos += brolls
        efectos += _recall_titles(brolls, style.recall)
        reservas += brolls_reserva
        if brolls:
            edl.notes.append(
                f"Material de apoyo en {len(brolls)} momentos donde nombras algo concreto."
            )

    edl.candidates = reservas

    edl.effects = efectos
    # Las transiciones y el color dependen de la linea de tiempo ya cerrada.
    edl.effects += _plan_transitions(edl, style, analysis)
    edl.effects += _plan_grade(edl, style)

    if style.music.enabled and edl.duration > 0:
        # La musica es una sola pista de punta a punta. Quien pone el fichero
        # eres tu (`assets/music/`): aqui solo se decide que va, a que volumen
        # y si se agacha bajo la voz. Sin fichero, el render lo dice y sigue.
        edl.effects.append(
            MusicEffect(
                id="music000",
                start=0.0,
                end=round(edl.duration, 3),
                asset_id="music",
                gain_db=style.music.gain_db,
                duck=style.music.duck,
                value_score=0.4,
                cost_weight=0.2,
                rationale=(
                    f"musica de fondo a {style.music.gain_db:.0f} dB"
                    + (", agachada bajo la voz" if style.music.duck else "")
                ),
            )
        )

    # Los sonidos van los ultimos porque acompanan a lo que ya hay decidido:
    # nunca suenan solos.
    edl.effects += plan_sfx(edl, style.sfx)

    # Cada planner ha decidido lo suyo sin mirar a los demas. Aqui se quita lo
    # que otro efecto deja sin sentido: un recuadro debajo de un b-roll, dos
    # movimientos de camara a la vez, un zoom dentro de un avance rapido.
    edl.notes += resolve(edl)

    # Y lo que no estorba a nadie pero se repite hasta dejar de significar algo.
    # El cupo de un estilo dice cuantos, no dice como: sin esto salian rachas de
    # once zooms seguidos sin saltarse ninguna regla (ver `plan/restraint.py`).
    _, notas_fatiga = apply_restraint(edl, style)

    # Lo ultimo: la cara de los rotulos. Despues del recorte y del reparto, asi
    # que solo se la lleva lo que de verdad se queda en el montaje.
    _put_plates(edl.effects, style.plates)
    edl.notes += notas_fatiga

    edl.notes.append(
        f"Montaje: {edl.duration:.1f}s en {len(edl.timeline)} clips "
        f"con {len(edl.effects)} efectos."
    )
    return edl
