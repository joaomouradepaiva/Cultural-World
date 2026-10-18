// Tipos do estado da simulação. Tudo aqui é JSON-serializável: o save é o próprio estado.

import type { HospitalityId, KitId } from '../content/equipment';
import type { ArtistDef } from '../content/artists';
import type { SegmentId } from '../content/segments';
import type { ThemeId } from '../content/seasons';

export type Discipline = 'music' | 'theater' | 'comedy' | 'dance' | 'corporate' | 'workshop';
export type BookingKind = 'show' | 'corporate' | 'workshop';
export type RepKey = 'general' | 'music' | 'theater' | 'visual' | 'cinema' | 'training' | 'community';
export type RoomId = 'lobby' | 'hall' | 'blackbox' | 'bar' | 'wc' | 'rehearsal' | 'gallery';
export type ShiftId = 'day' | 'night' | 'full';
export type StaffRole = 'boxoffice' | 'bartender' | 'technician' | 'cleaner' | 'barmanager' | 'security';
export type ContractType = 'fixed' | 'split' | 'guarantee' | 'rental' | 'coproduction' | 'residency';
export type MarketingId = 'none' | 'posters' | 'social' | 'press' | 'radio';
export type ProductId = 'water' | 'soda' | 'beer' | 'wine' | 'snack' | 'cocktail' | 'toast';
export type CounterId = 'boxoffice' | 'bar';

export type IncomeCat = 'tickets' | 'bar' | 'gallery' | 'rentals' | 'missions' | 'sponsorship' | 'premium' | 'financing' | 'other';
export type ExpenseCat =
  | 'artists' | 'salaries' | 'rent' | 'maintenance' | 'energy' | 'stock' | 'marketing'
  | 'construction' | 'upgrades' | 'equipment' | 'insurance' | 'refunds' | 'exhibitions' | 'hospitality' | 'premium' | 'interest' | 'debt' | 'other';

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
  /** cláusulas negociadas (Fase C) */
  exclusive?: boolean;
  /** o artista traz o equipamento em falta (sem aluguer para a casa) */
  techByArtist?: boolean;
  /** benefício oferecido pela casa */
  benefit?: BenefitId;
  /** número de datas (residência) */
  dates?: number;
  negotiated?: boolean;
}

export type BenefitId = 'none' | 'catering' | 'promo';

export type PremiumId = 'vip' | 'meet' | 'backstage' | 'patrons' | 'presale';
export interface PremiumPlan { vip: boolean; meet: boolean; backstage: boolean; patrons: boolean; presale: boolean }
export interface PremiumResult { vip: number; boxes: number; meet: number; backstage: number; patrons: number; revenue: number; cost: number; artistCut: number }

export interface Loan {
  id: number;
  purpose: LoanPurpose;
  principal: number;
  /** taxa anual nominal */
  rate: number;
  weeks: number;
  installment: number;
  remaining: number;
  paidWeeks: number;
  nextDueDay: number;
  interestPaid: number;
  takenAt: number;
  status: 'active' | 'repaid';
}
export type LoanPurpose = 'works' | 'equipment' | 'expansion' | 'rooms';

export interface Sponsorship {
  id: number;
  name: string;
  perEvent: number;
  startDay: number;
  endDay: number;
  minEvents: number;
  events: number;
  paid: number;
  color: string;
  status: 'active' | 'done' | 'failed';
}

export interface KitItem {
  id: number;
  kit: KitId;
  condition: number;
  boughtAt: number;
  uses: number;
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
  /** receita de passes imputada a este evento (para partilhas com o artista) */
  passAllocated: number;
  premiumRevenue?: number;
  premiumCost?: number;
  sponsorship?: number;
  /** custo de catering/hospitalidade do evento */
  hospitality?: number;
}

export interface ExperienceScores {
  quality: number;
  value: number;
  service: number;
  cleanliness: number;
  crowd: number;
  comfort: number;
  sound: number;
  visibility: number;
  temperature: number;
  safety: number;
}

export interface Complaint {
  key: keyof ExperienceScores | 'late' | 'price_seg' | 'vip';
  text: string;
  suggestion: string;
  /** percentagem aproximada do público que se queixou */
  share: number;
}

export type SeasonDuration = 'week' | 'month' | 'quarter' | 'year';
export type SeasonStatus = 'planned' | 'active' | 'closed' | 'cancelled';

export interface SeasonObjective {
  kind: 'events' | 'occupancy' | 'satisfaction' | 'tickets';
  target: number;
}

export interface SeasonResult {
  events: number;
  tickets: number;
  passes: number;
  occupancy: number;
  revenue: number;
  costs: number;
  profit: number;
  satisfaction: number;
  repDelta: number;
  objectivesMet: number;
}

export interface Season {
  id: number;
  name: string;
  theme: ThemeId;
  duration: SeasonDuration;
  startDay: number;
  endDay: number;
  budget: number;
  objectives: SeasonObjective[];
  pass: { enabled: boolean; price: number; sold: number; target: number; revenue: number };
  status: SeasonStatus;
  createdAt: number;
  result: SeasonResult | null;
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
  scores: ExperienceScores;
  complaints: Complaint[];
  repDelta: number;
  xp: number;
  soldOut: boolean;
  hospitality?: number;
  /** satisfação do artista com camarins e acolhimento (0–100) */
  artistSat?: number;
  /** kits do armazém usados (nomes) */
  kitsUsed?: string[];
  premium?: PremiumResult;
  sponsorship?: number;
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
  /** temporada a que pertence (ou null) */
  seasonId: number | null;
  /** lugares ocupados por detentores de passe de temporada */
  passSeats: number;
  /** mistura de público prevista (soma 1) */
  segments: Partial<Record<SegmentId, number>>;
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
  /** ids dos kits do armazém reservados para este evento */
  kits?: number[];
  premium?: PremiumPlan;
  /** vendas premium decididas à abertura de portas */
  premiumSold?: { vip: number; boxes: number; backstage: number };
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
  /** estado de conservação 0–100 (saves antigos: 100) */
  condition?: number;
  /** fim da reparação em curso */
  repairUntil?: number;
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
  /** turno de trabalho (saves antigos: 'full') */
  shift?: ShiftId;
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
  /** segmento de público (visitantes) */
  segment?: SegmentId;
  child?: boolean;
  /** visitante com bilhete VIP */
  vip?: boolean;
  /** artista no meet & greet até este instante */
  meetUntil?: number;
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

export type ProposalKind = 'artist' | 'corporate' | 'workshop' | 'exhibition' | 'sponsor';

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
  /** só para propostas de patrocínio */
  sponsor?: { perEvent: number; days: number; minEvents: number; minRep: number; color: string };
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
  /** fidelização por segmento de público (0–100) */
  audience: Record<SegmentId, number>;
  seasons: Season[];
  /** reclamações e sugestões recentes do público */
  feedback: (Complaint & { t: number; bookingId: number })[];
  sceneActive: string[];
  modifiers: { qualityPenaltyEvents: number };
  /** catering dos camarins */
  hospitality: HospitalityId;
  /** equipamento móvel no armazém */
  inventory: KitItem[];
  loans: Loan[];
  sponsorships: Sponsorship[];
  /** dia da última negociação recusada por artista (uma tentativa por dia) */
  negotiations: Record<string, number>;
  nextId: number;
}
