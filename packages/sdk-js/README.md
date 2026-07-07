# @ai-command-center/sdk (JavaScript)

Thin helper for [AI Command Center](https://github.com/adityasarade/ai-command-center).
One call routes your OpenAI / Anthropic / Gemini SDK traffic through the gateway
so usage and cost land on the dashboard. It only sets standard base-URL env vars —
your API keys never change hands.

```js
import { init } from "@ai-command-center/sdk";
init({ project: "support-bot" });   // BEFORE constructing any client

import OpenAI from "openai";
const client = new OpenAI();          // unchanged code, now tracked
```

With auth enabled, pass the project's gateway key (or set `AICC_KEY`):

```js
init({ project: "support-bot", key: "aicc_…" });
```

Extras: `url("mistral")` returns the gateway base URL for any provider;
`track({ provider, model, tokensIn, tokensOut })` reports usage the proxy can't see.

MIT.
