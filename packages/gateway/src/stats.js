/** Aggregations that power the dashboard and `aicc stats`. */

const RANGES = {
  '1h': 3600e3,
  '24h': 24 * 3600e3,
  '7d': 7 * 24 * 3600e3,
  '30d': 30 * 24 * 3600e3,
  '90d': 90 * 24 * 3600e3,
};

export function resolveRange(query, records) {
  const now = Date.now();
  if (query.from || query.to) {
    return { from: Number(query.from) || 0, to: Number(query.to) || now };
  }
  const range = query.range || '7d';
  if (range === 'all') {
    const first = records.length ? records[0].ts : now - RANGES['7d'];
    return { from: first, to: now };
  }
  return { from: now - (RANGES[range] || RANGES['7d']), to: now };
}

export function filterRecords(records, { from, to, project, provider }) {
  return records.filter(
    (r) =>
      r.ts >= from &&
      r.ts <= to &&
      (!project || r.project === project) &&
      (!provider || r.provider === provider),
  );
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

export function computeStats(allRecords, query = {}) {
  const { from, to } = resolveRange(query, allRecords);
  const records = filterRecords(allRecords, {
    from,
    to,
    project: query.project,
    provider: query.provider,
  });

  const totals = {
    requests: records.length,
    errors: 0,
    costUsd: 0,
    tokensIn: 0,
    tokensOut: 0,
    cacheRead: 0,
    unpriced: 0,
    simulated: 0,
  };
  const latencies = [];
  const byProject = new Map();
  const byModel = new Map();
  const byProvider = new Map();

  for (const r of records) {
    const cost = r.costUsd || 0;
    totals.costUsd += cost;
    totals.tokensIn += r.tokensIn || 0;
    totals.tokensOut += r.tokensOut || 0;
    totals.cacheRead += r.cacheRead || 0;
    if (!r.ok) totals.errors += 1;
    if (r.ok && r.priced === false) totals.unpriced += 1;
    if (r.simulated) totals.simulated += 1;
    if (r.latencyMs != null && r.ok) latencies.push(r.latencyMs);

    bump(byProject, r.project || 'default', r, cost);
    bump(byModel, `${r.provider}※${r.model || '(unknown)'}`, r, cost);
    bump(byProvider, r.provider || '(unknown)', r, cost);
  }

  latencies.sort((a, b) => a - b);
  totals.tokens = totals.tokensIn + totals.tokensOut;
  totals.avgLatencyMs = latencies.length
    ? Math.round(latencies.reduce((s, v) => s + v, 0) / latencies.length)
    : 0;
  totals.p50LatencyMs = Math.round(percentile(latencies, 50));
  totals.p95LatencyMs = Math.round(percentile(latencies, 95));
  totals.errorRate = records.length ? totals.errors / records.length : 0;

  return {
    from,
    to,
    totals,
    timeseries: bucketize(records, from, to),
    byProject: finalize(byProject, 'project'),
    byModel: finalize(byModel, 'model').map((row) => {
      const [provider, model] = row.model.split('※');
      return { ...row, provider, model };
    }),
    byProvider: finalize(byProvider, 'provider'),
  };
}

function bump(map, key, r, cost) {
  let agg = map.get(key);
  if (!agg) {
    agg = { requests: 0, errors: 0, costUsd: 0, tokensIn: 0, tokensOut: 0, lastTs: 0, models: new Map() };
    map.set(key, agg);
  }
  agg.requests += 1;
  if (!r.ok) agg.errors += 1;
  agg.costUsd += cost;
  agg.tokensIn += r.tokensIn || 0;
  agg.tokensOut += r.tokensOut || 0;
  agg.lastTs = Math.max(agg.lastTs, r.ts);
  if (r.model) agg.models.set(r.model, (agg.models.get(r.model) || 0) + cost);
}

function finalize(map, keyName) {
  return [...map.entries()]
    .map(([key, agg]) => {
      const topModel = [...agg.models.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
      const { models, ...rest } = agg;
      return { [keyName]: key, ...rest, topModel, tokens: agg.tokensIn + agg.tokensOut };
    })
    .sort((a, b) => b.costUsd - a.costUsd || b.requests - a.requests);
}

/** Continuous time buckets (hourly ≤ 3 days span, else daily) covering [from, to]. */
function bucketize(records, from, to) {
  const span = to - from;
  const size = span <= 3 * 24 * 3600e3 ? 3600e3 : 24 * 3600e3;
  const start = Math.floor(from / size) * size;
  const buckets = new Map();
  for (let t = start; t <= to; t += size) {
    buckets.set(t, { t, requests: 0, errors: 0, costUsd: 0, tokensIn: 0, tokensOut: 0, byProject: {} });
  }
  for (const r of records) {
    const b = buckets.get(Math.floor(r.ts / size) * size);
    if (!b) continue;
    b.requests += 1;
    if (!r.ok) b.errors += 1;
    b.costUsd += r.costUsd || 0;
    b.tokensIn += r.tokensIn || 0;
    b.tokensOut += r.tokensOut || 0;
    const p = r.project || 'default';
    b.byProject[p] = (b.byProject[p] || 0) + (r.costUsd || 0);
  }
  return { bucketMs: size, points: [...buckets.values()] };
}

/** Recent-requests listing with basic filters, newest first. */
export function listRequests(allRecords, query = {}) {
  const limit = Math.min(Number(query.limit) || 50, 500);
  const offset = Number(query.offset) || 0;
  const q = (query.q || '').toLowerCase();
  const filtered = allRecords.filter(
    (r) =>
      (!query.project || r.project === query.project) &&
      (!query.provider || r.provider === query.provider) &&
      (!query.errorsOnly || !r.ok) &&
      (!q ||
        (r.model || '').toLowerCase().includes(q) ||
        (r.project || '').toLowerCase().includes(q) ||
        (r.endpoint || '').toLowerCase().includes(q)),
  );
  const total = filtered.length;
  const items = filtered
    .slice()
    .sort((a, b) => b.ts - a.ts)
    .slice(offset, offset + limit);
  return { total, items };
}

export function listProjects(allRecords) {
  const map = new Map();
  for (const r of allRecords) {
    const key = r.project || 'default';
    const p = map.get(key) || { project: key, requests: 0, costUsd: 0, lastTs: 0 };
    p.requests += 1;
    p.costUsd += r.costUsd || 0;
    p.lastTs = Math.max(p.lastTs, r.ts);
    map.set(key, p);
  }
  return [...map.values()].sort((a, b) => b.lastTs - a.lastTs);
}
