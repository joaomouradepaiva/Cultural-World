// Personagens estilizadas desenhadas por código (sem assets externos).

import { ellipse, roundRect } from './iso';
import { HAIR, PANTS, SHIRT, SKIN } from './palette';
import type { Look } from '../sim/types';
import type { Accessory } from '../content/segments';

type C = CanvasRenderingContext2D;

export type Pose = 'stand' | 'walk' | 'sit' | 'cheer' | 'clap' | 'work' | 'sweep' | 'hammer';

export type Prop = 'none' | 'guitar' | 'bass' | 'mic' | 'keys' | 'drums' | 'tray' | 'broom' | 'hammer' | 'headset' | 'wrench' | 'cape';

export interface CharOpts {
  look: Look;
  pose: Pose;
  phase: number;
  facing: number;
  shirt?: string;
  prop?: Prop;
  hat?: string;
  player?: boolean;
  t: number;
  accessory?: Accessory;
  child?: boolean;
}

export function drawCharacter(ctx: C, x: number, y: number, o: CharOpts): void {
  if (o.child) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(0.7, 0.7);
    drawCharacter(ctx, 0, 0, { ...o, child: false, accessory: 'none' });
    ctx.restore();
    return;
  }
  const skin = SKIN[o.look.skin % SKIN.length];
  const hair = HAIR[o.look.hair % HAIR.length];
  const shirt = o.shirt ?? SHIRT[o.look.shirt % SHIRT.length];
  const pants = PANTS[o.look.pants % PANTS.length];
  const f = o.facing >= 0 ? 1 : -1;
  const walk = o.pose === 'walk';
  const swing = walk ? Math.sin(o.phase) : 0;
  let bob = walk ? Math.abs(Math.sin(o.phase)) * 1.6 : 0;
  if (o.pose === 'cheer') bob = Math.abs(Math.sin(o.t * 7 + o.phase)) * 5;
  if (o.pose === 'clap') bob = Math.abs(Math.sin(o.t * 5 + o.phase)) * 1.2;
  const sit = o.pose === 'sit';

  // sombra
  ellipse(ctx, x, y, 7, 3.4, 'rgba(0,0,0,0.22)');
  if (o.player) {
    ctx.strokeStyle = 'rgba(255,214,10,0.9)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.ellipse(x, y, 10 + Math.sin(o.t * 4) * 1.2, 5, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  const by = y - bob - (sit ? -3 : 0);
  // pernas
  if (!sit) {
    roundRect(ctx, x - 4 + swing * 1.5, by - 9, 3.2, 9, 1.4, pants);
    roundRect(ctx, x + 0.8 - swing * 1.5, by - 9, 3.2, 9, 1.4, pants);
    ellipse(ctx, x - 2.4 + swing * 1.5, by - 0.4, 2.2, 1.2, '#222');
    ellipse(ctx, x + 2.4 - swing * 1.5, by - 0.4, 2.2, 1.2, '#222');
  } else {
    roundRect(ctx, x - 5, by - 7, 10, 4, 1.5, pants);
  }

  // braços (atrás)
  const armUp = o.pose === 'cheer';
  const armY = by - 18;
  ctx.fillStyle = shade2(shirt);
  if (armUp) {
    roundRect(ctx, x - 8, armY - 9, 3, 10, 1.4, shade2(shirt));
    roundRect(ctx, x + 5, armY - 9, 3, 10, 1.4, shade2(shirt));
    ellipse(ctx, x - 6.5, armY - 9.5, 1.8, 1.8, skin);
    ellipse(ctx, x + 6.5, armY - 9.5, 1.8, 1.8, skin);
  } else {
    const a = walk ? swing * 2 : o.pose === 'clap' ? Math.sin(o.t * 12 + o.phase) * 1.5 : o.pose === 'work' || o.pose === 'sweep' || o.pose === 'hammer' ? Math.sin(o.t * 9) * 2 : 0;
    roundRect(ctx, x - 8, armY + 1 - a, 3, 9, 1.4, shade2(shirt));
    roundRect(ctx, x + 5, armY + 1 + a, 3, 9, 1.4, shade2(shirt));
    ellipse(ctx, x - 6.5, armY + 10 - a, 1.7, 1.7, skin);
    ellipse(ctx, x + 6.5, armY + 10 + a, 1.7, 1.7, skin);
  }
  if (o.accessory === 'backpack') roundRect(ctx, x - f * 7 - 3, by - 19, 6, 9, 2, '#5d4037');
  // tronco
  roundRect(ctx, x - 5.5, by - 20, 11, 12, 3, shirt);
  switch (o.accessory) {
    case 'camera': roundRect(ctx, x - 3, by - 16, 6, 4, 1, '#212121'); ellipse(ctx, x, by - 14, 1.3, 1.3, '#90caf9'); break;
    case 'bandtee': ellipse(ctx, x, by - 15, 2.6, 2.6, '#ffd60a'); break;
    case 'scarf': roundRect(ctx, x - 5.5, by - 21, 11, 3, 1.5, '#e63946'); break;
    case 'tie': ctx.fillStyle = '#c62828'; ctx.beginPath(); ctx.moveTo(x - 1, by - 20); ctx.lineTo(x + 1, by - 20); ctx.lineTo(x + 1.6, by - 12); ctx.lineTo(x, by - 10.5); ctx.lineTo(x - 1.6, by - 12); ctx.closePath(); ctx.fill(); break;
  }
  if (o.prop === 'cape') {
    ctx.fillStyle = '#7b1e3a';
    ctx.beginPath();
    ctx.moveTo(x - 6, by - 19);
    ctx.lineTo(x + 6, by - 19);
    ctx.lineTo(x + 8 + Math.sin(o.t * 3) * 1.5, by - 4);
    ctx.lineTo(x - 8 + Math.sin(o.t * 3 + 1) * 1.5, by - 4);
    ctx.closePath();
    ctx.fill();
  }
  if (o.player) {
    // colete de gestor
    roundRect(ctx, x - 5.5, by - 20, 3, 12, 1.5, '#ffd60a');
    roundRect(ctx, x + 2.5, by - 20, 3, 12, 1.5, '#ffd60a');
  }

  // cabeça
  const hy = by - 26;
  ellipse(ctx, x, hy, 5.6, 5.8, skin);
  drawHair(ctx, x, hy, o.look.hairStyle, hair, f);
  // olhos
  ctx.fillStyle = '#1b1b1b';
  ctx.fillRect(x + f * 1.4 - 0.6, hy - 0.4, 1.2, 1.6);
  ctx.fillRect(x + f * 3.6 - 0.6, hy - 0.4, 1.1, 1.5);
  if (o.accessory === 'beret') ellipse(ctx, x - f * 1.5, hy - 5.5, 5.5, 2.4, '#1d3557');
  if (o.hat) {
    roundRect(ctx, x - 5.5, hy - 7.5, 11, 4, 2, o.hat);
    roundRect(ctx, x + (f > 0 ? 0 : -8), hy - 4.5, 8, 2, 1, o.hat);
  }
  if (o.prop === 'headset' || o.player) {
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(x, hy - 1, 6.2, Math.PI * 1.05, Math.PI * 1.95);
    ctx.stroke();
    ellipse(ctx, x - 5.8, hy, 1.6, 2, '#222');
  }
  drawProp(ctx, x, by, o);
}

function drawHair(ctx: C, x: number, hy: number, style: number, color: string, f: number): void {
  ctx.fillStyle = color;
  switch (style % 5) {
    case 0: // curto
      ctx.beginPath();
      ctx.ellipse(x, hy - 2.2, 5.9, 4.2, 0, Math.PI, Math.PI * 2);
      ctx.fill();
      break;
    case 1: // comprido
      ctx.beginPath();
      ctx.ellipse(x, hy - 2, 6.2, 4.6, 0, Math.PI, Math.PI * 2);
      ctx.fill();
      roundRect(ctx, x - f * 6.2 - (f > 0 ? 0 : 3), hy - 2, 3.2, 9, 1.5, color);
      break;
    case 2: // apanhado
      ctx.beginPath();
      ctx.ellipse(x, hy - 2.2, 5.9, 4.2, 0, Math.PI, Math.PI * 2);
      ctx.fill();
      ellipse(ctx, x - f * 3, hy - 6.5, 2.8, 2.6, color);
      break;
    case 3: // encaracolado
      for (let i = -2; i <= 2; i++) ellipse(ctx, x + i * 2.4, hy - 4 - Math.abs(i) * -0.5, 2.6, 2.6, color);
      break;
    case 4: // rapado / boné
      ctx.beginPath();
      ctx.ellipse(x, hy - 2.6, 5.7, 3.6, 0, Math.PI, Math.PI * 2);
      ctx.fill();
      break;
  }
}

function drawProp(ctx: C, x: number, by: number, o: CharOpts): void {
  const t = o.t;
  switch (o.prop) {
    case 'guitar':
    case 'bass': {
      const strum = Math.sin(t * 14 + o.phase) * 1.2;
      ctx.save();
      ctx.translate(x + 1, by - 13);
      ctx.rotate(-0.5);
      roundRect(ctx, -6, -3, 9, 7, 3.5, o.prop === 'bass' ? '#1d3557' : '#b5651d');
      roundRect(ctx, 2, -1.2, 11, 2.2, 1, '#3d2b1f');
      ctx.restore();
      ellipse(ctx, x + 3, by - 12 + strum, 1.8, 1.8, SKIN[o.look.skin % SKIN.length]);
      break;
    }
    case 'mic':
      ctx.strokeStyle = '#444';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x + 7, by);
      ctx.lineTo(x + 7, by - 22);
      ctx.stroke();
      ellipse(ctx, x + 6, by - 23, 1.8, 1.8, '#222');
      break;
    case 'keys':
      roundRect(ctx, x - 10, by - 12, 20, 4, 1, '#222');
      ctx.fillStyle = '#fafafa';
      for (let i = 0; i < 7; i++) ctx.fillRect(x - 9 + i * 2.7, by - 11.4, 2, 2.4);
      break;
    case 'tray':
      ellipse(ctx, x + 8, by - 13, 4, 1.6, '#cfd8dc');
      roundRect(ctx, x + 6.5, by - 18, 2.4, 4.5, 0.8, '#f4b400');
      break;
    case 'broom':
      ctx.strokeStyle = '#8d6e63';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x + 6, by - 16);
      ctx.lineTo(x + 10 + Math.sin(t * 9) * 2, by + 1);
      ctx.stroke();
      ellipse(ctx, x + 10 + Math.sin(t * 9) * 2, by + 1, 3.4, 1.4, '#c9a227');
      break;
    case 'hammer':
    case 'wrench': {
      const a = Math.sin(t * 10) * 0.8;
      ctx.save();
      ctx.translate(x + 7, by - 12);
      ctx.rotate(a);
      ctx.fillStyle = '#795548';
      ctx.fillRect(-0.8, -8, 1.6, 9);
      ctx.fillStyle = '#90a4ae';
      ctx.fillRect(-3, -9.5, 6, 2.6);
      ctx.restore();
      break;
    }
  }
}

function shade2(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) * 0.82, g = ((n >> 8) & 255) * 0.82, b = (n & 255) * 0.82;
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

/** Bolha de ícone por cima da personagem. */
export function drawIcon(ctx: C, x: number, y: number, icon: string, t: number): void {
  const yy = y - 42 + Math.sin(t * 4) * 1.2;
  roundRect(ctx, x - 8, yy - 8, 16, 15, 5, 'rgba(255,255,255,0.95)', 'rgba(0,0,0,0.15)');
  ctx.beginPath();
  ctx.moveTo(x - 2, yy + 7);
  ctx.lineTo(x + 2, yy + 7);
  ctx.lineTo(x, yy + 10);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.fill();
  switch (icon) {
    case 'ticket':
      roundRect(ctx, x - 5, yy - 3.5, 10, 6, 1.2, '#ff5d73');
      ctx.fillStyle = '#fff';
      ctx.fillRect(x - 1, yy - 3, 0.9, 5);
      break;
    case 'drink':
      ctx.fillStyle = '#f4b400';
      ctx.beginPath();
      ctx.moveTo(x - 4, yy - 4);
      ctx.lineTo(x + 4, yy - 4);
      ctx.lineTo(x + 3, yy + 4);
      ctx.lineTo(x - 3, yy + 4);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillRect(x - 4, yy - 5, 8, 2);
      break;
    case 'heart':
      ctx.fillStyle = '#ff4d6d';
      ctx.beginPath();
      ctx.moveTo(x, yy + 4);
      ctx.bezierCurveTo(x - 7, yy - 1, x - 3, yy - 7, x, yy - 3);
      ctx.bezierCurveTo(x + 3, yy - 7, x + 7, yy - 1, x, yy + 4);
      ctx.fill();
      break;
    case 'angry':
      ellipse(ctx, x, yy, 5, 5, '#ff6b35');
      ctx.fillStyle = '#222';
      ctx.fillRect(x - 3, yy - 2, 2, 1);
      ctx.fillRect(x + 1, yy - 2, 2, 1);
      ctx.fillRect(x - 2, yy + 2, 4, 1);
      break;
    case 'sad':
      ellipse(ctx, x, yy, 5, 5, '#8ecae6');
      ctx.fillStyle = '#222';
      ctx.fillRect(x - 2.5, yy - 1.5, 1.4, 1.4);
      ctx.fillRect(x + 1.1, yy - 1.5, 1.4, 1.4);
      ctx.beginPath();
      ctx.arc(x, yy + 3.5, 2, Math.PI * 1.1, Math.PI * 1.9);
      ctx.strokeStyle = '#222';
      ctx.stroke();
      break;
    case 'note':
      ctx.fillStyle = '#7b2cbf';
      ellipse(ctx, x - 1.5, yy + 3, 2.4, 1.8, '#7b2cbf');
      ctx.fillRect(x + 0.4, yy - 5, 1.3, 8);
      ctx.fillRect(x + 0.4, yy - 5, 4, 1.5);
      break;
  }
}
