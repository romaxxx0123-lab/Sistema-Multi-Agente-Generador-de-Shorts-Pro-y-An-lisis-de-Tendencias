# Relieves finos sobre la carrocería ya loftada: pliegues con canto vivo, escalones, abombados y hundidos
# pequeños (los que dan la "riqueza" de una chapa real: nervios del capó, línea de carácter afilada, zona
# cóncava bajo la línea baja de las puertas, escalón del paragolpes, marcos en relieve de las tomas).
# Cada operación se define en un espacio 2D de proyección y desplaza los vértices a lo largo de su normal:
#   space 'side'  (y, z) sólo caras que miran al costado   (normal.x > nmin)
#   space 'top'   (x, y) sólo caras que miran arriba        (normal.z > nmin)
#   space 'front' (x, z) sólo caras que miran adelante      (normal.y > nmin)
#   space 'rear'  (x, z) sólo caras que miran atrás         (normal.y < -nmin)
# Operaciones:
#   ridge: pliegue a lo largo de una polilínea; h > 0 canto saliente, h < 0 canal. w = (ancho a la izquierda,
#          ancho a la derecha) de la polilínea; el perfil cae con potencia p (p > 1 = canto más vivo).
#   step:  escalón: el lado izquierdo de la polilínea se desplaza h, con transición de ancho w.
#   dome:  abombado (h > 0) u hondo (h < 0) elíptico de centro c y radios r.
# taper: distancia en los extremos de la polilínea donde el relieve se desvanece.
import math
import numpy as np


def _proj(co, space):
    if space == 'side':
        return co[:, 1], co[:, 2]
    if space == 'top':
        return co[:, 0], co[:, 1]
    return co[:, 0], co[:, 2]   # front / rear


def _mask(nrm, space, nmin):
    if space == 'side':
        return nrm[:, 0] > nmin
    if space == 'top':
        return nrm[:, 2] > nmin
    if space == 'front':
        return nrm[:, 1] > nmin
    return nrm[:, 1] < -nmin


def _polyline_field(u, v, pts):
    """Distancia con signo (+ a la izquierda) a la polilínea y posición a lo largo (m) con su largo total."""
    P = np.asarray(pts, float)
    best = np.full(u.shape, np.inf)
    sgn = np.zeros(u.shape)
    along = np.zeros(u.shape)
    acc = 0.0
    for a, b in zip(P[:-1], P[1:]):
        d = b - a
        L = float(np.hypot(*d))
        if L < 1e-9:
            continue
        t = np.clip(((u - a[0]) * d[0] + (v - a[1]) * d[1]) / (L * L), 0.0, 1.0)
        px, py = a[0] + d[0] * t, a[1] + d[1] * t
        dist = np.hypot(u - px, v - py)
        side = np.sign(d[0] * (v - a[1]) - d[1] * (u - a[0]))
        m = dist < best
        best = np.where(m, dist, best)
        sgn = np.where(m, side, sgn)
        along = np.where(m, acc + t * L, along)
        acc += L
    return best * np.where(sgn == 0, 1, sgn), along, acc


def apply(bm, ops, log=print):
    bm.normal_update()
    verts = list(bm.verts)
    co = np.array([v.co[:] for v in verts])
    nrm = np.array([v.normal[:] for v in verts])
    disp = np.zeros(len(verts))
    for op in ops:
        sp = op['space']
        m = _mask(nrm, sp, op.get('nmin', 0.25))
        if 'xrange' in op:
            m &= (co[:, 0] >= op['xrange'][0]) & (co[:, 0] <= op['xrange'][1])
        if 'yrange' in op:
            m &= (co[:, 1] >= op['yrange'][0]) & (co[:, 1] <= op['yrange'][1])
        if 'zrange' in op:
            m &= (co[:, 2] >= op['zrange'][0]) & (co[:, 2] <= op['zrange'][1])
        if not m.any():
            continue
        u, v = _proj(co[m], sp)
        h = op['h']
        kind = op['op']
        if kind in ('ridge', 'step'):
            s, along, L = _polyline_field(u, v, op['pts'])
            w = op.get('w', 0.04)
            wl, wr = (w, w) if not isinstance(w, (tuple, list)) else w
            if kind == 'ridge':
                ww = np.where(s >= 0, wl, wr)
                x = np.clip(1.0 - np.abs(s) / ww, 0.0, 1.0)
                f = x ** op.get('p', 2.0)
            else:
                f = np.clip(0.5 + s / max(w if not isinstance(w, (tuple, list)) else w[0], 1e-6), 0.0, 1.0)
                f = f * f * (3 - 2 * f)
            tp = op.get('taper', 0.0)
            if tp > 0:
                e = np.minimum(along, L - along)
                f = f * np.clip(e / tp, 0.0, 1.0) ** 0.7
            # fuera del largo de la polilínea (proyección en los extremos) no se esculpe
            disp[m] += h * f
        elif kind == 'dome':
            (cu, cv), (ru, rv) = op['c'], op['r']
            r2 = ((u - cu) / ru) ** 2 + ((v - cv) / rv) ** 2
            f = np.clip(1.0 - r2, 0.0, 1.0) ** op.get('p', 2.0)
            disp[m] += h * f
    for v, d, n in zip(verts, disp, nrm):
        if d != 0.0:
            v.co.x += n[0] * d
            v.co.y += n[1] * d
            v.co.z += n[2] * d
    bm.normal_update()
    log('relieves: %d operaciones, %d vértices movidos (máx %.1f mm)' % (len(ops), int((disp != 0).sum()), 1000 * float(np.abs(disp).max() if len(disp) else 0)))


def kidney(x_in, x_out, z_bot, z_top, r_out=0.05, r_in=0.02, bow=0.012, top_slope=-0.006, n=12):
    """Contorno de un riñón (mitad derecha de la parrilla) en vista frontal: borde interior recto,
    borde exterior abombado, esquinas exteriores de radio grande y borde superior que sigue al capó."""
    pts = []

    def arc(cx, cz, r, a0, a1):
        for i in range(n + 1):
            a = math.radians(a0 + (a1 - a0) * i / n)
            pts.append((cx + r * math.cos(a), cz + r * math.sin(a)))
    zt_out = z_top + top_slope
    arc(x_in + r_in, z_bot + r_in, r_in, 180, 270)          # abajo-adentro
    arc(x_out - r_out, z_bot + r_out, r_out, 270, 360)      # abajo-afuera
    arc(x_out - r_out, zt_out - r_out, r_out, 0, 90)        # arriba-afuera
    arc(x_in + r_in, z_top - r_in, r_in, 90, 180)           # arriba-adentro
    out = []
    for (x, z) in pts:
        # el borde exterior se abomba hacia afuera (máximo a media altura)
        t = (z - z_bot) / max(z_top - z_bot, 1e-6)
        k = max(0.0, (x - (x_in + x_out) / 2) / ((x_out - x_in) / 2))
        x += bow * math.sin(math.pi * min(max(t, 0.0), 1.0)) * k ** 3
        # y el superior baja levemente hacia afuera siguiendo el capó
        out.append((round(x, 4), round(z, 4)))
    return out[::-1]   # mismo sentido que los contornos de los demás diseños
