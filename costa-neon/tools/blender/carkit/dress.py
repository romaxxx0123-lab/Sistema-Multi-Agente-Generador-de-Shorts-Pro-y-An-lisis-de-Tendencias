# Viste la carrocería con piezas separadas (lado derecho + espejo cuando corresponde).
import math
import bpy
import bmesh
from mathutils import Vector
from . import parts as P
from .features import densify, rounded_poly


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
    ya = body.y_rc
    objs = []
    tl = F['taillights'][0]
    poly = tl['poly']
    # firma de luz: cinta roja brillante que recorre el contorno por dentro
    top = poly[:3]
    pts, nrms = [], []
    for k in range(21):
        th = 52 - (52 - 17) * k / 20
        z = poly_interp(top, th) - 0.014
        loc, nrm = fan_point(bvh, ya, th, z, front=False)
        if loc is None:
            continue
        pts.append(loc - nrm * 0.012)
        nrms.append(nrm)
    if len(pts) > 2:
        objs.append(P.ribbon('tail_sig', pts, nrms, 0.008, 'tail_lit'))
    # intermitente (afuera, abajo) y marcha atrás (adentro)
    for name, (t0, t1), mat in [('blink_r', (18, 29), 'blink'), ('reverse', (43, 52), 'reverse')]:
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
    loc, nrm = P.ray(bvh, (2.0, y, 0.985), (-1, 0, 0))
    if loc is None:
        return []
    base = loc
    objs = []
    c = Vector((base.x + 0.125, base.y - 0.035, base.z + 0.05))
    vs, fs = P.superellipsoid(0.105, 0.052, 0.062, 0.45, 28, 16, c)
    # cara trasera plana para el espejo y punta afinada
    vs2 = []
    for v in vs:
        x, yy, z = v
        if yy < c.y - 0.022:
            yy = c.y - 0.022
        yy += (x - c.x) * 0.12
        vs2.append((x, yy, z))
    objs.append(P.obj_from('mirror_house', vs2, fs, 'paint'))
    gv, gf = P.superellipsoid(0.092, 0.002, 0.05, 0.4, 24, 6, (c.x, c.y - 0.0232, c.z))
    gv = [(x, yy + (x - c.x) * 0.12, z) for (x, yy, z) in gv]
    objs.append(P.obj_from('mirror_glass', gv, gf, 'chrome'))
    # brazo negro hacia la vela de la puerta
    objs.append(P.box('mirror_arm', (0.08, 0.06, 0.035), (base.x + 0.035, base.y - 0.02, base.z + 0.02), 'trim', bevel=0.01))
    # repetidor de giro en el borde delantero inferior de la carcasa
    bv, bf = P.superellipsoid(0.06, 0.012, 0.008, 0.5, 16, 6, (c.x + 0.02, c.y + 0.044 + (0.02) * 0.12, c.z - 0.03))
    objs.append(P.obj_from('blink_mirror', bv, bf, 'blink'))
    return objs


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
    base = sorted([p for p in G['ws_poly'] if p[1] > 0])

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


def antenna(D, info, bvh):
    y = D['features'].get('antenna_y', -1.30)
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
    loc, nrm = P.ray(clean_bvh, (0.0, 4.0, 0.51), (0, -1, 0))
    if loc is not None:
        c = loc + Vector((0, 0.004, 0))
        objs += P.cylinder('badge_f', c - Vector((0, 0.012, 0)), c, 0.042, 0.04, 'chrome', 28, False, True)
    loc, nrm = P.ray(bvh, (0.0, -4.0, 0.875), (0, 1, 0))
    if loc is not None:
        objs += P.cylinder('badge_r', loc - nrm * 0.002, loc + nrm * 0.006, 0.036, 0.034, 'chrome', 28, False, True)
    return objs


def liners(D, R):
    objs = []
    wr = D['wr']
    for ya in (D['wb'] / 2, -D['wb'] / 2):
        verts, faces = [], []
        n = 36
        x0, x1 = 0.46, 0.905
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
    loc, nrm = P.ray(clean_bvh, (0.0, 4.0, 0.42), (0, -1, 0))
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


def dress(D, info, bm):
    """Agrega todas las piezas; devuelve la lista de objetos del lado derecho y los simétricos."""
    bvh = P.bvh_of(bm)
    clean_bvh = P.bvh_of(info['clean'])
    right = []
    right += headlights(D, info, bvh, clean_bvh)
    right += taillights(D, info, bvh, clean_bvh)
    right += mirrors(D, info, bvh)
    right += handles(D, info, bvh)
    right += liners(D, D['wr'] + D['features'].get('arch_gap', 0.045))
    mirrored = [P.mirror_obj(o) for o in right]
    center = []
    center += grille(D, info, clean_bvh)
    center += intake_bars(D, info, clean_bvh)
    center += wipers(D, info, bvh)
    center += antenna(D, info, bvh)
    center += badges(D, info, bvh, clean_bvh)
    ex = D.get('extras', [])
    if 'roof_sign' in ex:
        center += roof_sign(D, info, bvh)
    if 'lightbar' in ex:
        center += lightbar(D, info, bvh)
    if 'pushbar' in ex:
        center += pushbar(D, info, clean_bvh)
    return right + mirrored + center
