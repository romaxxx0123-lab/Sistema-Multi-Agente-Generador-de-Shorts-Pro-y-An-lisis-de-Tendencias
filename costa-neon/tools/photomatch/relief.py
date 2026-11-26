# Relieve visible: contraste local del log del brillo (pasa-altos) de la foto y del modelo con el mismo filtro.
# Los cambios de curvatura de la chapa (pliegues, hundidos, abombados, zócalos) aparecen como bandas claras y
# oscuras; lo plano queda gris parejo. Compara directamente dónde tiene relieve el auto real y el modelo.
#   python3 relief.py <render.npy> <escena.json> <salida> [x0,y0,x1,y1] [sigma]
import os, sys, json, numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from shading import photo_for, LW
from scipy.ndimage import gaussian_filter
from PIL import Image

a = sys.argv[1:]
r = np.load(a[0]); H, W = r.shape[:2]
ph, S = photo_for(a[1], W, H)
out = a[2]
box = [int(v) for v in a[3].split(',')] if len(a) > 3 else [0, 0, W, H]
sig = float(a[4]) if len(a) > 4 else 14.0
comp = r[..., :3] + (1 - r[..., 3:4]) * ph


def hp(img):
    L = np.log(np.maximum(img @ LW, 1e-4))
    L = gaussian_filter(L, 1.2) - gaussian_filter(L, sig)
    return L


A, B = hp(ph), hp(comp)
x0, y0, x1, y1 = box
A, B = A[y0:y1, x0:x1], B[y0:y1, x0:x1]
s = np.percentile(np.abs(np.concatenate([A.ravel(), B.ravel()])), 98)
to8 = lambda X: (np.clip(0.5 + 0.5 * X / s, 0, 1) * 255).astype(np.uint8)
h, w = A.shape
o = np.full((h * 2 + 10, w), 255, np.uint8)
o[:h] = to8(A); o[h + 10:] = to8(B)
Image.fromarray(o).save(out + '_relieve.png')
print('ok', out)
