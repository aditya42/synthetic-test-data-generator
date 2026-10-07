import './config.js';
import express from 'express';
import http from 'node:http';
import cors from 'cors';
import { generateRouter } from './routes/generate.js';
import { schemaRouter } from './routes/schemas.js';
import { runRouter } from './routes/runs.js';
import { databaseEnabled, dbReady, pool } from './db.js';
import { config } from './config.js';

const app = express();
app.disable('x-powered-by');
app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/health', (_req, res) => {
  return res.json({
    status: 'ok',
    port: config.port,
    databasePersistence: databaseEnabled,
    llmConfigured: Boolean(config.openAiApiKey)
  });
});

app.get('/ready', async (_req, res) => {
  if (!databaseEnabled) {
    return res.json({
      status: 'ready',
      database: 'disabled',
      llmConfigured: Boolean(config.openAiApiKey)
    });
  }

  const database = await dbReady();
  return res.status(database ? 200 : 503).json({
    status: database ? 'ready' : 'degraded',
    database,
    llmConfigured: Boolean(config.openAiApiKey)
  });
});

app.use('/api/generate', generateRouter);
app.use('/api/schemas', schemaRouter);
app.use('/api/runs', runRouter);

app.use((_req, res) => {
  return res.status(404).json({ error: 'Route not found' });
});

const server = http.createServer(app);

server.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`[startup] Port ${config.port} is already in use.`);
    console.error(`[startup] Check it with: lsof -nP -iTCP:${config.port} -sTCP:LISTEN`);
    console.error('[startup] Stop the old process or choose another PORT in the root .env file.');
  } else {
    console.error('[startup] API failed to start:', error);
  }
  process.exit(1);
});

server.listen(config.port, config.host, () => {
  console.log(`Synthetic Test Data Generator API listening on http://127.0.0.1:${config.port}`);
  console.log(`[config] host: ${config.host}`);
  console.log(`[config] DB persistence: ${databaseEnabled ? 'enabled' : 'disabled'}`);
  console.log(`[config] LLM: ${config.openAiApiKey ? 'configured' : 'disabled'}`);
  console.log(`[check] curl http://127.0.0.1:${config.port}/health`);
  console.log(`[check] curl http://127.0.0.1:${config.port}/api/generate/ping`);
});


async function shutdown(signal: string) {
  console.log(`[shutdown] ${signal} received`);
  server.close(async () => {
    try {
      await pool.end();
    } finally {
      process.exit(0);
    }
  });

  setTimeout(() => process.exit(1), 3000).unref();
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));
