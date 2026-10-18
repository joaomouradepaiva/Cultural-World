// Painéis de gestão. Toda a informação mostrada vem do estado ou de funções do motor (sem valores inventados).

import { ARTIST_BY_ID, DISCIPLINE_ICON, DISCIPLINE_LABEL, artistOf, type ArtistDef } from '../content/artists';
import { BALANCE, levelTitle, xpForNextLevel } from '../content/balance';
import { CONTRACTS, MARKETING, PRODUCTS, ROLES, ROLE_ORDER, STOCK_STEP } from '../content/catalog';
import { MISSIONS } from '../content/missions';
import { ROOMS, ROOM_ORDER, BASE_COMFORT_CAPACITY } from '../content/rooms';
import { artistDates, artistUnlocked, contractTerms, forecast, occupancy, riderGap, soldTotal, validateBooking, type BookingRequest } from '../sim/bookings';
import { proposalErrors, proposalRequest } from '../sim/proposals';
import { availableArtists, isSceneArtist } from '../sim/scene';
import { activeExhibitions, exhibitionForecast, exhibitionOn, validateExhibition, visualUnlocked, type ExhibitionRequest } from '../sim/gallery';
import { EXHIBITION_DAYS, GALLERY_CLOSE, GALLERY_OPEN, VISUAL_ARTISTS, VISUAL_BY_ID } from '../content/visualArtists';
import { exhibitionRequestOf } from '../sim/proposals';
import { SEGMENTS, SEGMENT_IDS, type SegmentId } from '../content/segments';
import { SEASON_DURATIONS, THEMES, THEME_BY_ID, type ThemeId } from '../content/seasons';
import { objectiveValue, passDemand, passSeatsFor, seasonBookings, seasonFor, seasonIndicators, seasonOpen, validateSeason, type SeasonRequest } from '../sim/seasons';
import { YEAR_SEASON_LABEL, yearSeason } from '../sim/experience';
import { productPriceFactor } from '../sim/bar';
import { buildError, upgradeError } from '../sim/construction';
import { EXPENSE_LABEL, INCOME_LABEL, sumExpense, sumIncome } from '../sim/economy';
import { activeMissions } from '../sim/progression';
import type { Simulation } from '../sim/sim';
import { hireError, maxStaff, salaryFor } from '../sim/staff';
import { comfortCapacity, equipment, isOperational, productUnlocked, roomCapacity, stockMax, upgradeValue, liveBookingIn } from '../sim/state';
import { at, dayOf, fmtClock, fmtDayShort, fmtDuration, MIN_PER_DAY, WEEKDAYS_SHORT, weekdayOf } from '../sim/time';
import type { Booking, ContractType, Exhibition, ExpenseCat, IncomeCat, MarketingId, Proposal, RoomId, Season } from '../sim/types';
import { confirmButton, eur, h, meter, signedEur, stars } from './dom';

export type PanelName = 'program' | 'inbox' | 'room' | 'build' | 'staff' | 'finance' | 'missions' | 'menu' | 'result' | 'levelup' | 'decision' | 'help';

export interface BookingDraft {
  roomId: RoomId;
  artistId: string | null;
  day: number;
  hour: number;
  price: number;
  contract: ContractType;
  marketing: MarketingId;
}

export interface GalleryDraft {
  artistId: string | null;
  startDay: number;
  days: number;
  entryPrice: number;
}

export interface UICtx {
  sim: Simulation;
  draft: BookingDraft;
  gdraft: GalleryDraft;
  tab: Record<string, string>;
  open(name: PanelName, arg?: unknown): void;
  close(): void;
  refresh(): void;
  play(name: 'click' | 'error' | 'coin'): void;
  save(): void;
  exportSave(): void;
  importSave(): void;
  newGame(): void;
  toggleMute(): boolean;
  muted(): boolean;
}

export interface PanelView { title: string; body: HTMLElement; tabs?: { id: string; label: string }[]; tabKey?: string; modal?: boolean }

// ============================================================ helpers

function tabs(ctx: UICtx, key: string, list: { id: string; label: string }[]): string {
  if (!ctx.tab[key] || !list.some((t) => t.id === ctx.tab[key])) ctx.tab[key] = list[0].id;
  return ctx.tab[key];
}

function act(ctx: UICtx, fn: () => unknown): () => void {
  return () => {
    const r = fn();
    ctx.play(r === false || r === null ? 'error' : 'click');
    ctx.refresh();
  };
}

function section(title: string, ...children: (Node | string | null | false)[]): HTMLElement {
  return h('div', { class: 'section' }, h('h3', null, title), ...children);
}

function kv(rows: [string, string, string?][]): HTMLElement {
  return h('div', { class: 'kv' }, ...rows.flatMap(([k, v, cls]) => [h('div', { class: cls ?? '' }, k), h('div', { class: `v ${cls ?? ''}` }, v)]));
}

function statusLabel(b: Booking): string {
  return { scheduled: 'Agendado', setup: 'Montagem', doors: 'Portas abertas', live: 'Ao vivo', ended: 'A terminar', settled: 'Concluído', cancelled: 'Cancelado' }[b.status];
}

function riderText(r: { sound: number; light: number; stage: number }): string {
  return `Som ${r.sound} · Luz ${r.light} · Palco ${r.stage}`;
}

// ============================================================ programação

export function programPanel(ctx: UICtx): PanelView {
  const s = ctx.sim.state;
  const list = [{ id: 'calendar', label: '🗓️ Calendário' }, { id: 'new', label: '➕ Nova marcação' }, { id: 'seasons', label: '🎭 Temporadas' }, { id: 'agenda', label: '📋 Lista' }, { id: 'history', label: '📊 Resultados' }];
  const tab = tabs(ctx, 'program', list);
  let body: HTMLElement;
  if (tab === 'calendar') body = calendarView(ctx);
  else if (tab === 'seasons') body = seasonsView(ctx);
  else if (tab === 'agenda') body = agendaView(ctx);
  else if (tab === 'history') body = historyView(ctx);
  else body = ctx.draft.artistId ? bookingForm(ctx) : artistPicker(ctx);
  void s;
  return { title: 'Programação', body, tabs: list, tabKey: 'program' };
}

function artistPicker(ctx: UICtx): HTMLElement {
  const s = ctx.sim.state;
  const slotAt = at(ctx.draft.day, ctx.draft.hour);
  const cooldown = BALANCE.artistCooldownDays * MIN_PER_DAY;
  const card = (a: ArtistDef) => {
    const unlocked = artistUnlocked(s, a);
    const ast = s.artists[a.id];
    const upcoming = s.bookings.filter((b) => b.artistId === a.id && b.status !== 'settled' && b.status !== 'cancelled').map((b) => b.startAt).sort((x, y) => x - y);
    const clash = artistDates(s, a.id).find((t) => Math.abs(t - slotAt) < cooldown);
    return h('button', {
      class: `item ${unlocked ? '' : 'locked'}`,
      style: { textAlign: 'left' },
      disabled: !unlocked,
      onclick: () => { ctx.draft.artistId = a.id; ctx.draft.price = a.refPrice; ctx.refresh(); ctx.play('click'); },
    },
    h('div', { class: 'row' }, h('span', { class: 'name' }, `${DISCIPLINE_ICON[a.discipline]} ${a.name}`), h('span', { class: 'muted' }, a.genre)),
    h('small', null, a.bio),
    h('div', { class: 'row' }, h('small', null, `Público ~${Math.round(ast.draw)}`), h('small', null, `Cachet ${eur(contractTerms(s, a.id, 'fixed', 'hall').fee)}`)),
    h('div', { class: 'row' }, h('small', null, riderText(a.rider)), h('small', null, `Qualidade ${a.skill}`)),
    !unlocked ? h('small', { style: { color: '#ffd60a' } }, `🔒 Nível ${a.minLevel} · Reputação ${a.minRep}`) : null,
    unlocked && clash !== undefined ? h('small', { style: { color: '#ffd166' } }, `Não nesta data (tem ${fmtDayShort(clash)}); escolhe outro dia a seguir`) : null,
    upcoming.length ? h('small', { class: 'muted' }, `Datas marcadas: ${upcoming.map((t) => fmtDayShort(t)).join(', ')}`) : null,
    ast.relationship > 0 ? h('small', null, `Relação ${Math.round(ast.relationship)}/100 · ${ast.shows} atuações`) : null);
  };
  const all = availableArtists(s);
  const scene = all.filter((a) => isSceneArtist(a.id));
  const catalog = all.filter((a) => !isSceneArtist(a.id)).sort((x, y) => Number(artistUnlocked(s, y)) - Number(artistUnlocked(s, x)));
  return h('div', null,
    h('div', { class: 'slot-banner' },
      h('span', null, `Vais programar: ${ROOMS[ctx.draft.roomId].name} · ${dayOf(s.time) === ctx.draft.day ? 'hoje' : fmtDayShort(ctx.draft.day * MIN_PER_DAY)} · ${ctx.draft.hour}:00`),
      h('button', { class: 'btn ghost', onclick: () => { ctx.tab.program = 'calendar'; ctx.refresh(); } }, '🗓️ Escolher no calendário')),
    h('p', { class: 'muted' }, `Escolhe um artista (podes mudar a data a seguir). O mesmo artista pode ter várias datas, com ${BALANCE.artistCooldownDays} dias de intervalo; repetir em menos de ${BALANCE.freshnessDays} dias reduz a procura.`),
    section('🎸 Cena local — novos artistas todas as segundas', h('div', { class: 'grid' }, ...scene.map(card))),
    section('Catálogo', h('div', { class: 'grid' }, ...catalog.map(card))),
    s.inbox.some((p) => p.kind === 'artist') ? h('button', { class: 'btn gold', onclick: () => ctx.open('inbox') }, '📥 Há artistas a propor datas') : null);
}

function bookingRequest(ctx: UICtx): BookingRequest {
  const d = ctx.draft;
  return { roomId: d.roomId, artistId: d.artistId!, startAt: at(d.day, d.hour), ticketPrice: d.price, contractType: d.contract, marketing: d.marketing };
}

function bookingForm(ctx: UICtx): HTMLElement {
  const s = ctx.sim.state;
  const d = ctx.draft;
  const a = ARTIST_BY_ID[d.artistId!];
  const ast = s.artists[a.id];
  const today = dayOf(s.time);
  if (d.day < today) d.day = today;
  const showRooms = (['hall', 'blackbox'] as RoomId[]).filter((r) => isOperational(s, r));
  if (!showRooms.includes(d.roomId)) d.roomId = 'hall';
  const req = bookingRequest(ctx);
  const errors = validateBooking(s, req);
  const f = forecast(s, req);
  const seasonNow = seasonFor(s, a, a.id, req.startAt);
  const rg = riderGap(s, d.roomId, a);
  const eq = equipment(s, d.roomId);

  const days = Array.from({ length: BALANCE.maxAdvanceDays }, (_, i) => today + i);
  const hours = [10, 11, 12, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];
  const artistBusyOn = (dd: number) => artistDates(s, a.id).some((t) => Math.abs(t - at(dd, d.hour)) < BALANCE.artistCooldownDays * MIN_PER_DAY);
  const hourOk = (hh: number) => validateBooking(s, { ...req, startAt: at(d.day, hh) }).every((e) => !e.includes('Conflito') && !e.includes('montagem'));

  const terms = f.contract;
  const termText: Record<ContractType, string> = {
    fixed: `Cachet ${eur(contractTerms(s, a.id, 'fixed', d.roomId).fee)} pago agora`,
    split: `Artista fica com ${Math.round(contractTerms(s, a.id, 'split', d.roomId).artistShare * 100)}% da bilheteira`,
    guarantee: `Garantia ${eur(contractTerms(s, a.id, 'guarantee', d.roomId).guarantee)} + 50% acima de ${eur(contractTerms(s, a.id, 'guarantee', d.roomId).guarantee * 2)}`,
    rental: `Promotor paga ${eur(contractTerms(s, a.id, 'rental', d.roomId).rent)} de renda; bilhetes a ${eur(a.refPrice)} vão para ele`,
  };

  return h('div', null,
    h('div', { class: 'row', style: { display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '10px' } },
      h('button', { class: 'btn ghost', onclick: () => { d.artistId = null; ctx.refresh(); } }, '← Artistas'),
      h('div', { style: { flex: '1' } },
        h('div', { class: 'name', style: { fontWeight: '900', fontSize: '17px' } }, `${DISCIPLINE_ICON[a.discipline]} ${a.name}`),
        h('small', { class: 'muted' }, `${a.genre} · ${DISCIPLINE_LABEL[a.discipline]} · ${fmtDuration(a.duration)} · ${a.members} em palco`))),
    section('Rider técnico',
      h('div', { class: 'muted' }, `Pede: ${riderText(a.rider)} — Sala tem: ${riderText(eq)}`),
      rg.rental > 0 ? h('div', { style: { color: '#ffd166', fontSize: '13px' } }, `Equipamento em falta será alugado: ${eur(rg.rental)}`) : h('div', { style: { color: '#3ccf91', fontSize: '13px' } }, 'Equipamento suficiente ✓'),
      ast.relationship > 0 ? h('div', { class: 'muted' }, `Relação: ${Math.round(ast.relationship)}/100 (desconto no cachet e partilhas melhores)`) : null),
    showRooms.length > 1 ? section('Sala', h('div', { class: 'chips' }, ...showRooms.map((r) => h('button', { class: d.roomId === r ? 'on' : '', onclick: () => { d.roomId = r; ctx.refresh(); } }, ROOMS[r].name, h('small', null, `${roomCapacity(s, r)} lugares`))))) : null,
    section('Data', h('div', { class: 'chips' }, ...days.map((dd) => h('button', { class: d.day === dd ? 'on' : '', onclick: () => { d.day = dd; ctx.refresh(); } },
      dd === today ? 'Hoje' : dd === today + 1 ? 'Amanhã' : WEEKDAYS_SHORT[weekdayOf(dd * MIN_PER_DAY)], h('small', null, artistBusyOn(dd) ? 'artista ocupado' : `${fmtDayShort(dd * MIN_PER_DAY).split(' ').slice(1).join(' ')} · ×${BALANCE.dayFactors[weekdayOf(dd * MIN_PER_DAY)]}`))))),
    section('Hora de início', h('div', { class: 'chips' }, ...hours.map((hh) => h('button', { class: d.hour === hh ? 'on' : '', disabled: !hourOk(hh), onclick: () => { d.hour = hh; ctx.refresh(); } }, `${hh}:00`)))),
    section('Contrato', h('div', { class: 'chips' }, ...CONTRACTS.map((c) => h('button', { class: d.contract === c.type ? 'on' : '', disabled: s.level < c.minLevel, title: c.desc, onclick: () => { d.contract = c.type; ctx.refresh(); } }, c.name, h('small', null, s.level < c.minLevel ? `🔒 nível ${c.minLevel}` : '')))),
      h('div', { class: 'muted', style: { marginTop: '6px' } }, CONTRACTS.find((c) => c.type === d.contract)!.desc),
      h('div', { style: { fontSize: '13px', marginTop: '3px', color: '#ffd166' } }, termText[d.contract])),
    d.contract !== 'rental' ? section('Preço do bilhete',
      h('div', { class: 'stepper' },
        h('button', { onclick: () => { d.price = Math.max(0, d.price - 1); ctx.refresh(); } }, '−'),
        h('b', null, eur(d.price)),
        h('button', { onclick: () => { d.price = Math.min(80, d.price + 1); ctx.refresh(); } }, '+'),
        h('small', { class: 'muted' }, `Referência: ${eur(a.refPrice)}`))) : null,
    section('Divulgação', h('div', { class: 'chips' }, ...MARKETING.map((m) => h('button', { class: d.marketing === m.id ? 'on' : '', disabled: s.level < m.minLevel, onclick: () => { d.marketing = m.id; ctx.refresh(); } },
      m.name, h('small', null, s.level < m.minLevel ? `🔒 nível ${m.minLevel}` : `${m.cost ? eur(m.cost) : 'grátis'} · ${m.desc}`))))),
    seasonNow ? h('div', { class: 'slot-banner', style: { borderColor: THEME_BY_ID[seasonNow.theme].color } },
      h('span', null, `${THEME_BY_ID[seasonNow.theme].icon} Faz parte da temporada “${seasonNow.name}”: campanha conjunta +${Math.round(f.breakdown.marketing * 100 - 100 - MARKETING.find((m) => m.id === d.marketing)!.boost * 100)}% · ciclo ×${f.breakdown.season.toFixed(2)}${seasonNow.pass.enabled ? ` · ${passSeatsFor(seasonNow, f.capacity)} lugares de passe` : ''}`)) : null,
    section('Previsão do motor de simulação',
      h('div', { class: 'forecast' },
        segmentBar(f.breakdown.segments),
        kv([
          ['Procura estimada', `${Math.round(f.demand)} pessoas`],
          ['Público previsto', `${f.low}–${f.high} / ${f.capacity} lugares`],
          ['Pré-venda prevista', `${f.presale} bilhetes`],
          ['Bilheteira (para ti)', eur(f.ticketGross)],
          [d.contract === 'rental' ? 'Renda do promotor' : 'Pagamento ao artista', d.contract === 'rental' ? `+${eur(f.rent)}` : `−${eur(f.artistPay)}`],
          ['Bar (margem estimada)', `+${eur(f.barMargin)}`],
          ['Energia, limpeza, aluguer, marketing', `−${eur(f.costs)}`],
          ['Resultado previsto', signedEur(f.net), f.net >= 0 ? 'total pos' : 'total neg'],
        ]),
        h('small', { class: 'muted' }, `Montagem ${fmtDuration(f.setup)} antes · portas ${BALANCE.doorsBefore} min antes · limpeza ${BALANCE.baseCleanup} min depois. O resultado real depende do serviço na bilheteira e no bar.`),
        terms.type === 'fixed' && f.attendance >= f.capacity ? h('div', { style: { color: '#ffd166', fontSize: '12px', marginTop: '4px' } }, 'Procura acima da capacidade: podes subir o preço ou aumentar a plateia.') : null)),
    errors.length ? h('div', { class: 'errors' }, ...errors.map((e) => h('div', null, '• ' + e))) : null,
    section('Programação recorrente', h('div', { class: 'chips' }, ...[1, 2, 4, 8].map((n) => h('button', { class: (ctx.tab.repeat ?? '1') === String(n) ? 'on' : '', onclick: () => { ctx.tab.repeat = String(n); ctx.refresh(); } }, n === 1 ? 'Só esta data' : `${n} semanas`))),
      (ctx.tab.repeat ?? '1') !== '1' ? h('small', { class: 'muted' }, `Repete à mesma hora durante ${ctx.tab.repeat} semanas; cada data é validada (agenda, intervalo do artista, dinheiro). Repetir o mesmo artista reduz a procura.`) : null),
    (ctx.tab.repeat ?? '1') !== '1' ? h('button', {
      class: 'btn gold big', disabled: errors.length > 0,
      onclick: () => {
        const r = ctx.sim.bookSeries(req, Number(ctx.tab.repeat));
        ctx.play(r.booked ? 'coin' : 'error');
        if (r.booked) { ctx.draft.artistId = null; ctx.tab.program = 'calendar'; ctx.tab.repeat = '1'; }
        if (r.errors.length) ctx.tab.seriesNote = `${r.booked} datas marcadas; parou: ${r.errors[0]}`;
        ctx.refresh();
      },
    }, `Marcar ${ctx.tab.repeat} datas semanais`) : null,
    ctx.tab.seriesNote ? h('p', { class: 'muted' }, ctx.tab.seriesNote) : null,
    (ctx.tab.repeat ?? '1') === '1' ? h('button', {
      class: 'btn gold big', disabled: errors.length > 0,
      onclick: () => {
        const r = ctx.sim.book(req);
        if (r.ok) { ctx.draft.artistId = null; ctx.tab.program = 'agenda'; ctx.play('coin'); ctx.close(); }
        else ctx.play('error');
        ctx.refresh();
      },
    }, `Confirmar ${fmtDayShort(req.startAt)} às ${fmtClock(req.startAt)}${terms.fee ? ` · pagar ${eur(terms.fee + MARKETING.find((m) => m.id === d.marketing)!.cost)}` : ''}`) : null);
}

/** Barra com a mistura de público prevista. */
function segmentBar(shares: Partial<Record<SegmentId, number>>): HTMLElement {
  const items = SEGMENT_IDS.map((id) => [id, shares[id] ?? 0] as const).filter(([, v]) => v > 0.02).sort((x, y) => y[1] - x[1]);
  return h('div', { class: 'segbar-wrap' },
    h('div', { class: 'segbar' }, ...items.map(([id, v]) => h('i', { style: { width: `${v * 100}%`, background: SEGMENTS[id].shirts[0] }, title: `${SEGMENTS[id].name} ${Math.round(v * 100)}%` }))),
    h('small', { class: 'muted' }, items.slice(0, 4).map(([id, v]) => `${SEGMENTS[id].icon} ${SEGMENTS[id].name} ${Math.round(v * 100)}%`).join(' · ')));
}

function agendaView(ctx: UICtx): HTMLElement {
  const s = ctx.sim.state;
  const upcoming = s.bookings.filter((b) => b.status !== 'settled' && b.status !== 'cancelled').sort((a, b) => a.startAt - b.startAt);
  const rehearsal = s.rehearsal.slots.filter((r) => r.endAt > s.time);
  if (!upcoming.length && !rehearsal.length) return h('div', null, h('p', { class: 'muted' }, 'Nada agendado. Usa "Nova marcação" para contratar um artista.'));
  return h('div', null,
    ...upcoming.map((b) => {
      const a = artistOf(b);
      const sold = soldTotal(b);
      return h('div', { class: 'item', style: { marginBottom: '8px' } },
        h('div', { class: 'row' }, h('span', { class: 'name' }, `${DISCIPLINE_ICON[a.discipline]} ${a.name}`), h('span', { class: `status-pill ${b.status === 'live' ? 'live' : ''}` }, statusLabel(b))),
        h('div', { class: 'row' }, h('small', null, `${fmtDayShort(b.startAt)} · ${fmtClock(b.startAt)}–${fmtClock(b.startAt + b.duration)} · ${ROOMS[b.roomId].name}`), h('small', null, CONTRACTS.find((c) => c.type === b.contract.type)!.name)),
        h('div', { class: 'row' }, h('small', null, `Montagem desde ${fmtClock(b.startAt - b.setup)} · sala livre às ${fmtClock(b.startAt + b.duration + b.cleanup)}`)),
        h('div', { class: 'row' }, h('small', null, `Bilhetes: ${sold}/${b.capacity}${sold >= b.capacity ? ' · ESGOTADO' : ''}`), h('small', null, `${eur(b.ticketPrice)} · receita ${eur(b.stats.ticketRevenue)}`)),
        meter(sold, b.capacity, sold >= b.capacity ? 'gold' : ''),
        b.status === 'scheduled' || b.status === 'setup' ? h('div', { class: 'row' }, h('span'), confirmButton(`cancel-${b.id}`, 'btn red', 'Cancelar', 'Toca de novo: reembolsa bilhetes, perde o cachet', () => { ctx.sim.cancel(b.id); }, () => ctx.refresh())) : null);
    }),
    rehearsal.length ? section('Sala de ensaio (alugueres)', ...rehearsal.map((r) => h('div', { class: 'muted' }, `${fmtDayShort(r.startAt)} ${fmtClock(r.startAt)}–${fmtClock(r.endAt)} · ${r.hours}h × ${eur(s.rehearsal.pricePerHour)}`))) : null);
}

function historyView(ctx: UICtx): HTMLElement {
  const s = ctx.sim.state;
  const done = s.bookings.filter((b) => b.result).sort((a, b) => b.startAt - a.startAt);
  if (!done.length) return h('p', { class: 'muted' }, 'Ainda não há eventos concluídos.');
  return h('table', { class: 'tbl' },
    h('tr', null, h('th', null, 'Evento'), h('th', null, 'Público'), h('th', null, 'Satisf.'), h('th', null, 'Resultado'), h('th', null, '')),
    ...done.map((b) => h('tr', null,
      h('td', null, `${artistOf(b).name}`, h('br'), h('small', { class: 'muted' }, fmtDayShort(b.startAt))),
      h('td', null, `${b.result!.attendance}/${b.result!.capacity}`),
      h('td', null, `${b.result!.satisfaction}%`),
      h('td', { style: { color: b.result!.net >= 0 ? '#3ccf91' : '#ff5d73' } }, signedEur(b.result!.net)),
      h('td', null, h('button', { class: 'btn ghost', onclick: () => ctx.open('result', b.id) }, 'Ver')))));
}

// ============================================================ relatório de evento

export function resultPanel(ctx: UICtx, bookingId: number): PanelView {
  const s = ctx.sim.state;
  const b = s.bookings.find((x) => x.id === bookingId);
  if (!b || !b.result) return { title: 'Relatório', body: h('p', null, 'Relatório indisponível.'), modal: true };
  const r = b.result;
  const a = artistOf(b);
  const isRental = b.contract.type === 'rental';
  const rows: [string, string, string?][] = [];
  if (!isRental) rows.push([`Bilheteira (${b.presold} antecipados + ${b.doorSold} à porta × ${eur(b.ticketPrice)})`, `+${eur(r.ticketRevenue)}`, 'pos']);
  else rows.push(['Renda do promotor', `+${eur(r.rentIncome)}`, 'pos']);
  if (!isRental) rows.push([`Artista (${CONTRACTS.find((c) => c.type === b.contract.type)!.name})`, `−${eur(r.artistPay)}`, 'neg']);
  rows.push([`Bar (${b.stats.drinks} vendas)`, `+${eur(r.barRevenue, true)}`, 'pos']);
  rows.push(['Custo das bebidas (stock consumido)', `−${eur(r.barCost, true)}`, 'neg']);
  rows.push(['Energia e limpeza', `−${eur(r.energy + r.cleaning, true)}`, 'neg']);
  if (r.equipmentRental) rows.push(['Aluguer de equipamento', `−${eur(r.equipmentRental)}`, 'neg']);
  if (r.marketing) rows.push(['Marketing', `−${eur(r.marketing)}`, 'neg']);
  rows.push(['Resultado do evento', signedEur(r.net), `total ${r.net >= 0 ? 'pos' : 'neg'}`]);
  const sc = r.scores;
  const lost = b.stats.lostImpatient + b.stats.lostTicket;
  return {
    title: `Relatório · ${a.name}`, modal: true,
    body: h('div', null,
      h('div', { class: 'result-head' },
        h('div', { class: `big-number ${r.net >= 0 ? 'pos' : 'neg'}` }, signedEur(r.net)),
        h('div', { class: 'muted' }, `${r.attendance}/${r.capacity} espectadores${r.soldOut ? ' · ESGOTADO 🎉' : ''} · satisfação ${r.satisfaction}%`)),
      section('Contas', kv(rows)),
      section('Satisfação do público',
        segmentBar(b.segments),
        ...([['Qualidade do espetáculo', sc.quality], ['Preço justo', sc.value], ['Serviço (filas)', sc.service], ['Limpeza', sc.cleanliness], ['Lotação vs. WC', sc.crowd], ['Conforto', sc.comfort], ['Som', sc.sound ?? 0], ['Visibilidade', sc.visibility ?? 100], ['Temperatura', sc.temperature ?? 100], ['Segurança', sc.safety ?? 100]] as [string, number][]).map(([k, v]) =>
          h('div', { style: { marginBottom: '6px' } }, h('div', { class: 'row', style: { display: 'flex', justifyContent: 'space-between', fontSize: '13px' } }, h('span', null, k), h('b', null, `${v}`)), meter(v, 100, v < 50 ? 'pink' : '')))),
      r.complaints?.length ? section('O que o público disse', ...r.complaints.map((c) => h('div', { class: 'complaint' }, h('b', null, `“${c.text}”`), h('small', null, ` ~${c.share}% do público`), h('div', { class: 'muted' }, `💡 ${c.suggestion}`)))) : null,
      section('Consequências', kv([
        ['Reputação', `${r.repDelta >= 0 ? '+' : ''}${r.repDelta.toFixed(2)}`, r.repDelta >= 0 ? 'pos' : 'neg'],
        ['Experiência', `+${r.xp} XP`, 'pos'],
        ['Popularidade do artista', `${Math.round(s.artists[a.id].draw)} (era ${a.draw} no início)`],
      ])),
      lost > 0 ? h('p', { class: 'muted' }, `⚠️ ${b.stats.lostImpatient} pessoas desistiram na fila da bilheteira e ${b.stats.lostTicket} ficaram sem bilhete. ${b.stats.lostBar} desistiram do bar.`) : null,
      sc.service < 60 ? h('p', { class: 'muted' }, '💡 Filas longas: contrata bilheteiros/empregados de bar ou fica tu ao balcão.') : null,
      sc.crowd < 70 ? h('p', { class: 'muted' }, `💡 Lotação acima do conforto (${comfortCapacity(s)} pessoas). Constrói/expande as instalações sanitárias.`) : null,
      sc.cleanliness < 70 ? h('p', { class: 'muted' }, '💡 Espaço sujo: limpa entre eventos ou contrata limpeza.') : null,
      h('button', { class: 'btn gold big', onclick: () => { ctx.sim.markSeen('seenResult'); ctx.close(); } }, 'Continuar')),
  };
}

// ============================================================ salas

export function roomPanel(ctx: UICtx, roomId: RoomId): PanelView {
  const s = ctx.sim.state;
  const def = ROOMS[roomId];
  const room = s.rooms[roomId];
  if (!room.built) return buildView(ctx, roomId);
  const list = roomId === 'bar' ? [{ id: 'stock', label: '🍺 Stock e preços' }, { id: 'upg', label: '⬆️ Melhorias' }]
    : roomId === 'gallery' ? [{ id: 'expo', label: '🖼️ Exposições' }, { id: 'upg', label: '⬆️ Melhorias' }]
    : [{ id: 'upg', label: '⬆️ Melhorias' }];
  const tab = tabs(ctx, `room-${roomId}`, list);
  const info: [string, string][] = [];
  if (def.isShowRoom) {
    const live = liveBookingIn(s, roomId);
    const next = s.bookings.filter((b) => b.roomId === roomId && b.status === 'scheduled').sort((a, b) => a.startAt - b.startAt)[0];
    const done = s.bookings.filter((b) => b.roomId === roomId && b.result);
    info.push(['Capacidade', `${roomCapacity(s, roomId)} lugares`]);
    info.push(['Equipamento', riderText(equipment(s, roomId))]);
    info.push(['Estado', live ? `${statusLabel(live)} · ${artistOf(live).name}` : 'Livre']);
    info.push(['Próxima atividade', next ? `${fmtDayShort(next.startAt)} ${fmtClock(next.startAt)} · ${artistOf(next).name}` : '—']);
    info.push(['Eventos realizados', `${done.length}`]);
    info.push(['Resultado acumulado', eur(done.reduce((a, b) => a + b.result!.net, 0))]);
  }
  if (roomId === 'lobby') {
    info.push(['Guichés', `${upgradeValue(s, 'lobby', 'guiche')}`]);
    info.push(['Venda online', upgradeValue(s, 'lobby', 'online') ? 'Sim' : 'Não']);
    info.push(['Fila atual', `${s.counters.boxoffice.queue.length} pessoas`]);
  }
  if (roomId === 'bar') {
    info.push(['Postos de serviço', `${upgradeValue(s, 'bar', 'counter')}`]);
    info.push(['Fila atual', `${s.counters.bar.queue.length} pessoas`]);
    info.push(['Bebidas servidas (total)', `${s.progress.drinksServed}`]);
  }
  if (roomId === 'wc') info.push(['Conforto até', `${comfortCapacity(s)} pessoas (sem WC: ${BASE_COMFORT_CAPACITY})`]);
  if (roomId === 'rehearsal') info.push(['Preço por hora', eur(s.rehearsal.pricePerHour)]);
  const dirt = room.dirt.length;
  info.push(['Limpeza', dirt ? `${Math.max(0, 100 - dirt * 4)}% (${dirt} focos de lixo)` : '100%']);
  info.push(['Manutenção diária', eur(def.maintenance + def.upgrades.reduce((a, u) => a + (room.upgrades[u.key] ?? 0) * u.maintenancePerLevel, 0))]);

  const body = h('div', null,
    h('p', { class: 'muted' }, def.desc),
    tab === 'stock' ? barStock(ctx) : tab === 'expo' ? galleryView(ctx) : h('div', null,
      section('Estado', kv(info)),
      roomId === 'rehearsal' ? section('Preço de aluguer (por hora)', h('div', { class: 'stepper' },
        h('button', { onclick: act(ctx, () => ctx.sim.setRehearsalPrice(s.rehearsal.pricePerHour - 1)) }, '−'),
        h('b', null, eur(s.rehearsal.pricePerHour)),
        h('button', { onclick: act(ctx, () => ctx.sim.setRehearsalPrice(s.rehearsal.pricePerHour + 1)) }, '+'),
        h('small', { class: 'muted' }, `Referência ~${eur(BALANCE.rehearsalRefPrice * (1 + 0.35 * (upgradeValue(s, 'rehearsal', 'equipment') - 1)))}/h. Preço alto = menos bandas.`))) : null,
      def.isShowRoom ? h('button', { class: 'btn gold', style: { marginBottom: '14px' }, onclick: () => { ctx.draft.roomId = roomId; ctx.tab.program = 'new'; ctx.open('program'); } }, '🎟️ Programar nesta sala') : null,
      section('Melhorias', upgradesList(ctx, roomId))),
  );
  return { title: def.name, body, tabs: list.length > 1 ? list : undefined, tabKey: `room-${roomId}` };
}

function upgradesList(ctx: UICtx, roomId: RoomId): HTMLElement {
  const s = ctx.sim.state;
  const def = ROOMS[roomId];
  return h('div', { class: 'grid' }, ...def.upgrades.map((u) => {
    const cur = s.rooms[roomId].upgrades[u.key] ?? 0;
    const next = u.levels[cur + 1];
    const err = upgradeError(ctx.sim, roomId, u.key);
    return h('div', { class: 'item' },
      h('div', { class: 'row' }, h('span', { class: 'name' }, u.name), h('small', null, `Nível ${cur}/${u.levels.length - 1}`)),
      h('small', null, u.desc),
      h('div', { class: 'row' }, h('small', null, `Atual: ${u.levels[cur].label}`)),
      next ? h('div', { class: 'row' }, h('small', null, `Próximo: ${next.label}`), h('small', null, `+${eur(u.maintenancePerLevel)}/dia`)) : h('small', { style: { color: '#3ccf91' } }, 'Nível máximo ✓'),
      next ? h('button', { class: 'btn green', disabled: !!err, title: err ?? '', onclick: act(ctx, () => ctx.sim.upgrade(roomId, u.key)) }, err && err.startsWith('Requer') ? `🔒 ${err}` : `Comprar · ${eur(next.cost)}`) : null);
  }));
}

function barStock(ctx: UICtx): HTMLElement {
  const s = ctx.sim.state;
  const max = stockMax(s);
  return h('div', null,
    h('p', { class: 'muted' }, `Compra stock antes dos eventos. Preços abaixo da referência vendem mais; acima, menos. Capacidade de armazém: ${max} por produto. Perecíveis perdem ${Math.round(BALANCE.wasteRate * 100)}% por dia.`),
    h('table', { class: 'tbl' },
      h('tr', null, h('th', null, 'Produto'), h('th', null, 'Stock'), h('th', null, 'Preço'), h('th', null, 'Custo'), h('th', null, 'Atratividade'), h('th', null, '')),
      ...PRODUCTS.map((p) => {
        const ps = s.bar.products[p.id];
        const ok = productUnlocked(s, p.id);
        if (!ok) return h('tr', null, h('td', { class: 'muted' }, `🔒 ${p.name}`), h('td', { colspan: '5', class: 'muted' }, `Melhoria "Carta" nível ${p.menuLevel}`));
        const pf = productPriceFactor(s, p.id);
        return h('tr', null,
          h('td', null, p.name, p.perishable ? h('small', { class: 'muted' }, ' (perecível)') : null),
          h('td', { style: { color: ps.stock < 10 ? '#ff5d73' : '' } }, `${ps.stock}`),
          h('td', null, h('span', { class: 'stepper', style: { justifyContent: 'flex-end', gap: '4px' } },
            h('button', { style: { width: '26px', height: '26px', fontSize: '14px' }, onclick: act(ctx, () => ctx.sim.setPrice(p.id, ps.price - 0.5)) }, '−'),
            eur(ps.price, true),
            h('button', { style: { width: '26px', height: '26px', fontSize: '14px' }, onclick: act(ctx, () => ctx.sim.setPrice(p.id, ps.price + 0.5)) }, '+'))),
          h('td', { class: 'muted' }, eur(p.unitCost, true)),
          h('td', null, `${Math.round(pf * 100)}%`),
          h('td', null, h('button', { class: 'btn', disabled: ps.stock >= max, onclick: act(ctx, () => ctx.sim.buyStock(p.id, STOCK_STEP) > 0) }, `+${STOCK_STEP} · ${eur(p.unitCost * STOCK_STEP)}`)));
      })),
    s.staff.some((m) => m.role === 'barmanager')
      ? section('Reposição automática', h('div', { class: 'stepper' },
        h('button', { onclick: act(ctx, () => ctx.sim.setRestockTarget(s.bar.restockTarget - 12)) }, '−'),
        h('b', null, `${s.bar.restockTarget}`),
        h('button', { onclick: act(ctx, () => ctx.sim.setRestockTarget(s.bar.restockTarget + 12)) }, '+'),
        h('small', { class: 'muted' }, `O gestor de bar repõe até este nível todas as noites (+${Math.round(BALANCE.autoRestockFee * 100)}% de custo).`)))
      : h('p', { class: 'muted' }, '💡 Um Gestor de bar (nível 4) repõe o stock automaticamente.'));
}

function buildView(ctx: UICtx, roomId: RoomId): PanelView {
  const s = ctx.sim.state;
  const def = ROOMS[roomId];
  const room = s.rooms[roomId];
  const err = buildError(ctx.sim, roomId);
  const body = h('div', null,
    h('p', null, def.desc),
    room.construction
      ? section('Em obras', h('p', null, `Fica pronto às ${fmtClock(room.construction.endsAt)} (${fmtDayShort(room.construction.endsAt)}).`), meter(s.time - room.construction.startAt, room.construction.endsAt - room.construction.startAt, 'gold'))
      : section('Construção', kv([
        ['Custo', eur(def.buildCost)],
        ['Duração da obra', fmtDuration(def.buildMinutes)],
        ['Requer nível', `${def.reqLevel}`],
        ['Manutenção diária', eur(def.maintenance)],
      ]),
      h('div', { style: { height: '10px' } }),
      h('button', { class: 'btn gold big', disabled: !!err, onclick: act(ctx, () => { const ok = ctx.sim.build(roomId); if (ok) ctx.close(); return ok; }) }, err ? `🔒 ${err}` : `Construir ${def.name} · ${eur(def.buildCost)}`)),
    section('Melhorias disponíveis depois', h('ul', { class: 'unlocks' }, ...def.upgrades.map((u) => h('li', null, `${u.name}: ${u.desc}`)))));
  return { title: def.name, body };
}

export function buildPanel(ctx: UICtx): PanelView {
  const s = ctx.sim.state;
  const body = h('div', { class: 'grid' }, ...ROOM_ORDER.map((id) => {
    const def = ROOMS[id];
    const r = s.rooms[id];
    const err = buildError(ctx.sim, id);
    return h('div', { class: `item ${!r.built && err && s.level < def.reqLevel ? 'locked' : ''}` },
      h('div', { class: 'row' }, h('span', { class: 'name' }, def.name), h('small', null, r.built ? '✓ Construído' : r.construction ? '🚧 Em obras' : `Nível ${def.reqLevel}`)),
      h('small', null, def.desc),
      r.built
        ? h('button', { class: 'btn ghost', onclick: () => ctx.open('room', id) }, 'Gerir e melhorar')
        : r.construction
          ? meter(s.time - r.construction.startAt, r.construction.endsAt - r.construction.startAt, 'gold')
          : h('button', { class: 'btn gold', disabled: !!err, onclick: act(ctx, () => ctx.sim.build(id)) }, err ? `🔒 ${err}` : `Construir · ${eur(def.buildCost)} · ${fmtDuration(def.buildMinutes)}`));
  }));
  return { title: 'Construção e espaços', body };
}

// ============================================================ equipa

export function staffPanel(ctx: UICtx): PanelView {
  const s = ctx.sim.state;
  const list = [{ id: 'team', label: `👥 Equipa (${s.staff.length}/${maxStaff(s)})` }, { id: 'hire', label: '📝 Contratar' }];
  const tab = tabs(ctx, 'staff', list);
  let body: HTMLElement;
  if (tab === 'team') {
    body = s.staff.length ? h('div', { class: 'grid' }, ...s.staff.map((m) => h('div', { class: 'item' },
      h('div', { class: 'row' }, h('span', { class: 'name' }, m.name), h('span', { class: 'stars' }, stars(m.competence))),
      h('small', null, ROLES[m.role].name),
      h('div', { class: 'row' }, h('small', null, `Salário ${eur(m.salary)}/dia`), h('small', null, `Exp. ${Math.round(m.experience)}`)),
      h('small', null, `Satisfação ${Math.round(m.satisfaction)}%`), meter(m.satisfaction, 100, m.satisfaction < 40 ? 'pink' : ''),
      h('div', { class: 'row' },
        h('button', { class: 'btn ghost', onclick: act(ctx, () => ctx.sim.bonus(m.id)) }, `Prémio ${eur(BALANCE.bonusAmount)}`),
        confirmButton(`fire-${m.id}`, 'btn red', 'Despedir', 'Confirmar despedimento', () => { ctx.sim.fire(m.id); }, () => ctx.refresh())))))
      : h('p', { class: 'muted' }, 'Ainda não tens equipa: fazes tudo tu. Contrata para automatizar a bilheteira, o bar e a limpeza.');
  } else {
    body = h('div', null,
      h('p', { class: 'muted' }, 'Novos candidatos todas as segundas-feiras. O primeiro dia de salário é pago na contratação. Competência aumenta a velocidade; a experiência faz subir a competência.'),
      h('div', { class: 'grid' }, ...s.candidates.map((c) => {
        const err = hireError(s, c.id);
        return h('div', { class: 'item' },
          h('div', { class: 'row' }, h('span', { class: 'name' }, c.name), h('span', { class: 'stars' }, stars(c.competence))),
          h('small', null, `${ROLES[c.role].name} — ${ROLES[c.role].desc}`),
          h('div', { class: 'row' }, h('small', null, `Salário ${eur(c.salary)}/dia`), h('small', null, `Velocidade ×${(0.7 + 0.15 * c.competence).toFixed(2)}`)),
          h('button', { class: 'btn green', disabled: !!err, title: err ?? '', onclick: act(ctx, () => ctx.sim.hire(c.id)) }, err && err.includes('nível') ? `🔒 ${err}` : 'Contratar'));
      })),
      section('Funções', h('div', { class: 'grid' }, ...ROLE_ORDER.map((r) => h('div', { class: `item ${s.level < ROLES[r].minLevel ? 'locked' : ''}` },
        h('span', { class: 'name' }, ROLES[r].name), h('small', null, ROLES[r].desc), h('small', null, `Nível ${ROLES[r].minLevel} · ${eur(salaryFor(r, 1))}–${eur(salaryFor(r, 5))}/dia`))))));
  }
  return { title: 'Equipa', body, tabs: list, tabKey: 'staff' };
}

// ============================================================ finanças

export function financePanel(ctx: UICtx): PanelView {
  const s = ctx.sim.state;
  const days = s.ledger.slice(-7);
  const maxAbs = Math.max(1, ...days.map((d) => Math.abs(sumIncome(d) - sumExpense(d))));
  const cats7inc: Partial<Record<IncomeCat, number>> = {};
  const cats7exp: Partial<Record<ExpenseCat, number>> = {};
  for (const d of days) {
    for (const [k, v] of Object.entries(d.income)) cats7inc[k as IncomeCat] = (cats7inc[k as IncomeCat] ?? 0) + (v ?? 0);
    for (const [k, v] of Object.entries(d.expense)) cats7exp[k as ExpenseCat] = (cats7exp[k as ExpenseCat] ?? 0) + (v ?? 0);
  }
  const today = s.ledger[s.ledger.length - 1];
  const inc7 = Object.values(cats7inc).reduce((a, b) => a + (b ?? 0), 0);
  const exp7 = Object.values(cats7exp).reduce((a, b) => a + (b ?? 0), 0);
  const fixed = ctx.sim.dailyFixedCosts();
  const body = h('div', null,
    section('Indicadores', kv([
      ['Dinheiro disponível', eur(s.money), s.money >= 0 ? 'pos' : 'neg'],
      ['Receitas (7 dias)', eur(inc7)],
      ['Despesas (7 dias)', eur(exp7)],
      ['Resultado operacional (7 dias)', signedEur(inc7 - exp7), inc7 - exp7 >= 0 ? 'pos' : 'neg'],
      ['Custos fixos por dia (renda + manutenção + salários)', eur(fixed)],
      ['Visitantes hoje', `${today?.visitors ?? 0}`],
      ['Visitantes (total)', `${s.progress.totalVisitors}`],
      ['Desperdício de stock (ontem)', eur(s.ledger[s.ledger.length - 2]?.waste ?? 0, true)],
    ])),
    section('Resultado diário (últimos 7 dias)',
      h('div', { class: 'bars' }, ...days.map((d) => {
        const net = sumIncome(d) - sumExpense(d);
        return h('div', { class: 'b' }, h('span', null, signedEur(net)), h('i', { class: net < 0 ? 'neg' : '', style: { height: `${(Math.abs(net) / maxAbs) * 60}px` } }), h('span', null, fmtDayShort(d.day * MIN_PER_DAY).split(' ')[0]));
      }))),
    section('Receitas por fonte (7 dias)', kv(Object.entries(cats7inc).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0)).map(([k, v]) => [INCOME_LABEL[k as IncomeCat], eur(v ?? 0), 'pos']))),
    section('Despesas por categoria (7 dias)', kv(Object.entries(cats7exp).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0)).map(([k, v]) => [EXPENSE_LABEL[k as ExpenseCat], eur(v ?? 0), 'neg']))),
    h('p', { class: 'muted' }, `Renda ${eur(BALANCE.dailyRent)}/dia, manutenção ${eur(ctx.sim.maintenanceCost())}/dia e salários são pagos à meia-noite. Licenças e seguros: ${eur(BALANCE.weeklyInsurance)} ao domingo.`));
  return { title: 'Finanças', body };
}

// ============================================================ missões e reputação

export function missionsPanel(ctx: UICtx): PanelView {
  const s = ctx.sim.state;
  const list = [{ id: 'missions', label: '🎯 Missões' }, { id: 'rep', label: '⭐ Reputação' }, { id: 'public', label: '👥 Público' }];
  const tab = tabs(ctx, 'missions', list);
  let body: HTMLElement;
  if (tab === 'missions') {
    const act2 = activeMissions(s);
    const claimed = MISSIONS.filter((m) => s.missions[m.id] === 'claimed');
    body = h('div', null,
      h('div', { class: 'grid' }, ...act2.map((m) => {
        const [cur, target] = m.progress(s);
        const done = s.missions[m.id] === 'done';
        return h('div', { class: `item ${done ? 'sel' : ''}` },
          h('div', { class: 'row' }, h('span', { class: 'name' }, m.title), h('small', null, `${eur(m.money)}${m.xp ? ` · ${m.xp} XP` : ''}`)),
          h('small', null, m.desc),
          meter(Math.min(cur, target), target, done ? 'gold' : ''),
          h('small', null, `${Math.min(cur, target)}/${target}`),
          done ? h('button', { class: 'btn gold', onclick: act(ctx, () => ctx.sim.claim(m.id)) }, 'Reclamar recompensa') : null);
      })),
      claimed.length ? section(`Concluídas (${claimed.length})`, h('div', { class: 'muted' }, claimed.map((m) => m.title).join(' · '))) : null);
  } else if (tab === 'public') {
    body = audienceView(ctx);
  } else {
    const r = s.rep;
    const rows: [string, number][] = [['Geral', r.general], ['Música', r.music], ['Teatro e performance', r.theater], ['Comunidade', r.community], ['Artes visuais', r.visual], ['Cinema', r.cinema], ['Formação', r.training]];
    body = h('div', null,
      ...rows.map(([k, v]) => h('div', { style: { marginBottom: '8px' } }, h('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '13px' } }, h('span', null, k), h('b', null, v.toFixed(1))), meter(v, 100, 'gold'))),
      h('p', { class: 'muted' }, 'A reputação sobe com eventos bem avaliados (qualidade, preço justo, filas curtas, limpeza e conforto) e esgotados. Desbloqueia artistas e oportunidades. Artes visuais, cinema e formação chegam na Fase 2–3.'),
      section('Satisfação dos últimos eventos', h('div', null, s.progress.satisfactionHistory.length ? s.progress.satisfactionHistory.map((x) => `${x}%`).join(' · ') : '—')),
      section('Progressão', kv([
        ['Nível', `${s.level} · ${levelTitle(s.level)}`],
        ['XP', `${Math.floor(s.xp)}/${xpForNextLevel(s.level)}`],
        ['Eventos realizados', `${s.progress.totalEvents}`],
        ['Bilhetes vendidos', `${s.progress.totalTickets}`],
        ['Esgotados', `${s.progress.soldOuts}`],
      ])));
  }
  return { title: 'Missões e reputação', body, tabs: list, tabKey: 'missions' };
}

// ============================================================ subida de nível / decisões / menu

export function levelupPanel(ctx: UICtx, data: { level: number; unlocks: string[] }): PanelView {
  return {
    title: `Nível ${data.level}!`, modal: true,
    body: h('div', null,
      h('div', { class: 'result-head' }, h('div', { class: 'big-number', style: { color: '#ffd60a' } }, `⭐ ${data.level}`), h('div', { class: 'muted' }, levelTitle(data.level)), h('div', { class: 'muted' }, `Prémio: +${eur(BALANCE.levelUpMoneyPerLevel * data.level)}`)),
      data.unlocks.length ? section('Desbloqueado', h('ul', { class: 'unlocks' }, ...data.unlocks.map((u) => h('li', null, u)))) : null,
      h('button', { class: 'btn gold big', onclick: () => ctx.close() }, 'Fantástico!')),
  };
}

export function decisionPanel(ctx: UICtx, ev: { title: string; text: string; choices: { label: string; hint: string }[] }): PanelView {
  return {
    title: ev.title, modal: true,
    body: h('div', null,
      h('p', { style: { fontSize: '15px', lineHeight: '1.5' } }, ev.text),
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } }, ...ev.choices.map((c, i) => h('button', { class: `btn ${i === 0 ? 'gold' : 'ghost'} big`, onclick: () => { ctx.sim.resolveEvent(i); ctx.close(); } }, c.label, h('div', { style: { fontSize: '12px', fontWeight: '600', opacity: '0.8' } }, c.hint))))),
  };
}

export function menuPanel(ctx: UICtx): PanelView {
  return {
    title: 'Menu',
    body: h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
      h('button', { class: 'btn gold big', onclick: () => { ctx.save(); ctx.close(); } }, '💾 Guardar agora'),
      h('button', { class: 'btn ghost big', onclick: () => ctx.exportSave() }, '⬇️ Exportar save (ficheiro)'),
      h('button', { class: 'btn ghost big', onclick: () => ctx.importSave() }, '⬆️ Importar save'),
      h('button', { class: 'btn ghost big', onclick: () => { ctx.toggleMute(); ctx.refresh(); } }, ctx.muted() ? '🔇 Som desligado' : '🔊 Som ligado'),
      h('button', { class: 'btn ghost big', onclick: () => ctx.open('help') }, '❓ Controlos e ajuda'),
      confirmButton('newgame', 'btn red big', '🗑️ Novo jogo', 'Toca de novo para apagar o progresso e recomeçar', () => ctx.newGame(), () => ctx.refresh()),
      h('p', { class: 'muted' }, 'O jogo grava automaticamente a cada 20 segundos e ao fechar a página (armazenamento local do browser).')),
  };
}

export function helpPanel(): PanelView {
  return {
    title: 'Controlos e ajuda',
    body: h('div', null,
      section('Mover o gestor', kv([['Tocar/clicar no chão', 'caminha até lá'], ['WASD / setas', 'movimento direto'], ['Ficar atrás de um balcão', 'serve clientes (bilheteira / bar)'], ['Passar por cima do lixo', 'limpa']])),
      section('Câmara', kv([['Arrastar', 'mover a câmara'], ['Roda do rato / pinça', 'zoom'], ['F', 'seguir o gestor'], ['Duplo clique', 'centrar']])),
      section('Tempo', kv([['Espaço', 'pausa'], ['1 / 2 / 3', 'velocidade 1× / 2× / 4×']])),
      section('Atalhos', kv([['P', 'Programação'], ['B', 'Construção'], ['E', 'Equipa'], ['M', 'Missões'], ['Esc', 'fechar painel']])),
      section('Dicas', h('ul', { class: 'unlocks' },
        h('li', null, 'Marca eventos com 2 dias de antecedência: a pré-venda é muito maior.'),
        h('li', null, 'Um concerto pouco rentável na bilheteira pode dar lucro no bar.'),
        h('li', null, 'Sem ninguém na bilheteira, quem chega sem bilhete desiste.'),
        h('li', null, 'Mais de 40 pessoas sem WC construído baixa a satisfação.'),
        h('li', null, 'Repetir o mesmo artista em menos de 30 dias reduz a procura.')))),
  };
}


// ============================================================ calendário (14 dias)

const CAL_START = 10 * 60;
const CAL_SPAN = 16 * 60; // 10:00 → 02:00

export function calendarView(ctx: UICtx): HTMLElement {
  const s = ctx.sim.state;
  const today = dayOf(s.time);
  const rooms = (['hall', 'blackbox', 'gallery', 'rehearsal'] as RoomId[]).filter((r) => isOperational(s, r));
  const pct = (min: number) => `${Math.max(0, Math.min(100, ((min - CAL_START) / CAL_SPAN) * 100))}%`;
  const head = h('div', { class: 'cal-row cal-head' }, h('div', { class: 'cal-label' }),
    h('div', { class: 'cal-ticks' }, ...[10, 12, 14, 16, 18, 20, 22, 24].map((hh) => h('span', { style: { left: pct(hh * 60) } }, `${hh % 24}h`))));
  const rows: HTMLElement[] = [];
  for (let d = today; d < today + BALANCE.maxAdvanceDays; d++) {
    const t0 = d * MIN_PER_DAY;
    const wd = weekdayOf(t0);
    const lanes = rooms.map((roomId) => {
      const lane = h('div', { class: `cal-lane ${roomId === 'rehearsal' ? 'ro' : ''}`, title: roomId === 'rehearsal' ? 'Alugueres da sala de ensaio' : 'Toca num espaço livre para programar' },
        h('span', { class: 'cal-room' }, ROOMS[roomId].short));
      if (roomId === 'gallery') {
        lane.classList.add('gallery-lane');
        lane.title = 'Galeria: toca para programar uma exposição a partir deste dia';
        lane.addEventListener('click', () => { ctx.gdraft.startDay = d; ctx.tab['room-gallery'] = 'expo'; ctx.open('room', 'gallery'); });
        const ex = exhibitionOn(s, d) ?? s.exhibitions.find((x) => x.status === 'closed' && d >= x.startDay && d < x.startDay + x.days);
        if (ex) {
          const va = VISUAL_BY_ID[ex.artistId];
          lane.append(h('div', { class: `cal-block expo ${ex.status === 'closed' ? 'done' : ''}`, style: { left: pct(GALLERY_OPEN * 60), width: `calc(${pct(GALLERY_CLOSE * 60)} - ${pct(GALLERY_OPEN * 60)})`, background: va.colors[1] } },
            `🖼️ ${va.name} · dia ${d - ex.startDay + 1}/${ex.days}`));
        }
        for (const p of s.inbox) {
          if (p.kind !== 'exhibition' || !p.exhibition) continue;
          const sd = dayOf(p.startAt);
          if (d < sd || d >= sd + p.exhibition.days) continue;
          lane.append(h('div', { class: 'cal-block ghost', style: { left: pct(GALLERY_OPEN * 60), width: `calc(${pct(GALLERY_CLOSE * 60)} - ${pct(GALLERY_OPEN * 60)})` }, onclick: (e: Event) => { e.stopPropagation(); ctx.open('inbox'); } }, `📥 ${p.from}`));
        }
        return lane;
      }
      if (roomId !== 'rehearsal') {
        lane.addEventListener('click', (e) => {
          const r = lane.getBoundingClientRect();
          const frac = ((e as MouseEvent).clientX - r.left) / r.width;
          ctx.draft.day = d;
          ctx.draft.hour = Math.max(10, Math.min(23, Math.floor(10 + frac * 16)));
          ctx.draft.roomId = roomId;
          ctx.tab.program = 'new';
          ctx.refresh();
          ctx.play('click');
        });
      }
      // bloqueio do dia passado (antes de agora)
      if (d === today) lane.append(h('div', { class: 'cal-past', style: { left: '0', width: pct(s.time - t0) } }));
      for (const b of s.bookings) {
        if (b.roomId !== roomId || b.status === 'cancelled') continue;
        const o = occupancy(b);
        if (o.to <= t0 + CAL_START || o.from >= t0 + CAL_START + CAL_SPAN) continue;
        const a = artistOf(b);
        const startRel = b.startAt - t0, endRel = b.startAt + b.duration - t0;
        lane.append(
          h('div', { class: 'cal-block prep', style: { left: pct(o.from - t0), width: `calc(${pct(o.to - t0)} - ${pct(o.from - t0)})` } }),
          h('div', {
            class: `cal-block ${b.kind} ${b.status === 'settled' ? 'done' : ''} ${b.status === 'live' ? 'live' : ''}`,
            style: { left: pct(startRel), width: `calc(${pct(endRel)} - ${pct(startRel)})`, background: b.kind === 'show' ? a.colors[0] : undefined },
            title: `${a.name} · ${fmtClock(b.startAt)}–${fmtClock(b.startAt + b.duration)} · montagem desde ${fmtClock(o.from)}, sala livre às ${fmtClock(o.to)}`,
            onclick: (e: Event) => { e.stopPropagation(); if (b.result) ctx.open('result', b.id); else { ctx.tab.program = 'agenda'; ctx.refresh(); } },
          }, `${DISCIPLINE_ICON[a.discipline]} ${fmtClock(b.startAt)} ${a.name}`));
      }
      for (const p of s.inbox) {
        if (p.roomId !== roomId || dayOf(p.startAt) !== d) continue;
        const dur = (p.custom ?? ARTIST_BY_ID[p.artistId]).duration;
        lane.append(h('div', {
          class: 'cal-block ghost', style: { left: pct(p.startAt - t0), width: `calc(${pct(p.startAt - t0 + dur)} - ${pct(p.startAt - t0)})` },
          title: `Proposta: ${p.title}`, onclick: (e: Event) => { e.stopPropagation(); ctx.open('inbox'); },
        }, `📥 ${p.from}`));
      }
      if (roomId === 'rehearsal') {
        for (const r of s.rehearsal.slots) if (dayOf(r.startAt) === d) lane.append(h('div', { class: 'cal-block rehearsal', style: { left: pct(r.startAt - t0), width: `calc(${pct(r.endAt - t0)} - ${pct(r.startAt - t0)})` } }, `🎸 ${r.hours}h`));
      }
      return lane;
    });
    rows.push(h('div', { class: `cal-row ${wd >= 4 && wd <= 5 ? 'peak' : ''} ${d === today ? 'today' : ''}` },
      h('div', { class: 'cal-label' }, h('b', null, d === today ? 'Hoje' : d === today + 1 ? 'Amanhã' : WEEKDAYS_SHORT[wd]), h('small', null, `${fmtDayShort(t0).split(' ').slice(1).join(' ')} · ×${BALANCE.dayFactors[wd]}`),
        h('span', { class: 'cal-seasons' }, ...s.seasons.filter((se) => seasonOpen(se) && d >= se.startDay && d < se.endDay).map((se) => h('i', { style: { background: THEME_BY_ID[se.theme].color }, title: se.name })))),
      h('div', { class: 'cal-lanes' }, ...lanes)));
  }
  const pending = s.inbox.length;
  return h('div', null,
    h('div', { class: 'cal-legend' },
      h('span', null, 'Toca num espaço livre para programar nesse dia e hora.'),
      h('span', { class: 'lg prep' }, 'montagem/limpeza'), h('span', { class: 'lg ghost' }, 'proposta'),
      pending ? h('button', { class: 'btn gold', onclick: () => ctx.open('inbox') }, `📥 ${pending} proposta${pending > 1 ? 's' : ''}`) : null),
    h('div', { class: 'cal' }, h('div', { class: 'cal-grid' }, head, ...rows)));
}

// ============================================================ caixa de propostas

const KIND_LABEL = { artist: '🎤 Artista', corporate: '💼 Empresa', workshop: '🎓 Formação', exhibition: '🖼️ Exposição' } as const;

export function inboxPanel(ctx: UICtx): PanelView {
  const s = ctx.sim.state;
  const list = [...s.inbox].sort((a, b) => a.expiresAt - b.expiresAt);
  const body = list.length ? h('div', { class: 'inbox' }, ...list.map((p) => {
    const errors = proposalErrors(s, p);
    const hoursLeft = Math.max(0, Math.round((p.expiresAt - s.time) / 60));
    if (p.kind === 'exhibition') return exhibitionProposalCard(ctx, p, errors, hoursLeft);
    const req = proposalRequest(p);
    const f = forecast(s, req);
    const a = p.custom ?? ARTIST_BY_ID[p.artistId];
    const terms: [string, string, string?][] = [
      ['Quando', `${fmtDayShort(p.startAt)} · ${fmtClock(p.startAt)}–${fmtClock(p.startAt + a.duration)} · ${ROOMS[p.roomId].name}`],
    ];
    if (p.kind === 'artist') {
      const c = p.contract;
      terms.push(['Condições', c.type === 'fixed' ? `Cachet ${eur(c.fee)} (−15% sobre o habitual)` : c.type === 'split' ? `Partilha: artista fica com ${Math.round(c.artistShare * 100)}%` : `Garantia ${eur(c.guarantee)} + 50% acima de ${eur(c.guarantee * 2)}`]);
      terms.push(['Bilhete', eur(p.ticketPrice)]);
      terms.push(['Público previsto', `${f.low}–${f.high} / ${f.capacity}`]);
    } else if (p.kind === 'corporate') {
      terms.push(['Aluguer pago pela empresa', eur(p.contract.rent), 'pos']);
      terms.push(['Participantes', `${p.participants}`]);
    } else {
      terms.push(['Inscrições', `${p.participants} × ${eur(p.ticketPrice)} = ${eur(p.participants * p.ticketPrice)}`]);
      terms.push(['Formador fica com', `${Math.round(p.contract.artistShare * 100)}%`]);
    }
    terms.push(['Resultado previsto', signedEur(f.net), `total ${f.net >= 0 ? 'pos' : 'neg'}`]);
    return h('div', { class: `item proposal ${p.kind} ${p.seen ? '' : 'new'}` },
      h('div', { class: 'row' }, h('span', { class: 'kind' }, KIND_LABEL[p.kind]), h('small', { style: { color: hoursLeft < 12 ? '#ff5d73' : '' } }, `expira em ${hoursLeft}h`)),
      h('div', { class: 'name' }, p.title),
      h('small', null, `${p.from}: “${p.text}”`),
      kv(terms),
      p.kind === 'workshop' ? h('small', { class: 'muted' }, 'Formação: +reputação em formação e comunidade.') : p.kind === 'corporate' ? h('small', { class: 'muted' }, 'Receita certa; pouco efeito na reputação cultural.') : null,
      errors.length ? h('div', { class: 'errors' }, ...errors.map((e) => h('div', null, '• ' + e))) : null,
      h('div', { class: 'row' },
        h('button', { class: 'btn ghost', onclick: act(ctx, () => ctx.sim.declineProposal(p.id)) }, 'Recusar'),
        h('button', { class: 'btn gold', disabled: errors.length > 0, onclick: act(ctx, () => ctx.sim.acceptProposal(p.id).ok) }, 'Aceitar e agendar')));
  })) : h('p', { class: 'muted' }, 'Sem propostas pendentes. Chegam novas todas as manhãs: artistas desde o início, empresas e formadores a partir do nível 2, exposições quando tiveres a Galeria.');
  return { title: `Propostas (${list.length})`, body: h('div', null, h('p', { class: 'muted' }, 'As propostas expiram ao fim de 2 dias. Ao aceitar, o evento entra no calendário com os termos indicados.'), body) };
}

// ============================================================ galeria

function exhibitionProposalCard(ctx: UICtx, p: Proposal, errors: string[], hoursLeft: number): HTMLElement {
  const s = ctx.sim.state;
  const req = exhibitionRequestOf(p);
  const va = VISUAL_BY_ID[p.artistId];
  const f = exhibitionForecast(s, req);
  return h('div', { class: `item proposal exhibition ${p.seen ? '' : 'new'}` },
    h('div', { class: 'row' }, h('span', { class: 'kind' }, '🖼️ Exposição'), h('small', { style: { color: hoursLeft < 12 ? '#ff5d73' : '' } }, `expira em ${hoursLeft}h`)),
    h('div', { class: 'name' }, p.title),
    h('small', null, `${p.from}: “${p.text}”`),
    kv([
      ['Quando', `${fmtDayShort(req.startDay * MIN_PER_DAY)} a ${fmtDayShort((req.startDay + req.days - 1) * MIN_PER_DAY)} (${req.days} dias)`],
      ['Entrada', req.entryPrice ? eur(req.entryPrice) : 'Grátis'],
      ['Comissão do espaço', `${Math.round(req.commission! * 100)}% (habitual ${Math.round(va.commission * 100)}%)`],
      ['Montagem e seguro', `−${eur(va.setupCost)}`, 'neg'],
      ['Visitantes previstos', `~${f.visitors}`],
      ['Resultado previsto', signedEur(f.net), `total ${f.net >= 0 ? 'pos' : 'neg'}`],
    ]),
    h('small', { class: 'muted' }, 'Exposição: +reputação em artes visuais; atrai clientes ao bar.'),
    errors.length ? h('div', { class: 'errors' }, ...errors.map((e) => h('div', null, '• ' + e))) : null,
    h('div', { class: 'row' },
      h('button', { class: 'btn ghost', onclick: act(ctx, () => ctx.sim.declineProposal(p.id)) }, 'Recusar'),
      h('button', { class: 'btn gold', disabled: errors.length > 0, onclick: act(ctx, () => ctx.sim.acceptProposal(p.id).ok) }, 'Aceitar e agendar')));
}

function worksList(e: Exhibition): HTMLElement {
  return h('div', { class: 'works' }, ...e.works.map((w) => h('div', { class: `work ${w.sold ? 'sold' : ''}` }, h('span', null, `${w.sold ? '🔴 ' : ''}“${w.title}”`), h('b', null, eur(w.price)))));
}

function exhibitionCard(ctx: UICtx, e: Exhibition): HTMLElement {
  const s = ctx.sim.state;
  const va = VISUAL_BY_ID[e.artistId];
  const day = dayOf(s.time) - e.startDay + 1;
  const sold = e.works.filter((w) => w.sold).length;
  const live = e.status === 'open';
  const rows: [string, string, string?][] = [
    ['Datas', `${fmtDayShort(e.startDay * MIN_PER_DAY)} a ${fmtDayShort((e.startDay + e.days - 1) * MIN_PER_DAY)}${live ? ` · dia ${day}/${e.days}` : ''}`],
    ['Horário', `${GALLERY_OPEN}:00–${GALLERY_CLOSE}:00 · entrada ${e.entryPrice ? eur(e.entryPrice) : 'grátis'}`],
  ];
  if (live || e.status === 'closed') {
    rows.push(['Visitantes', `${e.visitors}${live ? ` (hoje ${e.visitorsToday})` : ''}`]);
    rows.push(['Obras vendidas', `${sold}/${e.works.length} · vendas ${eur(e.salesRevenue)}`]);
    rows.push(['Para o espaço', `entradas ${eur(e.entryRevenue)} + comissões ${eur(e.works.filter((w) => w.sold).reduce((t, w) => t + w.price * e.commission, 0))}`, 'pos']);
  }
  if (e.result) rows.push(['Resultado', `${signedEur(e.result.net)} · satisfação ${e.result.satisfaction}% · reputação ${e.result.repDelta >= 0 ? '+' : ''}${e.result.repDelta}`, e.result.net >= 0 ? 'total pos' : 'total neg']);
  return h('div', { class: 'item' },
    h('div', { class: 'row' }, h('span', { class: 'name' }, `🖼️ ${va.name}`), h('span', { class: `status-pill ${live ? 'live' : ''}` }, { scheduled: 'Agendada', open: 'Aberta', closed: 'Encerrada', cancelled: 'Cancelada' }[e.status])),
    h('small', { class: 'muted' }, `${va.medium} · ${va.bio}`),
    kv(rows),
    live || e.status === 'closed' ? worksList(e) : null,
    e.status === 'scheduled' ? h('div', { class: 'row' }, h('span'), confirmButton(`cancel-expo-${e.id}`, 'btn red', 'Cancelar', 'Toca de novo: a montagem paga perde-se', () => { ctx.sim.cancelExhibition(e.id); }, () => ctx.refresh())) : null);
}

function galleryView(ctx: UICtx): HTMLElement {
  const s = ctx.sim.state;
  const g = ctx.gdraft;
  const todayN = dayOf(s.time);
  if (g.startDay < todayN + 1) g.startDay = todayN + 1;
  const active = activeExhibitions(s).sort((a, b) => a.startDay - b.startDay);
  const past = s.exhibitions.filter((e) => e.status === 'closed').slice(-4).reverse();
  const req: ExhibitionRequest | null = g.artistId ? { artistId: g.artistId, startDay: g.startDay, days: g.days, entryPrice: g.entryPrice } : null;
  const errors = req ? validateExhibition(s, req) : [];
  const f = req ? exhibitionForecast(s, req) : null;
  const days = Array.from({ length: BALANCE.maxAdvanceDays - 1 }, (_, i) => todayN + 1 + i);
  return h('div', null,
    active.length ? section('Em curso e agendadas', h('div', { class: 'inbox' }, ...active.map((e) => exhibitionCard(ctx, e)))) : h('p', { class: 'muted' }, 'Sem exposições agendadas. A galeria só recebe visitantes quando há uma exposição aberta.'),
    section('Nova exposição',
      h('div', { class: 'grid' }, ...VISUAL_ARTISTS.map((va) => {
        const ok = visualUnlocked(s, va);
        return h('button', { class: `item ${ok ? '' : 'locked'} ${g.artistId === va.id ? 'sel' : ''}`, style: { textAlign: 'left' }, disabled: !ok, onclick: () => { g.artistId = va.id; g.entryPrice = va.refPrice; ctx.refresh(); ctx.play('click'); } },
          h('div', { class: 'row' }, h('span', { class: 'name' }, va.name), h('small', null, va.medium)),
          h('small', null, va.bio),
          h('div', { class: 'row' }, h('small', null, `${va.works} obras · €${va.priceMin}–${va.priceMax}`), h('small', null, `comissão ${Math.round(va.commission * 100)}%`)),
          h('div', { class: 'row' }, h('small', null, `Montagem ${eur(va.setupCost)}`), h('small', null, va.displays ? `Expositores nível ${va.displays}` : `Qualidade ${va.skill}`)),
          !ok ? h('small', { style: { color: '#ffd60a' } }, `🔒 Nível ${va.minLevel} · Reputação ${va.minRep}`) : null);
      }))),
    req ? h('div', null,
      section('Início', h('div', { class: 'chips' }, ...days.map((dd) => {
        const busy = !!exhibitionOn(s, dd);
        return h('button', { class: g.startDay === dd ? 'on' : '', onclick: () => { g.startDay = dd; ctx.refresh(); } },
          dd === todayN + 1 ? 'Amanhã' : WEEKDAYS_SHORT[weekdayOf(dd * MIN_PER_DAY)], h('small', null, busy ? 'ocupada' : fmtDayShort(dd * MIN_PER_DAY).split(' ').slice(1).join(' ')));
      }))),
      section('Duração', h('div', { class: 'chips' }, ...EXHIBITION_DAYS.map((n) => h('button', { class: g.days === n ? 'on' : '', onclick: () => { g.days = n; ctx.refresh(); } }, `${n} dias`)))),
      section('Entrada', h('div', { class: 'stepper' },
        h('button', { onclick: () => { g.entryPrice = Math.max(0, g.entryPrice - 1); ctx.refresh(); } }, '−'),
        h('b', null, g.entryPrice ? eur(g.entryPrice) : 'Grátis'),
        h('button', { onclick: () => { g.entryPrice = Math.min(30, g.entryPrice + 1); ctx.refresh(); } }, '+'),
        h('small', { class: 'muted' }, `Referência ${eur(VISUAL_BY_ID[req.artistId].refPrice)}. Grátis = +50% visitantes.`))),
      section('Previsão do motor de simulação', h('div', { class: 'forecast' }, kv([
        ['Visitantes previstos', `~${f!.visitors} (${Math.round(f!.visitors / req.days)}/dia)`],
        ['Entradas', `+${eur(f!.entry)}`],
        ['Obras em sala', `${f!.works}`],
        ['Vendas previstas', `~${f!.expectedSold.toFixed(1)} obras × ${eur(f!.avgPrice)}`],
        ['Comissões previstas', `+${eur(f!.commissionIncome)}`],
        ['Montagem, seguro e energia', `−${eur(f!.setupCost + f!.energy)}`],
        ['Resultado previsto', signedEur(f!.net), f!.net >= 0 ? 'total pos' : 'total neg'],
      ]), h('small', { class: 'muted' }, `Qualidade prevista ${f!.quality}. As vendas são aleatórias: a previsão é a média.`))),
      errors.length ? h('div', { class: 'errors' }, ...errors.map((e) => h('div', null, '• ' + e))) : null,
      h('button', { class: 'btn gold big', disabled: errors.length > 0, onclick: () => { const r = ctx.sim.scheduleExhibition(req); ctx.play(r.ok ? 'coin' : 'error'); if (r.ok) g.artistId = null; ctx.refresh(); } },
        `Agendar · pagar ${eur(VISUAL_BY_ID[req.artistId].setupCost)}`)) : null,
    past.length ? section('Exposições anteriores', h('div', { class: 'inbox' }, ...past.map((e) => exhibitionCard(ctx, e)))) : null);
}

// ============================================================ temporadas

function seasonCard(ctx: UICtx, se: Season): HTMLElement {
  const s = ctx.sim.state;
  const th = THEME_BY_ID[se.theme];
  const r = se.result ?? seasonIndicators(s, se);
  const bs = seasonBookings(s, se).sort((a, b) => a.startAt - b.startAt);
  const status = { planned: 'Planeada', active: 'Em curso', closed: 'Encerrada', cancelled: 'Cancelada' }[se.status];
  const objLabel = { events: 'Eventos realizados', occupancy: 'Taxa de ocupação', satisfaction: 'Satisfação média', tickets: 'Bilhetes' } as const;
  return h('div', { class: 'item season', style: { borderLeftColor: th.color } },
    h('div', { class: 'row' }, h('span', { class: 'name' }, `${th.icon} ${se.name}`), h('span', { class: `status-pill ${se.status === 'active' ? 'live' : ''}` }, status)),
    h('small', { class: 'muted' }, `${th.name} · ${SEASON_DURATIONS[se.duration].name} · ${fmtDayShort(se.startDay * MIN_PER_DAY)} a ${fmtDayShort((se.endDay - 1) * MIN_PER_DAY)} · campanha ${eur(se.budget)}`),
    kv([
      ['Bilhetes vendidos', `${r.tickets}${se.pass.enabled ? ` + ${se.pass.sold} passes (${eur(se.pass.price)})` : ''}`],
      ['Taxa de ocupação', `${Math.round(r.occupancy * 100)}%`],
      ['Receita', eur(r.revenue)],
      ['Custos (inclui campanha)', eur(r.costs)],
      ['Lucro', signedEur(r.profit), r.profit >= 0 ? 'pos' : 'neg'],
      ['Satisfação média', r.events ? `${r.satisfaction}%` : '—'],
      ['Reputação (soma dos eventos)', `${r.repDelta >= 0 ? '+' : ''}${r.repDelta}`],
    ]),
    section('Objetivos', ...se.objectives.map((o) => {
      const v = objectiveValue(r, o.kind);
      const fmt = (x: number) => (o.kind === 'occupancy' ? `${Math.round(x * 100)}%` : `${Math.round(x)}`);
      return h('div', { style: { marginBottom: '4px' } }, h('div', { class: 'row', style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px' } }, h('span', null, `${v >= o.target ? '✅' : '⬜'} ${objLabel[o.kind]}`), h('b', null, `${fmt(v)} / ${fmt(o.target)}`)), meter(v, o.target, v >= o.target ? 'gold' : ''));
    })),
    bs.length ? h('small', { class: 'muted' }, `Programação: ${bs.map((b) => `${fmtDayShort(b.startAt)} ${artistOf(b).name}`).join(' · ')}`) : h('small', { class: 'muted' }, 'Ainda sem eventos. Programa eventos do tema dentro das datas: entram automaticamente.'),
    se.status === 'planned' ? h('div', { class: 'row' }, h('span'), confirmButton(`cancel-season-${se.id}`, 'btn red', 'Cancelar', 'Toca de novo: reembolsa passes, perde a campanha', () => { ctx.sim.cancelSeason(se.id); }, () => ctx.refresh())) : null);
}

function seasonsView(ctx: UICtx): HTMLElement {
  const s = ctx.sim.state;
  const todayN = dayOf(s.time);
  const t = ctx.tab;
  const draft: SeasonRequest = {
    name: t.seasonName ?? '', theme: (t.seasonTheme ?? 'jazz') as ThemeId, duration: (t.seasonDur ?? 'month') as SeasonRequest['duration'],
    startDay: Number(t.seasonStart ?? todayN + 1), budget: Number(t.seasonBudget ?? 300), passEnabled: t.seasonPass === '1', passPrice: Number(t.seasonPassPrice ?? 30),
  };
  if (!draft.name) draft.name = `${THEME_BY_ID[draft.theme].name} ${YEAR_SEASON_LABEL[yearSeason(draft.startDay * MIN_PER_DAY)]}`;
  if (draft.startDay < todayN) draft.startDay = todayN;
  const errors = validateSeason(s, draft);
  const pd = passDemand(s, draft);
  const open = s.seasons.filter(seasonOpen);
  const closed = s.seasons.filter((x) => x.status === 'closed').slice(-3).reverse();
  const dur = SEASON_DURATIONS[draft.duration];
  const set = (k: string, v: string) => { t[k] = v; ctx.refresh(); };
  const nameInput = h('input', { id: 'season-name', class: 'text', value: draft.name, maxlength: '40' }) as HTMLInputElement;
  nameInput.addEventListener('change', () => { t.seasonName = nameInput.value; });
  return h('div', null,
    h('p', { class: 'muted' }, 'Uma temporada agrupa eventos de um tema num período. Eventos do tema dentro das datas entram automaticamente: ganham a campanha conjunta, a procura cresce com a consistência do ciclo (+4% por evento realizado, até +20%) e os públicos do tema fidelizam mais depressa.'),
    open.length ? section('Temporadas em curso e planeadas', h('div', { class: 'inbox' }, ...open.map((se) => seasonCard(ctx, se)))) : null,
    section('Nova temporada',
      h('div', { class: 'chips' }, ...THEMES.map((th) => h('button', { class: draft.theme === th.id ? 'on' : '', disabled: !!th.locked, title: th.locked ?? th.desc, onclick: () => { t.seasonName = ''; set('seasonTheme', th.id); } }, `${th.icon} ${th.name}`, h('small', null, th.locked ? '🔒 em breve' : th.segments.map((id) => SEGMENTS[id].icon).join(' '))))),
      h('div', { style: { height: '8px' } }),
      h('label', { class: 'muted', for: 'season-name' }, 'Nome'), nameInput,
      h('div', { style: { height: '8px' } }),
      h('div', { class: 'chips' }, ...(Object.keys(SEASON_DURATIONS) as SeasonRequest['duration'][]).map((k) => h('button', { class: draft.duration === k ? 'on' : '', onclick: () => set('seasonDur', k) }, SEASON_DURATIONS[k].name, h('small', null, `${SEASON_DURATIONS[k].days} dias`)))),
      h('div', { style: { height: '8px' } }),
      h('div', { class: 'chips' }, ...Array.from({ length: 14 }, (_, i) => todayN + i).map((dd) => h('button', { class: draft.startDay === dd ? 'on' : '', onclick: () => set('seasonStart', String(dd)) }, dd === todayN ? 'Hoje' : WEEKDAYS_SHORT[weekdayOf(dd * MIN_PER_DAY)], h('small', null, fmtDayShort(dd * MIN_PER_DAY).split(' ').slice(1).join(' '))))),
      section('Campanha conjunta (paga já)', h('div', { class: 'stepper' },
        h('button', { onclick: () => set('seasonBudget', String(Math.max(0, draft.budget - 100))) }, '−'), h('b', null, eur(draft.budget)),
        h('button', { onclick: () => set('seasonBudget', String(draft.budget + 100)) }, '+'),
        h('small', { class: 'muted' }, `+${Math.round(Math.min(0.35, draft.budget / (dur.days * 80)) * 100)}% de procura em todos os eventos do ciclo (máx. +35% com ${eur(dur.days * 80 * 0.35)}).`))),
      section('Passe de temporada', h('div', { class: 'chips' },
        h('button', { class: draft.passEnabled ? '' : 'on', onclick: () => set('seasonPass', '0') }, 'Só bilhetes individuais'),
        h('button', { class: draft.passEnabled ? 'on' : '', onclick: () => set('seasonPass', '1') }, 'Vender passes')),
        draft.passEnabled ? h('div', { class: 'stepper', style: { marginTop: '6px' } },
          h('button', { onclick: () => set('seasonPassPrice', String(Math.max(5, draft.passPrice - 5))) }, '−'), h('b', null, eur(draft.passPrice)),
          h('button', { onclick: () => set('seasonPassPrice', String(draft.passPrice + 5)) }, '+'),
          h('small', { class: 'muted' }, `Previsão: ~${pd.target} passes (referência ${eur(pd.refPrice)}), vendidos até ao fim do primeiro terço. Cada passe ocupa um lugar em ~80% dos eventos do ciclo. A procura cresce com a fidelização dos públicos do tema.`)) : null),
      section('Objetivos (automáticos)', h('small', { class: 'muted' }, `${dur.objectives.events} eventos · ocupação ${Math.round(dur.objectives.occupancy * 100)}% · satisfação ${dur.objectives.satisfaction}%. Cada objetivo cumprido dá +1,5 de reputação e fideliza os públicos do tema.`)),
      errors.length ? h('div', { class: 'errors' }, ...errors.map((e) => h('div', null, '• ' + e))) : null,
      h('button', { class: 'btn gold big', disabled: errors.length > 0, onclick: () => { t.seasonName = nameInput.value || draft.name; const r = ctx.sim.createSeason({ ...draft, name: t.seasonName }); ctx.play(r.ok ? 'coin' : 'error'); if (r.ok) t.seasonName = ''; ctx.refresh(); } }, `Criar temporada${draft.budget ? ` · pagar ${eur(draft.budget)}` : ''}`)),
    closed.length ? section('Temporadas anteriores', h('div', { class: 'inbox' }, ...closed.map((se) => seasonCard(ctx, se)))) : null);
}

// ============================================================ público

function audienceView(ctx: UICtx): HTMLElement {
  const s = ctx.sim.state;
  const counts = new Map<string, { n: number; text: string; suggestion: string }>();
  for (const f of s.feedback) {
    const c = counts.get(f.key) ?? { n: 0, text: f.text, suggestion: f.suggestion };
    c.n++;
    counts.set(f.key, c);
  }
  const top = [...counts.values()].sort((a, b) => b.n - a.n).slice(0, 5);
  return h('div', null,
    h('p', { class: 'muted' }, 'Cada segmento reage de forma diferente ao preço, ao horário e ao dia. A fidelização sobe com eventos bem avaliados (mais depressa dentro de uma temporada do mesmo tema) e aumenta a procura futura desse público.'),
    h('div', { class: 'grid' }, ...SEGMENT_IDS.map((id) => {
      const seg = SEGMENTS[id];
      const loyal = s.audience[id];
      return h('div', { class: 'item' },
        h('div', { class: 'row' }, h('span', { class: 'name' }, `${seg.icon} ${seg.name}`), h('b', null, `${Math.round(loyal)}`)),
        meter(loyal, 100, 'gold'),
        h('small', { class: 'muted' }, `Sensibilidade ao preço ${seg.elasticity >= 1.6 ? 'alta' : seg.elasticity <= 0.8 ? 'baixa' : 'média'} · bar ×${seg.bar} · workshops ${seg.workshop >= 0.7 ? 'muito' : seg.workshop >= 0.4 ? 'algum' : 'pouco'} interesse`),
        h('small', { class: 'muted' }, `Procura ×${(0.95 + 0.3 * loyal / 100).toFixed(2)} pela fidelização`));
    })),
    section('Reclamações mais frequentes (últimos eventos)', top.length ? h('div', null, ...top.map((c) => h('div', { class: 'complaint' }, h('b', null, `“${c.text}”`), h('small', null, ` · ${c.n}×`), h('div', { class: 'muted' }, `💡 ${c.suggestion}`)))) : h('p', { class: 'muted' }, 'Sem reclamações registadas.')));
}
