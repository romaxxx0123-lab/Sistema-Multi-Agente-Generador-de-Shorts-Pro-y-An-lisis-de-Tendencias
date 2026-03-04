# RONIN SURVIVOR - PARTE 1A OPTIMIZADA

## Descripción
Versión optimizada de la PARTE 1A, migrada a un stack de alto rendimiento para soportar 100+ enemigos en el futuro.

## Cambios Clave (Optimización)
- **Física de Alto Rendimiento**: Migración completa de Cannon.js a **Rapier.js**.
- **Object Pooling System**: Implementado y listo para reutilizar enemigos y proyectiles.
- **Instanced Rendering**: Componente preparado para renderizar hordas en un solo draw call.
- **Monitoring**: Añadido **DebugPanel** (F3) para monitorear FPS en tiempo real.
- **React 19**: Actualizado para aprovechar mejoras de rendimiento y estabilidad en R3F.

## Características (Parte 1A)
- **Personaje**: Cápsula 3D con física Rapier y rotación suave.
- **Movimiento**: WASD / Flechas. Movimiento relativo a la cámara.
- **Arena**: Plano de 50x50m con paredes físicas invisibles que evitan que el jugador salga.
- **Cámara**: Perspectiva en tercera persona fija (~8m detrás, ~4m arriba).
- **Parámetros**: Configuración centralizada y optimizada en `src/config.ts`.

## Stack Técnico (Optimizado)
- **React 19** + **Vite**
- **Three.js** (@react-three/fiber v9) para el renderizado 3D.
* **Rapier.js** (@react-three/rapier) para el motor de física (optimizado para hordas).
- **Zustand** para la gestión de estado global.

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
- **WASD / Flechas**: Movimiento básico.
- **F3**: Activar/Desactivar Panel de Rendimiento (FPS).

## Parámetros de Optimización (`src/config.ts`)
- `PERFORMANCE.ENABLE_SHADOWS`: Activar/desactivar sombras para ganar FPS.
- `PHYSICS.TIME_STEP`: Ajuste del paso de simulación física.

## Próximamente (Parte 1B)
- Dash / Esquiva con trail visual.
- Cámara con seguimiento suave (lerp).
- Pulido de movimiento y feedback visual.
