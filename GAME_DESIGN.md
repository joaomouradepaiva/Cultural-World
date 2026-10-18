# Game Design — CULTURE WORLD

Todos os números abaixo vêm de `src/content/balance.ts`, `rooms.ts`, `artists.ts` e `catalog.ts`. Se divergirem deste documento, o código manda.

## Fantasia e ciclo principal

Gerir um ecossistema — artistas, público, equipa, programação, receitas, comunidade — dentro de um edifício vivo em cutaway.

```
programar → preparar (montagem, stock) → pré-venda → portas → bilheteira à porta → espetáculo
→ bar → liquidação (relatório) → reputação/XP → reinvestir (melhorias, equipa, obras) → desbloquear
```

## Tempo

- 1 s real = 3 min de jogo (1×); 2× e 4×; pausa. Noite sem público (02:00–10:00) corre 10×.
- Dia 0 = sexta-feira. Custos fixos pagos à meia-noite; seguro ao domingo; candidatos novos à segunda.
- Um evento ocupa a sala de `início − montagem` até `fim + limpeza (45 min)`. Portas abrem 45 min antes. Montagem: música 90, teatro/dança 120, stand-up 60 min (−25% com técnico). Sobreposições são recusadas.

## Procura de bilhetes (determinística + ±8% por evento)

```
procura = 1,35 × público_do_artista × fator_reputação × dia × hora × preço × marketing
          × frescura × histórico × acessibilidade × variação_do_evento
fator_reputação = 0,8 + 0,7 × (0,6×rep_geral + 0,4×rep_disciplina)/100
preço           = min(1,5; (preço_ref / preço)^1,3)
marketing       = 1 + boost_canal + min(0,25; comunidade/400)    (divulgação orgânica)
frescura        = 0,6 + 0,4 × dias_desde_última_atuação/30       (se < 30 dias)
histórico       = 0,9 + 0,2 × satisfação_média_últimos_5/100
dia             = seg 0,75 · ter 0,8 · qua 0,85 · qui 0,95 · sex 1,15 · sáb 1,25 · dom 0,9
hora            = 0,55 (10h) … 1,0 (20h) · 1,05 (21h) · 0,85 (23h)
```

- **Pré-venda** = min(capacidade, procura × 0,72 × fator_antecedência), vendida progressivamente (curva suave) até às portas. `fator_antecedência = 0,35 + 0,65 × min(1, horas_até_portas/48)`. Venda online (+10% quota e fator mínimo). Marcar no próprio dia vende pouco antecipadamente; com 2 dias de avanço vende muito mais.
- **À porta**: o resto da procura chega entre a abertura de portas e 12 min antes do início e faz fila na bilheteira. Sem bilheteiro ou gestor ao balcão, desiste após 20 min. Se esgotar, os excedentes (até +6) vão embora.

## Contratos

| Modelo | Custo inicial | Pagamento ao artista | Risco |
|---|---|---|---|
| Cachet fixo | cachet | — | Teu: casa vazia = prejuízo |
| Partilha de bilheteira | 0 | 60–85% da bilheteira (desce com a relação) | Partilhado; margem baixa |
| Garantia + % (nível 2) | 0 | 50% do cachet + 50% acima de 2× garantia | Intermédio |
| Aluguer a promotor (nível 4) | 0 | — (promotor paga 120/80 + 1,5×lugares) | Nenhum na bilheteira; ganhas renda + bar |

Cachet = cachet_base × (popularidade_atual/popularidade_base)^0,9 × (1 − min(20%, relação/500)).

## Rider técnico e qualidade

- Cada artista pede níveis de Som/Luz/Palco. Em falta: aluguer por evento (som €60, luz €50, palco €70 por nível). Falta > 2 níveis: impossível. Soma do rider ≥ 4 exige técnico.
- `qualidade = 0,7 × qualidade_artista + 18 + bónus de equipamento acima do pedido (3/3/2 por nível) + técnico (4 + competência) + camarins × 3 − 10 (avaria não reparada)`.

## Satisfação (por evento)

`45% qualidade + 15% preço justo + 15% serviço + 10% limpeza + 10% lotação vs. WC + 5% conforto`

- Preço justo: 100 − 60 × (preço/ref − 1), mínimo 20.
- Serviço: 100 − 3 × espera média (min) − 120 × fração que desistiu (bilheteira + bar).
- Limpeza: média de sala, átrio e bar; cada foco de lixo −4%.
- Lotação: sem WC o conforto vai até 40 pessoas; WC 120, WC ampliado 260. Acima: −80% por cada 100% de excesso.
- Conforto: 50 + 20 × decoração do átrio + 20 × acessibilidade.

## Reputação

- Geral e por disciplina (música; teatro & performance inclui stand-up e dança; comunidade; artes visuais/cinema/formação reservadas para fases seguintes).
- Δ = (satisfação − 55)/45 × 7 × peso(público), peso = log10(público+1)/2 limitado a [0,3; 1,2]; ganhos atenuados por (1 − rep/110); esgotado +0,8. Disciplina recebe 1,5×Δ. Aluguer a promotor conta metade. Sem eventos há > 7 dias: −0,1/dia.
- Desbloqueia artistas (cada um tem nível e reputação mínimos) e imprevistos positivos (patrocínios, mecenas).

## Bar

- Produtos: água, refrigerante, cerveja (início); vinho, petiscos (carta 1); cocktail, tosta (carta 2). Cada um com custo, preço de referência e popularidade.
- Compra: antes do espetáculo 60% (só quem chega com mais de 30 min de margem), depois 50%, × fator de consumo do público do artista (0,7 fado/coral … 1,45 eletrónica) × atratividade dos preços ((ref/preço)^1,5). 25% levam duas bebidas antes do espetáculo.
- Clientes de passagem (10:00–24:00): 3/h × (0,4 + rep/50) × decoração × mesas. Ficam numa mesa 20–45 min se houver lugar.
- Os clientes só entram na fila quando chegam ao bar; paciência 18 min (bilheteira 20). Serviço: 1,2 min por bebida / velocidade (gestor 1,0; empregado 0,85–1,45; equipamento ×1,25/×1,5). Postos: 1/2/3 conforme o balcão.
- Stock limitado (120 + 60 por posto extra); perecíveis perdem 10% por noite. Gestor de bar (nível 4) repõe automaticamente com +5% de custo.
- Sinergia: um concerto pouco rentável na bilheteira pode dar lucro no bar (público de eletrónica, rock, hip-hop).

## Equipa e automatização

| Função | Nível | Salário/dia | Efeito |
|---|---|---|---|
| Bilheteiro/a | 1 | €36–68 | Serve na bilheteira (1 por guiché) |
| Empregado/a de bar | 1 | €38–70 | Serve no bar (1 por posto) |
| Limpeza | 1 | €30–54 | Limpa lixo automaticamente (fora do espetáculo) |
| Técnico/a | 3 | €50–90 | −25% montagem, +qualidade, obrigatório para riders exigentes |
| Gestor/a de bar | 4 | €55–95 | Reposição automática de stock |

Competência 1–5 (velocidade 0,85–1,45). Experiência acumulada sobe a competência. Satisfação desce com sobrecarga; abaixo de 15 a pessoa despede-se; prémio de €50 dá +20. Limite de equipa: 2 + 2 × nível.

Sem equipa, o gestor faz tudo: fica atrás dos balcões para servir e passa pelo lixo para limpar. Isto cria a tensão "estou na bilheteira ou no bar?" que a contratação resolve.

## Economia fixa

Renda €30/dia · manutenção (por sala + por nível de melhoria) · salários · seguro €45/semana · energia €12 + €0,15/pessoa por evento · limpeza €5/evento.

## Espaços (MVP)

| Espaço | Nível | Custo | Obra | Melhorias |
|---|---|---|---|---|
| Sala Principal | início | — | — | Plateia 20→180, Som 0–3, Luz 0–3, Palco 0–2, Camarins 0–2, Acessibilidades |
| Átrio & Bilheteira | início | — | — | Guichés 1–2, Venda online, Decoração 0–2 |
| Bar | 1 | €500 | 2 h | Balcão 1–3 postos, Equipamento, Carta 0–2, Mesas 2/4/6 |
| Black Box | 3 | €3.000 | 6 h | Plateia 40–90, Som, Luz, Palco |
| Instalações sanitárias | 3 | €1.500 | 3 h | Dimensão (conforto 120/260) |
| Sala de ensaio | 4 | €3.500 | 4 h | Equipamento 1–3 (alugueres por hora, 1–3 slots/dia) |

## Progressão

XP por evento: 20 + 1/espectador + 20 se satisfação ≥ 70 (metade em aluguer). Obras +30, melhorias +10, missões. XP para subir: 100 × nível^1,6. Prémio de nível: €100 × nível. Estatutos: 1 O Armazém, 5 Espaço Independente, 10 Centro Cultural de Bairro, 15 Centro Cultural da Cidade, 25 Complexo Cultural, 40 Instituição de Referência, 60 Rede Cultural (os dois últimos sem conteúdo ainda).

Curva medida pelo bot (`npm run balance`, estratégia simples, 1 evento/noite): nível 3 ao dia 4–5, Black Box por volta do dia 10–12, nível 4–5 e reputação ~30–39 ao dia 14, sem falência. Um jogador que marque com antecedência e use a segunda sala progride mais depressa.

## Disponibilidade de artistas e cena local

- Um artista pode ter várias datas contigo, desde que fiquem a 5+ dias umas das outras (realizadas ou marcadas). Repetir em menos de 30 dias reduz a procura, contando também datas já marcadas.
- **Cena local**: todas as segundas chegam 4 artistas emergentes gerados (música, stand-up, teatro amador, dança urbana), sempre desbloqueados, sem rider técnico, cachet ~2× o público, público 16–30 (cresce ligeiramente com o teu nível). Ficam disponíveis enquanto tiverem data marcada ou depois de atuarem cá; crescem em popularidade com bons espetáculos como os do catálogo.
- Com estas regras, no nível 1 é possível programar todas as 13 noites seguintes (teste `tests/scene.test.ts`); antes eram 4.

## Caixa de propostas

Todas as manhãs chegam propostas (máx. 8 pendentes; expiram ao fim de 2 dias). Aceitar agenda o evento com os termos indicados; recusar uma proposta de artista baixa a relação em 2 (aceitar sobe 3).

| Origem | Desde | Probabilidade/dia | Termos | Efeito |
|---|---|---|---|---|
| Artista | nível 1 | 75% (+40% de uma segunda a partir do nível 3) | Cachet −15%, ou partilha −5 p.p., ou garantia −15%; data livre a 3–13 dias | Espetáculo normal |
| Empresa | nível 2 | 50% | Aluguer €120 + 3×lugares + até €150 (+€60 na Sala); dias úteis | Receita certa, sem bilheteira; reputação ×0,3; bar conforme o tipo (festa de equipa bebe mais) |
| Formador (workshop) | nível 2 | 50% | Inscrições €18–35; formador fica com 50–60% | +reputação em formação e comunidade; inscrições dependem dessas reputações |

Empresas e formações têm inscritos (não há venda à porta) e montagem de 45 min. As propostas evitam datas já ocupadas, e a validação volta a correr no momento de aceitar.

## Calendário

Programação → Calendário: 14 dias × salas, linha do tempo 10:00–02:00. Mostra eventos (cor do artista; cinza = empresa, verde = formação), montagem/limpeza tracejada, propostas pendentes a tracejado dourado e alugueres da sala de ensaio. Tocar num espaço livre abre a marcação já com sala, dia e hora. A marcação aceita até 14 dias de antecedência (antes só mostrava 7).

## Imprevistos (nível 5+, 30%/dia)

Viral (+30–50% procura num evento), avaria (reparar ou −10 qualidade em 3 eventos), patrocínio (dinheiro vs. comunidade), associação de moradores (comunidade), mecenas (requer reputação 30 e comunidade 10), inspeção. A simulação pausa até decidires.

## Tutorial (14 passos)

Boas-vindas → entrar na sala → limpar o lixo → construir o bar → contratar Os Ventiladores → acelerar o tempo → bilheteira → espetáculo → servir no bar → relatório → comprar melhoria → contratar → chegar ao nível 3 e construir a Black Box → fim. Pode ser saltado.

## Princípios

- A interface principal é o edifício; os painéis são secundários.
- Nenhum valor mostrado é inventado: previsões usam as mesmas fórmulas do motor e são rotuladas como previsão; relatórios mostram o que aconteceu.
- Sem dinheiro infinito: financiamento externo é pontual (imprevistos), missões são únicas, cooldown de 5 dias por artista e penalização de frescura impedem repetir o artista mais rentável.
