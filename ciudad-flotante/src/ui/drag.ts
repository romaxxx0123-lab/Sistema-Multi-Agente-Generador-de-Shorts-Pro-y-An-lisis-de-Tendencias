/**
 * Arrastrar y soltar pilas entre ranuras (inventario, almacenes, cajas, combustible).
 *
 * Usa eventos de ratón (no la API HTML5 de arrastre): pulsar sobre una ranura con objeto, moverse
 * más de unos píxeles y soltar sobre otra ranura (`[data-inv][data-slot]`). El clic que sigue a un
 * arrastre se ignora para no disparar la acción de clic de la ranura.
 */
import type { InvRef } from '../sim/Simulation';
import type { ItemStack } from '../sim/types';
import { parseRef, refKey } from './env';
import { itemIcon } from './icons';

export type DropHandler = (from: InvRef, fromSlot: number, to: InvRef, toSlot: number) => void;

interface Pending {
  ref: InvRef;
  slot: number;
  stack: ItemStack;
  x: number;
  y: number;
}

export class DragManager {
  private pending: Pending | null = null;
  private ghost: HTMLElement | null = null;
  private target: Element | null = null;
  private suppressUntil = 0;
  scale = 1;
  /** Se llama al empezar un arrastre (para ocultar la descripción emergente). */
  onStart: () => void = () => {};

  constructor(
    private readonly layer: HTMLElement,
    private readonly onDrop: DropHandler,
  ) {
    window.addEventListener('mousemove', (e) => this.move(e));
    window.addEventListener('mouseup', (e) => this.up(e));
  }

  /** Arrastre en curso. */
  get active(): boolean {
    return this.ghost !== null;
  }

  /** El clic actual es el final de un arrastre: ignorarlo. */
  get swallowClick(): boolean {
    return performance.now() < this.suppressUntil;
  }

  /** Empieza a vigilar un posible arrastre desde una ranura. */
  begin(e: MouseEvent, ref: InvRef, slot: number, stack: ItemStack | null): void {
    if (e.button !== 0 || !stack) return;
    this.pending = { ref, slot, stack: { ...stack }, x: e.clientX, y: e.clientY };
  }

  cancel(): void {
    this.pending = null;
    this.clearTarget();
    if (this.ghost) {
      this.ghost.remove();
      this.ghost = null;
    }
    document.body.classList.remove('ui-dragging');
  }

  private move(e: MouseEvent): void {
    const p = this.pending;
    if (!p) return;
    if (!this.ghost) {
      if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < 5) return;
      const g = document.createElement('div');
      g.className = 'ui-drag-ghost';
      g.innerHTML = `${itemIcon(p.stack.id)}${p.stack.qty > 1 ? `<span class="qty">${p.stack.qty}</span>` : ''}`;
      this.layer.appendChild(g);
      this.ghost = g;
      document.body.classList.add('ui-dragging');
      this.onStart();
    }
    const s = this.scale || 1;
    this.ghost.style.left = `${e.clientX / s}px`;
    this.ghost.style.top = `${e.clientY / s}px`;
    const t = this.slotAt(e.clientX, e.clientY);
    if (t !== this.target) {
      this.clearTarget();
      if (t && !(t.getAttribute('data-inv') === refKey(p.ref) && Number(t.getAttribute('data-slot')) === p.slot)) {
        t.classList.add('drop-target');
        this.target = t;
      }
    }
  }

  private up(e: MouseEvent): void {
    const p = this.pending;
    if (!p) return;
    const wasDragging = !!this.ghost;
    let dest: { ref: InvRef; slot: number } | null = null;
    if (wasDragging) {
      const t = this.slotAt(e.clientX, e.clientY);
      const ref = parseRef(t?.getAttribute('data-inv'));
      const slot = Number(t?.getAttribute('data-slot'));
      if (t && ref && Number.isInteger(slot)) dest = { ref, slot };
      this.suppressUntil = performance.now() + 250;
    }
    this.cancel();
    if (dest && !(refKey(dest.ref) === refKey(p.ref) && dest.slot === p.slot)) this.onDrop(p.ref, p.slot, dest.ref, dest.slot);
  }

  private slotAt(x: number, y: number): Element | null {
    const el = document.elementFromPoint(x, y);
    return el?.closest('[data-inv][data-slot]') ?? null;
  }

  private clearTarget(): void {
    this.target?.classList.remove('drop-target');
    this.target = null;
  }
}
