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
   * @param {object} overrides  config.pricing — merged over the shipped table.
   * Keys: "model-prefix", "provider:model-prefix", or "provider:*".
   * Values: { in, out, cacheRead?, cacheWrite? } — USD per 1M tokens. Null disables a shipped entry.
   */
  constructor(overrides = {}) {
    const shipped = JSON.parse(
      fs.readFileSync(path.join(__dirname, '..', 'pricing', 'pricing.json'), 'utf8'),
    );
    delete shipped._comment;
    this.table = {};
    for (const [key, price] of Object.entries({ ...shipped, ...overrides })) {
      if (price == null) continue;
      this.table[key.toLowerCase()] = price;
    }
    // Longest keys first so the first prefix hit is the most specific one.
    this.keys = Object.keys(this.table).sort((a, b) => b.length - a.length);
  }

  /** Find the price entry for a provider+model, or null. */
  lookup(providerId, model) {
    const norm = normalizeModel(model);
    if (!norm) return null;
    const qualified = `${providerId}:${norm}`;
    for (const key of this.keys) {
      if (key.includes(':')) {
        if (qualified.startsWith(key)) return this.table[key];
      } else if (norm.startsWith(key)) {
        return this.table[key];
      }
    }
    const providerDefault = this.table[`${providerId}:*`];
    return providerDefault || null;
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
