/**
 * ICONOS SVG PROPIOS de la interfaz.
 *
 * - `itemIcon(id)`: ilustración a color (48×48, contorno oscuro y sombras planas, estilo low-poly)
 *   para CADA objeto de `data/items.ts`, con una silueta distinta y reconocible.
 * - `glyph(name)`: pictogramas de línea monocromos (24×24, `currentColor`) para el HUD, los
 *   paneles y los menús.
 *
 * Todo se genera como texto (sin DOM) para poder probarlo en Node y cachearlo.
 */
import { ITEMS } from '../data/items';

/* ------------------------------------------------------------------ */
/* Utilidades de color y trazo                                         */
/* ------------------------------------------------------------------ */

const OUT = '#1b2227';
/** Atributos de contorno comunes. */
const S = `stroke="${OUT}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"`;
const S1 = `stroke="${OUT}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"`;

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(v, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Aclara (f > 1) u oscurece (f < 1) un color. */
export function shade(hex: string, f: number): string {
  const [r, g, b] = hexToRgb(hex);
  const mix = (c: number): number => {
    const v = f >= 1 ? c + (255 - c) * (f - 1) : c * f;
    return Math.max(0, Math.min(255, Math.round(v)));
  };
  return `#${[mix(r), mix(g), mix(b)].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

const svg48 = (body: string): string =>
  `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">${body}</svg>`;

/** Sombra de suelo común a todos los objetos. */
const GROUND = '<ellipse cx="24" cy="42.5" rx="15" ry="2.6" fill="rgba(0,0,0,0.28)"/>';

/** Polígono de un engranaje. */
function gearPath(cx: number, cy: number, ro: number, ri: number, n: number): string {
  const pts: string[] = [];
  const step = (Math.PI * 2) / n;
  for (let i = 0; i < n; i++) {
    const a = i * step - Math.PI / 2;
    const p = (ang: number, r: number): string => `${(cx + Math.cos(ang) * r).toFixed(2)},${(cy + Math.sin(ang) * r).toFixed(2)}`;
    pts.push(p(a, ri), p(a + step * 0.14, ro), p(a + step * 0.42, ro), p(a + step * 0.56, ri));
  }
  return `M${pts.join(' L')} Z`;
}

/** Estrella / sol de `n` puntas (polígono). */
function starPath(cx: number, cy: number, ro: number, ri: number, n: number): string {
  const pts: string[] = [];
  for (let i = 0; i < n * 2; i++) {
    const a = (i * Math.PI) / n - Math.PI / 2;
    const r = i % 2 ? ri : ro;
    pts.push(`${(cx + Math.cos(a) * r).toFixed(2)},${(cy + Math.sin(a) * r).toFixed(2)}`);
  }
  return `M${pts.join(' L')} Z`;
}

/* ------------------------------------------------------------------ */
/* Ilustraciones de objetos                                            */
/* ------------------------------------------------------------------ */

type Painter = (c: string) => string;

const plank = (x: number, y: number, w: number, c: string, grain: string): string =>
  `<rect x="${x}" y="${y}" width="${w}" height="8" rx="1.6" fill="${c}" ${S}/>` +
  `<path d="M${x + 4} ${y + 3}h${w * 0.35}M${x + w * 0.5} ${y + 5.2}h${w * 0.38}" stroke="${grain}" stroke-width="1.3" stroke-linecap="round"/>` +
  `<circle cx="${x + w - 4}" cy="${y + 4}" r="0.9" fill="${OUT}"/>`;

/** Sobre de semillas con una ilustración encima. */
function seedPacket(c: string, picture: string): string {
  const paper = '#f1e6c8';
  return (
    GROUND +
    `<path d="M11 10 L37 10 L37 40 L11 40 Z" fill="${paper}" ${S}/>` +
    `<path d="M11 10 L14 7 L17 10 L20 7 L23 10 L26 7 L29 10 L32 7 L35 10 L37 8" fill="none" ${S1}/>` +
    `<rect x="11" y="31" width="26" height="9" fill="${c}" ${S}/>` +
    `<path d="M15 35.5h12" stroke="${shade(c, 1.6)}" stroke-width="1.6" stroke-linecap="round"/>` +
    picture +
    `<ellipse cx="40" cy="40" rx="2.2" ry="1.5" fill="#8a6a3d" ${S1}/><ellipse cx="35.5" cy="42" rx="2" ry="1.4" fill="#a07a48" ${S1}/>`
  );
}

/** Plano enrollado (todos iguales salvo el color de la cinta y el emblema). */
function blueprint(c: string, emblem: string): string {
  const paper = '#2f6aa8';
  const roll = shade(paper, 0.78);
  return (
    GROUND +
    `<path d="M7 12 L33 12 L33 40 L7 40 Z" fill="${paper}" ${S}/>` +
    `<path d="M10 18h20M10 24h20M10 30h20M10 35h20M14 14v24M21 14v24M28 14v24" stroke="${shade(paper, 1.35)}" stroke-width="0.8" opacity="0.7"/>` +
    `<rect x="31" y="9" width="10" height="34" rx="5" fill="${roll}" ${S}/>` +
    `<ellipse cx="36" cy="11" rx="4.2" ry="2" fill="${shade(paper, 1.25)}" ${S1}/>` +
    `<path d="M31 22 h10 v6 h-10 z" fill="${c}" ${S1}/>` +
    `<circle cx="19" cy="25" r="8.5" fill="${c}" ${S}/>` +
    `<g fill="#ffffff" stroke="none">${emblem}</g>`
  );
}

const EMBLEMS: Record<string, string> = {
  gear: `<path d="${gearPath(19, 25, 6, 4.4, 8)}"/><circle cx="19" cy="25" r="1.8" fill="#2f6aa8"/>`,
  bolt: '<path d="M20.5 18 L15 26 L19 26 L17.5 32 L23.5 23.5 L19.5 23.5 Z"/>',
  drop: '<path d="M19 18 C22 22.5 24 25 24 27.3 A5 5 0 0 1 14 27.3 C14 25 16 22.5 19 18 Z"/>',
  sun: `<path d="${starPath(19, 25, 6.4, 4, 8)}"/><circle cx="19" cy="25" r="2.7" fill="#fb8500"/>`,
  cross: '<path d="M17 19h4v4h4v4h-4v4h-4v-4h-4v-4h4z"/>',
  hull: '<path d="M12 24 h14 l-2.5 5.5 h-9 z"/><path d="M18.5 17 v7 M18.5 17.5 l5 4.5 h-5" stroke="#ffffff" stroke-width="1.4" fill="none"/>',
  leaf: '<path d="M13.5 30.5 C13 22 18 18 25 18.5 C25 26 21 30.5 13.5 30.5 Z"/><path d="M14.5 29.5 L22 21.5" stroke="#80b918" stroke-width="1.2"/>',
  prop: '<circle cx="19" cy="25" r="1.8"/><path d="M19 25 C17 21 17.5 18 19.5 18 C21.5 18 21 21.5 19 25 Z M19 25 C23 23.5 25.5 24.5 25 26.5 C24.5 28.5 21.5 27 19 25 Z M19 25 C17.8 28.8 15.5 30.7 14 29.4 C12.6 28 15.3 26 19 25 Z"/>',
};

const P: Record<string, Painter> = {
  madera: (c) => {
    const g = shade(c, 0.7);
    return GROUND + `<g transform="rotate(-16 24 25)">${plank(5, 28, 34, shade(c, 0.9), g)}${plank(9, 19, 33, c, g)}${plank(6, 10, 28, shade(c, 1.12), g)}</g>`;
  },
  chatarra: (c) =>
    GROUND +
    `<path d="M7 33 L12 19 L20 23 L25 11 L35 17 L33 26 L39 30 L30 37 L18 38 Z" fill="${c}" ${S}/>` +
    `<path d="M12 19 L20 23 L18 38" fill="none" stroke="${shade(c, 0.7)}" stroke-width="1.4"/>` +
    `<path d="M25 11 L28 22 L39 30" fill="none" stroke="${shade(c, 1.25)}" stroke-width="1.4"/>` +
    `<circle cx="16" cy="29" r="2.2" fill="#b5651d" opacity="0.85"/><circle cx="30" cy="31" r="1.6" fill="#b5651d" opacity="0.8"/><circle cx="29" cy="18" r="1.3" fill="#b5651d" opacity="0.7"/>` +
    `<path d="M35 9 l3.2 1.8 v3.7 l-3.2 1.8 l-3.2 -1.8 v-3.7 z" fill="${shade(c, 1.2)}" ${S1}/><circle cx="35" cy="12.5" r="1.1" fill="${OUT}"/>`,
  placa_metal: (c) =>
    GROUND +
    `<path d="M5 24 L24 33 L24 38 L5 29 Z" fill="${shade(c, 0.72)}" ${S}/>` +
    `<path d="M24 33 L43 22 L43 27 L24 38 Z" fill="${shade(c, 0.85)}" ${S}/>` +
    `<path d="M5 24 L24 13 L43 22 L24 33 Z" fill="${c}" ${S}/>` +
    `<path d="M14 21 L28 14" stroke="${shade(c, 1.45)}" stroke-width="2" stroke-linecap="round"/>` +
    `<circle cx="11" cy="24" r="1.2" fill="${OUT}"/><circle cx="24" cy="17" r="1.2" fill="${OUT}"/><circle cx="37" cy="22" r="1.2" fill="${OUT}"/><circle cx="24" cy="29" r="1.2" fill="${OUT}"/>`,
  tornillos: (c) =>
    GROUND +
    `<g transform="rotate(35 20 22)">` +
    `<rect x="17" y="13" width="6" height="22" fill="${shade(c, 0.9)}" ${S}/>` +
    `<path d="M17 17 l6 -2 M17 21 l6 -2 M17 25 l6 -2 M17 29 l6 -2 M17 33 l6 -2" stroke="${shade(c, 0.6)}" stroke-width="1.3"/>` +
    `<path d="M17 35 L20 40 L23 35 Z" fill="${shade(c, 0.8)}" ${S1}/>` +
    `<rect x="12" y="8" width="16" height="6" rx="2" fill="${c}" ${S}/>` +
    `<path d="M16 11h8" stroke="${OUT}" stroke-width="1.6" stroke-linecap="round"/>` +
    `</g>` +
    `<path d="M35 26 l5.2 3 v6 l-5.2 3 l-5.2 -3 v-6 z" fill="${shade(c, 1.12)}" ${S}/><circle cx="35" cy="32" r="2.4" fill="${shade(c, 0.55)}" ${S1}/>`,
  fibra: (c) => {
    const d = shade(c, 0.72);
    const l = shade(c, 1.25);
    return (
      GROUND +
      `<path d="M21 26 L8 8 L15 7 L22 6 L28 6 L35 8 L40 10 L27 26 Z" fill="${c}" ${S}/>` +
      `<path d="M21 28 L12 40 L19 41 L24 41 L30 41 L37 39 L27 28 Z" fill="${shade(c, 0.9)}" ${S}/>` +
      `<path d="M23 25 L13 9 M24 25 L22 7 M25 25 L30 7 M26 25 L36 10 M23 29 L17 40 M25 29 L25 40 M26 29 L33 39" stroke="${d}" stroke-width="1.2"/>` +
      `<path d="M24.5 24 L18 9 M25.5 24 L26 8" stroke="${l}" stroke-width="1"/>` +
      `<rect x="18" y="24" width="12" height="6" rx="1.5" fill="#8b5e3c" ${S}/>`
    );
  },
  cuerda: (c) => {
    const d = shade(c, 0.62);
    const coil = (rx: number, ry: number): string =>
      `<ellipse cx="23" cy="26" rx="${rx}" ry="${ry}" fill="none" stroke="${OUT}" stroke-width="7"/>` +
      `<ellipse cx="23" cy="26" rx="${rx}" ry="${ry}" fill="none" stroke="${c}" stroke-width="4.4"/>` +
      `<ellipse cx="23" cy="26" rx="${rx}" ry="${ry}" fill="none" stroke="${d}" stroke-width="4.4" stroke-dasharray="1.6 3.2"/>`;
    return (
      GROUND +
      coil(15, 11) +
      coil(8.5, 6) +
      `<path d="M36 31 C40 33 41 37 43 40" fill="none" stroke="${OUT}" stroke-width="7" stroke-linecap="round"/>` +
      `<path d="M36 31 C40 33 41 37 43 40" fill="none" stroke="${c}" stroke-width="4.4" stroke-linecap="round"/>` +
      `<path d="M36 31 C40 33 41 37 43 40" fill="none" stroke="${d}" stroke-width="4.4" stroke-dasharray="1.6 3.2"/>` +
      `<circle cx="23" cy="26" r="2.2" fill="${shade(c, 0.5)}"/>`
    );
  },
  tela: (c) =>
    GROUND +
    `<path d="M7 30 L33 25 L41 33 L15 38 Z" fill="${shade(c, 0.8)}" ${S}/>` +
    `<path d="M7 22 L33 17 L41 25 L15 30 Z" fill="${shade(c, 0.92)}" ${S}/>` +
    `<path d="M7 14 L33 9 L41 17 L15 22 Z" fill="${c}" ${S}/>` +
    `<path d="M33 9 L41 17 L36 18 Z" fill="${shade(c, 0.75)}" ${S1}/>` +
    `<path d="M10 15.5 L31 11.5" stroke="#b38b5d" stroke-width="1.2" stroke-dasharray="2 2"/>` +
    `<path d="M15 22 L15 38" stroke="${OUT}" stroke-width="1.2" opacity="0.4"/>`,
  plastico: (c) =>
    GROUND +
    `<path d="M15 14 C15 6 21 5 21 12 M27 12 C27 5 33 6 33 14" fill="none" ${S}/>` +
    `<path d="M11 14 L37 14 L39 24 L36 31 L38 39 L10 39 L12 31 L9 24 Z" fill="${c}" fill-opacity="0.82" ${S}/>` +
    `<path d="M15 19 L19 26 L16 33 M27 18 L31 24 L28 33 M22 28 L25 35" fill="none" stroke="${shade(c, 0.6)}" stroke-width="1.3"/>` +
    `<path d="M13 17 L13 26" stroke="#ffffff" stroke-width="2" stroke-linecap="round" opacity="0.7"/>`,
  componentes: (c) =>
    GROUND +
    `<rect x="6" y="10" width="36" height="29" rx="3" fill="#2f6b55" ${S}/>` +
    `<path d="M10 16 h8 v6 h6 M10 33 h10 l4 -4 h6 M36 15 v8 h-4 M36 34 h-6" fill="none" stroke="${c}" stroke-width="1.6" stroke-linecap="round"/>` +
    `<circle cx="10" cy="16" r="1.4" fill="${c}"/><circle cx="10" cy="33" r="1.4" fill="${c}"/><circle cx="36" cy="34" r="1.4" fill="${c}"/>` +
    `<rect x="17" y="18" width="14" height="13" rx="1.5" fill="#22262b" ${S1}/>` +
    `<path d="M19 18v-2.5M22 18v-2.5M25 18v-2.5M28 18v-2.5M19 31v2.5M22 31v2.5M25 31v2.5M28 31v2.5" stroke="#cfd4d9" stroke-width="1.3"/>` +
    `<rect x="34" y="23" width="5" height="8" rx="2" fill="${c}" ${S1}/>` +
    `<circle cx="20.5" cy="21.5" r="1" fill="${c}"/>`,
  combustible: (c) =>
    GROUND +
    `<path d="M10 14 L30 14 L38 20 L38 40 L10 40 Z" fill="${c}" ${S}/>` +
    `<path d="M10 14 L10 8 L24 8 L28 14" fill="${shade(c, 0.85)}" ${S}/>` +
    `<path d="M14 11 h3 M19.5 11 h3" stroke="${OUT}" stroke-width="2.4" stroke-linecap="round"/>` +
    `<path d="M33 16 L36 9 L40 10 L37.5 18" fill="#3a3f45" ${S}/>` +
    `<path d="M15 21 L33 35 M33 21 L15 35" stroke="${shade(c, 0.7)}" stroke-width="2.4" stroke-linecap="round"/>` +
    `<rect x="14" y="20" width="20" height="16" rx="1" fill="none" stroke="${shade(c, 1.3)}" stroke-width="1.2"/>`,
  pieza_mecanica: (c) =>
    GROUND +
    `<path d="${gearPath(20, 24, 15, 11, 10)}" fill="${c}" ${S}/>` +
    `<circle cx="20" cy="24" r="6.5" fill="${shade(c, 1.25)}" ${S}/>` +
    `<circle cx="20" cy="24" r="3" fill="#22262b" ${S1}/>` +
    `<path d="${gearPath(37, 35, 8, 5.8, 7)}" fill="${shade(c, 0.85)}" ${S}/>` +
    `<circle cx="37" cy="35" r="2.2" fill="#22262b"/>`,
  kit_reparacion: (c) =>
    GROUND +
    `<path d="M17 13 v-4 h14 v4" fill="none" stroke="${OUT}" stroke-width="3" stroke-linecap="round"/>` +
    `<rect x="6" y="13" width="36" height="27" rx="3" fill="${c}" ${S}/>` +
    `<rect x="6" y="13" width="36" height="8" rx="3" fill="${shade(c, 1.2)}" ${S}/>` +
    `<path d="M6 21h36" stroke="${OUT}" stroke-width="2"/>` +
    `<rect x="21" y="18" width="6" height="6" rx="1" fill="#8a9399" ${S1}/>` +
    `<g transform="rotate(-30 24 31)"><rect x="12" y="29" width="24" height="5" rx="1" fill="#8b5e3c" ${S1}/></g>` +
    `<g transform="rotate(30 24 31)"><rect x="12" y="29" width="24" height="5" rx="1" fill="#a87f4f" ${S1}/></g>` +
    `<circle cx="24" cy="31.5" r="1.4" fill="#cfd4d9" ${S1}/>`,
  celula_solar: (c) =>
    GROUND +
    `<path d="M8 15 L36 10 L41 33 L13 38 Z" fill="#cfd4d9" ${S}/>` +
    `<path d="M11 17 L34.5 12.8 L38.6 31.4 L15 35.6 Z" fill="${c}"/>` +
    `<path d="M18.8 15.6 L22.9 34.3 M26.6 14.2 L30.8 32.9 M12.4 23.3 L36.2 19 M13.8 29.4 L37.5 25.1" stroke="${shade(c, 1.6)}" stroke-width="1.1"/>` +
    `<path d="M13 19 L19 18" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" opacity="0.8"/>` +
    `<path d="M40 6 l1 2.4 l2.4 1 l-2.4 1 l-1 2.4 l-1 -2.4 l-2.4 -1 l2.4 -1 z" fill="#ffd166"/>`,
  pescado_crudo: (c) =>
    GROUND +
    `<path d="M33 24 L44 15 L42 24 L44 33 Z" fill="${shade(c, 0.82)}" ${S}/>` +
    `<path d="M5 24 C10 14 22 12 33 24 C22 36 10 34 5 24 Z" fill="${c}" ${S}/>` +
    `<path d="M8 26 C14 31 24 31 30 26" fill="${shade(c, 1.35)}" stroke="none"/>` +
    `<path d="M17 16 L22 11 L25 18" fill="${shade(c, 0.8)}" ${S1}/>` +
    `<path d="M15 18 C17 21 17 27 15 30" fill="none" stroke="${shade(c, 0.6)}" stroke-width="1.5" stroke-linecap="round"/>` +
    `<circle cx="10.5" cy="22" r="2" fill="#ffffff" ${S1}/><circle cx="10.2" cy="22" r="0.9" fill="${OUT}"/>` +
    `<path d="M20 23 l2 2 M24 22 l2 2 M22 27 l2 2" stroke="${shade(c, 0.7)}" stroke-width="1"/>`,
  pescado_asado: (c) =>
    GROUND +
    `<ellipse cx="24" cy="34" rx="20" ry="6.5" fill="#f3ead6" ${S}/>` +
    `<path d="M33 26 L43 19 L41.5 26 L43 33 Z" fill="${shade(c, 0.78)}" ${S}/>` +
    `<path d="M6 26 C11 17 22 15 33 26 C22 36 11 35 6 26 Z" fill="${c}" ${S}/>` +
    `<path d="M14 21 L18 31 M19 19.5 L23 31.5 M24 20 L27.5 30.5" stroke="#6b3a1a" stroke-width="2" stroke-linecap="round"/>` +
    `<circle cx="10.5" cy="24.5" r="1.4" fill="${OUT}"/>` +
    `<path d="M18 13 C16 10 20 8 18 4 M25 12 C23 9 27 7 25 3" fill="none" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" opacity="0.85"/>`,
  hortaliza: (c) =>
    GROUND +
    `<path d="M12 40 C8 35 6 28 10 21 C14 15 22 14 27 18 C33 22 33 33 28 39 C23 42 16 42 12 40 Z" fill="${c}" ${S}/>` +
    `<path d="M14 36 C12 30 14 24 19 21 M22 39 C21 32 23 26 27 23" fill="none" stroke="${shade(c, 0.65)}" stroke-width="1.6" stroke-linecap="round"/>` +
    `<path d="M15 24 C18 21 22 21 24 23" fill="none" stroke="${shade(c, 1.3)}" stroke-width="1.6" stroke-linecap="round"/>` +
    `<g transform="rotate(35 33 24)"><path d="M29 15 L37 15 L33 40 Z" fill="#f3722c" ${S}/>` +
    `<path d="M30.5 21 h3 M31.5 27 h2.5 M32 32 h1.8" stroke="#b5451b" stroke-width="1.2" stroke-linecap="round"/>` +
    `<path d="M31 15 L28 7 M33 15 L33 6 M35 15 L38 8" stroke="#4f772d" stroke-width="2.6" stroke-linecap="round"/></g>`,
  fruta: (c) =>
    GROUND +
    `<path d="M24 17 L18 4 L23 11 L24 3 L26 11 L31 4 L26 17 Z" fill="#55a630" ${S}/>` +
    `<ellipse cx="24" cy="29" rx="11" ry="13" fill="${c}" ${S}/>` +
    `<path d="M15 23 L29 39 M18 18 L33 34 M14.5 30 L24 41 M33 23 L19 39 M30 18 L15 34 M33.5 30 L24 41" stroke="${shade(c, 0.66)}" stroke-width="1.3"/>` +
    `<path d="M17 24 C17 21 19 19 21 18.5" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" opacity="0.7"/>`,
  conserva: (c) =>
    GROUND +
    `<path d="M11 13 L11 37 C11 41 37 41 37 37 L37 13 Z" fill="${c}" ${S}/>` +
    `<path d="M11 19 L11 31 C11 34 37 34 37 31 L37 19 C37 22 11 22 11 19 Z" fill="#d1495b" ${S1}/>` +
    `<path d="M16 26 C19 23 24 23 27 26 C24 29 19 29 16 26 Z M27 26 l4 -2.5 v5 z" fill="#f6efe0"/>` +
    `<ellipse cx="24" cy="13" rx="13" ry="4.2" fill="${shade(c, 1.25)}" ${S}/>` +
    `<ellipse cx="24" cy="13" rx="9.5" ry="2.6" fill="none" stroke="${shade(c, 0.7)}" stroke-width="1.2"/>` +
    `<ellipse cx="27" cy="12.5" rx="3" ry="1.5" fill="none" stroke="${OUT}" stroke-width="1.4"/>` +
    `<path d="M14 15 L14 36" stroke="#ffffff" stroke-width="1.6" opacity="0.5" stroke-linecap="round"/>`,
  sopa: (c) =>
    GROUND +
    `<path d="M5 22 L43 22 C43 34 35 40 24 40 C13 40 5 34 5 22 Z" fill="#f3ead6" ${S}/>` +
    `<ellipse cx="24" cy="22" rx="19" ry="4.6" fill="${c}" ${S}/>` +
    `<circle cx="17" cy="22" r="1.6" fill="#55a630"/><circle cx="27" cy="21" r="1.5" fill="#f3722c"/><circle cx="31" cy="23" r="1.3" fill="#55a630"/><circle cx="22" cy="23.5" r="1.2" fill="#f9c74f"/>` +
    `<path d="M9 28 C12 33 18 35 24 35" fill="none" stroke="#c9bfa9" stroke-width="1.6" stroke-linecap="round"/>` +
    `<path d="M35 20 L42 8" stroke="#8a9399" stroke-width="3" stroke-linecap="round"/>` +
    `<path d="M17 15 C15 12 19 10 17 6 M25 14 C23 11 27 9 25 5" fill="none" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" opacity="0.85"/>`,
  guiso: (c) =>
    GROUND +
    `<path d="M5 22 h4 M39 22 h4" stroke="${OUT}" stroke-width="4" stroke-linecap="round"/>` +
    `<path d="M8 20 L40 20 L38 38 C38 41 10 41 10 38 Z" fill="#3a3f45" ${S}/>` +
    `<ellipse cx="24" cy="20" rx="16" ry="4.2" fill="${c}" ${S}/>` +
    `<circle cx="17" cy="20" r="1.8" fill="#f9c74f"/><circle cx="29" cy="19.5" r="1.6" fill="#90be6d"/><circle cx="23" cy="21" r="1.3" fill="#f3722c"/>` +
    `<path d="M30 21 L34 14 L36.5 18 L33.5 21" fill="#8ecae6" ${S1}/>` +
    `<path d="M12 26 L12 35" stroke="#ffffff" stroke-width="1.6" stroke-linecap="round" opacity="0.35"/>` +
    `<path d="M15 13 C13 10 17 8 15 4 M23 12 C21 9 25 7 23 3" fill="none" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" opacity="0.85"/>`,
  agua_potable: (c) =>
    GROUND +
    `<rect x="19" y="4" width="10" height="5" rx="1.2" fill="#1d4e89" ${S}/>` +
    `<path d="M20 9 L28 9 L28 13 C35 15 36 18 36 22 L36 38 C36 41 12 41 12 38 L12 22 C12 18 13 15 20 13 Z" fill="#e8f6fb" fill-opacity="0.9" ${S}/>` +
    `<path d="M13.2 24 L34.8 24 L34.8 38 C34.8 39.8 13.2 39.8 13.2 38 Z" fill="${c}"/>` +
    `<rect x="12" y="27" width="24" height="7" fill="#ffffff" ${S1}/>` +
    `<path d="M24 28 C25.6 30 26.2 31 26.2 31.8 A2.2 2.2 0 0 1 21.8 31.8 C21.8 31 22.4 30 24 28 Z" fill="${c}"/>` +
    `<path d="M15.5 17 L15.5 23" stroke="#ffffff" stroke-width="2" stroke-linecap="round"/>`,
  cubo_agua: (c) =>
    GROUND +
    `<path d="M9 18 C9 2 39 2 39 18" fill="none" stroke="${OUT}" stroke-width="2.4"/>` +
    `<path d="M9 18 L13 40 L35 40 L39 18 Z" fill="#adb5bd" ${S}/>` +
    `<ellipse cx="24" cy="18" rx="15" ry="4.5" fill="${c}" ${S}/>` +
    `<path d="M13 18 C16 16 18 20 21 18 C24 16 26 20 29 18 C32 16 34 20 36 18" fill="none" stroke="${shade(c, 1.6)}" stroke-width="1.4"/>` +
    `<path d="M11.5 26 L36.5 26" stroke="#7d8597" stroke-width="1.6"/>` +
    `<path d="M41 27 C42.6 29.4 43.2 30.4 43.2 31.4 A2.2 2.2 0 0 1 38.8 31.4 C38.8 30.4 39.4 29.4 41 27 Z" fill="${c}" ${S1}/>`,
  semilla_hortaliza: (c) =>
    seedPacket(
      c,
      `<path d="M24 28 L24 20" stroke="#4f772d" stroke-width="2" stroke-linecap="round"/>` +
        `<path d="M24 21 C20 21 17 18 17 14 C21 14 24 17 24 21 Z M24 19 C24 15 27 12 31 12 C31 16 28 19 24 19 Z" fill="${c}" ${S1}/>` +
        `<path d="M17 28 h14" stroke="#7a5c3c" stroke-width="2" stroke-linecap="round"/>`,
    ),
  semilla_lino: (c) =>
    seedPacket(
      c,
      `<path d="M24 29 L24 21" stroke="#4f772d" stroke-width="1.8" stroke-linecap="round"/>` +
        `<g fill="#7fb3d5" ${S1}><circle cx="24" cy="14" r="3.3"/><circle cx="19.5" cy="17.5" r="3.3"/><circle cx="28.5" cy="17.5" r="3.3"/><circle cx="21.3" cy="22" r="3.1"/><circle cx="26.7" cy="22" r="3.1"/></g>` +
        `<circle cx="24" cy="18.5" r="2" fill="#f9c74f" ${S1}/>`,
    ),
  vendaje: (c) =>
    GROUND +
    `<path d="M22 31 L40 26 L43 36 L25 40 Z" fill="${c}" ${S}/>` +
    `<path d="M30 30 v5 M27.5 32.5 h5" stroke="#e5604d" stroke-width="2" stroke-linecap="round"/>` +
    `<path d="M10 13 L28 13 L28 33 L10 33 Z" fill="${shade(c, 0.88)}" ${S}/>` +
    `<ellipse cx="10" cy="23" rx="5.5" ry="10" fill="${c}" ${S}/>` +
    `<ellipse cx="10" cy="23" rx="2.6" ry="5" fill="none" stroke="#c9c3b6" stroke-width="1.4"/>` +
    `<ellipse cx="10" cy="23" rx="1" ry="2" fill="#c9c3b6"/>` +
    `<path d="M14 17 h11 M14 21 h11 M14 25 h11 M14 29 h11" stroke="#d9d4ca" stroke-width="1.1"/>`,
  botiquin: (c) =>
    GROUND +
    `<path d="M18 13 v-4 h12 v4" fill="none" stroke="${OUT}" stroke-width="3" stroke-linecap="round"/>` +
    `<rect x="6" y="13" width="36" height="27" rx="4" fill="${c}" ${S}/>` +
    `<path d="M6 19 h36" stroke="${shade(c, 0.7)}" stroke-width="1.6"/>` +
    `<path d="M20 20 h8 v5 h5 v8 h-5 v5 h-8 v-5 h-5 v-8 h5 z" fill="#ffffff" ${S1}/>` +
    `<path d="M10 16.5 h8" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" opacity="0.6"/>`,
  martillo: (c) =>
    GROUND +
    `<g transform="rotate(-40 24 24)">` +
    `<rect x="21" y="16" width="6" height="28" rx="2" fill="${c}" ${S}/>` +
    `<path d="M23 21 v19" stroke="${shade(c, 1.3)}" stroke-width="1.4" stroke-linecap="round"/>` +
    `<rect x="21" y="36" width="6" height="7" rx="1.5" fill="${shade(c, 0.7)}" ${S1}/>` +
    `<path d="M11 6 L29 6 L33 9 L37 7 L35 15 L29 15 L11 15 Z" fill="#8a9399" ${S}/>` +
    `<path d="M13 9 h14" stroke="#c9d1d8" stroke-width="1.6" stroke-linecap="round"/>` +
    `</g>`,
  llave_inglesa: (c) =>
    GROUND +
    `<g transform="rotate(42 24 24)">` +
    `<rect x="20.5" y="15" width="7" height="27" rx="3.5" fill="${c}" ${S}/>` +
    `<circle cx="24" cy="37.5" r="1.9" fill="#22262b"/>` +
    `<path d="M15 4 L15 12 C15 16 19 18 24 18 C29 18 33 16 33 12 L33 4 L28 4 L28 10 L20 10 L20 4 Z" fill="${shade(c, 1.15)}" ${S}/>` +
    `<path d="M21 22 h6" stroke="${shade(c, 0.6)}" stroke-width="1.3"/>` +
    `<path d="M22.5 20 v16" stroke="${shade(c, 1.45)}" stroke-width="1.3" stroke-linecap="round"/>` +
    `</g>`,
  gancho: (c) => {
    const m = shade(c, 1.75);
    const prongs = ['M24 29 C21 39 12 39 9.5 29', 'M24 29 C27 39 36 39 38.5 29', 'M24 29 L24 41'];
    const under = prongs.map((d) => `<path d="${d}" fill="none" stroke="${OUT}" stroke-width="7.5" stroke-linecap="round"/>`).join('');
    const over = prongs.map((d) => `<path d="${d}" fill="none" stroke="${m}" stroke-width="4.2" stroke-linecap="round"/>`).join('');
    return (
      GROUND +
      `<path d="M20 8 C14 4 8 7 5 13" fill="none" stroke="${OUT}" stroke-width="5.5" stroke-linecap="round"/>` +
      `<path d="M20 8 C14 4 8 7 5 13" fill="none" stroke="#d6b97b" stroke-width="3" stroke-linecap="round"/>` +
      under +
      `<path d="M6 30.5 L9 23.5 L13 29.5 Z M42 30.5 L39 23.5 L35 29.5 Z" fill="${m}" ${S1}/>` +
      `<rect x="20.5" y="11" width="7" height="21" rx="2" fill="${m}" ${S}/>` +
      over +
      `<path d="M22.6 14 v14" stroke="#ffffff" stroke-width="1.4" stroke-linecap="round" opacity="0.7"/>` +
      `<circle cx="24" cy="8" r="4" fill="none" stroke="${OUT}" stroke-width="5"/>` +
      `<circle cx="24" cy="8" r="4" fill="none" stroke="${m}" stroke-width="2.4"/>`
    );
  },
  cana: (c) =>
    GROUND +
    `<path d="M7 41 L40 6" stroke="${OUT}" stroke-width="4.6" stroke-linecap="round"/>` +
    `<path d="M7 41 L40 6" stroke="${c}" stroke-width="2.4" stroke-linecap="round"/>` +
    `<path d="M7 41 L15 32.5" stroke="${OUT}" stroke-width="6.5" stroke-linecap="round"/>` +
    `<path d="M7 41 L15 32.5" stroke="#6b4a2f" stroke-width="4.2" stroke-linecap="round"/>` +
    `<circle cx="19" cy="33" r="4.4" fill="#adb5bd" ${S}/><circle cx="19" cy="33" r="1.4" fill="${OUT}"/>` +
    `<path d="M40 6 L40 24" stroke="#e8dcc0" stroke-width="1.1"/>` +
    `<path d="M40 24 C40 30 34 30 35.5 26" fill="none" stroke="#adb5bd" stroke-width="1.8" stroke-linecap="round"/>` +
    `<path d="M19 33 L40 6" stroke="#e8dcc0" stroke-width="0.8" opacity="0.8"/>`,
  cubo: (c) =>
    GROUND +
    `<path d="M9 18 C9 2 39 2 39 18" fill="none" stroke="${OUT}" stroke-width="2.4"/>` +
    `<path d="M9 18 L13 40 L35 40 L39 18 Z" fill="${c}" ${S}/>` +
    `<ellipse cx="24" cy="18" rx="15" ry="4.5" fill="#3a3f45" ${S}/>` +
    `<path d="M11.5 26 L36.5 26 M12.6 33 L35.4 33" stroke="${shade(c, 0.7)}" stroke-width="1.6"/>` +
    `<path d="M15 22 L17 37" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" opacity="0.5"/>`,
  abrigo: (c) =>
    GROUND +
    `<path d="M17 6 L24 10 L31 6 L40 11 L44 33 L38 34 L36 22 L36 41 L12 41 L12 22 L10 34 L4 33 L8 11 Z" fill="${c}" ${S}/>` +
    `<path d="M17 6 L24 16 L31 6" fill="${shade(c, 0.75)}" ${S}/>` +
    `<path d="M24 16 L24 41" stroke="${OUT}" stroke-width="1.8"/>` +
    `<circle cx="27" cy="22" r="1.3" fill="#e0a458"/><circle cx="27" cy="28" r="1.3" fill="#e0a458"/><circle cx="27" cy="34" r="1.3" fill="#e0a458"/>` +
    `<path d="M14 30 h6 v5" fill="none" stroke="${shade(c, 0.65)}" stroke-width="1.6" stroke-linejoin="round"/>` +
    `<path d="M14 14 L12 24" stroke="${shade(c, 1.35)}" stroke-width="1.6" stroke-linecap="round"/>`,
  plano_taller: (c) => blueprint(c, EMBLEMS.gear!),
  plano_energia: (c) => blueprint(c, EMBLEMS.bolt!),
  plano_agua: (c) => blueprint(c, EMBLEMS.drop!),
  plano_solar: (c) => blueprint(c, EMBLEMS.sun!),
  plano_enfermeria: (c) => blueprint(c, EMBLEMS.cross!),
  plano_casco: (c) => blueprint(c, EMBLEMS.hull!),
  plano_invernadero: (c) => blueprint(c, EMBLEMS.leaf!),
  plano_motor: (c) => blueprint(c, EMBLEMS.prop!),
};

/** Ilustración genérica para objetos sin dibujo propio (no debería ocurrir: ver tests). */
function fallback(c: string, name: string): string {
  const letter = (name.trim().charAt(0) || '?').toUpperCase();
  return (
    GROUND +
    `<rect x="8" y="8" width="32" height="32" rx="7" fill="${c}" ${S}/>` +
    `<text x="24" y="31" text-anchor="middle" font-family="Nunito, sans-serif" font-weight="900" font-size="20" fill="${OUT}">${letter}</text>`
  );
}

const itemCache = new Map<string, string>();

/** Icono SVG (cadena) de un objeto. */
export function itemIcon(id: string): string {
  const cached = itemCache.get(id);
  if (cached) return cached;
  const def = ITEMS[id];
  const color = def?.color ?? '#8a9399';
  const painter = P[id];
  const out = svg48(painter ? painter(color) : fallback(color, def?.name ?? id));
  itemCache.set(id, out);
  return out;
}

/** ¿Tiene el objeto un dibujo propio? (para los tests). */
export function hasItemIcon(id: string): boolean {
  return !!P[id];
}

/* ------------------------------------------------------------------ */
/* Glifos de línea (24×24, currentColor)                               */
/* ------------------------------------------------------------------ */

const G = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
const F = 'fill="currentColor" stroke="none"';

const GLYPHS: Record<string, string> = {
  // Necesidades
  hunger: `<path ${F} d="M14.5 2.5a7 7 0 0 1 4.9 12c-1.9 1.9-4.5 2.6-6.8 2l-2.9 2.9a2.3 2.3 0 1 1-3.1 3.1 2.3 2.3 0 1 1-3.1-3.1l2.9-2.9c-.6-2.3.1-4.9 2-6.8a7 7 0 0 1 6.1-7.2z"/>`,
  thirst: `<path ${F} d="M12 2.5c3.6 4.7 6.5 8.4 6.5 11.8a6.5 6.5 0 0 1-13 0C5.5 10.9 8.4 7.2 12 2.5z"/>`,
  energy: `<path ${F} d="M13.5 2 4.5 13.5h6.2L9.5 22l9-11.5h-6.2z"/>`,
  health: `<path ${F} d="M12 21s-8.5-5.2-8.5-11.3A4.7 4.7 0 0 1 12 6.8a4.7 4.7 0 0 1 8.5 2.9C20.5 15.8 12 21 12 21z"/>`,
  warmth: `<path ${F} d="M12.5 2c1 3.3 5.5 5.6 5.5 11a6 6 0 0 1-12 0c0-2.6 1.3-4.6 2.8-6 .2 1.9.9 3.2 2.2 3.8-.3-3.4.5-6.3 1.5-8.8z"/>`,
  // Clima y tiempo
  sun: `<circle ${G} cx="12" cy="12" r="4.2"/><path ${G} d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/>`,
  moon: `<path ${G} d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.6 6.6 0 0 0 10.5 10.5z"/>`,
  cloud: `<path ${G} d="M7 18.5h10.5a4 4 0 0 0 .3-8 6 6 0 0 0-11.4 1.4A3.3 3.3 0 0 0 7 18.5z"/>`,
  rain: `<path ${G} d="M7 15h10.5a4 4 0 0 0 .3-8 6 6 0 0 0-11.4 1.4A3.3 3.3 0 0 0 7 15z"/><path ${G} d="M8.5 18l-1 2.5M12.5 18l-1 2.5M16.5 18l-1 2.5"/>`,
  storm: `<path ${G} d="M7 14.5h10.5a4 4 0 0 0 .3-8 6 6 0 0 0-11.4 1.4A3.3 3.3 0 0 0 7 14.5z"/><path ${F} d="M12.8 13.5 9.5 18h2.6l-1 4 3.6-5h-2.6z"/>`,
  fog: `<path ${G} d="M4 9h16M6 13h12M4 17h16M8 21h8"/>`,
  partly: `<path ${G} d="M8.5 4v1.5M3.5 9H5M4.9 5.4 6 6.5M12.2 5.4 11 6.5"/><path ${G} d="M5.6 11.2a3.5 3.5 0 0 1 6.3-3.1"/><path ${G} d="M9 19.5h8.5a3.3 3.3 0 0 0 .3-6.6 5 5 0 0 0-9.6 1.3A2.7 2.7 0 0 0 9 19.5z"/>`,
  wind: `<path ${G} d="M3 8h11a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h7"/>`,
  clock: `<circle ${G} cx="12" cy="12" r="9"/><path ${G} d="M12 7v5l3 2"/>`,
  thermo: `<path ${G} d="M10 4.5a2 2 0 0 1 4 0v9.3a4 4 0 1 1-4 0z"/><path ${G} d="M12 11v5"/>`,
  // Navegación
  anchor: `<circle ${G} cx="12" cy="5" r="2"/><path ${G} d="M12 7v14M8 10h8M4.5 13.5A7.5 7.5 0 0 0 12 21a7.5 7.5 0 0 0 7.5-7.5"/>`,
  compass: `<circle ${G} cx="12" cy="12" r="9"/><path ${F} d="m15.5 8.5-2 5-5 2 2-5z"/>`,
  ship: `<path ${G} d="M3 15h18l-2.5 5h-13zM12 3v12M12 4l6 8h-6M12 7l-4 5h4"/>`,
  map: `<path ${G} d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14M15 6v14"/>`,
  helm: `<circle ${G} cx="12" cy="12" r="6"/><circle ${G} cx="12" cy="12" r="1.8"/><path ${G} d="M12 2v4M12 18v4M2 12h4M18 12h4M4.9 4.9l2.9 2.9M16.2 16.2l2.9 2.9M4.9 19.1l2.9-2.9M16.2 7.8l2.9-2.9"/>`,
  waves: `<path ${G} d="M2 9c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2M2 15c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2"/>`,
  speed: `<path ${G} d="M4 17a8 8 0 1 1 16 0"/><path ${G} d="M12 17l4-5"/>`,
  // Personas y vida
  person: `<circle ${G} cx="12" cy="7" r="3.5"/><path ${G} d="M5 21v-1.5A5.5 5.5 0 0 1 10.5 14h3a5.5 5.5 0 0 1 5.5 5.5V21"/>`,
  people: `<circle ${G} cx="9" cy="8" r="3"/><path ${G} d="M3 20v-1a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v1"/><path ${G} d="M16 5.2a3 3 0 0 1 0 5.6M18.5 14.3A5 5 0 0 1 21 18.6V20"/>`,
  bed: `<path ${G} d="M3 6v13M3 14h18v5M21 14v-2.5a3 3 0 0 0-3-3h-7v5.5"/><circle ${G} cx="7" cy="11" r="1.8"/>`,
  smile: `<circle ${G} cx="12" cy="12" r="9"/><path ${G} d="M8.5 14.5a4.5 4.5 0 0 0 7 0M9 9.5h.01M15 9.5h.01"/>`,
  meh: `<circle ${G} cx="12" cy="12" r="9"/><path ${G} d="M8.5 15h7M9 9.5h.01M15 9.5h.01"/>`,
  frown: `<circle ${G} cx="12" cy="12" r="9"/><path ${G} d="M8.5 16a4.5 4.5 0 0 1 7 0M9 9.5h.01M15 9.5h.01"/>`,
  chat: `<path ${G} d="M4 5h12a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H9l-4 3.5V15H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"/><path ${G} d="M18 9h2a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-1v2.5L16 18h-3"/>`,
  medical: `<rect ${G} x="3" y="6" width="18" height="14" rx="2"/><path ${G} d="M9 6V4h6v2M12 10v6M9 13h6"/>`,
  // Recursos y barco
  power: `<path ${G} d="M13 2 5 13h6l-1 9 8-11h-6z"/>`,
  plug: `<path ${G} d="M9 2v5M15 2v5M6 7h12v4a6 6 0 0 1-12 0zM12 17v5"/>`,
  battery: `<rect ${G} x="2.5" y="7" width="17" height="10" rx="2"/><path ${G} d="M22 10.5v3M6 10.5v3M9.5 10.5v3"/>`,
  tank: `<path ${G} d="M5 6c0-1.7 3.1-3 7-3s7 1.3 7 3v12c0 1.7-3.1 3-7 3s-7-1.3-7-3z"/><path ${G} d="M5 6c0 1.7 3.1 3 7 3s7-1.3 7-3M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3"/>`,
  food: `<path ${G} d="M3 11h18a9 9 0 0 1-18 0zM7 11c0-3 2.5-6 5-6s5 3 5 6"/><path ${G} d="M12 5V3"/>`,
  pot: `<path ${G} d="M4 9h16v8a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3zM2 9h2M20 9h2M9 5.5c0-1 1-1.5 1-2.5M14 5.5c0-1 1-1.5 1-2.5"/>`,
  box: `<path ${G} d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z"/><path ${G} d="M3 7.5 12 12l9-4.5M12 12v9"/>`,
  bag: `<path ${G} d="M6 8h12l1.5 12.5h-15z"/><path ${G} d="M9 8V6a3 3 0 0 1 6 0v2"/>`,
  sprout: `<path ${G} d="M12 21v-9M12 12C12 7.5 8.5 5 4 5c0 4.5 3.5 7 8 7zM12 10c0-3.5 2.8-6 7-6 0 3.5-2.8 6-7 6z"/>`,
  leaf: `<path ${G} d="M5 19C4 10 9 4 20 4c0 11-6 16-15 15zM5 19l9-9"/>`,
  bug: `<rect ${G} x="7" y="7" width="10" height="13" rx="5"/><path ${G} d="M12 7V4M9 4l1 3M15 4l-1 3M3 11h4M17 11h4M3 17h4M17 17h4M12 12v8"/>`,
  fire: `<path ${G} d="M12 21a6 6 0 0 1-6-6c0-3 2-5 3-7 .5 2 1.5 3 2.5 3.5C11 8 12.5 5 15 3c0 3 3 5.5 3 10a6 6 0 0 1-6 8z"/>`,
  drop: `<path ${G} d="M12 3c3.6 4.7 6.5 8.4 6.5 11.8a6.5 6.5 0 0 1-13 0C5.5 11.4 8.4 7.7 12 3z"/>`,
  leak: `<path ${G} d="M10 3c3 4 5.5 7 5.5 10a5.5 5.5 0 0 1-11 0c0-3 2.5-6 5.5-10z"/><path ${G} d="M18 15v2M20 19.5v1.5M17 21v.5"/>`,
  funnel: `<path ${G} d="M3 4h18l-7 8v6l-4 3v-9z"/>`,
  filter: `<path ${G} d="M4 5h16M7 10h10M10 15h4M12 19v2"/>`,
  solar: `<path ${G} d="M4 14 7 4h14l-3 10zM5.5 9h14M10.5 4l-2 10M15.5 4l-2 10M12 14v6M8 20h8"/>`,
  propeller: `<circle ${G} cx="12" cy="12" r="2"/><path ${G} d="M12 10C10 6 10.5 3 12.5 3s2 3.5-.5 7zM13.8 13c4.3-.4 6.8 1.2 5.9 3s-3.9.9-6.2-2.2zM10.2 13c-2.5 3.5-5.4 4.4-6.2 2.6s1.8-3.2 6.2-2.6z"/>`,
  stairs: `<path ${G} d="M3 20h5v-5h5v-5h5V5h3"/>`,
  // Herramientas y acciones
  wrench: `<path ${G} d="M14.7 6.3a4 4 0 0 0 5 5L21 10a5.5 5.5 0 0 1-7.5 6l-6 6a2.1 2.1 0 0 1-3-3l6-6A5.5 5.5 0 0 1 16.5 5.5z"/>`,
  hammer: `<path ${G} d="m14 12-8.5 8.5a2.1 2.1 0 0 1-3-3L11 9"/><path ${G} d="m15 4 6 6-3 3-1.5-1.5L14 14l-4-4 2.5-2.5L11 6z"/>`,
  gear: `<circle ${G} cx="12" cy="12" r="3"/><path ${G} d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>`,
  check: `<path ${G} d="M4.5 12.5l5 5 10-11"/>`,
  close: `<path ${G} d="M6 6l12 12M18 6 6 18"/>`,
  plus: `<path ${G} d="M12 5v14M5 12h14"/>`,
  minus: `<path ${G} d="M5 12h14"/>`,
  lock: `<rect ${G} x="5" y="10.5" width="14" height="10" rx="2"/><path ${G} d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>`,
  book: `<path ${G} d="M4 19.5V5a2 2 0 0 1 2-2h14v15H6a2 2 0 0 0-2 2 2 2 0 0 0 2 2h14"/><path ${G} d="M9 7h7M9 11h5"/>`,
  alert: `<path ${G} d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01"/>`,
  info: `<circle ${G} cx="12" cy="12" r="9"/><path ${G} d="M12 16v-4.5M12 8h.01"/>`,
  star: `<path ${G} d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>`,
  swap: `<path ${G} d="M4 8h14l-3.5-3.5M20 16H6l3.5 3.5"/>`,
  arrow: `<path ${G} d="M5 12h14M13 6l6 6-6 6"/>`,
  back: `<path ${G} d="M19 12H5M11 6l-6 6 6 6"/>`,
  play: `<path ${F} d="M7 4.5v15l12.5-7.5z"/>`,
  save: `<path ${G} d="M5 3h11l4 4v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a1 1 0 0 1 1-2z"/><path ${G} d="M7 3v5h8V3M7 21v-7h10v7"/>`,
  folder: `<path ${G} d="M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2.5h8.5A1.5 1.5 0 0 1 21 9v9.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z"/>`,
  trash: `<path ${G} d="M4 6.5h16M9 6.5V4h6v2.5M6.5 6.5l1 13.5h9l1-13.5M10 10.5v6M14 10.5v6"/>`,
  keyboard: `<rect ${G} x="2" y="6" width="20" height="12" rx="2"/><path ${G} d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>`,
  exit: `<path ${G} d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>`,
  skull: `<path ${G} d="M12 3a8 8 0 0 0-5 14.3V20h10v-2.7A8 8 0 0 0 12 3z"/><circle ${F} cx="9" cy="12" r="1.8"/><circle ${F} cx="15" cy="12" r="1.8"/><path ${G} d="M10 20v-2M14 20v-2"/>`,
  eye: `<path ${G} d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle ${G} cx="12" cy="12" r="3"/>`,
  hand: `<path ${G} d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12M11 11V4a1.5 1.5 0 0 1 3 0v7M14 11V5.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-.5a6 6 0 0 1-5-2.7L3 15.5a1.6 1.6 0 0 1 2.6-1.8L8 16"/>`,
  shirt: `<path ${G} d="M8 3 4 5.5 2.5 11l3 1V21h13v-9l3-1L20 5.5 16 3a4 4 0 0 1-8 0z"/>`,
  // Eventos
  island: `<path ${G} d="M2 20c3-3 6-4 10-4s7 1 10 4"/><path ${G} d="M12 16V8M12 8C10 5 6.5 5 5 6.5M12 8c2-3 5.5-3 7-1.5M12 8c-1.2-2.8-.8-4.5 1-5.5M12 8c2.3-1.7 4.2-1.5 5.5 0"/>`,
  wreck: `<path ${G} d="M3 13l12 4.5-1.5 3.5H6.5zM9 15V5l7 7M13 20.5c2 0 2.5 1 4.5 1s2.5-1 4.5-1"/>`,
  lifebuoy: `<circle ${G} cx="12" cy="12" r="9"/><circle ${G} cx="12" cy="12" r="4"/><path ${G} d="M5.6 5.6l3.6 3.6M14.8 14.8l3.6 3.6M18.4 5.6l-3.6 3.6M9.2 14.8l-3.6 3.6"/>`,
  fish: `<path ${G} d="M2.5 12c3-5 9-6.5 14 0-5 6.5-11 5-14 0zM16.5 12l5-4v8z"/><path ${F} d="M7 11h.01"/>`,
  merchant: `<path ${G} d="M3 15h18l-2.5 5h-13zM7 15V7h10v8M7 7l5-4 5 4M10 11h4"/>`,
  tower: `<path ${G} d="M9 21 10 8h4l1 13zM8 8h8M10.5 8V5h3v3M7 4.5 5 3.5M17 4.5l2-1M7 7 4.5 7.5M17 7l2.5.5M6 21h12"/>`,
  sick: `<circle ${G} cx="12" cy="12" r="9"/><path ${G} d="M8 9.5l2 1M16 9.5l-2 1M8.5 16c1-1 2-1.4 3.5-1.4s2.5.4 3.5 1.4"/>`,
};

const glyphCache = new Map<string, string>();

/** Pictograma de línea (24×24, hereda el color del texto). */
export function glyph(name: string): string {
  const cached = glyphCache.get(name);
  if (cached) return cached;
  const body = GLYPHS[name] ?? GLYPHS['info']!;
  const out = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">${body}</svg>`;
  glyphCache.set(name, out);
  return out;
}

export function hasGlyph(name: string): boolean {
  return !!GLYPHS[name];
}

export const GLYPH_NAMES = Object.keys(GLYPHS);

/** Glifo de cada tipo de módulo (cabeceras de paneles, listas). */
export const MODULE_GLYPH: Record<string, string> = {
  camarote: 'bed',
  dormitorio: 'bed',
  cocina: 'pot',
  comedor: 'food',
  almacen: 'box',
  banco_trabajo: 'hammer',
  taller: 'gear',
  huerto: 'sprout',
  colector: 'funnel',
  deposito: 'tank',
  potabilizadora: 'filter',
  generador: 'power',
  bateria: 'battery',
  panel_solar: 'solar',
  enfermeria: 'medical',
  motor: 'propeller',
  escalera: 'stairs',
  puente: 'helm',
};

/** Glifo de cada tipo de evento del mundo. */
export const EVENT_GLYPH: Record<string, string> = {
  tormenta: 'storm',
  naufragio: 'wreck',
  isla: 'island',
  naufragos: 'lifebuoy',
  averia: 'wrench',
  incendio: 'fire',
  banco_peces: 'fish',
  mercante: 'merchant',
  plaga: 'bug',
  fuga: 'leak',
  enfermedad: 'sick',
  discusion: 'chat',
  estructura: 'tower',
};

/** Glifo del clima. */
export const WEATHER_GLYPH: Record<string, string> = {
  despejado: 'sun',
  nublado: 'cloud',
  lluvia: 'rain',
  tormenta: 'storm',
  niebla: 'fog',
};
