# Ajuste de cámara y pose por mínimos cuadrados con puntos de medidas conocidas (llantas de 19", batalla, patente).
import os, sys, json, numpy as np
from scipy.optimize import least_squares
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from photo import cam_rot
V = json.load(open('v_car.json'))
W, H, fov = V['W'], V['H'], V['fov']
f = 0.5 * W / np.tan(np.radians(fov) / 2)
RH, RL = 0.325, 0.259          # altura de la maza y radio del labio de la llanta
WB, XH, XL = 2.81, 0.83, 0.815
obs = [  # (px, py, punto local) ; la patente usa incógnitas yp, zp
    (822.5, 732.5, ('p', (XH, WB / 2, RH))), (257.5, 607.5, ('p', (XH, -WB / 2, RH))),
    (822, 580, ('p', (XL, WB / 2, RH + RL))), (822, 877.5, ('p', (XL, WB / 2, RH - RL))),
    (877.5, 728, ('p', (XL, WB / 2 + RL, RH))), (735, 728, ('p', (XL, WB / 2 - RL, RH))),
    (247, 475, ('p', (XL, -WB / 2, RH + RL))), (247, 722.5, ('p', (XL, -WB / 2, RH - RL))),
    (292, 600, ('p', (XL, -WB / 2 + RL, RH))), (202, 600, ('p', (XL, -WB / 2 - RL, RH))),
    (1310, 668, ('plate', +0.0555)), (1310, 727, ('plate', -0.0555)),
]
def project(q, p):
    h, dl, X, Y, hd = q[:5]
    a = np.radians(hd - 90)
    Rc = np.array([[np.cos(a), -np.sin(a), 0], [np.sin(a), np.cos(a), 0], [0, 0, 1]])
    w = Rc @ np.asarray(p) + np.array([X, Y, 0])
    R = cam_rot(V['az'], V['el'] + dl)
    c = R.T @ (w - np.array([0, 0, h]))
    return np.array([W / 2 - 0.5 + f * c[0] / -c[2], H / 2 - 0.5 - f * c[1] / -c[2]])
def full(q, fix_dl):
    return q if fix_dl is None else np.concatenate([q[:1], [fix_dl], q[1:]])
def resid(q, use_plate=True, fix_dl=None):
    q = full(q, fix_dl)
    r = []
    for px, py, (k, v) in obs:
        if k == 'p':
            p = v
        else:
            if not use_plate:
                continue
            p = (0.26, q[5], q[6] + v)
        r += list(project(q, p) - np.array([px, py]))
    return np.array(r)
S = json.load(open('scene.json'))
q0 = np.array([1.335, 0.0, S['car']['x'], S['car']['y'], S['car']['heading'], 2.1, 0.45])
res = {}
for label, kw in (('libre', {}), ('sin inclinación', {'fix_dl': 0.0}), ('libre sin patente', {'use_plate': False})):
    fd = kw.get('fix_dl')
    x0 = q0 if fd is None else np.delete(q0, 1)
    sol = least_squares(lambda q: resid(q, **kw), x0)
    q = full(sol.x, fd)
    rr = resid(q, use_plate=kw.get('use_plate', True))
    res[label] = q
    print('%-18s h=%.3f  δ=%+.3f°  X=%.3f Y=%.3f rumbo=%.2f  patente y=%.3f z=%.3f  rms=%.2f px  max=%.1f px' %
          (label, q[0], q[1], q[2], q[3], q[4], q[5], q[6], np.sqrt(np.mean(rr ** 2)), np.abs(rr).max()))
q = res['libre']
json.dump(dict(h=q[0], dl=q[1], X=q[2], Y=q[3], heading=q[4]), open('fit.json', 'w'))
