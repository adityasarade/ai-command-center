/**
 * Provider registry.
 *
 * `kind` decides how requests/responses are parsed for usage:
 *   - 'openai'    : OpenAI schema (chat/completions, responses, embeddings) - also used
 *                   by every OpenAI-compatible provider (OpenRouter, Mistral, Groq, Ollama…)
 *   - 'anthropic' : Anthropic Messages API
 *   - 'gemini'    : Google Generative Language API
 *
 * `authHeader` is the header the provider expects its API key in; used when the gateway
 * injects a centrally-configured key (pass-through of caller headers always wins).
 * `streamUsageInject` - inject `stream_options: {include_usage: true}` into streaming
 * chat.completions requests so the final SSE chunk carries token usage.
 */
export const BUILTIN_PROVIDERS = {
  openai: {
    kind: 'openai',
    upstream: 'https://api.openai.com',
    authHeader: 'authorization',
    authPrefix: 'Bearer ',
    keyEnv: 'OPENAI_API_KEY',
    streamUsageInject: true,
  },
  anthropic: {
    kind: 'anthropic',
    upstream: 'https://api.anthropic.com',
    authHeader: 'x-api-key',
    keyEnv: 'ANTHROPIC_API_KEY',
  },
  gemini: {
    kind: 'gemini',
    upstream: 'https://generativelanguage.googleapis.com',
    authHeader: 'x-goog-api-key',
    keyEnv: 'GEMINI_API_KEY',
  },
  openrouter: {
    kind: 'openai',
    upstream: 'https://openrouter.ai/api',
    authHeader: 'authorization',
    authPrefix: 'Bearer ',
    keyEnv: 'OPENROUTER_API_KEY',
    streamUsageInject: true,
  },
  mistral: {
    kind: 'openai',
    upstream: 'https://api.mistral.ai',
    authHeader: 'authorization',
    authPrefix: 'Bearer ',
    keyEnv: 'MISTRAL_API_KEY',
  },
  deepseek: {
    kind: 'openai',
    upstream: 'https://api.deepseek.com',
    authHeader: 'authorization',
    authPrefix: 'Bearer ',
    keyEnv: 'DEEPSEEK_API_KEY',
    streamUsageInject: true,
  },
  xai: {
    kind: 'openai',
    upstream: 'https://api.x.ai',
    authHeader: 'authorization',
    authPrefix: 'Bearer ',
    keyEnv: 'XAI_API_KEY',
    streamUsageInject: true,
  },
  groq: {
    kind: 'openai',
    upstream: 'https://api.groq.com/openai',
    authHeader: 'authorization',
    authPrefix: 'Bearer ',
    keyEnv: 'GROQ_API_KEY',
    streamUsageInject: true,
  },
  together: {
    kind: 'openai',
    upstream: 'https://api.together.xyz',
    authHeader: 'authorization',
    authPrefix: 'Bearer ',
    keyEnv: 'TOGETHER_API_KEY',
    streamUsageInject: true,
  },
  ollama: {
    kind: 'openai',
    upstream: 'http://localhost:11434',
    authHeader: 'authorization',
    authPrefix: 'Bearer ',
    local: true,
    streamUsageInject: true,
  },
};

/** Build the effective provider table from built-ins + config. */
export function buildProviderTable(config) {
  const table = {};
  for (const [id, p] of Object.entries(BUILTIN_PROVIDERS)) {
    table[id] = { id, ...p };
    const override = config.upstreams?.[id];
    if (override) table[id].upstream = String(override).replace(/\/+$/, '');
  }
  for (const [id, p] of Object.entries(config.providers || {})) {
    if (!p || !p.upstream) continue;
    table[id] = {
      id,
      kind: p.kind || 'openai',
      upstream: String(p.upstream).replace(/\/+$/, ''),
      authHeader: p.authHeader || 'authorization',
      authPrefix: p.authHeader && p.authHeader !== 'authorization' ? '' : 'Bearer ',
      key: p.key,
      keyEnv: p.keyEnv,
      streamUsageInject: p.streamUsageInject !== false,
    };
  }
  return table;
}

/** Resolve a centrally-configured key for a provider, if any. */
export function centralKey(provider, config) {
  if (config.keys?.[provider.id]) return config.keys[provider.id];
  if (provider.key) return provider.key;
  if (provider.keyEnv && process.env[provider.keyEnv]) return process.env[provider.keyEnv];
  return null;
}

const DEFAULT_RETRY_ON = [429, 500, 502, 503, 504];

/**
 * Build the routing table from config.routes. A route is a virtual provider
 * that fans a request out across an ordered pool of real providers, opt-in:
 *
 *   "routes": {
 *     "chat": {
 *       "members": ["groq", "together", "openrouter"],
 *       "strategy": "failover",          // or "round-robin"
 *       "retryOn": [429, 500, 502, 503, 504]
 *     }
 *   }
 *
 * Reached at /r/<route>/<rest> (e.g. /r/chat/v1/chat/completions), optionally
 * behind /k/<key> or /p/<project>. Members should be same-schema (all the same
 * `kind`) so the untouched request body works against each - the gateway does
 * NOT translate between provider schemas. Members whose id is unknown are
 * dropped; a route with no resolvable members is skipped (and reported).
 */
export function buildRoutes(config, table) {
  const routes = {};
  const warnings = [];
  for (const [name, r] of Object.entries(config.routes || {})) {
    if (!/^[a-zA-Z0-9._-]{1,64}$/.test(name)) {
      warnings.push(`route "${name}": invalid name (letters, digits, . _ - only) - skipped`);
      continue;
    }
    if (table[name]) {
      warnings.push(`route "${name}": shadows a provider id - reach it at /r/${name}/…`);
    }
    if (!r || !Array.isArray(r.members) || r.members.length === 0) {
      warnings.push(`route "${name}": needs a non-empty "members" array - skipped`);
      continue;
    }
    const members = [];
    for (const id of r.members) {
      if (table[id]) members.push(table[id]);
      else warnings.push(`route "${name}": unknown member provider "${id}" - dropped`);
    }
    if (!members.length) {
      warnings.push(`route "${name}": no valid members - skipped`);
      continue;
    }
    const kinds = new Set(members.map((m) => m.kind));
    if (kinds.size > 1) {
      warnings.push(
        `route "${name}": mixes provider kinds (${[...kinds].join(', ')}); fallback only works across same-schema providers, so requests may fail on the odd one out`,
      );
    }
    const retryOn = new Set(
      (Array.isArray(r.retryOn) ? r.retryOn : DEFAULT_RETRY_ON).map(Number).filter(Number.isFinite),
    );
    routes[name] = {
      name,
      members,
      retryOn,
      strategy: r.strategy === 'round-robin' ? 'round-robin' : 'failover',
    };
  }
  return { routes, warnings };
}

/**
 * Parse an incoming proxy path.
 *   /k/<gateway-key>/<provider>/<rest...>   (auth enabled)
 *   /p/<project>/<provider>/<rest...>       (project attribution)
 *   /<provider>/<rest...>
 * Prefixes may combine as /k/<key>/p/<project>/... (the key still decides
 * attribution once auth is locked). Returns { key, project, providerId, rest }
 * or null when the provider segment matches nothing (caller 404s with help).
 */
export function parseProxyPath(pathname, table, routes = {}) {
  let project = null;
  let key = null;
  let segments = pathname.replace(/^\/+/, '').split('/');
  if (segments[0] === 'k' && segments.length >= 3) {
    key = decodeURIComponent(segments[1]);
    segments = segments.slice(2);
  }
  if (segments[0] === 'p' && segments.length >= 3) {
    project = decodeURIComponent(segments[1]);
    segments = segments.slice(2);
  }
  // Virtual route: /r/<route>/<rest…> fans out across the route's member pool.
  if (segments[0] === 'r' && segments.length >= 3 && routes[decodeURIComponent(segments[1])]) {
    const routeName = decodeURIComponent(segments[1]);
    const rest = '/' + segments.slice(2).join('/');
    return { key, project, routeName, rest };
  }
  const providerId = segments[0];
  if (!providerId || !table[providerId]) return null;
  const rest = '/' + segments.slice(1).join('/');
  return { key, project, providerId, rest };
}
