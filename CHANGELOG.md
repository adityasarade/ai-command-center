# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Nothing yet. Open an issue or PR at
https://github.com/adityasarade/ai-command-center.

## [0.2.1] - 2026-07-09

Polish release driven by a from-scratch external integration (a voice agent
using Gemini plus an OpenAI-compatible custom provider): the proxy path worked
first-try; everything below fixes the rough edges around it.

### Added

- **Custom providers are now visible**: config-registered providers appear in
  the `start` banner (marked `(custom)`, plus a startup line per provider
  showing upstream, kind, and where its API key comes from) and in `snippets`
  output. Previously a typo'd registration produced silent 404s with zero
  feedback that registration succeeded or failed.
- **`--gateway <url>` for `stats` / `clear` / `demo`**: operate on a running
  gateway's API instead of local files - works across machines and
  `--data-dir`s.
- **`stats` names unpriced models**: instead of a bare count, the CLI prints
  the exact models to add pricing overrides for (also exposed as
  `unpricedModels` on `/api/stats`).

### Fixed

- `stats` and `clear` print which store they actually read (data dir + record
  count on disk, or the live gateway URL) and, when the resolved store is
  empty, hint that a gateway may be running with a different `--data-dir` -
  previously they silently read the default store when run from a different
  cwd than the gateway.
- `stats` against an auth-locked local gateway no longer fails with a bare
  `HTTP 401`: it falls back to reading that gateway's files directly (the
  discovery file already proves the data dir), and auth-gated `--gateway`
  calls fail with an actionable message instead.
- Startup banner record count uses a thousands separator (`Records 8,762`).

### Docs

- Providers: custom providers need pricing overrides - models absent from the
  live LiteLLM price sheet are recorded unpriced (cost 0) until a `pricing`
  block covers them; documented the pattern next to the custom-provider
  example.
- Self-hosting: new failure-mode section - the gateway sits in the request
  path and is **not fail-open** (gateway down = connection refused at the
  client after SDK retries). Added a supervised docker-compose example (pinned
  npm version, `--host 0.0.0.0` in-container with the host port bound to
  `127.0.0.1`, data dir on a volume, `restart: unless-stopped`) and the
  base-URL kill-switch pattern.

## [0.2.0] - 2026-07-08

### Added

- **Provider routing** (opt-in): virtual routes that fail over and load-balance
  across an ordered pool of same-schema providers. Configure `routes` and call
  `/r/<route>/…`; the gateway retries the next member on a network error or a
  retryable status (default 429/500/502/503/504) before any response byte is
  streamed, `failover` or `round-robin`, using each member's central key. Every
  attempt is logged (with a `route` tag surfaced in the request feed), so
  fallbacks are visible. No new dependency, no client code change.
- **Roles & per-project grants**: a read-only **viewer** role, plus explicit
  per-user project grants (`allowedProjects`) that stack on top of team-scoped
  visibility - manageable from the settings panel. (Full OIDC/SAML SSO remains
  on the roadmap.)
- **Live model pricing**: prices are kept current from the community-maintained
  LiteLLM price sheet (US prices), cached to `dataDir/prices.json` and refreshed
  daily, with the shipped `pricing.json` as the offline fallback and
  `config.pricing` overrides always winning. Set `config.pricingUrl` to null to
  disable. No more silent price drift.
- **Optional retention**: `config.retentionDays` prunes request records older
  than N days (on start and daily), keeping the JSONL + in-memory store bounded
  on a long-running gateway. Defaults to keeping everything.

## [0.1.1] - 2026-07-08

### Added

- **Search and pagination on every dashboard view.** The Traces, Prompts, and
  Models tabs each get a text filter and prev/next pagination; the Alerts tab
  gets a filter across active alerts, anomalies, and budgets. The Overview
  request feed already had both. Filtering and paging are client-side, so no
  extra requests.

### Fixed

- Test scripts used a quoted glob (`node --test "test/*.test.js"`) that Node 18
  and 20 could not expand, so the CI test matrix failed on those versions.
  Dropped the quotes so the shell expands the glob; also bumped the GitHub
  Actions to v5.

## [0.1.0] - 2026-07-08

First public release, on npm as
[`ai-command-center`](https://www.npmjs.com/package/ai-command-center).

### Added

- **LLM gateway**: transparent HTTP proxy for OpenAI, Anthropic, Gemini,
  OpenRouter, Mistral, DeepSeek, xAI, Groq, Together, Ollama, and any
  OpenAI-compatible endpoint. Streaming and non-streaming; usage is parsed on the
  side without altering the response.
- **Usage & cost capture**: tokens (including cache read/write), latency, TTFB,
  errors, and computed USD cost per request, grouped by project.
- **Dashboard**: self-hosted multi-view UI - Overview (spend/requests/tokens/latency
  tiles, spend-over-time stacked by project, by-project and by-model breakdowns,
  provider split, live SSE request feed with search, filters, and pagination),
  plus Traces, Prompts, Models, and Alerts views.
- **Traces / sessions**: group the LLM calls of one request or agent run via an
  `x-aicc-trace` header; the Traces view lists sessions and their call timelines.
- **Prompt registry**: track prompt templates and versions via `x-aicc-prompt` /
  `x-aicc-prompt-version`; the Prompts view compares cost, latency, and error rate
  per version.
- **Budgets & alerts**: per-project monthly budgets with threshold alerts, plus
  per-project error-rate and p95-latency alerts and an optional `alertWebhook`.
- **Anomaly detection**: rule-based cost-spike and error-burst flags per project.
- **Model comparison**: effective cost per 1M tokens, p50/p95 latency, and error
  rate, side by side.
- **Currency**: INR-first display with a rupee/dollar/euro toggle and live daily
  FX (ECB via frankfurter.app, with fallback); data is stored in USD.
- **Auth & access control**: optional (on by default) - first-run admin setup,
  session login, teams, per-project gateway keys, and team-scoped project
  visibility.
- **CLI**: `start`, `demo`, `clear`, `stats`, `snippets`, `user`.
- **Thin SDKs**: optional Python (`aicc`) and JS (`@ai-command-center/sdk`)
  helpers that only set base-URL environment variables.
- **Config presets**: OSS default plus an example company preset (branding and
  currency), so the same codebase can serve a private company build.
- **HTTP API**: `/api/track`, `/api/traces`, `/api/trace`, `/api/prompts`,
  `/api/models`, `/api/anomalies`, `/api/alerts`, and admin `/api/admin/budget`.
- **Evals**: reproducible proxy-overhead and cost-accuracy benchmarks
  (`npm run evals`).
- **Project hygiene**: ESLint + Prettier with a CI lint job, a marketing and docs
  website under `site/`, and 61 tests.

### Security

- Cross-origin protection on the proxy and every state-changing endpoint; central
  keys are never injected for untrusted cross-origin requests.
- Password hashing is async (non-blocking); gateway keys are compared in constant
  time; the session cookie is marked `Secure` behind TLS.
- No prompt or response bodies are ever stored - metadata only.
