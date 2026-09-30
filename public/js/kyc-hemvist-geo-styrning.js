/**
 * Styr geografiska residualfaktorer (byråns kunder) från KYC-hemvist
 * och utsatt-område-träff på företagets adress.
 *
 * Mutual exclusivity: Sverige (ej utsatt) ↔ särskilt utsatt område.
 * EU / utanför EU kan kombineras med Sverige när flera hemvister finns.
 * Utsatt-område styrs separat av UtsattOmradeStyrning (företagets adress).
 */
(function (global) {
  var FACTORS = [
    {
      id: 'hemvist_se',
      label: 'Kunden har skatterättslig hemvist i Sverige (ej utsatt område)',
      aliases: [
        'skatterattslig hemvist i sverige',
        'skatterättslig hemvist i sverige',
        'hemvist i sverige (ej utsatt',
        'hemvist i sverige'
      ]
    },
    {
      id: 'hemvist_eu',
      label: 'Kunden har geografisk hemvist utanför Sverige men inom EU',
      aliases: [
        'hemvist utanfor sverige men inom eu',
        'hemvist utanför sverige men inom eu',
        'utanfor sverige men inom eu',
        'utanför sverige men inom eu',
        'geografisk hemvist utanfor sverige',
        'geografisk hemvist utanför sverige'
      ]
    },
    {
      id: 'hemvist_utanfor_eu',
      label: 'Kunden har geografisk hemvist utanför EU',
      aliases: [
        'hemvist utanfor eu',
        'hemvist utanför eu',
        'geografisk hemvist utanfor eu',
        'geografisk hemvist utanför eu'
      ]
    }
  ];

  function fold(s) {
    return String(s || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ');
  }

  function trimStr(value) {
    return value == null ? '' : String(value).trim();
  }

  function recordNamn(rec) {
    if (!rec) return '';
    var f = rec.fields || rec;
    return String(f.Riskfaktor || f['Riskfaktor'] || rec.namn || '').trim();
  }

  function recordTyp(rec) {
    if (!rec) return '';
    var f = rec.fields || rec;
    return String(f['Typ av riskfaktor'] || '').trim();
  }

  function isGeografiskByraRecord(rec) {
    var typ = recordTyp(rec);
    if (!typ) return true;
    if (/motpart|kunder\s*&\s*leverant|kundens kunder/i.test(typ)) return false;
    return /geograf/i.test(typ);
  }

  function matchFactor(namn) {
    var key = fold(namn);
    if (!key) return null;
    for (var i = 0; i < FACTORS.length; i += 1) {
      var factor = FACTORS[i];
      if (key === fold(factor.label) || key.indexOf(fold(factor.label)) !== -1) return factor;
      for (var j = 0; j < factor.aliases.length; j += 1) {
        if (key.indexOf(fold(factor.aliases[j])) !== -1) return factor;
      }
    }
    return null;
  }

  function isSwedenLabel(label) {
    var key = fold(label);
    return key === 'sverige' || key === 'sweden' || key === 'se'
      || key === 'kingdom of sweden';
  }

  function euApi() {
    return global.EuHogriskLander || null;
  }

  function kycHuvudmanApi() {
    return global.KycHuvudman || null;
  }

  function classifyHemvistLabel(label) {
    var raw = trimStr(label);
    if (!raw) return null;
    if (isSwedenLabel(raw)) return 'se';
    var Eu = euApi();
    if (Eu && Eu.findCountry) {
      var hit = Eu.findCountry(raw);
      if (hit) {
        if (hit.iso2 === 'SE') return 'se';
        if (hit.group === (Eu.GROUP && Eu.GROUP.EU_EES) || hit.group === 'EU_EES') return 'eu';
        return 'utanfor_eu';
      }
    }
    // Okänt landnamn behandlas som utanför EU (försiktigare residual)
    return 'utanfor_eu';
  }

  function parseKyc(raw) {
    if (raw == null || raw === '') return {};
    try {
      var parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  function parseUtsattStored(raw) {
    if (raw == null || raw === '') return null;
    try {
      var parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch (_) {
      return null;
    }
  }

  function hasUtsattHit(stored) {
    return !!(stored && stored.trff);
  }

  /**
   * Samlar unika hemvist-etiketter från företag + huvudman + företrädare.
   * opts.addressImpliesSweden: true om företagets adress kontrollerats i Sverige.
   */
  function collectHemvistLabels(kyc, opts) {
    var src = parseKyc(kyc);
    var seen = {};
    var out = [];
    function push(label) {
      var raw = trimStr(label);
      if (!raw) return;
      var key = fold(raw);
      if (seen[key]) return;
      seen[key] = true;
      out.push(raw);
    }

    push(src.skatterattslig_hemvist_foretag);

    var HM = kycHuvudmanApi();
    var huvudman = [];
    var foretradare = [];
    if (HM) {
      if (HM.listFromSaved) huvudman = HM.listFromSaved(src, []) || [];
      if (HM.listForetradareFromSaved) foretradare = HM.listForetradareFromSaved(src) || [];
    } else {
      if (Array.isArray(src.huvudman)) huvudman = src.huvudman;
      if (Array.isArray(src.foretradare)) foretradare = src.foretradare;
      else if (src.skatterattslig_hemvist_foretradare) {
        foretradare = [{ skatterattslig_hemvist: src.skatterattslig_hemvist_foretradare }];
      }
    }
    huvudman.concat(foretradare).forEach(function (p) {
      var person = p || {};
      push(person.skatterattslig_hemvist || person.hemvist);
    });

    if (opts && opts.hemvistLabels) {
      (Array.isArray(opts.hemvistLabels) ? opts.hemvistLabels : []).forEach(push);
    }

    if ((!out.length || (opts && opts.addressImpliesSweden)) && opts && opts.addressImpliesSweden) {
      push('Sverige');
    }

    return out;
  }

  function assessHemvist(kyc, opts) {
    var labels = collectHemvistLabels(kyc, opts);
    var classes = { se: false, eu: false, utanfor_eu: false };
    labels.forEach(function (label) {
      var klass = classifyHemvistLabel(label);
      if (klass) classes[klass] = true;
    });
    if (!labels.length && opts && opts.addressImpliesSweden) {
      classes.se = true;
      labels = ['Sverige'];
    }
    return {
      labels: labels,
      hasSweden: !!classes.se,
      hasEu: !!classes.eu,
      hasOutsideEu: !!classes.utanfor_eu
    };
  }

  function suggestedFactorIds(kyc, utsattStored, opts) {
    var assessed = assessHemvist(kyc, opts);
    var utsattHit = hasUtsattHit(utsattStored);
    var ids = [];
    // Mutual exclusivity med utsatt-adress: ej-utsatt-Sverige bara när ingen träff
    if (assessed.hasSweden && !utsattHit) ids.push('hemvist_se');
    if (assessed.hasEu) ids.push('hemvist_eu');
    if (assessed.hasOutsideEu) ids.push('hemvist_utanfor_eu');
    return ids;
  }

  function geoRecordsFromList(records) {
    return (Array.isArray(records) ? records : []).filter(function (rec) {
      return isGeografiskByraRecord(rec) && matchFactor(recordNamn(rec)) && rec.id;
    });
  }

  function steeredRecordIds(records) {
    return geoRecordsFromList(records).map(function (rec) { return rec.id; });
  }

  function suggestedRecordIds(records, kyc, utsattStored, opts) {
    var wanted = {};
    suggestedFactorIds(kyc, utsattStored, opts).forEach(function (id) { wanted[id] = true; });
    return (Array.isArray(records) ? records : []).filter(function (rec) {
      if (!isGeografiskByraRecord(rec) || !rec.id) return false;
      var hit = matchFactor(recordNamn(rec));
      return !!(hit && wanted[hit.id]);
    }).map(function (rec) { return rec.id; });
  }

  function mergeIntoLinkedSet(linkedSet, records, kyc, utsattStored, opts) {
    var set = linkedSet instanceof Set ? linkedSet : new Set(linkedSet || []);
    var steered = new Set(steeredRecordIds(records));
    var suggested = new Set(suggestedRecordIds(records, kyc, utsattStored, opts));
    steered.forEach(function (id) { set.delete(id); });
    suggested.forEach(function (id) { set.add(id); });
    return set;
  }

  function mergeLinkedIds(linkedIds, records, kyc, utsattStored, opts) {
    return Array.from(mergeIntoLinkedSet(
      new Set(Array.isArray(linkedIds) ? linkedIds : []),
      records,
      kyc,
      utsattStored,
      opts
    ));
  }

  function linkedIdsChanged(before, after) {
    var a = Array.from(new Set(Array.isArray(before) ? before : [])).sort();
    var b = Array.from(new Set(Array.isArray(after) ? after : [])).sort();
    if (a.length !== b.length) return true;
    return a.some(function (id, i) { return id !== b[i]; });
  }

  function suggestedFactorLabels(kyc, utsattStored, opts) {
    var ids = suggestedFactorIds(kyc, utsattStored, opts);
    return FACTORS.filter(function (f) { return ids.indexOf(f.id) !== -1; }).map(function (f) { return f.label; });
  }

  /** Adress i Sverige om utsatt-kontroll körts (även utan träff) eller adress ser svensk ut. */
  function addressImpliesSweden(utsattStored, addressText) {
    var stored = parseUtsattStored(utsattStored);
    if (stored && stored.kontrolleradAt) return true;
    var addr = trimStr(addressText);
    if (!addr) return false;
    if (/\b\d{3}\s?\d{2}\b/.test(addr)) return true;
    if (/\bsverige\b|\bsweden\b/i.test(addr)) return true;
    return false;
  }

  var api = {
    FACTORS: FACTORS,
    fold: fold,
    recordNamn: recordNamn,
    matchFactor: matchFactor,
    isSwedenLabel: isSwedenLabel,
    classifyHemvistLabel: classifyHemvistLabel,
    parseKyc: parseKyc,
    parseUtsattStored: parseUtsattStored,
    hasUtsattHit: hasUtsattHit,
    collectHemvistLabels: collectHemvistLabels,
    assessHemvist: assessHemvist,
    suggestedFactorIds: suggestedFactorIds,
    geoRecordsFromList: geoRecordsFromList,
    steeredRecordIds: steeredRecordIds,
    suggestedRecordIds: suggestedRecordIds,
    mergeIntoLinkedSet: mergeIntoLinkedSet,
    mergeLinkedIds: mergeLinkedIds,
    linkedIdsChanged: linkedIdsChanged,
    suggestedFactorLabels: suggestedFactorLabels,
    addressImpliesSweden: addressImpliesSweden
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  global.KycHemvistGeoStyrning = api;
})(typeof window !== 'undefined' ? window : globalThis);
