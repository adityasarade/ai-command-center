/**
 * Pure text builders for the CLI (bin/aicc.js). They live in src/ so tests can
 * import them without executing the CLI's command dispatch.
 * Color functions are injected; everything degrades to plain text.
 */
/** Integer with thousands separators: 8762 → "8,762". */
export function fmtInt(n) {
  return Math.trunc(Number(n) || 0).toLocaleString('en-US');
}

/**
 * The banner's "also:" provider list - every provider reachable through the
 * gateway beyond the three headline examples, with config-registered ones
 * marked so a typo'd registration is visible at startup.
 */
export function providerAlsoList(table) {
  const headline = new Set(['openai', 'anthropic', 'gemini']);
  return Object.entries(table)
    .filter(([id]) => !headline.has(id))
    .map(([id, p]) => (p.fromConfig ? `${id} (custom)` : id))
    .join(', ');
}

/** Proxy base path for a provider: OpenAI-kind endpoints hang off /v1. */
export function providerBasePath(p) {
  return p.kind === 'openai' ? `/${p.id}/v1` : `/${p.id}`;
}

export function snippetsText(
  url,
  project,
  {
    bold: b = (s) => s,
    cyan: cy = (s) => s,
    dim: d = (s) => s,
    seg,
    keyHeader = null,
    customProviders = [],
  } = {},
) {
  seg ||= `p/${encodeURIComponent(project)}`;
  const base = `${url}/${seg}`;
  const keyed = seg.startsWith('k/');
  const trackAuth = keyHeader
    ? ` \\\n    -H "x-aicc-key: ${keyHeader}"`
    : keyed
      ? ' \\\n    -H "x-aicc-key: <gateway-key>"'
      : '';
  const customBlock = customProviders.length
    ? `
${b('Custom providers')} ${d('(registered in your aicc config)')}
${customProviders
  .map(
    (p) =>
      `  ${b(p.id)} ${d(`- ${p.kind}-kind → ${p.upstream}`)}\n` +
      `    ${cy(`base URL: ${base}${providerBasePath(p)}`)}`,
  )
  .join('\n')}
  ${d('Custom-provider models are usually missing from the public price sheet, so their')}
  ${d('requests are recorded unpriced (cost 0) until you add a "pricing" block for them')}
  ${d('in your config - e.g. "pricing": { "my-model": { "in": 1.0, "out": 4.0 } }.')}
`
    : '';
  return `
${b('── Plug any project into AI Command Center ──────────────────────────')}

${b('Zero-code (any language)')} ${d('- just point the SDK at the gateway via env vars:')}
  ${cy(`export OPENAI_BASE_URL="${base}/openai/v1"`)}
  ${cy(`export ANTHROPIC_BASE_URL="${base}/anthropic"`)}
  ${d('Your provider API keys stay exactly where they are - the gateway passes them through.')}
${customBlock}
${b('Python (OpenAI SDK)')}
  from openai import OpenAI
  client = OpenAI(base_url="${base}/openai/v1")

${b('Python (Anthropic SDK)')}
  from anthropic import Anthropic
  client = Anthropic(base_url="${base}/anthropic")

${b('Python (google-genai)')}
  from google import genai
  client = genai.Client(http_options={"base_url": "${base}/gemini"})

${b('JavaScript / TypeScript')}
  import OpenAI from "openai";
  const client = new OpenAI({ baseURL: "${base}/openai/v1" });

${b('Java (openai-java)')}
  OpenAIClient client = OpenAIOkHttpClient.builder()
      .fromEnv().baseUrl("${base}/openai/v1").build();

${b('LangChain (Python)')}
  llm = ChatOpenAI(base_url="${base}/openai/v1")

${b('curl')}
  curl ${base}/openai/v1/chat/completions \\
    -H "Authorization: Bearer $OPENAI_API_KEY" -H "Content-Type: application/json" \\
    -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"hi"}]}'

${b('Anything else (batch jobs, unsupported providers)')} ${d('- report usage directly:')}
  curl -X POST ${url}/api/track -H "Content-Type: application/json"${trackAuth} \\
    -d '{"project":"${project}","provider":"openai","model":"gpt-4o-mini","tokensIn":1200,"tokensOut":300}'

${
  keyed
    ? d('The gateway key in the URL both authenticates the call and assigns it to your project.')
    : d(
        `Replace "${project}" with your project name - that's how calls are grouped on the dashboard.`,
      ) +
      '\n' +
      d('Alternative to path prefix: send header  x-aicc-project: ' + project)
}
`;
}
