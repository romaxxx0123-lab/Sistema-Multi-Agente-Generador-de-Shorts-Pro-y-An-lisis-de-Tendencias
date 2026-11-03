"""
APAREJO EXTERIOR DEL BARCO (carácter desde fuera: barco de expedición con añadidos industriales y
caseros). Lo coloca src/render/ship/outfit.ts a partir del layout, solo donde no se camina ni se
construye: costados del casco, castillo de proa (por fuera de la barandilla), techos sin acceso y
la regala de popa.

Modelos (convenciones de cf.py: Blender (x, y, z) → juego (x, z, −y); frente = +Y en Blender, que
en el juego es −z local; origen en la base):
- `escalerilla`: escala de gato de cabo y peldaños de madera. Cuelga de la regala por fuera: la
  base (z = 0) queda junto a la flotación y los ganchos de arriba (z = ESC_H) abrazan la tapa de
  regala; la cara del casco es el plano y = 0 y la escala queda delante (+Y, hacia fuera).
- `imbornal_0..2`: imbornal (boca de desagüe de cubierta) con su chorreón de óxido. Calcomanía
  plana en el plano y = 0 mirando a +Y; la boca arriba y la punta del chorreón en z = 0.
- `costura_0..1`: costura de planchas con óxido que rezuma hacia abajo (calcomanía plana).
- `parche_0..1`: parche soldado (chapa con cordón de soldadura y tornillos; el segundo, pintado de
  minio), con un hilo de óxido debajo. Se apoya en el casco (y = 0) y sobresale hacia +Y.
- `farol` + `farol_luz`: farol colgado de una escuadra de pared. Eje del farol en x = y = 0, base
  del farol en z = 0; la pared queda en y = −FAROL_PARED (detrás). `farol_luz` es el cristal (el
  juego lo dibuja con el material de farol, que brilla de noche).
- `farol_poste` + `farol_poste_luz`: el mismo farol colgado de un poste con brazo (para la regala
  de popa). Base del poste en el origen; el brazo sale hacia +Y.
- `manguerote`: ventilador de cuello de cisne con la boca hacia +Y (crema por fuera, rojo dentro).
- `antena`: antena de látigo (fibra blanca) con su soporte.
- `bocina`: bocina doble (tifón) de latón sobre pedestal, las bocas hacia +Y.
- `bidon` y `bidon_rojo`: bidones metálicos de 200 l con aros de rodadura y tapones.

Las calcomanías llevan el color del casco ya mezclado con el óxido (no hay transparencia): el
juego las pega a 8 mm del casco, siempre dentro de la franja azul (entre la línea blanca y el
filete crema de la regala).
"""
import math

import bmesh
import bpy

import cf

# Medidas que comparte src/render/ship/outfit.ts (si cambian aquí, cámbialas allí).
ESC_H = 2.7          # altura de la escalerilla: de la flotación (y = 1.0) a la tapa de regala (3.7)
FAROL_PARED = 0.36   # distancia de la pared al eje del farol
POSTE_H = 1.55       # altura del poste del farol de popa sobre la regala
POSTE_BRAZO = 0.42   # vuelo del brazo del poste

HULL = 'hull'
RUST = 'rust'
BRASS = '#c9a35a'
IRON = 'metalDark'
WHITE = '#f3ead6'
CREAM = 'wallOuter'
RED = 'hullStripe'
MINIO = '#b4532e'
GRIME = '#1c2830'


def mixc(a, b, t):
    """Mezcla lineal de dos colores de la paleta (igual que `mix()` del juego, en espacio lineal)."""
    ca = cf.rgba(a)
    cb = cf.rgba(b)
    return tuple(ca[i] + (cb[i] - ca[i]) * t for i in range(3)) + (1.0,)


def paint_fn(ob, fn):
    """Pinta cada cara con el color lineal `fn(poly)` (None = la deja como está)."""
    me = ob.data
    attr = me.color_attributes.get(cf.COLOR_ATTR) or me.color_attributes.new(cf.COLOR_ATTR, 'FLOAT_COLOR', 'CORNER')
    me.color_attributes.active_color = attr
    me.color_attributes.render_color_index = me.color_attributes.find(cf.COLOR_ATTR)
    for poly in me.polygons:
        c = fn(poly)
        if c is not None:
            for li in poly.loop_indices:
                attr.data[li].color = c
    return ob


def paint_rgba(ob, rgba, where=None):
    """Como cf.paint, pero con un color lineal ya calculado."""
    return paint_fn(ob, lambda p: rgba if where is None or where(p) else None)


def mesh_from(name, verts, faces):
    """Malla a partir de vértices y caras (índices)."""
    bm = bmesh.new()
    vs = [bm.verts.new(v) for v in verts]
    for f in faces:
        bm.faces.new([vs[i] for i in f])
    return cf._link(name, bm)


# ---------------------------------------------------------------- calcomanías de óxido

def drip_decal(columns, top, name, seed, k_top=0.5, k_tip=0.14, steps=4):
    """
    Chorreón plano en el plano y = 0 (cara hacia +Y): columnas [(x0, x1, largo)] que bajan desde z = top
    y acaban en punta (gotas de distinto largo). Se pinta por bandas de altura: más óxido arriba (k_top)
    y casi el color del casco en las puntas (k_tip). Devuelve el objeto.
    """
    verts = []
    faces = []
    r = cf.rng(seed)
    for x0, x1, length in columns:
        n = max(1, round(length / (top / steps)))
        dz = length / (n + 0.6)
        base = len(verts)
        # filas de la columna (con un leve estrechamiento hacia abajo)
        for k in range(n + 1):
            z = top - k * dz
            t = k / (n + 1)
            shrink = (x1 - x0) * 0.18 * t
            jit = (r.random() - 0.5) * 0.015
            verts.append((x0 + shrink + jit, 0.0, z))
            verts.append((x1 - shrink + jit, 0.0, z))
        for k in range(n):
            a = base + 2 * k
            faces.append((a, a + 2, a + 3, a + 1))
        tip = len(verts)
        verts.append(((x0 + x1) / 2 + (r.random() - 0.5) * 0.02, 0.0, top - length))
        a = base + 2 * n
        faces.append((a, tip, a + 1))
    ob = mesh_from(name, verts, faces)
    # el plano mira a +Y (hacia fuera del casco)
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    for f in bm.faces:
        f.normal_update()
        if f.normal.y < 0:
            f.normal_flip()
    bm.to_mesh(ob.data)
    bm.free()
    def band(poly):
        t = max(0.0, min(1.0, (top - poly.center.z) / top))
        # escalones de tono (no degradado): estilo de calcomanía pintada
        t = round(t * steps) / steps
        return mixc(HULL, RUST, k_top + (k_tip - k_top) * t)

    return paint_fn(ob, band)


def scupper(width=0.26):
    """Boca del imbornal: marco de chapa que asoma del casco con la abertura oscura (arriba en z = 0)."""
    lip = cf.box((width, 0.06, 0.1), at=(0, 0.03, -0.1), color=IRON, base=False)
    cf.bevel(lip, 0.008)
    hole = cf.box((width - 0.07, 0.02, 0.05), at=(0, 0.06, -0.1), color='#121619', base=False)
    return [lip, hole]


def imbornal(v):
    specs = [
        # (columnas [(x0, x1, largo)], semilla)
        ([(-0.15, -0.06, 0.62), (-0.06, 0.03, 1.0), (0.03, 0.1, 0.78), (0.1, 0.16, 0.42)], 11),
        ([(-0.2, -0.11, 0.9), (-0.11, -0.02, 1.38), (-0.02, 0.07, 1.12), (0.07, 0.14, 1.3), (0.14, 0.21, 0.66)], 12),
        ([(-0.13, -0.03, 0.58), (-0.03, 0.06, 0.72), (0.06, 0.14, 0.4)], 13),
    ][v]
    cols, seed = specs
    top = max(c[2] for c in cols) + 0.02
    streak = drip_decal(cols, top - 0.13, f'chorreon_{v}', seed, k_top=0.55, k_tip=0.16)
    parts = [streak]
    for p in scupper():
        p.location.z += top
        parts.append(p)
    return cf.model(parts, f'imbornal_{v}')


def costura(v):
    """Costura horizontal de planchas: línea de óxido con goterones cortos hacia abajo."""
    width = [1.7, 2.3][v]
    r = cf.rng(30 + v)
    cols = []
    x = -width / 2
    while x < width / 2 - 0.05:
        w = 0.08 + r.random() * 0.1
        length = 0.1 + r.random() * (0.38 if r.random() < 0.35 else 0.14)
        cols.append((x, min(width / 2, x + w), length))
        x += w
    top = max(c[2] for c in cols) + 0.03
    ob = drip_decal(cols, top, f'costura_{v}', 40 + v, k_top=0.42, k_tip=0.12, steps=3)
    # el cordón de la costura (algo más oscuro, una tira fina encima de los goterones)
    seam = mesh_from('cordon', [(-width / 2 - 0.04, 0.0, top), (width / 2 + 0.04, 0.0, top), (width / 2 + 0.04, 0.0, top + 0.035), (-width / 2 - 0.04, 0.0, top + 0.035)], [(0, 1, 2, 3)])
    bm = bmesh.new()
    bm.from_mesh(seam.data)
    for f in bm.faces:
        f.normal_update()
        if f.normal.y < 0:
            f.normal_flip()
    bm.to_mesh(seam.data)
    bm.free()
    paint_rgba(seam, mixc(HULL, GRIME, 0.45))
    return cf.model([ob, seam], f'costura_{v}')


def parche(v):
    """Parche soldado sobre el casco: chapa biselada, cordón de soldadura, tornillos y un hilo de óxido."""
    w, h = [(0.95, 0.62), (0.58, 0.78)][v]
    plate_c = mixc(HULL, 'metal', 0.38) if v == 0 else cf.rgba(MINIO)
    drip_h = 0.32 if v == 0 else 0.22
    z0 = drip_h
    plate = cf.box((w, 0.026, h), at=(0, 0.013, z0 + h / 2), base=False)
    paint_rgba(plate, plate_c)
    cf.jitter_colors(plate, 0.05, seed=50 + v)
    cf.bevel(plate, 0.009)
    weld_c = mixc(IRON, RUST, 0.35)
    beads = []
    t = 0.022
    for zz in (z0 - t / 2, z0 + h + t / 2):
        beads.append(cf.box((w + 2 * t, 0.018, t), at=(0, 0.009, zz), base=False))
    for xx in (-w / 2 - t / 2, w / 2 + t / 2):
        beads.append(cf.box((t, 0.018, h), at=(xx, 0.009, z0 + h / 2), base=False))
    for b in beads:
        paint_rgba(b, weld_c)
    bolts = []
    for i in range(3):
        for zz in (z0 + 0.07, z0 + h - 0.07):
            xx = -w / 2 + 0.08 + i * (w - 0.16) / 2
            bolts.append(cf.cylinder(0.022, 0.014, seg=6, at=(xx, 0.026, zz), rot=(-90, 0, 0), color=IRON))
    cols = [(-w * 0.32, -w * 0.22, drip_h * 0.8), (-w * 0.22, -w * 0.14, drip_h * 0.45), (w * 0.12, w * 0.22, drip_h)]
    drip = drip_decal(cols, z0, 'goteo', 60 + v, k_top=0.5, k_tip=0.15, steps=2)
    return cf.model([plate, *beads, *bolts, drip], f'parche_{v}')


# ---------------------------------------------------------------- escalerilla de gato

def escalerilla():
    H = ESC_H
    half = 0.25
    parts = []
    # cabos laterales: bajan casi a plomo, un poco separados del casco por los peldaños
    for s in (-1, 1):
        pts = []
        for i in range(9):
            t = i / 8
            z = 0.04 + t * (H - 0.18)
            pts.append((s * half + s * 0.008 * math.sin(t * math.pi), 0.075 - 0.02 * t, z))
        rope = cf.tube(pts, 0.019, seg=4, color='rope', cap=False)
        parts.append(rope)
        # gancho de hierro que abraza la tapa de regala (sale de fuera, pasa por encima y baja por dentro)
        hook = cf.tube([(s * half, 0.055, H - 0.2), (s * half, 0.05, H + 0.03), (s * half, -0.04, H + 0.07), (s * half, -0.18, H + 0.04), (s * half, -0.2, H - 0.1)], 0.018, seg=4, color=IRON)
        parts.append(hook)
    # peldaños de madera; el quinto, más largo (separador: evita que la escala gire)
    n = 8
    for i in range(n):
        z = 0.12 + i * (H - 0.45) / (n - 1)
        long = i == 3
        wdt = 0.92 if long else 2 * half + 0.1
        rung = cf.box((wdt, 0.1, 0.04), at=(0, 0.085, z), color='deckWood')
        cf.jitter_colors(rung, 0.1, seed=70 + i)
        cf.bevel(rung, 0.01)
        parts.append(rung)
        for s in (-1, 1):
            knot = cf.box((0.06, 0.12, 0.07), at=(s * half, 0.085, z - 0.015), color='rope')
            cf.bevel(knot, 0.012)
            parts.append(knot)
    return cf.model(parts, 'escalerilla')


# ---------------------------------------------------------------- faroles

def lantern_parts(z0=0.0):
    """Cuerpo de farol de barco (latón y jaula de hierro) con la base en z0. Devuelve (sólidos, cristal)."""
    parts = []
    base = cf.lathe([(0.0, 0.0), (0.1, 0.0), (0.12, 0.03), (0.105, 0.055), (0.0, 0.055)], seg=8, at=(0, 0, z0), color=BRASS)
    parts.append(base)
    # jaula: cuatro barras y dos aros
    for k in range(4):
        a = math.pi / 4 + k * math.pi / 2
        parts.append(cf.box((0.018, 0.018, 0.27), at=(math.cos(a) * 0.1, math.sin(a) * 0.1, z0 + 0.05), rot=(0, 0, math.degrees(a)), color=IRON))
    for zz in (0.13, 0.22):
        parts.append(cf.torus(0.1, 0.009, seg=8, tube_seg=3, at=(0, 0, z0 + zz), color=IRON))
    # sombrerete con chimenea y aro para colgar
    cap = cf.lathe([(0.0, 0.31), (0.125, 0.31), (0.13, 0.33), (0.07, 0.4), (0.045, 0.4), (0.045, 0.45), (0.06, 0.46), (0.0, 0.47)], seg=8, at=(0, 0, z0), color=BRASS)
    parts.append(cap)
    ring = cf.torus(0.035, 0.008, seg=8, tube_seg=3, at=(0, 0, z0 + 0.5), rot=(90, 0, 0), color=IRON)
    parts.append(ring)
    glass = cf.cylinder(0.085, 0.27, seg=8, at=(0, 0, z0 + 0.045), color='#ffffff')
    return parts, glass


def farol():
    parts, glass = lantern_parts()
    W = FAROL_PARED
    hook_z = 0.56
    arm_z = 0.74
    # placa de pared, brazo, tornapuntas y gancho
    plate = cf.box((0.12, 0.03, 0.3), at=(0, -W + 0.015, arm_z - 0.22), color=IRON)
    cf.bevel(plate, 0.006)
    arm = cf.tube([(0, -W + 0.02, arm_z), (0, -W * 0.4, arm_z + 0.015), (0, 0.0, arm_z), (0, 0.035, arm_z - 0.04)], 0.016, seg=4, color=IRON)
    brace = cf.tube([(0, -W + 0.02, arm_z - 0.2), (0, -W * 0.55, arm_z - 0.06), (0, -W * 0.25, arm_z - 0.005)], 0.012, seg=4, color=IRON)
    curl = cf.torus(0.04, 0.009, seg=8, tube_seg=3, at=(0, -W * 0.55, arm_z - 0.07), rot=(0, 90, 0), color=IRON)
    hook = cf.tube([(0, 0.0, arm_z), (0, 0.0, hook_z + 0.02)], 0.009, seg=4, color=IRON)
    parts += [plate, arm, brace, curl, hook]
    cf.model(parts, 'farol')
    cf.model([glass], 'farol_luz')


def farol_poste():
    H = POSTE_H
    A = POSTE_BRAZO
    parts, glass = lantern_parts(H - 0.82)
    for p in parts:
        p.location.y += A
    glass.location.y += A
    foot = cf.box((0.16, 0.16, 0.05), color=IRON)
    cf.bevel(foot, 0.008)
    post = cf.cylinder(0.035, H, seg=6, at=(0, 0, 0.0), color=IRON)
    arm = cf.tube([(0, 0, H - 0.06), (0, A * 0.45, H + 0.02), (0, A, H - 0.04), (0, A, H - 0.24)], 0.016, seg=4, color=IRON)
    brace = cf.tube([(0, 0, H - 0.4), (0, A * 0.55, H - 0.04)], 0.012, seg=4, color=IRON)
    knob = cf.sphere(0.04, at=(0, 0, H + 0.02), color=BRASS)
    parts += [foot, post, arm, brace, knob]
    cf.model(parts, 'farol_poste')
    cf.model([glass], 'farol_poste_luz')


# ---------------------------------------------------------------- techos: ventilación, antenas, bocina, bidones

def manguerote():
    r = 0.1
    flange = cf.cylinder(0.2, 0.05, seg=10, color=IRON)
    cf.bevel(flange, 0.01)
    collar = cf.cylinder(0.13, 0.08, seg=10, at=(0, 0, 0.05), color=CREAM)
    pipe = cf.cylinder(r, 0.5, seg=10, at=(0, 0, 0.1), color=CREAM)
    # codo de cuello de cisne: arco de 90° hacia +Y
    R = 0.17
    z0 = 0.6
    pts = [(0, R - R * math.cos(a), z0 + R * math.sin(a)) for a in [i * (math.pi / 2) / 6 for i in range(7)]]
    pts.insert(0, (0, 0, z0 - 0.02))
    bend = cf.tube(pts, r, seg=10, color=CREAM, cap=False)
    # boca acampanada (perfil exterior y luego el interior), abierta hacia +Y
    bell = cf.lathe([(0.1, 0.0), (0.13, 0.06), (0.19, 0.14), (0.25, 0.2), (0.24, 0.215), (0.175, 0.15), (0.115, 0.07), (0.085, 0.0)], seg=12, color=CREAM)
    # cara interior en rojo (las que miran hacia el eje)
    cf.paint(bell, RED, lambda p: (p.center.x * p.normal.x + p.center.y * p.normal.y) < 0)
    bell.rotation_euler.x = -math.pi / 2
    bell.location = (0, R, z0 + R)
    rim = cf.torus(0.245, 0.016, seg=12, tube_seg=3, at=(0, R + 0.205, z0 + R), rot=(90, 0, 0), color=CREAM)
    throat = cf.cylinder(0.088, 0.02, seg=10, at=(0, R + 0.005, z0 + R), rot=(-90, 0, 0), color='#3a1d14')
    parts = [flange, collar, pipe, bend, bell, rim, throat]
    for p in parts[1:4]:
        cf.jitter_colors(p, 0.03, seed=80)
    return cf.model(parts, 'manguerote')


def antena():
    foot = cf.box((0.14, 0.14, 0.04), color=IRON)
    cf.bevel(foot, 0.008)
    mount = cf.cylinder(0.04, 0.16, seg=6, at=(0, 0, 0.04), color=IRON)
    spring = cf.cylinder(0.032, 0.12, seg=6, at=(0, 0, 0.2), color='#2b2d42')
    coil = cf.cylinder(0.036, 0.16, seg=6, at=(0, 0, 0.36), color=WHITE)
    whip = cf.cylinder(0.022, 2.1, seg=5, r2=0.009, at=(0, 0, 0.52), color=WHITE)
    tip = cf.sphere(0.018, at=(0, 0, 2.63), color=WHITE)
    return cf.model([foot, mount, spring, coil, whip, tip], 'antena')


def horn(length, bell, at):
    """Trompeta de bocina a lo largo de +Y desde `at`."""
    t = cf.lathe([(0.0, 0.0), (0.03, 0.0), (0.032, length * 0.5), (0.045, length * 0.78), (bell * 0.7, length * 0.93), (bell, length), (bell - 0.012, length), (0.0, length - 0.03)], seg=10, color=BRASS)
    t.rotation_euler.x = -math.pi / 2
    t.location = at
    return t


def bocina():
    ped = cf.box((0.16, 0.16, 0.34), color=IRON)
    cf.bevel(ped, 0.012)
    plate = cf.box((0.3, 0.22, 0.03), at=(0, 0, 0.34), color=IRON)
    body = cf.cylinder(0.065, 0.2, seg=8, at=(0, -0.12, 0.43), rot=(-90, 0, 0), color=IRON)
    a = horn(0.62, 0.11, (-0.075, -0.02, 0.45))
    b = horn(0.46, 0.085, (0.08, -0.02, 0.43))
    valve = cf.cylinder(0.03, 0.1, seg=6, at=(0, -0.05, 0.37), color=BRASS)
    return cf.model([ped, plate, body, a, b, valve], 'bocina')


def bidon(name, color, seed):
    prof = [(0.0, 0.0), (0.27, 0.0), (0.285, 0.02), (0.28, 0.04), (0.28, 0.27), (0.295, 0.29), (0.28, 0.31), (0.28, 0.57), (0.295, 0.59), (0.28, 0.61), (0.28, 0.84), (0.285, 0.86), (0.27, 0.88), (0.25, 0.875), (0.0, 0.875)]
    body = cf.lathe(prof, seg=12, color=color)
    # aros de rodadura algo más oscuros, tapa de chapa y óxido en el canto de abajo
    paint_rgba(body, cf.rgba(color, 0.8), lambda p: abs(p.normal.z) < 0.6 and (abs(p.center.z - 0.29) < 0.025 or abs(p.center.z - 0.59) < 0.025))
    cf.paint(body, 'metal', lambda p: p.normal.z > 0.6)
    paint_rgba(body, mixc(color, RUST, 0.6), lambda p: p.center.z < 0.035 and abs(p.normal.z) < 0.6)
    cf.jitter_colors(body, 0.06, seed=seed)
    bung = cf.cylinder(0.035, 0.025, seg=6, at=(0.15, 0.06, 0.875), color=IRON)
    vent = cf.cylinder(0.022, 0.02, seg=6, at=(-0.16, -0.05, 0.875), color=IRON)
    return cf.model([body, bung, vent], name)


def build():
    for v in range(3):
        imbornal(v)
    for v in range(2):
        costura(v)
        parche(v)
    escalerilla()
    farol()
    farol_poste()
    manguerote()
    antena()
    bocina()
    bidon('bidon', 'wallTrim', 91)
    bidon('bidon_rojo', RED, 92)
