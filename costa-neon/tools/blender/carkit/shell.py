# Operaciones de carrocería sobre la media malla: arcos de rueda con pestaña, vidrios con marco,
# pilares, juntas de paneles y materiales por zona.
import math
import bmesh
from mathutils import Vector
from .cut import Ctx, Space, cut, select, groove, inset, push, boundary_edges, point_in_poly

# índices de material de la carrocería
M_PAINT, M_UNDER, M_GLASS, M_FRAME, M_TRIM, M_CHROME, M_GAP = range(7)
MAT_NAMES = ['paint', 'under', 'glass', 'frame', 'trim', 'chrome', 'gap']


def circle(cy, cz, R, n=64, a0=0.0, a1=2 * math.pi):
    return [(cy + R * math.cos(a0 + (a1 - a0) * i / n), cz + R * math.sin(a0 + (a1 - a0) * i / n)) for i in range(n)]


def wheel_arch(C, ya, R, wr, lip=0.032):
    """Abre el arco de rueda en la vista lateral y el hueco del piso; la chapa se dobla hacia adentro."""
    side = Space('side')
    top = Space('top')
    ring = circle(ya, wr, R, 72)

    def ff(f):
        n = C.normal(f)
        c = C.center(f)
        return n.x > 0.2 and abs(c.y - ya) < R + 0.15 and c.z < wr + R + 0.12
    cut(C, side, ring, True, ff)
    hole = select(C, side, ring, ff)
    rect = [(0.5, ya - R * 0.95), (1.3, ya - R * 0.95), (1.3, ya + R * 0.95), (0.5, ya + R * 0.95)]

    def fb(f):
        return C.normal(f).x <= 0.2 and C.center(f).z < 0.45
    cut(C, top, rect, True, fb)
    hole += select(C, top, rect, fb)
    bmesh.ops.delete(C.bm, geom=list(set(hole)), context='FACES')
    # pestaña: los bordes laterales del hueco se extruyen hacia adentro
    bnd = []
    for e in C.bm.edges:
        if not e.is_boundary:
            continue
        m = (e.verts[0][C.lp] + e.verts[1][C.lp]) / 2
        if abs(m.y - ya) > R + 0.03 or m.z > wr + R + 0.03 or m.x < 0.4:
            continue
        if C.normal(e.link_faces[0]).x <= 0.2:
            continue
        bnd.append(e)
    res = bmesh.ops.extrude_edge_only(C.bm, edges=bnd)
    nv = [g for g in res['geom'] if isinstance(g, bmesh.types.BMVert)]
    for v in nv:
        p = v.co.copy()
        d = Vector((0.0, p.y - ya, p.z - wr))
        d = d.normalized() if d.length > 1e-6 else Vector((0, 0, 1))
        C.setco(v, Vector((p.x - lip, p.y + d.y * 0.012, p.z + d.z * 0.012)))
    for g in res['geom']:
        if isinstance(g, bmesh.types.BMFace):
            g.material_index = M_PAINT
            g.smooth = True
    return nv


def classify_base(C):
    """Piso oscuro; el resto pintura."""
    for f in C.bm.faces:
        s, t = C.st(f)
        f.material_index = M_UNDER if t < 1.0 else M_PAINT
        f.smooth = True


def glass_region(C, space, poly, ffilter, frame=0.018, recess=0.008):
    cut(C, space, poly, True, ffilter)
    faces = select(C, space, poly, ffilter)
    for f in faces:
        f.material_index = M_GLASS
    fr = inset(C, faces, frame, 0.0, M_FRAME)
    push(C, faces, recess)
    return faces, fr


def glass_cut(C, space, poly, ffilter, frame=0.02, recess=0.008, t_frames=()):
    """Vidrio con marco por cortes exactos (sin inset): contorno, contorno interior y franjas de la banda
    (t_frames: [(ta, tb)] a lo largo de los pilares). El vidrio se hunde; el marco queda como chaflán."""
    from .features import shrink
    from .cut import point_in_poly
    cut(C, space, poly, True, ffilter)
    inner = shrink(poly, frame, sym=space.kind in ('top', 'front'))
    cut(C, space, inner, True, ffilter)
    inside = lambda f: ffilter(f) and point_in_poly(C.center2(space, f), poly)
    par = Space('param')
    for (ta, tb) in t_frames:
        ss = [C.st(f)[0] for f in C.bm.faces if inside(f)]
        if ss:
            cut(C, par, [(min(ss) - 1.0, tb), (max(ss) + 1.0, tb)], False, inside)
    glass, frm = [], []
    for f in C.bm.faces:
        if not inside(f):
            continue
        t = C.st(f)[1]
        in_band = any(min(ta, tb) < t < max(ta, tb) for (ta, tb) in t_frames)
        if point_in_poly(C.center2(space, f), inner) and not in_band:
            glass.append(f)
            f.material_index = M_GLASS
        else:
            frm.append(f)
            f.material_index = M_FRAME
    push(C, glass, recess)
    return glass, frm


def greenhouse(C, G):
    """Ventanillas laterales, parabrisas y luneta según el diseño G (en espacio de parámetros / planta)."""
    par = Space('param')
    top = Space('top')
    band = lambda f: 4.999 < C.st(f)[1] < 6.001 and C.normal(f).x > 0.05
    out = {}
    # ventanilla delantera (del pilar B al pie del pilar A) y trasera (del pilar C al pilar B)
    b0, b1 = G['bpillar']
    a = G['a_base']
    c0, c1 = G['c_edge']
    front = [(b1, 5.0), (a, 5.0), (a, 6.0), (b1, 6.0)]
    rear = [(c0, 5.0), (b0, 5.0), (b0, 6.0), (c1, 6.0)]
    out['side_f'] = glass_region(C, par, front, band)
    if abs(c0 - b0) > 1e-3 or abs(c1 - b0) > 1e-3:
        out['side_r'] = glass_region(C, par, rear, band)
    if 'quarter' in G:
        # ventanilla fija detrás de la puerta trasera (con pilar negro entre ambas)
        q = G['quarter']
        out['quarter'] = glass_region(C, par, q, band)
        cp = [(c0 - 0.0001, 5.0), (q[0][0], 5.0), (q[3][0], 6.0), (c1 - 0.0001, 6.0)]
        cut(C, par, cp, True, band)
        for f in select(C, par, cp, band):
            if f.material_index == M_PAINT:
                f.material_index = M_TRIM
    # pilar B negro brillante
    pil = [(b0, 5.0), (b1, 5.0), (b1, 6.0), (b0, 6.0)]
    cut(C, par, pil, True, band)
    for f in select(C, par, pil, band):
        f.material_index = M_TRIM
    # parabrisas y luneta (vista superior, sólo caras del techo)
    topf = lambda f: f.material_index in (M_PAINT, M_FRAME, M_GLASS) and C.st(f)[1] > 6.0 - 1e-4 and C.normal(f).z > 0.05
    dt = G.get('pillar_frame_t', 0.03)
    if G.get('ws_space') != 'front':
        # el borde inferior del parabrisas nunca pasa por delante del pie del pilar A (si no, toma caras del capó)
        n = len(G['ws_poly']) // 2
        G = dict(G, ws_poly=G['ws_poly'][:n] + [(x, max(y, a)) for (x, y) in G['ws_poly'][n:]])
    if G.get('ws_space') == 'front':
        # parabrisas casi vertical (furgón): se corta en vista frontal sobre las caras que miran adelante
        fr = Space('front')
        frf = lambda f: f.material_index in (M_PAINT, M_FRAME, M_GLASS) and C.st(f)[1] > 6.0 - 1e-4 and C.normal(f).y > 0.05
        out['ws'] = glass_cut(C, fr, G['ws_poly'], frf, G.get('ws_frame', 0.022), 0.008, [(6.0, 6.0 + dt)])
    else:
        out['ws'] = glass_cut(C, top, G['ws_poly'], topf, G.get('ws_frame', 0.022), 0.008, [(6.0, 6.0 + dt)])
    if G.get('rw_kind', 'top') == 'none':
        pass
    elif G.get('rw_kind', 'top') == 'top':
        out['rw'] = glass_cut(C, top, G['rw_poly'], topf, G.get('rw_frame', 0.022), 0.008, [(6.0, 6.0 + dt)])
    else:
        # portón (hatch): la luneta está en la banda P5-P6 de la cola, se corta en vista trasera
        rear = Space('front')
        rb = lambda f: f.material_index in (M_PAINT, M_FRAME, M_GLASS) and 4.999 < C.st(f)[1] < 6.001 and C.normal(f).y < -0.02 and C.center(f).y < C.body.y_rc + 0.05
        out['rw'] = glass_cut(C, rear, G['rw_poly'], rb, G.get('rw_frame', 0.02), 0.008, [(5.0, 5.0 + G.get('belt_frame_t', 0.06))])
    return out


def mirror_bm(bm):
    """Espeja la media malla (x → -x) y suelda el eje."""
    lp = bm.verts.layers.float_vector['p3']
    geom = list(bm.verts) + list(bm.edges) + list(bm.faces)
    res = bmesh.ops.duplicate(bm, geom=geom)
    newv = [g for g in res['geom'] if isinstance(g, bmesh.types.BMVert)]
    newf = [g for g in res['geom'] if isinstance(g, bmesh.types.BMFace)]
    for v in newv:
        v.co.x = -v.co.x
        p = v[lp]
        v[lp] = (-p[0], p[1], p[2])
    bmesh.ops.reverse_faces(bm, faces=newf)
    axis = [v for v in bm.verts if abs(v.co.x) < 1e-5]
    bmesh.ops.remove_doubles(bm, verts=axis, dist=1e-5)
