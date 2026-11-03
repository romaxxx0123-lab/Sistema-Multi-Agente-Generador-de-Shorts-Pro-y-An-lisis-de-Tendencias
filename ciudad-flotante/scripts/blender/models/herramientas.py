"""
Objetos en mano del jugador (primera persona) y piezas que vuelan por el mundo (garfio lanzado y
pez capturado). El corcho de la caña sigue siendo el procedimental: el de Blender no lo mejoraba.

MARCO: el de `buildItemModel` en src/game/tools/models.ts pasado a Blender. El puño agarra el eje
Z en el origen; +Y es «hacia delante», lejos de la cámara (juego −z); +X, a la derecha. Las piezas
que el juego monta con su propia transformación (garfio, pez) usan el marco de su función
(`buildGrapnel`, `buildFish`). Mismas medidas que el procedimental: alturas, anclajes
(punta de la caña, cabeza del martillo, boca del cubo…) y huella no cambian.

Todos se suben VM_LIFT metros (convención de base apoyada, ver mano.py) y models.ts los baja.
"""
import importlib.util
import math
import os

from mathutils import Matrix, Vector

import bmesh
import cf

_spec = importlib.util.spec_from_file_location('models._mano', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'mano.py'))
_mano = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mano)
limb, hull, lift = _mano.limb, _mano.hull, _mano.lift

WOOD = '#9c6644'
WOOD_DARK = '#7e5034'
WOOD_LIGHT = '#b07a52'
STEEL = 'metal'
STEEL_DARK = 'metalDark'
STEEL_LIGHT = '#c9d1d6'
ROPE = 'rope'
ROPE_DARK = '#c4a466'
ROPE_DEEP = '#a87444'      # una vuelta más oscura: el cabo se recorta sobre la cubierta beige
HEAD = '#7d8590'           # cabeza del martillo: un tono más clara que metalDark (de noche era negra)


def scale(ob, sx, sy, sz):
    ob.data.transform(Matrix.Diagonal((sx, sy, sz, 1)))
    return ob


def grain(ob, base, dark, light, freq=3.0, seed=1):
    """Vetas de madera por color: franjas a lo largo del eje Z (mangos) y algo de ruido."""
    cf.paint(ob, base)
    def band(p, lo, hi):
        a = math.atan2(p.center.y, p.center.x)
        v = math.sin(a * freq + p.center.z * 9.0 + math.sin(p.center.z * 23.0) * 0.8)
        return lo < v < hi
    cf.paint(ob, dark, lambda p: band(p, 0.55, 2) and abs(p.normal.z) < 0.7)
    cf.paint(ob, light, lambda p: band(p, -2, -0.75) and abs(p.normal.z) < 0.7)
    return cf.jitter_colors(ob, 0.05, seed=seed)


def finish(parts, name):
    return lift(cf.model(parts, name))


# ================================================================ herramientas

def martillo():
    """Martillo de carpintero: mango ovalado de madera con vetas y empuñadura encintada, cabeza
    forjada con boca pulida hacia delante (+Y) y uña curva partida hacia atrás."""
    prof = [(0.0, -0.106), (0.019, -0.106), (0.023, -0.098), (0.022, -0.08), (0.02, -0.05), (0.0185, -0.02), (0.0175, 0.02),
            (0.0168, 0.06), (0.016, 0.1), (0.015, 0.14), (0.0143, 0.18), (0.0148, 0.215), (0.016, 0.245), (0.0, 0.25)]
    handle = cf.lathe(prof, seg=8, color=WOOD)
    scale(handle, 0.82, 1.0, 1.0)
    grain(handle, WOOD, WOOD_DARK, WOOD_LIGHT, freq=2.0, seed=21)
    # Empuñadura encintada (cinta oscura con dos vueltas marcadas).
    grip = cf.lathe([(0.0, -0.1), (0.021, -0.1), (0.0225, -0.094), (0.0222, -0.075), (0.0212, -0.058), (0.0, -0.058)], seg=8, color='#5a3a24')
    scale(grip, 0.84, 1.0, 1.0)
    cf.paint(grip, '#6e4a2e', lambda p: -0.088 < p.center.z < -0.07)
    # Cabeza: ojo (bloque que abraza el mango), cuello y boca de golpeo hacia +Y.
    eye = cf.box((0.042, 0.054, 0.062), at=(0, 0.004, 0.238), color=HEAD)
    cf.bevel(eye, 0.006, 1, 30)
    neck = cf.cylinder(0.0175, 0.07, seg=8, at=(0, 0.028, 0.27), rot=(-90, 0, 0), color=HEAD, r2=0.0195)
    face = cf.lathe([(0.0, 0.0), (0.0235, 0.0), (0.025, 0.012), (0.0225, 0.024), (0.0, 0.024)], seg=8, at=(0, 0.096, 0.27), rot=(-90, 0, 0), color=STEEL)
    cf.paint(face, STEEL_LIGHT, lambda p: p.normal.y > 0.8)
    # Uña: dos dientes que salen hacia atrás (−Y) y se curvan hacia abajo, con la V entre ellos.
    claws = []
    for sx in (-1, 1):
        pts = [(sx * 0.008, -0.018, 0.278), (sx * 0.0085, -0.05, 0.277), (sx * 0.009, -0.084, 0.268), (sx * 0.0095, -0.11, 0.252), (sx * 0.01, -0.128, 0.232)]
        c = limb(pts, [(0.012, 0.0085), (0.012, 0.0085), (0.0105, 0.0078), (0.008, 0.0065), (0.004, 0.004)], seg=4, color=STEEL_DARK, phase=math.pi / 4, up=(0, 0, 1))
        cf.paint(c, STEEL, lambda p: p.normal.z < -0.5)
        claws.append(c)
    # Cuña del mango asomando por arriba del ojo.
    wedge = cf.box((0.006, 0.03, 0.004), at=(0, 0.004, 0.2985), color=WOOD_DARK)
    return finish([handle, grip, eye, neck, face, wedge, *claws], 'vm_martillo')


def llave():
    """Llave inglesa: barra plana (de cara a la cámara) con empuñadura de plástico rojo, cabeza
    con la boca abierta arriba y el tornillo sinfín moleteado."""
    # Silueta de la cabeza y el cuello (plano XZ), extruida en Y (grosor 16 mm).
    outline = [(-0.017, 0.15), (0.017, 0.15), (0.017, 0.2), (0.03, 0.214), (0.044, 0.232), (0.048, 0.258), (0.046, 0.3),
               (0.036, 0.314), (0.026, 0.31), (0.021, 0.302), (0.021, 0.268), (-0.021, 0.268), (-0.021, 0.304), (-0.027, 0.314),
               (-0.038, 0.316), (-0.047, 0.302), (-0.048, 0.258), (-0.042, 0.232), (-0.03, 0.214), (-0.017, 0.2)]
    head = cf.prism(outline, 0.016, rot=(90, 0, 0), color=STEEL)
    head.data.transform(Matrix.Translation((0, 0.008, 0)))
    cf.bevel(head, 0.0025, 1, 35)
    cf.paint(head, STEEL_LIGHT, lambda p: abs(p.normal.y) > 0.8 and p.center.z > 0.25)
    cf.jitter_colors(head, 0.04, seed=31)
    bar = cf.box((0.03, 0.013, 0.24), at=(0, 0, -0.088), color=STEEL)
    cf.bevel(bar, 0.003, 1, 35)
    # Ranura de la mandíbula móvil (línea oscura) y sinfín moleteado.
    slot = cf.box((0.004, 0.0172, 0.03), at=(-0.012, 0, 0.268), color=STEEL_DARK)
    worm = cf.cylinder(0.0105, 0.026, seg=10, at=(-0.025, 0, 0.243), rot=(0, 90, 0), color=STEEL_DARK)
    cf.paint(worm, STEEL, lambda p: int((math.atan2(p.center.y, p.center.z - 0.243) + math.pi) / (2 * math.pi) * 10) % 2 == 0 and abs(p.normal.x) < 0.5)
    # Empuñadura de plástico rojo (sección ovalada) con el agujero de colgar.
    grip = limb([(0, 0, -0.094), (0, 0, -0.088), (0, 0, -0.02), (0, 0, 0.06), (0, 0, 0.09), (0, 0, 0.096)],
                [(0.014, 0.008), (0.021, 0.0115), (0.0215, 0.012), (0.02, 0.0112), (0.0195, 0.011), (0.013, 0.007)],
                seg=8, color='hullStripe', up=(1, 0, 0))
    cf.paint(grip, '#a3412d', lambda p: abs(p.center.z - 0.03) < 0.006 or abs(p.center.z + 0.05) < 0.006)
    hole = cf.cylinder(0.0055, 0.0242, seg=6, at=(0, 0.0121, -0.078), rot=(90, 0, 0), color='#2b2d42')
    return finish([head, bar, slot, worm, grip, hole], 'vm_llave_inglesa')


def garfio():
    """Garfio de rescate en el marco de `buildGrapnel`: argolla en el origen, caña hacia abajo y
    cuatro uñas curvas con punta (desgastada, más clara)."""
    eye = cf.torus(0.021, 0.0068, seg=10, tube_seg=5, rot=(90, 0, 0), color=STEEL_DARK)
    shank = limb([(0, 0, -0.012), (0, 0, -0.03), (0, 0, -0.12), (0, 0, -0.19), (0, 0, -0.205)],
                 [0.009, 0.0115, 0.0125, 0.0135, 0.012], seg=6, color=STEEL_DARK)
    collar = cf.cylinder(0.017, 0.016, seg=8, at=(0, 0, -0.03), color=STEEL, r2=0.0155)
    crown = cf.sphere(0.019, at=(0, 0, -0.205), color=STEEL_DARK, subdiv=1, scale=(1, 1, 0.75))
    claws = []
    for k in range(4):
        a = k / 4 * 2 * math.pi + math.pi / 4
        cx, cy = math.cos(a), -math.sin(a)
        pts = [(cx * r, cy * r, z) for r, z in ((0.008, -0.205), (0.04, -0.217), (0.07, -0.21), (0.088, -0.185), (0.093, -0.15), (0.084, -0.122), (0.077, -0.11))]
        c = limb(pts, [0.0105, 0.0098, 0.009, 0.0082, 0.0072, 0.0052, 0.0016], seg=5, color=STEEL_DARK, up=(0, 0, 1))
        tip = Vector(pts[-2])
        cf.paint(c, STEEL, lambda p: p.center.z > -0.17)
        cf.paint(c, STEEL_LIGHT, lambda p: (p.center - tip).length < 0.02)
        claws.append(c)
    return finish([eye, shank, collar, crown, *claws], 'vm_garfio')


def gancho_rollo():
    """Rollo de cabo del gancho: tres vueltas en el plano XZ (de cara a la cámara) que pasan por
    dentro del puño, que agarra el haz por su lado derecho; el rollo cuelga a la izquierda de la
    mano. Cabo trenzado (franjas en diagonal) y una ligadura que sujeta el haz."""
    R = 0.07
    parts = []
    for i, y in enumerate((-0.012, 0.0, 0.012)):
        n = 16
        pts = []
        for j in range(n + 1):
            t = j / n * 2 * math.pi
            # Círculo que pasa por el origen con tangente vertical (el puño agarra por ahí).
            r = R * (1 - 0.05 * i)
            x = -r + r * math.cos(t)
            z = r * math.sin(t) - 0.012 * i
            pts.append((x, y + 0.005 * math.sin(t * 2 + i), z))
        base, stripe = (ROPE_DEEP, '#8d5f36') if i == 1 else (ROPE, ROPE_DARK)
        ring = limb(pts, [0.0115] * len(pts), seg=6, color=base, caps=(False, False))
        cx = -r
        cf.paint(ring, stripe, lambda p, cx=cx: math.sin(math.atan2(p.center.z, p.center.x - cx) * 11 + p.center.y * 300) > 0.35)
        cf.jitter_colors(ring, 0.05, seed=40 + i)
        parts.append(ring)
    # Ligada: unas vueltas de cabo que sujetan el haz por abajo a la izquierda.
    tie = cf.torus(0.02, 0.0055, seg=8, tube_seg=4, at=(-0.115, 0, -0.052), rot=(0, 52, 0), color=ROPE_DARK)
    scale(tie, 1.0, 1.3, 1.0)
    return finish([*parts, tie], 'vm_gancho_rollo')


def cana():
    """Caña de pescar: tacón de goma, empuñadura de corcho, carrete lateral con manivela, porta
    carrete metálico, caña ahusada en dos tramos con ligaduras rojas y anillas por debajo."""
    butt = Vector((0, -0.06, -0.13))
    top = Vector((0, 0.03, 0.06))
    mid = Vector((0, 0.3, 0.55))
    tip = Vector((0, 0.58, 1.05))
    u1 = (top - butt).normalized()
    u2 = (tip - top).normalized()
    hp = lambda s: butt + u1 * s  # noqa: E731
    L1 = (top - butt).length
    # (El mango queda casi siempre tapado por el puño: secciones de 7 lados y pocos anillos.)
    cap = limb([hp(-0.004), hp(0.004), hp(0.02)], [0.016, 0.0228, 0.021], seg=7, color='#2b2d42')
    cork = limb([hp(0.018), hp(0.03), hp(L1 - 0.006)], [0.0205, 0.0225, 0.0178], seg=7, color='#c9a36a')
    cf.jitter_colors(cork, 0.09, seed=51)
    ferrule = limb([top - u1 * 0.012, top, top + u2 * 0.012], [0.0175, 0.0172, 0.0145], seg=6, color=STEEL)
    blank1 = limb([top, (top + mid) / 2, mid], [0.0118, 0.0102, 0.0086], seg=5, color='#bc8a5f', caps=(False, False))
    blank2 = limb([mid, (mid + tip) / 2, tip, tip + u2 * 0.006], [0.0086, 0.0065, 0.0042, 0.0025], seg=5, color='#8a5a3a', caps=(False, True))
    joint = limb([mid - u2 * 0.014, mid, mid + u2 * 0.014], [0.0102, 0.0108, 0.0098], seg=5, color='#6e4a2e')
    # Anillas por debajo de la caña (lado del carrete) con su ligadura roja.
    n = Vector((0, -u2.z, u2.y))
    if n.dot(Vector((0, -1, 0))) < 0:
        n = -n
    rings = []
    for t in (0.35, 0.62, 0.86):
        c = top + (tip - top) * t
        r_blank = 0.0118 + (0.0042 - 0.0118) * t
        wrap = limb([c - u2 * 0.012, c + u2 * 0.012], [r_blank + 0.0016] * 2, seg=4, color='#bc4749', phase=math.pi / 4)
        foot = limb([c + n * r_blank * 0.8, c + n * (r_blank + 0.007)], [0.0016, 0.0013], seg=3, color=STEEL_DARK)
        ring = cf.torus(0.006 - 0.002 * t, 0.0014, seg=6, tube_seg=3, color=STEEL_LIGHT)
        ring.matrix_basis = Matrix.Translation(c + n * (r_blank + 0.007 + 0.006 - 0.002 * t)) @ u2.to_track_quat('Z', 'Y').to_matrix().to_4x4()
        rings += [wrap, foot, ring]
    tiptop = cf.torus(0.0035, 0.0012, seg=6, tube_seg=3, color=STEEL_LIGHT)
    tiptop.matrix_basis = Matrix.Translation(tip + u2 * 0.006) @ u2.to_track_quat('Z', 'Y').to_matrix().to_4x4()
    # Carrete lateral: pie, cuerpo con el sedal enrollado, tapas y manivela con pomo.
    stem = limb([(0, -0.018, -0.008), (0, -0.032, -0.04), (0, -0.045, -0.062)], [(0.006, 0.004), (0.0055, 0.0045), (0.005, 0.0045)], seg=4, color=STEEL_DARK)
    seat = limb([hp(0.095), hp(0.104), hp(0.134)], [0.021, 0.0232, 0.0215], seg=7, color=STEEL)
    c0 = Vector((0, -0.05, -0.075))
    drum = cf.lathe([(0.0, -0.028), (0.035, -0.028), (0.036, -0.02), (0.022, -0.02), (0.024, 0.0), (0.022, 0.02),
                     (0.036, 0.02), (0.035, 0.028), (0.0, 0.028)], seg=8, rot=(0, 90, 0), color=STEEL)
    drum.data.transform(Matrix.Translation(c0))
    cf.paint(drum, '#e8f4f2', lambda p: abs(p.center.x - c0.x) < 0.019 and (p.center - c0).length > 0.015)
    cf.paint(drum, STEEL_DARK, lambda p: abs(p.normal.x) > 0.8 and 0.012 < Vector((0, p.center.y - c0.y, p.center.z - c0.z)).length < 0.026
             and int((math.atan2(p.center.z - c0.z, p.center.y - c0.y) + math.pi) / (2 * math.pi) * 6 + 0.5) % 2 == 0)
    hub = cf.cylinder(0.009, 0.064, seg=6, at=(c0.x - 0.032, c0.y, c0.z), rot=(0, 90, 0), color=STEEL_DARK)
    crank = limb([(0.031, c0.y, c0.z), (0.036, c0.y - 0.004, c0.z - 0.012), (0.04, c0.y - 0.006, c0.z - 0.024)], [(0.004, 0.0025)] * 3, seg=4, color=STEEL_DARK)
    knob = cf.cylinder(0.0065, 0.02, seg=6, at=(0.04, c0.y - 0.006, c0.z - 0.024), rot=(0, 90, 0), color='#2b2d42')
    return finish([cap, cork, ferrule, blank1, blank2, joint, *rings, tiptop, stem, seat, drum, hub, crank, knob], 'vm_cana')


def cubo():
    """Cubo de chapa galvanizada: cuerpo troncocónico con borde enrollado, dos nervios, orejas
    remachadas y asa de alambre con empuñadura de madera (el puño la agarra en el origen)."""
    prof = [(0.0, -0.378), (0.1, -0.378), (0.108, -0.372), (0.11, -0.36), (0.113, -0.335), (0.1155, -0.33), (0.1145, -0.325),
            (0.131, -0.205), (0.1335, -0.2), (0.1325, -0.195), (0.14, -0.152), (0.147, -0.147), (0.1485, -0.14), (0.1445, -0.134),
            (0.137, -0.138), (0.134, -0.146), (0.106, -0.352), (0.099, -0.36), (0.0, -0.36)]
    body = cf.lathe(prof, seg=12, color='#adb5bd')
    cf.paint(body, '#7d8590', lambda p: Vector((p.center.x, p.center.y, 0)).length < 0.134 and p.center.z > -0.355 and p.normal.z < 0.9 and p.center.z < -0.14 and Vector((p.normal.x, p.normal.y, 0)).dot(Vector((p.center.x, p.center.y, 0))) < 0)
    cf.paint(body, '#6c757d', lambda p: p.normal.z > 0.9 and p.center.z < -0.3)
    cf.paint(body, '#ced4da', lambda p: p.center.z > -0.15 and Vector((p.center.x, p.center.y, 0)).length > 0.136)
    cf.paint(body, '#949ca4', lambda p: abs(p.center.z + 0.33) < 0.008 or abs(p.center.z + 0.2) < 0.008)
    cf.jitter_colors(body, 0.06, seed=61)
    parts = [body]
    for sx in (-1, 1):
        ear = cf.box((0.01, 0.034, 0.04), at=(sx * 0.143, 0, -0.19), color='#949ca4')
        cf.bevel(ear, 0.003, 1, 35)
        rivet = cf.cylinder(0.005, 0.006, seg=6, at=(sx * 0.147, 0, -0.164), rot=(0, sx * 90, 0), color=STEEL_DARK)
        parts += [ear, rivet]
    # Asa: alambre desde las orejas hasta la empuñadura de madera, que pasa por el puño.
    wire = []
    for sx in (-1, 1):
        wire.append(limb([(sx * 0.15, 0, -0.164), (sx * 0.153, 0, -0.14), (sx * 0.142, 0, -0.095), (sx * 0.112, 0, -0.045), (sx * 0.08, 0, -0.012), (sx * 0.05, 0, 0.0), (sx * 0.035, 0, 0.0)],
                         [0.0045] * 7, seg=5, color=STEEL_DARK))
    grip = cf.lathe([(0.0, -0.05), (0.009, -0.05), (0.0115, -0.044), (0.0122, 0.0), (0.0115, 0.044), (0.009, 0.05), (0.0, 0.05)], seg=8, rot=(0, 90, 0), color=WOOD)
    grain(grip, WOOD, WOOD_DARK, WOOD_LIGHT, freq=2.0, seed=62)
    return finish([*parts, *wire, grip], 'vm_cubo')


def cubo_agua():
    """Agua del cubo lleno: superficie con un poco de oleaje (facetas de dos tonos) a la altura
    del agua procedimental, ajustada a la pared interior."""
    rings = [(0.0, 0.004), (0.045, -0.002), (0.09, 0.003), (0.131, 0.0)]
    bm = bmesh.new()
    center = bm.verts.new((0, 0, rings[0][1]))
    seg = 14
    allrings = []
    for r, dz in rings[1:]:
        ring = []
        for k in range(seg):
            a = 2 * math.pi * (k + (0.5 if len(allrings) % 2 else 0)) / seg
            wob = 0.0025 * math.sin(a * 3 + r * 40) if r < 0.13 else 0.0
            ring.append(bm.verts.new((r * math.cos(a), r * math.sin(a), dz + wob)))
        allrings.append(ring)
    for k in range(seg):
        bm.faces.new((center, allrings[0][k], allrings[0][(k + 1) % seg]))
    for i in range(len(allrings) - 1):
        a, b = allrings[i], allrings[i + 1]
        for k in range(seg):
            bm.faces.new((a[k], b[k], b[(k + 1) % seg], a[(k + 1) % seg]))
    bmesh.ops.triangulate(bm, faces=bm.faces)
    for f in bm.faces:
        if f.normal.z < 0:
            f.normal_flip()
    bm.transform(Matrix.Translation((0, 0, -0.152)))
    ob = cf._link('agua', bm)
    cf.paint(ob, '#2a9d8f')
    cf.paint(ob, '#3fb3a3', lambda p: p.normal.x + p.normal.y > 0.04)
    cf.paint(ob, '#5ec4b6', lambda p: p.normal.x + p.normal.y > 0.09)
    cf.paint(ob, '#a8dcd1', lambda p: Vector((p.center.x, p.center.y, 0)).length > 0.115 and p.center.y > 0.02)
    return finish([ob], 'vm_cubo_agua')


# ================================================================ comida y bebida

def pez(name, back, flank, belly, fin, eye, bars=None, grill=None, twine=False):
    """Pez en el marco de `buildFish`: a lo largo de X con la cabeza en +X, de canto (alto en Z,
    fino en Y), centrado en el origen. Longitud total 0,26 m (de −0,16 a 0,1)."""
    xs = [0.1, 0.093, 0.075, 0.045, 0.01, -0.03, -0.07, -0.098, -0.112]
    hs = [(0.006, 0.004), (0.017, 0.011), (0.03, 0.018), (0.04, 0.0215), (0.043, 0.022), (0.037, 0.0195), (0.024, 0.0135), (0.011, 0.0065), (0.008, 0.005)]
    body = limb([(x, 0, 0.002 if i < 3 else 0) for i, x in enumerate(xs)], hs, seg=8, color=flank, up=(0, 0, 1))
    cf.paint(body, back, lambda p: p.normal.z > 0.45)
    cf.paint(body, belly, lambda p: p.normal.z < -0.3)
    if bars:
        cf.paint(body, bars, lambda p: p.normal.z > 0.2 and p.center.x < 0.04 and math.sin(p.center.x * 140) > 0.3)
    if grill:
        cf.paint(body, grill, lambda p: abs(p.normal.y) > 0.3 and -0.09 < p.center.x < 0.06 and (p.center.x * 1.0 + p.center.z * 0.6 + 0.2) % 0.034 < 0.008)
    # Opérculo: línea de la agalla.
    cf.paint(body, fin, lambda p: 0.052 < p.center.x < 0.062 and abs(p.normal.y) > 0.4)
    cf.jitter_colors(body, 0.04, seed=hash(name) & 0xFFFF)
    parts = [body]
    # Cola ahorquillada, aleta dorsal, anal y pectorales (láminas con algo de grosor).
    tail = cf.prism([(-0.105, -0.004), (-0.165, 0.05), (-0.15, 0.006), (-0.15, -0.006), (-0.165, -0.05), (-0.105, 0.004)], 0.004, rot=(90, 0, 0), color=fin)
    tail.data.transform(Matrix.Translation((0, 0.002, 0)))
    dorsal = cf.prism([(-0.05, 0.034), (0.03, 0.04), (0.012, 0.06), (-0.03, 0.058)], 0.0035, rot=(90, 0, 0), color=fin)
    dorsal.data.transform(Matrix.Translation((0, 0.00175, 0)))
    anal = cf.prism([(-0.065, -0.022), (-0.02, -0.034), (-0.04, -0.046), (-0.07, -0.034)], 0.003, rot=(90, 0, 0), color=fin)
    anal.data.transform(Matrix.Translation((0, 0.0015, 0)))
    parts += [tail, dorsal, anal]
    for sy in (-1, 1):
        pec = cf.prism([(0.045, -0.012), (0.012, -0.004), (0.016, -0.028)], 0.003, rot=(90, 0, 0), color=fin)
        pec.data.transform(Matrix.Translation((0, sy * 0.021, 0)))
        if eye[1] is None:
            # Ojo cocido: disco mate casi a ras, sin pupila ni canto oscuro.
            parts += [pec, cf.cylinder(0.0078, 0.0025, seg=8, at=(0.072, sy * 0.0155, 0.009), rot=(sy * -90, 0, 0), color=eye[0])]
            continue
        eye_o = cf.cylinder(0.0082, 0.004, seg=8, at=(0.072, sy * 0.0155, 0.009), rot=(sy * -90, 0, 0), color=eye[0])
        pupil = cf.cylinder(0.0045, 0.002, seg=6, at=(0.0725, sy * 0.0192, 0.009), rot=(sy * -90, 0, 0), color=eye[1])
        parts += [pec, eye_o, pupil]
    # Boca: una muesca oscura.
    mouth = cf.box((0.008, 0.016, 0.0025), at=(0.096, 0, -0.003), color='#3a2a1a', base=False)
    parts.append(mouth)
    if twine:
        # Bramante del ahumadero atado a la cola, con la lazada para colgarlo.
        knot = cf.torus(0.011, 0.0022, seg=8, tube_seg=4, at=(-0.104, 0, 0), rot=(0, 90, 0), color=ROPE)
        loop = limb([(-0.104, 0, 0.01), (-0.112, 0, 0.03), (-0.124, 0, 0.038), (-0.132, 0, 0.026), (-0.12, 0, 0.012)], [0.0018] * 5, seg=4, color=ROPE)
        parts += [knot, loop]
    return finish(parts, name)


def conserva():
    """Lata de conserva: bordes engatillados, nervios, tapa hundida con anilla y etiqueta roja
    con franja crema y un pez dibujado."""
    prof = [(0.0, 0.0), (0.036, 0.0), (0.0412, 0.0025), (0.0428, 0.0055), (0.0414, 0.0085), (0.0414, 0.0125), (0.0421, 0.0135),
            (0.0421, 0.03), (0.0423, 0.0305), (0.0423, 0.0425), (0.0421, 0.043), (0.0421, 0.0615), (0.0414, 0.0625), (0.0414, 0.066), (0.0428, 0.0692), (0.0418, 0.0728), (0.0385, 0.075), (0.0372, 0.0725),
            (0.0362, 0.0715), (0.0, 0.0715)]
    can = cf.lathe(prof, seg=12, color='#adb5bd')
    cf.paint(can, '#ced4da', lambda p: p.normal.z > 0.6)
    cf.paint(can, '#c8553d', lambda p: 0.0135 < p.center.z < 0.0615 and abs(p.normal.z) < 0.5)
    cf.paint(can, '#f3ead6', lambda p: 0.03 < p.center.z < 0.043 and abs(p.normal.z) < 0.5)
    # Pez de la etiqueta (en la cara que mira a la cámara, −Y).
    cf.paint(can, '#264653', lambda p: 0.032 < p.center.z < 0.041 and p.center.y < -0.03 and abs(p.center.x) < 0.018)
    cf.jitter_colors(can, 0.03, seed=71)
    tab = cf.torus(0.0085, 0.0018, seg=8, tube_seg=3, at=(0.016, -0.004, 0.0733), color=STEEL_LIGHT)
    rivet = cf.cylinder(0.003, 0.002, seg=6, at=(0.005, 0, 0.0715), color=STEEL)
    return finish([can, tab, rivet], 'vm_conserva')


def botella():
    """Botella de agua de plástico azul: hombros, tapón blanco estriado y la etiqueta crema con una
    gota POR ENCIMA del puño (más abajo la tapan los dedos). Pocas caras: ≤ 200 triángulos."""
    prof = [(0.0, -0.04), (0.031, -0.04), (0.034, -0.034), (0.034, 0.05), (0.0352, 0.051), (0.0352, 0.081), (0.034, 0.082),
            (0.029, 0.098), (0.018, 0.112), (0.0145, 0.12), (0.0, 0.12)]
    body = cf.lathe(prof, seg=8, color='#4cc9f0')
    cf.paint(body, '#7fd8f5', lambda p: p.center.z > 0.085 and p.normal.z > 0.3)
    cf.paint(body, '#38a9cf', lambda p: p.center.z < -0.03)
    cf.paint(body, '#f3ead6', lambda p: 0.051 < p.center.z < 0.081 and abs(p.normal.z) < 0.5)
    # Gota azul en la etiqueta, en la cara que mira a la cámara (−Y).
    drop = cf.prism([(0.0, -0.009), (0.0065, -0.003), (0.004, 0.003), (0.0, 0.0105), (-0.004, 0.003), (-0.0065, -0.003)], 0.0015,
                    rot=(90, 0, 0), color='#2a8fbf')
    drop.data.transform(Matrix.Translation((0.0, -0.0345, 0.066)))
    cap = cf.lathe([(0.0, 0.12), (0.0165, 0.12), (0.0168, 0.145), (0.0, 0.145)], seg=8, color='#f8f9fa')
    cf.paint(cap, '#dfe3e6', lambda p: abs(p.normal.z) < 0.5 and int((math.atan2(p.center.y, p.center.x) + math.pi) / (2 * math.pi) * 8) % 2 == 0)
    return finish([body, drop, cap], 'vm_botella')


def cuenco(name, broth, bits):
    """Cuenco de loza crema con franja azul en el borde y la comida dentro (caldo y tropezones)."""
    prof = [(0.0, 0.02), (0.044, 0.02), (0.048, 0.024), (0.046, 0.03), (0.06, 0.042), (0.074, 0.058), (0.084, 0.074), (0.0875, 0.081),
            (0.085, 0.0845), (0.0805, 0.0825), (0.077, 0.076), (0.06, 0.054), (0.044, 0.04), (0.0, 0.036)]
    bowl = cf.lathe(prof, seg=14, color='#f3ead6')
    cf.paint(bowl, 'wallTrim', lambda p: 0.071 < p.center.z < 0.079 and Vector((p.normal.x, p.normal.y, 0)).dot(Vector((p.center.x, p.center.y, 0))) > 0)
    cf.paint(bowl, '#e3d6b8', lambda p: p.center.z < 0.03)
    cf.jitter_colors(bowl, 0.025, seed=81)
    soup = cf.cylinder(0.073, 0.004, seg=14, at=(0, 0, 0.068), color=broth, cap=True)
    cf.jitter_colors(soup, 0.05, seed=82)
    parts = [bowl, soup]
    r = cf.rng(hash(name) & 0xFFFF)
    for i, (color, size, n) in enumerate(bits):
        for k in range(n):
            a = r.random() * 2 * math.pi
            d = 0.012 + r.random() * 0.045
            b = cf.box((size, size * (0.8 + r.random() * 0.4), size * 0.7), at=(d * math.cos(a), d * math.sin(a), 0.069), rot=(r.random() * 30, r.random() * 30, r.random() * 90), color=color)
            parts.append(b)
    return finish(parts, name)


def fruta():
    """Mango maduro: verde amarillento abajo, amarillo y con rubor naranja hacia la cámara,
    rabito y una hoja."""
    body = cf.sphere(1.0, at=(0, 0, 0), color='#f9c74f', subdiv=2)
    # Forma de riñón: escala y una leve curva hacia +X arriba.
    for v in body.data.vertices:
        x, y, z = v.co
        v.co = Vector((x * 0.047 + 0.006 * z * z, y * 0.04, z * 0.058 + 0.065))
    body.data.update()
    cf.paint(body, '#f9c74f')
    cf.paint(body, '#a7c957', lambda p: p.center.z < 0.03 and p.center.x > -0.01)
    cf.paint(body, '#f8961e', lambda p: p.center.y < -0.015 and p.center.z > 0.05)
    cf.paint(body, '#e76f51', lambda p: p.center.y < -0.028 and p.center.z > 0.075 and p.center.x < 0.02)
    cf.jitter_colors(body, 0.04, seed=91)
    stem = cf.cylinder(0.0035, 0.016, seg=5, at=(0.004, 0.0, 0.119), rot=(0, 12, 0), color='#6e4a2e')
    leaf = cf.prism([(0.0, 0.0), (0.03, 0.012), (0.058, 0.004), (0.03, -0.008)], 0.002, rot=(90, -28, 0), color='plant')
    leaf.data.transform(Matrix.Translation((0.008, 0.001, 0.13)))
    cf.paint(leaf, 'plantDark', lambda p: p.normal.z < 0)
    return finish([body, stem, leaf], 'vm_fruta')


def leaf(a, r0, z0, h, w, color, rib, curl=0.012, tilt=0.0):
    """Hoja de lechuga ahuecada (rejilla 3×3 con grosor) que envuelve el cogollo en el ángulo `a`:
    sube pegada y abre el borde de arriba hacia fuera, con el nervio central más claro."""
    bm = bmesh.new()
    d = Vector((math.cos(a), math.sin(a), 0))
    t = Vector((-math.sin(a), math.cos(a), 0))
    rows = []
    for j, v in enumerate((0.0, 0.5, 1.0)):
        row = []
        for u in (-1.0, 0.0, 1.0):
            rr = r0 + curl * v * v + 0.004 * math.sin(math.pi * v) - 0.004 * abs(u) * v
            ang = u * w * (1 - 0.25 * v)
            p = d * (math.cos(ang) * rr) + t * (math.sin(ang) * rr)
            z = z0 + h * v - 0.006 * abs(u) * (1 - v) + (0.004 * math.sin(u * 3.0 + a * 5) if j == 2 else 0)
            row.append(bm.verts.new((p.x, p.y, z + tilt * u)))
        rows.append(row)
    for j in range(2):
        for i in range(2):
            bm.faces.new((rows[j][i], rows[j][i + 1], rows[j + 1][i + 1], rows[j + 1][i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for f in bm.faces:
        if f.normal.dot(Vector((f.calc_center_median().x, f.calc_center_median().y, 0))) < 0:
            f.normal_flip()
    bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=0.0025)
    ob = cf._link('hoja', bm)
    cf.paint(ob, color)
    cf.paint(ob, rib, lambda p: abs(Vector((p.center.x, p.center.y, 0)).normalized().dot(t)) < 0.12)
    return ob


def hortaliza():
    """Hortalizas como en el icono: una lechuga (cogollo claro envuelto en hojas ahuecadas de dos
    verdes, con el borde abierto) sobre el puño y una zanahoria naranja viva cruzada por delante,
    con la punta hacia abajo a la derecha (no hacia la cámara) y las hojas hacia arriba a la
    izquierda."""
    core = cf.sphere(1.0, color='#b5d36a', subdiv=1)
    for v in core.data.vertices:
        x, y, z = v.co
        v.co = Vector((x * 0.036, y * 0.034, z * 0.034 + 0.084))
    core.data.update()
    cf.paint(core, '#cfe38a', lambda p: p.normal.z > 0.6)
    parts = [core]
    greens = [('#90be6d', '#c5dc8f'), ('#6a994e', '#a7c957')]
    for k in range(5):
        a = k / 5 * 2 * math.pi + 0.3
        c, rib = greens[k % 2]
        parts.append(leaf(a, 0.034, 0.046, 0.06, 0.7, c, rib, curl=0.016, tilt=0.004 * (k % 3 - 1)))
    for k in range(4):
        a = k / 4 * 2 * math.pi + 0.95
        c, rib = greens[(k + 1) % 2]
        parts.append(leaf(a, 0.044, 0.04, 0.045, 0.8, c, rib, curl=0.02))
    # Zanahoria: de la izquierda del cogollo, por delante (−Y, hacia la cámara solo un poco) y
    # bajando hacia la derecha, con anillos marcados.
    shoulder = Vector((-0.045, -0.04, 0.083))
    dirc = Vector((0.88, -0.1, -0.46)).normalized()
    L = 0.12
    pts = [shoulder - dirc * 0.004 + dirc * (L * s) for s in (0.0, 0.05, 0.3, 0.6, 0.85, 1.0)]
    carrot = limb(pts, [0.0105, 0.0165, 0.0145, 0.0105, 0.006, 0.0015], seg=6, color='#f3722c')
    cf.paint(carrot, '#f8961e', lambda p: p.normal.z > 0.55)
    for s_ in (0.22, 0.45, 0.68):
        c_ = shoulder + dirc * (L * s_)
        cf.paint(carrot, '#b5451b', lambda p, c_=c_: abs((p.center - c_).dot(dirc)) < 0.007 and p.normal.z < 0.2)
    parts.append(carrot)
    top = cf.cylinder(0.008, 0.012, seg=5, at=tuple(shoulder - dirc * 0.006), rot=(0, -62, 0), color='#4f772d', r2=0.006)
    parts.append(top)
    for k, (dx, dy, dz, L2) in enumerate(((-0.55, 0.1, 1.0, 0.075), (-0.95, 0.25, 0.6, 0.07), (-0.2, 0.35, 1.0, 0.065))):
        d2 = Vector((dx, dy, dz)).normalized()
        base = shoulder - dirc * 0.008
        fpts = [base + d2 * (L2 * s) + Vector((0, 0, -0.012 * s * s)) for s in (0.0, 0.4, 0.75, 1.0)]
        parts.append(limb(fpts, [(0.002, 0.0016), (0.0075, 0.0016), (0.006, 0.0014), (0.0012, 0.001)], seg=4,
                          color='#4f772d' if k % 2 == 0 else '#6a994e', up=(d2.y, -d2.x, 0)))
    return finish(parts, 'vm_hortaliza')


def vendaje():
    """Venda elástica enrollada (color carne, con el hilo rojo del borde), las vueltas marcadas
    en las tapas, la grapa metálica y el extremo suelto colgando."""
    ends = [(0.011, 0.04), (0.017, 0.04), (0.023, 0.0405), (0.029, 0.04), (0.033, 0.04)]
    prof = [(r, -z) for r, z in ends] + [(0.0355, -0.036), (0.0358, -0.03), (0.0358, 0.03), (0.0355, 0.036)] + ends[::-1]
    roll = cf.lathe(prof, seg=12, rot=(0, 90, 0), color='#efdcbc')
    roll.data.transform(Matrix.Translation((0, 0, 0.05)))
    cf.paint(roll, '#d9c39d', lambda p: abs(p.normal.x) > 0.7 and int(Vector((0, p.center.y, p.center.z - 0.05)).length / 0.006) % 2 == 0)
    cf.paint(roll, '#c98b7a', lambda p: abs(p.normal.x) < 0.5 and abs(abs(p.center.x) - 0.033) < 0.004)
    cf.jitter_colors(roll, 0.03, seed=111)
    core = cf.cylinder(0.011, 0.082, seg=8, at=(-0.041, 0, 0.05), rot=(0, 90, 0), color='#b8a27a', cap=False)
    tail = limb([(0.0, -0.035, 0.048), (0.0, -0.045, 0.025), (0.0, -0.05, 0.0), (0.004, -0.046, -0.02)], [(0.034, 0.0015)] * 4, seg=4, color='#e8d3b0', up=(1, 0, 0))
    cf.paint(tail, '#c98b7a', lambda p: abs(abs(p.center.x) - 0.031) < 0.004)
    # Grapa de mariposa sujetando el extremo.
    clip = cf.box((0.022, 0.004, 0.012), at=(0.0, -0.0372, 0.042), color=STEEL_LIGHT, base=False)
    teeth = [cf.box((0.004, 0.006, 0.016), at=(sx * 0.012, -0.0362, 0.042), color=STEEL, base=False) for sx in (-1, 1)]
    return finish([roll, core, tail, clip, *teeth], 'vm_vendaje')


def botiquin():
    """Botiquín rojo de esquinas redondeadas: tapa, cierres, asa y cruces blancas."""
    box = cf.box((0.14, 0.06, 0.1), at=(0, 0, 0.01), color='#e63946')
    cf.bevel(box, 0.008, 2, 30)
    cf.paint(box, '#c62f3a', lambda p: abs(p.center.z - 0.085) < 0.004 or p.normal.z < -0.6)
    cf.jitter_colors(box, 0.03, seed=121)
    parts = [box]
    for sy in (-1, 1):
        parts.append(cf.box((0.048, 0.003, 0.015), at=(0, sy * 0.0305, 0.0625), color='#f8f9fa', base=False))
        parts.append(cf.box((0.015, 0.0036, 0.048), at=(0, sy * 0.0305, 0.0625), color='#f8f9fa', base=False))
    for sx in (-1, 1):
        parts.append(cf.box((0.012, 0.004, 0.016), at=(sx * 0.045, -0.031, 0.078), color=STEEL_LIGHT))
    handle = limb([(-0.03, 0, 0.108), (-0.026, 0, 0.123), (0.026, 0, 0.123), (0.03, 0, 0.108)], [(0.006, 0.008)] * 4, seg=6, color='#2b2d42', up=(0, 0, 1))
    parts.append(handle)
    return finish(parts, 'vm_botiquin')


BLUEPRINT = '#2f6aa8'        # el papel de los planos del icono (todos iguales)
BLUEPRINT_LINE = '#8fb4dc'   # sus líneas (shade 1.35 del icono)
PAPER_BACK = '#e4ebf0'       # revés del papel: la espiral clara de los extremos


def plano_rollo():
    """Plano enrollado como en el icono: papel azul de plano (no se tiñe: así se lee como papel
    con cualquier plano, también los de color oscuro) con líneas claras dibujadas a lo largo, la
    espiral de los extremos y el revés claros. La cinta (vm_plano_cinta) lleva el color de cada
    plano."""
    pts = []
    n = 22
    turns, a0, r0, r1 = 2.4, 0.9, 0.0236, 0.0336
    for i in range(n + 1):
        t = i / n
        a = t * turns * 2 * math.pi + a0
        r = r0 + (r1 - r0) * t
        pts.append((r * math.cos(a), r * math.sin(a)))

    def r_out(phi):
        # Radio de la vuelta de fuera en la dirección `phi` (ángulo en el plano YZ).
        k = math.floor((a0 + turns * 2 * math.pi - phi) / (2 * math.pi))
        t = (phi + 2 * math.pi * k - a0) / (turns * 2 * math.pi)
        return r0 + (r1 - r0) * t
    # Lámina con grosor: ida por fuera y vuelta por dentro.
    th = 0.0028
    outline = [(x, y) for x, y in pts] + [(x * (1 - th / math.hypot(x, y)), y * (1 - th / math.hypot(x, y))) for x, y in reversed(pts)]
    bm = bmesh.new()
    front = [bm.verts.new((-0.1, x, y)) for x, y in outline]
    back = [bm.verts.new((0.1, x, y)) for x, y in outline]
    m = len(outline)
    for k in range(m):
        k2 = (k + 1) % m
        bm.faces.new((front[k], front[k2], back[k2], back[k]))
    # Tapas: quads entre la vuelta de fuera y la de dentro.
    for side in (front, back):
        for k in range(n):
            a, b = side[k], side[k + 1]
            c, d = side[m - 2 - k], side[m - 1 - k]
            bm.faces.new((a, b, c, d))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.transform(Matrix.Translation((0, 0, 0.05)))
    ob = cf._link('plano', bm)
    cf.paint(ob, PAPER_BACK)
    # Cara de fuera de cada vuelta (la normal se aleja del eje): azul de plano.
    cf.paint(ob, BLUEPRINT, lambda p: abs(p.normal.x) < 0.5 and Vector((0, p.normal.y, p.normal.z)).dot(Vector((0, p.center.y, p.center.z - 0.05))) > 0)
    cf.jitter_colors(ob, 0.05, seed=131)
    parts = [ob]
    # Líneas del dibujo a lo largo del rollo, en la cara que se ve (arriba y hacia la cámara).
    for k, a in enumerate((0.9, 1.35, 1.8, 2.3, 2.75)):
        R = r_out(a + math.pi / 2) + 0.0004
        ln = cf.box((0.17 if k % 2 == 0 else 0.11, 0.0024, 0.0007), at=(0.006 if k % 2 else -0.004, 0, 0), color=BLUEPRINT_LINE, base=False)
        ln.data.transform(Matrix.Translation((0, 0, 0.05)) @ Matrix.Rotation(a, 4, 'X') @ Matrix.Translation((0, 0, R)))
        parts.append(ln)
    # Dos líneas cruzadas (la retícula del icono), pegadas a la vuelta de fuera por arriba.
    for x in (-0.078, 0.068):
        arc = [(x, (r_out(phi) + 0.0006) * math.cos(phi), 0.05 + (r_out(phi) + 0.0006) * math.sin(phi)) for phi in [0.2 + 0.45 * j for j in range(7)]]
        parts.append(limb(arc, [0.0009] * len(arc), seg=3, color=BLUEPRINT_LINE))
    return finish(parts, 'vm_plano_rollo')


def plano_cinta():
    """Cinta del plano (blanca: el juego la tiñe, multiplicando, con el color de cada plano) a la
    izquierda del puño, con el lazo y las dos puntas colgando hacia la cámara."""
    x0 = -0.055
    band = cf.lathe([(0.0352, -0.011), (0.0362, -0.0105), (0.0362, 0.0105), (0.0352, 0.011)], seg=10, at=(x0, 0, 0.05), rot=(0, 90, 0), color='#ffffff')
    cf.paint(band, '#d9d9d9', lambda p: abs(p.normal.x) > 0.6)
    knot = cf.box((0.014, 0.008, 0.012), at=(x0, -0.039, 0.05), color='#e6e6e6', base=False)
    cf.bevel(knot, 0.002, 1, 35)
    parts = [band, knot]
    for sx in (-1, 1):
        loop = limb([(x0 + sx * 0.004, -0.04, 0.053), (x0 + sx * 0.016, -0.044, 0.066), (x0 + sx * 0.026, -0.043, 0.058), (x0 + sx * 0.02, -0.042, 0.048), (x0 + sx * 0.005, -0.04, 0.049)],
                    [(0.0055, 0.0012)] * 5, seg=4, color='#f2f2f2', up=(0, 1, 0))
        tail = limb([(x0 + sx * 0.003, -0.041, 0.046), (x0 + sx * 0.01, -0.044, 0.032), (x0 + sx * 0.012, -0.043, 0.02)],
                    [(0.005, 0.0012)] * 3, seg=4, color='#ebebeb', up=(0, 1, 0))
        parts += [loop, tail]
    return finish(parts, 'vm_plano_cinta')


def semillas_saco():
    """Saquito de semillas (se tiñe con el color de cada semilla): panza, cuello fruncido y
    volante de tela por arriba."""
    prof = [(0.0, 0.0), (0.03, 0.002), (0.045, 0.014), (0.05, 0.04), (0.046, 0.066), (0.034, 0.082), (0.02, 0.091), (0.016, 0.095),
            (0.024, 0.102), (0.033, 0.114), (0.03, 0.121), (0.02, 0.116), (0.0, 0.114)]
    ob = cf.lathe(prof, seg=10, color='#ffffff')
    for v in ob.data.vertices:
        a = math.atan2(v.co.y, v.co.x)
        if v.co.z > 0.096:
            v.co.x *= 1 + 0.12 * math.sin(a * 5)
            v.co.y *= 1 + 0.12 * math.sin(a * 5)
        else:
            v.co.y *= 0.85
    ob.data.update()
    cf.jitter_colors(ob, 0.06, seed=141)
    return finish([ob], 'vm_semillas_saco')


def semillas_cordel():
    tie = cf.torus(0.0175, 0.0028, seg=10, tube_seg=4, at=(0, 0, 0.093), color=ROPE)
    scale(tie, 1.0, 0.85, 1.0)
    end = limb([(0.016, -0.006, 0.093), (0.026, -0.012, 0.08), (0.03, -0.016, 0.066)], [0.0022] * 3, seg=4, color=ROPE)
    return finish([tie, end], 'vm_semillas_cordel')


# ================================================================ materiales y piezas

def tabla(L, w, t, at, rot_z, seed):
    """Tablón: cuatro listones a lo largo (las vetas, por color), testas más claras y dos
    cabezas de clavo."""
    r = cf.rng(seed)
    parts = []
    n = 4
    for k in range(n):
        y = -w / 2 + w * (k + 0.5) / n
        strip = cf.box((L - r.random() * 0.004, w / n, t), at=(0, y, 0), color='#c28d58' if k % 2 == 0 else '#a87444')
        cf.paint(strip, '#dcb07c', lambda p: abs(p.normal.x) > 0.7)
        cf.jitter_colors(strip, 0.06, seed=seed * 10 + k)
        parts.append(strip)
    parts += [cf.cylinder(0.0035, 0.0012, seg=6, at=(sx * (L / 2 - 0.018), 0, t), color=STEEL_DARK) for sx in (-1, 1)]
    for part in parts:
        part.data.transform(Matrix.Translation(at) @ Matrix.Rotation(math.radians(rot_z), 4, 'Z'))
    return parts


def madera():
    """Dos tablones cruzados sobre el puño, como el montón procedimental."""
    parts = tabla(0.26, 0.06, 0.025, (0, 0, 0.02), 17, 151) + tabla(0.24, 0.058, 0.024, (0.004, 0.006, 0.045), 22, 152)
    return finish(parts, 'vm_madera')


def sheet(nx, ny, w, d, fn, thickness, seed, jag=0.0):
    """Chapa (o lámina) de nx×ny celdas de w×d centrada en el origen, deformada por `fn(x, y) ->
    (x, y, z)`, con el contorno mellado (`jag`) y grosor."""
    r = cf.rng(seed)
    bm = bmesh.new()
    grid = []
    for j in range(ny + 1):
        row = []
        for i in range(nx + 1):
            x = (i / nx - 0.5) * w
            y = (j / ny - 0.5) * d
            if jag and (i in (0, nx) or j in (0, ny)):
                x += (r.random() - 0.5) * jag * (0.4 if i in (0, nx) else 1.0)
                y += (r.random() - 0.5) * jag * (0.4 if j in (0, ny) else 1.0)
            row.append(bm.verts.new(fn(x, y)))
        grid.append(row)
    for j in range(ny):
        for i in range(nx):
            bm.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if sum(f.normal.z for f in bm.faces) < 0:
        for f in bm.faces:
            f.normal_flip()
    bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=thickness)
    return bm


def chatarra():
    """Chatarra como en el icono: chapa arrugada y doblada con el borde mellado, manchas de óxido,
    un trozo de tubo oxidado encima y una tuerca con su tornillo asomando."""
    def crumple(x, y):
        # Apoyada sobre el puño (el pulgar llega a z ≈ 0,06), doblada hacia arriba por la derecha
        # y caída por la izquierda, con arrugas.
        z = 0.064 + 0.75 * max(0.0, x - 0.02) - 0.45 * max(0.0, -x - 0.035)
        z += 0.006 * math.sin(x * 70 + y * 25) + 0.005 * math.cos(y * 90 - x * 30)
        return (x, y, z)
    bm = sheet(5, 4, 0.15, 0.1, crumple, 0.003, seed=161, jag=0.02)
    plate = cf._link('chapa', bm)
    cf.paint(plate, 'metal')
    cf.paint(plate, '#a3abb2', lambda p: p.normal.z > 0.9)
    cf.paint(plate, '#6c757d', lambda p: p.normal.z < -0.5)
    r = cf.rng(163)
    rust_spots = [Vector((r.random() * 0.1 - 0.05, r.random() * 0.07 - 0.035, 0)) for _ in range(4)]
    cf.paint(plate, 'rust', lambda p: any((Vector((p.center.x, p.center.y, 0)) - c).length < 0.016 for c in rust_spots[:3]) and p.normal.z > 0)
    cf.paint(plate, '#8c4a16', lambda p: (Vector((p.center.x, p.center.y, 0)) - rust_spots[3]).length < 0.012 and p.normal.z > 0)
    cf.jitter_colors(plate, 0.1, seed=162)
    # Tubo oxidado en diagonal sobre la chapa (boca oscura hacia la cámara).
    a, b = Vector((-0.045, -0.032, 0.08)), Vector((0.03, 0.035, 0.088))
    pipe = limb([a, b], [0.0115, 0.0115], seg=6, color='rust', caps=(False, False))
    cf.paint(pipe, '#d2803a', lambda p: p.normal.z > 0.5)
    cf.jitter_colors(pipe, 0.12, seed=164)
    mouth = limb([a + (b - a).normalized() * 0.002, a + (b - a).normalized() * 0.012], [0.0085, 0.0085], seg=6, color='#3a2516', caps=(True, False))
    lip = cf.torus(0.0102, 0.0016, seg=6, tube_seg=3, color='#8c4a16')
    lip.matrix_basis = Matrix.Translation(a) @ (b - a).normalized().to_track_quat('Z', 'Y').to_matrix().to_4x4()
    # Tuerca y tornillo asomando por un agujero de la chapa.
    nut = cf.cylinder(0.0095, 0.007, seg=6, at=(0.012, -0.03, 0.068), rot=(8, -10, 0), color='#a3abb8')
    cf.paint(nut, '#c9d1d6', lambda p: p.normal.z > 0.8)
    bolt = cf.cylinder(0.0045, 0.03, seg=6, at=(0.012, -0.03, 0.068), rot=(8, -10, 0), color=STEEL_DARK)
    return finish([plate, pipe, mouth, lip, nut, bolt], 'vm_chatarra')


def placa_metal():
    """Chapa cortada con el canto biselado, agujeros de remache y rayas de lijado."""
    ob = cf.box((0.16, 0.12, 0.008), at=(0, 0.012, 0.05), rot=(-17, 0, 0), color='#9fb3c1')
    cf.bevel(ob, 0.002, 1, 35)
    cf.paint(ob, '#b9cad6', lambda p: p.normal.z > 0.7 and int((p.center.x + 0.2) / 0.02) % 2 == 0)
    cf.jitter_colors(ob, 0.04, seed=171)
    holes = []
    for sx in (-1, 1):
        for sy in (-1, 1):
            h = cf.cylinder(0.005, 0.0095, seg=6, at=(sx * 0.064, sy * 0.044, 0.0), color='#3a4148')
            h.data.transform(Matrix.Translation((0, 0.012, 0.0495)) @ Matrix.Rotation(math.radians(-17), 4, 'X'))
            holes.append(h)
    return finish([ob, *holes], 'vm_placa_metal')


def tornillos():
    """Lata de tornillería: caja de madera abierta con tornillos, tuercas y arandelas."""
    box = cf.box((0.09, 0.07, 0.045), at=(0, 0, 0.008), color='#7a5230')
    cf.bevel(box, 0.003, 1, 35)
    inner = cf.box((0.08, 0.06, 0.004), at=(0, 0, 0.049), color='#4a3220')
    parts = [box, inner]
    r = cf.rng(181)
    for i in range(9):
        x = -0.03 + (i % 3) * 0.03 + (r.random() - 0.5) * 0.008
        y = -0.02 + (i // 3) * 0.02 + (r.random() - 0.5) * 0.006
        kind = i % 3
        if kind == 0:
            parts.append(cf.cylinder(0.0075, 0.005, seg=6, at=(x, y, 0.053), color='#c9c3b6'))
            parts.append(cf.cylinder(0.0035, 0.018, seg=5, at=(x, y, 0.035), color='#a8a294'))
        elif kind == 1:
            nut = cf.cylinder(0.008, 0.006, seg=6, at=(x, y, 0.053), color=STEEL, rot=(r.random() * 40, 0, 0))
            parts.append(nut)
        else:
            parts.append(cf.torus(0.0065, 0.002, seg=8, tube_seg=3, at=(x, y, 0.055), color='#d8d2c4'))
    return finish(parts, 'vm_tornillos')


def fibra():
    """Manojo de fibra vegetal atado por el centro, abierto en abanico por arriba."""
    parts = []
    for i in range(9):
        a = (i / 9) * 2 * math.pi
        bx, by = math.cos(a) * 0.008, math.sin(a) * 0.008
        tx, ty = bx * 3.5 + (i % 3 - 1) * 0.01, by * 3.5
        c = '#a9b665' if i % 2 else '#c2c97f'
        parts.append(limb([(bx * 0.6, by * 0.6, -0.025), (bx, by, 0.03), (tx, ty, 0.16)], [0.004, 0.005, 0.0025], seg=4, color=c))
    tie = cf.torus(0.016, 0.004, seg=8, tube_seg=4, at=(0, 0, 0.04), color=ROPE)
    return finish([*parts, tie], 'vm_fibra')


def cuerda():
    """Rollo de cuerda pequeño (tres vueltas apretadas) con el chicote suelto."""
    parts = []
    for i in range(3):
        n = 16
        pts = []
        for j in range(n + 1):
            t = j / n * 2 * math.pi
            r = 0.058 - i * 0.004
            pts.append((r * math.cos(t), r * math.sin(t) * 0.92, 0.036 + i * 0.015 + 0.004 * math.sin(t * 2)))
        base, stripe = (ROPE_DEEP, '#8d5f36') if i == 1 else (ROPE, ROPE_DARK)
        ring = limb(pts, [0.0135] * len(pts), seg=5, color=base, caps=(False, False))
        cf.paint(ring, stripe, lambda p: math.sin(math.atan2(p.center.y, p.center.x) * 14 + p.center.z * 200) > 0.4)
        parts.append(ring)
    for part in parts:
        part.data.transform(Matrix.Translation((0, 0, 0.045)) @ Matrix.Rotation(math.radians(-20), 4, 'X') @ Matrix.Translation((0, 0, -0.045)))
    end = limb([(0.05, -0.03, 0.06), (0.07, -0.05, 0.04), (0.075, -0.07, 0.015)], [0.012, 0.012, 0.011], seg=6, color=ROPE)
    return finish([*parts, end], 'vm_cuerda')


def tela():
    """Lona doblada como en el icono: tres capas unidas por los dobleces redondeados (el de delante,
    hacia la cámara), la esquina de arriba vuelta, una costura y un faldón que cae por la izquierda
    del puño con dos ondas: así se lee como tela y no como una caja."""
    W = 0.14
    T = 0.0075
    zs = [0.022, 0.039, 0.056]
    # Perfil (y, z) de la línea media: capa 1 hacia atrás, doblez detrás, capa 2 hacia delante,
    # doblez delante, capa 3 hacia atrás.
    path = []
    y0, y1 = -0.048, 0.048
    def fold(yc, za, zb, side):
        rc = (zb - za) / 2
        for k in range(1, 5):
            a = math.pi * k / 5
            path.append((yc + side * rc * math.sin(a), (za + zb) / 2 - rc * math.cos(a)))
    path += [(y0, zs[0]), (0.0, zs[0] - 0.001), (y1, zs[0])]
    fold(y1, zs[0], zs[1], 1)
    path += [(y1, zs[1]), (0.0, zs[1] + 0.001), (y0, zs[1])]
    fold(y0, zs[1], zs[2], -1)
    path += [(y0, zs[2]), (0.0, zs[2] + 0.002), (y1 - 0.004, zs[2])]
    # Polígono con grosor: offset a cada lado de la línea media.
    def offs(sign):
        out = []
        for i, (y, z) in enumerate(path):
            pa = path[max(0, i - 1)]
            pb = path[min(len(path) - 1, i + 1)]
            ty, tz = pb[0] - pa[0], pb[1] - pa[1]
            L = math.hypot(ty, tz) or 1
            ny, nz = -tz / L, ty / L
            out.append((y + sign * ny * T / 2, z + sign * nz * T / 2))
        return out
    poly = offs(1) + list(reversed(offs(-1)))
    bm = bmesh.new()
    xs = [-W / 2, -W / 2 + 0.035, W / 2 - 0.03, W / 2]
    slices = [[bm.verts.new((x, y, z)) for y, z in poly] for x in xs]
    m = len(poly)
    for a_, b_ in zip(slices, slices[1:]):
        for k in range(m):
            bm.faces.new((a_[k], a_[(k + 1) % m], b_[(k + 1) % m], b_[k]))
    bm.faces.new(list(reversed(slices[0])))
    bm.faces.new(slices[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    # Algo de arruga en los cantos y en los dobleces.
    for v in bm.verts:
        v.co.z += 0.0018 * math.sin(v.co.x * 90 + v.co.y * 40)
    stack = cf._link('lona', bm)
    cf.paint(stack, '#e8dcc0')
    cf.paint(stack, '#d5c7a6', lambda p: p.center.z < zs[1] - 0.004)
    cf.paint(stack, '#f3ead6', lambda p: p.normal.z > 0.7 and p.center.z > zs[2])
    cf.jitter_colors(stack, 0.035, seed=191)
    # Esquina de arriba vuelta (delante a la derecha) con el revés más oscuro.
    corner = cf.prism([(0.0, 0.0), (0.04, 0.0), (0.0, 0.032)], 0.0025, color='#cbbd9a')
    corner.data.transform(Matrix.Translation((W / 2 - 0.042, y0 + 0.001, zs[2] + T / 2)))
    # Costura (puntadas) a lo largo de la capa de arriba.
    stitches = [cf.box((0.009, 0.0016, 0.0012), at=(-0.055 + k * 0.016, y0 + 0.012, zs[2] + T / 2), color='#b38b5d') for k in range(7)]
    # Faldón que cae por la izquierda desde la capa de abajo, con dos ondas.
    def drape(x, y):
        v = (x + 0.035) / 0.07  # 0 arriba (pegado a la pila), 1 abajo
        return (-W / 2 - 0.012 * math.sin(v * math.pi * 0.9) - 0.004 * math.sin(y * 70), y, zs[0] + 0.004 - v * 0.065)
    flap = cf._link('faldon', sheet(3, 3, 0.07, 0.09, drape, 0.004, seed=193))
    cf.paint(flap, '#ddd0b0')
    cf.paint(flap, '#c7b896', lambda p: math.sin(p.center.y * 70) < -0.3)
    cf.jitter_colors(flap, 0.04, seed=194)
    return finish([stack, corner, flap, *stitches], 'vm_tela')


def plastico():
    """Plástico de rescate como en el icono: una bolsa de plástico azul arrugada, llena a medias,
    con las dos asas arriba, pliegues más oscuros y un brillo. No es una botella: no se confunde
    con el agua potable."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=2, use_grid_fill=True)
    r = cf.rng(201)
    for v in bm.verts:
        x, y, z = v.co  # −0,5..0,5
        u = z + 0.5  # 0 abajo, 1 arriba
        # Saco redondeado: panza abajo, más estrecho y aplastado arriba (la boca fruncida).
        sx = 0.05 * (1.0 - 0.28 * u * u)
        sy = 0.032 * (1.0 - 0.45 * u)
        k = max(abs(x), abs(y)) * 2 or 1
        nx, ny = x / k * (0.75 + 0.25 * (1 - abs(z) * 2)), y / k * (0.75 + 0.25 * (1 - abs(z) * 2))
        v.co = Vector((nx * sx * 2 + (r.random() - 0.5) * 0.008, ny * sy * 2 + (r.random() - 0.5) * 0.008, 0.012 + u * 0.1 + (r.random() - 0.5) * 0.008))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bag = cf._link('bolsa', bm)
    cf.paint(bag, '#5fb3c9')
    cf.paint(bag, '#8fd0e0', lambda p: p.normal.z > 0.45 or (p.normal.x < -0.5 and p.normal.y < -0.2))
    cf.paint(bag, '#3f8ea4', lambda p: math.sin(p.center.x * 120 + p.center.z * 60) > 0.75 and p.normal.y < 0)
    cf.jitter_colors(bag, 0.1, seed=202)
    # Brillo vertical (la raya blanca del icono): una franja de caras que miran a la cámara.
    cf.paint(bag, '#d7f0f6', lambda p: p.normal.y < -0.6 and -0.03 < p.center.x < -0.012 and p.center.z > 0.05)
    # Asas: dos lazos aplastados que salen de la boca.
    handles = []
    for sx in (-1, 1):
        pts = [(sx * 0.03, 0.0, 0.108), (sx * 0.036, -0.002, 0.13), (sx * 0.026, -0.003, 0.145), (sx * 0.012, -0.002, 0.14), (sx * 0.008, 0.0, 0.112)]
        h = limb(pts, [(0.0055, 0.0018)] * 5, seg=4, color='#5fb3c9', up=(0, 1, 0))
        cf.paint(h, '#8fd0e0', lambda p: p.normal.z > 0.3)
        handles.append(h)
    return finish([bag, *handles], 'vm_plastico')


def componentes():
    """Placa de circuito verde con chips, condensadores, una bobina de cobre y dos cables."""
    board = cf.box((0.12, 0.08, 0.006), at=(0, 0, 0.036), color='#2d6a4f')
    cf.bevel(board, 0.0015, 1, 35)
    parts = [board]
    # Pistas (franjas doradas) sobre la placa.
    for k in range(4):
        parts.append(cf.box((0.07, 0.0022, 0.0008), at=(0.01, -0.03 + k * 0.012, 0.042), color='#e0a458'))
    parts.append(cf.box((0.032, 0.022, 0.007), at=(-0.02, 0.012, 0.042), color='#1a1a1a'))
    parts.append(cf.box((0.02, 0.016, 0.006), at=(0.03, 0.022, 0.042), color='#22262a'))
    for i, c in enumerate(('#4361ee', '#e63946', '#4361ee')):
        parts.append(cf.cylinder(0.006, 0.016, seg=8, at=(0.03 + i * 0.014 - 0.01, -0.022, 0.042), color=c))
    coil = cf.cylinder(0.009, 0.014, seg=8, at=(-0.042, -0.02, 0.048), rot=(0, 90, 0), color='#c8783a')
    cf.paint(coil, '#e09a5a', lambda p: int((p.center.x + 0.1) / 0.003) % 2 == 0)
    parts.append(coil)
    parts.append(limb([(0.06, 0.03, 0.042), (0.075, 0.03, 0.055), (0.085, 0.02, 0.075)], [0.0022] * 3, seg=4, color='#e63946'))
    parts.append(limb([(0.06, 0.036, 0.042), (0.072, 0.04, 0.05), (0.09, 0.04, 0.06)], [0.0022] * 3, seg=4, color='#2b2d42'))
    return finish(parts, 'vm_componentes')


def combustible():
    """Bidón de combustible metálico rojo: aspa estampada, asa triple arriba y boquilla."""
    body = cf.box((0.12, 0.06, 0.14), at=(0, 0, -0.01), color='hullStripe')
    cf.bevel(body, 0.01, 2, 30)
    # Aspa en relieve (franjas más oscuras en diagonal) en las dos caras grandes.
    cf.paint(body, '#a3412d', lambda p: abs(p.normal.y) > 0.7 and (abs((p.center.x) - (p.center.z - 0.06) * 0.85) < 0.012 or abs((p.center.x) + (p.center.z - 0.06) * 0.85) < 0.012))
    cf.jitter_colors(body, 0.04, seed=211)
    parts = [body]
    for sy in (-1, 1):
        # Marco estampado de cada cara.
        parts.append(cf.box((0.1, 0.003, 0.006), at=(0, sy * 0.0305, 0.11), color='#a3412d', base=False))
        parts.append(cf.box((0.1, 0.003, 0.006), at=(0, sy * 0.0305, 0.01), color='#a3412d', base=False))
    for x in (-0.03, 0.0, 0.03):
        parts.append(limb([(x, 0, 0.128), (x, 0, 0.15)], [(0.004, 0.006)] * 2, seg=4, color='#2b2d42', up=(1, 0, 0)))
    parts.append(cf.box((0.075, 0.014, 0.008), at=(0, 0, 0.148), color='#2b2d42'))
    spout = cf.cylinder(0.011, 0.028, seg=8, at=(0.04, 0, 0.122), rot=(0, 30, 0), color='#2b2d42')
    cap = cf.cylinder(0.0135, 0.008, seg=8, at=(0.054, 0, 0.143), rot=(0, 30, 0), color='#5c6770')
    return finish([*parts, spout, cap], 'vm_combustible')


def pieza_mecanica():
    """Engranaje de repuesto: dientes trapezoidales, cubo con chavetero y agujeros de aligerado;
    inclinado hacia la cámara como el procedimental."""
    teeth = 10
    pts = []
    for k in range(teeth):
        a0 = 2 * math.pi * k / teeth
        for da, r in ((-0.13, 0.05), (-0.08, 0.064), (0.08, 0.064), (0.13, 0.05)):
            a = a0 + da * 2 * math.pi / teeth * 1.6
            pts.append((r * math.cos(a), r * math.sin(a)))
    gear = cf.prism(pts, 0.02, at=(0, 0, -0.01), color='#7d8597')
    cf.paint(gear, '#a3abb8', lambda p: abs(p.normal.z) > 0.7 and Vector((p.center.x, p.center.y, 0)).length > 0.045)
    hub = cf.cylinder(0.018, 0.028, seg=10, at=(0, 0, -0.014), color='#5c6770')
    bore = cf.cylinder(0.0085, 0.0284, seg=8, at=(0, 0, -0.0142), color='#2b2d42')
    holes = [cf.cylinder(0.007, 0.0204, seg=6, at=(0.032 * math.cos(a), 0.032 * math.sin(a), -0.0102), color='#3a4148') for a in (0.5, 0.5 + 2.094, 0.5 + 4.189)]
    parts = [gear, hub, bore, *holes]
    for part in parts:
        part.data.transform(Matrix.Translation((0, 0, 0.06)) @ Matrix.Rotation(math.radians(-90 + 17), 4, 'X'))
    return finish(parts, 'vm_pieza_mecanica')


def kit_reparacion():
    """Caja de herramientas de madera con asa metálica, tablillas, clavos y bote de masilla."""
    box = cf.box((0.14, 0.08, 0.07), at=(0, 0, 0.012), color='#d4a373')
    cf.bevel(box, 0.004, 1, 35)
    cf.paint(box, '#b07d48', lambda p: p.normal.z < 0.5 and int((p.center.z + 0.1) / 0.0175) % 2 == 0)
    cf.jitter_colors(box, 0.06, seed=221)
    inside = cf.box((0.13, 0.07, 0.003), at=(0, 0, 0.074), color='#6e4a2e')
    posts = [cf.box((0.006, 0.012, 0.04), at=(sx * 0.064, 0, 0.08), color='#b07d48') for sx in (-1, 1)]
    bar = cf.cylinder(0.0045, 0.13, seg=6, at=(-0.065, 0, 0.115), rot=(0, 90, 0), color=STEEL_DARK)
    slats = [cf.box((0.11, 0.016, 0.006), at=(0.0, -0.02 + i * 0.018, 0.077), rot=(0, 0, 4 * i), color='#c89f6c') for i in range(2)]
    putty = cf.cylinder(0.014, 0.026, seg=8, at=(0.04, 0.022, 0.076), color='#e9c46a')
    lid = cf.cylinder(0.0145, 0.004, seg=8, at=(0.04, 0.022, 0.102), color='#5c6770')
    return finish([box, inside, *posts, bar, *slats, putty, lid], 'vm_kit_reparacion')


def celula_solar():
    """Célula solar con marco de aluminio, celdas azules y las pistas plateadas."""
    frame = cf.box((0.16, 0.12, 0.01), at=(0, 0, 0.03), color='#c9d1d6')
    cf.bevel(frame, 0.002, 1, 35)
    panel = cf.box((0.148, 0.108, 0.0012), at=(0, 0, 0.0398), color='#3d5a80')
    parts = [frame, panel]
    for i in range(1, 4):
        parts.append(cf.box((0.002, 0.108, 0.0012), at=(-0.074 + i * 0.037, 0, 0.0405), color='#98c1d9'))
    parts.append(cf.box((0.148, 0.002, 0.0012), at=(0, 0, 0.0405), color='#98c1d9'))
    for part in parts:
        part.data.transform(Matrix.Translation((0, 0.012, 0.052)) @ Matrix.Rotation(math.radians(-20), 4, 'X') @ Matrix.Translation((0, 0, -0.03)))
    return finish(parts, 'vm_celula_solar')


def abrigo():
    """Abrigo de lona doblado: cuerpo, cuello vuelto, botones de madera y un bolsillo."""
    body = cf.box((0.16, 0.12, 0.05), at=(0, 0, 0.02), color='#3a5a40')
    cf.bevel(body, 0.012, 2, 30)
    cf.jitter_colors(body, 0.05, seed=231)
    collar = limb([(-0.07, 0.03, 0.072), (0.0, 0.045, 0.078), (0.07, 0.03, 0.072)], [(0.012, 0.02)] * 3, seg=6, color='#4f7a56', up=(0, 0, 1))
    pocket = cf.box((0.05, 0.002, 0.03), at=(0.035, -0.061, 0.03), color='#2f4a35')
    buttons = [cf.cylinder(0.0055, 0.003, seg=6, at=(-0.01, -0.0605, z), rot=(90, 0, 0), color='rope') for z in (0.035, 0.055)]
    # Una manga doblada por encima, en diagonal, con el puño vuelto más claro asomando por delante:
    # así se lee como abrigo y no como carpeta.
    sleeve = limb([(0.066, 0.034, 0.078), (0.025, 0.0, 0.084), (-0.022, -0.04, 0.083), (-0.034, -0.064, 0.072), (-0.036, -0.071, 0.052)],
                  [(0.017, 0.008), (0.018, 0.0085), (0.018, 0.0085), (0.017, 0.008), (0.016, 0.0075)], seg=6, color='#46704d', up=(0, 0, 1))
    cf.paint(sleeve, '#3a5a40', lambda p: p.normal.z < -0.2)
    cf.jitter_colors(sleeve, 0.05, seed=232)
    cuff = limb([(-0.036, -0.071, 0.054), (-0.037, -0.073, 0.04), (-0.037, -0.073, 0.034)], [(0.0185, 0.009), (0.0185, 0.009), (0.014, 0.007)],
                seg=6, color='#2f4a35', up=(1, 0, 0))
    return finish([body, collar, pocket, *buttons, sleeve, cuff], 'vm_abrigo')


def build():
    martillo()
    llave()
    garfio()
    gancho_rollo()
    cana()
    cubo()
    cubo_agua()
    pez('vm_pez_crudo', back='#457b9d', flank='#8ecae6', belly='#e8f4f2', fin='#6fa8c7', eye=('#f8f9fa', '#1a1a1a'), bars='#335f7a')
    pez('vm_pez_asado', back='#a35a2a', flank='#d08e52', belly='#ecb070', fin='#7a4420', eye=('#efe6d2', None), grill='#6b3a1a')
    pez('vm_pez_ahumado', back='#6e3f1c', flank='#c97c3d', belly='#e0a458', fin='#8b5a2b', eye=('#dccaa4', None), twine=True)
    conserva()
    botella()
    cuenco('vm_sopa', '#f4a261', [('#e76f51', 0.012, 4), ('#90be6d', 0.01, 4), ('#e9c46a', 0.011, 3)])
    cuenco('vm_guiso', '#bc6c25', [('#e8dcc0', 0.016, 4), ('#90be6d', 0.009, 3), ('#f4a261', 0.011, 3)])
    fruta()
    hortaliza()
    vendaje()
    botiquin()
    plano_rollo()
    plano_cinta()
    semillas_saco()
    semillas_cordel()
    madera()
    chatarra()
    placa_metal()
    tornillos()
    fibra()
    cuerda()
    tela()
    plastico()
    componentes()
    combustible()
    pieza_mecanica()
    kit_reparacion()
    celula_solar()
    abrigo()
