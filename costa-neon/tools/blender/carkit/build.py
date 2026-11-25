# Arma la carrocería completa (bmesh espejado) a partir de un diseño.
import math
import time
import bmesh
from .body import Body, build_half
from .cut import Ctx, Space, cut, select, inset, push
from . import shell
from .shell import M_PAINT, M_UNDER, M_GLASS, M_FRAME, M_TRIM, M_CHROME, M_GAP
from . import features as ft
from .features import M_LENS, M_HEAD, M_TAIL, M_BLINK, M_REFL, M_INNER, M_ALU
from . import styles as ST
from mathutils.bvhtree import BVHTree

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
    # revestimiento plástico (SUV): aro alrededor de los arcos y zócalo entre ruedas
    if F.get('cladding'):
        cl = F['cladding']
        side = Space('side')
        sidef = lambda f: f.material_index == M_PAINT and C.normal(f).x > 0.15
        for ya in (D['wb'] / 2, -D['wb'] / 2):
            ring = shell.circle(ya, D['wr'], R + cl['ring'], 72)
            cut(C, side, ring, True, sidef)
            for f in select(C, side, ring, sidef):
                f.material_index = M_TRIM
        zr = cl['rocker_z']
        rock = [(-3.0, -0.5), (3.0, -0.5), (3.0, zr), (-3.0, zr)]
        cut(C, side, rock, True, sidef)
        for f in select(C, side, rock, sidef):
            f.material_index = M_TRIM
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
    if 'cowl' in F and G.get('ws_space') != 'front':
        yb = F['cowl']['y_back']
        xm = F['cowl'].get('x_max', 1.0)
        ws = G['ws_poly']
        n = len(ws) // 2
        base = sorted(ws[n:])  # borde delantero del parabrisas (segunda mitad del polígono)
        poly = [(x, y + 0.004) for (x, y) in base if x <= xm] + [(xm, yb), (-0.02, yb)]
        poly = [(x, y) for (x, y) in poly]
        top = lambda f: f.material_index == M_PAINT and C.normal(f).z > 0.2 and C.st(f)[1] > 5.0
        sp = Space('top')
        cut(C, sp, poly, True, top)
        for f in select(C, sp, poly, top):
            f.material_index = M_TRIM
    cbvh = BVHTree.FromBMesh(info['clean'])
    # ópticas delanteras según estilo: lente clara, carcasa oscura
    if 'headlight' in F:
        h = F['headlight']
        style = h.get('style', 'slim')
        polys = []
        if style == 'round':
            for c, r in h['lamps']:
                polys.append(ST.ellipse_poly(cbvh, body, 'frontc', c, r, r, 0.0, 36))
        elif style == 'oval':
            polys.append(ST.ellipse_poly(cbvh, body, 'frontc', h['center'], h['rx'], h['rz'], h.get('rot', 0.0), 40))
        elif style != 'quad':
            polys.append(ft.densify(ft.rounded_poly(h['poly'], h.get('round', 0.2)), 1.5))
            if 'poly2' in h:
                polys.append(ft.densify(ft.rounded_poly(h['poly2'], h.get('round', 0.2)), 1.5))
        info['openings']['head'] = [ft.opening(C, 'frontc', pl, h['depth'], M_INNER, M_INNER, M_LENS, 0.0015, 0.1)
                                    for pl in polys if pl]
    # antinieblas redondos
    if 'fogs' in F:
        fg = F['fogs']
        for c, r in fg['lamps']:
            pl = ST.ellipse_poly(cbvh, body, fg.get('kind', 'frontc'), c, r * 1.25, r * 1.25, 0.0, 28)
            if pl:
                ft.opening(C, fg.get('kind', 'frontc'), pl, 0.05, M_INNER, M_INNER, None, 0, 0.1, mats=(M_PAINT, M_TRIM))
    # pilotos: lente ahumada, interior rojo (se enciende al frenar)
    info['openings']['tail'] = []
    for tl in F.get('taillights', []):
        if 'ellipse' in tl:
            c, rx, rz = tl['ellipse']
            poly = ST.ellipse_poly(cbvh, body, 'rearc', c, rx, rz, tl.get('rot', 0.0), 36)
            tl['poly'] = poly
        else:
            poly = ft.densify(ft.rounded_poly(tl['poly'], tl.get('round', 0.25)), 1.5)
        # 'dark': panel negro con focos adentro (estilo panel); si no, interior rojo
        wall = M_INNER if tl.get('dark') else M_TAIL
        info['openings']['tail'].append(ft.opening(C, 'rearc', poly, tl['depth'], wall, wall, M_LENS, 0.0015, 0.1))
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
            if ex.get('round'):
                # salidas redondas (una o dos por lado)
                for (x, z) in ex['pts']:
                    poly = ST.ellipse_poly(cbvh, body, 'rear', (x, z), ex['r'], ex['r'] * ex.get('squash', 1.0), 0.0, 24)
                    if poly:
                        ft.opening(C, 'rear', poly, 0.1, M_CHROME, M_TRIM, None, 0, 0.1, mats=(M_TRIM, M_PAINT))
            else:
                (x0, x1), (z0, z1) = ex['x'], ex['z']
                poly = ft.densify(ft.rounded_poly([(x0, z1), (x1, z1), (x1, z0), (x0, z0)], 0.45, 5), 0.01)
                info['openings']['exhaust'] = ft.opening(C, 'rear', poly, 0.09, M_CHROME, M_TRIM, None, 0, 0.12, mats=(M_TRIM,))
    # rejilla trasera (superauto): panal entre los pilotos y el difusor
    if 'rear_grille' in F:
        rg = F['rear_grille']
        poly = ft.densify(ft.rounded_poly(rg['poly'], 0.2), 0.02)
        info['openings']['rear_grille'] = ft.opening(C, 'rear', poly, rg.get('depth', 0.06), M_TRIM, M_INNER, None, 0, 0.05)
    # tomas laterales (superauto): aberturas en la vista lateral delante de la rueda trasera
    for k, sv in enumerate(F.get('side_vents', [])):
        poly = ft.densify(ft.rounded_poly(sv['poly'], sv.get('round', 0.25)), 0.01)
        info['openings']['side_vent%d' % k] = ft.opening(C, 'side', poly, sv.get('depth', 0.12), M_TRIM, M_TRIM, None, 0, 0.1)
    # caja de carga (pickup): abertura desde arriba con paredes pintadas y piso negro
    if 'bed' in F:
        b = F['bed']
        poly = ft.densify(ft.rounded_poly(b['poly'], 0.06, 3), 0.02)
        info['openings']['bed'] = ft.opening(C, 'top', poly, b['depth'], M_PAINT, M_TRIM, None, 0, 0.0)
    # luneta trasera de cabina (pickup / furgón): región en vista trasera sobre caras que miran atrás
    if 'cab_glass' in F:
        cg = F['cab_glass']
        rearf = lambda f: f.material_index == M_PAINT and C.normal(f).y < -0.5
        shell.glass_cut(C, Space('front'), cg['poly'], rearf, 0.02, 0.008)
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
    # paragolpes cromados y cubrecárter de aluminio (sobre pintura o plástico negro)
    for kind, poly in F.get('chrome_regions', []):
        ft.region(C, kind, ft.densify(poly, 0.02 if kind in ('front', 'rear', 'side', 'top') else 1.0), M_CHROME, mats=(M_PAINT, M_TRIM))
    for kind, poly in F.get('skid', []):
        ft.region(C, kind, ft.densify(ft.rounded_poly(poly, 0.25), 0.02), M_ALU, mats=(M_PAINT, M_TRIM))
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
