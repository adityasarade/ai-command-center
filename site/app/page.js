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
    label: 'env var (any language)',
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

const ROADMAP = [
  [
    'shipped',
    'Cost & usage dashboard',
    'Spend, tokens, latency, errors per project - in INR, USD or EUR.',
  ],
  ['shipped', 'Traces / sessions', 'Group an app request or agent run into a call timeline.'],
  [
    'shipped',
    'Prompt versioning',
    'Track prompt templates by version and compare cost and quality drift.',
  ],
  [
    'shipped',
    'Budgets & alerts',
    'Per-project monthly budgets, threshold alerts, optional webhook.',
  ],
  ['shipped', 'Anomaly detection', 'Rule-based cost-spike and error-burst flags, per project.'],
  [
    'shipped',
    'Model comparison',
    'Effective cost/1M tokens, p50/p95 latency and error rate, side by side.',
  ],
  ['next', 'Quality evals', 'LLM-as-judge scoring and datasets, run against prompt versions.'],
  ['next', 'Provider routing', 'Fallback and load-balancing across providers (opt-in).'],
  ['next', 'SSO & RBAC depth', 'OIDC/SAML sign-in beyond the built-in username/password.'],
  ['next', 'Managed option', 'A hosted deployment for teams that would rather not self-host.'],
];

export default function Home() {
  return (
    <>
      <div className="hero-wrap">
        <header className="hero wrap">
          <span className="eyebrow">
            <span className="dot" /> open source · self-hosted · zero dependencies · MIT
          </span>
          <h1>
            The command center for <span className="grad">every AI project you run.</span>
          </h1>
          <p className="lede">
            A dependency-free LLM gateway and self-hosted dashboard. Point any project at it - any
            language, one command - and get cost, usage, latency, traces, prompt versions, budgets
            and anomaly alerts across your whole AI portfolio. No SDK to adopt, no database to run.
          </p>
          <div className="hero-actions">
            <Link href="/docs" className="btn btn-primary">
              Get started
            </Link>
            <a href={REPO} target="_blank" rel="noreferrer" className="btn btn-ghost">
              Star on GitHub
            </a>
            <span className="term">
              <span className="prompt">$</span> npx ai-command-center <span className="cursor" />
            </span>
          </div>
        </header>

        <section className="wrap" style={{ paddingBottom: 56 }}>
          <DemoDashboard />
          <p className="hero-note" style={{ marginTop: 12, textAlign: 'center' }}>
            A live, clickable sample - toggle currency and range. Run{' '}
            <code>npx ai-command-center demo</code> for the real dashboard with five views.
          </p>
        </section>
      </div>

      <section className="sec">
        <div className="wrap">
          <div className="sec-head">
            <span className="mono-label">Integration</span>
            <h2>Change one base URL. Keep your keys. Ship.</h2>
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
              <p style={{ marginTop: 10 }}>
                Your app calls the LLM as before, but through the gateway. It forwards the request
                untouched, streams the response straight back, and reads token usage on the side to
                compute cost. Added latency is well under a millisecond; nothing sits between you
                and the provider except a thin, auditable proxy.
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
            <span className="mono-label">What you get</span>
            <h2>More than a cost meter. A control room.</h2>
            <p>
              Every capability works from the same one-command install, with metadata-only storage
              and no external services.
            </p>
          </div>
          <div className="bento">
            <div className="cell wide">
              <span className="k">Cost &amp; usage</span>
              <h3>Spend across your whole portfolio, in your currency</h3>
              <p>
                Per-request cost from real token counts (including cached tokens), grouped by
                project and model, with latency percentiles and error rates. Shown in ₹ / $ / € with
                live exchange rates; stored in USD.
              </p>
            </div>
            <div className="cell third">
              <span className="k">Traces</span>
              <h3>Session timelines</h3>
              <p>Group the calls in one request or agent run and see the timeline.</p>
            </div>
            <div className="cell third">
              <span className="k">Prompts</span>
              <h3>Version tracking</h3>
              <p>Compare cost, latency and error rate across prompt versions.</p>
            </div>
            <div className="cell third">
              <span className="k">Budgets</span>
              <h3>Limits &amp; alerts</h3>
              <p>Monthly budgets per project, threshold alerts, optional webhook.</p>
            </div>
            <div className="cell third">
              <span className="k">Anomalies</span>
              <h3>Spike detection</h3>
              <p>Rule-based cost-spike and error-burst flags, per project.</p>
            </div>
            <div className="cell half">
              <span className="k">Models</span>
              <h3>Compare models head to head</h3>
              <p>
                Effective cost per million tokens, p50/p95 latency and error rate side by side - so
                a model swap is a decision, not a guess.
              </p>
            </div>
            <div className="cell half">
              <span className="k">Privacy</span>
              <h3>Your keys and data stay yours</h3>
              <p>
                Provider keys pass straight through and are never logged. Prompt and response bodies
                are never stored - metadata only. Everything runs on your machine.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="sec">
        <div className="wrap">
          <div className="sec-head">
            <span className="mono-label">Honest positioning</span>
            <h2>Lightweight on purpose.</h2>
            <p>
              Full platforms like Langfuse, Helicone and LangSmith go deeper on tracing and
              evaluation; LiteLLM and Portkey are richer gateways. They are also a database, a queue
              and an analytics cluster to operate. This is one command and a file of JSONL - the
              answer to <em>&ldquo;what is each project spending, and is anything off?&rdquo;</em>{' '}
              without standing up infrastructure.
            </p>
          </div>
          <Link href="/docs/comparison" className="btn btn-ghost">
            See the full, fact-checked comparison
          </Link>
        </div>
      </section>

      <section className="sec" id="roadmap">
        <div className="wrap">
          <div className="sec-head">
            <span className="mono-label">Roadmap</span>
            <h2>Shipped, and what&apos;s next.</h2>
            <p>Clear about what exists today and what is deliberately not built yet.</p>
          </div>
          <div className="roadmap">
            {ROADMAP.map(([tag, title, desc]) => (
              <div className="road-item" key={title}>
                <span className={`tag ${tag}`}>{tag}</span>
                <span className="d">
                  <b>{title}.</b> {desc}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="sec">
        <div className="wrap" style={{ textAlign: 'center' }}>
          <h2 style={{ fontSize: 'clamp(26px,4vw,40px)' }}>
            Give every AI project a command center.
          </h2>
          <p style={{ color: 'var(--ink-2)', margin: '12px auto 26px', maxWidth: '54ch' }}>
            No signup, no database, no vendor. One command and a base URL.
          </p>
          <div className="hero-actions" style={{ justifyContent: 'center' }}>
            <Link href="/docs" className="btn btn-primary">
              Read the docs
            </Link>
            <a href={REPO} target="_blank" rel="noreferrer" className="btn btn-ghost">
              GitHub
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
