export type GenerationMode = 'valid' | 'boundary' | 'negative';

export interface GenerationRequest {
  schema: Record<string, unknown>;
  count?: number;
  seed?: number;
  mode?: GenerationMode;
  locale?: string;
  prompt?: string;
  useLlm?: boolean;
}

export interface PiiFinding {
  path: string;
  kind: 'email' | 'phone' | 'credit_card' | 'ssn' | 'aadhaar' | 'pan' | 'ip' | 'secret';
  sample: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: Array<{ instancePath: string; message?: string; keyword?: string }>;
}

export interface GeneratedRecord {
  data: unknown;
  validation: ValidationResult;
  piiFindings: PiiFinding[];
  mutation?: string;
}
