# Vista en perspectiva de la panorámica con la MISMA convención que Blender (z arriba, equirect de Cycles),
# para superponer renders con la foto. Cámara: azimut az (desde +X hacia +Y), elevación el, campo fov horizontal.
import os, sys, json, numpy as np
from PIL import Image
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'sky'))
from ref_views import agx


def cam_rot(az, el):
    a, b = np.radians(90 + el), np.radians(az - 90)
    Rx = np.array([[1, 0, 0], [0, np.cos(a), -np.sin(a)], [0, np.sin(a), np.cos(a)]])
    Rz = np.array([[np.cos(b), -np.sin(b), 0], [np.sin(b), np.cos(b), 0], [0, 0, 1]])
    return Rz @ Rx


def cam_dirs(W, H, fov, az, el):
    f = 0.5 * W / np.tan(np.radians(fov) / 2)
    X, Y = np.meshgrid(np.arange(W) - W / 2 + 0.5, -(np.arange(H) - H / 2 + 0.5))
    c = np.stack([X, Y, -np.full_like(X, f)], -1)
    d = c @ cam_rot(az, el).T
    return d / np.linalg.norm(d, axis=-1, keepdims=True)


def dir_to_px(D, meta):
    u = 0.5 - np.arctan2(D[..., 1], D[..., 0]) / (2 * np.pi)
    v = 0.5 - np.arcsin(np.clip(D[..., 2], -1, 1)) / np.pi
    return u * meta['W'] - 0.5 - meta['c0'], v * meta['H'] - 0.5 - meta['r0']


def px_to_dir(px, py, meta):
    """píxel de la banda (columna, fila) → dirección del mundo de Blender"""
    u = (px + 0.5 + meta['c0']) / meta['W']
    v = (py + 0.5 + meta['r0']) / meta['H']
    az = (0.5 - u) * 2 * np.pi
    el = (0.5 - v) * np.pi
    return np.array([np.cos(el) * np.cos(az), np.cos(el) * np.sin(az), np.sin(el)])


def sample(band, x, y):
    h, w = band.shape[:2]
    x0 = np.clip(np.floor(x).astype(int), 0, w - 2)
    y0 = np.clip(np.floor(y).astype(int), 0, h - 2)
    fx = np.clip(x - x0, 0, 1)[..., None]
    fy = np.clip(y - y0, 0, 1)[..., None]
    a = band[y0, x0] * (1 - fx) + band[y0, x0 + 1] * fx
    b = band[y0 + 1, x0] * (1 - fx) + band[y0 + 1, x0 + 1] * fx
    return a * (1 - fy) + b * fy


def load_band(path):
    return np.load(path, mmap_mode='r'), json.load(open(path.replace('.npy', '.json')))


def view(band, meta, W, H, fov, az, el):
    D = cam_dirs(W, H, fov, az, el)
    x, y = dir_to_px(D, meta)
    return sample(np.asarray(band), x, y).astype(np.float32)


def tonemap(lin, e):
    return (agx(lin * e) * 255 + 0.5).astype(np.uint8)


if __name__ == '__main__':
    # photo.py <band.npy> <salida> W H fov az el [exposición]
    a = sys.argv[1:]
    band, meta = load_band(a[0])
    W, H = int(a[2]), int(a[3])
    fov, az, el = float(a[4]), float(a[5]), float(a[6])
    lin = view(band, meta, W, H, fov, az, el)
    if len(a) > 7:
        e = float(a[7])
    else:
        L = lin @ np.array([0.2126, 0.7152, 0.0722])
        e = 0.18 / float(np.exp(np.mean(np.log(np.maximum(L, 1e-5)))))
    np.save(a[1] + '.npy', lin)
    Image.fromarray(tonemap(lin, e)).save(a[1] + '.png')
    json.dump(dict(W=W, H=H, fov=fov, az=az, el=el, exposure=e), open(a[1] + '.json', 'w'))
    print('ok', a[1], 'exposición', round(e, 4))
