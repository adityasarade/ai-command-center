# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project aims to
follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Traces / sessions**: group the LLM calls of one request or agent run via an
  `x-aicc-trace` header; a Traces dashboard view lists sessions and their timelines.
- **Prompt registry**: track prompt templates and versions via `x-aicc-prompt` /
  `x-aicc-prompt-version`; a Prompts view compares cost, latency and error rate per version.
- **Budgets & alerts**: per-project monthly budgets with threshold alerts, plus
  per-project error-rate / p95-latency alerts and an optional `alertWebhook`.
- **Anomaly detection**: rule-based cost-spike and error-burst flags per project.
- **Model comparison** view: effective cost per 1M tokens, p50/p95 latency, error rate.
- **Dashboard**: multi-view UI (Overview / Traces / Prompts / Models / Alerts) with
  request-feed pagination.
- New API endpoints: `/api/traces`, `/api/trace`, `/api/prompts`, `/api/models`,
  `/api/anomalies`, `/api/alerts`, and admin `/api/admin/budget`.
- ESLint + Prettier with a CI lint job; a marketing + docs website under `site/`.

### Changed

- Auth: password hashing is now async (non-blocking); gateway keys compared in
  constant time; session cookie gets `Secure` behind TLS.

## [0.1.0] - 2026-07

First public release.

### Added

- **LLM gateway**: transparent HTTP proxy for OpenAI, Anthropic, Gemini,
  OpenRouter, Mistral, DeepSeek, xAI, Groq, Together, Ollama, and any
  OpenAI-compatible endpoint. Streaming and non-streaming; usage parsed on the
  side without altering the response.
- **Usage & cost capture**: tokens (incl. cache read/write), latency, TTFB,
  errors, and computed USD cost per request, grouped by project.
- **Dashboard**: self-hosted single page - spend/requests/tokens/latency tiles,
  spend-over-time stacked by project, by-project and by-model breakdowns,
  provider split, live request feed (SSE), search and filters.
- **Currency**: INR-first display with a ₹/$/€ toggle and live daily FX
  (ECB via frankfurter.app, with fallback); data stored in USD.
- **Auth & access control**: optional (on by default) - first-run admin setup,
  session login, teams, per-project gateway keys, team-scoped project visibility.
- **CLI**: `start`, `demo`, `clear`, `stats`, `snippets`, `user`.
- **Thin SDKs**: optional Python (`aicc`) and JS (`@ai-command-center/sdk`)
  helpers that only set base-URL env vars.
- **Config presets**: OSS default plus an example company preset (branding +
  currency), so the same codebase serves a private company build.
- **Evals**: reproducible proxy-overhead and cost-accuracy benchmarks.

### Security

- Cross-origin protection on the proxy and all state-changing endpoints;
  central keys are never injected for untrusted cross-origin requests.
- No prompt/response bodies are ever stored - metadata only.
