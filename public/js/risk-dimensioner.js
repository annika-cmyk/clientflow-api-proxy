/**
 * Obligatoriska riskdimensioner på kund: geografi, distributionskanal,
 * kundtyp och verksamhetsspecifikt. Minst ett val per dimension som
 * byrån faktiskt har mallar för.
 */
(function (global) {
  var DIMENSIONS = [
    {
      id: 'kund',
      label: 'Riskfaktorer kopplat till kund',
      cardTitle: 'Vem är kunden?',
      categoryId: 'kunden',
      aliases: [
        'riskfaktorer kopplat till kund',
        'kunder',
        'kundtyp',
        'vem är kunden?',
        'vem ar kunden?'
      ]
    },
    {
      id: 'distribution',
      label: 'Distrubutionskanaler - såhär möter vi våra kunder',
      cardTitle: 'Hur samarbetar vi?',
      categoryId: 'samarbete',
      aliases: [
        'distributionskanaler',
        'distrubutionskanaler',
        'distrubutionskanaler - såhär möter vi våra kunder',
        'distrubutionskanaler - sa har moter vi vara kunder',
        'distribution',
        'distributionskanal',
        'hur samarbetar vi?'
      ]
    },
    {
      id: 'geografiska',
      label: 'Geografisk riskfaktorer - här finns byråns kunder',
      cardTitle: 'Vem är kunden?',
      categoryId: 'kunden',
      aliases: [
        'geografiska riskfaktorer',
        'geografisk riskfaktorer - här finns byråns kunder',
        'geografisk riskfaktorer - har finns byrans kunder',
        'geografi',
        'geografiska'
      ]
    },
    {
      id: 'verksamhet',
      label: 'Verksamhetsspecifika riskfaktorer',
      cardTitle: 'Vad gör kunden?',
      categoryId: 'verksamheten',
      aliases: [
        'verksamhetsspecifika riskfaktorer',
        'verksamhetsspecifika omständigheter',
        'verksamhet',
        'vad gör kunden?',
        'vad gor kunden?'
      ]
    }
  ];

  function trimStr(value) {
    return value == null ? '' : String(value).trim();
  }

  function fold(value) {
    return trimStr(value)
      .toLowerCase()
      .normalize('NFC')
      .replace(/\s+/g, ' ');
  }

  function dimensionOfTyp(typ) {
    var key = fold(typ);
    if (!key) return null;
    for (var i = 0; i < DIMENSIONS.length; i += 1) {
      if (key === fold(DIMENSIONS[i].label)) return DIMENSIONS[i];
    }
    for (var i = 0; i < DIMENSIONS.length; i += 1) {
      var dim = DIMENSIONS[i];
      for (var j = 0; j < dim.aliases.length; j += 1) {
        var alias = dim.aliases[j];
        if (key === alias || key.indexOf(alias) !== -1) {
          return dim;
        }
      }
    }
    return null;
  }

  function normalizeTyp(typ) {
    var dim = dimensionOfTyp(typ);
    return dim ? dim.label : (trimStr(typ) || 'Övriga riskfaktorer');
  }

  function airtableTypValue(typ) {
    var dim = dimensionOfTyp(typ);
    if (!dim) return trimStr(typ);
    if (dim.id === 'distribution') return 'Distrubutionskanaler';
    return dim.label;
  }

  function typMatchesDimension(typ, dimId) {
    var dim = dimensionOfTyp(typ);
    return !!(dim && dim.id === dimId);
  }

  function hogriskBranschVal(fields) {
    var raw = fields && fields['Kunden verkar i en högriskbransch'];
    var list = Array.isArray(raw) ? raw : (raw ? [raw] : []);
    return list.map(trimStr).filter(function (v) { return v && v !== '---'; });
  }

  function riskhojandeList(fields) {
    var raw = fields && fields['Riskhöjande faktorer övrigt'];
    var list = Array.isArray(raw) ? raw : (raw ? [raw] : []);
    return list.map(function (item) {
      return trimStr(item && item.name ? item.name : item);
    }).filter(function (v) { return v && v !== '---'; });
  }

  function hasIngaRiskfaktorer(fields, categoryId) {
    var want = fold('Inga riskfaktorer · ' + categoryId);
    return riskhojandeList(fields).some(function (label) {
      var key = fold(label);
      return key === want || key === 'inga riskfaktorer';
    });
  }

  function cardTitleOf(namn) {
    var dim = dimensionOfTyp(namn);
    if (dim && dim.cardTitle) return dim.cardTitle;
    var raw = trimStr(namn);
    for (var i = 0; i < DIMENSIONS.length; i += 1) {
      if (DIMENSIONS[i].cardTitle === raw) return raw;
    }
    return raw;
  }

  function uniqueLabels(list) {
    var seen = {};
    var out = [];
    (Array.isArray(list) ? list : []).forEach(function (item) {
      var label = trimStr(item);
      if (!label || seen[label]) return;
      seen[label] = true;
      out.push(label);
    });
    return out;
  }

  function recordTyp(rec) {
    if (!rec) return '';
    var f = rec.fields || rec;
    return trimStr(f['Typ av riskfaktor'] || rec.typ || '');
  }

  function recordNamn(rec) {
    if (!rec) return '';
    var f = rec.fields || rec;
    return trimStr(f.Riskfaktor || f.Namn || f.Name || rec.namn || '');
  }

  function isHogriskBranschNamn(namn) {
    return /h[öo]griskbransch/i.test(trimStr(namn));
  }

  function availableDimensions(byraTemplates) {
    var present = {};
    (Array.isArray(byraTemplates) ? byraTemplates : []).forEach(function (rec) {
      var dim = dimensionOfTyp(recordTyp(rec));
      if (dim) present[dim.id] = true;
    });
    return DIMENSIONS.filter(function (dim) { return present[dim.id]; });
  }

  function linkedRecordsOf(fields, linkedRiskRecords) {
    if (Array.isArray(linkedRiskRecords)) return linkedRiskRecords.filter(Boolean);
    var raw = fields && fields['risker kopplat till tjänster'];
    var ids = Array.isArray(raw) ? raw : [];
    return ids.map(function (id) {
      if (id && typeof id === 'object') return id;
      return { id: id };
    });
  }

  function assessCustomerDimensions(input) {
    var src = input || {};
    var fields = src.fields || {};
    var templates = Array.isArray(src.byraTemplates) ? src.byraTemplates : [];
    var required = availableDimensions(templates);
    var linked = linkedRecordsOf(fields, src.linkedRiskRecords);
    var present = {};
    required.forEach(function (dim) { present[dim.id] = []; });

    linked.forEach(function (rec) {
      var dim = dimensionOfTyp(recordTyp(rec));
      if (!dim || !present[dim.id]) return;
      var namn = recordNamn(rec);
      if (namn) present[dim.id].push(namn);
    });

    if (present.kund && hogriskBranschVal(fields).length) {
      present.kund.push('Kunden verkar i en högriskbransch');
    }
    required.forEach(function (dim) {
      if (!present[dim.id] || present[dim.id].length) return;
      if (dim.categoryId && hasIngaRiskfaktorer(fields, dim.categoryId)) {
        present[dim.id].push('Inga riskfaktorer');
      }
    });

    var saknade = uniqueLabels(required.filter(function (dim) {
      return !(present[dim.id] && present[dim.id].length);
    }).map(function (dim) { return dim.cardTitle || dim.label; }));

    return {
      required: required.map(function (dim) { return dim.id; }),
      present: present,
      saknade: saknade,
      komplett: saknade.length === 0,
      varning: saknade.length ? ofullstandigVarning(saknade) : ''
    };
  }

  function ofullstandigVarning(saknade) {
    var list = uniqueLabels((Array.isArray(saknade) ? saknade : []).map(cardTitleOf));
    if (!list.length) return '';
    var text = list.length === 1
      ? list[0]
      : (list.length === 2 ? list[0] + ' och ' + list[1] : list.slice(0, -1).join(', ') + ' och ' + list[list.length - 1]);
    return 'Riskbedömning ofullständig — saknar val på ' + text;
  }

  function groupOvrigaByTyp(ovriga) {
    var grouped = new Map();
    (Array.isArray(ovriga) ? ovriga : []).forEach(function (r) {
      var typ = normalizeTyp(r && r.typ);
      if (!grouped.has(typ)) grouped.set(typ, []);
      grouped.get(typ).push(r);
    });
    var order = DIMENSIONS.map(function (dim) { return dim.label; });
    var keys = Array.from(grouped.keys()).sort(function (a, b) {
      var ia = order.indexOf(a);
      var ib = order.indexOf(b);
      ia = ia === -1 ? 50 : ia;
      ib = ib === -1 ? 50 : ib;
      return ia - ib || a.localeCompare(b, 'sv');
    });
    return keys.map(function (typ) {
      return { typ: typ, items: grouped.get(typ) };
    });
  }

  var api = {
    DIMENSIONS: DIMENSIONS,
    trimStr: trimStr,
    fold: fold,
    dimensionOfTyp: dimensionOfTyp,
    normalizeTyp: normalizeTyp,
    airtableTypValue: airtableTypValue,
    typMatchesDimension: typMatchesDimension,
    hogriskBranschVal: hogriskBranschVal,
    availableDimensions: availableDimensions,
    assessCustomerDimensions: assessCustomerDimensions,
    ofullstandigVarning: ofullstandigVarning,
    cardTitleOf: cardTitleOf,
    groupOvrigaByTyp: groupOvrigaByTyp
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  global.RiskDimensioner = api;
})(typeof window !== 'undefined' ? window : globalThis);
