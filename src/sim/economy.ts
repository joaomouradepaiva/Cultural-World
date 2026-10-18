// Contabilidade: todas as entradas e saídas de dinheiro passam por aqui.

import type { Ctx } from './core';
import { dayOf } from './time';
import type { ExpenseCat, GameState, IncomeCat, LedgerDay } from './types';

const LEDGER_DAYS = 30;

export function today(state: GameState): LedgerDay {
  const d = dayOf(state.time);
  let last = state.ledger[state.ledger.length - 1];
  if (!last || last.day !== d) {
    last = { day: d, income: {}, expense: {}, visitors: 0, waste: 0 };
    state.ledger.push(last);
    if (state.ledger.length > LEDGER_DAYS) state.ledger.shift();
  }
  return last;
}

export function earn(ctx: Ctx, cat: IncomeCat, amount: number, at?: { x: number; y: number }): void {
  if (amount <= 0) return;
  const s = ctx.state;
  s.money = round2(s.money + amount);
  const day = today(s);
  day.income[cat] = round2((day.income[cat] ?? 0) + amount);
  if (at) ctx.emit({ type: 'coin', x: at.x, y: at.y, amount });
}

export function spend(ctx: Ctx, cat: ExpenseCat, amount: number): void {
  if (amount <= 0) return;
  const s = ctx.state;
  s.money = round2(s.money - amount);
  const day = today(s);
  day.expense[cat] = round2((day.expense[cat] ?? 0) + amount);
}

export function canAfford(state: GameState, amount: number): boolean {
  return state.money >= amount;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function sumIncome(d: LedgerDay): number {
  return Object.values(d.income).reduce((a, b) => a + (b ?? 0), 0);
}

export function sumExpense(d: LedgerDay): number {
  return Object.values(d.expense).reduce((a, b) => a + (b ?? 0), 0);
}

export const INCOME_LABEL: Record<IncomeCat, string> = {
  tickets: 'Bilheteira',
  bar: 'Bar',
  gallery: 'Galeria (entradas e comissões)',
  rentals: 'Alugueres',
  missions: 'Missões e prémios',
  sponsorship: 'Patrocínios e mecenato',
  premium: 'Experiências premium',
  financing: 'Financiamento (empréstimos)',
  other: 'Outros',
};

export const EXPENSE_LABEL: Record<ExpenseCat, string> = {
  artists: 'Cachets e partilhas',
  salaries: 'Salários',
  rent: 'Renda',
  maintenance: 'Manutenção',
  energy: 'Energia e limpeza',
  stock: 'Stock do bar',
  marketing: 'Marketing',
  construction: 'Obras',
  upgrades: 'Melhorias',
  equipment: 'Equipamento (aluguer, kits)',
  insurance: 'Licenças e seguros',
  refunds: 'Reembolsos',
  exhibitions: 'Montagem de exposições',
  hospitality: 'Catering e camarins',
  premium: 'Experiências premium',
  interest: 'Juros e encargos',
  debt: 'Amortização de empréstimos',
  other: 'Outros',
};
