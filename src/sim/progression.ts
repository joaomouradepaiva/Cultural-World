// XP, níveis, desbloqueios, missões e tutorial.

import { ARTISTS } from '../content/artists';
import { BALANCE, xpForNextLevel, levelTitle, LEVEL_TITLES } from '../content/balance';
import { CONTRACTS, MARKETING, ROLES } from '../content/catalog';
import { MISSIONS, MISSION_BY_ID, TUTORIAL } from '../content/missions';
import { ROOMS } from '../content/rooms';
import { log, type Ctx } from './core';
import { earn } from './economy';
import type { GameState } from './types';

export function unlocksAtLevel(level: number): string[] {
  const out: string[] = [];
  for (const r of Object.values(ROOMS)) {
    if (!r.startsBuilt && r.reqLevel === level) out.push(`Construção: ${r.name}`);
    for (const u of r.upgrades) u.levels.forEach((l, i) => { if (i > 0 && l.reqLevel === level) out.push(`Melhoria: ${r.short} · ${u.name} (${l.label})`); });
  }
  for (const a of ARTISTS) if (a.minLevel === level) out.push(`Artista: ${a.name}`);
  for (const m of MARKETING) if (m.minLevel === level && m.minLevel > 1) out.push(`Marketing: ${m.name}`);
  for (const c of CONTRACTS) if (c.minLevel === level && c.minLevel > 1) out.push(`Contrato: ${c.name}`);
  for (const r of Object.values(ROLES)) if (r.minLevel === level && r.minLevel > 1) out.push(`Equipa: ${r.name}`);
  if (level === BALANCE.randomEventMinLevel) out.push('Imprevistos e oportunidades');
  const t = LEVEL_TITLES.find((x) => x.level === level);
  if (t) out.unshift(`Novo estatuto: ${t.title}`);
  return out;
}

export function addXp(ctx: Ctx, amount: number): void {
  const s = ctx.state;
  if (amount <= 0) return;
  s.xp += amount;
  while (s.xp >= xpForNextLevel(s.level)) {
    s.xp -= xpForNextLevel(s.level);
    s.level++;
    const bonus = BALANCE.levelUpMoneyPerLevel * s.level;
    earn(ctx, 'missions', bonus);
    const unlocks = unlocksAtLevel(s.level);
    log(ctx, `Nível ${s.level}! ${levelTitle(s.level)} · +€${bonus}`, 'good');
    ctx.emit({ type: 'levelup', level: s.level, unlocks });
    ctx.emit({ type: 'sound', name: 'levelup' });
  }
}

export function missionVisible(s: GameState, id: string): boolean {
  const m = MISSION_BY_ID[id];
  if (!m.after) return true;
  const prev = s.missions[m.after];
  return prev === 'done' || prev === 'claimed';
}

export function checkMissions(ctx: Ctx): void {
  const s = ctx.state;
  for (const m of MISSIONS) {
    const st = s.missions[m.id];
    if (st === 'done' || st === 'claimed') continue;
    if (!missionVisible(s, m.id)) continue;
    const [cur, target] = m.progress(s);
    if (cur >= target) {
      s.missions[m.id] = 'done';
      log(ctx, `Missão cumprida: ${m.title}! Reclama a recompensa.`, 'good');
      ctx.emit({ type: 'mission', id: m.id });
      ctx.emit({ type: 'sound', name: 'mission' });
    } else if (!st) {
      s.missions[m.id] = 'active';
    }
  }
}

export function claimMission(ctx: Ctx, id: string): boolean {
  const s = ctx.state;
  if (s.missions[id] !== 'done') return false;
  const m = MISSION_BY_ID[id];
  s.missions[id] = 'claimed';
  earn(ctx, 'missions', m.money);
  addXp(ctx, m.xp);
  ctx.emit({ type: 'sound', name: 'coin' });
  return true;
}

export function activeMissions(s: GameState) {
  return MISSIONS.filter((m) => missionVisible(s, m.id) && s.missions[m.id] !== 'claimed');
}

export function advanceTutorial(ctx: Ctx): void {
  const t = ctx.state.tutorial;
  if (t.skipped) return;
  let guard = 0;
  while (t.step < TUTORIAL.length && guard++ < TUTORIAL.length) {
    const step = TUTORIAL[t.step];
    if (step.manual || !step.done(ctx.state)) break;
    t.step++;
    ctx.emit({ type: 'sound', name: 'mission' });
  }
}

export function tutorialNext(ctx: Ctx): void {
  const t = ctx.state.tutorial;
  if (t.step < TUTORIAL.length) t.step++;
  if (t.step >= TUTORIAL.length) t.skipped = true;
}
