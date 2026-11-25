# Texturas escaneadas

Las capas de suelo (asfalto, veredas, plazas, pasto, arena, hormigón, grava, madera, cordones, fondo marino) y
de fachadas (revoque, hormigón visto, ladrillo, chapa, corteza de palmera, pintura) son escaneos de
superficies reales de [Poly Haven](https://polyhaven.com) (dominio público, CC0), preparados con
`make_textures.py`:

- `<capa>_a.webp`: albedo (sRGB).
- `<capa>_n.jpg`: normal (x, y) y altura (azul), JPEG sin submuestreo de color.
- `<capa>_r.jpg`: rugosidad (rojo) y oclusión (verde), a media resolución.
- `textures.json`: tamaño real de cada textura (m), modo, ganancia y color medio.

Los suelos son albedo absoluto calibrado a valores reales (vereda de hormigón ~30 %, asfalto gastado ~12 %,
arena clara ~36 %). Las de fachada son moduladores (se dividen por su color medio) que se tiñen con el color
de cada edificio. El juego las empaqueta en la placa de video en los mismos arrays de capas que usaban las
texturas procedurales; si no se pueden cargar (HTML abierto sin servidor), quedan las procedurales.

```sh
python3 tools/textures/make_textures.py /tmp/texturas assets/textures 1024
```
