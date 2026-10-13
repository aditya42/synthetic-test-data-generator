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
  it('does not flag reserved documentation IPs as PII or phone numbers', () => {
    for (const ip of ['192.0.2.123', '198.51.100.1', '203.0.113.255']) {
      expect(scanForPii({ ip })).toEqual([]);
    }
  });

  it('continues to flag non-documentation IPv4 addresses', () => {
    expect(scanForPii({ ip: '8.8.8.8' }).some(f => f.kind === 'ip')).toBe(true);
  });

  // === New tests for deterministic generation with boundary length schema constraints ===
  it('generates strings respecting minLength and maxLength constraints', () => {
    const lengthSchema = {
      type: 'object',
      properties: {
        shortString: { type: 'string', minLength: 3, maxLength: 5 },
        exactString: { type: 'string', minLength: 4, maxLength: 4 },
        longString: { type: 'string', minLength: 10, maxLength: 15 }
      },
      required: ['shortString', 'exactString', 'longString'],
      additionalProperties: false
    };

    const generated = generateFromSchema(lengthSchema, { seed: 123, mode: 'valid' });

    expect(generated.shortString.length).toBeGreaterThanOrEqual(3);
    expect(generated.shortString.length).toBeLessThanOrEqual(5);

    expect(generated.exactString.length).toBe(4);

    expect(generated.longString.length).toBeGreaterThanOrEqual(10);
    expect(generated.longString.length).toBeLessThanOrEqual(15);

    expect(validateAgainstSchema(lengthSchema, generated).valid).toBe(true);
    expect(scanForPii(generated)).toEqual([]);
  });

  it('generates consistent output for string length boundary schemas with same seed', () => {
    const boundarySchema = {
      type: 'object',
      properties: {
        fixedLength: { type: 'string', minLength: 6, maxLength: 6 },
        minLengthOnly: { type: 'string', minLength: 8 },
        maxLengthOnly: { type: 'string', maxLength: 12 }
      },
      required: ['fixedLength', 'minLengthOnly', 'maxLengthOnly'],
      additionalProperties: false
    };

    const seed = 999;
    const first = generateFromSchema(boundarySchema, { seed, mode: 'valid' });
    const second = generateFromSchema(boundarySchema, { seed, mode: 'valid' });

    expect(first).toEqual(second);

    expect(first.fixedLength.length).toBe(6);
    expect(first.minLengthOnly.length).toBeGreaterThanOrEqual(8);
    expect(first.maxLengthOnly.length).toBeLessThanOrEqual(12);

    expect(validateAgainstSchema(boundarySchema, first).valid).toBe(true);
  });

  it('handles zero-length string minLength and maxLength correctly', () => {
    const zeroLengthSchema = {
      type: 'object',
      properties: {
        emptyString: { type: 'string', minLength: 0, maxLength: 0 },
        optionalString: { type: 'string', minLength: 0, maxLength: 2 }
      },
      required: ['emptyString', 'optionalString'],
      additionalProperties: false
    };

    const generated = generateFromSchema(zeroLengthSchema, { seed: 77, mode: 'valid' });

    expect(generated.emptyString).toBe('');
    expect(generated.optionalString.length).toBeGreaterThanOrEqual(0);
    expect(generated.optionalString.length).toBeLessThanOrEqual(2);

    expect(validateAgainstSchema(zeroLengthSchema, generated).valid).toBe(true);
    expect(scanForPii(generated)).toEqual([]);
  });
});
