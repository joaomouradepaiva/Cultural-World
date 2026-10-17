import { SPOTS } from '../src/content/map';
import { sumExpense, sumIncome } from '../src/sim/economy';
import { Simulation } from '../src/sim/sim';
import { createInitialState } from '../src/sim/state';
import { at } from '../src/sim/time';
import type { Booking } from '../src/sim/types';

export function newSim(seed = 42): Simulation {
  return new Simulation(createInitialState(seed));
}

export function cleanHall(sim: Simulation): void {
  for (const d of [...sim.state.rooms.hall.dirt]) {
    sim.placePlayer(d.x, d.y);
    sim.runMinutes(3);
  }
}

export function buildBar(sim: Simulation): void {
  expect(sim.build('bar')).toBe(true);
}

/** Corre um evento até à liquidação, com o jogador na bilheteira até ao início e depois no bar. */
export function runEvent(sim: Simulation, b: Booking, opts: { boxOffice?: boolean; bar?: boolean } = { boxOffice: true, bar: true }): void {
  const doors = b.startAt - 45;
  sim.runUntil(doors - 1);
  if (opts.boxOffice) sim.placePlayer(SPOTS.boxOfficeServers[0][0], SPOTS.boxOfficeServers[0][1]);
  sim.runUntil(b.startAt + 15);
  if (opts.bar) sim.placePlayer(SPOTS.barServers[1][0], SPOTS.barServers[1][1]);
  let guard = 0;
  while (b.status !== 'settled' && guard++ < 2000) sim.runMinutes(1);
}

export function firstConcert(sim: Simulation, price = 8): Booking {
  cleanHall(sim);
  buildBar(sim);
  const r = sim.book({ roomId: 'hall', artistId: 'ventiladores', startAt: at(0, 21), ticketPrice: price, contractType: 'fixed', marketing: 'none' });
  if (!r.ok) throw new Error(r.errors.join('; '));
  return r.booking;
}

export function ledgerBalance(sim: Simulation): number {
  return sim.state.ledger.reduce((a, d) => a + sumIncome(d) - sumExpense(d), 0);
}
