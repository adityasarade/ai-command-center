/**
 * AI Command Center — Node.js integration demo (zero npm dependencies).
 *
 * Run the gateway first:  npx ai-command-center start
 * Then:                   node demo.mjs
 *
 * With OPENAI_API_KEY set it makes a real (streamed) call through the gateway;
 * without keys it falls back to /api/track so the dashboard always updates.
 */

import { init, track, url } from '../../packages/sdk-js/index.mjs';

init({ project: 'node-demo' });
// (equivalent zero-code alternative:
//   export OPENAI_BASE_URL=http://localhost:4321/p/node-demo/openai/v1 )

if (process.env.OPENAI_API_KEY) {
  // Plain fetch — any OpenAI client library works the same way.
  const res = await fetch(`${url('openai')}/chat/completions`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      stream: true,
      messages: [{ role: 'user', content: 'Say hello from AI Command Center in 5 words.' }],
    }),
  });
  if (!res.ok) {
    console.error('call failed:', res.status, await res.text());
  } else {
    let text = '';
    const decoder = new TextDecoder();
    for await (const chunk of res.body) {
      for (const line of decoder.decode(chunk, { stream: true }).split('\n')) {
        if (!line.startsWith('data:') || line.includes('[DONE]')) continue;
        try {
          text += JSON.parse(line.slice(5)).choices?.[0]?.delta?.content ?? '';
        } catch {}
      }
    }
    console.log('openai (streamed):', text.trim());
  }
} else {
  console.log('No OPENAI_API_KEY — using the /api/track fallback instead.');
  const ok = await track({
    provider: 'openai',
    model: 'gpt-4o-mini',
    tokensIn: 980,
    tokensOut: 240,
    latencyMs: 760,
  });
  console.log('tracked a sample record via /api/track:', ok ? 'ok' : 'gateway unreachable');
}

console.log('Open the dashboard: http://localhost:4321');
