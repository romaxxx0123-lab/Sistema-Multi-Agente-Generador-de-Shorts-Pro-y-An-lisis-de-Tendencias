// Escena 3D: carga un modelo LDraw empaquetado y lo muestra con luz de estudio.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { LDrawLoader } from 'three/addons/loaders/LDrawLoader.js';
import { LDrawConditionalLineMaterial } from 'three/addons/materials/LDrawConditionalLineMaterial.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const GHOST_COLOR = 0xe2553a;

// Material original de cada malla (fuera de userData para que clonar sea barato).
const BASE = new WeakMap();

export class Stage {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

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

    this.parts = []; // un Group por pieza colocada, en el orden del modelo
    this.showEdges = true;
    this.autoRotate = false;
    this.variants = new Map();
    this.ghost = new THREE.MeshStandardMaterial({ color: GHOST_COLOR, transparent: true, opacity: 0.3, roughness: 0.6, depthWrite: false });
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
    if (this.controls.update()) this._dirty = true;
    if (!this._dirty) return;
    this._dirty = false;
    this.renderer.render(this.scene, this.camera);
  }

  renderNow() {
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this._dirty = false;
  }

  // Carga el texto .mpd empaquetado. Devuelve cuando el modelo está en escena.
  async load(text) {
    this.holder.clear();
    this.parts = [];
    this.variants.clear();
    const loader = new LDrawLoader();
    loader.setConditionalLineMaterial(LDrawConditionalLineMaterial);
    loader.smoothNormals = true;
    const root = await new Promise((resolve, reject) => loader.parse(text, resolve, reject));
    root.rotation.x = Math.PI; // LDraw tiene la Y hacia abajo
    this.parts = root.children.filter((c) => c.isGroup);
    root.traverse((c) => {
      if (c.isMesh) {
        c.castShadow = true;
        c.receiveShadow = true;
        BASE.set(c, c.material);
        for (const m of Array.isArray(c.material) ? c.material : [c.material]) {
          if (m.transparent) {
            m.roughness = 0.08;
            m.envMapIntensity = 1.4;
          } else if (m.metalness < 0.2) {
            m.roughness = 0.55;
          }
        }
      }
    });
    this.root = root;
    this.holder.add(root);
    root.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(root);
    const center = box.getCenter(new THREE.Vector3());
    root.position.set(-center.x, -box.min.y, -center.z);
    root.updateMatrixWorld(true);
    this.box = new THREE.Box3().setFromObject(root);
    // Esquinas de la caja de cada pieza: sirven para encuadrar ajustado a la silueta.
    this.fitPoints = [];
    const partBox = new THREE.Box3();
    for (const part of this.parts) {
      partBox.setFromObject(part);
      for (const x of [partBox.min.x, partBox.max.x]) {
        for (const y of [partBox.min.y, partBox.max.y]) {
          for (const z of [partBox.min.z, partBox.max.z]) this.fitPoints.push(new THREE.Vector3(x, y, z));
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
    this.controls.minDistance = r * 0.35;
    this.controls.maxDistance = r * 9;
    this.view(-32, 24);
    this.setEdges(this.showEdges);
    this.invalidate();
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
    let d = 1;
    for (let pass = 0; pass < 8; pass++) {
      d = 1;
      for (const corner of this.fitPoints) {
        p.copy(corner).sub(t);
        const depth = p.dot(dir);
        d = Math.max(d, depth + Math.abs(p.dot(right)) / tanH, depth + Math.abs(p.dot(up)) / tanV);
      }
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const corner of this.fitPoints) {
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

  setEdges(on) {
    this.showEdges = on;
    this.refresh();
  }

  _variant(material, kind) {
    const key = `${kind}:${material.uuid}`;
    let v = this.variants.get(key);
    if (!v) {
      v = material.clone();
      if (kind === 'new') {
        v.emissive = new THREE.Color(0xffd27a);
        v.emissiveIntensity = 0.2;
      } else if (kind === 'dim') {
        v.color = material.color.clone().lerp(new THREE.Color(0x9aa3ad), 0.72);
        v.transparent = true;
        v.opacity = 0.32;
        v.depthWrite = false;
      }
      this.variants.set(key, v);
    }
    return v;
  }

  // Estado de cada pieza: 'normal' | 'new' (resaltada) | 'dim' | 'ghost' (falta) | 'hidden'
  setStates(states) {
    this.states = states;
    this.refresh();
  }

  refresh() {
    const states = this.states || [];
    this.parts.forEach((part, i) => {
      const st = states[i] || 'normal';
      part.visible = st !== 'hidden';
      if (!part.visible) return;
      part.traverse((c) => {
        if (c.isMesh) {
          const base = BASE.get(c);
          const map = (m) => (st === 'ghost' ? this.ghost : st === 'normal' ? m : this._variant(m, st));
          c.material = Array.isArray(base) ? base.map(map) : map(base);
          c.castShadow = st === 'normal' || st === 'new';
        } else if (c.isLineSegments) {
          c.visible = this.showEdges && (st === 'normal' || st === 'new');
        }
      });
    });
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
