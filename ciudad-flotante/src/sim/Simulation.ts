/**
 * FACHADA DE LA SIMULACIÓN.
 *
 * Mantiene el `GameState`, el RNG determinista, el bus de eventos y la geometría derivada
 * (layout, navegación, colisiones). `tick` avanza todos los sistemas en orden fijo.
 * Los comandos públicos son las ÚNICAS acciones que la capa de juego/UI puede ejecutar
 * sobre el estado; cada uno delega en el sistema correspondiente.
 */
import { EventBus, type NotifyKind } from '../core/EventBus';
import { Rng } from '../core/Rng';
import { SLEEP_TIME_SCALE } from './constants';
import { NavGrid } from './nav';
import { createNewGame } from './newGame';
import { ShipCollision } from './physics';
import { computeLayout, type ShipLayout } from './ship';
import type { GameState, Inventory, ItemId, NpcRole, Rotation } from './types';
import { dayOf, hourOf } from './time';

import * as actions from './actions';
import * as construction from './construction';
import * as debris from './debris';
import * as events from './events';
import * as needs from './needs';
import * as npc from './npc';
import * as stations from './stations';
import * as tutorial from './tutorial';
import * as utilities from './utilities';
import * as voyage from './voyage';
import * as weather from './weather';

export interface ActionResult {
  ok: boolean;
  msg?: string;
}

export type InvRef = { kind: 'player' } | { kind: 'module'; id: number; slot: 'inventory' | 'fuel' } | { kind: 'crate'; id: number };

export interface NpcTalk {
  npcId: string;
  name: string;
  role: NpcRole;
  roleName: string;
  trait: string;
  mood: number;
  /** Frases que dice al hablar con él (estado, quejas, peticiones). */
  lines: string[];
  /** Opciones disponibles (mediar, dar objeto, etc.). */
  options: { id: string; label: string; enabled: boolean }[];
}

export class Simulation {
  readonly bus: EventBus;
  rng: Rng;
  private _layout: ShipLayout | null = null;
  private _nav: NavGrid | null = null;
  private _collision: ShipCollision | null = null;
  private _rev = -1;

  constructor(
    public state: GameState,
    bus?: EventBus,
  ) {
    this.bus = bus ?? new EventBus();
    this.rng = new Rng(state.rngState);
  }

  static newGame(seed?: number, bus?: EventBus): Simulation {
    return new Simulation(createNewGame(seed ?? Math.floor(Math.random() * 1e9)), bus);
  }

  /* ---------------- Geometría derivada (se recalcula al cambiar ship.revision) ------------- */

  private refresh(): void {
    if (this._rev === this.state.ship.revision && this._layout) return;
    this._layout = computeLayout(this.state.ship);
    this._nav = new NavGrid(this._layout);
    this._collision = new ShipCollision(this._layout);
    this._rev = this.state.ship.revision;
  }

  get layout(): ShipLayout {
    this.refresh();
    return this._layout!;
  }

  get nav(): NavGrid {
    this.refresh();
    return this._nav!;
  }

  get collision(): ShipCollision {
    this.refresh();
    return this._collision!;
  }

  /** Marca la distribución del barco como modificada. */
  shipChanged(): void {
    this.state.ship.revision++;
    this.bus.emit('shipChanged', { revision: this.state.ship.revision });
  }

  /* ---------------- Reloj ------------- */

  get day(): number {
    return dayOf(this.state.time);
  }

  get hour(): number {
    return hourOf(this.state.time);
  }

  /** Multiplicador que la capa de juego aplica al tiempo real. */
  get timeScale(): number {
    return this.state.player.sleeping ? SLEEP_TIME_SCALE : 1;
  }

  /** Copia el estado del RNG al GameState (los comandos fuera del tick también tiran dados). */
  syncRng(): void {
    this.state.rngState = this.rng.state;
  }

  nextId(): number {
    return this.state.nextId++;
  }

  /* ---------------- Mensajes ------------- */

  notify(text: string, kind: NotifyKind = 'info'): void {
    this.bus.emit('notify', { text, kind });
  }

  /** Añade una entrada al diario de a bordo (y opcionalmente notifica). */
  log(text: string, kind: NotifyKind = 'info', notify = true): void {
    this.state.log.push({ at: this.state.time, text, kind });
    if (this.state.log.length > 120) this.state.log.splice(0, this.state.log.length - 120);
    if (notify) this.notify(text, kind);
  }

  /* ---------------- Bucle ------------- */

  /** Avanza `dtMin` minutos de juego en pasos de como mucho 0.5 min. */
  tick(dtMin: number): void {
    if (!this.state.player.alive || dtMin <= 0) return;
    let remaining = Math.min(dtMin, 60);
    while (remaining > 1e-9) {
      const h = Math.min(remaining, 0.5);
      this.step(h);
      remaining -= h;
      if (!this.state.player.alive) break;
    }
    this.state.rngState = this.rng.state;
  }

  private step(dt: number): void {
    const prevDay = this.day;
    this.state.time += dt;
    if (this.day !== prevDay) {
      this.state.player.stats.daysSurvived = this.day - 1;
      this.bus.emit('newDay', { day: this.day });
    }
    weather.tickWeather(this, dt);
    voyage.tickVoyage(this, dt);
    utilities.tickUtilities(this, dt);
    stations.tickStations(this, dt);
    construction.tickConstruction(this, dt);
    needs.tickNeeds(this, dt);
    npc.tickNpcs(this, dt);
    debris.tickDebris(this, dt);
    events.tickEvents(this, dt);
    tutorial.tickTutorial(this, dt);
  }

  /* ================= COMANDOS: objetos e inventario (actions.ts) ================= */

  inventoryOf(ref: InvRef): Inventory | null {
    return actions.inventoryOf(this, ref);
  }
  /** Comer, beber, curarse, leer un plano o equiparse una prenda desde una ranura del jugador. */
  useItem(slot: number): ActionResult {
    return actions.useItem(this, slot);
  }
  unequipClothing(): ActionResult {
    return actions.unequipClothing(this);
  }
  /** Mueve una pila (o solo `qty` unidades) entre inventarios. */
  moveItem(from: InvRef, fromSlot: number, to: InvRef, toSlot?: number, qty?: number): ActionResult {
    return actions.moveItem(this, from, fromSlot, to, toSlot, qty);
  }
  takeAll(from: InvRef): ActionResult {
    return actions.takeAll(this, from);
  }
  /** Deja una pila del jugador en una caja en el suelo. */
  dropItem(slot: number): ActionResult {
    return actions.dropItem(this, slot);
  }
  sleep(moduleId: number, bed: number): ActionResult {
    return actions.sleep(this, moduleId, bed);
  }
  wake(reason?: string): void {
    actions.wake(this, reason);
  }
  drinkFromTank(): ActionResult {
    return actions.drinkFromTank(this);
  }
  fillBottle(): ActionResult {
    return actions.fillBottle(this);
  }
  setHotbar(index: number): void {
    actions.setHotbar(this, index);
  }

  /* ================= COMANDOS: viaje (voyage.ts) ================= */

  chooseRoute(regionId: string): ActionResult {
    return voyage.chooseRoute(this, regionId);
  }

  /* ================= COMANDOS: fabricación, estaciones, cultivo (stations.ts) ================= */

  craftByHand(recipeId: string): ActionResult {
    return stations.craftByHand(this, recipeId);
  }
  queueCraft(moduleId: number, recipeId: string, count = 1): ActionResult {
    return stations.queueCraft(this, moduleId, recipeId, count);
  }
  cancelCraft(moduleId: number, jobIndex: number): ActionResult {
    return stations.cancelCraft(this, moduleId, jobIndex);
  }
  plant(moduleId: number, plot: number, seed: ItemId): ActionResult {
    return stations.plant(this, moduleId, plot, seed);
  }
  harvest(moduleId: number, plot: number): ActionResult {
    return stations.harvest(this, moduleId, plot);
  }
  /** Retira plantas muertas o una plaga. */
  tendPlot(moduleId: number, plot: number): ActionResult {
    return stations.tendPlot(this, moduleId, plot);
  }
  togglePower(moduleId: number): ActionResult {
    return utilities.togglePower(this, moduleId);
  }

  /* ================= COMANDOS: construcción y reparación (construction.ts) ================= */

  checkPlace(type: string, level: number, x: number, z: number, rot: Rotation): construction.PlaceInfo {
    return construction.checkPlace(this, type, level, x, z, rot);
  }
  placeModule(type: string, level: number, x: number, z: number, rot: Rotation): ActionResult & { moduleId?: number } {
    return construction.placeModule(this, type, level, x, z, rot);
  }
  checkDemolishModule(moduleId: number): construction.DemolishCheck {
    return construction.checkDemolishModule(this, moduleId);
  }
  demolish(moduleId: number): ActionResult {
    return construction.demolish(this, moduleId);
  }
  checkExpandHull(): ReturnType<typeof construction.checkExpandHull> {
    return construction.checkExpandHull(this);
  }
  expandHull(): ActionResult {
    return construction.expandHull(this);
  }
  /** Mejora siguiente de un módulo: nombre, efectos, coste y si se puede pagar. */
  checkUpgrade(moduleId: number): construction.UpgradeCheck {
    return construction.checkUpgrade(this, moduleId);
  }
  /** Paga y empieza a mejorar un módulo (sigue funcionando mientras tanto). */
  startUpgrade(moduleId: number): ActionResult {
    return construction.startUpgrade(this, moduleId);
  }
  cancelUpgrade(moduleId: number): ActionResult {
    return construction.cancelUpgrade(this, moduleId);
  }
  /** Cancela la ampliación del casco en obras (devuelve lo pagado en una caja en la proa). */
  cancelExpansion(): ActionResult {
    return construction.cancelExpansion(this);
  }
  /** El jugador trabaja `minutes` minutos de juego en una obra (con martillo). */
  helpBuild(moduleId: number, minutes: number): ActionResult {
    return construction.helpBuild(this, moduleId, minutes);
  }
  /** Qué hace falta para reparar el módulo y si el jugador lo tiene. */
  repairInfo(moduleId: number): { needed: boolean; tool: ItemId | null; part: ItemId | null; ok: boolean; reason: string | null } {
    return construction.repairInfo(this, moduleId);
  }
  repair(moduleId: number): ActionResult {
    return construction.repair(this, moduleId);
  }

  /* ================= COMANDOS: mar, pesca, fuego (debris.ts / events.ts) ================= */

  collectDebris(debrisId: number): ActionResult {
    return debris.collectDebris(this, debrisId);
  }
  /** Segundos reales (= minutos de juego) hasta la próxima picada, según región y eventos. */
  fishBiteDelay(): number {
    return debris.fishBiteDelay(this);
  }
  catchFish(): ActionResult {
    return debris.catchFish(this);
  }
  fillBucket(): ActionResult {
    return debris.fillBucket(this);
  }
  extinguish(moduleId: number): ActionResult {
    return events.extinguish(this, moduleId);
  }

  /* ================= COMANDOS: habitantes y eventos ================= */

  talkTo(npcId: string): NpcTalk | null {
    return npc.talkTo(this, npcId);
  }
  npcOption(npcId: string, optionId: string): ActionResult {
    return npc.npcOption(this, npcId, optionId);
  }
  setNpcRole(npcId: string, role: NpcRole): ActionResult {
    return npc.setRole(this, npcId, role);
  }
  giveItemToNpc(npcId: string, slot: number): ActionResult {
    return npc.giveItem(this, npcId, slot);
  }
  eventChoice(eventId: number, choiceId: string): ActionResult {
    return events.eventChoice(this, eventId, choiceId);
  }
  trade(eventId: number, offerIndex: number): ActionResult {
    return events.trade(this, eventId, offerIndex);
  }

  /* ================= Utilidades para UI ================= */

  stationRecipes(moduleId: number | null) {
    return stations.availableRecipes(this, moduleId);
  }
  /** Cola con progreso y tiempo restante, texto de estado ("Sin energía", "Sin combustible"…). */
  stationStatus(moduleId: number) {
    return stations.stationStatus(this, moduleId);
  }
  plotStatus(moduleId: number, plot: number): string {
    return stations.plotStatus(this, moduleId, plot);
  }
  /** Obra en curso (-1 = ampliación del casco): progreso, ayudantes, minutos restantes. */
  constructionStatus(moduleId: number) {
    return construction.constructionStatus(this, moduleId);
  }
  /** Quién produce y quién consume en la red eléctrica ahora mismo. */
  powerBreakdown() {
    return utilities.powerBreakdown(this);
  }
  /** Ofertas de un mercante con disponibilidad. */
  tradeOffers(eventId: number) {
    return events.tradeOffers(this, eventId);
  }
  /** Factores del ánimo de un habitante (etiquetas en español y puntos). */
  npcMoodFactors(npcId: string) {
    const n = this.state.npcs.find((x) => x.id === npcId);
    return n ? npc.npcMoodFactors(this, n) : [];
  }
  /** Estado de un evento activo ("Quedan 45 min", "En curso"…). */
  eventStatus(eventId: number): string {
    const e = events.eventById(this, eventId);
    return e ? events.eventStatusText(this, e) : '';
  }
  /** Texto corto de lo que hace un habitante ahora. */
  npcStatus(npcId: string): string {
    const n = this.state.npcs.find((x) => x.id === npcId);
    return n ? npc.npcStatusText(this, n) : '';
  }
}
