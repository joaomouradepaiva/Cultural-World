// Entrada: rato, toque (arrastar/pinça) e teclado.

import type { Renderer } from '../render/renderer';

export interface InputHandlers {
  tap(sx: number, sy: number): void;
  key(code: string): void;
  move(dx: number, dy: number, dt: number): void;
  gesture(): void;
}

export class Input {
  private pointers = new Map<number, { x: number; y: number; sx: number; sy: number }>();
  private dragging = false;
  private pinchDist = 0;
  private held = new Set<string>();

  constructor(private canvas: HTMLCanvasElement, private r: Renderer, private hnd: InputHandlers) {
    canvas.addEventListener('pointerdown', (e) => this.down(e));
    canvas.addEventListener('pointermove', (e) => this.pmove(e));
    canvas.addEventListener('pointerup', (e) => this.up(e));
    canvas.addEventListener('pointercancel', (e) => this.pointers.delete(e.pointerId));
    canvas.addEventListener('pointerleave', () => { this.r.hoverTile = null; });
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const f = Math.exp(-e.deltaY * 0.0015);
      this.r.cam.zoomAt(f, e.offsetX, e.offsetY, this.r.w, this.r.h);
    }, { passive: false });
    canvas.addEventListener('dblclick', () => this.r.cam.follow(true));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement) return;
      const k = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
        this.held.add(k);
        e.preventDefault();
        return;
      }
      if (e.key === ' ') e.preventDefault();
      this.hnd.key(k);
    });
    window.addEventListener('keyup', (e) => this.held.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.held.clear());
  }

  update(dt: number): void {
    if (!this.held.size) return;
    let sx = 0, sy = 0;
    if (this.held.has('w') || this.held.has('arrowup')) sy -= 1;
    if (this.held.has('s') || this.held.has('arrowdown')) sy += 1;
    if (this.held.has('a') || this.held.has('arrowleft')) sx -= 1;
    if (this.held.has('d') || this.held.has('arrowright')) sx += 1;
    if (!sx && !sy) return;
    // direção no ecrã → direção na grelha isométrica
    const dx = sx + sy, dy = sy - sx;
    this.hnd.move(dx, dy, dt);
  }

  private down(e: PointerEvent): void {
    this.hnd.gesture();
    this.canvas.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY, sx: e.offsetX, sy: e.offsetY });
    if (this.pointers.size === 1) this.dragging = false;
    if (this.pointers.size === 2) this.pinchDist = this.dist();
  }

  private pmove(e: PointerEvent): void {
    const p = this.pointers.get(e.pointerId);
    if (!p) {
      if (e.pointerType === 'mouse') {
        const [x, y] = this.r.screenToTile(e.offsetX, e.offsetY);
        this.r.hoverTile = [Math.floor(x), Math.floor(y)];
      }
      return;
    }
    const dx = e.offsetX - p.x, dy = e.offsetY - p.y;
    p.x = e.offsetX;
    p.y = e.offsetY;
    if (this.pointers.size === 2) {
      const d = this.dist();
      if (this.pinchDist > 0) {
        const [a, b] = [...this.pointers.values()];
        this.r.cam.zoomAt(d / this.pinchDist, (a.x + b.x) / 2, (a.y + b.y) / 2, this.r.w, this.r.h);
      }
      this.pinchDist = d;
      this.r.cam.pan(dx / 2, dy / 2);
      this.dragging = true;
      return;
    }
    if (!this.dragging && Math.hypot(e.offsetX - p.sx, e.offsetY - p.sy) > 8) this.dragging = true;
    if (this.dragging) this.r.cam.pan(dx, dy);
  }

  private up(e: PointerEvent): void {
    const p = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);
    if (p && !this.dragging && this.pointers.size === 0) this.hnd.tap(e.offsetX, e.offsetY);
    if (this.pointers.size === 0) this.dragging = false;
  }

  private dist(): number {
    const [a, b] = [...this.pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }
}
