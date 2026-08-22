/**
 * Byråns tjänstekatalog är den enda tillåtna källan för kundens tjänster.
 * Fritext, skiftlägesvarianter och förkortningar matchas för granskning —
 * men skrivs inte tillbaka automatiskt.
 */
(function (global) {
  var REC_ID = /^rec[A-Za-z0-9]{8,}$/;

  var ALIASES = {
    bokslut: 'Bokslut',
    moms: 'Momsredovisning'
  };

  function trimStr(value) {
    return value == null ? '' : String(value).trim();
  }

  function foldName(value) {
    return trimStr(value)
      .toLowerCase()
      .normalize('NFC')
      .replace(/\s+/g, ' ');
  }

  function isRecId(value) {
    return REC_ID.test(trimStr(value));
  }

  function rawOf(value) {
    if (value == null || value === '') return '';
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'object') {
      return trimStr(value.id || value.recId || value.name || value.Name || value.namn);
    }
    return trimStr(value);
  }

  function asValues(value) {
    if (value == null || value === '') return [];
    if (Array.isArray(value)) return value.flatMap(asValues).filter(Boolean);
    var raw = rawOf(value);
    return raw ? [raw] : [];
  }

  function isAskAnnika(raw) {
    var key = foldName(raw);
    if (!key) return false;
    if (/periodisk\s+sammanst/.test(key)) return true;
    if (/^avst(?:a|ä)mning$/.test(key)) return true;
    return false;
  }

  function catalogFromRecords(records) {
    var byId = {};
    var byFold = {};
    var items = [];
    (Array.isArray(records) ? records : []).forEach(function (rec) {
      if (!rec) return;
      var namn = trimStr(
        rec.namn
        || rec.title
        || (rec.fields && (rec.fields['Task Name'] || rec.fields.Namn || rec.fields.Name))
      );
      if (!namn) return;
      var ids = [];
      if (rec.id) ids.push(rec.id);
      (rec._mergedRecordIds || rec.mergedIds || []).forEach(function (id) {
        if (id && ids.indexOf(id) === -1) ids.push(id);
      });
      var item = { id: rec.id || ids[0] || '', namn: namn, ids: ids };
      items.push(item);
      ids.forEach(function (id) { byId[id] = item; });
      var key = foldName(namn);
      if (key && !byFold[key]) byFold[key] = item;
    });
    return { items: items, byId: byId, byFold: byFold };
  }

  function matchValue(value, catalog) {
    var raw = rawOf(value);
    var index = catalog && catalog.byId ? catalog : catalogFromRecords(catalog);
    if (!raw) {
      return { raw: '', status: 'empty' };
    }
    if (isRecId(raw)) {
      var byId = index.byId[raw];
      if (byId) {
        return {
          raw: raw,
          status: 'catalog',
          how: 'id',
          catalogNamn: byId.namn,
          catalogId: byId.id
        };
      }
      return { raw: raw, status: 'unknown-id' };
    }
    var key = foldName(raw);
    var exact = index.byFold[key];
    if (exact) {
      if (exact.namn === raw) {
        return {
          raw: raw,
          status: 'catalog',
          how: 'exact',
          catalogNamn: exact.namn,
          catalogId: exact.id
        };
      }
      return {
        raw: raw,
        status: 'case',
        how: 'case',
        proposed: exact.namn,
        catalogNamn: exact.namn,
        catalogId: exact.id
      };
    }
    var aliasTarget = ALIASES[key];
    if (aliasTarget) {
      var dest = index.byFold[foldName(aliasTarget)];
      return {
        raw: raw,
        status: 'alias',
        how: 'alias',
        proposed: dest ? dest.namn : aliasTarget,
        catalogNamn: dest ? dest.namn : aliasTarget,
        catalogId: dest ? dest.id : ''
      };
    }
    if (isAskAnnika(raw)) {
      return { raw: raw, status: 'ask-annika', how: 'ask-annika' };
    }
    return { raw: raw, status: 'unknown', how: 'unknown' };
  }

  function classifyCustomerServices(values, catalog) {
    var index = catalog && catalog.byId ? catalog : catalogFromRecords(catalog);
    var matched = [];
    var normalize = [];
    var unknown = [];
    var askAnnika = [];
    asValues(values).forEach(function (raw) {
      var hit = matchValue(raw, index);
      if (hit.status === 'catalog') {
        matched.push(hit);
        return;
      }
      if (hit.status === 'case' || hit.status === 'alias') {
        normalize.push(hit);
        return;
      }
      if (hit.status === 'ask-annika') {
        askAnnika.push(hit);
        return;
      }
      if (hit.status && hit.status !== 'empty') unknown.push(hit);
    });
    return {
      matched: matched,
      normalize: normalize,
      unknown: unknown,
      askAnnika: askAnnika,
      unmatched: normalize.concat(askAnnika, unknown)
    };
  }

  function unmatchedRaws(values, catalog) {
    return classifyCustomerServices(values, catalog).unmatched.map(function (hit) {
      return hit.raw;
    });
  }

  function catalogIdsFromSelection(selectedIds, catalog) {
    var index = catalog && catalog.byId ? catalog : catalogFromRecords(catalog);
    var seen = {};
    var out = [];
    asValues(selectedIds).forEach(function (id) {
      var hit = matchValue(id, index);
      if (hit.status !== 'catalog') return;
      var key = hit.catalogId || hit.raw;
      if (!key || seen[key]) return;
      seen[key] = true;
      out.push(hit.catalogId || hit.raw);
    });
    return out;
  }

  /**
   * Vid sparning: bara katalog-ID från UI, plus oförändrade icke-katalogvärden
   * så att Avstämning/BOKSLUT inte raderas innan manuell granskning.
   */
  function mergeSaveValues(existingValues, selectedCatalogIds, catalog) {
    var keep = unmatchedRaws(existingValues, catalog);
    var ids = catalogIdsFromSelection(selectedCatalogIds, catalog);
    var seen = {};
    var out = [];
    ids.concat(keep).forEach(function (v) {
      if (!v || seen[v]) return;
      seen[v] = true;
      out.push(v);
    });
    return out;
  }

  function filterIncomingToCatalog(incoming, existing, catalog) {
    var index = catalog && catalog.byId ? catalog : catalogFromRecords(catalog);
    var incomingList = asValues(incoming);
    var onlyCatalog = incomingList.every(function (v) {
      return matchValue(v, index).status === 'catalog';
    });
    if (onlyCatalog) return incomingList;
    return mergeSaveValues(existing, incomingList, index);
  }

  var api = {
    REC_ID: REC_ID,
    ALIASES: ALIASES,
    trimStr: trimStr,
    foldName: foldName,
    isRecId: isRecId,
    asValues: asValues,
    isAskAnnika: isAskAnnika,
    catalogFromRecords: catalogFromRecords,
    matchValue: matchValue,
    classifyCustomerServices: classifyCustomerServices,
    unmatchedRaws: unmatchedRaws,
    catalogIdsFromSelection: catalogIdsFromSelection,
    mergeSaveValues: mergeSaveValues,
    filterIncomingToCatalog: filterIncomingToCatalog
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  global.TjanstKatalog = api;
})(typeof window !== 'undefined' ? window : globalThis);
