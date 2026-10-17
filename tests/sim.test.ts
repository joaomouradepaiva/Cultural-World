import { SPOTS } from '../src/content/map';
import { artistPayFor, demandBreakdown, findConflict, forecast, validateBooking } from '../src/sim/bookings';
import { serialize, deserialize, loadFrom, saveTo } from '../src/sim/save';
import { Simulation } from '../src/sim/sim';
import { roomCapacity } from '../src/sim/state';
import { at } from '../src/sim/time';
import { buildBar, cleanHall, firstConcert, ledgerBalance, newSim, runEvent } from './helpers';

describe('estado inicial e navegação', () => {
  it('começa com sala de 20 lugares, €1500 e bar por construir', () => {
    const sim = newSim();
    expect(sim.state.money).toBe(1500);
    expect(roomCapacity(sim.state, 'hall')).toBe(20);
    expect(sim.state.rooms.bar.built).toBe(false);
    expect(sim.state.rooms.hall.dirt.length).toBe(8);
  });

  it('a entrada liga à sala principal mas não a zonas por construir', () => {
    const sim = newSim();
    const [ex, ey] = SPOTS.entranceInside;
    expect(sim.grid.findPath(ex, ey, 7.5, 6.5)).not.toBeNull();
    expect(sim.grid.isWalkable(15, 15)).toBe(false); // porta do bar fechada
    sim.state.rooms.bar.built = true;
    sim.grid.rebuild(sim.state);
    expect(sim.grid.isWalkable(15, 15)).toBe(true);
    expect(sim.grid.findPath(ex, ey, 19.5, 16.5)).not.toBeNull();
  });
});

describe('procura de bilhetes', () => {
  const req = { roomId: 'hall' as const, artistId: 'ventiladores', startAt: at(1, 21), ticketPrice: 8, contractType: 'fixed' as const, marketing: 'none' as const };

  it('preço mais alto reduz a procura; marketing aumenta', () => {
    const sim = newSim();
    const base = demandBreakdown(sim.state, req).total;
    expect(demandBreakdown(sim.state, { ...req, ticketPrice: 14 }).total).toBeLessThan(base);
    expect(demandBreakdown(sim.state, { ...req, ticketPrice: 5 }).total).toBeGreaterThan(base);
    expect(demandBreakdown(sim.state, { ...req, marketing: 'posters' }).total).toBeCloseTo(base * 1.2 / 1, 0);
  });

  it('sábado vende mais do que segunda; reputação aumenta a procura', () => {
    const sim = newSim();
    const sat = demandBreakdown(sim.state, { ...req, startAt: at(1, 21) }).total; // dia 1 = sábado
    const mon = demandBreakdown(sim.state, { ...req, startAt: at(3, 21) }).total; // dia 3 = segunda
    expect(sat).toBeGreaterThan(mon);
    const before = demandBreakdown(sim.state, req).total;
    sim.state.rep.general = 60;
    sim.state.rep.music = 60;
    expect(demandBreakdown(sim.state, req).total).toBeGreaterThan(before);
  });

  it('a previsão nunca excede a capacidade', () => {
    const sim = newSim();
    const f = forecast(sim.state, { ...req, ticketPrice: 1, marketing: 'posters' });
    expect(f.attendance).toBeLessThanOrEqual(20);
    expect(f.high).toBeLessThanOrEqual(20);
  });
});

describe('contratos', () => {
  const c = (type: 'fixed' | 'split' | 'guarantee' | 'rental', o: Partial<{ fee: number; artistShare: number; guarantee: number; rent: number }> = {}) =>
    ({ type, fee: 0, artistShare: 0, guarantee: 0, rent: 0, ...o });
  it('calcula o pagamento ao artista por modelo', () => {
    expect(artistPayFor(c('fixed', { fee: 100 }), 500)).toBe(100);
    expect(artistPayFor(c('split', { artistShare: 0.7 }), 200)).toBe(140);
    expect(artistPayFor(c('guarantee', { guarantee: 50, artistShare: 0.5 }), 60)).toBe(50);
    expect(artistPayFor(c('guarantee', { guarantee: 50, artistShare: 0.5 }), 300)).toBe(150);
    expect(artistPayFor(c('rental', { rent: 150 }), 999)).toBe(0);
  });
});

describe('agenda', () => {
  it('impede sobreposições incluindo montagem e limpeza', () => {
    const sim = newSim();
    cleanHall(sim);
    const ok = sim.book({ roomId: 'hall', artistId: 'ventiladores', startAt: at(1, 21), ticketPrice: 8, contractType: 'split', marketing: 'none' });
    expect(ok.ok).toBe(true);
    // Rui Riso às 22:00 sobrepõe-se ao concerto das 21:00 (75 min + limpeza)
    const errs = validateBooking(sim.state, { roomId: 'hall', artistId: 'rui', startAt: at(1, 22), ticketPrice: 8, contractType: 'split', marketing: 'none' });
    expect(errs.some((e) => e.includes('Conflito'))).toBe(true);
    // às 15:00 do mesmo dia, cabe (montagem 60 min, fim 16:00 + 45 limpeza < 19:30 montagem)
    expect(validateBooking(sim.state, { roomId: 'hall', artistId: 'rui', startAt: at(1, 15), ticketPrice: 8, contractType: 'split', marketing: 'none' })).toEqual([]);
    expect(findConflict(sim.state, 'hall', at(1, 19, 45), at(1, 20))).toBeDefined();
  });

  it('exige tempo de montagem e artista desbloqueado', () => {
    const sim = newSim();
    expect(validateBooking(sim.state, { roomId: 'hall', artistId: 'ventiladores', startAt: at(0, 11), ticketPrice: 8, contractType: 'fixed', marketing: 'none' }).length).toBeGreaterThan(0);
    expect(validateBooking(sim.state, { roomId: 'hall', artistId: 'madalena', startAt: at(1, 21), ticketPrice: 25, contractType: 'fixed', marketing: 'none' }).length).toBeGreaterThan(0);
  });

  it('cancelamento reembolsa bilhetes vendidos', () => {
    const sim = newSim();
    const r = sim.book({ roomId: 'hall', artistId: 'ventiladores', startAt: at(2, 21), ticketPrice: 8, contractType: 'split', marketing: 'none' });
    if (!r.ok) throw new Error();
    sim.runMinutes(60 * 20);
    expect(r.booking.presold).toBeGreaterThan(0);
    const moneyBefore = sim.state.money;
    const revenue = r.booking.stats.ticketRevenue;
    expect(sim.cancel(r.booking.id)).toBe(true);
    expect(sim.state.money).toBeCloseTo(moneyBefore - revenue, 2);
  });
});

describe('ciclo completo do primeiro concerto', () => {
  it('vende bilhetes, realiza o concerto, fatura no bar e liquida as contas', () => {
    const sim = newSim();
    const b = firstConcert(sim);
    expect(sim.state.money).toBe(1500 - 500 - b.contract.fee);
    sim.runUntil(at(0, 19));
    expect(b.presold).toBeGreaterThan(0); // pré-venda progressiva
    expect(sim.state.rooms.bar.built).toBe(true);
    runEvent(sim, b);
    expect(b.status).toBe('settled');
    const r = b.result!;
    expect(r.attendance).toBeGreaterThan(10);
    expect(r.attendance).toBeLessThanOrEqual(20);
    expect(b.doorSold).toBeGreaterThan(0);
    expect(r.barRevenue).toBeGreaterThan(0);
    expect(r.ticketRevenue).toBe((b.presold + b.doorSold) * 8);
    expect(r.satisfaction).toBeGreaterThan(50);
    expect(sim.state.progress.totalEvents).toBe(1);
    expect(sim.state.missions.first_concert).toBe('done');
    // a contabilidade bate certo com o dinheiro
    expect(sim.state.money).toBeCloseTo(1500 + ledgerBalance(sim), 2);
  });

  it('sem ninguém na bilheteira perdem-se as vendas à porta', () => {
    const sim = newSim();
    const b = firstConcert(sim);
    runEvent(sim, b, { boxOffice: false, bar: false });
    expect(b.doorSold).toBe(0);
    expect(b.stats.lostImpatient + b.stats.lostTicket).toBeGreaterThan(0);
  });

  it('visitantes sentam-se durante o espetáculo e saem no fim', () => {
    const sim = newSim();
    const b = firstConcert(sim);
    sim.runUntil(b.startAt - 46);
    sim.placePlayer(SPOTS.boxOfficeServers[0][0], SPOTS.boxOfficeServers[0][1]);
    sim.runUntil(b.startAt + 30);
    const seated = sim.state.agents.filter((a) => a.bookingId === b.id && a.state === 'seated').length;
    expect(seated).toBeGreaterThanOrEqual(Math.floor(b.attendees * 0.8));
    expect(sim.state.agents.filter((a) => a.kind === 'artist' && a.state === 'perform').length).toBe(4);
    sim.runUntil(b.startAt + 300);
    expect(sim.state.agents.filter((a) => a.bookingId === b.id).length).toBe(0);
  });
});

describe('equipa e automatização', () => {
  it('um empregado de bar serve sem o jogador', () => {
    const sim = newSim();
    buildBar(sim);
    sim.state.level = 2;
    sim.runUntil(at(0, 13));
    const cand = sim.state.candidates.find((c) => c.role === 'bartender')!;
    expect(sim.hire(cand.id)).not.toBeNull();
    sim.placePlayer(2, 17);
    const before = sim.state.progress.drinksServed;
    sim.runUntil(at(0, 22));
    expect(sim.state.progress.drinksServed).toBeGreaterThan(before);
  });

  it('salários e custos fixos são pagos à meia-noite', () => {
    const sim = newSim();
    const cand = sim.state.candidates.find((c) => c.role === 'boxoffice')!;
    sim.hire(cand.id);
    const m = sim.state.money;
    sim.runUntil(at(1, 0, 30));
    const expected = sim.dailyFixedCosts();
    expect(m - sim.state.money).toBeCloseTo(expected, 2);
  });
});

describe('construção e melhorias', () => {
  it('a obra demora o tempo definido e abre a porta', () => {
    const sim = newSim();
    buildBar(sim);
    expect(sim.state.rooms.bar.built).toBe(false);
    sim.runMinutes(119);
    expect(sim.state.rooms.bar.built).toBe(false);
    sim.runMinutes(2);
    expect(sim.state.rooms.bar.built).toBe(true);
    expect(sim.grid.isWalkable(15, 15)).toBe(true);
  });

  it('a melhoria da plateia aumenta a capacidade de eventos futuros', () => {
    const sim = newSim();
    const r = sim.book({ roomId: 'hall', artistId: 'luna', startAt: at(1, 21), ticketPrice: 10, contractType: 'split', marketing: 'none' });
    if (!r.ok) throw new Error();
    expect(r.booking.capacity).toBe(20);
    expect(sim.upgrade('hall', 'seats')).toBe(true);
    expect(roomCapacity(sim.state, 'hall')).toBe(40);
    expect(r.booking.capacity).toBe(40);
  });

  it('a Black Box exige nível 3', () => {
    const sim = newSim();
    sim.state.money = 99999;
    buildBar(sim);
    sim.runMinutes(130);
    expect(sim.build('blackbox')).toBe(false);
    sim.state.level = 3;
    expect(sim.build('blackbox')).toBe(true);
  });
});

describe('bar e inventário', () => {
  it('compra de stock respeita o limite e o dinheiro', () => {
    const sim = newSim();
    buildBar(sim);
    const n = sim.buyStock('beer', 1000);
    expect(sim.state.bar.products.beer.stock).toBeLessThanOrEqual(120);
    expect(n).toBe(120 - 48);
    expect(sim.buyStock('wine', 10)).toBe(0); // carta ainda não inclui vinho
  });

  it('perecíveis sofrem desperdício diário', () => {
    const sim = newSim();
    sim.state.rooms.bar.upgrades.menu = 1;
    sim.state.rooms.bar.built = true;
    sim.state.bar.products.snack.stock = 50;
    sim.runUntil(at(1, 0, 5));
    expect(sim.state.bar.products.snack.stock).toBeLessThan(50);
  });
});

describe('save / load', () => {
  it('serializa e recupera o estado a meio de um evento', () => {
    const sim = newSim();
    const b = firstConcert(sim);
    sim.runUntil(b.startAt + 10);
    const json = serialize(sim.state);
    const restored = new Simulation(deserialize(json));
    expect(restored.state.money).toBe(sim.state.money);
    expect(restored.state.agents.length).toBe(sim.state.agents.length);
    // continuar a partir do save dá exatamente o mesmo resultado (determinismo)
    sim.runMinutes(240);
    restored.runMinutes(240);
    expect(restored.state.money).toBeCloseTo(sim.state.money, 5);
    expect(restored.state.bookings[0].result?.attendance).toBe(sim.state.bookings[0].result?.attendance);
  });

  it('usa armazenamento com chave e rejeita saves inválidos', () => {
    const mem = new Map<string, string>();
    const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) };
    const sim = newSim();
    sim.state.money = 777;
    expect(saveTo(storage, sim.state)).toBe(true);
    expect(loadFrom(storage)?.money).toBe(777);
    expect(() => deserialize('{"foo":1}')).toThrow();
  });
});

describe('progressão', () => {
  it('missões dão recompensa ao reclamar', () => {
    const sim = newSim();
    const b = firstConcert(sim);
    runEvent(sim, b);
    const m = sim.state.money;
    expect(sim.claim('first_concert')).toBe(true);
    expect(sim.state.money).toBeGreaterThanOrEqual(m + 300);
    expect(sim.claim('first_concert')).toBe(false);
  });

  it('o tutorial avança com as ações do jogador', () => {
    const sim = newSim();
    sim.tutorialNext(); // boas-vindas
    expect(sim.state.tutorial.step).toBe(1);
    sim.placePlayer(7, 6);
    sim.runMinutes(1);
    expect(sim.state.tutorial.step).toBe(2);
    cleanHall(sim);
    expect(sim.state.tutorial.step).toBe(3);
    buildBar(sim);
    expect(sim.state.tutorial.step).toBe(4);
  });
});
