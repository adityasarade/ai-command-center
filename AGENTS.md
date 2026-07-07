# AGENTS.md

Guidance for AI coding agents working **in this repository** and for agents
**integrating a project** with AI Command Center. (Human contributors: see
[CONTRIBUTING.md](CONTRIBUTING.md).)

## What this project is

A dependency-free Node.js LLM gateway + self-hosted usage/cost dashboard. Apps
point their provider SDK's base URL at the gateway; it forwards the call
untouched, streams the response back, and records token/cost/latency metadata.

## Repository map

```
packages/gateway/        the npm package `ai-command-center`
  bin/aicc.js            CLI (start, demo, clear, stats, snippets, user)
  src/server.js          HTTP server: routing, auth gate, API, static
  src/proxy.js           the transparent LLM proxy (streaming tee-parse)
  src/providers.js       provider registry + proxy-path parsing
  src/usage.js           per-schema token-usage extraction (openai/anthropic/gemini)
  src/pricing.js         cost engine (longest-prefix model match)
  pricing/pricing.json   USD-per-1M-token table (sibling of src/)
  src/stats.js           aggregation for the dashboard/API
  src/store.js           append-only JSONL persistence
  src/fx.js              currency exchange rates
  src/auth.js            zero-dep scrypt + HMAC-cookie auth, teams, keys
  src/cors.js            origin policy
  src/config.js          layered config + presets
  public/                the dashboard (index.html, app.js, style.css)
  presets/               config presets (e.g. medikabazaar.json)
  test/                  node:test suite + mock upstream
evals/                   reproducible overhead/cost/parser benchmarks
packages/sdk-python, packages/sdk-js   optional thin helpers
examples/                runnable per-language integrations
site/                    the Next.js marketing + docs website
docs/                    comparison, demo script
```

## Working in this repo — rules

- **No runtime dependencies.** The gateway must stay pure Node (ESM, Node ≥ 18.17).
  The dashboard vendors Chart.js and nothing else. Do not add npm runtime deps.
- **Every change ships with a test.** Run `npm test` (mock upstreams, no keys).
  For proxy/pricing changes also run `npm run evals`.
- **Never store prompt/response bodies.** The proxy logs metadata only — keep it that way.
- **Prices drift.** If you touch `pricing/pricing.json`, cite the provider price page.
- **Keep docs truthful.** Update the README, `site/`, and `docs/comparison.md` when behavior changes.

Common commands:

```bash
npm test                                   # full suite
npm run evals                              # overhead + cost accuracy report
node packages/gateway/bin/aicc.js start    # run from source
node packages/gateway/bin/aicc.js demo     # seed sample data
cd site && npm run dev                     # the website
```

## Integrating a project with the gateway (for agents writing app code)

The gateway is an HTTP proxy. To route an app through it, set the provider SDK's
base URL — do **not** change how the app calls the model otherwise, and never
move the user's API key.

- OpenAI-compatible: base URL `http://<gateway>/p/<project>/openai/v1`
- Anthropic: `http://<gateway>/p/<project>/anthropic`
- Gemini: `http://<gateway>/p/<project>/gemini`
- Zero-code option: set `OPENAI_BASE_URL` / `ANTHROPIC_BASE_URL` / `GOOGLE_GEMINI_BASE_URL`.
- `<project>` groups calls on the dashboard; you may also send header `x-aicc-project: <name>`.
- If the gateway has auth enabled, use `/k/<gateway-key>/…` instead of `/p/<project>/…`
  (the key both authenticates and sets the project), or send header `x-aicc-key`.
- For usage the proxy can't see (batch jobs, unsupported providers):
  `POST http://<gateway>/api/track` with JSON `{project, provider, model, tokensIn, tokensOut}`.

Default gateway origin is `http://localhost:4321`. A machine-readable overview
is at `<gateway>/llms.txt` and on the site at `/llms.txt`.

Do not invent flags or endpoints. The authoritative HTTP surface is in
[the API docs](https://aicommandcenter.vercel.app/docs/api) and `src/server.js`.
