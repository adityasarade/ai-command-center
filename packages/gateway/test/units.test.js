import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeModel, PricingEngine } from '../src/pricing.js';
import { SseParser, makeStreamAccumulator, extractFromJson } from '../src/usage.js';
import { parseProxyPath, buildProviderTable } from '../src/providers.js';

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

test('gemini non-SSE stream returns JSON array — last usage wins', () => {
  const { usage, model } = extractFromJson('gemini', [
    { usageMetadata: { promptTokenCount: 10 }, modelVersion: 'gemini-2.5-pro' },
    { usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 7 } },
  ]);
  assert.equal(model, 'gemini-2.5-pro');
  assert.equal(usage.inputUncached, 10);
  assert.equal(usage.output, 7);
});

test('parseProxyPath: project prefix, plain, unknown', () => {
  const table = buildProviderTable({ providers: {}, upstreams: {} });
  assert.deepEqual(parseProxyPath('/p/my%20app/openai/v1/chat/completions', table), {
    project: 'my app',
    providerId: 'openai',
    rest: '/v1/chat/completions',
  });
  assert.deepEqual(parseProxyPath('/anthropic/v1/messages', table), {
    project: null,
    providerId: 'anthropic',
    rest: '/v1/messages',
  });
  assert.equal(parseProxyPath('/nope/v1/x', table), null);
  assert.equal(parseProxyPath('/api/stats', table), null);
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
