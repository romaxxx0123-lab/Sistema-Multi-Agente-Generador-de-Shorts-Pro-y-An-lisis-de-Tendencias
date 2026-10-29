/**
 * Entrada de teclado y ratón con detección de flancos por frame y gestión de pointer lock.
 * Uso: `down(code)` mantenido, `pressed(code)` solo el frame en que se pulsó.
 * Códigos = KeyboardEvent.code ('KeyW', 'Space', 'ShiftLeft', 'Escape', 'Digit1'...).
 * Ratón: 'Mouse0' (izq.), 'Mouse1' (centro), 'Mouse2' (der.).
 */
export class Input {
  private held = new Set<string>();
  private justDown = new Set<string>();
  private justUp = new Set<string>();
  private dx = 0;
  private dy = 0;
  private wheelDelta = 0;
  /** Posición del ratón en píxeles del canvas. */
  mouseX = 0;
  mouseY = 0;
  /** Si es false (UI abierta, menú), las teclas de juego se ignoran salvo las globales. */
  enabled = true;
  private lockWanted = false;
  /** El navegador no permite capturar el ratón (iframe sin permiso, headless…): se usa mirada libre. */
  lockUnavailable = false;
  /** El usuario soltó la captura (Esc del navegador) mientras el juego la quería. */
  private lockLost = false;
  private weReleased = false;

  constructor(private readonly element: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (this.isTyping(e)) return;
      if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'F1', 'F3'].includes(e.code)) e.preventDefault();
      if (!this.held.has(e.code)) this.justDown.add(e.code);
      this.held.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      this.held.delete(e.code);
      this.justUp.add(e.code);
    });
    window.addEventListener('blur', () => this.held.clear());
    element.addEventListener('mousedown', (e) => {
      const code = `Mouse${e.button}`;
      this.held.add(code);
      this.justDown.add(code);
      if (this.lockWanted && !this.locked) this.requestLock();
    });
    window.addEventListener('mouseup', (e) => {
      const code = `Mouse${e.button}`;
      this.held.delete(code);
      this.justUp.add(code);
    });
    window.addEventListener('mousemove', (e) => {
      const r = element.getBoundingClientRect();
      this.mouseX = e.clientX - r.left;
      this.mouseY = e.clientY - r.top;
      if (this.locked || (this.lockWanted && this.lockUnavailable)) {
        this.dx += e.movementX;
        this.dy += e.movementY;
      }
    });
    document.addEventListener('pointerlockerror', () => {
      this.lockUnavailable = true;
      this.updateCursor();
    });
    document.addEventListener('pointerlockchange', () => {
      if (!this.locked && this.lockWanted && !this.weReleased) this.lockLost = true;
      this.weReleased = false;
      this.updateCursor();
    });
    element.addEventListener(
      'wheel',
      (e) => {
        this.wheelDelta += Math.sign(e.deltaY);
        e.preventDefault();
      },
      { passive: false },
    );
    element.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private isTyping(e: KeyboardEvent): boolean {
    const t = e.target as HTMLElement | null;
    return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  }

  get locked(): boolean {
    return document.pointerLockElement === this.element;
  }

  /** Indica si el juego quiere el ratón capturado (modo juego sin paneles). */
  setPointerLockWanted(want: boolean): void {
    if (want === this.lockWanted) {
      return;
    }
    this.lockWanted = want;
    if (want && !this.locked) this.requestLock();
    if (!want && this.locked) {
      this.weReleased = true;
      document.exitPointerLock();
    }
    this.updateCursor();
  }

  /** true si el usuario liberó el ratón por su cuenta (Esc del navegador). Se consume al leerlo. */
  consumeLockLost(): boolean {
    const v = this.lockLost;
    this.lockLost = false;
    return v;
  }

  /** Mirada libre sin captura (el cursor se oculta sobre el lienzo). */
  get freeLook(): boolean {
    return this.lockWanted && this.lockUnavailable;
  }

  private updateCursor(): void {
    this.element.style.cursor = this.lockWanted && !this.locked ? (this.lockUnavailable ? 'none' : 'pointer') : '';
  }

  private requestLock(): void {
    if (this.lockUnavailable || !('requestPointerLock' in this.element)) {
      this.lockUnavailable = true;
      return;
    }
    try {
      const p = this.element.requestPointerLock() as unknown as Promise<void> | undefined;
      if (p && typeof p.catch === 'function') {
        p.catch((err: unknown) => {
          // Sin gesto de usuario reciente no es un fallo permanente; un entorno sin permiso sí.
          const name = (err as { name?: string } | null)?.name ?? '';
          if (name === 'NotSupportedError' || name === 'SecurityError' || name === 'WrongDocumentError') this.lockUnavailable = true;
        });
      }
    } catch {
      this.lockUnavailable = true;
    }
  }

  down(code: string): boolean {
    return this.held.has(code);
  }

  pressed(code: string): boolean {
    return this.justDown.has(code);
  }

  released(code: string): boolean {
    return this.justUp.has(code);
  }

  /** Consume el clic de este frame (para que otra capa no lo use). */
  consume(code: string): void {
    this.justDown.delete(code);
  }

  mouseDelta(): { dx: number; dy: number } {
    return { dx: this.dx, dy: this.dy };
  }

  wheel(): number {
    return this.wheelDelta;
  }

  /** Inyecta movimiento de ratón (tests / depuración). */
  injectMouse(dx: number, dy: number): void {
    this.dx += dx;
    this.dy += dy;
  }

  /** Simula una tecla (tests / depuración). */
  injectKey(code: string, isDown: boolean): void {
    if (isDown) {
      if (!this.held.has(code)) this.justDown.add(code);
      this.held.add(code);
    } else {
      this.held.delete(code);
      this.justUp.add(code);
    }
  }

  endFrame(): void {
    this.justDown.clear();
    this.justUp.clear();
    this.dx = 0;
    this.dy = 0;
    this.wheelDelta = 0;
  }
}
