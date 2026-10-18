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
