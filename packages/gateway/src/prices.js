import fs from 'node:fs';
import path from 'node:path';

/**
 * Keeps model prices current from the community-maintained LiteLLM price sheet
 * (US prices), so the shipped defaults never silently drift.
 *
 * Same shape as the FX service:
 *   1. Config overrides (`config.pricing`) always win - set in the PricingEngine.
 *   2. Live fetch of the LiteLLM sheet, converted to our per-1M-token table,
 *      cached to dataDir/prices.json and refreshed daily.
 *   3. Stale cache from a previous run.
 *   4. The shipped, hand-curated pricing.json (offline / never-fetched fallback).
 *
 * Set config.pricingUrl to null to disable live pricing entirely.
 */

const REFRESH_MS = 24 * 3600e3;
const FETCH_TIMEOUT_MS = 15000;

// LiteLLM litellm_provider → our provider id (for provider-qualified keys).
const PROVIDER_MAP = {
  openai: 'openai',
  azure: 'openai',
  text_completion_openai: 'openai',
  anthropic: 'anthropic',
  gemini: 'gemini',
  vertex_ai: 'gemini',
  'vertex_ai-language-models': 'gemini',
  mistral: 'mistral',
  deepseek: 'deepseek',
  groq: 'groq',
  together_ai: 'together',
  openrouter: 'openrouter',
  xai: 'xai',
  ollama: 'ollama',
};

export class PricingService {
  constructor(dataDir, { url, refreshMs = REFRESH_MS, fetchImpl = fetch } = {}) {
    this.cacheFile = path.join(dataDir, 'prices.json');
    this.url = url;
    this.refreshMs = refreshMs;
    this.fetchImpl = fetchImpl;
    this.market = null;
    this.fetchedAt = 0;
    this._timer = null;
    try {
      const cached = JSON.parse(fs.readFileSync(this.cacheFile, 'utf8'));
      if (cached?.prices && typeof cached.prices === 'object') {
        this.market = cached.prices;
        this.fetchedAt = cached.fetchedAt || 0;
      }
    } catch {
      /* no cache yet - the engine's shipped defaults are the fallback */
    }
  }

  /** Apply the cached table now, then refresh if due and schedule daily refreshes. */
  async init(engine) {
    if (this.market) engine.setMarket(this.market);
    if (!this.url) return this;
    if (!this.market || Date.now() - this.fetchedAt > this.refreshMs) {
      await this.refresh(engine);
    }
    this._timer = setInterval(() => this.refresh(engine).catch(() => {}), this.refreshMs);
    this._timer.unref();
    return this;
  }

  async refresh(engine) {
    if (!this.url) return;
    const res = await this.fetchImpl(this.url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`prices HTTP ${res.status}`);
    const market = convertLiteLLM(await res.json());
    if (Object.keys(market).length === 0) throw new Error('prices sheet looked empty');
    this.market = market;
    this.fetchedAt = Date.now();
    engine.setMarket(market);
    try {
      fs.writeFileSync(
        this.cacheFile,
        JSON.stringify({ fetchedAt: this.fetchedAt, prices: market }),
      );
    } catch {
      /* cache is best-effort */
    }
  }

  stop() {
    if (this._timer) clearInterval(this._timer);
  }
}

/**
 * Convert the LiteLLM sheet (cost PER TOKEN) into our table (USD per 1M tokens),
 * keyed by plain model name plus a provider-qualified key for mapped providers.
 */
export function convertLiteLLM(raw) {
  const out = {};
  const M = 1e6;
  for (const [key, v] of Object.entries(raw || {})) {
    if (key === 'sample_spec' || !v || typeof v !== 'object') continue;
    if (typeof v.input_cost_per_token !== 'number') continue; // text models only
    const price = { in: v.input_cost_per_token * M, out: (v.output_cost_per_token || 0) * M };
    if (typeof v.cache_read_input_token_cost === 'number') {
      price.cacheRead = v.cache_read_input_token_cost * M;
    }
    if (typeof v.cache_creation_input_token_cost === 'number') {
      price.cacheWrite = v.cache_creation_input_token_cost * M;
    }
    const model = key.slice(key.lastIndexOf('/') + 1).toLowerCase();
    if (!model) continue;
    out[model] = price; // plain key - last write wins on cross-provider collisions
    const ours = PROVIDER_MAP[v.litellm_provider];
    if (ours) out[`${ours}:${model}`] = price; // qualified key wins for that provider
  }
  return out;
}
