import crypto from 'node:crypto';
import { centralKey } from './providers.js';
import {
  SseParser,
  extractFromJson,
  makeStreamAccumulator,
  modelFromRequest,
} from './usage.js';

const MAX_REQUEST_BODY = 50 * 1024 * 1024;
const MAX_PARSE_BUFFER = 20 * 1024 * 1024; // JSON bodies larger than this are piped but not parsed
const UPSTREAM_TIMEOUT_MS = 10 * 60 * 1000;

// Hop-by-hop / recomputed headers never forwarded upstream.
const STRIP_REQUEST_HEADERS = new Set([
  'host',
  'connection',
  'keep-alive',
  'upgrade',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'content-length',
  'accept-encoding',
  'expect',
]);

const STRIP_RESPONSE_HEADERS = new Set([
  'content-encoding',
  'content-length',
  'transfer-encoding',
  'connection',
  'keep-alive',
]);

export function createProxyHandler({ table, config, pricing, store }) {
  return async function handleProxy(req, res, route, url) {
    const provider = table[route.providerId];
    const project = route.project || headerValue(req, 'x-aicc-project') || 'default';
    const startedAt = Date.now();
    const t0 = performance.now();

    // ---- read request body -------------------------------------------------
    let bodyBuffer;
    try {
      bodyBuffer = await readBody(req, MAX_REQUEST_BODY);
    } catch (err) {
      return respondJson(res, err.status || 400, { error: { message: err.message } });
    }

    let requestJson = null;
    const reqContentType = req.headers['content-type'] || '';
    if (bodyBuffer.length && reqContentType.includes('json')) {
      try {
        requestJson = JSON.parse(bodyBuffer.toString('utf8'));
      } catch {
        /* forward as-is; provider will reject if invalid */
      }
    }

    const isStreamRequest =
      requestJson?.stream === true ||
      (provider.kind === 'gemini' && route.rest.includes(':streamGenerateContent'));

    // Ensure streaming chat completions report usage in the final chunk.
    if (
      provider.kind === 'openai' &&
      provider.streamUsageInject &&
      requestJson?.stream === true &&
      requestJson.stream_options == null &&
      route.rest.includes('/chat/completions')
    ) {
      requestJson.stream_options = { include_usage: true };
      bodyBuffer = Buffer.from(JSON.stringify(requestJson), 'utf8');
    }

    // ---- build upstream request --------------------------------------------
    const upstreamUrl = provider.upstream + route.rest + url.search;
    const headers = {};
    for (const [name, value] of Object.entries(req.headers)) {
      if (STRIP_REQUEST_HEADERS.has(name) || name.startsWith('x-aicc-')) continue;
      headers[name] = value;
    }
    headers['accept-encoding'] = 'identity';

    const hasCallerKey =
      headers[provider.authHeader] ||
      headers['authorization'] ||
      headers['x-api-key'] ||
      headers['x-goog-api-key'] ||
      url.searchParams.has('key');
    if (!hasCallerKey) {
      const key = centralKey(provider, config);
      if (key) headers[provider.authHeader] = (provider.authPrefix || '') + key;
    }
    if (provider.kind === 'anthropic' && !headers['anthropic-version']) {
      headers['anthropic-version'] = '2023-06-01';
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(new Error('upstream timeout')), UPSTREAM_TIMEOUT_MS);
    let clientClosed = false;
    res.on('close', () => {
      if (!res.writableEnded) {
        clientClosed = true;
        controller.abort(new Error('client disconnected'));
      }
    });

    const base = {
      id: 'req_' + crypto.randomUUID().replaceAll('-', '').slice(0, 20),
      ts: startedAt,
      project,
      provider: provider.id,
      model: modelFromRequest(provider.kind, requestJson, route.rest),
      endpoint: route.rest,
      method: req.method,
      stream: !!isStreamRequest,
    };

    // ---- call upstream -----------------------------------------------------
    let upstream;
    try {
      upstream = await fetch(upstreamUrl, {
        method: req.method,
        headers,
        body: bodyBuffer.length ? bodyBuffer : undefined,
        signal: controller.signal,
        redirect: 'manual',
      });
    } catch (err) {
      clearTimeout(timeout);
      const message = clientClosed ? 'client disconnected' : `upstream unreachable: ${err.message}`;
      finishRecord({
        base,
        status: 0,
        ok: false,
        ttfbMs: null,
        latencyMs: Math.round(performance.now() - t0),
        usage: null,
        respModel: null,
        errorType: clientClosed ? 'client_abort' : 'network',
        errorMessage: message,
        provider,
        pricing,
        store,
      });
      if (!clientClosed && !res.headersSent) {
        respondJson(res, 502, {
          error: { message: `AI Command Center gateway could not reach ${provider.id} (${upstreamUrl}): ${err.message}` },
        });
      } else {
        res.destroy();
      }
      return;
    }

    // ---- stream response back while tee-parsing ------------------------------
    const respHeaders = {};
    for (const [name, value] of upstream.headers.entries()) {
      if (!STRIP_RESPONSE_HEADERS.has(name)) respHeaders[name] = value;
    }
    respHeaders['access-control-allow-origin'] ??= '*';
    res.writeHead(upstream.status, respHeaders);
    if (typeof res.flushHeaders === 'function') res.flushHeaders();

    const respContentType = upstream.headers.get('content-type') || '';
    const isSse = respContentType.includes('text/event-stream');
    const isJson = respContentType.includes('json');

    const acc = makeStreamAccumulator(provider.kind);
    const sse = isSse ? new SseParser((obj) => acc.feed(obj)) : null;
    const decoder = new TextDecoder('utf8');
    let jsonText = '';
    let parseOverflow = false;
    let ttfbMs = null;
    let aborted = false;

    try {
      if (upstream.body) {
        for await (const chunk of upstream.body) {
          if (ttfbMs === null) ttfbMs = Math.round(performance.now() - t0);
          if (!res.write(chunk)) {
            await new Promise((resolve) => res.once('drain', resolve));
          }
          if (sse) {
            sse.feed(decoder.decode(chunk, { stream: true }));
          } else if (jsonText.length < MAX_PARSE_BUFFER) {
            jsonText += decoder.decode(chunk, { stream: true });
            if (jsonText.length >= MAX_PARSE_BUFFER) parseOverflow = true;
          }
        }
      }
    } catch (err) {
      aborted = true;
      if (!clientClosed) base.streamError = String(err.message || err).slice(0, 200);
    }
    clearTimeout(timeout);
    if (sse) {
      sse.feed(decoder.decode());
      sse.flush();
    }
    res.end();

    // ---- extract usage & log -------------------------------------------------
    let usage = null;
    let respModel = null;
    if (isSse) {
      ({ usage, model: respModel } = acc.result());
    } else if (isJson && jsonText && !parseOverflow) {
      try {
        ({ usage, model: respModel } = extractFromJson(provider.kind, JSON.parse(jsonText)));
      } catch {
        /* unparseable body — leave usage null */
      }
    }

    const ok = upstream.status >= 200 && upstream.status < 300 && !aborted;
    let errorType = null;
    let errorMessage = null;
    if (clientClosed || (aborted && !base.streamError)) {
      errorType = 'client_abort';
      errorMessage = 'client disconnected mid-stream';
    } else if (aborted) {
      errorType = 'stream_error';
      errorMessage = base.streamError;
    } else if (!ok) {
      errorType = 'upstream_error';
      errorMessage = extractErrorMessage(jsonText) || `HTTP ${upstream.status}`;
    }
    delete base.streamError;

    finishRecord({
      base,
      status: upstream.status,
      ok,
      ttfbMs,
      latencyMs: Math.round(performance.now() - t0),
      usage,
      respModel,
      errorType,
      errorMessage,
      provider,
      pricing,
      store,
    });
  };
}

function finishRecord({ base, status, ok, ttfbMs, latencyMs, usage, respModel, errorType, errorMessage, provider, pricing, store }) {
  const model = respModel || base.model;
  let tokens = { tokensIn: null, tokensOut: null, cacheRead: null, cacheWrite: null, tokensTotal: null };
  let costUsd = null;
  let priced = null;
  if (usage) {
    const tokensIn = usage.inputUncached + usage.cacheRead + usage.cacheWrite;
    tokens = {
      tokensIn,
      tokensOut: usage.output,
      cacheRead: usage.cacheRead,
      cacheWrite: usage.cacheWrite,
      tokensTotal: tokensIn + usage.output,
    };
    ({ costUsd, priced } = pricing.cost(provider.id, model, usage));
  }
  store.append({
    ...base,
    model,
    status,
    ok,
    latencyMs,
    ttfbMs,
    ...tokens,
    costUsd,
    priced,
    errorType,
    errorMessage: errorMessage ? String(errorMessage).slice(0, 300) : null,
    simulated: false,
  });
}

function extractErrorMessage(text) {
  if (!text) return null;
  try {
    const obj = JSON.parse(text);
    return (
      obj?.error?.message ||
      obj?.message ||
      (Array.isArray(obj) && obj[0]?.error?.message) ||
      null
    );
  } catch {
    return text.slice(0, 200);
  }
}

function headerValue(req, name) {
  const v = req.headers[name];
  return Array.isArray(v) ? v[0] : v;
}

export function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        const err = new Error('request body too large');
        err.status = 413;
        req.destroy();
        reject(err);
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export function respondJson(res, status, obj) {
  const body = JSON.stringify(obj, null, 2);
  res.writeHead(status, {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
  });
  res.end(body);
}
