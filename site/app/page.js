import Link from 'next/link';
import { CodeTabs } from './components/Tabs';
import { DemoDashboard } from './components/DemoDashboard';

const REPO = 'https://github.com/adityasarade/ai-command-center';

const SNIPPETS = [
  {
    label: 'Python',
    lang: 'python',
    code: `from openai import OpenAI

# the only change: point base_url at the gateway
client = OpenAI(base_url="http://localhost:4321/p/invoice-bot/openai/v1")
# your OPENAI_API_KEY is passed straight through, untouched`,
  },
  {
    label: 'JavaScript',
    lang: 'js',
    code: `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "http://localhost:4321/p/support-bot/openai/v1",
});`,
  },
  {
    label: 'Java',
    lang: 'java',
    code: `OpenAIClient client = OpenAIOkHttpClient.builder()
    .fromEnv()  // keeps your OPENAI_API_KEY
    .baseUrl("http://localhost:4321/p/claims-ai/openai/v1")
    .build();`,
  },
  {
    label: 'env var',
    lang: 'bash',
    code: `# no code change at all - the SDK reads this
export OPENAI_BASE_URL="http://localhost:4321/p/my-app/openai/v1"
export ANTHROPIC_BASE_URL="http://localhost:4321/p/my-app/anthropic"`,
  },
  {
    label: 'curl',
    lang: 'bash',
    code: `curl http://localhost:4321/p/my-app/openai/v1/chat/completions \\
  -H "Authorization: Bearer $OPENAI_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"hi"}]}'`,
  },
];

const FEATURES = [
  [
    'Traces',
    'Session timelines',
    'Group the calls in one request or agent run with a trace header, then read the timeline.',
  ],
  [
    'Prompts',
    'Version tracking',
    'Tag prompts by version and compare cost, latency and error rate as they change.',
  ],
  [
    'Budgets',
    'Limits & alerts',
    'Per-project monthly budgets, error-rate and latency thresholds, and an optional webhook.',
  ],
  [
    'Anomalies',
    'Spike detection',
    'Explainable rules flag cost spikes and error bursts per project - no ML, no black box.',
  ],
  [
    'Models',
    'Head-to-head',
    'Effective cost per million tokens, p50/p95 latency and error rate, compared side by side.',
  ],
  [
    'Privacy',
    'Keys & data stay put',
    'Provider keys pass through and are never logged. Prompt and response bodies are never stored.',
  ],
];

const ROADMAP = [
  [
    'shipped',
    'Cost & usage dashboard',
    'Spend, tokens, latency and errors per project, in INR, USD or EUR.',
  ],
  ['shipped', 'Traces / sessions', 'Group an app request or agent run into a call timeline.'],
  [
    'shipped',
    'Prompt versioning',
    'Track templates by version; compare cost, latency and error rate.',
  ],
  [
    'shipped',
    'Budgets & alerts',
    'Per-project monthly budgets, threshold alerts, optional webhook.',
  ],
  ['shipped', 'Anomaly detection', 'Rule-based cost-spike and error-burst flags, per project.'],
  ['shipped', 'Model comparison', 'Effective cost/1M tokens, p50/p95 latency and error rate.'],
  ['next', 'Quality evals', 'LLM-as-judge scoring and datasets, run against prompt versions.'],
  ['next', 'Provider routing', 'Fallback and load-balancing across providers, opt-in.'],
  ['next', 'SSO & deeper RBAC', 'OIDC / SAML sign-in beyond the built-in accounts.'],
  ['next', 'Managed option', 'A hosted deployment for teams that would rather not self-host.'],
];

export default function Home() {
  return (
    <>
      <div className="hero-wrap">
        <div className="wrap hero">
          <span className="eyebrow">
            <span className="dot" /> open source · self-hosted · zero dependencies
          </span>
          <h1 className="display">
            The command center for <em>every AI project</em> you run.
          </h1>
          <p className="lede">
            A dependency-free LLM gateway and self-hosted dashboard. Point any project at it - any
            language, one command - and get cost, traces, prompt versions, budgets and anomaly
            alerts across your whole AI portfolio. No SDK to adopt, no database to run.
          </p>
          <div className="hero-actions">
            <Link href="/docs" className="btn btn-primary">
              Get started
            </Link>
            <span className="term">
              <span className="prompt">$</span> npx ai-command-center <span className="cursor" />
            </span>
          </div>
          <div className="hero-meta">
            <span>
              <b>&lt;1ms</b> proxy overhead
            </span>
            <span>
              <b>0</b> runtime deps
            </span>
            <span>
              <b>11+</b> providers
            </span>
            <span>
              <b>MIT</b> licensed
            </span>
          </div>
        </div>
      </div>

      <section className="showcase">
        <div className="wrap">
          <div className="cap">
            <span className="mono-label">The dashboard</span>
            <p>live sample - toggle currency &amp; range</p>
          </div>
          <DemoDashboard />
        </div>
      </section>

      <section className="sec">
        <div className="wrap">
          <div className="sec-head">
            <span className="mono-label">01 / Integration</span>
            <h2>
              Change one base URL. <em>Keep your keys.</em> Ship.
            </h2>
            <p>
              Every provider SDK already supports a custom base URL, so onboarding a project is one
              line - or zero, via an environment variable. Nothing else about your code changes, and
              your API keys are forwarded to the provider untouched.
            </p>
          </div>
          <div className="grid-2">
            <CodeTabs items={SNIPPETS} />
            <div className="card">
              <span className="ic">HOW IT WORKS</span>
              <p style={{ marginTop: 10, color: 'var(--ink-2)', fontSize: 15 }}>
                Your app calls the LLM as before, but through the gateway. It forwards the request
                untouched, streams the response straight back, and reads token usage on the side to
                compute cost. Added latency is well under a millisecond - a thin, auditable proxy,
                nothing more.
              </p>
              <div className="chips">
                <span>OpenAI</span>
                <span>Anthropic</span>
                <span>Gemini</span>
                <span>Mistral</span>
                <span>DeepSeek</span>
                <span>xAI</span>
                <span>Groq</span>
                <span>Together</span>
                <span>OpenRouter</span>
                <span>Ollama</span>
                <span>+ any OpenAI-compatible</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="sec">
        <div className="wrap">
          <div className="sec-head">
            <span className="mono-label">02 / Capabilities</span>
            <h2>
              More than a cost meter. <em>A control room.</em>
            </h2>
            <p>
              Every capability runs from the same one-command install, with metadata-only storage
              and no external services.
            </p>
          </div>

          <div className="feature-primary">
            <div>
              <span className="ic" style={{ fontFamily: 'var(--font-mono), monospace' }}>
                COST &amp; USAGE
              </span>
              <h3>Spend across your whole portfolio, in your currency</h3>
              <p>
                Per-request cost from real token counts (including cached tokens), grouped by
                project and model, with latency percentiles and error rates. Shown in ₹ / $ / € with
                live exchange rates and stored in USD.
              </p>
            </div>
            <div className="mini-stats">
              <div className="mini-stat">
                <b>₹ / $ / €</b>
                <span>live FX, INR-first</span>
              </div>
              <div className="mini-stat">
                <b>p50 / p95</b>
                <span>latency per model</span>
              </div>
              <div className="mini-stat">
                <b>cached</b>
                <span>tokens priced right</span>
              </div>
              <div className="mini-stat">
                <b>live</b>
                <span>SSE request feed</span>
              </div>
            </div>
          </div>

          <div className="feature-grid">
            {FEATURES.map(([k, title, desc]) => (
              <div className="feature" key={title}>
                <span className="fk">{k}</span>
                <h3>{title}</h3>
                <p>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="sec">
        <div className="wrap">
          <div className="sec-head">
            <span className="mono-label">03 / Positioning</span>
            <h2>
              Lightweight <em>on purpose.</em>
            </h2>
            <p>
              Platforms like Langfuse, Helicone and LangSmith go deeper on tracing and evaluation;
              LiteLLM and Portkey are richer gateways. They are also a database, a queue and an
              analytics cluster to operate. This is one command and a file of JSONL - the answer to{' '}
              <em>&ldquo;what is each project spending, and is anything off?&rdquo;</em> without
              standing up infrastructure.
            </p>
          </div>
          <div className="note">
            Reach for a full platform when you need distributed span trees, LLM-as-judge evals or
            provider routing. Reach for this when you want honest cost and usage visibility across
            many projects, self-hosted, in minutes.{' '}
            <Link href="/docs/comparison">See the fact-checked comparison →</Link>
          </div>
        </div>
      </section>

      <section className="sec" id="roadmap">
        <div className="wrap">
          <div className="sec-head">
            <span className="mono-label">04 / Roadmap</span>
            <h2>
              Shipped, and <em>what&apos;s next.</em>
            </h2>
            <p>Clear about what exists today and what is deliberately not built yet.</p>
          </div>
          <div className="roadmap">
            {ROADMAP.map(([tag, title, desc]) => (
              <div className="road-item" key={title}>
                <span className={`tag ${tag}`}>{tag}</span>
                <span className="rt">{title}</span>
                <span className="rd">{desc}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="sec cta-sec">
        <div className="wrap" style={{ textAlign: 'center' }}>
          <h2 className="display" style={{ fontSize: 'clamp(30px,5vw,52px)', lineHeight: 1.05 }}>
            Give every AI project a <em>command center.</em>
          </h2>
          <p
            style={{
              color: 'var(--ink-2)',
              margin: '18px auto 30px',
              maxWidth: '52ch',
              fontSize: 17,
            }}
          >
            No signup, no database, no vendor. One command and a base URL.
          </p>
          <div className="hero-actions" style={{ justifyContent: 'center' }}>
            <Link href="/docs" className="btn btn-primary">
              Read the docs
            </Link>
            <a href={REPO} target="_blank" rel="noreferrer" className="btn btn-ghost">
              Star on GitHub
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
