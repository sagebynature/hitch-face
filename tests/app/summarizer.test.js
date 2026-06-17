const assert = require('assert');
const http = require('http');

(async () => {
  const { applyHostConfig, escapeHtml, normalizeSummarizerConfig, summarizeEvent, updateTickerSummary } = await import('../../app/frontend/renderer.js');

  assert.strictEqual(escapeHtml('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');

  console.log('Running summarizer unit tests...');

  const normalized = normalizeSummarizerConfig({
    base_url: 'http://localhost:9000/v1/',
    api_key: 'omlx',
    model: 'mlx-community--Qwen3-0.6B-4bit',
    prompt: 'Summarize under 20 words.  Only reply with answer',
    temperature: 0.2,
    max_token: 20,
  });
  assert.deepStrictEqual(normalized, {
    base_url: 'http://localhost:9000/v1',
    api_key: 'omlx',
    model: 'mlx-community--Qwen3-0.6B-4bit',
    prompt: 'Summarize under 20 words.  Only reply with answer',
    temperature: 0.2,
    max_token: 20,
  });

  const infoCalls = [];
  const originalInfo = console.info;
  console.info = (...args) => infoCalls.push(args.join(' '));
  try {
    applyHostConfig({ summarizer: normalized });
  } finally {
    console.info = originalInfo;
  }
  assert.strictEqual(infoCalls.length, 1);
  assert.match(infoCalls[0], /summarizer configured/);
  assert.match(infoCalls[0], /mlx-community--Qwen3-0\.6B-4bit/);
  assert.doesNotMatch(infoCalls[0], /omlx/);

  const seen = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      seen.push({
        method: req.method,
        url: req.url,
        authorization: req.headers.authorization,
        body: JSON.parse(body),
      });
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({
        choices: [{ message: { content: '  Tool search completed\nwith two matches.  ' } }],
      }));
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const { port } = server.address();
    const summary = await summarizeEvent(
      { hitch_event_type: 'tool.completed', harness: 'codex', payload: { tool: { name: 'search' } } },
      {
        base_url: `http://127.0.0.1:${port}/v1`,
        api_key: 'omlx',
        model: 'local-model',
        prompt: 'Summarize under 20 words. Only reply with answer',
        temperature: 0.2,
        max_token: 20,
      },
    );

    assert.strictEqual(summary, 'Tool search completed with two matches.');
    assert.strictEqual(seen.length, 1);
    assert.strictEqual(seen[0].method, 'POST');
    assert.strictEqual(seen[0].url, '/v1/chat/completions');
    assert.strictEqual(seen[0].authorization, 'Bearer omlx');
    assert.strictEqual(seen[0].body.model, 'local-model');
    assert.strictEqual(seen[0].body.temperature, 0.2);

    const ticker = { textContent: 'fallback ticker text' };
    const updatePromise = updateTickerSummary(
      { hitch_event_type: 'tool.completed', harness: 'codex', payload: { tool: { name: 'search' } } },
      ticker,
      {
        base_url: `http://127.0.0.1:${port}/v1`,
        model: 'local-model',
        prompt: 'Summarize under 20 words. Only reply with answer',
        temperature: 0.2,
        max_token: 20,
      },
    );
    assert.strictEqual(typeof updatePromise?.then, 'function');
    await updatePromise;
    assert.strictEqual(ticker.textContent, 'Tool search completed with two matches.');
    assert.strictEqual(seen[0].body.max_tokens, 20);
    assert.strictEqual(seen[0].body.messages[0].content, 'Summarize under 20 words. Only reply with answer');
    assert.ok(seen[0].body.messages[1].content.includes('tool.completed'));
  } finally {
    await new Promise(resolve => server.close(resolve));
  }

  console.log('✅ PASS: summarizer config and OpenAI-compatible request');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
