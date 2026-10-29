/**
 * [AGENTE render-ship] RESTOS FLOTANTES en el agua: un modelo por DebrisKind que flota con la
 * altura del agua (`waterHeight`), cabecea y se escora según la pendiente de las olas y gira
 * despacio. La balsa lleva a sus náufragos sentados saludando. El resto apuntado se resalta
 * con un brillo y un aro pulsante sobre el agua (`setHighlight(id)`).
 */
import * as THREE from 'three';
import type { DebrisKind, GameState } from '../sim/types';
import { CharacterRig, lookFromAppearance } from './ship/character';
import { DEBRIS_RADIUS, debrisGeometry } from './ship/debrisModels';
import { hash01 } from './ship/geo';

interface DebrisEntry {
  group: THREE.Group;
  model: THREE.Mesh;
  mat: THREE.MeshLambertMaterial;
  kind: DebrisKind;
  survivors: CharacterRig[];
  tiltX: number;
  tiltZ: number;
  age: number;
}

/** Hundimiento del origen del modelo respecto a la superficie (m). */
const SINK: Record<DebrisKind, number> = { tablones: 0.0, barril: 0.06, caja: 0.0, restos: 0.03, red: 0.02, bidon: 0.0, cofre: 0.05, balsa: 0.05 };

export class DebrisView {
  private meshes = new Map<number, DebrisEntry>();
  private highlightId: number | null = null;
  private ring: THREE.Mesh;
  /** Flecha que flota sobre el objetivo (se ve de lejos, ayuda a apuntar el gancho). */
  private marker: THREE.Mesh;
  private t = 0;

  constructor(readonly worldRoot: THREE.Group) {
    const rg = new THREE.RingGeometry(0.6, 1, 32);
    rg.rotateX(-Math.PI / 2);
    this.ring = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: '#ffd27d', transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide }));
    this.ring.visible = false;
    this.ring.renderOrder = 5;
    this.ring.name = 'aro-resaltado';
    const mg = new THREE.ConeGeometry(0.22, 0.45, 4);
    mg.rotateX(Math.PI);
    this.marker = new THREE.Mesh(mg, new THREE.MeshBasicMaterial({ color: '#ffd27d' }));
    this.marker.visible = false;
    this.marker.name = 'marca-objetivo';
    worldRoot.add(this.ring, this.marker);
  }

  reset(): void {
    for (const e of this.meshes.values()) this.disposeEntry(e);
    this.meshes.clear();
    this.highlightId = null;
    this.ring.visible = false;
    this.marker.visible = false;
  }

  /** Resalta un resto (objetivo del gancho) o ninguno. */
  setHighlight(id: number | null): void {
    if (id === this.highlightId) return;
    if (this.highlightId !== null) this.applyHighlight(this.meshes.get(this.highlightId), false);
    this.highlightId = id;
    if (id !== null) this.applyHighlight(this.meshes.get(id), true);
  }

  private applyHighlight(e: DebrisEntry | undefined, on: boolean): void {
    if (!e) return;
    e.mat.emissive.set(on ? '#6b5323' : '#000000');
    for (const s of e.survivors) s.setHighlight(on);
  }

  sync(state: GameState, dtReal: number, waterHeight: (x: number, z: number) => number): void {
    const dt = Math.min(0.1, Math.max(0, dtReal));
    this.t += dt;
    const alive = new Set<number>();
    for (const d of state.debris) {
      alive.add(d.id);
      let e = this.meshes.get(d.id);
      if (!e) {
        e = this.create(d.id, d.kind, d.survivors ?? 0);
        this.meshes.set(d.id, e);
        if (this.highlightId === d.id) this.applyHighlight(e, true);
      }
      e.age += dt;
      const { x, z } = d.pos;
      const h = waterHeight(x, z);
      const r = Math.min(1.2, DEBRIS_RADIUS[d.kind]);
      const sx = (waterHeight(x + r, z) - waterHeight(x - r, z)) / (2 * r);
      const sz = (waterHeight(x, z + r) - waterHeight(x, z - r)) / (2 * r);
      // inclinación suavizada según la pendiente de la ola
      e.tiltZ += (Math.atan(sx) - e.tiltZ) * Math.min(1, dt * 3);
      e.tiltX += (-Math.atan(sz) - e.tiltX) * Math.min(1, dt * 3);
      const bob = Math.sin(this.t * 1.7 + d.id) * 0.03;
      // al aparecer, emerge suavemente
      const rise = Math.min(1, e.age / 0.6);
      e.group.position.set(x, h - SINK[d.kind] + bob - (1 - rise) * 0.6, z);
      e.group.rotation.set(e.tiltX + Math.sin(this.t * 1.3 + d.id) * 0.04, d.spin + this.t * 0.05, e.tiltZ + Math.cos(this.t * 1.1 + d.id) * 0.04, 'YXZ');
      for (const s of e.survivors) s.animate({ pose: 'wave', speed: 0 }, dt);
    }
    for (const [id, e] of this.meshes) {
      if (!alive.has(id)) {
        this.disposeEntry(e);
        this.meshes.delete(id);
      }
    }
    // aro pulsante del objetivo
    const target = this.highlightId !== null ? this.meshes.get(this.highlightId) : undefined;
    if (target) {
      const r = DEBRIS_RADIUS[target.kind] + 0.35;
      const k = 1 + 0.08 * Math.sin(this.t * 5);
      this.ring.visible = true;
      this.ring.position.set(target.group.position.x, target.group.position.y + 0.06, target.group.position.z);
      this.ring.scale.set(r * k, 1, r * k);
      (this.ring.material as THREE.MeshBasicMaterial).opacity = 0.55 + 0.3 * Math.sin(this.t * 5);
      this.marker.visible = true;
      this.marker.position.set(target.group.position.x, target.group.position.y + 1.3 + DEBRIS_RADIUS[target.kind] * 0.4 + Math.abs(Math.sin(this.t * 3)) * 0.25, target.group.position.z);
      this.marker.rotation.y = this.t * 2;
    } else {
      this.ring.visible = false;
      this.marker.visible = false;
    }
  }

  private create(id: number, kind: DebrisKind, survivors: number): DebrisEntry {
    const group = new THREE.Group();
    group.name = `resto-${id}`;
    group.userData = { debrisId: id, kind };
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const model = new THREE.Mesh(debrisGeometry(kind, id), mat);
    model.castShadow = true;
    model.receiveShadow = true;
    group.add(model);
    const rigs: CharacterRig[] = [];
    if (kind === 'balsa') {
      const n = Math.max(1, Math.min(3, survivors || 1));
      for (let i = 0; i < n; i++) {
        const seed = id * 7 + i;
        const a = Math.floor(hash01(seed, 1) * 100);
        const look = lookFromAppearance({ skin: a % 5, shirt: (a * 7) % 8, pants: (a * 3) % 5, hair: (a * 11) % 6, hat: a % 3 === 0, height: 0.95 + hash01(seed) * 0.1 }, seed);
        const rig = new CharacterRig(look, seed);
        rig.root.position.set(-0.6 + i * 0.75, 0.2, i % 2 ? 0.35 : -0.25);
        rig.root.rotation.y = Math.PI / 2 + (i - 1) * 0.5;
        group.add(rig.root);
        rigs.push(rig);
      }
    }
    this.worldRoot.add(group);
    return { group, model, mat, kind, survivors: rigs, tiltX: 0, tiltZ: 0, age: 0 };
  }

  private disposeEntry(e: DebrisEntry): void {
    for (const s of e.survivors) s.dispose();
    e.mat.dispose();
    e.group.removeFromParent();
  }

  /** Posición mundial actual de un resto (para el gancho). */
  objectOf(id: number): THREE.Object3D | null {
    return this.meshes.get(id)?.group ?? null;
  }
}
