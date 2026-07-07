import { CodeBlock } from '../../components/CodeBlock';
import { DocFoot } from '../DocFoot';

export const metadata = { title: 'Traces, prompts & budgets' };

export default function Page() {
  return (
    <>
      <h1>Traces, prompts &amp; budgets</h1>
      <p className="lead">
        Beyond cost and usage, the dashboard has five views. Traces, prompts and model comparison
        come from two optional request headers; budgets and anomaly alerts are computed for you.
      </p>

      <h2>Group calls into traces / sessions</h2>
      <p>
        Send an <code>x-aicc-trace</code> header with a shared id across the LLM calls that belong
        to one app request or agent run. The <strong>Traces</strong> view then lists each session
        and, on click, shows a timeline of its calls with per-call cost, tokens and latency.
      </p>
      <CodeBlock
        lang="python"
        code={`import uuid
trace = str(uuid.uuid4())            # one id per user request / agent run

client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[...],
    extra_headers={"x-aicc-trace": trace},   # OpenAI SDK: extra_headers
)`}
      />
      <p>
        Any HTTP client works - it is just a header. <code>x-aicc-session</code> is accepted as an
        alias.
      </p>

      <h2>Track prompt versions</h2>
      <p>
        Send <code>x-aicc-prompt</code> (a template name) and optionally{' '}
        <code>x-aicc-prompt-version</code>. The <strong>Prompts</strong> view shows requests, error
        rate, average cost, tokens and latency per prompt version - so when you change a prompt you
        can see if cost or quality drifted.
      </p>
      <CodeBlock
        lang="bash"
        code={`# any language - just two headers
-H "x-aicc-prompt: claim-triage"
-H "x-aicc-prompt-version: v3"`}
      />

      <h2>Compare models</h2>
      <p>
        The <strong>Models</strong> view needs no headers. It derives, per model, the effective cost
        per million tokens, p50/p95 latency and error rate from real traffic, side by side - so a
        model swap is a measured decision.
      </p>

      <h2>Budgets &amp; alerts</h2>
      <p>
        Set a monthly budget (USD) per project in the <strong>Alerts</strong> view, with an alert
        threshold percentage. The gateway tracks current-month spend and raises an alert when a
        project crosses the threshold or goes over budget. It also flags per-project error-rate and
        p95-latency breaches over the last 24h. Set an <code>alertWebhook</code> in config to
        receive a POST when new alerts fire.
      </p>
      <CodeBlock
        lang="jsonc"
        code={`// aicc.config.json
{
  "alertWebhook": "https://hooks.example.com/aicc"   // optional: POSTed newly-fired alerts
}`}
      />
      <p>
        Budgets are admin-managed and stored in <code>dataDir/budgets.json</code>.
      </p>

      <h2>Anomaly detection</h2>
      <p>
        The Alerts view surfaces rule-based anomalies over the last 30 days: a project whose daily
        spend is more than ~2x its own median day (a cost spike), or a day with an unusually high
        error rate (an error burst). The rules are explainable - no ML, no external service - and
        each anomaly says exactly why it fired.
      </p>

      <div className="callout">
        None of this stores prompt or response content - only the header values you send (a trace
        id, a prompt name/version) plus the usual metadata. See{' '}
        <a href="/docs/security">Security</a>.
      </div>

      <DocFoot />
    </>
  );
}
