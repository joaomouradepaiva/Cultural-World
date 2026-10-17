// Construção de espaços e compra de melhorias.

import { roomCenter } from '../content/map';
import { ROOMS, upgradeDef } from '../content/rooms';
import { log, type Ctx } from './core';
import { canAfford, spend } from './economy';
import { addXp } from './progression';
import { spawnWorkers } from './agents';
import { recomputeTargets } from './bookings';
import { fmtDuration } from './time';
import type { RoomId } from './types';

export function buildError(ctx: Ctx | { state: Ctx['state'] }, room: RoomId): string | null {
  const s = ctx.state;
  const def = ROOMS[room];
  const r = s.rooms[room];
  if (r.built) return 'Já construído.';
  if (r.construction) return 'Em obras.';
  if (s.level < def.reqLevel) return `Desbloqueia no nível ${def.reqLevel}.`;
  if (room !== 'bar' && !s.rooms.bar.built && (room === 'wc' || room === 'rehearsal' || room === 'blackbox')) return 'Constrói primeiro o Bar (dá acesso a esta zona).';
  if (!canAfford(s, def.buildCost)) return `Precisas de €${def.buildCost}.`;
  return null;
}

export function startConstruction(ctx: Ctx, room: RoomId): boolean {
  if (buildError(ctx, room)) return false;
  const s = ctx.state;
  const def = ROOMS[room];
  spend(ctx, 'construction', def.buildCost);
  s.rooms[room].construction = { startAt: s.time, endsAt: s.time + def.buildMinutes };
  spawnWorkers(ctx, room);
  log(ctx, `Obras iniciadas: ${def.name} (${fmtDuration(def.buildMinutes)}).`, 'info');
  ctx.emit({ type: 'sound', name: 'build' });
  return true;
}

export function processConstruction(ctx: Ctx): void {
  const s = ctx.state;
  for (const id of Object.keys(s.rooms) as RoomId[]) {
    const r = s.rooms[id];
    if (r.construction && s.time >= r.construction.endsAt) {
      r.construction = null;
      r.built = true;
      ctx.grid.rebuild(s);
      for (const a of s.agents) if (a.kind === 'worker' && a.variant === roomIndex(id)) { a.state = 'leave'; a.path = []; }
      const [x, y] = roomCenter(id);
      ctx.emit({ type: 'fx', kind: 'confetti', x, y });
      ctx.emit({ type: 'sound', name: 'levelup' });
      log(ctx, `${ROOMS[id].name} inaugurado!`, 'good');
      addXp(ctx, 30);
    }
  }
}

export function roomIndex(id: RoomId): number {
  return (Object.keys(ROOMS) as RoomId[]).indexOf(id);
}

export function upgradeError(ctx: { state: Ctx['state'] }, room: RoomId, key: string): string | null {
  const s = ctx.state;
  const def = upgradeDef(room, key);
  if (!def) return 'Melhoria desconhecida.';
  if (!s.rooms[room].built) return 'Constrói o espaço primeiro.';
  const cur = s.rooms[room].upgrades[key] ?? 0;
  const next = def.levels[cur + 1];
  if (!next) return 'Nível máximo.';
  if (s.level < next.reqLevel) return `Requer nível ${next.reqLevel}.`;
  if (!canAfford(s, next.cost)) return `Precisas de €${next.cost}.`;
  return null;
}

export function buyUpgrade(ctx: Ctx, room: RoomId, key: string): boolean {
  if (upgradeError(ctx, room, key)) return false;
  const s = ctx.state;
  const def = upgradeDef(room, key)!;
  const cur = s.rooms[room].upgrades[key] ?? 0;
  const next = def.levels[cur + 1];
  spend(ctx, 'upgrades', next.cost);
  s.rooms[room].upgrades[key] = cur + 1;
  s.progress.upgradesBought++;
  // eventos futuros desta sala beneficiam de mais lugares
  if (key === 'seats') {
    for (const b of s.bookings) if (b.roomId === room && (b.status === 'scheduled' || b.status === 'setup')) { b.capacity = next.value; recomputeTargets(s, b); }
  }
  const [x, y] = roomCenter(room);
  ctx.emit({ type: 'fx', kind: 'sparkle', x, y });
  ctx.emit({ type: 'sound', name: 'build' });
  log(ctx, `${ROOMS[room].name}: ${def.name} → ${next.label}.`, 'good');
  addXp(ctx, 10);
  return true;
}
