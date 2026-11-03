#!/usr/bin/env node
/**
 * Empaqueta el juego en UN solo archivo HTML (JS y CSS en línea) para publicarlo o
 * abrirlo sin servidor. Ejecuta antes `vite build`.
 *   node scripts/build-single.mjs  ->  dist-single/ciudad-flotante.html
 *                                      dist-single/ciudad-flotante.artifact.html (página de claude.ai)
 *
 * Comprueba su salida y falla (código 1, sin escribir nada) si queda alguna referencia a un
 * archivo externo: un <script src>/<link href> sin incrustar, un trozo de código aparte (p. ej. por
 * un `import()` dinámico) o cualquier otro archivo de dist/assets que el código nombre.
 * Funciona con rutas con espacios o acentos (y en Windows).
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const indexPath = join(dist, 'index.html');
if (!existsSync(indexPath)) fail(`No existe ${indexPath}: ejecuta antes «npm run build» (o usa «npm run build:single»).`);

function fail(msg) {
  console.error(`build-single: ${msg}`);
  process.exit(1);
}

/** Ruta de un archivo de dist a partir de un atributo src/href relativo ("./assets/x.js"). */
function distFile(ref) {
  const clean = decodeURIComponent(ref.replace(/^\.?\//, '').split(/[?#]/)[0]);
  const file = resolve(dist, clean);
  if (!file.startsWith(dist)) fail(`referencia fuera de dist: ${ref}`);
  if (!existsSync(file)) fail(`index.html nombra ${ref}, pero no existe en dist`);
  return file;
}

let html = readFileSync(indexPath, 'utf8');
const inlined = new Set();

html = html.replace(/<link\b[^>]*\brel="stylesheet"[^>]*>/g, (tag) => {
  const href = tag.match(/\bhref="([^"]+)"/)?.[1];
  if (!href || /^(https?:|data:)/.test(href)) return tag;
  const file = distFile(href);
  inlined.add(file);
  return `<style>\n${readFileSync(file, 'utf8')}\n</style>`;
});
html = html.replace(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/g, (tag, src) => {
  if (/^(https?:|data:)/.test(src)) return tag;
  if (!/\btype="module"/.test(tag)) fail(`script clásico sin incrustar: ${tag}`);
  const file = distFile(src);
  inlined.add(file);
  const js = readFileSync(file, 'utf8').replace(/<\/script/gi, '<\\/script');
  return `<script type="module">\n${js}\n</script>`;
});
html = html.replace(/<link\b[^>]*\brel="modulepreload"[^>]*>/g, '');

/* ---------------- Comprobaciones ---------------- */

const problems = [];
// 1) El esqueleto (sin el contenido de <script> y <style>) no puede cargar nada de fuera.
const shell = html.replace(/(<script\b[^>]*>)[\s\S]*?<\/script>/g, '$1</script>').replace(/(<style\b[^>]*>)[\s\S]*?<\/style>/g, '$1</style>');
for (const m of shell.matchAll(/<(script|link|img|source|iframe|video|audio)\b[^>]*\b(src|href)="([^"]*)"[^>]*>/gi)) {
  const ref = m[3];
  if (/^(data:|#)/.test(ref)) continue;
  // Las fuentes de Google van por @import en el CSS; en el esqueleto no se admite nada externo.
  problems.push(`<${m[1]} ${m[2]}="${ref}"> sin incrustar`);
}
// 2) Todo el JavaScript de dist/assets tiene que ir dentro (si no, hay un trozo aparte que no cargaría).
const assetsDir = join(dist, 'assets');
const assetFiles = existsSync(assetsDir) ? readdirSync(assetsDir) : [];
for (const f of assetFiles) {
  const file = join(assetsDir, f);
  if (/\.(m?js)$/.test(f) && !inlined.has(file)) problems.push(`trozo de código aparte sin incrustar: assets/${f} (¿un import() dinámico?)`);
}
// 3) Ningún otro archivo de dist/assets puede aparecer nombrado en el HTML final.
for (const f of assetFiles) {
  const file = join(assetsDir, f);
  if (inlined.has(file)) continue;
  if (html.includes(f)) problems.push(`el código nombra assets/${f}, que no va incrustado`);
}
if (!/<script type="module">/.test(html)) problems.push('no hay ningún script incrustado');
if (!/<div id="app"><\/div>/.test(html)) problems.push('falta <div id="app"></div>');
if (problems.length) fail(`la salida no es autónoma:\n  - ${problems.join('\n  - ')}`);

/* ---------------- Escritura ---------------- */

const kb = (s) => `${(Buffer.byteLength(s, 'utf8') / 1024).toFixed(0)} KiB`;
const outDir = join(root, 'dist-single');
mkdirSync(outDir, { recursive: true });
const out = join(outDir, 'ciudad-flotante.html');
writeFileSync(out, html);
console.log(`Generado ${out} (${kb(html)})`);

// Variante para publicar como página de claude.ai: el visor añade su propio esqueleto
// (doctype, html, head, body), así que solo va el contenido: título, estilos, raíz y script.
const title = html.match(/<title>[\s\S]*?<\/title>/)?.[0] ?? '<title>Ciudad Flotante</title>';
const desc = html.match(/<meta name="description"[^>]*>/)?.[0] ?? '';
const styles = [...html.matchAll(/<style>[\s\S]*?<\/style>/g)].map((m) => m[0]).join('\n');
const scripts = [...html.matchAll(/<script type="module">[\s\S]*?<\/script>/g)].map((m) => m[0]).join('\n');
const artifact = `${title}\n${desc}\n${styles}\n<div id="app"></div>\n${scripts}\n`;
const outArtifact = join(outDir, 'ciudad-flotante.artifact.html');
writeFileSync(outArtifact, artifact);
console.log(`Generado ${outArtifact} (${kb(artifact)})`);
