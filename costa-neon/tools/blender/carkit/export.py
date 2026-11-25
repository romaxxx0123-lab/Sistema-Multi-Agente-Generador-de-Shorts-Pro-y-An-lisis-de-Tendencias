# Exportación al juego: un nodo por rol (pintura, molduras con albedo por vértice, vidrio, lente,
# cromo, faros, pilotos, giros) en glb + metadatos (ruedas, asiento, patentes).
import os
import json
import bpy
import bmesh

ROLE = {'paint': 'paint', 'glass': 'glass', 'lens': 'lens', 'chrome': 'chrome', 'refl': 'chrome', 'reverse': 'chrome',
        'head': 'head', 'tail': 'tail', 'tail_lit': 'tail', 'blink': 'blink', 'extra': 'extra'}
# albedo lineal de las molduras (se hornea en el color de vértice)
ALBEDO = {
    'under': (0.018, 0.018, 0.019), 'frame': (0.012, 0.012, 0.013), 'trim': (0.014, 0.014, 0.015),
    'trim_gloss': (0.008, 0.008, 0.009), 'gap': (0.002, 0.002, 0.002), 'inner': (0.045, 0.044, 0.042),
    'liner': (0.012, 0.012, 0.012), 'seat': (0.04, 0.032, 0.027), 'dash': (0.02, 0.02, 0.021),
    'screen': (0.004, 0.006, 0.01), 'carpet': (0.022, 0.021, 0.02),
}


def mat_base(name):
    return name.split('.')[0]


def apply_modifiers(objs):
    for o in objs:
        if o.type != 'MESH' or not o.modifiers:
            continue
        for x in bpy.context.view_layer.objects:
            x.select_set(False)
        bpy.context.view_layer.objects.active = o
        o.select_set(True)
        for m in list(o.modifiers):
            bpy.ops.object.modifier_apply(modifier=m.name)


def bake_ao(objs, D, distance=0.5, samples=48):
    """Oclusión ambiental horneada por vértice (Cycles) con piso y ruedas como oclusores temporales."""
    import math
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = samples
    if not sc.world:
        sc.world = bpy.data.worlds.new('bake_w')
    sc.world.light_settings.distance = distance
    temp = []
    bpy.ops.mesh.primitive_plane_add(size=30, location=(0, 0, 0))
    temp.append(bpy.context.active_object)
    for sx in (-1, 1):
        for sy in (-1, 1):
            bpy.ops.mesh.primitive_cylinder_add(radius=D['wr'], depth=D['tire_w'], vertices=32,
                                                location=(sx * D['track'] / 2, sy * D['wb'] / 2, D['wr']), rotation=(0, math.pi / 2, 0))
            temp.append(bpy.context.active_object)
    targets = [o for o in objs if o.type == 'MESH' and o.data.polygons]
    for o in targets:
        me = o.data
        a = me.color_attributes.get('AO') or me.color_attributes.new('AO', 'FLOAT_COLOR', 'POINT')
        me.color_attributes.active_color = a
    for x in bpy.context.view_layer.objects:
        x.select_set(x in targets)
    bpy.context.view_layer.objects.active = targets[0]
    sc.render.bake.target = 'VERTEX_COLORS'
    bpy.ops.object.bake(type='AO')
    for t in temp:
        bpy.data.objects.remove(t, do_unlink=True)


def collect(objs):
    """Separa cada objeto por material y agrupa por rol."""
    groups = {}
    for o in objs:
        if o.type != 'MESH':
            continue
        bpy.context.view_layer.objects.active = o
        for x in bpy.context.view_layer.objects:
            x.select_set(False)
        o.select_set(True)
        for m in list(o.modifiers):
            bpy.ops.object.modifier_apply(modifier=m.name)
        pieces = [o]
        if len(o.data.materials) > 1:
            bpy.ops.object.mode_set(mode='EDIT')
            bpy.ops.mesh.separate(type='MATERIAL')
            bpy.ops.object.mode_set(mode='OBJECT')
            pieces = list(bpy.context.selected_objects)
        for p in pieces:
            if not p.data.materials or not p.data.polygons:
                continue
            mn = mat_base(p.data.materials[0].name)
            role = ROLE.get(mn, 'trim')
            if role == 'blink':
                xs = [v.co.x for v in p.data.vertices]
                role = 'blinkR' if sum(xs) / len(xs) > 0 else 'blinkL'
            col = ALBEDO.get(mn, (1.0, 1.0, 1.0)) if role == 'trim' else (1.0, 1.0, 1.0)
            me = p.data
            ao = me.color_attributes.get('AO')
            aov = [d.color[0] for d in ao.data] if ao and ao.domain == 'POINT' else None
            attr = me.color_attributes.get('Col') or me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
            for i, d in enumerate(attr.data):
                # alfa = oclusión (el juego la usa para la luz indirecta)
                d.color = (col[0], col[1], col[2], aov[i] if aov else 1.0)
            if ao:
                me.color_attributes.remove(ao)
            me.color_attributes.active_color = me.color_attributes['Col']
            groups.setdefault(role, []).append(p)
    return groups


def join_groups(groups):
    out = {}
    for role, lst in groups.items():
        for x in bpy.context.view_layer.objects:
            x.select_set(False)
        for p in lst:
            p.select_set(True)
        bpy.context.view_layer.objects.active = lst[0]
        if len(lst) > 1:
            bpy.ops.object.join()
        j = bpy.context.view_layer.objects.active
        j.name = role
        j.data.name = role
        out[role] = j
    return out


def tri_count(o):
    return sum(len(p.vertices) - 2 for p in o.data.polygons)


LOD1_BUDGET = {'paint': 5200, 'trim': 3600, 'glass': 500, 'lens': 260, 'chrome': 700, 'head': 260, 'tail': 420,
               'blinkL': 80, 'blinkR': 80, 'extra': 300}


def decimate(o, budget, src_normals=None, symmetric=True):
    """Decimación por colapso hasta 'budget' triángulos; normales tomadas de src_normals si se da."""
    for x in bpy.context.view_layer.objects:
        x.select_set(False)
    bpy.context.view_layer.objects.active = o
    o.select_set(True)
    if tri_count(o) > budget:
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.mesh.quads_convert_to_tris()
        bpy.ops.object.mode_set(mode='OBJECT')
        dec = o.modifiers.new('dec', 'DECIMATE')
        dec.decimate_type = 'COLLAPSE'
        dec.ratio = max(0.02, budget / tri_count(o))
        dec.use_symmetry = symmetric
        dec.symmetry_axis = 'X'
        bpy.ops.object.modifier_apply(modifier='dec')
    if src_normals is not None:
        o.data.use_auto_smooth = True
        dt = o.modifiers.new('dt', 'DATA_TRANSFER')
        dt.object = src_normals
        dt.use_loop_data = True
        dt.data_types_loops = {'CUSTOM_NORMAL'}
        dt.loop_mapping = 'POLYINTERP_NEAREST'
        try:
            bpy.ops.object.modifier_apply(modifier='dt')
        except Exception as e:
            print('sin transferencia de normales', e)
            o.modifiers.remove(dt)


def make_lod(roles, budgets=None):
    """Copia decimada de cada rol (simétrica) con normales transferidas desde el modelo completo."""
    budgets = dict(LOD1_BUDGET, **(budgets or {}))
    out = {}
    for role, o in roles.items():
        me = o.data.copy()
        lo = bpy.data.objects.new(role + '_lo', me)
        bpy.context.scene.collection.objects.link(lo)
        tris = tri_count(lo)
        b = budgets.get(role, 400)
        bpy.context.view_layer.objects.active = lo
        for x in bpy.context.view_layer.objects:
            x.select_set(False)
        lo.select_set(True)
        if tris > b:
            # triangular antes para que el presupuesto sea exacto
            bpy.ops.object.mode_set(mode='EDIT')
            bpy.ops.mesh.select_all(action='SELECT')
            bpy.ops.mesh.quads_convert_to_tris()
            bpy.ops.object.mode_set(mode='OBJECT')
            dec = lo.modifiers.new('dec', 'DECIMATE')
            dec.decimate_type = 'COLLAPSE'
            dec.ratio = max(0.02, b / tri_count(lo))
            dec.use_symmetry = True
            dec.symmetry_axis = 'X'
            bpy.ops.object.modifier_apply(modifier='dec')
        if role == 'paint':
            lo.data.use_auto_smooth = True
            dt = lo.modifiers.new('dt', 'DATA_TRANSFER')
            dt.object = o
            dt.use_loop_data = True
            dt.data_types_loops = {'CUSTOM_NORMAL'}
            dt.loop_mapping = 'POLYINTERP_NEAREST'
            try:
                bpy.ops.object.modifier_apply(modifier='dt')
            except Exception as e:
                print('sin transferencia de normales', e)
                lo.modifiers.remove(dt)
        out[role] = lo
    return out


def meta_for(D, info, imeta, bm):
    """Metadatos en coordenadas del juego (x_j = -x_b, y_j = z_b, z_j = y_b) salvo ruedas (las da vuelta el cargador)."""
    from mathutils.bvhtree import BVHTree
    from mathutils import Vector
    bvh = BVHTree.FromBMesh(bm)
    F = D.get('features', {})
    tw = D['track'] / 2
    wheels = [{'x': sx * tw, 'y': D['wr'], 'z': sz * D['wb'] / 2, 'r': D['wr'], 'w': D['tire_w'], 'front': sz > 0, 'side': sx}
              for sz in (1, -1) for sx in (1, -1)]
    plates = []
    zf = F.get('plate_front_z', 0.47)
    loc, n, i, d = BVHTree.FromBMesh(info['clean']).ray_cast(Vector((0, 4, zf)), Vector((0, -1, 0)), 10)
    if loc is not None:
        plates.append({'x': 0.0, 'y': round(loc.z, 4), 'z': round(loc.y + 0.014, 4), 'front': True})
    if 'plate_rear' in F:
        zs = [p[1] for p in F['plate_rear']['poly']]
        zr = (min(zs) + max(zs)) / 2
        loc, n, i, d = bvh.ray_cast(Vector((0, -4, zr)), Vector((0, 1, 0)), 10)
        if loc is not None:
            plates.append({'x': 0.0, 'y': round(loc.z, 4), 'z': round(loc.y - 0.005, 4), 'front': False})
    height = max(v.co.z for v in bm.verts)
    ys = [v.co.y for v in bm.verts]
    return {'id': D['name'], 'wheels': wheels, 'height': round(height, 4), 'seat': imeta['seat'], 'plates': plates,
            'length': round(max(ys) - min(ys), 4), 'center_z': round((max(ys) + min(ys)) / 2, 4),
            'width': round(2 * max(v.co.x for v in bm.verts), 4)}


def export(out_dir, model_id, roles, meta):
    for x in bpy.context.view_layer.objects:
        x.select_set(False)
    for o in roles.values():
        o.select_set(True)
        o.data.materials.clear()
    path = os.path.join(out_dir, model_id + '.glb')
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=True,
                              export_materials='NONE', export_normals=True, export_texcoords=False, export_colors=True)
    with open(os.path.join(out_dir, model_id + '.json'), 'w') as f:
        json.dump(meta, f)
    return path
