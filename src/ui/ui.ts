// Controlador da interface: HUD, notificações, tutorial, painéis e modais.

import { DISCIPLINE_ICON, artistOf } from '../content/artists';
import { levelTitle, xpForNextLevel } from '../content/balance';
import { TUTORIAL } from '../content/missions';
import { ROOMS } from '../content/rooms';
import type { AudioEngine } from '../audio/audio';
import type { SimEvent } from '../sim/core';
import { activeMissions } from '../sim/progression';
import { RANDOM_EVENT_BY_ID } from '../sim/randomEvents';
import type { Simulation } from '../sim/sim';
import { nextBooking } from '../sim/state';
import { soldTotal } from '../sim/bookings';
import { fmtClock, fmtDate, fmtDayShort, dayOf } from '../sim/time';
import { playerServing } from '../sim/agents';
import type { RoomId } from '../sim/types';
import type { Renderer } from '../render/renderer';
import { eur, h, meter } from './dom';
import {
  buildPanel, decisionPanel, inboxPanel, financePanel, helpPanel, levelupPanel, menuPanel, missionsPanel, programPanel, resultPanel, roomPanel, staffPanel,
  type BookingDraft, type GalleryDraft, type PanelName, type PanelView, type UICtx,
} from './panels';

interface Modal { name: PanelName; arg: unknown }

export interface UIHost {
  save(): void;
  exportSave(): void;
  importSave(): void;
  newGame(): void;
}

export class UI implements UICtx {
  draft: BookingDraft;
  gdraft: GalleryDraft = { artistId: null, startDay: 0, days: 7, entryPrice: 3 };
  tab: Record<string, string> = {};
  private root: HTMLElement;
  private els: Record<string, HTMLElement> = {};
  private panelWrap!: HTMLElement;
  private current: Modal | null = null;
  private modalQueue: Modal[] = [];
  private hudTimer = 0;
  private panelTimer = 0;
  private lastTutorialStep = -1;
  private sideCollapsed = false;
  private lastPointer = 0;

  constructor(public sim: Simulation, private renderer: Renderer, private audio: AudioEngine, private host: UIHost) {
    this.root = document.getElementById('ui')!;
    const d = dayOf(sim.state.time);
    this.draft = { roomId: 'hall', artistId: null, day: d, hour: 21, price: 8, contract: 'fixed', marketing: 'none' };
    this.build();
  }

  // ------------------------------------------------------------ UICtx
  save(): void { this.host.save(); }
  exportSave(): void { this.host.exportSave(); }
  importSave(): void { this.host.importSave(); }
  newGame(): void { this.host.newGame(); }
  toggleMute(): boolean { return this.audio.toggleMute(); }
  muted(): boolean { return this.audio.muted; }
  play(name: 'click' | 'error' | 'coin'): void { this.audio.play(name); }

  open(name: PanelName, arg?: unknown): void {
    const modal = name === 'result' || name === 'levelup' || name === 'decision';
    if (modal && this.current && isModal(this.current.name)) { this.modalQueue.push({ name, arg }); return; }
    if (!modal && this.current && isModal(this.current.name)) return;
    this.current = { name, arg };
    this.renderPanel();
    this.audio.play('click');
  }

  close(): void {
    this.current = null;
    if (this.modalQueue.length) { this.current = this.modalQueue.shift()!; }
    this.renderPanel();
  }

  refresh(): void {
    this.renderPanel();
    this.updateHud(true);
  }

  get isOpen(): boolean {
    return !!this.current;
  }

  // ------------------------------------------------------------ construção do DOM

  private build(): void {
    const r = this.root;
    r.innerHTML = '';
    const top = h('div', { class: 'hud-top' },
      this.els.money = h('div', { class: 'chip money', title: 'Dinheiro disponível' }),
      this.els.level = h('div', { class: 'chip level', title: 'Nível e experiência' }),
      this.els.rep = h('div', { class: 'chip', title: 'Reputação geral' }),
      h('div', { class: 'spacer' }),
      this.els.clock = h('div', { class: 'chip clock' }),
      this.els.speed = h('div', { class: 'chip speed', id: 'speed-controls' }),
      this.els.sound = h('button', { class: 'iconbtn', title: 'Som', onclick: () => { this.audio.unlock(); this.audio.toggleMute(); this.updateHud(true); } }),
      h('button', { class: 'iconbtn', title: 'Menu', onclick: () => this.open('menu') }, '☰'));
    for (const [sp, label] of [[0, '⏸'], [1, '1×'], [2, '2×'], [4, '4×']] as [number, string][]) {
      this.els.speed.append(h('button', { 'data-speed': String(sp), onclick: () => { this.sim.setSpeed(sp); this.updateHud(true); } }, label));
    }
    const side = h('div', { class: 'side' },
      this.els.next = h('div', { class: 'card next-event' }),
      this.els.missions = h('div', { class: 'card' }));
    this.els.side = side;
    const tools: [string, string, string, () => void][] = [
      ['btn-program', '🎟️', 'Programar', () => { this.tab.program = this.sim.state.bookings.length ? 'calendar' : 'new'; this.open('program'); }],
      ['btn-inbox', '📥', 'Propostas', () => this.open('inbox')],
      ['btn-build', '🏗️', 'Construir', () => this.open('build')],
      ['btn-staff', '👥', 'Equipa', () => this.open('staff')],
      ['btn-bar', '🍺', 'Bar', () => this.sim.state.rooms.bar.built ? this.open('room', 'bar') : this.open('room', 'bar')],
      ['btn-finance', '📈', 'Finanças', () => this.open('finance')],
      ['btn-missions', '🎯', 'Missões', () => this.open('missions')],
    ];
    const toolbar = h('div', { class: 'toolbar' }, ...tools.map(([id, ico, label, fn], i) => {
      const b = h('button', { class: `tool ${i === 0 ? 'primary' : ''}`, id, onclick: fn }, h('span', { class: 'ico' }, ico), label);
      this.els[id] = b;
      return b;
    }));
    this.els.context = h('div', { class: 'context hidden' });
    this.els.roomchip = h('div', { class: 'roomchip hidden' });
    this.els.toasts = h('div', { class: 'toasts' });
    this.els.tutorial = h('div', { class: 'tutorial hidden' });
    this.panelWrap = h('div', { class: 'panel-wrap hidden', onclick: (e: Event) => { if (e.target === this.panelWrap && this.current && !isModal(this.current.name)) this.close(); } });
    // nunca reconstruir o painel a meio de um toque/clique
    this.panelWrap.addEventListener('pointerdown', () => { this.lastPointer = performance.now(); }, true);
    this.panelWrap.addEventListener('pointerup', () => { this.lastPointer = performance.now(); }, true);
    r.append(top, side, toolbar, this.els.context, this.els.roomchip, this.els.toasts, this.els.tutorial, this.panelWrap);
    this.updateHud(true);
  }

  // ------------------------------------------------------------ atualização por frame

  update(dt: number): void {
    this.hudTimer -= dt;
    if (this.hudTimer <= 0) { this.hudTimer = 0.25; this.updateHud(false); }
    this.panelTimer -= dt;
    if (this.panelTimer <= 0 && this.current && !isModal(this.current.name)) {
      this.panelTimer = 1;
      const typing = document.activeElement instanceof HTMLInputElement;
      if (!typing && performance.now() - this.lastPointer > 700) this.renderPanel(true);
    }
    // a simulação fica parada enquanto um relatório ou decisão está aberto
    this.sim.hold = !!this.current && isModal(this.current.name);
    if (this.sim.state.pendingEvent && (!this.current || this.current.name !== 'decision')) {
      if (!this.modalQueue.some((m) => m.name === 'decision')) this.open('decision');
    }
  }

  handleEvents(events: SimEvent[]): void {
    for (const e of events) {
      switch (e.type) {
        case 'toast': this.toast(e.text, e.kind); break;
        case 'sound': this.audio.play(e.name); break;
        case 'result': this.open('result', e.bookingId); break;
        case 'levelup': this.open('levelup', { level: e.level, unlocks: e.unlocks }); break;
        case 'showStart': {
          const b = this.sim.state.bookings.find((x) => x.id === e.bookingId);
          if (b && this.sim.state.tutorial.step <= 8 && !this.sim.state.tutorial.skipped) this.renderer.cam.focusTile(7.5, 4.5);
          break;
        }
      }
    }
  }

  toast(text: string, kind: 'info' | 'good' | 'bad' | 'money' = 'info'): void {
    const t = h('div', { class: `toast ${kind}` }, text);
    this.els.toasts.prepend(t);
    while (this.els.toasts.children.length > 4) this.els.toasts.lastChild!.remove();
    setTimeout(() => t.remove(), 5200);
  }

  private updateHud(force: boolean): void {
    const s = this.sim.state;
    const e = this.els;
    e.money.className = `chip money ${s.money < 0 ? 'neg' : ''}`;
    e.money.textContent = `💰 ${eur(s.money)}`;
    const need = xpForNextLevel(s.level);
    e.level.innerHTML = '';
    e.level.append(h('span', { class: 'lvl-badge' }, s.level), h('div', null, h('div', { class: 'lvl-title' }, levelTitle(s.level)), h('div', { class: 'xpbar' }, h('i', { style: { width: `${(s.xp / need) * 100}%` } }))));
    e.rep.textContent = `⭐ ${s.rep.general.toFixed(1)}`;
    e.clock.innerHTML = '';
    e.clock.append(h('b', null, fmtClock(s.time)), h('small', null, fmtDate(s.time) + (this.sim.isNightSkip() ? ' · 🌙 noite' : '')));
    for (const b of Array.from(e.speed.children) as HTMLElement[]) b.classList.toggle('on', Number(b.dataset.speed) === s.speed);
    e.sound.textContent = this.audio.muted ? '🔇' : '🔊';

    // próximo evento
    const nb = nextBooking(s);
    e.next.innerHTML = '';
    if (nb) {
      const a = artistOf(nb);
      const sold = soldTotal(nb);
      const st = { scheduled: 'Agendado', setup: 'Montagem', doors: 'Portas abertas', live: 'AO VIVO', ended: '', settled: '', cancelled: '' }[nb.status];
      e.next.append(
        h('h4', null, h('span', null, 'Próximo evento'), h('span', { class: `status-pill ${nb.status === 'live' ? 'live' : ''}` }, st)),
        h('div', { class: 'title' }, `${DISCIPLINE_ICON[a.discipline]} ${a.name}`),
        h('div', { class: 'meta' }, `${dayOf(nb.startAt) === dayOf(s.time) ? 'Hoje' : fmtDayShort(nb.startAt)} ${fmtClock(nb.startAt)} · ${ROOMS[nb.roomId].short} · ${eur(nb.ticketPrice)}`),
        h('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px' } }, h('span', null, `🎫 ${sold}/${nb.capacity}`), h('span', null, `${Math.round((sold / Math.max(1, nb.capacity)) * 100)}%`)),
        meter(sold, nb.capacity, sold >= nb.capacity ? 'gold' : ''));
      e.next.onclick = () => { this.tab.program = 'agenda'; this.open('program'); };
    } else {
      e.next.append(h('h4', null, 'Próximo evento'), h('div', { class: 'meta' }, 'Nada programado.'), h('button', { class: 'btn gold', onclick: () => { this.tab.program = 'new'; this.open('program'); } }, '🎟️ Programar'));
      e.next.onclick = null;
    }

    // missões
    const ms = activeMissions(s);
    const doneCount = ms.filter((m) => s.missions[m.id] === 'done').length;
    e.missions.innerHTML = '';
    e.missions.append(h('h4', null, h('span', null, 'Missões'), h('button', { class: 'collapse-btn', onclick: () => { this.sideCollapsed = !this.sideCollapsed; this.els.side.classList.toggle('collapsed', this.sideCollapsed); } }, this.sideCollapsed ? 'mostrar' : 'ocultar')));
    const listEl = h('div', { class: 'missions-list' });
    for (const m of ms.slice(0, window.innerWidth < 760 ? 1 : 3)) {
      const [cur, target] = m.progress(s);
      const done = s.missions[m.id] === 'done';
      listEl.append(h('div', { class: 'mission' },
        h('div', { class: 'bar' }, h('div', null, m.title), h('small', null, `${Math.min(cur, target)}/${target} · ${eur(m.money)}`), h('div', { class: 'pbar' }, h('i', { style: { width: `${Math.min(1, cur / target) * 100}%` } }))),
        done ? h('button', { class: 'claim', onclick: () => { this.sim.claim(m.id); this.audio.play('coin'); this.updateHud(true); } }, 'Reclamar') : null));
    }
    e.missions.append(listEl);
    const badge = (id: string, n: number) => {
      const el = e[id];
      el.querySelector('.badge')?.remove();
      if (n > 0) el.append(h('span', { class: 'badge' }, n));
    };
    badge('btn-missions', doneCount);
    badge('btn-inbox', s.inbox.filter((p) => !p.seen).length);
    const lowStock = s.rooms.bar.built && Object.entries(s.bar.products).some(([, p]) => p.stock < 6 && p.stock >= 0) ? 1 : 0;
    badge('btn-bar', lowStock ? 1 : 0);

    // dica contextual
    const ctxEl = e.context;
    let hint = '';
    if (playerServing(s, 'boxoffice')) hint = s.counters.boxoffice.queue.length || s.counters.boxoffice.serving.some((x) => x) ? '🎫 A vender bilhetes…' : '🎫 Na bilheteira';
    else if (playerServing(s, 'bar')) hint = s.counters.bar.queue.length || s.counters.bar.serving.some((x) => x) ? '🍺 A servir no bar…' : '🍺 Atrás do balcão';
    else if (this.sim.state.rooms.hall.dirt.length && s.tutorial.step === 2) hint = '🧹 Passa por cima do lixo';
    ctxEl.textContent = hint;
    ctxEl.classList.toggle('hidden', !hint);

    this.updateTutorial(force);
  }

  private updateTutorial(force: boolean): void {
    const s = this.sim.state;
    const t = s.tutorial;
    const el = this.els.tutorial;
    document.querySelectorAll('.pulse').forEach((x) => x.classList.remove('pulse'));
    if (t.skipped || t.step >= TUTORIAL.length) {
      el.classList.add('hidden');
      this.renderer.tutorialTarget = null;
      return;
    }
    const step = TUTORIAL[t.step];
    const target = step.target(s);
    if (target?.kind === 'ui') document.getElementById(target.id)?.classList.add('pulse');
    this.renderer.tutorialTarget = target?.kind === 'world' ? { x: target.x, y: target.y } : null;
    if (t.step !== this.lastTutorialStep) {
      this.lastTutorialStep = t.step;
      if (target?.kind === 'world') this.renderer.cam.focusTile(target.x, target.y);
      force = true;
    }
    if (!force) return;
    el.classList.remove('hidden');
    el.innerHTML = '';
    el.append(
      h('div', { class: 'step' }, `Tutorial · ${t.step + 1}/${TUTORIAL.length}`),
      h('h3', null, step.title),
      h('p', null, step.text),
      h('div', { class: 'actions' },
        h('button', { class: 'btn ghost', onclick: () => { this.sim.skipTutorial(); this.updateHud(true); } }, 'Saltar tutorial'),
        step.manual ? h('button', { class: 'btn gold', onclick: () => { this.audio.unlock(); this.sim.tutorialNext(); this.updateHud(true); } }, t.step === TUTORIAL.length - 1 ? 'Começar!' : 'Continuar') : null));
  }

  // ------------------------------------------------------------ painéis

  private renderPanel(soft = false): void {
    const wrap = this.panelWrap;
    if (!this.current) {
      wrap.classList.add('hidden');
      wrap.innerHTML = '';
      this.renderer.selected = null;
      return;
    }
    const view = this.view(this.current);
    const prevBody = wrap.querySelector('.body');
    const scroll = prevBody ? prevBody.scrollTop : 0;
    const panel = h('div', { class: 'panel' },
      h('header', null, h('h2', null, view.title), view.modal ? null : h('button', { class: 'close', onclick: () => this.close() }, '✕')),
      view.tabs ? h('div', { class: 'tabs' }, ...view.tabs.map((t) => h('button', { class: `tab ${this.tab[view.tabKey!] === t.id ? 'on' : ''}`, onclick: () => { this.tab[view.tabKey!] = t.id; this.renderPanel(); } }, t.label))) : null,
      h('div', { class: 'body' }, view.body));
    // atualização suave: só substitui se o conteúdo mudou (mantém hover e estabilidade dos botões)
    if (soft && wrap.firstElementChild && wrap.firstElementChild.innerHTML === panel.innerHTML) return;
    wrap.classList.remove('hidden');
    wrap.innerHTML = '';
    wrap.append(panel);
    if (soft || prevBody) (panel.querySelector('.body') as HTMLElement).scrollTop = scroll;
  }

  private view(m: Modal): PanelView {
    switch (m.name) {
      case 'program': return programPanel(this);
      case 'inbox': this.sim.markInboxSeen(); return inboxPanel(this);
      case 'room': this.renderer.selected = m.arg as RoomId; return roomPanel(this, m.arg as RoomId);
      case 'build': return buildPanel(this);
      case 'staff': return staffPanel(this);
      case 'finance': return financePanel(this);
      case 'missions': return missionsPanel(this);
      case 'menu': return menuPanel(this);
      case 'help': return helpPanel();
      case 'result': return resultPanel(this, m.arg as number);
      case 'levelup': return levelupPanel(this, m.arg as { level: number; unlocks: string[] });
      case 'decision': {
        const pe = this.sim.state.pendingEvent;
        if (!pe) { queueMicrotask(() => this.close()); return { title: '', body: h('div'), modal: true }; }
        const def = RANDOM_EVENT_BY_ID[pe.id];
        return decisionPanel(this, { title: def.title, text: def.text(this.sim.state, pe.data), choices: def.choices(this.sim.state, pe.data) });
      }
    }
  }

  /** Clique no mundo: abrir o painel adequado. */
  openForHit(room: RoomId | null, object: string): void {
    if (object === 'boxoffice') { this.open('room', 'lobby'); return; }
    if (object === 'bar') { this.tab['room-bar'] = 'stock'; this.open('room', 'bar'); return; }
    if (room) this.open('room', room);
  }

  private chipTimer = 0;

  /** Cartão rápido da sala tocada (não bloqueia o movimento). */
  showRoomChip(room: RoomId): void {
    const el = this.els.roomchip;
    const def = ROOMS[room];
    el.innerHTML = '';
    el.append(h('span', null, def.name), h('button', { class: 'btn gold', onclick: () => { this.open('room', room); el.classList.add('hidden'); } }, 'Gerir ›'));
    el.classList.remove('hidden');
    clearTimeout(this.chipTimer);
    this.chipTimer = window.setTimeout(() => el.classList.add('hidden'), 4500);
  }
}

function isModal(n: PanelName): boolean {
  return n === 'result' || n === 'levelup' || n === 'decision';
}
