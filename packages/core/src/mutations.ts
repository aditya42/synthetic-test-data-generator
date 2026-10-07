type JsonSchema = Record<string, any>;

export interface Mutation { name: string; data: unknown }

function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)); }

export function createNegativeMutations(schema: JsonSchema, validData: any): Mutation[] {
  if (schema.type !== 'object' || !validData || typeof validData !== 'object') return [];
  const mutations: Mutation[] = [];
  const props = schema.properties ?? {};
  const required: string[] = schema.required ?? [];

  for (const key of required.slice(0, 3)) {
    const copy = clone(validData);
    delete copy[key];
    mutations.push({ name: `missing_required:${key}`, data: copy });
  }

  for (const [key, prop] of Object.entries<JsonSchema>(props)) {
    if (mutations.length >= 12) break;
    const copy = clone(validData);
    if (prop.type === 'string') {
      if (typeof prop.maxLength === 'number') copy[key] = 'X'.repeat(prop.maxLength + 1);
      else if (prop.enum?.length) copy[key] = '__INVALID_ENUM__';
      else if (prop.format === 'email') copy[key] = 'not-an-email';
      else copy[key] = 12345;
      mutations.push({ name: `invalid_string:${key}`, data: copy });
    } else if (prop.type === 'integer' || prop.type === 'number') {
      copy[key] = typeof prop.maximum === 'number' ? prop.maximum + 1 : 'not-a-number';
      mutations.push({ name: `invalid_number:${key}`, data: copy });
    } else if (prop.type === 'array') {
      copy[key] = 'not-an-array';
      mutations.push({ name: `invalid_array:${key}`, data: copy });
    }
  }

  return mutations;
}
