# Ciudad Flotante — Diseño de sistemas

Valores iniciales de equilibrio. Todo el texto visible está en español. Tiempo: minutos de juego
(1 s real = 1 min). "h" = hora de juego.

---

## 1. Supervivencia del jugador (`needs.ts`, `actions.ts`) — área sim-survival

### Necesidades (0..100, ver `NEED_RATES` en `constants.ts`)
- **Hambre** −5,5/h; **sed** −8,5/h. Durmiendo, ambas a la mitad.
- **Energía** −4,6/h despierto. Durmiendo: cama +15/h, camilla de enfermería +15/h, suelo +8/h.
  Si llega a 0 el jugador se desmaya: duerme 3 h en el suelo donde esté (aviso de peligro).
- **Calor corporal**: tiende (30/h) a un objetivo según el entorno:
  `tEf = temperaturaAire + (interior ? 12 : 0) + (a ≤4 m de una cocina encendida ? 10 : 0)`
  `− (exterior ? 6·lluvia + 4·viento : 0) + (exterior y con abrigo ? 12·protección/0,6 : 0)`
  `objetivo = clamp(tEf·3,2 + 10, 0, 100)`. Interior = celda `indoor` del layout (habitación o bodega).
- **Salud**: daño por hambre 0 (−9/h), sed 0 (−12/h), calor < 20 (−7/h × (20−calor)/20),
  enfermedad (−3/h), energía 0 (−2/h). Regenera +2,5/h si hambre > 40, sed > 40, energía > 15,
  calor > 30 y sano; ×3 en camilla de enfermería. Fuego a < 1,5 m: −10/h.
- **Enfermedad**: `player.sick` = horas restantes (comida cruda 30 %, agua salada). Dura 18 h o
  hasta usar un botiquín.
- **Muerte**: salud ≤ 0 → `alive=false`, `deathCause` en texto, `bus.emit('playerDied')`, entrada de diario.
- **Avisos** (una vez al cruzar el umbral, se rearman al recuperarse): hambre < 25 y < 10,
  sed < 25 y < 10, energía < 20, calor < 30, salud < 30.

### Sueño
- `sleep(moduleId, bed)`: módulo activo con camas, cama libre o asignada al jugador (si es de un
  habitante presente: "Esa cama es de X"). Solo si energía < 80 o es de noche (≥ 21 h o < 5 h).
- Mientras duerme, el tiempo va ×14 (`Simulation.timeScale`).
- Despierta solo cuando energía ≥ 98 y son entre 6 y 20 h, o por una emergencia real: incendio a
  bordo, inicio de tormenta, sed/hambre críticas, salud en peligro o un golpe que hiera. Un evento
  puede forzarlo con `data.wakePlayer`. Lo demás (avistamientos, averías leves, fugas…) se anota y se
  resume al despertar: «Mientras dormías: …».
- Las camillas de la enfermería solo curan ×3 (y la enfermedad ×2) si la enfermería tiene energía
  (`isHealingBedPowered`); si no, son camas normales.

### Objetos (`useItem`)
- Comida/bebida/medicina: aplica `consume` (limitar 0..100), enfermedad por probabilidad,
  `cures`, deja `leaves`. Mensaje "Comes Pescado asado".
- Planos: desbloquean `unlocks`, se consumen, `bus.emit('unlocked')` + diario.
- Ropa: se equipa (`player.clothing`), intercambia con la que hubiera.
- Herramientas: no se consumen ("Selecciónala en la barra rápida").
- `moveItem`: la ranura de combustible solo acepta objetos con `fuel`; no se mete nada en obras.
- `takeAll`, `dropItem` (caja a los pies), `drinkFromTank` (1 L → sed +40), `fillBottle` (1 L → 1 Botella).

---

## 2. Clima (`weather.ts`) — sim-survival

- Estados: despejado (240–600 min), nublado (180–420), lluvia (90–240), tormenta (90–180),
  niebla (120–300). El siguiente se elige con los pesos de la región (sin dos tormentas seguidas).
- Parámetros que se suavizan hacia el objetivo (≈ 1/30 por min):

| clima | nubes | lluvia | niebla | viento | ola (m) |
|---|---|---|---|---|---|
| despejado | 0,15 | 0 | 0 | 0,3 | 0,6 |
| nublado | 0,7 | 0 | 0,1 | 0,45 | 0,9 |
| lluvia | 0,9 | 0,7 | 0,2 | 0,55 | 1,2 |
| tormenta | 1 | 1 | 0,3 | 1 | 2,6 |
| niebla | 0,6 | 0 | 0,85 | 0,15 | 0,5 |

- Temperatura: `base región + 5·clamp(sunElevation, −1, 1) − 4·lluvia − 3·viento`.
- Aviso de barómetro 60–90 min antes de una tormenta (una vez).
- Relámpagos en tormenta: probabilidad 0,15/min → `lightning = 0,4` y `sfx 'trueno'`.

## 3. Viaje (`voyage.ts`) — sim-survival

- Velocidad: 0 si fondeado; si no `CRUISE_SPEED × región.speedMult + motor activo con energía (+3)`.
- Distancia en millas: `velocidad × dt/60`.
- A 10 millas del final de la región: `nextChoices = región.next` y aviso "elige rumbo en el timón".
  Antes de 6 días jugados no se ofrecen regiones de peligro ≥ 4 si hay alternativa; el piloto
  automático elige la menos peligrosa al principio y sigue la corriente después.
  Al llegar: entra en `chosenNext ?? nextChoices[0]`, diario "Entramos en …" con descripción.
- Fondeo: `anchoredUntil` → al pasar, "Levamos anclas".
- Avistamientos (`voyage.sightings`, los crea events.ts): avanzan hacia popa a
  `VISUAL_DRIFT × velocidad/6` m/min y desaparecen al caducar.

## 4. Tutorial (`tutorial.ts`) — sim-survival

Pasos (de uno en uno, sin bloquear, ≥ 20 min de juego entre pasos; se marcan con `markTutorial`). No son
estrictamente secuenciales: cada paso tiene un «tiene sentido ahora» y un «es oportuno ahora» (dormir de
noche, el timón con una decisión pendiente, reparar si hay daños, comer o beber si falta) y los oportunos
van primero. Los textos describen acciones físicas, no menús.

| id | texto | se completa |
|---|---|---|
| mover | WASD para moverte, Mayús para correr, Espacio para saltar. | el jugador se aleja 5 m |
| gancho | Selecciona el gancho (1) y haz clic sobre los restos que flotan junto al barco. | `collectDebris` |
| comer | Abre el inventario (Tab) y come o bebe algo. | `useItem` de comida/bebida |
| almacen | Guarda lo que no necesites en el almacén (E sobre las estanterías). | mover objetos a un almacén |
| fabricar | En el banco de trabajo puedes fabricar herramientas: prueba con una caña. | cualquier fabricación |
| pescar | Con la caña, desde la borda: clic para lanzar y clic cuando pique. | `catchFish` |
| cocinar | Cocina el pescado en la cocina (necesita leña). | termina un trabajo de cocina |
| beber | Bebe del depósito de la bodega o rellena botellas allí. | `drinkFromTank` o `fillBottle` |
| dormir | Por la noche, duerme en tu camarote para recuperar energía. | `sleep` |
| construir | Pulsa B para el modo construcción: amplía el barco. | `placeModule` |
| plantar | Construye un huerto y planta semillas: necesitan agua de los depósitos. | `plant` |
| timon | Sube al puente: en el timón decides el rumbo y respondes a los avistamientos. | `chooseRoute` o `eventChoice` |
| reparar | Las tormentas y averías dañan el barco: repara con martillo + kit o llave + pieza. | `repair` |

## 5. Guardado (`save.ts`) — sim-survival

- Ranuras: `auto`, `manual`, `manual2`, `manual3`. Clave `ciudad-flotante:save:<ranura>` con
  `{ meta: SaveSlotInfo, state }`. `list()` lee solo `meta`.
- `deserialize`: valida y **rellena campos ausentes** con los de `createNewGame` (fusión profunda),
  aplica migraciones por `version`. Errores claros si está dañado.
- Gestiona errores de cuota.

---

## 6. Energía y agua (`utilities.ts`) — sim-economy

- **Generador**: si está encendido, activo y hay demanda o batería por llenar, quema combustible
  de su ranura (`fuelBurn` minutos; madera 40, bidón 360). Produce 5 kW (×0,7 si condición < 50).
- **Panel solar**: 1,6 kW × luz diurna × (1 − 0,65·nubes) × factor de condición.
- La enfermería solo consume 0,3 kW con alguien en una camilla. Una batería averiada conserva su
  carga pero no carga ni descarga hasta repararla.
- **Demanda**: taller (1,5 kW, solo con cola), potabilizadora (2 kW, si el agua no está llena),
  enfermería (0,3 kW), motor (4 kW, encendido y navegando), huerto interior con lámparas
  (0,15 kW por parcela creciendo, requiere `invernadero`).
- **Baterías**: 25 kWh cada una; cargan con el excedente y descargan (≤ 10 kW por batería).
- `satisfaction = min(1, (generación + descarga disponible) / demanda)`; `powered = satisfaction > 0,5`
  para cada consumidor activo y encendido. Las estaciones trabajan a velocidad × satisfaction.
- **Agua**: capacidad = depósitos (120 L) + colectores (20 L). Entradas: colector 10 L/h × lluvia
  (solo a cielo abierto), potabilizadora 18 L/h × satisfaction. Pérdidas: fuga 6 L/h, depósito
  dañado (< 50) 1 L/h. (Valores actuales: potabilizadora 10 L/h.) Consumo de huertos/habitantes lo restan sus sistemas. Límite 0..capacidad.
- `togglePower` enciende/apaga generadores y consumidores.

## 7. Estaciones y cultivos (`stations.ts`) — sim-economy

- Estación por tipo: `banco_trabajo`→banco, `taller`→taller, `cocina`→cocina; `null`→mano.
- Pago de ingredientes: **inventario del jugador y luego almacenes y bandejas** (`payInventories`).
- `queueCraft`: consume al encolar, máximo 8 trabajos. La cocina avisa si no hay combustible.
- `tickStations`: el primer trabajo avanza `dt × velocidad` (banco siempre; taller con energía;
  cocina quemando combustible de su ranura). Al terminar, los productos van a la bandeja de la
  estación → si no caben, al almacén → si no, a una caja. Aviso "Pescado asado listo en la cocina".
- `cancelCraft` devuelve los ingredientes al jugador.
- Los encargos del jugador van delante de los de habitantes (`by: 'npc'`), que conservan su avance.
- Las cajas se dejan siempre en un punto transitable (`safeDropPoint`): nunca en un hueco de escalera,
  una rampa ni dentro de un mueble.
- **Huerto**: con luz (a cielo abierto: ritmo completo de día y 30 % de noche; interior: solo con
  `invernadero` y energía). Consume agua de la red (`waterPerHour`); sin agua acumula `dryHours`
  y muere al llegar a `dryHoursToDie`. Con plaga no crece. Madura con `growth ≥ 1`.
- `plant` (semilla del inventario del jugador), `harvest` (cosecha + semillas al jugador),
  `tendPlot` (retira plantas muertas o la plaga).

## 8. Construcción y reparación (`construction.ts`) — sim-economy

- `checkPlace` = `checkPlacement` + `missing` (coste contra `payInventories`). Si falta algo,
  `ok=false` y `reason = "Faltan: 3× Madera"`. Un huerto sin cielo abierto necesita el plano de
  lámparas de cultivo.
- Validación fina (`src/sim/reach.ts`): ninguna pieza puede dejar sin acceso una habitación, un mueble
  interactivo o una escalera que antes lo tenía (recorrido de la rejilla con el radio del jugador).
- `placeModule`: paga, crea la obra (`status='construction'`), `sim.shipChanged()`.
- Obras: `progreso += dt / buildTime × (1 + 0,75 × habitantes ayudando)`; el jugador con martillo
  (`helpBuild`) cuenta como ×2 mientras ayuda. Al terminar: activo, `shipChanged()`, diario.
- `checkDemolishModule` / `demolish`: reembolso 100 % si está en obra, 50 % si no; contenido +
  reembolso a una caja en el centro del módulo; libera camas; despierta al jugador si dormía ahí.
- Ampliación del casco: `HULL_EXPANSION` (plano `casco`, +2 celdas por proa, máx. 18). Coste base
  × (1 + ampliaciones hechas); `cancelExpansion` devuelve lo pagado.
- Al terminar o desmontar, jugador, habitantes y cajas mal situados pasan al punto transitable más
  cercano (nadie cae a la bodega al terminar una escalera).
- `checkDemolishModule` también informa del agua y la carga que se perderían (`losses`). Obra
  especial `ship.expansion`; `helpBuild(-1, …)` ayuda en ella.
- Desgaste: máquinas funcionando pierden 1 de condición cada 8 h según su carga; a 0 → averiadas ("Desgaste").
- Si falta el repuesto, el motivo dice dónde conseguirlo. La pieza mecánica también se improvisa en el
  banco de trabajo (más cara), así que una avería nunca bloquea su propia reparación.
- `repairInfo` / `repair`: máquinas (`def.machine`) → llave inglesa + pieza mecánica; estructuras →
  martillo + kit de reparación. Restaura condición 100, quita avería y fuga. No con fuego activo.

---

## 9. Restos, pesca y cubo (`debris.ts`) — sim-life

- Aparecen por delante de la proa (x ≈ proa + 60 m), a 3–26 m del costado, a razón de
  `región.debrisPerHour`; derivan hacia popa a `VISUAL_DRIFT × velocidad/6` (casi quietos si se
  está fondeado). Máx. 14. Botín tirado al aparecer (`DEBRIS_LOOT`). Se eliminan tras la popa.
- `collectDebris`: comprueba distancia generosa (≤ `HOOK_RANGE` + 6 m), da el botín (cajas si no
  cabe), estadística, tutorial. Las balsas con náufragos los suben a bordo.
- `fishBiteDelay`: 8–22 s ÷ `región.fishMult` (÷2,5 con banco de peces).
- `catchFish`: 85 % pescado (20 % dos), 6 % chatarra, 4 % tela, 3 % conserva, 2 % cuerda.
- `fillBucket`: cubo → cubo de agua de mar.

## 10. Eventos (`events.ts`) — sim-life

Director: cada 150–300 min tira dados con los pesos de la región (con enfriamientos por tipo y
condiciones previas). El día mínimo de cada tipo se cuenta en horas jugadas, así que la primera noche
no hay crisis; con el jugador dormido no hay avistamientos. Guion inicial garantizado:
- Día 1, 13:00 → **naufragio** con el primer plano pendiente (`BLUEPRINT_ORDER`).
- Día 2, 10:00 → **náufragos** (balsa con 1 superviviente).
- Día 3, 11:00 → **mercante**. Día 4, 10:00 → **isla**. Día 5, 16:00 → **naufragio** con el siguiente plano.
Los avistamientos del guion esperan a que el jugador despierte.

Tipos (todos con título, descripción, objetivos y entrada de diario; `worldEventStarted/Ended`):
1. **tormenta** — se crea cuando `weather.kind` pasa a tormenta. El daño escala con el tiempo jugado
   (× min(1,5; 0,5 + días/10)). La fase de daños dura como mucho 12 h (si vence, fracaso). Cada hora, cada módulo expuesto
   (cielo abierto o habitación en nivel ≥ 1) tiene 25 % × (ola/2,6) de perder 10–30 de condición;
   los depósitos pueden empezar a perder agua (30 %); un rayo puede incendiar un módulo del nivel
   superior (2 %/h). Al terminar: fase de daños hasta reparar lo que quede < 50 (o 12 h).
2. **naufragio** — avistamiento. Opciones en el timón: "Detenerse a rescatar (1 h)" → fondeo 60 min
   y 5–8 restos ricos alrededor (cofre con plano en el guion; 15 % al azar) / "Seguir rumbo". Caduca en
   120 min. Al rescatarlo todo se leva el ancla.
3. **isla** — avistamiento. "Fondear y enviar una expedición (3 h)" (requiere un habitante
   disponible) → 1–2 habitantes fuera; al volver: madera, fruta, fibra, semillas, 25 % plano,
   15 % nuevo habitante, 10 % herido. Alternativa: seguir rumbo.
4. **náufragos** — balsa (`debris` 'balsa') con 1–2 supervivientes; objetivo "Lanza el gancho a la
   balsa". "Echar el ancla (45 min)" hace que remen hasta ≤ 15 m de la borda. Si pasa de largo: fracaso.
5. **avería** — una máquina activa se avería (llave + pieza). Sin máquinas: un daño estructural (35).
   Nunca el taller, la única fuente de energía ni el banco sin repuesto a bordo. Objetivos por pasos;
   a las 24 h el mecánico hace un apaño (máquina al 40 %, fracaso parcial).
6. **incendio** — en la cocina (si tiene fuego), el generador (si funciona) u otra habitación.
   Empieza al 40 %, crece 9/h, quema condición y contenido, se propaga a vecinos si > 60. El jugador
   apaga −35 por cubo; los habitantes (máx. 2) −20 por cubo que llenan en la borda, o 0,8/min sin cubo.
7. **banco de peces** — 120 min de pesca rápida.
8. **mercante** — barco junto al costado 120 min; 4 ofertas de `TRADE_OFFERS` (cada una una vez).
9. **plaga** — 1–3 parcelas con plaga; si no se retira en 24 h, mueren.
10. **fuga** — un depósito pierde agua hasta repararlo.
11. **enfermedad** — un habitante enferma; solo se cura con tratamiento (botiquín, enfermería ~4 h o
    guardar cama ~12 h). Pierde 2,5 de salud/h (1/h en cama) y puede contagiar (3 %/h). Fracaso si muere
    o baja de 40 de salud.
12. **discusión** — dos habitantes con ánimo < 45 discuten; hablar con uno para mediar.
13. **estructura** — plataforma/faro misterioso (desde el día 6): expedición de 2 h con componentes y
    plano al 50 %.

Además: la tormenta lanza golpes de mar (6–12 de daño al jugador en cubierta abierta, heridas a
habitantes a la intemperie); la avería estructural pierde 0,8 de condición por hora y metro de ola
hasta repararse; una discusión resta 3 de ánimo al resto; el director reduce a ×0,35 el peso del
último tipo de evento para dar variedad.

`eventChoice`, `trade`, `extinguish` (requiere cubo de agua de mar; lo devuelve vacío).

## 11. Habitantes (`npc.ts`) — sim-life

- Necesidades: hambre −5/h (× rasgo), sed −7/h, energía −4,5/h; dormir +14/h (cama) / +8 (suelo).
  Salud −6/h con hambre o sed a 0, −2/h enfermos. Mueren a 0 (diario, ánimo −20 al resto).
- Ánimo tiende (4/h) a `60 + rasgo + cama (camarote +10, dormitorio +4, sin cama −15) + comida
  cocinada reciente (+8) + comedor (+5) − tormenta (10 × miedo) − hambre/sed < 30 (−15 c/u)
  − enfermo/herido (−10) + charla reciente (+5)`.
- Prioridades (se reevalúan cada ~10 min o al acabar la tarea):
  1. expedición; 2. incendio (van a apagarlo: −5/min cada uno); 3. tormenta y a la intemperie →
  a cubierto; 4. dormir (22–6 h, o energía < 15) en su cama (sin cama, en un interior);
  5. comer (hambre < 40, o en las comidas 8/14/20 h con < 75): toman comida de los almacenes
  (guiso > sopa > asado > conserva > fruta > hortaliza > crudo) y comen en una mesa 20 min;
  6. beber (sed < 45) en un depósito (1 L); 7. trabajar (8–20 h) según el puesto;
  8. ocio: pasear por cubierta, charlar (bocadillos), sentarse.
- Puestos: **cocinero** (cocina con lo que hay en los almacenes y repone leña), **jardinero**
  (siembra, cosecha, retira plagas), **mecánico** (repara con repuestos del almacén, recarga el
  generador, ayuda en obras), **pescador** (pesca desde la borda, 1 pez/45–75 min), **recolector**
  (gancho: rescata el resto más cercano cada 20–40 min), **libre** (ayuda en obras / ocio).
  Los habitantes pagan con los **almacenes**, nunca con el inventario del jugador.
- Movimiento: rutas con `sim.nav.findPath`, 1,4 m/min de juego; `yaw = atan2(−dx, −dz)`.
- Camas: asignación automática a camas libres (camarote primero).
- Diálogo (`talkTo`): saludo según ánimo, qué hace, quejas (hambre, sin cama, enfermo), petición.
  Opciones: mediar, curar (botiquín), cambiar de puesto (`setRole`), dar objeto (`giveItem`).
- Nuevos habitantes (`spawnSurvivor`): nombre libre de `NPC_NAMES`, rasgo y aspecto aleatorios.
- Prioridades vitales: si están agotados pero tienen sed o hambre urgentes y algo con qué saciarlas,
  primero beben o comen. Solo usan fuentes alcanzables: si no llegan a la comida preferida pasan a la
  siguiente, y la queja dice «No llego…». Quien cocina trabaja a un lado del fogón y deja sitio al
  jugador. Rasgo y puesto concuerdan con el género del nombre.
- Supervivencia autónoma: pescan de relleno si quedan menos de 3 raciones por habitante (también
  fuera de horario si hay escasez); asan el pescado crudo en el fogón antes de comerlo; si los
  depósitos se secan, llenan un cubo en la borda y destilan en la cocina (fabrican el cubo si falta);
  comen y beben de las cajas sueltas y las ordenan en el almacén; con los almacenes llenos dejan de
  pescar y de rescatar y lo avisan.
- Balsas: el habitante despierto más cercano da la voz de alarma; si la balsa se escapa, la rescata
  el recolector, quien no tiene puesto o un habitante valiente.
- Salud: aviso en el diario cuando alguien está grave (< 35); la enfermedad solo se cura con
  tratamiento (ver §10); regeneración 2/h. Los factores del ánimo son consultables
  (`npcMoodFactors`) y el diálogo explica lo que más pesa.

---

## 12. Presentación

### Mundo (`Renderer`) — render-world
Océano low-poly con olas de Gerstner (la misma función en CPU para `waterHeight`), espuma en
crestas, estela, desplazamiento según la velocidad; cielo con gradiente por hora y región, sol,
luna, estrellas, nubes low-poly; niebla; lluvia y relámpagos; balanceo del barco (`shipRoot`)
según el oleaje; avistamientos (naufragio, isla, mercante, estructura); calidad baja/media/alta.

### Barco (`ShipView`, `NpcView`, `PlayerAvatar`, `DebrisView`) — render-ship
Casco procedural con proa y popa, cubiertas de tablones, paredes con puertas y ventanas,
barandillas, escaleras, techos, todos los props, plantas según crecimiento, fuego, humo de
averías, obras con andamios, cajas sueltas, luces interiores nocturnas (pool de luces),
resaltado del objetivo y vista en corte. Personajes low-poly animados con bocadillos.

### Control e interacción — game-player
Primera persona por defecto (V cambia a tercera), carrera, salto, cabeceo suave; E interactúa
(paneles, dormir, hablar), clic usa la herramienta (gancho, caña, cubo, martillo), R repara,
clic derecho o F usa el consumible seleccionado. Modelo en mano en primera persona.

### Interfaz — ui
HUD discreto, barra rápida, avisos, paneles de inventario/fabricación/diario/estado del barco,
estaciones, almacenes, cajas, habitantes, timón (rumbo y avistamientos), comercio, menús principal,
de pausa y de muerte, ajustes, tutorial no intrusivo, iconos SVG propios.

### Construcción — build-mode
Vista exterior orbital, selector de nivel con corte, paleta con costes y bloqueos, fantasma con
validación y motivo, rotación (R), demolición con confirmación, ampliación del casco.

### Audio — audio
Ambiente de mar, viento, lluvia, truenos, crujidos, efectos de herramientas y UI; procedural.

### Efectos de sonido por bus (`sfx`)
- Simulación: interruptor, encargo, fabricar, fabricado, cocinado, plantar, cosechar, cuidar,
  obra_iniciada, obra_terminada, demoler, reparar, averia, trueno, comer, beber, curar, plano,
  equipar, dormir, despertar, desmayo, soltar, llenar.
- Jugador: paso, salto, aterrizar, aterrizar_fuerte, gancho_impulso, gancho, chapoteo,
  chapoteo_corcho, tirar_cabo, recoger, cana, picada, carrete, escapado, martillo, llave, agua_fuego.
  `toolUsed.tool` ∈ gancho | cana | cubo | cubo_agua | martillo | llave.
- Interfaz y construcción: ui_abrir, ui_cerrar, ui_clic, ui_click, ui_error, ui_mover.

---

## 13. Mejoras de instalaciones (GDD §7)

- Cada módulo mejorable tiene niveles (`ModuleDef.upgrades`, hasta nivel 3) con coste, tiempo de obra
  y efectos (`ModuleEffects`): capacidades (`storageSlots`, `waterCapacity`, `batteryKWh`…),
  producciones (`waterGen`, `powerGen`), confort y multiplicadores (`workSpeed`, `fuelEfficiency`,
  `growthMult`, `waterUseMult`, `healMult`, `wearMult`).
- Todos los sistemas leen los valores efectivos con `moduleStat` / `moduleMult` (`src/sim/moduleStats.ts`).
- La mejora se encarga en el modo construcción (herramienta Mejorar, U): se paga al empezar, el módulo
  sigue funcionando con su nivel actual mientras dura la obra (`module.upgrade`), los habitantes libres
  y el martillo del jugador ayudan, y al terminar sube `module.tier` (inventarios ampliados).

| Módulo | Nivel 2 | Nivel 3 |
|---|---|---|
| Almacén | 32 huecos | 48 huecos |
| Depósito | 220 L | 340 L |
| Generador | 8 kW, combustible ×1,3 | 11 kW, ×1,6 |
| Huerto | agua ×0,6, crecimiento ×1,2 | crecimiento ×1,5 |
| Cocina | ×1,5 velocidad y leña, 18 huecos | — |
| Taller | ×1,6 velocidad, desgaste ×0,7 | — |
| Banco | ×1,5 velocidad, 10 huecos | — |
| Camarote / dormitorio / comedor / sala común | más confort | — |
| Colector, potabilizadora, batería, panel, enfermería, motor, ahumadero, vivero, grúa | una mejora cada uno | — |

## 14. Módulos especializados (GDD §13, prioridad futura)

- **Sala común** (vivienda): confort 4; los habitantes pasan allí su ocio y mejora su ánimo y su
  relación.
- **Ahumadero** (cubierta, cielo abierto): receta «Ahumar pescado» (3 crudos + 1 madera → 3 ahumados
  en 90 min). El pescado ahumado alimenta bien y no hay que cocinarlo.
- **Vivero de peces** (plano de acuicultura): con energía produce pescado en su bandeja cada 150 min.
- **Grúa de rescate** (plano, junto a la borda): con energía rescata sola el resto más cercano de su
  costado a ≤ 30 m cada 25 min (también balsas de náufragos). Automatización.
- **Radar y radio** (plano, cubierta superior): con energía, avistamientos antes y durante más tiempo,
  aviso de tormenta 3 h antes y mensajes de radio de otros barcos en el diario.

## 15. Hilo narrativo: el cuaderno del Albatros (GDD §13: misterios del mundo)

- Siete páginas del cuaderno de la capitana Elena Duarte (`src/data/story.ts`). La primera está en la
  mochila al empezar (la encontraste en la carta náutica). Las demás aparecen en cofres de naufragio,
  estructuras, expediciones y mercantes, preferentemente en su región y en orden.
- Leer una página (F o clic derecho) la guarda en el Cuaderno del Diario. Con cinco páginas se conoce
  el rumbo a **Puerto Esperanza**, que aparece como opción en el timón al final de cualquier región.
- Al llegar: celebración, pantalla de llegada con el epílogo y las estadísticas de la travesía, dos
  habitantes nuevos y un gran mercado. Después se puede seguir navegando.

## 16. Relaciones entre habitantes (GDD §13)

- Afinidad −100..100 por pareja (`npc.relations`): charlar y compartir mesa o sala común la sube;
  discutir la baja. Amistad (≥ 40): ánimo al estar juntos y más pena si el otro muere. Rivalidad
  (≤ −40): ánimo negativo y más discusiones entre esos dos. La ficha del habitante las muestra.
