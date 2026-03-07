# Proyecto RPG Contemplativo (Unity 3D)

**Visión General del Juego**
Un juego 3D "low poly" contemplativo y pacífico con una ambientación católica medieval/fantástica. El enfoque está en la exploración, la interacción con NPCs, y misiones basadas en valores altruistas que resultan en cambios persistentes y significativos en el entorno. No hay combate tradicional.

**Pilares del Diseño**
- Exploración guiada por la curiosidad, sin marcadores intrusivos.
- Narrativa ambiental y diálogos contextuales profundos.
- Progresión basada en el impacto positivo y la transformación del mundo.
- Atmósfera etérea y pacífica.

**Stack Técnico**
- Unity 3D (2022.3 LTS o superior recomendado)
- C# (Arquitectura orientada a eventos y desacoplada)
- Render Pipeline: URP (Universal Render Pipeline) por defecto para control estilizado.

**Estructura del Proyecto**
Todo el contenido específico de nuestro juego se encuentra aislado en `Assets/_Project/` para mantener el repositorio limpio de plugins y dependencias externas.
- `Assets/_Project/Scripts/`: Lógica del juego.
- `Assets/_Project/Scenes/`: Escenas (niveles, menús).
- `Assets/_Project/Prefabs/`: Objetos reutilizables.
- `Assets/_Project/ScriptableObjects/`: Datos persistentes y configuración.
- `Assets/_Project/Art/`: Modelos 3D, texturas, materiales.
- `Assets/_Project/UI/`: Assets de interfaz gráfica.
- `Docs/`: Documentación del proyecto (GDD, Arquitectura, Roadmap).

**Cómo abrirlo en Unity**
1. Clona el repositorio.
2. Abre Unity Hub.
3. Selecciona "Add" o "Open" y elige la carpeta raíz del repositorio.
4. (Nota: Dado que este repositorio convive con una aplicación React, ignora las carpetas ajenas a Unity como `src/` o `node_modules/`).

**Roadmap Resumido**
1. Iteración 1: Estructura base y documentación (¡Completada!).
2. Iteración 2: Base Unity Real y Scripts Fundacionales (¡Completada!).
3. Iteración 3: Núcleo jugable en el Editor (Movimiento, interacción básica).
4. Iteración 4: Sistemas de diálogo y persistencia del mundo.
5. Consulte `Docs/Roadmap.md` para más detalles.

---

*Nota: Este repositorio también aloja la siguiente aplicación heredada:*

# Autolingo: Aprende sobre Autos al estilo Duolingo

Una plataforma educativa profesional diseñada para entusiastas del automovilismo y la ingeniería mecánica, utilizando el exitoso sistema de aprendizaje gamificado de Duolingo.

## Características

- **Currículum Profesional**: Desde transferencia de peso hasta aerodinámica avanzada (DRS) y propulsión eléctrica.
- **Mascota "Epic Pro"**: Nuestro pingüino corredor te guía con su traje de competencia y casco profesional.
- **Race HUD**: El progreso se mide en RPM con un indicador de marchas (Gear Indicator) dinámico.
- **Sistema de Licencias**: Completa desafíos para obtener tus licencias B, A y S-Pro.
- **Feedback Inmediato**: Sonidos y animaciones táctiles para una experiencia inmersiva.

## Tecnologías

- **React 18** + **TypeScript**
- **Tailwind CSS v4** (Estética Duolingo 3D)
- **Framer Motion** (Animaciones fluidas)
- **Zustand** (Gestión de estado persistente)
- **Lucide React** (Iconografía)

## Instalación

```bash
npm install
npm run dev
```