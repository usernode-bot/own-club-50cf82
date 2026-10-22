// Checks the resilience helpers behind the career read: one retry for a
// dropped connection, none for a query the database rejected, and an
// error body that names the database's code without leaking its message.
// Run with `npm test`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { isTransientDbError, queryWithRetry, loadFailureBody } = require('../career-db.js');

function poolThatThrows(errors, result) {
  const calls = [];
  return {
    calls,
    query: async (text, params) => {
      calls.push([text, params]);
      const next = errors.shift();
      if (next) throw next;
      return result;
    },
  };
}

test('retries a transient error once', async () => {
  const pool = poolThatThrows([{ code: 'ECONNRESET' }], { rows: [{ state: {} }] });
  const out = await queryWithRetry(pool, 'SELECT 1', [], { delayMs: 0 });
  assert.deepEqual(out, { rows: [{ state: {} }] });
  assert.equal(pool.calls.length, 2);
});

test('gives up after one retry', async () => {
  const pool = poolThatThrows([{ code: '57P01' }, { code: '57P01' }], { rows: [] });
  await assert.rejects(queryWithRetry(pool, 'SELECT 1', [], { delayMs: 0 }), (err) => err.code === '57P01');
  assert.equal(pool.calls.length, 2);
});

test('does not retry a schema error', async () => {
  const pool = poolThatThrows([{ code: '42703' }], { rows: [] });
  await assert.rejects(queryWithRetry(pool, 'SELECT 1', [], { delayMs: 0 }), (err) => err.code === '42703');
  assert.equal(pool.calls.length, 1);
});

test('a node-pg message with no code is transient', () => {
  assert.equal(isTransientDbError(new Error('Connection terminated unexpectedly')), true);
  assert.equal(isTransientDbError(new Error('syntax error')), false);
});

test('the failure body carries the code and reference, never the message', () => {
  assert.deepEqual(loadFailureBody({ code: '57P01', message: 'x' }, 'ab12cd34'), {
    error: 'career_load_failed',
    code: '57P01',
    requestId: 'ab12cd34',
    message: 'The saved career could not be read.',
  });
  const noCode = loadFailureBody(new Error('password authentication failed'), 'ab12cd34');
  assert.equal(noCode.code, 'unknown');
  assert.equal(JSON.stringify(noCode).includes('password authentication failed'), false);
});
