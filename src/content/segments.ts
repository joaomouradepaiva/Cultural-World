// Segmentos de público. Todos os efeitos são multiplicadores perto de 1 aplicados sobre o modelo de procura base,
// para que a média de um público misto se mantenha calibrada.

import type { ArtistDef } from './artists';
import type { Discipline } from '../sim/types';

export type SegmentId = 'students' | 'families' | 'tourists' | 'music' | 'theater' | 'creatives' | 'corporate' | 'community';

export type Accessory = 'backpack' | 'child' | 'camera' | 'bandtee' | 'scarf' | 'beret' | 'tie' | 'none';

export interface SegmentDef {
  id: SegmentId;
  name: string;
  icon: string;
  /** elasticidade ao preço (1,3 = média do jogo) */
  elasticity: number;
  /** modificador por hora de início (multiplica o fator horário global) */
  hour: (h: number) => number;
  /** modificador por dia da semana (0 = segunda) */
  day: (wd: number) => number;
  /** probabilidade relativa de ir ao bar */
  bar: number;
  /** interesse em workshops (afeta inscrições propostas) */
  workshop: number;
  /** velocidade com que ganham fidelização */
  loyaltyRate: number;
  accessory: Accessory;
  shirts: string[];
  /** o que mais os incomoda (para reclamações) */
  sensitive: ('price' | 'late' | 'comfort' | 'service' | 'quality' | 'sound')[];
}

const weekend = (wd: number) => wd >= 4;

export const SEGMENTS: Record<SegmentId, SegmentDef> = {
  students: { id: 'students', name: 'Estudantes', icon: '🎒', elasticity: 2.1, hour: (h) => (h >= 21 ? 1.25 : h < 17 ? 0.8 : 1), day: (wd) => (wd === 3 ? 1.2 : wd === 6 ? 0.8 : 1), bar: 1.15, workshop: 0.7, loyaltyRate: 0.9, accessory: 'backpack', shirts: ['#3ccf91', '#4f86f7', '#f7b733'], sensitive: ['price'] },
  families: { id: 'families', name: 'Famílias', icon: '👨‍👩‍👧', elasticity: 1.6, hour: (h) => (h >= 15 && h <= 18 ? 1.6 : h >= 21 ? 0.4 : h >= 19 ? 0.8 : 1.1), day: (wd) => (weekend(wd) ? 1.4 : 0.75), bar: 0.75, workshop: 0.4, loyaltyRate: 1.1, accessory: 'child', shirts: ['#8ecae6', '#ffb4a2', '#ffffff'], sensitive: ['late', 'comfort', 'price'] },
  tourists: { id: 'tourists', name: 'Turistas', icon: '📷', elasticity: 0.7, hour: (h) => (h < 20 ? 1.2 : 0.9), day: (wd) => (weekend(wd) ? 1.3 : 0.9), bar: 1.2, workshop: 0.1, loyaltyRate: 0.3, accessory: 'camera', shirts: ['#ff8c42', '#e9c46a', '#ffffff'], sensitive: ['quality', 'service'] },
  music: { id: 'music', name: 'Público de música', icon: '🎸', elasticity: 1.2, hour: (h) => (h >= 21 ? 1.15 : h < 18 ? 0.7 : 1), day: () => 1, bar: 1.25, workshop: 0.2, loyaltyRate: 1.2, accessory: 'bandtee', shirts: ['#30343f', '#d62828', '#30343f'], sensitive: ['sound', 'quality'] },
  theater: { id: 'theater', name: 'Público de teatro', icon: '🎭', elasticity: 1.1, hour: (h) => (h >= 19 && h <= 21 ? 1.15 : h >= 22 ? 0.7 : 0.9), day: (wd) => (wd <= 3 ? 1.05 : 1), bar: 0.85, workshop: 0.3, loyaltyRate: 1.3, accessory: 'scarf', shirts: ['#9b5de5', '#7a5c61', '#264653'], sensitive: ['comfort', 'quality'] },
  creatives: { id: 'creatives', name: 'Profissionais criativos', icon: '🎨', elasticity: 1.2, hour: (h) => (h >= 18 ? 1.1 : 0.9), day: (wd) => (wd <= 4 ? 1.05 : 0.95), bar: 1.05, workshop: 1.0, loyaltyRate: 1.0, accessory: 'beret', shirts: ['#f15bb5', '#2ec4b6', '#ffd166'], sensitive: ['quality', 'service'] },
  corporate: { id: 'corporate', name: 'Público corporativo', icon: '💼', elasticity: 0.5, hour: (h) => (h >= 18 && h <= 20 ? 1.3 : h >= 22 ? 0.6 : 1), day: (wd) => (wd <= 3 ? 1.2 : 0.6), bar: 1.3, workshop: 0.2, loyaltyRate: 0.5, accessory: 'tie', shirts: ['#1d3557', '#457b9d', '#e5e5e5'], sensitive: ['service', 'comfort'] },
  community: { id: 'community', name: 'Comunidade local', icon: '🏘️', elasticity: 1.5, hour: (h) => (h >= 18 && h <= 21 ? 1.1 : 0.95), day: () => 1, bar: 0.95, workshop: 0.5, loyaltyRate: 1.2, accessory: 'none', shirts: ['#ff8fab', '#90be6d', '#adb5bd'], sensitive: ['price', 'comfort'] },
};

export const SEGMENT_IDS = Object.keys(SEGMENTS) as SegmentId[];

const BY_DISCIPLINE: Record<Discipline, Partial<Record<SegmentId, number>>> = {
  music: { music: 0.36, students: 0.18, community: 0.15, creatives: 0.12, tourists: 0.08, families: 0.04, theater: 0.04, corporate: 0.03 },
  theater: { theater: 0.4, community: 0.15, creatives: 0.14, students: 0.12, families: 0.08, tourists: 0.06, corporate: 0.03, music: 0.02 },
  comedy: { community: 0.28, students: 0.24, corporate: 0.12, theater: 0.1, creatives: 0.1, tourists: 0.08, music: 0.06, families: 0.02 },
  dance: { theater: 0.25, creatives: 0.2, students: 0.18, community: 0.15, families: 0.1, tourists: 0.08, music: 0.04 },
  corporate: { corporate: 1 },
  workshop: { creatives: 0.45, students: 0.3, community: 0.2, families: 0.05 },
};

/** Ajustes por género (palavras-chave no campo genre). */
const GENRE_TWEAKS: [RegExp, Partial<Record<SegmentId, number>>][] = [
  [/fado|coral|clássica/i, { tourists: 0.18, families: 0.08, students: -0.1 }],
  [/jazz/i, { creatives: 0.1, corporate: 0.06, students: -0.06 }],
  [/eletr|hip-hop|punk|dj/i, { students: 0.15, families: -0.04 }],
  [/cena local|amador/i, { community: 0.15, students: 0.08, tourists: -0.05 }],
  [/infant|famil/i, { families: 0.4 }],
];

/** Mistura de público de um artista (soma 1). */
export function audienceMix(a: ArtistDef): Record<SegmentId, number> {
  const out = {} as Record<SegmentId, number>;
  for (const id of SEGMENT_IDS) out[id] = BY_DISCIPLINE[a.discipline][id] ?? 0;
  for (const [re, tw] of GENRE_TWEAKS) if (re.test(a.genre)) for (const [k, v] of Object.entries(tw)) out[k as SegmentId] = Math.max(0, out[k as SegmentId] + (v ?? 0));
  const sum = SEGMENT_IDS.reduce((t, id) => t + out[id], 0) || 1;
  for (const id of SEGMENT_IDS) out[id] /= sum;
  return out;
}
