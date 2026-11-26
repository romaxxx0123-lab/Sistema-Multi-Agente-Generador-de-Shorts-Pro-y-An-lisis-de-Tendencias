# Pose del auto a partir de los centros de rueda medidos (cara de la maza) y la altura de cámara.
import os, sys, json, numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from photo import cam_rot
h = float(sys.argv[1]) if len(sys.argv) > 1 else 1.33
V = json.load(open('v_car.json'))
W, H, fov = V['W'], V['H'], V['fov']
f = 0.5 * W / np.tan(np.radians(fov) / 2)
R = cam_rot(V['az'], V['el'])
def d(px, py):
    v = R @ np.array([px - W / 2 + 0.5, -(py - H / 2 + 0.5), -f])
    return v / np.linalg.norm(v)
RH = 0.322
cam = np.array([0, 0, h])
pF = cam + d(822.5, 732.5) * (RH - h) / d(822.5, 732.5)[2]
pR = cam + d(257.5, 607.5) * (RH - h) / d(257.5, 607.5)[2]
fwd = (pF - pR)[:2]; fwd /= np.linalg.norm(fwd)
left = np.array([-fwd[1], fwd[0]])
mid = (pF[:2] + pR[:2]) / 2 + left * 0.84          # de la cara de la maza al eje del auto
head = float(np.degrees(np.arctan2(fwd[1], fwd[0])))
S = dict(hdr=sys.argv[2] if len(sys.argv) > 2 else '', cam=dict(h=h, az=V['az'], el=V['el'], fov=fov, W=W, H=H),
         car=dict(x=float(mid[0]), y=float(mid[1]), heading=head), exposure=V['exposure'])
json.dump(S, open('scene.json', 'w'), indent=1)
print(json.dumps(S['car']), 'batalla medida %.3f' % np.linalg.norm(pF - pR))
