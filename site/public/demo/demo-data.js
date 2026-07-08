// In-browser demo data generator - a faithful port of the gateway's demo seeder
// (packages/gateway/src/demo.js) with an inlined mini price table for the handful
// of models the demo uses. Deterministic; produces the exact record shape the
// real dashboard + stats.js expect. Runs entirely client-side.

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// USD per 1M tokens, matching the shipped pricing table for the demo's models.
const PRICES = {
  'claude-sonnet-4-5': { in: 3, out: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  'claude-haiku-4-5': { in: 1, out: 5, cacheRead: 0.1, cacheWrite: 1.25 },
  'claude-opus-4-5': { in: 15, out: 75, cacheRead: 1.5, cacheWrite: 18.75 },
  'gpt-4o-mini': { in: 0.15, out: 0.6, cacheRead: 0.075 },
  'gpt-4.1': { in: 2, out: 8, cacheRead: 0.5 },
  'text-embedding-3-small': { in: 0.02, out: 0 },
  'gemini-2.5-flash': { in: 0.3, out: 2.5, cacheRead: 0.075 },
  'deepseek-chat': { in: 0.27, out: 1.1, cacheRead: 0.07 },
};

function cost(model, usage) {
  const p = PRICES[model];
  if (!p) return { costUsd: null, priced: false };
  const per = (t, r) => ((t || 0) * (r || 0)) / 1e6;
  const costUsd =
    per(usage.inputUncached, p.in) +
    per(usage.cacheRead, p.cacheRead ?? p.in) +
    per(usage.cacheWrite, p.cacheWrite ?? p.in) +
    per(usage.output, p.out);
  return { costUsd, priced: true };
}

const HOUR_WEIGHTS = [
  1, 1, 1, 2, 2, 2, 3, 5, 8, 12, 14, 15, 13, 12, 14, 15, 14, 12, 10, 8, 6, 4, 2, 1,
];

const PROJECTS = [
  {
    name: 'claims-copilot',
    perDay: 180,
    stream: 0.85,
    mixes: [
      {
        provider: 'anthropic',
        model: 'claude-sonnet-4-5',
        w: 0.55,
        in: [1800, 12000],
        out: [250, 1600],
        cacheRead: 0.5,
      },
      {
        provider: 'anthropic',
        model: 'claude-haiku-4-5',
        w: 0.45,
        in: [600, 4000],
        out: [80, 700],
        cacheRead: 0.35,
      },
    ],
  },
  {
    name: 'invoice-extraction',
    perDay: 110,
    stream: 0.1,
    mixes: [
      { provider: 'openai', model: 'gpt-4o-mini', w: 0.6, in: [2500, 14000], out: [300, 1200] },
      {
        provider: 'openai',
        model: 'gpt-4.1',
        w: 0.25,
        in: [3000, 18000],
        out: [400, 1600],
        cacheRead: 0.3,
      },
      {
        provider: 'openai',
        model: 'text-embedding-3-small',
        w: 0.15,
        in: [300, 4000],
        out: [0, 0],
        embedding: true,
      },
    ],
  },
  {
    name: 'support-chatbot',
    perDay: 380,
    stream: 0.95,
    mixes: [
      {
        provider: 'openai',
        model: 'gpt-4o-mini',
        w: 0.7,
        in: [700, 4500],
        out: [100, 700],
        cacheRead: 0.4,
      },
      { provider: 'gemini', model: 'gemini-2.5-flash', w: 0.3, in: [500, 3500], out: [80, 600] },
    ],
  },
  {
    name: 'catalog-enrichment',
    perDay: 90,
    stream: 0.05,
    mixes: [
      {
        provider: 'gemini',
        model: 'gemini-2.5-flash',
        w: 0.5,
        in: [1500, 10000],
        out: [300, 2000],
      },
      { provider: 'deepseek', model: 'deepseek-chat', w: 0.5, in: [1800, 12000], out: [350, 2200] },
    ],
  },
];

const PROMPTS = {
  'claims-copilot': [
    { name: 'claim-triage', versions: ['v3', 'v2'] },
    { name: 'summarize-claim', versions: ['v1'] },
  ],
  'invoice-extraction': [
    { name: 'extract-lineitems', versions: ['v4', 'v3'] },
    { name: 'classify-vendor', versions: ['v2'] },
  ],
  'support-chatbot': [
    { name: 'answer-query', versions: ['v7', 'v6'] },
    { name: 'intent-router', versions: ['v2'] },
  ],
  'catalog-enrichment': [
    { name: 'enrich-product', versions: ['v2'] },
    { name: 'normalize-attrs', versions: ['v1'] },
  ],
};

const uid = (n) => crypto.randomUUID().replaceAll('-', '').slice(0, n);

export function generateDemoRecords({ days = 30, now = Date.now(), seed = 42 } = {}) {
  const rand = mulberry32(seed);
  const records = [];
  const dayMs = 24 * 3600e3;
  const pick = (arr, weights) => {
    let r = rand() * weights.reduce((s, w) => s + w, 0);
    for (let i = 0; i < arr.length; i++) {
      r -= weights[i];
      if (r <= 0) return arr[i];
    }
    return arr[arr.length - 1];
  };
  const between = ([lo, hi]) => lo + Math.round(rand() * (hi - lo));

  let spikeD = 3;
  while ([0, 6].includes(new Date(now - spikeD * dayMs).getDay())) spikeD++;

  for (let d = days - 1; d >= 0; d--) {
    const dayStart = new Date(now - d * dayMs);
    dayStart.setHours(0, 0, 0, 0);
    const weekday = dayStart.getDay();
    const weekdayFactor = weekday === 0 || weekday === 6 ? 0.35 : 1;

    for (const project of PROJECTS) {
      const count = Math.round(project.perDay * weekdayFactor * (0.8 + rand() * 0.5));
      const projectPrompts = PROMPTS[project.name] || [];
      let openTrace = null;
      let openCount = 0;
      let openAnchor = 0;
      for (let i = 0; i < count; i++) {
        const hour = pick(
          Array.from({ length: 24 }, (_, h) => h),
          HOUR_WEIGHTS,
        );
        let ts = dayStart.getTime() + hour * 3600e3 + Math.floor(rand() * 3600e3);
        if (ts > now) continue;

        let mix = pick(
          project.mixes,
          project.mixes.map((m) => m.w),
        );
        let provider = mix.provider;
        let model = mix.model;

        const isSpike = project.name === 'claims-copilot' && d === spikeD && hour >= 8 && hour < 20;
        if (isSpike) {
          provider = 'anthropic';
          model = 'claude-opus-4-5';
        }
        const isErrorBurst =
          project.name === 'support-chatbot' && d === 1 && hour === 14 && rand() < 0.55;

        const tokensInTotal = between(mix.in);
        const cacheRead =
          mix.cacheRead && rand() < 0.7
            ? Math.round(tokensInTotal * mix.cacheRead * (0.5 + rand() * 0.5))
            : 0;
        const cacheWrite =
          provider === 'anthropic' && cacheRead === 0 && rand() < 0.15
            ? Math.round(tokensInTotal * 0.4)
            : 0;
        const output = between(mix.out);
        const failed = isErrorBurst || rand() < 0.012;
        const stream = !mix.embedding && rand() < project.stream;
        const latencyMs = failed
          ? 150 + Math.round(rand() * 1200)
          : Math.round(300 + output * (stream ? 8 : 5) * (0.6 + rand() * 0.8));

        let usage = null;
        let costUsd = null;
        let priced = null;
        if (!failed) {
          usage = {
            inputUncached: Math.max(0, tokensInTotal - cacheRead - cacheWrite),
            cacheRead,
            cacheWrite,
            output,
          };
          ({ costUsd, priced } = cost(model, usage));
        }

        let prompt = null;
        let promptVersion = null;
        if (!mix.embedding && projectPrompts.length) {
          const tmpl = pick(
            projectPrompts,
            projectPrompts.map((_, idx) => (idx === 0 ? 3 : 1)),
          );
          prompt = tmpl.name;
          promptVersion =
            tmpl.versions.length > 1 && rand() < 0.18 ? tmpl.versions[1] : tmpl.versions[0];
        }

        let trace = null;
        if (openTrace && openCount < 4 && rand() < 0.6) {
          trace = openTrace;
          ts = openAnchor + openCount * (2000 + Math.floor(rand() * 9000));
          openCount += 1;
        } else if (rand() < 0.45) {
          openTrace = 'tr_' + uid(16);
          openAnchor = ts;
          openCount = 1;
          trace = openTrace;
        } else {
          openTrace = null;
          openCount = 0;
        }

        records.push({
          id: 'demo_' + uid(18),
          ts,
          project: project.name,
          provider,
          model,
          endpoint: mix.embedding
            ? '/v1/embeddings'
            : provider === 'anthropic'
              ? '/v1/messages'
              : provider === 'gemini'
                ? `/v1beta/models/${model}:generateContent`
                : '/v1/chat/completions',
          method: 'POST',
          stream,
          trace,
          prompt,
          promptVersion,
          status: failed ? (isErrorBurst ? 429 : pick([500, 502, 400], [2, 1, 1])) : 200,
          ok: !failed,
          latencyMs,
          ttfbMs: stream && !failed ? 180 + Math.round(rand() * 500) : null,
          tokensIn: failed ? null : tokensInTotal,
          tokensOut: failed ? null : output,
          cacheRead: failed ? null : cacheRead,
          cacheWrite: failed ? null : cacheWrite,
          tokensTotal: failed ? null : tokensInTotal + output,
          costUsd,
          priced,
          errorType: failed ? 'upstream_error' : null,
          errorMessage: failed
            ? isErrorBurst
              ? 'Rate limit reached for requests'
              : 'The server had an error while processing your request'
            : null,
          simulated: false,
        });
      }
    }
  }
  records.sort((a, b) => a.ts - b.ts);
  return records;
}
