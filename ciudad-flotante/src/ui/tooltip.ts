/**
 * Descripción emergente que sigue a un elemento (ranuras, recetas, botones con información).
 * Vive en la capa escalada de la interfaz: las coordenadas se convierten con `scale`.
 */
import { patch, type VInput } from './vdom';

export class Tooltip {
  readonly el: HTMLElement;
  private anchor: Element | null = null;
  private content: () => VInput = () => null;
  /** Factor de escala de la interfaz (zoom CSS). */
  scale = 1;
  private acc = 0;

  constructor(layer: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'ui-tip';
    this.el.setAttribute('role', 'tooltip');
    layer.appendChild(this.el);
  }

  /** Muestra la descripción junto a `anchor`. `content` se vuelve a evaluar en cada `update`. */
  show(anchor: Element, content: () => VInput): void {
    this.anchor = anchor;
    this.content = content;
    this.acc = 0;
    this.render();
  }

  hide(): void {
    this.anchor = null;
    this.el.classList.remove('show');
  }

  get visible(): boolean {
    return this.anchor !== null;
  }

  /**
   * Mantiene el contenido al día (unas 8 veces por segundo, para no forzar el cálculo de
   * maquetación en cada fotograma) y lo oculta si el ancla desaparece del documento.
   */
  update(dt = 0): void {
    if (!this.anchor) return;
    if (!this.anchor.isConnected) {
      this.hide();
      return;
    }
    this.acc += dt;
    if (this.acc < 0.12) return;
    this.acc = 0;
    this.render();
  }

  private render(): void {
    const a = this.anchor;
    if (!a) return;
    patch(this.el, this.content());
    this.el.classList.add('show');
    const s = this.scale || 1;
    const r = a.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const tw = this.el.offsetWidth * s;
    const th = this.el.offsetHeight * s;
    let x = r.right + 10;
    if (x + tw > vw - 8) x = r.left - 10 - tw;
    if (x < 8) x = Math.min(vw - tw - 8, Math.max(8, r.left));
    let y = r.top;
    if (y + th > vh - 8) y = vh - th - 8;
    if (y < 8) y = 8;
    this.el.style.left = `${x / s}px`;
    this.el.style.top = `${y / s}px`;
  }
}
