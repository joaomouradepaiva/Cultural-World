// Arranque do CULTURE WORLD: liga simulação, renderização, áudio, interface e gravação.

import './ui/styles.css';
import { AudioEngine } from './audio/audio';
import { SPOTS } from './content/map';
import { Renderer } from './render/renderer';
import { deserialize, loadFrom, saveTo, SAVE_KEY, serialize } from './sim/save';
import { Simulation } from './sim/sim';
import { createInitialState, liveBookingIn } from './sim/state';
import { ARTIST_BY_ID } from './content/artists';
import { STAGES } from './content/map';
import { px, py } from './render/iso';
import { h } from './ui/dom';
import { Input } from './ui/input';
import { UI } from './ui/ui';
import type { RoomId } from './sim/types';

const AUTOSAVE_SECONDS = 20;

function storage(): Storage | null {
  try {
    const k = '__cw_test';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return localStorage;
  } catch {
    return null;
  }
}

function boot(): void {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const store = storage();
  const saved = store ? loadFrom(store) : null;
  showSplash(!!saved, (cont) => start(canvas, cont && saved ? new Simulation(saved) : new Simulation(createInitialState(Date.now() % 2147483647))));
}

function showSplash(hasSave: boolean, go: (cont: boolean) => void): void {
  const ui = document.getElementById('ui')!;
  const splash = h('div', { class: 'splash' },
    h('div', { class: 'box' },
      h('h1', null, 'CULTURE WORLD'),
      h('p', null, 'Transforma um armazém abandonado num centro cultural de referência. Programa concertos, serve no bar, contrata a equipa e faz crescer a reputação.'),
      h('div', { class: 'btns' },
        hasSave ? h('button', { class: 'btn gold big', onclick: () => { splash.remove(); go(true); } }, '▶ Continuar') : null,
        h('button', { class: `btn ${hasSave ? 'ghost' : 'gold'} big`, onclick: (e: Event) => {
          const btn = e.currentTarget as HTMLButtonElement;
          if (hasSave && !btn.dataset.armed) { btn.dataset.armed = '1'; btn.textContent = 'Toca de novo: apaga o progresso guardado'; return; }
          splash.remove(); go(false);
        } }, hasSave ? 'Novo jogo' : '▶ Jogar')),
      h('p', { style: { fontSize: '12px', marginTop: '16px' } }, 'Desktop: clique, arrastar, roda do rato, WASD · Mobile: tocar, arrastar, pinça')));
  ui.append(splash);
}

function start(canvas: HTMLCanvasElement, sim: Simulation): void {
  const store = storage();
  const renderer = new Renderer(canvas);
  const audio = new AudioEngine();
  audio.unlock();
  renderer.cam.setNow(px(8, 13), py(8, 13) - 40, renderer.fitZoom());

  const save = () => {
    if (!store) { ui.toast('Armazenamento local indisponível: o progresso não pode ser guardado.', 'bad'); return; }
    if (saveTo(store, sim.state)) ui.toast('Jogo guardado.', 'info');
  };
  const quietSave = () => { if (store) saveTo(store, sim.state); };

  const ui = new UI(sim, renderer, audio, {
    save,
    exportSave: () => {
      const blob = new Blob([serialize(sim.state)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `culture-world-save-dia${Math.floor(sim.state.time / 1440) + 1}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    },
    importSave: () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/json,.json';
      input.onchange = async () => {
        const f = input.files?.[0];
        if (!f) return;
        try {
          const st = deserialize(await f.text());
          if (store) saveTo(store, st);
          location.reload();
        } catch (e) {
          ui.toast(`Save inválido: ${(e as Error).message}`, 'bad');
        }
      };
      input.click();
    },
    newGame: () => {
      store?.removeItem(SAVE_KEY);
      location.reload();
    },
  });

  const input = new Input(canvas, renderer, {
    gesture: () => audio.unlock(),
    tap: (sx, sy) => {
      if (ui.isOpen) return;
      const hit = renderer.hit(sx, sy, sim.state);
      switch (hit.object) {
        case 'plot':
        case 'stage':
          if (hit.room) ui.open('room', hit.room);
          break;
        case 'boxoffice':
          sim.walkPlayerTo(SPOTS.boxOfficeServers[0][0], SPOTS.boxOfficeServers[0][1]);
          ui.showRoomChip('lobby');
          break;
        case 'bar':
          sim.walkPlayerTo(SPOTS.barServers[1][0], SPOTS.barServers[1][1]);
          ui.showRoomChip('bar');
          break;
        default:
          if (sim.walkPlayerTo(hit.x, hit.y)) {
            renderer.cam.follow(false);
            if (hit.room) ui.showRoomChip(hit.room);
          }
      }
    },
    move: (dx, dy, dt) => {
      sim.nudgePlayer(dx, dy, dt);
      renderer.cam.follow(true);
    },
    key: (k) => {
      if (k === 'escape') { if (ui.isOpen) ui.close(); return; }
      if (ui.isOpen) return;
      if (k === ' ') sim.setSpeed(sim.state.speed === 0 ? 1 : 0);
      else if (k === '1') sim.setSpeed(1);
      else if (k === '2') sim.setSpeed(2);
      else if (k === '3') sim.setSpeed(4);
      else if (k === 'p') { ui.tab.program = 'new'; ui.open('program'); }
      else if (k === 'b') ui.open('build');
      else if (k === 'e') ui.open('staff');
      else if (k === 'm') ui.open('missions');
      else if (k === 'f') renderer.cam.follow(!renderer.cam.isFollowing);
    },
  });

  window.addEventListener('resize', () => renderer.resize());
  document.addEventListener('visibilitychange', () => { if (document.hidden) quietSave(); });
  window.addEventListener('pagehide', quietSave);

  let last = performance.now();
  let saveTimer = AUTOSAVE_SECONDS;
  let audioTimer = 0;
  const frame = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    input.update(dt);
    sim.update(dt);
    const events = sim.drain();
    renderer.consume(events, sim.state);
    ui.handleEvents(events);
    ui.update(dt);
    renderer.render(sim, dt);
    audioTimer -= dt;
    if (audioTimer <= 0) { audioTimer = 0.1; audio.ambient(ambientFor(sim, renderer)); }
    saveTimer -= dt;
    if (saveTimer <= 0) { saveTimer = AUTOSAVE_SECONDS; quietSave(); }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  // gancho de depuração / testes automáticos
  (window as unknown as { __cw: unknown }).__cw = { sim, renderer, ui };
}

function ambientFor(sim: Simulation, r: Renderer) {
  const s = sim.state;
  const visitors = s.agents.filter((a) => a.kind === 'visitor' || a.kind === 'casual').length;
  const zoomF = Math.min(1, 0.4 + r.cam.zoom * 0.6);
  let show: { kind: 'music' | 'theater' | 'comedy' | 'dance'; volume: number; tempo: number; seed: number } | null = null;
  for (const id of ['hall', 'blackbox'] as RoomId[]) {
    const b = liveBookingIn(s, id);
    if (!b || b.status !== 'live') continue;
    const st = STAGES[id]!;
    const cx = (st.x0 + st.x1) / 2, cy = 3;
    const d = Math.hypot(r.cam.x - px(cx, cy), r.cam.y - py(cx, cy));
    const vol = Math.max(0.08, 1 - d / 1100) * zoomF;
    const a = ARTIST_BY_ID[b.artistId];
    if (!show || vol > show.volume) show = { kind: a.discipline, volume: vol, tempo: 96 + (a.id.length * 7) % 40, seed: a.id.charCodeAt(0) };
  }
  const reh = s.agents.some((a) => a.kind === 'band' && a.state === 'rehearse') ? 0.4 : 0;
  return { crowd: Math.min(1, visitors / 50) * zoomF, show, rehearsal: reh, bar: s.counters.bar.queue.length ? 0.6 : 0 };
}

boot();
