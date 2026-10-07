import { Router } from 'express';
import { databaseEnabled, pool } from '../db.js';

export const runRouter = Router();

runRouter.get('/', async (_req, res) => {
  if (!databaseEnabled) {
    return res.status(503).json({
      error: 'Database persistence is disabled',
      hint: 'Set ENABLE_DB_PERSISTENCE=true and start PostgreSQL to query generation history.'
    });
  }

  try {
    const result = await pool.query(
      `SELECT id, schema_name, mode, seed, count, llm_used,
              valid_count, invalid_count, pii_findings, metadata, created_at
       FROM generation_runs
       ORDER BY created_at DESC
       LIMIT 50`
    );
    return res.json(result.rows);
  } catch (error) {
    return res.status(503).json({
      error: error instanceof Error ? error.message : 'database unavailable'
    });
  }
});
