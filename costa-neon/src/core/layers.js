// Capas de render. Capa 0: mundo estático (recibe SSAO). Capa 1: objetos dinámicos (vehículos,
// personas, partículas, lluvia), dibujados en una segunda pasada después de la oclusión ambiental.
export const LAYER_DYNAMIC = 1;

/** Marca un objeto (y sus hijos) como dinámico. */
export function setDynamic(obj) {
  obj.traverse((o) => o.layers.set(LAYER_DYNAMIC));
  return obj;
}

/** Capa adicional de lo que ve la sonda de reflejos (edificios, calles, cielo, mar). */
export const LAYER_PROBE = 2;

/** Agrega la capa de la sonda a un objeto y sus hijos (sin quitarle sus otras capas). */
export function setProbeVisible(obj) {
  obj.traverse((o) => o.layers.enable(LAYER_PROBE));
  return obj;
}
