# Rasgos tallados en la carrocería: juntas de paneles, aberturas con profundidad (ópticas, parrilla,
# tomas), huecos (manijas, patente) y zonas de material (torpedo, difusor).
import math
import bmesh
from mathutils import Vector
from .cut import Space, cut, select, groove, inset, push, boundary_edges, vnormal, fnormal_raw
from .shell import M_PAINT, M_UNDER, M_GLASS, M_FRAME, M_TRIM, M_CHROME, M_GAP

# materiales extra de la carrocería (después de los de shell)
M_LENS, M_HEAD, M_TAIL, M_BLINK, M_REFL, M_INNER = 7, 8, 9, 10, 11, 12
EXTRA_MATS = ['lens', 'head', 'tail', 'blink', 'refl', 'inner']


def flt(C, kind, mats=(M_PAINT,)):
    body = C.body

    def base(f):
        return f.material_index in mats
    if kind == 'side':
        return lambda f: base(f) and C.normal(f).x > 0.25
    if kind == 'band56':
        return lambda f: base(f) and 4.999 < C.st(f)[1] < 6.001
    if kind == 'top':
        return lambda f: base(f) and C.normal(f).z > 0.2
    if kind == 'front':
        return lambda f: base(f) and C.normal(f).y > 0.15 and C.center(f).y > body.y_fc - 0.3
    if kind == 'rear':
        return lambda f: base(f) and C.normal(f).y < -0.15 and C.center(f).y < body.y_rc + 0.3
    if kind == 'frontc':
        return lambda f: base(f) and C.center(f).y > body.y_fc - 0.25 and (C.normal(f).y > 0.02 or C.normal(f).x > 0.3)
    if kind == 'rearc':
        return lambda f: base(f) and C.center(f).y < body.y_rc + 0.25 and (C.normal(f).y < -0.02 or C.normal(f).x > 0.3)
    if kind == 'any':
        return base
    raise ValueError(kind)


SPACE_OF = {'side': 'side', 'band56': 'param', 'top': 'top', 'front': 'front', 'rear': 'front',
            'frontc': 'fan_front', 'rearc': 'fan_rear'}


def rounded_poly(pts, r=0.2, n=4):
    """Redondea las esquinas de un polígono (r: fracción del lado más corto que toca la esquina)."""
    out = []
    m = len(pts)
    for i in range(m):
        p0, p1, p2 = pts[i - 1], pts[i], pts[(i + 1) % m]
        a = (p0[0] - p1[0], p0[1] - p1[1])
        b = (p2[0] - p1[0], p2[1] - p1[1])
        la, lb = math.hypot(*a), math.hypot(*b)
        if la < 1e-9 or lb < 1e-9:
            out.append(p1)
            continue
        d = min(la, lb) * r
        qa = (p1[0] + a[0] / la * d, p1[1] + a[1] / la * d)
        qb = (p1[0] + b[0] / lb * d, p1[1] + b[1] / lb * d)
        for k in range(n + 1):
            t = k / n
            # Bézier cuadrática con control en la esquina
            u = 1 - t
            out.append((u * u * qa[0] + 2 * u * t * p1[0] + t * t * qb[0], u * u * qa[1] + 2 * u * t * p1[1] + t * t * qb[1]))
    return out


def densify(pts, step):
    out = []
    for a, b in zip(pts[:-1], pts[1:]):
        L = math.hypot(b[0] - a[0], b[1] - a[1])
        k = max(1, int(L / step))
        for i in range(k):
            t = i / k
            out.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
    out.append(pts[-1])
    return out


def gap(C, kind, line, width=0.0045, depth=0.004, mats=(M_PAINT,)):
    sp = Space(SPACE_OF[kind], C.body)
    f = flt(C, kind, mats)
    return groove(C, sp, line, width, depth, f, M_GAP)


def region(C, kind, poly, mat, mats=(M_PAINT,)):
    sp = Space(SPACE_OF[kind], C.body)
    f = flt(C, kind, mats)
    cut(C, sp, poly, True, f)
    faces = select(C, sp, poly, f)
    for g in faces:
        g.material_index = mat
    return faces


def _orient(C, faces, want):
    """Da vuelta las caras cuya normal no apunta según want(f, normal) → bool."""
    for f in faces:
        n = fnormal_raw(f, C.lp)
        if n.length > 1e-12 and not want(f, n.normalized()):
            f.normal_flip()


def opening(C, kind, poly, depth=0.06, wall=M_TRIM, back=M_TRIM, lens=None, lens_lift=0.0015, taper=0.12,
            mats=(M_PAINT,)):
    """Abertura con profundidad: corta el contorno, guarda una copia de la superficie como lente,
    borra la región y extruye el borde hacia adentro (paredes) cerrando con un fondo."""
    sp = Space(SPACE_OF[kind], C.body)
    f = flt(C, kind, mats)
    cut(C, sp, poly, True, f)
    faces = select(C, sp, poly, f)
    if not faces:
        return None
    nrm = Vector((0, 0, 0))
    cen = Vector((0, 0, 0))
    area = 0.0
    for g in faces:
        n = fnormal_raw(g, C.lp)
        nrm += n
        a = n.length
        cen += C.center(g) * a
        area += a
    nrm.normalize()
    cen /= max(area, 1e-12)
    out = {'normal': nrm, 'center': cen, 'faces': []}
    if lens is not None:
        dup = bmesh.ops.duplicate(C.bm, geom=faces)
        lf = [g for g in dup['geom'] if isinstance(g, bmesh.types.BMFace)]
        for g in lf:
            g.material_index = lens
        push(C, lf, -lens_lift)
        out['lens'] = lf
    bnd = boundary_edges(faces)
    bmesh.ops.delete(C.bm, geom=faces, context='FACES_ONLY')
    bnd = [e for e in bnd if e.is_valid]
    ext = bmesh.ops.extrude_edge_only(C.bm, edges=bnd)
    nv = [g for g in ext['geom'] if isinstance(g, bmesh.types.BMVert)]
    walls = [g for g in ext['geom'] if isinstance(g, bmesh.types.BMFace)]
    for v in nv:
        p = v.co.copy()
        q = p - nrm * depth + (cen - p) * taper
        C.setco(v, q)
    for g in walls:
        g.material_index = wall
        g.smooth = False
    nvs = set(nv)
    loop = [e for e in C.bm.edges if e.verts[0] in nvs and e.verts[1] in nvs]
    backs = []
    try:
        res = bmesh.ops.contextual_create(C.bm, geom=loop)
        backs = [g for g in res['faces']]
    except Exception:
        pass
    for g in backs:
        g.material_index = back
        g.smooth = False
    # paredes mirando al hueco; fondo mirando hacia afuera
    _orient(C, walls, lambda g, n: n.dot(cen - C.center(g) - nrm * (cen - C.center(g)).dot(nrm)) >= -1e-6)
    _orient(C, backs, lambda g, n: n.dot(nrm) > 0)
    out['walls'] = walls
    out['back'] = backs
    out['loop'] = nv
    return out


def recess(C, kind, poly, depth=0.012, mat=None, mats=(M_PAINT,), wall=0.003):
    """Hueco poco profundo (bolsillo de manija, nicho de patente): anillo de paredes + fondo hundido."""
    faces = region(C, kind, poly, mat if mat is not None else M_PAINT, mats)
    inset(C, faces, wall, 0.0, None)
    push(C, faces, depth)
    return faces
