// Estado inicial e consultas derivadas (capacidade, níveis de equipamento, equipa ativa...).

import { ARTISTS } from '../content/artists';
import { BALANCE } from '../content/balance';
import { PRODUCTS, PRODUCT_BY_ID, STOCK_MAX_BASE, STOCK_MAX_PER_COUNTER } from '../content/catalog';
import { ROOMS, BASE_COMFORT_CAPACITY } from '../content/rooms';
import { at } from './time';
import type { BarState, GameState, ProductId, RoomId, RoomState, StaffRole } from './types';

export const SAVE_VERSION = 1;

export function createInitialState(seed = 12345): GameState {
  const rooms = {} as Record<RoomId, RoomState>;
  for (const def of Object.values(ROOMS)) {
    const upgrades: Record<string, number> = {};
    for (const u of def.upgrades) upgrades[u.key] = 0;
    rooms[def.id] = { built: def.startsBuilt, construction: null, upgrades, dirt: [] };
  }
  // A sala começa com lixo do antigo armazém (tutorial de limpeza).
  const initialDirt: [number, number][] = [[3.2, 5.4], [6.1, 6.6], [9.4, 5.2], [12.3, 7.4], [4.6, 8.8], [8.2, 8.4], [11.0, 9.3], [13.2, 5.8]];
  rooms.hall.dirt = initialDirt.map(([x, y], i) => ({ id: 1000 + i, x, y, kind: i % 3, progress: 0 }));

  const products = {} as BarState['products'];
  for (const p of PRODUCTS) products[p.id] = { stock: p.menuLevel === 0 ? 48 : 0, price: p.defaultPrice, sold: 0 };

  const artists: GameState['artists'] = {};
  for (const a of ARTISTS) artists[a.id] = { draw: a.draw, relationship: 0, shows: 0, lastShowAt: null, history: [] };

  return {
    version: SAVE_VERSION,
    seed,
    rngState: seed,
    time: at(0, BALANCE.startHour),
    speed: 1,
    money: BALANCE.startMoney,
    level: 1,
    xp: 0,
    rep: { general: BALANCE.startReputation, music: BALANCE.startReputation, theater: BALANCE.startReputation, visual: 0, cinema: 0, training: 0, community: 5 },
    rooms,
    bar: { products, restockTarget: 48 },
    counters: { boxoffice: { queue: [], serving: [] }, bar: { queue: [], serving: [] } },
    bookings: [],
    artists,
    staff: [],
    candidates: [],
    agents: [],
    player: { x: 6.9, y: 17.5, path: [] },
    ledger: [],
    log: [],
    missions: {},
    tutorial: { step: 0, skipped: false },
    progress: {
      totalVisitors: 0, totalTickets: 0, totalEvents: 0, drinksServed: 0, soldOuts: 0, bestEventNet: 0,
      upgradesBought: 0, eventsByDiscipline: { music: 0, theater: 0, comedy: 0, dance: 0, corporate: 0, workshop: 0 }, satisfactionHistory: [], lastEventAt: null,
    },
    flags: {},
    rehearsal: { pricePerHour: BALANCE.rehearsalRefPrice, slots: [] },
    pendingEvent: null,
    inbox: [],
    modifiers: { qualityPenaltyEvents: 0 },
    nextId: 1,
  };
}

export function upgradeLevel(state: GameState, room: RoomId, key: string): number {
  return state.rooms[room].upgrades[key] ?? 0;
}

export function upgradeValue(state: GameState, room: RoomId, key: string): number {
  const def = ROOMS[room].upgrades.find((u) => u.key === key);
  if (!def) return 0;
  return def.levels[Math.min(upgradeLevel(state, room, key), def.levels.length - 1)].value;
}

export function isOperational(state: GameState, room: RoomId): boolean {
  const r = state.rooms[room];
  return r.built && !r.construction;
}

export function roomCapacity(state: GameState, room: RoomId): number {
  if (!ROOMS[room].isShowRoom) return 0;
  return upgradeValue(state, room, 'seats');
}

export function equipment(state: GameState, room: RoomId): { sound: number; light: number; stage: number } {
  return {
    sound: upgradeValue(state, room, 'sound'),
    light: upgradeValue(state, room, 'light'),
    stage: upgradeValue(state, room, 'stage'),
  };
}

export function comfortCapacity(state: GameState): number {
  return isOperational(state, 'wc') ? upgradeValue(state, 'wc', 'size') : BASE_COMFORT_CAPACITY;
}

export function staffByRole(state: GameState, role: StaffRole) {
  return state.staff.filter((s) => s.role === role);
}

export function hasRole(state: GameState, role: StaffRole): boolean {
  return state.staff.some((s) => s.role === role);
}

export function bestCompetence(state: GameState, role: StaffRole): number {
  return staffByRole(state, role).reduce((m, s) => Math.max(m, s.competence), 0);
}

export function staffSpeed(competence: number): number {
  return 0.7 + 0.15 * competence;
}

export function barSlots(state: GameState): number {
  return upgradeValue(state, 'bar', 'counter');
}

export function boxOfficeSlots(state: GameState): number {
  return upgradeValue(state, 'lobby', 'guiche');
}

export function productUnlocked(state: GameState, id: ProductId): boolean {
  return PRODUCT_BY_ID[id].menuLevel <= upgradeValue(state, 'bar', 'menu');
}

export function stockMax(state: GameState): number {
  return STOCK_MAX_BASE + STOCK_MAX_PER_COUNTER * (barSlots(state) - 1);
}

export function activeBookings(state: GameState) {
  return state.bookings.filter((b) => b.status !== 'settled' && b.status !== 'cancelled');
}

export function liveBookingIn(state: GameState, room: RoomId) {
  return state.bookings.find((b) => b.roomId === room && (b.status === 'setup' || b.status === 'doors' || b.status === 'live' || b.status === 'ended'));
}

export function nextBooking(state: GameState) {
  return state.bookings
    .filter((b) => b.status === 'scheduled' || b.status === 'setup' || b.status === 'doors' || b.status === 'live')
    .sort((a, b) => a.startAt - b.startAt)[0];
}

/** Reputação efetiva para uma disciplina (geral + específica). */
export function disciplineRepKey(d: string): 'music' | 'theater' | 'training' | 'community' {
  if (d === 'workshop') return 'training';
  if (d === 'corporate') return 'community';
  return d === 'music' ? 'music' : 'theater';
}

export function effectiveRep(state: GameState, discipline: string): number {
  return 0.6 * state.rep.general + 0.4 * state.rep[disciplineRepKey(discipline)];
}

export function satisfactionHistoryAvg(state: GameState): number {
  const h = state.progress.satisfactionHistory;
  if (!h.length) return 60;
  return h.reduce((a, b) => a + b, 0) / h.length;
}
