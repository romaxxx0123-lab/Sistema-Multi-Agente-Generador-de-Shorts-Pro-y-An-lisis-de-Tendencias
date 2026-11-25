# Arma la carrocería completa (bmesh espejado) a partir de un diseño.
import math
import time
import bmesh
from .body import Body, build_half
from .cut import Ctx, Space, cut, select, inset, push
from . import shell
from .shell import M_PAINT, M_UNDER, M_GLASS, M_FRAME, M_TRIM, M_CHROME, M_GAP
from . import features as ft
from .features import M_LENS, M_HEAD, M_TAIL, M_BLINK, M_REFL, M_INNER

MAT_NAMES = shell.MAT_NAMES + ft.EXTRA_MATS


def build_body(D, log=print):
    t0 = time.time()
    body = Body(D)
    bm = bmesh.new()
    build_half(bm, body)
    C = Ctx(bm, body)
    F = D.get('features', {})
    shell.classify_base(C)
    R = D['wr'] + F.get('arch_gap', 0.045)
    for ya in (D['wb'] / 2, -D['wb'] / 2):
        shell.wheel_arch(C, ya, R, D['wr'])
    G = D['greenhouse']
    gh = shell.greenhouse(C, G)
    info = {'body': body, 'openings': {}, 'clean': bm.copy()}
    # vela del espejo: triángulo negro en la punta delantera de la ventanilla
    if 'sail' in F:
        s0, s1 = F['sail']
        par = Space('param')
        band = lambda f: f.material_index in (M_PAINT,) and 4.999 < C.st(f)[1] < 6.001 and C.normal(f).x > 0.05
        poly = [(s0, 5.0), (s1, 5.0), (s1, 6.0), (s0, 6.0)]
        cut(C, par, poly, True, band)
        for f in select(C, par, poly, band):
            f.material_index = M_TRIM
    # torpedo negro entre el parabrisas y el capó
    if 'cowl' in F:
        yb = F['cowl']['y_back']
        ws = G['ws_poly']
        base = [p for p in ws if p[1] > 0]  # borde delantero del parabrisas
        poly = [(x, y + 0.004) for (x, y) in sorted(base)] + [(1.0, yb), (-0.02, yb)]
        poly = [(x, y) for (x, y) in poly]
        top = lambda f: f.material_index == M_PAINT and C.normal(f).z > 0.2 and C.st(f)[1] > 5.0
        sp = Space('top')
        cut(C, sp, poly, True, top)
        for f in select(C, sp, poly, top):
            f.material_index = M_TRIM
    # ópticas delanteras: lente clara, paredes reflectoras, fondo oscuro
    if 'headlight' in F:
        h = F['headlight']
        poly = ft.densify(ft.rounded_poly(h['poly'], h.get('round', 0.2)), 1.5)
        info['openings']['head'] = ft.opening(C, 'frontc', poly, h['depth'], M_INNER, M_INNER, M_LENS, 0.0015, 0.1)
    # pilotos: lente ahumada, interior rojo (se enciende al frenar)
    info['openings']['tail'] = []
    for tl in F.get('taillights', []):
        poly = ft.densify(ft.rounded_poly(tl['poly'], tl.get('round', 0.25)), 1.5)
        info['openings']['tail'].append(ft.opening(C, 'rearc', poly, tl['depth'], M_TAIL, M_TAIL, M_LENS, 0.0015, 0.1))
    # parrilla y tomas
    if 'grille' in F:
        g = F['grille']
        poly = ft.densify(ft.rounded_poly(g['poly'], 0.25), 0.02)
        info['openings']['grille'] = ft.opening(C, 'front', poly, g['depth'], M_TRIM, M_TRIM, None, 0, 0.06)
    if 'intake' in F:
        g = F['intake']
        poly = ft.densify(ft.rounded_poly(g['poly'], 0.3), 0.02)
        info['openings']['intake'] = ft.opening(C, 'front', poly, g['depth'], M_TRIM, M_TRIM, None, 0, 0.06)
    if 'side_intakes' in F:
        g = F['side_intakes']
        poly = ft.densify(ft.rounded_poly(g['poly'], 0.3), 1.0)
        info['openings']['side_intake'] = ft.opening(C, 'frontc', poly, g['depth'], M_TRIM, M_TRIM, None, 0, 0.08)
    # labio inferior delantero y difusor trasero en plástico negro
    if 'chin_z' in F:
        z = F['chin_z']
        poly = [(-1, z), (95, z), (95, 0.0), (-1, 0.0)]
        ft.region(C, 'frontc', poly, M_TRIM)
    if 'diffuser_z' in F:
        z = F['diffuser_z']
        poly = [(18, z), (95, z), (95, 0.0), (18, 0.0)]
        ft.region(C, 'rearc', poly, M_TRIM)
        if 'exhaust' in F:
            ex = F['exhaust']
            (x0, x1), (z0, z1) = ex['x'], ex['z']
            poly = ft.densify(ft.rounded_poly([(x0, z1), (x1, z1), (x1, z0), (x0, z0)], 0.45, 5), 0.01)
            info['openings']['exhaust'] = ft.opening(C, 'rear', poly, 0.09, M_CHROME, M_TRIM, None, 0, 0.12, mats=(M_TRIM,))
    # juntas de paneles
    for kind, line in F.get('gaps', []):
        if kind == 'band56':
            pts = ft.densify(line, 0.02)
        elif kind in ('frontc', 'rearc'):
            pts = ft.densify(line, 1.0)
        else:
            pts = ft.densify(line, 0.015)
        ft.gap(C, kind, pts)
    # bolsillos de manijas y nicho de la patente trasera
    for (hy, hz) in F.get('handles', []):
        poly = ft.densify(ft.rounded_poly([(hy - 0.08, hz + 0.02), (hy + 0.08, hz + 0.02), (hy + 0.08, hz - 0.02), (hy - 0.08, hz - 0.02)], 0.45, 4), 0.006)
        ft.recess(C, 'side', poly, 0.012, M_INNER)
    if 'plate_rear' in F:
        p = F['plate_rear']
        poly = ft.densify(ft.rounded_poly(p['poly'], 0.08, 3), 0.01)
        ft.recess(C, 'rear', poly, p['depth'])
    shell.mirror_bm(bm)
    # tapa de combustible (sólo del lado derecho)
    if 'fuel' in F:
        (cy, cz), (w, h) = F['fuel']['center'], F['fuel']['size']
        poly = ft.rounded_poly([(cy - w / 2, cz + h / 2), (cy + w / 2, cz + h / 2), (cy + w / 2, cz - h / 2), (cy - w / 2, cz - h / 2)], 0.3, 4)
        poly = ft.densify(poly + [poly[0]], 0.008)
        ft.gap(C, 'side', poly, 0.004, 0.003)
    bmesh.ops.dissolve_degenerate(bm, dist=1e-6, edges=list(bm.edges))
    log('carrocería: %d caras en %.1fs' % (len(bm.faces), time.time() - t0))
    info['ctx'] = C
    return bm, info
