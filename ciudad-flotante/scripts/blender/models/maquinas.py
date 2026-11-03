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

def deposito(tier=1):
    """
    Depósito de agua (1,1 × 1,1 × 2,4): virola de chapa con costuras remachadas, cabeza abombada
    con boca de hombre, escalerilla a +x, mirilla de nivel de latón al frente (anclajes
    gaugeBottom/gaugeTop en x = 0, z = −1,075 − forro), grifo en (0,4, −1,19 − forro) y tubería al
    techo. Niveles de mejora (como el procedimental): 2 = segundo cuerpo soldado encima (2,85 m);
    3 = además forro aislante claro con flejes, válvula de seguridad, manómetro y volante.
    """
    r = 1.02
    h = 2.4 if tier == 1 else 2.85
    out = 0.045 if tier >= 3 else 0.0
    rr = r + out
    tank = '#8fa9b8' if tier < 3 else '#d9dfe2'
    parts = []
    seg = 16
    # zócalo de hierro
    parts.append(glathe(0, 0, 0, [(0.0, 0.0), (rr + 0.06, 0.0), (rr + 0.06, 0.1), (rr + 0.03, 0.18), (0.0, 0.18)], seg=seg, color=IRON))
    # virola y cabeza abombada (perfil de revolución)
    prof = [(0.0, 0.17), (rr, 0.17), (rr, h - 0.37), (rr * 0.97, h - 0.27), (rr * 0.88, h - 0.18), (rr * 0.7, h - 0.1), (rr * 0.42, h - 0.06), (0.0, h - 0.05)]
    body = glathe(0, 0, 0, prof, seg=seg, color=tank)
    cf.paint(body, tank, lambda p: p.normal.z > 0.3, f=1.08)
    cf.jitter_colors(body, 0.035, 9)
    parts.append(body)
    if tier < 3:
        # costuras (aros salientes) con remaches; en el nivel 2, la junta soldada de los dos cuerpos
        seams = (0.5, 1.1, 1.7) if tier == 1 else (0.5, 1.1, 1.85, 2.3)
        for y in seams:
            parts.append(glathe(0, y - 0.035, 0, [(r + 0.012, 0.0), (r + 0.02, 0.035), (r + 0.012, 0.07)], seg=seg, color=STEEL_DARK))
            nr = 14 if tier == 1 else 11
            for k in range(nr):
                a = (k + 0.5) / nr * math.pi * 2
                rv = gbox(-0.014, y + 0.036, -0.014, 0.014, y + 0.064, 0.014, STEEL_DARK)
                rv.rotation_euler = (0, 0, -a)
                rv.location = B(math.cos(a) * (r + 0.012), 0, math.sin(a) * (r + 0.012))
                parts.append(cf.bake_transform(rv))
        if tier == 2:
            parts.append(glathe(0, 1.81, 0, [(r + 0.005, 0.0), (r + 0.03, 0.02), (r + 0.03, 0.06), (r + 0.005, 0.08)], seg=seg, color='#5c6770'))
        # costura vertical remachada (detrás, a −x, donde no tapa la mirilla)
        for k in range(8 if tier == 1 else 10):
            y = 0.28 + k * 0.22
            parts.append(gbox(-r - 0.018, y - 0.014, 0.306, -r + 0.004, y + 0.014, 0.334, STEEL_DARK))
    else:
        # forro aislante: flejes metálicos, cúpula clara, válvula de seguridad y manómetro
        for y in (0.5, 1.1, 1.7, 2.3):
            parts.append(glathe(0, y - 0.025, 0, [(rr + 0.004, 0.0), (rr + 0.016, 0.01), (rr + 0.016, 0.04), (rr + 0.004, 0.05)], seg=seg, color=STEEL))
            parts.append(gbox(-0.04, y - 0.035, -rr - 0.03, 0.04, y + 0.035, -rr + 0.01, STEEL_DARK, 0.006))
        parts.append(gcyl(0.25, h - 0.1, 0.1, 0.04, 0.2, 8, RED))
        parts.append(glathe(0.25, h + 0.06, 0.1, [(0.0, 0.0), (0.065, 0.0), (0.07, 0.025), (0.03, 0.06), (0.0, 0.07)], seg=8, color=RED))
        mx, my, mz = -0.42, h - 0.75, -rr - 0.03
        parts.append(gcylz(mx, my, mz - 0.012, mz + 0.04, 0.11, 12, BRASS))
        parts.append(gcylz(mx, my, mz - 0.02, mz - 0.01, 0.09, 12, '#f3ead6'))
        parts.append(between((mx, my, mz - 0.024), (mx + 0.06, my + 0.03, mz - 0.024), 0.006, 4, RED))
        wx = rr + 0.07
        parts.append(gcylx(rr - 0.01, wx, 0.45, 0.45, 0.025, 6, STEEL))
        parts.append(cf.torus(0.12, 0.016, seg=12, tube_seg=4, at=B(wx, 0.45, 0.45), rot=(0, 90, 0), color=RED))
        for k in range(3):
            a = k / 3 * math.pi * 2
            parts.append(between((wx, 0.45, 0.45), (wx, 0.45 + math.cos(a) * 0.12, 0.45 + math.sin(a) * 0.12), 0.01, 4, RED))
    # boca de hombre atornillada en la cabeza y respiradero en cuello de cisne (sin pasar del techo)
    parts.append(gcyl(0, h - 0.08, 0, 0.27, 0.06, 12, STEEL_DARK))
    parts.append(gcyl(0, h - 0.02, 0, 0.22, 0.02, 12, '#6c7880'))
    for k in range(8):
        a = k / 8 * math.pi * 2
        parts.append(gcyl(math.cos(a) * 0.245, h - 0.02, math.sin(a) * 0.245, 0.018, 0.025, 4, CAST))
    vt = min(0.2, 2.97 - h)
    parts.append(gtube([(0.42, h - 0.18, -0.25), (0.42, h + vt * 0.6, -0.25), (0.47, h + vt, -0.25), (0.55, h + vt * 0.8, -0.25), (0.57, h + vt * 0.4, -0.25)], 0.035, seg=6, color=STEEL))
    # tubería de llenado: sale de la cabeza, curva y sube al techo (3 m); con sitio, válvula de volante
    if h + 0.4 < 3.0:
        pts = [(-0.45, h - 0.15, 0.3), (-0.45, h + 0.05, 0.3), (-0.47, h + 0.15, 0.32), (-0.52, h + 0.22, 0.36), (-0.55, h + 0.3, 0.38), (-0.55, 3.0, 0.38)]
        parts.append(gtube(pts, 0.06, seg=8, color=STEEL))
        parts.append(gcyl(-0.55, 2.82, 0.38, 0.085, 0.05, 10, STEEL_DARK))
        vy = 2.62
        parts.append(gcylx(-0.55 + 0.05, -0.55 + 0.17, vy, 0.38, 0.018, 6, STEEL))
        parts.append(cf.torus(0.08, 0.012, seg=12, tube_seg=4, at=B(-0.55 + 0.17, vy, 0.38), rot=(0, 90, 0), color=RED))
        for k in range(3):
            a = k / 3 * math.pi * 2
            parts.append(between((-0.55 + 0.17, vy, 0.38), (-0.55 + 0.17, vy + math.cos(a) * 0.08, 0.38 + math.sin(a) * 0.08), 0.008, 4, RED))
        parts.append(gcyl(-0.55, vy - 0.07, 0.38, 0.09, 0.14, 10, RED))
    else:
        parts.append(gcyl(-0.45, h - 0.15, 0.3, 0.06, 3.0 - h + 0.15, 8, STEEL))
        parts.append(gcyl(-0.45, 2.94, 0.3, 0.085, 0.06, 10, STEEL_DARK))
    parts.append(gcyl(-0.45, h - 0.12, 0.3, 0.09, 0.04, 10, STEEL_DARK))
    # escalerilla a +x: largueros, peldaños redondos y patillas a la virola
    lx = rr + 0.07
    for z in (-0.18, 0.18):
        parts.append(gbox(lx - 0.02, 0.18, z - 0.022, lx + 0.02, h - 0.2, z + 0.022, STEEL_DARK, 0.006))
        for y in (0.5, 1.4, h - 0.35):
            parts.append(gbox(rr - 0.01, y - 0.02, z - 0.015, lx, y + 0.02, z + 0.015, STEEL_DARK))
    y = 0.4
    while y < h - 0.3:
        parts.append(gcylz(lx, y + 0.015, -0.18, 0.18, 0.016, 6, STEEL))
        y += 0.3
    # mirilla de nivel al frente: marco de latón con escala (el agua la dibuja dynamic.ts)
    gz = -r - 0.07 - out
    gtop = h - 0.4
    for x in (-0.08, 0.08):
        parts.append(gbox(x - 0.02, 0.3, gz - 0.03, x + 0.02, gtop, gz + 0.06, BRASS, 0.006))
    for y0, y1 in ((0.26, 0.32), (gtop - 0.02, gtop + 0.04)):
        parts.append(gbox(-0.11, y0, gz - 0.035, 0.11, y1, gz + 0.07, BRASS, 0.008))
    for k in range(1, 5):
        yk = 0.32 + k * ((gtop - 0.32) / 5)
        parts.append(gbox(0.1, yk, gz - 0.035, 0.15, yk + 0.012, gz, '#2b2d42'))
    # grifo de latón con volante rojo (anclaje tap en la boca)
    zt = -r - out
    parts.append(gcylz(0.4, 0.45, zt - 0.2, zt + 0.02, 0.04, 8, BRASS))
    parts.append(gtube([(0.4, 0.45, zt - 0.18), (0.4, 0.4, zt - 0.18), (0.4, 0.36, zt - 0.17)], 0.03, seg=6, color=BRASS))
    parts.append(gcyl(0.4, 0.49, zt - 0.11, 0.012, 0.06, 5, BRASS))
    parts.append(cf.torus(0.045, 0.01, seg=10, tube_seg=3, at=B(0.4, 0.555, zt - 0.11), color=RED))
    # placa con el nombre
    parts.append(gbox(-0.36, 1.19, gz + 0.01, -0.14, 1.37, gz + 0.04, '#f3ead6', 0.005))
    for x in (-0.345, -0.155):
        for yy in (1.205, 1.355):
            parts.append(gbox(x - 0.006, yy - 0.006, gz + 0.004, x + 0.006, yy + 0.006, gz + 0.012, BRASS))
    return cf.model(parts, 'prop_deposito' if tier == 1 else f'prop_deposito@{tier}')


# ---------------------------------------------------------------- generador

def generador():
    """
    Bancada del generador (1,1 × 0,8 × 1,4): chapa con pernos, dos vigas en I y tacos de goma.
    El grupo electrógeno vibra, así que va aparte (`prop_generador_movil`).
    """
    hx, hz = 1.1, 0.8
    parts = [gbox(-hx, 0, -hz, hx, 0.08, hz, IRON, 0.015, 1)]
    cf.jitter_colors(parts[0], 0.04, 3)
    for sx in (-1, 1):
        for sz in (-1, 1):
            parts.append(gcyl(sx * (hx - 0.08), 0.08, sz * (hz - 0.08), 0.03, 0.025, 6, STEEL))
    # vigas en I bajo el grupo y tacos de goma
    for x in (-hx + 0.15, hx - 0.15):
        parts.append(gbox(x - 0.08, 0.08, -hz + 0.05, x + 0.08, 0.1, hz - 0.05, CAST))
        parts.append(gbox(x - 0.02, 0.1, -hz + 0.05, x + 0.02, 0.15, hz - 0.05, CAST))
        parts.append(gbox(x - 0.08, 0.15, -hz + 0.05, x + 0.08, 0.17, hz - 0.05, CAST))
        for z in (-0.35, 0.35):
            parts.append(gcyl(x, 0.12, z, 0.05, 0.05, 8, '#1d1f22'))
    return cf.model(parts, 'prop_generador')


def generador_movil():
    """
    Grupo electrógeno (lo que vibra), en coordenadas del prop y subido PIECE_LIFT: bloque rojo con
    culatas aleteadas y tapa de balancines, radiador con rejilla, alternador azul con aletas,
    depósito de combustible redondeado con cinchas, escape con silencioso y cuadro de mando.
    Mismas cotas que el procedimental (los detalles de las mejoras se apoyan en la culata, a 1,0 m).
    """
    L = PIECE_LIFT
    hx, hz = 1.1, 0.8
    red = '#c8553d'
    parts = []

    def up(ob):
        ob.location.z += L
        return cf.bake_transform(ob)
    # bloque motor con cárter y bisel
    blk = gbox(-hx + 0.25, 0.16, -0.45, 0.25, 0.85, 0.42, red, 0.03, 2)
    cf.jitter_colors(blk, 0.03, 4)
    parts.append(blk)
    parts.append(gbox(-hx + 0.3, 0.16, -0.48, 0.2, 0.3, 0.45, '#9e3f2c', 0.02))
    # culatas con aletas de refrigeración y tapa de balancines atornillada
    for k in range(3):
        x0 = -hx + 0.32 + k * 0.3
        parts.append(gbox(x0, 0.85, -0.3, x0 + 0.23, 0.92, 0.3, '#a8462f', 0.01))
        for f in range(3):
            parts.append(gbox(x0 - 0.01, 0.93 + f * 0.025, -0.33, x0 + 0.24, 0.945 + f * 0.025, 0.33, '#b04a33'))
    parts.append(gbox(-hx + 0.3, 1.0, -0.13, 0.2, 1.05, 0.13, STEEL_DARK, 0.012))
    for k in range(5):
        parts.append(gcyl(-hx + 0.38 + k * 0.2, 1.05, -0.1, 0.012, 0.012, 4, CAST))
        parts.append(gcyl(-hx + 0.38 + k * 0.2, 1.05, 0.1, 0.012, 0.012, 4, CAST))
    # radiador con marco, rejilla y tapón
    parts.append(gbox(-hx + 0.05, 0.16, -0.5, -hx + 0.25, 1.0, 0.5, CAST, 0.015))
    for k in range(7):
        parts.append(gbox(-hx + 0.02, 0.24 + k * 0.1, -0.44, -hx + 0.05, 0.28 + k * 0.1, 0.44, STEEL))
    parts.append(gcyl(-hx + 0.15, 1.0, 0.3, 0.035, 0.05, 8, BRASS))
    # alternador con aletas y caja de bornes
    alt = lathe_along((0.245, 0.55, 0), (0.995, 0.55, 0), [(0.0, 0.0), (0.3, 0.0), (0.36, 0.06), (0.38, 0.15), (0.38, 0.85), (0.34, 0.95), (0.22, 1.0), (0.0, 1.0)], seg=14, color='#457b9d')
    parts.append(alt)
    for k in range(5):
        x = 0.36 + k * 0.12
        parts.append(lathe_along((x, 0.55, 0), (x + 0.03, 0.55, 0), [(0.37, 0.0), (0.405, 0.2), (0.405, 0.8), (0.37, 1.0)], seg=14, color='#3d6d8b'))
    parts.append(lathe_along((0.99, 0.55, 0), (1.05, 0.55, 0), [(0.0, 0.0), (0.2, 0.0), (0.2, 0.5), (0.12, 1.0), (0.0, 1.0)], seg=10, color=STEEL_DARK))
    parts.append(gbox(0.5, 0.9, -0.12, 0.74, 1.04, 0.12, '#2b2d42', 0.01))
    parts.append(gtube([(0.62, 1.0, 0.1), (0.62, 1.08, 0.2), (0.4, 1.08, 0.3), (0.2, 0.95, 0.38)], 0.018, seg=4, color='#1d1f22'))
    # depósito de combustible redondeado con cinchas y tapón
    tank = gbox(-hx + 0.4, 0.17, 0.46, 0.2, 0.62, hz - 0.06, '#e0a458', 0.07, 2)
    parts.append(tank)
    for x in (-hx + 0.6, 0.0):
        parts.append(gbox(x - 0.025, 0.17, 0.44, x + 0.025, 0.635, hz - 0.04, CAST))
    parts.append(gcyl(-0.1, 0.62, 0.6, 0.055, 0.05, 8, IRON))
    parts.append(gcyl(-0.1, 0.67, 0.6, 0.065, 0.02, 8, '#bc4749'))
    # escape: colector, codo, silencioso redondeado y salida con sombrerete
    parts.append(gtube([(-0.55, 0.95, 0.32), (-0.55, 1.12, 0.32), (-0.55, 1.2, 0.2), (-0.55, 1.24, 0.15)], 0.055, seg=6, color=STEEL_DARK))
    parts.append(lathe_along((-0.62, 1.32, 0.15), (-0.08, 1.32, 0.15), [(0.0, 0.0), (0.07, 0.0), (0.12, 0.08), (0.125, 0.2), (0.125, 0.8), (0.12, 0.92), (0.07, 1.0), (0.0, 1.0)], seg=10, color='#6c757d'))
    for x in (-0.48, -0.22):
        parts.append(lathe_along((x, 1.32, 0.15), (x + 0.03, 1.32, 0.15), [(0.12, 0.0), (0.135, 0.5), (0.12, 1.0)], seg=10, color=STEEL_DARK))
    parts.append(gcyl(-0.12, 1.32, 0.15, 0.05, 0.2, 8, STEEL_DARK))
    parts.append(between((-0.12, 1.52, 0.15 - 0.05), (-0.12, 1.555, 0.15 + 0.04), 0.045, 6, STEEL_DARK))
    # cuadro de mando sobre su pie, con dos relojes, piloto y seta de parada
    parts.append(gbox(0.3, 0.75, -hz + 0.05, 0.85, 1.12, -hz + 0.18, '#2b2d42', 0.015))
    parts.append(gbox(0.52, 0.16, -hz + 0.1, 0.6, 0.75, -hz + 0.16, '#2b2d42'))
    for x in (0.45, 0.6):
        parts.append(gcylz(x, 0.95, -hz + 0.03, -hz + 0.05, 0.055, 10, STEEL))
        parts.append(gcylz(x, 0.95, -hz + 0.026, -hz + 0.032, 0.045, 10, '#f3ead6'))
    parts.append(gcylz(0.76, 0.86, -hz + 0.02, -hz + 0.05, 0.035, 8, RED))
    return cf.model([up(o) for o in parts], 'prop_generador_movil')


# ---------------------------------------------------------------- motor

def motor():
    """Bancada del motor (1,8 × 0,9 × 1,6): chapa, largueros en I con pernos y armario del cuadro."""
    hx, hz = 1.8, 0.9
    parts = [gbox(-hx, 0, -hz, hx, 0.16, hz, IRON, 0.02, 1)]
    cf.jitter_colors(parts[0], 0.04, 5)
    parts.append(gbox(-hx + 0.03, 0.16, -hz + 0.03, hx - 0.03, 0.18, hz - 0.03, CAST))
    for z in (-hz + 0.15, hz - 0.15):
        parts.append(gbox(-hx + 0.1, 0.18, z - 0.08, hx - 0.1, 0.2, z + 0.08, CAST))
        parts.append(gbox(-hx + 0.1, 0.2, z - 0.02, hx - 0.1, 0.24, z + 0.02, CAST))
        parts.append(gbox(-hx + 0.1, 0.24, z - 0.08, hx - 0.1, 0.26, z + 0.08, CAST))
        for k in range(6):
            parts.append(gcyl(-hx + 0.25 + k * 0.62, 0.26, z, 0.025, 0.02, 6, STEEL))
    # armario del cuadro con puerta, bisagras, rejilla y asa (anclajes led y plaque en su frente)
    parts.append(gbox(-hx + 0.05, 0.18, -hz + 0.02, -hx + 0.35, 1.2, -hz + 0.22, '#2b2d42', 0.012))
    parts.append(gbox(-hx + 0.08, 0.24, -hz + 0.012, -hx + 0.32, 1.14, -hz + 0.03, '#353a4f', 0.006))
    for y in (0.35, 1.0):
        parts.append(gbox(-hx + 0.32, y, -hz + 0.008, -hx + 0.345, y + 0.07, -hz + 0.03, STEEL))
    for k in range(4):
        parts.append(gbox(-hx + 0.12, 0.8 + k * 0.035, -hz + 0.006, -hx + 0.28, 0.815 + k * 0.035, -hz + 0.012, '#1d1f22'))
    parts.append(gbox(-hx + 0.1, 0.55, -hz - 0.01, -hx + 0.12, 0.7, -hz + 0.012, STEEL))
    return cf.model(parts, 'prop_motor')


def motor_movil():
    """
    Motor diésel marino (lo que vibra), en coordenadas del prop y subido PIECE_LIFT: bloque verde
    con nervios, cuatro culatas con tapas rojas atornilladas, colector de escape oxidado con bridas,
    bomba de inyección con sus tubos, filtros, polea y correa delante, volante con taladros y
    acoplamiento al eje detrás. Mismas cotas que el procedimental.
    """
    L = PIECE_LIFT
    hx = 1.8
    body = '#4f6d5e'
    rust = 'rust'
    parts = []

    def up(ob):
        ob.location.z += L
        return cf.bake_transform(ob)
    blk = gbox(-hx + 0.4, 0.26, -0.55, hx - 0.5, 1.1, 0.55, body, 0.035, 2)
    cf.jitter_colors(blk, 0.03, 8)
    parts.append(blk)
    # cárter y nervios laterales
    parts.append(gbox(-hx + 0.45, 0.26, -0.5, hx - 0.55, 0.42, 0.5, '#3f5a4d', 0.02))
    for k in range(5):
        x = -hx + 0.62 + k * 0.6
        # nervios solo en la cara de la bomba (−z), la que se ve desde el pasillo
        parts.append(gbox(x - 0.025, 0.42, -0.567, x + 0.025, 1.05, -0.543, '#45604f'))
    # culatas, tapas de balancines y tornillos
    w = (2 * hx - 1.2) / 4
    for k in range(4):
        x = -hx + 0.55 + k * w
        parts.append(gbox(x, 1.1, -0.38, x + w - 0.08, 1.32, 0.38, '#43604f', 0.02))
        cover = gbox(x + 0.04, 1.32, -0.3, x + w - 0.12, 1.42, 0.3, '#c8553d', 0.03, 2)
        parts.append(cover)
        for dx, dz in ((0.09, -0.22), (w - 0.17, 0.22)):
            parts.append(gcyl(x + dx, 1.42, dz, 0.016, 0.02, 4, CAST))
        # tubo de inyección desde la bomba (lado −z)
        parts.append(gtube([(x + w * 0.45, 0.82, -0.62), (x + w * 0.45, 1.0, -0.62), (x + w * 0.45, 1.2, -0.45), (x + w * 0.45, 1.26, -0.38)], 0.012, seg=4, color=STEEL))
    # bomba de inyección y filtros
    parts.append(gbox(-hx + 0.6, 0.6, -0.68, hx - 1.2, 0.85, -0.55, '#2b2f33', 0.015))
    for x in (hx - 1.0, hx - 0.8):
        parts.append(glathe(x, 0.42, -0.66, [(0.0, 0.0), (0.06, 0.0), (0.07, 0.03), (0.07, 0.24), (0.05, 0.27), (0.0, 0.28)], seg=8, color='#e9c46a'))
    # tubería de combustible baja (como el procedimental)
    parts.append(gcylx(-hx + 0.6, hx - 0.8, 0.5, -0.65, 0.04, 6, STEEL))
    # colector de escape oxidado con bridas y codos
    parts.append(lathe_along((-hx + 0.6, 0.95, 0.68), (hx - 0.6, 0.95, 0.68), [(0.0, 0.0), (0.08, 0.0), (0.095, 0.02), (0.095, 0.98), (0.08, 1.0), (0.0, 1.0)], seg=10, color=rust))
    for k in range(4):
        x = -hx + 0.7 + k * 0.6
        parts.append(gtube([(x, 1.15, 0.38), (x, 1.12, 0.5), (x, 1.02, 0.6), (x, 0.97, 0.66)], 0.055, seg=6, color=rust))
        parts.append(gbox(x - 0.09, 1.08, 0.5, x + 0.09, 1.2, 0.56, '#8a4a1a'))
    # salida del escape: codo hacia el mamparo (+z), con su brida
    parts.append(gtube([(hx - 0.6, 0.95, 0.68), (hx - 0.45, 0.98, 0.7), (hx - 0.42, 1.2, 0.7), (hx - 0.42, 1.42, 0.72), (hx - 0.42, 1.52, 0.8), (hx - 0.42, 1.55, 0.95)], 0.08, seg=6, color=rust))
    parts.append(gcylz(hx - 0.42, 1.55, 0.93, 0.97, 0.12, 10, '#8a4a1a'))
    # delante (−x): tapa de distribución, polea, correa y eje
    parts.append(gbox(-hx + 0.3, 0.35, -0.42, -hx + 0.42, 1.05, 0.42, '#43604f', 0.02))
    parts.append(lathe_along((-hx + 0.1, 0.75, 0), (-hx + 0.3, 0.75, 0), [(0.0, 0.0), (0.2, 0.0), (0.22, 0.2), (0.17, 0.5), (0.22, 0.8), (0.2, 1.0), (0.0, 1.0)], seg=12, color='#2b2f33'))
    parts.append(lathe_along((-hx + 0.13, 0.98, 0.25), (-hx + 0.27, 0.98, 0.25), [(0.0, 0.0), (0.09, 0.0), (0.1, 0.5), (0.09, 1.0), (0.0, 1.0)], seg=10, color=STEEL_DARK))
    parts.append(gtube([(-hx + 0.2, 0.97, 0.17), (-hx + 0.2, 0.76, 0.2), (-hx + 0.2, 0.55, 0.0), (-hx + 0.2, 0.75, -0.2), (-hx + 0.2, 1.05, 0.25), (-hx + 0.2, 0.97, 0.33)], 0.018, seg=4, color='#1d1f22'))
    parts.append(gcylx(-hx - 0.15, -hx + 0.12, 0.75, 0, 0.09, 8, STEEL))
    # detrás (+x): volante con taladros, cárter del volante y acoplamiento con pernos
    parts.append(lathe_along((hx - 0.5, 0.75, 0), (hx - 0.38, 0.75, 0), [(0.0, 0.0), (0.5, 0.0), (0.5, 1.0), (0.0, 1.0)], seg=14, color='#3f5a4d'))
    parts.append(lathe_along((hx - 0.38, 0.75, 0), (hx - 0.22, 0.75, 0), [(0.0, 0.0), (0.55, 0.0), (0.55, 0.15), (0.48, 0.3), (0.48, 0.7), (0.55, 0.85), (0.55, 1.0), (0.0, 1.0)], seg=16, color=STEEL_DARK))
    for k in range(6):
        a = k / 6 * math.pi * 2
        parts.append(gcylx(hx - 0.225, hx - 0.215, 0.75 + math.sin(a) * 0.3, math.cos(a) * 0.3, 0.06, 5, '#1d1f22'))
    parts.append(lathe_along((hx - 0.22, 0.75, 0), (hx + 0.05, 0.75, 0), [(0.0, 0.0), (0.12, 0.0), (0.12, 0.4), (0.18, 0.45), (0.18, 0.6), (0.12, 0.65), (0.12, 1.0), (0.0, 1.0)], seg=10, color=STEEL))
    for k in range(6):
        a = k / 6 * math.pi * 2
        parts.append(gcylx(hx - 0.12, hx - 0.03, 0.75 + math.sin(a) * 0.15, math.cos(a) * 0.15, 0.018, 4, CAST))
    return cf.model([up(o) for o in parts], 'prop_motor_movil')


def build():
    timon()
    timon_rueda()
    bancal()
    deposito(1)
    deposito(2)
    deposito(3)
    generador()
    generador_movil()
    motor()
    motor_movil()
