# Pulga: auto urbano de tres puertas copiado de una foto real (el plateado estacionado delante del familiar en
# la panorámica urban_street_04 de Poly Haven). Medidas de fábrica: largo 3,41 m, ancho 1,62 m, alto 1,47 m,
# batalla 2,34 m, trochas 1,42 m, neumáticos 155/65 R14. Formas ajustadas superponiendo el render a la foto
# (tools/photomatch). Sin logos ni letras de la marca.
import copy, math
from .designs import COMPACTO, band, _arc
from .design_rural import _fit, _join

P = copy.deepcopy(COMPACTO)
P.update(
    name='compacto',
    wb=2.34, wr=0.279, track=1.42, tire_w=0.155,
    y_fc=1.28, y_rc=-1.08,
    zc=[[1.67, 0.58], [1.62, 0.655], [1.58, 0.70], [1.55, 0.73], [1.50, 0.772], [1.40, 0.818], [1.28, 0.848],
        [1.20, 0.862], [1.0, 0.885], [0.92, 0.905], [0.89, 0.913], [0.86, 0.92], [0.75, 1.015], [0.65, 1.105], [0.55, 1.19],
        [0.47, 1.235], [0.42, 1.255], [0.36, 1.268], [0.2, 1.288], [-0.1, 1.315], [-0.4, 1.33], [-0.7, 1.33],
        [-1.0, 1.32], [-1.15, 1.30], [-1.25, 1.28], [-1.33, 1.258]],
    camber=[[2.0, 0.03], [1.40, 0.035], [0.92, 0.03], [0.86, 0.06], [0.40, 0.10], [-1.5, 0.095]],
    pw=[[2.0, 2.0], [0.90, 2.0], [0.86, 2.0], [0.40, 2.0], [-1.5, 2.0]],
    r={
        1: [[1.40, 0.66], [0.0, 0.685], [-1.40, 0.675]],
        2: [[1.40, 0.755], [1.15, 0.77], [0.9, 0.782], [0.0, 0.787], [-0.9, 0.79], [-1.40, 0.778]],
        3: [[1.40, 0.728], [1.15, 0.742], [0.9, 0.756], [0.4, 0.774], [0.0, 0.780], [-0.4, 0.779], [-0.9, 0.774],
            [-1.40, 0.762]],
        4: [[1.40, 0.742], [1.15, 0.766], [1.0, 0.779], [0.5, 0.80], [0.0, 0.81], [-0.5, 0.81], [-1.0, 0.807],
            [-1.40, 0.795]],
        5: [[1.40, 0.70], [1.0, 0.725], [0.85, 0.735], [0.70, 0.74], [0.0, 0.742], [-1.0, 0.738], [-1.40, 0.725]],
        6: [[1.40, 0.56], [1.0, 0.62], [0.88, 0.66], [0.83, 0.70], [0.65, 0.655], [0.45, 0.61], [0.30, 0.60],
            [-0.4, 0.60], [-1.0, 0.59], [-1.40, 0.57]],
    },
    z={
        # medido en la foto: zócalo de 0,15 a 0,31 m (borde superior parejo), hombro a 0,89 m
        0: [[1.40, 0.155], [0.9, 0.15], [-0.9, 0.15], [-1.40, 0.16]],
        1: [[1.40, 0.17], [0.9, 0.16], [-0.9, 0.16], [-1.40, 0.175]],
        2: [[1.40, 0.25], [0.9, 0.235], [0.0, 0.235], [-0.9, 0.235], [-1.40, 0.255]],
        3: [[1.40, 0.33], [0.9, 0.312], [0.0, 0.322], [-0.6, 0.338], [-0.9, 0.35], [-1.40, 0.37]],
        4: [[1.40, 0.70], [1.2, 0.76], [1.0, 0.80], [0.8, 0.84], [0.6, 0.855], [0.3, 0.872], [0.0, 0.885], [-0.6, 0.905],
            [-1.0, 0.92], [-1.40, 0.93]],
        5: [[1.40, 0.77], [1.28, 0.80], [1.1, 0.835], [0.95, 0.855], [0.86, 0.872], [0.80, 0.885], [0.70, 0.888], [0.27, 0.915],
            [-0.2, 0.935], [-0.63, 0.958], [-1.0, 0.975], [-1.40, 0.99]],
    },
    bulge={0: 0.0, 1: 16.0, 2: 24.0, 3: 9.0,
           4: [[1.40, 14.0], [0.90, 12.0], [0.82, 9.0], [-1.40, 9.0]],
           5: [[1.40, 8.0], [0.88, 6.0], [0.82, 4.0], [-1.40, 4.0]]},
    crease={1: 0.0, 2: 0.0, 3: 0.5, 4: 0.2,
            5: [[1.40, 0.3], [0.88, 0.3], [0.82, 1.0], [-1.40, 1.0]],
            6: [[1.40, 0.5], [0.90, 0.5], [0.85, 1.0], [-1.40, 1.0]]},
    tan_s={1: 0.0},
    tan_e={1: 88.0},
    # panza sobre la rueda trasera (cadera) mucho más marcada que adelante, también en el hombro
    flare=dict(axes=[(1.17, 0.022, 0.40), (-1.17, 0.05, 0.46)], feats={2: 0.5, 3: 0.9, 4: 1.0, 5: 0.75}),
    front=dict(
        rf={1: 0.31, 2: 0.375, 3: 0.395, 4: 0.37, 5: 0.335, 6: 0.30},
        z={1: 0.17, 2: 0.20, 3: 0.36, 4: 0.56, 5: 0.665},
        n={1: 2.2, 2: 2.45, 3: 2.55, 4: 2.45, 5: 2.25, 6: 2.1},
        bulge={2: 4.0, 3: 6.0, 4: 6.0, 5: 8.0},
        crease={2: 1.0, 3: 0.3, 4: 0.3, 5: 0.6, 6: 0.5},
        tan_e={1: 8.0},
    ),
    rear=dict(
        rf={1: 0.38, 2: 0.455, 3: 0.49, 4: 0.37, 5: 0.29, 6: 0.22},
        z={1: 0.27, 2: 0.32, 3: 0.48, 4: 0.80, 5: 0.92},
        n={1: 2.0, 2: 2.05, 3: 2.1, 4: 2.05, 5: 2.0, 6: 2.0},
        bulge={2: 4.0, 3: 8.0, 4: 6.0, 5: 4.0},
        crease={2: 1.0, 3: 0.5, 4: 0.5, 5: 0.8, 6: 1.0},
        tan_e={1: 10.0},
    ),
    counts=[3, 8, 10, 26, 14, 18, 26],
    key_y=[(0.90, 0.008, 0.1), (0.83, 0.008, 0.08), (0.38, 0.01, 0.12)],
    h_max=0.016, n_front=50, n_rear=40,
    greenhouse=dict(
        bpillar=(-0.30, -0.22), a_base=0.83, c_edge=(-0.30, -0.30),
        # ventanilla fija trasera en "D": borde trasero curvo que se va hacia atrás arriba (medido en la foto)
        quarter=[(-0.33, 5.03), (-0.55, 5.03), (-0.68, 5.06), (-0.76, 5.16), (-0.83, 5.34), (-0.89, 5.56),
                 (-0.93, 5.76), (-0.93, 5.88), (-0.88, 5.95), (-0.72, 5.97), (-0.50, 5.97), (-0.34, 5.97)],
        ws_poly=band(-0.02, 0.62, lambda x: 0.38 - 0.06 * (x / 0.55) ** 2, lambda x: 0.88 - 0.10 * (x / 0.65) ** 2),
        rw_kind='rear',
        rw_poly=[(-0.02, 0.90), (0.50, 0.90), (0.515, 1.02), (0.51, 1.20), (0.49, 1.29), (0.46, 1.32), (-0.02, 1.32)],
    ),
    interior=dict(hip=0.45, front_y=-0.28, front_x=0.32, rear_y=-1.0, dash_y=0.48, dash_z=0.98,
                  region=(-1.40, 0.75, 0.28), shelf_y=(-1.05, -1.38), shelf_z=0.96),
    look={'paint': ((0.56, 0.57, 0.59), 0.32, 0.78, 1.0, 0, None, 0.5),
          'frame': ((0.006, 0.006, 0.007), 0.3, 0, 0.3, 0, None), 'trim': ((0.012, 0.012, 0.013), 0.5, 0, 0, 0, None)},
    dust=dict(top=0.12, side=0.04, color=(0.32, 0.32, 0.32), scale=9.0),
    wheel=dict(style='multi10', rim_d=0.3556, tire_w=0.155, paint=(0.55, 0.56, 0.57), spoke_w=(0.007, 0.011)),
    smooth_angle=40,
    lod0_budget={'paint': 42000, 'trim': 24000, 'chrome': 4000},
)

# ---- trompa calcada de la foto (puntos proyectados sobre la carrocería; θ = ángulo del abanico delantero)
HEAD_TOP = [(36.9, 0.629), (33.7, 0.66), (28.1, 0.693), (23.1, 0.726), (18.1, 0.759), (13.0, 0.786), (6.8, 0.806), (0.3, 0.818)]
HEAD_BOT = [(36.4, 0.609), (32.1, 0.594), (27.2, 0.592), (22.9, 0.598), (18.7, 0.61), (14.5, 0.632), (10.8, 0.666), (7.7, 0.714), (5.3, 0.767)]
F = P['features']
F.update(
    headlight=dict(style='assembly', units=[dict(top=HEAD_TOP, bottom=HEAD_BOT, depth=0.10,
                                                  reflectors=[(0.54, 0.54, 0.058), (0.346, 0.57, 0.028)],
                                                  bezels=[([(0.05, 0.08), (0.5, 0.06), (0.95, 0.12)], 0.01)])]),
    # ranuras superiores en cuña a los lados del emblema (cada lado es un contorno propio)
    grille=dict(assembly=True, kidney=True, poly=[(0.30, 0.593), (0.19, 0.589), (0.086, 0.578), (0.094, 0.545), (0.10, 0.513),
                                                   (0.20, 0.541), (0.29, 0.572)],
                depth=0.05, insert='honeycomb', pitch=0.016, inset=0.012, cell_d=0.01),
    intake=dict(assembly=True, poly=[(-0.02, 0.325), (0.26, 0.33), (0.31, 0.31), (0.30, 0.245), (0.24, 0.225), (-0.02, 0.225)],
                depth=0.07, frame=dict(w=0.006, d=0.005, mat='trim_gloss'), insert='honeycomb', pitch=0.022, inset=0.012),
    side_intakes=dict(xz=True, poly=[(0.56 + 0.09 * math.cos(math.radians(a)), 0.305 + 0.045 * math.sin(math.radians(a)))
                                     for a in range(0, 360, 20)][::-1], depth=0.05,
                      insert=dict(insert='honeycomb', pitch=0.018, inset=0.014, cell_d=0.01)),
    arch_gap=0.014,
    gaps=[
        # la puerta termina sobre el zócalo: cortes verticales hasta 0,33 m y junta inferior a lo largo
        ('side', [(0.93, 0.335), (0.95, 0.5), (0.95, 0.70), (0.92, 0.80), (0.87, 0.86), (0.84, 0.88)]),
        ('side', [(-0.33, 0.335), (-0.31, 0.60), (-0.22, 0.85), (-0.16, 0.93)]),
        ('side', [(-0.335, 0.338), (0.935, 0.338)]),
        ('band56', [(0.92, 5.6), (2.40, 5.6)]),
        ('top', [(-0.01, 0.92), (0.66, 0.92)]),
        ('rear', [(0.53, 1.40), (0.54, 1.10), (0.56, 0.95), (0.58, 0.80), (0.58, 0.70), (0.52, 0.66), (-0.01, 0.66)]),
        ('top', [(-0.01, -1.36), (0.55, -1.34)]),
    ],
    fuel=dict(center=(-1.05, 0.80), size=(0.14, 0.12)),
    cowl=dict(y_back=0.90),
    sail=(0.74, 0.84), mirror_base=(0.79, 0.895, 0.73),
    mirror='standard', mirror_size=0.95, hidden_wipers=False,
    handles=[(-0.19, 0.82)],
    plate_front_z=0.37, chin_z=0.19,
    badge='roundel_plain', badge_size=0.042, badge_front_z=0.535, badge_rear_z=0.85,
    antenna_y=-0.55,
    diffuser_z=0.26,
    exhaust=dict(round=True, pts=[(0.40, 0.25)], r=0.025, squash=1.0),
)
F['taillights'] = [dict(poly=[(44, 0.95), (30, 0.965), (16, 0.95), (8, 0.88), (6, 0.74), (9, 0.62), (20, 0.585), (34, 0.595),
                             (44, 0.63)], depth=0.05, round=0.35)]
F.pop('taillamps', None)
for k in ('roof_rails', 'cladding', 'fogs', 'fuel', 'tail_style'):
    F.pop(k, None)


def _smooth(D):
    zc = D['zc']
    # techo, parabrisas y capó por separado (un solo polinomio para techo y parabrisas sobrepasaba y
    # levantaba una pestaña en el borde superior del parabrisas)
    D['zc'] = _join(_fit(zc, 3, -1.33, 0.40), _fit(zc, 2, 0.40, 0.86), [p for p in zc if 0.86 < p[0] < 0.92],
                    _fit(zc, 3, 0.92, 1.67))
    for k, deg in ((3, 3), (4, 3)):
        D['r'][k] = _fit(D['r'][k], deg, -1.08, 1.40)
        D['z'][k] = _fit(D['z'][k], deg, -1.08, 1.40)


_ARCH_R = P['wr'] + 0.014 + 0.012
_lip = lambda ya: [(ya + _ARCH_R * math.cos(math.radians(t)), P['wr'] + _ARCH_R * math.sin(math.radians(t))) for t in range(-12, 193, 6)]
P['sculpt'] = [
    dict(op='ridge', space='side', nmin=0.3, pts=_lip(1.17), h=0.009, w=(0.016, 0.03), p=1.3, taper=0.06),
    dict(op='ridge', space='side', nmin=0.3, pts=_lip(-1.17), h=0.009, w=(0.016, 0.03), p=1.3, taper=0.06),
    dict(op='ridge', space='front', nmin=0.2, pts=[(0.48, 0.40), (0.60, 0.452), (0.71, 0.505), (0.785, 0.525)], h=-0.006,
         w=(0.02, 0.02), p=1.2, taper=0.05),
    dict(op='ridge', space='front', nmin=0.3, pts=[(0.0, 0.205), (0.40, 0.205), (0.70, 0.215)], h=0.004,
         w=(0.025, 0.01), p=1.3, taper=0.06),
]
_smooth(P)
PULGA = P
