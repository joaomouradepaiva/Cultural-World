// Catálogo de artistas e espetáculos. Todos os nomes são fictícios.

import type { Discipline } from '../sim/types';

export interface Rider { sound: number; light: number; stage: number }

export interface ArtistDef {
  id: string;
  name: string;
  discipline: Discipline;
  genre: string;
  members: number;
  /** público base esperado num espaço com reputação média, ao preço de referência */
  draw: number;
  refPrice: number;
  cachet: number;
  /** qualidade artística 0-100 */
  skill: number;
  rider: Rider;
  minLevel: number;
  minRep: number;
  duration: number;
  /** multiplicador de consumo no bar do público deste artista */
  barFactor: number;
  colors: [string, string];
  /** % de bilheteira pedida em partilha */
  splitShare: number;
  bio: string;
}

const A = (a: ArtistDef) => a;

export const ARTISTS: ArtistDef[] = [
  A({ id: 'ventiladores', name: 'Os Ventiladores', discipline: 'music', genre: 'Indie rock', members: 4, draw: 30, refPrice: 8, cachet: 80, skill: 55,
    rider: { sound: 0, light: 0, stage: 0 }, minLevel: 1, minRep: 0, duration: 75, barFactor: 1.2, colors: ['#ff5d73', '#ffc145'], splitShare: 0.65,
    bio: 'Banda de garagem do bairro. Energia não falta.' }),
  A({ id: 'luna', name: 'Luna Fado Trio', discipline: 'music', genre: 'Fado', members: 3, draw: 26, refPrice: 10, cachet: 90, skill: 66,
    rider: { sound: 0, light: 0, stage: 0 }, minLevel: 1, minRep: 0, duration: 80, barFactor: 1.0, colors: ['#7b6cff', '#c7b8ff'], splitShare: 0.65,
    bio: 'Guitarra portuguesa, viola e uma voz que arrepia.' }),
  A({ id: 'rui', name: 'Rui Riso', discipline: 'comedy', genre: 'Stand-up', members: 1, draw: 34, refPrice: 8, cachet: 100, skill: 58,
    rider: { sound: 0, light: 0, stage: 0 }, minLevel: 1, minRep: 0, duration: 60, barFactor: 1.15, colors: ['#ffd23f', '#ff8c42'], splitShare: 0.65,
    bio: 'Observações sobre a vida no bairro. Público fiel.' }),
  A({ id: 'pixel', name: 'DJ Pixel', discipline: 'music', genre: 'Eletrónica', members: 1, draw: 42, refPrice: 7, cachet: 130, skill: 50,
    rider: { sound: 1, light: 1, stage: 0 }, minLevel: 1, minRep: 5, duration: 120, barFactor: 1.45, colors: ['#00e5ff', '#ff00d4'], splitShare: 0.65,
    bio: 'Sets longos e muito movimento no bar.' }),
  A({ id: 'improviso', name: 'Noite de Improviso', discipline: 'comedy', genre: 'Improvisação', members: 4, draw: 50, refPrice: 8, cachet: 180, skill: 62,
    rider: { sound: 0, light: 1, stage: 0 }, minLevel: 2, minRep: 12, duration: 75, barFactor: 1.1, colors: ['#ff9f1c', '#2ec4b6'], splitShare: 0.7,
    bio: 'Coletivo de improvisação. Nunca há dois espetáculos iguais.' }),
  A({ id: 'mare', name: 'Maré Alta', discipline: 'music', genre: 'Folk', members: 4, draw: 46, refPrice: 9, cachet: 150, skill: 63,
    rider: { sound: 1, light: 0, stage: 0 }, minLevel: 2, minRep: 14, duration: 80, barFactor: 1.15, colors: ['#3ddc97', '#f4d35e'], splitShare: 0.7,
    bio: 'Folk com bombos e acordeão.' }),
  A({ id: 'armazem', name: 'Teatro do Armazém', discipline: 'theater', genre: 'Teatro independente', members: 4, draw: 34, refPrice: 9, cachet: 150, skill: 64,
    rider: { sound: 0, light: 1, stage: 1 }, minLevel: 2, minRep: 10, duration: 100, barFactor: 0.9, colors: ['#e63946', '#f1faee'], splitShare: 0.65,
    bio: 'Companhia residente informal. Textos contemporâneos.' }),
  A({ id: 'jazz', name: 'Quarteto Lisboa Jazz', discipline: 'music', genre: 'Jazz', members: 4, draw: 52, refPrice: 12, cachet: 220, skill: 76,
    rider: { sound: 1, light: 1, stage: 0 }, minLevel: 2, minRep: 18, duration: 90, barFactor: 1.2, colors: ['#4361ee', '#f72585'], splitShare: 0.7,
    bio: 'Standards e originais. Público que gosta de vinho.' }),
  A({ id: 'coro', name: 'Coro Polifónico da Cidade', discipline: 'music', genre: 'Coral', members: 5, draw: 60, refPrice: 7, cachet: 140, skill: 70,
    rider: { sound: 0, light: 1, stage: 1 }, minLevel: 3, minRep: 15, duration: 70, barFactor: 0.7, colors: ['#90e0ef', '#ffffff'], splitShare: 0.6,
    bio: 'Associação com 40 anos. Traz famílias inteiras.' }),
  A({ id: 'gargalhada', name: 'Joana Gargalhada', discipline: 'comedy', genre: 'Stand-up', members: 1, draw: 72, refPrice: 10, cachet: 280, skill: 70,
    rider: { sound: 1, light: 0, stage: 0 }, minLevel: 3, minRep: 22, duration: 70, barFactor: 1.2, colors: ['#ff70a6', '#ffd670'], splitShare: 0.7,
    bio: 'Viral nas redes. Esgota salas pequenas.' }),
  A({ id: 'corpo', name: 'Coletivo Corpo', discipline: 'dance', genre: 'Dança contemporânea', members: 4, draw: 42, refPrice: 10, cachet: 220, skill: 74,
    rider: { sound: 1, light: 2, stage: 1 }, minLevel: 3, minRep: 20, duration: 70, barFactor: 0.9, colors: ['#b5179e', '#4cc9f0'], splitShare: 0.65,
    bio: 'Corpo, luz e silêncio.' }),
  A({ id: 'rimas', name: 'Rimas de Bairro', discipline: 'music', genre: 'Hip-hop', members: 2, draw: 85, refPrice: 10, cachet: 320, skill: 64,
    rider: { sound: 2, light: 1, stage: 0 }, minLevel: 3, minRep: 25, duration: 75, barFactor: 1.35, colors: ['#ffbe0b', '#3a86ff'], splitShare: 0.75,
    bio: 'Dupla que cresceu nas jams do bairro.' }),
  A({ id: 'ventosul', name: 'Companhia Vento Sul', discipline: 'theater', genre: 'Teatro', members: 5, draw: 72, refPrice: 12, cachet: 420, skill: 77,
    rider: { sound: 1, light: 2, stage: 1 }, minLevel: 4, minRep: 30, duration: 110, barFactor: 0.95, colors: ['#ff6b35', '#004e89'], splitShare: 0.7,
    bio: 'Companhia em digressão nacional.' }),
  A({ id: 'anasol', name: 'Ana Sol', discipline: 'music', genre: 'Pop', members: 4, draw: 125, refPrice: 14, cachet: 650, skill: 72,
    rider: { sound: 2, light: 2, stage: 0 }, minLevel: 5, minRep: 35, duration: 85, barFactor: 1.25, colors: ['#ffd60a', '#ff006e'], splitShare: 0.78,
    bio: 'Primeiro álbum nas tabelas. Público jovem.' }),
  A({ id: 'urban', name: 'Urban Moves Crew', discipline: 'dance', genre: 'Dança urbana', members: 5, draw: 92, refPrice: 12, cachet: 520, skill: 72,
    rider: { sound: 2, light: 2, stage: 1 }, minLevel: 5, minRep: 32, duration: 70, barFactor: 1.2, colors: ['#06d6a0', '#ef476f'], splitShare: 0.72,
    bio: 'Campeões nacionais de breaking.' }),
  A({ id: 'owls', name: 'The Night Owls', discipline: 'music', genre: 'Rock', members: 4, draw: 155, refPrice: 15, cachet: 950, skill: 74,
    rider: { sound: 2, light: 2, stage: 1 }, minLevel: 6, minRep: 45, duration: 90, barFactor: 1.4, colors: ['#ff4d6d', '#c9184a'], splitShare: 0.8,
    bio: 'Rock clássico com um público que bebe bem.' }),
  A({ id: 'piada', name: 'Pedro Piada', discipline: 'comedy', genre: 'Stand-up', members: 1, draw: 165, refPrice: 16, cachet: 1050, skill: 78,
    rider: { sound: 1, light: 1, stage: 0 }, minLevel: 6, minRep: 45, duration: 80, barFactor: 1.2, colors: ['#fca311', '#14213d'], splitShare: 0.8,
    bio: 'Especial na televisão no ano passado.' }),
  A({ id: 'aurora', name: 'Orquestra de Câmara Aurora', discipline: 'music', genre: 'Clássica', members: 5, draw: 140, refPrice: 18, cachet: 1400, skill: 86,
    rider: { sound: 2, light: 1, stage: 1 }, minLevel: 7, minRep: 55, duration: 90, barFactor: 0.85, colors: ['#e9c46a', '#264653'], splitShare: 0.75,
    bio: 'Repertório barroco e contemporâneo.' }),
  A({ id: 'tnd', name: 'Teatro Nacional em Digressão', discipline: 'theater', genre: 'Teatro', members: 5, draw: 165, refPrice: 20, cachet: 1800, skill: 88,
    rider: { sound: 2, light: 3, stage: 2 }, minLevel: 8, minRep: 60, duration: 120, barFactor: 0.9, colors: ['#9d0208', '#ffba08'], splitShare: 0.75,
    bio: 'Grande produção, grande exigência técnica.' }),
  A({ id: 'kiko', name: 'Kiko & Os Satélites', discipline: 'music', genre: 'Funk', members: 5, draw: 210, refPrice: 18, cachet: 1900, skill: 80,
    rider: { sound: 3, light: 3, stage: 1 }, minLevel: 9, minRep: 65, duration: 95, barFactor: 1.35, colors: ['#ff9e00', '#7209b7'], splitShare: 0.8,
    bio: 'Metais, groove e uma pista sempre cheia.' }),
  A({ id: 'madalena', name: 'Madalena Reis', discipline: 'music', genre: 'Canção', members: 4, draw: 320, refPrice: 25, cachet: 3600, skill: 90,
    rider: { sound: 3, light: 3, stage: 2 }, minLevel: 11, minRep: 75, duration: 100, barFactor: 1.1, colors: ['#f8f9fa', '#ff477e'], splitShare: 0.85,
    bio: 'A voz mais pedida do país.' }),
];

export const ARTIST_BY_ID: Record<string, ArtistDef> = Object.fromEntries(ARTISTS.map((a) => [a.id, a]));

export const DISCIPLINE_LABEL: Record<Discipline, string> = {
  music: 'Música',
  theater: 'Teatro',
  comedy: 'Stand-up',
  dance: 'Dança',
  corporate: 'Empresa',
  workshop: 'Formação',
};

/** Ficha do evento: catálogo ou ficha própria (empresas, formações). */
export function artistOf(b: { artistId: string; custom?: ArtistDef | null }): ArtistDef {
  return b.custom ?? ARTIST_BY_ID[b.artistId];
}

export const DISCIPLINE_ICON: Record<Discipline, string> = {
  music: '♪',
  theater: '🎭',
  comedy: '🎤',
  dance: '💃',
  corporate: '💼',
  workshop: '🎓',
};
