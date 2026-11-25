// Build: empaqueta todo el juego en un único HTML autocontenido (jugable con doble clic, sin servidor).
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const watch = process.argv.includes('--watch');
const dev = process.argv.includes('--dev');

async function buildOnce() {
  const t0 = Date.now();
  const res = await esbuild.build({
    entryPoints: [path.join(ROOT, 'src/main.js')],
    bundle: true,
    format: 'iife',
    minify: !dev,
    sourcemap: dev ? 'inline' : false,
    target: 'es2020',
    write: false,
    legalComments: 'none',
    charset: 'utf8',
    define: { 'process.env.NODE_ENV': '"production"' },
    loader: { '.glb': 'binary' },
    logLevel: 'warning',
  });
  const js = res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
  const css = fs.readFileSync(path.join(ROOT, 'src/styles.css'), 'utf8');
  const head = fs.readFileSync(path.join(ROOT, 'src/head.html'), 'utf8');
  const body = fs.readFileSync(path.join(ROOT, 'src/body.html'), 'utf8');
  fs.mkdirSync(path.join(ROOT, 'build'), { recursive: true });
  // 1) Documento completo (para abrir localmente)
  const full = `<!doctype html>\n<html lang="es">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">\n${head}\n<style>${css}</style>\n</head>\n<body>\n${body}\n<script>${js}</script>\n</body>\n</html>\n`;
  fs.writeFileSync(path.join(ROOT, 'build/costa-neon.html'), full);
  // 2) Variante para Artifact (el host agrega doctype/head/body)
  const artifact = `${head}\n<style>${css}</style>\n${body}\n<script>${js}</script>\n`;
  fs.writeFileSync(path.join(ROOT, 'build/artifact.html'), artifact);
  const kb = (Buffer.byteLength(full) / 1024).toFixed(0);
  console.log(`[build] ok en ${Date.now() - t0} ms — ${kb} KB`);
}

if (watch) {
  await buildOnce();
  let timer = null;
  fs.watch(path.join(ROOT, 'src'), { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(() => buildOnce().catch((e) => console.error(e.message)), 120);
  });
  console.log('[build] observando cambios…');
} else {
  await buildOnce();
}
