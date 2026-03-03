# RONIN SURVIVOR - PARTE 1A: MOVIMIENTO BÁSICO

## Descripción
Demo mínima jugable de un juego 3D tipo Vampire Survivors con combate manual (próximamente). Esta entrega se centra en el movimiento físico del personaje y la configuración de la arena.

## Características (Parte 1A)
- **Personaje**: Cápsula 3D con física real y rotación suave.
- **Movimiento**: WASD / Flechas. Movimiento relativo a la cámara.
- **Arena**: Plano de 50x50m con paredes físicas invisibles que evitan que el jugador salga.
- **Cámara**: Perspectiva en tercera persona fija (~8m detrás, ~4m arriba).
- **Parámetros**: Configuración centralizada en `src/config.ts`.

## Stack Técnico
- **React 18** + **Vite**
- **Three.js** (@react-three/fiber) para el renderizado 3D.
- **Cannon.js** (@react-three/cannon) para el motor de física.
- **Zustand** para la gestión de estado.

## Instalación y Ejecución
1. Instalar dependencias:
   ```bash
   npm install
   ```
2. Iniciar servidor de desarrollo:
   ```bash
   npm run dev
   ```

## Controles
- **W / Flecha Arriba**: Mover hacia adelante.
- **S / Flecha Abajo**: Mover hacia atrás.
- **A / Flecha Izquierda**: Mover a la izquierda.
- **D / Flecha Derecha**: Mover a la derecha.

## Parámetros Ajustables (`src/config.ts`)
- `PLAYER.MOVE_SPEED`: Velocidad de traslación (default: 5m/s).
- `PLAYER.ROTATION_SPEED`: Velocidad de rotación suave.
- `ARENA.SIZE`: Tamaño del plano de juego.
- `CAMERA.OFFSET`: Posición de la cámara respecto al jugador.

## Próximamente (Parte 1B)
- Dash / Esquiva con trail visual.
- Cámara con seguimiento suave (lerp).
- Pulido de movimiento y feedback visual.
