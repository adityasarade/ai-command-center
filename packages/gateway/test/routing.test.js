import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createGateway } from '../src/server.js';
import { startMockUpstream } from './mock-upstream.js';

let good, good2, bad, gw, base, store;

const CHAT = { model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'hi' }] };

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
  good = await startMockUpstream();
  good2 = await startMockUpstream();
  bad = await startMockUpstream({ failStatus: 429 });
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aicc-route-'));
  gw = createGateway({
    port: 0,
    host: '127.0.0.1',
    dataDir,
    auth: false,
    keys: { good: 'k-good', good2: 'k-good2', bad: 'k-bad' },
    providers: {
      good: { upstream: good.url, kind: 'openai' },
      good2: { upstream: good2.url, kind: 'openai' },
      bad: { upstream: bad.url, kind: 'openai' },
    },
    routes: {
      resil: { members: ['bad', 'good'], retryOn: [429] },
      allbad: { members: ['bad', 'bad'], retryOn: [429] },
      lb: { members: ['good', 'good2'], strategy: 'round-robin' },
    },
    currency: { default: 'USD', options: ['USD'], rates: {} },
  });
  store = gw.store;
  await new Promise((r) => gw.server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${gw.server.address().port}`;
});

after(async () => {
  gw.server.close();
  await Promise.all([good.close(), good2.close(), bad.close()]);
});

test('failover: a retryable member is skipped and the next serves the request', async () => {
  const n = store.records.length;
  const res = await fetch(`${base}/p/app/r/resil/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(CHAT),
  });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).choices[0].message.content, 'Hello');
  await waitForRecords(n + 2); // one failed attempt + one served

  const served = store.records.at(-1);
  const failed = store.records.at(-2);
  assert.equal(served.provider, 'good');
  assert.equal(served.ok, true);
  assert.equal(served.route, 'resil');
  assert.equal(served.project, 'app');
  assert.equal(failed.provider, 'bad');
  assert.equal(failed.ok, false);
  assert.equal(failed.status, 429);
  assert.equal(failed.errorType, 'route_fallback');
  assert.equal(failed.route, 'resil');
  // the serving member's central key was injected (caller sent none)
  assert.equal(good.state.last.headers.authorization, 'Bearer k-good');
});

test('all members fail: the last status is returned to the client, all attempts logged', async () => {
  const n = store.records.length;
  const res = await fetch(`${base}/r/allbad/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(CHAT),
  });
  assert.equal(res.status, 429); // final member's real status reaches the caller
  await waitForRecords(n + 2);
  const last = store.records.at(-1);
  assert.equal(last.ok, false);
  assert.equal(last.status, 429);
  assert.equal(last.route, 'allbad');
});

test('round-robin load-balancing spreads requests across members', async () => {
  const c1 = good.state.count;
  const c2 = good2.state.count;
  for (let i = 0; i < 4; i++) {
    await fetch(`${base}/r/lb/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(CHAT),
    });
  }
  // 4 requests, 2 members, round-robin → each hit roughly twice (both hit).
  assert.ok(good.state.count > c1, 'first member received traffic');
  assert.ok(good2.state.count > c2, 'second member received traffic');
});

test('direct provider path still records no route', async () => {
  const n = store.records.length;
  await fetch(`${base}/good/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(CHAT),
  });
  await waitForRecords(n + 1);
  assert.equal(store.records.at(-1).route, null);
});
