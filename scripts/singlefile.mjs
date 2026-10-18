// Gera um HTML único (CSS e JS embutidos) a partir de dist/, para alojar como página estática isolada.
// Uso: node scripts/singlefile.mjs <saída.html> [--fragment]
import { readFileSync, writeFileSync } from 'node:fs';
const out = process.argv[2] ?? 'dist/culture-world.html';
const fragment = process.argv.includes('--fragment');
let html = readFileSync('dist/index.html', 'utf8');
html = html.replace(/<link rel="stylesheet"[^>]*href="\.\/(assets\/[^"]+)"[^>]*>/g, (_, f) => `<style>${readFileSync('dist/' + f, 'utf8')}</style>`);
let js = '';
html = html.replace(/<script type="module"[^>]*src="\.\/(assets\/[^"]+)"[^>]*><\/script>/g, (_, f) => { js = readFileSync('dist/' + f, 'utf8'); return ''; });
if (js.includes('</script')) throw new Error('JS contém </script>');
// função de substituição: com uma string, padrões como `$&` no JS minificado seriam interpretados por replace()
html = html.replace('</body>', () => `<script type="module">${js}</script></body>`);
if (!html.includes(js)) throw new Error('O JS embutido não ficou intacto.');
if (fragment) {
  const title = html.match(/<title>.*?<\/title>/)[0];
  const styles = [...html.matchAll(/<style>[\s\S]*?<\/style>/g)].map((m) => m[0]).join('\n');
  const body = html.match(/<body>([\s\S]*)<\/body>/)[1];
  html = `${title}\n<meta name="theme-color" content="#161823">\n${styles}\n${body}`;
}
writeFileSync(out, html);
console.log(out, (html.length / 1024).toFixed(1) + ' KB');
