/**
 * Retry Airtable (or axios) calls that hit 429 / temporary 5xx.
 */

function sleepMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableAirtableError(err) {
  const status = err && err.response && err.response.status;
  if (status === 429 || status === 503) return true;
  const msg = String((err && err.message) || '');
  return /\b429\b|rate limit|too many requests/i.test(msg);
}

function retryDelayMs(err, attempt, baseDelayMs) {
  const header = err && err.response && err.response.headers
    ? err.response.headers['retry-after']
    : null;
  const retryAfterSec = Number(header);
  if (Number.isFinite(retryAfterSec) && retryAfterSec > 0) {
    return Math.min(retryAfterSec * 1000, 10000);
  }
  return Math.min(baseDelayMs * (2 ** (attempt - 1)), 8000);
}

/**
 * @param {() => Promise<any>} fn
 * @param {{ maxAttempts?: number, baseDelayMs?: number, sleep?: (ms:number)=>Promise<void> }} [opts]
 */
async function withAirtableRetry(fn, opts = {}) {
  const maxAttempts = Math.max(1, opts.maxAttempts || 3);
  const baseDelayMs = opts.baseDelayMs || 500;
  const sleep = opts.sleep || sleepMs;
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isRetryableAirtableError(err) || attempt >= maxAttempts) throw err;
      await sleep(retryDelayMs(err, attempt, baseDelayMs));
    }
  }
  throw lastErr;
}

function friendlyAirtableRateLimitMessage(fallback) {
  return fallback
    || 'Clientflow (Airtable) är tillfälligt överbelastad. Vänta några sekunder och försök igen.';
}

module.exports = {
  sleepMs,
  isRetryableAirtableError,
  retryDelayMs,
  withAirtableRetry,
  friendlyAirtableRateLimitMessage
};
