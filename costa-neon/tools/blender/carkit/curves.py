# Curvas e interpolación sin dependencias (sirve dentro y fuera de Blender).
import math


def clamp(x, a, b):
    return a if x < a else (b if x > b else x)


def lerp(a, b, t):
    return a + (b - a) * t


def smoothstep(a, b, x):
    if b == a:
        return 1.0 if x >= b else 0.0
    t = clamp((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


class Pchip:
    """Interpolación cúbica monótona (Fritsch-Carlson): sin sobrepicos entre nodos."""

    def __init__(self, pts):
        pts = sorted((float(a), float(b)) for a, b in pts)
        self.x = [p[0] for p in pts]
        self.y = [p[1] for p in pts]
        n = len(pts)
        if n == 1:
            self.m = [0.0]
            return
        h = [self.x[i + 1] - self.x[i] for i in range(n - 1)]
        d = [(self.y[i + 1] - self.y[i]) / h[i] for i in range(n - 1)]
        m = [0.0] * n
        if n == 2:
            m = [d[0], d[0]]
        else:
            for i in range(1, n - 1):
                if d[i - 1] * d[i] <= 0:
                    m[i] = 0.0
                else:
                    w1 = 2 * h[i] + h[i - 1]
                    w2 = h[i] + 2 * h[i - 1]
                    m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i])

            def end(h0, h1, d0, d1):
                mm = ((2 * h0 + h1) * d0 - h0 * d1) / (h0 + h1)
                if mm * d0 <= 0:
                    return 0.0
                if d0 * d1 <= 0 and abs(mm) > abs(3 * d0):
                    return 3 * d0
                return mm

            m[0] = end(h[0], h[1], d[0], d[1])
            m[-1] = end(h[-1], h[-2], d[-1], d[-2])
        self.m = m

    def __call__(self, x):
        xs = self.x
        n = len(xs)
        if n == 1 or x <= xs[0]:
            return self.y[0]
        if x >= xs[-1]:
            return self.y[-1]
        lo, hi = 0, n - 1
        while hi - lo > 1:
            mid = (lo + hi) // 2
            if xs[mid] <= x:
                lo = mid
            else:
                hi = mid
        h = xs[hi] - xs[lo]
        t = (x - xs[lo]) / h
        t2 = t * t
        t3 = t2 * t
        return ((2 * t3 - 3 * t2 + 1) * self.y[lo] + (t3 - 2 * t2 + t) * h * self.m[lo]
                + (-2 * t3 + 3 * t2) * self.y[hi] + (t3 - t2) * h * self.m[hi])


def table(v):
    """Valor constante o tabla [[x, y], ...] → función."""
    if isinstance(v, (list, tuple)) and v and isinstance(v[0], (list, tuple)):
        return Pchip(v)
    c = float(v)
    return lambda _x: c


def unit(vx, vz):
    l = math.hypot(vx, vz) or 1e-12
    return (vx / l, vz / l)


def rot(v, ang):
    c, s = math.cos(ang), math.sin(ang)
    return (v[0] * c - v[1] * s, v[0] * s + v[1] * c)


def bezier(p0, p1, p2, p3, t):
    u = 1.0 - t
    a, b, c, d = u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t
    return (a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1])


def resample(pts, n, bias=0.0, cluster='ends'):
    """n+1 puntos equiespaciados en longitud de arco sobre una polilínea densa.
    bias∈[0,1] agrupa puntos hacia los extremos ('ends'), el inicio ('start') o el final ('end')."""
    acc = [0.0]
    for i in range(1, len(pts)):
        acc.append(acc[-1] + math.dist(pts[i], pts[i - 1]))
    L = acc[-1] or 1e-12
    out = []
    k = 0
    for i in range(n + 1):
        u = i / n
        if bias > 0:
            if cluster == 'ends':
                w = 0.5 - 0.5 * math.cos(math.pi * u)
            elif cluster == 'start':
                w = u ** 1.6
            else:
                w = 1 - (1 - u) ** 1.6
            u = lerp(u, w, bias)
        s = u * L
        while k < len(acc) - 2 and acc[k + 1] < s:
            k += 1
        seg = acc[k + 1] - acc[k]
        f = (s - acc[k]) / seg if seg > 1e-12 else 0.0
        out.append((lerp(pts[k][0], pts[k + 1][0], f), lerp(pts[k][1], pts[k + 1][1], f)))
    return out


def superellipse_r(th, a, b, n):
    """Radio polar de una superelipse |x/a|^n + |y/b|^n = 1 en el ángulo th."""
    c, s = abs(math.cos(th)), abs(math.sin(th))
    return (((c / a) ** n) + ((s / b) ** n)) ** (-1.0 / n)
