import { CodeBlock } from '../../components/CodeBlock';
import { DocFoot } from '../DocFoot';

export const metadata = { title: 'Providers & pricing' };

export default function Page() {
  return (
    <>
      <h1>Providers &amp; pricing</h1>
      <p className="lead">
        Built-in support for the major providers plus anything that speaks the OpenAI schema.
      </p>

      <h2>Built-in providers</h2>
      <table>
        <thead>
          <tr>
            <th>Route prefix</th>
            <th>Upstream</th>
            <th>Parsing</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>/openai</code>
            </td>
            <td>api.openai.com</td>
            <td>chat, responses, embeddings - stream + non-stream, cached tokens</td>
          </tr>
          <tr>
            <td>
              <code>/anthropic</code>
            </td>
            <td>api.anthropic.com</td>
            <td>messages - stream + non-stream, cache read/write</td>
          </tr>
          <tr>
            <td>
              <code>/gemini</code>
            </td>
            <td>generativelanguage.googleapis.com</td>
            <td>generateContent + streamGenerateContent, thinking tokens</td>
          </tr>
          <tr>
            <td>
              <code>/openrouter</code> <code>/mistral</code> <code>/deepseek</code>{' '}
              <code>/xai</code> <code>/groq</code> <code>/together</code>
            </td>
            <td>respective APIs</td>
            <td>OpenAI-compatible</td>
          </tr>
          <tr>
            <td>
              <code>/ollama</code>
            </td>
            <td>localhost:11434</td>
            <td>OpenAI-compatible; priced $0 by default</td>
          </tr>
        </tbody>
      </table>

      <h2>Add a custom provider</h2>
      <p>Anything OpenAI-compatible (Azure OpenAI, vLLM, an internal gateway) works via config:</p>
      <CodeBlock
        lang="jsonc"
        code={`"providers": {
  "azure":  { "upstream": "https://myorg.openai.azure.com", "kind": "openai", "authHeader": "api-key" },
  "vllm":   { "upstream": "http://gpu-box:8000", "kind": "openai" }
}
// then call:  http://localhost:4321/p/my-app/azure/v1/chat/completions`}
      />
      <p>
        Registered providers show up in the <code>start</code> banner (marked <em>custom</em>, with
        their upstream and where the API key comes from) and in{' '}
        <code>npx ai-command-center snippets</code> - if yours is missing there, the registration
        did not take (typo in the config, or the wrong config file picked up).
      </p>
      <p>
        <strong>Custom providers need pricing overrides.</strong> Cost is looked up on the live
        LiteLLM price sheet plus the shipped table - both only know mainstream cloud models. Models
        served by a custom provider (an internal fine-tune, a regional provider&apos;s{' '}
        <code>*-instruct</code> models, every Azure deployment alias) are usually absent, so their
        requests are recorded with full token counts but <em>unpriced</em> (cost 0) until a{' '}
        <code>pricing</code> block covers them. Pair every custom provider with its prices:
      </p>
      <CodeBlock
        lang="jsonc"
        code={`"providers": {
  "sarvam": { "upstream": "https://api.sarvam.ai", "kind": "openai", "keyEnv": "SARVAM_API_KEY" }
},
"pricing": {
  "sarvam-m": { "in": 0.8, "out": 1.6 },   // USD per 1M tokens
  "saarika":  { "in": 0.5, "out": 0.5 }
}`}
      />
      <p>
        A provider-wide wildcard like{' '}
        <code>&quot;sarvam:*&quot;: &#123; &quot;in&quot;: 0, &quot;out&quot;: 0 &#125;</code> is a
        deliberate <em>policy</em>, not a fallback: once set, only provider-qualified entries (
        <code>&quot;sarvam:sarvam-m&quot;: …</code>) override it - plain model keys for that
        provider are ignored. Use it to price a whole provider at zero (e.g. self-hosted), qualified
        keys plus the wildcard if you want per-model prices with a default underneath.
      </p>
      <p>
        <code>npx ai-command-center stats</code> tells you when this is needed - it prints the
        unpriced request count <em>and the exact model names</em> to add overrides for.
      </p>

      <h2>How streaming usage is captured</h2>
      <p>
        Streaming responses are passed through byte-for-byte while usage is parsed on the side. For
        OpenAI-style streams the gateway quietly adds{' '}
        <code>stream_options: &#123;include_usage: true&#125;</code>
        so the final chunk carries token counts - and then strips that extra usage-only chunk back
        out, so clients that never asked for it still see a normal stream.
      </p>

      <h2>Pricing</h2>
      <p>
        Cost is computed from real token counts against a shipped price table (
        <code>pricing/pricing.json</code>, USD per 1M tokens, longest-prefix match on the model
        name). Prices <em>drift</em> - the table ships as a sane default; verify against provider
        price pages and override in config:
      </p>
      <CodeBlock
        lang="jsonc"
        code={`"pricing": {
  "gpt-4o-mini": { "in": 0.15, "out": 0.6 },     // override a shipped price
  "my-finetune": { "in": 1.0, "out": 4.0 },       // add a new model
  "openrouter:*": { "in": 0, "out": 0 }           // provider-wide default
}`}
      />
      <p>
        Requests on a model with no price are logged with full token counts and flagged as unpriced
        (never guessed). The{' '}
        <a href="https://github.com/adityasarade/ai-command-center/blob/main/evals/REPORT.md">
          eval report
        </a>{' '}
        checks cost math is exact for the priced models.
      </p>

      <DocFoot />
    </>
  );
}
