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
});
