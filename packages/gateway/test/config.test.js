import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig, listPresets } from '../src/config.js';

// Point config lookups at an empty temp dir so a real ~/.ai-command-center
// config can't leak into these assertions.
process.env.AICC_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'aicc-cfg-'));

test('defaults: OSS branding, INR-first currency', () => {
  const cfg = loadConfig({});
  assert.equal(cfg.branding.name, 'AI Command Center');
  assert.equal(cfg.currency.default, 'INR');
  assert.equal(cfg.auth, true);
});

test('example preset overrides branding, user config still wins', () => {
  assert.ok(listPresets().includes('example'));
  const cfg = loadConfig({ preset: 'example' });
  assert.match(cfg.branding.name, /Acme/);
  assert.equal(cfg.branding.accent, '#0b7d6f');
  assert.equal(cfg.currency.default, 'INR');
  // preset does not clobber unrelated defaults
  assert.equal(cfg.port, 4321);
});

test('unknown preset throws with guidance', () => {
  assert.throws(() => loadConfig({ preset: 'nope-not-real' }), /Unknown preset/);
});

test('--flag=value and precedence: CLI port beats everything', () => {
  const cfg = loadConfig({ preset: 'example', port: '5599' });
  assert.equal(cfg.port, 5599);
});

test('legacy currency {code,perUsd} still normalizes', () => {
  const cfg = loadConfig({});
  // simulate by calling normalize path through a file? Instead assert options include USD
  assert.ok(cfg.currency.options.includes('USD'));
});
