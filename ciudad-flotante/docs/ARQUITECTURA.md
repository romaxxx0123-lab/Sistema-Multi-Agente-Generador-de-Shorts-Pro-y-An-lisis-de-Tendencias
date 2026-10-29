# Ciudad Flotante — Arquitectura técnica

Documento de referencia para desarrollar y ampliar el juego. El diseño de juego está en
[GDD.md](GDD.md) y el diseño detallado de cada sistema en [SISTEMAS.md](SISTEMAS.md).

## 1. Decisiones técnicas

| Tema | Decisión | Motivo |
|---|---|---|
| Plataforma | Navegador de escritorio (WebGL2) | Se juega sin instalar nada; adaptable a escritorio con Electron/Tauri más adelante. |
| Motor | Three.js 0.186 + TypeScript estricto + Vite 7 | Control total, build rápido, sin dependencias pesadas. |
| Estilo | Low-poly con sombreado plano, colores de `src/render/palette.ts` | Coherencia visual y rendimiento. |
| Simulación | Pura (sin three.js ni DOM), determinista (RNG con estado guardado) | Testeable con Vitest, guardado fiable, ampliable. |
| Mundo | Cuadrícula de celdas de 4 m × 3 niveles, módulos rectangulares | Construcción clara, validación robusta, geometría generada. |
| Física | Propia y simple: superficies por celda + AABBs | Suficiente para un barco; sin motor físico externo. |
| IA | Necesidades + utilidad + máquina de estados; A* en rejilla fina de 0,5 m | Habitantes coherentes con coste bajo. |
| Guardado | JSON del `GameState` en `localStorage`, con versión y migración | Simple y transparente. |
| Audio | WebAudio procedural | Sin ficheros de audio que descargar. |

## 2. Capas y flujo de datos

```
            ┌──────────── src/sim (puro) ─────────────┐
 input ───► │ Simulation (fachada de comandos)        │ ──► EventBus (notify, shipChanged, sfx…)
            │  GameState  ← sistemas: weather, voyage,│
            │  utilities, stations, construction,     │
            │  needs, npc, debris, events, tutorial    │
            │  Geometría derivada: layout, nav, física │
            └──────────────────────────────────────────┘
                    ▲ comandos            │ lectura de estado
                    │                     ▼
  src/game: Game (bucle, modos) · PlayerController · Interaction · tools
  src/render: Renderer (cielo, mar, clima) · ShipView · NpcView · DebrisView · PlayerAvatar
  src/ui: UI (HUD, paneles, menús) · src/build: BuildMode · src/audio: Audio
```

Reglas:
1. **La simulación es la única dueña del estado.** La UI y los controladores leen `ctx.sim.state`
   y cambian el estado solo mediante comandos de `Simulation` (devuelven `ActionResult`).
   Excepción: `PlayerController` escribe `player.pos/yaw/pitch` (la física del jugador es de presentación).
2. **Nada de `Math.random` en `src/sim`**: usar `sim.rng`.
3. **Unidades**: tiempo en minutos de juego (1 s real = 1 min de juego; ×14 durmiendo),
   metros en coordenadas locales del barco (x proa, z manga, y arriba).
4. **El barco está en el origen**: el mar se desplaza. `shipRoot` (balanceo) contiene todo lo
   que vive a bordo; `worldRoot` contiene lo que flota (restos, avistamientos).
5. **Geometría derivada**: `sim.layout` (paredes, puertas, rampas, props, colisionadores),
   `sim.nav` y `sim.collision` se recalculan cuando cambia `ship.revision` (llamar `sim.shipChanged()`).
6. **Nunca se pierden objetos**: inventario lleno o demolición → `spawnCrate` (cajas sueltas).

## 3. Contratos clave

- `src/sim/types.ts` — todo el estado serializable.
- `src/sim/Simulation.ts` — comandos públicos y orden del `tick`.
- `src/sim/ship.ts` — coordenadas, rotaciones, layout, validación de construcción.
- `src/sim/physics.ts` / `src/sim/nav.ts` — física del jugador y navegación de habitantes.
- `src/game/context.ts` — `GameContext` que reciben controladores, UI, construcción y audio.
- `src/game/types.ts` — paneles, avisos, resaltado, ajustes.
- `src/core/EventBus.ts` — eventos de presentación.

Convención de orientación (three.js): `yaw` = `rotation.y`; adelante = `(-sin yaw, 0, -cos yaw)`.
Props: el frente del modelo mira a -z local con `rot = 0`; el eje largo va en x local.

## 4. Riesgos técnicos identificados y mitigación

| Riesgo | Mitigación |
|---|---|
| Rendimiento con barcos grandes (muchas paredes y props) | Geometría estática fusionada por material y nivel; reconstrucción solo al cambiar la distribución; pool limitado de luces puntuales. |
| Geometría generada incoherente (paredes dobles, puertas tapadas) | Una sola función (`computeLayout`) define paredes/puertas/rampas para física, IA y render; tests. |
| Construcciones que aíslan zonas | Validación de conectividad antes de construir y de demoler (`checkPlacement`, `checkDemolish`). |
| Personaje atravesando paredes o cayendo al mar | Colisión círculo-AABB con subpasos; barandillas con colisión alta; red de seguridad de reaparición. |
| Habitantes atascados | Rejilla fina con radio de agente, enlaces de escalera explícitos, replanificación y tareas con tiempo límite. |
| Guardados rotos al ampliar el juego | `version` + migración, relleno de campos que falten con valores por defecto. |
| Demasiados sistemas a la vez | Secuencia por fases con tests y pruebas en navegador real (Playwright) en cada paso. |
| Simulación costosa al dormir (×14) | Pasos de 0,5 min; IA con decisiones espaciadas; rutas cacheadas. |

## 5. Secuencia de desarrollo

1. **Base** (hecho): tipos, datos, modelo del barco, física, navegación, fachada, bucle, stubs, tests.
2. **Sistemas en paralelo** por archivos disjuntos (ver §6), cada uno con tests y capturas.
3. **Integración**: partida completa jugable de principio a fin, corrección de fallos.
4. **Pulido**: equilibrio, rendimiento, tutorial, accesibilidad, textos.
5. **Ampliaciones futuras** (GDD §13): biomas nuevos, relaciones entre habitantes, más módulos.

## 6. Reparto de archivos

| Área | Archivos |
|---|---|
| sim-survival | `src/sim/actions.ts`, `needs.ts`, `weather.ts`, `voyage.ts`, `tutorial.ts`, `save.ts`, `tests/survival.test.ts` |
| sim-economy | `src/sim/stations.ts`, `utilities.ts`, `construction.ts`, `tests/economy.test.ts` |
| sim-life | `src/sim/npc.ts`, `events.ts`, `debris.ts`, `tests/life.test.ts` |
| render-world | `src/render/Renderer.ts`, `src/render/world/**` |
| render-ship | `src/render/ShipView.ts`, `NpcView.ts`, `PlayerAvatar.ts`, `DebrisView.ts`, `src/render/ship/**` |
| game-player | `src/game/PlayerController.ts`, `Interaction.ts`, `src/game/tools/**` |
| ui | `src/ui/**` (salvo `base.css`, compartido) |
| build-mode | `src/build/**` |
| audio | `src/audio/**` |
| núcleo (integración) | `src/core/**`, `src/data/**`, `src/sim/{types,constants,ship,physics,nav,inventory,helpers,time,newGame,Simulation}.ts`, `src/game/{Game,context,types,Input,debug}.ts`, `src/main.ts`, `src/ui/base.css` |

## 7. Pruebas

- `npm test` — tests de simulación (Vitest).
- `npm run typecheck` — TypeScript estricto.
- `node scripts/shot.mjs …` — arranca el juego en Chromium headless (WebGL por software),
  ejecuta pasos con la API de depuración `window.__game` y guarda capturas. Falla si hay errores en consola.

API de depuración (`window.__game`): `state`, `sim`, `ctx` y `cmd.*`. Cada módulo registra los suyos
con `registerDebug(nombre, fn)` (`src/game/debug.ts`); `Object.keys(__game.cmd)` los lista.

| Área | Comandos |
|---|---|
| Núcleo | `give(id, n)`, `giveAll()`, `unlockAll()`, `setHour(h)`, `teleport(x,y,z)`, `look(yaw,pitch)`, `advance(min)`, `step(frames, dt)`, `key(code, down)`, `mouse(dx, dy)`, `mode(m)`, `newGame(seed)`, `weather(clima, min)`, `route(región)`, `event(tipo)`, `fire(moduleId)`, `survivor()` |
| Jugador | `jugador()` (posición, objetivo, aviso, resaltado, herramientas, últimos avisos), `herramienta(id)`, `resto(tipo, dist, dx, supervivientes)`, `mirarA(x,y,z)`, `mirarResto(id)`, `pulsar(code, frames)`, `picarYa()` |
| Mundo | `vista(px,py,pz,tx,ty,tz,fov)` (cámara libre; sin argumentos vuelve a la del juego), `clima(tipo)` (aspecto instantáneo), `avistamiento(tipo,x,dist,lado,nombre)`, `mundo()`, `delfines(dist)`, `peces(on)`, `decorado()` |
| Construcción | `buildInfo()`, `buildLevel(l)`, `buildSelect(tipo)`, `buildRotate(n)`, `buildDemolish(on)`, `buildCategory(c)`, `buildView(yaw,pitch,dist,tx,tz)`, `buildCellToScreen(nivel,x,z)`, `buildModuleToScreen(id,altura)`, `buildExpand()`, `buildConfirm()` |
| Interfaz | `uiScreen()`, `uiMenu(sub)` |
| Audio | `audio()`, `audioMeter()`, `audioPlay(nombre)`, `audioUnlock()`, `audioTest()` (síntesis offline) |

Parámetros de URL: `?autostart` (partida nueva directa), `seed=N`, `quality=baja|media|alta`.
