'use strict';

/**
 * Kostnadsskydd för AML-nyheters AI-sammanfattningar.
 * Stoppar omkörningar vid varje dashboard-laddning och takar dygnsvolym.
 */

const DEFAULT_DAILY_CAP = 40;
const DEFAULT_ON_DEMAND_BATCH = 3;
const DEFAULT_MAX_FAILURES = 2;
const DEFAULT_FAIL_COOLDOWN_MS = 6 * 60 * 60 * 1000;

function stockholmDateYmd(d = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Stockholm',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(d);
}

function itemKey(item) {
  if (!item) return '';
  return String(item.content_hash || item.id || item.source_url || item.title || '').trim();
}

function createAiCostGuard(opts = {}) {
  const dailyCap = Math.max(0, Number(opts.dailyCap != null ? opts.dailyCap : DEFAULT_DAILY_CAP) || 0);
  const onDemandBatch = Math.max(0, Number(opts.onDemandBatch != null ? opts.onDemandBatch : DEFAULT_ON_DEMAND_BATCH) || 0);
  const maxFailures = Math.max(1, Number(opts.maxFailures != null ? opts.maxFailures : DEFAULT_MAX_FAILURES) || 2);
  const failCooldownMs = Math.max(0, Number(opts.failCooldownMs != null ? opts.failCooldownMs : DEFAULT_FAIL_COOLDOWN_MS) || 0);
  const nowFn = typeof opts.now === 'function' ? opts.now : () => Date.now();
  const ymdFn = typeof opts.ymd === 'function' ? opts.ymd : stockholmDateYmd;

  const state = {
    ymd: '',
    used: 0,
    fails: new Map()
  };

  function rollDay() {
    const ymd = ymdFn(new Date(nowFn()));
    if (state.ymd !== ymd) {
      state.ymd = ymd;
      state.used = 0;
    }
    return ymd;
  }

  function remaining() {
    rollDay();
    return Math.max(0, dailyCap - state.used);
  }

  function canSpend(n = 1) {
    return remaining() >= Math.max(1, Number(n) || 1);
  }

  function recordSuccess(item) {
    rollDay();
    state.used += 1;
    const key = itemKey(item);
    if (key) state.fails.delete(key);
  }

  function recordFailure(item) {
    rollDay();
    state.used += 1; // misslyckade anrop kostar också
    const key = itemKey(item);
    if (!key) return { count: 1, givenUp: false };
    const prev = state.fails.get(key) || { count: 0, lastAt: 0 };
    const next = { count: prev.count + 1, lastAt: nowFn() };
    state.fails.set(key, next);
    return { ...next, givenUp: next.count >= maxFailures };
  }

  function shouldSkip(item) {
    const key = itemKey(item);
    if (!key) return false;
    const prev = state.fails.get(key);
    if (!prev) return false;
    if (prev.count >= maxFailures) return true;
    if (failCooldownMs && prev.lastAt && (nowFn() - prev.lastAt) < failCooldownMs) return true;
    return false;
  }

  function hasGivenUp(item) {
    const key = itemKey(item);
    if (!key) return false;
    const prev = state.fails.get(key);
    return !!(prev && prev.count >= maxFailures);
  }

  function selectCandidates(rows, { limit = onDemandBatch, filter } = {}) {
    const budget = Math.min(Math.max(0, Number(limit) || 0), remaining());
    if (!budget) return [];
    const out = [];
    for (const row of rows || []) {
      if (out.length >= budget) break;
      if (typeof filter === 'function' && !filter(row)) continue;
      if (shouldSkip(row)) continue;
      out.push(row);
    }
    return out;
  }

  function snapshot() {
    rollDay();
    return {
      ymd: state.ymd,
      used: state.used,
      dailyCap,
      remaining: remaining(),
      onDemandBatch,
      maxFailures,
      trackedFailures: state.fails.size
    };
  }

  return {
    dailyCap,
    onDemandBatch,
    maxFailures,
    remaining,
    canSpend,
    recordSuccess,
    recordFailure,
    shouldSkip,
    hasGivenUp,
    selectCandidates,
    snapshot
  };
}

module.exports = {
  createAiCostGuard,
  stockholmDateYmd,
  itemKey,
  DEFAULT_DAILY_CAP,
  DEFAULT_ON_DEMAND_BATCH,
  DEFAULT_MAX_FAILURES,
  DEFAULT_FAIL_COOLDOWN_MS
};
