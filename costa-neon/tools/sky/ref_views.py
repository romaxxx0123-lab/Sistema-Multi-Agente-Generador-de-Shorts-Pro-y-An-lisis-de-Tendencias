# Vistas en perspectiva (como una foto a la altura de los ojos) de un HDR urbano de 360°, con exposición
# automática y el mismo tone mapping AgX del juego: referencia real para comparar capturas.
# Uso: python3 ref_views.py <hdr> <salida_prefijo> [yaw1,yaw2,...] [fov] [pitch]
import os, sys
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hdr import read_hdr, lum

SRGB_TO_2020 = np.array([[0.6274, 0.3293, 0.0433], [0.0691, 0.9195, 0.0114], [0.0164, 0.0880, 0.8956]])
R2020_TO_SRGB = np.linalg.inv(SRGB_TO_2020)
INSET = np.array([[0.856627153315983, 0.137318972929847, 0.11189821299995],
                  [0.0951212405381588, 0.761241990602591, 0.0767994186031903],
                  [0.0482516061458583, 0.101439036467562, 0.811302368396859]]).T
OUTSET = np.array([[1.1271005818144368, -0.1413297634984383, -0.14132976349843826],
                   [-0.11060664309660323, 1.157823702216272, -0.11060664309660294],
                   [-0.016493938717834573, -0.016493938717834257, 1.2519364065950405]]).T


def agx(c):
    c = c @ SRGB_TO_2020.T
    c = c @ INSET.T
    c = np.log2(np.maximum(c, 1e-10))
    c = np.clip((c + 12.47393) / (4.026069 + 12.47393), 0, 1)
    x2 = c * c
    x4 = x2 * x2
    c = 15.5 * x4 * x2 - 40.14 * x4 * c + 31.96 * x4 - 6.868 * x2 * c + 0.4298 * x2 + 0.1191 * c - 0.00232
    c = c @ OUTSET.T
    c = np.power(np.maximum(c, 0), 2.2)
    c = c @ R2020_TO_SRGB.T
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(c, 1 / 2.4) - 0.055)


def view(img, yaw, pitch, fov, W=960, H=540):
    h, w = img.shape[:2]
    f = 0.5 * W / np.tan(np.radians(fov) / 2)
    xs = np.arange(W) - W / 2 + 0.5
    ys = np.arange(H) - H / 2 + 0.5
    X, Y = np.meshgrid(xs, -ys)
    d = np.stack([X, Y, np.full_like(X, f)], -1)
    d /= np.linalg.norm(d, axis=-1, keepdims=True)
    cp, sp = np.cos(np.radians(pitch)), np.sin(np.radians(pitch))
    d = np.stack([d[..., 0], d[..., 1] * cp + d[..., 2] * sp, -d[..., 1] * sp + d[..., 2] * cp], -1)
    cy, sy = np.cos(np.radians(yaw)), np.sin(np.radians(yaw))
    d = np.stack([d[..., 0] * cy + d[..., 2] * sy, d[..., 1], -d[..., 0] * sy + d[..., 2] * cy], -1)
    el = np.arcsin(np.clip(d[..., 1], -1, 1))
    az = np.arctan2(d[..., 2], d[..., 0])
    u = ((az / (2 * np.pi) + 0.5) * w).astype(int) % w
    v = np.clip(((0.5 - el / np.pi) * h).astype(int), 0, h - 1)
    return img[v, u]


if __name__ == '__main__':
    src, out = sys.argv[1], sys.argv[2]
    yaws = [float(y) for y in sys.argv[3].split(',')] if len(sys.argv) > 3 else [0, 90, 180, 270]
    fov = float(sys.argv[4]) if len(sys.argv) > 4 else 60
    pitch = float(sys.argv[5]) if len(sys.argv) > 5 else -4
    img = read_hdr(src)
    for yw in yaws:
        v = view(img, yw, pitch, fov)
        # exposición automática: el promedio logarítmico de la escena a gris medio (como una cámara)
        L = lum(v)
        key = np.exp(np.mean(np.log(np.maximum(L, 1e-5))))
        e = 0.18 / key
        Image.fromarray((agx(v * e) * 255 + 0.5).astype(np.uint8)).save('%s_%03d.png' % (out, int(yw)))
    print('ok', out)
