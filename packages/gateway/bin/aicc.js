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
  console.log(`  ${bold(cyan('◆ ' + (brand.name || 'AI Command Center')))} ${dim('v' + PKG.version)}`);
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
  console.log(`  ${bold('Records')}     ${dim(String(gateway.store.records.length))}`);
  console.log('');
  if (auth.locked) {
    console.log(`  ${bold('Point your app at the gateway')} ${dim('(auth is on: URLs carry your project key)')}`);
    console.log(`    OpenAI      ${cyan(`${url}/k/<gateway-key>/openai/v1`)}`);
    console.log(`    Anthropic   ${cyan(`${url}/k/<gateway-key>/anthropic`)}`);
    console.log(`    Gemini      ${cyan(`${url}/k/<gateway-key>/gemini`)}`);
    console.log(`    ${dim('keys live in dashboard → settings → projects, or:')} ${bold('npx ai-command-center snippets --project <name>')}`);
  } else {
    console.log(`  ${bold('Point your app at the gateway')} ${dim('(pick your provider)')}`);
    console.log(`    OpenAI      ${cyan(`${url}/p/<project>/openai/v1`)}`);
    console.log(`    Anthropic   ${cyan(`${url}/p/<project>/anthropic`)}`);
    console.log(`    Gemini      ${cyan(`${url}/p/<project>/gemini`)}`);
  }
  console.log(`    ${dim('also: openrouter, mistral, deepseek, xai, groq, together, ollama')}`);
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
    const res = await fetch(`${live}/api/demo`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ days, clear: !!flags.clear }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(body?.error?.message || `gateway error: HTTP ${res.status}`);
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
    console.log(dim('   a gateway running on another port/data-dir will not see these records)'));
    console.log(`  Start the dashboard: ${bold('npx ai-command-center start')}`);
  }
  console.log(dim('  Demo data is tagged; remove it anytime with: npx ai-command-center clear'));
}

async function cmdClear() {
  const config = loadConfig(flags);
  const simulatedOnly = !flags.all;
  const live = await liveGateway(config);
  if (live) {
    const res = await fetch(`${live}/api/records?simulated=${simulatedOnly ? '1' : '0'}`, {
      method: 'DELETE',
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(body?.error?.message || `gateway error: HTTP ${res.status}`);
    console.log(green(`✔ Removed ${body.removed} ${simulatedOnly ? 'demo ' : ''}records.`));
  } else {
    const store = new Store(config.dataDir).init();
    const removed = store.clear({ simulatedOnly });
    await store.flush();
    console.log(green(`✔ Removed ${removed} ${simulatedOnly ? 'demo ' : ''}records.`));
  }
  if (simulatedOnly) console.log(dim('  (use --all to wipe real telemetry too)'));
}

async function cmdStats() {
  const config = loadConfig(flags);
  const range = flags.range || '7d';
  let stats;
  let fx;
  const live = await liveGateway(config);
  if (live) {
    const res = await fetch(`${live}/api/stats?range=${range}`);
    if (!res.ok) throw new Error(`gateway error: HTTP ${res.status}`);
    stats = await res.json();
    fx = await fetch(`${live}/api/fx`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  } else {
    const store = new Store(config.dataDir).init();
    stats = computeStats(store.records, { range });
  }
  fx ??= { ...new FxService(config.dataDir, config.currency).get(), default: config.currency.default };
  if (flags.json) {
    console.log(JSON.stringify({ ...stats, fx }, null, 2));
    return;
  }
  const code = fx.default || 'USD';
  const rate = fx.rates?.[code] ?? 1;
  const money = (vUsd) => fmtCur((vUsd || 0) * rate, code);
  const t = stats.totals;
  console.log('');
  console.log(`  ${bold(cyan('AI Command Center'))} ${dim(`- last ${range}`)}`);
  console.log('');
  const usdNote = code !== 'USD' ? dim(` (≈ ${fmtUsd(t.costUsd)}${fx.stale ? ', approx fx' : ''})`) : '';
  console.log(`  Spend        ${bold(money(t.costUsd))}${usdNote}`);
  console.log(`  Requests     ${bold(String(t.requests))} ${t.errors ? red(`(${t.errors} errors)`) : ''}`);
  console.log(`  Tokens       ${bold(fmtNum(t.tokens))} ${dim(`(${fmtNum(t.tokensIn)} in / ${fmtNum(t.tokensOut)} out)`)}`);
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
    console.log(yellow(`  ⚠ ${t.unpriced} requests used models with no pricing entry (cost shown as 0).`));
    console.log(dim('    Add prices via the "pricing" key in your aicc config.\n'));
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
  console.log(snippetsText(url, project, { bold, cyan, dim, seg, keyHeader }));
}

async function cmdUser() {
  const config = loadConfig(flags);
  const auth = new AuthService(config.dataDir, { disabled: config.auth === false });
  const action = positional[1];
  if (action === 'add') {
    if (!flags.username || !flags.password) {
      throw new Error('usage: aicc user add --username <name> --password <pass> [--role admin|member]');
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
      console.log(`  ${pu.username.padEnd(24)} ${pu.role.padEnd(8)} ${dim(pu.teamName || '(no team)')}`);
    }
  } else {
    throw new Error('usage: aicc user <add|list> - user management lives in the dashboard (settings)');
  }
}

// -------------------------------------------------------------------- helpers
async function liveGateway(config) {
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

export function snippetsText(
  url,
  project,
  { bold: b = (s) => s, cyan: cy = (s) => s, dim: d = (s) => s, seg, keyHeader = null } = {},
) {
  seg ||= `p/${encodeURIComponent(project)}`;
  const base = `${url}/${seg}`;
  const keyed = seg.startsWith('k/');
  const trackAuth = keyHeader
    ? ` \\\n    -H "x-aicc-key: ${keyHeader}"`
    : keyed
      ? ' \\\n    -H "x-aicc-key: <gateway-key>"'
      : '';
  return `
${b('── Plug any project into AI Command Center ──────────────────────────')}

${b('Zero-code (any language)')} ${d('- just point the SDK at the gateway via env vars:')}
  ${cy(`export OPENAI_BASE_URL="${base}/openai/v1"`)}
  ${cy(`export ANTHROPIC_BASE_URL="${base}/anthropic"`)}
  ${d('Your provider API keys stay exactly where they are - the gateway passes them through.')}

${b('Python (OpenAI SDK)')}
  from openai import OpenAI
  client = OpenAI(base_url="${base}/openai/v1")

${b('Python (Anthropic SDK)')}
  from anthropic import Anthropic
  client = Anthropic(base_url="${base}/anthropic")

${b('Python (google-genai)')}
  from google import genai
  client = genai.Client(http_options={"base_url": "${base}/gemini"})

${b('JavaScript / TypeScript')}
  import OpenAI from "openai";
  const client = new OpenAI({ baseURL: "${base}/openai/v1" });

${b('Java (openai-java)')}
  OpenAIClient client = OpenAIOkHttpClient.builder()
      .fromEnv().baseUrl("${base}/openai/v1").build();

${b('LangChain (Python)')}
  llm = ChatOpenAI(base_url="${base}/openai/v1")

${b('curl')}
  curl ${base}/openai/v1/chat/completions \\
    -H "Authorization: Bearer $OPENAI_API_KEY" -H "Content-Type: application/json" \\
    -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"hi"}]}'

${b('Anything else (batch jobs, unsupported providers)')} ${d('- report usage directly:')}
  curl -X POST ${url}/api/track -H "Content-Type: application/json"${trackAuth} \\
    -d '{"project":"${project}","provider":"openai","model":"gpt-4o-mini","tokensIn":1200,"tokensOut":300}'

${
  keyed
    ? d('The gateway key in the URL both authenticates the call and assigns it to your project.')
    : d(`Replace "${project}" with your project name - that's how calls are grouped on the dashboard.`) +
      '\n' +
      d('Alternative to path prefix: send header  x-aicc-project: ' + project)
}
`;
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
