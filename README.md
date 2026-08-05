# Vagabundo de Ellswyr

Juego 2D de exploración en pixel art, mundo procedural infinito, estilo *Necesse* / *Stardew Valley*.
Todo el arte es **generado por código** (sin assets de terceros, sin emojis) y horneado
en un atlas de 426 sprites: terreno, criaturas, 8 íconos de inventario y toda la interfaz
(fuente bitmap de 97 glifos, paneles de madera, botones y marcos) — sin fuentes del sistema.

## Cómo jugar

**`Vagabundo-de-Ellswyr.html`** — un solo archivo, sin dependencias ni servidor.
Abrilo con doble clic en cualquier navegador moderno.

| Tecla | Acción |
|---|---|
| `W A S D` / flechas | Moverse |
| `Shift` | Correr (consume vigor) |
| `E` / `Espacio` | Interactuar / recolectar |
| `Q` | Comer (raciones, bayas u hongos) |
| `C` | Taller de fabricación |
| `R` | Usar cataplasma |
| `G` | Colocar lo seleccionado |
| `H` | Cambiar qué vas a colocar |
| `F` | Atacar con la lanza (si la tenés) |
| `L` | Farol |
| `M` | Minimapa |
| `+` `−` | Zoom (2×–5×) |
| `N` | Silenciar / activar sonido |
| `B` | Música on/off |
| `Esc` | Pausa |

En móvil aparece un joystick virtual con botones **E** y **MAP**.

## Fabricación

La madera, la piedra y el mineral ya **sirven para algo**. Pulsá `C` para abrir el taller.

**Equipo permanente**

| Objeto | Coste | Efecto |
|---|---|---|
| Antorcha | 2 madera, 1 piedra | El farol alumbra +60% |
| Morral reforzado | 6 madera, 2 piedra | +1 recurso por recolección |
| Botas de cuero | 3 madera, 2 mineral | +12% velocidad, −25% gasto de vigor |
| Manto térmico | 2 madera, 4 flores, 1 mineral | −55% pérdida de temperatura |
| Lanza de piedra | 4 madera, 3 piedra | Golpeá con `F` para ahuyentar bestias |
| Amuleto rúnico | 2 cristal, 3 mineral, 1 reliquia | Revela santuarios cercanos |

**Consumibles** (se acumulan y se usan con su tecla): ración seca, cataplasma y
hoguera portátil, que podés **plantar donde quieras** para tener calor y descanso.

## Refugio y descanso

La noche dejó de ser solo un castigo: ahora podés **prepararte para ella**.

- Fabricá **petate**, **muro de troncos** y **puerta** en el taller. Se colocan con `G`
  frente a tuyo, alineados a la grilla; `H` cambia entre lo que llevás.
- Los **muros bloquean a las bestias**. Las **puertas se abren y cierran** con `E`, así
  entrás y salís sin dejar el paso libre.
- **Dormir en el petate** (`E`, de noche) pasa la noche entera: amanecés en el día
  siguiente a las 6:18, con la vida al +45%, el vigor lleno y el calor restaurado.
  No es gratis: gastás hambre al dormir.
- No podés dormir de día, con mucha hambre, ni con bestias merodeando cerca.
- Todo lo que construís **persiste al cerrar el juego**.

## Supervivencia

No alcanza con caminar: hay que mantenerse vivo.

- **Vida y vigor** siempre visibles. **Hambre, frío y calor** solo aparecen cuando
  empiezan a importar, así el HUD no se satura de barras que no necesitás mirar.
- **Frío**: tundra (fuerte), montaña, noche y nadar. **Calor**: desierto y yermo
  ceniciento, más intenso al mediodía. La **sombra de los árboles lo reduce un 65%**,
  meterse al agua te refresca de golpe y de noche casi desaparece.
- Pasar calor **da más hambre**.
- Si el hambre o el calor llegan a cero, **empezás a perder vida**. Con hambre y calor
  saludables, la vida se **regenera sola**.
- **Comé** con `Q`: las bayas y los hongos que juntás restauran hambre y algo de vida.
- Las **fogatas** te devuelven vigor, calor y algo de vida.
- Los **lobos acechan y muerden** de verdad (9 de daño). Te empujan al golpear para que
  nunca sea un bucle injusto. Los slimes hacen 5.
- Con la **lanza** los espantás: salen huyendo y no atacan por unos segundos.
- Al morir aparece un **resumen de la partida** y tu récord queda guardado.

## Audio

Todo **sintetizado con WebAudio en tiempo real** — ni un archivo de sonido, el juego sigue
siendo un HTML autónomo.

- **Música generativa**: acordes lentos con melodía pentatónica que cambia a escala menor
  de noche y se vuelve tensa y rápida cuando hay un lobo cerca.
- **Ambiente por bioma**: viento filtrado según dónde estés, más pájaros de día y búhos,
  grillos y aullidos lejanos de noche.
- **Pasos según la superficie**: pasto, arena, roca, nieve y agua suenan distinto.
- **Efectos propios** para talar, picar, recolectar, cofres, santuarios, subir de nivel,
  completar objetivos y recibir daño.

## Guardado y continuidad

**Podés cerrar la pestaña y retomar donde ibas.** El título muestra *CONTINUAR* con el
resumen de tu partida en curso.

- Autoguardado cada 20 s, al pausar, al cambiar de pestaña y al cerrar.
- **El mundo nunca se serializa**: se regenera desde la semilla y solo se guardan los
  *cambios que causaste* — qué recogiste, qué cofres abriste, qué construiste. Una
  partida entera ocupa **menos de 1 KB** por lejos que explores.
- Formato **versionado con migración**: los guardados viejos se actualizan solos en vez
  de descartarse, y los campos desconocidos se preservan.

## Legado (progresión entre partidas)

Morir ya no borra todo. Cada expedición suma a tus totales de por vida, y al cruzar
ciertos umbrales desbloqueás **ventajas permanentes** para todas las partidas futuras.
Se consultan desde *LEGADO* en el título.

| Legado | Requisito | Efecto |
|---|---|---|
| Veterano | 3 expediciones | +20 vigor inicial |
| Ojo entrenado | 15 km totales | Empezás con bayas y hongos |
| Rastreador | 5 biomas vistos | Mapa más amplio |
| Curtido | 12 días totales | +25 vida inicial |
| Artesano | 40 km totales | Empezás con madera y piedra |
| Guardián | 9 biomas vistos | Las bestias te temen más |
| Leyenda | 40 días totales | Empezás con el manto térmico |

Añadir un legado nuevo es **una entrada en la tabla** de `legacy.js`; ningún otro
archivo cambia.

## Hoja de ruta

Reordenada por retorno visual por hora de trabajo, no por profundidad de sistema.
Lo tachado ya está implementado.

1. ~~**Estaciones**~~ — hecho, ver abajo.
2. **Acantilados** — el campo de altura con crestas ya existe y no se ve en ningún
   lado. Cuantizarlo en niveles y dibujar caras de roca donde un tile es más alto
   que su vecino del sur. Es de donde sale la profundidad, y es requisito de lo
   siguiente.
3. **Cuevas** — el único lugar donde el lightmap es protagonista: ambiente casi
   negro, el farol como mecanismo central, los cristales como balizas. Una entrada
   en suelo plano es un agujero; en una pared de roca es una entrada.
4. **PNJ errantes** — mucho más baratos de lo que parecen: un mercader son los
   mismos fotogramas del jugador con otras rampas, coste de atlas cero. Lo nuevo
   es el sistema de diálogo, no el arte.
5. **Pesca** — cuidado: los lagos no existen como concepto. `biomeAt()` decide agua
   sólo por altura, así que una laguna y el océano son el mismo bioma. Hace falta
   un `isLake()` que muestree un anillo, como ya se hace para detectar playa.
6. **Variantes de bioma** — un campo de ruido de baja frecuencia que elija una de
   tres paletas por bioma. Casi gratis una vez que exista el recoloreo de
   estaciones, y es lo que ataca el "a los diez minutos todo se ve igual".
7. **Compañero animal** — domesticar un lobo o un ciervo con comida.

## Ciclo de juego

1. **Título** → **Creador de personaje** → **Configuración del mundo** → partida.
2. En el mundo perseguís **objetivos** que otorgan experiencia.
3. Al **subir de nivel** ganás vigor máximo permanente.
4. Los **santuarios** amplían tu vigor y dan experiencia extra.

### Personalización

Creador con **maniquí grande sobre un pedestal de piedra**, iluminado por un foco cenital
con motas de polvo flotando. Gira solo para mostrar los cuatro lados, o lo parás y lo girás
a mano con las flechas (`Tab` desde el teclado).

Cada color se elige **haciendo clic en su muestra**, no ciclando con flechas. Las muestras
son chips de tres tonos que enseñan la rampa completa, no un color plano:

| Opción | Variantes |
|---|---|
| Piel | 6 tonos, de pálido a ébano |
| Peinado | corto · largo · coleta (silueta distinta en las 4 direcciones) |
| Color de pelo | 6 |
| Capa | 6 colores |
| Túnica | 5 colores |
| Pantalón | 4 colores |
| Nombre | libre |

El **oficio** ocupa una tarjeta de pergamino propia, con nombre grande, descripción,
lista de ventajas e indicadores de posición:

- **Explorador** — +15% velocidad, +20 vigor máximo.
- **Erudito** — +1 reliquia por cofre, santuarios dan más vigor.
- **Recolector** — +1 por recolección y recuperás vigor al recoger.

### Configuración del mundo

Tamaño (islas/normal/vasto), densidad de vegetación, duración del día y semilla opcional.

### Objetivos

10 metas encadenadas, de *Primeros pasos* (500 m) a *Leyenda de Ellswyr* (los 11 biomas),
pasando por recolectar, activar santuarios, abrir cofres y sobrevivir noches enteras.
Se muestran tres a la vez en un panel con barra de progreso.

## Qué hay para descubrir

- **11 biomas**: océano, costa, playa, pradera, llanura, bosque, pantano, desierto, montaña, tundra y yermo ceniciento.
- **Mundo infinito y determinista**: la misma semilla siempre genera el mismo mundo (*Mundo con semilla…* en el menú).
- **Ciclo día/noche** de 15 minutos reales, con amanecer y atardecer coloreados e iluminación dinámica (farol, fogatas, cristales, santuarios).
- **Clima**: lluvia y nieve según el bioma.
- **Fauna con IA**: conejos y ciervos que huyen, lobos que acechan, slimes, aves y luciérnagas nocturnas.
- **Recursos**: bayas, madera, piedra, hongos, flores, minerales (hierro, oro, carbón, cristal).
  Cada uno tiene su **ícono de pixel art propio** en el inventario, en el aviso de acción y en el texto flotante al recolectar.
- **Estructuras**: santuarios (+10 de vigor máximo), cofres con reliquias y campamentos para descansar.

## Estructura del proyecto

```
pixel-explorer/
├── Vagabundo-de-Ellswyr.html   ← el juego completo (entregable)
├── game/                       versión modular servible
│   ├── index.html
│   ├── atlas.png / atlas.json  atlas de sprites horneado
│   ├── font.json               métricas de la fuente bitmap
│   ├── pal.json                rampas de color para el recoloreado
│   └── js/{world,render,ui,charcustom,quests,audio,crafting,craftui,menu,creator,game}.js
└── tools/                      generadores de pixel art (Python + PIL)
    ├── artlib.py               mini-renderer: formas, rampas, dithering, contornos
    ├── gen_terrain.py          tiles tileables + máscaras de transición orgánicas
    ├── gen_props.py            árboles, rocas, ruinas, flora
    ├── gen_chars.py            jugador y criaturas (4 direcciones × 4 fotogramas)
    ├── gen_items.py            íconos de inventario (esferas sombreadas, facetas, metal)
    ├── gen_ui.py               fuente bitmap 5x7 + paneles/botones/slots de madera
    ├── bake.py                 empaqueta todo al atlas
    └── build_single.py         compila el HTML autónomo
```

### Regenerar el arte

```bash
cd tools
python3 bake.py          # regenera atlas.png + atlas.json
python3 build_single.py  # recompila el HTML de un solo archivo
```

## Interfaz

Nada de la UI usa HTML, CSS ni fuentes del sistema: **todo se dibuja en el canvas**.

- **Fuente bitmap propia** de 5×7 px con 97 glifos (incluye acentos y `ñ`), escalada
  a múltiplos enteros y recoloreada por composición `source-in`, así nunca se ve borrosa.
- **Pantalla de título** sobre un mundo real generado que orbita lentamente de fondo,
  con emblema de brújula, sombra de texto en píxeles, destello dorado que barre el logo
  y motas de polvo flotando.
- **Paneles 9-slice** de madera y pergamino: se estiran a cualquier tamaño sin
  deformar las esquinas ni los remaches de hierro.
- **Botones** con estados normal/hover/pulsado, flechas doradas de selección y
  desplazamiento de 2px al presionar.
- **Menú de pausa** con estadísticas de la partida; **entrada de semilla** con cursor
  parpadeante, navegable con teclado o mouse.

## Detalles técnicos

- **Terreno**: ruido Perlin fBm en tres capas (altura con crestas montañosas, humedad, temperatura) más un campo continental de baja frecuencia; la arena solo aparece donde toca el agua.
- **Transiciones**: cada bioma tiene 12 máscaras (4 bordes, 4 esquinas externas, 4 internas) con contorno irregular, aplicadas por prioridad para que la nieve tape la roca, la roca tape el pasto, etc.
- **Anti-tiling**: 4 variantes por tile × espejado horizontal/vertical (16 permutaciones) + modulación de color macro de baja frecuencia sobre cada chunk.
- **Rendimiento**: el suelo se rasteriza una vez por chunk (24×24 tiles) a un canvas cacheado; solo los chunks con agua se repintan al animar. ~60 FPS estables corriendo y generando terreno nuevo.
- **Iluminación**: lightmap a ¼ de resolución con gradientes radiales, compuesto en `multiply` sobre la escena.
- **Orden de dibujo**: y-sorting de props, criaturas y jugador; los árboles se vuelven semitransparentes cuando te tapan.
- **Sombras proyectadas**: pase propio antes de los sprites (dibujarlas junto a cada uno haría que la sombra de adelante tapase al de atrás). Siguen al sol: cortas al mediodía, largas y sesgadas al alba y al ocaso, y de noche queda sólo la oclusión de contacto. Las elipses se rasterizan una vez y se umbrala el alfa, así el borde queda duro como todo lo demás.
- **Variación por instancia**: tres tallas horneadas por árbol —con la copa rearmada, no escalada— más espejado por hash de posición: 48 siluetas a partir de 24 sprites.
- **Capa de decoración**: pase independiente del de recursos, con densidad en manchones por ruido, para que un tile con árbol pueda además tener pasto a los pies. No se persiste: el guardado sigue por debajo de 1 KB.
- **Estaciones**: el atlas se recolorea por rotación de matiz, no con arte nuevo. Tres grupos con transformaciones distintas —suelo, follaje y conífera— porque una sola daba monocromo: en invierno el bosque desaparecia contra la nieve. Sólo rotan los pixeles cuyo matiz cae en la banda del verde, asi el tronco sigue marrón y de una flor se tiñe el tallo pero no el pétalo. La nieve del invierno es el propio tile de pasto llevado al blanco azulado: no hay tileset nuevo. Corre una vez por cambio de estación, no por fotograma, y la estación sale del día, asi que no hay nada nuevo que guardar.
- **Gradación permanente**: multiply frío sobre las sombras y overlay ámbar sobre las luces, siempre activos; la hora dorada y la luz de luna se suman encima.
- **Recoloreado en tiempo real**: el atlas guarda las 3 siluetas de pelo una sola vez; al confirmar el personaje se recortan los fotogramas a un canvas y se sustituyen las rampas de color píxel a píxel. Cambiar de aspecto no cuesta memoria de atlas.
- **Personajes con rampas completas**: cada material (piel, pelo, capa, túnica, pantalón, cuero, latón) tiene 4-5 tonos en vez de uno plano. La túnica lleva pliegues y un cuello con cordón, la capa tiene caídas verticales y dobladillo, los pantalones tienen costura interna y tira de luz, las botas tienen puño y suela. La cara tiene ceja, nariz, boca, mejillas y brillo en el ojo.
- **Proporciones**: cuello visible entre cabeza y torso, torso estrecho y piernas largas (20×30 px) para que la silueta lea como una persona y no como un bloque.
- **Fauna con volumen**: ancas y hombros modelados como masas separadas, moteado en el ciervo, pelaje en el conejo, pezuñas y garras definidas.
- **Árboles por rejilla, no por sorteo**: un tile lleva árbol sólo si su hash es el mayor de su vecindad 3x3, lo que garantiza separación mínima sin consultar props vecinos (dentro de `buildChunk` sólo se ven los del chunk actual). La densidad la modula un ruido de baja frecuencia, asi que el bosque alterna arboledas cerradas con claros. Y las flores del bosque salen sólo en los claros: un claro deja de ser un hueco y pasa a ser algo que se ve desde lejos y da a dónde ir.
- **Generación calibrada**: los pesos del ruido y los umbrales de bioma salieron de optimizar el reparto contra un objetivo por descenso por coordenadas, no de tantear. Antes el término de crestas sumaba +0.14 de media en todo el mapa en vez de dibujar cordilleras, y los umbrales estaban escritos como si el fbm fuese uniforme en [0,1] cuando su p5/p95 reales son 0.34/0.66: el resultado era 42% de montaña, 0.1% de agua y dos biomas que no existian. Ahora los once aparecen y ninguno se sale de su rango objetivo. Las perillas están en `GEN`, en `world.js`.
- **Rampas con desvío de tono**: las sombras del terreno rotan hacia el azul y las luces hacia el ámbar por el arco más corto del círculo cromático, manteniendo el valor original. Ensanchar el rango de valor dentro de un tile de 16 px no funciona —se convierte en estática—; el rango grande viene de la escena.
- **Contornos con color**: ningún sprite usa negro puro. Cada píxel del contorno se deriva del color que toca, desaturado y oscurecido hacia un tinte cálido — así los sprites se integran con la escena en vez de parecer calcomanías.
- **Follaje esférico**: las copas se sombrean con un término Lambert sobre la normal de un elipsoide (no un degradado lineal, que producía bandas diagonales), más cúmulos de hojas, huecos oscuros y tufos satélite que rompen la silueta.
- **Agua**: 3 variantes de ruido × 6 fotogramas × espejado en X e Y = 72 permutaciones, para que las crestas nunca formen una cuadrícula. La profundidad costera se pinta por bloques de 2px a partir del campo de altura, independiente de la grilla de tiles.
- **Espuma animada**: 4 fotogramas de oleaje con fase desplazada por tile, para que la orilla no lata al unísono.
- **Gradación de color**: capa `overlay` cálida en las horas doradas y `screen` fría de noche, encima del multiply de iluminación.
- **Íconos de ítems**: construidos con primitivas sombreadas — esferas con iluminación Lambert (bayas, minerales), cilindros con veta longitudinal y anillos de crecimiento (madera), sólidos facetados con costuras (piedra, cristal) y un toro sombreado para la reliquia. Se recortan del atlas a data-URI y se reutilizan como fondos CSS en el HUD.
