// Persistência versionada. O save é o GameState em JSON + cabeçalho.

import { createInitialState, SAVE_VERSION } from './state';
import type { GameState } from './types';

export const SAVE_KEY = 'cultureworld.save';

export interface SaveFile {
  game: 'culture-world';
  version: number;
  savedAt: number;
  state: GameState;
}

type Migration = (s: Record<string, unknown>) => Record<string, unknown>;

/** Migrações: MIGRATIONS[n] converte um save da versão n para n+1. */
const MIGRATIONS: Record<number, Migration> = {};

export function serialize(state: GameState): string {
  const file: SaveFile = { game: 'culture-world', version: SAVE_VERSION, savedAt: Date.now(), state };
  return JSON.stringify(file);
}

export function deserialize(json: string): GameState {
  const file = JSON.parse(json) as Partial<SaveFile>;
  if (file.game !== 'culture-world' || !file.state || typeof file.version !== 'number') throw new Error('Ficheiro de save inválido.');
  if (file.version > SAVE_VERSION) throw new Error('Save de uma versão mais recente do jogo.');
  let raw = file.state as unknown as Record<string, unknown>;
  for (let v = file.version; v < SAVE_VERSION; v++) {
    const m = MIGRATIONS[v];
    if (!m) throw new Error(`Sem migração da versão ${v}.`);
    raw = m(raw);
  }
  return fillDefaults(raw as unknown as GameState);
}

/** Garante que campos adicionados em versões novas existem (robustez para saves antigos). */
function fillDefaults(s: GameState): GameState {
  const base = createInitialState(s.seed ?? 1);
  const merged = { ...base, ...s } as GameState;
  merged.progress = { ...base.progress, ...s.progress, eventsByDiscipline: { ...base.progress.eventsByDiscipline, ...s.progress?.eventsByDiscipline } };
  merged.inbox = s.inbox ?? [];
  merged.scene = s.scene ?? [];
  merged.exhibitions = s.exhibitions ?? [];
  merged.audience = { ...base.audience, ...s.audience };
  merged.seasons = s.seasons ?? [];
  merged.feedback = s.feedback ?? [];
  merged.sceneActive = s.sceneActive ?? [];
  merged.bookings = (s.bookings ?? []).map((b) => ({ ...b, kind: b.kind ?? 'show', custom: b.custom ?? null, participants: b.participants ?? 0, seasonId: b.seasonId ?? null, passSeats: b.passSeats ?? 0, segments: b.segments ?? {}, stats: { ...b.stats, passAllocated: b.stats?.passAllocated ?? 0 } }));
  merged.flags = { ...(s.flags ?? {}) };
  merged.modifiers = { ...base.modifiers, ...s.modifiers };
  merged.rehearsal = { ...base.rehearsal, ...s.rehearsal };
  for (const k of Object.keys(base.rooms) as (keyof GameState['rooms'])[]) {
    const r = s.rooms?.[k];
    merged.rooms[k] = r ? { ...base.rooms[k], ...r, upgrades: { ...base.rooms[k].upgrades, ...r.upgrades } } : base.rooms[k];
  }
  for (const k of Object.keys(base.artists)) if (!merged.artists[k]) merged.artists[k] = base.artists[k];
  for (const k of Object.keys(base.bar.products) as (keyof GameState['bar']['products'])[]) {
    if (!merged.bar.products[k]) merged.bar.products[k] = base.bar.products[k];
  }
  merged.version = SAVE_VERSION;
  return merged;
}

export interface Storage { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }

export function saveTo(storage: Storage, state: GameState): boolean {
  try {
    storage.setItem(SAVE_KEY, serialize(state));
    return true;
  } catch {
    return false;
  }
}

export function loadFrom(storage: Storage): GameState | null {
  try {
    const raw = storage.getItem(SAVE_KEY);
    return raw ? deserialize(raw) : null;
  } catch {
    return null;
  }
}
