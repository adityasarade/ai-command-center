import fs from 'node:fs';
import path from 'node:path';

/**
 * Foreign-exchange rates for display currency conversion.
 * All stored/computed costs stay in USD; conversion happens at display time.
 *
 * Rate sources, in order:
 *   1. Manual rates in config (`currency.rates`) - never fetches, never stale.
 *   2. Live fetch (frankfurter.app → open.er-api.com fallback), cached to
 *      dataDir/fx.json and refreshed every 12h.
 *   3. Stale cache from a previous run.
 *   4. Built-in approximate rates (flagged stale so the UI can say so).
 */

const REFRESH_MS = 12 * 3600e3;
const FETCH_TIMEOUT_MS = 5000;

// Safety net only - real values come from the live fetch or config.
const BUILTIN_RATES = { USD: 1, INR: 95.4, EUR: 0.88 };
const BUILTIN_STAMP = '2026-07 approximate';

export class FxService {
  constructor(dataDir, currencyConfig = {}, fetchImpl = fetch) {
    this.cacheFile = path.join(dataDir, 'fx.json');
    this.currencies = currencyConfig.options || ['INR', 'USD', 'EUR'];
    this.manualRates = currencyConfig.rates || null;
    this.fetchImpl = fetchImpl;
    this.state = null;
    this._timer = null;
    // Synchronous cache load so one-shot CLI commands get real rates without a fetch.
    try {
      const cached = JSON.parse(fs.readFileSync(this.cacheFile, 'utf8'));
      if (cached?.rates?.USD === 1) {
        this.state = { ...cached, stale: Date.now() - (cached.fetchedAt || 0) > REFRESH_MS };
      }
    } catch {
      /* no cache yet */
    }
  }

  /** Current best-known rates (synchronous once initialized). */
  get() {
    if (this.manualRates) {
      return {
        base: 'USD',
        rates: { USD: 1, ...this.manualRates },
        source: 'config',
        fetchedAt: null,
        stale: false,
      };
    }
    return (
      this.state || {
        base: 'USD',
        rates: BUILTIN_RATES,
        source: `builtin (${BUILTIN_STAMP})`,
        fetchedAt: null,
        stale: true,
      }
    );
  }

  /** Refresh if due and schedule periodic refreshes (long-running gateway). */
  async init() {
    if (this.manualRates) return this;
    if (!this.state || this.state.stale) await this.refresh();
    this._timer = setInterval(() => this.refresh().catch(() => {}), REFRESH_MS);
    this._timer.unref();
    return this;
  }

  async refresh() {
    if (this.manualRates) return;
    const symbols = this.currencies.filter((c) => c !== 'USD');
    const attempts = [
      {
        source: 'frankfurter.app (ECB)',
        url: `https://api.frankfurter.app/latest?from=USD&to=${symbols.join(',')}`,
        pick: (body) => body?.rates,
      },
      {
        source: 'open.er-api.com',
        url: 'https://open.er-api.com/v6/latest/USD',
        pick: (body) => body?.rates,
      },
    ];
    for (const attempt of attempts) {
      try {
        const res = await this.fetchImpl(attempt.url, {
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
        if (!res.ok) continue;
        const rates = attempt.pick(await res.json());
        if (!rates) continue;
        const filtered = { USD: 1 };
        for (const c of symbols) {
          if (typeof rates[c] === 'number' && rates[c] > 0) filtered[c] = rates[c];
        }
        if (Object.keys(filtered).length < 2) continue;
        this.state = {
          base: 'USD',
          rates: filtered,
          source: attempt.source,
          fetchedAt: Date.now(),
          stale: false,
        };
        try {
          fs.writeFileSync(this.cacheFile, JSON.stringify(this.state));
        } catch {
          /* cache is best-effort */
        }
        return;
      } catch {
        /* try next source */
      }
    }
    // All sources failed - keep whatever we had, mark stale.
    if (this.state) this.state.stale = true;
  }

  stop() {
    if (this._timer) clearInterval(this._timer);
  }
}
