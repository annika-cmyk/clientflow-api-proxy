/**
 * TF-täckning på tjänstenivå: minst ett TF/Båda-hot eller en tjänstespecifik motivering.
 */
(function (global) {
  var RiskSkalaRef = (typeof global !== 'undefined' && global.RiskSkala)
    || (typeof require === 'function' ? require('./risk-skala') : null);

  var TF_MOTIVERING_MIN = 20;
  var TF_SAVE_ERROR = 'Denna tjänst saknar TF-hot. Ange varför TF-analysen bedöms tillräckligt täckt av PT-analysen, eller lägg till ett TF-hot under Hot-fliken.';
  var TF_BANNER_TEXT = '⚠ Denna tjänst saknar TF-hot (finansiering av terrorism). Lägg till ett TF-hot, eller ange en motivering i fältet nedan för varför PT-analysen bedöms tillräcklig.';
  var TF_FIELD = 'TF-motivering';

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

  function tfMotiveringOk(raw) {
    return trimStr(raw).length >= TF_MOTIVERING_MIN;
  }

  function parsePoangObject(raw) {
    if (!raw) return null;
    if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
    if (typeof raw !== 'string') return null;
    try {
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch (_) {
      return null;
    }
  }

  function readTfMotivering(fields) {
    var f = fields || {};
    var direct = trimStr(f[TF_FIELD] || f.tfMotivering || f.TfMotivering);
    if (direct) return direct;
    var fromPoang = parsePoangObject(f['Riskpoäng'] || f.Riskpoang || f['Samspelsexempel']);
    return fromPoang ? trimStr(fromPoang.tfMotivering || fromPoang[TF_FIELD]) : '';
  }

  function tjanstSaknarTfTackning(fieldsOrTjanst) {
    var src = fieldsOrTjanst || {};
    var fields = src.fields || src;
    var hot = src.hot != null ? src.hot : fields.Hot || fields.hot;
    return !hasTfHot(hot) && !tfMotiveringOk(src.tfMotivering != null ? src.tfMotivering : readTfMotivering(fields));
  }

  function validateTjanstTfTackning(opts) {
    var o = opts || {};
    if (o.asDraft === true) return { ok: true, draft: true };
    if (hasTfHot(o.hot)) return { ok: true };
    if (tfMotiveringOk(o.tfMotivering)) return { ok: true };
    return { ok: false, error: TF_SAVE_ERROR };
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
    TF_MOTIVERING_MIN: TF_MOTIVERING_MIN,
    TF_SAVE_ERROR: TF_SAVE_ERROR,
    TF_BANNER_TEXT: TF_BANNER_TEXT,
    TF_FIELD: TF_FIELD,
    parseJsonList: parseJsonList,
    hotTyp: hotTyp,
    isTfHot: isTfHot,
    isPtHot: isPtHot,
    hasTfHot: hasTfHot,
    hasPtHot: hasPtHot,
    ptTfCoverage: ptTfCoverage,
    formatPtTfMark: formatPtTfMark,
    formatPtTfDocLabel: formatPtTfDocLabel,
    tfMotiveringOk: tfMotiveringOk,
    readTfMotivering: readTfMotivering,
    tjanstSaknarTfTackning: tjanstSaknarTfTackning,
    validateTjanstTfTackning: validateTjanstTfTackning,
    formatHotExportLine: formatHotExportLine,
    formatHotExport: formatHotExport
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  global.TjanstTfTackning = api;
})(typeof window !== 'undefined' ? window : globalThis);
