# Ciudad Flotante

Survival 3D low-poly en el navegador. Vives a bordo de un barco que es tu hogar y una pequeña
ciudad flotante: recoges lo que el mar trae, pescas, cocinas, fabricas herramientas, reparas
averías, convives con otros habitantes y amplías el barco mientras viaja sin descanso por el océano.

El diseño completo está en [docs/GDD.md](docs/GDD.md).

**Jugar ahora:** versión publicada como página privada en claude.ai (enlace en la conversación del
proyecto), o en local con los pasos de abajo.

### Qué hay a bordo

- Supervivencia exigente pero no molesta: hambre, sed, energía, salud, frío y enfermedades.
- Restos flotantes que se rescatan con el gancho, pesca desde la borda, agua de mar que se destila o
  se potabiliza, huertos que beben de los depósitos.
- Fabricación en banco, taller, cocina y ahumadero; energía con generadores, paneles y baterías.
- Modo construcción con vista exterior: habitaciones, máquinas, escaleras, ampliación del casco y
  **mejoras de nivel** de casi todas las instalaciones.
- Habitantes autónomos con oficios, rutinas, ánimo, amistades y roces.
- Viaje por siete regiones con clima dinámico y trece tipos de eventos que se resuelven a bordo.
- Un misterio que seguir: las páginas del cuaderno del *Albatros* llevan a **Puerto Esperanza**.

## Cómo jugar

```bash
cd ciudad-flotante
npm install
npm run dev        # abre http://localhost:5173
```

Para generar un único archivo HTML jugable sin servidor:

```bash
npm run build:single   # crea dist-single/ciudad-flotante.html
```

### Controles

| Acción | Tecla |
|---|---|
| Moverse / correr / saltar | WASD / Mayús / Espacio |
| Mirar | Ratón |
| Interactuar (beber del depósito, coger una caja, cosechar, abrir, dormir, hablar) | E (mantener E: abrir el panel o ayudar en obras) |
| Usar la herramienta (gancho, caña, cubo, martillo) | Clic izquierdo |
| Comer o beber lo seleccionado | Clic derecho o F |
| Reparar (en el depósito: llenar una botella) | R |
| Barra rápida | 1–8 o rueda del ratón |
| Inventario / fabricar / diario | Tab o I / C / J |
| Modo construcción | B |
| Primera o tercera persona | V |
| Pausa | Esc |

### Primeros pasos

1. Con el gancho (tecla 1) apunta a los restos que flotan junto al barco y haz clic.
2. Guarda madera y chatarra en el almacén; fabrica una caña en el banco de trabajo.
3. Pesca desde la borda y cocina el pescado en la cocina con leña.
4. Bebe del depósito de la bodega y rellena botellas.
5. Sube al puente: en el timón eliges el rumbo y respondes a los avistamientos.
6. Pulsa B para construir: camarotes para nuevos habitantes, huertos, depósitos, talleres…
7. Lee la hoja doblada que llevas en la mochila (F o clic derecho): es la primera página del
   cuaderno de la capitana Elena Duarte.

## Desarrollo

```bash
npm test             # tests de simulación (Vitest)
npm run typecheck    # TypeScript estricto
node scripts/shot.mjs --out test-output/captura.png   # captura en Chromium headless
```

- Arquitectura y decisiones técnicas: [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md)
- Diseño detallado de cada sistema: [docs/SISTEMAS.md](docs/SISTEMAS.md)

Tecnologías: TypeScript, Three.js, Vite, Vitest, Playwright (pruebas visuales).
