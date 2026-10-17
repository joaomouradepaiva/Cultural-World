// Contexto partilhado pelos sistemas da simulação + eventos para a camada visual.

import type { NavGrid } from './grid';
import type { GameState } from './types';

export type SoundName = 'coin' | 'cheer' | 'applause' | 'build' | 'levelup' | 'notify' | 'error' | 'ticket' | 'drink' | 'click' | 'mission';

export type SimEvent =
  | { type: 'coin'; x: number; y: number; amount: number }
  | { type: 'toast'; text: string; kind: 'info' | 'good' | 'bad' | 'money' }
  | { type: 'sound'; name: SoundName }
  | { type: 'result'; bookingId: number }
  | { type: 'levelup'; level: number; unlocks: string[] }
  | { type: 'decision' }
  | { type: 'fx'; kind: 'sparkle' | 'confetti' | 'dust'; x: number; y: number }
  | { type: 'mission'; id: string }
  | { type: 'showStart'; bookingId: number }
  | { type: 'showEnd'; bookingId: number };

export interface Ctx {
  state: GameState;
  grid: NavGrid;
  emit(e: SimEvent): void;
}

export function log(ctx: Ctx, text: string, kind: 'info' | 'good' | 'bad' | 'money' = 'info', toast = true): void {
  ctx.state.log.unshift({ t: ctx.state.time, text, kind });
  if (ctx.state.log.length > 60) ctx.state.log.length = 60;
  if (toast) ctx.emit({ type: 'toast', text, kind });
}

export function newId(state: GameState): number {
  return state.nextId++;
}
