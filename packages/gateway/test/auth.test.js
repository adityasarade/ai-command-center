import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createGateway } from '../src/server.js';
import { startMockUpstream } from './mock-upstream.js';

let mock, gw, base, store;

function waitForRecords(n, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    (function poll() {
      if (store.records.length >= n) return resolve();
      if (Date.now() - t0 > timeoutMs) return reject(new Error(`timeout waiting for ${n} records`));
      setTimeout(poll, 15);
    })();
  });
}

// helper: fetch keeping a session cookie
function makeClient() {
  let cookie = '';
  return async (method, pathOrUrl, body) => {
    const res = await fetch(base + pathOrUrl, {
      method,
      headers: {
        ...(body ? { 'content-type': 'application/json' } : {}),
        ...(cookie ? { cookie } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const setC = res.headers.get('set-cookie');
    if (setC) cookie = setC.split(';')[0];
    return res;
  };
}

before(async () => {
  mock = await startMockUpstream();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aicc-auth-'));
  gw = createGateway({
    port: 0,
    host: '127.0.0.1',
    dataDir,
    auth: true,
    allowedOrigins: [],
    upstreams: { openai: mock.url },
    currency: { default: 'USD', options: ['USD'], rates: { USD: 1 } },
    pricing: {},
    providers: {},
    keys: {},
  });
  store = gw.store;
  await new Promise((r) => gw.server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${gw.server.address().port}`;
});

after(async () => {
  gw.server.close();
  await mock.close();
});

test('before setup: open, needsSetup true, proxy works without a key', async () => {
  const state = await (await fetch(`${base}/api/auth/state`)).json();
  assert.equal(state.needsSetup, true);
  assert.equal(state.locked, false);
  const res = await fetch(`${base}/p/pre-auth/openai/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer sk' },
    body: JSON.stringify({ model: 'gpt-4o-mini', messages: [] }),
  });
  assert.equal(res.status, 200);
});

test('setup creates admin and locks the gateway; unauthenticated APIs 401', async () => {
  const admin = makeClient();
  const res = await admin('POST', '/api/auth/setup', {
    username: 'aditya',
    password: 'supersecret',
  });
  assert.equal(res.status, 200);
  const state = await (await admin('GET', '/api/auth/state')).json();
  assert.equal(state.locked, true);
  assert.equal(state.user.role, 'admin');
  // no cookie → 401
  assert.equal((await fetch(`${base}/api/stats`)).status, 401);
  // admin cookie → 200
  assert.equal((await admin('GET', '/api/stats')).status, 200);
});

test('locked proxy requires a valid gateway key; key sets attribution', async () => {
  const admin = makeClient();
  await admin('POST', '/api/auth/login', { username: 'aditya', password: 'supersecret' });
  const proj = await (await admin('POST', '/api/admin/projects', { name: 'billing-svc' })).json();
  const key = proj.project.key;
  assert.match(key, /^aicc_/);

  // no key → 401
  const noKey = await fetch(`${base}/openai/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-4o-mini', messages: [] }),
  });
  assert.equal(noKey.status, 401);

  // valid key → 200 and attributed to the project the key belongs to
  const n = store.records.length;
  const ok = await fetch(`${base}/k/${key}/openai/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer sk' },
    body: JSON.stringify({ model: 'gpt-4o-mini', messages: [] }),
  });
  assert.equal(ok.status, 200);
  await waitForRecords(n + 1);
  assert.equal(store.records.at(-1).project, 'billing-svc');
});

test('locked /api/track accepts a gateway key without any session', async () => {
  const admin = makeClient();
  await admin('POST', '/api/auth/login', { username: 'aditya', password: 'supersecret' });
  const proj = await (await admin('POST', '/api/admin/projects', { name: 'batch-svc' })).json();
  const key = proj.project.key;
  const n = store.records.length;
  // no cookie, just the key header (what a server-side batch job sends)
  const res = await fetch(`${base}/api/track`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-aicc-key': key },
    body: JSON.stringify({
      project: 'SPOOFED',
      provider: 'openai',
      model: 'gpt-4o',
      tokensIn: 500,
      tokensOut: 50,
    }),
  });
  assert.equal(res.status, 200);
  await waitForRecords(n + 1);
  assert.equal(store.records.at(-1).project, 'batch-svc'); // key wins over body project
  // without a key and without a session → 401
  const noAuth = await fetch(`${base}/api/track`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ provider: 'openai', tokensIn: 1 }),
  });
  assert.equal(noAuth.status, 401);
});

test('member sees only their team’s projects', async () => {
  const admin = makeClient();
  await admin('POST', '/api/auth/login', { username: 'aditya', password: 'supersecret' });
  const team = await (await admin('POST', '/api/admin/teams', { name: 'payments' })).json();
  await admin('PATCH', '/api/admin/projects/billing-svc', { teamId: team.team.id });
  await admin('POST', '/api/admin/users', {
    username: 'rahul',
    password: 'memberpass1',
    role: 'member',
    teamId: team.team.id,
  });
  // a project on no team (admin-only visibility)
  await admin('POST', '/api/admin/projects', { name: 'secret-proj' });

  const member = makeClient();
  await member('POST', '/api/auth/login', { username: 'rahul', password: 'memberpass1' });
  const projects = await (await member('GET', '/api/projects')).json();
  const names = projects.map((p) => p.project);
  assert.ok(names.includes('billing-svc'), 'sees own team project');
  assert.ok(!names.includes('secret-proj'), 'cannot see unassigned project');
  assert.ok(!names.includes('pre-auth'), 'cannot see other-team project');

  // member cannot reach admin routes
  assert.equal((await member('GET', '/api/admin/overview')).status, 403);
  // member cannot wipe data
  assert.equal((await member('DELETE', '/api/records?simulated=0')).status, 403);
});

test('untrusted cross-origin write is blocked; same-origin/no-origin allowed', async () => {
  // browser-style cross-origin POST → 403
  const evil = await fetch(`${base}/api/track`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
    body: JSON.stringify({ project: 'x', provider: 'openai', model: 'gpt-4o', tokensIn: 1 }),
  });
  assert.equal(evil.status, 403);
  // cross-origin proxy call → 403 (cannot spend keys), even with a valid gateway key
  const admin = makeClient();
  await admin('POST', '/api/auth/login', { username: 'aditya', password: 'supersecret' });
  const proj = await (await admin('POST', '/api/admin/projects', { name: 'web-app' })).json();
  const evilProxy = await fetch(`${base}/k/${proj.project.key}/openai/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
    body: JSON.stringify({ model: 'gpt-4o-mini', messages: [] }),
  });
  assert.equal(evilProxy.status, 403);
});

test('login rejects wrong password; last admin cannot be deleted', async () => {
  assert.equal(
    (
      await fetch(`${base}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'aditya', password: 'wrong' }),
      })
    ).status,
    401,
  );

  const admin = makeClient();
  await admin('POST', '/api/auth/login', { username: 'aditya', password: 'supersecret' });
  const me = (await (await admin('GET', '/api/auth/state')).json()).user;
  const res = await admin('DELETE', `/api/admin/users/${me.id}`);
  assert.equal(res.status, 400); // last admin protected
});
