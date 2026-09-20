# ¿Hace falta un modelo local para decidir?

Pregunta tuya, y merece una respuesta con números y no con opinión.

## Lo que hay hoy: no son palabras específicas, pero tampoco entiende

Hay dos capas, y conviene no confundirlas.

### 1. De qué va un tramo — **estadística, no palabras clave**

No hay ninguna lista de "si dice expediciones, pon expediciones". Lo que hay es
una cuenta: **qué palabras usa este tramo que no usan los demás**. Eso separa
los temas (la idea de TextTiling, de 1997) y además da el nombre de cada uno.

Es honesto decir qué sabe hacer y qué no: **cuenta, no entiende**. Y contar
tiene un sesgo concreto, que es justo el que te molestó. Medido sobre la sección
de expediciones de la guía:

```
raíz          aquí   en las otras   puntos
tard             7             0     7.00     <- se repite, pero no es el tema
rut              6             0     6.00
expedicion       2             0     2.00     <- es el tema
```

El nombre de una sección **se dice una vez, al anunciarla** —*"vamos con la
estación de expediciones"*— y lo que se repite después son sus piezas: rutas,
minutos, escuadrones. Contar premia lo repetido, así que el cartel salía
"Rutas".

Eso ya está arreglado, y sin modelo: lo que se dice en la **primera frase** del
tramo pesa el triple (`OPENING_BOOST`). El cartel pasa a "Estación".

```
antes    "Rutas tarda afinidad"   ->  cartel "Rutas"
ahora    "Estacion rutas tarda"   ->  cartel "Estacion"
```

**Y ahí se acaba lo que da de sí la estadística.** Tú dirías "Expediciones" y la
cuenta dice "Estación", porque las dos palabras están en la misma frase, las dos
se dicen dos veces y las dos son exclusivas de esa sección. No hay nada que
contar que las separe: *saber cuál de las dos es el nombre de la cosa* es
justamente entender la frase.

### 2. Qué le pides al montaje — **formulario + campos de significado**

Esto sí empezó siendo frases hechas, y se midió lo mal que iba. Con tres
conjuntos de frases escritas a ciegas, sin mirar los patrones:

```
                  solo frases hechas
conjunto A  (38)        37%
conjunto B  (29)        38%
conjunto C  (29)        14%
```

De cada tres cosas que dirías, dos no las veía. La segunda capa
(`understand/meaning.py`) cambia la pregunta: en vez de "¿encaja con alguna
fórmula?", pregunta "¿de qué habla y cómo lo dice?" —diez campos de significado
con 205 raíces, 37 construcciones gramaticales— y sube al 100%, 100% y 86%.

Sigue sin entender. No capta la ironía, no sabe de qué va tu guía y no inventa
nada. Pero deja de exigirte decir las cosas de una manera concreta, que era la
queja de verdad.

## Entonces, ¿modelo local?

**Sí, y tienes razón en dónde.** Pero no para todo, y esa distinción es lo que
decide si el proyecto mejora o empeora.

### Dónde un modelo gana de calle

Decisiones de **juicio sobre lenguaje**, cortas, donde no hay nada que contar:

- **Nombrar una sección.** "Estación" vs "Expediciones" es exactamente lo que un
  modelo resuelve y una cuenta no.
- **Escribir el pie de un recuerdo** con las palabras del vídeo.
- **Decidir si una frase pide de verdad un corte** cuando las guardas
  gramaticales no llegan (el caso de "la contraseña es corta").
- **Agrupar temas** que se llaman distinto y son el mismo.

Son pocas llamadas y muy cortas: una guía de 20 minutos tiene ~10 secciones. En
tu 5060 Ti, con un modelo de 7-8B en local, son segundos.

### Dónde sería un error

Todo lo que hoy se **mide**: dónde está el silencio, dónde cambia el plano, qué
zona de la pantalla cambió, cuánto dura un clip, si el máster llega a -14 LUFS.
Un modelo ahí es más lento, no determinista y no mejora nada: esas cosas tienen
una respuesta correcta y se calcula.

### Las tres condiciones que le pondría

1. **Que no pueda inventar.** El nombre de una sección tiene que salir de las
   palabras que dijiste en ella; si el modelo devuelve otra cosa, se descarta y
   manda la cuenta. Un cartel con una palabra que no dijiste es peor que uno
   flojo.
2. **Que se pueda apagar.** Sin modelo instalado, todo tiene que seguir
   funcionando exactamente como ahora. Es la misma regla que ya cumplen el OCR y
   la transcripción.
3. **Que se mida.** Un conjunto de secciones con su nombre apuntado a mano, y el
   porcentaje de aciertos del modelo contra el de la cuenta. Sin ese número no
   se sabe si mejora, y este proyecto no mete nada que no se pueda medir.

### Lo que no puedo hacer desde aquí

Descargar los pesos. El proxy de este entorno bloquea Hugging Face (403 en el
CONNECT) y no hay forma de traer un modelo, así que **puedo construir la
integración pero no puedo medirla**. Y meter una pieza sin medirla es
exactamente lo que este proyecto lleva evitando desde el principio.

Lo honesto es: la escribo con su interfaz, su prueba con un modelo de mentira y
su apagado por defecto, y **el número lo sacas tú** en tu máquina con
`forge eval-nombres`. Si el modelo no gana a la cuenta, se queda apagado y no
hemos perdido nada.

---

## Hecho

Las tres condiciones están cumplidas y la pieza está en el árbol:

| Condición | Dónde |
|---|---|
| No puede inventar | `clean_answer()` comprueba la respuesta contra el texto de la sección |
| Se puede apagar | `FORGE_MODEL_ENDPOINT` vacío por defecto; sin él nada llama a nada |
| Se mide | `forge eval-nombres ../eval/nombres-palworld.json` (desde `backend/`) |

La cuenta, medida sobre las tres secciones de la guía: **2/3 (67 %)**, y falla
exactamente en "expediciones", que es el caso que motivó todo esto. Ese es el
número que el modelo tiene que batir en tu máquina.

Las pruebas (`tests/test_modelo_local.py`, 19) levantan un Ollama de mentira con
`http.server` y verifican el camino entero —incluido el filtro, pieza a pieza—
sin descargar ningún peso. Leen la sección **del mismo fichero** que usa
`forge eval-nombres`, para que lo que falle aquí sea lo que falla ahí.

Lo que explica cómo funciona está en el README, en *"Donde contar se acaba"*.
