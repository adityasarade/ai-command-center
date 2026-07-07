import { DocFoot } from '../DocFoot';

export const metadata = { title: 'FAQ' };

const QA = [
  ['Does it store my prompts or responses?', 'No. Only metadata — model, token counts, cost, latency, status, and the project name. Message content never touches disk.'],
  ['Where do my API keys go?', 'Straight through to the provider, unchanged. They are never written to the telemetry log. You can optionally configure central keys the gateway injects only when a caller sends none.'],
  ['How much latency does the proxy add?', 'Sub-millisecond in the eval suite (p50 well under 1 ms). Against real LLM calls of 300 ms–30 s, it is not measurable in practice. Run npm run evals to reproduce.'],
  ['Do I need to change my code?', 'One line — the base URL — or zero lines if you set the SDK’s standard base-URL environment variable. No new library, no per-language SDK.'],
  ['What languages are supported?', 'All of them. It is an HTTP gateway; anything that can call an LLM over HTTP works identically — Python, JS, Java, Go, Rust, shell, and so on.'],
  ['Can it run for a whole team on one server?', 'Yes. Bind it to 0.0.0.0 (or put it behind a reverse proxy), enable auth, give each project a gateway key, and use teams to scope who sees what.'],
  ['Is it a tracing or eval platform?', 'No. No span trees, no LLM-as-judge, no datasets, no prompt versioning. If you need those, see the comparison — Langfuse/Helicone/LangSmith are built for it.'],
  ['Does it route or fail over between providers?', 'No. It is a transparent single-upstream proxy, not a router. LiteLLM and Portkey do routing/failover/caching.'],
  ['What happens to a model with no price?', 'It is logged with full token counts and flagged as unpriced — never guessed. Add the price in config and future calls are costed.'],
  ['How do I reset everything?', 'Delete the data directory (default ~/.ai-command-center) or run aicc clear --all.'],
  ['Is there a hosted version?', 'No — it is self-hosted by design. That is the point: your telemetry stays on your machine and there is nothing to sign up for.'],
  ['What is the company vs open-source build?', 'The same MIT codebase. The company build is just a config preset (branding, defaults) loaded with --preset. There is no feature difference.'],
];

export default function Page() {
  return (
    <>
      <h1>FAQ</h1>
      {QA.map(([q, a]) => (
        <div key={q}>
          <h3>{q}</h3>
          <p>{a}</p>
        </div>
      ))}
      <DocFoot />
    </>
  );
}
