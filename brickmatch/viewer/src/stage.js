// Escena 3D: carga un modelo LDraw empaquetado y lo muestra con luz de estudio.
//
// Para que gire fluido en un teléfono, las piezas no se dibujan una por una.
// Todas las mallas van en tres lotes (plástico, metal y transparente) que
// comparten la geometría de las piezas repetidas, y las líneas de borde se
// dibujan por instancias: una llamada por tipo de pieza. Las sombras se
// recalculan solo cuando cambia el modelo, no en cada cuadro.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { LDrawLoader } from 'three/addons/loaders/LDrawLoader.js';
import { LDrawConditionalLineMaterial } from 'three/addons/materials/LDrawConditionalLineMaterial.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const GHOST = new THREE.Color(0xe2553a); // pieza que falta en el set elegido
const PAST = new THREE.Color(0xb4bec8); // lo ya armado se apaga hacia este gris
const DIM = new THREE.Color(0xc9d1d9);
const ARROW = 0xe0301e; // flecha que señala cada pieza nueva de un paso
const MAX_ARROWS = 24;
const SEAM = 0.994; // en la vista real cada pieza se achica un pelo: se ven las juntas

// Material original de cada malla (lo usan las miniaturas).
const BASE = new WeakMap();

const EDGE_VS = `
attribute mat4 instanceMatrix;
attribute vec3 instanceColor;
varying vec3 vColor;
void main() {
  vColor = instanceColor;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}`;
const EDGE_FS = `
varying vec3 vColor;
void main() { gl_FragColor = vec4(vColor, 1.0); }`;
// Líneas condicionales de LDraw (el contorno de las caras curvas): solo se
// dibujan cuando los dos puntos de control quedan del mismo lado de la línea.
const COND_VS = `
attribute mat4 instanceMatrix;
attribute vec3 instanceColor;
attribute vec3 control0;
attribute vec3 control1;
attribute vec3 direction;
varying vec3 vColor;
varying float discardFlag;
void main() {
  vColor = instanceColor;
  mat4 mvp = projectionMatrix * modelViewMatrix * instanceMatrix;
  vec4 p0 = mvp * vec4(position, 1.0);
  vec4 p1 = mvp * vec4(position + direction, 1.0);
  vec4 c0 = mvp * vec4(control0, 1.0);
  vec4 c1 = mvp * vec4(control1, 1.0);
  gl_Position = p0;
  vec2 q0 = p0.xy / p0.w;
  vec2 q1 = p1.xy / p1.w;
  vec2 dir = q1 - q0;
  vec2 norm = vec2(-dir.y, dir.x);
  float d0 = dot(normalize(norm), normalize(c0.xy / c0.w - q1));
  float d1 = dot(normalize(norm), normalize(c1.xy / c1.w - q1));
  discardFlag = float(sign(d0) != sign(d1));
}`;
const COND_FS = `
varying vec3 vColor;
varying float discardFlag;
void main() {
  if (discardFlag > 0.5) discard;
  gl_FragColor = vec4(vColor, 1.0);
}`;

const srgb = (color) => color.clone().convertLinearToSRGB();

// Una malla del cargador como lista de [geometría, material]. Las piezas de
// varios colores (el torso de una minifigura) traen grupos: cada grupo pasa a
// ser una geometría propia, que se guarda para no repetirla.
const SPLIT = new WeakMap();
function piecesOf(mesh) {
  if (!Array.isArray(mesh.material)) return [[mesh.geometry, mesh.material]];
  let subs = SPLIT.get(mesh.geometry);
  if (!subs) {
    subs = mesh.geometry.groups.map((grp) => {
      const g = new THREE.BufferGeometry();
      for (const name of ['position', 'normal']) {
        const a = mesh.geometry.attributes[name];
        g.setAttribute(name, new THREE.BufferAttribute(a.array.slice(grp.start * a.itemSize, (grp.start + grp.count) * a.itemSize), a.itemSize));
      }
      g.computeBoundingBox();
      g.computeBoundingSphere();
      return [g, grp.materialIndex];
    });
    SPLIT.set(mesh.geometry, subs);
  }
  return subs.map(([g, index]) => [g, mesh.material[index]]);
}

// Convierte los grupos-pieza que entrega el cargador en lotes dibujables.
class Layer {
  constructor(parts, materials, lineMaterials) {
    this.group = new THREE.Group();
    this.lineGroup = new THREE.Group();
    this.group.add(this.lineGroup);
    this.items = [];
    this.batches = [];
    this.lineSets = [];

    // --- mallas: un lote por acabado -----------------------------------------
    const kindOf = (m) => (m.transparent ? 'glass' : m.metalness > 0.1 ? 'metal' : 'plastic');
    const plan = { plastic: { n: 0, verts: 0, geoms: new Map() }, metal: { n: 0, verts: 0, geoms: new Map() }, glass: { n: 0, verts: 0, geoms: new Map() } };
    for (const part of parts) {
      part.traverse((c) => {
        if (!c.isMesh) return;
        for (const [geometry, material] of piecesOf(c)) {
          const p = plan[kindOf(material)];
          p.n++;
          if (!p.geoms.has(geometry.uuid)) {
            p.geoms.set(geometry.uuid, -1);
            p.verts += geometry.attributes.position.count;
          }
        }
      });
    }
    const batch = {};
    for (const kind of Object.keys(plan)) {
      const p = plan[kind];
      if (!p.n) continue;
      const b = new THREE.BatchedMesh(p.n, p.verts, 0, materials[kind]);
      b.castShadow = kind !== 'glass';
      b.receiveShadow = true;
      b.userData.parts = []; // id de instancia → índice de pieza
      batch[kind] = b;
      this.batches.push(b);
      this.group.add(b);
    }

    // --- líneas: instancias por geometría -------------------------------------
    const lineUse = new Map(); // uuid de la geometría → { geometry, cond, uses: [[pieza, matriz]] }
    const box = new THREE.Box3();
    parts.forEach((part, index) => {
      const item = { slots: [], lines: [], edge: new THREE.Color(0x1a1a1a), box: new THREE.Box3() };
      part.traverse((c) => {
        if (c.isMesh) {
          if (!c.geometry.boundingBox) c.geometry.computeBoundingBox();
          // El centro de la pieza entera: de ahí se achica para marcar las juntas.
          const center = c.geometry.boundingBox.getCenter(new THREE.Vector3());
          for (const [geometry, material] of piecesOf(c)) {
            const kind = kindOf(material);
            const p = plan[kind], b = batch[kind];
            let gid = p.geoms.get(geometry.uuid);
            if (gid < 0) {
              gid = b.addGeometry(geometry);
              p.geoms.set(geometry.uuid, gid);
            }
            const id = b.addInstance(gid);
            b.userData.parts[id] = index;
            const slot = { batch: b, id, base: material.color.clone(), matrix: c.matrixWorld.clone(), center };
            b.setMatrixAt(id, slot.matrix);
            b.setColorAt(id, slot.base);
            item.slots.push(slot);
          }
          item.box.union(box.copy(c.geometry.boundingBox).applyMatrix4(c.matrixWorld));
        } else if (c.isLineSegments) {
          if (!c.isConditionalLine && c.material.color) item.edge = srgb(c.material.color);
          let u = lineUse.get(c.geometry.uuid);
          if (!u) lineUse.set(c.geometry.uuid, (u = { geometry: c.geometry, cond: !!c.isConditionalLine, uses: [] }));
          u.uses.push([index, c.matrixWorld]);
        }
      });
      this.items.push(item);
    });
    for (const u of lineUse.values()) {
      const n = u.uses.length;
      const g = new THREE.InstancedBufferGeometry();
      for (const name of u.cond ? ['position', 'control0', 'control1', 'direction'] : ['position']) g.setAttribute(name, u.geometry.attributes[name]);
      const matrices = new THREE.InstancedBufferAttribute(new Float32Array(16 * n), 16);
      const colors = new THREE.InstancedBufferAttribute(new Float32Array(3 * n), 3);
      g.setAttribute('instanceMatrix', matrices);
      g.setAttribute('instanceColor', colors);
      g.instanceCount = n;
      const lines = new THREE.LineSegments(g, u.cond ? lineMaterials.cond : lineMaterials.edge);
      lines.frustumCulled = false;
      const set = { lines, matrices, colors, base: new Float32Array(16 * n), parts: new Int32Array(n) };
      // Las instancias quedan en el orden del modelo: ocultar los pasos que
      // faltan es acortar la cuenta de instancias.
      u.uses.sort((a, b) => a[0] - b[0]).forEach(([index, matrix], k) => {
        matrix.toArray(set.base, 16 * k);
        set.parts[k] = index;
        this.items[index].lines.push([set, k]);
      });
      matrices.array.set(set.base);
      this.lineSets.push(set);
      this.lineGroup.add(lines);
    }
    for (const item of this.items) for (const [set, k] of item.lines) item.edge.toArray(set.colors.array, 3 * k);
  }

  // Aplica el estado de cada pieza: visible o no, color y contorno.
  apply(states, { seam = 1 } = {}) {
    const color = new THREE.Color(), m = new THREE.Matrix4(), t = new THREE.Matrix4(), s = new THREE.Vector3(seam, seam, seam);
    let last = -1;
    this.items.forEach((item, i) => {
      const st = states[i] || 'normal';
      const visible = st !== 'hidden';
      if (visible) last = i;
      for (const slot of item.slots) {
        slot.batch.setVisibleAt(slot.id, visible);
        if (!visible) continue;
        if (st === 'ghost') color.copy(GHOST);
        else if (st === 'past') color.copy(slot.base).lerp(PAST, 0.5);
        else if (st === 'dim') color.copy(slot.base).lerp(DIM, 0.82);
        else color.copy(slot.base);
        slot.batch.setColorAt(slot.id, color);
        if (seam === 1) slot.batch.setMatrixAt(slot.id, slot.matrix);
        else {
          // achicar alrededor del centro de la pieza
          t.makeTranslation(slot.center.x * (1 - seam), slot.center.y * (1 - seam), slot.center.z * (1 - seam)).scale(s);
          slot.batch.setMatrixAt(slot.id, m.multiplyMatrices(slot.matrix, t));
        }
      }
      for (const [set, k] of item.lines) {
        if (st === 'past' || st === 'dim') color.copy(item.edge).lerp(DIM, 0.55);
        else color.copy(item.edge);
        const c = set.colors.array;
        if (c[3 * k] !== color.r || c[3 * k + 1] !== color.g || c[3 * k + 2] !== color.b) {
          color.toArray(c, 3 * k);
          set.colors.needsUpdate = true;
        }
        const a = set.matrices.array;
        if ((a[16 * k + 15] !== 0) !== visible) {
          for (let e = 0; e < 16; e++) a[16 * k + e] = visible ? set.base[16 * k + e] : 0;
          set.matrices.needsUpdate = true;
        }
      }
    });
    // Las piezas ocultas del final (los pasos que faltan) ni se envían a la GPU.
    for (const set of this.lineSets) {
      let n = set.parts.length;
      while (n > 0 && set.parts[n - 1] > last) n--;
      set.lines.geometry.instanceCount = n;
      set.lines.visible = n > 0;
    }
  }

  dispose() {
    for (const b of this.batches) b.dispose();
    for (const set of this.lineSets) set.lines.geometry.dispose();
  }
}

export class Stage {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = false; // se piden a mano: ver shadows()

    this.scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.42;
    pmrem.dispose();

    this.camera = new THREE.PerspectiveCamera(30, 1, 1, 20000);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI * 0.495;
    this.controls.addEventListener('change', () => this.invalidate());
    // Mientras se mueve el modelo se mide cuánto tarda cada cuadro. Si el
    // equipo no llega a unos 30 por segundo, las líneas de borde se apagan
    // durante el movimiento y vuelven al soltar: gira fluido igual.
    this.controls.addEventListener('start', () => { this._held = true; });
    this.controls.addEventListener('end', () => { this._held = false; });
    this._held = false;
    this._moving = false;
    this._last = 0;
    this._pace = 16;
    this.slow = false;

    this.key = new THREE.DirectionalLight(0xfff1e0, 3.1);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    this.key.shadow.bias = -0.0004;
    this.key.shadow.normalBias = 0.6;
    this.key.shadow.radius = 3;
    this.scene.add(this.key, this.key.target);
    this.fill = new THREE.DirectionalLight(0xd6e6ff, 0.55);
    this.scene.add(this.fill);
    this.scene.add(new THREE.HemisphereLight(0xf2f6ff, 0x6d7480, 0.4));

    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({ opacity: 0.26 }));
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);

    this.holder = new THREE.Group();
    this.scene.add(this.holder);

    // Un material por acabado: el color de cada pieza va por instancia.
    const offset = { polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 };
    this.materials = {
      plastic: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, metalness: 0, ...offset }),
      metal: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0.25, ...offset }),
      glass: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.08, metalness: 0, transparent: true, opacity: 0.6, depthWrite: false, envMapIntensity: 1.4, ...offset }),
    };
    this.lineMaterials = {
      edge: new THREE.ShaderMaterial({ vertexShader: EDGE_VS, fragmentShader: EDGE_FS }),
      cond: new THREE.ShaderMaterial({ vertexShader: COND_VS, fragmentShader: COND_FS }),
    };

    this.parts = []; // un Group por pieza colocada, en el orden del modelo (para miniaturas)
    this.layer = null; // lotes del modelo
    this.figLayer = null; // lotes de las minifiguras de prueba
    this.volumeRoot = null;
    this.showFigs = true;
    this.volPoints = [];
    this.showVolumes = true;
    this.showEdges = true;
    this.real = false; // vista real: sin bordes dibujados ni siluetas de vidrio
    this.highlight = false; // flechas sobre las piezas nuevas (instrucciones)
    this.autoRotate = false;

    // Flechas: apuntan hacia abajo sobre cada pieza nueva del paso, como en un
    // manual. Se dibujan encima de todo y mantienen su tamaño en pantalla.
    const tip = new THREE.ConeGeometry(0.5, 1.1, 20).rotateX(Math.PI).translate(0, 0.55, 0);
    const stem = new THREE.CylinderGeometry(0.17, 0.17, 0.9, 12).translate(0, 1.55, 0);
    const arrow = mergeGeometries([tip, stem]);
    const overlay = { depthTest: false, depthWrite: false, transparent: true, toneMapped: false };
    this.arrowHalo = new THREE.InstancedMesh(arrow, new THREE.MeshBasicMaterial({ color: 0xffffff, ...overlay }), MAX_ARROWS);
    this.arrows = new THREE.InstancedMesh(arrow, new THREE.MeshBasicMaterial({ color: ARROW, ...overlay }), MAX_ARROWS);
    this.arrowHalo.renderOrder = 9;
    this.arrows.renderOrder = 10;
    for (const m of [this.arrowHalo, this.arrows]) {
      m.frustumCulled = false;
      m.count = 0;
      this.scene.add(m);
    }
    this.arrowAt = []; // punto que señala cada flecha
    this._dirty = true;
    this._raf = 0;
    this._loop = this._loop.bind(this);

    const ro = new ResizeObserver(() => this.resize());
    ro.observe(canvas.parentElement);
    this.resize();
    this._raf = requestAnimationFrame(this._loop);
  }

  invalidate() {
    this._dirty = true;
  }

  // Las sombras no dependen de la cámara: se rehacen solo cuando cambia lo que se ve.
  shadows() {
    this.renderer.shadowMap.needsUpdate = true;
    this._dirty = true;
  }

  resize() {
    const box = this.canvas.parentElement.getBoundingClientRect();
    const w = Math.max(50, Math.floor(box.width)), h = Math.max(50, Math.floor(box.height));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.invalidate();
  }

  _loop() {
    this._raf = requestAnimationFrame(this._loop);
    if (this.autoRotate) {
      this.controls.autoRotate = true;
      this.controls.autoRotateSpeed = 1.2;
      this._dirty = true;
    } else {
      this.controls.autoRotate = false;
    }
    const changed = this.controls.update();
    if (changed) this._dirty = true;
    const moving = this._held || changed || this.autoRotate;
    if (moving !== this._moving) {
      this._moving = moving;
      this._last = 0;
      if (this.slow) this.refresh();
    }
    if (!this._dirty) return;
    this._dirty = false;
    const now = performance.now();
    if (moving && this._last) {
      this._pace = this._pace * 0.85 + (now - this._last) * 0.15;
      if (this._pace > 36 && !this.slow) {
        this.slow = true;
        this.refresh();
      }
    }
    this._last = moving ? now : 0;
    this._placeArrows();
    this.renderer.render(this.scene, this.camera);
  }

  renderNow() {
    this.controls.update();
    this._placeArrows();
    this.renderer.render(this.scene, this.camera);
    this._dirty = false;
  }

  // Cada flecha se escala con su distancia a la cámara: siempre mide lo mismo en pantalla.
  _placeArrows() {
    const n = this.arrowAt.length;
    this.arrows.count = this.arrowHalo.count = n;
    if (!n) return;
    const k = Math.tan((this.camera.fov * Math.PI) / 360) * 0.085;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), p = new THREE.Vector3();
    this.arrowAt.forEach((at, i) => {
      const size = this.camera.position.distanceTo(at) * k;
      p.copy(at).y += size * 0.25;
      this.arrows.setMatrixAt(i, m.compose(p, q, v.setScalar(size)));
      // el halo blanco: la misma flecha un poco más gorda y larga
      p.y -= size * 0.14;
      this.arrowHalo.setMatrixAt(i, m.compose(p, q, v.set(size * 1.45, size * 1.12, size * 1.45)));
    });
    this.arrows.instanceMatrix.needsUpdate = true;
    this.arrowHalo.instanceMatrix.needsUpdate = true;
  }

  // Acabado del plástico de los materiales originales (los usan las miniaturas).
  _tune(root) {
    root.traverse((c) => {
      if (!c.isMesh) return;
      BASE.set(c, c.material);
      for (const m of Array.isArray(c.material) ? c.material : [c.material]) {
        if (m.transparent) {
          m.roughness = 0.08;
          m.envMapIntensity = 1.4;
        } else if (m.metalness < 0.2) {
          m.roughness = 0.55;
        }
      }
    });
  }

  async _parse(text) {
    const loader = new LDrawLoader();
    loader.setConditionalLineMaterial(LDrawConditionalLineMaterial);
    loader.smoothNormals = true;
    return new Promise((resolve, reject) => loader.parse(text, resolve, reject));
  }

  // Capa de minifiguras de prueba (figs.mpd): se superpone al modelo ya cargado.
  // Lo que no es un grupo son los volúmenes de prueba (un vehículo, un mecha):
  // se dibujan como cajas de vidrio apenas visibles, con sus aristas.
  async loadFigs(text, volumes = 0) {
    const root = await this._parse(text);
    root.rotation.x = Math.PI;
    root.position.copy(this.root.position);
    root.updateMatrixWorld(true);
    this._tune(root);
    this._clearFigs();
    this.figLayer = new Layer(root.children.filter((c) => c.isGroup), this.materials, this.lineMaterials);
    this._figSeam = null;
    this.holder.add(this.figLayer.group);

    this.volumeRoot = new THREE.Group();
    this.volPoints = [];
    const glass = new THREE.MeshBasicMaterial({ color: 0x6fb7d9, transparent: true, opacity: 0.13, depthWrite: false, side: THREE.DoubleSide });
    const edge = new THREE.LineBasicMaterial({ color: 0x2f7ea6 });
    const vb = new THREE.Box3();
    for (const c of volumes ? root.children.filter((o) => !o.isGroup) : []) {
      if (c.isMesh) {
        c.material = glass;
        c.castShadow = false;
        c.receiveShadow = false;
        c.renderOrder = 2;
        vb.setFromObject(c);
        for (const x of [vb.min.x, vb.max.x]) for (const y of [vb.min.y, vb.max.y]) for (const z of [vb.min.z, vb.max.z]) this.volPoints.push(new THREE.Vector3(x, y, z));
      } else if (c.isLineSegments && !c.isConditionalLine) {
        c.material = edge;
      } else continue;
      // El objeto conserva la transformación de la raíz al pasar a la escena.
      c.matrix.copy(c.matrixWorld);
      c.matrixAutoUpdate = false;
      this.volumeRoot.add(c);
    }
    this.holder.add(this.volumeRoot);
    this.refresh();
    this.shadows();
  }

  _clearFigs() {
    if (this.figLayer) {
      this.holder.remove(this.figLayer.group);
      this.figLayer.dispose();
      this.figLayer = null;
    }
    if (this.volumeRoot) {
      this.holder.remove(this.volumeRoot);
      this.volumeRoot = null;
    }
    this.volPoints = [];
  }

  setFigs(on) {
    if (this.showFigs === on) return;
    this.showFigs = on;
    this.refresh();
    this.shadows();
  }

  setVolumes(on) {
    if (this.showVolumes === on) return;
    this.showVolumes = on;
    this.refresh();
  }

  // Carga el texto .mpd empaquetado. Devuelve cuando el modelo está en escena.
  async load(text) {
    this._clearFigs();
    if (this.layer) {
      this.holder.remove(this.layer.group);
      this.layer.dispose();
      this.layer = null;
    }
    this.parts = [];
    this.states = null;
    this.arrowAt = [];
    const root = await this._parse(text);
    root.rotation.x = Math.PI; // LDraw tiene la Y hacia abajo
    this.parts = root.children.filter((c) => c.isGroup);
    this._tune(root);
    this.root = root;
    root.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(root);
    const center = box.getCenter(new THREE.Vector3());
    root.position.set(-center.x, -box.min.y, -center.z);
    root.updateMatrixWorld(true);
    this.layer = new Layer(this.parts, this.materials, this.lineMaterials);
    this.holder.add(this.layer.group);

    this.box = new THREE.Box3();
    // Esquinas de la caja de cada pieza: sirven para encuadrar ajustado a la silueta.
    this.fitPoints = [];
    for (const item of this.layer.items) {
      const b = item.box;
      this.box.union(b);
      for (const x of [b.min.x, b.max.x]) {
        for (const y of [b.min.y, b.max.y]) {
          for (const z of [b.min.z, b.max.z]) this.fitPoints.push(new THREE.Vector3(x, y, z));
        }
      }
    }
    this.size = this.box.getSize(new THREE.Vector3());
    this.radius = this.size.length() / 2;

    const r = this.radius;
    this.ground.scale.set(r * 12, r * 12, 1);
    this.key.position.set(r * 1.25, r * 2.3, r * 1.45);
    this.key.target.position.set(0, this.size.y * 0.3, 0);
    const cam = this.key.shadow.camera;
    cam.left = cam.bottom = -r * 1.25;
    cam.right = cam.top = r * 1.25;
    cam.near = r * 0.2;
    cam.far = r * 6;
    cam.updateProjectionMatrix();
    this.fill.position.set(-r * 1.8, r * 0.8, r * 0.4);

    this.center = new THREE.Vector3(0, this.size.y * 0.5, 0);
    this.controls.minDistance = r * 0.12;
    this.controls.maxDistance = r * 9;
    this.view(-32, 24);
    this.refresh();
    this.shadows();
    return root;
  }

  // Encuadra el modelo desde un azimut/elevación (grados). El frente está en azimut 0.
  // Busca la distancia justa y centra la silueta: como la perspectiva agranda lo
  // que está cerca, el centro de la caja no es el centro de lo que se ve.
  // padBottom: píxeles de abajo que tapa la botonera y hay que dejar libres.
  view(azimuth, elevation, zoom = 1, padBottom = 0) {
    const a = (azimuth * Math.PI) / 180, e = (elevation * Math.PI) / 180;
    const dir = new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e));
    const right = new THREE.Vector3(Math.cos(a), 0, -Math.sin(a));
    const up = new THREE.Vector3().crossVectors(dir, right);
    const t = this.controls.target.copy(this.center);
    const tanFull = Math.tan((this.camera.fov * Math.PI) / 360);
    const tanH = tanFull * this.camera.aspect;
    const pad = Math.min(0.3, padBottom / (this.canvas.clientHeight || 1));
    const tanV = tanFull * (1 - pad);
    const p = new THREE.Vector3();
    const pts = this.showVolumes && !this.real && this.volPoints.length ? this.fitPoints.concat(this.volPoints) : this.fitPoints;
    let d = 1;
    for (let pass = 0; pass < 8; pass++) {
      d = 1;
      for (const corner of pts) {
        p.copy(corner).sub(t);
        const depth = p.dot(dir);
        d = Math.max(d, depth + Math.abs(p.dot(right)) / tanH, depth + Math.abs(p.dot(up)) / tanV);
      }
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const corner of pts) {
        p.copy(corner).sub(t);
        const w = d - p.dot(dir);
        const sx = p.dot(right) / (w * tanH), sy = p.dot(up) / (w * tanV);
        x0 = Math.min(x0, sx); x1 = Math.max(x1, sx);
        y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
      }
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      if (Math.abs(cx) < 0.003 && Math.abs(cy) < 0.003) break;
      t.addScaledVector(right, cx * d * tanH).addScaledVector(up, cy * d * tanV);
    }
    d = (d * 1.1) / zoom;
    t.addScaledVector(up, -pad * d * tanFull);
    this.camera.position.copy(t).addScaledVector(dir, d);
    this.camera.lookAt(t);
    this.controls.update();
    this.invalidate();
  }

  // Mira un punto del modelo desde cerca. (x, y, z) en studs/plates/studs del
  // constructor; dist en studs. Sirve para revisar detalles en las capturas.
  viewAt(azimuth, elevation, [x, y, z], dist) {
    const a = (azimuth * Math.PI) / 180, e = (elevation * Math.PI) / 180;
    const dir = new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e));
    const t = this.controls.target.set(x * 20, y * 8, -z * 20).add(this.root.position);
    this.camera.position.copy(t).addScaledVector(dir, dist * 20);
    this.camera.lookAt(t);
    this.controls.update();
    this.invalidate();
  }

  // Acerca la cámara a un grupo de piezas (las nuevas de un paso de armado).
  //   context: piezas que conviene tener en cuadro además de las nuevas (la zona
  //            de trabajo del capítulo).
  //   sticky:  si las nuevas ya se ven bien desde donde está la cámara, no la
  //            mueve: los pasos seguidos de una zona se ven desde el mismo lugar.
  //   padTop:  fracción de arriba del visor que tapan la barra y el recuadro.
  //   pick:    elige el punto de vista (si no, conserva el ángulo actual).
  // Devuelve { turned, moved }.
  focusParts(indices, { pick = true, sticky = false, context = null, padTop = 0 } = {}) {
    if (!indices.length || !this.layer) return null;
    const mine = new Set(indices);
    const box = new THREE.Box3();
    const samples = []; // por pieza: su centro y el centro de su cara de arriba
    for (const i of indices) {
      const b = this.layer.items[i].box;
      box.union(b);
      if (samples.length < 12) {
        const c = b.getCenter(new THREE.Vector3());
        samples.push([c, new THREE.Vector3(c.x, b.max.y - 1, c.z)]);
      }
    }
    const frame = box.clone();
    if (context) for (const i of context) frame.union(this.layer.items[i].box);
    const center = frame.getCenter(new THREE.Vector3());
    const r = Math.max((frame.getSize(new THREE.Vector3()).length() / 2) * 1.12, 140);
    const tanV = Math.tan((this.camera.fov * Math.PI) / 360);
    const pad = Math.min(0.45, Math.max(0, padTop));
    const d = r / Math.sin(Math.atan(Math.min(tanV * (1 - pad), tanV * this.camera.aspect)));
    const toDir = (az, el) => {
      const a = (az * Math.PI) / 180, e = (el * Math.PI) / 180;
      return new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e));
    };
    const current = this.camera.position.clone().sub(this.controls.target).normalize();
    if (current.y < 0.2) current.copy(toDir(-34, 28));

    const ray = new THREE.Raycaster();
    const blockers = this.layer.batches.filter((b) => !b.material.transparent);
    const hits = [];
    const clear = (p, eye) => {
      const to = eye.clone().sub(p);
      ray.far = to.length();
      ray.near = 5;
      ray.set(p, to.normalize());
      hits.length = 0;
      for (const b of blockers) b.raycast(ray, hits);
      return !hits.some((h) => !mine.has(h.object.userData.parts[h.batchId]));
    };
    // Fracción de las piezas nuevas que se ve (aunque sea en parte) desde un punto.
    const seen = (eye) => samples.filter((pts) => pts.some((p) => clear(p, eye))).length / samples.length;

    if (sticky) {
      this.camera.updateMatrixWorld();
      const v = new THREE.Vector3();
      const top = 1 - 2 * pad - 0.1;
      let inside = true;
      for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
        v.set(x, y, z).project(this.camera);
        if (Math.abs(v.x) > 0.84 || v.y > top || v.y < -0.8 || v.z > 1) inside = false;
      }
      const now = this.camera.position.distanceTo(center);
      if (inside && now > d * 0.72 && now < d * 1.3 && (!pick || seen(this.camera.position) >= 0.7)) return { turned: false, moved: false };
    }

    // Como en un manual: la vista de tres cuartos de siempre, y solo si desde
    // ahí las piezas nuevas quedan tapadas se prueba girar o mirar de más arriba.
    let dir = current;
    if (pick) {
      const eyeOf = (v) => center.clone().addScaledVector(v, d);
      let best = -1;
      for (const [az, el] of [[-34, 30], [34, 30], [-34, 46], [34, 46], [-146, 30], [146, 30], [-146, 46], [146, 46], [-90, 40], [90, 40], [0, 40], [180, 40], [-34, 62], [34, 62], [-146, 62], [146, 62], [0, 78]]) {
        const v = toDir(az, el);
        const score = seen(eyeOf(v));
        if (score > best + 0.12) {
          best = score;
          dir = v;
        }
        if (score >= 0.75) {
          dir = v;
          break;
        }
      }
    }
    const turned = dir.angleTo(current) > 0.35;
    // Lo que tapa la barra de arriba se compensa bajando el modelo en el cuadro.
    const camUp = new THREE.Vector3(0, 1, 0).projectOnPlane(dir).normalize();
    const target = center.clone().addScaledVector(camUp, pad * d * tanV);
    this.controls.target.copy(target);
    this.camera.position.copy(target).addScaledVector(dir, d);
    this.camera.lookAt(target);
    this.controls.update();
    this.invalidate();
    return { turned, moved: true };
  }

  setEdges(on) {
    this.showEdges = on;
    this.refresh();
  }

  // Vista real: como se vería armado sobre la mesa. Sin bordes dibujados ni
  // siluetas de vidrio, con el plástico más brillante y una junta fina entre piezas.
  setReal(on) {
    if (this.real === on) return;
    this.real = on;
    this.materials.plastic.roughness = on ? 0.34 : 0.55;
    this.materials.metal.roughness = on ? 0.22 : 0.3;
    this.scene.environmentIntensity = on ? 0.62 : 0.42;
    this.refresh();
    this.shadows();
  }

  // Estado de cada pieza: 'normal' | 'new' (resaltada) | 'past' (ya armada) | 'dim' | 'ghost' (falta) | 'hidden'
  // highlight: cada pieza 'new' lleva una flecha que la señala.
  setStates(states, { highlight = false } = {}) {
    this.states = states;
    this.highlight = highlight;
    this.arrowAt = [];
    if (highlight && this.layer) {
      states.forEach((st, i) => {
        if (st !== 'new' || this.arrowAt.length >= MAX_ARROWS) return;
        const b = this.layer.items[i].box;
        this.arrowAt.push(new THREE.Vector3((b.min.x + b.max.x) / 2, b.max.y, (b.min.z + b.max.z) / 2));
      });
    }
    this.refresh();
    this.shadows();
  }

  refresh() {
    const lines = this.showEdges && !this.real && !(this.slow && this._moving);
    const seam = this.real ? SEAM : 1;
    if (this.layer) {
      this.layer.apply(this.states || [], { seam });
      this.layer.lineGroup.visible = lines;
    }
    if (this.figLayer) {
      this.figLayer.group.visible = this.showFigs;
      if (this._figSeam !== seam) {
        this._figSeam = seam;
        this.figLayer.apply([], { seam });
      }
      this.figLayer.lineGroup.visible = lines;
    }
    if (this.volumeRoot) this.volumeRoot.visible = this.showVolumes && !this.real;
    this.invalidate();
  }
}

// Miniaturas de piezas sueltas (para la lista de piezas y los pasos).
export class Thumbnailer {
  constructor(size = 112) {
    this.size = size;
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = size;
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.6;
    pmrem.dispose();
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(-1.2, 2.2, 1.6);
    this.scene.add(key, new THREE.HemisphereLight(0xffffff, 0x8a8f99, 0.7));
    this.camera = new THREE.PerspectiveCamera(22, 1, 1, 5000);
    this.holder = new THREE.Group();
    this.holder.rotation.x = Math.PI;
    this.scene.add(this.holder);
  }

  // part: Group de una pieza del modelo (se clona; comparte geometría y materiales)
  shot(part) {
    const sources = [];
    part.traverse((c) => {
      if (c.isMesh) sources.push(c);
    });
    const copy = part.clone();
    copy.position.set(0, 0, 0);
    copy.quaternion.identity();
    copy.scale.set(1, 1, 1);
    let k = 0;
    copy.traverse((c) => {
      if (c.isMesh) c.material = BASE.get(sources[k++]);
      c.visible = true;
    });
    this.holder.clear();
    this.holder.add(copy);
    this.holder.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(this.holder);
    const center = box.getCenter(new THREE.Vector3());
    const radius = Math.max(box.getSize(new THREE.Vector3()).length() / 2, 6);
    const d = (radius / Math.sin((this.camera.fov * Math.PI) / 360)) * 1.04;
    const a = (-38 * Math.PI) / 180, e = (30 * Math.PI) / 180;
    this.camera.position.set(center.x + d * Math.sin(a) * Math.cos(e), center.y + d * Math.sin(e), center.z + d * Math.cos(a) * Math.cos(e));
    this.camera.lookAt(center);
    this.renderer.render(this.scene, this.camera);
    return this.canvas.toDataURL('image/png');
  }

  dispose() {
    this.renderer.dispose();
    this.renderer.forceContextLoss?.();
  }
}
