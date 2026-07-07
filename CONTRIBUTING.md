# Contributing

Thanks for considering a contribution. AI Command Center is a small, dependency-free
codebase on purpose - the bar for new dependencies and new surface area is high, and
that keeps it easy to audit and trivial to run.

## Ground rules

- **No runtime dependencies.** The gateway is plain Node (ESM, Node ≥ 18.17). The
  dashboard vendors Chart.js and nothing else. A PR that adds an `npm` runtime
  dependency needs a strong justification.
- **Tests come with the change.** Every behavior change or fix ships with a test
  under `packages/gateway/test/`. Run `npm test` - all tests must pass.
- **Match the surrounding style.** No formatter is enforced; mirror the existing
  code (2-space indent, small focused modules, comments only where they earn it).
- **Keep it truthful.** Docs, the README, and the comparison table must stay
  accurate. If a change makes a claim stale, update the claim.

## Getting set up

```bash
git clone https://github.com/adityasarade/ai-command-center
cd ai-command-center
npm install          # only installs the dev toolchain; runtime has no deps
npm test             # runs the full suite (mock upstreams, no API keys needed)
node packages/gateway/bin/aicc.js start   # run the gateway from source
node packages/gateway/bin/aicc.js demo    # seed sample data to click around
```

## Project layout

```
packages/gateway      the npm package (bin/ CLI, src/ gateway, public/ dashboard,
                      pricing/ price table, test/ suite)
packages/sdk-python   optional thin Python helper
packages/sdk-js       optional thin JS helper
evals/                reproducible overhead + cost-accuracy benchmarks
examples/             runnable per-language integrations
site/                 the marketing + docs website (Next.js)
docs/                 supporting docs (demo script, etc.)
```

## Making a change

1. Branch off `main`.
2. Make the change with a test.
3. `npm test` and, for anything touching the proxy or pricing, `npm run evals`.
4. Open a PR describing what changed and why. Screenshots help for dashboard changes.

## Adding a provider or pricing

- **New provider**: add an entry to `BUILTIN_PROVIDERS` in `src/providers.js`
  (set `kind` to `openai`/`anthropic`/`gemini` - most are `openai`-compatible).
- **New/updated model price**: edit `pricing/pricing.json` (USD per 1M tokens,
  longest-prefix match). Cite the provider's price page in the PR - prices drift.

## Reporting bugs / security

Regular bugs → GitHub issues. Security issues → see [SECURITY.md](SECURITY.md).
