# RONIN SURVIVOR - DEMO ALFA

## Descripción
**Ronin Survivor** es un juego de acción roguelite en 3D (estilo Vampire Survivors) ambientado en un Japón feudal estilizado. El juego combina el combate automático con la gestión estratégica de habilidades y el posicionamiento táctico del jugador.

## Características Actuales

### 🎮 Gameplay Core
- **Movimiento Fluido**: Control en 8 direcciones relativo a la cámara con físicas de Rapier.
- **Habilidades Automáticas**: 4 tipos de habilidades únicas (Kunai, Rayos, Aura de Fuego, Proyectiles).
- **Sistema de Progresión**: Subida de nivel en tiempo real con recolección de XP (Shards).
- **Enemigos Progresivos**: Hordas de Skeletons, Ninjas, Onis y Samuráis con dificultad escalable por oleadas.
- **Combate Físico**: Retroceso (knockback) y efectos de hit-stop al impactar enemigos.

### ✨ Interfaz de Usuario (Pro UI)
- **HUD Estilo VS**: Barra de 6 slots de habilidades con indicadores de nivel por "pips".
- **Sistema de Mejora (Rarity)**: Cartas de mejora con rarezas (Común a Legendaria) y efectos visuales de brillo (shimmer).
- **Meta-Progresión**: Guardado persistente de Meta-XP y estadísticas de runs.
- **Estética Pulida**: Uso de iconos de alta calidad (Lucide), fuentes monoespaciadas y animaciones suaves con Framer Motion.

### 🛠️ Tecnología y Rendimiento
- **Stack**: React 19, Three.js (R3F), Rapier.js (Física), Zustand (Estado).
- **Optimización**: Object Pooling para partículas/proyectiles, renderizado de sombras PCF y lógica de cámara estable.
- **Debug Tooling**: Panel de rendimiento en tiempo real (tecla F3).

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
- **WASD / Flechas**: Movimiento.
- **Espacio / Shift**: Dash (Esquiva).
- **1, 2, 3**: Selección de mejoras en el menú de nivel.
- **ESC**: Pausar juego.
- **F3**: Mostrar/Ocultar métricas de rendimiento.

## 📖 Guía de Juego

1. **Supervivencia**: Muévete por la arena evitando el contacto directo con los enemigos.
2. **Progreso**: Recoge los fragmentos de XP (Shards) azules que sueltan los enemigos al morir para subir de nivel.
3. **Mejoras**: Cada vez que subas de nivel, elige una de las 3 mejoras. Enfócate en una build (ej. Máximo daño de área o máxima velocidad de proyectiles).
4. **Dash**: Usa el Dash (Espacio/Shift) para atravesar hordas o escapar de situaciones críticas. Tienes cargas limitadas que se regeneran.
5. **Koban**: Recoge monedas de oro (Koban) para aumentar tu puntuación y prepararte para la futura tienda de meta-progresión.

## 🏗️ Arquitectura del Proyecto

El juego utiliza una arquitectura desacoplada basada en eventos y estado global:

- **Estado (Zustand)**: `useGameStore` centraliza toda la lógica de la run (HP, XP, Posición de enemigos). Esto permite que la UI y el mundo 3D reaccionen instantáneamente a los cambios.
- **Física (Rapier)**: Los enemigos y el jugador son `RigidBodies`. La detección de colisiones se maneja a través del motor de física para permitir retroceso (knockback) realista.
- **Habilidades (AbilityManager)**: Un orquestador que renderiza las habilidades activas del jugador basándose en el estado del store. Cada habilidad es un componente autónomo (`KunaiOrbital`, `LightningStrike`, etc.).
- **Spawn System**: `EnemySpawner` maneja oleadas procedimentales, aumentando la dificultad según el tiempo transcurrido.
- **Assets**: Todos los modelos 3D (`src/components/models`) son procedimentales (Three.js primitives), optimizando el tamaño del bundle y permitiendo personalización dinámica.

## 🗺️ Roadmap de Desarrollo

### 🟢 Alfa (Actual)
- Movimiento básico y Dash.
- 4 Habilidades básicas con 8 niveles.
- 4 tipos de enemigos.
- HUD y Menús funcionales.

### 🟡 Beta (Próximamente)
- **Sistema de Items Pasivos**: Botas de velocidad, armadura, imán de XP.
- **Bosses**: Encuentros únicos cada 5 y 10 minutos.
- **Mapas**: Nuevo mapa "Bosque de Bambú" con obstáculos dinámicos.
- **Efectos**: Mejoras de partículas (Sangre, Impactos, Viento).

### 🔴 Versión 1.0
- **Tienda de Meta-Progresión**: Gasta tus Kobans en mejoras permanentes.
- **Personajes**: 6 personajes únicos con habilidades iniciales distintas.
- **Logros**: Sistema de retos internos.

## Estructura del Proyecto
- `src/components/game`: Lógica de habilidades y combate.
- `src/components/models`: Assets 3D estilizados construidos con primitivas.
- `src/store`: Gestión de estado con Zustand (persistido).
- `src/systems`: Sistemas globales como el Spawner de enemigos.
- `src/data`: Definiciones de habilidades, oleadas y niveles.
