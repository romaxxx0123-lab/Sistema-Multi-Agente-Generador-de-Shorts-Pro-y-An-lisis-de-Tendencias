# Parrillas y tomas como piezas 3D: marco con volumen que tapa el borde del corte, barras con espesor y
# profundidad, y mallas (panal / rombos) hechas con paredes reales. Detrás queda la cavidad oscura.
import math
import bmesh
from mathutils import Vector
from . import parts as P
from .styles import surface
from .cut import point_in_poly


def full_outline(poly):
    """Contorno simétrico completo a partir de la mitad derecha (x >= 0)."""
    right = [(max(0.0, x), z) for (x, z) in poly]
    left = [(-x, z) for (x, z) in reversed(right) if x > 1e-4]
    return right + left


def dense(loop, step):
    out = []
    n = len(loop)
    for i in range(n):
        a, b = loop[i], loop[(i + 1) % n]
        L = math.hypot(b[0] - a[0], b[1] - a[1])
        k = max(1, int(L / step))
        for j in range(k):
            t = j / k
            out.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
    return out


def x_range(loop, z):
    xs = []
    n = len(loop)
    for i in range(n):
        (x0, z0), (x1, z1) = loop[i], loop[(i + 1) % n]
        if (z0 - z) * (z1 - z) <= 0 and z0 != z1:
            xs.append(x0 + (x1 - x0) * (z - z0) / (z1 - z0))
    return (min(xs), max(xs)) if len(xs) >= 2 else None


def z_range(loop, x):
    zs = []
    n = len(loop)
    for i in range(n):
        (x0, z0), (x1, z1) = loop[i], loop[(i + 1) % n]
        if (x0 - x) * (x1 - x) <= 0 and x0 != x1:
            zs.append(z0 + (z1 - z0) * (x - x0) / (x1 - x0))
    return (min(zs), max(zs)) if len(zs) >= 2 else None


def frame3d(cbvh, body, kind, poly, w, d, mat, step=0.012):
    """Marco que recorre el contorno (cerrado) apoyado en la superficie original."""
    loop = dense(full_outline(poly), step)
    path, nrm = [], []
    for (x, z) in loop:
        fr = surface(cbvh, body, kind, x, z, mirror_half=True)
        if fr is None:
            continue
        path.append(fr.o - fr.n * 0.002)
        nrm.append(fr.n)
    if len(path) < 4:
        return []
    return [P.sweep('grille_frame', path, nrm, P.rrect(w, d, 0.4, 3), mat, closed=True)]


def bars(cbvh, body, kind, poly, values, inset, size, depth, mat, vertical=False, margin=0.004):
    """Barras horizontales (o verticales) con sección redondeada, curvadas como la superficie."""
    loop = full_outline(poly)
    objs = []
    for v in values:
        rng = z_range(loop, v) if vertical else x_range(loop, v)
        if not rng:
            continue
        a, b = rng[0] + margin, rng[1] - margin
        path, nrm = [], []
        for k in range(25):
            u = a + (b - a) * k / 24
            x, z = (v, u) if vertical else (u, v)
            fr = surface(cbvh, body, kind, x, z, mirror_half=True)
            if fr is None:
                continue
            path.append(fr.o - fr.n * (inset + depth))
            nrm.append(fr.n)
        if len(path) > 2:
            objs.append(P.sweep('grille_bar', path, nrm, P.rrect(size, depth, 0.45, 3), mat))
    return objs


def cells3d(cbvh, body, kind, poly, pitch, shape, inset, depth, web, mat):
    """Malla de celdas con paredes (cara frontal anular + paredes internas y externas)."""
    loop = full_outline(poly)
    xs = [p[0] for p in loop]
    zs = [p[1] for p in loop]
    x0, x1, z0, z1 = min(xs), max(xs), min(zs), max(zs)
    fwd = Vector((0.0, 1.0 if kind == 'front' else -1.0, 0.0))
    k = 6 if shape == 'hex' else 4
    rad = pitch * (0.5 if shape == 'hex' else 0.58)
    dz = pitch * (0.866 if shape == 'hex' else 0.5)
    dx = pitch if shape == 'hex' else pitch * 0.82
    ang0 = math.pi / 6 if shape == 'hex' else math.pi / 2
    sq = 1.0 if shape == 'hex' else 0.62
    verts, faces = [], []
    r = 0
    z = z0 + rad * 0.9
    while z < z1:
        off = (dx / 2) if (r % 2) else 0.0
        x = -math.ceil((-x0) / dx) * dx + off
        while x < x1:
            # sólo celdas enteras dentro del contorno
            inside = point_in_poly((x, z), loop) and all(
                point_in_poly((x + rad * 0.85 * math.cos(a), z + rad * 0.85 * math.sin(a) * sq), loop)
                for a in [ang0 + 2 * math.pi * i / k for i in range(k)])
            if inside:
                fr = surface(cbvh, body, kind, x, z, mirror_half=True)
                if fr is not None:
                    c = fr.o - fr.n * inset
                    ring_o = [c + Vector((rad * math.cos(a), 0.0, rad * math.sin(a) * sq)) for a in [ang0 + 2 * math.pi * i / k for i in range(k)]]
                    ring_i = [c + (p - c) * (1 - web / rad) for p in ring_o]
                    back_o = [p - fwd * depth for p in ring_o]
                    back_i = [p - fwd * depth for p in ring_i]
                    b0 = len(verts)
                    verts += ring_o + ring_i + back_o + back_i
                    for i in range(k):
                        j = (i + 1) % k
                        o0, o1 = b0 + i, b0 + j
                        i0, i1 = b0 + k + i, b0 + k + j
                        bo0, bo1 = b0 + 2 * k + i, b0 + 2 * k + j
                        bi0, bi1 = b0 + 3 * k + i, b0 + 3 * k + j
                        faces.append((o0, o1, i1, i0))      # cara frontal
                        faces.append((i0, i1, bi1, bi0))    # pared interna
                        faces.append((o1, o0, bo0, bo1))    # pared externa
            x += dx
        z += dz
        r += 1
    if not faces:
        return []
    ob = P.obj_from('grille_cells', verts, faces, mat, smooth=False)
    # orientar: frente hacia afuera, paredes internas hacia el centro de su celda
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bm.normal_update()
    for f in bm.faces:
        cf = f.calc_center_median()
        if abs(f.normal.dot(fwd)) > 0.7:
            if f.normal.dot(fwd) < 0:
                f.normal_flip()
    bm.to_mesh(ob.data)
    bm.free()
    return [ob]


def build(D, body, cbvh, g, kind='front'):
    """Parrilla o toma completa según g: marco, relleno y travesaños."""
    poly = g['poly']
    objs = []
    fr_spec = g.get('frame')
    if fr_spec:
        objs += frame3d(cbvh, body, kind, poly, fr_spec['w'], fr_spec['d'], fr_spec['mat'])
    ins = g.get('insert', 'hbars')
    inset = g.get('inset', 0.012)
    loop = full_outline(poly)
    zs = [p[1] for p in loop]
    xs = [p[0] for p in loop]
    if ins == 'hbars':
        n = g.get('count', 5)
        z0, z1 = min(zs), max(zs)
        vals = [z0 + (z1 - z0) * (i + 0.5) / n for i in range(n)]
        objs += bars(cbvh, body, kind, poly, vals, inset, g.get('bar', 0.012), g.get('bar_d', 0.02), g.get('bar_mat', 'chrome'))
        if g.get('mesh_behind'):
            objs += cells3d(cbvh, body, kind, poly, g.get('pitch', 0.022), 'hex', inset + 0.03, 0.012, 0.003, 'trim_gloss')
    elif ins == 'vbars':
        pitch = g.get('pitch', 0.045)
        x1 = max(xs)
        vals = []
        x = pitch / 2
        while x < x1 - pitch * 0.4:
            vals += [x, -x]
            x += pitch
        objs += bars(cbvh, body, kind, poly, vals, inset, g.get('bar', 0.014), g.get('bar_d', 0.022), g.get('bar_mat', 'chrome'), vertical=True)
    elif ins in ('honeycomb', 'mesh'):
        objs += cells3d(cbvh, body, kind, poly, g.get('pitch', 0.03), 'hex' if ins == 'honeycomb' else 'diamond',
                        inset, g.get('cell_d', 0.018), g.get('web', 0.0035), g.get('cell_mat', 'trim_gloss'))
    for (z, size, depth, mat) in g.get('crossbars', []):
        objs += bars(cbvh, body, kind, poly, [z], max(0.0, inset - 0.012), size, depth, mat)
    return objs
