// Tipos do estado da simulação. Tudo aqui é JSON-serializável: o save é o próprio estado.

import type { ArtistDef } from '../content/artists';

export type Discipline = 'music' | 'theater' | 'comedy' | 'dance' | 'corporate' | 'workshop';
export type BookingKind = 'show' | 'corporate' | 'workshop';
export type RepKey = 'general' | 'music' | 'theater' | 'visual' | 'cinema' | 'training' | 'community';
export type RoomId = 'lobby' | 'hall' | 'blackbox' | 'bar' | 'wc' | 'rehearsal' | 'gallery';
export type StaffRole = 'boxoffice' | 'bartender' | 'technician' | 'cleaner' | 'barmanager';
export type ContractType = 'fixed' | 'split' | 'guarantee' | 'rental';
export type MarketingId = 'none' | 'posters' | 'social' | 'press' | 'radio';
export type ProductId = 'water' | 'soda' | 'beer' | 'wine' | 'snack' | 'cocktail' | 'toast';
export type CounterId = 'boxoffice' | 'bar';

export type IncomeCat = 'tickets' | 'bar' | 'gallery' | 'rentals' | 'missions' | 'sponsorship' | 'other';
export type ExpenseCat =
  | 'artists' | 'salaries' | 'rent' | 'maintenance' | 'energy' | 'stock' | 'marketing'
  | 'construction' | 'upgrades' | 'equipment' | 'insurance' | 'refunds' | 'exhibitions' | 'other';

export interface Look {
  skin: number;
  hair: number;
  hairStyle: number;
  shirt: number;
  pants: number;
}

export interface Contract {
  type: ContractType;
  /** cachet fixo (pago na marcação) */
  fee: number;
  /** percentagem do artista (split e guarantee) */
  artistShare: number;
  /** mínimo garantido (guarantee) */
  guarantee: number;
  /** renda paga pelo promotor (rental) */
  rent: number;
}

export interface BookingStats {
  ticketRevenue: number;
  barRevenue: number;
  barCost: number;
  drinks: number;
  lostTicket: number;
  lostImpatient: number;
  lostBar: number;
  waitTotal: number;
  waitCount: number;
  equipmentRental: number;
  marketingCost: number;
  upfrontFee: number;
  cleanliness: number;
}

export interface EventResult {
  attendance: number;
  capacity: number;
  ticketRevenue: number;
  artistPay: number;
  rentIncome: number;
  barRevenue: number;
  barCost: number;
  energy: number;
  cleaning: number;
  equipmentRental: number;
  marketing: number;
  net: number;
  quality: number;
  satisfaction: number;
  scores: { quality: number; value: number; service: number; cleanliness: number; crowd: number; comfort: number };
  repDelta: number;
  xp: number;
  soldOut: boolean;
}

export type BookingStatus = 'scheduled' | 'setup' | 'doors' | 'live' | 'ended' | 'settled' | 'cancelled';

export interface Booking {
  id: number;
  kind: BookingKind;
  roomId: RoomId;
  artistId: string;
  /** ficha própria para eventos fora do catálogo (empresas, formações) */
  custom: ArtistDef | null;
  /** participantes inscritos (empresas, formações) */
  participants: number;
  contract: Contract;
  ticketPrice: number;
  startAt: number;
  duration: number;
  setup: number;
  cleanup: number;
  createdAt: number;
  marketing: MarketingId;
  demand: number;
  presaleTarget: number;
  capacity: number;
  presold: number;
  doorSold: number;
  walkupTarget: number;
  spawned: number;
  presoldSpawned: number;
  attendees: number;
  seatCursor: number;
  status: BookingStatus;
  stats: BookingStats;
  quality: number;
  result: EventResult | null;
  soldOutNotified: boolean;
  demandBoost: number;
}

export interface Dirt {
  id: number;
  x: number;
  y: number;
  kind: number;
  progress: number;
}

export interface RoomState {
  built: boolean;
  construction: { startAt: number; endsAt: number } | null;
  upgrades: Record<string, number>;
  dirt: Dirt[];
}

export interface ProductState {
  stock: number;
  price: number;
  sold: number;
}

export interface BarState {
  products: Record<ProductId, ProductState>;
  restockTarget: number;
}

export interface StaffMember {
  id: number;
  name: string;
  role: StaffRole;
  competence: number;
  salary: number;
  satisfaction: number;
  experience: number;
  hiredAt: number;
  look: Look;
  workToday: number;
}

export interface ArtistState {
  draw: number;
  relationship: number;
  shows: number;
  lastShowAt: number | null;
  history: { at: number; attendance: number; satisfaction: number }[];
}

export interface CounterSlot {
  agentId: number;
  remaining: number;
  waited: number;
}

export interface CounterState {
  queue: number[];
  serving: (CounterSlot | null)[];
}

export type AgentKind = 'visitor' | 'casual' | 'staff' | 'artist' | 'worker' | 'band' | 'galleryVisitor';

export interface Agent {
  id: number;
  kind: AgentKind;
  x: number;
  y: number;
  path: [number, number][];
  speed: number;
  state: string;
  timer: number;
  look: Look;
  bookingId: number | null;
  staffId: number | null;
  seat: number;
  hasTicket: boolean;
  patience: number;
  waitStart: number;
  mood: number;
  icon: string | null;
  iconUntil: number;
  slot: number;
  facing: number;
  /** variante visual (instrumento, ferramenta, etc.) */
  variant: number;
  barLeft: number;
}

export interface LedgerDay {
  day: number;
  income: Partial<Record<IncomeCat, number>>;
  expense: Partial<Record<ExpenseCat, number>>;
  visitors: number;
  waste: number;
}

export interface LogEntry {
  t: number;
  text: string;
  kind: 'info' | 'good' | 'bad' | 'money';
}

export interface PendingEvent {
  id: string;
  createdAt: number;
  data: Record<string, number>;
}

export interface RehearsalSlot {
  startAt: number;
  endAt: number;
  hours: number;
  spawned: boolean;
  paid: boolean;
}

export type ProposalKind = 'artist' | 'corporate' | 'workshop' | 'exhibition';

export interface Proposal {
  id: number;
  kind: ProposalKind;
  createdAt: number;
  expiresAt: number;
  roomId: RoomId;
  startAt: number;
  from: string;
  title: string;
  text: string;
  artistId: string;
  custom: ArtistDef | null;
  contract: Contract;
  ticketPrice: number;
  participants: number;
  seen: boolean;
  /** só para propostas de exposição */
  exhibition?: { days: number; entryPrice: number; commission: number };
}

export interface Artwork {
  title: string;
  price: number;
  sold: boolean;
}

export type ExhibitionStatus = 'scheduled' | 'open' | 'closed' | 'cancelled';

export interface ExhibitionResult {
  visitors: number;
  entryRevenue: number;
  salesRevenue: number;
  commission: number;
  worksSold: number;
  setupCost: number;
  energy: number;
  net: number;
  quality: number;
  satisfaction: number;
  repDelta: number;
  xp: number;
}

export interface Exhibition {
  id: number;
  artistId: string;
  startDay: number;
  days: number;
  entryPrice: number;
  commission: number;
  setupCost: number;
  works: Artwork[];
  status: ExhibitionStatus;
  createdAt: number;
  visitors: number;
  visitorsToday: number;
  peakInside: number;
  entryRevenue: number;
  salesRevenue: number;
  energy: number;
  result: ExhibitionResult | null;
}

export interface GameState {
  version: number;
  seed: number;
  rngState: number;
  time: number;
  speed: number;
  money: number;
  level: number;
  xp: number;
  rep: Record<RepKey, number>;
  rooms: Record<RoomId, RoomState>;
  bar: BarState;
  counters: Record<CounterId, CounterState>;
  bookings: Booking[];
  artists: Record<string, ArtistState>;
  staff: StaffMember[];
  candidates: StaffMember[];
  agents: Agent[];
  player: { x: number; y: number; path: [number, number][] };
  ledger: LedgerDay[];
  log: LogEntry[];
  missions: Record<string, 'active' | 'done' | 'claimed'>;
  tutorial: { step: number; skipped: boolean };
  progress: {
    totalVisitors: number;
    totalTickets: number;
    totalEvents: number;
    drinksServed: number;
    soldOuts: number;
    bestEventNet: number;
    upgradesBought: number;
    eventsByDiscipline: Record<Discipline, number>;
    satisfactionHistory: number[];
    lastEventAt: number | null;
    exhibitions: number;
    artworksSold: number;
  };
  flags: Record<string, boolean>;
  rehearsal: { pricePerHour: number; slots: RehearsalSlot[] };
  pendingEvent: PendingEvent | null;
  inbox: Proposal[];
  /** artistas da cena local já gerados (ficha completa, para o save) */
  scene: ArtistDef[];
  exhibitions: Exhibition[];
  sceneActive: string[];
  modifiers: { qualityPenaltyEvents: number };
  nextId: number;
}
