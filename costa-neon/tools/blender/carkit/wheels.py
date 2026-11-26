# Ruedas modeladas como las reales, en metros:
#   neumático: perfil de un neumático de perfil bajo (pestaña sobre la llanta, protector de llanta, flanco
#              abombado, hombro redondeado y banda con cuatro surcos) girado alrededor del eje;
#   llanta:    labio y barril, rayos con concavidad (cara mecanizada brillante, costados pintados), maza con
#              bulones y tapa central;
#   freno:     disco con campana y pinza fija.
# El eje de la rueda es X; la cara exterior mira hacia +X. build_all(D) arma las cuatro en su lugar.
import math
import bpy, bmesh
from mathutils import Vector, Matrix
from . import parts as P

TAU = 2 * math.pi
# calidad: 1.0 para renders; el juego usa menos segmentos (cientos de ruedas instanciadas)
QUALITY = {'lathe': 1.0, 'spoke': (16, 6)}


def _mesh(name, verts, faces, mats, face_mats, smooth_angle=40):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    for m in mats:
        me.materials.append(P.mat(m))
    for p, mi in zip(me.polygons, face_mats):
        p.material_index = mi
        p.use_smooth = True
    me.use_auto_smooth = True
    me.auto_smooth_angle = math.radians(smooth_angle)
    me.validate()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def lathe(name, prof, mat, seg=96, smooth_angle=50):
    """Superficie de revolución de un perfil [(r, x)] alrededor del eje X."""
    seg = max(16, int(seg * QUALITY['lathe']))
    verts, faces = [], []
    n = len(prof)
    for i in range(seg):
        a = TAU * i / seg
        ca, sa = math.cos(a), math.sin(a)
        for (r, x) in prof:
            verts.append((x, r * ca, r * sa))
    for i in range(seg):
        i2 = (i + 1) % seg
        for j in range(n - 1):
            a, b = i * n + j, i * n + j + 1
            c, d = i2 * n + j + 1, i2 * n + j
            faces.append((a, b, c, d))
    return _mesh(name, verts, faces, [mat], [0] * len(faces), smooth_angle)


def tire(R, Rr, W, seg=128):
    """Perfil real: Rr radio del asiento de la llanta, R radio exterior, W ancho de sección."""
    H = R - Rr
    Rf = Rr + 0.017                      # borde de la pestaña de la llanta
    h = W / 2
    side = [(Rf - 0.004, h * 0.93), (Rf + 0.003, h * 1.0), (Rf + 0.009, h * 1.035), (Rf + 0.014, h * 1.02),
            (Rr + H * 0.42, h * 0.995), (Rr + H * 0.55, h * 1.0), (Rr + H * 0.68, h * 0.99), (Rr + H * 0.80, h * 0.955),
            (R - 0.013, h * 0.885), (R - 0.0055, h * 0.815), (R - 0.0012, h * 0.74)]
    # banda: surcos de 10 mm y 7 mm de profundidad (dos a cada lado del centro)
    gw, gd = 0.0052, 0.007
    centers = [h * 0.56, h * 0.20]
    tread_pts = [(R, h * 0.70)]
    for c in centers:
        tread_pts += [(R, c + gw + 0.001), (R - gd, c + gw), (R - gd, c - gw), (R, c - gw - 0.001)]
    tread_pts += [(R + 0.0006, 0.0)]
    half = side + tread_pts
    full = half + [(r, -x) for (r, x) in reversed(half[:-1])]
    # el perfil va de la pestaña exterior por la banda hasta la pestaña interior
    return lathe('tire', full, 'tire', seg, 35)


def rim_lip(Rr, Wr):
    """Labio exterior (mecanizado) y barril."""
    Rf = Rr + 0.017
    x0 = Wr / 2
    # labio angosto: sólo el borde exterior (≈1 cm) queda mecanizado; el resto es la pestaña pintada
    lip = [(Rr - 0.012, x0 - 0.012), (Rr - 0.004, x0 - 0.004), (Rr + 0.004, x0), (Rf - 0.004, x0 + 0.004), (Rf + 0.001, x0 + 0.009),
           (Rf - 0.002, x0 + 0.014), (Rf - 0.010, x0 + 0.0135), (Rr + 0.002, x0 + 0.010), (Rr - 0.010, x0 + 0.004)]
    a = lathe('rim_lip', lip, 'rim_paint', 128, 30)
    edge = [(Rf - 0.0035, x0 + 0.0095), (Rf + 0.0012, x0 + 0.0105), (Rf - 0.001, x0 + 0.0125)]
    a2 = lathe('rim_edge', edge, 'rim_face', 128, 60)
    barrel = [(Rr - 0.012, x0 - 0.012), (Rr - 0.014, x0 - 0.04), (Rr - 0.014, -x0 + 0.02), (Rr, -x0), (Rf, -x0 - 0.008)]
    b = lathe('rim_barrel', barrel, 'rim_paint', 96, 30)
    return [a, a2, b]


def spoke(name, r0, r1, ang, half_w, dish, thick, crown=0.003, nt=None, nu=None):
    """Rayo como cinta gruesa: ang(t) y half_w(t) dan el eje y el semiancho; dish(t) la profundidad de la cara."""
    nt = nt or QUALITY['spoke'][0]
    nu = nu or QUALITY['spoke'][1]
    verts, faces, fm = [], [], []
    rows = []
    for i in range(nt + 1):
        t = i / nt
        r = r0 + (r1 - r0) * t
        a, w = ang(t), half_w(t)
        row_f, row_b = [], []
        for j in range(nu + 1):
            u = -1 + 2 * j / nu
            aa = a + u * w / r
            y, z = r * math.cos(aa), r * math.sin(aa)
            xf = dish(t) + crown * (1 - u * u)
            row_f.append(len(verts)); verts.append((xf, y, z))
            row_b.append(len(verts)); verts.append((dish(t) - thick, y, z))
        rows.append((row_f, row_b))
    for i in range(nt):
        (fa, ba), (fb, bb) = rows[i], rows[i + 1]
        for j in range(nu):
            faces.append((fa[j], fb[j], fb[j + 1], fa[j + 1])); fm.append(0)        # cara (mecanizada)
            faces.append((ba[j], ba[j + 1], bb[j + 1], bb[j])); fm.append(1)        # dorso
        faces.append((fa[0], ba[0], bb[0], fb[0])); fm.append(1)                    # costados pintados
        faces.append((fa[nu], fb[nu], bb[nu], ba[nu])); fm.append(1)
    # tapa del extremo exterior (queda bajo el labio) para que no se vea hueco
    fa, ba = rows[-1]
    for j in range(nu):
        faces.append((fa[j], fa[j + 1], ba[j + 1], ba[j])); fm.append(1)
    return _mesh(name, verts, faces, ['rim_face', 'rim_paint'], fm, 35)


def rim(style, Rr, Wr, spec_w=(0.0085, 0.014)):
    objs = rim_lip(Rr, Wr)
    x_lip = Wr / 2 - 0.006
    r_hub, r_rim = 0.074, Rr - 0.012
    if style == 'double5':
        # cinco rayos dobles cóncavos: nacen juntos en la maza y se abren hacia el labio
        x_hub = x_lip - 0.042
        dish = lambda t: x_hub + (x_lip - x_hub) * (t ** 1.5)
        for p in range(5):
            A = math.pi / 2 + p * TAU / 5
            for s in (-1, 1):
                ang = (lambda A, s: (lambda t: A + s * math.radians(3.6 + 6.4 * t)))(A, s)
                w0, w1 = spec_w
                hw = (lambda w0, w1: (lambda t: w0 + (w1 - w0) * t))(w0, w1)
                objs.append(spoke('spoke', r_hub - 0.004, r_rim, ang, hw, dish, 0.022))
        hub_x = x_hub
    elif style == 'multi10':
        x_hub = x_lip - 0.02
        dish = lambda t: x_hub + (x_lip - x_hub) * t
        for p in range(10):
            A = math.pi / 2 + p * TAU / 10
            objs.append(spoke('spoke', r_hub - 0.004, r_rim, (lambda A: lambda t: A)(A), lambda t: 0.009 + 0.004 * t, dish, 0.02))
        hub_x = x_hub
    else:  # 'five': cinco rayos anchos
        x_hub = x_lip - 0.03
        dish = lambda t: x_hub + (x_lip - x_hub) * (t ** 1.3)
        for p in range(5):
            A = math.pi / 2 + p * TAU / 5
            objs.append(spoke('spoke', r_hub - 0.004, r_rim, (lambda A: lambda t: A)(A), lambda t: 0.016 + 0.012 * t, dish, 0.024))
        hub_x = x_hub
    # maza: disco, cinco bulones (PCD 120) entre los rayos y tapa central
    hub = [(0.0, hub_x - 0.002), (0.050, hub_x - 0.001), (r_hub, hub_x - 0.004), (r_hub + 0.004, hub_x - 0.018),
           (r_hub, hub_x - 0.03), (0.0, hub_x - 0.03)]
    objs.append(lathe('rim_hub', hub, 'rim_paint', 64, 40))
    for p in range(5):
        a = math.pi / 2 + (p + 0.5) * TAU / 5
        c = Vector((hub_x - 0.012, 0.060 * math.cos(a), 0.060 * math.sin(a)))
        # bulón hundido en su alojamiento (sólo asoma la cabeza dentro del agujero oscuro)
        objs += P.cylinder('lug_hole', c + Vector((0.009, 0, 0)), c + Vector((0.0115, 0, 0)), 0.0125, 0.0125, 'disc_hat', 16, False, True)
        objs += P.cylinder('lug', c, c + Vector((0.008, 0, 0)), 0.0095, 0.009, 'hub', 6, False, True)
    cap = [(0.0, hub_x + 0.009), (0.018, hub_x + 0.008), (0.027, hub_x + 0.004), (0.029, hub_x - 0.002)]
    objs.append(lathe('rim_cap', cap, 'cap', 48, 60))
    ring = [(0.026, hub_x + 0.0045), (0.0295, hub_x + 0.003), (0.0305, hub_x - 0.002)]
    objs.append(lathe('rim_cap_ring', ring, 'rim_face', 48, 60))
    return objs


def brake(Rd, x_disc=-0.02, front=True):
    objs = []
    th = 0.03 if front else 0.022
    disc = [(0.085, x_disc + th / 2), (Rd, x_disc + th / 2), (Rd + 0.001, x_disc), (Rd, x_disc - th / 2), (0.085, x_disc - th / 2)]
    objs.append(lathe('disc', disc, 'disc', 96, 30))
    hat = [(0.0, x_disc + 0.055), (0.07, x_disc + 0.055), (0.085, x_disc + 0.045), (0.088, x_disc + th / 2)]
    objs.append(lathe('disc_hat', hat, 'disc_hat', 48, 40))
    # pinza: bloque curvo que abraza el borde del disco, detrás del eje (arriba hacia atrás)
    verts, faces = [], []
    a0, a1 = math.radians(100), math.radians(150)
    ri, ro = Rd - 0.055, Rd + 0.012
    xs = (x_disc - th / 2 - 0.028, x_disc + th / 2 + 0.03)
    na = 8
    for i in range(na + 1):
        a = a0 + (a1 - a0) * i / na
        for r in (ri, ro):
            for x in xs:
                verts.append((x, r * math.cos(a), r * math.sin(a)))
    for i in range(na):
        b0, b1 = i * 4, (i + 1) * 4
        # índices: (ri,x0)=0 (ri,x1)=1 (ro,x0)=2 (ro,x1)=3
        faces += [(b0 + 1, b1 + 1, b1 + 3, b0 + 3), (b0, b0 + 2, b1 + 2, b1), (b0 + 2, b0 + 3, b1 + 3, b1 + 2), (b0, b1, b1 + 1, b0 + 1)]
    faces += [(0, 1, 3, 2), (na * 4, na * 4 + 2, na * 4 + 3, na * 4 + 1)]
    objs.append(_mesh('caliper', verts, faces, ['caliper'], [0] * len(faces), 35))
    return objs


def wheel(spec, R):
    """Una rueda completa en el origen (cara exterior hacia +X)."""
    Rr = spec.get('rim_d', 0.4826) / 2
    W = spec.get('tire_w', 0.235)
    Wr = spec.get('rim_w', 8.0 * 0.0254)
    objs = [tire(R, Rr, W)]
    objs += rim(spec.get('style', 'double5'), Rr, Wr, tuple(spec.get('spoke_w', (0.0085, 0.014))))
    objs += brake(spec.get('disc_r', min(0.17, Rr - 0.06)))
    return objs


def build_all(D):
    """Las cuatro ruedas en su lugar (centros en ±trocha/2, ±batalla/2, radio)."""
    spec = D.get('wheel', {})
    proto = wheel(spec, D['wr'])
    out = []
    for sx in (1, -1):
        for sy in (1, -1):
            for o in proto:
                c = o.copy()
                c.data = o.data
                bpy.context.scene.collection.objects.link(c)
                # lado izquierdo: media vuelta alrededor de Z (la cara exterior queda hacia -X)
                c.matrix_world = Matrix.Translation((sx * D['track'] / 2, sy * D['wb'] / 2, D['wr'])) @ \
                    (Matrix.Identity(4) if sx > 0 else Matrix.Rotation(math.pi, 4, 'Z'))
                out.append(c)
    for o in proto:
        bpy.data.objects.remove(o, do_unlink=True)
    return out
