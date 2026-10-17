// Bar: stock, preços, escolha de produto pelos clientes, desperdício e reposição automática.

import { BALANCE } from '../content/balance';
import { PRODUCTS, PRODUCT_BY_ID } from '../content/catalog';
import { SPOTS } from '../content/map';
import { log, type Ctx } from './core';
import { earn, round2, spend, today } from './economy';
import { rand } from './rng';
import { hasRole, productUnlocked, stockMax } from './state';
import type { Agent, GameState, ProductId } from './types';

export function productPriceFactor(state: GameState, id: ProductId): number {
  const p = PRODUCT_BY_ID[id];
  const price = Math.max(0.1, state.bar.products[id].price);
  return Math.min(1.4, Math.pow(p.refPrice / price, BALANCE.barPriceElasticity));
}

/** Fator médio de atratividade dos preços (para a probabilidade de compra). */
export function barAppeal(state: GameState): number {
  let w = 0, pw = 0;
  for (const p of PRODUCTS) {
    if (!productUnlocked(state, p.id)) continue;
    w += p.popularity;
    pw += p.popularity * productPriceFactor(state, p.id);
  }
  return w ? Math.min(1.2, pw / w) : 0;
}

export function chooseProduct(state: GameState): ProductId | null {
  let total = 0;
  const opts: [ProductId, number][] = [];
  for (const p of PRODUCTS) {
    if (!productUnlocked(state, p.id)) continue;
    const w = p.popularity * productPriceFactor(state, p.id);
    opts.push([p.id, w]);
    total += w;
  }
  if (!total) return null;
  let r = rand(state) * total;
  for (const [id, w] of opts) {
    r -= w;
    if (r <= 0) return id;
  }
  return opts[opts.length - 1][0];
}

/** Executa a venda quando o serviço termina. Devolve o produto vendido ou null (sem stock). */
export function serveDrink(ctx: Ctx, agent: Agent): ProductId | null {
  const s = ctx.state;
  let id = chooseProduct(s);
  if (id && s.bar.products[id].stock <= 0) {
    // tenta alternativa com stock
    const alt = PRODUCTS.filter((p) => productUnlocked(s, p.id) && s.bar.products[p.id].stock > 0);
    id = alt.length ? alt[Math.floor(rand(s) * alt.length)].id : null;
  }
  if (!id) {
    if (!s.flags.noStockWarned) {
      s.flags.noStockWarned = true;
      log(ctx, 'O bar ficou sem stock! Compra produtos no painel do Bar.', 'bad');
      ctx.emit({ type: 'sound', name: 'error' });
    }
    return null;
  }
  const ps = s.bar.products[id];
  ps.stock--;
  ps.sold++;
  s.progress.drinksServed++;
  const [x, y] = SPOTS.barCustomer[Math.max(0, agent.slot)] ?? SPOTS.barCustomer[0];
  earn(ctx, 'bar', ps.price, { x, y });
  if (agent.bookingId !== null) {
    const b = s.bookings.find((bb) => bb.id === agent.bookingId);
    if (b) {
      b.stats.barRevenue = round2(b.stats.barRevenue + ps.price);
      b.stats.barCost = round2(b.stats.barCost + PRODUCT_BY_ID[id].unitCost);
      b.stats.drinks++;
    }
  }
  return id;
}

export function buyStock(ctx: Ctx, id: ProductId, qty: number, fee = 0): number {
  const s = ctx.state;
  if (!productUnlocked(s, id)) return 0;
  const ps = s.bar.products[id];
  const room = stockMax(s) - ps.stock;
  const unit = PRODUCT_BY_ID[id].unitCost * (1 + fee);
  const affordable = Math.floor(Math.max(0, s.money) / unit);
  const n = Math.max(0, Math.min(qty, room, affordable));
  if (n <= 0) return 0;
  spend(ctx, 'stock', round2(n * unit));
  ps.stock += n;
  s.flags.noStockWarned = false;
  return n;
}

export function setPrice(state: GameState, id: ProductId, price: number): void {
  state.bar.products[id].price = Math.max(0.5, Math.min(30, round2(price)));
}

/** Rotina diária: desperdício de perecíveis e reposição automática (com gestor de bar). */
export function dailyBar(ctx: Ctx): void {
  const s = ctx.state;
  let waste = 0;
  for (const p of PRODUCTS) {
    if (!p.perishable) continue;
    const ps = s.bar.products[p.id];
    const lost = Math.floor(ps.stock * BALANCE.wasteRate);
    if (lost > 0) {
      ps.stock -= lost;
      waste += lost * p.unitCost;
    }
  }
  today(s).waste = round2(waste);
  if (hasRole(s, 'barmanager')) {
    let bought = 0;
    for (const p of PRODUCTS) {
      if (!productUnlocked(s, p.id)) continue;
      const ps = s.bar.products[p.id];
      const target = Math.min(stockMax(s), s.bar.restockTarget);
      if (ps.stock < target) bought += buyStock(ctx, p.id, target - ps.stock, BALANCE.autoRestockFee);
    }
    if (bought > 0) log(ctx, `Gestor de bar repôs ${bought} unidades.`, 'info', false);
  }
}
