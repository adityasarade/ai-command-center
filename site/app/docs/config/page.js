import { CodeBlock } from '../../components/CodeBlock';
import { DocFoot } from '../DocFoot';

export const metadata = { title: 'Configuration' };

export default function Page() {
  return (
    <>
      <h1>Configuration</h1>
      <p className="lead">
        Everything is optional - the defaults are sensible. Config is layered, so you only set what
        you need.
      </p>

      <h2>Where config comes from</h2>
      <p>Lowest to highest precedence (higher wins):</p>
      <CodeBlock
        lang="text"
        label="precedence"
        code={`defaults
  < preset (--preset / AICC_PRESET)
  < ~/.ai-command-center/config.json
  < ./aicc.config.json
  < --config <file>
  < environment variables
  < CLI flags`}
      />

      <h2>Full config reference</h2>
      <CodeBlock
        lang="jsonc"
        code={`{
  "port": 4321,
  "host": "127.0.0.1",              // 0.0.0.0 to share on a LAN/server
  "auth": true,                     // false = no login / no gateway keys

  // Browser origins allowed to call the gateway cross-origin (web apps calling
  // the proxy from the browser). Same-origin + server-side apps never need this.
  "allowedOrigins": [],

  // OPTIONAL central provider keys - injected only when the caller sends none
  // (and never for untrusted cross-origin requests). Callers' own keys win.
  "keys": { "openai": "sk-...", "anthropic": "sk-ant-..." },

  // Custom OpenAI-compatible providers (Azure OpenAI, vLLM, internal gateways…)
  "providers": {
    "azure": { "upstream": "https://x.openai.azure.com", "kind": "openai", "authHeader": "api-key" }
  },

  // Point a built-in provider elsewhere (region endpoint, test double)
  "upstreams": { "openai": "http://localhost:8080" },

  // Opt-in provider routing: fail over / load-balance across a same-schema pool.
  // Reached at /r/<route>/… . strategy: "failover" (default) or "round-robin".
  "routes": {
    "chat": { "members": ["groq", "together", "openrouter"], "retryOn": [429, 500, 502, 503, 504] }
  },

  // Extend/override pricing (USD per 1M tokens, longest-prefix match;
  // "provider:*" sets a provider-wide default). These always win.
  "pricing": { "my-finetune": { "in": 1.0, "out": 4.0 } },

  // Live prices are pulled from the LiteLLM sheet (US), cached + refreshed daily,
  // with the shipped table as the offline fallback. Set to null to disable.
  "pricingUrl": "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json",

  // Optional retention: prune request records older than N days (null = keep all)
  "retentionDays": null,

  // Display currency (data is always stored in USD; converted at display time)
  "currency": { "default": "INR", "options": ["INR", "USD", "EUR"], "rates": null },

  // Dashboard/CLI branding (see presets for a company build)
  "branding": { "name": "AI Command Center", "accent": "#3987e5", "tagline": "..." }
}`}
      />

      <h2>Environment variables</h2>
      <table>
        <thead>
          <tr>
            <th>Var</th>
            <th>Purpose</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>AICC_PORT</code>
            </td>
            <td>Gateway port</td>
          </tr>
          <tr>
            <td>
              <code>AICC_HOST</code>
            </td>
            <td>Bind host</td>
          </tr>
          <tr>
            <td>
              <code>AICC_DATA_DIR</code>
            </td>
            <td>Telemetry directory</td>
          </tr>
          <tr>
            <td>
              <code>AICC_PRESET</code>
            </td>
            <td>Config preset name</td>
          </tr>
          <tr>
            <td>
              <code>AICC_GATEWAY</code>
            </td>
            <td>Gateway origin (used by the SDKs/examples)</td>
          </tr>
          <tr>
            <td>
              <code>AICC_KEY</code>
            </td>
            <td>Project gateway key (used by the SDKs when auth is on)</td>
          </tr>
        </tbody>
      </table>

      <h2>Presets &amp; company builds</h2>
      <p>
        A preset seeds branding/currency/etc. that your own config still overrides. This is how the
        same codebase serves both an open-source default and a company build:
      </p>
      <CodeBlock
        lang="bash"
        code={`npx ai-command-center start --preset example
# or in a config file:  { "preset": "example", "keys": { ... } }`}
      />
      <p>
        Add your own under <code>presets/&lt;name&gt;.json</code> - the format is just a partial
        config.
      </p>

      <h2>Currency &amp; exchange rates</h2>
      <p>
        Costs are stored in USD and converted for display. Rates are refreshed every 12 hours (ECB
        via frankfurter.app, with an open.er-api.com fallback and a built-in offline fallback) and
        cached in your data dir. Pin them yourself to skip fetching entirely:
      </p>
      <CodeBlock
        lang="jsonc"
        code={`"currency": { "default": "INR", "options": ["INR","USD","EUR"], "rates": { "INR": 84, "EUR": 0.92 } }`}
      />

      <DocFoot />
    </>
  );
}
