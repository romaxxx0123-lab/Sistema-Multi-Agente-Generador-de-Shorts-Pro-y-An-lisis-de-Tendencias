# Lo siguiente que toca

## Mezclar las pistas de audio cuando hay más de una

Lo encontró la prueba de montar un vídeo entero. Una captura de juego con OBS
suele traer **dos pistas**: el juego en una y el micrófono en otra. Todo el
pipeline usa una sola —la primera que elige ffmpeg— y la otra se pierde.

Medido sobre un fichero con el juego delante y la voz detrás:

```
silencios encontrados: []      <- el juego suena todo el rato
recorte: 0%
la voz no llega ni al análisis ni al vídeo exportado
avisos: ninguno
```

Sin un solo error por ningún lado. Ahora **avisa** (`_warn_multitrack`), que es
lo mínimo, pero avisar no lo arregla.

Lo que hace falta:

- que `MediaInfo` ya trae todas las pistas (`audio_streams`) —hecho—, y que el
  análisis **elija la de voz midiendo**, no por posición: una pista de voz tiene
  silencios y un rango de nivel amplio; la del juego suena continua;
- que el análisis (el WAV de 16 kHz) salga de **esa** pista;
- que el render **mezcle todas**, con el juego agachado bajo la voz —la cadena
  de *sidechain* ya existe para la música, en `render/graph.py`— para no perder
  el sonido del juego, que en un gameplay es la mitad del vídeo;
- y que el EDL lleve qué pista es cuál, para poder enseñarlo y cambiarlo.

Ojo con un detalle del grafo: `[0:a]` se puede referenciar varias veces porque
ffmpeg parte solo las entradas de fichero, pero la salida de un `amix` no: hace
falta un `asplit` con tantas salidas como clips.

## Y lo que se reportó pero no se tocó

- **`gaming-hype` (18–48 cortes/min)** no alcanza su banda sobre una guía
  hablada: da 9,6, porque el único sitio donde se puede cortar son las pausas. O
  esa banda asume material de montaje (gameplay sin voz continua) y hay que
  decirlo, o el planner necesita una segunda fuente de cortes (planos, beats).
  Hoy el medidor lo llama **descompensado** —le falta ritmo donde importa y le
  sobra carga donde no— y el balanceador poda lo que puede sin abrir un hueco,
  pero no se inventa cortes. `vlog` sí llega a su banda (8,6 sobre un mínimo
  de 8).
- **`documentary`** pide entre 15% y 45% de metraje con material de apoyo y aquí
  no hay banco de b-roll instalado: el proveedor `self` da el 3,9%. Medido sobre
  la guía de 20 minutos: de **171 momentos** en los que se nombra algo
  distintivo, **148 no tienen ningún material** que enseñar, porque sin banco el
  proveedor `self` solo puede devolver un recuerdo de algo que ya se vio en
  pantalla. Aflojar eso sería volver al fallo que se arregló —insertar el plano
  con más contraste del vídeo y anunciarlo como "material de apoyo porque ahí
  hablas de X"—, así que **no se toca**: hace falta un banco, no un umbral más
  bajo.
- **El master sale a −17 LUFS** con el objetivo en −14. Es la decisión escrita en
  `_plan_master` (no aplastar la voz para cuadrar un número) y lo reporta en
  `measured_lufs`. Con una voz más comprimida de origen llegará más cerca.
