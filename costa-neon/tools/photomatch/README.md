# Calcar un auto real de una foto (photomatch)

Método para que un modelo de `tools/blender/carkit` reproduzca una foto real: el auto se renderiza dentro de
la **misma panorámica HDR** donde se tomó la foto, con la **misma cámara** y en la **misma pose** que el auto
real, y el render se compone sobre la foto con el mismo tone mapping (AgX). Cada diferencia de forma, de
material o de luz queda a la vista, y se corrige el diseño hasta que coincidan.

Primer caso: `rural` (familiar, `carkit/design_rural.py`), copiado del Serie 3 Touring F31 que aparece en la
panorámica `urban_street_04` de Poly Haven (CC0). Sin logos ni letras de la marca.

## Pasos

1. **Foto en máxima resolución.** Bajar la panorámica (Poly Haven tiene hasta 20k) y recortar la franja donde
   está el auto (Blender lee el HDR en C, mucho más rápido que Python):
   `blender -b --python band.py -- urban_street_04_20k.hdr band20k.npy col0 col1 fila0 fila1`
2. **Vistas con la convención de Blender** (z arriba, equirectangular de Cycles; ojo: es fácil sacar la foto
   espejada): `python3 photo.py band20k.npy v_car 1600 1000 15 -72.8 -3.6` → `v_car.png/.npy/.json`.
3. **Cámara y pose.** Medir en la foto puntos de medida conocida (centros y labios de las llantas, batalla,
   patente de 520 × 111 mm) con `ruler.py` (regla de píxeles) y ajustar por mínimos cuadrados la altura de
   la cámara, la inclinación del horizonte de la panorámica y la pose del auto: `fitcam.py` → `fit.json`;
   `mkscene.py` arma `scene.json` (cámara, pose, exposición).
4. **Medir la carrocería en la foto.** `grid.py` proyecta grillas en metros (costado, frente, planta) sobre la
   foto; `meas.py` corta rayos de píxeles con planos del auto; y `photomatch.py` con `PICK=puntos.json`
   proyecta píxeles de la foto **sobre la carrocería del modelo** (así se calcan faros, parrilla, tomas,
   líneas y pilares en las coordenadas del diseño).
5. **Render y superposición** (Cycles, fondo transparente, piso atrapasombras con albedo de asfalto):
   `blender -b --python ../blender/photomatch.py -- rural r/it.npy scene.json 1600 1000 40`
   `python3 comp.py r/it.npy scene.json r/it [x0,y0,x1,y1]` → `_comp` (render sobre la foto), `_sbs` (foto |
   render), `_ghost` (mitad y mitad) y `_edges` (bordes de la foto en rojo y del modelo en celeste).
6. **Corregir e iterar**: proporciones y pilares con `_edges`, detalles con los recortes `_sbs`, materiales
   comparando valores lineales de zonas (puertas, capó, frente) entre foto y render.

## Lo que enseñó el primer auto

- Las líneas medidas a mano dejan la chapa ondulada: se ajustan polinomios de grado bajo por tramos
  (`_smooth` en `design_rural.py`) y se controla que la curvatura no cambie de signo sin motivo.
- Un auto real no es recto: puertas abombadas en sección, ensanches sobre las ruedas, líneas que suben en
  curva, y relieves chicos (`carkit/sculpt.py`): nervios del capó, canto de la línea de carácter, zona
  cóncava bajo la línea baja, estante del paragolpes, marcos de las tomas.
- La parrilla de riñones no es un rectángulo (`sculpt.kidney`).
- Pintura con barniz: el brillo es del barniz; la base casi no refleja (si no, se ve plástico satinado).
  El auto de la foto tenía polvo: capa difusa más espesa arriba.
- Todo lo que rodea al auto se refleja en él: el piso atrapasombras tiene que ser asfalto, no blanco.
