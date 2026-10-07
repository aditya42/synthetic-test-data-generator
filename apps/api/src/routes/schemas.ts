import { Router } from 'express';
import { databaseEnabled, pool } from '../db.js';

export const schemaRouter = Router();

schemaRouter.use((_req, res, next) => {
  if (!databaseEnabled) {
    return res.status(503).json({
      error: 'Database persistence is disabled',
      hint: 'Set ENABLE_DB_PERSISTENCE=true and start PostgreSQL to use schema storage.'
    });
  }
  next();
});

schemaRouter.get('/', async (_req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, description, schema_json, created_at, updated_at FROM schemas ORDER BY updated_at DESC'
    );
    return res.json(result.rows);
  } catch (error) {
    return res.status(503).json({
      error: error instanceof Error ? error.message : 'database unavailable'
    });
  }
});

schemaRouter.post('/', async (req, res) => {
  const { name, description, schema } = req.body ?? {};
  if (!name || !schema) {
    return res.status(400).json({ error: 'name and schema are required' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO schemas(name, description, schema_json) VALUES($1,$2,$3)
       ON CONFLICT(name) DO UPDATE SET
         description=EXCLUDED.description,
         schema_json=EXCLUDED.schema_json,
         updated_at=now()
       RETURNING *`,
      [name, description ?? '', JSON.stringify(schema)]
    );
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    return res.status(503).json({
      error: error instanceof Error ? error.message : 'save failed'
    });
  }
});
