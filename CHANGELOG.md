# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project aims to
follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
