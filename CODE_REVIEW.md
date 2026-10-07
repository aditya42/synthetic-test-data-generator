# Code Review and Repair Notes

This review was performed against the uploaded repository snapshot.

## Startup/root-cause fixes

1. **Port configuration was inconsistent.** API source used 8081, while Docker, README and `.env.example` still used 8080. The repository now uses 8081 consistently.
2. **Environment loading had three competing locations.** Configuration is now read from the repository-root `.env`; Vite uses `envDir` to read the same file.
3. **The shared workspace package could be missing `dist/`.** Root `dev:api` now builds `@stdg/core` before starting the API.
4. **Stale API processes were hard to diagnose.** Startup now reports `EADDRINUSE` with the exact `lsof` command, and SIGINT/SIGTERM trigger graceful shutdown.
5. **A diagnostic command was added.** `npm run doctor` reports the configured port, core build state, API health and generation-router ping.

## Runtime fixes

6. **Database persistence could affect endpoints even when disabled.** `/api/generate` skips DB work entirely when persistence is disabled; schema/run routes return immediately with an explanatory 503.
7. **Database calls are bounded by timeouts** when persistence is enabled.
8. **Health is a true liveness endpoint.** It does not wait on PostgreSQL. `/ready` performs the optional deeper readiness check.
9. **PII false positives were reduced** for reserved synthetic emails, test phones, documentation IP ranges, UUIDs and ISO timestamps while retaining blocking for real-looking PII.
10. **Frontend API default now targets 127.0.0.1:8081** and uses the root `VITE_API_URL` when supplied.

## Build/CI fixes

11. Docker API exposure and Compose mapping were moved to 8081.
12. Docker builds use `npm ci` with the committed lock file.
13. GitHub Actions uses `npm ci` rather than `npm install`.
14. Finder metadata and bundled `node_modules` are excluded from the corrected distribution.

## Verification performed

- `@stdg/core` TypeScript build: PASS
- `@stdg/api` TypeScript build: PASS
- Web TypeScript type-check: PASS
- `GET /health`: PASS
- `GET /api/generate/ping`: PASS
- deterministic valid generation: PASS
- deterministic boundary generation: PASS
- deterministic negative generation: PASS
- seeded determinism assertion: PASS
- schema validation assertion: PASS
- synthetic PII allow-list assertion: PASS
- real-looking email PII detection assertion: PASS
- negative-mutation invalidation assertion: PASS

The uploaded `node_modules` directory was created on macOS and cannot be used to run Linux-native Rollup/Vitest inside the review container. The corrected archive intentionally omits `node_modules`; run `npm ci` on the target machine so platform-specific optional dependencies are installed correctly.
