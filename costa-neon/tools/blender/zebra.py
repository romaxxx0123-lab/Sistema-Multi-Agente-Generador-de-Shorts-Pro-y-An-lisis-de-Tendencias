# Análisis de cebra (control de superficies de la industria automotriz): la chapa se vuelve espejo y refleja
# franjas paralelas. En una superficie suave las franjas se doblan en curvas continuas; en una arista se
# quiebran; en una ondulación se tuercen. Sirve para comparar la suavidad de los relieves de un diseño de
# carkit contra un modelo de referencia hecho a mano (glb), con la misma cámara relativa y las mismas franjas.
#   blender -b --python zebra.py -- <design:NOMBRE | archivo.glb> <salida_prefijo> [regex_pintura] [girar]
# Salida: <prefijo>_34.png (tres cuartos delantero) y <prefijo>_lado.png (costado).
import bpy, sys, os, math, re
from mathutils import Vector
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

argv = sys.argv[sys.argv.index('--') + 1:]
src, out = argv[0], argv[1]
paint_re = re.compile(argv[2] if len(argv) > 2 else r'(?i)paint|body', re.I)
flip = len(argv) > 3 and argv[3] == '1'

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene

if src.startswith('design:'):
    from carkit.designs import DESIGNS
    from carkit.build import build_body, MAT_NAMES
    from carkit import dress, interior
    from carkit import parts as P
    D = DESIGNS[src.split(':', 1)[1]]
    bm, info = build_body(D)
    parts = dress.dress(D, info, bm)
    iobjs, _ = interior.build(D, bm, info)
    me = bpy.data.meshes.new('body')
    bm.to_mesh(me)
    ob = bpy.data.objects.new('body', me)
    sc.collection.objects.link(ob)
    for n in MAT_NAMES:
        ob.data.materials.append(P.mat(n))
    for p in me.polygons:
        p.use_smooth = True
    me.use_auto_smooth = True
    me.auto_smooth_angle = math.radians(D.get('smooth_angle', 35))
    for o in parts + iobjs:
        if o.type == 'MESH':
            o.data.use_auto_smooth = True
            o.data.auto_smooth_angle = math.radians(40)
    try:
        from carkit import wheels as WH
        WH.build_all(D)
    except Exception as e:
        print('sin ruedas', e)
    paint_names = {'paint'}
else:
    bpy.ops.import_scene.gltf(filepath=src)
    paint_names = None

# normalizar: centro en el origen, ruedas en el piso, largo sobre Y con la trompa hacia +Y
meshes = [o for o in sc.objects if o.type == 'MESH']
mn = Vector((1e9,) * 3); mx = Vector((-1e9,) * 3)
for o in meshes:
    for v in o.bound_box:
        w = o.matrix_world @ Vector(v)
        mn = Vector(map(min, mn, w)); mx = Vector(map(max, mx, w))
root = bpy.data.objects.new('root', None)
sc.collection.objects.link(root)
for o in sc.objects:
    if o.parent is None and o is not root:
        o.parent = root
        o.matrix_parent_inverse = root.matrix_world.inverted()
root.location = (-(mn.x + mx.x) / 2, -(mn.y + mx.y) / 2, -max(mn.z, -0.05))
if flip:
    root.rotation_euler = (0, 0, math.pi)
    root.location = ((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, root.location.z)
bpy.context.view_layer.update()
L, H = mx.y - mn.y, mx.z - mn.z

# material espejo para la chapa (todas las piezas pintadas)
mirror = bpy.data.materials.new('zebra_mirror')
mirror.use_nodes = True
b = mirror.node_tree.nodes['Principled BSDF']
b.inputs['Base Color'].default_value = (0.92, 0.92, 0.92, 1)
b.inputs['Metallic'].default_value = 1.0
b.inputs['Roughness'].default_value = 0.0
dark = bpy.data.materials.new('zebra_rest')
dark.use_nodes = True
db = dark.node_tree.nodes['Principled BSDF']
db.inputs['Base Color'].default_value = (0.03, 0.03, 0.03, 1)
db.inputs['Roughness'].default_value = 0.6
n_paint = 0
for o in sc.objects:
    if o.type != 'MESH':
        continue
    for slot in o.material_slots:
        m = slot.material
        name = m.name if m else ''
        is_paint = (name in paint_names) if paint_names is not None else bool(paint_re.search(name))
        if is_paint:
            slot.material = mirror
            n_paint += 1
        else:
            slot.material = dark
print('piezas pintadas', n_paint)

# entorno de franjas: bandas horizontales (latitud) blancas y negras, más finas cerca del horizonte
world = bpy.data.worlds.new('zebra')
sc.world = world
world.use_nodes = True
nt = world.node_tree
bg = nt.nodes['Background']
tc = nt.nodes.new('ShaderNodeTexCoord')
sep = nt.nodes.new('ShaderNodeSeparateXYZ')
nt.links.new(tc.outputs['Generated'], sep.inputs['Vector'])
mul = nt.nodes.new('ShaderNodeMath'); mul.operation = 'MULTIPLY'; mul.inputs[1].default_value = 36.0
nt.links.new(sep.outputs['Z'], mul.inputs[0])
sn = nt.nodes.new('ShaderNodeMath'); sn.operation = 'SINE'
nt.links.new(mul.outputs['Value'], sn.inputs[0])
gt = nt.nodes.new('ShaderNodeMath'); gt.operation = 'GREATER_THAN'; gt.inputs[1].default_value = 0.0
nt.links.new(sn.outputs['Value'], gt.inputs[0])
nt.links.new(gt.outputs['Value'], bg.inputs['Strength'])
bg.inputs['Color'].default_value = (1, 1, 1, 1)

sc.render.engine = 'CYCLES'
sc.cycles.device = 'CPU'
sc.cycles.samples = 24
sc.cycles.use_denoising = False
sc.cycles.max_bounces = 3
sc.render.resolution_x, sc.render.resolution_y = 1100, 620
sc.view_settings.view_transform = 'Standard'
cam_data = bpy.data.cameras.new('cam')
cam_data.lens = 50
cam = bpy.data.objects.new('cam', cam_data)
sc.collection.objects.link(cam)
sc.camera = cam


def shoot(name, az, dist_k, h):
    a = math.radians(az)
    d = L * dist_k
    target = Vector((0, 0, H * 0.42))
    cam.location = Vector((d * math.cos(a), d * math.sin(a), h))
    cam.rotation_euler = (target - cam.location).to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = out + '_' + name + '.png'
    bpy.ops.render.render(write_still=True)


shoot('34', 32.0, 1.45, 1.35)
shoot('lado', 0.0, 1.35, 0.95)
print('listo', out)
