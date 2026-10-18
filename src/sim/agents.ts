// NPCs: visitantes, clientes do bar, artistas, equipa, operários e bandas em ensaio.
// Toda a lógica (filas, serviço, deslocação) corre em tempo de jogo e é independente da renderização.

import { artistOf } from '../content/artists';
import { BALANCE } from '../content/balance';
import { ROOM_RECTS, SPOTS, seatsFor, showSpots } from '../content/map';
import { log, newId, type Ctx } from './core';
import { earn, today } from './economy';
import { serveDrink, barAppeal } from './bar';
import { sellTicket } from './bookings';
import { chance, rand, randInt } from './rng';
import { randomLook } from './staff';
import {
  barSlots, boxOfficeSlots, isOperational, staffSpeed, upgradeValue,
} from './state';
import { hourOf, isOpenHours } from './time';
import type { Agent, AgentKind, Booking, CounterId, GameState, RoomId, StaffMember } from './types';
import { roomIndex } from './construction';
import { ROOMS } from '../content/rooms';

type P = [number, number];

const WORKER_APPROACH: Record<RoomId, P> = {
  hall: [7.5, 12.5],
  blackbox: [19.5, 12.5],
  bar: [14.4, 15.5],
  wc: [22.4, 13.5],
  rehearsal: [22.4, 17.5],
  lobby: [6.9, 18.3],
};

// ---------------------------------------------------------------- criação e movimento

function streetPoint(s: GameState): P {
  const st = SPOTS.street;
  return [rand(s, st.x0, st.x1), rand(s, st.y0, st.y1)];
}

function makeAgent(ctx: Ctx, kind: AgentKind, at: P, speed: number): Agent {
  const s = ctx.state;
  const a: Agent = {
    id: newId(s), kind, x: at[0], y: at[1], path: [], speed, state: 'arrive', timer: 0, look: randomLook(s),
    bookingId: null, staffId: null, seat: -1, hasTicket: false, patience: 0, waitStart: 0, mood: 70,
    icon: null, iconUntil: 0, slot: -1, facing: 1, variant: 0, barLeft: 0,
  };
  s.agents.push(a);
  return a;
}

export function goTo(ctx: Ctx, a: Agent, x: number, y: number, via?: P): void {
  const start: P = [a.x, a.y];
  let path: P[] = [];
  if (via) {
    path = ctx.grid.findPath(start[0], start[1], via[0], via[1]) ?? [];
    path.push(via);
  } else {
    path = ctx.grid.findPath(start[0], start[1], x, y) ?? [];
  }
  path.push([x, y]);
  a.path = path;
}

function moveAlong(a: Agent, dt: number): boolean {
  let dist = a.speed * dt;
  while (dist > 0 && a.path.length) {
    const [tx, ty] = a.path[0];
    const dx = tx - a.x, dy = ty - a.y;
    const d = Math.hypot(dx, dy);
    if (d > 0.001) a.facing = dx - dy >= 0 ? 1 : -1;
    if (d <= dist) {
      a.x = tx; a.y = ty;
      a.path.shift();
      dist -= d;
    } else {
      a.x += (dx / d) * dist;
      a.y += (dy / d) * dist;
      dist = 0;
    }
  }
  return a.path.length === 0;
}

function setIcon(s: GameState, a: Agent, icon: string, dur = 10): void {
  a.icon = icon;
  a.iconUntil = s.time + dur;
}

function dist(a: { x: number; y: number }, p: P): number {
  return Math.hypot(a.x - p[0], a.y - p[1]);
}

function booking(s: GameState, a: Agent): Booking | undefined {
  return a.bookingId === null ? undefined : s.bookings.find((b) => b.id === a.bookingId);
}

function leave(ctx: Ctx, a: Agent): void {
  a.state = 'leave';
  const [x, y] = streetPoint(ctx.state);
  goTo(ctx, a, x, y);
}

// ---------------------------------------------------------------- spawns

export function spawnVisitor(ctx: Ctx, b: Booking, hasTicket: boolean): Agent {
  const s = ctx.state;
  const a = makeAgent(ctx, 'visitor', streetPoint(s), BALANCE.visitorSpeed * rand(s, 0.85, 1.2));
  a.bookingId = b.id;
  a.hasTicket = hasTicket;
  a.state = 'arrive';
  goTo(ctx, a, SPOTS.entranceInside[0] + rand(s, -0.4, 0.4), SPOTS.entranceInside[1]);
  return a;
}

export function spawnArtists(ctx: Ctx, b: Booking): void {
  const def = artistOf(b);
  const spots = showSpots(b.roomId);
  const n = Math.min(def.members, spots.stageSpots.length);
  for (let i = 0; i < n; i++) {
    const a = makeAgent(ctx, 'artist', streetPoint(ctx.state), BALANCE.staffSpeed);
    a.bookingId = b.id;
    a.slot = i;
    a.variant = i;
    a.state = 'to_stage';
    const [x, y] = spots.stageSpots[i];
    goTo(ctx, a, x, y, spots.stageEntry);
  }
}

export function spawnWorkers(ctx: Ctx, room: RoomId): void {
  const spots = SPOTS.workers[room];
  for (let i = 0; i < spots.length; i++) {
    const a = makeAgent(ctx, 'worker', streetPoint(ctx.state), BALANCE.staffSpeed);
    a.variant = roomIndex(room);
    a.slot = i;
    a.state = 'to_site';
    goTo(ctx, a, spots[i][0], spots[i][1], WORKER_APPROACH[room]);
  }
}

function spawnCasual(ctx: Ctx): void {
  const s = ctx.state;
  const a = makeAgent(ctx, 'casual', streetPoint(s), BALANCE.visitorSpeed * rand(s, 0.8, 1.1));
  a.state = 'arrive';
  goTo(ctx, a, SPOTS.entranceInside[0], SPOTS.entranceInside[1]);
}

// ---------------------------------------------------------------- filas e balcões

const COUNTER_SPOTS: Record<CounterId, { servers: P[]; customer: P[]; queue: P[] }> = {
  boxoffice: { servers: SPOTS.boxOfficeServers, customer: SPOTS.boxOfficeCustomer, queue: SPOTS.boxOfficeQueue },
  bar: { servers: SPOTS.barServers, customer: SPOTS.barCustomer, queue: SPOTS.barQueue },
};

export function playerServing(s: GameState, c: CounterId): boolean {
  if (c === 'bar' && !isOperational(s, 'bar')) return false;
  return COUNTER_SPOTS[c].servers.some((p) => dist(s.player, p) <= BALANCE.playerServeRadius);
}

/** Velocidades dos servidores presentes, por posto (ordenadas). */
export function counterServers(s: GameState, c: CounterId): number[] {
  const maxSlots = c === 'bar' ? barSlots(s) : boxOfficeSlots(s);
  const role = c === 'bar' ? 'bartender' : 'boxoffice';
  const speeds: number[] = [];
  for (const a of s.agents) {
    if (a.kind !== 'staff' || a.state !== 'work' || a.staffId === null) continue;
    const m = s.staff.find((x) => x.id === a.staffId);
    if (!m || m.role !== role) continue;
    const spot = COUNTER_SPOTS[c].servers[a.slot];
    if (spot && dist(a, spot) < 0.35) speeds.push(staffSpeed(m.competence));
  }
  if (playerServing(s, c)) speeds.push(1);
  speeds.sort((x, y) => y - x);
  let mul = 1;
  if (c === 'bar') mul = upgradeValue(s, 'bar', 'equipment');
  return speeds.slice(0, maxSlots).map((v) => v * mul);
}

function joinQueue(ctx: Ctx, a: Agent, c: CounterId): void {
  const s = ctx.state;
  const counter = s.counters[c];
  counter.queue.push(a.id);
  a.state = `q_${c}`;
  a.waitStart = s.time;
  a.patience = c === 'bar' ? (a.kind === 'casual' ? BALANCE.casualPatience : BALANCE.barPatience) : BALANCE.boxOfficePatience;
  a.slot = -1;
}

/** Caminha até à entrada da fila do bar; só entra na fila ao chegar (a paciência conta a partir daí). */
function walkToBar(ctx: Ctx, a: Agent): void {
  a.state = 'to_q_bar';
  const [x, y] = SPOTS.barQueue[SPOTS.barQueue.length - 1];
  goTo(ctx, a, x + rand(ctx.state, -0.3, 0.3), y + rand(ctx.state, 0.2, 0.6));
}

function removeFromQueue(s: GameState, c: CounterId, id: number): void {
  const q = s.counters[c].queue;
  const i = q.indexOf(id);
  if (i >= 0) q.splice(i, 1);
}

function updateCounter(ctx: Ctx, c: CounterId, dt: number): void {
  const s = ctx.state;
  const counter = s.counters[c];
  const spots = COUNTER_SPOTS[c];
  const servers = counterServers(s, c);
  const maxSlots = spots.customer.length;
  while (counter.serving.length < maxSlots) counter.serving.push(null);
  const byId = new Map(s.agents.map((a) => [a.id, a] as const));

  // remove entradas inválidas
  counter.queue = counter.queue.filter((id) => byId.get(id)?.state === `q_${c}`);

  // progresso no serviço
  for (let i = 0; i < maxSlots; i++) {
    const sv = counter.serving[i];
    if (!sv) continue;
    const a = byId.get(sv.agentId);
    if (!a || a.state !== `svc_${c}`) { counter.serving[i] = null; continue; }
    if (i >= servers.length) {
      // posto sem servidor: o cliente acaba por desistir
      if (s.time - a.waitStart > a.patience) {
        counter.serving[i] = null;
        giveUp(ctx, a, c);
      }
      continue;
    }
    if (a.path.length) continue; // cliente ainda a chegar ao balcão
    sv.remaining -= dt * servers[i];
    if (sv.remaining <= 0) {
      counter.serving[i] = null;
      completeService(ctx, a, c);
    }
  }

  // preencher postos livres com a cabeça da fila
  for (let i = 0; i < Math.min(maxSlots, servers.length); i++) {
    if (counter.serving[i] || !counter.queue.length) continue;
    const id = counter.queue.shift()!;
    const a = byId.get(id);
    if (!a) continue;
    a.state = `svc_${c}`;
    a.slot = i;
    const waited = s.time - a.waitStart;
    a.waitStart = s.time;
    const b = booking(s, a);
    if (b) { b.stats.waitTotal += waited; b.stats.waitCount++; }
    const base = c === 'bar' ? BALANCE.barServiceMin * Math.max(1, a.barLeft * 0.75) : BALANCE.boxOfficeServiceMin;
    counter.serving[i] = { agentId: a.id, remaining: base, waited };
    goTo(ctx, a, spots.customer[i][0], spots.customer[i][1]);
  }

  // posições na fila e paciência
  counter.queue.forEach((id, idx) => {
    const a = byId.get(id)!;
    if (a.slot !== idx) {
      a.slot = idx;
      const p = spots.queue[Math.min(idx, spots.queue.length - 1)];
      goTo(ctx, a, p[0], p[1]);
    }
  });
  for (const id of [...counter.queue]) {
    const a = byId.get(id)!;
    const b = booking(s, a);
    const showStarted = c === 'bar' && b && a.state === 'q_bar' && b.status === 'live' && a.timer === 0;
    if (s.time - a.waitStart > a.patience || showStarted) {
      removeFromQueue(s, c, id);
      giveUp(ctx, a, c);
    }
  }
}

function giveUp(ctx: Ctx, a: Agent, c: CounterId): void {
  const s = ctx.state;
  const b = booking(s, a);
  a.mood -= 30;
  setIcon(s, a, 'angry');
  if (c === 'boxoffice') {
    if (b) b.stats.lostImpatient++;
    leave(ctx, a);
    return;
  }
  if (b) b.stats.lostBar++;
  if (!b && !s.flags.casualLostWarned) {
    s.flags.casualLostWarned = true;
    log(ctx, 'Clientes desistiram do bar: ninguém a servir. Fica atrás do balcão ou contrata um empregado.', 'bad');
  }
  a.barLeft = 0;
  afterBar(ctx, a);
}

function completeService(ctx: Ctx, a: Agent, c: CounterId): void {
  const s = ctx.state;
  const b = booking(s, a);
  if (c === 'boxoffice') {
    if (!b || b.status === 'cancelled' || b.status === 'ended' || b.status === 'settled') { leave(ctx, a); return; }
    if (sellTicket(ctx, b, true)) {
      a.hasTicket = true;
      b.attendees++;
      creditStaffWork(s, 'boxoffice', 1);
      setIcon(s, a, 'ticket');
      ctx.emit({ type: 'sound', name: 'ticket' });
      decideAfterEntry(ctx, a, b);
    } else {
      b.stats.lostTicket++;
      setIcon(s, a, 'sad');
      leave(ctx, a);
    }
    return;
  }
  // bar
  let bought = 0;
  const n = Math.max(1, a.barLeft);
  for (let i = 0; i < n; i++) if (serveDrink(ctx, a)) bought++;
  a.barLeft = 0;
  if (bought) {
    creditStaffWork(s, 'bartender', bought);
    setIcon(s, a, 'drink', 25);
    a.mood += 5;
    ctx.emit({ type: 'sound', name: 'drink' });
    if (chance(s, 0.12)) dropLitter(ctx, a);
  } else {
    setIcon(s, a, 'sad');
    if (b) b.stats.lostBar++;
  }
  afterBar(ctx, a);
}

function creditStaffWork(s: GameState, role: StaffMember['role'], n: number): void {
  const m = s.staff.find((x) => x.role === role);
  if (m) m.workToday += n;
}

function dropLitter(ctx: Ctx, a: Agent): void {
  const s = ctx.state;
  const room = (['bar', 'lobby'] as RoomId[]).find((r) => {
    const rr = ROOM_RECTS[r];
    return a.x >= rr.x0 && a.x < rr.x1 + 1 && a.y >= rr.y0 && a.y < rr.y1 + 1;
  });
  if (!room || s.rooms[room].dirt.length >= 20) return;
  s.rooms[room].dirt.push({ id: newId(s), x: a.x + rand(s, -0.3, 0.3), y: a.y + rand(s, 0.2, 0.6), kind: 2, progress: 0 });
}

// ---------------------------------------------------------------- decisões dos visitantes

function decideAfterEntry(ctx: Ctx, a: Agent, b: Booking): void {
  const s = ctx.state;
  const def = artistOf(b);
  if (a.seat < 0) a.seat = b.seatCursor++;
  if (isOperational(s, 'bar') && b.status !== 'live' && s.time < b.startAt - 30 && chance(s, BALANCE.barBuyPre * def.barFactor * barAppeal(s))) {
    a.barLeft = chance(s, BALANCE.barSecondDrink) ? 2 : 1;
    a.timer = 0; // 0 = antes do espetáculo
    walkToBar(ctx, a);
    return;
  }
  if (isOperational(s, 'wc') && b.status !== 'live' && chance(s, BALANCE.wcUseChance)) {
    goToWc(ctx, a, 'wc_pre');
    return;
  }
  goToSeat(ctx, a, b);
}

function goToSeat(ctx: Ctx, a: Agent, b: Booking): void {
  const seats = seatsFor(b.roomId);
  const p = seats[Math.min(a.seat, seats.length - 1)];
  a.state = 'to_seat';
  goTo(ctx, a, p[0] + rand(ctx.state, -0.08, 0.08), p[1] + rand(ctx.state, -0.08, 0.08));
}

function goToWc(ctx: Ctx, a: Agent, state: string): void {
  const p = SPOTS.wcSpots[randInt(ctx.state, 0, SPOTS.wcSpots.length - 1)];
  a.state = state;
  goTo(ctx, a, p[0], p[1]);
}

function afterBar(ctx: Ctx, a: Agent): void {
  const s = ctx.state;
  const b = booking(s, a);
  if (a.kind === 'visitor' && b && a.timer === 0 && (b.status === 'doors' || b.status === 'live')) {
    goToSeat(ctx, a, b);
    return;
  }
  // depois do espetáculo ou cliente de passagem: ficar numa mesa
  const seat = freeTableSeat(s);
  if (seat >= 0 && (a.kind === 'casual' || chance(s, 0.5))) {
    const p = tableSeatPos(seat);
    a.state = 'to_table';
    a.seat = seat;
    a.timer = s.time + (a.kind === 'casual' ? rand(s, 20, 45) : rand(s, 8, 20));
    goTo(ctx, a, p[0], p[1]);
    return;
  }
  leave(ctx, a);
}

export function tableSeatPos(i: number): P {
  const t = SPOTS.barTables[Math.floor(i / 2)];
  return [t[0] + (i % 2 === 0 ? -0.38 : 0.38), t[1] + 0.05];
}

function freeTableSeat(s: GameState): number {
  if (!isOperational(s, 'bar')) return -1;
  const n = Math.min(SPOTS.barTables.length, upgradeValue(s, 'bar', 'tables')) * 2;
  const used = new Set(s.agents.filter((a) => a.state === 'to_table' || a.state === 'table').map((a) => a.seat));
  for (let i = 0; i < n; i++) if (!used.has(i)) return i;
  return -1;
}

// ---------------------------------------------------------------- atualização por tipo

function updateVisitor(ctx: Ctx, a: Agent, dt: number, arrived: boolean): void {
  const s = ctx.state;
  const b = booking(s, a);
  switch (a.state) {
    case 'arrive':
      if (!arrived) return;
      s.progress.totalVisitors++;
      today(s).visitors++;
      if (!b || b.status === 'cancelled' || b.status === 'ended' || b.status === 'settled') { leave(ctx, a); return; }
      if (a.hasTicket) {
        b.attendees++;
        decideAfterEntry(ctx, a, b);
      } else if (b.presold + b.doorSold >= b.capacity) {
        b.stats.lostTicket++;
        setIcon(s, a, 'sad');
        leave(ctx, a);
      } else {
        joinQueue(ctx, a, 'boxoffice');
      }
      return;
    case 'wc_pre':
    case 'wc_post':
      if (!arrived) return;
      a.state = a.state === 'wc_pre' ? 'wc_pre_wait' : 'wc_post_wait';
      a.timer = s.time + rand(s, 3, 6);
      return;
    case 'wc_pre_wait':
      if (s.time >= a.timer && b) { a.timer = 0; goToSeat(ctx, a, b); }
      return;
    case 'wc_post_wait':
      if (s.time >= a.timer) leave(ctx, a);
      return;
    case 'to_seat':
      if (arrived) a.state = 'seated';
      if (b && (b.status === 'ended' || b.status === 'settled')) startPostShow(ctx, a);
      return;
    case 'seated':
      if (!b || b.status === 'ended' || b.status === 'settled' || b.status === 'cancelled') startPostShow(ctx, a);
      return;
    case 'post_wait':
      if (s.time < a.timer) return;
      {
        const def = b ? artistOf(b) : null;
        a.timer = 1; // 1 = depois do espetáculo
        if (isOperational(s, 'bar') && def && chance(s, BALANCE.barBuyPost * def.barFactor * barAppeal(s))) {
          a.barLeft = 1;
          walkToBar(ctx, a);
        } else if (isOperational(s, 'wc') && chance(s, BALANCE.wcUseChance)) {
          goToWc(ctx, a, 'wc_post');
        } else {
          leave(ctx, a);
        }
      }
      return;
    default:
      updateCommon(ctx, a, arrived);
  }
  void dt;
}

function startPostShow(ctx: Ctx, a: Agent): void {
  a.state = 'post_wait';
  a.path = [];
  a.timer = ctx.state.time + rand(ctx.state, 0, 8);
  if (chance(ctx.state, 0.5)) setIcon(ctx.state, a, 'heart', 12);
}

function updateCasual(ctx: Ctx, a: Agent, arrived: boolean): void {
  const s = ctx.state;
  if (a.state === 'arrive') {
    if (!arrived) return;
    s.progress.totalVisitors++;
    today(s).visitors++;
    if (!isOperational(s, 'bar')) { leave(ctx, a); return; }
    a.barLeft = chance(s, 0.3) ? 2 : 1;
    a.timer = 1;
    walkToBar(ctx, a);
    return;
  }
  updateCommon(ctx, a, arrived);
}

/** Estados partilhados por visitantes e clientes. */
function updateCommon(ctx: Ctx, a: Agent, arrived: boolean): void {
  const s = ctx.state;
  switch (a.state) {
    case 'to_q_bar': {
      const b = booking(s, a);
      if (b && a.kind === 'visitor' && a.timer === 0 && b.status === 'live') { goToSeat(ctx, a, b); return; }
      if (arrived) joinQueue(ctx, a, 'bar');
      return;
    }
    case 'to_table':
      if (arrived) a.state = 'table';
      return;
    case 'table':
      if (s.time >= a.timer) {
        if (isOperational(s, 'wc') && chance(s, BALANCE.wcUseChance)) goToWc(ctx, a, 'wc_post');
        else leave(ctx, a);
      }
      return;
    case 'wc_post':
      if (!arrived) return;
      a.state = 'wc_post_wait';
      a.timer = s.time + rand(s, 3, 6);
      return;
    case 'wc_post_wait':
      if (s.time >= a.timer) leave(ctx, a);
      return;
    case 'leave':
      if (arrived) a.state = 'gone';
      return;
  }
}

function updateArtist(ctx: Ctx, a: Agent, arrived: boolean): void {
  const s = ctx.state;
  const b = booking(s, a);
  if (a.state === 'leave') { if (arrived) a.state = 'gone'; return; }
  if (!b || b.status === 'ended' || b.status === 'settled' || b.status === 'cancelled') {
    const spots = showSpots(b?.roomId ?? 'hall');
    a.state = 'leave';
    const [x, y] = streetPoint(s);
    a.path = [spots.stageEntry];
    const rest = ctx.grid.findPath(spots.stageEntry[0], spots.stageEntry[1], x, y) ?? [];
    a.path.push(...rest, [x, y]);
    return;
  }
  if (a.state === 'to_stage' && arrived) a.state = 'perform';
}

function updateWorker(ctx: Ctx, a: Agent, arrived: boolean): void {
  if (a.state === 'leave') { if (arrived) a.state = 'gone'; return; }
  if (a.state === 'to_site' && arrived) a.state = 'build';
  const roomId = (Object.keys(ROOMS) as RoomId[])[a.variant];
  if (!ctx.state.rooms[roomId].construction) {
    a.state = 'leave';
    const [x, y] = streetPoint(ctx.state);
    goTo(ctx, a, x, y, WORKER_APPROACH[roomId]);
  }
}

function updateBand(ctx: Ctx, a: Agent, arrived: boolean): void {
  const s = ctx.state;
  if (a.state === 'leave') { if (arrived) a.state = 'gone'; return; }
  if (a.state === 'to_room' && arrived) a.state = 'rehearse';
  if (s.time >= a.timer) leave(ctx, a);
}

// ---------------------------------------------------------------- equipa

function onShift(s: GameState): boolean {
  return isOpenHours(s.time, BALANCE.staffShiftStart, BALANCE.staffShiftEnd);
}

function staffTarget(ctx: Ctx, a: Agent, m: StaffMember): P | null {
  const s = ctx.state;
  const sameRole = s.staff.filter((x) => x.role === m.role);
  const idx = sameRole.findIndex((x) => x.id === m.id);
  const idle = SPOTS.staffIdle[idx % SPOTS.staffIdle.length];
  switch (m.role) {
    case 'boxoffice':
      a.slot = idx;
      return idx < boxOfficeSlots(s) ? SPOTS.boxOfficeServers[idx] : idle;
    case 'bartender':
      a.slot = idx;
      if (!isOperational(s, 'bar')) return idle;
      return idx < barSlots(s) ? SPOTS.barServers[idx] : [21.6, 12.5];
    case 'barmanager':
      return isOperational(s, 'bar') ? [22.3, 12.4] : idle;
    case 'technician': {
      const b = s.bookings.find((x) => x.status === 'setup' || x.status === 'doors' || x.status === 'live');
      if (!b) return idle;
      const sp = showSpots(b.roomId);
      a.variant = b.status === 'setup' ? 1 : 0;
      if (b.status === 'setup') return sp.stageSetup[idx % sp.stageSetup.length];
      return sp.tech;
    }
    case 'cleaner': {
      const d = nearestDirt(s, a);
      if (d) return [d.x, d.y];
      return idle;
    }
  }
}

function nearestDirt(s: GameState, a: Agent) {
  let best: GameState['rooms']['hall']['dirt'][number] | null = null, bd = Infinity;
  for (const id of Object.keys(s.rooms) as RoomId[]) {
    if (!isOperational(s, id)) continue;
    // não limpar a sala durante o espetáculo
    if (s.bookings.some((b) => b.roomId === id && b.status === 'live')) continue;
    for (const d of s.rooms[id].dirt) {
      const dd = Math.hypot(d.x - a.x, d.y - a.y);
      if (dd < bd) { bd = dd; best = d; }
    }
  }
  return best;
}

function syncStaff(ctx: Ctx): void {
  const s = ctx.state;
  const shift = onShift(s);
  for (const m of s.staff) {
    const has = s.agents.some((a) => a.staffId === m.id && a.state !== 'leave' && a.state !== 'gone');
    if (shift && !has) {
      const a = makeAgent(ctx, 'staff', streetPoint(s), BALANCE.staffSpeed * staffSpeed(m.competence));
      a.staffId = m.id;
      a.look = m.look;
      a.state = 'commute';
    }
  }
  if (!shift) {
    for (const a of s.agents) if (a.kind === 'staff' && a.state !== 'leave' && a.state !== 'gone') leave(ctx, a);
  }
}

function updateStaff(ctx: Ctx, a: Agent, dt: number, arrived: boolean): void {
  const s = ctx.state;
  if (a.state === 'leave') { if (arrived) a.state = 'gone'; return; }
  const m = s.staff.find((x) => x.id === a.staffId);
  if (!m) { leave(ctx, a); return; }
  const target = staffTarget(ctx, a, m);
  if (!target) return;
  const last = a.path[a.path.length - 1];
  const goalChanged = !last || Math.hypot(last[0] - target[0], last[1] - target[1]) > 0.3;
  if (dist(a, target) > 0.3 && goalChanged) goTo(ctx, a, target[0], target[1]);
  a.state = dist(a, target) < 0.35 ? 'work' : 'commute';
  if (m.role === 'cleaner' && a.state === 'work') {
    cleanAround(ctx, a.x, a.y, dt * staffSpeed(m.competence), 0.5, m);
    a.variant = 1;
  } else if (m.role === 'cleaner') a.variant = 0;
}

// ---------------------------------------------------------------- limpeza

export function cleanAround(ctx: Ctx, x: number, y: number, amount: number, radius: number, m?: StaffMember): number {
  const s = ctx.state;
  let cleaned = 0;
  for (const id of Object.keys(s.rooms) as RoomId[]) {
    const room = s.rooms[id];
    for (let i = room.dirt.length - 1; i >= 0; i--) {
      const d = room.dirt[i];
      if (Math.hypot(d.x - x, d.y - y) > radius) continue;
      d.progress += amount;
      if (d.progress >= 2) {
        room.dirt.splice(i, 1);
        cleaned++;
        ctx.emit({ type: 'fx', kind: 'dust', x: d.x, y: d.y });
        if (m) m.workToday += 3;
      }
    }
  }
  return cleaned;
}

// ---------------------------------------------------------------- spawns ambientes e ensaios

function casualRatePerHour(s: GameState): number {
  const tables = upgradeValue(s, 'bar', 'tables');
  return BALANCE.casualPerHour * (0.4 + s.rep.general / 50) * (1 + 0.25 * upgradeValue(s, 'lobby', 'decor')) * (0.7 + 0.15 * tables);
}

function updateAmbient(ctx: Ctx, dt: number): void {
  const s = ctx.state;
  const h = hourOf(s.time);
  if (isOperational(s, 'bar') && h >= BALANCE.openHour && h < 24 && s.agents.length < 400) {
    if (chance(s, (casualRatePerHour(s) * dt) / 60)) spawnCasual(ctx);
  }
  // ensaios
  for (const slot of s.rehearsal.slots) {
    if (!slot.spawned && s.time >= slot.startAt && s.time < slot.endAt) {
      slot.spawned = true;
      const n = 3;
      for (let i = 0; i < n; i++) {
        const a = makeAgent(ctx, 'band', streetPoint(s), BALANCE.visitorSpeed);
        a.variant = i;
        a.state = 'to_room';
        a.timer = slot.endAt;
        const p = SPOTS.rehearsalSpots[i];
        goTo(ctx, a, p[0], p[1]);
      }
      if (!slot.paid) {
        slot.paid = true;
        const amount = slot.hours * s.rehearsal.pricePerHour;
        earn(ctx, 'rentals', amount, { x: 26.5, y: 17 });
        log(ctx, `Sala de ensaio alugada: ${slot.hours}h · +€${amount}`, 'money', false);
      }
    }
  }
}

// ---------------------------------------------------------------- loop principal

export function updateAgents(ctx: Ctx, dt: number): void {
  const s = ctx.state;
  syncStaff(ctx);
  updateAmbient(ctx, dt);
  updateCounter(ctx, 'boxoffice', dt);
  updateCounter(ctx, 'bar', dt);
  for (const a of s.agents) {
    const arrived = moveAlong(a, dt);
    switch (a.kind) {
      case 'visitor': updateVisitor(ctx, a, dt, arrived); break;
      case 'casual': updateCasual(ctx, a, arrived); break;
      case 'artist': updateArtist(ctx, a, arrived); break;
      case 'staff': updateStaff(ctx, a, dt, arrived); break;
      case 'worker': updateWorker(ctx, a, arrived); break;
      case 'band': updateBand(ctx, a, arrived); break;
    }
    if (a.icon && s.time > a.iconUntil) a.icon = null;
  }
  // limpeza manual pelo gestor
  cleanAround(ctx, s.player.x, s.player.y, dt, 0.75);
  if (s.agents.some((a) => a.state === 'gone')) s.agents = s.agents.filter((a) => a.state !== 'gone');
}

export function agentRoomIs(a: Agent, room: RoomId): boolean {
  const r = ROOM_RECTS[room];
  return a.x >= r.x0 && a.x < r.x1 + 1 && a.y >= r.y0 && a.y < r.y1 + 1;
}
