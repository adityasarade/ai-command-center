#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../src/config.js';
import { startGateway } from '../src/server.js';
import { Store } from '../src/store.js';
import { PricingEngine } from '../src/pricing.js';
import { FxService } from '../src/fx.js';
import { AuthService } from '../src/auth.js';
import { seedDemo } from '../src/demo.js';
import { computeStats } from '../src/stats.js';
import { buildProviderTable, customProviders, keySourceLabel } from '../src/providers.js';
import { snippetsText, fmtInt, providerAlsoList } from '../src/cli-output.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PKG = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code, s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);
const bold = (s) => c('1', s);
const dim = (s) => c('2', s);
const cyan = (s) => c('36', s);
const green = (s) => c('32', s);
const yellow = (s) => c('33', s);
const red = (s) => c('31', s);

// ---------------------------------------------------------------- arg parsing
const argv = process.argv.slice(2);
const flags = {};
const positional = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--help' || a === '-h') flags.help = true;
  else if (a === '--version' || a === '-v') flags.version = true;
  else if (a === '--no-open') flags.noOpen = true;
  else if (a === '--no-auth') flags.noAuth = true;
  else if (a === '--clear') flags.clear = true;
  else if (a === '--all') flags.all = true;
  else if (a === '--json') flags.json = true;
  else if (a.startsWith('--')) {
    // support both `--flag value` and `--flag=value`
    const eq = a.indexOf('=');
    const raw = eq === -1 ? a.slice(2) : a.slice(2, eq);
    const key = raw.replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
    if (eq !== -1) flags[key] = a.slice(eq + 1);
    else flags[key] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
  } else positional.push(a);
}
const command = positional[0] || 'start';

if (flags.version) {
  console.log(PKG.version);
  process.exit(0);
}
if (flags.help || command === 'help') {
  printHelp();
  process.exit(0);
}

try {
  if (command === 'start') await cmdStart();
  else if (command === 'demo') await cmdDemo();
  else if (command === 'clear') await cmdClear();
  else if (command === 'stats') await cmdStats();
  else if (command === 'snippets') cmdSnippets();
  else if (command === 'user') await cmdUser();
  else {
    console.error(red(`Unknown command: ${command}\n`));
    printHelp();
    process.exit(1);
  }
} catch (err) {
  console.error(red(`✖ ${err.message}`));
  process.exit(1);
}

// ------------------------------------------------------------------- commands
async function cmdStart() {
  const config = loadConfig(flags);
  const gateway = await startGateway(config);
  const url = `http://${displayHost(config.host)}:${config.port}`;

  const brand = config.branding || {};
  console.log('');
  console.log(
    `  ${bold(cyan('◆ ' + (brand.name || 'AI Command Center')))} ${dim('v' + PKG.version)}`,
  );
  console.log(`  ${dim(brand.tagline || 'One gateway, every AI project, one dashboard.')}`);
  console.log('');
  const auth = gateway.auth;
  const authLine = auth.disabled
    ? yellow('disabled (--no-auth)')
    : auth.locked
      ? green(`on - ${auth.db.users.length} user(s), ${auth.db.projects.length} project key(s)`)
      : yellow('setup pending - open the dashboard to create the admin account');
  console.log(`  ${bold('Dashboard')}   ${green(url)}`);
  console.log(`  ${bold('Auth')}        ${authLine}`);
  console.log(`  ${bold('Data')}        ${dim(config.dataDir)}`);
  console.log(`  ${bold('Records')}     ${dim(fmtInt(gateway.store.records.length))}`);
  console.log('');
  const custom = customProviders(gateway.table);
  if (custom.length) {
    console.log(`  ${bold('Custom providers')} ${dim('(from config)')}`);
    for (const p of custom) {
      console.log(
        `    ${cyan(p.id.padEnd(11))} ${dim(`→ ${p.upstream} · ${p.kind}-kind${p.overridesBuiltin ? ' · overrides built-in' : ''} · ${keySourceLabel(p, config)}`)}`,
      );
    }
    console.log('');
  }
  if (auth.locked) {
    console.log(
      `  ${bold('Point your app at the gateway')} ${dim('(auth is on: URLs carry your project key)')}`,
    );
    console.log(`    OpenAI      ${cyan(`${url}/k/<gateway-key>/openai/v1`)}`);
    console.log(`    Anthropic   ${cyan(`${url}/k/<gateway-key>/anthropic`)}`);
    console.log(`    Gemini      ${cyan(`${url}/k/<gateway-key>/gemini`)}`);
    console.log(
      `    ${dim('keys live in dashboard → settings → projects, or:')} ${bold('npx ai-command-center snippets --project <name>')}`,
    );
  } else {
    console.log(`  ${bold('Point your app at the gateway')} ${dim('(pick your provider)')}`);
    console.log(`    OpenAI      ${cyan(`${url}/p/<project>/openai/v1`)}`);
    console.log(`    Anthropic   ${cyan(`${url}/p/<project>/anthropic`)}`);
    console.log(`    Gemini      ${cyan(`${url}/p/<project>/gemini`)}`);
  }
  console.log(`    ${dim(`also: ${providerAlsoList(gateway.table)}`)}`);
  console.log('');
  console.log(`  ${dim('Copy-paste integration code:')} ${bold('npx ai-command-center snippets')}`);
  console.log(`  ${dim('No data yet? Seed a live demo:')} ${bold('npx ai-command-center demo')}`);
  console.log('');
  console.log(`  ${dim('Ctrl+C to stop')}`);
  console.log('');

  if (!flags.noOpen && process.stdout.isTTY) openBrowser(url);

  const shutdown = async () => {
    console.log(dim('\n  shutting down…'));
    gateway.server.close();
    await gateway.store.flush();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

async function cmdDemo() {
  const config = loadConfig(flags);
  const days = Number(flags.days) || 14;
  const live = await liveGateway(config);
  if (live) {
    const body = await gwJson(live, '/api/demo', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ days, clear: !!flags.clear }),
    });
    console.log(green(`✔ Seeded ${body.seeded} demo records into the running gateway.`));
    console.log(`  Dashboard: ${cyan(live)}`);
  } else {
    const store = new Store(config.dataDir).init();
    if (flags.clear) store.clear({ simulatedOnly: true });
    const pricing = new PricingEngine(config.pricing);
    const seeded = seedDemo(store, pricing, { days });
    await store.flush();
    console.log(green(`✔ Seeded ${seeded} demo records (${days} days, 4 sample projects).`));
    console.log(dim(`  (no running gateway detected - wrote directly to ${store.file};`));
    console.log(dim('   a gateway running on another port/data-dir will not see these records -'));
    console.log(dim('   target one explicitly with: npx ai-command-center demo --gateway <url>)'));
    console.log(`  Start the dashboard: ${bold('npx ai-command-center start')}`);
  }
  console.log(dim('  Demo data is tagged; remove it anytime with: npx ai-command-center clear'));
}

async function cmdClear() {
  const config = loadConfig(flags);
  const simulatedOnly = !flags.all;
  const live = await liveGateway(config);
  if (live) {
    const body = await gwJson(live, `/api/records?simulated=${simulatedOnly ? '1' : '0'}`, {
      method: 'DELETE',
    });
    console.log(green(`✔ Removed ${body.removed} ${simulatedOnly ? 'demo ' : ''}records.`));
    console.log(dim(`  (from the running gateway at ${live})`));
  } else {
    const store = new Store(config.dataDir).init();
    const removed = store.clear({ simulatedOnly });
    await store.flush();
    console.log(green(`✔ Removed ${removed} ${simulatedOnly ? 'demo ' : ''}records.`));
    console.log(
      dim(`  (data dir: ${config.dataDir}, ${fmtInt(store.records.length)} records remain)`),
    );
    if (removed === 0 && store.records.length === 0) {
      console.log(yellow('  ⚠ 0 records here - is a gateway running with a different --data-dir?'));
      console.log(dim('    Target it directly with: npx ai-command-center clear --gateway <url>'));
    }
  }
  if (simulatedOnly) console.log(dim('  (use --all to wipe real telemetry too)'));
}

async function cmdStats() {
  const config = loadConfig(flags);
  const range = flags.range || '7d';
  let stats;
  let fx;
  let source;
  let live = await liveGateway(config);
  if (live) {
    try {
      stats = await gwJson(live, `/api/stats?range=${encodeURIComponent(range)}`);
      fx = await fetch(`${live}/api/fx`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);
      source = { mode: 'gateway', gateway: live };
    } catch (err) {
      // A locked gateway won't serve stats without a login. When we discovered
      // it ourselves it serves this same data dir, so read the files directly;
      // an explicit --gateway target has no local files to fall back to.
      if (err.code !== 'gw-auth' || flags.gateway !== undefined) throw err;
      live = null;
    }
  }
  if (!live) {
    const store = new Store(config.dataDir).init();
    stats = computeStats(store.records, { range });
    source = { mode: 'files', dataDir: config.dataDir, records: store.records.length };
  }
  fx ??= {
    ...new FxService(config.dataDir, config.currency).get(),
    default: config.currency.default,
  };
  if (flags.json) {
    console.log(JSON.stringify({ ...stats, fx, source }, null, 2));
    return;
  }
  const code = fx.default || 'USD';
  const rate = fx.rates?.[code] ?? 1;
  const money = (vUsd) => fmtCur((vUsd || 0) * rate, code);
  const t = stats.totals;
  console.log('');
  console.log(`  ${bold(cyan('AI Command Center'))} ${dim(`- last ${range}`)}`);
  console.log(
    `  ${dim(
      source.mode === 'gateway'
        ? `source: live gateway at ${source.gateway}`
        : `source: ${source.dataDir} (${fmtInt(source.records)} records on disk)`,
    )}`,
  );
  console.log('');
  const usdNote =
    code !== 'USD' ? dim(` (≈ ${fmtUsd(t.costUsd)}${fx.stale ? ', approx fx' : ''})`) : '';
  console.log(`  Spend        ${bold(money(t.costUsd))}${usdNote}`);
  console.log(
    `  Requests     ${bold(String(t.requests))} ${t.errors ? red(`(${t.errors} errors)`) : ''}`,
  );
  console.log(
    `  Tokens       ${bold(fmtNum(t.tokens))} ${dim(`(${fmtNum(t.tokensIn)} in / ${fmtNum(t.tokensOut)} out)`)}`,
  );
  console.log(`  Latency      p50 ${t.p50LatencyMs}ms · p95 ${t.p95LatencyMs}ms`);
  console.log('');
  if (stats.byProject.length) {
    console.log(`  ${bold('By project')}`);
    for (const p of stats.byProject.slice(0, 10)) {
      console.log(
        `    ${p.project.padEnd(24)} ${money(p.costUsd).padStart(12)}  ${String(p.requests).padStart(6)} reqs  ${dim(p.topModel || '')}`,
      );
    }
    console.log('');
  }
  if (t.unpriced > 0) {
    const models = (stats.unpricedModels || []).map((m) => m.model);
    const shown = models.slice(0, 6).join(', ') + (models.length > 6 ? ', …' : '');
    console.log(
      yellow(
        `  ⚠ ${t.unpriced} unpriced request${t.unpriced === 1 ? '' : 's'} (cost recorded as 0)` +
          (shown ? ` - add pricing overrides for: ${shown}` : ''),
      ),
    );
    console.log(
      dim('    e.g. "pricing": { "<model>": { "in": 1.0, "out": 4.0 } } in your aicc config.\n'),
    );
  }
  if (source.mode === 'files' && source.records === 0) {
    console.log(yellow('  ⚠ 0 records here - is a gateway running with a different --data-dir?'));
    console.log(
      dim('    Point stats at it directly: npx ai-command-center stats --gateway <url>\n'),
    );
  }
}

function cmdSnippets() {
  const config = loadConfig(flags);
  const project = flags.project || 'my-app';
  const url = `http://${displayHost(config.host)}:${config.port}`;
  const auth = new AuthService(config.dataDir, { disabled: config.auth === false });
  let seg = `p/${encodeURIComponent(project)}`;
  let keyHeader = null;
  if (auth.locked) {
    const entry = auth.db.projects.find((p) => p.name === project);
    if (entry) {
      seg = `k/${entry.key}`;
      keyHeader = entry.key;
    } else {
      seg = 'k/<gateway-key>';
      console.log(
        yellow(`\n  ⚠ auth is enabled but no project named "${project}" exists yet.`) +
          dim('\n    Create it in the dashboard (settings → projects) to get its gateway key,\n') +
          dim(`    then re-run: npx ai-command-center snippets --project ${project}\n`),
      );
    }
  }
  const custom = customProviders(buildProviderTable(config));
  console.log(
    snippetsText(url, project, { bold, cyan, dim, seg, keyHeader, customProviders: custom }),
  );
}

async function cmdUser() {
  const config = loadConfig(flags);
  const auth = new AuthService(config.dataDir, { disabled: config.auth === false });
  const action = positional[1];
  if (action === 'add') {
    if (!flags.username || !flags.password) {
      throw new Error(
        'usage: aicc user add --username <name> --password <pass> [--role admin|member]',
      );
    }
    const user = await auth.createUser({
      username: flags.username,
      password: flags.password,
      role: flags.role || (auth.db.users.length === 0 ? 'admin' : 'member'),
    });
    console.log(green(`✔ created ${user.role} "${user.username}"`));
    if (await liveGateway(config)) {
      console.log(yellow('  a gateway is currently running - restart it to pick up auth changes'));
    }
  } else if (action === 'list') {
    if (!auth.db.users.length) {
      console.log(dim('no users yet - auth activates once the first admin is created'));
      return;
    }
    for (const u of auth.db.users) {
      const pu = auth.publicUser(u);
      console.log(
        `  ${pu.username.padEnd(24)} ${pu.role.padEnd(8)} ${dim(pu.teamName || '(no team)')}`,
      );
    }
  } else {
    throw new Error(
      'usage: aicc user <add|list> - user management lives in the dashboard (settings)',
    );
  }
}

// -------------------------------------------------------------------- helpers
async function liveGateway(config) {
  // --gateway <url>: operate on that running instance's API, explicitly - no
  // data-dir matching. The way to reach a gateway whose store lives elsewhere.
  // Any presence of the flag is explicit: an empty value (--gateway= with an
  // unset shell var) must fail fast, never silently operate on local files.
  if (flags.gateway !== undefined) {
    if (typeof flags.gateway !== 'string' || !flags.gateway.trim()) {
      throw new Error('usage: --gateway <url>   (e.g. --gateway http://localhost:4321)');
    }
    const url = flags.gateway.trim().replace(/\/+$/, '');
    const health = await fetch(`${url}/health`, { signal: AbortSignal.timeout(3000) })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    if (health?.name !== 'ai-command-center') {
      throw new Error(`no AI Command Center gateway answered at ${url} (is it running?)`);
    }
    return url;
  }
  const explicitAddr = flags.port != null || flags.host != null;
  // The discovery file lives inside the data dir a gateway actually serves, so a
  // hit there is guaranteed to be the gateway for THIS data dir.
  if (!explicitAddr) {
    try {
      const disc = JSON.parse(fs.readFileSync(path.join(config.dataDir, 'gateway.json'), 'utf8'));
      if (disc?.port) {
        const url = `http://${displayHost(disc.host)}:${disc.port}`;
        if (await isOurGateway(url, config, true)) return url;
      }
    } catch {
      /* no discovery file */
    }
  }
  // Otherwise probe the configured address, but only trust it if it serves our
  // data dir - never operate on a gateway backing a different store.
  const url = `http://${displayHost(config.host)}:${config.port}`;
  if (await isOurGateway(url, config, false)) return url;
  return null;
}

/** Call a live gateway's API, turning auth failures into actionable errors. */
async function gwJson(live, pathname, opts = {}) {
  const res = await fetch(`${live}${pathname}`, opts);
  const body = await res.json().catch(() => null);
  if (res.status === 401 || res.status === 403) {
    const err = new Error(
      `the gateway at ${live} has auth enabled and this needs ${res.status === 401 ? 'a login' : 'an admin login'}.\n` +
        `  Use the dashboard (${live}), or stop the gateway and re-run this command to work on its files directly.`,
    );
    err.code = 'gw-auth';
    throw err;
  }
  if (!res.ok) {
    throw new Error(body?.error?.message || `gateway error: HTTP ${res.status}`);
  }
  return body;
}

async function isOurGateway(url, config, viaDiscovery) {
  try {
    const health = await fetch(`${url}/health`, { signal: AbortSignal.timeout(700) })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    if (health?.name !== 'ai-command-center') return false;
    // A discovery-file hit already proves the data dir matches.
    if (viaDiscovery) return true;
    // Otherwise confirm via /api/meta. dataDir is only exposed to admins /
    // when auth is unlocked; if we can't read it, don't risk the wrong store.
    const meta = await fetch(`${url}/api/meta`, { signal: AbortSignal.timeout(700) })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    if (meta && meta.dataDir) {
      return path.resolve(meta.dataDir) === path.resolve(config.dataDir);
    }
    return false;
  } catch {
    return false;
  }
}

function displayHost(host) {
  return !host || host === '0.0.0.0' || host === '::' ? 'localhost' : host;
}

function openBrowser(url) {
  const cmd =
    process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '""', url] : [url];
  try {
    spawn(cmd, args, { stdio: 'ignore', detached: true }).unref();
  } catch {
    /* non-fatal */
  }
}

function fmtUsd(v) {
  if (v == null) return '$0.00';
  if (v > 0 && v < 0.01) return `$${v.toFixed(4)}`;
  return `$${v.toFixed(2)}`;
}

function fmtCur(v, code) {
  const digits = v !== 0 && Math.abs(v) < 0.01 ? 4 : 2;
  return new Intl.NumberFormat(code === 'INR' ? 'en-IN' : 'en-US', {
    style: 'currency',
    currency: code,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(v);
}

function fmtNum(v) {
  if (v == null) return '0';
  if (v >= 1e9) return (v / 1e9).toFixed(1) + 'B';
  if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(1) + 'k';
  return String(v);
}

function printHelp() {
  console.log(`
${bold(cyan('AI Command Center'))} ${dim('v' + PKG.version)} - one gateway, every AI project, one dashboard.

${bold('Usage')}
  npx ai-command-center [command] [options]

${bold('Commands')}
  start      Start the gateway + dashboard (default)
  demo       Seed 14 days of realistic sample data (safe: tagged as demo)
  clear      Remove demo data (--all wipes everything)
  stats      Print a usage/cost summary in the terminal
  snippets   Copy-paste integration code for every language
  user       add|list - CLI escape hatch (user management lives in the dashboard)
  help       Show this help

${bold('Options')}
  --port <n>        Gateway port (default 4321)
  --host <h>        Bind host (default 127.0.0.1; use 0.0.0.0 to share on LAN)
  --data-dir <dir>  Where telemetry is stored (default ~/.ai-command-center)
  --gateway <url>   demo/clear/stats: operate on a running gateway's API instead
                    of local files (works across machines and --data-dirs)
  --config <file>   Extra config file (JSON)
  --preset <name>   Load a built-in config preset (e.g. example)
  --project <name>  Project name used in snippets output
  --range <r>       stats range: 1h | 24h | 7d | 30d | 90d | all
  --days <n>        demo: days of history to generate (default 14)
  --json            stats: raw JSON output
  --no-open         start: don't open the browser
  --no-auth         start: disable login + gateway keys entirely
  --version         Print version

${bold('Examples')}
  npx ai-command-center                  ${dim('# start on http://localhost:4321')}
  npx ai-command-center demo             ${dim('# instantly see a populated dashboard')}
  npx ai-command-center snippets --project invoice-bot
  npx ai-command-center stats --range 30d
`);
}
