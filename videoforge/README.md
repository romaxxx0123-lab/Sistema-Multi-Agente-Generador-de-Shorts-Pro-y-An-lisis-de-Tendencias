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
forge demo                   # genera una guia de ejemplo y la monta entera
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
| saliencia | donde se concentra la atencion en cada plano | encuadrar el zoom y no tapar con el subtitulo |
| texto en pantalla | que pone y **donde** | senalar con un recuadro lo que estas nombrando |

Si falta alguna pieza opcional el analisis no se cae: avisa y sigue con lo que
tiene. Sin `faster-whisper` no hay transcripcion, pero el resto del analisis se
completa igual.

Empieza por `forge doctor`: detecta la GPU, verifica que tu build de FFmpeg trae
los filtros necesarios y te dice con que perfil va a trabajar. Si la GPU no es
utilizable lo avisa y sigue en CPU, nunca se cae.

Y despues `forge demo`: fabrica una grabacion de pantalla realista con voz y
pausas, la monta entera y deja el original y el editado uno al lado del otro.
Sirve para ver que la instalacion funciona de punta a punta sin subir nada.

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
4. **Recuadros** — senala en pantalla el boton o el menu que estas nombrando,
   cruzando el transcript con el texto que el OCR leyo y **donde** lo leyo. Solo
   donde las dos senales coinciden; ver "Senalar lo que se nombra".
5. **Capitulos** — busca las pausas largas en el **original** (el corte se las
   come, asi que buscarlas en el montaje no serviria) y mide la duracion minima
   en el **montaje**, que es lo que vera el espectador.
6. **Transiciones y color** — segun el estilo.

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
  video aunque haya cientos de lineas. Los **rotulos de capitulo** van en ese
  mismo fichero con su propio estilo: asi no pueden descuadrarse respecto a los
  subtitulos, y el desvanecido lo hace ASS nativo con `\fad`.
- **El zoom no se queda quieto.** Un punch-in que entra y se clava deja la
  imagen congelada, y en una grabacion de pantalla el contenido tampoco se
  mueve: el resultado parece un fotograma pegado. Mientras aguanta sigue
  acercandose un 4%, que no se ve como un efecto pero si se nota si no esta.

### El audio

La voz se trata antes de nada: paso alto a 80 Hz (retumbe de mesa y pisadas),
reduccion de ruido opcional, de-esser y una compresion **suave**.

El de-esser esta construido a mano con `acrossover`, un cruce Linkwitz-Riley que
al volver a sumar las dos bandas da un resultado plano. Se comprime solo la
banda por encima de 5,5 kHz. **No se usa el filtro `deesser` de ffmpeg**: medido
sobre voz, con intensidad 0,35 se lleva por delante 4,7 dB de sonoridad, 8,7 dB
de pico y 3,8 dB de la banda de 3-5 kHz, que es donde vive la inteligibilidad.
Ademas tiene un escalon: a 0,2 no hace nada y a 0,35 destroza. El cruce, con una
voz sin siseo, deja la misma sonoridad, el mismo pico y la misma energia en
graves **hasta la centesima de dB**.

La compresion se deja floja a proposito. Medido: apretarla no reduce el factor
de cresta (los picos de la voz son transitorios que ningun ataque de 15 ms
alcanza) pero si aplasta el rango dinamico, de 5,1 a 2,0 LU. Los picos son cosa
del limitador, no del compresor.

**El master se mide, no se estima.** El objetivo es -14 LUFS con pico real por
debajo de -1.5 dBFS, que es el estandar de las plataformas. Subir hasta ahi casi
siempre deja el pico por encima del techo, y el limitador tiene que recortar la
diferencia; cuanto cuesta ese recorte depende del material. En una voz con picos
sueltos no cuesta nada; en una ya densa cada dB de recorte se lleva casi un dB de
sonoridad, con lo que subir mas **solo distorsiona**. Medido sobre la guia de
ejemplo: hasta +1,5 dB el limitador se come 0,02 dB, y a +4,5 dB ya se come 2,0.

Por eso no hay una regla fija. Se mide el montaje, se prueban un par de
ganancias (pasadas solo de audio, baratas) y se coge la mas alta que no pierda
mas de 1 dB por el camino. Si el material no da para llegar a -14 LUFS, el
master se queda por debajo y **se dice**, en vez de aplastar la voz para cuadrar
un numero. El nivel que se informa es el del fichero, medido despues de
masterizar, no el de la primera pasada.

El limitador trabaja sobremuestreado a 192 kHz y con el techo 0,7 dB por debajo
del objetivo: `alimiter` mira el pico de **muestra**, y entre dos muestras la
senal reconstruida se sale por encima de lo que el ve (medido: 1,7 dB sin
sobremuestrear, 0,7 dB a 4x).

### Calidad del render

Antes de cada render se valida el grafo **con un segundo de video** contra
`null`. Un error de filtros salta en un segundo en vez de a los diez minutos.

El render escribe a un fichero aparte y lo mueve al destino al terminar, y antes
comprueba que lo que salio se puede leer y dura lo que tenia que durar. Mirar el
tamano no basta: ffmpeg escribe el indice del MP4 **al final**, asi que un
render de veinte minutos cortado a mitad deja megas de datos sin indice, un
fichero ilegible que pasaba la comprobacion y se daba por bueno -- y que ademas
ya se habia cargado el render anterior. Paso de verdad.

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

## Senalar lo que se nombra

Es lo que hace un editor humano en una guia: cuando dices *"pulsa en
Configuracion avanzada"*, aparece un recuadro alrededor de ese boton.

No hay que adivinar nada, porque las dos mitades del dato ya existen: el
**transcript** dice que palabra se esta diciendo y cuando, y el **OCR** dice que
texto hay en pantalla y **donde**. Solo se marca donde las dos coinciden.

Eso lo hace conservador por construccion, que es lo que interesa aqui: un
recuadro sobre algo que no es lo que estas diciendo es peor que no poner
ninguno. En concreto **no** se senala cuando:

- la palabra que dices no esta escrita en pantalla,
- esta escrita **mas de una vez** (senalar la equivocada es lo peor que puede
  pasar, asi que no se senala ninguna),
- es una palabra demasiado comun ("esta", "para", "aqui"): coincidiria con
  cualquier interfaz,
- la lectura de pantalla mas cercana esta a mas de cuatro segundos: lo que habia
  entonces ya no esta.

Si el boton tiene dos palabras ("Configuracion avanzada") se agrupan en un solo
recuadro, no en dos medio recuadros.

Depende de Tesseract, que es libre pero externo. Sin el, el resto del montaje
funciona igual y simplemente no salen recuadros. Con `--no-ocr` se apagan.

Un detalle del render que costo entender: `drawbox` evalua sus parametros **una
sola vez**, al montar el grafo. En sus expresiones no existe el tiempo, y meter
`t` no da un recuadro estatico, **aborta el render entero**. Lo unico que si se
evalua por fotograma es `enable`, asi que el recuadro entra y sale encadenando
varios `drawbox` con distinta opacidad y tramos de tiempo seguidos.

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


## Probado en veinte minutos, que es el caso de uso

Casi todo se prueba sobre un video de un minuto, y eso esconde una clase entera
de problemas: los que solo aparecen al **acumular**.

```bash
forge demo --minutes 20      # genera, analiza, monta y renderiza 20 min
```

Pasar esa guia por el sistema entero saco tres fallos que en un minuto son
invisibles.

Lo que si escala sin problema, medido de punta a punta en un contenedor de
**cuatro nucleos sin GPU** (o sea, el peor caso razonable):

```
analisis        210 s para 20 min de video   ·  pico de RAM 0,2 GB
planificacion     2,5 s
ajuste del master 137 s
encode           790 s
--------------------------------------------------------------
render completo 1140 s para 17,1 min de salida  (0,9x tiempo real)
```

Con NVENC en una GPU decente el encode deja de contar y el analisis pasa a ser
lo que manda. El pico de RAM no llega a 0,3 GB en ningun momento: el analisis va
por trozos y el render lo hace ffmpeg en streaming, asi que la duracion del
video no cambia la memoria que hace falta.

Lo que no escalaba:

**Sesenta zooms.** El estilo permitia 3,5 por minuto: en un minuto son tres y
parecen pocos; en veinte minutos son sesenta, un zoom cada diecisiete segundos
durante toda la guia. Y el medidor de saturacion **no se enteraba**, porque no
tenia ninguna metrica de zooms: solo los veia diluidos en la densidad general.
Ahora los mide, cada estilo declara su banda, y el ritmo de las guias baja a
1,4 por minuto.

**Veinte capitulos.** La duracion minima de un capitulo era un numero fijo
(45 s), asi que cuantos mas minutos, mas capitulos: uno cada 51 segundos. Eso no
orienta a nadie, y ademas plantaba veinte rotulos en pantalla. Ahora el minimo
crece con el video, con un tope de ocho capitulos sea cual sea la duracion.

Y de paso, los **titulos**: salian de las primeras palabras de la frase, asi que
un capitulo se llamaba "Siguiente punto los proyectos del apartado 2 cada". Van
tal cual a la descripcion de YouTube, o sea que son lo mas visible que produce
el planner fuera del propio video. Ahora se quitan los arranques encadenados
("bueno, vamos a ver...") y las palabras de funcion del final, y si al quitarlos
no queda frase se titula por los terminos propios del capitulo -- el mismo
criterio que usa el material de apoyo.

**El balanceador queria quitar subtitulos.** Quitado el silencio, la voz ocupa
el 95% del montaje, asi que los subtitulos tambien; eso se salia de la banda de
texto en pantalla, y lo unico que mueve esa metrica son los propios subtitulos.
Los subtitulos ya no se tocan: son contenido, no decoracion. Cuando sobra texto,
lo que sobra son los rotulos.

Resultado despues de las tres correcciones, sobre la misma guia de 20 minutos:

```
20,0 min -> 17,1 min (-15%)   257 clips   15,0 cortes/min
saturacion 51,8/100 · en el punto
 432 x caption    24 x punch_in    26 x callout
  30 x transition  7 x text_card    1 x grade
```

## Material que no se parece al de pruebas

Una grabacion real trae cosas que ningun fixture sintetico tiene. Diez ficheros
con esas rarezas, pasados por el sistema entero:

| caso | resultado |
|---|---|
| fps variable (lo que sacan OBS y ShareX) | ok |
| 4K, vertical 9:16, 1366x768, 60 fps | ok |
| matriz de rotacion de 90 grados (movil) | ok, sale 720x1280 como se ve |
| audio mono a 44,1 kHz, 5.1, 40 dB por debajo | ok |
| sin pista de audio | ok |

Los diez pasaban, y ese "pasaban" escondia **el fallo mas grave de todo el
proyecto**: la duracion de salida era de 0,8 segundos. Doce segundos de entrada,
ocho decimas de salida, sin un solo error por ningun lado.

**Un audio de nivel plano borraba el video entero.** Cuando el fondo y la voz no
se distinguen, el umbral de silencio se ponia un poco *por encima* del suelo de
ruido, que suena de lo mas razonable hasta que el audio es plano: entonces el
umbral cae por encima de la senal entera, el 100% del video pasa a ser silencio
y el montaje se lo come todo. Pasa con musica de fondo constante, con una voz ya
muy comprimida o con un tono.

Era una regresion propia, de arreglar el umbral fijo unas horas antes. Y habia
un test que fijaba esa conducta como la correcta: exigia que el umbral quedase
"un poco por encima del suelo". Ahora, sin separacion clara, el umbral se pone
**por debajo de todo** y no se marca nada: quedarse sin recortar es el error
barato, borrar el video no lo es.

Y una red de seguridad encima, porque el fallo no puede depender de que el
detector acierte siempre: si la seleccion se lleva mas de dos tercios del video,
no se recorta nada y se explica por que. Recortar tiempo muerto quita entre un
10% y un 30% de una guia; quedarse con menos de un tercio significa que algo se
ha equivocado, no que el video fuera casi todo silencio.

## Por que hay un generador de material realista

El fixture de barras de color sirve para probar la mecanica, pero **escondia dos
fallos que dejaban el sistema inutil con material de verdad**. Los dos se
encontraron al construir `forge demo`, que fabrica una grabacion de pantalla con
voz y pausas reales:

**1. No detectaba ni un silencio.** El fixture tiene silencio digital perfecto,
que no existe en ninguna grabacion. `silencedetect` de ffmpeg mide **picos**, y
el ruido de sala es casi gaussiano: un fondo a -36 dB RMS tiene picos a -24 dB.
Con el umbral clasico de -32 dB no encontraba nada, y sin silencios no recorta
tiempo muerto, que es la funcion principal.

Ahora los silencios se detectan midiendo RMS por ventanas, con el umbral
deducido **del propio audio**: se estiman el suelo de ruido y el nivel de voz y
se corta entre los dos. Funciona igual con un microfono silencioso que con uno
ruidoso.

**2. Veia un unico plano en toda una grabacion de pantalla.** Pasar de una
interfaz oscura a otra igual de oscura cambia entre **uno y tres niveles de gris
sobre 255**. PySceneDetect no lo ve ni bajando su umbral a 3.

Ahora se combinan dos detectores: el de PySceneDetect, bueno con material de
camara, y uno propio que busca picos **relativos a su vecindad**. Ese cambio de
1% no destaca en absoluto, pero destaca clarisimamente sobre una vecindad que
esta a cero.

**3. Y un tercero, encontrado al mirar el resultado.** El video salia con la
duracion correcta, los streams correctos, el audio correcto, los subtitulos
correctos... y **completamente negro**. `fade=t=out` de ffmpeg no oscurece solo
su tramo: deja el video a oscuras desde la transicion hasta el final, y el
`fade=t=in` que va detras ya recibe negro. Ninguna comprobacion de duracion,
formato o sonido lo detecta.

Las transiciones son ahora un bajon de luminosidad acotado a su propio pulso, y
hay un test que mide el brillo del resultado, que es lo unico que lo delata.

**4. Se comia palabras de verdad.** "este" es muletilla en "y este... lo
abrimos", pero es un demostrativo normal en "en este video". Quitarlo a ciegas
convertia esa frase en "en video". Ahora las palabras ambiguas solo se quitan si
va detras una vacilacion, que es la firma acustica de la muletilla; las
inequivocas ("eh", "um") se quitan siempre.

**5. El "de-esser" no era un de-esser.** La cadena de voz decia `deesser` y lo
que hacia era destrozar la voz: -4,7 dB de sonoridad, -8,7 dB de pico y -3,8 dB
en 3-5 kHz, que es la banda de la inteligibilidad. Solo se ve midiendo el
espectro; escuchando por encima parece "mas suave". Esta reconstruido con un
cruce Linkwitz-Riley, y el test comprueba que **sin sibilancia no toca nada**.

**6. No salia ni un material de apoyo, y nadie lo noto.** El tope por minuto se
truncaba con `int()`: a 1,2 por minuto, un montaje de 47 segundos da 0,94, que
`int()` convierte en "ninguno". Lo mismo para los zooms y los recuadros. Ahora
se redondea, y si el montaje da para al menos uno, se permite uno.

**7. Si hablabas de Chrome, no salia Chrome.** El proveedor de material del
propio video puntuaba sus recortes con la concentracion de la saliencia, un
numero de 0 a 1 que no tiene **nada** que ver con la consulta, y competia de tu
a tu con una coincidencia real de palabras. Un plano vistoso le ganaba siempre a
un material que si hablaba del tema. Ahora el material propio vive en una banda
por debajo de cualquier coincidencia: es relleno, no ilustracion.

Y la consulta tampoco era buena: TF-IDF a secas premia a la palabra que aparece
**una unica vez** en todo el video, asi que de "la base de datos guarda toda la
informacion" sacaba "informacion". Ademas las ventanas iban por reloj, y una
frase que cruzaba el limite dejaba su ultima palabra sola en la ventana
siguiente, donde ganaba por goleada. Ahora las ventanas siguen al habla y se
prefiere el termino al que se vuelve varias veces, que es lo que es un tema.

**8. Los capitulos no se dibujaban.** El planner los calculaba, los metia en el
EDL como rotulos y el medidor de saturacion los contaba como texto en pantalla
-- pero **no habia nada que los pintara**. El EDL prometia algo que no existia
en el video. Ahora salen en el mismo fichero `.ass` que los subtitulos: misma
fuente, mismo contorno, y el desvanecido lo hace ASS nativo con `\fad`.

**9. La cache devolvia montajes viejos.** Cada etapa del analisis lleva version
para invalidarse sola cuando cambia su codigo, pero la version era un numero que
habia que subir a mano. Se reescribieron los detectores de silencio y de planos
y nadie lo subio, asi que un video ya analizado seguia dando el montaje de
antes: 6 clips donde tocaban 10, sin ningun aviso. Ahora la version **se calcula
sola** hasheando el fuente de esa etapa.

## Como queda un montaje

Sobre la guia de ejemplo, con el estilo `tutorial`:

```
original      59.5s
editado       47.4s   (-20% de tiempo muerto)
ritmo         11.4 cortes/min
saturacion      50/100 · en el punto
audio        -16.2 LUFS en el fichero, pico real -2.1 dBTP

 21 × caption      subtitulo: "hola en este video vamos a configurar"
  2 × punch_in     zoom a (21%, 36%): la atencion se concentra ahi
  1 × callout      recuadro sobre "Ajustes": ahi lo estas nombrando
  1 × transition   transicion fade en el corte de 4.9s
  1 × grade        color 'neutral' al 25%
```

Dos zooms en cincuenta segundos, subtitulos legibles y un ajuste de color
discreto. Es un montaje **sobrio**, que es lo que debe ser: el medidor de
saturacion existe justo para que el sistema no se emocione.

El audio se queda en -16,2 LUFS y no en -14 porque esta grabacion concreta no da
para mas sin apretarla: ahi es donde el limitador empieza a comerse mas de 1 dB
de sonoridad por cada dB que se sube. Es la decision correcta, y por eso el
informe dice el nivel real del fichero en vez del objetivo.

Si no quieres elegir estilo, `--style auto` lo deduce del material: una guia
hablada y quieta pide `tutorial`, un gameplay sin voz pide `gaming-hype`.
