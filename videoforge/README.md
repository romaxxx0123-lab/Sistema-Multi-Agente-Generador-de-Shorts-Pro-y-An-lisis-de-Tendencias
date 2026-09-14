# VideoForge

Subes un video, lo entiende, lo **monta de verdad** y **mide que no quede sobresaturado**.

No es un generador de plantillas: analiza el material real (planos, movimiento, voz,
texto en pantalla), decide un montaje explicable y lo renderiza con FFmpeg a un MP4
que puedes subir tal cual.

Todo el analisis corre **en local y con modelos libres**. Sin APIs de pago.

## Estado

| Fase | Contenido | Estado |
|---|---|---|
| F0 | Scaffold, toolchain, cache, CLI | hecho |
| F1 | Ingesta y analisis (planos, movimiento, audio, transcripcion) | hecho |
| F2 | EDL, estilos y planner | hecho |
| F3 | Renderer FFmpeg | hecho |
| F4 | Motor de saturacion y auto-balanceador | hecho |
| F5 | Comprension de contenido y b-roll | hecho |
| F6 | API y UI web | hecho |

## Requisitos

- Python 3.10 o superior
- FFmpeg 6+ con los filtros `zoompan`, `overlay`, `ass`, `loudnorm` y `sidechaincompress`
- Opcional: GPU NVIDIA con driver 570+ y CUDA 12.8+ para acelerar transcripcion y render

## Instalacion

### CachyOS / Arch (recomendado)

```bash
sudo pacman -S ffmpeg python
cd videoforge/backend
python -m venv .venv && source .venv/bin/activate
pip install -e .
```

### Windows

Instala FFmpeg (`winget install Gyan.FFmpeg`) y luego:

```powershell
cd videoforge\backend
python -m venv .venv; .\.venv\Scripts\Activate.ps1
pip install -e .
```

Si FFmpeg no esta en el PATH, indica su ruta con `FORGE_FFMPEG` y `FORGE_FFPROBE`.

### Extras opcionales

```bash
pip install -e ".[speech,audio,vision,ocr]"   # analisis completo en CPU
pip install -e ".[speech,audio,vision-gpu]"   # con aceleracion NVIDIA
pip install -e ".[dev]"                       # tests
```

## Uso

```bash
forge doctor                 # comprueba entorno, filtros, GPU y perfil elegido
forge probe video.mp4        # metadatos del video
forge make-fixture t.mp4     # genera un video de pruebas sin descargar nada
forge analyze video.mp4      # analiza: planos, movimiento, silencios, voz
forge styles                 # estilos de montaje disponibles
forge plan video.mp4         # decide el montaje (sin renderizar)
forge render video.mp4       # monta y saca el MP4 de verdad
forge saturation video.mp4   # mide si esta sobresaturado
forge identify video.mp4     # dice de que va el video
forge serve                  # levanta la API web
forge cache info video.mp4   # que hay cacheado de ese video
forge cache clear video.mp4  # lo borra
```

### `forge analyze`

```bash
forge analyze guia.mp4                 # analisis completo
forge analyze guia.mp4 --no-speech     # sin transcripcion (mucho mas rapido)
forge analyze guia.mp4 --tier max      # Whisper large-v3 si tienes GPU
forge analyze guia.mp4 --lang es       # fuerza el idioma
forge analyze guia.mp4 --force motion  # rehace solo esa etapa
forge analyze guia.mp4 --json          # analisis completo en JSON
```

Cada etapa (sondeo, proxy, movimiento, planos, audio, transcripcion) se cachea
por separado. Repetir el comando sobre el mismo fichero es instantaneo, y si el
analisis se interrumpe a mitad, al reintentar retoma donde iba en vez de
empezar de cero. Esto es lo que hace llevadero el formato largo.

Que se mide:

| Etapa | Que saca | Para que sirve al montar |
|---|---|---|
| planos | cortes de escena | no cortar dentro de un plano ni repetir encuadre |
| movimiento | curva de flujo optico | no meter zoom donde ya hay mucho movimiento |
| audio | silencios y sonoridad EBU R128 | quitar tiempo muerto y masterizar el audio |
| voz | transcripcion con tiempos por palabra | subtitulos karaoke, cortes limpios y capitulos |

Si falta alguna pieza opcional el analisis no se cae: avisa y sigue con lo que
tiene. Sin `faster-whisper` no hay transcripcion, pero el resto del analisis se
completa igual.

Empieza siempre por `forge doctor`: detecta la GPU, verifica que tu build de FFmpeg
trae los filtros necesarios y te dice con que perfil va a trabajar. Si la GPU no es
utilizable lo avisa y sigue en CPU, nunca se cae.

## Configuracion

Todo se ajusta por variables de entorno:

| Variable | Para que sirve |
|---|---|
| `FORGE_DEVICE` | `auto` (por defecto), `cuda` o `cpu` |
| `FORGE_TIER` | `light`, `balanced` (por defecto) o `max` |
| `FORGE_CACHE_DIR` | Donde se guarda el analisis. Por defecto `~/.cache/videoforge` |
| `FORGE_FFMPEG` / `FORGE_FFPROBE` | Rutas explicitas a los binarios |
| `FORGE_THREADS` | Hilos de FFmpeg; `0` deja que decida el |
| `FORGE_FULL_HASH` | `1` para hashear el fichero entero en vez de muestrear |

El **perfil** (`FORGE_TIER`) decide solo el tamano de los modelos, cada cuanto se
muestrean fotogramas y la resolucion de analisis. En `max` con GPU usa Whisper
large-v3; en `light` en CPU usa Whisper base. El render final siempre parte del
video original a resolucion completa, sea cual sea el perfil.

## Desarrollo

```bash
cd videoforge/backend
.venv/bin/python -m pytest -q
```

Los tests generan su propio video de prueba con FFmpeg, asi que no dependen de
ningun fichero externo ni de la red.


## Como decide el montaje

`forge plan` produce un **EDL** (Edit Decision List): un JSON con todas las
decisiones de edicion, que puedes revisar antes de gastar un render.

```bash
forge plan guia.mp4 --style tutorial --intensity 50 -o montaje.json
```

El EDL separa dos cosas a proposito:

- **`timeline`** son los cortes: que trozos entran y en que orden. Solo esto
  determina la duracion.
- **`effects`** es todo lo que se superpone: subtitulos, zooms, b-roll, rotulos,
  transiciones, color.

De ahi sale el invariante en el que se apoya el motor de saturacion de F4:
**quitar o anadir efectos nunca cambia la duracion del video**, asi que el
auto-balanceador puede podar sin descuadrar nada.

Cada efecto lleva su propia justificacion, y es lo que se muestra al revisarlo:

```
punch_in   zoom a (58%, 41%): la atencion se concentra ahi y el plano esta quieto
caption    subtitulo: "abrimos el menu de ajustes"
text_card  rotulo de capitulo en 1:37
```

### Que hace el planner, en orden

1. **Seleccion** — recorta silencios y muletillas. En una guia de 20 minutos
   suele quitar entre un 15% y un 25%. Cruza dos senales independientes para no
   equivocarse: la deteccion de silencios es acustica y podria marcar como
   silencio una palabra dicha en voz baja, asi que antes de recortar se restan
   los intervalos de las palabras transcritas. **Nunca se corta dentro de una
   palabra.**
2. **Subtitulos** — agrupa las palabras en lineas partiendo por las pausas del
   habla, no solo por numero de caracteres, y sin cruzar nunca un corte.
3. **Enfasis** — zoom hacia el punto de atencion, pero solo si se cumplen tres
   condiciones a la vez: hay algo concreto que enfocar (la saliencia esta
   concentrada), el plano no se mueve ya demasiado, y ha pasado el tiempo
   minimo desde el zoom anterior. Si no, no hay zoom.
4. **Capitulos** — busca las pausas largas en el **original** (el corte se las
   come, asi que buscarlas en el montaje no serviria) y mide la duracion minima
   en el **montaje**, que es lo que vera el espectador.
5. **Transiciones y color** — segun el estilo.

### Estilos

| Estilo | Para que |
|---|---|
| `tutorial` | Guias y explicaciones en formato largo. El principal. |
| `gaming-hype` | Clips cortos de gameplay, ritmo alto. |
| `documentary` | La voz manda y el b-roll ilustra. |
| `cinematic` | Pocos cortes, respiracion larga, casi sin texto. |
| `vlog` | Ritmo medio. |
| `clean-corporate` | Formacion interna, sin artificio. |

Los estilos son ficheros JSON en `backend/styles/`. Anadir uno nuevo no requiere
tocar codigo: define su ritmo, sus subtitulos, sus zooms y **sus bandas de
saturacion** (lo que en una guia es sobrecarga, en un short es lo normal).


## El render

```bash
forge render guia.mp4 --style tutorial -o guia-editada.mp4
forge render guia.mp4 --preview          # rapido y a baja resolucion, para revisar
forge render --from-edl montaje.json     # renderiza un EDL ya revisado
```

Lo que sale es un MP4 listo para subir: cortes reales, zooms, subtitulos
quemados, color y audio masterizado.

### Como se construye

El EDL se compila a un unico `filter_complex` de ffmpeg, siguiendo la misma
separacion que el EDL: primero cada clip por separado (recorte, velocidad,
escalado y zooms), despues la concatenacion, y encima de la linea de tiempo
completa el color, las transiciones y los subtitulos.

Tres decisiones que no son obvias:

- **Los zooms usan `zoompan`, no `crop`.** `crop` solo recorta en pixeles
  enteros, asi que un zoom lento tiembla. Ojo con sus coordenadas: `x` e `y` van
  en el espacio de la imagen *de entrada*, no de la ya ampliada. Confundirlos
  descentra el encuadre sin que ninguna cifra lo delate, por eso hay un test que
  compara el fotograma renderizado contra el recorte esperado.
- **Las transiciones son `fade`, no `xfade`.** `xfade` solapa los clips y por
  tanto acorta el video, lo que romperia el invariante de que los efectos no
  cambian la duracion. Un dip al negro mantiene la duracion exacta.
- **Los subtitulos son un fichero `.ass`**, no `drawtext`. Da karaoke real
  palabra a palabra, contorno y sombra de verdad, y un solo filtro para todo el
  video aunque haya cientos de lineas.

### Calidad

El audio se masteriza **en dos pasadas**: primero se mide la sonoridad del
montaje ya cortado y despues se normaliza con esas medidas. `loudnorm` en una
sola pasada es dinamico y bombea; con las medidas reales la correccion es lineal.
El objetivo es −14 LUFS con pico real por debajo de −1.5 dBFS, que es el
estandar de las plataformas.

Antes de cada render se valida el grafo **con un segundo de video** contra
`null`. Un error de filtros salta en un segundo en vez de a los diez minutos.

Si hay GPU NVIDIA con NVENC se usa automaticamente; si no, libx264. `--no-gpu`
lo fuerza por CPU.


## El medidor de saturacion

Esta es la parte que evita el problema de casi todo editor automatico: pasarse.

```bash
forge saturation guia.mp4                      # solo medir
forge saturation guia.mp4 --balance -o ok.json # medir y corregir
forge render guia.mp4 --balance                # corregir y renderizar
```

```
saturacion    54/100  en el punto
escala        0 |sub-editado| 28 |en el punto| 68 |cargado| 85 |sobresaturado| 100

Densidad a lo largo del montaje
  ..:-=+**=-::..:-==+*#%#*+=-:..:--==+*=-::...
```

**La escala no es absoluta.** La misma carga es "en el punto" en `gaming-hype` y
"sobresaturado" en `tutorial`. Cada estilo trae sus bandas y el diagnostico se
hace contra las suyas.

### Como se mide

La senal `D(t)` estima la carga visual segundo a segundo. Tres ideas la sostienen:

1. **No todos los efectos pesan igual.** Un subtitulo acompana; un b-roll a
   pantalla completa sustituye lo que estabas viendo.
2. **Los cortes tambien cargan**, aunque no lleven nada encima. Un corte es un
   evento cognitivo. Sin contarlos, un montaje a 40 cortes por minuto sin
   efectos daria "sub-editado", que es justo lo contrario de la verdad.
3. **La fatiga se arrastra.** Un golpe deja resaca, asi que la senal se
   convoluciona con un nucleo que sube rapido y baja despacio.

Sobre eso se calculan diez metricas: cortes por minuto, densidad media y de
pico, cobertura de overlay y de texto, capas simultaneas, SFX y transiciones por
minuto, velocidad de lectura de los subtitulos, y **conflictos de movimiento**
(zooms sobre planos que ya se mueven, que marean y que ninguna otra metrica ve).

Hay una distincion que importa: las metricas cuya banda empieza en cero son
**techos**, no objetivos. Cero conflictos de movimiento es lo ideal, no una
carencia, asi que solo pueden empujar hacia la saturacion, nunca hacia la
carencia, y si no son problema ni siquiera puntuan.

### El auto-balanceador

Con `--balance` no solo mide: corrige. Es un bucle de control determinista que
busca la ventana mas caliente de la curva y quita de ahi el efecto con peor
relacion valor/coste, hasta entrar en banda. Si el montaje se queda corto,
asciende candidatos que el planner ya habia validado pero no habia llegado a
poner.

**Nunca toca los cortes, solo los efectos**, asi que la duracion del montaje no
cambia por mucho que pode. Los efectos que fijes (`locked`) son intocables.

No hay lista de prioridades escrita a mano: el orden sale solo de la eficiencia
(valor / coste). Los subtitulos, con valor alto y coste bajo, sobreviven a casi
todo; las transiciones decorativas y los efectos de sonido caen primero. Y cada
retirada se explica:

```
- quitado sfx en 64.0s: era lo que menos aportaba (0.20 de valor por 0.80 de
  carga) en el tramo mas cargado (63.5-66.5s)
```

El deslizador `--intensity` reescala las bandas: a 0 pide un montaje sobrio (y
el balanceador poda mas), a 100 admite mucha mas carga.


## Material de apoyo (b-roll)

```bash
forge render guia.mp4 --broll            # inserta material donde toca
forge render guia.mp4 --broll --offline  # solo material local, sin internet
```

El problema no es conseguir b-roll, es saber **cuando merece la pena**. Meterlo
cada X segundos es exactamente lo que delata a un editor automatico.

VideoForge lo coloca donde se esta **nombrando algo concreto**. Para detectarlo
puntua las palabras con TF-IDF sobre el propio transcript: una palabra que
aparece mucho en este tramo pero poco en el resto del video es justo lo que ese
tramo esta tratando. No hace falta ningun modelo de lenguaje, no depende del
idioma, y la decision se explica sola:

```
material de apoyo en 60s porque ahi hablas de 'chrome' · de tu biblioteca,
coincide en: chrome
```

### De donde sale el material

| Proveedor | Necesita | Notas |
|---|---|---|
| `self` | nada | Del propio video, eligiendo los planos con mas interes visual. Siempre disponible. |
| `local` | tu carpeta `assets/broll/` | Etiquetas del nombre del fichero o de un `tags.json`. |
| `pexels` | `PEXELS_API_KEY` (gratuita) | Opcional. |
| `pixabay` | `PIXABAY_API_KEY` (gratuita) | Opcional. |

Nunca se repite el mismo recurso, y si un banco esta caido o no hay red, el
montaje sigue con lo que tenga. Los creditos de licencia se emiten aparte.

Un detalle que importa: a diferencia de un zoom, un b-roll a pantalla completa
**no** esquiva los cortes, los tapa. En una guia muy recortada los cortes caen
cada pocos segundos, asi que exigirle que no los cruce dejaria el montaje sin un
solo material de apoyo.

### Efectos de sonido

Se **sintetizan** con numpy (barrido, golpe, subida y clic) en vez de
distribuir ficheros. No es una limitacion: es la unica forma de traer efectos
sin arrastrar un problema de licencias, y permite afinarlos sin buscar otro
fichero.

## Identificar el contenido

```bash
forge identify guia.mp4
```

Ninguna senal decide sola:

| Senal | Aporta | Requiere |
|---|---|---|
| Texto en pantalla | El nombre literal del juego o programa | Tesseract |
| Vision (CLIP) | Reconocimiento de escena | Modelo ONNX |
| Voz | El tema del que se habla | faster-whisper |
| Ritmo | Guia vs. gameplay, sin ningun modelo | nada |

El ritmo esta **siempre** disponible, asi que el perfil nunca sale vacio: en el
peor caso dice "esto es material hablado y quieto", que ya sirve para elegir
estilo. Cada conclusion lleva su fuente y su confianza, y el sistema dice
explicitamente que senales le faltaron.

El diseno de CLIP evita el problema habitual: las etiquetas traen su embedding
**ya calculado**, asi que solo hace falta el codificador de imagen. Sin
tokenizador, sin PyTorch, un paso de ONNX Runtime por fotograma.


## La interfaz web

```bash
# terminal 1
cd videoforge/backend && .venv/bin/forge serve

# terminal 2
cd videoforge/frontend && npm install && npm run dev
```

Y se abre `http://localhost:5173`. El flujo es el mismo que el de la linea de
comandos, pero visual: subir, analizar, elegir estilo, revisar el montaje, medir
la saturacion y renderizar.

Lo que aporta frente a la CLI:

- La **linea de tiempo por pistas**, donde cada bloque se puede pulsar para ver
  por que esta ahi ("zoom a (58%, 41%): la atencion se concentra ahi").
- El **medidor de saturacion** con su aguja, el mapa de calor del montaje y el
  deslizador de intensidad, con el boton de reajuste al lado.
- **Previsualizacion antes del render final**, para no gastar un encode completo
  en revisar el montaje.

### La API

`forge serve` levanta una API documentada en `/docs`. Endpoints principales:

| Metodo | Ruta | Que hace |
|---|---|---|
| `POST` | `/api/jobs` | Sube un video |
| `POST` | `/api/jobs/{id}/analyze` | Analiza (en segundo plano) |
| `GET` | `/api/jobs/{id}/profile` | Que es el video y en que se basa |
| `POST` | `/api/jobs/{id}/plan` | Decide el montaje |
| `GET`/`PUT` | `/api/jobs/{id}/edl` | Lee o guarda el montaje editado |
| `GET` | `/api/jobs/{id}/saturation` | Medida de saturacion |
| `POST` | `/api/jobs/{id}/balance` | Reajusta sin cambiar la duracion |
| `POST` | `/api/jobs/{id}/render` | Renderiza |
| `GET` | `/api/jobs/{id}/result` | Descarga el MP4 |
| `GET` | `/api/jobs/{id}/events` | Progreso por SSE |

Dos decisiones que importan:

- **El trabajo pesado corre en un hilo aparte.** El analisis y el render llaman
  a ffmpeg y pueden tardar minutos; hacerlo en el bucle de eventos dejaria la
  API muda mientras tanto.
- **El stream de progreso se cierra en cuanto el trabajo queda ocioso**, y el
  cliente abre uno nuevo al lanzar la siguiente etapa. Es mas simple que
  mantenerlo abierto entre fases y evita dejar conexiones colgadas en los
  estados intermedios, que no son finales pero si de reposo.

Cada trabajo persiste en disco: reiniciar el servidor no pierde el analisis, que
es justo lo que mas cuesta rehacer. Un trabajo que se quedo a medias al apagar
el servidor se marca como error para poder relanzarlo, en vez de quedarse
esperando algo que ya no corre.
