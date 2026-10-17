// Simulation: orquestra os sistemas, avança o tempo e expõe comandos para a interface.

import { BALANCE } from '../content/balance';
import { ROOMS } from '../content/rooms';
import { updateAgents } from './agents';
import { buyStock, dailyBar, setPrice } from './bar';
import { cancelBooking, createBooking, processBookings, type BookingRequest } from './bookings';
import { buyUpgrade, processConstruction, startConstruction } from './construction';
import { log, type Ctx, type SimEvent } from './core';
import { spend, sumExpense, sumIncome, today, round2 } from './economy';
import { NavGrid } from './grid';
import { advanceTutorial, checkMissions, claimMission, tutorialNext } from './progression';
import { resolveRandomEvent, rollRandomEvent } from './randomEvents';
import { chance } from './rng';
import { fire, generateCandidates, giveBonus, hire, dailyStaff } from './staff';
import { createInitialState, isOperational, upgradeValue } from './state';
import { at, dayOf, hourOf, weekdayOf, MIN_PER_DAY } from './time';
import type { GameState, ProductId, RoomId } from './types';

export class Simulation implements Ctx {
  state: GameState;
  grid = new NavGrid();
  private events: SimEvent[] = [];
  private acc = 0;
  /** Pausa forçada pela interface (decisões, relatórios). */
  hold = false;

  constructor(state?: GameState) {
    this.state = state ?? createInitialState();
    this.grid.rebuild(this.state);
    if (!this.state.candidates.length) generateCandidates(this.state);
  }

  emit(e: SimEvent): void {
    this.events.push(e);
  }

  drain(): SimEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  get paused(): boolean {
    return this.state.speed === 0 || this.hold || !!this.state.pendingEvent;
  }

  isNightSkip(): boolean {
    const s = this.state;
    const h = hourOf(s.time);
    if (!(h >= BALANCE.closeHour && h < BALANCE.openHour)) return false;
    if (s.bookings.some((b) => b.status === 'setup' || b.status === 'doors' || b.status === 'live' || b.status === 'ended')) return false;
    return !s.agents.some((a) => a.kind === 'visitor' || a.kind === 'casual');
  }

  /** Avança a simulação por `realDt` segundos reais. */
  update(realDt: number): void {
    this.movePlayer(realDt);
    if (this.paused) return;
    const rate = BALANCE.minutesPerRealSecond * this.state.speed * (this.isNightSkip() ? BALANCE.nightSkipMultiplier : 1);
    this.acc += Math.min(realDt, 0.25) * rate;
    let steps = 0;
    while (this.acc >= BALANCE.tickMinutes && steps < 600) {
      this.tick();
      this.acc -= BALANCE.tickMinutes;
      steps++;
      if (this.paused) { this.acc = 0; break; }
    }
  }

  tick(dt = BALANCE.tickMinutes): void {
    const s = this.state;
    const next = s.time + dt;
    if (dayOf(next) !== dayOf(s.time)) {
      this.closeDay();
      s.time = next;
      this.openDay();
    } else {
      s.time = next;
    }
    processConstruction(this);
    processBookings(this);
    updateAgents(this, dt);
    advanceTutorial(this);
    checkMissions(this);
  }

  /** Para testes e balanceamento: avança N minutos de jogo. */
  runMinutes(min: number): void {
    const n = Math.round(min / BALANCE.tickMinutes);
    for (let i = 0; i < n; i++) {
      if (this.state.pendingEvent) resolveRandomEvent(this, 0);
      this.tick();
    }
  }

  runUntil(t: number): void {
    this.runMinutes(Math.max(0, t - this.state.time));
  }

  // ------------------------------------------------------------ ciclo diário

  maintenanceCost(): number {
    const s = this.state;
    let m = 0;
    for (const def of Object.values(ROOMS)) {
      const r = s.rooms[def.id];
      if (!r.built) continue;
      m += def.maintenance;
      for (const u of def.upgrades) m += (r.upgrades[u.key] ?? 0) * u.maintenancePerLevel;
    }
    return m;
  }

  dailyFixedCosts(): number {
    return BALANCE.dailyRent + this.maintenanceCost() + this.state.staff.reduce((a, m) => a + m.salary, 0);
  }

  private closeDay(): void {
    const s = this.state;
    spend(this, 'rent', BALANCE.dailyRent);
    spend(this, 'maintenance', this.maintenanceCost());
    if (weekdayOf(s.time) === 6) spend(this, 'insurance', BALANCE.weeklyInsurance);
    dailyStaff(this);
    dailyBar(this);
    const d = today(s);
    const inc = sumIncome(d), exp = sumExpense(d);
    log(this, `Dia fechado: receitas €${round2(inc)} · despesas €${round2(exp)} · resultado €${round2(inc - exp)}`, inc - exp >= 0 ? 'money' : 'bad');
    s.flags.casualLostWarned = false;
  }

  private openDay(): void {
    const s = this.state;
    if (weekdayOf(s.time) === 0 || !s.candidates.length) generateCandidates(s);
    // reputação decai sem atividade
    const last = s.progress.lastEventAt;
    if (last !== null && s.time - last > BALANCE.repDecayAfterDays * MIN_PER_DAY) {
      s.rep.general = Math.max(0, round2(s.rep.general - BALANCE.repDecayPerDay));
    }
    this.generateRehearsalSlots();
    rollRandomEvent(this);
  }

  private generateRehearsalSlots(): void {
    const s = this.state;
    s.rehearsal.slots = s.rehearsal.slots.filter((x) => x.endAt > s.time);
    if (!isOperational(s, 'rehearsal')) return;
    const eq = upgradeValue(s, 'rehearsal', 'equipment');
    const ref = BALANCE.rehearsalRefPrice * (1 + 0.35 * (eq - 1));
    const pf = Math.min(1.3, Math.pow(ref / Math.max(1, s.rehearsal.pricePerHour), 1.4));
    const p = Math.max(0, Math.min(0.95, (0.45 + s.rep.general / 200) * pf));
    const day = dayOf(s.time);
    const candidates: [number, number][] = [[14, 17]];
    if (eq >= 2) candidates.push([18, 21]);
    if (eq >= 3) candidates.push([10, 13]);
    for (const [h0, h1] of candidates) {
      if (chance(s, p)) s.rehearsal.slots.push({ startAt: at(day, h0), endAt: at(day, h1), hours: h1 - h0, spawned: false, paid: false });
    }
  }

  // ------------------------------------------------------------ jogador

  private movePlayer(realDt: number): void {
    const p = this.state.player;
    let d = BALANCE.playerTilesPerSecond * realDt;
    while (d > 0 && p.path.length) {
      const [tx, ty] = p.path[0];
      const dx = tx - p.x, dy = ty - p.y;
      const len = Math.hypot(dx, dy);
      if (len <= d) { p.x = tx; p.y = ty; p.path.shift(); d -= len; }
      else { p.x += (dx / len) * d; p.y += (dy / len) * d; d = 0; }
    }
  }

  walkPlayerTo(x: number, y: number): boolean {
    const p = this.state.player;
    const path = this.grid.findPath(p.x, p.y, x, y);
    if (!path) return false;
    const [tx, ty] = this.grid.nearestWalkable(x, y);
    const inside = Math.floor(x) === tx && Math.floor(y) === ty;
    p.path = inside ? [...path.slice(0, -1), [x, y]] : path;
    if (!path.length && inside) p.path = [[x, y]];
    return true;
  }

  /** Movimento direto (teclado / joystick), em tiles por segundo real. */
  nudgePlayer(dx: number, dy: number, realDt: number): void {
    const p = this.state.player;
    p.path = [];
    const len = Math.hypot(dx, dy);
    if (!len) return;
    const step = (BALANCE.playerTilesPerSecond * realDt) / len;
    const nx = p.x + dx * step, ny = p.y + dy * step;
    const r = 0.22;
    const free = (x: number, y: number) =>
      this.grid.isWalkable(Math.floor(x - r), Math.floor(y - r)) && this.grid.isWalkable(Math.floor(x + r), Math.floor(y - r)) &&
      this.grid.isWalkable(Math.floor(x - r), Math.floor(y + r)) && this.grid.isWalkable(Math.floor(x + r), Math.floor(y + r));
    if (free(nx, ny)) { p.x = nx; p.y = ny; }
    else if (free(nx, p.y)) p.x = nx;
    else if (free(p.x, ny)) p.y = ny;
  }

  // ------------------------------------------------------------ comandos

  private after(): void {
    checkMissions(this);
    advanceTutorial(this);
  }

  setSpeed(speed: number): void {
    this.state.speed = speed;
  }

  book(req: BookingRequest) {
    const r = createBooking(this, req);
    this.after();
    return r;
  }

  cancel(id: number): boolean {
    const ok = cancelBooking(this, id);
    this.after();
    return ok;
  }

  build(room: RoomId): boolean {
    const ok = startConstruction(this, room);
    this.after();
    return ok;
  }

  upgrade(room: RoomId, key: string): boolean {
    const ok = buyUpgrade(this, room, key);
    this.after();
    return ok;
  }

  hire(candidateId: number) {
    const m = hire(this, candidateId);
    this.after();
    return m;
  }

  fire(staffId: number): boolean {
    const ok = fire(this, staffId);
    this.after();
    return ok;
  }

  bonus(staffId: number): boolean {
    return giveBonus(this, staffId);
  }

  buyStock(id: ProductId, qty: number): number {
    const n = buyStock(this, id, qty);
    if (n) this.emit({ type: 'sound', name: 'coin' });
    return n;
  }

  setPrice(id: ProductId, price: number): void {
    setPrice(this.state, id, price);
  }

  setRestockTarget(n: number): void {
    this.state.bar.restockTarget = Math.max(0, Math.min(400, Math.round(n)));
  }

  setRehearsalPrice(p: number): void {
    this.state.rehearsal.pricePerHour = Math.max(1, Math.min(80, Math.round(p)));
  }

  claim(id: string): boolean {
    const ok = claimMission(this, id);
    this.after();
    return ok;
  }

  resolveEvent(choice: number): void {
    resolveRandomEvent(this, choice);
    this.after();
  }

  tutorialNext(): void {
    tutorialNext(this);
    advanceTutorial(this);
  }

  skipTutorial(): void {
    this.state.tutorial.skipped = true;
  }

  markSeen(flag: string): void {
    this.state.flags[flag] = true;
    this.after();
  }

  /** Atalho de depuração/testes: teleporta o jogador. */
  placePlayer(x: number, y: number): void {
    this.state.player.x = x;
    this.state.player.y = y;
    this.state.player.path = [];
  }
}
