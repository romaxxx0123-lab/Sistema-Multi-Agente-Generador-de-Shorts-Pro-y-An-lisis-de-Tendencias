# Forma de la chapa leída del sombreado de la foto.
# El auto real y el modelo están bajo la MISMA luz (la panorámica), así que el brillo de cada punto depende de
# hacia dónde mira la chapa. Con el render del modelo y sus normales se calibra, columna por columna, el brillo
# en función de la inclinación vertical de la normal (n_z); invirtiendo esa curva sobre la foto se obtiene la
# inclinación real a cada altura, y al integrarla, el perfil de la sección (cuánto sale o entra la chapa).
#   python3 shading.py <render.npy> <render_n.npy> <escena.json> <salida> <col1,col2,...> [ancho de banda]
import os, sys, json, numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from photo import load_band, view, tonemap
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from PIL import Image, ImageDraw

LW = np.array([0.2126, 0.7152, 0.0722])


def photo_for(scene_path, W, H):
    S = json.load(open(scene_path))
    C = S['cam']
    elp = C.get('el_photo', C['el'])
    d = os.path.dirname(scene_path) or '.'
    cache = '%s/photo_%d_%d_%.3f_%.3f_%.3f.npy' % (d, W, H, C['fov'], C['az'], elp)
    if os.path.exists(cache):
        return np.load(cache), S
    band, meta = load_band(os.path.join(d, 'band20k.npy'))
    ph = view(band, meta, W, H, C['fov'], C['az'], elp)
    np.save(cache, ph)
    return ph, S


def column(ph, r, nrm, x, half):
    """perfiles por fila (promedio en la banda x±half) de brillo foto/render y n_z del modelo (sólo pintura)"""
    sl = slice(x - half, x + half + 1)
    paint = nrm[:, sl, :3].sum(-1) > 0.1
    Lp = (ph[:, sl] @ LW)
    Lr = (r[:, sl, :3] @ LW)
    N = nrm[:, sl, :3] * 2 - 1
    rows = np.nonzero(paint.mean(1) > 0.8)[0]
    lp = np.array([Lp[i][paint[i]].mean() for i in rows])
    lr = np.array([Lr[i][paint[i]].mean() for i in rows])
    nz = np.array([N[i][paint[i]][:, 2].mean() for i in rows])
    nx = np.array([N[i][paint[i]][:, 0].mean() for i in rows])
    return rows, lp, lr, nz, nx


def segments(rows):
    """tramos de filas contiguas (la pintura se corta en vidrios, manijas, molduras)"""
    out, cur = [], [rows[0]]
    for a, b in zip(rows[:-1], rows[1:]):
        if b - a > 2:
            out.append(cur)
            cur = []
        cur.append(b)
    out.append(cur)
    return [np.array(s) for s in out if len(s) > 12]


if __name__ == '__main__':
    a = sys.argv[1:]
    r = np.load(a[0])
    nrm = np.load(a[1])
    H, W = r.shape[:2]
    ph, S = photo_for(a[2], W, H)
    out = a[3]
    cols = [int(c) for c in a[4].split(',')]
    half = int(a[5]) if len(a) > 5 else 6
    e = S['exposure']
    fig, axes = plt.subplots(1, len(cols), figsize=(3.2 * len(cols), 7), sharey=True)
    report = {}
    for ax, x in zip(np.atleast_1d(axes), cols):
        rows, lp, lr, nz, nx = column(ph, r, nrm, x, half)
        if len(rows) < 20:
            continue
        # calibración brillo(n_z) con el render: polinomio monótono de grado 3 en la banda
        o = np.argsort(nz)
        cf = np.polyfit(nz[o], lr[o], 3)
        grid = np.linspace(nz.min() - 0.15, nz.max() + 0.15, 400)
        fg = np.polyval(cf, grid)
        mono = np.all(np.diff(fg) > 0) or np.all(np.diff(fg) < 0)
        # ganancia: el promedio de la foto se lleva al del render (polvo, color real de la pintura)
        g = float(np.median(lr) / max(np.median(lp), 1e-6))
        nz_real = np.interp(lp * g, fg if fg[0] < fg[-1] else fg[::-1], grid if fg[0] < fg[-1] else grid[::-1])
        ax.plot(lp * g, rows, color='#d9480f', lw=1.6, label='foto (×%.2f)' % g)
        ax.plot(lr, rows, color='#1971c2', lw=1.6, label='modelo')
        ax2 = ax.twiny()
        ax2.plot(nz, rows, color='#1971c2', lw=1, ls='--', label='n_z modelo')
        ax2.plot(nz_real, rows, color='#d9480f', lw=1, ls='--', label='n_z leído de la foto')
        ax2.set_xlim(-0.8, 0.8)
        ax2.set_xlabel('inclinación n_z (− mira abajo, + mira arriba)', fontsize=7)
        ax.set_title('columna x=%d%s' % (x, '' if mono else ' (calibración no monótona)'), fontsize=8)
        ax.set_xlabel('brillo lineal', fontsize=8)
        ax.invert_yaxis()
        report[x] = dict(rows=rows.tolist(), nz_model=np.round(nz, 3).tolist(), nz_real=np.round(nz_real, 3).tolist(),
                         gain=g, monotonic=bool(mono))
    np.atleast_1d(axes)[0].set_ylabel('fila de la imagen (arriba = techo)')
    np.atleast_1d(axes)[0].legend(fontsize=7, loc='lower left')
    plt.tight_layout()
    plt.savefig(out + '_perfiles.png', dpi=90)
    json.dump(report, open(out + '_perfiles.json', 'w'))
    # imagen de referencia con las columnas marcadas sobre la foto y el modelo
    A = Image.fromarray(tonemap(ph, e)); B = Image.fromarray(tonemap(r[..., :3] + (1 - r[..., 3:4]) * ph, e))
    for im in (A, B):
        d = ImageDraw.Draw(im)
        for x in cols:
            d.line([(x, 0), (x, H)], fill=(255, 220, 0), width=2)
            d.text((x + 3, 5), str(x), fill=(255, 220, 0))
    sbs = Image.new('RGB', (W * 2 + 8, H), (255, 255, 255)); sbs.paste(A, (0, 0)); sbs.paste(B, (W + 8, 0))
    sbs.resize((W, H // 2)).save(out + '_columnas.png')
    print('ok', out)
