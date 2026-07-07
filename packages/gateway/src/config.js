import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const DEFAULT_PORT = 4321;

export function defaultDataDir() {
  return process.env.AICC_DATA_DIR || path.join(os.homedir(), '.ai-command-center');
}

const DEFAULTS = {
  port: DEFAULT_PORT,
  host: '127.0.0.1',
  dataDir: defaultDataDir(),
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
  // Display currency for the dashboard (data is always stored in USD).
  // e.g. { "code": "INR", "perUsd": 84 }
  currency: { code: 'USD', perUsd: 1 },
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

/**
 * Load config with precedence (lowest → highest):
 *   defaults < ~/.ai-command-center/config.json < ./aicc.config.json < --config file < env < CLI flags
 */
export function loadConfig(flags = {}) {
  const layers = [DEFAULTS];

  const homeCfg = readJsonIfExists(path.join(defaultDataDir(), 'config.json'));
  if (homeCfg) layers.push(homeCfg);

  const cwdCfg = readJsonIfExists(path.resolve(process.cwd(), 'aicc.config.json'));
  if (cwdCfg) layers.push(cwdCfg);

  if (flags.config) {
    const fileCfg = readJsonIfExists(path.resolve(flags.config));
    if (!fileCfg) throw new Error(`Config file not found: ${flags.config}`);
    layers.push(fileCfg);
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
  layers.push(cli);

  const cfg = layers.reduce((acc, layer) => merge(acc, layer), {});
  if (!Number.isInteger(cfg.port) || cfg.port < 0 || cfg.port > 65535) {
    throw new Error(`Invalid port: ${cfg.port}`);
  }
  return cfg;
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
