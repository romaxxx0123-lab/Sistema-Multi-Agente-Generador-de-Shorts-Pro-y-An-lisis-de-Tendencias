import os, sys, json, numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from photo import cam_rot
V = json.load(open('v_car.json'))
W, H, fov = V['W'], V['H'], V['fov']
f = 0.5 * W / np.tan(np.radians(fov) / 2)
R = cam_rot(V['az'], V['el'])
def d(px, py):
    c = np.array([px - W / 2 + 0.5, -(py - H / 2 + 0.5), -f])
    v = R @ c
    return v / np.linalg.norm(v)
hubF, hubR = d(822.5, 732.5), d(257.5, 607.5)
botF, botR = d(830, 890), d(245, 732)
WB, RH = 2.810, 0.322   # batalla y altura del centro de la rueda (radio cargado)
for h in np.arange(1.2, 2.21, 0.1):
    pF = np.array([0, 0, h]) + hubF * (RH - h) / hubF[2]
    pR = np.array([0, 0, h]) + hubR * (RH - h) / hubR[2]
    gF = np.array([0, 0, h]) + botF * (0 - h) / botF[2]
    gR = np.array([0, 0, h]) + botR * (0 - h) / botR[2]
    print('h %.2f  batalla(maza) %.3f  batalla(contacto) %.3f  dist %.2f' % (h, np.linalg.norm(pF - pR), np.linalg.norm(gF - gR), np.linalg.norm(pF[:2])))
