# Comparación con una foto real: el auto se renderiza dentro de la panorámica HDR donde se tomó la foto,
# con la misma cámara (altura, azimut, elevación, campo visual) y en la misma pose que el auto real.
# El resultado (RGBA lineal, fondo transparente, sombra sobre un piso "atrapasombras") se compone después
# sobre el recorte de la foto con el mismo tone mapping, así cada diferencia de forma o de luz se ve directo.
#   blender -b --python photomatch.py -- <diseño> <salida.npy> <escena.json> [ancho alto muestras]
import bpy, sys, os, math, json
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from carkit.designs import DESIGNS
from carkit.build import build_body, MAT_NAMES
from carkit import dress, interior
from carkit import parts as P

argv = sys.argv[sys.argv.index('--') + 1:]
style, out, scene_path = argv[0], argv[1], argv[2]
S = json.load(open(scene_path))
C = S['cam']
W = int(argv[3]) if len(argv) > 3 else C['W']
H = int(argv[4]) if len(argv) > 4 else C['H']
samples = int(argv[5]) if len(argv) > 5 else 64

bpy.ops.wm.read_factory_settings(use_empty=True)
D = DESIGNS[style]
bm, info = build_body(D)
parts = dress.dress(D, info, bm)
iobjs, imeta = interior.build(D, bm, info)
me = bpy.data.meshes.new('body')
bm.to_mesh(me)
ob = bpy.data.objects.new('body', me)
sc = bpy.context.scene
sc.collection.objects.link(ob)
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

# materiales: los del diseño si los define (look), si no los generales
LOOK = {
    'paint': ((0.04, 0.045, 0.052), 0.32, 0.55, 1.0, 0, None),
    'under': ((0.02, 0.02, 0.02), 0.8, 0, 0, 0, None), 'glass': ((0.008, 0.009, 0.01), 0.02, 0, 0, 0.35, None),
    'frame': ((0.012, 0.012, 0.013), 0.5, 0, 0, 0, None), 'trim': ((0.014, 0.014, 0.015), 0.45, 0, 0, 0, None),
    'trim_gloss': ((0.008, 0.008, 0.009), 0.1, 0, 0.6, 0, None),
    'chrome': ((0.9, 0.9, 0.92), 0.04, 1, 0, 0, None), 'gap': ((0.003, 0.003, 0.003), 0.7, 0, 0, 0, None),
    'lens': ((0.95, 0.95, 0.95), 0.01, 0, 0, 1.0, None), 'head': ((0.55, 0.55, 0.56), 0.15, 0.6, 0, 0, None),
    'drl': ((0.9, 0.9, 0.9), 0.2, 0, 0, 0, None),
    'tail': ((0.3, 0.004, 0.006), 0.35, 0, 0, 0, None), 'tail_lit': ((0.6, 0.01, 0.01), 0.3, 0, 0, 0, None),
    'blink': ((0.9, 0.42, 0.03), 0.3, 0, 0, 0, None), 'reverse': ((0.85, 0.85, 0.85), 0.15, 0, 0, 0, None),
    'refl': ((0.8, 0.8, 0.82), 0.1, 1, 0, 0, None), 'inner': ((0.045, 0.044, 0.042), 0.7, 0, 0, 0, None),
    'liner': ((0.012, 0.012, 0.012), 0.9, 0, 0, 0, None), 'seat': ((0.04, 0.032, 0.027), 0.6, 0, 0, 0, None),
    'dash': ((0.02, 0.02, 0.021), 0.55, 0, 0, 0, None), 'screen': ((0.004, 0.006, 0.01), 0.08, 0, 0, 0, None),
    'carpet': ((0.022, 0.021, 0.02), 0.95, 0, 0, 0, None), 'extra': ((0.9, 0.75, 0.3), 0.3, 0, 0, 0, None),
    'alu': ((0.45, 0.46, 0.47), 0.35, 0.8, 0, 0, None), 'hook': ((0.3, 0.02, 0.02), 0.4, 0, 0.5, 0, None),
}
# ruedas
wp = D.get('wheel', {}).get('paint', (0.06, 0.063, 0.068))
LOOK.update({
    'tire': ((0.014, 0.014, 0.015), 0.88, 0, 0, 0, None), 'rim_face': ((0.56, 0.57, 0.58), 0.24, 1.0, 0, 0, None),
    'rim_paint': (tuple(wp), 0.36, 0.6, 0.3, 0, None), 'hub': ((0.55, 0.55, 0.56), 0.3, 1.0, 0, 0, None),
    'cap': ((0.025, 0.026, 0.03), 0.25, 0.3, 0.5, 0, None), 'disc': ((0.33, 0.33, 0.34), 0.38, 1.0, 0, 0, None),
    'disc_hat': ((0.05, 0.05, 0.05), 0.6, 0.3, 0, 0, None), 'caliper': ((0.045, 0.045, 0.05), 0.45, 0.3, 0.3, 0, None),
})
LOOK.update(D.get('look', {}))
for name, v in LOOK.items():
    col, rough, metal, coat, trans, emit = v[:6]
    m = P.mat(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*col, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    b.inputs['Coat Weight'].default_value = coat
    b.inputs['Coat Roughness'].default_value = 0.03
    b.inputs['Transmission Weight'].default_value = trans
    if len(v) > 6:   # brillo propio de la base (en pintura con barniz casi todo el reflejo es del barniz)
        b.inputs['Specular IOR Level'].default_value = v[6]
    if emit:
        b.inputs['Emission Color'].default_value = (*emit[0], 1)
        b.inputs['Emission Strength'].default_value = emit[1]

# polvo sobre la pintura (el auto de la foto está sucio): capa difusa clara que tapa parte del brillo del barniz,
# más espesa en las superficies que miran arriba y con manchas irregulares
dust = D.get('dust')
if dust:
    pm_ = P.mat('paint')
    nt_ = pm_.node_tree
    pb = nt_.nodes['Principled BSDF']
    po = [nd for nd in nt_.nodes if nd.type == 'OUTPUT_MATERIAL'][0]
    geo = nt_.nodes.new('ShaderNodeNewGeometry')
    sep = nt_.nodes.new('ShaderNodeSeparateXYZ')
    nt_.links.new(geo.outputs['Normal'], sep.inputs['Vector'])
    mr = nt_.nodes.new('ShaderNodeMapRange')
    mr.inputs['From Min'].default_value = 0.25
    mr.inputs['From Max'].default_value = 0.9
    mr.inputs['To Min'].default_value = dust['side']
    mr.inputs['To Max'].default_value = dust['top']
    nt_.links.new(sep.outputs['Z'], mr.inputs['Value'])
    tc = nt_.nodes.new('ShaderNodeTexCoord')
    nz = nt_.nodes.new('ShaderNodeTexNoise')
    nz.inputs['Scale'].default_value = dust.get('scale', 9.0)
    nz.inputs['Detail'].default_value = 6.0
    nt_.links.new(tc.outputs['Object'], nz.inputs['Vector'])
    mr2 = nt_.nodes.new('ShaderNodeMapRange')
    mr2.inputs['From Min'].default_value = 0.35
    mr2.inputs['From Max'].default_value = 0.65
    mr2.inputs['To Min'].default_value = 0.55
    mr2.inputs['To Max'].default_value = 1.35
    nt_.links.new(nz.outputs['Fac'], mr2.inputs['Value'])
    mul = nt_.nodes.new('ShaderNodeMath')
    mul.operation = 'MULTIPLY'
    mul.use_clamp = True
    nt_.links.new(mr.outputs['Result'], mul.inputs[0])
    nt_.links.new(mr2.outputs['Result'], mul.inputs[1])
    df = nt_.nodes.new('ShaderNodeBsdfDiffuse')
    df.inputs['Color'].default_value = (*dust['color'], 1)
    df.inputs['Roughness'].default_value = 1.0
    mxs = nt_.nodes.new('ShaderNodeMixShader')
    nt_.links.new(mul.outputs['Value'], mxs.inputs['Fac'])
    nt_.links.new(pb.outputs['BSDF'], mxs.inputs[1])
    nt_.links.new(df.outputs['BSDF'], mxs.inputs[2])
    nt_.links.new(mxs.outputs['Shader'], po.inputs['Surface'])

# vidrio delgado: transparente teñido + reflejo con Fresnel (una sola superficie, sin refracción falsa)
gm = P.mat('glass')
gm.use_nodes = True
gnt = gm.node_tree
for nd in list(gnt.nodes):
    if nd.type != 'OUTPUT_MATERIAL':
        gnt.nodes.remove(nd)
out_n = [nd for nd in gnt.nodes if nd.type == 'OUTPUT_MATERIAL'][0]
tr = gnt.nodes.new('ShaderNodeBsdfTransparent')
tr.inputs['Color'].default_value = (*D.get('glass_tint', (0.62, 0.68, 0.66)), 1)
gl = gnt.nodes.new('ShaderNodeBsdfGlossy')
gl.inputs['Roughness'].default_value = 0.0
fr_n = gnt.nodes.new('ShaderNodeFresnel')
fr_n.inputs['IOR'].default_value = 1.52
mx = gnt.nodes.new('ShaderNodeMixShader')
# parabrisas laminado: dos caras que reflejan (≈1,7× el Fresnel de una sola)
fm2 = gnt.nodes.new('ShaderNodeMath')
fm2.operation = 'MULTIPLY'
fm2.use_clamp = True
fm2.inputs[1].default_value = 1.7
gnt.links.new(fr_n.outputs['Fac'], fm2.inputs[0])
gnt.links.new(fm2.outputs['Value'], mx.inputs['Fac'])
gnt.links.new(tr.outputs['BSDF'], mx.inputs[1])
gnt.links.new(gl.outputs['BSDF'], mx.inputs[2])
gnt.links.new(mx.outputs['Shader'], out_n.inputs['Surface'])

# vidrio privado (oscuro) detrás del pilar B: misma construcción, tinte mucho más oscuro
gd = P.mat('glass_dark')
gd.use_nodes = True
gd.node_tree.nodes.clear()
o2 = gd.node_tree.nodes.new('ShaderNodeOutputMaterial')
t2 = gd.node_tree.nodes.new('ShaderNodeBsdfTransparent')
t2.inputs['Color'].default_value = (*D.get('glass_dark_tint', (0.12, 0.13, 0.13)), 1)
g2 = gd.node_tree.nodes.new('ShaderNodeBsdfGlossy')
g2.inputs['Roughness'].default_value = 0.0
f2 = gd.node_tree.nodes.new('ShaderNodeFresnel')
f2.inputs['IOR'].default_value = 1.52
m2 = gd.node_tree.nodes.new('ShaderNodeMixShader')
gd.node_tree.links.new(f2.outputs['Fac'], m2.inputs['Fac'])
gd.node_tree.links.new(t2.outputs['BSDF'], m2.inputs[1])
gd.node_tree.links.new(g2.outputs['BSDF'], m2.inputs[2])
gd.node_tree.links.new(m2.outputs['Shader'], o2.inputs['Surface'])

# ruedas: las del diseño (carkit.wheels) si existen, si no un neumático y un disco simples
car_objs = [o for o in sc.objects]  # (la patente se agrega antes de armar la pose)
try:
    from carkit import wheels as WH
    car_objs += WH.build_all(D)
except ImportError:
    for sx in (-1, 1):
        for sy in (-1, 1):
            x, y = sx * D['track'] / 2, sy * D['wb'] / 2
            bpy.ops.mesh.primitive_cylinder_add(radius=D['wr'], depth=D['tire_w'], vertices=64, location=(x, y, D['wr']), rotation=(0, math.pi / 2, 0))
            t = bpy.context.active_object
            t.data.materials.append(P.mat('under'))
            car_objs.append(t)

# patente delantera (en el juego las patentes son aparte): placa blanca de 520 × 111 mm con letras ficticias
pz = D['features'].get('plate_front_z')
if pz:
    from mathutils import Vector, Matrix
    from mathutils.bvhtree import BVHTree
    bvh_b = BVHTree.FromObject(ob, bpy.context.evaluated_depsgraph_get())
    # la placa se apoya en lo más saliente del área que cubre, casi vertical (levemente inclinada hacia arriba)
    hits = [bvh_b.ray_cast(Vector((dx, 3.0, pz + dz)), Vector((0, -1, 0)), 5.0)[0] for dx in (-0.25, 0.0, 0.25) for dz in (-0.05, 0.05)]
    hits = [h_ for h_ in hits if h_ is not None]
    hit = Vector((0, max(h_.y for h_ in hits), pz)) if hits else None
    if hit is not None:
        n = Vector((0, math.cos(math.radians(6)), math.sin(math.radians(6))))
        bpy.ops.mesh.primitive_cube_add(size=1)
        pl = bpy.context.active_object
        pl.name = 'plate'
        pl.scale = (0.52, 0.006, 0.111)
        up = Vector((0, 0, 1))
        rot = Vector((0, 1, 0)).rotation_difference(n)
        pl.rotation_euler = rot.to_euler()
        pl.location = hit + n * 0.004
        pm = bpy.data.materials.new('plate_white')
        pm.use_nodes = True
        bb = pm.node_tree.nodes['Principled BSDF']
        bb.inputs['Base Color'].default_value = (0.78, 0.78, 0.76, 1)
        bb.inputs['Roughness'].default_value = 0.3
        pl.data.materials.append(pm)
        cu = bpy.data.curves.new('plate_txt', 'FONT')
        cu.body = 'PI15 NEO'
        cu.size = 0.082
        cu.align_x = 'CENTER'
        cu.align_y = 'CENTER'
        cu.extrude = 0.0008
        tx = bpy.data.objects.new('plate_txt', cu)
        sc.collection.objects.link(tx)
        tm = bpy.data.materials.new('plate_txt')
        tm.use_nodes = True
        tm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.01, 0.01, 0.01, 1)
        cu.materials.append(tm)
        # el texto nace en el plano XY mirando a +Z: se lo para mirando hacia adelante (+Y)
        # texto mirando hacia adelante (+Y) y leyéndose de izquierda a derecha visto de frente (hacia -X)
        Mt = Matrix(((-1, 0, 0), (0, 0, 1), (0, 1, 0))).to_4x4()
        tx.matrix_world = Matrix.Translation(hit + n * 0.0075) @ rot.to_matrix().to_4x4() @ Mt
        car_objs += [pl, tx]

# pose: el auto mira hacia +Y en su sistema; se gira al rumbo medido y se lleva a su lugar
root = bpy.data.objects.new('car', None)
sc.collection.objects.link(root)
for o in car_objs:
    if o.parent is None and o is not root:
        o.parent = root
K = S['car']
root.location = (K['x'], K['y'], K.get('z', 0.0))
root.rotation_euler = (0, 0, math.radians(K['heading'] - 90))

# cámara igual a la de la foto
cam_data = bpy.data.cameras.new('cam')
cam_data.sensor_fit = 'HORIZONTAL'
cam_data.angle = math.radians(C['fov'])
cam_data.clip_start = 0.05
cam = bpy.data.objects.new('cam', cam_data)
sc.collection.objects.link(cam)
cam.location = (0, 0, C['h'])
cam.rotation_euler = (math.radians(90 + C['el']), 0, math.radians(C['az'] - 90))
sc.camera = cam

# luz: la panorámica completa, sin girar (misma convención que el recorte de la foto)
world = bpy.data.worlds.new('w')
sc.world = world
world.use_nodes = True
nt = world.node_tree
env = nt.nodes.new('ShaderNodeTexEnvironment')
env.image = bpy.data.images.load(S['hdr'])
nt.links.new(env.outputs['Color'], nt.nodes['Background'].inputs['Color'])
nt.nodes['Background'].inputs['Strength'].default_value = 1.0

# PICK=<puntos.json>: en vez de renderizar, proyecta píxeles de la foto (vista v_car) sobre la carrocería y
# devuelve sus coordenadas en el sistema del auto: así se calcan faros, parrilla y líneas de la foto real.
if os.environ.get('PICK'):
    from mathutils import Vector, Matrix
    from mathutils.bvhtree import BVHTree
    pk = json.load(open(os.environ['PICK']))
    V = pk['view']
    bpy.context.view_layer.update()
    ff = 0.5 * V['W'] / math.tan(math.radians(V['fov']) / 2)
    dl = C['el'] - C.get('el_photo', C['el'])
    rot = (Matrix.Rotation(math.radians(V['az'] - 90), 3, 'Z') @ Matrix.Rotation(math.radians(90 + V['el'] + dl), 3, 'X'))
    inv = root.matrix_world.inverted()
    bvh = BVHTree.FromObject(ob, bpy.context.evaluated_depsgraph_get())
    res = []
    for name, px, py in pk['pts']:
        dw = rot @ Vector((px - V['W'] / 2 + 0.5, -(py - V['H'] / 2 + 0.5), -ff))
        o = inv @ Vector((0, 0, C['h']))
        d = (inv.to_3x3() @ dw).normalized()
        hit = bvh.ray_cast(o, d, 100.0)
        res.append([name, px, py] + ([round(v, 4) for v in hit[0]] if hit[0] is not None else [None, None, None]))
    json.dump(res, open(os.environ['PICK'].replace('.json', '_out.json'), 'w'), indent=0)
    for r_ in res:
        print('PICK', r_)
    sys.exit(0)

# piso que sólo recibe sombras (la calle real está en la foto)
bpy.ops.mesh.primitive_plane_add(size=80, location=(K['x'], K['y'], 0))
floor = bpy.context.active_object
floor.is_shadow_catcher = True
# el piso también se ve en los reflejos de la carrocería: que sea asfalto (albedo medido en la foto), no blanco
fm = bpy.data.materials.new('asfalto')
fm.use_nodes = True
fb = fm.node_tree.nodes['Principled BSDF']
fb.inputs['Base Color'].default_value = (0.09, 0.085, 0.08, 1)
fb.inputs['Roughness'].default_value = 0.95
floor.data.materials.append(fm)

sc.render.engine = 'CYCLES'
sc.cycles.device = 'CPU'
sc.cycles.samples = samples
sc.cycles.use_denoising = False   # esta compilación de Blender no trae OIDN
sc.cycles.max_bounces = 8
sc.cycles.glossy_bounces = 4
sc.cycles.transparent_max_bounces = 8
sc.render.film_transparent = True
sc.render.resolution_x, sc.render.resolution_y = W, H
sc.render.resolution_percentage = 100
sc.view_settings.view_transform = 'Standard'
sc.render.image_settings.file_format = 'OPEN_EXR'
sc.render.image_settings.color_depth = '32'
sc.render.image_settings.color_mode = 'RGBA'
exr = out.replace('.npy', '.exr')
sc.render.filepath = exr
bpy.ops.render.render(write_still=True)
img = bpy.data.images.load(exr)
px = np.empty(W * H * 4, np.float32)
img.pixels.foreach_get(px)
np.save(out, px.reshape(H, W, 4)[::-1])
print('render listo', out)
