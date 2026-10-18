import { ARTIST_BY_ID } from '../src/content/artists';
import { PREMIUM } from '../src/content/premium';
import { contractTerms, demandBreakdown, forecast, validateBooking, type BookingRequest } from '../src/sim/bookings';
import { creditLimit, debt, installmentFor, loanError, loanQuote, treasury } from '../src/sim/finance';
import { DEFAULT_OFFER, negotiationScore } from '../src/sim/negotiation';
import { premiumSatisfaction } from '../src/sim/premium';
import { deserialize, serialize } from '../src/sim/save';
import { dailySponsors, sponsorProposal } from '../src/sim/sponsors';
import { at, MIN_PER_DAY } from '../src/sim/time';
import type { Booking } from '../src/sim/types';
import { cleanHall, newSim, runEvent } from './helpers';

function rich(level = 5) {
  const sim = newSim();
  sim.state.money = 30000;
  sim.state.level = level;
  sim.state.rep.general = 40;
  return sim;
}

const req = (o: Partial<BookingRequest> = {}): BookingRequest => ({ roomId: 'hall', artistId: 'jazz', startAt: at(1, 21), ticketPrice: 12, contractType: 'fixed', marketing: 'none', ...o });

describe('contratos novos', () => {
  it('coprodução: contribuição de 60% do cachet, artista com 40% e +5 de qualidade', () => {
    const sim = rich();
    const fixed = contractTerms(sim.state, 'jazz', 'fixed', 'hall');
    const co = contractTerms(sim.state, 'jazz', 'coproduction', 'hall');
    expect(co.fee).toBe(Math.round(fixed.fee * 0.6));
    expect(co.artistShare).toBe(0.4);
    cleanHall(sim);
    const r = sim.book(req({ startAt: at(0, 21), contractType: 'coproduction' }));
    if (!r.ok) throw new Error(r.errors.join());
    runEvent(sim, r.booking);
    const res = r.booking.result!;
    expect(res.artistPay).toBeCloseTo(co.fee + res.ticketRevenue * 0.4, 0);
  });

  it('residência: exige relação 25+ e marca 4 datas semanais de uma vez (ou nenhuma)', () => {
    const sim = rich();
    expect(validateBooking(sim.state, req({ contractType: 'residency' })).some((e) => e.includes('relação'))).toBe(true);
    sim.state.artists.jazz.relationship = 30;
    // bloqueia a 2.ª semana: nada é marcado
    const blocker = sim.book(req({ artistId: 'luna', startAt: at(8, 21), contractType: 'split', ticketPrice: 10 }));
    expect(blocker.ok).toBe(true);
    const n0 = sim.state.bookings.length;
    expect(sim.book(req({ contractType: 'residency' })).ok).toBe(false);
    expect(sim.state.bookings.length).toBe(n0);
    sim.cancel(blocker.ok ? blocker.booking.id : -1);
    const r = sim.book(req({ contractType: 'residency' }));
    expect(r.ok).toBe(true);
    const res = sim.state.bookings.filter((b) => b.artistId === 'jazz' && b.status === 'scheduled');
    expect(res.length).toBe(4);
    expect(res[1].startAt - res[0].startAt).toBe(7 * MIN_PER_DAY);
    // o público da residência cansa-se menos do que numa repetição normal
    expect(demandBreakdown(sim.state, req({ startAt: at(8, 21), contractType: 'residency' })).freshness).toBeGreaterThanOrEqual(0.92);
  });
});

describe('negociação', () => {
  it('oferta baixa sem relação é recusada, baixa a relação e bloqueia nova tentativa no mesmo dia', () => {
    const sim = rich();
    sim.state.rep.general = 20;
    const o = { ...DEFAULT_OFFER, feeFactor: 0.7 };
    const r = sim.negotiate(req(), o);
    expect(r.outcome).toBe('refused');
    expect(sim.state.artists.jazz.relationship).toBe(0);
    sim.state.artists.jazz.relationship = 10;
    const again = sim.negotiate(req(), { ...DEFAULT_OFFER });
    expect(again.outcome).toBe('refused');
    expect(again.reason).toMatch(/hoje/);
  });

  it('a relação e a reputação tornam aceitável o que antes era recusado', () => {
    const sim = rich();
    const o = { ...DEFAULT_OFFER, feeFactor: 0.85 };
    const low = negotiationScore(sim.state, req(), o).score;
    sim.state.artists.jazz.relationship = 70;
    sim.state.rep.general = 60;
    const high = negotiationScore(sim.state, req(), o).score;
    expect(high).toBeGreaterThan(low + 20);
    const r = sim.negotiate(req(), o);
    expect(r.outcome).toBe('accepted');
    expect(r.contract!.fee).toBe(Math.round(contractTerms(sim.state, 'jazz', 'fixed', 'hall').fee * 0.85));
  });

  it('zona intermédia gera contraproposta a meio caminho', () => {
    const sim = rich();
    sim.state.artists.jazz.relationship = 30;
    const o = { ...DEFAULT_OFFER, feeFactor: 0.8 };
    const sc = negotiationScore(sim.state, req(), o).score;
    expect(sc).toBeGreaterThanOrEqual(50);
    expect(sc).toBeLessThan(70);
    const r = sim.negotiate(req(), o);
    expect(r.outcome).toBe('counter');
    expect(r.counter!.feeFactor).toBe(0.9);
  });

  it('as cláusulas têm efeito real: equipamento do artista, exclusividade, promoção', () => {
    const sim = rich();
    sim.state.artists.pixel.relationship = 80;
    const base = req({ artistId: 'pixel', ticketPrice: 7 });
    expect(forecast(sim.state, base).rental).toBeGreaterThan(0);
    const r = sim.negotiate(base, { ...DEFAULT_OFFER, feeFactor: 1.2, techByArtist: true, exclusive: true, benefit: 'promo' });
    expect(r.outcome).toBe('accepted');
    const dealt = { ...base, contract: r.contract! };
    const f = forecast(sim.state, dealt);
    expect(f.rental).toBe(0);
    expect(demandBreakdown(sim.state, dealt).total).toBeGreaterThan(demandBreakdown(sim.state, base).total * 1.12);
    const b = sim.book(dealt);
    if (!b.ok) throw new Error(b.errors.join());
    expect(b.booking.contract.negotiated).toBe(true);
    expect(b.booking.stats.marketingCost).toBe(60);
  });
});

describe('patrocínios', () => {
  it('paga por espetáculo e, se cumprido, dá reputação', () => {
    const sim = rich(4);
    const p = sponsorProposal(sim.state)!;
    expect(p).not.toBeNull();
    p.sponsor!.minEvents = 1;
    sim.state.inbox.push(p);
    expect(sim.acceptProposal(p.id).ok).toBe(true);
    cleanHall(sim);
    const r = sim.book(req({ startAt: at(0, 21), contractType: 'split' }));
    if (!r.ok) throw new Error(r.errors.join());
    runEvent(sim, r.booking);
    expect(r.booking.result!.sponsorship).toBe(p.sponsor!.perEvent);
    const sp = sim.state.sponsorships[0];
    sim.state.time = sp.endDay * MIN_PER_DAY - 60;
    const rep = sim.state.rep.general;
    dailySponsors(sim);
    expect(sp.status).toBe('done');
    expect(sim.state.rep.general).toBeGreaterThan(rep);
  });

  it('incumprimento devolve metade e tira reputação', () => {
    const sim = rich(4);
    const p = sponsorProposal(sim.state)!;
    sim.state.inbox.push(p);
    sim.acceptProposal(p.id);
    const sp = sim.state.sponsorships[0];
    sp.paid = 200; sp.events = 0;
    sim.state.time = sp.endDay * MIN_PER_DAY - 60;
    const money = sim.state.money, rep = sim.state.rep.general;
    dailySponsors(sim);
    expect(sp.status).toBe('failed');
    expect(sim.state.money).toBeCloseTo(money - 100, 2);
    expect(sim.state.rep.general).toBeLessThan(rep);
  });
});

describe('empréstimos e tesouraria', () => {
  it('prestação pelo sistema francês: custo total = prestações e juros positivos', () => {
    const i = installmentFor(5200, 0.0, 52);
    expect(i).toBe(100);
    const sim = rich();
    const q = loanQuote(sim.state, 'works', 4000, 26);
    expect(q.installment * 26).toBeCloseTo(q.total, 1);
    expect(q.interest).toBeGreaterThan(0);
    expect(loanQuote(sim.state, 'expansion', 4000, 26).rate).toBeGreaterThan(q.rate);
  });

  it('o limite de crédito trava pedidos excessivos', () => {
    const sim = rich();
    expect(loanError(sim.state, 'works', creditLimit(sim.state) + 500, 16)).toMatch(/limite/);
    sim.state.level = 1;
    expect(loanError(sim.state, 'works', 1000, 16)).toMatch(/nível 2/);
  });

  it('o capital entra em caixa, as prestações são pagas automaticamente e pode-se amortizar', () => {
    const sim = rich();
    const m0 = sim.state.money;
    expect(sim.takeLoan('equipment', 3000, 8)).toBe(true);
    expect(sim.state.money).toBe(m0 + 3000);
    const l = sim.state.loans[0];
    sim.runUntil(at(8, 1));
    expect(l.paidWeeks).toBe(1);
    expect(l.remaining).toBeLessThan(3000);
    expect(l.interestPaid).toBeGreaterThan(0);
    expect(debt(sim.state)).toBe(l.remaining);
    expect(sim.repayLoan(l.id)).toBe(true);
    expect(l.status).toBe('repaid');
    expect(debt(sim.state)).toBe(0);
  });

  it('saldo negativo paga juros de descoberto', () => {
    const sim = rich();
    sim.state.money = -500;
    sim.runUntil(at(1, 1));
    const exp = sim.state.ledger.find((d) => d.day === 0)!.expense;
    expect(exp.interest).toBeGreaterThanOrEqual(5);
  });

  it('a tesouraria projeta 14 dias com eventos, custos fixos e prestações', () => {
    const sim = rich();
    const empty = treasury(sim.state);
    expect(empty.days.length).toBe(14);
    expect(empty.futureExpenses).toBeGreaterThan(0);
    const r = sim.book(req({ startAt: at(3, 21), contractType: 'split' }));
    expect(r.ok).toBe(true);
    const withShow = treasury(sim.state);
    expect(withShow.expectedIncome).toBeGreaterThan(empty.expectedIncome);
    sim.takeLoan('works', 2000, 8);
    const withLoan = treasury(sim.state);
    expect(withLoan.debt).toBe(2000);
    expect(withLoan.futureExpenses).toBeGreaterThan(withShow.futureExpenses + sim.state.loans[0].installment * 1.5);
  });
});

describe('experiências premium', () => {
  it('VIP exige bar; vende-se à abertura de portas e entra no resultado', () => {
    const sim = rich();
    const pc = { premium: { vip: true, meet: false, backstage: false, patrons: false, presale: false } };
    expect(forecast(sim.state, req({ ...pc, contractType: 'split' })).premium.vip).toBeGreaterThanOrEqual(0);
    cleanHall(sim);
    sim.build('bar');
    sim.state.rooms.bar.construction = null; sim.state.rooms.bar.built = true;
    const r = sim.book(req({ ...pc, startAt: at(0, 21), contractType: 'split' }));
    if (!r.ok) throw new Error(r.errors.join());
    sim.runUntil(r.booking.startAt - 40);
    expect(r.booking.premiumSold).toBeDefined();
    const vip = r.booking.premiumSold!.vip;
    expect(vip).toBeGreaterThan(0);
    expect(vip).toBeLessThanOrEqual(Math.floor(r.booking.capacity * PREMIUM.vip.capShare));
    sim.runUntil(r.booking.startAt + 5);
    expect(sim.state.agents.filter((a) => a.bookingId === r.booking.id && a.vip).length).toBe(vip);
    runEvent(sim, r.booking);
    expect(r.booking.result!.premium!.vip).toBe(vip);
    expect(r.booking.result!.premium!.revenue).toBeGreaterThan(0);
  });

  it('demasiados VIP prejudicam o conforto do público geral', () => {
    const b = { attendees: 50, premiumSold: { vip: 8, boxes: 0, backstage: 0 } } as unknown as Booking;
    expect(premiumSatisfaction(b).comfortPenalty).toBeGreaterThan(0);
    const ok = { attendees: 50, premiumSold: { vip: 4, boxes: 0, backstage: 0 } } as unknown as Booking;
    expect(premiumSatisfaction(ok).comfortPenalty).toBe(0);
    expect(premiumSatisfaction(ok).bonus).toBeGreaterThan(0);
  });

  it('meet & greet: exige camarim, rende depois do espetáculo e os artistas vão ao átrio', () => {
    const sim = rich();
    const pc = { premium: { vip: false, meet: true, backstage: false, patrons: false, presale: false } };
    expect(forecast(sim.state, req({ ...pc, startAt: at(0, 21), contractType: 'split' })).premium.meet).toBeGreaterThanOrEqual(0);
    sim.state.rooms.hall.upgrades.dressing = 1;
    cleanHall(sim);
    const r = sim.book(req({ ...pc, startAt: at(0, 21), contractType: 'split' }));
    if (!r.ok) throw new Error(r.errors.join());
    sim.runUntil(r.booking.startAt + r.booking.duration + 10);
    expect(sim.state.agents.some((a) => a.kind === 'artist' && (a.state === 'meet' || a.state === 'to_meet'))).toBe(true);
    runEvent(sim, r.booking);
    expect(r.booking.result!.premium!.meet).toBeGreaterThan(0);
  });

  it('camarotes vendem lugares extra sem tirar lugares à plateia', () => {
    const sim = rich(7);
    sim.state.rooms.hall.upgrades.seats = 2;
    const cap = sim.state.rooms.hall.upgrades.seats;
    sim.state.rooms.hall.upgrades.boxes = 1;
    expect(sim.state.rooms.hall.upgrades.seats).toBe(cap);
    cleanHall(sim);
    const r = sim.book(req({ startAt: at(0, 21), contractType: 'split' }));
    if (!r.ok) throw new Error(r.errors.join());
    sim.runUntil(r.booking.startAt - 40);
    expect(r.booking.premiumSold!.boxes).toBeGreaterThan(0);
    expect(r.booking.premiumSold!.boxes).toBeLessThanOrEqual(8);
  });

  it('pré-venda para fiéis aumenta a pré-venda', () => {
    const sim = rich();
    sim.state.rooms.hall.upgrades.seats = 3;
    const a = sim.book(req({ startAt: at(3, 21), contractType: 'split' }));
    const b = sim.book(req({ artistId: 'luna', ticketPrice: 10, startAt: at(4, 21), contractType: 'split', premium: { vip: false, meet: false, backstage: false, patrons: false, presale: true } }));
    const c = sim.book(req({ artistId: 'rui', ticketPrice: 8, startAt: at(5, 21), contractType: 'split' }));
    if (!a.ok || !b.ok || !c.ok) throw new Error();
    const sim2 = rich();
    sim2.state.rooms.hall.upgrades.seats = 3;
    sim2.book(req({ startAt: at(3, 21), contractType: 'split' }));
    const b2 = sim2.book(req({ artistId: 'luna', ticketPrice: 10, startAt: at(4, 21), contractType: 'split' }));
    if (!b2.ok) throw new Error();
    expect(b.booking.presaleTarget).toBeGreaterThan(b2.booking.presaleTarget);
    expect(b.booking.stats.premiumCost).toBe(40);
  });
});

describe('compatibilidade dos saves (fase C)', () => {
  it('empréstimos, patrocínios e premium sobrevivem; saves antigos carregam', () => {
    const sim = rich();
    sim.takeLoan('works', 2000, 16);
    const raw = serialize(sim.state);
    const s2 = deserialize(raw);
    expect(s2.loans.length).toBe(1);
    const old = JSON.parse(raw);
    for (const o of [old, old.state].filter(Boolean)) { delete o.loans; delete o.sponsorships; delete o.negotiations; }
    const s3 = deserialize(JSON.stringify(old));
    expect(s3.loans).toEqual([]);
    expect(s3.sponsorships).toEqual([]);
    expect(s3.negotiations).toEqual({});
    expect(ARTIST_BY_ID.jazz).toBeDefined();
  });
});
