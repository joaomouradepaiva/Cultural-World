import { ARTIST_BY_ID } from '../src/content/artists';
import { forecast, validateBooking, type BookingRequest } from '../src/sim/bookings';
import { freeKits, storageCapacity } from '../src/sim/equipment';
import { artistSatisfaction, hospitalityRider } from '../src/sim/hospitality';
import { condition, MAINT, repairError } from '../src/sim/maintenance';
import { dailyProposals } from '../src/sim/proposals';
import { deserialize, serialize } from '../src/sim/save';
import { dailyCost, eventStaffing, onShiftAt } from '../src/sim/staff';
import { at } from '../src/sim/time';
import type { StaffRole } from '../src/sim/types';
import { cleanHall, newSim, runEvent } from './helpers';

function rich(level = 4) {
  const sim = newSim();
  sim.state.money = 30000;
  sim.state.level = level;
  sim.state.rep.general = 40;
  return sim;
}

function hireRole(sim: ReturnType<typeof newSim>, role: StaffRole) {
  sim.state.candidates[0].role = role;
  const id = sim.state.candidates[0].id;
  expect(sim.hire(id)).toBeTruthy();
  return sim.state.staff.find((m) => m.id === id)!;
}

describe('turnos da equipa', () => {
  it('turno de dia não cobre a noite e custa 60% do salário', () => {
    const sim = rich();
    const m = hireRole(sim, 'bartender');
    expect(m.shift).toBe('full');
    sim.setShift(m.id, 'day');
    expect(onShiftAt(m, at(1, 12))).toBe(true);
    expect(onShiftAt(m, at(1, 22))).toBe(false);
    expect(dailyCost(m)).toBeCloseTo(m.salary * 0.6, 1);
  });

  it('a escala automática divide dois empregados de bar entre dia e noite', () => {
    const sim = rich();
    sim.state.candidates.push({ ...sim.state.candidates[1], id: 9999 });
    const a = hireRole(sim, 'bartender');
    const b = hireRole(sim, 'bartender');
    sim.autoSchedule();
    expect(new Set([a.shift, b.shift])).toEqual(new Set(['day', 'night']));
  });

  it('avisa quando falta alguém escalado no evento', () => {
    const sim = rich();
    const m = hireRole(sim, 'bartender');
    sim.setShift(m.id, 'day');
    const st = eventStaffing(sim.state, { startAt: at(1, 21), duration: 90, setup: 60 }, 100, false);
    expect(st.find((x) => x.role === 'bartender')!.ok).toBe(false);
    expect(st.some((x) => x.role === 'security')).toBe(true);
    sim.setShift(m.id, 'night');
    expect(eventStaffing(sim.state, { startAt: at(1, 21), duration: 90, setup: 60 }, 30, false).find((x) => x.role === 'bartender')!.ok).toBe(true);
  });
});

describe('manutenção', () => {
  it('as salas degradam-se com o uso e com o tempo', () => {
    const sim = rich();
    cleanHall(sim);
    const r = sim.book({ roomId: 'hall', artistId: 'luna', startAt: at(0, 21), ticketPrice: 10, contractType: 'split', marketing: 'none' });
    if (!r.ok) throw new Error(r.errors.join());
    runEvent(sim, r.booking);
    const afterEvent = condition(sim.state, 'hall');
    expect(afterEvent).toBeLessThan(100);
    sim.runUntil(at(2, 1));
    expect(condition(sim.state, 'hall')).toBeLessThan(afterEvent);
  });

  it('sala em mau estado fecha à programação até ser reparada; a reparação ocupa 3 h', () => {
    const sim = rich();
    sim.state.rooms.hall.condition = 30;
    const req: BookingRequest = { roomId: 'hall', artistId: 'luna', startAt: at(1, 21), ticketPrice: 10, contractType: 'split', marketing: 'none' };
    expect(validateBooking(sim.state, req).some((e) => e.includes('Inspeção'))).toBe(true);
    const money = sim.state.money;
    expect(sim.repairRoom('hall')).toBe(true);
    expect(sim.state.money).toBeLessThan(money);
    expect(condition(sim.state, 'hall')).toBe(100);
    expect(validateBooking(sim.state, { ...req, startAt: sim.state.time + 120 }).some((e) => e.includes('reparação'))).toBe(true);
    expect(validateBooking(sim.state, req)).toEqual([]);
  });

  it('não deixa reparar com um evento marcado nas próximas horas', () => {
    const sim = rich();
    const r = sim.book({ roomId: 'hall', artistId: 'luna', startAt: at(0, 13), ticketPrice: 10, contractType: 'split', marketing: 'none' });
    if (!r.ok) throw new Error(r.errors.join());
    sim.state.rooms.hall.condition = 50;
    expect(repairError(sim.state, 'hall')).toMatch(/evento/);
    expect(sim.repairRoom('hall')).toBe(false);
  });

  it('o plano preventivo reduz o desgaste e elimina avarias', () => {
    const a = rich(), b = rich();
    b.setMaintenancePlan(true);
    a.runUntil(at(5, 1));
    b.runUntil(at(5, 1));
    expect(100 - condition(b.state, 'hall')).toBeLessThan((100 - condition(a.state, 'hall')) * 0.5);
    expect(MAINT.planFactor).toBeLessThan(1);
  });
});

describe('camarins e hospitalidade', () => {
  it('o rider de acolhimento cresce com o estatuto do artista', () => {
    expect(hospitalityRider(ARTIST_BY_ID.luna, false)).toBe(0);
    expect(hospitalityRider(ARTIST_BY_ID.jazz, false)).toBe(1);
    expect(hospitalityRider(ARTIST_BY_ID.owls, false)).toBe(3);
    expect(hospitalityRider(ARTIST_BY_ID.madalena, false)).toBe(4);
    expect(hospitalityRider(ARTIST_BY_ID.owls, true)).toBe(0);
  });

  it('artista exigente recusa sem camarim; melhorar camarins resolve', () => {
    const sim = rich(6);
    sim.state.rep.general = 50;
    const req: BookingRequest = { roomId: 'hall', artistId: 'owls', startAt: at(2, 21), ticketPrice: 14, contractType: 'split', marketing: 'none' };
    expect(validateBooking(sim.state, req).some((e) => e.includes(' exige '))).toBe(true);
    expect(sim.upgrade('hall', 'dressing')).toBe(true);
    sim.state.rooms.hall.upgrades.dressing = 2;
    expect(validateBooking(sim.state, req).filter((e) => e.includes(' exige '))).toEqual([]);
  });

  it('camarins melhores dão mais satisfação ao artista e mais relação', () => {
    const run = (dressing: number) => {
      const sim = rich();
      sim.state.rooms.hall.upgrades.dressing = dressing;
      cleanHall(sim);
      const r = sim.book({ roomId: 'hall', artistId: 'jazz', startAt: at(0, 21), ticketPrice: 12, contractType: 'split', marketing: 'none' });
      if (!r.ok) throw new Error(r.errors.join());
      runEvent(sim, r.booking);
      return { sat: r.booking.result!.artistSat!, rel: sim.state.artists.jazz.relationship };
    };
    const none = run(0), good = run(2);
    expect(good.sat).toBeGreaterThan(none.sat);
    expect(good.rel).toBeGreaterThan(none.rel);
  });

  it('o catering custa por artista, entra na previsão e no resultado', () => {
    const sim = rich();
    cleanHall(sim);
    const req: BookingRequest = { roomId: 'hall', artistId: 'jazz', startAt: at(0, 21), ticketPrice: 12, contractType: 'split', marketing: 'none' };
    const before = forecast(sim.state, req);
    const satNone = artistSatisfaction(sim.state, 'hall', ARTIST_BY_ID.jazz, false);
    sim.setHospitality('full');
    const after = forecast(sim.state, req);
    expect(after.hospitality).toBe(ARTIST_BY_ID.jazz.members * 20);
    expect(after.net).toBeCloseTo(before.net - after.hospitality, 1);
    expect(artistSatisfaction(sim.state, 'hall', ARTIST_BY_ID.jazz, false)).toBeGreaterThan(satNone);
    const r = sim.book(req);
    if (!r.ok) throw new Error(r.errors.join());
    runEvent(sim, r.booking);
    expect(r.booking.result!.hospitality).toBe(80);
  });

  it('artista muito bem recebido recomenda a casa: chega mais uma proposta', () => {
    const sim = rich();
    sim.state.flags.artistRecommendation = true;
    const n = sim.state.inbox.length;
    dailyProposals(sim);
    expect(sim.state.flags.artistRecommendation).toBe(false);
    expect(sim.state.inbox.length).toBeGreaterThan(n);
  });

  it('com camarim os artistas esperam no camarim e sobem ao palco na abertura de portas', () => {
    const sim = rich();
    sim.state.rooms.hall.upgrades.dressing = 1;
    const r = sim.book({ roomId: 'hall', artistId: 'jazz', startAt: at(0, 21), ticketPrice: 12, contractType: 'split', marketing: 'none' });
    if (!r.ok) throw new Error(r.errors.join());
    sim.runUntil(r.booking.startAt - 50);
    const artists = () => sim.state.agents.filter((a) => a.kind === 'artist' && a.bookingId === r.booking.id);
    expect(artists().every((a) => a.state === 'dressing' || a.state === 'to_dressing')).toBe(true);
    sim.runUntil(r.booking.startAt + 5);
    expect(artists().every((a) => a.state === 'perform' || a.state === 'to_stage')).toBe(true);
  });
});

describe('armazém e equipamento', () => {
  it('comprar kits ocupa espaço e respeita a capacidade', () => {
    const sim = rich();
    expect(storageCapacity(sim.state)).toBe(2);
    expect(sim.buyKit('pa')).toBe(true);
    expect(sim.buyKit('light')).toBe(false); // sem espaço
    expect(sim.upgrade('hall', 'storage')).toBe(true);
    expect(sim.buyKit('light')).toBe(true);
    expect(sim.state.inventory.length).toBe(2);
  });

  it('um kit cobre o rider em vez de alugar e não pode estar em dois eventos ao mesmo tempo', () => {
    const sim = rich();
    sim.upgrade('hall', 'storage');
    const req: BookingRequest = { roomId: 'hall', artistId: 'pixel', startAt: at(1, 22), ticketPrice: 7, contractType: 'split', marketing: 'none' };
    const rentBefore = forecast(sim.state, req).rental;
    expect(rentBefore).toBeGreaterThan(0);
    sim.buyKit('pa');
    sim.buyKit('light');
    expect(forecast(sim.state, req).rental).toBe(0);
    const r = sim.book(req);
    if (!r.ok) throw new Error(r.errors.join());
    expect(r.booking.kits!.length).toBe(2);
    const b = r.booking;
    expect(freeKits(sim.state, b.startAt - b.setup, b.startAt + 30)).toEqual([]);
    expect(freeKits(sim.state, b.startAt + 3 * 1440, b.startAt + 3 * 1440 + 60).length).toBe(2);
  });

  it('os kits gastam-se com o uso e avariados deixam de contar', () => {
    const sim = rich();
    sim.upgrade('hall', 'storage');
    sim.buyKit('pa');
    sim.buyKit('light');
    cleanHall(sim);
    const r = sim.book({ roomId: 'hall', artistId: 'pixel', startAt: at(0, 22), ticketPrice: 7, contractType: 'split', marketing: 'none' });
    if (!r.ok) throw new Error(r.errors.join());
    runEvent(sim, r.booking);
    expect(r.booking.result!.equipmentRental).toBe(0);
    expect(r.booking.result!.kitsUsed!.length).toBe(2);
    expect(sim.state.inventory.every((k) => k.condition < 100 && k.uses === 1)).toBe(true);
    for (const k of sim.state.inventory) k.condition = 10;
    const req: BookingRequest = { roomId: 'hall', artistId: 'pixel', startAt: at(4, 22), ticketPrice: 7, contractType: 'split', marketing: 'none' };
    expect(forecast(sim.state, req).rental).toBeGreaterThan(0);
    expect(sim.repairKit(sim.state.inventory[0].id)).toBe(true);
    expect(sim.state.inventory[0].condition).toBe(100);
  });
});

describe('compatibilidade dos saves (fase B)', () => {
  it('turnos, conservação, catering e armazém sobrevivem ao save/load', () => {
    const sim = rich();
    sim.upgrade('hall', 'storage');
    sim.buyKit('pa');
    sim.setHospitality('basic');
    sim.setMaintenancePlan(true);
    sim.state.rooms.hall.condition = 77;
    const m = hireRole(sim, 'cleaner');
    sim.setShift(m.id, 'day');
    const s2 = deserialize(serialize(sim.state));
    expect(s2.inventory.length).toBe(1);
    expect(s2.hospitality).toBe('basic');
    expect(s2.flags.maintenancePlan).toBe(true);
    expect(s2.rooms.hall.condition).toBe(77);
    expect(s2.staff[0].shift).toBe('day');
  });

  it('um save antigo sem os campos novos carrega com valores por omissão', () => {
    const sim = rich();
    const raw = JSON.parse(serialize(sim.state));
    delete raw.state?.inventory; delete raw.inventory;
    delete raw.state?.hospitality; delete raw.hospitality;
    const s2 = deserialize(JSON.stringify(raw));
    expect(s2.inventory).toEqual([]);
    expect(s2.hospitality).toBe('none');
    expect(s2.rooms.blackbox.upgrades.dressing).toBe(0);
  });
});
