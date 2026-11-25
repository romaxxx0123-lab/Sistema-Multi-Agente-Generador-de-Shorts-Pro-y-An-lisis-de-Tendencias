# Renders de control con Cycles (CPU): cielo físico o "cebra" (bandas para juzgar reflejos).
import bpy, math
from mathutils import Vector


def mat(name, color, rough=0.5, metal=0.0, coat=0.0, transmission=0.0, emit=None):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if coat:
        b.inputs['Coat Weight'].default_value = coat
        b.inputs['Coat Roughness'].default_value = 0.02
    if transmission:
        b.inputs['Transmission Weight'].default_value = transmission
    if emit:
        b.inputs['Emission Color'].default_value = (*emit[0], 1)
        b.inputs['Emission Strength'].default_value = emit[1]
    return m


def setup(res=(960, 540), samples=24, zebra=False, sun=(38, 140), studio=False):
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = samples
    sc.cycles.use_denoising = False
    sc.render.resolution_x, sc.render.resolution_y = res
    try:
        sc.view_settings.view_transform = 'AgX'
    except TypeError:
        sc.view_settings.view_transform = 'Filmic'
    world = bpy.data.worlds.new('w')
    sc.world = world
    world.use_nodes = True
    nt = world.node_tree
    bg = nt.nodes['Background']
    if zebra:
        # bandas horizontales: coordenada del rayo → seno de la elevación
        tc = nt.nodes.new('ShaderNodeTexCoord')
        sep = nt.nodes.new('ShaderNodeSeparateXYZ')
        nt.links.new(tc.outputs['Generated'], sep.inputs[0])
        mth = nt.nodes.new('ShaderNodeMath'); mth.operation = 'MULTIPLY'; mth.inputs[1].default_value = 40.0
        nt.links.new(sep.outputs['Z'], mth.inputs[0])
        sn = nt.nodes.new('ShaderNodeMath'); sn.operation = 'SINE'
        nt.links.new(mth.outputs[0], sn.inputs[0])
        gt = nt.nodes.new('ShaderNodeMath'); gt.operation = 'GREATER_THAN'; gt.inputs[1].default_value = 0.0
        nt.links.new(sn.outputs[0], gt.inputs[0])
        nt.links.new(gt.outputs[0], bg.inputs['Color'])
        bg.inputs['Strength'].default_value = 1.0
    elif studio:
        # estudio: fondo oscuro, piso brillante y softboxes grandes que dibujan la forma con reflejos
        bg.inputs['Color'].default_value = (0.03, 0.03, 0.033, 1)
        bg.inputs['Strength'].default_value = 1.0
        bpy.ops.mesh.primitive_plane_add(size=80, location=(0, 0, 0))
        floor = bpy.context.active_object
        floor.name = 'preview_floor'
        floor.data.materials.append(mat('pv_floor_st', (0.035, 0.035, 0.037), 0.32))
        for name, loc, rotd, size, power in [
            ('top', (0, 0, 4.2), (0, 0, 0), (2.6, 6.0), 900),
            ('left', (-4.2, 0, 1.9), (0, -70, 0), (1.2, 6.5), 380),
            ('right', (4.2, 0, 1.9), (0, 70, 0), (1.2, 6.5), 380),
            ('front', (0, 6.5, 1.6), (-75, 0, 0), (3.0, 1.0), 220),
            ('back', (0, -6.5, 1.6), (75, 0, 0), (3.0, 1.0), 220)]:
            ld = bpy.data.lights.new('soft_' + name, 'AREA')
            ld.shape = 'RECTANGLE'
            ld.size, ld.size_y = size
            ld.energy = power
            lo = bpy.data.objects.new('soft_' + name, ld)
            lo.location = loc
            lo.rotation_euler = tuple(math.radians(a) for a in rotd)
            sc.collection.objects.link(lo)
    else:
        sky = nt.nodes.new('ShaderNodeTexSky')
        try:
            sky.sky_type = 'NISHITA'
            sky.sun_elevation = math.radians(sun[0])
            sky.sun_rotation = math.radians(sun[1])
        except Exception:
            pass
        nt.links.new(sky.outputs[0], bg.inputs['Color'])
        bg.inputs['Strength'].default_value = 0.28
        bpy.ops.mesh.primitive_plane_add(size=80, location=(0, 0, 0))
        floor = bpy.context.active_object
        floor.name = 'preview_floor'
        floor.data.materials.append(mat('pv_floor', (0.11, 0.11, 0.115), 0.75))
    cam_data = bpy.data.cameras.new('cam')
    cam_data.lens = 45
    cam = bpy.data.objects.new('preview_cam', cam_data)
    sc.collection.objects.link(cam)
    sc.camera = cam
    return cam


def shoot(cam, path, views, target=(0, 0, 0.62)):
    sc = bpy.context.scene
    outs = []
    for name, spec in views.items():
        loc = spec[0] if isinstance(spec[0], (tuple, list)) else spec
        lens = spec[1] if isinstance(spec[0], (tuple, list)) and len(spec) > 1 else 45
        tgt = spec[2] if isinstance(spec[0], (tuple, list)) and len(spec) > 2 else target
        cam.data.lens = lens
        cam.location = loc
        d = Vector(tgt) - Vector(loc)
        cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
        sc.render.filepath = path + '_' + name + '.png'
        bpy.ops.render.render(write_still=True)
        outs.append(sc.render.filepath)
    return outs


VIEWS = {
    'q34f': ((4.6, 5.6, 1.5), 45),
    'side': ((8.5, 0.0, 0.95), 45),
    'q34r': ((-4.4, -5.9, 1.7), 45),
    'front': ((0.0, 7.5, 1.0), 45),
    'rear': ((0.0, -7.6, 1.15), 45),
    'top': ((0.0, 0.001, 9.0), 40),
    'zoom_ws': ((2.2, 2.4, 2.3), 45, (0.45, -0.1, 1.25)),
    'zoom_rw': ((-1.6, -3.6, 2.2), 45, (0.4, -1.75, 1.2)),
    'zoom_rear': ((0.9, -4.3, 1.75), 50, (0.0, -1.75, 1.15)),
    'fr34': ((2.9, 5.6, 1.25), 42, (0.0, 1.2, 0.62)),
    'face': ((1.25, 4.1, 0.95), 50, (0.25, 2.1, 0.58)),
    'lamp': ((1.35, 3.25, 0.82), 55, (0.55, 2.15, 0.66)),
    'tail': ((-1.2, -3.8, 1.05), 55, (-0.45, -2.35, 0.9)),
    'rr34': ((-2.9, -5.8, 1.45), 42, (0.0, -1.3, 0.75)),
}
