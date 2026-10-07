# Synthetic Test Data Generator

A full-stack Quality Engineering platform for generating **realistic but synthetic** users, transactions, API payloads, edge cases, boundary values, and negative scenarios from JSON Schema.

The platform is **deterministic by default** for CI stability. An optional LLM enrichment path can generate more semantically realistic records, but it is wrapped with input PII screening, structured JSON output, schema validation, and output PII screening.

## Architecture

```text
                         QA / Developer
                              |
                              v
                    +-------------------+
                    |   React Web UI    |
                    +---------+---------+
                              |
                              v
                    +-------------------+
                    | TypeScript API    |
                    +----+---------+----+
                         |         |
          +--------------+         +----------------+
          v                                         v
+-------------------+                      +-------------------+
| Deterministic     |                      | Optional LLM      |
| Faker Generator   |                      | Enrichment        |
+---------+---------+                      +---------+---------+
          |                                          |
          +------------------+-----------------------+
                             v
                  +------------------------+
                  | JSON Schema / AJV Gate |
                  +-----------+------------+
                              v
                  +------------------------+
                  | PII / Secret Safeguard |
                  +-----------+------------+
                              v
                 Dataset + Validation Report
                              |
               +--------------+-------------+
               v                            v
           JSON export                PostgreSQL audit
                                      metadata only
```

## Key capabilities

- JSON Schema-driven data generation
- Stable seeded datasets for repeatable Playwright/Selenium/API tests
- Happy-path data
- Boundary data using `minimum`, `maximum`, `minLength`, `maxLength`, `minItems`, and `maxItems`
- Negative mutations such as missing required fields, wrong types, invalid email, invalid enum, out-of-range numbers, and malformed arrays
- Synthetic-user heuristics for name, email, phone, address, location, status, product, currency, and timestamps
- PII/secret scanner for email, phone, payment-like values, SSN, Aadhaar, PAN, IP addresses, and common secret formats
- Safe reserved emails (`example.test`) and documentation IP ranges
- Sensitive-field placeholder generation instead of real-looking secrets
- Optional OpenAI Responses API integration with JSON-schema Structured Outputs
- Post-generation AJV validation even after LLM generation
- PostgreSQL schema library and generation-run audit metadata
- JSON export from the UI
- Core unit tests and GitHub Actions CI
- Docker Compose for Postgres + API + UI

## Repository layout

```text
apps/
  api/                 Express API, LLM adapter, PostgreSQL integration
  web/                 React + Vite UI
packages/
  core/                generator, validator, PII scanner, mutation engine
examples/schemas/      sample user, transaction and order payload schemas
db/init.sql            database bootstrap
.github/workflows/ci.yml
```

## Quick start

### Option A: local development — recommended

Requirements: Node.js 22+. PostgreSQL is **not required** for deterministic generation.

```bash
cp .env.example .env
npm ci
npm run doctor
npm run dev:api
```

When the API prints that it is listening on `8081`, verify it from another terminal:

```bash
curl http://127.0.0.1:8081/health
curl http://127.0.0.1:8081/api/generate/ping
```

Then start the UI:

```bash
npm run dev:web
```

Open `http://localhost:5173`.

To enable PostgreSQL audit/schema persistence later:

```bash
docker compose up -d postgres
```

and set `ENABLE_DB_PERSISTENCE=true` in the root `.env` before restarting the API.

### Option B: Docker Compose

```bash
cp .env.example .env
docker compose up --build
```

UI: `http://localhost:5173`  
API: `http://localhost:8081`

## Local configuration

Use the **root** `.env` only. The API and Vite UI both load configuration from the repository root. Do not create separate `apps/api/.env` or `apps/web/.env` files.

```bash
cp .env.example .env
```

Default local ports:

```text
React UI  5173
STDG API  8081
Postgres  5432
```

Port `8081` is used intentionally so a local Jenkins instance commonly bound to `8080` does not receive STDG requests.

Before starting the UI, verify the API:

```bash
npm run doctor
npm run dev:api
```

In another terminal:

```bash
curl http://127.0.0.1:8081/health
curl http://127.0.0.1:8081/api/generate/ping
```

If startup reports that `8081` is already in use:

```bash
lsof -nP -iTCP:8081 -sTCP:LISTEN
```

Stop the stale process or select another `PORT` and matching `VITE_API_URL` in the root `.env`.

## Optional LLM mode

Set:

```bash
OPENAI_API_KEY=your_key
OPENAI_MODEL=gpt-6-astra
```

Then enable **LLM enrichment** in the UI. If no API key is present, deterministic generation remains available.

The LLM path uses structured JSON output and then independently validates every returned record against the original schema. The model is not the validation authority.

## API

### Generate valid synthetic records

```bash
curl -X POST http://localhost:8081/api/generate \
  -H 'Content-Type: application/json' \
  -d '{
    "schemaName": "user",
    "schema": {
      "type": "object",
      "additionalProperties": false,
      "required": ["id", "email", "age"],
      "properties": {
        "id": {"type": "string", "format": "uuid"},
        "email": {"type": "string", "format": "email"},
        "age": {"type": "integer", "minimum": 18, "maximum": 65}
      }
    },
    "count": 5,
    "seed": 42,
    "mode": "valid",
    "useLlm": false
  }'
```

### Generate boundary records

Set:

```json
{ "mode": "boundary" }
```

### Generate negative records

Set:

```json
{ "mode": "negative" }
```

Negative records intentionally fail the supplied schema. The response includes a `mutation` field such as `missing_required:email` and the AJV validation result proving the scenario is invalid.

## Example Playwright consumption

```ts
const response = await request.post('http://localhost:8081/api/generate', {
  data: {
    schema,
    count: 1,
    seed: 2026,
    mode: 'valid'
  }
});

const body = await response.json();
const customer = body.records[0].data;
```

Because the seed is fixed, failures can be reproduced using the same schema + seed.

## API endpoints

| Method | Route | Purpose |
|---|---|---|
| GET | `/health` | API liveness and active configuration |
| GET | `/api/generate/ping` | Verify the generation router is mounted |
| POST | `/api/generate` | Generate valid, boundary or negative records |
| GET | `/api/schemas` | List schemas from PostgreSQL |
| POST | `/api/schemas` | Create/update a named schema |
| GET | `/api/runs` | Last 50 generation-run audit records |

## Safety model

The system deliberately does **not** ingest production datasets. It generates from schemas and abstract scenario guidance.

Safeguards:

1. User prompt scan before optional LLM invocation.
2. Reserved synthetic email domains and documentation ranges in local generation.
3. Structured model output when LLM mode is used.
4. Independent AJV validation of every generated record.
5. Output PII/secret scan.
6. Strict mode blocks a dataset if suspicious PII is detected.
7. Database stores run metadata by default, not generated record bodies.

The built-in scanner is intentionally conservative and should be supplemented with enterprise DLP for regulated production use.

## Useful extension points

- OpenAPI import -> auto-convert request/response schemas into generator schemas
- GraphQL schema import
- Avro/Protobuf adapters
- Domain packs: checkout, banking, healthcare-safe fixtures, streaming, identity
- Pairwise/combinatorial generation
- Constraint solver for cross-field rules (`endDate > startDate`, totals, state/country compatibility)
- Referential datasets across customer -> order -> payment -> shipment
- Data reservation/lease API for parallel CI workers
- TTL cleanup and environment-specific namespaces
- Playwright fixture package (`testData.createUser()`)
- Selenium/Java client SDK
- Synthetic dataset quality scoring and drift metrics
- Enterprise DLP and secrets-manager integrations

## Tests

```bash
npm test
npm run build
```

The core suite verifies deterministic generation, schema validity, negative mutations, and PII detection behavior.
