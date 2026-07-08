import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createGateway } from '../src/server.js';
import { startMockUpstream } from './mock-upstream.js';

let mock, gw, base;

const post = (p, body) =>
  fetch(base + p, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
const getJson = async (p) => (await fetch(base + p)).json();

before(async () => {
  mock = await startMockUpstream();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aicc-eval-'));
  gw = createGateway({
    port: 0,
    host: '127.0.0.1',
    dataDir,
    auth: false, // no session needed → treated as admin
    keys: { openai: 'sk-central' },
    upstreams: { openai: mock.url },
    currency: { default: 'USD', options: ['USD'], rates: {} },
  });
  await new Promise((r) => gw.server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${gw.server.address().port}`;
});

after(async () => {
  gw.server.close();
  await mock.close();
});

test('dataset validation rejects empty rows', async () => {
  const res = await post('/api/evals/dataset', { name: 'greet', rows: [] });
  assert.equal(res.status, 400);
});

test('save dataset, run eval, judge scores every row', async () => {
  const save = await post('/api/evals/dataset', {
    name: 'greet',
    rows: [{ input: 'say hi' }, { input: 'say bye', expected: 'bye' }],
  });
  assert.equal(save.status, 200);
  assert.equal((await save.json()).dataset.rows, 2);

  const runRes = await post('/api/evals/run', {
    dataset: 'greet',
    prompt: 'greeter',
    promptVersion: 'v1',
    promptTemplate: 'Respond to: {{input}}',
    target: { provider: 'openai', model: 'gpt-4o-mini' },
    judge: { provider: 'openai', model: 'gpt-4o-mini' },
  });
  assert.equal(runRes.status, 200);
  const { run } = await runRes.json();
  assert.equal(run.rows, 2);
  assert.equal(run.errors, 0);
  assert.equal(run.avgScore, 4); // mock judge always returns score 4
  assert.ok(run.costUsd >= 0);

  const overview = await getJson('/api/evals');
  assert.ok(overview.datasets.some((d) => d.name === 'greet' && d.rows === 2));
  assert.ok(overview.runs.some((r) => r.runId === run.runId && r.avgScore === 4));
  assert.ok(overview.keyedProviders.includes('openai'));

  const rows = await getJson('/api/evals/run?id=' + run.runId);
  assert.equal(rows.rows.length, 2);
  assert.equal(rows.rows[0].score, 4);
  assert.equal(rows.rows[0].output, 'Hello'); // target answer captured
});

test('eval scores join onto the Prompts view for matching prompt+version', async () => {
  // create real traffic tagged with the same prompt/version so a Prompts row exists
  await fetch(`${base}/openai/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-aicc-prompt': 'greeter',
      'x-aicc-prompt-version': 'v1',
    },
    body: JSON.stringify({ model: 'gpt-4o-mini', messages: [] }),
  });
  await gw.store.flush();
  const prompts = await getJson('/api/prompts?range=all');
  const row = prompts.items.find((p) => p.prompt === 'greeter' && p.version === 'v1');
  assert.ok(row, 'prompt row present from real traffic');
  assert.equal(row.avgScore, 4, 'eval score joined onto the prompt row');
  assert.equal(row.scored, 2);
});

test('run without a central key for the judge is rejected', async () => {
  await post('/api/evals/dataset', { name: 'ds2', rows: [{ input: 'x' }] });
  const res = await post('/api/evals/run', {
    dataset: 'ds2',
    target: { provider: 'openai', model: 'gpt-4o-mini' },
    judge: { provider: 'anthropic', model: 'claude-x' }, // no central key configured
  });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error.message, /central key/);
});

test('delete dataset', async () => {
  assert.equal((await fetch(base + '/api/evals/dataset/ds2', { method: 'DELETE' })).status, 200);
  const overview = await getJson('/api/evals');
  assert.ok(!overview.datasets.some((d) => d.name === 'ds2'));
});
