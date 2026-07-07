import fs from 'node:fs';
import path from 'node:path';

/**
 * Per-project monthly budgets + alert thresholds, persisted to dataDir/budgets.json.
 * Admin-managed via the API/dashboard. Small config-like state, not telemetry.
 *
 * Shape:
 *   {
 *     "projects": { "<name>": { "monthlyUsd": number, "alertAtPct": number } },
 *     "thresholds": { "errorRatePct": number, "p95LatencyMs": number }
 *   }
 */
const DEFAULT_THRESHOLDS = { errorRatePct: 10, p95LatencyMs: 20000 };

export class Budgets {
  constructor(dataDir) {
    this.file = path.join(dataDir, 'budgets.json');
    fs.mkdirSync(dataDir, { recursive: true });
    try {
      this.db = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch {
      this.db = { projects: {}, thresholds: { ...DEFAULT_THRESHOLDS } };
    }
    this.db.projects ??= {};
    this.db.thresholds = { ...DEFAULT_THRESHOLDS, ...(this.db.thresholds || {}) };
  }

  _persist() {
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.db, null, 2));
    fs.renameSync(tmp, this.file);
  }

  all() {
    return this.db;
  }

  setProjectBudget(name, { monthlyUsd, alertAtPct } = {}) {
    name = String(name || '').trim();
    if (!name) throw httpBudgetError('project name required');
    const usd = Number(monthlyUsd);
    if (!Number.isFinite(usd) || usd < 0)
      throw httpBudgetError('monthlyUsd must be a non-negative number');
    const pct = alertAtPct == null ? 80 : Number(alertAtPct);
    if (!Number.isFinite(pct) || pct < 1 || pct > 100)
      throw httpBudgetError('alertAtPct must be 1-100');
    this.db.projects[name] = { monthlyUsd: usd, alertAtPct: pct };
    this._persist();
    return this.db.projects[name];
  }

  removeProjectBudget(name) {
    if (this.db.projects[name]) {
      delete this.db.projects[name];
      this._persist();
    }
  }

  setThresholds({ errorRatePct, p95LatencyMs } = {}) {
    if (errorRatePct != null) {
      const v = Number(errorRatePct);
      if (Number.isFinite(v) && v >= 0 && v <= 100) this.db.thresholds.errorRatePct = v;
    }
    if (p95LatencyMs != null) {
      const v = Number(p95LatencyMs);
      if (Number.isFinite(v) && v >= 0) this.db.thresholds.p95LatencyMs = v;
    }
    this._persist();
    return this.db.thresholds;
  }
}

function httpBudgetError(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}
