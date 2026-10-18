import { ARTIST_BY_ID } from '../src/content/artists';
import { segmentDemand, updateLoyalty } from '../src/sim/audience';
import { demandBreakdown, type BookingRequest } from '../src/sim/bookings';
import { complaintsFor, experienceScores } from '../src/sim/experience';
import { deserialize, serialize } from '../src/sim/save';
import { seasonIndicators } from '../src/sim/seasons';
import { Simulation } from '../src/sim/sim';
import { at } from '../src/sim/time';
import type { Booking } from '../src/sim/types';
import { cleanHall, newSim, runEvent } from './helpers';

const req = (o: Partial<BookingRequest> = {}): BookingRequest => ({ roomId: 'hall', artistId: 'jazz', startAt: at(1, 21), ticketPrice: 12, contractType: 'split', marketing: 'none', ...o });

describe('perfis de público', () => {
  it('estudantes reagem mais ao preço do que turistas', () => {
    const sim = newSim();
    const cheap = segmentDemand(sim.state, ARTIST_BY_ID.luna, at(1, 21), 7);
    const dear = segmentDemand(sim.state, ARTIST_BY_ID.luna, at(1, 21), 16);
    expect(dear.shares.students).toBeLessThan(cheap.shares.students);
    expect(dear.shares.tourists).toBeGreaterThan(cheap.shares.tourists);
    expect(dear.factor).toBeLessThan(cheap.factor);
  });

  it('famílias preferem a tarde e o fim de semana', () => {
    const sim = newSim();
    const a = ARTIST_BY_ID.armazem;
    const afternoon = segmentDemand(sim.state, a, at(1, 16), 9).shares.families; // sábado
    const night = segmentDemand(sim.state, a, at(1, 22), 9).shares.families;
    const monday = segmentDemand(sim.state, a, at(3, 16), 9).shares.families;
    expect(afternoon).toBeGreaterThan(night * 2);
    expect(afternoon).toBeGreaterThan(monday);
  });

  it('a fidelização sobe com bons eventos e aumenta a procura futura', () => {
    const sim = newSim();
    const before = demandBreakdown(sim.state, req()).total;
    for (let i = 0; i < 10; i++) updateLoyalty(sim.state, { music: 0.6, creatives: 0.4 }, 85);
    expect(sim.state.audience.music).toBeGreaterThan(20);
    expect(demandBreakdown(sim.state, req()).total).toBeGreaterThan(before);
  });

  it('os visitantes de um evento têm segmento e o bar reage ao segmento', () => {
    const sim = newSim();
    cleanHall(sim);
    sim.build('bar');
    const r = sim.book({ roomId: 'hall', artistId: 'ventiladores', startAt: at(0, 21), ticketPrice: 8, contractType: 'fixed', marketing: 'none' });
    if (!r.ok) throw new Error();
    sim.runUntil(r.booking.startAt + 10);
    const vis = sim.state.agents.filter((a) => a.bookingId === r.booking.id && a.kind === 'visitor');
    expect(vis.length).toBeGreaterThan(5);
    expect(vis.every((a) => !!a.segment)).toBe(true);
    expect(new Set(vis.map((a) => a.segment)).size).toBeGreaterThan(1);
  });
});

describe('experiência do público', () => {
  function bookingAt(sim: Simulation, startAt: number, att: number): Booking {
    const r = sim.book({ roomId: 'hall', artistId: 'luna', startAt: at(1, 21), ticketPrice: 10, contractType: 'split', marketing: 'none' });
    if (!r.ok) throw new Error(r.errors.join());
    return { ...r.booking, startAt, attendees: att };
  }

  it('no verão, sala cheia sem climatização gera queixas de temperatura', () => {
    const sim = newSim();
    sim.state.rooms.hall.upgrades.seats = 3;
    const b = bookingAt(sim, at(100, 21), 110); // dia 100 ≈ junho
    const sc = experienceScores(sim.state, b, 60);
    expect(sc.temperature).toBeLessThan(90);
    expect(complaintsFor(b, sc).some((c) => c.key === 'temperature')).toBe(true);
    sim.state.rooms.hall.upgrades.climate = 1;
    expect(experienceScores(sim.state, b, 60).temperature).toBe(100);
    // na primavera não há problema
    expect(experienceScores(sim.state, { ...b, startAt: at(20, 21) }, 60).temperature).toBe(100);
  });

  it('sem segurança, eventos grandes perdem segurança; sem palco, plateias grandes perdem visibilidade', () => {
    const sim = newSim();
    const b = bookingAt(sim, at(20, 21), 100);
    const sc = experienceScores(sim.state, b, 60);
    expect(sc.safety).toBeLessThan(100);
    expect(sc.visibility).toBeLessThan(100);
  });

  it('reclamações específicas de segmento: famílias à noite, estudantes com preço alto', () => {
    const sim = newSim();
    const b = bookingAt(sim, at(1, 22), 30);
    const fam = complaintsFor({ ...b, segments: { families: 0.3, community: 0.7 } }, experienceScores(sim.state, b, 70));
    expect(fam.some((c) => c.key === 'late')).toBe(true);
    const stu = complaintsFor({ ...b, ticketPrice: 16, segments: { students: 0.4, music: 0.6 } }, experienceScores(sim.state, b, 70));
    expect(stu.some((c) => c.key === 'price_seg')).toBe(true);
  });

  it('o relatório do evento guarda os 10 componentes e as reclamações vão para o histórico', () => {
    const sim = newSim();
    cleanHall(sim);
    sim.build('bar');
    const r = sim.book({ roomId: 'hall', artistId: 'ventiladores', startAt: at(0, 21), ticketPrice: 8, contractType: 'fixed', marketing: 'none' });
    if (!r.ok) throw new Error();
    runEvent(sim, r.booking, { boxOffice: false, bar: false });
    const res = r.booking.result!;
    expect(Object.keys(res.scores).length).toBe(10);
    expect(res.complaints.length).toBeGreaterThan(0); // sem ninguém a servir há filas
    expect(sim.state.feedback.length).toBe(res.complaints.length);
  });
});

describe('temporadas culturais', () => {
  const base = { name: 'Jazz de Março', theme: 'jazz' as const, duration: 'month' as const, startDay: 1, budget: 600, passEnabled: true, passPrice: 30 };

  it('valida tema, nome, galeria e limites', () => {
    const sim = newSim();
    sim.state.money = 9999;
    expect(sim.createSeason({ ...base, theme: 'cinema' }).ok).toBe(false);
    expect(sim.createSeason({ ...base, theme: 'visual' }).ok).toBe(false); // sem galeria
    expect(sim.createSeason({ ...base, name: ' ' }).ok).toBe(false);
    expect(sim.createSeason(base).ok).toBe(true);
    expect(sim.createSeason({ ...base, name: 'Outra' }).ok).toBe(false); // mesmo tema sobreposto
  });

  it('eventos do tema entram na temporada e ganham a campanha conjunta', () => {
    const sim = newSim();
    sim.state.money = 9999;
    sim.state.level = 2;
    sim.state.rep.general = 20;
    const without = demandBreakdown(sim.state, req({ startAt: at(3, 21) })).total;
    const r = sim.createSeason(base);
    if (!r.ok) throw new Error(r.errors.join());
    const withS = demandBreakdown(sim.state, req({ startAt: at(3, 21) }));
    expect(withS.total).toBeGreaterThan(without);
    const b = sim.book(req({ startAt: at(3, 21) }));
    if (!b.ok) throw new Error(b.errors.join());
    expect(b.booking.seasonId).toBe(r.season.id);
    // um evento fora do tema não entra
    const other = sim.book({ roomId: 'hall', artistId: 'rui', startAt: at(5, 21), ticketPrice: 8, contractType: 'split', marketing: 'none' });
    if (!other.ok) throw new Error(other.errors.join());
    expect(other.booking.seasonId).toBeNull();
  });

  it('passes: vendem-se até ao primeiro terço, entram em caixa e ocupam lugares nos eventos do ciclo', () => {
    const sim = newSim();
    sim.state.money = 9999;
    sim.state.level = 2;
    sim.state.rep.general = 20;
    sim.state.audience.music = 60;
    sim.state.audience.creatives = 60;
    const money0 = sim.state.money;
    const r = sim.createSeason({ ...base, budget: 0 });
    if (!r.ok) throw new Error();
    expect(r.season.pass.target).toBeGreaterThan(5);
    const b = sim.book(req({ startAt: at(12, 21) }));
    if (!b.ok) throw new Error();
    sim.runUntil(at(11, 12));
    expect(r.season.pass.sold).toBeGreaterThan(3);
    expect(sim.state.money).toBeGreaterThan(money0 - 1);
    expect(b.booking.passSeats).toBeGreaterThan(0);
    expect(b.booking.presold + b.booking.passSeats).toBeLessThanOrEqual(b.booking.capacity);
    sim.runUntil(at(12, 23, 59));
    expect(b.booking.result).not.toBeNull();
    expect(b.booking.stats.passAllocated).toBeGreaterThan(0);
    // a partilha com o artista inclui a parte dos passes
    expect(b.booking.result!.artistPay).toBeCloseTo((b.booking.stats.ticketRevenue + b.booking.stats.passAllocated) * b.booking.contract.artistShare, 1);
    const ind = seasonIndicators(sim.state, r.season);
    expect(ind.events).toBe(1);
    expect(ind.passes).toBe(r.season.pass.sold);
  });

  it('a consistência do ciclo aumenta a procura e o encerramento avalia objetivos', () => {
    const sim = newSim();
    sim.state.money = 99999;
    sim.state.level = 3;
    sim.state.rep.general = 25;
    const r = sim.createSeason({ ...base, duration: 'week', budget: 0, passEnabled: false });
    if (!r.ok) throw new Error();
    const b1 = sim.book(req({ startAt: at(2, 21) }));
    if (!b1.ok) throw new Error(b1.errors.join());
    const before = demandBreakdown(sim.state, req({ artistId: 'luna', startAt: at(6, 21) })).season;
    sim.runUntil(at(3, 10));
    expect(b1.booking.status).toBe('settled');
    // Luna Fado não é jazz: o bónus de ciclo só existe para eventos do tema
    expect(before).toBe(1);
    const jazzAfter = demandBreakdown(sim.state, req({ startAt: at(7, 21) })).season;
    expect(jazzAfter).toBeGreaterThan(1);
    sim.runUntil(at(9, 1));
    expect(r.season.status).toBe('closed');
    expect(r.season.result!.events).toBe(1);
    expect(r.season.result!.objectivesMet).toBeGreaterThanOrEqual(0);
  });

  it('programação recorrente marca várias semanas e pára na primeira data impossível', () => {
    const sim = newSim();
    sim.state.money = 99999;
    const r = sim.bookSeries({ roomId: 'hall', artistId: 'luna', startAt: at(1, 21), ticketPrice: 10, contractType: 'split', marketing: 'none' }, 4);
    expect(r.booked).toBe(2); // limite de 14 dias de antecedência
    expect(r.errors.join()).toContain('14 dias');
    expect(sim.state.bookings.filter((b) => b.artistId === 'luna').length).toBe(2);
  });

  it('cancelar uma temporada planeada reembolsa os passes', () => {
    const sim = newSim();
    sim.state.money = 9999;
    sim.state.audience.music = 70;
    const r = sim.createSeason({ ...base, startDay: 10, budget: 0 });
    if (!r.ok) throw new Error();
    sim.runUntil(at(5, 12));
    const sold = r.season.pass.revenue;
    expect(sold).toBeGreaterThan(0);
    const m = sim.state.money;
    expect(sim.cancelSeason(r.season.id)).toBe(true);
    expect(sim.state.money).toBeCloseTo(m - sold, 2);
  });
});

describe('persistência da Fase A', () => {
  it('temporadas, fidelização e reclamações sobrevivem ao save/load', () => {
    const sim = newSim();
    sim.state.money = 9999;
    sim.createSeason({ name: 'X', theme: 'comedy', duration: 'month', startDay: 1, budget: 100, passEnabled: true, passPrice: 25 });
    sim.state.audience.students = 42;
    sim.state.feedback.push({ key: 'service', text: 't', suggestion: 's', share: 10, t: 0, bookingId: 1 });
    const st = deserialize(serialize(sim.state));
    expect(st.seasons.length).toBe(1);
    expect(st.audience.students).toBe(42);
    expect(st.feedback.length).toBe(1);
  });

  it('um save antigo (sem os campos novos) carrega com valores por omissão', () => {
    const sim = newSim();
    sim.book({ roomId: 'hall', artistId: 'luna', startAt: at(1, 21), ticketPrice: 10, contractType: 'split', marketing: 'none' });
    const old = JSON.parse(serialize(sim.state));
    delete old.state.audience; delete old.state.seasons; delete old.state.feedback;
    for (const b of old.state.bookings) { delete b.seasonId; delete b.passSeats; delete b.segments; delete b.stats.passAllocated; }
    const st = deserialize(JSON.stringify(old));
    expect(st.audience.community).toBeGreaterThan(0);
    expect(st.seasons).toEqual([]);
    expect(st.bookings[0].passSeats).toBe(0);
    const s2 = new Simulation(st);
    s2.runUntil(at(2, 3));
    expect(s2.state.bookings[0].status).toBe('settled');
  });
});
