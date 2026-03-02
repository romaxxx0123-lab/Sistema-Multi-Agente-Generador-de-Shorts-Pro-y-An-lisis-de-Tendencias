# Ronin Survivor - Part 1B: Dash & Smooth Camera

## Migración de 1A a 1B
1. **Zustand**: Se añadió `zustand` para el manejo de estado global (GameManager).
2. **Refactorización de Player**: El componente `Player.tsx` se ha convertido en un orquestador (`PlayerController`) que utiliza hooks modulares:
   - `usePlayerMovement`: Maneja el input WASD.
   - `usePlayerDash`: Maneja la lógica de dash y cooldown con SHIFT.
3. **Cámara**: Se reemplazó la cámara estática por `CameraFollow.tsx`, que sigue al jugador con suavizado y mantiene la vista trasera al rotar.
4. **Configuración Centralizada**: Todos los valores (velocidades, distancias, offsets) se encuentran ahora en `src/config.ts`.

## Configuración y Pruebas
### Instalación
```bash
npm install
npm run dev
```

### Controles
- **WASD / Flechas**: Movimiento básico.
- **SHIFT**: Dash (5m en 0.3s). Cooldown de 2s (indicado visualmente por un marcador rojo sobre el personaje).
- **Botón Pausar**: Detiene el flujo del juego y la física.

### Ajustes (config.ts)
- `DASH.DISTANCE`: Cambia la potencia del dash.
- `CAMERA.SMOOTH_TIME`: Ajusta qué tan rápido la cámara alcanza al jugador.

## Preparación para Parte 2
- **GameManager**: El `useGameStore` ya tiene estados `playing`, `paused` y `gameover`.
- **Hooks de Combate**: El `PlayerController` (`Player.tsx`) está preparado para recibir un nuevo hook `usePlayerCombat`.
- **Enemigos**: Se recomienda crear una carpeta `src/components/enemies` y un store dedicado para la gestión de oleadas.
