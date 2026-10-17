// Produtos do bar, funções da equipa, canais de marketing e contratos.

import type { ContractType, MarketingId, ProductId, StaffRole } from '../sim/types';

export interface ProductDef {
  id: ProductId;
  name: string;
  unitCost: number;
  refPrice: number;
  defaultPrice: number;
  popularity: number;
  menuLevel: number;
  perishable: boolean;
  color: string;
}

export const PRODUCTS: ProductDef[] = [
  { id: 'beer', name: 'Cerveja', unitCost: 0.8, refPrice: 2.5, defaultPrice: 2.5, popularity: 1.0, menuLevel: 0, perishable: false, color: '#f4b400' },
  { id: 'soda', name: 'Refrigerante', unitCost: 0.5, refPrice: 2.0, defaultPrice: 2.0, popularity: 0.55, menuLevel: 0, perishable: false, color: '#e53935' },
  { id: 'water', name: 'Água', unitCost: 0.2, refPrice: 1.2, defaultPrice: 1.2, popularity: 0.35, menuLevel: 0, perishable: false, color: '#4fc3f7' },
  { id: 'wine', name: 'Copo de vinho', unitCost: 1.2, refPrice: 3.5, defaultPrice: 3.5, popularity: 0.5, menuLevel: 1, perishable: false, color: '#8e244d' },
  { id: 'snack', name: 'Petiscos', unitCost: 1.0, refPrice: 3.0, defaultPrice: 3.0, popularity: 0.45, menuLevel: 1, perishable: true, color: '#d4a373' },
  { id: 'cocktail', name: 'Cocktail', unitCost: 2.0, refPrice: 6.5, defaultPrice: 6.5, popularity: 0.4, menuLevel: 2, perishable: false, color: '#ff6fb5' },
  { id: 'toast', name: 'Tosta', unitCost: 1.4, refPrice: 4.5, defaultPrice: 4.5, popularity: 0.35, menuLevel: 2, perishable: true, color: '#e9c46a' },
];

export const PRODUCT_BY_ID = Object.fromEntries(PRODUCTS.map((p) => [p.id, p])) as Record<ProductId, ProductDef>;

export const STOCK_STEP = 24;
export const STOCK_MAX_BASE = 120;
export const STOCK_MAX_PER_COUNTER = 60;

export interface RoleDef {
  role: StaffRole;
  name: string;
  plural: string;
  desc: string;
  minLevel: number;
  baseSalary: number;
  salaryPerCompetence: number;
  color: number;
}

export const ROLES: Record<StaffRole, RoleDef> = {
  boxoffice: { role: 'boxoffice', name: 'Bilheteiro/a', plural: 'Bilheteiros', desc: 'Vende bilhetes à porta. Liberta-te da bilheteira.', minLevel: 1, baseSalary: 28, salaryPerCompetence: 8, color: 0 },
  bartender: { role: 'bartender', name: 'Empregado/a de bar', plural: 'Empregados de bar', desc: 'Serve no balcão. Um por posto de serviço.', minLevel: 1, baseSalary: 30, salaryPerCompetence: 8, color: 1 },
  cleaner: { role: 'cleaner', name: 'Limpeza', plural: 'Equipa de limpeza', desc: 'Limpa o lixo depois dos eventos.', minLevel: 1, baseSalary: 24, salaryPerCompetence: 6, color: 2 },
  technician: { role: 'technician', name: 'Técnico/a', plural: 'Técnicos', desc: 'Montagens mais rápidas, +qualidade. Obrigatório para riders exigentes.', minLevel: 3, baseSalary: 40, salaryPerCompetence: 10, color: 3 },
  barmanager: { role: 'barmanager', name: 'Gestor/a de bar', plural: 'Gestores de bar', desc: 'Repõe stock automaticamente todas as manhãs.', minLevel: 4, baseSalary: 45, salaryPerCompetence: 10, color: 4 },
};

export const ROLE_ORDER: StaffRole[] = ['boxoffice', 'bartender', 'cleaner', 'technician', 'barmanager'];

export const FIRST_NAMES = ['Ana', 'Bruno', 'Carla', 'Diogo', 'Eva', 'Filipe', 'Gabriela', 'Hugo', 'Inês', 'João', 'Leonor', 'Miguel', 'Nádia', 'Óscar', 'Patrícia', 'Rafael', 'Sara', 'Tiago', 'Vera', 'Xavier', 'Yara', 'Zé', 'Marta', 'Nuno', 'Rita', 'Pedro', 'Sofia', 'Luís', 'Beatriz', 'Kevin', 'Amina', 'Thiago'];
export const LAST_NAMES = ['Silva', 'Santos', 'Ferreira', 'Pereira', 'Costa', 'Rodrigues', 'Martins', 'Sousa', 'Fernandes', 'Gonçalves', 'Lopes', 'Marques', 'Almeida', 'Ribeiro', 'Pinto', 'Carvalho', 'Teixeira', 'Moreira', 'Correia', 'Mendes'];

export interface MarketingDef {
  id: MarketingId;
  name: string;
  cost: number;
  boost: number;
  minLevel: number;
  desc: string;
}

export const MARKETING: MarketingDef[] = [
  { id: 'none', name: 'Só boca-a-boca', cost: 0, boost: 0, minLevel: 1, desc: 'Divulgação orgânica (depende da reputação).' },
  { id: 'posters', name: 'Cartazes no bairro', cost: 40, boost: 0.2, minLevel: 1, desc: '+20% procura.' },
  { id: 'social', name: 'Redes sociais', cost: 110, boost: 0.38, minLevel: 2, desc: '+38% procura.' },
  { id: 'press', name: 'Imprensa local', cost: 260, boost: 0.55, minLevel: 4, desc: '+55% procura.' },
  { id: 'radio', name: 'Rádio', cost: 480, boost: 0.8, minLevel: 5, desc: '+80% procura.' },
];

export const MARKETING_BY_ID = Object.fromEntries(MARKETING.map((m) => [m.id, m])) as Record<MarketingId, MarketingDef>;

export interface ContractDef {
  type: ContractType;
  name: string;
  minLevel: number;
  desc: string;
}

export const CONTRACTS: ContractDef[] = [
  { type: 'fixed', name: 'Cachet fixo', minLevel: 1, desc: 'Pagas o cachet já. Ficas com toda a bilheteira. Mais risco, mais margem.' },
  { type: 'split', name: 'Partilha de bilheteira', minLevel: 1, desc: 'Sem custo inicial. O artista fica com uma % da bilheteira.' },
  { type: 'guarantee', name: 'Garantia + %', minLevel: 2, desc: 'Mínimo garantido ao artista + 50% da receita acima do dobro da garantia.' },
  { type: 'rental', name: 'Aluguer a promotor', minLevel: 4, desc: 'O promotor paga a sala e fica com a bilheteira. Tu ganhas renda e bar.' },
];
