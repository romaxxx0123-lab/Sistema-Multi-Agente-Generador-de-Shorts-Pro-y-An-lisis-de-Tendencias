// Efectos de clima: lluvia instanciada alrededor de la cámara y rayos durante tormentas.
import * as THREE from 'three';
import { U } from './shaders.js';
import { setDynamic } from '../core/layers.js';

export class WeatherFX {
  constructor(engine, count = 6000) {
    this.engine = engine;
    this.count = count;
    const quad = new THREE.PlaneGeometry(0.018, 0.75);
    quad.translate(0, 0.375, 0);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = quad.index;
    geo.attributes.position = quad.attributes.position;
    geo.attributes.uv = quad.attributes.uv;
    const seeds = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      seeds[i * 4] = Math.random();
      seeds[i * 4 + 1] = Math.random();
      seeds[i * 4 + 2] = Math.random();
      seeds[i * 4 + 3] = Math.random();
    }
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
    geo.instanceCount = count;
    this.uniforms = {
      uT: { value: 0 }, uCam: { value: new THREE.Vector3() }, uRain: U.uRain, uWind: { value: new THREE.Vector2(0.3, 0.1) },
      uBright: { value: 1 }, uLamps: U.uLamps,
    };
    this.rainMat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: /* glsl */ `
        attribute vec4 aSeed;
        uniform float uT; uniform vec3 uCam; uniform vec2 uWind; uniform float uRain;
        varying float vA; varying vec2 vUv;
        const vec3 BOX = vec3(36., 26., 36.);
        void main(){
          vUv = uv;
          float speed = 9. + aSeed.w * 3.;
          vec3 base = aSeed.xyz * BOX;
          base.y -= uT * speed;
          base.xz += uWind * uT * speed * .12;
          // envolver alrededor de la cámara
          vec3 rel = mod(base - (uCam - vec3(BOX.x * .5, 8., BOX.z * .5)), BOX);
          vec3 wp = uCam - vec3(BOX.x * .5, 8., BOX.z * .5) + rel;
          // orientar hacia la cámara en horizontal e inclinar con el viento
          vec3 toCam = normalize(vec3(uCam.x - wp.x, 0., uCam.z - wp.z) + 1e-4);
          vec3 right = vec3(toCam.z, 0., -toCam.x);
          vec3 down = normalize(vec3(uWind.x * .12, 1., uWind.y * .12));
          vec3 p = wp + right * position.x + down * position.y * (1. + aSeed.w * .6);
          float visible = step(aSeed.z, uRain);
          float d = length(uCam - wp);
          vA = visible * smoothstep(1.2, 3.5, d) * smoothstep(26., 12., d) * (.35 + .65 * aSeed.w);
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uBright; uniform float uLamps;
        varying float vA; varying vec2 vUv;
        void main(){
          float a = vA * smoothstep(0., .25, vUv.y) * smoothstep(1., .6, vUv.y) * (1. - abs(vUv.x - .5) * 1.6);
          if (a < .003) discard;
          vec3 c = vec3(.75, .8, .88) * uBright + vec3(1., .75, .45) * uLamps * .35;
          gl_FragColor = vec4(c, a * .55);
        }`,
      transparent: true,
      depthWrite: false,
    });
    this.rain = new THREE.Mesh(geo, this.rainMat);
    this.rain.frustumCulled = false;
    this.rain.renderOrder = 10;
    engine.scene.add(setDynamic(this.rain)); // las gotas se dibujan delante de autos y personas
    // Rayo
    this.boltMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 7, 10), transparent: true, opacity: 0, depthWrite: false, fog: false });
    this.bolt = null;
    this.boltT = 0;
  }

  setCount(n) {
    this.rain.geometry.instanceCount = Math.min(this.count, n);
  }

  strike(camera, distance01) {
    if (this.bolt) {
      this.engine.scene.remove(this.bolt);
      this.bolt.geometry.dispose();
    }
    const a = Math.random() * Math.PI * 2;
    const d = 350 + distance01 * 1200;
    const gx = camera.position.x + Math.cos(a) * d, gz = camera.position.z + Math.sin(a) * d;
    const pts = [];
    let x = gx + (Math.random() - 0.5) * 80, y = 520, z = gz + (Math.random() - 0.5) * 80;
    pts.push(new THREE.Vector3(x, y, z));
    while (y > 0) {
      y -= 18 + Math.random() * 26;
      x += (Math.random() - 0.5) * 40;
      z += (Math.random() - 0.5) * 40;
      pts.push(new THREE.Vector3(x, Math.max(0, y), z));
    }
    const view = new THREE.Vector3().subVectors(camera.position, new THREE.Vector3(gx, 200, gz)).normalize();
    const P = [];
    const addRibbon = (list, width) => {
      for (let i = 0; i < list.length - 1; i++) {
        const p0 = list[i], p1 = list[i + 1];
        const dir = new THREE.Vector3().subVectors(p1, p0).normalize();
        const side = new THREE.Vector3().crossVectors(dir, view).normalize().multiplyScalar(width);
        const a0 = p0.clone().add(side), b0 = p0.clone().sub(side), a1 = p1.clone().add(side), b1 = p1.clone().sub(side);
        P.push(a0.x, a0.y, a0.z, b0.x, b0.y, b0.z, a1.x, a1.y, a1.z, b0.x, b0.y, b0.z, b1.x, b1.y, b1.z, a1.x, a1.y, a1.z);
      }
    };
    addRibbon(pts, 1.6);
    // ramificaciones
    for (let k = 0; k < 3; k++) {
      const start = pts[Math.floor(Math.random() * (pts.length * 0.6))];
      const br = [start.clone()];
      let p = start.clone();
      for (let j = 0; j < 5; j++) {
        p = p.clone().add(new THREE.Vector3((Math.random() - 0.5) * 50, -20 - Math.random() * 20, (Math.random() - 0.5) * 50));
        br.push(p);
      }
      addRibbon(br, 0.8);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    this.bolt = new THREE.Mesh(g, this.boltMat);
    this.bolt.frustumCulled = false;
    this.bolt.renderOrder = 11;
    this.engine.scene.add(this.bolt);
    this.boltT = 0;
  }

  update(dt, camera, sky) {
    this.uniforms.uT.value += dt;
    this.uniforms.uCam.value.copy(camera.position);
    const w = sky.w.wind;
    this.uniforms.uWind.value.set(1.0 * w * 3, 0.45 * w * 3);
    // brillo de las gotas: relativo a la luz ambiente (en escala de exposición)
    const amb = 0.12 + (1 - sky.nightK) * 0.55;
    this.uniforms.uBright.value = amb / Math.max(0.3, U.uExposure.value);
    this.rain.visible = U.uRain.value > 0.02;
    if (this.bolt) {
      this.boltT += dt;
      this.boltMat.opacity = sky.flash > 0.05 ? Math.min(1, sky.flash * 1.4) : Math.max(0, 1 - this.boltT * 4);
      if (this.boltT > 0.7) {
        this.engine.scene.remove(this.bolt);
        this.bolt.geometry.dispose();
        this.bolt = null;
      }
    }
  }
}
