// Modelo mínimo para probar el flujo completo (no es un diseño real).
export const meta = { title: 'Prueba', description: 'Casita mínima para probar el flujo' };

export default function build(m, { row, fill, rect }) {
  m.step('Base');
  rect('plate', 'Green', 0, 0, 0, 8, 8);
  m.step('Paredes');
  for (let k = 0; k < 3; k++) {
    row('3010', 'White', 1, 1 + 3 * k, 1, 1);
    row('3004', 'White', 5, 1 + 3 * k, 1, 1);
    row('3010', 'White', 1, 1 + 3 * k, 6, 1);
    row('3004', 'White', 5, 1 + 3 * k, 6, 1);
    m.add('3062b', 'Red', 0, 1 + 3 * k, 0);
    m.add('3062b', 'Red', 7, 1 + 3 * k, 0);
  }
  m.step('Techo');
  rect('plate', 'Dark Red', 1, 10, 1, 6, 6);
  for (let i = 0; i < 3; i++) {
    m.add('3039', 'Black', 1 + 2 * i, 11, 1, { face: 'S' });
    m.add('3039', 'Black', 1 + 2 * i, 11, 5, { face: 'N' });
  }
  m.add('6141', 'Pearl Gold', 3, 14, 2);
  m.add('3062b', 'Trans-Yellow', 3, 11, 3);
}
