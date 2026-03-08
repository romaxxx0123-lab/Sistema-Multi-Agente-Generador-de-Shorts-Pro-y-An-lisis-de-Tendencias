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
- [x] Implementar el Quest System Multi-Fase (`QuestManager`, `QuestData`) entrelazado al World State.
- [x] Crear el sistema de Diálogo Simple (`DialogueUI`) dependiente del estado del mundo.
- [x] Conectar los objetos interactuables a los sistemas para la misión "Preparar la Capilla".

## Iteration 6: Extensión de Misión "Preparar la Capilla" (Completada)
- [x] Añadir soporte Multi-Fase al `QuestData` y actualizar el flujo lineal del NPC.
- [x] Añadir interacciones secundarias dependientes de fase (`ClothInteractable`, `CandleInteractable`).
- [x] Evitar sistemas de inventario complejos usando estados de mundo (`player_has_altar_cloth`).
- [x] Crear notificaciones de UI mínimas y sobrias (`NotificationUI`).
- [x] Documentar el flujo completo de la misión y la configuración en el editor en `Docs/FirstQuestFullFlow.md`.

## Iteration 7: Interacción Narrativa con Padre Elías (Completada)
- [x] Crear el NPC `PadreEliasInteractable`.
- [x] Añadir diálogos contemplativos basados en el progreso (antes y después de la capilla).
- [x] Implementar la actualización del estado del mundo (`event_spoke_to_padre_elias`).
- [x] Documentar el cierre narrativo de la introducción y el gancho hacia el pueblo.

## Iteration 8: Save/Load System (Completada)
- [x] Crear `SaveData.cs` y `SaveManager.cs` para serializar progreso en JSON.
- [x] Guardar/Cargar el World State y la Quest Activa.
- [x] Restaurar visualmente el entorno (Velas, Mantel, Altar, Vasijas) usando los hooks en `Start()`.
- [x] Auto-save tras interactuar con Padre Elías y auto-load en `GameBootstrap.cs`.

## Iteration 9: Atmósfera Reactiva (Completada)
- [x] Crear controlador global de atmósfera (`ReactiveAtmosphereController`).
- [x] Crear controladores locales de luz suave (`ReactiveLight`).
- [x] Crear hooks desacoplados de audio (`ReactiveAudio`).
- [x] Integrar respuestas de atmósfera con el Guardado/Carga vía `WorldStateManager`.

## Iteration 10: Segunda Misión "El rincón del peregrino" (Completada)
- [x] Crear el nuevo flujo de la misión usando el soporte multi-phase (`QuestData`).
- [x] Añadir el NPC Peregrino y actualizar los diálogos de Padre Elías.
- [x] Crear interactuables visuales persistentes (`RestBench`, `PilgrimBlanket`, `WaterBowl`).
- [x] Asegurar la integración con el Save/Load sin duplicar lógicas.
- [x] Documentar el ensamblaje manual y los flags en `Docs/SecondQuest_PadreElias.md`.

## Iteration 11: Animación, Polish y Transición de Escena (Pendiente)
- [ ] Animaciones de personajes e idle states del Cuidador / Padre Elías usando Animator.
- [ ] Implementar trigger de carga persistente a la siguiente escena (El Pueblo / El Valle).
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