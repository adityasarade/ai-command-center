import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FxService } from '../src/fx.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'aicc-fx-'));

test('manual rates from config: no fetch, never stale', async () => {
  let fetched = false;
  const fx = new FxService(tmp(), { rates: { INR: 80, EUR: 0.9 } }, async () => {
    fetched = true;
    throw new Error('should not fetch');
  });
  await fx.init();
  const state = fx.get();
  assert.equal(state.source, 'config');
  assert.equal(state.rates.INR, 80);
  assert.equal(state.rates.USD, 1);
  assert.equal(state.stale, false);
  assert.equal(fetched, false);
});

test('live fetch: primary source used, cached to disk, cache read back synchronously', async () => {
  const dir = tmp();
  const fx = new FxService(dir, { options: ['INR', 'USD', 'EUR'] }, async (url) => {
    assert.match(url, /frankfurter/);
    return { ok: true, json: async () => ({ rates: { INR: 88.5, EUR: 0.95 } }) };
  });
  await fx.init();
  fx.stop();
  const state = fx.get();
  assert.equal(state.rates.INR, 88.5);
  assert.equal(state.stale, false);
  assert.match(state.source, /frankfurter/);

  // A fresh instance (e.g. a CLI one-shot) reads the cache without any fetch.
  const fx2 = new FxService(dir, { options: ['INR', 'USD', 'EUR'] }, async () => {
    throw new Error('no fetch expected');
  });
  assert.equal(fx2.get().rates.INR, 88.5);
});

test('primary fails → fallback source; all fail → builtin flagged stale', async () => {
  const dir = tmp();
  const fx = new FxService(dir, {}, async (url) => {
    if (url.includes('frankfurter')) throw new Error('down');
    return { ok: true, json: async () => ({ rates: { INR: 83, EUR: 0.91, JPY: 150 } }) };
  });
  await fx.init();
  fx.stop();
  assert.equal(fx.get().rates.INR, 83);
  assert.equal(fx.get().rates.JPY, undefined, 'only configured currencies kept');
  assert.match(fx.get().source, /er-api/);

  const fx3 = new FxService(tmp(), {}, async () => {
    throw new Error('offline');
  });
  await fx3.init();
  fx3.stop();
  assert.equal(fx3.get().stale, true);
  assert.ok(fx3.get().rates.INR > 0, 'builtin fallback still provides a rate');
});
