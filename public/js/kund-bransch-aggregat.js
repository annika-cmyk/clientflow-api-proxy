/**
 * Aggregerar detaljerade bransch-/SNI-etiketter till översiktsgrupper
 * för byråprofilens fråga "Vilka branscher har ni era kunder i?".
 * Delas av API och byråprofil-enkät.
 */
(function (global) {
  const COMMON_KUND_BRANSCHER = [
    'Bygg och anläggning',
    'Detaljhandel',
    'Partihandel',
    'Restaurang och café',
    'Hotell och boende',
    'Transport och logistik',
    'IT och konsultverksamhet',
    'Vård och omsorg',
    'Fastighet',
    'Tillverkning och industri',
    'Jordbruk och skogsbruk',
    'Utbildning',
    'Kultur, media och underhållning',
    'Finans och försäkring',
    'Energi och miljö',
    'Städ och facility',
    'Bemanning',
    'Ideell verksamhet',
    'Offentlig sektor',
    'Övrigt'
  ];

  const FALLBACK = 'Övrigt';

  const SNI2_TO_BUCKET = {
    '01': 'Jordbruk och skogsbruk',
    '02': 'Jordbruk och skogsbruk',
    '03': 'Jordbruk och skogsbruk',
    '05': 'Energi och miljö',
    '06': 'Energi och miljö',
    '07': 'Energi och miljö',
    '08': 'Energi och miljö',
    '09': 'Energi och miljö',
    '10': 'Tillverkning och industri',
    '11': 'Tillverkning och industri',
    '12': 'Tillverkning och industri',
    '13': 'Tillverkning och industri',
    '14': 'Tillverkning och industri',
    '15': 'Tillverkning och industri',
    '16': 'Tillverkning och industri',
    '17': 'Tillverkning och industri',
    '18': 'Tillverkning och industri',
    '19': 'Tillverkning och industri',
    '20': 'Tillverkning och industri',
    '21': 'Tillverkning och industri',
    '22': 'Tillverkning och industri',
    '23': 'Tillverkning och industri',
    '24': 'Tillverkning och industri',
    '25': 'Tillverkning och industri',
    '26': 'Tillverkning och industri',
    '27': 'Tillverkning och industri',
    '28': 'Tillverkning och industri',
    '29': 'Tillverkning och industri',
    '30': 'Tillverkning och industri',
    '31': 'Tillverkning och industri',
    '32': 'Tillverkning och industri',
    '33': 'Tillverkning och industri',
    '35': 'Energi och miljö',
    '36': 'Energi och miljö',
    '37': 'Energi och miljö',
    '38': 'Energi och miljö',
    '39': 'Energi och miljö',
    '41': 'Bygg och anläggning',
    '42': 'Bygg och anläggning',
    '43': 'Bygg och anläggning',
    '45': 'Detaljhandel',
    '46': 'Partihandel',
    '47': 'Detaljhandel',
    '49': 'Transport och logistik',
    '50': 'Transport och logistik',
    '51': 'Transport och logistik',
    '52': 'Transport och logistik',
    '53': 'Transport och logistik',
    '55': 'Hotell och boende',
    '56': 'Restaurang och café',
    '58': 'Kultur, media och underhållning',
    '59': 'Kultur, media och underhållning',
    '60': 'Kultur, media och underhållning',
    '61': 'IT och konsultverksamhet',
    '62': 'IT och konsultverksamhet',
    '63': 'IT och konsultverksamhet',
    '64': 'Finans och försäkring',
    '65': 'Finans och försäkring',
    '66': 'Finans och försäkring',
    '68': 'Fastighet',
    '69': 'IT och konsultverksamhet',
    '70': 'IT och konsultverksamhet',
    '71': 'IT och konsultverksamhet',
    '72': 'IT och konsultverksamhet',
    '73': 'IT och konsultverksamhet',
    '74': 'IT och konsultverksamhet',
    '75': 'IT och konsultverksamhet',
    '77': 'Fastighet',
    '78': 'Bemanning',
    '80': 'Städ och facility',
    '81': 'Städ och facility',
    '82': 'Städ och facility',
    '84': 'Offentlig sektor',
    '85': 'Utbildning',
    '86': 'Vård och omsorg',
    '87': 'Vård och omsorg',
    '88': 'Vård och omsorg',
    '90': 'Kultur, media och underhållning',
    '91': 'Kultur, media och underhållning',
    '92': 'Kultur, media och underhållning',
    '93': 'Kultur, media och underhållning',
    '94': 'Ideell verksamhet',
    '95': 'Övrigt',
    '96': 'Övrigt'
  };

  function fold(s) {
    return String(s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function extractSniCodes(label) {
    const text = String(label || '');
    const codes = [];
    const re = /\b(\d{2})\.?(\d{3})\b/g;
    let m;
    while ((m = re.exec(text))) {
      codes.push(m[1] + m[2]);
    }
    const re2 = /\bsni\s*(\d{2})\b/gi;
    while ((m = re2.exec(text))) {
      const two = m[1];
      if (SNI2_TO_BUCKET[two] && !codes.some((c) => c.startsWith(two))) {
        codes.push(two + '000');
      }
    }
    return codes;
  }

  function bucketFromSniCode(code) {
    const digits = String(code || '').replace(/[^\d]/g, '');
    if (digits.length < 2) return '';
    return SNI2_TO_BUCKET[digits.slice(0, 2)] || '';
  }

  function matchCommonExact(label) {
    const key = fold(label);
    if (!key) return '';
    const hit = COMMON_KUND_BRANSCHER.find((c) => fold(c) === key);
    return hit || '';
  }

  const TEXT_ALIASES = [
    [/^(bygg|anlaggning|bygg och anlaggning)(\b|$)/, 'Bygg och anläggning'],
    [/\b(bygg|snickeri|anlagg|murer|elinstall|vvs|maleri|ror|tak|markentrepren)/, 'Bygg och anläggning'],
    [/\b(detaljhandel|butik|e-?handel|detalj)\b/, 'Detaljhandel'],
    [/\b(partihandel|grossist|gross)\b/, 'Partihandel'],
    [/\b(handel)\b/, 'Detaljhandel'],
    [/\b(restaurang|cafe|bar|catering|servering)\b/, 'Restaurang och café'],
    [/\b(hotell|boende|vandrarhem|logi)\b/, 'Hotell och boende'],
    [/\b(transport|akeri|logistik|frakt|taxi|bud)\b/, 'Transport och logistik'],
    [/\b(dataprogrammering|programvar|mjukvar|systemutveckl|konsult|radgiv)\b/, 'IT och konsultverksamhet'],
    [/\b(?:\bit\b|\bdata\b)/, 'IT och konsultverksamhet'],
    [/\b(redovis|bokfor|revisor|ekonomi|juridik|advokat)\b/, 'IT och konsultverksamhet'],
    [/\b(vard|omsorg|halsa|tand|lakar|primarvard|sjukvard)\b/, 'Vård och omsorg'],
    [/\b(fastig|makl|hyres|uthyrning)\b/, 'Fastighet'],
    [/\b(tillverk|industri|verkstad|produktion|beredning)\b/, 'Tillverkning och industri'],
    [/\b(jordbruk|skog|lantbruk|odling|fiske|vattenbruk|skogsforvalt)\b/, 'Jordbruk och skogsbruk'],
    [/\b(utbildning|skola|forskola|kurs)\b/, 'Utbildning'],
    [/\b(kultur|media|underhallning|grafisk|design|film|forlag|sport|noje|visuell kommunikation)\b/, 'Kultur, media och underhållning'],
    [/\b(finans|forsakring|bank|fond)\b/, 'Finans och försäkring'],
    [/\b(energi|miljo|atervinn|avfall|vattenverk|elhandel)\b/, 'Energi och miljö'],
    [/\b(stad|facility|fastighetsservice|lokalvard)\b/, 'Städ och facility'],
    [/\b(bemanning|personaluthyrning|rekrytering)\b/, 'Bemanning'],
    [/\b(ideell|forening|stiftelse)\b/, 'Ideell verksamhet'],
    [/\b(offentlig|kommun|myndighet|statlig)\b/, 'Offentlig sektor'],
    [/\b(ovrig|ovrigt)\b/, 'Övrigt']
  ];

  function bucketFromText(label) {
    const exact = matchCommonExact(label);
    if (exact) return exact;
    const s = fold(label);
    if (!s) return '';
    for (let i = 0; i < TEXT_ALIASES.length; i += 1) {
      if (TEXT_ALIASES[i][0].test(s)) return TEXT_ALIASES[i][1];
    }
    return '';
  }

  function mapToCommonKundBransch(label) {
    const raw = String(label || '').trim();
    if (!raw) return FALLBACK;
    const exact = matchCommonExact(raw);
    if (exact) return exact;

    const codes = extractSniCodes(raw);
    for (let i = 0; i < codes.length; i += 1) {
      const b = bucketFromSniCode(codes[i]);
      if (b) return b;
    }

    return bucketFromText(raw) || FALLBACK;
  }

  function looksFineGrained(label) {
    const raw = String(label || '').trim();
    if (!raw) return false;
    if (matchCommonExact(raw)) return false;
    if (/\b\d{5}\b/.test(raw)) return true;
    if (/\s\/\s/.test(raw)) return true;
    if (raw.length > 48) return true;
    return false;
  }

  function shouldSuggestAggregation(rows) {
    const list = Array.isArray(rows) ? rows : [];
    const fine = list.filter((r) => looksFineGrained(r && r.form));
    if (fine.length >= 2) return true;
    if (list.length >= 8 && fine.length >= 1) return true;
    return false;
  }

  function aggregateCountedBranscher(rows) {
    const list = Array.isArray(rows) ? rows : [];
    const map = new Map();
    list.forEach((row) => {
      const form = String((row && (row.form || row.namn)) || '').trim();
      if (!form) return;
      const bucket = mapToCommonKundBransch(form);
      const rawCount = row.count != null ? row.count : row.antal;
      const n = Number(rawCount);
      const prev = map.get(bucket) || { form: bucket, count: '', sum: 0, hasNum: false };
      if (Number.isFinite(n) && String(rawCount).trim() !== '') {
        prev.sum += Math.round(n);
        prev.hasNum = true;
        prev.count = String(prev.sum);
      }
      map.set(bucket, prev);
    });
    return Array.from(map.values()).map((r) => ({
      form: r.form,
      count: r.hasNum ? String(r.sum) : ''
    }));
  }

  function parseCountedBranschList(value) {
    const raw = value == null ? '' : String(value).trim();
    if (!raw) return [];

    const ends = [];
    const re = /:\s*(\d+)\s*(?=,|;|\||$)/g;
    let m;
    while ((m = re.exec(raw))) {
      ends.push({ count: m[1], countStart: m.index, countEnd: m.index + m[0].length });
    }

    if (ends.length) {
      const seen = new Map();
      let cursor = 0;
      ends.forEach((end) => {
        const form = raw.slice(cursor, end.countStart).replace(/^[,;|\s]+/, '').trim();
        cursor = end.countEnd;
        if (!form) return;
        const key = form.toLowerCase();
        const prev = seen.get(key);
        if (!prev) seen.set(key, { form, count: end.count });
        else if (!prev.count) prev.count = end.count;
      });
      return Array.from(seen.values());
    }

    const parts = raw.split(/\s*[;|]\s*|\s*,\s*(?=\d{5}\b)/).map((s) => s.trim()).filter(Boolean);
    const seen = new Map();
    parts.forEach((form) => {
      if (!form) return;
      const key = form.toLowerCase();
      if (!seen.has(key)) seen.set(key, { form, count: '' });
    });
    return Array.from(seen.values());
  }

  function industryLabelsFromFields(fields, helpers) {
    const f = fields || {};
    const asValues = helpers && helpers.asValues
      ? helpers.asValues
      : (v) => {
        if (v == null || v === '') return [];
        if (Array.isArray(v)) return v.map((x) => String(x || '').trim()).filter(Boolean);
        return [String(v).trim()].filter(Boolean);
      };
    const parseKycJson = helpers && helpers.parseKycJson ? helpers.parseKycJson : () => ({});
    const labels = [];
    asValues(f['SNI kod'] || f['SNI-koder'] || f['SNI-kod'] || f['SNI-bransch'] || f['Bransch']).forEach((v) => {
      labels.push(v);
    });
    const kyc = parseKycJson(f) || {};
    if (kyc.bransch) labels.push(kyc.bransch);
    const seen = {};
    return labels
      .map((v) => String(v || '').trim())
      .filter((namn) => {
        if (!namn || namn === '---') return false;
        const key = fold(namn);
        if (seen[key]) return false;
        seen[key] = true;
        return true;
      });
  }

  function countKundBranschBuckets(records, helpers) {
    const list = Array.isArray(records) ? records : [];
    const antal = {};
    list.forEach((rec) => {
      const labels = industryLabelsFromFields((rec && rec.fields) || {}, helpers);
      if (!labels.length) return;
      const buckets = new Set();
      labels.forEach((l) => buckets.add(mapToCommonKundBransch(l)));
      buckets.forEach((b) => {
        antal[b] = (antal[b] || 0) + 1;
      });
    });
    return Object.entries(antal)
      .map(([namn, n]) => ({ namn, antal: n }))
      .sort((a, b) => b.antal - a.antal || a.namn.localeCompare(b.namn, 'sv'));
  }

  function resolveBucketName(raw) {
    const text = String(raw || '').trim();
    if (!text) return '';
    const exact = matchCommonExact(text);
    if (exact) return exact;
    return mapToCommonKundBransch(text);
  }

  function labelsMatchingBucket(labels, bucketRaw) {
    const list = Array.isArray(labels) ? labels : [];
    const wanted = resolveBucketName(bucketRaw);
    const foldWanted = fold(bucketRaw);
    return list.filter((label) => {
      const mapped = mapToCommonKundBransch(label);
      if (wanted && mapped === wanted) return true;
      return fold(label) === foldWanted;
    });
  }

  function customerNameFromFields(fields) {
    const f = fields || {};
    return String(f.Namn || f.Kundnamn || f['Kundnamn'] || '').trim() || 'Namn saknas';
  }

  function asHelperValues(helpers, value) {
    if (helpers && typeof helpers.asValues === 'function') return helpers.asValues(value);
    if (value == null || value === '') return [];
    if (Array.isArray(value)) return value.map((x) => String(x || '').trim()).filter(Boolean);
    return [String(value).trim()].filter(Boolean);
  }

  function hogriskLabelsFromFields(fields, helpers) {
    return asHelperValues(helpers, (fields || {})['Kunden verkar i en högriskbransch'])
      .map((v) => String(v || '').trim())
      .filter((v) => v && v !== '---');
  }

  function labelMatchesFilter(label, filterRaw) {
    const filter = String(filterRaw || '').trim();
    if (!filter) return true;
    const a = fold(label);
    const b = fold(filter);
    if (!a || !b) return false;
    if (a === b) return true;
    // Tillåt match på enbart SNI-kod (t.ex. 68201 vs "68201 - Uthyrning…")
    const codesA = extractSniCodes(label);
    const codesB = extractSniCodes(filter);
    if (codesA.length && codesB.length && codesA.some((c) => codesB.includes(c))) return true;
    if (codesB.length === 1 && codesA.includes(codesB[0])) return true;
    if (/^\d{5}$/.test(filter.replace(/\D/g, '')) && codesA.includes(filter.replace(/\D/g, ''))) return true;
    return a.indexOf(b) >= 0 || b.indexOf(a) >= 0;
  }

  function sortNamedCounts(map) {
    return Object.entries(map || {})
      .map(([namn, antal]) => ({ namn, antal }))
      .sort((a, b) => b.antal - a.antal || a.namn.localeCompare(b.namn, 'sv'));
  }

  /**
   * Bryter ner en översiktsbransch till under-SNI + kundlista.
   * @param {Array} records
   * @param {string} bucketName – t.ex. "Fastighet" eller "Bygg och anläggning"
   * @param {{ asValues?, parseKycJson?, sniFilter? }} [helpers]
   */
  function drilldownKundBransch(records, bucketName, helpers) {
    const list = Array.isArray(records) ? records : [];
    const bucket = resolveBucketName(bucketName) || String(bucketName || '').trim();
    const sniFilter = helpers && helpers.sniFilter != null ? String(helpers.sniFilter).trim() : '';
    const undersni = {};
    const kunder = [];

    list.forEach((rec) => {
      const fields = (rec && rec.fields) || {};
      const labels = industryLabelsFromFields(fields, helpers);
      const matching = labelsMatchingBucket(labels, bucketName);
      if (!matching.length) return;

      matching.forEach((label) => {
        undersni[label] = (undersni[label] || 0) + 1;
      });

      if (sniFilter && !matching.some((label) => labelMatchesFilter(label, sniFilter))) return;

      const shown = sniFilter
        ? matching.filter((label) => labelMatchesFilter(label, sniFilter))
        : matching;

      kunder.push({
        id: rec && rec.id,
        namn: customerNameFromFields(fields),
        sni: shown.join(' · ')
      });
    });

    kunder.sort((a, b) => String(a.namn).localeCompare(String(b.namn), 'sv'));

    return {
      typ: 'kund-bransch',
      bucket,
      undersni: sortNamedCounts(undersni),
      kunder,
      antalKunder: kunder.length
    };
  }

  /**
   * Bryter ner en högriskbransch-etikett till under-SNI + kundlista.
   * Matchar fältet "Kunden verkar i en högriskbransch".
   */
  function drilldownHogriskBransch(records, hogriskName, helpers) {
    const list = Array.isArray(records) ? records : [];
    const wanted = String(hogriskName || '').trim();
    const foldWanted = fold(wanted);
    const sniFilter = helpers && helpers.sniFilter != null ? String(helpers.sniFilter).trim() : '';
    const undersni = {};
    const kunder = [];

    list.forEach((rec) => {
      const fields = (rec && rec.fields) || {};
      const hogLabels = hogriskLabelsFromFields(fields, helpers);
      if (!hogLabels.some((l) => fold(l) === foldWanted)) return;

      const industry = industryLabelsFromFields(fields, helpers);
      industry.forEach((label) => {
        undersni[label] = (undersni[label] || 0) + 1;
      });
      if (!industry.length) {
        undersni['(SNI saknas)'] = (undersni['(SNI saknas)'] || 0) + 1;
      }

      if (sniFilter) {
        if (!industry.some((label) => labelMatchesFilter(label, sniFilter))) return;
      }

      const shown = sniFilter
        ? industry.filter((label) => labelMatchesFilter(label, sniFilter))
        : industry;

      kunder.push({
        id: rec && rec.id,
        namn: customerNameFromFields(fields),
        sni: shown.length ? shown.join(' · ') : ''
      });
    });

    kunder.sort((a, b) => String(a.namn).localeCompare(String(b.namn), 'sv'));

    return {
      typ: 'hogriskbransch',
      bucket: wanted,
      undersni: sortNamedCounts(undersni),
      kunder,
      antalKunder: kunder.length
    };
  }

  const api = {
    COMMON_KUND_BRANSCHER,
    FALLBACK,
    SNI2_TO_BUCKET,
    extractSniCodes,
    bucketFromSniCode,
    mapToCommonKundBransch,
    looksFineGrained,
    shouldSuggestAggregation,
    aggregateCountedBranscher,
    parseCountedBranschList,
    industryLabelsFromFields,
    countKundBranschBuckets,
    resolveBucketName,
    labelsMatchingBucket,
    labelMatchesFilter,
    drilldownKundBransch,
    drilldownHogriskBransch
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  global.KundBranschAggregat = api;
})(typeof window !== 'undefined' ? window : globalThis);
