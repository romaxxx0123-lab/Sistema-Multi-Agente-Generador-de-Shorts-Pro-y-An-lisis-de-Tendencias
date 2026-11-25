# Prueba de la carrocería completa con rasgos tallados; renders de control.
import bpy, bmesh, sys, os, math, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from carkit.designs import DESIGNS
from carkit.build import build_body, MAT_NAMES
from carkit import preview as pv

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
style = argv[0] if argv else 'sedan'
out = argv[1] if len(argv) > 1 else '/tmp/shape'
views = argv[2].split(',') if len(argv) > 2 else ['q34f', 'side', 'q34r', 'front']
mode = argv[3] if len(argv) > 3 else 'sky'
zebra = mode == 'zebra'
studio = mode == 'studio'

bpy.ops.wm.read_factory_settings(use_empty=True)
D = DESIGNS[style]
bm, info = build_body(D)
me = bpy.data.meshes.new('body')
bm.to_mesh(me)
bm.free()
ob = bpy.data.objects.new('body', me)
bpy.context.scene.collection.objects.link(ob)
paint = ((0.02, 0.02, 0.022) if zebra else ((0.05, 0.06, 0.075) if studio else (0.16, 0.01, 0.012)))
cols = {
    'paint': (paint, 0.3, 0.6 if studio else 0.0, 1.0, 0),
    'under': ((0.02, 0.02, 0.02), 0.8, 0, 0, 0), 'glass': ((0.01, 0.012, 0.014), 0.03, 0, 0, 0),
    'frame': ((0.012, 0.012, 0.013), 0.5, 0, 0, 0), 'trim': ((0.012, 0.012, 0.013), 0.35, 0, 0.3, 0),
    'chrome': ((0.85, 0.85, 0.87), 0.06, 1, 0, 0), 'gap': ((0.003, 0.003, 0.003), 0.7, 0, 0, 0),
    'lens': ((0.9, 0.9, 0.9), 0.02, 0, 0, 0.95), 'head': ((1, 1, 1), 0.2, 0, 0, 0),
    'tail': ((0.35, 0.005, 0.008), 0.3, 0, 0, 0), 'blink': ((0.9, 0.4, 0.02), 0.3, 0, 0, 0),
    'refl': ((0.8, 0.8, 0.82), 0.12, 1, 0, 0), 'inner': ((0.03, 0.03, 0.032), 0.5, 0, 0, 0),
}
for n in MAT_NAMES:
    c = cols[n]
    ob.data.materials.append(pv.mat('pv_' + n, c[0], c[1], c[2], c[3], c[4]))
me.use_auto_smooth = True
me.auto_smooth_angle = math.radians(35)
if not zebra:
    rub = pv.mat('pv_rub', (0.02, 0.02, 0.02), 0.85)
    rim = pv.mat('pv_rim', (0.6, 0.6, 0.62), 0.25, 1.0)
    liner = pv.mat('pv_liner', (0.015, 0.015, 0.016), 0.9)
    for sx in (-1, 1):
        for sy in (-1, 1):
            x = sx * (D['track'] / 2)
            y = sy * D['wb'] / 2
            bpy.ops.mesh.primitive_cylinder_add(radius=D['wr'], depth=D['tire_w'], vertices=48, location=(x, y, D['wr']), rotation=(0, math.pi / 2, 0))
            t = bpy.context.active_object
            t.data.materials.append(rub)
            b = t.modifiers.new('b', 'BEVEL'); b.width = 0.06; b.segments = 5
            bpy.ops.object.shade_smooth()
            bpy.ops.mesh.primitive_cylinder_add(radius=D['wr'] * 0.68, depth=0.02, vertices=40, location=(x + sx * (D['tire_w'] / 2 - 0.005), y, D['wr']), rotation=(0, math.pi / 2, 0))
            bpy.context.active_object.data.materials.append(rim)
            bpy.ops.mesh.primitive_cylinder_add(radius=D['wr'] + 0.05, depth=0.42, vertices=48, location=(sx * 0.70, y, D['wr']), rotation=(0, math.pi / 2, 0), end_fill_type='NOTHING')
            l = bpy.context.active_object
            l.data.materials.append(liner)
            bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.flip_normals(); bpy.ops.object.mode_set(mode='OBJECT')
cam = pv.setup(zebra=zebra, samples=16 if zebra else 32, studio=studio)
pv.shoot(cam, out, {k: pv.VIEWS[k] for k in views})
