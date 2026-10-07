import { Ajv2020 } from 'ajv/dist/2020.js';
import * as addFormatsModule from 'ajv-formats';
import type { ValidationResult } from './types.js';

const addFormats = (
  'default' in addFormatsModule
    ? addFormatsModule.default
    : addFormatsModule
) as unknown as (ajv: Ajv2020) => void;

const ajv = new Ajv2020({
  allErrors: true,
  strict: false,
  allowUnionTypes: true
});

addFormats(ajv);

function errorsOf(
  errors: any[] | null | undefined
): ValidationResult['errors'] {
  return (errors ?? []).map((e: any) => ({
    instancePath: e.instancePath,
    message: e.message,
    keyword: e.keyword
  }));
}

export function validateSchemaDefinition(
  schema: Record<string, unknown>
): ValidationResult {
  const valid = Boolean(ajv.validateSchema(schema));

  return {
    valid,
    errors: errorsOf(ajv.errors)
  };
}

export function validateAgainstSchema(
  schema: Record<string, unknown>,
  data: unknown
): ValidationResult {
  const validate = ajv.compile(schema);
  const valid = Boolean(validate(data));

  return {
    valid,
    errors: errorsOf(validate.errors)
  };
}