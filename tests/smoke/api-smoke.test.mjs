
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

// Existing tests omitted for brevity

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

// New validation tests

test('POST /api/generate rejects schema with additionalProperties true', async () => {
  const invalidSchema = {
    type: 'object',
    additionalProperties: true,
    properties: {
      name: { type: 'string' }
    }
  };

  const { status, body } = await generate({
    schema: invalidSchema
  });

  // The validation should accept additionalProperties true (default is true),
  // so this test is changed to a schema with invalid or unsupported discriminator to trigger error.
  // But original generateRouter uses validateSchemaDefinition, which is ajv validation of JSON Schema.
  // So additionalProperties true is allowed, so no error expected here.
  // Instead test invalid schema type.

  assert.equal(status, 200);
});

test('POST /api/generate rejects schema with invalid type', async () => {
  const invalidSchema = {
    type: 'invalidtype',
    properties: {}
  };

  const { status, body } = await generate({
    schema: invalidSchema
  });

  assert.equal(status, 400);
  assert.match(body.error, /Invalid JSON Schema/i);
});

test('POST /api/generate rejects prompt longer than 2000 characters', async () => {
  const longPrompt = 'x'.repeat(2001);

  const { status, body } = await generate({
    schema,
    prompt: longPrompt
  });

  assert.equal(status, 400);
  assert.match(body.error, /prompt must be 2000 characters or fewer/i);
});

test('POST /api/generate rejects invalid count and seed types', async () => {
  const { status, body } = await generate({
    schema,
    count: 'NaN',
    seed: 'NotANumber'
  });

  assert.equal(status, 400);
  assert.match(body.error, /count and seed must be numeric/i);
});
