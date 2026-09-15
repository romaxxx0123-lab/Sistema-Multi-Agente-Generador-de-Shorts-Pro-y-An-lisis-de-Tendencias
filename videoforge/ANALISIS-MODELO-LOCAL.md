# Un modelo local que busque el material y lo ponga según lo que digo

Sugerencia recibida, por segunda vez y más concreta: **un modelo local que
busque el material y lo coloque según lo que digo**. No se adopta sin
analizarla. La vez anterior contesté que los pesos no se podían traer; eso era
una suposición sobre el entorno, así que esta vez lo he **comprobado**, he
instalado el único modelo que sí se puede traer, y lo he medido en el trabajo
concreto de este proyecto.

El resultado tiene dos mitades, y son opuestas:

- **Buscar el material con un modelo: no.** Y ahora con números, no con una
  excusa de red.
- **Colocarlo según lo que digo: sí, y el modelo nunca fue el problema.** El
  dato que hacía falta ya lo calcula el sistema y nadie lo estaba mirando.

---

## Parte 1 — ¿Se puede tener un modelo local aquí?

Lo primero era dejar de suponer. La política de red de este entorno, consultada
directamente:

| destino | resultado |
|---|---|
| `pypi.org` / `files.pythonhosted.org` | **200**, y además fuera del proxy (`noProxy`) |
| `huggingface.co` | **403** en el CONNECT (política; no se rodea) |
| `github.com` (descarga directa) | restringido |

O sea: **PyPI es el único canal abierto**. La pregunta correcta no era "¿hay
pesos?" sino "¿hay un modelo cuyos pesos viajen dentro de un paquete de PyPI?".
Los hay. Probados:

| paquete | qué trae | sirve |
|---|---|---|
| `model2vec` | 60 KB: sólo código, los pesos los baja de HuggingFace | no |
| `es-core-news-sm` 3.1.0 | 13,7 MB de modelo real de spaCy | **no**: exige `spacy<3.2`, que exige `pydantic<1.9`, y el EDL entero es pydantic v2. Instalarlo rompe el proyecto |
| `wordllama` 0.4.0 | **19 MB, con los pesos dentro del wheel** (`weights/l2_supercat_256.safetensors`, 16 MB) | se puede tener → se mide abajo |

Así que sí: hay un modelo local, gratis, de CPU, que se instala sin tocar
HuggingFace. Lo instalé y lo hice funcionar del todo sin red (tiene un fallo de
empaquetado: busca el tokenizador en `tokenizer/` y lo distribuye en
`tokenizers/`, así que sin arreglarlo intenta bajarlo de HuggingFace igualmente).

## Parte 2 — ¿Sirve para esto? Medido

Lo que este proyecto necesita de un modelo de búsqueda es: dada una frase tuya,
decir qué material encaja. Se lo pregunté con un juego de casos donde ya sé la
respuesta correcta.

**Equivalentes es↔en** (tendrían que puntuar alto — es justo el puente que le
falta al camino del stock):

| par | parecido |
|---|---|
| impresora / printer | **−0.066** |
| teclado / keyboard | +0.031 |
| carpeta / folder | +0.019 |
| contraseña / password | +0.037 |
| herramienta / tool | −0.031 |

**Trampas** (tendrían que puntuar bajo — son el fallo que me pediste arreglar):

| par | parecido |
|---|---|
| base de palworld / base de minecraft | **+0.540** |
| chrome / firefox | +0.369 |
| palworld / minecraft | +0.126 |

Las trampas puntúan **de cinco a ocho veces más alto que los aciertos**. Con
este modelo ordenando, una foto de Minecraft entra antes que la de Palworld:
sería exactamente el fallo del que partimos, pero automatizado.

Y una prueba de ranking, que es como se usaría de verdad. Seis candidatos, uno
correcto:

| consulta | dónde queda el correcto |
|---|---|
| "aquí abro los ajustes de la impresora para desatascar el papel" | **4º de 6** — por debajo de *cat animal pet* |
| "the printer jammed so i open the settings to fix the paper" | **1º de 6** (+0.854) |
| "impresora" | 3º, con parecido **negativo**; gana *beach sea sand* |
| "printer" | **1º de 6** (+0.803) |

El modelo no está roto: **en inglés es excelente**. Lo que pasa es que tú hablas
español, y lo que haría de puente — un traductor — es precisamente lo que no se
puede traer. Pedirle en español que elija material es pedirle que ponga una
playa donde dijiste impresora.

### La conclusión que importa, que no es la de la red

Aunque mañana hubiera pesos para todo, hay una razón de fondo para no poner un
modelo de parecido a decidir **si** un material vale: *parecido* y *es esto* son
preguntas distintas. Palworld y Minecraft **se parecen** — son dos juegos de
construir bases, y el modelo lo dice con un 0.540 bien merecido. La regla que
tiene hoy el proyecto no es una aproximación pobre del parecido semántico: es
otra pregunta, más estricta, y es la correcta aquí. Un modelo podría, como mucho,
**ordenar** los que ya pasaron la regla. Eso no vale 163 MB de dependencia ni
depender de un fallo de empaquetado ajeno.

**Veredicto: no se adopta.** El sitio sigue hecho (`Translator`, `Inspection`),
y el día que haya un traductor local verificable, el camino del stock mejora de
golpe: ya se vio que con la palabra en inglés el modelo acierta a la primera.

---

## Parte 3 — "y la ponga según lo que digo"

Aquí el modelo nunca fue el cuello de botella. Leyendo cómo se coloca hoy el
material salen tres fallos, y los tres son de no mirar datos que el sistema **ya
tiene**.

### Fallo 1 — se coloca al principio de la ventana, no cuando dices la palabra

`find_topic_moments` agrupa el habla en ventanas de hasta **6 segundos** y saca
de cada una las dos palabras más distintivas. Después `plan_broll` coloca el
material en `momento.start`, que es **donde empieza la ventana**, no donde dices
la palabra.

Medido sobre la guía sintética de 5 minutos (31 momentos):

| | distancia del material a la palabra |
|---|---|
| mediana | **2.21 s** |
| media | 2.23 s |
| peor caso | 5.60 s |
| a más de 2 s | **16 de 31** |

Dicho en claro: en la mitad de los casos la imagen aparece **más de dos segundos
antes o después** de que nombres lo que ilustra. Estás hablando todavía de otra
cosa y ya ha entrado la imagen de la siguiente. Eso es literalmente "no la pone
según lo que digo", y no hace falta ningún modelo para arreglarlo: la
transcripción trae el instante exacto de cada palabra.

### Fallo 2 — la ventanita siempre va arriba a la derecha

`pip_rect` es fijo: `PIP_TOP = 0.07`, `PIP_RIGHT = 0.95`. Siempre esa esquina,
pase lo que pase debajo. Si lo que estás explicando está arriba a la derecha
--- y el sistema **sabe dónde está**, porque `cues` trae la caja del texto que
nombras y `cursor` dónde tienes el puntero --- la ventanita se planta encima de
justo eso.

### Fallo 3 — tapa la pantalla entera mientras señalas algo

Un b-roll a pantalla completa mientras dices "mira este botón" tapa el botón.
Hoy eso se resuelve tirando el material entero (`conflicts.py`: un recuadro gana
a un b-roll a pantalla completa). Tirarlo es mejor que taparlo, pero hay una
opción mejor que las dos: **no taparlo**, pasándolo a ventanita colocada donde
no estorbe.

---

## Lo que se hace

1. El material entra **cuando dices la palabra**, ajustado a la pausa más cercana
   para no cortar a media palabra.
2. La ventanita elige esquina: se queda en la de siempre salvo que ahí tape lo
   que estás señalando, nombrando o donde tienes el puntero; los subtítulos
   también cuentan como ocupado.
3. Si señalas algo mientras entra material, el material va a ventanita en vez de
   a pantalla completa --- y así deja de perderse por la regla de conflictos.

---

## Resultado

**Cuándo entra el material**, sobre los mismos 31 momentos de la guía sintética
(la comparación se hace con el ajuste a pausa aplicado a las dos, que es lo que
hace el planner de verdad):

| | antes | ahora |
|---|---|---|
| mediana | 1.78 s | **0.29 s** |
| media | 2.50 s | **0.32 s** |
| peor caso | 6.60 s | **1.09 s** |
| a más de 1 s de la palabra | 21 de 31 | **2 de 31** |
| a más de 2 s | 15 de 31 | **0 de 31** |

En 5 de los 31 la palabra ya era la primera de la ventana, así que ahí no había
nada que corregir; el resto se movió.

**Dónde va la ventanita**: se queda arriba a la derecha salvo que ahí tape lo
que señalas, lo que nombras (la caja que leyó el OCR), donde tienes el puntero o
la banda de subtítulos. Si todo estorba, se queda donde estaba en vez de bailar.

**Si señalas mientras entra material**: pasa a ventanita apartada en vez de
taparte la pantalla — y así deja de perderse por la regla de conflictos, que
tiraba entero cualquier b-roll a pantalla completa que pisara un recuadro.

Y el montaje lo cuenta, como todo lo demás: *"material de apoyo en 62s porque
ahí hablas de 'router wifi' (en ventanita: no te tapo lo que señalas) · movido
arriba a la izquierda para no taparlo"*.

### Lo que no se hizo, y por qué

No hay modelo. No por no haberlo buscado: se instaló el único que se puede tener
aquí, se le quitó el fallo de empaquetado que le impedía arrancar sin red, y se
midió. En español pone una playa donde dijiste impresora, y da 0.540 de parecido
entre una base de Palworld y una de Minecraft, que es exactamente el fallo del
que partimos. Cuando haya un traductor local verificable, el sitio está hecho.


---

## Segunda vuelta

Repasando lo entregado aparecieron tres cosas, dos de ellas fallos de lo que
acababa de escribir:

**1. Los subtítulos no siempre están abajo.** `ScreenUse` daba por hecho que sí
y reservaba la banda inferior. Pero `captions.py` los sube cuando el foco del
plano está en la parte baja, y en esos planos pasaban las dos cosas a la vez: la
ventanita se apartaba de una zona libre y se plantaba encima de los subtítulos
de verdad. Ahora se le pasan los subtítulos **ya planificados**, con su posición
real (van antes que el b-roll en el planner, así que están disponibles).

**2. Entrar en la palabra costaba inserciones.** Medido: la palabra suele caer
tarde en la ventana, así que el hueco hasta el final se queda corto --- 2 de 31
momentos por debajo del mínimo útil, y la duración media de 3.00 s a 2.60 s. La
causa era arbitraria: el final de una ventana es un corte de la segmentación, no
el final del tema. Ahora el material sigue mientras sigas nombrando lo mismo, y
se va en cuanto nombras otra cosa. Recupera 1 de los 2 y la media sube a 2.85 s;
el que queda se pierde **a propósito**, porque justo ahí ya estás nombrando otra
cosa y el material sobraba.

Y una lección de esa regla: en una guía real se nombra algo nuevo cada pocos
segundos, así que el límite que manda casi siempre es "nombras otra cosa", no
"el tema sigue". Ilustrar lo anterior mientras nombras lo nuevo es el mismo
fallo de coherencia de siempre, sólo que en el eje del tiempo.

**3. La ventanita no sabía dónde hay hueco.** Evitaba lo que señalas, pero entre
las esquinas libres elegía siempre la misma. El análisis de foco ya calculaba un
mapa por plano y se quedaba sólo con el centroide; ahora guarda además una
rejilla de tercios con **cuánto hay** en cada zona (medida con detalle fino, no
con saliencia: un área de texto uniforme no destaca y sin embargo está llena).
Comprobado sobre vídeo real: con el contenido en el tercio izquierdo, las celdas
de la izquierda dan más de 0.3 y las de la derecha menos de 0.05.
