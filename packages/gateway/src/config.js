import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PRESETS_DIR = path.join(__dirname, '..', 'presets');

export const DEFAULT_PORT = 4321;

export function defaultDataDir() {
  return process.env.AICC_DATA_DIR || path.join(os.homedir(), '.ai-command-center');
}

const DEFAULTS = {
  port: DEFAULT_PORT,
  host: '127.0.0.1',
  dataDir: defaultDataDir(),
  // Auth lifecycle: open until the first admin account exists, locked after.
  // Set false (or start with --no-auth) to disable the auth system entirely.
  auth: true,
  // Browser origins allowed to call the gateway cross-origin (e.g. a web app
  // that talks to the proxy from the browser). Same-origin + non-browser
  // callers never need this. '*' allows any origin (not recommended).
  allowedOrigins: [],
  // Central provider keys (optional). Pass-through of the caller's own key always wins.
  // e.g. { "openai": "sk-...", "anthropic": "sk-ant-..." }
  keys: {},
  // Custom OpenAI-compatible providers:
  // e.g. { "my-azure": { "upstream": "https://x.openai.azure.com", "kind": "openai", "authHeader": "api-key" } }
  providers: {},
  // Override the upstream base URL of a built-in provider (testing, Azure, region endpoints):
  // e.g. { "openai": "http://localhost:9999" }
  upstreams: {},
  // Pricing overrides / additions, USD per 1M tokens, longest-prefix match on model name.
  // e.g. { "my-finetune": { "in": 1.0, "out": 4.0 }, "openrouter:*": { "in": 0, "out": 0 } }
  pricing: {},
  // Display currency (data is always stored in USD; conversion is display-time).
  // default: initial dashboard currency; options: toggle choices;
  // rates: optional manual { INR: 84, EUR: 0.92 } - set it to skip live FX fetching.
  currency: { default: 'INR', options: ['INR', 'USD', 'EUR'], rates: null },
  // Dashboard/CLI branding - override for a company build (see presets/).
  branding: {
    name: 'AI Command Center',
    short: 'AICC',
    tagline: 'One gateway, every AI project, one dashboard.',
    accent: '#3987e5',
    productUrl: 'https://github.com/adityasarade/ai-command-center',
  },
};

function readJsonIfExists(file) {
  try {
    const raw = fs.readFileSync(file, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw new Error(`Failed to read config ${file}: ${err.message}`);
  }
}

/** List the built-in preset names (files in presets/). */
export function listPresets() {
  try {
    return fs.readdirSync(PRESETS_DIR).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''));
  } catch {
    return [];
  }
}

function loadPreset(name) {
  const file = path.join(PRESETS_DIR, `${path.basename(name)}.json`);
  const preset = readJsonIfExists(file);
  if (!preset) {
    throw new Error(`Unknown preset "${name}". Available: ${listPresets().join(', ') || '(none)'}`);
  }
  return preset;
}

/**
 * Load config with precedence (lowest → highest):
 *   defaults < preset < ~/.ai-command-center/config.json < ./aicc.config.json < --config file < env < CLI flags
 * A preset (company build) is chosen via --preset, $AICC_PRESET, or a "preset"
 * key in any config file; it seeds branding/currency/etc. that user config overrides.
 */
export function loadConfig(flags = {}) {
  const layers = [DEFAULTS];

  // Resolve the preset name from flags/env, or from a "preset" key in a config file.
  const homeCfgRaw = readJsonIfExists(path.join(defaultDataDir(), 'config.json'));
  const cwdCfgRaw = readJsonIfExists(path.resolve(process.cwd(), 'aicc.config.json'));
  const fileCfgRaw = flags.config ? readJsonIfExists(path.resolve(flags.config)) : null;
  const presetName =
    flags.preset ||
    process.env.AICC_PRESET ||
    fileCfgRaw?.preset ||
    cwdCfgRaw?.preset ||
    homeCfgRaw?.preset ||
    null;
  if (presetName) layers.push(loadPreset(presetName));

  if (homeCfgRaw) layers.push(homeCfgRaw);
  if (cwdCfgRaw) layers.push(cwdCfgRaw);
  if (flags.config) {
    if (!fileCfgRaw) throw new Error(`Config file not found: ${flags.config}`);
    layers.push(fileCfgRaw);
  }

  const env = {};
  if (process.env.AICC_PORT) env.port = Number(process.env.AICC_PORT);
  if (process.env.AICC_HOST) env.host = process.env.AICC_HOST;
  if (process.env.AICC_DATA_DIR) env.dataDir = process.env.AICC_DATA_DIR;
  layers.push(env);

  const cli = {};
  if (flags.port != null) cli.port = Number(flags.port);
  if (flags.host != null) cli.host = flags.host;
  if (flags.dataDir != null) cli.dataDir = path.resolve(flags.dataDir);
  if (flags.noAuth) cli.auth = false;
  layers.push(cli);

  const cfg = layers.reduce((acc, layer) => merge(acc, layer), {});
  if (!Number.isInteger(cfg.port) || cfg.port < 0 || cfg.port > 65535) {
    throw new Error(`Invalid port: ${cfg.port}`);
  }
  normalizeCurrency(cfg);
  return cfg;
}

/** Back-compat: accept the earlier { code, perUsd } currency shape. */
function normalizeCurrency(cfg) {
  const cur = (cfg.currency ??= {});
  if (cur.code && !cur.default) {
    cur.default = cur.code;
    if (cur.perUsd && cur.code !== 'USD') {
      cur.rates = { ...(cur.rates || {}), [cur.code]: cur.perUsd };
    }
  }
  cur.default ||= 'INR';
  cur.options ||= ['INR', 'USD', 'EUR'];
  if (!cur.options.includes(cur.default)) cur.options.unshift(cur.default);
  if (!cur.options.includes('USD')) cur.options.push('USD');
}

function merge(base, extra) {
  const out = { ...base };
  for (const [k, v] of Object.entries(extra || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && typeof base[k] === 'object' && !Array.isArray(base[k])) {
      out[k] = { ...base[k], ...v };
    } else if (v !== undefined) {
      out[k] = v;
    }
  }
  return out;
}
