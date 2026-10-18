# CULTURE WORLD

Tycoon de gestão cultural para browser. Começas com um armazém abandonado — uma sala polivalente de 20 lugares, uma bilheteira e €1.500 — e transformas-o num centro cultural: programas concertos, stand-up, teatro e dança, serves no bar, contratas a equipa, compras melhorias e abres novas salas.

Estado atual: **MVP jogável + Galeria + Expansion Pack 01, Fases A e B** (temporadas, perfis de público, experiência, passes, turnos, manutenção, camarins e armazém). As Fases C–E do Expansion Pack ainda **não** estão implementadas. O que está e não está implementado está descrito em [ROADMAP.md](ROADMAP.md).

## Executar

Requisitos: Node.js 18+ (testado com Node 22).

```bash
npm install
npm run dev        # servidor de desenvolvimento → http://localhost:5173
npm run build      # typecheck + build de produção para dist/
npm run preview    # serve o build de produção → http://localhost:4173
npm test           # testes do motor de simulação (Vitest)
npm run balance    # bot de balanceamento: joga 14 dias e imprime o relatório diário
```

Testes de browser (Playwright + Chromium, opcionais; precisam de `playwright` instalado):

```bash
npm run build && npm run preview &
npm run e2e                                            # critérios do MVP, desktop + mobile
node scripts/e2e.mjs http://localhost:4173/            # só desktop
node scripts/e2e.mjs http://localhost:4173/ --mobile   # idem, viewport mobile com toque
node scripts/smoke.mjs http://localhost:4173/ shots    # screenshots do primeiro concerto
```

`node scripts/singlefile.mjs dist/culture-world.html` gera uma versão num único HTML (CSS e JS embutidos, ~262 KB).

O build (`dist/`) é estático: pode ser servido por qualquer servidor de ficheiros (GitHub Pages, Netlify, etc.). Não há backend nem serviços pagos.

## Controlos

| Ação | Desktop | Mobile |
|---|---|---|
| Mover o gestor | clicar no chão, WASD/setas | tocar no chão |
| Servir clientes | ficar atrás do balcão da bilheteira ou do bar (clicar no balcão leva-te lá) | tocar no balcão |
| Limpar | passar por cima do lixo | idem |
| Câmara | arrastar, roda do rato, `F` segue o gestor, duplo clique | arrastar, pinça |
| Tempo | `Espaço` pausa, `1`/`2`/`3` = 1×/2×/4× | botões no topo |
| Painéis | `P` programação, `B` construção, `E` equipa, `M` missões, `Esc` fecha | barra inferior |

O jogo grava automaticamente no `localStorage` a cada 20 s e ao fechar a página. Menu ☰ → exportar/importar save em JSON.

## Documentação

- [GAME_DESIGN.md](GAME_DESIGN.md) — mecânicas, fórmulas e parâmetros económicos.
- [ARCHITECTURE.md](ARCHITECTURE.md) — estrutura do código e decisões técnicas.
- [ROADMAP.md](ROADMAP.md) — fases, o que está feito e o que falta.
- [CHANGELOG.md](CHANGELOG.md) — histórico de versões.

## Créditos e licenças

Todo o grafismo é desenhado por código (Canvas 2D) e todo o áudio é sintetizado em tempo real (WebAudio). Não há assets de terceiros. Nomes de artistas e companhias são fictícios.
