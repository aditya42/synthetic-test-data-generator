
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';

let server;
let baseUrl;
let serverOutput = '';

async function getFreePort() {
  return new Promise((resolve, reject) => {
    const listener = createServer();
    listener.once('error', reject);
    listener.listen(0, '127.0.0.1', () => {
      const address = listener.address();
      const port = address.port;
      listener.close(() => resolve(port));
    });
  });
}

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    signal: AbortSignal.timeout(5000)
  });

  return {
    status: response.status,
    body: await response.json()
  };
}

async function generate(data) {
  return request('/api/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  });
}

const schema = {
  type: 'object',
  additionalProperties: false,
  required: ['age'],
  properties: {
    age: {
      type: 'integer',
      minimum: 18,
      maximum: 65
    }
  }
};

before(async () => {
  const port = await getFreePort();
  baseUrl = `http://127.0.0.1:${port}`;

  server = spawn(
    process.execPath,
    ['apps/api/dist/server.js'],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PORT: String(port),
        HOST: '127.0.0.1',
        ENABLE_DB_PERSISTENCE: 'false',
        OPENAI_API_KEY: '',
        PII_BLOCK_MODE: 'strict'
      },
      stdio: ['ignore', 'pipe', 'pipe']
    }
  );

  for (const stream of [server.stdout, server.stderr]) {
    stream.on('data', chunk => {
      serverOutput += chunk.toString();
    });
  }

  const deadline = Date.now() + 15000;

  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`API exited early:\n${serverOutput}`);
    }

    try {
      const response = await request('/health');
      if (response.status === 200) return;
    } catch {
      // API startup is still in progress.
    }

    await new Promise(resolve => setTimeout(resolve, 150));
  }

  throw new Error(`API startup timeout:\n${serverOutput}`);
});

after(async () => {
  if (server && server.exitCode === null) {
    server.kill('SIGTERM');
  }
});

test('GET /health returns healthy status', async () => {
  const { status, body } = await request('/health');

  assert.equal(status, 200);
  assert.equal(body.status, 'ok');
  assert.equal(body.databasePersistence, false);
  assert.equal(body.llmConfigured, false);
});

test('GET /ready succeeds without PostgreSQL', async () => {
  const { status, body } = await request('/ready');

  assert.equal(status, 200);
  assert.equal(body.status, 'ready');
  assert.equal(body.database, 'disabled');
});

test('GET /api/generate/ping returns OK', async () => {
  const { status, body } =
    await request('/api/generate/ping');

  assert.equal(status, 200);
  assert.equal(body.status, 'ok');
  assert.equal(body.route, 'generate');
});

test('POST /api/generate creates valid records', async () => {
  const { status, body } = await generate({
    schema,
    count: 3,
    seed: 42,
    mode: 'valid',
    useLlm: false
  });

  assert.equal(status, 200);
  assert.equal(body.count, 3);
  assert.equal(body.records.length, 3);
  assert.equal(body.validCount, 3);
  assert.equal(body.invalidCount, 0);
  assert.equal(body.llmUsed, false);

  for (const record of body.records) {
    assert.equal(record.validation.valid, true);
    assert.ok(record.data.age >= 18);
    assert.ok(record.data.age <= 65);
  }
});

test('POST /api/generate rejects missing schema', async () => {
  const { status, body } = await generate({
    count: 1
  });

  assert.equal(status, 400);
  assert.match(body.error, /schema is required/i);
});

test('POST /api/generate rejects invalid mode', async () => {
  const { status, body } = await generate({
    schema,
    mode: 'unsupported'
  });

  assert.equal(status, 400);
  assert.match(body.error, /mode must be/i);
});

test('POST /api/generate rejects invalid count', async () => {
  const { status, body } = await generate({
    schema,
    count: 'not-a-number'
  });

  assert.equal(status, 400);
  assert.match(body.error, /must be numeric/i);
});

test('POST /api/generate rejects unconfigured LLM', async () => {
  const { status, body } = await generate({
    schema,
    count: 1,
    mode: 'valid',
    useLlm: true
  });

  assert.equal(status, 400);
  assert.match(body.error, /OPENAI_API_KEY/i);
});

test('Unknown API route returns 404', async () => {
  const { status, body } =
    await request('/api/unknown-route');

  assert.equal(status, 404);
  assert.equal(body.error, 'Route not found');
});

test('Same seed produces identical records', async () => {
  const payload = {
    schema,
    count: 3,
    seed: 2026,
    mode: 'valid',
    useLlm: false
  };

  const first = await generate(payload);
  const second = await generate(payload);

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);

  assert.deepEqual(
    first.body.records,
    second.body.records
  );
});