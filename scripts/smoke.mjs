// Teste de fumo no browser: abre o jogo, joga o início e tira screenshots.
// Uso: node scripts/smoke.mjs <url> <pasta-de-saída>
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require(execSync('npm root -g').toString().trim() + '/playwright'); }
const url = process.argv[2] ?? 'http://localhost:4173/';
const out = process.argv[3] ?? 'shots';
const mobile = process.argv.includes('--mobile');
const browser = await pw.chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
const ctx = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.goto(url);
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/00-splash.png` });
await page.click('text=Jogar');
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/01-start.png` });
const cw = (fn, arg) => page.evaluate(fn, arg);
// tutorial: continuar, entrar na sala, limpar
await page.click('.tutorial >> text=Continuar');
await cw(() => { const s = window.__cw.sim; for (const d of [...s.state.rooms.hall.dirt]) { s.placePlayer(d.x, d.y); s.runMinutes(3); } });
await page.waitForTimeout(300);
await cw(() => window.__cw.sim.build('bar'));
await page.waitForTimeout(300);
// abrir programação pela UI
await page.click('#btn-program');
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/02-artists.png` });
await page.click('.panel >> text=Os Ventiladores');
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/03-booking.png`, fullPage: false });
await page.click('.panel button.btn.gold.big');
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/04-booked.png` });
// avançar até às portas
await cw(() => { const s = window.__cw.sim; s.runUntil(s.state.bookings[0].startAt - 50); });
await cw(() => { const s = window.__cw.sim; s.walkPlayerTo(2.5, 13.5); });
await page.waitForTimeout(1500);
await cw(() => { const s = window.__cw.sim; s.runMinutes(25); });
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/05-doors.png` });
await cw(() => { const s = window.__cw.sim; s.runUntil(s.state.bookings[0].startAt + 20); window.__cw.renderer.cam.focusTile(7.5, 5, 1.2); });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/06-show.png` });
await cw(() => { const s = window.__cw.sim; s.placePlayer(19.5, 12.45); s.runUntil(s.state.bookings[0].startAt + s.state.bookings[0].duration + 12); window.__cw.renderer.cam.focusTile(18, 15, 1.1); });
await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}/07-bar.png` });
await cw(() => { const s = window.__cw.sim; let g = 0; while (s.state.bookings[0].status !== 'settled' && g++ < 400) s.runMinutes(1); });
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/08-result.png` });
const state = await cw(() => { const s = window.__cw.sim.state; return { money: s.money, level: s.level, tut: s.tutorial.step, res: s.bookings[0].result, agents: s.agents.length }; });
console.log(JSON.stringify(state));
console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
await browser.close();
