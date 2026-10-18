// Missões (curto e longo prazo) e passos do tutorial.

import type { GameState } from '../sim/types';
import { roomCenter, SPOTS } from './map';

export interface MissionDef {
  id: string;
  title: string;
  desc: string;
  money: number;
  xp: number;
  progress: (s: GameState) => [number, number];
  after?: string;
}

const built = (s: GameState, r: keyof GameState['rooms']) => (s.rooms[r].built ? 1 : 0);

export const MISSIONS: MissionDef[] = [
  { id: 'first_concert', title: 'Primeiro concerto', desc: 'Realiza o teu primeiro evento.', money: 300, xp: 50, progress: (s) => [s.progress.totalEvents, 1] },
  { id: 'open_bar', title: 'Abrir o bar', desc: 'Constrói o bar.', money: 200, xp: 30, progress: (s) => [built(s, 'bar'), 1] },
  { id: 'first_upgrade', title: 'Primeira melhoria', desc: 'Compra uma melhoria num espaço.', money: 150, xp: 20, progress: (s) => [s.progress.upgradesBought, 1] },
  { id: 'first_hire', title: 'Primeiro funcionário', desc: 'Contrata alguém para a equipa.', money: 200, xp: 30, progress: (s) => [s.staff.length > 0 ? 1 : 0, 1] },
  { id: 'tickets_100', title: 'Vender 100 bilhetes', desc: 'Total acumulado de bilhetes vendidos.', money: 400, xp: 60, progress: (s) => [s.progress.totalTickets, 100], after: 'first_concert' },
  { id: 'sellout', title: 'Esgotar uma sala', desc: 'Vende todos os lugares de um evento.', money: 250, xp: 40, progress: (s) => [s.progress.soldOuts, 1], after: 'first_concert' },
  { id: 'drinks_100', title: '100 bebidas servidas', desc: 'O bar é o melhor amigo da bilheteira.', money: 300, xp: 40, progress: (s) => [s.progress.drinksServed, 100], after: 'open_bar' },
  { id: 'comedy', title: 'Noite de stand-up', desc: 'Programa e realiza um espetáculo de stand-up.', money: 300, xp: 40, progress: (s) => [s.progress.eventsByDiscipline.comedy, 1], after: 'first_concert' },
  { id: 'corporate', title: 'Cliente empresarial', desc: 'Aceita uma proposta de empresa e realiza o evento.', money: 300, xp: 40, progress: (s) => [s.progress.eventsByDiscipline.corporate ?? 0, 1], after: 'first_concert' },
  { id: 'workshop', title: 'Primeira formação', desc: 'Realiza um workshop proposto por um formador.', money: 300, xp: 40, progress: (s) => [s.progress.eventsByDiscipline.workshop ?? 0, 1], after: 'first_concert' },
  { id: 'events_5', title: '5 eventos', desc: 'Realiza 5 eventos.', money: 500, xp: 80, progress: (s) => [s.progress.totalEvents, 5], after: 'tickets_100' },
  { id: 'blackbox', title: 'Segunda sala', desc: 'Constrói a Black Box (nível 3).', money: 800, xp: 100, progress: (s) => [built(s, 'blackbox'), 1], after: 'first_upgrade' },
  { id: 'theater', title: 'Subir o pano', desc: 'Realiza um espetáculo de teatro.', money: 400, xp: 50, progress: (s) => [s.progress.eventsByDiscipline.theater, 1], after: 'events_5' },
  { id: 'rep_30', title: 'Reputação 30', desc: 'Atinge reputação geral 30.', money: 600, xp: 80, progress: (s) => [Math.floor(s.rep.general), 30], after: 'events_5' },
  { id: 'wc', title: 'Conforto para todos', desc: 'Constrói as instalações sanitárias.', money: 300, xp: 40, progress: (s) => [built(s, 'wc'), 1], after: 'blackbox' },
  { id: 'staff_3', title: 'Equipa a crescer', desc: 'Tem 3 pessoas na equipa.', money: 400, xp: 50, progress: (s) => [s.staff.length, 3], after: 'first_hire' },
  { id: 'rehearsal', title: 'Casa de ensaios', desc: 'Constrói a sala de ensaio (nível 4).', money: 500, xp: 60, progress: (s) => [built(s, 'rehearsal'), 1], after: 'blackbox' },
  { id: 'visitors_1000', title: '1.000 visitantes', desc: 'Total de visitantes recebidos.', money: 1200, xp: 150, progress: (s) => [s.progress.totalVisitors, 1000], after: 'events_5' },
  { id: 'level_5', title: 'Espaço Independente', desc: 'Chega ao nível 5.', money: 1000, xp: 0, progress: (s) => [s.level, 5], after: 'rep_30' },
  { id: 'profit_1000', title: 'Noite em grande', desc: 'Um evento com resultado ≥ €1.000.', money: 1000, xp: 120, progress: (s) => [Math.max(0, Math.floor(s.progress.bestEventNet)), 1000], after: 'level_5' },
  { id: 'events_20', title: '20 eventos', desc: 'Realiza 20 eventos.', money: 2000, xp: 200, progress: (s) => [s.progress.totalEvents, 20], after: 'events_5' },
  { id: 'staff_6', title: 'Equipa profissional', desc: 'Tem 6 pessoas na equipa.', money: 1000, xp: 120, progress: (s) => [s.staff.length, 6], after: 'staff_3' },
  { id: 'rep_60', title: 'Referência na cidade', desc: 'Atinge reputação geral 60.', money: 3000, xp: 300, progress: (s) => [Math.floor(s.rep.general), 60], after: 'rep_30' },
  { id: 'visitors_10000', title: '10.000 visitantes', desc: 'Total de visitantes recebidos.', money: 8000, xp: 800, progress: (s) => [s.progress.totalVisitors, 10000], after: 'visitors_1000' },
  { id: 'events_100', title: '100 eventos', desc: 'Realiza 100 eventos.', money: 10000, xp: 1000, progress: (s) => [s.progress.totalEvents, 100], after: 'events_20' },
];

export const MISSION_BY_ID = Object.fromEntries(MISSIONS.map((m) => [m.id, m]));

export type TutorialTarget =
  | { kind: 'world'; x: number; y: number }
  | { kind: 'ui'; id: string }
  | null;

export interface TutorialStep {
  id: string;
  title: string;
  text: string;
  done: (s: GameState) => boolean;
  target: (s: GameState) => TutorialTarget;
  manual?: boolean;
}

const playerInHall = (s: GameState) => s.player.x >= 1 && s.player.x < 15 && s.player.y >= 1 && s.player.y < 11;
const firstBooking = (s: GameState) => s.bookings[0];

export const TUTORIAL: TutorialStep[] = [
  { id: 'welcome', title: 'Bem-vindo ao CULTURE WORLD', manual: true,
    text: 'Herdaste um armazém abandonado. A missão: transformá-lo num centro cultural de referência. Primeiro objetivo: um concerto para 20 pessoas.',
    done: () => false, target: () => null },
  { id: 'enter', title: 'Entra no espaço', text: 'Toca/clica no chão da Sala Principal para caminhares até lá. (Também podes usar WASD ou setas.)',
    done: playerInHall, target: () => { const [x, y] = roomCenter('hall'); return { kind: 'world', x, y }; } },
  { id: 'clean', title: 'Prepara a sala', text: 'O armazém está cheio de lixo. Passa por cima de cada monte para o limpar.',
    done: (s) => s.rooms.hall.dirt.length === 0,
    target: (s) => { const d = s.rooms.hall.dirt[0]; return d ? { kind: 'world', x: d.x, y: d.y } : null; } },
  { id: 'bar', title: 'Abre o bar', text: 'O público vai ter sede. Toca na zona em obras à direita do átrio e constrói o Bar (€500).',
    done: (s) => s.rooms.bar.built || !!s.rooms.bar.construction, target: () => { const [x, y] = roomCenter('bar'); return { kind: 'world', x, y }; } },
  { id: 'book', title: 'Contrata um artista', text: 'Abre a Programação, escolhe "Os Ventiladores", define o preço do bilhete e marca o concerto para hoje à noite.',
    done: (s) => s.bookings.length > 0, target: () => ({ kind: 'ui', id: 'btn-program' }) },
  { id: 'wait', title: 'Bilhetes à venda', text: 'Os bilhetes vendem-se progressivamente até à abertura de portas. Acelera o tempo (⏩) e acompanha as vendas no cartão do próximo evento.',
    done: (s) => { const b = firstBooking(s); return !!b && (b.status === 'doors' || b.status === 'live' || b.status === 'ended' || b.status === 'settled'); },
    target: () => ({ kind: 'ui', id: 'speed-controls' }) },
  { id: 'boxoffice', title: 'Vai para a bilheteira', text: 'As portas abriram! Quem não comprou antes faz fila na bilheteira. Fica junto ao balcão para vender bilhetes à porta.',
    done: (s) => { const b = firstBooking(s); return !!b && (b.doorSold > 0 || b.status === 'live' || b.status === 'ended' || b.status === 'settled'); },
    target: () => ({ kind: 'world', x: SPOTS.boxOfficeServers[0][0], y: SPOTS.boxOfficeServers[0][1] }) },
  { id: 'show', title: 'O espetáculo', text: 'Assiste ao concerto! Quando acabar, o público vai ao bar. Vai para trás do balcão e serve bebidas.',
    done: (s) => { const b = firstBooking(s); return !!b && (b.status === 'ended' || b.status === 'settled'); },
    target: () => { const [x, y] = roomCenter('hall'); return { kind: 'world', x, y: y - 3 }; } },
  { id: 'serve', title: 'Serve no bar', text: 'Fica atrás do balcão do bar para servir. Cada bebida conta para o resultado do evento.',
    done: (s) => { const b = firstBooking(s); return !!b && b.status === 'settled'; },
    target: () => ({ kind: 'world', x: SPOTS.barServers[1][0], y: SPOTS.barServers[1][1] }) },
  { id: 'results', title: 'Resultado financeiro', text: 'Vê o relatório do evento: bilheteira, bar, cachet e custos. Fecha o relatório para continuar.',
    done: (s) => !!s.flags.seenResult, target: () => null },
  { id: 'upgrade', title: 'Reinvestir', text: 'Toca no palco da Sala Principal (ou em Construir → Gerir) e compra uma melhoria — por exemplo, Plateia para 40 lugares.',
    done: (s) => s.progress.upgradesBought > 0, target: () => { const [x, y] = roomCenter('hall'); return { kind: 'world', x, y }; } },
  { id: 'hire', title: 'Contrata a equipa', text: 'Não podes estar em todo o lado. Abre a Equipa e contrata um bilheteiro ou um empregado de bar.',
    done: (s) => s.staff.length > 0, target: () => ({ kind: 'ui', id: 'btn-staff' }) },
  { id: 'expand', title: 'Expandir', text: 'Continua a programar eventos para chegar ao nível 3 e constrói a Black Box, a tua segunda sala.',
    done: (s) => s.rooms.blackbox.built || !!s.rooms.blackbox.construction, target: () => { const [x, y] = roomCenter('blackbox'); return { kind: 'world', x, y }; } },
  { id: 'end', title: 'Tutorial concluído', manual: true,
    text: 'O centro cultural é teu. Equilibra programação, bar e equipa, segue as missões e faz crescer a reputação.',
    done: () => false, target: () => null },
];
