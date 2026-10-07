import { Router } from 'express';
import {
  createNegativeMutations,
  generateFromSchema,
  scanForPii,
  validateAgainstSchema,
  validateSchemaDefinition,
  type GeneratedRecord,
  type GenerationMode
} from '@stdg/core';
import { generateWithLlm } from '../services/llmGenerator.js';
import { databaseEnabled, pool } from '../db.js';
import { config } from '../config.js';

export const generateRouter = Router();

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    )
  ]);
}

generateRouter.get('/ping', (_req, res) => {
  res.json({ status: 'ok', route: 'generate' });
});

generateRouter.post('/', async (req, res) => {
  const started = Date.now();
  const mark = (stage: string) =>
    console.log(`[generate] ${stage} +${Date.now() - started}ms`);

  try {
    mark('request received');

    const schema = req.body?.schema as Record<string, any>;
    if (!schema || typeof schema !== 'object') {
      return res.status(400).json({ error: 'schema is required' });
    }

    const schemaCheck = validateSchemaDefinition(schema);
    if (!schemaCheck.valid) {
      return res.status(400).json({
        error: 'Invalid JSON Schema',
        details: schemaCheck.errors
      });
    }
    mark('schema validated');

    const rawCount = Number(req.body.count ?? 5);
    const rawSeed = Number(req.body.seed ?? 42);

    if (!Number.isFinite(rawCount) || !Number.isFinite(rawSeed)) {
      return res.status(400).json({ error: 'count and seed must be numeric' });
    }

    const count = Math.min(Math.max(Math.floor(rawCount), 1), 500);
    const seed = Math.trunc(rawSeed);
    const mode = (req.body.mode ?? 'valid') as GenerationMode;
    const useLlm = req.body.useLlm === true;
    const prompt = typeof req.body.prompt === 'string' ? req.body.prompt : undefined;

    if (prompt && prompt.length > 2000) {
      return res.status(400).json({ error: 'prompt must be 2000 characters or fewer' });
    }

    if (useLlm && count > 50) {
      return res.status(400).json({
        error: 'LLM mode supports at most 50 records per request; deterministic mode supports 500'
      });
    }

    if (!['valid', 'boundary', 'negative'].includes(mode)) {
      return res.status(400).json({ error: 'mode must be valid, boundary, or negative' });
    }

    if (prompt) {
      const promptFindings = scanForPii(prompt);
      if (promptFindings.length) {
        return res.status(400).json({
          error: 'Prompt rejected by PII safeguard',
          findings: promptFindings
        });
      }
    }

    let llmUsed = false;
    let records: GeneratedRecord[] = [];

    if (useLlm) {
      if (!config.openAiApiKey) {
        return res.status(400).json({
          error: 'LLM enrichment is enabled but OPENAI_API_KEY is not configured'
        });
      }

      if (mode === 'negative') {
        return res.status(400).json({
          error: 'LLM enrichment is not supported for negative mode'
        });
      }

      mark('starting LLM generation');
      const llmRecords = await withTimeout(
        generateWithLlm({ schema, count, prompt, seed }),
        45_000,
        'LLM generation'
      );

      records = llmRecords.map((data) => ({
        data,
        validation: validateAgainstSchema(schema, data),
        piiFindings: scanForPii(data)
      }));
      llmUsed = true;
      mark('LLM generation complete');
    } else {
      for (let i = 0; i < count; i++) {
        const validBase = generateFromSchema(schema, {
          seed: seed + i,
          mode: mode === 'negative' ? 'valid' : mode
        });

        if (mode === 'negative') {
          const mutations = createNegativeMutations(schema, validBase);
          const selected = mutations[i % Math.max(mutations.length, 1)] ?? {
            name: 'fallback',
            data: validBase
          };

          records.push({
            data: selected.data,
            mutation: selected.name,
            validation: validateAgainstSchema(schema, selected.data),
            piiFindings: scanForPii(selected.data)
          });
        } else {
          records.push({
            data: validBase,
            validation: validateAgainstSchema(schema, validBase),
            piiFindings: scanForPii(validBase)
          });
        }
      }
      mark('deterministic generation complete');
    }

    const piiFindings = records.flatMap((r) => r.piiFindings);
    const strictPii = config.piiBlockMode === 'strict';

    if (strictPii && piiFindings.length) {
      mark('blocked by PII safeguard');
      return res.status(422).json({
        error: 'Generated data blocked by PII safeguard',
        piiFindings
      });
    }

    const validCount = records.filter((r) => r.validation.valid).length;
    const metadata = {
      promptUsed: Boolean(prompt),
      engine: llmUsed ? 'llm' : 'deterministic',
      requestedMode: mode
    };

    let runId: string | null = null;

    // DB persistence is optional and NEVER allowed to hang generation.
    if (databaseEnabled) {
      try {
        mark('starting DB audit write');
        const result = await withTimeout(
          pool.query(
            `INSERT INTO generation_runs(
              schema_name, mode, seed, count, llm_used,
              valid_count, invalid_count, pii_findings, metadata
            )
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
            RETURNING id`,
            [
              req.body.schemaName ?? 'inline-schema',
              mode,
              seed,
              count,
              llmUsed,
              validCount,
              count - validCount,
              JSON.stringify(piiFindings),
              JSON.stringify(metadata)
            ]
          ),
          1500,
          'database audit write'
        );

        runId = result.rows[0]?.id ?? null;
        mark('DB audit write complete');
      } catch (error) {
        console.warn(
          '[generate] DB audit skipped:',
          error instanceof Error ? error.message : error
        );
      }
    } else {
      mark('DB persistence disabled');
    }

    mark('response sent');
    return res.json({
      runId,
      mode,
      seed,
      count,
      llmUsed,
      validCount,
      invalidCount: count - validCount,
      records
    });
  } catch (error) {
    console.error('[generate] failed:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'generation failed'
    });
  }
});
