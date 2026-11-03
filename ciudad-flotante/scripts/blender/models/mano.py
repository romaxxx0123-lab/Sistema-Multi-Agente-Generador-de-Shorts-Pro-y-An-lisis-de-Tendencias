"""
Brazo del jugador en primera persona (modelo en mano): antebrazo con la manga remangada y puño
cerrado alrededor de un mango.

MARCO (el mismo que `buildArm` en src/game/tools/models.ts, pasado a Blender):
- El mango que agarra el puño es el eje Z (juego +y) y pasa por el origen del puño.
- +Y de Blender es «hacia delante», lejos de la cámara (juego −z); +X, a la derecha.
- Mano derecha en agarre de martillo: el dorso mira a +X, los nudillos hacia delante (+Y), los
  dedos rodean el mango por delante y asoman por la izquierda (−X), el pulgar cierra por arriba.
- El antebrazo sale de la muñeca hacia atrás, abajo y a la derecha (hacia la cámara), con la
  misma dirección que el procedimental para que el encuadre y las animaciones no cambien.
- Convención de base apoyada: todo el modelo se sube VM_LIFT metros (el puño queda a 1 m del
  origen y nada baja de z = 0); models.ts los resta al montarlo.
"""
import math

from mathutils import Matrix, Vector

import bmesh
import bpy

import cf

VM_LIFT = 1.0

SKIN = 'skins.1'          # '#e0ac69', la piel del jugador (HAND_SKIN en models.ts)
SKIN_LIGHT = '#eabd84'    # nudillos y dorso al sol
SKIN_SHADE = '#cf9656'    # pliegues y cara interior de los dedos
NAIL = '#f2cfa0'
SHIRT = 'shirts.6'        # '#457b9d', la camisa del jugador (SLEEVE en models.ts)
SHIRT_IN = '#5d93b5'      # revés de la tela en el remango
SHIRT_DARK = '#335f7a'


# ---------------------------------------------------------------- utilidades

def limb(points, radii, seg=6, color=SKIN, name='miembro', caps=(True, True), phase=0.0, up=(0, 0, 1)):
    """
    Tubo de sección poligonal (dedos, antebrazo, manga) que pasa por `points` con un radio por
    punto (número o (rx, ry) para secciones ovaladas). Marco por transporte paralelo, así que la
    sección no se retuerce; `up` orienta el eje rx de la primera sección.
    """
    pts = [Vector(p) for p in points]
    rad = [(r, r) if isinstance(r, (int, float)) else r for r in radii]
    n = len(pts)
    tans = []
    for i in range(n):
        a = pts[max(0, i - 1)]
        b = pts[min(n - 1, i + 1)]
        tans.append((b - a).normalized())
    ref = Vector(up)
    if abs(ref.dot(tans[0])) > 0.95:
        ref = Vector((1, 0, 0))
    nrm = (ref - tans[0] * ref.dot(tans[0])).normalized()
    bm = bmesh.new()
    rings = []
    for i in range(n):
        t = tans[i]
        nrm = (nrm - t * nrm.dot(t)).normalized()
        bin_ = t.cross(nrm)
        rx, ry = rad[i]
        ring = []
        for k in range(seg):
            a = phase + 2 * math.pi * k / seg
            ring.append(bm.verts.new(pts[i] + nrm * (math.cos(a) * rx) + bin_ * (math.sin(a) * ry)))
        rings.append(ring)
    for i in range(n - 1):
        a, b = rings[i], rings[i + 1]
        for k in range(seg):
            k2 = (k + 1) % seg
            bm.faces.new((a[k], a[k2], b[k2], b[k]))
    if caps[0]:
        bm.faces.new(list(reversed(rings[0])))
    if caps[1]:
        bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return cf.paint(cf._link(name, bm), color)


def hull(points, color, name='casco'):
    """Envolvente convexa de unos puntos (bloques de la palma con forma de mano, no de caja)."""
    bm = bmesh.new()
    for p in points:
        bm.verts.new(p)
    bmesh.ops.convex_hull(bm, input=bm.verts)
    bmesh.ops.dissolve_limit(bm, angle_limit=math.radians(2), verts=bm.verts, edges=bm.edges)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return cf.paint(cf._link(name, bm), color)


def lift(ob):
    """Sube el modelo terminado VM_LIFT metros (convención de base apoyada)."""
    ob.data.transform(Matrix.Translation((0, 0, VM_LIFT)))
    ob.data.update()
    # Refresca la caja envolvente del objeto (la usa el manifiesto).
    bpy.context.view_layer.update()
    return ob


# ---------------------------------------------------------------- mano

# Dedos de arriba (índice) abajo (meñique): altura, grosor y escala de longitud.
FINGERS = [(0.031, 0.0105, 1.0), (0.0105, 0.0112, 1.04), (-0.0105, 0.0106, 1.0), (-0.0305, 0.0092, 0.86)]


def finger(z, r, k, i):
    """Dedo cerrado alrededor del mango: nudillo delante a la derecha, falanges por delante del
    mango y la punta escondida a la izquierda, contra la base de la palma."""
    mcp = Vector((0.036, 0.031 - 0.003 * i, z))
    pip = Vector((-0.019 * k, 0.040 * k, z))
    dip = Vector((-0.035 * k, 0.006 * k, z - 0.001))
    tip = Vector((-0.024 * k, -0.013 * k, z - 0.002))
    end = tip + (tip - dip).normalized() * r * 0.55
    pts = [mcp + Vector((0.004, -0.006, 0)), mcp, (mcp + pip) / 2, pip, dip, tip, end]
    radii = [r * 1.05, r * 1.18, r * 1.0, r * 1.02, r * 0.95, r * 0.86, r * 0.42]
    ob = limb(pts, radii, seg=6, color=SKIN, name=f'dedo{i}', phase=math.pi / 6)
    # Cara interior (la que toca el mango) algo más oscura; la punta, con la uña más clara.
    cf.paint(ob, SKIN_SHADE, lambda p: Vector((p.center.x, p.center.y, 0)).length < 0.03 and p.center.x < 0.02)
    cf.paint(ob, NAIL, lambda p: (p.center - tip).length < r * 0.9 and p.normal.dot((tip - Vector((0, 0, tip.z))).normalized()) > 0.5)
    cf.paint(ob, SKIN_LIGHT, lambda p: (p.center - mcp).length < r * 1.3 and (p.normal.x > 0.3 or p.normal.y > 0.5))
    return ob


def thumb():
    """Pulgar: nace en la base de la palma (eminencia tenar) y cierra el puño por arriba,
    apoyado sobre el índice."""
    pts = [(0.026, -0.04, 0.012), (0.012, -0.038, 0.03), (-0.006, -0.032, 0.044), (-0.028, -0.012, 0.049), (-0.033, 0.012, 0.045), (-0.031, 0.02, 0.043)]
    radii = [0.017, 0.016, 0.0125, 0.0112, 0.0095, 0.005]
    ob = limb(pts, radii, seg=6, color=SKIN, name='pulgar', phase=math.pi / 6)
    tip = Vector(pts[4])
    cf.paint(ob, NAIL, lambda p: (p.center - tip).length < 0.012 and p.normal.z > 0.45)
    cf.paint(ob, SKIN_LIGHT, lambda p: p.normal.z > 0.75 and p.center.y < -0.01)
    return ob


def palm():
    """Palma: metacarpos (dorso a +X, nudillos delante) y talón de la mano que rodea el mango por
    detrás. Dos envolventes convexas biseladas."""
    back = hull([
        # cara del dorso (x alto) y cara de la palma (x bajo); muñeca atrás (y −, más estrecha),
        # nudillos delante; el dorso abombado en el centro
        (0.05, -0.052, 0.024), (0.05, -0.052, -0.032), (0.049, 0.034, 0.038), (0.047, 0.028, -0.039),
        (0.02, -0.054, 0.024), (0.02, -0.054, -0.034), (0.022, 0.034, 0.04), (0.022, 0.028, -0.041),
        (0.045, 0.039, 0.0), (0.057, -0.008, 0.004), (0.054, 0.02, 0.026), (0.053, 0.016, -0.03),
    ], SKIN, 'dorso')
    heel = hull([
        (0.03, -0.054, 0.024), (0.03, -0.054, -0.04), (0.03, -0.018, 0.026), (0.03, -0.02, -0.042),
        (-0.022, -0.046, 0.02), (-0.026, -0.044, -0.036), (-0.02, -0.024, 0.024), (-0.028, -0.022, -0.04),
        (-0.008, -0.056, -0.01),
    ], SKIN, 'talon')
    cf.bevel(back, 0.008, 2, 30)
    cf.bevel(heel, 0.007, 1, 30)
    cf.paint(back, SKIN_LIGHT, lambda p: p.normal.x > 0.6)
    cf.jitter_colors(back, 0.03, seed=11)
    # Solo la cara que toca el mango, algo más oscura.
    cf.paint(heel, SKIN_SHADE, lambda p: p.normal.y > 0.6)
    cf.jitter_colors(heel, 0.03, seed=12)
    return [back, heel]


# ---------------------------------------------------------------- antebrazo y manga

# Dirección del antebrazo (de la muñeca al codo), la del procedimental pasada a Blender.
ARM_DIR = Vector((0.095, -0.31, -0.385)).normalized()
WRIST = Vector((0.018, -0.056, -0.026))


def forearm():
    """Antebrazo desnudo hasta el remango, el rollo de la manga y la manga hasta muy lejos, fuera
    de pantalla. El remango va cerca de la muñeca para que una franja azul entre siempre en cuadro
    (con FOV 72 el antebrazo sale enseguida por abajo: sin ella, piel beige sobre cubierta beige)
    y la manga llega a 0,8 m para que su extremo cortado no se vea ni con FOV 100 ni al volcar el
    cubo. Grosor de un antebrazo de verdad a la escala del puño."""
    d = ARM_DIR
    at = lambda s: WRIST + d * s  # noqa: E731
    # Sección ovalada (más ancha que gruesa) que engorda hacia el codo.
    skin = limb(
        [at(-0.012), at(0.0), at(0.03), at(0.058), at(0.07)],
        [(0.029, 0.024), (0.031, 0.026), (0.035, 0.029), (0.039, 0.032), (0.04, 0.033)],
        seg=8, color=SKIN, name='antebrazo', caps=(True, False), up=(1, 0, 0),
    )
    cf.paint(skin, SKIN_LIGHT, lambda p: p.normal.x > 0.55 or p.normal.z > 0.55)
    # Cara de abajo y de dentro en sombra: recorta el antebrazo contra la madera de la cubierta.
    cf.paint(skin, SKIN_SHADE, lambda p: p.normal.z < -0.3 or p.normal.x < -0.4)
    cf.jitter_colors(skin, 0.025, seed=13)
    # Remango: un rollo grueso de tela (revés más claro) con el doblez de la manga encima.
    roll = limb(
        [at(0.055), at(0.064), at(0.083), at(0.11), at(0.122)],
        [(0.046, 0.039), (0.054, 0.046), (0.058, 0.05), (0.057, 0.049), (0.052, 0.045)],
        seg=8, color=SHIRT_IN, name='remango', caps=(False, False), up=(1, 0, 0), phase=0.2,
    )
    cf.paint(roll, SHIRT, lambda p: (p.center - WRIST).dot(d) > 0.1)
    cf.jitter_colors(roll, 0.05, seed=14)
    sleeve = limb(
        [at(0.112), at(0.19), at(0.205), at(0.3), at(0.45), at(1.1)],
        [(0.052, 0.045), (0.055, 0.048), (0.053, 0.046), (0.056, 0.049), (0.057, 0.05), (0.058, 0.051)],
        seg=8, color=SHIRT, name='manga', caps=(False, True), up=(1, 0, 0),
    )
    # Pliegue: una franja algo más oscura (y algo hundida) en la manga, por la cara de dentro.
    cf.paint(sleeve, SHIRT_DARK, lambda p: 0.19 < (p.center - WRIST).dot(d) < 0.205 and p.normal.x < 0.2)
    cf.jitter_colors(sleeve, 0.04, seed=15)
    return [skin, roll, sleeve]


def wrist():
    """Muñeca: une el talón de la mano con el antebrazo."""
    return limb([WRIST + Vector((0.004, 0.022, 0.016)), WRIST + Vector((0.002, 0.008, 0.006)), WRIST - ARM_DIR * 0.004],
                [(0.027, 0.022), (0.029, 0.024), (0.03, 0.025)], seg=8, color=SKIN, name='muneca', up=(1, 0, 0))


def brazo():
    parts = palm()
    parts += [finger(z, r, k, i) for i, (z, r, k) in enumerate(FINGERS)]
    parts.append(thumb())
    parts.append(wrist())
    parts += forearm()
    return lift(cf.model(parts, 'vm_brazo'))


def build():
    brazo()
