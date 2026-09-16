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

El extra `ocr` es el que hace que la app **lea la pantalla**, y en una guia eso
no es un adorno: sin el se caen los recuadros sobre lo que nombras, senalar por
nombre y el material sacado de tu propio video. Trae sus propios modelos, asi
que no hay nada mas que instalar. (`ocr-tesseract` es la alternativa, y ademas
del paquete necesita el `tesseract` del sistema.)

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

### Un corte tiene que pagarse

En una grabacion de pantalla un corte **se ve**: la imagen da un salto. Hasta
aqui la seleccion no se hacia esa pregunta -- quitaba lo que pasaba del umbral,
le devolvia aire por los lados, alargaba los trozos cortos, y lo que quedaba
recortado se quedaba recortado valiera lo que valiera.

Medido sobre una guia de 20 minutos (260 clips): **28 cortes, el 11%, ahorraban
menos de tres decimas cada uno; 2 segundos entre los 28**. Es el peor negocio
posible: un salto visible a cambio de nada.

Ahora cada recorte se juzga con las dos mitades que faltaban:

- **cuanto cuesta ese corte ahi**. Si en ese instante el plano ya cambia, o la
  pantalla se esta moviendo, el salto queda escondido detras de algo que iba a
  pasar igual, y cortar sale casi gratis. En mitad de una pantalla quieta el
  corte es lo unico que se mueve, y hay que ganarselo.
- **cuanto se gana, y por que**. Una pausa solo vale el tiempo que quita; una
  muletilla molesta, asi que vale mas; una toma fallida o algo que tu mismo
  mandas saltar se quitan duren lo que duren, porque ahi lo que sobra no es
  tiempo, es un error.

El resultado sobre esa misma guia: **25 saltos menos y un segundo mas de
montaje**. Y de regalo desaparecen los fragmentos de tartamudeo: al no hacer los
cortes de miseria, los trozos sueltos se unen al vecino y el mas corto pasa de
0,80 s a 1,81 s.

El montaje lo cuenta: *"25 cortes no se hicieron: entre todos ahorraban 0.9s y
cada uno se habria visto."*

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
5. **Capitulos** — donde cambia el **vocabulario** o donde lo dices, midiendo
   la duracion minima en el montaje, que es lo que vera el espectador. Ver
   "Donde cambia el tema".
6. **Transiciones y color** — la transicion va donde cambia el plano o empieza
   un capitulo, no cada N cortes; ver "Una transicion donde no cambia nada".
7. **Sonido** — un efecto de sonido acompana a algo que ya esta decidido
   (transicion, rotulo, zoom) y nunca suena solo; la musica, si el estilo la
   pide y tu has puesto un fichero, va agachada bajo la voz.
8. **Arbitraje** — se quita lo que otro efecto deja sin sentido: un recuadro
   debajo de un b-roll, dos movimientos de camara a la vez, un zoom dentro de
   un avance rapido. Ver "Cuando dos efectos se estorban".

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

### Un efecto tiene que justificarse, no ocupar un cupo

Este es el freno que de verdad evita la sobreedicion, y el fallo era de raiz.
Cada planner elige los mejores N candidatos que le permite su cupo, asi que **si
el cupo da para trece zooms, salen trece zooms**. Medido en una guia de 20
minutos con `tutorial`: los zooms iban de 0.97 a **0.14** sobre 1, y cuatro de
los trece estaban por debajo de 0.25. Nadie los pidio; estaban ahi porque
quedaba sitio.

Y habia algo peor: efectos cuyo valor era **una constante**. Las veintidos
transiciones valian 0.35 **todas** --- y sin embargo el planner sabia
perfectamente cuales marcaban el principio de un capitulo y cuales caian donde
la imagen ya cambiaba sola. Sabia la diferencia y la tiraba a la basura.

Tres cambios:

1. **Los valores dicen la verdad.** Una transicion que abre capitulo vale 0.60;
   una que solo cae donde el plano cambiaba ya, 0.18 + 0.45 x lo que el estilo
   declara que le gustan las transiciones. Eso ultimo no lo decido yo: con 0.12
   (una guia) una transicion decorativa no se sostiene sola, con 0.50 (cine) es
   parte del lenguaje del estilo y se queda.
2. **Un suelo de justificacion.** Por debajo de el, el efecto no entra --- se
   queda en reservas. A veces no editar es la decision.
3. **El medidor deja de obligar a rellenar.** Sin esto, un montaje limpio que el
   medidor leia como "sub-editado" se rellenaba con los efectos que el planner
   acababa de descartar *por no justificarse*: la app se sobreeditaba sola para
   contentar a su propio medidor.

Resultado en esa guia de 20 minutos: **42 efectos visibles pasan a 22**. Se van
los cuatro zooms de relleno y las dieciseis transiciones decorativas; se quedan
los siete rotulos de capitulo, las seis transiciones que abren capitulo y los
nueve zooms que valian algo. El medidor sigue diciendo "en el punto".

Y el deslizador de intensidad por fin significa algo concreto: **no es "pon mas
cosas", es cuanto me tienes que convencer**.

| intensidad | suelo | efectos en la guia |
|---|---|---|
| 0 | 0.45 | 20 |
| 50 | 0.30 | 22 |
| 75 | 0.23 | 38 |
| 100 | 0.15 | 41 |

### Repetirse tambien es sobresaturar

Un cupo dice **cuantos** y no dice **como**. Con `gaming-hype` en una guia de 20
minutos salian 310 efectos visibles, el cupo declarado exacto (doce zooms por
minuto)... y dentro una **racha de once zooms seguidos**. No se salta ninguna
regla: ese es el problema. Asi se delata una edicion automatica, no por hacer
cosas raras sino por hacer la misma una y otra vez hasta que deja de significar
algo. Un zoom subraya; cinco zooms seguidos son el fondo de pantalla.

Lo que faltaba es lo que un montador lleva puesto sin pensarlo --- *acabo de
hacer esto* --- y son dos cosas distintas:

- **La racha**: tres usos seguidos del mismo recurso, sin nada por medio y a
  menos de 20 segundos, ya es un bucle. Se adelgaza quedandose con los que mas
  aportan. Esto **no baja el ritmo del estilo**, lo obliga a variar.
- **El exceso sobre lo que el propio estilo pidio**: cada uso deja una huella
  que se apaga con la constante de tiempo que declara el estilo. Asi
  `documentary` sigue sobrio y `gaming-hype` sigue nervioso, y ninguno se queda
  en bucle.

Lo retirado **no se borra: va a reservas**, y el auto-balanceador puede
recuperarlo --- en el tramo mas vacio, que es justo donde repetirse no cansa.

Y se mide, porque la densidad no lo veia: once zooms seguidos y once efectos
variados dan **exactamente la misma densidad** y en pantalla no se parecen en
nada. La metrica `repeated_share` es la fraccion de efectos que llegan en racha,
con la misma definicion que usa el freno, para que lo que se mide y lo que se
corrige sean la misma cosa. Calibrada, no puesta a ojo: los montajes reales dan
entre 0.00 y 0.15, un montaje monotono da 1.00, y el techo de cada estilo esta
en medio (0.25-0.30).

Un detalle que salio al medir y conviene no "arreglar": el 45% de los efectos de
`gaming-hype` empezaban a menos de un segundo del anterior, pero al mirar los
pares resulto que **79 de 102 eran un sonido con el zoom al que va anclado**.
Eso es el diseno funcionando.

### El auto-balanceador

Con `--balance` no solo mide: corrige. Es un bucle de control determinista que
busca la ventana mas caliente de la curva y quita de ahi el efecto con peor
relacion valor/coste, hasta entrar en banda. Si el montaje se queda corto,
asciende candidatos que el planner ya habia validado pero no habia llegado a
poner --- y los asciende **en el tramo mas vacio**.

Eso ultimo faltaba, y era una asimetria que se notaba: al podar miraba *donde*
sobraba, pero al anadir cogia el mejor candidato del video entero sin mirar
donde caia, asi que podia recargar un tramo que ya iba lleno mientras un minuto
y medio seguido se quedaba sin nada. Un montaje no se juzga por su media: se ve
en orden.

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


## Leer la pantalla

En una guia grabada de pantalla, **la pantalla es donde esta el contenido**: los
menus, los botones y los titulos dicen literalmente como se llama cada cosa.
Ninguna red neuronal lo hace mejor que leerlo.

Hasta aqui el unico motor era **Tesseract**, un programa del sistema que hay que
instalar aparte. Sin el, el texto de pantalla se quedaba **vacio** --- y con el
vacio se caen de golpe cuatro cosas que ya estaban escritas y probadas: los
recuadros sobre lo que nombras, senalar por nombre en vez de por zona, el
material sacado del propio video por lo que se vio en pantalla, y la lectura
dirigida a los momentos en los que hablas de ella. Es decir: **en la instalacion
por defecto la app estaba ciega**.

Ahora hay un segundo motor y es el preferido: **RapidOCR** (PP-OCRv4 en ONNX).
Se instala con `pip install rapidocr-onnxruntime` y **los modelos viajan dentro
del paquete** (16 MB), asi que no hay nada que descargar despues ni ningun
programa del sistema que poner.

Medido sobre una captura de interfaz en espanol: lee los cinco bloques con
**0.95-1.00 de confianza** y su posicion, a **0.44 s por fotograma**. Se come los
acentos (*"Configuracion"* por *"Configuración"*) y da exactamente igual, porque
aqui todo se compara sin acentos.

Y lo que cambia en el montaje, medido de punta a punta sobre una grabacion con
interfaz y una voz que dice *"pulsa en guardar cambios"*:

| | sin leer la pantalla | leyendola |
|---|---|---|
| senal de senalar | "pulsa en", sin objetivo | **"Guardar cambios"**, caja (0.53, 0.54) |
| recuadros en el montaje | 0 | 1, sobre el boton exacto |

`forge doctor` lo dice en una linea: *"pantalla: OK se lee con rapidocr"*, o te
manda instalarlo si no hay ninguno.

## Que cambia en la pantalla

El detector de planos ya sabia **cuando** pasa algo: en una grabacion de
pantalla, que se abra un menu o salte un dialogo cambia bastante imagen como
para marcar un corte, y eso funcionaba bien. Lo que faltaba era **que**.

A la pregunta "¿a donde hay que mirar?" el analisis contestaba con el centro de
masas de la **saliencia**, que mide contraste. Y en una interfaz hay contraste
en todas partes, asi que el centro cae en cualquier sitio. Medido sobre una
grabacion con un dialogo que aparece en el segundo 16, centrado en (0.46, 0.46):

```
el analisis mandaba mirar a (0.31, 0.29)   <- el menu de antes
error: 0.23 de pantalla
```

El zoom se acercaba al menu viejo justo cuando lo que habia que ver era el
dialogo nuevo.

Ahora se comparan fotogramas seguidos y se guarda **la region que cambio**
(`analysis/changes.py`). Sobre los cuatro sucesos de esa grabacion, el error
baja de 0.23 a menos de 0.08, y el zoom **encuadra** lo que acaba de aparecer.

La primera version solo miraba **en los cortes de plano**, y eso dejaba fuera la
mayoria de los sucesos de una interfaz. Se vio al examinar una guia sintetica
con cinco sucesos apuntados: el panel del router que se sustituye por el de la
impresora en el segundo 31 cambia el **0.78% del cuadro**, muy poco para que
haya corte de plano --- y sin embargo es un suceso de manual, con su region
perfectamente localizable. En una interfaz casi todo es asi: un panel que cambia
de contenido, un valor que se actualiza, una opcion que se marca.

Ahora se barre el video entero a dos fotogramas por segundo y los avistamientos
seguidos que se pisan en pantalla se funden en uno, que es donde empezo. Sobre
esa misma guia:

```
5 sucesos de 5 encontrados, error 0.04-0.10 de pantalla
sucesos inventados: ninguno
1.2s de calculo para 130s de video
```

Dos guardas, porque no todo cambio es un suceso: si cambia una miseria es ruido
de compresion, y si cambia media pantalla no ha *aparecido algo*, ha cambiado
todo --- y ahi no hay ninguna region que senalar.

Y una cosa que hubo que corregir al conectarlo: el propio suceso marca
**movimiento maximo** en ese fotograma, asi que la regla de "no hagas zoom si la
imagen ya se mueve" tiraba justo los zooms sobre lo que acababa de pasar. El
movimiento se mide ahora medio segundo despues, cuando la pantalla se ha
asentado.

Tambien hubo que arreglar el orden de las dos senales, que estaba al reves: los
candidatos por saliencia llegaban a 0.824 y un zoom sobre el dialogo recien
aparecido valia 0.72, asi que **perdia el unico hueco del cupo contra un trozo
de pantalla con contraste**. Ahora un suceso vale 0.88: por encima de cualquier
medida de la imagen y por debajo de lo que tu digas (0.95), que sigue mandando.

### Y los refuerzos no pueden romper ese orden

Ese arreglo se quedaba corto, y tambien lo destapo el examen de la guia. Sobre
la puntuacion base se aplican **refuerzos** que multiplican --- que la parte sea
un aviso, que ahi enfatices, que sea un paso ---, y multiplicar un candidato
**ciego** lo pone por encima de uno **informado**:

| candidato a zoom | sabe a donde mira | valor |
|---|---|---|
| por contraste (saliencia) | no | **1.559** |
| ahi acaba de aparecer algo | si | 1.41 |
| ahi estas senalando | si | 0.95 |

Ganaba el unico que no sabia a donde estaba mirando, y ademas se llevaba el
unico hueco del cupo. Ahora cada tipo tiene su **techo**, que ningun refuerzo
puede rebasar:

```
lo que dices          1.00
lo que pasa en pantalla 0.94
donde hay contraste    0.85
```

Los refuerzos siguen sirviendo para elegir **entre candidatos del mismo tipo**,
que es para lo que valen. El orden entre tipos ya no depende de ellos.

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
material de apoyo en 60s porque ahi hablas de 'chrome' · de tu biblioteca:
coincide con lo que dices: chrome
```

### Que lo que entra sea de lo que hablas

Saber **cuando** poner material no sirve de nada si luego se pone el que no es.
El fallo, dicho como lo sufrio quien lo vio: *"hablo de Palworld y me mete una
imagen de Minecraft porque es un videojuego"*. Y era literalmente eso:
compartir **una** palabra bastaba.

```
dices:      palworld, base
fichero:    minecraft-videojuego-base.png
en comun:   base                            ->  dentro, con un 70%
```

La pregunta estaba mal hecha: "tiene algo en comun" no es "es esto". Ahora se
pregunta por dos cosas y las dos tienen que salir bien:

1. **¿Lleva la cabeza de lo que buscas?** La consulta tiene una cabeza -- lo
   concreto que se acaba de nombrar -- y el resto es contexto para desempatar.
   "Base" no convierte una foto de Minecraft en una foto de Palworld.
2. **¿De que es el material?** La primera etiqueta de un fichero es su sujeto:
   `minecraft-videojuego-base.png` es una foto **de Minecraft**, y lo de
   videojuego y base la describe. De lo que describe a un material se puede no
   decir nada -- una foto de Palworld sigue siendo de Palworld aunque no digas
   "granja" en todo el video -- pero **de lo que es hay que hablar**. Si el
   sujeto no se nombra en ningun momento, ese material no entra.

La segunda regla es la que caza el caso feo, el que la primera no ve: dices
"base", el fichero es de Minecraft, y Minecraft no aparece en todo el video.

```
dices: palworld    minecraft-videojuego-base.png    no esta etiquetado con "palworld"
                   palworld-videojuego-granja.mp4   coincide: palworld, videojuego
dices: base        minecraft-videojuego-base.png    es material de "minecraft", y eso
                                                    no se nombra en todo el video
```

**Convencion**: nombra los ficheros empezando por el asunto
(`palworld-base-construccion.mp4`), o pon el asunto el primero en `tags.json`.
Es lo que ya hace todo el mundo, y es lo que permite distinguir de que es un
material de lo que lo describe.

Los bancos de stock llevan la primera regla y no la segunda, porque ahi las
etiquetas vienen en el orden que quiera el banco. Y llevan una consecuencia que
conviene entender: **pedir no es encontrar**. Si le pides "palworld" a un banco
de stock te devuelve igualmente un mando o una pantalla cualquiera, asi que el
resultado se comprueba contra sus propias etiquetas y, si no lleva lo que
nombras, se descarta. Un hueco no se nota; una imagen equivocada la ve todo el
mundo.

### Que encaje en el hueco y en el montaje

Saber **cuando** y **que** no basta: tambien hay que meterlo bien. Se decidia
donde poner material mirando solo lo que se decia, y luego se colocaba lo que
viniera, con una duracion fija y a pantalla completa, fuera lo que fuese. De
ahi salian cuatro cosas feas, todas por lo mismo: no se miraba **lo que se ha
conseguido**.

| lo que llega | lo que pasaba | lo que pasa ahora |
|---|---|---|
| un clip de 2 s en un hueco de 4 | se repetia a la vista (`-stream_loop`) | dura lo que tiene: 2 s |
| un clip vertical | recortado a 16:9 hasta dejar una rendija | va en ventanita, **con su forma** |
| un clip de 480p a pantalla completa | ampliado al triple, y se nota | va en ventanita; por debajo de un tercio de la altura, no va |
| menos de 1,2 s de material | un parpadeo | no se pone |

Y dos cosas sobre **como** entra:

- **por una pausa del habla.** Aparecer a mitad de palabra es lo que delata una
  insercion automatica. El sistema ya sabe donde estan las pausas -- las usa
  para cortar -- y ahora tambien para entrar y salir.
- **con un fundido corto** (0,22 s) en vez de un salto seco. Un material que
  aparece de golpe a pantalla completa se lee como un fallo de reproduccion.
  Hay un test que lo renderiza y mide cuanto tapa recien entrado y en medio.

La ventanita se coloca **arriba a la derecha**, que es donde no estan los
subtitulos, y toma la proporcion del material: 243x432 px para un vertical,
768x432 para un apaisado. Una ventanita cuadrada para un clip vertical volveria
a recortarlo, que es justo lo que se queria evitar.

Y una regla de prioridad, cuando el material y un recuadro caen en el mismo
sitio: **gana el recuadro**. Los dos se colocan por la misma senal -- estas
nombrando algo -- asi que chocan a menudo; senalar el boton que nombras es
ensenar, y el material de apoyo solo ilustra y puede esperar dos segundos.

### De donde sale el material

| Proveedor | Necesita | Notas |
|---|---|---|
| `self` | nada | Del propio video: el momento en que eso se vio en pantalla, o al que **vuelves** al decir "como vimos antes". |
| `local` | tu carpeta `assets/broll/` | Etiquetas de `tags.json`, de **las carpetas** y del nombre del fichero, en ese orden; **la primera es el asunto**. |
| `pexels` | `PEXELS_API_KEY` (gratuita) | Opcional. Se le pide con `locale`. |
| `pixabay` | `PIXABAY_API_KEY` (gratuita) | Opcional. Se le pide con `lang`. |

Las carpetas cuentan como etiqueta, y de fuera hacia dentro: en
`broll/palworld/bases/nocturna.mp4` el material es **de Palworld** y lo demas lo
describe. Antes no contaban, y eso dejaba invisible la biblioteca de cualquiera
que ordene por carpetas: `palworld/base-01.mp4` se etiquetaba `["base"]`, sin
rastro de Palworld, asi que la regla de coherencia lo descartaba justo cuando
hablabas de Palworld.

#### Volver a lo que ya ensenaste

El recorte del propio video solo salia si lo que nombrabas se habia **leido en
pantalla**, y leer la pantalla necesita tesseract instalado. Sin el --- que es
el caso por defecto --- el unico proveedor que se anuncia como "siempre
disponible" no devolvia nada nunca.

Y la ocasion buena no necesita OCR ninguna: cuando dices *"como vimos antes"*,
*"te decia que..."*, *"acuerdate de..."*, lo que hay que ensenar es lo de antes,
y donde lo dijiste esta en la transcripcion. Esa senal (`RECALL`) se detecta
aparte de las de ir hacia delante, que son las facilies de confundir y las que
mas se dicen: *"vamos a ver"* no vuelve a nada. Y volver a algo de **otro**
video tampoco cuenta.

La senal por si sola nunca mete material: ademas tiene que haber un momento
anterior donde hablaras de eso, a mas de ocho segundos. Por eso un
*"recuerda que hay que guardar"* sobre algo nuevo no ensena nada --- y por eso
un falso positivo de la deteccion es inofensivo.

#### Lo que la transcripcion no tiene claro

El material se coloca sobre lo **mas distintivo** que dices. Y lo mas
distintivo de una guia son los nombres propios y la jerga, que es exactamente
donde una transcripcion se equivoca: sin mirar la confianza, el sistema tiende a
ilustrar justo las palabras con mas papeletas de estar mal oidas. Ahora lo
distintivo se pondera por lo segura que esta la transcripcion, y por debajo de
0.45 una palabra puede seguir siendo contexto pero no puede ser la **cabeza**
de una busqueda. Si la transcripcion no da confianzas, no se castiga nada: todo
se comporta como antes.

### Se mira antes de meterlo

Decidir que material entra era, hasta aqui, una comparacion de palabras y nada
mas: nadie miraba nunca el fichero. Asi que un clip negro, uno desenfocado, uno
ampliado desde 160x90 o un "video" que en realidad es un fotograma congelado
entraban igual de bien con solo llamarse como toca -- y el de un banco entraba
**sin haberlo visto nadie**.

Ahora se mira (`assets/inspect.py`), en tu biblioteca al elegirlo y en lo
descargado antes de renderizar:

| Se mide | Se cae si | Umbral |
|---|---|---|
| nitidez del mejor trozo de una rejilla 4x4 | no tiene **ni un trozo** enfocado | 120 |
| brillo medio | esta casi negro o quemado | fuera de 0.05 - 0.93 |
| contraste | es un tono plano | 0.05 |
| movimiento entre fotogramas | no se mueve nada: es un congelado | 0.002 |
| barras negras | no se cae: se **recortan** al pegarlo | mas del 3% del cuadro |

La nitidez se mide por rejilla y quedandose con **el mejor trozo**, no con la
media, y ese detalle es el que hace que la medida sirva: un plano con el sujeto
enfocado y el fondo desenfocado tiene la media por el suelo y es material
perfectamente bueno. Los umbrales estan medidos sobre un juego de casos
generado con ffmpeg (`tests/test_inspeccion.py`), con un factor de seis entre lo
peor que se acepta y lo mejor que se rechaza.

Del material de tu biblioteca se apunta ademas lo que **mide de verdad**
--- tamano, duracion y cuanto del cuadro es imagen ---, porque salia con los tres
a cero y `fit_asset` esta escrito alrededor de esos numeros: toda la adaptacion
a "lo que has conseguido" (no durar mas que el material, no ampliar un 480p a
pantalla completa, pasar a ventanita lo vertical) se aplicaba solo a los bancos
y con tu propia biblioteca se saltaba entera.

### En que idioma se le habla al banco

A los bancos se les mandaba la consulta en espanol sin decirles el idioma, y
contestan etiquetando en ingles. Despues la regla de coherencia exigia que
**"impresora"** estuviera entre esas etiquetas. No esta nunca: la regla que
evita que salga Minecraft cuando hablas de Palworld habia dejado el camino del
stock practicamente muerto para quien habla espanol.

Se arregla por los dos lados: se manda el idioma (`lang` en Pixabay, que ademas
localiza sus etiquetas; `locale` en Pexels) y se busca con el termino que el
banco tiene indexado, aceptando su etiqueta en ingles como equivalente de lo que
dices. El puente es un glosario explicito (`assets/language.py`) de lo que se
nombra en una guia, con su limite dicho: si el termino no esta, la consulta se
manda tal cual y, si asi no se puede confirmar que el material es de lo que
hablas, no se pone nada. Ahi es donde encaja un modelo local de traduccion el
dia que sus pesos se puedan traer y comprobar; el analisis esta en
[`ANALISIS-INSERCION-MULTIMEDIA.md`](ANALISIS-INSERCION-MULTIMEDIA.md).

Nunca se repite el mismo recurso, y si un banco esta caido o no hay red, el
montaje sigue con lo que tenga. Los creditos de licencia se emiten aparte.

Un banco devuelve una **ficha con una direccion**, no un fichero, asi que el
material se **baja** antes de renderizar: cacheado por identificador (reencuadrar
o cambiar de estilo no lo vuelve a bajar), con tope de 80 MB por fichero -- un
clip 4K de cien megas para verse dos segundos no compensa --, con tiempo limite
y escrito de forma atomica, para que una descarga cortada no deje medio fichero
que el siguiente render tome por bueno. Si una descarga falla se monta sin ese
material, y el informe dice cuantos no se pudieron traer.

(Esto no existia: la descarga estaba dada por hecha en un comentario del render
--- "se omite en vez de tumbar el render por una descarga que fallo" --- y con
una clave configurada el montaje prometia material que el video no llevaba.)

### Cuando entra y donde se pone

El material entra **cuando dices la palabra**, no cuando empieza el tema. Parece
lo mismo y no lo es: los temas se detectan en ventanas de hasta seis segundos de
habla, y colocar el material al principio de la ventana lo dejaba a 1,78 s de
mediana de la palabra que ilustra, con casos de 6,6 s. Es decir, en la mitad de
los casos la imagen entraba mientras hablabas todavia de otra cosa. Con el
instante real de la palabra -- que la transcripcion trae desde el principio --
la mediana baja a **0,29 s** y ningun caso pasa de 1,1 s.

Y se queda **hasta que nombras otra cosa**, no hasta que acaba la frase. El
final de una ventana de habla es un corte de la segmentacion, no el final de
nada: si sigues hablando de lo mismo, el material sigue; y en cuanto nombras
algo distinto, se va, aunque el tema anterior siguiera vivo. Esto hace falta
justamente por lo anterior: como la palabra suele caer al final de la ventana,
cortar ahi dejaba las inserciones sin sitio (2 de 31 se perdian y la duracion
media bajaba un 13%).

Y la ventanita ya no va siempre arriba a la derecha, que en una guia es justo
donde suele estar lo que explicas. Se coloca con dos criterios, en este orden:

1. **No tapar**: la caja del texto que acabas de nombrar, donde tienes el
   puntero (mirado cada medio segundo a lo largo de la insercion, no solo al
   principio y al final) y la banda de subtitulos --- que **no siempre esta
   abajo**: `captions.py` los sube cuando el foco del plano esta en la parte
   baja, y darlo por hecho ponia la ventanita justo encima de ellos.
2. **Donde haya menos cosas**: el analisis de cada plano trae ahora una rejilla
   de tercios que dice cuanto **hay** en cada zona del fotograma. Es otra
   pregunta que la del foco de atencion ("a donde mira el ojo"), y se mide con
   detalle fino y no con saliencia, porque un area de texto uniforme no
   destaca aunque este completamente ocupada.

Lo segundo no manda sobre lo primero: taparte lo que explicas es un fallo, y
ponerla sobre una zona con cosas es solo menos elegante. Y solo se mueve cuando
compensa, porque cambiar de sitio en cada insercion se ve nervioso.

Si estas senalando algo mientras entra material, el material **no tapa la
pantalla**: pasa a ventanita apartada. Antes ese choque se resolvia tirando el
material entero.

Un detalle que importa: a diferencia de un zoom, un b-roll a pantalla completa
**no** esquiva los cortes, los tapa. En una guia muy recortada los cortes caen
cada pocos segundos, asi que exigirle que no los cruce dejaria el montaje sin un
solo material de apoyo.

### Efectos de sonido

Se **sintetizan** con numpy (barrido, golpe, subida y clic) en vez de
distribuir ficheros. No es una limitacion: es la unica forma de traer efectos
sin arrastrar un problema de licencias, y permite afinarlos sin buscar otro
fichero.

La regla que los hace soportables es una sola: **un sonido no va solo**. Se
engancha a algo que ya esta decidido, y si eso desaparece, el sonido se va con
ello:

```
transicion  -> whoosh     la imagen cambia
rotulo      -> riser      entra un grafico
zoom        -> impact     la camara se acerca de golpe
```

(Esto estaba prometido y no existia: `gaming-hype` pedia diez sonidos por
minuto y no sonaba ninguno. Estaban el sintetizador, el tipo de efecto y la
mezcla; faltaba quien los colocara.)

### Musica

Igual que la biblioteca de b-roll: **la pones tu**, en `assets/music/`. Sin
fichero, el estilo que la pida se monta sin ella y el render lo dice.

Lo que separa "musica de fondo" de "musica encima" es el **agachado**: la
musica se aparta sola mientras hablas y vuelve cuando callas
(`sidechaincompress` con la voz de llave, umbral bajo y vuelta lenta para que
se aparte entera en vez de respirar con cada silaba). Medido sobre el material
de pruebas: con agachado la musica baja mas de 3 dB mientras suena la voz y
vuelve al mismo nivel en el silencio.

Y un detalle del orden que estaba mal: el tratamiento de voz (corte de graves,
de-esser, compresor) se aplicaba a la **mezcla ya hecha**, asi que le quitaba
los graves a un golpe y el de-esser bombeaba con el ruido de un whoosh. La voz
se trata ahora **antes** de mezclar nada, que es lo unico que tiene sentido.

## El rótulo que dice donde estas

Un rectangulo de color con texto, en una esquina, que te situa: *"Expediciones
Palworld"*. La idea es la de television, y el texto no es una plantilla: sale de
lo que el video **esta tratando** en ese tramo.

Y ahi estuvo el primer fallo. La primera version usaba el titulo del capitulo
tal cual, que es una **frase**: salian rotulos como *"El siguiente paso es el
importante"* o *"Importante fijate boton"*, y eso no situa a nadie. Un titulo de
capitulo puede permitirse ser una frase --- se lee una vez, en una lista, con su
minuto delante ---; un rotulo se lee de reojo mientras hablas, asi que es un
**nombre**: el ejemplo a imitar tiene dos palabras, no cinco.

Ahora el texto sale de `understand/topics.py::label`, que contesta "¿de que va
esto?" con los terminos que ese tramo usa y los demas no, en la forma en que los
dijiste, y se corta a dos palabras. En la misma guia: *"Abrimos ajustes"*,
*"Paso importante"*, *"Casilla marcar"*.

En una guia de router, impresora y firewall salen exactamente tres:
*"Router wifi"*, *"Impresora bandeja"*, *"Reglas firewall"*. Uno por seccion.

Y un fallo de los dos relojes, que en este proyecto ya es un clasico: los
capitulos van en tiempo de **montaje** y las palabras de la transcripcion en
tiempo del **original**. Compararlos directamente parece funcionar --- el primer
capitulo empieza en cero en los dos --- y se estropea segun avanza el video,
porque el montaje ha quitado por el camino un tercio del original. El sintoma
era un rotulo con palabras de otra seccion: el capitulo de la impresora se
titulaba *"Imprime bloquea"*, y "bloquea" es del firewall.

Cinco reglas mas que salieron de mirar lo que producia:

- **Un rotulo dice un sitio, no una accion.** Salian *"Abrimos ajustes"* y
  *"Casilla marcar"*, cuando lo que situa es *"Ajustes"* y *"Casilla"*. Un
  titulo de capitulo puede permitirse el verbo; un rotulo no. La lista de verbos
  esta escrita a mano a proposito: por la terminacion no se puede distinguir en
  castellano sin equivocarse mucho ("ajustes" y "abrimos" acaban las dos en
  -es/-os, y "lugar" acaba en -ar sin ser verbo).
- **Se juzga el nombre que se ve, no el titulo del capitulo.** El capitulo *"De
  la impresora"* no pasaba el filtro --- una sola palabra de mas de tres letras
  --- y su rotulo habria sido *"Impresora"*, que esta perfectamente bien. Se
  estaba juzgando un texto y ensenando otro.
- **Una ventanita de material no se pone encima de un rotulo.** Las dos cosas
  eligen esquina con el mismo criterio y las dos prefieren la misma, asi que sin
  decirselo acaban una sobre otra. Ahora lo ya colocado cuenta como ocupado.

- **La caja se mide por su texto.** Reservarle a "Firewall" el mismo hueco que a
  "Expediciones Palworld" hace que la decision de donde ponerlo se tome con un
  tamano que no es el suyo.
- **No se repite lo mismo con otras palabras.** Salian *"Seccion terminamos"* y
  *"Terminamos seccion"* en el mismo video. Se compara con todos los anteriores,
  no solo con el ultimo, y con dos palabras por rotulo compartir una ya es
  compartir la mitad: *"Paso importante"* y *"Siguiente paso"* no anuncian dos
  cosas distintas.
- **Con un solo capitulo no hay rotulos.** Un rotulo de seccion contesta *en
  cual estas*; si solo hay una, no contesta nada. Y encima el nombre salia mal,
  porque se calcula contrastando lo que se dice ahi con lo que se dice en el
  resto: sin resto, en una prueba salio *"Chrome base"*, dos palabras de dos
  temas distintos.

El tipo `LowerThirdEffect` estaba en el esquema desde F2 y **no lo planificaba
ni lo dibujaba nadie**.

Lo dificil de esto no es dibujarlo, es **no ponerlo**. Un rotulo mal puesto es
peor que ninguno, y hay tres formas facilisimas de ponerlo mal:

1. **Decir dos veces lo mismo.** Al empezar un capitulo ya sale su tarjeta con
   el titulo. Por eso el rotulo **no acompana al cambio, acompana a la
   seccion**: sale despues, cuando la tarjeta ya se fue, para quien llega a
   mitad y no sabe de que se esta hablando.
2. **Ponerlo donde no hace falta.** En una seccion de cuarenta segundos la
   tarjeta del principio basta: nadie se ha perdido todavia. Solo en secciones
   largas.
3. **Ponerlo encima de lo que estas ensenando.** La posicion no es fija: se
   elige igual que la de la ventanita de material, apartandose de lo que
   senalas, del puntero, de los subtitulos y de la zona llena de la pantalla.

Y ademas tiene que **justificarse** como todo lo demas: un capitulo largo con
titulo concreto lo justifica; uno que `chapters.py` tuvo que numerar ("Parte 3")
no, porque un rectangulo azul que ponga "Parte 3" no situa a nadie.

El color sale del estilo y no del rotulo --- dos colores distintos en el mismo
video se leen como un error --- y `cinematic` no lleva ninguno: una pieza de cine
no se rotula. `gaming-hype` tampoco saca: no crea capitulos, asi que no hay
secciones que nombrar.

Se dibuja en el mismo `.ass` que los subtitulos y las tarjetas (misma fuente,
mismo contorno, mismos fundidos), con `BorderStyle: 3` para la caja. Y se
comprueba mirando los pixeles de un render de verdad, porque este proyecto ya
tuvo rotulos de capitulo que se planificaban y no se dibujaban nunca.

### El "x24" mientras el video corre

El montaje ya aceleraba las esperas que tu mismo anuncias: dices *"esto tarda un
rato"* y el minuto y medio de instalacion pasa a 24x, cuatro segundos en los que
se ve la barra avanzar. Buena decision, tomada hace tiempo.

Y **no lo decia en ninguna parte**. Un video que de pronto corre a veinticuatro
veces la velocidad, sin avisar, no se lee como una decision de montaje: se lee
como un fallo de reproduccion.

Ahora sale un marcador mientras dura, y con dos detalles que importan:

- **Va fijado**: no compite por el presupuesto del montaje ni lo puede podar el
  balanceador. No es un adorno, es la explicacion de algo que el montaje ya
  hizo; quitarlo dejaria el video acelerandose en silencio otra vez.
- **No sale por cualquier cosa**: por debajo de 1.5x no es un avance rapido sino
  un ajuste de ritmo, y un acelerado que dura menos de ocho decimas no se
  percibe como aceleracion, es un corte.

Las demas herramientas que se consideraron --- y por que casi todas se quedan
fuera --- estan en
[`ANALISIS-HERRAMIENTAS.md`](ANALISIS-HERRAMIENTAS.md).

## Cuando dos efectos se estorban

Cada planner decide bien lo suyo y ninguno miraba lo que habian decidido los
demas. Por separado las decisiones eran razonables; juntas, no.

**El caso grave era geometrico.** El recuadro que senala un boton se calculaba
en coordenadas del fotograma de salida y se dibujaba **despues** del zoom:

```
boton al 84,5% del ancho, zoom centrado en el
  zoom 1,06 (ken burns)   se ve al 83,6%   se pintaba al 84,5%    18 px
  zoom 1,16               se ve al 82,0%   se pintaba al 84,5%    48 px
  zoom 1,45               se ve al 77,5%   se pintaba al 84,5%   134 px
```

Un boton de menu mide unos 170 px en 1080p, asi que con el zoom de 1,45 la caja
se salia entera. Y no era un caso raro: el zoom y el recuadro se colocan **por
la misma senal** (estas senalando algo), asi que pasaba siempre que la cosa
funcionaba. Ahora el recuadro se dibuja **dentro del clip, antes del zoom**, y
el zoom se lo lleva con la imagen. Hay un test que lo renderiza con zoom y mide
donde cae el trazo.

El resto lo arregla un **arbitro** que se pasa al cerrar el montaje:

| lo que se quita | por que |
|---|---|
| recuadro, zoom o deriva **debajo de un b-roll a pantalla completa** | tapan el video base: senalan o acercan algo que no se ve |
| **Ken Burns** donde ya hay un zoom | Ken Burns existe para que un plano quieto no parezca congelado; con zoom no esta quieto |
| **zoom dentro de un avance rapido** | a ocho veces la velocidad no se lee como un zoom, se lee como un tiron |
| **b-roll sobre el rotulo de un capitulo** | dos graficos a la vez |
| **sonido sin nada que acompanar** | un whoosh sin que se mueva nada es ruido |

Quitarlos es lo correcto y no solo lo comodo: un efecto tapado no se ve pero
**cuenta** en el medidor de saturacion y ocupa un hueco que podria llevar algo
que si se vea. El auto-balanceador tampoco lo veia -- solo comparaba efectos
del mismo tipo entre si -- y ahora consulta al mismo arbitro antes de recuperar
un candidato.

### Una transicion donde no cambia nada

Las transiciones se repartian con una regla de tres: una fraccion de los
cortes, espaciados de forma regular, **sin mirar que corte era**. En una guia
la mayoria de los cortes son silencios quitados *dentro del mismo plano*: ahi
la imagen no cambia, y un fundido es un bajon de brillo en mitad de una
pantalla quieta.

Ahora un corte lleva transicion cuando **a los dos lados se ve otra cosa** o
cuando ahi **empieza un capitulo**, que son dos cosas que el sistema ya sabia y
no usaba ninguna. Y lo dice:

```
transicion fade en 52.7s: ahi cambia el plano
transicion fade en 65.0s: ahi empieza el capitulo "Instalar los drivers"
```

En la guia de ejemplo pasa de 7 transiciones repartidas a 5 justificadas. Si no
hay ningun cambio de plano ni de capitulo -- una grabacion de pantalla de punta
a punta -- no se pone ninguna, que es lo correcto.

## Entender de que va cada parte

Hasta aqui el montaje sabia **donde respiras**, no **de que hablas**: los
capitulos salian de las pausas largas y todo el video se editaba igual. Pero las
partes de una guia no valen lo mismo, ni para quien la hace ni para quien la ve:

- la **intro** se la salta casi todo el mundo,
- un **paso** es lo que vienen a buscar,
- un **aviso** ("ojo, si no haces esto no funciona") es el momento que no se
  puede perder,
- una **digresion** ("por cierto, aunque esto da igual...") es justo lo que
  sobra,
- el **cierre** ("nos vemos en el siguiente video") tampoco lo ve nadie entero.

Se detecta por las **marcas del discurso**: las formulas con las que una persona
enlaza lo que cuenta. En material explicativo son sorprendentemente fijas ("lo
primero es", "ahora vamos a", "ojo con", "en resumen", "nos vemos"), van casi
siempre al principio de la frase, y no hace falta ningun modelo de lenguaje. Lo
mejor es que **explican su decision solas**:

```
parte      desde  dura   por que
intro      0:00     5s   intro: dices "hola"
paso       0:05     3s   paso: dices "lo primero es"
cuerpo     0:08     8s   cuerpo: no enlaza con ninguna formula reconocible
aviso      0:16     3s   aviso: dices "fijate bien"
...
aviso      0:31     5s   aviso: dices "esto es lo importante"
resumen    0:52     3s   resumen: dices "y ya esta"
cierre     0:55     2s   cierre: dices "nos vemos"
```

### Y entonces edita distinto cada parte

Cada estilo declara cuanto aprieta en cada parte. 1.0 es el ritmo normal, mas
de 1 recorta pausas mas cortas y deja menos aire, y 0 no toca nada:

```json
"roles": {"intro": 1.5, "paso": 1.0, "aviso": 0.5, "cierre": 1.6, "digresion": 1.6}
```

Sobre la guia de ejemplo, el resultado quita **lo mismo** (un 20%) pero quita
**cosas distintas**:

```
sin entender:  11,8s de silencio
entendiendo:    6,7s de silencio · 2,0s en cierre · 1,9s en aviso
                0,9s en intro    · 0,3s en paso
```

El aviso conserva el doble de aire alrededor -- que es lo que hace que la frase
importante caiga con peso -- y la intro y el cierre se aprietan. Ademas:

- los **capitulos** siguen lo que se dice y no las pausas (ver "Donde cambia el
  tema"). Decir "ahora vamos a" es mejor senal de cambio de tema que respirar
  hondo, que una persona hace tambien para pensar o para beber agua.
- los **zooms** valen mas donde se avisa de algo (x1,6) y menos en la intro
  (x0,6). En la guia de ejemplo, el unico zoom del montaje pasa a caer sobre el
  aviso.

Dos cosas que hace **mal** a proposito. No se inventa estructura: si nadie
enlaza nada, todo queda como cuerpo y el montaje se comporta exactamente como
antes (hay un test que lo fija). Y las marcas tienen que **abrir** la frase: un
"ahora" en la palabra veinte ya no enlaza nada, igual que el "este" de "en este
video" no es una muletilla.

## "¿Tengo que decir exactamente esa frase?"

Es la pregunta correcta, y la primera vez que se midio la respuesta era **que
si**: de cincuenta cosas que diria de verdad una persona grabando una guia,
reconocia **21**. Un 42%. Buscaba frases literales.

Buscando **raices de palabra** en vez de frases, y atando lo que se nombra a
lo que pone en pantalla, sube a **50 de 50**:

```
                antes   ahora
esperas          17%     100%
saltos           12%     100%
avisos           40%      90%
senalar          88%     100%
pasos            57%     100%
cierres          60%     100%
-------------------------------
TOTAL            42%     100%
```

"Tarda", "tardar", "tardando", "tardara" son la misma cosa, y ahi se iba la
mitad de la cobertura. Lo mismo con "cuidado/cuidadito", "salto/saltar/me lo voy
a saltar", "primer/primera/primero".

Las dos cifras estan fijadas en `tests/test_cobertura_habla.py`, **y la segunda
importa mas que la primera**: doce frases que no deben disparar nada ("corto por
lo sano y empiezo de cero", "tengo que instalar una actualizacion algun dia").
Sin ese segundo numero, el primero se sube a base de romper el sistema.

### El examen dificil

Ese 98% tenia trampa, y se vio al escribir un examen hecho para suspenderlo.
Las frases que no debian disparar eran **neutras**: no llevaban dentro ninguna
palabra del detector, asi que aprobarlas no costaba nada. El examen dificil
(`tests/test_deteccion_dura.py`) cambia las dos mitades:

- **veinte trampas** que llevan las palabras de los patrones en sentido
  inocente: *"cuidado es el nombre de la carpeta"*, *"hasta aqui llega el menu
  lateral"*, *"me salto una linea en el editor"*, *"gracias por el consejo que
  me disteis el otro dia"*;
- **veintiuna parafrasis** que no se parecen a ninguna formula del diccionario:
  *"y ale a mirar la barrita subir"*, *"ni me molesto en ensenaroslo"*,
  *"cerramos esto y abrimos lo otro"*.

La primera vez que se paso, de las veinte trampas se colaban **catorce**, y de
las parafrasis reconocia **tres**. Buscar la raiz de la palabra generaliza, pero
tambien dispara en cualquier frase que la lleve.

```
                       trampas coladas   parafrasis reconocidas
buscando la raiz            14 / 20            3 / 21
+ contexto de la frase       1 / 20            3 / 21
+ mas formas de decirlo      0 / 20           21 / 21
```

Lo que cerro las trampas no fue estrechar los patrones -- eso habria devuelto el
42% -- sino mirar **el contexto** alrededor de la palabra, en `understand/text.py`:

| se pregunta | separa |
|---|---|
| ¿va negada? | "esto **no** tarda nada" de "esto tarda" |
| ¿habla de siempre o de ahora? | "esta app tarda **en general**" de "esto tarda" |
| ¿hay algo que la ate a este momento? | "yo **esperaba** que fuera mas facil" de "a esperar" |
| ¿es un nombre o es una interjeccion? | "cuidado **es** el nombre" y "clave **de registro**" de "esto es clave" |
| ¿el verbo dice **que** se salta? | "**corto** y pego el texto" de "esto lo corto" |
| ¿cae al final del video? | "un saludo" que despide de "un saludo" que manda un recado |

Ninguna de esas preguntas necesita un modelo de lenguaje, y cada una tiene el
tamano justo: la del imperfecto empezo buscando la terminacion `-ia` y se comia
"paciencia" y "todavia"; la del verbo copulativo miraba cuatro palabras por
delante y se comia "atencion, que esto **es** clave". Las dos cosas las cazo el
examen, no una revision a ojo.

### De reconocer frases a reconocer de que hablas

Todo lo de arriba busca **formulas**. Funciona muy bien con las formas de
decirlo que estan en la lista y **no existe** para las que no, que es la queja
de verdad: *"¿tengo que decir exactamente eso?"*.

Para saber cuanto de grave era, la unica forma honesta es medir sobre frases
que no hayan influido en los patrones. Se escribieron tres conjuntos nuevos, a
ciegas, y se midieron antes de tocar nada:

```
                  antes    ahora
conjunto A  (38)   37%      100%
conjunto B  (29)   38%      100%
conjunto C  (29)   14%       86%
```

De cada tres cosas que dirias, dos no las veia. Y no se arregla escribiendo mas
patrones: las formas de decir algo en castellano no se acaban nunca. Lo que si
se acaba es de **cuantas cosas** se habla en una guia.

Asi que `understand/meaning.py` cambia la pregunta. En vez de "¿encaja esta
frase con alguna formula?", pregunta "¿de que habla y como lo dice?":

- **Campos de significado** -- grupos de palabras que valen lo mismo para el
  montaje: lo que hace la maquina (comprimir, indexar, sincronizar, clonar,
  renderizar...), lo que mide el tiempo (rato, siglo, paciencia, despacio...),
  formas de ausentarse (irse, volver, fumar, mientras...), de peligro, de
  suprimir, de avanzar, de despedirse.

- **Construcciones** -- moldes de la gramatica con un hueco. `se esta
  <gerundio>` dice que algo esta en marcha **ahora**, y lo dice igual con un
  verbo que no esta en ninguna lista. `no hay quien lo <verbo>` es una
  hiperbole de duracion. `como <subjuntivo>, <consecuencia>` es una amenaza.

Y la senal sale de **combinar** las dos cosas, nunca de una sola:

```
"el archivo comprimido ocupa la mitad"        campo             -> nada
"se esta comprimiendo, esto va a su ritmo"    campo + molde     -> toca esperar
"esto se esta chorizando entero"              molde con un
                                              verbo inventado   -> toca esperar
```

Esa ultima es la prueba de que no es otra lista: el verbo no existe y la senal
sale igual, porque lo que se reconoce es el molde.

Debajo hay **morfologia de verdad**, no `\w*`: el stemmer de Snowball para
castellano (puro Python, unos KB) mas dos capas propias para lo que el no
quita, que al hablar sale todo el rato:

```
asegurate  -> asegurar     el pronombre pegado detras
ensenaroslo-> ensenar
ratito     -> rato         el diminutivo
cuidadin   -> cuidado
vigila     -> vigilar      y NO "vigi": el pronombre solo se pega a un verbo,
pantalla   -> pantalla     asi que estas dos no pierden nada
```

Las cifras de arriba van con su contrapartida, que importa mas: **62 frases
trampa, 0 falsos positivos**. Ensanchar la cobertura es facil; ensancharla sin
empezar a ver senales donde no las hay es el trabajo.

Dos errores viejos los encontro este conjunto de frases, no una revision a ojo:

- la formula inglesa de saludo no llevaba `\b` delante, asi que **el "hi" de
  "ahi"** convertia en intro cualquier frase con un "ahi" dentro;
- la terminacion `-aba` del imperfecto pillaba **"acaba" y "graba"**, que son
  presente y en una guia se dicen cada dos frases. Dar una frase por "habitual"
  la desactiva entera.

### Y si aun asi hablas distinto

Un fichero `frases.json` al lado de la configuracion:

```json
{
  "espera": ["se queda pillado", "esto se atasca"],
  "aviso":  ["esto es peliagudo"],
  "salto":  ["esto no os lo pongo"]
}
```

Se busca tal cual, sin acentos ni mayusculas, asi que no hace falta saber nada
de expresiones regulares. Se suman a las de serie, no las sustituyen, y un
fichero roto no tumba nada: es un fichero que edita una persona a mano, o sea
que se va a romper.

### Lo que sigue sin saber hacer

Esto no **entiende** lo que dices, reconoce **como** lo dices, y eso pone un
techo que no sube a base de anadir patrones. Lo que falla hoy:

- **Hablar de algo de lo que no habla ninguna guia.** Los campos cubren de lo
  que se habla montando algo en un ordenador. Si tu guia va de otra cosa, sus
  palabras no estan, y ahi `frases.json` sigue siendo el atajo. Un modelo
  pequeno de embeddings local quitaria tambien esa lista -- cabe en el proyecto,
  porque ya se usa ONNX Runtime -- y es lo siguiente que tiene sentido.
- **El conjunto C saco un 86% y no un 100%.** Cada vez que se escribe un
  conjunto nuevo aparecen formas que no cubre: es un sistema que mejora cuando
  lo mides, no uno terminado. El numero para **tu** forma de hablar solo lo
  sabes tu.
- **La ironia y el tono.** "Ah, buenisimo" dicho con retintin es un aviso, y
  aqui no lo es.

## Lo que le pides al montaje sin saberlo

La estructura dice **de que va cada parte**. Esto es lo otro: los momentos
sueltos en los que lo que dices pide una decision concreta.

**Senalas.** "Mira aqui", "este boton de arriba a la derecha". Cuando senalas
estas dirigiendo la mirada a un sitio **en ese instante**, y a veces dices a
cual. Eso es mejor informacion que cualquier mapa de saliencia: la saliencia
sabe donde hay **contraste**, tu sabes donde hay que **mirar**. De la frase sale
la zona:

```
"pulsa este boton de la izquierda"        -> (22%, 50%)
"lo tienes arriba a la derecha"           -> (78%, 25%)
"fijate en esta casilla de abajo"         -> (50%, 75%)
```

Y ahi va el zoom. Si dices "a la derecha" pero no la altura, la altura se queda
en el centro: no se inventa la mitad que no dijiste.

Pero la forma normal de senalar algo en una guia no es por su sitio, es **por su
nombre**: *"justo donde pone Ajustes"*, *"dale al boton de Guardar"*, *"pincha
en Exportar"*. Eso no lo resuelve ninguna tabla de zonas, y si lo resuelve el
OCR, que ya lee lo que pone en pantalla y **donde**:

```
"pulsa este boton de la izquierda"        -> (22%, 50%)   la zona que dices
"justo donde pone Ajustes"                -> (84%, 91%)   el boton exacto
```

La diferencia en el video montado es un zoom al tercio correcto de la pantalla
frente a un zoom al elemento. Tres cosas que hace por el lado seguro:

- si lo que nombras **no** esta escrito en pantalla, se queda como antes: la
  senal existe, pero sin sitio. No se inventa uno;
- si esta escrito en **dos** sitios, tampoco se elige: apuntar al equivocado es
  peor que no apuntar;
- y si lo que dices y lo que se lee **se contradicen** -- dices "arriba a la
  izquierda" y la palabra se leyo abajo a la derecha -- gana lo que dices. Uno
  de los dos se equivoca y no hay forma de saber cual, pero el OCR se equivoca
  mas que tu, y mandar el zoom al lado contrario de la pantalla es el peor
  resultado posible.

Sin Tesseract instalado no cambia nada de lo de antes: se sigue senalando por
zona.

**Y el zoom encuadra, no solo apunta.** Sabiendo el tamano del elemento se
puede decidir cuanto acercarse, que antes era un numero fijo para todo porque
no se sabia a que se acercaba:

```
un boton "Guardar"          9% de ancho   -> zoom 1,45   (el tope)
"Configuracion avanzada"   22% de ancho   -> zoom 1,45
un panel lateral           60% de alto    -> zoom 1,16   (el de serie)
una barra de lado a lado   92% de ancho   -> sin zoom
```

Los dos extremos son los que importan. Arriba hay un **tope**: en una grabacion
de pantalla, 1,45 sobre 1080p ya es recortar a 745 lineas y volver a subirlas, y
pasado ese punto lo que se gana en tamano se pierde en nitidez. Abajo hay una
regla mas util todavia: **un zoom que corta lo que estas senalando es peor que
no acercarse**, asi que a lo ancho no se le hace zoom, y si ocupa la pantalla
entera no se propone ninguno -- un zoom de 1,0 no es un zoom, es un efecto vacio
que gasta cupo y suma en el medidor de saturacion.

### Leer la pantalla donde hablas de ella

El OCR se muestreaba en una rejilla: unas cuarenta lecturas repartidas por el
video. Para **identificar** el contenido (los menus y titulos que se repiten)
sobra. Para **senalar** no vale, y era un fallo invisible: en un video de veinte
minutos la rejilla cae cada treinta segundos y una lectura solo sirve para los
cuatro segundos de alrededor, asi que **el 73% del video no tenia nada que
leer**. Decir "dale al boton de Guardar" en un hueco no daba error: simplemente
no aparecia el zoom.

La correccion no es leer mas, es leer **donde importa**. Los momentos en los que
senalas salen del transcript, que ya esta calculado, asi que se anaden a la
rejilla los fotogramas de esos momentos:

```
senalas en...   lectura mas cercana (rejilla)   ahora
  1:40                 5,0 s   (fuera)          0,8 s
  3:21                 6,5 s   (fuera)          0,8 s
  5:55                10,0 s   (fuera)          0,8 s
 10:20                 5,0 s   (fuera)          0,8 s
 16:21                 6,0 s   (fuera)          0,8 s
```

Cuesta un fotograma por momento -- en ese ejemplo, 39 lecturas pasan a 44 -- con
un tope para que un video donde senalas sin parar no se convierta en mil
llamadas a Tesseract.

**Enfatizas**, por dos vias a la vez. Las palabras ("esto es clave", "sobre
todo") y el **nivel de voz**, que ya se medía para encontrar los silencios y se
estaba tirando. Guardar esa curva no cuesta ninguna pasada mas y da prosodia
medida, no adivinada.

La referencia es **local**, no la del video entero, y eso importa: quien baja la
voz durante una frase sigue acentuando dentro de ella. Medido contra las
palabras que el generador acentua a proposito, la referencia global perdia una
de seis (quedaba a +2,2 dB porque su frase iba baja entera) y metia 3 falsos
positivos; la local acierta 6 de 6 con ninguno.

El umbral tambien sale de ahi:

```
umbral   aciertos   falsos positivos
  2,5       6/6            3
  3,0       6/6            0
  3,5       6/6            0
  4,0       5/6            0
```

Se elige 3,2, que cae en el centro de la meseta. Ajustarlo al borde es como se
consigue un numero bonito que se rompe con el primer video distinto.

**Avisas de una espera.** "Esto tarda un rato", "mientras carga", "esperamos a
que termine". Lo que viene detras **no es tiempo muerto que tirar**: es un
proceso que hay que ver pasar, solo que deprisa. Asi que en vez de cortarlo se
acelera, que es lo que hace un editor:

```
 0,0- 4,5   x1     tramo con contenido
 4,5-34,5   x8     espera que anuncias, a 8x     <- 30 s que se ven en 4
34,5-48,1   x1     tramo con contenido
```

Si la espera es muy larga se acelera mas, para que el resultado quepa en unos
segundos: treinta segundos a 8x son cuatro, pero dos minutos a 8x son quince y
eso ya no lo aguanta nadie.

Esto resucita `Clip.speed`, que el renderer soportaba desde el principio
(`setpts` + `rubberband`, con sus tests) y que **ningun sitio del planner usaba**
-- la tercera funcion muerta del proyecto, despues de los recuadros y los
rotulos de capitulo. Y es seguro por construccion: la espera se busca entre los
**silencios** detectados, asi que nunca puede caer sobre algo que estas
diciendo (acelerar tu voz ocho veces seria ininteligible).

**Dices que algo sobra.** "Esto os lo salto", "no hace falta que veais esto",
"os ahorro esto". Se quita hasta que vuelves a hablar, con un tope de 90
segundos: si no vuelves a hablar en mucho rato, lo que hay ahi es una espera, no
medio video.

**Te corriges.** "No, perdon", "mejor dicho", "me he liado". Eso marca la toma
**anterior** como fallida, y es de lo poco que se puede quitar entero sin perder
contenido: lo estas diciendo tu. Se quita como mucho la cola de la frase
anterior (3,5 s), no un parrafo, y va con el mismo permiso que las muletillas.

## Donde cambia el tema

Los capitulos salian de dos senales: las formulas de enlace ("ahora vamos a") y
las **pausas largas**. La primera es buena. La segunda resulto ser un apano, y
se puede medir cuanto: en una guia de tres temas escrita a proposito **sin una
sola formula de enlace**, con las pausas largas repartidas donde el tema **no**
cambia (que es lo que pasa al hablar: se respira hondo en mitad de una
explicacion),

```
                     encuentra          se inventa
por pausas           0 de 2 cambios     6 capitulos
por vocabulario      2 de 2 cambios     0 capitulos

y en un video de un solo tema, de control:
por pausas                              15 capitulos
por vocabulario                          0 capitulos
```

Una pausa dice que has respirado, no que hayas cambiado de asunto.

Lo que si lo dice es el **vocabulario**. Mientras hablas de instalar el driver
dices "driver", "tarjeta", "version"; cuando pasas al microfono esas palabras
desaparecen y aparecen "ganancia", "nivel", "retumbe". Comparando el vocabulario
de dos ventanas consecutivas sale una curva, y los **valles** de esa curva son
los cambios de tema. Es TextTiling (Hearst, 1997), de antes de las redes
neuronales, y sigue funcionando porque mide algo real.

Tres cosas que lo hacen servir en un montaje y no solo en un papel:

- **la frontera se afina hasta el principio de frase** que mejor separa los dos
  vocabularios. La ventana da la zona, no el punto, y un capitulo que empieza a
  mitad de frase se lee como un fallo. En la prueba, el primer cambio cae a
  **0,0 s** del real y el segundo a 4,1 s.
- **dos criterios de profundidad, no uno.** El relativo (este valle comparado
  con los demas del video) se adapta a como hable cada uno, pero por si solo le
  inventa un capitulo a un video monotematico, porque siempre hay un valle que
  es el mas profundo de los suyos. Hace falta ademas que la caida sea grande de
  verdad.
- **lo dice en palabras.** Cada frontera explica que se deja de decir y que
  empieza a decirse: *"se deja de hablar de instalar/driver/limpia y se pasa a
  nivel/entrada/microfono"*. Eso es tambien lo que titula el capitulo, con las
  palabras tal y como se dijeron y no con las raices.

Las pausas no desaparecen: si no hay vocabulario que comparar -- porque casi
todo son muletillas, o porque el video es muy corto -- se vuelven a usar, que es
mejor que quedarse sin capitulos.

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

**Nombrar no es senalar**, y la diferencia importa cuando no caben todos. Que
digas una palabra que esta escrita en pantalla solo prueba que ese objeto
existe; decir *"dale al boton de Guardar"* pide que lo miren. Los dos valen un
recuadro, pero el estilo deja sitio para unos pocos por minuto, y antes se los
quedaban los primeros del video por el simple hecho de ir antes. Ahora se
reparten por valor, asi que sobreviven los que senalas. En el ejemplo de los
tests, en treinta segundos cabe uno: antes salia el que nombras de pasada,
ahora sale el que senalas.

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

## El examen: una guia entera con la verdad apuntada

Cada pieza del analisis tenia su banco de pruebas hecho a su medida, y eso
esconde justo lo que mas importa: si el conjunto **acierta sobre un video que no
se hizo para el**.

`forge/screenguide.py` genera una guia de pantalla de 130 segundos con la
estructura de una de verdad --- tres temas distintos, cosas que aparecen y
desaparecen, una espera larga anunciada, un aviso, muletillas, elementos de
interfaz que se nombran al hablar --- y sobre todo **apunta la verdad**: en que
segundo pasa cada cosa y en que parte de la pantalla. Con eso se puede preguntar
lo unico que importa: *¿el analisis encuentra lo que hay?*

Lo que contesta hoy (`tests/test_examen_guia.py`):

| lo que hay | lo que encuentra |
|---|---|
| 5 sucesos de pantalla | los 5, con 0.04-0.10 de error de posicion |
| 0 sucesos donde no pasa nada | 0 inventados |
| 8 terminos de interfaz | los 8 leidos por OCR |
| espera de 44s en el segundo 50 | la encuentra a 3s de sus dos extremos |
| 3 temas, uno de ellos un aviso | los 3 tramos, con el aviso marcado como tal |
| 130s de video | montaje de 53.5s en 15 clips |
| la espera ocupa 44s | ocupa **5.2s** (acelerada y marcada, no cortada) |
| 0 cortes anunciados | 0 marcados (antes 2, los dos inventados) |

Dos de los tres fallos que salieron de este examen estan contados arriba: el
detector de sucesos que solo miraba en los cortes de plano (seccion *Que cambia
en la pantalla*) y los refuerzos sin techo que ponian un zoom ciego por encima
de uno informado. Ninguno lo veia ninguna de las pruebas a medida, porque cada
una daba por bueno lo que su propio fixture le ponia delante.

La espera merece una nota: **no se corta**, se acelera. La anunciaste ("esto
tarda un buen rato asi que espera"), asi que cortarla dejaria tu propia frase
sin sentido. Se acelera x24, se marca en pantalla, y de 44 segundos pasan a
ocupar 5.

### El tercero: palabras que son dos palabras

De las catorce frases del guion, **dos se marcaban como "aqui se corta"** y
ninguna lo pedia:

```
"ojo con esto si la contrasena es CORTA no protege nada"   raiz de "cortar"
"ya esta la impresora LISTA otra vez"                      raiz de "listo"
```

La primera es el **aviso** de la guia, la linea mas importante del video, y el
montaje tenia permiso para tirarla porque un adjetivo comparte raiz con un
verbo. Sobre doce frases trampa escritas a proposito se colaban **siete**.

Lo que separa al verbo del adjetivo es lo que va delante: una copula o un
adverbio de grado ("es corta", "muy corta"), o el nombre al que califica detras
de su determinante ("una ruta corta"). En "esto **lo** corto" ese "lo" es
pronombre, no articulo, y por eso no cuenta --- contarlo se comia el corte de
verdad. Y "listo" sale del campo entero: como palabra suelta es "preparado",
"espabilado" o el sustantivo "lista", y solo suprime como remate de frase, "y
listo", que es una formula fija y se reconoce como tal.

```
antes:  7 de 12 frases trampa se colaban
ahora:  0 de 12, sin perder ninguno de los 6 cortes de verdad
```

Se filtra al **leer**, no al decidir, para que la confusion no llegue a ninguna
de las senales --- ni a los cortes, ni a los papeles de cada parte, ni al
medidor.


## Una guia de Palworld, y los recuerdos

Todo lo anterior se probaba sobre una **grabacion de pantalla de una
aplicacion**: fondo oscuro y quieto, menu lateral, texto plano, un cursor. Una
captura de gameplay no se parece en nada a eso, asi que `forge/palworld.py`
genera una guia con la forma de una de verdad: la camara no para de moverse, no
hay cursor sino reticula, el texto es un HUD con contorno sobre fondo cambiante,
y el guion sale de **guias publicadas del juego** --- los nombres de los
objetos, los edificios, los materiales, las rutas y los numeros son los del
juego, no inventados. Eso importa porque lo que se mide es si el analisis
reconoce de que se habla, y un vocabulario inventado no prueba nada.

Tres temas (montar la base, las expediciones, capturar), con muletillas, un
aviso, una espera anunciada --- una expedicion tarda media hora y eso en el
video es tiempo muerto --- y un "como vimos antes".

### El estilo `palworld`

Como los videos van a ser de un solo juego, hay un preset con su cara. Y como
los estilos son **datos**, esto es un JSON y no codigo: se copia, se cambian los
colores y ya hay otro.

```
styles/palworld.json
  captions  bold           subtitulos con cuerpo: sobre gameplay el 'clean'
                           de una guia de app se pierde
  labels    #2E6FB7        el azul de la esfera Pal para los rotulos de
                           seccion --- el rectangulo azul que pediste
  grade     warm 0.22      un gameplay ya viene saturado; sube poco
  recall    marco #D2B48C  madera, con el titulillo "ANTES"
  callouts  #FFD700        dorado, con filo oscuro, relleno, esquinas
                           marcadas y etiqueta
```

### La placa: un rotulo con una imagen detras

Un rotulo era una caja de color con texto. Con esto la caja pasa a ser **una
imagen** --- el arte del juego, por ejemplo --- y el texto se pinta encima con la
letra que se quiera. Vale para los cuatro sitios donde hay texto en caja: la
tarjeta de capitulo, los rotulos de seccion, el pie del recuerdo y la etiqueta
del recuadro. **Un solo fondo para todos**, porque que cada rotulo tenga su
propia cara se lee como un error, no como una decision --- igual que pasaba con
los colores.

La letra de una placa es la de un logo: cuerpo grande, **contorno gordo** (17%
del cuerpo), sombra, **espaciada** y en mayusculas. Y `BorderStyle: 1` en vez de
3 --- contorno y sombra, **sin caja** --- porque la caja taparia el arte.

```
styles/palworld.json → plates
  background   palworld-portada.webp
  darken       0.42    un arte de portada tiene mucho color y mucho detalle;
                       encima de eso un texto claro no se lee
  border_color #F6EFE2 marco crema
  outline      0.17    el contorno gordo es lo que le da el peso de logo
  spacing      3.5     un logo va espaciado
  upper        true
```

#### El titulo del juego se quita, no se esquiva

Un arte de portada trae **el titulo del juego pintado en medio**, y ese titulo
es justo lo que no puede salir detras del texto de un rotulo: quedan dos textos
superpuestos y no se lee ninguno. Esconderlo recortando otra franja es un apano
--- se pierde media imagen --- asi que se quita (`render/plates.py`).

No con `inpaint`: relleno sobre una zona grande y un fondo tan detallado deja un
manchurron, medido sobre esta misma portada una banda borrosa de lado a lado. Lo
que funciona es **quitar la franja y coser**: la composicion de un arte de
portada es horizontal --- cielo arriba, personajes y suelo abajo --- asi que
juntar lo de arriba con lo de abajo sigue pareciendo la misma imagen, y un
degradado de veinte filas hace la costura invisible.

```
portada 616x353  ->  franja del titulo: filas 93..218  ->  616x208 sin titulo
```

El titulo se encuentra solo: es lo unico **blanco puro** --- muy claro y sin
nada de color --- de la franja de en medio. El cielo tambien es claro, pero es
azul. Con dos guardas, porque no todo lo blanco es un titulo: sus filas tienen
que ser **el triple de blancas** que una fila cualquiera (si no, una imagen
clara entera se comeria un trozo por nada) y la franja no puede llevarse mas de
la mitad de la imagen. Se cachea por contenido: limpiar cuesta, hacerlo en cada
render no hace falta.

#### Y la letra

`plates.font` nombra la letra de cartel. Se busca primero en `assets/fonts/`
--- que es de donde libass lee al renderizar --- y despues en el sistema; si no
esta en ninguno, se usa la general en vez de dejar que libass caiga en su ultimo
recurso.

Las que trae el proyecto son **OFL y vienen en paquetes de PyPI**, asi que no
hay nada que bajar de ninguna web ni licencia que mirar:

```bash
pip install -e ".[fonts]"
forge fonts              # las copia a assets/fonts/
```

`Fredoka One` es la de los rotulos de `palworld`: redonda y con cuerpo, que es
lo que pide un rotulo sobre gameplay.

Tres cosas mas salieron de mirar el render:

- La **tarjeta de capitulo** seguia pintando su caja negra encima del arte:
  usaba su propio estilo de ASS. Con fondo, usa el de placa.
- El **texto se salia de la placa** por los dos lados. Un titulo de capitulo es
  una frase entera, asi que se parte en las lineas que caben y, si aun asi no
  cabe de alto, se baja el cuerpo de letra.
- Y en esa cuenta **faltaba el espaciado**: con 27 caracteres son 54 px mas, que
  era exactamente lo que se salia.

El fichero va en `assets/plates/` y el estilo lo nombra. Esa carpeta esta en el
`.gitignore`, como las de b-roll, musica y fuentes: el arte de un juego es del
juego y no se sube aqui. Si el fondo falta, el rotulo sale con su caja de color
de siempre y el render no se cae.

### Y el recuadro, con la cara del juego

Un trazo de un color se pierde sobre una imagen que se mueve y esta llena de
colores, que es exactamente lo que es un gameplay. El recuadro pasa a tener
cuatro piezas, y las cuatro salen del JSON del estilo:

| pieza | para que | apagada por defecto |
|---|---|---|
| `fill` | oscurece lo que resalta, como un panel del juego | si (`0.0`) |
| `edge_color` | filo oscuro **por fuera** del trazo, para que se vea igual sobre cielo claro que sobre suelo oscuro | si (vacio) |
| `corner` | esquinas marcadas, dos trazos en L por esquina: es lo que mas cara de interfaz de juego da | si (`0.0`) |
| `label` | el nombre de lo que hay dentro, encima de la caja | si (`false`) |

Todas apagadas de serie, asi que ningun estilo cambia de aspecto sin pedirlo:
`tutorial` sigue siendo un trazo dorado y ya.

Tres detalles salieron de **mirar el fotograma ampliado**, y a tamano real no se
veia ninguno:

- El filo va **por fuera** del trazo. Por dentro tapa justo lo que se quiere
  resaltar.
- Las esquinas tambien van por fuera, envolviendo. Dibujadas encima del trazo
  parecian un **agujero**: un trocito claro justo donde la linea dorada se
  interrumpe, y el recuadro se leia como roto por las cuatro esquinas.
- Y el brazo de la L tiene un minimo relativo al grosor. Una fraccion del lado
  menor sale, en un recuadro bajito, tan corta como el propio trazo --- 8 px de
  brazo con 8 px de grosor --- y las esquinas se ven como cuadraditos sueltos.

La etiqueta va **encima** de la caja, y hay que reservarle su alto de verdad: la
caja de un rotulo la dibuja ASS y se ajusta sola al texto, asi que colocarla con
el hueco del alto nominal la dejaba pisando el recuadro y tapando lo que se
estaba senalando.

El recuadro dice **donde** mirar y la etiqueta dice **que** es: un cuadro dorado
sobre un numero no explica que ese numero son los fragmentos que te faltan.

Los colores salen de las referencias publicadas del juego (azul de esfera,
marron de madera, dorado), no de mi cabeza. El montaje que hay debajo es el de
`tutorial`, que es el que sirve para explicar.

### El recuerdo, que era lo peor del montaje

Un "como vimos antes" se resolvia con `mode="full"` y `rect=(0,0,1,1)`: **el
video se iba entero a otro momento**, sin marco ni marca de ninguna clase. Eso
no se lee como un recuerdo, se lee como un salto de montaje o como un fallo de
reproduccion. Ahora es una **foto enmarcada en cuadrado** abajo a la izquierda,
de tamano medio, con su **pie dentro del marco**. Y no se mueve de ahi: que
salga cada vez en un rincon distinto es justo lo que impide reconocerla de un
vistazo.

La primera version era una ventanita apaisada con una etiqueta flotando encima,
y eso se lee como un trozo de otro video pegado en la esquina. Tres cosas la
convierten en una foto, y las tres son del estilo:

- **`aspect: 1.0`** fuerza la tarjeta cuadrada en vez de heredar la forma del
  material, que en un video es 16:9.
- **`bar`** saca la banda del pie **del propio marco**: se pide la tarjeta del
  alto completo y la imagen se ancla arriba, asi que lo que queda abajo es
  marco. Una foto con su pie, no un recorte con una pegatina.
- Y el marco es de **dos tonos**, un filo oscuro pegado a la imagen y el color
  del estilo por fuera, porque con un solo tono claro, sobre un fondo claro el
  marco desaparece y la tarjeta vuelve a parecer un fallo.

El pie dice **de que** es el recuerdo: `ANTES · Esfera`. "ANTES" a secas cuenta
la mitad --- se ve una foto de hace un rato y no se sabe de que.

La foto es un fotograma **de tu propio video**, del momento que se recuerda. Si
quieres imagenes de fuera (arte del juego, un render), van en `assets/broll/` y
las coge el proveedor local.

Pero al mirarlo de cerca no aparecia **ninguno**, y detras habia tres fallos
encadenados:

**1. Dos listas de palabras vacias.** Hay una buena en `understand/topics.py`
con ciento y pico palabras, y el material de apoyo usaba otra suya de
veintitres. La palabra concreta por la que se busca --- la "cabeza" de la
consulta --- salia de esa lista corta. Medido sobre la guia de Palworld, de
dieciseis momentos con material, **siete** buscaban por una palabra vacia:

```
'como fragmentos'  ·  'aqui base'  ·  'cuesta ojo'  ·  'pals ojo'
'guia nos'  ·  'capturar como'  ·  'aqui esfera'
```

El unico "como vimos antes" del video buscaba material de **"como"**. Ahora hay
una sola lista, la buena.

**2. Los dos relojes, otra vez.** `AssetQuery` llevaba solo `at_timeline`, el
tiempo del **montaje**, y el proveedor lo comparaba contra las palabras del
transcript, las lecturas de pantalla y las senales del habla, que van todas en
tiempo del **original**. En cuanto el montaje recorta un segundo --- y recorta
siempre --- esas comparaciones dan cualquier cosa: el recuerdo caia en el
segundo 125,7 del original y en el 81,1 del montaje, y con 81,1 la ventana de
±3 s no lo alcanzaba ni de lejos. "Vuelves a algo de antes" no se cumplia
**nunca**. Ahora la consulta lleva los dos relojes.

**3. Lo que esta siempre en pantalla no dice cuando.** En un juego la barra de
objetos no se quita nunca, asi que "Esfera de Pal" se ve en el 100% de las
lecturas. Preguntar "¿donde se vio esto?" devolvia un rato cualquiera, y el
recuerdo acababa ensenando la pantalla de espera de una expedicion en vez del
momento en el que se explicaba la esfera. Ahora una palabra que sale en mas del
60% de las lecturas no localiza nada, y se usa el momento en el que la
**dijiste**, que si es un instante concreto.

Con los tres arreglados, sobre la frase *"como vimos antes, las esferas se
fabrican con fragmentos de paldium"*:

```
recuerdo abajo a la izquierda en 87s porque ahi vuelves a algo de antes
  · de tu propio video: vuelves a lo de antes, y de "esfera" hablabas en el 30s
  · ensena el origen 29.0 -> 32.0
  · y ahi se decia: "con el banco desbloqueas la esfera de pal en el menu de tecnologia"
```

Y un recuerdo va **primero** en el reparto: no compite con el material de apoyo
genérico, porque ahi has pedido tu ver algo otra vez. Antes el cupo se lo
llevaban momentos anteriores con mas peso de termino y el unico sitio del video
donde se pedia un recuerdo se quedaba sin nada.

## Montar un video entero, con todos los estilos

Toda la suite en verde y ninguna prueba habia montado un video de punta a punta
con todos los estilos. Al hacerlo salieron tres cosas, y las tres estaban en
sitios donde cada pieza por separado decia que iba bien.

**1. `documentary` reventaba.** Uno de los seis estilos estaba muerto:

```
TypeError: cannot unpack non-iterable CursorSample object
```

`ScreenUse.busy` desempaquetaba el puntero como una tupla y `CursorTrack.at`
devuelve una **muestra**. Lo tapaba la propia prueba: las de colocacion usaban
un puntero de mentira que si devolvia tupla, asi que el de verdad no habia
pasado nunca por ahi. Y el unico camino que lo llama son los rotulos de seccion,
que piden capitulos de 90 segundos y solo salen en formato largo --- justo lo
que ninguna prueba montaba. Ahora las pruebas usan el `CursorTrack` de verdad y
hay un montaje de veinte minutos **con el puntero puesto** para cada estilo.

**2. `cinematic` devolvia el video sin tocar.** Un clip, 241 segundos, cero
cortes, cero subtitulos: el original con un color encima. Su estilo tenia el
umbral de silencio afinado en 1,6 segundos y el interruptor **apagado**, y el
recorte de silencios es lo unico que genera cortes --- mientras su propia banda
pedia de 3 a 11 cortes por minuto. No podia cumplirla nunca. Encendido el
interruptor, con el umbral que ya tenia puesto:

```
antes:  1 clip    0.00 cortes/min   0% recortado
ahora: 15 clips   3.94 cortes/min  12% recortado
```

**3. Y el medidor decia "en el punto" de los seis**, incluido el que no habia
cortado nada. La nota es una media ponderada y **la media tapa un cero**: el
hueco de los cortes lo compensaba la densidad de efectos, que si estaba dentro
de banda. Ahora una metrica que vota y se queda por debajo de su banda es una
**carencia**, y una carencia manda sobre la media: el medidor existe para avisar
de lo que falta y de lo que sobra, y avisar solo de lo que sobra es media faena.

De paso, un estilo ya no paga por apagar una herramienta. A `cinematic`, que no
quiere subtitulos, se le puntuaba la velocidad de lectura: 0 palabras por minuto
contra una banda de [70, 180], hundiendole la nota por obedecer a su propio
estilo.

### Como queda cada estilo sobre la misma guia

Cuatro minutos de guia hablada, el mismo analisis para los seis:

| estilo | cortes/min | su banda | recorte | clips | efectos | veredicto |
|---|---|---|---|---|---|---|
| cinematic | 3.94 | 3 – 11 | 12% | 15 | 12 | en el punto |
| clean-corporate | 5.80 | 3 – 14 | 14% | 21 | 79 | en el punto |
| tutorial | 5.53 | 3 – 24 | 14% | 20 | 95 | en el punto |
| documentary | 8.40 | 4 – 15 | 14% | 30 | 96 | falta material de apoyo |
| vlog | 5.85 | 8 – 30 | 15% | 21 | 138 | falta ritmo |
| gaming-hype | 6.46 | 18 – 48 | 15% | 23 | 216 | falta ritmo y material |

Las dos ultimas filas **no son un fallo, son el medidor haciendo su trabajo**.
`gaming-hype` pide de 18 a 48 cortes por minuto y `vlog` de 8 a 30, y sobre una
guia hablada el unico sitio donde se puede cortar son las pausas: dan 6,5 y 5,8.
Eso significa que ese estilo no le va a este material, y antes el medidor se lo
callaba. Lo mismo con el material de apoyo: `documentary` quiere entre un 15% y
un 45% de metraje con overlay y aqui no hay banco de b-roll instalado.

### El fichero que traes tu

El contenido no es lo que rompe un pipeline de video: es el **envoltorio**. Una
captura de juego llega a 1440p o 4K, a 60 fps, en HEVC, de veinte minutos y a
veces con dos pistas de audio. Generados esos ficheros de verdad y pasado el
pipeline entero por ellos:

| fichero | analisis | render | sale |
|---|---|---|---|
| 1080p60 h264 | 28s | 49s | 1920x1080 |
| 1440p60 h264 | 32s | 86s | 2560x1440 |
| 4K30 h264 | 25s | 55s | 3840x2160 |
| 4K60 HEVC | 44s | 128s | 3840x2160 (sale en h264) |
| 1080p60, dos pistas | 21s | 33s | 1920x1080 |
| 1080p con fps variable | 19s | 33s | 1920x1080 |

Los seis pasan. La resolucion se respeta siempre; el codec de salida es h264
aunque entres en HEVC. Los tiempos son de **CPU sin GPU** y sobre 20-30 segundos
de video: con NVENC el render baja muchisimo, y el analisis escala con la
duracion (una guia de veinte minutos son decenas de minutos de analisis en CPU).

#### Y una pista de audio que se pierde sin avisar

Aqui salio el fallo mas serio para una captura de juego. Si grabas con OBS, lo
normal es que el juego vaya en una pista y el microfono en otra. **Todo el
pipeline usa una sola** --- la primera que elige ffmpeg --- y la otra se pierde.
Medido sobre un fichero con el juego delante y la voz detras:

```
silencios encontrados: []      <- el juego suena todo el rato
recorte: 0%
la voz no llega ni al analisis ni al video exportado
avisos: ninguno
```

Sin un solo error. El montaje salia "bien" y sin voz. Ahora **avisa**, diciendo
cuantas pistas hay y cual se esta usando; mezclarlas de verdad --- eligiendo la
de voz por como suena y agachando el juego por debajo --- esta en `PENDIENTE.md`
con el plan escrito.

### Lo que sale fuera del objetivo de sonoridad, y por que

Los seis montajes salen a **-17 LUFS** con el pico en -1,5 dBTP, y el objetivo
es -14. No es un fallo: es la decision que esta escrita en `_plan_master`. La
guia de origen esta a -27,6 LUFS con picos a -3,0, asi que llegar a -14 pide
+13,6 dB y eso deja el pico 10 dB por encima del techo. El master busca la
ganancia mas alta cuya perdida en el limitador no pase de 1 dB, encuentra +9,5 y
se queda ahi antes que aplastar la voz para cuadrar un numero. Y lo dice:
`measured_lufs` sale en el resultado del render.

Si tu grabacion tiene la voz mas comprimida de origen, llegara mas cerca.

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
