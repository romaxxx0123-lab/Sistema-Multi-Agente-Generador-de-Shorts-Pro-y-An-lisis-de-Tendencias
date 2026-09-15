# Que integrar, y que no

La sugerencia era "un modelo local gratis". Antes de elegir, el analisis: que
candidatos hay, que aporta cada uno **al caso de uso real** (guias de veinte
minutos, grabacion de pantalla con voz), que cuesta, y -- esto es lo que mas
peso tiene aqui -- **si se puede comprobar que funciona**.

Ese ultimo criterio no es burocracia. Este proyecto lleva cuatro funciones
descubiertas a medias en dos auditorias (los recuadros, los capitulos, los
efectos de sonido, la musica y la descarga de material). Todas tenian codigo
escrito y ninguna pasaba por el video. Añadir algo que no se puede medir es la
forma mas fiable de fabricar la sexta.

En este entorno de desarrollo **Hugging Face esta bloqueado por politica de
red** (403 en el CONNECT). Se respeta, no se rodea. Asi que cualquier
integracion que necesite bajar pesos se puede escribir pero **no se puede
verificar aqui**, y eso cambia la nota.

---

## Lo que ya hay, para no proponer lo que existe

| pieza | estado |
|---|---|
| transcripcion con tiempos por palabra | faster-whisper (CTranslate2), funcionando |
| texto en pantalla y **donde** | Tesseract, funcionando, y ya atado a lo que se dice |
| raices de palabra en castellano | Snowball, funcionando |
| significado por campos y construcciones | propio, sin modelo, 86-100% segun el conjunto |
| donde mirar | **saliencia por residuo espectral** (sin modelo) |
| clasificacion de escena tipo CLIP | `analysis/vision.py` **escrito y sin modelo**: carga ONNX si encuentra los ficheros, y no hay ni comando para traerlos ni documentacion de donde ponerlos. En la practica, apagado. |
| confianza por palabra | **se guarda y no se usa para nada** |
| caras | no hay |
| cursor del raton | no hay (y el plan lo daba por hecho) |

---

## Los candidatos

### 1. Cursor del raton · RECOMENDADO

En una grabacion de pantalla, **el cursor es la mirada**. Quien graba lo lleva a
lo que esta explicando antes de nombrarlo, y lo deja quieto mientras habla de
eso. Ninguna otra senal dice eso: la saliencia por residuo espectral mide
contraste, y en una interfaz hay contraste en todas partes por igual.

- **Aporta**: el zoom apunta a donde de verdad se esta trabajando; los
  recuadros y las ventanitas no se ponen encima; y da un ancla temporal para
  saber **cuando** empieza una accion.
- **Cuesta**: nada que bajar. Es diferencia entre fotogramas con un filtro de
  tamano: el puntero es un objeto pequeno, de contorno duro y el unico que se
  mueve solo en una pantalla quieta. OpenCV ya esta.
- **Se comprueba**: si. Se puede generar con ffmpeg una pantalla estatica con
  un puntero que recorre una trayectoria conocida y medir el error en pixeles.
- **Riesgo**: bajo. Sobre video con mucho movimiento (un juego) no encuentra
  nada, y no encontrar nada es el comportamiento correcto.

### 2. Confianza de la transcripcion · RECOMENDADO

`Word.probability` ya viene de Whisper para cada palabra, se copia a los
subtitulos y **no decide nada**. Es informacion gratis que esta ahi tirada.

- **Aporta**: no señalar con un recuadro una palabra que Whisper no entendio
  (un recuadro sobre una palabra mal oida es el error mas verguenza que puede
  cometer un montaje automatico); no titular un capitulo con ella; no sacar de
  ella una decision de edicion. En material real -- acento, ruido, terminos en
  ingles -- hay bastantes palabras por debajo de 0,5.
- **Cuesta**: casi nada, un umbral y cuatro comprobaciones.
- **Se comprueba**: si, con transcripciones sinteticas con confianzas dadas.
- **Riesgo**: ninguno.

### 3. Caras con el clasificador que ya trae OpenCV · ~~RECOMENDADO~~ COMPROBADO Y NO

El plan original prometia que "los subtitulos nunca tapan una cara". No hay
deteccion de caras en el proyecto.

- **Aporta**: en una guia con camara en una esquina (muy comun), los
  subtitulos, la ventanita de material y los recuadros dejan de taparla.
- **Cuesta**: aqui daba por hecho que OpenCV distribuye los cascades Haar
  dentro del paquete (`cv2.data.haarcascades`). **Comprobado despues: en esta
  instalacion ese directorio esta vacio** -- solo trae `__init__.py` --, asi
  que no hay ningun clasificador que usar y habria que bajarlo, que es justo lo
  que esta descartado. La recomendacion queda anulada; se deja escrita con el
  motivo para que nadie la vuelva a dar por buena sin mirar.
- **Se comprueba**: no, en este entorno.
- **Riesgo**: irrelevante mientras no haya clasificador.

### 4. Embeddings de frase locales · SI, PERO NO AHORA

Es la sugerencia, y es la que tiene **el techo mas alto**: compara por
significado y quitaria de en medio las listas de campos y construcciones
escritas a mano, que es la queja de fondo ("¿tengo que decir eso?").
Modelo candidato: `paraphrase-multilingual-MiniLM-L12-v2` en ONNX cuantizado
(~120 MB), con el tokenizador de la libreria `tokenizers`, que ya esta
instalada.

- **Aporta**: cobertura sin lista. El conjunto C a ciegas se quedo en 86%, y lo
  que falta son parafrasis que ninguna lista va a cubrir.
- **Cuesta**: 120 MB, ~30 ms por frase en CPU (nada en la GPU del usuario), y
  un umbral que hay que **calibrar contra las trampas**: un comparador por
  significado dice que "esto tarda" y "esto es rapido" se parecen mucho, porque
  hablan de lo mismo. Sin calibrar, se llevaria por delante las 62 trampas que
  hoy estan a cero.
- **Se comprueba**: **no aqui**. Y sin poder medirlo, lo unico honesto que se
  puede escribir es el cargador y el hueco, que es exactamente lo que ya pasa
  con `vision.py`: codigo que no ha pasado un video en su vida.
- **Decision**: se deja preparado el sitio y se hace **cuando se pueda medir**,
  en la maquina del usuario, con los conjuntos A/B/C y las trampas delante. Lo
  que si se puede hacer ya, y es el 80% del valor con el 5% del riesgo: que el
  fichero `frases.json` acepte tambien **frases de ejemplo por intencion** para
  que, cuando llegue el modelo, ya haya con que comparar.

### 5. Silero VAD (deteccion de voz) · NO, DE MOMENTO

Suena bien: 1,8 MB, ONNX, y sustituiria el umbral de nivel con el que se
detectan los silencios, que es **la funcion de mas impacto de todo el
proyecto** (el 32% del recorte).

Pero el umbral no esta solo: antes de recortar se **restan los intervalos de
las palabras transcritas**, asi que una palabra dicha en voz baja ya esta
protegida por el transcript. Lo que un VAD arreglaria -- confundir voz floja
con silencio -- es justo lo que esa red ya cubre. Aportaria en material **sin
transcripcion**, que no es el caso de uso. Coste de bajar pesos, ganancia
pequena: no.

### 6. Reencuadre 9:16 siguiendo la accion · CANDIDATO REAL, OTRA FUNCION

Sacar verticales de la guia larga. Es valioso (y el repositorio se llama
"Generador de Shorts"), no necesita ningun modelo -- con el cursor y la
saliencia hay de sobra para decidir el encuadre -- y se puede medir. Pero no es
"mejorar como funciona": es **una funcion nueva** con su propio tamano. Va a la
lista, no a este turno.

### 7. OCR mejor (PaddleOCR / EasyOCR) · NO

Cientos de MB, dependencias pesadas, y Tesseract con `--psm 11` ya lee menus y
botones, que es lo que hace falta. El cuello de botella del OCR no es la
precision del lector: era **donde se leia**, y eso ya se arreglo leyendo donde
se habla de la pantalla.

### 8. Diarizacion / separacion de hablantes · NO

Una guia la graba una persona. Cero valor aqui.

### 9. Nivelado de volumen por clip · NO

Tentador porque el audio es un tema recurrente, pero el master ya mide y
normaliza el conjunto, y la voz pasa por compresor. Nivelar clip a clip en un
montaje de 272 clips de la **misma** grabacion es meter bombeo donde no habia
problema. Solo tendria sentido con material de varias sesiones, y entonces lo
correcto es nivelar por **sesion**, no por clip.

---

## Decision

Se hacen 1, 2 y 3: las tres son gratis, locales, **verificables aqui** y las
tres apuntan al mismo sitio -- saber mejor **donde mirar y de que fiarse** --
que es de lo que vive el resto del montaje.

La 4 es la que mas techo tiene y la unica que no se puede medir en este
entorno; se prepara el terreno y se hace con el modelo delante.

---

## Hecho: 1, el cursor

`analysis/cursor.py`, una etapa mas del analisis (cacheada como las demas,
cuesta menos que la del movimiento). Medido sobre una grabacion de pantalla
sintetica con **trayectoria conocida**:

```
lo encuentra en el 98% de las muestras
error mediano  24 px   en 1280 de ancho (1,9%)
el peor        34 px
donde se para  2 px del sitio real
```

Lo que costo acertar no fue encontrar el puntero, fue saber **cual de las
manchas es**. Tres intentos, cada uno con su medida:

| intento | resultado |
|---|---|
| restar fotogramas consecutivos | **cero** detecciones: un puntero que se mueve deja *dos* manchas -- de donde se fue y a donde llego -- y desde esa resta no hay forma de saber cual es cual |
| comparar contra un fondo aprendido, sin actualizarlo donde hay mancha | **cero**: el puntero del primer fotograma se queda en el fondo para siempre y fabrica un fantasma permanente |
| comparar contra el fondo y quedarse con lo que **se alejo** de el | 98% |

El tercero es el bueno y la razon es simple: el sitio del que se fue **se
acerco** al fondo (volvio a ser la interfaz de siempre) y el sitio al que llego
se alejo. Sin saber si el puntero es claro u oscuro, ni de que color es la
interfaz.

Donde cambia el montaje: cuando senalas algo y no se puede leer que es ("mira
esto de aqui"), antes no habia **nada** donde apuntar y el zoom no se colocaba;
ahora apunta al puntero. Y si dices una zona que contradice al puntero, gana lo
que dijiste -- la misma regla que con el OCR.

Un detalle que salio de paso: el video de prueba tenia el puntero **congelado**
en el primer intento, porque se animaba con `drawbox`, que evalua sus
parametros una sola vez. Es el mismo detalle que ya estaba documentado para los
recuadros, y volvio a morder. Se anima con `overlay`, que si evalua por
fotograma.

### Pendiente de esta misma linea

El zoom que sale de la **saliencia** (no de lo que se dice) sigue apuntando al
centroide del mapa de contraste. Teniendo el puntero, lo natural es que, cuando
esta parado en ese tramo, mande el puntero. Se deja para el siguiente paso
porque cambia el encuadre de zooms que hoy nadie ha pedido, y eso hay que
medirlo aparte.
