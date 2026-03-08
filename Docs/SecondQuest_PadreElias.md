# Segunda Misión: "El rincón del peregrino" (Iteración 10)

## Descripción General
Esta es la segunda misión corta del juego, diseñada para mantener el tono contemplativo, reverente e íntimo. Fue concebida para no usar mecánicas de combate ni inventarios pesados, y se enfoca en el servicio y la hospitalidad hacia un peregrino exhausto.

## Flujo Completo de la Misión (`quest_pilgrim_rest`)
La misión es entregada por **Padre Elías** *después* de que se ha completado "Preparar la capilla" y se ha hablado con él una vez. Consta de las siguientes Fases gestionadas por `QuestManager`:

1. **Fase 0 (Limpiar el rincón):**
   - El jugador debe interactuar con un banco de piedra frío.
   - Componente: `RestBenchInteractable.cs`.
   - Activa el flag: `env_rest_corner_prepared`.
2. **Fase 1 (Colocar la manta):**
   - El jugador coloca una manta doblada sobre el banco preparado.
   - Componente: `PilgrimBlanketInteractable.cs`.
   - Activa el flag: `env_pilgrim_blanket_placed`.
3. **Fase 2 (Dejar agua fresca):**
   - El jugador sirve agua cerca del banco.
   - Componente: `WaterBowlInteractable.cs`.
   - Activa el flag: `env_pilgrim_water_brought`.
4. **Fase 3 (Ofrecer consuelo):**
   - El jugador se acerca al peregrino cansado, quien ahora reconoce que el rincón está listo y muestra su gratitud en el diálogo.
   - Componente: `PilgrimNPCInteractable.cs`.
   - Activa el flag: `event_spoke_to_pilgrim`.
5. **Completar Misión (Volver con Padre Elías):**
   - El estado cambia a `ReadyToTurnIn`. Al hablar con Padre Elías, éste da su bendición y la misión se completa.
   - El juego dispara un `Debug.Log("[Sistema] Misión Completada. Caridad +1")` y guarda automáticamente el juego.

## Arquitectura de Save/Load y Visuales
Todos los interactuables visuales de esta misión (banco, manta, cuenco) implementan el ciclo `Start()` y `OnFlagChanged()` introducido en la Iteración 8 y 9. Esto garantiza que:
- Si el jugador carga una partida en la Fase 2, el banco limpio y la manta seguirán allí, pero el cuenco seguirá oculto.
- No hay desincronización de variables.

## Configuración Manual en Unity Editor
Para armar la misión "El rincón del peregrino" en tu escena actual sin romper IDs de serialización:

1. **Crear y poblar la Base de Datos (`QuestData`):**
   - Crea un nuevo ScriptableObject en `Assets/_Project/ScriptableObjects/` llamado `quest_pilgrim_rest`.
   - ID = `quest_pilgrim_rest`.
   - Añade 4 `Phases`:
     - Phase 0: Required Flags = `env_rest_corner_prepared`
     - Phase 1: Required Flags = `env_pilgrim_blanket_placed`
     - Phase 2: Required Flags = `env_pilgrim_water_brought`
     - Phase 3: Required Flags = `event_spoke_to_pilgrim`
   - *MUY IMPORTANTE:* Añade este nuevo asset a la lista `_questDatabase` del script `QuestManager` en el GameBootstrap para que el Save/Load lo reconozca.
2. **Actualizar a Padre Elías:**
   - Asigna el asset `quest_pilgrim_rest` a la variable `_questToAssign` de `PadreEliasInteractable`.
3. **Instanciar Objetos y NPCs en Escena:**
   - Añade un NPC simple (ej. Cápsula gris encorvada) en el exterior y ponle `PilgrimNPCInteractable`.
   - Crea un cubo/banco en una esquina cerca de la capilla y asígnale `RestBenchInteractable`.
   - Crea meshes para la Manta y el Cuenco, agrégales `PilgrimBlanketInteractable` y `WaterBowlInteractable`, y enlaza esos meshes a los campos `_blanketVisuals` y `_bowlVisuals` respectivamente.