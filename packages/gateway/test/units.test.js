import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeModel, PricingEngine } from '../src/pricing.js';
import { SseParser, makeStreamAccumulator, extractFromJson } from '../src/usage.js';
import { parseProxyPath, buildProviderTable } from '../src/providers.js';
import { computeStats } from '../src/stats.js';
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
  const { costUsd, priced } = p.cost('x', 'my-model', { inputUncached: 1e6, cacheRead: 0, cacheWrite: 0, output: 5e5 });
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
  acc.feed({ type: 'response.completed', response: { model: 'gpt-5.1', usage: { input_tokens: 50, output_tokens: 20, input_tokens_details: { cached_tokens: 30 } } } });
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
  ts, project: 'p', provider: 'openai', model: 'gpt-4o-mini', ok: true,
  latencyMs: 100, tokensIn: 10, tokensOut: 5, costUsd: 0.001, priced: true, ...extra,
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

test('demo seeder always includes the Opus cost-spike, any day of week', () => {
  const pricing = new PricingEngine();
  for (let offset = 0; offset < 7; offset++) {
    const now = Date.UTC(2026, 6, 1 + offset, 12, 0, 0); // Wed Jul 1 2026 + offset
    const records = generateDemoRecords(pricing, { days: 14, now });
    const opus = records.filter((r) => r.model === 'claude-opus-4-5');
    assert.ok(opus.length > 0, `no Opus spike when seeding on offset ${offset}`);
    assert.ok(records.every((r) => r.ts <= now), 'no records in the future');
  }
});

test('provider table: config upstream override + custom provider', () => {
  const table = buildProviderTable({
    upstreams: { openai: 'http://localhost:9999/' },
    providers: { azure: { upstream: 'https://x.azure.com/', kind: 'openai', authHeader: 'api-key' } },
  });
  assert.equal(table.openai.upstream, 'http://localhost:9999');
  assert.equal(table.azure.authHeader, 'api-key');
  assert.equal(table.azure.kind, 'openai');
});
