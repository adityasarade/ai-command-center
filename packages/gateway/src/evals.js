import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { centralKey } from './providers.js';
import { extractFromJson } from './usage.js';

/**
 * Offline, dataset-driven quality evals - zero dependency, no live-traffic capture.
 *
 * A dataset is a list of { input, expected? } rows (test cases you own). A run
 * takes a prompt template, a target model, and a judge model; for each row it
 * asks the target for an answer, asks the judge to score it 1-5 against a fixed
 * rubric, and records the result. Runs are tagged with a prompt name + version
 * so the Prompts view can show average quality per version next to cost/latency.
 *
 * Storage (all under dataDir/evals/):
 *   datasets/<name>.json   a { rows: [...] } test set
 *   runs.jsonl             one line per scored row
 */

const MAX_ROWS_PER_RUN = 200;
const RUN_CONCURRENCY = 4;
const DATASET_NAME = /^[a-zA-Z0-9._-]{1,64}$/;

const JUDGE_SYSTEM =
  'You are a strict evaluator. Score the assistant answer from 1 (poor) to 5 (excellent) ' +
  'for correctness, relevance and clarity. Respond ONLY with JSON: {"score": <1-5 integer>, "reason": "<short>"}.';

export class Evals {
  constructor(dataDir) {
    this.dir = path.join(dataDir, 'evals');
    this.datasetsDir = path.join(this.dir, 'datasets');
    this.runsFile = path.join(this.dir, 'runs.jsonl');
    fs.mkdirSync(this.datasetsDir, { recursive: true });
    this.rows = [];
    this._chain = Promise.resolve();
    if (fs.existsSync(this.runsFile)) {
      for (const line of fs.readFileSync(this.runsFile, 'utf8').split('\n')) {
        if (!line.trim()) continue;
        try {
          this.rows.push(JSON.parse(line));
        } catch {
          /* skip corrupt line */
        }
      }
    }
  }

  // ---- datasets ----------------------------------------------------------
  listDatasets() {
    let files = [];
    try {
      files = fs.readdirSync(this.datasetsDir).filter((f) => f.endsWith('.json'));
    } catch {
      /* none yet */
    }
    return files
      .map((f) => {
        const name = f.replace(/\.json$/, '');
        const rows = this.getDataset(name);
        return { name, rows: rows.length };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  getDataset(name) {
    if (!DATASET_NAME.test(name)) return [];
    try {
      const data = JSON.parse(fs.readFileSync(path.join(this.datasetsDir, `${name}.json`), 'utf8'));
      return Array.isArray(data.rows) ? data.rows : [];
    } catch {
      return [];
    }
  }

  saveDataset(name, rows) {
    if (!DATASET_NAME.test(String(name || ''))) {
      throw httpError(400, 'dataset name: letters, digits, . _ - (max 64)');
    }
    if (!Array.isArray(rows) || rows.length === 0)
      throw httpError(400, 'rows must be a non-empty array');
    if (rows.length > MAX_ROWS_PER_RUN)
      throw httpError(400, `max ${MAX_ROWS_PER_RUN} rows per dataset`);
    const clean = rows
      .map((r) => ({
        input: String(r?.input ?? '').slice(0, 8000),
        ...(r?.expected != null ? { expected: String(r.expected).slice(0, 8000) } : {}),
      }))
      .filter((r) => r.input);
    if (!clean.length) throw httpError(400, 'every row needs a non-empty "input"');
    const file = path.join(this.datasetsDir, `${name}.json`);
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({ rows: clean, updatedAt: Date.now() }, null, 2));
    fs.renameSync(tmp, file);
    return { name, rows: clean.length };
  }

  deleteDataset(name) {
    if (!DATASET_NAME.test(name)) throw httpError(400, 'invalid dataset name');
    try {
      fs.unlinkSync(path.join(this.datasetsDir, `${name}.json`));
    } catch {
      throw httpError(404, 'no such dataset');
    }
  }

  // ---- run rows ----------------------------------------------------------
  appendRows(rows) {
    if (!rows.length) return;
    for (const r of rows) this.rows.push(r);
    const lines = rows.map((r) => JSON.stringify(r)).join('\n') + '\n';
    this._chain = this._chain
      .then(() => fs.promises.appendFile(this.runsFile, lines, 'utf8'))
      .catch((err) => console.error(`[aicc] failed to persist eval rows: ${err.message}`));
  }

  flush() {
    return this._chain;
  }

  /** One summary per run (newest first). */
  runs() {
    const map = new Map();
    for (const r of this.rows) {
      let run = map.get(r.runId);
      if (!run) {
        run = {
          runId: r.runId,
          ts: r.ts,
          dataset: r.dataset,
          prompt: r.prompt,
          promptVersion: r.promptVersion,
          target: r.target,
          judge: r.judge,
          rows: 0,
          scored: 0,
          scoreSum: 0,
          errors: 0,
          costUsd: 0,
        };
        map.set(r.runId, run);
      }
      run.rows += 1;
      run.ts = Math.min(run.ts, r.ts);
      if (r.score != null) {
        run.scored += 1;
        run.scoreSum += r.score;
      }
      if (!r.ok) run.errors += 1;
      run.costUsd += (r.targetCostUsd || 0) + (r.judgeCostUsd || 0);
    }
    return [...map.values()]
      .map((r) => ({
        runId: r.runId,
        ts: r.ts,
        dataset: r.dataset,
        prompt: r.prompt,
        promptVersion: r.promptVersion,
        target: r.target,
        judge: r.judge,
        rows: r.rows,
        errors: r.errors,
        avgScore: r.scored ? r.scoreSum / r.scored : null,
        costUsd: r.costUsd,
      }))
      .sort((a, b) => b.ts - a.ts);
  }

  /** Rows for one run (for drill-down). */
  runRows(runId) {
    return this.rows.filter((r) => r.runId === runId);
  }

  /** Average score keyed by "prompt␟version", for joining onto the Prompts view. */
  scoreByPrompt() {
    const map = new Map();
    for (const r of this.rows) {
      if (r.score == null || !r.prompt) continue;
      const key = r.prompt + '␟' + (r.promptVersion || '-');
      const agg = map.get(key) || { sum: 0, n: 0 };
      agg.sum += r.score;
      agg.n += 1;
      map.set(key, agg);
    }
    const out = {};
    for (const [key, { sum, n }] of map) out[key] = { avgScore: sum / n, scored: n };
    return out;
  }
}

/**
 * Execute an eval run. Returns the run summary. Errors on a missing dataset or
 * a missing central key for a provider (evals need operator keys - they call
 * models directly, there is no caller key to pass through).
 */
export async function runEval(evals, { config, table, pricing }, params, signal) {
  const dataset = String(params.dataset || '');
  const rows = evals.getDataset(dataset);
  if (!rows.length) throw httpError(400, `dataset "${dataset}" is empty or missing`);

  const target = resolveModel(table, params.target, 'target');
  const judge = resolveModel(table, params.judge, 'judge');
  for (const m of [target, judge]) {
    if (!centralKey(m.provider, config)) {
      throw httpError(
        400,
        `configure a central key for "${m.provider.id}" (config.keys.${m.provider.id}) to run evals`,
      );
    }
  }

  const promptTemplate = String(params.promptTemplate || '{{input}}');
  const rubric = String(params.rubric || '').slice(0, 2000);
  const promptLabel = params.prompt ? String(params.prompt).slice(0, 120) : dataset;
  const promptVersion = params.promptVersion ? String(params.promptVersion).slice(0, 40) : null;
  const runId = 'run_' + crypto.randomUUID().replaceAll('-', '').slice(0, 16);
  const ts = Date.now();
  const capped = rows.slice(0, MAX_ROWS_PER_RUN);

  const results = await mapPool(capped, RUN_CONCURRENCY, async (row) => {
    const filled = promptTemplate.includes('{{input}}')
      ? promptTemplate.replaceAll('{{input}}', row.input)
      : `${promptTemplate}\n\n${row.input}`;
    const answer = await completeText({
      provider: target.provider,
      model: target.model,
      prompt: filled,
      config,
      pricing,
      signal,
    });
    let score = null;
    let reason = '';
    let judgeCostUsd = null;
    if (answer.ok) {
      const judgePrompt =
        `Task input:\n${row.input}\n\nAssistant answer:\n${answer.text}\n` +
        (row.expected ? `\nReference answer:\n${row.expected}\n` : '') +
        (rubric ? `\nExtra rubric:\n${rubric}\n` : '') +
        `\nScore the assistant answer now.`;
      const verdict = await completeText({
        provider: judge.provider,
        model: judge.model,
        prompt: judgePrompt,
        system: JUDGE_SYSTEM,
        json: judge.provider.kind === 'openai' || judge.provider.kind === 'gemini',
        config,
        pricing,
        signal,
      });
      judgeCostUsd = verdict.costUsd;
      ({ score, reason } = parseScore(verdict.ok ? verdict.text : ''));
      if (!verdict.ok) reason = `judge error: ${verdict.error}`;
    }
    return {
      runId,
      ts,
      dataset,
      prompt: promptLabel,
      promptVersion,
      target: { provider: target.provider.id, model: target.model },
      judge: { provider: judge.provider.id, model: judge.model },
      input: row.input.slice(0, 4000),
      output: (answer.text || '').slice(0, 4000),
      expected: row.expected ? row.expected.slice(0, 4000) : null,
      score,
      reason: String(reason || '').slice(0, 400),
      ok: answer.ok,
      error: answer.ok ? null : answer.error,
      targetCostUsd: answer.costUsd,
      judgeCostUsd,
      latencyMs: answer.latencyMs,
    };
  });

  evals.appendRows(results);
  await evals.flush();
  const scored = results.filter((r) => r.score != null);
  return {
    runId,
    dataset,
    prompt: promptLabel,
    promptVersion,
    rows: results.length,
    errors: results.filter((r) => !r.ok).length,
    avgScore: scored.length ? scored.reduce((s, r) => s + r.score, 0) / scored.length : null,
    costUsd: results.reduce((s, r) => s + (r.targetCostUsd || 0) + (r.judgeCostUsd || 0), 0),
  };
}

function resolveModel(table, spec, label) {
  const providerId = spec?.provider;
  const model = spec?.model;
  if (!providerId || !model) throw httpError(400, `${label} needs { provider, model }`);
  const provider = table[providerId];
  if (!provider) throw httpError(400, `${label}: unknown provider "${providerId}"`);
  return { provider, model: String(model) };
}

/** Single-turn completion against one provider, returning text + cost. */
async function completeText({ provider, model, prompt, system, json, config, pricing, signal }) {
  const t0 = performance.now();
  const key = centralKey(provider, config);
  const headers = { 'content-type': 'application/json' };
  let url;
  let body;
  if (provider.kind === 'anthropic') {
    url = provider.upstream + '/v1/messages';
    headers['anthropic-version'] = '2023-06-01';
    if (key) headers['x-api-key'] = key;
    body = { model, max_tokens: 1024, messages: [{ role: 'user', content: prompt }] };
    if (system) body.system = system;
  } else if (provider.kind === 'gemini') {
    const q = key ? `?key=${encodeURIComponent(key)}` : '';
    url = provider.upstream + `/v1beta/models/${encodeURIComponent(model)}:generateContent` + q;
    body = { contents: [{ parts: [{ text: (system ? system + '\n\n' : '') + prompt }] }] };
    if (json) body.generationConfig = { responseMimeType: 'application/json' };
  } else {
    url = provider.upstream + '/v1/chat/completions';
    if (key)
      headers[provider.authHeader || 'authorization'] = (provider.authPrefix || 'Bearer ') + key;
    const messages = [];
    if (system) messages.push({ role: 'system', content: system });
    messages.push({ role: 'user', content: prompt });
    body = { model, messages };
    if (json) body.response_format = { type: 'json_object' };
  }

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal,
      redirect: 'manual',
    });
  } catch (err) {
    return {
      ok: false,
      text: '',
      error: `unreachable: ${err.message}`,
      costUsd: null,
      latencyMs: Math.round(performance.now() - t0),
    };
  }
  const raw = await res.text().catch(() => '');
  let data = null;
  try {
    data = JSON.parse(raw);
  } catch {
    /* non-JSON */
  }
  const latencyMs = Math.round(performance.now() - t0);
  if (!res.ok) {
    return {
      ok: false,
      text: '',
      error: data?.error?.message || `HTTP ${res.status}`,
      costUsd: null,
      latencyMs,
    };
  }
  let costUsd = null;
  try {
    const { usage, model: rm } = extractFromJson(provider.kind, data);
    if (usage) ({ costUsd } = pricing.cost(provider.id, rm || model, usage));
  } catch {
    /* leave cost null */
  }
  return { ok: true, text: extractText(provider.kind, data), costUsd, latencyMs };
}

function extractText(kind, data) {
  if (!data) return '';
  if (kind === 'anthropic') {
    return (data.content || [])
      .map((b) => b.text)
      .filter(Boolean)
      .join('');
  }
  if (kind === 'gemini') {
    return (data.candidates?.[0]?.content?.parts || [])
      .map((p) => p.text)
      .filter(Boolean)
      .join('');
  }
  return data.choices?.[0]?.message?.content || '';
}

/** Lenient score parse: prefer JSON {score,reason}, fall back to a bare 1-5. */
function parseScore(text) {
  if (!text) return { score: null, reason: 'no judge output' };
  let obj = null;
  try {
    obj = JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        obj = JSON.parse(m[0]);
      } catch {
        /* fall through */
      }
    }
  }
  if (obj && obj.score != null) {
    const s = Number(obj.score);
    if (Number.isFinite(s)) {
      return { score: Math.max(1, Math.min(5, Math.round(s))), reason: String(obj.reason || '') };
    }
  }
  const n = text.match(/\b([1-5])\b/);
  if (n) return { score: Number(n[1]), reason: text.slice(0, 300) };
  return { score: null, reason: text.slice(0, 200) };
}

/** Run tasks with bounded concurrency, preserving input order. */
async function mapPool(items, concurrency, fn) {
  const out = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return out;
}

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}
