// Definição dos espaços e respetivas melhorias.

import type { RoomId } from '../sim/types';

export interface UpgradeLevel {
  cost: number;
  reqLevel: number;
  /** valor do efeito neste nível (capacidade, nível de equipamento, etc.) */
  value: number;
  label: string;
}

export interface UpgradeDef {
  key: string;
  name: string;
  desc: string;
  /** índice 0 = estado inicial (custo 0) */
  levels: UpgradeLevel[];
  maintenancePerLevel: number;
}

export interface RoomDef {
  id: RoomId;
  name: string;
  short: string;
  desc: string;
  startsBuilt: boolean;
  buildCost: number;
  buildMinutes: number;
  reqLevel: number;
  maintenance: number;
  isShowRoom: boolean;
  upgrades: UpgradeDef[];
}

const L = (cost: number, reqLevel: number, value: number, label: string): UpgradeLevel => ({ cost, reqLevel, value, label });

export const ROOMS: Record<RoomId, RoomDef> = {
  hall: {
    id: 'hall', name: 'Sala Principal', short: 'Sala', desc: 'Sala polivalente para concertos, teatro, stand-up e dança.',
    startsBuilt: true, buildCost: 0, buildMinutes: 0, reqLevel: 1, maintenance: 5, isShowRoom: true,
    upgrades: [
      { key: 'seats', name: 'Plateia', desc: 'Mais lugares = mais bilhetes por evento.', maintenancePerLevel: 3,
        levels: [L(0, 1, 20, '20 lugares'), L(400, 1, 40, '40 lugares'), L(1500, 2, 70, '70 lugares'), L(4000, 4, 110, '110 lugares'), L(9000, 6, 150, '150 lugares'), L(16000, 8, 180, '180 lugares')] },
      { key: 'sound', name: 'Som', desc: 'Colunas, mesa de mistura e monitores. Melhora a qualidade e evita alugueres.', maintenancePerLevel: 4,
        levels: [L(0, 1, 0, 'Básico'), L(600, 1, 1, 'PA compacto'), L(2500, 3, 2, 'PA + subs + digital'), L(7000, 6, 3, 'Line array')] },
      { key: 'light', name: 'Iluminação', desc: 'Projetores, moving heads e mesa de luz.', maintenancePerLevel: 4,
        levels: [L(0, 1, 0, 'Básica'), L(500, 2, 1, 'PAR LED'), L(2200, 3, 2, 'Moving heads'), L(6500, 6, 3, 'Rig completo')] },
      { key: 'stage', name: 'Palco', desc: 'Estrados, cortinas e estruturas. Necessário para teatro e dança.', maintenancePerLevel: 3,
        levels: [L(0, 1, 0, 'Estrado simples'), L(900, 2, 1, 'Palco com cortinas'), L(3500, 5, 2, 'Teia e cenografia')] },
      { key: 'dressing', name: 'Camarins', desc: 'Artistas mais satisfeitos: relação melhora mais depressa.', maintenancePerLevel: 2,
        levels: [L(0, 1, 0, 'Nenhum'), L(1200, 3, 1, 'Camarim'), L(4000, 6, 2, 'Camarins + catering')] },
      { key: 'access', name: 'Acessibilidades', desc: 'Rampas e lugares adaptados: +procura, +comunidade.', maintenancePerLevel: 1,
        levels: [L(0, 1, 0, 'Nenhuma'), L(1800, 3, 1, 'Acessível')] },
    ],
  },
  blackbox: {
    id: 'blackbox', name: 'Black Box', short: 'Black Box', desc: 'Segunda sala, intimista. Ideal para stand-up, teatro e concertos acústicos.',
    startsBuilt: false, buildCost: 3000, buildMinutes: 360, reqLevel: 3, maintenance: 12, isShowRoom: true,
    upgrades: [
      { key: 'seats', name: 'Plateia', desc: 'Lugares na Black Box.', maintenancePerLevel: 3,
        levels: [L(0, 3, 40, '40 lugares'), L(1800, 4, 60, '60 lugares'), L(4500, 6, 90, '90 lugares')] },
      { key: 'sound', name: 'Som', desc: 'Sistema de som da Black Box.', maintenancePerLevel: 3,
        levels: [L(0, 3, 1, 'PA compacto'), L(2200, 5, 2, 'PA + digital')] },
      { key: 'light', name: 'Iluminação', desc: 'Luz da Black Box.', maintenancePerLevel: 3,
        levels: [L(0, 3, 1, 'PAR LED'), L(2000, 5, 2, 'Moving heads')] },
      { key: 'stage', name: 'Palco', desc: 'Palco da Black Box.', maintenancePerLevel: 2,
        levels: [L(0, 3, 1, 'Palco com cortinas'), L(3000, 6, 2, 'Teia e cenografia')] },
    ],
  },
  bar: {
    id: 'bar', name: 'Bar', short: 'Bar', desc: 'Bebidas e petiscos. Fatura com eventos e com clientes de passagem.',
    startsBuilt: false, buildCost: 500, buildMinutes: 120, reqLevel: 1, maintenance: 5, isShowRoom: false,
    upgrades: [
      { key: 'counter', name: 'Balcão', desc: 'Mais pontos de serviço em simultâneo.', maintenancePerLevel: 3,
        levels: [L(0, 1, 1, '1 posto'), L(1500, 3, 2, '2 postos'), L(5000, 6, 3, '3 postos')] },
      { key: 'equipment', name: 'Equipamento', desc: 'Máquinas e frigoríficos: serviço mais rápido.', maintenancePerLevel: 2,
        levels: [L(0, 1, 1, 'Básico'), L(800, 2, 1.25, 'Frigorífico + tiragem'), L(3000, 5, 1.5, 'Profissional')] },
      { key: 'menu', name: 'Carta', desc: 'Novos produtos com melhor margem.', maintenancePerLevel: 1,
        levels: [L(0, 1, 0, 'Água, refrigerantes, cerveja'), L(600, 2, 1, '+ Vinho e petiscos'), L(2500, 5, 2, '+ Cocktails e tostas')] },
      { key: 'tables', name: 'Mesas', desc: 'Mais clientes de passagem ficam a consumir.', maintenancePerLevel: 1,
        levels: [L(0, 1, 2, '2 mesas'), L(700, 2, 4, '4 mesas'), L(1800, 4, 6, '6 mesas')] },
    ],
  },
  lobby: {
    id: 'lobby', name: 'Átrio & Bilheteira', short: 'Átrio', desc: 'Entrada, bilheteira e zona de espera.',
    startsBuilt: true, buildCost: 0, buildMinutes: 0, reqLevel: 1, maintenance: 3, isShowRoom: false,
    upgrades: [
      { key: 'guiche', name: 'Guichés', desc: 'Segundo guiché na bilheteira.', maintenancePerLevel: 2,
        levels: [L(0, 1, 1, '1 guiché'), L(1200, 3, 2, '2 guichés')] },
      { key: 'online', name: 'Venda online', desc: 'Mais bilhetes vendidos antecipadamente.', maintenancePerLevel: 3,
        levels: [L(0, 1, 0, 'Sem venda online'), L(1000, 2, 1, 'Plataforma online')] },
      { key: 'decor', name: 'Decoração', desc: 'Ambiente acolhedor: +satisfação, +clientes de passagem.', maintenancePerLevel: 1,
        levels: [L(0, 1, 0, 'Armazém'), L(800, 2, 1, 'Sofás e plantas'), L(3000, 5, 2, 'Design de autor')] },
    ],
  },
  wc: {
    id: 'wc', name: 'Instalações Sanitárias', short: 'WC', desc: 'Sem WC adequado, eventos grandes perdem satisfação.',
    startsBuilt: false, buildCost: 1500, buildMinutes: 180, reqLevel: 3, maintenance: 4, isShowRoom: false,
    upgrades: [
      { key: 'size', name: 'Dimensão', desc: 'Capacidade confortável do edifício.', maintenancePerLevel: 2,
        levels: [L(0, 3, 120, 'Conforto até 120 pessoas'), L(2500, 6, 260, 'Conforto até 260 pessoas')] },
    ],
  },
  rehearsal: {
    id: 'rehearsal', name: 'Sala de Ensaio', short: 'Ensaio', desc: 'Alugada à hora a bandas e companhias. Receita recorrente.',
    startsBuilt: false, buildCost: 3500, buildMinutes: 240, reqLevel: 4, maintenance: 6, isShowRoom: false,
    upgrades: [
      { key: 'equipment', name: 'Equipamento', desc: 'Backline e insonorização: mais procura e preço de referência.', maintenancePerLevel: 2,
        levels: [L(0, 4, 1, 'Backline básico'), L(2000, 5, 2, 'Backline profissional'), L(5000, 8, 3, 'Estúdio de ensaio premium')] },
    ],
  },
};

/** Conforto sem WC construído (instalações originais do armazém). */
export const BASE_COMFORT_CAPACITY = 40;

export function upgradeDef(room: RoomId, key: string): UpgradeDef | undefined {
  return ROOMS[room].upgrades.find((u) => u.key === key);
}

export const ROOM_ORDER: RoomId[] = ['lobby', 'hall', 'bar', 'blackbox', 'wc', 'rehearsal'];
