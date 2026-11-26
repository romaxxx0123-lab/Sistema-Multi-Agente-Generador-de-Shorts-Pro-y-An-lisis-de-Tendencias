# Ruedas del juego hechas en Blender (carkit/wheels.py): un .glb con el neumático, las llantas por estilo
# (cada una con su disco de freno, que gira con ella) y la pinza (fija). Normalizadas como las del juego:
# radio del neumático = 1 en Y/Z y ancho = 1 en X (el juego escala cada instancia por ancho y radio).
# El color de vértice separa la cara mecanizada (1.0) de lo pintado (más oscuro); el color de la llanta de
# cada auto se multiplica encima.
#   blender -b --python wheel_build.py -- <salida.glb>
import bpy, sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from carkit import wheels as WH
WH.QUALITY.update(lathe=0.4, spoke=(8, 3))

out = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else '/tmp/wheels.glb'
bpy.ops.wm.read_factory_settings(use_empty=True)

R, W = 0.331, 0.235                       # rueda de referencia: 225/40 R19
Rr = 0.4826 / 2
SHADE = {'rim_face': 1.0, 'rim_paint': 0.42, 'hub': 0.55, 'cap': 0.08, 'disc': 0.30, 'disc_hat': 0.12,
         'caliper': 1.0, 'tire': 1.0}
STYLES = {'double5': dict(spoke_w=(0.011, 0.019)), 'five': {}, 'multi10': {}}


def bake(objs, name):
    """Une objetos, pinta el color de vértice por material y normaliza (x / W, y / R, z / R)."""
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
        me = o.data
        if not me.color_attributes:
            me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
        col = me.color_attributes[0]
        for poly in me.polygons:
            m = me.materials[poly.material_index].name if me.materials else 'rim_paint'
            k = SHADE.get(m.split('.')[0], 0.5)
            for li in poly.loop_indices:
                col.data[li].color = (k, k, k, 1.0)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    o = bpy.context.active_object
    o.name = name
    for v in o.data.vertices:
        v.co.x /= W
        v.co.y /= R
        v.co.z /= R
    o.data.materials.clear()
    return o


keep = []
tire = WH.tire(R, Rr, W)
keep.append(bake([tire], 'tire'))
for style, extra in STYLES.items():
    parts = WH.rim(style, Rr, 8.0 * 0.0254, tuple(extra.get('spoke_w', (0.0085, 0.014))))
    disc = WH.brake(0.17)
    cal = [o for o in disc if o.name.startswith('caliper')]
    rot = [o for o in disc if o not in cal]
    keep.append(bake(parts + rot, 'rim_' + style))
    if style == 'double5':
        # en el juego la pinza tiene que quedar arriba y atrás: glTF invierte el eje adelante/atrás de Blender
        from mathutils import Matrix
        for o in cal:
            o.data.transform(Matrix.Rotation(math.radians(-70), 4, 'X'))
        keep.append(bake(cal, 'caliper'))
    else:
        for o in cal:
            bpy.data.objects.remove(o, do_unlink=True)
for o in bpy.context.scene.objects:
    o.select_set(o in keep)
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_apply=True,
                          export_normals=True, export_attributes=True, export_materials='NONE')
for o in keep:
    print('rueda', o.name, sum(len(p.vertices) - 2 for p in o.data.polygons), 'triángulos')
print('exportado', out)
