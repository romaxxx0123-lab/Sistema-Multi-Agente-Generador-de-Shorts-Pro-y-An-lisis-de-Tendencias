"""Terrain tiles + organic transition masks."""
import math, random
from artlib import Img, C, T, TileNoise, bayer, mix, ramp, shash

TS = 16  # tile size

# Desvío de tono. Hasta ahora cada rampa era el mismo matiz más oscuro o más
# claro: #4f7d3a -> #3d6330 son los dos 100 grados de matiz. Eso se lee plano.
# Rotamos las sombras hacia el frío y las luces hacia el cálido MANTENIENDO
# el valor original de cada tono, que es lo que separa "verde más oscuro" de
# "verde en sombra". Ensanchar el rango de valor aquí no funciona: el tile de
# 16px se convierte en estática. El rango grande viene de la escena.
# Las sombras miran a un azul y las luces a un ámbar, siempre por el arco más
# corto. Rotar siempre en el mismo sentido no sirve: +34 grados enfría un verde
# pero manda la sombra de la arena al verde limón.
COOL_HUE = 232.0
WARM_HUE = 44.0
ROT_SHADOW = 34.0   # tope de rotación de una sombra, en grados
ROT_LIGHT = 20.0    # tope de rotación de una luz


def _hls(hx):
    import colorsys
    hx = hx.lstrip('#')[:6]
    r, g, b = (int(hx[i:i + 2], 16) / 255.0 for i in (0, 2, 4))
    return colorsys.rgb_to_hls(r, g, b)


def _shift(base, tone):
    """Rota el matiz de `tone` hacia frío o cálido, sin tocar su luminosidad."""
    import colorsys
    hb, lb, _ = _hls(base)
    ht, lt, st = _hls(tone)
    if st < 0.04 or abs(lt - lb) < 0.001:
        return tone                                   # gris puro: nada que rotar
    dark = lt < lb
    target = COOL_HUE if dark else WARM_HUE
    cap = ROT_SHADOW if dark else ROT_LIGHT
    arc = (target - hb * 360.0 + 540.0) % 360.0 - 180.0   # arco más corto, con signo
    k = min(1.0, abs(lt - lb) / 0.10)                 # más lejos del base, más rota
    rot = max(-cap, min(cap, arc)) * k
    r, g, b = colorsys.hls_to_rgb((hb + rot / 360.0) % 1.0, lt, st)
    return '#%02x%02x%02x' % (round(r * 255), round(g * 255), round(b * 255))


def _ramp(cols):
    base = cols[0]
    return [base, _shift(base, cols[1]), cols[2],
            _shift(base, cols[3]), _shift(base, cols[4])]


_RAW = {
    # base, dark, light, speck-dark, speck-light
    'grass':   ['#4f7d3a', '#33543a', '#000000', '#3b5c2a', '#78a655'],
    'meadow':  ['#609142', '#3d632b', '#000000', '#487033', '#8ac263'],
    'forest':  ['#355e2d', '#21421b', '#000000', '#26471e', '#558a43'],
    'sand':    ['#d3c086', '#b59a5d', '#000000', '#c2a768', '#eadba1'],
    'dirt':    ['#82623e', '#5e4325', '#000000', '#6e5132', '#9e794f'],
    'rock':    ['#6f6f7d', '#575765', '#000000', '#4c4c59', '#8b8b98'],
    'snow':    ['#e8eef5', '#cdd7e4', '#000000', '#c2ccdb', '#ffffff'],
    'swamp':   ['#4e5b3a', '#3d4930', '#000000', '#36402a', '#66744a'],
    'ash':     ['#4a4148', '#3a333a', '#000000', '#302a30', '#615663'],
}

PAL = {k: _ramp(v) for k, v in _RAW.items()}


def _base_tile(name, seed, variant):
    rnd = random.Random(seed * 977 + variant)
    p = PAL[name]
    base, dark, _, sd, sl = [C(x[:7]) for x in p]
    img = Img(TS, TS, base)
    n1 = TileNoise(seed * 31 + variant, 4)
    n2 = TileNoise(seed * 71 + variant * 7, 8)
    for y in range(TS):
        for x in range(TS):
            # Ruido suave sin estática
            v = n1.at(x, y, TS) * 0.70 + n2.at(x, y, TS) * 0.30
            if v < 0.40:
                img.set(x, y, mix(base, dark, min(1, (0.40 - v) * 3.0)))
            elif v > 0.60:
                img.set(x, y, mix(base, sl, min(1, (v - 0.60) * 2.5)))
    return img, rnd, (base, dark, sd, sl)


def grass_tile(seed, variant, kind='grass'):
    img, rnd, (base, dark, sd, sl) = _base_tile(kind, seed, variant)
    # blades
    blades = {'grass': 16, 'meadow': 20, 'forest': 12, 'swamp': 12}[kind]
    for _ in range(blades):
        x = rnd.randrange(TS)
        y = rnd.randrange(TS)
        h = rnd.choice([1, 2, 2])
        c = sl if rnd.random() < 0.55 else sd
        for k in range(h):
            img.set(x, y - k, c, wrap=True)
        if rnd.random() < 0.25:
            img.set(x + 1, y - h + 1, c, wrap=True)
    if kind == 'meadow':
        # a couple of tiny 2x2 blossoms with a stem - not 1px confetti
        for _ in range(rnd.randrange(1, 3)):
            x, y = rnd.randrange(TS), rnd.randrange(2, TS)
            fc = C(rnd.choice(['#e0c85a', '#d4667a', '#b87fc8', '#e8e4d8']))
            img.set(x, y - 1, C('#4a7331'), wrap=True)      # short stem
            img.set(x, y - 2, fc, wrap=True)
            img.set(x + 1, y - 2, fc, wrap=True)
            img.set(x, y - 3, mix(fc, C('#ffffff'), .45), wrap=True)
            img.set(x + 1, y - 3, fc, wrap=True)
    if kind == 'swamp':
        for _ in range(rnd.randrange(1, 3)):
            x, y = rnd.randrange(TS), rnd.randrange(TS)
            img.ellipse(x, y, rnd.uniform(1.2, 2.4), rnd.uniform(1, 1.8),
                        C('#3c4a3a', 150), wrap=True)
    return img


def sand_tile(seed, variant):
    img, rnd, (base, dark, sd, sl) = _base_tile('sand', seed, variant)
    for _ in range(12):
        x, y = rnd.randrange(TS), rnd.randrange(TS)
        img.set(x, y, sd if rnd.random() < 0.5 else sl, wrap=True)
    for _ in range(rnd.randrange(0, 3)):  # pebbles / shells
        x, y = rnd.randrange(TS), rnd.randrange(TS)
        img.set(x, y, C('#9c8558'), wrap=True)
        img.set(x + 1, y, C('#b39c6e'), wrap=True)
    return img


def dirt_tile(seed, variant):
    img, rnd, (base, dark, sd, sl) = _base_tile('dirt', seed, variant)
    for _ in range(15):
        x, y = rnd.randrange(TS), rnd.randrange(TS)
        img.set(x, y, sd if rnd.random() < 0.6 else sl, wrap=True)
    for _ in range(rnd.randrange(1, 4)):
        x, y = rnd.randrange(TS), rnd.randrange(TS)
        img.set(x, y, C('#5c452e'), wrap=True)
        img.set(x + 1, y, C('#5c452e'), wrap=True)
        img.set(x, y - 1, C('#9d7c50'), wrap=True)
    return img


def rock_tile(seed, variant, kind='rock'):
    img, rnd, (base, dark, sd, sl) = _base_tile(kind, seed, variant)
    # cracked slab look
    for _ in range(rnd.randrange(2, 4)):
        x, y = rnd.randrange(TS), rnd.randrange(TS)
        d = rnd.choice([(1, 1), (1, -1), (1, 0), (0, 1)])
        for k in range(rnd.randrange(3, 7)):
            img.set(x + d[0] * k, y + d[1] * k, sd, wrap=True)
            img.set(x + d[0] * k, y + d[1] * k - 1, mix(base, sl, .5), wrap=True)
    for _ in range(8):
        x, y = rnd.randrange(TS), rnd.randrange(TS)
        img.set(x, y, sl if rnd.random() < 0.4 else sd, wrap=True)
    return img


def snow_tile(seed, variant):
    img, rnd, (base, dark, sd, sl) = _base_tile('snow', seed, variant)
    for _ in range(10):
        x, y = rnd.randrange(TS), rnd.randrange(TS)
        img.set(x, y, C('#ffffff'), wrap=True)
    for _ in range(6):
        x, y = rnd.randrange(TS), rnd.randrange(TS)
        img.set(x, y, C('#c3d0e2'), wrap=True)
    return img


def water_tiles(seed, deep=False, variant=0):
    """6 animated frames of tileable water with travelling wave crests.

    Built from two drifting sine-warped noise fields; crest lines are
    extracted as iso-contours so the surface reads as moving swell rather
    than random dashes.
    """
    if deep:
        cols = ['#12294a', '#193558', '#22456e', '#2d5988', '#437aad']
        crest, spark = C('#6ea8d8'), C('#bfe4f7')
    else:
        cols = ['#1d4d7c', '#276architecture'.replace('architecture', '090'), '#3277ad',
                '#4а90c4'.replace('а', 'a'), '#63aad4']
        cols = ['#1d4d7c', '#276090', '#3277ad', '#4a90c4', '#63aad4']
        crest, spark = C('#a6dcf0'), C('#e8fbff')
    RAMP = [C(c) for c in cols]
    n1 = TileNoise(seed + variant * 313, 4)
    n2 = TileNoise(seed + 5 + variant * 71, 8)
    n3 = TileNoise(seed + 11 + variant * 37, 2)
    FR = 6
    frames = []
    for f in range(FR):
        img = Img(TS, TS)
        t = f / FR
        ph = t * TS
        field = [[0.0] * TS for _ in range(TS)]
        for y in range(TS):
            for x in range(TS):
                # broad, slow swell (low frequency = calm open water)
                a = n1.at(x + ph * .5, y + ph * .25, TS)
                b = n3.at(x - ph * .35, y + ph * .3, TS)
                v = a * .62 + b * .38
                field[y][x] = v
        for y in range(TS):
            for x in range(TS):
                v = field[y][x] + (bayer(x, y) - .5) * .04
                idx = int(max(0, min(0.999, (v - .30) / .40)) * (len(RAMP) - 1))
                img.set(x, y, RAMP[idx])
        # sparse horizontal crest dashes riding the top of each swell
        rnd = random.Random(seed * 17 + f * 101 + variant * 911)
        want = 1 if deep else (2 if variant % 2 == 0 else 1)
        placed, guard = 0, 0
        while placed < want and guard < 260:
            guard += 1
            x, y = rnd.randrange(TS), rnd.randrange(TS)
            if field[y][x] < .60:
                continue
            # keep crests apart so they never clump into noise
            if any(img.get((x + dx) % TS, (y + dy) % TS) == crest
                   for dy in range(-2, 3) for dx in range(-4, 5)):
                continue
            ln = rnd.choice([2, 3, 3, 4])
            for k in range(ln):
                img.set(x + k, y, crest, wrap=True)
            # short trailing shadow under the crest gives it thickness
            for k in range(ln):
                px, py = (x + k) % TS, (y + 1) % TS
                img.set(px, py, mix(img.get(px, py), RAMP[0], .45))
            if rnd.random() < .45:
                img.set(x + 1, y - 1, spark, wrap=True)
            placed += 1
        frames.append(img)
    return frames


def foam_frames(masks_dict, n=4):
    """Animated shoreline foam: a bright lip that breathes in and out."""
    out = {}
    for key, m in masks_dict.items():
        for f in range(n):
            t = f / n
            push = 0.5 + 0.5 * math.sin(t * math.tau)      # 0..1 surge
            img = Img(TS, TS)
            for y in range(TS):
                for x in range(TS):
                    a = m[y][x]
                    if a <= 0:
                        continue
                    # foam sits on the outer part of the mask and pulses
                    # only the outermost lip of the mask foams
                    if a < 0.50:
                        continue
                    edge = (a - 0.50) / 0.50 * (0.55 + 0.45 * push)
                    if a > 0.94:
                        c = (255, 255, 255, 225)
                    else:
                        c = (226, 246, 252, 175)
                    if bayer(x, y) > edge * 0.85:
                        continue
                    img.set(x, y, c)
            # scattered bubbles on the leading edge
            rnd = random.Random(shash(key) % 997 + f * 31)
            for _ in range(3):
                bx, by = rnd.randrange(TS), rnd.randrange(TS)
                if m[by][bx] > 0.25:
                    img.set(bx, by, (255, 255, 255, 200))
            out[f'{key}_{f}'] = img
    return out


def masks():
    """Organic transition masks: 4 edges + 4 outer corners + 4 inner corners.
    Returned as alpha maps (0..1) of size TSxTS."""
    out = {}
    rnd = random.Random(4242)

    def jag(i, amp, base_):
        # deterministic wobble along an edge
        return base_ + amp * (0.5 * math.sin(i * 1.1) + 0.5 * math.sin(i * 2.7 + 1.3))

    def edge(dirn):
        m = [[0.0] * TS for _ in range(TS)]
        for i in range(TS):
            depth = jag(i + dirn * 7, 1.7, 5.2)
            depth = max(2.0, depth)
            for k in range(TS):
                a = 1.0 if k < depth - 0.5 else (0.55 if k < depth + 0.6 else 0.0)
                if a == 0:
                    break
                if dirn == 0:    x, y = i, k              # from North
                elif dirn == 1:  x, y = TS - 1 - k, i     # from East
                elif dirn == 2:  x, y = i, TS - 1 - k     # from South
                else:            x, y = k, i              # from West
                m[y][x] = max(m[y][x], a)
        return m

    for d, nm in enumerate(['n', 'e', 's', 'w']):
        out[nm] = edge(d)

    # outer corners (diagonal neighbour only)
    for idx, nm in enumerate(['ne', 'se', 'sw', 'nw']):
        m = [[0.0] * TS for _ in range(TS)]
        cx = TS if nm in ('ne', 'se') else 0
        cy = 0 if nm in ('ne', 'nw') else TS
        for y in range(TS):
            for x in range(TS):
                dx = (x + .5) - cx
                dy = (y + .5) - cy
                d = math.hypot(dx, dy)
                r = 5.4 + 1.3 * math.sin((x + y) * 0.9 + idx)
                if d < r - .6:
                    m[y][x] = 1.0
                elif d < r + .7:
                    m[y][x] = 0.55
        out[nm] = m
    return out


def mask_to_img(m, tex):
    """Apply alpha mask to a texture tile -> transparent overlay sprite."""
    img = Img(TS, TS)
    for y in range(TS):
        for x in range(TS):
            a = m[y][x]
            if a <= 0:
                continue
            r, g, b, _ = tex.px[x, y]
            if a < 1 and bayer(x, y) > a:
                continue
            img.set(x, y, (r, g, b, 255))
    return img
