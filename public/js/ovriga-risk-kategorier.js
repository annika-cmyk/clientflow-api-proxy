/**
 * Tre kategorier för övriga riskfaktorer på kundkortet:
 * A samarbete, B kunden, C verksamheten.
 */
(function (global) {
  var KLASS = {
    GOLV_HOG: 'GOLV_HOG',
    BIDRAR: 'BIDRAR_VID_KOMBINATION',
    INFORMATIV: 'INFORMATIV'
  };

  var CATEGORIES = [
    {
      id: 'samarbete',
      letter: 'A',
      title: 'Hur samarbetar vi?',
      subtitle: 'Distributionskanaler och kommunikation',
      hint: 'Hur ni levererar tjänsterna och hur kunden beter sig mot er.',
      icon: 'fa-handshake'
    },
    {
      id: 'kunden',
      letter: 'B',
      title: 'Vem är kunden?',
      subtitle: 'Ägarstruktur, PEP och historik',
      hint: 'Sårbarheter i ägande, kontrollstruktur och bakgrund.',
      icon: 'fa-user-shield'
    },
    {
      id: 'verksamheten',
      letter: 'C',
      title: 'Vad gör kunden?',
      subtitle: 'Affärsmodell och transaktioner',
      hint: 'Risker i kundens dagliga drift och bransch.',
      icon: 'fa-industry'
    }
  ];

  var FACTORS = [
    {
      id: 'fysiskt-mote',
      category: 'samarbete',
      label: 'Fysiskt möte',
      hint: 'Ni träffas och går igenom underlagen fysiskt.',
      klass: KLASS.INFORMATIV,
      badge: 'Låg risk',
      group: 'kanal',
      coveredByDimension: true,
      aliases: ['fysiskt möte', 'fysiskt mote', 'personligt möte']
    },
    {
      id: 'distans-bankid',
      category: 'samarbete',
      label: 'Distansrelation med BankID-verifiering',
      hint: 'Ni ses inte fysiskt, men använder säker digital verifiering.',
      klass: KLASS.BIDRAR,
      badge: 'Normal risk',
      group: 'kanal',
      coveredByDimension: true,
      aliases: [
        'distansrelation med bankid-verifiering',
        'distansrelation med bankid',
        'distanskund',
        'distansrelation'
      ]
    },
    {
      id: 'distans-osaker',
      category: 'samarbete',
      label: 'Distansrelation utan säker verifiering',
      hint: 'Hög risk enligt lagstiftningen.',
      klass: KLASS.GOLV_HOG,
      badge: 'Hög-aktiv',
      group: 'kanal',
      coveredByDimension: true,
      aliases: [
        'distansrelation utan säker verifiering',
        'distansrelation utan saker verifiering',
        'distans utan verifiering'
      ]
    },
    {
      id: 'ombud',
      category: 'samarbete',
      label: 'Etablering via ombud',
      hint: 'Kunden företräds av någon annan.',
      klass: KLASS.GOLV_HOG,
      badge: 'Hög-aktiv',
      coveredByDimension: true,
      aliases: ['etablering via ombud', 'via ombud', 'ombud']
    },
    {
      id: 'svar-identitet',
      category: 'samarbete',
      label: 'Svårt att bekräfta identitet',
      hint: 'Triggar skärpta åtgärder.',
      klass: KLASS.GOLV_HOG,
      badge: 'Hög-aktiv',
      aliases: ['svårt att bekräfta identitet', 'svart att bekrafta identitet']
    },
    {
      id: 'svar-kontakt',
      category: 'samarbete',
      label: 'Svårt att få kontakt med ägaren/styrelsen',
      hint: 'Bidrar vid kombination.',
      klass: KLASS.BIDRAR,
      badge: 'Bidrar vid kombination',
      aliases: [
        'svårt att få kontakt med ägaren/styrelsen',
        'svårt att få kontakt med ägare/styrelse/huvudmän',
        'svart att fa kontakt med agare/styrelse/huvudman'
      ]
    },
    {
      id: 'undvikande',
      category: 'samarbete',
      label: 'Svårt att få svar på frågor / undvikande beteende',
      hint: 'Bidrar vid kombination.',
      klass: KLASS.BIDRAR,
      badge: 'Bidrar vid kombination',
      aliases: [
        'svårt att få svar på frågor / undvikande beteende',
        'svårt att få svar på frågor',
        'undvikande beteende'
      ]
    },
    {
      id: 'tidsnod',
      category: 'samarbete',
      label: 'Ovanlig tidsnöd / kunden har extremt bråttom',
      hint: 'Bidrar vid kombination.',
      klass: KLASS.BIDRAR,
      badge: 'Bidrar vid kombination',
      aliases: ['ovanlig tidsnöd', 'extremt bråttom', 'tidsnöd']
    },
    {
      id: 'agarstruktur',
      category: 'kunden',
      label: 'Komplicerad eller ovanlig ägarstruktur',
      hint: 'Svårt att se vem som faktiskt kontrollerar bolaget.',
      klass: KLASS.BIDRAR,
      badge: 'Bidrar vid kombination',
      aliases: [
        'komplicerad eller ovanlig ägarstruktur',
        'komplicerad struktur',
        'ovanlig ägarstruktur'
      ]
    },
    {
      id: 'utlandska-ubo',
      category: 'kunden',
      label: 'Utländska verkliga huvudmän (UBO)',
      hint: 'Särskilt om de är etablerade utanför EU/EES.',
      klass: KLASS.BIDRAR,
      badge: 'Bidrar vid kombination',
      coveredByDimension: true,
      aliases: ['utländska verkliga huvudmän', 'utlandska verkliga huvudman', 'ubo utlandet', 'kunder med utländska huvudmän']
    },
    {
      id: 'pep-rca',
      category: 'kunden',
      label: 'PEP eller RCA',
      hint: 'Politiskt utsatt person eller närstående. Triggar alltid Hög risk.',
      klass: KLASS.GOLV_HOG,
      badge: 'Hög-aktiv',
      coveredByDimension: true,
      aliases: ['pep eller rca', 'pep', 'rca', 'politiskt exponerad person', 'pep, familjemedlem till pep']
    },
    {
      id: 'brott',
      category: 'kunden',
      label: 'Historik av brott / ekonomisk brottslighet',
      hint: 'Kända tidigare oegentligheter hos företrädare.',
      klass: KLASS.GOLV_HOG,
      badge: 'Hög-aktiv',
      aliases: [
        'historik av brott / ekonomisk brottslighet',
        'historik av brott eller ekonomisk misskötsel',
        'historik av brott'
      ]
    },
    {
      id: 'bulvan',
      category: 'kunden',
      label: 'Misstänkt bulvan/målvakt',
      hint: 'Företrädaren har haft många kortlivade bolag eller verkar styras av någon annan.',
      klass: KLASS.GOLV_HOG,
      badge: 'Hög-aktiv',
      aliases: ['misstänkt bulvan/målvakt', 'bulvan', 'målvakt']
    },
    {
      id: 'bytt-konsult',
      category: 'kunden',
      label: 'Ofta bytt redovisningskonsult/revisor utan naturlig förklaring',
      hint: 'Bidrar vid kombination.',
      klass: KLASS.BIDRAR,
      badge: 'Bidrar vid kombination',
      aliases: [
        'ofta bytt redovisningskonsult/revisor utan naturlig förklaring',
        'många byten av redovisningsbyråer',
        'kortvarig/tillfällig affärsrelation',
        'företaget har många kortvariga affärsrelationer'
      ]
    },
    {
      id: 'styrelse-andringar',
      category: 'kunden',
      label: 'Mkt ändringar i styrelse, adress eller firmateckning',
      hint: 'Bidrar vid kombination.',
      klass: KLASS.BIDRAR,
      badge: 'Bidrar vid kombination',
      aliases: ['mkt ändringar i styrelse, adress eller firmateckning']
    },
    {
      id: 'hogriskbransch',
      category: 'verksamheten',
      label: 'Högriskbransch',
      hint: 'Bygg, restaurang, bilhandel, bemanning, skrot med mera.',
      klass: KLASS.BIDRAR,
      badge: 'Bidrar vid kombination',
      coveredByDimension: true,
      aliases: ['högriskbransch', 'hogriskbransch', 'kunden verkar i en högriskbransch']
    },
    {
      id: 'kontanter',
      category: 'verksamheten',
      label: 'Kontantintensiv verksamhet',
      hint: 'Kunden tar emot mycket kontanter eller har stora dagskassor.',
      klass: KLASS.GOLV_HOG,
      badge: 'Hög-aktiv',
      coveredByDimension: true,
      aliases: ['kontantintensiv verksamhet', 'kontanthantering', 'kunder med mycket kontanta transaktioner']
    },
    {
      id: 'kunder-distans',
      category: 'verksamheten',
      label: 'Kundens egna kunder är på distans (e-handel/anonyma köpare)',
      hint: 'Ökar risken för fiktiv försäljning och osanna fakturor.',
      klass: KLASS.BIDRAR,
      badge: 'Bidrar vid kombination',
      aliases: [
        'kundens egna kunder är på distans (e-handel/anonyma köpare)',
        'företaget har många kunder på distans'
      ]
    },
    {
      id: 'utland',
      category: 'verksamheten',
      label: 'Kopplingar till utlandet / Högriskländer',
      hint: 'Transaktioner eller affärspartners utanför EU/EES.',
      klass: KLASS.GOLV_HOG,
      badge: 'Hög-aktiv',
      coveredByDimension: true,
      aliases: [
        'kopplingar till utlandet / högriskländer',
        'kopplingar till andra länder, särskilt länder utanför eu',
        'högriskländer',
        'kunder med import/export'
      ]
    },
    {
      id: 'transaktioner',
      category: 'verksamheten',
      label: 'Transaktioner utan tydligt syfte',
      hint: 'Ologiska betalflöden.',
      klass: KLASS.BIDRAR,
      badge: 'Bidrar vid kombination',
      aliases: ['transaktioner utan tydligt syfte']
    },
    {
      id: 'bokforing',
      category: 'verksamheten',
      label: 'Bristfälliga interna bokföringsrutiner hos kunden',
      hint: 'Svårt att få fram originalunderlag.',
      klass: KLASS.BIDRAR,
      badge: 'Bidrar vid kombination',
      aliases: [
        'bristfälliga interna bokföringsrutiner hos kunden',
        'bristfälliga bokföringsrutiner'
      ]
    },
    {
      id: 'otydlig-affarsmodell',
      category: 'verksamheten',
      label: 'Otydlig affärsmodell',
      hint: 'Bidrar vid kombination.',
      klass: KLASS.BIDRAR,
      badge: 'Bidrar vid kombination',
      aliases: ['otydlig affärsmodell']
    }
  ];

  function fold(value) {
    return String(value == null ? '' : value)
      .trim()
      .toLowerCase()
      .normalize('NFC')
      .replace(/\s+/g, ' ');
  }

  function factorByFold() {
    var map = {};
    FACTORS.forEach(function (f) {
      map[fold(f.label)] = f;
      (f.aliases || []).forEach(function (alias) {
        map[fold(alias)] = f;
      });
    });
    return map;
  }

  var BY_FOLD = factorByFold();

  function findFactor(namn) {
    return BY_FOLD[fold(namn)] || null;
  }

  function canonicalLabel(namn) {
    var raw = String(namn == null ? '' : namn).trim();
    if (!raw) return '';
    if (/kortvarig|kortsiktig|tillf[äa]llig aff[äa]rsrelation/i.test(raw)) {
      return 'Ofta bytt redovisningskonsult/revisor utan naturlig förklaring';
    }
    var hit = findFactor(raw);
    return hit ? hit.label : raw;
  }

  function defaultKatalog() {
    var out = {};
    FACTORS.forEach(function (f) {
      out[f.label] = f.klass;
    });
    return out;
  }

  function categoryById(id) {
    for (var i = 0; i < CATEGORIES.length; i += 1) {
      if (CATEGORIES[i].id === id) return CATEGORIES[i];
    }
    return null;
  }

  function isCoveredByDimension(namn) {
    var hit = findFactor(namn);
    return !!(hit && hit.coveredByDimension);
  }

  function factorsForCategory(categoryId, opts) {
    return FACTORS.filter(function (f) {
      if (f.category !== categoryId) return false;
      if (opts && opts.kundkort && f.coveredByDimension) return false;
      return true;
    });
  }

  function labelsForCategory(categoryId) {
    return factorsForCategory(categoryId).map(function (f) { return f.label; });
  }

  function extrasForCategory(categoryId, allLabels) {
    var known = {};
    FACTORS.forEach(function (f) { known[fold(f.label)] = true; });
    return (Array.isArray(allLabels) ? allLabels : [])
      .map(canonicalLabel)
      .filter(function (label) {
        if (!label || fold(label) === 'inga') return false;
        if (isCoveredByDimension(label)) return false;
        return !known[fold(label)] && categoryId === 'verksamheten';
      });
  }

  function mergeVisibleVal(existingLabels, checkedLabels) {
    var seen = {};
    var out = [];
    (Array.isArray(checkedLabels) ? checkedLabels : []).forEach(function (raw) {
      var label = canonicalLabel(raw);
      if (!label || fold(label) === 'inga' || isCoveredByDimension(label)) return;
      if (seen[fold(label)]) return;
      seen[fold(label)] = true;
      out.push(label);
    });
    (Array.isArray(existingLabels) ? existingLabels : []).forEach(function (raw) {
      var label = canonicalLabel(raw);
      if (!label || !isCoveredByDimension(label) || seen[fold(label)]) return;
      seen[fold(label)] = true;
      out.push(label);
    });
    return out;
  }

  function mergeValForCategory(existingLabels, categoryId, checkedLabels) {
    var keep = [];
    var seen = {};
    (Array.isArray(existingLabels) ? existingLabels : []).forEach(function (raw) {
      var label = canonicalLabel(raw);
      if (!label || fold(label) === 'inga') return;
      var factor = findFactor(label);
      if (factor && factor.category === categoryId) return;
      if (!factor && categoryId === 'verksamheten') return;
      if (seen[fold(label)]) return;
      seen[fold(label)] = true;
      keep.push(label);
    });
    (Array.isArray(checkedLabels) ? checkedLabels : []).forEach(function (raw) {
      var label = canonicalLabel(raw);
      if (!label || fold(label) === 'inga') return;
      if (seen[fold(label)]) return;
      seen[fold(label)] = true;
      keep.push(label);
    });
    return keep;
  }

  function channelLabels() {
    return FACTORS.filter(function (f) { return f.group === 'kanal'; }).map(function (f) { return f.label; });
  }

  function klassBadge(klass, badge) {
    if (badge) return badge;
    if (klass === KLASS.GOLV_HOG) return 'Hög-aktiv';
    if (klass === KLASS.BIDRAR) return 'Bidrar vid kombination';
    return '';
  }

  var api = {
    KLASS: KLASS,
    CATEGORIES: CATEGORIES,
    FACTORS: FACTORS,
    fold: fold,
    findFactor: findFactor,
    canonicalLabel: canonicalLabel,
    defaultKatalog: defaultKatalog,
    categoryById: categoryById,
    isCoveredByDimension: isCoveredByDimension,
    factorsForCategory: factorsForCategory,
    labelsForCategory: labelsForCategory,
    extrasForCategory: extrasForCategory,
    mergeValForCategory: mergeValForCategory,
    mergeVisibleVal: mergeVisibleVal,
    channelLabels: channelLabels,
    klassBadge: klassBadge
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  global.OvrigaRiskKategorier = api;
})(typeof window !== 'undefined' ? window : globalThis);
