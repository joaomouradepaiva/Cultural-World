// Segmentos de público: procura por segmento, fidelização e escolha do segmento de cada visitante.

import type { ArtistDef } from '../content/artists';
import { BALANCE } from '../content/balance';
import { audienceMix, SEGMENTS, SEGMENT_IDS, type SegmentId } from '../content/segments';
import { rand } from './rng';
import { hourOf, weekdayOf } from './time';
import type { Booking, GameState } from './types';

export function initialAudience(): Record<SegmentId, number> {
  const out = {} as Record<SegmentId, number>;
  for (const id of SEGMENT_IDS) out[id] = id === 'community' ? 12 : 5;
  return out;
}

export function loyaltyFactor(loyalty: number): number {
  return 0.95 + 0.3 * (loyalty / 100);
}

export interface SegmentDemand {
  /** multiplicador agregado (substitui o fator de preço do modelo antigo) */
  factor: number;
  /** quota de cada segmento na procura resultante (soma 1) */
  shares: Record<SegmentId, number>;
}

/** Combina a mistura de público do artista com preço, hora, dia e fidelização de cada segmento. */
export function segmentDemand(s: GameState, a: ArtistDef, startAt: number, price: number): SegmentDemand {
  const mix = audienceMix(a);
  const h = hourOf(startAt), wd = weekdayOf(startAt);
  const ratio = a.refPrice / Math.max(0.5, price);
  const contrib = {} as Record<SegmentId, number>;
  let total = 0;
  for (const id of SEGMENT_IDS) {
    const seg = SEGMENTS[id];
    if (!mix[id]) { contrib[id] = 0; continue; }
    const pf = Math.min(BALANCE.maxPriceFactor, Math.pow(ratio, seg.elasticity));
    const v = mix[id] * seg.hour(h) * seg.day(wd) * pf * loyaltyFactor(s.audience?.[id] ?? 5);
    contrib[id] = v;
    total += v;
  }
  const shares = {} as Record<SegmentId, number>;
  for (const id of SEGMENT_IDS) shares[id] = total ? contrib[id] / total : 0;
  return { factor: total, shares };
}

/** Sorteia o segmento de um visitante a partir da mistura do evento. */
export function pickSegment(s: GameState, b: Booking): SegmentId {
  let r = rand(s);
  for (const id of SEGMENT_IDS) {
    r -= b.segments[id] ?? 0;
    if (r <= 0) return id;
  }
  return 'community';
}

export function pickCasualSegment(s: GameState, gallery = false): SegmentId {
  const pool: SegmentId[] = gallery ? ['tourists', 'creatives', 'creatives', 'students', 'community', 'families'] : ['community', 'community', 'creatives', 'students', 'tourists', 'corporate'];
  return pool[Math.floor(rand(s) * pool.length)];
}

/** Atualiza a fidelização depois de um evento, ponderada pela quota de cada segmento. */
export function updateLoyalty(s: GameState, shares: Partial<Record<SegmentId, number>>, satisfaction: number, bonus: Partial<Record<SegmentId, number>> = {}): void {
  for (const id of SEGMENT_IDS) {
    const share = shares[id] ?? 0;
    if (!share) continue;
    const delta = ((satisfaction - 55) / 45) * 8 * share * SEGMENTS[id].loyaltyRate * (1 + (bonus[id] ?? 0));
    s.audience[id] = Math.max(0, Math.min(100, Math.round((s.audience[id] + delta) * 100) / 100));
  }
}

/** Fidelização decai devagar sem estímulo. */
export function dailyAudience(s: GameState): void {
  for (const id of SEGMENT_IDS) if (s.audience[id] > 10) s.audience[id] = Math.round((s.audience[id] - 0.05) * 100) / 100;
}

/** Interesse médio em workshops, ponderado pela fidelização (afeta inscrições). */
export function workshopInterest(s: GameState): number {
  let t = 0;
  for (const id of SEGMENT_IDS) t += SEGMENTS[id].workshop * s.audience[id];
  return t / SEGMENT_IDS.length;
}
