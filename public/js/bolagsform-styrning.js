/**
 * Styrning av kundresidual utifrån kundens Bolagsform (Bolagsverket/DB)
 * mot byråns analyserade riskfaktorer «Kunder med bolagsform …».
 */
(function (global) {
  var FORM_GROUPS = [
    {
      key: 'aktiebolag',
      label: 'Aktiebolag',
      aliases: ['ab', 'aktiebolag', 'privat aktiebolag', 'publikt aktiebolag']
    },
    {
      key: 'enskild firma',
      label: 'Enskild firma',
      aliases: [
        'ef',
        'enskild firma',
        'enskild naringsverksamhet',
        'enskild naringsidkare',
        'fysisk person',
        'fysiska personer'
      ]
    },
    {
      key: 'handelsbolag',
      label: 'Handelsbolag',
      aliases: ['hb', 'handelsbolag']
    },
    {
      key: 'kommanditbolag',
      label: 'Kommanditbolag',
      aliases: ['kb', 'kommanditbolag']
    },
    {
      key: 'ekonomisk forening',
      label: 'Ekonomisk förening',
      aliases: ['ekonomisk forening', 'ek. for.', 'ek forening', 'ek.for.']
    },
    {
      key: 'bostadsrattsforening',
      label: 'Bostadsrättsförening',
      aliases: ['brf', 'bostadsrattsforening', 'bostadsrattsforening (brf)']
    },
    {
      key: 'ideell forening',
      label: 'Ideell förening',
      aliases: ['ideell forening', 'idiell forening']
    },
    {
      key: 'stiftelse',
      label: 'Stiftelse',
      aliases: ['stiftelse']
    },
    {
      key: 'filial',
      label: 'Filial/utländskt bolag',
      aliases: ['filial', 'filial/utlandskt bolag', 'utlandskt bolag']
    },
    {
      key: 'region',
      label: 'Regioner',
      aliases: ['region', 'regioner']
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

  function canonicalize(raw) {
    var cleaned = String(raw || '')
      .replace(/\s*[·•].*$/, '')
      .replace(/\s*:\s*\d+\s*$/, '')
      .replace(/\s*\(\s*ca\s*[^)]*\)\s*$/i, '')
      .trim();
    var key = fold(cleaned);
    if (!key || key.length > 60) return null;
    for (var i = 0; i < FORM_GROUPS.length; i += 1) {
      var g = FORM_GROUPS[i];
      if (fold(g.label) === key) return g;
      for (var j = 0; j < g.aliases.length; j += 1) {
        if (fold(g.aliases[j]) === key) return g;
      }
    }
    if (!/^[a-z0-9/().\-\s]+$/i.test(cleaned)) return null;
    if (/\s(och|med|for|fran|som|i|av|till|pa)\s/i.test(cleaned) && cleaned.split(/\s+/).length > 4) {
      return null;
    }
    return { key: key, label: cleaned, aliases: [key] };
  }

  function sameForm(a, b) {
    var ca = canonicalize(a);
    var cb = canonicalize(b);
    return !!(ca && cb && ca.key === cb.key);
  }

  function recordNamn(rec) {
    if (!rec) return '';
    var f = rec.fields || rec;
    return String(f.Riskfaktor || f['Riskfaktor'] || rec.namn || '').trim();
  }

  function recordBeskrivning(rec) {
    if (!rec) return '';
    var f = rec.fields || rec;
    return String(f.Beskrivning || f.beskrivning || '').trim();
  }

  function extractFormsFromText(text) {
    var raw = String(text || '');
    if (!raw.trim()) return [];
    var out = [];
    var seen = Object.create(null);

    function add(formRaw) {
      var g = canonicalize(formRaw);
      if (!g || seen[g.key]) return;
      seen[g.key] = true;
      out.push(g.label);
    }

    var prefRe = /kunder med bolagsform(?:erna)?\s*[:\-]?\s*([^\n.;]+)/gi;
    var m;
    while ((m = prefRe.exec(raw))) {
      String(m[1] || '').split(/[,;/]| och /i).map(function (s) {
        return s.trim();
      }).filter(Boolean).forEach(add);
    }

    var formRe = /bolagsformen\s+([A-Za-zÅÄÖåäöÉé0-9()/.\- ]{1,40})/gi;
    while ((m = formRe.exec(raw))) {
      add(m[1]);
    }

    return out;
  }

  function extractFormsFromRecord(rec) {
    return extractFormsFromText(recordNamn(rec) + '\n' + recordBeskrivning(rec));
  }

  function isBolagsformRecord(rec) {
    return extractFormsFromRecord(rec).length > 0;
  }

  function customerBolagsform(fieldsOrValue) {
    if (fieldsOrValue == null || fieldsOrValue === '') return '';
    if (typeof fieldsOrValue === 'string') return String(fieldsOrValue).trim();
    var f = fieldsOrValue.fields || fieldsOrValue;
    var direct = String(f.Bolagsform || f['Bolagsform'] || '').trim();
    if (direct) return direct;
    var kyc = f['KYC-formular (JSON)'] || f.kyc || null;
    if (typeof kyc === 'string') {
      try { kyc = JSON.parse(kyc); } catch (_) { kyc = null; }
    }
    return String((kyc && kyc.bolagsform) || '').trim();
  }

  function factorMatchesCustomer(rec, bolagsform) {
    var cust = canonicalize(bolagsform);
    if (!cust) return false;
    return extractFormsFromRecord(rec).some(function (form) {
      return sameForm(form, cust.label);
    });
  }

  function steeredRecordIds(records) {
    return (Array.isArray(records) ? records : []).filter(function (rec) {
      return !!(isBolagsformRecord(rec) && rec.id);
    }).map(function (rec) { return rec.id; });
  }

  function suggestedRecordIds(records, bolagsformOrFields) {
    var form = customerBolagsform(bolagsformOrFields);
    if (!form) return [];
    var out = [];
    (Array.isArray(records) ? records : []).forEach(function (rec) {
      if (!rec || !rec.id || !isBolagsformRecord(rec)) return;
      if (factorMatchesCustomer(rec, form)) out.push(rec.id);
    });
    return out;
  }

  function mergeIntoLinkedSet(linkedSet, records, bolagsformOrFields) {
    var set = linkedSet instanceof Set ? linkedSet : new Set(linkedSet || []);
    var steered = new Set(steeredRecordIds(records));
    var suggested = new Set(suggestedRecordIds(records, bolagsformOrFields));
    steered.forEach(function (id) { set.delete(id); });
    suggested.forEach(function (id) { set.add(id); });
    return set;
  }

  function suggestedFactorLabels(records, bolagsformOrFields) {
    var form = customerBolagsform(bolagsformOrFields);
    if (!form) return [];
    var labels = [];
    var seen = Object.create(null);
    (Array.isArray(records) ? records : []).forEach(function (rec) {
      if (!isBolagsformRecord(rec) || !factorMatchesCustomer(rec, form)) return;
      var namn = recordNamn(rec);
      if (!namn || seen[namn]) return;
      seen[namn] = true;
      labels.push(namn);
    });
    return labels;
  }

  function mergedBolagsformRiskfaktorName(forms) {
    var unique = [];
    var seen = Object.create(null);
    (Array.isArray(forms) ? forms : []).forEach(function (f) {
      var g = canonicalize(f);
      if (!g || seen[g.key]) return;
      seen[g.key] = true;
      unique.push(g.label);
    });
    if (!unique.length) return '';
    if (unique.length === 1) return 'Kunder med bolagsform ' + unique[0];
    return 'Kunder med bolagsformerna ' + unique.join(', ');
  }

  var api = {
    FORM_GROUPS: FORM_GROUPS,
    fold: fold,
    canonicalize: canonicalize,
    sameForm: sameForm,
    recordNamn: recordNamn,
    extractFormsFromText: extractFormsFromText,
    extractFormsFromRecord: extractFormsFromRecord,
    isBolagsformRecord: isBolagsformRecord,
    customerBolagsform: customerBolagsform,
    factorMatchesCustomer: factorMatchesCustomer,
    steeredRecordIds: steeredRecordIds,
    suggestedRecordIds: suggestedRecordIds,
    mergeIntoLinkedSet: mergeIntoLinkedSet,
    suggestedFactorLabels: suggestedFactorLabels,
    mergedBolagsformRiskfaktorName: mergedBolagsformRiskfaktorName
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  global.BolagsformStyrning = api;
})(typeof window !== 'undefined' ? window : globalThis);
