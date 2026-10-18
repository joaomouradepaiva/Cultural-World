# Changelog

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
