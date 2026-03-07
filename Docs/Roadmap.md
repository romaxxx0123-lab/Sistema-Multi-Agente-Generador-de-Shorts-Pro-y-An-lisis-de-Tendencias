# Project Roadmap

## Iteration 1: Base Teórica (Completada)
- [x] Configurar la estructura de carpetas de Unity (`Assets/_Project/`).
- [x] Crear documentación base (GDD, Architecture, Roadmap).

## Iteration 2: Base C# y Scripting Inicial (Completada)
- [x] Configurar `ProjectSettings` y `Packages/manifest.json`.
- [x] Configurar `.gitignore` y `.gitattributes`.
- [x] Desarrollar la arquitectura limpia de directorios.
- [x] Crear scripts de Jugador (Movimiento, Vida, Resistencia).
- [x] Crear la base del sistema de Interacción (Detectores y UI).
- [x] Preparar las instrucciones para abrir la primera Escena.

## Iteration 3: Núcleo Jugable (Completada)
- [x] Implementar Player Input Reader desacoplado del Input System antiguo.
- [x] Refinar Player Controller (salto, sprint, consumo de estamina, relativo a cámara).
- [x] Integrar interacción base y Dummy Interactable object.
- [x] Crear el HUD mínimo (StaminaUI).
- [x] Crear Guía de Ensamblaje (`PlayablePrototypeSetup.md`).

## Iteration 4: Diseño de Primera Escena e Interactuables Base (Completada)
- [x] Crear scripts placeholders concretos para la primera misión (`WellInteractable`, `VesselInteractable`, `LecternInteractable`, `AltarInteractable`, `CaretakerNPCInteractable`).
- [x] Documentar la distribución, tono y flujo espacial de la primera escena ("La Capilla Olvidada") en `Docs/FirstSceneLayout.md`.
- [x] Especificar cómo ensamblar la capilla de forma segura y contemplativa dentro del editor.

## Iteration 5: Sistema de Misiones (Completada)
- [x] Crear el estado global (`WorldStateManager`) para recordar interacciones de forma persistente.
- [x] Implementar el Quest System (`QuestManager`, `QuestData`) entrelazado al World State.
- [x] Crear el sistema de Diálogo Simple (`DialogueUI`) dependiente del estado del mundo.
- [x] Conectar los objetos interactuables a los sistemas para la misión "Preparar la Capilla".

## Iteration 6: Extensiones y Meta-Progreso
- [ ] Añadir interacciones secundarias (Mantel, Velas).
- [ ] Guardado y Carga del World State en JSON.
- [ ] Animaciones y Eventos Especiales de Cámara en diálogos.
- [ ] Implementar el "Valle del Silencio" con assets low poly.
- [ ] Integrar el sistema de "World State" y persistencia.
- [ ] Crear misiones y diálogos basados en los valores del juego.
- [ ] Implementar cambios visuales/mecánicos en el entorno (ej. ermita reparada = luz, NPC cambiando rutina).
- [ ] Integrar sistema de Audio (SFX y Música).
- [ ] Ajustar el "feel" (velocidad de movimiento, iluminación, animaciones).

## Prioridades
1. **Base sólida y modular:** Priorizar la arquitectura sobre características completas.
2. **Movimiento y cámara fluidos:** La exploración es clave, el movimiento debe sentirse bien.
3. **Interacción clara:** El feedback de las acciones del jugador debe ser inmediato y comprensible.
4. **Persistencia del mundo:** Asegurar que las acciones del jugador cambien de manera creíble el estado del mundo.
5. **Atmósfera inmersiva:** Iluminación y sonido que encajen con el tono contemplativo.

## Siguiente Milestone Recomendado
**Milestone 1:** Primer núcleo jugable (Vertical Slice) con movimiento fluido, interacción de objetos, y un sistema básico de diálogo, sin assets finales, pero demostrando el loop de exploración y recolección.