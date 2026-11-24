// Motor de render: WebGL2 HDR, sombras en cascada, AO, bloom, tone mapping AgX y postproceso.
import * as THREE from 'three';
import {
  EffectComposer, RenderPass, EffectPass, BloomEffect, ToneMappingEffect, ToneMappingMode,
  SMAAEffect, SMAAPreset, Effect, BlendFunction, DepthOfFieldEffect,
} from 'postprocessing';
import { N8AOPostPass } from 'n8ao';
import { CSM } from 'three/examples/jsm/csm/CSM.js';
import { U } from '../world/shaders.js';

export const QUALITY_PRESETS = {
  bajo: { label: 'Bajo', pixelRatio: 0.75, msaa: 0, smaa: true, ao: null, cascades: 2, shadowSize: 1024, shadows: false, shadowFar: 220, viewDist: 650, fogMul: 2.0, density: 0.55, texSize: 512, bloom: true, reflections: false },
  medio: { label: 'Medio', pixelRatio: 1.0, msaa: 0, smaa: true, ao: 'Performance', aoHalf: true, cascades: 2, shadowSize: 1024, shadows: true, shadowFar: 280, viewDist: 900, fogMul: 1.35, density: 0.8, texSize: 512, bloom: true, reflections: false },
  alto: { label: 'Alto', pixelRatio: 1.25, msaa: 4, smaa: false, ao: 'Medium', aoHalf: true, cascades: 3, shadowSize: 2048, shadows: true, shadowFar: 420, viewDist: 1300, fogMul: 1.0, density: 1.0, texSize: 1024, bloom: true, reflections: true },
  ultra: { label: 'Ultra', pixelRatio: 2.0, msaa: 4, smaa: false, ao: 'High', aoHalf: false, cascades: 4, shadowSize: 2048, shadows: true, shadowFar: 650, viewDist: 1800, fogMul: 1.0, density: 1.15, texSize: 1024, bloom: true, reflections: true },
};

class GradeEffect extends Effect {
  constructor() {
    super('GradeEffect', /* glsl */ `
      uniform float grExposure; uniform float grSat; uniform float grContrast; uniform vec3 grTint;
      uniform float grDesat; uniform float grSpeed;
      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor){
        vec3 c = inputColor.rgb;
        if (grSpeed > .001) {
          vec2 dir = uv - .5;
          vec3 acc = c; float w = 1.;
          for (int i = 1; i < 7; i++){
            float s = 1. - float(i) * grSpeed * .009;
            acc += texture2D(inputBuffer, .5 + dir * s).rgb * (1. - float(i) * .1);
            w += 1. - float(i) * .1;
          }
          float m = smoothstep(.12, .5, length(dir));
          c = mix(c, acc / w, m);
        }
        c *= grExposure;
        c *= grTint;
        vec3 lc = log2(max(c, vec3(1e-6)) / .18);
        lc *= grContrast;
        c = .18 * exp2(lc);
        float l = dot(c, vec3(.2126, .7152, .0722));
        c = mix(vec3(l), c, grSat * (1. - grDesat));
        outputColor = vec4(c, inputColor.a);
      }
    `, {
      uniforms: new Map([
        ['grExposure', new THREE.Uniform(1)], ['grSat', new THREE.Uniform(1.16)], ['grContrast', new THREE.Uniform(1.1)],
        ['grTint', new THREE.Uniform(new THREE.Vector3(1, 1, 1))], ['grDesat', new THREE.Uniform(0)], ['grSpeed', new THREE.Uniform(0)],
      ]),
    });
  }
}

class FinishEffect extends Effect {
  constructor() {
    super('FinishEffect', /* glsl */ `
      uniform float fiVignette; uniform float fiGrain; uniform float fiDamage; uniform float fiLetterbox;
      uniform float fiWhite; uniform float fiBlack; uniform int fiFilter; uniform float fiTimeS;
      vec3 overlay(vec3 a, vec3 b){ return mix(2. * a * b, 1. - 2. * (1. - a) * (1. - b), step(.5, a)); }
      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor){
        vec3 c = clamp(inputColor.rgb, 0., 1.);
        vec2 q = uv - .5;
        float l = dot(c, vec3(.2126, .7152, .0722));
        if (fiFilter == 1) { c = vec3(smoothstep(.05, .95, l)); }
        else if (fiFilter == 2) { c = mix(vec3(l), c, .55) * vec3(1.08, .96, .78) + vec3(.06, .04, .02); c = mix(c, vec3(.92, .86, .74), .08); }
        else if (fiFilter == 3) { c = mix(c, overlay(c, mix(vec3(.15, .85, .9), vec3(1., .35, .8), smoothstep(.2, .8, l))), .55); }
        else if (fiFilter == 4) { c = pow(c, vec3(.92, .98, 1.1)) * vec3(1.08, 1., .9); }
        else if (fiFilter == 5) { c = mix(c, overlay(c, mix(vec3(.1, .35, .45), vec3(1., .65, .35), l)), .45); }
        else if (fiFilter == 6) { c = smoothstep(.06, .9, c); c = mix(vec3(l), c, 1.25); }
        float vig = smoothstep(.95, .25, length(q * vec2(1.15, 1.)));
        c *= mix(1., vig, fiVignette);
        float edge = smoothstep(.22, .72, length(q * vec2(1.2, 1.)));
        c = mix(c, c * .35 + vec3(.55, .02, .03) * .55, edge * fiDamage);
        float n = fract(sin(dot(uv * (fiTimeS + 1.37), vec2(12.9898, 78.233))) * 43758.5453);
        c += (n - .5) * fiGrain;
        c *= step(abs(q.y), .5 - fiLetterbox);
        c = mix(c, vec3(1.), fiWhite);
        c = mix(c, vec3(0.), fiBlack);
        outputColor = vec4(c, inputColor.a);
      }
    `, {
      uniforms: new Map([
        ['fiVignette', new THREE.Uniform(0.35)], ['fiGrain', new THREE.Uniform(0.011)], ['fiDamage', new THREE.Uniform(0)],
        ['fiLetterbox', new THREE.Uniform(0)], ['fiWhite', new THREE.Uniform(0)], ['fiBlack', new THREE.Uniform(0)],
        ['fiFilter', new THREE.Uniform(0)], ['fiTimeS', new THREE.Uniform(0)],
      ]),
    });
  }
}

export class Engine {
  constructor(canvas) {
    this.canvas = canvas;
    const renderer = new THREE.WebGLRenderer({
      canvas, antialias: false, powerPreference: 'high-performance', stencil: false, depth: true, alpha: false, preserveDrawingBuffer: false,
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.info.autoReset = true;
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.15, 1300);
    this.camera.position.set(0, 40, 80);
    this.scene.add(this.camera);
    this.qualityName = null;
    this.q = null;
    this.matLib = null;
    this.csm = null;
    this.dofEnabled = false;
    this.time = 0;
    this.width = 1;
    this.height = 1;
    this.listeners = new Set();
    window.addEventListener('resize', () => this.resize());
  }

  onQualityChange(fn) {
    this.listeners.add(fn);
  }

  setMaterialLib(lib) {
    this.matLib = lib;
    if (this.csm) lib.setCSM(this.csm);
  }

  _buildCSM() {
    if (this.csm) {
      this.csm.remove();
      for (const l of this.csm.lights) l.dispose && l.dispose();
    }
    const q = this.q;
    this.csm = new CSM({
      camera: this.camera, parent: this.scene, cascades: q.cascades, maxFar: q.shadowFar, mode: 'practical',
      shadowMapSize: q.shadowSize, lightDirection: new THREE.Vector3(-0.4, -1, -0.3).normalize(), lightIntensity: 3,
      lightNear: 1, lightFar: 3000, lightMargin: 260, shadowBias: -0.00012,
    });
    this.csm.fade = true;
    for (const l of this.csm.lights) {
      l.shadow.normalBias = 0.035;
      l.shadow.radius = 2.5;
    }
    this.renderer.shadowMap.enabled = q.shadows;
    this.renderer.shadowMap.needsUpdate = true;
    if (this.matLib) this.matLib.setCSM(this.csm);
  }

  _buildComposer() {
    const q = this.q;
    if (this.composer) this.composer.dispose();
    const composer = new EffectComposer(this.renderer, { frameBufferType: THREE.HalfFloatType, multisampling: q.msaa });
    composer.addPass(new RenderPass(this.scene, this.camera));
    this.aoPass = null;
    if (q.ao) {
      const ao = new N8AOPostPass(this.scene, this.camera, this.width, this.height);
      ao.setQualityMode(q.ao);
      ao.configuration.halfRes = !!q.aoHalf;
      ao.configuration.aoRadius = 3.2;
      ao.configuration.distanceFalloff = 1.4;
      ao.configuration.intensity = 2.6;
      ao.configuration.color = new THREE.Color(0, 0, 0);
      ao.configuration.gammaCorrection = false;
      composer.addPass(ao);
      this.aoPass = ao;
    }
    this.dof = new DepthOfFieldEffect(this.camera, { focusDistance: 8, focusRange: 6, bokehScale: 3, resolutionScale: 0.5 });
    this.dofPass = new EffectPass(this.camera, this.dof);
    this.dofPass.enabled = this.dofEnabled;
    composer.addPass(this.dofPass);
    this.bloom = new BloomEffect({ blendFunction: BlendFunction.ADD, luminanceThreshold: 1.0, luminanceSmoothing: 0.35, mipmapBlur: true, intensity: 0.55, radius: 0.72, levels: 8 });
    this.grade = this.grade || new GradeEffect();
    this.tone = new ToneMappingEffect({ mode: ToneMappingMode.AGX });
    this.finish = this.finish || new FinishEffect();
    const effects = q.bloom ? [this.bloom, this.grade, this.tone, this.finish] : [this.grade, this.tone, this.finish];
    composer.addPass(new EffectPass(this.camera, ...effects));
    if (q.smaa) composer.addPass(new EffectPass(this.camera, new SMAAEffect({ preset: SMAAPreset.HIGH })));
    this.composer = composer;
    composer.setSize(this.width, this.height, false);
  }

  setQuality(name) {
    const q = QUALITY_PRESETS[name] || QUALITY_PRESETS.alto;
    const prev = this.q;
    this.qualityName = name;
    this.q = q;
    this.camera.far = q.viewDist;
    this.camera.updateProjectionMatrix();
    this.resize(true);
    if (!prev || prev.cascades !== q.cascades || prev.shadowSize !== q.shadowSize || prev.shadowFar !== q.shadowFar || prev.shadows !== q.shadows) this._buildCSM();
    this._buildComposer();
    for (const fn of this.listeners) fn(q, name);
  }

  resize(skipComposer = false) {
    const w = Math.max(1, this.canvas.clientWidth || window.innerWidth);
    const h = Math.max(1, this.canvas.clientHeight || window.innerHeight);
    this.width = w;
    this.height = h;
    const pr = Math.min(window.devicePixelRatio || 1, this.q ? this.q.pixelRatio : 1) * (this.resScale || 1);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.composer && !skipComposer) this.composer.setSize(w, h, false);
    if (this.csm) this.csm.updateFrustums();
  }

  setFov(fov) {
    if (Math.abs(this.camera.fov - fov) < 0.01) return;
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
    if (this.csm) this.csm.updateFrustums();
  }

  /** Aplica la luz principal (sol/luna) a las cascadas. */
  setMainLight(dir, color, intensity) {
    if (!this.csm) return;
    this.csm.lightDirection.copy(dir).negate().normalize();
    for (const l of this.csm.lights) {
      l.color.copy(color);
      l.intensity = intensity;
    }
  }

  setDOF(on, focus = 8, range = 6, bokeh = 3) {
    this.dofEnabled = on;
    if (this.dofPass) {
      this.dofPass.enabled = on;
      this.dof.cocMaterial.focusDistance = focus;
      this.dof.cocMaterial.focusRange = range;
      this.dof.bokehScale = bokeh;
    }
  }

  get post() {
    const g = this.grade.uniforms, f = this.finish.uniforms;
    return {
      set exposure(v) { g.get('grExposure').value = v; },
      set saturation(v) { g.get('grSat').value = v; },
      set contrast(v) { g.get('grContrast').value = v; },
      set desat(v) { g.get('grDesat').value = v; },
      set speed(v) { g.get('grSpeed').value = v; },
      set tint(v) { g.get('grTint').value.copy(v); },
      set vignette(v) { f.get('fiVignette').value = v; },
      set grain(v) { f.get('fiGrain').value = v; },
      set damage(v) { f.get('fiDamage').value = v; },
      set letterbox(v) { f.get('fiLetterbox').value = v; },
      set white(v) { f.get('fiWhite').value = v; },
      set black(v) { f.get('fiBlack').value = v; },
      set filter(v) { f.get('fiFilter').value = v; },
    };
  }

  render(dt) {
    this.time += dt;
    const exp = U.uExposure.value;
    this.grade.uniforms.get('grExposure').value = exp * (this.exposureMul || 1);
    this.finish.uniforms.get('fiTimeS').value = this.time % 100;
    if (this.bloom) this.bloom.luminanceMaterial.threshold = 1.0 / Math.max(exp * (this.exposureMul || 1), 0.05);
    if (this.csm) this.csm.update();
    if (this.reflection) this.reflection.render(this.camera);
    this.renderer.info.autoReset = false;
    this.renderer.info.reset();
    this.composer.render(dt);
    this.stats = { calls: this.renderer.info.render.calls, tris: this.renderer.info.render.triangles };
    this.renderer.info.autoReset = true;
  }

  /** Captura el frame actual como dataURL (se llama justo después de render). */
  capture(type = 'image/jpeg', quality = 0.9) {
    try {
      return this.renderer.domElement.toDataURL(type, quality);
    } catch (e) {
      return null;
    }
  }
}
