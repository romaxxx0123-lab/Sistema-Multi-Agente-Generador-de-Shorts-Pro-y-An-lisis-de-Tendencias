"""Pixel-art drawing helpers: tiny software renderer on top of PIL."""
from PIL import Image
import math, random

T = (0, 0, 0, 0)
OUTL = (22, 18, 30, 255)


def shash(s):
    """Hash estable entre procesos (FNV-1a).

    `hash()` de Python está salado por proceso desde 3.3, asi que usarlo como
    semilla hacia que cada `python3 bake.py` generara menas y espuma distintas.
    """
    h = 2166136261
    for ch in str(s):
        h = ((h ^ ord(ch)) * 16777619) & 0xffffffff
    return h


def C(h, a=255):
    h = h.lstrip('#')
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)


class Img:
    def __init__(self, w, h, bg=T):
        self.w, self.h = w, h
        self.im = Image.new('RGBA', (w, h), bg)
        self.px = self.im.load()

    # ---------- basics ----------
    def get(self, x, y):
        if 0 <= x < self.w and 0 <= y < self.h:
            return self.px[x, y]
        return T

    def set(self, x, y, c, wrap=False):
        if c is None or c[3] == 0:
            return
        if wrap:
            x %= self.w
            y %= self.h
        if 0 <= x < self.w and 0 <= y < self.h:
            if c[3] == 255:
                self.px[x, y] = c
            else:
                self.px[x, y] = self._blend(self.px[x, y], c)

    @staticmethod
    def _blend(dst, src):
        a = src[3] / 255.0
        ia = 1 - a
        na = src[3] + int(dst[3] * ia)
        if na == 0:
            return T
        return (int(src[0] * a + dst[0] * ia), int(src[1] * a + dst[1] * ia),
                int(src[2] * a + dst[2] * ia), min(255, na))

    def rect(self, x, y, w, h, c, wrap=False):
        for j in range(int(h)):
            for i in range(int(w)):
                self.set(int(x) + i, int(y) + j, c, wrap)

    def hline(self, x, y, w, c, wrap=False):
        self.rect(x, y, w, 1, c, wrap)

    def vline(self, x, y, h, c, wrap=False):
        self.rect(x, y, 1, h, c, wrap)

    def ellipse(self, cx, cy, rx, ry, c, wrap=False, fill=True):
        rx = max(rx, 0.5)
        ry = max(ry, 0.5)
        for j in range(int(math.floor(cy - ry)), int(math.ceil(cy + ry)) + 1):
            for i in range(int(math.floor(cx - rx)), int(math.ceil(cx + rx)) + 1):
                dx = (i + 0.5 - cx) / rx
                dy = (j + 0.5 - cy) / ry
                d = dx * dx + dy * dy
                if d <= 1.0:
                    if fill or d > 0.45:
                        self.set(i, j, c, wrap)

    def line(self, x0, y0, x1, y1, c, wrap=False):
        x0, y0, x1, y1 = int(x0), int(y0), int(x1), int(y1)
        dx, dy = abs(x1 - x0), -abs(y1 - y0)
        sx = 1 if x0 < x1 else -1
        sy = 1 if y0 < y1 else -1
        err = dx + dy
        while True:
            self.set(x0, y0, c, wrap)
            if x0 == x1 and y0 == y1:
                break
            e2 = 2 * err
            if e2 >= dy:
                err += dy
                x0 += sx
            if e2 <= dx:
                err += dx
                y0 += sy

    def poly(self, pts, c):
        ys = [p[1] for p in pts]
        for y in range(int(min(ys)), int(max(ys)) + 1):
            xs = []
            n = len(pts)
            for i in range(n):
                x1, y1 = pts[i]
                x2, y2 = pts[(i + 1) % n]
                if (y1 <= y < y2) or (y2 <= y < y1):
                    xs.append(x1 + (y - y1) * (x2 - x1) / (y2 - y1))
            xs.sort()
            for k in range(0, len(xs) - 1, 2):
                for x in range(int(math.floor(xs[k])), int(math.ceil(xs[k + 1]))):
                    self.set(x, y, c)

    def blit(self, other, x, y, wrap=False):
        for j in range(other.h):
            for i in range(other.w):
                self.set(x + i, y + j, other.px[i, j], wrap)

    def copy(self):
        n = Img(self.w, self.h)
        n.im = self.im.copy()
        n.px = n.im.load()
        return n

    def flip(self):
        n = Img(self.w, self.h)
        n.im = self.im.transpose(Image.FLIP_LEFT_RIGHT)
        n.px = n.im.load()
        return n

    def crop(self, x, y, w, h):
        n = Img(w, h)
        n.im = self.im.crop((x, y, x + w, y + h))
        n.px = n.im.load()
        return n

    def offset(self, dx, dy):
        n = Img(self.w, self.h)
        for j in range(self.h):
            for i in range(self.w):
                n.set(i + dx, j + dy, self.px[i, j])
        return n

    # ---------- stylistic passes ----------
    def outline_smart(self, tint=(26, 20, 34), strength=0.72, diag=False,
                      sat=0.55, floor=0.10):
        """Coloured contour: each outline pixel is a darkened version of the
        shape colour it touches, pulled toward `tint`.

        Flat black outlines make sprites read as stickers; deriving the
        contour from the local hue keeps forms integrated with the scene
        while still separating them from the background.
        """
        dirs = [(-1, 0), (1, 0), (0, -1), (0, 1)]
        if diag:
            dirs += [(-1, -1), (1, -1), (-1, 1), (1, 1)]
        add = {}
        for y in range(self.h):
            for x in range(self.w):
                if self.px[x, y][3] != 0:
                    continue
                acc = [0, 0, 0]
                n = 0
                for dx, dy in dirs:
                    nb = self.get(x + dx, y + dy)
                    if nb[3] > 128:
                        acc[0] += nb[0]; acc[1] += nb[1]; acc[2] += nb[2]
                        n += 1
                if not n:
                    continue
                r, g, b = acc[0] / n, acc[1] / n, acc[2] / n
                # desaturate slightly toward its own luma, then darken to tint
                lum = 0.299 * r + 0.587 * g + 0.114 * b
                r = r + (lum - r) * (1 - sat)
                g = g + (lum - g) * (1 - sat)
                b = b + (lum - b) * (1 - sat)
                r = r * (1 - strength) + tint[0] * strength
                g = g * (1 - strength) + tint[1] * strength
                b = b * (1 - strength) + tint[2] * strength
                # never let the contour go fully black - keeps hue readable
                r = max(r, tint[0] * (1 + floor))
                g = max(g, tint[1] * (1 + floor))
                b = max(b, tint[2] * (1 + floor))
                add[(x, y)] = (int(r), int(g), int(b), 255)
        for (x, y), c in add.items():
            self.set(x, y, c)

    def inner_shade(self, tint=(20, 16, 28), strength=0.30):
        """Darken opaque pixels that sit on the shape's own boundary.
        Adds a subtle turn-of-form so silhouettes aren't uniformly bright."""
        edge = []
        for y in range(self.h):
            for x in range(self.w):
                if self.px[x, y][3] < 200:
                    continue
                if (self.get(x - 1, y)[3] == 0 or self.get(x + 1, y)[3] == 0 or
                        self.get(x, y - 1)[3] == 0 or self.get(x, y + 1)[3] == 0):
                    edge.append((x, y))
        for x, y in edge:
            r, g, b, a = self.px[x, y]
            self.px[x, y] = (int(r * (1 - strength) + tint[0] * strength),
                             int(g * (1 - strength) + tint[1] * strength),
                             int(b * (1 - strength) + tint[2] * strength), a)

    def rim_light(self, c=(255, 244, 214, 120), side='tl'):
        """Add a light rim on the lit side so the sprite separates from
        a dark background (keeps the player readable in forests/night)."""
        dx, dy = {'tl': (-1, -1), 'tr': (1, -1), 'bl': (-1, 1), 'br': (1, 1)}[side]
        hits = []
        for y in range(self.h):
            for x in range(self.w):
                if self.px[x, y][3] < 200:
                    continue
                if self.get(x + dx, y)[3] == 0 or self.get(x, y + dy)[3] == 0:
                    hits.append((x, y))
        for x, y in hits:
            self.set(x, y, c)

    def drop_shadow(self, cy=None, rx=None, ry=None, a=64):
        """Soft contact ellipse under the sprite (grounds it on the terrain)."""
        cols = [x for x in range(self.w)
                if any(self.px[x, y][3] > 180 for y in range(self.h))]
        if not cols:
            return
        cx = (min(cols) + max(cols) + 1) / 2
        base = max(y for y in range(self.h)
                   for x in range(self.w) if self.px[x, y][3] > 180)
        rx = rx if rx is not None else (max(cols) - min(cols) + 1) * 0.44
        ry = ry if ry is not None else max(1.4, rx * 0.34)
        sh = Img(self.w, self.h)
        sh.ellipse(cx, cy if cy is not None else base - ry * 0.4, rx, ry, (12, 10, 18, a))
        sh.ellipse(cx, cy if cy is not None else base - ry * 0.4, rx * .6, ry * .6,
                   (12, 10, 18, min(255, a + 26)))
        sh.blit(self, 0, 0)
        self.im = sh.im
        self.px = sh.px

    def outline(self, c=OUTL, diag=False, only_below=False):
        """Add a dark contour around opaque pixels (drawn *outside* the shape)."""
        add = []
        dirs = [(-1, 0), (1, 0), (0, -1), (0, 1)]
        if diag:
            dirs += [(-1, -1), (1, -1), (-1, 1), (1, 1)]
        for y in range(self.h):
            for x in range(self.w):
                if self.px[x, y][3] != 0:
                    continue
                for dx, dy in dirs:
                    n = self.get(x + dx, y + dy)
                    if n[3] > 128 and n != c:
                        if only_below and dy > 0:
                            continue
                        add.append((x, y))
                        break
        for x, y in add:
            self.set(x, y, c)

    def shade_bottom(self, c=(0, 0, 0, 46), rows=2):
        """Darken the lowest opaque pixels of each column (grounding)."""
        for x in range(self.w):
            col = [y for y in range(self.h) if self.px[x, y][3] > 200]
            if not col:
                continue
            for k in range(rows):
                y = max(col) - k
                if y in col:
                    self.set(x, y, c)

    def speckle(self, rnd, colors, amount=0.12, wrap=False, mask_alpha=200):
        for y in range(self.h):
            for x in range(self.w):
                if self.px[x, y][3] >= mask_alpha and rnd.random() < amount:
                    self.set(x, y, rnd.choice(colors), wrap)

    def tint_region(self, x0, y0, w, h, c):
        for j in range(y0, y0 + h):
            for i in range(x0, x0 + w):
                if self.get(i, j)[3] > 0:
                    self.set(i, j, c)

    def alpha_mul(self, f):
        for y in range(self.h):
            for x in range(self.w):
                r, g, b, a = self.px[x, y]
                self.px[x, y] = (r, g, b, int(a * f))


def from_map(rows, palette, scale=1):
    """Build an Img from ASCII pixel-art rows using a {char: color} palette."""
    h = len(rows)
    w = max(len(r) for r in rows)
    img = Img(w * scale, h * scale)
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            c = palette.get(ch)
            if c is None or c == T:
                continue
            img.rect(x * scale, y * scale, scale, scale, c)
    return img


def ramp(base, n=5, light=(1.35, 1.3, 1.15), dark=(0.55, 0.55, 0.65)):
    """Build a shading ramp around a base colour: index 0 darkest -> n-1 lightest."""
    out = []
    for i in range(n):
        t = (i / (n - 1)) * 2 - 1  # -1..1
        if t < 0:
            f = [1 + (d - 1) * (-t) for d in dark]
        else:
            f = [1 + (l - 1) * t for l in light]
        out.append((min(255, int(base[0] * f[0])), min(255, int(base[1] * f[1])),
                    min(255, int(base[2] * f[2])), 255))
    return out


def mix(a, b, t):
    return (int(a[0] + (b[0] - a[0]) * t), int(a[1] + (b[1] - a[1]) * t),
            int(a[2] + (b[2] - a[2]) * t), int(a[3] + (b[3] - a[3]) * t))


# ---------- seamless value noise (for tileable textures) ----------
class TileNoise:
    def __init__(self, seed, period=4):
        r = random.Random(seed)
        self.p = period
        self.g = [[r.random() for _ in range(period)] for _ in range(period)]

    def at(self, x, y, size):
        # x,y in pixels; size = tile size in pixels (wraps seamlessly)
        fx = x / size * self.p
        fy = y / size * self.p
        x0, y0 = int(math.floor(fx)), int(math.floor(fy))
        tx, ty = fx - x0, fy - y0
        tx = tx * tx * (3 - 2 * tx)
        ty = ty * ty * (3 - 2 * ty)
        p = self.p
        a = self.g[y0 % p][x0 % p]
        b = self.g[y0 % p][(x0 + 1) % p]
        c = self.g[(y0 + 1) % p][x0 % p]
        d = self.g[(y0 + 1) % p][(x0 + 1) % p]
        return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty


BAYER8 = [
    [0, 32, 8, 40, 2, 34, 10, 42], [48, 16, 56, 24, 50, 18, 58, 26],
    [12, 44, 4, 36, 14, 46, 6, 38], [60, 28, 52, 20, 62, 30, 54, 22],
    [3, 35, 11, 43, 1, 33, 9, 41], [51, 19, 59, 27, 49, 17, 57, 25],
    [15, 47, 7, 39, 13, 45, 5, 37], [63, 31, 55, 23, 61, 29, 53, 21]]


def bayer(x, y):
    return BAYER8[y % 8][x % 8] / 64.0
