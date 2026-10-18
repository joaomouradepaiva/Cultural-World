// Caixa de propostas: artistas que querem atuar, empresas que querem alugar salas e formadores com workshops.
// As propostas chegam todas as manhãs, têm validade e, ao serem aceites, entram na agenda como qualquer evento.

import type { ArtistDef } from '../content/artists';
import { availableArtists } from './scene';
import { workshopInterest } from './audience';
import { exhibitionProposalData, scheduleExhibition, validateExhibition, type ExhibitionRequest } from './gallery';
import { BALANCE } from '../content/balance';
import { ROOMS } from '../content/rooms';
import { artistDates, artistUnlocked, contractTerms, createBooking, findConflict, setupMinutes, validateBooking, type BookingRequest } from './bookings';
import { log, newId, type Ctx } from './core';
import { chance, pick, rand, randInt } from './rng';
import { acceptSponsor, sponsorErrors, sponsorProposal } from './sponsors';
import { isOperational, roomCapacity } from './state';
import { at, dayOf, fmtClock, fmtDayShort, MIN_PER_DAY, weekdayOf } from './time';
import type { Contract, GameState, Proposal, RoomId } from './types';

const COMPANIES = ['Ondas Tech', 'Banco Atlântico', 'Lusa Seguros', 'Verde Energia', 'Farmácias Sol', 'Grupo Ribeira', 'Studio Pixel', 'Cooperativa do Vale', 'Turismo da Cidade', 'Câmara Municipal'];
const CORP_EVENTS = [
  { title: 'Reunião anual', bar: 0.7 },
  { title: 'Lançamento de produto', bar: 1.1 },
  { title: 'Formação interna', bar: 0.6 },
  { title: 'Conferência', bar: 0.8 },
  { title: 'Festa de equipa', bar: 1.4 },
];
const WORKSHOPS = [
  { topic: 'Fotografia de rua', price: 25, color: '#4cc9f0' },
  { topic: 'Escrita criativa', price: 20, color: '#f4a261' },
  { topic: 'Produção musical', price: 35, color: '#7209b7' },
  { topic: 'Teatro para adultos', price: 22, color: '#e63946' },
  { topic: 'Dança contemporânea', price: 18, color: '#b5179e' },
  { topic: 'Ilustração', price: 24, color: '#2a9d8f' },
  { topic: 'Iniciação ao DJing', price: 30, color: '#00e5ff' },
  { topic: 'Voz e canto', price: 26, color: '#ffbe0b' },
];
const TEACHERS = ['Marta Lobo', 'Rui Teles', 'Inês Prado', 'Hugo Sena', 'Sofia Mar', 'Tiago Quintas', 'Leonor Faria', 'Nuno Brito'];

function showRooms(s: GameState): RoomId[] {
  return (['hall', 'blackbox'] as RoomId[]).filter((r) => isOperational(s, r));
}

/** Procura uma data livre a partir de `minDays` dias. Devolve null se a agenda estiver cheia. */
function freeSlot(s: GameState, rooms: RoomId[], hours: number[], minDays: number, maxDays: number, duration: number, setup: number, weekdaysOnly = false) {
  const today = dayOf(s.time);
  for (let tries = 0; tries < 12; tries++) {
    const day = today + randInt(s, minDays, maxDays);
    if (weekdaysOnly && weekdayOf(day * MIN_PER_DAY) >= 5) continue;
    const roomId = pick(s, rooms);
    const startAt = at(day, pick(s, hours));
    if (startAt > s.time + BALANCE.maxAdvanceDays * MIN_PER_DAY - 60) continue;
    const from = startAt - setup, to = startAt + duration + BALANCE.baseCleanup;
    const clashesProposal = s.inbox.some((p) => p.roomId === roomId && Math.abs(p.startAt - startAt) < 6 * 60);
    if (!clashesProposal && !findConflict(s, roomId, from, to)) return { roomId, startAt };
  }
  return null;
}

function base(s: GameState, kind: Proposal['kind']): Pick<Proposal, 'id' | 'kind' | 'createdAt' | 'expiresAt' | 'seen'> {
  return { id: newId(s), kind, createdAt: s.time, expiresAt: s.time + BALANCE.proposalExpiryDays * MIN_PER_DAY, seen: false };
}

export function artistProposal(s: GameState): Proposal | null {
  const rooms = showRooms(s);
  if (!rooms.length) return null;
  const pending = new Set(s.inbox.map((p) => p.artistId));
  const pool = availableArtists(s).filter((a) => artistUnlocked(s, a) && !pending.has(a.id));
  if (!pool.length) return null;
  const a = pick(s, pool);
  const slot = freeSlot(s, rooms, [19, 20, 21, 22], 3, 13, a.duration, setupMinutes(s, a));
  if (!slot) return null;
  const tooClose = artistDates(s, a.id).some((t) => Math.abs(t - slot.startAt) < BALANCE.artistCooldownDays * MIN_PER_DAY);
  if (tooClose) return null;
  // o artista propõe termos um pouco melhores do que os de catálogo
  const types: Contract['type'][] = s.level >= 2 ? ['fixed', 'split', 'guarantee'] : ['fixed', 'split'];
  const type = pick(s, types);
  const c = contractTerms(s, a.id, type, slot.roomId);
  c.fee = Math.round(c.fee * BALANCE.proposalFeeDiscount);
  c.guarantee = Math.round(c.guarantee * BALANCE.proposalFeeDiscount);
  if (type === 'split') c.artistShare = Math.max(0.5, Math.round((c.artistShare - 0.05) * 100) / 100);
  const lines = [
    'Temos datas livres e gostávamos muito de tocar no vosso espaço.',
    'Ouvimos falar bem da vossa sala. Fazemos condições especiais.',
    'Estamos em digressão e há uma data que encaixa convosco.',
  ];
  return {
    ...base(s, 'artist'), roomId: slot.roomId, startAt: slot.startAt, from: a.name, title: `${a.name} quer atuar`,
    text: pick(s, lines), artistId: a.id, custom: null, contract: c, ticketPrice: a.refPrice, participants: 0,
  };
}

export function corporateProposal(s: GameState): Proposal | null {
  const rooms = showRooms(s);
  if (!rooms.length) return null;
  const ev = pick(s, CORP_EVENTS);
  const company = pick(s, COMPANIES);
  const duration = ev.title === 'Festa de equipa' ? 180 : 150;
  const slot = freeSlot(s, rooms, ev.title === 'Festa de equipa' ? [18, 19] : [10, 11, 14, 15], 2, 12, duration, BALANCE.setupByDiscipline.corporate, true);
  if (!slot) return null;
  const cap = roomCapacity(s, slot.roomId);
  const participants = Math.max(8, Math.min(cap, randInt(s, Math.round(cap * 0.5), cap)));
  const fee = Math.round(120 + cap * 3 + rand(s, 0, 150) + (slot.roomId === 'hall' ? 60 : 0));
  const custom: ArtistDef = {
    id: `corp-${company.toLowerCase().replace(/[^a-z]+/g, '-')}`, name: `${ev.title} · ${company}`, discipline: 'corporate', genre: 'Evento corporativo',
    members: 1, draw: participants, refPrice: 1, cachet: 0, skill: 70, rider: { sound: 0, light: 0, stage: 0 }, minLevel: 1, minRep: 0,
    duration, barFactor: ev.bar, colors: ['#90a4ae', '#ffffff'], splitShare: 0, bio: `${company}: ${participants} participantes.`,
  };
  return {
    ...base(s, 'corporate'), roomId: slot.roomId, startAt: slot.startAt, from: company, title: `${ev.title} — ${company}`,
    text: `Procuramos uma sala para ${participants} pessoas. Pagamos o aluguer e trazemos o nosso programa.`,
    artistId: custom.id, custom, contract: { type: 'rental', fee: 0, artistShare: 0, guarantee: 0, rent: fee }, ticketPrice: 0, participants,
  };
}

export function workshopProposal(s: GameState): Proposal | null {
  const rooms = showRooms(s);
  if (!rooms.length) return null;
  const w = pick(s, WORKSHOPS);
  const teacher = pick(s, TEACHERS);
  const slot = freeSlot(s, rooms, [10, 11, 15, 18], 3, 13, 150, BALANCE.setupByDiscipline.workshop);
  if (!slot) return null;
  const cap = roomCapacity(s, slot.roomId);
  const demand = 8 + s.rep.training / 4 + s.rep.community / 8 + workshopInterest(s) / 3;
  const participants = Math.max(6, Math.min(cap, Math.round(demand * rand(s, 0.8, 1.3))));
  const share = pick(s, [0.5, 0.55, 0.6]);
  const custom: ArtistDef = {
    id: `ws-${w.topic.toLowerCase().replace(/[^a-z]+/g, '-')}`, name: `Workshop: ${w.topic}`, discipline: 'workshop', genre: 'Formação',
    members: 1, draw: participants, refPrice: w.price, cachet: 0, skill: Math.round(rand(s, 58, 82)), rider: { sound: 0, light: 0, stage: 0 }, minLevel: 1, minRep: 0,
    duration: 150, barFactor: 0.6, colors: [w.color, '#ffffff'], splitShare: share, bio: `Com ${teacher}. ${participants} inscrições previstas a €${w.price}.`,
  };
  return {
    ...base(s, 'workshop'), roomId: slot.roomId, startAt: slot.startAt, from: teacher, title: `Workshop de ${w.topic}`,
    text: `Proponho um workshop de 2h30. Divulgo junto dos meus alunos; fico com ${Math.round(share * 100)}% das inscrições.`,
    artistId: custom.id, custom, contract: { type: 'split', fee: 0, artistShare: share, guarantee: 0, rent: 0 }, ticketPrice: w.price, participants,
  };
}

export function exhibitionProposal(s: GameState): Proposal | null {
  const d = exhibitionProposalData(s);
  if (!d) return null;
  const { a, req } = d;
  return {
    ...base(s, 'exhibition'), roomId: 'gallery', startAt: at(req.startDay, 11), from: a.name, title: `Exposição: ${a.name}`,
    text: `${a.medium}. Trazemos ${a.works} obras e tratamos da divulgação; o espaço fica com ${Math.round(req.commission! * 100)}% das vendas.`,
    artistId: a.id, custom: null, contract: { type: 'split', fee: 0, artistShare: 0, guarantee: 0, rent: 0 }, ticketPrice: req.entryPrice, participants: 0,
    exhibition: { days: req.days, entryPrice: req.entryPrice, commission: req.commission! },
  };
}

export function exhibitionRequestOf(p: Proposal): ExhibitionRequest {
  return { artistId: p.artistId, startDay: dayOf(p.startAt), days: p.exhibition!.days, entryPrice: p.exhibition!.entryPrice, commission: p.exhibition!.commission };
}

export function proposalRequest(p: Proposal): BookingRequest {
  return {
    roomId: p.roomId, artistId: p.artistId, startAt: p.startAt, ticketPrice: p.ticketPrice, contractType: p.contract.type, marketing: 'none',
    kind: p.kind === 'artist' ? 'show' : (p.kind as 'corporate' | 'workshop'), custom: p.custom, participants: p.participants, contract: p.contract,
  };
}

export function proposalErrors(s: GameState, p: Proposal): string[] {
  if (p.kind === 'exhibition') return validateExhibition(s, exhibitionRequestOf(p));
  if (p.kind === 'sponsor') return sponsorErrors(s, p);
  return validateBooking(s, proposalRequest(p));
}

/** Rotina diária: expira propostas antigas e gera novas. */
export function dailyProposals(ctx: Ctx): void {
  const s = ctx.state;
  const before = s.inbox.length;
  s.inbox = s.inbox.filter((p) => p.expiresAt > s.time && p.startAt > s.time + 120);
  if (s.inbox.length < before) log(ctx, `${before - s.inbox.length} proposta(s) expirou/expiraram.`, 'info', false);
  const fresh: Proposal[] = [];
  // cada proposta entra logo na caixa, para a seguinte não repetir o mesmo artista nem a mesma data
  const add = (p: Proposal | null) => { if (p) { s.inbox.push(p); fresh.push(p); } };
  const room = () => s.inbox.length < BALANCE.inboxMax;
  if (room() && chance(s, BALANCE.artistProposalChance)) add(artistProposal(s));
  if (room() && s.level >= 3 && chance(s, BALANCE.extraArtistProposalChance)) add(artistProposal(s));
  // um artista bem acolhido recomenda a casa: chega mais uma proposta
  if (s.flags.artistRecommendation) { s.flags.artistRecommendation = false; if (room()) add(artistProposal(s)); }
  if (room() && s.level >= BALANCE.proposalMinLevel && chance(s, BALANCE.corporateProposalChance)) add(corporateProposal(s));
  if (room() && s.level >= BALANCE.proposalMinLevel && chance(s, BALANCE.workshopProposalChance)) add(workshopProposal(s));
  if (room() && chance(s, BALANCE.exhibitionProposalChance)) add(exhibitionProposal(s));
  if (room() && chance(s, 0.25)) add(sponsorProposal(s));
  for (const p of fresh) {
    log(ctx, `📥 Nova proposta: ${p.title} (${fmtDayShort(p.startAt)} ${fmtClock(p.startAt)}, ${ROOMS[p.roomId].short})`, 'info');
  }
  if (fresh.length) ctx.emit({ type: 'sound', name: 'notify' });
}

export function acceptProposal(ctx: Ctx, id: number) {
  const s = ctx.state;
  const p = s.inbox.find((x) => x.id === id);
  if (!p) return { ok: false as const, errors: ['Proposta indisponível.'] };
  if (p.kind === 'exhibition') {
    const r = scheduleExhibition(ctx, exhibitionRequestOf(p));
    if (r.ok) s.inbox = s.inbox.filter((x) => x.id !== id);
    return r.ok ? { ok: true as const } : r;
  }
  if (p.kind === 'sponsor') {
    const errs = sponsorErrors(s, p);
    if (errs.length || !acceptSponsor(ctx, p)) return { ok: false as const, errors: errs.length ? errs : ['Não foi possível assinar.'] };
    s.inbox = s.inbox.filter((x) => x.id !== id);
    return { ok: true as const };
  }
  const r = createBooking(ctx, proposalRequest(p));
  if (r.ok) {
    s.inbox = s.inbox.filter((x) => x.id !== id);
    if (p.kind === 'artist') s.artists[p.artistId].relationship = Math.min(100, s.artists[p.artistId].relationship + 3);
  }
  return r;
}

export function declineProposal(ctx: Ctx, id: number): boolean {
  const s = ctx.state;
  const p = s.inbox.find((x) => x.id === id);
  if (!p) return false;
  s.inbox = s.inbox.filter((x) => x.id !== id);
  if (p.kind === 'artist' && s.artists[p.artistId]) s.artists[p.artistId].relationship = Math.max(0, s.artists[p.artistId].relationship - 2);
  return true;
}
