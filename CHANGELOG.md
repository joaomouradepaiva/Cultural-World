# Changelog

## 0.5.0 — Expansion Pack 01 · Fase B (operação)

### Adicionado
- Turnos da equipa: dia (10–18h), noite (18–02h) ou completo. Os turnos de 8 h custam 60% do salário e cansam menos; o completo cansa. Só trabalha quem está de turno. Escala automática e avisos na marcação quando falta alguém escalado (bilheteira, bar, limpeza, técnico, segurança).
- Manutenção: cada espaço tem estado de conservação, que cai com o tempo e com o uso (público incluído). Abaixo de 60% há avarias nos espetáculos (−10 de qualidade); abaixo de 35% a inspeção fecha a sala à programação. Reparação paga, com 3 h de obra (operários visíveis; recusada se apanhar um evento). Técnicos reduzem o desgaste em 30%; o plano preventivo reduz 60% e elimina avarias, com custo diário. Aviso no mapa.
- Camarins com 4 níveis na Sala Principal (Básico, Equipado, Profissional, Premium) e 2 na Black Box. Cada artista tem um rider de acolhimento pelo seu estatuto; o catering global (água e fruta / completo) custa por artista e por evento. A satisfação do artista afeta a relação; muito boa traz uma recomendação (reputação e mais uma proposta); muito abaixo do pedido, o artista recusa a data. Com camarim, os artistas esperam lá até à abertura de portas.
- Armazém (melhoria da Sala Principal, 2/6/12 de espaço) e equipamento móvel: kit PA, kit de luz, estrados modulares e projetor. Cada kit cobre 1 nível em falta no rider em vez de alugar. É reservado ao marcar e nunca está em dois eventos sobrepostos. Desgasta-se com o uso, avaria abaixo de 30% e pode ser reparado ou vendido. Caixas visíveis nos bastidores.
- Categoria de despesa "Catering e camarins"; o catering e os kits aparecem na previsão e no relatório do evento.

### Alterado
- O bónus de qualidade dos camarins passa a ter um teto de +6 (era nível × 3). Mantém o valor dos saves antigos com camarins de nível 2.
- O bónus de relação passa a vir da satisfação do artista com o acolhimento, e não diretamente do nível do camarim.

## 0.4.0 — Expansion Pack 01 · Fase A (programação e público)

### Adicionado
- Perfis de público: 8 segmentos com preço, horário, dia, bar, workshops e fidelização próprios; procura calculada por segmento; visitantes com aspeto do seu segmento.
- Fidelização por segmento persistente, que afeta a procura futura.
- Experiência do público com 10 componentes (som, visibilidade, temperatura e segurança novos) e reclamações com sugestões no relatório e em Missões → Público.
- Melhoria Climatização (Sala Principal e Black Box) e função Segurança.
- Temporadas culturais (7 temas + geral; semana, mês, trimestre, ano) com campanha conjunta, consistência do ciclo, passes de temporada, objetivos e indicadores.
- Programação recorrente semanal.

### Corrigido
- Os passes vendidos depois da pré-venda podiam sobrelotar a sala (detetado em teste).

## 0.3.0 — Galeria

### Adicionado
- Galeria: nova ala com entrada própria (nível 2). Exposições de 5–10 dias com entrada (ou grátis), visitantes que circulam pelas obras, venda de obras com comissão e reputação em artes visuais.
- 9 artistas plásticos, propostas de exposição na caixa de entrada, faixa da galeria no calendário.
- Melhorias: Iluminação museográfica e Expositores. Missões: Abrir a galeria, Primeira exposição, Colecionadores.
- Obras desenhadas proceduralmente conforme a técnica (pintura, fotografia, escultura, instalação…), com ponto vermelho quando vendidas.

## 0.2.1 — Há sempre o que programar

### Corrigido
- Com poucos artistas desbloqueados e uma única data por artista, o jogador ficava sem nada para programar (no nível 1, só 4 das 13 noites seguintes). Agora cada artista pode ter várias datas com 5 dias de intervalo.

### Adicionado
- Cena local: 4 artistas emergentes novos todas as segundas, em qualquer nível.
- O seletor de artistas mostra as datas já marcadas e avisa quando o artista não pode na data escolhida; os dias indisponíveis aparecem marcados no formulário.

## 0.2.0 — Propostas e calendário

### Adicionado
- Caixa de propostas (📥): artistas que pedem data com condições melhores, empresas que alugam salas para reuniões/eventos, formadores com workshops. Expiram em 2 dias; aceitar agenda o evento.
- Eventos de empresa (aluguer, sem bilheteira, pouca reputação) e workshops (inscrições partilhadas com o formador, reputação em formação e comunidade).
- Calendário de 14 dias por sala com marcação por toque num espaço livre.
- Marcação com 14 dias de antecedência e mais horários (10:00–23:00).
- Missões "Cliente empresarial" e "Primeira formação".

### Corrigido
- O mesmo artista podia enviar duas propostas na mesma manhã.

## 0.1.0 — MVP jogável (Fase 1)

### Adicionado
- Motor de simulação determinístico e testável sem interface (`src/sim`), com estado 100% serializável.
- Calendário (dias, semanas, meses de 30 dias), velocidades 1×/2×/4×, pausa, aceleração noturna automática.
- Agenda com montagem, portas, espetáculo e limpeza; deteção de conflitos.
- 21 artistas fictícios (música, stand-up, teatro, dança) com popularidade, cachet, rider técnico, relação e evolução.
- 4 modelos de contrato: cachet fixo, partilha de bilheteira, garantia + %, aluguer a promotor.
- Bilheteira com procura determinística, pré-venda progressiva, venda à porta com filas e paciência, esgotados.
- Bar com 7 produtos, stock, preços, desperdício de perecíveis, filas, mesas e clientes de passagem.
- Equipa: bilheteiro, empregado de bar, limpeza, técnico, gestor de bar (competência, satisfação, experiência, prémios).
- Construção de Bar, Black Box, Instalações sanitárias e Sala de ensaio; 19 melhorias com efeitos reais.
- Reputação geral e por disciplina, satisfação por evento com 6 componentes, XP e níveis com desbloqueios.
- 23 missões, tutorial de 14 passos, 6 imprevistos com escolhas.
- Renderizador isométrico em Canvas 2D: edifício em cutaway, mobiliário, rua com trânsito, ciclo dia/noite, luzes de palco, partículas.
- Personagens procedurais animadas (andar, sentar, aplaudir, tocar instrumentos, limpar, martelar).
- Áudio procedimental WebAudio (efeitos, público, música ao vivo, aplausos, risos).
- HUD, painéis de programação (com previsão), salas, construção, equipa, bar, finanças, missões, menu.
- Save automático versionado em `localStorage`, exportar/importar JSON.
- Confirmações em dois toques (sem `confirm()`, bloqueado em webviews).
- Gerador de HTML único (`scripts/singlefile.mjs`).
- Testes Vitest (motor + bot de balanceamento) e scripts Playwright (critérios do MVP, screenshots).
