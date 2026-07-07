/**
 * @ai-command-center/sdk — thin client for AI Command Center.
 *
 *   import { init } from '@ai-command-center/sdk';
 *   init({ project: 'support-bot' });      // BEFORE creating clients
 *
 *   import OpenAI from 'openai';
 *   const client = new OpenAI();           // unchanged code, now fully tracked
 *
 * Only sets standard env vars (OPENAI_BASE_URL, ANTHROPIC_BASE_URL,
 * GOOGLE_GEMINI_BASE_URL). API keys are untouched — the gateway passes them through.
 */

const DEFAULT_GATEWAY = 'http://localhost:4321';

let session = null;

export function init({ project = 'default', gateway, check = true } = {}) {
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

export function url(provider) {
  if (!session) throw new Error('aicc init() has not been called');
  return session.url(provider);
}

/** Report usage the gateway can't see (batch jobs, exotic providers). Never throws. */
export async function track(record = {}) {
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
