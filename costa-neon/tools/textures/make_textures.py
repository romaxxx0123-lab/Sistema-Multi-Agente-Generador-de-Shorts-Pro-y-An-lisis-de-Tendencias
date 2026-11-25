# Texturas escaneadas de superficies reales (Poly Haven, CC0) para las capas de suelo y de fachadas.
# Por capa se guardan tres imágenes (el juego las empaqueta en la placa de video):
#   <nombre>_a.webp  albedo en sRGB
#   <nombre>_n.jpg   normal (x, y) + altura en azul   (JPEG 4:4:4, sin submuestreo de color)
#   <nombre>_r.jpg   rugosidad en rojo + oclusión en verde
# y un textures.json con el tamaño real (m), el modo (absoluto o modulador) y el color medio.
# Uso: python3 make_textures.py <carpeta descargas> <carpeta salida> [tamaño]
import json, os, subprocess, sys
import numpy as np
from PIL import Image

# array, capa, id de Poly Haven, modo (abs = albedo real, mod = se tiñe con el color del objeto),
# albedo medio real buscado (luminancia; None = el del escaneo) y resolución
LAYERS = [
    ('ground', 0, 'asphalt_02', 'abs', 0.12, 1024),             # asfalto gastado por el sol
    ('ground', 1, 'concrete_pavement', 'abs', 0.30, 1024, 0.35),  # vereda de losas de hormigón (gris)
    ('ground', 2, 'leafy_grass', 'abs', None, 512, 1.0, (0.06, 0.125, 0.032)),  # recoloreado a césped tropical
    ('ground', 3, 'large_square_pattern_01', 'abs', 0.27, 1024),  # losas de plaza
    ('ground', 4, 'coast_sand_01', 'abs', 0.36, 512),            # arena de playa clara
    ('ground', 5, 'concrete_floor_worn_001', 'abs', 0.22, 512),  # playones y estacionamientos
    ('ground', 6, 'gravel_concrete_03', 'abs', 0.24, 512),       # techos planos y senderos
    ('ground', 7, 'weathered_brown_planks', 'abs', 0.11, 512),
    ('ground', 8, 'brushed_concrete', 'abs', 0.32, 512),         # cordones
    ('ground', 9, 'coast_sand_rocks_02', 'abs', None, 512),
    ('detail', 0, 'painted_plaster_wall', 'mod', None, 1024),
    ('detail', 1, 'concrete_wall_008', 'mod', None, 1024),
    ('detail', 2, 'red_brick_03', 'mod', None, 1024),
    ('detail', 3, 'corrugated_iron', 'mod', None, 512),
    ('detail', 4, 'palm_tree_bark', 'abs', None, 512),
    ('detail', 5, 'plastered_wall', 'mod', None, 512),
]
MAPS = {'Diffuse': 'diff', 'nor_gl': 'nor_gl', 'Rough': 'rough', 'AO': 'ao', 'Displacement': 'disp'}


def srgb_to_lin(x):
    return np.where(x <= 0.04045, x / 12.92, ((x + 0.055) / 1.055) ** 2.4)


def fetch(dl, pid, res='1k'):
    info = json.loads(subprocess.run(['curl', '-s', '-m', '60', 'https://api.polyhaven.com/files/' + pid], capture_output=True, text=True).stdout)
    meta = json.loads(subprocess.run(['curl', '-s', '-m', '60', 'https://api.polyhaven.com/info/' + pid], capture_output=True, text=True).stdout)
    paths = {}
    for key, short in MAPS.items():
        if key not in info:
            continue
        url = info[key][res]['jpg']['url']
        p = os.path.join(dl, '%s_%s_%s.jpg' % (pid, short, res))
        if not os.path.exists(p) or os.path.getsize(p) < 1000:
            subprocess.run(['curl', '-s', '-m', '300', '-o', p, url], check=True)
        paths[short] = p
    return paths, meta


def load(p, size, mode='RGB'):
    return np.asarray(Image.open(p).convert(mode).resize((size, size), Image.LANCZOS)).astype(np.float32) / 255.0


def main(dl, out, size_max=1024):
    os.makedirs(dl, exist_ok=True)
    os.makedirs(out, exist_ok=True)
    manifest = {'ground': {}, 'detail': {}}
    for spec in LAYERS:
        arr, idx, pid, mode, target, res = spec[:6]
        sat = spec[6] if len(spec) > 6 else 1.0
        recolor = spec[7] if len(spec) > 7 else None
        paths, meta = fetch(dl, pid)
        name = '%s%d' % (arr[0], idx)
        size = min(res, size_max)
        diff = load(paths['diff'], size)
        nrm = load(paths['nor_gl'], size)
        h2 = size // 2
        rough = load(paths['rough'], h2, 'L') if 'rough' in paths else np.full((h2, h2), 0.8, np.float32)
        ao = load(paths['ao'], h2, 'L') if 'ao' in paths else np.ones((h2, h2), np.float32)
        disp = load(paths['disp'], size, 'L') if 'disp' in paths else np.full((size, size), 0.5, np.float32)
        d0, d1 = np.percentile(disp, 1), np.percentile(disp, 99)
        disp = np.clip((disp - d0) / max(d1 - d0, 1e-3), 0, 1)
        lin = srgb_to_lin(diff)
        if sat != 1.0:
            # saturación en lineal alrededor de la luminancia de cada píxel
            l = lin @ np.array([0.2126, 0.7152, 0.0722])
            lin = np.clip(l[..., None] + (lin - l[..., None]) * sat, 0, 1)
            diff = np.where(lin <= 0.0031308, lin * 12.92, 1.055 * np.power(lin, 1 / 2.4) - 0.055)
        if recolor is not None:
            # misma estructura (luminancia relativa), color medio buscado; 25 % del tono original (hojas secas)
            W = np.array([0.2126, 0.7152, 0.0722])
            l = lin @ W
            lmean = float(l.mean())
            tgt = np.array(recolor)
            rec = (l / max(lmean, 1e-6))[..., None] * tgt[None, None, :]
            orig = lin / max(float((lin.reshape(-1, 3).mean(0)) @ W), 1e-6) * float(tgt @ W)
            lin = np.clip(rec * 0.75 + orig * 0.25, 0, 1)
            diff = np.where(lin <= 0.0031308, lin * 12.92, 1.055 * np.power(lin, 1 / 2.4) - 0.055)
        mean = lin.reshape(-1, 3).mean(axis=0)
        lum = float(mean @ np.array([0.2126, 0.7152, 0.0722]))
        gain = (target / lum) if target else 1.0
        Image.fromarray((diff * 255 + 0.5).astype(np.uint8)).save(os.path.join(out, name + '_a.webp'), quality=84, method=6)
        n = np.dstack([nrm[..., 0], nrm[..., 1], disp])
        Image.fromarray((n * 255 + 0.5).astype(np.uint8)).save(os.path.join(out, name + '_n.jpg'), quality=86, subsampling=0)
        r = np.dstack([rough, ao, np.zeros_like(ao)])
        Image.fromarray((r * 255 + 0.5).astype(np.uint8)).save(os.path.join(out, name + '_r.jpg'), quality=86, subsampling=0)
        dims = meta.get('dimensions') or [2000, 2000]
        manifest[arr][str(idx)] = dict(id=pid, file=name, mode=mode, tile=round(dims[0] / 1000.0, 3), gain=round(gain, 4),
                                       mean=[round(float(v), 4) for v in mean], author=', '.join(meta.get('authors', {}).keys()))
        kb = sum(os.path.getsize(os.path.join(out, name + s)) for s in ('_a.webp', '_n.jpg', '_r.jpg')) // 1024
        print('%-7s %-26s %-4s %5.2f m %4d px  albedo %.3f × %.2f  %d KB' % (name, pid, mode, dims[0] / 1000.0, size, lum, gain, kb))
    json.dump(manifest, open(os.path.join(out, 'textures.json'), 'w'), indent=1)


if __name__ == '__main__':
    a = sys.argv[1:]
    main(a[0], a[1], int(a[2]) if len(a) > 2 else 1024)
