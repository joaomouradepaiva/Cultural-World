// Bot de balanceamento: joga 14 dias com uma estratégia simples e verifica a curva de progressão.
// Corre com `npm run balance` para ver o relatório diário.

import { ARTISTS } from '../src/content/artists';
import { SPOTS } from '../src/content/map';
import { ROOMS } from '../src/content/rooms';
import { MISSIONS } from '../src/content/missions';
import { artistUnlocked, forecast, validateBooking, type BookingRequest } from '../src/sim/bookings';
import { upgradeError } from '../src/sim/construction';
import { productUnlocked } from '../src/sim/state';
import { PRODUCTS } from '../src/content/catalog';
import { Simulation } from '../src/sim/sim';
import { at, dayOf, MIN_PER_DAY } from '../src/sim/time';
import type { ContractType, RoomId } from '../src/sim/types';
import { cleanHall, newSim } from './helpers';

function bestBooking(sim: Simulation, room: RoomId, startAt: number): BookingRequest | null {
  let best: BookingRequest | null = null, bestNet = -Infinity;
  for (const a of ARTISTS) {
    if (!artistUnlocked(sim.state, a)) continue;
    for (const ct of ['fixed', 'split', 'guarantee', 'rental'] as ContractType[]) {
      const req: BookingRequest = { roomId: room, artistId: a.id, startAt, ticketPrice: a.refPrice, contractType: ct, marketing: 'none' };
      for (const mk of ['none', 'posters', 'social'] as const) {
        const r = { ...req, marketing: mk };
        if (validateBooking(sim.state, r).length) continue;
        const f = forecast(sim.state, r);
        if (f.net > bestNet) { bestNet = f.net; best = r; }
      }
    }
  }
  return best;
}

function botDay(sim: Simulation): void {
  const s = sim.state;
  const day = dayOf(s.time);
  for (const m of MISSIONS) if (s.missions[m.id] === 'done') sim.claim(m.id);
  // construir
  if (!s.rooms.bar.built && !s.rooms.bar.construction) sim.build('bar');
  const saving = s.level >= 3 && !s.rooms.blackbox.built && !s.rooms.blackbox.construction;
  if (saving && s.money > 3300) sim.build('blackbox');
  if (s.rooms.blackbox.built && !s.rooms.wc.built && !s.rooms.wc.construction && s.money > 1800) sim.build('wc');
  // melhorias por ordem de prioridade
  const order: [RoomId, string][] = [['hall', 'seats'], ['bar', 'tables'], ['hall', 'sound'], ['bar', 'menu'], ['hall', 'light'], ['bar', 'equipment'], ['hall', 'stage'], ['lobby', 'online'], ['blackbox', 'seats'], ['bar', 'counter']];
  for (const [room, key] of order) {
    const def = ROOMS[room].upgrades.find((u) => u.key === key)!;
    const next = def.levels[(s.rooms[room].upgrades[key] ?? 0) + 1];
    if (next && !saving && !upgradeError(sim, room, key) && s.money - next.cost > 900) sim.upgrade(room, key);
  }
  // equipa
  const want: string[] = ['bartender', 'boxoffice', 'cleaner'];
  if (s.level >= 3) want.push('technician');
  for (const role of want) {
    if (s.staff.some((m) => m.role === role)) continue;
    const c = s.candidates.find((x) => x.role === role);
    if (c && s.money > 1200) sim.hire(c.id);
  }
  // stock
  for (const p of PRODUCTS) if (productUnlocked(s, p.id) && s.bar.products[p.id].stock < 60) sim.buyStock(p.id, 72);
  // programação: um evento por sala por noite
  for (const room of ['hall', 'blackbox'] as RoomId[]) {
    if (!s.rooms[room].built || s.rooms[room].construction) continue;
    const startAt = at(day, room === 'hall' ? 21 : 19);
    const req = bestBooking(sim, room, startAt);
    if (req) sim.book(req);
  }
}

describe('balanceamento (bot 14 dias)', () => {
  it('progride sem falir e sem crescer de forma explosiva', () => {
    const sim = newSim(7);
    cleanHall(sim);
    const rows: string[] = [];
    let staffBO = false;
    for (let d = 0; d < 14; d++) {
      botDay(sim);
      // jogador: bar durante o dia, bilheteira na abertura de portas, bar depois
      const dayStart = sim.state.time;
      while (sim.state.time < dayStart + MIN_PER_DAY - 1 && dayOf(sim.state.time) === d) {
        const live = sim.state.bookings.find((b) => b.status === 'doors');
        staffBO = sim.state.staff.some((m) => m.role === 'boxoffice');
        if (live && !staffBO) sim.placePlayer(SPOTS.boxOfficeServers[0][0], SPOTS.boxOfficeServers[0][1]);
        else sim.placePlayer(SPOTS.barServers[1][0], SPOTS.barServers[1][1]);
        sim.runMinutes(5);
      }
      sim.runUntil(at(d + 1, 10));
      const s = sim.state;
      const events = s.bookings.filter((b) => b.result && dayOf(b.startAt) === d);
      const led = s.ledger.find((l) => l.day === d);
      const inc = led ? Object.entries(led.income).map(([k, v]) => `${k}:${Math.round(v!)}`).join(' ') : '';
      const exp = led ? Object.entries(led.expense).map(([k, v]) => `${k}:${Math.round(v!)}`).join(' ') : '';
      rows.push(`        + ${inc}\n        - ${exp}`);
      rows.push(`dia ${String(d + 1).padStart(2)} | €${Math.round(s.money).toString().padStart(6)} | nível ${s.level} | rep ${s.rep.general.toFixed(1).padStart(5)} | equipa ${s.staff.length} | ` +
        events.map((b) => `${b.artistId}:${b.result!.attendance}/${b.result!.capacity} sat${b.result!.satisfaction} net€${Math.round(b.result!.net)}`).join(', '));
    }
    console.log(rows.join('\n'));
    const s = sim.state;
    expect(s.money).toBeGreaterThan(0);
    expect(s.level).toBeGreaterThanOrEqual(3);
    expect(s.level).toBeLessThanOrEqual(9);
    expect(s.progress.totalEvents).toBeGreaterThanOrEqual(10);
    expect(s.rooms.blackbox.built || !!s.rooms.blackbox.construction).toBe(true);
  });
});
