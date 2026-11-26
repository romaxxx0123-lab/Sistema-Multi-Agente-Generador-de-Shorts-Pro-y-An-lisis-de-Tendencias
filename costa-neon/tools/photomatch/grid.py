# grid.py <vista.json> <escena.json> <salida.png> <plano> [paso]
#   plano: side:<x>  (costado, grilla en y/z)   front:<y> (frente, grilla en x/z)   top:<z> (planta, grilla en x/y)
# Proyecta una grilla en metros del sistema del auto sobre la foto para medir sus líneas.
import os, sys, json, numpy as np
from PIL import Image, ImageDraw
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from photo import cam_rot


def projector(V, S):
    W, H = V['W'], V['H']
    f = 0.5 * W / np.tan(np.radians(V['fov']) / 2)
    C = S['cam']
    R = cam_rot(V['az'], V['el'] + C['el'] - C.get('el_photo', C['el']))
    K = S['car']
    a = np.radians(K['heading'] - 90)
    Rc = np.array([[np.cos(a), -np.sin(a), 0], [np.sin(a), np.cos(a), 0], [0, 0, 1]])
    T = np.array([K['x'], K['y'], K.get('z', 0.0)])
    cam = np.array([0, 0, S['cam']['h']])
    def proj(p):
        w = Rc @ np.asarray(p, float) + T
        c = R.T @ (w - cam)
        if c[2] > -1e-3:
            return None
        return (W / 2 - 0.5 + f * c[0] / -c[2], H / 2 - 0.5 - f * c[1] / -c[2])
    def ray_plane(px, py, n_local, d_local):
        """rayo del píxel ∩ plano (n·p = d en coordenadas del auto) → punto en coordenadas del auto"""
        c = np.array([px - W / 2 + 0.5, -(py - H / 2 + 0.5), -f])
        dw = R @ c
        dl = Rc.T @ dw
        ol = Rc.T @ (cam - T)
        t = (d_local - n_local @ ol) / (n_local @ dl)
        return ol + t * dl
    return proj, ray_plane


if __name__ == '__main__':
    V = json.load(open(sys.argv[1])); S = json.load(open(sys.argv[2]))
    img = Image.open(sys.argv[1].replace('.json', '.png')).convert('RGB')
    kind, val = sys.argv[4].split(':'); val = float(val)
    step = float(sys.argv[5]) if len(sys.argv) > 5 else 0.1
    proj, _ = projector(V, S)
    dr = ImageDraw.Draw(img)
    def line(a, b, col, w=1):
        pa, pb = proj(a), proj(b)
        if pa and pb:
            dr.line([pa, pb], fill=col, width=w)
    def label(p, s, col):
        q = proj(p)
        if q:
            dr.text((q[0] + 2, q[1] + 1), s, fill=col)
    if kind == 'side':
        for z in np.arange(0, 1.51, step):
            major = abs(z * 10 - round(z * 10)) < 1e-6 and round(z * 10) % 5 == 0
            line((val, -2.6, z), (val, 2.4, z), (255, 60, 60) if major else (255, 170, 60))
            label((val, -2.6, z), '%.2f' % z, (255, 255, 0))
        for y in np.arange(-2.6, 2.41, step):
            major = abs(y * 10 - round(y * 10)) < 1e-6 and round(y * 10) % 5 == 0
            line((val, y, 0), (val, y, 1.5), (60, 200, 255) if major else (60, 120, 255))
            if major:
                label((val, y, 0.02), '%.1f' % y, (0, 255, 255))
    elif kind == 'front':
        for z in np.arange(0, 1.51, step):
            line((-1.0, val, z), (1.0, val, z), (255, 60, 60) if round(z * 100) % 50 == 0 else (255, 170, 60))
            label((1.0, val, z), '%.2f' % z, (255, 255, 0))
        for x in np.arange(-1.0, 1.01, step):
            line((x, val, 0), (x, val, 1.5), (60, 200, 255) if round(x * 100) % 50 == 0 else (60, 120, 255))
    elif kind == 'top':
        for x in np.arange(-1.0, 1.01, step):
            line((x, -2.6, val), (x, 2.4, val), (255, 170, 60))
        for y in np.arange(-2.6, 2.41, step):
            line((-1.0, y, val), (1.0, y, val), (60, 120, 255))
    img.save(sys.argv[3])
    print('ok')
