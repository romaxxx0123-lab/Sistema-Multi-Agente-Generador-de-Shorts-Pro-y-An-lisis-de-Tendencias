"""Compila un EDL en el `filter_complex` de ffmpeg.

Estructura del grafo, que sigue la misma separacion que el EDL:

1. **Por clip** (antes de concatenar): recorte, velocidad, escalado y los zooms.
   Los zooms se planifican sin cruzar cortes, asi que cada uno pertenece a un
   unico clip y se puede aplicar aqui.
2. **Concatenacion** de todos los clips.
3. **Sobre la linea de tiempo completa**: color, transiciones y subtitulos.
4. **Audio**: mezcla y masterizado.

Detalles que no son obvios:

- Los zooms usan `zoompan` y no `crop`. `crop` solo recorta en pixeles enteros,
  asi que un zoom lento tiembla; `zoompan` interpola con precision subpixel.
- Las transiciones son un **bajon de brillo localizado**, no `xfade` ni `fade`.
  `xfade` solapa los clips y acorta el video, lo que romperia el invariante de
  que los efectos no cambian la duracion. Y `fade=t=out` es peor todavia: deja
  el video negro **desde la transicion hasta el final**, no solo mientras dura.
  Encadenar un `fade=t=in` detras no lo arregla, porque ya recibe negro. Se usa
  `eq` con la luminosidad como expresion del tiempo, que si apaga solo su tramo.
- Las expresiones van entre comillas simples: las procesa el parser de ffmpeg,
  no el shell, y asi no hay que escapar cada coma.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

from ..assets.types import Asset, AssetBundle, AssetKind
from ..plan.edl import (
    MusicEffect,
    EDL,
    BrollEffect,
    CalloutEffect,
    EffectKind,
    KenBurnsEffect,
    PunchInEffect,
    SfxEffect,
)

#: Presets de color. Valores conservadores: el objetivo es que se note que
#: alguien ha tocado el color, no que el video parezca de otro planeta.
GRADE_PRESETS: dict[str, dict[str, float]] = {
    "neutral": {"contrast": 1.06, "saturation": 1.05, "gamma": 1.0},
    "punchy": {"contrast": 1.18, "saturation": 1.28, "gamma": 0.97},
    "warm": {"contrast": 1.08, "saturation": 1.12, "gamma": 1.02},
    "teal-orange": {"contrast": 1.12, "saturation": 1.15, "gamma": 0.99},
    "flat": {"contrast": 0.96, "saturation": 0.92, "gamma": 1.03},
}


@dataclass
class BuiltGraph:
    """El grafo listo para pasarselo a ffmpeg."""

    filter_complex: str
    video_label: str
    audio_label: str | None
    #: bloques de argumentos de entrada extra para ffmpeg, en orden. Cada uno
    #: es la lista completa (opciones + "-i" + ruta), porque una imagen fija
    #: necesita `-loop 1 -t <dur>` ANTES de su -i.
    input_args: list[list[str]] = field(default_factory=list)
    #: descripcion legible de lo que se aplico, para el log
    applied: list[str] = field(default_factory=list)


def _q(expr: str) -> str:
    """Entrecomilla una expresion para el parser de filtros de ffmpeg."""
    return f"'{expr}'"


def _smoothstep(lineal: str) -> str:
    """Suaviza una rampa lineal con la curva 3x^2-2x^3.

    Un zoom que arranca y frena de golpe se ve mecanico: la velocidad salta de
    cero a su maximo en un fotograma. Con esta curva entra y sale con
    aceleracion continua, que es como mueve la camara una persona.
    """
    return f"({lineal}*{lineal}*(3-2*{lineal}))"


def _ramp(t0: float, t1: float, ease: float) -> str:
    """Rampa trapezoidal suavizada 0->1->0 entre t0 y t1, en tiempo de clip.

    Entra en `ease` segundos, se mantiene y sale en otros tantos. Multiplicar
    las dos rampas da la meseta sin necesidad de condicionales.
    """
    ease = max(0.05, min(ease, (t1 - t0) / 2 if t1 > t0 else ease))
    sube = _smoothstep(f"min(1,max(0,(T-{t0:.4f})/{ease:.4f}))")
    baja = _smoothstep(f"min(1,max(0,({t1:.4f}-T)/{ease:.4f}))")
    return f"({sube}*{baja})"


def _linear(t0: float, t1: float) -> str:
    """Rampa 0->1 a lo largo del intervalo, para la deriva lenta.

    Tambien suavizada: una deriva que arranca de golpe delata el efecto.
    """
    span = max(1e-3, t1 - t0)
    return _smoothstep(f"min(1,max(0,(T-{t0:.4f})/{span:.4f}))")


def _zoom_expressions(
    zooms: list[tuple[str, float, float, float, float, float, float, float]],
    fps: float,
) -> tuple[str, str, str]:
    """Construye las expresiones z/x/y de `zoompan` sumando los zooms del clip.

    Los zooms nunca se solapan (el planner lo garantiza), asi que sumar sus
    aportaciones es exacto y evita anidar condicionales.

    Cada entrada es (tipo, t0, t1, ease, zoom_max, cx, cy, deriva) en tiempo
    de clip.
    """
    terminos_z: list[str] = []
    terminos_cx: list[str] = []
    terminos_cy: list[str] = []

    for tipo, t0, t1, ease, zmax, cx, cy, deriva in zooms:
        p = _linear(t0, t1) if tipo == "ken_burns" else _ramp(t0, t1, ease)
        # Mientras el zoom aguanta sigue acercandose un poco. Sin esto la
        # imagen se queda clavada durante casi dos segundos, y en una grabacion
        # de pantalla (donde el contenido tampoco se mueve) el resultado parece
        # un fotograma congelado, no una toma.
        alcance = f"{zmax - 1.0:.4f}"
        if deriva > 0 and tipo != "ken_burns":
            alcance = f"({zmax - 1.0:.4f}+{(zmax - 1.0) * deriva:.5f}*{_linear(t0, t1)})"
        terminos_z.append(f"({alcance}*{p})")
        terminos_cx.append(f"({cx - 0.5:.4f}*{p})")
        terminos_cy.append(f"({cy - 0.5:.4f}*{p})")

    # `on` es el numero de fotograma de salida; de ahi sacamos el tiempo.
    tiempo = f"(on/{fps:.6f})"
    z = "1+" + "+".join(terminos_z) if terminos_z else "1"
    cx_expr = "0.5+" + "+".join(terminos_cx) if terminos_cx else "0.5"
    cy_expr = "0.5+" + "+".join(terminos_cy) if terminos_cy else "0.5"

    z = z.replace("T", tiempo)
    cx_expr = cx_expr.replace("T", tiempo)
    cy_expr = cy_expr.replace("T", tiempo)

    # x/y van en coordenadas de la imagen de ENTRADA, no de la ampliada: son la
    # esquina de la ventana de tamano (iw/zoom, ih/zoom) que zoompan recorta y
    # despues escala a `s`. Confundir los dos sistemas descentra el encuadre
    # aunque la ampliacion sea correcta, que es justo lo que parece funcionar
    # hasta que se mira un fotograma.
    x = f"max(0,min(iw-iw/zoom,({cx_expr})*iw-iw/zoom/2))"
    y = f"max(0,min(ih-ih/zoom,({cy_expr})*ih-ih/zoom/2))"
    return z, x, y


def _clip_zooms(edl: EDL, clip_index: int, clip_start: float, clip_end: float):
    """Zooms que caen dentro de un clip, en tiempo relativo al clip."""
    salida = []
    for e in edl.effects:
        if e.kind not in (EffectKind.PUNCH_IN, EffectKind.KEN_BURNS):
            continue
        if e.end <= clip_start or e.start >= clip_end:
            continue

        t0 = max(0.0, e.start - clip_start)
        t1 = min(clip_end - clip_start, e.end - clip_start)
        if t1 <= t0:
            continue

        if isinstance(e, PunchInEffect):
            cx, cy = e.rect.center
            salida.append(
                ("punch_in", t0, t1, e.ease_seconds, e.rect.zoom, cx, cy, e.drift)
            )
        elif isinstance(e, KenBurnsEffect):
            cx, cy = e.rect_end.center
            salida.append(
                ("ken_burns", t0, t1, 0.0, e.rect_end.zoom, cx, cy, 0.0)
            )
    return salida


def _audio_handles(duration: float) -> list[str]:
    """Desvanecidos minimos en los extremos de un clip de audio.

    Un empalme cae casi siempre a mitad de onda, y ese escalon se oye como un
    chasquido. Doce milisegundos de rampa lo eliminan sin que se perciban, y no
    cambian la duracion, que es lo que si haria un `acrossfade`.
    """
    d = min(AUDIO_HANDLE_SECONDS, max(0.001, duration / 4))
    return [
        f"afade=t=in:st=0:d={d:.4f}",
        f"afade=t=out:st={max(0.0, duration - d):.4f}:d={d:.4f}",
    ]


def _broll_branch(
    effect: BrollEffect,
    asset: Asset,
    input_index: int,
    label: str,
    w: int,
    h: int,
    fps: float,
) -> tuple[str, list[str]]:
    """Rama de filtros de un b-roll y, si hace falta, su entrada extra.

    El desplazamiento temporal se hace con `setpts`: asi el material empieza en
    su primer fotograma justo cuando toca, en vez de aparecer ya empezado.
    """
    entrada: list[str] = []

    if asset.is_self:
        # Recorte del propio video: no hay fichero nuevo que abrir.
        origen = f"[0:v]trim=start={asset.source_start:.4f}:end={asset.source_end:.4f},setpts=PTS-STARTPTS"
    else:
        ruta = str(asset.path)
        if asset.kind is AssetKind.IMAGE:
            # Una imagen fija hay que convertirla en video de la duracion justa.
            entrada = ["-loop", "1", "-t", f"{effect.duration:.4f}", "-i", ruta]
        else:
            entrada = ["-stream_loop", "-1", "-t", f"{effect.duration:.4f}", "-i", ruta]
        origen = f"[{input_index}:v]setpts=PTS-STARTPTS"
        if asset.crop is not None and asset.crop.is_useful():
            # Fuera las barras negras. Sin esto se escalaban y se pegaban como
            # parte del material: un clip 2.35:1 dentro de un 16:9 aparecia en
            # pantalla con dos franjas negras propias encima del video.
            c = asset.crop
            origen += f",crop={c.w}:{c.h}:{c.x}:{c.y}"

    if effect.mode == "full":
        # Rellena el fotograma sin deformar: amplia y recorta lo que sobra.
        encaje = (
            f"scale={w}:{h}:force_original_aspect_ratio=increase:flags=bicubic,"
            f"crop={w}:{h}"
        )
    else:
        rect = effect.rect.clamped()
        ancho = max(2, int(w * rect.w) // 2 * 2)
        alto = max(2, int(h * rect.h) // 2 * 2)
        encaje = (
            f"scale={ancho}:{alto}:force_original_aspect_ratio=increase:flags=bicubic,"
            f"crop={ancho}:{alto}"
        )
        if effect.mode == "recall":
            # Un recuerdo lleva marco. Sin el, una imagen pegada encima del
            # video se lee como un fallo de reproduccion; con marco se lee como
            # lo que es, material de antes puesto aparte. El contenido se
            # encoge y el marco lo devuelve al tamano pedido, asi que la
            # posicion no cambia.
            #
            # El marco es de dos tonos: uno oscuro pegado a la imagen y el del
            # estilo por fuera. Con un solo tono claro, sobre un fondo claro el
            # marco desaparece y la tarjeta vuelve a parecer un fallo; el filo
            # oscuro la separa del video pase lo que pase debajo.
            grosor = effect.border or RECALL_BORDER
            borde = max(2, int(min(ancho, alto) * grosor) // 2 * 2)
            filo = max(2, borde // 3 // 2 * 2)
            color = _ffmpeg_color(effect.border_color) or RECALL_BORDER_COLOR
            dentro_w = max(2, ancho - borde * 2)
            dentro_h = max(2, alto - borde * 2)
            encaje = (
                f"scale={dentro_w}:{dentro_h}:force_original_aspect_ratio=increase"
                f":flags=bicubic,crop={dentro_w}:{dentro_h},"
                f"pad={dentro_w + filo * 2}:{dentro_h + filo * 2}:{filo}:{filo}"
                f":color={RECALL_INNER_COLOR},"
                f"pad={ancho}:{alto}:{borde - filo}:{borde - filo}:color={color}"
            )

    # Entra y sale con un fundido corto. Un material que aparece de golpe a
    # pantalla completa se lee como un fallo de reproduccion; dos decimas
    # bastan para que se lea como una decision. Va sobre el alfa, que es lo que
    # mezcla el `overlay`, y **antes** del desplazamiento temporal: los tiempos
    # del fundido son los de la propia rama, que empieza en cero.
    fundido = min(BROLL_FADE, max(0.0, effect.duration / 4))
    fades = ""
    if fundido > 0.02:
        fades = (
            f",fade=t=in:st=0:d={fundido:.3f}:alpha=1"
            f",fade=t=out:st={max(0.0, effect.duration - fundido):.3f}"
            f":d={fundido:.3f}:alpha=1"
        )

    cadena = (
        f"{origen},{encaje},format=yuva420p,setsar=1,fps={fps:.6f}{fades},"
        f"setpts=PTS+{effect.start:.4f}/TB{label}"
    )
    return cadena, entrada


#: Cuanto tarda un material de apoyo en entrar y en salir.
BROLL_FADE = 0.22

#: Cuanto tarda el recuadro en aparecer y en irse. Un recuadro que se enciende
#: de golpe se lee como un fallo de reproduccion; un cuarto de segundo basta
#: para que se lea como una decision.
CALLOUT_FADE = 0.24
#: En cuantos pasos se hace ese fundido. Ver `_callout_filters`: `drawbox` no
#: reevalua sus parametros por fotograma, asi que el fundido son varios
#: `drawbox` con distinta opacidad y ventanas de tiempo seguidas.
CALLOUT_FADE_STEPS = 3
#: Opacidad del recuadro ya establecido.
CALLOUT_ALPHA = 0.95
#: Grosor minimo en pixeles: por debajo el trazo desaparece al recomprimir.
CALLOUT_MIN_THICKNESS = 2


def _callout_filters(
    effects: list[CalloutEffect],
    w: int,
    h: int,
    rules,
    *,
    window: tuple[float, float] | None = None,
) -> list[str]:
    """Recuadros que aparecen y desaparecen sobre lo que se esta nombrando.

    `drawbox` evalua sus parametros **una sola vez**, al montar el grafo: en sus
    expresiones no existe el tiempo, y meter `t` no da un recuadro estatico sino
    que aborta el render entero. Lo unico que si se evalua por fotograma es
    `enable`.

    Asi que el fundido se hace con varios `drawbox` encadenados, cada uno con su
    opacidad y su tramo de tiempo, que no se solapan. Tres pasos de 80 ms bastan
    para que no parezca que la imagen ha parpadeado.

    Con `window` (inicio, fin) se emiten **dentro de un clip**: los tiempos pasan
    a ser locales del clip y solo salen los recuadros que caen ahi. Eso es lo
    que permite dibujarlos **antes** del zoom, que es donde tienen que ir: la
    caja sale en coordenadas del original y el zoom se la lleva con la imagen.
    Dibujandola despues, un zoom de 1,45 la dejaba 134 px fuera de un boton que
    mide 170.
    """
    if not effects:
        return []

    desplazamiento = window[0] if window else 0.0

    grueso = max(CALLOUT_MIN_THICKNESS, int(round(h * rules.thickness)))
    color = (rules.color or "FFD200").lstrip("#")
    filtros: list[str] = []

    for efecto in effects:
        if window is not None and not (efecto.start < window[1] and window[0] < efecto.end):
            continue
        rect = efecto.rect.clamped()
        x = int(rect.x * w)
        y = int(rect.y * h)
        ancho = max(grueso * 3, int(rect.w * w))
        alto = max(grueso * 3, int(rect.h * h))

        # Las piezas del recuadro, de dentro a fuera. Todas comparten el mismo
        # fundido, asi que se generan juntas por cada tramo de opacidad.
        relleno = max(0.0, min(1.0, rules.fill))
        color_relleno = (rules.fill_color or rules.color or "FFD200").lstrip("#")
        color_filo = (rules.edge_color or "").lstrip("#")
        esquina = max(0.0, rules.corner)
        color_esquina = (rules.corner_color or rules.color or "FFD200").lstrip("#")
        largo = int(min(ancho, alto) * esquina) if esquina else 0

        def piezas(desde: float, hasta: float, alpha: float) -> list[str]:
            cuando = _q(f"between(t,{desde:.4f},{hasta:.4f})")

            def box(bx, by, bw, bh, col, a, grosor) -> str:
                return (
                    f"drawbox=x={int(bx)}:y={int(by)}:w={max(1, int(bw))}"
                    f":h={max(1, int(bh))}:color=0x{col}@{a:.2f}:t={grosor}"
                    f":enable={cuando}"
                )

            salida: list[str] = []
            # 1. El relleno, que oscurece lo resaltado como un panel del juego.
            if relleno > 0.01:
                salida.append(
                    box(x, y, ancho, alto, color_relleno, alpha * relleno, "fill")
                )
            # 2. El filo oscuro por fuera, para que el trazo se vea sobre
            #    cualquier fondo. Sin el, un recuadro dorado sobre arena no
            #    existe.
            if color_filo:
                salida.append(box(
                    x - grueso, y - grueso, ancho + grueso * 2, alto + grueso * 2,
                    color_filo, alpha, max(1, grueso // 2),
                ))
            # 3. El trazo de siempre.
            salida.append(box(x, y, ancho, alto, color, alpha, grueso))
            # 4. Y las esquinas marcadas, que es lo que le da cara de interfaz
            #    de juego. Dos trazos por esquina, en L.
            if largo > grueso:
                gordo = grueso * 2
                for ex, ey, sx, sy in (
                    (x, y, 1, 1), (x + ancho, y, -1, 1),
                    (x, y + alto, 1, -1), (x + ancho, y + alto, -1, -1),
                ):
                    bx = ex if sx > 0 else ex - largo
                    by = ey if sy > 0 else ey - gordo
                    salida.append(box(bx, by, largo, gordo, color_esquina, alpha, "fill"))
                    bx = ex if sx > 0 else ex - gordo
                    by = ey if sy > 0 else ey - largo
                    salida.append(box(bx, by, gordo, largo, color_esquina, alpha, "fill"))
            return salida

        duracion = efecto.end - efecto.start
        # Con un recuadro muy corto no hay sitio para el fundido: se deja seco.
        fundido = min(CALLOUT_FADE, duracion / 3.0)
        paso = fundido / CALLOUT_FADE_STEPS

        tramos: list[tuple[float, float, float]] = []
        for k in range(CALLOUT_FADE_STEPS):
            alpha = CALLOUT_ALPHA * (k + 1) / CALLOUT_FADE_STEPS
            tramos.append((efecto.start + k * paso, efecto.start + (k + 1) * paso, alpha))
        tramos.append((efecto.start + fundido, efecto.end - fundido, CALLOUT_ALPHA))
        for k in range(CALLOUT_FADE_STEPS):
            alpha = CALLOUT_ALPHA * (CALLOUT_FADE_STEPS - k - 1 + 1) / CALLOUT_FADE_STEPS
            inicio = efecto.end - fundido + k * paso
            tramos.append((inicio, inicio + paso, alpha - CALLOUT_ALPHA / CALLOUT_FADE_STEPS))

        for desde, hasta, alpha in tramos:
            desde -= desplazamiento
            hasta -= desplazamiento
            if window is not None:
                # Recortado al clip: un recuadro que cruza un corte se emite en
                # los dos trozos, cada uno con su parte.
                desde = max(desde, 0.0)
                hasta = min(hasta, window[1] - window[0])
            if hasta - desde > 1e-3 and alpha > 0.01:
                filtros += piezas(desde, hasta, alpha)
    return filtros


def _overlay_position(effect: BrollEffect, w: int, h: int) -> tuple[str, str]:
    """Donde se coloca el overlay dentro del fotograma."""
    if effect.mode == "full":
        return "0", "0"
    rect = effect.rect.clamped()
    return f"{int(w * rect.x)}", f"{int(h * rect.y)}"


#: Grosor del marco del recuerdo, en fraccion del lado menor de la tarjeta.
RECALL_BORDER = 0.022
#: Y su color. Claro y opaco: tiene que separarse del video de debajo pase lo
#: que pase, y el video de debajo puede ser de cualquier color.
RECALL_BORDER_COLOR = "0xF2F4F8"
#: Y el filo oscuro pegado a la imagen, que la separa del video de debajo aunque
#: el marco y el fondo sean del mismo tono.
RECALL_INNER_COLOR = "0x14171C"


def _ffmpeg_color(color: str) -> str:
    """`#RRGGBB` es como se escribe un color en los estilos; ffmpeg quiere
    `0xRRGGBB`. Sin esto el filtro se queda sin color y el render falla entero
    por un `#`."""
    color = (color or "").strip()
    if not color:
        return ""
    return "0x" + color[1:] if color.startswith("#") else color

#: Techo de pico real del master, en dBFS. -1.5 es el margen que piden las
#: plataformas para que la recodificacion a AAC no sature.
TRUE_PEAK_CEILING_DB = -1.5
#: El limitador mira el pico de **muestra**, no el pico real: entre dos
#: muestras la senal reconstruida se sale por encima de lo que el ve. Medido
#: sobre voz, ese sobrepico es de 1,7 dB sin sobremuestrear y de 0,7 dB
#: sobremuestreando a 4x, asi que se le baja el techo esa cantidad.
LIMITER_MARGIN_DB = 0.7
#: Frecuencia a la que se sobremuestrea alrededor del limitador.
LIMITER_OVERSAMPLE_HZ = 192000
#: Frecuencia por encima de la cual vive la sibilancia de la voz.
DEESS_HZ = 5500
#: Ratio del compresor de banda alta del de-esser.
DEESS_RATIO = 4.0

#: Cuanto dura el fundido con el que se va la musica al final.
MUSIC_FADE = 2.0
#: Ajustes del sidechain que agacha la musica bajo la voz. El umbral bajo y el
#: release largo son a proposito: lo que se busca es que la musica se aparte
#: entera mientras hablas y vuelva sin que se note, no que respire al ritmo de
#: cada silaba.
MUSIC_DUCK_THRESHOLD = 0.03
MUSIC_DUCK_RATIO = 8
MUSIC_DUCK_ATTACK = 20
MUSIC_DUCK_RELEASE = 900

#: Duracion de los desvanecidos que se ponen en los bordes de cada clip de
#: audio. Doce milisegundos no se oyen como un fundido, pero bastan para que un
#: empalme a mitad de onda no chasquee.
AUDIO_HANDLE_SECONDS = 0.012


def master_chain(gain_db: float) -> list[str]:
    """Ganancia + limitador de pico real. Es lo ultimo que toca el audio."""
    limite = 10.0 ** ((TRUE_PEAK_CEILING_DB - LIMITER_MARGIN_DB) / 20.0)
    return [
        f"volume={gain_db:.2f}dB",
        f"aresample={LIMITER_OVERSAMPLE_HZ}",
        f"alimiter=limit={limite:.4f}:level=false:attack=5:release=50",
        "aresample=48000",
    ]


def deesser_subgraph(intensity: float):
    """De-esser de verdad: se comprime **solo** la banda de la sibilancia.

    El filtro `deesser` de ffmpeg no sirve para esto. Medido sobre voz con su
    intensidad a 0,35 se lleva por delante 4,7 dB de sonoridad, 8,7 dB de pico
    y 3,8 dB de la banda de 3-5 kHz, que es justo donde vive la inteligibilidad
    de la voz. Y tiene un escalon: a 0,2 no hace nada y a 0,35 destroza.

    Aqui la senal se parte con `acrossover`, que es un cruce Linkwitz-Riley: al
    volver a sumar las dos bandas el resultado es plano. Medido con una voz sin
    siseo, pasar por el cruce deja la misma sonoridad, el mismo pico y la misma
    energia en graves **hasta la centesima de dB**. Solo se toca la banda alta,
    y solo cuando se pasa del umbral.

    (Restar la banda comprimida de la senal original, que parece mas elegante,
    no funciona: el filtro paso alto desfasa, y restar algo desfasado no lo
    quita, interfiere. Medido, bajaba 1,9 dB de sibilancia donde el cruce baja
    9,0.)
    """
    umbral = 10.0 ** ((-18.0 - 24.0 * max(0.0, min(1.0, intensity))) / 20.0)

    def construir(entrada: str, salida: str, pref: str) -> list[str]:
        return [
            f"{entrada}acrossover=split={DEESS_HZ}:order=4th[{pref}lo][{pref}hi]",
            f"[{pref}hi]acompressor=threshold={umbral:.5f}:ratio={DEESS_RATIO:.1f}"
            f":attack=1:release=60:makeup=1[{pref}hic]",
            f"[{pref}lo][{pref}hic]amix=inputs=2:normalize=0{salida}",
        ]

    return construir


def voice_chain(rules) -> list:
    """Tratamiento de voz, en el orden en que debe ir.

    Se quita antes de anadir: retumbe y ruido primero, sibilancia despues, y la
    compresion al final, cuando ya solo queda voz que igualar.

    Devuelve una lista de **etapas**: o una cadena de filtros normal, o un
    subgrafo (una funcion que se le pide construir con sus propias ramas), que
    es lo que necesita el de-esser.

    La compresion se deja suave a proposito. Medido: apretarla no reduce el
    factor de cresta (los picos de la voz son transitorios que ningun ataque de
    15 ms alcanza) pero si se lleva el rango dinamico por delante, de 5,1 a 2,0
    LU. Los picos son cosa del limitador del master, no del compresor.
    """
    if not rules.enabled:
        return []

    etapas: list = []
    inicio: list[str] = []
    if rules.highpass_hz > 0:
        # Dos polos: pendiente suficiente sin colorear la voz.
        inicio.append(f"highpass=f={rules.highpass_hz:.0f}:poles=2")
    if rules.denoise_db > 0:
        inicio.append(f"afftdn=nr={rules.denoise_db:.1f}:nf=-40:tn=1")
    if inicio:
        etapas.append(",".join(inicio))
    if rules.deess > 0:
        etapas.append(deesser_subgraph(rules.deess))
    if rules.compress:
        etapas.append(
            f"acompressor=threshold={rules.compress_threshold:.4f}"
            f":ratio={rules.compress_ratio:.1f}:attack=15:release=250:makeup=1.6"
        )
    return etapas


def _emit_audio_chain(
    partes: list[str], entrada: str, etapas: list, salida: str
) -> None:
    """Escribe las etapas de audio en el grafo, con sus etiquetas intermedias.

    Las etapas planas se juntan en una sola cadena separada por comas; cada
    subgrafo corta la cadena y se escribe como sentencias propias.
    """
    plano: list[str] = []
    actual = entrada
    n = 0
    for etapa in etapas:
        if isinstance(etapa, str):
            plano.append(etapa)
            continue
        if plano:
            n += 1
            siguiente = f"[ap{n}]"
            partes.append(actual + ",".join(plano) + siguiente)
            actual, plano = siguiente, []
        n += 1
        siguiente = f"[ap{n}]"
        partes.extend(etapa(actual, siguiente, f"dz{n}"))
        actual = siguiente
    partes.append(actual + (",".join(plano) if plano else "anull") + salida)


def _grade_values(preset: str, intensity: float) -> tuple[float, float, float]:
    """Contraste, saturacion y gamma interpolados desde el neutro."""
    valores = GRADE_PRESETS.get(preset, GRADE_PRESETS["neutral"])
    k = max(0.0, min(1.0, intensity))
    return (
        1.0 + (valores["contrast"] - 1.0) * k,
        1.0 + (valores["saturation"] - 1.0) * k,
        1.0 + (valores["gamma"] - 1.0) * k,
    )


def _dip_expression(dips: list[tuple[float, float, float]]) -> str:
    """Expresion de luminosidad con un bajon triangular por transicion.

    Cada entrada es (centro, semiancho, signo): -1 apaga a negro, +1 quema a
    blanco. Los pulsos no se solapan (las transiciones van en cortes distintos),
    asi que sumarlos es exacto.
    """
    terminos = [
        f"({signo:.1f}*max(0,1-abs(t-{centro:.4f})/{max(semi, 0.02):.4f}))"
        for centro, semi, signo in dips
    ]
    return "+".join(terminos) if terminos else "0"


def _color_filter(
    preset: str, intensity: float, dips: list[tuple[float, float, float]]
) -> str:
    """Color y transiciones en un solo `eq`.

    Con transiciones hace falta `eval=frame` para que la luminosidad se
    reevalue en cada fotograma; sin ellas se deja en modo estatico, que es
    mas rapido.
    """
    contrast, saturation, gamma = _grade_values(preset, intensity)
    base = f"eq=contrast={contrast:.4f}:saturation={saturation:.4f}:gamma={gamma:.4f}"
    if not dips:
        return base
    return f"{base}:brightness={_q(_dip_expression(dips))}:eval=frame"


def build_graph(
    edl: EDL,
    *,
    has_audio: bool,
    ass_path: str | None = None,
    fonts_dir: str | None = None,
    target_lufs: float | None = None,
    loudnorm_measured: dict | None = None,
    audio_only: bool = False,
    assets: AssetBundle | None = None,
    sfx_paths: dict[str, str] | None = None,
    music_path: str | None = None,
    voice_rules=None,
    master_gain_db: float | None = None,
    callout_rules=None,
) -> BuiltGraph:
    """Compila el EDL en un grafo de filtros.

    Con `audio_only` se omite toda la rama de video. Hace falta para la pasada
    de medicion de sonoridad: si se construyese el grafo entero y solo se
    mapease el audio, ffmpeg abortaria por dejar la salida de video sin
    conectar.
    """
    w, h, fps = edl.render.width, edl.render.height, edl.render.fps
    partes: list[str] = []
    aplicado: list[str] = []
    # Se declara aqui porque lo llenan tanto los b-roll (video) como los
    # efectos de sonido (audio), y los indices de entrada son compartidos.
    input_args: list[list[str]] = []

    # -- 1. cada clip por separado -----------------------------------------
    inicio_tl = 0.0
    etiquetas_v: list[str] = []
    etiquetas_a: list[str] = []

    for i, clip in enumerate(edl.timeline):
        fin_tl = inicio_tl + clip.duration

        if audio_only:
            if has_audio:
                audio = [
                    f"[0:a]atrim=start={clip.source_start:.4f}:end={clip.source_end:.4f}",
                    "asetpts=PTS-STARTPTS",
                ]
                if abs(clip.speed - 1.0) > 1e-6:
                    audio.append(f"rubberband=tempo={clip.speed:.6f}")
                audio += _audio_handles(clip.duration)
                partes.append(",".join(audio) + f"[a{i}]")
                etiquetas_a.append(f"[a{i}]")
            inicio_tl = fin_tl
            continue

        cadena = [
            f"[0:v]trim=start={clip.source_start:.4f}:end={clip.source_end:.4f}",
            f"setpts=(PTS-STARTPTS)/{clip.speed:.6f}",
            f"scale={w}:{h}:flags=bicubic",
            "setsar=1",
            f"fps={fps:.6f}",
        ]

        # Los recuadros van **antes** del zoom para que se acerquen con la
        # imagen en vez de quedarse pegados al fotograma de salida. Aqui la
        # escala ya es la de salida, asi que sus coordenadas son las buenas.
        if callout_rules is not None:
            cadena += _callout_filters(
                [e for e in edl.effects if isinstance(e, CalloutEffect)],
                w, h, callout_rules, window=(inicio_tl, fin_tl),
            )

        zooms = _clip_zooms(edl, i, inicio_tl, fin_tl)
        if zooms:
            z, x, y = _zoom_expressions(zooms, fps)
            cadena.append(
                f"zoompan=z={_q(z)}:x={_q(x)}:y={_q(y)}:d=1:s={w}x{h}:fps={fps:.6f}"
            )

        partes.append(",".join(cadena) + f"[v{i}]")
        etiquetas_v.append(f"[v{i}]")

        if has_audio:
            audio = [
                f"[0:a]atrim=start={clip.source_start:.4f}:end={clip.source_end:.4f}",
                "asetpts=PTS-STARTPTS",
            ]
            if abs(clip.speed - 1.0) > 1e-6:
                # rubberband mantiene el tono al cambiar la velocidad; atempo
                # es el plan B si el build de ffmpeg no lo trae.
                audio.append(f"rubberband=tempo={clip.speed:.6f}")
            audio += _audio_handles(clip.duration)
            partes.append(",".join(audio) + f"[a{i}]")
            etiquetas_a.append(f"[a{i}]")

        inicio_tl = fin_tl

    n = len(edl.timeline)
    aplicado.append(f"{n} clips")

    # -- 2. concatenacion ---------------------------------------------------
    v_actual = ""
    a_actual = None
    if n == 1:
        if not audio_only:
            v_actual = "[v0]"
        a_actual = "[a0]" if etiquetas_a else None
    else:
        if not audio_only:
            partes.append("".join(etiquetas_v) + f"concat=n={n}:v=1:a=0[vcat]")
            v_actual = "[vcat]"
        if etiquetas_a:
            partes.append("".join(etiquetas_a) + f"concat=n={n}:v=0:a=1[acat]")
            a_actual = "[acat]"

    # -- 3. efectos sobre la linea de tiempo completa ------------------------
    post: list[str] = []
    v_label = v_actual

    grade = edl.effects_of(EffectKind.GRADE)
    transiciones = [] if audio_only else edl.effects_of(EffectKind.TRANSITION)

    dips = [
        # +1 quema a blanco, -1 apaga a negro.
        ((t.start + t.end) / 2, max(0.04, t.duration / 2),
         1.0 if t.transition == "flash" else -1.0)
        for t in sorted(transiciones, key=lambda e: e.start)
    ]

    if not audio_only and (grade or dips):
        preset = grade[0].preset if grade else "neutral"
        intensidad = grade[0].intensity if grade else 0.0
        post.append(_color_filter(preset, intensidad, dips))
        if grade:
            aplicado.append(f"color {preset}")
        if dips:
            aplicado.append(f"{len(dips)} transiciones")

    # El color y las transiciones se aplican a la base ANTES de superponer el
    # b-roll: un material que esta tapando un corte no debe oscurecerse con el
    # fade de ese corte, porque el fade existe para disimular algo que el
    # b-roll ya esta ocultando.
    if post and not audio_only:
        partes.append(f"{v_actual}" + ",".join(post) + "[vbase]")
        v_label = "[vbase]"
        post = []

    if not audio_only and assets is not None:
        brolls = sorted(
            (e for e in edl.effects if isinstance(e, BrollEffect)), key=lambda e: e.start
        )
        siguiente_entrada = 1
        colocados = 0

        for i, efecto in enumerate(brolls):
            asset = assets.get(efecto.asset_id)
            if asset is None:
                continue
            if not asset.is_self and (asset.path is None or not Path(asset.path).is_file()):
                # El material no esta en disco: se omite en vez de tumbar el
                # render entero por una descarga que fallo.
                continue

            etiqueta = f"[bl{i}]"
            indice = 0 if asset.is_self else siguiente_entrada
            cadena, entrada = _broll_branch(efecto, asset, indice, etiqueta, w, h, fps)
            if entrada:
                input_args.append(entrada)
                siguiente_entrada += 1
            partes.append(cadena)

            x, y = _overlay_position(efecto, w, h)
            salida = f"[vov{i}]"
            partes.append(
                f"{v_label}{etiqueta}overlay=x={x}:y={y}:eof_action=pass"
                f":enable={_q(f'between(t,{efecto.start:.4f},{efecto.end:.4f})')}{salida}"
            )
            v_label = salida
            colocados += 1

        if colocados:
            aplicado.append(f"{colocados} b-roll")

    # Los recuadros ya se dibujaron dentro de cada clip, antes del zoom. Aqui
    # solo se cuentan para el resumen.
    if not audio_only and callout_rules is not None:
        marcas = [e for e in edl.effects if isinstance(e, CalloutEffect)]
        if marcas:
            aplicado.append(f"{len(marcas)} recuadros")

    # Los subtitulos van los ultimos: siempre encima de todo, tambien del b-roll.
    if ass_path and not audio_only:
        # El filtro `ass` necesita escapar ':' y '\' de la ruta.
        ruta = ass_path.replace("\\", "/").replace(":", r"\:")
        filtro = f"ass=filename={ruta}"
        if fonts_dir:
            filtro += f":fontsdir={fonts_dir.replace(chr(92), '/').replace(':', chr(92) + ':')}"
        post.append(filtro)
        aplicado.append("subtitulos")

    if post and not audio_only:
        partes.append(f"{v_label}" + ",".join(post) + "[vout]")
        v_label = "[vout]"

    # -- 4. audio -----------------------------------------------------------
    a_label: str | None = None
    if a_actual:
        # La voz se trata **antes** de mezclar. Estaba al reves: el paso-alto a
        # 80 Hz, el de-esser y el compresor se aplicaban a la mezcla ya hecha,
        # asi que le quitaban los graves a un impacto y el de-esser bombeaba
        # con el ruido de un whoosh. Eso es tratamiento de voz, y solo la voz
        # tiene que pasar por ahi.
        if voice_rules is not None:
            etapas = voice_chain(voice_rules)
            if etapas:
                # Con `_emit_audio_chain` porque el de-esser no es un filtro
                # suelto: parte la senal en dos bandas y las vuelve a sumar,
                # asi que necesita sus propias etiquetas.
                _emit_audio_chain(partes, a_actual, etapas, "[avoz]")
                a_actual = "[avoz]"
                aplicado.append("voz tratada")

        efectos_sonido = [e for e in edl.effects if isinstance(e, SfxEffect)]
        disponibles = [
            (e, (sfx_paths or {}).get(e.asset_id))
            for e in sorted(efectos_sonido, key=lambda x: x.start)
        ]
        disponibles = [(e, p) for e, p in disponibles if p]

        if disponibles:
            etiquetas_sfx: list[str] = []
            base = len(input_args) + 1
            for j, (efecto, ruta) in enumerate(disponibles):
                input_args.append(["-i", str(ruta)])
                etiqueta = f"[sfx{j}]"
                # adelay coloca el efecto en su instante; volume aplica su ganancia.
                partes.append(
                    f"[{base + j}:a]adelay={int(efecto.start * 1000)}:all=1,"
                    f"volume={efecto.gain_db:.1f}dB{etiqueta}"
                )
                etiquetas_sfx.append(etiqueta)

            mezcla = "".join([a_actual] + etiquetas_sfx)
            # `dropout_transition=0` y `normalize=0` evitan que amix baje la voz
            # cada vez que entra un efecto.
            partes.append(
                f"{mezcla}amix=inputs={len(etiquetas_sfx) + 1}:duration=first"
                f":dropout_transition=0:normalize=0[amixed]"
            )
            a_actual = "[amixed]"
            aplicado.append(f"{len(disponibles)} efectos de sonido")

        musica = next((e for e in edl.effects if isinstance(e, MusicEffect)), None)
        if musica is not None and music_path:
            indice = len(input_args) + 1
            input_args.append(["-i", str(music_path)])
            # Se repite hasta cubrir el montaje y se corta con un fundido, que
            # es lo que hace que no acabe de golpe.
            partes.append(
                f"[{indice}:a]aloop=loop=-1:size=2e9,atrim=duration={edl.duration:.3f},"
                f"asetpts=PTS-STARTPTS,volume={musica.gain_db:.1f}dB,"
                f"afade=t=out:st={max(0.0, edl.duration - MUSIC_FADE):.3f}:d={MUSIC_FADE}"
                "[amus]"
            )
            if musica.duck and a_actual:
                # La voz manda: la musica se agacha sola cuando hablas. Es la
                # diferencia entre musica de fondo y musica encima.
                partes.append(
                    f"{a_actual}asplit=2[avoz1][avozkey]"
                )
                partes.append(
                    f"[amus][avozkey]sidechaincompress="
                    f"threshold={MUSIC_DUCK_THRESHOLD}:ratio={MUSIC_DUCK_RATIO}"
                    f":attack={MUSIC_DUCK_ATTACK}:release={MUSIC_DUCK_RELEASE}"
                    ":makeup=1[amusduck]"
                )
                a_actual = "[avoz1]"
                etiqueta_musica = "[amusduck]"
            else:
                etiqueta_musica = "[amus]"
            partes.append(
                f"{a_actual}{etiqueta_musica}amix=inputs=2:duration=first"
                ":dropout_transition=0:normalize=0[amusmix]"
            )
            a_actual = "[amusmix]"
            aplicado.append("musica" + (" agachada bajo la voz" if musica.duck else ""))

        audio_post: list = []

        if master_gain_db is not None:
            # Master medido: se sube exactamente lo que dice la medida R128 y
            # el limitador se encarga del techo de pico. No se pasa por
            # `loudnorm` porque en modo lineal, si la ganancia no le cabe bajo
            # el techo, se cambia solo a modo dinamico y vuelve a comprimir
            # justo lo que acabamos de dejar respirar.
            audio_post += master_chain(master_gain_db)
            aplicado.append(f"master {master_gain_db:+.1f} dB, pico <= {TRUE_PEAK_CEILING_DB} dBTP")
        elif loudnorm_measured:
            # Segunda pasada: con las medidas reales la normalizacion es lineal
            # y no bombea, que es lo que pasa en una sola pasada.
            audio_post.append(
                "loudnorm="
                f"I={target_lufs:.1f}:TP={TRUE_PEAK_CEILING_DB}:LRA=11"
                f":measured_I={loudnorm_measured['input_i']}"
                f":measured_TP={loudnorm_measured['input_tp']}"
                f":measured_LRA={loudnorm_measured['input_lra']}"
                f":measured_thresh={loudnorm_measured['input_thresh']}"
                f":offset={loudnorm_measured['target_offset']}"
                ":linear=true:print_format=summary"
            )
            audio_post.append("aresample=48000")
            aplicado.append(f"audio a {target_lufs:.0f} LUFS")
        elif target_lufs is not None:
            audio_post.append(
                f"loudnorm=I={target_lufs:.1f}:TP={TRUE_PEAK_CEILING_DB}:LRA=11"
            )
            audio_post.append("aresample=48000")
            aplicado.append(f"audio a {target_lufs:.0f} LUFS (una pasada)")
        else:
            audio_post.append("aresample=48000")

        _emit_audio_chain(partes, a_actual, audio_post, "[aout]")
        a_label = "[aout]"

    return BuiltGraph(
        filter_complex=";".join(partes),
        video_label=v_label,
        audio_label=a_label,
        input_args=input_args,
        applied=aplicado,
    )
