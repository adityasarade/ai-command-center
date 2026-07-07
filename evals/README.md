# Evals

Reproducible, dependency-free evaluations of the gateway. They run against an
in-process mock upstream - **no API keys and no network** - so anyone can
reproduce them and CI can gate on them.

```bash
npm run evals          # run all, print + write REPORT.md
node evals/run.js --ci # same, but exit non-zero if a hard threshold is missed
```

Three checks:

1. **Proxy overhead** - added latency of routing through the gateway vs. calling
   the same mock directly, as p50/p95/p99 over 400 paired requests. Absolute
   numbers are machine-dependent; the _delta_ is the point (sub-millisecond in
   practice, negligible against real 300 ms-30 s LLM calls).
2. **Cost accuracy** - the gateway's computed USD cost vs. an independent
   recomputation from the published price sheet, across many (provider, model,
   token-mix) cases. Target: exact (0 mismatches).
3. **Parser coverage** - the fraction of provider response shapes (streaming and
   non-streaming, across the OpenAI/Anthropic/Gemini schemas) the usage parser
   reads token counts from. Target: 100%.

The latest committed run is in [`REPORT.md`](REPORT.md). Re-run it any time; it
overwrites that file.
