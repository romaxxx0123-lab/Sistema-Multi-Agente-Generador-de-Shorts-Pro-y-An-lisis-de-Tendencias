/**
 * Decoración animada del exterior: banderas que ondean con el viento aparente, radar que gira
 * y rótulos pintados con el nombre del barco (texturas de canvas).
 */
import * as THREE from 'three';

/** Bandera rectangular que ondea (malla con vértices animados). */
export class Flag {
  readonly mesh: THREE.Mesh;
  private base: Float32Array;
  constructor(
    w: number,
    h: number,
    stripes: string[],
    readonly pennant = false,
  ) {
    const geo = new THREE.PlaneGeometry(w, h, 8, Math.max(2, stripes.length));
    geo.translate(w / 2, -h / 2, 0);
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      let y = pos.getY(i);
      if (pennant) {
        // banderín triangular: se estrecha hacia la punta
        const k = 1 - (x / w) * 0.85;
        y = -h / 2 + (y + h / 2) * k + (h * (1 - k)) / 2;
        pos.setY(i, y);
      }
      const band = Math.min(stripes.length - 1, Math.floor(((-pos.getY(i)) / h) * stripes.length));
      tmp.set(stripes[Math.max(0, band)]!);
      colors.set([tmp.r, tmp.g, tmp.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.base = Float32Array.from(pos.array as Float32Array);
    this.mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    this.mesh.castShadow = true;
    this.mesh.name = 'bandera';
  }

  /** `windYaw` = rumbo hacia el que sopla el viento aparente (rotation.y de la bandera). */
  update(t: number, strength: number, windYaw: number): void {
    let d = windYaw - this.mesh.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    const pos = this.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    const amp = 0.06 + 0.12 * strength;
    for (let i = 0; i < pos.count; i++) {
      const x = this.base[i * 3]!;
      const y = this.base[i * 3 + 1]!;
      const wave = Math.sin(x * 4.2 - t * (5 + strength * 6) + y * 0.8) * amp * x;
      pos.setZ(i, wave);
      pos.setY(i, y - x * 0.12 * (1 - strength));
    }
    pos.needsUpdate = true;
    this.mesh.geometry.computeVertexNormals();
    this.mesh.rotation.y += d * 0.05;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

/** Textura con el nombre del barco pintado (null fuera del navegador). */
export function nameTexture(text: string, sub: string, aspect: number): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const cw = 1024;
  const ch = Math.max(64, Math.round(cw / aspect));
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.clearRect(0, 0, cw, ch);
  ctx.fillStyle = '#f3ead6';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const mainH = sub ? ch * 0.48 : ch * 0.78;
  ctx.font = `700 ${Math.round(mainH)}px "Trebuchet MS", "Segoe UI", Arial, sans-serif`;
  // ajuste a lo ancho
  let size = mainH;
  while (ctx.measureText(text).width > cw * 0.94 && size > 10) {
    size *= 0.92;
    ctx.font = `700 ${Math.round(size)}px "Trebuchet MS", "Segoe UI", Arial, sans-serif`;
  }
  ctx.fillText(text, cw / 2, sub ? ch * 0.36 : ch / 2);
  if (sub) {
    ctx.font = `600 ${Math.round(ch * 0.24)}px "Trebuchet MS", "Segoe UI", Arial, sans-serif`;
    ctx.fillStyle = '#e0a458';
    ctx.fillText(sub, cw / 2, ch * 0.78);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
