// Teste E2E dos critérios do MVP com interação real (cliques, toques, teclado) no Chromium.
// Uso: node scripts/e2e.mjs <url> [--mobile]
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require(execSync('npm root -g').toString().trim() + '/playwright'); }
const url = process.argv[2] ?? 'http://localhost:4173/';
const mobile = process.argv.includes('--mobile');
const browser = await pw.chromium.launch();
const ctx = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
page.setDefaultTimeout(8000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const results = [];
const check = (name, ok, info = '') => { results.push([ok ? 'PASS' : 'FAIL', name, info]); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`); };
const S = (fn, arg) => page.evaluate(fn, arg);
const tapWorld = async (x, y) => {
  const [sx, sy] = await S(([x, y]) => window.__cw.renderer.tileToScreen(x, y), [x, y]);
  if (mobile) await page.touchscreen.tap(sx, sy); else await page.mouse.click(sx, sy);
};
const click = async (sel) => { if (mobile) await page.tap(sel); else await page.click(sel); };
const dismiss = async () => {
  for (let i = 0; i < 6; i++) {
    if (await page.isVisible('.panel >> text=Fantástico!')) await click('.panel >> text=Fantástico!');
    else if (await page.isVisible('.panel >> button:text-is("Continuar")')) await click('.panel >> button:text-is("Continuar")');
    else if (await page.isVisible('.panel .close')) await click('.panel .close');
    else return;
    await page.waitForTimeout(200);
  }
};

await page.goto(url);
await page.waitForTimeout(400);
check('O jogo abre no browser', await page.isVisible('text=CULTURE WORLD'));
await click('text=Jogar');
await page.waitForTimeout(500);
check('Canvas do mundo desenhado', await S(() => { const c = document.getElementById('game'); return c.width > 0 && c.height > 0; }));
await click('.tutorial >> text=Continuar');

// 1. personagem move-se (toque/clique no chão)
const p0 = await S(() => ({ ...window.__cw.sim.state.player }));
await S(() => window.__cw.renderer.cam.focusTile(7, 8, 0.9));
await page.waitForTimeout(700);
await tapWorld(7.5, 7.5);
await page.waitForTimeout(2500);
const p1 = await S(() => ({ ...window.__cw.sim.state.player }));
check('A personagem move-se por toque/clique', Math.hypot(p1.x - p0.x, p1.y - p0.y) > 3, `(${p0.x.toFixed(1)},${p0.y.toFixed(1)}) → (${p1.x.toFixed(1)},${p1.y.toFixed(1)})`);
if (!mobile) {
  await page.keyboard.down('d');
  await page.waitForTimeout(400);
  await page.keyboard.up('d');
  const p2 = await S(() => ({ ...window.__cw.sim.state.player }));
  check('A personagem move-se com teclado', Math.hypot(p2.x - p1.x, p2.y - p1.y) > 0.5);
}
check('Tutorial avança ao entrar na sala', (await S(() => window.__cw.sim.state.tutorial.step)) >= 2);

// limpar a sala andando por cima do lixo
for (let i = 0; i < 12; i++) {
  const d = await S(() => window.__cw.sim.state.rooms.hall.dirt[0]);
  if (!d) break;
  await S(([x, y]) => window.__cw.sim.walkPlayerTo(x, y), [d.x, d.y]);
  await page.waitForTimeout(1600);
}
check('Limpeza manual pelo gestor', (await S(() => window.__cw.sim.state.rooms.hall.dirt.length)) === 0);

// 2. construir o bar através da zona em obras
await S(() => window.__cw.renderer.cam.focusTile(19.5, 15.5, 0.9));
await page.waitForTimeout(700);
await tapWorld(19.5, 16.5);
await page.waitForTimeout(400);
await click('.panel >> text=Construir Bar');
await page.waitForTimeout(300);
check('Zona em obras → construção do bar', await S(() => !!window.__cw.sim.state.rooms.bar.construction));

// 3. programar concerto pela UI
await click('#btn-program');
await page.waitForTimeout(300);
await click('.panel >> text=Os Ventiladores');
await page.waitForTimeout(300);
await click('.panel button.btn.gold.big');
await page.waitForTimeout(300);
const b = await S(() => window.__cw.sim.state.bookings[0]);
check('É possível programar um concerto', !!b && b.status === 'scheduled', b ? `${b.artistId} @ ${b.startAt}` : '');

// 4. público compra bilhetes (pré-venda progressiva)
await S(() => window.__cw.sim.runUntil(window.__cw.sim.state.time + 240));
const sold1 = await S(() => window.__cw.sim.state.bookings[0].presold);
check('O público compra bilhetes antecipadamente', sold1 > 0, `${sold1} vendidos`);
check('Construção concluída (nova área desbloqueada: bar)', await S(() => window.__cw.sim.state.rooms.bar.built));

// gestor na bilheteira na abertura de portas
await S(() => { const s = window.__cw.sim; s.runUntil(s.state.bookings[0].startAt - 50); });
await S(() => window.__cw.renderer.cam.focusTile(3, 14, 0.9));
await page.waitForTimeout(600);
await tapWorld(3.2, 13.8);
await page.waitForTimeout(4000);
check('Toque na bilheteira leva o gestor ao balcão', await S(() => { const p = window.__cw.sim.state.player; return Math.hypot(p.x - 2.5, p.y - 13.5) < 1.4; }));
await S(() => { const s = window.__cw.sim; s.runUntil(s.state.bookings[0].startAt + 15); });
const bb = await S(() => window.__cw.sim.state.bookings[0]);
check('Venda à porta com o gestor na bilheteira', bb.doorSold > 0, `${bb.doorSold} à porta`);
check('O concerto acontece (estado ao vivo)', bb.status === 'live');
check('Os NPCs circulam / assistem', await S(() => { const s = window.__cw.sim.state; const n = s.agents.filter((a) => a.state === 'seated').length; return n >= Math.max(3, s.bookings[0].attendees * 0.6); }), await S(() => `${window.__cw.sim.state.agents.filter((a) => a.state === 'seated').length} sentados de ${window.__cw.sim.state.bookings[0].attendees}`));
check('Artistas em palco', await S(() => window.__cw.sim.state.agents.filter((a) => a.kind === 'artist' && a.state === 'perform').length) >= 3);
await page.waitForTimeout(800);
await page.screenshot({ path: `${process.env.SHOTS ?? '/tmp'}/e2e-show${mobile ? '-m' : ''}.png` });

// gestor ao bar depois do espetáculo
await S(() => { const s = window.__cw.sim; s.runUntil(s.state.bookings[0].startAt + s.state.bookings[0].duration - 5); s.placePlayer(19.5, 12.45); });
const moneyBefore = await S(() => window.__cw.sim.state.money);
await S(() => { const s = window.__cw.sim; let g = 0; while (s.state.bookings[0].status !== 'settled' && g++ < 400) s.runMinutes(1); });
const res = await S(() => window.__cw.sim.state.bookings[0].result);
check('O bar gera receitas', res && res.barRevenue > 0, res ? `€${res.barRevenue}` : '');
check('Os custos são descontados (cachet, energia)', res && res.artistPay > 0 && res.energy > 0);
await page.waitForTimeout(400);
check('Relatório financeiro aparece', await page.isVisible('.panel >> text=Relatório'));
await dismiss();

// 5. reinvestir: melhoria via painel da sala (toque no palco)
await S(() => window.__cw.renderer.cam.focusTile(7, 2.5, 0.9));
await page.waitForTimeout(700);
await tapWorld(7.5, 2.5);
await page.waitForTimeout(400);
const capBefore = await S(() => window.__cw.sim.state.rooms.hall.upgrades.seats);
await click('.panel .item:has-text("Plateia") >> button');
await page.waitForTimeout(300);
const capAfter = await S(() => window.__cw.sim.state.rooms.hall.upgrades.seats);
check('O dinheiro pode ser reinvestido (melhoria comprada)', capAfter === capBefore + 1);
check('A melhoria altera o funcionamento (capacidade 40)', await S(() => { const s = window.__cw.sim.state; return s.rooms.hall.upgrades.seats === 1; }));
await dismiss();

// 6. contratar funcionário
await click('#btn-staff');
await page.waitForTimeout(300);
await click('.panel >> text=Contratar');
await page.waitForTimeout(300);
await click('.panel .item:has-text("Empregado/a de bar") >> button:has-text("Contratar")');
await page.waitForTimeout(300);
check('Um funcionário pode ser contratado', (await S(() => window.__cw.sim.state.staff.length)) === 1);
await dismiss();
// automatização: o empregado serve sem o gestor
await S(() => { const s = window.__cw.sim; s.placePlayer(2, 17.5); s.runUntil(Math.ceil(s.state.time / 1440) * 1440 + 13 * 60); });
const drinksA = await S(() => window.__cw.sim.state.progress.drinksServed);
await S(() => { const s = window.__cw.sim; s.runMinutes(6 * 60); });
const drinksB = await S(() => window.__cw.sim.state.progress.drinksServed);
check('Automatização básica: empregado serve sozinho', drinksB > drinksA, `${drinksB - drinksA} bebidas`);

// 7. nova área (Black Box) ao nível 3
await S(() => { const s = window.__cw.sim; s.state.money += 5000; s.state.level = 3; });
await page.waitForTimeout(300);
await dismiss();
await click('#btn-build');
await page.waitForTimeout(300);
await click('.panel .item:has-text("Black Box") >> button');
await page.waitForTimeout(300);
check('Uma nova área pode ser desbloqueada (Black Box)', await S(() => !!window.__cw.sim.state.rooms.blackbox.construction));

// 8. save/load
await S(() => { const s = window.__cw.sim; s.runMinutes(400); });
const snap = await S(() => ({ money: window.__cw.sim.state.money, time: window.__cw.sim.state.time, bb: window.__cw.sim.state.rooms.blackbox.built }));
await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
await page.reload();
await page.waitForTimeout(500);
check('Splash oferece continuar', await page.isVisible('text=Continuar'));
await click('text=Continuar');
await page.waitForTimeout(500);
const after = await S(() => ({ money: window.__cw.sim.state.money, time: window.__cw.sim.state.time, bb: window.__cw.sim.state.rooms.blackbox.built }));
check('O progresso é guardado e recuperado', Math.abs(after.money - snap.money) < 0.01 && after.bb === snap.bb && after.time >= snap.time, JSON.stringify({ snap, after }));

check('Sem erros de JavaScript', errors.length === 0, errors.join(' | '));
console.log(`\n${results.filter((r) => r[0] === 'PASS').length}/${results.length} critérios OK (${mobile ? 'mobile' : 'desktop'})`);
await browser.close();
process.exit(results.some((r) => r[0] === 'FAIL') ? 1 : 0);
