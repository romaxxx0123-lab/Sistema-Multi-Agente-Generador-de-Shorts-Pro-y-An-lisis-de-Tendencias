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

- **Bloquear**: mantén la dirección contraria al rival (en el suelo).
- `ESC` pausa · `M` silencia · `Enter` confirma en los menús.
- También puedes elegir personaje con el ratón.

## 📏 Reglas

- Al mejor de 3 asaltos, 60 segundos cada uno.
- Si se acaba el tiempo gana quien tenga más vida (empate = asalto nulo).
- La **barra de SUPER** sube al pegar y al recibir; se conserva a la mitad entre asaltos.
- El especial cuesta 30; el SUPER cuesta los 100.

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
