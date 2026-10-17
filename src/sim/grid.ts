// Grelha de navegação e A* (8 direções, sem cortar cantos).

import { DOORS, MAP_H, MAP_W, T, baseTile } from '../content/map';
import type { GameState } from './types';

export class NavGrid {
  walk: Uint8Array;
  private cache = new Map<number, [number, number][] | null>();

  constructor() {
    this.walk = new Uint8Array(MAP_W * MAP_H);
  }

  rebuild(state: GameState): void {
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const t = baseTile(x, y);
        let ok = t === T.Floor || t === T.Door || t === T.Sidewalk;
        if (t === T.Door) {
          const d = DOORS.find((dd) => dd.x === x && dd.y === y);
          if (d && d.room && !state.rooms[d.room].built) ok = false;
        }
        this.walk[y * MAP_W + x] = ok ? 1 : 0;
      }
    }
    this.cache.clear();
  }

  isWalkable(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return false;
    return this.walk[y * MAP_W + x] === 1;
  }

  /** Tile caminhável mais próximo (para destinos dentro de mobiliário). */
  nearestWalkable(x: number, y: number): [number, number] {
    const tx = Math.floor(x), ty = Math.floor(y);
    if (this.isWalkable(tx, ty)) return [tx, ty];
    for (let r = 1; r < 8; r++) {
      let best: [number, number] | null = null, bd = Infinity;
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const nx = tx + dx, ny = ty + dy;
        if (!this.isWalkable(nx, ny)) continue;
        const d = (nx + 0.5 - x) ** 2 + (ny + 0.5 - y) ** 2;
        if (d < bd) { bd = d; best = [nx, ny]; }
      }
      if (best) return best;
    }
    return [tx, ty];
  }

  /** Caminho em centros de tile, de (sx,sy) até (gx,gy). Devolve null se impossível. */
  findPath(sx: number, sy: number, gx: number, gy: number): [number, number][] | null {
    const [ax, ay] = this.nearestWalkable(sx, sy);
    const [bx, by] = this.nearestWalkable(gx, gy);
    const key = ((ay * MAP_W + ax) << 12) | (by * MAP_W + bx);
    const cached = this.cache.get(key);
    if (cached !== undefined) return cached ? cached.slice() : null;
    const res = this.astar(ax, ay, bx, by);
    if (this.cache.size > 4000) this.cache.clear();
    this.cache.set(key, res);
    return res ? res.slice() : null;
  }

  private astar(ax: number, ay: number, bx: number, by: number): [number, number][] | null {
    if (ax === bx && ay === by) return [];
    const N = MAP_W * MAP_H;
    const g = new Float32Array(N).fill(Infinity);
    const came = new Int32Array(N).fill(-1);
    const closed = new Uint8Array(N);
    const open: number[] = [];
    const f = new Float32Array(N).fill(Infinity);
    const start = ay * MAP_W + ax, goal = by * MAP_W + bx;
    g[start] = 0;
    f[start] = this.h(ax, ay, bx, by);
    open.push(start);
    while (open.length) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (f[open[i]] < f[open[bi]]) bi = i;
      const cur = open[bi];
      open[bi] = open[open.length - 1];
      open.pop();
      if (cur === goal) break;
      if (closed[cur]) continue;
      closed[cur] = 1;
      const cx = cur % MAP_W, cy = (cur / MAP_W) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = cx + dx, ny = cy + dy;
        if (!this.isWalkable(nx, ny)) continue;
        if (dx && dy && (!this.isWalkable(cx + dx, cy) || !this.isWalkable(cx, cy + dy))) continue;
        const ni = ny * MAP_W + nx;
        if (closed[ni]) continue;
        const ng = g[cur] + (dx && dy ? 1.4142 : 1);
        if (ng < g[ni]) {
          g[ni] = ng;
          came[ni] = cur;
          f[ni] = ng + this.h(nx, ny, bx, by);
          open.push(ni);
        }
      }
    }
    if (came[goal] === -1) return null;
    const out: [number, number][] = [];
    let c = goal;
    while (c !== start) {
      out.push([(c % MAP_W) + 0.5, ((c / MAP_W) | 0) + 0.5]);
      c = came[c];
    }
    out.reverse();
    return out;
  }

  private h(ax: number, ay: number, bx: number, by: number): number {
    const dx = Math.abs(ax - bx), dy = Math.abs(ay - by);
    return Math.max(dx, dy) + 0.4142 * Math.min(dx, dy);
  }
}
