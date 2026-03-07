# Game Architecture Document

## Módulos Principales
1. **Core:** GameManager, Application lifecycle management, Config.
2. **Player:** Input handling, Movement, Camera, Interactor.
3. **Environment/WorldState:** Persistent object states, Time of day, Weather control.
4. **Interaction & Dialog:** System for interaction with NPCs and world objects, Dialog sequences.
5. **Quest System:** Tracking player progress, Objectives, Rewards.
6. **UI:** Heads Up Display (minimalist), Dialog UI, Inventory/Quest Log.

## Responsabilidades
- **Core:** Inicialización del juego, carga de escenas, configuración global, y persistencia de datos general.
- **Player:** Manejar la entrada del jugador (Input System) y traducirla a movimiento de manera desacoplada usando interfaces (e.g., `IPlayerMover`). Controlar la interacción del jugador con el mundo (`PlayerInteractor`).
- **Environment/WorldState:** Rastrear y aplicar el estado persistente del mundo de manera desacoplada usando Scriptable Objects o un sistema de eventos global.
- **Interaction & Dialog:** Escuchar y procesar las interacciones de los jugadores, disparando eventos de UI para diálogos o actualización de misiones, delegando el estado del mundo.
- **Quest System:** Evaluar el progreso de las misiones y notificar al `WorldState` para aplicar cambios en el mundo basándose en los eventos completados o no completados.
- **UI:** Renderizar el estado actual del juego, reaccionando a eventos, nunca controlando la lógica del juego directamente.

## Organización de Scripts y Componentes Base
`Assets/_Project/Scripts/`
- `/Core/`: Punto de entrada de la aplicación (`GameBootstrap.cs`).
- `/Player/`: Manejo de las lógicas físicas y de estado exclusivas del jugador. Creados `PlayerController.cs` (CharacterController), `PlayerStats.cs`, `HealthComponent.cs` y `StaminaComponent.cs`.
- `/Interaction/`: Sistema genérico de descubrimiento y activación en el entorno. Implementado `IInteractable.cs`, su base abstracta `InteractableBase.cs` y el componente lector de área `InteractionDetector.cs`.
- `/UI/`: Lógicas de Canvas (`InteractionPromptUI.cs`, `DialogueUI.cs`, `QuestUI.cs`, `StaminaUI.cs`).
- `/World/`: Control del estado global del mundo y flags de persistencia (`WorldStateManager.cs`).
- `/NPC/`: Estados, IA ligera para movimiento e Idle, sistemas de diálogo contextual simple y asignación de misiones (`CaretakerNPCInteractable.cs`).
- `/Quests/`: Datos del progreso espiritual del jugador y gestión de las tareas (`QuestManager.cs` y `QuestData.cs` ScriptableObjects).

## Arquitectura de World State, Diálogos y Misiones
- **World State:** Funciona como un Singleton central que almacena y emite eventos sobre variables booleanas (flags) de progreso, garantizando bajo acoplamiento con la UI o misiones individuales.
- **Diálogos Contextuales:** El NPC base evalúa el estado del `WorldState` y del `QuestManager` para determinar qué bloque de diálogo lineal mostrar a través de `DialogueUI.cs`.
- **Misiones (Quest System):** Depende de datos configurados en ScriptableObjects (`QuestData`). El `QuestManager` escucha los eventos del `WorldState` y, si una misión activa detecta que todos sus flags requeridos son `true`, transiciona de `InProgress` a `ReadyToTurnIn`.

## Principios para Bajo Acoplamiento
- **Scriptable Objects:** Usar SOs para configuraciones, datos constantes y variables globales compartidas.
- **Arquitectura Basada en Eventos:** Los módulos se comunican a través de eventos, no referencias directas.
- **Interfaces:** Utilizar interfaces (`IInteractable`, `IDamageable`, etc.) para interactuar con diferentes objetos sin conocer su tipo concreto.
- **Inyección de Dependencias (DI):** (opcional pero recomendado) Considerar un framework ligero de DI o el patrón Service Locator para resolver dependencias a nivel global si el proyecto crece significativamente.
- **Separación Lógica/Visual:** El estado y las reglas del juego nunca deben depender de componentes visuales (como `Animator` o `MeshRenderer`).