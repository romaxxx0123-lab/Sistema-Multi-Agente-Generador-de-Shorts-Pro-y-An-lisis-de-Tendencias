# Prepara un cielo HDR fotografiado (Poly Haven, CC0) para el juego:
#  - <id>.webp: fondo (hemisferio superior + 11,25° bajo el horizonte), radiancia lineal × escala, en sRGB.
#  - <id>_env.png: esfera completa chica en RGBE para la iluminación ambiental (sin el disco solar; el
#    hemisferio inferior es el suelo gris iluminado por ese cielo).
#  - entrada en sky.json: posición, color e iluminancia del sol; escala para pasar a unidades del juego.
# Uso: python3 make_sky.py <hdr 4k> <id> <carpeta de salida> [peso_nubes]
import json, math, os, sys
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hdr import read_hdr, lum, directions, solid_angles, find_sun, sun_region

GROUND_ALBEDO = 0.14
# W/m² → unidades del juego (calibrado para que el sol de mediodía con cúmulos dé ~4,6)
K_GAME = 0.0065


def haurwitz(el_deg):
    """Irradiancia global horizontal de cielo despejado (W/m²) según la elevación del sol (modelo de
    Haurwitz); bajo 5° empalma con un crepúsculo que cae una década cada 5° (≈200 lux a -2°)."""
    def hw(e):
        s = math.sin(math.radians(e))
        return 1098.0 * s * math.exp(-0.057 / s)
    if el_deg >= 5:
        return hw(el_deg)
    return hw(5.0) * 10 ** ((el_deg - 5.0) / 5.0)


def airmass(el_deg):
    e = max(el_deg, -0.5)
    return 1.0 / (math.sin(math.radians(e)) + 0.50572 * (e + 6.07995) ** -1.6364)


def dni_model(el_deg):
    """Irradiancia directa normal de cielo despejado (Meinel), W/m²."""
    if el_deg <= -0.5:
        return 0.0
    return 1353.0 * 0.7 ** (airmass(el_deg) ** 0.678)


def dhi_model(el_deg):
    """Irradiancia difusa horizontal de cielo despejado, W/m² (con crepúsculo bajo 2°)."""
    def d(e):
        return 108.0 * math.sin(math.radians(e)) ** 0.6
    if el_deg >= 2:
        return d(el_deg)
    return d(2.0) * 10 ** ((el_deg - 2.0) / 5.0)


def sun_color(el_deg):
    """Color del sol tras la atmósfera (Rayleigh λ^-4 + aerosoles de costa), normalizado."""
    am = airmass(max(el_deg, 0.5))
    tau = [0.0088 * l ** -4.05 + 0.09 for l in (0.65, 0.55, 0.45)]
    t = [math.exp(-am * x) for x in tau]
    m = max(t)
    return [x / m for x in t]


def to_srgb(x):
    x = np.clip(x, 0, 1)
    return np.where(x <= 0.0031308, x * 12.92, 1.055 * np.power(x, 1 / 2.4) - 0.055)


def rgbe(img):
    m = img.max(axis=-1)
    e = np.where(m > 1e-32, np.floor(np.log2(np.maximum(m, 1e-32))) + 1, -128)
    sc = np.where(m > 1e-32, np.ldexp(1.0, (-e).astype(np.int32)) * 256, 0)
    out = np.zeros(img.shape[:2] + (4,), np.uint8)
    out[..., :3] = np.clip(img * sc[..., None], 0, 255).astype(np.uint8)
    out[..., 3] = np.where(m > 1e-32, e + 128, 0).astype(np.uint8)
    return out


def main(src, sid, outdir, weather_factor=1.0, el_override=None):
    img = read_hdr(src)
    h, w = img.shape[:2]
    th, ph = directions(h, w)
    dw = solid_angles(h, w)
    el, az, _, _ = find_sun(img)
    if el_override is not None:
        el = math.radians(el_override)
    sunm, ang = sun_region(img, el, az, 1.6)
    if el_override is not None and el_override < 0.5:
        sunm = np.zeros_like(sunm)    # sol bajo el horizonte: no hay disco que separar
    ring = (ang > 1.8) & (ang < 3.5)
    bg = np.median(img[ring], axis=0) if ring.any() else np.zeros(3)
    ex = (img - bg).clip(0) * sunm[..., None]
    E_sun_rgb = (ex * dw[..., None]).sum(axis=(0, 1))
    E_sun_n = float(lum(E_sun_rgb[None, None, :])[0, 0])
    sun_col = (E_sun_rgb / max(E_sun_rgb.max(), 1e-9)).tolist() if E_sun_n > 0 else [1.0, 0.95, 0.88]
    # cielo sin el disco solar (la aureola queda: es luz real del cielo)
    sky = img.copy()
    sky[sunm] = bg
    up = th > 0
    cosi = np.clip(np.sin(th), 0, None)
    E_sky_h = float((lum(sky) * up * cosi * dw).sum())
    el_deg = math.degrees(el)
    E_glob = E_sun_n * max(math.sin(el), 0) + E_sky_h
    synth = E_sun_n * max(math.sin(el), 0) < 0.35 * E_sky_h and weather_factor >= 0.99
    if not synth:
        # el sol se ve en la foto: la proporción sol/cielo es la medida; la suma da la irradiancia de un día real
        c = K_GAME * haurwitz(el_deg) * weather_factor / max(E_glob, 1e-9)
    else:
        # sol bajo o tapado en la foto: el cielo da la difusa de un día real (algo nublado) y el sol sale del modelo
        c = K_GAME * dhi_model(el_deg) * 1.5 / max(E_sky_h, 1e-9)
        E_sun_n = dni_model(el_deg) * K_GAME / c
        sun_col = sun_color(el_deg)
    # fondo: de +90° a -11,25°
    rows = int(round(h * (90 + 11.25) / 180))
    top = sky[:rows] * c
    # el rango de 8 bits se reparte en el cielo lejos del sol (la aureola cercana puede saturar)
    far = ang[:rows] > 8.0
    p = np.percentile(lum(top)[far & (th[:rows] > 0)], 99.6)
    s_bg = 0.92 / max(p, 1e-9)
    Image.fromarray((to_srgb(top * s_bg) * 255 + 0.5).astype(np.uint8)).save(os.path.join(outdir, sid + '.webp'), quality=84, method=6)
    # entorno: 512×256, suelo gris iluminado
    E_total = (E_sun_n * max(math.sin(el), 0) + E_sky_h) * c
    env = np.stack([np.asarray(Image.fromarray(np.ascontiguousarray(sky[..., k] * c).astype(np.float32)).resize((512, 256), Image.BOX)) for k in range(3)], -1)
    eth, _ = directions(256, 512)
    ground = GROUND_ALBEDO * E_total / math.pi
    gcol = np.array([1.0, 0.97, 0.92]) * ground
    blend = np.clip((-eth - 0.0) / 0.06, 0, 1)[..., None]   # transición suave bajo el horizonte
    env = env * (1 - blend) + gcol * blend
    Image.fromarray(rgbe(env), 'RGBA').save(os.path.join(outdir, sid + '_env.png'), optimize=True)
    meta = dict(id=sid, sunElev=round(el_deg, 3), sunAzim=round(math.degrees(az), 3), sunIntensity=round(float(E_sun_n * c), 5),
                sunColor=[round(float(v), 4) for v in sun_col], bgScale=round(float(s_bg), 5), bgRows=[90.0, -11.25],
                skyIllum=round(float(E_sky_h * c), 5), globalIllum=round(float(E_total), 5), weather=weather_factor,
                synthSun=bool(synth))
    path = os.path.join(outdir, 'sky.json')
    allm = json.load(open(path)) if os.path.exists(path) else {}
    allm[sid] = meta
    json.dump(allm, open(path, 'w'), indent=1)
    print(json.dumps(meta))


if __name__ == '__main__':
    a = sys.argv[1:]
    main(a[0], a[1], a[2], float(a[3]) if len(a) > 3 else 1.0, float(a[4]) if len(a) > 4 else None)
