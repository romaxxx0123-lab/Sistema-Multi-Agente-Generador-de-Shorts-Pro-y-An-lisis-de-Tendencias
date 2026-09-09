# 🥊 PIXEL KOMBAT — Torneo de Famosos Inexplicable

Juego de pelea 1 vs 1 estilo Mortal Kombat, en **pixel art**, donde se dan de
tortas ocho caricaturas de gente que existe de verdad. Cada personaje pelea con
lo que le hizo famoso: uno construye muros y paga en efectivo, otro lanza
cohetes que a veces aterrizan, otro grita que todo está crudo y otro pinta un
arbolito feliz para curarse.

**Proyecto independiente** del resto del repositorio: HTML + CSS + JavaScript
puro, sin dependencias, sin build, sin instalación.

> Todos los personajes son **parodias ficticias** con nombres deformados. Son
> caricaturas de personajes públicos, no esas personas. Nadie fue consultado.

---

## ▶️ Cómo jugar

Abre `index.html` con doble clic (funciona desde `file://`), o sirve la carpeta:

```bash
cd pixel-kombat
python3 -m http.server 8080   # y abre http://localhost:8080
```

Necesita teclado (no hay controles táctiles). Los menús también aceptan ratón.

## 🎮 Controles

| Acción | Jugador 1 | Jugador 2 |
|---|---|---|
| Mover | `A` / `D` | `←` / `→` |
| Saltar | `W` | `↑` |
| Agacharse | `S` | `↓` |
| Puño | `F` | `J` |
| Patada | `G` | `K` |
| Especial (30% de barra) | `H` | `L` |
| **SUPER** (barra al 100%) | `T` | `O` |
| Uppercut | `S` + `F` | `↓` + `J` |
| Barrida | `S` + `G` | `↓` + `K` |
| **Hablar** (+12% de barra) | `R` | `P` |

- **Bloquear**: mantén la dirección contraria al rival (en el suelo).
- `ESC` pausa · `M` silencia · `ENTER` confirma en los menús.

## 📏 Reglas

- Al mejor de 3 asaltos, 60 segundos cada uno.
- Si se acaba el tiempo gana quien tenga más vida (empate = asalto nulo).
- La barra de SUPER sube al pegar, al recibir y al burlarse; se conserva a la
  mitad entre asaltos.
- Burlarse carga barra pero te deja vendido medio segundo. El comentarista lo
  comenta. El rival lo recuerda.

---

## 👥 El elenco (14 luchadores)

Nadie repite arquetipo: cada uno tiene **vida, velocidad, salto, alcance y
ritmo de golpeo propios**, y ninguna pareja comparte las dos habilidades.

| Personaje | Tipo | Arquetipo | Vida | Vel. | Especial → SUPER |
|---|---|---|---|---|---|
| **TRUMPO** *(el magnate)* | 💵 DINERO | Tortuga | 120 | 1.05 | `MURO DE ORO` (barrera) → `LLUVIA DE BILLETES` |
| **MUSKO** *(el de los cohetes)* | 🚀 COHETE | Riesgo | **85** | 1.45 | `COHETE INESTABLE` (**30% le vuelve encima**) → `HYPERLOOP` |
| **EL PULGA** *(el de la zurda)* | ⚽ FÚTBOL | Velocidad | 95 | **1.60** | `NARIZÓN` (**le crece la nariz y pica con ella**) → `GAMBETA INFINITA` |
| **BOB LA BROCHA** | 🎨 ÓLEO | Soporte | 115 | 1.10 | `ARBOLITO FELIZ` (cura) → `ACCIDENTE FELIZ` |
| **LA ROCA** *(el de la ceja)* | 🪨 ROCA | Tanque | **130** | 0.95 | `CEJA LEVANTADA` → `CODAZO DEL PUEBLO` |
| **ZUCK-BOT** | 🤖 ALGORITMO | Control | 95 | 1.20 | `¿ERES UN ROBOT?` → `TÉRMINOS NUEVOS` |
| **LA LOBA** *(la de las caderas)* | 💃 RITMO | Cercanía | 100 | 1.30 | `CADERAZO` → `AULLIDO` (**aturde**) |
| **ALBERTITO** *(el del pelo)* | ⚛️ CIENCIA | Zoner | **85** | 1.00 | `E = M C 2` (**crece al viajar**) → `AGUJERO NEGRO` (**atrae**) |
| **EL PELUCA** *(el de la motosierra)* | 🪚 MOTOSIERRA | Anulador | 95 | 1.35 | `¡NO HAY PLATA!` (**anula todo lo lanzado**) → `MOTOSIERRA` |
| **EL DIBU** *(el de los penales)* | 🧤 ARQUERO | Contragolpe | 115 | 1.15 | `ATAJADA` (**caza proyectiles**) → `TE LO ATAJO` (aturde y roba super) |
| **LA CRESTA** *(la de la pancarta)* | 📢 MEGÁFONO | Empuje | 100 | 1.25 | `MEGAFONAZO` (**rompe la guardia y te estampa**) → `MANIFESTACIÓN` |
| **EL CHAD** *(el de la mandíbula)* | 👑 EGO | Contra | **125** | 0.92 | `POSE` (**no bloquea: devuelve el golpe**) → `CHADAZO` (presa imparable) · **el más grande del elenco** |
| **EL MUSTANG** *(un coche, literal)* | 🏎️ MOTOR | Atropello | 105 | 1.38 | `DERRAPE` (**cortina de humo que se queda**) → `SE VA DEL MEET` |
| **MICHAEL** *(el del sombrero)* | 💃 RITMO | Evasión | 100 | 1.30 | `MOONWALK` (**los proyectiles no le tocan**) → `THRILLER` (zombis) |

Mecánicas exclusivas: el **muro** de Trumpo, el **cohete que se le vuelve en la
cara** a Musko, la **nariz que crece** del Pulga (el golpe con más alcance del
juego), la **cura** de Bob, el **aturdimiento** de La Loba, el **proyectil que
crece** y el **agujero negro** de Albertito, el **teletransporte** de Musko, la
**anulación** del Peluca, la **atajada** del Dibu, el **megafonazo imbloqueable**
de La Cresta, la **contra** y la **presa** del Chad, la **zona de humo** y el
**atropello con retroceso** del Mustang, y el **paso atrás intangible** y los
**zombis** de Michael.

**El Mustang es literalmente un coche.** No tiene cabeza ni brazos, y tampoco se
monta por piezas como los demás: se dibuja de una **rejilla de píxeles propia de
88x38**. Los rectángulos valen para un cuerpo, pero un coche necesita pasos de
rueda redondos y un parabrisas inclinado, y eso pide rejilla.

Lo que hace que se lea como Mustang y no como "un coche": **capó muy largo, cola
muy corta y techo retrasado que cae en fastback** hasta el maletero. Encima
lleva branquias en el pilar C, pilotos traseros de tres barras, toma de aire en
el capó, branquias delante de la rueda trasera, colín levantado, franja lateral,
corte de puerta con manilla, faro, parrilla con el caballito y escape. Pega con
el parachoques, es mucho más bajo y más largo que el resto, y su retrato del
marcador es el morro visto de frente.

A escala real un muscle car mide tres veces y media más largo que alto y no
cabría en la pantalla, así que está achatado a proporción de coche de juguete.

**Quién no está y por qué.** Fuera SIUUU (nadie lo pidió) y fuera CHEF RAMSÉS:
era el único cuyas dos habilidades eran genéricas —un proyectil doble como el de
media plantilla y una lluvia que ya hacían Bob y Zuck—, así que no aportaba nada
que no estuviera ya. Con él se fue el tipo 🔥 COCINA, cuyo hueco en la tabla lo
ocupa 🏎️ MOTOR.

**Contra las cuerdas**: si un empujón fuerte te estampa contra el borde te llevas
un 50% de daño extra. De momento solo lo provoca el megafonazo.

## 🤝 Interacciones entre personajes

Algunos cruces tienen guion propio: no solo cambia el daño, cambia lo que pasa
en pantalla y lo que se dicen.

| Cruce | Qué ocurre |
|---|---|
| **TRUMPO lanza billetes + EL PELUCA usa ¡NO HAY PLATA!** | Los billetes **se desintegran en el aire** y Trumpo **pierde toda la barra de super**. PELUCA: *"¡NO HAY PLATA!"* → TRUMPO: *"¡ESO ES SOCIALISMO!"* |
| PELUCA anula el cohete de MUSKO | *"NO FINANCIO COHETES"* → *"LO PAGO YO, TRANQUILO"* |
| PELUCA anula el arbolito de BOB | *"EL ARTE NO SE SUBVENCIONA"* → *"PERO SI ERA GRATIS..."* |
| **EL DIBU ataja el tiro libre de EL PULGA** | El proyectil **se queda en sus guantes**, cero daño y +14 de super. DIBU: *"PERDÓN LEO"* → PULGA: *"DALE DIBU, SOLTALA"* |
| DIBU ataja un billete de TRUMPO | *"ESTA PLATA ES MÍA"* → *"¡ESO ES ROBO!"* |
| DIBU ataja el cohete de MUSKO | *"ATAJÉ UN COHETE"* → *"IMPOSIBLE, ERA BALÍSTICO"* |
| **EL CHAD en POSE recibe un golpe** | No lo bloquea: lo **devuelve multiplicado** y el que pegó sale despedido. CHAD: *"NO."* |
| **EL CHAD en POSE contra TRUMPO** | Contra el tipo 💵 DINERO devuelve **×2,2 en vez de ×1,5**. CHAD: *"ESO NO SE COMPRA"* → TRUMPO: *"¡TODO SE COMPRA!"* |
| **MICHAEL en MOONWALK contra cualquier proyectil** | Le **pasa por debajo**: cero daño, y mientras tanto carga super. Sale *"NI LO ROZA"* |
| **EL MUSTANG derrapa contra EL DIBU** | El humo **no se ataja**: la cortina le dura **el doble**. MUSTANG: *"ESTO NO SE ATAJA"* |
| **EL MUSTANG termina el atropello contra el borde** | Se estampa y **se hace 12 de daño a sí mismo**: *"SE FUE DEL MEET. COMO SIEMPRE."* |
| **THRILLER contra EL CHAD en POSE** | El primer zombi se lleva la contra. Sale solo si el Chad tenía la pose puesta |
| PELUCA anula el derrape del MUSTANG | *"ESO ES GASTO PÚBLICO"* → *"SOY PRIVADO, SEÑOR"* |
| MICHAEL y LA LOBA se cruzan los proyectiles | *"ESTO ES UN DUELO DE BAILE"* → *"Y LO VOY A GANAR"* |
| EL CHAD y LA ROCA se cruzan | *"PRIMO."* → *"PRIMO."* |
| Dos proyectiles rivales chocan en el aire | Se anulan con destello. Si el cruce está escrito (TRUMPO/ZUCK, MUSKO/ALBERTITO, MUSTANG/PULGA, MICHAEL/ZUCK...) se dicen lo suyo |

Además, contra el tipo 💵 DINERO el `¡NO HAY PLATA!` hace **el doble de daño** y
vacía la barra entera, y la tabla de tipos ya dice que el dinero le hace un 30%
menos de daño al de la motosierra.

## 🔊 Cómo se expresan (sin bocadillos)

Los personajes no se ponen a conversar en mitad de la pelea. **Hablar lo decides
tú**: la tecla `R` (`P` para el jugador 2) hace que tu personaje suelte una
frase, y la frase **depende de cómo va el combate**:

| Situación | Qué dice TRUMPO al pulsar |
|---|---|
| Lejos, con el rival entero | *"GANO SIEMPRE, PREGUNTA"* |
| Pegado al rival | *"¡TREMENDO!"* |
| Tú al límite de vida | *"NECESITO UN MURO MÁS ALTO"* |
| El rival casi muerto | *"LO DICE TODO EL MUNDO"* |
| Contra un rival con pique escrito | *"CON ESE PELO NO SE NEGOCIA"* (al Peluca) |

Hablar **carga un 12% de barra de super** pero te deja vendido medio segundo, y
tiene enfriamiento: aunque machaques la tecla, sale una sola frase.

En automático solo quedan los **momentos guionizados** (el pique antes del
asalto, los cruces como el ¡NO HAY PLATA!, el muro roto y el final del asalto).
El resto de reacciones son mudas:

- **Voz sintetizada propia**: cada uno tiene su timbre, tono y ritmo de
  balbuceo (12 perfiles distintos). Ramsés y La Roca gruñen grave y rasgado,
  La Loba y Siuuu suenan agudos y terminan hacia arriba, Zuck habla plano y
  robótico, Albertito ondula. No dicen palabras: se entiende por el tono.
- **Emotes con icono** al lado de la cabeza: impacto, dolor, escudo, gafas de
  chulo, alarma, corona, prohibido, guante... o el **icono de su tipo** cuando
  lanzan un especial.
- El **texto solo aparece en los momentos escritos** (pique de arranque, cruces
  entre personajes, remates) y lo hace en el **rótulo inferior**, con el color
  del tipo de quien habla, como un subtítulo de retransmisión.

## 💀 Remate: ¡BEBALIDAD!

Guiño a la *Babality* de Mortal Kombat II: cuando un combate se cierra por KO,
el perdedor **se convierte en bebé** (cabeza normal sobre un cuerpecito con
pañal, llorando a lágrima viva) y el ganador **lo saca de la arena de una
patada**, dando vueltas por el aire.

## 🧬 Tipos (como en Pokémon, pero con peor criterio)

Cada luchador tiene un **tipo principal** que multiplica el daño (**x1.4** con
ventaja, **x0.7** con resistencia) y un **subtipo** decorativo que no hace nada
y existe solo para el chiste.

| Tipo | Pega +40% a | Porque |
|---|---|---|
| DINERO | ALGORITMO, MOTOR | *compró la red social entera* / *le compró el concesionario* |
| COHETE | EGO, ROCA | *el ego no llega a Marte* |
| FÚTBOL | DINERO, EGO, COHETE | *los títulos callan bocas* / *lo bajó de un cabezazo* |
| EGO | MOTOR, ALGORITMO | *se sacó una foto y lo eclipsó* |
| MOTOR | ÓLEO, ALGORITMO | *un carburador no se hackea* / *pasó por encima del cuadro* |
| ÓLEO | DINERO, COHETE, ROCA | *el arte no se paga en efectivo* / *le pintó un bigote y perdió la autoridad* |
| ROCA | MOTOR, FÚTBOL | *levantó el coche entero* / *nadie le regatea a ese señor* |
| ALGORITMO | FÚTBOL, ÓLEO, ROCA | *lo anuló el VAR* / *le canceló la película* |
| RITMO | EGO, CIENCIA | *las caderas no mienten, el ego sí* / *eso no lo explica la física* |
| CIENCIA | COHETE, ALGORITMO | *él inventó ese cohete* / *la IA le copió los deberes* |
| MOTOSIERRA | DINERO, ALGORITMO, ARQUERO | ***¡no hay plata!*** / *le cortó el presupuesto* |
| ARQUERO | FÚTBOL, COHETE | *le ataja hasta los penales* / *también ataja cohetes* |
| MEGÁFONO | EGO, ALGORITMO | *el ego no se oye desde la plaza* / *no hay algoritmo que tape eso* |

La tabla es simétrica. Al conectar con ventaja salta **¡SUPER EFECTIVO!** con su
chiste; al revés sale *poco efectivo* y la excusa del que aguanta (*"error 403:
golpe no autorizado"*, *"se tiró, pero no era falta"*). Si el KO llega con
ventaja, el remate es **¡SUPER EFECTIVO!**. La pantalla VS te adelanta el cruce
y la de CONTROLES tiene la tabla entera.

**Comentarista**: una línea abajo que narra el desastre (arranque de asalto,
vida baja, KO, burlas y ventajas de tipo).

## 💬 Hablan mientras pelean

Cada personaje tiene sus frases propias, que salen según lo que pasa en el
combate, más frases específicas contra ciertos rivales. La regla al escribirlas
es una: **si la podría decir cualquiera, no entra**. Nada de relleno tipo
*"demasiado fácil"* o *"iteración exitosa"*; solo lo que diría esa persona y
nadie más.

| Situación | Ejemplo |
|---|---|
| Pique antes del asalto | TRUMPO: *"TE COMPRO LA EMPRESA"* → MUSKO: *"TU MURO NO TIENE WIFI"* |
| **Le rompen el muro** | TRUMPO: *"¡ROMPISTE MI MURO!"* / *"¡ESO LO PAGAS TÚ!"* |
| Al pegar fuerte | MICHAEL: *"¡AAOW!"* · MUSTANG: *"¡PARACHOQUES!"* · CHAD: *"SÍ."* |
| Al recibir | TRUMPO: *"¡ESTO ES FRAUDE!"* · PULGA: *"¡ESO ES FALTA!"* |
| Al bloquear | ZUCK: *"SOLICITUD DENEGADA"* · ROCA: *"NI ME MUEVO"* |
| Con ventaja de tipo | ZUCK: *"EL ALGORITMO TE CONOCE"* |
| Con poca vida | MUSTANG: *"HUELE A QUEMADO"* · ROCA: *"AHORA ME ENFADO"* |
| Al ganar el asalto | BOB: *"QUEDÓ PRECIOSO"* · PELUCA: *"¡VIVA LA LIBERTAD, CARAJO!"* |
| Chulearse con ventaja | **PELUCA: *"¿ESTÁS NERVIOSO?"*** |

Los piques entre rivales concretos están escritos a mano: El Peluca le suelta el
*"¿estás nervioso?"* a quien le levante la voz, Zuck le recuerda a La Roca que
*"músculo no es un dato"* y el Chad le contesta a La Cresta *"te escucho"*.

Hay un límite: cada luchador no suelta otra frase hasta pasados ~2,5 segundos,
así que no se solapan ni cansan.

---

## 🖥️ Por qué no parece una página web

Todo lo que se ve —menús, HUD, textos, barras de vida— **se dibuja dentro del
lienzo**, no hay un solo elemento HTML de interfaz:

- **Fuente propia de mapa de bits 5×7** (`js/font.js`), dibujada pixel a pixel,
  con tildes y signos de apertura. Ninguna tipografía del sistema.
- **Cero botones/DOM**: el `index.html` es un `<canvas>` y nada más.
- **Pantalla completa con escalado entero** (x1, x2, x3…): los píxeles nunca se
  interpolan ni quedan a medias.
- **Filtro CRT**: barrido de líneas y viñeta sobre la imagen.
- **Iconos de tipo dibujados a mano** en vez de emojis del sistema operativo.

### La pasada de arte

Lo que hacía que siguiera oliendo a web era el dibujo, no el HTML: eran
rectángulos planos de un solo color. Ahora:

- **Siluetas calcadas**: cada luchador se dibuja primero en oscuro desplazado en
  las cuatro direcciones, así todo el cuerpo queda perfilado. Las cabezas llevan
  su contorno calculado con `outlineGrid()`.
- **Volumen**: cada pieza del cuerpo lleva luz arriba y sombra abajo
  (`Pix.shade`), y las mangas cortas dejan ver el antebrazo.
- **Cielos con tramado** en damero (`Pix.ditherBand`), como en las consolas de
  16 bits, en vez de degradados lisos.
- **Escenarios por capas**: silueta lejana, edificios con ventanas encendidas,
  velo atmosférico que separa el fondo de los personajes, público en penumbra
  tras una barandilla haciendo la ola, suelo con textura y un borde oscuro en
  primer plano.
- **Chapa de recreativa**: placas biseladas con remaches, retratos enmarcados
  junto a las barras de vida, cintas diagonales animadas y paleta cálida
  (morado y oro) en lugar del azul marino de modo oscuro.

### Escala y animación de los sprites

Los luchadores ocupaban un 30% del alto de pantalla cuando en una recreativa
ocupan la mitad, y las caras eran rejillas de 12×12 con dos píxeles de ojo. En
una cara así no caben rasgos: cinco morenos con barba salían iguales. La
solución no fue subir la resolución del lienzo (eso solo aleja la cámara), sino
subir los píxeles **del personaje**:

- **Cabezas de 24×24** (antes 16×16, o sea 2,25× más píxeles por cara): pelo a
  tres tonos, cejas con humor propio, ojos con pestaña, blanco, pupila mirando
  al rival y brillo, nariz, boca, barba y sombra de mandíbula. Cada personaje se
  reconoce por la cara, no por el color de la camiseta.
- **Cuerpos de 90px** (antes 78, antes 54) montados por piezas reales: bota,
  espinilla, muslo, cadera, pecho, hombros y cuello, con brazo y antebrazo
  separados y un hueco entre las dos piernas para que no se lean como un bloque.
  Ocupan la mitad del alto de pantalla, como en una recreativa.
- **El esqueleto se puede ensanchar**: el Chad no es "un poco más alto", tiene el
  torso, los hombros, la cadera, los brazos y las piernas más anchos, más
  trapecios y 8px más de estatura. Con la cabeza del mismo tamaño que el resto,
  que es lo que hace que un cuerpo parezca enorme.
- **La ropa tiene prendas, no manchas de color**: cada estilo lleva cuello,
  costuras, botonadura, bolsillos, puños y bajo. Antes un traje era un
  rectángulo oscuro con una raya blanca y una camisa era una mancha azul de los
  hombros a los pies. Ahora el traje cierra bajo la corbata y asoma el puño
  blanco, la camisa lleva tapeta, botones y mangas remangadas, la bata tiene
  solapas y bolsillos con bolis, y la casaca de arquero tiene franja y dorsal.
- **Postura de combate**: los brazos ya no cuelgan rectos y muertos. El
  antebrazo se adelanta, el puño queda por delante de la cadera y las rodillas
  van algo flexionadas con el peso adelante. La pose en reposo es la firma de un
  juego de lucha, y antes parecían gente esperando el autobús. Lo justo: si la
  guardia sube al pecho, tapa la ropa que tanto costó dibujar.
- **Sombra de contacto**: era una raya de 2px que además tapaban las botas, así
  que los luchadores parecían pegados encima del fondo. Ahora es un óvalo blando
  de cinco filas, entero por debajo del pie.
- **Charco de luz en el suelo** y rebote en la pared, con el color de cada
  escenario: da profundidad, dice dónde se pelea y hace que la sombra se lea.
  Más una sombra en la parte alta que hunde el fondo.
- **Luz de canto**: un píxel claro en el borde de delante y uno oscuro en el de
  atrás, en pecho, cadera, hombros y las dos piernas. Cuatro rectángulos por
  pieza que convierten un montón de cajas apiladas en un cuerpo con volumen, y
  que además separan la pierna de delante de la de atrás.
- **Los adornos del pecho viven entre x -7 y +6**, porque fuera de ahí los
  brazos los tapan a medias y lo que se ve es una astilla de color suelta que
  parece un fallo. Ese era el motivo de los parches, bolsillos y bolis raros.
- **La mano crece con el brazo** y va centrada en él. Antes era siempre de 8px:
  en un brazo fino parecía un puño y en el del Chad, un muñón con escalón.
- **Los brazos se despegan del cuerpo sin cambiar de color**: llevan un filo de
  luz por fuera y una costura oscura por dentro. Antes se pintaban de un tono
  más claro y salían brazos grises pegados a una cazadora negra, como si fueran
  otra prenda. El puño solo se pinta si contrasta: en una bata blanca se
  oscurece para que se vea.
- **Anticipación en los golpes**: durante el arranque el brazo se recoge y el
  cuerpo se inclina hacia atrás; al impactar sale disparado hacia delante. Es
  lo que da sensación de peso.
- **Peso y rebote**: el cuerpo se inclina según la acción, al aterrizar hay
  amortiguación, al encajar un golpe el torso se va hacia atrás y en reposo
  los brazos se mecen con la respiración.
- **Embestidas con estela**: al lanzarse se dibuja al luchador de verdad,
  escorado y con el hombro por delante, con dos siluetas rezagadas y líneas de
  velocidad detrás. Se ve quién embiste, no un amasijo de barras.
- **Retratos del marcador recortados**: la cabeza ya no cabe entera en el marco,
  así que se encuadra la cara. En la parrilla de selección los personajes se
  distinguen de un vistazo.
- **Destello de impacto** de varios fotogramas: núcleo blanco, rayos y anillo
  en expansión, más grande en los golpes fuertes.
- **Duelo espejo con paleta cambiada**: si los dos jugadores eligen el mismo
  personaje, el segundo pelea con otra ropa (la piel no cambia).

### Tipografía y barras

Los dos últimos detalles que delataban "texto de programador":

- **La fuente lleva contorno completo y relleno en degradado.** Cada carácter
  precalcula su máscara de contorno (8 direcciones) una sola vez y se pinta
  uniendo los píxeles contiguos de cada fila. Los títulos usan una rampa de
  tres o cuatro tonos de arriba abajo. El interletraje es de 7px para que los
  contornos de letras vecinas no se peguen.
- **Las barras de vida ya no son rectángulos.** Llevan extremos inclinados
  (se dibujan fila a fila con desplazamiento), rampa vertical de cinco tonos,
  trama diagonal en el hueco vacío, muescas de segmento cada 12px y, sobre
  todo, **barra fantasma**: al recibir daño queda un rastro blanco que espera
  medio segundo y luego se vacía, mientras la barra real baja con inercia.
- **El reloj va en placa achaflanada** y los anuncios entran con temblor y
  rampa de color.

## 🗂️ Estructura

```
pixel-kombat/
├── index.html          # un lienzo y los scripts. Nada más
├── css/style.css       # solo centrado, escalado y filtro CRT
└── js/
    ├── pixel.js        # utilidades de dibujo (rejillas, rects, sombras)
    ├── font.js         # fuente de mapa de bits 5x7 propia
    ├── types.js        # tabla de tipos, multiplicadores e iconos
    ├── interactions.js # cruces escritos entre personajes concretos
    ├── audio.js        # efectos sintetizados con WebAudio (cero archivos)
    ├── roster.js       # los 8 personajes y el arte de proyectiles
    ├── render.js       # luchadores paramétricos y 4 escenarios
    ├── entities.js     # proyectiles, muros, partículas, avisos, decorados
    ├── fighter.js      # máquina de estados, golpes, bloqueo, daño y tipos
    ├── ai.js           # CPU por planes (acercarse, picar, bloquear, burlarse)
    ├── ui.js           # TODAS las pantallas, dibujadas en el lienzo
    └── game.js         # bucle a 60 fps, rondas, entrada y escalado
```

Lienzo interno de **320×180**; bucle de paso fijo a 60 fps con acumulador;
cuerpos dibujados por partes (piernas, torso, brazos) y cabezas como rejillas de
píxeles de 24×24 por personaje; escenarios y sonido generados por código.
