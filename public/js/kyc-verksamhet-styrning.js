/**
 * Styrning av kundresidual utifrån KYC (kontanter, kryptovaluta, högriskländer).
 */
(function (global) {
  var FACTORS = [
    {
      id: 'kontanter',
      kycField: 'kontanter',
      label: 'Kunder med mycket kontanta transaktioner',
      aliases: ['kontantintensiv verksamhet', 'kontanthantering', 'kunder med mycket kontanta transaktioner']
    },
    {
      id: 'kryptovaluta',
      kycField: 'kryptovaluta',
      label: 'Kunder som handlar med kryptovaluta',
      aliases: ['kryptovaluta', 'kunder som handlar med kryptovaluta', 'crypto', 'virtuell valuta']
    },
    {
      id: 'hogrisklander',
      kycField: 'hogrisklander',
      label: 'Kunden har handel med högriskländer',
      aliases: [
        'kunden har handel med högriskländer',
        'kopplingar till utlandet / högriskländer',
        'kopplingar till andra länder, särskilt länder utanför eu',
        'högriskländer',
        'kunder med import/export'
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

  function recordNamn(rec) {
    if (!rec) return '';
    var f = rec.fields || rec;
    return String(f.Riskfaktor || f['Riskfaktor'] || rec.namn || '').trim();
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

  function parseKyc(raw) {
    if (raw == null || raw === '') return {};
    try {
      var parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  function kycJa(kyc, field) {
    return String((kyc && kyc[field]) || '').trim().toLowerCase() === 'ja';
  }

  function kycHasHogriskHandel(kyc) {
    var parsed = parseKyc(kyc);
    if (String(parsed.internationellHandel || '').trim().toLowerCase() === 'nej') return false;
    var raw = parsed.internationellaLander || '';
    if (!String(raw).trim()) return false;
    var Eu = global.EuHogriskLander;
    var labels = Eu && Eu.parseLabels
      ? Eu.parseLabels(raw)
      : String(raw).split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    if (!labels.length) return false;
    var result = Eu && Eu.assess ? Eu.assess(labels) : {};
    return !!(result.hasHogrisk || result.hasCallForAction);
  }

  function factorActive(kyc, factor) {
    if (!factor) return false;
    if (factor.id === 'hogrisklander') return kycHasHogriskHandel(kyc);
    return kycJa(kyc, factor.kycField);
  }

  function collectKycFromDom() {
    var kontEl = document.getElementById('kyc-kontanter');
    var kryptoEl = document.getElementById('kyc-kryptovaluta');
    var internEl = document.getElementById('kyc-internationell');
    var landerEl = document.getElementById('kyc-internationella-lander');
    return {
      kontanter: kontEl ? kontEl.value : '',
      kryptovaluta: kryptoEl ? kryptoEl.value : '',
      internationellHandel: internEl ? internEl.value : '',
      internationellaLander: landerEl ? landerEl.value : ''
    };
  }

  function steeredRecordIds(records) {
    return (Array.isArray(records) ? records : []).filter(function (rec) {
      return !!(matchFactor(recordNamn(rec)) && rec.id);
    }).map(function (rec) { return rec.id; });
  }

  function suggestedRecordIds(records, kyc) {
    var parsed = parseKyc(kyc);
    var out = [];
    (Array.isArray(records) ? records : []).forEach(function (rec) {
      var matched = matchFactor(recordNamn(rec));
      if (!matched || !rec.id) return;
      if (factorActive(parsed, matched)) out.push(rec.id);
    });
    return out;
  }

  function mergeIntoLinkedSet(linkedSet, records, kyc) {
    var set = linkedSet instanceof Set ? linkedSet : new Set(linkedSet || []);
    var steered = new Set(steeredRecordIds(records));
    var suggested = new Set(suggestedRecordIds(records, kyc));
    steered.forEach(function (id) { set.delete(id); });
    suggested.forEach(function (id) { set.add(id); });
    return set;
  }

  function suggestedFactorLabels(kyc) {
    var parsed = parseKyc(kyc);
    return FACTORS.filter(function (f) { return factorActive(parsed, f); }).map(function (f) { return f.label; });
  }

  var api = {
    FACTORS: FACTORS,
    fold: fold,
    matchFactor: matchFactor,
    parseKyc: parseKyc,
    kycJa: kycJa,
    kycHasHogriskHandel: kycHasHogriskHandel,
    factorActive: factorActive,
    collectKycFromDom: collectKycFromDom,
    steeredRecordIds: steeredRecordIds,
    suggestedRecordIds: suggestedRecordIds,
    mergeIntoLinkedSet: mergeIntoLinkedSet,
    suggestedFactorLabels: suggestedFactorLabels
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  global.KycVerksamhetStyrning = api;
})(typeof window !== 'undefined' ? window : globalThis);
