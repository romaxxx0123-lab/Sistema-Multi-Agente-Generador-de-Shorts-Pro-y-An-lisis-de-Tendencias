# Ronin Survivor - Part 2: Combat, Enemies & Level Up

## Implementación Parte 2
1. **Sistema de Combate**: Ataque melee con Click Izquierdo. Detecta enemigos en un cono frontal de 90° y 2m de rango.
2. **Enemigos**:
   - **Slimes**: Lentos, poca vida, sueltan poca XP.
   - **Esqueletos**: Rápidos, más resistentes, sueltan más XP.
3. **Spawning**: Sistema de oleadas automáticas que escala en cantidad cada 30 segundos.
4. **Progresión**:
   - Recolección de XP (Gemas verdes con efecto magnético).
   - Sistema de Niveles (XP necesaria = Nivel * 10).
   - Pantalla de Level Up con 3 mejoras aleatorias (Daño, Velocidad, Vida, Cooldowns).
5. **HUD**: Barras de vida y experiencia, contador de nivel y bajas.

## Migración de 1A a 1B
1. **Zustand**: Se añadió `zustand` para el manejo de estado global (GameManager).
2. **Refactorización de Player**: El componente `Player.tsx` se ha convertido en un orquestador (`PlayerController`) que utiliza hooks modulares.
3. **Cámara**: Se reemplazó la cámara estática por `CameraFollow.tsx`, que sigue al jugador con suavizado.
4. **Configuración Centralizada**: Todos los valores se encuentran ahora en `src/config.ts`.

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
