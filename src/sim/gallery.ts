// Galeria: exposições de vários dias, visitantes ao longo do dia, venda de obras com comissão.

import { BALANCE } from '../content/balance';
import { ARTWORK_SPOTS, GALLERY_ENTRANCE } from '../content/map';
import { ARTWORK_TITLES, EXHIBITION_DAYS, GALLERY_CLOSE, GALLERY_OPEN, VISUAL_ARTISTS, VISUAL_BY_ID, type VisualArtistDef } from '../content/visualArtists';
import { goTo, leaveStreet, makeAgent, setAgentIcon } from './agents';
import { log, newId, type Ctx } from './core';
import { canAfford, earn, round2, spend, today } from './economy';
import { addXp } from './progression';
import { chance, pick, rand, randInt } from './rng';
import { isOperational, upgradeLevel, upgradeValue } from './state';
import { dayOf, fmtDayShort, hourOf, MIN_PER_DAY, weekdayOf } from './time';
import type { Agent, Exhibition, ExhibitionResult, GameState } from './types';

export interface ExhibitionRequest {
  artistId: string;
  startDay: number;
  days: number;
  entryPrice: number;
  /** comissão negociada (proposta); por omissão, a do artista */
  commission?: number;
}

const CROWD_COMFORT = 30;
const ENERGY_PER_DAY = 8;

export function visualUnlocked(s: GameState, a: VisualArtistDef): boolean {
  return s.level >= a.minLevel && s.rep.general >= a.minRep;
}

export function exhibitionEnd(e: { startDay: number; days: number }): number {
  return e.startDay + e.days; // primeiro dia em que já não está aberta
}

export function activeExhibitions(s: GameState): Exhibition[] {
  return s.exhibitions.filter((e) => e.status === 'scheduled' || e.status === 'open');
}

export function exhibitionOn(s: GameState, day: number): Exhibition | undefined {
  return activeExhibitions(s).find((e) => day >= e.startDay && day < exhibitionEnd(e));
}

export function currentExhibition(s: GameState): Exhibition | undefined {
  return s.exhibitions.find((e) => e.status === 'open');
}

export function galleryOpenNow(s: GameState): boolean {
  const h = hourOf(s.time);
  return h >= GALLERY_OPEN && h < GALLERY_CLOSE;
}

export function exhibitionQuality(s: GameState, a: VisualArtistDef): number {
  return Math.max(0, Math.min(100, a.skill * 0.7 + 18 + upgradeValue(s, 'gallery', 'lighting') * 6));
}

/** Visitantes esperados num dia concreto da exposição. */
export function visitorsForDay(s: GameState, a: VisualArtistDef, entryPrice: number, day: number, dayIndex: number): number {
  const rep = 0.75 + 0.75 * ((0.6 * s.rep.general + 0.4 * s.rep.visual) / 100);
  const price = Math.max(0, entryPrice);
  const pf = price === 0 ? 1.5 : Math.min(1.5, Math.pow(a.refPrice / price, 1.2));
  const wd = BALANCE.dayFactors[weekdayOf(day * MIN_PER_DAY)];
  const light = 1 + 0.15 * upgradeValue(s, 'gallery', 'lighting');
  // inauguração atrai mais gente; depois a curiosidade vai caindo
  const curve = dayIndex === 0 ? 1.6 : Math.max(0.7, 1 - dayIndex * 0.04);
  return a.draw * rep * pf * wd * light * curve;
}

export interface ExhibitionForecast {
  visitors: number;
  entry: number;
  works: number;
  expectedSold: number;
  avgPrice: number;
  commissionIncome: number;
  setupCost: number;
  energy: number;
  net: number;
  quality: number;
}

export function exhibitionForecast(s: GameState, req: ExhibitionRequest): ExhibitionForecast {
  const a = VISUAL_BY_ID[req.artistId];
  let visitors = 0;
  for (let i = 0; i < req.days; i++) visitors += visitorsForDay(s, a, req.entryPrice, req.startDay + i, i);
  visitors = Math.round(visitors);
  const works = Math.min(a.works, upgradeValue(s, 'gallery', 'displays'));
  const avgPrice = (a.priceMin + a.priceMax) / 2;
  const buy = a.buyRate * (1 + 0.2 * upgradeValue(s, 'gallery', 'lighting'));
  const expectedSold = Math.min(works, visitors * buy);
  const commission = req.commission ?? a.commission;
  const commissionIncome = expectedSold * avgPrice * commission;
  const entry = visitors * req.entryPrice;
  const energy = ENERGY_PER_DAY * req.days;
  return {
    visitors, entry, works, expectedSold: round2(expectedSold), avgPrice, commissionIncome: round2(commissionIncome),
    setupCost: a.setupCost, energy, net: round2(entry + commissionIncome - a.setupCost - energy), quality: Math.round(exhibitionQuality(s, a)),
  };
}

export function validateExhibition(s: GameState, req: ExhibitionRequest): string[] {
  const errors: string[] = [];
  const a = VISUAL_BY_ID[req.artistId];
  if (!a) return ['Artista desconhecido.'];
  if (!isOperational(s, 'gallery')) errors.push('Constrói primeiro a Galeria.');
  if (!visualUnlocked(s, a)) errors.push(`Requer nível ${a.minLevel} e reputação ${a.minRep}.`);
  if (upgradeLevel(s, 'gallery', 'displays') < a.displays) errors.push(`Precisa de Expositores nível ${a.displays} (${a.medium.toLowerCase()}).`);
  const todayN = dayOf(s.time);
  if (req.startDay < todayN + 1) errors.push('A montagem demora um dia: começa amanhã ou depois.');
  if (req.startDay > todayN + BALANCE.maxAdvanceDays - 1) errors.push(`Só podes programar até ${BALANCE.maxAdvanceDays} dias.`);
  if (!EXHIBITION_DAYS.includes(req.days)) errors.push('Duração inválida.');
  if (req.entryPrice < 0 || req.entryPrice > 30) errors.push('Preço de entrada inválido.');
  const end = req.startDay + req.days;
  const clash = activeExhibitions(s).find((e) => req.startDay < exhibitionEnd(e) && e.startDay < end);
  if (clash) errors.push(`A galeria está ocupada com ${VISUAL_BY_ID[clash.artistId].name} (${fmtDayShort(clash.startDay * MIN_PER_DAY)} – ${fmtDayShort((exhibitionEnd(clash) - 1) * MIN_PER_DAY)}).`);
  if (activeExhibitions(s).some((e) => e.artistId === a.id)) errors.push('Este artista já tem uma exposição marcada.');
  if (!canAfford(s, a.setupCost)) errors.push(`Precisas de €${a.setupCost} para montagem e seguro.`);
  return errors;
}

export function scheduleExhibition(ctx: Ctx, req: ExhibitionRequest): { ok: true; exhibition: Exhibition } | { ok: false; errors: string[] } {
  const s = ctx.state;
  const errors = validateExhibition(s, req);
  if (errors.length) return { ok: false, errors };
  const a = VISUAL_BY_ID[req.artistId];
  const n = Math.min(a.works, upgradeValue(s, 'gallery', 'displays'));
  const titles = [...ARTWORK_TITLES];
  const works = Array.from({ length: n }, () => {
    const t = titles.splice(randInt(s, 0, titles.length - 1), 1)[0] ?? 'Sem título';
    return { title: t, price: Math.round(rand(s, a.priceMin, a.priceMax) / 10) * 10, sold: false };
  });
  spend(ctx, 'exhibitions', a.setupCost);
  const e: Exhibition = {
    id: newId(s), artistId: a.id, startDay: req.startDay, days: req.days, entryPrice: req.entryPrice,
    commission: req.commission ?? a.commission, setupCost: a.setupCost, works, status: 'scheduled', createdAt: s.time,
    visitors: 0, visitorsToday: 0, peakInside: 0, entryRevenue: 0, salesRevenue: 0, energy: 0, result: null,
  };
  s.exhibitions.push(e);
  log(ctx, `Exposição agendada: ${a.name} — ${fmtDayShort(req.startDay * MIN_PER_DAY)}, ${req.days} dias.`, 'good');
  ctx.emit({ type: 'sound', name: 'notify' });
  return { ok: true, exhibition: e };
}

export function cancelExhibition(ctx: Ctx, id: number): boolean {
  const e = ctx.state.exhibitions.find((x) => x.id === id);
  if (!e || e.status !== 'scheduled') return false;
  e.status = 'cancelled';
  log(ctx, `Exposição cancelada: ${VISUAL_BY_ID[e.artistId].name}. A montagem paga não é devolvida.`, 'bad');
  return true;
}

// ------------------------------------------------------------ simulação diária e visitantes

export function processGallery(ctx: Ctx, dt: number): void {
  const s = ctx.state;
  const d = dayOf(s.time);
  for (const e of s.exhibitions) {
    if (e.status === 'scheduled' && d >= e.startDay) {
      e.status = 'open';
      e.visitorsToday = 0;
      log(ctx, `🖼️ Inauguração: ${VISUAL_BY_ID[e.artistId].name} na Galeria!`, 'good');
      ctx.emit({ type: 'sound', name: 'cheer' });
    }
    if (e.status === 'open' && d >= exhibitionEnd(e)) closeExhibition(ctx, e);
  }
  const e = currentExhibition(s);
  if (!e || !isOperational(s, 'gallery') || !galleryOpenNow(s) || s.agents.length > 400) return;
  const a = VISUAL_BY_ID[e.artistId];
  const perDay = visitorsForDay(s, a, e.entryPrice, d, d - e.startDay);
  const perMinute = perDay / ((GALLERY_CLOSE - GALLERY_OPEN - 1) * 60);
  if (chance(s, perMinute * dt)) spawnGalleryVisitor(ctx, e);
  const inside = s.agents.filter((g) => g.kind === 'galleryVisitor' && (g.state === 'view' || g.state === 'to_art')).length;
  if (inside > e.peakInside) e.peakInside = inside;
}

/** Chamado à meia-noite: zera contadores diários e paga energia. */
export function dailyGallery(ctx: Ctx): void {
  const e = currentExhibition(ctx.state);
  if (!e) return;
  e.visitorsToday = 0;
  spend(ctx, 'energy', ENERGY_PER_DAY);
  e.energy += ENERGY_PER_DAY;
}

function spawnGalleryVisitor(ctx: Ctx, e: Exhibition): void {
  const s = ctx.state;
  const st = BALANCE;
  const a = makeAgent(ctx, 'galleryVisitor', [rand(s, 26, 40), rand(s, 20.3, 21.5)], st.visitorSpeed * rand(s, 0.7, 0.95));
  a.bookingId = e.id;
  a.state = 'arrive';
  a.barLeft = randInt(s, 3, 5); // obras a ver
  goTo(ctx, a, GALLERY_ENTRANCE[0] + rand(s, -0.4, 0.4), GALLERY_ENTRANCE[1]);
}

function nextArtwork(ctx: Ctx, a: Agent, e: Exhibition): void {
  const s = ctx.state;
  const i = randInt(s, 0, e.works.length - 1);
  const spot = ARTWORK_SPOTS[i];
  a.seat = i;
  a.state = 'to_art';
  goTo(ctx, a, spot.view[0] + rand(s, -0.25, 0.25), spot.view[1] + rand(s, -0.15, 0.15));
}

export function updateGalleryVisitor(ctx: Ctx, a: Agent, arrived: boolean): void {
  const s = ctx.state;
  if (a.state === 'leave') { if (arrived) a.state = 'gone'; return; }
  const e = s.exhibitions.find((x) => x.id === a.bookingId);
  if (!e || e.status !== 'open' || !galleryOpenNow(s)) { leaveStreet(ctx, a); return; }
  const def = VISUAL_BY_ID[e.artistId];
  switch (a.state) {
    case 'arrive':
      if (!arrived) return;
      e.visitors++;
      e.visitorsToday++;
      s.progress.totalVisitors++;
      today(s).visitors++;
      if (e.entryPrice > 0) {
        e.entryRevenue = round2(e.entryRevenue + e.entryPrice);
        earn(ctx, 'gallery', e.entryPrice, { x: GALLERY_ENTRANCE[0], y: GALLERY_ENTRANCE[1] });
      }
      nextArtwork(ctx, a, e);
      return;
    case 'to_art':
      if (!arrived) return;
      a.state = 'view';
      a.timer = s.time + rand(s, 3, 7);
      return;
    case 'view': {
      if (s.time < a.timer) return;
      const work = e.works[a.seat];
      const p = (def.buyRate * (1 + 0.2 * upgradeValue(s, 'gallery', 'lighting'))) / 4;
      if (work && !work.sold && chance(s, p)) {
        work.sold = true;
        e.salesRevenue = round2(e.salesRevenue + work.price);
        const commission = round2(work.price * e.commission);
        const spot = ARTWORK_SPOTS[a.seat];
        earn(ctx, 'gallery', commission, { x: spot.view[0], y: spot.view[1] });
        s.progress.artworksSold = (s.progress.artworksSold ?? 0) + 1;
        setAgentIcon(s, a, 'heart', 20);
        log(ctx, `🔴 Vendida: “${work.title}” de ${def.name} por €${work.price} (comissão €${commission}).`, 'money');
        ctx.emit({ type: 'sound', name: 'coin' });
      }
      a.barLeft--;
      if (a.barLeft > 0) nextArtwork(ctx, a, e);
      else leaveStreet(ctx, a);
      return;
    }
  }
}

function closeExhibition(ctx: Ctx, e: Exhibition): ExhibitionResult {
  const s = ctx.state;
  const a = VISUAL_BY_ID[e.artistId];
  const quality = exhibitionQuality(s, a);
  const value = e.entryPrice === 0 ? 100 : Math.max(20, Math.min(100, 100 - 50 * (e.entryPrice / a.refPrice - 1)));
  const crowd = e.peakInside <= CROWD_COMFORT ? 100 : Math.max(0, 100 - ((e.peakInside - CROWD_COMFORT) / CROWD_COMFORT) * 100);
  const satisfaction = e.visitors ? quality * 0.6 + value * 0.25 + crowd * 0.15 : 0;
  const weight = Math.max(0.3, Math.min(1.2, Math.log10(e.visitors + 1) / 2));
  let repDelta = e.visitors ? ((satisfaction - 55) / 45) * 4 * weight : -1;
  if (repDelta > 0) repDelta *= 1 - s.rep.visual / 110;
  s.rep.visual = Math.max(0, Math.min(100, round2(s.rep.visual + repDelta * 1.5)));
  s.rep.general = Math.max(0, Math.min(100, round2(s.rep.general + repDelta * 0.4)));
  const commission = round2(e.works.filter((w) => w.sold).reduce((t, w) => t + w.price * e.commission, 0));
  const xp = Math.round(15 + e.visitors / 4);
  const result: ExhibitionResult = {
    visitors: e.visitors, entryRevenue: e.entryRevenue, salesRevenue: e.salesRevenue, commission,
    worksSold: e.works.filter((w) => w.sold).length, setupCost: e.setupCost, energy: e.energy,
    net: round2(e.entryRevenue + commission - e.setupCost - e.energy), quality: Math.round(quality),
    satisfaction: Math.round(satisfaction), repDelta: round2(repDelta), xp,
  };
  e.result = result;
  e.status = 'closed';
  s.progress.exhibitions = (s.progress.exhibitions ?? 0) + 1;
  for (const g of s.agents) if (g.kind === 'galleryVisitor' && g.bookingId === e.id) leaveStreet(ctx, g);
  addXp(ctx, xp);
  log(ctx, `Exposição encerrada: ${a.name} · ${e.visitors} visitantes · ${result.worksSold} obras vendidas · resultado €${result.net}.`, result.net >= 0 ? 'good' : 'bad');
  return result;
}

// ------------------------------------------------------------ propostas

export function exhibitionProposalData(s: GameState) {
  if (!isOperational(s, 'gallery')) return null;
  const pending = new Set(s.inbox.map((p) => p.artistId));
  const pool = VISUAL_ARTISTS.filter((a) => visualUnlocked(s, a) && upgradeLevel(s, 'gallery', 'displays') >= a.displays && !pending.has(a.id) && !activeExhibitions(s).some((e) => e.artistId === a.id));
  if (!pool.length) return null;
  const a = pick(s, pool);
  const days = pick(s, EXHIBITION_DAYS);
  const todayN = dayOf(s.time);
  for (let t = 0; t < 8; t++) {
    const startDay = todayN + randInt(s, 2, BALANCE.maxAdvanceDays - days);
    const req: ExhibitionRequest = { artistId: a.id, startDay, days, entryPrice: a.refPrice, commission: Math.min(0.5, round2(a.commission + 0.05)) };
    const clashP = s.inbox.some((p) => p.kind === 'exhibition' && p.exhibition && startDay < Math.floor(p.startAt / MIN_PER_DAY) + p.exhibition.days && Math.floor(p.startAt / MIN_PER_DAY) < startDay + days);
    if (!clashP && validateExhibition(s, req).length === 0) return { a, req };
  }
  return null;
}
