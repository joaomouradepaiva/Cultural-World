// Programação: procura, contratos, validação de agenda, venda de bilhetes, liquidação de eventos.

import { ARTIST_BY_ID, type ArtistDef, artistOf } from '../content/artists';
import { BALANCE } from '../content/balance';
import { MARKETING_BY_ID, PRODUCTS, CONTRACTS } from '../content/catalog';
import { SPOTS, ROOM_RECTS } from '../content/map';
import { ROOMS } from '../content/rooms';
import { log, newId, type Ctx } from './core';
import { earn, spend, round2, canAfford } from './economy';
import { hashNoise, rand } from './rng';
import {
  disciplineRepKey, effectiveRep, equipment, hasRole, isOperational, productUnlocked,
  roomCapacity, satisfactionHistoryAvg, upgradeValue, bestCompetence,
} from './state';
import { hourOf, MIN_PER_DAY, weekdayOf, fmtDayShort, fmtClock } from './time';
import type { Booking, BookingKind, Contract, ContractType, EventResult, GameState, MarketingId, RoomId } from './types';
import { addXp } from './progression';
import { segmentDemand, updateLoyalty } from './audience';
import { complaintsFor, experienceScores, satisfactionOf } from './experience';
import { passSeatsFor, seasonDemandBoost, seasonFor } from './seasons';
import { THEME_BY_ID } from '../content/seasons';
import type { SegmentId } from '../content/segments';
import { spawnArtists, spawnVisitor } from './agents';

export interface BookingRequest {
  roomId: RoomId;
  artistId: string;
  startAt: number;
  ticketPrice: number;
  contractType: ContractType;
  marketing: MarketingId;
  /** eventos vindos da caixa de propostas */
  kind?: BookingKind;
  custom?: ArtistDef | null;
  participants?: number;
  /** termos já negociados (proposta) — substituem os termos de catálogo */
  contract?: Contract;
}

export function isCustom(req: { custom?: ArtistDef | null }): boolean {
  return !!req.custom;
}

export interface DemandBreakdown {
  base: number;
  rep: number;
  day: number;
  hour: number;
  price: number;
  marketing: number;
  freshness: number;
  history: number;
  access: number;
  boost: number;
  /** multiplicador da temporada (consistência do ciclo + campanha conjunta) */
  season: number;
  segments: Partial<Record<SegmentId, number>>;
  total: number;
}

const ease = (x: number) => {
  const c = Math.max(0, Math.min(1, x));
  return c * c * (3 - 2 * c);
};

export function artistUnlocked(state: GameState, a: ArtistDef): boolean {
  return state.level >= a.minLevel && state.rep.general >= a.minRep;
}

/** Datas (realizadas ou marcadas) de um artista no teu espaço. */
export function artistDates(state: GameState, artistId: string, ignoreId = -1): number[] {
  const out = state.bookings.filter((b) => b.artistId === artistId && b.id !== ignoreId && b.status !== 'cancelled').map((b) => b.startAt);
  const last = state.artists[artistId]?.lastShowAt;
  if (last !== null && last !== undefined && !out.includes(last)) out.push(last);
  return out;
}

export function setupMinutes(state: GameState, a: ArtistDef): number {
  const base = BALANCE.setupByDiscipline[a.discipline] ?? 90;
  return Math.max(BALANCE.doorsBefore, Math.round(base * (hasRole(state, 'technician') ? BALANCE.technicianSetupFactor : 1)));
}

export function effectivePrice(req: { ticketPrice: number; contractType: ContractType; custom?: ArtistDef | null }, a: ArtistDef): number {
  if (req.custom) return req.ticketPrice;
  return req.contractType === 'rental' ? a.refPrice : req.ticketPrice;
}

/** Procura total esperada (determinística). Pode exceder a capacidade. */
export function demandBreakdown(state: GameState, req: BookingRequest, boost = 1): DemandBreakdown {
  const a = artistOf(req);
  if (req.custom) {
    const n = req.participants ?? 0;
    return { base: n, rep: 1, day: 1, hour: 1, price: 1, marketing: 1, freshness: 1, history: 1, access: 1, boost, season: 1, segments: a.discipline === 'corporate' ? { corporate: 1 } : segmentDemand(state, a, req.startAt, req.ticketPrice || 1).shares, total: n };
  }
  const ast = state.artists[a.id];
  const price = Math.max(0.5, effectivePrice(req, a));
  const base = ast.draw;
  const rep = BALANCE.repFactorBase + BALANCE.repFactorSlope * (effectiveRep(state, a.discipline) / 100);
  const day = BALANCE.dayFactors[weekdayOf(req.startAt)];
  const hour = BALANCE.hourFactors[hourOf(req.startAt)] ?? 0.6;
  // preço e fidelização por segmento de público (substitui a elasticidade única)
  const sd = segmentDemand(state, a, req.startAt, price);
  const pf = sd.factor;
  const se = seasonFor(state, a, a.id, req.startAt);
  const sb = se ? seasonDemandBoost(state, se, req.startAt) : { consistency: 0, campaign: 0 };
  const mk = 1 + MARKETING_BY_ID[req.marketing].boost + organicBoost(state) + sb.campaign;
  let freshness = 1;
  // a data anterior mais próxima deste artista (já realizada ou só marcada) reduz a procura
  const prev = artistDates(state, a.id).filter((t) => t < req.startAt).sort((x, y) => y - x)[0];
  if (prev !== undefined) {
    const days = (req.startAt - prev) / MIN_PER_DAY;
    if (days < BALANCE.freshnessDays) freshness = 0.6 + 0.4 * (days / BALANCE.freshnessDays);
  }
  const history = 0.9 + 0.2 * (satisfactionHistoryAvg(state) / 100);
  const access = 1 + 0.05 * upgradeValue(state, req.roomId, 'access');
  const season = 1 + sb.consistency;
  const total = BALANCE.demandScale * base * rep * day * hour * pf * mk * freshness * history * access * boost * season;
  return { base, rep, day, hour, price: pf, marketing: mk, freshness, history, access, boost, season, segments: sd.shares, total };
}

/** Divulgação orgânica: comunidade forte vende bilhetes com menos marketing. */
export function organicBoost(state: GameState): number {
  return Math.min(0.25, state.rep.community / 400);
}

export function presaleParams(state: GameState, createdAt: number, startAt: number) {
  const online = upgradeValue(state, 'lobby', 'online');
  const share = BALANCE.presaleShare + 0.1 * online;
  const minF = BALANCE.leadTimeMinFactor + 0.1 * online;
  const leadH = Math.max(0, (startAt - BALANCE.doorsBefore - createdAt) / 60);
  const lead = minF + (1 - minF) * Math.min(1, leadH / BALANCE.leadTimeFullHours);
  return { share, lead };
}

export function contractTerms(state: GameState, artistId: string, type: ContractType, roomId: RoomId): Contract {
  const a = ARTIST_BY_ID[artistId];
  const ast = state.artists[artistId];
  const popularity = Math.pow(ast.draw / a.draw, 0.9);
  const relDiscount = 1 - Math.min(0.2, ast.relationship / 500);
  const fee = Math.round(a.cachet * popularity * relDiscount);
  const share = Math.max(0.5, round2(a.splitShare - ast.relationship / 1000));
  const c: Contract = { type, fee: 0, artistShare: 0, guarantee: 0, rent: 0 };
  if (type === 'fixed') c.fee = fee;
  if (type === 'split') c.artistShare = share;
  if (type === 'guarantee') { c.guarantee = Math.round(fee * 0.5); c.artistShare = 0.5; }
  if (type === 'rental') c.rent = Math.round((roomId === 'hall' ? 120 : 80) + roomCapacity(state, roomId) * 1.5);
  return c;
}

/** Termos do pedido: pré-negociados (proposta) ou de catálogo. */
export function termsFor(state: GameState, req: BookingRequest): Contract {
  return req.contract ? { ...req.contract } : contractTerms(state, req.artistId, req.contractType, req.roomId);
}

export function artistPayFor(c: Contract, gross: number): number {
  switch (c.type) {
    case 'fixed': return c.fee;
    case 'split': return round2(gross * c.artistShare);
    case 'guarantee': return round2(c.guarantee + c.artistShare * Math.max(0, gross - 2 * c.guarantee));
    case 'rental': return 0;
  }
}

export function riderGap(state: GameState, roomId: RoomId, a: ArtistDef) {
  const eq = equipment(state, roomId);
  const gap = {
    sound: Math.max(0, a.rider.sound - eq.sound),
    light: Math.max(0, a.rider.light - eq.light),
    stage: Math.max(0, a.rider.stage - eq.stage),
  };
  const rental = gap.sound * BALANCE.rentalPerLevel.sound + gap.light * BALANCE.rentalPerLevel.light + gap.stage * BALANCE.rentalPerLevel.stage;
  const maxGap = Math.max(gap.sound, gap.light, gap.stage);
  return { gap, rental, maxGap };
}

export function occupancy(b: { startAt: number; duration: number; setup: number; cleanup: number }) {
  return { from: b.startAt - b.setup, to: b.startAt + b.duration + b.cleanup };
}

export function findConflict(state: GameState, roomId: RoomId, from: number, to: number, ignoreId = -1): Booking | undefined {
  return state.bookings.find((b) => {
    if (b.id === ignoreId || b.roomId !== roomId || b.status === 'cancelled' || b.status === 'settled') return false;
    const o = occupancy(b);
    return from < o.to && o.from < to;
  });
}

export function marketingCost(id: MarketingId): number {
  return MARKETING_BY_ID[id].cost;
}

export function validateBooking(state: GameState, req: BookingRequest): string[] {
  const errors: string[] = [];
  const a = artistOf(req);
  if (!a) return ['Artista desconhecido.'];
  const room = ROOMS[req.roomId];
  if (!room.isShowRoom) errors.push('Esta sala não recebe espetáculos.');
  if (!isOperational(state, req.roomId)) errors.push(`${room.name} ainda não está disponível.`);
  const custom = isCustom(req);
  if (!custom && !artistUnlocked(state, a)) errors.push(`Requer nível ${a.minLevel} e reputação ${a.minRep}.`);
  const contract = CONTRACTS.find((c) => c.type === req.contractType)!;
  if (!custom && !req.contract && state.level < contract.minLevel) errors.push(`${contract.name} desbloqueia no nível ${contract.minLevel}.`);
  const mk = MARKETING_BY_ID[req.marketing];
  if (state.level < mk.minLevel) errors.push(`${mk.name} desbloqueia no nível ${mk.minLevel}.`);
  const setup = setupMinutes(state, a);
  if (req.startAt < state.time + setup + BALANCE.minLeadMinutes) errors.push('Não há tempo para a montagem. Escolhe um horário mais tarde.');
  if (req.startAt > state.time + BALANCE.maxAdvanceDays * MIN_PER_DAY) errors.push(`Só podes programar até ${BALANCE.maxAdvanceDays} dias.`);
  const h = hourOf(req.startAt);
  if (h < 10 || h > 23) errors.push('Os espetáculos começam entre as 10:00 e as 23:00.');
  if (req.contractType !== 'rental' && (req.ticketPrice < 0 || req.ticketPrice > 200)) errors.push('Preço inválido.');
  const from = req.startAt - setup, to = req.startAt + a.duration + BALANCE.baseCleanup;
  const c = findConflict(state, req.roomId, from, to);
  if (c) errors.push(`Conflito de agenda com ${artistOf(c).name} (${fmtDayShort(c.startAt)} ${fmtClock(c.startAt)}), incluindo montagem e limpeza.`);
  const ast = state.artists[a.id];
  void ast;
  if (!custom) {
    const near = artistDates(state, a.id).find((t) => Math.abs(t - req.startAt) < BALANCE.artistCooldownDays * MIN_PER_DAY);
    if (near !== undefined) errors.push(`${a.name} tem data a ${fmtDayShort(near)}: as datas do mesmo artista têm de ficar a ${BALANCE.artistCooldownDays}+ dias de distância.`);
  }
  const rg = riderGap(state, req.roomId, a);
  if (rg.maxGap > BALANCE.maxRentalGap) errors.push('Equipamento muito abaixo do rider técnico (nem alugando).');
  if (a.rider.sound + a.rider.light + a.rider.stage >= BALANCE.techRequiredRiderSum && !hasRole(state, 'technician')) errors.push('Rider exigente: contrata um técnico.');
  const terms = termsFor(state, req);
  const upfront = terms.fee + marketingCost(req.marketing);
  if (!canAfford(state, upfront)) errors.push(`Precisas de €${upfront} disponíveis (cachet + marketing).`);
  return errors;
}

export interface Forecast {
  demand: number;
  low: number;
  high: number;
  capacity: number;
  attendance: number;
  presale: number;
  ticketGross: number;
  artistPay: number;
  rent: number;
  bar: number;
  barMargin: number;
  costs: number;
  net: number;
  setup: number;
  rental: number;
  contract: Contract;
  breakdown: DemandBreakdown;
}

export function estimateBarPerVisitor(state: GameState, barFactor: number): { revenue: number; margin: number } {
  if (!isOperational(state, 'bar')) return { revenue: 0, margin: 0 };
  let wsum = 0, rev = 0, mar = 0, pfAvg = 0;
  for (const p of PRODUCTS) {
    if (!productUnlocked(state, p.id)) continue;
    const ps = state.bar.products[p.id];
    const pf = Math.min(1.4, Math.pow(p.refPrice / Math.max(0.1, ps.price), BALANCE.barPriceElasticity));
    const w = p.popularity * pf;
    wsum += w;
    rev += w * ps.price;
    mar += w * (ps.price - p.unitCost);
    pfAvg += p.popularity * pf;
  }
  if (wsum === 0) return { revenue: 0, margin: 0 };
  const popSum = PRODUCTS.filter((p) => productUnlocked(state, p.id)).reduce((s, p) => s + p.popularity, 0);
  const buyMul = Math.min(1.2, pfAvg / popSum);
  const items = (BALANCE.barBuyPre * (1 + BALANCE.barSecondDrink) + BALANCE.barBuyPost) * barFactor * buyMul;
  return { revenue: (items * rev) / wsum, margin: (items * mar) / wsum };
}

export function forecast(state: GameState, req: BookingRequest): Forecast {
  const a = artistOf(req);
  const bd = demandBreakdown(state, req);
  const capacity = roomCapacity(state, req.roomId);
  const { share, lead } = presaleParams(state, state.time, req.startAt);
  const presale = Math.min(capacity, Math.round(bd.total * share * lead));
  const attendance = Math.min(capacity, Math.round(bd.total));
  const price = effectivePrice(req, a);
  const contract = termsFor(state, req);
  const ticketGross = req.contractType === 'rental' ? 0 : attendance * price;
  const artistPay = artistPayFor(contract, ticketGross);
  const bar = estimateBarPerVisitor(state, a.barFactor);
  const rg = riderGap(state, req.roomId, a);
  const costs = BALANCE.energyPerEvent + BALANCE.energyPerAttendee * attendance + BALANCE.cleaningSuppliesPerEvent + rg.rental + marketingCost(req.marketing);
  const net = ticketGross - artistPay + contract.rent + attendance * bar.margin - costs;
  const n = req.custom ? 0 : BALANCE.demandNoise;
  return {
    demand: bd.total,
    low: Math.min(capacity, Math.round(bd.total * (1 - n))),
    high: Math.min(capacity, Math.round(bd.total * (1 + n))),
    capacity, attendance, presale, ticketGross, artistPay, rent: contract.rent,
    bar: attendance * bar.revenue, barMargin: attendance * bar.margin, costs, net,
    setup: setupMinutes(state, a), rental: rg.rental, contract, breakdown: bd,
  };
}

function emptyStats() {
  return {
    ticketRevenue: 0, barRevenue: 0, barCost: 0, drinks: 0, lostTicket: 0, lostImpatient: 0, lostBar: 0,
    waitTotal: 0, waitCount: 0, equipmentRental: 0, marketingCost: 0, upfrontFee: 0, cleanliness: 100, passAllocated: 0,
  };
}

export function createBooking(ctx: Ctx, req: BookingRequest): { ok: true; booking: Booking } | { ok: false; errors: string[] } {
  const s = ctx.state;
  const errors = validateBooking(s, req);
  if (errors.length) return { ok: false, errors };
  const a = artistOf(req);
  const contract = termsFor(s, req);
  const id = newId(s);
  const noise = req.custom ? 1 : 1 + BALANCE.demandNoise * (2 * hashNoise(id, s.seed) - 1);
  const b: Booking = {
    id, kind: req.kind ?? 'show', roomId: req.roomId, artistId: a.id, custom: req.custom ?? null, participants: req.participants ?? 0, contract,
    seasonId: (req.kind ?? 'show') === 'show' ? seasonFor(s, a, a.id, req.startAt)?.id ?? null : null, passSeats: 0, segments: {},
    ticketPrice: effectivePrice(req, a), startAt: req.startAt, duration: a.duration,
    setup: setupMinutes(s, a), cleanup: BALANCE.baseCleanup, createdAt: s.time, marketing: req.marketing,
    demand: 0, presaleTarget: 0, capacity: roomCapacity(s, req.roomId), presold: 0, doorSold: 0, walkupTarget: 0,
    spawned: 0, presoldSpawned: 0, attendees: 0, seatCursor: 0, status: 'scheduled', stats: emptyStats(), quality: 0, result: null,
    soldOutNotified: false, demandBoost: noise,
  };
  recomputeTargets(s, b);
  const mk = marketingCost(req.marketing);
  if (contract.fee > 0) spend(ctx, 'artists', contract.fee);
  if (mk > 0) spend(ctx, 'marketing', mk);
  b.stats.upfrontFee = contract.fee;
  b.stats.marketingCost = mk;
  s.bookings.push(b);
  log(ctx, `Programado: ${a.name} — ${fmtDayShort(b.startAt)} às ${fmtClock(b.startAt)}`, 'good');
  ctx.emit({ type: 'sound', name: 'notify' });
  return { ok: true, booking: b };
}

/** Recalcula procura e alvos de venda (ex.: após um evento viral). Mantém bilhetes já vendidos. */
export function recomputeTargets(s: GameState, b: Booking): void {
  const req: BookingRequest = { roomId: b.roomId, artistId: b.artistId, startAt: b.startAt, ticketPrice: b.ticketPrice, contractType: b.contract.type, marketing: b.marketing, custom: b.custom, participants: b.participants };
  b.capacity = Math.max(b.capacity, roomCapacity(s, b.roomId));
  const bd = demandBreakdown(s, req, b.demandBoost);
  b.segments = bd.segments;
  if (b.custom) {
    // inscritos: tudo vendido antecipadamente, sem venda à porta
    b.demand = b.participants * b.demandBoost;
    b.presaleTarget = Math.max(b.presold, Math.min(b.capacity, Math.round(b.demand)));
    b.walkupTarget = 0;
    return;
  }
  b.demand = bd.total;
  const se = b.seasonId !== null ? s.seasons.find((x) => x.id === b.seasonId) : undefined;
  b.passSeats = Math.max(b.passSeats ?? 0, Math.min(passSeatsFor(se, b.capacity), b.capacity - b.presold - b.doorSold));
  const free = b.capacity - b.passSeats;
  const { share, lead } = presaleParams(s, b.createdAt, b.startAt);
  b.presaleTarget = Math.max(b.presold, Math.min(free, Math.round(b.demand * share * lead)));
  b.walkupTarget = Math.max(0, Math.min(Math.round(b.demand) - b.presaleTarget, free - b.presaleTarget + BALANCE.walkupOverflow));
}

export function cancelBooking(ctx: Ctx, id: number): boolean {
  const s = ctx.state;
  const b = s.bookings.find((x) => x.id === id);
  if (!b || (b.status !== 'scheduled' && b.status !== 'setup')) return false;
  b.status = 'cancelled';
  if (b.contract.type !== 'rental' && b.stats.ticketRevenue > 0) spend(ctx, 'refunds', b.stats.ticketRevenue);
  s.rep.general = Math.max(0, s.rep.general - 1);
  const ast = s.artists[b.artistId];
  if (ast) ast.relationship = Math.max(0, ast.relationship - 10);
  for (const ag of s.agents) if (ag.bookingId === b.id && ag.kind === 'artist') { ag.state = 'leave'; ag.path = []; }
  log(ctx, `Cancelado: ${artistOf(b).name}. Bilhetes reembolsados; o cachet pago não é devolvido.`, 'bad');
  return true;
}

/** Lugares ocupados: bilhetes vendidos + passes de temporada. */
export function soldTotal(b: Booking): number {
  return b.presold + b.doorSold + (b.passSeats ?? 0);
}

export function doorsAt(b: Booking): number {
  return b.startAt - BALANCE.doorsBefore;
}

export function sellTicket(ctx: Ctx, b: Booking, door: boolean): boolean {
  if (soldTotal(b) >= b.capacity) return false;
  if (door) b.doorSold++; else b.presold++;
  b.stats.ticketRevenue += b.ticketPrice;
  if (b.kind === 'show') ctx.state.progress.totalTickets++;
  if (b.contract.type !== 'rental' && b.ticketPrice > 0) {
    const [x, y] = door ? SPOTS.boxOfficeCustomer[0] : SPOTS.boxOfficeServers[0];
    earn(ctx, 'tickets', b.ticketPrice, { x, y });
  }
  if (!b.soldOutNotified && soldTotal(b) >= b.capacity) {
    b.soldOutNotified = true;
    log(ctx, `ESGOTADO! ${artistOf(b).name} (${b.capacity} lugares)`, 'good');
    ctx.emit({ type: 'sound', name: 'cheer' });
  }
  return true;
}

export function computeQuality(state: GameState, b: Booking): number {
  const a = artistOf(b);
  const eq = equipment(state, b.roomId);
  const over = Math.max(0, eq.sound - a.rider.sound) * 3 + Math.max(0, eq.light - a.rider.light) * 3 + Math.max(0, eq.stage - a.rider.stage) * 2;
  const tech = hasRole(state, 'technician') ? 4 + bestCompetence(state, 'technician') : 0;
  const dressing = upgradeValue(state, b.roomId, 'dressing') * 3;
  const penalty = state.modifiers.qualityPenaltyEvents > 0 ? 10 : 0;
  return Math.max(0, Math.min(100, a.skill * 0.7 + 18 + over + tech + dressing - penalty));
}

function roomCleanliness(state: GameState, room: RoomId): number {
  return Math.max(0, 100 - state.rooms[room].dirt.length * 4);
}

export function venueCleanliness(state: GameState, room: RoomId): number {
  const rooms: RoomId[] = [room, 'lobby'];
  if (isOperational(state, 'bar')) rooms.push('bar');
  return rooms.reduce((s, r) => s + roomCleanliness(state, r), 0) / rooms.length;
}

export function processBookings(ctx: Ctx): void {
  const s = ctx.state;
  const t = s.time;
  for (const b of s.bookings) {
    if (b.status === 'settled' || b.status === 'cancelled') continue;
    const a = artistOf(b);
    const doors = doorsAt(b);
    const end = b.startAt + b.duration;

    if (b.status === 'scheduled' && t >= b.startAt - b.setup) {
      b.status = 'setup';
      const rg = riderGap(s, b.roomId, a);
      if (rg.rental > 0) { spend(ctx, 'equipment', rg.rental); b.stats.equipmentRental = rg.rental; }
      spawnArtists(ctx, b);
      log(ctx, `Montagem: ${a.name} na ${ROOMS[b.roomId].name}.`, 'info', false);
    }

    if ((b.status === 'scheduled' || b.status === 'setup') && t < doors) {
      const p = (t - b.createdAt) / Math.max(1, doors - b.createdAt);
      const target = Math.floor(b.presaleTarget * ease(p));
      while (b.presold < target && sellTicket(ctx, b, false)) { /* venda antecipada progressiva */ }
    }

    if (b.status === 'setup' && t >= doors) {
      while (b.presold < b.presaleTarget && sellTicket(ctx, b, false)) { /* fecha pré-venda */ }
      b.status = 'doors';
      b.stats.cleanliness = venueCleanliness(s, b.roomId);
      log(ctx, `Portas abertas para ${a.name}! ${b.presold} bilhetes pré-vendidos.`, 'info');
      ctx.emit({ type: 'sound', name: 'notify' });
    }

    if (b.status === 'doors' || b.status === 'live') {
      const total = b.presold + b.passSeats + b.walkupTarget;
      const windowEnd = b.startAt - 12;
      const want = Math.min(total, Math.ceil(total * ease((t - doors) / (windowEnd - doors))));
      while (b.spawned < want) {
        const remPresold = b.presold + b.passSeats - b.presoldSpawned;
        const remTotal = total - b.spawned;
        const hasTicket = remPresold > 0 && rand(s) < remPresold / remTotal;
        spawnVisitor(ctx, b, hasTicket);
        if (hasTicket) b.presoldSpawned++;
        b.spawned++;
      }
    }

    if (b.status === 'doors' && t >= b.startAt) {
      b.status = 'live';
      b.quality = computeQuality(s, b);
      if (s.modifiers.qualityPenaltyEvents > 0) s.modifiers.qualityPenaltyEvents--;
      log(ctx, `Começou: ${a.name}!`, 'good');
      ctx.emit({ type: 'showStart', bookingId: b.id });
    }

    if (b.status === 'live' && t >= end) {
      b.status = 'ended';
      addDirt(ctx, b);
      ctx.emit({ type: 'showEnd', bookingId: b.id });
      ctx.emit({ type: 'sound', name: 'applause' });
    }

    if (b.status === 'ended') {
      const remaining = s.agents.some((ag) => ag.bookingId === b.id && ag.kind === 'visitor');
      if (!remaining || t >= end + 90) settleBooking(ctx, b);
    }
  }
  // limpeza de histórico antigo
  if (s.bookings.length > 60) {
    const keep = s.bookings.filter((b) => b.status !== 'settled' && b.status !== 'cancelled');
    const done = s.bookings.filter((b) => b.status === 'settled' || b.status === 'cancelled').slice(-40);
    s.bookings = [...done, ...keep];
  }
}

function addDirt(ctx: Ctx, b: Booking): void {
  const s = ctx.state;
  const r = ROOM_RECTS[b.roomId];
  const room = s.rooms[b.roomId];
  const n = Math.ceil(b.attendees / 5);
  for (let i = 0; i < n && room.dirt.length < 30; i++) {
    room.dirt.push({ id: newId(s), x: rand(s, r.x0 + 0.6, r.x1 + 0.4), y: rand(s, r.y0 + 4, r.y1 + 0.3), kind: Math.floor(rand(s, 0, 3)), progress: 0 });
  }
  const lobby = s.rooms.lobby, lr = ROOM_RECTS.lobby;
  for (let i = 0; i < Math.ceil(b.attendees / 14) && lobby.dirt.length < 20; i++) {
    lobby.dirt.push({ id: newId(s), x: rand(s, lr.x0 + 3, lr.x1 + 0.5), y: rand(s, lr.y0 + 0.6, lr.y1 + 0.4), kind: Math.floor(rand(s, 0, 3)), progress: 0 });
  }
}

export function settleBooking(ctx: Ctx, b: Booking): EventResult {
  const s = ctx.state;
  const a = artistOf(b);
  const att = b.attendees;
  const isRental = b.contract.type === 'rental';
  // receita dos passes imputada a este evento (conta para partilhas com o artista, já entrou em caixa na venda)
  const se = b.seasonId !== null ? s.seasons.find((x) => x.id === b.seasonId) : undefined;
  if (se && b.passSeats > 0) b.stats.passAllocated = round2(b.passSeats * se.pass.price / Math.max(1, se.objectives[0].target));
  const gross = isRental ? 0 : b.stats.ticketRevenue + b.stats.passAllocated;
  const artistPay = artistPayFor(b.contract, gross);
  const toPayNow = Math.max(0, artistPay - b.stats.upfrontFee);
  if (toPayNow > 0) spend(ctx, 'artists', toPayNow);
  if (isRental) earn(ctx, 'rentals', b.contract.rent, { x: SPOTS.boxOfficeServers[0][0], y: SPOTS.boxOfficeServers[0][1] });
  const energy = round2(BALANCE.energyPerEvent + BALANCE.energyPerAttendee * att);
  const cleaning = BALANCE.cleaningSuppliesPerEvent;
  spend(ctx, 'energy', energy + cleaning);

  // satisfação
  const quality = b.quality || computeQuality(s, b);
  const scores = experienceScores(s, b, quality);
  const satisfaction = att === 0 ? 0 : satisfactionOf(scores);
  const complaints = att === 0 ? [] : complaintsFor(b, scores);
  for (const c of complaints) s.feedback.unshift({ ...c, t: s.time, bookingId: b.id });
  if (s.feedback.length > 40) s.feedback.length = 40;

  // reputação
  const soldOut = b.kind === 'show' && soldTotal(b) >= b.capacity;
  let repDelta = 0;
  if (att > 0) {
    const weight = Math.max(0.3, Math.min(1.2, Math.log10(att + 1) / 2));
    repDelta = ((satisfaction - 55) / 45) * BALANCE.repEventScale * weight;
    if (repDelta > 0) repDelta *= 1 - s.rep.general / 110;
    if (soldOut) repDelta += BALANCE.repSelloutBonus * (1 - s.rep.general / 110);
    if (isRental) repDelta *= 0.5;
  } else {
    repDelta = -1.5;
  }
  const dk = disciplineRepKey(a.discipline);
  if (b.kind === 'corporate') {
    // eventos de empresas pagam bem mas quase não contam para a reputação cultural
    repDelta *= 0.3;
    s.rep.general = clampRep(s.rep.general + repDelta);
  } else if (b.kind === 'workshop') {
    repDelta *= 0.5;
    s.rep.general = clampRep(s.rep.general + repDelta);
    s.rep.training = clampRep(s.rep.training + Math.max(-1, repDelta * 4 + (satisfaction > 55 ? 1 : 0)));
    if (satisfaction > 55) s.rep.community = clampRep(s.rep.community + 0.5);
  } else {
    s.rep.general = clampRep(s.rep.general + repDelta);
    s.rep[dk] = clampRep(s.rep[dk] + repDelta * 1.5);
  }
  if (upgradeValue(s, b.roomId, 'access') > 0) s.rep.community = clampRep(s.rep.community + 0.2);
  // falta de limpeza prejudica a reputação mesmo com um bom espetáculo
  if (att > 0 && scores.cleanliness < 50) { s.rep.general = clampRep(s.rep.general - 0.5); repDelta -= 0.5; }
  // fidelização por segmento (a consistência de uma temporada reforça os públicos do tema)
  if (att > 0) {
    const bonus: Partial<Record<SegmentId, number>> = {};
    if (se) for (const id of THEME_BY_ID[se.theme].segments) bonus[id] = 0.5 + seasonDemandBoost(s, se, b.startAt).consistency * 5;
    updateLoyalty(s, b.segments, satisfaction, bonus);
  }

  // carreira do artista e relação
  const ast = b.custom ? null : s.artists[a.id];
  if (ast) {
  if (satisfaction > 50 && att > 0) {
    const fill = Math.min(1, att / Math.max(1, b.capacity));
    ast.draw = Math.min(a.draw * 2.5, round2(ast.draw * (1 + 0.02 + 0.08 * ((satisfaction - 50) / 50) * fill)));
  }
  ast.relationship = Math.max(0, Math.min(100, ast.relationship + 4 + (satisfaction - 50) / 8 + upgradeValue(s, b.roomId, 'dressing') * 3));
  ast.shows++;
  ast.lastShowAt = b.startAt;
  ast.history.push({ at: b.startAt, attendance: att, satisfaction: Math.round(satisfaction) });
  if (ast.history.length > 10) ast.history.shift();
  }

  const rent = isRental ? b.contract.rent : 0;
  const net = round2(gross - artistPay + rent + b.stats.barRevenue - b.stats.barCost - energy - cleaning - b.stats.equipmentRental - b.stats.marketingCost);
  let xp = BALANCE.xpPerEvent + att * BALANCE.xpPerAttendee + (satisfaction >= 70 ? BALANCE.xpGoodShow : 0);
  if (isRental) xp *= 0.5;
  if (b.kind === 'workshop') xp *= 0.8;
  xp = Math.round(xp);

  const result: EventResult = {
    attendance: att, capacity: b.capacity, ticketRevenue: round2(b.stats.ticketRevenue), artistPay, rentIncome: rent,
    barRevenue: round2(b.stats.barRevenue), barCost: round2(b.stats.barCost), energy, cleaning,
    equipmentRental: b.stats.equipmentRental, marketing: b.stats.marketingCost, net, quality: Math.round(quality),
    satisfaction: Math.round(satisfaction),
    scores, complaints,
    repDelta: round2(repDelta), xp, soldOut,
  };
  b.result = result;
  b.status = 'settled';

  const p = s.progress;
  p.totalEvents++;
  p.eventsByDiscipline[a.discipline]++;
  if (soldOut) p.soldOuts++;
  if (net > p.bestEventNet) p.bestEventNet = net;
  if (att > 0) {
    p.satisfactionHistory.push(result.satisfaction);
    if (p.satisfactionHistory.length > 5) p.satisfactionHistory.shift();
  }
  p.lastEventAt = s.time;
  addXp(ctx, xp);
  ctx.emit({ type: 'result', bookingId: b.id });
  return result;
}

function clampRep(v: number): number {
  return Math.max(0, Math.min(100, round2(v)));
}
