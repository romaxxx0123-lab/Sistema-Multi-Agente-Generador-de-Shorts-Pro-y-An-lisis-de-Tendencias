# comp.py <render.npy> <escena.json> <salida> [recorte x0,y0,x1,y1]
# Compone el render (RGBA lineal premultiplicado) sobre la foto con el mismo encuadre y tone mapping.
import os, sys, json, numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from photo import load_band, view, tonemap
r = np.load(sys.argv[1])
S = json.load(open(sys.argv[2]))
out = sys.argv[3]
H, W = r.shape[:2]
C = S['cam']
elp = C.get('el_photo', C['el'])
cache = '%s/photo_%d_%d_%.3f_%.3f_%.3f.npy' % (os.path.dirname(sys.argv[2]) or '.', W, H, C['fov'], C['az'], elp)
if os.path.exists(cache):
    ph = np.load(cache)
else:
    band, meta = load_band(os.path.join(os.path.dirname(sys.argv[2]) or '.', 'band20k.npy'))
    ph = view(band, meta, W, H, C['fov'], C['az'], elp)
    np.save(cache, ph)
e = S['exposure']
comp = r[..., :3] + (1 - r[..., 3:4]) * ph
A = tonemap(ph, e)
B = tonemap(comp, e)
if len(sys.argv) > 4:
    x0, y0, x1, y1 = map(int, sys.argv[4].split(','))
    A, B = A[y0:y1, x0:x1], B[y0:y1, x0:x1]
Image.fromarray(B).save(out + '_comp.png')
h, w = A.shape[:2]
sbs = np.full((h, w * 2 + 8, 3), 255, np.uint8)
sbs[:, :w] = A
sbs[:, w + 8:] = B
Image.fromarray(sbs).save(out + '_sbs.png')
# fantasma: mitad foto, mitad render (las diferencias de silueta aparecen dobles)
Image.fromarray(((A.astype(np.float32) + B) / 2).astype(np.uint8)).save(out + '_ghost.png')
print('ok', out)
# bordes: los de la foto en rojo y los del render en celeste, sobre la foto atenuada
from scipy import ndimage
def edges(img, q=0.90):
    g = img.astype(np.float32).mean(-1)
    g = ndimage.gaussian_filter(g, 1.0)
    m = np.hypot(ndimage.sobel(g, 0), ndimage.sobel(g, 1))
    return m > np.quantile(m, q)
Af, Bf = tonemap(ph, e), tonemap(comp, e)
ea = edges(Af)
alpha = r[..., 3] > 0.5
eb = edges(Bf) & ndimage.binary_dilation(alpha, iterations=2)
ov = (Af.astype(np.float32) * 0.45).astype(np.uint8)
ov[ea] = (255, 60, 40)
ov[eb] = (40, 230, 255)
ov[ea & eb] = (255, 255, 255)
if len(sys.argv) > 4:
    ov = ov[y0:y1, x0:x1]
Image.fromarray(ov).save(out + '_edges.png')
