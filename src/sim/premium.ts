// Experiências premium por evento: VIP, camarotes, meet & greet, bastidores, mecenas e pré-venda para fiéis.
// Vendas de VIP/camarotes/bastidores fecham à abertura de portas; meet & greet e mecenas dependem do espetáculo.

import { artistOf } from '../content/artists';
import { BOX_PRICE_MIN, BOX_PRICE_MUL, PREMIUM, PREMIUM_PROPENSITY, VIP_SHARE_LIMIT } from '../content/premium';
import { SEGMENT_IDS } from '../content/segments';
import { log, type Ctx } from './core';
import { earn, round2, spend } from './economy';
import { hospitalityRider } from './hospitality';
import { onShiftAt } from './staff';
import { isOperational, upgradeValue } from './state';
import type { Booking, GameState, PremiumId, PremiumPlan, PremiumResult, RoomId } from './types';

export const NO_PREMIUM: PremiumPlan = { vip: false, meet: false, backstage: false, patrons: false, presale: false };

export function planOf(b: { premium?: PremiumPlan }): PremiumPlan {
  return b.premium ?? NO_PREMIUM;
}

export function boxSeats(s: GameState, room: RoomId): number {
  return room === 'hall' ? upgradeValue(s, 'hall', 'boxes') : 0;
}

export function vipPrice(ticket: number): number {
  return Math.round(ticket * PREMIUM.vip.priceMul + PREMIUM.vip.priceAdd);
}

export function boxPrice(ticket: number): number {
  return Math.max(BOX_PRICE_MIN, Math.round(ticket * BOX_PRICE_MUL));
}

/** Propensão média do público previsto para experiências premium. */
export function propensity(shares: Booking['segments']): number {
  let p = 0, w = 0;
  for (const id of SEGMENT_IDS) { const sh = shares[id] ?? 0; p += sh * PREMIUM_PROPENSITY[id]; w += sh; }
  return w ? p / w : 0.08;
}

export interface PremiumCtx { kind: Booking['kind']; roomId: RoomId; artistId: string; custom: unknown; contractType: Booking['contract']['type'] }

/** Porque é que uma experiência não está disponível (null = disponível). */
export function premiumError(s: GameState, b: PremiumCtx, id: PremiumId): string | null {
  if (b.kind !== 'show' || b.custom) return 'Só em espetáculos.';
  if (b.contractType === 'rental') return 'Não disponível em alugueres a promotores.';
  const d = PREMIUM[id];
  if (s.level < d.minLevel) return `Desbloqueia no nível ${d.minLevel}.`;
  if (id === 'vip' && !isOperational(s, 'bar')) return 'O VIP inclui bebida: precisa do bar.';
  if (id === 'meet' && upgradeValue(s, b.roomId, 'dressing') < 1) return 'Precisa de camarim nesta sala.';
  if (id === 'backstage' && !s.staff.some((m) => m.role === 'technician')) return 'Precisa de um técnico na equipa.';
  if (id === 'patrons' && s.rep.general < PREMIUM.patrons.minRep) return `Os mecenas só vêm com reputação ${PREMIUM.patrons.minRep}+.`;
  return null;
}

/** Previsão de vendas premium para um público esperado (usada na marcação e à abertura de portas). */
export function premiumEstimate(s: GameState, roomId: RoomId, plan: PremiumPlan, attendance: number, shares: Booking['segments'], ticket: number, satisfaction = 70) {
  const p = propensity(shares);
  const vipCap = Math.min(PREMIUM.vip.capMax, Math.floor(attendance * PREMIUM.vip.capShare));
  const vip = plan.vip ? Math.min(vipCap, Math.round(attendance * p * 1.1)) : 0;
  const seats = boxSeats(s, roomId);
  const boxes = seats ? Math.min(seats, Math.round(seats * Math.min(1, 0.15 + s.rep.general / 100 + p * 2))) : 0;
  const backstage = plan.backstage ? Math.min(PREMIUM.backstage.cap, Math.round(attendance * (0.03 + (shares.creatives ?? 0) * 0.1 + (shares.students ?? 0) * 0.05))) : 0;
  const meet = plan.meet ? Math.min(PREMIUM.meet.cap, Math.round(attendance * 0.08 * Math.max(0, satisfaction - 40) / 30)) : 0;
  const patrons = plan.patrons ? Math.round((60 + s.rep.general * 5) * Math.max(0.4, Math.min(1.3, satisfaction / 70))) : 0;
  const revenue = vip * vipPrice(ticket) + boxes * boxPrice(ticket) + backstage * PREMIUM.backstage.price + meet * PREMIUM.meet.price + patrons;
  const cost = vip * PREMIUM.vip.unitCost + (plan.patrons ? PREMIUM.patrons.cost : 0) + (plan.presale ? PREMIUM.presale.cost : 0) + meet * PREMIUM.meet.price * PREMIUM.meet.artistCut;
  return { vip, boxes, backstage, meet, patrons, revenue: round2(revenue), cost: round2(cost) };
}

/** Na marcação: a pré-venda especial paga-se logo. */
export function premiumAtBooking(ctx: Ctx, b: Booking): void {
  if (planOf(b).presale) { spend(ctx, 'premium', PREMIUM.presale.cost); b.stats.premiumCost = (b.stats.premiumCost ?? 0) + PREMIUM.presale.cost; }
}

/** À abertura de portas: fecham as vendas de VIP, camarotes e bastidores; paga-se o catering dos mecenas. */
export function premiumAtDoors(ctx: Ctx, b: Booking): void {
  const s = ctx.state;
  if (b.kind !== 'show' || b.custom || b.contract.type === 'rental') return;
  const plan = planOf(b);
  const expected = Math.min(b.capacity, b.presold + b.passSeats + b.walkupTarget);
  const est = premiumEstimate(s, b.roomId, plan, expected, b.segments, b.ticketPrice);
  // a visita aos bastidores só acontece com um técnico de serviço
  const tech = s.staff.some((m) => m.role === 'technician' && onShiftAt(m, b.startAt - 60));
  const backstage = tech ? est.backstage : 0;
  b.premiumSold = { vip: est.vip, boxes: est.boxes, backstage };
  const rev = est.vip * vipPrice(b.ticketPrice) + est.boxes * boxPrice(b.ticketPrice) + backstage * PREMIUM.backstage.price;
  const cost = est.vip * PREMIUM.vip.unitCost + (plan.patrons ? PREMIUM.patrons.cost : 0);
  if (rev > 0) earn(ctx, 'premium', rev);
  if (cost > 0) spend(ctx, 'premium', cost);
  b.stats.premiumRevenue = round2((b.stats.premiumRevenue ?? 0) + rev);
  b.stats.premiumCost = round2((b.stats.premiumCost ?? 0) + cost);
  if (plan.backstage && !tech) log(ctx, 'Visita aos bastidores cancelada: nenhum técnico de serviço.', 'bad', false);
  if (rev > 0) log(ctx, `Premium: ${est.vip} VIP, ${est.boxes} em camarote${backstage ? `, ${backstage} na visita aos bastidores` : ''} (+€${round2(rev)}).`, 'money', false);
}

/** Efeito no público geral: demasiados VIP tiram os melhores lugares. Devolve [bónus de satisfação, penalização de conforto]. */
export function premiumSatisfaction(b: Booking): { bonus: number; comfortPenalty: number } {
  const sold = b.premiumSold;
  if (!sold || b.attendees === 0) return { bonus: 0, comfortPenalty: 0 };
  const buyers = sold.vip + sold.backstage + sold.boxes;
  const bonus = Math.min(3, (buyers / b.attendees) * 15);
  const comfortPenalty = sold.vip / b.attendees > VIP_SHARE_LIMIT ? 8 : 0;
  return { bonus, comfortPenalty };
}

/** Na liquidação: meet & greet e mecenas, que dependem de como correu o espetáculo. */
export function premiumAtSettle(ctx: Ctx, b: Booking, satisfaction: number): PremiumResult | undefined {
  const s = ctx.state;
  const plan = planOf(b);
  const sold = b.premiumSold;
  if (!sold && !plan.meet && !plan.patrons && !plan.presale) return undefined;
  const est = premiumEstimate(s, b.roomId, plan, b.attendees, b.segments, b.ticketPrice, satisfaction);
  let rev = 0, cost = 0, artistCut = 0;
  if (est.meet > 0) {
    rev += est.meet * PREMIUM.meet.price;
    artistCut = round2(est.meet * PREMIUM.meet.price * PREMIUM.meet.artistCut);
    spend(ctx, 'artists', artistCut);
    cost += artistCut;
  }
  if (est.patrons > 0) {
    earn(ctx, 'sponsorship', est.patrons);
    if (satisfaction >= 70) s.rep.general = Math.min(100, s.rep.general + 0.3);
    log(ctx, `Os mecenas contribuíram com €${est.patrons}.`, 'money', false);
  }
  if (est.meet > 0) earn(ctx, 'premium', est.meet * PREMIUM.meet.price);
  b.stats.premiumRevenue = round2((b.stats.premiumRevenue ?? 0) + rev + est.patrons);
  b.stats.premiumCost = round2((b.stats.premiumCost ?? 0) + cost);
  return {
    vip: sold?.vip ?? 0, boxes: sold?.boxes ?? 0, backstage: sold?.backstage ?? 0, meet: est.meet, patrons: est.patrons,
    revenue: b.stats.premiumRevenue ?? 0, cost: b.stats.premiumCost ?? 0, artistCut,
  };
}

/** O meet & greet agrada à maioria dos artistas; as estrelas mal acolhidas não gostam. */
export function meetRelation(s: GameState, b: Booking): number {
  if (!planOf(b).meet || b.custom) return 0;
  const a = artistOf(b);
  const req = hospitalityRider(a, false);
  return req >= 3 && upgradeValue(s, b.roomId, 'dressing') < req ? -3 : 1;
}
