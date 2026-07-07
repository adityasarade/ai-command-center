# ◆ AI Command Center

**One gateway, every AI project, one dashboard.**

Drop-in usage & cost monitoring for every project that calls an LLM — in any
language. No code rewrite, no vendor lock-in, no per-language SDK to maintain:
your apps keep using their official OpenAI / Anthropic / Gemini clients and
their own API keys; they just point at the gateway, and every call lands on a
consolidated dashboard with tokens, cost, latency, errors, and live updates.

This is the working MVP of the **AI Box** platform described in [`Docs/pitch.md`](Docs/pitch.md)
— specifically its SDK + LLM Gateway + cost-visibility slice.

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  Python app  │    │   Java app   │    │  Node app    │      any language,
└──────┬───────┘    └──────┬───────┘    └──────┬───────┘      any framework
       │ base_url          │ base_url          │ base_url
       ▼                   ▼                   ▼
┌─────────────────────────────────────────────────────────┐
│           AI Command Center gateway  :4321               │
│   pass-through proxy · token/cost capture · JSONL log    │
│   ┌────────────────────────────────────────────────┐    │
│   │  dashboard  ·  live feed  ·  stats API  ·  SSE  │    │
│   └────────────────────────────────────────────────┘    │
└──────┬──────────┬──────────┬──────────┬─────────────────┘
       ▼          ▼          ▼          ▼
    OpenAI    Anthropic    Gemini    OpenRouter · Mistral · DeepSeek
                                     xAI · Groq · Together · Ollama · custom
```

## Quickstart (60 seconds)

```bash
# 1. start the gateway + dashboard          (from this repo: npm start)
npx ai-command-center

# 2. point any project at it — env var only, zero code changes
export OPENAI_BASE_URL="http://localhost:4321/p/my-app/openai/v1"
python your_app.py        # or java -jar app.jar, node app.js, …

# 3. watch http://localhost:4321 — every call appears live with cost
```

No traffic yet? Seed a realistic 14-day, 4-project sample to explore the
dashboard (`removable anytime with npx ai-command-center clear`):

```bash
npx ai-command-center demo
```

> Running from this repo instead of npm: `node packages/gateway/bin/aicc.js start`

## How integration works

The gateway is a **transparent proxy**. Your app's provider SDK already
supports a custom base URL (every official SDK does), so integration is one
line — or zero lines, via environment variables. API keys are **pass-through**:
they stay in your app and are forwarded to the provider unchanged.

The project name in the URL path (`/p/<project>/…`) — or an `x-aicc-project`
header — is how calls are grouped on the dashboard.

**Python**
```python
from openai import OpenAI
client = OpenAI(base_url="http://localhost:4321/p/invoice-bot/openai/v1")

from anthropic import Anthropic
client = Anthropic(base_url="http://localhost:4321/p/invoice-bot/anthropic")
```

**JavaScript / TypeScript**
```js
import OpenAI from "openai";
const client = new OpenAI({ baseURL: "http://localhost:4321/p/support-bot/openai/v1" });
```

**Java** — see [`examples/java-demo`](examples/java-demo/README.md)
```java
OpenAIClient client = OpenAIOkHttpClient.builder()
    .fromEnv().baseUrl("http://localhost:4321/p/claims-ai/openai/v1").build();
```

**Anything at all** (Go, Rust, PHP, shell, LangChain, Spring AI…) — set the env var:
```bash
export OPENAI_BASE_URL="http://localhost:4321/p/my-app/openai/v1"
export ANTHROPIC_BASE_URL="http://localhost:4321/p/my-app/anthropic"
```

**Optional thin SDKs** (they only set those env vars for you):
```python
import aicc; aicc.init(project="invoice-bot")        # packages/sdk-python
```
```js
import { init } from "@ai-command-center/sdk"; init({ project: "support-bot" });
```

**Escape hatch** — for batch jobs or providers the proxy doesn't cover, report
usage directly and it's priced + dashboarded the same way:
```bash
curl -X POST http://localhost:4321/api/track -H "Content-Type: application/json" \
  -d '{"project":"nightly-job","provider":"openai","model":"gpt-4o","tokensIn":52000,"tokensOut":9000}'
```

Print all snippets for your own project name: `npx ai-command-center snippets --project my-app`

## Supported providers

| Route prefix | Upstream | Usage & cost parsing |
|---|---|---|
| `/openai` | api.openai.com | chat completions, responses API, embeddings — stream + non-stream, cached tokens |
| `/anthropic` | api.anthropic.com | messages — stream + non-stream, cache read/write pricing |
| `/gemini` | generativelanguage.googleapis.com | generateContent + streamGenerateContent, thinking tokens |
| `/openrouter` `/mistral` `/deepseek` `/xai` `/groq` `/together` | respective APIs | OpenAI-compatible schema |
| `/ollama` | localhost:11434 | OpenAI-compatible; priced $0 by default |
| custom | anything OpenAI-compatible (Azure, vLLM, LiteLLM…) | add under `providers` in config |

Streaming responses are passed through **byte-for-byte** while usage is parsed
on the side; for OpenAI-style streams the gateway quietly injects
`stream_options: {include_usage: true}` so the final chunk carries token counts.

## CLI

```
npx ai-command-center            # start gateway + dashboard (default)
npx ai-command-center demo       # seed 14 days of sample data (tagged, removable)
npx ai-command-center clear      # remove demo data (--all wipes everything)
npx ai-command-center stats      # terminal summary (--range 30d, --json)
npx ai-command-center snippets   # integration code for every language
```

Options: `--port` (default 4321) · `--host` (0.0.0.0 to share on LAN) ·
`--data-dir` · `--config` · `--no-open`

## Configuration (all optional)

`~/.ai-command-center/config.json`, `./aicc.config.json`, or `--config file.json`:

```jsonc
{
  "port": 4321,
  "host": "127.0.0.1",              // 0.0.0.0 → team-shared gateway on LAN/server

  // OPTIONAL central keys — injected only when the caller sends none.
  "keys": { "openai": "sk-…", "anthropic": "sk-ant-…" },

  // Custom OpenAI-compatible providers (Azure OpenAI, vLLM, internal…)
  "providers": {
    "azure": { "upstream": "https://myorg.openai.azure.com", "kind": "openai", "authHeader": "api-key" }
  },

  // Point a built-in provider somewhere else (region endpoint, test double…)
  "upstreams": { "openai": "http://localhost:8080" },

  // Extend/override the shipped pricing table (USD per 1M tokens,
  // longest-prefix match; "provider:*" = provider-wide default)
  "pricing": { "my-finetune": { "in": 1.0, "out": 4.0 } },

  // Secondary display currency on the dashboard
  "currency": { "code": "INR", "perUsd": 84 }
}
```

Environment: `AICC_PORT`, `AICC_HOST`, `AICC_DATA_DIR`, `AICC_GATEWAY` (used by SDKs/examples).

## What gets stored (and where)

Append-only JSONL at `~/.ai-command-center/events.jsonl` — one record per call:
timestamp, project, provider, model, endpoint, status, latency, TTFB,
tokens (in/out/cache-read/cache-write), computed USD cost, error info.
**Prompt and response bodies are never stored** — only metadata — so no
PII/PHI lands on disk. Delete the file (or `aicc clear --all`) to reset.

## Dashboard & API

The dashboard (`http://localhost:4321`) shows total spend / requests / tokens /
latency percentiles with period-over-period deltas, spend over time stacked by
project, spend by project and by model, provider split, error tracking, and a
live request feed (SSE) with search and errors-only filter — plus demo-data
seeding and cleanup built in.

Everything it uses is a plain JSON API you can build on:

```
GET  /health                 GET  /api/stats?range=7d&project=x
GET  /api/meta               GET  /api/requests?limit=100&errorsOnly=1&q=gpt
GET  /api/projects           GET  /api/events            (SSE live feed)
POST /api/track              DELETE /api/records?simulated=1
```

## Repo layout

```
packages/gateway       the npm package (ai-command-center): CLI + proxy + dashboard
packages/sdk-python    optional thin Python helper (aicc.init)
packages/sdk-js        optional thin JS helper (@ai-command-center/sdk)
examples/              runnable Python / Node / curl / Java integrations
Docs/                  the AI Box vision pitch & architecture this MVP implements
```

## Development

```bash
npm test          # 25 integration + unit tests (mock upstream providers, no keys needed)
npm start         # run the gateway from source
```

Zero runtime dependencies (Chart.js is vendored for the dashboard). Node ≥ 18.17.

## Current limitations (MVP)

- Pricing table ships with sane defaults but **will drift** — verify against
  provider price pages and override via config (unpriced models are flagged, never guessed).
- No auth on the dashboard/API — bind to localhost (default) or put it behind
  your VPN/reverse proxy when sharing.
- JSONL + in-memory aggregation is comfortable into the hundreds of thousands
  of records; beyond that, the storage layer is designed to be swapped (SQLite/Postgres).
- OpenAI Realtime/WebSocket APIs aren't proxied (HTTP only).
