# Viste la carrocería con piezas separadas (lado derecho + espejo cuando corresponde).
import math
import bpy
import bmesh
from mathutils import Vector
from . import parts as P
from .features import densify, rounded_poly
from . import styles as ST
from . import mirrors as MR
from . import lamps as LM
from . import grilles as GR


def fan_point(bvh, ya, th_deg, z, front=True, dist=4.0):
    """Punto de la superficie en el espacio cilíndrico de un abanico (rayo desde afuera hacia el eje)."""
    th = math.radians(th_deg)
    sg = 1 if front else -1
    d = Vector((math.cos(th), sg * math.sin(th), 0.0))
    o = Vector((0.0, ya, z)) + d * dist
    return P.ray(bvh, o, -d, dist * 2)


def poly_x_at(poly, z):
    """Máximo x de un polígono (x, z) a la altura z."""
    xs = []
    n = len(poly)
    for i in range(n):
        (x0, z0), (x1, z1) = poly[i], poly[(i + 1) % n]
        if (z0 - z) * (z1 - z) <= 0 and z0 != z1:
            t = (z - z0) / (z1 - z0)
            xs.append(x0 + (x1 - x0) * t)
    return max(xs) if xs else None


def headlights(D, info, bvh, clean):
    F = D['features']
    h = F['headlight']
    body = info['body']
    style = h.get('style', 'slim')
    if style == 'assembly':
        objs = []
        for u in LM.units(h):
            LM.resolve(u, clean, body, 'frontc')
            objs += LM.headlamp(D, body, clean, u)
        return objs
    if style in ST.HEAD_STYLES:
        return ST.HEAD_STYLES[style](D, body, clean, h)
    ya = body.y_fc
    objs = []
    poly = h['poly']
    # proyectores: dos ópticas redondas en la parte interna, hundidas detrás de la lente
    zc = 0.5 * (poly[0][1] + poly[-1][1]) + 0.004
    for th in h.get('projectors', [57.0, 47.5]):
        top = poly_interp(poly[:4], th)
        bot = poly_interp(list(reversed(poly[4:])), th)
        z = 0.5 * (top + bot)
        loc, nrm = fan_point(bvh, ya, th, z)
        if loc is None:
            continue
        r = min(0.032, (top - bot) * 0.36)
        a = loc - nrm * 0.014
        b = loc - nrm * 0.07
        # bisel cromado ancho alrededor de la óptica (lo que brilla detrás de la lente)
        objs += P.cylinder('proj_ring', a + nrm * 0.002, a - nrm * 0.03, r * 1.55, r * 1.05, 'refl', 28, False, False)
        objs += P.cylinder('proj', a, b, r, r, 'inner', 24, False, True, 'head')
    # línea LED (luz diurna): sigue el borde inferior, 12 mm detrás de la lente
    th0, th1 = poly[-1][0] - 2.0, poly[4][0] + 2.0
    pts, nrms = [], []
    for k in range(25):
        th = th0 + (th1 - th0) * k / 24
        bot = poly_interp(list(reversed(poly[4:])), th)
        loc, nrm = fan_point(bvh, ya, th, bot + 0.011)
        if loc is None:
            continue
        pts.append(loc - nrm * 0.012)
        nrms.append(nrm)
    if len(pts) > 2:
        objs.append(P.ribbon('drl', pts, nrms, 0.0075, 'head'))
    # intermitente ámbar en el extremo externo, arriba
    pts, nrms = [], []
    for k in range(9):
        th = poly[3][0] + 1.5 + (poly[2][0] - poly[3][0] + 6) * k / 8
        top = poly_interp(poly[:4], th)
        loc, nrm = fan_point(bvh, ya, th, top - 0.012)
        if loc is None:
            continue
        pts.append(loc - nrm * 0.014)
        nrms.append(nrm)
    if len(pts) > 2:
        objs.append(P.ribbon('blink_f', pts, nrms, 0.012, 'blink'))
    # ceja cromada fina a lo largo del borde superior interno
    pts, nrms = [], []
    for k in range(21):
        th = poly[0][0] - 2.0 - (poly[0][0] - poly[3][0] - 5.0) * k / 20
        top = poly_interp(poly[:4], th)
        loc, nrm = fan_point(bvh, ya, th, top - 0.006)
        if loc is None:
            continue
        pts.append(loc - nrm * 0.02)
        nrms.append(nrm)
    if len(pts) > 2:
        objs.append(P.ribbon('head_brow', pts, nrms, 0.006, 'refl'))
    return objs


def poly_interp(chain, th):
    """z de una cadena [(θ, z), ...] (θ decreciente o creciente) en θ."""
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


def taillights(D, info, bvh, clean):
    F = D['features']
    body = info['body']
    style = F.get('tail_style', 'bar')
    if F.get('taillamps'):
        objs = []
        for tl in F['taillamps']:
            LM.resolve(tl, clean, body, 'rearc')
            objs += LM.taillamp(D, body, bvh, tl)
        return objs
    if style in ('vertical', 'panel', 'oval', 'slit'):
        objs = ST.tail_style(D, body, bvh, F['taillights'], style)
        # giro ámbar y marcha atrás también en estos estilos (abajo del primer piloto)
        tl = F['taillights'][0]
        fr, w, hh = ST.lamp_frame(bvh, body, 'rearc', tl['poly'])
        if fr is not None and style != 'panel':
            objs += ST.ribbon_pts('blink_r', [fr.at(-w * 0.3, -hh * 0.42, 0.016), fr.at(w * 0.05, -hh * 0.42, 0.016)], fr.n, max(0.008, hh * 0.1), 'blink')
            objs += ST.ribbon_pts('reverse', [fr.at(w * 0.12, -hh * 0.42, 0.016), fr.at(w * 0.38, -hh * 0.42, 0.016)], fr.n, max(0.008, hh * 0.1), 'reverse')
        if style == 'panel' and fr is not None:
            objs += ST.ribbon_pts('blink_r', [fr.at(-w * 0.46, -hh * 0.3, 0.02), fr.at(-w * 0.46, hh * 0.3, 0.02)], fr.n, 0.02, 'blink')
        return objs
    ya = body.y_rc
    objs = []
    tl = F['taillights'][0]
    poly = tl['poly']
    ths = [p[0] for p in poly]
    tmin, tmax = min(ths), max(ths)
    span = tmax - tmin
    # firma de luz: cinta roja brillante que recorre el contorno por dentro
    top = poly[:3]
    pts, nrms = [], []
    for k in range(21):
        th = tmax - 1.5 - (span - 3.0) * k / 20
        z = poly_interp(top, th) - 0.014
        loc, nrm = fan_point(bvh, ya, th, z, front=False)
        if loc is None:
            continue
        pts.append(loc - nrm * 0.012)
        nrms.append(nrm)
    if len(pts) > 2:
        objs.append(P.ribbon('tail_sig', pts, nrms, 0.008, 'tail_lit'))
    # intermitente (afuera, abajo) y marcha atrás (adentro), dentro del contorno del piloto
    for name, (t0, t1), mat in [('blink_r', (tmin + span * 0.12, tmin + span * 0.42), 'blink'),
                                ('reverse', (tmin + span * 0.62, tmin + span * 0.9), 'reverse')]:
        pts, nrms = [], []
        for k in range(7):
            th = t0 + (t1 - t0) * k / 6
            bot = poly_interp(list(reversed(poly[4:])) + [poly[3]], th)
            loc, nrm = fan_point(bvh, ya, th, bot + 0.02, front=False)
            if loc is None:
                continue
            pts.append(loc - nrm * 0.014)
            nrms.append(nrm)
        if len(pts) > 2:
            objs.append(P.ribbon(name, pts, nrms, 0.022, mat))
    return objs


def grille(D, info, clean_bvh):
    F = D['features']
    g = F['grille']
    if g.get('assembly'):
        return GR.build(D, info['body'], clean_bvh, g)
    st = ST.grille_style(D, info['body'], clean_bvh, g)
    if st is not None:
        return st
    out = grille_hbars(D, info, clean_bvh)
    if g.get('surround'):
        out += ST.surround(clean_bvh, info['body'], ST.rounded(g['poly']), 'front', g.get('surround_w', 0.016), g['surround'])
    return out


def grille_hbars(D, info, clean_bvh):
    F = D['features']
    g = F['grille']
    poly = rounded_poly(g['poly'], 0.25)
    full = [(-x, z) for (x, z) in poly]
    objs = []
    zs = g.get('slats') or [0.445 + k * 0.024 for k in range(6)]
    for i, z in enumerate(zs):
        xe = poly_x_at(poly, z)
        if not xe:
            continue
        pts, nrms = [], []
        for k in range(17):
            x = -xe + 0.012 + (2 * xe - 0.024) * k / 16
            loc, nrm = P.ray(clean_bvh, (abs(x), 4.0, z), (0, -1, 0))
            if loc is None:
                continue
            pts.append(Vector((x, loc.y - 0.022, z)))
            nrms.append(Vector((0, 1, 0.25)).normalized())
        if len(pts) > 2:
            objs.append(P.ribbon('grille_slat', pts, nrms, 0.011, g.get('slat_mat', 'chrome')))
    return objs


def intake_bars(D, info, clean_bvh):
    F = D['features']
    g = F['intake']
    if g.get('assembly'):
        return GR.build(D, info['body'], clean_bvh, g)
    if g.get('style') in ('honeycomb', 'mesh', 'square'):
        shape = {'honeycomb': 'hex', 'mesh': 'diamond', 'square': 'square'}[g['style']]
        return ST._cells(clean_bvh, info['body'], g['poly'], g.get('pitch', 0.03), shape, 0.035, g.get('cell_mat', 'trim_gloss'))
    if g.get('style') == 'none':
        return []
    poly = rounded_poly(g['poly'], 0.3)
    objs = []
    for z in [0.287, 0.312, 0.337]:
        xe = poly_x_at(poly, z)
        if not xe:
            continue
        pts, nrms = [], []
        for k in range(21):
            x = -xe + 0.015 + (2 * xe - 0.03) * k / 20
            loc, nrm = P.ray(clean_bvh, (abs(x), 4.0, z), (0, -1, 0))
            if loc is None:
                continue
            pts.append(Vector((x, loc.y - 0.03, z)))
            nrms.append(Vector((0, 1, 0)))
        if len(pts) > 2:
            objs.append(P.ribbon('intake_bar', pts, nrms, 0.009, 'trim_gloss'))
    return objs


def mirrors(D, info, bvh):
    F = D['features']
    s0, s1 = F.get('sail', (0.42, 0.54))
    y = (s0 + s1) / 2 - 0.02
    # a la altura de la cintura de ese punto (cada diseño la tiene distinta)
    zb = info['body'].z[5](y) + F.get('mirror_dz', 0.03)
    if 'mirror_base' in F:          # pie del espejo medido en una foto: (y, z) sobre la puerta [, x fijo]
        y, zb = F['mirror_base'][:2]
        if len(F['mirror_base']) > 2:
            from mathutils import Vector as _V
            return MR.build(F, _V((F['mirror_base'][2], y, zb)), F.get('mirror', 'standard'))
    loc, nrm = P.ray(bvh, (2.0, y, zb), (-1, 0, 0))
    if loc is None:
        return []
    return MR.build(F, loc, F.get('mirror', 'standard'))


def handles(D, info, bvh):
    objs = []
    for (hy, hz) in D['features'].get('handles', []):
        loc, nrm = P.ray(bvh, (2.0, hy, hz), (-1, 0, 0))
        if loc is None:
            continue
        tilt = math.atan2(nrm.z, nrm.x)
        c = loc + nrm * 0.006
        objs.append(P.box('handle', (0.014, 0.15, 0.022), tuple(c), 'chrome', rot=(0, -tilt, 0), bevel=0.0065, segments=3))
    return objs


def wipers(D, info, bvh):
    G = D['greenhouse']
    if D['features'].get('hidden_wipers'):
        return []   # escobillas ocultas bajo el borde del capó (no se ven desde afuera)
    if G.get('ws_space') == 'front':
        return wipers_front(D, info, bvh)
    n = len(G['ws_poly']) // 2
    base = sorted(G['ws_poly'][n:])  # borde inferior del parabrisas (segunda mitad del polígono)

    def ybase(x):
        x = abs(x)
        for (x0, y0), (x1, y1) in zip(base[:-1], base[1:]):
            if x0 <= x <= x1:
                return y0 + (y1 - y0) * (x - x0) / ((x1 - x0) or 1e-9)
        return base[-1][1]
    objs = []
    for (xa, xb) in [(0.07, 0.62), (-0.66, -0.08)]:
        pts = []
        for k in range(12):
            x = xa + (xb - xa) * k / 11
            y = ybase(x) - 0.05 - 0.04 * abs(k - 5.5) / 5.5
            loc, nrm = P.ray(bvh, (abs(x), y, 3.0), (0, 0, -1))
            if loc is None:
                continue
            pts.append(Vector((x, loc.y, loc.z)) + Vector((0, 0, 1)) * 0.012)
        if len(pts) > 2:
            objs.append(P.tube('wiper', pts, 0.0065, 'trim', 6))
            mid = pts[len(pts) // 2]
            piv = Vector((xa + (xb - xa) * 0.15, ybase(xa) + 0.02, mid.z - 0.02))
            objs.append(P.tube('wiper_arm', [piv, mid + Vector((0, 0, 0.006))], 0.006, 'trim', 6))
    return objs


def wipers_front(D, info, bvh):
    """Limpiaparabrisas sobre un parabrisas casi vertical (definido en vista frontal)."""
    G = D['greenhouse']
    zb = min(p[1] for p in G['ws_poly']) + 0.06
    objs = []
    for (xa, xb) in [(0.07, 0.70), (-0.74, -0.08)]:
        pts = []
        for k in range(12):
            x = xa + (xb - xa) * k / 11
            z = zb + 0.03 * abs(k - 5.5) / 5.5
            loc, nrm = P.ray(bvh, (abs(x) + 0.0, 6.0, z), (0, -1, 0))
            if loc is None:
                continue
            pts.append(Vector((x, loc.y, loc.z)) + nrm * 0.012 * Vector((1 if x > 0 else -1, 1, 1)))
        if len(pts) > 2:
            objs.append(P.tube('wiper', pts, 0.0065, 'trim', 6))
    return objs


def antenna(D, info, bvh):
    y = D['features'].get('antenna_y', -1.30)
    if y is None:
        return []
    loc, nrm = P.ray(bvh, (0.0, y, 3.0), (0, 0, -1))
    if loc is None:
        return []
    vs, fs = P.superellipsoid(0.022, 0.075, 0.035, 0.7, 20, 10, (0, 0, 0))
    out = []
    for (x, yy, z) in vs:
        if z < 0:
            z = 0.0
        h = z / 0.035
        out.append((x * (1 - 0.55 * h), loc.y + yy - h * 0.04 * (1 if yy > 0 else 0.3), loc.z + z * 1.1 - 0.003))
    return [P.obj_from('antenna', out, fs, 'paint')]


def badges(D, info, bvh, clean_bvh):
    objs = []
    F = D['features']
    shape = F.get('badge', 'disc')
    size = F.get('badge_size', 0.04)
    zb = F.get('badge_front_z', 0.51)
    fr = ST.surface(clean_bvh, info['body'], 'front', 0.0, zb, mirror_half=True)
    if fr is not None:
        # el emblema va al ras de la superficie original (delante de la parrilla)
        fr = ST.Frame(Vector((0.0, fr.o.y + 0.004, fr.o.z)), Vector((0, 1, 0.05)))
        objs += ST.badge(fr, shape, size)
    zr = F.get('badge_rear_z', 0.875)
    loc, nrm = P.ray(bvh, (0.0, -4.0, zr), (0, 1, 0))
    if loc is not None and zr:
        objs += ST.badge(ST.Frame(loc, Vector((0, -1, 0.05))), shape, size * 0.85)
    return objs


def liners(D, R):
    objs = []
    wr = D['wr']
    for ya in (D['wb'] / 2, -D['wb'] / 2):
        verts, faces = [], []
        n = 36
        # el revestimiento termina dentro de la carrocería (en autos angostos no puede asomar por el costado)
        r3 = D['r'][3]
        if isinstance(r3, (list, tuple)):
            pts = sorted(r3)
            rb = pts[0][1] if ya <= pts[0][0] else pts[-1][1]
            for (y0_, v0), (y1_, v1) in zip(pts[:-1], pts[1:]):
                if y0_ <= ya <= y1_:
                    rb = v0 + (v1 - v0) * (ya - y0_) / ((y1_ - y0_) or 1e-9)
        else:
            rb = r3
        x1 = min(0.905, rb - 0.012)
        x0 = x1 - 0.445
        for i in range(n + 1):
            a = math.radians(-28 + 236 * i / n)
            y = ya + (R + 0.006) * math.cos(a)
            z = wr + (R + 0.006) * math.sin(a)
            verts += [(x0, y, z), (x1, y, z)]
        for i in range(n):
            faces.append((2 * i, 2 * i + 2, 2 * i + 3, 2 * i + 1))
        ob = P.obj_from('liner', verts, faces, 'liner')
        # pared interna (abanico desde el eje de la rueda)
        cv = [(x0, ya, wr)] + [(x0, ya + R * math.cos(math.radians(-28 + 236 * i / n)), wr + R * math.sin(math.radians(-28 + 236 * i / n))) for i in range(n + 1)]
        wf = [(0, i + 2, i + 1) for i in range(n)]
        w = P.obj_from('liner_wall', cv, wf, 'liner')
        objs += [ob, w]
    # orientar hacia la rueda (adentro del arco)
    for o in objs:
        me = o.data
        bm = bmesh.new()
        bm.from_mesh(me)
        for f in bm.faces:
            c = f.calc_center_median()
            if o.name.startswith('liner_wall'):
                want = Vector((1, 0, 0))
            else:
                ya = D['wb'] / 2 if c.y > 0 else -D['wb'] / 2
                want = Vector((0, ya - c.y, wr - c.z)).normalized()
            if f.normal.dot(want) < 0:
                f.normal_flip()
        bm.to_mesh(me)
        bm.free()
    return objs


def roof_sign(D, info, bvh):
    loc, nrm = P.ray(bvh, (0.0, -0.62, 3.0), (0, 0, -1))
    if loc is None:
        return []
    z = loc.z
    objs = [P.box('sign_base', (0.42, 0.14, 0.03), (0, loc.y, z + 0.012), 'trim', bevel=0.01)]
    # cartel iluminado (rol extra: el juego lo enciende de noche)
    objs.append(P.box('sign', (0.56, 0.12, 0.14), (0, loc.y, z + 0.095), 'extra', bevel=0.025))
    return objs


def lightbar(D, info, bvh):
    loc, nrm = P.ray(bvh, (0.0, -0.45, 3.0), (0, 0, -1))
    if loc is None:
        return []
    z = loc.z
    objs = []
    for sx in (-1, 1):
        objs.append(P.box('bar_foot', (0.06, 0.24, 0.035), (sx * 0.5, loc.y, z + 0.012), 'trim', bevel=0.008))
    objs.append(P.box('bar_base', (1.22, 0.26, 0.04), (0, loc.y, z + 0.045), 'trim_gloss', bevel=0.015))
    # domos rojo (izquierda del auto) y azul (derecha): el juego divide el rol extra por lado
    for sx in (-1, 1):
        objs.append(P.box('bar_dome', (0.56, 0.22, 0.075), (sx * 0.30, loc.y, z + 0.1), 'extra', bevel=0.03))
    objs.append(P.box('bar_mid', (0.07, 0.22, 0.07), (0, loc.y, z + 0.1), 'chrome', bevel=0.01))
    return objs


def pushbar(D, info, clean_bvh):
    F = D['features']
    loc, nrm = P.ray(clean_bvh, (0.003, 4.0, 0.42), (0, -1, 0))
    if loc is None:
        return []
    y = loc.y + 0.11
    objs = []
    for sx in (-1, 1):
        x = sx * 0.34
        objs.append(P.tube('push_up', [Vector((x, y - 0.02, 0.24)), Vector((x, y, 0.42)), Vector((x, y - 0.03, 0.66)), Vector((x, y - 0.12, 0.72))], 0.022, 'trim', 10))
    for z in (0.36, 0.58):
        objs.append(P.tube('push_bar', [Vector((-0.40, y - 0.01, z)), Vector((0.40, y - 0.01, z))], 0.02, 'trim', 10))
    objs.append(P.box('push_plate', (0.62, 0.02, 0.18), (0, y - 0.005, 0.47), 'trim', bevel=0.01))
    return objs


def roof_rails(D, info, bvh):
    rr = D['features']['roof_rails']
    x, y0, y1 = rr['x'], rr['y'][0], rr['y'][1]
    objs = []
    if rr.get('flush'):
        # barra al ras: perfil bajo continuo apoyado sobre el techo, con los extremos que bajan hasta la chapa
        path, nrm = [], []
        n = 48
        for k in range(n + 1):
            y = y0 + (y1 - y0) * k / n
            loc, nn = P.ray(bvh, (x, y, 4.0), (0, 0, -1))
            if loc is None:
                continue
            e = min(k, n - k) / 3.0
            lift = rr.get('h', 0.03) * min(1.0, e) - 0.006
            path.append(Vector((x, y, loc.z + lift)))
            nrm.append(Vector((0, 0, 1)))
        if len(path) > 2:
            objs.append(P.sweep('rail', path, nrm, P.rrect(rr.get('w', 0.026), 0.012, 0.45, 3), rr.get('mat', 'chrome')))
            base = [p - Vector((0, 0, 0.012)) for p in path]
            objs.append(P.sweep('rail_base', base, nrm, P.rrect(rr.get('w', 0.026) + 0.006, 0.014, 0.3, 2), 'trim'))
        return objs
    pts = []
    for k in range(15):
        y = y0 + (y1 - y0) * k / 14
        loc, nrm = P.ray(bvh, (x, y, 4.0), (0, 0, -1))
        if loc is not None:
            pts.append(Vector((x, y, loc.z + rr.get('h', 0.045))))
    if len(pts) > 2:
        objs.append(P.tube('rail', pts, 0.016, rr.get('mat', 'chrome'), 10))
        for p in (pts[0], pts[len(pts) // 2], pts[-1]):
            objs.append(P.box('rail_foot', (0.035, 0.09, rr.get('h', 0.045) + 0.01), (p.x, p.y, p.z - rr.get('h', 0.045) / 2), 'trim', bevel=0.008))
    return objs


def hood_scoop(D, info, bvh):
    hs = D['features']['hood_scoop']
    y0 = hs['y']
    loc, nrm = P.ray(bvh, (0.003, y0, 4.0), (0, 0, -1))
    if loc is None:
        return []
    vs, fs = P.superellipsoid(hs['w'] / 2, hs['l'] / 2, hs['h'], 0.35, 28, 14, (0, 0, 0))
    out = []
    for (x, yy, z) in vs:
        z = max(0.0, z)
        # se afina hacia atrás y sube hacia adelante (boca abierta adelante)
        k = (yy + hs['l'] / 2) / hs['l']
        out.append((x * (0.8 + 0.2 * k), loc.y + yy, loc.z - 0.01 + z * (0.55 + 0.45 * k)))
    objs = [P.obj_from('scoop', out, fs, 'paint')]
    objs.append(P.box('scoop_mouth', (hs['w'] * 0.7, 0.01, hs['h'] * 0.55), (0, loc.y + hs['l'] / 2 - 0.005, loc.z + hs['h'] * 0.45), 'trim_gloss', bevel=0.006))
    return objs


def wing(D, info, bvh):
    w = D['features']['wing']
    objs = []
    zt = 0.0
    for sx in (-1, 1):
        loc, nrm = P.ray(bvh, (sx * w['pylon_x'] + 0.002, w['y'], 4.0), (0, 0, -1))
        if loc is None:
            continue
        zt = max(zt, loc.z + w['h'])
        objs.append(P.box('wing_pylon', (0.03, 0.12, w['h'] + 0.02), (sx * w['pylon_x'], w['y'], loc.z + w['h'] / 2), 'trim_gloss', bevel=0.008))
    if zt:
        vs, fs = P.superellipsoid(w['span'] / 2, w['chord'] / 2, 0.018, 0.25, 32, 8, (0, w['y'] - 0.02, zt + 0.012))
        vs = [(x, y, z + (y - (w['y'] - 0.02)) * -0.18) for (x, y, z) in vs]
        objs.append(P.obj_from('wing_blade', vs, fs, w.get('mat', 'paint')))
        for sx in (-1, 1):
            objs.append(P.box('wing_end', (0.012, w['chord'] + 0.04, 0.09), (sx * w['span'] / 2, w['y'] - 0.02, zt + 0.01), 'trim_gloss', bevel=0.004))
    return objs


def side_intake_fins(D, info, clean_bvh):
    """Aletas horizontales con espesor dentro de las tomas de las esquinas del paragolpes."""
    si = D['features']['side_intakes']
    poly = si['poly']
    ths = [p[0] for p in poly]
    zs = [p[1] for p in poly]
    objs = []
    n = si.get('fins', 3)
    for i in range(n):
        z = min(zs) + (max(zs) - min(zs)) * (i + 1) / (n + 1)
        path, nrm = [], []
        for k in range(9):
            th = min(ths) + 1.5 + (max(ths) - min(ths) - 3.0) * k / 8
            fr = ST.surface(clean_bvh, info['body'], 'frontc', th, z)
            if fr is None:
                continue
            path.append(fr.o - fr.n * 0.03)
            nrm.append(fr.n)
        if len(path) > 2:
            objs.append(P.sweep('intake_fin', path, nrm, P.rrect(0.01, 0.025, 0.4, 2), si.get('fin_mat', 'trim_gloss')))
    return objs


def dress(D, info, bm):
    """Agrega todas las piezas; devuelve la lista de objetos del lado derecho, sus simétricos y los centrales."""
    bvh = P.bvh_of(bm)
    clean_bvh = P.bvh_of(info['clean'])
    F = D['features']
    body = info['body']
    # ---- lado derecho (se espeja)
    right = []
    right += headlights(D, info, bvh, clean_bvh)
    right += taillights(D, info, bvh, clean_bvh)
    right += mirrors(D, info, bvh)
    right += handles(D, info, bvh)
    if 'roof_rails' in F:
        right += roof_rails(D, info, bvh)
    if 'fogs' in F:
        right += ST.fog_lamps(D, body, clean_bvh, F['fogs'])
    si = F.get('side_intakes', {})
    if si.get('insert') and si.get('xz'):
        g = dict(si['insert'], kidney=True, poly=si.get('poly_xz', si['poly']))
        right += GR.build(D, body, clean_bvh, g)
    if F.get('side_intakes', {}).get('fins'):
        right += side_intake_fins(D, info, clean_bvh)
    for (x, z) in F.get('amber_front', []):
        fr = ST.surface(clean_bvh, body, 'front', abs(x), z, mirror_half=True)
        if fr is not None:
            right.append(P.box('blink_front', (0.09, 0.012, 0.03), tuple(fr.o + fr.n * 0.002), 'blink', bevel=0.005))
    if F.get('grille', {}).get('kidney'):
        right += grille(D, info, clean_bvh)
    right += liners(D, D['wr'] + F.get('arch_gap', 0.045))
    mirrored = [P.mirror_obj(o) for o in right]
    # ---- centrales (ya simétricos)
    center = []
    if 'grille' in F and not F['grille'].get('kidney'):
        center += grille(D, info, clean_bvh)
    if 'intake' in F:
        center += intake_bars(D, info, clean_bvh)
    center += wipers(D, info, bvh)
    center += antenna(D, info, bvh)
    center += badges(D, info, bvh, clean_bvh)
    if 'splitter' in F:
        center += ST.splitter(D, body, clean_bvh, F['splitter'])
    if 'tow_hooks' in F:
        center += ST.tow_hooks(D, body, clean_bvh, F['tow_hooks'])
    if 'rear_wiper' in F:
        center += ST.rear_wiper(D, body, bvh, F['rear_wiper'])
    if 'rear_grille' in F:
        rg = F['rear_grille']
        center += GR.cells3d(clean_bvh, body, 'rear', rg['poly'], rg.get('pitch', 0.03), 'hex', 0.012, 0.02, 0.0035, 'trim_gloss')
        center += GR.frame3d(clean_bvh, body, 'rear', rg['poly'], 0.012, 0.008, 'trim_gloss')
    if 'hood_scoop' in F:
        center += hood_scoop(D, info, bvh)
    if 'wing' in F:
        center += wing(D, info, bvh)
    ex = D.get('extras', [])
    if 'roof_sign' in ex:
        center += roof_sign(D, info, bvh)
    if 'lightbar' in ex:
        center += lightbar(D, info, bvh)
    if 'pushbar' in ex:
        center += pushbar(D, info, clean_bvh)
    return right + mirrored + center
