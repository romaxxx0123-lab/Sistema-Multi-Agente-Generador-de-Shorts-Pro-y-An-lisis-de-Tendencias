import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import manifestJson from '../src/assets/models/manifest.json';
import { hasModel, modelFailures, modelGeometry, modelNames, modelObject, preloadModels } from '../src/render/assets';

interface ManifestModel {
  tris: number;
  min: [number, number, number];
  max: [number, number, number];
}
const manifest = manifestJson as unknown as Record<string, { models: Record<string, ManifestModel> }>;
const expected = Object.entries(manifest).flatMap(([file, e]) => Object.entries(e.models).map(([name, m]) => ({ file, name, ...m })));

describe('modelos de Blender', () => {
  beforeAll(async () => {
    await preloadModels();
  });

  it('se cargan todos los del manifiesto, sin fallos ni nombres repetidos', () => {
    expect(modelFailures()).toEqual([]);
    const names = modelNames();
    expect(new Set(names).size).toBe(names.length);
    for (const m of expected) expect(hasModel(m.name), m.name).toBe(true);
    expect(expected.length).toBeGreaterThan(0);
  });

  it('la geometría conserva tamaño, base en el suelo, triángulos y color por vértice', () => {
    for (const m of expected) {
      const geo = modelGeometry(m.name);
      expect(geo, m.name).not.toBeNull();
      const box = geo!.boundingBox!;
      // Cuantización a 14 bits: error de milímetros.
      for (let i = 0; i < 3; i++) {
        expect(box.min.getComponent(i), `${m.name} min[${i}]`).toBeCloseTo(m.min[i]!, 2);
        expect(box.max.getComponent(i), `${m.name} max[${i}]`).toBeCloseTo(m.max[i]!, 2);
      }
      expect(box.min.y, `${m.name} apoyado en y = 0`).toBeGreaterThan(-0.02);
      const tris = (geo!.getIndex()?.count ?? geo!.getAttribute('position').count) / 3;
      expect(tris, m.name).toBe(m.tris);
      const c = geo!.getAttribute('color');
      let colored = 0;
      for (let i = 0; i < c.count; i++) if (c.getX(i) < 0.99 || c.getY(i) < 0.99 || c.getZ(i) < 0.99) colored++;
      expect(colored, `${m.name} tiene color`).toBeGreaterThan(0);
      let finite = true;
      for (let i = 0; i < c.count; i++) finite &&= Number.isFinite(c.getX(i));
      expect(finite, `${m.name} color finito`).toBe(true);
      expect(modelGeometry(m.name)).toBe(geo);
    }
  });

  it('modelObject da copias independientes con normales', () => {
    const a = modelObject(expected[0]!.name)!;
    const b = modelObject(expected[0]!.name)!;
    expect(a).not.toBe(b);
    let meshes = 0;
    a.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      meshes++;
      expect(mesh.geometry.getAttribute('normal')).toBeTruthy();
    });
    expect(meshes).toBeGreaterThan(0);
    const box = new THREE.Box3().setFromObject(a);
    expect(box.min.y).toBeGreaterThan(-0.02);
  });

  it('un modelo que no existe devuelve null (la vista usa el procedimental)', () => {
    expect(modelGeometry('no_existe')).toBeNull();
    expect(modelObject('no_existe')).toBeNull();
  });
});
