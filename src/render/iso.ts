// Projeção isométrica 2:1 e primitivas de desenho.

export const TW = 64;
export const TH = 32;
export const HW = TW / 2;
export const HH = TH / 2;

export function px(x: number, y: number): number {
  return (x - y) * HW;
}

export function py(x: number, y: number, z = 0): number {
  return (x + y) * HH - z;
}

export function unproject(sx: number, sy: number): [number, number] {
  const a = sx / HW, b = sy / HH;
  return [(a + b) / 2, (b - a) / 2];
}

type C = CanvasRenderingContext2D;

export function poly(ctx: C, pts: number[], fill: string, stroke?: string, lw = 1): void {
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw;
    ctx.stroke();
  }
}

/** Losango de chão para a área [x0,x1]×[y0,y1]. */
export function floorQuad(ctx: C, x0: number, y0: number, x1: number, y1: number, fill: string, z = 0, stroke?: string): void {
  poly(ctx, [px(x0, y0), py(x0, y0, z), px(x1, y0), py(x1, y0, z), px(x1, y1), py(x1, y1, z), px(x0, y1), py(x0, y1, z)], fill, stroke);
}

export interface BoxColors { top: string; left: string; right: string; stroke?: string }

/** Caixa isométrica: base [x0,x1]×[y0,y1] à cota z0, altura h (px). */
export function isoBox(ctx: C, x0: number, y0: number, x1: number, y1: number, z0: number, h: number, c: BoxColors): void {
  const zt = z0 + h;
  // face frontal-esquerda (y = y1)
  poly(ctx, [px(x0, y1), py(x0, y1, z0), px(x1, y1), py(x1, y1, z0), px(x1, y1), py(x1, y1, zt), px(x0, y1), py(x0, y1, zt)], c.left, c.stroke, 0.6);
  // face frontal-direita (x = x1)
  poly(ctx, [px(x1, y0), py(x1, y0, z0), px(x1, y1), py(x1, y1, z0), px(x1, y1), py(x1, y1, zt), px(x1, y0), py(x1, y0, zt)], c.right, c.stroke, 0.6);
  // topo
  poly(ctx, [px(x0, y0), py(x0, y0, zt), px(x1, y0), py(x1, y0, zt), px(x1, y1), py(x1, y1, zt), px(x0, y1), py(x0, y1, zt)], c.top, c.stroke, 0.6);
}

/** Face vertical voltada para +y (parede ao fundo, vista de frente). */
export function faceY(ctx: C, x0: number, x1: number, y: number, z0: number, z1: number, fill: string): void {
  poly(ctx, [px(x0, y), py(x0, y, z0), px(x1, y), py(x1, y, z0), px(x1, y), py(x1, y, z1), px(x0, y), py(x0, y, z1)], fill);
}

/** Face vertical voltada para +x (parede à esquerda, vista de frente). */
export function faceX(ctx: C, x: number, y0: number, y1: number, z0: number, z1: number, fill: string): void {
  poly(ctx, [px(x, y0), py(x, y0, z0), px(x, y1), py(x, y1, z0), px(x, y1), py(x, y1, z1), px(x, y0), py(x, y0, z1)], fill);
}

export function shade(hex: string, f: number): string {
  if (!hex.startsWith('#') || hex.length !== 7) return hex;
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (f >= 0) { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
  else { r *= 1 + f; g *= 1 + f; b *= 1 + f; }
  return '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}

export function boxColors(base: string, stroke?: string): BoxColors {
  return { top: shade(base, 0.12), left: shade(base, -0.12), right: shade(base, -0.3), stroke };
}

export function ellipse(ctx: C, x: number, y: number, rx: number, ry: number, fill: string): void {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}

export function roundRect(ctx: C, x: number, y: number, w: number, h: number, r: number, fill: string, stroke?: string): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
}
