"""
Objetos en mano del jugador (primera persona) y piezas que vuelan por el mundo (garfio lanzado,
corcho de la caña, pez capturado).

MARCO: el de `buildItemModel` en src/game/tools/models.ts pasado a Blender. El puño agarra el eje
Z en el origen; +Y es «hacia delante», lejos de la cámara (juego −z); +X, a la derecha. Las piezas
que el juego monta con su propia transformación (garfio, corcho, pez) usan el marco de su función
(`buildGrapnel`, `buildBobber`, `buildFish`). Mismas medidas que el procedimental: alturas, anclajes
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
    eye = cf.box((0.042, 0.054, 0.062), at=(0, 0.004, 0.238), color=STEEL_DARK)
    cf.bevel(eye, 0.006, 1, 30)
    neck = cf.cylinder(0.0175, 0.07, seg=8, at=(0, 0.028, 0.27), rot=(-90, 0, 0), color=STEEL_DARK, r2=0.0195)
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
    """Rollo de cabo del gancho: tres vueltas que pasan por dentro del puño (el puño agarra el
    haz) y cuelgan por delante; el cabo está trenzado (franjas en diagonal)."""
    R = 0.078
    parts = []
    for i, x in enumerate((-0.012, 0.004, 0.02)):
        n = 22
        pts = []
        for j in range(n + 1):
            t = j / n * 2 * math.pi
            # Círculo en el plano YZ que pasa por el origen (tangente vertical en el puño).
            y = R - R * math.cos(t) * (1 - 0.04 * i)
            z = R * math.sin(t) * (1 - 0.05 * i)
            pts.append((x + 0.006 * math.sin(t * 2 + i), y, z))
        ring = limb(pts, [0.0125] * len(pts), seg=6, color=ROPE, caps=(False, False))
        cf.paint(ring, ROPE_DARK, lambda p: math.sin((math.atan2(p.center.z, p.center.y - R) * 9 + p.center.x * 300)) > 0.35)
        cf.jitter_colors(ring, 0.05, seed=40 + i)
        parts.append(ring)
    # Ligada: unas vueltas de cabo que sujetan el haz por abajo, delante del puño.
    tie = cf.torus(0.022, 0.006, seg=8, tube_seg=4, at=(0.004, 2 * R, 0), rot=(0, 90, 0), color=ROPE_DARK)
    scale(tie, 1.0, 0.8, 1.0)
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
    cap = limb([hp(-0.004), hp(0.0), hp(0.016), hp(0.02)], [0.016, 0.0225, 0.0235, 0.021], seg=8, color='#2b2d42')
    cork = limb([hp(0.018), hp(0.03), hp(0.08), hp(0.13), hp(0.16), hp(L1 - 0.006)],
                [0.0205, 0.0225, 0.0222, 0.021, 0.0195, 0.0178], seg=8, color='#c9a36a')
    cf.jitter_colors(cork, 0.09, seed=51)
    ferrule = limb([top - u1 * 0.012, top, top + u2 * 0.012], [0.0175, 0.0172, 0.0145], seg=8, color=STEEL)
    blank1 = limb([top, (top + mid) / 2, mid], [0.0118, 0.0102, 0.0086], seg=6, color='#bc8a5f', caps=(False, False))
    blank2 = limb([mid, (mid + tip) / 2, tip, tip + u2 * 0.006], [0.0086, 0.0065, 0.0042, 0.0025], seg=5, color='#8a5a3a', caps=(False, True))
    joint = limb([mid - u2 * 0.014, mid, mid + u2 * 0.014], [0.0102, 0.0108, 0.0098], seg=6, color='#6e4a2e')
    # Anillas por debajo de la caña (lado del carrete) con su ligadura roja.
    n = Vector((0, -u2.z, u2.y))
    if n.dot(Vector((0, -1, 0))) < 0:
        n = -n
    rings = []
    for t in (0.35, 0.62, 0.86):
        c = top + (tip - top) * t
        r_blank = 0.0118 + (0.0042 - 0.0118) * t
        wrap = limb([c - u2 * 0.012, c + u2 * 0.012], [r_blank + 0.0016] * 2, seg=6, color='#bc4749')
        foot = limb([c + n * r_blank * 0.8, c + n * (r_blank + 0.007)], [0.0016, 0.0013], seg=4, color=STEEL_DARK)
        ring = cf.torus(0.006 - 0.002 * t, 0.0014, seg=8, tube_seg=3, color=STEEL_LIGHT)
        ring.matrix_basis = Matrix.Translation(c + n * (r_blank + 0.007 + 0.006 - 0.002 * t)) @ u2.to_track_quat('Z', 'Y').to_matrix().to_4x4()
        rings += [wrap, foot, ring]
    tiptop = cf.torus(0.0035, 0.0012, seg=8, tube_seg=3, color=STEEL_LIGHT)
    tiptop.matrix_basis = Matrix.Translation(tip + u2 * 0.006) @ u2.to_track_quat('Z', 'Y').to_matrix().to_4x4()
    # Carrete lateral: pie, cuerpo con el sedal enrollado, tapas y manivela con pomo.
    stem = limb([(0, -0.018, -0.008), (0, -0.032, -0.04), (0, -0.045, -0.062)], [(0.006, 0.004), (0.0055, 0.0045), (0.005, 0.0045)], seg=6, color=STEEL_DARK)
    seat = limb([hp(0.095), hp(0.104), hp(0.125), hp(0.134)], [0.021, 0.0232, 0.0232, 0.021], seg=8, color=STEEL)
    c0 = Vector((0, -0.05, -0.075))
    drum = cf.lathe([(0.0, -0.028), (0.034, -0.028), (0.036, -0.024), (0.036, -0.02), (0.022, -0.02), (0.024, 0.0), (0.022, 0.02),
                     (0.036, 0.02), (0.036, 0.024), (0.034, 0.028), (0.0, 0.028)], seg=12, rot=(0, 90, 0), color=STEEL)
    drum.data.transform(Matrix.Translation(c0))
    cf.paint(drum, '#e8f4f2', lambda p: abs(p.center.x - c0.x) < 0.019 and (p.center - c0).length > 0.015)
    cf.paint(drum, STEEL_DARK, lambda p: abs(p.normal.x) > 0.8 and 0.012 < Vector((0, p.center.y - c0.y, p.center.z - c0.z)).length < 0.026
             and int((math.atan2(p.center.z - c0.z, p.center.y - c0.y) + math.pi) / (2 * math.pi) * 6 + 0.5) % 2 == 0)
    hub = cf.cylinder(0.009, 0.064, seg=6, at=(c0.x - 0.032, c0.y, c0.z), rot=(0, 90, 0), color=STEEL_DARK)
    crank = limb([(0.031, c0.y, c0.z), (0.036, c0.y - 0.004, c0.z - 0.012), (0.04, c0.y - 0.006, c0.z - 0.024)], [(0.004, 0.0025)] * 3, seg=4, color=STEEL_DARK)
    knob = cf.cylinder(0.0065, 0.02, seg=6, at=(0.04, c0.y - 0.006, c0.z - 0.024), rot=(0, 90, 0), color='#2b2d42')
    return finish([cap, cork, ferrule, blank1, blank2, joint, *rings, tiptop, stem, seat, drum, hub, crank, knob], 'vm_cana')


def corcho():
    """Corcho de pesca en el marco de `buildBobber` (origen en la línea de flotación): mitad de
    arriba roja, de abajo blanca, con varilla blanca de punta roja."""
    prof = [(0.0, -0.05), (0.008, -0.047), (0.022, -0.03), (0.036, -0.008), (0.0445, 0.012), (0.042, 0.032), (0.03, 0.05),
            (0.012, 0.058), (0.0055, 0.059), (0.0052, 0.09), (0.0048, 0.105), (0.0042, 0.118), (0.0, 0.12)]
    ob = cf.lathe(prof, seg=10, color='#f8f9fa')
    cf.paint(ob, '#e63946', lambda p: 0.012 < p.center.z < 0.06)
    cf.paint(ob, '#e63946', lambda p: p.center.z > 0.104)
    cf.paint(ob, '#c62f3a', lambda p: 0.04 < p.center.z < 0.06)
    return finish([ob], 'vm_corcho')


def cubo():
    """Cubo de chapa galvanizada: cuerpo troncocónico con borde enrollado, dos nervios, orejas
    remachadas y asa de alambre con empuñadura de madera (el puño la agarra en el origen)."""
    prof = [(0.0, -0.378), (0.1, -0.378), (0.108, -0.372), (0.11, -0.36), (0.113, -0.335), (0.1155, -0.33), (0.1145, -0.325),
            (0.131, -0.205), (0.1335, -0.2), (0.1325, -0.195), (0.14, -0.152), (0.147, -0.147), (0.1485, -0.14), (0.1445, -0.134),
            (0.137, -0.138), (0.134, -0.146), (0.106, -0.352), (0.099, -0.36), (0.0, -0.36)]
    body = cf.lathe(prof, seg=14, color='#adb5bd')
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
    can = cf.lathe(prof, seg=14, color='#adb5bd')
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
    """Botella de agua de plástico azul: anillos en el cuerpo, hombros, etiqueta crema con una
    gota y tapón blanco estriado."""
    prof = [(0.0, -0.04), (0.026, -0.04), (0.032, -0.037), (0.034, -0.03), (0.034, -0.004), (0.0315, 0.0), (0.034, 0.004),
            (0.034, 0.042), (0.0315, 0.046), (0.034, 0.05), (0.034, 0.084), (0.029, 0.1), (0.02, 0.113), (0.0148, 0.12),
            (0.0148, 0.124), (0.0185, 0.1255), (0.0185, 0.128), (0.0, 0.128)]
    body = cf.lathe(prof, seg=12, color='#4cc9f0')
    cf.paint(body, '#7fd8f5', lambda p: p.center.z > 0.086 and p.normal.z > 0.3)
    cf.paint(body, '#38a9cf', lambda p: p.center.z < -0.03 or abs(p.center.z) < 0.004 or abs(p.center.z - 0.046) < 0.004)
    cf.paint(body, '#f3ead6', lambda p: 0.006 < p.center.z < 0.04 and abs(p.normal.z) < 0.5)
    cf.paint(body, '#4cc9f0', lambda p: 0.014 < p.center.z < 0.032 and p.center.y < -0.026 and abs(p.center.x) < 0.01)
    cap = cf.lathe([(0.0, 0.128), (0.0165, 0.128), (0.0168, 0.147), (0.014, 0.1495), (0.0, 0.1495)], seg=10, color='#f8f9fa')
    cf.paint(cap, '#dfe3e6', lambda p: abs(p.normal.z) < 0.5 and int((math.atan2(p.center.y, p.center.x) + math.pi) / (2 * math.pi) * 10) % 2 == 0)
    return finish([body, cap], 'vm_botella')


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


def hortaliza():
    """Manojo de zanahorias con sus hojas: las raíces bajan por el puño y las hojas salen por
    arriba (el procedimental era una bola verde con una raíz naranja)."""
    parts = []
    for i, (dx, dy, tilt) in enumerate(((0.0, 0.0, 0.0), (0.016, 0.01, 0.2), (-0.014, 0.012, -0.18))):
        top = Vector((dx, dy, 0.035 - 0.006 * i))
        down = Vector((math.sin(tilt) * 0.3, 0.05, -1)).normalized()
        pts = [top + down * s for s in (-0.006, 0.0, 0.025, 0.06, 0.09, 0.105)]
        root = limb(pts, [0.009, 0.0145, 0.0135, 0.0105, 0.0055, 0.0015], seg=6, color='#f4a261')
        cf.paint(root, '#e07a3f', lambda p, pts=pts: int(((p.center - pts[1]).length) / 0.012) % 2 == 1)
        parts.append(root)
    rng = cf.rng(101)
    for k in range(9):
        a = (k / 9) * 2 * math.pi + rng.random() * 0.4
        lean = 0.35 + rng.random() * 0.35
        base = Vector((math.cos(a) * 0.008, math.sin(a) * 0.008 + 0.008, 0.038))
        d = Vector((math.cos(a) * lean, math.sin(a) * lean, 1)).normalized()
        L = 0.07 + rng.random() * 0.035
        pts = [base + d * (L * s) + Vector((0, 0, -0.012 * s * s)) for s in (0.0, 0.35, 0.7, 1.0)]
        frond = limb(pts, [(0.0025, 0.0018), (0.011, 0.0018), (0.009, 0.0016), (0.0015, 0.0012)], seg=4, color='#6a994e' if k % 2 else '#90be6d', up=(math.sin(a), -math.cos(a), 0))
        parts.append(frond)
    stalks = cf.cylinder(0.011, 0.016, seg=6, at=(0.0, 0.008, 0.03), color='#a7c957', r2=0.008)
    parts.append(stalks)
    return finish(parts, 'vm_hortaliza')


def vendaje():
    """Rollo de venda de gasa con el extremo suelto colgando."""
    roll = cf.lathe([(0.011, -0.04), (0.033, -0.04), (0.0355, -0.036), (0.0355, 0.036), (0.033, 0.04), (0.011, 0.04)], seg=12, rot=(0, 90, 0), color='#f8f9fa')
    roll.data.transform(Matrix.Translation((0, 0, 0.05)))
    cf.paint(roll, '#e9e4d8', lambda p: abs(p.normal.x) > 0.7 and int(Vector((0, p.center.y, p.center.z - 0.05)).length / 0.006) % 2 == 0)
    cf.jitter_colors(roll, 0.03, seed=111)
    core = cf.cylinder(0.011, 0.082, seg=8, at=(-0.041, 0, 0.05), rot=(0, 90, 0), color='#c9b98f', cap=False)
    tail = limb([(0.0, -0.035, 0.048), (0.0, -0.045, 0.025), (0.0, -0.05, 0.0), (0.004, -0.046, -0.02)], [(0.034, 0.0015)] * 4, seg=4, color='#f1ece0', up=(1, 0, 0))
    return finish([roll, core, tail], 'vm_vendaje')


def botiquin():
    """Botiquín rojo de esquinas redondeadas: tapa, cierres, asa y cruces blancas."""
    box = cf.box((0.14, 0.06, 0.1), at=(0, 0, 0.01), color='#e63946')
    cf.bevel(box, 0.008, 2, 30)
    cf.paint(box, '#c62f3a', lambda p: abs(p.center.z - 0.085) < 0.004 or p.normal.z < -0.6)
    cf.jitter_colors(box, 0.03, seed=121)
    parts = [box]
    for sy in (-1, 1):
        parts.append(cf.box((0.048, 0.003, 0.015), at=(0, sy * 0.0305, 0.0525), color='#f8f9fa', base=False))
        parts.append(cf.box((0.015, 0.0036, 0.048), at=(0, sy * 0.0305, 0.0525), color='#f8f9fa', base=False))
    for sx in (-1, 1):
        parts.append(cf.box((0.012, 0.004, 0.016), at=(sx * 0.045, -0.031, 0.078), color=STEEL_LIGHT))
    handle = limb([(-0.03, 0, 0.108), (-0.026, 0, 0.123), (0.026, 0, 0.123), (0.03, 0, 0.108)], [(0.006, 0.008)] * 4, seg=6, color='#2b2d42', up=(0, 0, 1))
    parts.append(handle)
    return finish(parts, 'vm_botiquin')


def plano_rollo():
    """Plano enrollado (se tiñe con el color de cada plano en el juego): lámina enrollada en
    espiral (se ve en los extremos) a lo largo de X."""
    pts = []
    n = 30
    for i in range(n + 1):
        t = i / n
        a = t * 2.6 * 2 * math.pi
        r = 0.012 + 0.02 * t
        pts.append((r * math.cos(a), r * math.sin(a)))
    # Lámina con grosor: ida por fuera y vuelta por dentro.
    outline = [(x, y) for x, y in pts] + [(x * (1 - 0.003 / math.hypot(x, y)), y * (1 - 0.003 / math.hypot(x, y))) for x, y in reversed(pts)]
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
    cf.paint(ob, '#ffffff')
    cf.jitter_colors(ob, 0.04, seed=131)
    return finish([ob], 'vm_plano_rollo')


def plano_cinta():
    """Cinta de bramante que ata el plano enrollado, y la lazada."""
    band = cf.torus(0.0345, 0.0026, seg=12, tube_seg=4, at=(0, 0, 0.05), rot=(0, 90, 0), color=ROPE)
    band2 = cf.torus(0.0345, 0.0026, seg=12, tube_seg=4, at=(0.008, 0, 0.05), rot=(0, 90, 0), color=ROPE_DARK)
    bow = limb([(0.004, -0.02, 0.082), (0.0, -0.034, 0.096), (0.012, -0.03, 0.1), (0.006, -0.018, 0.084)], [0.0022] * 4, seg=4, color=ROPE)
    return finish([band, band2, bow], 'vm_plano_cinta')


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


def build():
    martillo()
    llave()
    garfio()
    gancho_rollo()
    cana()
    corcho()
    cubo()
    cubo_agua()
    pez('vm_pez_crudo', back='#457b9d', flank='#8ecae6', belly='#e8f4f2', fin='#6fa8c7', eye=('#f8f9fa', '#1a1a1a'), bars='#335f7a')
    pez('vm_pez_asado', back='#8b4a22', flank='#c9844a', belly='#e9a25f', fin='#6e3b1c', eye=('#f3ead6', '#c9b98f'), grill='#5a3216')
    pez('vm_pez_ahumado', back='#6e3f1c', flank='#c97c3d', belly='#e0a458', fin='#8b5a2b', eye=('#3a2a1a', '#1a1a1a'), twine=True)
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
