import type { PiiFinding } from './types.js';

const EMAIL_REGEX =
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;

const PHONE_REGEX =
  /(?<!\d)(?:\+?\d[\d .()-]{7,}\d)(?!\d)/g;

const CREDIT_CARD_REGEX =
  /\b(?:\d[ -]*?){13,19}\b/g;

const SSN_REGEX =
  /\b\d{3}-\d{2}-\d{4}\b/g;

const AADHAAR_REGEX =
  /\b\d{4}[ -]?\d{4}[ -]?\d{4}\b/g;

const PAN_REGEX =
  /\b[A-Z]{5}\d{4}[A-Z]\b/g;

const IP_REGEX =
  /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;

const SECRET_REGEX =
  /\b(?:sk-[A-Za-z0-9_-]{16,}|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{20,})\b/g;

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ISO_DATE_REGEX =
  /^\d{4}-\d{2}-\d{2}$/;

const ISO_DATETIME_REGEX =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/i;

const SAFE_TEST_CARDS = new Set([
  '4111111111111111',
  '4242424242424242'
]);

const SAFE_EMAIL_DOMAINS = new Set([
  'example.com',
  'example.org',
  'example.net',
  'example.test'
]);

function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

function isUuid(value: string): boolean {
  return UUID_REGEX.test(value);
}

function isIsoDate(value: string): boolean {
  return (
    ISO_DATE_REGEX.test(value) ||
    ISO_DATETIME_REGEX.test(value)
  );
}

function isSafeSyntheticPhone(value: string): boolean {
  const digits = digitsOnly(value);

  // Reserved fictional range used by this generator:
  //
  // +1-202-555-0100
  // ...
  // +1-202-555-0199
  return /^1?20255501\d{2}$/.test(digits);
}

function isPlausiblePhone(value: string): boolean {
  const digits = digitsOnly(value);

  // E.164 max = 15 digits.
  if (digits.length < 10 || digits.length > 15) {
    return false;
  }

  return true;
}

function isSafeEmail(value: string): boolean {
  const domain = value
    .split('@')
    .pop()
    ?.toLowerCase();

  return Boolean(
    domain && SAFE_EMAIL_DOMAINS.has(domain)
  );
}

function isSafeIpv4(value: string): boolean {
  return (
    value.startsWith('192.0.2.') ||
    value.startsWith('198.51.100.') ||
    value.startsWith('203.0.113.')
  );
}

function luhnValid(value: string): boolean {
  const digits = digitsOnly(value);

  if (digits.length < 13 || digits.length > 19) {
    return false;
  }

  let sum = 0;
  let doubleDigit = false;

  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = Number(digits[i]);

    if (doubleDigit) {
      digit *= 2;

      if (digit > 9) {
        digit -= 9;
      }
    }

    sum += digit;
    doubleDigit = !doubleDigit;
  }

  return sum % 10 === 0;
}

function addFinding(
  out: PiiFinding[],
  path: string,
  kind: PiiFinding['kind'],
  value: string
): void {
  out.push({
    path,
    kind,
    sample: redact(value)
  });
}

function scanString(
  value: string,
  path: string,
  out: PiiFinding[]
): void {
  /*
   * UUIDs and ISO timestamps contain digit/hyphen patterns that
   * generic phone detection can incorrectly identify as PII.
   */
  const structuredSyntheticValue =
    isUuid(value) || isIsoDate(value);

  EMAIL_REGEX.lastIndex = 0;

  for (const match of value.matchAll(EMAIL_REGEX)) {
    const matched = match[0];

    if (!isSafeEmail(matched)) {
      addFinding(
        out,
        path,
        'email',
        matched
      );
    }
  }

  if (!structuredSyntheticValue) {
    PHONE_REGEX.lastIndex = 0;

    for (const match of value.matchAll(PHONE_REGEX)) {
      const matched = match[0];

      if (!isPlausiblePhone(matched)) {
        continue;
      }

      if (isSafeSyntheticPhone(matched)) {
        continue;
      }

      addFinding(
        out,
        path,
        'phone',
        matched
      );
    }
  }

  CREDIT_CARD_REGEX.lastIndex = 0;

  for (
    const match of value.matchAll(CREDIT_CARD_REGEX)
  ) {
    const matched = match[0];
    const compact = digitsOnly(matched);

    if (SAFE_TEST_CARDS.has(compact)) {
      continue;
    }

    /*
     * Prevent arbitrary long numeric IDs from automatically
     * being classified as cards.
     */
    if (!luhnValid(compact)) {
      continue;
    }

    addFinding(
      out,
      path,
      'credit_card',
      matched
    );
  }

  SSN_REGEX.lastIndex = 0;

  for (const match of value.matchAll(SSN_REGEX)) {
    addFinding(
      out,
      path,
      'ssn',
      match[0]
    );
  }

  AADHAAR_REGEX.lastIndex = 0;

  for (
    const match of value.matchAll(AADHAAR_REGEX)
  ) {
    addFinding(
      out,
      path,
      'aadhaar',
      match[0]
    );
  }

  PAN_REGEX.lastIndex = 0;

  for (const match of value.matchAll(PAN_REGEX)) {
    addFinding(
      out,
      path,
      'pan',
      match[0]
    );
  }

  IP_REGEX.lastIndex = 0;

  for (const match of value.matchAll(IP_REGEX)) {
    const matched = match[0];

    if (isSafeIpv4(matched)) {
      continue;
    }

    addFinding(
      out,
      path,
      'ip',
      matched
    );
  }

  SECRET_REGEX.lastIndex = 0;

  for (
    const match of value.matchAll(SECRET_REGEX)
  ) {
    addFinding(
      out,
      path,
      'secret',
      match[0]
    );
  }
}

function walk(
  value: unknown,
  path: string,
  out: PiiFinding[]
): void {
  if (typeof value === 'string') {
    scanString(value, path, out);
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      walk(
        item,
        `${path}[${index}]`,
        out
      );
    });

    return;
  }

  if (
    value &&
    typeof value === 'object'
  ) {
    for (
      const [key, child]
      of Object.entries(
        value as Record<string, unknown>
      )
    ) {
      walk(
        child,
        `${path}.${key}`,
        out
      );
    }
  }
}

export function scanForPii(
  value: unknown
): PiiFinding[] {
  const findings: PiiFinding[] = [];

  walk(
    value,
    '$',
    findings
  );

  return findings;
}

export function redact(
  value: string
): string {
  if (value.length <= 6) {
    return '***';
  }

  return `${value.slice(0, 2)}***${value.slice(-2)}`;
}

export function assertNoPii(
  value: unknown
): void {
  const findings =
    scanForPii(value);

  if (findings.length === 0) {
    return;
  }

  const summary = findings
    .map(
      finding =>
        `${finding.kind} at ${finding.path}`
    )
    .join(', ');

  throw new Error(
    `PII safeguard blocked input/output: ${summary}`
  );
}