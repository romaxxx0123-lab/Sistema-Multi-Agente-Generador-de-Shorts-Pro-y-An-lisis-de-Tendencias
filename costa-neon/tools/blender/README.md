# Autos de Costa Neón hechos en Blender

Los autos del juego se modelan por script con Blender 4.x en modo sin ventana (`blender -b`).
Nada se dibuja a mano: el diseño de cada modelo son tablas de medidas reales en `carkit/designs.py`.

## Cómo funciona

1. **Superficie** (`carkit/body.py`): la carrocería es un loft denso de secciones con puntos de carácter
   (zócalo, hombro, cintura, riel del techo) unidos por Bézier con pliegues nítidos o suaves. El techo,
   el capó y el baúl son un campo de alturas. La trompa y la cola usan secciones en abanico alrededor
   de un eje vertical, así las esquinas en planta quedan redondeadas sin degenerar la malla.
2. **Cortes** (`carkit/cut.py`): las aberturas se cortan sobre curvas exactas en un espacio 2D (vista
   lateral, superior, frontal, parámetros de la superficie o cilíndrico alrededor de los abanicos).
3. **Carrocería** (`carkit/shell.py`, `carkit/features.py`): arcos de rueda con pestaña, vidrios hundidos
   con marco, pilares, juntas de paneles en V, ópticas y parrilla con profundidad real, bolsillos de
   manijas, nicho de patente, difusor y escapes.
4. **Piezas** (`carkit/dress.py` reparte; las piezas finas viven en módulos propios):
   - `carkit/lamps.py`: ópticas como conjuntos reales ubicados con coordenadas de plano frontal/trasero en
     metros (como un plano de taller): carcasa oscura con profundidad bajo una lente clara, proyectores
     (bisel cromado, barril, disco que brilla y lente abombada), reflectores parabólicos, guías de luz LED
     barridas en 3D, giro ámbar, marcha atrás y molduras.
   - `carkit/grilles.py`: parrillas y tomas en 3D: marco con volumen sobre el borde del corte, barras con
     sección y profundidad, mallas de panal o rombos con paredes reales y travesaños.
   - `carkit/mirrors.py`: espejos con carcasa en gota orientada hacia el conductor, espejo hundido dentro
     de un borde fino, pie corto, brazo aerodinámico o brazos de utilitario con espejo partido, y repetidor.
   - `carkit/styles.py`: emblemas, ópticas clásicas (redondas, cuádruples), labio, ganchos, antinieblas.
   - Además: manijas, limpiaparabrisas, antena, pasarruedas y agregados de variantes (cartel de taxi,
     barra de luces, defensa).
5. **Interior** (`carkit/interior.py`): carcasa interna, butacas, banqueta, tablero con pantalla, volante,
   consola, piso y bandeja.
6. **Exportación** (`carkit/export.py`): oclusión ambiental horneada por vértice con Cycles, un nodo por rol
   del juego (pintura, molduras, vidrio, lente, cromo, faros, pilotos, giros, extra) y un segundo nivel de
   detalle (`<rol>_lo`) decimado con las normales del original.

## Comandos

```sh
# renders de control (Cycles CPU) en <salida>_<vista>.png
blender -b --python tools/blender/car_build.py -- sedan /tmp/sedan preview q34f,side,q34r,front studio
# exportar para el juego y comprimir
blender -b --python tools/blender/car_build.py -- sedan /tmp/sedan export
npx gltfpack -i /tmp/sedan.glb -o assets/cars/sedan.glb -cc -kn -vp 16 -vn 10 -vc 12
cp /tmp/sedan.json assets/cars/sedan.json
```

Las variantes (`taxi`, `patrulla`) sólo exportan sus agregados; el juego los suma a una copia del sedán.

Vistas de control útiles además de las generales: `fr34`, `rr34`, `face` y `lamp` (trompa y faro),
`tail` (cola), `mirror` y `mirror_r` (espejo desde adelante y desde atrás); se calculan para cada modelo.
