// Character customisation: recolour the baked player frames by swapping
// palette ramps, then cache the result as one offscreen sheet.

export const SKIN_TONES = [
  { n: 'Palida',  r: ['a86a55', 'cf9078', 'efbfa2', 'fce4cd'] },
  { n: 'Clara',   r: ['8f5a3e', 'b87d58', 'e0ab82', 'f8d8b4'] },
  { n: 'Trigo',   r: ['7a4a2c', 'a06845', 'cf9464', 'eec298'] },
  { n: 'Bronce',  r: ['5a3520', '7d4d2c', 'a67244', 'c99a68'] },
  { n: 'Caoba',   r: ['46281a', '653c25', '8c5836', 'b07d54'] },
  { n: 'Ebano',   r: ['2c1a12', '44281a', '5f3b27', '82573c'] },
];

export const HAIR_COLORS = [
  { n: 'Negro',   r: ['0d0a08', '1a1512', '2b2420', '463c34'] },
  { n: 'Castano', r: ['1d110a', '2e1c12', '4a2e1c', '71492b'] },
  { n: 'Rubio',   r: ['6b4f18', '9a7526', 'c9a344', 'ecd07a'] },
  { n: 'Rojizo',  r: ['4a1d0c', '7a3312', 'a85423', 'd08447'] },
  { n: 'Ceniza',  r: ['2e2e34', '4a4a54', '70707c', '9b9ba8'] },
  { n: 'Blanco',  r: ['70707c', '9b9ba8', 'c4c4d0', 'ecedf5'] },
];

export const CLOAK_COLORS = [
  { n: 'Carmesi', r: ['4e1a1c', '7a2f2c', 'b04a38', 'd97a4e'] },
  { n: 'Bosque',  r: ['1b3a24', '2b5c36', '3f8049', '5da765'] },
  { n: 'Zafiro',  r: ['16294e', '24417a', '3661a8', '5b8ed0'] },
  { n: 'Violeta', r: ['361a4a', '552b75', '7a44a0', 'a06fc4'] },
  { n: 'Carbon',  r: ['16161c', '26262f', '3d3d48', '5a5a68'] },
  { n: 'Ambar',   r: ['5e3608', '8c5410', 'bd7a1e', 'e0a63f'] },
];

export const TUNIC_COLORS = [
  { n: 'Lino',    r: ['9a7c46', 'c8a86a', 'e6cf98', 'f9f0cc'] },
  { n: 'Salvia',  r: ['4c5f3e', '6b8256', '8aa672', 'aec48f'] },
  { n: 'Pizarra', r: ['33384a', '4a5166', '6a7288', '929cb0'] },
  { n: 'Herrumbre', r: ['6b3520', '8f4d2c', 'b56f45', 'd49668'] },
  { n: 'Crudo',   r: ['7a7060', 'a2988a', 'c8bfb0', 'e8e2d6'] },
];
export const PANTS_COLORS = [
  { n: 'Indigo',  r: ['1e2030', '2f3040', '43455c', '5b5e78'] },
  { n: 'Cuero',   r: ['2e1d10', '462d1a', '634226', '855d38'] },
  { n: 'Musgo',   r: ['1f2a1a', '32422a', '4a5e3c', '677e55'] },
  { n: 'Gris',    r: ['232329', '363640', '50505e', '70707f'] },
];

export const CLASSES = [
  {
    id: 'ranger', n: 'EXPLORADOR',
    desc: 'Veloz y resistente. Ve mas lejos.',
    perks: ['+15% velocidad', '+20 vigor maximo', 'vision ampliada'],
    apply: (s, p) => { p.speed *= 1.15; s.maxStamina += 20; s.viewBonus = 1; },
  },
  {
    id: 'scholar', n: 'ERUDITO',
    desc: 'Descifra ruinas y halla mas reliquias.',
    perks: ['+1 reliquia por cofre', 'santuarios dan mas vigor', 'mapa mas amplio'],
    apply: (s, p) => { s.relicBonus = 1; s.shrineBonus = 6; s.mapBonus = 1; },
  },
  {
    id: 'forager', n: 'RECOLECTOR',
    desc: 'Obtiene mas de cada recurso.',
    perks: ['+1 por recoleccion', 'recupera vigor al recoger', 'mas bayas'],
    apply: (s, p) => { s.gatherBonus = 1; s.gatherStamina = 4; },
  },
];

const HEX = h => [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];

/** Build a recoloured copy of every player frame for the chosen look. */
export function buildPlayerSheet(atlas, pal, look) {
  const names = [];
  for (const act of ['idle', 'walk']) {
    for (const d of ['s', 'w', 'n', 'e']) {
      const n = act === 'idle' ? 1 : 4;
      for (let i = 0; i < n; i++) names.push(`player${look.hair}_${act}_${d}_${i}`);
    }
  }
  // map source colour -> replacement
  const swap = new Map();
  const add = (fromArr, toArr) => {
    for (let i = 0; i < fromArr.length; i++) {
      const f = HEX(fromArr[i]), t = HEX(toArr[i]);
      swap.set((f[0] << 16) | (f[1] << 8) | f[2], t);
    }
  };
  add(pal.skin, SKIN_TONES[look.skin].r);
  add(pal.hair, HAIR_COLORS[look.hairCol].r);
  add(pal.cloak, CLOAK_COLORS[look.cloak].r);
  add(pal.tunic, TUNIC_COLORS[look.tunic].r);
  add(pal.pants, PANTS_COLORS[look.pants].r);

  // pack frames into one sheet
  let W = 0, Hm = 0;
  const src = [];
  for (const n of names) {
    const f = atlas.idx[n];
    if (!f) continue;
    src.push([n, f]);
    W += f[2]; Hm = Math.max(Hm, f[3]);
  }
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, W); cv.height = Math.max(1, Hm);
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingEnabled = false;
  const index = {};
  let x = 0;
  for (const [n, f] of src) {
    g.drawImage(atlas.img, f[0], f[1], f[2], f[3], x, 0, f[2], f[3]);
    index[n] = [x, 0, f[2], f[3]];
    x += f[2];
  }
  // recolour in place
  const id = g.getImageData(0, 0, cv.width, cv.height);
  const d = id.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const key = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
    const t = swap.get(key);
    if (t) { d[i] = t[0]; d[i + 1] = t[1]; d[i + 2] = t[2]; }
  }
  g.putImageData(id, 0, 0);
  return { canvas: cv, index };
}

export function defaultLook() {
  return { skin: 1, hair: 0, hairCol: 1, cloak: 0, tunic: 0, pants: 0, cls: 0, name: '' };
}

export function randomLook() {
  const R = n => (Math.random() * n) | 0;
  return {
    skin: R(SKIN_TONES.length), hair: R(3), hairCol: R(HAIR_COLORS.length),
    cloak: R(CLOAK_COLORS.length), tunic: R(TUNIC_COLORS.length),
    pants: R(PANTS_COLORS.length), cls: R(CLASSES.length), name: '',
  };
}
