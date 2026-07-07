import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createGateway } from '../src/server.js';
import { startMockUpstream } from './mock-upstream.js';

let mock;
let gw;
let base; // gateway origin
let store;

const approx = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} !≈ ${b}`);

function waitForRecords(n, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    (function poll() {
      if (store.records.length >= n) return resolve();
      if (Date.now() - t0 > timeoutMs) {
        return reject(
          new Error(`timed out waiting for ${n} records (have ${store.records.length})`),
        );
      }
      setTimeout(poll, 15);
    })();
  });
}

before(async () => {
  mock = await startMockUpstream();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aicc-test-'));
  const config = {
    port: 0,
    host: '127.0.0.1',
    dataDir,
    keys: { anthropic: 'sk-central-anthropic' },
    providers: {
      'my-compat': { upstream: mock.url, kind: 'openai' },
    },
    upstreams: { openai: mock.url, anthropic: mock.url, gemini: mock.url },
    pricing: { 'custom-finetune': { in: 100, out: 200 } },
    // manual rates keep tests hermetic - no live FX fetch
    currency: { default: 'INR', options: ['INR', 'USD', 'EUR'], rates: { INR: 80, EUR: 0.9 } },
  };
  gw = createGateway(config);
  store = gw.store;
  await new Promise((resolve) => gw.server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${gw.server.address().port}`;
});

after(async () => {
  gw.server.close();
  await mock.close();
});

// --------------------------------------------------------------------------
test('openai non-stream: tokens, cache-aware cost, project from path', async () => {
  const n = store.records.length;
  const res = await fetch(`${base}/p/proj-a/openai/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer sk-caller' },
    body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'hi' }] }),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.choices[0].message.content, 'Hello');
  await waitForRecords(n + 1);

  const r = store.records.at(-1);
  assert.equal(r.project, 'proj-a');
  assert.equal(r.provider, 'openai');
  assert.equal(r.model, 'gpt-4o-mini');
  assert.equal(r.tokensIn, 120);
  assert.equal(r.tokensOut, 30);
  assert.equal(r.cacheRead, 20);
  assert.equal(r.ok, true);
  assert.equal(r.priced, true);
  // (100 uncached × $0.15 + 20 cached × $0.075 + 30 out × $0.60) / 1e6
  approx(r.costUsd, (100 * 0.15 + 20 * 0.075 + 30 * 0.6) / 1e6);
  // pass-through auth reached the mock unchanged; aicc headers stripped
  assert.equal(mock.state.last.headers.authorization, 'Bearer sk-caller');
  assert.equal(mock.state.last.headers['x-aicc-project'], undefined);
});

test('openai stream: stream_options injected, SSE relayed intact, usage from final chunk', async () => {
  const n = store.records.length;
  const res = await fetch(`${base}/p/proj-a/openai/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer sk-caller' },
    body: JSON.stringify({ model: 'gpt-4o-mini', stream: true, messages: [] }),
  });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/event-stream/);
  const text = await res.text();
  assert.ok(text.includes('"Hel"') && text.includes('"lo"'), 'content chunks relayed');
  assert.ok(text.includes('[DONE]'), 'DONE sentinel relayed');
  // gateway quietly added include_usage for cost capture
  assert.equal(mock.state.last.body.stream_options?.include_usage, true);

  await waitForRecords(n + 1);
  const r = store.records.at(-1);
  assert.equal(r.stream, true);
  assert.equal(r.tokensIn, 120);
  assert.equal(r.tokensOut, 30);
  assert.equal(r.priced, true);
});

test('injected stream_options usage chunk is filtered from a client that did not opt in', async () => {
  const n = store.records.length;
  const res = await fetch(`${base}/p/proj-a/openai/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-4o-mini', stream: true, messages: [] }),
  });
  const text = await res.text();
  assert.ok(text.includes('"Hel"') && text.includes('"lo"'), 'content chunks still relayed');
  assert.ok(text.includes('[DONE]'), 'DONE still relayed');
  assert.ok(
    !/"choices"\s*:\s*\[\s*\]/.test(text),
    'usage-only choices:[] chunk withheld from client',
  );
  assert.ok(!text.includes('"completion_tokens"'), 'usage object not leaked to client');
  await waitForRecords(n + 1);
  const r = store.records.at(-1);
  assert.equal(r.tokensIn, 120); // usage still captured for billing
  assert.equal(r.tokensOut, 30);
});

test('openai stream with caller-set stream_options is left untouched', async () => {
  const n = store.records.length;
  await fetch(`${base}/openai/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      stream: true,
      stream_options: { include_usage: false },
      messages: [],
    }),
  });
  assert.equal(mock.state.last.body.stream_options.include_usage, false);
  await waitForRecords(n + 1);
  const r = store.records.at(-1);
  assert.equal(r.tokensIn, null); // no usage chunk arrives → logged as untracked, not guessed
});

test('openai embeddings: prompt-only usage', async () => {
  const n = store.records.length;
  await fetch(`${base}/p/proj-b/openai/v1/embeddings`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'text-embedding-3-small', input: 'hello world' }),
  });
  await waitForRecords(n + 1);
  const r = store.records.at(-1);
  assert.equal(r.tokensIn, 512);
  assert.equal(r.tokensOut, 0);
  approx(r.costUsd, (512 * 0.02) / 1e6);
});

test('anthropic non-stream: cache read/write priced correctly, central key injected', async () => {
  const n = store.records.length;
  const res = await fetch(`${base}/p/proj-a/anthropic/v1/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' }, // deliberately NO x-api-key
    body: JSON.stringify({ model: 'claude-sonnet-4-5', max_tokens: 100, messages: [] }),
  });
  assert.equal(res.status, 200);
  await waitForRecords(n + 1);
  const r = store.records.at(-1);
  assert.equal(r.provider, 'anthropic');
  // input 200 excl. cache; read 100; write 10; out 45
  assert.equal(r.tokensIn, 200 + 100 + 10);
  assert.equal(r.tokensOut, 45);
  approx(r.costUsd, (200 * 3 + 100 * 0.3 + 10 * 3.75 + 45 * 15) / 1e6);
  // central key + default version header were injected
  assert.equal(mock.state.last.headers['x-api-key'], 'sk-central-anthropic');
  assert.equal(mock.state.last.headers['anthropic-version'], '2023-06-01');
});

test('anthropic stream: message_start + message_delta accumulate', async () => {
  const n = store.records.length;
  const res = await fetch(`${base}/p/proj-a/anthropic/v1/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': 'sk-caller-anthropic' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 100,
      stream: true,
      messages: [],
    }),
  });
  await res.text();
  // caller's own key passes through untouched
  assert.equal(mock.state.last.headers['x-api-key'], 'sk-caller-anthropic');
  await waitForRecords(n + 1);
  const r = store.records.at(-1);
  assert.equal(r.tokensIn, 310);
  assert.equal(r.tokensOut, 45);
  assert.equal(r.stream, true);
  approx(r.costUsd, (200 * 3 + 100 * 0.3 + 10 * 3.75 + 45 * 15) / 1e6);
});

test('gemini non-stream: usageMetadata mapped, model from URL, thinking tokens as output', async () => {
  const n = store.records.length;
  const res = await fetch(
    `${base}/p/proj-c/gemini/v1beta/models/gemini-2.5-flash:generateContent?key=g-key`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: 'hi' }] }] }),
    },
  );
  assert.equal(res.status, 200);
  assert.equal(mock.state.last.search, '?key=g-key'); // query auth forwarded
  await waitForRecords(n + 1);
  const r = store.records.at(-1);
  assert.equal(r.model, 'gemini-2.5-flash');
  assert.equal(r.tokensIn, 300);
  assert.equal(r.tokensOut, 95); // 80 candidates + 15 thoughts
  assert.equal(r.cacheRead, 50);
  approx(r.costUsd, (250 * 0.3 + 50 * 0.075 + 95 * 2.5) / 1e6);
});

test('gemini stream (alt=sse): last chunk wins, fields merge', async () => {
  const n = store.records.length;
  const res = await fetch(
    `${base}/p/proj-c/gemini/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse&key=g-key`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: 'hi' }] }] }),
    },
  );
  await res.text();
  await waitForRecords(n + 1);
  const r = store.records.at(-1);
  assert.equal(r.stream, true);
  assert.equal(r.tokensIn, 300);
  assert.equal(r.tokensOut, 95);
});

test('project attribution via x-aicc-project header (no path prefix)', async () => {
  const n = store.records.length;
  await fetch(`${base}/openai/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-aicc-project': 'header-proj' },
    body: JSON.stringify({ model: 'gpt-4o-mini', messages: [] }),
  });
  await waitForRecords(n + 1);
  assert.equal(store.records.at(-1).project, 'header-proj');
});

test('custom OpenAI-compatible provider from config', async () => {
  const n = store.records.length;
  const res = await fetch(`${base}/p/proj-d/my-compat/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'custom-finetune', messages: [] }),
  });
  assert.equal(res.status, 200);
  await waitForRecords(n + 1);
  const r = store.records.at(-1);
  assert.equal(r.provider, 'my-compat');
  approx(r.costUsd, (100 * 100 + 20 * 100 + 30 * 200) / 1e6); // pricing override applies
});

test('upstream 5xx: recorded as error with extracted message, status relayed', async () => {
  const n = store.records.length;
  const res = await fetch(`${base}/p/proj-a/openai/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'fail-me', messages: [] }),
  });
  assert.equal(res.status, 500);
  await waitForRecords(n + 1);
  const r = store.records.at(-1);
  assert.equal(r.ok, false);
  assert.equal(r.errorType, 'upstream_error');
  assert.match(r.errorMessage, /mock upstream exploded/);
});

test('unknown model logs usage but marks unpriced', async () => {
  const n = store.records.length;
  await fetch(`${base}/p/proj-a/openai/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'totally-unknown-model-xyz', messages: [] }),
  });
  await waitForRecords(n + 1);
  const r = store.records.at(-1);
  assert.equal(r.priced, false);
  assert.equal(r.costUsd, null);
  assert.equal(r.tokensIn, 120);
});

test('unknown provider prefix → 404 with guidance', async () => {
  const res = await fetch(`${base}/p/x/nonexistent/v1/foo`, { method: 'POST' });
  assert.equal(res.status, 404);
  const body = await res.json();
  assert.match(body.error.message, /Known providers/);
});

test('/api/track ingests external usage and prices it', async () => {
  const n = store.records.length;
  const res = await fetch(`${base}/api/track`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      project: 'batch-job',
      provider: 'openai',
      model: 'gpt-4o',
      tokensIn: 1000,
      tokensOut: 100,
    }),
  });
  assert.equal(res.status, 200);
  await waitForRecords(n + 1);
  const r = store.records.at(-1);
  assert.equal(r.project, 'batch-job');
  approx(r.costUsd, (1000 * 2.5 + 100 * 10) / 1e6);
});

test('/api/track with explicit null costUsd/latency is priced, not zeroed', async () => {
  const n = store.records.length;
  // exactly what the Python SDK used to send (null, not omitted)
  await fetch(`${base}/api/track`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      project: 'sdk',
      provider: 'openai',
      model: 'gpt-4o-mini',
      tokensIn: 1200,
      tokensOut: 300,
      costUsd: null,
      latencyMs: null,
    }),
  });
  await waitForRecords(n + 1);
  const r = store.records.at(-1);
  assert.equal(r.priced, true);
  approx(r.costUsd, (1200 * 0.15 + 300 * 0.6) / 1e6);
  assert.equal(r.latencyMs, null); // stored as absent, not 0 (would skew percentiles)
});

test('demo days are clamped to a sane maximum', async () => {
  const res = await fetch(`${base}/api/demo`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ days: 500000, clear: true }),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.seeded < 400000, `clamped seeding, got ${body.seeded}`);
  // clean the demo rows back out so later assertions are unaffected
  await fetch(`${base}/api/records?simulated=1`, { method: 'DELETE' });
});

test('/api/stats aggregates and buckets', async () => {
  const res = await fetch(`${base}/api/stats?range=24h`);
  const stats = await res.json();
  assert.ok(stats.totals.requests >= 10);
  assert.ok(stats.totals.costUsd > 0);
  assert.ok(stats.byProject.find((p) => p.project === 'proj-a'));
  assert.ok(stats.timeseries.points.length > 0);
  assert.ok(stats.totals.unpriced >= 1);
  const reqs = await (await fetch(`${base}/api/requests?limit=5`)).json();
  assert.equal(reqs.items.length, 5);
  assert.ok(reqs.items[0].ts >= reqs.items.at(-1).ts, 'newest first');
});

test('/api/fx serves configured manual rates', async () => {
  const fx = await (await fetch(`${base}/api/fx`)).json();
  assert.equal(fx.default, 'INR');
  assert.equal(fx.rates.INR, 80);
  assert.equal(fx.rates.USD, 1);
  assert.equal(fx.source, 'config');
  assert.deepEqual(fx.options, ['INR', 'USD', 'EUR']);
});

test('/llms.txt is served as text for agents', async () => {
  const res = await fetch(`${base}/llms.txt`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/plain/);
  const body = await res.text();
  assert.match(body, /AI Command Center/);
  assert.match(body, /\/api\/track/);
});

test('records persist to JSONL and reload', async () => {
  await store.flush();
  const raw = fs.readFileSync(store.file, 'utf8').trim().split('\n');
  assert.equal(raw.length, store.records.length);
  const parsed = JSON.parse(raw.at(-1));
  assert.equal(parsed.id, store.records.at(-1).id);
});
