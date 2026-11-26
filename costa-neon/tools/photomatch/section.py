# Sección real de la chapa lateral leída de la foto (ver shading.py): por columna, sólo chapa que mira al
# costado y sin destellos de sol; calibración brillo(n_z) con el modelo, inversión sobre la foto e integración
# de la pendiente para obtener cuánto sale la chapa (x) a cada altura (z), real y del modelo.
#   python3 section.py <render.npy> <render_n.npy> <escena.json> <vista.json> <salida> <col1,col2,...>
import os, sys, json, numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from shading import photo_for, LW
from grid import projector
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from scipy.ndimage import median_filter

a = sys.argv[1:]
r = np.load(a[0]); nrm = np.load(a[1])
H, W = r.shape[:2]
ph, S = photo_for(a[2], W, H)
V = json.load(open(a[3]))
out = a[4]
cols = [int(c) for c in a[5].split(',')]
proj, ray = projector(V, S)
half = 5
fig, axes = plt.subplots(2, len(cols), figsize=(3.1 * len(cols), 10), sharey='row')
res = {}
for j, x in enumerate(cols):
    sl = slice(x - half, x + half + 1)
    N = nrm[:, sl, :3] * 2 - 1
    paint = (nrm[:, sl, :3].sum(-1) > 0.1) & (N[..., 0] > 0.45)
    ok = paint.mean(1) > 0.8
    rows = np.nonzero(ok)[0]
    if len(rows) < 30:
        continue
    lp = np.array([(ph[i, sl] @ LW)[paint[i]].mean() for i in rows])
    lr = np.array([(r[i, sl, :3] @ LW)[paint[i]].mean() for i in rows])
    nz = np.array([N[i][paint[i]][:, 2].mean() for i in rows])
    # destellos de sol: fuera (en el modelo y en la foto)
    base = median_filter(lr, 31)
    keep = (lr < base * 2.5) & (lp < median_filter(lp, 31) * 2.5)
    rows, lp, lr, nz = rows[keep], lp[keep], lr[keep], nz[keep]
    # altura de cada fila sobre el plano x = 0,80 (costado)
    z = np.array([ray(x, i, np.array([1.0, 0, 0]), 0.80)[2] for i in rows])
    # calibración log(brillo) = f(n_z) con el modelo (recta robusta: la relación es casi lineal en el costado)
    A = np.vstack([nz, np.ones_like(nz)]).T
    c, *_ = np.linalg.lstsq(A, np.log(lr), rcond=None)
    # ganancia de la foto (color real, polvo): que la media de log coincida
    off = np.median(np.log(lr)) - np.median(np.log(lp))
    nz_real = np.clip((np.log(lp) + off - c[1]) / c[0], -0.9, 0.9)
    nz_real = median_filter(nz_real, 7)
    # integración: dx/dz = -n_z / n_x
    def integ(nzv):
        nx = np.sqrt(np.clip(1 - nzv ** 2, 0.05, 1))
        o = np.argsort(z)
        zz, s = z[o], -nzv[o] / nx[o]
        xs = np.concatenate([[0], np.cumsum(0.5 * (s[1:] + s[:-1]) * np.diff(zz))])
        return zz, xs - xs.max()
    zz, xm = integ(nz)
    _, xr = integ(nz_real)
    ax = axes[0, j]
    ax.plot(np.exp(np.log(lp) + off), z, color='#d9480f', lw=1.4, label='foto')
    ax.plot(lr, z, color='#1971c2', lw=1.4, label='modelo')
    ax.set_title('columna %d: brillo' % x, fontsize=9)
    ax2 = axes[1, j]
    ax2.plot(xr * 100, zz, color='#d9480f', lw=2, label='real (leído de la foto)')
    ax2.plot(xm * 100, zz, color='#1971c2', lw=2, label='modelo')
    ax2.set_title('sección: cuánto sale la chapa (cm)', fontsize=9)
    ax2.set_xlabel('cm (0 = punto más saliente)')
    ax2.grid(alpha=0.3)
    res[x] = dict(z=np.round(zz, 3).tolist(), x_real=np.round(xr, 4).tolist(), x_model=np.round(xm, 4).tolist(),
                  slope=float(c[0]))
axes[0, 0].set_ylabel('altura z (m)'); axes[1, 0].set_ylabel('altura z (m)')
axes[0, 0].legend(fontsize=8); axes[1, 0].legend(fontsize=8)
plt.tight_layout(); plt.savefig(out + '_seccion.png', dpi=85)
json.dump(res, open(out + '_seccion.json', 'w'))
print('ok', out)
