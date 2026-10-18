// Temporadas culturais: ciclos temáticos com campanha conjunta, passes, objetivos e indicadores.

import { artistOf, type ArtistDef } from '../content/artists';
import { SEASON_DURATIONS, SEASON_LIMITS, THEME_BY_ID, type ThemeId } from '../content/seasons';
import { log, newId, type Ctx } from './core';
import { canAfford, earn, round2, spend } from './economy';
import { updateLoyalty } from './audience';
import { dayOf, fmtDayShort, MIN_PER_DAY } from './time';
import type { Booking, GameState, Season, SeasonDuration, SeasonResult } from './types';
import type { SegmentId } from '../content/segments';

export interface SeasonRequest {
  name: string;
  theme: ThemeId;
  duration: SeasonDuration;
  startDay: number;
  budget: number;
  passEnabled: boolean;
  passPrice: number;
}

export function seasonOpen(se: Season): boolean {
  return se.status === 'planned' || se.status === 'active';
}

/** Temporada a que um evento pertence automaticamente (tema compatível e data dentro do período). */
export function seasonFor(s: GameState, a: ArtistDef, artistId: string, startAt: number): Season | undefined {
  const d = dayOf(startAt);
  return s.seasons.find((se) => seasonOpen(se) && d >= se.startDay && d < se.endDay && THEME_BY_ID[se.theme].matches(a, artistId));
}

export function seasonBookings(s: GameState, se: Season): Booking[] {
  return s.bookings.filter((b) => b.seasonId === se.id && b.status !== 'cancelled');
}

/** Bónus de procura de um evento da temporada: consistência do ciclo + campanha conjunta. */
export function seasonDemandBoost(s: GameState, se: Season, startAt: number): { consistency: number; campaign: number } {
  const held = seasonBookings(s, se).filter((b) => b.startAt < startAt && (b.status === 'settled' || b.status === 'ended' || b.status === 'live')).length;
  const consistency = Math.min(SEASON_LIMITS.consistencyMax, held * SEASON_LIMITS.consistencyPerEvent);
  const days = se.endDay - se.startDay;
  const campaign = Math.min(SEASON_LIMITS.campaignMax, se.budget / (days * SEASON_LIMITS.campaignPerDay));
  return { consistency, campaign };
}

/** Lugares reservados por detentores de passe num evento da temporada. */
export function passSeatsFor(se: Season | undefined, capacity: number): number {
  if (!se || !se.pass.enabled) return 0;
  return Math.min(Math.floor(capacity * 0.6), Math.round(se.pass.sold * SEASON_LIMITS.passAttendRate));
}

/** Procura de passes: depende da fidelização dos segmentos do tema, da duração e do preço. */
export function passDemand(s: GameState, req: Pick<SeasonRequest, 'theme' | 'duration' | 'passPrice'>): { target: number; refPrice: number } {
  const theme = THEME_BY_ID[req.theme];
  const loyalty = theme.segments.reduce((t, id) => t + s.audience[id], 0) / theme.segments.length;
  const dur = SEASON_DURATIONS[req.duration];
  const refPrice = Math.round(dur.objectives.events * 9 * 0.6);
  const durMul = { week: 0.5, month: 1, quarter: 1.8, year: 3 }[req.duration];
  const pf = Math.min(1.6, Math.pow(refPrice / Math.max(1, req.passPrice), 1.5));
  return { target: Math.max(0, Math.round((3 + loyalty * 0.35 + s.rep.general * 0.08) * durMul * pf)), refPrice };
}

export function validateSeason(s: GameState, req: SeasonRequest): string[] {
  const errors: string[] = [];
  const theme = THEME_BY_ID[req.theme];
  if (!theme) return ['Tema desconhecido.'];
  if (theme.locked) errors.push(theme.locked);
  if (theme.exhibitions && req.theme === 'visual' && !s.rooms.gallery.built) errors.push('Artes Visuais requer a Galeria.');
  if (!req.name.trim()) errors.push('Dá um nome à temporada.');
  const today = dayOf(s.time);
  if (req.startDay < today || req.startDay > today + 13) errors.push('A temporada começa entre hoje e daqui a 13 dias.');
  if (s.seasons.filter(seasonOpen).length >= SEASON_LIMITS.maxActive) errors.push(`Máximo de ${SEASON_LIMITS.maxActive} temporadas em simultâneo.`);
  const end = req.startDay + SEASON_DURATIONS[req.duration].days;
  if (s.seasons.some((se) => seasonOpen(se) && se.theme === req.theme && req.startDay < se.endDay && se.startDay < end)) errors.push('Já existe uma temporada deste tema nessas datas.');
  if (req.budget < 0 || req.budget > 20000) errors.push('Orçamento inválido.');
  if (req.passEnabled && (req.passPrice < 5 || req.passPrice > 500)) errors.push('Preço do passe entre €5 e €500.');
  if (!canAfford(s, req.budget)) errors.push(`Precisas de €${req.budget} para a campanha.`);
  return errors;
}

export function createSeason(ctx: Ctx, req: SeasonRequest): { ok: true; season: Season } | { ok: false; errors: string[] } {
  const s = ctx.state;
  const errors = validateSeason(s, req);
  if (errors.length) return { ok: false, errors };
  const dur = SEASON_DURATIONS[req.duration];
  const se: Season = {
    id: newId(s), name: req.name.trim(), theme: req.theme, duration: req.duration, startDay: req.startDay, endDay: req.startDay + dur.days,
    budget: req.budget, status: req.startDay <= dayOf(s.time) ? 'active' : 'planned', createdAt: s.time, result: null,
    objectives: [
      { kind: 'events', target: dur.objectives.events },
      { kind: 'occupancy', target: dur.objectives.occupancy },
      { kind: 'satisfaction', target: dur.objectives.satisfaction },
    ],
    pass: { enabled: req.passEnabled, price: req.passPrice, sold: 0, target: req.passEnabled ? passDemand(s, req).target : 0, revenue: 0 },
  };
  if (req.budget > 0) spend(ctx, 'marketing', req.budget);
  s.seasons.push(se);
  // eventos já marcados que encaixam no tema passam a fazer parte da temporada
  for (const b of s.bookings) {
    if (b.seasonId !== null || (b.status !== 'scheduled' && b.status !== 'setup')) continue;
    const a = artistOf(b);
    if (seasonFor(s, a, b.artistId, b.startAt)?.id === se.id) b.seasonId = se.id;
  }
  log(ctx, `Temporada criada: ${se.name} (${THEME_BY_ID[se.theme].name}, ${dur.name.toLowerCase()} a partir de ${fmtDayShort(se.startDay * MIN_PER_DAY)}).`, 'good');
  ctx.emit({ type: 'sound', name: 'mission' });
  return { ok: true, season: se };
}

export function cancelSeason(ctx: Ctx, id: number): boolean {
  const s = ctx.state;
  const se = s.seasons.find((x) => x.id === id);
  if (!se || se.status !== 'planned') return false;
  se.status = 'cancelled';
  if (se.pass.revenue > 0) spend(ctx, 'refunds', se.pass.revenue);
  for (const b of s.bookings) if (b.seasonId === id) { b.seasonId = null; b.passSeats = 0; }
  log(ctx, `Temporada cancelada: ${se.name}. Passes reembolsados; a campanha paga não é devolvida.`, 'bad');
  return true;
}

/** Venda progressiva de passes até ao início, ativação e encerramento. */
export function processSeasons(ctx: Ctx): void {
  const s = ctx.state;
  const d = dayOf(s.time);
  for (const se of s.seasons) {
    if (se.status === 'planned' && d >= se.startDay) {
      se.status = 'active';
      log(ctx, `🎭 Arrancou a temporada ${se.name}!`, 'good');
    }
    if (se.pass.enabled && seasonOpen(se) && se.pass.sold < se.pass.target) {
      // vende até ao fim do primeiro terço da temporada
      const sellEnd = se.startDay + Math.max(2, Math.round((se.endDay - se.startDay) / 3));
      const p = Math.min(1, (s.time - se.createdAt) / Math.max(1, sellEnd * MIN_PER_DAY - se.createdAt));
      const want = Math.floor(se.pass.target * Math.sqrt(Math.max(0, p)));
      while (se.pass.sold < want) {
        se.pass.sold++;
        se.pass.revenue = round2(se.pass.revenue + se.pass.price);
        earn(ctx, 'tickets', se.pass.price, { x: 2.5, y: 13.5 });
      }
      // os eventos ainda por acontecer reservam lugares para os novos passes
      // (sem nunca sobrelotar: os passes só ocupam lugares ainda livres)
      for (const b of seasonBookings(s, se)) if (b.status === 'scheduled') b.passSeats = Math.max(b.passSeats, Math.min(passSeatsFor(se, b.capacity), b.capacity - b.presold - b.doorSold));
    }
    if (se.status === 'active' && d >= se.endDay) closeSeason(ctx, se);
  }
}

export function seasonIndicators(s: GameState, se: Season): SeasonResult {
  const bs = seasonBookings(s, se);
  const done = bs.filter((b) => b.result);
  const tickets = bs.reduce((t, b) => t + b.presold + b.doorSold, 0);
  const att = done.reduce((t, b) => t + b.result!.attendance, 0);
  const cap = done.reduce((t, b) => t + b.result!.capacity, 0);
  const revenue = round2(done.reduce((t, b) => t + b.result!.ticketRevenue + b.result!.barRevenue + b.result!.rentIncome, 0) + se.pass.revenue);
  const costs = round2(done.reduce((t, b) => t + b.result!.artistPay + b.result!.barCost + b.result!.energy + b.result!.cleaning + b.result!.equipmentRental + b.result!.marketing + (b.result!.hospitality ?? 0), 0) + se.budget);
  const satisfaction = done.length ? Math.round(done.reduce((t, b) => t + b.result!.satisfaction, 0) / done.length) : 0;
  const repDelta = round2(done.reduce((t, b) => t + b.result!.repDelta, 0));
  const occupancy = cap ? att / cap : 0;
  const r: SeasonResult = { events: done.length, tickets, passes: se.pass.sold, occupancy, revenue, costs, profit: round2(revenue - costs), satisfaction, repDelta, objectivesMet: 0 };
  r.objectivesMet = se.objectives.filter((o) => objectiveValue(r, o.kind) >= o.target).length;
  return r;
}

export function objectiveValue(r: SeasonResult, kind: Season['objectives'][number]['kind']): number {
  return kind === 'events' ? r.events : kind === 'occupancy' ? r.occupancy : kind === 'satisfaction' ? r.satisfaction : r.tickets;
}

function closeSeason(ctx: Ctx, se: Season): void {
  const s = ctx.state;
  const r = seasonIndicators(s, se);
  se.result = r;
  se.status = 'closed';
  // objetivos cumpridos: reputação e fidelização dos públicos do tema (sem dinheiro extra)
  const rep = r.objectivesMet * 1.5;
  s.rep.general = Math.min(100, round2(s.rep.general + rep * (1 - s.rep.general / 110)));
  const theme = THEME_BY_ID[se.theme];
  const shares: Partial<Record<SegmentId, number>> = {};
  for (const id of theme.segments) shares[id] = 1 / theme.segments.length;
  if (r.objectivesMet > 0) updateLoyalty(s, shares, 55 + r.objectivesMet * 12);
  log(ctx, `Temporada encerrada: ${se.name} · ${r.events} eventos · ocupação ${Math.round(r.occupancy * 100)}% · resultado €${r.profit} · ${r.objectivesMet}/${se.objectives.length} objetivos.`, r.profit >= 0 ? 'good' : 'bad');
}
