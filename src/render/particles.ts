// Partículas e textos flutuantes (moedas, confetti, notas musicais, pó de limpeza).

import { ellipse } from './iso';

type C = CanvasRenderingContext2D;

export interface Particle {
  kind: 'coin' | 'star' | 'confetti' | 'dust' | 'note' | 'heart';
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  text?: string;
  amount?: number;
  size: number;
}

const CONFETTI = ['#ff5d73', '#ffd60a', '#3ccf91', '#4f86f7', '#9b5de5', '#ff8c42'];

export class Particles {
  list: Particle[] = [];

  coin(x: number, y: number, amount: number): void {
    // agrupa moedas próximas para evitar ruído visual
    const near = this.list.find((p) => p.kind === 'coin' && p.life < 0.35 && Math.abs(p.x - x) < 20 && Math.abs(p.y - y) < 20);
    if (near) {
      near.amount = (near.amount ?? 0) + amount;
      near.text = `+€${fmt(near.amount)}`;
      return;
    }
    this.list.push({ kind: 'coin', x, y: y - 30, vx: 0, vy: -26, life: 0, max: 1.6, color: '#ffd60a', text: `+€${fmt(amount)}`, amount, size: 1 });
  }

  burst(kind: 'star' | 'confetti' | 'dust', x: number, y: number, n: number): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = kind === 'dust' ? 10 + Math.random() * 15 : 40 + Math.random() * 90;
      this.list.push({
        kind, x, y: y - (kind === 'dust' ? 2 : 20), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (kind === 'dust' ? 10 : 60),
        life: 0, max: kind === 'dust' ? 0.7 : 1.4 + Math.random() * 0.6,
        color: kind === 'dust' ? '#d7ccc8' : kind === 'star' ? '#ffd60a' : CONFETTI[i % CONFETTI.length], size: kind === 'dust' ? 3 + Math.random() * 3 : 2 + Math.random() * 2.5,
      });
    }
  }

  float(kind: 'note' | 'heart', x: number, y: number, color: string): void {
    this.list.push({ kind, x, y, vx: (Math.random() - 0.5) * 20, vy: -30 - Math.random() * 20, life: 0, max: 1.8, color, size: 1 });
  }

  update(dt: number): void {
    for (const p of this.list) {
      p.life += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.kind === 'confetti' || p.kind === 'star') p.vy += 160 * dt;
      if (p.kind === 'coin') p.vy *= 0.97;
      if (p.kind === 'note' || p.kind === 'heart') p.vx += Math.sin(p.life * 6) * 2;
    }
    this.list = this.list.filter((p) => p.life < p.max);
  }

  draw(ctx: C): void {
    for (const p of this.list) {
      const a = 1 - p.life / p.max;
      ctx.globalAlpha = Math.min(1, a * 1.6);
      switch (p.kind) {
        case 'coin':
          ctx.font = 'bold 13px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.lineWidth = 3;
          ctx.strokeStyle = 'rgba(40,30,0,0.75)';
          ctx.strokeText(p.text!, p.x, p.y);
          ctx.fillStyle = p.color;
          ctx.fillText(p.text!, p.x, p.y);
          break;
        case 'confetti':
          ctx.fillStyle = p.color;
          ctx.fillRect(p.x, p.y, p.size * 1.6, p.size);
          break;
        case 'star':
          drawStar(ctx, p.x, p.y, p.size * 1.6, p.color);
          break;
        case 'dust':
          ellipse(ctx, p.x, p.y, p.size * (1 + p.life), p.size * 0.6 * (1 + p.life), p.color);
          break;
        case 'note':
          ellipse(ctx, p.x - 2, p.y + 4, 3, 2.2, p.color);
          ctx.fillStyle = p.color;
          ctx.fillRect(p.x, p.y - 6, 1.6, 10);
          ctx.fillRect(p.x, p.y - 6, 5, 1.8);
          break;
        case 'heart':
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y + 4);
          ctx.bezierCurveTo(p.x - 6, p.y - 1, p.x - 3, p.y - 6, p.x, p.y - 2.5);
          ctx.bezierCurveTo(p.x + 3, p.y - 6, p.x + 6, p.y - 1, p.x, p.y + 4);
          ctx.fill();
          break;
      }
    }
    ctx.globalAlpha = 1;
  }
}

function drawStar(ctx: C, x: number, y: number, r: number, color: string): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 === 0 ? r : r * 0.45;
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.00$/, '');
}
