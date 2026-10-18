// Cena local: artistas emergentes gerados todas as semanas. Garante que há sempre quem programar,
// em qualquer nível, e dá ao jogador artistas para "descobrir" e fazer crescer.

import { ARTISTS, registerArtists, type ArtistDef } from '../content/artists';
import { BALANCE } from '../content/balance';
import { log, type Ctx } from './core';
import { pick, rand, randInt } from './rng';
import type { Discipline, GameState } from './types';

const BAND_A = ['Banda', 'Coletivo', 'Clube', 'Projeto', 'Orquestra de Garagem'];
const BAND_B = ['Faróis', 'Gaivotas', 'Elétricos', 'Calçadas', 'Persianas', 'Telhados', 'Marés Vivas', 'Sardinhas Voadoras', 'Néons', 'Varandas', 'Trovões', 'Postais', 'Bicicletas', 'Lagartixas', 'Azulejos'];
const SOLO = ['Rita', 'Duarte', 'Lara', 'Gil', 'Mafalda', 'Simão', 'Carolina', 'Vasco', 'Matilde', 'Rodrigo', 'Íris', 'Bernardo'];
const SURN = ['Lua', 'Neves', 'Rocha', 'Prata', 'Brisa', 'Seixas', 'Valente', 'Cardoso', 'Pimenta', 'Fonseca'];
const GENRES: { discipline: Discipline; genre: string; members: [number, number]; duration: number; bar: number; colors: [string, string] }[] = [
  { discipline: 'music', genre: 'Indie pop', members: [3, 4], duration: 70, bar: 1.2, colors: ['#ff8fab', '#ffe5ec'] },
  { discipline: 'music', genre: 'Punk', members: [3, 4], duration: 50, bar: 1.4, colors: ['#e5383b', '#161a1d'] },
  { discipline: 'music', genre: 'Cantautor', members: [1, 1], duration: 60, bar: 1.0, colors: ['#f4a261', '#264653'] },
  { discipline: 'music', genre: 'Jazz de bairro', members: [3, 4], duration: 80, bar: 1.15, colors: ['#4361ee', '#fca311'] },
  { discipline: 'music', genre: 'Eletrónica', members: [1, 2], duration: 90, bar: 1.4, colors: ['#00f5d4', '#9b5de5'] },
  { discipline: 'comedy', genre: 'Stand-up', members: [1, 1], duration: 50, bar: 1.15, colors: ['#ffd166', '#ef476f'] },
  { discipline: 'theater', genre: 'Teatro amador', members: [3, 5], duration: 80, bar: 0.9, colors: ['#8338ec', '#ffbe0b'] },
  { discipline: 'dance', genre: 'Dança urbana', members: [3, 5], duration: 50, bar: 1.1, colors: ['#06d6a0', '#118ab2'] },
];

export function generateSceneArtist(s: GameState, week: number, i: number): ArtistDef {
  const g = pick(s, GENRES);
  const members = randInt(s, g.members[0], g.members[1]);
  const name = members === 1 ? `${pick(s, SOLO)} ${pick(s, SURN)}` : `${pick(s, BAND_A)} ${pick(s, BAND_B)}`;
  // a cena acompanha um pouco o crescimento do espaço, mas fica sempre abaixo do catálogo profissional
  const scale = 1 + Math.min(1.5, s.level * 0.08);
  const draw = Math.round(rand(s, 16, 30) * scale);
  const refPrice = Math.round(rand(s, 5, 8));
  return {
    id: `scene-${week}-${i}`, name, discipline: g.discipline, genre: `${g.genre} · cena local`, members, draw, refPrice,
    cachet: Math.round(draw * rand(s, 1.6, 2.4)), skill: Math.round(rand(s, 42, 66)), rider: { sound: 0, light: 0, stage: 0 },
    minLevel: 1, minRep: 0, duration: g.duration, barFactor: g.bar, colors: g.colors, splitShare: 0.6,
    bio: pick(s, ['Primeiros concertos, muita vontade.', 'Revelação das noites abertas do bairro.', 'Ainda sem disco, já com público fiel.', 'Ganharam um concurso de bandas na escola.']),
  };
}

/** Todas as segundas (e no início do jogo) chegam novos artistas da cena local. */
export function refreshScene(ctx: Ctx, week: number): void {
  const s = ctx.state;
  const fresh: ArtistDef[] = [];
  for (let i = 0; i < BALANCE.sceneArtistsPerWeek; i++) fresh.push(generateSceneArtist(s, week, i));
  s.scene.push(...fresh);
  for (const a of fresh) s.artists[a.id] = { draw: a.draw, relationship: 0, shows: 0, lastShowAt: null, history: [] };
  // ficam na cena os desta semana + os que já atuaram cá ou têm data marcada
  const keep = new Set(fresh.map((a) => a.id));
  for (const b of s.bookings) keep.add(b.artistId);
  for (const a of s.scene) if (s.artists[a.id]?.shows > 0) keep.add(a.id);
  s.sceneActive = s.scene.filter((a) => keep.has(a.id)).map((a) => a.id);
  registerArtists(fresh);
  if (week > 0) log(ctx, `🎸 Cena local: ${fresh.map((a) => a.name).join(', ')} procuram palco.`, 'info');
}

/** Artistas que o jogador pode ver na programação: catálogo + cena local ativa. */
export function availableArtists(s: GameState): ArtistDef[] {
  const active = new Set(s.sceneActive);
  return [...s.scene.filter((a) => active.has(a.id)), ...ARTISTS];
}

export function isSceneArtist(id: string): boolean {
  return id.startsWith('scene-');
}
