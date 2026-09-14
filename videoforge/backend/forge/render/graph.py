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
- Las transiciones se hacen con `fade` **despues** de concatenar, no con
  `xfade`. `xfade` solapa los clips y por tanto acorta el video, lo que
  romperia el invariante de que los efectos no cambian la duracion.
- Las expresiones van entre comillas simples: las procesa el parser de ffmpeg,
  no el shell, y asi no hay que escapar cada coma.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

from ..assets.types import Asset, AssetBundle, AssetKind
from ..plan.edl import EDL, BrollEffect, EffectKind, KenBurnsEffect, PunchInEffect, SfxEffect

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


def _ramp(t0: float, t1: float, ease: float) -> str:
    """Rampa trapezoidal 0->1->0 entre t0 y t1, en tiempo de clip.

    Entra en `ease` segundos, se mantiene y sale en otros tantos. Multiplicar
    las dos rampas da la meseta sin necesidad de condicionales.
    """
    ease = max(0.05, min(ease, (t1 - t0) / 2 if t1 > t0 else ease))
    sube = f"min(1,max(0,(T-{t0:.4f})/{ease:.4f}))"
    baja = f"min(1,max(0,({t1:.4f}-T)/{ease:.4f}))"
    return f"({sube}*{baja})"


def _linear(t0: float, t1: float) -> str:
    """Rampa lineal 0->1 a lo largo de todo el intervalo (para ken burns)."""
    span = max(1e-3, t1 - t0)
    return f"min(1,max(0,(T-{t0:.4f})/{span:.4f}))"


def _zoom_expressions(
    zooms: list[tuple[str, float, float, float, float, float, float]],
    fps: float,
) -> tuple[str, str, str]:
    """Construye las expresiones z/x/y de `zoompan` sumando los zooms del clip.

    Los zooms nunca se solapan (el planner lo garantiza), asi que sumar sus
    aportaciones es exacto y evita anidar condicionales.

    Cada entrada es (tipo, t0, t1, ease, zoom_max, cx, cy) en tiempo de clip.
    """
    terminos_z: list[str] = []
    terminos_cx: list[str] = []
    terminos_cy: list[str] = []

    for tipo, t0, t1, ease, zmax, cx, cy in zooms:
        p = _linear(t0, t1) if tipo == "ken_burns" else _ramp(t0, t1, ease)
        terminos_z.append(f"({zmax - 1.0:.4f}*{p})")
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
            salida.append(("punch_in", t0, t1, e.ease_seconds, e.rect.zoom, cx, cy))
        elif isinstance(e, KenBurnsEffect):
            cx, cy = e.rect_end.center
            salida.append(("ken_burns", t0, t1, 0.0, e.rect_end.zoom, cx, cy))
    return salida


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

    cadena = (
        f"{origen},{encaje},format=yuva420p,setsar=1,fps={fps:.6f},"
        f"setpts=PTS+{effect.start:.4f}/TB{label}"
    )
    return cadena, entrada


def _overlay_position(effect: BrollEffect, w: int, h: int) -> tuple[str, str]:
    """Donde se coloca el overlay dentro del fotograma."""
    if effect.mode == "full":
        return "0", "0"
    rect = effect.rect.clamped()
    return f"{int(w * rect.x)}", f"{int(h * rect.y)}"


def _grade_filter(preset: str, intensity: float) -> str:
    """Ajuste de color, interpolado desde el neutro segun la intensidad."""
    valores = GRADE_PRESETS.get(preset, GRADE_PRESETS["neutral"])
    k = max(0.0, min(1.0, intensity))
    contrast = 1.0 + (valores["contrast"] - 1.0) * k
    saturation = 1.0 + (valores["saturation"] - 1.0) * k
    gamma = 1.0 + (valores["gamma"] - 1.0) * k
    return f"eq=contrast={contrast:.4f}:saturation={saturation:.4f}:gamma={gamma:.4f}"


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
    if grade and not audio_only:
        g = grade[0]
        post.append(_grade_filter(g.preset, g.intensity))
        aplicado.append(f"color {g.preset}")

    transiciones = [] if audio_only else edl.effects_of(EffectKind.TRANSITION)
    for t in sorted(transiciones, key=lambda e: e.start):
        mitad = max(0.04, t.duration / 2)
        color = "white" if t.transition == "flash" else "black"
        # Un "dip" al color: salida y entrada centradas en el corte. Mantiene la
        # duracion exacta, al contrario que xfade.
        post.append(f"fade=t=out:st={t.start:.4f}:d={mitad:.4f}:color={color}")
        post.append(f"fade=t=in:st={t.start + mitad:.4f}:d={mitad:.4f}:color={color}")
    if transiciones:
        aplicado.append(f"{len(transiciones)} transiciones")

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

        audio_post: list[str] = []
        if loudnorm_measured:
            # Segunda pasada: con las medidas reales la normalizacion es lineal
            # y no bombea, que es lo que pasa en una sola pasada.
            audio_post.append(
                "loudnorm="
                f"I={target_lufs:.1f}:TP=-1.5:LRA=11"
                f":measured_I={loudnorm_measured['input_i']}"
                f":measured_TP={loudnorm_measured['input_tp']}"
                f":measured_LRA={loudnorm_measured['input_lra']}"
                f":measured_thresh={loudnorm_measured['input_thresh']}"
                f":offset={loudnorm_measured['target_offset']}"
                ":linear=true:print_format=summary"
            )
            aplicado.append(f"audio a {target_lufs:.0f} LUFS")
        elif target_lufs is not None:
            audio_post.append(f"loudnorm=I={target_lufs:.1f}:TP=-1.5:LRA=11")
            aplicado.append(f"audio a {target_lufs:.0f} LUFS (una pasada)")

        audio_post.append("aresample=48000")
        partes.append(f"{a_actual}" + ",".join(audio_post) + "[aout]")
        a_label = "[aout]"

    return BuiltGraph(
        filter_complex=";".join(partes),
        video_label=v_label,
        audio_label=a_label,
        input_args=input_args,
        applied=aplicado,
    )
