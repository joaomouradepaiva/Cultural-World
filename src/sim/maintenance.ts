// Manutenção: estado de conservação das salas, avarias, reparações e plano preventivo.

import { ROOMS } from '../content/rooms';
import { spawnWorkers } from './agents';
import { log, type Ctx } from './core';
import { canAfford, spend } from './economy';
import { chance } from './rng';
import { hasRole, roomCapacity } from './state';
import { fmtClock } from './time';
import type { Booking, GameState, RoomId } from './types';

export const MAINT = {
  dailyDecay: 0.15,
  eventDecay: 1.5,
  perAttendeeDecay: 0.01,
  technicianFactor: 0.7,
  planFactor: 0.4,
  breakdownBelow: 60,
  closedBelow: 35,
  repairMinutes: 180,
  breakdownQuality: 10,
};

export function condition(s: GameState, room: RoomId): number {
  return s.rooms[room].condition ?? 100;
}

export function repairCost(s: GameState, room: RoomId): number {
  const c = condition(s, room);
  return Math.round((100 - c) * (6 + roomCapacity(s, room) / 12));
}

export function planDailyCost(s: GameState): number {
  return Math.round((Object.keys(ROOMS) as RoomId[]).filter((r) => s.rooms[r].built).reduce((t, r) => t + 1.5 + roomCapacity(s, r) * 0.02, 0) * 100) / 100;
}

export function inRepair(s: GameState, room: RoomId): boolean {
  return (s.rooms[room].repairUntil ?? 0) > s.time;
}

/** Erro de agenda por manutenção (sala fechada pela inspeção ou em obras de reparação). */
export function maintenanceError(s: GameState, room: RoomId, from: number, to: number): string | null {
  if (condition(s, room) < MAINT.closedBelow) return `Inspeção: ${ROOMS[room].name} está em mau estado (${Math.round(condition(s, room))}%). Repara antes de programar.`;
  const until = s.rooms[room].repairUntil ?? 0;
  if (until > s.time && from < until && to > s.time) return `${ROOMS[room].name} em reparação até às ${fmtClock(until)}.`;
  return null;
}

function decay(s: GameState, room: RoomId, amount: number): void {
  const r = s.rooms[room];
  let k = hasRole(s, 'technician') ? MAINT.technicianFactor : 1;
  if (s.flags.maintenancePlan) k *= MAINT.planFactor;
  r.condition = Math.max(0, Math.round(((r.condition ?? 100) - amount * k) * 100) / 100);
}

export function dailyMaintenance(ctx: Ctx): void {
  const s = ctx.state;
  for (const id of Object.keys(ROOMS) as RoomId[]) if (s.rooms[id].built) decay(s, id, MAINT.dailyDecay);
  if (s.flags.maintenancePlan) spend(ctx, 'maintenance', planDailyCost(s));
  const bad = (Object.keys(ROOMS) as RoomId[]).filter((r) => s.rooms[r].built && condition(s, r) < MAINT.breakdownBelow);
  if (bad.length) log(ctx, `⚠️ Manutenção necessária: ${bad.map((r) => `${ROOMS[r].short} ${Math.round(condition(s, r))}%`).join(', ')}.`, 'bad', false);
}

/** Desgaste pelo uso. Chamado na liquidação de cada evento. */
export function wearAfterEvent(s: GameState, b: Booking): void {
  decay(s, b.roomId, MAINT.eventDecay + b.attendees * MAINT.perAttendeeDecay);
  decay(s, 'lobby', 0.3 + b.attendees * 0.004);
}

/** Avaria no arranque do espetáculo: mais provável com a sala degradada. Devolve a penalização de qualidade. */
export function breakdownAtShow(ctx: Ctx, b: Booking): number {
  const s = ctx.state;
  const c = condition(s, b.roomId);
  if (c >= MAINT.breakdownBelow || s.flags.maintenancePlan) return 0;
  if (!chance(s, (MAINT.breakdownBelow - c) / 100)) return 0;
  log(ctx, `⚡ Avaria técnica na ${ROOMS[b.roomId].name} durante o espetáculo (conservação ${Math.round(c)}%).`, 'bad');
  ctx.emit({ type: 'sound', name: 'error' });
  return MAINT.breakdownQuality;
}

export function repairError(s: GameState, room: RoomId): string | null {
  const cost = repairCost(s, room);
  if (!s.rooms[room].built) return 'Sala por construir.';
  if (cost <= 0) return 'Em perfeito estado.';
  if (inRepair(s, room)) return 'Já está em reparação.';
  const until = s.time + MAINT.repairMinutes;
  // a obra fecha a sala 3 h: não pode apanhar um evento (incluindo a montagem)
  const clash = s.bookings.find((b) => b.roomId === room && b.status !== 'cancelled' && b.status !== 'settled' && b.startAt - b.setup < until && b.startAt + b.duration + b.cleanup > s.time);
  if (clash) return `Há um evento nas próximas ${MAINT.repairMinutes / 60} h (${fmtClock(clash.startAt)}).`;
  if (!canAfford(s, cost)) return `Precisas de €${cost}.`;
  return null;
}

export function repairRoom(ctx: Ctx, room: RoomId): boolean {
  const s = ctx.state;
  if (repairError(s, room)) return false;
  const cost = repairCost(s, room);
  spend(ctx, 'maintenance', cost);
  s.rooms[room].repairUntil = s.time + MAINT.repairMinutes;
  s.rooms[room].condition = 100;
  spawnWorkers(ctx, room);
  log(ctx, `🔧 Reparação da ${ROOMS[room].name} (€${cost}); pronta às ${fmtClock(s.time + MAINT.repairMinutes)}.`, 'info');
  ctx.emit({ type: 'sound', name: 'build' });
  return true;
}

export function setMaintenancePlan(ctx: Ctx, on: boolean): void {
  ctx.state.flags.maintenancePlan = on;
  log(ctx, on ? `Plano de manutenção preventiva ativo (€${planDailyCost(ctx.state)}/dia).` : 'Plano de manutenção preventiva cancelado.', 'info');
}
