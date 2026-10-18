// Planta do edifício (antigo armazém) e pontos de interesse.
// Coordenadas em tiles. x cresce para a direita-baixo, y para a esquerda-baixo (projeção isométrica).

import type { RoomId } from '../sim/types';

export const MAP_W = 41;
/** Primeira coluna da ala da galeria (anexo com entrada própria). */
export const GALLERY_X0 = 31;
export const MAP_H = 24;

export enum T {
  Void = 0,
  Floor = 1,
  BackWall = 2,
  InnerWall = 3,
  FrontWall = 4,
  Door = 5,
  Sidewalk = 6,
  Road = 7,
  Blocked = 8,
}

export interface Rect { x0: number; y0: number; x1: number; y1: number }

/** Retângulos interiores (inclusivos) de cada sala. */
export const ROOM_RECTS: Record<RoomId, Rect> = {
  hall: { x0: 1, y0: 1, x1: 14, y1: 10 },
  blackbox: { x0: 16, y0: 1, x1: 29, y1: 10 },
  lobby: { x0: 1, y0: 12, x1: 14, y1: 18 },
  bar: { x0: 16, y0: 12, x1: 22, y1: 18 },
  wc: { x0: 24, y0: 12, x1: 29, y1: 14 },
  rehearsal: { x0: 24, y0: 16, x1: 29, y1: 18 },
  gallery: { x0: 31, y0: 6, x1: 39, y1: 18 },
};

export interface DoorDef { x: number; y: number; room: RoomId | null }

export const DOORS: DoorDef[] = [
  { x: 6, y: 19, room: null },
  { x: 7, y: 19, room: null },
  { x: 7, y: 11, room: 'hall' },
  { x: 8, y: 11, room: 'hall' },
  { x: 19, y: 11, room: 'blackbox' },
  { x: 20, y: 11, room: 'blackbox' },
  { x: 15, y: 14, room: 'bar' },
  { x: 15, y: 15, room: 'bar' },
  { x: 15, y: 16, room: 'bar' },
  { x: 23, y: 13, room: 'wc' },
  { x: 23, y: 17, room: 'rehearsal' },
  { x: 34, y: 19, room: 'gallery' },
  { x: 35, y: 19, room: 'gallery' },
];

/** Tiles bloqueados por mobiliário fixo. */
export const STAGES: Partial<Record<RoomId, Rect>> = {
  hall: { x0: 2, y0: 1, x1: 13, y1: 3 },
  blackbox: { x0: 17, y0: 1, x1: 28, y1: 2 },
};

export const FIXED_BLOCKS: { x: number; y: number }[] = [
  // régie sala principal
  { x: 12, y: 10 }, { x: 13, y: 10 },
  // régie black box
  { x: 28, y: 10 },
  // bilheteira
  { x: 3, y: 13 }, { x: 3, y: 14 },
  // balcão do bar
  { x: 17, y: 13 }, { x: 18, y: 13 }, { x: 19, y: 13 }, { x: 20, y: 13 }, { x: 21, y: 13 },
];

/** Painéis expositivos (bloqueiam a passagem). */
export const GALLERY_PANELS: Rect[] = [
  { x0: 33, y0: 10, x1: 33, y1: 11 },
  { x0: 37, y0: 10, x1: 37, y1: 11 },
];
export const GALLERY_BLOCKS: { x: number; y: number }[] = GALLERY_PANELS.flatMap((r) => [{ x: r.x0, y: r.y0 }, { x: r.x0, y: r.y1 }]);

export type ArtworkMount = 'wall' | 'panel' | 'plinth';
export interface ArtworkSpot { mount: ArtworkMount; x: number; y: number; view: [number, number] }

/** Posições das obras, pela ordem em que são ocupadas (expositores 6 → 9 → 12). */
export const ARTWORK_SPOTS: ArtworkSpot[] = [
  { mount: 'wall', x: 32.2, y: 6, view: [32.4, 7.3] },
  { mount: 'wall', x: 34.4, y: 6, view: [34.6, 7.3] },
  { mount: 'wall', x: 36.6, y: 6, view: [36.8, 7.3] },
  { mount: 'wall', x: 38.8, y: 6, view: [38.9, 7.3] },
  { mount: 'panel', x: 34, y: 10.5, view: [35.0, 10.8] },
  { mount: 'panel', x: 38, y: 10.5, view: [39.0, 10.8] },
  { mount: 'plinth', x: 35.5, y: 15.0, view: [35.6, 16.1] },
  { mount: 'panel', x: 34, y: 11.6, view: [35.0, 11.9] },
  { mount: 'panel', x: 38, y: 11.6, view: [39.0, 11.9] },
  { mount: 'plinth', x: 32.5, y: 14.2, view: [32.7, 15.3] },
  { mount: 'plinth', x: 38.2, y: 15.4, view: [38.0, 16.5] },
  { mount: 'plinth', x: 36.0, y: 8.7, view: [36.2, 9.8] },
];

export const GALLERY_ENTRANCE: [number, number] = [34.9, 18.2];

export function inRect(r: Rect, x: number, y: number): boolean {
  return x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;
}

export function roomAt(x: number, y: number): RoomId | null {
  const tx = Math.floor(x), ty = Math.floor(y);
  for (const id of Object.keys(ROOM_RECTS) as RoomId[]) {
    if (inRect(ROOM_RECTS[id], tx, ty)) return id;
  }
  return null;
}

/** Tipo base do tile (sem considerar salas por construir). */
export function baseTile(x: number, y: number): T {
  if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return T.Void;
  if (y >= 22) return T.Road;
  if (y >= 20) return T.Sidewalk;
  for (const d of DOORS) if (d.x === x && d.y === y) return T.Door;
  if (x >= GALLERY_X0) {
    if (y < 5) return T.Void;
    if (y === 5) return T.BackWall;
    if (x === MAP_W - 1 || y === 19) return T.FrontWall;
    for (const b of GALLERY_BLOCKS) if (b.x === x && b.y === y) return T.Blocked;
    return T.Floor;
  }
  if (y === 0 || x === 0) return T.BackWall;
  if (y === 19 || x === 30) return T.FrontWall;
  if (x === 15 || y === 11) return T.InnerWall;
  if (x === 23 && y >= 12) return T.InnerWall;
  if (y === 15 && x >= 24) return T.InnerWall;
  for (const s of Object.values(STAGES)) if (s && inRect(s, x, y)) return T.Blocked;
  for (const b of FIXED_BLOCKS) if (b.x === x && b.y === y) return T.Blocked;
  return T.Floor;
}

export function isWall(t: T): boolean {
  return t === T.BackWall || t === T.InnerWall || t === T.FrontWall;
}

type P = [number, number];

function snake(rows: number[], xFrom: number, xTo: number, step: number): P[] {
  const pts: P[] = [];
  rows.forEach((y, i) => {
    const forward = i % 2 === 0;
    const n = Math.floor(Math.abs(xTo - xFrom) / step) + 1;
    for (let k = 0; k < n; k++) {
      const t = forward ? k : n - 1 - k;
      const x = xFrom + Math.sign(xTo - xFrom) * t * step;
      pts.push([x, y]);
    }
  });
  return pts;
}

function seatGrid(x0: number, cols: number, y0: number, rows: number, step: number): P[] {
  const pts: P[] = [];
  const mid = (cols - 1) / 2;
  for (let r = 0; r < rows; r++) {
    const order = Array.from({ length: cols }, (_, c) => c).sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid));
    for (const c of order) pts.push([x0 + c * step, y0 + r * step]);
  }
  return pts;
}

export const SPOTS = {
  entranceInside: [6.9, 18.3] as P,
  entranceOutside: [6.9, 20.4] as P,
  street: { y0: 20.25, y1: 21.6, x0: 0.3, x1: 40.5 },

  boxOfficeServers: [[2.5, 13.5], [2.5, 14.5]] as P[],
  boxOfficeCustomer: [[4.3, 13.5], [4.3, 14.5]] as P[],
  boxOfficeQueue: snake([14.0, 14.8, 15.6], 5.3, 13.5, 0.75),

  barServers: [[18.5, 12.45], [19.5, 12.45], [20.5, 12.45]] as P[],
  barCustomer: [[18.5, 14.35], [19.5, 14.35], [20.5, 14.35]] as P[],
  barQueue: snake([15.15, 15.8], 19.5, 22.2, 0.55).concat(snake([16.45], 22.2, 16.6, 0.6)),
  barTables: [[17.4, 17.0], [19.8, 17.0], [17.4, 18.3], [19.8, 18.3], [22.0, 17.0], [22.0, 18.3]] as P[],

  lobbyLounge: [[11.2, 17.6], [11.9, 17.6], [12.6, 17.6], [13.3, 17.6], [11.2, 16.6], [13.3, 16.6], [1.8, 16.3], [1.8, 17.2]] as P[],

  hall: {
    seats: seatGrid(2.3, 20, 5.0, 9, 0.6),
    stageEntry: [1.5, 4.4] as P,
    stageSpots: [[7.5, 1.6], [5.4, 2.4], [9.6, 2.4], [11.6, 2.0], [3.6, 2.0]] as P[],
    tech: [14.4, 10.4] as P,
    stageSetup: [[4.5, 4.3], [10.5, 4.3]] as P[],
    dressing: [[1.4, 1.4], [1.6, 2.0], [1.4, 2.6], [1.6, 3.1], [1.4, 3.6]] as P[],
  },
  blackbox: {
    seats: seatGrid(17.3, 20, 4.2, 8, 0.6),
    stageEntry: [16.5, 3.4] as P,
    stageSpots: [[22.5, 1.4], [20.4, 1.9], [24.6, 1.9], [26.6, 1.6], [18.6, 1.6]] as P[],
    tech: [29.4, 10.4] as P,
    stageSetup: [[19.5, 3.4], [25.5, 3.4]] as P[],
    dressing: [[16.4, 1.3], [16.6, 1.8], [16.4, 2.3], [16.6, 2.8], [16.4, 1.0]] as P[],
  },

  wcSpots: [[25.0, 12.9], [26.5, 12.9], [28.0, 12.9]] as P[],
  rehearsalSpots: [[25.3, 16.9], [27.2, 16.5], [28.7, 17.4]] as P[],
  staffIdle: [[1.6, 18.4], [13.6, 18.4], [14.4, 12.4]] as P[],

  workers: {
    hall: [[6, 6], [10, 7]],
    blackbox: [[20.5, 5.5], [25.0, 6.5]],
    bar: [[18.0, 15.5], [20.5, 16.8]],
    wc: [[26.0, 13.2], [28.2, 13.4]],
    rehearsal: [[25.8, 17.2], [28.0, 17.6]],
    gallery: [[34.0, 14.0], [36.8, 8.5]],
    lobby: [[8, 16], [11, 16]],
  } as Record<RoomId, P[]>,
};

export function seatsFor(room: RoomId): P[] {
  if (room === 'hall') return SPOTS.hall.seats;
  if (room === 'blackbox') return SPOTS.blackbox.seats;
  return [];
}

export function showSpots(room: RoomId) {
  return room === 'blackbox' ? SPOTS.blackbox : SPOTS.hall;
}

/** Centro de uma sala (para câmara e etiquetas). */
export function roomCenter(id: RoomId): P {
  const r = ROOM_RECTS[id];
  return [(r.x0 + r.x1 + 1) / 2, (r.y0 + r.y1 + 1) / 2];
}
