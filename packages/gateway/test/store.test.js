import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.js';

test('crash-truncated JSONL: partial trailing line is repaired, next append survives reload', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aicc-store-'));
  const file = path.join(dir, 'events.jsonl');
  // one good record + a partial line with no trailing newline (simulated crash mid-write)
  fs.writeFileSync(file, JSON.stringify({ id: 'a', ts: 1 }) + '\n' + '{"id":"partial","ts');

  const s1 = new Store(dir).init();
  assert.deepEqual(
    s1.records.map((r) => r.id),
    ['a'],
    'partial line skipped on load',
  );
  s1.append({ id: 'c', ts: 3 });
  await s1.flush();

  // reload: the appended record must not have been concatenated onto the fragment
  const s2 = new Store(dir).init();
  assert.deepEqual(s2.records.map((r) => r.id).sort(), ['a', 'c']);
});

test('clear(simulatedOnly) keeps real records', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aicc-store-'));
  const s = new Store(dir).init();
  s.append({ id: 'real', ts: 1, simulated: false });
  s.append({ id: 'demo', ts: 2, simulated: true });
  const removed = s.clear({ simulatedOnly: true });
  await s.flush();
  assert.equal(removed, 1);
  assert.deepEqual(
    s.records.map((r) => r.id),
    ['real'],
  );
  const reloaded = new Store(dir).init();
  assert.deepEqual(
    reloaded.records.map((r) => r.id),
    ['real'],
  );
});
