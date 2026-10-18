// Equipamento móvel guardado no armazém. Cada kit cobre um nível em falta no rider técnico
// (em vez de alugar), só pode estar num evento de cada vez e gasta-se com o uso.

export type KitId = 'pa' | 'light' | 'stage' | 'projector';
export type KitCovers = 'sound' | 'light' | 'stage' | null;

export interface KitDef {
  id: KitId;
  name: string;
  icon: string;
  desc: string;
  cost: number;
  /** espaço ocupado no armazém */
  space: number;
  minLevel: number;
  covers: KitCovers;
  /** desgaste por evento (pontos de condição) */
  wear: number;
}

export const KITS: KitDef[] = [
  { id: 'pa', name: 'Kit PA portátil', icon: '🔊', desc: 'Colunas e mesa móveis: cobre 1 nível de som em falta.', cost: 900, space: 2, minLevel: 2, covers: 'sound', wear: 5 },
  { id: 'light', name: 'Kit de luz móvel', icon: '💡', desc: 'Projetores LED em tripé: cobre 1 nível de luz em falta.', cost: 800, space: 2, minLevel: 2, covers: 'light', wear: 5 },
  { id: 'stage', name: 'Estrados modulares', icon: '🧱', desc: 'Praticáveis e cortinas: cobre 1 nível de palco em falta.', cost: 1100, space: 3, minLevel: 3, covers: 'stage', wear: 4 },
  { id: 'projector', name: 'Projetor e ecrã', icon: '📽️', desc: 'Melhora reuniões de empresa e workshops (+qualidade).', cost: 700, space: 1, minLevel: 2, covers: null, wear: 3 },
];

export const KIT_BY_ID: Record<KitId, KitDef> = Object.fromEntries(KITS.map((k) => [k.id, k])) as Record<KitId, KitDef>;

/** Abaixo desta condição o kit está avariado e não sai do armazém. */
export const KIT_BROKEN_BELOW = 30;

/** Opções globais de hospitalidade (catering nos camarins), custo por membro e por evento. */
export type HospitalityId = 'none' | 'basic' | 'full';
export const HOSPITALITY: Record<HospitalityId, { name: string; perMember: number; bonus: number }> = {
  none: { name: 'Sem catering', perMember: 0, bonus: 0 },
  basic: { name: 'Água e fruta', perMember: 8, bonus: 0.5 },
  full: { name: 'Catering completo', perMember: 20, bonus: 1 },
};
