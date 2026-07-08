import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PricingEngine } from '../src/pricing.js';
import { PricingService, convertLiteLLM } from '../src/prices.js';

const approx = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} !≈ ${b}`);

const SHEET = {
  sample_spec: { input_cost_per_token: 0.1, note: 'ignored' },
  'gpt-4o': {
    input_cost_per_token: 0.0000025,
    output_cost_per_token: 0.00001,
    cache_read_input_token_cost: 0.00000125,
    litellm_provider: 'openai',
    mode: 'chat',
  },
  'openrouter/anthropic/claude-3.5-sonnet': {
    input_cost_per_token: 0.000003,
    output_cost_per_token: 0.000015,
    litellm_provider: 'openrouter',
    mode: 'chat',
  },
  'dall-e-3': { output_cost_per_pixel: 1, litellm_provider: 'openai', mode: 'image_generation' },
};

test('convertLiteLLM: per-token → per-1M, plain + provider-qualified keys, text-only', () => {
  const m = convertLiteLLM(SHEET);
  approx(m['gpt-4o'].in, 2.5);
  approx(m['gpt-4o'].out, 10);
  approx(m['gpt-4o'].cacheRead, 1.25);
  assert.deepEqual(m['openai:gpt-4o'], m['gpt-4o']); // qualified mirror
  // provider prefix path stripped to the bare model name
  approx(m['claude-3.5-sonnet'].in, 3);
  approx(m['openrouter:claude-3.5-sonnet'].out, 15);
  assert.ok(!('dall-e-3' in m), 'no input_cost_per_token → skipped');
  assert.ok(!('sample_spec' in m), 'sample_spec skipped');
});

test('PricingEngine layers: shipped < market < config override', () => {
  const shippedOnly = new PricingEngine({});
  const base = shippedOnly.cost('openai', 'gpt-4o', {
    inputUncached: 1e6,
    cacheRead: 0,
    cacheWrite: 0,
    output: 0,
  });
  assert.equal(base.priced, true);

  // market overrides the shipped price
  shippedOnly.setMarket({ 'gpt-4o': { in: 99, out: 99 } });
  approx(
    shippedOnly.cost('openai', 'gpt-4o', {
      inputUncached: 1e6,
      cacheRead: 0,
      cacheWrite: 0,
      output: 0,
    }).costUsd,
    99,
  );

  // a config override beats the market
  const overridden = new PricingEngine({ 'gpt-4o': { in: 1, out: 1 } });
  overridden.setMarket({ 'gpt-4o': { in: 99, out: 99 } });
  approx(
    overridden.cost('openai', 'gpt-4o', {
      inputUncached: 1e6,
      cacheRead: 0,
      cacheWrite: 0,
      output: 0,
    }).costUsd,
    1,
  );
});

test('PricingService fetches, applies to the engine, and caches (no network)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aicc-price-'));
  const engine = new PricingEngine({});
  const svc = new PricingService(dir, {
    url: 'https://example/prices.json',
    fetchImpl: async () => ({ ok: true, json: async () => SHEET }),
  });
  await svc.init(engine);
  approx(
    engine.cost('openai', 'gpt-4o', {
      inputUncached: 1e6,
      cacheRead: 0,
      cacheWrite: 0,
      output: 0,
    }).costUsd,
    2.5,
  );
  const cached = JSON.parse(fs.readFileSync(path.join(dir, 'prices.json'), 'utf8'));
  approx(cached.prices['gpt-4o'].in, 2.5);
  svc.stop();
});

test('PricingService with no url stays on shipped defaults', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aicc-price-'));
  const engine = new PricingEngine({});
  const svc = new PricingService(dir, { url: null });
  await svc.init(engine); // must not throw or fetch
  assert.equal(
    engine.cost('openai', 'gpt-4o', {
      inputUncached: 1e6,
      cacheRead: 0,
      cacheWrite: 0,
      output: 0,
    }).priced,
    true,
  );
  svc.stop();
});
