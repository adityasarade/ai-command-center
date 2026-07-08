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
    // records are not guaranteed sorted (live appends + backfills) - take the true minimum
    const first = records.length
      ? records.reduce((min, r) => Math.min(min, r.ts), Infinity)
      : now - RANGES['7d'];
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
    agg = {
      requests: 0,
      errors: 0,
      costUsd: 0,
      tokensIn: 0,
      tokensOut: 0,
      lastTs: 0,
      models: new Map(),
    };
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
      const { models: _models, ...rest } = agg;
      return { [keyName]: key, ...rest, topModel, tokens: agg.tokensIn + agg.tokensOut };
    })
    .sort((a, b) => b.costUsd - a.costUsd || b.requests - a.requests);
}

/** Continuous time buckets (hourly ≤ 3 days span, else daily) covering [from, to].
 *  Daily buckets align to LOCAL midnight on the gateway host, not UTC, so day
 *  bars match the calendar day users actually experienced. */
function bucketize(records, from, to) {
  const span = to - from;
  const hourly = span <= 3 * 24 * 3600e3;
  const size = hourly ? 3600e3 : 24 * 3600e3;
  const floorBucket = hourly
    ? (ts) => Math.floor(ts / size) * size
    : (ts) => new Date(ts).setHours(0, 0, 0, 0);
  const mk = (t) => ({
    t,
    requests: 0,
    errors: 0,
    costUsd: 0,
    tokensIn: 0,
    tokensOut: 0,
    byProject: {},
  });
  const buckets = new Map();
  if (hourly) {
    for (let t = floorBucket(from); t <= to; t += size) buckets.set(t, mk(t));
  } else {
    const d = new Date(from);
    d.setHours(0, 0, 0, 0);
    while (d.getTime() <= to) {
      buckets.set(d.getTime(), mk(d.getTime()));
      d.setDate(d.getDate() + 1); // calendar-day step (DST-safe)
    }
  }
  for (const r of records) {
    const b = buckets.get(floorBucket(r.ts));
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

/** Total spend per project for the current calendar month (host-local). */
export function monthlySpendByProject(records, now = Date.now()) {
  const d = new Date(now);
  const monthStart = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  const byProject = {};
  for (const r of records) {
    if (r.ts < monthStart) continue;
    const p = r.project || 'default';
    byProject[p] = (byProject[p] || 0) + (r.costUsd || 0);
  }
  return { monthStart, byProject };
}

/** Group calls into traces/sessions (via the trace id). Newest first. */
export function listTraces(records, query = {}) {
  const { from, to } = resolveRange(query, records);
  const rows = filterRecords(records, { from, to, project: query.project });
  const map = new Map();
  for (const r of rows) {
    if (!r.trace) continue;
    let t = map.get(r.trace);
    if (!t) {
      t = {
        id: r.trace,
        project: r.project,
        calls: 0,
        costUsd: 0,
        tokens: 0,
        errors: 0,
        start: r.ts,
        end: r.ts,
        providers: new Set(),
        models: new Set(),
      };
      map.set(r.trace, t);
    }
    t.calls += 1;
    t.costUsd += r.costUsd || 0;
    t.tokens += r.tokensTotal || 0;
    if (!r.ok) t.errors += 1;
    t.start = Math.min(t.start, r.ts);
    t.end = Math.max(t.end, r.ts + (r.latencyMs || 0));
    t.providers.add(r.provider);
    if (r.model) t.models.add(r.model);
  }
  const items = [...map.values()]
    .map((t) => ({
      id: t.id,
      project: t.project,
      calls: t.calls,
      costUsd: t.costUsd,
      tokens: t.tokens,
      errors: t.errors,
      start: t.start,
      spanMs: t.end - t.start,
      providers: [...t.providers],
      models: [...t.models],
    }))
    .sort((a, b) => b.start - a.start);
  const limit = Math.min(Number(query.limit) || 50, 300);
  return { total: items.length, items: items.slice(0, limit) };
}

/** The ordered call timeline for one trace id. */
export function getTrace(records, id) {
  const calls = records.filter((r) => r.trace === id).sort((a, b) => a.ts - b.ts);
  const start = calls.length ? calls[0].ts : 0;
  const last = calls.at(-1);
  return {
    id,
    project: calls[0]?.project ?? null,
    calls: calls.map((r) => ({
      id: r.id,
      ts: r.ts,
      offsetMs: r.ts - start,
      provider: r.provider,
      model: r.model,
      endpoint: r.endpoint,
      prompt: r.prompt || null,
      promptVersion: r.promptVersion || null,
      tokensIn: r.tokensIn,
      tokensOut: r.tokensOut,
      costUsd: r.costUsd,
      latencyMs: r.latencyMs,
      ok: r.ok,
      status: r.status,
    })),
    costUsd: calls.reduce((s, r) => s + (r.costUsd || 0), 0),
    tokens: calls.reduce((s, r) => s + (r.tokensTotal || 0), 0),
    spanMs: last ? last.ts + (last.latencyMs || 0) - start : 0,
  };
}

/** Per prompt+version metrics, so a regressed version is easy to spot. */
export function listPrompts(records, query = {}) {
  const { from, to } = resolveRange(query, records);
  const rows = filterRecords(records, { from, to, project: query.project });
  const map = new Map();
  for (const r of rows) {
    if (!r.prompt) continue;
    const key = r.prompt + ' ' + (r.promptVersion || '-');
    let p = map.get(key);
    if (!p) {
      p = {
        prompt: r.prompt,
        version: r.promptVersion || null,
        project: r.project,
        requests: 0,
        errors: 0,
        costUsd: 0,
        tokensIn: 0,
        tokensOut: 0,
        lat: [],
      };
      map.set(key, p);
    }
    p.requests += 1;
    if (!r.ok) p.errors += 1;
    p.costUsd += r.costUsd || 0;
    p.tokensIn += r.tokensIn || 0;
    p.tokensOut += r.tokensOut || 0;
    if (r.ok && r.latencyMs != null) p.lat.push(r.latencyMs);
  }
  const items = [...map.values()]
    .map((p) => {
      p.lat.sort((a, b) => a - b);
      return {
        prompt: p.prompt,
        version: p.version,
        project: p.project,
        requests: p.requests,
        errorRate: p.requests ? p.errors / p.requests : 0,
        costUsd: p.costUsd,
        avgCostUsd: p.requests ? p.costUsd / p.requests : 0,
        tokens: p.tokensIn + p.tokensOut,
        p50LatencyMs: Math.round(percentile(p.lat, 50)),
        p95LatencyMs: Math.round(percentile(p.lat, 95)),
      };
    })
    .sort(
      (a, b) =>
        a.prompt.localeCompare(b.prompt) || (b.version || '').localeCompare(a.version || ''),
    );
  return { items };
}

/** Side-by-side model comparison: effective $/1M tokens, latency, error rate. */
export function modelComparison(records, query = {}) {
  const { from, to } = resolveRange(query, records);
  const rows = filterRecords(records, { from, to, project: query.project });
  const map = new Map();
  for (const r of rows) {
    const model = r.model || '(unknown)';
    const key = r.provider + ' ' + model;
    let m = map.get(key);
    if (!m) {
      m = {
        provider: r.provider,
        model,
        requests: 0,
        errors: 0,
        costUsd: 0,
        tokensIn: 0,
        tokensOut: 0,
        lat: [],
      };
      map.set(key, m);
    }
    m.requests += 1;
    if (!r.ok) m.errors += 1;
    m.costUsd += r.costUsd || 0;
    m.tokensIn += r.tokensIn || 0;
    m.tokensOut += r.tokensOut || 0;
    if (r.ok && r.latencyMs != null) m.lat.push(r.latencyMs);
  }
  const items = [...map.values()]
    .map((m) => {
      m.lat.sort((a, b) => a - b);
      const tokens = m.tokensIn + m.tokensOut;
      return {
        provider: m.provider,
        model: m.model,
        requests: m.requests,
        errorRate: m.requests ? m.errors / m.requests : 0,
        costUsd: m.costUsd,
        tokensIn: m.tokensIn,
        tokensOut: m.tokensOut,
        tokens,
        effectivePerMTok: tokens ? (m.costUsd / tokens) * 1e6 : 0,
        p50LatencyMs: Math.round(percentile(m.lat, 50)),
        p95LatencyMs: Math.round(percentile(m.lat, 95)),
      };
    })
    .sort((a, b) => b.costUsd - a.costUsd);
  return { items };
}
