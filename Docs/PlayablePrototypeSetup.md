# Playable Prototype Setup Guide (Iteración 3)

Dado que no instanciamos objetos en una escena `.unity` directamente por texto para evitar corrupciones catastróficas, esta guía detalla cómo ensamblar el Vertical Slice jugable en unos minutos.

## ¿Qué quedó funcional en esta iteración?
- **Movimiento 3D y Cámara:** `PlayerController` ahora lee el New Input System vía `PlayerInputReader` para lograr movimiento relativo a la cámara (ignora el pitch), rotación suave del modelo, salto y sprint.
- **Interacción Completa:** El jugador detecta y activa objetos `IInteractable` (ej. `DummyInteractable`) usando la tecla "E", disparando feedback visual.
- **Sistema de HUD/Stats:** La estamina se consume al correr y saltar, se regenera sola, y se refleja dinámicamente en el HUD mediante `StaminaUI.cs`.

## Pasos para el Ensamblaje Manual (Unity Editor)

### 1. Preparar la Escena y Cámara
1. Abre tu escena principal (`Main.unity`).
2. Crea un **Plane** para el suelo (Escala `10, 1, 10`).
3. Instala Cinemachine desde el Package Manager (si no lo hiciste en la iteración previa).
4. Crea una **Cinemachine FreeLook Camera**.
5. Asigna a su target "Follow" y "LookAt" el objeto del Jugador que crearás en el paso 2.

### 2. Configurar el Jugador (Player)
1. Crea un **Capsule** 3D y nómbralo `Player`.
2. Asígnale el tag "Player".
3. Arrástrale los siguientes scripts desde `Assets/_Project/Scripts/Player/`:
   - `PlayerController`
   - `PlayerInputReader`
   - `PlayerStats`
   - `HealthComponent`
   - `StaminaComponent`
   - `InteractionDetector` (desde `Interaction/`)
4. Verifica que `PlayerController` detectó el `CharacterController` automáticamente.
5. En `InteractionDetector`, cambia el LayerMask para detectar la capa "Interactable". (Crea esta capa si no existe).

### 3. Configurar el HUD (UI)
1. Crea un **UI Canvas** y nómbralo `HUD`.
2. Dentro del Canvas, crea un `UI > Slider` (nómbralo `StaminaBar`) y posiciónalo arriba a la izquierda.
3. Arrastra `StaminaUI` al `StaminaBar` y asigna el script `PlayerStats` de tu jugador en el campo "Player Stats".
4. Crea un **Text (TextMeshPro)** centrado en la pantalla (nómbralo `InteractionPrompt`).
5. Arrástrale el script `InteractionPromptUI` y conecta el `InteractionDetector` de tu Jugador y el objeto `Text`.

### 4. Crear el Objeto Interactuable
1. Crea un **Cube** en la escena (aléjalo un poco del jugador).
2. Asígnale la capa "Interactable" (creada en el Paso 2.5).
3. Asegúrate de que tiene un `BoxCollider` con `IsTrigger = false`.
4. Arrástrale el script `DummyInteractable`.
5. Selecciona un color en el script para el "Interact Color".

### 5. ¡Prueba el Juego!
- Pulsa **Play**.
- Usa **W, A, S, D** para moverte (relativo a la rotación de tu cámara Cinemachine).
- Usa el **Ratón** para orbitar la cámara.
- Pulsa **Shift** para esprintar (verás que la barra de estamina baja y el jugador va más rápido).
- Pulsa **Espacio** para saltar.
- Acércate al Cubo; el texto de la pantalla debería decir "Interact".
- Pulsa **E** para interactuar con el Cubo y ver cómo cambia de color.