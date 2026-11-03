"""
PERSONA CON ESQUELETO (habitantes, jugador y náufragos): una sola malla low-poly estilizada
(proporciones algo chatas, manos en manopla, cara sencilla con nariz y ojos pintados) con su
esqueleto y una acción por pose del juego (clips glTF que `src/render/ship/characterModel.ts` mezcla
con un AnimationMixer).

MEDIDAS: las del rig procedimental de `character.ts` (el respaldo), para que sillas, camas, sofá,
taburetes y puestos encajen igual: pies en z = 0, cadera a 0,9 m, articulación de la cadera a
0,82 m (±0,09), rodilla a 0,40 m, hombros a 1,35 m (±0,235), codo a 1,06 m, muñeca a 0,80 m y
coronilla a ~1,77 m. Frente = +Y de Blender (−z en el juego).

MATERIALES (nombre estable; el juego los recolorea con el CharacterLook): skin, shirt, pants, shoes,
hair, hat, coat, eyes, `detalle` (colores fijos: cinturón, hebilla, visera, brillo de los ojos) y
`botones` (los del abrigo: colores fijos, van y vienen con él). El color por vértice 'Col' es un
MULTIPLICADOR lineal del color del material (1 = el color tal cual; 0,8 = bolsillo; 0,5 = boca),
salvo en `detalle` y `botones`, donde es el color absoluto.

PIEZAS que el juego muestra u oculta (cada una pesada al 100 % a su hueso, hijo de la cabeza): los
cuatro peinados `pelo_corto`, `pelo_melena`, `pelo_rapado`, `pelo_recogido` (+ `pelo_bollo`, el moño),
los gorros `gorro_lana` y `gorra`. El abrigo es el material `coat` (pesado como la ropa de debajo).

HUESOS (giros de las acciones escritos en ejes del ARMAZÓN en reposo, relativos al padre, como los
grupos del rig procedimental): x = flexión (miembros hacia delante; tronco y cabeza hacia atrás),
y = inclinación lateral (la punta de un hueso que sube va hacia +X), z = giro (positivo a la
izquierda, visto desde arriba). `raiz` (en los pies) lleva los desplazamientos del cuerpo entero:
sentarse, tumbarse, arrodillarse.

El modelo raíz es la malla `persona`; el esqueleto `persona_esqueleto` es su hijo (así el
manifiesto tiene caja envolvente y triángulos de la malla).
"""
import math

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

import cf

ANIMATIONS = True
# Muestreo de las acciones: el exportador escribe una clave por fotograma y three.js interpola
# entre ellas; 10 por segundo bastan para estos ciclos y dejan el archivo en la mitad.
FPS = 10

SLOTS = ('skin', 'shirt', 'pants', 'shoes', 'hair', 'hat', 'coat', 'eyes', 'detalle', 'botones')
# Colores de muestra (solo para ver el modelo en Blender; el juego pone los suyos).
PREVIEW = {'skin': '#e0ac69', 'shirt': '#e76f51', 'pants': '#3d405b', 'shoes': '#3b2a1e', 'hair': '#5a3825',
           'hat': '#bc4749', 'coat': '#3a5a40', 'eyes': '#1d1d1d', 'detalle': '#ffffff', 'botones': '#c9a35a'}

DARK = '#22262a'
BRASS = '#c9a35a'
BELT = '#2b2118'

# Esqueleto: nombre, cabeza, cola, padre, eje Z del hueso (orienta su giro).
SIDES = (('i', -1), ('d', 1))
UP_Z = (0, -1, 0)      # huesos que suben: Z local hacia atrás (X local = +X del armazón)
DOWN_Z = (0, 1, 0)     # huesos que bajan: Z local hacia delante (X local = +X del armazón)
FWD_Z = (0, 0, 1)      # huesos hacia delante (raíz, pies): Z local arriba


def bone_specs():
    b = [
        ('raiz', (0, 0, 0), (0, 0.2, 0), None, FWD_Z),
        ('cadera', (0, 0, 0.9), (0, 0, 1.0), 'raiz', UP_Z),
        ('columna', (0, 0, 1.0), (0, 0, 1.18), 'cadera', UP_Z),
        ('pecho', (0, 0, 1.18), (0, 0, 1.4), 'columna', UP_Z),
        ('cuello', (0, 0, 1.4), (0, 0, 1.49), 'pecho', UP_Z),
        ('cabeza', (0, 0, 1.49), (0, 0, 1.75), 'cuello', UP_Z),
    ]
    for s, sx in SIDES:
        b += [
            (f'hombro_{s}', (sx * 0.05, 0, 1.36), (sx * 0.2, 0, 1.36), 'pecho', FWD_Z),
            (f'brazo_{s}', (sx * 0.235, 0, 1.35), (sx * 0.235, 0, 1.06), f'hombro_{s}', DOWN_Z),
            (f'antebrazo_{s}', (sx * 0.235, 0, 1.06), (sx * 0.235, 0, 0.8), f'brazo_{s}', DOWN_Z),
            (f'mano_{s}', (sx * 0.235, 0, 0.8), (sx * 0.235, 0, 0.7), f'antebrazo_{s}', DOWN_Z),
            (f'muslo_{s}', (sx * 0.09, 0, 0.82), (sx * 0.09, 0, 0.4), 'cadera', DOWN_Z),
            (f'pierna_{s}', (sx * 0.09, 0, 0.4), (sx * 0.09, 0, 0.08), f'muslo_{s}', DOWN_Z),
            (f'pie_{s}', (sx * 0.09, 0, 0.08), (sx * 0.09, 0.14, 0.08), f'pierna_{s}', FWD_Z),
        ]
    for name in ('pelo_corto', 'pelo_melena', 'pelo_rapado', 'pelo_recogido', 'pelo_bollo', 'gorro_lana', 'gorra'):
        b.append((name, (0, 0, 1.62), (0, 0, 1.7), 'cabeza', UP_Z))
    return b


# ---------------------------------------------------------------- utilidades de malla

def _slot(name):
    return SLOTS.index(name)


def finish_part(ob, slot, weights):
    """Material de la pieza (todos los slots en el mismo orden, para que join no los mezcle),
    color multiplicador blanco y grupos de vértices según `weights(co) -> {hueso: peso}`."""
    me = ob.data
    for s in SLOTS:
        me.materials.append(bpy.data.materials[s])
    for p in me.polygons:
        p.material_index = _slot(slot)
    attr = cf._color_layer(me)
    for i in range(len(attr.data)):
        attr.data[i].color = (1.0, 1.0, 1.0, 1.0)
    groups = {}
    for v in me.vertices:
        w = weights(v.co)
        tot = sum(w.values()) or 1.0
        for bone, x in w.items():
            if x <= 0:
                continue
            g = groups.get(bone) or ob.vertex_groups.get(bone) or ob.vertex_groups.new(name=bone)
            groups[bone] = g
            g.add([v.index], x / tot, 'REPLACE')
    return ob


def mult(ob, f, where=None):
    """Multiplica el color (multiplicador lineal) de las caras que cumplan `where(poly)`."""
    me = ob.data
    attr = cf._color_layer(me)
    for p in me.polygons:
        if where is None or where(p):
            for li in p.loop_indices:
                c = attr.data[li].color
                attr.data[li].color = (c[0] * f, c[1] * f, c[2] * f, 1.0)
    return ob


def absolute(ob, color, where=None):
    """Color absoluto (material `detalle`)."""
    me = ob.data
    attr = cf._color_layer(me)
    c = cf.rgba(color)
    for p in me.polygons:
        if where is None or where(p):
            for li in p.loop_indices:
                attr.data[li].color = c
    return ob


def jitter(ob, amount, seed):
    cf.jitter_colors(ob, amount, seed)
    return ob


def loft(name, rings, seg=8, phase=0.0, caps=(True, True)):
    """
    Tubo vertical (o casi) a partir de secciones elípticas `rings` = [(cx, cy, z, rx, ry), …] de
    abajo arriba. Las secciones son horizontales: sirve para tronco, piernas y brazos en reposo.
    """
    bm = bmesh.new()
    vs = []
    for cx, cy, z, rx, ry in rings:
        ring = []
        for k in range(seg):
            a = phase + 2 * math.pi * k / seg
            ring.append(bm.verts.new((cx + math.cos(a) * rx, cy + math.sin(a) * ry, z)))
        vs.append(ring)
    for a, b in zip(vs, vs[1:]):
        for k in range(seg):
            k2 = (k + 1) % seg
            bm.faces.new((a[k], a[k2], b[k2], b[k]))
    if caps[0]:
        bm.faces.new(list(reversed(vs[0])))
    if caps[1]:
        bm.faces.new(vs[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return cf._link(name, bm)


def hull(name, points, dissolve=2.0):
    bm = bmesh.new()
    for p in points:
        bm.verts.new(p)
    bmesh.ops.convex_hull(bm, input=bm.verts)
    if dissolve:
        bmesh.ops.dissolve_limit(bm, angle_limit=math.radians(dissolve), verts=bm.verts, edges=bm.edges)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return cf._link(name, bm)


def chamfer_box(cx, cy, z0, z1, hx, hy, bev, top_scale=1.0, bot_scale=1.0):
    """Puntos de una caja achaflanada (para `hull`): cabeza, zapatos, manoplas."""
    pts = []
    for z, sc in ((z0, bot_scale), (z0 + bev, 1.0), (z1 - bev, 1.0), (z1, top_scale)):
        cap = z in (z0, z1)
        for sx in (-1, 1):
            for sy in (-1, 1):
                ex = hx * sc
                ey = hy * sc
                if cap:
                    pts += [(cx + sx * (ex - bev), cy + sy * (ey - bev), z)]
                else:
                    pts += [(cx + sx * ex, cy + sy * (ey - bev), z), (cx + sx * (ex - bev), cy + sy * ey, z)]
    return pts


def lathe_z(name, profile, seg=8, phase=0.0, at=(0, 0, 0), scale=(1, 1, 1)):
    """Revolución alrededor de Z (gorro, moño) con fase para orientar las caras."""
    bm = bmesh.new()
    rings = []
    for r, z in profile:
        if r <= 1e-6:
            rings.append([bm.verts.new((at[0], at[1], z))])
            continue
        ring = []
        for k in range(seg):
            a = phase + 2 * math.pi * k / seg
            ring.append(bm.verts.new((at[0] + math.cos(a) * r * scale[0], at[1] + math.sin(a) * r * scale[1], z)))
        rings.append(ring)
    for a, b in zip(rings, rings[1:]):
        if len(a) == 1 and len(b) == 1:
            continue
        if len(a) == 1:
            for k in range(seg):
                bm.faces.new((a[0], b[k], b[(k + 1) % seg]))
        elif len(b) == 1:
            for k in range(seg):
                bm.faces.new((a[k], a[(k + 1) % seg], b[0]))
        else:
            for k in range(seg):
                k2 = (k + 1) % seg
                bm.faces.new((a[k], a[k2], b[k2], b[k]))
    if len(rings[0]) > 1:
        bm.faces.new(list(reversed(rings[0])))
    if len(rings[-1]) > 1:
        bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return cf._link(name, bm)


def zweights(table):
    """Pesos interpolados en z: `table` = [(z, {hueso: peso}), …] de abajo arriba."""
    def fn(co):
        z = co.z
        if z <= table[0][0]:
            return dict(table[0][1])
        for (z0, w0), (z1, w1) in zip(table, table[1:]):
            if z <= z1:
                t = (z - z0) / (z1 - z0) if z1 > z0 else 0
                out = {}
                for k in set(w0) | set(w1):
                    out[k] = w0.get(k, 0) * (1 - t) + w1.get(k, 0) * t
                return out
        return dict(table[-1][1])
    return fn


def one(bone):
    return lambda co: {bone: 1.0}


# ---------------------------------------------------------------- cuerpo

HEAD_Z0 = 1.462
HEAD_Z1 = 1.75
HEAD_HX = 0.134
HEAD_HY = 0.138


def torso_weights(co):
    return zweights([
        (0.9, {'cadera': 1.0}),
        (0.98, {'cadera': 0.5, 'columna': 0.5}),
        (1.06, {'columna': 1.0}),
        (1.16, {'columna': 0.55, 'pecho': 0.45}),
        (1.26, {'pecho': 1.0}),
        (1.4, {'pecho': 1.0}),
        (1.46, {'pecho': 0.5, 'cuello': 0.5}),
    ])(co)


def torso():
    """Camisa: tronco ancho de pecho, cintura algo más estrecha, hombros redondeados."""
    rings = [
        (0, 0.0, 0.93, 0.172, 0.112),
        (0, 0.0, 1.04, 0.178, 0.116),
        (0, 0.004, 1.17, 0.204, 0.128),
        (0, 0.006, 1.28, 0.214, 0.132),
        (0, 0.0, 1.36, 0.202, 0.124),
        (0, -0.005, 1.415, 0.13, 0.092),
    ]
    ob = finish_part(loft('torso', rings, seg=8, phase=math.pi / 8), 'shirt', torso_weights)
    # Cuello de la camisa y bolsillo (a la izquierda del pecho: −X).
    collar = finish_part(loft('cuello_camisa', [(0, -0.004, 1.385, 0.112, 0.088), (0, -0.002, 1.43, 0.09, 0.075)], seg=8, phase=math.pi / 8, caps=(False, False)),
                         'shirt', torso_weights)
    mult(collar, 0.86)
    def front(x, z):
        # superficie delantera del tronco (elipse de la sección a esa altura)
        rx, ry = (0.198, 0.126) if z < 1.22 else (0.21, 0.13)
        return ry * math.sqrt(max(0.0, 1 - (x / rx) ** 2)) * math.cos(math.pi / 8) + 0.004
    pocket = finish_part(hull('bolsillo', [(x, front(x, z) + d, z) for x in (-0.14, -0.06) for d in (-0.006, 0.004) for z in (1.19, 1.27)]), 'shirt', torso_weights)
    mult(pocket, 0.8)
    mult(ob, 0.93, lambda p: p.normal.z < -0.5)
    jitter(ob, 0.03, 21)
    return [ob, collar, pocket]


def pelvis():
    """Pantalón (cadera) con cinturón y hebilla."""
    w = zweights([(0.8, {'cadera': 0.8, 'muslo_i': 0.1, 'muslo_d': 0.1}), (0.88, {'cadera': 1.0}), (0.98, {'cadera': 1.0})])
    ob = finish_part(loft('cadera', [(0, 0, 0.78, 0.165, 0.105), (0, 0, 0.86, 0.176, 0.112), (0, 0, 0.965, 0.175, 0.114)], seg=8, phase=math.pi / 8), 'pants', w)
    belt = finish_part(loft('cinturon', [(0, 0, 0.935, 0.18, 0.118), (0, 0, 0.98, 0.18, 0.118)], seg=8, phase=math.pi / 8, caps=(False, False)),
                       'detalle', lambda co: {'cadera': 0.6, 'columna': 0.4})
    absolute(belt, BELT)
    buckle = finish_part(hull('hebilla', [(x, y, z) for x in (-0.03, 0.03) for y in (0.112, 0.128) for z in (0.94, 0.976)]), 'detalle', lambda co: {'cadera': 0.6, 'columna': 0.4})
    absolute(buckle, BRASS)
    return [ob, belt, buckle]


def leg(s, sx):
    """Pierna (pantalón) de la cadera al tobillo, con la rodilla marcada y bajo con vuelta."""
    x = sx * 0.09
    rings = [
        (x, 0.0, 0.1, 0.066, 0.07),
        (x, 0.0, 0.16, 0.062, 0.066),
        (x, 0.004, 0.33, 0.066, 0.07),
        (x, 0.012, 0.4, 0.072, 0.074),
        (x, 0.004, 0.47, 0.076, 0.078),
        (x, 0.0, 0.66, 0.084, 0.086),
        (x + sx * 0.004, 0.0, 0.88, 0.086, 0.094),
    ]
    w = zweights([
        (0.1, {f'pierna_{s}': 0.85, f'pie_{s}': 0.15}),
        (0.18, {f'pierna_{s}': 1.0}),
        (0.33, {f'pierna_{s}': 0.85, f'muslo_{s}': 0.15}),
        (0.4, {f'pierna_{s}': 0.5, f'muslo_{s}': 0.5}),
        (0.47, {f'muslo_{s}': 0.85, f'pierna_{s}': 0.15}),
        (0.6, {f'muslo_{s}': 1.0}),
        (0.78, {f'muslo_{s}': 0.85, 'cadera': 0.15}),
        (0.88, {f'muslo_{s}': 0.5, 'cadera': 0.5}),
    ])
    ob = finish_part(loft(f'pierna_{s}', rings, seg=7, phase=math.pi / 2), 'pants', w)
    # vuelta del bajo algo más oscura
    mult(ob, 0.86, lambda p: p.center.z < 0.15)
    jitter(ob, 0.03, 31 + sx)
    return ob


def shoe(s, sx):
    """Zapato de puntera redondeada y suela oscura."""
    x = sx * 0.09
    pts = chamfer_box(x, 0.04, 0.0, 0.085, 0.066, 0.125, 0.022, top_scale=0.92, bot_scale=0.98)
    # empeine y caña: más alto detrás
    pts += [(x + dx, y, z) for dx in (-0.05, 0.05) for y, z in ((-0.06, 0.12), (0.03, 0.115), (0.09, 0.075))]
    ob = hull(f'zapato_{s}', pts)
    w = zweights([(0.0, {f'pie_{s}': 1.0}), (0.07, {f'pie_{s}': 1.0}), (0.12, {f'pie_{s}': 0.5, f'pierna_{s}': 0.5})])
    finish_part(ob, 'shoes', w)
    mult(ob, 0.55, lambda p: p.normal.z < -0.7)
    mult(ob, 1.18, lambda p: p.normal.z > 0.5 and p.center.y > 0.06)
    return ob


def arm(s, sx):
    """Manga corta de la camisa, antebrazo desnudo y manopla con pulgar."""
    x = sx * 0.235
    sleeve_w = zweights([
        (1.06, {f'brazo_{s}': 0.7, f'antebrazo_{s}': 0.3}),
        (1.14, {f'brazo_{s}': 0.95, f'antebrazo_{s}': 0.05}),
        (1.3, {f'brazo_{s}': 1.0}),
        (1.42, {f'brazo_{s}': 0.6, 'pecho': 0.25, f'hombro_{s}': 0.15}),
    ])
    sleeve = loft(f'manga_{s}', [
        (x, 0, 1.075, 0.066, 0.068),
        (x, 0, 1.11, 0.068, 0.07),
        (x + sx * 0.002, 0, 1.25, 0.066, 0.068),
        (x - sx * 0.012, 0, 1.34, 0.062, 0.064),
        (x - sx * 0.05, 0, 1.4, 0.046, 0.05),
    ], seg=7, phase=math.pi / 2)
    finish_part(sleeve, 'shirt', sleeve_w)
    mult(sleeve, 0.88, lambda p: p.center.z < 1.1)
    jitter(sleeve, 0.03, 41 + sx)
    fore_w = zweights([
        (0.8, {f'antebrazo_{s}': 0.7, f'mano_{s}': 0.3}),
        (0.86, {f'antebrazo_{s}': 1.0}),
        (1.0, {f'antebrazo_{s}': 0.85, f'brazo_{s}': 0.15}),
        (1.06, {f'antebrazo_{s}': 0.5, f'brazo_{s}': 0.5}),
        (1.14, {f'brazo_{s}': 0.85, f'antebrazo_{s}': 0.15}),
    ])
    fore = loft(f'antebrazo_{s}', [
        (x, 0, 0.79, 0.036, 0.04),
        (x, 0, 0.86, 0.038, 0.043),
        (x, 0, 0.98, 0.046, 0.05),
        (x, 0, 1.08, 0.048, 0.052),
        (x, 0, 1.13, 0.046, 0.05),
    ], seg=6, phase=math.pi / 2)
    finish_part(fore, 'skin', fore_w)
    hand = hand_part(s, sx)
    return [sleeve, fore, hand]


def hand_part(s, sx):
    """Manopla: palma hacia el muslo (−X en la derecha), pulgar delante."""
    x = sx * 0.235
    pts = chamfer_box(x - sx * 0.004, 0.006, 0.685, 0.8, 0.03, 0.047, 0.014, top_scale=0.8, bot_scale=0.85)
    hand = hull(f'mano_{s}', pts)
    thumb = hull(f'pulgar_{s}', [
        (x - sx * 0.022 + dx, y, z) for dx in (-0.016, 0.016) for y, z in ((0.03, 0.775), (0.06, 0.765), (0.055, 0.735), (0.035, 0.75))
    ])
    w = zweights([(0.68, {f'mano_{s}': 1.0}), (0.78, {f'mano_{s}': 1.0}), (0.81, {f'mano_{s}': 0.6, f'antebrazo_{s}': 0.4})])
    finish_part(hand, 'skin', w)
    finish_part(thumb, 'skin', w)
    mult(hand, 0.9, lambda p: sx * p.normal.x < -0.5)
    mult(thumb, 0.95)
    return cf.join([hand, thumb], f'mano_{s}')


def neck():
    ob = loft('cuello', [(0, -0.004, 1.38, 0.056, 0.054), (0, -0.004, 1.5, 0.054, 0.052)], seg=6, phase=math.pi / 6)
    finish_part(ob, 'skin', zweights([(1.38, {'pecho': 0.6, 'cuello': 0.4}), (1.44, {'cuello': 1.0}), (1.5, {'cuello': 0.5, 'cabeza': 0.5})]))
    mult(ob, 0.86)
    return ob


def head():
    """Cabeza de bloque achaflanado (la mandíbula algo más estrecha), orejas, nariz, ojos pintados,
    cejas y boca."""
    hd = hull('cabeza', chamfer_box(0, 0, HEAD_Z0, HEAD_Z1, HEAD_HX, HEAD_HY, 0.04, top_scale=0.94, bot_scale=0.84))
    finish_part(hd, 'skin', one('cabeza'))
    mult(hd, 0.94, lambda p: p.normal.z < -0.5)
    parts = [hd]
    fy = HEAD_HY  # plano de la cara
    nose = hull('nariz', [(0, fy + 0.036, 1.567), (-0.019, fy, 1.555), (0.019, fy, 1.555), (-0.013, fy, 1.618), (0.013, fy, 1.618), (0, fy + 0.012, 1.62), (0, fy + 0.03, 1.552)], dissolve=0)
    finish_part(nose, 'skin', one('cabeza'))
    mult(nose, 1.04, lambda p: p.normal.y > 0.5)
    mult(nose, 0.9, lambda p: p.normal.z < -0.3)
    parts.append(nose)
    for sx in (-1, 1):
        ex = sx * 0.054
        eye = hull(f'ojo_{sx}', [(ex + math.cos(a) * 0.016, fy + d, 1.607 + math.sin(a) * 0.022)
                                 for a in [k * math.pi / 3 + math.pi / 6 for k in range(6)] for d in (-0.004, 0.003)])
        finish_part(eye, 'eyes', one('cabeza'))
        shine = hull(f'brillo_{sx}', [(ex + sx * 0.002 + dx, fy + d, 1.616 + dz) for dx in (0.0, 0.007) for dz in (0.0, 0.008) for d in (0.0, 0.0045)])
        finish_part(shine, 'detalle', one('cabeza'))
        absolute(shine, '#f8f4ea')
        brow = hull(f'ceja_{sx}', [(sx * x, fy + d, z) for x, z in ((0.03, 1.651), (0.078, 1.656), (0.078, 1.668), (0.03, 1.664)) for d in (-0.004, 0.006)])
        finish_part(brow, 'hair', one('cabeza'))
        mult(brow, 0.82)
        ear = hull(f'oreja_{sx}', [(sx * (HEAD_HX + dx), y, z) for dx in (-0.01, 0.018) for y, z in ((-0.02, 1.58), (0.02, 1.585), (0.02, 1.64), (-0.025, 1.65), (-0.03, 1.61))])
        finish_part(ear, 'skin', one('cabeza'))
        mult(ear, 0.92)
        parts += [eye, shine, brow, ear]
    mouth = hull('boca', [(x, fy + d, z) for x in (-0.026, 0.026) for z in (1.527, 1.536) for d in (-0.004, 0.003)] + [(0, fy + 0.003, 1.523)])
    finish_part(mouth, 'skin', one('cabeza'))
    mult(mouth, 0.5)
    parts.append(mouth)
    return parts


# ---------------------------------------------------------------- pelo y gorros

def hair_cap(name, bone, top=1.783, front=1.69, side=1.615, back=1.56, ex=0.147, ey=0.155, fringe=True):
    """Casquete de pelo: coronilla redondeada (chaflán ancho: así cabe bajo los gorros sin
    asomar por las esquinas), nacimiento en la frente, patillas y nuca."""
    bev = 0.07
    pts = []
    for sx in (-1, 1):
        for sy in (-1, 1):
            pts += [(sx * ex, sy * (ey - bev), top - 0.03), (sx * (ex - bev), sy * ey, top - 0.03), (sx * (ex - bev * 0.8), sy * (ey - bev * 0.8), top)]
    # frente (nacimiento del pelo), sienes, patillas y nuca
    pts += [(x, ey, front) for x in (-0.085, 0.085)]
    pts += [(sx * ex, y, z) for sx in (-1, 1) for y, z in ((0.1, front - 0.01), (0.06, side), (-0.02, side - 0.01))]
    pts += [(sx * (ex - 0.02), -ey, back) for sx in (-1, 1)] + [(0, -ey - 0.006, back - 0.012)]
    pts += [(sx * ex, -0.08, back + 0.02) for sx in (-1, 1)]
    if fringe:
        pts += [(-0.035, ey + 0.012, front - 0.03), (0.04, ey + 0.008, front - 0.012)]
    ob = hull(name, pts, dissolve=1.0)
    finish_part(ob, 'hair', one(bone))
    jitter(ob, 0.07, sum(ord(c) for c in name))
    mult(ob, 0.85, lambda p: p.normal.z < -0.3)
    return ob


def hairstyles():
    out = []
    # 0 corto: casquete con flequillo y nuca a media altura
    out.append(hair_cap('pelo_corto', 'pelo_corto'))
    # 1 media melena: casquete y una cortina por detrás y a los lados hasta la mandíbula
    cap = hair_cap('pelo_melena_casquete', 'pelo_melena', front=1.685, side=1.6, back=1.5, ex=0.151, ey=0.158)
    curtain = hull('pelo_melena_cortina', [
        (sx * 0.158, y, z) for sx in (-1, 1) for y, z in ((0.07, 1.47), (0.075, 1.64), (-0.1, 1.665), (-0.166, 1.45), (0.02, 1.44))
    ] + [(0, -0.178, 1.44), (0, -0.178, 1.66)], dissolve=1.0)
    finish_part(curtain, 'hair', one('pelo_melena'))
    jitter(curtain, 0.06, 77)
    mult(curtain, 0.88, lambda p: p.normal.z < -0.3)
    out.append(cf.join([cap, curtain], 'pelo_melena'))
    # 2 rapado: capa fina pegada al cráneo
    out.append(hair_cap('pelo_rapado', 'pelo_rapado', top=1.76, front=1.7, side=1.63, back=1.59, ex=0.139, ey=0.145, fringe=False))
    # 3 recogido: casquete ceñido (el moño va aparte para poder quitarlo bajo un gorro)
    out.append(hair_cap('pelo_recogido', 'pelo_recogido', top=1.77, front=1.7, side=1.62, back=1.57, ex=0.143, ey=0.15, fringe=False))
    bun = lathe_z('pelo_bollo', [(0.0, 1.655), (0.042, 1.665), (0.058, 1.7), (0.05, 1.74), (0.0, 1.755)], seg=7, at=(0, -0.174, 0))
    finish_part(bun, 'hair', one('pelo_bollo'))
    jitter(bun, 0.08, 99)
    out.append(bun)
    return out


def hats():
    # Gorro de lana: cúpula octogonal (encierra cualquier peinado), vuelta doblada y borla.
    band_top = 1.705
    beanie = lathe_z('gorro_lana', [(0.19, 1.63), (0.197, 1.66), (0.197, band_top), (0.189, band_top + 0.008), (0.188, 1.79),
                                    (0.158, 1.848), (0.1, 1.881), (0.0, 1.893)], seg=8, phase=math.pi / 8)
    finish_part(beanie, 'hat', one('gorro_lana'))
    mult(beanie, 0.78, lambda p: p.center.z < band_top + 0.002)
    jitter(beanie, 0.05, 55)
    pom = hull('borla', [(math.cos(a) * r, math.sin(a) * r, z) for z, r in ((1.865, 0.03), (1.9, 0.048), (1.935, 0.03)) for a in [k * math.pi / 3 + z * 9 for k in range(6)]])
    finish_part(pom, 'hat', one('gorro_lana'))
    mult(pom, 1.18)
    beanie = cf.join([beanie, pom], 'gorro_lana')
    # Gorra de marinero: copa clara, cinta y visera oscuras.
    crown = lathe_z('gorra', [(0.18, 1.705), (0.188, 1.78), (0.194, 1.805), (0.0, 1.811)], seg=8, phase=math.pi / 8)
    finish_part(crown, 'hat', one('gorra'))
    mult(crown, 0.9, lambda p: p.normal.z < 0.7)
    band = lathe_z('gorra_cinta', [(0.183, 1.67), (0.184, 1.71)], seg=8, phase=math.pi / 8)
    finish_part(band, 'detalle', one('gorra'))
    absolute(band, DARK)
    visor = hull('visera', [(x * s, y, z) for s in (1,) for x, y, z in (
        (-0.12, 0.12, 1.68), (0.12, 0.12, 1.68), (-0.1, 0.245, 1.655), (0.1, 0.245, 1.655), (0.0, 0.26, 1.652),
        (-0.12, 0.12, 1.69), (0.12, 0.12, 1.69), (-0.1, 0.245, 1.664), (0.1, 0.245, 1.664), (0.0, 0.26, 1.661))], dissolve=0)
    finish_part(visor, 'detalle', one('gorra'))
    absolute(visor, '#1d1d1d')
    cap = cf.join([crown, band, visor], 'gorra')
    return [beanie, cap]


# ---------------------------------------------------------------- abrigo

def coat():
    """Abrigo largo de lona (material `coat`): tronco hasta medio muslo, cuello subido, mangas
    hasta la muñeca, botones de latón y bolsillos."""
    w = zweights([
        (0.5, {'cadera': 1.0}),
        (0.98, {'cadera': 0.6, 'columna': 0.4}),
        (1.06, {'columna': 1.0}),
        (1.16, {'columna': 0.55, 'pecho': 0.45}),
        (1.26, {'pecho': 1.0}),
        (1.42, {'pecho': 0.8, 'cuello': 0.2}),
    ])
    body = loft('abrigo', [
        (0, -0.004, 0.53, 0.205, 0.142),
        (0, -0.002, 0.78, 0.198, 0.135),
        (0, 0.0, 0.95, 0.19, 0.13),
        (0, 0.004, 1.06, 0.192, 0.133),
        (0, 0.006, 1.18, 0.212, 0.142),
        (0, 0.008, 1.29, 0.224, 0.146),
        (0, 0.0, 1.37, 0.213, 0.136),
        (0, -0.006, 1.425, 0.135, 0.1),
    ], seg=8, phase=math.pi / 8, caps=(False, True))
    finish_part(body, 'coat', w)
    # costura delantera y bajo algo más oscuros
    mult(body, 0.9, lambda p: p.center.z < 0.6)
    jitter(body, 0.035, 61)
    collar = loft('abrigo_cuello', [(0, -0.012, 1.39, 0.13, 0.104), (0, -0.016, 1.47, 0.112, 0.094)], seg=8, phase=math.pi / 8, caps=(False, False))
    finish_part(collar, 'coat', w)
    mult(collar, 0.8)
    parts = [body, collar]
    for k, z in enumerate((0.98, 1.1, 1.22)):
        btn = hull(f'boton_{k}', [(x, y, zz) for x in (-0.014, 0.014) for y in (0.128, 0.146) for zz in (z - 0.014, z + 0.014)])
        finish_part(btn, 'botones', w)
        absolute(btn, BRASS)
        parts.append(btn)
    for sx in (-1, 1):
        pk = hull(f'abrigo_bolsillo_{sx}', [(sx * x, y, z) for x in (0.06, 0.16) for y in (0.128, 0.142) for z in (0.7, 0.8)])
        finish_part(pk, 'coat', w)
        mult(pk, 0.82)
        parts.append(pk)
    for s, sx in SIDES:
        x = sx * 0.235
        sw = zweights([
            (0.87, {f'antebrazo_{s}': 1.0}),
            (1.0, {f'antebrazo_{s}': 0.85, f'brazo_{s}': 0.15}),
            (1.06, {f'antebrazo_{s}': 0.5, f'brazo_{s}': 0.5}),
            (1.14, {f'brazo_{s}': 0.9, f'antebrazo_{s}': 0.1}),
            (1.3, {f'brazo_{s}': 1.0}),
            (1.43, {f'brazo_{s}': 0.6, 'pecho': 0.25, f'hombro_{s}': 0.15}),
        ])
        sl = loft(f'abrigo_manga_{s}', [
            (x, 0, 0.865, 0.06, 0.064),
            (x, 0, 0.9, 0.058, 0.062),
            (x, 0, 1.06, 0.074, 0.076),
            (x + sx * 0.004, 0, 1.25, 0.08, 0.082),
            (x - sx * 0.012, 0, 1.37, 0.077, 0.079),
            (x - sx * 0.045, 0, 1.43, 0.058, 0.064),
        ], seg=7, phase=math.pi / 2, caps=(False, True))
        finish_part(sl, 'coat', sw)
        mult(sl, 0.84, lambda p: p.center.z < 0.91)
        jitter(sl, 0.03, 71 + sx)
        parts.append(sl)
    return parts


# ---------------------------------------------------------------- esqueleto

def make_armature():
    ad = bpy.data.armatures.new('persona_esqueleto')
    arm = bpy.data.objects.new('persona_esqueleto', ad)
    bpy.context.scene.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode='EDIT')
    eb = {}
    for name, head_, tail, parent, zaxis in bone_specs():
        b = ad.edit_bones.new(name)
        b.head = head_
        b.tail = tail
        b.align_roll(Vector(zaxis))
        b.use_deform = name != 'raiz'
        if parent:
            b.parent = eb[parent]
        eb[name] = b
    bpy.ops.object.mode_set(mode='OBJECT')
    return arm


# ---------------------------------------------------------------- poses

def S(t, k=1, ph=0.0):
    """Seno cíclico: `k` vueltas enteras por ciclo (encaja al repetir)."""
    return math.sin(2 * math.pi * (k * t + ph))


def C(t, k=1, ph=0.0):
    return math.cos(2 * math.pi * (k * t + ph))


def smooth(x):
    x = max(0.0, min(1.0, x))
    return x * x * (3 - 2 * x)


def mix(a, b, k):
    return a + (b - a) * k


def mside(s):
    return 1 if s == 'd' else -1


def arm_pose(p, s, flex=0.0, abd=0.0, cross=0.0, el=0.0, wrist=0.0, wside=0.0, lift=0.0):
    """Brazo: flexión (adelante), abducción (hacia fuera), cruce horizontal (hacia el otro lado,
    con el brazo levantado), codo (flexión), muñeca y hombro (subir la clavícula)."""
    m = mside(s)
    p[f'brazo_{s}'] = (flex, -m * abd, m * cross)
    p[f'antebrazo_{s}'] = (el, 0.0, 0.0)
    p[f'mano_{s}'] = (wrist, -m * wside, 0.0)
    p[f'hombro_{s}'] = (0.0, -m * lift, 0.0)


def leg_pose(p, s, flex=0.0, abd=0.0, rot=0.0, knee=0.0, ankle=0.0):
    """Pierna: flexión de cadera (adelante), abducción, rotación hacia fuera, rodilla (flexión) y
    tobillo (punta arriba)."""
    m = mside(s)
    p[f'muslo_{s}'] = (flex, -m * abd, -m * rot)
    p[f'pierna_{s}'] = (-knee, 0.0, 0.0)
    p[f'pie_{s}'] = (ankle, 0.0, 0.0)


def spine(p, hips=(0, 0, 0), low=(0, 0, 0), chest=(0, 0, 0), neck=(0, 0, 0), head=(0, 0, 0)):
    """Tronco y cabeza: (hacia delante, lateral a la derecha, giro a la izquierda)."""
    for bone, (fwd, side, turn) in (('cadera', hips), ('columna', low), ('pecho', chest), ('cuello', neck), ('cabeza', head)):
        p[bone] = (-fwd, side, turn)


def root(p, loc=(0, 0, 0), rot=(0, 0, 0)):
    p['raiz_loc'] = loc
    p['raiz'] = rot


def base():
    return {}


def stand_arms(p, t, breathe=0.0):
    for s in 'id':
        arm_pose(p, s, flex=2 + 1.5 * breathe, abd=7, el=10 + 2 * breathe, lift=1.2 * breathe)


def stand_legs(p, t, sway=0.0):
    root(p, loc=(0.012 * sway, 0, 0))
    leg_pose(p, 'i', flex=1, abd=1 + 1.2 * sway, knee=3 + 3 * max(0, -sway), ankle=-1)
    leg_pose(p, 'd', flex=1, abd=1 - 1.2 * sway, knee=3 + 3 * max(0, sway), ankle=-1)


def seated_legs(p, spread=4):
    """Sentado en silla, sofá o taburete (asiento a ~0,47 m del suelo): pelvis algo hundida en el
    cojín, muslos casi horizontales y pies en el suelo. La cadera no se inclina (movería las
    piernas): la espalda se recuesta con la columna."""
    root(p, loc=(0, -0.05, -0.335))
    for s in 'id':
        leg_pose(p, s, flex=80, abd=spread, knee=82, ankle=2)


def floor_legs(p, t=0.0):
    """Sentado en el suelo: una pierna estirada y la otra con la rodilla arriba."""
    root(p, loc=(0, -0.02, -0.74))
    leg_pose(p, 'i', flex=86, abd=8, rot=6, knee=6, ankle=-8)
    leg_pose(p, 'd', flex=128, abd=6, knee=124, ankle=-2)


# --- ciclos de paso

def walk_legs(p, t, amp=22.0, knee_amp=34.0, bob=0.032, lean=4.0, limp=0.0):
    """Ciclo de paso (t en [0, 1)): pierna izquierda adelante en t = 0,25. Pies planos en el
    apoyo, punta levantada en el vuelo y despegue de puntera atrás."""
    ph = 2 * math.pi * t
    for s, off in (('i', 0.0), ('d', math.pi)):
        k = 1.0 - limp * (1 if s == 'd' else 0)
        f = ph + off
        hip = amp * math.sin(f) * (0.55 + 0.45 * k)
        swing = max(0.0, math.cos(f))          # vuelo: la pierna va hacia delante
        knee = knee_amp * swing * k + 6 * max(0.0, math.sin(f)) * (1 - swing)
        knee += 10 * max(0.0, -math.sin(f)) * max(0.0, -math.cos(f))  # despegue
        toe = 10 * swing - 22 * max(0.0, -math.sin(f)) * max(0.0, -math.cos(f)) * k
        ankle = toe - hip + knee
        leg_pose(p, s, flex=hip, abd=1.5, knee=knee, ankle=ankle)
    dip = math.sin(ph) ** 2
    lurch = limp * max(0.0, -math.sin(ph))  # apoyo en la pierna mala (derecha adelantada en t = 0,75)
    root(p, loc=(-0.02 * limp * math.sin(ph), 0, -bob * dip - 0.035 * lurch))
    spine(p, hips=(0, 2.5 * math.cos(2 * ph) * (1 - limp) + 7 * lurch, -6 * math.sin(ph)),
          low=(lean * 0.6, -4 * lurch, 0), chest=(lean * 0.4, -3 * lurch, 9 * math.sin(ph)),
          neck=(0, 0, -1.5 * math.sin(ph)), head=(-1 + 1.2 * math.cos(2 * ph), 2 * lurch, -1.5 * math.sin(ph)))


def walk_arms(p, t, amp=20.0, el=14.0):
    ph = 2 * math.pi * t
    for s, sg in (('i', -1), ('d', 1)):
        sw = sg * amp * math.sin(ph)
        arm_pose(p, s, flex=sw, abd=6, el=el + 0.35 * max(0.0, sw), wrist=-2)


def carry_arms(p, t=0.0, bob=0.0):
    for s in 'id':
        arm_pose(p, s, flex=40 + bob, abd=4, cross=4, el=52 - bob, wrist=-6, wside=-6)


# ---------------------------------------------------------------- acciones

def a_idle(t):
    p = base()
    b = S(t, 2)
    sway = S(t, 1, 0.1)
    stand_legs(p, t, sway)
    spine(p, hips=(0, 1.6 * sway, 0), low=(0.5, -1.0 * sway, 0), chest=(-1.2 * b, -0.6 * sway, 0),
          head=(-2 + 3 * S(t, 1, 0.3), 1.5 * S(t, 1, 0.6), 13 * S(t, 1, 0.15) + 5 * S(t, 2, 0.4)))
    stand_arms(p, t, b)
    return p


def a_idle_carga(t):
    p = base()
    b = S(t, 2)
    stand_legs(p, t, 0.3 * S(t))
    spine(p, low=(-2, 0, 0), chest=(-2.5 - 1.0 * b, 0, 0), head=(4, 0, 4 * S(t)))
    carry_arms(p, t, 1.0 * b)
    return p


def a_idle_cojo(t):
    p = base()
    b = S(t, 2)
    root(p, loc=(-0.022, 0, -0.012))
    leg_pose(p, 'i', flex=0, abd=3, knee=4, ankle=-2)
    leg_pose(p, 'd', flex=12, abd=-1, knee=24 + 2 * b, ankle=-16)
    spine(p, hips=(0, -5, 4), low=(6, 2, 0), chest=(4 - b, 2, -3), head=(10, -3, 6 * S(t, 1, 0.2)))
    arm_pose(p, 'i', flex=6, abd=8, el=14 + 2 * b)
    arm_pose(p, 'd', flex=18, abd=2, cross=8, el=34, wrist=-10)
    return p


def a_andar(t):
    p = base()
    walk_legs(p, t)
    walk_arms(p, t)
    return p


def a_correr(t):
    p = base()
    walk_legs(p, t, amp=36.0, knee_amp=78.0, bob=0.05, lean=12.0)
    p['raiz_loc'] = (0, 0, -0.03 + 0.03 * C(t, 2))
    ph = 2 * math.pi * t
    for s, sg in (('i', -1), ('d', 1)):
        sw = sg * 42 * math.sin(ph)
        arm_pose(p, s, flex=8 + sw, abd=8, cross=6, el=82 + 0.25 * sw, wrist=-6)
    return p


def a_andar_carga(t):
    p = base()
    walk_legs(p, t, amp=19.0, knee_amp=30.0)
    carry_arms(p, t, 2.0 * C(t, 2))
    spine(p, low=(-1, 0, 0), chest=(-3, 0, 0), head=(4, 0, 0))
    return p


def a_cojear(t):
    p = base()
    walk_legs(p, t, amp=18.0, knee_amp=28.0, lean=6.0, limp=0.7)
    ph = 2 * math.pi * t
    arm_pose(p, 'i', flex=-14 * math.sin(ph), abd=12 + 6 * max(0, -math.sin(ph)), el=18)
    arm_pose(p, 'd', flex=16, abd=2, cross=8, el=32 + 6 * math.sin(ph), wrist=-10)
    return p


def a_sentado(t):
    p = base()
    b = S(t, 2)
    seated_legs(p)
    spine(p, low=(-3, 0, 0), chest=(2 - 1.2 * b, 0, 0),
          head=(4 + 3 * S(t, 1, 0.4), 0, 16 * S(t, 1, 0.1)))
    for s in 'id':
        arm_pose(p, s, flex=14 + b, abd=6, cross=4, el=48, wrist=-12, lift=b)
    return p


def a_comer(t):
    p = base()
    seated_legs(p)
    k = smooth(max(0.0, S(t, 1)) * 1.4)
    spine(p, low=(0, 0, 0), chest=(5 - 2 * k, 0, 0), head=(10 - 16 * k, 0, 0))
    arm_pose(p, 'd', flex=34 + 30 * k, abd=6, cross=8 + 22 * k, el=72 + 46 * k, wrist=-10 - 10 * k)
    arm_pose(p, 'i', flex=44, abd=6, cross=14, el=56, wrist=-6)
    return p


def a_suelo(t):
    p = base()
    b = S(t, 2)
    floor_legs(p, t)
    spine(p, hips=(-12, 0, 0), low=(6, 0, 0), chest=(4 - b, 0, 0), head=(2 + 2 * S(t, 1, 0.3), 0, 12 * S(t, 1)))
    arm_pose(p, 'd', flex=46, abd=4, cross=8, el=26, wrist=-6)
    arm_pose(p, 'i', flex=-28, abd=22, el=6, wrist=40)
    return p


def a_dormir(t):
    p = base()
    b = S(t, 2)
    root(p, loc=(0, 0, 0.13), rot=(90, 0, 0))
    leg_pose(p, 'i', flex=10, abd=4, knee=14, ankle=-20)
    leg_pose(p, 'd', flex=2, abd=3, knee=3, ankle=-24)
    spine(p, chest=(-1.5 * b, 0, 0), neck=(-6, 0, 6), head=(-4, 4, 16))
    # brazos a lo largo del cuerpo, bajo la manta
    arm_pose(p, 'd', flex=-3, abd=3, cross=-4, el=6, wrist=-2, lift=0.6 * b)
    arm_pose(p, 'i', flex=-3, abd=3, cross=-4, el=8, wrist=2)
    return p


def a_trabajar(t):
    p = base()
    stand_legs(p, t, 0.0)
    p['raiz_loc'] = (0, 0, -0.02)
    leg_pose(p, 'i', flex=4, abd=4, knee=8, ankle=-4)
    leg_pose(p, 'd', flex=4, abd=4, knee=8, ankle=-4)
    spine(p, hips=(4, 0, 0), low=(6, 0, 0), chest=(4, 0, 0), head=(16 + 2 * S(t), 0, 4 * S(t, 1, 0.2)))
    arm_pose(p, 'd', flex=58 + 14 * S(t), abd=6, cross=10, el=42 + 12 * S(t, 1, 0.1), wrist=-14)
    arm_pose(p, 'i', flex=56 + 11 * S(t, 1, 0.27), abd=6, cross=10, el=46 + 8 * S(t, 1, 0.37), wrist=-14)
    return p


def a_remover(t):
    p = base()
    stand_legs(p, t, 0.0)
    spine(p, hips=(3, 0, 0), low=(5, 0, 0), chest=(3, 0, -4 + 3 * S(t, 2)), head=(22, 0, 3 * S(t, 2, 0.2)))
    # la mano del cucharón dibuja un círculo dentro de la olla (dos vueltas por ciclo)
    arm_pose(p, 'd', flex=52 + 9 * S(t, 2), abd=4, cross=18 + 11 * C(t, 2), el=48 + 9 * C(t, 2), wrist=-16)
    arm_pose(p, 'i', flex=42, abd=10, cross=18, el=54, wrist=-8)
    return p


def a_arrodillado(t):
    p = base()
    # rodilla derecha en el suelo con el empeine apoyado; el pie izquierdo plantado delante
    root(p, loc=(0, 0.02, -0.32))
    leg_pose(p, 'i', flex=84, abd=6, knee=78, ankle=0)
    leg_pose(p, 'd', flex=0, abd=4, knee=92, ankle=-80)
    spine(p, low=(14, 0, 0), chest=(10, 0, 0), head=(14, 0, 5 * S(t)))
    arm_pose(p, 'd', flex=62 + 12 * S(t), abd=6, cross=6, el=22 + 10 * C(t), wrist=-20)
    arm_pose(p, 'i', flex=50 + 9 * S(t, 1, 0.33), abd=12, cross=4, el=34 + 8 * C(t, 1, 0.33), wrist=-16)
    return p


def hammer_curve(t):
    """Subida lenta, golpe rápido, pequeño rebote y pausa (0 abajo, 1 arriba)."""
    if t < 0.5:
        return smooth(t / 0.5)
    if t < 0.6:
        x = (t - 0.5) / 0.1
        return 1 - x * x
    if t < 0.75:
        return 0.08 * math.sin(math.pi * (t - 0.6) / 0.15)
    return 0.0


def a_martillear(t):
    p = base()
    k = hammer_curve(t)
    hit = 1.0 if 0.58 < t < 0.7 else 0.0
    root(p, loc=(0, 0, -0.04))
    leg_pose(p, 'i', flex=12, abd=5, knee=14, ankle=-2)
    leg_pose(p, 'd', flex=-2, abd=5, knee=10, ankle=-8)
    spine(p, hips=(4, 0, 0), low=(6 - 2 * k, 0, 0), chest=(5 - 3 * k + 2 * hit, 0, 3 - 4 * k), head=(18 - 4 * k, 0, 0))
    arm_pose(p, 'd', flex=38 + 84 * k, abd=8 + 6 * k, cross=6, el=22 + 58 * k, wrist=-24 + 46 * k)
    arm_pose(p, 'i', flex=54, abd=8, cross=12, el=30, wrist=-8)
    return p


def a_lanzar(t):
    p = base()
    # 0-0,4 coge impulso atrás; 0,4-0,58 lanza; 0,58-0,75 se queda; 0,75-1 vuelve
    if t < 0.4:
        sw = mix(20, -35, smooth(t / 0.4))
    elif t < 0.58:
        sw = mix(-35, 100, smooth((t - 0.4) / 0.18))
    elif t < 0.75:
        sw = 100
    else:
        sw = mix(100, 20, smooth((t - 0.75) / 0.25))
    fwd = (sw - 20) / 80
    root(p, loc=(0, 0.02 * fwd, -0.03))
    leg_pose(p, 'i', flex=22, abd=4, knee=18, ankle=-4)
    leg_pose(p, 'd', flex=-10, abd=4, knee=10, ankle=-14)
    spine(p, hips=(2 + 4 * fwd, 0, 0), low=(4 + 6 * fwd, 0, 0), chest=(2 + 8 * fwd, 0, 0), head=(-2 - 6 * fwd, 0, 0))
    for s in 'id':
        arm_pose(p, s, flex=sw, abd=10, cross=8, el=22 + 6 * max(0, -fwd), wrist=-10)
    return p


def a_lanzar_gancho(t):
    p = base()
    if t < 0.45:
        k = smooth(t / 0.45)
        flex, el, tw = mix(78, -40, k), mix(18, 96, k), mix(0, -1, k)
    elif t < 0.6:
        k = smooth((t - 0.45) / 0.15)
        flex, el, tw = mix(-40, 92, k), mix(96, 8, k), mix(-1, 1, k)
    else:
        k = smooth((t - 0.6) / 0.4)
        flex, el, tw = mix(92, 78, k), mix(8, 18, k), mix(1, 0, k)
    leg_pose(p, 'i', flex=16, abd=5, knee=12, ankle=-4)
    leg_pose(p, 'd', flex=-8, abd=5, knee=6, ankle=-10)
    spine(p, hips=(0, 0, 4 * tw), low=(2 + 3 * tw, 0, 6 * tw), chest=(2 + 4 * tw, 0, 10 * tw), head=(4, 0, -8 * tw))
    arm_pose(p, 'd', flex=flex, abd=10, cross=4, el=el, wrist=-10)
    arm_pose(p, 'i', flex=36, abd=8, cross=14, el=48, wrist=-6)
    return p


def a_recoger(t):
    p = base()
    stand_legs(p, t, 0.0)
    leg_pose(p, 'i', flex=10, abd=5, knee=8, ankle=-4)
    leg_pose(p, 'd', flex=-6, abd=5, knee=6, ankle=-4)
    spine(p, hips=(-2, 0, 0), low=(-3, 0, 0), chest=(-2, 0, 0), head=(8, 0, 2 * S(t)))
    arm_pose(p, 'd', flex=50 + 6 * S(t), abd=8, cross=10, el=32, wrist=-6)
    # la izquierda da vueltas a la manivela (cuatro por ciclo)
    arm_pose(p, 'i', flex=44 + 8 * S(t, 4), abd=8, cross=24 + 6 * C(t, 4), el=56 + 14 * C(t, 4), wrist=-10)
    return p


def a_usar(t):
    p = base()
    g = S(t, 1)
    root(p, loc=(0, -0.04, -0.12))
    for s in 'id':
        leg_pose(p, s, flex=36, abd=6, knee=48, ankle=12)
    spine(p, hips=(14, 0, 0), low=(16, 0, 0), chest=(12 + 2 * g, 0, 0), head=(-4, 0, 0))
    for s in 'id':
        arm_pose(p, s, flex=64 + 6 * g, abd=6, cross=6, el=10 + 8 * max(0, g), wrist=-14)
    return p


def a_hablar(t):
    p = base()
    b = S(t, 2)
    stand_legs(p, t, 0.6 * S(t))
    spine(p, low=(0, 0, 4 * S(t, 1, 0.2)), chest=(-1 * b, 0, 3 * S(t, 2, 0.1)),
          head=(-2 + 4 * S(t, 3), 2 * S(t, 1, 0.5), 9 * S(t, 1, 0.3)))
    g = max(0.0, S(t, 2, 0.1))
    arm_pose(p, 'd', flex=24 + 18 * S(t, 2), abd=12 + 8 * S(t, 3, 0.2), cross=-4, el=62 + 18 * S(t, 3), wrist=-10 + 12 * S(t, 4))
    h = max(0.0, S(t, 1, 0.55))
    arm_pose(p, 'i', flex=8 + 30 * h, abd=8 + 8 * h, el=24 + 44 * h, wrist=-6 * h)
    return p


def a_cubierto(t):
    p = base()
    sh = S(t, 5)
    root(p, loc=(0, -0.03, -0.14))
    for s in 'id':
        leg_pose(p, s, flex=30, abd=8, knee=48, ankle=14)
    spine(p, hips=(10, 0, 0), low=(12, 1.2 * sh, 0), chest=(10, 0.8 * sh, 0), head=(18, 0, 1.5 * sh))
    for s in 'id':
        arm_pose(p, s, flex=118, abd=14, cross=28, el=104, wrist=-14, lift=4)
    return p


def a_herido(t):
    p = base()
    b = S(t, 2)
    root(p, loc=(0.012, 0, -0.03))
    leg_pose(p, 'i', flex=2, abd=3, knee=6, ankle=-4)
    leg_pose(p, 'd', flex=10, abd=1, knee=20, ankle=-12)
    spine(p, hips=(4, 3, 0), low=(8, 3, 0), chest=(8 + 2 * b, 3, -4), head=(16 + 2 * b, -2, 6 * S(t, 1, 0.3)))
    arm_pose(p, 'i', flex=26, abd=-4, cross=40, el=96, wrist=-10)
    arm_pose(p, 'd', flex=6, abd=10, el=16 + 3 * b)
    return p


def wave_arm(p, t, s='d'):
    arm_pose(p, s, flex=18, abd=142 + 12 * S(t, 2), cross=-6, el=34 + 22 * S(t, 2, 0.25), wrist=0, wside=14 * S(t, 2, 0.1), lift=8)


def a_saludar(t):
    p = base()
    stand_legs(p, t, 0.0)
    spine(p, chest=(-2, -3, 0), head=(-4, 4, 4))
    wave_arm(p, t)
    arm_pose(p, 'i', flex=4, abd=8, el=12)
    return p


def a_saludar_suelo(t):
    p = base()
    floor_legs(p, t)
    spine(p, hips=(-12, 0, 0), low=(4, -2, 0), chest=(0, -4, 0), head=(-6, 4, 6))
    wave_arm(p, t)
    arm_pose(p, 'i', flex=40, abd=6, cross=10, el=24, wrist=-6)
    return p


def a_beber(t):
    p = base()
    stand_legs(p, t, 0.3 * S(t))
    k = smooth(max(0.0, S(t)) * 1.5)
    spine(p, chest=(-2 * k, 0, 0), head=(-12 * k, 0, 0))
    arm_pose(p, 'd', flex=24 + 32 * k, abd=6, cross=6 + 18 * k, el=74 + 52 * k, wrist=-6 - 14 * k)
    arm_pose(p, 'i', flex=4, abd=8, el=12)
    return p


def a_saltar(t):
    p = base()
    k = S(t)
    leg_pose(p, 'i', flex=36 + 3 * k, abd=6, knee=58, ankle=-14)
    leg_pose(p, 'd', flex=12 - 3 * k, abd=6, knee=36, ankle=-22)
    spine(p, low=(4, 0, 0), chest=(2, 0, 0), head=(-6, 0, 0))
    for s in 'id':
        arm_pose(p, s, flex=-18 + 4 * k, abd=34 + 4 * k, el=24, wrist=10)
    return p


def cards_hands(p, t, play=0.0):
    arm_pose(p, 'd', flex=50 + 26 * play, abd=6, cross=16 - 6 * play, el=80 - 44 * play, wrist=-8 - 8 * play)
    arm_pose(p, 'i', flex=42, abd=6, cross=18, el=74, wrist=-6)


def a_cartas(t):
    p = base()
    b = S(t, 2)
    seated_legs(p)
    play = smooth(max(0.0, S(t, 1, 0.1)) ** 6 * 1.6)
    spine(p, low=(3, 0, 0), chest=(4 - b + 4 * play, 0, 0),
          head=(14 + 8 * play, 0, 14 * S(t, 1, 0.35)))
    cards_hands(p, t, play)
    return p


def a_cartas_pie(t):
    p = base()
    b = S(t, 2)
    stand_legs(p, t, 0.5 * S(t, 1, 0.2))
    play = smooth(max(0.0, S(t, 1, 0.1)) ** 6 * 1.6)
    spine(p, low=(3, 0, 0), chest=(3 - b + 4 * play, 0, 0), head=(12 + 8 * play, 0, 12 * S(t, 1, 0.35)))
    cards_hands(p, t, play)
    return p


def a_leer(t):
    p = base()
    b = S(t, 2)
    seated_legs(p)
    turn = smooth(max(0.0, S(t, 1, 0.15)) ** 8 * 2.0)
    spine(p, low=(-3, 0, 0), chest=(3 - b, 0, 0), head=(24 + 2 * S(t, 1, 0.4), 0, 3 * S(t)))
    arm_pose(p, 'd', flex=44 + 6 * turn, abd=6, cross=20 + 12 * turn, el=86 - 10 * turn, wrist=-14 + 10 * turn)
    arm_pose(p, 'i', flex=44, abd=6, cross=22, el=86, wrist=-14)
    return p


# nombre del clip, duración (s), función de pose
CLIPS = [
    ('idle', 4.0, a_idle),
    ('idle_carga', 2.0, a_idle_carga),
    ('idle_cojo', 4.0, a_idle_cojo),
    ('andar', 1.0, a_andar),
    ('correr', 0.8, a_correr),
    ('andar_carga', 1.0, a_andar_carga),
    ('cojear', 1.4, a_cojear),
    ('sentado', 3.0, a_sentado),
    ('comer', 2.4, a_comer),
    ('suelo', 3.0, a_suelo),
    ('dormir', 4.0, a_dormir),
    ('trabajar', 1.2, a_trabajar),
    ('remover', 2.0, a_remover),
    ('arrodillado', 1.6, a_arrodillado),
    ('martillear', 1.0, a_martillear),
    ('lanzar', 1.4, a_lanzar),
    ('lanzar_gancho', 1.2, a_lanzar_gancho),
    ('recoger', 2.8, a_recoger),
    ('usar', 2.0, a_usar),
    ('hablar', 4.0, a_hablar),
    ('cubierto', 2.0, a_cubierto),
    ('herido', 3.0, a_herido),
    ('saludar', 1.6, a_saludar),
    ('saludar_suelo', 1.6, a_saludar_suelo),
    ('beber', 3.0, a_beber),
    ('saltar', 0.8, a_saltar),
    ('cartas', 4.0, a_cartas),
    ('cartas_pie', 3.0, a_cartas_pie),
    ('leer', 4.0, a_leer),
]


def apply_pose(arm, pose, rest):
    """Lleva una pose (giros en ejes del armazón en reposo) a los huesos."""
    for pb in arm.pose.bones:
        R = rest[pb.name]
        e = pose.get(pb.name, (0.0, 0.0, 0.0))
        Q = Euler([math.radians(a) for a in e], 'XYZ').to_matrix()
        pb.rotation_mode = 'QUATERNION'
        pb.rotation_quaternion = (R.inverted() @ Q @ R).to_quaternion()
        if pb.name == 'raiz':
            pb.location = R.inverted() @ Vector(pose.get('raiz_loc', (0, 0, 0)))
        else:
            pb.location = (0, 0, 0)


def moving_bones(poses):
    """Huesos que la acción gira (o deja fuera del reposo) y si mueve la raíz: solo esos llevan
    claves, y el resto no se exporta (en el juego quedan en reposo)."""
    names = set()
    for p in poses:
        for k, v in p.items():
            if k != 'raiz_loc' and any(abs(x) > 1e-4 for x in v):
                names.add(k)
    loc = any(any(abs(x) > 1e-5 for x in p.get('raiz_loc', (0, 0, 0))) for p in poses)
    return names, loc


# Clips de pie: en cada fotograma se sube o se baja el cuerpo para que el pie más bajo (tobillo o
# punta) quede en el suelo, como en reposo (0,08 m). Así no se hunden los pies al doblar las
# rodillas ni flotan al abrir las piernas, y el paso tiene su vaivén real.
PLANTED = {'idle', 'idle_carga', 'idle_cojo', 'andar', 'andar_carga', 'cojear', 'trabajar', 'remover', 'martillear', 'lanzar',
           'lanzar_gancho', 'recoger', 'usar', 'hablar', 'cubierto', 'herido', 'saludar', 'beber', 'cartas_pie'}
FOOT_Z = 0.08


def lowest_foot(arm):
    bpy.context.view_layer.update()
    return min(min(arm.pose.bones[f'pie_{s}'].head.z, arm.pose.bones[f'pie_{s}'].tail.z) for s in 'id')


def plant(arm, pose, rest):
    """Ajusta la altura de la raíz para que el pie más bajo apoye en el suelo."""
    apply_pose(arm, pose, rest)
    x, y, z = pose.get('raiz_loc', (0, 0, 0))
    pose['raiz_loc'] = (x, y, z + FOOT_Z - lowest_foot(arm))
    return pose


def bake_actions(arm):
    rest = {b.name: b.matrix_local.to_3x3() for b in arm.data.bones}
    arm.animation_data_create()
    for name, dur, fn in CLIPS:
        act = bpy.data.actions.new(name)
        arm.animation_data.action = act
        n = max(2, round(dur * FPS))
        poses = [fn((i % n) / n) for i in range(n + 1)]
        if name in PLANTED:
            arm.animation_data.action = None
            poses = [plant(arm, pp, rest) for pp in poses]
            arm.animation_data.action = act
        bones, loc = moving_bones(poses)
        for i, pose in enumerate(poses):
            apply_pose(arm, pose, rest)
            for pb in arm.pose.bones:
                if pb.name in bones:
                    pb.keyframe_insert('rotation_quaternion', frame=i)
                if pb.name == 'raiz' and loc:
                    pb.keyframe_insert('location', frame=i)
        track = arm.animation_data.nla_tracks.new()
        track.name = name
        track.strips.new(name, 0, act)
        track.mute = True
        arm.animation_data.action = None
    # en reposo (y evaluado: la caja del manifiesto sale de la malla evaluada)
    apply_pose(arm, {}, rest)
    bpy.context.view_layer.update()


def export_without_still_channels():
    """
    El exportador común (cf.export_glb) deja en cada clip la traslación, el giro y la escala de
    TODOS los huesos aunque no cambien (dos claves): 27 huesos × 3 × 29 clips son más de 2300
    canales y unos 300 KB de JSON. Para este archivo se exporta igual que cf.export_glb pero sin
    esos canales quietos (`export_optimize_animation_keep_anim_armature=False`): los huesos sin
    claves en un clip quedan en reposo, que es lo que hace el AnimationMixer del juego. Se instala
    para una sola llamada (la de este archivo) y deja cf.export_glb como estaba.
    """
    orig = cf.export_glb

    def export_glb(path, animations=False):
        cf.export_glb = orig
        if not animations:
            return orig(path, animations)
        bpy.ops.export_scene.gltf(
            filepath=path,
            export_format='GLB',
            use_selection=False,
            export_apply=True,
            export_yup=True,
            export_normals=True,
            export_texcoords=False,
            export_materials='EXPORT',
            export_vertex_color='ACTIVE',
            export_all_vertex_colors=False,
            export_animations=True,
            export_skins=True,
            export_morph=False,
            export_image_format='NONE',
            export_optimize_animation_keep_anim_armature=False,
        )

    cf.export_glb = export_glb


# ---------------------------------------------------------------- montaje

def materials():
    """Un material por nombre estable. Cada uno con su color de muestra: el optimizador (dedup)
    fusionaría materiales idénticos y se perderían los nombres."""
    for s in SLOTS:
        m = bpy.data.materials.get(s) or bpy.data.materials.new(s)
        c = cf.rgba(PREVIEW[s])
        m.diffuse_color = c
        if m.node_tree is not None:
            for n in m.node_tree.nodes:
                if n.type == 'BSDF_PRINCIPLED':
                    n.inputs['Base Color'].default_value = c
                    n.inputs['Roughness'].default_value = 1.0


def build():
    bpy.context.scene.render.fps = FPS
    materials()
    parts = []
    parts += torso()
    parts += pelvis()
    for s, sx in SIDES:
        parts.append(leg(s, sx))
        parts.append(shoe(s, sx))
        parts += arm(s, sx)
    parts.append(neck())
    parts += head()
    parts += hairstyles()
    parts += hats()
    parts += coat()
    body = cf.join(parts, 'persona')
    cf.flat(body)
    skel = make_armature()
    skel.parent = body
    mod = body.modifiers.new('esqueleto', 'ARMATURE')
    mod.object = skel
    bake_actions(skel)
    export_without_still_channels()
    return body
