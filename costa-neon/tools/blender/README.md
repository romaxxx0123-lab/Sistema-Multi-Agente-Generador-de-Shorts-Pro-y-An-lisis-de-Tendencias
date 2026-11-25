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
4. **Piezas** (`carkit/dress.py`): proyectores, línea LED, intermitentes, firma de los pilotos, lamas de
   parrilla, espejos con repetidor, manijas, limpiaparabrisas, antena, emblemas, pasarruedas y agregados
   de variantes (cartel de taxi, barra de luces, defensa).
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
