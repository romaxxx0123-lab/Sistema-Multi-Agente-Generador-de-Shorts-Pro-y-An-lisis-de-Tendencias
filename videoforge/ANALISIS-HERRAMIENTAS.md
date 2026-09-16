# Qué más puede dibujar el montaje, y qué no

El rótulo de sección abrió la puerta: una caja con texto colocada donde no
estorbe. La pregunta ahora es qué más merece existir. Lo que sigue son las
candidatas que he considerado, cada una medida contra lo que el análisis sabe
de verdad, y con su veredicto — incluidas las que **no** hay que hacer, que son
la mayoría.

El criterio es el mismo de siempre: **una herramienta tiene que explicar algo
que sin ella no se entiende**. Si sólo decora, sobra.

---

## 1. Marcador de velocidad ("×8") · SE HACE

El montaje ya acelera las esperas que tú mismo anuncias: dices *"esto tarda un
rato"* y en vez de cortar el minuto de instalación lo pasa a 8x, para que se vea
la barra avanzar. Es una buena decisión, y está tomada desde hace tiempo.

**Y no lo dice en ninguna parte.** Comprobado sobre una guía con una espera
anunciada:

```
senales de espera: [(16, 'tarda')]
clips acelerados:  [(18, 22, 8.0)]
efectos que lo digan: []
```

O sea: el vídeo se pone de pronto a ocho veces la velocidad, sin avisar. Eso no
se lee como una decisión de montaje, se lee como un fallo de reproducción — y
quien mire va a pensar que su reproductor hace cosas raras.

- **Qué necesita**: nada nuevo. `Clip.speed` ya está en el montaje.
- **Cuándo sale**: exactamente mientras dura el tramo acelerado, que por
  construcción es raro (sólo cuando anuncias una espera).
- **Riesgo de sobreedición**: ninguno. No aparece nunca "porque tocaba":
  aparece donde el montaje hizo algo que hay que explicar.

Es la más clara de todas, y por un motivo que conviene subrayar: **no añade
información, explica una que ya estaba faltando**.

## 2. Distintivo de aviso · NO TODAVÍA, Y CON EL NÚMERO QUE LO PARA

La idea es buena sobre el papel: el propio proyecto dice que un aviso ("ojo, si
no haces esto no funciona") es *el momento que la gente viene a buscar*, y hoy
eso sólo sirve para recortar menos. Marcarlo en pantalla parece el siguiente
paso natural.

Medido antes de escribirlo, sobre la guía de 20 minutos:

| papel | tramos |
|---|---|
| cuerpo | 72 |
| paso | 57 |
| **aviso** | **52** |
| intro | 3 |

**El 28% del vídeo está marcado como aviso.** Un distintivo en cada uno son
cincuenta y dos cajas en catorce minutos: exactamente la sobreedición que
llevamos tres rondas quitando.

No es que la idea sea mala, es que le falta la mitad: antes de dibujar nada hay
que decidir **cuál de los cincuenta y dos es el aviso de verdad**. Con la
puntuación de la señal, con la posición en el capítulo, con si se repite. Eso es
otro trabajo, y hacerlo mal deja el vídeo peor que no hacerlo.

## 3. Contador de pasos ("Paso 3 de 7") · NO, POR LA MISMA RAZÓN

En una guía larga orienta mucho. Pero el análisis marca **57 tramos como
"paso"** en catorce minutos: uno cada quince segundos. Eso no son siete pasos,
son cincuenta y siete frases con forma de paso. Un contador que dijera "Paso 34
de 57" sería ruido con aspecto de dato.

Para que exista primero hay que agrupar los tramos en pasos de verdad — que es
casi lo mismo que hacen los capítulos. Si algún día los capítulos se numeran,
el contador sale gratis; hoy no.

## 4. Congelar y explicar · NO, Y ES ARQUITECTÓNICO

Congelar el fotograma un segundo mientras rematas una frase es un recurso
clásico. Pero **cambia la duración**, y el EDL se apoya en lo contrario: los
efectos nunca tocan la línea de tiempo, y por eso el auto-balanceador puede
quitar y poner sin descuadrar nada. Esto tendría que ser un cambio de `timeline`,
no un efecto, con todo lo que arrastra.

No es imposible; es caro, y hay cosas mejores por el mismo precio.

## 5. El comando que dictas, escrito en pantalla · NO

Para una guía técnica sería muy útil: dices *"escribe sudo apt install"* y
aparece escrito. El problema es de detección: reconocer un comando dentro del
habla transcrita es mucho más frágil que reconocer un tema, y **un comando mal
escrito en pantalla es peor que ninguno** — alguien lo va a copiar.

## 6. Flecha en vez de recuadro · NO AHORA

Los recuadros ya señalan lo que nombras cuando el OCR lo encuentra. Una flecha
se lee mejor en objetivos pequeños, pero necesita lo mismo (tesseract) y aporta
poco sobre lo que ya hay.

## 7. Barra de progreso, reloj, contador de tiempo ahorrado · NO

Decoran. No explican nada que no se entienda sin ellos.

---

## Lo que sale de aquí

Se hace **una**: el marcador de velocidad. Y no por ser la más vistosa — es la
menos vistosa de la lista — sino porque es la única que arregla algo que hoy
está roto: un vídeo que se acelera sin decirlo.

Las dos que más ilusión hacían (aviso y contador de pasos) están paradas por el
mismo motivo, y con el número delante: el análisis las dispararía cincuenta
veces por vídeo. Primero hay que enseñarle a elegir; dibujarlas sin eso sería
justo lo contrario de lo que se lleva pidiendo todo este rato.
