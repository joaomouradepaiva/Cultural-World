// Câmara com movimento suave, zoom e foco automático.

import { px, py } from './iso';

export class Camera {
  x = 0;
  y = 0;
  zoom = 0.8;
  private tx = 0;
  private ty = 0;
  private tz = 0.8;
  private following = false;
  minZoom = 0.3;
  maxZoom = 2.2;

  /** Limites do mundo em pixels de ecrã (a zoom 1). */
  bounds = { x0: -800, x1: 1300, y0: -150, y1: 950 };

  setNow(x: number, y: number, zoom = this.zoom): void {
    this.x = this.tx = x;
    this.y = this.ty = y;
    this.zoom = this.tz = zoom;
  }

  focusTile(x: number, y: number, zoom?: number): void {
    this.tx = px(x, y);
    this.ty = py(x, y) - 20;
    if (zoom) this.tz = zoom;
    this.following = false;
  }

  follow(on: boolean): void {
    this.following = on;
  }

  get isFollowing(): boolean {
    return this.following;
  }

  pan(dxScreen: number, dyScreen: number): void {
    this.x -= dxScreen / this.zoom;
    this.y -= dyScreen / this.zoom;
    this.tx = this.x;
    this.ty = this.y;
    this.following = false;
    this.clamp();
  }

  zoomAt(factor: number, sx: number, sy: number, vw: number, vh: number): void {
    const nz = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom * factor));
    // manter o ponto sob o cursor fixo
    const wx = this.x + (sx - vw / 2) / this.zoom;
    const wy = this.y + (sy - vh / 2) / this.zoom;
    this.zoom = this.tz = nz;
    this.x = this.tx = wx - (sx - vw / 2) / nz;
    this.y = this.ty = wy - (sy - vh / 2) / nz;
    this.clamp();
  }

  update(dt: number, followTarget?: { x: number; y: number }): void {
    if (this.following && followTarget) {
      this.tx = px(followTarget.x, followTarget.y);
      this.ty = py(followTarget.x, followTarget.y) - 20;
    }
    const k = 1 - Math.exp(-dt * 6);
    this.x += (this.tx - this.x) * k;
    this.y += (this.ty - this.y) * k;
    this.zoom += (this.tz - this.zoom) * k;
    this.clamp();
  }

  private clamp(): void {
    const b = this.bounds;
    this.x = Math.max(b.x0, Math.min(b.x1, this.x));
    this.y = Math.max(b.y0, Math.min(b.y1, this.y));
  }
}
