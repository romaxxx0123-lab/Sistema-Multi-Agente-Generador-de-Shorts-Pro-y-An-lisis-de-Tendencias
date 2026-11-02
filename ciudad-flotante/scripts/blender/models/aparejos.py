"""Aparejos sueltos de cubierta: barril, caja de madera, salvavidas y rollo de cuerda."""
import math

import cf


def barril():
    # Duelas abombadas: perfil más ancho en el centro, tapa algo hundida.
    prof = [(0.0, 0.03), (0.25, 0.0), (0.29, 0.2), (0.31, 0.42), (0.29, 0.64), (0.25, 0.84), (0.23, 0.84), (0.23, 0.81), (0.0, 0.81)]
    body = cf.lathe(prof, seg=12, color='deckWoodDark')
    cf.paint(body, 'deckWood', lambda p: p.normal.z > 0.6)
    cf.jitter_colors(body, 0.07, seed=3)
    hoops = [cf.lathe([(r + 0.012, z - 0.025), (r + 0.016, z), (r + 0.012, z + 0.025)], seg=12, color='metalDark') for r, z in ((0.265, 0.12), (0.305, 0.36), (0.305, 0.5), (0.265, 0.74))]
    return cf.model([body, *hoops], 'barril')


def caja_madera():
    s = 0.62
    core = cf.box((s - 0.04, s - 0.04, s - 0.04), at=(0, 0, 0.02), color='deckWood')
    cf.jitter_colors(core, 0.08, seed=5)
    parts = [core]
    t = 0.06
    h = s / 2
    # Marco de listones en las 12 aristas y una diagonal en cada lateral.
    for x in (-h + t / 2, h - t / 2):
        for y in (-h + t / 2, h - t / 2):
            parts.append(cf.box((t, t, s), at=(x, y, 0), color='deckWoodDark'))
    for z in (0, s - t):
        for y in (-h + t / 2, h - t / 2):
            parts.append(cf.box((s, t, t), at=(0, y, z), color='deckWoodDark'))
        for x in (-h + t / 2, h - t / 2):
            parts.append(cf.box((t, s, t), at=(x, 0, z), color='deckWoodDark'))
    diag = math.degrees(math.atan2(s - 2 * t, s - 2 * t))
    for y in (-h - 0.005, h + 0.005):
        parts.append(cf.box((math.hypot(s - 2 * t, s - 2 * t), 0.02, t * 0.8), at=(0, y, s / 2 - t * 0.4), rot=(0, -diag, 0), color='deckWoodDark', base=False))
    for x in (-h - 0.005, h + 0.005):
        parts.append(cf.box((0.02, math.hypot(s - 2 * t, s - 2 * t), t * 0.8), at=(x, 0, s / 2 - t * 0.4), rot=(diag, 0, 0), color='deckWoodDark', base=False))
    for p in parts[1:]:
        cf.bevel(p, 0.008)
    return cf.model(parts, 'caja_madera')


def salvavidas():
    # De pie, en el plano XZ, mirando a +Y (el frente); apoyado en z = 0.
    R, r = 0.3, 0.075
    ring = cf.torus(R, r, seg=16, tube_seg=6, at=(0, 0, R + r), rot=(90, 0, 0), color='#f3ead6')
    # Cuatro franjas rojas.
    cf.paint(ring, 'hullStripe', lambda p: int((math.atan2(p.center.z - (R + r), p.center.x) + math.pi) / (math.pi / 4)) % 2 == 0)
    rope = cf.tube([(R * math.cos(a), 0, R + r + R * math.sin(a)) for a in [i * 2 * math.pi / 24 for i in range(25)]], 0.012, seg=4, color='rope', cap=False)
    rope.location = (0, 0.07, 0)  # sobre la cara delantera del aro
    return cf.model([ring, rope], 'salvavidas')


def rollo_cuerda():
    turns, r0, r1, rr = 3.2, 0.07, 0.27, 0.035
    pts = []
    n = 96
    for i in range(n + 1):
        t = i / n
        a = t * turns * 2 * math.pi
        rad = r0 + (r1 - r0) * t
        pts.append((rad * math.cos(a), rad * math.sin(a), rr))
    coil = cf.tube(pts, rr, seg=5, color='rope')
    top = cf.tube([(x * 0.8, y * 0.8, rr * 3) for x, y, _ in pts[30:]], rr, seg=5, color='rope')
    cf.jitter_colors(coil, 0.05, seed=7)
    return cf.model([coil, top], 'rollo_cuerda')


def build():
    barril()
    caja_madera()
    salvavidas()
    rollo_cuerda()
