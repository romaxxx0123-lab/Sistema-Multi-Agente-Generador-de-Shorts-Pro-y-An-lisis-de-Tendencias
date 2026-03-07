# Quest & Dialogue Systems Bootstrap (Iteración 5)

## ¿Qué sistemas quedaron implementados?

1. **World State Mínimo (`WorldStateManager.cs`)**
   - Un Singleton base para guardar y consultar "flags" (booleanos) del estado global del mundo. Ejemplo: `env_pozo_revisado`, `quest_prep_capilla_started`.
   - Actúa como pegamento para la persistencia sin acoplar los interactuables a un sistema complejo de base de datos.

2. **Quest System Base (`QuestManager.cs` y `QuestData.cs`)**
   - Sistema centrado en eventos y ScriptableObjects.
   - Evalúa pasivamente los cambios del `WorldStateManager`. Cuando los *RequiredFlags* de la `QuestData` actual se vuelven `true`, transiciona la quest al estado `ReadyToTurnIn`.
   - La UI (`QuestUI.cs`) reacciona a este manager para mostrar objetivos actualizados.

3. **Diálogo Contextual Simple (`DialogueUI.cs` y `CaretakerNPCInteractable.cs`)**
   - Un sistema lineal de UI superpuesto que pausa la exploración visualmente.
   - El NPC toma decisiones de diálogo basándose en las flags globales y el estado de la misión. Asigna la misión inicial, reacciona si estás en medio de ella, y la da por finalizada si todos los objetivos se han cumplido.

## ¿Cómo se conecta con los interactuables actuales?
- **El Cuidador:** Es el emisor de la quest. Al interactuar con él sin la misión activa, inicia `QuestData`. Al interactuar con la misión lista, llama a `CompleteQuest()`.
- **Pozo, Vasija y Atril:** Cada uno expone dos campos serializados en Unity (`_requiredQuestID` y `_flagToSet`). Si la misión base está activa, interactuar con ellos enviará su `_flagToSet` como `true` al `WorldStateManager`.
- **El Altar:** Revisa que la `QuestData` base tenga su flag `completed` en true para permitir el acceso contemplativo final.

## ¿Qué falta para extender a "Mantel + Altar + Velas"?
El sistema está modularizado y listo. Para agregar nuevos objetivos a esta u otra misión solo necesitas:
1. Crear nuevos interactuables (ej. `CandleInteractable.cs`, `MantleInteractable.cs`) que hereden de `InteractableBase` y asignen un nuevo flag en su interacción (ej. `env_velas_encendidas`).
2. En el editor de Unity, añadir esos nuevos strings (ej. `env_velas_encendidas`) al array de `RequiredFlags` en el ScriptableObject de la misión.
El `QuestManager` automáticamente requerirá esos pasos adicionales para que el Cuidador acepte la misión como terminada.

## Validación Manual Requerida en Unity
Dado que este hito no genera la escena serializada base para evitar corrupciones de dependencias, debes realizar lo siguiente al abrir el proyecto:

1. **Crear la QuestData:**
   - Haz clic derecho en la carpeta `Assets/_Project/ScriptableObjects/` -> Create -> `RPGProject/Quest`.
   - Nómbrala `prep_capilla`.
   - Llena los datos: ID = `prep_capilla`, RequiredFlags = (Añade `env_vasija_revisada` y `env_escrituras_revisadas`).
2. **Conectar Managers:**
   - En tu objeto vacío `[GAME_BOOTSTRAP]`, arrastra los scripts `WorldStateManager.cs` y `QuestManager.cs`.
3. **Conectar UI:**
   - En tu Canvas, crea paneles o textos para el diálogo y arrastra `DialogueUI`.
   - Crea textos para la misión activa y arrastra `QuestUI`.
4. **Conectar NPC:**
   - Selecciona a tu Cuidador en escena, arrástrale la QuestData creada al campo correspondiente del script `CaretakerNPCInteractable`.