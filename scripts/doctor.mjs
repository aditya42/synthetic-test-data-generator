import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import process from 'node:process';
import dotenv from 'dotenv';

const root = process.cwd();
dotenv.config({ path: path.join(root, '.env'), quiet: true });

const port = Number(process.env.PORT ?? 8081);
const api = process.env.VITE_API_URL ?? `http://127.0.0.1:${port}`;
const coreDist = path.join(root, 'packages/core/dist/index.js');

console.log('Synthetic Test Data Generator doctor');
console.log(`- root: ${root}`);
console.log(`- PORT: ${port}`);
console.log(`- VITE_API_URL: ${api}`);
console.log(`- core build: ${fs.existsSync(coreDist) ? 'present' : 'missing'}`);
console.log(`- DB persistence: ${process.env.ENABLE_DB_PERSISTENCE ?? 'false'}`);

async function probeHttp(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
    const text = await response.text();
    return { ok: response.ok, status: response.status, text };
  } catch (error) {
    return { ok: false, status: 0, text: error instanceof Error ? error.message : String(error) };
  }
}

const health = await probeHttp(`http://127.0.0.1:${port}/health`);
if (health.status) {
  console.log(`- port ${port}: occupied; HTTP ${health.status}`);
  console.log(`- /health: ${health.text.slice(0, 300)}`);
  const ping = await probeHttp(`http://127.0.0.1:${port}/api/generate/ping`);
  console.log(`- /api/generate/ping: ${ping.status || 'unreachable'} ${ping.text.slice(0, 300)}`);
  process.exit(ping.ok ? 0 : 2);
}

const available = await new Promise((resolve) => {
  const server = net.createServer();
  server.once('error', () => resolve(false));
  server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)));
});

if (available) {
  console.log(`- port ${port}: available (API is not currently running)`);
  console.log('- next: npm run dev:api');
  process.exit(0);
}

console.log(`- port ${port}: occupied by a non-HTTP or unresponsive process`);
console.log(`- run: lsof -nP -iTCP:${port} -sTCP:LISTEN`);
process.exit(2);
