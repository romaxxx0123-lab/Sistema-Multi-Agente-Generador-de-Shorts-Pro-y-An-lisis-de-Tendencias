# Padre Elías: Primer Encuentro y Transición (Iteración 7)

## ¿Qué interacción se añadió?
Se ha introducido la primera interacción narrativa significativa con **Padre Elías** (`PadreEliasInteractable.cs`). Esta interacción actúa como el cierre emocional y "payoff" de la misión "Preparar la capilla", y siembra suavemente el camino hacia el pueblo para la próxima fase del juego.

## Estados del Mundo (World State) Usados
- `quest_prep_capilla_completed`: Utilizado para determinar si la capilla ya fue preparada. Si es `false`, Padre Elías estará sumido en oración y no interactuará profundamente.
- `event_spoke_to_padre_elias`: Un nuevo flag booleano persistente. Se vuelve `true` tras la primera conversación post-misión, cambiando el diálogo del Padre Elías a un estado "fallback" de espera.

## Flujo de Diálogo Contextual
El diálogo es lineal, sobrio y reverente, dividido en tres etapas:
1. **Antes de la Capilla:** "Señor, dame fuerzas para guiar a este pueblo..." (Muestra su preocupación pero marca que aún no es momento de hablar).
2. **Primera Vez tras Preparar la Capilla:** "He visto la luz de las velas... Has devuelto la dignidad a Su casa. Descansa hoy, mañana hay mucho dolor que aliviar en el valle." (Reconocimiento del servicio y gancho narrativo claro sin abrir una quest gigante de inmediato).
3. **Conversaciones Posteriores (Fallback):** "El silencio de la capilla es un bálsamo... Quédate en paz."

## UI y Feedback
Se reutilizan los sistemas existentes de forma limpia:
- `DialogueUI` para la conversación.
- `NotificationUI` dispara el mensaje *"El descanso del peregrino"* tras la primera conversación significativa, marcando el fin de la etapa de introducción del juego de una manera contemplativa.

## Validación Manual en Unity Editor
Para integrar a Padre Elías en la escena actual (`Chapel.unity`):
1. **Crear el NPC:** Crea una cápsula o cilindro (diferente color que el Cuidador) en el exterior de la capilla, preferiblemente en una pequeña elevación o colina cercana mirando hacia el valle o la capilla.
2. **Asignar Componentes:** Añádele el script `PadreEliasInteractable`.
3. **Configurar Inspector:** Verifica que `_requiredQuestID` coincide con el ID de la misión (ej. `prep_capilla`). No es necesario crear un nuevo ScriptableObject para esta interacción, ya que funciona puramente a través del `WorldStateManager`.
4. **Probar:** Inicia el juego, intenta hablar con él (debe rezar). Completa la misión de la capilla. Vuelve a hablar con él (debe agradecerte). Habla de nuevo (debe dar el fallback).