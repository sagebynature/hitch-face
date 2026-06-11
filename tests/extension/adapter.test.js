const assert = require('assert');
const http = require('http');
const { spawn } = require('child_process');

function listen(server) {
  const { promise, resolve, reject } = Promise.withResolvers();

  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {
    server.off('error', reject);
    resolve(server.address().port);
  });

  return promise;
}

function close(server) {
  const { promise, resolve, reject } = Promise.withResolvers();

  server.close(err => {
    if (err) {
      reject(err);
      return;
    }
    resolve();
  });

  return promise;
}

function runAdapter(input, endpoint) {
  const { promise, resolve, reject } = Promise.withResolvers();
  const child = spawn(process.execPath, ['extension/dist/adapter.js'], {
    env: { ...process.env, HITCH_FACE_URL: endpoint },
    stdio: ['pipe', 'ignore', 'pipe']
  });
  let stderr = '';

  child.stderr.on('data', chunk => {
    stderr += chunk;
  });
  child.once('error', reject);
  child.once('exit', code => {
    resolve({ code, stderr });
  });
  child.stdin.end(input);

  return promise;
}

async function main() {
  console.log('Running adapter integration tests...');

  const requests = [];
  const server = http.createServer((req, res) => {
    let body = '';

    req.on('data', chunk => {
      body += chunk;
    });
    req.on('end', () => {
      requests.push({
        method: req.method,
        url: req.url,
        contentType: req.headers['content-type'],
        body
      });
      res.writeHead(204);
      res.end();
    });
  });

  const port = await listen(server);
  const endpoint = `http://127.0.0.1:${port}/event`;

  try {
    const payload = JSON.stringify({
      hitch_event_type: 'turn.completed',
      session_id: 'adapter-test',
      payload: { ok: true }
    });
    const valid = await runAdapter(payload, endpoint);
    assert.strictEqual(valid.code, 0);
    assert.strictEqual(valid.stderr, '');
    assert.strictEqual(requests.length, 1);
    assert.strictEqual(requests[0].method, 'POST');
    assert.strictEqual(requests[0].url, '/event');
    assert.strictEqual(requests[0].contentType, 'application/json');
    assert.strictEqual(requests[0].body, payload);

    const badJson = await runAdapter('{', endpoint);
    assert.strictEqual(badJson.code, 0);
    assert.strictEqual(requests.length, 1);

    const missingEvent = await runAdapter(JSON.stringify({ payload: {} }), endpoint);
    assert.strictEqual(missingEvent.code, 0);
    assert.strictEqual(requests.length, 1);
  } finally {
    await close(server);
  }

  const unreachable = await runAdapter(
    JSON.stringify({ hitch_event_type: 'turn.completed' }),
    'http://127.0.0.1:1/event'
  );
  assert.strictEqual(unreachable.code, 0);

  console.log('✅ PASS: adapter forwards valid envelopes and fails open');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
