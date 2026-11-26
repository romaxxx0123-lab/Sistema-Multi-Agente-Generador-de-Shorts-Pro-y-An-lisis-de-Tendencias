# meas.py [h]: puntos de la foto (v_car) → coordenadas del auto intersecando con planos x = cte conocidos
import os, sys, json, numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from grid import projector
V = json.load(open('v_car.json')); S = json.load(open('scene.json'))
proj, ray = projector(V, S)
P = [('riñón borde ext. medio', 1250, 610, 0.255), ('riñón sup-ext', 1265, 570, 0.235), ('riñón inferior', 1290, 648, 0.20),
     ('patente borde sup', 1310, 668, 0.26), ('patente borde inf', 1310, 727, 0.26), ('faro extremo int', 1225, 575, 0.29),
     ('faro esquina ext', 918, 533, 0.79), ('antiniebla', 1030, 735, 0.66), ('labio inferior', 1100, 835, 0.50),
     ('maza del. (cara)', 822.5, 732.5, 0.83), ('maza tras. (cara)', 257.5, 607.5, 0.83)]
for name, px, py, x in P:
    p = ray(px, py, np.array([1.0, 0, 0]), x)
    print('%-24s y=%6.3f z=%6.3f' % (name, p[1], p[2]))
