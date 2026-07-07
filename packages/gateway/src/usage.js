/**
 * Token-usage extraction for the three API schemas the gateway understands.
 *
 * Normalized usage shape (token counts):
 *   { inputUncached, cacheRead, cacheWrite, output }
 * Provider billing semantics differ — normalization happens here so the
 * pricing engine can stay provider-agnostic:
 *   - OpenAI:    prompt_tokens INCLUDES cached_tokens → inputUncached = prompt - cached
 *   - Anthropic: input_tokens EXCLUDES cache reads/writes (separate fields)
 *   - Gemini:    promptTokenCount INCLUDES cachedContentTokenCount; thinking tokens billed as output
 */

export function fromOpenAIUsage(u) {
  if (!u) return null;
  const input = u.prompt_tokens ?? u.input_tokens ?? 0;
  const output = u.completion_tokens ?? u.output_tokens ?? 0;
  const cached =
    u.prompt_tokens_details?.cached_tokens ?? u.input_tokens_details?.cached_tokens ?? 0;
  return {
    inputUncached: Math.max(0, input - cached),
    cacheRead: cached,
    cacheWrite: 0,
    output,
  };
}

export function fromAnthropicUsage(u) {
  if (!u) return null;
  return {
    inputUncached: u.input_tokens ?? 0,
    cacheRead: u.cache_read_input_tokens ?? 0,
    cacheWrite: u.cache_creation_input_tokens ?? 0,
    output: u.output_tokens ?? 0,
  };
}

export function fromGeminiUsage(u) {
  if (!u) return null;
  const prompt = u.promptTokenCount ?? 0;
  const cached = u.cachedContentTokenCount ?? 0;
  return {
    inputUncached: Math.max(0, prompt - cached),
    cacheRead: cached,
    cacheWrite: 0,
    output: (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0),
  };
}

/** Extract { usage, model } from a complete (non-streaming) JSON response body. */
export function extractFromJson(kind, obj) {
  if (!obj || typeof obj !== 'object') return { usage: null, model: null };
  if (kind === 'anthropic') {
    return { usage: fromAnthropicUsage(obj.usage), model: obj.model ?? null };
  }
  if (kind === 'gemini') {
    // Non-SSE streamGenerateContent returns a JSON array of chunks.
    if (Array.isArray(obj)) {
      const acc = makeStreamAccumulator('gemini');
      for (const chunk of obj) acc.feed(chunk);
      return acc.result();
    }
    return { usage: fromGeminiUsage(obj.usageMetadata), model: obj.modelVersion ?? null };
  }
  // openai kind — chat.completions / embeddings ({usage}), or Responses API ({response:{usage}}
  // never appears non-streaming, but usage/model live at the top level there too).
  const usage = obj.usage ? fromOpenAIUsage(obj.usage) : null;
  return { usage, model: obj.model ?? null };
}

/**
 * Accumulator fed one parsed SSE data object at a time; result() gives the
 * final { usage, model } once the stream ends.
 */
export function makeStreamAccumulator(kind) {
  if (kind === 'anthropic') {
    let base = null;
    let model = null;
    let lastDelta = null;
    return {
      feed(obj) {
        if (!obj || typeof obj !== 'object') return;
        if (obj.type === 'message_start' && obj.message) {
          base = obj.message.usage ?? base;
          model = obj.message.model ?? model;
        } else if (obj.type === 'message_delta' && obj.usage) {
          lastDelta = obj.usage; // cumulative totals
        }
      },
      result() {
        if (!base && !lastDelta) return { usage: null, model };
        const merged = { ...(base || {}), ...(lastDelta || {}) };
        return { usage: fromAnthropicUsage(merged), model };
      },
    };
  }

  if (kind === 'gemini') {
    let meta = null;
    let model = null;
    return {
      feed(obj) {
        if (!obj || typeof obj !== 'object') return;
        if (obj.usageMetadata) {
          // Field-wise merge: later chunks may omit fields present earlier.
          meta = { ...(meta || {}), ...obj.usageMetadata };
        }
        if (obj.modelVersion) model = obj.modelVersion;
      },
      result() {
        return { usage: meta ? fromGeminiUsage(meta) : null, model };
      },
    };
  }

  // openai kind — chat chunks carry usage:null until the final chunk
  // (with stream_options.include_usage). Groq nests it in x_groq.usage.
  // The Responses API emits events with {response:{usage, model}}.
  let rawUsage = null;
  let model = null;
  return {
    feed(obj) {
      if (!obj || typeof obj !== 'object') return;
      const u = obj.usage ?? obj.response?.usage ?? obj.x_groq?.usage;
      if (u) rawUsage = u;
      const m = obj.model ?? obj.response?.model;
      if (m) model = m;
    },
    result() {
      return { usage: rawUsage ? fromOpenAIUsage(rawUsage) : null, model };
    },
  };
}

/** Pull the model out of a request (JSON body or, for Gemini, the URL path). */
export function modelFromRequest(kind, body, pathname) {
  if (kind === 'gemini') {
    const m = /\/models\/([^:/?]+)/.exec(pathname || '');
    return m ? m[1] : null;
  }
  return body && typeof body === 'object' ? (body.model ?? null) : null;
}

/** Incremental SSE parser: feed() decoded text, get JSON `data:` payloads via callback. */
export class SseParser {
  constructor(onData) {
    this.buf = '';
    this.onData = onData;
  }

  feed(text) {
    this.buf += text;
    // Guard against pathological unbounded buffering of a single event.
    if (this.buf.length > 4 * 1024 * 1024) this.buf = this.buf.slice(-2 * 1024 * 1024);
    for (;;) {
      const m = /\r?\n\r?\n/.exec(this.buf);
      if (!m) break;
      const rawEvent = this.buf.slice(0, m.index);
      this.buf = this.buf.slice(m.index + m[0].length);
      this._emit(rawEvent);
    }
  }

  flush() {
    if (this.buf.trim()) this._emit(this.buf);
    this.buf = '';
  }

  _emit(rawEvent) {
    const dataLines = [];
    for (const line of rawEvent.split(/\r?\n/)) {
      if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^ /, ''));
    }
    if (!dataLines.length) return;
    const data = dataLines.join('\n');
    if (data === '[DONE]') return;
    try {
      this.onData(JSON.parse(data));
    } catch {
      /* non-JSON data payloads are ignored */
    }
  }
}
