import { BALANCE } from '../src/content/balance';
import { artistProposal, corporateProposal, proposalErrors, workshopProposal } from '../src/sim/proposals';
import { deserialize, serialize } from '../src/sim/save';
import { Simulation } from '../src/sim/sim';
import { at, MIN_PER_DAY } from '../src/sim/time';
import { cleanHall, newSim } from './helpers';

function nextMorning(sim: Simulation): void {
  sim.runUntil((Math.floor(sim.state.time / MIN_PER_DAY) + 1) * MIN_PER_DAY + 10 * 60);
}

describe('caixa de propostas', () => {
  it('chegam propostas de artistas, empresas e formadores (nível 2+), com validade', () => {
    const sim = newSim(3);
    sim.state.level = 2;
    const kinds = new Set<string>();
    for (let d = 0; d < 14; d++) {
      nextMorning(sim);
      for (const p of sim.state.inbox) kinds.add(p.kind);
      expect(sim.state.inbox.length).toBeLessThanOrEqual(BALANCE.inboxMax);
      for (const p of sim.state.inbox) {
        expect(p.expiresAt).toBeGreaterThan(sim.state.time);
        expect(p.startAt - sim.state.time).toBeLessThanOrEqual(BALANCE.maxAdvanceDays * MIN_PER_DAY);
      }
    }
    expect([...kinds].sort()).toEqual(['artist', 'corporate', 'workshop']);
  });

  it('nunca há duas propostas pendentes do mesmo artista', () => {
    const sim = newSim(4);
    sim.state.level = 3;
    sim.state.rep.general = 40;
    for (let d = 0; d < 10; d++) {
      nextMorning(sim);
      const ids = sim.state.inbox.filter((p) => p.kind === 'artist').map((p) => p.artistId);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('no nível 1 só chegam propostas de artistas', () => {
    const sim = newSim(5);
    for (let d = 0; d < 6; d++) nextMorning(sim);
    expect(sim.state.inbox.every((p) => p.kind === 'artist')).toBe(true);
  });

  it('as propostas expiram ao fim de 2 dias', () => {
    const sim = newSim(9);
    const p = artistProposal(sim.state)!;
    sim.state.inbox.push(p);
    sim.runUntil(p.createdAt + 3 * MIN_PER_DAY);
    expect(sim.state.inbox.find((x) => x.id === p.id)).toBeUndefined();
  });

  it('aceitar uma proposta de artista agenda com os termos propostos (cachet com desconto)', () => {
    const sim = newSim(11);
    const p = artistProposal(sim.state)!;
    sim.state.inbox.push(p);
    expect(proposalErrors(sim.state, p)).toEqual([]);
    const r = sim.acceptProposal(p.id);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.booking.kind).toBe('show');
    expect(r.booking.contract).toEqual(p.contract);
    expect(sim.state.inbox.length).toBe(0);
  });

  it('evento de empresa: aluguer certo, sem bilheteira, pouca reputação', () => {
    const sim = newSim(13);
    cleanHall(sim);
    sim.state.level = 2;
    const p = corporateProposal(sim.state)!;
    sim.state.inbox.push(p);
    const r = sim.acceptProposal(p.id);
    if (!r.ok) throw new Error(r.errors.join(';'));
    const b = r.booking;
    sim.runUntil(b.startAt + b.duration + 120);
    expect(b.status).toBe('settled');
    expect(b.result!.rentIncome).toBe(p.contract.rent);
    expect(b.result!.ticketRevenue).toBe(0);
    expect(b.result!.attendance).toBeGreaterThan(0);
    expect(b.doorSold).toBe(0);
    expect(Math.abs(b.result!.repDelta)).toBeLessThan(1.5);
    expect(sim.state.progress.eventsByDiscipline.corporate).toBe(1);
  });

  it('workshop: inscrições pagas, formador recebe a sua parte, sobe a reputação em formação', () => {
    const sim = newSim(17);
    cleanHall(sim);
    sim.state.level = 2;
    const p = workshopProposal(sim.state)!;
    sim.state.inbox.push(p);
    const training0 = sim.state.rep.training;
    const r = sim.acceptProposal(p.id);
    if (!r.ok) throw new Error(r.errors.join(';'));
    const b = r.booking;
    sim.runUntil(b.startAt + b.duration + 120);
    expect(b.status).toBe('settled');
    expect(b.presold).toBe(Math.min(p.participants, b.capacity));
    expect(b.result!.artistPay).toBeCloseTo(b.result!.ticketRevenue * p.contract.artistShare, 2);
    expect(sim.state.rep.training).toBeGreaterThan(training0);
  });

  it('recusar remove a proposta; a caixa sobrevive ao save/load', () => {
    const sim = newSim(19);
    sim.state.level = 2;
    sim.state.inbox.push(artistProposal(sim.state)!, workshopProposal(sim.state)!);
    const restored = deserialize(serialize(sim.state));
    expect(restored.inbox.length).toBe(2);
    expect(sim.declineProposal(sim.state.inbox[0].id)).toBe(true);
    expect(sim.state.inbox.length).toBe(1);
  });

  it('é possível programar com 13 dias de antecedência, mas não com 15', () => {
    const sim = newSim(21);
    const ok = sim.book({ roomId: 'hall', artistId: 'luna', startAt: at(13, 21), ticketPrice: 10, contractType: 'split', marketing: 'none' });
    expect(ok.ok).toBe(true);
    const far = sim.book({ roomId: 'hall', artistId: 'rui', startAt: at(15, 21), ticketPrice: 8, contractType: 'split', marketing: 'none' });
    expect(far.ok).toBe(false);
  });
});
