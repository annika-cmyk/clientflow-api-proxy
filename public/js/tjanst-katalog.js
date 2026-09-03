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
      var item = {
        id: rec.id || ids[0] || '',
        namn: namn,
        ids: ids,
        aktuell: rec.aktuell === true || !!(rec.fields && rec.fields.Aktuell === true)
      };
      if (Object.prototype.hasOwnProperty.call(rec, 'aktiv')) item.aktiv = rec.aktiv === true;
      if (Object.prototype.hasOwnProperty.call(rec, 'valbar')) item.valbar = rec.valbar === true;
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

  function classifyCustomerServices(values, catalog, opts) {
    var index = catalog && catalog.byId ? catalog : catalogFromRecords(catalog);
    var lookup = (opts && opts.idLookup) || {};
    var matched = [];
    var normalize = [];
    var unknown = [];
    var askAnnika = [];
    asValues(values).forEach(function (raw) {
      var toMatch = raw;
      var resolvedNamn = '';
      if (isRecId(raw) && !index.byId[raw] && lookup[raw]) {
        resolvedNamn = lookup[raw];
        toMatch = resolvedNamn;
      }
      var hit = matchValue(toMatch, index);
      hit.raw = raw;
      if (resolvedNamn) hit.resolvedNamn = resolvedNamn;
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

  function unmatchedRaws(values, catalog, opts) {
    return classifyCustomerServices(values, catalog, opts).unmatched.map(function (hit) {
      return hit.raw;
    });
  }

  function unmatchedLabel(hit) {
    if (!hit) return '';
    var namn = trimStr(hit.resolvedNamn || hit.proposed || hit.catalogNamn);
    if (namn) return namn;
    if (!isRecId(hit.raw)) return trimStr(hit.raw);
    return 'saknad tjänstpost';
  }

  function reviewLabels(values, catalog, opts) {
    var classified = classifyCustomerServices(values, catalog, opts);
    var seen = {};
    var out = [];
    (classified.unknown || []).concat(classified.askAnnika || []).forEach(function (hit) {
      var label = unmatchedLabel(hit);
      var key = foldName(label);
      if (!label || seen[key]) return;
      seen[key] = true;
      out.push(label);
    });
    return out;
  }

  function isActiveCatalogItem(item) {
    if (!item || item.aktuell !== true) return false;
    // valbar beräknas server-side (Aktuell + utförande aktiv)
    if (Object.prototype.hasOwnProperty.call(item, 'valbar')) return item.valbar === true;
    // aktiv från utförandekatalogen — inaktiva ska inte kunna väljas
    if (Object.prototype.hasOwnProperty.call(item, 'aktiv')) return item.aktiv === true;
    return true;
  }

  function sanitizeToActiveCatalogIds(values, catalog, opts) {
    var index = catalog && catalog.byId ? catalog : catalogFromRecords(catalog);
    var classified = classifyCustomerServices(values, index, opts);
    var seen = {};
    var out = [];
    (classified.matched || []).concat(classified.normalize || []).forEach(function (hit) {
      var id = hit && hit.catalogId;
      if (!id || seen[id]) return;
      var item = index.byId[id];
      if (!item || !isActiveCatalogItem(item)) return;
      seen[id] = true;
      out.push(id);
    });
    return out;
  }

  function catalogIdsForCustomerValues(values, catalog, opts) {
    return sanitizeToActiveCatalogIds(values, catalog, opts);
  }

  function catalogIdsFromSelection(selectedIds, catalog, opts) {
    var index = catalog && catalog.byId ? catalog : catalogFromRecords(catalog);
    var activeOnly = !opts || opts.activeOnly !== false;
    var seen = {};
    var out = [];
    asValues(selectedIds).forEach(function (id) {
      var hit = matchValue(id, index);
      if (hit.status !== 'catalog') return;
      var item = index.byId[hit.catalogId];
      if (activeOnly && !isActiveCatalogItem(item)) return;
      var key = hit.catalogId || hit.raw;
      if (!key || seen[key]) return;
      seen[key] = true;
      out.push(hit.catalogId || hit.raw);
    });
    return out;
  }

  /** Vid sparning: endast aktiva katalog-ID från UI — inga dolda äldre/inaktiva värden. */
  function mergeSaveValues(existingValues, selectedCatalogIds, catalog, opts) {
    return catalogIdsFromSelection(selectedCatalogIds, catalog, opts);
  }

  function filterIncomingToCatalog(incoming, existing, catalog) {
    var index = catalog && catalog.byId ? catalog : catalogFromRecords(catalog);
    var incomingList = asValues(incoming);
    if (!incomingList.length) return sanitizeToActiveCatalogIds(asValues(existing), index);
    return sanitizeToActiveCatalogIds(incomingList, index);
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
    unmatchedLabel: unmatchedLabel,
    reviewLabels: reviewLabels,
    isActiveCatalogItem: isActiveCatalogItem,
    sanitizeToActiveCatalogIds: sanitizeToActiveCatalogIds,
    catalogIdsForCustomerValues: catalogIdsForCustomerValues,
    catalogIdsFromSelection: catalogIdsFromSelection,
    mergeSaveValues: mergeSaveValues,
    filterIncomingToCatalog: filterIncomingToCatalog
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  global.TjanstKatalog = api;
})(typeof window !== 'undefined' ? window : globalThis);
