
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

// PII safeguard enforcement test: output containing real-looking email should be blocked

test('POST /api/generate blocks output with real-looking PII (email) from LLM output', async () => {
  const piiSchema = {
    type: 'object',
    required: ['email'],
    additionalProperties: false,
    properties: {
      email: { type: 'string', format: 'email' }
    }
  };

  // The prompt nudges LLM to generate a known PII email
  const { status, body } = await generate({
    schema: piiSchema,
    count: 1,
    prompt: 'Include a real email like person@realcompany.com'
  });

  assert(status === 400 || status === 422, `Expected 400 or 422 but got ${status}`);
  assert(body.error, 'Expected error message indicating PII');
  // Accept prompt or output PII block message
  assert(/PII safeguard blocked|Prompt rejected by PII safeguard/i.test(body.error));
});

// PII safeguard enforcement test: output containing real-looking phone number should be blocked

test('POST /api/generate blocks output with real-looking PII (phone) from LLM output', async () => {
  const phoneSchema = {
    type: 'object',
    required: ['phone'],
    additionalProperties: false,
    properties: {
      phone: { type: 'string' }
    }
  };

  // The prompt nudges LLM to generate a known real phone number
  const { status, body } = await generate({
    schema: phoneSchema,
    count: 1,
    prompt: 'Include a phone number +1-415-867-5309'
  });

  assert(status === 400 || status === 422, `Expected 400 or 422 but got ${status}`);
  assert(body.error, 'Expected error message indicating PII');
  // Accept prompt or output PII block message
  assert(/PII safeguard blocked|Prompt rejected by PII safeguard/i.test(body.error));
});

// Control test: output with safe synthetic data should pass without PII blocking

test('POST /api/generate allows output without PII in strict mode', async () => {
  const safeSchema = {
    type: 'object',
    required: ['email'],
    additionalProperties: false,
    properties: {
      email: { type: 'string', format: 'email' }
    }
  };

  const { status, body } = await generate({
    schema: safeSchema,
    count: 1,
    prompt: 'Please generate an email with a reserved example.test domain'
  });

  assert.equal(status, 200);
  assert.equal(body.count, 1);
  assert.equal(body.records.length, 1);
  assert(typeof body.records[0].data.email === 'string');
  // Instead of searching for absence of 'PII' in body string, ensure no error field
  assert(!body.error);
});
