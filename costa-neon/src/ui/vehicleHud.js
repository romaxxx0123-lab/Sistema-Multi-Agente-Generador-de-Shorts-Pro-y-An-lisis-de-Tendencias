// HUD de vehículo: velocímetro, marcha, nitro, estado, nombre del vehículo y radio.
import { clamp } from '../core/utils.js';

const ARC_LEN = 251.3; // longitud del arco SVG (270° de r=53.3)

export class VehicleHud {
  constructor(game) {
    this.game = game;
    const ui = document.getElementById('ui');
    const el = document.createElement('div');
    el.className = 'vhud';
    el.hidden = true;
    el.innerHTML = `
      <div class="vhud-gauge">
        <svg viewBox="0 0 140 140" aria-hidden="true">
          <path class="vh-track" d="M 32.3 107.7 A 53.3 53.3 0 1 1 107.7 107.7" />
          <path class="vh-fill" d="M 32.3 107.7 A 53.3 53.3 0 1 1 107.7 107.7" />
        </svg>
        <div class="vh-speed"><span class="vh-num">0</span><span class="vh-unit">km/h</span></div>
        <div class="vh-gear">N</div>
      </div>
      <div class="vh-bars">
        <div class="vh-bar vh-health" title="Estado del vehículo"><i></i></div>
        <div class="vh-bar vh-nitro" title="Nitro"><i></i></div>
      </div>`;
    ui.appendChild(el);
    this.el = el;
    this.num = el.querySelector('.vh-num');
    this.gear = el.querySelector('.vh-gear');
    this.fill = el.querySelector('.vh-fill');
    this.health = el.querySelector('.vh-health i');
    this.nitroBar = el.querySelector('.vh-nitro');
    this.nitro = el.querySelector('.vh-nitro i');
    const toast = document.createElement('div');
    toast.className = 'vh-toast';
    toast.hidden = true;
    ui.appendChild(toast);
    this.toast = toast;
    this.toastT = 0;
    const radio = document.createElement('div');
    radio.className = 'radio-toast';
    radio.hidden = true;
    ui.appendChild(radio);
    this.radio = radio;
    this.radioT = 0;
    this._lastSpeed = -1;
  }

  showVehicle(v) {
    this.toast.innerHTML = `<div class="vt-name">${v.spec.name}</div><div class="vt-cls">${v.spec.cls}</div>`;
    this.toast.hidden = false;
    this.toastT = 3.2;
  }

  showRadio(info) {
    const r = this.radio;
    if (!info) {
      r.innerHTML = `<div class="rt-st">Radio apagada</div>`;
    } else {
      const st = info.station;
      r.style.setProperty('--st', st.color);
      r.innerHTML = `<div class="rt-st"><span class="rt-dot"></span>${st.name} <span class="rt-fq">${st.freq}</span></div>${info.title ? `<div class="rt-song">${info.title} — ${info.artist}</div>` : `<div class="rt-song">${st.genre}</div>`}`;
    }
    r.hidden = false;
    this.radioT = 4;
  }

  update(dt) {
    const v = this.game.player.vehicle;
    this.toastT -= dt;
    if (this.toastT <= 0) this.toast.hidden = true;
    this.radioT -= dt;
    if (this.radioT <= 0) this.radio.hidden = true;
    if (!v) {
      this.el.hidden = true;
      return;
    }
    this.el.hidden = false;
    const kmh = Math.round(Math.abs(v.speed) * 3.6);
    if (kmh !== this._lastSpeed) {
      this.num.textContent = kmh;
      this._lastSpeed = kmh;
    }
    const frac = clamp(Math.abs(v.speed) / (v.spec.top * 1.1), 0, 1);
    this.fill.style.strokeDashoffset = String(ARC_LEN * (1 - frac));
    this.fill.classList.toggle('hot', v.nitroOn);
    this.gear.textContent = v.gear < 0 ? 'R' : Math.abs(v.speed) < 0.5 ? 'N' : String(v.gear);
    this.health.style.width = Math.max(0, (v.health / v.maxHealth) * 100) + '%';
    this.health.parentElement.classList.toggle('low', v.health / v.maxHealth < 0.3);
    const hasNitro = v.upgrades.nitro > 0;
    this.nitroBar.hidden = !hasNitro;
    if (hasNitro) this.nitro.style.width = v.nitroCharge * 100 + '%';
  }
}
