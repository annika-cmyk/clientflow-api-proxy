'use strict';

/**
 * Källa per länkad riskfaktor + add-only KYC-styrning.
 * Automation får lägga till faktorer men aldrig ta bort manuellt satta.
 * Om KYC skulle ta bort/ändra → flagga «behöver granskas» i stället.
 */

const REVIEW_STATUS = 'behöver_granskas';
const FIELD_GRANSKNING = 'Riskfaktor granskning (JSON)';
const FIELD_PROFIL_STATUS = 'Riskprofil status';

function trimStr(v) {
  return v == null ? '' : String(v).trim();
}

function asIdList(ids) {
  if (ids instanceof Set) return [...ids];
  return Array.isArray(ids) ? ids : [];
}

/**
 * Add-only merge: suggested ids läggs till, steered ids tas aldrig bort automatiskt.
 * @returns {{ set: Set, added: string[], pendingRemoval: string[] }}
 */
function mergeAddOnly(linkedSet, steeredIds, suggestedIds) {
  const set = linkedSet instanceof Set ? linkedSet : new Set(asIdList(linkedSet));
  const steered = new Set(asIdList(steeredIds));
  const suggested = new Set(asIdList(suggestedIds));
  const added = [];
  const pendingRemoval = [];
  suggested.forEach((id) => {
    if (!id) return;
    if (!set.has(id)) added.push(id);
    set.add(id);
  });
  steered.forEach((id) => {
    if (!id) return;
    if (set.has(id) && !suggested.has(id)) pendingRemoval.push(id);
  });
  return { set, added, pendingRemoval };
}

function kycAnswerLabel(factor, kyc) {
  if (!factor) return '';
  const parsed = kyc && typeof kyc === 'object' ? kyc : {};
  if (factor.id === 'kontanter') {
    const v = trimStr(parsed.kontanter) || '–';
    return `kontanter = ${v}`;
  }
  if (factor.id === 'kryptovaluta') {
    const v = trimStr(parsed.kryptovaluta) || '–';
    return `krypto = ${v}`;
  }
  if (factor.id === 'hogrisklander') {
    const handel = trimStr(parsed.internationellHandel) || '–';
    const lander = trimStr(parsed.internationellaLander);
    return lander ? `högriskländer (${lander})` : `internationell handel = ${handel}`;
  }
  if (factor.kycField) {
    const v = trimStr(parsed[factor.kycField]) || '–';
    return `${factor.kycField} = ${v}`;
  }
  return factor.label || factor.id || 'KYC';
}

/**
 * @param {object} opts
 * @param {string} opts.recordId
 * @param {string} [opts.namn]
 * @param {boolean} opts.suggested — KYC/automation vill ha faktorn nu
 * @param {boolean} opts.linked
 * @param {object} [opts.factor] — matched KYC-faktor
 * @param {object} [opts.kyc]
 * @param {string} [opts.manualSourceLabel]
 */
function sourceForFactor(opts = {}) {
  const suggested = !!opts.suggested;
  const linked = !!opts.linked;
  const factor = opts.factor || null;
  const namn = trimStr(opts.namn) || (factor && factor.label) || '';
  if (suggested && factor) {
    return {
      kind: 'kyc',
      label: `Från KYC: ${kycAnswerLabel(factor, opts.kyc)}`,
      namn,
      recordId: opts.recordId || ''
    };
  }
  if (suggested) {
    return {
      kind: 'auto',
      label: opts.autoSourceLabel || 'Från automation',
      namn,
      recordId: opts.recordId || ''
    };
  }
  if (linked) {
    return {
      kind: 'manual',
      label: opts.manualSourceLabel || 'Manuellt',
      namn,
      recordId: opts.recordId || ''
    };
  }
  return {
    kind: 'none',
    label: '',
    namn,
    recordId: opts.recordId || ''
  };
}

function reviewItem({ recordId, namn, reason, previous, next }) {
  return {
    recordId: recordId || '',
    namn: trimStr(namn),
    reason: trimStr(reason),
    previous: trimStr(previous),
    next: trimStr(next),
    at: new Date().toISOString().slice(0, 10)
  };
}

function parseGranskning(raw) {
  if (raw == null || raw === '') {
    return { items: [], sinceAssessment: [] };
  }
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!parsed || typeof parsed !== 'object') return { items: [], sinceAssessment: [] };
    return {
      items: Array.isArray(parsed.items) ? parsed.items : [],
      sinceAssessment: Array.isArray(parsed.sinceAssessment) ? parsed.sinceAssessment : [],
      assessedAt: trimStr(parsed.assessedAt),
      assessedLinkedIds: Array.isArray(parsed.assessedLinkedIds) ? parsed.assessedLinkedIds : []
    };
  } catch (_) {
    return { items: [], sinceAssessment: [] };
  }
}

function serializeGranskning(state) {
  const s = state || {};
  return JSON.stringify({
    items: Array.isArray(s.items) ? s.items : [],
    sinceAssessment: Array.isArray(s.sinceAssessment) ? s.sinceAssessment : [],
    assessedAt: trimStr(s.assessedAt) || '',
    assessedLinkedIds: Array.isArray(s.assessedLinkedIds) ? s.assessedLinkedIds : []
  });
}

function mergeReviewItems(existing, incoming) {
  const byId = new Map();
  (Array.isArray(existing) ? existing : []).forEach((it) => {
    if (it && it.recordId) byId.set(it.recordId, it);
  });
  (Array.isArray(incoming) ? incoming : []).forEach((it) => {
    if (it && it.recordId) byId.set(it.recordId, it);
  });
  return [...byId.values()];
}

function buildFieldsForReview(fields, reviewItems, linkedIds) {
  const f = fields || {};
  const prev = parseGranskning(f[FIELD_GRANSKNING]);
  const items = mergeReviewItems(prev.items, reviewItems);
  const out = {};
  if (items.length) {
    out[FIELD_PROFIL_STATUS] = REVIEW_STATUS;
    out[FIELD_GRANSKNING] = serializeGranskning({
      ...prev,
      items,
      sinceAssessment: items
    });
  }
  if (Array.isArray(linkedIds)) {
    out['risker kopplat till tjänster'] = linkedIds;
  }
  return out;
}

function clearReviewOnAssess(fields, linkedIds) {
  const f = fields || {};
  const prev = parseGranskning(f[FIELD_GRANSKNING]);
  return {
    [FIELD_GRANSKNING]: serializeGranskning({
      items: [],
      sinceAssessment: [],
      assessedAt: new Date().toISOString().slice(0, 10),
      assessedLinkedIds: asIdList(linkedIds)
    }),
    ...(f[FIELD_PROFIL_STATUS] === REVIEW_STATUS ? { [FIELD_PROFIL_STATUS]: 'aktuell' } : {}),
    assessedSnapshot: prev
  };
}

function needsReview(fields) {
  const f = fields || {};
  if (trimStr(f[FIELD_PROFIL_STATUS]) === REVIEW_STATUS) return true;
  const g = parseGranskning(f[FIELD_GRANSKNING]);
  return g.items.length > 0;
}

function changesSinceAssessment(fields) {
  const g = parseGranskning((fields || {})[FIELD_GRANSKNING]);
  return g.items.length ? g.items : g.sinceAssessment;
}

module.exports = {
  REVIEW_STATUS,
  FIELD_GRANSKNING,
  FIELD_PROFIL_STATUS,
  mergeAddOnly,
  kycAnswerLabel,
  sourceForFactor,
  reviewItem,
  parseGranskning,
  serializeGranskning,
  mergeReviewItems,
  buildFieldsForReview,
  clearReviewOnAssess,
  needsReview,
  changesSinceAssessment
};
