# Security and privacy model

This project is designed for synthetic QA data, not production-data anonymization.

- Do not paste production records into prompts or schema examples.
- Prompt input is scanned for common PII/secret patterns before any optional LLM call.
- Generated output is scanned again before it is returned.
- Reserved example domains and documentation IP ranges are used by the deterministic generator.
- Sensitive-looking field names (password, token, SSN, Aadhaar, PAN, card) receive synthetic marker values.
- Generation run metadata can be persisted, but record payloads are intentionally not stored by default.
- Regex-based PII detection is defense-in-depth, not a replacement for an enterprise DLP system.

For regulated environments, integrate your organization's DLP/secret-scanning provider at the API boundary and configure outbound-model data controls according to policy.
