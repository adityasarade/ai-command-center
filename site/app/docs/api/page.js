import { CodeBlock } from '../../components/CodeBlock';
import { DocFoot } from '../DocFoot';

export const metadata = { title: 'HTTP API' };

export default function Page() {
  return (
    <>
      <h1>HTTP API</h1>
      <p className="lead">
        Everything the dashboard shows is a plain JSON endpoint you can build on. When auth is
        locked, the <code>/api/*</code> read endpoints require a session cookie;{' '}
        <code>/api/track</code> also accepts a project gateway key.
      </p>

      <h2>Proxy routes</h2>
      <table>
        <thead>
          <tr>
            <th>Route</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>/p/&lt;project&gt;/&lt;provider&gt;/…</code>
            </td>
            <td>Proxy a call, grouped under a project</td>
          </tr>
          <tr>
            <td>
              <code>/k/&lt;key&gt;/&lt;provider&gt;/…</code>
            </td>
            <td>Proxy under auth - the key sets the project</td>
          </tr>
          <tr>
            <td>
              <code>/&lt;provider&gt;/…</code>
            </td>
            <td>
              Proxy with <code>x-aicc-project</code> header (or “default”)
            </td>
          </tr>
        </tbody>
      </table>

      <h2>Data endpoints</h2>
      <table>
        <thead>
          <tr>
            <th>Method + path</th>
            <th>Returns</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>GET /health</code>
            </td>
            <td>
              <code>{'{ ok, name, version, uptimeMs }'}</code>
            </td>
          </tr>
          <tr>
            <td>
              <code>GET /api/meta</code>
            </td>
            <td>version, branding, currency, providers, record count</td>
          </tr>
          <tr>
            <td>
              <code>GET /api/stats?range=7d&amp;project=x</code>
            </td>
            <td>totals, timeseries, by-project / by-model / by-provider</td>
          </tr>
          <tr>
            <td>
              <code>GET /api/requests?limit=100&amp;errorsOnly=1&amp;q=gpt</code>
            </td>
            <td>recent requests (newest first)</td>
          </tr>
          <tr>
            <td>
              <code>GET /api/projects</code>
            </td>
            <td>known projects with totals</td>
          </tr>
          <tr>
            <td>
              <code>GET /api/fx</code>
            </td>
            <td>current display currency + exchange rates</td>
          </tr>
          <tr>
            <td>
              <code>GET /api/events</code>
            </td>
            <td>Server-Sent Events - live request feed</td>
          </tr>
          <tr>
            <td>
              <code>GET /api/traces?range=7d</code>
            </td>
            <td>sessions grouped by trace id (newest first)</td>
          </tr>
          <tr>
            <td>
              <code>GET /api/trace?id=…</code>
            </td>
            <td>the ordered call timeline for one trace</td>
          </tr>
          <tr>
            <td>
              <code>GET /api/prompts?range=7d</code>
            </td>
            <td>per prompt+version cost, latency and error rate</td>
          </tr>
          <tr>
            <td>
              <code>GET /api/models?range=7d</code>
            </td>
            <td>model comparison (effective $/1M tok, p50/p95, error rate)</td>
          </tr>
          <tr>
            <td>
              <code>GET /api/anomalies?range=30d</code>
            </td>
            <td>rule-based cost-spike / error-burst flags</td>
          </tr>
          <tr>
            <td>
              <code>GET /api/alerts</code>
            </td>
            <td>active alerts + budgets (spend vs limit) + thresholds</td>
          </tr>
          <tr>
            <td>
              <code>POST /api/track</code>
            </td>
            <td>ingest external usage (see below)</td>
          </tr>
          <tr>
            <td>
              <code>POST /api/admin/budget</code>
            </td>
            <td>
              admin: set a project budget <code>{'{ project, monthlyUsd, alertAtPct }'}</code>
            </td>
          </tr>
          <tr>
            <td>
              <code>DELETE /api/records?simulated=1</code>
            </td>
            <td>remove demo records (admin; drop the query to wipe all)</td>
          </tr>
        </tbody>
      </table>
      <p>
        Requests may carry <code>x-aicc-trace</code>, <code>x-aicc-prompt</code> and{' '}
        <code>x-aicc-prompt-version</code> headers (or the same fields in a <code>/api/track</code>{' '}
        body) to power the Traces and Prompts views. See{' '}
        <a href="/docs/features">Traces, prompts &amp; budgets</a>.
      </p>
      <p>
        <code>range</code> accepts <code>1h · 24h · 7d · 30d · 90d · all</code>, or explicit{' '}
        <code>from</code>/<code>to</code> epoch-ms.
      </p>

      <h2>POST /api/track</h2>
      <p>
        Report usage the proxy can&apos;t see. Cost is computed for you if you omit{' '}
        <code>costUsd</code>. Send one object or an array (up to 1000 records per call).
      </p>
      <CodeBlock
        lang="bash"
        code={`curl -X POST http://localhost:4321/api/track \\
  -H "Content-Type: application/json" \\
  -d '{
    "project": "nightly-job",
    "provider": "openai",
    "model": "gpt-4o",
    "tokensIn": 52000,
    "tokensOut": 9000,
    "latencyMs": 820
  }'`}
      />
      <CodeBlock lang="json" label="response" code={`{ "saved": 1 }`} />

      <h3>Not just LLMs: track any AI spend</h3>
      <p>
        This is the first-class path for costs that never pass through the proxy - speech-to-text,
        TTS, telephony minutes, image generation, embeddings run elsewhere, batch jobs. Three fields
        make it composable:
      </p>
      <ul>
        <li>
          <code>costUsd</code> - set it explicitly for anything priced per minute/character/call
          instead of per token; the pricing engine is skipped and your number is recorded as-is.
        </li>
        <li>
          <code>trace</code> - use the same trace id as the LLM calls around it and the whole
          pipeline (STT → LLM → TTS) shows up as one session on the Traces view, with a true total
          cost.
        </li>
        <li>
          <code>ts</code> - epoch-ms timestamp for backfills: import yesterday&apos;s batch or a
          provider invoice and it lands on the right day in every chart.
        </li>
      </ul>
      <CodeBlock
        lang="bash"
        label="a voice-agent turn: STT minutes + TTS characters joined to the LLM's trace"
        code={`curl -X POST http://localhost:4321/api/track \\
  -H "Content-Type: application/json" \\
  -d '[
    { "project": "voice-agent", "provider": "stt", "model": "streaming-stt",
      "trace": "call-8123", "costUsd": 0.0062, "latencyMs": 240 },
    { "project": "voice-agent", "provider": "tts", "model": "neural-tts",
      "trace": "call-8123", "costUsd": 0.0031 },
    { "project": "voice-agent", "provider": "telephony", "model": "sip-minutes",
      "trace": "call-8123", "costUsd": 0.0140, "ts": 1783605600000 }
  ]'`}
      />

      <h2>Example: pull today&apos;s spend</h2>
      <CodeBlock
        lang="bash"
        code={`curl -s "http://localhost:4321/api/stats?range=24h" \\
  | python3 -c 'import json,sys; print("$%.2f" % json.load(sys.stdin)["totals"]["costUsd"])'`}
      />

      <DocFoot />
    </>
  );
}
