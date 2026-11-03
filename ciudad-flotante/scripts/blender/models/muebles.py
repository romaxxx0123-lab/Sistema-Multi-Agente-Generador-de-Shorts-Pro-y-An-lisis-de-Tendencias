"""
Muebles de las habitaciones del barco (props de src/render/ship/props.ts): cama, litera, baúl,
sofá, silla, mesa, barril y fogón. Cada modelo se llama `prop_<kind>` y sustituye solo la
geometría sólida «base» del procedimental (props.ts los ajusta a las medidas del layout y añade
encima, procedimentales, los detalles de cada nivel de mejora, el contenido, los cristales y las
luces).

Se modelan en COORDENADAS DEL JUEGO con las medidas del colisionador de data/modules.ts (las
mismas que usa el procedimental) para que los anclajes, alturas de colchón y asiento y puntos de
uso coincidan: `gbox(x0, y0, z0, x1, y1, z1)` es una caja del juego (y arriba, frente = −z) que
se crea en Blender en (x, −z, y). Origen en el centro de la planta, a ras de suelo.
"""
import math

import bmesh
import bpy
from mathutils import Vector

import cf

# Colores del procedimental (props.ts) para que el resto del barco siga casando.
WOOD = '#9c6b43'
WOOD_DARK = '#6e4a2e'
WOOD_LIGHT = '#c8995f'
IRON = '#3a3f44'
CAST = '#2b2f33'
BRASS = '#c9a35a'
CLOTH_WHITE = '#f1ece0'
CANVAS = 'canvas'
STEEL = 'metal'
STEEL_DARK = 'metalDark'


# ---------------------------------------------------------------- ayudas en coordenadas del juego

def B(x, y, z):
    """Punto del juego → Blender."""
    return (x, -z, y)


def gbox(x0, y0, z0, x1, y1, z1, color, bev=0.0, seg=1, name='caja'):
    ob = cf.box((x1 - x0, z1 - z0, y1 - y0), at=((x0 + x1) / 2, -(z0 + z1) / 2, y0), color=color, name=name)
    if bev:
        cf.bevel(ob, bev, seg)
    return ob


def gcyl(x, y0, z, r, h, seg=8, color=STEEL, r2=None):
    """Cilindro vertical (eje y del juego) desde y0."""
    return cf.cylinder(r, h, seg, at=(x, -z, y0), color=color, r2=r2)


def gcylx(x0, x1, y, z, r, seg=8, color=STEEL):
    """Cilindro a lo largo del eje x del juego."""
    return cf.cylinder(r, x1 - x0, seg, at=(x0, -z, y), color=color, rot=(0, 90, 0))


def gcylz(x, y, z0, z1, r, seg=8, color=STEEL):
    """Cilindro a lo largo del eje z del juego (de z0 a z1)."""
    return cf.cylinder(r, z1 - z0, seg, at=(x, -z0, y), color=color, rot=(90, 0, 0))


def glathe(x, y0, z, profile, seg=8, color=WOOD):
    return cf.lathe(profile, seg=seg, at=(x, -z, y0), color=color)


def gsphere(x, y, z, r, color, subdiv=1, scale=None):
    return cf.sphere(r, at=B(x, y, z), color=color, subdiv=subdiv, scale=scale)


def gtube(points, r, seg=6, color=STEEL, cap=True):
    return cf.tube([B(*p) for p in points], r, seg=seg, color=color, cap=cap)


def between(a, b, r, seg=6, color=STEEL):
    """Cilindro entre dos puntos del juego."""
    pa, pb = Vector(B(*a)), Vector(B(*b))
    d = pb - pa
    ob = cf.cylinder(r, d.length, seg, color=color)
    q = Vector((0, 0, 1)).rotation_difference(d.normalized())
    ob.rotation_mode = 'QUATERNION'
    ob.rotation_quaternion = q
    ob.location = pa
    cf.bake_transform(ob)
    return ob


def extrude_x(profile, x0, x1, color, name='perfil'):
    """
    Prisma a lo largo del eje x del juego: `profile` [(z, y), …] es la sección en el plano z-y del
    juego (cualquier sentido), extruida de x0 a x1.
    """
    bm = bmesh.new()
    vs = [bm.verts.new((x0, -z, y)) for z, y in profile]
    f = bm.faces.new(vs)
    ext = bmesh.ops.extrude_face_region(bm, geom=[f])
    top = [e for e in ext['geom'] if isinstance(e, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, vec=(x1 - x0, 0, 0), verts=top)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return cf.paint(cf._link(name, bm), color)


def soft(ob, bev=0.03, levels=1):
    """Cojín o almohada: bisel y una subdivisión (bordes blandos, facetado low-poly)."""
    cf.bevel(ob, bev, 1, angle=30)
    m = ob.modifiers.new('blando', 'SUBSURF')
    m.levels = levels
    m.render_levels = levels
    return cf.apply_modifiers(ob)


def deform(ob, fn):
    """Desplaza cada vértice: fn(x, y, z) del juego → (x, y, z) del juego."""
    for v in ob.data.vertices:
        x, y, z = v.co.x, v.co.z, -v.co.y
        nx, ny, nz = fn(x, y, z)
        v.co = (nx, -nz, ny)
    ob.data.update()
    return ob


def turned_leg(x, z, h, r, color=WOOD_DARK, seg=8, light=False):
    """Pata torneada: pie, cuello, bulbo, anillo y collarín (perfil de abajo arriba). `light`:
    perfil de menos anillos para piezas pequeñas (sillas, sofá)."""
    if light:
        p = [(0.0, 0.0), (r * 0.8, 0.0), (r * 1.1, h * 0.3), (r * 0.65, h * 0.6), (r * 0.95, h * 0.8), (r * 0.8, h), (0.0, h)]
    else:
        p = [
            (0.0, 0.0), (r * 0.75, 0.0), (r * 0.85, h * 0.06), (r * 0.6, h * 0.12), (r * 1.05, h * 0.3),
            (r * 1.1, h * 0.42), (r * 0.7, h * 0.55), (r * 0.62, h * 0.7), (r * 0.95, h * 0.78),
            (r * 0.95, h * 0.84), (r * 0.7, h * 0.88), (r * 0.8, h), (0.0, h),
        ]
    return glathe(x, 0, z, p, seg=seg, color=color)


def rails(points_y, x0, x1, z, r, color):
    return [gcylx(x0, x1, y, z, r, 6, color) for y in points_y]


def wood_jitter(objs, amount=0.06, seed=1):
    for i, o in enumerate(objs):
        cf.jitter_colors(o, amount, seed=seed + i)
    return objs


# ---------------------------------------------------------------- piezas de cama

def mattress(x0, x1, z0, z1, y0, y1, color=CANVAS):
    ob = gbox(x0, y0, z0, x1, y1, z1, color)
    cf.bevel(ob, 0.035, 2, angle=30)
    # costura: franja algo más oscura a media altura del canto
    cf.paint(ob, color, lambda p: abs(p.normal.z) < 0.4 and abs(p.center.z - (y0 + y1) / 2) < 0.02, f=0.88)
    return ob


def pillow(x0, x1, z0, z1, y0, y1, color=CLOTH_WHITE):
    ob = gbox(x0, y0, z0, x1, y1, z1, color)
    soft(ob, min(0.04, (y1 - y0) * 0.4), 1)
    # aplasta un poco las esquinas (almohada, no ladrillo)
    cx, cz = (x0 + x1) / 2, (z0 + z1) / 2
    hx, hz = (x1 - x0) / 2, (z1 - z0) / 2
    cy = (y0 + y1) / 2

    def f(x, y, z):
        k = (abs(x - cx) / hx) ** 2 * (abs(z - cz) / hz) ** 2
        return x, cy + (y - cy) * (1 - 0.55 * k), z
    return deform(ob, f)


def blanket(xa, xb, half_w, top, drop, color, cuff=CLOTH_WHITE, front_only=True, seed=1):
    """
    Manta sobre el colchón de xa a xb: arriba plana en y = `top`, cae por el frente (z−) hasta y =
    `drop` con un borde ondulado y, si no es `front_only`, también por detrás. Embozo blanco
    doblado en xa. Devuelve [manta, embozo].
    """
    t = 0.022
    zf = -half_w
    zb = half_w
    back_drop = drop if not front_only else top - 0.08
    # sección (z, y) por fuera, de detrás a delante
    prof = [
        (zb + 0.02, back_drop), (zb + 0.012, top - 0.05), (zb - 0.01, top - 0.005), (zb - 0.06, top),
        (zf + 0.06, top), (zf + 0.01, top - 0.005), (zf - 0.012, top - 0.05), (zf - 0.018, (top + drop) / 2), (zf - 0.024, drop),
    ]
    n = 7
    bm = bmesh.new()
    rows = []
    for i in range(n + 1):
        x = xa + (xb - xa) * i / n
        row = []
        for k, (z, y) in enumerate(prof):
            # borde ondulado: solo los vértices del faldón
            wave = 0.0
            if k == len(prof) - 1 or (k == 0 and not front_only):
                wave = 0.012 * math.sin(x * 5.5 + seed) + 0.006 * math.sin(x * 11.0 + 2 * seed)
            row.append(bm.verts.new(B(x, y + wave, z - (wave * 0.4 if k == len(prof) - 1 else 0))))
        rows.append(row)
    for i in range(n):
        a, b = rows[i], rows[i + 1]
        for k in range(len(prof) - 1):
            bm.faces.new((a[k], b[k], b[k + 1], a[k + 1]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = cf.paint(cf._link('manta', bm), color)
    m = ob.modifiers.new('grosor', 'SOLIDIFY')
    m.thickness = t
    m.offset = -1
    cf.apply_modifiers(ob)
    cf.paint(ob, color)
    # cuadrícula de pespuntes: caras alternas algo más oscuras
    cf.paint(ob, color, lambda p: p.normal.z > 0.6 and (int((p.center.x - xa) / ((xb - xa) / n)) % 2 == 0), f=0.92)
    # embozo: la sábana doblada sobre la manta en la cabecera
    cprof = [(zb - 0.02, top - 0.03), (zb - 0.02, top + 0.012), (zf + 0.0, top + 0.012), (zf - 0.03, top - 0.02), (zf - 0.035, top - 0.09)]
    cuff_ob = None
    bm = bmesh.new()
    rows = []
    for x in (xa - 0.13, xa - 0.06, xa + 0.005):
        rows.append([bm.verts.new(B(x, y + (0.012 if 0 < k < len(cprof) - 1 and x > xa - 0.1 else 0), z)) for k, (z, y) in enumerate(cprof)])
    for i in range(len(rows) - 1):
        for k in range(len(cprof) - 1):
            bm.faces.new((rows[i][k], rows[i + 1][k], rows[i + 1][k + 1], rows[i][k + 1]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    cuff_ob = cf.paint(cf._link('embozo', bm), cuff)
    m = cuff_ob.modifiers.new('grosor', 'SOLIDIFY')
    m.thickness = 0.02
    m.offset = -1
    cf.apply_modifiers(cuff_ob)
    cf.paint(cuff_ob, cuff)
    return [ob, cuff_ob]


def post(x, z, h, r, color=WOOD_DARK, finial=True, seg=8, subdiv=1):
    """Poste de cama torneado con remate de bola."""
    p = [(0.0, 0.0), (r * 1.15, 0.0), (r * 1.15, 0.05), (r * 0.9, 0.08), (r * 0.9, h - 0.12), (r * 1.15, h - 0.09), (r * 1.15, h - 0.05), (r * 0.7, h - 0.03), (0.0, h - 0.03)]
    parts = [glathe(x, 0, z, p, seg=seg, color=color)]
    if finial:
        parts.append(gsphere(x, h + 0.02, z, r * 1.25, color, subdiv=subdiv))
    return parts


# ---------------------------------------------------------------- modelos

def cama():
    """Cama del camarote (colisionador 1,0 × 0,5 × 0,55; colchón a 0,41; manta a 0,45)."""
    hx, hz = 1.0, 0.5
    y0 = 0.14
    parts = []
    # bastidor: largueros y travesaños biselados sobre patas torneadas
    frame = [
        gbox(-hx + 0.04, y0, -hz + 0.02, hx - 0.04, y0 + 0.12, -hz + 0.07, WOOD, 0.012),
        gbox(-hx + 0.04, y0, hz - 0.07, hx - 0.04, y0 + 0.12, hz - 0.02, WOOD, 0.012),
        gbox(-hx + 0.08, y0 + 0.06, -hz + 0.07, hx - 0.08, y0 + 0.1, hz - 0.07, WOOD_DARK),
    ]
    parts += wood_jitter(frame, 0.05, 11)
    # cabecero en arco con cuarterones y postes torneados (x = −hx), piecero bajo (x = +hx)
    head = extrude_x([(-hz + 0.04, 0.12), (hz - 0.04, 0.12), (hz - 0.04, 0.8), (hz * 0.55, 0.9), (0, 0.95), (-hz * 0.55, 0.9), (-hz + 0.04, 0.8)], -hx - 0.01, -hx + 0.05, WOOD)
    cf.bevel(head, 0.01)
    cf.jitter_colors(head, 0.05, 3)
    parts.append(head)
    for zc in (-0.2, 0.2):
        parts.append(gbox(-hx + 0.05, 0.38, zc - 0.15, -hx + 0.07, 0.74, zc + 0.15, WOOD_DARK, 0.006))
    foot = extrude_x([(-hz + 0.04, 0.12), (hz - 0.04, 0.12), (hz - 0.04, 0.56), (0, 0.6), (-hz + 0.04, 0.56)], hx - 0.06, hx, WOOD)
    cf.bevel(foot, 0.01)
    parts.append(foot)
    for zc in (-hz + 0.03, hz - 0.03):
        parts += post(-hx + 0.02, zc, 0.98, 0.04)
        parts += post(hx - 0.03, zc, 0.62, 0.035)
    # colchón (arriba en 0,41), manta (0,45) con embozo y almohada mullida
    parts.append(mattress(-hx + 0.07, hx - 0.07, -hz + 0.05, hz - 0.05, y0 + 0.11, y0 + 0.27))
    parts += blanket(-hx * 0.25, hx - 0.07, hz - 0.05, y0 + 0.31, y0 + 0.04, '#2a9d8f', seed=1)
    parts.append(pillow(-hx + 0.1, -hx + 0.5, -hz * 0.62, hz * 0.62, y0 + 0.25, y0 + 0.4))
    return cf.model(parts, 'prop_cama')


def litera():
    """Litera del dormitorio (1,0 × 0,5 × 1,9; colchones a 0,49 y 1,49)."""
    hx, hz, h = 1.0, 0.5, 1.9
    parts = []
    # cuatro postes torneados de suelo a remate
    for sx in (-1, 1):
        for sz in (-1, 1):
            parts += post(sx * (hx - 0.04), sz * (hz - 0.04), h - 0.02, 0.042, seg=6, subdiv=0)
    for y0, color, seed in ((0.22, '#457b9d', 4), (1.22, '#bc4749', 7)):
        frame = [
            gbox(-hx + 0.04, y0, -hz + 0.02, hx - 0.04, y0 + 0.12, -hz + 0.07, WOOD, 0.012),
            gbox(-hx + 0.04, y0, hz - 0.07, hx - 0.04, y0 + 0.12, hz - 0.02, WOOD, 0.012),
            gbox(-hx + 0.08, y0 + 0.06, -hz + 0.07, hx - 0.08, y0 + 0.1, hz - 0.07, WOOD_DARK),
        ]
        parts += wood_jitter(frame, 0.05, seed)
        parts.append(mattress(-hx + 0.08, hx - 0.07, -hz + 0.05, hz - 0.05, y0 + 0.11, y0 + 0.27))
        parts += blanket(-hx * 0.25, hx - 0.07, hz - 0.05, y0 + 0.31, y0 + 0.05, color, seed=seed)
        parts.append(pillow(-hx + 0.1, -hx + 0.48, -hz * 0.6, hz * 0.6, y0 + 0.25, y0 + 0.39))
        # cabecero de lamas entre los postes (x = −hx)
        for k in range(4):
            zc = -hz + 0.16 + k * (2 * hz - 0.32) / 3
            parts.append(gbox(-hx + 0.01, y0 + 0.28, zc - 0.05, -hx + 0.05, y0 + 0.5, zc + 0.05, WOOD))
        parts.append(gbox(-hx + 0.0, y0 + 0.5, -hz + 0.04, -hx + 0.06, y0 + 0.57, hz - 0.04, WOOD_DARK, 0.01))
    # piecero de la cama alta y barandilla con barrotes
    parts.append(gbox(hx - 0.06, 1.55, -hz + 0.04, hx, 1.62, hz - 0.04, WOOD_DARK, 0.01))
    parts.append(gbox(hx - 0.06, 1.74, -hz + 0.04, hx, 1.8, hz - 0.04, WOOD_DARK, 0.01))
    parts.append(gcylx(-hx + 0.08, hx * 0.38, 1.71, -hz + 0.015, 0.025, 6, WOOD_DARK))
    for k in range(5):
        x = -hx + 0.25 + k * 0.25
        if x < hx * 0.36:
            parts.append(gcyl(x, 1.5, -hz + 0.015, 0.014, 0.21, 5, WOOD))
    # escalerilla en el pie, por el frente, con peldaños redondos
    lx0, lx1 = hx - 0.42, hx - 0.08
    for x in (lx0, lx1):
        parts.append(gbox(x - 0.024, 0, -hz - 0.08, x + 0.024, h - 0.1, -hz - 0.03, WOOD_LIGHT, 0.008))
    for k in range(1, 6):
        parts.append(gcylx(lx0, lx1, k * 0.3 + 0.02, -hz - 0.055, 0.018, 6, WOOD_LIGHT))
    return cf.model(parts, 'prop_litera')


def baul():
    """Baúl del camarote (0,5 × 0,3 × 0,55): caja de tablas, tapa en bóveda, flejes y cerradura."""
    hx, hz, h = 0.5, 0.3, 0.55
    body = 0.36
    parts = []
    # tres tablas por cara (las juntas se leen gracias al bisel)
    for k in range(3):
        y0 = 0.02 + k * (body - 0.02) / 3
        b = gbox(-hx + 0.01, y0, -hz + 0.01, hx - 0.01, y0 + (body - 0.02) / 3, hz - 0.01, WOOD, 0.008)
        cf.jitter_colors(b, 0.07, 20 + k)
        parts.append(b)
    parts.append(gbox(-hx + 0.03, 0, -hz + 0.03, hx - 0.03, 0.03, hz - 0.03, WOOD_DARK))
    # tapa en bóveda (media elipse) con testeros más oscuros
    n = 8
    rise = h - body - 0.01
    arc = [(hz * math.cos(math.pi * i / n), body + 0.01 + rise * math.sin(math.pi * i / n)) for i in range(n + 1)]
    lid = extrude_x(arc, -hx + 0.005, hx - 0.005, WOOD)
    cf.paint(lid, WOOD_DARK, lambda p: abs(p.normal.x) > 0.7)
    cf.jitter_colors(lid, 0.05, 30)
    parts.append(lid)
    parts.append(gbox(-hx, body - 0.01, -hz - 0.005, hx, body + 0.015, hz + 0.005, WOOD_DARK, 0.006))
    # flejes de hierro: rodean la caja y la tapa
    for x in (-hx * 0.62, hx * 0.62):
        parts.append(gbox(x - 0.035, 0.0, -hz - 0.012, x + 0.035, body, hz + 0.012, IRON))
        band = [(1.035 * hz * math.cos(math.pi * i / n), body + 0.01 + (rise + 0.012) * math.sin(math.pi * i / n)) for i in range(n + 1)]
        inner = [(z * 0.94, body + 0.01 + (y - body - 0.01) * 0.9) for z, y in reversed(band)]
        parts.append(extrude_x(band + inner, x - 0.035, x + 0.035, IRON))
    # cantoneras de latón en las esquinas de la caja
    for sx in (-1, 1):
        for sz in (-1, 1):
            parts.append(gbox(sx * hx - 0.045 * (sx > 0) - 0.006 * (sx < 0), 0.0, sz * hz - 0.045 * (sz > 0) - 0.006 * (sz < 0), sx * hx + 0.006 * (sx > 0) + 0.045 * (sx < 0), 0.07, sz * hz + 0.006 * (sz > 0) + 0.045 * (sz < 0), BRASS))
    # cerradura con su aldaba y bocallave
    parts.append(gbox(-0.07, body - 0.15, -hz - 0.022, 0.07, body - 0.01, -hz, BRASS, 0.006))
    parts.append(gbox(-0.03, body - 0.04, -hz - 0.03, 0.03, body + 0.06, -hz - 0.012, BRASS, 0.004))
    parts.append(gbox(-0.008, body - 0.12, -hz - 0.024, 0.008, body - 0.07, -hz - 0.02, '#2b2118'))
    # asas laterales
    for sx in (-1, 1):
        ring = cf.torus(0.05, 0.01, seg=10, tube_seg=4, at=B(sx * (hx + 0.012), 0.24, 0), rot=(0, 90, 0), color=IRON)
        parts.append(ring)
        parts.append(gbox(sx * hx - 0.004, 0.25, -0.04, sx * hx + 0.012 * sx, 0.31, 0.04, IRON))
    return cf.model(parts, 'prop_baul')


def sofa():
    """Sofá de la sala común (1,1 × 0,45 × 0,9; asientos a 0,44 en x = ±0,55; respaldo en +z)."""
    hx, hz = 1.1, 0.45
    fabric = '#9b4a3c'
    dark = (0.78, 0.78, 0.78)
    parts = []
    fab_dark = cf.rgba(fabric, 0.62)

    def fd(ob):
        return cf.paint(ob, fabric, f=0.62)
    for sx in (-1, 1):
        for sz in (-1, 1):
            parts.append(gcyl(sx * (hx - 0.12), 0, sz * (hz - 0.1), 0.03, 0.1, 6, WOOD_DARK, r2=0.04))
    base = gbox(-hx + 0.03, 0.1, -hz + 0.04, hx - 0.03, 0.27, hz, fabric, 0.03, 2)
    cf.paint(base, fabric, f=0.62)
    parts.append(base)
    # cojines de asiento (dos plazas), mullidos
    for sx in (-1, 1):
        x0 = -hx + 0.21 if sx < 0 else 0.01
        x1 = -0.01 if sx < 0 else hx - 0.21
        c = gbox(x0, 0.25, -hz + 0.01, x1, 0.45, hz - 0.17, fabric)
        soft(c, 0.05, 1)
        parts.append(c)
    # respaldo con rulo superior y dos cojines inclinados
    back = gbox(-hx + 0.04, 0.26, hz - 0.2, hx - 0.04, 0.82, hz, fabric, 0.03, 2)
    cf.paint(back, fabric, f=0.62)
    parts.append(back)
    roll = gcylx(-hx + 0.06, hx - 0.06, 0.82, hz - 0.1, 0.1, 10, fabric)
    cf.paint(roll, fabric, f=0.7)
    parts.append(roll)
    for sx in (-1, 1):
        x0 = -hx + 0.22 if sx < 0 else 0.02
        x1 = -0.02 if sx < 0 else hx - 0.22
        c = gbox(x0, 0.44, hz - 0.33, x1, 0.8, hz - 0.18, fabric)
        soft(c, 0.05, 1)
        cf.paint(c, fabric, f=0.94)
        # inclinado hacia atrás
        deform(c, lambda x, y, z: (x, y, z + (y - 0.44) * 0.18))
        parts.append(c)
        # botones del capitoné
        for k in range(2):
            xb = (x0 + x1) / 2 + (k - 0.5) * 0.36
            parts.append(gsphere(xb, 0.66, hz - 0.31 + (0.66 - 0.44) * 0.18 - 0.012, 0.016, fabric, subdiv=0, scale=None))
    # brazos con rulo (el frente del rulo es el círculo que se ve de frente)
    for sx in (-1, 1):
        xa = sx * hx - (0.2 if sx > 0 else 0)
        xb = sx * hx + (0.2 if sx < 0 else 0)
        xa, xb = min(xa, xb), max(xa, xb)
        arm = gbox(xa, 0.26, -hz + 0.03, xb, 0.58, hz - 0.02, fabric, 0.025, 2)
        cf.paint(arm, fabric, f=0.62)
        parts.append(arm)
        r = gcylz((xa + xb) / 2 + sx * 0.005, 0.6, -hz + 0.0, hz - 0.02, 0.115, 10, fabric)
        parts.append(r)
        # botón del frente del rulo
        parts.append(gcylz((xa + xb) / 2 + sx * 0.005, 0.6, -hz - 0.012, -hz + 0.002, 0.04, 8, fabric))
        cf.paint(parts[-1], fabric, f=0.6)
    # vivo inferior
    parts.append(gbox(-hx + 0.02, 0.1, -hz + 0.02, hx - 0.02, 0.13, hz + 0.005, fabric))
    cf.paint(parts[-1], fabric, f=0.5)
    return cf.model(parts, 'prop_sofa')


def silla():
    """Silla de cocina y comedor (0,22 × 0,22; asiento a 0,45; respaldo en +z)."""
    hx = hz = 0.22
    seat = 0.45
    parts = []
    for sx in (-1, 1):
        parts.append(turned_leg(sx * (hx - 0.035), -hz + 0.035, seat - 0.04, 0.026, WOOD_DARK, seg=6, light=True))
        # pata trasera que sigue como poste del respaldo, algo echada hacia atrás
        parts.append(turned_leg(sx * (hx - 0.035), hz - 0.035, seat - 0.04, 0.026, WOOD_DARK, seg=6, light=True))
        parts.append(between((sx * (hx - 0.035), seat - 0.04, hz - 0.035), (sx * (hx - 0.03), seat + 0.5, hz + 0.02), 0.022, 6, WOOD_DARK))
        parts.append(gsphere(sx * (hx - 0.03), seat + 0.52, hz + 0.02, 0.026, WOOD_DARK, subdiv=0))
    # travesaños
    for z in (-hz + 0.035, hz - 0.035):
        parts.append(gcylx(-hx + 0.035, hx - 0.035, 0.14, z, 0.012, 4, WOOD_DARK))
    for sx in (-1, 1):
        parts.append(gcylz(sx * (hx - 0.035), 0.2, -hz + 0.035, hz - 0.035, 0.012, 4, WOOD_DARK))
    # asiento con el frente redondeado
    s = gbox(-hx, seat - 0.05, -hz, hx, seat, hz, WOOD, 0.015, 1)
    cf.jitter_colors(s, 0.05, 41)
    parts.append(s)
    # respaldo: travesaño curvo arriba y dos lamas
    for y0, y1, t in ((seat + 0.36, seat + 0.48, 0.035), (seat + 0.17, seat + 0.24, 0.025)):
        r = gbox(-hx + 0.02, y0, hz - 0.01, hx - 0.02, y1, hz - 0.01 + t, WOOD)
        bm = bmesh.new()
        bm.from_mesh(r.data)
        bmesh.ops.subdivide_edges(bm, edges=[e for e in bm.edges if abs(e.verts[0].co.x - e.verts[1].co.x) > 0.1], cuts=3, use_grid_fill=True)
        bm.to_mesh(r.data)
        bm.free()
        cf.paint(r, WOOD)
        zoff = (y0 - seat) * 0.12
        deform(r, lambda x, y, z, zoff=zoff: (x, y, z + zoff + 0.04 * (1 - (x / hx) ** 2)))
        parts.append(r)
    # cojín rojo atado
    c = gbox(-hx + 0.03, seat, -hz + 0.03, hx - 0.03, seat + 0.045, hz - 0.06, '#bc4749')
    cf.bevel(c, 0.018, 2, angle=30)
    parts.append(c)
    return cf.model(parts, 'prop_silla')


def mesa():
    """Mesa de cocina y comedor (0,9 × 0,6 × 0,8): tablero de tablas biseladas y patas torneadas."""
    hx, hz, top = 0.9, 0.6, 0.8
    parts = []
    n = 4
    w = 2 * hz / n
    for k in range(n):
        z0 = -hz + k * w
        b = gbox(-hx, top - 0.06, z0 + 0.002, hx, top, z0 + w - 0.002, WOOD_LIGHT, 0.008)
        cf.jitter_colors(b, 0.06, 50 + k)
        parts.append(b)
    # cantos del tablero (testeros)
    for sx in (-1, 1):
        parts.append(gbox(sx * hx - 0.03 * (sx > 0), top - 0.065, -hz, sx * hx + 0.03 * (sx < 0), top - 0.005, hz, WOOD_LIGHT, 0.008))
        cf.paint(parts[-1], WOOD_LIGHT, f=0.9)
    # faldón
    parts.append(gbox(-hx + 0.08, top - 0.16, -hz + 0.08, hx - 0.08, top - 0.06, -hz + 0.11, WOOD))
    parts.append(gbox(-hx + 0.08, top - 0.16, hz - 0.11, hx - 0.08, top - 0.06, hz - 0.08, WOOD))
    parts.append(gbox(-hx + 0.08, top - 0.16, -hz + 0.11, -hx + 0.11, top - 0.06, hz - 0.11, WOOD))
    parts.append(gbox(hx - 0.11, top - 0.16, -hz + 0.11, hx - 0.08, top - 0.06, hz - 0.11, WOOD))
    # patas torneadas con dado cuadrado arriba
    for sx in (-1, 1):
        for sz in (-1, 1):
            x, z = sx * (hx - 0.1), sz * (hz - 0.1)
            parts.append(turned_leg(x, z, top - 0.17, 0.045, WOOD_DARK, seg=8, light=True))
            parts.append(gbox(x - 0.045, top - 0.18, z - 0.045, x + 0.045, top - 0.06, z + 0.045, WOOD_DARK))
    return cf.model(parts, 'prop_mesa')


def barril():
    """Barril de agua (0,35 × 0,35 × 0,9): duelas abombadas, aros, tapa de tablas y grifo al frente."""
    r = 0.33
    h = 0.9
    prof = [(0.0, 0.02), (r * 0.82, 0.0), (r * 0.92, h * 0.2), (r, h * 0.5), (r * 0.92, h * 0.8), (r * 0.82, h), (r * 0.74, h), (r * 0.74, h - 0.025), (0.0, h - 0.025)]
    body = cf.lathe(prof, seg=14, color=WOOD)
    # duelas alternas algo más oscuras y tapa clara
    cf.paint(body, WOOD, lambda p: int((math.atan2(p.center.y, p.center.x) + math.pi) / (2 * math.pi / 14)) % 2 == 0, f=0.86)
    cf.paint(body, WOOD_LIGHT, lambda p: p.normal.z > 0.6)
    cf.jitter_colors(body, 0.06, 60)
    parts = [body]
    for f, w in ((0.1, 0.035), (0.33, 0.045), (0.67, 0.045), (0.9, 0.035)):
        y = h * f
        rr = r * (0.82 + 0.18 * (1 - abs(f - 0.5) * 2) ** 0.6) + 0.006
        parts.append(cf.lathe([(rr, y - w / 2), (rr + 0.008, y), (rr, y + w / 2)], seg=14, color=STEEL_DARK))
    # juntas de la tapa
    for k in (-1, 1):
        parts.append(gbox(-r * 0.7, h - 0.025, k * 0.09 - 0.006, r * 0.7, h - 0.02, k * 0.09 + 0.006, WOOD_DARK))
    parts.append(gcyl(r * 0.4, h - 0.02, 0, 0.04, 0.03, 6, WOOD_DARK))
    # grifo de latón en el frente (−z)
    parts.append(gcylz(0, 0.2, -r - 0.07, -r + 0.03, 0.022, 6, BRASS))
    parts.append(gcyl(0, 0.155, -r - 0.065, 0.016, 0.05, 6, BRASS))
    parts.append(gbox(-0.035, 0.235, -r - 0.07, 0.035, 0.25, -r - 0.045, BRASS))
    return cf.model(parts, 'prop_barril')


def fogon():
    """
    Fogón de la cocina (0,8 × 0,45 × 1,0; encimera a 0,96). Hogar a la izquierda con su puerta en
    x = −0,384 (anclaje firebox), olla en (−0,4, −0,02) y tetera en (0,12, −0,02) como el
    procedimental; tubo de humos en (0,58, 0,33) hasta el techo.
    """
    hx, hz = 0.8, 0.45
    top = 0.9
    parts = []
    # patas curvas de hierro colado
    for sx in (-1, 1):
        for sz in (-1, 1):
            x, z = sx * (hx - 0.07), sz * (hz - 0.07)
            parts.append(glathe(x, 0, z, [(0.0, 0.0), (0.05, 0.0), (0.05, 0.02), (0.03, 0.05), (0.034, 0.1), (0.045, 0.13), (0.0, 0.13)], seg=6, color=CAST))
    # cuerpo biselado con zócalo y cornisa
    bodyc = gbox(-hx, 0.12, -hz, hx, top, hz, IRON, 0.02, 2)
    cf.jitter_colors(bodyc, 0.04, 70)
    parts.append(bodyc)
    parts.append(gbox(-hx - 0.015, 0.12, -hz - 0.015, hx + 0.015, 0.17, hz + 0.01, CAST, 0.01))
    plate = gbox(-hx - 0.04, top, -hz - 0.04, hx + 0.04, top + 0.06, hz + 0.02, CAST, 0.015, 2)
    parts.append(plate)
    # barandilla de latón al frente de la encimera
    parts.append(gcylx(-hx, hx, top - 0.045, -hz - 0.085, 0.014, 6, BRASS))
    for x in (-hx + 0.02, hx - 0.02):
        parts.append(gcylz(x, top - 0.045, -hz - 0.09, -hz + 0.005, 0.01, 5, BRASS))
    # hornillas con aros concéntricos
    for x in (-hx * 0.5, hx * 0.15):
        parts.append(gcyl(x, top + 0.06, -0.02, 0.2, 0.012, 12, '#4a4f55'))
        parts.append(cf.torus(0.13, 0.008, seg=12, tube_seg=3, at=B(x, top + 0.072, -0.02), color=CAST))
    # puerta del hogar: marco, rejilla de tiro con ranuras y tirador
    fx = -hx * 0.48
    parts.append(gbox(fx - 0.28, 0.27, -hz - 0.025, fx + 0.28, 0.67, -hz, CAST, 0.01))
    parts.append(gbox(fx - 0.24, 0.31, -hz - 0.035, fx + 0.24, 0.63, -hz - 0.02, '#23272b', 0.008))
    for k in range(5):
        parts.append(gbox(fx - 0.2 + k * 0.09, 0.34, -hz - 0.045, fx - 0.16 + k * 0.09, 0.44, -hz - 0.03, '#141618'))
    parts.append(gcylx(fx + 0.12, fx + 0.22, 0.55, -hz - 0.06, 0.012, 5, BRASS))
    # puerta del horno con marco moldurado y barra de latón
    ox0, ox1 = hx * 0.12, hx - 0.08
    parts.append(gbox(ox0, 0.23, -hz - 0.025, ox1, 0.75, -hz, CAST, 0.01))
    parts.append(gbox(ox0 + 0.05, 0.3, -hz - 0.035, ox1 - 0.05, 0.66, -hz - 0.02, '#353a3f', 0.01))
    parts.append(gcylx(ox0 + 0.05, ox1 - 0.05, 0.785, -hz - 0.06, 0.014, 6, BRASS))
    for x in (ox0 + 0.07, ox1 - 0.07):
        parts.append(gcylz(x, 0.785, -hz - 0.06, -hz, 0.01, 5, BRASS))
    # olla con asas y tapa (anclaje pot a 1,26)
    px = -hx * 0.5
    pot = glathe(px, top + 0.075, -0.02, [(0.0, 0.0), (0.17, 0.0), (0.19, 0.03), (0.195, 0.2), (0.205, 0.235), (0.18, 0.235), (0.18, 0.05), (0.0, 0.05)], seg=12, color='#5c6770')
    parts.append(pot)
    parts.append(glathe(px, top + 0.29, -0.02, [(0.0, 0.0), (0.2, 0.0), (0.2, 0.015), (0.15, 0.04), (0.04, 0.05), (0.035, 0.075), (0.0, 0.08)], seg=12, color='#6c757d'))
    for sx in (-1, 1):
        parts.append(cf.torus(0.04, 0.009, seg=8, tube_seg=3, at=B(px + sx * 0.215, top + 0.27, -0.02), rot=(90, 0, 0), color=CAST))
    # tetera roja abombada con pitorro y asa (anclaje kettle en la punta del pitorro)
    kx = hx * 0.15
    parts.append(glathe(kx, top + 0.075, -0.02, [(0.0, 0.0), (0.1, 0.0), (0.125, 0.04), (0.125, 0.09), (0.1, 0.14), (0.05, 0.165), (0.04, 0.18), (0.0, 0.18)], seg=10, color='#c8553d'))
    parts.append(gtube([(kx + 0.1, top + 0.12, -0.02), (kx + 0.17, top + 0.15, -0.02), (kx + 0.22, top + 0.22, -0.02), (kx + 0.245, top + 0.24, -0.02)], 0.02, seg=5, color='#c8553d'))
    parts.append(gtube([(kx - 0.07, top + 0.2, -0.02), (kx - 0.05, top + 0.28, -0.02), (kx + 0.05, top + 0.28, -0.02), (kx + 0.07, top + 0.2, -0.02)], 0.011, seg=4, color=CAST))
    parts.append(gsphere(kx, top + 0.265, -0.02, 0.022, CAST, subdiv=0))
    # tubo de humos con registro y abrazadera de latón hasta el techo (3 m)
    fx2, fz2 = hx - 0.22, hz - 0.12
    parts.append(gcyl(fx2, top + 0.06, fz2, 0.11, 0.08, 10, CAST))
    parts.append(gcyl(fx2, top + 0.14, fz2, 0.095, 3.0 - top - 0.14, 10, '#2b2f33'))
    parts.append(gcyl(fx2, top + 0.7, fz2, 0.115, 0.05, 10, BRASS))
    parts.append(gcyl(fx2, 2.2, fz2, 0.105, 0.04, 10, CAST))
    parts.append(gcylx(fx2 - 0.16, fx2 + 0.16, top + 0.45, fz2, 0.01, 5, CAST))
    parts.append(gsphere(fx2 - 0.17, top + 0.45, fz2, 0.025, BRASS, subdiv=0))
    # trapo colgado de la barandilla
    cloth = gbox(-0.1, top - 0.3, -hz - 0.1, 0.12, top - 0.04, -hz - 0.085, '#e9c46a')
    deform(cloth, lambda x, y, z: (x, y, z - 0.01 * math.sin(x * 25)))
    parts.append(cloth)
    return cf.model(parts, 'prop_fogon')


def build():
    cama()
    litera()
    baul()
    sofa()
    silla()
    mesa()
    barril()
    fogon()
