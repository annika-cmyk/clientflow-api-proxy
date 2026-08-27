/**
 * Styrning av geografisk riskfaktor utifrån Polisens utsatta områden.
 */
(function (global) {
  var FACTOR = {
    id: 'utsatt_omrade_se',
    label: 'Särskilt utsatt område i Sverige',
    aliases: [
      'sarskilt utsatt',
      'särskilt utsatt',
      'utsatt omrade',
      'utsatt område',
      'polisens utsatta',
      'uso_2025'
    ]
  };

  function fold(s) {
    return String(s || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ');
  }

  function recordNamn(rec) {
    if (!rec) return '';
    var f = rec.fields || rec;
    return String(f.Riskfaktor || f['Riskfaktor'] || rec.namn || '').trim();
  }

  function matchFactor(namn) {
    var key = fold(namn);
    if (!key) return null;
    if (key === fold(FACTOR.label) || key.indexOf(fold(FACTOR.label)) !== -1) return FACTOR;
    for (var i = 0; i < FACTOR.aliases.length; i += 1) {
      if (key.indexOf(fold(FACTOR.aliases[i])) !== -1) return FACTOR;
    }
    return null;
  }

  function parseStored(raw) {
    if (raw == null || raw === '') return null;
    try {
      var parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch (_) {
      return null;
    }
  }

  function hasHit(stored) {
    return !!(stored && stored.trff);
  }

  function steeredRecordIds(records) {
    return (Array.isArray(records) ? records : []).filter(function (rec) {
      return !!(matchFactor(recordNamn(rec)) && rec.id);
    }).map(function (rec) { return rec.id; });
  }

  function suggestedRecordIds(records, stored) {
    if (!hasHit(stored)) return [];
    return steeredRecordIds(records);
  }

  function mergeIntoLinkedSet(linkedSet, records, stored) {
    var set = linkedSet instanceof Set ? linkedSet : new Set(linkedSet || []);
    var steered = new Set(steeredRecordIds(records));
    var suggested = new Set(suggestedRecordIds(records, stored));
    steered.forEach(function (id) { set.delete(id); });
    suggested.forEach(function (id) { set.add(id); });
    return set;
  }

  var api = {
    FACTOR: FACTOR,
    fold: fold,
    matchFactor: matchFactor,
    parseStored: parseStored,
    hasHit: hasHit,
    steeredRecordIds: steeredRecordIds,
    suggestedRecordIds: suggestedRecordIds,
    mergeIntoLinkedSet: mergeIntoLinkedSet
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  global.UtsattOmradeStyrning = api;
})(typeof window !== 'undefined' ? window : globalThis);
