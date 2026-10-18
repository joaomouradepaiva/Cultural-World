// Armazém e equipamento móvel: compra, reparação, reserva por evento (sem uso duplo) e desgaste.

import type { ArtistDef } from '../content/artists';
import { KIT_BROKEN_BELOW, KIT_BY_ID, type KitId } from '../content/equipment';
import { log, newId, type Ctx } from './core';
import { canAfford, earn, round2, spend } from './economy';
import { equipment, upgradeValue } from './state';
import type { Booking, GameState, KitItem, RoomId } from './types';

export type Rig = { sound: number; light: number; stage: number };

export function storageCapacity(s: GameState): number {
  return upgradeValue(s, 'hall', 'storage');
}

export function storageUsed(s: GameState): number {
  return s.inventory.reduce((t, k) => t + KIT_BY_ID[k.kit].space, 0);
}

export function kitUsable(k: KitItem): boolean {
  return k.condition >= KIT_BROKEN_BELOW;
}

export function buyKitError(s: GameState, kit: KitId): string | null {
  const d = KIT_BY_ID[kit];
  if (!d) return 'Equipamento desconhecido.';
  if (s.level < d.minLevel) return `Desbloqueia no nível ${d.minLevel}.`;
  if (storageUsed(s) + d.space > storageCapacity(s)) return `Sem espaço no armazém (${storageUsed(s)}/${storageCapacity(s)}). Amplia o armazém.`;
  if (!canAfford(s, d.cost)) return `Precisas de €${d.cost}.`;
  return null;
}

export function buyKit(ctx: Ctx, kit: KitId): KitItem | null {
  const s = ctx.state;
  if (buyKitError(s, kit)) return null;
  const d = KIT_BY_ID[kit];
  spend(ctx, 'equipment', d.cost);
  const item: KitItem = { id: newId(s), kit, condition: 100, boughtAt: s.time, uses: 0 };
  s.inventory.push(item);
  log(ctx, `Comprado: ${d.name}. Fica no armazém.`, 'good');
  ctx.emit({ type: 'sound', name: 'build' });
  return item;
}

/** Venda em segunda mão (35% do preço, proporcional ao estado). Liberta as reservas futuras. */
export function sellKit(ctx: Ctx, id: number): boolean {
  const s = ctx.state;
  const idx = s.inventory.findIndex((k) => k.id === id);
  if (idx < 0 || kitBusy(s, id)) return false;
  const k = s.inventory[idx];
  const value = round2(KIT_BY_ID[k.kit].cost * 0.35 * k.condition / 100);
  s.inventory.splice(idx, 1);
  for (const b of s.bookings) if (b.kits?.includes(id)) b.kits = b.kits.filter((x) => x !== id);
  earn(ctx, 'other', value);
  log(ctx, `Vendido: ${KIT_BY_ID[k.kit].name} por €${value}.`, 'info');
  return true;
}

export function repairKitCost(k: KitItem): number {
  return Math.round((100 - k.condition) * KIT_BY_ID[k.kit].cost / 250);
}

export function repairKit(ctx: Ctx, id: number): boolean {
  const k = ctx.state.inventory.find((x) => x.id === id);
  if (!k || k.condition >= 100) return false;
  const cost = repairKitCost(k);
  if (!canAfford(ctx.state, cost)) return false;
  spend(ctx, 'equipment', cost);
  k.condition = 100;
  log(ctx, `${KIT_BY_ID[k.kit].name} reparado (€${cost}).`, 'good');
  return true;
}

function overlaps(b: Booking, from: number, to: number): boolean {
  return from < b.startAt + b.duration + b.cleanup && b.startAt - b.setup < to;
}

/** Kit em uso agora (evento em montagem/a decorrer). */
export function kitBusy(s: GameState, id: number): boolean {
  return s.bookings.some((b) => b.kits?.includes(id) && (b.status === 'setup' || b.status === 'doors' || b.status === 'live'));
}

/** Kits livres numa janela: não reservados por outro evento sobreposto e não avariados. */
export function freeKits(s: GameState, from: number, to: number, ignoreId = -1): KitItem[] {
  const taken = new Set<number>();
  for (const b of s.bookings) {
    if (b.id === ignoreId || !b.kits?.length || b.status === 'cancelled' || b.status === 'settled' || b.status === 'ended') continue;
    if (overlaps(b, from, to)) for (const id of b.kits) taken.add(id);
  }
  return s.inventory.filter((k) => kitUsable(k) && !taken.has(k.id));
}

/** Escolhe os kits que cobrem as falhas do rider (1 nível por kit) e o projetor para eventos externos. */
export function pickKits(s: GameState, roomId: RoomId, a: ArtistDef, kind: Booking['kind'], from: number, to: number, ignoreId = -1): KitItem[] {
  const free = freeKits(s, from, to, ignoreId).sort((x, y) => y.condition - x.condition);
  const eq = equipment(s, roomId);
  const out: KitItem[] = [];
  for (const dim of ['sound', 'light', 'stage'] as const) {
    let gap = Math.max(0, a.rider[dim] - eq[dim]);
    for (const k of free) {
      if (gap <= 0) break;
      if (KIT_BY_ID[k.kit].covers === dim && !out.includes(k)) { out.push(k); gap--; }
    }
  }
  if (kind !== 'show') {
    const p = free.find((k) => k.kit === 'projector');
    if (p) out.push(p);
  }
  return out;
}

/** Níveis extra de equipamento que os kits reservados acrescentam à sala. */
export function kitRig(s: GameState, ids: number[] | undefined): Rig & { projector: boolean } {
  const r = { sound: 0, light: 0, stage: 0, projector: false };
  for (const id of ids ?? []) {
    const k = s.inventory.find((x) => x.id === id);
    if (!k || !kitUsable(k)) continue;
    const c = KIT_BY_ID[k.kit].covers;
    if (c) r[c]++;
    else if (k.kit === 'projector') r.projector = true;
  }
  return r;
}

/** Desgaste depois do evento. */
export function wearKits(ctx: Ctx, b: Booking): string[] {
  const names: string[] = [];
  for (const id of b.kits ?? []) {
    const k = ctx.state.inventory.find((x) => x.id === id);
    if (!k) continue;
    k.uses++;
    k.condition = Math.max(0, k.condition - KIT_BY_ID[k.kit].wear);
    names.push(KIT_BY_ID[k.kit].name);
    if (!kitUsable(k)) log(ctx, `${KIT_BY_ID[k.kit].name} avariou. Repara-o no armazém.`, 'bad');
  }
  return names;
}
