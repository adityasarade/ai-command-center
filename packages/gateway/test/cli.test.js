import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createGateway, startGateway } from '../src/server.js';
import { AuthService } from '../src/auth.js';
import { buildProviderTable, customProviders, keySourceLabel } from '../src/providers.js';
import { snippetsText, fmtInt, providerAlsoList } from '../src/cli-output.js';
import { computeStats } from '../src/stats.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BIN = path.join(__dirname, '..', 'bin', 'aicc.js');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'aicc-cli-'));

// Run the CLI in a scratch cwd (no stray aicc.config.json) with color disabled.
function runCli(args, { env = {}, cwd = tmp() } = {}) {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [BIN, ...args],
      { cwd, env: { ...process.env, NO_COLOR: '1', ...env }, timeout: 15000 },
      (err, stdout, stderr) => resolve({ code: err ? (err.code ?? 1) : 0, stdout, stderr }),
    );
  });
}

const SARVAM_CFG = {
  providers: {
    sarvam: { upstream: 'https://api.sarvam.ai', kind: 'openai', keyEnv: 'SARVAM_API_KEY' },
  },
};

// A live gateway on its own data dir, used by the --gateway tests.
let gw;
let gwUrl;
before(async () => {
  gw = createGateway({
    port: 0,
    host: '127.0.0.1',
    dataDir: tmp(),
    auth: true, // no users yet → API open, like a fresh local gateway
    providers: {},
    upstreams: {},
    keys: {},
    routes: {},
    pricing: {},
    pricingUrl: null,
    allowedOrigins: [],
    currency: { default: 'USD', options: ['USD'], rates: { USD: 1 } },
  });
  await new Promise((resolve) => gw.server.listen(0, '127.0.0.1', resolve));
  gwUrl = `http://127.0.0.1:${gw.server.address().port}`;
  const now = Date.now();
  for (let i = 0; i < 3; i++) {
    gw.store.append({
      id: 'cli_test_' + i,
      ts: now - i * 1000,
      project: 'voice-agent',
      provider: 'sarvam',
      model: 'sarvam-m',
      endpoint: '/v1/chat/completions',
      method: 'POST',
      stream: false,
      status: 200,
      ok: true,
      latencyMs: 100,
      tokensIn: 10,
      tokensOut: 5,
      tokensTotal: 15,
      costUsd: 0,
      priced: false,
      simulated: false,
    });
  }
  await gw.store.flush();
});
after(async () => {
  gw.server.close();
  await gw.store.flush();
});

// ---------------------------------------------------- item 1: custom providers

test('providerAlsoList marks config-registered providers as (custom)', () => {
  const list = providerAlsoList(buildProviderTable(SARVAM_CFG)).split(', ');
  assert.ok(list.includes('openrouter'));
  assert.ok(list.includes('ollama'));
  assert.ok(list.includes('sarvam (custom)'));
  assert.ok(!list.includes('openai'), 'headline providers are not repeated');
});

test('customProviders picks out only the config-registered entries', () => {
  const custom = customProviders(buildProviderTable(SARVAM_CFG));
  assert.deepEqual(
    custom.map((p) => p.id),
    ['sarvam'],
  );
  assert.equal(custom[0].upstream, 'https://api.sarvam.ai');
  assert.equal(custom[0].kind, 'openai');
});

test('keySourceLabel mirrors the central-key resolution order', () => {
  const p = customProviders(buildProviderTable(SARVAM_CFG))[0];
  assert.equal(keySourceLabel(p, SARVAM_CFG, { SARVAM_API_KEY: 'x' }), 'key from $SARVAM_API_KEY');
  assert.match(keySourceLabel(p, SARVAM_CFG, {}), /\$SARVAM_API_KEY \(not set/);
  assert.equal(
    keySourceLabel(p, { ...SARVAM_CFG, keys: { sarvam: 'k' } }, {}),
    'key from config keys.sarvam',
  );
  assert.equal(keySourceLabel({ id: 'x', key: 'k' }, {}, {}), 'key from config (inline)');
  assert.match(keySourceLabel({ id: 'y' }, {}, {}), /callers send their own/);
});

test('snippets include registered custom providers and the pricing pitfall', () => {
  const custom = customProviders(buildProviderTable(SARVAM_CFG));
  const text = snippetsText('http://localhost:4321', 'voice-bot', { customProviders: custom });
  assert.match(text, /Custom providers/);
  assert.match(text, /sarvam - openai-kind → https:\/\/api\.sarvam\.ai/);
  assert.ok(text.includes('http://localhost:4321/p/voice-bot/sarvam/v1'));
  assert.match(text, /"pricing"/, 'must warn that off-sheet models record unpriced');
  const plain = snippetsText('http://localhost:4321', 'voice-bot', {});
  assert.ok(!plain.includes('Custom providers'));
});

test('start banner lists custom providers with upstream, kind, and key source', async () => {
  const cwd = tmp();
  fs.writeFileSync(
    path.join(cwd, 'aicc.config.json'),
    JSON.stringify({
      ...SARVAM_CFG,
      pricingUrl: null,
      currency: { default: 'USD', options: ['USD'], rates: { USD: 1 } },
    }),
  );
  // Seed >=1000 records so the banner's thousands separator is observable.
  const dataDir = tmp();
  const now = Date.now();
  const lines = [];
  for (let i = 0; i < 1200; i++) {
    lines.push(
      JSON.stringify({
        id: 'seed_' + i,
        ts: now - i,
        project: 'seed',
        provider: 'openai',
        model: 'gpt-4o-mini',
        ok: true,
        status: 200,
        tokensIn: 1,
        tokensOut: 1,
        tokensTotal: 2,
        costUsd: 0,
        priced: true,
        simulated: true,
      }),
    );
  }
  fs.writeFileSync(path.join(dataDir, 'events.jsonl'), lines.join('\n') + '\n');

  const env = { ...process.env, AICC_DATA_DIR: dataDir, NO_COLOR: '1' };
  delete env.SARVAM_API_KEY;
  const child = spawn(process.execPath, [BIN, 'start', '--no-open', '--port', '0'], { cwd, env });
  // Capture the exit promise up front: awaiting 'exit' on an already-exited
  // child would hang the whole suite (the event never re-fires).
  const exited = new Promise((resolve) => child.once('exit', resolve));
  let out = '';
  let errOut = '';
  child.stdout.on('data', (d) => (out += d));
  child.stderr.on('data', (d) => (errOut += d));
  try {
    await new Promise((resolve, reject) => {
      const t = setTimeout(
        () => reject(new Error(`banner never completed:\n${out}\nstderr:\n${errOut}`)),
        10000,
      );
      child.stdout.on('data', () => {
        if (out.includes('Ctrl+C')) {
          clearTimeout(t);
          resolve();
        }
      });
      child.once('exit', () => {
        clearTimeout(t);
        reject(
          new Error(`start exited early (code ${child.exitCode}):\n${out}\nstderr:\n${errOut}`),
        );
      });
    });
  } finally {
    child.kill('SIGTERM');
    if (child.exitCode === null && child.signalCode === null) await exited;
  }
  assert.match(out, /sarvam \(custom\)/, 'custom provider merged into the provider list');
  assert.match(
    out,
    /sarvam\s+→ https:\/\/api\.sarvam\.ai · openai-kind · key from \$SARVAM_API_KEY \(not set/,
    'startup line shows upstream, kind, and key source',
  );
  assert.match(out, /Records\s+1,200/, 'record count uses a thousands separator');
});

test('snippets CLI picks up custom providers from the cwd config', async () => {
  const cwd = tmp();
  fs.writeFileSync(path.join(cwd, 'aicc.config.json'), JSON.stringify(SARVAM_CFG));
  const { code, stdout } = await runCli(['snippets', '--project', 'voice-bot'], {
    cwd,
    env: { AICC_DATA_DIR: tmp() },
  });
  assert.equal(code, 0);
  assert.match(stdout, /Custom providers/);
  assert.ok(stdout.includes('/p/voice-bot/sarvam/v1'));
});

test('a config provider overriding a built-in id stays visible', () => {
  const cfg = { providers: { mistral: { upstream: 'http://localhost:8081' } } };
  const table = buildProviderTable(cfg);
  // inherits the built-in's auth defaults instead of silently changing them
  assert.equal(table.mistral.kind, 'openai');
  assert.equal(table.mistral.keyEnv, 'MISTRAL_API_KEY');
  assert.equal(table.mistral.upstream, 'http://localhost:8081');
  const custom = customProviders(table);
  assert.deepEqual(
    custom.map((p) => p.id),
    ['mistral'],
  );
  assert.equal(custom[0].overridesBuiltin, true);
  assert.ok(providerAlsoList(table).split(', ').includes('mistral (custom)'));
  // anthropic override keeps anthropic parsing + auth header
  const t2 = buildProviderTable({ providers: { anthropic: { upstream: 'http://localhost:9' } } });
  assert.equal(t2.anthropic.kind, 'anthropic');
  assert.equal(t2.anthropic.authHeader, 'x-api-key');
});

// ------------------------------------- item 2: stats/clear across data dirs

test('stats names the resolved data dir and hints when the store is empty', async () => {
  const dir = tmp();
  const { code, stdout } = await runCli(['stats'], { env: { AICC_DATA_DIR: dir } });
  assert.equal(code, 0);
  assert.ok(stdout.includes(dir), 'stats must print the resolved data dir');
  assert.match(stdout, /0 records on disk/);
  assert.match(stdout, /different --data-dir\?/);
  assert.match(stdout, /--gateway <url>/);
});

test('clear names the resolved data dir and hints when it removed nothing', async () => {
  const dir = tmp();
  const { code, stdout } = await runCli(['clear'], { env: { AICC_DATA_DIR: dir } });
  assert.equal(code, 0);
  assert.match(stdout, /Removed 0 demo records/);
  assert.ok(stdout.includes(dir), 'clear must print the resolved data dir');
  assert.match(stdout, /different --data-dir\?/);
});

test('stats --json includes the source it read from', async () => {
  const dir = tmp();
  const { code, stdout } = await runCli(['stats', '--json'], { env: { AICC_DATA_DIR: dir } });
  assert.equal(code, 0);
  const parsed = JSON.parse(stdout);
  assert.equal(parsed.source.mode, 'files');
  assert.equal(parsed.source.dataDir, dir);
  assert.equal(parsed.source.records, 0);
});

test('repro: stats from another data dir does not silently show the gateway store', async () => {
  const otherDir = tmp();
  const { code, stdout } = await runCli(['stats'], { env: { AICC_DATA_DIR: otherDir } });
  assert.equal(code, 0);
  assert.match(stdout, /Requests\s+0/);
  assert.ok(stdout.includes(otherDir), 'names the store it actually read');
  assert.match(stdout, /--gateway/, 'points at the way to reach the running gateway');
});

test('stats --gateway queries the running instance across data dirs', async () => {
  const otherDir = tmp();
  const { code, stdout } = await runCli(['stats', '--gateway', gwUrl], {
    env: { AICC_DATA_DIR: otherDir },
  });
  assert.equal(code, 0, `stderr should be empty, got: ${stdout}`);
  assert.ok(stdout.includes(`live gateway at ${gwUrl}`));
  assert.match(stdout, /Requests\s+3/);
  assert.match(stdout, /voice-agent/);
  assert.match(stdout, /sarvam:sarvam-m/, 'unpriced models are named, not just counted');
});

test('stats --gateway fails clearly when nothing answers there', async () => {
  const { code, stderr } = await runCli(['stats', '--gateway', 'http://127.0.0.1:1'], {
    env: { AICC_DATA_DIR: tmp() },
  });
  assert.notEqual(code, 0);
  assert.match(stderr, /no AI Command Center gateway/);
});

test('clear --gateway clears the running instance, not local files', async () => {
  gw.store.append({
    id: 'cli_test_sim',
    ts: Date.now(),
    project: 'demo',
    provider: 'openai',
    model: 'gpt-4o-mini',
    endpoint: '/v1/chat/completions',
    method: 'POST',
    stream: false,
    status: 200,
    ok: true,
    latencyMs: 50,
    tokensIn: 5,
    tokensOut: 2,
    tokensTotal: 7,
    costUsd: 0.001,
    priced: true,
    simulated: true,
  });
  await gw.store.flush();
  const { code, stdout } = await runCli(['clear', '--gateway', gwUrl], {
    env: { AICC_DATA_DIR: tmp() },
  });
  assert.equal(code, 0);
  assert.match(stdout, /Removed 1 demo records/);
  assert.match(stdout, /running gateway at/);
  assert.equal(gw.store.records.filter((r) => r.simulated).length, 0);
});

test('demo --gateway seeds the running instance across data dirs', async () => {
  const before = gw.store.records.length;
  const { code, stdout } = await runCli(['demo', '--gateway', gwUrl, '--days', '2'], {
    env: { AICC_DATA_DIR: tmp() },
  });
  assert.equal(code, 0);
  assert.match(stdout, /Seeded \d+ demo records into the running gateway/);
  assert.ok(gw.store.records.length > before, 'records landed in the live gateway store');
  // clean the shared store up for any tests that follow
  const res = await fetch(`${gwUrl}/api/records?simulated=1`, { method: 'DELETE' });
  assert.ok(res.ok);
  assert.equal(gw.store.records.filter((r) => r.simulated).length, 0);
});

test('empty --gateway= fails fast instead of touching local files', async () => {
  // the scripting foot-gun: --gateway="$UNSET_VAR" expands to --gateway=
  const dir = tmp();
  fs.writeFileSync(
    path.join(dir, 'events.jsonl'),
    JSON.stringify({ id: 'keep_me', ts: Date.now(), project: 'p', provider: 'openai', ok: true }) +
      '\n',
  );
  const { code, stderr } = await runCli(['clear', '--all', '--gateway='], {
    env: { AICC_DATA_DIR: dir },
  });
  assert.notEqual(code, 0);
  assert.match(stderr, /usage: --gateway/);
  assert.match(
    fs.readFileSync(path.join(dir, 'events.jsonl'), 'utf8'),
    /keep_me/,
    'local store must be untouched',
  );
});

test('locked gateway: --gateway errors actionably; discovered stats falls back to files', async () => {
  const lockedDir = tmp();
  const auth = new AuthService(lockedDir, {});
  await auth.createUser({ username: 'admin', password: 'super-secret-1', role: 'admin' });
  const locked = await startGateway({
    port: 0,
    host: '127.0.0.1',
    dataDir: lockedDir,
    auth: true,
    providers: {},
    upstreams: {},
    keys: {},
    routes: {},
    pricing: {},
    pricingUrl: null,
    allowedOrigins: [],
    currency: { default: 'USD', options: ['USD'], rates: { USD: 1 } },
  });
  const lockedUrl = `http://127.0.0.1:${locked.server.address().port}`;
  try {
    // explicit --gateway against a locked gateway: no files to fall back to → clear error
    const stats = await runCli(['stats', '--gateway', lockedUrl], {
      env: { AICC_DATA_DIR: tmp() },
    });
    assert.notEqual(stats.code, 0);
    assert.match(stats.stderr, /auth enabled/);
    // discovered locked gateway (same data dir): stats reads the files directly instead of dying
    const fallback = await runCli(['stats'], { env: { AICC_DATA_DIR: lockedDir } });
    assert.equal(fallback.code, 0, fallback.stderr);
    assert.match(fallback.stdout, /records on disk/);
    assert.ok(fallback.stdout.includes(lockedDir));
    // clear via the discovered locked gateway needs auth → actionable error, no silent wipe
    const clr = await runCli(['clear'], { env: { AICC_DATA_DIR: lockedDir } });
    assert.notEqual(clr.code, 0);
    assert.match(clr.stderr, /auth enabled/);
  } finally {
    locked.server.close();
  }
});

// --------------------------------------------- item 3 (CLI half) and item 5

test('computeStats reports which models the unpriced counter refers to', () => {
  const now = Date.now();
  const recs = [
    { ts: now, project: 'p', provider: 'sarvam', model: 'sarvam-m', ok: true, priced: false },
    { ts: now, project: 'p', provider: 'sarvam', model: 'sarvam-m', ok: true, priced: false },
    { ts: now, project: 'p', provider: 'sarvam', model: 'saarika-v2', ok: true, priced: false },
    {
      ts: now,
      project: 'p',
      provider: 'openai',
      model: 'gpt-4o-mini',
      ok: true,
      priced: true,
      costUsd: 0.01,
    },
  ];
  const stats = computeStats(recs, { range: '24h' });
  assert.equal(stats.totals.unpriced, 3);
  assert.deepEqual(stats.unpricedModels, [
    { model: 'sarvam:sarvam-m', requests: 2 },
    { model: 'sarvam:saarika-v2', requests: 1 },
  ]);
});

test('fmtInt adds thousands separators', () => {
  assert.equal(fmtInt(8762), '8,762');
  assert.equal(fmtInt(0), '0');
  assert.equal(fmtInt(1234567), '1,234,567');
  assert.equal(fmtInt(null), '0');
});
