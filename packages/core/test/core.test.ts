import { describe, expect, it } from 'vitest';
import { createNegativeMutations, generateFromSchema, scanForPii, validateAgainstSchema } from '../src/index.js';

const schema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'email', 'age'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    email: { type: 'string', format: 'email' },
    age: { type: 'integer', minimum: 18, maximum: 65 }
  }
};

describe('core generator', () => {
  it('generates deterministic schema-valid data', () => {
    const a = generateFromSchema(schema, { seed: 42, mode: 'valid' });
    const b = generateFromSchema(schema, { seed: 42, mode: 'valid' });
    expect(a).toEqual(b);
    expect(validateAgainstSchema(schema, a).valid).toBe(true);
    expect(scanForPii(a)).toEqual([]);
  });

  it('creates deliberately invalid negative mutations', () => {
    const valid = generateFromSchema(schema, { seed: 7, mode: 'valid' });
    const mutations = createNegativeMutations(schema, valid);
    expect(mutations.length).toBeGreaterThan(0);
    expect(mutations.some((m) => !validateAgainstSchema(schema, m.data).valid)).toBe(true);
  });

  it('detects real-looking PII', () => {
    expect(scanForPii({ email: 'person@realcompany.com' }).length).toBe(1);
    expect(scanForPii({ email: 'person@example.test' }).length).toBe(0);
  });

  it('allows reserved synthetic test phone numbers', () => {
    const findings = scanForPii({
      phone: '+1-202-555-0117'
    });

    expect(findings).toEqual([]);
  });

  it('does not treat ISO dates as phone numbers', () => {
    const findings = scanForPii({
      createdAt: '2026-10-03T12:30:00.000Z'
    });

    expect(findings).toEqual([]);
  });

  it('still blocks real-looking phone numbers', () => {
    const findings = scanForPii({
      phone: '+1-415-867-5309'
    });

    expect(
      findings.some(f => f.kind === 'phone')
    ).toBe(true);
  });

  it('allows example.test email addresses', () => {
    const findings = scanForPii({
      email: 'testuser123@example.test'
    });

    expect(findings).toEqual([]);
  });
});
