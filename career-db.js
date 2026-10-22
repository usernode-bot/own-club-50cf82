'use strict';

// Reading a saved career from Postgres, with the two small pieces of
// resilience the career screen needs. Kept apart from server.js so the
// retry can be tested without a database.

// Errors that mean the connection itself hiccuped rather than the query
// being wrong: a second attempt a moment later can succeed.
const TRANSIENT_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EPIPE',
  '57P01', // admin_shutdown
  '57P02', // crash_shutdown
  '57P03', // cannot_connect_now
  '53300', // too_many_connections
]);

// node-pg's own wording for a pooled client the database closed, which
// carries no code.
const TRANSIENT_MESSAGE = /Connection terminated|timeout exceeded when trying to connect/i;

function isTransientDbError(err) {
  if (!err) return false;
  const code = typeof err.code === 'string' ? err.code : '';
  if (TRANSIENT_CODES.has(code)) return true;
  // Class 08 is "Connection Exception": everything in it is retryable.
  if (code.startsWith('08')) return true;
  if (!code && TRANSIENT_MESSAGE.test(String(err.message || ''))) return true;
  return false;
}

const DEFAULT_DELAY_MS = 250;

// Run one read, and if the connection failed underneath it, wait briefly
// and try exactly once more. Any other error is thrown at once.
async function queryWithRetry(pool, text, params, { delayMs = DEFAULT_DELAY_MS } = {}) {
  try {
    return await pool.query(text, params);
  } catch (err) {
    if (!isTransientDbError(err)) throw err;
    console.warn('db read retry: ' + (err.code || err.message));
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
    return pool.query(text, params);
  }
}

// What a failed career read answers: a fixed, friendly message, the
// database's error code when it is a plain identifier, and a per-request
// reference that also appears in the server log. The error's own message
// is never sent to the browser.
function loadFailureBody(err, requestId) {
  const raw = err && err.code;
  const code = typeof raw === 'string' && raw.length <= 16 && /^[A-Za-z0-9_]+$/.test(raw)
    ? raw
    : 'unknown';
  return {
    error: 'career_load_failed',
    code,
    requestId,
    message: 'The saved career could not be read.',
  };
}

module.exports = { isTransientDbError, queryWithRetry, loadFailureBody };
