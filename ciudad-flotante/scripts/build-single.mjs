#!/usr/bin/env node
/**
 * Empaqueta el juego en UN solo archivo HTML (JS y CSS en línea) para publicarlo o
 * abrirlo sin servidor. Ejecuta antes `vite build`.
 *   node scripts/build-single.mjs  ->  dist-single/ciudad-flotante.html
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const root = resolve(dirname(new URL(import.meta.url).pathname), '..');
const dist = join(root, 'dist');
let html = readFileSync(join(dist, 'index.html'), 'utf8');

html = html.replace(/<link rel="stylesheet"[^>]*href="\.?\/?([^"]+\.css)"[^>]*>/g, (_m, href) => {
  const css = readFileSync(join(dist, href), 'utf8');
  return `<style>\n${css}\n</style>`;
});
html = html.replace(/<script type="module"[^>]*src="\.?\/?([^"]+\.js)"[^>]*><\/script>/g, (_m, src) => {
  const js = readFileSync(join(dist, src), 'utf8').replace(/<\/script/gi, '<\\/script');
  return `<script type="module">\n${js}\n</script>`;
});
html = html.replace(/<link rel="modulepreload"[^>]*>/g, '');

const outDir = join(root, 'dist-single');
mkdirSync(outDir, { recursive: true });
const out = join(outDir, 'ciudad-flotante.html');
writeFileSync(out, html);
console.log(`Generado ${out} (${(html.length / 1024).toFixed(0)} KB)`);
