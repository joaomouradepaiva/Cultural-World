// Equipa: candidatos, contratação, despedimento, satisfação e evolução.

import { BALANCE } from '../content/balance';
import { FIRST_NAMES, LAST_NAMES, ROLES, ROLE_ORDER } from '../content/catalog';
import { log, newId, type Ctx } from './core';
import { canAfford, spend } from './economy';
import { pick, rand, randInt } from './rng';
import type { GameState, Look, StaffMember, StaffRole } from './types';

export function randomLook(state: GameState): Look {
  return {
    skin: randInt(state, 0, 5),
    hair: randInt(state, 0, 7),
    hairStyle: randInt(state, 0, 4),
    shirt: randInt(state, 0, 11),
    pants: randInt(state, 0, 5),
  };
}

export function salaryFor(role: StaffRole, competence: number): number {
  const r = ROLES[role];
  return r.baseSalary + r.salaryPerCompetence * competence;
}

export function generateCandidates(state: GameState): void {
  const out: StaffMember[] = [];
  const roles = ROLE_ORDER.filter((r) => ROLES[r].minLevel <= state.level + 1);
  for (let i = 0; i < BALANCE.candidatesCount; i++) {
    const role = roles[i % roles.length];
    const competence = Math.max(1, Math.min(5, Math.round(rand(state, 0.6, 2.4 + state.level * 0.25))));
    out.push({
      id: newId(state), name: `${pick(state, FIRST_NAMES)} ${pick(state, LAST_NAMES)}`, role, competence,
      salary: salaryFor(role, competence), satisfaction: 70, experience: 0, hiredAt: 0, look: randomLook(state), workToday: 0,
    });
  }
  state.candidates = out;
}

export function hireError(state: GameState, candidateId: number): string | null {
  const c = state.candidates.find((x) => x.id === candidateId);
  if (!c) return 'Candidato indisponível.';
  if (state.level < ROLES[c.role].minLevel) return `${ROLES[c.role].name} desbloqueia no nível ${ROLES[c.role].minLevel}.`;
  if (!canAfford(state, c.salary)) return `Precisas de €${c.salary} (primeiro dia de salário).`;
  if (state.staff.length >= maxStaff(state)) return `Limite de equipa no teu nível: ${maxStaff(state)}.`;
  return null;
}

export function maxStaff(state: GameState): number {
  return 2 + state.level * 2;
}

export function hire(ctx: Ctx, candidateId: number): StaffMember | null {
  const s = ctx.state;
  if (hireError(s, candidateId)) return null;
  const idx = s.candidates.findIndex((x) => x.id === candidateId);
  const c = s.candidates[idx];
  s.candidates.splice(idx, 1);
  spend(ctx, 'salaries', c.salary);
  c.hiredAt = s.time;
  s.staff.push(c);
  log(ctx, `${c.name} juntou-se à equipa como ${ROLES[c.role].name}.`, 'good');
  ctx.emit({ type: 'sound', name: 'notify' });
  return c;
}

export function fire(ctx: Ctx, staffId: number): boolean {
  const s = ctx.state;
  const idx = s.staff.findIndex((x) => x.id === staffId);
  if (idx < 0) return false;
  const m = s.staff[idx];
  s.staff.splice(idx, 1);
  for (const a of s.agents) if (a.staffId === staffId) { a.state = 'leave'; a.path = []; a.staffId = null; }
  log(ctx, `${m.name} saiu da equipa.`, 'info');
  return true;
}

export function giveBonus(ctx: Ctx, staffId: number): boolean {
  const s = ctx.state;
  const m = s.staff.find((x) => x.id === staffId);
  if (!m || !canAfford(s, BALANCE.bonusAmount)) return false;
  spend(ctx, 'salaries', BALANCE.bonusAmount);
  m.satisfaction = Math.min(100, m.satisfaction + 20);
  return true;
}

const EXP_THRESHOLDS = [0, 60, 180, 400, 800];

/** Pagamento de salários e evolução diária. Chamado à meia-noite. */
export function dailyStaff(ctx: Ctx): void {
  const s = ctx.state;
  for (const m of [...s.staff]) {
    spend(ctx, 'salaries', m.salary);
    const load = m.workToday;
    m.experience += load;
    const fair = m.salary >= salaryFor(m.role, m.competence) ? 2 : -3;
    const overwork = Math.max(0, load - 40 * m.competence) / 10;
    m.satisfaction = Math.max(0, Math.min(100, m.satisfaction + fair - overwork + (load > 0 ? 0.5 : -0.5)));
    if (m.competence < 5 && m.experience >= EXP_THRESHOLDS[m.competence]) {
      m.competence++;
      log(ctx, `${m.name} ganhou experiência: competência ${m.competence}★.`, 'good', false);
    }
    m.workToday = 0;
    if (m.satisfaction < 15) {
      fire(ctx, m.id);
      log(ctx, `${m.name} despediu-se por insatisfação.`, 'bad');
    }
  }
}
