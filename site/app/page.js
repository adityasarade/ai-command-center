import Link from 'next/link';
import { CodeBlock } from './components/CodeBlock';
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
    code: `# no code change at all — the SDK reads this
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
  ['01', 'One line to onboard', 'Change a base URL — or one env var — and any project starts reporting. No new library to install, no per-language SDK, no instrumentation.'],
  ['02', 'Any language', 'It’s an HTTP gateway. Python, JS, Java, Go, Rust, shell — if it can call an LLM, it works, identically.'],
  ['03', 'Every provider', 'OpenAI, Anthropic, Gemini, OpenRouter, Mistral, DeepSeek, xAI, Groq, Together, Ollama, and any OpenAI-compatible endpoint.'],
  ['04', 'Cost you can trust', 'Exact per-request USD from real token counts (incl. cached tokens), shown in ₹ / $ / € with live rates. Verified by the eval suite.'],
  ['05', 'Your keys, your data', 'Provider keys pass straight through. Prompts and responses are never stored — metadata only. Telemetry stays on your machine.'],
  ['06', 'Zero dependencies', 'The whole gateway is plain Node with no npm runtime deps. One command, one file of telemetry (JSONL). Trivial to audit and run.'],
];

export default function Home() {
  return (
    <>
      <header className="hero wrap">
        <span className="eyebrow"><span className="dot" /> open source · self-hosted · MIT</span>
        <h1>One gateway, every AI project, <span className="grad">one dashboard.</span></h1>
        <p className="lede">
          AI Command Center is a dependency-free LLM gateway and self-hosted usage &amp; cost dashboard.
          Point any project at it — any language, one command — and watch tokens, cost, latency and
          errors for every AI product land in one place.
        </p>
        <div className="hero-actions">
          <Link href="/docs" className="btn btn-primary">Get started →</Link>
          <a href={REPO} target="_blank" rel="noreferrer" className="btn btn-ghost">Star on GitHub</a>
          <span className="hero-note">npx ai-command-center</span>
        </div>
      </header>

      <section className="wrap" style={{ paddingBottom: 20 }}>
        <DemoDashboard />
        <p className="hero-note" style={{ marginTop: 10, textAlign: 'center' }}>
          ↑ a live, clickable sample — toggle currency and range. Run <code>npx ai-command-center demo</code> for the real thing.
        </p>
      </section>

      <section className="band">
        <div className="wrap">
          <div className="section-head">
            <span className="mono-label">60-second start</span>
            <h2>Run it, point a project at it, watch it fill up.</h2>
          </div>
          <div className="grid-2">
            <div>
              <p style={{ marginBottom: 10, color: 'var(--ink-2)' }}>1 — Start the gateway + dashboard:</p>
              <CodeBlock lang="bash" code={`npx ai-command-center\n# dashboard opens at http://localhost:4321`} />
              <p style={{ margin: '18px 0 10px', color: 'var(--ink-2)' }}>2 — Point any project at it:</p>
              <CodeTabs items={SNIPPETS} />
            </div>
            <div>
              <p style={{ marginBottom: 10, color: 'var(--ink-2)' }}>Nothing to look at yet? Seed a realistic 14-day sample:</p>
              <CodeBlock lang="bash" code={`npx ai-command-center demo\n# 4 sample projects, real model mix, one cost spike to spot`} />
              <div className="card" style={{ marginTop: 18 }}>
                <span className="ic">HOW IT WORKS</span>
                <p style={{ marginTop: 8 }}>
                  Your app calls the LLM exactly as before, but through the gateway. It forwards the request
                  untouched (your API key included), streams the response straight back, and reads the token
                  usage on the side to compute cost. Latency added: well under a millisecond.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="band">
        <div className="wrap">
          <div className="section-head">
            <span className="mono-label">Why it exists</span>
            <h2>Cost visibility across your whole AI portfolio, without a platform to run.</h2>
            <p>
              Most teams either fly blind on spend or stand up a multi-service observability stack.
              This is the middle path: the numbers you actually need, from one command, on your own machine.
            </p>
          </div>
          <div className="grid-3">
            {FEATURES.map(([n, title, body]) => (
              <div className="card" key={n}>
                <span className="ic">{n}</span>
                <h3>{title}</h3>
                <p>{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="band">
        <div className="wrap">
          <div className="section-head">
            <span className="mono-label">Measured, not claimed</span>
            <h2>Numbers from the eval suite.</h2>
            <p>
              Reproduce them yourself with <code>npm run evals</code> — they run against a mock upstream,
              no API keys, no network.
            </p>
          </div>
          <div className="stats-row">
            <div className="card stat"><b>&lt;1 ms</b><span>added latency (p50) routing through the gateway</span></div>
            <div className="card stat"><b>0</b><span>cost mismatches across 20 provider/model/token cases</span></div>
            <div className="card stat"><b>100%</b><span>of provider response shapes parsed for usage</span></div>
            <div className="card stat"><b>0</b><span>runtime dependencies in the gateway</span></div>
          </div>
        </div>
      </section>

      <section className="band">
        <div className="wrap">
          <div className="section-head">
            <span className="mono-label">Honest positioning</span>
            <h2>Not a tracing platform. Not a router. A cost dashboard that just runs.</h2>
            <p>
              Tools like Langfuse, Helicone, and LangSmith do far more — full traces, evals, prompt
              management. LiteLLM and Portkey are richer gateways. If you need those, use them.
              Reach for this when the question is simply <em>“how many tokens and dollars is each project
              spending?”</em> and you want the answer in one command.
            </p>
          </div>
          <Link href="/docs/comparison" className="btn btn-ghost">See the full comparison →</Link>
        </div>
      </section>

      <section className="band">
        <div className="wrap" style={{ textAlign: 'center' }}>
          <h2 style={{ fontSize: 'clamp(24px,4vw,38px)' }}>Give every AI project a dashboard.</h2>
          <p style={{ color: 'var(--ink-2)', margin: '12px auto 26px', maxWidth: '52ch' }}>
            No signup, no database, no vendor. Just a command and a base URL.
          </p>
          <div className="hero-actions" style={{ justifyContent: 'center' }}>
            <Link href="/docs" className="btn btn-primary">Read the docs →</Link>
            <a href={REPO} target="_blank" rel="noreferrer" className="btn btn-ghost">GitHub</a>
          </div>
        </div>
      </section>
    </>
  );
}
