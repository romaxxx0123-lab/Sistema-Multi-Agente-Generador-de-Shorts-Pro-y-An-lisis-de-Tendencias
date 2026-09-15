# Cómo se encuentra el material de apoyo, y qué falla

Sugerencia recibida: *"un modelo local que busque el material"*. No se adopta sin
analizarla. Lo que sigue es, primero, lo que hace hoy el sistema cuando busca
material (comprobado en el código, no de memoria); después, los cuatro fallos
que eso tiene; y al final qué pasa si se mete un modelo local, y qué sale
mejor por ahora.

---

## Lo que hoy hace, exactamente

Buscar material es una sola operación léxica, en `assets/providers.py`:

1. El planner nombra una **cabeza** (lo concreto que se dice ahí) y un contexto.
2. Cada proveedor devuelve candidatos y `assets/coherence.py::judge` exige que la
   cabeza esté **entre las etiquetas** del material.
3. El primero que **quepa** (`plan/broll.py::fit_asset`) entra en el montaje.

Es decir: la decisión se toma comparando **palabras con palabras**. Nadie mira
nunca el material.

---

## Fallo 1 — nadie mira los píxeles de lo que se inserta

Buscado en todo el árbol: no hay una sola medida de brillo, nitidez, contraste
ni movimiento aplicada a un material de apoyo. Lo único que se parece es
`focus_at()`, y eso mide el **vídeo de origen**, no el material que se le pega
encima.

Consecuencia: un clip negro, uno desenfocado, uno ampliado desde 160×90, o un
"vídeo" que en realidad es un fotograma congelado, entran en el montaje si el
nombre del fichero lleva la palabra correcta. Y de un banco de stock entran
**sin haberlos visto nadie**: el renderer los descarga y los pega.

Esto es el fallo más gordo de los cuatro, porque es el que se ve en pantalla.

## Fallo 2 — una biblioteca bien ordenada es invisible

`LocalProvider._tags_for` saca las etiquetas de dos sitios: `tags.json` y el
**nombre del fichero** (`path.stem`). `search()` recorre subcarpetas con
`rglob("*")`, pero **el nombre de la carpeta no es una etiqueta**.

Así que la forma natural de ordenar material:

```
assets/palworld/base-01.mp4        -> etiquetas: ["base"]
assets/minecraft/base-01.mp4       -> etiquetas: ["base"]
```

deja las dos piezas indistinguibles y, peor, sin la cabeza que las salvaría:
hablas de Palworld, la cabeza es `palworld`, `judge` no la encuentra en
`["base"]` y el material propio **se descarta**. Quien ordena por carpetas -- o
sea, todo el mundo -- tiene una biblioteca que no se usa nunca.

## Fallo 3 — al material propio no se le mide nada, así que "según lo que consigue" no se aplicaba

`LocalProvider` construye el `Asset` sin `width`, sin `height` y sin
`duration`: se quedan en 0. Y `fit_asset` está escrito para trabajar con esos
tres datos:

```python
if asset.duration > 0:            # 0 -> no se recorta el hueco
    seconds = min(seconds, asset.duration)
if asset.height <= 0:             # 0 -> se acepta el modo del estilo sin más
    return mode, seconds
```

Resultado: toda la lógica de "adáptate a lo que has conseguido" -- no durar más
que el material, no ampliar un 480p a pantalla completa, pasar a ventanita lo
vertical -- **sólo se aplicaba a los bancos de stock**, que sí mandan metadatos.
Con tu propia biblioteca se saltaba entera. Un clip de 2 s en un hueco de 5 s se
repite a la vista, y uno vertical se recorta hasta dejar una rendija.

## Fallo 4 — a los bancos se les pregunta en un idioma y se les exige responder en otro

Ninguna de las dos peticiones lleva idioma:

```python
{"query": query.text, "per_page": ..., "orientation": ...}          # Pexels
{"key": ..., "q": query.text, "per_page": ..., "safesearch": ...}   # Pixabay
```

Se les manda "impresora" y contestan con etiquetas en inglés (`printer`,
`office`, `paper`). Y después `judge(subject_first=False)` exige que
**"impresora"** esté entre esas etiquetas. No está nunca. Es decir: la regla de
coherencia que añadí para que no salga Minecraft cuando hablas de Palworld ha
dejado el camino del stock **prácticamente muerto** para quien habla español.

Pixabay acepta `lang=es` (y localiza sus etiquetas). Pexels acepta
`locale=es-ES` para buscar, pero responde siempre en inglés y no manda
etiquetas: lo único que hay es el título dentro de la URL.

---

## Y ahora la sugerencia: un modelo local que busque el material

Hay dos modelos posibles detrás de esa frase, y no son el mismo.

### (a) Un modelo que mire las imágenes (CLIP)

Puntuar cada candidato por lo que **se ve** en él, en vez de por su etiqueta.
Es la idea buena de los fallos 1 y 2 a la vez.

Lo que hay a favor: `analysis/vision.py` ya tiene el cargador ONNX, y
`onnxruntime 1.30` está instalado y funciona en este entorno.

Lo que lo bloquea, comprobado:

- **No hay pesos y no se pueden traer.** `~/.cache/videoforge/models` está
  vacío y HuggingFace responde 403 en el CONNECT por política del proxy. No se
  desactiva la verificación TLS ni se rodea la política: eso no se toca.
- **Haría falta el codificador de texto, que no existe aquí.** `vision.py` evita
  el tokenizador a propósito: compara fotogramas contra etiquetas de un
  vocabulario fijo **con su embedding ya calculado**. Una consulta hablada
  cualquiera ("la pestaña de ajustes de red") no está en ningún vocabulario
  fijo, así que para la sugerencia tal cual haría falta además el codificador
  de texto y su BPE. Es bastante más de lo que hay montado.
- **Y sobre todo: no se podría medir.** Sin pesos no hay antes/después, y este
  proyecto no mete una función que no se pueda demostrar. Las 62 trampas del
  detector están ahí justamente porque cada cosa que entra se mide.

Veredicto: **no ahora**, y no por falta de ganas -- por falta de pesos
verificables. Lo que sí se hace es dejar el sitio hecho: la inspección del
fallo 1 devuelve un objeto por candidato, y ahí es donde un puntuador aprendido
entra sin tocar nada más.

### (b) Un modelo que traduzca lo que dices al idioma del índice

Éste es el que de verdad hace falta, y es el hallazgo del análisis: lo que
rompe el camino del stock (fallo 4) no es que no se sepa mirar las imágenes, es
que **tus palabras y el índice del banco no están en el mismo idioma**. Un
traductor local pequeño (opus-mt es→en en ONNX, ~80 MB) arreglaría eso entero.

Mismo bloqueo: los pesos no se pueden traer ni verificar aquí. Así que se hace
la parte que sí se puede: un **puente explícito** -- protocolo `Translator` con
un glosario curado de los términos que de verdad se nombran en una guía -- que
es honesto sobre su límite (si el término no está, no hay resultado de stock, y
un hueco no se nota) y deja el modelo enchufable el día que los pesos estén.

---

## Lo que se hace, entonces

Por orden de lo que se nota en pantalla:

1. **Mirar el material antes de meterlo** (`assets/inspect.py`): brillo,
   contraste, nitidez local, movimiento y barras negras. Se aplica al material
   de tu biblioteca al elegirlo, y al de stock **después de descargarlo**, antes
   de renderizar.
2. **Las carpetas son etiquetas**, en orden, con la de fuera como sujeto.
3. **Medir el material propio** (tamaño y duración reales) para que `fit_asset`
   deje de estar ciego con tu biblioteca.
4. **Mandar el idioma a los bancos**, y el puente de términos para que la regla
   de coherencia pueda cumplirse de verdad en vez de rechazarlo todo.

### Los umbrales, medidos y no inventados

Set de calibración generado con ffmpeg (14 clips: bueno, negro, blanco, oscuro,
quemado, plano, desenfocado, ampliado desde 160×90, congelado, degradado suave,
buzón 2.35:1, barras laterales, bokeh uniforme, y **bokeh de verdad** -- sujeto
nítido sobre fondo desenfocado, que es el caso que no se debe rechazar).

| medida | cómo | peor aceptado | mejor rechazado | umbral |
|---|---|---|---|---|
| nitidez | máx. varianza del laplaciano en rejilla 4×4, a 360 px de alto | 422 (oscuro) · 465 (bokeh real) | 70 (desenfoque uniforme) · 63 (ampliado) | **120** |
| brillo | media 0..1 | 0.79 (quemado) | 0.00 (negro) · 1.00 (blanco) | **[0.05, 0.93]** |
| contraste | desviación típica 0..1 | 0.077 (quemado) | 0.007 (degradado) · 0.032 (plano) | **0.05** |
| movimiento | dif. media entre fotogramas muestreados | 0.0039 (barras laterales) | 0.0000 (congelado) | **0.002** |

La nitidez se mide por **rejilla y máximo**, no por media, y ése es el detalle
que importa: un plano con el sujeto enfocado y el fondo desenfocado tiene media
baja (113) pero un cuadro nítido (465), mientras que uno ampliado o desenfocado
entero no tiene ninguno (63 y 70). Con la media, el bokeh legítimo se habría
tirado; con el máximo, se queda. Y el ruido no lo falsea: el degradado con ruido
añadido se queda en 34.

El umbral de nitidez se pone en 120 y no en 200 a propósito: entre lo peor
aceptado (422) y lo mejor rechazado (70) hay un factor de 6, y se elige el lado
que **no** tira material válido. Un hueco no se nota; una imagen mala la ve todo
el mundo -- pero un material bueno tirado tampoco se recupera.

---

## Resultado

Lo medido, con los umbrales de la implementacion real (ffmpeg + numpy, que no
son exactamente los del prototipo: el escalado bilineal de ffmpeg cambia el
detalle fino, y por eso se volvieron a medir todos los casos):

**Los 13 casos del juego de calibracion, uno por uno** (`test_inspeccion.py`):

| caso | nitidez | veredicto |
|---|---|---|
| bueno | 403 | pasa |
| oscuro (−0.42 de brillo) | 212 | pasa, y **sin recortarle barras** |
| sujeto enfocado sobre fondo borroso | 195 | pasa |
| buzon 2.35:1 | 269 | pasa, recorte 1280x360+0+180 |
| barras laterales | 356 | pasa, recorte dentro del contenido real |
| imagen fija (JPEG) | 267 | pasa |
| desenfoque uniforme | 21 | fuera |
| ampliado desde 160x90 | 16 | fuera |
| desenfocado entero | 1 | fuera |
| plano / degradado | 6 / 9 | fuera (contraste) |
| negro / blanco | 0 | fuera (exposicion) |
| quemado | 139 | fuera (exposicion) |
| **congelado** | 435 | fuera (movimiento) |

El congelado es el que justifica medir el movimiento: cada fotograma suyo esta
nitido y bien expuesto, y con cualquier medida estatica pasa.

**Lo demas, con su prueba de que antes fallaba:**

- Biblioteca por carpetas: dos ficheros llamados igual (`base-nocturna.mp4`) en
  `palworld/` y en `minecraft/`; hablando de Palworld sale **uno**. Antes no
  salia ninguno.
- Material propio medido: un clip de 2 s en un hueco de 5 s ya no estira el
  hueco; un 720x1280 pasa a ventanita; un 320x180 no se usa en un 1080p.
- Bancos: `lang=es` a Pixabay y `locale=es-ES` a Pexels, se busca `printer`
  cuando dices "impresora", y un resultado etiquetado `printer, office, paper`
  pasa la coherencia -- mientras que uno etiquetado `cat, animal, pet` sigue sin
  pasarla, que es el motivo de que la regla exista.
- Lo descargado se mira: un montaje cuyo unico material de apoyo resulta ser un
  clip negro sale sin el y lo dice ("1 materiales descartados al verlos").

Y lo que **no** se ha hecho, dicho para que no se repita la pregunta: no hay
puntuacion visual con CLIP ni traductor neuronal. No por descarte de la idea --
las dos son mejores que lo que hay -- sino porque sus pesos no se pueden traer
ni verificar en este entorno, y una funcion que no se puede medir no entra. El
sitio donde enchufarlas queda hecho: `Inspection` para la puntuacion visual y el
protocolo `Translator` para la traduccion.
