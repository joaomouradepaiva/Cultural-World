// Experiências premium: receitas extra com custos, capacidade e efeito na satisfação.

import type { SegmentId } from './segments';

export const PREMIUM = {
  vip: { name: 'Bilhete VIP', icon: '⭐', desc: 'Lugar reservado à frente e bebida de boas-vindas. Preço: 2× bilhete + €8.', priceMul: 2, priceAdd: 8, unitCost: 3, capShare: 0.12, capMax: 24, minLevel: 3 },
  meet: { name: 'Meet & greet', icon: '🤝', desc: 'Encontro com o artista no átrio depois do espetáculo. €15; o artista fica com 30%. Exige camarim.', price: 15, cap: 12, artistCut: 0.3, minLevel: 4 },
  backstage: { name: 'Visita aos bastidores', icon: '🎚️', desc: 'Grupo de 8 antes da abertura de portas, guiado pelo técnico de serviço. €8.', price: 8, cap: 8, minLevel: 3 },
  patrons: { name: 'Noite de mecenas', icon: '🥂', desc: 'Recebes mecenas no espetáculo (catering €200). Se gostarem, contribuem para a casa.', cost: 200, minLevel: 5, minRep: 35 },
  presale: { name: 'Pré-venda para fiéis', icon: '🎫', desc: 'Acesso antecipado ao público fidelizado: +15% de pré-venda e +4% de procura. €40.', cost: 40, minLevel: 2 },
} as const;

/** Propensão de cada segmento para comprar experiências premium. */
export const PREMIUM_PROPENSITY: Record<SegmentId, number> = {
  corporate: 0.25, tourists: 0.18, music: 0.12, theater: 0.12, creatives: 0.08, families: 0.05, community: 0.04, students: 0.02,
};

/** Camarotes: lugares extra na Sala Principal, vendidos a 2,5× o bilhete (mínimo €15). */
export const BOX_PRICE_MUL = 2.5;
export const BOX_PRICE_MIN = 15;
/** Acima desta fração de VIP na sala, o público geral sente-se de segunda. */
export const VIP_SHARE_LIMIT = 0.1;
