// Renderizador isométrico em Canvas 2D: edifício em cutaway, mobiliário, NPCs, iluminação e efeitos.
// Lê o estado da simulação; nunca o altera.

import { artistOf } from '../content/artists';
import { ARTWORK_SPOTS, GALLERY_PANELS, GALLERY_X0, MAP_W, ROOM_RECTS, SPOTS, STAGES, T, baseTile, inRect, roomAt, roomCenter, seatsFor, DOORS } from '../content/map';
import { ROOMS } from '../content/rooms';
import type { SimEvent } from '../sim/core';
import type { Simulation } from '../sim/sim';
import { isOperational, roomCapacity, upgradeValue, liveBookingIn, nextBooking } from '../sim/state';
import { fmtClock, fmtDayShort, hourOf, minuteOfDay } from '../sim/time';
import type { Agent, Booking, GameState, RoomId } from '../sim/types';
import { tableSeatPos } from '../sim/agents';
import { soldTotal } from '../sim/bookings';
import { SEGMENTS } from '../content/segments';
import { currentExhibition } from '../sim/gallery';
import { VISUAL_BY_ID, type ArtStyle } from '../content/visualArtists';
import { Camera } from './camera';
import { drawCharacter, drawIcon, type CharOpts, type Pose, type Prop } from './characters';
import { boxColors, ellipse, faceX, faceY, floorQuad, isoBox, px, py, roundRect, shade, unproject } from './iso';
import { FLOOR, STAFF_SHIRT, WALL } from './palette';
import { Particles } from './particles';

type C = CanvasRenderingContext2D;
interface Drawable { d: number; f: () => void }

const WALL_H = 100;
const CUT_H = 26;
const FRONT_H = 20;
const STAGE_Z: Partial<Record<RoomId, number>> = { hall: 14, blackbox: 12 };
const TRUSS_Z = 112;

export type HitObject = 'boxoffice' | 'bar' | 'stage' | 'plot' | 'floor' | 'outside';
export interface HitResult { x: number; y: number; room: RoomId | null; object: HitObject }

export class Renderer {
  ctx: C;
  cam = new Camera();
  particles = new Particles();
  dpr = 1;
  w = 0;
  h = 0;
  selected: RoomId | null = null;
  tutorialTarget: { x: number; y: number } | null = null;
  hoverTile: [number, number] | null = null;
  private smooth = new Map<number, { x: number; y: number; phase: number; moving: boolean; facing: number }>();
  private t = 0;
  private noteTimer = 0;
  private playerSmooth = { x: 0, y: 0, phase: 0, facing: 1, init: false };

  constructor(public canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    this.resize();
  }

  resize(): void {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = this.canvas.clientWidth;
    this.h = this.canvas.clientHeight;
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
  }

  fitZoom(): number {
    if (this.w < 760) return 0.6;
    return Math.max(0.45, Math.min(1.1, Math.min(this.w / 1500, this.h / 900) * 1.25));
  }

  screenToTile(sx: number, sy: number): [number, number] {
    const wx = this.cam.x + (sx - this.w / 2) / this.cam.zoom;
    const wy = this.cam.y + (sy - this.h / 2) / this.cam.zoom;
    return unproject(wx, wy);
  }

  tileToScreen(x: number, y: number, z = 0): [number, number] {
    return [(px(x, y) - this.cam.x) * this.cam.zoom + this.w / 2, (py(x, y, z) - this.cam.y) * this.cam.zoom + this.h / 2];
  }

  hit(sx: number, sy: number, s: GameState): HitResult {
    const [x, y] = this.screenToTile(sx, sy);
    const room = x >= 0 && y >= 0 && x < MAP_W && y < 19.5 ? roomAt(x, y) : null;
    let object: HitObject = 'floor';
    if (y >= 19.2) object = 'outside';
    else if (x >= 1.8 && x <= 4.6 && y >= 12.6 && y <= 15.3) object = 'boxoffice';
    else if (room && !s.rooms[room].built) object = 'plot';
    else if (room === 'bar' && y < 14.8 && x > 16.5 && x < 22.5) object = 'bar';
    else if (room && STAGES[room] && inRect(STAGES[room]!, Math.floor(x), Math.floor(y))) object = 'stage';
    return { x, y, room, object };
  }

  consume(events: SimEvent[], s: GameState): void {
    for (const e of events) {
      if (e.type === 'coin') this.particles.coin(px(e.x, e.y), py(e.x, e.y), e.amount);
      else if (e.type === 'fx') {
        const n = e.kind === 'confetti' ? 60 : e.kind === 'sparkle' ? 24 : 6;
        this.particles.burst(e.kind === 'sparkle' ? 'star' : e.kind, px(e.x, e.y), py(e.x, e.y), n);
      } else if (e.type === 'showEnd') {
        const b = s.bookings.find((x) => x.id === e.bookingId);
        if (!b) continue;
        for (const a of s.agents) if (a.bookingId === b.id && a.kind === 'visitor' && Math.random() < 0.5) {
          this.particles.float('heart', px(a.x, a.y), py(a.x, a.y) - 40, '#ff4d6d');
        }
      } else if (e.type === 'levelup') {
        const [x, y] = [s.player.x, s.player.y];
        this.particles.burst('confetti', px(x, y), py(x, y) - 30, 80);
      }
    }
  }

  // ======================================================================== frame

  render(sim: Simulation, dt: number): void {
    const s = sim.state;
    this.t += dt;
    this.particles.update(dt);
    this.cam.update(dt, s.player);
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    this.drawSky(s);
    const z = this.cam.zoom * this.dpr;
    ctx.setTransform(z, 0, 0, z, (this.w / 2 - this.cam.x * this.cam.zoom) * this.dpr, (this.h / 2 - this.cam.y * this.cam.zoom) * this.dpr);

    this.drawGround(s);
    this.drawFloors(s);
    this.drawSelection();
    this.drawDirt(s);
    this.drawBackWalls(s);
    this.drawStages(s);

    const list: Drawable[] = [];
    this.collectWalls(list, s);
    this.collectFurniture(list, s);
    this.collectStreet(list, s);
    this.collectAgents(list, s, dt);
    list.sort((a, b) => a.d - b.d);
    for (const it of list) it.f();

    this.drawOverhead(s);
    this.drawLighting(s);
    this.drawLabels(s);
    this.drawIcons(s);
    this.particles.draw(ctx);
    this.drawTutorial();
    this.spawnShowParticles(s, dt);
  }

  // ======================================================================== céu e ambiente

  nightFactor(s: GameState): number {
    const m = minuteOfDay(s.time) / 60;
    if (m >= 8 && m < 17.5) return 0;
    if (m >= 17.5 && m < 20.5) return (m - 17.5) / 3;
    if (m >= 6 && m < 8) return 1 - (m - 6) / 2;
    return 1;
  }

  private drawSky(s: GameState): void {
    const ctx = this.ctx;
    const n = this.nightFactor(s);
    const h = hourOf(s.time);
    const dusk = h >= 17 && h < 21 ? 1 - Math.abs(h + minuteOfDay(s.time) % 60 / 60 - 19) / 2 : 0;
    const top = mix(mix('#7fb8f0', '#ff9a76', dusk * 0.7), '#0d1633', n);
    const bot = mix(mix('#d9eefc', '#ffd8a8', dusk * 0.7), '#2b3561', n);
    const g = ctx.createLinearGradient(0, 0, 0, this.h);
    g.addColorStop(0, top);
    g.addColorStop(1, bot);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.w, this.h);
    if (n > 0.3) {
      ctx.fillStyle = `rgba(255,255,255,${(n - 0.3) * 0.8})`;
      for (let i = 0; i < 40; i++) {
        const sx = (i * 137.5) % this.w, sy = ((i * 71.3) % (this.h * 0.4));
        ctx.fillRect(sx, sy, 1.5, 1.5);
      }
    }
  }

  private drawGround(_s: GameState): void {
    const ctx = this.ctx;
    // lote em redor do edifício
    floorQuad(ctx, -10, -10, 41, 20, '#7d8b6a');
    floorQuad(ctx, -2, -2, 43, 20, '#8f8a80');
    // passeio e estrada
    floorQuad(ctx, -12, 20, 43, 22, FLOOR.sidewalk[0]);
    for (let x = -12; x < 43; x += 2) floorQuad(ctx, x, 20, x + 1, 22, FLOOR.sidewalk[1]);
    floorQuad(ctx, -12, 22, 43, 24.2, FLOOR.road[0]);
    for (let x = -12; x < 43; x += 3) floorQuad(ctx, x, 23.02, x + 1.5, 23.14, '#e9e4c9');
    floorQuad(ctx, -12, 24.2, 43, 25.2, FLOOR.sidewalk[0]);
    floorQuad(ctx, -12, 25.2, 43, 30, '#6f7d5e');
    // passadeira na entrada
    for (let i = 0; i < 6; i++) floorQuad(ctx, 5.6 + 0, 22.1 + i * 0.35, 8.4, 22.1 + i * 0.35 + 0.18, '#e9e4c9');
  }

  private drawFloors(s: GameState): void {
    const ctx = this.ctx;
    for (let y = 1; y < 19; y++) {
      for (let x = 1; x < MAP_W - 1; x++) {
        const t = baseTile(x, y);
        if (t === T.InnerWall || t === T.Void || t === T.BackWall) continue;
        const room = roomAt(x, y) ?? doorRoom(x, y);
        let c: string;
        if (!room) c = FLOOR.lobby[(x + y) % 2];
        else if (!s.rooms[room].built) c = (x + y) % 2 ? '#9b968e' : '#938e86';
        else {
          const pal = FLOOR[room as keyof typeof FLOOR] as string[];
          c = room === 'hall' ? pal[x % 2] : room === 'rehearsal' || room === 'blackbox' ? pal[0] : pal[(x + y) % 2];
        }
        floorQuad(ctx, x, y, x + 1, y + 1, c);
      }
    }
    // portas: soleiras
    for (const d of DOORS) {
      if (d.room && !s.rooms[d.room].built) continue;
      floorQuad(ctx, d.x, d.y, d.x + 1, d.y + 1, '#8d6e63');
    }
    // tapete do átrio (decoração)
    const decor = upgradeValue(s, 'lobby', 'decor');
    if (decor >= 1) floorQuad(ctx, 9.8, 15.8, 14.2, 18.6, '#a23b48');
    if (decor >= 2) floorQuad(ctx, 10.1, 16.1, 13.9, 18.3, '#c4566a');
    // alcatifa no ensaio
    if (s.rooms.rehearsal.built) floorQuad(ctx, 24.3, 16.2, 29.7, 18.8, '#3b4a78');
    // zonas em obras: fita
    for (const id of Object.keys(ROOM_RECTS) as RoomId[]) {
      if (s.rooms[id].built) continue;
      const r = ROOM_RECTS[id];
      ctx.save();
      ctx.globalAlpha = 0.25;
      for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) if ((x + y) % 3 === 0) floorQuad(ctx, x + 0.1, y + 0.1, x + 0.9, y + 0.9, '#f2c94c');
      ctx.restore();
    }
    // destino do jogador
    const p = s.player.path[s.player.path.length - 1];
    if (p) {
      ctx.strokeStyle = 'rgba(255,214,10,0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(px(p[0], p[1]), py(p[0], p[1]), 12, 6, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (this.hoverTile) {
      const [hx, hy] = this.hoverTile;
      floorQuad(ctx, hx, hy, hx + 1, hy + 1, 'rgba(255,255,255,0.12)');
    }
  }

  private drawSelection(): void {
    if (!this.selected) return;
    const r = ROOM_RECTS[this.selected];
    const ctx = this.ctx;
    ctx.save();
    ctx.setLineDash([8, 6]);
    ctx.lineDashOffset = -this.t * 30;
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#ffd60a';
    ctx.beginPath();
    const pts = [[r.x0, r.y0], [r.x1 + 1, r.y0], [r.x1 + 1, r.y1 + 1], [r.x0, r.y1 + 1]];
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(px(x, y), py(x, y)) : ctx.moveTo(px(x, y), py(x, y))));
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }

  private drawDirt(s: GameState): void {
    const ctx = this.ctx;
    for (const id of Object.keys(s.rooms) as RoomId[]) {
      for (const d of s.rooms[id].dirt) {
        const x = px(d.x, d.y), y = py(d.x, d.y);
        const k = 1 - Math.min(1, d.progress / 2) * 0.6;
        if (d.kind === 0) {
          ellipse(ctx, x, y, 9 * k, 4.5 * k, 'rgba(92,72,52,0.55)');
          ellipse(ctx, x + 3, y - 1, 4 * k, 2 * k, 'rgba(70,55,40,0.6)');
        } else if (d.kind === 1) {
          isoBox(ctx, d.x - 0.18, d.y - 0.18, d.x + 0.18, d.y + 0.18, 0, 9 * k, boxColors('#a1887f'));
        } else {
          ellipse(ctx, x, y, 3.5, 2, '#eeeeee');
          ctx.fillStyle = '#ef5350';
          ctx.fillRect(x - 2, y - 6, 4, 5);
        }
      }
    }
  }

  // ======================================================================== paredes

  private drawBackWalls(s: GameState): void {
    const ctx = this.ctx;
    const col = { top: WALL.backTop, left: WALL.back, right: shade(WALL.back, -0.2) };
    for (let x = 0; x < GALLERY_X0; x++) isoBox(ctx, x, 0, x + 1, 1, 0, WALL_H, col);
    for (let x = GALLERY_X0; x < MAP_W; x++) isoBox(ctx, x, 5, x + 1, 6, 0, WALL_H, s.rooms.gallery.built ? { top: WALL.backTop, left: '#f2eee8', right: '#d9d3ca' } : col);
    for (let y = 1; y < 20; y++) isoBox(ctx, 0, y, 1, y + 1, 0, WALL_H, col);
    // tijolo: juntas
    ctx.strokeStyle = 'rgba(80,30,20,0.18)';
    ctx.lineWidth = 1;
    for (let z = 10; z < WALL_H; z += 10) {
      ctx.beginPath();
      ctx.moveTo(px(1, 1), py(1, 1, z));
      ctx.lineTo(px(GALLERY_X0, 1), py(GALLERY_X0, 1, z));
      ctx.moveTo(px(1, 1), py(1, 1, z));
      ctx.lineTo(px(1, 20), py(1, 20, z));
      ctx.stroke();
    }
    this.galleryWallArt(s);
    // cortina vermelha da sala principal
    this.curtain(2, 14, STAGE_Z.hall!, '#9d1b2f', '#c2263c');
    // black box
    if (s.rooms.blackbox.built) {
      this.curtain(17, 29, STAGE_Z.blackbox!, '#16161c', '#24242c');
      this.wallText('BLACK BOX', 'y', 23, 1, 80, '#f5f5f5', 15);
    } else {
      for (let i = 0; i < 4; i++) { // janelas entaipadas
        const x0 = 17.5 + i * 3;
        faceY(ctx, x0, x0 + 1.6, 1, 40, 80, '#5d4037');
        for (let k = 0; k < 3; k++) faceY(ctx, x0, x0 + 1.6, 1, 46 + k * 12, 50 + k * 12, '#8d6e63');
      }
    }
    // painéis acústicos da sala
    for (let i = 0; i < 4; i++) {
      const y0 = 4.5 + i * 1.5;
      faceX(ctx, 1, y0, y0 + 1, 34, 74, i % 2 ? '#3d405b' : '#4a4e69');
    }
    // átrio: logótipo e cartazes
    this.wallText('CULTURE', 'x', 1, 15.2, 82, '#ffd60a', 20);
    this.wallText('WORLD', 'x', 1, 15.2, 62, '#ffffff', 20);
    const upcoming = s.bookings.filter((b) => b.status !== 'settled' && b.status !== 'cancelled').slice(0, 3);
    for (let i = 0; i < 3; i++) {
      const y0 = 12.4 + i * 1.0 + (i > 0 ? 3.6 : 0);
      if (y0 + 0.8 > 18.9) break;
      const b = upcoming[i];
      const c = b ? artistOf(b).colors : ['#cfc6b8', '#e8e0d4'];
      faceX(ctx, 1, y0, y0 + 0.8, 18, 50, '#2b2d42');
      faceX(ctx, 1, y0 + 0.06, y0 + 0.74, 20, 48, c[0]);
      faceX(ctx, 1, y0 + 0.2, y0 + 0.6, 26, 38, c[1]);
    }
  }

  private curtain(x0: number, x1: number, z0: number, dark: string, light: string): void {
    const ctx = this.ctx;
    for (let x = x0; x < x1; x += 0.5) faceY(ctx, x, x + 0.5, 1, z0, WALL_H - 6, ((x * 2) | 0) % 2 ? dark : light);
    faceY(ctx, x0, x1, 1, WALL_H - 14, WALL_H - 4, shade(dark, -0.3));
  }

  /** Texto pintado numa face de parede ('x': face x=const; 'y': face y=const). */
  private wallText(text: string, axis: 'x' | 'y', fx: number, fy: number, z: number, color: string, size: number): void {
    const ctx = this.ctx;
    ctx.save();
    const sx = px(fx, fy), sy = py(fx, fy, z);
    if (axis === 'y') ctx.transform(0.894, 0.447, 0, 1, sx, sy);
    else ctx.transform(0.894, -0.447, 0, 1, sx, sy);
    ctx.font = `900 ${size}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillText(text, 1.5, 1.5);
    ctx.fillStyle = color;
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }

  private collectWalls(list: Drawable[], s: GameState): void {
    const ctx = this.ctx;
    const inner = { top: WALL.innerTop, left: WALL.inner, right: shade(WALL.inner, -0.18) };
    const front = { top: WALL.frontTop, left: WALL.front, right: shade(WALL.front, -0.2) };
    for (let y = 1; y < 20; y++) {
      for (let x = 1; x < MAP_W; x++) {
        const t = baseTile(x, y);
        if (t === T.InnerWall) list.push({ d: x + y + 1, f: () => isoBox(ctx, x, y, x + 1, y + 1, 0, CUT_H, inner) });
        else if (t === T.FrontWall) list.push({ d: x + y + 1, f: () => isoBox(ctx, x, y, x + 1, y + 1, 0, FRONT_H, front) });
        else if (t === T.Door) {
          const d = DOORS.find((dd) => dd.x === x && dd.y === y);
          if (d?.room && !s.rooms[d.room].built) {
            list.push({ d: x + y + 1, f: () => this.tape(x, y) });
          }
        }
      }
    }
  }

  private tape(x: number, y: number): void {
    const ctx = this.ctx;
    const vertical = baseTile(x - 1, y) === T.InnerWall || baseTile(x + 1, y) === T.InnerWall ? false : true;
    for (let i = 0; i < 2; i++) {
      const z = 10 + i * 9;
      ctx.strokeStyle = i % 2 ? '#212121' : '#ffca28';
      ctx.lineWidth = 3;
      ctx.beginPath();
      if (vertical) { ctx.moveTo(px(x + 0.5, y), py(x + 0.5, y, z)); ctx.lineTo(px(x + 0.5, y + 1), py(x + 0.5, y + 1, z)); }
      else { ctx.moveTo(px(x, y + 0.5), py(x, y + 0.5, z)); ctx.lineTo(px(x + 1, y + 0.5), py(x + 1, y + 0.5, z)); }
      ctx.stroke();
    }
  }

  // ======================================================================== palcos e mobiliário

  private galleryWallArt(s: GameState): void {
    if (!s.rooms.gallery.built) return;
    const ctx = this.ctx;
    const e = currentExhibition(s);
    const va = e ? VISUAL_BY_ID[e.artistId] : null;
    ARTWORK_SPOTS.forEach((sp, i) => {
      if (sp.mount !== 'wall') return;
      const x0 = sp.x - 0.65, x1 = sp.x + 0.65;
      if (!e || !va || i >= e.works.length) { faceY(ctx, sp.x - 0.04, sp.x + 0.04, 6.01, 58, 62, '#9e9e9e'); return; }
      const [a, b, c] = artworkColors(va.style, va.colors, i);
      faceY(ctx, x0, x1, 6.01, 26, 70, '#2b2b2b');
      faceY(ctx, x0 + 0.06, x1 - 0.06, 6.02, 29, 67, a);
      if (va.style === 'photo') { faceY(ctx, x0 + 0.15, x1 - 0.15, 6.03, 33, 50, b); faceY(ctx, x0 + 0.3, x0 + 0.7, 6.04, 50, 62, c); }
      else if (va.style === 'illustration' || va.style === 'textile') { for (let k = 0; k < 4; k++) faceY(ctx, x0 + 0.12 + k * 0.28, x0 + 0.3 + k * 0.28, 6.03, 33 + (k % 2) * 8, 52 + (k % 2) * 8, k % 2 ? b : c); }
      else { faceY(ctx, x0 + 0.1, x0 + 0.7, 6.03, 31, 52, b); faceY(ctx, x0 + 0.55, x1 - 0.12, 6.04, 45, 64, c); }
      this.lamp(sp.x, 6.2, 80, s);
      if (e.works[i].sold) ellipse(this.ctx, px(x1 - 0.1, 6.03), py(x1 - 0.1, 6.03, 22), 2.6, 2.6, '#e53935');
    });
  }

  private lamp(x: number, y: number, z: number, s: GameState): void {
    const lv = upgradeValue(s, 'gallery', 'lighting');
    if (lv === 0) return;
    ellipse(this.ctx, px(x, y), py(x, y, z), 3, 2, '#424242');
  }

  private galleryFurniture(add: (d: number, f: () => void) => void, s: GameState): void {
    const ctx = this.ctx;
    const e = currentExhibition(s);
    const va = e ? VISUAL_BY_ID[e.artistId] : null;
    for (const p of GALLERY_PANELS) {
      add(p.x0 + p.y1 + 1, () => isoBox(ctx, p.x0 + 0.35, p.y0, p.x0 + 0.65, p.y1 + 1, 0, 58, { top: '#ffffff', left: '#f4f1ec', right: '#ddd7cd' }));
    }
    ARTWORK_SPOTS.forEach((sp, i) => {
      const has = !!(e && va && i < e.works.length);
      if (sp.mount === 'panel') {
        add(sp.x + sp.y + 0.6, () => {
          if (!has) return;
          const [a, b, c] = artworkColors(va!.style, va!.colors, i);
          const fx = sp.x - 0.34;
          faceX(ctx, fx, sp.y - 0.42, sp.y + 0.42, 22, 52, '#2b2b2b');
          faceX(ctx, fx + 0.005, sp.y - 0.36, sp.y + 0.36, 25, 49, a);
          faceX(ctx, fx + 0.01, sp.y - 0.25, sp.y + 0.1, 28, 44, b);
          faceX(ctx, fx + 0.015, sp.y, sp.y + 0.3, 34, 47, c);
          if (e!.works[i].sold) ellipse(ctx, px(fx, sp.y + 0.38), py(fx, sp.y + 0.38, 18), 2.4, 2.4, '#e53935');
        });
      } else if (sp.mount === 'plinth') {
        if (i >= upgradeValue(s, 'gallery', 'displays')) return;
        add(sp.x + sp.y + 0.3, () => {
          isoBox(ctx, sp.x - 0.28, sp.y - 0.28, sp.x + 0.28, sp.y + 0.28, 0, 24, { top: '#ffffff', left: '#eeeeee', right: '#d6d6d6' });
          if (!has) return;
          const [a, b] = artworkColors(va!.style, va!.colors, i);
          const cx = px(sp.x, sp.y), cy = py(sp.x, sp.y, 24);
          if (va!.style === 'installation') {
            isoBox(ctx, sp.x - 0.18, sp.y - 0.18, sp.x + 0.18, sp.y + 0.18, 24, 34 + Math.sin(this.t * 2 + i) * 3, boxColors(a));
            this.ctx.globalCompositeOperation = 'lighter';
            ellipse(ctx, cx, cy - 30, 14, 10, hexA(b, 0.25));
            this.ctx.globalCompositeOperation = 'source-over';
          } else if (va!.style === 'sculpture' || i % 2) {
            ellipse(ctx, cx, cy - 10, 8, 10, a);
            ellipse(ctx, cx - 2, cy - 13, 3, 4, shade(a, 0.3));
          } else {
            isoBox(ctx, sp.x - 0.15, sp.y - 0.15, sp.x + 0.15, sp.y + 0.15, 24, 18, boxColors(a));
          }
          if (e!.works[i].sold) ellipse(ctx, px(sp.x + 0.28, sp.y + 0.28), py(sp.x + 0.28, sp.y + 0.28, 6), 2.4, 2.4, '#e53935');
        });
      }
    });
    // banco no centro e cartaz da exposição à entrada
    add(35 + 13.5, () => isoBox(ctx, 34.2, 13.3, 36.0, 13.7, 0, 9, boxColors('#6d4c41')));
    add(36.6 + 18.4, () => {
      isoBox(ctx, 36.5, 18.3, 37.3, 18.42, 0, 42, boxColors('#212121'));
      faceY(ctx, 36.55, 37.25, 18.43, 14, 40, va ? va.colors[0] : '#bdbdbd');
      faceY(ctx, 36.65, 37.15, 18.44, 20, 30, va ? va.colors[1] : '#e0e0e0');
    });
  }

  private galleryLabel(s: GameState): void {
    const ctx = this.ctx;
    const inv = 1 / Math.max(0.55, this.cam.zoom);
    const e = currentExhibition(s) ?? s.exhibitions.filter((x) => x.status === 'scheduled').sort((a, b) => a.startDay - b.startDay)[0];
    const r = ROOM_RECTS.gallery;
    const lx = px(r.x1 + 0.6, r.y0 + 0.2), ly = py(r.x1 + 0.6, r.y0 + 0.2, WALL_H + 30);
    let sub = 'Sem exposição';
    let live = false;
    if (e) {
      const va = VISUAL_BY_ID[e.artistId];
      if (e.status === 'open') { live = true; sub = `${va.name} · ${e.visitorsToday} hoje · ${e.works.filter((w) => w.sold).length}/${e.works.length} vendidas`; }
      else sub = `A partir de ${fmtDayShort(e.startDay * 1440)} · ${va.name}`;
    }
    ctx.save();
    ctx.translate(lx, ly);
    ctx.scale(inv, inv);
    ctx.font = '700 10px system-ui, sans-serif';
    const w = Math.max(90, ctx.measureText(sub).width + 22);
    roundRect(ctx, -w / 2, -26, w, 34, 9, live ? 'rgba(60,140,110,0.92)' : 'rgba(22,24,35,0.82)');
    label(ctx, 'Galeria', 0, -14, '#fff', 11);
    label(ctx, sub, 0, 0, live ? '#fff' : '#ffd166', 10);
    ctx.restore();
  }

  private drawStages(s: GameState): void {
    const ctx = this.ctx;
    for (const id of ['hall', 'blackbox'] as RoomId[]) {
      const st = STAGES[id]!;
      const z = STAGE_Z[id]!;
      const built = s.rooms[id].built;
      if (!built) continue;
      const wood = id === 'hall' ? '#8a5a3b' : '#1f1f26';
      isoBox(ctx, st.x0, st.y0, st.x1 + 1, st.y1 + 1, 0, z, { top: shade(wood, 0.1), left: shade(wood, -0.25), right: shade(wood, -0.4) });
      const lvl = upgradeValue(s, id, 'stage');
      if (lvl >= 1) {
        // cortinas laterais
        isoBox(ctx, st.x0, st.y0, st.x0 + 0.35, st.y1 + 1, z, 80, boxColors(id === 'hall' ? '#9d1b2f' : '#111'));
      }
      // luzes de ribalta
      const live = liveBookingIn(s, id);
      for (let x = st.x0 + 0.5; x < st.x1 + 1; x += 1) {
        ellipse(ctx, px(x, st.y1 + 1), py(x, st.y1 + 1, z * 0.5), 2.2, 1.2, live?.status === 'live' ? '#fff3b0' : '#6d6d6d');
      }
    }
  }

  private collectFurniture(list: Drawable[], s: GameState): void {
    const ctx = this.ctx;
    const add = (d: number, f: () => void) => list.push({ d, f });

    // --- sala principal e black box
    for (const id of ['hall', 'blackbox'] as RoomId[]) {
      if (!s.rooms[id].built) continue;
      const st = STAGES[id]!;
      const z = STAGE_Z[id]!;
      const snd = upgradeValue(s, id, 'sound');
      const spH = 26 + snd * 10;
      for (const sx of [st.x0 + 0.1, st.x1 + 0.2]) {
        add(sx + st.y1 + 1.5, () => {
          isoBox(ctx, sx, st.y1 + 0.1, sx + 0.7, st.y1 + 0.75, z, spH, boxColors('#222'));
          for (let k = 0; k < 1 + snd; k++) ellipse(ctx, px(sx + 0.35, st.y1 + 0.75), py(sx + 0.35, st.y1 + 0.75, z + 8 + k * 10), 4, 4, '#555');
        });
      }
      // cadeiras
      const seats = seatsFor(id);
      const cap = roomCapacity(s, id);
      const seatColor = id === 'hall' ? '#b23a48' : '#3a3a48';
      for (let i = 0; i < Math.min(cap, seats.length); i++) {
        const [cx, cy] = seats[i];
        add(cx + cy - 0.08, () => isoBox(ctx, cx - 0.2, cy - 0.12, cx + 0.2, cy + 0.14, 0, 7, boxColors(seatColor)));
        add(cx + cy + 0.22, () => isoBox(ctx, cx - 0.2, cy + 0.14, cx + 0.2, cy + 0.22, 0, 15, boxColors(shade(seatColor, -0.15))));
      }
      // régie
      const rx = id === 'hall' ? 12 : 28, rw = id === 'hall' ? 2 : 1;
      add(rx + 10 + 1, () => {
        isoBox(ctx, rx, 10.1, rx + rw, 10.9, 0, 18, boxColors('#37474f'));
        for (let k = 0; k < rw * 2; k++) isoBox(ctx, rx + 0.15 + k * 0.45, 10.25, rx + 0.5 + k * 0.45, 10.45, 18, 9, { top: '#111', left: '#4fc3f7', right: '#0288d1' });
      });
      // bateria / instrumentos durante montagem e espetáculo
      const b = liveBookingIn(s, id);
      if (b && artistOf(b).discipline === 'music' && artistOf(b).members >= 3) {
        const [dx, dy] = id === 'hall' ? SPOTS.hall.stageSpots[0] : SPOTS.blackbox.stageSpots[0];
        add(dx + dy + 0.4, () => this.drumKit(dx, dy + 0.35, z));
      }
    }
    if (!s.rooms.blackbox.built) this.plotProps(add, 'blackbox', s);

    // --- bilheteira
    const booth = '#5e548e';
    add(2 + 12.9 + 1, () => isoBox(ctx, 1.9, 12.75, 4.1, 12.95, 0, 46, boxColors(booth)));
    for (const yy of [13, 14]) {
      add(3 + yy + 1, () => {
        isoBox(ctx, 3, yy, 4, yy + 1, 0, 24, { top: '#e0d6c8', left: shade(booth, -0.1), right: shade(booth, -0.3) });
        isoBox(ctx, 3.05, yy, 3.2, yy + 1, 24, 18, { top: 'rgba(200,230,255,0.5)', left: 'rgba(170,210,240,0.35)', right: 'rgba(150,200,240,0.45)' });
      });
    }
    add(2 + 15.05 + 1.5, () => {
      isoBox(ctx, 1.9, 15.05, 4.1, 15.25, 0, 46, boxColors(booth));
      isoBox(ctx, 1.9, 12.75, 4.25, 15.25, 46, 6, boxColors('#ffb703'));
      this.signText('BILHETEIRA', 4.25, 14.0, 49, '#3d2c00');
    });

    // --- bar
    if (s.rooms.bar.built) {
      const shelfH = 52;
      for (let x = 17; x < 23; x++) {
        add(x + 11.75 + 0.6, () => {
          isoBox(ctx, x, 11.75, x + 1, 12.1, 0, shelfH, boxColors('#4e342e'));
          const cols = ['#2e7d32', '#c62828', '#f9a825', '#6a1b9a', '#1565c0'];
          for (let k = 0; k < 4; k++) {
            const bx = x + 0.12 + k * 0.22;
            for (const zz of [24, 40]) isoBox(ctx, bx, 11.95, bx + 0.08, 12.05, zz, 9, boxColors(cols[(x + k + zz) % cols.length]));
          }
        });
      }
      for (let x = 17; x < 22; x++) {
        add(x + 13 + 1, () => {
          isoBox(ctx, x, 13, x + 1, 14, 0, 24, { top: '#e8e2da', left: '#6d4c41', right: '#4e342e' });
          if (x >= 18 && x <= 20) {
            isoBox(ctx, x + 0.45, 13.3, x + 0.55, 13.4, 24, 10, boxColors('#bdbdbd'));
            ellipse(ctx, px(x + 0.5, 13.35), py(x + 0.5, 13.35, 34), 2.5, 1.4, '#f4b400');
          }
        });
      }
      add(22 + 13 + 1, () => isoBox(ctx, 22, 13, 22.4, 14, 0, 24, { top: '#e8e2da', left: '#6d4c41', right: '#4e342e' }));
      const nTables = Math.min(SPOTS.barTables.length, upgradeValue(s, 'bar', 'tables'));
      for (let i = 0; i < nTables; i++) {
        const [tx, ty] = SPOTS.barTables[i];
        add(tx + ty, () => {
          isoBox(ctx, tx - 0.05, ty - 0.05, tx + 0.05, ty + 0.05, 0, 16, boxColors('#424242'));
          ellipse(ctx, px(tx, ty), py(tx, ty, 17), 15, 7.5, '#8d6e63');
          ellipse(ctx, px(tx, ty), py(tx, ty, 18), 14, 7, '#a1887f');
        });
        for (const k of [0, 1]) {
          const [sx, sy] = tableSeatPos(i * 2 + k);
          add(sx + sy - 0.1, () => isoBox(ctx, sx - 0.13, sy - 0.1, sx + 0.13, sy + 0.12, 0, 9, boxColors('#5d4037')));
        }
      }
    } else this.plotProps(add, 'bar', s);

    // --- átrio
    const decor = upgradeValue(s, 'lobby', 'decor');
    if (decor === 0) {
      for (const [bx, by, h] of [[11.2, 16.2, 14], [12.4, 16.6, 22], [12.0, 17.6, 12], [1.4, 16.6, 16]] as [number, number, number][]) {
        add(bx + by + 0.6, () => isoBox(ctx, bx, by, bx + 0.7, by + 0.7, 0, h, boxColors('#a1887f')));
      }
    } else {
      add(11 + 18.4, () => {
        isoBox(ctx, 10.8, 17.9, 13.8, 18.5, 0, 9, boxColors('#3d5a80'));
        isoBox(ctx, 10.8, 18.35, 13.8, 18.6, 0, 18, boxColors('#2c4463'));
      });
      add(12.3 + 16.9, () => {
        isoBox(ctx, 11.7, 16.6, 12.9, 17.2, 0, 8, boxColors('#6d4c41'));
      });
      for (const [px0, py0] of [[1.5, 12.5], [14.3, 18.3], [9.4, 18.4], [14.3, 12.4]] as [number, number][]) add(px0 + py0, () => this.plant(px0, py0));
    }
    if (decor >= 2) {
      for (const [ax, ay] of [[5.5, 12.3], [9.5, 12.3]] as [number, number][]) add(ax + ay, () => {
        isoBox(ctx, ax - 0.2, ay - 0.2, ax + 0.2, ay + 0.2, 0, 22, boxColors('#eeeeee'));
        ellipse(ctx, px(ax, ay), py(ax, ay, 32), 7, 9, '#ff7096');
      });
    }
    // cavalete com o próximo evento
    const nb = nextBooking(s);
    add(8.6 + 17.6, () => {
      isoBox(ctx, 8.4, 17.5, 8.9, 17.62, 0, 34, boxColors('#3e2723'));
      const c = nb ? artistOf(nb).colors : ['#9e9e9e', '#cfcfcf'];
      faceY(ctx, 8.43, 8.87, 17.63, 12, 33, c[0]);
      faceY(ctx, 8.5, 8.8, 17.63, 18, 27, c[1]);
    });

    // --- WC
    if (s.rooms.wc.built) {
      for (let i = 0; i < 3; i++) {
        const x0 = 24.4 + i * 1.5;
        add(x0 + 12 + 1, () => {
          isoBox(ctx, x0, 12.05, x0 + 1.1, 12.5, 0, 40, boxColors('#eceff1'));
          faceY(ctx, x0 + 0.2, x0 + 0.9, 12.51, 2, 34, '#4fc3f7');
        });
      }
    } else this.plotProps(add, 'wc', s);

    // --- sala de ensaio
    if (s.rooms.rehearsal.built) {
      add(27.2 + 16.3 + 0.4, () => this.drumKit(27.2, 16.6, 0));
      for (const [ax, ay] of [[24.6, 16.4], [29.0, 16.6]] as [number, number][]) add(ax + ay + 0.5, () => {
        isoBox(ctx, ax, ay, ax + 0.6, ay + 0.45, 0, 22, boxColors('#212121'));
        ellipse(ctx, px(ax + 0.3, ay + 0.45), py(ax + 0.3, ay + 0.45, 11), 5, 5, '#424242');
      });
    } else this.plotProps(add, 'rehearsal', s);

    // --- galeria
    if (s.rooms.gallery.built) this.galleryFurniture(add, s);
    else this.plotProps(add, 'gallery', s);
  }

  private plant(x: number, y: number): void {
    const ctx = this.ctx;
    isoBox(ctx, x - 0.18, y - 0.18, x + 0.18, y + 0.18, 0, 12, boxColors('#bf6b3f'));
    ellipse(ctx, px(x, y), py(x, y, 24), 10, 9, '#2e7d32');
    ellipse(ctx, px(x, y) - 4, py(x, y, 30), 6, 6, '#43a047');
    ellipse(ctx, px(x, y) + 4, py(x, y, 28), 6, 6, '#388e3c');
  }

  private drumKit(x: number, y: number, z: number): void {
    const ctx = this.ctx;
    ellipse(ctx, px(x, y), py(x, y, z + 6), 9, 7, '#c62828');
    ellipse(ctx, px(x, y), py(x, y, z + 6), 6, 4.5, '#eeeeee');
    ellipse(ctx, px(x - 0.4, y - 0.1), py(x - 0.4, y - 0.1, z + 14), 5, 2.5, '#9e9e9e');
    ellipse(ctx, px(x + 0.4, y - 0.1), py(x + 0.4, y - 0.1, z + 18), 6, 2.2, '#fbc02d');
    ellipse(ctx, px(x - 0.5, y + 0.2), py(x - 0.5, y + 0.2, z + 20), 6, 2.2, '#fbc02d');
  }

  private signText(text: string, fx: number, fy: number, z: number, color: string): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.transform(0.894, -0.447, 0, 1, px(fx, fy), py(fx, fy, z));
    ctx.font = '800 9px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }

  private plotProps(add: (d: number, f: () => void) => void, id: RoomId, s: GameState): void {
    const ctx = this.ctx;
    const r = ROOM_RECTS[id];
    const cons = s.rooms[id].construction;
    const [cx, cy] = roomCenter(id);
    add(cx + cy, () => {
      isoBox(ctx, cx - 0.9, cy - 0.5, cx - 0.1, cy + 0.3, 0, 16, boxColors('#a1887f'));
      isoBox(ctx, cx + 0.2, cy - 0.2, cx + 0.8, cy + 0.4, 0, 12, boxColors('#8d6e63'));
      if (cons) {
        // andaime
        ctx.strokeStyle = '#90a4ae';
        ctx.lineWidth = 2;
        for (const [ax, ay] of [[r.x0 + 0.5, r.y0 + 0.5], [r.x1 + 0.5, r.y0 + 0.5]]) {
          ctx.beginPath();
          ctx.moveTo(px(ax, ay), py(ax, ay));
          ctx.lineTo(px(ax, ay), py(ax, ay, 70));
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.moveTo(px(r.x0 + 0.5, r.y0 + 0.5), py(r.x0 + 0.5, r.y0 + 0.5, 60));
        ctx.lineTo(px(r.x1 + 0.5, r.y0 + 0.5), py(r.x1 + 0.5, r.y0 + 0.5, 60));
        ctx.stroke();
      }
    });
  }

  // ======================================================================== rua

  private collectStreet(list: Drawable[], s: GameState): void {
    const ctx = this.ctx;
    const n = this.nightFactor(s);
    for (const tx of [1.5, 13.5, 19.5, 27.5]) {
      list.push({ d: tx + 20.9, f: () => {
        isoBox(ctx, tx - 0.35, 20.55, tx + 0.35, 21.25, 0, 8, boxColors('#9e9e9e'));
        isoBox(ctx, tx - 0.05, 20.85, tx + 0.05, 20.95, 8, 22, boxColors('#6d4c41'));
        ellipse(ctx, px(tx, 20.9), py(tx, 20.9, 44), 18, 15, '#2e7d32');
        ellipse(ctx, px(tx, 20.9) - 8, py(tx, 20.9, 52), 11, 10, '#43a047');
        ellipse(ctx, px(tx, 20.9) + 7, py(tx, 20.9, 56), 10, 9, '#388e3c');
      } });
    }
    for (const lx of [10.5, 17.5, 24.5]) {
      list.push({ d: lx + 20.3, f: () => {
        isoBox(ctx, lx - 0.05, 20.25, lx + 0.05, 20.35, 0, 70, boxColors('#37474f'));
        ellipse(ctx, px(lx, 20.3), py(lx, 20.3, 72), 6, 3, n > 0.2 ? '#fff3b0' : '#cfd8dc');
      } });
    }
    // totem com o nome
    list.push({ d: 3.6 + 20.5, f: () => {
      isoBox(ctx, 3.2, 20.3, 4.0, 20.7, 0, 90, boxColors('#1b1b2f'));
      ctx.save();
      ctx.transform(0.894, 0.447, 0, 1, px(3.6, 20.7), py(3.6, 20.7, 50));
      ctx.font = '900 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = n > 0.2 ? '#ff4fa3' : '#ff8fc4';
      ctx.fillText('CULTURE', 0, -14);
      ctx.fillStyle = n > 0.2 ? '#4fe3ff' : '#9ff0ff';
      ctx.fillText('WORLD', 0, 2);
      ctx.restore();
    } });
    // marquise com o próximo evento
    const nb = nextBooking(s);
    list.push({ d: 10 + 20.2, f: () => {
      isoBox(ctx, 8.6, 20.15, 8.7, 20.25, 0, 40, boxColors('#424242'));
      isoBox(ctx, 12.3, 20.15, 12.4, 20.25, 0, 40, boxColors('#424242'));
      isoBox(ctx, 8.4, 20.1, 12.6, 20.3, 40, 22, boxColors('#212121'));
      for (let i = 0; i < 10; i++) {
        const lx = 8.5 + i * 0.44;
        const on = Math.floor(this.t * 4 + i) % 3 !== 0;
        ellipse(ctx, px(lx, 20.3), py(lx, 20.3, 60), 1.6, 1.6, on ? '#ffe082' : '#795548');
      }
      ctx.save();
      ctx.transform(0.894, 0.447, 0, 1, px(10.5, 20.3), py(10.5, 20.3, 50));
      ctx.font = '800 8px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff';
      const label = nb ? `${nb.status === 'live' ? 'AO VIVO' : fmtClock(nb.startAt)} · ${artistOf(nb).name.toUpperCase()}` : 'EM BREVE';
      ctx.fillText(label.slice(0, 34), 0, 0);
      ctx.restore();
    } });
    // carros
    const carColors = ['#e63946', '#457b9d', '#f4a261', '#2a9d8f'];
    for (let i = 0; i < 4; i++) {
      const dir = i % 2 ? 1 : -1;
      const lane = dir > 0 ? 22.55 : 23.55;
      const span = 60;
      let x = ((this.t * (3 + i) + i * 17) % span) - 15;
      if (dir < 0) x = 45 - x - 15;
      list.push({ d: x + lane + 0.5, f: () => this.car(x, lane, carColors[i], n) });
    }
  }

  private car(x: number, y: number, color: string, n: number): void {
    const ctx = this.ctx;
    ellipse(ctx, px(x + 0.8, y + 0.3), py(x + 0.8, y + 0.3), 30, 10, 'rgba(0,0,0,0.25)');
    isoBox(ctx, x, y, x + 1.7, y + 0.65, 3, 12, boxColors(color));
    isoBox(ctx, x + 0.35, y + 0.05, x + 1.25, y + 0.6, 15, 9, { top: shade(color, 0.2), left: '#b3e5fc', right: '#81d4fa' });
    if (n > 0.2) ellipse(ctx, px(x + 1.7, y + 0.33), py(x + 1.7, y + 0.33, 9), 3, 2, '#fff8e1');
  }

  // ======================================================================== personagens

  private collectAgents(list: Drawable[], s: GameState, dt: number): void {
    const k = 1 - Math.exp(-dt * 14);
    const seen = new Set<number>();
    const bookingById = new Map(s.bookings.map((b) => [b.id, b] as const));
    for (const a of s.agents) {
      seen.add(a.id);
      let sm = this.smooth.get(a.id);
      if (!sm) { sm = { x: a.x, y: a.y, phase: Math.random() * 6, moving: false, facing: 1 }; this.smooth.set(a.id, sm); }
      const nx = sm.x + (a.x - sm.x) * k, ny = sm.y + (a.y - sm.y) * k;
      const dsx = (nx - sm.x) - (ny - sm.y);
      const moved = Math.hypot(nx - sm.x, ny - sm.y);
      if (Math.abs(dsx) > 0.002) sm.facing = dsx > 0 ? 1 : -1;
      sm.x = nx; sm.y = ny;
      sm.moving = a.path.length > 0 || moved > 0.004;
      sm.phase += moved * 9;
      const b = a.bookingId !== null ? bookingById.get(a.bookingId) : undefined;
      const opts = this.agentLook(a, s, b, sm);
      const z = stageZ(sm.x, sm.y, s);
      const smx = sm.x, smy = sm.y;
      list.push({ d: smx + smy + 0.01, f: () => drawCharacter(this.ctx, px(smx, smy), py(smx, smy, z), opts) });
    }
    for (const id of this.smooth.keys()) if (!seen.has(id)) this.smooth.delete(id);

    // jogador
    const p = s.player, ps = this.playerSmooth;
    if (!ps.init) { ps.x = p.x; ps.y = p.y; ps.init = true; }
    const moved = Math.hypot(p.x - ps.x, p.y - ps.y);
    const dsx = (p.x - ps.x) - (p.y - ps.y);
    if (Math.abs(dsx) > 0.001) ps.facing = dsx > 0 ? 1 : -1;
    ps.phase += moved * 9;
    ps.x = p.x; ps.y = p.y;
    const pose: Pose = moved > 0.001 ? 'walk' : 'stand';
    const look = { skin: 2, hair: 1, hairStyle: 0, shirt: 9, pants: 0 };
    list.push({ d: p.x + p.y + 0.02, f: () => drawCharacter(this.ctx, px(p.x, p.y), py(p.x, p.y), { look, pose, phase: ps.phase, facing: ps.facing, shirt: '#30343f', player: true, t: this.t }) });
  }

  private agentLook(a: Agent, s: GameState, b: Booking | undefined, sm: { moving: boolean; phase: number; facing: number }): CharOpts {
    const base: CharOpts = { look: a.look, pose: sm.moving ? 'walk' : 'stand', phase: sm.phase, facing: sm.facing, t: this.t };
    if (a.segment) {
      const seg = SEGMENTS[a.segment];
      base.shirt = seg.shirts[a.variant % seg.shirts.length];
      base.accessory = seg.accessory === 'child' ? 'none' : seg.accessory;
      base.child = !!a.child;
    }
    const live = b?.status === 'live';
    const disc = b ? artistOf(b).discipline : 'music';
    switch (a.kind) {
      case 'galleryVisitor': {
        if (sm.moving || a.state !== 'view') return base;
        const sp = ARTWORK_SPOTS[a.seat];
        return { ...base, facing: sp && sp.mount === 'panel' ? -1 : 1 };
      }
      case 'visitor':
      case 'casual':
        if (sm.moving) return base;
        if (a.state === 'seated') {
          if (disc === 'music' || disc === 'dance') return { ...base, pose: live ? (a.id % 3 ? 'cheer' : 'clap') : 'stand', facing: -1 };
          return { ...base, pose: live && disc === 'comedy' && Math.sin(this.t * 2 + a.id) > 0.6 ? 'clap' : 'sit', facing: -1 };
        }
        if (a.state === 'table') return { ...base, pose: 'sit' };
        if (a.state.startsWith('q_bar') || a.state.startsWith('svc_bar')) return { ...base, facing: 1 };
        if (a.state.startsWith('q_box') || a.state.startsWith('svc_box')) return { ...base, facing: -1 };
        if (a.state === 'post_wait') return { ...base, pose: 'clap' };
        return base;
      case 'staff': {
        const m = s.staff.find((x) => x.id === a.staffId);
        const role = m?.role ?? 'boxoffice';
        const shirt = STAFF_SHIRT[role];
        if (sm.moving) return { ...base, shirt, prop: role === 'cleaner' ? 'broom' : 'none' };
        if (role === 'cleaner') return { ...base, shirt, pose: a.variant ? 'sweep' : 'stand', prop: 'broom' };
        if (role === 'technician') return { ...base, shirt, pose: a.variant ? 'work' : 'stand', prop: a.variant ? 'wrench' : 'headset' };
        if (role === 'bartender') return { ...base, shirt, pose: s.counters.bar.serving.some((x) => x) ? 'work' : 'stand', prop: 'tray', facing: -1 };
        return { ...base, shirt, hat: role === 'barmanager' ? '#e76f51' : undefined };
      }
      case 'worker':
        return { ...base, shirt: '#ff9800', hat: '#ffc107', pose: sm.moving ? 'walk' : 'hammer', prop: 'hammer' };
      case 'artist': {
        if (!b) return base;
        const def = artistOf(b);
        const colors = def.colors;
        if (sm.moving) return { ...base, shirt: colors[0] };
        const perform = a.state === 'perform';
        if (def.discipline === 'music') {
          const props: Prop[] = def.members >= 3 ? ['drums', 'mic', 'guitar', 'bass', 'keys'] : ['mic', 'guitar', 'keys', 'bass', 'guitar'];
          const prop = props[a.variant % props.length];
          if (prop === 'drums') return { ...base, shirt: colors[1], pose: 'sit', prop: 'none' };
          return { ...base, shirt: a.variant % 2 ? colors[1] : colors[0], prop, pose: live && perform ? (prop === 'mic' ? 'clap' : 'work') : 'stand', facing: 1 };
        }
        if (def.discipline === 'comedy') return { ...base, shirt: colors[0], prop: 'mic', pose: live ? 'work' : 'stand' };
        if (def.discipline === 'corporate') return { ...base, shirt: '#37474f', prop: 'mic', pose: live && Math.sin(this.t * 1.3) > 0.3 ? 'work' : 'stand' };
        if (def.discipline === 'workshop') return { ...base, shirt: colors[0], pose: live ? 'work' : 'stand', facing: Math.sin(this.t * 0.5) > 0 ? 1 : -1 };
        if (def.discipline === 'dance') return { ...base, shirt: colors[a.variant % 2], pose: live ? (Math.sin(this.t * 3 + a.variant) > 0 ? 'cheer' : 'walk') : 'stand', phase: this.t * 8 };
        return { ...base, shirt: colors[a.variant % 2], prop: a.variant === 0 ? 'cape' : 'none', pose: live ? 'work' : 'stand', facing: Math.sin(this.t * 0.7 + a.variant) > 0 ? 1 : -1 };
      }
      case 'band': {
        const props: Prop[] = ['guitar', 'mic', 'bass'];
        return { ...base, shirt: ['#264653', '#e76f51', '#2a9d8f'][a.variant % 3], prop: sm.moving ? 'none' : props[a.variant % 3], pose: a.state === 'rehearse' ? 'work' : sm.moving ? 'walk' : 'stand' };
      }
    }
    return base;
  }

  // ======================================================================== camadas superiores

  private drawOverhead(s: GameState): void {
    const ctx = this.ctx;
    for (const id of ['hall', 'blackbox'] as RoomId[]) {
      if (!s.rooms[id].built) continue;
      const st = STAGES[id]!;
      const lights = upgradeValue(s, id, 'light');
      const b = liveBookingIn(s, id);
      const live = b?.status === 'live';
      const colors = b ? artistOf(b).colors : ['#ffffff', '#ffffff'];
      const y = st.y0 + 0.4;
      ctx.strokeStyle = '#263238';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(px(st.x0 + 0.3, y), py(st.x0 + 0.3, y, TRUSS_Z));
      ctx.lineTo(px(st.x1 + 0.7, y), py(st.x1 + 0.7, y, TRUSS_Z));
      ctx.stroke();
      const n = 3 + lights * 2;
      for (let i = 0; i < n; i++) {
        const lx = st.x0 + 0.8 + (i * (st.x1 - st.x0)) / Math.max(1, n - 1);
        isoBox(ctx, lx - 0.12, y - 0.1, lx + 0.12, y + 0.1, TRUSS_Z - 9, 9, boxColors('#37474f'));
        ellipse(ctx, px(lx, y + 0.1), py(lx, y + 0.1, TRUSS_Z - 5), 2.6, 2.6, live ? colors[i % 2] : '#78909c');
      }
    }
  }

  private drawLighting(s: GameState): void {
    const ctx = this.ctx;
    const n = this.nightFactor(s);
    if (n > 0) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'multiply';
      const r = Math.round(255 - n * 115), g = Math.round(255 - n * 105), bl = Math.round(255 - n * 60);
      ctx.fillStyle = `rgb(${r},${g},${bl})`;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.restore();
    }
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    if (n > 0) {
      // luz interior das salas
      for (const id of Object.keys(ROOM_RECTS) as RoomId[]) {
        if (!isOperational(s, id)) continue;
        const [cx, cy] = roomCenter(id);
        const r = ROOM_RECTS[id];
        const rad = Math.max(r.x1 - r.x0, r.y1 - r.y0) * 26;
        this.glow(px(cx, cy), py(cx, cy), rad, `rgba(255,196,120,${0.22 * n})`);
      }
      for (const lx of [10.5, 17.5, 24.5]) this.glow(px(lx, 20.3), py(lx, 20.3, 40), 90, `rgba(255,230,160,${0.35 * n})`);
      this.glow(px(3.6, 20.5), py(3.6, 20.5, 50), 70, `rgba(255,80,170,${0.3 * n})`);
      this.glow(px(10.5, 20.3), py(10.5, 20.3, 50), 80, `rgba(255,220,130,${0.25 * n})`);
    }
    // feixes de palco durante o espetáculo
    for (const id of ['hall', 'blackbox'] as RoomId[]) {
      const b = liveBookingIn(s, id);
      if (!b || (b.status !== 'live' && b.status !== 'setup' && b.status !== 'doors')) continue;
      const st = STAGES[id]!;
      const z = STAGE_Z[id]!;
      const def = artistOf(b);
      if (b.status !== 'live' || b.kind !== 'show') {
        this.glow(px((st.x0 + st.x1) / 2, 2.5), py((st.x0 + st.x1) / 2, 2.5, z), 120, 'rgba(255,240,200,0.12)');
        continue;
      }
      const lights = upgradeValue(s, id, 'light');
      const beams = 3 + lights * 2;
      const y = st.y0 + 0.4;
      const amp = 0.25 + 0.15 * (n > 0 ? 1 : 0.4);
      for (let i = 0; i < beams; i++) {
        const lx = st.x0 + 0.8 + (i * (st.x1 - st.x0)) / Math.max(1, beams - 1);
        const sway = lights >= 2 ? Math.sin(this.t * (1 + i * 0.3) + i) * 2.2 : Math.sin(this.t * 0.5 + i) * 0.6;
        const tx = lx + sway, ty = st.y1 + 0.8 + Math.cos(this.t * 0.8 + i) * 0.6;
        const x0 = px(lx, y), y0 = py(lx, y, TRUSS_Z - 6);
        const x1 = px(tx, ty), y1 = py(tx, ty, z);
        const col = def.colors[i % 2];
        const g = ctx.createLinearGradient(x0, y0, x1, y1);
        g.addColorStop(0, hexA(col, amp + 0.2));
        g.addColorStop(1, hexA(col, 0.02));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(x0 - 2, y0);
        ctx.lineTo(x0 + 2, y0);
        ctx.lineTo(x1 + 22, y1);
        ctx.lineTo(x1 - 22, y1);
        ctx.closePath();
        ctx.fill();
        this.glow(x1, y1, 30, hexA(col, amp));
      }
      this.glow(px((st.x0 + st.x1) / 2, st.y1), py((st.x0 + st.x1) / 2, st.y1, z), 200, hexA(def.colors[0], 0.12 + 0.1 * n));
    }
    ctx.restore();
  }

  private glow(x: number, y: number, r: number, color: string): void {
    const ctx = this.ctx;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  private drawLabels(s: GameState): void {
    const ctx = this.ctx;
    const inv = 1 / Math.max(0.55, this.cam.zoom);
    for (const id of Object.keys(ROOM_RECTS) as RoomId[]) {
      const room = s.rooms[id];
      const def = ROOMS[id];
      const [cx, cy] = roomCenter(id);
      const x = px(cx, cy), y = py(cx, cy, id === 'lobby' ? 70 : 60);
      if (!room.built) {
        const cons = room.construction;
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(inv, inv);
        if (cons) {
          const p = Math.min(1, (s.time - cons.startAt) / (cons.endsAt - cons.startAt));
          roundRect(ctx, -60, -26, 120, 34, 9, 'rgba(33,33,33,0.85)');
          label(ctx, `Obras: ${def.short}`, 0, -14, '#fff', 11);
          roundRect(ctx, -50, -5, 100, 7, 3.5, '#555');
          roundRect(ctx, -50, -5, 100 * p, 7, 3.5, '#ffca28');
        } else {
          const can = s.level >= def.reqLevel && (id === 'bar' || id === 'gallery' || s.rooms.bar.built);
          roundRect(ctx, -64, -30, 128, 40, 10, can ? 'rgba(255,202,40,0.95)' : 'rgba(33,33,33,0.82)');
          this.lockIcon(-48, -10, can ? '#3d2c00' : '#ffca28', !can);
          label(ctx, def.name, 8, -16, can ? '#3d2c00' : '#fff', 11);
          label(ctx, can ? `Construir · €${def.buildCost}` : `Nível ${def.reqLevel}`, 8, -1, can ? '#3d2c00' : '#ffca28', 10);
        }
        ctx.restore();
        continue;
      }
      if (id === 'gallery') { this.galleryLabel(s); continue; }
      if (!def.isShowRoom) continue;
      const b = liveBookingIn(s, id) ?? s.bookings.filter((bb) => bb.roomId === id && bb.status === 'scheduled').sort((a1, a2) => a1.startAt - a2.startAt)[0];
      const name = def.name;
      let sub = 'Sem programação';
      let live = false;
      if (b) {
        const a = artistOf(b);
        if (b.status === 'live') { sub = `AO VIVO · ${a.name}`; live = true; }
        else if (b.status === 'doors') sub = `Portas abertas · ${a.name}`;
        else if (b.status === 'setup') sub = `Montagem · ${a.name}`;
        else if (b.status === 'ended') sub = `Saída do público`;
        else sub = `${fmtClock(b.startAt)} · ${a.name} · ${soldTotal(b)}/${b.capacity}`;
      }
      ctx.save();
      const lx = px(ROOM_RECTS[id].x1 + 0.6, ROOM_RECTS[id].y0 + 0.2), ly = py(ROOM_RECTS[id].x1 + 0.6, ROOM_RECTS[id].y0 + 0.2, WALL_H + 30);
      ctx.translate(lx, ly);
      ctx.scale(inv, inv);
      ctx.font = '700 10px system-ui, sans-serif';
      const w = Math.max(90, ctx.measureText(sub).width + 22);
      roundRect(ctx, -w / 2, -26, w, 34, 9, live ? 'rgba(230,57,70,0.92)' : 'rgba(22,24,35,0.82)');
      label(ctx, name, 0, -14, '#fff', 11);
      label(ctx, sub, 0, 0, live ? '#fff' : '#ffd166', 10);
      ctx.restore();
    }
  }

  private lockIcon(x: number, y: number, color: string, locked: boolean): void {
    const ctx = this.ctx;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y - 6, 4.5, Math.PI, locked ? 0 : Math.PI * 1.7);
    ctx.stroke();
    roundRect(ctx, x - 6, y - 6, 12, 10, 2, color);
  }

  private drawIcons(s: GameState): void {
    for (const a of s.agents) {
      if (!a.icon) continue;
      const sm = this.smooth.get(a.id);
      if (!sm) continue;
      drawIcon(this.ctx, px(sm.x, sm.y), py(sm.x, sm.y, stageZ(sm.x, sm.y, s)), a.icon, this.t + a.id);
    }
  }

  private drawTutorial(): void {
    const t = this.tutorialTarget;
    if (!t) return;
    const ctx = this.ctx;
    const x = px(t.x, t.y), y = py(t.x, t.y);
    const bounce = Math.sin(this.t * 5) * 6;
    ctx.strokeStyle = `rgba(255,214,10,${0.5 + 0.4 * Math.sin(this.t * 5)})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(x, y, 22 + bounce, 11 + bounce / 2, 0, 0, Math.PI * 2);
    ctx.stroke();
    const ay = y - 70 + bounce;
    ctx.fillStyle = '#ffd60a';
    ctx.strokeStyle = '#5c4500';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - 9, ay - 18);
    ctx.lineTo(x + 9, ay - 18);
    ctx.lineTo(x + 9, ay);
    ctx.lineTo(x + 17, ay);
    ctx.lineTo(x, ay + 18);
    ctx.lineTo(x - 17, ay);
    ctx.lineTo(x - 9, ay);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  private spawnShowParticles(s: GameState, dt: number): void {
    this.noteTimer -= dt;
    if (this.noteTimer > 0) return;
    this.noteTimer = 0.35;
    for (const id of ['hall', 'blackbox'] as RoomId[]) {
      const b = liveBookingIn(s, id);
      if (!b || b.status !== 'live') continue;
      const def = artistOf(b);
      const st = STAGES[id]!;
      const x = st.x0 + 1 + Math.random() * (st.x1 - st.x0 - 1);
      if (def.discipline === 'music') this.particles.float('note', px(x, 2.5), py(x, 2.5, 50), def.colors[Math.random() < 0.5 ? 0 : 1]);
      else if (b.kind === 'show' && Math.random() < 0.4) this.particles.float('heart', px(x, 6), py(x, 6, 40), '#ff4d6d');
    }
  }
}

// ======================================================================== galeria (desenho das obras)

function artworkColors(style: ArtStyle, c: [string, string, string], i: number): string[] {
  if (style === 'photo') return ['#f1f1f1', ['#3d3d3d', '#7a7a7a', '#b5b5b5'][i % 3], '#222'];
  const r = [c[0], c[1], c[2]];
  return [r[i % 3], r[(i + 1) % 3], r[(i + 2) % 3]];
}

// ======================================================================== utilitários

function doorRoom(x: number, y: number): RoomId | null {
  const d = DOORS.find((dd) => dd.x === x && dd.y === y);
  return d?.room ?? null;
}

function stageZ(x: number, y: number, s: GameState): number {
  for (const id of ['hall', 'blackbox'] as RoomId[]) {
    const st = STAGES[id]!;
    if (s.rooms[id].built && x >= st.x0 && x < st.x1 + 1 && y >= st.y0 && y < st.y1 + 1) return STAGE_Z[id]!;
  }
  return 0;
}

function label(ctx: C, text: string, x: number, y: number, color: string, size: number): void {
  ctx.font = `700 ${size}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const r = ((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t;
  const g = ((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t;
  const bl = (pa & 255) * (1 - t) + (pb & 255) * t;
  return '#' + [r, g, bl].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
}

function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${Math.max(0, Math.min(1, a))})`;
}

