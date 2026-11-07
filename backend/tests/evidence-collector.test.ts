import assert from 'node:assert/strict';
import { test } from 'node:test';
process.env.DATABASE_URL ??= 'postgresql://test:test@127.0.0.1:5432/self_healing_test';
const { sanitizeLog } = await import('../src/diagnosis/evidence-collector.js');

test('redacts common secrets and authorization credentials from logs', () => {
  const clean = sanitizeLog('password=hunter2 Authorization: Bearer abc.def https://user:pass@example.test');
  assert.doesNotMatch(clean, /hunter2|abc\.def|user:pass/);
  assert.match(clean, /\[REDACTED\]/);
});

test('removes Docker frame control bytes that PostgreSQL JSON cannot store', () => {
  assert.equal(sanitizeLog('line\u0000\u001b[31merror\u001b[0m'), 'line[31merror[0m');
});
