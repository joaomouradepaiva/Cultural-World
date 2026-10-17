// Imprevistos e oportunidades com escolhas simples e consequências claras.

import { ARTIST_BY_ID } from '../content/artists';
import { BALANCE } from '../content/balance';
import { log, type Ctx } from './core';
import { canAfford, earn, spend } from './economy';
import { chance, pick, randInt } from './rng';
import { recomputeTargets } from './bookings';
import type { GameState } from './types';

export interface Choice { label: string; hint: string }

export interface RandomEventDef {
  id: string;
  title: string;
  text: (s: GameState, d: Record<string, number>) => string;
  available: (s: GameState) => boolean;
  data: (s: GameState) => Record<string, number>;
  choices: (s: GameState, d: Record<string, number>) => Choice[];
  resolve: (ctx: Ctx, choice: number, d: Record<string, number>) => void;
}

const upcoming = (s: GameState) => s.bookings.filter((b) => b.status === 'scheduled');

export const RANDOM_EVENTS: RandomEventDef[] = [
  {
    id: 'viral', title: 'Está a ficar viral!',
    available: (s) => upcoming(s).length > 0,
    data: (s) => ({ booking: pick(s, upcoming(s)).id }),
    text: (s, d) => `Um vídeo de ${ARTIST_BY_ID[s.bookings.find((b) => b.id === d.booking)!.artistId].name} está a circular nas redes. A procura vai subir.`,
    choices: () => [
      { label: 'Aproveitar com um post patrocinado (€80)', hint: '+50% procura' },
      { label: 'Deixar correr', hint: '+30% procura' },
    ],
    resolve: (ctx, c, d) => {
      const b = ctx.state.bookings.find((x) => x.id === d.booking);
      if (!b) return;
      if (c === 0 && canAfford(ctx.state, 80)) { spend(ctx, 'marketing', 80); b.demandBoost *= 1.5; } else b.demandBoost *= 1.3;
      recomputeTargets(ctx.state, b);
      log(ctx, 'A procura disparou!', 'good');
    },
  },
  {
    id: 'breakdown', title: 'Avaria técnica',
    available: () => true,
    data: (s) => ({ cost: 150 + randInt(s, 0, 6) * 25 }),
    text: (_s, d) => `A mesa de mistura deixou de funcionar. Reparar custa €${d.cost}. Sem reparação, os próximos 3 eventos perdem qualidade.`,
    choices: (_s, d) => [
      { label: `Reparar já (€${d.cost})`, hint: 'Sem impacto na qualidade' },
      { label: 'Desenrascar', hint: '−10 qualidade em 3 eventos' },
    ],
    resolve: (ctx, c, d) => {
      if (c === 0 && canAfford(ctx.state, d.cost)) { spend(ctx, 'maintenance', d.cost); log(ctx, 'Equipamento reparado.', 'info'); }
      else { ctx.state.modifiers.qualityPenaltyEvents = 3; log(ctx, 'Os técnicos vão ter de improvisar.', 'bad'); }
    },
  },
  {
    id: 'sponsor', title: 'Proposta de patrocínio',
    available: (s) => s.rep.general >= 20,
    data: (s) => ({ amount: 400 + Math.round(s.rep.general * 15) }),
    text: (_s, d) => `Uma marca de bebidas oferece €${d.amount} para pôr a marca no átrio durante um mês. Parte do público pode torcer o nariz.`,
    choices: (_s, d) => [
      { label: `Aceitar (+€${d.amount})`, hint: '−2 comunidade' },
      { label: 'Recusar', hint: '+1 comunidade' },
    ],
    resolve: (ctx, c, d) => {
      const s = ctx.state;
      if (c === 0) { earn(ctx, 'sponsorship', d.amount); s.rep.community = Math.max(0, s.rep.community - 2); }
      else s.rep.community = Math.min(100, s.rep.community + 1);
    },
  },
  {
    id: 'association', title: 'Associação do bairro',
    available: () => true,
    data: () => ({ cost: 60 }),
    text: () => 'A associação de moradores pede o espaço para uma assembleia gratuita. Custa-te €60 em energia e limpeza.',
    choices: () => [
      { label: 'Ceder o espaço (€60)', hint: '+4 comunidade, +1 reputação' },
      { label: 'Recusar', hint: '−1 comunidade' },
    ],
    resolve: (ctx, c, d) => {
      const s = ctx.state;
      if (c === 0 && canAfford(s, d.cost)) {
        spend(ctx, 'energy', d.cost);
        s.rep.community = Math.min(100, s.rep.community + 4);
        s.rep.general = Math.min(100, s.rep.general + 1);
        log(ctx, 'O bairro agradece!', 'good');
      } else s.rep.community = Math.max(0, s.rep.community - 1);
    },
  },
  {
    id: 'patron', title: 'Um mecenas',
    available: (s) => s.rep.general >= 30 && s.rep.community >= 10,
    data: (s) => ({ amount: 300 + Math.round(s.rep.community * 20) }),
    text: (_s, d) => `Uma mecenas gostou do teu trabalho com a comunidade e quer doar €${d.amount} para programação.`,
    choices: (_s, d) => [{ label: `Aceitar (+€${d.amount})`, hint: 'Mecenato' }],
    resolve: (ctx, _c, d) => earn(ctx, 'sponsorship', d.amount),
  },
  {
    id: 'inspection', title: 'Inspeção',
    available: () => true,
    data: () => ({ cost: 250 }),
    text: () => 'Uma inspeção encontrou falhas na sinalética de emergência. Podes corrigir já ou arriscar uma má imagem.',
    choices: () => [
      { label: 'Corrigir (€250)', hint: 'Sem consequências' },
      { label: 'Ignorar', hint: '−3 reputação' },
    ],
    resolve: (ctx, c, d) => {
      const s = ctx.state;
      if (c === 0 && canAfford(s, d.cost)) spend(ctx, 'maintenance', d.cost);
      else s.rep.general = Math.max(0, s.rep.general - 3);
    },
  },
];

export const RANDOM_EVENT_BY_ID = Object.fromEntries(RANDOM_EVENTS.map((e) => [e.id, e]));

export function rollRandomEvent(ctx: Ctx): void {
  const s = ctx.state;
  if (s.pendingEvent || s.level < BALANCE.randomEventMinLevel) return;
  if (!chance(s, BALANCE.randomEventDailyChance)) return;
  const pool = RANDOM_EVENTS.filter((e) => e.available(s));
  if (!pool.length) return;
  const ev = pick(s, pool);
  s.pendingEvent = { id: ev.id, createdAt: s.time, data: ev.data(s) };
  ctx.emit({ type: 'decision' });
  ctx.emit({ type: 'sound', name: 'notify' });
}

export function resolveRandomEvent(ctx: Ctx, choice: number): void {
  const s = ctx.state;
  const pe = s.pendingEvent;
  if (!pe) return;
  s.pendingEvent = null;
  RANDOM_EVENT_BY_ID[pe.id]?.resolve(ctx, choice, pe.data);
}
