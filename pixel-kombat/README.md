# 🥊 PIXEL KOMBAT — Torneo de Random Absolutos

Juego de pelea 1 vs 1 estilo Mortal Kombat, en **pixel art**, con un elenco de
personajes que no tienen absolutamente nada que ver entre sí: un magnate que
construye muros, una abuela con chancla teledirigida, un capibara zen, una
paloma cibernética, un router, un brócoli, una licuadora y un gato ninja
repartidor de sushi.

**Proyecto totalmente independiente** del resto del repositorio: HTML + CSS +
JavaScript puro, sin dependencias, sin build, sin instalación.

---

## ▶️ Cómo jugar

Abre `index.html` con doble clic (funciona desde `file://`), o sirve la carpeta:

```bash
cd pixel-kombat
python3 -m http.server 8080   # y abre http://localhost:8080
```

Necesita teclado (no hay controles táctiles).

---

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
| **Burla** (+12% de barra) | `R` | `P` |

- **Bloquear**: mantén la dirección contraria al rival (en el suelo).
- `ESC` pausa · `M` silencia · `Enter` confirma en los menús.
- También puedes elegir personaje con el ratón.

## 📏 Reglas

- Al mejor de 3 asaltos, 60 segundos cada uno.
- Si se acaba el tiempo gana quien tenga más vida (empate = asalto nulo).
- La **barra de SUPER** sube al pegar y al recibir; se conserva a la mitad entre asaltos.
- El especial cuesta 30; el SUPER cuesta los 100.
- **Burlarse carga barra** (+12) pero te deja completamente vendido durante medio segundo.
  El comentarista lo comenta. El rival lo recuerda.

---

## 🧬 Tipos (sí, como en Pokémon, pero peor)

Cada luchador tiene un **tipo principal** que multiplica el daño y un **subtipo**
que no hace absolutamente nada y existe solo para el chiste.

| Tipo | Personaje | Le pega 40% más fuerte a | Porque |
|---|---|---|---|
| 💵 DINERO | Trumpo *(sub: ladrillo)* | 📶 SEÑAL, 🔌 ELECTRO | pagó el plan premium / lo compró al contado |
| 🩴 CHANCLA | Abuela *(sub: sopa)* | 💵 DINERO, 🍣 SUSHI, 🧘 ZEN | la chancla no acepta sobornos |
| 🧘 ZEN | Capi *(sub: roedor)* | 💵 DINERO, 🔌 ELECTRO | la felicidad no se compra |
| 🕊️ AÉREO | Palomo *(sub: chatarra)* | 🩴 CHANCLA, 🥦 FIBRA | la chancla no llega tan alto |
| 📶 SEÑAL | Don Router *(sub: ruido blanco)* | 🧘 ZEN, 🩴 CHANCLA | 17 notificaciones nuevas |
| 🥦 FIBRA | Brócoli Bob *(sub: ensalada)* | 🔌 ELECTRO, 💵 DINERO | atascó las aspas / la salud no se compra |
| 🔌 ELECTRO | Licuadora-Max *(sub: batido)* | 📶 SEÑAL, 🍣 SUSHI, 🕊️ AÉREO | interferencia del microondas |
| 🍣 SUSHI | Ninja Sushi Gato *(sub: sigilo)* | 🕊️ AÉREO, 🥦 FIBRA | el gato caza palomas |

La tabla es **simétrica**: si un tipo pega fuerte a otro, ese otro le hace un 30%
menos de daño. Al conectar un golpe con ventaja salta **¡SUPER EFECTIVO!** con el
chiste correspondiente; al revés sale *poco efectivo...* y una excusa
(«se perdió el paquete», «garantía extendida», «huesos huecos, no siente nada»).
Si el KO llega con ventaja de tipo, el remate es **¡REMATE SUPER EFECTIVO!**.

La pantalla **VS** te avisa del cruce antes de empezar, y la de **CONTROLES**
tiene la tabla completa.

### Otros detalles que suben el chiste
- **Comentarista**: una línea abajo que narra el desastre (arranque de asalto,
  vida baja, KO, burlas y ventajas de tipo).
- **La sopa de la abuela quema**: su SUPER deja al rival ardiendo un rato,
  perdiendo 1 de vida cada tanto y soltando un *¡AY!*.
- **El LAG del router** ralentiza de verdad al rival.
- La CPU se **burla sola** cuando va ganando por mucho, y se envalentona si
  tiene ventaja de tipo.

---

## 👥 El elenco

| Personaje | Especial | SUPER |
|---|---|---|
| **TRUMPO** — el magnate dorado | `MURO DE ORO`: levanta un muro que frena golpes y proyectiles | `LLUVIA DE BILLETES`: ráfaga de billetes |
| **ABUELA CHANCLETA** | `CHANCLA TELEDIRIGIDA`: proyectil que persigue | `SOPA HIRVIENDO`: oleada de sopa |
| **CAPI** — capibara zen | `AURA ZEN`: se cura y aguanta más | `ESTAMPIDA`: embestida de varios golpes |
| **PALOMO 3000** — paloma cibernética | `BOMBA GUANO`: proyectil en parábola | `PICOTAZO SUPERSÓNICO`: embestida aérea |
| **DON ROUTER** | `LAG`: ralentiza al rival | `DESCONEXIÓN TOTAL`: tres ondas gigantes |
| **BRÓCOLI BOB** | `FOTOSÍNTESIS`: se cura | `LLUVIA DE VERDURAS`: caen del cielo |
| **LICUADORA-MAX** | `TURBO LICUADO`: embestida giratoria | `BATIDO MORTAL`: cuchillas voladoras |
| **NINJA SUSHI GATO** | `SHURIKEN MAKI`: dos makis lanzados | `NUEVE VIDAS`: se teletransporta a la espalda |

> Todos los personajes son **parodias ficticias**. Cualquier parecido con la
> realidad es culpa de la realidad.

---

## 🗂️ Estructura

```
pixel-kombat/
├── index.html          # pantallas (menú, selección, VS, HUD, resultado)
├── css/style.css       # estilo arcade y HUD
└── js/
    ├── pixel.js        # utilidades de dibujo pixel (rejillas, rects, texto)
    ├── types.js        # tabla de tipos, multiplicadores y chistes de cada cruce
    ├── audio.js        # efectos de sonido sintetizados con WebAudio
    ├── roster.js       # los 8 personajes + arte de proyectiles
    ├── render.js       # dibujo paramétrico de luchadores y 4 escenarios
    ├── entities.js     # proyectiles, muros, partículas, avisos y "mundo"
    ├── fighter.js      # máquina de estados, golpes, bloqueo y daño
    ├── ai.js           # CPU por planes (acercarse, picar, bloquear, especial)
    └── game.js         # bucle a 60 fps, pantallas, rondas y HUD
```

Detalles técnicos: lienzo interno de **320×180** escalado con
`image-rendering: pixelated`; bucle de paso fijo a 60 fps con acumulador;
cuerpos dibujados por partes (piernas, torso, brazos) y cabezas como rejillas
de píxeles de 12×12 por personaje; sonido generado por osciladores (cero
archivos de audio); escenarios pintados por código.

Sin dependencias, sin red, sin analítica: todo corre en el navegador.
