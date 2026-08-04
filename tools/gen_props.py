"""Trees, rocks, bushes, flora, ruins - handcrafted-looking procedural props."""
import math, random
from artlib import Img, C, T, mix, OUTL

SHADOW = (14, 12, 20, 70)


def _canopy(img, cx, cy, rx, ry, pal, rnd, blobs=9, drop=0.0):
    """Leafy mass built on its OWN layer, shaded, then composited onto img.

    Keeps the trunk/shadow already drawn on `img` untouched.
    """
    dark, base, lite, hi = pal
    layer = Img(img.w, img.h)
    cy = cy + drop

    # 1) silhouette: overlapping clumps of varied size, pushed outward so the
    #    outline is lumpy like real foliage rather than one smooth ellipse
    clumps = [(cx, cy, rx * .78, ry * .78)]
    for i in range(blobs):
        a = i / max(blobs, 1) * math.tau + rnd.uniform(-.30, .30)
        rr = rnd.uniform(.62, .95)
        cs = rnd.uniform(.34, .58)
        clumps.append((cx + math.cos(a) * rx * rr, cy + math.sin(a) * ry * rr * .84,
                       rx * cs, ry * cs * rnd.uniform(.85, 1.1)))
    # a few small satellite tufts break the outline further
    for _ in range(max(3, blobs // 2)):
        a = rnd.uniform(0, math.tau)
        rr = rnd.uniform(.85, 1.06)
        cs = rnd.uniform(.16, .28)
        clumps.append((cx + math.cos(a) * rx * rr, cy + math.sin(a) * ry * rr * .82,
                       rx * cs, ry * cs))
    for x, y, ex, ey in clumps:
        layer.ellipse(x, y, ex, ey, base)

    # 2) SPHERICAL shading: treat the canopy as a dome lit from the top-left.
    #    A linear ramp produces visible diagonal banding, so use the surface
    #    normal of an ellipsoid and a real Lambert term instead.
    LX, LY, LZ = -0.50, -0.62, 0.60
    ln = math.sqrt(LX * LX + LY * LY + LZ * LZ)
    LX, LY, LZ = LX / ln, LY / ln, LZ / ln
    for y in range(layer.h):
        for x in range(layer.w):
            if layer.px[x, y][3] == 0:
                continue
            nx = (x + .5 - cx) / max(rx, 1)
            ny = (y + .5 - cy) / max(ry, 1)
            r2 = nx * nx + ny * ny
            nz = math.sqrt(max(0.04, 1 - min(1, r2)))
            lam = nx * LX + ny * LY + nz * LZ
            # per-clump wobble breaks the smooth gradient into leafy masses
            lam += (rnd.random() - .5) * 0.10
            if lam < -0.10:
                layer.set(x, y, dark)
            elif lam < 0.26:
                layer.set(x, y, base)
            elif lam < 0.60:
                layer.set(x, y, lite)
            else:
                layer.set(x, y, hi)

    # 3) per-clump volume: each clump gets its own little dome highlight,
    #    so the canopy reads as many leaf masses, not one balloon
    for x, y, ex, ey in clumps[1:]:
        # is this clump on the lit side of the whole canopy?
        gx = (x - cx) / max(rx, 1)
        gy = (y - cy) / max(ry, 1)
        facing = gx * LX + gy * LY
        for k in range(14):
            a = math.pi * (0.90 + k / 14 * 1.0)
            px = int(x + math.cos(a) * ex * .72)
            py = int(y + math.sin(a) * ey * .72)
            if layer.get(px, py)[3] == 0:
                continue
            if facing > -0.15 and rnd.random() < .75:
                layer.set(px, py, hi if rnd.random() < .40 else lite)
        # shadow pocket where clumps overlap (contact occlusion)
        for k in range(10):
            a = math.pi * (0.05 + k / 10 * 0.85)
            px = int(x + math.cos(a) * ex * .80)
            py = int(y + math.sin(a) * ey * .80)
            if layer.get(px, py)[3] > 0 and rnd.random() < .55:
                layer.set(px, py, dark)

    # 4) leaf texture: small 2-3px sprigs, denser toward the lit top-left,
    #    plus dark gaps that read as holes between branches
    for _ in range(int(rx * ry * .34)):
        x = int(rnd.gauss(cx - rx * .12, rx * .52))
        y = int(rnd.gauss(cy - ry * .10, ry * .52))
        if layer.get(x, y)[3] == 0:
            continue
        cur = layer.get(x, y)
        # brighten what is already lit, darken what is already shaded
        if cur == hi or cur == lite:
            c = hi if rnd.random() < .6 else lite
        elif cur == dark:
            c = dark
        else:
            c = lite if rnd.random() < .45 else dark
        layer.set(x, y, c)
        if rnd.random() < .55:
            layer.set(x + 1, y, c)
        if rnd.random() < .35:
            layer.set(x, y + 1, c)
        if rnd.random() < .18:
            layer.set(x + 1, y + 1, c)
    # dark negative space: little gaps where you'd see through the crown
    for _ in range(int(rx * .55)):
        x = int(rnd.gauss(cx + rx * .10, rx * .48))
        y = int(rnd.gauss(cy + ry * .16, ry * .46))
        if layer.get(x, y)[3] == 0:
            continue
        layer.set(x, y, dark)
        if rnd.random() < .5:
            layer.set(x + 1, y, dark)

    # 5) chew the silhouette edge so it reads as leaves, not a balloon
    edge = []
    for y in range(layer.h):
        for x in range(layer.w):
            if layer.px[x, y][3] == 0:
                continue
            if (layer.get(x - 1, y)[3] == 0 or layer.get(x + 1, y)[3] == 0 or
                    layer.get(x, y - 1)[3] == 0 or layer.get(x, y + 1)[3] == 0):
                edge.append((x, y))
    for x, y in edge:
        if rnd.random() < .30:
            layer.px[x, y] = T
    # small leaf nubs sticking out
    for x, y in edge:
        if rnd.random() < .06:
            dx, dy = rnd.choice([(-1, 0), (1, 0), (0, -1)])
            if layer.get(x + dx, y + dy)[3] == 0:
                layer.set(x + dx, y + dy, base)

    img.blit(layer, 0, 0)


LEAF_PALS = {
    'oak':    [C('#28451f'), C('#3c6b2c'), C('#55913c'), C('#77b552')],
    'autumn': [C('#7a3d16'), C('#b06424'), C('#d18a2e'), C('#e8b452')],
    'pine':   [C('#1d3a22'), C('#2b5531'), C('#3d7442'), C('#569356')],
    'jungle': [C('#1f4a24'), C('#2f7033'), C('#469a44'), C('#6cc05c')],
    'dead':   [C('#3a2f26'), C('#4d3f31'), C('#61513f'), C('#7a684f')],
    'cherry': [C('#8a3a5e'), C('#c05f86'), C('#e08bab'), C('#f4b8cd')],
}
BARK = [C('#3a2a1c'), C('#54402a'), C('#6b5236'), C('#8a6b46')]


def tree(seed, kind='oak', size=1.0):
    rnd = random.Random(seed)
    w = int(40 * size)
    h = int(52 * size)
    img = Img(w, h)
    cx = w // 2
    # shadow
    img.ellipse(cx, h - 4, 10 * size, 3.6 * size, SHADOW)
    if kind == 'pine':
        trunk_h = int(10 * size)
        tw = max(3, int(4 * size))
        ty = h - 4 - trunk_h
        img.rect(cx - tw // 2, ty, tw, trunk_h, BARK[1])
        img.vline(cx - tw // 2, ty, trunk_h, BARK[0])
        img.vline(cx + tw // 2 - 1, ty, trunk_h, BARK[0])
        img.vline(cx - tw // 2 + 1, ty, trunk_h, BARK[2])
        dk, base, lt, hi = LEAF_PALS['pine']
        lay = Img(w, h)
        layers = 6
        top = 2
        bot = h - 8
        for i in range(layers):
            t = i / (layers - 1)
            y = int(top + t * (bot - top))
            half = (3.2 + (t ** .82) * 13.5) * size
            hh = (7.5 + t * 3) * size
            ytip = y - hh * .55
            ybot = y + hh * .45
            # --- drooping bough silhouette (concave, not a flat triangle) ---
            left, right = [], []
            STEPS = 9
            for k in range(STEPS + 1):
                u = k / STEPS
                # x grows with u; y sags near the tips  => bough droop
                sag = (u ** 1.7) * hh * .40
                xoff = half * (u ** .78)
                yy = ytip + (ybot - ytip) * (0.30 + 0.70 * u) + sag * .35
                left.append((cx - xoff, yy))
                right.append((cx + xoff, yy))
            poly = [(cx, ytip)] + right + list(reversed(left))
            lay.poly(poly, base)
            # lit left flank / shadowed right flank
            lpoly = [(cx, ytip)] + [(x + (cx - x) * .30, yy) for x, yy in left[::-1]]
            lpoly = [(cx, ytip)] + list(reversed([(cx - (cx - x) * .96, yy) for x, yy in left]))
            lay.poly([(cx, ytip)] + list(reversed(left)) +
                     [(cx - half * .18, ybot)], lt)
            lay.poly([(cx, ytip)] + list(reversed(left[:6])) +
                     [(cx - half * .34, left[5][1])], hi)
            lay.poly([(cx, ytip)] + right + [(cx + half * .10, ybot)], dk)
            # ragged needle fringe along the lower silhouette
            for xx in range(int(cx - half) - 2, int(cx + half) + 3):
                for yy in range(int(ytip) - 1, int(ybot + hh * .5) + 2):
                    if lay.get(xx, yy)[3] == 0:
                        continue
                    if lay.get(xx, yy + 1)[3] == 0:
                        r = rnd.random()
                        if r < .50:
                            lay.set(xx, yy + 1, dk if r < .34 else base)
                        if r > .88:
                            lay.px[xx, yy] = T
            # needle clumps for texture
            for _ in range(int(half * .9)):
                px = int(cx + rnd.uniform(-half, half) * .92)
                py = int(y + rnd.uniform(-hh * .25, hh * .45))
                if lay.get(px, py)[3] > 0:
                    c = rnd.choice([dk, hi, lt, base])
                    lay.set(px, py, c)
                    if rnd.random() < .4:
                        lay.set(px + 1, py, c)
            # dark seam so stacked boughs stay separated
            for xx in range(int(cx - half), int(cx + half) + 1):
                yy = int(ybot + hh * .06)
                if lay.get(xx, yy)[3] > 0 and rnd.random() < .8:
                    lay.set(xx, yy, dk)
        img.blit(lay, 0, 0)
    else:
        pal = LEAF_PALS[kind]
        trunk_h = int(20 * size)
        tw = max(4, int(6 * size))
        ty = h - 4 - trunk_h
        img.rect(cx - tw // 2, ty, tw, trunk_h, BARK[1])
        img.vline(cx - tw // 2, ty, trunk_h, BARK[0])
        img.vline(cx + tw // 2 - 1, ty, trunk_h, BARK[0])
        img.vline(cx - tw // 2 + 1, ty, trunk_h, BARK[3])
        for _ in range(int(trunk_h * .5)):
            img.set(cx - tw // 2 + rnd.randrange(1, tw - 1), ty + rnd.randrange(trunk_h), BARK[0])
        # roots
        img.line(cx - tw // 2, h - 5, cx - tw // 2 - 3, h - 3, BARK[0])
        img.line(cx + tw // 2 - 1, h - 5, cx + tw // 2 + 2, h - 3, BARK[0])
        if kind == 'dead':
            # gnarled bare branches, recursive forking
            def branch(x, y, ang, L, depth):
                x2 = x + math.cos(ang) * L
                y2 = y + math.sin(ang) * L
                img.line(x, y, x2, y2, BARK[1] if depth < 2 else BARK[0])
                if depth < 2:
                    img.line(x - 1, y, x2 - 1, y2, BARK[0])
                if depth >= 3 or L < 3:
                    return
                branch(x2, y2, ang - rnd.uniform(.35, .8), L * rnd.uniform(.55, .72), depth + 1)
                branch(x2, y2, ang + rnd.uniform(.35, .8), L * rnd.uniform(.55, .72), depth + 1)
            branch(cx, ty + 2, -math.pi / 2 - .35, 11 * size, 0)
            branch(cx, ty + 4, -math.pi / 2 + .40, 10 * size, 0)
            branch(cx, ty + 7, -math.pi / 2 - .95, 7 * size, 1)
            branch(cx, ty + 8, -math.pi / 2 + 1.0, 7 * size, 1)
        else:
            # branches
            img.line(cx, ty + 4, cx - 6 * size, ty - 3 * size, BARK[1])
            img.line(cx, ty + 7, cx + 6 * size, ty - 2 * size, BARK[1])
            _canopy(img, cx, int(16 * size), 16 * size, 13 * size, pal, rnd, blobs=9)
        if kind == 'cherry':
            for _ in range(6):
                x, y = rnd.randrange(w), rnd.randrange(int(30 * size))
                if img.get(x, y)[3] == 0:
                    img.set(x, y, C('#f4b8cd', 200))
    img.outline_smart()
    return img


def rock(seed, big=False, kind='rock'):
    rnd = random.Random(seed)
    w, h = (26, 22) if big else (16, 14)
    img = Img(w, h)
    col = {'rock': ['#5a5a68', '#767686', '#9296a6', '#42424e'],
           'snow': ['#8e9bb0', '#b6c2d4', '#dfe7f2', '#6a7689'],
           'ash':  ['#463f4a', '#5d5461', '#7a7080', '#332e37']}[kind]
    dk, base, lt, sh = [C(c) for c in col]
    img.ellipse(w // 2, h - 3, w * .36, 2.6, SHADOW)
    n = 3 if big else 2
    for i in range(n):
        cx = w / 2 + rnd.uniform(-w * .18, w * .18)
        cy = h * .55 + rnd.uniform(-2, 2)
        rx = rnd.uniform(w * .22, w * .38)
        ry = rnd.uniform(h * .22, h * .34)
        img.ellipse(cx, cy, rx, ry, base)
        img.ellipse(cx - rx * .25, cy - ry * .3, rx * .6, ry * .55, lt)
        img.ellipse(cx + rx * .3, cy + ry * .35, rx * .5, ry * .45, dk)
    img.shade_bottom(( *sh[:3], 120), rows=1)
    for _ in range(int(w * .7)):
        x, y = rnd.randrange(w), rnd.randrange(h)
        if img.get(x, y)[3] > 0:
            img.set(x, y, rnd.choice([dk, lt]))
    if kind == 'rock' and rnd.random() < .4:
        for _ in range(3):
            x, y = rnd.randrange(3, w - 3), rnd.randrange(3, h - 5)
            if img.get(x, y)[3] > 0:
                img.set(x, y, C('#4f7d3a'))
    img.outline_smart()
    return img


def ore_rock(seed, ore='iron'):
    img = rock(seed, big=True)
    rnd = random.Random(seed + 999)
    cols = {'iron': ['#b7ada6', '#e0d8d0'], 'gold': ['#d9a53a', '#f7dd80'],
            'crystal': ['#4fc6e8', '#b6f2ff'], 'coal': ['#2a2730', '#4c4757']}[ore]
    a, b = C(cols[0]), C(cols[1])
    placed = 0
    tries = 0
    while placed < 5 and tries < 200:
        tries += 1
        x, y = rnd.randrange(4, img.w - 4), rnd.randrange(4, img.h - 5)
        if img.get(x, y)[3] > 0 and img.get(x + 1, y + 1)[3] > 0:
            img.rect(x, y, 2, 2, a)
            img.set(x, y, b)
            placed += 1
    return img


def bush(seed, kind='oak', berries=None):
    rnd = random.Random(seed)
    img = Img(22, 18)
    img.ellipse(11, 15, 7, 2.4, SHADOW)
    _canopy(img, 11, 9, 8.5, 6.5, LEAF_PALS[kind], rnd, blobs=6)
    if berries:
        bc = C(berries)
        for _ in range(rnd.randrange(3, 6)):
            x, y = rnd.randrange(3, 19), rnd.randrange(3, 14)
            if img.get(x, y)[3] > 0:
                img.set(x, y, bc)
                img.set(x, y - 1, C('#ffffff', 90))
    img.outline_smart()
    return img


def flower(seed, col):
    """A small clump of 2-3 blooms on leafy stems (reads as a plant, not a blob)."""
    rnd = random.Random(seed)
    img = Img(14, 14)
    c = C(col)
    dk = mix(c, C('#000000'), .38)
    hi = mix(c, C('#ffffff'), .50)
    ctr = C('#f2d86a')
    st_d, st_l = C('#39642a'), C('#5b8f3c')

    img.ellipse(7, 12.5, 3.6, 1.2, (14, 12, 20, 44))     # ground shadow

    heads = [(7, 4, 1.0), (3.5, 6.5, .82), (10.5, 6.0, .82)]
    rnd.shuffle(heads)
    heads = heads[:2 + (1 if rnd.random() < .6 else 0)]

    for hx, hy, sc in heads:                              # stems first
        img.line(hx, hy + 1, 7 + (hx - 7) * .25, 12, st_d)
        img.line(hx - .4, hy + 1, 6.6 + (hx - 7) * .25, 12, st_l)
    # leaves on the main stem
    img.poly([(7, 9), (3.6, 8.2), (3.2, 10), (6.6, 10.4)], st_d)
    img.poly([(7, 9), (4.4, 8.6), (4.2, 9.6), (6.6, 9.9)], st_l)
    img.poly([(7, 10.4), (10.4, 9.6), (10.8, 11.2), (7.4, 11.6)], st_d)
    img.poly([(7, 10.4), (9.6, 10.0), (9.8, 10.9), (7.4, 11.2)], st_l)

    for hx, hy, sc in heads:                              # blooms
        # round bloom mass first, then petal separations carved in
        img.ellipse(hx, hy, 2.5 * sc, 2.3 * sc, c)
        img.ellipse(hx - .5 * sc, hy - .5 * sc, 1.5 * sc, 1.3 * sc, hi)
        img.ellipse(hx + .7 * sc, hy + .8 * sc, 1.4 * sc, 1.1 * sc, dk)
        for i in range(5):                                # petal gaps
            a = -math.pi / 2 + (i + .5) / 5 * math.tau
            gx, gy = int(hx + math.cos(a) * 2.3 * sc), int(hy + math.sin(a) * 2.1 * sc)
            if img.get(gx, gy)[3] > 0:
                img.px[gx, gy] = T
        img.ellipse(hx, hy, .9 * sc, .9 * sc, ctr)
        img.set(int(hx), int(hy), mix(ctr, C('#ffffff'), .55))

    # soft dark-green contour instead of harsh black on such a small sprite
    img.outline_smart(tint=(28,42,24), strength=0.62)
    return img


def mushroom(seed, col='#c0453f'):
    rnd = random.Random(seed)
    img = Img(12, 12)
    img.ellipse(6, 10, 3.2, 1.4, SHADOW)
    img.rect(5, 6, 3, 4, C('#e6dcc0'))
    img.vline(5, 6, 4, C('#c3b795'))
    c = C(col)
    img.ellipse(6, 5, 4.6, 3.4, c)
    img.rect(0, 6, 12, 6, T)
    img.ellipse(6, 5, 4.6, 3.4, c)
    for y in range(12):
        for x in range(12):
            if img.get(x, y) == c and (x - 6) * .6 + (y - 5) * .8 > 1.4:
                img.set(x, y, mix(c, C('#000000'), .3))
    for _ in range(3):
        x, y = rnd.randrange(3, 9), rnd.randrange(2, 6)
        if img.get(x, y)[3] > 0:
            img.set(x, y, C('#f2e6d0'))
    img.outline_smart()
    return img


def stump(seed):
    rnd = random.Random(seed)
    img = Img(16, 14)
    img.ellipse(8, 12, 6, 2.2, SHADOW)
    img.rect(3, 5, 10, 7, BARK[1])
    img.vline(3, 5, 7, BARK[0]); img.vline(12, 5, 7, BARK[0])
    img.ellipse(8, 5, 5.2, 2.8, BARK[3])
    img.ellipse(8, 5, 3.2, 1.7, C('#a8865a'))
    img.ellipse(8, 5, 1.4, .8, BARK[2])
    img.outline_smart()
    return img


def ruin_pillar(seed):
    rnd = random.Random(seed)
    img = Img(18, 34)
    img.ellipse(9, 31, 6.5, 2.6, SHADOW)
    base, lt, dk = C('#8d8a82'), C('#aba79c'), C('#65625c')
    img.rect(4, 6, 10, 24, base)
    img.rect(4, 6, 3, 24, lt)
    img.rect(11, 6, 3, 24, dk)
    img.rect(2, 28, 14, 4, base)
    img.rect(2, 28, 14, 1, lt)
    img.rect(3, 3, 12, 4, base)
    img.rect(3, 3, 12, 1, lt)
    for y in range(10, 28, 6):
        img.hline(4, y, 10, dk)
    for _ in range(14):
        x, y = rnd.randrange(2, 16), rnd.randrange(3, 32)
        if img.get(x, y)[3] > 0:
            img.set(x, y, rnd.choice([lt, dk]))
    if rnd.random() < .6:
        for _ in range(4):
            x, y = rnd.randrange(4, 14), rnd.randrange(8, 28)
            img.set(x, y, C('#4f7d3a'))
            img.set(x, y + 1, C('#3d6330'))
    img.outline_smart()
    return img


def shrine(seed):
    rnd = random.Random(seed)
    img = Img(34, 38)
    img.ellipse(17, 34, 13, 4, SHADOW)
    base, lt, dk = C('#8d8a82'), C('#b3afa4'), C('#5f5c56')
    img.rect(4, 26, 26, 8, base)
    img.rect(4, 26, 26, 1, lt)
    img.rect(4, 33, 26, 1, dk)
    img.rect(8, 20, 18, 7, base)
    img.rect(8, 20, 18, 1, lt)
    img.poly([(17, 4), (27, 12), (27, 21), (7, 21), (7, 12)], base)
    img.poly([(17, 4), (17, 21), (7, 21), (7, 12)], lt)
    img.poly([(17, 4), (27, 12), (24, 12), (17, 6)], C('#c8c4b8'))
    glow = C('#5fd4ee')
    img.ellipse(17, 14, 3.4, 3.4, glow)
    img.ellipse(17, 14, 1.8, 1.8, C('#d6fbff'))
    for a in range(6):
        ang = a / 6 * math.tau
        img.set(int(17 + math.cos(ang) * 6), int(14 + math.sin(ang) * 6), glow)
    img.outline_smart()
    return img


def campfire(seed):
    frames = []
    for f in range(4):
        rnd = random.Random(seed * 7 + f)
        img = Img(20, 20)
        img.ellipse(10, 17, 7, 2.6, SHADOW)
        for i, (x, y) in enumerate([(4, 13), (13, 13), (8, 15), (2, 15), (14, 15)]):
            img.ellipse(x + 1, y + 1, 2.6, 1.8, C('#5a5a68'))
            img.ellipse(x + 1, y + .6, 2.2, 1.4, C('#83839a'))
        img.line(4, 13, 14, 9, C('#54402a'))
        img.line(15, 13, 6, 9, C('#3a2a1c'))
        fy = 11 - f % 2
        img.ellipse(10, fy, 3.4, 4.6 + (f % 3) * .4, C('#e8622a'))
        img.ellipse(10, fy + .6, 2.2, 3.2, C('#f7a02c'))
        img.ellipse(10, fy + 1.4, 1.2, 1.8, C('#ffe07a'))
        for _ in range(3):
            img.set(rnd.randrange(7, 13), rnd.randrange(2, 7), C('#ffbb55', 200))
        frames.append(img)
    return frames


def chest(seed):
    img = Img(18, 16)
    img.ellipse(9, 14, 7, 2.2, SHADOW)
    w1, w2, w3 = C('#6b4526'), C('#8a5b33'), C('#a5744a')
    img.rect(2, 6, 14, 8, w2)
    img.rect(2, 6, 14, 1, w3)
    img.rect(2, 13, 14, 1, w1)
    img.ellipse(9, 6, 7, 4, w2)
    img.rect(2, 7, 14, 6, w2)
    img.ellipse(9, 6, 7, 4, w2)
    for y in range(2, 7):
        img.hline(2, y, 14, w2 if y % 2 else w3)
    img.rect(2, 6, 14, 1, C('#4a3ada', 0))
    img.hline(2, 7, 14, C('#c9a227'))
    img.rect(7, 6, 4, 5, C('#c9a227'))
    img.set(8, 9, C('#3a2a1c')); img.set(9, 9, C('#3a2a1c'))
    img.outline_smart()
    return img


def grass_tuft(seed):
    """Curved blades fanning out from a base - reads as a tuft, not a barcode."""
    rnd = random.Random(seed)
    img = Img(14, 12)
    c_d, c_m, c_l = C('#3f6b2c'), C('#5d8c40'), C('#82b062')
    n = rnd.randrange(5, 8)
    for i in range(n):
        t = i / (n - 1) - .5                       # -0.5 .. 0.5 fan position
        bx = 7 + t * 2.4
        hgt = rnd.uniform(5, 9)
        curve = t * 3.4 + rnd.uniform(-.5, .5)
        col = c_l if abs(t) < .22 else (c_m if rnd.random() < .6 else c_d)
        px = bx
        for k in range(int(hgt)):
            f = k / max(1, hgt - 1)
            px = bx + curve * f * f                # accelerating bend
            img.set(int(round(px)), 10 - k, col)
            if k < hgt * .45:                      # thicker at the base
                img.set(int(round(px)) + (1 if t >= 0 else -1), 10 - k, c_d)
        img.set(int(round(px)), 10 - int(hgt), c_l)   # lit tip
    return img


def cattail(seed):
    rnd = random.Random(seed)
    img = Img(12, 22)
    img.ellipse(6, 20, 3.4, 1.2, (14, 12, 20, 44))
    for i, (x, top) in enumerate([(3, 8), (6, 4), (9, 7)]):
        img.vline(x, top + 3, 17 - top, C('#3d5a2b'))
        img.vline(x + 1, top + 3, 17 - top, C('#5c8440'))
        # brown seed head with a lit left edge
        img.rect(x, top, 2, 5, C('#6b4a26'))
        img.vline(x, top, 5, C('#8a6435'))
        img.set(x, top, C('#a07c46')); img.set(x + 1, top + 4, C('#4e341a'))
        img.set(x + 1, top - 1, C('#3d5a2b'))
    # a couple of blade leaves
    img.line(3, 17, 1, 11, C('#4a7331')); img.line(9, 17, 11, 12, C('#4a7331'))
    img.outline_smart(tint=(28,42,24), strength=0.62)
    return img


def cactus(seed):
    rnd = random.Random(seed)
    img = Img(20, 30)
    img.ellipse(10, 27, 6, 2.2, SHADOW)
    g, gl, gd = C('#3f7a44'), C('#57a05a'), C('#2c5a31')
    img.rect(8, 6, 5, 21, g)
    img.rect(8, 6, 2, 21, gl)
    img.rect(12, 6, 1, 21, gd)
    img.ellipse(10, 6, 2.5, 2.2, g); img.ellipse(9, 6, 1.4, 1.8, gl)
    img.rect(4, 14, 4, 3, g); img.rect(4, 10, 3, 6, g); img.ellipse(5, 10, 1.6, 1.6, gl)
    img.rect(13, 18, 4, 3, g); img.rect(15, 13, 3, 7, g); img.ellipse(16, 13, 1.6, 1.6, gl)
    for y in range(8, 26, 3):
        img.set(9, y, C('#e8e0c0')); img.set(12, y + 1, C('#e8e0c0'))
    img.outline_smart()
    return img


# ------------------------------------------------------------ shelter
def bedroll(seed):
    """A rolled-out sleeping mat: the player's respawn + sleep spot."""
    rnd = random.Random(seed)
    img = Img(22, 16)
    img.ellipse(11, 14, 9, 2.4, SHADOW)
    # mat
    cl_d, cl_m, cl_l = C('#5a3f22'), C('#7d5a30'), C('#a07a44')
    img.rect(2, 5, 18, 8, cl_m)
    img.rect(2, 5, 18, 1, cl_l)
    img.rect(2, 12, 18, 1, cl_d)
    img.vline(2, 5, 8, cl_d); img.vline(19, 5, 8, cl_d)
    # woven texture
    for y in range(6, 12, 2):
        for x in range(3, 19, 3):
            img.set(x, y, cl_d)
            img.set(x + 1, y, cl_l)
    # pillow / folded blanket at the head
    p_d, p_m, p_l = C('#8a4a3a'), C('#b06a4e'), C('#d49472')
    img.rect(3, 3, 7, 4, p_m)
    img.rect(3, 3, 7, 1, p_l)
    img.rect(3, 6, 7, 1, p_d)
    img.set(3, 3, p_d); img.set(9, 3, p_d)
    # blanket fold at the foot
    img.rect(12, 8, 7, 4, C('#6b7a4a'))
    img.rect(12, 8, 7, 1, C('#8a9a63'))
    img.hline(12, 11, 7, C('#4f5c36'))
    img.outline_smart(strength=0.8)
    return img


def wall_wood(seed, post=False):
    """Log wall segment. `post` draws a corner pillar variant."""
    rnd = random.Random(seed)
    img = Img(16, 26)
    img.ellipse(8, 24, 7, 2.2, SHADOW)
    d, m, l = C('#3f2b18'), C('#63432a'), C('#8a6440')
    if post:
        img.rect(4, 4, 8, 20, m)
        img.rect(4, 4, 3, 20, l)
        img.rect(10, 4, 2, 20, d)
        # ring detail at the top
        img.ellipse(8, 4, 4, 2.2, C('#a8834f'))
        img.ellipse(8, 4, 2.2, 1.2, C('#75552f'))
        for y in range(7, 23, 4):
            img.hline(5, y, 6, d)
    else:
        # stacked horizontal logs
        for i, y in enumerate(range(4, 24, 5)):
            img.rect(1, y, 14, 4, m)
            img.rect(1, y, 14, 1, l)
            img.hline(1, y + 3, 14, d)
            for _ in range(3):
                gx = rnd.randrange(2, 13)
                img.set(gx, y + 1 + rnd.randrange(2), d)
            img.set(1, y + 1, d); img.set(14, y + 1, d)
    img.outline_smart(strength=0.82)
    return img


def door_wood(seed, open_=False):
    rnd = random.Random(seed)
    img = Img(16, 26)
    img.ellipse(8, 24, 7, 2.2, SHADOW)
    d, m, l = C('#3f2b18'), C('#63432a'), C('#8a6440')
    # frame posts always visible
    img.rect(0, 3, 3, 21, m); img.rect(13, 3, 3, 21, m)
    img.rect(0, 3, 1, 21, l); img.rect(15, 3, 1, 21, d)
    img.rect(0, 2, 16, 2, m); img.rect(0, 2, 16, 1, l)
    if open_:
        # swung inward: a thin slab against the left post
        img.rect(3, 5, 3, 18, C('#54391f'))
        img.rect(3, 5, 1, 18, C('#75542f'))
        img.rect(6, 5, 7, 18, (0, 0, 0, 90))     # dark interior gap
    else:
        pd, pm, pl = C('#4a331c'), C('#6d4b2b'), C('#916b44')
        img.rect(3, 4, 10, 20, pm)
        for x in range(3, 13, 3):
            img.vline(x, 4, 20, pd)
            img.vline(x + 1, 4, 20, pl)
        img.hline(3, 9, 10, pd); img.hline(3, 18, 10, pd)
        img.hline(3, 10, 10, pl); img.hline(3, 19, 10, pl)
        # iron handle
        img.set(11, 14, C('#c3c9d6')); img.set(11, 15, C('#8f96a6'))
        img.set(10, 14, C('#5a6070'))
    img.outline_smart(strength=0.82)
    return img


def cliff_top(seed):
    rnd = random.Random(seed)
    img = Img(16, 8)
    dk, lt = C('#5f5c56'), C('#8d8a82')
    img.rect(0, 0, 16, 8, lt)
    for _ in range(5):
        x, y = rnd.randrange(16), rnd.randrange(8)
        img.set(x, y, dk)
    return img

def cliff_face(seed):
    rnd = random.Random(seed)
    img = Img(16, 16)
    dk, md = C('#3f3c36'), C('#5f5c56')
    img.rect(0, 0, 16, 16, dk)
    for _ in range(8):
        x, y = rnd.randrange(16), rnd.randrange(16)
        img.set(x, y, md)
        img.hline(max(0, x-1), y, rnd.randrange(2, 5), md)
    return img
