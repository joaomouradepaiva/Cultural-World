// Negociação de contratos com artistas: valor, percentagem, condições técnicas, exclusividade e benefícios.
// A resposta é determinística e explicável: uma pontuação de 0–100 com os fatores que a compõem.

import { artistOf } from '../content/artists';
import { BALANCE } from '../content/balance';
import { log, type Ctx } from './core';
import { contractTerms, riderGap, type BookingRequest } from './bookings';
import { dayOf } from './time';
import type { BenefitId, Contract, GameState } from './types';

export interface Offer {
  /** multiplicador sobre o valor de catálogo (cachet, garantia, contribuição) */
  feeFactor: number;
  /** pontos percentuais a mais (+) ou a menos (−) para o artista na bilheteira */
  shareDelta: number;
  techByArtist: boolean;
  exclusive: boolean;
  benefit: BenefitId;
}

export const DEFAULT_OFFER: Offer = { feeFactor: 1, shareDelta: 0, techByArtist: false, exclusive: false, benefit: 'none' };

export const NEGOTIATION = { accept: 70, counter: 50, minFee: 0.6, maxFee: 1.3, maxShareDelta: 0.15 };

export type Outcome = 'accepted' | 'counter' | 'refused';

export function hasFee(c: Contract['type']): boolean {
  return c === 'fixed' || c === 'guarantee' || c === 'coproduction' || c === 'residency';
}

export function hasShare(c: Contract['type']): boolean {
  return c === 'split' || c === 'guarantee' || c === 'coproduction';
}

/** Termos de catálogo com a oferta aplicada. */
export function offeredContract(s: GameState, req: BookingRequest, o: Offer): Contract {
  const c = contractTerms(s, req.artistId, req.contractType, req.roomId);
  if (hasFee(c.type)) { c.fee = Math.round(c.fee * o.feeFactor); c.guarantee = Math.round(c.guarantee * o.feeFactor); }
  if (hasShare(c.type)) c.artistShare = Math.max(0.3, Math.min(0.9, Math.round((c.artistShare + o.shareDelta) * 100) / 100));
  c.techByArtist = o.techByArtist;
  c.exclusive = c.exclusive || o.exclusive;
  c.benefit = o.benefit;
  c.negotiated = true;
  return c;
}

/** Pontuação de aceitação e fatores. Depende de reputação, relação, condições e razoabilidade. */
export function negotiationScore(s: GameState, req: BookingRequest, o: Offer): { score: number; factors: [string, number][]; blocked: string | null } {
  const a = artistOf(req);
  const ast = s.artists[a.id];
  const factors: [string, number][] = [['Base', 55]];
  factors.push(['Relação com o artista', Math.round((ast?.relationship ?? 0) * 0.35)]);
  factors.push(['Reputação da casa', Math.round(Math.max(-15, Math.min(20, (s.rep.general - a.minRep) * 0.4)))]);
  if (hasFee(req.contractType) && o.feeFactor !== 1) factors.push([o.feeFactor < 1 ? 'Valor abaixo do pedido' : 'Valor acima do pedido', Math.round((o.feeFactor - 1) * 120)]);
  if (hasShare(req.contractType) && o.shareDelta !== 0) factors.push([o.shareDelta < 0 ? 'Percentagem menor para o artista' : 'Percentagem maior para o artista', Math.round(o.shareDelta * 200)]);
  if (o.techByArtist) {
    const gap = riderGap(s, req.roomId, a).rental;
    factors.push(['Artista traz o equipamento em falta', gap > 0 ? -Math.min(25, Math.round(6 + gap / 8)) : -2]);
  }
  if (o.exclusive && req.contractType !== 'residency') factors.push(['Exclusividade (30 dias sem tocar na zona)', -10]);
  if (o.benefit === 'catering') factors.push(['Catering completo oferecido', 8]);
  if (o.benefit === 'promo') factors.push([`Promoção conjunta (€${BALANCE.promoBenefitCost})`, 5]);
  const score = Math.max(0, Math.min(100, factors.reduce((t, [, v]) => t + v, 0)));
  let blocked: string | null = null;
  if (hasFee(req.contractType) && o.feeFactor < NEGOTIATION.minFee) blocked = 'Oferta abaixo de 60% do valor: o artista nem responde.';
  const last = s.negotiations[a.id];
  if (last !== undefined && last === dayOf(s.time)) blocked = `${a.name} já recusou hoje. Tenta amanhã.`;
  return { score, factors, blocked };
}

/** Contraproposta: o artista aproxima-se a meio caminho dos seus termos. */
export function counterOffer(o: Offer): Offer {
  return { ...o, feeFactor: Math.round(((o.feeFactor + 1) / 2) * 100) / 100, shareDelta: Math.round((o.shareDelta / 2) * 100) / 100, techByArtist: false };
}

export function negotiate(ctx: Ctx, req: BookingRequest, o: Offer): { outcome: Outcome; score: number; contract: Contract | null; counter: Offer | null; reason?: string } {
  const s = ctx.state;
  const a = artistOf(req);
  if (req.custom || req.contractType === 'rental') return { outcome: 'refused', score: 0, contract: null, counter: null, reason: 'Este contrato não se negocia.' };
  const { score, blocked } = negotiationScore(s, req, o);
  if (blocked) return { outcome: 'refused', score, contract: null, counter: null, reason: blocked };
  if (score >= NEGOTIATION.accept) {
    log(ctx, `${a.name} aceitou as condições propostas.`, 'good');
    return { outcome: 'accepted', score, contract: offeredContract(s, req, o), counter: null };
  }
  if (score >= NEGOTIATION.counter) {
    const c = counterOffer(o);
    log(ctx, `${a.name} fez uma contraproposta.`, 'info');
    return { outcome: 'counter', score, contract: offeredContract(s, req, c), counter: c };
  }
  s.negotiations[a.id] = dayOf(s.time);
  const ast = s.artists[a.id];
  if (ast) ast.relationship = Math.max(0, ast.relationship - 2);
  log(ctx, `${a.name} recusou a proposta (relação −2).`, 'bad');
  return { outcome: 'refused', score, contract: null, counter: null, reason: 'Condições pouco razoáveis para o artista.' };
}
