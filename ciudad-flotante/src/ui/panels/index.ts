/**
 * Despacho de paneles: cada `PanelRequest` se pinta con su módulo. Devuelve null si el objetivo
 * ya no existe (módulo demolido, caja vacía, habitante que se fue…) para que la UI lo cierre.
 */
import type { PanelRequest } from '../../game/types';
import type { UiEnv } from '../env';
import type { VInput } from '../vdom';
import { renderCrate } from './crate';
import { renderHelm } from './helm';
import { renderInventory } from './inventory';
import { renderNpc } from './npc';
import { renderStation } from './station';
import { renderTrade } from './trade';

export interface PanelView {
  title: string;
  subtitle?: VInput;
  /** Glifo de la cabecera. */
  glyph?: string;
  /** Contenido extra de la cabecera (a la derecha del título). */
  head?: VInput;
  /** Pestañas bajo la cabecera. */
  tabs?: VInput;
  body: VInput;
  foot?: VInput;
  /** Clase extra del panel (anchura, variantes). */
  cls?: string;
}

export function renderPanel(env: UiEnv, req: PanelRequest): PanelView | null {
  switch (req.kind) {
    case 'inventory':
      return renderInventory(env);
    case 'station':
      return renderStation(env, req.moduleId);
    case 'crate':
      return renderCrate(env, req.crateId);
    case 'npc':
      return renderNpc(env, req.npcId);
    case 'helm':
      return renderHelm(env);
    case 'trade':
      return renderTrade(env, req.eventId);
    default:
      return null;
  }
}
