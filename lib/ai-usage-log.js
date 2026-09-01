'use strict';

/**
 * Persistent AI-usage-logg per anrop (användare, byrå, route, modell, tokens).
 * Lagras som JSONL på disk + ringbuffer i minnet. Render-loggar får också en rad.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const DEFAULT_MAX_MEMORY = 500;
const DEFAULT_MAX_FILE_BYTES = 25 * 1024 * 1024;
const DEFAULT_RETENTION_DAYS = 45;

function resolveLogPath() {
  const fromEnv = String(process.env.AI_USAGE_LOG_PATH || '').trim();
  if (fromEnv) return fromEnv;
  return path.join(os.tmpdir(), 'clientflow-ai-usage.jsonl');
}

function maxMemory() {
  const n = parseInt(process.env.AI_USAGE_LOG_MEMORY || '', 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 5000) : DEFAULT_MAX_MEMORY;
}

function maxFileBytes() {
  const n = parseInt(process.env.AI_USAGE_LOG_MAX_BYTES || '', 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_FILE_BYTES;
}

function retentionDays() {
  const n = parseInt(process.env.AI_USAGE_LOG_RETENTION_DAYS || '', 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_RETENTION_DAYS;
}

function nowIso() {
  return new Date().toISOString();
}

function asInt(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

function normalizeEntry(raw) {
  const usage = raw && raw.usage && typeof raw.usage === 'object' ? raw.usage : {};
  return {
    id: String(raw && raw.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
    ts: String(raw && raw.ts || nowIso()),
    user: String(raw && raw.user || '').trim().toLowerCase(),
    byraId: String(raw && raw.byraId || '').trim(),
    byra: String(raw && raw.byra || '').trim(),
    route: String(raw && raw.route || '').trim(),
    model: String(raw && raw.model || '').trim(),
    status: String(raw && raw.status || 'ok').trim() || 'ok',
    durationMs: asInt(raw && raw.durationMs),
    inputTokens: asInt(usage.inputTokens != null ? usage.inputTokens : raw && raw.inputTokens),
    outputTokens: asInt(usage.outputTokens != null ? usage.outputTokens : raw && raw.outputTokens),
    cachedInputTokens: asInt(usage.cachedInputTokens != null ? usage.cachedInputTokens : raw && raw.cachedInputTokens),
    totalTokens: asInt(usage.totalTokens != null ? usage.totalTokens : raw && raw.totalTokens),
    error: String(raw && raw.error || '').slice(0, 240)
  };
}

function createAiUsageLog(opts = {}) {
  const memory = [];
  let writeChain = Promise.resolve();
  const getPath = typeof opts.logPath === 'function' ? opts.logPath : () => opts.logPath || resolveLogPath();
  const fsImpl = opts.fs || fs;

  function pushMemory(entry) {
    memory.unshift(entry);
    const cap = maxMemory();
    if (memory.length > cap) memory.length = cap;
  }

  function rotateIfNeeded(filePath) {
    try {
      const st = fsImpl.statSync(filePath);
      if (!st || st.size < maxFileBytes()) return;
      const bak = `${filePath}.1`;
      try { fsImpl.unlinkSync(bak); } catch (_) { /* ignore */ }
      fsImpl.renameSync(filePath, bak);
    } catch (_) {
      /* fil saknas */
    }
  }

  function appendFile(entry) {
    const filePath = getPath();
    const line = `${JSON.stringify(entry)}\n`;
    writeChain = writeChain.then(() => new Promise((resolve) => {
      try {
        fsImpl.mkdirSync(path.dirname(filePath), { recursive: true });
      } catch (_) { /* ignore */ }
      try {
        rotateIfNeeded(filePath);
        fsImpl.appendFile(filePath, line, (err) => {
          if (err) console.warn('AI-usage-log skrivfel:', err.message);
          resolve();
        });
      } catch (err) {
        console.warn('AI-usage-log skrivfel:', err.message);
        resolve();
      }
    }));
    return writeChain;
  }

  function record(raw) {
    const entry = normalizeEntry(raw);
    if (!entry.totalTokens) {
      entry.totalTokens = entry.inputTokens + entry.outputTokens;
    }
    pushMemory(entry);
    console.log(
      '🤖 AI-usage',
      JSON.stringify({
        user: entry.user || '(system)',
        byraId: entry.byraId || undefined,
        route: entry.route || undefined,
        model: entry.model || undefined,
        status: entry.status,
        in: entry.inputTokens,
        out: entry.outputTokens,
        cached: entry.cachedInputTokens || undefined,
        ms: entry.durationMs || undefined
      })
    );
    appendFile(entry);
    return entry;
  }

  function recent(limit = 50) {
    const n = Math.max(1, Math.min(Number(limit) || 50, maxMemory()));
    return memory.slice(0, n);
  }

  function readFileEntries(sinceIso) {
    const filePath = getPath();
    let text = '';
    try {
      text = fsImpl.readFileSync(filePath, 'utf8');
    } catch (_) {
      try {
        text = fsImpl.readFileSync(`${filePath}.1`, 'utf8');
      } catch (__) {
        return [];
      }
    }
    const sinceMs = sinceIso ? Date.parse(sinceIso) : 0;
    const out = [];
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      try {
        const entry = normalizeEntry(JSON.parse(line));
        if (sinceMs && Date.parse(entry.ts) < sinceMs) continue;
        out.push(entry);
      } catch (_) { /* skip bad line */ }
    }
    return out;
  }

  function mergeEntries(sinceIso) {
    const fromFile = readFileEntries(sinceIso);
    const seen = new Set(fromFile.map((e) => e.id));
    for (const m of memory) {
      if (sinceIso && Date.parse(m.ts) < Date.parse(sinceIso)) continue;
      if (!seen.has(m.id)) fromFile.push(m);
    }
    fromFile.sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
    return fromFile;
  }

  function summarize(optsIn = {}) {
    const days = Math.max(1, Math.min(Number(optsIn.days) || 30, retentionDays()));
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const entries = mergeEntries(since);
    const byUser = new Map();
    const byRoute = new Map();
    const byDay = new Map();

    function bump(map, key, entry) {
      const k = key || '(okänd)';
      const cur = map.get(k) || {
        key: k,
        requests: 0,
        errors: 0,
        inputTokens: 0,
        outputTokens: 0,
        cachedInputTokens: 0,
        totalTokens: 0
      };
      cur.requests += 1;
      if (entry.status && entry.status !== 'ok') cur.errors += 1;
      cur.inputTokens += entry.inputTokens;
      cur.outputTokens += entry.outputTokens;
      cur.cachedInputTokens += entry.cachedInputTokens;
      cur.totalTokens += entry.totalTokens || (entry.inputTokens + entry.outputTokens);
      map.set(k, cur);
    }

    for (const entry of entries) {
      bump(byUser, entry.user || '(system)', entry);
      bump(byRoute, entry.route || '(okänd)', entry);
      bump(byDay, String(entry.ts || '').slice(0, 10) || '(okänd)', entry);
    }

    const sortTok = (a, b) => b.totalTokens - a.totalTokens || b.requests - a.requests;
    return {
      days,
      since,
      totalRequests: entries.length,
      totalInputTokens: entries.reduce((s, e) => s + e.inputTokens, 0),
      totalOutputTokens: entries.reduce((s, e) => s + e.outputTokens, 0),
      totalTokens: entries.reduce((s, e) => s + (e.totalTokens || e.inputTokens + e.outputTokens), 0),
      byUser: [...byUser.values()].sort(sortTok),
      byRoute: [...byRoute.values()].sort(sortTok),
      byDay: [...byDay.values()].sort((a, b) => String(b.key).localeCompare(String(a.key))),
      recent: entries.slice(0, Math.max(1, Math.min(Number(optsIn.recentLimit) || 40, 200)))
    };
  }

  return {
    record,
    recent,
    summarize,
    mergeEntries,
    flush: () => writeChain
  };
}

const defaultLog = createAiUsageLog();

module.exports = {
  createAiUsageLog,
  normalizeEntry,
  resolveLogPath,
  recordAiUsage: (...args) => defaultLog.record(...args),
  summarizeAiUsage: (...args) => defaultLog.summarize(...args),
  recentAiUsage: (...args) => defaultLog.recent(...args),
  defaultAiUsageLog: defaultLog
};
