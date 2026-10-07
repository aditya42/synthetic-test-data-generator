import { useMemo, useState } from 'react';

const API = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8081';

const presets = {
  User: {
    type: 'object', additionalProperties: false,
    required: ['id', 'firstName', 'lastName', 'email', 'phone', 'age', 'status'],
    properties: {
      id: { type: 'string', format: 'uuid' },
      firstName: { type: 'string', minLength: 1, maxLength: 40 },
      lastName: { type: 'string', minLength: 1, maxLength: 40 },
      email: { type: 'string', format: 'email' },
      phone: { type: 'string' },
      age: { type: 'integer', minimum: 18, maximum: 90 },
      status: { type: 'string', enum: ['ACTIVE', 'INACTIVE', 'PENDING'] }
    }
  },
  Transaction: {
    type: 'object', additionalProperties: false,
    required: ['transactionId', 'customerId', 'amount', 'currency', 'status', 'createdAt'],
    properties: {
      transactionId: { type: 'string', format: 'uuid' },
      customerId: { type: 'string', format: 'uuid' },
      amount: { type: 'number', minimum: 0.01, maximum: 10000 },
      currency: { type: 'string', enum: ['USD', 'EUR', 'GBP', 'INR', 'JPY'] },
      status: { type: 'string', enum: ['AUTHORIZED', 'CAPTURED', 'DECLINED', 'REFUNDED'] },
      createdAt: { type: 'string', format: 'date-time' }
    }
  },
  'API Order': {
    type: 'object', additionalProperties: false,
    required: ['orderId', 'quantity', 'price', 'promoCode', 'shippingEmail'],
    properties: {
      orderId: { type: 'string', format: 'uuid' },
      quantity: { type: 'integer', minimum: 1, maximum: 10 },
      price: { type: 'number', minimum: 0, maximum: 5000 },
      promoCode: { type: 'string', minLength: 0, maxLength: 12 },
      shippingEmail: { type: 'string', format: 'email' }
    }
  }
} as const;

type Mode = 'valid' | 'boundary' | 'negative';

type ApiResult = {
  runId: string | null;
  mode: Mode;
  seed: number;
  count: number;
  llmUsed: boolean;
  validCount: number;
  invalidCount: number;
  records: Array<{ data: unknown; validation: { valid: boolean; errors: unknown[] }; piiFindings: unknown[]; mutation?: string }>;
};

export default function App() {
  const [schemaText, setSchemaText] = useState(JSON.stringify(presets.User, null, 2));
  const [count, setCount] = useState(5);
  const [seed, setSeed] = useState(42);
  const [mode, setMode] = useState<Mode>('valid');
  const [useLlm, setUseLlm] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [result, setResult] = useState<ApiResult | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const schemaValid = useMemo(() => {
    try { JSON.parse(schemaText); return true; } catch { return false; }
  }, [schemaText]);

  async function generate() {
    setError('');
    setLoading(true);

    const controller = new AbortController();

    const timeoutMs = useLlm ? 60000 : 10000;

    const timeout = window.setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    try {
      const response = await fetch(`${API}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        signal: controller.signal,
        body: JSON.stringify({
          schema: JSON.parse(schemaText),
          schemaName: 'ui-schema',
          count,
          seed,
          mode,
          useLlm,
          prompt
        })
      });

      const body = await response.json();

      if (!response.ok) {
        throw new Error(
          body.piiFindings?.length ? `${body.error}: ${body.piiFindings.map((f: any) => `${f.kind} at ${f.path}`).join(', ')}` : (body.error ?? 'Generation failed')
        );
      }

      setResult(body);
    } catch (e) {
      if (
        e instanceof DOMException &&
        e.name === 'AbortError'
      ) {
        setError(
          useLlm
            ? 'LLM generation timed out after 60 seconds.'
            : 'Generation timed out after 10 seconds. Check whether the API or database is running.'
        );
      } else {
        setError(
          e instanceof Error
            ? e.message
            : 'Generation failed'
        );
      }
    } finally {
      window.clearTimeout(timeout);
      setLoading(false);
    }
  }

  function download() {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result.records.map((r) => r.data), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `synthetic-${mode}-${seed}.json`; a.click();
    URL.revokeObjectURL(url);
  }

  return <main>
    <header>
      <div><span className="eyebrow">QUALITY ENGINEERING PLATFORM</span><h1>Synthetic Test Data Generator</h1></div>
      <div className="shield">PII SAFE · SCHEMA VALIDATED</div>
    </header>

    <section className="hero">
      <div><h2>Generate realistic test data without production-data risk.</h2><p>Seeded generation for CI, boundary and negative scenarios for validation, plus optional LLM enrichment behind deterministic safeguards.</p></div>
      <div className="flow"><b>Schema</b><span>→</span><b>Generator</b><span>→</span><b>Validate</b><span>→</span><b>PII Gate</b></div>
    </section>

    <section className="workspace">
      <div className="panel">
        <div className="panelTitle"><h3>1. Schema & scenario</h3><span className={schemaValid ? 'ok' : 'bad'}>{schemaValid ? 'Valid JSON' : 'Invalid JSON'}</span></div>
        <div className="presets">{Object.entries(presets).map(([name, schema]) => <button key={name} onClick={() => setSchemaText(JSON.stringify(schema, null, 2))}>{name}</button>)}</div>
        <textarea value={schemaText} onChange={(e) => setSchemaText(e.target.value)} spellCheck={false} />
      </div>

      <div className="panel controls">
        <h3>2. Generation policy</h3>
        <label>Mode<select value={mode} onChange={(e) => setMode(e.target.value as Mode)}><option value="valid">Valid / happy path</option><option value="boundary">Boundary values</option><option value="negative">Negative / deliberately invalid</option></select></label>
        <div className="row"><label>Records<input type="number" min="1" max="500" value={count} onChange={(e) => setCount(Number(e.target.value))} /></label><label>Seed<input type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value))} /></label></div>
        <label className="toggle"><input type="checkbox" checked={useLlm} onChange={(e) => setUseLlm(e.target.checked)} /><span>LLM enrichment</span><small>Optional. Falls back to deterministic engine when disabled.</small></label>
        <label>Scenario guidance<textarea className="prompt" placeholder="e.g. ecommerce guest checkout users with realistic cart values" value={prompt} onChange={(e) => setPrompt(e.target.value)} /></label>
        <button className="primary" disabled={!schemaValid || loading} onClick={generate}>{loading ? 'Generating…' : 'Generate dataset'}</button>
        {error && <div className="error">{error}</div>}
      </div>
    </section>

    <section className="results panel">
      <div className="panelTitle"><h3>3. Validation result</h3>{result && <button onClick={download}>Export JSON</button>}</div>
      {!result ? <div className="empty">Generated records will appear here with schema validity, mutation labels, and PII findings.</div> : <>
        <div className="metrics"><Metric label="Records" value={result.count} /><Metric label="Schema valid" value={result.validCount} /><Metric label="Intentionally invalid" value={result.invalidCount} /><Metric label="Engine" value={result.llmUsed ? 'LLM + guards' : 'Deterministic'} /></div>
        <div className="recordList">{result.records.map((r, i) => <article key={i}>
          <div className="recordHead"><strong>#{i + 1}</strong><span className={r.validation.valid ? 'ok' : 'warn'}>{r.validation.valid ? 'SCHEMA PASS' : 'SCHEMA FAIL'}</span>{r.mutation && <span className="tag">{r.mutation}</span>}</div>
          <pre>{JSON.stringify(r.data, null, 2)}</pre>
        </article>)}</div>
      </>}
    </section>
  </main>;
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div className="metric"><small>{label}</small><strong>{value}</strong></div>;
}
