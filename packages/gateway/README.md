# ai-command-center

**One gateway, every AI project, one dashboard.**

A dependency-free LLM gateway and self-hosted usage & cost dashboard. Point any
project at it - any language, one command - and see tokens, cost, latency, and
errors for every AI product in one place. Your API keys pass straight through;
prompt and response bodies are never stored.

```bash
npx ai-command-center        # gateway + dashboard at http://localhost:4321
npx ai-command-center demo   # seed 14 days of realistic sample data
```

Integrate by changing one base URL (your key never moves):

```python
from openai import OpenAI
client = OpenAI(base_url="http://localhost:4321/p/invoice-bot/openai/v1")
```

Works with OpenAI, Anthropic, Gemini, OpenRouter, Mistral, DeepSeek, xAI, Groq,
Together, Ollama, and any OpenAI-compatible endpoint - from any language, or with
zero code change via `OPENAI_BASE_URL` / `ANTHROPIC_BASE_URL` /
`GOOGLE_GEMINI_BASE_URL`.

- **Cost** in ₹ / $ / € with live rates, exact from real token counts.
- **Team-ready**: optional login, teams, and per-project gateway keys.
- **Zero runtime dependencies**; telemetry is local append-only JSONL.
- **Not** a tracing/eval/routing platform - a cost dashboard that just runs.

## Docs & live demo

**https://aicommandcenter.vercel.app** - quickstart, per-language integration, config,
auth, HTTP API, providers, self-hosting, security, and an honest comparison with
Langfuse / Helicone / LangSmith / LiteLLM / Portkey.

## CLI

```
ai-command-center start | demo | clear | stats | snippets | user
  --port --host --data-dir --config --preset --no-auth
```

Source, issues, contributing: https://github.com/adityasarade/ai-command-center · MIT.
