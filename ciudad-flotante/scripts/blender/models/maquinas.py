"""
Máquinas y puestos del barco (props de src/render/ship/props.ts): timón con su rueda, bancal del
huerto y depósito de agua. Igual que muebles.py: `prop_<kind>` sustituye la geometría sólida base
del procedimental (en coordenadas del juego, con las medidas de su colisionador) y las piezas
móviles van aparte como `prop_<kind>_<pieza>`, exportadas con su pivote en (0, PIECE_LIFT, 0)
del juego (props.ts las baja otra vez: así todo modelo queda apoyado en y ≥ 0).
"""
import math

import bmesh
from mathutils import Vector

import cf

PIECE_LIFT = 1.0  # = PIECE_LIFT de props.ts

WOOD = '#9c6b43'
WOOD_DARK = '#6e4a2e'
WOOD_LIGHT = '#c8995f'
IRON = '#3a3f44'
CAST = '#2b2f33'
BRASS = '#c9a35a'
STEEL = 'metal'
STEEL_DARK = 'metalDark'
RED = '#bc4749'


# ---------------------------------------------------------------- ayudas (coordenadas del juego)

def B(x, y, z):
    return (x, -z, y)


def gbox(x0, y0, z0, x1, y1, z1, color, bev=0.0, seg=1):
    ob = cf.box((x1 - x0, z1 - z0, y1 - y0), at=((x0 + x1) / 2, -(z0 + z1) / 2, y0), color=color)
    if bev:
        cf.bevel(ob, bev, seg)
    return ob


def gcyl(x, y0, z, r, h, seg=8, color=STEEL, r2=None):
    return cf.cylinder(r, h, seg, at=(x, -z, y0), color=color, r2=r2)


def gcylx(x0, x1, y, z, r, seg=8, color=STEEL):
    return cf.cylinder(r, x1 - x0, seg, at=(x0, -z, y), color=color, rot=(0, 90, 0))


def gcylz(x, y, z0, z1, r, seg=8, color=STEEL):
    return cf.cylinder(r, z1 - z0, seg, at=(x, -z0, y), color=color, rot=(90, 0, 0))


def glathe(x, y0, z, profile, seg=8, color=WOOD):
    return cf.lathe(profile, seg=seg, at=(x, -z, y0), color=color)


def gsphere(x, y, z, r, color, subdiv=1):
    return cf.sphere(r, at=B(x, y, z), color=color, subdiv=subdiv)


def gtube(points, r, seg=6, color=STEEL, cap=True):
    return cf.tube([B(*p) for p in points], r, seg=seg, color=color, cap=cap)


def orient(ob, start, direction):
    """Lleva un objeto construido a lo largo de +Z de Blender a `start` con dirección `direction`
    (ambos en coordenadas del juego)."""
    d = Vector(B(*direction))
    ob.rotation_mode = 'QUATERNION'
    ob.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d.normalized())
    ob.location = Vector(B(*start))
    return cf.bake_transform(ob)


def between(a, b, r, seg=6, color=STEEL):
    d = Vector(b) - Vector(a)
    ob = cf.cylinder(r, d.length, seg, color=color)
    return orient(ob, a, tuple(d))


def lathe_along(a, b, profile, seg=6, color=WOOD):
    """Sólido de revolución entre a y b: `profile` [(radio, t), …] con t de 0 a 1 a lo largo."""
    d = Vector(b) - Vector(a)
    ob = cf.lathe([(r, t * d.length) for r, t in profile], seg=seg, color=color)
    return orient(ob, a, tuple(d))


def rect_frustum(x, z, y0, h, bw, bd, tw, td, color):
    """Tronco de pirámide rectangular (anchos completos abajo y arriba), como GeoBuilder.frustum."""
    bm = bmesh.new()
    vb = [bm.verts.new(B(x + sx * bw / 2, y0, z + sz * bd / 2)) for sx, sz in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    vt = [bm.verts.new(B(x + sx * tw / 2, y0 + h, z + sz * td / 2)) for sx, sz in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    bm.faces.new(vb)
    bm.faces.new(vt)
    for i in range(4):
        j = (i + 1) % 4
        bm.faces.new((vb[i], vb[j], vt[j], vt[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return cf.paint(cf._link('tronco', bm), color)


# ---------------------------------------------------------------- timón

def timon():
    """
    Pedestal del timón (0,55 × 0,45 × 1,3): columna de madera con cuarterones, bitácora de latón
    con bolas compensadoras (la cúpula de cristal la pone props.ts), telégrafo de órdenes y eje.
    """
    hx, hz = 0.55, 0.45
    zc = 0.05
    parts = []
    # zócalo moldurado y columna en tronco de pirámide con aristas biseladas
    plinth = gbox(-hx * 0.78, 0, zc - hz * 0.86, hx * 0.78, 0.07, zc + hz * 0.86, WOOD_DARK, 0.015, 2)
    parts.append(plinth)
    parts.append(gbox(-hx * 0.72, 0.07, zc - hz * 0.78, hx * 0.72, 0.12, zc + hz * 0.78, WOOD, 0.01))
    col = rect_frustum(0, zc, 0.12, 0.8, hx * 1.36, hz * 1.46, hx * 1.08, hz * 1.08, WOOD)
    cf.bevel(col, 0.02, 1, angle=30)
    cf.jitter_colors(col, 0.04, 5)
    parts.append(col)
    # cuarterones en las cuatro caras (algo hundidos, más oscuros)
    for sz in (-1, 1):
        z = zc + sz * (hz * 0.66 + 0.012)
        p = gbox(-hx * 0.42, 0.3, z - 0.012, hx * 0.42, 0.78, z + 0.012, WOOD_DARK, 0.006)
        parts.append(p)
    for sx in (-1, 1):
        x = sx * (hx * 0.6 + 0.008)
        parts.append(gbox(x - 0.012, 0.3, zc - hz * 0.42, x + 0.012, 0.78, zc + hz * 0.42, WOOD_DARK, 0.006))
    # capitel
    parts.append(gbox(-hx * 0.62, 0.92, zc - hz * 0.64, hx * 0.62, 1.0, zc + hz * 0.64, WOOD_DARK, 0.015, 2))
    # bitácora: cuenco de latón y bolas compensadoras de hierro a los lados
    parts.append(glathe(0, 1.0, 0.12, [(0.0, 0.0), (0.13, 0.0), (0.17, 0.04), (0.175, 0.1), (0.19, 0.11), (0.19, 0.13), (0.14, 0.13), (0.0, 0.12)], seg=12, color=BRASS))
    for sx in (-1, 1):
        parts.append(gbox(sx * 0.17, 1.06, 0.1, sx * 0.24, 1.08, 0.14, BRASS))
        parts.append(gsphere(sx * 0.27, 1.08, 0.12, 0.055, '#2f6b4f' if sx < 0 else RED, subdiv=1))
    # telégrafo de órdenes: columna torneada, caja del dial con esfera y palanca
    tx, tz = hx * 0.62, 0.15
    parts.append(glathe(tx, 0.95, tz, [(0.0, 0.0), (0.075, 0.0), (0.06, 0.04), (0.045, 0.08), (0.04, 0.18), (0.055, 0.21), (0.0, 0.22)], seg=8, color=BRASS))
    parts.append(gcylz(tx, 1.28, tz - 0.075, tz + 0.05, 0.135, 12, BRASS))
    parts.append(gcylz(tx, 1.28, tz - 0.085, tz - 0.07, 0.11, 12, '#f3ead6'))
    # sectores de la esfera (avante / atrás) y aguja
    for k in range(5):
        a = math.pi * (0.15 + 0.175 * k)
        parts.append(gbox(tx + math.cos(a) * 0.075 - 0.006, 1.28 + math.sin(a) * 0.075 - 0.006, tz - 0.09, tx + math.cos(a) * 0.075 + 0.006, 1.28 + math.sin(a) * 0.075 + 0.006, tz - 0.084, RED if k == 2 else '#2b2d42'))
    parts.append(between((tx, 1.28, tz - 0.092), (tx + 0.05, 1.33, tz - 0.092), 0.006, 4, '#2b2d42'))
    parts.append(between((tx + 0.13, 1.25, tz - 0.02), (tx + 0.2, 1.38, tz - 0.02), 0.012, 5, BRASS))
    parts.append(gsphere(tx + 0.205, 1.39, tz - 0.02, 0.025, '#2b2d42', subdiv=0))
    # eje de latón con su brida (la rueda gira en su punta: anclaje wheel = (0, 0,98, −0,33))
    wy, wz = 0.98, -hz * 0.6
    parts.append(gcylz(0, wy, wz + 0.0, wz + 0.17, 0.045, 8, BRASS))
    parts.append(gcylz(0, wy, wz + 0.15, wz + 0.19, 0.09, 10, BRASS))
    return cf.model(parts, 'prop_timon')


def timon_rueda():
    """Rueda del timón con radios torneados y cabillas; centro (pivote) en (0, PIECE_LIFT, 0)."""
    L = PIECE_LIFT
    parts = []
    rim = cf.torus(0.42, 0.04, seg=18, tube_seg=5, at=B(0, L, 0), rot=(90, 0, 0), color=WOOD_DARK)
    cf.jitter_colors(rim, 0.05, 2)
    parts.append(rim)
    # aro de latón interior
    parts.append(cf.torus(0.38, 0.012, seg=18, tube_seg=3, at=B(0, L, 0), rot=(90, 0, 0), color=BRASS))
    # cubo
    parts.append(lathe_along((0, L, 0.07), (0, L, -0.07), [(0.0, 0.0), (0.085, 0.0), (0.095, 0.2), (0.075, 0.5), (0.095, 0.8), (0.085, 1.0), (0.0, 1.0)], seg=10, color=BRASS))
    for k in range(8):
        a = (k / 8) * math.pi * 2
        d = (math.cos(a), math.sin(a), 0)
        start = (d[0] * 0.07, L + d[1] * 0.07, 0)
        end = (d[0] * 0.62, L + d[1] * 0.62, 0)
        # radio torneado (hasta el aro) y cabilla con su bola (fuera del aro)
        prof = [(0.0, 0.0), (0.026, 0.0), (0.022, 0.1), (0.03, 0.27), (0.021, 0.45), (0.024, 0.62), (0.036, 0.7), (0.03, 0.76), (0.042, 0.88), (0.034, 0.97), (0.0, 1.0)]
        parts.append(lathe_along(start, end, prof, seg=6, color=WOOD_LIGHT if k % 2 else WOOD))
    return cf.model(parts, 'prop_timon_rueda')


# ---------------------------------------------------------------- bancal

def bancal():
    """
    Cajón del bancal (1,15 × 1,15 × 0,5): tablas biseladas con vetas, postes de esquina con remate,
    escuadras de hierro y un listón de remate. La tierra, los surcos, el riego y el cartel siguen
    siendo procedimentales (cambian con la mejora del huerto).
    """
    hx = hz = 1.15
    h = 0.5
    t = 0.09
    parts = []
    rows = 3
    gap = 0.008
    for side in range(4):
        for k in range(rows):
            y0 = k * h / rows + gap / 2
            y1 = (k + 1) * h / rows - gap / 2
            if side == 0:
                b = gbox(-hx + 0.05, y0, -hz, hx - 0.05, y1, -hz + t, WOOD, 0.01)
            elif side == 1:
                b = gbox(-hx + 0.05, y0, hz - t, hx - 0.05, y1, hz, WOOD, 0.01)
            elif side == 2:
                b = gbox(-hx, y0, -hz + t, -hx + t, y1, hz - t, WOOD, 0.01)
            else:
                b = gbox(hx - t, y0, -hz + t, hx, y1, hz - t, WOOD, 0.01)
            cf.jitter_colors(b, 0.09, 100 + side * 7 + k)
            parts.append(b)
    # postes de esquina con el canto superior achaflanado
    for sx in (-1, 1):
        for sz in (-1, 1):
            p = gbox(sx * hx - 0.065, 0, sz * hz - 0.065, sx * hx + 0.065, h + 0.04, sz * hz + 0.065, WOOD_DARK, 0.012)
            parts.append(p)
            parts.append(rect_frustum(sx * hx, sz * hz, h + 0.04, 0.035, 0.13, 0.13, 0.07, 0.07, WOOD_DARK))
            # escuadras de hierro en el frente y el fondo (las caras que se ven al cultivar)
            for y in (0.07, h - 0.12):
                xa, xb = sorted((sx * (hx - 0.2), sx * (hx - 0.06)))
                za, zb = sorted((sz * (hz + 0.002), sz * (hz + 0.01)))
                parts.append(gbox(xa, y, za, xb, y + 0.05, zb, IRON))
    # listón de remate sobre las tablas (más estrecho que la pared: deja sitio a la goma del riego)
    cap = 0.1
    parts.append(gbox(-hx + 0.065, h, -hz - 0.01, hx - 0.065, h + 0.03, -hz + cap - 0.01, WOOD_LIGHT))
    parts.append(gbox(-hx + 0.065, h, hz - cap + 0.01, hx - 0.065, h + 0.03, hz + 0.01, WOOD_LIGHT))
    parts.append(gbox(-hx - 0.01, h, -hz + 0.065, -hx + cap - 0.01, h + 0.03, hz - 0.065, WOOD_LIGHT))
    parts.append(gbox(hx - cap + 0.01, h, -hz + 0.065, hx + 0.01, h + 0.03, hz - 0.065, WOOD_LIGHT))
    for p in parts[-4:]:
        cf.jitter_colors(p, 0.05, 140)
    return cf.model(parts, 'prop_bancal')


# ---------------------------------------------------------------- depósito

def deposito():
    """
    Depósito de agua (1,1 × 1,1 × 2,4; nivel 1): virola de chapa con costuras remachadas, cabeza
    abombada con boca de hombre, escalerilla a +x, mirilla de nivel de latón al frente (anclajes
    gaugeBottom/gaugeTop en x = 0, z = −1,075), grifo en (0,4, −1,19) y tubería curvada al techo.
    """
    r = 1.02
    h = 2.4
    tank = '#8fa9b8'
    parts = []
    seg = 16
    # zócalo de hierro con pernos
    parts.append(glathe(0, 0, 0, [(0.0, 0.0), (r + 0.06, 0.0), (r + 0.06, 0.1), (r + 0.03, 0.18), (0.0, 0.18)], seg=seg, color=IRON))
    # virola y cabeza abombada (perfil de revolución)
    prof = [(0.0, 0.17), (r, 0.17), (r, h - 0.37), (r * 0.97, h - 0.27), (r * 0.88, h - 0.18), (r * 0.7, h - 0.1), (r * 0.42, h - 0.06), (0.0, h - 0.05)]
    body = glathe(0, 0, 0, prof, seg=seg, color=tank)
    cf.paint(body, tank, lambda p: p.normal.z > 0.3, f=1.08)
    cf.jitter_colors(body, 0.035, 9)
    parts.append(body)
    # costuras (aros salientes) con remaches
    for y in (0.5, 1.1, 1.7):
        parts.append(glathe(0, y - 0.035, 0, [(r + 0.012, 0.0), (r + 0.02, 0.035), (r + 0.012, 0.07)], seg=seg, color=STEEL_DARK))
    for y in (0.5, 1.1, 1.7):
        for k in range(14):
            a = (k + 0.5) / 14 * math.pi * 2
            rv = gbox(-0.014, y + 0.036, -0.014, 0.014, y + 0.064, 0.014, STEEL_DARK)
            rv.rotation_euler = (0, 0, -a)
            rv.location = B(math.cos(a) * (r + 0.012), 0, math.sin(a) * (r + 0.012))
            parts.append(cf.bake_transform(rv))
    # costura vertical remachada (detrás, a −x, donde no tapa la mirilla)
    for k in range(8):
        y = 0.28 + k * 0.22
        parts.append(gbox(-r - 0.018, y - 0.014, 0.306, -r + 0.004, y + 0.014, 0.334, STEEL_DARK))
    # boca de hombre atornillada en la cabeza y respiradero en cuello de cisne
    parts.append(gcyl(0, h - 0.08, 0, 0.27, 0.06, 12, STEEL_DARK))
    parts.append(gcyl(0, h - 0.02, 0, 0.22, 0.02, 12, '#6c7880'))
    for k in range(8):
        a = k / 8 * math.pi * 2
        parts.append(gcyl(math.cos(a) * 0.245, h - 0.02, math.sin(a) * 0.245, 0.018, 0.025, 4, CAST))
    parts.append(gtube([(0.42, h - 0.18, -0.25), (0.42, h + 0.12, -0.25), (0.47, h + 0.2, -0.25), (0.55, h + 0.16, -0.25), (0.57, h + 0.08, -0.25)], 0.035, seg=6, color=STEEL))
    # tubería de llenado: sale de la cabeza, curva y sube al techo (3 m), con su válvula de volante
    pts = [(-0.45, h - 0.15, 0.3), (-0.45, h + 0.05, 0.3), (-0.47, h + 0.15, 0.32), (-0.52, h + 0.22, 0.36), (-0.55, h + 0.3, 0.38), (-0.55, 3.0, 0.38)]
    parts.append(gtube(pts, 0.06, seg=8, color=STEEL))
    parts.append(gcyl(-0.55, 2.82, 0.38, 0.085, 0.05, 10, STEEL_DARK))
    parts.append(gcyl(-0.45, h - 0.12, 0.3, 0.09, 0.04, 10, STEEL_DARK))
    vy = 2.62
    parts.append(gcylx(-0.55 + 0.05, -0.55 + 0.17, vy, 0.38, 0.018, 6, STEEL))
    wheel = cf.torus(0.08, 0.012, seg=12, tube_seg=4, at=B(-0.55 + 0.17, vy, 0.38), rot=(0, 90, 0), color=RED)
    parts.append(wheel)
    for k in range(3):
        a = k / 3 * math.pi * 2
        parts.append(between((-0.55 + 0.17, vy, 0.38), (-0.55 + 0.17, vy + math.cos(a) * 0.08, 0.38 + math.sin(a) * 0.08), 0.008, 4, RED))
    parts.append(gcyl(-0.55, vy - 0.07, 0.38, 0.09, 0.14, 10, RED))
    # escalerilla a +x: largueros, peldaños redondos y patillas a la virola
    lx = r + 0.07
    for z in (-0.18, 0.18):
        parts.append(gbox(lx - 0.02, 0.18, z - 0.022, lx + 0.02, h - 0.2, z + 0.022, STEEL_DARK, 0.006))
        for y in (0.5, 1.4, 2.05):
            parts.append(gbox(r - 0.01, y - 0.02, z - 0.015, lx, y + 0.02, z + 0.015, STEEL_DARK))
    y = 0.4
    while y < h - 0.3:
        parts.append(gcylz(lx, y + 0.015, -0.18, 0.18, 0.016, 6, STEEL))
        y += 0.3
    # mirilla de nivel al frente: marco de latón con escala (el agua la dibuja props/dynamic)
    gz = -r - 0.07
    gtop = h - 0.4
    for x in (-0.08, 0.08):
        parts.append(gbox(x - 0.02, 0.3, gz - 0.03, x + 0.02, gtop, gz + 0.06, BRASS, 0.006))
    for y0, y1 in ((0.26, 0.32), (gtop - 0.02, gtop + 0.04)):
        parts.append(gbox(-0.11, y0, gz - 0.035, 0.11, y1, gz + 0.07, BRASS, 0.008))
    for k in range(1, 5):
        yk = 0.32 + k * ((gtop - 0.32) / 5)
        parts.append(gbox(0.1, yk, gz - 0.035, 0.15, yk + 0.012, gz, '#2b2d42'))
    # grifo de latón con volante rojo (anclaje tap en la boca: (0,4, 0,34, −1,19))
    parts.append(gcylz(0.4, 0.45, -r - 0.2, -r + 0.02, 0.04, 8, BRASS))
    parts.append(gtube([(0.4, 0.45, -r - 0.18), (0.4, 0.4, -r - 0.18), (0.4, 0.36, -r - 0.17)], 0.03, seg=6, color=BRASS))
    parts.append(gcyl(0.4, 0.49, -r - 0.11, 0.012, 0.06, 5, BRASS))
    parts.append(cf.torus(0.045, 0.01, seg=10, tube_seg=3, at=B(0.4, 0.555, -r - 0.11), color=RED))
    # placa con el nombre
    parts.append(gbox(-0.36, 1.19, gz + 0.01, -0.14, 1.37, gz + 0.04, '#f3ead6', 0.005))
    for x in (-0.345, -0.155):
        for yy in (1.205, 1.355):
            parts.append(gbox(x - 0.006, yy - 0.006, gz + 0.004, x + 0.006, yy + 0.006, gz + 0.012, BRASS))
    return cf.model(parts, 'prop_deposito')


def build():
    timon()
    timon_rueda()
    bancal()
    deposito()
