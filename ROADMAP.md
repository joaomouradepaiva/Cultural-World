# Roadmap

Legenda: ✅ implementado e testado · 🟡 parcial (descrito o que falta) · ⬜ não iniciado

## Fase 1 — Vertical Slice (MVP) — estado atual

| Requisito do briefing | Estado | Notas |
|---|---|---|
| Centro cultural visualmente representado (cutaway isométrico) | ✅ | Canvas 2D procedural, iluminação dia/noite |
| Personagem controlável | ✅ | Toque/clique para andar (A*), WASD/setas |
| Visitantes animados | ✅ | Chegam, fazem fila, compram, sentam-se, aplaudem, vão ao bar/WC, saem |
| Sala de espetáculos | ✅ | Sala Principal, 6 melhorias |
| Bar | ✅ | Stock, preços, 7 produtos, filas, mesas, desperdício |
| Bilheteira | ✅ | Pré-venda progressiva + venda à porta com fila e paciência |
| Agenda simples | ✅ | Várias atividades por sala/dia, montagem/limpeza, conflitos recusados |
| Contratação de concertos | ✅ | 21 artistas, 4 modelos de contrato, rider técnico |
| Venda de bilhetes | ✅ | Procura determinística com variação controlada |
| Receitas de bar | ✅ | Atribuídas ao evento no relatório |
| Dinheiro, custos operacionais | ✅ | Contabilidade por categoria; teste garante dinheiro = soma do livro |
| Compra de melhorias | ✅ | Alteram capacidade, qualidade, velocidade, procura |
| Contratação de funcionários | ✅ | 5 funções, competência, satisfação, experiência |
| Automatização básica | ✅ | Bilheteiro, bar, limpeza, reposição de stock |
| Reputação | ✅ | Geral + música + teatro/performance + comunidade |
| Missões | ✅ | 23 missões encadeadas com recompensas |
| Expansão para segunda sala | ✅ | Black Box (nível 3) + WC + Sala de ensaio |
| Save/load | ✅ | Automático, versionado, exportar/importar |
| Tutorial inicial | ✅ | 14 passos, com seta no mundo e realce na UI |
| Áudio | 🟡 | Sintetizado: efeitos, murmúrio do público, música ao vivo, aplausos, risos. Falta: espacialização fina por sala, música ambiente do átrio |
| Desktop e mobile | ✅ | Testado em 1440×900 e 390×844 com toque |

Limitações assumidas desta fase: NPCs não evitam colisões entre si; planta do edifício fixa; sem acessibilidade de teclado completa nos painéis.

## Fase 2 — Economia híbrida

| Item | Estado |
|---|---|
| Aluguer de salas | 🟡 Sala de ensaio à hora e "aluguer a promotor" das salas de espetáculo. Eventos de empresas via propostas. Falta: aluguer ao dia/mês, auditório, coworking |
| Workshops e escola de artes | 🟡 Workshops pontuais via propostas de formadores. Falta: cursos regulares, alunos recorrentes, sala de formação dedicada |
| Sócios (Base, Plus, Mecenas) | ⬜ |
| Merchandising / loja | ⬜ |
| Agenda avançada | 🟡 Calendário de 14 dias por sala com marcação por toque. Falta: arrastar eventos, eventos recorrentes |
| Caixa de propostas (artistas, empresas, formadores) | ✅ |
| Galeria (exposições, comissões) | ✅ Exposições de vários dias, entradas, vendas com comissão. Falta: obras do acervo próprio, exposições itinerantes |

## Fase 3 — Gestão cultural

| Item | Estado |
|---|---|
| Reputação por disciplina | 🟡 Música e teatro/performance ativos; artes visuais, cinema e formação só existem no modelo |
| Produção técnica | 🟡 Rider com Som/Luz/Palco, aluguer de equipamento, técnicos. Falta: vídeo, inventário de equipamento móvel |
| Marketing | 🟡 Canais por evento + divulgação orgânica pela comunidade. Falta: campanhas de marca, público-alvo |
| Eventos especiais / imprevistos | 🟡 6 tipos com escolhas. Falta: cancelamento de artista, concorrente na mesma data |
| Patrocínios e mecenato | 🟡 Pontuais via imprevistos. Falta: contratos com contrapartidas |
| Financiamento cultural (candidaturas) | ⬜ |
| Residências artísticas | ⬜ |

## Fase 4 — Expansão

| Item | Estado |
|---|---|
| Carreiras de artistas | 🟡 Popularidade cresce com bons espetáculos e a relação dá descontos. Falta: artistas emergentes que se tornam estrelas, catálogo dinâmico |
| Festivais | ⬜ |
| Produção própria e circulação | ⬜ |
| Cidade, zonas, concorrência | ⬜ |
| Múltiplos centros culturais (níveis 40–60) | ⬜ |
| Construção modular livre | ⬜ |

## Próximos passos recomendados

1. Testes com jogadores reais para calibrar o ritmo (o bot só mede uma estratégia simples).
2. Sócios + workshops (receita recorrente, sinergia "workshop → sócio").
3. Loja de merchandising (sinergia "artista popular → vendas").
4. Evasão local entre NPCs e mais variedade de animações.

## Expansion Pack 01

| Fase | Sistema | Estado |
|---|---|---|
| A | Temporadas culturais | ✅ |
| A | Segmentação de público | ✅ (sem sócios nem merchandising: sistemas inexistentes) |
| A | Experiência e satisfação + reclamações | ✅ |
| A | Bilhetes/passes de temporada | ✅ (sem descontos de sócios) |
| B | Camarins e hospitalidade | ✅ |
| B | Armazém e equipamentos | ✅ (kits de som/luz/palco/projetor; armazém como melhoria da Sala Principal, não sala própria; sem aluguer de kits a terceiros) |
| B | Turnos | ✅ (3 turnos fixos; sem folgas nem horas extra) |
| B | Manutenção | ✅ (conservação por espaço; o equipamento móvel tem estado próprio) |
| C | Negociação | ✅ (valor, %, equipamento, exclusividade, benefícios; datas e duração via residência; com artistas, não com patrocinadores) |
| C | Contratos | ✅ coprodução, residência, patrocínio (a prestação de serviços já existia como eventos de empresa) |
| C | Tesouraria | ✅ indicadores e projeção a 14 dias |
| C | Empréstimos | ✅ (sem renegociação nem incumprimento formal: o saldo negativo paga juros de descoberto) |
| C | Experiências premium | ✅ VIP, camarotes, meet & greet, bastidores, mecenas, pré-venda especial |
| D | Eventos sazonais, cinema, departamento criativo, editora, imprensa | ⬜ não implementado |
| E | Direção, parcerias, sustentabilidade, licenças, acontecimentos estratégicos | ⬜ não implementado |

### Trabalho restante (Fases D–E)

Nenhum destes sistemas existe ainda no código. Pontos de integração previstos:

- **D · Sazonais**: datas fixas do calendário em `content/` + `yearSeason()` já existente em `sim/experience.ts`. **Cinema**: nova sala em `content/rooms.ts`/`map.ts` e desbloqueio do tema "Cinema Independente" (`content/seasons.ts` já o tem bloqueado). **Criativo/editora/imprensa**: módulos novos em `sim/` alimentados pelo histórico de eventos (`progress`, `artists[].history`).
- **E · Direção/parcerias/sustentabilidade/licenças/acontecimentos**: extensões de `randomEvents.ts` (acontecimentos com escolhas já existem) e novas consultas sobre o estado. As licenças podem reutilizar `maintenanceError()` como modelo de bloqueio de programação.
