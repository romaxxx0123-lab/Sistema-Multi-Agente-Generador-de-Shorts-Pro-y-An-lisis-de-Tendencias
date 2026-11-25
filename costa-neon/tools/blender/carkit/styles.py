# Identidad de cada modelo: estilos de faros, parrillas, emblemas, pilotos, espejos y agregados.
# Todo se ubica sobre la superficie real (rayos contra la carrocería) con un marco tangente local.
import math
from mathutils import Vector
from . import parts as P
from .cut import Space, point_in_poly


# ------------------------------------------------------------------ marco sobre la superficie
class Frame:
    """Punto de la superficie con su normal y dos tangentes (horizontal h, vertical v)."""

    def __init__(self, loc, n):
        self.o = Vector(loc)
        self.n = Vector(n).normalized()
        up = Vector((0, 0, 1))
        h = up.cross(self.n)
        if h.length < 1e-6:
            h = Vector((1, 0, 0))
        self.h = h.normalized()
        self.v = self.n.cross(self.h).normalized()

    def at(self, u, w, d=0.0):
        """Punto a u (horizontal), w (vertical) metros sobre el plano tangente, d hacia adentro."""
        return self.o + self.h * u + self.v * w - self.n * d


def surface(bvh, body, kind, a, b, mirror_half=False):
    """Punto de la superficie para coordenadas (a, b) en un espacio 2D. Devuelve Frame o None."""
    if kind == 'frontc':
        th = math.radians(a)
        d = Vector((math.cos(th), math.sin(th), 0.0))
        loc, n = P.ray(bvh, Vector((0.0, body.y_fc, b)) + d * 4.0, -d, 8.0)
    elif kind == 'rearc':
        th = math.radians(a)
        d = Vector((math.cos(th), -math.sin(th), 0.0))
        loc, n = P.ray(bvh, Vector((0.0, body.y_rc, b)) + d * 4.0, -d, 8.0)
    elif kind == 'front':
        x = max(abs(a), 0.003) if mirror_half else a
        loc, n = P.ray(bvh, (x, 6.0, b), (0, -1, 0), 12.0)
        if loc is not None and mirror_half and a < 0:
            loc = Vector((-loc.x, loc.y, loc.z))
            n = Vector((-n.x, n.y, n.z))
    elif kind == 'rear':
        x = max(abs(a), 0.003) if mirror_half else a
        loc, n = P.ray(bvh, (x, -6.0, b), (0, 1, 0), 12.0)
        if loc is not None and mirror_half and a < 0:
            loc = Vector((-loc.x, loc.y, loc.z))
            n = Vector((-n.x, n.y, n.z))
    elif kind == 'side':
        loc, n = P.ray(bvh, (6.0, a, b), (-1, 0, 0), 12.0)
    else:
        raise ValueError(kind)
    if loc is None:
        return None
    return Frame(loc, n)


def ellipse_poly(clean_bvh, body, kind, c, rx, rz, rot=0.0, n=28):
    """Contorno de una elipse métrica (rx, rz) centrada en c, expresado en el espacio 2D 'kind'."""
    fr = surface(clean_bvh, body, kind, c[0], c[1])
    if fr is None:
        return None
    sp = Space({'frontc': 'fan_front', 'rearc': 'fan_rear', 'front': 'front', 'rear': 'front', 'side': 'side'}[kind], body)
    out = []
    cr, sr = math.cos(rot), math.sin(rot)
    for i in range(n):
        a = 2 * math.pi * i / n
        u, w = rx * math.cos(a), rz * math.sin(a)
        u, w = u * cr - w * sr, u * sr + w * cr
        out.append(sp(fr.at(u, w), 0.0, 0.0))
    return out


def poly_bbox(poly):
    us = [p[0] for p in poly]
    vs = [p[1] for p in poly]
    return min(us), max(us), min(vs), max(vs)


def ring_pts(fr, r_u, r_w, d, n=24, a0=0.0, a1=2 * math.pi):
    return [fr.at(r_u * math.cos(a0 + (a1 - a0) * i / n), r_w * math.sin(a0 + (a1 - a0) * i / n), d) for i in range(n + 1)]


def ribbon_pts(name, pts, n, width, mat):
    if len(pts) < 2:
        return []
    return [P.ribbon(name, pts, [n] * len(pts), width, mat)]


def bowl(name, fr, r_out, r_in, d0, d1, mat='refl', sides=28):
    """Reflector parabólico (cono) de la boca r_out a la profundidad d1 con radio r_in."""
    return P.cylinder(name, fr.o - fr.n * d0, fr.o - fr.n * d1, r_out, r_in, mat, sides, False, True, 'inner')


# ------------------------------------------------------------------ faros
def lamp_frame(clean_bvh, body, kind, poly):
    """Marco en el centro de un contorno y su tamaño métrico (ancho, alto)."""
    u0, u1, v0, v1 = poly_bbox(poly)
    uc, vc = (u0 + u1) / 2, (v0 + v1) / 2
    fr = surface(clean_bvh, body, kind, uc, vc)
    if fr is None:
        return None, 0, 0
    a = surface(clean_bvh, body, kind, u0, vc)
    b = surface(clean_bvh, body, kind, u1, vc)
    w = (a.o - b.o).length if a and b else 0.1
    return fr, w, (v1 - v0)


def head_round(D, body, clean_bvh, h):
    """Faro redondo: reflector cromado, lámpara central, aro de luz diurna y giro ámbar abajo."""
    objs = []
    for c, r in h['lamps']:
        fr = surface(clean_bvh, body, 'frontc', c[0], c[1])
        if fr is None:
            continue
        objs += bowl('head_bowl', fr, r * 0.96, r * 0.45, 0.004, 0.07)
        objs += P.cylinder('head_bulb', fr.o - fr.n * 0.05, fr.o - fr.n * 0.03, r * 0.28, r * 0.28, 'inner', 20, False, True, 'head')
        objs += ribbon_pts('head_halo', ring_pts(fr, r * 0.8, r * 0.8, 0.012, 32), fr.n, 0.006, 'head')
        objs += ribbon_pts('blink_f', ring_pts(fr, r * 0.62, r * 0.62, 0.016, 10, math.radians(200), math.radians(340)), fr.n, 0.008, 'blink')
    return objs


def head_quad(D, body, clean_bvh, h):
    """Cuatro ópticas redondas dentro de la parrilla (vista frontal): reflector, lente y lámpara."""
    objs = []
    for (x, z), r in h['lamps']:
        fr = surface(clean_bvh, body, 'front', x, z, mirror_half=True)
        if fr is None:
            continue
        ax = Vector((0, 1, 0.04)).normalized()
        c = fr.o - fr.n * 0.03
        # aro cromado con volumen, reflector parabólico, lámpara y lente de vidrio abombada
        ring = [c + (Vector((1, 0, 0)) * math.cos(a) + Vector((0, 0, 1)) * math.sin(a)) * (r * 1.12) for a in [2 * math.pi * i / 36 for i in range(36)]]
        objs.append(P.sweep('quad_ring', ring, [ax] * len(ring), P.rrect(0.012, 0.012, 0.45, 3), 'chrome', closed=True))
        objs += P.cylinder('head_bowl', c, c - ax * (r * 1.1), r, r * 0.35, 'refl', 32, False, True, 'inner')
        objs += P.cylinder('head_bulb', c - ax * (r * 0.7), c - ax * (r * 0.45), r * 0.22, r * 0.18, 'inner', 16, False, True, 'head')
        objs.append(P.cap_mesh('quad_lens', c, ax, r * 1.02, r * 0.28, 'lens'))
    return objs


def head_split(D, body, clean_bvh, h):
    """Faros partidos: línea diurna fina arriba (en la ranura) y módulo principal abajo con dos proyectores."""
    objs = []
    slit = h['poly']
    u0, u1, v0, v1 = poly_bbox(slit)
    pts, nn = [], None
    for k in range(25):
        th = u1 - 1.5 - (u1 - u0 - 3.0) * k / 24
        fr = surface(clean_bvh, body, 'frontc', th, (v0 + v1) / 2)
        if fr:
            pts.append(fr.o - fr.n * 0.01)
            nn = fr.n
    if nn is not None:
        objs += ribbon_pts('drl', pts, nn, max(0.006, (v1 - v0) * 0.5), 'head')
    # giro: tramo externo de la ranura en ámbar
    fr = surface(clean_bvh, body, 'frontc', u0 + 2.5, (v0 + v1) / 2)
    if fr:
        objs.append(P.box('blink_f', (0.05, 0.008, max(0.008, (v1 - v0) * 0.6)), tuple(fr.o - fr.n * 0.012), 'blink',
                          rot=(0, 0, math.atan2(fr.n.y, fr.n.x) - math.pi / 2)))
    main = h['poly2']
    fr, w, hh = lamp_frame(clean_bvh, body, 'frontc', main)
    if fr:
        for k in (-1, 1):
            c = fr.at(k * w * 0.22, 0.0, 0.0)
            f2 = Frame(c, fr.n)
            s = min(hh, w * 0.4) * 0.42
            objs.append(P.box('proj_box', (s * 2.1, 0.05, s * 2.1), tuple(c - fr.n * 0.04), 'refl',
                              rot=(0, 0, math.atan2(fr.n.y, fr.n.x) - math.pi / 2), bevel=0.006))
            objs += P.cylinder('proj', c - fr.n * 0.012, c - fr.n * 0.05, s * 0.75, s * 0.75, 'inner', 20, False, True, 'head')
    return objs


def head_rect(D, body, clean_bvh, h):
    """Faro rectangular de utilitario: dos reflectores apilados y franja ámbar externa."""
    objs = []
    fr, w, hh = lamp_frame(clean_bvh, body, 'frontc', h['poly'])
    if not fr:
        return objs
    r = min(w * 0.42, hh * 0.24)
    for k in (-1, 1):
        f2 = Frame(fr.at(w * 0.08, k * hh * 0.22, 0.0), fr.n)
        objs += bowl('head_bowl', f2, r, r * 0.4, 0.004, 0.06)
        objs += P.cylinder('head_bulb', f2.o - f2.n * 0.04, f2.o - f2.n * 0.025, r * 0.3, r * 0.3, 'inner', 18, False, True, 'head')
    f3 = Frame(fr.at(-w * 0.36, 0.0, 0.0), fr.n)
    objs += ribbon_pts('blink_f', [f3.at(0, -hh * 0.38, 0.014), f3.at(0, hh * 0.38, 0.014)], f3.n, w * 0.16, 'blink')
    objs += ribbon_pts('drl', [fr.at(-w * 0.32, -hh * 0.45, 0.012), fr.at(w * 0.42, -hh * 0.45, 0.012)], fr.n, 0.006, 'head')
    return objs


def head_cshape(D, body, clean_bvh, h):
    """Firma en C alrededor de tres proyectores en fila (pickup)."""
    objs = []
    fr, w, hh = lamp_frame(clean_bvh, body, 'frontc', h['poly'])
    if not fr:
        return objs
    rr = min(hh * 0.28, w * 0.1)
    for k in (-1, 0, 1):
        c = fr.at(k * w * 0.2 + w * 0.06, 0.0, 0.0)
        f2 = Frame(c, fr.n)
        objs += P.cylinder('proj_ring', c - fr.n * 0.012, c - fr.n * 0.03, rr * 1.4, rr * 1.05, 'refl', 22, False, False)
        objs += P.cylinder('proj', c - fr.n * 0.014, c - fr.n * 0.05, rr, rr, 'inner', 20, False, True, 'head')
    # "C": arriba, lado externo y abajo
    cu, cw = w * 0.42, hh * 0.38
    pts = [fr.at(cu * 0.9, cw, 0.01), fr.at(-cu * 0.7, cw, 0.01), fr.at(-cu, cw * 0.6, 0.01), fr.at(-cu, -cw * 0.6, 0.01),
           fr.at(-cu * 0.7, -cw, 0.01), fr.at(cu * 0.9, -cw, 0.01)]
    objs += ribbon_pts('drl', pts, fr.n, 0.007, 'head')
    objs += ribbon_pts('blink_f', [fr.at(-cu * 0.85, -cw * 0.3, 0.014), fr.at(-cu * 0.85, cw * 0.3, 0.014)], fr.n, 0.012, 'blink')
    return objs


def head_slit(D, body, clean_bvh, h):
    """Ranura finísima con firma en Y (superauto) y un microproyector."""
    objs = []
    poly = h['poly']
    u0, u1, v0, v1 = poly_bbox(poly)
    pts, nn = [], None
    for k in range(21):
        th = u1 - 1.0 - (u1 - u0 - 2.0) * k / 20
        z = v0 + (v1 - v0) * 0.55 + (v1 - v0) * 0.15 * math.sin(math.pi * k / 20)
        fr = surface(clean_bvh, body, 'frontc', th, z)
        if fr:
            pts.append(fr.o - fr.n * 0.006)
            nn = fr.n
    if nn is not None:
        objs += ribbon_pts('drl', pts, nn, 0.0045, 'head')
    # brazo de la Y que baja por el extremo externo
    fa = surface(clean_bvh, body, 'frontc', u0 + 3.0, (v0 + v1) / 2)
    if fa:
        objs += ribbon_pts('drl_y', [fa.at(0.0, 0.0, 0.006), fa.at(-0.03, -0.06, 0.006)], fa.n, 0.004, 'head')
        objs += ribbon_pts('blink_f', [fa.at(0.01, 0.002, 0.008), fa.at(0.05, 0.004, 0.008)], fa.n, 0.006, 'blink')
    fm = surface(clean_bvh, body, 'frontc', (u0 + u1) / 2, (v0 + v1) / 2)
    if fm:
        objs += P.cylinder('proj', fm.o - fm.n * 0.006, fm.o - fm.n * 0.03, 0.011, 0.011, 'inner', 16, False, True, 'head')
    return objs


def head_oval(D, body, clean_bvh, h):
    """Faro ovalado (GT): un proyector grande con bisel cromado y anillo de luz diurna."""
    objs = []
    c = h['center']
    fr = surface(clean_bvh, body, 'frontc', c[0], c[1])
    if not fr:
        return objs
    rx, rz = h['rx'], h['rz']
    r = min(rx, rz) * 0.55
    p = fr.at(rx * 0.25, 0.0, 0.0)
    f2 = Frame(p, fr.n)
    objs += P.cylinder('proj_ring', p - fr.n * 0.01, p - fr.n * 0.04, r * 1.45, r * 1.05, 'refl', 28, False, False)
    objs += P.cylinder('proj', p - fr.n * 0.012, p - fr.n * 0.06, r, r, 'inner', 24, False, True, 'head')
    objs += ribbon_pts('drl', ring_pts(fr, rx * 0.86, rz * 0.8, 0.012, 36, h.get('rot', 0.0), h.get('rot', 0.0) + 2 * math.pi), fr.n, 0.006, 'head')
    objs += ribbon_pts('blink_f', ring_pts(fr, rx * 0.7, rz * 0.6, 0.016, 8, math.radians(150), math.radians(210)), fr.n, 0.01, 'blink')
    return objs


HEAD_STYLES = {'round': head_round, 'quad': head_quad, 'split': head_split, 'rect': head_rect,
               'cshape': head_cshape, 'slit': head_slit, 'oval': head_oval}


# ------------------------------------------------------------------ parrillas
def _cells(clean_bvh, body, poly, pitch, shape, depth, mat, web=0.0045, kind='front'):
    """Malla de celdas (panal 'hex', rombos 'diamond' o cuadros 'square') dentro de un contorno (vista frontal)."""
    objs = []
    u0, u1, v0, v1 = poly_bbox(poly)
    full = [(-u, v) for (u, v) in reversed(poly)] + list(poly)
    rows = int((v1 - v0) / (pitch * 0.866)) + 2
    cols = int((2 * u1) / pitch) + 2
    verts, faces = [], []
    for r in range(rows):
        z = v0 + pitch * 0.5 + r * pitch * (0.866 if shape == 'hex' else 1.0)
        off = (pitch / 2) if (shape == 'hex' and r % 2) else 0.0
        for c in range(-cols, cols + 1):
            x = c * pitch + off
            if not point_in_poly((x, z), full):
                continue
            fr = surface(clean_bvh, body, kind, x, z, mirror_half=True)
            if fr is None:
                continue
            f2 = Frame(fr.o - fr.n * depth, Vector((0, 1 if kind == 'front' else -1, 0)))
            k = 6 if shape == 'hex' else 4
            rad = pitch * (0.5 if shape == 'hex' else 0.62)
            ang0 = math.pi / 6 if shape == 'hex' else (math.pi / 4 if shape == 'diamond' else math.pi / 4)
            if shape == 'square':
                ang0 = math.pi / 4
            ring = [f2.at(rad * math.cos(ang0 + 2 * math.pi * i / k), rad * math.sin(ang0 + 2 * math.pi * i / k) * (1.0 if shape != 'diamond' else 0.7)) for i in range(k)]
            inner = [f2.o + (p - f2.o) * (1 - web / rad) for p in ring]
            base = len(verts)
            verts += ring + inner
            for i in range(k):
                a, b = i, (i + 1) % k
                faces.append((base + a, base + b, base + k + b, base + k + a))
    if faces:
        ob = P.obj_from('grille_cells', verts, faces, mat)
        _face_dir(ob, Vector((0, 1 if kind == 'front' else -1, 0)))
        objs.append(ob)
    return objs


def _face_dir(ob, d):
    import bmesh as _bm
    bm = _bm.new()
    bm.from_mesh(ob.data)
    for f in bm.faces:
        if f.normal.dot(d) < 0:
            f.normal_flip()
    bm.to_mesh(ob.data)
    bm.free()


def surround(clean_bvh, body, poly, kind, width, mat, lift=0.002, grow=0.006):
    """Marco (cromado o negro) que recorre el contorno de una abertura por fuera."""
    full = [(-u, v) for (u, v) in reversed(poly)] + list(poly) if kind in ('front', 'rear') else list(poly)
    if kind in ('front', 'rear'):
        # agrandar el contorno simétrico y cerrarlo
        cx = 0.0
        cv = sum(p[1] for p in full) / len(full)
        full = [(u * (1 + grow / max(0.05, abs(u) + 1e-6)) if abs(u) > 1e-6 else u, cv + (v - cv) * (1 + grow / 0.08)) for (u, v) in full]
    pts, nrms = [], []
    seq = full + [full[0]]
    dense = []
    for a, b in zip(seq[:-1], seq[1:]):
        L = math.hypot(b[0] - a[0], b[1] - a[1])
        k = max(1, int(L / 0.015))
        for i in range(k):
            t = i / k
            dense.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
    dense.append(dense[0])
    for (u, v) in dense:
        fr = surface(clean_bvh, body, kind, u, v, mirror_half=kind in ('front', 'rear'))
        if fr is None:
            continue
        pts.append(fr.o + fr.n * lift)
        nrms.append(fr.n)
    if len(pts) < 3:
        return []
    return [P.ribbon('surround', pts, nrms, width, mat)]


def grille_style(D, body, clean_bvh, g):
    style = g.get('style', 'hbars')
    poly = g['poly']
    objs = []
    from .dress import poly_x_at
    if style == 'hbars':
        return None  # lo resuelve dress.grille (lamas horizontales)
    if style in ('honeycomb', 'mesh', 'square'):
        shape = {'honeycomb': 'hex', 'mesh': 'diamond', 'square': 'square'}[style]
        objs += _cells(clean_bvh, body, poly, g.get('pitch', 0.034), shape, g.get('cell_depth', 0.03), g.get('cell_mat', 'trim_gloss'))
    if style == 'vbars':
        u0, u1, v0, v1 = poly_bbox(poly)
        full = [(-u, v) for (u, v) in reversed(poly)] + list(poly)
        x = -u1 + 0.03
        while x < u1 - 0.02:
            zs = [v0 + (v1 - v0) * k / 24 for k in range(25)]
            inside = [z for z in zs if point_in_poly((x, z), full)]
            if len(inside) > 2:
                pts, nn = [], None
                for z in inside:
                    fr = surface(clean_bvh, body, 'front', x, z, mirror_half=True)
                    if fr:
                        pts.append(Vector((x, fr.o.y - 0.025, z)))
                        nn = Vector((0, 1, 0))
                if nn:
                    objs += ribbon_pts('grille_vbar', pts, nn, g.get('bar_w', 0.012), g.get('slat_mat', 'chrome'))
            x += g.get('pitch', 0.05)
    if style == 'crossbar':
        objs += _cells(clean_bvh, body, poly, g.get('pitch', 0.03), 'hex', 0.045, 'trim_gloss')
        u0, u1, v0, v1 = poly_bbox(poly)
        zc = g.get('bar_z', (v0 + v1) / 2)
        xe = poly_x_at(poly, zc) or u1
        pts = []
        for k in range(21):
            x = -xe + 2 * xe * k / 20
            fr = surface(clean_bvh, body, 'front', x, zc, mirror_half=True)
            if fr:
                pts.append(Vector((x, fr.o.y - 0.006, zc)))
        if len(pts) > 2:
            objs.append(P.tube('grille_crossbar', pts, g.get('bar_r', 0.022), 'chrome', 12))
    if style == 'utility':
        u0, u1, v0, v1 = poly_bbox(poly)
        nb = g.get('bars', 3)
        for i in range(nb):
            z = v0 + (v1 - v0) * (i + 0.5) / nb
            xe = poly_x_at(poly, z) or u1
            pts = []
            for k in range(17):
                x = -xe + 0.015 + (2 * xe - 0.03) * k / 16
                fr = surface(clean_bvh, body, 'front', x, z, mirror_half=True)
                if fr:
                    pts.append(Vector((x, fr.o.y - 0.02, z)))
            if len(pts) > 2:
                objs.append(P.tube('grille_ubar', pts, (v1 - v0) / nb * 0.28, g.get('slat_mat', 'trim'), 8))
    if g.get('surround'):
        objs += surround(clean_bvh, body, rounded(poly), 'front', g.get('surround_w', 0.016), g['surround'])
    return objs


def rounded(poly):
    from .features import rounded_poly
    return rounded_poly(poly, 0.25)


# ------------------------------------------------------------------ emblemas
def badge(fr, shape, size, mat='chrome', thick=0.008):
    """Emblema plano con relieve: disco, aro, rombo, escudo, triángulo, paralelogramo, alas o cheurón."""
    s = size
    if shape == 'disc':
        return P.cylinder('badge', fr.o - fr.n * 0.004, fr.o + fr.n * thick, s, s * 0.95, mat, 28, False, True)
    if shape == 'ring':
        pts = ring_pts(fr, s * 0.82, s * 0.82, -0.006, 28)
        return [P.tube('badge', pts, s * 0.16, mat, 8)]
    if shape == 'chevron':
        pts = [fr.at(-s, s * 0.35, -0.006), fr.at(0, -s * 0.35, -0.006), fr.at(s, s * 0.35, -0.006)]
        return [P.tube('badge', pts, s * 0.14, mat, 8)]
    if shape == 'wing':
        out = []
        for k in (-1, 1):
            pts = [fr.at(k * s * 0.25, 0, -0.006), fr.at(k * s * 1.3, s * 0.18, -0.006)]
            out.append(P.tube('badge', pts, s * 0.12, mat, 8))
        out += P.cylinder('badge_c', fr.o - fr.n * 0.004, fr.o + fr.n * thick, s * 0.3, s * 0.28, mat, 20, False, True)
        return out
    pts2 = {
        'diamond': [(0, s), (s * 0.8, 0), (0, -s), (-s * 0.8, 0)],
        'shield': [(-s, s * 0.8), (s, s * 0.8), (s * 0.9, -s * 0.2), (0, -s), (-s * 0.9, -s * 0.2)],
        'triangle': [(0, s * 0.9), (s, -s * 0.7), (-s, -s * 0.7)],
        'bolt': [(-s * 0.4, s * 0.6), (s * 1.0, s * 0.6), (s * 0.4, -s * 0.6), (-s * 1.0, -s * 0.6)],
    }[shape]
    verts, faces = [], []
    k = len(pts2)
    for (u, w) in pts2:
        verts.append(fr.at(u, w, -thick))
    for (u, w) in pts2:
        verts.append(fr.at(u * 0.92, w * 0.92, 0.002))
    faces.append(tuple(range(k)))
    for i in range(k):
        a, b = i, (i + 1) % k
        faces.append((a + k, b + k, b, a))
    ob = P.obj_from('badge', verts, faces, mat, smooth=False)
    _face_dir_out(ob, fr)
    return [ob]


def _face_dir_out(ob, fr):
    import bmesh as _bm
    bm = _bm.new()
    bm.from_mesh(ob.data)
    c = fr.o - fr.n * 0.003
    for f in bm.faces:
        if f.normal.dot(f.calc_center_median() - c) < 0:
            f.normal_flip()
    bm.to_mesh(ob.data)
    bm.free()


# ------------------------------------------------------------------ pilotos
def tail_style(D, body, bvh, tl_list, style):
    """Interiores de pilotos según estilo (sobre el lado derecho)."""
    objs = []
    for tl in tl_list:
        poly = tl['poly']
        fr, w, hh = lamp_frame(bvh, body, 'rearc', poly)
        if fr is None:
            continue
        if style == 'vertical':
            # franjas horizontales apiladas (bloques de LED) + giro + marcha atrás
            n = tl.get('bands', 4)
            for i in range(n):
                z = -hh * 0.38 + hh * 0.76 * i / max(1, n - 1)
                objs += ribbon_pts('tail_band', [fr.at(-w * 0.36, z, 0.014), fr.at(w * 0.36, z, 0.014)], fr.n, hh / (n * 3.2), 'tail_lit')
        elif style == 'panel':
            # tres faros rectangulares por lado en un panel negro
            for i in range(3):
                u = -w * 0.33 + w * 0.33 * i
                objs.append(P.box('tail_cell', (w * 0.24, 0.02, hh * 0.62), tuple(fr.at(u, 0.0, 0.03)), 'tail_lit',
                                  rot=(0, 0, math.atan2(fr.n.y, fr.n.x) - math.pi / 2), bevel=0.006))
        elif style == 'oval':
            objs += ribbon_pts('tail_ring', ring_pts(fr, w * 0.4, hh * 0.38, 0.012, 32), fr.n, 0.014, 'tail_lit')
            objs += ribbon_pts('tail_ring2', ring_pts(fr, w * 0.26, hh * 0.22, 0.016, 28), fr.n, 0.01, 'tail_lit')
            objs += P.cylinder('tail_core', fr.o - fr.n * 0.03, fr.o - fr.n * 0.018, min(w, hh) * 0.18, min(w, hh) * 0.18, 'inner', 20, False, True, 'reverse')
        elif style == 'slit':
            objs += ribbon_pts('tail_line', [fr.at(-w * 0.45, 0.0, 0.008), fr.at(w * 0.45, 0.0, 0.008)], fr.n, max(0.01, hh * 0.5), 'tail_lit')
        elif style == 'boomerang':
            pass  # la firma la arma dress.taillights siguiendo el borde superior
    return objs


# ------------------------------------------------------------------ espejos
# ------------------------------------------------------------------ agregados
def fog_lamps(D, body, clean_bvh, fg):
    objs = []
    for c, r in fg['lamps']:
        fr = surface(clean_bvh, body, fg.get('kind', 'frontc'), c[0], c[1])
        if fr is None:
            continue
        objs += P.cylinder('fog_ring', fr.o + fr.n * 0.004, fr.o - fr.n * 0.01, r * 1.35, r * 1.3, fg.get('ring', 'chrome'), 28, False, False)
        objs += bowl('fog_bowl', fr, r, r * 0.45, 0.0, 0.04)
        objs += P.cylinder('fog_bulb', fr.o - fr.n * 0.03, fr.o - fr.n * 0.02, r * 0.3, r * 0.3, 'inner', 16, False, True, 'head')
        objs += P.cylinder('fog_lens', fr.o + fr.n * 0.001, fr.o + fr.n * 0.005, r, r * 0.9, 'lens', 28, False, True)
    return objs


def tow_hooks(D, body, clean_bvh, th):
    objs = []
    for (x, z) in th['pts']:
        fr = surface(clean_bvh, body, 'front', x, z, mirror_half=True)
        if fr is None:
            continue
        c = fr.o + fr.n * 0.03
        pts = [c + Vector((0, -0.035, 0.02)), c + Vector((0, 0.0, 0.03)), c + Vector((0, 0.03, 0.0)), c + Vector((0, 0.0, -0.03)), c + Vector((0, -0.035, -0.02))]
        objs.append(P.tube('tow_hook', pts, 0.011, th.get('mat', 'hook'), 8))
    return objs


def splitter(D, body, clean_bvh, sp):
    """Labio delantero: lámina negra que sobresale bajo el paragolpes."""
    z = sp['z']
    pts, nrm = [], []
    for k in range(31):
        th = 6 + 84 * k / 30
        fr = surface(clean_bvh, body, 'frontc', th, z)
        if fr is None:
            continue
        hn = Vector((fr.n.x, fr.n.y, 0)).normalized()
        pts.append(fr.o + hn * sp.get('out', 0.03) * 0.5)
    if len(pts) < 3:
        return []
    full = [Vector((-p.x, p.y, p.z)) for p in reversed(pts)] + pts
    return [P.ribbon('splitter', full, [Vector((0, 0, 1))] * len(full), sp.get('out', 0.03) + 0.02, 'trim_gloss')]


def rear_wiper(D, body, bvh, rw):
    fr = surface(bvh, body, 'rear', 0.0, rw['z'], mirror_half=True)
    if fr is None:
        return []
    p0 = fr.o + fr.n * 0.012
    p1 = fr.at(rw.get('len', 0.42) * 0.9, rw.get('len', 0.42) * 0.35, -0.012)
    return [P.tube('rear_wiper', [p0, p1], 0.006, 'trim', 6)]
