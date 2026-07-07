# aicc-sdk (Python)

Thin helper for [AI Command Center](../../README.md). One line routes every
OpenAI / Anthropic / Gemini SDK call in your process through the gateway, so
usage and cost land on the consolidated dashboard.

```python
import aicc
aicc.init(project="invoice-bot")   # BEFORE creating clients

from openai import OpenAI
client = OpenAI()                   # unchanged code, now fully tracked
```

The SDK only sets standard environment variables (`OPENAI_BASE_URL`,
`ANTHROPIC_BASE_URL`, `GOOGLE_GEMINI_BASE_URL`) — you can also set those by
hand and skip this package entirely. Your API keys never change hands.

Extras:

```python
aicc.url("mistral")                       # gateway base URL for any provider
aicc.track(model="gpt-4o-mini",           # report usage the gateway can't see
           tokens_in=1200, tokens_out=300)
```

Install (local, from this repo): `pip install -e packages/sdk-python`
