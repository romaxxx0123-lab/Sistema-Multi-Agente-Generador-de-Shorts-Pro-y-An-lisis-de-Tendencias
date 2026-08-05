"""Original pixel-art item icons (20x20), built from shaded primitives.

Technique: every form is lit from the top-left with a 4-5 step ramp,
a specular dot, a bounce-light rim on the lower-right, and a dark
contour. No emoji, no external art.
"""
import math, random
from artlib import Img, C, T, mix, OUTL

IS = 20  # icon size
LIGHT = (-0.55, -0.68, 0.48)  # x, y, z  (top-left, toward viewer)


def _norm(v):
    m = math.sqrt(sum(c * c for c in v)) or 1
    return tuple(c / m for c in v)


LIGHT = _norm(LIGHT)


def orb(img, cx, cy, r, ramp, spec=True, rim=None, squash=1.0):
    """Shaded sphere: the workhorse for berries, gems, fruit."""
    n = len(ramp) - 1
    for y in range(int(cy - r * squash) - 1, int(cy + r * squash) + 2):
        for x in range(int(cx - r) - 1, int(cx + r) + 2):
            dx = (x + .5 - cx) / r
            dy = (y + .5 - cy) / (r * squash)
            d2 = dx * dx + dy * dy
            if d2 > 1.0:
                continue
            nz = math.sqrt(max(0, 1 - d2))
            lam = dx * LIGHT[0] + dy * LIGHT[1] + nz * LIGHT[2]
            t = max(0.0, min(1.0, (lam + 0.35) / 1.25))
            idx = int(round(t * n))
            img.set(x, y, ramp[idx])
    if rim:
        # bounce light along the lower-right limb
        for a in range(28):
            th = -0.25 + a / 28 * 1.9
            x = int(cx + math.cos(th) * r * 0.86)
            y = int(cy + math.sin(th) * r * squash * 0.86)
            if img.get(x, y)[3] > 0:
                img.set(x, y, rim)
    if spec:
        sx, sy = int(cx - r * 0.34), int(cy - r * squash * 0.40)
        img.set(sx, sy, ramp[-1])
        if r >= 3.2:
            img.set(sx + 1, sy, mix(ramp[-1], (255, 255, 255, 255), .55))
            img.set(sx, sy + 1, mix(ramp[-1], (255, 255, 255, 255), .35))
        else:
            img.set(sx, sy, mix(ramp[-1], (255, 255, 255, 255), .6))


def cyl(img, x0, y0, w, h, ramp, horiz=False):
    """Shaded cylinder (logs, handles, scroll bodies)."""
    n = len(ramp) - 1
    for j in range(h):
        for i in range(w):
            t = (i / max(1, w - 1)) if not horiz else (j / max(1, h - 1))
            # light from the left/top: bright at ~0.3 across the barrel
            v = 1 - abs(t - 0.32) / 0.78
            idx = int(round(max(0, min(1, v)) * n))
            img.set(x0 + i, y0 + j, ramp[idx])


def ramp5(dark, base, light):
    """5-step ramp: 2 shadow, base, 2 light."""
    return [mix(dark, (0, 0, 0, 255), .28), dark, base, light,
            mix(light, (255, 255, 255, 255), .45)]


# ----------------------------------------------------------------- items
def icon_berry():
    img = Img(IS, IS)
    R = ramp5(C('#6b1226'), C('#b02236'), C('#e05a5a'))
    # stem + leaf behind the fruit
    img.line(10, 9, 11, 3, C('#4a6b2a'))
    img.line(11, 4, 12, 3, C('#4a6b2a'))
    lf = [(12, 3), (15, 2), (16, 4), (14, 6), (12, 5)]
    img.poly(lf, C('#5c8a33'))
    img.poly([(12, 3), (15, 2), (14, 4), (12, 5)], C('#7cae4a'))
    img.line(12, 4, 15, 3, C('#3e5f24'))
    # three berries, back one first
    orb(img, 12.5, 11.0, 3.4, R, rim=C('#d4506a'))
    orb(img, 6.8, 10.2, 3.6, R, rim=C('#d4506a'))
    orb(img, 9.6, 14.2, 4.0, R, rim=C('#e0687e'))
    # little calyx dots
    img.set(9, 11, C('#5c1a28')); img.set(10, 11, C('#5c1a28'))
    img.outline_smart(strength=0.78)
    return img


def _log(img, x0, y0, w, h, BK, EN, seed):
    """One log lying horizontally: barrel shading, long grain, end rings."""
    rnd = random.Random(seed)
    ex = x0 + w - 5                      # where the end-cap starts
    # barrel body (vertical shading = round cross-section)
    for j in range(h):
        t = j / max(1, h - 1)
        v = 1 - abs(t - 0.30) / 0.80
        col = BK[int(round(max(0, min(1, v)) * 4))]
        img.hline(x0, y0 + j, w - 3, col)
    # long grain: horizontal streaks only (no brick pattern)
    for j in range(h):
        if rnd.random() < .75:
            sx = x0 + rnd.randrange(0, max(1, w - 8))
            ln = rnd.randrange(3, max(4, w - 6))
            c = BK[0] if rnd.random() < .55 else BK[3]
            for i in range(ln):
                if img.get(sx + i, y0 + j)[3] > 0:
                    img.set(sx + i, y0 + j, c)
    # end cap: ellipse with concentric rings
    cyx, cyy = ex + 1.6, y0 + h / 2 - .5
    rx, ry = 2.6, h / 2 + .4
    for y in range(int(cyy - ry) - 1, int(cyy + ry) + 2):
        for x in range(int(cyx - rx) - 1, int(cyx + rx) + 2):
            dx, dy = (x + .5 - cyx) / rx, (y + .5 - cyy) / ry
            d = dx * dx + dy * dy
            if d <= 1:
                img.set(x, y, EN[3] if d < .30 else (EN[2] if d < .72 else EN[1]))
    # growth rings
    for y in range(int(cyy - ry), int(cyy + ry) + 1):
        for x in range(int(cyx - rx), int(cyx + rx) + 1):
            dx, dy = (x + .5 - cyx) / rx, (y + .5 - cyy) / ry
            d = math.sqrt(dx * dx + dy * dy)
            if .40 < d < .52 or .74 < d < .86:
                if img.get(x, y)[3] > 0:
                    img.set(x, y, EN[0])
    img.set(int(cyx), int(cyy), EN[4])
    # bark lip where the cap meets the barrel
    img.vline(ex - 1, y0 + 1, h - 2, BK[0])


def icon_wood():
    img = Img(IS, IS)
    BK = ramp5(C('#3b2716'), C('#63432a'), C('#8d6640'))
    EN = ramp5(C('#7a5a34'), C('#b08a54'), C('#dcb87c'))
    _log(img, 3, 3, 14, 6, BK, EN, 11)      # back log
    _log(img, 2, 10, 15, 7, BK, EN, 29)     # front log, slightly lower/left
    img.outline_smart(strength=0.78)
    return img


def icon_stone():
    img = Img(IS, IS)
    R = ramp5(C('#3f4049'), C('#6d6f7d'), C('#a3a6b5'))
    # faceted boulder: polygon body + planar shading
    body = [(3, 12), (5, 6), (9, 3), (14, 5), (17, 10), (15, 16), (7, 17)]
    img.poly(body, R[2])
    # top-left facet catches light
    img.poly([(5, 6), (9, 3), (13, 5), (10, 9), (5, 10)], R[3])
    img.poly([(9, 3), (13, 5), (11, 6), (9, 5)], R[4])
    # lower-right facet in shadow
    img.poly([(15, 16), (17, 10), (13, 11), (11, 16)], R[1])
    img.poly([(7, 17), (11, 16), (10, 13), (5, 13)], R[1])
    # facet seams
    img.line(9, 3, 10, 9, R[0]); img.line(10, 9, 5, 10, R[0])
    img.line(10, 9, 13, 11, R[0]); img.line(10, 9, 11, 16, R[0])
    # speckle
    rnd = random.Random(7)
    for _ in range(9):
        x, y = rnd.randrange(4, 16), rnd.randrange(4, 16)
        if img.get(x, y)[3] > 0:
            img.set(x, y, R[4] if rnd.random() < .4 else R[1])
    img.outline_smart(strength=0.78)
    return img


def icon_mushroom():
    img = Img(IS, IS)
    ST = ramp5(C('#a89878'), C('#ddd0b0'), C('#f4ecd6'))
    CP = ramp5(C('#7a1d1d'), C('#bc3a30'), C('#e56a49'))
    # stem
    cyl(img, 8, 10, 5, 7, ST)
    img.hline(8, 16, 5, ST[1])
    # skirt ring
    img.hline(7, 11, 7, ST[3]); img.set(7, 11, ST[1]); img.set(13, 11, ST[1])
    # cap: half-dome
    for y in range(2, 12):
        for x in range(1, 19):
            dx, dy = (x + .5 - 10) / 8.2, (y + .5 - 11) / 8.0
            if dx * dx + dy * dy <= 1 and y <= 10:
                nz = math.sqrt(max(0, 1 - dx * dx - dy * dy))
                lam = dx * LIGHT[0] + dy * LIGHT[1] + nz * LIGHT[2]
                t = max(0., min(1., (lam + .3) / 1.2))
                img.set(x, y, CP[int(round(t * 4))])
    # cap underside shadow
    img.hline(3, 10, 14, CP[0])
    # white spots follow the dome curvature
    for (sx, sy, r) in [(6.5, 5.5, 1.6), (12.5, 6.0, 1.4), (9.5, 3.6, 1.2), (15, 8.5, 1.0), (4, 8.5, 1.0)]:
        for y in range(int(sy - r), int(sy + r) + 1):
            for x in range(int(sx - r), int(sx + r) + 1):
                if (x + .5 - sx) ** 2 + (y + .5 - sy) ** 2 <= r * r and img.get(x, y)[3] > 0:
                    img.set(x, y, C('#f6ead2'))
        img.set(int(sx - r * .5), int(sy - r * .5), C('#ffffff'))
    img.outline_smart(strength=0.78)
    return img


def icon_ore():
    """Raw ore: grey rock matrix with embedded metallic nuggets."""
    img = Img(IS, IS)
    R = ramp5(C('#3b3c45'), C('#63656f'), C('#9396a3'))
    M = ramp5(C('#8a5a1e'), C('#c8912f'), C('#f0cc63'))
    body = [(3, 13), (4, 7), (8, 3), (14, 4), (17, 9), (16, 16), (8, 17)]
    img.poly(body, R[2])
    img.poly([(4, 7), (8, 3), (13, 4), (9, 9), (4, 11)], R[3])
    img.poly([(16, 16), (17, 9), (12, 11), (10, 16)], R[1])
    img.line(8, 3, 9, 9, R[0]); img.line(9, 9, 4, 11, R[0]); img.line(9, 9, 12, 11, R[0])
    # metallic veins: small shaded orbs so they read as rounded nuggets
    for (nx, ny, nr) in [(7.0, 7.0, 2.0), (12.2, 8.4, 1.9), (9.0, 12.6, 2.2), (14.0, 12.6, 1.5)]:
        orb(img, nx, ny, nr, M, spec=True)
    # tiny sparkle
    img.set(6, 6, C('#fff4c8')); img.set(11, 7, C('#fff4c8'))
    img.outline_smart(strength=0.78)
    return img


def icon_crystal():
    """Faceted gem with an inner glow."""
    img = Img(IS, IS)
    D, B, L, W = C('#1c5f88'), C('#38a8cc'), C('#7fdcf0'), C('#dcfbff')
    # main spire
    img.poly([(10, 1), (15, 8), (12, 18), (8, 18), (5, 8)], B)
    # left facet lit
    img.poly([(10, 1), (10, 18), (8, 18), (5, 8)], L)
    img.poly([(10, 1), (7.6, 8), (8.6, 18), (10, 18)], mix(L, W, .35))
    # right facet shadow
    img.poly([(10, 1), (15, 8), (12, 18), (10, 18)], D)
    img.poly([(13.4, 8), (15, 8), (12, 18), (11.6, 18)], mix(D, C('#0f3a55'), .5))
    # facet seams
    img.line(10, 1, 10, 18, mix(W, B, .5))
    img.line(5, 8, 15, 8, mix(D, B, .5))
    # small companion shard
    img.poly([(15, 9), (18, 13), (17, 18), (14, 18)], B)
    img.poly([(15, 9), (15.6, 18), (14, 18)], L)
    img.poly([(15, 9), (18, 13), (17, 18), (16, 18)], D)
    # highlights + inner glow
    img.line(8, 5, 9, 3, W)
    img.set(9, 10, W); img.set(9, 11, mix(W, B, .4))
    img.ellipse(10, 13, 2.2, 3.0, (200, 250, 255, 60))
    img.outline_smart(tint=(11,32,52), strength=0.78)
    return img


def icon_relic():
    """Golden amulet: a ring of ancient metal cradling a glowing rune stone."""
    img = Img(IS, IS)
    G = ramp5(C('#6b4a12'), C('#c39a2c'), C('#f2d878'))
    # ---- torc / ring body: shaded torus
    cx, cy, R, r = 10.0, 11.2, 6.2, 1.9
    for y in range(int(cy - R - r) - 1, int(cy + R + r) + 2):
        for x in range(int(cx - R - r) - 1, int(cx + R + r) + 2):
            dx, dy = x + .5 - cx, y + .5 - cy
            d = math.sqrt(dx * dx + dy * dy)
            if abs(d - R) > r:
                continue
            # local normal across the tube + global position light
            tn = (d - R) / r                     # -1 inner .. +1 outer
            nx, ny = (dx / (d or 1)) * tn, (dy / (d or 1)) * tn
            nz = math.sqrt(max(0, 1 - tn * tn))
            lam = nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]
            t = max(0., min(1., (lam + .40) / 1.25))
            img.set(x, y, G[int(round(t * 4))])
    # hammered facets on the metal
    rnd = random.Random(5)
    for _ in range(14):
        a = rnd.random() * math.tau
        rr = R + (rnd.random() - .5) * r * 1.2
        x, y = int(cx + math.cos(a) * rr), int(cy + math.sin(a) * rr)
        if img.get(x, y)[3] > 0:
            img.set(x, y, G[4] if rnd.random() < .45 else G[1])
    # ---- suspension loop at the top
    img.poly([(9, 1), (11, 1), (12, 4), (8, 4)], G[2])
    img.vline(9, 1, 3, G[3]); img.vline(11, 1, 3, G[1])
    img.set(10, 1, G[4])
    # ---- rune stone set in the middle
    ST = ramp5(C('#1d4a5e'), C('#2f8fae'), C('#7fdcf0'))
    orb(img, cx, cy, 3.4, ST, spec=True, rim=C('#57c2dd'))
    # engraved rune on the stone
    RN, RH = C('#0e2f3e'), C('#d8fbff')
    img.vline(int(cx), int(cy) - 2, 5, RN)
    img.hline(int(cx) - 1, int(cy) - 1, 3, RN)
    img.set(int(cx) - 2, int(cy) + 1, RN); img.set(int(cx) + 2, int(cy) + 1, RN)
    img.set(int(cx), int(cy) - 2, RH)
    # claw prongs holding the stone
    for a in (0.9, 2.25, 3.9, 5.4):
        px, py = int(cx + math.cos(a) * 4.2), int(cy + math.sin(a) * 4.2)
        img.set(px, py, G[3]); img.set(px, py + 1, G[1])
    # faint aura
    img.ellipse(cx, cy, 8.6, 8.8, (120, 220, 245, 20))
    img.outline_smart(strength=0.78)
    return img


def icon_flower():
    img = Img(IS, IS)
    # stem + leaves
    img.line(10, 17, 10, 9, C('#3f6b2a'))
    img.line(9, 17, 9, 11, C('#54873a'))
    img.poly([(9, 14), (5, 12), (4, 15), (8, 16)], C('#4a7a30'))
    img.poly([(9, 14), (6, 13), (5, 14.5), (8, 15.5)], C('#63a044'))
    img.poly([(10, 12), (14, 10), (15, 13), (11, 14)], C('#3f6b2a'))
    # five petals around a golden centre
    P = ramp5(C('#8f2a70'), C('#cf52a0'), C('#f39ad0'))
    for i in range(5):
        a = -math.pi / 2 + i / 5 * math.tau
        px = 10 + math.cos(a) * 3.6
        py = 8 + math.sin(a) * 3.6
        orb(img, px, py, 2.7, P, spec=False)
    for i in range(5):
        a = -math.pi / 2 + i / 5 * math.tau
        px = int(10 + math.cos(a) * 4.8)
        py = int(8 + math.sin(a) * 4.8)
        if img.get(px, py)[3] > 0:
            img.set(px, py, P[4])
    Y = ramp5(C('#a8730f'), C('#e0a72a'), C('#f7dd7a'))
    orb(img, 10, 8, 2.5, Y)
    img.set(9, 7, C('#fff3c0'))
    img.outline_smart(strength=0.78)
    return img


ICONS = {
    'berry': icon_berry, 'wood': icon_wood, 'stone': icon_stone,
    'mushroom': icon_mushroom, 'ore': icon_ore, 'crystal': icon_crystal,
    'relic': icon_relic, 'flower': icon_flower,
}


def all_icons():
    return {f'item_{k}': fn() for k, fn in ICONS.items()}
