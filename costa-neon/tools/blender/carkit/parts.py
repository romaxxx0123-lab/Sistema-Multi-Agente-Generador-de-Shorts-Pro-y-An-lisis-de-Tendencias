# Piezas separadas: internos de ópticas, lamas de parrilla, espejos, manijas, limpiaparabrisas,
# antena, emblemas, pasarruedas e interior. Cada pieza es un objeto con su material (rol del juego).
import math
import bpy
import bmesh
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

_MATS = {}


def mat(name):
    """Material por nombre (el nombre define el rol al exportar y el aspecto en los renders)."""
    if name in _MATS:
        return _MATS[name]
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    _MATS[name] = m
    return m


def obj_from(name, verts, faces, matname, smooth=True):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], [tuple(f) for f in faces])
    me.update()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    ob.data.materials.append(mat(matname))
    for p in me.polygons:
        p.use_smooth = smooth
    return ob


def bvh_of(bm):
    return BVHTree.FromBMesh(bm)


def ray(bvh, o, d, dist=10.0):
    d = Vector(d).normalized()
    loc, nrm, idx, dd = bvh.ray_cast(Vector(o), d, dist)
    return (loc, nrm) if loc is not None else (None, None)


# ------------------------------------------------------------------ primitivas
def superellipsoid(a, b, c, e=0.35, nu=24, nv=14, center=(0, 0, 0)):
    """Superelipsoide (caja redondeada suave). e→0 cuadrado, e=1 elipsoide."""
    verts, faces = [], []

    def sg(x, p):
        return math.copysign(abs(x) ** p, x)
    for j in range(nv + 1):
        v = -math.pi / 2 + math.pi * j / nv
        for i in range(nu):
            u = -math.pi + 2 * math.pi * i / nu
            x = a * sg(math.cos(v), e) * sg(math.cos(u), e)
            y = b * sg(math.cos(v), e) * sg(math.sin(u), e)
            z = c * sg(math.sin(v), e)
            verts.append((center[0] + x, center[1] + y, center[2] + z))
    for j in range(nv):
        for i in range(nu):
            a0 = j * nu + i
            a1 = j * nu + (i + 1) % nu
            b0 = (j + 1) * nu + i
            b1 = (j + 1) * nu + (i + 1) % nu
            faces.append((a0, a1, b1, b0))
    return verts, faces


def box(name, size, loc, matname, rot=(0, 0, 0), bevel=0.0, segments=3):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.name = name
    o.scale = size
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    o.data.materials.append(mat(matname))
    if bevel:
        b = o.modifiers.new('b', 'BEVEL')
        b.width = bevel
        b.segments = segments
        b.limit_method = 'NONE'
    for p in o.data.polygons:
        p.use_smooth = True
    return o


def ribbon(name, pts, nrms, width, matname, lift=0.0):
    """Cinta a lo largo de puntos 3D con normales (líneas LED, perfiles)."""
    verts, faces = [], []
    n = len(pts)
    for k in range(n):
        a = pts[max(0, k - 1)]
        b = pts[min(n - 1, k + 1)]
        t = (b - a)
        if t.length < 1e-9:
            t = Vector((1, 0, 0))
        t.normalize()
        w = t.cross(nrms[k]).normalized() * (width / 2)
        base = pts[k] + nrms[k] * lift
        verts += [base - w, base + w]
    for k in range(n - 1):
        faces.append((2 * k, 2 * k + 1, 2 * k + 3, 2 * k + 2))
    ob = obj_from(name, verts, faces, matname)
    return ob


def tube(name, pts, radius, matname, sides=8, closed=False):
    """Tubo a lo largo de una polilínea 3D (marcos, brazos)."""
    verts, faces = [], []
    n = len(pts)
    prev = None
    for k in range(n):
        a = pts[max(0, k - 1)]
        b = pts[min(n - 1, k + 1)]
        t = (b - a).normalized()
        ref = Vector((0, 0, 1)) if abs(t.z) < 0.9 else Vector((1, 0, 0))
        u = t.cross(ref).normalized()
        v = t.cross(u).normalized()
        for s in range(sides):
            ang = 2 * math.pi * s / sides
            verts.append(pts[k] + (u * math.cos(ang) + v * math.sin(ang)) * radius)
    for k in range(n - 1):
        for s in range(sides):
            a0 = k * sides + s
            a1 = k * sides + (s + 1) % sides
            faces.append((a0, a1, a1 + sides, a0 + sides))
    return obj_from(name, verts, faces, matname)


def cylinder(name, p0, p1, r0, r1=None, matname='trim', sides=20, cap0=True, cap1=True, capmat=None):
    r1 = r0 if r1 is None else r1
    ax = (p1 - p0)
    t = ax.normalized()
    ref = Vector((0, 0, 1)) if abs(t.z) < 0.9 else Vector((1, 0, 0))
    u = t.cross(ref).normalized()
    v = t.cross(u).normalized()
    verts, faces = [], []
    for s in range(sides):
        ang = 2 * math.pi * s / sides
        d = u * math.cos(ang) + v * math.sin(ang)
        verts.append(p0 + d * r0)
        verts.append(p1 + d * r1)
    for s in range(sides):
        a0, a1 = 2 * s, 2 * s + 1
        b0, b1 = 2 * ((s + 1) % sides), 2 * ((s + 1) % sides) + 1
        faces.append((a0, b0, b1, a1))
    ob = obj_from(name, verts, faces, matname)
    caps = []
    if cap1:
        cv = [p1 + (u * math.cos(2 * math.pi * s / sides) + v * math.sin(2 * math.pi * s / sides)) * r1 for s in range(sides)]
        caps.append(obj_from(name + '_cap', cv + [p1], [(s, (s + 1) % sides, sides) for s in range(sides)], capmat or matname))
    if cap0:
        cv = [p0 + (u * math.cos(2 * math.pi * s / sides) + v * math.sin(2 * math.pi * s / sides)) * r0 for s in range(sides)]
        caps.append(obj_from(name + '_cap0', cv + [p0], [((s + 1) % sides, s, sides) for s in range(sides)], matname))
    return [ob] + caps


def mirror_obj(ob):
    """Copia espejada en X (lado izquierdo) con caras invertidas."""
    me = ob.data.copy()
    me.transform(Matrix.Scale(-1, 4, (1, 0, 0)))
    me.flip_normals()
    o2 = bpy.data.objects.new(ob.name + '_L', me)
    bpy.context.scene.collection.objects.link(o2)
    return o2
