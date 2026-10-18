// Parâmetros económicos centrais. Todo o balanceamento passa por aqui.
// Unidades: dinheiro em €, tempo em minutos de jogo.

export const BALANCE = {
  startMoney: 1500,
  startReputation: 10,
  startHour: 10,

  // Tempo
  minutesPerRealSecond: 3,
  nightSkipMultiplier: 10,
  openHour: 10,
  closeHour: 2,
  tickMinutes: 0.25,

  // Custos fixos
  dailyRent: 30,
  weeklyInsurance: 45, // licenças e seguros (segunda-feira)
  energyPerEvent: 12,
  energyPerAttendee: 0.15,
  cleaningSuppliesPerEvent: 5,

  // Procura de bilhetes
  dayFactors: [0.75, 0.8, 0.85, 0.95, 1.15, 1.25, 0.9], // seg..dom
  hourFactors: { 10: 0.55, 11: 0.6, 12: 0.6, 13: 0.6, 14: 0.6, 15: 0.65, 16: 0.7, 17: 0.75, 18: 0.82, 19: 0.92, 20: 1.0, 21: 1.05, 22: 1.0, 23: 0.85 } as Record<number, number>,
  demandScale: 1.35,
  repFactorBase: 0.8,
  repFactorSlope: 0.7,
  priceElasticity: 1.3,
  maxPriceFactor: 1.5,
  presaleShare: 0.72,
  leadTimeFullHours: 48,
  leadTimeMinFactor: 0.35,
  demandNoise: 0.08,
  freshnessDays: 30,
  walkupOverflow: 6,

  // Evento
  doorsBefore: 45,
  minLeadMinutes: 30,
  maxAdvanceDays: 14,
  artistCooldownDays: 5,
  baseCleanup: 45,
  setupByDiscipline: { music: 90, theater: 120, comedy: 60, dance: 120, corporate: 45, workshop: 45 } as Record<string, number>,
  technicianSetupFactor: 0.75,
  rentalPerLevel: { sound: 60, light: 50, stage: 70 } as Record<string, number>,
  maxRentalGap: 2,
  techRequiredRiderSum: 4,

  // Serviço
  boxOfficeServiceMin: 1.2,
  barServiceMin: 1.2,
  boxOfficePatience: 20,
  barPatience: 18,
  casualPatience: 15,
  playerServeRadius: 1.4,

  // Bar
  barBuyPre: 0.6,
  barBuyPost: 0.5,
  barSecondDrink: 0.25,
  barPriceElasticity: 1.5,
  casualPerHour: 3,
  wasteRate: 0.1,
  autoRestockFee: 0.05,

  // Visitantes
  visitorSpeed: 1.1,
  staffSpeed: 1.0,
  playerTilesPerSecond: 4.2,
  wcUseChance: 0.15,

  // Reputação
  repEventScale: 7,
  repSelloutBonus: 0.8,
  repDecayPerDay: 0.1,
  repDecayAfterDays: 7,

  // Progressão
  xpPerEvent: 20,
  xpPerAttendee: 1,
  xpGoodShow: 20,
  xpPerDrink: 0.2,
  levelUpMoneyPerLevel: 100,

  crowdPenalty: 80,
  // Satisfação: pesos
  satWeights: { quality: 0.45, value: 0.12, service: 0.12, cleanliness: 0.07, crowd: 0.07, comfort: 0.05, sound: 0.07, visibility: 0.02, temperature: 0.02, safety: 0.01 },

  // Equipa
  staffShiftStart: 10,
  staffShiftEnd: 2,
  bonusAmount: 50,
  candidatesCount: 6,

  // Eventos aleatórios
  randomEventMinLevel: 5,
  randomEventDailyChance: 0.3,

  // Propostas (caixa de entrada)
  proposalExpiryDays: 2,
  inboxMax: 8,
  artistProposalChance: 0.75,
  extraArtistProposalChance: 0.4,
  corporateProposalChance: 0.5,
  workshopProposalChance: 0.5,
  exhibitionProposalChance: 0.45,
  proposalMinLevel: 2,
  proposalFeeDiscount: 0.85,

  // Cena local
  sceneArtistsPerWeek: 4,

  // Ensaio
  rehearsalRefPrice: 12,
};

export function xpForNextLevel(level: number): number {
  return Math.round(100 * Math.pow(level, 1.6));
}

export const LEVEL_TITLES: { level: number; title: string }[] = [
  { level: 1, title: 'O Armazém' },
  { level: 5, title: 'Espaço Independente' },
  { level: 10, title: 'Centro Cultural de Bairro' },
  { level: 15, title: 'Centro Cultural da Cidade' },
  { level: 25, title: 'Complexo Cultural' },
  { level: 40, title: 'Instituição de Referência' },
  { level: 60, title: 'Rede Cultural' },
];

export function levelTitle(level: number): string {
  let t = LEVEL_TITLES[0].title;
  for (const lt of LEVEL_TITLES) if (level >= lt.level) t = lt.title;
  return t;
}
