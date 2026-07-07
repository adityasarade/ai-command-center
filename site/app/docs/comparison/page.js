import Link from 'next/link';
import { DocFoot } from '../DocFoot';

export const metadata = { title: 'Comparison' };

const Y = () => <span className="mark-y">Yes</span>;
const N = () => <span className="mark-n">No</span>;
const P = () => <span className="mark-n">Partial</span>;

const ROWS = [
  {
    us: true,
    tool: 'AI Command Center',
    integration: 'base_url swap on any provider SDK; no code rewrite',
    selfhost: <Y />,
    lang: <Y />,
    focus: 'Self-hosted cost, usage, traces, prompts, budgets & anomaly dashboard',
    gateway: <Y />,
    license: 'MIT',
  },
  {
    tool: 'Helicone',
    integration: 'base_url proxy + header; also async SDK / OTel',
    selfhost: <Y />,
    lang: <Y />,
    focus: 'Observability + tracing + evals + prompt mgmt',
    gateway: <Y />,
    license: 'Apache-2.0 (Helm adds Commons Clause)',
  },
  {
    tool: 'Langfuse',
    integration: 'Instrument app: Python/JS SDKs, OTel',
    selfhost: <Y />,
    lang: <P />,
    focus: 'Tracing, evals, prompt management',
    gateway: <N />,
    license: 'MIT core; /ee commercial',
  },
  {
    tool: 'LangSmith',
    integration: 'SDK instrumentation or OTel ingestion',
    selfhost: <span className="mark-n">Enterprise only</span>,
    lang: <P />,
    focus: 'Agent/LLM observability + evals',
    gateway: <N />,
    license: 'Proprietary',
  },
  {
    tool: 'Portkey',
    integration: 'OpenAI-compatible base_url + headers; SDKs',
    selfhost: <P />,
    lang: <Y />,
    focus: 'Production gateway + LLMOps control plane',
    gateway: <Y />,
    license: 'Gateway MIT; platform proprietary',
  },
  {
    tool: 'LiteLLM',
    integration: 'Proxy: base_url swap + virtual key; or Python SDK',
    selfhost: <Y />,
    lang: <Y />,
    focus: 'LLM gateway/router + cost governance',
    gateway: <Y />,
    license: 'MIT core; enterprise/ commercial',
  },
  {
    tool: 'OpenLLMetry / Traceloop',
    integration: 'SDK auto-instrumentation, emits OTLP',
    selfhost: <P />,
    lang: <P />,
    focus: 'OpenTelemetry-based tracing',
    gateway: <span className="mark-n">Separate Hub</span>,
    license: 'Apache-2.0 SDK; platform SaaS',
  },
  {
    tool: 'Lunary',
    integration: 'SDK / callbacks (Python/JS, LangChain)',
    selfhost: <Y />,
    lang: <P />,
    focus: 'Observability + prompt mgmt + evals',
    gateway: <N />,
    license: 'Apache-2.0 core; Enterprise proprietary',
  },
  {
    tool: 'OpenMeter',
    integration: 'Emit CloudEvents via HTTP/SDKs',
    selfhost: <Y />,
    lang: <Y />,
    focus: 'Usage metering + usage-based billing',
    gateway: <N />,
    license: 'Apache-2.0',
  },
];

export default function Page() {
  return (
    <>
      <h1>Comparison</h1>
      <p className="lead">
        The tools below all touch “LLM cost and usage” somewhere, but most are broader
        observability, evaluation, or gateway platforms. AI Command Center deliberately does less.
        This lays out the differences honestly so you pick the right tool - the facts were
        independently fact-checked.
      </p>

      <div className="tablewrap" style={{ margin: '20px 0' }}>
        <table className="cmp">
          <thead>
            <tr>
              <th>Tool</th>
              <th>Integration</th>
              <th>Self-host</th>
              <th>Lang-agnostic</th>
              <th>Primary focus</th>
              <th>Also a gateway?</th>
              <th>License</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.tool} className={r.us ? 'row-us' : ''}>
                <td>{r.tool}</td>
                <td>{r.integration}</td>
                <td>{r.selfhost}</td>
                <td>{r.lang}</td>
                <td>{r.focus}</td>
                <td>{r.gateway}</td>
                <td>{r.license}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Where it fits - and where it doesn&apos;t</h2>
      <p>
        AI Command Center occupies a deliberately lean slot: a self-hosted, language-agnostic,
        zero-dependency command center you stand up with a single command. You point any provider
        SDK&apos;s base URL at the gateway, and it captures tokens, cost, latency and errors per
        project into append-only local JSONL. On top of that it groups calls into{' '}
        <strong>traces/sessions</strong>, tracks <strong>prompt versions</strong>, enforces{' '}
        <strong>budgets</strong>, raises <strong>threshold and anomaly alerts</strong>, and compares{' '}
        <strong>models</strong> head to head. There is no external database, no message queue, and
        no analytics cluster to operate - which is the main thing that separates it from the
        platforms above, whose self-hosted footprint is typically a multi-service stack (Postgres +
        ClickHouse + Redis + object storage, sometimes Kafka), and several of which are
        self-hostable only on their Enterprise tier or keep the control plane in SaaS.
      </p>
      <p>
        Two design choices define the niche. First, it is an <strong>inline gateway</strong>, so
        capture is automatic and works from any language over HTTP - no vendor SDK, no per-language
        instrumentation, no OpenTelemetry setup. That is also a real tradeoff: a proxy in the
        request path adds a latency and availability consideration that out-of-band telemetry tools
        don&apos;t. Second, it <strong>stores no prompt or response bodies</strong> - only metadata.
        Several of the platforms store full request/response content by default (redaction is
        opt-in, sometimes paid). If storing no message content by default matters for your privacy
        or compliance posture, that is a real difference.
      </p>
      <p>
        Be clear about where it stays lightweight <strong>by design</strong>. Its traces are
        session-level groupings, not full distributed span trees. Its prompt tracking compares
        versions by cost/latency/error rate, but there is no prompt playground. Its anomaly
        detection is explainable rules, not ML. It has{' '}
        <strong>no LLM-as-judge quality evals</strong>, no datasets, and it is{' '}
        <strong>not a router</strong> - no load balancing, retries, failover, or semantic caching -
        and not a SaaS or billing engine. On each of those axes, another tool on this list goes
        further; several are on the <Link href="/#roadmap">roadmap</Link>.
      </p>

      <h2>When to choose something else</h2>
      <ul>
        <li>
          Need full distributed span trees, LLM-as-judge evals, datasets, or a prompt playground →{' '}
          <strong>Langfuse, Helicone, LangSmith, Lunary, OpenLLMetry/Traceloop</strong>.
        </li>
        <li>
          The gateway itself is the point - unify many providers with routing, fallbacks, retries,
          caching → <strong>LiteLLM</strong> or <strong>Portkey</strong>.
        </li>
        <li>
          Turn token usage into customer-facing metering and invoicing → <strong>OpenMeter</strong>.
        </li>
        <li>
          Want a managed, hosted service with no infrastructure to run → most of the above offer
          SaaS; this project is self-hosted only.
        </li>
      </ul>

      <div className="callout">
        <strong>Who it&apos;s for:</strong> teams that want self-hosted, language-agnostic,
        body-free visibility - cost, usage, traces, prompt versions, budgets and anomaly alerts -
        across many AI projects, with zero infrastructure to operate.
        <br />
        <strong>Not for:</strong> teams needing deep distributed tracing, quality evaluations, a
        prompt playground, provider routing/failover, or a managed SaaS at scale - pick one of the
        platforms above.
      </div>

      <p style={{ color: 'var(--muted)', fontSize: 14 }}>
        Vendor status and licensing are as of mid-2026 and may change - several of these projects
        recently changed hands. Verify current details on each project&apos;s site before deciding.
        The full research (with sources) is in the repo. See also the{' '}
        <Link href="/docs/faq">FAQ</Link>.
      </p>

      <DocFoot />
    </>
  );
}
