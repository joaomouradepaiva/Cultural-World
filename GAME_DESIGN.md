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

## Perfis de público (Expansion Pack 01 · Fase A)

8 segmentos em `content/segments.ts`: estudantes, famílias, turistas, público de música, público de teatro, profissionais criativos, público corporativo e comunidade local. Cada um tem elasticidade ao preço, preferência horária e de dia da semana, propensão ao bar, interesse em workshops, ritmo de fidelização e aspeto visual (mochila, criança, máquina fotográfica, t-shirt de banda, cachecol, boina, gravata).

- Cada artista tem uma mistura de público (por disciplina, ajustada pelo género: fado/coral atraem turistas, eletrónica/hip-hop estudantes, cena local a comunidade).
- A procura passa a ser `Σ segmento: quota × hora_s × dia_s × (ref/preço)^elasticidade_s × fidelização_s`, que substitui o antigo fator de preço único. Os modificadores ficam perto de 1, por isso a média mantém-se calibrada.
- Fidelização 0–100 por segmento: sobe ou desce com a satisfação de cada evento, ponderada pela quota do segmento; decai 0,05/dia acima de 10. Multiplica a procura desse público por 0,95–1,25.
- Cada visitante tem um segmento sorteado da mistura do evento. O bar usa a propensão do segmento e a qualidade do atendimento: sem ninguém ao balcão ×0,85, com bons empregados até ×1,12.
- As inscrições em workshops crescem com o interesse de estudantes, criativos e comunidade fidelizados.
- **Não implementado**: sócios e interesse em merchandising (não há sistema de sócios nem loja).

## Experiência do público (Fase A)

A satisfação passa de 6 para 10 componentes: qualidade 45%, preço 12%, serviço 12%, limpeza 7%, lotação/WC 7%, conforto 5%, **som 7%**, **visibilidade 2%**, **temperatura 2%** e **segurança 1%**.

- Som: PA básico ≈70, +8 por nível de som próprio; equipamento alugado soa pior.
- Visibilidade: mais de 40/70/110 pessoas com palco insuficiente baixa a nota.
- Temperatura: no verão e no inverno, com mais de 40 pessoas e sem a melhoria **Climatização**, a nota desce.
- Segurança: mais de 80 pessoas sem a nova função **Segurança** (nível 3) baixa a nota.
- O preço justo é ponderado pela sensibilidade ao preço do público presente.
- Limpeza abaixo de 50 tira 0,5 de reputação, mesmo com um bom espetáculo.
- **Reclamações e sugestões**: cada componente abaixo de 70 gera uma reclamação com a percentagem aproximada do público e uma sugestão (mais peso nos segmentos sensíveis a esse aspeto). Há ainda reclamações próprias de segmento: horário tardio para famílias e preço para estudantes. Aparecem no relatório do evento e em Missões → Público.

## Temporadas culturais (Fase A)

Programação → Temporadas. Temas: Jazz Sessions, Teatro Contemporâneo, Comedy Nights, Música Emergente, Dança Contemporânea, Artes Visuais (exige galeria), Temporada Geral; Cinema Independente fica bloqueado até ao cinema (Fase D). Durações: semana (7 dias), mês (30), trimestre (90) e anual (360). Máximo de 3 em simultâneo e uma por tema nas mesmas datas.

- Os eventos do tema dentro das datas entram automaticamente, ao marcar ou ao criar a temporada, e respeitam a agenda existente.
- **Campanha conjunta**: o orçamento é pago ao criar e soma +min(35%, orçamento/(dias × €80)) à divulgação de todos os eventos do ciclo.
- **Consistência**: +4% de procura por cada evento do ciclo já realizado (até +20%). Os segmentos do tema fidelizam 1,5× ou mais depressa nesses eventos.
- **Passes**: preço livre (€5–500). A procura depende da fidelização dos públicos do tema, da reputação, da duração e do preço face à referência (eventos × €9 × 0,6). Vendem-se até ao fim do primeiro terço da temporada e o dinheiro entra logo em caixa. Cada passe ocupa um lugar em ~80% dos eventos do ciclo (até 60% da sala), só em lugares ainda livres. A receita imputada a cada evento conta para partilhas com o artista.
- **Indicadores**: bilhetes, passes, ocupação, receita, custos (incluindo a campanha), lucro, satisfação média e reputação acumulada.
- **Objetivos**, propostos pela duração (n.º de eventos, ocupação, satisfação): cada um cumprido dá +1,5 de reputação e fidelização aos públicos do tema. Não dão dinheiro.
- Cancelar uma temporada planeada reembolsa os passes; a campanha perde-se.
- **Programação recorrente**: na marcação, "2/4/8 semanas" repete a mesma data semanalmente, validando cada uma.
- **Não implementado**: descontos para sócios (depende de um sistema de sócios).

## Operação (Expansion Pack 01 · Fase B)

- **Turnos**: dia 10–18h, noite 18–02h (custam 60% do salário diário; −0,3 de cansaço por dia) e completo 10–02h (100%; +0,6 de cansaço). Por omissão, técnicos e seguranças contratados ficam à noite e os restantes no turno completo. A escala automática põe uma pessoa por função no turno completo; com duas ou mais, alterna noite/dia (técnicos e segurança: noite + completo). Na marcação aparecem avisos quando não há ninguém escalado na abertura de portas (bilheteira), durante o evento (bar), na limpeza, na montagem (técnico, se o rider o exigir) e para mais de 80 pessoas (segurança).
- **Conservação**: cada espaço começa a 100%. Perde 0,15/dia e, por evento, 1,5 + 0,01 por espectador na sala (e 0,3 + 0,004 por espectador no átrio). Ter técnico multiplica o desgaste por 0,7; o plano preventivo, por 0,4 (custo €1,5 + 0,02/lugar por espaço e por dia). Abaixo de 60%: probabilidade de avaria no início do espetáculo = (60 − conservação)%, com −10 de qualidade (o plano preventivo evita avarias). Abaixo de 35%: não se pode programar. O conforto do público cai com a sala abaixo de 70%. Reparar custa (100 − conservação) × (6 + lugares/12) € e fecha a sala 3 h.
- **Camarins e hospitalidade**: rider de acolhimento pelo cachet (<€120: 0; <€300: 1; <€800: 2; <€2000: 3; ≥€2000: 4). A cena local e os eventos de empresas/formação não pedem nada. Acolhimento oferecido = nível do camarim + catering (água e fruta: +0,5 por €8/artista; completo: +1 por €20/artista). Satisfação do artista = 70 + 15 × (oferecido − pedido), entre 0 e 100. A relação muda (satisfação − 50)/8 por evento. ≥80% (com rider > 0): +0,3 de reputação e mais uma proposta de artista no dia seguinte. <40%: −5 de relação. Se o oferecido ficar mais de 1 nível abaixo do pedido, o artista recusa. O camarim dá ainda até +6 de qualidade em palco.
- **Armazém e kits**: espaço 2 → 6 → 12 (melhoria "Armazém" da Sala Principal, €900 / €2500). Kits: PA (€900, 2 espaços), luz (€800, 2), estrados (€1100, 3), projetor (€700, 1; +6 de qualidade em eventos de empresa e workshops). Ao marcar, o motor reserva os kits que cobrem as falhas do rider (1 nível por kit) e que não estejam reservados por um evento sobreposto. Na montagem, os kits avariados ou vendidos entretanto são substituídos por aluguer. O desgaste é de 3–5 pontos por uso; abaixo de 30% o kit avaria. Reparar custa (100 − estado) × preço/250; vender devolve 35% × estado.

## Galeria

Ala com entrada própria pela rua (nível 2, €2.500, obra de 5 h, manutenção €6/dia). Recebe uma exposição de cada vez.

- **Exposição**: 5, 7 ou 10 dias, aberta das 11:00 às 20:00. Começa no mínimo amanhã (um dia de montagem). Paga-se montagem + seguro ao agendar (€90–900) e €8/dia de energia.
- **Visitantes/dia** = público do artista × (0,75 + 0,75 × (0,6·rep geral + 0,4·rep visual)/100) × fator do dia × fator de preço ((ref/entrada)^1,2, até 1,5; grátis = 1,5) × (1 + 0,15 × iluminação) × curva (inauguração ×1,6, depois −4%/dia até 0,7).
- **Vendas**: cada visitante vê 3–5 obras; a probabilidade de compra por visitante é a do artista (1–4%) × (1 + 0,2 × iluminação). O espaço fica com a comissão (30–40%; propostas trazem +5 p.p.).
- **Obras em sala**: Expositores 6 / 9 / 12. Escultura e arte digital pedem Expositores 1; instalações e a retrospetiva, nível 2.
- **Satisfação** = 60% qualidade (0,7×qualidade do artista + 18 + 6×iluminação) + 25% preço + 15% lotação (conforto até 30 pessoas em sala). Mexe sobretudo na reputação em artes visuais (×1,5) e um pouco na geral (×0,4).
- **Sinergia**: com uma exposição aberta, o bar recebe +25% de clientes de passagem.
- **Medido** (7 dias, nível 2, reputação 10): 100–124 visitantes, 1–4 obras vendidas, resultado €233–798 (≈ €33–114/dia).
- 9 artistas plásticos fictícios (fotografia, pintura, ilustração, escultura, arte digital, têxtil, instalação), desbloqueados por nível e reputação. Também chegam como propostas na caixa de entrada.

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
