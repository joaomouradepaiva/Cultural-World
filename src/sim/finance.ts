// Tesouraria e financiamento: empréstimos com prestações automáticas, descoberto bancário,
// projeção de caixa a 14 dias e comparação comprar vs. alugar.

import { BALANCE } from '../content/balance';
import { KIT_BY_ID, type KitId } from '../content/equipment';
import { artistOf } from '../content/artists';
import { log, newId, type Ctx } from './core';
import { canAfford, earn, round2, spend, sumExpense, sumIncome } from './economy';
import { artistPayFor, forecast, type BookingRequest } from './bookings';
import { planDailyCost } from './maintenance';
import { dailyCost } from './staff';
import { equipment, roomsMaintenance } from './state';
import { dayOf, MIN_PER_DAY, weekdayOf } from './time';
import { activeSponsorship } from './sponsors';
import type { Booking, GameState, Loan, LoanPurpose } from './types';

export const WEEKS_PER_YEAR = 360 / 7;
export const LOAN_TERMS = [8, 16, 26, 52];
export const LOAN_PURPOSES: Record<LoanPurpose, { name: string; rate: number; desc: string }> = {
  works: { name: 'Obras e melhorias', rate: 0.06, desc: 'Plateia, som, luz, camarins…' },
  equipment: { name: 'Equipamento', rate: 0.07, desc: 'Kits móveis do armazém.' },
  expansion: { name: 'Expansão', rate: 0.08, desc: 'Capital para crescer (marketing, equipa, temporadas).' },
  rooms: { name: 'Novas salas', rate: 0.055, desc: 'Construção de espaços (Black Box, galeria…).' },
};
export const MAX_LOANS = 3;
export const EARLY_REPAY_FEE = 0.01;
/** juro diário do descoberto (saldo negativo) */
export const OVERDRAFT_DAILY = 0.01;

export function debt(s: GameState): number {
  return round2(s.loans.filter((l) => l.status === 'active').reduce((t, l) => t + l.remaining, 0));
}

/** Limite de crédito: cresce com o nível e a reputação. */
export function creditLimit(s: GameState): number {
  return Math.round(3000 + s.level * 2000 + s.rep.general * 40);
}

export function installmentFor(principal: number, rate: number, weeks: number): number {
  const r = rate / WEEKS_PER_YEAR;
  if (r === 0) return round2(principal / weeks);
  return round2((principal * r) / (1 - Math.pow(1 + r, -weeks)));
}

export interface LoanQuote { purpose: LoanPurpose; principal: number; weeks: number; rate: number; installment: number; total: number; interest: number }

/** Condições claras: taxa anual = taxa do fim + risco (dívida face ao limite) − reputação. */
export function loanQuote(s: GameState, purpose: LoanPurpose, principal: number, weeks: number): LoanQuote {
  const ratio = Math.min(1.5, (debt(s) + principal) / creditLimit(s));
  const rate = Math.round((LOAN_PURPOSES[purpose].rate + 0.04 * ratio - 0.02 * (s.rep.general / 100)) * 1000) / 1000;
  const installment = installmentFor(principal, rate, weeks);
  const total = round2(installment * weeks);
  return { purpose, principal, weeks, rate, installment, total, interest: round2(total - principal) };
}

export function loanError(s: GameState, purpose: LoanPurpose, principal: number, weeks: number): string | null {
  if (!LOAN_PURPOSES[purpose]) return 'Finalidade inválida.';
  if (!LOAN_TERMS.includes(weeks)) return 'Prazo inválido.';
  if (s.level < 2) return 'O banco só empresta a partir do nível 2.';
  if (s.loans.filter((l) => l.status === 'active').length >= MAX_LOANS) return `Máximo de ${MAX_LOANS} empréstimos ativos.`;
  if (principal < 500) return 'Mínimo €500.';
  const room = creditLimit(s) - debt(s);
  if (principal > room) return `Acima do limite de crédito: podes pedir até €${Math.max(0, Math.floor(room))}.`;
  if (s.money < 0) return 'Com saldo negativo o banco não empresta.';
  return null;
}

export function takeLoan(ctx: Ctx, purpose: LoanPurpose, principal: number, weeks: number): Loan | null {
  const s = ctx.state;
  if (loanError(s, purpose, principal, weeks)) return null;
  const q = loanQuote(s, purpose, principal, weeks);
  const loan: Loan = {
    id: newId(s), purpose, principal, rate: q.rate, weeks, installment: q.installment, remaining: principal, paidWeeks: 0,
    nextDueDay: dayOf(s.time) + 7, interestPaid: 0, takenAt: s.time, status: 'active',
  };
  s.loans.push(loan);
  earn(ctx, 'financing', principal);
  log(ctx, `Empréstimo de €${principal} (${LOAN_PURPOSES[purpose].name}) a ${(q.rate * 100).toFixed(1)}%/ano: ${weeks} prestações semanais de €${q.installment}.`, 'money');
  return loan;
}

/** Paga uma prestação: juro sobre o capital em dívida + amortização. */
function payInstallment(ctx: Ctx, l: Loan): void {
  const interest = round2(l.remaining * (l.rate / WEEKS_PER_YEAR));
  const last = l.paidWeeks + 1 >= l.weeks;
  const principalPart = last ? l.remaining : Math.min(l.remaining, round2(l.installment - interest));
  spend(ctx, 'interest', interest);
  spend(ctx, 'debt', principalPart);
  l.interestPaid = round2(l.interestPaid + interest);
  l.remaining = round2(l.remaining - principalPart);
  l.paidWeeks++;
  l.nextDueDay += 7;
  if (l.remaining <= 0.009) {
    l.remaining = 0;
    l.status = 'repaid';
    log(ctx, `Empréstimo liquidado (juros totais €${l.interestPaid}).`, 'good');
  }
}

export function earlyRepayCost(l: Loan): number {
  return round2(l.remaining * (1 + EARLY_REPAY_FEE));
}

export function repayLoan(ctx: Ctx, id: number): boolean {
  const s = ctx.state;
  const l = s.loans.find((x) => x.id === id && x.status === 'active');
  if (!l || !canAfford(s, earlyRepayCost(l))) return false;
  const fee = round2(l.remaining * EARLY_REPAY_FEE);
  spend(ctx, 'debt', l.remaining);
  spend(ctx, 'interest', fee);
  l.interestPaid = round2(l.interestPaid + fee);
  l.remaining = 0;
  l.status = 'repaid';
  log(ctx, `Amortização antecipada: empréstimo liquidado (comissão €${fee}).`, 'good');
  return true;
}

/** Fecho do dia: prestações vencidas e juros de descoberto. */
export function dailyFinance(ctx: Ctx): void {
  const s = ctx.state;
  const d = dayOf(s.time);
  for (const l of s.loans) if (l.status === 'active' && d + 1 >= l.nextDueDay) payInstallment(ctx, l);
  if (s.money < 0) {
    const fee = Math.max(1, round2(-s.money * OVERDRAFT_DAILY));
    spend(ctx, 'interest', fee);
    log(ctx, `⚠️ Saldo negativo: juros de descoberto de €${fee}.`, 'bad', false);
  }
}

// ------------------------------------------------------------ tesouraria

export function requestOf(b: Booking): BookingRequest {
  return { roomId: b.roomId, artistId: b.artistId, startAt: b.startAt, ticketPrice: b.ticketPrice, contractType: b.contract.type, marketing: 'none', kind: b.kind, custom: b.custom, participants: b.participants, contract: b.contract, premium: b.premium };
}

/** Custos fixos de um dia (renda, manutenção, equipa, plano preventivo). */
export function fixedDaily(s: GameState): number {
  return round2(BALANCE.dailyRent + roomsMaintenance(s) + s.staff.reduce((t, m) => t + dailyCost(m), 0) + (s.flags.maintenancePlan ? planDailyCost(s) : 0));
}

export interface TreasuryDay { day: number; income: number; expense: number; balance: number }

export interface Treasury {
  balance: number;
  expectedIncome: number;
  futureExpenses: number;
  commitments: number;
  operatingResult: number;
  debt: number;
  cashflow: number;
  days: TreasuryDay[];
  lowest: TreasuryDay;
}

/** Projeção a N dias: eventos marcados (receitas e custos ainda por realizar), custos fixos e prestações. */
export function treasury(s: GameState, horizon = 14): Treasury {
  const today = dayOf(s.time);
  const days: TreasuryDay[] = [];
  let bal = s.money, inc = 0, exp = 0, artistOwed = 0;
  const fixed = fixedDaily(s);
  for (let i = 0; i < horizon; i++) {
    const d = today + i;
    let di = 0, de = 0;
    for (const b of s.bookings) {
      if (dayOf(b.startAt) !== d || (b.status !== 'scheduled' && b.status !== 'setup' && b.status !== 'doors' && b.status !== 'live')) continue;
      const f = forecast(s, requestOf(b));
      const gross = b.contract.type === 'rental' ? 0 : f.attendance * b.ticketPrice;
      di += Math.max(0, gross - b.stats.ticketRevenue) + f.rent + f.bar + (b.stats.premiumRevenue ? 0 : f.premium.revenue);
      if (b.kind === 'show' && activeSponsorship(s, d)) di += activeSponsorship(s, d)!.perEvent;
      const owed = Math.max(0, artistPayFor(b.contract, gross) - b.stats.upfrontFee);
      artistOwed += owed;
      // custos variáveis ainda por pagar (o marketing e o cachet fixo já saíram)
      de += owed + (f.costs - b.stats.marketingCost) + f.premium.cost;
    }
    de += fixed;
    if (weekdayOf(d * MIN_PER_DAY) === 6) de += BALANCE.weeklyInsurance;
    for (const l of s.loans) {
      if (l.status !== 'active') continue;
      const k = (d + 1 - l.nextDueDay) / 7;
      if (k >= 0 && Number.isInteger(k) && l.paidWeeks + k < l.weeks) de += l.installment;
    }
    inc += di; exp += de; bal += di - de;
    days.push({ day: d, income: round2(di), expense: round2(de), balance: round2(bal) });
  }
  const closed = s.ledger.filter((l) => l.day < today).slice(-7);
  const op = closed.reduce((t, l) => t + sumIncome(l) - (l.income.financing ?? 0) - (sumExpense(l) - (l.expense.debt ?? 0)), 0);
  const cash = closed.reduce((t, l) => t + sumIncome(l) - sumExpense(l), 0);
  const loanLeft = s.loans.filter((l) => l.status === 'active').reduce((t, l) => t + (l.weeks - l.paidWeeks) * l.installment, 0);
  return {
    balance: s.money, expectedIncome: round2(inc), futureExpenses: round2(exp), commitments: round2(artistOwed + loanLeft),
    operatingResult: round2(op), debt: debt(s), cashflow: round2(cash), days,
    lowest: days.reduce((m, x) => (x.balance < m.balance ? x : m), days[0]),
  };
}

// ------------------------------------------------------------ investimento: comprar vs. alugar

/** Estimativa (sem garantia) do retorno de um kit, a partir dos eventos das últimas e próximas 2 semanas. */
export function kitPayback(s: GameState, kit: KitId) {
  const d = KIT_BY_ID[kit];
  const dim = d.covers;
  const today = dayOf(s.time);
  const window = s.bookings.filter((b) => b.status !== 'cancelled' && Math.abs(dayOf(b.startAt) - today) <= 14);
  let uses = 0;
  if (dim) for (const b of window) { const a = artistOf(b); if (a.rider[dim] > equipment(s, b.roomId)[dim]) uses++; }
  else uses = window.filter((b) => b.kind !== 'show').length;
  const perWeek = uses / 4;
  const rentPerUse = dim ? BALANCE.rentalPerLevel[dim] : 0;
  const wearPerUse = (d.wear * d.cost) / 250;
  const savingPerWeek = round2(perWeek * (rentPerUse - wearPerUse));
  const weeks = savingPerWeek > 0 ? Math.ceil(d.cost / savingPerWeek) : null;
  const financed = loanQuote(s, 'equipment', d.cost, 26);
  return { usesPerWeek: round2(perWeek), rentPerUse, wearPerUse: round2(wearPerUse), savingPerWeek, paybackWeeks: weeks, financedInterest: financed.interest };
}
