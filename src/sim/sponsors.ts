// Contratos de patrocínio: uma marca paga por cada espetáculo num período, em troca de visibilidade.
// Obrigações reais: mínimo de espetáculos no período, senão devolve-se metade do recebido e perde-se reputação.

import { log, newId, type Ctx } from './core';
import { earn, round2, spend } from './economy';
import { pick, randInt } from './rng';
import { dayOf, MIN_PER_DAY } from './time';
import type { Booking, GameState, Proposal, Sponsorship } from './types';

const BRANDS: [string, string][] = [
  ['Cervejaria Tágide', '#f4a261'], ['Café Aurora', '#6d4c41'], ['Rádio Onda Livre', '#e63946'], ['Banco Atlântico', '#1d3557'],
  ['Verde Energia', '#2a9d8f'], ['Livraria Prelo', '#8338ec'], ['Ótica Lince', '#ffbe0b'], ['Telecom Faro', '#0077b6'],
];

export const SPONSOR_MIN_LEVEL = 3;

export function activeSponsorship(s: GameState, day = dayOf(s.time)): Sponsorship | undefined {
  return s.sponsorships.find((x) => x.status === 'active' && day >= x.startDay && day < x.endDay);
}

export function sponsorProposal(s: GameState): Proposal | null {
  if (s.level < SPONSOR_MIN_LEVEL || s.sponsorships.some((x) => x.status === 'active') || s.inbox.some((p) => p.kind === 'sponsor')) return null;
  const [name, color] = pick(s, BRANDS);
  const days = pick(s, [14, 21, 28]);
  const minEvents = Math.max(3, Math.round(days / 7) * randInt(s, 2, 3));
  const perEvent = Math.round(25 + s.rep.general * 1.6 + s.level * 8);
  return {
    id: newId(s), kind: 'sponsor', createdAt: s.time, expiresAt: s.time + 2 * MIN_PER_DAY, seen: false,
    roomId: 'hall', startAt: s.time + 3 * MIN_PER_DAY, from: name, title: `Patrocínio — ${name}`,
    text: `Pagamos €${perEvent} por espetáculo durante ${days} dias, com o nosso logótipo no átrio. Pedimos pelo menos ${minEvents} espetáculos no período; se não cumprirem, devolvem metade.`,
    artistId: `sponsor-${name}`, custom: null, contract: { type: 'rental', fee: 0, artistShare: 0, guarantee: 0, rent: 0 }, ticketPrice: 0, participants: 0,
    sponsor: { perEvent, days, minEvents, minRep: Math.round(15 + s.level * 3), color },
  };
}

export function sponsorErrors(s: GameState, p: Proposal): string[] {
  const e: string[] = [];
  if (!p.sponsor) return ['Proposta inválida.'];
  if (s.sponsorships.some((x) => x.status === 'active')) e.push('Já tens um patrocinador ativo (exclusividade).');
  if (s.rep.general < p.sponsor.minRep) e.push(`A marca exige reputação ${p.sponsor.minRep}.`);
  return e;
}

export function acceptSponsor(ctx: Ctx, p: Proposal): boolean {
  const s = ctx.state;
  if (!p.sponsor || sponsorErrors(s, p).length) return false;
  const startDay = dayOf(s.time);
  s.sponsorships.push({
    id: newId(s), name: p.from, perEvent: p.sponsor.perEvent, startDay, endDay: startDay + p.sponsor.days,
    minEvents: p.sponsor.minEvents, events: 0, paid: 0, color: p.sponsor.color, status: 'active',
  });
  log(ctx, `Contrato de patrocínio assinado com ${p.from}.`, 'good');
  return true;
}

/** Pagamento por espetáculo (chamado na liquidação). */
export function sponsorEvent(ctx: Ctx, b: Booking): number {
  if (b.kind !== 'show' || b.attendees === 0) return 0;
  const sp = activeSponsorship(ctx.state, dayOf(b.startAt));
  if (!sp) return 0;
  sp.events++;
  sp.paid = round2(sp.paid + sp.perEvent);
  earn(ctx, 'sponsorship', sp.perEvent);
  return sp.perEvent;
}

/** Fecho dos contratos que terminaram. */
export function dailySponsors(ctx: Ctx): void {
  const s = ctx.state;
  const d = dayOf(s.time);
  for (const sp of s.sponsorships) {
    if (sp.status !== 'active' || d + 1 < sp.endDay) continue;
    if (sp.events >= sp.minEvents) {
      sp.status = 'done';
      s.rep.general = Math.min(100, s.rep.general + 0.5);
      log(ctx, `Patrocínio ${sp.name} cumprido: ${sp.events} espetáculos, €${sp.paid}. A marca ficou satisfeita.`, 'good');
    } else {
      sp.status = 'failed';
      const refund = round2(sp.paid / 2);
      if (refund > 0) spend(ctx, 'refunds', refund);
      s.rep.general = Math.max(0, s.rep.general - 1);
      log(ctx, `Patrocínio ${sp.name} incumprido (${sp.events}/${sp.minEvents} espetáculos): devolves €${refund} e perdes reputação.`, 'bad');
    }
  }
}
