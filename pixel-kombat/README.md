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
| Burla (+12% de barra) | `R` | `P` |

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

## 👥 El elenco

| Personaje | Tipo | Especial | SUPER |
|---|---|---|---|
| **TRUMPO** *(el magnate)* | 💵 DINERO | `MURO DE ORO`: un muro que frena golpes y proyectiles | `LLUVIA DE BILLETES` |
| **MUSKO** *(el de los cohetes)* | 🚀 COHETE | `ATERRIZAJE CONTROLADO`: cohete en parábola que explota | `TUIT DE MADRUGADA`: hunde la bolsa y ralentiza |
| **EL PULGA** *(el de la zurda)* | ⚽ FÚTBOL | `TIRO LIBRE`: balón con efecto que persigue | `GAMBETA INFINITA`: se va de cuatro |
| **SIUUU** *(el del salto)* | 👑 EGO | `CABEZAZO ORBITAL`: embestida aérea | `GRITO SIUUU`: onda que aturde |
| **CHEF RAMSÉS** *(el que grita)* | 🔥 COCINA | `¡ESTÁ CRUDO!`: platos voladores | `PESADILLA EN LA COCINA`: lluvia de sartenes ardiendo |
| **BOB LA BROCHA** *(el pintor amable)* | 🎨 ÓLEO | `ARBOLITO FELIZ`: se cura y aguanta más | `ACCIDENTE FELIZ`: lluvia de pintura |
| **LA ROCA** *(el de la ceja)* | 🪨 ROCA | `CEJA LEVANTADA`: intimida y ralentiza | `CODAZO DEL PUEBLO` |
| **ZUCK-BOT** *(el de la red)* | 🤖 ALGORITMO | `VERIFICA QUE NO ERES UN ROBOT`: captcha que ralentiza | `NUEVOS TÉRMINOS Y CONDICIONES` |

## 🧬 Tipos (como en Pokémon, pero con peor criterio)

Cada luchador tiene un **tipo principal** que multiplica el daño (**x1.4** con
ventaja, **x0.7** con resistencia) y un **subtipo** decorativo que no hace nada
y existe solo para el chiste.

| Tipo | Pega +40% a | Porque |
|---|---|---|
| DINERO | ALGORITMO, COCINA | *compró la red social entera* / *compró el restaurante y lo cerró* |
| COHETE | EGO, ROCA | *el ego no llega a Marte* |
| FÚTBOL | DINERO, EGO, COHETE | *los títulos callan bocas* / *lo bajó de un cabezazo* |
| EGO | COCINA, ALGORITMO | *gritó más fuerte que el chef* |
| COCINA | ÓLEO, ALGORITMO | *ninguna IA sabe sazonar* |
| ÓLEO | DINERO, COHETE, ROCA | *el arte no se paga en efectivo* / *le pintó un bigote y perdió la autoridad* |
| ROCA | COCINA, FÚTBOL | *se comió la cocina entera* / *nadie le regatea a ese señor* |
| ALGORITMO | FÚTBOL, ÓLEO, ROCA | *lo anuló el VAR* / *le canceló la película* |

La tabla es simétrica. Al conectar con ventaja salta **¡SUPER EFECTIVO!** con su
chiste; al revés sale *poco efectivo* y la excusa del que aguanta (*"error 403:
golpe no autorizado"*, *"se tiró, pero no era falta"*). Si el KO llega con
ventaja, el remate es **¡SUPER EFECTIVO!**. La pantalla VS te adelanta el cruce
y la de CONTROLES tiene la tabla entera.

**Comentarista**: una línea abajo que narra el desastre (arranque de asalto,
vida baja, KO, burlas y ventajas de tipo).

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

## 🗂️ Estructura

```
pixel-kombat/
├── index.html          # un lienzo y los scripts. Nada más
├── css/style.css       # solo centrado, escalado y filtro CRT
└── js/
    ├── pixel.js        # utilidades de dibujo (rejillas, rects, sombras)
    ├── font.js         # fuente de mapa de bits 5x7 propia
    ├── types.js        # tabla de tipos, multiplicadores e iconos
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
píxeles de 12×12 por personaje; escenarios y sonido generados por código.
