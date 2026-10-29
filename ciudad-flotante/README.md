# Ciudad Flotante

Survival 3D low-poly en el navegador. Vives a bordo de un barco que es tu hogar y una pequeña
ciudad flotante: recoges lo que el mar trae, pescas, cocinas, fabricas herramientas, reparas
averías, convives con otros habitantes y amplías el barco mientras viaja sin descanso por el océano.

El diseño completo está en [docs/GDD.md](docs/GDD.md).

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
| Interactuar (abrir, dormir, hablar) | E (mantener E para ayudar en obras) |
| Usar la herramienta (gancho, caña, cubo, martillo) | Clic izquierdo |
| Comer o beber lo seleccionado | Clic derecho o F |
| Reparar | R |
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

## Desarrollo

```bash
npm test             # tests de simulación (Vitest)
npm run typecheck    # TypeScript estricto
node scripts/shot.mjs --out test-output/captura.png   # captura en Chromium headless
```

- Arquitectura y decisiones técnicas: [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md)
- Diseño detallado de cada sistema: [docs/SISTEMAS.md](docs/SISTEMAS.md)

Tecnologías: TypeScript, Three.js, Vite, Vitest, Playwright (pruebas visuales).
