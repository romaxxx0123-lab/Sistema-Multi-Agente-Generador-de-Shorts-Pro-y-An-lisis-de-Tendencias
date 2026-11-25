# Cortes limpios sobre la malla: polilíneas definidas en un espacio 2D (vista lateral, superior,
# frontal, parámetros de la superficie o cilíndrico alrededor de los ejes de los abanicos).
# Técnica: se proyectan temporalmente los vértices al plano 2D, se corta con bisect_plane sólo en las
# caras cercanas a cada segmento, y se restaura la posición 3D desde la capa 'p3' (interpolada por
# Blender en los vértices nuevos). Así las aberturas, juntas y marcos siguen curvas exactas.
import math
import bmesh
from mathutils import Vector


def layers(bm):
    return (bm.verts.layers.float_vector['p3'], bm.verts.layers.float['s'], bm.verts.layers.float['t'])


class Space:
    def __init__(self, kind, body=None):
        self.kind = kind
        self.body = body

    def __call__(self, p, s, t):
        k = self.kind
        if k == 'side':
            return (p[1], p[2])
        if k == 'top':
            return (p[0], p[1])
        if k == 'front':
            return (p[0], p[2])
        if k == 'param':
            return (s, t)
        if k == 'fan_front':
            return (math.degrees(math.atan2(p[1] - self.body.y_fc, max(p[0], 0.0))), p[2])
        if k == 'fan_rear':
            return (math.degrees(math.atan2(-(p[1] - self.body.y_rc), max(p[0], 0.0))), p[2])
        raise ValueError(k)


def fnormal_raw(f, lp):
    """Normal de Newell sin normalizar (su largo es el doble del área)."""
    vs = [v[lp] for v in f.verts]
    n = Vector((0.0, 0.0, 0.0))
    for i in range(len(vs)):
        a, b = vs[i], vs[(i + 1) % len(vs)]
        n.x += (a.y - b.y) * (a.z + b.z)
        n.y += (a.z - b.z) * (a.x + b.x)
        n.z += (a.x - b.x) * (a.y + b.y)
    return n


def fnormal(f, lp):
    vs = [v[lp] for v in f.verts]
    n = Vector((0.0, 0.0, 0.0))
    for i in range(len(vs)):
        a, b = vs[i], vs[(i + 1) % len(vs)]
        n.x += (a.y - b.y) * (a.z + b.z)
        n.y += (a.z - b.z) * (a.x + b.x)
        n.z += (a.x - b.x) * (a.y + b.y)
    l = n.length
    return n / l if l > 1e-12 else n


def fcenter(f, lp):
    c = Vector((0.0, 0.0, 0.0))
    for v in f.verts:
        c += v[lp]
    return c / len(f.verts)


def fparams(f, ls, lt):
    n = len(f.verts)
    return (sum(v[ls] for v in f.verts) / n, sum(v[lt] for v in f.verts) / n)


class Ctx:
    """Atajos de capas y filtros para un bmesh de carrocería."""

    def __init__(self, bm, body):
        self.bm = bm
        self.body = body
        self.lp, self.ls, self.lt = layers(bm)

    def P(self, space, v):
        return space(v[self.lp], v[self.ls], v[self.lt])

    def center2(self, space, f):
        n = len(f.verts)
        u = v = 0.0
        for x in f.verts:
            a, b = self.P(space, x)
            u += a
            v += b
        return (u / n, v / n)

    def normal(self, f):
        return fnormal(f, self.lp)

    def center(self, f):
        return fcenter(f, self.lp)

    def st(self, f):
        return fparams(f, self.ls, self.lt)

    def setco(self, v, co):
        # los vértices sobre el plano de simetría no se despegan de él (si no, queda una ranura al espejar)
        if abs(v[self.lp][0]) < 1e-6:
            co = Vector((0.0, co[1], co[2]))
        v.co = co
        v[self.lp] = co


def _bbox(pts):
    us = [p[0] for p in pts]
    vs = [p[1] for p in pts]
    return min(us), max(us), min(vs), max(vs)


def cut(C, space, poly, closed=True, ffilter=None, pad=0.0, snap=0.0015):
    """Corta la malla a lo largo de la polilínea (espacio 2D). Devuelve los vértices nuevos.
    snap: los vértices a menos de esa distancia de la línea se usan tal cual (evita astillas)."""
    bm = C.bm
    pts = list(poly)
    segs = list(zip(pts[:-1], pts[1:]))
    if closed:
        segs.append((pts[-1], pts[0]))
    u0, u1, v0, v1 = _bbox(pts)
    span = max(u1 - u0, v1 - v0)
    pad = pad or span * 0.02 + 1e-4

    def ok(f):
        if ffilter and not ffilter(f):
            return False
        a0, a1, b0, b1 = _bbox([C.P(space, v) for v in f.verts])
        return not (a1 < u0 - pad or a0 > u1 + pad or b1 < v0 - pad or b0 > v1 + pad)
    cand = set(f for f in bm.faces if ok(f))
    newv = []
    for (a, b) in segs:
        du, dv = b[0] - a[0], b[1] - a[1]
        L = math.hypot(du, dv)
        if L < 1e-9:
            continue
        nu, nv = -dv / L, du / L
        su0, su1 = min(a[0], b[0]), max(a[0], b[0])
        sv0, sv1 = min(a[1], b[1]), max(a[1], b[1])
        sel = []
        for f in list(cand):
            if not f.is_valid:
                cand.discard(f)
                continue
            uv = [C.P(space, v) for v in f.verts]
            a0, a1, b0, b1 = _bbox(uv)
            if a1 < su0 - 1e-6 or a0 > su1 + 1e-6 or b1 < sv0 - 1e-6 or b0 > sv1 + 1e-6:
                continue
            d = [(p[0] - a[0]) * nu + (p[1] - a[1]) * nv for p in uv]
            if min(d) < -snap and max(d) > snap:
                sel.append(f)
        if not sel:
            continue
        verts = set(v for f in sel for v in f.verts)
        edges = set(e for f in sel for e in f.edges)
        for v in verts:
            p = C.P(space, v)
            v.co = (p[0], p[1], 0.0)
        res = bmesh.ops.bisect_plane(bm, geom=sel + list(edges) + list(verts), dist=snap,
                                     plane_co=(a[0], a[1], 0.0), plane_no=(nu, nv, 0.0))
        for v in verts:
            if v.is_valid:
                v.co = v[C.lp]
        for g in res['geom_cut'] + res['geom']:
            if isinstance(g, bmesh.types.BMVert):
                g.co = g[C.lp]
                if g in res['geom_cut']:
                    newv.append(g)
            elif isinstance(g, bmesh.types.BMFace) and g not in cand:
                if not ffilter or ffilter(g):
                    cand.add(g)
    return newv


def point_in_poly(p, poly):
    x, y = p
    inside = False
    n = len(poly)
    j = n - 1
    for i in range(n):
        xi, yi = poly[i]
        xj, yj = poly[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / ((yj - yi) or 1e-12) + xi:
            inside = not inside
        j = i
    return inside


def select(C, space, poly, ffilter=None):
    out = []
    for f in C.bm.faces:
        if ffilter and not ffilter(f):
            continue
        if point_in_poly(C.center2(space, f), poly):
            out.append(f)
    return out


def dist_to_polyline(p, pts):
    best = 1e9
    for a, b in zip(pts[:-1], pts[1:]):
        du, dv = b[0] - a[0], b[1] - a[1]
        L2 = du * du + dv * dv
        t = 0.0 if L2 < 1e-18 else max(0.0, min(1.0, ((p[0] - a[0]) * du + (p[1] - a[1]) * dv) / L2))
        q = (a[0] + du * t, a[1] + dv * t)
        best = min(best, math.hypot(p[0] - q[0], p[1] - q[1]))
    return best


def offset_polyline(pts, d):
    out = []
    n = len(pts)
    for i in range(n):
        a = pts[max(0, i - 1)]
        b = pts[min(n - 1, i + 1)]
        du, dv = b[0] - a[0], b[1] - a[1]
        L = math.hypot(du, dv) or 1e-12
        out.append((pts[i][0] - dv / L * d, pts[i][1] + du / L * d))
    return out


def vnormal(C, v):
    n = Vector((0.0, 0.0, 0.0))
    for f in v.link_faces:
        n += fnormal_raw(f, C.lp)
    l = n.length
    return n / l if l > 1e-12 else Vector((0, 0, 1))


def groove(C, space, line, width=0.0045, depth=0.0035, ffilter=None, mat=None):
    """Junta de panel: tres cortes paralelos y el central hundido en V (superficie real, no una calcomanía)."""
    half = width / 2
    cut(C, space, offset_polyline(line, -half), closed=False, ffilter=ffilter)
    cut(C, space, offset_polyline(line, half), closed=False, ffilter=ffilter)
    mid = cut(C, space, line, closed=False, ffilter=ffilter)
    faces = [f for f in C.bm.faces if (not ffilter or ffilter(f)) and dist_to_polyline(C.center2(space, f), line) < half * 0.98]
    if mat is not None:
        for f in faces:
            f.material_index = mat
    moves = []
    for v in mid:
        if v.is_valid and dist_to_polyline(C.P(space, v), line) < 1e-5:
            moves.append((v, vnormal(C, v)))
    for v, n in moves:
        C.setco(v, v[C.lp] - n * depth)
    return faces


def inset(C, faces, thickness, depth=0.0, mat_frame=None):
    """Marco de ancho constante alrededor de una región (devuelve las caras del marco).
    En esquinas muy agudas el desplazamiento "parejo" se dispara: se limita a 1,6× el ancho."""
    if not faces:
        return []
    fs = set(faces)
    border = set()
    for f in faces:
        for e in f.edges:
            if sum(1 for g in e.link_faces if g in fs) == 1 and len(e.link_faces) == 2:
                border.update(e.verts)
    before = [v.co.copy() for v in border]
    res = bmesh.ops.inset_region(C.bm, faces=faces, thickness=thickness, depth=depth, use_even_offset=True,
                                 use_boundary=False, use_interpolate=True)
    inner = set(v for f in faces for v in f.verts) - border
    for v in inner:
        best = None
        for p in before:
            d = (v.co - p).length
            if best is None or d < best[0]:
                best = (d, p)
        if best and best[0] > thickness * 1.6:
            p = best[1]
            v.co = p + (v.co - p) * (thickness * 1.6 / best[0])
    for v in set(v for f in res['faces'] for v in f.verts):
        v[C.lp] = v.co.copy()
    for f in faces:
        for v in f.verts:
            v[C.lp] = v.co.copy()
    if mat_frame is not None:
        for f in res['faces']:
            f.material_index = mat_frame
    return res['faces']


def push(C, faces, dist):
    """Hunde (o levanta) una región a lo largo de las normales de sus vértices."""
    vs = set(v for f in faces for v in f.verts)
    moves = [(v, vnormal(C, v)) for v in vs]
    for v, n in moves:
        C.setco(v, v[C.lp] - n * dist)


def boundary_edges(faces):
    fs = set(faces)
    out = []
    for f in faces:
        for e in f.edges:
            if sum(1 for g in e.link_faces if g in fs) == 1:
                out.append(e)
    return out
