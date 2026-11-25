# Lectura de imágenes Radiance .hdr (RGBE, con o sin RLE) y utilidades de cielos equirectangulares.
import re
import numpy as np


def read_hdr(path):
    """Devuelve un arreglo float32 (alto, ancho, 3) con la radiancia lineal."""
    with open(path, 'rb') as f:
        data = f.read()
    # encabezado: líneas de texto hasta una línea vacía, después la resolución "-Y alto +X ancho"
    pos = 0
    while True:
        end = data.index(b'\n', pos)
        line = data[pos:end]
        pos = end + 1
        if line.strip() == b'':
            break
    end = data.index(b'\n', pos)
    res = data[pos:end].decode()
    pos = end + 1
    m = re.match(r'-Y (\d+) \+X (\d+)', res)
    if not m:
        raise ValueError('orientación no soportada: ' + res)
    h, w = int(m.group(1)), int(m.group(2))
    buf = np.frombuffer(data, dtype=np.uint8, offset=pos)
    out = np.empty((h, w, 4), dtype=np.uint8)
    i = 0
    for y in range(h):
        if w >= 8 and w < 32768 and int(buf[i]) == 2 and int(buf[i + 1]) == 2 and (int(buf[i + 2]) << 8 | int(buf[i + 3])) == w:
            i += 4
            for c in range(4):
                x = 0
                row = out[y, :, c]
                while x < w:
                    n = int(buf[i])
                    i += 1
                    if n > 128:
                        n -= 128
                        row[x:x + n] = buf[i]
                        i += 1
                    else:
                        row[x:x + n] = buf[i:i + n]
                        i += n
                    x += n
        else:
            out[y] = buf[i:i + w * 4].reshape(w, 4)
            i += w * 4
    e = out[..., 3].astype(np.int32)
    scale = np.where(e > 0, np.ldexp(1.0, e - 136), 0.0).astype(np.float32)
    return out[..., :3].astype(np.float32) * scale[..., None]


def lum(img):
    return img[..., 0] * 0.2126 + img[..., 1] * 0.7152 + img[..., 2] * 0.0722


def directions(h, w):
    """Dirección de cada píxel (convención equirectangular: u=0 → -X, crece hacia +Z... ver dir_of)."""
    v = (np.arange(h) + 0.5) / h
    u = (np.arange(w) + 0.5) / w
    theta = (0.5 - v) * np.pi            # elevación: +90° arriba
    phi = (u - 0.5) * 2 * np.pi          # azimut
    return theta[:, None] * np.ones((1, w)), np.ones((h, 1)) * phi[None, :]


def solid_angles(h, w):
    th, _ = directions(h, w)
    return (np.cos(th) * (np.pi / h) * (2 * np.pi / w)).astype(np.float32)


def find_sun(img, frac=0.5):
    """Centro y radio angular del sol: píxeles por encima de frac × el máximo cerca del máximo."""
    L = lum(img)
    h, w = L.shape
    y0, x0 = np.unravel_index(np.argmax(L), L.shape)
    th, ph = directions(h, w)
    sel = L > L[y0, x0] * frac
    # sólo la mancha conectada alrededor del máximo (ventana de ±3°)
    win = int(np.ceil(3.0 / 180.0 * h))
    mask = np.zeros_like(sel)
    ys = slice(max(0, y0 - win), min(h, y0 + win + 1))
    xs = slice(max(0, x0 - win * 2), min(w, x0 + win * 2 + 1))
    mask[ys, xs] = sel[ys, xs]
    wts = L * mask
    ty = (th * wts).sum() / wts.sum()
    # azimut medio con vectores (evita el salto en ±π)
    cx = (np.cos(ph) * wts).sum()
    sx = (np.sin(ph) * wts).sum()
    return float(ty), float(np.arctan2(sx, cx)), mask, (int(y0), int(x0))


def sun_region(img, elev, azim, radius_deg):
    h, w = img.shape[:2]
    th, ph = directions(h, w)
    d = np.stack([np.cos(th) * np.cos(ph), np.sin(th), np.cos(th) * np.sin(ph)], -1)
    s = np.array([np.cos(elev) * np.cos(azim), np.sin(elev), np.cos(elev) * np.sin(azim)])
    ang = np.degrees(np.arccos(np.clip(d @ s, -1, 1)))
    return ang < radius_deg, ang
