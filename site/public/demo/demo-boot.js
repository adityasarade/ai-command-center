// Client-side mock backend for the hosted demo. Generates a realistic dataset in
// the browser, answers the dashboard's /api/* calls using the gateway's own pure
// aggregation code (stats.js, anomaly.js), then loads the real app.js. There is no
// server: nothing is fetched from or sent to any backend, so it can't be spammed.
import * as stats from './stats.js';
import { detectAnomalies, computeAlerts } from './anomaly.js';
import { generateDemoRecords } from './demo-data.js';

const records = generateDemoRecords({ days: 30 });

// One sample budget (near threshold) + thresholds, so Alerts/Anomalies tell a story.
const { byProject } = stats.monthlySpendByProject(records);
const claimsSpend = byProject['claims-copilot'] || 1;
const budgetsDb = {
  projects: {
    'claims-copilot': { monthlyUsd: Math.max(1, Math.round(claimsSpend / 0.82)), alertAtPct: 80 },
  },
  thresholds: { errorRatePct: 8, p95LatencyMs: 25000 },
};

const META = {
  name: 'AI Command Center',
  branding: { name: 'AI Command Center', accent: '#3987e5' },
  version: '0.2.0',
  startedAt: Date.now(),
  dataDir: null,
  currency: { default: 'INR', options: ['INR', 'USD', 'EUR'], rates: null },
  port: 4321,
  providers: {},
  routes: {},
  records: records.length,
};
const FX = {
  base: 'USD',
  rates: { USD: 1, INR: 83.2, EUR: 0.92 },
  source: 'demo (fixed rates)',
  options: ['INR', 'USD', 'EUR'],
  default: 'INR',
  stale: false,
  fetchedAt: Date.now(),
};

const json = (data) =>
  new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

const realFetch = window.fetch.bind(window);
window.fetch = async (input, opts = {}) => {
  const url = typeof input === 'string' ? input : input.url;
  if (!url || !url.includes('/api/')) return realFetch(input, opts);
  const u = new URL(url, location.origin);
  const p = u.pathname;
  const q = Object.fromEntries(u.searchParams.entries());
  try {
    if (p === '/api/auth/state')
      return json({
        enabled: false,
        locked: false,
        needsSetup: false,
        user: null,
        branding: META.branding,
      });
    if (p === '/api/meta') return json(META);
    if (p === '/api/fx') return json(FX);
    if (p === '/api/projects') return json(stats.listProjects(records));
    if (p === '/api/stats') return json(stats.computeStats(records, q));
    if (p === '/api/requests') return json(stats.listRequests(records, q));
    if (p === '/api/traces') return json(stats.listTraces(records, q));
    if (p === '/api/trace') return json(stats.getTrace(records, u.searchParams.get('id')));
    if (p === '/api/prompts') return json(stats.listPrompts(records, q));
    if (p === '/api/models') return json(stats.modelComparison(records, q));
    if (p === '/api/anomalies') return json(detectAnomalies(records, q));
    if (p === '/api/alerts') {
      const { monthStart, byProject } = stats.monthlySpendByProject(records);
      const budgets = Object.entries(budgetsDb.projects).map(([project, b]) => {
        const spent = byProject[project] || 0;
        return {
          project,
          monthlyUsd: b.monthlyUsd,
          alertAtPct: b.alertAtPct,
          spentUsd: spent,
          pct: b.monthlyUsd > 0 ? (spent / b.monthlyUsd) * 100 : 0,
        };
      });
      return json({
        alerts: computeAlerts(records, budgetsDb),
        budgets,
        thresholds: budgetsDb.thresholds,
        monthStart,
      });
    }
    // Admin / mutation endpoints do nothing in the demo (there is no server to change).
    return json({ ok: true, demo: true });
  } catch (err) {
    return json({ error: { message: String(err) } });
  }
};

// SSE stub: light the LIVE indicator without a real event stream.
window.EventSource = class {
  constructor() {
    this.onopen = null;
    this.onmessage = null;
    this.onerror = null;
    setTimeout(() => this.onopen && this.onopen(), 50);
  }
  addEventListener() {}
  close() {}
};

// Demo ribbon.
const bar = document.createElement('div');
bar.textContent =
  'Live demo · sample data, running entirely in your browser · nothing is sent to a server';
bar.style.cssText =
  'font:12px/1.5 ui-monospace,monospace;letter-spacing:.03em;text-align:center;padding:7px 12px;' +
  'color:#0b0b0c;background:#63bfa2;';
document.body.prepend(bar);

// On the hosted demo, the brand title links back to the marketing home.
const brand = document.querySelector('.brand');
if (brand) {
  brand.style.cursor = 'pointer';
  brand.title = 'Back to the AI Command Center home page';
  brand.addEventListener('click', () => {
    window.location.href = '/';
  });
}

// Fetch is mocked and Chart is loaded - now start the real dashboard.
const s = document.createElement('script');
s.src = 'app.js';
document.body.appendChild(s);
