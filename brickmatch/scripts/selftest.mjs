// Prueba el validador con armados que se sabe que están bien y que están mal.
// Uso: node scripts/selftest.mjs
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LDrawLibrary, defaultLibraryRoot } from '../lib/ldraw.mjs';
import { Catalog, defaultIndexDir } from '../lib/catalog.mjs';
import { resolvePalette } from '../lib/palette.mjs';
import { Model } from '../lib/builder.mjs';
import { validate } from '../lib/validate.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lib = new LDrawLibrary(defaultLibraryRoot(root));
const cat = new Catalog(defaultIndexDir(root));
const palette = resolvePalette(lib, cat);
const fresh = () => new Model({ id: 't', title: 't', lib, palette });

let failed = 0;
function check(name, build, expect) {
  const m = fresh();
  build(m);
  const r = validate(m);
  const got = r.errors.length ? r.errors.map((e) => e.split(':')[0]).join(' | ') : 'ok';
  const pass = expect === 'ok' ? r.ok : r.errors.some((e) => e.startsWith(expect));
  if (!pass) failed++;
  const extra = expect === 'ok' ? ` (studs agarrados: ${r.stats.studsHeld}, bloques: ${r.stats.components})` : '';
  console.log(`${pass ? 'PASA ' : 'FALLA'} ${name} → ${got}${extra}`);
  if (!pass) for (const e of r.errors) console.log('       ', e);
  return r;
}

// --- armados correctos -------------------------------------------------------
check('ladrillo 2x4 sobre ladrillo 2x4', (m) => { m.add('3001', 'Red', 0, 0, 0); m.add('3001', 'Blue', 0, 3, 0); }, 'ok');
check('ladrillo 2x4 corrido 2 studs', (m) => { m.add('3001', 'Red', 0, 0, 0); m.add('3001', 'Blue', 2, 3, 0); }, 'ok');
check('ladrillo 2x4 girado y cruzado', (m) => { m.add('3001', 'Red', 0, 0, 0); m.add('3001', 'Blue', 1, 3, -1, { rot: 1 }); }, 'ok');
check('plate, tile y redondo sobre ladrillo', (m) => {
  m.add('3001', 'Red', 0, 0, 0);
  m.add('3024', 'White', 0, 3, 0); m.add('3070b', 'White', 0, 4, 0);
  m.add('3062b', 'Black', 1, 3, 0); m.add('6141', 'Pearl Gold', 1, 6, 0);
  m.add('3069b', 'Tan', 2, 3, 0); m.add('3023', 'Tan', 2, 3, 1);
}, 'ok');
check('vecinos pegados no chocan', (m) => {
  m.add('3020', 'Green', 0, 0, 0); m.add('3020', 'Green', 4, 0, 0); m.add('3020', 'Green', 0, 0, 2);
  m.add('3001', 'Red', 0, 1, 0); m.add('3001', 'Red', 4, 1, 0); m.add('3001', 'Red', 2, 1, 2);
}, 'ok');
check('pendientes 45 y 33 sobre ladrillos', (m) => {
  m.add('3001', 'Red', 0, 0, 0); m.add('3001', 'Red', 0, 0, 2); m.add('3001', 'Red', 0, 0, 4);
  m.add('3040b', 'Black', 0, 3, 0, { face: 'S' }); m.add('3039', 'Black', 1, 3, 0, { face: 'S' });
  m.add('4286', 'Black', 3, 3, 3, { face: 'N' }); m.add('3040b', 'Black', 0, 3, 4, { face: 'N' });
}, 'ok');
check('jumper + plate a medio stud', (m) => {
  m.add('3001', 'Red', 0, 0, 0); m.add('15573', 'White', 0, 3, 0); m.add('3024', 'Blue', 0.5, 4, 0);
}, 'ok');
check('stud lateral (87087) con plate redondo', (m) => {
  m.add('3001', 'Red', 0, 0, 0);
  const b = m.add('87087', 'White', 0, 3, 0);
  m.onStud(b, 1, '6141', 'Pearl Gold');
}, 'ok');
check('arco con ladrillo debajo', (m) => {
  m.add('3020', 'Green', 0, 0, 0);
  m.add('3005', 'Red', 0, 1, 0); m.add('3005', 'Red', 3, 1, 0); m.add('3659', 'Red', 0, 4, 0);
  m.add('3024', 'Blue', 1, 1, 0); m.add('3024', 'Blue', 2, 1, 0);
}, 'ok');
check('cerca, pendiente invertida y cono', (m) => {
  m.add('3020', 'Green', 0, 0, 0); m.add('3185', 'Black', 0, 1, 0);
  m.add('3001', 'Red', 0, 1, 1); m.add('3665', 'Red', 0, 4, 2, { rot: 2 }); m.add('4589', 'Red', 3, 4, 1);
}, 'ok');

// Uniones que no son por stud: se declaran con { on } y el validador las comprueba.
const katana = (m, dz) => {
  m.add('3005', 'Red', 0, 0, 0);
  const clip = m.add('60897', 'Blue', 0, 3, 0, { face: 'N' });
  m.addRaw('21459', 'Black', [1, 0, 0, 0, 1, 0, 0, 0, 1, 10, -8 * 4 + 4 - 7, 10 + dz], { on: clip });
};
check('katana en su clip', (m) => katana(m, 20), 'ok');
check('llama en el stud hueco de un ladrillo redondo', (m) => {
  m.add('3001', 'Red', 0, 0, 0); m.add('3062b', 'Black', 0, 3, 0);
  m.addRaw('6126b', 'Trans-Orange', [1, 0, 0, 0, 0, -1, 0, 1, 0, 10, -8 * 6 - 6, 10]);
}, 'ok');
check('plato giratorio: la tapa dentro de la base', (m) => {
  m.add('3001', 'Red', 0, 0, 0);
  const base = m.add('3680', 'Blue', 0, 3, 0);
  m.add('3679', 'Light Bluish Gray', 0, 3, 0, { on: base });
  m.add('3003', 'Red', 0, 4, 0);
}, 'ok');

// --- armados imposibles ------------------------------------------------------
check('katana corrida 3 LDU del centro del clip', (m) => katana(m, 17), 'Choque');
check('katana declarada en un clip que no toca', (m) => katana(m, 60), 'Unión declarada sin contacto');
check('dos ladrillos superpuestos', (m) => { m.add('3001', 'Red', 0, 0, 0); m.add('3001', 'Blue', 1, 0, 0); }, 'Choque');
check('ladrillo hundido un plate en otro', (m) => { m.add('3001', 'Red', 0, 0, 0); m.add('3001', 'Blue', 0, 2, 0); }, 'Choque');
check('misma pieza dos veces', (m) => { m.add('3001', 'Red', 0, 0, 0); m.add('3001', 'Red', 0, 0, 0); }, 'Pieza duplicada');
check('ladrillo a medio stud sin jumper', (m) => { m.add('3001', 'Red', 0, 0, 0); m.add('3001', 'Blue', 0.5, 3, 0); }, 'Stud aplastado');
check('plate 1x1 a medio stud sin jumper', (m) => { m.add('3001', 'Red', 0, 0, 0); m.add('3024', 'Blue', 0.5, 3, 0); }, 'Stud aplastado');
check('ladrillo flotando', (m) => { m.add('3001', 'Red', 0, 0, 0); m.add('3001', 'Blue', 0, 4, 0); }, 'Pieza sin sostén');
check('ladrillo al lado, en el aire', (m) => { m.add('3001', 'Red', 0, 0, 0); m.add('3001', 'Blue', 4, 3, 0); }, 'Pieza sin sostén');
check('tile tapado por un ladrillo', (m) => { m.add('3001', 'Red', 0, 0, 0); m.add('3068b', 'White', 0, 3, 0); m.add('3003', 'Blue', 0, 4, 0); }, 'Pieza sin sostén');

console.log(failed ? `\n${failed} prueba(s) fallaron` : '\nTodas las pruebas pasaron');
process.exit(failed ? 1 : 0);
