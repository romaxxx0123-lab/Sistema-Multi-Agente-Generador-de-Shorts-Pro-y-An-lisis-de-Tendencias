"""
Biblioteca común de los modelos de Ciudad Flotante hechos con Blender (módulo bpy, sin interfaz).

Cada archivo de `models/` define `build()`, que crea en la escena uno o varios objetos raíz; el
nombre de cada raíz es el nombre del modelo en el juego (`modelGeometry('sofa')`) y debe ser único
entre todos los archivos. `build.py` exporta cada archivo a `src/assets/models/<archivo>.glb`.

CONVENCIONES (las mismas que el juego):
- Metros. Blender es Z-arriba y el exportador glTF pasa a Y-arriba: Blender (x, y, z) → juego
  (x, z, −y). El «frente» de un mueble del juego (−z local, hacia donde se usa) es +Y en Blender.
- Origen en la base del objeto (apoyado en z = 0) y centrado en x/y salvo que el modelo diga otra cosa.
- Low-poly con sombreado plano. Los modelos estáticos llevan color por vértice (atributo 'Col',
  lineal, con la paleta del juego: palette.json, generado desde src/render/palette.ts) y ningún
  material: el juego los fusiona en sus mallas de color por vértice (GeoBuilder.appendGeometry).
- Los modelos con materiales (p. ej. personajes recoloreables) usan materiales con nombre estable
  (skin, shirt, pants, hair…) que el juego sustituye por los suyos.
- Todo debe ser determinista: nada de aleatoriedad sin semilla (usa `rng(semilla)`).
"""
import json
import math
import os
import random

import bpy  # primero: con bpy como módulo, bmesh y mathutils existen tras importarlo
import bmesh
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(HERE, 'palette.json'), encoding='utf-8') as _f:
    PALETTE = json.load(_f)

COLOR_ATTR = 'Col'


# ---------------------------------------------------------------- escena

def reset():
    """Escena vacía (y complementos por defecto, entre ellos el exportador glTF)."""
    bpy.ops.wm.read_factory_settings(use_empty=True)


def rng(seed):
    """Generador aleatorio determinista para variaciones (vetas, tornillos, desgaste)."""
    return random.Random(seed)


def roots():
    """Objetos raíz de la escena (los que se exportan como modelos)."""
    return [o for o in bpy.context.scene.objects if o.parent is None]


# ---------------------------------------------------------------- color

def _srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def rgba(c, f=1.0):
    """
    Color lineal RGBA a partir de '#rrggbb', una clave de la paleta ('deckWood', 'skins.2') o una
    tupla sRGB 0..1. `f` aclara (>1) u oscurece (<1) en espacio lineal, igual que `shade()` del juego.
    """
    if isinstance(c, str):
        if not c.startswith('#'):
            key, _, idx = c.partition('.')
            v = PALETTE[key]
            c = v[int(idx)] if idx else v
        h = c.lstrip('#')
        rgb = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    else:
        rgb = list(c)[:3]
    return tuple(min(1.0, _srgb_to_linear(x) * f) for x in rgb) + (1.0,)


def _color_layer(me):
    attr = me.color_attributes.get(COLOR_ATTR)
    if attr is None:
        attr = me.color_attributes.new(COLOR_ATTR, 'FLOAT_COLOR', 'CORNER')
    me.color_attributes.active_color = attr
    me.color_attributes.render_color_index = me.color_attributes.find(COLOR_ATTR)
    return attr


def paint(ob, color, where=None, f=1.0):
    """
    Pinta las caras de `ob` (todas, o las que cumplan `where(poly)`, que recibe el polígono con
    `normal` y `center` en coordenadas locales). Devuelve el objeto.
    """
    me = ob.data
    attr = _color_layer(me)
    c = rgba(color, f)
    for poly in me.polygons:
        if where is None or where(poly):
            for li in poly.loop_indices:
                attr.data[li].color = c
    return ob


def paint_faces(ob, top=None, side=None, bottom=None, threshold=0.6):
    """Atajo: colores distintos para tapas superiores, laterales e inferiores (como FaceColors)."""
    if side is not None:
        paint(ob, side)
    if top is not None:
        paint(ob, top, lambda p: p.normal.z > threshold)
    if bottom is not None:
        paint(ob, bottom, lambda p: p.normal.z < -threshold)
    return ob


def jitter_colors(ob, amount=0.06, seed=1):
    """Variación determinista de brillo por cara (madera vieja, chapa desigual); depende de la
    posición de cada cara, no de su orden."""
    me = ob.data
    attr = _color_layer(me)
    for poly in me.polygons:
        c = poly.center
        r = rng(hash((seed, round(c.x, 4), round(c.y, 4), round(c.z, 4))) & 0x7FFFFFFF)
        k = 1.0 + (r.random() * 2 - 1) * amount
        for li in poly.loop_indices:
            c = attr.data[li].color
            attr.data[li].color = (min(1, c[0] * k), min(1, c[1] * k), min(1, c[2] * k), 1.0)
    return ob


# ---------------------------------------------------------------- primitivas

def _canonical(bm):
    """Orden canónico de vértices y caras (por posición): algunas operaciones de bmesh dejan un
    orden que cambia de una ejecución a otra, y el .glb no sería reproducible."""
    def key(co):
        return (round(co.z, 5), round(co.y, 5), round(co.x, 5))

    vrank = {v: i for i, v in enumerate(sorted(bm.verts, key=lambda v: key(v.co)))}
    bm.verts.sort(key=lambda v: vrank[v])
    frank = {f: i for i, f in enumerate(sorted(bm.faces, key=lambda f: key(f.calc_center_median()) + (len(f.verts),)))}
    bm.faces.sort(key=lambda f: frank[f])
    bm.verts.index_update()
    bm.faces.index_update()


def _link(name, bm):
    _canonical(bm)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def _xf(bm, at=(0, 0, 0), rot=(0, 0, 0), scale=None):
    if scale is not None:
        bmesh.ops.scale(bm, vec=scale, verts=bm.verts)
    if any(rot):
        m = Matrix.Rotation(math.radians(rot[0]), 4, 'X')
        m = Matrix.Rotation(math.radians(rot[1]), 4, 'Y') @ m
        m = Matrix.Rotation(math.radians(rot[2]), 4, 'Z') @ m
        bmesh.ops.transform(bm, matrix=m, verts=bm.verts)
    if any(at):
        bmesh.ops.translate(bm, vec=Vector(at), verts=bm.verts)


def box(size, at=(0, 0, 0), color='metal', rot=(0, 0, 0), name='caja', base=True):
    """Caja de tamaño (sx, sy, sz). Con `base` el origen queda en el centro de la cara inferior."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=size, verts=bm.verts)
    if base:
        bmesh.ops.translate(bm, vec=(0, 0, size[2] / 2), verts=bm.verts)
    _xf(bm, at, rot)
    return paint(_link(name, bm), color)


def cylinder(r, h, seg=8, at=(0, 0, 0), color='metal', r2=None, rot=(0, 0, 0), name='cilindro', cap=True):
    """Cilindro (o tronco de cono con `r2`) de eje Z apoyado en z = 0; `rot` en grados."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=cap, cap_tris=False, segments=seg, radius1=r, radius2=r if r2 is None else r2, depth=h)
    bmesh.ops.translate(bm, vec=(0, 0, h / 2), verts=bm.verts)
    _xf(bm, at, rot)
    return paint(_link(name, bm), color)


def sphere(r, at=(0, 0, 0), color='metal', subdiv=1, scale=None, name='esfera'):
    """Icosfera low-poly centrada en `at` (subdiv 1 = 80 caras)."""
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=r)
    _xf(bm, at, (0, 0, 0), scale)
    return paint(_link(name, bm), color)


def prism(points, h, at=(0, 0, 0), color='metal', rot=(0, 0, 0), name='prisma'):
    """Extruye en Z (de 0 a h) el polígono 2D `points` [(x, y), …] en sentido antihorario."""
    bm = bmesh.new()
    verts = [bm.verts.new((x, y, 0)) for x, y in points]
    face = bm.faces.new(verts)
    if face.normal.z > 0:
        face.normal_flip()
    ext = bmesh.ops.extrude_face_region(bm, geom=[face])
    top = [e for e in ext['geom'] if isinstance(e, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, vec=(0, 0, h), verts=top)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    _xf(bm, at, rot)
    return paint(_link(name, bm), color)


def lathe(profile, seg=10, at=(0, 0, 0), color='metal', rot=(0, 0, 0), name='torno'):
    """
    Sólido de revolución alrededor de Z a partir del perfil [(radio, z), …] de abajo arriba
    (barriles, cubos, lámparas, macetas). Un radio 0 en un extremo cierra la tapa.
    """
    bm = bmesh.new()
    verts = [bm.verts.new((r, 0, z)) for r, z in profile]
    edges = [bm.edges.new((a, b)) for a, b in zip(verts, verts[1:])]
    bmesh.ops.spin(bm, geom=verts + edges, cent=(0, 0, 0), axis=(0, 0, 1), angle=2 * math.pi, steps=seg, use_merge=True)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.dissolve_degenerate(bm, dist=1e-6, edges=bm.edges)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    _xf(bm, at, rot)
    return paint(_link(name, bm), color)


def tube(points, r, seg=6, color='rope', name='tubo', cap=True):
    """Tubo (cuerda, cable, tubería curvada) a lo largo de la polilínea `points` [(x, y, z), …]."""
    cu = bpy.data.curves.new(name, 'CURVE')
    cu.dimensions = '3D'
    cu.bevel_depth = r
    cu.bevel_resolution = max(0, (seg - 4) // 2)
    cu.use_fill_caps = cap
    sp = cu.splines.new('POLY')
    sp.points.add(len(points) - 1)
    for p, (x, y, z) in zip(sp.points, points):
        p.co = (x, y, z, 1)
    tmp = bpy.data.objects.new(name + '_curva', cu)
    bpy.context.scene.collection.objects.link(tmp)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(tmp.evaluated_get(dg))
    bpy.data.objects.remove(tmp)
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return paint(ob, color)


def torus(R, r, seg=12, tube_seg=5, at=(0, 0, 0), color='metal', rot=(0, 0, 0), name='toro'):
    """Toro (rueda de timón, rollo de cuerda, salvavidas) en el plano XY."""
    bm = bmesh.new()
    rings = []
    for i in range(seg):
        a = 2 * math.pi * i / seg
        ring = []
        for j in range(tube_seg):
            b = 2 * math.pi * j / tube_seg
            d = R + r * math.cos(b)
            ring.append(bm.verts.new((d * math.cos(a), d * math.sin(a), r * math.sin(b))))
        rings.append(ring)
    for i in range(seg):
        a, b = rings[i], rings[(i + 1) % seg]
        for j in range(tube_seg):
            k = (j + 1) % tube_seg
            bm.faces.new((a[j], b[j], b[k], a[k]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    _xf(bm, at, rot)
    return paint(_link(name, bm), color)


# ---------------------------------------------------------------- modificadores y acabado

def bevel(ob, width=0.015, segments=1, angle=40):
    """Biselado suave de aristas vivas (lo que hace que un mueble no parezca una caja de prueba)."""
    m = ob.modifiers.new('bisel', 'BEVEL')
    m.width = width
    m.segments = segments
    m.limit_method = 'ANGLE'
    m.angle_limit = math.radians(angle)
    m.harden_normals = False
    return apply_modifiers(ob)


def apply_modifiers(ob):
    """Aplica la pila de modificadores conservando el color por vértice."""
    if not ob.modifiers:
        return ob
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
    old = ob.data
    ob.modifiers.clear()
    ob.data = me
    if old.users == 0:
        bpy.data.meshes.remove(old)
    return ob


def bake_transform(ob):
    """Lleva la transformación del objeto a sus vértices (matriz identidad)."""
    if ob.type == 'MESH':
        ob.data.transform(ob.matrix_basis)
        ob.matrix_basis = Matrix.Identity(4)
    return ob


def join(objs, name):
    """Une varias mallas en un solo objeto llamado `name` (aplica modificadores y transformaciones)."""
    objs = [apply_modifiers(bake_transform(o)) for o in objs]
    with bpy.context.temp_override(active_object=objs[0], selected_editable_objects=objs, selected_objects=objs):
        bpy.ops.object.join()
    ob = objs[0]
    ob.name = name
    ob.data.name = name
    return ob


def flat(ob):
    """Sombreado plano (caras facetadas, estilo low-poly)."""
    for p in ob.data.polygons:
        p.use_smooth = False
    return ob


def finish(ob, name=None):
    """Deja un modelo listo para exportar: modificadores aplicados, transformación en los vértices,
    sombreado plano y color por vértice garantizado (blanco si faltaba)."""
    apply_modifiers(ob)
    bake_transform(ob)
    flat(ob)
    if ob.data.color_attributes.get(COLOR_ATTR) is None:
        paint(ob, '#ffffff')
    if name:
        ob.name = name
        ob.data.name = name
    return ob


def model(parts, name):
    """Une `parts` en el modelo raíz `name` y lo deja terminado."""
    return finish(join(parts, name), name)


def triangles(ob):
    return sum(len(p.vertices) - 2 for p in ob.data.polygons) if ob.type == 'MESH' else 0


def bounds(ob):
    """Caja envolvente (min, max) en coordenadas de Blender."""
    pts = [ob.matrix_world @ Vector(c) for c in ob.bound_box]
    lo = tuple(min(p[i] for p in pts) for i in range(3))
    hi = tuple(max(p[i] for p in pts) for i in range(3))
    return lo, hi


# ---------------------------------------------------------------- exportación

def export_glb(path, animations=False, **options):
    """Exporta la escena a GLB (Y-arriba, normales, color por vértice; materiales solo si los hay).
    `options`: opciones extra del exportador glTF de Blender (EXPORT_OPTIONS del archivo del modelo)."""
    has_materials = any(o.type == 'MESH' and len(o.data.materials) > 0 for o in bpy.context.scene.objects)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format='GLB',
        use_selection=False,
        export_apply=True,
        export_yup=True,
        export_normals=True,
        export_texcoords=False,
        export_materials='EXPORT' if has_materials else 'NONE',
        export_vertex_color='ACTIVE',
        export_all_vertex_colors=False,
        export_animations=animations,
        export_skins=True,
        export_morph=False,
        export_image_format='NONE',
        **options,
    )
