# Superficie de la carrocería: secciones con puntos de carácter unidas por Bézier con tangentes
# controladas (pliegues nítidos o uniones suaves) + techo/capó/baúl como campo de alturas.
# El centro usa secciones planas (y = cte); la trompa y la cola usan secciones en abanico alrededor
# de un eje vertical, así las esquinas en planta quedan redondeadas sin degenerar la malla.
#
# Puntos de cada media sección (r hacia afuera, z arriba), de abajo al centro de arriba:
#   P0 centro del piso · P1 borde del piso · P2 zócalo · P3 línea baja · P4 hombro (línea de carácter)
#   P5 cintura / corona del guardabarros / borde del baúl · P6 riel del techo / pilar / pliegue del capó
#   P7 centro de arriba (campo de alturas)
# Segmentos: S0..S5 entre Pk y Pk+1 (Bézier), S6 de P6 a P7 (campo de alturas).
import math
from .curves import Pchip, table, lerp, smoothstep, clamp, unit, rot, bezier, resample, superellipse_r

DEG = math.pi / 180.0


class Body:
    def __init__(self, D):
        self.D = D
        self.y_fc = D['y_fc']
        self.y_rc = D['y_rc']
        self.zc = table(D['zc'])
        self.camber = table(D['camber'])
        self.pw = table(D['pw'])
        self.r = {k: table(v) for k, v in D['r'].items()}
        self.z = {k: table(v) for k, v in D['z'].items()}
        self.bulge = {k: table(v) for k, v in D['bulge'].items()}
        self.crease = {k: table(v) for k, v in D['crease'].items()}
        self.tan_s = {k: table(v) for k, v in D.get('tan_s', {}).items()}
        self.tan_e = {k: table(v) for k, v in D.get('tan_e', {}).items()}
        self.counts = D['counts']
        fl = D.get('flare', {})
        self.flare_axes = fl.get('axes', [])  # [(y, amp, ancho)]
        self.flare_w = fl.get('feats', {})

    # ------------------------------------------------------------ campo de alturas de arriba
    def ztop(self, x, y):
        yy = clamp(y, self.y_rc, self.y_fc)
        rr = self.r[6](yy) + self.flare(yy, 6)
        u = min(1.0, abs(x) / max(rr, 1e-6))
        return self.zc(y) - self.camber(y) * u ** self.pw(y)

    def flare(self, y, k):
        w = self.flare_w.get(k, 0.0)
        if not w:
            return 0.0
        v = 0.0
        for (ya, amp, wid) in self.flare_axes:
            v += amp * math.exp(-((y - ya) / wid) ** 2)
        return v * w

    # ------------------------------------------------------------ puntos de carácter
    def feats_planar(self, y):
        P = [(0.0, self.z[0](y))]
        for k in range(1, 6):
            P.append((self.r[k](y) + self.flare(y, k), self.z[k](y)))
        r6 = self.r[6](y) + self.flare(y, 6)
        P.append((r6, self.ztop(r6, y)))
        return P

    def params_planar(self, y):
        prm = {'bulge': {}, 'crease': {}, 'tan_s': {}, 'tan_e': {}}
        for k, f in self.bulge.items():
            prm['bulge'][k] = f(y)
        for k, f in self.crease.items():
            prm['crease'][k] = f(y)
        for k, f in self.tan_s.items():
            prm['tan_s'][k] = f(y)
        for k, f in self.tan_e.items():
            prm['tan_e'][k] = f(y)
        return prm

    def feats_fan(self, th, end):
        E = self.D[end]
        ya = self.y_fc if end == 'front' else self.y_rc
        sg = 1.0 if end == 'front' else -1.0
        base = self.feats_planar(ya)
        c, s = math.cos(th), math.sin(th)
        P = [(0.0, base[0][1])]
        for k in range(1, 7):
            a = base[k][0]
            b = E['rf'][k]
            r = superellipse_r(th, a, b, E['n'][k])
            if k < 6:
                t0, t1 = E.get('zt', {}).get(k, (0.0, 1.0))
                w = smoothstep(t0, t1, th / (math.pi / 2))
                z = lerp(base[k][1], E['z'][k], w)
            else:
                z = self.ztop(r * c, ya + sg * r * s)
            P.append((r, z))
        return P

    def params_fan(self, th, end):
        E = self.D[end]
        ya = self.y_fc if end == 'front' else self.y_rc
        base = self.params_planar(ya)
        w = smoothstep(0.0, 1.0, th / (math.pi / 2))
        prm = {'bulge': {}, 'crease': {}, 'tan_s': {}, 'tan_e': {}}
        for key in prm:
            src = E.get(key, {})
            keys = set(base[key]) | set(src)
            for k in keys:
                b0 = base[key].get(k)
                b1 = src.get(k, b0)
                if b0 is None:
                    b0 = b1
                prm[key][k] = lerp(b0, b1, w)
        return prm

    # ------------------------------------------------------------ sección muestreada
    def section(self, P, prm, plane):
        """P: 7 puntos (r, z); plane = (ox, oy, dx, dy). Devuelve [(r, z, t)] con t = k + fracción."""
        ox, oy, dx, dy = plane
        n = len(P)
        ds, de = [], []
        for k in range(n - 1):
            ch = unit(P[k + 1][0] - P[k][0], P[k + 1][1] - P[k][1])
            b = prm['bulge'].get(k, 0.0) * DEG
            s = rot(ch, -b)
            e = rot(ch, b)
            if k in prm['tan_s']:
                a = prm['tan_s'][k] * DEG
                s = (math.cos(a), math.sin(a))
            if k in prm['tan_e']:
                a = prm['tan_e'][k] * DEG
                e = (math.cos(a), math.sin(a))
            ds.append(s)
            de.append(e)
        # el piso sale horizontal desde el eje (simetría)
        ds[0] = (1.0, 0.0)
        # uniones: pliegue c=1 conserva cada lado; c=0 une con tangente común
        for k in range(1, n - 1):
            c = clamp(prm['crease'].get(k, 0.0), 0.0, 1.0)
            ov_e = (k - 1) in prm['tan_e']
            ov_s = k in prm['tan_s']
            if ov_e and not ov_s:
                avg = de[k - 1]
            elif ov_s and not ov_e:
                avg = ds[k]
            else:
                avg = unit(de[k - 1][0] + ds[k][0], de[k - 1][1] + ds[k][1])
            de[k - 1] = unit(lerp(avg[0], de[k - 1][0], c), lerp(avg[1], de[k - 1][1], c))
            ds[k] = unit(lerp(avg[0], ds[k][0], c), lerp(avg[1], ds[k][1], c))
        # tangente del campo de alturas en P6 (yendo hacia el centro)
        r6, z6 = P[6]
        eps = max(1e-3, r6 * 0.01)
        zt = self.ztop(ox + (r6 - eps) * dx, oy + (r6 - eps) * dy)
        dh = unit(-eps, zt - z6)
        c6 = clamp(prm['crease'].get(6, 1.0), 0.0, 1.0)
        de[5] = unit(lerp(dh[0], de[5][0], c6), lerp(dh[1], de[5][1], c6))
        out = []
        for k in range(n - 1):
            p0, p3 = P[k], P[k + 1]
            L = math.dist(p0, p3)
            h = L * 0.38
            p1 = (p0[0] + ds[k][0] * h, p0[1] + ds[k][1] * h)
            p2 = (p3[0] - de[k][0] * h, p3[1] - de[k][1] * h)
            dense = [bezier(p0, p1, p2, p3, i / 64) for i in range(65)]
            ca = prm['crease'].get(k, 0.0) if k > 0 else 0.0
            cb = prm['crease'].get(k + 1, 0.0)
            bias = 0.3 if max(ca, cb) > 0.5 else 0.0
            cl = 'ends' if (ca > 0.5 and cb > 0.5) else ('start' if ca > 0.5 else 'end')
            pts = resample(dense, self.counts[k], bias, cl)
            for i, (r, z) in enumerate(pts[:-1]):
                out.append((r, z, k + i / self.counts[k]))
        # techo/capó/baúl: del pliegue P6 al eje, más denso cerca del pliegue
        nt = self.counts[6]
        dense = []
        for i in range(97):
            u = i / 96
            r = r6 * (1 - u)
            dense.append((r, self.ztop(ox + r * dx, oy + r * dy)))
        pts = resample(dense, nt, 0.45, 'start')
        for i, (r, z) in enumerate(pts):
            out.append((max(0.0, r), z, 6 + i / nt))
        out[-1] = (0.0, out[-1][1], 7.0)
        return out

    # ------------------------------------------------------------ estaciones
    def planar_ys(self):
        D = self.D
        y0, y1 = self.y_rc, self.y_fc
        hmax = D.get('h_max', 0.045)
        keys = D.get('key_y', [])

        def h(y):
            v = hmax
            for (ky, hmin, rad) in keys:
                v = min(v, lerp(hmin, hmax, smoothstep(0.0, rad, abs(y - ky))))
            return v
        fixed = sorted(set([y0, y1] + [k[0] for k in keys if y0 < k[0] < y1]))
        ys = [y0]
        for a, b in zip(fixed[:-1], fixed[1:]):
            seg = [a]
            while seg[-1] < b - 1e-9:
                seg.append(seg[-1] + h(seg[-1]))
            m = max(1, round((b - a) / ((seg[-1] - a) / (len(seg) - 1))))
            # reparto uniforme en "pasos" respetando la densidad: integración del espaciado
            acc = [0.0]
            N = 400
            for i in range(1, N + 1):
                yy = a + (b - a) * i / N
                acc.append(acc[-1] + (b - a) / N / h(yy))
            total = acc[-1]
            m = max(1, round(total))
            j = 0
            for q in range(1, m):
                target = total * q / m
                while acc[j + 1] < target:
                    j += 1
                f = (target - acc[j]) / (acc[j + 1] - acc[j])
                ys.append(a + (b - a) * (j + f) / N)
            ys.append(b)
        return ys

    def stations(self):
        D = self.D
        out = []
        nr = D.get('n_rear', 24)
        nf = D.get('n_front', 26)
        RS = 0.6
        for i in range(nr, 0, -1):
            th = (math.pi / 2) * i / nr
            out.append(dict(kind='rear', th=th, s=self.y_rc - th * RS,
                            plane=(0.0, self.y_rc, math.cos(th), -math.sin(th)),
                            P=self.feats_fan(th, 'rear'), prm=self.params_fan(th, 'rear')))
        for y in self.planar_ys():
            out.append(dict(kind='planar', y=y, s=y, plane=(0.0, y, 1.0, 0.0),
                            P=self.feats_planar(y), prm=self.params_planar(y)))
        for i in range(1, nf + 1):
            th = (math.pi / 2) * i / nf
            out.append(dict(kind='front', th=th, s=self.y_fc + th * RS,
                            plane=(0.0, self.y_fc, math.cos(th), math.sin(th)),
                            P=self.feats_fan(th, 'front'), prm=self.params_fan(th, 'front')))
        for st in out:
            st['sec'] = self.section(st['P'], st['prm'], st['plane'])
        return out


def to3d(plane, r, z):
    ox, oy, dx, dy = plane
    return (ox + r * dx, oy + r * dy, z)


def build_half(bm, body):
    """Malla de media carrocería (x >= 0) en un bmesh. Capas: p3 (posición), s (estación), t (sección)."""
    lp = bm.verts.layers.float_vector.new('p3')
    ls = bm.verts.layers.float.new('s')
    lt = bm.verts.layers.float.new('t')
    sts = body.stations()
    poles = {}

    def pole(key, co, s, t):
        if key not in poles:
            v = bm.verts.new(co)
            v[lp] = co
            v[ls] = s
            v[lt] = t
            poles[key] = v
        return poles[key]
    grid = []
    for st in sts:
        row = []
        last = len(st['sec']) - 1
        for j, (r, z, t) in enumerate(st['sec']):
            co = to3d(st['plane'], r, z)
            end = None
            if st['kind'] == 'rear' or (st['kind'] == 'planar' and abs(st['y'] - body.y_rc) < 1e-9):
                end = 'rear'
            if st['kind'] == 'front' or (st['kind'] == 'planar' and abs(st['y'] - body.y_fc) < 1e-9):
                end = 'front'
            if end and j == 0:
                row.append(pole((end, 'bot'), co, st['s'], t))
                continue
            if end and j == last:
                row.append(pole((end, 'top'), co, st['s'], t))
                continue
            v = bm.verts.new(co)
            v[lp] = co
            v[ls] = st['s']
            v[lt] = t
            row.append(v)
        grid.append(row)
    faces = []
    for i in range(len(grid) - 1):
        a, b = grid[i], grid[i + 1]
        for j in range(len(a) - 1):
            q = [a[j], b[j], b[j + 1], a[j + 1]]
            uq = []
            for v in q:
                if v not in uq:
                    uq.append(v)
            if len(uq) < 3:
                continue
            try:
                f = bm.faces.new(uq)
                faces.append(f)
            except ValueError:
                pass
    return sts, grid, faces
