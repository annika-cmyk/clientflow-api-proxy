/**
 * Browser twin of lib/riskfaktor-kalla.js
 */
(function (global) {
  var REVIEW_STATUS = 'behöver_granskas';
  var FIELD_GRANSKNING = 'Riskfaktor granskning (JSON)';
  var FIELD_PROFIL_STATUS = 'Riskprofil status';

  function trimStr(v) {
    return v == null ? '' : String(v).trim();
  }

  function asIdList(ids) {
    if (ids instanceof Set) return Array.from(ids);
    return Array.isArray(ids) ? ids : [];
  }

  function mergeAddOnly(linkedSet, steeredIds, suggestedIds) {
    var set = linkedSet instanceof Set ? linkedSet : new Set(asIdList(linkedSet));
    var steered = new Set(asIdList(steeredIds));
    var suggested = new Set(asIdList(suggestedIds));
    var added = [];
    var pendingRemoval = [];
    suggested.forEach(function (id) {
      if (!id) return;
      if (!set.has(id)) added.push(id);
      set.add(id);
    });
    steered.forEach(function (id) {
      if (!id) return;
      if (set.has(id) && !suggested.has(id)) pendingRemoval.push(id);
    });
    return { set: set, added: added, pendingRemoval: pendingRemoval };
  }

  function kycAnswerLabel(factor, kyc) {
    if (!factor) return '';
    var parsed = kyc && typeof kyc === 'object' ? kyc : {};
    if (factor.id === 'kontanter') return 'kontanter = ' + (trimStr(parsed.kontanter) || '–');
    if (factor.id === 'kryptovaluta') return 'krypto = ' + (trimStr(parsed.kryptovaluta) || '–');
    if (factor.id === 'hogrisklander') {
      var handel = trimStr(parsed.internationellHandel) || '–';
      var lander = trimStr(parsed.internationellaLander);
      return lander ? 'högriskländer (' + lander + ')' : 'internationell handel = ' + handel;
    }
    if (factor.kycField) return factor.kycField + ' = ' + (trimStr(parsed[factor.kycField]) || '–');
    return factor.label || factor.id || 'KYC';
  }

  function sourceForFactor(opts) {
    opts = opts || {};
    var suggested = !!opts.suggested;
    var linked = !!opts.linked;
    var factor = opts.factor || null;
    var namn = trimStr(opts.namn) || (factor && factor.label) || '';
    if (suggested && factor) {
      return { kind: 'kyc', label: 'Från KYC: ' + kycAnswerLabel(factor, opts.kyc), namn: namn, recordId: opts.recordId || '' };
    }
    if (suggested) {
      return { kind: 'auto', label: opts.autoSourceLabel || 'Från automation', namn: namn, recordId: opts.recordId || '' };
    }
    if (linked) {
      return { kind: 'manual', label: opts.manualSourceLabel || 'Manuellt', namn: namn, recordId: opts.recordId || '' };
    }
    return { kind: 'none', label: '', namn: namn, recordId: opts.recordId || '' };
  }

  function reviewItem(opts) {
    opts = opts || {};
    return {
      recordId: opts.recordId || '',
      namn: trimStr(opts.namn),
      reason: trimStr(opts.reason),
      previous: trimStr(opts.previous),
      next: trimStr(opts.next),
      at: new Date().toISOString().slice(0, 10)
    };
  }

  function parseGranskning(raw) {
    if (raw == null || raw === '') return { items: [], sinceAssessment: [] };
    try {
      var parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
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
    var s = state || {};
    return JSON.stringify({
      items: Array.isArray(s.items) ? s.items : [],
      sinceAssessment: Array.isArray(s.sinceAssessment) ? s.sinceAssessment : [],
      assessedAt: trimStr(s.assessedAt) || '',
      assessedLinkedIds: Array.isArray(s.assessedLinkedIds) ? s.assessedLinkedIds : []
    });
  }

  function mergeReviewItems(existing, incoming) {
    var byId = {};
    (existing || []).forEach(function (it) { if (it && it.recordId) byId[it.recordId] = it; });
    (incoming || []).forEach(function (it) { if (it && it.recordId) byId[it.recordId] = it; });
    return Object.keys(byId).map(function (k) { return byId[k]; });
  }

  function needsReview(fields) {
    var f = fields || {};
    if (trimStr(f[FIELD_PROFIL_STATUS]) === REVIEW_STATUS) return true;
    return parseGranskning(f[FIELD_GRANSKNING]).items.length > 0;
  }

  function changesSinceAssessment(fields) {
    var g = parseGranskning((fields || {})[FIELD_GRANSKNING]);
    return g.items.length ? g.items : g.sinceAssessment;
  }

  var api = {
    REVIEW_STATUS: REVIEW_STATUS,
    FIELD_GRANSKNING: FIELD_GRANSKNING,
    FIELD_PROFIL_STATUS: FIELD_PROFIL_STATUS,
    mergeAddOnly: mergeAddOnly,
    kycAnswerLabel: kycAnswerLabel,
    sourceForFactor: sourceForFactor,
    reviewItem: reviewItem,
    parseGranskning: parseGranskning,
    serializeGranskning: serializeGranskning,
    mergeReviewItems: mergeReviewItems,
    needsReview: needsReview,
    changesSinceAssessment: changesSinceAssessment
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.RiskfaktorKalla = api;
})(typeof window !== 'undefined' ? window : globalThis);
