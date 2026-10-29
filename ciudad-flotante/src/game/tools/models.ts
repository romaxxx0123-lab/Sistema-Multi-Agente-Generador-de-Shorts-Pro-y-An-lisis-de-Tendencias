/**
 * [AGENTE game-player] MODELOS LOW-POLY de los objetos en mano (vista en primera persona) y de
 * las piezas que vuelan por el mundo (garfio del gancho, corcho de la caña, pez capturado).
 *
 * Marco de un objeto en mano: el puño está en el origen, +y hacia arriba a lo largo del mango,
 * −z hacia delante (lejos de la cámara), +x a la derecha. Todo con colores por vértice y caras
 * planas (`GeoBuilder` compartido con el resto del barco) para que encaje con el estilo visual.
 */
import * as THREE from 'three';
import { ITEMS } from '../../data/items';
import { PALETTE } from '../../render/palette';
import { GeoBuilder } from '../../render/ship/geo';
import type { ItemId } from '../../sim/types';

const WOOD = '#9c6644';
const WOOD_LIGHT = '#c89f6c';
const STEEL = PALETTE.metal;
const STEEL_DARK = PALETTE.metalDark;
const ROPE = PALETTE.rope;

/** Piel y manga del jugador (mismo aspecto que el avatar de tercera persona). */
export const HAND_SKIN = '#e0ac69';
export const SLEEVE = '#457b9d';
const SLEEVE_DARK = '#335f7a';

export interface ItemModel {
  group: THREE.Group;
  /** Piezas que se pueden ocultar (garfio lanzado, corcho en el agua, agua del cubo…). */
  parts: Map<string, THREE.Object3D>;
  /** Puntos de referencia (punta de la caña, garfio, boca del cubo…). */
  anchors: Map<string, THREE.Object3D>;
  /** Pose de la mano para este objeto (espacio de la cámara). */
  pose: { x: number; y: number; z: number; rx: number; ry: number; rz: number };
  /** Giro del antebrazo respecto al puño (para que no atraviese objetos colgantes como el cubo). */
  armRot: { x: number; y: number; z: number };
  /** Escala del puño y el objeto en pantalla (el antebrazo y el objeto encogen alrededor del puño). */
  scale: number;
}

type Build = (b: GeoBuilder) => void;

function meshOf(build: Build, mat: THREE.Material, name: string): THREE.Mesh {
  const b = new GeoBuilder();
  build(b);
  const m = new THREE.Mesh(b.build(), mat);
  m.name = name;
  return m;
}

function anchor(name: string, x: number, y: number, z: number): THREE.Object3D {
  const o = new THREE.Object3D();
  o.name = name;
  o.position.set(x, y, z);
  return o;
}

/* ------------------------------------------------------------------ */
/* Geometrías reutilizables                                            */
/* ------------------------------------------------------------------ */

/** Garfio de rescate: caña con argolla arriba y cuatro uñas curvas abajo. Origen en la argolla. */
export function buildGrapnel(b: GeoBuilder, s = 1): void {
  b.push();
  b.scale(s, s, s);
  b.ring(0, 0.0, 0, 0.022, 0.007, 8, STEEL_DARK, 4);
  b.cylinderBetween(0, -0.02, 0, 0, -0.2, 0, 0.012, 6, STEEL_DARK);
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    const cx = Math.cos(a);
    const cz = Math.sin(a);
    // Uña en dos tramos: sale hacia fuera y se curva hacia arriba con punta afilada.
    b.cylinderBetween(0, -0.2, 0, cx * 0.065, -0.215, cz * 0.065, 0.009, 4, STEEL_DARK);
    b.cylinderBetween(cx * 0.065, -0.215, cz * 0.065, cx * 0.09, -0.15, cz * 0.09, 0.008, 4, STEEL);
    b.cylinderBetween(cx * 0.09, -0.15, cz * 0.09, cx * 0.075, -0.115, cz * 0.075, 0.005, 3, '#c9d1d6');
  }
  b.pop();
}

/** Corcho de pesca bicolor con varilla. Origen en la línea de flotación. */
export function buildBobber(b: GeoBuilder, s = 1): void {
  b.push();
  b.scale(s, s, s);
  b.sphere(0, 0.015, 0, 0.045, '#e63946', 0, 0.9);
  b.cylinder(0, -0.045, 0, 0.012, 0.04, 0.05, 6, '#f8f9fa', { capTop: false });
  b.cylinder(0, 0.05, 0, 0.006, 0.004, 0.07, 4, '#f8f9fa');
  b.pop();
}

/** Pez low-poly orientado a lo largo de x (cabeza en +x). */
export function buildFish(b: GeoBuilder, color: string, belly: string, s = 1, cooked = false): void {
  b.push();
  b.scale(s, s, s);
  b.sphere(0, 0, 0, 0.1, color, 0, 0.42);
  b.push();
  b.scale(1, 1, 0.42);
  b.sphere(0.0, -0.012, 0, 0.085, belly, 0, 0.32);
  b.pop();
  // cola
  b.tri(-0.08, 0, 0, -0.16, 0.05, 0, -0.16, -0.05, 0, color);
  b.tri(-0.08, 0, 0, -0.16, -0.05, 0, -0.16, 0.05, 0, color);
  // aleta dorsal
  b.tri(-0.02, 0.035, 0, 0.04, 0.035, 0, 0.0, 0.07, 0, color);
  b.tri(0.04, 0.035, 0, -0.02, 0.035, 0, 0.0, 0.07, 0, color);
  // ojo
  if (!cooked) {
    b.boxC(0.07, 0.012, 0.024, 0.014, 0.014, 0.006, '#1a1a1a');
    b.boxC(0.07, 0.012, -0.024, 0.014, 0.014, 0.006, '#1a1a1a');
  } else {
    // marcas de la parrilla
    for (const x of [-0.04, 0.0, 0.04]) b.boxC(x, 0.0, 0.043, 0.01, 0.07, 0.004, '#5a3216');
  }
  b.pop();
}

/* ------------------------------------------------------------------ */
/* Brazo                                                               */
/* ------------------------------------------------------------------ */

/** Puño y antebrazo (manga) del jugador. El puño envuelve el origen. */
export function buildArm(mat: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  g.name = 'brazo';
  g.add(
    meshOf(
      (b) => {
        // antebrazo: desde la muñeca hacia abajo, a la derecha y hacia la cámara (sale de pantalla)
        b.cylinderBetween(0.015, -0.035, 0.05, 0.11, -0.42, 0.36, 0.05, 7, SLEEVE);
        b.cylinderBetween(0.012, -0.03, 0.045, 0.03, -0.1, 0.11, 0.056, 7, SLEEVE_DARK); // puño de la manga
        // muñeca
        b.cylinderBetween(0.0, -0.01, 0.02, 0.012, -0.045, 0.06, 0.036, 6, HAND_SKIN);
        // puño cerrado
        b.boxC(0.0, 0.0, 0.0, 0.085, 0.1, 0.095, HAND_SKIN);
        // nudillos (franja más clara delante)
        b.boxC(0.0, 0.0, -0.05, 0.08, 0.085, 0.012, '#e8b97c');
        // pulgar por encima del mango
        b.boxC(-0.035, 0.045, -0.01, 0.03, 0.03, 0.07, '#d39d5d');
      },
      mat,
      'puño',
    ),
  );
  return g;
}

/* ------------------------------------------------------------------ */
/* Objetos                                                             */
/* ------------------------------------------------------------------ */

/*
 * Encuadre (FOV vertical 72°, 16:9): el puño queda abajo a la derecha (~75 % del ancho), a la
 * derecha de la barra rápida, y ningún objeto en reposo sube por encima de la mitad de la
 * pantalla ni tapa la mira. Cada objeto ocupa un rectángulo de ~15–20 % de la pantalla.
 */
const DEFAULT_POSE = { x: 0.33, y: -0.3, z: -0.5, rx: 0.05, ry: -0.12, rz: 0.04 };
const SMALL_POSE = { x: 0.31, y: -0.25, z: -0.46, rx: 0.25, ry: -0.35, rz: 0.1 };
/** Escala por defecto del puño y el objeto en mano. */
const HAND_SCALE = 0.78;

/** Construye el modelo de un objeto para la vista en primera persona. */
export function buildItemModel(id: ItemId, mat: THREE.Material, lineMat: THREE.LineBasicMaterial): ItemModel {
  const group = new THREE.Group();
  group.name = `en-mano:${id}`;
  const parts = new Map<string, THREE.Object3D>();
  const anchors = new Map<string, THREE.Object3D>();
  let pose = { ...DEFAULT_POSE };
  let scale = HAND_SCALE;
  const armRot = { x: 0, y: 0, z: 0 };
  const add = (name: string, build: Build): THREE.Mesh => {
    const m = meshOf(build, mat, name);
    group.add(m);
    parts.set(name, m);
    return m;
  };
  const addAnchor = (name: string, x: number, y: number, z: number): void => {
    const a = anchor(name, x, y, z);
    group.add(a);
    anchors.set(name, a);
  };
  const def = ITEMS[id];

  switch (id) {
    case 'martillo': {
      pose = { x: 0.34, y: -0.33, z: -0.52, rx: -0.55, ry: -0.18, rz: 0.12 };
      add('martillo', (b) => {
        b.cylinderBetween(0, -0.09, 0, 0, 0.25, 0, 0.017, 6, WOOD);
        b.cylinderBetween(0, -0.1, 0, 0, -0.06, 0, 0.021, 6, '#6e4a2e');
        // cabeza: cara de golpeo hacia −z, uña hacia +z
        b.boxC(0, 0.27, -0.035, 0.05, 0.055, 0.1, STEEL_DARK);
        b.cylinderBetween(0, 0.27, -0.085, 0, 0.27, -0.12, 0.03, 8, STEEL);
        b.boxC(0, 0.275, 0.04, 0.045, 0.04, 0.06, STEEL_DARK);
        b.push();
        b.translate(0, 0.27, 0.07);
        b.rotateX(-0.6);
        b.boxC(-0.012, 0, 0.03, 0.016, 0.03, 0.07, STEEL);
        b.boxC(0.012, 0, 0.03, 0.016, 0.03, 0.07, STEEL);
        b.pop();
      });
      addAnchor('cabeza', 0, 0.27, -0.12);
      break;
    }
    case 'llave_inglesa': {
      pose = { x: 0.34, y: -0.32, z: -0.5, rx: -0.5, ry: -0.25, rz: 0.35 };
      add('llave', (b) => {
        b.box(-0.016, -0.08, -0.008, 0.016, 0.22, 0.008, STEEL);
        b.box(-0.02, -0.08, -0.01, 0.02, 0.04, 0.01, '#6c757d');
        // boca abierta
        b.box(-0.045, 0.22, -0.011, 0.045, 0.26, 0.011, STEEL);
        b.box(-0.045, 0.26, -0.011, -0.022, 0.31, 0.011, STEEL);
        b.box(0.022, 0.26, -0.011, 0.045, 0.3, 0.011, STEEL);
        b.cylinderBetween(0, 0.24, -0.016, 0, 0.24, 0.016, 0.012, 6, STEEL_DARK);
      });
      addAnchor('boca', 0, 0.28, 0);
      break;
    }
    case 'gancho': {
      // El garfio es lo más alto que se lleva en la mano: más pequeño y más abajo para no tapar
      // la vista al apuntar (las uñas quedan por debajo de la mitad de la pantalla).
      pose = { x: 0.35, y: -0.32, z: -0.5, rx: -0.15, ry: -0.2, rz: 0.08 };
      scale = 0.64;
      add('rollo', (b) => {
        // rollo de cabo en la mano
        b.push();
        b.rotateY(Math.PI / 2);
        b.ring(0, -0.01, 0.0, 0.085, 0.022, 10, ROPE, 4);
        b.ring(0, -0.01, 0.025, 0.08, 0.02, 10, '#c4a466', 4);
        b.pop();
      });
      add('garfio', (b) => {
        b.push();
        b.translate(0, 0.2, -0.06);
        b.rotateX(Math.PI); // uñas hacia arriba
        buildGrapnel(b, 1);
        b.pop();
        // cabo del rollo a la argolla
        b.cylinderBetween(0, 0.05, -0.02, 0, 0.2, -0.06, 0.007, 4, ROPE);
      });
      addAnchor('garfio', 0, 0.3, -0.06);
      addAnchor('mano', 0, 0.02, -0.02);
      break;
    }
    case 'cana': {
      pose = { x: 0.32, y: -0.33, z: -0.5, rx: -0.38, ry: -0.12, rz: 0.08 };
      scale = 0.68;
      add('cana', (b) => {
        // mango de corcho y caña en dos tramos (más fina hacia la punta)
        b.cylinderBetween(0, -0.13, 0.06, 0, 0.06, -0.03, 0.022, 7, '#c9a36a');
        b.cylinderBetween(0, 0.06, -0.03, 0, 0.55, -0.3, 0.012, 6, '#bc8a5f');
        b.cylinderBetween(0, 0.55, -0.3, 0, 1.05, -0.58, 0.007, 5, '#8a5a3a');
        // anillas
        for (const t of [0.35, 0.62, 0.86]) {
          const y = 0.06 + (1.05 - 0.06) * t;
          const z = -0.03 + (-0.58 + 0.03) * t;
          b.boxC(0, y - 0.012, z, 0.008, 0.024, 0.008, STEEL_DARK);
        }
        // carrete con manivela
        b.cylinderBetween(0.0, -0.01, 0.02, 0.0, -0.06, 0.04, 0.008, 4, STEEL_DARK);
        b.cylinderBetween(-0.03, -0.075, 0.05, 0.03, -0.075, 0.05, 0.035, 8, STEEL);
        b.cylinderBetween(0.03, -0.075, 0.05, 0.05, -0.075, 0.05, 0.008, 4, STEEL_DARK);
        b.boxC(0.055, -0.095, 0.05, 0.012, 0.045, 0.012, '#2b2d42');
      });
      addAnchor('punta', 0, 1.05, -0.58);
      // corcho colgando de la punta cuando no está lanzado
      const hang = new THREE.Group();
      hang.name = 'colgante';
      const bob = meshOf((b) => buildBobber(b, 0.8), mat, 'corcho');
      bob.position.set(0, 0.84, -0.58);
      const lg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 1.05, -0.58), new THREE.Vector3(0, 0.88, -0.58)]);
      const line = new THREE.Line(lg, lineMat);
      line.name = 'sedal-corto';
      hang.add(bob, line);
      group.add(hang);
      parts.set('colgante', hang);
      break;
    }
    case 'cubo':
    case 'cubo_agua': {
      pose = { x: 0.38, y: -0.14, z: -0.62, rx: 0.38, ry: -0.55, rz: 0.06 };
      scale = 0.62;
      group.scale.setScalar(0.82);
      // El antebrazo sale hacia la derecha, por encima del cubo, en vez de hacia abajo.
      armRot.z = 1.2;
      armRot.x = 0.25;
      add('cubo', (b) => {
        // asa (en el puño) y brazos del asa hasta el borde
        b.cylinderBetween(-0.06, 0, 0, 0.06, 0, 0, 0.007, 4, STEEL_DARK);
        b.cylinderBetween(-0.06, 0, 0, -0.14, -0.14, 0, 0.006, 4, STEEL_DARK);
        b.cylinderBetween(0.06, 0, 0, 0.14, -0.14, 0, 0.006, 4, STEEL_DARK);
        // cuerpo de madera con flejes (más ancho arriba)
        b.cylinder(0, -0.38, 0, 0.11, 0.14, 0.24, 10, WOOD_LIGHT, { capTop: false, capColor: '#7a5230' });
        b.cylinder(0, -0.36, 0, 0.115, 0.118, 0.025, 10, STEEL_DARK, { capTop: false, capBottom: false });
        b.cylinder(0, -0.2, 0, 0.13, 0.133, 0.025, 10, STEEL_DARK, { capTop: false, capBottom: false });
        // interior oscuro (visto desde arriba)
        b.push();
        b.translate(0, -0.162, 0);
        b.rotateX(-Math.PI / 2);
        b.disc(0, 0, 0, 0.135, 10, '#5a3a22');
        b.pop();
      });
      const water = add('agua', (b) => {
        b.push();
        b.translate(0, -0.152, 0);
        b.rotateX(-Math.PI / 2);
        b.disc(0, 0, 0, 0.128, 10, '#2a9d8f');
        b.disc(0.02, -0.02, 0.001, 0.05, 6, '#5ec4b6');
        b.pop();
      });
      water.visible = id === 'cubo_agua';
      addAnchor('boca', 0, -0.16, 0);
      break;
    }
    case 'pescado_crudo':
    case 'pescado_asado': {
      pose = { ...SMALL_POSE, ry: -0.9 };
      const cooked = id === 'pescado_asado';
      add('pez', (b) => {
        b.push();
        b.translate(0, 0.06, -0.02);
        b.rotateZ(0.5);
        buildFish(b, cooked ? '#c9844a' : '#8ecae6', cooked ? '#e9a25f' : '#e8f4f2', 1.1, cooked);
        b.pop();
      });
      break;
    }
    case 'conserva':
      pose = SMALL_POSE;
      add('lata', (b) => {
        b.cylinder(0, 0.0, 0, 0.042, 0.042, 0.075, 10, '#adb5bd', { capColor: '#ced4da' });
        b.cylinder(0, 0.015, 0, 0.044, 0.044, 0.045, 10, '#c8553d', { capTop: false, capBottom: false });
        b.cylinder(0, 0.03, 0, 0.0445, 0.0445, 0.012, 10, '#f3ead6', { capTop: false, capBottom: false });
      });
      break;
    case 'fruta':
      pose = SMALL_POSE;
      add('fruta', (b) => {
        b.sphere(0, 0.06, -0.01, 0.055, '#f9c74f', 0, 1.1);
        b.sphere(0.02, 0.07, -0.04, 0.03, '#f8961e', 0, 1);
        b.cylinderBetween(0, 0.11, -0.01, 0.005, 0.135, -0.01, 0.004, 3, '#6e4a2e');
        b.tri(0.005, 0.13, -0.01, 0.04, 0.15, -0.01, 0.02, 0.12, -0.01, PALETTE.plant);
      });
      break;
    case 'hortaliza':
      pose = SMALL_POSE;
      add('hortaliza', (b) => {
        b.sphere(0, 0.06, 0, 0.05, '#90be6d', 0, 1);
        b.sphere(0.03, 0.08, -0.02, 0.035, '#6a994e', 0, 1);
        b.sphere(-0.025, 0.085, 0.01, 0.03, '#a7c957', 0, 1);
        b.cylinderBetween(0, 0.02, 0, 0, -0.05, 0.01, 0.018, 5, '#f4a261');
      });
      break;
    case 'sopa':
    case 'guiso':
      pose = { ...SMALL_POSE, rx: 0.4 };
      add('cuenco', (b) => {
        b.cylinder(0, 0.02, 0, 0.05, 0.085, 0.06, 10, '#f3ead6', { capTop: false });
        b.push();
        b.translate(0, 0.07, 0);
        b.rotateX(-Math.PI / 2);
        b.disc(0, 0, 0, 0.08, 10, id === 'sopa' ? '#f4a261' : '#bc6c25');
        b.disc(0.02, 0.01, 0.002, 0.018, 5, '#90be6d');
        b.disc(-0.025, -0.015, 0.002, 0.016, 5, id === 'sopa' ? '#e9c46a' : '#e8dcc0');
        b.pop();
      });
      break;
    case 'agua_potable':
      pose = { ...SMALL_POSE, rx: 0.15 };
      add('botella', (b) => {
        b.cylinder(0, -0.04, 0, 0.034, 0.034, 0.13, 8, '#4cc9f0');
        b.cylinder(0, 0.09, 0, 0.034, 0.014, 0.035, 8, '#7fd8f5');
        b.cylinder(0, 0.125, 0, 0.015, 0.015, 0.022, 6, '#f8f9fa');
        b.cylinder(0, 0.0, 0, 0.0355, 0.0355, 0.04, 8, '#f3ead6', { capTop: false, capBottom: false });
      });
      break;
    case 'vendaje':
      pose = SMALL_POSE;
      add('venda', (b) => {
        b.cylinderBetween(-0.04, 0.05, 0, 0.04, 0.05, 0, 0.035, 9, '#f8f9fa');
        b.box(0.0, 0.015, -0.01, 0.03, 0.02, 0.06, '#f1ece0');
      });
      break;
    case 'botiquin':
      pose = { ...SMALL_POSE, ry: -0.5 };
      add('botiquin', (b) => {
        b.boxC(0, 0.06, 0, 0.14, 0.1, 0.06, '#e63946');
        b.boxC(0, 0.06, -0.031, 0.05, 0.016, 0.004, '#f8f9fa');
        b.boxC(0, 0.06, -0.031, 0.016, 0.05, 0.004, '#f8f9fa');
        b.boxC(0, 0.12, 0, 0.05, 0.016, 0.02, '#2b2d42');
      });
      break;
    case 'abrigo':
      pose = SMALL_POSE;
      add('abrigo', (b) => {
        b.boxC(0, 0.05, 0, 0.16, 0.06, 0.12, '#3a5a40');
        b.boxC(0, 0.085, 0, 0.15, 0.02, 0.11, '#4f7a56');
        b.boxC(0.0, 0.05, -0.061, 0.012, 0.012, 0.004, '#d6b97b');
      });
      break;
    default: {
      if (def?.category === 'semilla') {
        pose = SMALL_POSE;
        add('semillas', (b) => {
          b.frustum(0, 0.0, 0, 0.09, 0.06, 0.07, 0.045, 0.09, def.color);
          b.cylinder(0, 0.09, 0, 0.022, 0.012, 0.02, 6, ROPE);
          b.frustum(0, 0.11, 0, 0.04, 0.03, 0.06, 0.04, 0.025, def.color);
        });
      } else if (def?.category === 'plano') {
        pose = { ...SMALL_POSE, ry: -0.2 };
        add('plano', (b) => {
          b.cylinderBetween(-0.1, 0.05, 0, 0.1, 0.05, 0, 0.032, 8, def.color);
          b.cylinderBetween(-0.025, 0.05, 0, 0.025, 0.05, 0, 0.034, 8, '#f3ead6');
          b.cylinderBetween(-0.105, 0.05, 0, -0.1, 0.05, 0, 0.026, 8, '#e8f4f2');
        });
      } else {
        pose = SMALL_POSE;
        add('objeto', (b) => buildMaterial(b, id, def?.color ?? '#adb5bd'));
      }
    }
  }
  return { group, parts, anchors, pose, armRot, scale };
}

/** Materiales y piezas (montones, rollos, placas…). */
function buildMaterial(b: GeoBuilder, id: ItemId, color: string): void {
  switch (id) {
    case 'madera':
      b.push();
      b.rotateY(0.3);
      b.box(-0.13, 0.02, -0.03, 0.13, 0.045, 0.03, '#b07d48');
      b.box(-0.12, 0.045, -0.025, 0.12, 0.07, 0.035, '#c89f6c');
      b.pop();
      break;
    case 'chatarra':
      b.push();
      b.rotateZ(0.3);
      b.box(-0.06, 0.02, -0.04, 0.06, 0.03, 0.04, '#8a9399');
      b.rotateX(0.6);
      b.box(-0.04, 0.03, -0.03, 0.05, 0.04, 0.03, PALETTE.rust);
      b.pop();
      b.cylinderBetween(-0.03, 0.04, 0.02, 0.05, 0.1, -0.02, 0.008, 4, STEEL_DARK);
      break;
    case 'placa_metal':
      b.push();
      b.rotateX(-0.3);
      b.box(-0.08, 0.02, -0.06, 0.08, 0.03, 0.06, '#9fb3c1');
      b.pop();
      break;
    case 'tornillos':
      b.boxC(0, 0.03, 0, 0.09, 0.05, 0.07, '#7a5230');
      for (let i = 0; i < 6; i++) b.cylinder(-0.03 + (i % 3) * 0.03, 0.055, -0.015 + Math.floor(i / 3) * 0.03, 0.008, 0.008, 0.02, 6, '#c9c3b6');
      break;
    case 'fibra':
      for (let i = 0; i < 6; i++) b.cylinderBetween(-0.02 + i * 0.008, -0.02, 0, -0.04 + i * 0.016, 0.16, -0.02, 0.006, 3, i % 2 ? '#a9b665' : '#c2c97f');
      b.cylinder(0, 0.03, -0.005, 0.028, 0.028, 0.015, 6, ROPE);
      break;
    case 'cuerda':
      b.push();
      b.rotateX(-Math.PI / 2 + 0.3);
      b.ring(0, 0, -0.04, 0.06, 0.016, 10, ROPE, 4);
      b.ring(0, 0, -0.06, 0.055, 0.015, 10, '#c4a466', 4);
      b.pop();
      break;
    case 'tela':
      b.boxC(0, 0.03, 0, 0.14, 0.03, 0.1, '#e8dcc0');
      b.boxC(0, 0.055, 0, 0.13, 0.02, 0.09, '#f3ead6');
      break;
    case 'plastico':
      b.cylinder(0, -0.02, 0, 0.04, 0.04, 0.1, 7, '#5fb3c9');
      b.cylinder(0, 0.08, 0, 0.04, 0.018, 0.03, 7, '#5fb3c9');
      b.cylinder(0, 0.11, 0, 0.018, 0.018, 0.015, 6, '#e63946');
      break;
    case 'componentes':
      b.boxC(0, 0.04, 0, 0.12, 0.01, 0.08, '#2d6a4f');
      b.boxC(-0.02, 0.05, 0.01, 0.03, 0.012, 0.02, '#1a1a1a');
      b.boxC(0.03, 0.05, -0.015, 0.02, 0.015, 0.02, '#e0a458');
      b.cylinder(0.03, 0.045, 0.025, 0.008, 0.008, 0.02, 6, '#4361ee');
      break;
    case 'combustible':
      b.boxC(0, 0.06, 0, 0.12, 0.14, 0.06, '#c8553d');
      b.boxC(0, 0.14, 0.0, 0.05, 0.02, 0.02, '#2b2d42');
      b.cylinderBetween(0.04, 0.13, 0, 0.055, 0.16, 0, 0.012, 5, '#2b2d42');
      b.boxC(0, 0.06, -0.031, 0.08, 0.04, 0.003, '#a3412d');
      break;
    case 'pieza_mecanica': {
      b.push();
      b.translate(0, 0.06, 0);
      b.rotateX(Math.PI / 2 - 0.3);
      b.cylinder(0, -0.01, 0, 0.05, 0.05, 0.02, 10, '#7d8597');
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        b.boxC(Math.cos(a) * 0.058, 0, Math.sin(a) * 0.058, 0.018, 0.02, 0.018, '#7d8597');
      }
      b.cylinder(0, -0.012, 0, 0.015, 0.015, 0.024, 6, '#2b2d42');
      b.pop();
      break;
    }
    case 'kit_reparacion':
      b.boxC(0, 0.05, 0, 0.14, 0.08, 0.08, '#d4a373');
      b.boxC(0, 0.092, 0, 0.145, 0.01, 0.085, '#b07d48');
      b.boxC(0, 0.11, 0, 0.05, 0.015, 0.015, STEEL_DARK);
      break;
    case 'celula_solar':
      b.push();
      b.rotateX(-0.5);
      b.box(-0.08, 0.03, -0.06, 0.08, 0.04, 0.06, '#3d5a80');
      for (let i = -1; i <= 1; i++) b.box(-0.08, 0.041, i * 0.04 - 0.002, 0.08, 0.043, i * 0.04 + 0.002, '#98c1d9');
      b.pop();
      break;
    default:
      b.boxC(0, 0.05, 0, 0.08, 0.08, 0.08, color);
  }
}
