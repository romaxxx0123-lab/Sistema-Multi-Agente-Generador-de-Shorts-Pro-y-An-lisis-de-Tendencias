# Espejos retrovisores como los de un auto real: carcasa en forma de gota (más profunda junto a la puerta
# y afinada hacia afuera), cara trasera plana con el espejo hundido dentro de un borde fino, orientada hacia
# el conductor; pie corto (sedán), brazo aerodinámico (deportivos) o dos brazos con espejo partido
# (utilitarios), y repetidor de giro delgado sobre el borde inferior externo.
import math
import bmesh
from mathutils import Vector
from . import parts as P

STYLES = {
    'standard': dict(W=0.205, H=0.125, Din=0.085, Dout=0.045, toe=14.0, n=3.2, top=-0.10, bot=0.05, taper=0.12,
                     mount='foot', lift=0.03, out=0.035, rim=0.007, repeater=True),
    'sport': dict(W=0.165, H=0.082, Din=0.062, Dout=0.034, toe=12.0, n=3.0, top=-0.12, bot=0.08, taper=0.18,
                  mount='stalk', lift=0.065, out=0.06, rim=0.006, repeater=True),
    'truck': dict(W=0.17, H=0.27, Din=0.095, Dout=0.075, toe=10.0, n=4.2, top=-0.05, bot=0.0, taper=0.04,
                  mount='arms', lift=0.0, out=0.10, rim=0.008, repeater=False, split=0.30),
}


def _outline_pt(S, a):
    W, H, n = S['W'], S['H'], S['n']
    c, s = math.cos(a), math.sin(a)
    u = 0.5 * W * (1 + math.copysign(abs(c) ** (2 / n), c))
    v = 0.5 * H * math.copysign(abs(s) ** (2 / n), s)
    v *= 1 - S['taper'] * u / W
    v += u * (S['bot'] + (S['top'] - S['bot']) * (s + 1) / 2)
    return u, v


def outline(S, segs=56):
    """Contorno de la cara trasera en coordenadas locales (u hacia afuera desde el borde interno, v arriba), antihorario."""
    return [_outline_pt(S, 2 * math.pi * i / segs) for i in range(segs)]


def offset(pts, d):
    """Contorno convexo antihorario desplazado hacia adentro una distancia d."""
    m = len(pts)
    res = []
    for i in range(m):
        a, b, c = pts[i - 1], pts[i], pts[(i + 1) % m]
        n1 = Vector((b[1] - a[1], -(b[0] - a[0])))
        n2 = Vector((c[1] - b[1], -(c[0] - b[0])))
        nn = (n1.normalized() + n2.normalized()).normalized()
        res.append((b[0] - nn.x * d, b[1] - nn.y * d))
    return res


def depth(S, u):
    f = max(0.0, min(1.0, u / S['W']))
    return S['Din'] + (S['Dout'] - S['Din']) * f ** 1.3


def frame(S):
    a = math.radians(S['toe'])
    N = Vector((math.sin(a), math.cos(a), 0.0))    # hacia adelante: frente abombado de la carcasa
    U = Vector((math.cos(a), -math.sin(a), 0.0))   # hacia afuera
    V = Vector((0.0, 0.0, 1.0))
    return U, V, N


def _orient(ob, rule):
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bm.normal_update()
    for f in bm.faces:
        want = rule(f.index, f.calc_center_median())
        if want is not None and f.normal.dot(want) < 0:
            f.normal_flip()
    bm.to_mesh(ob.data)
    bm.free()


def housing(S, O, mat, rings=11, q=2.4):
    U, V, N = frame(S)
    out = outline(S)
    m = len(out)
    uc = sum(p[0] for p in out) / m
    vc = sum(p[1] for p in out) / m

    def p3(u, v, d):
        return O + U * u + V * v + N * d
    verts, faces = [], []
    for j in range(rings):
        r = math.cos(0.5 * math.pi * j / rings)
        h = (1 - r ** q) ** (1 / q)
        for (u, v) in out:
            uu, vv = uc + (u - uc) * r, vc + (v - vc) * r
            verts.append(p3(uu, vv, depth(S, uu) * h))
    tip = len(verts)
    verts.append(p3(uc, vc, depth(S, uc)))
    for j in range(rings - 1):
        for i in range(m):
            i2 = (i + 1) % m
            faces.append((j * m + i, j * m + i2, (j + 1) * m + i2, (j + 1) * m + i))
    last = (rings - 1) * m
    for i in range(m):
        faces.append((last + i, last + (i + 1) % m, tip))
    n_dome = len(faces)
    # borde trasero fino y hueco donde va el espejo
    g = 0.006
    inner = offset(out, S['rim'])
    b0 = len(verts)
    verts += [p3(u, v, 0.0) for (u, v) in inner]
    c0 = len(verts)
    verts += [p3(u, v, g) for (u, v) in inner]
    for i in range(m):
        i2 = (i + 1) % m
        faces.append((i, i2, b0 + i2, b0 + i))
    n_rim = len(faces)
    for i in range(m):
        i2 = (i + 1) % m
        faces.append((b0 + i, b0 + i2, c0 + i2, c0 + i))
    ob = P.obj_from('mirror_house', verts, faces, mat)
    core = p3(uc, vc, depth(S, uc) * 0.4)
    axis = p3(uc, vc, g * 0.5)

    def rule(k, c):
        if k < n_dome:
            return c - core
        if k < n_rim:
            return -N
        return axis - c
    _orient(ob, rule)
    return ob, inner, (uc, vc), p3, g


def _clip(poly, vcut, keep_above):
    """Recorta un polígono por la recta v = vcut."""
    res = []
    m = len(poly)
    for i in range(m):
        a, b = poly[i], poly[(i + 1) % m]
        ina = (a[1] >= vcut) == keep_above
        inb = (b[1] >= vcut) == keep_above
        if ina:
            res.append(a)
        if ina != inb:
            t = (vcut - a[1]) / (b[1] - a[1])
            res.append((a[0] + (b[0] - a[0]) * t, vcut))
    return res


def _fan(name, poly, p3, d, mat, N):
    uc = sum(p[0] for p in poly) / len(poly)
    vc = sum(p[1] for p in poly) / len(poly)
    vs = [p3(u, v, d) for (u, v) in poly] + [p3(uc, vc, d)]
    m = len(poly)
    ob = P.obj_from(name, vs, [(i, (i + 1) % m, m) for i in range(m)], mat, smooth=False)
    _orient(ob, lambda k, c: -N)
    return ob


def build(F, base, style):
    """Espejo derecho completo. base: punto de la puerta (vela) donde se apoya."""
    S = dict(STYLES.get(style, STYLES['standard']))
    k = F.get('mirror_size', 1.0)
    for key in ('W', 'H', 'Din', 'Dout'):
        S[key] *= k
    U, V, N = frame(S)
    vmin = min(p[1] for p in outline(S))
    O = Vector((base.x + S['out'], base.y - 0.02, base.z + S['lift'] - vmin))
    mat = F.get('mirror_mat', 'trim' if style == 'truck' else 'paint')
    objs = []
    ob, inner, (uc, vc), p3, g = housing(S, O, mat)
    objs.append(ob)
    # espejo (partido en los utilitarios: plano arriba, convexo abajo)
    if S.get('split'):
        vs = min(p[1] for p in inner) + (max(p[1] for p in inner) - min(p[1] for p in inner)) * S['split']
        objs.append(_fan('mirror_glass', _clip(inner, vs + 0.004, True), p3, g, 'chrome', N))
        objs.append(_fan('mirror_glass2', _clip(inner, vs - 0.004, False), p3, g, 'chrome', N))
        objs.append(_fan('mirror_back', inner, p3, g + 0.002, 'trim', N))
    else:
        objs.append(_fan('mirror_glass', inner, p3, g, 'chrome', N))
    B = base - Vector((0.012, 0.0, 0.0))
    Y = Vector((0.0, 1.0, 0.0))
    if S['mount'] == 'foot':
        # pie corto y achatado desde la vela de la puerta hasta la parte baja interna de la carcasa
        A = p3(0.018, vc - 0.28 * S['H'], depth(S, 0.0) * 0.42) - V * 0.012
        path = [B + (A - B) * t + V * (0.012 * math.sin(math.pi * t)) for t in (0.0, 0.35, 0.7, 1.0)]
        objs.append(P.sweep('mirror_foot', path, [V] * len(path), P.rrect(0.055 * k, 0.03 * k, 0.45, 3),
                            F.get('mirror_foot_mat', 'trim')))
    elif S['mount'] == 'stalk':
        # brazo de perfil aerodinámico que sube desde la puerta hasta el centro de la carcasa
        A = p3(0.32 * S['W'], vc - 0.38 * S['H'], depth(S, 0.32 * S['W']) * 0.45)
        M = Vector((B.x + (A.x - B.x) * 0.35, B.y + (A.y - B.y) * 0.5, B.z + (A.z - B.z) * 0.75))
        path = []
        for i in range(9):
            t = i / 8
            path.append(B * (1 - t) ** 2 + M * 2 * t * (1 - t) + A * t ** 2)
        nrm = []
        for i in range(len(path)):
            tg = (path[min(i + 1, len(path) - 1)] - path[max(i - 1, 0)]).normalized()
            nrm.append(tg.cross(Y).normalized())
        prof = [(0.017 * math.cos(a), 0.0055 * math.sin(a)) for a in [2 * math.pi * i / 12 for i in range(12)]]
        objs.append(P.sweep('mirror_arm', path, nrm, prof, F.get('mirror_foot_mat', 'trim_gloss')))
    else:
        # utilitario: placa en la puerta y dos brazos tubulares
        objs.append(P.box('mirror_base', (0.03, 0.10, 0.17), (base.x + 0.005, base.y, base.z + 0.05), 'trim', bevel=0.008))
        for dv in (0.32, -0.30):
            A = p3(0.012, vc + dv * S['H'], depth(S, 0.0) * 0.5)
            Bk = Vector((base.x + 0.01, base.y, base.z + 0.05 + dv * 0.25))
            Mk = Vector(((Bk.x + A.x) / 2, (Bk.y + A.y) / 2 + 0.01, (Bk.z + A.z) / 2))
            objs.append(P.tube('mirror_arm', [Bk, Mk, A], 0.011, 'trim', 10))
    # repetidor de giro: tira fina sobre el borde inferior externo, visible desde adelante y de costado
    if S.get('repeater'):
        rs, q = 0.93, 2.4
        hs = (1 - rs ** q) ** (1 / q)
        core = p3(uc, vc, depth(S, uc) * 0.4)
        path, nrm = [], []
        for i in range(15):
            a = math.radians(-78 + 86 * i / 14)
            u, v = _outline_pt(S, a)
            uu, vv = uc + (u - uc) * rs, vc + (v - vc) * rs
            p = p3(uu, vv, depth(S, uu) * hs)
            nn = (p - core).normalized()
            path.append(p + nn * 0.0004)
            nrm.append(nn)
        objs.append(P.sweep('blink_mirror', path, nrm, P.rrect(0.0075 * k, 0.0022, 0.45, 2), 'blink'))
    return objs
