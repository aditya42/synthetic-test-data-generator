import { faker } from '@faker-js/faker';
import type { GenerationMode } from './types.js';

export interface GenerateOptions {
  seed: number;
  mode: GenerationMode;
  locale?: string;
}

type JsonSchema = Record<string, any>;

function fromEnum(schema: JsonSchema) {
  return schema.enum?.[faker.number.int({ min: 0, max: schema.enum.length - 1 })];
}

function fitLength(value: string, schema: JsonSchema): string {
  const min = typeof schema.minLength === 'number' ? schema.minLength : 0;
  const max = typeof schema.maxLength === 'number' ? schema.maxLength : Number.POSITIVE_INFINITY;
  let out = value;
  if (out.length > max) out = out.slice(0, max);
  if (out.length < min) out = out.padEnd(min, 'x');
  return out;
}

function boundaryString(schema: JsonSchema): string {
  if (typeof schema.minLength === 'number' && typeof schema.maxLength === 'number') {
    return 'x'.repeat(faker.datatype.boolean() ? schema.minLength : schema.maxLength);
  }
  if (typeof schema.minLength === 'number') return 'x'.repeat(schema.minLength);
  if (typeof schema.maxLength === 'number') return 'x'.repeat(schema.maxLength);
  return '';
}

function stringFor(name: string, schema: JsonSchema, mode: GenerationMode): string {
  if (schema.const !== undefined) return String(schema.const);
  if (schema.enum?.length) return String(fromEnum(schema));
  if (mode === 'boundary' && (schema.minLength !== undefined || schema.maxLength !== undefined)) return boundaryString(schema);

  const n = name.toLowerCase();
  if (schema.format === 'email') return `${faker.string.alphanumeric(8).toLowerCase()}@example.test`;
  if (schema.format === 'uuid') return faker.string.uuid();
  if (schema.format === 'date') return faker.date.between({ from: '1990-01-01', to: '2035-12-31' }).toISOString().slice(0, 10);
  if (schema.format === 'date-time') return faker.date.between({ from: '2020-01-01', to: '2035-12-31' }).toISOString();
  if (schema.format === 'uri') return `https://example.test/${faker.string.alphanumeric(8)}`;
  if (schema.format === 'ipv4') return `192.0.2.${faker.number.int({ min: 1, max: 254 })}`;

  let value: string;
  if (/first.?name/.test(n)) value = faker.person.firstName();
  else if (/last.?name|surname/.test(n)) value = faker.person.lastName();
  else if (/full.?name|customer.?name/.test(n)) value = faker.person.fullName();
  else if (/email/.test(n)) value = `${faker.string.alphanumeric(8).toLowerCase()}@example.test`;
  else if (/phone|mobile/.test(n)) value = `+1-202-555-01${faker.number.int({ min: 10, max: 99 })}`;
  else if (/city/.test(n)) value = faker.location.city();
  else if (/state|province/.test(n)) value = faker.location.state();
  else if (/country/.test(n)) value = faker.location.country();
  else if (/postal|zip/.test(n)) value = faker.location.zipCode();
  else if (/address/.test(n)) value = `${faker.number.int({ min: 1, max: 9999 })} ${faker.location.street()}`;
  else if (/currency/.test(n)) value = faker.helpers.arrayElement(['USD', 'EUR', 'GBP', 'INR', 'JPY']);
  else if (/status/.test(n)) value = faker.helpers.arrayElement(['NEW', 'ACTIVE', 'PENDING', 'COMPLETED']);
  else if (/product|item/.test(n)) value = faker.commerce.productName();
  else if (/description|note|comment/.test(n)) value = faker.lorem.sentence();
  else if (/password|secret|token|ssn|aadhaar|pan|card/.test(n)) value = `SYNTHETIC_${faker.string.alphanumeric(12).toUpperCase()}`;
  else value = faker.word.words({ count: faker.number.int({ min: 1, max: 3 }) });

  return fitLength(value, schema);
}

function numberBounds(schema: JsonSchema): { min: number; max: number } {
  let min = typeof schema.minimum === 'number' ? schema.minimum : 0;
  let max = typeof schema.maximum === 'number' ? schema.maximum : Math.max(min + 1000, 1000);
  if (typeof schema.exclusiveMinimum === 'number') min = Math.max(min, schema.exclusiveMinimum + Number.EPSILON * 100);
  if (typeof schema.exclusiveMaximum === 'number') max = Math.min(max, schema.exclusiveMaximum - Number.EPSILON * 100);
  if (min > max) [min, max] = [max, min];
  return { min, max };
}

function numberFor(schema: JsonSchema, mode: GenerationMode, integer: boolean): number {
  const { min, max } = numberBounds(schema);
  if (mode === 'boundary') return integer ? Math.round(faker.datatype.boolean() ? min : max) : (faker.datatype.boolean() ? min : max);

  if (typeof schema.multipleOf === 'number' && schema.multipleOf > 0) {
    const unit = schema.multipleOf;
    const lower = Math.ceil(min / unit);
    const upper = Math.floor(max / unit);
    const value = faker.number.int({ min: lower, max: Math.max(lower, upper) }) * unit;
    return integer ? Math.round(value) : Number(value.toFixed(8));
  }

  if (integer) return faker.number.int({ min: Math.ceil(min), max: Math.floor(max) });
  const scale = 100;
  return faker.number.int({ min: Math.ceil(min * scale), max: Math.floor(max * scale) }) / scale;
}

export function generateFromSchema(schema: JsonSchema, options: GenerateOptions, fieldName = 'root'): unknown {
  faker.seed(options.seed);
  return generateNode(schema, options.mode, fieldName, 0);
}

function generateNode(schema: JsonSchema, mode: GenerationMode, fieldName: string, depth: number): unknown {
  if (depth > 8) return null;
  if (schema.const !== undefined) return schema.const;
  if (schema.enum?.length) return fromEnum(schema);

  const inferredType = schema.properties ? 'object' : schema.items ? 'array' : 'string';
  const type = Array.isArray(schema.type)
    ? schema.type.find((t: string) => t !== 'null') ?? inferredType
    : schema.type ?? inferredType;

  switch (type) {
    case 'object': {
      const out: Record<string, unknown> = {};
      const props = schema.properties ?? {};
      const required = new Set<string>(schema.required ?? Object.keys(props));
      for (const [key, child] of Object.entries<JsonSchema>(props)) {
        if (required.has(key) || mode !== 'valid' || faker.datatype.boolean()) out[key] = generateNode(child, mode, key, depth + 1);
      }
      return out;
    }
    case 'array': {
      const min = schema.minItems ?? 1;
      const max = schema.maxItems ?? Math.max(min, 3);
      const count = mode === 'boundary' ? (faker.datatype.boolean() ? min : max) : faker.number.int({ min, max });
      return Array.from({ length: count }, (_, i) => generateNode(schema.items ?? { type: 'string' }, mode, `${fieldName}_${i}`, depth + 1));
    }
    case 'integer': return numberFor(schema, mode, true);
    case 'number': return numberFor(schema, mode, false);
    case 'boolean': return faker.datatype.boolean();
    case 'null': return null;
    case 'string':
    default: return stringFor(fieldName, schema, mode);
  }
}
