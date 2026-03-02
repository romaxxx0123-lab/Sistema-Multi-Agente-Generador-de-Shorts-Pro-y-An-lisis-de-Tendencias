# Ronin Survivor - Part 4: Roguelite Expansion

## Implementación Parte 4
1. **Contenido Expandido**: 10 Habilidades automáticas totales y 6 Evoluciones únicas.
2. **Meta-Progresión**: Sistema persistente de Meta-XP. Menú para desbloquear personajes (Ronin, Samurai, Kunoichi, Monje), habilidades y mejoras permanentes.
3. **Tienda**: Aparece cada 5 niveles. Permite comprar armas temporales, consumibles y mejoras de run usando Monedas.
4. **Sistema de Monedas**: Los enemigos sueltan monedas. Recogida magnética. Persisten entre runs para la meta-progresión.
5. **Jefes**:
   - **Oni Rojo** (5 min): 2 fases, ataques AOE e invocaciones.
   - **Shogun Corrompido** (10 min): 3 fases, combo katana, tornado y teletransporte.
6. **Enemigos Avanzados**: Ninjas (dash), Magos (proyectiles), y Mini-Onis (elite).
7. **Dificultades**: Selección de Normal, Difícil y Pesadilla antes de la run.
8. **Feedback Visual**: Números de daño flotantes, screen shake, trails de dash y flashes de nivel.

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
