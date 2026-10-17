// RNG determinístico (mulberry32). O estado vive no GameState para o save ser reprodutível.

import type { GameState } from './types';

export function nextRandom(state: { rngState: number }): number {
  let t = (state.rngState = (state.rngState + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function rand(state: GameState, min = 0, max = 1): number {
  return min + nextRandom(state) * (max - min);
}

export function randInt(state: GameState, min: number, maxInclusive: number): number {
  return Math.floor(rand(state, min, maxInclusive + 1));
}

export function chance(state: GameState, p: number): boolean {
  return nextRandom(state) < p;
}

export function pick<T>(state: GameState, arr: readonly T[]): T {
  return arr[Math.floor(nextRandom(state) * arr.length)];
}

/** Hash determinístico para variação controlada que não consome o RNG global. */
export function hashNoise(a: number, b: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35);
  h ^= h >>> 13;
  h = Math.imul(h, 0x27d4eb2f);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
