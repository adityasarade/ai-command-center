import { resolveRange, filterRecords, monthlySpendByProject } from './stats.js';

/**
 * Rule-based anomaly detection over daily buckets (host-local days):
 *  - cost spike: a day whose spend is > 2.5x the median day and above a floor
 *  - error burst: a day with > 15% error rate over a meaningful request count
 * Simple and explainable - no ML, no external services.
 */
export function detectAnomalies(records, query = {}) {
  const { from, to } = resolveRange(
    { range: query.range || '30d', from: query.from, to: query.to },
    records,
  );
  const rows = filterRecords(records, { from, to, project: query.project });

  // Bucket by (project, local day).
  const perProject = new Map();
  const median = (arr) => {
    const s = arr.filter((c) => c > 0).sort((a, b) => a - b);
    return s.length ? s[Math.floor(s.length / 2)] : 0;
  };
  for (const r of rows) {
    const project = r.project || 'default';
    const day = new Date(r.ts).setHours(0, 0, 0, 0);
    let pm = perProject.get(project);
    if (!pm) {
      pm = new Map();
      perProject.set(project, pm);
    }
    let node = pm.get(day);
    if (!node) {
      node = { t: day, cost: 0, reqs: 0, errs: 0 };
      pm.set(day, node);
    }
    node.cost += r.costUsd || 0;
    node.reqs += 1;
    if (!r.ok) node.errs += 1;
  }

  const anomalies = [];
  for (const [project, pm] of perProject) {
    const list = [...pm.values()].sort((a, b) => a.t - b.t);
    const med = median(list.map((x) => x.cost));
    for (const day of list) {
      if (med > 0 && day.cost > med * 2 && day.cost > 0.3) {
        anomalies.push({
          type: 'cost_spike',
          severity: 'warning',
          project,
          date: day.t,
          value: day.cost,
          baseline: med,
          message: `${project}: spend $${day.cost.toFixed(2)} was ${(day.cost / med).toFixed(1)}x its median day ($${med.toFixed(2)})`,
        });
      }
      const er = day.reqs ? day.errs / day.reqs : 0;
      if (day.reqs >= 20 && er > 0.15) {
        anomalies.push({
          type: 'error_burst',
          severity: 'critical',
          project,
          date: day.t,
          value: er,
          message: `${project}: ${(er * 100).toFixed(0)}% errors across ${day.reqs} requests`,
        });
      }
    }
  }
  anomalies.sort((a, b) => b.date - a.date || (a.severity === 'critical' ? -1 : 1));
  return { anomalies };
}

/**
 * Compute current alerts from budgets + recent telemetry:
 *  - budget: project spend past its alert threshold / over budget (this month)
 *  - error_rate / latency: last-24h per-project breaches of the configured thresholds
 * Pure computation for display; the caller may also fire a webhook on new alerts.
 */
export function computeAlerts(records, budgetsDb, now = Date.now()) {
  const alerts = [];
  const { byProject } = monthlySpendByProject(records, now);
  for (const [project, b] of Object.entries(budgetsDb.projects || {})) {
    const spent = byProject[project] || 0;
    const pct = b.monthlyUsd > 0 ? (spent / b.monthlyUsd) * 100 : 0;
    if (pct >= 100) {
      alerts.push({
        type: 'budget',
        severity: 'critical',
        project,
        value: pct,
        message: `${project} is over budget: $${spent.toFixed(2)} of $${b.monthlyUsd} this month (${pct.toFixed(0)}%)`,
      });
    } else if (pct >= (b.alertAtPct || 80)) {
      alerts.push({
        type: 'budget',
        severity: 'warning',
        project,
        value: pct,
        message: `${project} at ${pct.toFixed(0)}% of its $${b.monthlyUsd} monthly budget`,
      });
    }
  }

  // Threshold breaches over the last 24h, per project.
  const th = budgetsDb.thresholds || {};
  const since = now - 24 * 3600e3;
  const per = new Map();
  for (const r of records) {
    if (r.ts < since) continue;
    const p = r.project || 'default';
    let s = per.get(p);
    if (!s) {
      s = { reqs: 0, errs: 0, lat: [] };
      per.set(p, s);
    }
    s.reqs += 1;
    if (!r.ok) s.errs += 1;
    if (r.ok && r.latencyMs != null) s.lat.push(r.latencyMs);
  }
  for (const [project, s] of per) {
    if (s.reqs < 20) continue; // avoid noise on tiny samples
    const er = (s.errs / s.reqs) * 100;
    if (th.errorRatePct != null && er > th.errorRatePct) {
      alerts.push({
        type: 'error_rate',
        severity: er > th.errorRatePct * 2 ? 'critical' : 'warning',
        project,
        value: er,
        message: `${project}: ${er.toFixed(0)}% errors in the last 24h (threshold ${th.errorRatePct}%)`,
      });
    }
    if (th.p95LatencyMs != null && s.lat.length) {
      s.lat.sort((a, b) => a - b);
      const p95 = s.lat[Math.min(s.lat.length - 1, Math.ceil(0.95 * s.lat.length) - 1)];
      if (p95 > th.p95LatencyMs) {
        alerts.push({
          type: 'latency',
          severity: 'warning',
          project,
          value: p95,
          message: `${project}: p95 latency ${(p95 / 1000).toFixed(1)}s in the last 24h (threshold ${(th.p95LatencyMs / 1000).toFixed(1)}s)`,
        });
      }
    }
  }

  const rank = { critical: 0, warning: 1 };
  alerts.sort((a, b) => (rank[a.severity] ?? 9) - (rank[b.severity] ?? 9));
  return alerts;
}
