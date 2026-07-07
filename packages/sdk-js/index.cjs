/** CommonJS build of @ai-command-center/sdk — see index.mjs for docs. */
'use strict';

const DEFAULT_GATEWAY = 'http://localhost:4321';

let session = null;

function init({ project = 'default', gateway, check = true } = {}) {
  const gw = (gateway || process.env.AICC_GATEWAY || DEFAULT_GATEWAY).replace(/\/+$/, '');
  const base = `${gw}/p/${encodeURIComponent(project)}`;

  process.env.OPENAI_BASE_URL = `${base}/openai/v1`;
  process.env.ANTHROPIC_BASE_URL = `${base}/anthropic`;
  process.env.GOOGLE_GEMINI_BASE_URL = `${base}/gemini`;

  session = {
    gateway: gw,
    project,
    url(provider) {
      const u = `${base}/${provider}`;
      return provider === 'anthropic' || provider === 'gemini' ? u : `${u}/v1`;
    },
  };

  if (check) {
    fetch(`${gw}/health`, { signal: AbortSignal.timeout(1500) }).catch(() => {
      console.error(
        `[aicc] warning: no AI Command Center gateway at ${gw} — ` +
          `calls will fail until you run: npx ai-command-center start`,
      );
    });
  }
  return session;
}

function url(provider) {
  if (!session) throw new Error('aicc init() has not been called');
  return session.url(provider);
}

async function track(record = {}) {
  const gw = session?.gateway || (process.env.AICC_GATEWAY || DEFAULT_GATEWAY).replace(/\/+$/, '');
  try {
    const res = await fetch(`${gw}/api/track`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        project: session?.project || 'default',
        ts: Date.now(),
        ...record,
      }),
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

module.exports = { init, url, track };
