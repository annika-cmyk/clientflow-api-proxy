'use strict';

const ACTION_TYPES = Object.freeze([
  'risknivå_ändrad',
  'risknivå_ej_satt_vid_skapande',
  'ar_version_skapad',
  'ai_innehåll_genererat',
  'ai_innehåll_sparat',
  'ai_innehåll_godkänt_oredigerat',
  'screening_utförd',
  'screening_träff_bedömd',
  'avvikelse_registrerad',
  'avvikelse_eskalerad',
  'avvikelse_status_ändrad',
  'riskaptit_status_ändrad',
  'riskaptit_beslut_registrerat'
]);

const ENTITY_TYPES = Object.freeze([
  'kund',
  'ar_dokument',
  'riskfaktor',
  'tjanst',
  'avvikelse',
  'screening'
]);

const ACTION_LABELS = Object.freeze({
  'risknivå_ändrad': 'Risknivå ändrad',
  'risknivå_ej_satt_vid_skapande': 'Risknivå saknades vid skapande',
  'ar_version_skapad': 'AR-version skapad',
  'ai_innehåll_genererat': 'AI-innehåll genererat',
  'ai_innehåll_sparat': 'AI-innehåll sparat',
  'ai_innehåll_godkänt_oredigerat': 'AI-innehåll godkänt oredigerat',
  'screening_utförd': 'Screening utförd',
  'screening_träff_bedömd': 'Screeningträff bedömd',
  'avvikelse_registrerad': 'Avvikelse registrerad',
  'avvikelse_eskalerad': 'Avvikelse eskalerad',
  'avvikelse_status_ändrad': 'Avvikelse status ändrad',
  'riskaptit_status_ändrad': 'Riskaptit status ändrad',
  'riskaptit_beslut_registrerat': 'Riskaptitbeslut registrerat'
});

const RISK_UNSET_HOURS = 48;
const AI_REVIEW_DIFF_THRESHOLD = 15;

const SYSTEM_ACTORS = Object.freeze({
  openai: { actorId: 'system:openai', actorName: 'AI (OpenAI)' },
  dilisense: { actorId: 'system:dilisense', actorName: 'System (Dilisense)' },
  minibok: { actorId: 'system:minibok', actorName: 'System (Minibok)' },
  system: { actorId: 'system', actorName: 'System' }
});

const MOTIVERING_REQUIRED = new Set([
  'risknivå_ändrad',
  'avvikelse_registrerad',
  'avvikelse_eskalerad',
  'ai_innehåll_godkänt_oredigerat',
  'screening_träff_bedömd',
  'riskaptit_beslut_registrerat'
]);

function immutableError(operation) {
  const err = new Error('Audit-loggen är append-only. ' + operation + ' är inte tillåtet.');
  err.code = 'AUDIT_IMMUTABLE';
  throw err;
}

function forbidUpdate() {
  immutableError('UPDATE');
}

function forbidDelete() {
  immutableError('DELETE');
}

function isGenericSystemActor(actor) {
  if (!actor) return true;
  const id = String(actor.actorId || '').trim().toLowerCase();
  const name = String(actor.actorName || '').trim();
  return (!id && !name) || id === 'system' || name === 'System';
}

function normalizeActor(actor, options = {}) {
  if (!actor || (!actor.actorId && !actor.actorName)) {
    if (options.requireNamedActor) {
      const err = new Error('Audit-aktör krävs. System är reserverat för bakgrundsjobb.');
      err.code = 'AUDIT_ACTOR_REQUIRED';
      throw err;
    }
    return { ...SYSTEM_ACTORS.system };
  }
  return {
    actorId: String(actor.actorId || actor.actorName || 'system'),
    actorName: String(actor.actorName || actor.actorId || 'System')
  };
}

function actorFromUser(userData, req) {
  const email = (userData && userData.email) || (req && req.user && req.user.email) || '';
  const name = (userData && (userData.name || userData.fullName)) || email;
  const id = (userData && userData.id) || email;
  if (!id && !name) return null;
  return { actorId: String(id), actorName: String(name || id) };
}

function requireHttpActor(actor) {
  if (!actor || isGenericSystemActor(actor)) {
    const err = new Error('Audit-aktör kräver inloggad användare. System är reserverat för bakgrundsjobb.');
    err.code = 'AUDIT_ACTOR_REQUIRED';
    throw err;
  }
  return actor;
}

function customerRiskEmpty(fields) {
  const f = fields || {};
  const value = f.Riskniva || f['Risknivå'] || f['sammanlagd risk'] || '';
  return !String(value).trim();
}

function parseSxK(raw) {
  if (!raw) return null;
  let obj = raw;
  if (typeof raw === 'string') {
    try { obj = JSON.parse(raw); } catch (_) { return null; }
  }
  if (!obj || typeof obj !== 'object') return null;
  const sannolikhet = Number(obj.sannolikhet);
  const konsekvens = Number(obj.konsekvens);
  if (!sannolikhet && !konsekvens) return null;
  const produkt = (sannolikhet || 0) * (konsekvens || 0);
  return {
    sannolikhet: sannolikhet || null,
    konsekvens: konsekvens || null,
    produkt: produkt || null,
    nivå: obj.niva || obj.nivå || obj.level || '',
    sannolikhetEfter: obj.sannolikhetEfter != null ? Number(obj.sannolikhetEfter) : null,
    konsekvensEfter: obj.konsekvensEfter != null ? Number(obj.konsekvensEfter) : null
  };
}

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function wordLevenshtein(a, b) {
  const n = a.length;
  const m = b.length;
  if (!n) return m;
  if (!m) return n;
  const prev = new Array(m + 1);
  const curr = new Array(m + 1);
  for (let j = 0; j <= m; j++) prev[j] = j;
  for (let i = 1; i <= n; i++) {
    curr[0] = i;
    for (let j = 1; j <= m; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= m; j++) prev[j] = curr[j];
  }
  return prev[m];
}

function wordDiffPercent(aiOutputRaw, sparadText) {
  const a = tokenize(aiOutputRaw);
  const b = tokenize(sparadText);
  if (!a.length && !b.length) return 0;
  const denom = Math.max(a.length, b.length);
  if (!denom) return 0;
  const distance = wordLevenshtein(a, b);
  return Math.round((distance / denom) * 1000) / 10;
}

function requiresAiReview(diffPercent, threshold = AI_REVIEW_DIFF_THRESHOLD) {
  return Number(diffPercent) < Number(threshold);
}

function isRiskUnsetOverdue(entry, options = {}) {
  if (!entry || entry.actionType !== 'risknivå_ej_satt_vid_skapande') return false;
  if (options.riskStillEmpty === false) return false;
  const hours = options.hours != null ? Number(options.hours) : RISK_UNSET_HOURS;
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  const ts = new Date(entry.timestamp).getTime();
  if (!Number.isFinite(ts)) return false;
  return (now.getTime() - ts) >= hours * 3600 * 1000;
}

function createAuditEntry(input, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  const actor = normalizeActor(input && input.actor);
  const actionType = String((input && input.actionType) || '');
  const motivering = String((input && input.motivering) || '').trim();
  if (MOTIVERING_REQUIRED.has(actionType) && !motivering && !options.allowEmptyMotivering) {
    const err = new Error('Motivering krävs för ' + actionType);
    err.code = 'AUDIT_MOTIVERING_REQUIRED';
    throw err;
  }
  return {
    id: (input && input.id) || null,
    timestamp: now.toISOString(),
    actorId: actor.actorId,
    actorName: actor.actorName,
    entityType: String((input && input.entityType) || ''),
    entityId: String((input && input.entityId) || ''),
    actionType,
    fieldChanged: String((input && input.fieldChanged) || ''),
    valueBefore: input && Object.prototype.hasOwnProperty.call(input, 'valueBefore') ? input.valueBefore : null,
    valueAfter: input && Object.prototype.hasOwnProperty.call(input, 'valueAfter') ? input.valueAfter : null,
    motivering,
    metadata: input && input.metadata && typeof input.metadata === 'object' ? input.metadata : {},
    byraId: input && input.byraId != null ? String(input.byraId) : '',
    relatedLogId: String((input && input.relatedLogId) || ''),
    requiresReview: !!(input && input.requiresReview)
  };
}

function buildAiSavedEntry({ generated, sparadText, actor, now, threshold }) {
  if (!generated || generated.actionType !== 'ai_innehåll_genererat') {
    const err = new Error('ai_innehåll_sparat kräver en ai_innehåll_genererat-rad');
    err.code = 'AUDIT_RELATED_MISSING';
    throw err;
  }
  const raw = (generated.metadata && generated.metadata.aiOutputRaw) || '';
  const saved = sparadText == null ? '' : String(sparadText);
  const diffProcent = wordDiffPercent(raw, saved);
  const kraverGranskning = requiresAiReview(diffProcent, threshold);
  return createAuditEntry({
    actor: actor || { actorId: generated.actorId, actorName: generated.actorName },
    entityType: generated.entityType,
    entityId: generated.entityId,
    actionType: 'ai_innehåll_sparat',
    fieldChanged: generated.fieldChanged,
    valueBefore: raw,
    valueAfter: saved,
    relatedLogId: generated.id,
    requiresReview: kraverGranskning,
    byraId: generated.byraId,
    metadata: {
      ...(generated.metadata || {}),
      aiOutputRaw: raw,
      sparadText: saved,
      diffProcent,
      kraverGranskning,
      relatedLogId: generated.id
    }
  }, { now });
}

function matchesQuery(entry, query) {
  const q = query || {};
  if (q.byraId && String(entry.byraId) !== String(q.byraId)) return false;
  if (q.entityType && entry.entityType !== q.entityType) return false;
  if (q.entityId && String(entry.entityId) !== String(q.entityId)) return false;
  if (q.actionType && entry.actionType !== q.actionType) return false;
  if (q.actorId && String(entry.actorId) !== String(q.actorId)) return false;
  if (q.requiresReview === true && !entry.requiresReview) return false;
  if (q.from) {
    const from = new Date(q.from).getTime();
    if (Number.isFinite(from) && new Date(entry.timestamp).getTime() < from) return false;
  }
  if (q.to) {
    const to = new Date(q.to).getTime();
    if (Number.isFinite(to) && new Date(entry.timestamp).getTime() > to) return false;
  }
  if (q.q) {
    const hay = [
      entry.actorName,
      entry.entityId,
      entry.actionType,
      entry.fieldChanged,
      entry.motivering,
      JSON.stringify(entry.metadata || {})
    ].join(' ').toLowerCase();
    if (!hay.includes(String(q.q).toLowerCase())) return false;
  }
  return true;
}

function filterAuditLogs(entries, query) {
  const list = Array.isArray(entries) ? entries.slice() : [];
  const filtered = list.filter((entry) => matchesQuery(entry, query));
  filtered.sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
  return filtered;
}

function groupAiReviewItems(entries) {
  const list = Array.isArray(entries) ? entries : [];
  const pending = list.filter((entry) => (
    entry.actionType === 'ai_innehåll_sparat'
    && (entry.requiresReview || (entry.metadata && entry.metadata.kraverGranskning))
  ));
  const approvedIds = new Set(
    list
      .filter((entry) => entry.actionType === 'ai_innehåll_godkänt_oredigerat' && entry.relatedLogId)
      .map((entry) => entry.relatedLogId)
  );
  return pending.filter((entry) => !approvedIds.has(entry.id));
}

function createMemoryStore(seed) {
  const rows = Array.isArray(seed) ? seed.slice() : [];
  let seq = rows.length;
  return {
    async insert(entry) {
      seq += 1;
      const row = { ...entry, id: entry.id || ('log_' + seq) };
      rows.push(row);
      return row;
    },
    async list(query) {
      return filterAuditLogs(rows, query);
    },
    async getById(id) {
      return rows.find((row) => row.id === id) || null;
    },
    update: forbidUpdate,
    delete: forbidDelete,
    patch: forbidUpdate,
    remove: forbidDelete
  };
}

function createAuditLogService(store) {
  if (!store || typeof store.insert !== 'function' || typeof store.list !== 'function') {
    throw new Error('audit store med insert och list krävs');
  }
  return {
    async insert(input, options) {
      const entry = createAuditEntry(input, options);
      return store.insert(entry);
    },
    async getAuditLog(entityType, entityId) {
      return store.list({ entityType, entityId });
    },
    async list(query) {
      return store.list(query);
    },
    async getById(id) {
      if (typeof store.getById === 'function') return store.getById(id);
      const all = await store.list({});
      return all.find((row) => row.id === id) || null;
    },
    async insertAiGenerated(input, options) {
      return this.insert({
        ...input,
        actionType: 'ai_innehåll_genererat',
        actor: input.actor || SYSTEM_ACTORS.openai,
        metadata: {
          ...(input.metadata || {}),
          aiOutputRaw: input.aiOutputRaw || (input.metadata && input.metadata.aiOutputRaw) || '',
          sparadText: '',
          promptVersion: input.promptVersion || (input.metadata && input.metadata.promptVersion) || '',
          modellNamn: input.modellNamn || (input.metadata && input.metadata.modellNamn) || 'OpenAI Assistant'
        }
      }, options);
    },
    async insertAiSaved({ generatedId, sparadText, actor, now, threshold }) {
      const generated = await this.getById(generatedId);
      const entry = buildAiSavedEntry({ generated, sparadText, actor, now, threshold });
      return store.insert(entry);
    },
    update: forbidUpdate,
    delete: forbidDelete
  };
}

function toPublicEntry(entry) {
  if (!entry) return null;
  return {
    id: entry.id,
    timestamp: entry.timestamp,
    actorId: entry.actorId,
    actorName: entry.actorName,
    entityType: entry.entityType,
    entityId: entry.entityId,
    actionType: entry.actionType,
    actionLabel: ACTION_LABELS[entry.actionType] || entry.actionType,
    fieldChanged: entry.fieldChanged,
    valueBefore: entry.valueBefore,
    valueAfter: entry.valueAfter,
    motivering: entry.motivering,
    metadata: entry.metadata || {},
    byraId: entry.byraId,
    relatedLogId: entry.relatedLogId,
    requiresReview: !!entry.requiresReview,
    overdue: !!entry.overdue
  };
}

function mapDilisenseHits(foundRecords, assessedBy) {
  const list = Array.isArray(foundRecords) ? foundRecords : [];
  return list.map((hit) => ({
    matchadPerson: hit.name || hit.full_name || hit.entity_name || hit.namn || '',
    kalla: hit.source_type || hit.source || '',
    beskrivning: hit.description || hit.positions || '',
    bedömning: hit.bedömning || hit.bedomning || null,
    bedömdAv: hit.bedömdAv || assessedBy || '',
    motivering: hit.motivering || '',
    datum: hit.datum || null
  }));
}

module.exports = {
  ACTION_TYPES,
  ACTION_LABELS,
  ENTITY_TYPES,
  RISK_UNSET_HOURS,
  AI_REVIEW_DIFF_THRESHOLD,
  SYSTEM_ACTORS,
  MOTIVERING_REQUIRED,
  forbidUpdate,
  forbidDelete,
  normalizeActor,
  actorFromUser,
  requireHttpActor,
  isGenericSystemActor,
  customerRiskEmpty,
  parseSxK,
  tokenize,
  wordDiffPercent,
  requiresAiReview,
  isRiskUnsetOverdue,
  createAuditEntry,
  buildAiSavedEntry,
  matchesQuery,
  filterAuditLogs,
  groupAiReviewItems,
  createMemoryStore,
  createAuditLogService,
  toPublicEntry,
  mapDilisenseHits
};
