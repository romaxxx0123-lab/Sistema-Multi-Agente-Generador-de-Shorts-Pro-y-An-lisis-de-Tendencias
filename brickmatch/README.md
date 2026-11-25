# BrickMatch

Diseñá un modelo con piezas LEGO® reales, miralo en 3D y averiguá qué set trae
la mayoría de esas piezas para comprarlo y armar tu diseño en vez del oficial.

Proyecto independiente del resto del repo: vive entero en esta carpeta.

| Pabellón Zen: 285 piezas, 100 % con el set 10315 | Templo Zen Ninjago: 307 piezas, diseño libre |
| --- | --- |
| ![Pabellón Zen](models/pabellon-zen/renders/hero.jpg) | ![Templo Zen Ninjago](models/templo-zen/renders/hero.jpg) |

## Cómo se usa

1. Le pedís un modelo a Claude por chat ("quiero una casa Zen Ninjago").
2. Claude lo escribe pieza por pieza en `models/<id>/model.mjs` y corre el flujo:
   arma el modelo, lo **valida físicamente**, saca renders para revisarlo y
   **busca en todos los sets** cuál cubre más piezas.
3. Lo ves en la mini app: modelo 3D, pasos de armado, lista de piezas y ranking
   de sets. Al elegir un set, el modelo marca en rojo lo que te faltaría.

Cuando ningún set cubre lo suficiente, el diseño se adapta a un set concreto.
Los dos modelos de ejemplo muestran la diferencia:

| Modelo | Piezas | Mejor set | Cobertura exacta |
| --- | --- | --- | --- |
| `pabellon-zen` (adaptado) | 285 | 10315 Tranquil Garden (1.363 piezas) | 285 de 285, **100 %** |
| `templo-zen` (diseño libre) | 307 | 71861 The Old Town (4.852 piezas) | 106 de 307, 34,5 % |

## Comandos

```bash
npm install
npm run data                     # baja piezas 3D + base de sets y arma el índice (una vez, ~600 MB)
npm run model -- pabellon-zen    # arma, valida y rankea sets → model.ldr, model.mpd, report.json
npm run viewer                   # construye la mini app en dist/
npm run serve                    # la abre en http://localhost:4173
npm run render -- pabellon-zen   # capturas para revisar (hero, lado, frente, atras, arriba, detalle)
```

Herramientas para diseñar:

```bash
node scripts/inspect-part.mjs 3675 3297        # medidas, studs y orientación de una pieza
node scripts/part-info.mjs 3675                # en qué colores existe y en cuántos sets salió
node scripts/part-info.mjs --find "slope 33"   # buscar piezas por nombre
node scripts/set-summary.mjs 10315-1           # inventario de un set, por categoría
node scripts/who-has.mjs 3675 4 --max=3000     # qué sets traen más de una pieza
node scripts/coverage.mjs templo-zen --max=2500    # ranking filtrado por tamaño
node scripts/coverage.mjs pabellon-zen 10315-1     # qué falta con un set y qué alternativas trae
node scripts/selftest.mjs                      # pruebas del validador
```

## Cómo se escribe un modelo

Grilla en studs (x, z) y plates (y). Cada pieza se coloca por la esquina de su
huella y la altura de su base; el número y el color son los reales.

```js
export const meta = { title: 'Casita', prompt: 'una casita', description: '…' };

export default function build(m, { rect, fill, roofRing }) {
  m.step('Base');
  rect('plate', 'Green', 0, 0, 0, 8, 8);            // plate 8x8
  m.step('Paredes');
  m.add('3062b', 'Red', 0, 1, 0);                   // ladrillo redondo 1x1
  m.add('3040b', 'Black', 2, 4, 0, { face: 'S' });  // pendiente mirando al frente
  m.step('Techo');
  roofRing('Black', 0, 7, 0, 8, 8);                 // faldón de techo a 33°
}
```

`m.onStud(pieza, n, …)` encastra sobre un stud concreto (sirve para studs
laterales) y `{ on: otraPieza }` declara uniones que no son por stud (barras,
vidrios en su marco).

## Qué revisa el validador

Trabaja con la geometría real de cada pieza, no con cajas:

- **Choques**: dos piezas que se atraviesan.
- **Studs**: cada stud tapado tiene que entrar en un encastre de la pieza de
  arriba. Si la pieza está corrida medio stud, lo marca como aplastado.
- **Conexión**: toda pieza tiene que estar encastrada en algo que llegue al
  suelo, y avisa si el modelo queda en bloques sueltos.
- **Existencia**: cada pieza en ese color tiene que haber salido en algún set.
  También avisa si es rara o si el número significa piezas distintas en los
  dos catálogos.

No calcula resistencia: una pieza sostenida por un solo stud cuenta como unida.

## Cómo se rankean los sets

Para cada uno de los 21.383 sets con inventario se usa la última versión del
inventario, más las piezas de sus minifiguras y de los sets incluidos en packs.

- **Exacto**: misma pieza (las variantes de molde cuentan como la misma) y mismo color.
- **Forma**: la misma pieza en cualquier color, incluidas versiones impresas.
- **Repuestos**: las piezas extra de la caja se cuentan aparte y son opcionales.

El reporte guarda los 400 mejores sets por color exacto, los 150 mejores por
forma y, para los 12 primeros, el mejor segundo set para completar lo que falta.

## Carpetas

```
lib/        motor: ldraw (geometría), builder (colocar piezas), validate, catalog, match, palette, helpers
scripts/    comandos de arriba
models/     un modelo por carpeta: model.mjs (fuente) + model.ldr, model.mpd, report.json, renders/
viewer/     mini app (three.js): page.html + src/
data/       datos bajados (no se versiona)
dist/       mini app construida (no se versiona)
```

`model.ldr` es LDraw estándar con los pasos: se abre en BrickLink Studio, LeoCAD o LDView.

## Límites conocidos

- La librería de piezas 3D es la edición 2023-03 de LDraw (la del paquete de
  Ubuntu): no hay piezas posteriores. Con `LDRAW_DIR` se puede apuntar a una más nueva.
- Las piezas impresas se dibujan sin el dibujo; los modelos de ejemplo no usan ninguna.
- La base de sets no trae precios ni disponibilidad en tiendas.

## Datos y créditos

- Geometría de piezas: [LDraw](https://www.ldraw.org/) Parts Library, CC BY 4.0.
- Sets, inventarios y colores: [Rebrickable](https://rebrickable.com/downloads/),
  empaquetados como SQLite por [rb.db](https://github.com/ojuuji/rb.db).
- Visor: [three.js](https://threejs.org/) y su `LDrawLoader`.

LEGO® es una marca de The LEGO Group, que no patrocina ni avala este proyecto.
