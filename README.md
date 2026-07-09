<div align="center">

# ◆ AI Command Center

**One gateway, every AI project, one dashboard.**

A zero-dependency LLM gateway with a self-hosted usage and cost dashboard.
Point any project at it - any language, one command - and every token,
rupee, and millisecond lands in one place.

[![License: MIT](https://img.shields.io/badge/license-MIT-3987e5.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A518.17-3fb950.svg)](package.json)
[![runtime deps](https://img.shields.io/badge/runtime%20deps-0-21c17a.svg)](packages/gateway/package.json)
[![npm](https://img.shields.io/npm/v/ai-command-center?color=cb3837&label=npm)](https://www.npmjs.com/package/ai-command-center)
[![tests](https://img.shields.io/badge/tests-92%20passing-3fb950.svg)](packages/gateway/test)

<br/>

<img src="assets/dashboard.svg" alt="AI Command Center dashboard - total spend, requests, tokens, latency, spend over time stacked by project, and spend by project" width="820" />

</div>

---

```bash
npx ai-command-center        # gateway + dashboard on http://localhost:4321
npx ai-command-center demo   # seed 14 days of sample data to explore first
```

Then point a project at it. The only change is the base URL, and your API key
rides along untouched:

```python
from openai import OpenAI
client = OpenAI(base_url="http://localhost:4321/p/invoice-bot/openai/v1")
```

That is the whole integration - nothing else in your code moves. Full docs and a
live interactive demo: **[aicommandcenter.vercel.app](https://aicommandcenter.vercel.app)**

> This started as the working core of an internal "AI Box" platform idea - the
> gateway and cost-visibility slice, built to actually run rather than sit in a
> deck. It is open-sourced so anyone can see what their AI projects cost without
> standing up a stack for it.

## How it works

<div align="center">
<img src="assets/flow.svg" alt="Your apps (any language) change one base URL to call the gateway; it forwards the request untouched to the provider, streams the response back, and logs token/cost/latency metadata only; the dashboard shows spend per project in rupees, dollars, or euros." width="900" />
</div>

Your calls go through the gateway instead of straight to the provider. It
forwards each request untouched (API key included), streams the response right
back, and reads the token usage on the way past to price it. The added latency
is under a millisecond, so nothing in your app slows down.

## What you get

Most teams end up at one of two extremes: flying blind on LLM spend, or running a
multi-service observability stack (Postgres, ClickHouse, Redis, object storage)
to answer a fairly simple question. This is the middle path - the numbers you
actually need, from one command, on your own machine, with nothing to operate.

- Onboard a project in one line - a base URL, or a single environment variable. No new library, no per-language SDK, no OpenTelemetry wiring.
- It is just an HTTP gateway, so every language works the same way: Python, JS, Java, Go, Rust, shell.
- Every major provider is covered: OpenAI, Anthropic, Gemini, OpenRouter, Mistral, DeepSeek, xAI, Groq, Together, Ollama, and any OpenAI-compatible endpoint.
- Cost is exact, not estimated: per-request USD from real token counts (cached tokens included), shown in rupees, dollars, or euros at live rates.
- More than a spend meter: cost and usage, traces and sessions, prompt versions, model comparison, and budgets with anomaly alerts.
- Opt-in provider routing: failover and load-balancing across a pool of providers, in the gateway you already run - no client change, no new dependency.
- Your keys and data stay put: provider keys pass straight through, prompt and response bodies are never stored (metadata only), and telemetry never leaves your machine.
- Team-ready when you need it: optional login, teams, per-project gateway keys, a read-only viewer role, and per-user project grants.

Traces and prompt metrics come from two optional headers (`x-aicc-trace`,
`x-aicc-prompt`); budgets and anomaly alerts are computed for you; provider
routing is a few lines of config. See
[docs/features](https://aicommandcenter.vercel.app/docs/features).

## Integrate (any language)

The gateway is a transparent proxy, and every SDK already supports a custom base
URL - so integration is one line, or zero via an environment variable. The
`/p/<project>` path segment (or an `x-aicc-project` header) is how calls get
grouped on the dashboard.

<table>
<tr><td>

**Python**

```python
from openai import OpenAI
client = OpenAI(base_url=
  "http://localhost:4321/p/app/openai/v1")

from anthropic import Anthropic
client = Anthropic(base_url=
  "http://localhost:4321/p/app/anthropic")
```

</td><td>

**JavaScript / Java / anything**

```js
new OpenAI({ baseURL: 'http://localhost:4321/p/app/openai/v1' });
```

```bash
# zero code change - SDKs read this
export OPENAI_BASE_URL=\
  "http://localhost:4321/p/app/openai/v1"
```

</td></tr>
</table>

Print the exact snippets for your own project with
`npx ai-command-center snippets --project my-app`. Full per-language guide
(LangChain, Spring AI, curl, and more):
**[docs/integrate](https://aicommandcenter.vercel.app/docs/integrate)**.

Prefer a helper to setting the base URL yourself? Install the optional thin SDK -
`pip install aicc-sdk` (Python) or `npm install @ai-command-center/sdk` (JS) - and
call `aicc.init(project="my-app")` before you construct any client. Both only set
the standard base-URL environment variables; nothing else changes.

Can't route through the proxy (a batch job, an unsupported provider)? Report
usage directly and it is priced and shown the same way:

```bash
curl -X POST http://localhost:4321/api/track -H "Content-Type: application/json" \
  -d '{"project":"nightly-job","provider":"openai","model":"gpt-4o","tokensIn":52000,"tokensOut":9000}'
```

## How it compares

AI Command Center is a self-hosted, language-agnostic command center that runs
from one command with no database: cost and usage, session traces, prompt-version
metrics, model comparison, budgets, and anomaly alerts. It stays lightweight on
purpose. It is not a distributed span-tree tracer, an LLM-as-judge eval
framework, a prompt playground, or a routing and failover gateway - Langfuse,
Helicone, LangSmith, LiteLLM, and Portkey go further on those axes, and are also a
database, a queue, and an analytics cluster to run. If you need that depth, use
them.

Reach for this when the question is _"what is each project spending, across many
providers and languages, and is anything off?"_ - answered without shipping
prompt content anywhere or standing up infrastructure. Full, fact-checked
comparison: **[docs/comparison](https://aicommandcenter.vercel.app/docs/comparison)**.

## CLI

```
npx ai-command-center            # start gateway + dashboard (default)
npx ai-command-center demo       # seed 14 days of sample data (tagged, removable)
npx ai-command-center clear      # remove demo data (--all wipes everything)
npx ai-command-center stats      # terminal usage/cost summary
npx ai-command-center snippets   # integration code for every language
npx ai-command-center user add   # manage accounts (first user = admin)
```

Flags: `--port` · `--host 0.0.0.0` (share on a LAN) · `--data-dir` · `--config` ·
`--preset <name>` · `--no-auth` · `--gateway <url>` (point `stats`/`clear`/`demo`
at a running gateway's API instead of local files - `stats` and `clear` always
print which store they actually read, so a cwd/data-dir mismatch is visible).

## Configuration, auth, security

Everything is optional and the defaults are sensible. The full reference lives in
the docs:

- **[Configuration](https://aicommandcenter.vercel.app/docs/config)** - layered config, presets, currency, custom providers, pricing overrides. Note: custom-provider models are usually missing from the public price sheet - pair them with a `pricing` block or their requests record unpriced (`stats` names the models to add).
- **[Auth & teams](https://aicommandcenter.vercel.app/docs/auth)** - open until you create the first admin, then login plus per-project gateway keys and team-scoped visibility.
- **[Security](https://aicommandcenter.vercel.app/docs/security)** - keys pass through and are never logged, no message bodies are stored, and cross-origin protection keeps a random web page from spending your keys or wiping telemetry.
- **[Self-hosting](https://aicommandcenter.vercel.app/docs/self-hosting)** - the gateway sits in the request path and is **not fail-open**: if it's down, LLM calls fail at the client after the SDK's own retries. For anything beyond local dev, run it supervised (systemd / docker-compose examples with a pinned version, `restart: unless-stopped`, and the data dir on a volume) and keep the kill switch in mind - unset the base URL in the consuming app and it calls providers directly again (assuming the app has its own provider keys, i.e. you are not relying on centrally injected `keys`).

## Benchmarks

Reproducible with `npm run evals` against an in-process mock upstream (no keys, no
network), so anyone can rerun them:

| Metric                    | Result                                                     |
| ------------------------- | ---------------------------------------------------------- |
| Added proxy latency (p50) | **0.21 ms** (negligible against 300 ms-30 s LLM calls)     |
| Cost accuracy             | **0 mismatches** across 20 provider/model/token cases      |
| Usage-parser coverage     | **100%** of provider response shapes (stream + non-stream) |
| Runtime dependencies      | **0**                                                      |

Latest full report: [`evals/REPORT.md`](evals/REPORT.md).

## Company vs open-source build

Same MIT codebase. A company build is just a **config preset** (branding,
defaults) loaded with `--preset` - there is no feature difference:

```bash
npx ai-command-center start --preset example
```

Drop your own under `packages/gateway/presets/<name>.json`.

## Repo layout

```
packages/gateway     the npm package: CLI + proxy + dashboard (zero runtime deps)
packages/sdk-python  optional thin Python helper (aicc.init)
packages/sdk-js      optional thin JS helper (@ai-command-center/sdk)
evals/               reproducible overhead + cost-accuracy benchmarks
examples/            runnable Python / Node / curl / Java integrations
site/                the marketing + docs website (Next.js)
docs/                comparison, demo script
```

## Development

```bash
npm test          # 92 tests - mock upstream providers, no API keys needed
npm run evals     # overhead + cost-accuracy report
npm start         # run the gateway from source
cd site && npm run dev   # the website
```

Contributions are welcome - start with [CONTRIBUTING.md](CONTRIBUTING.md) and
[AGENTS.md](AGENTS.md). Security reports go to [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE) © 2026 Aditya Sarade. Not affiliated with OpenAI, Anthropic, or Google.
