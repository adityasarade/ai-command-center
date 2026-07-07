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
  // Never let an upstream's CORS headers reach the browser - the gateway sets its own.
  'access-control-allow-origin',
  'access-control-allow-credentials',
  'access-control-expose-headers',
  'vary',
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
    // We inject stream_options ourselves, so we must also strip the resulting
    // usage-only chunk from what the client sees (it never opted in).
    let injectedStreamUsage = false;
    if (
      provider.kind === 'openai' &&
      provider.streamUsageInject &&
      requestJson?.stream === true &&
      requestJson.stream_options == null &&
      route.rest.includes('/chat/completions')
    ) {
      requestJson.stream_options = { include_usage: true };
      bodyBuffer = Buffer.from(JSON.stringify(requestJson), 'utf8');
      injectedStreamUsage = true;
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
    // Only inject a central/operator key for trusted callers. Untrusted
    // cross-origin browser requests are already rejected before reaching here,
    // so this is defense-in-depth against the confused-deputy attack.
    if (!hasCallerKey && !route.untrustedOrigin) {
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
    // CORS was already applied to `res` by the server (per-origin); don't override.
    res.writeHead(upstream.status, respHeaders);
    if (typeof res.flushHeaders === 'function') res.flushHeaders();

    const respContentType = upstream.headers.get('content-type') || '';
    const isSse = respContentType.includes('text/event-stream');
    const isJson = respContentType.includes('json');
    // When WE injected stream_options, filter the usage-only chunk back out so
    // the proxy stays transparent for clients that never opted in.
    const filterInjected = injectedStreamUsage && isSse;

    const acc = makeStreamAccumulator(provider.kind);
    const sse = isSse && !filterInjected ? new SseParser((obj) => acc.feed(obj)) : null;
    const relay = filterInjected ? makeInjectedUsageRelay((obj) => acc.feed(obj)) : null;
    const decoder = new TextDecoder('utf8');
    let jsonText = '';
    let parseOverflow = false;
    let ttfbMs = null;
    let aborted = false;

    // Resolves on drain OR client teardown, so a mid-stream abort under
    // backpressure never hangs the handler forever.
    const writeChunk = async (data) => {
      if (data == null || data.length === 0) return true;
      if (res.destroyed) return false;
      if (!res.write(data)) {
        await new Promise((resolve) => {
          const done = () => {
            res.off('drain', done);
            res.off('close', done);
            resolve();
          };
          res.once('drain', done);
          res.once('close', done);
        });
      }
      return !res.destroyed && !clientClosed;
    };

    try {
      if (upstream.body) {
        for await (const chunk of upstream.body) {
          if (ttfbMs === null) ttfbMs = Math.round(performance.now() - t0);
          timeout.refresh(); // treat the cap as an idle timeout, not total-duration
          if (relay) {
            const forward = relay.feed(decoder.decode(chunk, { stream: true }));
            if (!(await writeChunk(forward))) break;
          } else {
            if (!(await writeChunk(chunk))) break;
            if (sse) {
              sse.feed(decoder.decode(chunk, { stream: true }));
            } else if (jsonText.length < MAX_PARSE_BUFFER) {
              jsonText += decoder.decode(chunk, { stream: true });
              if (jsonText.length >= MAX_PARSE_BUFFER) parseOverflow = true;
            }
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
    if (relay && !res.destroyed) {
      const tail = relay.flush();
      if (tail) res.write(tail);
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
        /* unparseable body - leave usage null */
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

/**
 * SSE relay for the case where the gateway injected stream_options.include_usage:
 * feed every event's data to the usage accumulator, but forward every event to
 * the client EXCEPT the final usage-only chunk ({choices: [], usage: {...}}),
 * which the client never asked for and which crashes naive `choices[0]` readers.
 * Returns the (string) bytes to forward for each feed().
 */
function makeInjectedUsageRelay(onData) {
  let buf = '';
  const parseEvent = (event) => {
    const dataLines = [];
    for (const line of event.split(/\r?\n/)) {
      if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^ /, ''));
    }
    if (!dataLines.length) return undefined;
    const data = dataLines.join('\n');
    if (data === '[DONE]') return undefined;
    try {
      return JSON.parse(data);
    } catch {
      return undefined;
    }
  };
  const isUsageOnly = (obj) =>
    obj && typeof obj === 'object' && Array.isArray(obj.choices) && obj.choices.length === 0 && obj.usage != null;
  return {
    feed(text) {
      buf += text;
      let out = '';
      for (;;) {
        const m = /\r?\n\r?\n/.exec(buf);
        if (!m) break;
        const event = buf.slice(0, m.index);
        const delim = m[0];
        buf = buf.slice(m.index + delim.length);
        const obj = parseEvent(event);
        if (obj !== undefined) onData(obj);
        if (!isUsageOnly(obj)) out += event + delim; // forward all but the usage-only chunk
      }
      return out;
    },
    flush() {
      const rest = buf;
      buf = '';
      return rest;
    },
  };
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
  // CORS (if any) is set per-origin on `res` by the server before this runs.
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(body);
}
