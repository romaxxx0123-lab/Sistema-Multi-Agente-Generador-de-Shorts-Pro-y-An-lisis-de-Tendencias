"""
RESTOS FLOTANTES que se recogen con el gancho (DebrisKind del juego): 8 tipos × 3 variantes,
modelos `resto_<tipo>_<v>` (v = 0, 1, 2; el juego elige la variante con id % 3).

Convención propia de este archivo (además de las de cf.py): mientras se modela, la superficie del
agua es z = 0 y lo que queda por debajo va sumergido; al terminar, el modelo se sube LIFT = 1 m para
que todo quede por encima de z = 0 (base apoyada, como pide el manifiesto). El juego lo vuelve a
bajar con DEBRIS_LIFT (src/render/ship/debrisModels.ts). Blender (x, y, z) → juego (x, z, −y).
Los restos giran sobre sí mismos en el agua: no tienen frente.

Medidas que respetan las del procedimental: radio en planta ≈ DEBRIS_RADIUS del tipo (tablones 1.3,
barril 0.65, caja 0.6, restos 1.1, red 1.3, bidón 0.45, cofre 0.85, balsa 2.0) y la cubierta de la
balsa a +0.2 m sobre el agua (ahí se sientan los náufragos que saludan).
"""
import math

import bmesh
import bpy
from mathutils import Matrix, Vector

import cf

LIFT = 1.0

WOOD = 'deckWood'
WOOD_D = 'deckWoodDark'
WOOD_OLD = '#9c7a52'
BARREL = '#8b5e3c'
BARREL_D = '#6e4a2e'
ROPE = 'rope'
IRON = 'metalDark'
STEEL = 'metal'
RUST = 'rust'
RUST_D = '#7a4426'
ALGA = '#4f7942'
ALGA_D = '#3a5f33'
BUOY = '#e8722c'
WHITE = '#f3ead6'
TARP = '#3d7a8a'
CHEST = '#7f5539'
CHEST_D = '#5e3f28'
GOLD = '#f4d35e'
BRASS = '#e9c46a'
RED = '#c8553d'
BLUE = '#2f6f9f'
CORK = '#c9a46a'


# ---------------------------------------------------------------- utilidades

def deform(ob, fn):
    """Desplaza cada vértice: fn(Vector) → (x, y, z)."""
    for v in ob.data.vertices:
        v.co = Vector(fn(v.co.copy()))
    ob.data.update()
    return ob


def two_sided(ob):
    """Duplica las caras del revés (lonas, velas, chapas finas, algas): el material es de una cara."""
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    dup = bmesh.ops.duplicate(bm, geom=list(bm.faces))
    faces = [g for g in dup['geom'] if isinstance(g, bmesh.types.BMFace)]
    bmesh.ops.reverse_faces(bm, faces=faces)
    bm.to_mesh(ob.data)
    bm.free()
    return ob


def grid(nx, ny, sx, sy, fn=None, color=WOOD, name='rejilla'):
    """Rejilla de nx × ny cuadriláteros en XY (centrada) con las caras hacia +Z; fn(x, y) → (x, y, z)."""
    bm = bmesh.new()
    vs = []
    for i in range(nx + 1):
        row = []
        for j in range(ny + 1):
            x = -sx / 2 + sx * i / nx
            y = -sy / 2 + sy * j / ny
            row.append(bm.verts.new(fn(x, y) if fn else (x, y, 0)))
        vs.append(row)
    for i in range(nx):
        for j in range(ny):
            bm.faces.new((vs[i][j], vs[i + 1][j], vs[i + 1][j + 1], vs[i][j + 1]))
    return cf.paint(cf._link(name, bm), color)


def lattice(nx, ny, sx, sy, bar, fn, color=ROPE, name='red'):
    """Malla de cuerda: rejilla con un agujero en cada celda (marco de ancho `bar`), deformada con fn."""
    bm = bmesh.new()
    vs = [[bm.verts.new((-sx / 2 + sx * i / nx, -sy / 2 + sy * j / ny, 0)) for j in range(ny + 1)] for i in range(nx + 1)]
    faces = [bm.faces.new((vs[i][j], vs[i + 1][j], vs[i + 1][j + 1], vs[i][j + 1])) for i in range(nx) for j in range(ny)]
    bm.normal_update()  # sin normales, el inset no sabe hacia dónde encoger
    bmesh.ops.inset_individual(bm, faces=faces, thickness=bar, depth=0)
    bmesh.ops.delete(bm, geom=faces, context='FACES')
    for v in bm.verts:
        v.co = Vector(fn(v.co.x, v.co.y))
    bm.normal_update()
    for f in bm.faces:
        if f.normal.z < 0:
            f.normal_flip()
    return cf.paint(cf._link(name, bm), color)


def plank(length, width=0.22, thick=0.06, at=(0, 0, 0), rot=(0, 0, 0), color=WOOD, f=1.0, broken=(False, False), seed=0, bev=True):
    """Tablón visto desde arriba (extruido en Z, centrado en su grosor); `broken` astilla un extremo."""
    r = cf.rng(seed)
    hl, hw = length / 2, width / 2
    pts = []
    if broken[1]:
        pts += [(hl - 0.05 - r.random() * 0.12, -hw), (hl, -hw * 0.3), (hl - 0.14 - r.random() * 0.08, hw * 0.35), (hl - 0.04, hw)]
    else:
        pts += [(hl, -hw), (hl, hw)]
    if broken[0]:
        pts += [(-hl + 0.06 + r.random() * 0.1, hw), (-hl, hw * 0.15), (-hl + 0.12, -hw * 0.45), (-hl + 0.03, -hw)]
    else:
        pts += [(-hl, hw), (-hl, -hw)]
    ob = cf.prism(pts, thick, color=color)
    deform(ob, lambda c: (c.x, c.y, c.z - thick / 2))
    cf.paint(ob, color, f=f)
    cf.paint(ob, color, lambda p: abs(p.normal.z) < 0.5, f=f * 0.85)
    if bev:
        cf.bevel(ob, 0.008)
    cf.jitter_colors(ob, 0.08, seed=seed + 11)
    ob.rotation_euler = [math.radians(a) for a in rot]
    ob.location = at
    return cf.bake_transform(ob)


def nail(x, y, z):
    """Cabeza de clavo oscura (asoma 1 cm)."""
    return cf.box((0.035, 0.035, 0.014), at=(x, y, z), color=IRON)


def lashing(x, half_y, half_z, zc=0.0, r=0.022, color=ROPE, seed=0):
    """Vuelta de cuerda alrededor de un fardo (sección superelipse en el plano YZ, en la x dada)."""
    rr = cf.rng(seed)
    pts = []
    n = 8
    for i in range(n + 1):
        a = 2 * math.pi * i / n + math.pi / 8
        c, s = math.cos(a), math.sin(a)
        y = (half_y + r) * math.copysign(abs(c) ** 0.45, c)
        z = zc + (half_z + r) * math.copysign(abs(s) ** 0.45, s)
        pts.append((x + (rr.random() - 0.5) * 0.02, y, z))
    ob = cf.tube(pts, r, seg=4, color=color, cap=False)
    return cf.jitter_colors(ob, 0.06, seed=seed)


def strand(points, r=0.02, color=ALGA, seed=0):
    """Alga o cabo suelto: tubo fino por una polilínea."""
    ob = cf.tube(points, r, seg=4, color=color)
    return cf.jitter_colors(ob, 0.1, seed=seed)


def wavy(p0, p1, n=7, amp=0.05, lift=0.0, seed=0):
    """Polilínea ondulada de p0 a p1 (algas, cabos que se hunden)."""
    r = cf.rng(seed)
    out = []
    for i in range(n + 1):
        t = i / n
        x = p0[0] + (p1[0] - p0[0]) * t
        y = p0[1] + (p1[1] - p0[1]) * t
        z = p0[2] + (p1[2] - p0[2]) * t + math.sin(t * math.pi) * lift
        dx, dy = p1[1] - p0[1], -(p1[0] - p0[0])
        ln = math.hypot(dx, dy) or 1
        w = math.sin(t * 9 + seed) * amp + (r.random() - 0.5) * amp * 0.4
        out.append((x + dx / ln * w, y + dy / ln * w, z))
    return out


def float_ball(r, at, color=BUOY, seg=8):
    """Boya redonda low-poly (torno de 4 anillos)."""
    prof = [(0.0, -r)] + [(r * math.sin(a), -r * math.cos(a)) for a in (0.6, 1.25, 1.9, 2.55)] + [(0.0, r)]
    ob = cf.lathe(prof, seg=seg, at=at, color=color)
    cf.paint(ob, WHITE, lambda p: abs(p.center.z - at[2]) < r * 0.25)
    return ob


def cork(at, rot=(0, 0, 0), color=CORK, length=0.16, r=0.06):
    """Corcho de red (cilindro corto, 6 lados)."""
    ob = cf.cylinder(r, length, seg=6, at=(0, 0, -length / 2), color=color)
    ob.rotation_euler = [math.radians(a) for a in rot]
    ob.location = at
    return cf.bake_transform(ob)


def finish_debris(parts, name):
    """Une las piezas, sube el conjunto LIFT (agua a z = LIFT) y lo deja listo."""
    ob = cf.join(parts, name)
    ob.location = (0, 0, LIFT)
    cf.finish(ob, name)
    lo = min(v.co.z for v in ob.data.vertices)
    assert lo >= -1e-4, f'{name}: baja más de {LIFT} m bajo el agua ({lo - LIFT:.2f})'
    return ob


def tilt(objs, rx=0.0, ry=0.0, rz=0.0, at=(0, 0, 0)):
    """Gira un grupo de piezas ya colocadas (grados) alrededor de `at`."""
    m = Matrix.Translation(Vector(at)) @ Matrix.Rotation(math.radians(rz), 4, 'Z') @ Matrix.Rotation(math.radians(ry), 4, 'Y') @ Matrix.Rotation(math.radians(rx), 4, 'X') @ Matrix.Translation(-Vector(at))
    for o in objs:
        cf.bake_transform(o)
        o.data.transform(m)
    return objs


# ---------------------------------------------------------------- tablones

def tablones_0():
    """Fardo de tablones: cuatro abajo y dos cruzados encima, dos vueltas de cuerda y clavos."""
    parts = []
    lens = [2.2, 1.9, 2.3, 2.05]
    for i, ln in enumerate(lens):
        y = (i - 1.5) * 0.24
        parts.append(plank(ln, 0.22, 0.06, at=((i % 2 - 0.5) * 0.12, y, -0.02), color=WOOD, f=0.85 + 0.07 * (i % 3), broken=(i == 1, i == 3), seed=i + 1))
    parts.append(plank(1.7, 0.2, 0.05, at=(0.15, 0.08, 0.035), rot=(0, 0, 7), color=WOOD_D, broken=(False, True), seed=7))
    parts.append(plank(1.45, 0.2, 0.05, at=(-0.2, -0.18, 0.035), rot=(0, 0, -5), color=WOOD_OLD, broken=(True, False), seed=8))
    for x, s in ((-0.62, 1), (0.58, 2)):
        parts.append(lashing(x, 0.5, 0.075, zc=0.005, seed=s))
    # Cabo suelto y algas que cuelgan
    parts.append(strand(wavy((0.6, 0.52, 0.02), (1.1, 0.95, -0.12), n=6, amp=0.04, seed=3), 0.018, ROPE))
    parts.append(strand(wavy((-0.9, -0.4, 0.02), (-1.15, -0.75, -0.08), n=5, amp=0.03, seed=4), 0.016, ALGA))
    for x in (-0.55, 0.3, 0.75):
        for y in (0.03, 0.13):
            parts.append(nail(x + 0.15, y, 0.058))
    return finish_debris(parts, 'resto_tablones_0')


def tablones_1():
    """Palé roto: cinco tablas clavadas sobre dos travesaños, una partida; cabo con un corcho."""
    parts = []
    for i in range(5):
        y = (i - 2) * 0.25
        ln = 2.1 if i != 3 else 1.25
        x0 = 0.0 if i != 3 else -0.42
        parts.append(plank(ln, 0.2, 0.045, at=(x0, y, 0.045), color=WOOD, f=0.82 + 0.05 * ((i * 7) % 4), broken=(False, i == 3), seed=20 + i))
    for x in (-0.7, 0.65):
        b = cf.box((0.14, 1.3, 0.1), at=(x, 0, -0.08), color=WOOD_D)
        cf.bevel(b, 0.01)
        cf.jitter_colors(b, 0.06, seed=int(x * 10) + 30)
        parts.append(b)
        for i in range(5):
            if i == 3 and x > 0:
                continue
            parts.append(nail(x, (i - 2) * 0.25, 0.073))
    # Tabla suelta medio hundida en diagonal
    parts.append(plank(1.2, 0.18, 0.045, at=(0.55, 0.6, 0.0), rot=(14, -8, 32), color=WOOD_OLD, broken=(True, False), seed=27))
    rope = wavy((-0.85, -0.55, 0.06), (-1.15, -0.95, -0.02), n=5, amp=0.03, seed=5)
    parts.append(strand(rope, 0.018, ROPE))
    parts.append(cork((-1.17, -0.98, 0.0), rot=(0, 90, 40)))
    return finish_debris(parts, 'resto_tablones_1')


def tablones_2():
    """Tres tablones largos con una riostra en diagonal, atados por el centro y con algas."""
    parts = []
    for i, (ln, y) in enumerate(((2.35, -0.27), (2.1, 0.0), (2.25, 0.27))):
        parts.append(plank(ln, 0.24, 0.07, at=(0.05 * (i - 1), y, -0.015), color=WOOD_OLD if i == 1 else WOOD, f=0.9, broken=(i == 2, i == 0), seed=40 + i))
    parts.append(plank(1.5, 0.16, 0.05, at=(0.1, 0.0, 0.045), rot=(0, 0, 24), color=WOOD_D, seed=44))
    for x, y in ((-0.48, -0.18), (0.66, 0.24)):
        parts.append(nail(x, y, 0.074))
    parts.append(lashing(0.05, 0.42, 0.065, zc=0.01, seed=6))
    parts.append(strand(wavy((-0.95, 0.35, 0.04), (-0.2, 0.5, 0.0), n=6, amp=0.04, seed=8), 0.02, ALGA))
    parts.append(strand(wavy((0.4, -0.38, 0.04), (1.05, -0.62, -0.06), n=6, amp=0.05, seed=9), 0.018, ALGA_D))
    return finish_debris(parts, 'resto_tablones_2')


# ---------------------------------------------------------------- barril

BARREL_PROFILE = [(0.0, 0.03), (0.26, 0.0), (0.31, 0.2), (0.335, 0.45), (0.31, 0.7), (0.26, 0.9), (0.24, 0.9), (0.24, 0.87), (0.0, 0.87)]


def barrel_parts(seed, profile=BARREL_PROFILE, hoops=((0.27, 0.12), (0.32, 0.33), (0.32, 0.57), (0.27, 0.78)), seg=12):
    """Barril de pie (eje Z de 0 a 0.9): cuerpo de duelas y aros de hierro."""
    body = cf.lathe(profile, seg=seg, color=BARREL)
    cf.paint(body, BARREL_D, lambda p: p.normal.z > 0.6 or p.normal.z < -0.6)
    cf.jitter_colors(body, 0.09, seed=seed)
    parts = [body]
    for r, z in hoops:
        parts.append(cf.lathe([(r + 0.008, z - 0.025), (r + 0.014, z), (r + 0.008, z + 0.025)], seg=seg, color=IRON))
    return parts


def dent(ob, center, radius, depth):
    """Abolladura: hunde los vértices cercanos a `center` hacia el eje del barril."""
    c = Vector(center)

    def fn(co):
        d = (co - c).length
        if d >= radius:
            return co
        axis = Vector((0, 0, co.z))
        n = (co - axis)
        if n.length < 1e-6:
            return co
        k = depth * (1 - d / radius) ** 1.5
        return co - n.normalized() * k
    return deform(ob, fn)


def lay(parts, rx=0.0, ry=90.0, rz=0.0, z=0.0, cx=0.45):
    """Tumba un barril de pie (eje Z, 0..0.9) a lo largo de X con el centro en (0, 0, z)."""
    for o in parts:
        cf.bake_transform(o)
        o.data.transform(Matrix.Translation((0, 0, -cx)))
        o.data.transform(Matrix.Rotation(math.radians(rz), 4, 'Z') @ Matrix.Rotation(math.radians(ry), 4, 'Y') @ Matrix.Rotation(math.radians(rx), 4, 'X'))
        o.data.transform(Matrix.Translation((0, 0, z)))
    return parts


def barril_0():
    """Barril tumbado y abollado, con un aro salido y el tapón; un mechón de algas encima."""
    parts = barrel_parts(51)
    dent(parts[0], (0.31, 0.06, 0.52), 0.2, 0.06)
    bpy.data.objects.remove(parts[3])
    parts[3] = cf.lathe([(0.33, 0.6), (0.345, 0.64), (0.33, 0.68)], seg=12, color=RUST, rot=(7, 0, 0))
    bung = cf.cylinder(0.035, 0.03, seg=6, at=(0, 0.33, 0.45), rot=(-90, 0, 0), color=BARREL_D)
    parts.append(bung)
    lay(parts, rx=20, z=-0.04)
    parts.append(strand(wavy((-0.25, -0.05, 0.3), (0.2, -0.32, 0.12), n=6, amp=0.03, seed=2), 0.02, ALGA))
    return finish_debris(parts, 'resto_barril_0')


def barril_1():
    """Barril reventado: duelas rotas a distintas alturas, sin tapa y con el interior a la vista."""
    r = cf.rng(61)
    seg = 12
    outer = [(0.0, 0.03), (0.26, 0.0), (0.31, 0.2), (0.335, 0.45), (0.31, 0.7), (0.285, 0.82)]
    inner = [(0.25, 0.82), (0.275, 0.7), (0.295, 0.45), (0.275, 0.2), (0.235, 0.08), (0.0, 0.08)]
    body = cf.lathe(outer + inner, seg=seg, color=BARREL)
    cf.paint(body, BARREL_D, lambda p: (p.center.x ** 2 + p.center.y ** 2) ** 0.5 < 0.3 and p.center.z > 0.05)
    # Bordes astillados: cada duela rota a una altura distinta
    cuts = [r.random() * 0.32 for _ in range(seg)]

    def fn(co):
        if co.z < 0.6:
            return co
        a = math.atan2(co.y, co.x) % (2 * math.pi)
        k = int(round(a / (2 * math.pi / seg))) % seg
        return (co.x, co.y, co.z - cuts[k] * (co.z - 0.6) / 0.22)
    deform(body, fn)
    cf.jitter_colors(body, 0.1, seed=62)
    parts = [body]
    for rr, z in ((0.27, 0.12), (0.32, 0.33), (0.32, 0.55)):
        parts.append(cf.lathe([(rr + 0.008, z - 0.025), (rr + 0.014, z), (rr + 0.008, z + 0.025)], seg=seg, color=IRON))
    # Una duela suelta flotando al lado
    st = plank(0.8, 0.11, 0.03, color=BARREL, seed=63)
    st.location = (0.1, 0.48, 0.0)
    st.rotation_euler = (0, math.radians(-6), math.radians(18))
    parts.append(cf.bake_transform(st))
    lay(parts[:-1], rx=-25, ry=96, z=-0.02)
    return finish_debris(parts, 'resto_barril_1')


def barril_2():
    """Barril de pie, flotando con la tapa al aire, atado con una cuerda que se hunde."""
    parts = barrel_parts(71)
    lid = cf.cylinder(0.05, 0.02, seg=6, at=(0.1, 0.05, 0.87), color=BARREL_D)
    parts.append(lid)
    parts.append(cf.lathe([(0.325, 0.4), (0.342, 0.43), (0.325, 0.46)], seg=12, color=ROPE))
    for o in parts:
        o.data.transform(Matrix.Translation((0, 0, -0.68)))
    tilt(parts, rx=9, ry=-6)
    parts.append(strand(wavy((0.3, 0.1, -0.24), (0.5, 0.3, -0.06), n=4, amp=0.03, lift=0.1, seed=7), 0.017, ROPE))
    parts.append(cork((0.5, 0.3, -0.02), rot=(0, 90, 30), color=BUOY))
    parts.append(strand(wavy((-0.18, -0.1, 0.2), (0.12, -0.2, 0.21), n=4, amp=0.03, seed=3), 0.022, ALGA))
    return finish_debris(parts, 'resto_barril_2')


# ---------------------------------------------------------------- caja

def crate_parts(s=0.76, h=0.7, seed=0, open_top=False, missing=()):
    """Caja de listones de pie (base en z = 0): marco, tablas laterales y tapa."""
    parts = []
    t = 0.055
    hs = s / 2
    # Postes y marcos
    for x in (-hs + t / 2, hs - t / 2):
        for y in (-hs + t / 2, hs - t / 2):
            parts.append(cf.box((t, t, h), at=(x, y, 0), color=WOOD_D))
    for z in (0, h - t):
        for y in (-hs + t / 2, hs - t / 2):
            parts.append(cf.box((s, t, t), at=(0, y, z), color=WOOD_D))
        for x in (-hs + t / 2, hs - t / 2):
            parts.append(cf.box((t, s - 2 * t, t), at=(x, 0, z), color=WOOD_D))
    # Tablas de los costados (tres por cara, algo hundidas respecto al marco)
    n = 3
    sl = (h - 2 * t) / n
    k = 0
    for side in range(4):
        for i in range(n):
            z = t + i * sl + 0.006
            w = sl - 0.012
            if side < 2:
                y = (-1 if side == 0 else 1) * (hs - 0.015)
                b = cf.box((s - 2 * t, 0.02, w), at=(0, y, z), color=WOOD)
            else:
                x = (-1 if side == 2 else 1) * (hs - 0.015)
                b = cf.box((0.02, s - 2 * t, w), at=(x, 0, z), color=WOOD)
            cf.jitter_colors(b, 0.1, seed=seed + k)
            k += 1
            parts.append(b)
    # Tapa: tablas
    if not open_top:
        for i in range(4):
            if i in missing:
                continue
            y = -hs + t + (i + 0.5) * (s - 2 * t) / 4
            b = cf.box((s - 0.02, (s - 2 * t) / 4 - 0.01, 0.03), at=(0, y, h - 0.03), color=WOOD)
            cf.jitter_colors(b, 0.1, seed=seed + 40 + i)
            parts.append(b)
    # Fondo
    parts.append(cf.box((s - 2 * t, s - 2 * t, 0.02), at=(0, 0, 0.01), color=WOOD_D))
    return parts


def caja_0():
    """Caja de listones con una lona azul por encima, atada con cuerda; un pico de lona en el agua."""
    s, h = 0.76, 0.7
    parts = crate_parts(s, h, seed=80)
    hs = s / 2 + 0.012

    def drape(x, y):
        # Arriba plana; por los lados +y y +x cae con pliegues; por −y se queda corta.
        z = h + 0.035 + 0.012 * math.sin(x * 17) * math.cos(y * 13)
        ox, oy = x, y
        if y > hs:
            d = y - hs
            oy = hs + 0.02 + 0.03 * math.sin(x * 14)
            z = h + 0.03 - d * 1.4
            ox = x
        if x > hs:
            d = x - hs
            ox = hs + 0.02 + 0.03 * math.sin(y * 12)
            z = min(z, h + 0.03 - d * 1.4)
        return (ox, oy, max(z, h * 0.3 + 0.08 * math.sin(x * 9)))
    tarp = grid(6, 6, s + 0.5, s + 0.5, lambda x, y: drape(x + 0.12, y + 0.12), color=TARP, name='lona')
    cf.jitter_colors(tarp, 0.1, seed=81)
    parts.append(two_sided(tarp))
    for x in (-0.18, 0.2):
        parts.append(lashing(x, hs + 0.01, h / 2 + 0.03, zc=h / 2, r=0.016, seed=int(x * 100)))
    tilt(parts, rx=7, ry=-5, at=(0, 0, 0))
    for o in parts:
        o.data.transform(Matrix.Translation((0, 0, -0.44)))
    return finish_debris(parts, 'resto_caja_0')


def caja_1():
    """Caja reventada: faltan dos tablas de la tapa, otra levantada, y asoman botellas y paja."""
    s, h = 0.76, 0.7
    parts = crate_parts(s, h, seed=90, missing=(1, 2))
    lifted = cf.box((s - 0.02, 0.15, 0.03), at=(0.05, 0, 0), color=WOOD, rot=(0, 0, 8))
    lifted.rotation_euler = (math.radians(-35), 0, 0)
    lifted.location = (0, 0.02, h + 0.02)
    parts.append(cf.bake_transform(lifted))
    parts.append(nail(0.3, 0.02, h + 0.035))
    # Paja y botellas dentro
    straw = cf.box((s - 0.14, s - 0.14, 0.05), at=(0, 0, h - 0.17), color=BRASS)
    deform(straw, lambda c: (c.x, c.y, c.z + 0.025 * math.sin(c.x * 20 + c.y * 13)))
    parts.append(straw)
    for i, (x, y) in enumerate(((-0.14, -0.05), (0.05, 0.08), (0.18, -0.06))):
        bt = cf.lathe([(0.0, 0.0), (0.05, 0.0), (0.05, 0.16), (0.022, 0.22), (0.02, 0.27), (0.0, 0.27)], seg=6, color='#4c8c4a' if i != 1 else '#7a4b2a', at=(x, y, h - 0.22))
        bt.rotation_euler = (math.radians(12 * (i - 1)), math.radians(10), 0)
        parts.append(cf.bake_transform(bt))
    tilt(parts, rx=-10, ry=6)
    for o in parts:
        o.data.transform(Matrix.Translation((0, 0, -0.42)))
    return finish_debris(parts, 'resto_caja_1')


def caja_2():
    """Caja de carga cerrada, escorada, con una franja pintada, cantoneras y algas."""
    s, h = 0.76, 0.7
    parts = crate_parts(s, h, seed=100)
    hs = s / 2
    # Franja de pintura en dos costados
    parts.append(cf.box((s - 0.12, 0.012, 0.11), at=(0, -hs - 0.004, 0.3), color=RED))
    parts.append(cf.box((0.012, s - 0.12, 0.11), at=(hs + 0.004, 0, 0.3), color=RED))
    # Cantoneras de chapa en las esquinas de arriba
    for x in (-1, 1):
        for y in (-1, 1):
            parts.append(cf.box((0.08, 0.08, 0.08), at=(x * (hs - 0.03), y * (hs - 0.03), h - 0.075), color=IRON))
    parts.append(strand(wavy((-0.3, -0.39, 0.62), (0.25, -0.4, 0.3), n=5, amp=0.03, seed=5), 0.02, ALGA))
    parts.append(strand(wavy((0.39, 0.2, 0.55), (0.4, -0.25, 0.25), n=5, amp=0.03, seed=6), 0.018, ALGA_D))
    tilt(parts, rx=14, ry=-11, rz=20)
    for o in parts:
        o.data.transform(Matrix.Translation((0, 0, -0.45)))
    return finish_debris(parts, 'resto_caja_2')


# ---------------------------------------------------------------- restos metálicos

def corrugated(sx, sy, nx, ny, amp, waves, twist=0.0, bend=0.0, color=RUST, seed=0):
    """Chapa ondulada (ondas a lo largo de X), retorcida `twist` grados de punta a punta y doblada."""
    def fn(x, y):
        z = amp * math.sin(y / sy * 2 * math.pi * waves)
        a = math.radians(twist) * (x / sx)
        yy, zz = y * math.cos(a) - z * math.sin(a), y * math.sin(a) + z * math.cos(a)
        zz += bend * (x / sx) ** 2 * 4
        return (x, yy, zz)
    ob = grid(nx, ny, sx, sy, fn, color=color, name='chapa')
    cf.paint(ob, RUST_D, lambda p: math.sin(p.center.x * 7 + seed) * math.cos(p.center.y * 5) > 0.45)
    cf.paint(ob, STEEL, lambda p: math.sin(p.center.x * 4 - seed) + math.cos(p.center.y * 6 + seed) > 1.4)
    cf.jitter_colors(ob, 0.08, seed=seed)
    return two_sided(ob)


def pipe(points, r=0.07, color=IRON, seed=0):
    ob = cf.tube(points, r, seg=6, color=color)
    cf.paint(ob, RUST, lambda p: math.sin(p.center.x * 9 + seed) > 0.5)
    return cf.jitter_colors(ob, 0.06, seed=seed)


def restos_0():
    """Chapa ondulada retorcida y oxidada, con un tubo doblado con brida y un bidoncillo."""
    parts = [corrugated(1.7, 0.95, 8, 10, 0.035, 4, twist=35, bend=0.12, seed=1)]
    tilt(parts, rx=6, rz=-15)
    parts.append(pipe([(-0.75, 0.55, -0.05), (-0.25, 0.42, 0.07), (0.25, 0.5, 0.06), (0.55, 0.78, -0.02)], 0.06, seed=2))
    parts.append(cf.cylinder(0.11, 0.035, seg=8, at=(0.55, 0.78, -0.02), rot=(0, 90, 50), color=IRON))
    for i in range(4):
        a = i * math.pi / 2 + 0.4
        parts.append(cf.box((0.03, 0.03, 0.03), at=(0.56, 0.78 + 0.08 * math.cos(a), -0.02 + 0.08 * math.sin(a)), color=RUST_D))
    return finish_debris(parts, 'resto_restos_0')


def gear(r, teeth, h, color=STEEL, at=(0, 0, 0), rot=(0, 0, 0)):
    """Engranaje: prisma con dientes y cubo."""
    pts = []
    for i in range(teeth):
        a0 = 2 * math.pi * i / teeth
        da = 2 * math.pi / teeth
        for f, rr in ((0.0, r), (0.18, r + 0.07), (0.5, r + 0.07), (0.68, r)):
            a = a0 + f * da
            pts.append((rr * math.cos(a), rr * math.sin(a)))
    ob = cf.prism(pts, h, color=color, at=at, rot=rot)
    cf.paint(ob, '#7d8597', lambda p: abs(p.normal.z) < 0.5)
    return ob


def restos_1():
    """Engranaje grande sobre una plancha, con un trozo de cadena que se hunde."""
    plate = cf.box((1.25, 0.8, 0.05), at=(-0.1, 0.05, -0.05), color=STEEL, rot=(4, -3, 12))
    cf.paint(plate, RUST, lambda p: p.center.x > 0.15)
    cf.jitter_colors(plate, 0.08, seed=3)
    cf.bevel(plate, 0.01)
    parts = [plate]
    parts.append(gear(0.3, 10, 0.07, at=(-0.25, -0.05, 0.02), rot=(4, -3, 0)))
    parts.append(cf.cylinder(0.09, 0.12, seg=8, at=(-0.25, -0.05, 0.03), color=IRON))
    parts.append(gear(0.14, 7, 0.05, color=RUST, at=(0.32, 0.25, 0.02), rot=(-8, 18, 0)))
    # Cadena: eslabones alternos hacia el agua
    for i in range(6):
        x = 0.25 + i * 0.105
        z = 0.02 - i * 0.05
        rot = (90, 0, 0) if i % 2 == 0 else (0, 0, 0)
        ln = cf.torus(0.05, 0.014, seg=6, tube_seg=3, at=(x, -0.28 - i * 0.03, z), rot=rot, color=IRON)
        deform(ln, lambda c, x=x: (x + (c.x - x) * 1.35, c.y, c.z))
        parts.append(ln)
    parts.append(pipe([(-0.7, 0.35, 0.0), (-0.95, 0.6, -0.12)], 0.045, color=RUST, seed=4))
    return finish_debris(parts, 'resto_restos_1')


def restos_2():
    """Trozo de casco: chapa curvada con remaches, un ojo de buey y un tramo de barandilla doblado."""
    def fn(x, y):
        return (x, y, 0.18 * math.cos(y * 1.6) - 0.16 + 0.03 * math.sin(x * 3))
    plate = grid(6, 5, 1.6, 1.1, fn, color='hull', name='casco')
    cf.paint(plate, 'hullStripe', lambda p: p.center.y < -0.3)
    cf.paint(plate, RUST, lambda p: math.sin(p.center.x * 5 + 1) > 0.6 and p.center.y > -0.3)
    cf.jitter_colors(plate, 0.08, seed=5)
    two_sided(plate)
    parts = [plate]
    # Remaches
    for x in (-0.55, -0.15, 0.25, 0.62):
        parts.append(cf.box((0.03, 0.03, 0.025), at=(x, -0.22, fn(x, -0.22)[2] - 0.005), color=IRON))
    # Ojo de buey
    port = cf.torus(0.13, 0.03, seg=10, tube_seg=4, at=(0.15, 0.1, 0.03), color=BRASS)
    glass = cf.cylinder(0.12, 0.012, seg=10, at=(0.15, 0.1, 0.02), color='window')
    parts += [port, glass]
    # Barandilla doblada
    rail = [(-0.75, 0.42, 0.0), (-0.65, 0.48, 0.32), (-0.2, 0.52, 0.38), (0.2, 0.6, 0.25), (0.45, 0.78, 0.05)]
    parts.append(cf.tube(rail, 0.025, seg=4, color='rail'))
    parts.append(cf.tube([(-0.2, 0.52, 0.38), (-0.2, 0.47, 0.0)], 0.02, seg=4, color='railPost'))
    tilt(parts, rx=-5, rz=25)
    return finish_debris(parts, 'resto_restos_2')


# ---------------------------------------------------------------- red

def net_fn(seed, sx, sy, lumps):
    r = cf.rng(seed)
    ph = [r.random() * 6 for _ in range(4)]

    def fn(x, y):
        # Malla arrugada: se desplaza en planta y se abomba sobre las boyas (lumps: (x, y, alto, radio)).
        nx = x + 0.08 * math.sin(y * 4.1 + ph[0]) + 0.05 * math.sin(x * 6 + ph[1])
        ny = y + 0.08 * math.cos(x * 3.7 + ph[2])
        z = 0.06 + 0.05 * math.sin(x * 5 + ph[3]) * math.cos(y * 4)
        for lx, ly, lh, lr in lumps:
            d = math.hypot(nx - lx, ny - ly)
            if d < lr:
                z += lh * (1 - (d / lr) ** 2) ** 0.7
        edge = max(abs(x) / (sx / 2), abs(y) / (sy / 2))
        z -= max(0, edge - 0.8) * 0.35
        return (nx, ny, z)
    return fn


def red_0():
    """Red de pesca arrugada con su relinga de corchos, dos boyas y algas enredadas."""
    sx = sy = 1.9
    lumps = [(0.5, 0.5, 0.26, 0.6), (-0.45, 0.15, 0.2, 0.55), (0.1, -0.45, 0.12, 0.45)]
    net = lattice(6, 6, sx, sy, 0.055, net_fn(1, sx, sy, lumps), color=ROPE)
    cf.paint(net, '#b39a68', lambda p: p.center.z < 0.08)
    cf.jitter_colors(net, 0.12, seed=11)
    parts = [net]
    fn = net_fn(1, sx, sy, lumps)
    edge = [fn(-sx / 2 + sx * i / 8, sy / 2 - 0.02) for i in range(9)]
    parts.append(cf.tube([(x, y, z + 0.02) for x, y, z in edge], 0.022, seg=4, color=ROPE))
    for i in range(1, 8, 2):
        x, y, z = edge[i]
        parts.append(cork((x, y, z + 0.03), rot=(0, 90, 0)))
    parts.append(float_ball(0.15, (0.55, 0.55, 0.3)))
    parts.append(float_ball(0.12, (-0.5, 0.18, 0.22), color=WHITE))
    parts.append(strand(wavy((-0.7, -0.6, 0.06), (0.3, -0.25, 0.05), n=8, amp=0.06, lift=0.04, seed=1), 0.022, ALGA))
    parts.append(strand(wavy((0.1, 0.3, 0.1), (0.6, -0.5, 0.0), n=6, amp=0.05, lift=0.03, seed=2), 0.02, ALGA_D))
    return finish_debris(parts, 'resto_red_0')


def red_1():
    """Red enmarañada en un montón sobre una boya grande, con un rollo de cabo."""
    sx = sy = 1.7
    lumps = [(0.0, 0.0, 0.42, 0.75), (0.4, -0.3, 0.16, 0.4)]
    net = lattice(6, 6, sx, sy, 0.06, net_fn(2, sx, sy, lumps), color='#7f9a6e')
    cf.paint(net, ROPE, lambda p: p.center.z > 0.25)
    cf.jitter_colors(net, 0.12, seed=12)
    parts = [net]
    parts.append(float_ball(0.24, (0.05, 0.02, 0.3)))
    # Rollo de cabo
    turns = []
    for i in range(41):
        a = i / 40 * 2.6 * 2 * math.pi
        rr = 0.09 + 0.07 * i / 40
        turns.append((-0.55 + rr * math.cos(a), 0.45 + rr * math.sin(a), 0.05 + 0.012 * i / 40))
    parts.append(cf.tube(turns, 0.022, seg=4, color=ROPE))
    for i, (x, y) in enumerate(((0.62, 0.4), (-0.3, -0.62), (0.7, -0.45))):
        parts.append(cork((x, y, 0.02), rot=(0, 90, 40 * i)))
    parts.append(strand(wavy((-0.2, -0.3, 0.22), (0.35, 0.4, 0.2), n=7, amp=0.05, seed=4), 0.022, ALGA))
    return finish_debris(parts, 'resto_red_1')


def red_2():
    """Red tendida con su nasa de cabos: una jaula de listones enredada y boyas en fila."""
    sx, sy = 2.0, 1.6
    lumps = [(-0.4, 0.05, 0.22, 0.6), (0.45, 0.15, 0.3, 0.5)]
    net = lattice(7, 5, sx, sy, 0.05, net_fn(3, sx, sy, lumps), color=ROPE)
    cf.paint(net, '#b39a68', lambda p: p.center.z < 0.08)
    cf.jitter_colors(net, 0.12, seed=13)
    parts = [net]
    # Nasa (jaula de listones)
    cage = []
    for x in (-0.25, 0.25):
        for y in (-0.18, 0.18):
            cage.append(cf.box((0.03, 0.03, 0.3), at=(x, y, 0), color=WOOD_D))
    for z in (0.02, 0.27):
        for y in (-0.18, 0.18):
            cage.append(cf.box((0.53, 0.03, 0.03), at=(0, y, z), color=WOOD_D))
        for x in (-0.25, 0.25):
            cage.append(cf.box((0.03, 0.39, 0.03), at=(x, 0, z), color=WOOD_D))
    for x in (-0.12, 0.0, 0.12):
        cage.append(cf.box((0.02, 0.39, 0.02), at=(x, 0, 0.285), color=WOOD))
    tilt(cage, rx=8, rz=20)
    for o in cage:
        o.data.transform(Matrix.Translation((0.45, 0.15, 0.02)))
    parts += cage
    for i in range(4):
        x = -0.85 + i * 0.55
        parts.append(float_ball(0.1, (x, -0.72, 0.05), color=BUOY if i % 2 == 0 else WHITE, seg=6))
    parts.append(cf.tube([(-0.95, -0.72, 0.04), (0.85, -0.72, 0.04)], 0.018, seg=4, color=ROPE))
    parts.append(strand(wavy((-0.8, 0.5, 0.06), (-0.1, 0.25, 0.08), n=6, amp=0.05, seed=5), 0.02, ALGA))
    return finish_debris(parts, 'resto_red_2')


# ---------------------------------------------------------------- bidón

def jerrycan(color, seed, dent_at=None):
    """Bidón de 20 l de pie (base en z = 0): cuerpo biselado, cruces en relieve, asas y boquilla."""
    w, d, h = 0.44, 0.2, 0.56
    body = cf.box((w, d, h), color=color)
    cf.bevel(body, 0.03, segments=1, angle=30)
    cf.jitter_colors(body, 0.05, seed=seed)
    parts = [body]
    if dent_at:
        dent_box(body, dent_at)
    # Cruz en relieve en las dos caras grandes
    ang = math.degrees(math.atan2(h * 0.7, w * 0.75))
    for y in (-d / 2 - 0.004, d / 2 + 0.004):
        for s in (1, -1):
            parts.append(cf.box((math.hypot(w * 0.75, h * 0.7), 0.012, 0.035), at=(0, y, h * 0.45), rot=(0, s * ang, 0), color=color, base=False))
    # Asas (tres) y boquilla
    for x in (-0.12, 0.0, 0.12):
        parts.append(cf.tube([(x - 0.03, 0, h - 0.005), (x - 0.025, 0, h + 0.05), (x + 0.025, 0, h + 0.05), (x + 0.03, 0, h - 0.005)], 0.014, seg=4, color=color))
    parts.append(cf.cylinder(0.035, 0.05, seg=6, at=(0.16, 0, h - 0.01), rot=(0, 25, 0), color=color))
    parts.append(cf.cylinder(0.04, 0.03, seg=6, at=(0.18, 0, h + 0.035), rot=(0, 25, 0), color=BRASS))
    return parts


def dent_box(ob, at):
    c = Vector(at)
    deform(ob, lambda co: co - Vector((0, math.copysign(1, co.y), 0)) * 0.04 * max(0, 1 - (co - c).length / 0.18) if abs(co.y) > 0.05 else co)


def bidon_0():
    """Bidón rojo de 20 l tumbado de lado."""
    parts = jerrycan(RED, 1)
    for o in parts:
        o.data.transform(Matrix.Translation((0, 0, -0.28)))
    tilt(parts, rx=0, ry=76, rz=15)
    for o in parts:
        o.data.transform(Matrix.Translation((0, 0, -0.03)))
    return finish_debris(parts, 'resto_bidon_0')


def bidon_1():
    """Bidón azul de plástico (de los de 60 l) tumbado, con nervios y su tapón."""
    prof = [(0.0, 0.0), (0.17, 0.0), (0.195, 0.03), (0.2, 0.12), (0.21, 0.14), (0.2, 0.16), (0.2, 0.38), (0.21, 0.4), (0.2, 0.42), (0.2, 0.58), (0.17, 0.62), (0.0, 0.62)]
    body = cf.lathe(prof, seg=10, color=BLUE)
    cf.paint(body, '#285f88', lambda p: p.normal.z > 0.6)
    cf.jitter_colors(body, 0.05, seed=2)
    parts = [body, cf.cylinder(0.045, 0.03, seg=6, at=(0.09, 0.0, 0.62), color='#1f4e70'), cf.cylinder(0.03, 0.02, seg=6, at=(-0.1, 0.03, 0.62), color='#1f4e70')]
    lay(parts, rx=30, ry=90, rz=-20, z=-0.05, cx=0.31)
    return finish_debris(parts, 'resto_bidon_1')


def bidon_2():
    """Bidón amarillo abollado, medio hundido de punta, con un cabo atado a un corcho."""
    parts = jerrycan(BRASS, 3, dent_at=(-0.12, 0.1, 0.3))
    for o in parts:
        o.data.transform(Matrix.Translation((0, 0, -0.33)))
    tilt(parts, rx=-62, ry=18)
    parts.append(strand(wavy((0.12, 0.2, 0.12), (0.32, 0.36, -0.03), n=4, amp=0.02, lift=0.06, seed=6), 0.014, ROPE))
    parts.append(cork((0.33, 0.37, 0.0), rot=(0, 90, 60), color=BUOY, length=0.12, r=0.045))
    return finish_debris(parts, 'resto_bidon_2')


# ---------------------------------------------------------------- cofre

def chest(seed, open_deg=0.0, w=0.9, d=0.6, h=0.38):
    """Cofre de pie (base en z = 0): caja, tapa abombada (giratoria), herrajes, cerradura y oro."""
    parts = []
    box = cf.box((w, d, h), color=CHEST)
    cf.bevel(box, 0.015)
    cf.jitter_colors(box, 0.07, seed=seed)
    parts.append(box)
    # Tapa: medio cilindro a lo largo de X con bisagra en el borde trasero (+y)
    seg = 6
    pts = [(d / 2 * math.cos(math.pi * i / seg), 0.17 * math.sin(math.pi * i / seg)) for i in range(seg + 1)]
    lid = cf.prism([(y, z) for y, z in pts], w, color=CHEST, rot=(90, 0, 90))
    deform(lid, lambda c: (c.x - w / 2, c.y, c.z))
    cf.paint(lid, CHEST_D, lambda p: abs(p.normal.x) > 0.7)
    cf.jitter_colors(lid, 0.07, seed=seed + 1)
    lid_parts = [lid]
    for x in (-w / 2 + 0.12, w / 2 - 0.12):
        band = cf.prism([(y * 1.03, z * 1.08) for y, z in pts], 0.06, color=IRON, rot=(90, 0, 90))
        deform(band, lambda c, x=x: (c.x + x - 0.03, c.y, c.z))
        lid_parts.append(band)
    for o in lid_parts:
        cf.bake_transform(o)
        o.data.transform(Matrix.Translation((0, 0, h)))
    if open_deg:
        tilt(lid_parts, rx=-open_deg, at=(0, d / 2, h))
    parts += lid_parts
    # Herrajes de la caja, cerradura y oro
    for x in (-w / 2 + 0.12, w / 2 - 0.12):
        parts.append(cf.box((0.06, d + 0.02, h + 0.01), at=(x, 0, 0), color=IRON))
    lock = cf.box((0.12, 0.03, 0.14), at=(0, -d / 2 - 0.012, h - 0.16), color=BRASS)
    parts.append(lock)
    parts.append(cf.box((0.04, 0.035, 0.05), at=(0, -d / 2 - 0.02, h - 0.12), color=IRON))
    if open_deg:
        r = cf.rng(seed)
        coins = cf.box((w - 0.1, d - 0.1, 0.06), at=(0, 0, h - 0.03), color=GOLD)
        deform(coins, lambda c: (c.x, c.y, c.z + 0.03 * math.sin(c.x * 12) * math.cos(c.y * 9) if c.z > h else c.z))
        parts.append(coins)
        for i in range(4):
            parts.append(cf.cylinder(0.05, 0.012, seg=6, at=(-0.25 + i * 0.16 + r.random() * 0.05, -0.1 + r.random() * 0.2, h + 0.03), rot=(r.random() * 40, r.random() * 40, 0), color=GOLD))
    return parts


def pallet(at=(0, 0, 0), sx=1.5, sy=1.2, seed=0, broken=False):
    """Palé: tablas de arriba sobre tres largueros."""
    parts = []
    n = 5
    for i in range(n):
        if broken and i == 1:
            continue
        y = -sy / 2 + (i + 0.5) * sy / n
        parts.append(plank(sx, sy / n - 0.04, 0.035, at=(at[0], at[1] + y, at[2] + 0.0175), color=WOOD, f=0.8 + 0.06 * (i % 3), broken=(broken and i == 3, False), seed=seed + i, bev=False))
    for y in (-sy / 2 + 0.06, 0, sy / 2 - 0.06):
        b = cf.box((sx, 0.1, 0.09), at=(at[0], at[1] + y, at[2] - 0.09), color=WOOD_D)
        cf.jitter_colors(b, 0.08, seed=seed + 20 + int(y * 10))
        parts.append(b)
    return parts


def ring_buoy(at, rot=(0, 0, 0)):
    ring = cf.torus(0.2, 0.065, seg=12, tube_seg=5, at=at, rot=rot, color=BUOY)
    cf.paint(ring, WHITE, lambda p: int((math.atan2(p.center.y - at[1], p.center.x - at[0]) + math.pi) / (math.pi / 3)) % 2 == 0)
    return ring


def cofre_0():
    """Cofre con herrajes y la tapa entreabierta (asoma el oro) sobre un palé, con un salvavidas atado."""
    parts = pallet(at=(0, 0, -0.03), seed=110)
    c = chest(111, open_deg=22)
    for o in c:
        o.data.transform(Matrix.Translation((-0.05, 0.02, 0.0)))
    parts += c
    parts.append(ring_buoy((0.88, -0.48, 0.0)))
    parts.append(strand([(0.42, -0.2, 0.15), (0.6, -0.35, 0.06), (0.72, -0.44, 0.03)], 0.016, ROPE))
    return finish_debris(parts, 'resto_cofre_0')


def cofre_1():
    """Cofre cerrado atado entre dos flotadores de corcho, con la cuerda cruzada por encima."""
    c = chest(121, open_deg=0)
    for o in c:
        o.data.transform(Matrix.Translation((0, 0, -0.18)))
    parts = c
    for y in (-0.48, 0.48):
        fl = cf.lathe([(0.0, 0.0), (0.1, 0.0), (0.14, 0.08), (0.14, 1.17), (0.1, 1.25), (0.0, 1.25)], seg=8, at=(-0.625, y, 0.0), rot=(0, 90, 0), color=BUOY if y < 0 else WHITE)
        cf.paint(fl, WHITE if y < 0 else BUOY, lambda p: abs(p.center.x) > 0.5)
        cf.jitter_colors(fl, 0.06, seed=int(y * 10) + 5)
        parts.append(fl)
    for x in (-0.25, 0.25):
        parts.append(cf.tube([(x, -0.48, 0.12), (x, -0.32, 0.3), (x, 0.0, 0.38), (x, 0.32, 0.3), (x, 0.48, 0.12)], 0.018, seg=4, color=ROPE))
    tilt(parts, rx=4, rz=8)
    return finish_debris(parts, 'resto_cofre_1')


def cofre_2():
    """Cofre abierto y escorado sobre un palé roto, con algas y una boya pequeña."""
    parts = pallet(at=(0, 0, -0.03), sx=1.35, sy=1.1, seed=130, broken=True)
    c = chest(131, open_deg=55, w=0.8, d=0.55, h=0.34)
    tilt(c, ry=-9, rz=-12)
    for o in c:
        o.data.transform(Matrix.Translation((0.05, -0.05, 0.0)))
    parts += c
    parts.append(strand(wavy((-0.4, -0.29, 0.3), (0.38, -0.32, 0.12), n=6, amp=0.03, seed=2), 0.02, ALGA))
    parts.append(strand(wavy((-0.65, 0.5, 0.02), (0.3, 0.6, 0.0), n=6, amp=0.05, seed=3), 0.02, ALGA_D))
    parts.append(float_ball(0.1, (0.72, 0.5, 0.05), seg=6))
    parts.append(strand([(0.4, 0.2, 0.05), (0.66, 0.46, 0.06)], 0.012, ROPE))
    return finish_debris(parts, 'resto_cofre_2')


# ---------------------------------------------------------------- balsa

DECK = 0.2  # altura de la cubierta de la balsa sobre el agua (náufragos sentados)


def drum(at, color=BLUE, length=0.95, r=0.24, seed=0):
    """Bidón de 200 l tumbado a lo largo de X (flotador de balsa)."""
    prof = [(0.0, 0.0), (r * 0.9, 0.0), (r, 0.04), (r, length * 0.33), (r + 0.012, length * 0.34), (r, length * 0.35), (r, length - 0.04), (r * 0.9, length), (0.0, length)]
    ob = cf.lathe(prof, seg=8, color=color)
    cf.paint(ob, RUST, lambda p: math.sin(p.center.z * 13 + seed) > 0.85)
    cf.jitter_colors(ob, 0.06, seed=seed)
    lay([ob], ry=90, z=0.0, cx=length / 2)
    ob.data.transform(Matrix.Translation(at))
    return ob


def mast_with_rag(x, y, h, rag=WHITE, flag=False):
    parts = [cf.cylinder(0.045, h, seg=6, at=(x, y, DECK - 0.02), r2=0.035, color=BARREL)]
    top = DECK + h

    def sail(u, v):
        # u ∈ [-0.5, 0.5] (largo), v ∈ [-0.5, 0.5] (alto): trapo que ondea a sotavento
        xx = x + (u + 0.5) * (0.75 if flag else 0.85)
        zz = top - 0.05 - (v + 0.5) * (0.42 if flag else 1.2)
        yy = y + 0.07 * math.sin((u + 0.5) * 5) * (u + 0.5)
        return (xx, yy, zz)
    cloth = grid(4, 3, 1.0, 1.0, lambda u, v: sail(u, v), color=rag, name='trapo')
    cf.jitter_colors(cloth, 0.08, seed=7)
    parts.append(two_sided(cloth))
    if not flag:
        parts.append(cf.cylinder(0.025, 0.85, seg=5, at=(x, y, top - 1.28), rot=(0, 90, 0), color=BARREL))
    return parts


def bundle(at, color='#b89b6a'):
    sack = cf.sphere(0.22, at=at, color=color, subdiv=1, scale=(1.0, 0.85, 0.7))
    cf.jitter_colors(sack, 0.08, seed=9)
    tie = cf.cylinder(0.05, 0.08, seg=6, at=(at[0], at[1], at[2] + 0.12), color=ROPE)
    return [sack, tie]


def balsa_0():
    """Balsa de náufragos: dos palés sobre cuatro bidones, mástil con un trapo, hatillo y garrafa."""
    parts = []
    for x in (-0.75, 0.75):
        for y in (-0.55, 0.55):
            parts.append(drum((x, y, -0.05), color=BLUE if (x > 0) == (y > 0) else RED, seed=int((x + y) * 10) + 20))
    for x, s in ((-0.78, 140), (0.78, 145)):
        parts += pallet(at=(x, 0, DECK - 0.035), sx=1.5, sy=1.5, seed=s)
    for y in (-0.62, 0.62):
        parts.append(lashing(-0.75, 0.08, 0.2, zc=0.0, r=0.018, seed=int(y * 10) + 3))
    parts += mast_with_rag(1.05, 0.75, 2.2)
    parts += bundle((-1.0, -0.6, DECK + 0.13))
    parts.append(cf.lathe([(0.0, 0.0), (0.12, 0.0), (0.13, 0.22), (0.05, 0.3), (0.05, 0.34), (0.0, 0.34)], seg=7, at=(-0.62, -0.75, DECK), color='#4cc9f0'))
    return finish_debris(parts, 'resto_balsa_0')


def balsa_1():
    """Balsa de troncos atados con tres travesaños, banderín rojo de socorro y una caja."""
    parts = []
    n = 6
    for i in range(n):
        y = (i - (n - 1) / 2) * 0.33
        ln = 3.0 + ((i * 37) % 5) * 0.08
        log = cf.cylinder(0.165, ln, seg=7, at=(-ln / 2 + ((i * 13) % 3 - 1) * 0.08, y, DECK - 0.13), rot=(0, 90, 0), color='#9c6b43')
        cf.paint(log, '#c9a06a', lambda p: abs(p.normal.x) > 0.8)
        cf.jitter_colors(log, 0.1, seed=150 + i)
        parts.append(log)
    for x in (-1.1, 0.0, 1.1):
        b = cf.box((0.16, 2.1, 0.07), at=(x, 0, DECK - 0.03), color='#6e4a2e')
        cf.jitter_colors(b, 0.08, seed=int(x * 10) + 160)
        parts.append(b)
        for i in (1, 4):
            y = (i - (n - 1) / 2) * 0.33
            ls = lashing(0.0, 0.09, 0.07, zc=DECK - 0.06, r=0.016, seed=i + int(x * 10))
            ls.data.transform(Matrix.Translation((x, y, 0)) @ Matrix.Rotation(math.radians(90), 4, 'Z'))
            parts.append(ls)
    parts += mast_with_rag(1.05, 0.75, 2.1, rag=RED, flag=True)
    crate = [cf.box((0.42, 0.42, 0.36), color=WOOD), cf.box((0.44, 0.08, 0.38), color=WOOD_D), cf.box((0.08, 0.44, 0.38), color=WOOD_D)]
    cf.jitter_colors(crate[0], 0.08, seed=170)
    tilt(crate, rz=20)
    for o in crate:
        o.data.transform(Matrix.Translation((-1.05, -0.62, DECK)))
    parts += crate
    return finish_debris(parts, 'resto_balsa_1')


def balsa_2():
    """Balsa de tablones sobre dos bidones largos, con un toldo de lona y un remo."""
    parts = []
    for y in (-0.62, 0.62):
        parts.append(drum((0.0, y, -0.06), color='#d9a441' if y < 0 else BLUE, length=2.4, r=0.26, seed=int(y * 10) + 30))
    for i in range(7):
        y = (i - 3) * 0.24
        parts.append(plank(2.6 - (i % 2) * 0.25, 0.24, 0.05, at=(0.05 * (i % 3 - 1), y, DECK - 0.025), color=WOOD, f=0.8 + 0.05 * (i % 4), broken=(i == 6, i == 0), seed=180 + i, bev=False))
    for x in (-0.9, 0.9):
        b = cf.box((0.12, 1.75, 0.08), at=(x, 0, DECK - 0.13), color=WOOD_D)
        parts.append(b)
        for y in (-0.62, 0.62):
            parts.append(lashing(x, 0.07, 0.33, zc=-0.02, r=0.016, seed=int((x + y) * 10) + 40))
    # Toldo: dos palos y una lona inclinada a popa (−x), dejando el centro libre
    for y in (-0.75, 0.75):
        parts.append(cf.cylinder(0.035, 1.0, seg=5, at=(-1.15, y, DECK), color=BARREL))

    def awning(u, v):
        return (-1.15 + 0.05 + (u + 0.5) * 0.45, v * 1.55, DECK + 1.0 - (u + 0.5) * 0.65 + 0.04 * math.sin(v * 9))
    cloth = grid(3, 4, 1.0, 1.0, awning, color=TARP, name='toldo')
    cf.jitter_colors(cloth, 0.08, seed=8)
    parts.append(two_sided(cloth))
    # Remo cruzado
    parts.append(cf.cylinder(0.025, 1.35, seg=5, at=(0.35, 0.95, DECK + 0.03), rot=(0, 90, -8), color=BARREL))
    blade = cf.box((0.34, 0.14, 0.025), at=(1.82, 0.76, DECK + 0.03), color=WOOD_D, rot=(0, 0, -8))
    parts.append(blade)
    parts += mast_with_rag(1.05, 0.75, 1.9, rag='#e9c46a', flag=True)
    return finish_debris(parts, 'resto_balsa_2')


# ---------------------------------------------------------------- exportación

def build():
    for fn in (tablones_0, tablones_1, tablones_2, barril_0, barril_1, barril_2, caja_0, caja_1, caja_2,
               restos_0, restos_1, restos_2, red_0, red_1, red_2, bidon_0, bidon_1, bidon_2,
               cofre_0, cofre_1, cofre_2, balsa_0, balsa_1, balsa_2):
        fn()
    # Cajas envolventes al día (build.py las lee para el manifiesto tras transformar los vértices).
    bpy.context.view_layer.update()
