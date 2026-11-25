# Interior visible a través de los vidrios: carcasa interna (puertas, techo, pilares), butacas,
# banqueta, tablero con instrumentos y pantalla, volante, consola, piso y bandeja trasera.
import math
import bpy
import bmesh
from mathutils import Vector
from . import parts as P
from .cut import vnormal


def inner_shell(bm_body, region, mats_keep, thick=0.032):
    """Copia de la carrocería del habitáculo, corrida hacia adentro y dada vuelta."""
    bm = bm_body.copy()
    lp = bm.verts.layers.float_vector['p3']
    y0, y1, z0 = region
    drop = []
    for f in bm.faces:
        c = f.calc_center_median()
        keep = f.material_index in mats_keep and y0 < c.y < y1 and c.z > z0 and f.normal.z > -0.5
        if not keep:
            drop.append(f)
    bmesh.ops.delete(bm, geom=drop, context='FACES')
    bm.normal_update()
    moves = []
    for v in bm.verts:
        n = Vector((0, 0, 0))
        for f in v.link_faces:
            n += f.normal * f.calc_area()
        if n.length > 1e-12:
            moves.append((v, n.normalized()))
    for v, n in moves:
        v.co = v.co - n * thick
    bmesh.ops.reverse_faces(bm, faces=list(bm.faces))
    for f in bm.faces:
        f.material_index = 0
        f.smooth = True
    me = bpy.data.meshes.new('inner_shell')
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new('inner_shell', me)
    bpy.context.scene.collection.objects.link(ob)
    ob.data.materials.append(P.mat('inner'))
    # es oscura y se ve poco: con un cuarto de los triángulos alcanza
    dec = ob.modifiers.new('dec', 'DECIMATE')
    dec.ratio = 0.25
    dec.use_symmetry = True
    dec.symmetry_axis = 'X'
    return ob


def seat(x, yh, zh, w=0.5, mat='seat'):
    o = []
    # almohadón con laterales
    o.append(P.box('seat_cush', (w * 0.78, 0.50, 0.11), (x, yh + 0.05, zh - 0.05), mat, rot=(math.radians(6), 0, 0), bevel=0.04))
    for s in (-1, 1):
        o.append(P.box('seat_bol', (0.085, 0.46, 0.09), (x + s * w * 0.42, yh + 0.05, zh - 0.02), mat, rot=(math.radians(6), 0, 0), bevel=0.035))
    # respaldo inclinado con laterales y apoyacabezas
    o.append(P.box('seat_back', (w * 0.80, 0.11, 0.60), (x, yh - 0.22, zh + 0.29), mat, rot=(math.radians(-17), 0, 0), bevel=0.045))
    for s in (-1, 1):
        o.append(P.box('seat_bback', (0.09, 0.14, 0.52), (x + s * w * 0.43, yh - 0.19, zh + 0.27), mat, rot=(math.radians(-17), 0, 0), bevel=0.04))
    o.append(P.box('seat_head', (0.25, 0.09, 0.17), (x, yh - 0.36, zh + 0.69), mat, rot=(math.radians(-10), 0, 0), bevel=0.04))
    return o


def build(D, bm_body, info):
    I = D.get('interior', {})
    hip = I.get('hip', 0.50)
    yh = I.get('front_y', -0.18)
    xs = I.get('front_x', 0.37)
    yr = I.get('rear_y', -1.06)
    objs = []
    from .shell import M_PAINT, M_TRIM, M_FRAME, M_GAP
    objs.append(inner_shell(bm_body, I.get('region', (-1.72, 0.64, 0.33)), (M_PAINT, M_TRIM, M_FRAME, M_GAP)))
    for sx in (-1, 1):
        objs += seat(sx * xs, yh, hip)
    # banqueta trasera (no en biplazas ni en furgones de carga)
    if I.get('rear', True):
        bw = I.get('bench_w', 1.30)
        objs.append(P.box('bench_c', (bw, 0.50, 0.12), (0, yr + 0.04, hip - 0.02), 'seat', rot=(math.radians(6), 0, 0), bevel=0.045))
        objs.append(P.box('bench_b', (bw, 0.12, 0.56), (0, yr - 0.27, hip + 0.28), 'seat', rot=(math.radians(-24), 0, 0), bevel=0.05))
        for x in (-0.42, 0.0, 0.42):
            objs.append(P.box('bench_h', (0.22, 0.08, 0.13), (x * bw / 1.3, yr - 0.39, hip + 0.63), 'seat', rot=(math.radians(-18), 0, 0), bevel=0.035))
    if I.get('partition'):
        py, pz = I['partition']
        objs.append(P.box('partition', (1.70, 0.03, pz), (0, py, 0.30 + pz / 2), 'inner'))
    # tablero, instrumentos y pantalla central
    dy = I.get('dash_y', 0.50)
    dz = I.get('dash_z', 0.935)
    objs.append(P.box('dash', (1.48, 0.40, 0.24), (0, dy, dz - 0.12), 'dash', bevel=0.06))
    objs.append(P.box('dash_top', (1.40, 0.30, 0.04), (0, dy + 0.03, dz - 0.005), 'dash', bevel=0.018))
    objs.append(P.box('binnacle', (0.38, 0.12, 0.10), (-xs, dy - 0.15, dz + 0.01), 'dash', bevel=0.035))
    objs.append(P.box('cluster', (0.30, 0.01, 0.075), (-xs, dy - 0.213, dz - 0.005), 'screen', rot=(math.radians(-12), 0, 0), bevel=0.004))
    objs.append(P.box('screen', (0.30, 0.016, 0.17), (0, dy - 0.21, dz - 0.03), 'screen', rot=(math.radians(-14), 0, 0), bevel=0.008))
    for x in (-0.62, -0.13, 0.13, 0.62):
        objs.append(P.box('vent', (0.11, 0.02, 0.045), (x, dy - 0.205, dz - 0.10), 'trim_gloss', bevel=0.008))
    # volante del conductor (izquierda = -X)
    sw = Vector((-xs, dy - 0.32, dz - 0.06))
    tilt = math.radians(66)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.182, minor_radius=0.017, major_segments=36, minor_segments=10,
                                     location=sw, rotation=(tilt, 0, 0))
    w = bpy.context.active_object
    w.name = 'steer_ring'
    w.data.materials.append(P.mat('dash'))
    for p in w.data.polygons:
        p.use_smooth = True
    objs.append(w)
    hub_a = sw
    hub_b = sw + Vector((0, 0.06, -0.02))
    objs += P.cylinder('steer_hub', hub_b, hub_a, 0.058, 0.062, 'dash', 24, True, True)
    for ang in (0, 180, 270):
        a = math.radians(ang)
        d = Vector((math.cos(a), math.sin(a) * math.cos(tilt), math.sin(a) * math.sin(tilt)))
        p0 = sw + d * 0.05
        p1 = sw + d * 0.17
        objs.append(P.tube('steer_spoke', [p0, p1], 0.012, 'dash', 6))
    objs += P.cylinder('steer_col', sw + Vector((0, 0.05, -0.02)), Vector((-xs, dy - 0.05, dz - 0.16)), 0.035, 0.045, 'dash', 14)
    # consola central y palanca
    objs.append(P.box('console', (0.21, 0.86, 0.20), (0, yh + 0.12, hip - 0.08), 'dash', bevel=0.04))
    objs.append(P.box('console_f', (0.24, 0.20, 0.40), (0, dy - 0.15, dz - 0.36), 'dash', bevel=0.04))
    objs.append(P.box('armrest', (0.19, 0.30, 0.06), (0, yh - 0.12, hip + 0.06), 'seat', bevel=0.025))
    objs.append(P.box('shifter', (0.035, 0.05, 0.08), (0, yh + 0.32, hip + 0.05), 'trim_gloss', bevel=0.012))
    # piso, panel parallamas y bandeja trasera
    fz = I.get('floor_z', 0.27)
    fy0, fy1 = I.get('floor_y', (dy + 0.18, yr - 0.55))
    objs.append(P.box('floor', (1.56, abs(fy0 - fy1), 0.02), (0, (fy0 + fy1) / 2, fz), 'carpet'))
    objs.append(P.box('firewall', (1.50, 0.02, max(0.2, dz - 0.25 - fz)), (0, dy + 0.18, (fz + dz - 0.25) / 2), 'carpet'))
    if I.get('shelf_y') is not False:
        pz = I.get('shelf_z', 1.03)
        py = I.get('shelf_y', (-1.42, -1.98))
        objs.append(P.box('shelf', (1.40, abs(py[1] - py[0]), 0.02), (0, (py[0] + py[1]) / 2, pz), 'carpet'))
    meta = {'seat': {'x': xs, 'hip': hip, 'z': yh}}
    return objs, meta
