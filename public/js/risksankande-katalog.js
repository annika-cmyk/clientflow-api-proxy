/**
 * Byråns katalog för risksänkande faktorer på kundkortet.
 * Sparad per byrå. Borttagna default-faktorer stannar borttagna.
 */
(function (global) {
  var DEFAULT_RISKSANKANDE = [
    'Enkel struktur, lätt att få överblick på transaktionerna',
    'Små transaktioner',
    'Mycket god ordning',
    'Kommun, region eller liknande',
    'Långsiktig affärsrelation'
  ];

  function trimStr(v) {
    return String(v == null ? '' : v).trim();
  }

  function fold(namn) {
    return trimStr(namn).toLowerCase().replace(/\s+/g, ' ');
  }

  function isIngaLabel(namn) {
    return fold(namn) === 'inga';
  }

  function isRemoved(raw) {
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      return isRemoved(raw.klass || raw.status || '');
    }
    var v = trimStr(raw).toUpperCase().replace(/\s+/g, '_');
    return v === 'BORTTAGEN' || v === 'REMOVED' || v === 'TA_BORT';
  }

  function parseKatalog(raw) {
    if (!raw) return {};
    if (Array.isArray(raw)) {
      var fromArr = {};
      raw.forEach(function (item) {
        if (typeof item === 'string') {
          var n = trimStr(item);
          if (n && !isIngaLabel(n)) fromArr[n] = { forklaring: '', kalla: '' };
          return;
        }
        if (!item || typeof item !== 'object') return;
        var namn = trimStr(item.namn || item.label || item.name);
        if (!namn || isIngaLabel(namn)) return;
        if (isRemoved(item)) {
          fromArr[namn] = 'BORTTAGEN';
          return;
        }
        fromArr[namn] = {
          forklaring: trimStr(item.forklaring || item.beskrivning || ''),
          kalla: trimStr(item.kalla || item.source || '')
        };
      });
      return fromArr;
    }
    if (typeof raw === 'object') return raw;
    try {
      var parsed = JSON.parse(String(raw));
      return parseKatalog(parsed);
    } catch (e) {
      return {};
    }
  }

  function normalizeEntry(raw) {
    if (isRemoved(raw)) return null;
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      return {
        forklaring: trimStr(raw.forklaring || raw.beskrivning || ''),
        kalla: trimStr(raw.kalla || raw.source || '')
      };
    }
    if (typeof raw === 'string' && trimStr(raw) && !isRemoved(raw)) {
      return { forklaring: '', kalla: '' };
    }
    return { forklaring: '', kalla: '' };
  }

  function mergeKatalog(overrides) {
    var out = {};
    DEFAULT_RISKSANKANDE.forEach(function (namn) {
      out[namn] = { forklaring: '', kalla: '' };
    });
    var extra = parseKatalog(overrides);
    Object.keys(extra).forEach(function (k) {
      var namn = trimStr(k);
      if (!namn || isIngaLabel(namn)) return;
      if (isRemoved(extra[k])) {
        delete out[namn];
        return;
      }
      var entry = normalizeEntry(extra[k]);
      if (entry) out[namn] = entry;
    });
    return out;
  }

  function persistKatalog(working) {
    var parsed = parseKatalog(working);
    var visible = {};
    Object.keys(parsed).forEach(function (k) {
      var namn = trimStr(k);
      if (!namn || isIngaLabel(namn) || isRemoved(parsed[k])) return;
      var entry = normalizeEntry(parsed[k]);
      if (!entry) return;
      visible[namn] = entry;
    });
    var stored = {};
    Object.keys(visible).forEach(function (k) {
      stored[k] = visible[k];
    });
    DEFAULT_RISKSANKANDE.forEach(function (k) {
      if (!visible[k]) stored[k] = 'BORTTAGEN';
    });
    return { visible: visible, stored: stored };
  }

  function labels(katalog) {
    return Object.keys(katalog && typeof katalog === 'object' ? katalog : {});
  }

  function metaFor(namn, katalog) {
    var map = katalog && typeof katalog === 'object' ? katalog : {};
    var want = fold(namn);
    if (!want) return { forklaring: '', kalla: '' };
    if (map[namn] && typeof map[namn] === 'object') return normalizeEntry(map[namn]) || { forklaring: '', kalla: '' };
    var found = null;
    Object.keys(map).some(function (k) {
      if (fold(k) === want) {
        found = normalizeEntry(map[k]);
        return true;
      }
      return false;
    });
    return found || { forklaring: '', kalla: '' };
  }

  var api = {
    DEFAULT_RISKSANKANDE: DEFAULT_RISKSANKANDE,
    parseKatalog: parseKatalog,
    mergeKatalog: mergeKatalog,
    persistKatalog: persistKatalog,
    labels: labels,
    metaFor: metaFor,
    isIngaLabel: isIngaLabel,
    isRemoved: isRemoved
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  global.RisksankandeKatalog = api;
})(typeof window !== 'undefined' ? window : globalThis);
