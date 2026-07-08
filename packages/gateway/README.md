# ai-command-center

**One gateway, every AI project, one dashboard.**

A zero-dependency LLM gateway with a self-hosted usage and cost dashboard. Point
any project at it - any language, one command - and see tokens, cost, latency, and
errors for every AI product in one place. Your API keys pass straight through, and
prompt and response bodies are never stored.

```bash
npx ai-command-center        # gateway + dashboard on http://localhost:4321
npx ai-command-center demo   # seed 14 days of sample data to explore first
```

Integrate by changing one base URL. Your key never moves:

```python
from openai import OpenAI
client = OpenAI(base_url="http://localhost:4321/p/invoice-bot/openai/v1")
```

That is the whole integration. It works with OpenAI, Anthropic, Gemini,
OpenRouter, Mistral, DeepSeek, xAI, Groq, Together, Ollama, and any
OpenAI-compatible endpoint - from any language, or with zero code change via
`OPENAI_BASE_URL` / `ANTHROPIC_BASE_URL` / `GOOGLE_GEMINI_BASE_URL`.

The dashboard has five views: cost and usage (in rupees, dollars, or euros at live
rates, exact from real token counts), traces and sessions, prompt versions, model
comparison, and budgets with anomaly alerts. Optional login, teams, and
per-project gateway keys let a team see only their own projects. Everything is
local append-only JSONL - no database, no runtime dependencies. It is not a
tracing, eval, or routing platform; it is the cost dashboard that just runs.

## Docs & live demo

**https://aicommandcenter.vercel.app** - quickstart, per-language integration,
config, auth, the HTTP API, providers, self-hosting, security, and an honest
comparison with Langfuse, Helicone, LangSmith, LiteLLM, and Portkey.

## CLI

```
ai-command-center start | demo | clear | stats | snippets | user
  --port --host --data-dir --config --preset --no-auth
```

Source, issues, contributing: https://github.com/adityasarade/ai-command-center · MIT.
