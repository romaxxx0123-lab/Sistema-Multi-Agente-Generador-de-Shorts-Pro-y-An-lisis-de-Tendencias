/**
 * BOCADILLO DE TEXTO sobre un personaje: sprite con textura de canvas, de tamaño constante en
 * pantalla (legible a cualquier distancia) que se desvanece al alejarse. También muestra
 * "Zzz" animado cuando el personaje duerme.
 */
import * as THREE from 'three';

const CW = 512;
const CH = 200;
const FONT = "'Nunito', 'Trebuchet MS', 'Segoe UI', sans-serif";

/** Parte un texto en líneas de como mucho `max` caracteres (sin cortar palabras si se puede). */
export function wrapText(text: string, max: number, maxLines: number): string[] {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length <= max) cur = next;
    else {
      if (cur) lines.push(cur);
      cur = w.length > max ? `${w.slice(0, max - 1)}…` : w;
    }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const cut = lines.slice(0, maxLines);
    cut[maxLines - 1] = `${cut[maxLines - 1]!.replace(/[.,;:!?…]*$/, '')}…`;
    return cut;
  }
  return lines;
}

export class SpeechBubble {
  readonly sprite: THREE.Sprite;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private texture: THREE.CanvasTexture | null = null;
  private material: THREE.SpriteMaterial;
  private text = '';
  private mode: 'none' | 'say' | 'zzz' = 'none';
  private t = 0;
  private fov = 72;

  constructor() {
    this.material = new THREE.SpriteMaterial({ transparent: true, depthWrite: false, sizeAttenuation: false });
    if (typeof document !== 'undefined') {
      this.canvas = document.createElement('canvas');
      this.canvas.width = CW;
      this.canvas.height = CH;
      this.ctx = this.canvas.getContext('2d');
      this.texture = new THREE.CanvasTexture(this.canvas);
      this.texture.colorSpace = THREE.SRGBColorSpace;
      this.material.map = this.texture;
    }
    this.sprite = new THREE.Sprite(this.material);
    this.sprite.center.set(0.5, 0);
    this.sprite.renderOrder = 30;
    this.sprite.visible = false;
    this.sprite.name = 'bocadillo';
    this.setScreenSize(72);
  }

  /** Ajusta el tamaño al campo de visión vertical de la cámara (grados). */
  setFov(fovDeg: number): void {
    if (Math.abs(fovDeg - this.fov) < 0.5) return;
    this.fov = fovDeg;
    this.setScreenSize(fovDeg, this.mode === 'zzz' ? 0.075 : 0.15);
  }

  /** Tamaño en pantalla: fracción de la altura de la vista que ocupa el lienzo del bocadillo. */
  private setScreenSize(fovDeg: number, frac = 0.15): void {
    const h = frac * 2 * Math.tan(THREE.MathUtils.degToRad(fovDeg / 2));
    this.sprite.scale.set((h * CW) / CH, h, 1);
  }

  /** Muestra un texto (null = nada) o el "Zzz" de dormir. */
  set(text: string | null, sleeping = false): void {
    const mode = text ? 'say' : sleeping ? 'zzz' : 'none';
    if (mode === this.mode && (mode !== 'say' || text === this.text)) return;
    if (mode !== this.mode) this.setScreenSize(this.fov, mode === 'zzz' ? 0.075 : 0.15);
    this.mode = mode;
    this.text = text ?? '';
    if (mode === 'say') this.draw(this.text);
    else if (mode === 'zzz') this.drawZzz();
  }

  private draw(text: string): void {
    const ctx = this.ctx;
    if (!ctx || !this.texture) return;
    ctx.clearRect(0, 0, CW, CH);
    const lines = wrapText(text, 26, 3);
    const fs = 30;
    ctx.font = `700 ${fs}px ${FONT}`;
    const w = Math.min(CW - 16, Math.max(90, ...lines.map((l) => ctx.measureText(l).width)) + 36);
    const lh = fs * 1.18;
    const h = lines.length * lh + 22;
    const tail = 22;
    const x = (CW - w) / 2;
    const y = CH - tail - h;
    // sombra
    ctx.fillStyle = 'rgba(20, 30, 40, 0.28)';
    roundRect(ctx, x + 3, y + 5, w, h, 18);
    ctx.fill();
    // globo + cola
    ctx.fillStyle = '#fffaf0';
    ctx.strokeStyle = '#2f4858';
    ctx.lineWidth = 4;
    roundRect(ctx, x, y, w, h, 18);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(CW / 2 - 14, y + h - 2);
    ctx.lineTo(CW / 2, CH - 3);
    ctx.lineTo(CW / 2 + 12, y + h - 2);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(CW / 2 - 14, y + h);
    ctx.lineTo(CW / 2, CH - 3);
    ctx.lineTo(CW / 2 + 12, y + h);
    ctx.stroke();
    ctx.fillStyle = '#22333f';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    lines.forEach((l, i) => ctx.fillText(l, CW / 2, y + 11 + lh * (i + 0.5)));
    this.texture.needsUpdate = true;
  }

  private drawZzz(): void {
    const ctx = this.ctx;
    if (!ctx || !this.texture) return;
    ctx.clearRect(0, 0, CW, CH);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const zs: [number, number, number][] = [
      [CW / 2 - 30, CH - 40, 30],
      [CW / 2, CH - 80, 40],
      [CW / 2 + 34, CH - 128, 52],
    ];
    for (const [x, y, s] of zs) {
      ctx.font = `800 ${s}px ${FONT}`;
      ctx.lineWidth = 6;
      ctx.strokeStyle = 'rgba(20, 30, 40, 0.55)';
      ctx.strokeText('z', x, y);
      ctx.fillStyle = '#e8f4f2';
      ctx.fillText('z', x, y);
    }
    this.texture.needsUpdate = true;
  }

  /**
   * Coloca el bocadillo en `pos` (coordenadas del padre), visible si `show`, desvaneciéndolo
   * según la distancia a la cámara (en las mismas coordenadas).
   */
  update(pos: THREE.Vector3, cam: THREE.Vector3, show: boolean, dt: number): void {
    this.t += dt;
    if (this.mode === 'none' || !show || !this.texture) {
      this.sprite.visible = false;
      return;
    }
    const d = pos.distanceTo(cam);
    const far = this.mode === 'zzz' ? 11 : 20;
    const fade = THREE.MathUtils.clamp((far - d) / 5, 0, 1);
    this.sprite.visible = fade > 0.01;
    this.material.opacity = fade;
    this.sprite.position.copy(pos);
    if (this.mode === 'zzz') {
      this.sprite.position.y += Math.sin(this.t * 1.5) * 0.06;
      this.material.opacity = fade * (0.65 + 0.25 * Math.sin(this.t * 2));
    }
  }

  dispose(): void {
    this.texture?.dispose();
    this.material.dispose();
    this.sprite.removeFromParent();
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
