// Equipa: candidatos, contratação, despedimento, satisfação e evolução.

import { BALANCE } from '../content/balance';
import { FIRST_NAMES, LAST_NAMES, ROLES, ROLE_ORDER } from '../content/catalog';
import { log, newId, type Ctx } from './core';
import { canAfford, spend } from './economy';
import { pick, rand, randInt } from './rng';
import type { GameState, Look, ShiftId, StaffMember, StaffRole } from './types';
import { isOpenHours } from './time';

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
  // por omissão: quem atende fica no turno completo; técnicos e seguranças à noite
  c.shift = c.role === 'technician' || c.role === 'security' ? 'night' : 'full';
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

// ------------------------------------------------------------ turnos

export const SHIFTS: Record<ShiftId, { name: string; from: number; to: number; costFactor: number; fatigue: number }> = {
  day: { name: 'Dia (10–18h)', from: 10, to: 18, costFactor: 0.6, fatigue: -0.3 },
  night: { name: 'Noite (18–02h)', from: 18, to: 2, costFactor: 0.6, fatigue: -0.3 },
  full: { name: 'Completo (10–02h)', from: 10, to: 2, costFactor: 1, fatigue: 0.6 },
};

export function shiftOf(m: StaffMember): ShiftId {
  return m.shift ?? 'full';
}

export function onShiftAt(m: StaffMember, t: number): boolean {
  const sh = SHIFTS[shiftOf(m)];
  return isOpenHours(t, sh.from, sh.to);
}

/** Custo diário do funcionário no turno escolhido. */
export function dailyCost(m: StaffMember): number {
  return Math.round(m.salary * SHIFTS[shiftOf(m)].costFactor * 100) / 100;
}

export function setShift(ctx: Ctx, staffId: number, shift: ShiftId): boolean {
  const m = ctx.state.staff.find((x) => x.id === staffId);
  if (!m) return false;
  m.shift = shift;
  return true;
}

/** Escala automática: uma pessoa por função fica em turno completo; com duas ou mais, divide dia/noite. */
export function autoSchedule(ctx: Ctx): void {
  const byRole = new Map<StaffRole, StaffMember[]>();
  for (const m of ctx.state.staff) byRole.set(m.role, [...(byRole.get(m.role) ?? []), m]);
  for (const [role, list] of byRole) {
    if (list.length === 1) { list[0].shift = 'full'; continue; }
    // funções que só fazem falta em eventos ficam à noite
    const nightRoles: StaffRole[] = ['technician', 'security'];
    list.forEach((m, i) => { m.shift = nightRoles.includes(role) ? (i === 0 ? 'night' : 'full') : i % 2 === 0 ? 'night' : 'day'; });
  }
  log(ctx, 'Escala ajustada automaticamente.', 'info');
}

/** Funções necessárias num evento e se há alguém escalado. O gestor pode cobrir bilheteira e bar. */
export function eventStaffing(s: GameState, b: { startAt: number; duration: number; setup: number }, expected: number, needsTech: boolean) {
  const at = (t: number, role: StaffRole) => s.staff.some((m) => m.role === role && onShiftAt(m, t));
  const doors = b.startAt - 45;
  const out: { role: StaffRole; label: string; ok: boolean; required: boolean }[] = [
    { role: 'boxoffice', label: 'Bilheteira na abertura de portas', ok: at(doors, 'boxoffice'), required: false },
    { role: 'bartender', label: 'Bar durante o evento', ok: at(b.startAt + b.duration, 'bartender'), required: false },
    { role: 'cleaner', label: 'Limpeza no fim', ok: at(b.startAt + b.duration + 30, 'cleaner'), required: false },
  ];
  if (needsTech) out.push({ role: 'technician', label: 'Técnico na montagem', ok: at(b.startAt - b.setup, 'technician'), required: true });
  if (expected > 80) out.push({ role: 'security', label: 'Segurança (mais de 80 pessoas)', ok: at(b.startAt, 'security'), required: false });
  return out;
}

/** Pagamento de salários e evolução diária. Chamado à meia-noite. */
export function dailyStaff(ctx: Ctx): void {
  const s = ctx.state;
  for (const m of [...s.staff]) {
    spend(ctx, 'salaries', dailyCost(m));
    const load = m.workToday;
    m.experience += load;
    const fair = m.salary >= salaryFor(m.role, m.competence) ? 2 : -3;
    const overwork = Math.max(0, load - 40 * m.competence) / 10;
    const fatigue = SHIFTS[shiftOf(m)].fatigue;
    m.satisfaction = Math.max(0, Math.min(100, m.satisfaction + fair - overwork - fatigue + (load > 0 ? 0.5 : -0.5)));
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
