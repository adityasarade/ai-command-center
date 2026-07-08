# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Nothing yet. Open an issue or PR at
https://github.com/adityasarade/ai-command-center.

## [0.2.0] - 2026-07-08

### Added

- **Provider routing** (opt-in): virtual routes that fail over and load-balance
  across an ordered pool of same-schema providers. Configure `routes` and call
  `/r/<route>/…`; the gateway retries the next member on a network error or a
  retryable status (default 429/500/502/503/504) before any response byte is
  streamed, `failover` or `round-robin`, using each member's central key. Every
  attempt is logged (with a `route` tag surfaced in the request feed), so
  fallbacks are visible. No new dependency, no client code change.
- **Quality evals** (offline, dependency-free): score prompt versions against
  datasets you own. A dataset is a set of `{ input, expected? }` rows; a run
  calls a target model then an LLM judge (1-5 rubric), records each result, and
  reports average score per prompt version - shown in a new **Evals** dashboard
  view and joined onto the Prompts view. No live-traffic capture; runs need a
  central key for the target and judge providers. New endpoints under
  `/api/evals`.
- **Roles & per-project grants**: a read-only **viewer** role, plus explicit
  per-user project grants (`allowedProjects`) that stack on top of team-scoped
  visibility - manageable from the settings panel. (Full OIDC/SAML SSO remains
  on the roadmap.)

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
