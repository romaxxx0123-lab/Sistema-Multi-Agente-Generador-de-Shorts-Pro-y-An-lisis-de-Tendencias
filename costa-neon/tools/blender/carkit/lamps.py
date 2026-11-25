# Ópticas como conjuntos reales: carcasa oscura con profundidad bajo una lente clara, proyectores
# (ojo de vidrio con bisel cromado), reflectores parabólicos, guías de luz LED en 3D que dibujan la
# firma, sección de giro propia y molduras cromadas. Todo se ubica en coordenadas de la óptica:
# f ∈ [0, 1] a lo largo (0 = extremo interno junto a la parrilla, 1 = extremo externo) y
# h ∈ [0, 1] a lo alto (0 = borde inferior, 1 = borde superior) en ese punto.
import math
from mathutils import Vector
from . import parts as P
from .styles import surface, Frame


def chain_z(chain, th):
    """z de una cadena [(θ, z), ...] interpolada en θ."""
    pts = sorted(chain)
    if th <= pts[0][0]:
        return pts[0][1]
    if th >= pts[-1][0]:
        return pts[-1][1]
    for (a, za), (b, zb) in zip(pts[:-1], pts[1:]):
        if a <= th <= b:
            t = (th - a) / ((b - a) or 1e-9)
            return za + (zb - za) * t
    return pts[-1][1]


class Lamp:
    """Coordenadas de una óptica definida por sus bordes superior e inferior en el espacio de un abanico."""

    def __init__(self, body, bvh, kind, top, bottom):
        self.body, self.bvh, self.kind = body, bvh, kind
        self.top, self.bottom = top, bottom
        ths = [p[0] for p in top + bottom]
        # extremo interno = mayor θ (más cerca del eje del auto)
        self.th_in, self.th_out = max(ths), min(ths)

    def uv(self, f, h):
        th = self.th_in + (self.th_out - self.th_in) * f
        zb = chain_z(self.bottom, th)
        zt = chain_z(self.top, th)
        return th, zb + (zt - zb) * h

    def frame(self, f, h):
        th, z = self.uv(f, h)
        return surface(self.bvh, self.body, self.kind, th, z)

    def point(self, f, h, depth):
        fr = self.frame(f, h)
        return None if fr is None else fr.o - fr.n * depth

    def path(self, pts, depth, samples=6):
        """Camino 3D dentro de la óptica por puntos (f, h), con normales de la superficie."""
        out, nrm = [], []
        for (f0, h0), (f1, h1) in zip(pts[:-1], pts[1:]):
            for i in range(samples):
                t = i / samples
                fr = self.frame(f0 + (f1 - f0) * t, h0 + (h1 - h0) * t)
                if fr is not None:
                    out.append(fr.o - fr.n * depth)
                    nrm.append(fr.n)
        fr = self.frame(*pts[-1])
        if fr is not None:
            out.append(fr.o - fr.n * depth)
            nrm.append(fr.n)
        return out, nrm


def forward_axis(n, front=True):
    """Las ópticas miran hacia adelante (o atrás), no según la curvatura de la esquina."""
    ref = Vector((0.0, 1.0 if front else -1.0, 0.0))
    a = n * 0.3 + ref * 0.7
    return a.normalized()


def projector(name, fr, R, front=True, depth=0.022):
    """Proyector: bisel cromado cónico, barril negro, disco que brilla y lente de vidrio abombada."""
    ax = forward_axis(fr.n, front)
    c = fr.o - ax * (depth + R * 0.35)
    objs = []
    objs += P.cylinder(name + '_bezel', c + ax * (R * 0.25), c - ax * 0.022, R * 1.6, R * 1.06, 'refl', 32, False, False)
    objs += P.cylinder(name + '_barrel', c - ax * 0.004, c - ax * 0.07, R * 1.02, R * 0.95, 'inner', 24, False, True)
    objs += P.cylinder(name + '_glow', c - ax * 0.006, c - ax * 0.003, R * 0.9, R * 0.9, 'inner', 24, False, True, 'head')
    objs.append(P.cap_mesh(name + '_lens', c, ax, R, R * 0.5, 'lens'))
    return objs


def reflector(name, fr, R, front=True, depth=0.012):
    """Reflector parabólico cromado con su lámpara."""
    ax = forward_axis(fr.n, front)
    c = fr.o - ax * depth
    objs = P.cylinder(name + '_bowl', c, c - ax * (R * 1.1), R, R * 0.35, 'refl', 32, False, True, 'inner')
    objs += P.cylinder(name + '_bulb', c - ax * (R * 0.7), c - ax * (R * 0.45), R * 0.22, R * 0.18, 'inner', 16, False, True, 'head')
    return objs


def light_pipe(name, lamp, pts, depth=0.014, radius=0.0042, mat='head'):
    """Guía de luz LED: tubo fino que sigue un trazo dentro de la óptica."""
    path, nrm = lamp.path(pts, depth)
    if len(path) < 2:
        return []
    return [P.sweep(name, path, nrm, [(radius * math.cos(a), radius * math.sin(a)) for a in [2 * math.pi * i / 8 for i in range(8)]], mat)]


def strip(name, lamp, pts, depth, width, thick, mat):
    """Moldura o placa con espesor dentro de la óptica (cromo, negro brillante o ámbar)."""
    path, nrm = lamp.path(pts, depth)
    if len(path) < 2:
        return []
    return [P.sweep(name, path, nrm, P.rrect(width, thick, 0.35, 2), mat)]


def headlamp(D, body, bvh, spec):
    """Faro completo (lado derecho)."""
    lamp = Lamp(body, bvh, 'frontc', spec['top'], spec['bottom'])
    objs = []
    for k, (f, h, R) in enumerate(spec.get('projectors', [])):
        fr = lamp.frame(f, h)
        if fr is not None:
            objs += projector('proj%d' % k, fr, R)
    for k, (f, h, R) in enumerate(spec.get('reflectors', [])):
        fr = lamp.frame(f, h)
        if fr is not None:
            objs += reflector('refl%d' % k, fr, R)
    for k, pts in enumerate(spec.get('drl', [])):
        objs += light_pipe('drl%d' % k, lamp, pts, spec.get('drl_depth', 0.014), spec.get('drl_r', 0.0042), 'head')
    for k, pts in enumerate(spec.get('signal', [])):
        objs += strip('blink_f%d' % k, lamp, pts, 0.016, spec.get('signal_w', 0.014), 0.006, 'blink')
    for k, pts in enumerate(spec.get('chrome', [])):
        objs += strip('head_trim%d' % k, lamp, pts, 0.03, spec.get('chrome_w', 0.008), 0.004, 'refl')
    for k, (pts, w) in enumerate(spec.get('bezels', [])):
        objs += strip('head_bezel%d' % k, lamp, pts, 0.045, w, 0.012, 'trim_gloss')
    for k, (f, h, R, mat) in enumerate(spec.get('halos', [])):
        fr = lamp.frame(f, h)
        if fr is None:
            continue
        ax = forward_axis(fr.n)
        c = fr.o - ax * 0.018
        u = ax.orthogonal().normalized()
        v = ax.cross(u).normalized()
        pts = [c + (u * math.cos(a) + v * math.sin(a)) * R for a in [2 * math.pi * i / 32 for i in range(32)]]
        objs.append(P.sweep('halo%d' % k, pts, [ax] * len(pts), [(0.0045 * math.cos(a), 0.0045 * math.sin(a)) for a in [2 * math.pi * i / 8 for i in range(8)]], mat, closed=True))
    return objs


def taillamp(D, body, bvh, spec):
    """Piloto completo (lado derecho): guías de luz rojas, marcha atrás blanca, giro ámbar."""
    lamp = Lamp(body, bvh, 'rearc', spec['top'], spec['bottom'])
    objs = []
    for k, pts in enumerate(spec.get('pipes', [])):
        objs += light_pipe('tail_pipe%d' % k, lamp, pts, spec.get('pipe_depth', 0.016), spec.get('pipe_r', 0.0055), 'tail_lit')
    for k, pts in enumerate(spec.get('blocks', [])):
        objs += strip('tail_block%d' % k, lamp, pts, 0.022, spec.get('block_w', 0.03), 0.01, 'tail_lit')
    for k, pts in enumerate(spec.get('reverse', [])):
        objs += strip('reverse%d' % k, lamp, pts, 0.02, spec.get('reverse_w', 0.022), 0.008, 'reverse')
    for k, pts in enumerate(spec.get('signal', [])):
        objs += strip('blink_r%d' % k, lamp, pts, 0.02, spec.get('signal_w', 0.02), 0.008, 'blink')
    for k, (pts, w) in enumerate(spec.get('bezels', [])):
        objs += strip('tail_bezel%d' % k, lamp, pts, 0.035, w, 0.01, spec.get('bezel_mat', 'trim_gloss'))
    for k, (f, h, R) in enumerate(spec.get('rings', [])):
        fr = lamp.frame(f, h)
        if fr is None:
            continue
        ax = forward_axis(fr.n, front=False)
        c = fr.o - ax * 0.016
        u = ax.orthogonal().normalized()
        v = ax.cross(u).normalized()
        pts = [c + (u * math.cos(a) + v * math.sin(a)) * R for a in [2 * math.pi * i / 28 for i in range(28)]]
        objs.append(P.sweep('tail_ring%d' % k, pts, [ax] * len(pts), [(0.005 * math.cos(a), 0.005 * math.sin(a)) for a in [2 * math.pi * i / 8 for i in range(8)]], 'tail_lit', closed=True))
        objs += P.cylinder('tail_core%d' % k, c - ax * 0.02, c - ax * 0.008, R * 0.45, R * 0.45, 'inner', 20, False, True, 'reverse')
    return objs


def split_ellipse(poly):
    """Divide un contorno elíptico (θ, z) en cadenas superior e inferior."""
    zc = sum(p[1] for p in poly) / len(poly)
    top = sorted([p for p in poly if p[1] >= zc], key=lambda p: -p[0])
    bottom = sorted([p for p in poly if p[1] < zc], key=lambda p: -p[0])
    return top, bottom


def xz_to_fan(cbvh, body, kind, pts):
    """Puntos de un plano en vista frontal/trasera (x desde el eje, z altura) → espacio del abanico (θ, z)."""
    from .styles import surface
    view = 'front' if kind == 'frontc' else 'rear'
    ya = body.y_fc if kind == 'frontc' else body.y_rc
    sg = 1.0 if kind == 'frontc' else -1.0
    out = []
    for (x, z) in pts:
        fr = surface(cbvh, body, view, x, z, mirror_half=True)
        if fr is None:
            continue
        th = math.degrees(math.atan2(sg * (fr.o.y - ya), max(fr.o.x, 1e-6)))
        out.append((th, z))
    return out


def resolve(spec, cbvh, body, kind):
    """Completa top/bottom de una unidad definida por elipse métrica ('ellipse': (centro, rx, rz[, rot]))
    o por un plano en vista frontal/trasera ('top_xz' / 'bottom_xz')."""
    if 'ellipse_xz' in spec and 'ellipse' not in spec:
        (x, z), rx, rz = spec['ellipse_xz'][:3]
        c = xz_to_fan(cbvh, body, kind, [(x, z)])
        if c:
            spec['ellipse'] = (c[0], rx, rz) + tuple(spec['ellipse_xz'][3:])
    if 'top_xz' in spec and 'top' not in spec:
        spec['top'] = xz_to_fan(cbvh, body, kind, spec['top_xz'])
        spec['bottom'] = xz_to_fan(cbvh, body, kind, spec['bottom_xz'])
    if 'ellipse' in spec and 'top' not in spec:
        from .styles import ellipse_poly
        e = spec['ellipse']
        poly = ellipse_poly(cbvh, body, kind, e[0], e[1], e[2], e[3] if len(e) > 3 else 0.0, 36)
        spec['top'], spec['bottom'] = split_ellipse(poly)
        spec['_poly'] = poly
    return spec


def units(h):
    return h['units'] if 'units' in h else [h]


def outline(spec):
    """Contorno de la abertura (superior de adentro hacia afuera + inferior de afuera hacia adentro)."""
    if '_poly' in spec:
        return spec['_poly']
    top = sorted(spec['top'], key=lambda p: -p[0])
    bottom = sorted(spec['bottom'], key=lambda p: p[0])
    return top + bottom
