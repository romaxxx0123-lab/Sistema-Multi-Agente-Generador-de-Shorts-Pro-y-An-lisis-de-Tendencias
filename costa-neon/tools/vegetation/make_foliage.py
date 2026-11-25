# Texturas de follaje hechas con hojas reales escaneadas (Poly Haven, CC0: island_tree_02):
#   leaves.webp  ramillete denso de hojas con transparencia (copas de árboles)
#   frond.webp   fronda de palmera: nervio central con folíolos reales angostos a ambos lados
# Uso: python3 make_foliage.py <leaves_diff.jpg> <salida>
import math, os, random, sys
import numpy as np
from PIL import Image, ImageFilter


def cut_leaves(path):
    """Separa las hojas sueltas del escaneo (fondo negro) en recortes RGBA."""
    im = np.asarray(Image.open(path).convert('RGB')).astype(np.float32) / 255
    a = np.clip((im.max(axis=-1) - 0.035) / 0.05, 0, 1)
    h, w = a.shape
    small = (np.asarray(Image.fromarray((a * 255).astype(np.uint8)).resize((w // 4, h // 4))) > 60)
    lab = np.zeros(small.shape, np.int32)
    n = 0
    for y in range(small.shape[0]):
        for x in range(small.shape[1]):
            if small[y, x] and not lab[y, x]:
                n += 1
                st = [(y, x)]
                lab[y, x] = n
                while st:
                    cy, cx = st.pop()
                    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        yy, xx = cy + dy, cx + dx
                        if 0 <= yy < small.shape[0] and 0 <= xx < small.shape[1] and small[yy, xx] and not lab[yy, xx]:
                            lab[yy, xx] = n
                            st.append((yy, xx))
    leaves = []
    for k in range(1, n + 1):
        ys, xs = np.nonzero(lab == k)
        if len(ys) < 60:
            continue
        y0, y1, x0, x1 = ys.min() * 4, ys.max() * 4 + 4, xs.min() * 4, xs.max() * 4 + 4
        rgba = np.dstack([im[y0:y1, x0:x1], a[y0:y1, x0:x1]])
        leaves.append(Image.fromarray((rgba * 255).astype(np.uint8), 'RGBA'))
    return leaves


def tint(leaf, k, hue):
    a = np.asarray(leaf).astype(np.float32)
    rgb = a[..., :3] * k
    rgb[..., 0] *= hue[0]
    rgb[..., 1] *= hue[1]
    rgb[..., 2] *= hue[2]
    a[..., :3] = np.clip(rgb, 0, 255)
    return Image.fromarray(a.astype(np.uint8), 'RGBA')


def cluster(leaves, size=1024, n=300, seed=3):
    """Ramillete: hojas apiladas en disco, más oscuras y chicas hacia adentro (sombra propia)."""
    rnd = random.Random(seed)
    canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    items = []
    for i in range(n):
        # radios agrupados en ramitas (huecos entre grupos) y borde irregular
        twig = rnd.randrange(9)
        ang = twig / 9 * math.tau + rnd.gauss(0, 0.22)
        r = size * 0.44 * min(1.0, math.sqrt(rnd.random()) * (0.85 + 0.25 * math.sin(twig * 2.3)))
        items.append((r, ang))
    items.sort(key=lambda t: t[0])           # de adentro hacia afuera: las de afuera quedan encima
    for r, ang in items:
        lf = rnd.choice(leaves)
        s = size * rnd.uniform(0.11, 0.17) / max(lf.size)
        lf = lf.resize((max(1, int(lf.width * s)), max(1, int(lf.height * s))), Image.LANCZOS)
        rot = math.degrees(ang) - 90 + rnd.uniform(-35, 35)
        lf = lf.rotate(rot, expand=True, resample=Image.BICUBIC)
        k = 0.55 + 0.45 * (r / (size * 0.44)) + rnd.uniform(-0.08, 0.08)
        lf = tint(lf, k, (rnd.uniform(0.7, 0.88), rnd.uniform(0.95, 1.08), rnd.uniform(0.6, 0.8)))
        cx = size / 2 + math.cos(ang) * r - lf.width / 2
        cy = size / 2 + math.sin(ang) * r - lf.height / 2
        canvas.alpha_composite(lf, (int(cx), int(cy)))
    return canvas


def frond(leaves, w=512, h=1024, seed=5):
    """Fronda pinnada: folíolos angostos (hojas reales estiradas) a ambos lados de un nervio curvo."""
    rnd = random.Random(seed)
    canvas = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    cx = w / 2
    pairs = 38
    for i in range(pairs):
        t = (i + 0.5) / pairs
        y = 60 + t * (h - 90)
        L = w * 0.48 * math.sin(min(1.0, t * 1.15 + 0.06) * math.pi) * rnd.uniform(0.85, 1.0) + 14
        for side in (-1, 1):
            lf = rnd.choice(leaves)
            # folíolo: hoja real muy angosta y larga, apuntando hacia afuera y hacia la punta
            lf = lf.resize((max(2, int(L * 0.10)), max(4, int(L * 1.05))), Image.LANCZOS)
            droop = 66 + 16 * t + rnd.uniform(-5, 5)
            lf = lf.rotate(side * droop, expand=True, resample=Image.BICUBIC)
            k = rnd.uniform(0.8, 1.05)
            if rnd.random() < 0.04:
                lf = tint(lf, 0.85, (1.2, 1.0, 0.6))     # algún folíolo seco
            else:
                lf = tint(lf, k * 0.85, (0.7, 0.98, 0.62))
            px = cx + side * (L * 0.48) - lf.width / 2 + side * 4
            py = y - lf.height / 2 + L * 0.18
            canvas.alpha_composite(lf, (int(px), int(py)))
    # nervio central
    stem = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    a = np.zeros((h, w, 4), np.uint8)
    for y in range(h):
        t = y / h
        hw = max(1, int(5 - 3 * t))
        a[y, int(cx) - hw:int(cx) + hw] = (96, 98, 52, 255)
    stem = Image.fromarray(a, 'RGBA')
    canvas.alpha_composite(stem)
    return canvas


def save_rgba(im, path):
    # bordes: el color de las zonas transparentes se extiende para que el filtrado no oscurezca los contornos
    a = np.asarray(im).astype(np.float32)
    al = a[..., 3:4] / 255
    rgb = a[..., :3]
    blur = np.asarray(Image.fromarray(np.uint8(rgb * al)).filter(ImageFilter.GaussianBlur(6))).astype(np.float32)
    wb = np.asarray(Image.fromarray(np.uint8(al[..., 0] * 255)).filter(ImageFilter.GaussianBlur(6))).astype(np.float32)[..., None] / 255
    fill = blur / np.maximum(wb, 1e-3)
    out = np.where(al > 0.02, rgb, fill)
    Image.fromarray(np.dstack([np.clip(out, 0, 255), a[..., 3]]).astype(np.uint8), 'RGBA').save(path, quality=90, method=6)


if __name__ == '__main__':
    src, out = sys.argv[1], sys.argv[2]
    os.makedirs(out, exist_ok=True)
    leaves = cut_leaves(src)
    print('hojas recortadas:', len(leaves))
    save_rgba(cluster(leaves), os.path.join(out, 'leaves.webp'))
    save_rgba(frond(leaves), os.path.join(out, 'frond.webp'))
    print('ok', os.listdir(out))
