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
    label: 'Python SDK',
    lang: 'python',
    code: `# pip install aicc-sdk
import aicc
aicc.init(project="invoice-bot")   # sets the base URLs for you

from openai import OpenAI
client = OpenAI()                  # your code, unchanged - now tracked`,
  },
  {
    label: 'JS SDK',
    lang: 'js',
    code: `// npm install @ai-command-center/sdk
import { init } from "@ai-command-center/sdk";
init({ project: "support-bot" });  // before constructing any client

import OpenAI from "openai";
const client = new OpenAI();        // unchanged - now tracked`,
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
    'Routing',
    'Failover & balancing',
    'Opt-in routes fail over and load-balance across providers - no client change, no new dependency.',
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
  ['shipped', 'Provider routing', 'Opt-in failover and load-balancing across providers.'],
  ['shipped', 'Roles & project grants', 'Read-only viewer role and per-user project access.'],
  ['next', 'SSO (OIDC / SAML)', 'Single sign-on beyond the built-in accounts.'],
  ['next', 'Managed option', 'A hosted deployment for teams that would rather not self-host.'],
];

export default function Home() {
  return (
    <>
      <div className="deco-layer" aria-hidden="true">
        <svg
          className="deco-dial spin-a"
          style={{ top: '40%', left: '-70px', width: 300 }}
          viewBox="0 0 400 400"
          fill="none"
        >
          <g stroke="currentColor" strokeWidth="1">
            <circle cx="200" cy="200" r="196" opacity="0.3" />
            <circle cx="200" cy="200" r="182" strokeDasharray="1 8" opacity="0.6" />
            <circle cx="200" cy="200" r="140" opacity="0.35" />
            <circle cx="200" cy="200" r="132" strokeDasharray="1 5" opacity="0.45" />
            <circle cx="200" cy="200" r="78" opacity="0.5" />
            <circle cx="200" cy="200" r="30" opacity="0.6" />
            <circle cx="200" cy="200" r="4" fill="currentColor" stroke="none" />
            <circle cx="200" cy="120" r="70" opacity="0.4" />
            <g opacity="0.4">
              <line x1="200" y1="200" x2="200" y2="12" />
              <line x1="200" y1="200" x2="388" y2="200" transform="rotate(40 200 200)" />
              <line x1="200" y1="200" x2="388" y2="200" transform="rotate(85 200 200)" />
              <line x1="200" y1="200" x2="388" y2="200" transform="rotate(140 200 200)" />
              <line x1="200" y1="200" x2="388" y2="200" transform="rotate(205 200 200)" />
              <line x1="200" y1="200" x2="388" y2="200" transform="rotate(300 200 200)" />
            </g>
          </g>
        </svg>
        <svg
          className="deco-dial spin-b"
          style={{ top: '63%', right: '-95px', width: 380 }}
          viewBox="0 0 400 400"
          fill="none"
        >
          <g stroke="currentColor" strokeWidth="1">
            <circle cx="200" cy="200" r="196" opacity="0.3" />
            <circle cx="200" cy="200" r="182" strokeDasharray="1 8" opacity="0.6" />
            <circle cx="200" cy="200" r="140" opacity="0.35" />
            <circle cx="200" cy="200" r="132" strokeDasharray="1 5" opacity="0.45" />
            <circle cx="200" cy="200" r="78" opacity="0.5" />
            <circle cx="200" cy="200" r="30" opacity="0.6" />
            <circle cx="200" cy="200" r="4" fill="currentColor" stroke="none" />
            <circle cx="200" cy="280" r="70" opacity="0.4" />
            <g opacity="0.4">
              <line x1="200" y1="200" x2="200" y2="12" />
              <line x1="200" y1="200" x2="388" y2="200" transform="rotate(25 200 200)" />
              <line x1="200" y1="200" x2="388" y2="200" transform="rotate(70 200 200)" />
              <line x1="200" y1="200" x2="388" y2="200" transform="rotate(160 200 200)" />
              <line x1="200" y1="200" x2="388" y2="200" transform="rotate(235 200 200)" />
              <line x1="200" y1="200" x2="388" y2="200" transform="rotate(320 200 200)" />
            </g>
          </g>
        </svg>
        <svg
          className="deco-dial spin-a"
          style={{ top: '87%', left: '-40px', width: 240 }}
          viewBox="0 0 400 400"
          fill="none"
        >
          <g stroke="currentColor" strokeWidth="1">
            <circle cx="200" cy="200" r="196" opacity="0.3" />
            <circle cx="200" cy="200" r="182" strokeDasharray="1 8" opacity="0.6" />
            <circle cx="200" cy="200" r="120" opacity="0.4" />
            <circle cx="200" cy="200" r="60" opacity="0.5" />
            <circle cx="200" cy="200" r="4" fill="currentColor" stroke="none" />
            <g opacity="0.4">
              <line x1="200" y1="200" x2="200" y2="12" />
              <line x1="200" y1="200" x2="388" y2="200" transform="rotate(55 200 200)" />
              <line x1="200" y1="200" x2="388" y2="200" transform="rotate(120 200 200)" />
              <line x1="200" y1="200" x2="388" y2="200" transform="rotate(250 200 200)" />
            </g>
          </g>
        </svg>
      </div>
      <div className="hero-wrap">
        <svg className="astrolabe" viewBox="0 0 760 760" fill="none" aria-hidden="true">
          <g stroke="currentColor" strokeWidth="1">
            <circle cx="380" cy="380" r="372" opacity="0.35" />
            <circle cx="380" cy="380" r="348" strokeDasharray="1 9" opacity="0.7" />
            <circle cx="380" cy="380" r="300" opacity="0.3" />
            <circle cx="380" cy="380" r="286" strokeDasharray="1 5" opacity="0.5" />
            <circle cx="380" cy="380" r="200" opacity="0.45" />
            <circle cx="380" cy="380" r="120" opacity="0.55" />
            <circle cx="380" cy="380" r="46" opacity="0.7" />
            <circle cx="380" cy="380" r="5" fill="currentColor" stroke="none" />
            <g className="spin" opacity="0.55">
              <circle cx="380" cy="250" r="150" opacity="0.6" />
              <circle cx="380" cy="510" r="150" opacity="0.35" />
              <line x1="380" y1="30" x2="380" y2="730" opacity="0.5" />
              <line x1="60" y1="380" x2="700" y2="380" opacity="0.5" />
            </g>
            <g className="spin-r" opacity="0.5">
              <line x1="380" y1="380" x2="620" y2="180" />
              <line x1="380" y1="380" x2="150" y2="560" />
              <path
                d="M380 380 L470 240 L540 300 L470 420 Z"
                opacity="0.5"
                strokeLinejoin="round"
              />
            </g>
            <g opacity="0.4">
              <line x1="380" y1="380" x2="380" y2="80" />
              <line x1="380" y1="380" x2="612" y2="380" transform="rotate(30 380 380)" />
              <line x1="380" y1="380" x2="612" y2="380" transform="rotate(75 380 380)" />
              <line x1="380" y1="380" x2="612" y2="380" transform="rotate(120 380 380)" />
              <line x1="380" y1="380" x2="612" y2="380" transform="rotate(165 380 380)" />
              <line x1="380" y1="380" x2="612" y2="380" transform="rotate(210 380 380)" />
              <line x1="380" y1="380" x2="612" y2="380" transform="rotate(255 380 380)" />
              <line x1="380" y1="380" x2="612" y2="380" transform="rotate(300 380 380)" />
            </g>
          </g>
        </svg>
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
          <p className="int-more">
            Also: install a thin helper (<code>pip install aicc-sdk</code> or{' '}
            <code>npm i @ai-command-center/sdk</code>) that sets the base URL for you; group calls
            without touching the path via an <code>x-aicc-project</code> header; report batch or
            unsupported-provider usage to <code>/api/track</code>; and swap{' '}
            <code>/p/&lt;project&gt;</code> for a <code>/k/&lt;gateway-key&gt;</code> when auth is
            on. <Link href="/docs/integrate">Full integration guide →</Link>
          </p>
        </div>
      </section>

      <section className="sec">
        <div className="wrap">
          <div className="sec-head">
            <span className="mono-label">02 / Capabilities</span>
            <h2>
              More than a cost meter. <br />
              <em>A control room.</em>
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
            advanced routing policies. Reach for this when you want honest cost and usage visibility
            - plus opt-in failover routing - across many projects, self-hosted, in minutes.{' '}
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
