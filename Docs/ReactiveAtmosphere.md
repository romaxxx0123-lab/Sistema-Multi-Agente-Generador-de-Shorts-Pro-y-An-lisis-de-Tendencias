# Reactive Atmosphere System (Iteración 9)

## ¿Qué controladores se añadieron?
Se han creado tres scripts principales en `Assets/_Project/Scripts/Environment/` que escuchan pacivamente al `WorldStateManager` para modificar la estética de la escena de manera sobria y sin afectar las mecánicas.

1. **`ReactiveAtmosphereController.cs`**:
   - Actúa a nivel global. Controla la `Directional Light` (el sol) y una capa de audio de ambiente (ej. viento).
   - *Comportamiento:* Al detectar la bandera `quest_prep_capilla_completed` = `true`, realiza una transición suave (lerp) del color de la luz (de tonos fríos a cálidos) y sube levemente el volumen ambiente. También lanza una campana sutil ("Quest Completed Bell").
   - *Carga segura:* Al iniciar (`Start`), evalúa instantáneamente el estado si se cargó una partida avanzada.

2. **`ReactiveLight.cs`**:
   - Se adhiere a luces locales (Point Lights / Spotlights).
   - Escucha banderas específicas (como `env_altar_dressed` o `env_candle_1_lit`) para hacer un "fade-in" progresivo de la intensidad desde 0.

3. **`ReactiveAudio.cs`**:
   - Componente utilitario. Reproduce un efecto de sonido (`OneShot`) cuando una bandera cambia a `true`.
   - Ideal para colocar sonidos al recoger manteles (`player_has_altar_cloth`) o interactuar con otros objetos, manteniendo el código original del interactuable completamente limpio de referencias de audio.

## ¿Por qué esto es escalable?
El sistema no toca los scripts de mecánicas (ej. `CandleInteractable.cs`). Se alimenta puramente del evento `OnFlagChanged` del `WorldStateManager`. Esto asegura que:
- Las misiones y la atmósfera no colisionen en carrera de inicialización.
- El `SaveManager`, al cargar los flags y llamar al evento `OnFlagChanged`, automáticamente restaura el "mood" de la sala sin escribir lógicas redundantes en docenas de scripts.

## Validación Manual en Unity Editor
Para darle vida a la capilla, debes configurar lo siguiente al abrir la escena `Chapel.unity`:
1. **Controlador Global:** Añade un objeto vacío llamado `AtmosphereManager`. Asígnale `ReactiveAtmosphereController`. Arrastra allí tu luz direccional principal, un `AudioSource` de ambiente, y un sonido de campana (AudioClip) para la victoria de la misión.
2. **Luz del Altar:** Crea una `Point Light` frente al altar. Apágala (Intensidad 0). Añádele `ReactiveLight` y configura `_targetFlag` a `env_altar_dressed`.
3. **Luces de Velas:** Las velas ya habilitan su VFX en código (las partículas), pero puedes añadir una `Point Light` amarilla con `ReactiveLight` usando `env_candle_1_lit` y `env_candle_2_lit` para un brillo de ambiente interactivo.
4. **Hooks de Audio Opcionales:** Crea objetos vacíos (o agrégalos a los props) con `AudioSource` + `ReactiveAudio`. Usa el flag `player_has_altar_cloth` con un clip de sonido de tela moviéndose.