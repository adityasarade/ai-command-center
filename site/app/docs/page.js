import Link from 'next/link';
import { CodeBlock } from '../components/CodeBlock';
import { DocFoot } from './DocFoot';

export const metadata = { title: 'Docs - Overview' };

export default function Page() {
  return (
    <>
      <h1>AI Command Center</h1>
      <p className="lead">
        A dependency-free LLM gateway and self-hosted usage &amp; cost dashboard. You point any
        project at it - any language, one command - and it captures tokens, cost, latency, and
        errors for every AI product in one place.
      </p>

      <h2>The idea in one picture</h2>
      <p>
        Your apps already call an LLM through a provider SDK. Every SDK lets you set a custom base
        URL. Point that base URL at the gateway and it forwards the request to the real provider
        untouched (your API key included), streams the response straight back, and reads the token
        usage on the side to compute cost. Nothing else about your code changes.
      </p>
      <CodeBlock lang="text" label="flow" code={`your app  ──base_url──▶  AI Command Center gateway  ──▶  OpenAI / Anthropic / Gemini / …
                              │
                              ├─ logs tokens, cost, latency, errors  (metadata only)
                              └─ serves the dashboard at :4321`} />

      <h2>What it is - and isn't</h2>
      <p><strong>It is:</strong> a self-hosted, language-agnostic cost/usage dashboard that runs from a single
      command with no database and no external services. Your provider keys pass through; prompt and
      response bodies are never stored.</p>
      <p><strong>It isn't:</strong> a tracing platform, an eval framework, a prompt manager, or a routing/failover
      gateway. If you need those, the <Link href="/docs/comparison">comparison</Link> points you to the
      right tool.</p>

      <h2>Next steps</h2>
      <ul>
        <li><Link href="/docs/install">Install &amp; run</Link> - get the gateway up in under a minute.</li>
        <li><Link href="/docs/integrate">Integrate a project</Link> - snippets for every language.</li>
        <li><Link href="/docs/auth">Auth &amp; teams</Link> - lock it down for shared use.</li>
        <li><Link href="/docs/api">HTTP API</Link> - build on the raw JSON endpoints.</li>
      </ul>

      <div className="callout">
        <strong>For AI agents:</strong> a machine-readable overview lives at{' '}
        <a href="/llms.txt">/llms.txt</a>, and integration guidance for coding agents is in{' '}
        <a href="https://github.com/adityasarade/ai-command-center/blob/main/AGENTS.md">AGENTS.md</a>.
      </div>

      <DocFoot />
    </>
  );
}
