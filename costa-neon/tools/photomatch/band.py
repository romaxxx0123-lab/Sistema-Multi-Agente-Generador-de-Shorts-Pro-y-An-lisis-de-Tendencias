# Blender -b --python band.py -- <hdr> <out.npy> <col0> <col1> <row0> <row1>   (filas desde ARRIBA)
import bpy, sys, json, numpy as np
a = sys.argv[sys.argv.index('--') + 1:]
src, out = a[0], a[1]
c0, c1, r0, r1 = map(int, a[2:6])
im = bpy.data.images.load(src)
W, H = im.size
px = np.empty(W * H * 4, np.float32)
im.pixels.foreach_get(px)
px = px.reshape(H, W, 4)[::-1]          # Blender guarda de abajo hacia arriba
band = np.ascontiguousarray(px[r0:r1, c0:c1, :3])
np.save(out, band)
json.dump(dict(W=W, H=H, c0=c0, c1=c1, r0=r0, r1=r1), open(out.replace('.npy', '.json'), 'w'))
print('banda', band.shape, 'de', W, H, 'max', float(band.max()))
