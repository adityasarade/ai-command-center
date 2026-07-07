import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeModel, PricingEngine } from '../src/pricing.js';
import { SseParser, makeStreamAccumulator, extractFromJson } from '../src/usage.js';
import { parseProxyPath, buildProviderTable } from '../src/providers.js';
import {
  computeStats,
  listTraces,
  getTrace,
  listPrompts,
  modelComparison,
  monthlySpendByProject,
} from '../src/stats.js';
import { detectAnomalies, computeAlerts } from '../src/anomaly.js';
import { generateDemoRecords } from '../src/demo.js';

test('normalizeModel strips prefixes, dates, and -latest', () => {
  assert.equal(normalizeModel('models/gemini-2.5-flash'), 'gemini-2.5-flash');
  assert.equal(normalizeModel('claude-sonnet-4-5-20250929'), 'claude-sonnet-4-5');
  assert.equal(normalizeModel('gpt-4o-2024-08-06'), 'gpt-4o');
  assert.equal(normalizeModel('claude-3-5-sonnet-latest'), 'claude-3-5-sonnet');
  assert.equal(normalizeModel('GPT-4O-MINI'), 'gpt-4o-mini');
});

test('pricing: longest prefix wins; provider-qualified beats plain; provider default', () => {
  const p = new PricingEngine();
  // gpt-4o-mini must match its own entry, not gpt-4o
  assert.equal(p.lookup('openai', 'gpt-4o-mini').in, 0.15);
  assert.equal(p.lookup('openai', 'gpt-4o').in, 2.5);
  // dated model resolves via normalization
  assert.equal(p.lookup('anthropic', 'claude-sonnet-4-5-20250929').in, 3);
  // provider-qualified
  assert.equal(p.lookup('groq', 'llama-3.1-8b-instant').in, 0.05);
  // ollama provider-wide default: everything is free
  assert.equal(p.lookup('ollama', 'qwen3:32b').in, 0);
  // unknown
  assert.equal(p.lookup('openai', 'no-such-model'), null);
});

test('pricing: overrides merge and can extend', () => {
  const p = new PricingEngine({ 'my-model': { in: 1, out: 2 } });
  assert.equal(p.lookup('anything', 'my-model-v2').in, 1);
  const { costUsd, priced } = p.cost('x', 'my-model', {
    inputUncached: 1e6,
    cacheRead: 0,
    cacheWrite: 0,
    output: 5e5,
  });
  assert.equal(priced, true);
  assert.equal(costUsd, 1 + 1);
});

test('SseParser handles split chunks, CRLF, multiline data, [DONE]', () => {
  const seen = [];
  const p = new SseParser((o) => seen.push(o));
  p.feed('data: {"a"');
  p.feed(':1}\n\ndata: [DONE]\n\nevent: x\r\ndata: {"b":2}\r\n\r\n');
  p.feed('data: {"c":\ndata: 3}\n\n');
  p.flush();
  assert.deepEqual(seen, [{ a: 1 }, { b: 2 }, { c: 3 }]);
});

test('openai accumulator: last usage chunk wins, x_groq fallback', () => {
  const acc = makeStreamAccumulator('openai');
  acc.feed({ model: 'gpt-x', choices: [{}], usage: null });
  acc.feed({ x_groq: { usage: { prompt_tokens: 10, completion_tokens: 5 } } });
  const { usage, model } = acc.result();
  assert.equal(model, 'gpt-x');
  assert.equal(usage.inputUncached, 10);
  assert.equal(usage.output, 5);
});

test('openai responses-api accumulator: nested response.usage', () => {
  const acc = makeStreamAccumulator('openai');
  acc.feed({
    type: 'response.completed',
    response: {
      model: 'gpt-5.1',
      usage: { input_tokens: 50, output_tokens: 20, input_tokens_details: { cached_tokens: 30 } },
    },
  });
  const { usage, model } = acc.result();
  assert.equal(model, 'gpt-5.1');
  assert.equal(usage.inputUncached, 20);
  assert.equal(usage.cacheRead, 30);
});

test('gemini non-SSE stream returns JSON array - last usage wins', () => {
  const { usage, model } = extractFromJson('gemini', [
    { usageMetadata: { promptTokenCount: 10 }, modelVersion: 'gemini-2.5-pro' },
    { usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 7 } },
  ]);
  assert.equal(model, 'gemini-2.5-pro');
  assert.equal(usage.inputUncached, 10);
  assert.equal(usage.output, 7);
});

test('parseProxyPath: project prefix, gateway key, plain, unknown', () => {
  const table = buildProviderTable({ providers: {}, upstreams: {} });
  assert.deepEqual(parseProxyPath('/p/my%20app/openai/v1/chat/completions', table), {
    key: null,
    project: 'my app',
    providerId: 'openai',
    rest: '/v1/chat/completions',
  });
  assert.deepEqual(parseProxyPath('/anthropic/v1/messages', table), {
    key: null,
    project: null,
    providerId: 'anthropic',
    rest: '/v1/messages',
  });
  assert.deepEqual(parseProxyPath('/k/aicc_secret/gemini/v1beta/models/x:generateContent', table), {
    key: 'aicc_secret',
    project: null,
    providerId: 'gemini',
    rest: '/v1beta/models/x:generateContent',
  });
  assert.equal(parseProxyPath('/nope/v1/x', table), null);
  assert.equal(parseProxyPath('/api/stats', table), null);
});

test('pricing: qualified base-model override does NOT capture longer siblings', () => {
  const p = new PricingEngine({ 'openai:gpt-4o': { in: 99, out: 99 } });
  // gpt-4o-mini must keep its own (shipped) price, not the gpt-4o override
  assert.equal(p.lookup('openai', 'gpt-4o-mini').in, 0.15);
  assert.equal(p.lookup('openai', 'gpt-4o').in, 99);
});

test('pricing: ollama:* free default beats cross-provider plain keys', () => {
  const p = new PricingEngine();
  // real Ollama model names that collide with cloud plain keys must stay free
  assert.equal(p.lookup('ollama', 'codestral:latest').in, 0);
  assert.equal(p.lookup('ollama', 'mistral-small').out, 0);
  // but the same names on a cloud provider keep cloud pricing
  assert.equal(p.lookup('mistral', 'codestral').in, 0.3);
});

const rec = (ts, extra = {}) => ({
  ts,
  project: 'p',
  provider: 'openai',
  model: 'gpt-4o-mini',
  ok: true,
  latencyMs: 100,
  tokensIn: 10,
  tokensOut: 5,
  costUsd: 0.001,
  priced: true,
  ...extra,
});

test('stats range=all sees unsorted/backfilled records', () => {
  const now = Date.now();
  // newest record first in the array - simulates live append then historical backfill
  const records = [rec(now), rec(now - 10 * 24 * 3600e3), rec(now - 5 * 24 * 3600e3)];
  const stats = computeStats(records, { range: 'all' });
  assert.equal(stats.totals.requests, 3);
});

test('daily buckets align to local midnight', () => {
  const d = new Date();
  d.setDate(d.getDate() - 4); // force daily bucketing via a >3d range
  d.setHours(23, 50, 0, 0);
  const stats = computeStats([rec(d.getTime())], { range: '7d' });
  const hit = stats.timeseries.points.find((p) => p.requests === 1);
  assert.ok(hit, 'record landed in a bucket');
  const bucketDay = new Date(hit.t);
  assert.equal(bucketDay.getHours(), 0);
  assert.equal(bucketDay.getDate(), d.getDate(), 'same local calendar day');
});

test('traces: grouping, timeline order, and per-trace totals', () => {
  const now = Date.now();
  const recs = [
    rec(now - 5000, {
      trace: 't1',
      model: 'gpt-4o',
      costUsd: 0.01,
      tokensTotal: 100,
      latencyMs: 400,
    }),
    rec(now - 3000, {
      trace: 't1',
      model: 'gpt-4o',
      costUsd: 0.02,
      tokensTotal: 200,
      latencyMs: 600,
    }),
    rec(now - 1000, {
      trace: 't2',
      model: 'gpt-4o',
      costUsd: 0.03,
      tokensTotal: 50,
      latencyMs: 300,
    }),
    rec(now - 2000, {}), // no trace -> excluded from traces
  ];
  const { total, items } = listTraces(recs, { range: '24h' });
  assert.equal(total, 2);
  const t1 = items.find((t) => t.id === 't1');
  assert.equal(t1.calls, 2);
  assert.ok(Math.abs(t1.costUsd - 0.03) < 1e-9);
  const detail = getTrace(recs, 't1');
  assert.equal(detail.calls.length, 2);
  assert.equal(detail.calls[0].offsetMs, 0); // ordered by ts, first is anchor
  assert.ok(detail.calls[1].offsetMs > 0);
});

test('prompts: per prompt+version metrics', () => {
  const now = Date.now();
  const recs = [
    rec(now, { prompt: 'p', promptVersion: 'v2', costUsd: 0.01, tokensIn: 10, tokensOut: 5 }),
    rec(now, { prompt: 'p', promptVersion: 'v2', costUsd: 0.03, tokensIn: 10, tokensOut: 5 }),
    rec(now, { prompt: 'p', promptVersion: 'v1', costUsd: 0.1, tokensIn: 10, tokensOut: 5 }),
    rec(now, {}), // no prompt -> excluded
  ];
  const { items } = listPrompts(recs, { range: '24h' });
  assert.equal(items.length, 2);
  const v2 = items.find((x) => x.version === 'v2');
  assert.equal(v2.requests, 2);
  assert.ok(Math.abs(v2.avgCostUsd - 0.02) < 1e-9);
});

test('model comparison: effective $/1M tokens and error rate', () => {
  const now = Date.now();
  const recs = [
    rec(now, {
      provider: 'openai',
      model: 'gpt-4o',
      costUsd: 1,
      tokensIn: 500000,
      tokensOut: 500000,
    }),
    rec(now, {
      provider: 'openai',
      model: 'gpt-4o',
      ok: false,
      costUsd: 0,
      tokensIn: null,
      tokensOut: null,
    }),
  ];
  const { items } = modelComparison(recs, { range: '24h' });
  assert.equal(items.length, 1);
  assert.ok(Math.abs(items[0].effectivePerMTok - 1) < 1e-6); // $1 / 1e6 tokens * 1e6
  assert.equal(items[0].errorRate, 0.5);
});

test('anomaly detection flags a per-project cost spike', () => {
  const now = Date.now();
  const day = 24 * 3600e3;
  const recs = [];
  // 5 normal days at ~$3, one spike day at ~$9 for project X
  for (let d = 6; d >= 1; d--) {
    recs.push(rec(now - d * day, { project: 'x', costUsd: d === 3 ? 9 : 3 }));
  }
  const { anomalies } = detectAnomalies(recs, { range: '30d' });
  assert.ok(anomalies.some((a) => a.type === 'cost_spike' && a.project === 'x'));
});

test('computeAlerts fires on over-budget project', () => {
  const now = Date.now();
  const recs = [rec(now, { project: 'x', costUsd: 120 })];
  const alerts = computeAlerts(recs, {
    projects: { x: { monthlyUsd: 100, alertAtPct: 80 } },
    thresholds: { errorRatePct: 10, p95LatencyMs: 20000 },
  });
  assert.ok(
    alerts.some((a) => a.type === 'budget' && a.severity === 'critical' && a.project === 'x'),
  );
});

test('monthlySpendByProject sums the current calendar month', () => {
  const now = Date.now();
  const monthStart = new Date(new Date(now).getFullYear(), new Date(now).getMonth(), 1).getTime();
  const recs = [
    rec(monthStart + 1000, { project: 'x', costUsd: 5 }),
    rec(monthStart - 1000, { project: 'x', costUsd: 99 }), // previous month, excluded
  ];
  const { byProject } = monthlySpendByProject(recs, now);
  assert.equal(byProject.x, 5);
});

test('demo seeder always includes the Opus cost-spike, any day of week', () => {
  const pricing = new PricingEngine();
  for (let offset = 0; offset < 7; offset++) {
    const now = Date.UTC(2026, 6, 1 + offset, 12, 0, 0); // Wed Jul 1 2026 + offset
    const records = generateDemoRecords(pricing, { days: 14, now });
    const opus = records.filter((r) => r.model === 'claude-opus-4-5');
    assert.ok(opus.length > 0, `no Opus spike when seeding on offset ${offset}`);
    assert.ok(
      records.every((r) => r.ts <= now),
      'no records in the future',
    );
  }
});

test('provider table: config upstream override + custom provider', () => {
  const table = buildProviderTable({
    upstreams: { openai: 'http://localhost:9999/' },
    providers: {
      azure: { upstream: 'https://x.azure.com/', kind: 'openai', authHeader: 'api-key' },
    },
  });
  assert.equal(table.openai.upstream, 'http://localhost:9999');
  assert.equal(table.azure.authHeader, 'api-key');
  assert.equal(table.azure.kind, 'openai');
});
