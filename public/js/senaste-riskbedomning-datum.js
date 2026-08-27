(function (global) {
  function toDateOnly(value) {
    if (!value) return '';
    var s = String(value).trim();
    var m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) {
      return m[1] + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[3]).padStart(2, '0');
    }
    var parsed = Date.parse(s.replace(' ', 'T'));
    if (!Number.isFinite(parsed)) return '';
    return new Date(parsed).toISOString().slice(0, 10);
  }

  function parseKategorier(raw) {
    if (Array.isArray(raw)) return raw.filter(function (x) { return x && typeof x === 'object'; });
    var s = String(raw == null ? '' : raw).trim();
    if (!s) return [];
    try {
      var parsed = JSON.parse(s);
      return Array.isArray(parsed) ? parsed.filter(function (x) { return x && typeof x === 'object'; }) : [];
    } catch (_) {
      return [];
    }
  }

  function latestIso(dates) {
    var valid = (dates || []).map(toDateOnly).filter(Boolean);
    if (!valid.length) return '';
    return valid.sort().reverse()[0];
  }

  function resolveSenasteRiskbedomningDatum(fields) {
    var f = fields && typeof fields === 'object' ? fields : {};
    var candidates = [
      f['Riskbedömning utförd datum'],
      f['Riskbedomning utford datum'],
      f['Kundens riskbedömning godkänd'],
      f['Kundens riskbedomning godkand']
    ];
    parseKategorier(f['Dokumentation Kategorier']).forEach(function (entry) {
      var cat = String(entry.category || entry.kategori || '').trim();
      var sub = String(entry.subcategory || '').trim();
      if (cat !== 'riskbedomning' || sub !== 'kund_riskbedomning') return;
      candidates.push(entry.createdDate || entry.skapatDatum);
      var fn = String(entry.filename || entry.displayName || '');
      var match = fn.match(/\d{4}-\d{2}-\d{2}/);
      if (match) candidates.push(match[0]);
    });
    return latestIso(candidates);
  }

  function formatSenasteRiskbedomningSv(iso) {
    var d = toDateOnly(iso);
    if (!d) return '';
    return new Date(d + 'T12:00:00').toLocaleDateString('sv-SE');
  }

  global.SenasteRiskbedomningDatum = {
    resolveSenasteRiskbedomningDatum: resolveSenasteRiskbedomningDatum,
    formatSenasteRiskbedomningSv: formatSenasteRiskbedomningSv
  };
})(typeof window !== 'undefined' ? window : globalThis);
