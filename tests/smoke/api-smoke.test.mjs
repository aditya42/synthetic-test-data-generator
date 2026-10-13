
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

// New validation and boundary tests for /api/generate

test('POST /api/generate rejects missing schema', async () => {
  const { status, body } = await generate({
    count: 1
  });

  assert.equal(status, 400);
  assert.match(body.error, /schema is required/i);
});

test('POST /api/generate rejects invalid JSON schema type', async () => {
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

// Boundary test: string minLength and maxLength

test('POST /api/generate accepts schema with string minLength and maxLength boundary values', async () => {
  const boundarySchema = {
    type: 'object',
    properties: {
      name: { type: 'string', minLength: 0, maxLength: 10 }
    },
    required: ['name'],
    additionalProperties: false
  };

  const { status, body } = await generate({ schema: boundarySchema, count: 1 });

  assert.equal(status, 200);
  assert.equal(body.count, 1);
  assert.equal(body.records.length, 1);
  assert.equal(typeof body.records[0].data.name, 'string');
  assert(body.records[0].validation.valid);
});

// Boundary test: count parameter at lower limit 1

test('POST /api/generate accepts count=1 and returns single record', async () => {
  const { status, body } = await generate({ schema, count: 1 });

  assert.equal(status, 200);
  assert.equal(body.count, 1);
  assert.equal(body.records.length, 1);
});

// Boundary test: count parameter at upper limit 500

test('POST /api/generate accepts count=500 and returns 500 records', async () => {
  const { status, body } = await generate({ schema, count: 500 });

  assert.equal(status, 200);
  assert.equal(body.count, 500);
  assert.equal(body.records.length, 500);
});

// Boundary test: count parameter below minimum (0) coerced to 1

test('POST /api/generate coerces count=0 to count=1 and returns one record', async () => {
  const { status, body } = await generate({ schema, count: 0 });

  assert.equal(status, 200);
  assert.equal(body.count, 1);
  assert.equal(body.records.length, 1);
});

// Boundary test: count parameter exceeding max returns trimmed to max

test('POST /api/generate coerces count=9999 to 500 max and returns 500 records', async () => {
  const { status, body } = await generate({ schema, count: 9999 });

  assert.equal(status, 200);
  assert.equal(body.count, 500);
  assert.equal(body.records.length, 500);
});

// Prompt length exceeding 2000 chars rejected

test('POST /api/generate rejects prompt longer than 2000 characters', async () => {
  const longPrompt = 'x'.repeat(2001);

  const { status, body } = await generate({ schema, prompt: longPrompt });

  assert.equal(status, 400);
  assert.match(body.error, /prompt must be 2000 characters or fewer/i);
});

// Invalid mode rejects

test('POST /api/generate rejects invalid mode', async () => {
  const { status, body } = await generate({ schema, mode: 'unsupported' });

  assert.equal(status, 400);
  assert.match(body.error, /mode must be/i);
});

// Invalid count type rejects

test('POST /api/generate rejects invalid count type', async () => {
  const { status, body } = await generate({ schema, count: 'not-a-number' });

  assert.equal(status, 400);
  assert.match(body.error, /must be numeric/i);
});

// Negative seed value accepted as valid numeric

test('POST /api/generate accepts negative numeric seed value', async () => {
  const { status, body } = await generate({ schema, seed: -100 });

  assert.equal(status, 200);
  assert.equal(typeof body.seed, 'number');
  assert.equal(body.seed, -100);
});
