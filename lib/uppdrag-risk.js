function parseUppdragRiskAtgarderList(raw) {
  const text = (raw == null) ? '' : String(raw).trim();
  if (!text) return [];
  if (text.startsWith('[')) {
    try {
      const arr = JSON.parse(text);
      if (Array.isArray(arr)) {
        return arr.map((x) => {
          if (typeof x === 'string') return x.trim();
          if (x && typeof x === 'object') return String(x.text || x.name || x.label || '').trim();
          return '';
        }).filter(Boolean);
      }
    } catch (_) { /* fall through */ }
  }
  return text
    .split(/\r?\n/)
    .map((s) => s.replace(/^\s*[-•]\s*/, '').trim())
    .filter(Boolean);
}

function normalizeUppdragRiskAtgarderDone(raw) {
  if (raw == null || raw === '') return [];
  let arr = [];
  if (Array.isArray(raw)) {
    arr = raw;
  } else {
    const text = String(raw).trim();
    if (!text) return [];
    if (text.startsWith('[')) {
      try { arr = JSON.parse(text); } catch (_) { arr = []; }
    } else {
      arr = text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    }
  }
  if (!Array.isArray(arr)) return [];
  const seen = new Set();
  const out = [];
  arr.forEach((item) => {
    const obj = (item && typeof item === 'object')
      ? { text: String(item.text || item.name || '').trim(), checkedAt: item.checkedAt || '', user: item.user || '' }
      : { text: String(item || '').trim(), checkedAt: '', user: '' };
    const key = obj.text.toLowerCase();
    if (!obj.text || seen.has(key)) return;
    seen.add(key);
    out.push(obj);
  });
  return out;
}

function requiredRiskAtgarderFromUppdrag(fields) {
  return parseUppdragRiskAtgarderList((fields || {})['Riskåtgärder valda']);
}

function riskAtgarderAllChecked(required, done) {
  const need = (Array.isArray(required) ? required : []).map((s) => String(s || '').trim()).filter(Boolean);
  if (!need.length) return true;
  const have = new Set((Array.isArray(done) ? done : []).map((x) => String((x && x.text) || x || '').trim().toLowerCase()).filter(Boolean));
  return need.every((r) => have.has(r.toLowerCase()));
}

module.exports = {
  parseUppdragRiskAtgarderList,
  normalizeUppdragRiskAtgarderDone,
  requiredRiskAtgarderFromUppdrag,
  riskAtgarderAllChecked
};
