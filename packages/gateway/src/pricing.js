import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Normalize a model name for pricing lookup:
 * lowercase, strip a leading "models/" (Gemini paths), strip "-latest",
 * strip trailing date stamps like -20250514 / -2024-08-06 / @20240229.
 */
export function normalizeModel(model) {
  if (!model) return '';
  let m = String(model).toLowerCase().trim();
  m = m.replace(/^models\//, '');
  m = m.replace(/[-@]latest$/, '');
  m = m.replace(/[-@](\d{8}|\d{4}-\d{2}-\d{2})$/, '');
  return m;
}

export class PricingEngine {
  /**
   * @param {object} overrides  config.pricing - merged over the shipped table.
   * Keys: "model-prefix", "provider:model-prefix", or "provider:*".
   * Values: { in, out, cacheRead?, cacheWrite? } - USD per 1M tokens. Null disables a shipped entry.
   */
  constructor(overrides = {}) {
    const shipped = JSON.parse(
      fs.readFileSync(path.join(__dirname, '..', 'pricing', 'pricing.json'), 'utf8'),
    );
    delete shipped._comment;
    // Three layers, lowest → highest precedence:
    //   shipped defaults  <  live market prices (LiteLLM sheet)  <  config overrides.
    // Market prices keep the table current; config always wins for deliberate overrides.
    this.shipped = lowerKeys(shipped);
    this.overrides = lowerKeys(overrides);
    this.market = {};
    this._rebuild();
  }

  /** Merge in a fresh market price table (USD per 1M tokens), then rebuild. */
  setMarket(market = {}) {
    this.market = lowerKeys(market);
    this._rebuild();
  }

  _rebuild() {
    this.table = {};
    for (const [key, price] of Object.entries({
      ...this.shipped,
      ...this.market,
      ...this.overrides,
    })) {
      if (price == null) continue; // a null in any layer disables a shipped entry
      this.table[key] = price;
    }
    // Parse keys into {provider, modelPrefix}. Sort by modelPrefix length so the
    // most specific model match wins - and crucially compare the MODEL part only,
    // not including any "provider:" qualifier (else "openai:gpt-4o" would out-rank
    // and wrongly capture "gpt-4o-mini"). Qualified keys win length ties.
    this.entries = Object.keys(this.table)
      .map((key) => {
        const idx = key.indexOf(':');
        return idx === -1
          ? { key, provider: null, modelPrefix: key }
          : { key, provider: key.slice(0, idx), modelPrefix: key.slice(idx + 1) };
      })
      .filter((e) => e.modelPrefix !== '*') // provider-wide defaults handled separately
      .sort((a, b) => b.modelPrefix.length - a.modelPrefix.length || (a.provider ? -1 : 1));
  }

  /** Find the price entry for a provider+model, or null. */
  lookup(providerId, model) {
    const norm = normalizeModel(model);
    if (!norm) return null;
    const wildcard = this.table[`${providerId}:*`];
    if (wildcard != null) {
      // A provider-wide default (e.g. "ollama:*") is a deliberate policy: only a
      // provider-qualified entry for this provider may override it; generic
      // cross-provider plain keys (a colliding cloud model name) are ignored.
      for (const e of this.entries) {
        if (e.provider === providerId && norm.startsWith(e.modelPrefix)) return this.table[e.key];
      }
      return wildcard;
    }
    // Otherwise: most-specific model prefix wins across qualified + plain keys
    // (entries are pre-sorted by model-part length, qualified beating plain on ties),
    // so "openai:gpt-4o" can't capture the longer, more specific "gpt-4o-mini".
    for (const e of this.entries) {
      if (e.provider && e.provider !== providerId) continue;
      if (norm.startsWith(e.modelPrefix)) return this.table[e.key];
    }
    return null;
  }

  /**
   * Cost in USD for normalized usage:
   * { inputUncached, cacheRead, cacheWrite, output } (token counts).
   * Returns { costUsd, priced }.  Unknown model → { costUsd: null, priced: false }.
   */
  cost(providerId, model, usage) {
    const price = this.lookup(providerId, model);
    if (!price) return { costUsd: null, priced: false };
    const per = (tokens, rate) => ((tokens || 0) * (rate || 0)) / 1e6;
    const costUsd =
      per(usage.inputUncached, price.in) +
      per(usage.cacheRead, price.cacheRead ?? price.in) +
      per(usage.cacheWrite, price.cacheWrite ?? price.in) +
      per(usage.output, price.out);
    return { costUsd, priced: true };
  }
}

function lowerKeys(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) out[k.toLowerCase()] = v;
  return out;
}
