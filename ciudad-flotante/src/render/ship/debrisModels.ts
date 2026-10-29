/**
 * Modelos low-poly de los RESTOS FLOTANTES (DebrisKind): tablones atados, barril, caja de
 * madera, chapas y restos metálicos, red con boyas, bidón, cofre y balsa. Origen a ras del
 * agua (y = 0 = superficie): lo que queda por debajo se ve sumergido.
 */
import type * as THREE from 'three';
import type { DebrisKind } from '../../sim/types';
import { PALETTE } from '../palette';
import { GeoBuilder, hash01, shade } from './geo';
import { crate } from './props';

const cache = new Map<string, THREE.BufferGeometry>();

/** Radio aproximado en planta (para el aro de resaltado y el gancho). */
export const DEBRIS_RADIUS: Record<DebrisKind, number> = {
  tablones: 1.3,
  barril: 0.65,
  caja: 0.6,
  restos: 1.1,
  red: 1.3,
  bidon: 0.45,
  cofre: 0.85,
  balsa: 2.0,
};

export function debrisGeometry(kind: DebrisKind, variant = 0): THREE.BufferGeometry {
  const key = `${kind}|${variant % 3}`;
  let g = cache.get(key);
  if (g) return g;
  const b = new GeoBuilder();
  const v = variant % 3;
  switch (kind) {
    case 'tablones': {
      const n = 5;
      for (let i = 0; i < n; i++) {
        const z = (i - (n - 1) / 2) * 0.26;
        const len = 2.0 + hash01(v, i) * 0.5;
        const off = (hash01(i, v, 2) - 0.5) * 0.3;
        b.box(-len / 2 + off, -0.06, z - 0.12, len / 2 + off, 0.05, z + 0.12, shade(PALETTE.deckWood, 0.8 + hash01(i, v) * 0.25));
      }
      for (const x of [-0.6, 0.55]) {
        b.box(x - 0.05, -0.08, -0.72, x + 0.05, 0.08, 0.72, PALETTE.rope);
        b.box(x - 0.06, 0.05, -0.1, x + 0.06, 0.1, 0.1, shade(PALETTE.rope, 0.8));
      }
      break;
    }
    case 'barril': {
      b.push();
      b.rotateZ(Math.PI / 2);
      b.rotateY(0.3);
      b.cylinder(0, -0.45, 0, 0.27, 0.33, 0.45, 10, '#8b5e3c');
      b.cylinder(0, 0, 0, 0.33, 0.27, 0.45, 10, '#8b5e3c', { capColor: '#6e4a2e' });
      for (const y of [-0.34, -0.06, 0.06, 0.34]) b.cylinder(0, y - 0.025, 0, 0.34, 0.34, 0.05, 10, PALETTE.metalDark, { capTop: false, capBottom: false });
      b.pop();
      break;
    }
    case 'caja': {
      b.push();
      b.rotateX(0.12);
      b.rotateZ(-0.08);
      crate(b, 0, -0.42, 0, 0.78, 0.7, 0.78, '#b8895a');
      // algas
      b.box(-0.3, 0.27, -0.39, 0.1, 0.29, 0.1, '#4f7942');
      b.pop();
      break;
    }
    case 'restos': {
      const rust = PALETTE.rust;
      b.push();
      b.rotateX(0.25);
      b.box(-0.9, -0.06, -0.55, 0.5, 0.02, 0.35, '#8a9399');
      b.pop();
      b.push();
      b.translate(0.4, 0, 0.35);
      b.rotateZ(-0.5);
      b.box(-0.45, -0.02, -0.3, 0.45, 0.04, 0.3, rust);
      b.pop();
      b.cylinderBetween(-0.7, 0.02, 0.6, 0.6, 0.12, -0.2, 0.08, 6, PALETTE.metalDark);
      // engranaje
      b.push();
      b.translate(-0.25, 0.08, -0.15);
      b.cylinder(0, 0, 0, 0.26, 0.26, 0.07, 10, '#7d8597');
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2;
        b.boxC(Math.cos(a) * 0.29, 0.035, Math.sin(a) * 0.29, 0.07, 0.07, 0.07, '#7d8597');
      }
      b.cylinder(0, 0.07, 0, 0.07, 0.07, 0.02, 6, PALETTE.metalDark);
      b.pop();
      break;
    }
    case 'red': {
      const n = 7;
      const s = 1.8;
      const rope = shade(PALETTE.rope, 0.85);
      for (let i = 0; i <= n; i++) {
        const t = -s / 2 + (i / n) * s;
        const wob = (k: number): number => Math.sin(k * 2.1 + i) * 0.04;
        b.cylinderBetween(-s / 2, wob(1), t, s / 2, wob(2), t + 0.1, 0.015, 3, rope);
        b.cylinderBetween(t, wob(3), -s / 2, t - 0.1, wob(4), s / 2, 0.015, 3, rope);
      }
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2 + 0.3;
        b.sphere(Math.cos(a) * 0.95, 0.04, Math.sin(a) * 0.95, 0.13, k % 2 ? '#e8722c' : '#f3ead6');
      }
      b.cylinder(0.3, -0.05, -0.2, 0.25, 0.22, 0.12, 8, rope);
      break;
    }
    case 'bidon': {
      b.push();
      b.rotateZ(Math.PI / 2 - 0.25);
      b.box(-0.22, -0.28, -0.11, 0.22, 0.28, 0.11, '#c8553d');
      b.box(-0.18, -0.2, -0.125, 0.18, 0.2, -0.11, shade('#c8553d', 0.85));
      b.box(-0.18, 0.28, -0.04, 0.18, 0.34, 0.04, '#c8553d');
      b.box(-0.08, 0.28, -0.11, 0.08, 0.38, 0.11, '#c8553d');
      b.cylinder(0.14, 0.28, 0, 0.05, 0.05, 0.08, 6, '#e9c46a');
      b.pop();
      break;
    }
    case 'cofre': {
      // palé flotante con boya y cofre encima
      for (let i = 0; i < 4; i++) b.box(-0.75, -0.12, -0.6 + i * 0.33, 0.75, -0.02, -0.38 + i * 0.33, shade(PALETTE.deckWood, 0.75 + i * 0.05));
      b.box(-0.45, -0.02, -0.3, 0.45, 0.36, 0.3, '#7f5539');
      b.push();
      b.translate(0, 0.36, 0);
      b.quadN(-0.45, 0, -0.3, 0.45, 0, -0.3, 0.45, 0.16, -0.1, -0.45, 0.16, -0.1, '#7f5539');
      b.quadN(-0.45, 0.16, 0.1, 0.45, 0.16, 0.1, 0.45, 0, 0.3, -0.45, 0, 0.3, '#7f5539');
      b.quadN(-0.45, 0.16, -0.1, 0.45, 0.16, -0.1, 0.45, 0.16, 0.1, -0.45, 0.16, 0.1, shade('#7f5539', 1.1));
      b.quadN(-0.45, 0, 0.3, -0.45, 0, -0.3, -0.45, 0.16, -0.1, -0.45, 0.16, 0.1, '#5e3f28');
      b.quadN(0.45, 0, -0.3, 0.45, 0, 0.3, 0.45, 0.16, 0.1, 0.45, 0.16, -0.1, '#5e3f28');
      b.pop();
      for (const x of [-0.3, 0.3]) b.box(x - 0.04, -0.02, -0.31, x + 0.04, 0.5, 0.31, PALETTE.metalDark);
      b.box(-0.07, 0.22, -0.32, 0.07, 0.36, -0.29, '#e9c46a');
      // destellos de oro asomando
      b.boxC(0.12, 0.39, 0.0, 0.08, 0.04, 0.08, '#f4d35e');
      b.boxC(-0.15, 0.38, 0.08, 0.06, 0.04, 0.06, '#f4d35e');
      // boya atada
      b.push();
      b.translate(0.85, 0.02, 0.45);
      b.rotateX(Math.PI / 2);
      b.ring(0, 0, 0, 0.22, 0.07, 10, '#e8722c', 4);
      b.pop();
      b.cylinderBetween(0.45, 0.1, 0.25, 0.7, 0.03, 0.4, 0.015, 3, PALETTE.rope);
      break;
    }
    case 'balsa': {
      const n = 6;
      for (let i = 0; i < n; i++) {
        const z = (i - (n - 1) / 2) * 0.33;
        b.cylinderX(hash01(i, 4) * 0.2 - 0.1, -0.02, z, 0.16, 3.0 + hash01(i, 7) * 0.3, 7, shade('#9c6b43', 0.85 + hash01(i, 2) * 0.25));
      }
      for (const x of [-1.1, 0, 1.1]) b.box(x - 0.08, 0.12, -1.05, x + 0.08, 0.2, 1.05, '#6e4a2e');
      for (const x of [-1.1, 1.1]) for (const z of [-0.9, 0.9]) b.box(x - 0.1, 0.1, z - 0.1, x + 0.1, 0.24, z + 0.1, PALETTE.rope);
      // mástil con trapo y hatillo
      b.cylinder(1.05, 0.15, -0.75, 0.05, 0.04, 2.2, 6, '#8b5e3c');
      b.prism([[1.07, -0.75], [1.07, -0.72], [1.85, -0.73], [1.85, -0.76]], 1.5, 2.25, '#f3ead6');
      b.sphere(-1.0, 0.35, 0.6, 0.22, '#b89b6a', 0, 0.8);
      b.cylinder(-0.6, 0.18, 0.75, 0.13, 0.13, 0.32, 7, '#4cc9f0');
      break;
    }
  }
  g = b.build();
  cache.set(key, g);
  return g;
}
