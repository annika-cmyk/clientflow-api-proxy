/**
 * Länder i KYC och matchning mot EU:s förteckning över högriskländer.
 * Källa: delegerad förordning (EU) 2016/1675, konsoliderad 29 jan 2026
 * (ändringar 2026/46 och 2026/83).
 */
(function (global) {
  var SOURCE =
    'Kommissionens delegerade förordning (EU) 2016/1675, konsoliderad 29 januari 2026.';

  var GROUP = {
    EU_EES: 'EU_EES',
    TREDJELAND: 'TREDJELAND',
    EU_HOGRISK: 'EU_HOGRISK',
    CALL_FOR_ACTION: 'CALL_FOR_ACTION',
    SPECIAL: 'SPECIAL',
    OKAND: 'OKAND'
  };

  var META = {};
  META[GROUP.EU_EES] = { badge: 'EU/EES', niva: 'Låg', klass: 'lag' };
  META[GROUP.TREDJELAND] = { badge: 'Tredjeland', niva: 'Normal', klass: 'normal' };
  META[GROUP.EU_HOGRISK] = { badge: 'EU-högrisk', niva: 'Hög', klass: 'hog' };
  META[GROUP.CALL_FOR_ACTION] = { badge: 'FATF-svartlista', niva: 'Hög-aktiv', klass: 'golv' };
  META[GROUP.SPECIAL] = { badge: 'EU-högrisk', niva: 'Hög', klass: 'hog' };
  META[GROUP.OKAND] = { badge: 'Okänt', niva: 'Normal', klass: 'okand' };

  // [iso2, svenskt namn, grupp, ...alias]
  var ROWS = [
    ['AT', 'Österrike', 'EU_EES', 'austria'],
    ['BE', 'Belgien', 'EU_EES', 'belgium'],
    ['BG', 'Bulgarien', 'EU_EES', 'bulgaria'],
    ['HR', 'Kroatien', 'EU_EES', 'croatia'],
    ['CY', 'Cypern', 'EU_EES', 'cyprus'],
    ['CZ', 'Tjeckien', 'EU_EES', 'czechia', 'tjeckien', 'czech republic'],
    ['DK', 'Danmark', 'EU_EES', 'denmark'],
    ['EE', 'Estland', 'EU_EES', 'estonia'],
    ['FI', 'Finland', 'EU_EES', 'finland'],
    ['FR', 'Frankrike', 'EU_EES', 'france'],
    ['DE', 'Tyskland', 'EU_EES', 'germany', 'tyskland'],
    ['GR', 'Grekland', 'EU_EES', 'greece'],
    ['HU', 'Ungern', 'EU_EES', 'hungary'],
    ['IE', 'Irland', 'EU_EES', 'ireland'],
    ['IT', 'Italien', 'EU_EES', 'italy'],
    ['LV', 'Lettland', 'EU_EES', 'latvia'],
    ['LT', 'Litauen', 'EU_EES', 'lithuania'],
    ['LU', 'Luxemburg', 'EU_EES', 'luxembourg'],
    ['MT', 'Malta', 'EU_EES', 'malta'],
    ['NL', 'Nederländerna', 'EU_EES', 'holland', 'netherlands'],
    ['PL', 'Polen', 'EU_EES', 'poland'],
    ['PT', 'Portugal', 'EU_EES', 'portugal'],
    ['RO', 'Rumänien', 'EU_EES', 'romania'],
    ['SK', 'Slovakien', 'EU_EES', 'slovakia'],
    ['SI', 'Slovenien', 'EU_EES', 'slovenia'],
    ['ES', 'Spanien', 'EU_EES', 'spain'],
    ['IS', 'Island', 'EU_EES', 'iceland'],
    ['LI', 'Liechtenstein', 'EU_EES', 'liechtenstein'],
    ['NO', 'Norge', 'EU_EES', 'norway'],
    ['AF', 'Afghanistan', 'EU_HOGRISK'],
    ['DZ', 'Algeriet', 'EU_HOGRISK', 'algeria'],
    ['AO', 'Angola', 'EU_HOGRISK'],
    ['BO', 'Bolivia', 'EU_HOGRISK'],
    ['VG', 'Brittiska Jungfruöarna', 'EU_HOGRISK', 'bvi', 'british virgin islands', 'jungfruöarna'],
    ['CM', 'Kamerun', 'EU_HOGRISK', 'cameroon'],
    ['CI', 'Elfenbenskusten', 'EU_HOGRISK', "cote d'ivoire", 'ivory coast', 'elfenben'],
    ['KP', 'Nordkorea', 'CALL_FOR_ACTION', 'dprk', 'north korea', 'demokratiska folkrepubliken korea'],
    ['CD', 'Kongo-Kinshasa', 'EU_HOGRISK', 'drc', 'demokratiska republiken kongo', 'kongo kinshasa'],
    ['HT', 'Haiti', 'EU_HOGRISK'],
    ['IR', 'Iran', 'CALL_FOR_ACTION'],
    ['KE', 'Kenya', 'EU_HOGRISK'],
    ['LA', 'Laos', 'EU_HOGRISK', 'lao'],
    ['LB', 'Libanon', 'EU_HOGRISK', 'lebanon'],
    ['MC', 'Monaco', 'EU_HOGRISK'],
    ['MM', 'Myanmar', 'EU_HOGRISK', 'burma'],
    ['NA', 'Namibia', 'EU_HOGRISK'],
    ['NP', 'Nepal', 'EU_HOGRISK'],
    ['RU', 'Ryssland', 'SPECIAL', 'russia', 'ryska federationen', 'russian federation'],
    ['SS', 'Sydsudan', 'EU_HOGRISK', 'south sudan'],
    ['SY', 'Syrien', 'EU_HOGRISK', 'syria'],
    ['TT', 'Trinidad och Tobago', 'EU_HOGRISK', 'trinidad'],
    ['VU', 'Vanuatu', 'EU_HOGRISK'],
    ['VE', 'Venezuela', 'EU_HOGRISK'],
    ['VN', 'Vietnam', 'EU_HOGRISK'],
    ['YE', 'Jemen', 'EU_HOGRISK', 'yemen'],
    ['GB', 'Storbritannien', 'TREDJELAND', 'uk', 'united kingdom', 'england', 'great britain'],
    ['US', 'USA', 'TREDJELAND', 'america', 'united states', 'förenta staterna'],
    ['CN', 'Kina', 'TREDJELAND', 'china', 'folkrepubliken kina'],
    ['IN', 'Indien', 'TREDJELAND', 'india'],
    ['TR', 'Turkiet', 'TREDJELAND', 'turkey', 'türkiye'],
    ['AE', 'Förenade Arabemiraten', 'TREDJELAND', 'uae', 'dubai', 'emiraten'],
    ['JP', 'Japan', 'TREDJELAND'],
    ['CA', 'Kanada', 'TREDJELAND', 'canada'],
    ['AU', 'Australien', 'TREDJELAND', 'australia'],
    ['BR', 'Brasilien', 'TREDJELAND', 'brazil'],
    ['MX', 'Mexiko', 'TREDJELAND', 'mexico'],
    ['CH', 'Schweiz', 'TREDJELAND', 'switzerland'],
    ['UA', 'Ukraina', 'TREDJELAND', 'ukraine'],
    ['BY', 'Vitryssland', 'TREDJELAND', 'belarus', 'belarus'],
    ['RS', 'Serbien', 'TREDJELAND', 'serbia'],
    ['BA', 'Bosnien och Hercegovina', 'TREDJELAND', 'bosnia'],
    ['MK', 'Nordmakedonien', 'TREDJELAND', 'macedonia'],
    ['AL', 'Albanien', 'TREDJELAND', 'albania'],
    ['MD', 'Moldavien', 'TREDJELAND', 'moldova'],
    ['GE', 'Georgien', 'TREDJELAND', 'georgia'],
    ['AM', 'Armenien', 'TREDJELAND', 'armenia'],
    ['AZ', 'Azerbajdzjan', 'TREDJELAND', 'azerbaijan'],
    ['KZ', 'Kazakstan', 'TREDJELAND', 'kazakhstan'],
    ['EG', 'Egypten', 'TREDJELAND', 'egypt'],
    ['MA', 'Marocko', 'TREDJELAND', 'morocco'],
    ['TN', 'Tunisien', 'TREDJELAND', 'tunisia'],
    ['IL', 'Israel', 'TREDJELAND'],
    ['SA', 'Saudiarabien', 'TREDJELAND', 'saudi'],
    ['QA', 'Qatar', 'TREDJELAND'],
    ['KW', 'Kuwait', 'TREDJELAND'],
    ['SG', 'Singapore', 'TREDJELAND'],
    ['HK', 'Hongkong', 'TREDJELAND', 'hong kong'],
    ['KR', 'Sydkorea', 'TREDJELAND', 'south korea'],
    ['TW', 'Taiwan', 'TREDJELAND'],
    ['TH', 'Thailand', 'TREDJELAND'],
    ['ID', 'Indonesien', 'TREDJELAND', 'indonesia'],
    ['MY', 'Malaysia', 'TREDJELAND'],
    ['PH', 'Filippinerna', 'TREDJELAND', 'philippines'],
    ['PK', 'Pakistan', 'TREDJELAND'],
    ['BD', 'Bangladesh', 'TREDJELAND'],
    ['NZ', 'Nya Zeeland', 'TREDJELAND', 'new zealand'],
    ['ZA', 'Sydafrika', 'TREDJELAND', 'south africa'],
    ['NG', 'Nigeria', 'TREDJELAND'],
    ['AR', 'Argentina', 'TREDJELAND'],
    ['CL', 'Chile', 'TREDJELAND'],
    ['CO', 'Colombia', 'TREDJELAND'],
    ['PE', 'Peru', 'TREDJELAND'],
    ['UY', 'Uruguay', 'TREDJELAND'],
    ['PA', 'Panama', 'TREDJELAND'],
    ['CR', 'Costa Rica', 'TREDJELAND'],
    ['CU', 'Kuba', 'TREDJELAND', 'cuba'],
    ['DO', 'Dominikanska republiken', 'TREDJELAND'],
    ['JM', 'Jamaica', 'TREDJELAND'],
    ['GH', 'Ghana', 'TREDJELAND'],
    ['SN', 'Senegal', 'TREDJELAND'],
    ['ET', 'Etiopien', 'TREDJELAND', 'ethiopia'],
    ['TZ', 'Tanzania', 'TREDJELAND'],
    ['UG', 'Uganda', 'TREDJELAND'],
    ['IQ', 'Irak', 'TREDJELAND', 'iraq'],
    ['JO', 'Jordanien', 'TREDJELAND', 'jordan'],
    ['LY', 'Libyen', 'TREDJELAND', 'libya'],
    ['SD', 'Sudan', 'TREDJELAND'],
    ['SO', 'Somalia', 'TREDJELAND'],
    ['BF', 'Burkina Faso', 'TREDJELAND'],
    ['ML', 'Mali', 'TREDJELAND'],
    ['MZ', 'Moçambique', 'TREDJELAND', 'mozambique']
  ];

  var COUNTRIES = ROWS.map(function (row) {
    return {
      iso2: row[0],
      name: row[1],
      group: GROUP[row[2]] || GROUP.TREDJELAND,
      aliases: row.slice(3)
    };
  });

  function fold(value) {
    return String(value == null ? '' : value)
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ');
  }

  function metaFor(group) {
    return META[group] || META[GROUP.OKAND];
  }

  function factorByFold() {
    var map = {};
    COUNTRIES.forEach(function (c) {
      map[fold(c.name)] = c;
      map[fold(c.iso2)] = c;
      (c.aliases || []).forEach(function (alias) {
        map[fold(alias)] = c;
      });
    });
    return map;
  }

  var BY_FOLD = factorByFold();

  function findCountry(namn) {
    var raw = String(namn == null ? '' : namn).trim();
    if (!raw) return null;
    return BY_FOLD[fold(raw)] || null;
  }

  function parseLabels(raw) {
    var parts = Array.isArray(raw)
      ? raw
      : String(raw == null ? '' : raw).split(/\r?\n|;|,/);
    var seen = {};
    var out = [];
    parts.forEach(function (part) {
      var label = String(part || '').replace(/^\s*[-•*]\s*/, '').trim();
      if (!label) return;
      var hit = findCountry(label);
      var name = hit ? hit.name : label;
      var key = fold(name);
      if (seen[key] || key === 'sverige' || key === 'sweden') return;
      seen[key] = true;
      out.push(name);
    });
    return out;
  }

  function classifyOne(namn) {
    var hit = findCountry(namn);
    var group = hit ? hit.group : GROUP.OKAND;
    var meta = metaFor(group);
    return {
      label: hit ? hit.name : String(namn || '').trim(),
      iso2: hit ? hit.iso2 : '',
      group: group,
      badge: meta.badge,
      niva: meta.niva,
      klass: meta.klass,
      hogrisk: group === GROUP.EU_HOGRISK || group === GROUP.CALL_FOR_ACTION || group === GROUP.SPECIAL
    };
  }

  function assess(raw) {
    var countries = parseLabels(raw).map(classifyOne);
    var hogrisk = countries.filter(function (c) { return c.hogrisk; });
    var call = countries.filter(function (c) { return c.group === GROUP.CALL_FOR_ACTION; });
    var outsideEu = countries.filter(function (c) { return c.group !== GROUP.EU_EES; });
    return {
      countries: countries,
      hogrisk: hogrisk,
      callForAction: call,
      outsideEu: outsideEu,
      hasHogrisk: hogrisk.length > 0,
      hasCallForAction: call.length > 0,
      hasOutsideEu: outsideEu.length > 0,
      labels: countries.map(function (c) { return c.label; }),
      joined: countries.map(function (c) { return c.label; }).join(', '),
      source: SOURCE
    };
  }

  function formatWithBadges(raw) {
    return assess(raw).countries.map(function (c) {
      return c.label + ' (' + c.badge + ')';
    }).join(', ');
  }

  function search(query, limit) {
    var needle = fold(query);
    var max = limit == null ? 12 : limit;
    if (!needle) return [];
    var hits = [];
    COUNTRIES.forEach(function (c) {
      if (c.iso2 === 'SE') return;
      var hay = [c.name, c.iso2].concat(c.aliases || []);
      if (hay.some(function (part) { return fold(part).indexOf(needle) !== -1; })) {
        hits.push(c);
      }
    });
    hits.sort(function (a, b) {
      var aExact = fold(a.name) === needle || fold(a.iso2) === needle ? 0 : 1;
      var bExact = fold(b.name) === needle || fold(b.iso2) === needle ? 0 : 1;
      if (aExact !== bExact) return aExact - bExact;
      return a.name.localeCompare(b.name, 'sv');
    });
    return hits.slice(0, max);
  }

  var NORDIC = { NO: true, DK: true, FI: true, IS: true };

  var GEO_FACTORS = [
    { id: 'naromrade', label: 'Närområde', aliases: ['naromrade', 'näromrade'] },
    { id: 'europa', label: 'Europa', aliases: ['europa'] },
    { id: 'hog_korruption', label: 'Land med hög korruption/svag kontroll', aliases: ['hog korruption', 'svag kontroll'] },
    { id: 'utanfor_eu', label: 'Utanför EU', aliases: ['utanfor eu', 'utanför eu'] }
  ];

  function matchGeoFactor(namn) {
    var key = fold(namn);
    if (!key) return null;
    for (var i = 0; i < GEO_FACTORS.length; i += 1) {
      var factor = GEO_FACTORS[i];
      if (key === fold(factor.label) || key.indexOf(fold(factor.label)) !== -1) return factor;
      for (var j = 0; j < factor.aliases.length; j += 1) {
        if (key.indexOf(factor.aliases[j]) !== -1) return factor;
      }
    }
    return null;
  }

  function suggestedGeoFactorIds(raw, opts) {
    var result = assess(raw);
    if (result.countries.length) {
      var ids = [];
      var hasNordic = result.countries.some(function (c) { return NORDIC[c.iso2]; });
      var hasEuOther = result.countries.some(function (c) {
        return c.group === GROUP.EU_EES && !NORDIC[c.iso2];
      });
      if (hasNordic) ids.push('naromrade');
      if (hasEuOther) ids.push('europa');
      if (result.hasOutsideEu) ids.push('utanfor_eu');
      if (result.hasHogrisk) ids.push('hog_korruption');
      return ids;
    }
    if (opts && opts.onlySweden) return ['naromrade'];
    return [];
  }

  function geoSteeringLabels(raw, opts) {
    var ids = suggestedGeoFactorIds(raw, opts);
    return GEO_FACTORS.filter(function (f) { return ids.indexOf(f.id) !== -1; }).map(function (f) { return f.label; });
  }

  function recordNamn(rec) {
    if (!rec) return '';
    var f = rec.fields || rec;
    return String(f.Riskfaktor || f['Riskfaktor'] || rec.namn || '').trim();
  }

  function suggestedRecordIds(records, raw, opts) {
    var wanted = {};
    suggestedGeoFactorIds(raw, opts).forEach(function (id) { wanted[id] = true; });
    return (Array.isArray(records) ? records : []).filter(function (rec) {
      var hit = matchGeoFactor(recordNamn(rec));
      return !!(hit && wanted[hit.id] && rec.id);
    }).map(function (rec) { return rec.id; });
  }

  function steeredRecordIds(records) {
    return (Array.isArray(records) ? records : []).filter(function (rec) {
      return !!(matchGeoFactor(recordNamn(rec)) && rec.id);
    }).map(function (rec) { return rec.id; });
  }

  function warningText(result) {
    if (!result || !result.countries.length) return '';
    if (result.hasCallForAction) {
      return 'Handel med ' + result.callForAction.map(function (c) { return c.label; }).join(', ')
        + ' kräver skärpta åtgärder. Landet är med på FATF:s svartlista och EU:s högriskförteckning.';
    }
    if (result.hasHogrisk) {
      return 'Handel med ' + result.hogrisk.map(function (c) { return c.label; }).join(', ')
        + ' kräver skärpta åtgärder enligt EU:s förteckning över högriskländer.';
    }
    return '';
  }

  var api = {
    SOURCE: SOURCE,
    GROUP: GROUP,
    COUNTRIES: COUNTRIES,
    fold: fold,
    findCountry: findCountry,
    parseLabels: parseLabels,
    classifyOne: classifyOne,
    assess: assess,
    formatWithBadges: formatWithBadges,
    search: search,
    warningText: warningText,
    GEO_FACTORS: GEO_FACTORS,
    matchGeoFactor: matchGeoFactor,
    suggestedGeoFactorIds: suggestedGeoFactorIds,
    geoSteeringLabels: geoSteeringLabels,
    suggestedRecordIds: suggestedRecordIds,
    steeredRecordIds: steeredRecordIds
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  global.EuHogriskLander = api;
})(typeof window !== 'undefined' ? window : globalThis);
