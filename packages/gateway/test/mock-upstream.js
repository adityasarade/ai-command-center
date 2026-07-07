import http from 'node:http';

/**
 * Emulates OpenAI / Anthropic / Gemini API shapes (stream + non-stream)
 * closely enough to exercise the gateway's proxying and usage parsing.
 * Records the last request (headers/body/path) for assertions.
 */
export function startMockUpstream() {
  const state = { last: null };

  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks).toString('utf8');
    let body = null;
    try {
      body = raw ? JSON.parse(raw) : null;
    } catch {
      /* keep raw */
    }
    const url = new URL(req.url, 'http://mock');
    state.last = { path: url.pathname, search: url.search, headers: req.headers, body, raw };

    // ---- forced failure ----
    if (body?.model === 'fail-me' || url.pathname.includes('fail500')) {
      res.writeHead(500, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ error: { message: 'mock upstream exploded', type: 'server_error' } }));
    }

    // ---- OpenAI chat completions ----
    if (url.pathname === '/v1/chat/completions') {
      const model = body?.model || 'gpt-test';
      if (body?.stream) {
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
        send({ id: 'c1', model, choices: [{ delta: { content: 'Hel' } }], usage: null });
        send({ id: 'c1', model, choices: [{ delta: { content: 'lo' } }], usage: null });
        if (body.stream_options?.include_usage) {
          send({
            id: 'c1',
            model,
            choices: [],
            usage: { prompt_tokens: 120, completion_tokens: 30, prompt_tokens_details: { cached_tokens: 20 } },
          });
        }
        res.write('data: [DONE]\n\n');
        return res.end();
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(
        JSON.stringify({
          id: 'c1',
          model,
          choices: [{ message: { role: 'assistant', content: 'Hello' } }],
          usage: { prompt_tokens: 120, completion_tokens: 30, prompt_tokens_details: { cached_tokens: 20 } },
        }),
      );
    }

    // ---- OpenAI embeddings ----
    if (url.pathname === '/v1/embeddings') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(
        JSON.stringify({
          object: 'list',
          model: body?.model || 'text-embedding-3-small',
          data: [{ embedding: [0.1, 0.2] }],
          usage: { prompt_tokens: 512, total_tokens: 512 },
        }),
      );
    }

    // ---- Anthropic messages ----
    if (url.pathname === '/v1/messages') {
      const model = body?.model || 'claude-test';
      if (body?.stream) {
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        const send = (event, obj) => res.write(`event: ${event}\ndata: ${JSON.stringify(obj)}\n\n`);
        send('message_start', {
          type: 'message_start',
          message: {
            id: 'm1',
            model,
            usage: { input_tokens: 200, output_tokens: 1, cache_read_input_tokens: 100, cache_creation_input_tokens: 10 },
          },
        });
        send('content_block_delta', { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello' } });
        send('message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 45 } });
        send('message_stop', { type: 'message_stop' });
        return res.end();
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(
        JSON.stringify({
          id: 'm1',
          model,
          content: [{ type: 'text', text: 'Hello' }],
          usage: { input_tokens: 200, output_tokens: 45, cache_read_input_tokens: 100, cache_creation_input_tokens: 10 },
        }),
      );
    }

    // ---- Gemini generateContent / streamGenerateContent ----
    const gem = /^\/v1beta\/models\/([^:]+):(\w+)$/.exec(url.pathname);
    if (gem) {
      const [, model, method] = gem;
      if (method === 'streamGenerateContent') {
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
        send({
          candidates: [{ content: { parts: [{ text: 'Hel' }] } }],
          usageMetadata: { promptTokenCount: 300, totalTokenCount: 300 },
          modelVersion: model,
        });
        send({
          candidates: [{ content: { parts: [{ text: 'lo' }] } }],
          usageMetadata: { promptTokenCount: 300, candidatesTokenCount: 80, thoughtsTokenCount: 15, totalTokenCount: 395 },
          modelVersion: model,
        });
        return res.end();
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: 'Hello' }] } }],
          usageMetadata: {
            promptTokenCount: 300,
            candidatesTokenCount: 80,
            thoughtsTokenCount: 15,
            cachedContentTokenCount: 50,
            totalTokenCount: 395,
          },
          modelVersion: model,
        }),
      );
    }

    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: { message: `mock has no route for ${url.pathname}` } }));
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({
        server,
        state,
        url: `http://127.0.0.1:${server.address().port}`,
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}
