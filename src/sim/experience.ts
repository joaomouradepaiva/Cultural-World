// Experiência do público: componentes de satisfação, reclamações e sugestões.

import { artistOf } from '../content/artists';
import { BALANCE } from '../content/balance';
import { SEGMENTS, SEGMENT_IDS } from '../content/segments';
import { kitRig } from './equipment';
import { comfortCapacity, equipment, staffByRole, upgradeValue } from './state';
import { hourOf, monthOf } from './time';
import type { Booking, Complaint, ExperienceScores, GameState } from './types';

export type YearSeason = 'spring' | 'summer' | 'autumn' | 'winter';

export function yearSeason(t: number): YearSeason {
  const m = monthOf(t).month; // 0 = janeiro
  if (m >= 2 && m <= 4) return 'spring';
  if (m >= 5 && m <= 7) return 'summer';
  if (m >= 8 && m <= 10) return 'autumn';
  return 'winter';
}

export const YEAR_SEASON_LABEL: Record<YearSeason, string> = { spring: 'Primavera', summer: 'Verão', autumn: 'Outono', winter: 'Inverno' };

export function avgElasticity(shares: Booking['segments']): number {
  let e = 0, w = 0;
  for (const id of SEGMENT_IDS) { const sh = shares[id] ?? 0; e += sh * SEGMENTS[id].elasticity; w += sh; }
  return w ? e / w : 1.3;
}

export function experienceScores(s: GameState, b: Booking, quality: number): ExperienceScores {
  const a = artistOf(b);
  const att = b.attendees;
  const kr = kitRig(s, b.kits);
  const base = equipment(s, b.roomId);
  const eq = { sound: base.sound + kr.sound, light: base.light + kr.light, stage: base.stage + kr.stage };
  const value = b.kind === 'corporate' ? 100
    : Math.max(20, Math.min(100, 100 - 60 * (b.ticketPrice / Math.max(0.5, a.refPrice) - 1) * (avgElasticity(b.segments) / 1.3)));
  const attempts = b.stats.waitCount + b.stats.lostImpatient + b.stats.lostBar;
  const avgWait = b.stats.waitCount ? b.stats.waitTotal / b.stats.waitCount : 0;
  const service = attempts === 0 ? 85 : Math.max(0, Math.min(100, 100 - avgWait * 3 - ((b.stats.lostImpatient + b.stats.lostBar) / attempts) * 120));
  const cc = comfortCapacity(s);
  const crowd = att <= cc ? 100 : Math.max(0, 100 - ((att - cc) / cc) * BALANCE.crowdPenalty);
  // conforto cai com a sala degradada
  const cond = s.rooms[b.roomId].condition ?? 100;
  const comfort = Math.max(0, Math.min(100, 50 + 20 * upgradeValue(s, 'lobby', 'decor') + 20 * upgradeValue(s, b.roomId, 'access') - Math.max(0, 70 - cond) / 2));
  // som: PA básico ≈ 70; cada nível de som próprio vale ~8; equipamento alugado soa pior que o próprio
  let sound = 85;
  if (a.discipline === 'music' || a.discipline === 'comedy') {
    const diff = eq.sound - a.rider.sound;
    sound = diff < 0 ? 66 + a.rider.sound * 6 : Math.min(100, 70 + eq.sound * 8 + (diff > 0 ? 4 : 0));
  } else if (a.discipline === 'theater' || a.discipline === 'dance') sound = Math.min(100, 74 + eq.sound * 6);
  let visibility = 100;
  if (att > 70 && eq.stage === 0) visibility = 72;
  else if (att > 110 && eq.stage < 2) visibility = 82;
  else if (att > 40 && eq.stage === 0) visibility = 90;
  let temperature = 100;
  const ys = yearSeason(b.startAt);
  if ((ys === 'summer' || ys === 'winter') && upgradeValue(s, b.roomId, 'climate') === 0 && att > 40) temperature = Math.max(40, 100 - (att - 40) * 0.6);
  let safety = 100;
  const guards = staffByRole(s, 'security').length;
  if (att > 80 && guards === 0) safety = 75;
  else if (att > 150 && guards < 2) safety = 85;
  return {
    quality: Math.round(quality), value: Math.round(value), service: Math.round(service), cleanliness: Math.round(b.stats.cleanliness),
    crowd: Math.round(crowd), comfort: Math.round(comfort), sound: Math.round(sound), visibility, temperature: Math.round(temperature), safety,
  };
}

export function satisfactionOf(sc: ExperienceScores): number {
  const w = BALANCE.satWeights;
  return (Object.keys(w) as (keyof ExperienceScores)[]).reduce((t, k) => t + sc[k] * w[k], 0);
}

const TEXTS: Record<keyof ExperienceScores, [string, string]> = {
  quality: ['O espetáculo não convenceu.', 'Aposta em artistas mais fortes, melhor equipamento ou técnicos.'],
  value: ['O bilhete estava caro para o que foi.', 'Baixa o preço ou programa artistas mais fortes.'],
  service: ['Esperei demasiado na fila.', 'Contrata bilheteiros/empregados de bar ou amplia o balcão.'],
  cleanliness: ['A sala estava suja.', 'Limpa entre eventos ou contrata limpeza.'],
  crowd: ['Filas enormes para a casa de banho.', 'Constrói ou amplia as instalações sanitárias.'],
  comfort: ['Pouco conforto à espera no átrio.', 'Melhora a decoração e as acessibilidades.'],
  sound: ['O som não estava à altura.', 'Melhora o sistema de som da sala (e evita alugar).'],
  visibility: ['Não se via bem o palco lá de trás.', 'Melhora o palco antes de aumentar a plateia.'],
  temperature: ['Estava insuportável de temperatura na sala.', 'Instala climatização na sala.'],
  safety: ['Pareceu desorganizado à saída, muita gente sem controlo.', 'Contrata segurança para eventos com mais de 80 pessoas.'],
};

/** Reclamações a partir dos piores componentes e da sensibilidade de cada segmento. */
export function complaintsFor(b: Booking, sc: ExperienceScores): Complaint[] {
  const out: Complaint[] = [];
  const weightFor = (key: string) => SEGMENT_IDS.reduce((t, id) => t + (b.segments[id] ?? 0) * (SEGMENTS[id].sensitive.includes(key as never) ? 1.6 : 1), 0);
  for (const k of Object.keys(TEXTS) as (keyof ExperienceScores)[]) {
    const v = sc[k];
    if (v >= 70) continue;
    const share = Math.min(90, Math.round((100 - v) * 0.6 * weightFor(k === 'value' ? 'price' : k)));
    out.push({ key: k, text: TEXTS[k][0], suggestion: TEXTS[k][1], share });
  }
  const fam = b.segments.families ?? 0, stu = b.segments.students ?? 0;
  if (fam >= 0.12 && hourOf(b.startAt) >= 21) out.push({ key: 'late', text: 'Horário tardio para quem vem com crianças.', suggestion: 'Programa sessões entre as 15:00 e as 18:00 para famílias.', share: Math.round(fam * 100) });
  const a = artistOf(b);
  if (stu >= 0.15 && b.ticketPrice > a.refPrice * 1.15) out.push({ key: 'price_seg', text: 'Preço difícil para estudantes.', suggestion: 'Baixa o preço ou cria um passe de temporada.', share: Math.round(stu * 100) });
  return out.sort((x, y) => y.share - x.share).slice(0, 4);
}
