import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { buildProviderTable, parseProxyPath } from './providers.js';
import { PricingEngine } from './pricing.js';
import { Store } from './store.js';
import { FxService } from './fx.js';
import { computeStats, listRequests, listProjects } from './stats.js';
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
};

export function createGateway(config) {
  const table = buildProviderTable(config);
  const pricing = new PricingEngine(config.pricing);
  const store = new Store(config.dataDir).init();
  const fx = new FxService(config.dataDir, config.currency);
  fx.init().catch(() => {}); // non-blocking; get() falls back gracefully meanwhile
  const proxy = createProxyHandler({ table, config, pricing, store });
  const sseClients = new Set();
  const startedAt = Date.now();

  store.on('record', (record) => {
    for (const client of sseClients) {
      client.write(`data: ${JSON.stringify(record)}\n\n`);
    }
  });
  const heartbeat = setInterval(() => {
    for (const client of sseClients) client.write(': ping\n\n');
  }, 25000);
  heartbeat.unref();

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;

    try {
      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
          'access-control-allow-headers': req.headers['access-control-request-headers'] || '*',
          'access-control-max-age': '86400',
        });
        return res.end();
      }

      // ---- dashboard & static assets ----
      if (req.method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
        return serveStatic(res, 'index.html');
      }
      if (req.method === 'GET' && /^\/(app\.js|style\.css|logo\.svg|vendor\/chart\.umd\.js)$/.test(pathname)) {
        return serveStatic(res, pathname.slice(1));
      }

      // ---- gateway API ----
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
      if (pathname === '/api/meta') {
        return respondJson(res, 200, {
          name: 'AI Command Center',
          version: PKG.version,
          startedAt,
          dataDir: config.dataDir,
          currency: config.currency,
          port: config.port,
          providers: Object.fromEntries(
            Object.entries(table).map(([id, p]) => [id, { kind: p.kind, upstream: p.upstream }]),
          ),
          records: store.records.length,
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
        return respondJson(res, 200, computeStats(store.records, queryObj(url)));
      }
      if (pathname === '/api/requests') {
        return respondJson(res, 200, listRequests(store.records, queryObj(url)));
      }
      if (pathname === '/api/projects') {
        return respondJson(res, 200, listProjects(store.records));
      }
      if (pathname === '/api/events') {
        res.writeHead(200, {
          'content-type': 'text/event-stream',
          'cache-control': 'no-cache',
          connection: 'keep-alive',
          'access-control-allow-origin': '*',
        });
        res.write(': connected\n\n');
        sseClients.add(res);
        req.on('close', () => sseClients.delete(res));
        return;
      }
      if (pathname === '/api/track' && req.method === 'POST') {
        return handleTrack(req, res, { store, pricing });
      }
      if (pathname === '/api/demo' && req.method === 'POST') {
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
        const seeded = seedDemo(store, pricing, { days: Number(opts.days) || 14 });
        await store.flush();
        return respondJson(res, 200, { seeded });
      }
      if (pathname === '/api/records' && req.method === 'DELETE') {
        const simulatedOnly = url.searchParams.get('simulated') === '1';
        const removed = store.clear({ simulatedOnly });
        await store.flush();
        return respondJson(res, 200, { removed });
      }

      // ---- LLM proxy ----
      const route = parseProxyPath(pathname, table);
      if (route) {
        return await proxy(req, res, route, url);
      }

      return respondJson(res, 404, {
        error: {
          message: `No route for ${pathname}. Proxy paths look like /openai/v1/chat/completions, /anthropic/v1/messages, /gemini/v1beta/models/... — optionally prefixed with /p/<project-name>. Known providers: ${Object.keys(table).join(', ')}.`,
        },
      });
    } catch (err) {
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

  server.once('close', () => fx.stop());

  return { server, store, table, pricing, fx, config, sseClients };
}

async function handleTrack(req, res, { store, pricing }) {
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
        project: String(item.project || 'default'),
        provider,
        model,
        endpoint: item.endpoint ? String(item.endpoint) : '/api/track',
        method: 'TRACK',
        stream: false,
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

function numOrNull(v) {
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
