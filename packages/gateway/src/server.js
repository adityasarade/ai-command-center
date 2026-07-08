import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { buildProviderTable, buildRoutes, parseProxyPath, centralKey } from './providers.js';
import { PricingEngine } from './pricing.js';
import { Store } from './store.js';
import { FxService } from './fx.js';
import { AuthService } from './auth.js';
import { Evals, runEval } from './evals.js';
import { corsHeaders, originAllowed, untrustedCrossOrigin } from './cors.js';
import {
  computeStats,
  listRequests,
  listProjects,
  listTraces,
  getTrace,
  listPrompts,
  modelComparison,
  monthlySpendByProject,
} from './stats.js';
import { Budgets } from './budgets.js';
import { detectAnomalies, computeAlerts } from './anomaly.js';
import { createProxyHandler, readBody, respondJson } from './proxy.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const PKG = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
};

export function createGateway(config) {
  const table = buildProviderTable(config);
  const { routes, warnings } = buildRoutes(config, table);
  for (const w of warnings) console.warn(`[aicc] ${w}`);
  const pricing = new PricingEngine(config.pricing);
  const store = new Store(config.dataDir).init();
  const fx = new FxService(config.dataDir, config.currency);
  fx.init().catch(() => {}); // non-blocking; get() falls back gracefully meanwhile
  const auth = new AuthService(config.dataDir, { disabled: config.auth === false });
  const budgets = new Budgets(config.dataDir);
  const evals = new Evals(config.dataDir);
  const proxy = createProxyHandler({ table, routes, config, pricing, store });
  const sseClients = new Set();
  const startedAt = Date.now();

  // Optional alert webhook: POST newly-fired alerts (deduped) to config.alertWebhook.
  const firedAlerts = new Set();
  let alertTimer = null;
  if (config.alertWebhook) {
    const checkAlerts = async () => {
      try {
        const alerts = computeAlerts(store.records, budgets.all());
        const fresh = alerts.filter((a) => !firedAlerts.has(alertKey(a)));
        for (const a of alerts) firedAlerts.add(alertKey(a));
        if (fresh.length) {
          await fetch(config.alertWebhook, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ source: 'ai-command-center', alerts: fresh }),
            signal: AbortSignal.timeout(5000),
          }).catch(() => {});
        }
      } catch {
        /* best effort */
      }
    };
    alertTimer = setInterval(checkAlerts, 60_000);
    alertTimer.unref();
  }

  store.on('record', (record) => {
    for (const client of sseClients) {
      if (client.allowed == null || client.allowed.has(record.project)) {
        client.res.write(`data: ${JSON.stringify(record)}\n\n`);
      }
    }
  });
  const heartbeat = setInterval(() => {
    for (const client of sseClients) client.res.write(': ping\n\n');
  }, 25000);
  heartbeat.unref();

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;

    try {
      // Per-origin CORS: echo only trusted origins (same-origin, or config.allowedOrigins).
      // Same-origin dashboard use and non-browser apps (no Origin header) always work.
      const cors = corsHeaders(req, config);
      for (const [k, v] of Object.entries(cors)) res.setHeader(k, v);

      if (req.method === 'OPTIONS') {
        const headers = { 'access-control-max-age': '600' };
        if (req.headers.origin && originAllowed(req, config)) {
          headers['access-control-allow-methods'] = 'GET, POST, PUT, PATCH, DELETE, OPTIONS';
          headers['access-control-allow-headers'] =
            req.headers['access-control-request-headers'] ||
            'authorization, content-type, x-api-key, x-goog-api-key, x-aicc-key, x-aicc-project, anthropic-version';
        }
        res.writeHead(204, headers);
        return res.end();
      }

      // Reject state-changing requests from untrusted cross-origin pages (CSRF /
      // confused-deputy defense). Server-side apps send no Origin header and pass.
      const mutating = req.method !== 'GET' && req.method !== 'HEAD';
      if (mutating && untrustedCrossOrigin(req, config)) {
        return respondJson(res, 403, {
          error: {
            message:
              'cross-origin request blocked. Add your web app origin to config.allowedOrigins to permit browser calls.',
          },
        });
      }

      // ---- dashboard & static assets (open - the app gates itself via /api/auth/state) ----
      if (req.method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
        return serveStatic(res, 'index.html');
      }
      if (
        req.method === 'GET' &&
        /^\/(app\.js|style\.css|logo\.svg|llms\.txt|vendor\/chart\.umd\.js)$/.test(pathname)
      ) {
        return serveStatic(res, pathname.slice(1));
      }
      if (pathname === '/health') {
        // `name` is the product marker the CLI uses to distinguish this gateway
        // from any other local service that answers 200 on /health.
        return respondJson(res, 200, {
          ok: true,
          name: 'ai-command-center',
          version: PKG.version,
          uptimeMs: Date.now() - startedAt,
        });
      }

      // ---- auth endpoints ----
      if (pathname.startsWith('/api/auth/')) {
        return await handleAuthRoutes(req, res, pathname, { auth, config });
      }

      // ---- gateway API (session-gated once auth is locked) ----
      if (pathname.startsWith('/api/')) {
        const user = auth.sessionUser(req);
        // /api/track is a machine endpoint: a valid project gateway key
        // authorizes it even without a dashboard session.
        const trackKeyProject =
          pathname === '/api/track' && auth.locked
            ? auth.projectForKey(headerValue(req, 'x-aicc-key'))
            : null;
        if (auth.locked && !user && !trackKeyProject) {
          return respondJson(res, 401, { error: { message: 'login required', code: 'auth' } });
        }
        const isAdmin = !auth.locked || user?.role === 'admin';
        const allowed = auth.allowedProjects(user); // null = all projects
        const visible =
          allowed == null ? store.records : store.records.filter((r) => allowed.has(r.project));

        if (pathname === '/api/meta') {
          return respondJson(res, 200, {
            name: 'AI Command Center',
            branding: config.branding,
            version: PKG.version,
            startedAt,
            dataDir: isAdmin ? config.dataDir : null,
            currency: config.currency,
            port: config.port,
            providers: Object.fromEntries(
              Object.entries(table).map(([id, p]) => [id, { kind: p.kind, upstream: p.upstream }]),
            ),
            routes: Object.fromEntries(
              Object.entries(routes).map(([name, r]) => [
                name,
                { members: r.members.map((m) => m.id), strategy: r.strategy },
              ]),
            ),
            records: visible.length,
          });
        }
        if (pathname === '/api/fx') {
          return respondJson(res, 200, {
            ...fx.get(),
            default: config.currency.default,
            options: config.currency.options,
          });
        }
        if (pathname === '/api/stats') {
          return respondJson(res, 200, computeStats(visible, queryObj(url)));
        }
        if (pathname === '/api/requests') {
          return respondJson(res, 200, listRequests(visible, queryObj(url)));
        }
        if (pathname === '/api/projects') {
          return respondJson(res, 200, listProjects(visible));
        }
        if (pathname === '/api/traces') {
          return respondJson(res, 200, listTraces(visible, queryObj(url)));
        }
        if (pathname === '/api/trace') {
          const id = url.searchParams.get('id');
          if (!id) return respondJson(res, 400, { error: { message: 'id required' } });
          return respondJson(res, 200, getTrace(visible, id));
        }
        if (pathname === '/api/prompts') {
          const out = listPrompts(visible, queryObj(url));
          // Join in average eval scores per prompt+version, when an eval run exists.
          const scores = evals.scoreByPrompt();
          for (const p of out.items) {
            const s = scores[p.prompt + '␟' + (p.version || '-')];
            if (s) {
              p.avgScore = s.avgScore;
              p.scored = s.scored;
            }
          }
          return respondJson(res, 200, out);
        }
        if (pathname === '/api/models') {
          return respondJson(res, 200, modelComparison(visible, queryObj(url)));
        }
        if (pathname === '/api/anomalies') {
          return respondJson(res, 200, detectAnomalies(visible, queryObj(url)));
        }
        if (pathname === '/api/alerts') {
          const { monthStart, byProject } = monthlySpendByProject(visible);
          const bdb = budgets.all();
          const budgetRows = Object.entries(bdb.projects)
            .filter(([p]) => allowed == null || allowed.has(p))
            .map(([project, b]) => {
              const spent = byProject[project] || 0;
              return {
                project,
                monthlyUsd: b.monthlyUsd,
                alertAtPct: b.alertAtPct,
                spentUsd: spent,
                pct: b.monthlyUsd > 0 ? (spent / b.monthlyUsd) * 100 : 0,
              };
            });
          return respondJson(res, 200, {
            alerts: computeAlerts(visible, bdb),
            budgets: budgetRows,
            thresholds: bdb.thresholds,
            monthStart,
          });
        }
        if (pathname === '/api/events') {
          res.writeHead(200, {
            'content-type': 'text/event-stream',
            'cache-control': 'no-cache',
            connection: 'keep-alive',
          });
          res.write(': connected\n\n');
          const client = { res, allowed };
          sseClients.add(client);
          req.on('close', () => sseClients.delete(client));
          return;
        }
        if (pathname === '/api/track' && req.method === 'POST') {
          // A gateway key forces attribution to its project; an admin session may
          // post arbitrary records (batch jobs, backfills).
          const forcedProject = trackKeyProject?.name || null;
          if (auth.locked && !forcedProject && !isAdmin) {
            return respondJson(res, 401, {
              error: {
                message:
                  'send a valid x-aicc-key header (dashboard → settings → projects) or log in as admin',
              },
            });
          }
          return handleTrack(req, res, { store, pricing, forcedProject });
        }
        if (pathname === '/api/demo' && req.method === 'POST') {
          if (!isAdmin) return respondJson(res, 403, { error: { message: 'admin only' } });
          let opts = {};
          try {
            const raw = await readBody(req, 1024 * 1024);
            if (raw.length) opts = JSON.parse(raw.toString('utf8'));
          } catch {
            return respondJson(res, 400, { error: { message: 'invalid JSON body' } });
          }
          if (opts.clear) {
            store.clear({ simulatedOnly: true });
          }
          const { seedDemo } = await import('./demo.js');
          const days = Math.min(365, Math.max(1, Math.floor(Number(opts.days)) || 14));
          const seeded = seedDemo(store, pricing, { days });
          await store.flush();
          return respondJson(res, 200, { seeded });
        }
        if (pathname === '/api/records' && req.method === 'DELETE') {
          if (!isAdmin) return respondJson(res, 403, { error: { message: 'admin only' } });
          const simulatedOnly = url.searchParams.get('simulated') === '1';
          const removed = store.clear({ simulatedOnly });
          await store.flush();
          return respondJson(res, 200, { removed });
        }
        // ---- evals (offline quality scoring) ----
        if (pathname === '/api/evals' && req.method === 'GET') {
          return respondJson(res, 200, {
            datasets: evals.listDatasets(),
            runs: evals.runs(),
            keyedProviders: Object.keys(table).filter((id) => centralKey(table[id], config)),
          });
        }
        if (pathname === '/api/evals/run' && req.method === 'GET') {
          const id = url.searchParams.get('id');
          return respondJson(res, 200, { rows: id ? evals.runRows(id) : [] });
        }
        if (pathname.startsWith('/api/evals/')) {
          if (!isAdmin) return respondJson(res, 403, { error: { message: 'admin only' } });
          const seg = pathname.slice('/api/evals/'.length).split('/').map(decodeURIComponent);
          if (seg[0] === 'dataset' && req.method === 'POST' && seg.length === 1) {
            const body = await jsonBody(req);
            return respondJson(res, 200, { dataset: evals.saveDataset(body.name, body.rows) });
          }
          if (seg[0] === 'dataset' && req.method === 'DELETE' && seg.length === 2) {
            evals.deleteDataset(seg[1]);
            return respondJson(res, 200, { ok: true });
          }
          if (seg[0] === 'run' && req.method === 'POST' && seg.length === 1) {
            const body = await jsonBody(req);
            const summary = await runEval(evals, { config, table, pricing }, body);
            return respondJson(res, 200, { run: summary });
          }
          return respondJson(res, 404, { error: { message: 'no such evals route' } });
        }

        if (pathname.startsWith('/api/admin/')) {
          if (!isAdmin) return respondJson(res, 403, { error: { message: 'admin only' } });
          return await handleAdminRoutes(req, res, pathname, { auth, store, budgets });
        }
        return respondJson(res, 404, { error: { message: `no API route for ${pathname}` } });
      }

      // ---- LLM proxy ----
      const route = parseProxyPath(pathname, table, routes);
      if (route) {
        // Block untrusted cross-origin browser calls (covers GET too) so a
        // malicious page can't spend the operator's keys via the proxy.
        if (untrustedCrossOrigin(req, config)) {
          return respondJson(res, 403, {
            error: {
              message:
                'cross-origin proxy request blocked. Add your web app origin to config.allowedOrigins to permit browser calls.',
            },
          });
        }
        route.untrustedOrigin = false;
        if (auth.locked) {
          const key = route.key || headerValue(req, 'x-aicc-key');
          const project = auth.projectForKey(key);
          if (!project) {
            return respondJson(res, 401, {
              error: {
                message:
                  'AI Command Center: missing or invalid gateway key. Create a project in the dashboard (settings → projects), then use base URL /k/<key>/<provider>/… or send header x-aicc-key.',
              },
            });
          }
          route.project = project.name; // the key decides attribution
        }
        return await proxy(req, res, route, url);
      }

      return respondJson(res, 404, {
        error: {
          message: `No route for ${pathname}. Proxy paths look like /openai/v1/chat/completions, /anthropic/v1/messages, /gemini/v1beta/models/... - optionally prefixed with /p/<project-name> (or /k/<gateway-key> once auth is enabled). Known providers: ${Object.keys(table).join(', ')}.`,
        },
      });
    } catch (err) {
      if (err?.status) {
        return respondJson(res, err.status, { error: { message: err.message } });
      }
      console.error('[aicc] request error:', err);
      if (!res.headersSent) {
        respondJson(res, 500, { error: { message: `gateway error: ${err.message}` } });
      } else {
        res.destroy();
      }
    }
  });

  // Streaming LLM responses can be long-lived.
  server.requestTimeout = 0;
  server.headersTimeout = 60_000;

  server.once('close', () => {
    fx.stop();
    if (alertTimer) clearInterval(alertTimer);
  });

  return { server, store, table, routes, pricing, fx, auth, budgets, evals, config, sseClients };
}

function alertKey(a) {
  return `${a.type}:${a.project || ''}:${a.severity}`;
}

// ---------------------------------------------------------------- auth routes
async function handleAuthRoutes(req, res, pathname, { auth, config }) {
  if (pathname === '/api/auth/state' && req.method === 'GET') {
    const user = auth.sessionUser(req);
    return respondJson(res, 200, {
      enabled: !auth.disabled,
      locked: auth.locked,
      needsSetup: auth.needsSetup,
      user: auth.publicUser(user),
      branding: config.branding, // public: lets the login screen show company branding
    });
  }
  const secure = req.headers['x-forwarded-proto'] === 'https';
  if (pathname === '/api/auth/setup' && req.method === 'POST') {
    if (auth.disabled)
      return respondJson(res, 400, { error: { message: 'auth is disabled (--no-auth)' } });
    if (auth.db.users.length > 0)
      return respondJson(res, 403, { error: { message: 'setup already completed' } });
    const body = await jsonBody(req);
    const user = await auth.createUser({
      username: body.username,
      password: body.password,
      role: 'admin',
    });
    res.setHeader('set-cookie', auth.issueSessionCookie(user, { secure }));
    return respondJson(res, 200, { user });
  }
  if (pathname === '/api/auth/login' && req.method === 'POST') {
    const body = await jsonBody(req);
    const user = await auth.verifyLogin(body.username, body.password);
    if (!user) return respondJson(res, 401, { error: { message: 'invalid username or password' } });
    res.setHeader('set-cookie', auth.issueSessionCookie(user, { secure }));
    return respondJson(res, 200, { user: auth.publicUser(user) });
  }
  if (pathname === '/api/auth/logout' && req.method === 'POST') {
    res.setHeader('set-cookie', auth.clearSessionCookie());
    return respondJson(res, 200, { ok: true });
  }
  return respondJson(res, 404, { error: { message: 'no such auth route' } });
}

// --------------------------------------------------------------- admin routes
async function handleAdminRoutes(req, res, pathname, { auth, store, budgets }) {
  const seg = pathname.slice('/api/admin/'.length).split('/').map(decodeURIComponent);

  if (seg[0] === 'budget' && req.method === 'POST' && seg.length === 1) {
    const body = await jsonBody(req);
    return respondJson(res, 200, {
      budget: budgets.setProjectBudget(body.project, {
        monthlyUsd: body.monthlyUsd,
        alertAtPct: body.alertAtPct,
      }),
    });
  }
  if (seg[0] === 'budget' && req.method === 'DELETE' && seg.length === 2) {
    budgets.removeProjectBudget(seg[1]);
    return respondJson(res, 200, { ok: true });
  }
  if (seg[0] === 'thresholds' && req.method === 'PATCH' && seg.length === 1) {
    const body = await jsonBody(req);
    return respondJson(res, 200, { thresholds: budgets.setThresholds(body) });
  }

  if (pathname === '/api/admin/overview' && req.method === 'GET') {
    const teamName = (id) => auth.db.teams.find((t) => t.id === id)?.name ?? null;
    return respondJson(res, 200, {
      users: auth.db.users.map((u) => auth.publicUser(u)),
      teams: auth.db.teams,
      projects: auth.db.projects.map((p) => ({ ...p, teamName: teamName(p.teamId) })),
      knownProjects: listProjects(store.records).map((p) => p.project),
    });
  }
  if (seg[0] === 'users' && req.method === 'POST' && seg.length === 1) {
    const body = await jsonBody(req);
    return respondJson(res, 200, { user: await auth.createUser(body) });
  }
  if (seg[0] === 'users' && req.method === 'PATCH' && seg.length === 2) {
    const body = await jsonBody(req);
    return respondJson(res, 200, { user: await auth.updateUser(seg[1], body) });
  }
  if (seg[0] === 'users' && req.method === 'DELETE' && seg.length === 2) {
    auth.deleteUser(seg[1]);
    return respondJson(res, 200, { ok: true });
  }
  if (seg[0] === 'teams' && req.method === 'POST' && seg.length === 1) {
    const body = await jsonBody(req);
    return respondJson(res, 200, { team: auth.createTeam(body.name) });
  }
  if (seg[0] === 'teams' && req.method === 'DELETE' && seg.length === 2) {
    auth.deleteTeam(seg[1]);
    return respondJson(res, 200, { ok: true });
  }
  if (seg[0] === 'projects' && req.method === 'POST' && seg.length === 1) {
    const body = await jsonBody(req);
    return respondJson(res, 200, { project: auth.createProject(body.name, body.teamId || null) });
  }
  if (seg[0] === 'projects' && req.method === 'PATCH' && seg.length === 2) {
    const body = await jsonBody(req);
    return respondJson(res, 200, { project: auth.updateProject(seg[1], body) });
  }
  if (seg[0] === 'projects' && req.method === 'POST' && seg.length === 3 && seg[2] === 'rotate') {
    return respondJson(res, 200, { project: auth.rotateProjectKey(seg[1]) });
  }
  if (seg[0] === 'projects' && req.method === 'DELETE' && seg.length === 2) {
    auth.deleteProject(seg[1]);
    return respondJson(res, 200, { ok: true });
  }
  return respondJson(res, 404, { error: { message: 'no such admin route' } });
}

async function handleTrack(req, res, { store, pricing, forcedProject = null }) {
  let payload;
  try {
    payload = JSON.parse((await readBody(req, 5 * 1024 * 1024)).toString('utf8'));
  } catch {
    return respondJson(res, 400, { error: { message: 'invalid JSON body' } });
  }
  const items = Array.isArray(payload) ? payload : [payload];
  if (!items.length || items.length > 1000) {
    return respondJson(res, 400, { error: { message: 'expected 1-1000 records' } });
  }
  const saved = [];
  for (const item of items) {
    if (typeof item !== 'object' || item == null) continue;
    const tokensIn = numOrNull(item.tokensIn ?? item.input_tokens);
    const tokensOut = numOrNull(item.tokensOut ?? item.output_tokens);
    const cacheRead = numOrNull(item.cacheRead) ?? 0;
    const cacheWrite = numOrNull(item.cacheWrite) ?? 0;
    const provider = String(item.provider || 'custom');
    const model = item.model ? String(item.model) : null;
    let costUsd = numOrNull(item.costUsd);
    let priced = costUsd != null;
    if (costUsd == null && tokensIn != null) {
      ({ costUsd, priced } = pricing.cost(provider, model, {
        inputUncached: Math.max(0, tokensIn - cacheRead - cacheWrite),
        cacheRead,
        cacheWrite,
        output: tokensOut ?? 0,
      }));
    }
    saved.push(
      store.append({
        id: 'trk_' + crypto.randomUUID().replaceAll('-', '').slice(0, 20),
        ts: numOrNull(item.ts) ?? Date.now(),
        project: forcedProject || String(item.project || 'default'),
        provider,
        model,
        endpoint: item.endpoint ? String(item.endpoint) : '/api/track',
        method: 'TRACK',
        stream: false,
        trace: item.trace ? String(item.trace).slice(0, 80) : null,
        prompt: item.prompt ? String(item.prompt).slice(0, 120) : null,
        promptVersion: item.promptVersion ? String(item.promptVersion).slice(0, 40) : null,
        status: item.ok === false ? 0 : 200,
        ok: item.ok !== false,
        latencyMs: numOrNull(item.latencyMs),
        ttfbMs: null,
        tokensIn,
        tokensOut,
        cacheRead,
        cacheWrite,
        tokensTotal: tokensIn != null ? tokensIn + (tokensOut ?? 0) : null,
        costUsd,
        priced,
        errorType: item.ok === false ? 'reported_error' : null,
        errorMessage: item.error ? String(item.error).slice(0, 300) : null,
        simulated: false,
      }),
    );
  }
  respondJson(res, 200, { saved: saved.length });
}

async function jsonBody(req) {
  try {
    const raw = await readBody(req, 1024 * 1024);
    return raw.length ? JSON.parse(raw.toString('utf8')) : {};
  } catch {
    const err = new Error('invalid JSON body');
    err.status = 400;
    throw err;
  }
}

function headerValue(req, name) {
  const v = req.headers[name];
  return Array.isArray(v) ? v[0] : v;
}

function numOrNull(v) {
  // Treat null/undefined/'' as absent - Number(null) is 0, which would otherwise
  // record real usage at $0 and skip the pricing engine.
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function queryObj(url) {
  return Object.fromEntries(url.searchParams.entries());
}

function serveStatic(res, rel) {
  const file = path.join(PUBLIC_DIR, rel);
  if (!file.startsWith(PUBLIC_DIR)) {
    return respondJson(res, 403, { error: { message: 'forbidden' } });
  }
  try {
    const body = fs.readFileSync(file);
    res.writeHead(200, {
      'content-type': MIME[path.extname(file)] || 'application/octet-stream',
      'cache-control': rel.startsWith('vendor/') ? 'public, max-age=86400' : 'no-cache',
    });
    res.end(body);
  } catch {
    respondJson(res, 404, { error: { message: `missing asset: ${rel}` } });
  }
}

export function startGateway(config) {
  const gateway = createGateway(config);
  return new Promise((resolve, reject) => {
    gateway.server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        reject(
          new Error(
            `Port ${config.port} is already in use. Is another AI Command Center running? Try --port <other>.`,
          ),
        );
      } else {
        reject(err);
      }
    });
    gateway.server.listen(config.port, config.host, () => {
      // Discovery file lets `aicc demo/stats/clear` find this gateway even when
      // it runs on a non-default port. Best-effort; removed on close.
      const discovery = path.join(config.dataDir, 'gateway.json');
      try {
        fs.writeFileSync(
          discovery,
          JSON.stringify({
            port: gateway.server.address().port,
            host: config.host,
            pid: process.pid,
            startedAt: Date.now(),
          }),
        );
        gateway.server.once('close', () => {
          try {
            fs.unlinkSync(discovery);
          } catch {
            /* already gone */
          }
        });
      } catch {
        /* discovery is optional */
      }
      resolve(gateway);
    });
  });
}
