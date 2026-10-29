/**
 * ROCIONES DE PROA: cuando el mar está movido, la proa rompe las olas y lanza agua pulverizada
 * hacia los costados. Partículas en el marco del océano con gravedad y arrastre del viento; se
 * emiten en ráfagas cuando el agua sube por la roda (la proa "pica" contra una ola).
 */
import * as THREE from 'three';

const MAX = 420;

const VERT = /* glsl */ `
attribute float aLife;
uniform float uPix;
varying float vLife;
void main() {
  vLife = aLife;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(uPix * (0.35 + 0.65 * aLife) * 260.0 / max(1.0, -mv.z), 1.0, 40.0);
}
`;

const FRAG = /* glsl */ `
uniform vec3 uColor;
varying float vLife;
void main() {
  if (vLife <= 0.0) discard;
  vec2 c = gl_PointCoord - 0.5;
  float r = length(c);
  if (r > 0.5) discard;
  float a = (1.0 - smoothstep(0.25, 0.5, r)) * min(1.0, vLife * 2.0) * 0.75;
  gl_FragColor = vec4(uColor, a);
}
`;

export class Spray {
  readonly points: THREE.Points;
  private material: THREE.ShaderMaterial;
  private pos: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private next = 0;
  private acc = 0;
  private seed = 5;
  private prevRise = 0;

  constructor() {
    this.pos = new Float32Array(MAX * 3);
    this.vel = new Float32Array(MAX * 3);
    this.life = new Float32Array(MAX);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aLife', new THREE.BufferAttribute(this.life, 1).setUsage(THREE.DynamicDrawUsage));
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      fog: false,
      uniforms: { uPix: { value: 1 }, uColor: { value: new THREE.Color('#e6eef0') } },
    });
    this.points = new THREE.Points(g, this.material);
    this.points.name = 'rociones';
    this.points.frustumCulled = false;
    this.points.renderOrder = 8;
  }

  private rnd(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }

  /**
   * @param bow punto de la roda en el marco del océano (a la altura de la flotación)
   * @param waterAtBow altura del agua en la roda (mundo)
   * @param rough 0..1 cuán movido está el mar (ola y viento)
   * @param speed 0..1,5 velocidad relativa del barco
   * @param windX,windZ viento (m/s)
   * @param halfWidth media manga a la altura de la proa
   */
  update(dt: number, bow: THREE.Vector3, waterAtBow: number, rough: number, speed: number, windX: number, windZ: number, halfWidth: number, color: THREE.Color, pixelRatio: number): void {
    // ¿La ola sube por la roda? (comparado con la flotación de la proa)
    const rise = waterAtBow - bow.y;
    const rising = rise - this.prevRise;
    this.prevRise = rise;
    let rate = 0;
    if (rough > 0.2 && speed > 0.1) {
      rate = Math.max(0, rise + 0.2) * 260 * rough * Math.min(1, speed);
      if (rising > 0) rate *= 1.6;
    }
    this.acc += rate * dt;
    let n = Math.floor(this.acc);
    this.acc -= n;
    while (n-- > 0) {
      const i = this.next;
      this.next = (this.next + 1) % MAX;
      const side = this.rnd() < 0.5 ? -1 : 1;
      const back = this.rnd() * 6;
      this.pos[i * 3] = bow.x - 1 - back;
      this.pos[i * 3 + 1] = waterAtBow + 0.2;
      this.pos[i * 3 + 2] = bow.z + side * (halfWidth * (0.25 + back / 9) + this.rnd() * 0.6);
      const up = 3 + this.rnd() * 5 * rough;
      this.vel[i * 3] = -1.5 - this.rnd() * 2 + windX * 0.3;
      this.vel[i * 3 + 1] = up;
      this.vel[i * 3 + 2] = side * (2 + this.rnd() * 3.5) + windZ * 0.3;
      this.life[i] = 1;
    }
    let any = false;
    for (let i = 0; i < MAX; i++) {
      if (this.life[i]! <= 0) continue;
      any = true;
      this.life[i] = Math.max(0, this.life[i]! - dt / 1.3);
      const v = this.vel;
      const p = this.pos;
      v[i * 3 + 1] -= 9.8 * dt;
      v[i * 3] += (windX * 0.5 - v[i * 3]!) * dt * 0.8;
      v[i * 3 + 2] += (windZ * 0.5 - v[i * 3 + 2]!) * dt * 0.8;
      p[i * 3] += v[i * 3]! * dt;
      p[i * 3 + 1] += v[i * 3 + 1]! * dt;
      p[i * 3 + 2] += v[i * 3 + 2]! * dt;
    }
    this.points.visible = any;
    if (any) {
      (this.points.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
      (this.points.geometry.getAttribute('aLife') as THREE.BufferAttribute).needsUpdate = true;
    }
    this.material.uniforms.uPix!.value = pixelRatio;
    (this.material.uniforms.uColor!.value as THREE.Color).copy(color).convertLinearToSRGB();
  }

  /** Ráfaga de gotas en un punto (saltos de peces y delfines, golpes de mar). */
  burst(x: number, y: number, z: number, n: number, up = 2.5, spread = 1.5): void {
    for (let k = 0; k < n; k++) {
      const i = this.next;
      this.next = (this.next + 1) % MAX;
      const a = this.rnd() * Math.PI * 2;
      const r = this.rnd() * spread;
      this.pos[i * 3] = x + Math.cos(a) * 0.2;
      this.pos[i * 3 + 1] = y + 0.05;
      this.pos[i * 3 + 2] = z + Math.sin(a) * 0.2;
      this.vel[i * 3] = Math.cos(a) * r;
      this.vel[i * 3 + 1] = up * (0.6 + this.rnd() * 0.6);
      this.vel[i * 3 + 2] = Math.sin(a) * r;
      this.life[i] = 0.75;
    }
    this.points.visible = true;
  }

  dispose(): void {
    this.points.geometry.dispose();
    this.material.dispose();
  }
}
