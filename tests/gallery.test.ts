import { VISUAL_ARTISTS } from '../src/content/visualArtists';
import { exhibitionForecast, validateExhibition } from '../src/sim/gallery';
import { exhibitionProposal } from '../src/sim/proposals';
import { deserialize, serialize } from '../src/sim/save';
import { Simulation } from '../src/sim/sim';
import { at, dayOf } from '../src/sim/time';
import { newSim } from './helpers';

function withGallery(seed = 1): Simulation {
  const sim = newSim(seed);
  sim.state.level = 2;
  sim.state.money = 5000;
  expect(sim.build('gallery')).toBe(true);
  sim.runMinutes(310);
  expect(sim.state.rooms.gallery.built).toBe(true);
  return sim;
}

describe('galeria', () => {
  it('constrói-se no nível 2, sem precisar do bar, e abre a porta para a rua', () => {
    const sim = newSim(1);
    sim.state.money = 5000;
    expect(sim.build('gallery')).toBe(false); // nível 1
    sim.state.level = 2;
    expect(sim.build('gallery')).toBe(true);
    expect(sim.grid.isWalkable(34, 19)).toBe(false);
    sim.runMinutes(310);
    expect(sim.grid.isWalkable(34, 19)).toBe(true);
    expect(sim.grid.findPath(34.5, 20.5, 35, 10)).not.toBeNull();
  });

  it('valida agenda: começa amanhã ou depois, não se sobrepõe, exige expositores', () => {
    const sim = withGallery();
    const d = dayOf(sim.state.time);
    expect(validateExhibition(sim.state, { artistId: 'lume', startDay: d, days: 7, entryPrice: 3 }).length).toBeGreaterThan(0);
    expect(sim.scheduleExhibition({ artistId: 'lume', startDay: d + 1, days: 7, entryPrice: 3 }).ok).toBe(true);
    expect(validateExhibition(sim.state, { artistId: 'tinta', startDay: d + 4, days: 5, entryPrice: 3 }).join()).toContain('ocupada');
    expect(validateExhibition(sim.state, { artistId: 'tinta', startDay: d + 8, days: 5, entryPrice: 3 })).toEqual([]);
    sim.state.level = 3;
    sim.state.rep.general = 30;
    expect(validateExhibition(sim.state, { artistId: 'ferro', startDay: d + 8, days: 5, entryPrice: 4 }).join()).toContain('Expositores');
  });

  it('exposição completa: visitantes ao longo dos dias, entradas, vendas com comissão, reputação visual', () => {
    const sim = withGallery(7);
    const d = dayOf(sim.state.time);
    const money0 = sim.state.money;
    const r = sim.scheduleExhibition({ artistId: 'tinta', startDay: d + 1, days: 7, entryPrice: 3 });
    if (!r.ok) throw new Error(r.errors.join());
    const e = r.exhibition;
    expect(sim.state.money).toBe(money0 - e.setupCost);
    sim.runUntil(at(d + 1, 15));
    expect(e.status).toBe('open');
    expect(sim.state.agents.some((a) => a.kind === 'galleryVisitor')).toBe(true);
    const vis0 = sim.state.rep.visual;
    sim.runUntil(at(d + 9, 1));
    expect(e.status).toBe('closed');
    const res = e.result!;
    expect(res.visitors).toBeGreaterThan(40);
    expect(res.entryRevenue).toBeCloseTo(res.visitors * 3, 2);
    expect(res.commission).toBeCloseTo(e.works.filter((w) => w.sold).reduce((t, w) => t + w.price * e.commission, 0), 2);
    expect(sim.state.rep.visual).not.toBe(vis0);
    expect(sim.state.agents.some((a) => a.kind === 'galleryVisitor')).toBe(false);
    // previsão e realidade da mesma ordem de grandeza
    const f = exhibitionForecast(sim.state, { artistId: 'tinta', startDay: d + 1, days: 7, entryPrice: 3 });
    expect(res.visitors).toBeGreaterThan(f.visitors * 0.5);
    expect(res.visitors).toBeLessThan(f.visitors * 1.6);
  });

  it('entrada gratuita traz mais visitantes', () => {
    const sim = withGallery();
    const d = dayOf(sim.state.time);
    const paid = exhibitionForecast(sim.state, { artistId: 'lume', startDay: d + 1, days: 7, entryPrice: 3 }).visitors;
    const free = exhibitionForecast(sim.state, { artistId: 'lume', startDay: d + 1, days: 7, entryPrice: 0 }).visitors;
    expect(free).toBeGreaterThan(paid);
  });

  it('propostas de exposição chegam e aceitar agenda a exposição; tudo sobrevive ao save/load', () => {
    const sim = withGallery(11);
    const p = exhibitionProposal(sim.state)!;
    expect(p).not.toBeNull();
    sim.state.inbox.push(p);
    expect(sim.acceptProposal(p.id).ok).toBe(true);
    expect(sim.state.exhibitions.length).toBe(1);
    const restored = new Simulation(deserialize(serialize(sim.state)));
    expect(restored.state.exhibitions[0].works.length).toBe(sim.state.exhibitions[0].works.length);
    void VISUAL_ARTISTS;
  });
});
