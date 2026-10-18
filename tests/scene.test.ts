import { ARTISTS } from '../src/content/artists';
import { BALANCE } from '../src/content/balance';
import { validateBooking } from '../src/sim/bookings';
import { deserialize, serialize } from '../src/sim/save';
import { availableArtists, isSceneArtist } from '../src/sim/scene';
import { Simulation } from '../src/sim/sim';
import { at, MIN_PER_DAY } from '../src/sim/time';
import { newSim } from './helpers';

describe('há sempre o que programar', () => {
  it('no nível 1 dá para programar quase todas as noites das próximas 2 semanas', () => {
    const sim = newSim(1);
    sim.state.money = 99999;
    let booked = 0;
    for (let d = 1; d < 14; d++) {
      for (const a of availableArtists(sim.state)) {
        const req = { roomId: 'hall' as const, artistId: a.id, startAt: at(d, 21), ticketPrice: a.refPrice, contractType: 'split' as const, marketing: 'none' as const };
        if (!validateBooking(sim.state, req).length) { expect(sim.book(req).ok).toBe(true); booked++; break; }
      }
    }
    expect(booked).toBe(13);
  });

  it('o mesmo artista pode ter várias datas, com intervalo mínimo', () => {
    const sim = newSim(2);
    const r = (d: number) => sim.book({ roomId: 'hall', artistId: 'luna', startAt: at(d, 21), ticketPrice: 10, contractType: 'split', marketing: 'none' });
    expect(r(1).ok).toBe(true);
    const tooSoon = r(1 + BALANCE.artistCooldownDays - 1);
    expect(tooSoon.ok).toBe(false);
    if (!tooSoon.ok) expect(tooSoon.errors.join()).toContain('dias de distância');
    expect(r(1 + BALANCE.artistCooldownDays).ok).toBe(true);
  });

  it('repetir o artista pouco depois reduz a procura (mesmo antes da primeira data acontecer)', () => {
    const sim = newSim(3);
    const first = sim.book({ roomId: 'hall', artistId: 'luna', startAt: at(1, 21), ticketPrice: 10, contractType: 'split', marketing: 'none' });
    const second = sim.book({ roomId: 'hall', artistId: 'luna', startAt: at(8, 20), ticketPrice: 10, contractType: 'split', marketing: 'none' });
    if (!first.ok || !second.ok) throw new Error();
    expect(second.booking.demand).toBeLessThan(first.booking.demand);
  });
});

describe('cena local', () => {
  it('começa com artistas emergentes desbloqueados e renova à segunda-feira', () => {
    const sim = newSim(4);
    const scene0 = availableArtists(sim.state).filter((a) => isSceneArtist(a.id));
    expect(scene0.length).toBe(BALANCE.sceneArtistsPerWeek);
    expect(scene0.every((a) => a.minLevel === 1 && a.rider.sound === 0)).toBe(true);
    sim.runUntil(at(4, 10)); // dia 0 = sexta → dia 3 = segunda
    const scene1 = availableArtists(sim.state).filter((a) => isSceneArtist(a.id));
    expect(scene1.map((a) => a.id)).not.toEqual(scene0.map((a) => a.id));
    // o catálogo profissional continua lá
    expect(availableArtists(sim.state).length).toBe(scene1.length + ARTISTS.length);
  });

  it('artistas da cena local com data marcada ou já vistos ficam, e sobrevivem ao save/load', () => {
    const sim = newSim(5);
    const a = availableArtists(sim.state).find((x) => isSceneArtist(x.id))!;
    const r = sim.book({ roomId: 'hall', artistId: a.id, startAt: at(5, 21), ticketPrice: a.refPrice, contractType: 'split', marketing: 'none' });
    expect(r.ok).toBe(true);
    sim.runUntil(at(4, 10));
    expect(sim.state.sceneActive).toContain(a.id);
    const restored = new Simulation(deserialize(serialize(sim.state)));
    expect(availableArtists(restored.state).some((x) => x.id === a.id)).toBe(true);
    restored.runUntil(at(5, 21) + 4 * 60);
    expect(restored.state.bookings[0].status).toBe('settled');
    expect(restored.state.artists[a.id].shows).toBe(1);
    void MIN_PER_DAY;
  });
});
