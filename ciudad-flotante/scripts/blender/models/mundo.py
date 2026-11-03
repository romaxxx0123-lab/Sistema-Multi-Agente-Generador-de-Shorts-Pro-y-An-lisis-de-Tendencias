"""
MUNDO (avistamientos, decorado lejano y fauna): piezas de Blender que src/render/world/models.ts y
marine.ts colocan y fusionan en sus geometrías (una llamada de dibujo por modelo, como antes).

- `mundo_naufragio`: casco de madera partido en dos y escorado (proa al aire con las cuadernas a la
  vista, popa medio hundida con su caseta), mástil tronchado, verga caída con la vela rasgada.
- `mundo_palmera_0..2`: palmeras de tronco curvo anillado, copa de hojas plegadas (alguna seca) y
  cocos. Altura de referencia PALM_H (el juego las escala a la altura que quiera).
- `mundo_roca_0..2`: rocas facetadas (canto rodado, aguja y losa) de 1 m de radio, con la cara de
  arriba más clara y el pie oscuro y mojado.
- `mundo_cabana`: cabaña de náufrago sobre pilotes con techo de hojas.
- `mundo_colinas_0..1`: núcleo de las islas (colinas facetadas con selva, laderas de roca, cumbre y
  matas), de ~17 m de radio y base en z = 0; models.ts lo pone sobre la playa.
- `mundo_delfin`, `mundo_pez`: fauna de los saltos (marine.ts), con el eje del cuerpo a DOLPHIN_AXIS
  y FISH_AXIS sobre la base (marine.ts los baja lo mismo para que el eje quede en el origen).

Ejes: Blender (x, y, z) → juego (x, z, −y). En el mundo +x es la proa (como en models.ts). Los
modelos que flotan llevan la superficie del agua a WL metros sobre su base (todo por encima de z = 0,
como pide el manifiesto); models.ts los baja WORLD_LIFT (= WL).
"""
import math

import bmesh
import bpy
from mathutils import Matrix, Vector

import cf

WL = 3.0  # superficie del agua sobre la base de los modelos que flotan (WORLD_LIFT en models.ts)
PALM_H = 8.0  # altura de referencia de las palmeras (de la base a la copa)
DOLPHIN_AXIS = 0.5  # altura del eje del cuerpo del delfín sobre su base (igual en marine.ts)
FISH_AXIS = 0.1  # ídem del pez

PAINT = '#3d5a5a'  # pintura vieja del casco
PAINT_L = '#5b7f7a'
ANTIFOUL = '#8e3b2c'
STRIPE = '#d8cfb5'
PLANK_IN = '#6e5440'
RIB = '#5e3f28'
DECK = '#9c7a52'
CANVAS = '#cfc2a0'
ROPE = 'rope'
IRON = 'metalDark'
TRUNK = '#8b6b4a'
TRUNK_D = '#6f5236'
LEAF = '#3f8a3a'
LEAF_L = '#5aa04a'
LEAF_DRY = '#a8904e'
COCO = '#6b4f2a'
ROCK = '#8a8a84'
ROCK_L = '#aaa89c'
ROCK_D = '#6a6d6b'
ROCK_WET = '#4d5354'
THATCH = '#c9a75a'
THATCH_D = '#a8863f'
WOOD = '#8b5e3c'
WOOD_L = '#b08a5a'


# ---------------------------------------------------------------- utilidades

def deform(ob, fn):
    for v in ob.data.vertices:
        v.co = Vector(fn(v.co.copy()))
    ob.data.update()
    return ob


def xform(objs, m):
    for o in objs:
        cf.bake_transform(o)
        o.data.transform(m)
    return objs


def rot(rx=0.0, ry=0.0, rz=0.0, at=(0, 0, 0)):
    """Matriz de giro (grados, X luego Y luego Z) alrededor de `at`."""
    return Matrix.Translation(Vector(at)) @ Matrix.Rotation(math.radians(rz), 4, 'Z') @ Matrix.Rotation(math.radians(ry), 4, 'Y') @ Matrix.Rotation(math.radians(rx), 4, 'X') @ Matrix.Translation(-Vector(at))


def mesh_from(name, verts, faces, color):
    bm = bmesh.new()
    vs = [bm.verts.new(v) for v in verts]
    for f in faces:
        try:
            bm.faces.new([vs[i] for i in f])
        except ValueError:
            pass
    bm.normal_update()
    return cf.paint(cf._link(name, bm), color)


def inner_copy(ob, color, f=1.0):
    """Copia con las caras del revés y otro color (interior de un casco, envés de una hoja)."""
    me = ob.data.copy()
    cp = bpy.data.objects.new(ob.name + '_dentro', me)
    bpy.context.scene.collection.objects.link(cp)
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.reverse_faces(bm, faces=list(bm.faces))
    bm.to_mesh(me)
    bm.free()
    return cf.paint(cp, color, f=f)


def mirror_y(ob):
    """Refleja en Y conservando las caras hacia fuera."""
    cf.bake_transform(ob)
    ob.data.transform(Matrix.Scale(-1, 4, Vector((0, 1, 0))))
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bmesh.ops.reverse_faces(bm, faces=list(bm.faces))
    bm.to_mesh(ob.data)
    bm.free()
    return ob


def clamp_bottom(objs, zmin):
    for o in objs:
        cf.bake_transform(o)
        deform(o, lambda c: (c.x, c.y, max(c.z, zmin)))
    return objs


# ---------------------------------------------------------------- naufragio

HULL_ROWS = [(0.0, -1.0), (0.62, -0.9), (0.95, -0.3), (1.0, 0.1), (1.02, 0.55), (1.03, 1.0)]
BAND_COLORS = [ANTIFOUL, ANTIFOUL, PAINT, STRIPE, PAINT_L]


def hull_point(x, i, L=22.0, hw=3.4, D=2.2, F=2.4, bow_frac=0.32):
    """Punto del costado de estribor (y > 0) en la fila i de la sección en x (casco centrado en 0)."""
    bow_start = L / 2 - L * bow_frac
    t = max(0.0, (x - bow_start) / (L / 2 - bow_start))
    taper = 1 - min(1.0, t) ** 1.7
    if x < -L / 2 + 1.5:
        taper *= 0.88 + 0.12 * (x + L / 2) / 1.5
    yf, zf = HULL_ROWS[i]
    z = zf * (D if zf < 0 else F)
    if i <= 1:
        z += t * t * D * 0.85
    z += t * t * 1.1 * (i / (len(HULL_ROWS) - 1))
    return (x, yf * hw * taper, z)


def hull_piece(xs, starts, name, transom=False):
    """
    Trozo de casco de tablazón entre las estaciones `xs`; la banda k empieza en la estación starts[k]
    (rotura escalonada). Devuelve [exterior, interior].
    """
    verts, faces, cols = [], [], []
    index = {}

    def vid(j, i, side):
        key = (j, i, side)
        if key not in index:
            x, y, z = hull_point(xs[j], i)
            index[key] = len(verts)
            verts.append((x, side * y, z))
        return index[key]
    for k in range(len(HULL_ROWS) - 1):
        for j in range(starts[k], len(xs) - 1):
            for side in (1, -1):
                a, b, c, d = vid(j, k, side), vid(j + 1, k, side), vid(j + 1, k + 1, side), vid(j, k + 1, side)
                faces.append((a, b, c, d) if side > 0 else (a, d, c, b))
                cols.append(BAND_COLORS[k])
    if transom:
        for k in range(len(HULL_ROWS) - 1):
            a, b, c, d = vid(0, k, 1), vid(0, k + 1, 1), vid(0, k + 1, -1), vid(0, k, -1)
            faces.append((a, b, c, d))
            cols.append(BAND_COLORS[k])
    ob = mesh_from(name, verts, faces, PAINT)
    # Caras hacia fuera: la normal se aleja del eje del casco.
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bm.normal_update()
    for f in bm.faces:
        c = f.calc_center_median()
        out = Vector((0, c.y, c.z - 0.6))
        if transom and abs(c.x - xs[0]) < 1e-3 and abs(f.normal.x) > 0.7:
            out = Vector((-1, 0, 0))
        if f.normal.dot(out) < 0:
            f.normal_flip()
    bm.to_mesh(ob.data)
    bm.free()
    # Color por banda según la altura media de la cara
    zs = [hull_point(0, i)[2] for i in range(len(HULL_ROWS))]

    def band(p):
        z = p.center.z
        for k in range(len(zs) - 1):
            if z < (zs[k] + zs[k + 1]) / 2 + 0.6:
                return k
        return len(zs) - 2
    for k, col in enumerate(BAND_COLORS):
        cf.paint(ob, col, lambda p, k=k: band(p) == k)
    cf.jitter_colors(ob, 0.1, seed=len(xs) * 7 + starts[0])
    inside = inner_copy(ob, PLANK_IN, f=0.9)
    cf.jitter_colors(inside, 0.08, seed=3)
    return [ob, inside]


def rib(x, top_i=5, r=0.13):
    """Cuaderna (costilla) en U siguiendo la sección del casco en x."""
    pts = [hull_point(x, i) for i in range(top_i, -1, -1)]
    path = [(x, y * 0.97, z) for x, y, z in pts] + [(x, -y * 0.97, z) for x, y, z in reversed(pts[:-1])]
    ob = cf.tube(path, r, seg=4, color=RIB)
    return cf.jitter_colors(ob, 0.08, seed=int(x * 10))


def deck(x0, x1, holes=(), dx=1.0):
    """Cubierta de tablas entre x0 y x1 a la altura de la regala, con huecos (índices de tramo)."""
    parts = []
    n = max(1, int((x1 - x0) / dx))
    for j in range(n):
        if j in holes:
            continue
        xa = x0 + (x1 - x0) * j / n
        xb = x0 + (x1 - x0) * (j + 1) / n
        _, ya, za = hull_point(xa, 5)
        _, yb, zb = hull_point(xb, 5)
        w = min(ya, yb) * 0.98
        b = cf.box((xb - xa, 2 * w, 0.12), at=((xa + xb) / 2, 0, (za + zb) / 2 - 0.22), color=DECK)
        cf.jitter_colors(b, 0.1, seed=j + 70)
        parts.append(b)
    return parts


def wreck():
    stations = [-1.6 + 1.25 * j for j in range(11)]  # proa: de x = −1.6 a 10.9
    bow = hull_piece(stations, [0, 1, 0, 2, 1], 'proa')
    bow += [rib(stations[0] + 0.15), rib(stations[1] + 0.1, top_i=5), rib(stations[2] - 0.2, top_i=4)]
    bow += deck(stations[2], 9.4, holes=(1, 4))
    # Bao al aire en el hueco de la cubierta
    _, y, z = hull_point(2.3, 5)
    bow.append(cf.box((0.25, 2 * y, 0.25), at=(2.3, 0, z - 0.4), color=RIB))
    # Mástil tronchado con astillas
    stump = cf.cylinder(0.3, 4.6, seg=7, at=(4.6, 0, 1.6), r2=0.26, color=RIB)
    r = cf.rng(5)
    tops = {}

    def jag(c):
        if c.z > 6.0:
            k = (round(c.x, 2), round(c.y, 2))
            tops.setdefault(k, r.random() * 0.9)
            return (c.x, c.y, c.z - tops[k])
        return c
    deform(stump, jag)
    bow.append(stump)
    # Jarcia suelta del tocón a la regala
    for side in (1, -1):
        _, y0, z0 = hull_point(6.5, 5)
        bow.append(cf.tube([(4.6, 0, 5.6), (5.6, side * y0 * 0.6, 4.4), (6.5, side * y0, z0)], 0.05, seg=4, color=ROPE))
    # Proa al aire: cabeceo hacia arriba y escora a estribor
    xform(bow, rot(ry=-21, rx=24, at=(0, 0, 0)))
    xform(bow, Matrix.Translation((1.2, 0.6, -1.5)))

    st_x = [-11.0 + 1.3 * j for j in range(7)]  # popa: de x = −11 a −3.2
    n = len(st_x)
    stern = hull_piece(st_x, [0] * 5, 'popa', transom=True)
    # rotura escalonada de la popa: se quitan los últimos tramos de algunas bandas
    stern_bm = bmesh.new()
    for o in stern:
        stern_bm.clear()
        stern_bm.from_mesh(o.data)
        kill = [f for f in stern_bm.faces if f.calc_center_median().x > st_x[n - 2] and (int(f.calc_center_median().z * 3) % 2 == 0)]
        bmesh.ops.delete(stern_bm, geom=kill, context='FACES')
        stern_bm.to_mesh(o.data)
    stern_bm.free()
    stern += [rib(st_x[-1] - 0.15), rib(st_x[-2] + 0.3, top_i=4)]
    stern += deck(-10.6, st_x[-2], holes=(3,))
    # Caseta de popa con su techo hundido, ventanas oscuras y puerta
    _, _, zd = hull_point(-8.0, 5)
    cabin = cf.box((3.6, 3.4, 2.0), at=(-8.0, 0, zd - 0.2), color='#7a6a58')
    cf.jitter_colors(cabin, 0.08, seed=9)
    roof = cf.box((4.0, 3.9, 0.22), at=(-8.0, 0, zd + 1.8), color=RIB, rot=(6, -4, 0))
    stern += [cabin, roof]
    for y in (1.71, -1.71):
        for x in (-8.9, -7.2):
            stern.append(cf.box((0.7, 0.06, 0.55), at=(x, y, zd + 0.75), color='#1f2a30'))
    stern.append(cf.box((0.06, 0.8, 1.4), at=(-6.18, 0.5, zd - 0.15), color='#2b2118'))
    # Popa medio hundida: cabeceo hacia la rotura y escora a babor
    xform(stern, rot(ry=17, rx=-26, at=(-7.0, 0, 0)))
    xform(stern, rot(rz=14, at=(-7.0, 0, 0)))
    xform(stern, Matrix.Translation((-0.8, -0.5, -2.3)))

    # Trozo de mástil caído de la cubierta al agua, con la verga y la vela rasgada flotando
    spar = cf.tube([(4.8, -1.0, 2.9), (9.6, -7.6, -0.4)], 0.24, seg=6, color=RIB)
    y0, y1 = Vector((6.0, -7.8, 0.35)), Vector((10.5, -4.4, 0.25))
    yard = cf.tube([tuple(y0), tuple(y1)], 0.14, seg=6, color=RIB)
    perp = Vector(((y1 - y0).y, -(y1 - y0).x, 0)).normalized()
    rr = cf.rng(8)
    verts, faces = [], []
    nu, nv = 6, 3
    for i in range(nu + 1):
        for j in range(nv + 1):
            u, v = i / nu, j / nv
            if j == nv:
                v -= rr.random() * 0.35  # borde rasgado
            b = y0 + (y1 - y0) * u + perp * v * 3.2
            verts.append((b.x, b.y, 0.3 + 0.25 * math.sin(u * 7 + v * 3) * (1 - v) - 0.18 * v))
    for i in range(nu):
        for j in range(nv):
            if (i, j) in ((2, 2), (4, 1)):
                continue  # jirones
            a = i * (nv + 1) + j
            faces.append((a, a + nv + 1, a + nv + 2, a + 1))
    cloth = mesh_from('vela', verts, faces, CANVAS)
    bm = bmesh.new()
    bm.from_mesh(cloth.data)
    bm.normal_update()
    for f in bm.faces:
        if f.normal.z < 0:
            f.normal_flip()
    bm.to_mesh(cloth.data)
    bm.free()
    cf.jitter_colors(cloth, 0.1, seed=4)
    under = inner_copy(cloth, CANVAS, f=0.75)
    fallen = [spar, yard, cloth, under]
    fallen.append(cf.tube([(4.6, 0.3, 4.4), (6.6, -3.0, 2.0), (8.2, -5.4, 0.5)], 0.05, seg=4, color=ROPE))

    parts = bow + stern + fallen
    clamp_bottom(parts, -WL + 0.02)
    for o in parts:
        o.data.transform(Matrix.Translation((0, 0, WL)))
    return cf.model(parts, 'mundo_naufragio')


# ---------------------------------------------------------------- palmeras

def trunk(points, r0, r1, sides=5, name='tronco'):
    """Tronco anillado: anillos de `sides` vértices a lo largo de `points`, radio de r0 a r1."""
    verts, faces = [], []
    n = len(points)
    for i, p in enumerate(points):
        t = i / (n - 1)
        a = Vector(points[min(i + 1, n - 1)]) - Vector(points[max(i - 1, 0)])
        a.normalize()
        u = a.orthogonal().normalized()
        w = a.cross(u)
        rr = (r0 + (r1 - r0) * t) * (1.08 if i % 2 else 1.0)
        for k in range(sides):
            ang = 2 * math.pi * k / sides
            verts.append(tuple(Vector(p) + (u * math.cos(ang) + w * math.sin(ang)) * rr))
    for i in range(n - 1):
        for k in range(sides):
            a, b = i * sides + k, i * sides + (k + 1) % sides
            faces.append((a, b, b + sides, a + sides))
    ob = mesh_from(name, verts, faces, TRUNK)
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(ob.data)
    bm.free()
    cf.paint(ob, TRUNK_D, lambda p: int(p.center.z * 1.6) % 2 == 0)
    return ob


def frond(top, yaw, length, rise, width, color, seed, droop=1.15):
    """Hoja de palmera plegada en V (el nervio arriba), que sube y cae; dos caras."""
    r = cf.rng(seed)
    d = Vector((math.cos(yaw), math.sin(yaw), 0))
    side = Vector((-d.y, d.x, 0))
    verts, faces = [], []
    ns = 3
    for i in range(ns + 1):
        s = i / ns
        spine = Vector(top) + d * length * s + Vector((0, 0, length * (rise * s - droop * s * s)))
        w = width * (math.sin(math.pi * min(1.0, s * 1.15)) ** 0.7 if s < 0.999 else 0.0) + 0.04
        fold = -0.32 * w
        jag = (r.random() - 0.5) * 0.12 * w
        verts += [tuple(spine + side * (w + jag) + Vector((0, 0, fold))), tuple(spine), tuple(spine - side * (w - jag) + Vector((0, 0, fold)))]
    for i in range(ns):
        a = i * 3
        faces.append((a, a + 3, a + 4, a + 1))
        faces.append((a + 1, a + 4, a + 5, a + 2))
    ob = mesh_from('hoja', verts, faces, color)
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bm.normal_update()
    for f in bm.faces:
        if f.normal.z < 0:
            f.normal_flip()
    bm.to_mesh(ob.data)
    bm.free()
    cf.jitter_colors(ob, 0.08, seed=seed)
    under = inner_copy(ob, color, f=0.7)
    return [ob, under]


def coconut(at, r=0.17):
    return cf.lathe([(0.0, -r), (r * 0.9, -r * 0.4), (r * 0.9, r * 0.4), (0.0, r)], seg=5, at=at, color=COCO)


def palm(name, h, lean, seed, n_leaves=7, dry=1):
    r = cf.rng(seed)
    pts = []
    for i in range(7):
        t = i / 6
        pts.append((lean * h * (0.25 * t + 0.75 * t * t), 0.15 * lean * h * math.sin(t * 2.2), h * t))
    # El primer anillo sigue la inclinación del tronco: se aplana para que apoye en z = 0.
    parts = [deform(trunk(pts, 0.3, 0.17), lambda c: (c.x, c.y, max(c.z, 0.0)))]
    top = Vector(pts[-1]) + Vector((0, 0, 0.12))
    for i in range(n_leaves):
        yaw = 2 * math.pi * i / n_leaves + r.random() * 0.45
        is_dry = i < dry
        parts += frond(top, yaw, (2.5 if is_dry else 2.8 + r.random() * 0.7), 0.25 if is_dry else 0.55, 0.42, LEAF_DRY if is_dry else (LEAF if i % 2 else LEAF_L), seed * 13 + i, droop=1.9 if is_dry else 1.15)
    for i in range(3):
        a = i * 2.1 + 0.4
        parts.append(coconut((top.x + math.cos(a) * 0.24, top.y + math.sin(a) * 0.24, top.z - 0.3)))
    return cf.model(parts, name)


# ---------------------------------------------------------------- rocas

def rock(name, seed, sx=1.0, sy=1.0, sz=0.7, n=16, sink=0.15):
    """Roca facetada: envolvente convexa de puntos al azar; arriba clara, pie oscuro y mojado."""
    r = cf.rng(seed)
    bm = bmesh.new()
    for i in range(n):
        u = r.random() * 2 - 1
        a = r.random() * 2 * math.pi
        s = math.sqrt(1 - u * u)
        k = 0.78 + r.random() * 0.3
        bm.verts.new((sx * k * s * math.cos(a), sy * k * s * math.sin(a), sz * k * u))
    res = bmesh.ops.convex_hull(bm, input=list(bm.verts))
    bmesh.ops.delete(bm, geom=[g for g in res['geom_interior'] if isinstance(g, bmesh.types.BMVert)], context='VERTS')
    loose = [v for v in bm.verts if not v.link_faces]
    bmesh.ops.delete(bm, geom=loose, context='VERTS')
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    zmin = min(v.co.z for v in bm.verts)
    for v in bm.verts:
        v.co.z -= zmin + sink * sz
        v.co.z = max(v.co.z, 0.0)
    ob = cf._link(name + '_m', bm)
    cf.paint(ob, ROCK)
    cf.paint(ob, ROCK_D, lambda p: p.normal.z < 0.2)
    cf.paint(ob, ROCK_L, lambda p: p.normal.z > 0.75)
    cf.paint(ob, ROCK_WET, lambda p: p.center.z < sz * 0.35 and p.normal.z < 0.5)
    cf.jitter_colors(ob, 0.09, seed=seed)
    return cf.model([ob], name)


# ---------------------------------------------------------------- colinas de isla

GRASS = '#6a994e'
GRASS_D = '#4f7c3a'
JUNGLE = '#3f7d3a'
SAND_GRASS = '#b9b06e'


def hills(name, seed, R=17.5, H=13.0, peak=(4.0, 3.0), rings=7, seg=18):
    """
    Núcleo de una isla: colinas facetadas en una malla polar (radio R, base en z = 0), verdes con
    manchas de selva, roca en las laderas empinadas y en la cumbre, y matas de vegetación.
    """
    r = cf.rng(seed)
    ph = [r.random() * 6.28 for _ in range(6)]
    px, py = peak

    def height(x, y):
        d = math.hypot(x - px * 0.6, y - py * 0.6) / R
        base = max(0.0, 1 - d * d) ** 1.4
        hump = max(0.0, 1 - math.hypot(x - px, y - py) / (R * 0.45)) ** 1.6
        n = 0.06 * math.sin(x * 0.45 + ph[0]) * math.cos(y * 0.5 + ph[1]) + 0.04 * math.sin(x * 0.9 + y * 0.7 + ph[2])
        return H * (0.42 * base + 0.62 * hump + n * base)
    verts, faces = [], []
    for k in range(1, rings + 1):
        rr = R * (k / rings) ** 0.85
        for i in range(seg):
            a = 2 * math.pi * (i + 0.5 * (k % 2)) / seg
            wob = 1 + 0.1 * math.sin(a * 3 + ph[3]) + 0.06 * math.sin(a * 5 + ph[4])
            x, y = rr * wob * math.cos(a), rr * wob * math.sin(a)
            z = height(x, y) if k < rings else 0.0
            verts.append((x, y, z))
    verts.append((px * 0.95, py * 0.95, height(px, py) + 1.2))
    top = len(verts) - 1
    for k in range(rings - 1):
        for i in range(seg):
            a, b = k * seg + i, k * seg + (i + 1) % seg
            c, d = (k + 1) * seg + (i + 1) % seg, (k + 1) * seg + i
            faces.append((a, d, b) if k % 2 == 0 else (a, d, c))
            faces.append((b, d, c) if k % 2 == 0 else (a, c, b))
    # Centro: abanico al vértice más alto cercano (la cumbre)
    for i in range(seg):
        faces.append((top, i, (i + 1) % seg))
    ob = mesh_from(name + '_m', verts, faces, GRASS)
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bm.normal_update()
    for f in bm.faces:
        if f.normal.z < 0:
            f.normal_flip()
    bm.to_mesh(ob.data)
    bm.free()
    cf.paint(ob, GRASS_D, lambda p: math.sin(p.center.x * 0.3 + ph[5]) * math.cos(p.center.y * 0.35) > 0.1)
    cf.paint(ob, JUNGLE, lambda p: math.sin(p.center.x * 0.22 + ph[2]) + math.cos(p.center.y * 0.27 + ph[0]) > 1.0 and p.center.z > 2.0)
    cf.paint(ob, SAND_GRASS, lambda p: p.center.z < 1.2)
    cf.paint(ob, ROCK, lambda p: p.normal.z < 0.62 and p.center.z > 2.5)
    cf.paint(ob, ROCK_L, lambda p: p.center.z > H * 0.82)
    cf.jitter_colors(ob, 0.08, seed=seed)
    parts = [ob]
    # Matas de selva sobre las laderas
    for i in range(9):
        a = r.random() * 2 * math.pi
        d = R * (0.25 + r.random() * 0.5)
        x, y = d * math.cos(a), d * math.sin(a)
        z = height(x, y)
        bush = rock_mesh(seed * 7 + i, 1.6 + r.random() * 1.4, 1.4 + r.random(), 1.1 + r.random() * 0.6, n=12)
        cf.paint(bush, JUNGLE if i % 2 else GRASS_D)
        cf.paint(bush, GRASS, lambda p: p.normal.z > 0.8)
        cf.jitter_colors(bush, 0.1, seed=i)
        bush.data.transform(Matrix.Translation((x, y, z - 0.5)))
        parts.append(bush)
    # Peñas en la cumbre
    for i in range(2):
        rk = rock_mesh(seed * 3 + i, 2.2 - i * 0.6, 2.0, 2.4 - i * 0.8, n=14)
        cf.paint(rk, ROCK)
        cf.paint(rk, ROCK_L, lambda p: p.normal.z > 0.7)
        cf.paint(rk, ROCK_D, lambda p: p.normal.z < 0.1)
        rk.data.transform(Matrix.Translation((px + i * 2.2, py - i * 1.5, height(px + i * 2.2, py - i * 1.5) - 1.1)))
        parts.append(rk)
    clamp_bottom(parts, 0.0)  # lo que queda bajo la playa no se ve: base apoyada en z = 0
    return cf.model(parts, name)


def rock_mesh(seed, sx, sy, sz, n=14):
    """Envolvente convexa de puntos al azar (base de las rocas y las matas), centrada en z = 0."""
    r = cf.rng(seed)
    bm = bmesh.new()
    for i in range(n):
        u = r.random() * 2 - 1
        a = r.random() * 2 * math.pi
        s = math.sqrt(1 - u * u)
        k = 0.8 + r.random() * 0.28
        bm.verts.new((sx * k * s * math.cos(a), sy * k * s * math.sin(a), sz * k * u))
    res = bmesh.ops.convex_hull(bm, input=list(bm.verts))
    bmesh.ops.delete(bm, geom=[g for g in res['geom_interior'] if isinstance(g, bmesh.types.BMVert)], context='VERTS')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    return cf._link('mata', bm)


# ---------------------------------------------------------------- cabaña

def hut():
    parts = []
    for x in (-1.3, 1.3):
        for y in (-1.1, 1.1):
            parts.append(cf.cylinder(0.12, 2.6, seg=5, at=(x, y, 0), r2=0.1, color=RIB))
    floor = cf.box((3.0, 2.6, 0.15), at=(0, 0, 0.45), color=WOOD_L)
    cf.jitter_colors(floor, 0.1, seed=1)
    parts.append(floor)
    # Paredes de cañas: trasera y laterales a media altura
    for i in range(9):
        x = -1.2 + i * 0.3
        parts.append(cf.cylinder(0.06, 1.35, seg=4, at=(x, 1.15, 0.6), color=WOOD if i % 2 else WOOD_L))
    for side in (-1, 1):
        for i in range(4):
            y = -0.9 + i * 0.6
            parts.append(cf.cylinder(0.06, 0.8 + (i % 2) * 0.2, seg=4, at=(side * 1.35, y, 0.6), color=WOOD if i % 2 else WOOD_L))
    # Techo de hojas a dos aguas con alero, dos capas
    for k, (lift, col) in enumerate(((0.0, THATCH_D), (0.12, THATCH))):
        verts = [(-1.9, -1.75, 2.15 + lift), (1.9, -1.75, 2.15 + lift), (1.7, 0.0, 3.2 + lift), (-1.7, 0.0, 3.2 + lift), (-1.9, 1.75, 2.15 + lift), (1.9, 1.75, 2.15 + lift)]
        faces = [(0, 1, 2, 3), (3, 2, 5, 4)]
        roof = mesh_from('techo', verts, faces, col)
        if k == 1:
            deform(roof, lambda c: (c.x, c.y * 0.94, c.z))
        cf.jitter_colors(roof, 0.1, seed=k + 5)
        parts += [roof, inner_copy(roof, THATCH_D, f=0.8)]
    # Escalera
    for y in (-0.25, 0.25):
        parts.append(cf.box((0.07, 0.07, 1.0), at=(0, y, 0), rot=(0, 25, 0), color=RIB))
    for z in (0.2, 0.5):
        parts.append(cf.box((0.07, 0.55, 0.05), at=(-0.1 - z * 0.45, 0, z), color=WOOD_L))
    clamp_bottom(parts, 0.0)  # la escalera inclinada no baja de la arena
    return cf.model(parts, 'mundo_cabana')


# ---------------------------------------------------------------- fauna

def loft_body(sections, sides, name, color):
    """Cuerpo por secciones elípticas a lo largo de X: [(x, z_centro, ancho, alto), …] de cola a cabeza."""
    verts, faces = [], []
    for x, zc, w, h in sections:
        for k in range(sides):
            a = 2 * math.pi * k / sides + math.pi / 2
            verts.append((x, w * math.cos(a), zc + h * math.sin(a)))
    n = len(sections)
    for i in range(n - 1):
        for k in range(sides):
            a, b = i * sides + k, i * sides + (k + 1) % sides
            faces.append((a, a + sides, b + sides, b))
    # tapas
    verts.append((sections[0][0] - 0.02, 0, sections[0][1]))
    verts.append((sections[-1][0] + 0.05, 0, sections[-1][1]))
    t0, t1 = len(verts) - 2, len(verts) - 1
    for k in range(sides):
        b = (k + 1) % sides
        faces.append((t0, b, k))
        faces.append((t1, (n - 1) * sides + k, (n - 1) * sides + b))
    ob = mesh_from(name, verts, faces, color)
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(ob.data)
    bm.free()
    return ob


def fin(points, color, thick=0.03, name='aleta'):
    """Aleta: polígono en el plano XZ (x, z) con un poco de grosor en Y."""
    ob = cf.prism([(x, z) for x, z in points], thick, color=color, rot=(90, 0, 0))
    deform(ob, lambda c: (c.x, c.y + thick / 2, c.z))
    return ob


def dolphin():
    A = DOLPHIN_AXIS
    # cola → cabeza (x, z, semiancho, semialto)
    sec = [(-1.75, 0.04, 0.05, 0.07), (-1.35, 0.02, 0.1, 0.15), (-0.8, 0.0, 0.2, 0.25), (-0.2, 0.0, 0.29, 0.33), (0.35, 0.0, 0.29, 0.31), (0.85, 0.04, 0.22, 0.24), (1.15, 0.0, 0.13, 0.15), (1.35, -0.06, 0.06, 0.06), (1.58, -0.08, 0.035, 0.035)]
    body = loft_body([(x, z + A, w, h) for x, z, w, h in sec], 8, 'cuerpo', '#5f7180')
    cf.paint(body, '#cfd6da', lambda p: p.normal.z < -0.35)
    cf.paint(body, '#8a99a4', lambda p: -0.35 <= p.normal.z < 0.1)
    parts = [body]
    dorsal = fin([(-0.15, 0.28), (-0.5, 0.78), (-0.62, 0.74), (-0.6, 0.26)], '#4d5d69', thick=0.05)
    deform(dorsal, lambda c: (c.x, c.y, c.z + A))
    parts.append(dorsal)
    for s in (1, -1):
        pec = cf.prism([(0.0, 0.0), (0.22, 0.0), (-0.12, 0.42), (-0.2, 0.38)], 0.03, color='#4d5d69')
        xform([pec], rot(rx=-25))
        if s < 0:
            mirror_y(pec)
        xform([pec], Matrix.Translation((0.45, s * 0.24, A - 0.18)))
        parts.append(pec)
    fluke = cf.prism([(-1.65, 0.0), (-2.1, 0.48), (-2.25, 0.42), (-2.02, 0.0), (-2.25, -0.42), (-2.1, -0.48)], 0.035, color='#4d5d69', at=(0, 0, A + 0.02))
    parts.append(fluke)
    eye = cf.box((0.05, 0.36, 0.04), at=(1.05, 0, A + 0.02), color='#1d252b')
    parts.append(eye)
    return cf.model(parts, 'mundo_delfin')


def fish():
    A = FISH_AXIS
    sec = [(-0.2, 0.0, 0.015, 0.03), (-0.1, 0.0, 0.04, 0.08), (0.06, 0.005, 0.05, 0.1), (0.18, 0.0, 0.035, 0.07), (0.25, -0.005, 0.012, 0.025)]
    body = loft_body([(x, z + A, w, h) for x, z, w, h in sec], 6, 'pez', '#b8c4cc')
    cf.paint(body, '#4f6d80', lambda p: p.normal.z > 0.35)
    cf.paint(body, '#e3e8ea', lambda p: p.normal.z < -0.5)
    tail = cf.prism([(-0.19, 0.0), (-0.34, 0.1), (-0.3, 0.0), (-0.34, -0.1)], 0.012, color='#8fa3b0', rot=(90, 0, 0), at=(0, 0.006, A))
    dorsal = cf.prism([(0.05, 0.08), (-0.06, 0.15), (-0.1, 0.07)], 0.01, color='#4f6d80', rot=(90, 0, 0), at=(0, 0.005, A))
    return cf.model([body, tail, dorsal], 'mundo_pez')


# ---------------------------------------------------------------- exportación

def build():
    wreck()
    palm('mundo_palmera_0', PALM_H, 0.12, 1)
    palm('mundo_palmera_1', PALM_H, 0.2, 2, n_leaves=8, dry=2)
    palm('mundo_palmera_2', PALM_H, 0.05, 3, n_leaves=7, dry=1)
    rock('mundo_roca_0', 11, 1.0, 0.9, 0.75, n=24)
    rock('mundo_roca_1', 12, 0.7, 0.65, 1.5, n=22)
    rock('mundo_roca_2', 13, 1.2, 1.0, 0.45, n=22)
    hut()
    hills('mundo_colinas_0', 21, R=19.0, H=15.0, peak=(5.0, 3.5))
    hills('mundo_colinas_1', 22, R=18.0, H=12.5, peak=(-4.0, -2.5))
    dolphin()
    fish()
    # Cajas envolventes al día (build.py las lee para el manifiesto tras transformar los vértices).
    bpy.context.view_layer.update()
