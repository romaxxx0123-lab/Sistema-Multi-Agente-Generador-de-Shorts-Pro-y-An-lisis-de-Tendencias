// Reflejos planares (calles mojadas, charcos y mar): render espejado a media resolución con plano de corte oblicuo.
import * as THREE from 'three';
import { U } from './shaders.js';

const _normal = new THREE.Vector3(0, 1, 0);
const _reflPos = new THREE.Vector3();
const _camPos = new THREE.Vector3();
const _rot = new THREE.Matrix4();
const _look = new THREE.Vector3(0, 0, -1);
const _target = new THREE.Vector3();
const _view = new THREE.Vector3();
const _plane = new THREE.Plane();
const _clip = new THREE.Vector4();
const _q = new THREE.Vector4();

export class PlanarReflection {
  constructor(engine, scale = 0.5) {
    this.engine = engine;
    this.scale = scale;
    this.rt = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, depthBuffer: true });
    this.rt.texture.generateMipmaps = false;
    this.rt.texture.minFilter = THREE.LinearFilter;
    this.cam = new THREE.PerspectiveCamera();
    this.cam.layers.enableAll(); // el reflejo incluye vehículos y personas
    this.enabled = false;
    this.wanted = false;
    this.hidden = [];
    this.planeY = 0.02;
    U.uReflTex.value = this.rt.texture;
    this.resize();
    engine.onQualityChange(() => this.resize());
    window.addEventListener('resize', () => this.resize());
  }

  /** Objetos que no se dibujan en el pase de reflejo (las propias superficies reflectantes). */
  exclude(...objs) {
    this.hidden.push(...objs);
  }

  resize() {
    const r = this.engine.renderer;
    const w = Math.max(2, Math.floor(r.domElement.width * this.scale));
    const h = Math.max(2, Math.floor(r.domElement.height * this.scale));
    this.rt.setSize(w, h);
  }

  render(camera) {
    const on = this.enabled && this.wanted;
    U.uReflOn.value = on ? 1 : 0;
    if (!on) return;
    _reflPos.set(camera.position.x, this.planeY, camera.position.z);
    camera.updateMatrixWorld();
    _camPos.setFromMatrixPosition(camera.matrixWorld);
    _view.subVectors(_reflPos, _camPos);
    if (_view.dot(_normal) > 0) {
      U.uReflOn.value = 0;
      return;
    }
    _view.reflect(_normal).negate().add(_reflPos);
    _rot.extractRotation(camera.matrixWorld);
    _look.set(0, 0, -1).applyMatrix4(_rot).add(_camPos);
    _target.subVectors(_reflPos, _look).reflect(_normal).negate().add(_reflPos);
    const vc = this.cam;
    vc.position.copy(_view);
    vc.up.set(0, 1, 0).applyMatrix4(_rot).reflect(_normal);
    vc.lookAt(_target);
    vc.far = camera.far;
    vc.near = camera.near;
    vc.updateMatrixWorld();
    vc.projectionMatrix.copy(camera.projectionMatrix);
    const tm = U.uReflMatrix.value;
    tm.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    tm.multiply(vc.projectionMatrix);
    tm.multiply(vc.matrixWorldInverse);
    // Plano de corte oblicuo (evita dibujar lo que está bajo el plano)
    _plane.setFromNormalAndCoplanarPoint(_normal, _reflPos);
    _plane.applyMatrix4(vc.matrixWorldInverse);
    _clip.set(_plane.normal.x, _plane.normal.y, _plane.normal.z, _plane.constant);
    const pm = vc.projectionMatrix.elements;
    _q.x = (Math.sign(_clip.x) + pm[8]) / pm[0];
    _q.y = (Math.sign(_clip.y) + pm[9]) / pm[5];
    _q.z = -1.0;
    _q.w = (1.0 + pm[10]) / pm[14];
    _clip.multiplyScalar(2.0 / _clip.dot(_q));
    pm[2] = _clip.x;
    pm[6] = _clip.y;
    pm[10] = _clip.z + 1.0;
    pm[14] = _clip.w;
    vc.projectionMatrixInverse.copy(vc.projectionMatrix).invert();

    const r = this.engine.renderer;
    const scene = this.engine.scene;
    const vis = this.hidden.map((o) => o.visible);
    for (const o of this.hidden) o.visible = false;
    const prevRT = r.getRenderTarget();
    const prevShadow = r.shadowMap.autoUpdate;
    r.shadowMap.autoUpdate = false;
    r.setRenderTarget(this.rt);
    r.clear();
    r.render(scene, vc);
    r.setRenderTarget(prevRT);
    r.shadowMap.autoUpdate = prevShadow;
    this.hidden.forEach((o, i) => (o.visible = vis[i]));
  }
}

/** GLSL: muestreo del reflejo planar con estiramiento vertical según rugosidad (estelas de luces). */
export const GLSL_PLANAR = /* glsl */ `
vec3 planarRefl(vec3 wp, vec3 nW, float rough){
  vec4 rc = uReflMatrix * vec4(wp, 1.0);
  vec2 uv = rc.xy / rc.w + nW.xz * (.025 + rough * .05);
  float s = rough * .06;
  vec3 c = texture2D(uReflTex, uv).rgb * .4;
  c += texture2D(uReflTex, uv + vec2(0., s * .5)).rgb * .2;
  c += texture2D(uReflTex, uv - vec2(0., s * .5)).rgb * .2;
  c += texture2D(uReflTex, uv + vec2(0., s)).rgb * .1;
  c += texture2D(uReflTex, uv - vec2(0., s)).rgb * .1;
  return c;
}
`;
