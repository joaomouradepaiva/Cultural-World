# Arquitetura

## Decisões técnicas

| Pedido no briefing | Escolha | Porquê |
|---|---|---|
| TypeScript | TypeScript (strict) | — |
| Vite | Vite 5 | — |
| Phaser 3 | **Canvas 2D próprio** | O mundo é isométrico, desenhado proceduralmente (sem spritesheets). Com Phaser estaríamos a usar quase só `Graphics`, ganhando ~1 MB de bundle e perdendo controlo direto do depth-sorting e da composição de luz. O renderizador próprio tem ~900 linhas e o build total tem 163 KB (58 KB gzip). |
| React para menus | **DOM + helper `h()`** | Os painéis são formulários simples re-renderizados a pedido. React acrescentaria dependência e um segundo modelo de estado sem ganho claro nesta fase. |
| Save local | `localStorage` + JSON versionado | Sem serviços pagos. Exportar/importar ficheiro incluído. |

Contra-argumento a estas escolhas (registado para revisão futura): se o projeto passar a usar sprites desenhados por artistas, animações por spritesheet, física ou WebGL, Phaser (ou PixiJS) passa a compensar. A camada `render/` está isolada para essa troca não tocar na simulação.

## Estrutura

```
src/
  content/        dados configuráveis (sem lógica)
    balance.ts    parâmetros económicos e de tempo
    map.ts        planta do edifício, portas, pontos de interesse (filas, lugares, palcos)
    rooms.ts      espaços, custos de construção, melhorias e manutenção
    artists.ts    catálogo de artistas
    catalog.ts    produtos do bar, funções da equipa, marketing, contratos
    missions.ts   missões e passos do tutorial
    segments.ts   perfis de público · seasons.ts temas e durações de temporada
    equipment.ts  kits do armazém e opções de catering · visualArtists.ts artistas plásticos
    premium.ts    preços, capacidades e propensão por segmento das experiências premium
  sim/            motor de simulação — não importa nada de render/ ou ui/
    types.ts      GameState (100% JSON-serializável)
    state.ts      estado inicial e consultas derivadas
    sim.ts        Simulation: relógio, ciclo diário, comandos
    time.ts       calendário
    economy.ts    contabilidade (todas as entradas/saídas de dinheiro)
    bookings.ts   procura, contratos, agenda, venda de bilhetes, liquidação
    agents.ts     NPCs: visitantes, filas, serviço, artistas, equipa, operários
    bar.ts        stock, preços, escolha de produto, desperdício, reposição
    staff.ts      candidatos, contratação, satisfação, evolução, turnos e escala
    audience.ts   procura e fidelização por segmento de público
    experience.ts componentes de satisfação, reclamações, estação do ano
    seasons.ts    temporadas culturais e passes
    maintenance.ts conservação dos espaços, avarias, reparações, plano preventivo
    hospitality.ts rider de acolhimento, catering, satisfação do artista
    equipment.ts  armazém, kits (compra, reserva sem uso duplo, desgaste, reparação)
    proposals.ts  caixa de propostas · scene.ts cena local · gallery.ts exposições
    negotiation.ts pontuação, contraproposta e termos negociados
    sponsors.ts   contratos de patrocínio (propostas, pagamento, cumprimento)
    finance.ts    empréstimos, descoberto, tesouraria a 14 dias, comprar vs. alugar
    premium.ts    VIP, camarotes, meet & greet, bastidores, mecenas, pré-venda
    construction.ts  obras e melhorias
    progression.ts   XP, níveis, desbloqueios, missões, tutorial
    randomEvents.ts  imprevistos com escolhas
    grid.ts       grelha de navegação + A*
    rng.ts        RNG determinístico (estado no save)
    save.ts       serialização versionada + migrações
  render/         camada visual (lê o estado, nunca o altera)
    renderer.ts   mundo isométrico, mobiliário, luz, etiquetas, hit-testing
    characters.ts personagens procedurais
    camera.ts     câmara suave, zoom, foco
    particles.ts  moedas, confetti, notas, pó
    iso.ts        projeção e primitivas
  audio/audio.ts  WebAudio procedimental (efeitos, público, música ao vivo)
  ui/             HUD, painéis, tutorial, entrada
  main.ts         arranque, loop, gravação automática
tests/            Vitest: motor de simulação + bot de balanceamento
scripts/          Playwright: e2e dos critérios do MVP e screenshots
```

## Fluxo de dados

```
input (rato/toque/teclado) ──► UI ──► comandos Simulation (book, build, upgrade, hire, …)
                                          │
requestAnimationFrame ──► Simulation.update(dt real)
                            └─ ticks fixos de 0,25 min de jogo:
                               construção → eventos/bilheteira → NPCs/filas → tutorial → missões
                          Simulation.drain() ──► eventos (moedas, sons, toasts, relatórios)
                                                   ├─► Renderer (partículas)
                                                   ├─► UI (toasts, modais)
                                                   └─► Audio
                          Renderer.render(state)    (interpolação visual das posições)
```

- **Tempo**: 1 s real = 3 min de jogo a 1× (2× e 4× disponíveis). Entre as 02:00 e as 10:00, sem público, o tempo corre 10× mais depressa. Relatórios e decisões pausam a simulação (`sim.hold`).
- **Determinismo**: toda a aleatoriedade usa o RNG guardado no estado. O teste `save / load` confirma que continuar a partir de um save dá exatamente o mesmo resultado que não gravar.
- **O jogador** move-se em tempo real (independente da velocidade de jogo); a sua posição está no estado porque a simulação a usa (servir ao balcão, limpar).
- **NPCs**: a lógica (filas, serviço, paciência, lugares) corre na simulação em tempo de jogo; o renderizador só suaviza posições entre ticks.

## Testes

- `tests/sim.test.ts` — 23 testes: navegação, procura, contratos, agenda e conflitos, cancelamento, ciclo completo do primeiro concerto (bilheteira, bar, liquidação, contabilidade = dinheiro), NPCs (sentam-se e saem), automatização, custos diários, construção, melhorias, inventário, desperdício, save/load e determinismo, missões, tutorial.
- `tests/proposals.test.ts`, `scene.test.ts`, `gallery.test.ts` — caixa de propostas, cena local, galeria.
- `tests/phaseA.test.ts` — segmentos, experiência, temporadas, passes e compatibilidade de saves (Fase A).
- `tests/phaseB.test.ts` — turnos, manutenção, camarins/hospitalidade, armazém/kits e compatibilidade de saves (Fase B).
- `tests/phaseC.test.ts` — contratos, negociação, patrocínios, empréstimos, tesouraria, premium e compatibilidade de saves (Fase C).
- `scripts/artifact-check.mjs` — abre o HTML único no Chromium e falha se não arrancar ou houver erros de JS.
- `tests/balance.test.ts` — bot que joga 14 dias com uma estratégia simples; falha se falir ou se o crescimento for explosivo/lento demais.
- `scripts/e2e.mjs` — percorre os critérios do MVP no Chromium com cliques, toques e teclado reais.

## Adicionar conteúdo

- Novo artista: acrescentar um objeto a `ARTISTS` em `content/artists.ts`.
- Novo produto do bar: `PRODUCTS` em `content/catalog.ts` (com `menuLevel`).
- Nova melhoria: acrescentar a `upgrades` da sala em `content/rooms.ts`; o efeito é lido por `upgradeValue(state, room, key)`.
- Nova missão: `MISSIONS` em `content/missions.ts` (`progress` devolve `[atual, alvo]`).
- Novo campo no estado: acrescentar em `sim/types.ts` e `createInitialState`; `save.ts` preenche valores em falta em saves antigos. Para mudanças incompatíveis, subir `SAVE_VERSION` e acrescentar uma migração em `MIGRATIONS`.

## Limitações conhecidas

- Os NPCs atravessam-se uns aos outros (sem evasão local); as filas são posições fixas.
- O hit-testing projeta o clique no chão: clicar no topo de objetos altos seleciona o chão atrás deles.
- Uma única cidade/edifício; a planta está fixa em `content/map.ts` (expansão modular livre fica para a Fase 4).
