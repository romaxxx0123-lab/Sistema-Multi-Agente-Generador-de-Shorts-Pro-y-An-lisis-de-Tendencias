// Entrada unificada: teclado, mouse (pointer lock con alternativa de arrastre), gamepad y controles virtuales táctiles.
import { clamp } from './utils.js';

export const DEFAULT_BINDINGS = {
  forward: ['KeyW'], back: ['KeyS'], left: ['KeyA'], right: ['KeyD'],
  jump: ['Space'], sprint: ['ShiftLeft', 'ShiftRight'], crouch: ['KeyC', 'ControlLeft'],
  enter: ['KeyF'], interact: ['KeyE'], reload: ['KeyR'], grenade: ['KeyG'],
  weaponWheel: ['Tab'], nextWeapon: ['BracketRight'], prevWeapon: ['BracketLeft'],
  phone: ['KeyT', 'ArrowUp'], map: ['KeyM'], pause: ['Escape', 'KeyP'], camera: ['KeyV'],
  horn: ['KeyH'], handbrake: ['Space'], nitro: ['ShiftLeft', 'ShiftRight'], lookBack: ['KeyC'],
  radioNext: ['KeyE'], radioPrev: ['KeyQ'], focus: ['KeyQ'], photo: ['F2'],
  fire: ['Mouse0'], aim: ['Mouse2'],
  menuUp: ['ArrowUp', 'KeyW'], menuDown: ['ArrowDown', 'KeyS'], menuLeft: ['ArrowLeft', 'KeyA'], menuRight: ['ArrowRight', 'KeyD'],
  menuOk: ['Enter', 'Space'], menuBack: ['Escape', 'Backspace'],
};

export const ACTION_LABELS = {
  forward: 'Avanzar', back: 'Retroceder', left: 'Izquierda', right: 'Derecha', jump: 'Saltar', sprint: 'Correr / Nitro',
  crouch: 'Agacharse', enter: 'Subir / bajar del vehículo', interact: 'Interactuar', reload: 'Recargar', grenade: 'Granada',
  weaponWheel: 'Rueda de armas', phone: 'Teléfono', map: 'Mapa', pause: 'Pausa', camera: 'Cambiar cámara', horn: 'Bocina',
  handbrake: 'Freno de mano', lookBack: 'Mirar atrás', radioNext: 'Radio siguiente', radioPrev: 'Radio anterior',
  focus: 'Modo Foco', photo: 'Modo foto', fire: 'Disparar', aim: 'Apuntar',
};

// Gamepad (mapeo estándar)
const GP = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, LS: 10, RS: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
const GP_FOOT = {
  jump: [GP.A], reload: [GP.X], enter: [GP.Y], crouch: [GP.B], fire: [GP.RT], aim: [GP.LT], weaponWheel: [GP.LB], grenade: [GP.RB],
  sprint: [GP.LS], camera: [GP.RS], phone: [GP.UP], map: [GP.BACK], pause: [GP.START], prevWeapon: [GP.LEFT], nextWeapon: [GP.RIGHT],
  interact: [GP.DOWN], focus: [GP.RS],
};
const GP_VEHICLE = {
  handbrake: [GP.A], enter: [GP.Y], horn: [GP.B], nitro: [GP.X], lookBack: [GP.RS], camera: [GP.BACK], phone: [GP.UP], map: [GP.DOWN],
  pause: [GP.START], radioPrev: [GP.LEFT], radioNext: [GP.RIGHT], fire: [GP.RB], aim: [GP.LB],
};
const GP_MENU = { menuUp: [GP.UP], menuDown: [GP.DOWN], menuLeft: [GP.LEFT], menuRight: [GP.RIGHT], menuOk: [GP.A], menuBack: [GP.B], pause: [GP.START] };

export class Input {
  constructor(target) {
    this.target = target;
    this.bindings = JSON.parse(JSON.stringify(DEFAULT_BINDINGS));
    this.keys = new Set();
    this.prevActions = new Set();
    this.actions = new Set();
    this.pressedSet = new Set();
    this.releasedSet = new Set();
    this.mouse = { dx: 0, dy: 0, wheel: 0, buttons: 0, x: 0, y: 0 };
    this.move = { x: 0, y: 0 };
    this.look = { x: 0, y: 0 };
    this.throttle = 0;
    this.brake = 0;
    this.steer = 0;
    this.context = 'foot';
    this.sensitivity = 1;
    this.invertY = false;
    this.gpSensitivity = 1;
    this.lastDevice = 'keyboard';
    this.locked = false;
    this.lockFailed = false;
    this.enabled = true;
    this.virtual = { move: { x: 0, y: 0 }, look: { x: 0, y: 0 }, actions: new Set(), throttle: 0, brake: 0, steer: 0, active: false };
    this.gamepadIndex = null;
    this.vibrationOn = true;
    this._bind();
  }

  _bind() {
    const t = this.target;
    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'F2'].includes(e.code)) e.preventDefault();
      this.keys.add(e.code);
      this.lastDevice = 'keyboard';
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouse.buttons = 0;
    });
    t.addEventListener('mousedown', (e) => {
      this.mouse.buttons |= 1 << e.button;
      this.keys.add('Mouse' + e.button);
      this.lastDevice = 'keyboard';
    });
    window.addEventListener('mouseup', (e) => {
      this.mouse.buttons &= ~(1 << e.button);
      this.keys.delete('Mouse' + e.button);
    });
    t.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      // Con pointer lock usamos el delta siempre; sin él, sólo arrastrando
      if (this.locked || this.mouse.buttons) {
        this.mouse.dx += e.movementX || 0;
        this.mouse.dy += e.movementY || 0;
      }
    });
    t.addEventListener('wheel', (e) => {
      this.mouse.wheel += Math.sign(e.deltaY);
    }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === t;
    });
    document.addEventListener('pointerlockerror', () => {
      this.lockFailed = true;
    });
    window.addEventListener('gamepadconnected', (e) => {
      this.gamepadIndex = e.gamepad.index;
      this.lastDevice = 'gamepad';
    });
    window.addEventListener('gamepaddisconnected', () => {
      this.gamepadIndex = null;
    });
  }

  requestLock() {
    if (this.locked || this.lockFailed) return;
    try {
      const p = this.target.requestPointerLock && this.target.requestPointerLock();
      if (p && p.catch) p.catch(() => (this.lockFailed = true));
    } catch (e) {
      this.lockFailed = true;
    }
  }

  releaseLock() {
    try {
      if (document.pointerLockElement) document.exitPointerLock();
    } catch (e) { /* ignorar */ }
  }

  setBinding(action, codes) {
    this.bindings[action] = codes;
  }

  _keyDown(action) {
    const codes = this.bindings[action];
    if (!codes) return false;
    for (const c of codes) if (this.keys.has(c)) return true;
    return false;
  }

  _gamepad() {
    if (!navigator.getGamepads) return null;
    let pads;
    try {
      pads = navigator.getGamepads();
    } catch (e) {
      return null;
    }
    if (!pads) return null;
    if (this.gamepadIndex != null && pads[this.gamepadIndex]) return pads[this.gamepadIndex];
    for (const p of pads) if (p && p.connected) return p;
    return null;
  }

  /** Llamar una vez al principio de cada frame. */
  update() {
    const acts = new Set();
    const ctxActions = this.context === 'menu'
      ? ['menuUp', 'menuDown', 'menuLeft', 'menuRight', 'menuOk', 'menuBack', 'pause', 'map', 'phone', 'weaponWheel']
      : Object.keys(this.bindings).filter((a) => !a.startsWith('menu'));
    if (this.enabled) {
      for (const a of ctxActions) {
        // Conflictos por contexto (Espacio: salto a pie / freno de mano en vehículo, etc.)
        if (this.context === 'vehicle' && (a === 'jump' || a === 'sprint' || a === 'crouch' || a === 'interact' || a === 'focus')) continue;
        if (this.context === 'foot' && (a === 'handbrake' || a === 'nitro' || a === 'lookBack' || a === 'radioNext' || a === 'radioPrev' || a === 'horn')) continue;
        if (this._keyDown(a)) acts.add(a);
      }
    }
    // Ejes de teclado
    let mx = (this._keyDown('right') ? 1 : 0) - (this._keyDown('left') ? 1 : 0);
    let my = (this._keyDown('forward') ? 1 : 0) - (this._keyDown('back') ? 1 : 0);
    let lx = this.mouse.dx * 0.12 * this.sensitivity;
    let ly = this.mouse.dy * 0.12 * this.sensitivity;
    let thr = this._keyDown('forward') ? 1 : 0;
    let brk = this._keyDown('back') ? 1 : 0;
    let steer = mx;
    // Gamepad
    const gp = this._gamepad();
    if (gp) {
      const dz = (v) => (Math.abs(v) < 0.16 ? 0 : (v - Math.sign(v) * 0.16) / 0.84);
      const ax = gp.axes || [];
      const gx = dz(ax[0] || 0), gy = dz(ax[1] || 0), rx = dz(ax[2] || 0), ry = dz(ax[3] || 0);
      const b = (i) => gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > 0.4);
      const bv = (i) => (gp.buttons[i] ? gp.buttons[i].value : 0);
      const any = Math.abs(gx) + Math.abs(gy) + Math.abs(rx) + Math.abs(ry) > 0.05 || gp.buttons.some((x) => x && x.pressed);
      if (any) this.lastDevice = 'gamepad';
      if (Math.abs(gx) > Math.abs(mx)) mx = gx;
      if (Math.abs(gy) > Math.abs(my)) my = -gy;
      lx += rx * 9 * this.gpSensitivity;
      ly += ry * 7 * this.gpSensitivity;
      const map = this.context === 'menu' ? GP_MENU : this.context === 'vehicle' ? GP_VEHICLE : GP_FOOT;
      for (const [a, btns] of Object.entries(map)) if (btns.some((i) => b(i))) acts.add(a);
      if (this.context === 'vehicle') {
        thr = Math.max(thr, bv(GP.RT));
        brk = Math.max(brk, bv(GP.LT));
        if (Math.abs(gx) > Math.abs(steer)) steer = gx;
      }
      this._gp = gp;
    } else this._gp = null;
    // Controles virtuales (táctil)
    const v = this.virtual;
    if (v.active) {
      if (Math.hypot(v.move.x, v.move.y) > Math.hypot(mx, my)) {
        mx = v.move.x;
        my = v.move.y;
      }
      lx += v.look.x;
      ly += v.look.y;
      v.look.x = 0;
      v.look.y = 0;
      for (const a of v.actions) acts.add(a);
      thr = Math.max(thr, v.throttle);
      brk = Math.max(brk, v.brake);
      if (Math.abs(v.steer) > Math.abs(steer)) steer = v.steer;
    }
    const len = Math.hypot(mx, my);
    if (len > 1) {
      mx /= len;
      my /= len;
    }
    this.move.x = mx;
    this.move.y = my;
    this.look.x = lx;
    this.look.y = this.invertY ? -ly : ly;
    this.throttle = clamp(thr, 0, 1);
    this.brake = clamp(brk, 0, 1);
    this.steer = clamp(steer, -1, 1);
    this.pressedSet.clear();
    this.releasedSet.clear();
    for (const a of acts) if (!this.actions.has(a)) this.pressedSet.add(a);
    for (const a of this.actions) if (!acts.has(a)) this.releasedSet.add(a);
    this.actions = acts;
    this.wheel = this.mouse.wheel;
  }

  /** Llamar al final de cada frame. */
  endFrame() {
    this.mouse.dx = 0;
    this.mouse.dy = 0;
    this.mouse.wheel = 0;
  }

  down(a) {
    return this.actions.has(a);
  }
  pressed(a) {
    return this.pressedSet.has(a);
  }
  released(a) {
    return this.releasedSet.has(a);
  }
  /** Consume una pulsación (para que otro sistema no la procese en el mismo frame). */
  consume(a) {
    this.pressedSet.delete(a);
  }

  rumble(strong = 0.5, weak = 0.5, ms = 120) {
    if (!this.vibrationOn) return;
    const gp = this._gp;
    try {
      if (gp && gp.vibrationActuator && gp.vibrationActuator.playEffect) {
        gp.vibrationActuator.playEffect('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak });
      } else if (this.lastDevice === 'touch' && navigator.vibrate) navigator.vibrate(Math.min(ms, 60));
    } catch (e) { /* sin vibración */ }
  }

  /** Etiqueta legible de la tecla/botón para una acción según el último dispositivo. */
  label(action) {
    if (this.lastDevice === 'gamepad') {
      const names = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'Back', 'Start', 'L3', 'R3', '↑', '↓', '←', '→'];
      const map = this.context === 'vehicle' ? GP_VEHICLE : GP_FOOT;
      const b = (map[action] || [])[0];
      return b != null ? names[b] : '';
    }
    if (this.lastDevice === 'touch') return '';
    const code = (this.bindings[action] || [])[0] || '';
    return keyName(code);
  }
}

export function keyName(code) {
  if (!code) return '';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const map = {
    Space: 'Espacio', ShiftLeft: 'Shift', ShiftRight: 'Shift', ControlLeft: 'Ctrl', Escape: 'Esc', Enter: 'Enter', Tab: 'Tab',
    Mouse0: 'Clic izq.', Mouse2: 'Clic der.', Mouse1: 'Rueda', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
    BracketLeft: '[', BracketRight: ']', Backspace: 'Borrar',
  };
  return map[code] || code;
}
