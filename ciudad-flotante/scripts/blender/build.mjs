/**
 * npm run models [-- archivo ...]
 * Exporta la paleta del juego (src/render/palette.ts → scripts/blender/palette.json), genera los
 * modelos con Blender (scripts/blender/build.py) y los optimiza para la página de un solo archivo:
 * sin normales en las mallas estáticas (el juego las recalcula planas), vértices soldados,
 * cuantización (KHR_mesh_quantization) y compresión meshopt (EXT_meshopt_compression).
 * Busca el Python con bpy en $BLENDER_PY o en el entorno de scripts/blender/setup.sh (lo instala si falta).
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, prune, quantize, reorder, weld } from '@gltf-transform/functions';
import { build } from 'esbuild';
import { MeshoptEncoder } from 'meshoptimizer';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');

const out = await build({ entryPoints: [join(ROOT, 'src/render/palette.ts')], bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'error' });
const mod = await import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));
writeFileSync(join(HERE, 'palette.json'), JSON.stringify(mod.PALETTE, null, 2) + '\n');

const venv = process.env.BLENDER_VENV ?? join(homedir(), '.cache/ciudad-flotante/blender');
let py = process.env.BLENDER_PY ?? join(venv, 'bin/python');
if (!existsSync(py)) {
  const r = spawnSync('bash', [join(HERE, 'setup.sh')], { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
  py = join(venv, 'bin/python');
}
const OUT = join(ROOT, 'src/assets/models');
const started = Date.now();
const r = spawnSync(py, [join(HERE, 'build.py'), '--', ...process.argv.slice(2)], { stdio: 'inherit', cwd: ROOT });

// Optimiza los .glb que Blender acaba de escribir.
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
for (const f of readdirSync(OUT).filter((f) => f.endsWith('.glb'))) {
  const path = join(OUT, f);
  if (statSync(path).mtimeMs < started) continue;
  const before = statSync(path).size;
  const doc = await io.read(path);
  const root = doc.getRoot();
  const skinned = new Set(root.listNodes().filter((n) => n.getSkin()).map((n) => n.getMesh()));
  for (const mesh of root.listMeshes()) {
    if (skinned.has(mesh)) continue;
    for (const prim of mesh.listPrimitives()) prim.setAttribute('NORMAL', null);
  }
  await doc.transform(dedup(), weld(), reorder({ encoder: MeshoptEncoder }), quantize({ quantizeColor: 12 }), prune());
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
  await io.write(path, doc);
  console.log(`  ${f}: ${(before / 1024).toFixed(0)} KB → ${(statSync(path).size / 1024).toFixed(0)} KB`);
}
process.exit(r.status ?? 1);
