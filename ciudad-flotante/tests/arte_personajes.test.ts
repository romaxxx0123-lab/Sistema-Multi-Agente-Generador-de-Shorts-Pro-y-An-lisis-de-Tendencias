/**
 * Ronda de arte con Blender — PERSONAJES CON ESQUELETO (scripts/blender/models/personas.py,
 * src/render/ship/characterModel.ts y character.ts).
 *
 * Comprueba que el modelo trae un clip por pose y que sus ciclos encajan, que tiene las medidas del
 * rig procedimental (sillas, camas y puestos encajan igual), que cada personaje es una sola llamada
 * de dibujo con materiales compartidos, los fundidos entre clips, el paso sincronizado con la
 * velocidad, la herramienta en la mano derecha, la manta, las piezas (peinados, gorros, abrigo) y
 * que sin el modelo todo sigue funcionando con el procedimental.
 */
import * as THREE from 'three';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import manifestJson from '../src/assets/models/manifest.json';
import { modelObject, preloadModels } from '../src/render/assets';
import { CharacterRig, characterModelsActive, lookFromAppearance, setCharacterModels, type CharacterLook, type RigPose, type RigState } from '../src/render/ship/character';
import { CHARACTER_MODEL, CLIP_FADE, POSE_CLIP, REQUIRED_CLIPS, characterTemplate, piecesFor } from '../src/render/ship/characterModel';

const manifest = manifestJson as unknown as Record<string, { models: Record<string, { tris: number; min: number[]; max: number[] }>; animations?: boolean }>;

/** Todas las poses (el tipo obliga a añadir aquí las que se añadan a RigPose). */
const POSES: Record<RigPose, true> = {
  stand: true, walk: true, sit: true, sitFloor: true, lie: true, work: true, stir: true, kneel: true, hammer: true, throw: true, talk: true,
  shelter: true, injured: true, eat: true, cast: true, reel: true, use: true, wave: true, drink: true, jump: true, cards: true, cardsStand: true, read: true,
};
const ALL_POSES = Object.keys(POSES) as RigPose[];
const SEATED: RigPose[] = ['sit', 'eat', 'cards', 'read'];

const look = (o: Partial<CharacterLook> = {}): CharacterLook => ({ ...lookFromAppearance({ skin: 1, shirt: 2, pants: 1, hair: 0, hat: false, height: 1 }, 4), hairStyle: 0, ...o });

function run(rig: CharacterRig, st: RigState, seconds: number, dt = 1 / 30): void {
  for (let t = 0; t < seconds - 1e-9; t += dt) rig.animate(st, dt);
  rig.root.updateMatrixWorld(true);
}

function bonePos(rig: CharacterRig, name: string): THREE.Vector3 {
  rig.root.updateMatrixWorld(true);
  return rig.root.getObjectByName(name)!.getWorldPosition(new THREE.Vector3());
}

/** Caja de los vértices visibles de la malla con piel (con la pose actual). */
function skinnedBox(rig: CharacterRig): THREE.Box3 {
  const mesh = rig.model!.mesh;
  mesh.updateMatrixWorld(true);
  mesh.skeleton.update();
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  const idx = mesh.geometry.getIndex()!;
  for (let i = 0; i < rig.model!.indexCount; i++) box.expandByPoint(mesh.getVertexPosition(idx.getX(i), v).applyMatrix4(mesh.matrixWorld));
  return box;
}

/** Mallas que se dibujarían (visibles con todos sus antepasados). */
function drawn(root: THREE.Object3D): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  const walk = (o: THREE.Object3D): void => {
    if (!o.visible) return;
    const g = (o as THREE.Mesh).geometry;
    const n = Math.min(g?.drawRange.count ?? 0, g?.getIndex()?.count ?? g?.getAttribute('position')?.count ?? 0);
    if ((o as THREE.Mesh).isMesh && n > 0) out.push(o as THREE.Mesh);
    for (const c of o.children) walk(c);
  };
  walk(root);
  return out;
}

beforeAll(async () => {
  await preloadModels();
});

afterEach(() => setCharacterModels(true));

describe('modelo de la persona (Blender)', () => {
  it('está en el manifiesto con su presupuesto de triángulos y trae un clip por pose', () => {
    const entry = manifest['personas']!;
    expect(entry.animations).toBe(true);
    expect(entry.models[CHARACTER_MODEL]!.tris).toBeLessThanOrEqual(2500);
    const tpl = characterTemplate();
    expect(tpl).not.toBeNull();
    for (const name of REQUIRED_CLIPS) expect(tpl!.clips.has(name), name).toBe(true);
    // cada pose quieta tiene su clip; andar, estar de pie y saludar se reparten entre varios
    for (const pose of ALL_POSES) if (pose !== 'walk' && pose !== 'stand' && pose !== 'wave') expect(REQUIRED_CLIPS).toContain(POSE_CLIP[pose]);
    expect(characterModelsActive()).toBe(true);
  });

  it('los ciclos encajan sin saltos (la última clave es la primera)', () => {
    const tpl = characterTemplate()!;
    for (const clip of tpl.clips.values()) {
      expect(clip.duration, clip.name).toBeGreaterThan(0.5);
      for (const track of clip.tracks) {
        const n = track.getValueSize();
        const last = track.values.length - n;
        for (let k = 0; k < n; k++) expect(Math.abs(track.values[k]! - track.values[last + k]!), `${clip.name} ${track.name}`).toBeLessThan(0.01);
      }
    }
  });

  it('en reposo tiene las medidas del rig procedimental y la caja del manifiesto', () => {
    // La posición de reposo pasa por los huesos (la cuantización de la malla con piel va en sus
    // matrices de enlace): así la calcula three.js y así debe coincidir con el manifiesto.
    const obj = modelObject(CHARACTER_MODEL)!;
    obj.updateMatrixWorld(true);
    const box = new THREE.Box3();
    const v = new THREE.Vector3();
    obj.traverse((o) => {
      const m = o as THREE.SkinnedMesh;
      if (!m.isSkinnedMesh) return;
      for (let i = 0; i < m.geometry.getAttribute('position').count; i++) box.expandByPoint(m.getVertexPosition(i, v).applyMatrix4(m.matrixWorld));
    });
    const e = manifest['personas']!.models[CHARACTER_MODEL]!;
    for (let i = 0; i < 3; i++) {
      expect(box.min.getComponent(i)).toBeCloseTo(e.min[i]!, 2);
      expect(box.max.getComponent(i)).toBeCloseTo(e.max[i]!, 2);
    }
    expect(box.min.y).toBeGreaterThan(-0.02);
    // Huesos en reposo: cadera a 0,9 m, hombros a 1,35 m (±0,235), rodillas a 0,40 m.
    const p = (n: string): THREE.Vector3 => obj.getObjectByName(n)!.getWorldPosition(new THREE.Vector3());
    expect(p('cadera').y).toBeCloseTo(0.9, 2);
    expect(p('brazo_d').y).toBeCloseTo(1.35, 2);
    expect(p('brazo_d').x).toBeCloseTo(0.235, 2);
    expect(p('pierna_i').y).toBeCloseTo(0.4, 2);
    expect(p('mano_d').x).toBeGreaterThan(0);
    // De pie y sin gorro, la misma altura que el procedimental (±4 cm).
    const rig = new CharacterRig(look(), 1);
    run(rig, { pose: 'stand', speed: 0 }, 0.5);
    setCharacterModels(false);
    const old = new CharacterRig(look(), 1);
    run(old, { pose: 'stand', speed: 0 }, 0.5);
    const hb = skinnedBox(rig);
    const ob = new THREE.Box3().setFromObject(old.root);
    expect(hb.max.y).toBeGreaterThan(ob.max.y - 0.04);
    expect(hb.max.y).toBeLessThan(ob.max.y + 0.04);
    expect(hb.min.y).toBeGreaterThan(-0.03);
  });
});

describe('CharacterRig con el modelo', () => {
  it('una sola llamada de dibujo por personaje, con materiales y búferes compartidos', () => {
    const a = new CharacterRig(look(), 1);
    const b = new CharacterRig(look({ skin: '#8d5524', shirt: '#264653', hat: 'beanie', hatColor: '#bc4749', hairStyle: 2 }), 2);
    expect(a.model).not.toBeNull();
    run(a, { pose: 'stand', speed: 0 }, 0.2);
    expect(drawn(a.root)).toHaveLength(1);
    run(a, { pose: 'hammer', speed: 0, tool: 'martillo' }, 0.2);
    expect(drawn(a.root)).toHaveLength(2);
    expect(a.model!.mesh.material).toBe(b.model!.mesh.material);
    expect(a.model!.mesh.geometry.getAttribute('position')).toBe(b.model!.mesh.geometry.getAttribute('position'));
    expect(a.model!.mesh.geometry.getAttribute('color')).not.toBe(b.model!.mesh.geometry.getAttribute('color'));
    // 20 personajes: 20 llamadas (antes 11 por persona)
    const many = Array.from({ length: 20 }, (_, i) => new CharacterRig(look({ hairStyle: i % 4 }), i));
    const calls = many.reduce((n, r) => (run(r, { pose: 'walk', speed: 1.4 }, 0.1), n + drawn(r.root).length), 0);
    setCharacterModels(false);
    const old = Array.from({ length: 20 }, (_, i) => new CharacterRig(look({ hairStyle: i % 4 }), i));
    const oldCalls = old.reduce((n, r) => (run(r, { pose: 'walk', speed: 1.4 }, 0.1), n + drawn(r.root).length), 0);
    expect(calls).toBe(20);
    expect(oldCalls).toBe(220);
    for (const r of [a, b, ...many, ...old]) r.dispose();
  });

  it('crear personajes es barato (sin tirones al subir náufragos)', () => {
    new CharacterRig(look(), 0).dispose();
    const t0 = performance.now();
    const rigs = Array.from({ length: 20 }, (_, i) => new CharacterRig(look({ hairStyle: i % 4, hat: i % 3 === 0 ? 'cap' : 'none' }), i));
    for (const r of rigs) r.animate({ pose: 'wave', speed: 0 }, 1 / 30);
    const ms = (performance.now() - t0) / 20;
    expect(ms).toBeLessThan(8);
    for (const r of rigs) r.dispose();
  });

  it('cada pose usa su clip y queda en una postura estable y coherente', () => {
    const expected = (p: RigPose): string => (p === 'walk' ? 'andar' : p === 'stand' ? 'idle' : p === 'wave' ? 'saludar_suelo' : POSE_CLIP[p]);
    for (const pose of ALL_POSES) {
      const rig = new CharacterRig(look(), 3);
      const tool = pose === 'read' ? 'libro' : pose === 'cards' || pose === 'cardsStand' ? 'cartas' : null;
      run(rig, { pose, speed: pose === 'walk' ? 1.4 : 0, tool }, 0.6);
      expect(rig.model!.clip, pose).toBe(expected(pose));
      const box = skinnedBox(rig);
      for (const k of ['x', 'y', 'z'] as const) expect(Number.isFinite(box.min[k]) && Number.isFinite(box.max[k]), pose).toBe(true);
      if (SEATED.includes(pose)) expect(box.max.y, pose).toBeLessThan(1.55);
      if (pose === 'lie') {
        expect(box.max.y, pose).toBeLessThan(0.75);
        expect(box.max.z, 'cabeza hacia +z').toBeGreaterThan(1.5);
      }
      if (pose !== 'lie' && pose !== 'jump') expect(box.min.y, pose).toBeGreaterThan(-0.06);
      rig.dispose();
    }
  });

  it('sentado encaja en sillas, sofá y taburetes; en el suelo y tumbado, a su altura', () => {
    const rig = new CharacterRig(look(), 5);
    run(rig, { pose: 'sit', speed: 0 }, 0.6);
    // pelvis sobre un asiento de ~0,47 m, pies en el suelo, rodillas delante
    expect(bonePos(rig, 'cadera').y).toBeGreaterThan(0.5);
    expect(bonePos(rig, 'cadera').y).toBeLessThan(0.64);
    for (const s of ['i', 'd']) {
      expect(skinnedBox(rig).min.y).toBeGreaterThan(-0.04);
      expect(bonePos(rig, `pie_${s}`).y).toBeLessThan(0.12);
      expect(bonePos(rig, `pierna_${s}`).z).toBeLessThan(-0.3);
    }
    run(rig, { pose: 'sitFloor', speed: 0 }, 0.6);
    expect(bonePos(rig, 'cadera').y).toBeLessThan(0.25);
    run(rig, { pose: 'lie', speed: 0, blanket: '#2a9d8f' }, 0.6);
    // tumbado boca arriba sobre el colchón: la espalda a ras, la cabeza en la cabecera (+z)
    expect(bonePos(rig, 'pecho').y).toBeCloseTo(0.13, 1);
    expect(bonePos(rig, 'cabeza').z).toBeGreaterThan(1.4);
    rig.dispose();
  });

  it('fundidos de 0,25 s entre clips', () => {
    expect(CLIP_FADE).toBeGreaterThanOrEqual(0.2);
    expect(CLIP_FADE).toBeLessThanOrEqual(0.3);
    const rig = new CharacterRig(look(), 6);
    run(rig, { pose: 'stand', speed: 0 }, 0.5);
    expect(rig.model!.weights()).toEqual({ idle: 1 });
    run(rig, { pose: 'sit', speed: 0 }, 0.1);
    const w = rig.model!.weights();
    expect(w['idle']).toBeGreaterThan(0.3);
    expect(w['sentado']).toBeGreaterThan(0.3);
    expect(w['idle']! + w['sentado']!).toBeCloseTo(1, 5);
    run(rig, { pose: 'sit', speed: 0 }, 0.25);
    expect(rig.model!.weights()).toEqual({ sentado: 1 });
    rig.dispose();
  });

  it('el paso va sincronizado con la velocidad real y mezcla andar y correr', () => {
    const rig = new CharacterRig(look(), 7);
    run(rig, { pose: 'walk', speed: 1.0 }, 0.3);
    const p0 = rig.model!.stepPhase;
    run(rig, { pose: 'walk', speed: 1.0 }, 0.5);
    // fase = distancia / zancada (1,35 m por ciclo de andar)
    expect((rig.model!.stepPhase - p0 + 1) % 1).toBeCloseTo((0.5 * 1.0) / 1.35, 2);
    run(rig, { pose: 'walk', speed: 3.2 }, 0.6);
    const w = rig.model!.weights();
    expect(w['andar']).toBeGreaterThan(0);
    expect(w['correr']).toBeGreaterThan(0);
    expect(w['andar']! + w['correr']!).toBeCloseTo(1, 5);
    run(rig, { pose: 'walk', speed: 5.6 }, 0.6);
    expect(rig.model!.weights()).toEqual({ correr: 1 });
    // cojo y cargando
    run(rig, { pose: 'walk', speed: 1.0, limp: true }, 0.6);
    expect(rig.model!.clip).toBe('cojear');
    run(rig, { pose: 'stand', speed: 0, limp: true }, 0.6);
    expect(rig.model!.clip).toBe('idle_cojo');
    run(rig, { pose: 'walk', speed: 1.2, carry: true }, 0.6);
    expect(rig.model!.clip).toBe('andar_carga');
    const crate = rig.root.getObjectByName('carga')!;
    expect(crate.visible).toBe(true);
    let p: THREE.Object3D | null = crate;
    while (p && p.name !== 'pecho') p = p.parent;
    expect(p, 'la caja va en el pecho').not.toBeNull();
    rig.dispose();
  });

  it('la herramienta va en la mano derecha y se orienta como antes', () => {
    const rig = new CharacterRig(look(), 8);
    const v = new THREE.Vector3();
    for (const [pose, tool] of [['hammer', 'martillo'], ['stir', 'cucharon'], ['reel', 'cana'], ['walk', 'cubo_lleno'], ['eat', 'cuenco']] as const) {
      run(rig, { pose, speed: pose === 'walk' ? 1.4 : 0, tool }, 0.5);
      const mesh = rig.root.getObjectByName('herramienta')!;
      expect(mesh.visible).toBe(true);
      let p: THREE.Object3D | null = mesh;
      while (p && p.name !== 'mano_d') p = p.parent;
      expect(p, `${tool} en mano_d`).not.toBeNull();
      const hand = bonePos(rig, 'mano_d');
      expect(mesh.getWorldPosition(v).distanceTo(hand), tool).toBeLessThan(0.15);
      if (tool === 'cubo_lleno' || tool === 'cuenco') {
        // cuelga derecho: su eje y es el vertical del personaje
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(mesh.getWorldQuaternion(new THREE.Quaternion()));
        expect(up.y, tool).toBeGreaterThan(0.99);
      }
    }
    // la caña apunta hacia delante y arriba: la punta queda lejos, delante (−z) y por encima de la mano
    run(rig, { pose: 'reel', speed: 0, tool: 'cana' }, 0.5);
    const tip = rig.rodTip(new THREE.Vector3())!;
    expect(tip).not.toBeNull();
    expect(tip.z).toBeLessThan(-1.2);
    expect(tip.y).toBeGreaterThan(bonePos(rig, 'mano_d').y);
    rig.dispose();
  });

  it('manta al dormir (se tumba con el cuerpo) y ojos cerrados', () => {
    const rig = new CharacterRig(look({ skin: '#e0ac69' }), 9);
    const colors = rig.model!.mesh.geometry.getAttribute('color');
    const tpl = characterTemplate()!;
    const eye = tpl.slotOf.findIndex((s) => tpl.slots[s] === 'eyes');
    run(rig, { pose: 'stand', speed: 0 }, 0.3);
    const open = colors.getX(eye);
    run(rig, { pose: 'lie', speed: 0, blanket: '#bc4749' }, 0.6);
    const blanket = rig.root.getObjectByName('manta') as THREE.Mesh;
    expect(blanket.visible).toBe(true);
    expect((blanket.material as THREE.MeshLambertMaterial).color.getHexString()).toBe('bc4749');
    const c = new THREE.Box3().setFromObject(blanket).getCenter(new THREE.Vector3());
    expect(c.y).toBeGreaterThan(0.1);
    expect(c.y).toBeLessThan(0.45);
    expect(c.z).toBeGreaterThan(0.4);
    expect(colors.getX(eye)).toBeGreaterThan(open * 2);
    run(rig, { pose: 'stand', speed: 0 }, 0.3);
    expect(blanket.visible).toBe(false);
    expect(colors.getX(eye)).toBeCloseTo(open, 5);
    rig.dispose();
  });

  it('peinados, gorros y abrigo: piezas que se ponen y se quitan, colores del aspecto', () => {
    expect(piecesFor(look({ hairStyle: 3 }))).toContain('pelo_bollo');
    expect(piecesFor(look({ hairStyle: 3, hat: 'beanie' }))).not.toContain('pelo_bollo');
    expect(piecesFor(look({ hat: 'cap' }))).toContain('gorra');
    expect(piecesFor(look({ coat: '#3a5a40' }))).toContain('abrigo');
    const tpl = characterTemplate()!;
    for (const p of ['cuerpo', 'pelo_corto', 'pelo_melena', 'pelo_rapado', 'pelo_recogido', 'pelo_bollo', 'gorro_lana', 'gorra', 'abrigo']) expect(tpl.pieces.has(p), p).toBe(true);
    const rig = new CharacterRig(look(), 10);
    const count = (): number => rig.model!.indexCount;
    const base = count();
    rig.applyLook(look({ coat: '#3a5a40' }));
    expect(count()).toBe(base + tpl.pieces.get('abrigo')!.length);
    rig.applyLook(look({ hairStyle: 1, hat: 'beanie', hatColor: '#bc4749' }));
    expect(count()).toBe(base - tpl.pieces.get('pelo_corto')!.length + tpl.pieces.get('pelo_melena')!.length + tpl.pieces.get('gorro_lana')!.length);
    // el color de la piel sale del aspecto (multiplicado por el pintado de Blender)
    rig.applyLook(look({ skin: '#ff0000' }));
    const colors = rig.model!.mesh.geometry.getAttribute('color');
    const skin = tpl.slotOf.findIndex((s) => tpl.slots[s] === 'skin');
    expect(colors.getX(skin)).toBeGreaterThan(0.5);
    expect(colors.getY(skin)).toBeLessThan(0.05);
    // altura: escala de la raíz
    rig.applyLook(look({ height: 1.1 }));
    expect(rig.root.scale.y).toBeCloseTo(1.1);
    rig.dispose();
  });

  it('resaltado sin multiplicar materiales', () => {
    const a = new CharacterRig(look(), 11);
    const b = new CharacterRig(look(), 12);
    const normal = a.model!.mesh.material as THREE.MeshLambertMaterial;
    a.setHighlight(true);
    const hl = a.model!.mesh.material as THREE.MeshLambertMaterial;
    expect(hl).not.toBe(normal);
    expect(hl.emissive.getHex()).not.toBe(0);
    expect(b.model!.mesh.material).toBe(normal);
    b.setHighlight(true);
    expect(b.model!.mesh.material).toBe(hl);
    a.setHighlight(false);
    expect(a.model!.mesh.material).toBe(normal);
    a.dispose();
    // liberar uno no rompe a los demás (los búferes compartidos siguen ahí)
    expect(b.model!.mesh.geometry.getAttribute('position').count).toBe(characterTemplate()!.vertexCount);
    b.dispose();
  });
});

describe('respaldo procedimental', () => {
  it('con el modelo desactivado, el rig de siempre (11 segmentos) anima todas las poses', () => {
    setCharacterModels(false);
    expect(characterModelsActive()).toBe(false);
    for (const pose of ALL_POSES) {
      const rig = new CharacterRig(look(), 1);
      expect(rig.model).toBeNull();
      run(rig, { pose, speed: pose === 'walk' ? 1.4 : 0, tool: pose === 'reel' ? 'cana' : null }, 0.3);
      expect(drawn(rig.root).length, pose).toBeGreaterThanOrEqual(11);
      const box = new THREE.Box3().setFromObject(rig.root);
      expect(Number.isFinite(box.max.y), pose).toBe(true);
      rig.dispose();
    }
  });

  it('si el modelo no existe (modelObject devuelve null), todo funciona como antes', async () => {
    vi.resetModules();
    vi.doMock('../src/render/assets', () => ({ hasModel: () => false, modelObject: () => null, modelAnimations: () => [], modelGeometry: () => null }));
    try {
      const m = await import('../src/render/ship/character');
      const cm = await import('../src/render/ship/characterModel');
      expect(cm.characterTemplate()).toBeNull();
      expect(m.characterModelsActive()).toBe(false);
      const rig = new m.CharacterRig(look(), 2);
      expect(rig.model).toBeNull();
      run(rig as unknown as CharacterRig, { pose: 'lie', speed: 0, blanket: '#2a9d8f' }, 0.3);
      expect(rig.root.getObjectByName('manta')!.visible).toBe(true);
      run(rig as unknown as CharacterRig, { pose: 'reel', speed: 0, tool: 'cana' }, 0.3);
      expect(rig.rodTip(new THREE.Vector3())).not.toBeNull();
      rig.dispose();
    } finally {
      vi.doUnmock('../src/render/assets');
      vi.resetModules();
    }
  });
});
