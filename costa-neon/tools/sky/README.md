# Cielos fotografiados

Los cielos de día del juego son fotos HDR reales de 360° de [Poly Haven](https://polyhaven.com) (dominio
público, CC0), preparadas con `make_sky.py`:

- `assets/sky/<id>.webp`: fondo (de +90° a −11,25°) en radiancia lineal escalada, codificado en sRGB.
- `assets/sky/<id>_env.png`: esfera chica RGBE para la luz ambiente (sin el disco del sol; abajo, el suelo
  iluminado por ese cielo).
- `assets/sky/sky.json`: posición, color e intensidad del sol, escala del fondo y luz difusa.

La escala lleva la foto a unidades del juego con modelos físicos de cielo despejado (Haurwitz para la
irradiancia global, Meinel para la directa): la proporción entre sol y cielo es la de la foto cuando el sol se
ve; si está tapado o muy bajo, el sol sale del modelo (intensidad y color según la masa de aire).

```sh
# todos los cielos del juego (descarga los HDR de 4k y regenera assets/sky)
tools/sky/batch_skies.sh /tmp/cielos assets/sky
# vistas de referencia a la altura de los ojos de un HDR urbano (para comparar capturas con fotos reales)
python3 tools/sky/ref_views.py calle_2k.hdr /tmp/ref 0,90,180,270 60 -3
```

En el juego (`src/world/hdriSky.js`) cada cielo se gira para que su sol coincida con el del juego, se mezclan
los dos más cercanos según la altura del sol (mañana y tarde por separado) y un tercero según el clima.
De noche sigue el cielo procedural (estrellas, luna y resplandor de la ciudad).
