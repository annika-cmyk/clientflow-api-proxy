/**
 * PT/TF-markering och export av hot på tjänstenivå.
 */
(function (global) {
  var RiskSkalaRef = (typeof global !== 'undefined' && global.RiskSkala)
    || (typeof require === 'function' ? require('./risk-skala') : null);

  function trimStr(v) {
    return v == null ? '' : String(v).trim();
  }

  function parseJsonList(raw) {
    if (Array.isArray(raw)) return raw.filter(function (x) { return x && typeof x === 'object'; });
    if (raw == null || raw === '') return [];
    try {
      var parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return Array.isArray(parsed) ? parsed.filter(function (x) { return x && typeof x === 'object'; }) : [];
    } catch (_) {
      return [];
    }
  }

  function hotTyp(hot) {
    if (!hot || typeof hot !== 'object') return '';
    var raw = hot.typ || hot.type || hot.ptTf || hot['PT/TF'];
    if (RiskSkalaRef && RiskSkalaRef.normalizePtTf) {
      var normalized = RiskSkalaRef.normalizePtTf(raw);
      if (normalized) return normalized;
    } else {
      var t = trimStr(raw).toUpperCase();
      if (t === 'TF' || t === 'BÅDA' || t === 'BADA') return t === 'TF' ? 'TF' : 'Båda';
      if (t === 'PT') return 'PT';
    }
    return trimStr(raw) ? '' : 'PT';
  }

  function isTfHot(hot) {
    var typ = hotTyp(hot);
    if (RiskSkalaRef && RiskSkalaRef.isTfRelevant) return RiskSkalaRef.isTfRelevant(typ);
    return typ === 'TF' || typ === 'Båda';
  }

  function isPtHot(hot) {
    var typ = hotTyp(hot);
    return typ === 'PT' || typ === 'Båda';
  }

  function hasTfHot(hotList) {
    return parseJsonList(hotList).some(isTfHot);
  }

  function hasPtHot(hotList) {
    return parseJsonList(hotList).some(isPtHot);
  }

  function ptTfCoverage(hotList, fallback) {
    var list = parseJsonList(hotList);
    if (list.length) {
      var pt = list.some(isPtHot);
      var tf = list.some(isTfHot);
      if (pt && tf) return 'Båda';
      if (tf) return 'TF';
      if (pt) return 'PT';
    }
    if (RiskSkalaRef && RiskSkalaRef.normalizePtTf) {
      return RiskSkalaRef.normalizePtTf(fallback) || '';
    }
    var folded = trimStr(fallback);
    if (!folded) return '';
    return folded;
  }

  function formatPtTfMark(coverage) {
    if (coverage === 'Båda') return ' [PT/TF]';
    if (coverage === 'TF') return ' [TF]';
    if (coverage === 'PT') return ' [PT]';
    return '';
  }

  function formatPtTfDocLabel(coverage) {
    if (coverage === 'Båda') return 'Båda — penningtvätt och finansiering av terrorism';
    if (coverage === 'TF') return 'TF';
    if (coverage === 'PT') return 'PT';
    return '';
  }

  function formatHotExportLine(hot) {
    var titel = trimStr(hot && (hot.titel || hot.title || hot.namn));
    var desc = trimStr(hot && (hot.beskrivning || hot.description));
    var typ = hotTyp(hot);
    var prefix = typ === 'Båda' ? 'PT/TF-hot' : (isTfHot(hot) ? 'TF-hot' : 'PT-hot');
    if (titel && desc) return prefix + ': ' + titel + ': ' + desc;
    return prefix + ': ' + (titel || desc);
  }

  function formatHotExport(hotList) {
    return parseJsonList(hotList).map(formatHotExportLine).filter(Boolean).join(' ');
  }

  var api = {
    parseJsonList: parseJsonList,
    hotTyp: hotTyp,
    isTfHot: isTfHot,
    isPtHot: isPtHot,
    hasTfHot: hasTfHot,
    hasPtHot: hasPtHot,
    ptTfCoverage: ptTfCoverage,
    formatPtTfMark: formatPtTfMark,
    formatPtTfDocLabel: formatPtTfDocLabel,
    formatHotExportLine: formatHotExportLine,
    formatHotExport: formatHotExport
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  global.TjanstTfTackning = api;
})(typeof window !== 'undefined' ? window : globalThis);
