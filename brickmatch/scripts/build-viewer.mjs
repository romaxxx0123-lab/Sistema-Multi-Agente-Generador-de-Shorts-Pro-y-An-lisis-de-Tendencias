// Construye la mini app en dist/:
//   dist/index.html     página completa para abrir en local (npm run serve)
//   dist/artifact.html  la misma página sin <html>/<head>, lista para publicar
//   dist/app.js         visor (three.js incluido)
//   dist/models/…       modelos generados (model.mpd + report.json) e index.json
//
// Uso: npm run viewer
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
fs.mkdirSync(path.join(dist, 'models'), { recursive: true });

await build({
  entryPoints: [path.join(root, 'viewer/src/main.js')],
  bundle: true,
  minify: true,
  format: 'iife',
  target: 'es2020',
  outfile: path.join(dist, 'app.js'),
  legalComments: 'none',
  logLevel: 'warning',
});

const index = [];
for (const id of fs.readdirSync(path.join(root, 'models')).sort()) {
  const dir = path.join(root, 'models', id);
  if (!fs.existsSync(path.join(dir, 'report.json')) || !fs.existsSync(path.join(dir, 'model.mpd'))) continue;
  const report = JSON.parse(fs.readFileSync(path.join(dir, 'report.json'), 'utf8'));
  const out = path.join(dist, 'models', id);
  fs.mkdirSync(out, { recursive: true });
  fs.copyFileSync(path.join(dir, 'model.mpd'), path.join(out, 'model.mpd'));
  fs.copyFileSync(path.join(dir, 'report.json'), path.join(out, 'report.json'));
  if (fs.existsSync(path.join(dir, 'figs.mpd'))) fs.copyFileSync(path.join(dir, 'figs.mpd'), path.join(out, 'figs.mpd'));
  else fs.rmSync(path.join(out, 'figs.mpd'), { force: true });
  if (!id.startsWith('_')) index.push({ id, title: report.title, pieces: report.counts.pieces, order: report.order || 0 });
}
// Primero los modelos más nuevos (meta.order más alto); después por nombre.
index.sort((a, b) => b.order - a.order || a.id.localeCompare(b.id));
fs.writeFileSync(path.join(dist, 'models/index.json'), JSON.stringify(index));

const page = fs.readFileSync(path.join(root, 'viewer/page.html'), 'utf8');
fs.writeFileSync(path.join(dist, 'artifact.html'), page);
fs.writeFileSync(
  path.join(dist, 'index.html'),
  `<!doctype html>\n<html lang="es">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n<style>body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style>\n</head>\n<body>\n${page}\n</body>\n</html>\n`,
);
const kb = (f) => `${(fs.statSync(path.join(dist, f)).size / 1024).toFixed(0)} KB`;
console.log(`Visor listo en dist/: app.js ${kb('app.js')}, ${index.length} modelo(s): ${index.map((m) => m.id).join(', ') || '(ninguno)'}`);
