# Save/Load System (Iteración 8)

## ¿Qué datos se guardan?
El sistema centralizado (`SaveManager.cs` y `SaveData.cs`) utiliza `JsonUtility` para guardar localmente en `Application.persistentDataPath` los siguientes datos:
1. **World State:** Todos los flags globales booleanos que usa el juego (ej. `env_altar_dressed`, `quest_prep_capilla_completed`, `event_spoke_to_padre_elias`).
2. **Progreso de Misiones (Quest Progress):** El ID de la misión activa, su estado (NotStarted, InProgress, etc.) y su fase actual (`CurrentPhaseIndex`).
3. **Posición del Jugador:** Guarda la posición y rotación (Vector3 / Quaternion) exacta en la escena.

## ¿Cómo se conectan los sistemas?
- **World State Manager:** Implementa métodos `ExportFlags()` e `ImportFlags()` que serializan el diccionario interno a listas paralelas (debido a las restricciones de Unity JSON con diccionarios).
- **Quest Manager:** Expone un array `_questDatabase`. Al cargar, usa el ID guardado para buscar el `QuestData` correcto en la base de datos y restaurar su fase y estado, emitiendo eventos para que la UI se actualice de inmediato.
- **Interactuables de Entorno:** Todos los interactuables visuales (Altar, Velas, Mantel, Vasijas) han añadido lógica en su `Start()`. Al arrancar la escena, revisan el `WorldStateManager` cargado y se auto-habilitan/deshabilitan o cambian sus mallas para coincidir con la persistencia.

## ¿Qué datos NO se guardan todavía?
- El inventario complejo no se guarda (porque el diseño *low-poly* dictaminó no usarlo, basando la progresión en los flags globales como `player_has_altar_cloth`).
- No hay múltiples slots de guardado. Existe un único archivo `savegame.json` centralizado que se auto-sobreescribe.

## Hooks de Auto-Guardado y Carga
1. `GameBootstrap.cs` detecta automáticamente la existencia del archivo en el disco durante su `Start()`. Llama a `LoadGame()` si existe, o a `NewGame()` (para limpiar estados en memoria) si no.
2. `PadreEliasInteractable.cs` dispara un auto-save `SaveManager.Instance.SaveGame(playerTransform)` tras el primer hito narrativo clave post-misión. *(En el futuro, esto se extenderá a puntos de descanso u otros NPCs).*

## Validación Manual en Unity Editor
Para que el sistema de carga funcione, los objetos serializados en el Editor deben estar vinculados correctamente:
1. **SaveManager:** Asegúrate de que el script `SaveManager.cs` esté añadido al prefab `[GAME_BOOTSTRAP]`.
2. **Quest Database:** Selecciona el objeto `[GAME_BOOTSTRAP]` que tiene el `QuestManager`. En el inspector, expande `Quest Database` (Array) y arrastra el objeto `prep_capilla` (tu QuestData creado en Iteraciones previas). Si no haces esto, el manager no sabrá qué scriptable object cargar por su ID.