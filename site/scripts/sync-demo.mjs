// Copies the real gateway dashboard (and the pure aggregation modules it needs)
// into site/public/demo/ so the website can host a live, fully client-side demo.
// Run locally after changing the dashboard: `node scripts/sync-demo.mjs`.
// The generated files are committed; Vercel just serves them statically.
//
// Kept OUT of the copy (hand-written, never overwritten): demo-data.js (in-browser
// record generator) and demo-boot.js (mock backend + loader).
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const gw = path.join(root, 'packages', 'gateway');
const out = path.join(root, 'site', 'public', 'demo');
fs.mkdirSync(path.join(out, 'vendor'), { recursive: true });

const copy = (from, to) => fs.copyFileSync(path.join(gw, from), path.join(out, to));
copy('public/app.js', 'app.js');
copy('public/style.css', 'style.css');
copy('public/vendor/chart.umd.js', 'vendor/chart.umd.js');
copy('src/stats.js', 'stats.js'); // pure - powers the mock /api responses
copy('src/anomaly.js', 'anomaly.js'); // pure - imports only from ./stats.js

// Transform the dashboard HTML: resolve assets under /demo/ via <base>, and swap
// the classic app.js include for the module loader that installs the mock first.
let html = fs.readFileSync(path.join(gw, 'public', 'index.html'), 'utf8');
html = html
  .replace('<meta charset="utf-8" />', '<meta charset="utf-8" />\n    <base href="/demo/" />')
  .replace('href="/style.css"', 'href="style.css"')
  .replace('src="/vendor/chart.umd.js"', 'src="vendor/chart.umd.js"')
  .replace('<script src="/app.js"></script>', '<script type="module" src="demo-boot.js"></script>');
fs.writeFileSync(path.join(out, 'index.html'), html);

console.log('demo synced →', path.relative(root, out));
