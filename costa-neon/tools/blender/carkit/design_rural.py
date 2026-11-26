# Rural: familiar de cinco puertas copiado de una foto real (Serie 3 Touring F31 restyling, paquete deportivo,
# Londres, panorámica urban_street_04 de Poly Haven). Medidas de fábrica: largo 4,63 m, ancho 1,81 m,
# alto 1,46 m con barras, batalla 2,81 m, trochas 1,54/1,58 m, llantas de 19". Las formas se ajustan
# superponiendo el render a la foto con la misma cámara y la misma luz (tools/blender/photomatch.py).
# Sin logo ni letras de la marca.
import copy
from .designs import SUV, band, _arc
from .sculpt import kidney

R = copy.deepcopy(SUV)
R.update(
    name='rural',
    wb=2.81, wr=0.331, track=1.56, tire_w=0.235,
    y_fc=1.70, y_rc=-1.86,
    # perfil del eje: trompa → capó → torpedo → parabrisas → techo → fin del techo (la luneta va en la cara trasera)
    zc=[[2.10, 0.618], [2.0, 0.645], [1.8, 0.697], [1.6, 0.746], [1.4, 0.789], [1.2, 0.826], [1.0, 0.858],
        [0.80, 0.885], [0.76, 0.893], [0.73, 0.905], [0.70, 0.93],
        [0.60, 0.985], [0.50, 1.045], [0.40, 1.11], [0.30, 1.178], [0.22, 1.24], [0.16, 1.282], [0.10, 1.31],
        [0.02, 1.33], [-0.2, 1.355], [-0.5, 1.374], [-0.9, 1.386], [-1.3, 1.388], [-1.6, 1.38], [-1.80, 1.368],
        [-1.95, 1.355], [-2.03, 1.345], [-2.08, 1.335]],
    camber=[[2.3, 0.03], [1.70, 0.035], [0.80, 0.03], [0.74, 0.04], [0.68, 0.06], [0.10, 0.07], [-2.1, 0.065]],
    pw=[[2.3, 2.0], [0.76, 2.0], [0.68, 2.2], [0.10, 2.6], [-2.1, 2.8]],
    r={
        1: [[1.76, 0.76], [0.0, 0.78], [-1.86, 0.77]],
        2: [[1.76, 0.85], [1.0, 0.862], [-1.0, 0.862], [-1.86, 0.855]],
        3: [[1.70, 0.872], [1.4, 0.89], [1.0, 0.893], [0.0, 0.888], [-1.0, 0.896], [-1.4, 0.90], [-1.86, 0.888]],
        4: [[1.70, 0.866], [1.5, 0.887], [1.25, 0.898], [1.0, 0.899], [0.6, 0.896], [0.0, 0.893], [-0.6, 0.896],
            [-1.0, 0.903], [-1.4, 0.908], [-1.7, 0.903], [-1.86, 0.893]],
        5: [[1.70, 0.79], [1.4, 0.825], [1.0, 0.848], [0.70, 0.855], [0.55, 0.842], [0.0, 0.835], [-1.0, 0.833],
            [-1.6, 0.828], [-1.86, 0.818]],
        6: [[1.70, 0.655], [1.3, 0.69], [0.95, 0.715], [0.75, 0.735], [0.62, 0.748], [0.45, 0.73], [0.25, 0.70],
            [0.10, 0.68], [-0.3, 0.668], [-1.4, 0.658], [-1.86, 0.645]],
    },
    z={
        0: [[1.76, 0.15], [1.0, 0.135], [-1.0, 0.135], [-1.86, 0.15]],
        1: [[1.76, 0.165], [1.0, 0.15], [-1.0, 0.15], [-1.86, 0.17]],
        2: [[1.76, 0.21], [1.0, 0.185], [-1.0, 0.185], [-1.86, 0.215]],
        3: [[1.70, 0.40], [1.2, 0.375], [0.9, 0.365], [0.5, 0.37], [0.0, 0.39], [-0.5, 0.42], [-0.9, 0.46],
            [-1.2, 0.50], [-1.5, 0.53], [-1.86, 0.545]],
        4: [[1.70, 0.695], [1.4, 0.745], [1.0, 0.79], [0.7, 0.828], [0.4, 0.853], [0.0, 0.875], [-0.6, 0.89],
            [-1.2, 0.905], [-1.86, 0.92]],
        5: [[1.70, 0.705], [1.4, 0.76], [1.15, 0.795], [1.0, 0.815], [0.85, 0.838], [0.72, 0.875], [0.62, 0.965],
            [0.50, 0.985], [0.3, 1.0], [0.0, 1.004], [-0.6, 1.01], [-1.2, 1.02], [-1.6, 1.032], [-1.86, 1.04]],
    },
    bulge={0: 0.0, 1: 0.0, 2: -8.0, 3: 13.0,
           4: [[1.70, 13.0], [0.76, 12.0], [0.62, 3.0], [-1.86, 3.0]],
           5: [[1.70, 6.0], [0.70, 5.0], [0.62, 2.5], [-1.86, 2.5]]},
    crease={1: 0.0, 2: 0.5, 3: 0.8, 4: 0.92,
            5: [[1.70, 0.3], [0.68, 0.3], [0.60, 1.0], [-1.86, 1.0]],
            6: [[1.70, 0.6], [0.70, 0.6], [0.64, 1.0], [-1.86, 1.0]]},
    tan_s={1: 0.0},
    tan_e={1: 74.0},
    flare=dict(axes=[(1.405, 0.018, 0.42), (-1.405, 0.026, 0.48)], feats={2: 0.9, 3: 1.0, 4: 0.85}),
    front=dict(
        rf={1: 0.24, 2: 0.35, 3: 0.38, 4: 0.33, 5: 0.29, 6: 0.265},
        z={1: 0.15, 2: 0.18, 3: 0.33, 4: 0.50, 5: 0.645},
        n={1: 2.2, 2: 2.6, 3: 2.6, 4: 2.4, 5: 2.3, 6: 2.1},
        bulge={2: 4.0, 3: 3.0, 4: 2.0, 5: 6.0},
        crease={2: 1.0, 3: 0.6, 4: 0.8, 5: 0.85, 6: 0.6},
        tan_e={1: 8.0},
    ),
    rear=dict(
        rf={1: 0.33, 2: 0.46, 3: 0.49, 4: 0.43, 5: 0.35, 6: 0.14},
        z={1: 0.22, 2: 0.30, 3: 0.50, 4: 0.79, 5: 0.985},
        n={1: 3.0, 2: 3.4, 3: 3.6, 4: 3.4, 5: 3.2, 6: 3.0},
        bulge={2: 2.0, 3: 3.0, 4: 2.0, 5: 4.0},
        crease={2: 1.0, 3: 0.6, 4: 0.6, 5: 0.85, 6: 1.0},
        tan_e={1: 10.0},
    ),
    # malla densa: los relieves finos (sculpt) necesitan ~1-2 cm de resolución
    counts=[3, 8, 10, 26, 14, 18, 26],
    key_y=[(0.78, 0.008, 0.1), (0.62, 0.008, 0.08), (0.10, 0.01, 0.12)],
    h_max=0.016, n_front=56, n_rear=40,
    greenhouse=dict(
        bpillar=(-0.21, -0.11), a_base=0.60, c_edge=(-0.92, -1.22),
        ws_poly=band(-0.02, 0.76, lambda x: 0.12 - 0.04 * (x / 0.70) ** 2, lambda x: 0.70 - 0.10 * (x / 0.80) ** 2),
        rw_kind='rear',
        rw_poly=[(-0.02, 1.01), (0.58, 1.01), (0.575, 1.16), (0.56, 1.28), (0.54, 1.32), (0.51, 1.335), (-0.02, 1.335)],
        quarter=[(-1.93, 5.0), (-0.97, 5.0), (-1.27, 6.0), (-1.80, 6.0)],
    ),
    interior=dict(hip=0.50, front_y=-0.42, front_x=0.38, rear_y=-1.25, dash_y=0.32, dash_z=0.98,
                  region=(-2.20, 0.55, 0.35), shelf_y=(-1.85, -2.25), shelf_z=1.0),
    # pintura gris mineral metalizada (gris oscuro azulado con escamas) y vidrios traseros oscuros
    look={'paint': ((0.034, 0.038, 0.045), 0.45, 0.0, 1.0, 0, None, 0.08),
          'frame': ((0.006, 0.006, 0.007), 0.06, 0, 1.0, 0, None), 'trim': ((0.008, 0.008, 0.009), 0.1, 0, 0.8, 0, None),
          'alu': ((0.62, 0.63, 0.64), 0.28, 1.0, 0, 0, None), 'drl': ((0.8, 0.8, 0.8), 0.45, 0, 0, 0, None), 'seat': ((0.30, 0.25, 0.19), 0.55, 0, 0, 0, None)},
    dust=dict(top=0.24, side=0.07, color=(0.26, 0.265, 0.27), scale=9.0),
    wheel=dict(style='double5', rim_d=0.4826, tire_w=0.235, face='machined', paint=(0.16, 0.165, 0.175), spoke_w=(0.011, 0.019)),
)
F = R['features']
F.update(
    arch_gap=0.045,
    gaps=[
        # puerta delantera: borde delantero detrás de la rueda subiendo hasta la base del pilar A
        ('side', [(0.975, 0.205), (0.985, 0.40), (0.982, 0.60), (0.965, 0.74), (0.93, 0.82), (0.86, 0.885), (0.74, 0.94),
                  (0.62, 0.972)]),
        ('side', [(-0.10, 0.20), (-0.11, 0.55), (-0.125, 0.85), (-0.14, 1.0)]),
        # puerta trasera: rodea el arco de la rueda trasera y sube al pilar C
        ('side', [(-0.96, 0.20)] + _arc(-1.405, 0.331, 0.42, 2, 70, 12) + [(-0.99, 0.84), (-0.965, 0.93), (-0.93, 1.0)]),
        # capó: línea sobre el guardabarros y borde trasero delante del torpedo
        ('band56', [(0.78, 5.6), (2.80, 5.6)]),
        ('top', [(-0.01, 0.78), (0.80, 0.78)]),
        # portón: contorno en la cara trasera y bisagra en el techo
        ('rear', [(0.60, 1.36), (0.605, 1.06), (0.62, 0.985), (0.66, 0.87), (0.66, 0.72), (0.60, 0.67), (-0.01, 0.67)]),
        ('top', [(-0.01, -2.0), (0.62, -1.99)]),
    ],
    fuel=dict(center=(-1.72, 0.83), size=(0.17, 0.15)),
    cowl=dict(y_back=0.74),
    sail=(0.49, 0.61),
    # faro LED: dos aros (ojos de ángel) achatados arriba, ceja de giro y lente que llega hasta la parrilla
    headlight=dict(style='assembly', chrome_housing=True, units=[dict(
        top_xz=[(0.36, 0.621), (0.425, 0.629), (0.512, 0.638), (0.594, 0.653), (0.672, 0.666), (0.745, 0.683),
                (0.797, 0.693), (0.842, 0.702)],
        bottom_xz=[(0.36, 0.588), (0.431, 0.581), (0.485, 0.569), (0.555, 0.558), (0.62, 0.552), (0.683, 0.556),
                   (0.74, 0.572), (0.786, 0.604), (0.821, 0.644), (0.84, 0.683)],
        depth=0.09,
        projectors=[(0.431, 0.55, 0.028), (0.648, 0.52, 0.030)],
        halos=[(0.431, 0.55, 0.046, 'head'), (0.648, 0.52, 0.049, 'head')], halo_r=0.0075,
        signal=[[(0.04, 0.9), (0.5, 0.9), (0.93, 0.86)]], signal_w=0.007, signal_mat='drl',
        bezels=[([(0.02, 0.12), (0.5, 0.1), (0.98, 0.2)], 0.012)])]),
    # riñones: dos aberturas separadas con marco cromado y barras verticales negras
    grille=dict(assembly=True, kidney=True,
                poly=kidney(0.04, 0.347, 0.494, 0.633, r_out=0.068, r_in=0.024, bow=0.02, top_slope=-0.014),
                depth=0.07, frame=dict(w=0.013, d=0.012, mat='chrome'), insert='vbars', pitch=0.021, bar=0.007,
                bar_d=0.03, bar_mat='trim_gloss', inset=0.008),
    intake=dict(assembly=True,
                poly=[(-0.02, 0.31), (0.30, 0.31), (0.345, 0.29), (0.36, 0.225), (0.33, 0.205), (-0.02, 0.205)],
                depth=0.07, frame=dict(w=0.008, d=0.006, mat='trim_gloss'), insert='honeycomb', pitch=0.024,
                inset=0.012, crossbars=[(0.258, 0.016, 0.012, 'trim_gloss')]),
    side_intakes=dict(xz=True, poly=[(0.42, 0.413), (0.60, 0.418), (0.74, 0.419), (0.752, 0.38), (0.735, 0.27), (0.60, 0.264),
                                      (0.404, 0.262), (0.40, 0.30)], depth=0.06,
                      insert=dict(insert='honeycomb', pitch=0.02, inset=0.016, cell_d=0.012)),
    fogs=dict(kind='front', lamps=[((0.683, 0.356), 0.040)]),
    plate_front_z=0.418,
    plate_rear=dict(poly=[(-0.26, 0.86), (0.26, 0.86), (0.26, 0.75), (-0.26, 0.75)], depth=0.012),
    badge='roundel_plain', badge_size=0.04, badge_front_z=0.662, badge_rear_z=0.93,
    handles=[(-0.06, 0.905), (-0.98, 0.918)],
    diffuser_z=0.33, chin_z=0.195,
    exhaust=dict(round=True, pts=[(0.50, 0.27)], r=0.045, squash=0.85),
    antenna_y=-1.85,
    roof_rails=dict(x=0.60, y=(0.02, -1.95), h=0.03, w=0.026, mat='alu', flush=True),
    mirror='standard', mirror_size=1.05, hidden_wipers=True, mirror_base=(0.555, 0.985, 0.835),
)
F.pop('cladding', None)
F.pop('taillights', None)
F['taillamps'] = [dict(
    top_xz=[(0.30, 1.0), (0.48, 1.005), (0.64, 0.99), (0.75, 0.97), (0.80, 0.94)],
    bottom_xz=[(0.30, 0.90), (0.50, 0.89), (0.66, 0.875), (0.76, 0.87), (0.80, 0.90)],
    depth=0.045, pipes=[[(0.12, 0.78), (0.80, 0.78), (0.92, 0.55), (0.92, 0.22)], [(0.12, 0.40), (0.70, 0.40)]],
    reverse=[[(0.20, 0.18), (0.60, 0.18)]], signal=[[(0.20, 0.60), (0.70, 0.60)]])]
# Relieves finos medidos en la foto: nervios del capó que convergen hacia los riñones, línea de carácter con
# canto vivo, línea baja de las puertas que sube hacia atrás con una zona cóncava debajo, nervio del zócalo,
# escalón del paragolpes bajo los faros, marcos en relieve de las tomas y labio inferior.
_INTAKE = [(0.40, 0.25), (0.40, 0.30), (0.42, 0.425), (0.60, 0.43), (0.752, 0.43), (0.765, 0.38), (0.748, 0.255), (0.60, 0.25), (0.40, 0.25)]
R['sculpt'] = [
    dict(op='ridge', space='top', nmin=0.5, pts=[(0.40, 0.82), (0.36, 1.30), (0.33, 1.65), (0.305, 1.93)], h=0.0035,
         w=(0.16, 0.03), p=1.5, taper=0.25, yrange=(0.76, 1.96)),
    dict(op='ridge', space='side', nmin=0.3, pts=[(-1.86, 0.92), (-1.2, 0.905), (-0.6, 0.89), (0.0, 0.875), (0.4, 0.853),
                                                  (0.7, 0.828), (1.0, 0.79), (1.4, 0.745), (1.70, 0.695)], h=0.005, w=(0.022, 0.07), p=1.5, taper=0.25),
    dict(op='ridge', space='side', nmin=0.4, pts=[(-1.0, 0.468), (-0.9, 0.46), (-0.5, 0.42), (0.0, 0.39), (0.5, 0.37),
                                                  (0.95, 0.364)], h=0.005, w=(0.11, 0.018), p=1.4, taper=0.2),
    dict(op='ridge', space='side', nmin=0.4, pts=[(-1.0, 0.418), (-0.9, 0.41), (-0.5, 0.372), (0.0, 0.343), (0.5, 0.324),
                                                  (0.95, 0.318)], h=-0.007, w=(0.03, 0.06), p=1.6, taper=0.25),
    dict(op='ridge', space='side', nmin=0.3, pts=[(-0.98, 0.275), (0.0, 0.27), (0.98, 0.272)], h=0.004, w=(0.018, 0.05),
         p=1.4, taper=0.12),
    # el paragolpes avanza bajo los faros: canto convexo con el "estante" de arriba mirando al cielo
    dict(op='ridge', space='front', nmin=0.35, pts=[(0.0, 0.508), (0.30, 0.512), (0.60, 0.518), (0.86, 0.53)], h=0.018,
         w=(0.065, 0.35), p=1.0, taper=0.08, zrange=(0.15, 0.60)),
    dict(op='ridge', space='front', nmin=0.2, pts=_INTAKE, h=0.006, w=(0.014, 0.014), p=1.2),
    dict(op='ridge', space='front', nmin=0.3, pts=[(0.0, 0.205), (0.40, 0.205), (0.76, 0.222)], h=0.005,
         w=(0.03, 0.01), p=1.3, taper=0.06),
]

# ---------------------------------------------------------------------------------------------------------
# Suavizado: las líneas medidas a mano (puntos sueltos) generan ondas chicas en la chapa; un auto real tiene
# líneas tensas con pocas inflexiones. Cada línea se reemplaza por un polinomio de grado bajo ajustado a esos
# puntos (por tramos, respetando sólo los quiebres reales: base del parabrisas y pie del pilar A).
import numpy as _np


def _fit(pts, deg, y0, y1, step=0.02):
    P = _np.array([p for p in pts if y0 - 1e-9 <= p[0] <= y1 + 1e-9], float)
    c = _np.polyfit(P[:, 0], P[:, 1], min(deg, len(P) - 1))
    ys = _np.arange(y0, y1 + 1e-9, step)
    if ys[-1] < y1 - 1e-6:
        ys = _np.append(ys, y1)
    return [[float(y), float(_np.polyval(c, y))] for y in ys]   # sin redondeo: el redondeo crea rugosidad


def _join(*parts):
    out = []
    for prt in parts:
        for p in prt:
            if not out or p[0] > out[-1][0] + 1e-6:
                out.append(p)
    return sorted(out)


def _smooth(R):
    zc = R['zc']
    # capó convexo parejo (de la junta trasera del capó a la trompa), parabrisas y techo como arcos suaves
    hood = _fit(zc, 2, 0.80, 2.10)
    cowl = [p for p in zc if 0.70 <= p[0] < 0.80]
    wind = _fit(zc, 2, 0.10, 0.70)
    roof = _fit(zc, 3, -2.08, 0.10)
    R['zc'] = _join(roof, wind, cowl, hood)
    for k, deg in ((3, 4), (4, 4)):
        R['r'][k] = _fit(R['r'][k], deg, -1.86, 1.70)
    r5 = R['r'][5]
    R['r'][5] = _join(_fit(r5, 2, -1.86, 0.55), [p for p in r5 if 0.55 < p[0] < 0.70], _fit(r5, 2, 0.70, 1.70))
    r6 = R['r'][6]
    R['r'][6] = _join(_fit(r6, 2, -1.86, 0.10), [p for p in r6 if 0.10 < p[0] < 0.75], _fit(r6, 2, 0.75, 1.70))
    for k, deg in ((3, 3), (4, 4)):
        R['z'][k] = _fit(R['z'][k], deg, -1.86, 1.70)
    z5 = R['z'][5]
    R['z'][5] = _join(_fit(z5, 3, -1.86, 0.50), [p for p in z5 if 0.50 < p[0] < 0.85], _fit(z5, 2, 0.85, 1.70))


_smooth(R)
RURAL = R
