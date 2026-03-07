# Unity Project Bootstrap (Iteración 2)

## ¿Qué se implementó en esta iteración?
Esta iteración ha transformado la estructura inicial pasiva en un proyecto Unity real y válido para la versión 2022.3 LTS, integrando los cimientos de código en C# y configurando el control de versiones correctamente. El objetivo era lograr una "base sólida" sin romper la aplicación web React/Vite legacy existente.

## Archivos Unity Creados y Configuraciones
1. **Archivos Centrales de Proyecto:**
   - `ProjectSettings/ProjectVersion.txt` configurado para Unity `2022.3.0f1`.
   - `Packages/manifest.json` inicializado con dependencias clave: Universal Render Pipeline (URP), Input System y Cinemachine.
2. **Control de Versiones Seguros:**
   - Se agregaron exclusiones estándar de Unity (Library, Temp, Logs, etc.) a `.gitignore`, asegurándose de no afectar a la aplicación web legacy.
   - Se introdujo un `.gitattributes` para forzar a Git a tratar los assets de Unity (escenas, prefabs, texturas, audios) como binarios, evitando corrupciones en los diffs y conflictos de text-encoding.

## Arquitectura de Scripts Añadida (`Assets/_Project/Scripts/`)
Se estableció una estructura de carpetas modular (`Core`, `Player`, `Interaction`, `UI`, `World`, `NPC`, `Quests`) y se pobló con los primeros componentes base bajo el namespace `RPGProject.*`:

- **Core:** `GameBootstrap.cs` (Punto de entrada global e inicializador del juego).
- **Player:** `PlayerController.cs` (Movimiento con CharacterController), `PlayerStats.cs` (Gestor central de estadísticas), `HealthComponent.cs` y `StaminaComponent.cs`.
- **Interaction:** `IInteractable.cs` (Interfaz base para desacoplamiento), `InteractableBase.cs` y `InteractionDetector.cs` (Lógica de detección por colisión).
- **UI:** `InteractionPromptUI.cs` (Manejo de canvas para prompts interactivos).

## ¿Qué falta validar dentro del Editor de Unity?
Debido a que los archivos serializados `.unity` y los prefabs `.prefab` no deben generarse en texto plano sin Unity corriendo (por riesgo a corrupción grave o GUIDs mal formados), al abrir el proyecto por primera vez se requiere validación manual:

1. **Compilación de Scripts:** Asegurar que Unity compile todos los scripts (Unity puede requerir reiniciar para descargar e instalar completamente los paquetes del `manifest.json`).
2. **Crear la Escena Base:** Instanciar un mapa básico usando URP y arrastrar `GameBootstrap.cs` a un objeto vacío de inicialización.
3. **Configurar el Input System:** Cambiar a "New Input System" en `Project Settings > Player`.
4. **Instanciar al Jugador:** Ensamblar un Capsule/Cylinder primitivo y añadirle el `CharacterController` junto a los scripts `PlayerController`, `HealthComponent` y `InteractionDetector`.

## Siguiente Paso Recomendado (Iteración 3)
El próximo hito debe realizarse operando **dentro de Unity Editor**, en donde se crearán los objetos físicos:
- Generar el objeto Player en escena, asignando las referencias visuales y físicas necesarias a los componentes recién creados.
- Implementar el primer objeto `InteractableBase` en escena (ej., un altar básico que cambie de color) y conectarlo a un UI de Canvas básico usando `InteractionPromptUI`.
- Comprobar que el loop completo del movimiento y la interacción funcionan correctamente.