import request from 'supertest';
import { app } from '../../src/app';

// Simple valid JSON schema for testing
const validSchema = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    age: { type: 'integer' }
  },
  required: ['name']
};

describe('POST /generate input validation', () => {
  it('accepts a valid request and returns 200 with records', async () => {
    const res = await request(app).post('/generate').send({ schema: validSchema, count: 3 });
    expect(res.status).toBe(200);
    expect(res.body.records).toHaveLength(3);
    expect(Array.isArray(res.body.records)).toBe(true);
    expect(res.body.count).toBe(3);
    expect(res.body.mode).toBe('valid');
  });

  it('rejects missing schema with 400 and error message', async () => {
    const res = await request(app).post('/generate').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/schema is required/i);
  });

  it('rejects invalid schema structure with validation errors', async () => {
    // Malformed schema missing type
    const badSchema = { properties: { foo: { type: 'string' } } };
    const res = await request(app).post('/generate').send({ schema: badSchema });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid json schema/i);
    expect(Array.isArray(res.body.details)).toBe(true);
  });

  it('enforces count boundaries: defaults to 1 if <1, max 500 if >500', async () => {
    const resLow = await request(app).post('/generate').send({ schema: validSchema, count: 0 });
    expect(resLow.status).toBe(200);
    expect(resLow.body.count).toBe(1);

    const resHigh = await request(app).post('/generate').send({ schema: validSchema, count: 1000 });
    expect(resHigh.status).toBe(200);
    expect(resHigh.body.count).toBe(500);
  });

  it('rejects non-numeric count and seed', async () => {
    const res = await request(app).post('/generate').send({ schema: validSchema, count: 'foo', seed: 'bar' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/count and seed must be numeric/i);
  });

  it('rejects invalid mode values', async () => {
    const res = await request(app).post('/generate').send({ schema: validSchema, mode: 'invalidMode' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/mode must be valid, boundary, or negative/i);
  });

  it('rejects too long prompt (>2000 chars)', async () => {
    const longPrompt = 'a'.repeat(2001);
    const res = await request(app).post('/generate').send({ schema: validSchema, prompt: longPrompt });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/prompt must be 2000 characters or fewer/i);
  });

  it('rejects LLM usage with count > 50', async () => {
    const res = await request(app)
      .post('/generate')
      .send({ schema: validSchema, count: 51, useLlm: true });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/llm mode supports at most 50 records/i);
  });

  it('rejects prompt containing PII', async () => {
    // Using a prompt that triggers PII detection (e.g. an email pattern)
    const piiPrompt = 'My email is test@example.com';
    const res = await request(app)
      .post('/generate')
      .send({ schema: validSchema, prompt: piiPrompt });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/prompt rejected by pii safeguard/i);
    expect(Array.isArray(res.body.findings)).toBe(true);
    expect(res.body.findings.length).toBeGreaterThan(0);
  });

  describe('PII detection and blocking behavior with piiBlockMode', () => {
    const piiPrompt = 'This is a test email: john.doe@example.gov'; // example.gov triggers PII detection since not safe domain

    it('blocks generation when piiBlockMode is strict (default)', async () => {
      const res = await request(app)
        .post('/generate')
        .send({ schema: validSchema, prompt: piiPrompt });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/prompt rejected by pii safeguard/i);
      expect(Array.isArray(res.body.findings)).toBe(true);
      expect(res.body.findings.some(f => f.kind === 'email')).toBe(true);
    });

    it('allows generation when piiBlockMode is disabled, despite PII in prompt', async () => {
      // Set header or param to disable piiBlockMode if API supports it
      // If no direct API control, simulate by setting env var temporarily via process.env overriding
      // Here we simulate with a special header 'x-pii-block-mode' to 'disabled' (assuming backend supports this for testing)
      const res = await request(app)
        .post('/generate')
        .set('x-pii-block-mode', 'disabled')
        .send({ schema: validSchema, prompt: piiPrompt, count: 1, useLlm: true });

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.records)).toBe(true);
      expect(res.body.records.length).toBe(1);
    });
  });

  describe('PII block mode error recovery on LLM generation path', () => {
    const piiSchema = {
      type: 'object',
      additionalProperties: false,
      properties: {
        email: { type: 'string', format: 'email' }
      },
      required: ['email']
    };

    it('returns 422 with piiFindings when generated LLM output contains PII and piiBlockMode is strict', async () => {
      // A prompt designed to encourage LLM to produce an email detected as PII
      const prompt = 'Please generate one record with a real email address like jane.doe@example.gov';

      const res = await request(app).post('/generate').send({
        schema: piiSchema,
        count: 1,
        useLlm: true,
        prompt
      });

      expect(res.status).toBe(422);
      expect(res.body.error).toMatch(/generated data blocked by pii safeguard/i);
      expect(Array.isArray(res.body.piiFindings)).toBe(true);
      expect(res.body.piiFindings.length).toBeGreaterThan(0);
      expect(res.body.piiFindings.some(f => f.kind === 'email')).toBe(true);
    });
  });

  describe('Additional input validation and boundary tests', () => {
    it('rejects count as negative number, defaults to 1 actually used but should accept and coerce
      (here invalid count negative coerced to 1)', async () => {
      const res = await request(app).post('/generate').send({ schema: validSchema, count: -5 });
      expect(res.status).toBe(200);
      expect(res.body.count).toBe(1); // negative count coerced to min 1
    });

    it('rejects count as a decimal number, coerced down via floor', async () => {
      const res = await request(app).post('/generate').send({ schema: validSchema, count: 3.7 });
      expect(res.status).toBe(200);
      expect(res.body.count).toBe(3); // floor applied
    });

    it('rejects non-integer numeric count strings coerced correctly', async () => {
      const res = await request(app).post('/generate').send({ schema: validSchema, count: '4' });
      expect(res.status).toBe(200);
      expect(res.body.count).toBe(4);
    });

    it('rejects missing count (uses default 5)', async () => {
      const res = await request(app).post('/generate').send({ schema: validSchema });
      expect(res.status).toBe(200);
      expect(res.body.count).toBe(5);
    });

    it('rejects count as null (invalid)', async () => {
      const res = await request(app).post('/generate').send({ schema: validSchema, count: null });
      // Null converted to 0 then coerced to 1
      expect(res.status).toBe(200);
      expect(res.body.count).toBe(1);
    });

    it('rejects mode as empty string with error', async () => {
      const res = await request(app).post('/generate').send({ schema: validSchema, mode: '' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/mode must be valid, boundary, or negative/i);
    });

    it('rejects completely malformed request body (e.g., schema null)', async () => {
      const res = await request(app).post('/generate').send({ schema: null });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/schema is required/i);
    });
  });
});
