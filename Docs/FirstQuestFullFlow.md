# First Quest Full Flow: "Preparar la capilla"

## Descripción General
Esta es la documentación técnica del flujo completo y lineal de la primera misión del juego. Utiliza el sistema de Fases (QuestPhases) del `QuestData` junto al `QuestManager` y al `WorldStateManager`.

No requiere de un sistema de inventario complejo. El progreso es totalmente dependiente del World State, logrando una arquitectura limpia.

## Flujo Lógico y Fases

### Phase 0: Revisión Inicial
- **Objetivo:** Revisar el pozo, las vasijas y las escrituras.
- **Interacciones:**
  - `WellInteractable` -> Setea `env_pozo_revisado`.
  - `VesselInteractable` -> Requiere `env_pozo_revisado`. Setea `env_vasija_revisada`.
  - `LecternInteractable` -> Setea `env_escrituras_revisadas`.
- **Condición de Avance:** `RequiredFlags` = `env_vasija_revisada`, `env_escrituras_revisadas`.

### Phase 1: Vestir el Altar
- **Objetivo:** Recoger el mantel doblado y colocarlo en el altar.
- **Interacciones:**
  - `ClothInteractable` -> Requiere estar en Phase 1. Setea `player_has_altar_cloth` y desaparece visualmente (simulando que lo llevas en mano).
  - `AltarInteractable` -> Requiere `player_has_altar_cloth`. Al usarse, setea `env_altar_dressed` y habilita el mesh del mantel sobre el altar.
- **Condición de Avance:** `RequiredFlags` = `env_altar_dressed`.

### Phase 2: La Luz del Señor
- **Objetivo:** Encender las dos velas del altar.
- **Interacciones:**
  - `CandleInteractable` (x2) -> Requieren `env_altar_dressed` y estar en Phase 2. Setean `env_candle_1_lit` y `env_candle_2_lit` respectivamente. Habilitan partículas de fuego.
- **Condición de Avance:** `RequiredFlags` = `env_candle_1_lit`, `env_candle_2_lit`.

### Quest Ready to Turn In & Completed
- Al completar Phase 2, la misión transiciona internamente a `ReadyToTurnIn`.
- **Interacción:**
  - `CaretakerNPCInteractable` detecta este estado, dice su diálogo de agradecimiento y llama a `CompleteQuest()`.
  - Da una recompensa de "Virtud Espiritual" (placeholder de log).
  - Su siguiente diálogo es el gancho narrativo hacia el **Padre Elías**.

## Configuración Manual en Unity Editor
Para armar esto correctamente en la escena `Chapel.unity` sin romper GUIDs desde texto:

1. **Configurar el QuestData (`prep_capilla`):**
   - Abre el ScriptableObject de la misión.
   - Crea 3 elementos en el Array de `Phases`:
     - Phase 0: Required Flags = [`env_vasija_revisada`, `env_escrituras_revisadas`]
     - Phase 1: Required Flags = [`env_altar_dressed`]
     - Phase 2: Required Flags = [`env_candle_1_lit`, `env_candle_2_lit`]
   - Asigna un `ObjectiveText` narrativo a cada uno.
2. **Instanciar Objetos en Escena:**
   - **Mantel Dobladito:** Pon un cubo aplastado en un rincón. Asígnale `ClothInteractable`.
   - **Velas (x2):** Pon dos cilindros delgados sobre el Altar. Asígnales `CandleInteractable`. Asegúrate de escribir exactamente `env_candle_1_lit` en el inspector de una, y `env_candle_2_lit` en la otra.
3. **Instanciar UI Adicional:**
   - En el Canvas principal, crea un texto central (transparente) llamado `NotificationText`.
   - Añade el script `NotificationUI` y asígnale este texto para que las notificaciones de "Mantel recogido" funcionen.