// Artistas plásticos e exposições para a Galeria. Nomes fictícios.

export type ArtStyle = 'painting' | 'photo' | 'sculpture' | 'installation' | 'illustration' | 'digital' | 'textile';

export interface VisualArtistDef {
  id: string;
  name: string;
  medium: string;
  style: ArtStyle;
  /** visitantes por dia num espaço de reputação média, entrada ao preço de referência */
  draw: number;
  refPrice: number;
  works: number;
  priceMin: number;
  priceMax: number;
  /** comissão do espaço sobre as vendas */
  commission: number;
  /** montagem, transporte e seguro (pago ao agendar) */
  setupCost: number;
  skill: number;
  minLevel: number;
  minRep: number;
  /** nível mínimo da melhoria "Expositores" */
  displays: number;
  /** probabilidade de um visitante comprar uma obra */
  buyRate: number;
  colors: [string, string, string];
  bio: string;
}

const V = (v: VisualArtistDef) => v;

export const VISUAL_ARTISTS: VisualArtistDef[] = [
  V({ id: 'lume', name: 'Inês Lume', medium: 'Fotografia', style: 'photo', draw: 18, refPrice: 3, works: 8, priceMin: 150, priceMax: 400, commission: 0.35, setupCost: 120, skill: 62, minLevel: 2, minRep: 0, displays: 0, buyRate: 0.03, colors: ['#e0e1dd', '#415a77', '#1b263b'], bio: 'Retratos do bairro ao amanhecer.' }),
  V({ id: 'tinta', name: 'Coletivo Tinta Fresca', medium: 'Pintura', style: 'painting', draw: 22, refPrice: 3, works: 10, priceMin: 200, priceMax: 600, commission: 0.4, setupCost: 150, skill: 58, minLevel: 2, minRep: 0, displays: 0, buyRate: 0.028, colors: ['#ef476f', '#ffd166', '#06d6a0'], bio: 'Cinco pintores, uma parede de cor.' }),
  V({ id: 'baleia', name: 'Tomás Baleia', medium: 'Ilustração', style: 'illustration', draw: 20, refPrice: 2, works: 12, priceMin: 80, priceMax: 250, commission: 0.35, setupCost: 90, skill: 60, minLevel: 2, minRep: 5, displays: 0, buyRate: 0.04, colors: ['#f4a261', '#2a9d8f', '#264653'], bio: 'Bestiário fantástico da cidade.' }),
  V({ id: 'ferro', name: 'Ana Ferro', medium: 'Escultura', style: 'sculpture', draw: 24, refPrice: 4, works: 6, priceMin: 500, priceMax: 1500, commission: 0.4, setupCost: 260, skill: 70, minLevel: 3, minRep: 18, displays: 1, buyRate: 0.018, colors: ['#8d99ae', '#b08968', '#2b2d42'], bio: 'Ferro e madeira recuperados de estaleiros.' }),
  V({ id: 'ruido', name: 'Estúdio Ruído', medium: 'Arte digital', style: 'digital', draw: 30, refPrice: 5, works: 6, priceMin: 300, priceMax: 900, commission: 0.35, setupCost: 300, skill: 66, minLevel: 3, minRep: 22, displays: 1, buyRate: 0.02, colors: ['#00f5d4', '#9b5de5', '#f15bb5'], bio: 'Ecrãs generativos que reagem ao público.' }),
  V({ id: 'arraiolos', name: 'Maria do Céu Arraiolos', medium: 'Têxtil', style: 'textile', draw: 26, refPrice: 4, works: 8, priceMin: 200, priceMax: 700, commission: 0.38, setupCost: 180, skill: 72, minLevel: 4, minRep: 28, displays: 0, buyRate: 0.025, colors: ['#9d0208', '#e85d04', '#ffba08'], bio: 'Tapeçarias contemporâneas com pontos antigos.' }),
  V({ id: 'fronteiras', name: 'Fronteiras — fotojornalismo', medium: 'Fotografia coletiva', style: 'photo', draw: 45, refPrice: 6, works: 12, priceMin: 250, priceMax: 600, commission: 0.3, setupCost: 450, skill: 80, minLevel: 6, minRep: 40, displays: 1, buyRate: 0.02, colors: ['#f8f9fa', '#6c757d', '#212529'], bio: 'Doze fotógrafos, doze países.' }),
  V({ id: 'sombra', name: 'Rafael Sombra', medium: 'Instalação', style: 'installation', draw: 38, refPrice: 6, works: 3, priceMin: 1500, priceMax: 4000, commission: 0.3, setupCost: 500, skill: 78, minLevel: 5, minRep: 35, displays: 2, buyRate: 0.01, colors: ['#3a0ca3', '#4cc9f0', '#f72585'], bio: 'Luz, fumo e espelhos. Imperdível.' }),
  V({ id: 'vaz', name: 'Retrospetiva Lúcia Vaz', medium: 'Pintura', style: 'painting', draw: 55, refPrice: 8, works: 10, priceMin: 1200, priceMax: 5000, commission: 0.3, setupCost: 900, skill: 88, minLevel: 7, minRep: 50, displays: 2, buyRate: 0.012, colors: ['#264653', '#e9c46a', '#e76f51'], bio: 'Quarenta anos de pintura numa só sala.' }),
];

export const VISUAL_BY_ID: Record<string, VisualArtistDef> = Object.fromEntries(VISUAL_ARTISTS.map((a) => [a.id, a]));

export const ARTWORK_TITLES = ['Sem título', 'Manhã na Ribeira', 'Estudo nº 3', 'Janela', 'Ruído branco', 'Mãe', 'Passagem', 'Azul de março', 'Fábrica', 'Corpo em queda', 'Maré', 'O vizinho', 'Silêncio', 'Varanda', 'Fragmento', 'Linha 28'];

export const EXHIBITION_DAYS = [5, 7, 10];
export const GALLERY_OPEN = 11;
export const GALLERY_CLOSE = 20;
