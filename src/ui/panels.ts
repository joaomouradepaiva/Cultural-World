// Painéis de gestão. Toda a informação mostrada vem do estado ou de funções do motor (sem valores inventados).

import { ARTISTS, ARTIST_BY_ID, DISCIPLINE_ICON, DISCIPLINE_LABEL } from '../content/artists';
import { BALANCE, levelTitle, xpForNextLevel } from '../content/balance';
import { CONTRACTS, MARKETING, PRODUCTS, ROLES, ROLE_ORDER, STOCK_STEP } from '../content/catalog';
import { MISSIONS } from '../content/missions';
import { ROOMS, ROOM_ORDER, BASE_COMFORT_CAPACITY } from '../content/rooms';
import { artistUnlocked, contractTerms, forecast, riderGap, validateBooking, type BookingRequest } from '../sim/bookings';
import { productPriceFactor } from '../sim/bar';
import { buildError, upgradeError } from '../sim/construction';
import { EXPENSE_LABEL, INCOME_LABEL, sumExpense, sumIncome } from '../sim/economy';
import { activeMissions } from '../sim/progression';
import type { Simulation } from '../sim/sim';
import { hireError, maxStaff, salaryFor } from '../sim/staff';
import { comfortCapacity, equipment, isOperational, productUnlocked, roomCapacity, stockMax, upgradeValue, liveBookingIn } from '../sim/state';
import { at, dayOf, fmtClock, fmtDayShort, fmtDuration, MIN_PER_DAY, WEEKDAYS_SHORT, weekdayOf } from '../sim/time';
import type { Booking, ContractType, ExpenseCat, IncomeCat, MarketingId, RoomId } from '../sim/types';
import { eur, h, meter, signedEur, stars } from './dom';

export type PanelName = 'program' | 'room' | 'build' | 'staff' | 'finance' | 'missions' | 'menu' | 'result' | 'levelup' | 'decision' | 'help';

export interface BookingDraft {
  roomId: RoomId;
  artistId: string | null;
  day: number;
  hour: number;
  price: number;
  contract: ContractType;
  marketing: MarketingId;
}

export interface UICtx {
  sim: Simulation;
  draft: BookingDraft;
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
  const list = [{ id: 'new', label: '➕ Nova marcação' }, { id: 'agenda', label: '📅 Agenda' }, { id: 'history', label: '📊 Resultados' }];
  const tab = tabs(ctx, 'program', list);
  let body: HTMLElement;
  if (tab === 'agenda') body = agendaView(ctx);
  else if (tab === 'history') body = historyView(ctx);
  else body = ctx.draft.artistId ? bookingForm(ctx) : artistPicker(ctx);
  void s;
  return { title: 'Programação', body, tabs: list, tabKey: 'program' };
}

function artistPicker(ctx: UICtx): HTMLElement {
  const s = ctx.sim.state;
  const items = ARTISTS.map((a) => {
    const unlocked = artistUnlocked(s, a);
    const ast = s.artists[a.id];
    const busy = s.bookings.some((b) => b.artistId === a.id && b.status !== 'settled' && b.status !== 'cancelled');
    return h('button', {
      class: `item ${unlocked ? '' : 'locked'}`,
      style: { textAlign: 'left' },
      disabled: !unlocked || busy,
      onclick: () => { ctx.draft.artistId = a.id; ctx.draft.price = a.refPrice; ctx.refresh(); ctx.play('click'); },
    },
    h('div', { class: 'row' }, h('span', { class: 'name' }, `${DISCIPLINE_ICON[a.discipline]} ${a.name}`), h('span', { class: 'muted' }, a.genre)),
    h('small', null, a.bio),
    h('div', { class: 'row' }, h('small', null, `Público ~${Math.round(ast.draw)}`), h('small', null, `Cachet ${eur(contractTerms(s, a.id, 'fixed', 'hall').fee)}`)),
    h('div', { class: 'row' }, h('small', null, riderText(a.rider)), h('small', null, `Qualidade ${a.skill}`)),
    !unlocked ? h('small', { style: { color: '#ffd60a' } }, `🔒 Nível ${a.minLevel} · Reputação ${a.minRep}`) : null,
    busy ? h('small', { style: { color: '#ffd60a' } }, 'Já tem data marcada') : null,
    ast.relationship > 0 ? h('small', null, `Relação ${Math.round(ast.relationship)}/100 · ${ast.shows} atuações`) : null);
  });
  return h('div', null,
    h('p', { class: 'muted' }, 'Escolhe um artista. A procura depende da popularidade, da tua reputação, do preço, do dia e da divulgação.'),
    h('div', { class: 'grid' }, ...items));
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
  const rg = riderGap(s, d.roomId, a);
  const eq = equipment(s, d.roomId);

  const days = Array.from({ length: 7 }, (_, i) => today + i);
  const hours = [14, 16, 18, 19, 20, 21, 22, 23];
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
      dd === today ? 'Hoje' : dd === today + 1 ? 'Amanhã' : WEEKDAYS_SHORT[weekdayOf(dd * MIN_PER_DAY)], h('small', null, `${fmtDayShort(dd * MIN_PER_DAY).split(' ').slice(1).join(' ')} · ×${BALANCE.dayFactors[weekdayOf(dd * MIN_PER_DAY)]}`))))),
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
    section('Previsão do motor de simulação',
      h('div', { class: 'forecast' },
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
    h('button', {
      class: 'btn gold big', disabled: errors.length > 0,
      onclick: () => {
        const r = ctx.sim.book(req);
        if (r.ok) { ctx.draft.artistId = null; ctx.tab.program = 'agenda'; ctx.play('coin'); ctx.close(); }
        else ctx.play('error');
        ctx.refresh();
      },
    }, `Confirmar ${fmtDayShort(req.startAt)} às ${fmtClock(req.startAt)}${terms.fee ? ` · pagar ${eur(terms.fee + MARKETING.find((m) => m.id === d.marketing)!.cost)}` : ''}`));
}

function agendaView(ctx: UICtx): HTMLElement {
  const s = ctx.sim.state;
  const upcoming = s.bookings.filter((b) => b.status !== 'settled' && b.status !== 'cancelled').sort((a, b) => a.startAt - b.startAt);
  const rehearsal = s.rehearsal.slots.filter((r) => r.endAt > s.time);
  if (!upcoming.length && !rehearsal.length) return h('div', null, h('p', { class: 'muted' }, 'Nada agendado. Usa "Nova marcação" para contratar um artista.'));
  return h('div', null,
    ...upcoming.map((b) => {
      const a = ARTIST_BY_ID[b.artistId];
      const sold = b.presold + b.doorSold;
      return h('div', { class: 'item', style: { marginBottom: '8px' } },
        h('div', { class: 'row' }, h('span', { class: 'name' }, `${DISCIPLINE_ICON[a.discipline]} ${a.name}`), h('span', { class: `status-pill ${b.status === 'live' ? 'live' : ''}` }, statusLabel(b))),
        h('div', { class: 'row' }, h('small', null, `${fmtDayShort(b.startAt)} · ${fmtClock(b.startAt)}–${fmtClock(b.startAt + b.duration)} · ${ROOMS[b.roomId].name}`), h('small', null, CONTRACTS.find((c) => c.type === b.contract.type)!.name)),
        h('div', { class: 'row' }, h('small', null, `Montagem desde ${fmtClock(b.startAt - b.setup)} · sala livre às ${fmtClock(b.startAt + b.duration + b.cleanup)}`)),
        h('div', { class: 'row' }, h('small', null, `Bilhetes: ${sold}/${b.capacity}${sold >= b.capacity ? ' · ESGOTADO' : ''}`), h('small', null, `${eur(b.ticketPrice)} · receita ${eur(b.stats.ticketRevenue)}`)),
        meter(sold, b.capacity, sold >= b.capacity ? 'gold' : ''),
        b.status === 'scheduled' || b.status === 'setup' ? h('div', { class: 'row' }, h('span'), h('button', { class: 'btn red', onclick: act(ctx, () => confirm('Cancelar este evento? Os bilhetes são reembolsados e o cachet pago perde-se.') && ctx.sim.cancel(b.id)) }, 'Cancelar')) : null);
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
      h('td', null, `${ARTIST_BY_ID[b.artistId].name}`, h('br'), h('small', { class: 'muted' }, fmtDayShort(b.startAt))),
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
  const a = ARTIST_BY_ID[b.artistId];
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
        ...([['Qualidade do espetáculo', sc.quality], ['Preço justo', sc.value], ['Serviço (filas)', sc.service], ['Limpeza', sc.cleanliness], ['Lotação vs. WC', sc.crowd], ['Conforto', sc.comfort]] as [string, number][]).map(([k, v]) =>
          h('div', { style: { marginBottom: '6px' } }, h('div', { class: 'row', style: { display: 'flex', justifyContent: 'space-between', fontSize: '13px' } }, h('span', null, k), h('b', null, `${v}`)), meter(v, 100, v < 50 ? 'pink' : '')))),
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
  const list = roomId === 'bar' ? [{ id: 'stock', label: '🍺 Stock e preços' }, { id: 'upg', label: '⬆️ Melhorias' }] : [{ id: 'upg', label: '⬆️ Melhorias' }];
  const tab = tabs(ctx, `room-${roomId}`, list);
  const info: [string, string][] = [];
  if (def.isShowRoom) {
    const live = liveBookingIn(s, roomId);
    const next = s.bookings.filter((b) => b.roomId === roomId && b.status === 'scheduled').sort((a, b) => a.startAt - b.startAt)[0];
    const done = s.bookings.filter((b) => b.roomId === roomId && b.result);
    info.push(['Capacidade', `${roomCapacity(s, roomId)} lugares`]);
    info.push(['Equipamento', riderText(equipment(s, roomId))]);
    info.push(['Estado', live ? `${statusLabel(live)} · ${ARTIST_BY_ID[live.artistId].name}` : 'Livre']);
    info.push(['Próxima atividade', next ? `${fmtDayShort(next.startAt)} ${fmtClock(next.startAt)} · ${ARTIST_BY_ID[next.artistId].name}` : '—']);
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
    tab === 'stock' ? barStock(ctx) : h('div', null,
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
        h('button', { class: 'btn red', onclick: act(ctx, () => confirm(`Despedir ${m.name}?`) && ctx.sim.fire(m.id)) }, 'Despedir')))))
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
  const list = [{ id: 'missions', label: '🎯 Missões' }, { id: 'rep', label: '⭐ Reputação' }];
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
      h('button', { class: 'btn red big', onclick: () => { if (confirm('Começar um novo jogo? O progresso atual será apagado.')) ctx.newGame(); } }, '🗑️ Novo jogo'),
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

