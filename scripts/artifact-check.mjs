// Verifica que o HTML único (artefacto) arranca: ecrã inicial, entrada no jogo e zero erros de JavaScript.
// Uso: node scripts/artifact-check.mjs <ficheiro.html> [--mobile]
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require(execSync('npm root -g').toString().trim() + '/playwright'); }
const file = process.argv[2] ?? 'dist/culture-world.html';
const mobile = process.argv.includes('--mobile');
let html = readFileSync(file, 'utf8');
// os fragmentos (sem <html>) são embrulhados como o visualizador de artefactos faz
if (!/<html/i.test(html)) html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>${html}</body></html>`;
const dir = mkdtempSync(join(tmpdir(), 'cw-'));
writeFileSync(join(dir, 'index.html'), html);
const browser = await pw.chromium.launch();
const ctx = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto('file://' + join(dir, 'index.html'));
await page.waitForTimeout(800);
const splash = await page.isVisible('text=Jogar');
if (splash) { if (mobile) await page.tap('text=Jogar'); else await page.click('text=Jogar'); }
await page.waitForTimeout(1200);
const inGame = await page.evaluate(() => !!window.__cw && window.__cw.sim.state.time > 0 && !!document.querySelector('#btn-program'));
await browser.close();
const ok = splash && inGame && errors.length === 0;
console.log(`${ok ? 'PASS' : 'FAIL'}  artefacto (${mobile ? 'mobile' : 'desktop'}): ecrã inicial ${splash}, jogo ${inGame}, erros ${errors.length}${errors.length ? ' — ' + errors.join(' | ') : ''}`);
process.exit(ok ? 0 : 1);
