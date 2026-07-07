import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';

/**
 * Append-only JSONL store with an in-memory copy for querying.
 * One line per request record. Zero external dependencies, safe for
 * MVP-scale volumes (hundreds of thousands of records).
 */
export class Store extends EventEmitter {
  constructor(dataDir) {
    super();
    this.dataDir = dataDir;
    this.file = path.join(dataDir, 'events.jsonl');
    this.records = [];
    this._chain = Promise.resolve(); // serializes file appends/rewrites
  }

  init() {
    fs.mkdirSync(this.dataDir, { recursive: true });
    if (fs.existsSync(this.file)) {
      const raw = fs.readFileSync(this.file, 'utf8');
      // Repair a crash-truncated file (last line lacks a trailing newline):
      // truncate back to the last complete record so the next append doesn't
      // concatenate onto — and silently lose — a partial line.
      if (raw.length && !raw.endsWith('\n')) {
        const lastNl = raw.lastIndexOf('\n');
        try {
          fs.truncateSync(this.file, lastNl + 1);
        } catch {
          /* best effort */
        }
      }
      for (const line of raw.split('\n')) {
        if (!line.trim()) continue;
        try {
          this.records.push(JSON.parse(line));
        } catch {
          /* skip corrupt lines */
        }
      }
      this.records.sort((a, b) => a.ts - b.ts);
    }
    return this;
  }

  append(record) {
    this.records.push(record);
    const line = JSON.stringify(record) + '\n';
    this._chain = this._chain
      .then(() => fs.promises.appendFile(this.file, line, 'utf8'))
      .catch((err) => console.error(`[aicc] failed to persist record: ${err.message}`));
    this.emit('record', record);
    return record;
  }

  appendMany(records) {
    if (!records.length) return;
    // Avoid `push(...records)` — spreading a large array overflows the call stack.
    for (const r of records) this.records.push(r);
    const lines = records.map((r) => JSON.stringify(r)).join('\n') + '\n';
    this._chain = this._chain
      .then(() => fs.promises.appendFile(this.file, lines, 'utf8'))
      .catch((err) => console.error(`[aicc] failed to persist records: ${err.message}`));
  }

  /** Remove records; simulatedOnly limits the purge to demo data. Rewrites the file atomically. */
  clear({ simulatedOnly = false } = {}) {
    const kept = simulatedOnly ? this.records.filter((r) => !r.simulated) : [];
    const removed = this.records.length - kept.length;
    this.records = kept;
    const body = kept.map((r) => JSON.stringify(r)).join('\n') + (kept.length ? '\n' : '');
    this._chain = this._chain.then(async () => {
      const tmp = this.file + '.tmp';
      await fs.promises.writeFile(tmp, body, 'utf8');
      await fs.promises.rename(tmp, this.file);
    });
    return removed;
  }

  /** Wait for pending writes (used by CLI one-shots and tests). */
  flush() {
    return this._chain;
  }
}
