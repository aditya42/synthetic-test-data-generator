import OpenAI from 'openai';
import { assertNoPii, validateAgainstSchema } from '@stdg/core';
import { config } from '../config.js';

type JsonSchema = Record<string, any>;

const STRIP_KEYS = ['$schema', 'title', 'description', 'examples', 'default', 'deprecated', 'readOnly', 'writeOnly', 'allOf', 'not', 'if', 'then', 'else', 'dependentRequired', 'dependentSchemas'];

function strictify(schema: JsonSchema): JsonSchema {
  const copy = structuredClone(schema);
  const walk = (node: JsonSchema) => {
    if (!node || typeof node !== 'object') return;
    for (const keyword of STRIP_KEYS) delete node[keyword];
    if (node.type === 'object' || node.properties) {
      node.type = 'object';
      node.additionalProperties = false;
      const props = node.properties ?? {};
      node.required = Object.keys(props);
      Object.values(props).forEach((child) => walk(child as JsonSchema));
    }
    if (node.type === 'array' && node.items) walk(node.items);
    if (Array.isArray(node.anyOf)) node.anyOf.forEach((child: JsonSchema) => walk(child));
  };
  walk(copy);
  return copy;
}

export async function generateWithLlm(args: {
  schema: JsonSchema;
  count: number;
  prompt?: string;
  seed: number;
}): Promise<unknown[]> {
  if (!config.openAiApiKey) throw new Error('OPENAI_API_KEY is not configured');
  assertNoPii(args.prompt ?? '');

  const client = new OpenAI({ apiKey: config.openAiApiKey });
  const itemSchema = strictify(args.schema);
  const response = await client.responses.create({
    model: config.openAiModel,
    input: [{
      role: 'user',
      content: [{
        type: 'input_text',
        text: `Generate ${args.count} realistic but entirely synthetic QA test records. Never copy or infer real people. Use reserved example domains for emails and documentation/test address ranges where applicable. Dataset seed label: ${args.seed}. ${args.prompt ?? ''}`
      }]
    }],
    text: {
      format: {
        type: 'json_schema',
        name: 'synthetic_records',
        strict: true,
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            records: {
              type: 'array',
              minItems: args.count,
              maxItems: args.count,
              items: itemSchema
            }
          },
          required: ['records']
        }
      }
    }
  });

  const parsed = JSON.parse(response.output_text) as { records: unknown[] };
  assertNoPii(parsed.records);
  for (const record of parsed.records) {
    const validation = validateAgainstSchema(args.schema, record);
    if (!validation.valid) throw new Error(`LLM output failed post-validation: ${JSON.stringify(validation.errors)}`);
  }
  return parsed.records;
}
