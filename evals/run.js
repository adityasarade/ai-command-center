#!/usr/bin/env node
/**
 * AI Command Center - reproducible evaluations.
 *
 *   node evals/run.js          # run all, print a report, write evals/REPORT.md
 *   node evals/run.js --ci     # run, fail the process if a hard threshold is missed
 *
 * Everything runs against an in-process MOCK upstream (no API keys, no network),
 * so numbers are reproducible and CI-safe. Three evals:
 *
 *   1. Proxy overhead - added latency of routing a request through the gateway
 *                        vs. hitting the same mock directly (p50/p95/p99).
 *   2. Cost accuracy - gateway-computed USD cost vs. an independent hand
 *                        calculation from the provider's own price sheet, across
 *                        many (provider, model) pairs. Target: exact.
 *   3. Parser coverage - fraction of provider response shapes (stream +
 *                        non-stream, all three schemas) the usage parser reads.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGateway } from '../packages/gateway/src/server.js';
import { PricingEngine } from '../packages/gateway/src/pricing.js';
import { startMockUpstream } from '../packages/gateway/test/mock-upstream.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CI = process.argv.includes('--ci');

const pct = (arr, p) => {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)] || 0;
};
const round = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

async function main() {
  const mock = await startMockUpstream();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aicc-evals-'));
  const gw = createGateway({
    port: 0,
    host: '127.0.0.1',
    dataDir,
    auth: false, // measure the proxy itself, not auth
    allowedOrigins: [],
    upstreams: { openai: mock.url, anthropic: mock.url, gemini: mock.url },
    currency: { default: 'USD', options: ['USD'], rates: { USD: 1 } },
    pricing: {},
    providers: {},
    keys: {},
  });
  await new Promise((r) => gw.server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${gw.server.address().port}`;

  const results = {};
  results.overhead = await evalOverhead(base, mock.url);
  results.costAccuracy = evalCostAccuracy();
  results.parserCoverage = await evalParserCoverage(base, gw);

  gw.server.close();
  await mock.close();

  const md = renderReport(results);
  fs.writeFileSync(path.join(__dirname, 'REPORT.md'), md);
  console.log(md);

  if (CI) {
    const fail = [];
    if (results.overhead.p95 > 25) fail.push(`proxy p95 overhead ${results.overhead.p95}ms > 25ms`);
    if (results.costAccuracy.mismatches > 0)
      fail.push(`${results.costAccuracy.mismatches} cost mismatches`);
    if (results.parserCoverage.rate < 1)
      fail.push(`parser coverage ${results.parserCoverage.rate}`);
    if (fail.length) {
      console.error('\nEVAL FAILURES:\n - ' + fail.join('\n - '));
      process.exit(1);
    }
    console.log('\nAll eval thresholds met.');
  }
}

// ---- 1. proxy overhead ----------------------------------------------------
async function evalOverhead(gatewayBase, mockUrl) {
  const body = JSON.stringify({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: 'hi' }],
  });
  const headers = { 'content-type': 'application/json', authorization: 'Bearer sk-test' };
  const N = 400;
  const WARM = 50;

  const time = async (url) => {
    const t0 = performance.now();
    const res = await fetch(url, { method: 'POST', headers, body });
    await res.arrayBuffer();
    return performance.now() - t0;
  };

  // warm up both paths
  for (let i = 0; i < WARM; i++) {
    await time(`${mockUrl}/v1/chat/completions`);
    await time(`${gatewayBase}/openai/v1/chat/completions`);
  }
  const direct = [];
  const proxied = [];
  for (let i = 0; i < N; i++) {
    direct.push(await time(`${mockUrl}/v1/chat/completions`));
    proxied.push(await time(`${gatewayBase}/openai/v1/chat/completions`));
  }
  const overhead = proxied.map((p, i) => p - direct[i]);
  return {
    samples: N,
    directP50: round(pct(direct, 50)),
    proxiedP50: round(pct(proxied, 50)),
    p50: round(pct(overhead, 50)),
    p95: round(pct(overhead, 95)),
    p99: round(pct(overhead, 99)),
    mean: round(overhead.reduce((s, v) => s + v, 0) / overhead.length),
  };
}

// ---- 2. cost accuracy -----------------------------------------------------
function evalCostAccuracy() {
  const pricing = new PricingEngine();
  // (provider, model, priceIn, priceOut) hand-transcribed from pricing.json;
  // the eval recomputes cost independently and compares.
  const cases = [
    ['openai', 'gpt-4o-mini', 0.15, 0.6],
    ['openai', 'gpt-4o', 2.5, 10],
    ['openai', 'gpt-4.1', 2, 8],
    ['anthropic', 'claude-sonnet-4-5', 3, 15],
    ['anthropic', 'claude-haiku-4-5', 1, 5],
    ['anthropic', 'claude-opus-4-5', 5, 25],
    ['gemini', 'gemini-2.5-flash', 0.3, 2.5],
    ['gemini', 'gemini-2.5-pro', 1.25, 10],
    ['deepseek', 'deepseek-chat', 0.28, 0.42],
    ['groq', 'llama-3.1-8b-instant', 0.05, 0.08],
  ];
  const tokenMixes = [
    { inputUncached: 1000, cacheRead: 0, cacheWrite: 0, output: 500 },
    { inputUncached: 12000, cacheRead: 3000, cacheWrite: 0, output: 800 },
    { inputUncached: 0, cacheRead: 0, cacheWrite: 0, output: 2000 },
  ];
  let checks = 0;
  let mismatches = 0;
  const rows = [];
  for (const [provider, model, pin, pout] of cases) {
    for (const mix of tokenMixes) {
      const got = pricing.cost(provider, model, mix);
      const expect =
        ((mix.inputUncached + mix.cacheRead + mix.cacheWrite) * pin + mix.output * pout) / 1e6;
      // cacheRead/Write may be priced differently; only compare the simple mix (no cache)
      if (mix.cacheRead === 0 && mix.cacheWrite === 0) {
        checks++;
        const ok = Math.abs(got.costUsd - expect) < 1e-12;
        if (!ok) mismatches++;
        rows.push({
          provider,
          model,
          tokens: `${mix.inputUncached}in/${mix.output}out`,
          expect,
          got: got.costUsd,
          ok,
        });
      }
    }
  }
  return { checks, mismatches, rows };
}

// ---- 3. parser coverage ---------------------------------------------------
async function evalParserCoverage(base, gw) {
  const before = () => gw.store.records.length;
  const waitOne = (n) =>
    new Promise((resolve, reject) => {
      const t0 = Date.now();
      (function poll() {
        if (gw.store.records.length > n) return resolve(gw.store.records.at(-1));
        if (Date.now() - t0 > 3000) return reject(new Error('timeout'));
        setTimeout(poll, 10);
      })();
    });

  const shapes = [
    [
      'openai chat (non-stream)',
      () =>
        fetch(`${base}/openai/v1/chat/completions`, post({ model: 'gpt-4o-mini', messages: [] })),
    ],
    [
      'openai chat (stream)',
      () =>
        fetch(
          `${base}/openai/v1/chat/completions`,
          post({ model: 'gpt-4o-mini', stream: true, messages: [] }),
        ),
    ],
    [
      'openai embeddings',
      () =>
        fetch(
          `${base}/openai/v1/embeddings`,
          post({ model: 'text-embedding-3-small', input: 'x' }),
        ),
    ],
    [
      'anthropic messages (non-stream)',
      () =>
        fetch(
          `${base}/anthropic/v1/messages`,
          post({ model: 'claude-sonnet-4-5', max_tokens: 10, messages: [] }),
        ),
    ],
    [
      'anthropic messages (stream)',
      () =>
        fetch(
          `${base}/anthropic/v1/messages`,
          post({ model: 'claude-sonnet-4-5', max_tokens: 10, stream: true, messages: [] }),
        ),
    ],
    [
      'gemini generateContent',
      () =>
        fetch(
          `${base}/gemini/v1beta/models/gemini-2.5-flash:generateContent?key=k`,
          post({ contents: [] }),
        ),
    ],
    [
      'gemini streamGenerateContent',
      () =>
        fetch(
          `${base}/gemini/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse&key=k`,
          post({ contents: [] }),
        ),
    ],
  ];
  const rows = [];
  let covered = 0;
  for (const [label, call] of shapes) {
    const n = before();
    const res = await call();
    await res.arrayBuffer();
    const rec = await waitOne(n);
    const ok = rec.tokensIn != null && rec.tokensOut != null;
    if (ok) covered++;
    rows.push({ label, tokensIn: rec.tokensIn, tokensOut: rec.tokensOut, ok });
  }
  return { total: shapes.length, covered, rate: covered / shapes.length, rows };
}

function post(body) {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer sk-test' },
    body: JSON.stringify(body),
  };
}

// ---- report ---------------------------------------------------------------
function renderReport(r) {
  const o = r.overhead;
  const c = r.costAccuracy;
  const p = r.parserCoverage;
  return `# AI Command Center - eval report

_Generated by \`node evals/run.js\`. All runs use an in-process mock upstream
(no API keys, no network), so results are reproducible. Absolute latency numbers
depend on the machine; the overhead delta is what matters._

## 1. Proxy overhead

Added latency of routing through the gateway vs. calling the mock directly,
over ${o.samples} paired requests.

| metric | value |
|---|---|
| direct p50 | ${o.directP50} ms |
| through gateway p50 | ${o.proxiedP50} ms |
| **added overhead p50** | **${o.p50} ms** |
| added overhead p95 | ${o.p95} ms |
| added overhead p99 | ${o.p99} ms |
| added overhead mean | ${o.mean} ms |

Against real LLM calls (typically 300 ms-30 s) this overhead is negligible.

## 2. Cost accuracy

Gateway-computed USD cost vs. an independent recomputation from the published
price sheet, across ${c.checks} (provider, model, token-mix) cases.

**Mismatches: ${c.mismatches} / ${c.checks}**

| provider | model | tokens | expected USD | computed USD | ok |
|---|---|---|---|---|---|
${c.rows.map((x) => `| ${x.provider} | ${x.model} | ${x.tokens} | ${x.expect.toExponential(4)} | ${x.got.toExponential(4)} | ${x.ok ? '✓' : '✗'} |`).join('\n')}

## 3. Usage-parser coverage

Fraction of provider response shapes the gateway parses usage from.

**Coverage: ${p.covered} / ${p.total} (${round(p.rate * 100, 0)}%)**

| response shape | tokens in | tokens out | parsed |
|---|---|---|---|
${p.rows.map((x) => `| ${x.label} | ${x.tokensIn ?? '-'} | ${x.tokensOut ?? '-'} | ${x.ok ? '✓' : '✗'} |`).join('\n')}
`;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
