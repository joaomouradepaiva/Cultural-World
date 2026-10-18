// Temporadas culturais: temas, durações e objetivos.

import type { ArtistDef } from './artists';
import type { SegmentId } from './segments';

export type ThemeId = 'jazz' | 'theater' | 'cinema' | 'comedy' | 'emerging' | 'visual' | 'dance' | 'open';

export interface ThemeDef {
  id: ThemeId;
  name: string;
  icon: string;
  color: string;
  desc: string;
  /** segmentos que ganham fidelização extra com a consistência do ciclo */
  segments: SegmentId[];
  /** evento de palco compatível com o tema */
  matches: (a: ArtistDef, artistId: string) => boolean;
  /** inclui exposições da galeria */
  exhibitions: boolean;
  /** indisponível até existir o sistema correspondente */
  locked?: string;
}

export const THEMES: ThemeDef[] = [
  { id: 'jazz', name: 'Jazz Sessions', icon: '🎷', color: '#4361ee', desc: 'Jazz e música improvisada.', segments: ['music', 'creatives'], exhibitions: false,
    matches: (a) => a.discipline === 'music' && /jazz|funk|clássica/i.test(a.genre) },
  { id: 'theater', name: 'Teatro Contemporâneo', icon: '🎭', color: '#e63946', desc: 'Companhias e textos contemporâneos.', segments: ['theater', 'creatives'], exhibitions: false,
    matches: (a) => a.discipline === 'theater' },
  { id: 'comedy', name: 'Comedy Nights', icon: '🎤', color: '#ffbe0b', desc: 'Stand-up e improvisação.', segments: ['community', 'students'], exhibitions: false,
    matches: (a) => a.discipline === 'comedy' },
  { id: 'emerging', name: 'Música Emergente', icon: '🌱', color: '#3ccf91', desc: 'Cena local e bandas em início de carreira.', segments: ['students', 'music', 'community'], exhibitions: false,
    matches: (a, id) => a.discipline === 'music' && (id.startsWith('scene-') || a.minLevel <= 2) },
  { id: 'dance', name: 'Dança Contemporânea', icon: '💃', color: '#b5179e', desc: 'Dança contemporânea e urbana.', segments: ['theater', 'creatives', 'students'], exhibitions: false,
    matches: (a) => a.discipline === 'dance' },
  { id: 'visual', name: 'Artes Visuais', icon: '🖼️', color: '#e9c46a', desc: 'Exposições na galeria.', segments: ['creatives', 'tourists'], exhibitions: true,
    matches: () => false },
  { id: 'open', name: 'Temporada Geral', icon: '✨', color: '#90a4ae', desc: 'Programação variada, sem tema.', segments: ['community'], exhibitions: true,
    matches: (a) => a.discipline !== 'corporate' && a.discipline !== 'workshop' },
  { id: 'cinema', name: 'Cinema Independente', icon: '🎬', color: '#6c757d', desc: 'Sessões de cinema e documentário.', segments: ['creatives', 'students'], exhibitions: false,
    matches: () => false, locked: 'Requer o sistema de cinema (Fase D do pacote de expansão).' },
];

export const THEME_BY_ID = Object.fromEntries(THEMES.map((t) => [t.id, t])) as Record<ThemeId, ThemeDef>;

export const SEASON_DURATIONS = {
  week: { name: 'Semana', days: 7, objectives: { events: 2, occupancy: 0.65, satisfaction: 65 } },
  month: { name: 'Mês', days: 30, objectives: { events: 6, occupancy: 0.7, satisfaction: 68 } },
  quarter: { name: 'Trimestre', days: 90, objectives: { events: 15, occupancy: 0.72, satisfaction: 70 } },
  year: { name: 'Temporada anual', days: 360, objectives: { events: 50, occupancy: 0.75, satisfaction: 72 } },
} as const;

export const SEASON_LIMITS = {
  maxActive: 3,
  /** máximo de fidelização extra por evento do mesmo ciclo já realizado */
  consistencyPerEvent: 0.04,
  consistencyMax: 0.2,
  /** € de campanha por dia de temporada para chegar ao boost máximo */
  campaignPerDay: 80,
  campaignMax: 0.35,
  passAttendRate: 0.8,
  repPerObjective: 1.5,
};
