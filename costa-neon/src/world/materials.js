// Biblioteca de materiales PBR parcheados (fachadas con interior mapping, calles, veredas, terreno, follaje).
import * as THREE from 'three';
import { U, patchMaterial, GLSL_WORLD_TO_VIEW_NORMAL } from './shaders.js';
import { GLSL_ARRAY_SAMPLING, DETAIL, GROUND } from './textures.js';
import { GLSL_PLANAR } from './reflection.js';

const f = (n) => (Number.isInteger(n) ? n.toFixed(1) : String(n));

export const FACADE_STYLES = {
  glass: { cw: 3.2, fh: 3.9, wx0: 0.02, wx1: 0.98, wy0: 0.27, wy1: 0.975, top: 2.4, detail: DETAIL.CONCRETE, tile: 3, depth: 1.0, flags: ['TINTED', 'MULLION'] },
  round: { cw: 3.0, fh: 3.9, wx0: 0.03, wx1: 0.97, wy0: 0.27, wy1: 0.975, top: 2.4, detail: DETAIL.CONCRETE, tile: 3, depth: 1.0, flags: ['TINTED', 'ROUND', 'MULLION'] },
  office: { cw: 3.0, fh: 3.6, wx0: 0.18, wx1: 0.82, wy0: 0.3, wy1: 0.86, top: 1.6, detail: DETAIL.CONCRETE, tile: 3, depth: 1.25, flags: ['LEDGE', 'MULLION'] },
  brick: { cw: 2.7, fh: 3.3, wx0: 0.27, wx1: 0.73, wy0: 0.27, wy1: 0.8, top: 1.2, detail: DETAIL.BRICK, tile: 1.2, depth: 1.1, flags: ['LINTEL'] },
  pastel: { cw: 3.4, fh: 3.2, wx0: 0.12, wx1: 0.88, wy0: 0.33, wy1: 0.87, top: 1.4, detail: DETAIL.STUCCO, tile: 3, depth: 1.2, flags: ['BALCONY', 'MULLION'] },
  shop: { cw: 2.8, fh: 3.5, wx0: 0.2, wx1: 0.8, wy0: 0.3, wy1: 0.82, top: 1.2, detail: DETAIL.STUCCO, tile: 3, depth: 1.1, flags: ['STOREFRONT', 'LEDGE'] },
  house: { cw: 3.6, fh: 3.0, wx0: 0.3, wx1: 0.7, wy0: 0.3, wy1: 0.78, top: 0.45, detail: DETAIL.STUCCO, tile: 3, depth: 0.9, flags: ['SPARSE'] },
  warehouse: { cw: 6.0, fh: 4.6, wx0: 0.1, wx1: 0.9, wy0: 0.0, wy1: 0.0, top: 0.5, detail: DETAIL.METAL, tile: 2, depth: 1.0, flags: ['WAREHOUSE'] },
};

const FACADE_HEAD = /* glsl */ `
uniform sampler2DArray uDA; uniform sampler2DArray uDN;
uniform sampler2DArray uGA; uniform sampler2DArray uGN;
varying float vSeed; varying vec4 vMeta; varying vec3 vBC; varying vec3 vBS;
${GLSL_ARRAY_SAMPLING}
${GLSL_WORLD_TO_VIEW_NORMAL}
vec3 lightTemp(float h){
  if (h < .55) return vec3(1.0, .7, .43);
  if (h < .8) return vec3(1.0, .85, .68);
  if (h < .93) return vec3(.8, .89, 1.0);
  return vec3(.45, .62, 1.0);
}
vec3 roomColor(vec2 cf, vec3 vt, float cw, float fh, float depthM, float seed, vec3 light){
  vec3 ro = vec3(cf, 0.);
  vec3 rd = vec3(vt.x / cw, vt.y / fh, max(vt.z, 1e-3) / depthM);
  vec3 srd = vec3(abs(rd.x) < 1e-5 ? 1e-5 : rd.x, abs(rd.y) < 1e-5 ? 1e-5 : rd.y, rd.z);
  vec3 tp;
  tp.x = ((srd.x > 0. ? 1. : 0.) - ro.x) / srd.x;
  tp.y = ((srd.y > 0. ? 1. : 0.) - ro.y) / srd.y;
  tp.z = (1. - ro.z) / srd.z;
  float t = min(min(tp.x, tp.y), tp.z);
  vec3 hp = ro + srd * t;
  float h1 = hash11(seed * 13.7), h2 = hash11(seed * 7.1 + 3.), h3 = hash11(seed * 3.3 + 9.);
  vec3 wallC = mix(vec3(.8, .75, .66), vec3(.62, .7, .75), h1) * (.78 + .3 * h2);
  vec3 floorC = mix(vec3(.3, .2, .12), vec3(.46, .43, .4), h2);
  vec3 c; float sh;
  if (t == tp.z) {
    c = wallC * .92; sh = .85;
    vec2 q = hp.xy - vec2(.3 + .4 * h3, .58);
    if (abs(q.x) < .13 && abs(q.y) < .11) c = mix(vec3(.15, .25, .45), vec3(.6, .32, .2), h1);
  } else if (t == tp.y) {
    if (srd.y < 0.) { c = floorC; sh = .7; }
    else { c = vec3(.85); sh = 1.05; c += light * smoothstep(.2, .0, length(hp.xz - vec2(.5, .45))) * 1.6; }
  } else { c = wallC * .8; sh = .74; }
  sh *= mix(1., .5, clamp(hp.z, 0., 1.));
  // mueble bajo (sofá / escritorio)
  vec3 bmin = vec3(.12 + .25 * h2, 0., .5), bmax = vec3(.55 + .3 * h2, .3 + .14 * h3, .86);
  vec3 inv = 1. / srd; vec3 t0 = (bmin - ro) * inv, t1 = (bmax - ro) * inv;
  vec3 tmn = min(t0, t1), tmx = max(t0, t1);
  float tn = max(max(tmn.x, tmn.y), tmn.z), tf = min(min(tmx.x, tmx.y), tmx.z);
  if (tn < tf && tn > 0. && tn < t) { c = mix(vec3(.1, .09, .08), vec3(.38, .22, .16), h3); sh = .55; }
  return c * sh;
}
`;

const FACADE_FRAG = /* glsl */ `
vec3 fN = normalize(vWNrm);
float fGlass = 0.;
vec3 fEmit = vec3(0.);
vec3 fNW = fN;
float fRough = .85, fMetal = 0.;
vec3 base = diffuseColor.rgb;
vec3 alb = base;
float wallF = 1. - step(.55, abs(fN.y));
// Coordenadas de fachada, derivadas y muestras fuera de las ramas (derivadas estables)
vec3 T; float u; float facW;
#ifdef ROUND
  vec2 rel0 = vWPos.xz - vBC.xz; float R = vBS.x * .5;
  float ang = atan(rel0.y, rel0.x);
  u = (ang + 3.14159265) * R; facW = 6.2831853 * R;
  if (wallF > .5) fN = normalize(vec3(rel0.x, 0., rel0.y));
  T = vec3(-fN.z, 0., fN.x);
#else
  bool alongZ = abs(fN.x) > .5;
  facW = alongZ ? vBS.z : vBS.x;
  u = alongZ ? (vWPos.z - (vBC.z - vBS.z * .5)) : (vWPos.x - (vBC.x - vBS.x * .5));
  T = normalize(cross(vec3(0., 1., 0.), fN) + vec3(1e-5, 0., 0.));
#endif
float v = vWPos.y - vBC.y; float Hh = vBS.y;
vec2 duv = vec2(u, v) / DTILE + vSeed * 7.;
vec4 dA = sampleAlb(uDA, duv, DLAYER);
vec4 dN = sampleNrm(uDN, duv, DLAYER);
float colsG = max(1., floor(facW / CW + .5));
vec2 cuv = vec2(u / (facW / colsG), v / FH);
vec2 fw = fwidth(cuv);
vec4 gRoofA = sampleAlb(uGA, vWPos.xz / 3., 6.);
if (wallF > .5) {
  float faceId = dot(step(0., fN.xz), vec2(1., 2.)) + (abs(fN.x) > .5 ? 0. : 4.);
  alb = base * dA.rgb;
  fRough = dA.a;
  fNW = normalize(T * dN.x * .7 + vec3(0., 1., 0.) * dN.y * .7 + fN * dN.z);
  alb *= mix(.68, 1., smoothstep(0., 1.4, v));
  alb *= .9 + .1 * fbm3(vec2(u * .04, v * .015) + vSeed * 30.);
  // manchas verticales de escurrimiento
  alb *= 1. - .08 * smoothstep(.6, .9, vnoise(vec2(u * 1.3, v * .05 + vSeed * 9.)));

  float cols = colsG;
  float cw = facW / cols;
  float floors = max(1., floor((Hh - TOPM) / FH));
  vec2 cid = floor(cuv);
  vec2 cf = fract(cuv);
  float inGrid = step(0., v) * step(cid.y, floors - 1.) * step(0., cid.x) * step(cid.x, cols - 1.);
  float lod = smoothstep(.2, .5, max(fw.x, fw.y));

  float wx0 = WX0, wx1 = WX1, wy0 = WY0, wy1 = WY1;
  #ifdef STOREFRONT
    if (cid.y < .5) { wx0 = .04; wx1 = .96; wy0 = .05; wy1 = .8; }
  #endif
  #if defined(TINTED) || defined(LEDGE)
    if (cid.y < .5) { wy0 = .04; wy1 = .9; }
  #endif
  float roomSeed = hash13(vec3(cid, faceId + vSeed * 97.));
  float hasWin = inGrid;
  float isDoor = 0.;
  #ifdef SPARSE
    hasWin *= step(.3, hash12(vec2(cid.x + faceId * 11., cid.y * 3. + vSeed * 50.)));
    if (cid.y < .5 && abs(cid.x - floor(cols * .5)) < .5) { isDoor = 1.; hasWin = 0.; }
  #endif
  #ifdef WAREHOUSE
    hasWin = 0.;
  #endif
  vec2 aa = max(fw * 1.2, vec2(1e-4));
  float wmx = smoothstep(wx0 - aa.x, wx0 + aa.x, cf.x) * (1. - smoothstep(wx1 - aa.x, wx1 + aa.x, cf.x));
  float wmy = smoothstep(wy0 - aa.y, wy0 + aa.y, cf.y) * (1. - smoothstep(wy1 - aa.y, wy1 + aa.y, cf.y));
  float win = wmx * wmy * hasWin;
  float fwx = .055 * (2.6 / cw), fwy = .05;
  #ifdef TINTED
    fwx = .03; fwy = .025;
  #endif
  float ix = smoothstep(wx0 + fwx - aa.x, wx0 + fwx + aa.x, cf.x) * (1. - smoothstep(wx1 - fwx - aa.x, wx1 - fwx + aa.x, cf.x));
  float iy = smoothstep(wy0 + fwy - aa.y, wy0 + fwy + aa.y, cf.y) * (1. - smoothstep(wy1 - fwy - aa.y, wy1 - fwy + aa.y, cf.y));
  float glass = ix * iy * hasWin;
  #ifdef MULLION
    if ((wx1 - wx0) * cw > 1.9) glass *= smoothstep(.012, .012 + aa.x, abs(cf.x - .5));
  #endif
  float frame = clamp(win - glass, 0., 1.);

  // Interior
  vec3 vd = normalize(vWPos - cameraPosition);
  vec3 vt = vec3(dot(vd, T), vd.y, -dot(vd, fN));
  float litFrac = uLitWindows;
  #ifdef TINTED
    litFrac *= .5;
  #endif
  float lit = step(1. - litFrac, hash11(roomSeed * 41.3));
  float lh = hash11(roomSeed * 17.9);
  vec3 lc = lightTemp(lh);
  float lightLvl = lit * (1.1 + .9 * hash11(roomSeed * 5.1));
  if (lh > .93) lightLvl *= .45 + .55 * abs(sin(uTime * (6. + 9. * hash11(roomSeed)))) * (.6 + .4 * sin(uTime * 2.3 + roomSeed * 20.));
  #ifdef STOREFRONT
    if (cid.y < .5) { lightLvl = .75; lc = vec3(1., .9, .76); }
  #endif
  #if defined(TINTED) || defined(LEDGE)
    if (cid.y < .5) { lightLvl = max(lightLvl, 1.5); lc = vec3(1., .92, .8); }
  #endif
  if (vMeta.x > .5 && cid.y >= floors - 2.) { lightLvl = 2.4; lc = vMeta.x > 1.5 ? vec3(.55, .88, 1.) : vec3(1., .95, .86); }
  vec3 room = roomColor(cf, vt, cw, FH, DEPTHM * cw, roomSeed, lc);
  vec3 interiorL = lc * lightLvl * .7 * uNight + vec3(.85, .92, 1.) * uInteriorDay;
  vec3 interior = room * interiorL;
  vec2 wq = vec2((cf.x - wx0) / max(wx1 - wx0, .01), (cf.y - wy0) / max(wy1 - wy0, .01));
  float cur = hash11(roomSeed * 3.7);
  if (cur < .28) {
    float cw2 = .16 + .26 * hash11(roomSeed * 9.1);
    float cm = clamp(step(wq.x, cw2) + step(1. - cw2, wq.x), 0., 1.);
    vec3 cc = mix(vec3(.86, .8, .7), vec3(.62, .36, .3), hash11(roomSeed * 2.2));
    float fold = sin(wq.x * 38.);
    cc *= .88 + .12 * fold * (1. - smoothstep(.02, .06, fw.x * 38. / max(wx1 - wx0, .1)));
    interior = mix(interior, cc * (lc * lightLvl * uNight * .65 + uInteriorDay * 1.3), cm);
  } else if (cur < .44) {
    float down = .25 + .65 * hash11(roomSeed * 4.4);
    float sq = wq.y * 12.;
    float sw = max(fw.y * 12. / max(wy1 - wy0, .1), 1e-3);
    float slat = mix(.55, smoothstep(.45 - sw, .45 + sw, fract(sq)), 1. - smoothstep(.15, .45, sw));
    float bm = step(1. - down, wq.y);
    interior = mix(interior, vec3(.82, .8, .74) * (lc * lightLvl * uNight * .5 + uInteriorDay * 1.1) * (.7 + .3 * slat), bm);
  }
  interior *= .5 + .5 * smoothstep(0., .14, 1. - wq.y);
  #ifdef TINTED
    interior *= mix(.3, .7, uNight);
  #endif
  // promedio lejano
  float gAvg = (wx1 - wx0) * (wy1 - wy0) * .82 * inGrid;
  #ifdef SPARSE
    gAvg *= .7;
  #endif
  #ifdef WAREHOUSE
    gAvg = 0.;
  #endif
  float floorLit = step(1. - litFrac * 1.15, hash12(vec2(cid.y * 1.37 + faceId * 3.1, vSeed * 71.)));
  float cellLit = step(1. - litFrac, hash12(cid + vec2(faceId * 17., vSeed * 33.)));
  float litMix = mix(cellLit, .2 + .9 * floorLit, smoothstep(.5, 1.2, max(fw.x, fw.y)));
  vec3 avgInt = (vec3(1., .82, .62) * litMix * 1.15 * uNight + vec3(.85, .92, 1.) * uInteriorDay) * .5;
  #ifdef TINTED
    avgInt *= mix(.35, .7, uNight);
  #endif
  fGlass = mix(glass, gAvg, lod);
  fEmit = mix(interior * glass, avgInt * gAvg, lod);
  float nd = 1. - lod;
  alb = mix(alb, vec3(.07, .075, .08), frame * nd);
  fRough = mix(fRough, .4, frame * nd);
  fMetal = mix(fMetal, .5, frame * nd);

  #ifdef LEDGE
    float sill = step(wy0 - .055, cf.y) * step(cf.y, wy0) * step(wx0 - .03, cf.x) * step(cf.x, wx1 + .03) * hasWin * nd;
    alb = mix(alb, alb * 1.25 + .05, sill);
    fNW = normalize(mix(fNW, normalize(fN + vec3(0., 1.3, 0.)), sill * step(wy0 - .02, cf.y)));
  #endif
  #ifdef LINTEL
    float st = (step(wy1, cf.y) * step(cf.y, wy1 + .07) + step(wy0 - .05, cf.y) * step(cf.y, wy0)) * step(wx0 - .04, cf.x) * step(cf.x, wx1 + .04) * hasWin * nd;
    alb = mix(alb, vec3(.72, .69, .63) * dA.rgb * 1.1, st);
  #endif
  #ifdef BALCONY
    if (cid.y > .5 && inGrid > .5) {
      float slab = step(cf.y, .07) * nd;
      alb = mix(alb, vec3(.86, .85, .82), slab);
      fNW = normalize(mix(fNW, normalize(fN + vec3(0., 1.2, 0.)), slab));
      float rail = step(.07, cf.y) * step(cf.y, .34) * wmx;
      float bars = smoothstep(.35, .5, abs(fract(u * 7.) - .5) * 2.) * rail * nd;
      float topBar = step(.315, cf.y) * step(cf.y, .34) * rail * nd;
      alb = mix(alb, vec3(.12), max(bars * .85, topBar));
      fGlass *= 1. - max(bars, topBar);
      fEmit *= 1. - max(bars, topBar);
    }
  #endif
  #ifdef TINTED
    // antepecho de vidrio opaco
    float spd = step(cf.y, wy0) * inGrid * nd;
    alb = mix(alb, base * .32, spd);
    fRough = mix(fRough, .28, spd);
    fMetal = mix(fMetal, .6, spd);
    fNW = mix(fNW, fN, spd);
  #endif
  #ifdef WAREHOUSE
    // banda de ventanas altas y portones
    float cl = step(Hh - 2.6, v) * step(v, Hh - 1.1);
    float pane = smoothstep(.04, .06, abs(fract(u / 1.5) - .5) * 2.) ;
    float gl = cl * (1. - pane * .0) * step(.08, abs(fract(u / 1.5) - .5) * 2.);
    vec3 wint = vec3(.9, .95, 1.) * uInteriorDay * .6 + vec3(1., .85, .6) * uNight * uLitWindows * 1.4;
    fGlass = mix(fGlass, gl * .9, nd);
    fEmit += wint * gl * .9 * nd;
    float doorCell = step(.55, hash12(vec2(floor(u / 6.5) + faceId * 7., vSeed * 31.)));
    float dx = fract(u / 6.5);
    float door = doorCell * step(.12, dx) * step(dx, .88) * step(v, 4.6) * nd;
    float slats = .75 + .25 * step(.5, fract(v * 3.3));
    alb = mix(alb, vec3(.42, .44, .46) * slats, door);
    fRough = mix(fRough, .55, door);
  #endif
  if (isDoor > .5) {
    float dm = step(.36, cf.x) * step(cf.x, .64) * step(cf.y, .74) * nd;
    alb = mix(alb, vec3(.2, .12, .07), dm);
  }
  // Pretil superior
  float cap = step(Hh - .35, v);
  alb = mix(alb, alb * .8 + .12, cap);
  #ifdef TINTED
    vec3 glassAlb = base * .55;
    float glassMetal = .55;
  #else
    vec3 glassAlb = vec3(.025);
    float glassMetal = 0.;
  #endif
  alb = mix(alb, glassAlb, fGlass);
  fRough = mix(fRough, .035, fGlass);
  fMetal = mix(fMetal, glassMetal, fGlass);
  fNW = normalize(mix(fNW, fN, fGlass));
  alb *= mix(1., .72, uWet * (1. - fGlass));
} else if (fN.y > .5) {
  alb = vec3(.36, .36, .35) * gRoofA.rgb * 2.6 * (.85 + .3 * hash11(vSeed * 91.));
  fRough = gRoofA.a;
  vec2 rel = abs(vWPos.xz - vBC.xz) - vBS.xz * .5 + .5;
  float edge = step(0., max(rel.x, rel.y));
  alb = mix(alb, vec3(.5, .49, .47), edge);
  if (vMeta.y > 1.5) {
    vec2 p = vWPos.xz - vBC.xz; float r = length(p);
    alb = mix(alb, vec3(.09, .1, .1), step(r, 8.) * .8);
    float ring = 1. - smoothstep(.2, .3, abs(r - 6.6));
    alb = mix(alb, vec3(.95, .78, .1), ring);
    float hx = step(abs(p.x), 2.2) * step(abs(p.y), 3.) * clamp(step(1.45, abs(p.x)) + step(abs(p.y), .35), 0., 1.);
    alb = mix(alb, vec3(.92), hx);
  }
  alb *= mix(1., .65, uWet);
  fRough = mix(fRough, .2, uWet * .8);
} else {
  alb *= .3;
}
diffuseColor.rgb = alb;
`;

const FACADE_EMISSIVE = /* glsl */ `
totalEmissiveRadiance += fEmit;
totalEmissiveRadiance += alb * LAMP_COLOR * streetLamps(vWPos) * uLamps * .8 * (1. - fGlass) * wallF;
`;

// ---------------------------------------------------------------------------
const ROAD_HEAD = /* glsl */ `
uniform sampler2DArray uGA; uniform sampler2DArray uGN;
${GLSL_ARRAY_SAMPLING}
${GLSL_WORLD_TO_VIEW_NORMAL}
float lineAA(float d, float w){ float a = max(fwidth(d) * 1.2, 1e-4); return 1. - smoothstep(w - a, w + a, abs(d)); }
float cnGGX(float NoH, float a){ float a2 = a * a; float d = NoH * NoH * (a2 - 1.) + 1.; return a2 / (3.14159 * d * d); }
// Faroles: difuso + especular (charcos)
vec2 lampDS(vec3 wp, vec3 V, float rough){
  vec2 acc = vec2(0.);
  float lx = floor((wp.x - L_ORIGIN) / L_CELL + .5) * L_CELL + L_ORIGIN;
  float lz = floor((wp.z - L_ORIGIN) / L_CELL + .5) * L_CELL + L_ORIGIN;
  float a = max(rough * rough, .02);
  float sy = L_H + .2;
  for (int k = 0; k < 2; k++){
    bool vertical = k == 0;
    float line = vertical ? lx : lz;
    float off = vertical ? wp.x - lx : wp.z - lz;
    if (abs(off) > 34.) continue;
    if (vertical ? !roadV(lx, wp.z) : !roadH(lz, wp.x)) continue;
    float kk = floor(((vertical ? wp.z : wp.x) - L_ORIGIN) / L_SP);
    for (int s = -1; s < 3; s++){
      float n = kk + float(s);
      if (mod(n, 4.) < .5) continue;
      float alongP = L_ORIGIN + n * L_SP;
      for (int side = 0; side < 2; side++){
        float o = side == 0 ? -L_OFF : L_OFF;
        vec3 lp = vertical ? vec3(line + o, sy, alongP) : vec3(alongP, sy, line + o);
        vec3 d = lp - wp;
        float r2 = dot(d, d);
        vec3 L = d / sqrt(r2);
        vec3 Hv = normalize(L + V);
        float fall = (L_H * L_H) / (r2 + .6);
        acc.x += pow(max(L.y, 0.), 3.5) * fall;
        acc.y += cnGGX(max(Hv.y, 0.), a) * L.y * fall * .25;
      }
    }
  }
  return acc;
}
float rippleField(vec2 p, float t){
  float acc = 0.;
  for (int k = 0; k < 2; k++){
    vec2 q = p * (2.2 + float(k) * .7) + float(k) * 13.1;
    vec2 i = floor(q); vec2 fq = fract(q) - .5;
    float h = hash12(i + float(k) * 7.);
    float tt = fract(t * (.8 + .4 * h) + h);
    vec2 off = (hash22(i) - .5) * .5;
    float r = length(fq - off);
    acc += exp(-pow((r - tt * .45) * 26., 2.)) * (1. - tt);
  }
  return acc;
}
`;

const ROAD_FRAG = /* glsl */ `
vec2 p = vWPos.xz;
vec2 uv = p / 5.0;
vec4 aA = sampleAlb(uGA, uv, 0.);
vec4 aB = sampleAlb(uGA, vec2(uv.y, -uv.x) * .43 + 3.7, 0.);
float mv = fbm3(p * .012);
float mv2 = vnoise(p * .21);
vec3 alb = mix(aA.rgb, aB.rgb, .38) * (.8 + .34 * mv) * (.94 + .1 * mv2);
float rough = mix(aA.a, aB.a, .38);
vec4 nA = sampleNrm(uGN, uv, 0.);
vec3 nW = normalize(vec3(nA.x, nA.z, -nA.y));
float hgt = sampleHgt(uGN, uv, 0.);
// parches de reparación
{
  vec2 pc = floor(p / vec2(9., 4.)); float ph = hash12(pc + 13.);
  vec2 fp = fract(p / vec2(9., 4.));
  float m = step(.88, ph) * step(.12, fp.x) * step(fp.x, .86) * step(.2, fp.y) * step(fp.y, .8);
  alb *= mix(1., .7, m); rough = mix(rough, .8, m);
}
float paint = 0.; vec3 paintCol = vec3(.8);
vec2 g = floor((p + 480.) / 80. + .5) * 80. - 480.;
vec2 d = p - g;
bool bridge = p.x > 488. && p.x < 800. && abs(p.y + 160.) < 9.5;
bool island = p.x > 790.;
bool inV = abs(d.x) < 8. && !bridge;
bool inH = abs(d.y) < 8.;
if (bridge) { inH = true; d.y = p.y + 160.; }
// Distancias y máscaras de línea calculadas sin ramas (derivadas estables)
float lat = inV ? d.x : d.y;
float along = inV ? p.y : p.x;
float ylM = lineAA(abs(lat) - .2, .065);
float wlM = lineAA(abs(lat) - 4., .07);
float elM = lineAA(abs(lat) - 7.5, .09);
if (inV != inH) {
  float dInt = inV ? abs(d.y) : abs(d.x);
  if (bridge) dInt = 100.;
  float yl = ylM;
  float dash = step(fract(along / 9.), .42);
  float wl = wlM * dash;
  float el = elM;
  float cwk = 0.;
  if (dInt > 9. && dInt < 13.) cwk = step(fract((lat + 8.) / 1.15), .55) * step(abs(lat), 7.3);
  // línea de detención sobre los carriles que llegan al cruce (lado derecho del conductor)
  float stopL = 0.;
  if (dInt > 13.2 && dInt < 13.75 && !island) {
    float toward = inV ? -sign(d.y) : -sign(d.x);
    float side = inV ? (toward > 0. ? -lat : lat) : (toward > 0. ? lat : -lat);
    stopL = step(.3, side) * step(side, 7.6);
  }
  if (dInt < 13.) { wl = 0.; yl = 0.; }
  paint = max(max(yl, wl), max(el, max(cwk, stopL)));
  paintCol = yl > .5 ? vec3(.86, .6, .1) : vec3(.86);
  float tr = min(abs(abs(lat) - 2.1), abs(abs(lat) - 5.9));
  float track = smoothstep(1.3, .6, abs(tr - .85));
  alb *= 1. - .14 * track;
  rough -= .07 * track;
  // tapas de alcantarilla
  float mh = mod(along + 17., 40.);
  vec2 mq = vec2(abs(lat) - 2.1, mh - 20.);
  float mr = length(mq);
  if (mr < .42) {
    float ring = smoothstep(.36, .38, mr);
    float grid = step(.5, fract((mq.x + mq.y) * 8.)) * .3 + .7;
    alb = mix(vec3(.06, .055, .05) * grid * 1.6, vec3(.04), ring);
    rough = .45;
    paint = 0.;
  }
}
float wear = smoothstep(.3, .75, fbm3(p * 1.6)) * .55 + smoothstep(.55, .95, vnoise(p * 11.)) * .35;
paint *= 1. - wear;
alb = mix(alb, paintCol * (.82 + .2 * aA.rgb * 5.), paint);
rough = mix(rough, .58, paint);
// humedad y charcos
float puddle = smoothstep(.6, .7, fbm3(p * .085) + (.55 - hgt) * .3) * smoothstep(.15, .6, uWet);
alb *= mix(1., .42, uWet);
alb = mix(alb, alb * .45, puddle);
rough = mix(rough, .16, uWet * .75);
rough = mix(rough, .015, puddle);
nW = normalize(mix(nW, vec3(0., 1., 0.), max(puddle, uWet * .45)));
if (uRain > .02 && puddle > .02) {
  float e = .02;
  float r0 = rippleField(p, uTime);
  float rx = rippleField(p + vec2(e, 0.), uTime), rz = rippleField(p + vec2(0., e), uTime);
  nW = normalize(nW + vec3(r0 - rx, 0., r0 - rz) * 3. * puddle * uRain);
}
diffuseColor.rgb = alb;
float gRough = clamp(rough, .015, 1.);
vec3 gNW = nW;
float gRefl = max(puddle, uWet * .5);
`;

const GROUND_EMISSIVE = /* glsl */ `
{
  vec3 Vv = normalize(cameraPosition - vWPos);
  vec2 ls = lampDS(vWPos, Vv, gRough);
  totalEmissiveRadiance += LAMP_COLOR * uLamps * (alb * ls.x * 1.1 + ls.y * .8 * (.04 + .96 * pow(1. - max(dot(Vv, gNW), 0.), 5.)));
}
`;


const PLANAR_POST = /* glsl */ `
if (uReflOn > .5 && gRefl > .01) {
  vec3 Vr = normalize(cameraPosition - vWPos);
  float NoVr = max(dot(Vr, gNW), 0.);
  float Fr = .02 + .98 * pow(1. - NoVr, 5.);
  vec3 pr = planarRefl(vWPos, normalize(mix(vec3(0., 1., 0.), gNW, .25)), gRough);
  reflectedLight.indirectSpecular = mix(reflectedLight.indirectSpecular, pr * Fr, clamp(gRefl, 0., 1.));
}
`;

// Losas de manzanas y bordes (instanciadas): aGround = tipo de suelo, aRing = 1 si tiene anillo de vereda
const SLAB_HEAD = /* glsl */ `
attribute float aGround; attribute float aRing;
varying float vGround; varying float vRing; varying vec3 vBC; varying vec3 vBS;
`;
const SLAB_VWORLD = /* glsl */ `
vGround = aGround; vRing = aRing;
#ifdef USE_INSTANCING
  vBC = (modelMatrix * vec4(instanceMatrix[3].xyz, 1.)).xyz;
  vBS = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
#else
  vBC = modelMatrix[3].xyz; vBS = vec3(1.);
#endif
`;
const SLAB_FHEAD = /* glsl */ `
varying float vGround; varying float vRing; varying vec3 vBC; varying vec3 vBS;
`;
const SLAB_FRAG = /* glsl */ `
vec2 p = vWPos.xz;
vec3 Nn = normalize(vWNrm);
vec2 lp = p - (vBC.xz - vBS.xz * .5);
vec2 dEdge = min(lp, vBS.xz - lp);
float edge = min(dEdge.x, dEdge.y);
float layer; float tile;
float gt = floor(vGround + .5);
bool top = Nn.y > .5;
vec3 tint = vec3(1.);
float gRefl = 0.;
if (!top) { layer = 8.; tile = 2.; }
else if (vRing > .5 && edge < .32) { layer = 8.; tile = 2.; }
else if (vRing > .5 && edge < 4.) { layer = 1.; tile = 2.4; }
else if (gt < .5) { layer = 3.; tile = 4.; }
else if (gt < 1.5) { layer = 2.; tile = 4.; }
else if (gt < 2.5) { layer = 4.; tile = 6.; }
else if (gt < 3.5) { layer = 5.; tile = 8.; }
else if (gt < 4.5) { layer = 0.; tile = 5.; }
else if (gt < 5.5) {
  // parque: pasto con senderos de granza en cruz y anillo
  vec2 c = p - vBC.xz; float r = length(c);
  float path = step(min(abs(c.x), abs(c.y)), 2.2) + step(abs(r - 13.), 1.6);
  if (path > .5) { layer = 6.; tile = 3.; tint = vec3(1.25, 1.12, .95); } else { layer = 2.; tile = 4.; }
}
else if (gt < 6.5) { layer = 7.; tile = 3.; }
else { layer = 5.; tile = 8.; }
vec2 suv = (top ? p : (abs(Nn.x) > .5 ? vec2(vWPos.z, vWPos.y) : vec2(vWPos.x, vWPos.y))) / tile;
vec4 sa = sampleAlb(uGA, suv, layer);
vec4 sn = sampleNrm(uGN, suv, layer);
vec3 alb = sa.rgb * tint;
float rough = sa.a;
vec3 nW = top ? normalize(vec3(sn.x, sn.z, -sn.y)) : Nn;
if (top) {
  alb *= .9 + .18 * fbm3(p * .03);
  // estacionamiento: líneas de cajones
  if (gt > 3.5 && gt < 4.5 && (vRing < .5 || edge > 4.)) {
    float lx = fract((p.x - vBC.x) / 3.2);
    float m = (1. - smoothstep(.015, .03, abs(lx - .5) - .0)) * step(abs(fract((p.y - vBC.z) / 12.) - .5), .2);
    alb = mix(alb, vec3(.8), m * .8);
  }
  // borde de vereda gastado/oscuro
  if (vRing > .5 && edge < 4. && edge > .32) alb *= mix(.82, 1., smoothstep(.32, 1.2, edge));
  float hgt = sampleHgt(uGN, suv, layer);
  float puddle = smoothstep(.66, .74, fbm3(p * .1) + (.5 - hgt) * .3) * smoothstep(.2, .7, uWet) * step(layer, 7.5) * (1. - step(1.5, layer) * step(layer, 2.5));
  float porous = (layer == 2. || layer == 4.) ? .55 : 1.;
  alb *= mix(1., .55, uWet * porous);
  alb = mix(alb, alb * .5, puddle);
  rough = mix(rough, mix(rough, .22, porous), uWet * .7);
  rough = mix(rough, .02, puddle);
  nW = normalize(mix(nW, vec3(0., 1., 0.), max(puddle, uWet * .3)));
  gRefl = max(puddle, uWet * .3 * porous);
} else {
  alb *= .85;
  alb *= mix(1., .6, uWet);
}
diffuseColor.rgb = alb;
float gRough = clamp(rough, .02, 1.);
vec3 gNW = nW;
`;

// Terreno: playa, fondo marino y roca
const TERRAIN_FRAG = /* glsl */ `
vec2 p = vWPos.xz;
float h = vWPos.y;
vec4 sa = sampleAlb(uGA, p / 6., 4.);
vec4 sb = sampleAlb(uGA, p / 8., 9.);
vec4 na = sampleNrm(uGN, p / 6., 4.);
float wetBand = smoothstep(.15, -.55, h);
float under = smoothstep(-.7, -1.6, h);
vec3 alb = mix(sa.rgb, sa.rgb * .62, wetBand);
alb = mix(alb, sb.rgb * vec3(.85, .95, .9), under);
alb *= .9 + .16 * fbm3(p * .02);
// roca del cayo
float rock = smoothstep(.2, .55, h) * step(700., p.x) * step(p.y, 640.) * step(480., p.y);
alb = mix(alb, vec3(.32, .31, .3) * (.7 + .5 * fbm3(p * .4)), rock);
float rough = mix(sa.a, .35, wetBand * (1. - under));
rough = mix(rough, .7, rock);
vec3 nW = normalize(vec3(na.x, na.z, -na.y) * vec3(1., 1., 1.));
nW = normalize(mix(nW, vec3(0., 1., 0.), under * .5));
alb *= mix(1., .6, uWet * (1. - under));
diffuseColor.rgb = alb;
float gRough = rough;
vec3 gNW = nW;
`;

// Techos a dos aguas: tejas
const ROOF_FRAG = /* glsl */ `
vec2 q = vRoofUV;
float row = floor(q.y / .32);
float tx = fract(q.x / .26 + mod(row, 2.) * .5);
float ty = fract(q.y / .32);
float tileH = sin(tx * 3.14159) * .5 + .5;
vec3 alb = diffuseColor.rgb * (.82 + .25 * hash12(vec2(floor(q.x / .26 + mod(row, 2.) * .5), row))) * (.75 + .25 * tileH) * mix(.6, 1., smoothstep(0., .2, ty));
alb *= .9 + .15 * fbm3(q * .3);
alb *= mix(1., .7, uWet);
diffuseColor.rgb = alb;
vec3 rN = normalize(vWNrm);
`;

// ---------------------------------------------------------------------------
export class MaterialLib {
  constructor(renderer, ground, detail) {
    this.renderer = renderer;
    this.ground = ground;
    this.detail = detail;
    this.list = [];
    this.csm = null;
    this.cache = new Map();
  }

  setCSM(csm) {
    this.csm = csm;
    for (const m of this.list) this._setup(m);
  }

  _setup(m) {
    if (m.defines) {
      delete m.defines.USE_CSM;
      delete m.defines.CSM_CASCADES;
      delete m.defines.CSM_FADE;
    }
    m.userData.csmOBC = null;
    if (this.csm && m.userData.lit !== false) {
      this.csm.setupMaterial(m);
      m.userData.csmOBC = m.onBeforeCompile;
    }
    patchMaterial(m, m.userData.patch || {});
    m.needsUpdate = true;
  }

  register(m, spec = {}) {
    m.userData.patch = spec;
    this.list.push(m);
    this._setup(m);
    return m;
  }

  standard(params = {}, spec = {}) {
    return this.register(new THREE.MeshStandardMaterial(params), { key: 'std', ...spec });
  }
  physical(params = {}, spec = {}) {
    return this.register(new THREE.MeshPhysicalMaterial(params), { key: 'phys', ...spec });
  }

  facade(style) {
    const key = 'facade_' + style;
    if (this.cache.has(key)) return this.cache.get(key);
    const S = FACADE_STYLES[style];
    const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0 });
    m.defines = {
      CW: f(S.cw), FH: f(S.fh), WX0: f(S.wx0), WX1: f(S.wx1), WY0: f(S.wy0), WY1: f(S.wy1), TOPM: f(S.top),
      DTILE: f(S.tile), DLAYER: f(S.detail), DEPTHM: f(S.depth),
    };
    for (const fl of S.flags) m.defines[fl] = '';
    this.register(m, {
      key,
      lamps: true,
      uniforms: { uDA: { value: this.detail.albedo }, uDN: { value: this.detail.normal }, uGA: { value: this.ground.albedo }, uGN: { value: this.ground.normal } },
      vertexHead: 'attribute float aSeed; attribute vec4 aMeta; varying float vSeed; varying vec4 vMeta; varying vec3 vBC; varying vec3 vBS;',
      vertexWorld: `vSeed = aSeed; vMeta = aMeta;
        #ifdef USE_INSTANCING
          vBC = (modelMatrix * vec4(instanceMatrix[3].xyz, 1.)).xyz;
          vBS = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
        #else
          vBC = modelMatrix[3].xyz; vBS = vec3(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz), length(modelMatrix[2].xyz));
        #endif`,
      fragHead: FACADE_HEAD,
      fragColor: FACADE_FRAG,
      fragRoughness: 'roughnessFactor = mix(fRough, max(.04, fRough * .45), uWet * (1. - fGlass) * .7);',
      fragMetalness: 'metalnessFactor = fMetal;',
      fragNormal: 'normal = cnWorldToViewN(fNW);',
      fragEmissive: FACADE_EMISSIVE,
    });
    this.cache.set(key, m);
    return m;
  }

  road() {
    if (this.cache.has('road')) return this.cache.get('road');
    const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0 });
    this.register(m, {
      key: 'road',
      lamps: true,
      uniforms: { uGA: { value: this.ground.albedo }, uGN: { value: this.ground.normal } },
      fragHead: ROAD_HEAD + GLSL_PLANAR,
      fragColor: ROAD_FRAG,
      fragRoughness: 'roughnessFactor = gRough;',
      fragNormal: 'normal = cnWorldToViewN(gNW);',
      fragEmissive: GROUND_EMISSIVE,
      fragPostLights: PLANAR_POST,
    });
    this.cache.set('road', m);
    return m;
  }

  slab() {
    if (this.cache.has('slab')) return this.cache.get('slab');
    const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0 });
    this.register(m, {
      key: 'slab',
      lamps: true,
      uniforms: { uGA: { value: this.ground.albedo }, uGN: { value: this.ground.normal } },
      vertexHead: SLAB_HEAD,
      vertexWorld: SLAB_VWORLD,
      fragHead: ROAD_HEAD + SLAB_FHEAD + GLSL_PLANAR,
      fragColor: SLAB_FRAG,
      fragRoughness: 'roughnessFactor = gRough;',
      fragNormal: 'normal = cnWorldToViewN(gNW);',
      fragEmissive: GROUND_EMISSIVE,
      fragPostLights: PLANAR_POST,
    });
    this.cache.set('slab', m);
    return m;
  }

  terrain() {
    if (this.cache.has('terrain')) return this.cache.get('terrain');
    const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0 });
    this.register(m, {
      key: 'terrain',
      lamps: true,
      uniforms: { uGA: { value: this.ground.albedo }, uGN: { value: this.ground.normal } },
      fragHead: ROAD_HEAD,
      fragColor: TERRAIN_FRAG,
      fragRoughness: 'roughnessFactor = gRough;',
      fragNormal: 'normal = cnWorldToViewN(gNW);',
      fragEmissive: GROUND_EMISSIVE,
    });
    this.cache.set('terrain', m);
    return m;
  }

  roofTiles() {
    if (this.cache.has('roof')) return this.cache.get('roof');
    const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, metalness: 0 });
    m.defines = { USE_UV: '' };
    this.register(m, {
      key: 'roof',
      vertexHead: 'varying vec2 vRoofUV;',
      vertexWorld: `
        #ifdef USE_INSTANCING
          float rsx = length(instanceMatrix[0].xyz), rsy = length(instanceMatrix[1].xyz), rsz = length(instanceMatrix[2].xyz);
        #else
          float rsx = 1., rsy = 1., rsz = 1.;
        #endif
        vRoofUV = uv * vec2(rsx, sqrt(rsz * rsz * .25 + rsy * rsy));`,
      fragHead: 'varying vec2 vRoofUV;',
      fragColor: ROOF_FRAG,
      fragRoughness: 'roughnessFactor = mix(.75, .3, uWet);',
    });
    this.cache.set('roof', m);
    return m;
  }

  /** Material con textura de detalle del array (madera, metal, corteza) en UV de geometría. */
  detailed(layer, color, params = {}, uvScale = 1) {
    const key = 'det_' + layer + '_' + color + '_' + JSON.stringify(params) + uvScale;
    if (this.cache.has(key)) return this.cache.get(key);
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0, ...params });
    m.defines = { USE_UV: '' };
    this.register(m, {
      key: 'detailed',
      uniforms: { uDA: { value: this.detail.albedo }, uDN: { value: this.detail.normal }, uLayer: { value: layer }, uUVS: { value: uvScale } },
      fragHead: `uniform sampler2DArray uDA; uniform sampler2DArray uDN; uniform float uLayer; uniform float uUVS; ${GLSL_ARRAY_SAMPLING} ${GLSL_WORLD_TO_VIEW_NORMAL}`,
      fragColor: `vec4 dd = sampleAlb(uDA, vUv * uUVS, uLayer); diffuseColor.rgb *= dd.rgb; float dRough = dd.a; diffuseColor.rgb *= mix(1., .7, uWet);`,
      fragRoughness: `roughnessFactor *= dRough / .8; roughnessFactor = mix(roughnessFactor, roughnessFactor * .5, uWet);`,
    });
    this.cache.set(key, m);
    return m;
  }

  /** Material con detalle triplanar en coordenadas de mundo (muros, muelles, estructuras grandes). */
  triplanar(layer, color, tile = 3, params = {}) {
    const key = 'tri_' + layer + '_' + color + '_' + tile + JSON.stringify(params);
    if (this.cache.has(key)) return this.cache.get(key);
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...params });
    this.register(m, {
      key: 'triplanar',
      uniforms: { uDA: { value: this.detail.albedo }, uDN: { value: this.detail.normal }, uLayer: { value: layer }, uTile: { value: tile } },
      fragHead: `uniform sampler2DArray uDA; uniform sampler2DArray uDN; uniform float uLayer; uniform float uTile; ${GLSL_ARRAY_SAMPLING} ${GLSL_WORLD_TO_VIEW_NORMAL}`,
      fragColor: `
        vec3 tn = abs(normalize(vWNrm)); tn /= (tn.x + tn.y + tn.z);
        vec4 tx = sampleAlb(uDA, vWPos.zy / uTile, uLayer), ty = sampleAlb(uDA, vWPos.xz / uTile, uLayer), tz = sampleAlb(uDA, vWPos.xy / uTile, uLayer);
        vec4 tt = tx * tn.x + ty * tn.y + tz * tn.z;
        diffuseColor.rgb *= tt.rgb * (.9 + .15 * fbm3(vWPos.xz * .05 + vWPos.y * .1));
        diffuseColor.rgb *= mix(1., .68, uWet);
        float tRough = tt.a;`,
      fragRoughness: 'roughnessFactor = mix(tRough, tRough * .45, uWet);',
    });
    this.cache.set(key, m);
    return m;
  }

  /** Follaje con recorte alfa y viento. */
  foliage(map, params = {}) {
    const { palm, swayBase, ...rest } = params;
    const m = new THREE.MeshStandardMaterial({
      map, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.75, metalness: 0, ...rest,
    });
    return this.register(m, {
      key: 'foliage' + (palm ? 'P' : '') + (swayBase != null ? swayBase.toFixed(1) : ''),
      vertexBegin: `
        {
          vec3 wpI = vec3(0.);
          #ifdef USE_INSTANCING
            wpI = instanceMatrix[3].xyz;
          #endif
          float sway = sin(uTime * 1.6 + wpI.x * .37 + wpI.z * .21) * .5 + sin(uTime * 2.7 + wpI.z * .5) * .25;
          float k = max(position.y - ${params.swayBase != null ? f(params.swayBase) : '1.0'}, 0.) * .06 * (.4 + uWind);
          transformed.x += sway * k * (1. + abs(position.x) * .25);
          transformed.z += sway * k * .6;
          transformed.y -= abs(sway) * k * .15 * abs(position.x);
        }`,
      fragColor: `diffuseColor.rgb *= mix(1., .75, uWet);`,
      fragEmissive: `
        {
          // translucidez: luz solar atravesando hojas
          vec3 Vv = normalize(cameraPosition - vWPos);
          float tr = pow(max(dot(-Vv, uSunDir), 0.), 4.) * (1. - uNight);
          totalEmissiveRadiance += diffuseColor.rgb * tr * .9;
        }`,
    });
  }

  /** Material emisivo sin iluminación (luces, neones). intensityUniform permite atenuar por día/noche. */
  emissive(color, intensity = 1, params = {}) {
    const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), ...params });
    m.userData.lit = false;
    return this.register(m, { key: 'emis', basic: true });
  }

  disposeAll() {
    for (const m of this.list) m.dispose();
    this.list.length = 0;
    this.cache.clear();
  }
}

export { GROUND };
