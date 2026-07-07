import crypto from 'node:crypto';

/**
 * Seeds realistic, deterministic demo traffic so the dashboard tells a story
 * without a single real API call:
 *   - 4 AI products with distinct model mixes and volumes
 *   - business-hours + weekday weighting
 *   - a cost-spike incident a few days ago (claims-copilot briefly on Opus,
 *     placed on the nearest weekday so the story survives weekend seeding)
 *   - a rate-limit error burst yesterday (support-chatbot)
 * All records carry simulated:true so they can be purged with `aicc clear`.
 */

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

// Hour-of-day weights (local time) - office hours heavy, small overnight batch jobs.
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

export function generateDemoRecords(pricing, { days = 14, now = Date.now(), seed = 42 } = {}) {
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

  // Cost-spike incident day: walk back from 3 days ago to the nearest weekday
  // (a weekend spike would be suppressed by the low weekend volume).
  let spikeD = 3;
  while ([0, 6].includes(new Date(now - spikeD * dayMs).getDay())) spikeD++;

  for (let d = days - 1; d >= 0; d--) {
    const dayStart = new Date(now - d * dayMs);
    dayStart.setHours(0, 0, 0, 0);
    const weekday = dayStart.getDay();
    const weekdayFactor = weekday === 0 || weekday === 6 ? 0.35 : 1;

    for (const project of PROJECTS) {
      const count = Math.round(project.perDay * weekdayFactor * (0.8 + rand() * 0.5));
      for (let i = 0; i < count; i++) {
        const hour = pick(
          Array.from({ length: 24 }, (_, h) => h),
          HOUR_WEIGHTS,
        );
        const ts = dayStart.getTime() + hour * 3600e3 + Math.floor(rand() * 3600e3);
        if (ts > now) continue;

        let mix = pick(
          project.mixes,
          project.mixes.map((m) => m.w),
        );
        let provider = mix.provider;
        let model = mix.model;

        // Incident: a few days ago claims-copilot ran Opus between 10:00-16:00 (config slip).
        const isSpike =
          project.name === 'claims-copilot' && d === spikeD && hour >= 10 && hour < 16;
        if (isSpike) {
          provider = 'anthropic';
          model = 'claude-opus-4-5';
        }

        // Incident: yesterday 14:00-15:00 support-chatbot hit rate limits.
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
        const randomError = rand() < 0.012;
        const failed = isErrorBurst || randomError;

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
          ({ costUsd, priced } = pricing.cost(provider, model, usage));
        }

        records.push({
          id: 'demo_' + crypto.randomUUID().replaceAll('-', '').slice(0, 18),
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
          simulated: true,
        });
      }
    }
  }
  records.sort((a, b) => a.ts - b.ts);
  return records;
}

export function seedDemo(store, pricing, opts = {}) {
  const records = generateDemoRecords(pricing, opts);
  store.appendMany(records);
  return records.length;
}
