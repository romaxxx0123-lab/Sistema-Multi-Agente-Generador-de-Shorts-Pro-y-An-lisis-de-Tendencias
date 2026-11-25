# Generador de autos de Costa Neón (Blender 4.x en modo -b).
#   blender -b --python car_build.py -- <modelo> <salida> [preview|export] [vistas] [sky|studio]
# preview: renders de control con Cycles; export: <salida>.glb + <salida>.json para el juego.
import bpy, bmesh, sys, os, math, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from carkit.designs import DESIGNS
from carkit.build import build_body, MAT_NAMES
from carkit import dress, interior, export as ex
from carkit import parts as P
from carkit import preview as pv

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
style = argv[0] if argv else 'sedan'
out = argv[1] if len(argv) > 1 else '/tmp/car'
mode = argv[2] if len(argv) > 2 else 'preview'
views = argv[3].split(',') if len(argv) > 3 else ['q34f', 'side', 'q34r', 'front']
light = argv[4] if len(argv) > 4 else 'studio'

bpy.ops.wm.read_factory_settings(use_empty=True)
D = DESIGNS[style]
t0 = time.time()
bm, info = build_body(D)
parts = dress.dress(D, info, bm)
iobjs, imeta = interior.build(D, bm, info)
me = bpy.data.meshes.new('body')
bm.to_mesh(me)
ob = bpy.data.objects.new('body', me)
bpy.context.scene.collection.objects.link(ob)
for n in MAT_NAMES:
    ob.data.materials.append(P.mat(n))
for p in me.polygons:
    p.use_smooth = True
me.use_auto_smooth = True
me.auto_smooth_angle = math.radians(35)
for o in parts + iobjs:
    if o.type == 'MESH':
        o.data.use_auto_smooth = True
        o.data.auto_smooth_angle = math.radians(40)
print('modelo listo en %.1fs' % (time.time() - t0))

# aspecto de los materiales para los renders (el juego usa los suyos)
LOOK = {
    'paint': ((0.05, 0.06, 0.075) if light == 'studio' else (0.16, 0.01, 0.012), 0.3, 0.6 if light == 'studio' else 0.0, 1.0, 0, None),
    'under': ((0.02, 0.02, 0.02), 0.8, 0, 0, 0, None), 'glass': ((0.01, 0.012, 0.014), 0.03, 0, 0, 0.3, None),
    'frame': ((0.012, 0.012, 0.013), 0.5, 0, 0, 0, None), 'trim': ((0.014, 0.014, 0.015), 0.45, 0, 0, 0, None),
    'trim_gloss': ((0.008, 0.008, 0.009), 0.12, 0, 0.5, 0, None),
    'chrome': ((0.88, 0.88, 0.9), 0.05, 1, 0, 0, None), 'gap': ((0.003, 0.003, 0.003), 0.7, 0, 0, 0, None),
    'lens': ((0.95, 0.95, 0.95), 0.01, 0, 0, 1.0, None), 'head': ((1, 1, 1), 0.2, 0, 0, 0, ((1, 0.97, 0.92), 4.0)),
    'tail': ((0.3, 0.004, 0.006), 0.35, 0, 0, 0, None), 'tail_lit': ((0.6, 0.01, 0.01), 0.3, 0, 0, 0, ((1, 0.02, 0.02), 1.5)),
    'blink': ((0.9, 0.42, 0.03), 0.3, 0, 0, 0, None), 'reverse': ((0.85, 0.85, 0.85), 0.15, 0, 0, 0, None),
    'refl': ((0.8, 0.8, 0.82), 0.1, 1, 0, 0, None), 'inner': ((0.045, 0.044, 0.042), 0.7, 0, 0, 0, None),
    'liner': ((0.012, 0.012, 0.012), 0.9, 0, 0, 0, None), 'seat': ((0.04, 0.032, 0.027), 0.6, 0, 0, 0, None),
    'dash': ((0.02, 0.02, 0.021), 0.55, 0, 0, 0, None), 'screen': ((0.004, 0.006, 0.01), 0.08, 0, 0, 0, None),
    'carpet': ((0.022, 0.021, 0.02), 0.95, 0, 0, 0, None),
    'extra': ((0.9, 0.75, 0.3), 0.3, 0, 0, 0, None),
    'alu': ((0.45, 0.46, 0.47), 0.35, 0.8, 0, 0, None), 'hook': ((0.3, 0.02, 0.02), 0.4, 0, 0.5, 0, None),
}
for name, (col, rough, metal, coat, trans, emit) in LOOK.items():
    m = P.mat(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*col, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    b.inputs['Coat Weight'].default_value = coat
    b.inputs['Coat Roughness'].default_value = 0.02
    b.inputs['Transmission Weight'].default_value = trans
    if emit:
        b.inputs['Emission Color'].default_value = (*emit[0], 1)
        b.inputs['Emission Strength'].default_value = emit[1]

if mode == 'export':
    body_objs = [ob] + parts + iobjs
    ex.apply_modifiers(body_objs)
    t1 = time.time()
    ex.bake_ao(body_objs, D)
    print('oclusión horneada en %.1fs' % (time.time() - t1))
    if D.get('variant_of'):
        # variante: sólo se exportan los agregados; el juego los suma a una copia del modelo base
        keep = [o for o in body_objs if o.name.startswith(('sign', 'bar_', 'push_'))]
        for o in body_objs:
            if o not in keep:
                bpy.data.objects.remove(o, do_unlink=True)
        body_objs = keep
    groups = ex.collect(body_objs)
    roles = ex.join_groups(groups)
    # vidrio: se deja completo (copiar normales tras simplificarlo rompía el sombreado y los reflejos);
    # sólo si es enorme se alivia, con normales suaves recalculadas
    if 'glass' in roles and ex.tri_count(roles['glass']) > 14000:
        ex.decimate(roles['glass'], 14000, None)
        roles['glass'].data.use_auto_smooth = True
        roles['glass'].data.auto_smooth_angle = math.radians(30)
    for r, o in roles.items():
        print('LOD0', r, ex.tri_count(o))
    lo = ex.make_lod(roles, D.get('lod1', {}))
    for r, o in lo.items():
        print('LOD1', r, ex.tri_count(o))
    meta = ex.meta_for(D, info, imeta, bm)
    allr = dict(roles)
    allr.update({r + '_lo': o for r, o in lo.items()})
    path = ex.export(os.path.dirname(out), os.path.basename(out), allr, meta)
    print('exportado', path, 'LOD0', sum(ex.tri_count(o) for o in roles.values()), 'LOD1', sum(ex.tri_count(o) for o in lo.values()))
else:
    rub = pv.mat('pv_rub', (0.02, 0.02, 0.02), 0.85)
    rim = pv.mat('pv_rim', (0.6, 0.6, 0.62), 0.25, 1.0)
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
    tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in bpy.context.scene.objects if o.type == 'MESH' and not o.name.startswith(('Cylinder', 'preview')))
    print('triángulos del auto', tris)
    # vistas de detalle ajustadas al tamaño de cada modelo
    yf = D['y_fc'] + D['front']['rf'][3]
    yr = D['y_rc'] - D['rear']['rf'][3]
    zf = D['front']['z'][4] + 0.04
    zr = D['rear']['z'][4] + 0.02
    pv.VIEWS['face'] = ((1.3, yf + 1.95, zf + 0.3), 50, (0.28, yf - 0.15, zf - 0.05))
    pv.VIEWS['lamp'] = ((1.4, yf + 1.15, zf + 0.15), 55, (0.6, yf - 0.2, zf + 0.02))
    pv.VIEWS['tail'] = ((-1.25, yr - 1.45, zr + 0.18), 55, (-0.45, yr + 0.12, zr))
    s0, s1 = D['features'].get('sail', (0.42, 0.54))
    ym = (s0 + s1) / 2
    zm = info['body'].z[5](ym) + 0.1
    rm = info['body'].r[4](ym) + 0.1
    pv.VIEWS['mirror'] = ((rm + 0.75, ym + 0.85, zm + 0.3), 45, (rm, ym, zm))
    pv.VIEWS['mirror_r'] = ((rm + 0.55, ym - 0.95, zm + 0.25), 45, (rm, ym, zm))
    cam = pv.setup(res=(800, 450) if len(views) > 4 or light == 'studio_small' else (960, 540), samples=28 if light == 'studio_small' else 40, studio=light.startswith('studio'))
    pv.shoot(cam, out, {k: pv.VIEWS[k] for k in views})
