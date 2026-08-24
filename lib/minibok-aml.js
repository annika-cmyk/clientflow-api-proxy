/**
 * Minibok ↔ Clientflow AML API (Airtable)
 *
 * Exponerar kundrisk, byråns allmänna riskbedömning och AML-policy/rutiner
 * för Miniboks lager-3-regelmotor.
 *
 * Auth: samma som övriga /api/v1/* (Bearer MINIBOK_API_KEY + userEmail)
 *
 * Routes:
 *   GET /api/v1/companies/:clientflowId/aml-risk
 *   GET /api/v1/companies/aml-risk?orgNr=...   (alt. lookup)
 *   GET /api/v1/agency/aml-risk
 *   GET /api/v1/agency/aml-policy
 *   GET /api/v1/aml/meta
 */

// axios lazy-loadas så rena mappers kan testas utan node_modules.
function getAxios() {
  return require('axios');
}

const { isPlaceholderText } = require('./minibok-company-match');
const RiskSkala = require('../public/js/risk-skala');

const KUNDDATA_TABLE_DEFAULT = 'tblOIuLQS2DqmOQWe';
const BYRAER_TABLE_DEFAULT = 'Byråer';
const UPPDRAG_TABLE_NAME = 'Uppdrag';

const ALLMAN_RISK_FIELDS = [
  '1. Syfte och Omfattning',
  '2. Beskrivning av Byråns verksamhet',
  'Antal anställda',
  'Omsättning',
  'Antal kundföretag',
  '3. Metod för Riskbedömning ',
  '4. Identifierade Risker och Sårbarheter',
  '5. Riskreducerande Åtgärder och Rutiner',
  '6. Utvärdering och Uppdatering',
  '7. Kommunikation.',
  '8. Värdering av sammantagen risk',
  '9. Riskaptit',
  'Uppdaterad datum',
];

const POLICY_FIELDS = [
  { key: '1. Syfte och omfattning policy', ruleId: 'syfte' },
  { key: '2. Centralt Funktionsansvarig ', ruleId: 'centralt_funktion' },
  { key: 'Centralt funktionsansvarig', ruleId: 'centralt_person' },
  { key: '3. Kundkännedomsåtgärder ', ruleId: 'kundkannedom' },
  { key: '4. Övervakning och Rapportering ', ruleId: 'overvakning' },
  { key: '5. Intern Kontroll ', ruleId: 'intern_kontroll' },
  { key: '6. Anställda och Utbildning', ruleId: 'utbildning' },
  { key: '7. Arkivering av dokumentation', ruleId: 'arkivering' },
  { key: '8. Uppdatering och Utvärdering ', ruleId: 'uppdatering' },
  { key: '9. Kommunikation', ruleId: 'kommunikation' },
  { key: '10. Registrering Byrån ', ruleId: 'registrering' },
  { key: 'Policydokumentet reviderat och godkänt', ruleId: 'policy_reviderat' },
];

function escAirtable(s) {
  return String(s || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function normalizeFieldKey(name) {
  return String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .toLowerCase();
}

function airtableCellStr(val) {
  if (val === undefined || val === null || val === '') return '';
  if (Array.isArray(val)) {
    return val.map(airtableCellStr).filter(Boolean).join(', ');
  }
  if (typeof val === 'object') {
    const name = val.name || val.Name || val.fullName || val.label || val.text;
    if (name != null && String(name).trim()) return String(name).trim();
    if (val.id) return String(val.id).trim();
    return '';
  }
  if (typeof val === 'boolean') return val ? 'true' : 'false';
  return String(val).trim();
}

function fieldRaw(fields, key) {
  if (!fields || key == null) return undefined;
  if (Object.prototype.hasOwnProperty.call(fields, key)) return fields[key];
  const trimmed = String(key).trim();
  if (Object.prototype.hasOwnProperty.call(fields, trimmed)) return fields[trimmed];
  const wanted = normalizeFieldKey(key);
  if (!wanted) return undefined;
  const entries = Object.entries(fields);
  for (let i = 0; i < entries.length; i++) {
    if (normalizeFieldKey(entries[i][0]) === wanted) return entries[i][1];
  }
  return undefined;
}

function fieldStr(fields, key) {
  if (!fields || key == null) return '';
  const raw = fieldRaw(fields, key);
  return raw === undefined ? '' : airtableCellStr(raw);
}

function parseJsonField(raw, fallback) {
  if (raw == null || raw === '') return fallback;
  if (typeof raw === 'object') return raw;
  try {
    const v = JSON.parse(String(raw));
    return v == null ? fallback : v;
  } catch (_) {
    return fallback;
  }
}

/** Låg|Normal|Förhöjd|Hög|Oacceptabel (+ alias Medel/Lag/Hog) → low|normal|elevated|high|unacceptable */
function mapOverallRisk(raw) {
  return RiskSkala.normalizeRiskKey(raw);
}

function truthyCheckbox(v) {
  return v === true || v === 1 || v === '1' || String(v).toLowerCase() === 'true';
}

function periodKindForUppdragTyp(typ) {
  return String(typ || '').trim() === 'Momsredovisning' ? 'vat' : 'other';
}

function parseActionLines(raw) {
  if (Array.isArray(raw)) {
    return raw.map((x) => String(x || '').trim()).filter(Boolean);
  }
  const s = String(raw == null ? '' : raw).trim();
  if (!s) return [];
  if (s.charAt(0) === '[') {
    const parsed = parseJsonField(s, []);
    if (Array.isArray(parsed)) return parseActionLines(parsed);
  }
  return s.split(/\r?\n|;/).map((line) => line.replace(/^\s*[-•*]\s*/, '').trim()).filter(Boolean);
}

function firstFieldStr(fields, keys) {
  for (const key of keys || []) {
    const v = fieldStr(fields, key);
    if (v && !isPlaceholderText(v, key)) return v;
  }
  return '';
}

/** Längst meningsfulla KYC-text vinner — en kort Verksamhet får inte dölja fet beskrivning. */
function pickLongestPlain(candidates) {
  let best = '';
  (candidates || []).forEach((item) => {
    const raw = item && item.text != null ? item.text : item;
    const key = item && item.key;
    const t = htmlToPlainText(raw);
    if (!t) return;
    if (key && isPlaceholderText(t, key)) return;
    if (t.length > best.length) best = t;
  });
  return best;
}

/** KYC-richtext från Clientflow → läsbar text för Minibok/AML. */
function htmlToPlainText(raw) {
  if (raw == null || raw === '') return '';
  let t = String(raw);
  const looksLikeHtml = /<\s*\/?\s*[a-z][^>]*>/i.test(t)
    || /&(?:nbsp|amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/i.test(t);
  if (!looksLikeHtml) return t.replace(/\u00a0/g, ' ').replace(/[ \t]{2,}/g, ' ').trim();

  t = t.replace(/<\s*br\s*\/?\s*>/gi, '\n');
  t = t.replace(/<\s*\/\s*(p|div|tr|h[1-6]|section|article|ul|ol)\s*>/gi, '\n');
  t = t.replace(/<\s*(p|div|tr|h[1-6]|section|article)(\s[^>]*)?>/gi, '\n');
  t = t.replace(/<\s*li(\s[^>]*)?>/gi, '\n• ');
  t = t.replace(/<\s*\/\s*li\s*>/gi, '');
  t = t.replace(/<[^>]+>/g, '');
  t = t
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => {
      const code = Number(n);
      return Number.isFinite(code) ? String.fromCharCode(code) : '';
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => {
      const code = parseInt(h, 16);
      return Number.isFinite(code) ? String.fromCharCode(code) : '';
    });
  t = t.replace(/\u00a0/g, ' ');
  t = t.replace(/[ \t]+\n/g, '\n').replace(/\n[ \t]+/g, '\n');
  t = t.replace(/[ \t]{2,}/g, ' ');
  t = t.replace(/\n{3,}/g, '\n\n');
  return t.trim();
}

function parseChipList(raw) {
  if (Array.isArray(raw)) {
    return raw.map((x) => airtableCellStr(x)).filter((s) => s && s !== '[object Object]');
  }
  if (raw && typeof raw === 'object') {
    const one = airtableCellStr(raw);
    return one ? [one] : [];
  }
  const s = String(raw == null ? '' : raw).trim();
  if (!s) return [];
  if (s.charAt(0) === '[') {
    const parsed = parseJsonField(s, []);
    if (Array.isArray(parsed)) return parseChipList(parsed);
  }
  return s.split(/\r?\n|;/).map((line) => line.replace(/^\s*[-•*]\s*/, '').trim()).filter(Boolean);
}

function fieldChips(fields, keys) {
  const out = [];
  const seen = new Set();
  (keys || []).forEach((key) => {
    parseChipList(fieldRaw(fields, key)).forEach((chip) => {
      if (!chip || isPlaceholderText(chip, key)) return;
      const k = chip.toLowerCase();
      if (seen.has(k)) return;
      seen.add(k);
      out.push(chip);
    });
  });
  return out;
}

/** SNI-koder från "62010 Dataprogrammering" / "01.131 Potatisodling" / "70200 - Konsult…". */
function parseSniCodes(raw) {
  const s = Array.isArray(raw) ? raw.map((x) => airtableCellStr(x)).join('\n') : String(raw || '');
  if (!s.trim()) return [];
  const chunks = s.split(/\n/).flatMap((row) => String(row).split(',')).map((row) => row.trim()).filter(Boolean);
  const codes = [];
  const seen = new Set();
  chunks.forEach((row) => {
    const dotted = row.match(/(\d{2})\.(\d{1,3})/);
    const plain = row.replace(/\./g, '').match(/(\d{4,6})/);
    const code = dotted
      ? `${dotted[1]}${dotted[2]}`.replace(/\D/g, '').slice(0, 6)
      : (plain ? plain[1] : '');
    if (!code || seen.has(code)) return;
    seen.add(code);
    codes.push(code);
  });
  return codes;
}

function parseYesNo(raw) {
  const s = String(raw || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (!s) return null;
  if (/^(ja|yes|true|1)\b/.test(s)) return true;
  if (/^(nej|no|false|0)\b/.test(s)) return false;
  return null;
}

function parseInternationalTrade(fields, kyc) {
  const raw = firstFieldStr(fields, [
    'Har företaget transaktioner med andra länder?',
    'Internationell handel',
  ]) || (kyc && (kyc.internationellHandel || kyc.internationalTrade)) || '';
  const countryRaw = firstFieldStr(fields, [
    'Internationella länder',
    'Länder',
    'Länder utanför Sverige',
  ]) || (kyc && (kyc.internationellaLander || kyc.countries)) || '';
  const countries = Array.isArray(countryRaw)
    ? countryRaw.map((c) => String(c || '').trim()).filter(Boolean)
    : String(countryRaw || '')
      .split(/\r?\n|;|,/)
      .map((c) => c.replace(/^\s*[-•*]\s*/, '').trim())
      .filter(Boolean);
  const uniqueCountries = Array.from(new Set(countries));
  const yn = parseYesNo(raw);
  const rawText = String(raw || '').trim() || null;
  return {
    outsideSweden: yn === true || (yn == null && uniqueCountries.length > 0),
    countries: uniqueCountries,
    raw: rawText,
    answered: yn != null || uniqueCountries.length > 0,
  };
}

function parseLinkedIds(raw) {
  if (raw == null || raw === '') return [];
  if (Array.isArray(raw)) return raw.flatMap((v) => parseLinkedIds(v));
  if (typeof raw === 'object') {
    const id = String(raw.id || '').trim();
    if (/^rec[A-Za-z0-9]+$/.test(id)) return [id];
    const name = String(raw.name || raw.Name || raw.fullName || '').trim();
    return name ? [name] : [];
  }
  const s = String(raw).trim();
  if (/^rec[A-Za-z0-9]+$/.test(s)) return [s];
  return s.split(/[,;]+/).map((part) => part.trim()).filter(Boolean).flatMap((part) => parseLinkedIds(part));
}

function extractFocusAreas(fields) {
  const focusAreas = [];
  const idRisk = fieldStr(fields, '4. Identifierade Risker och Sårbarheter');
  if (idRisk) {
    idRisk.split(/\n+/).forEach((line) => {
      const t = line.replace(/^[-*•]\s*/, '').trim();
      if (t && t.length < 120) focusAreas.push(t);
    });
  }
  return focusAreas.slice(0, 30);
}

function extractGeoHighRiskList(fields) {
  const direct = firstFieldStr(fields, [
    'Högriskländer',
    'Hogrisklander',
    'highRiskCountries',
    'Geo high risk',
  ]);
  if (direct) return parseChipList(direct).slice(0, 40);
  const blobs = [
    fieldStr(fields, '4. Identifierade Risker och Sårbarheter'),
    fieldStr(fields, '5. Riskreducerande Åtgärder och Rutiner'),
  ].filter(Boolean);
  const countries = [];
  blobs.forEach((blob) => {
    String(blob).split(/\n+/).forEach((line) => {
      const ascii = String(line).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (!/hogriskland|high-?risk countr|fatf|gra lista|svart lista/i.test(ascii)) return;
      const rest = line.replace(/^[^:]*:\s*/, '');
      String(rest).split(/\r?\n|;|,/).map((c) => c.replace(/^\s*[-•*]\s*/, '').trim()).filter(Boolean).forEach((c) => {
        if (c && c.length < 48) countries.push(c);
      });
    });
  });
  return Array.from(new Set(countries)).slice(0, 40);
}

function pepFromFields(fields, kyc) {
  const pepField = fields && fields.PEP;
  const pepRaw = fieldStr(fields, 'PEP');
  const pepText = String(pepRaw || '').toLowerCase();
  const namedPep = pepText && !/inte pep|ej pep|ingen pep|nej/.test(pepText) && /pep/.test(pepText);
  return {
    pep: !!(
      truthyCheckbox(pepField) ||
      namedPep ||
      (kyc && (kyc.pep === true || kyc.pep === 'Ja' || kyc.pep === 'ja')) ||
      Number(fieldStr(fields, 'Antal träffar PEP och sanktionslistor') || 0) > 0
    ),
    pepRaw: pepRaw || null,
  };
}

function riskActionId(text) {
  const s = String(text || '').trim().replace(/\s+/g, ' ').toLowerCase();
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return `ra_${(h >>> 0).toString(36)}`;
}

function mergeRiskActions(catalog, assigned) {
  const byKey = new Map();
  (assigned || []).forEach((a) => {
    if (!a || !a.text) return;
    const k = String(a.text).trim().toLowerCase();
    const prev = byKey.get(k);
    const kinds = new Set((prev && prev.periodKinds) || []);
    kinds.add(a.periodKind || 'other');
    const typs = Array.from(new Set([].concat((prev && prev.uppdragTyps) || [], a.uppdragTyp ? [a.uppdragTyp] : [])));
    const periodKind = kinds.has('vat') ? 'vat' : (kinds.has('other') ? 'other' : 'unassigned');
    byKey.set(k, {
      text: a.text,
      id: a.id || riskActionId(a.text),
      periodKind,
      periodKinds: Array.from(kinds),
      uppdragTyps: typs,
    });
  });
  (catalog || []).forEach((text) => {
    const t = String(text || '').trim();
    if (!t) return;
    const k = t.toLowerCase();
    if (byKey.has(k)) return;
    byKey.set(k, {
      text: t,
      id: riskActionId(t),
      periodKind: 'unassigned',
      periodKinds: [],
      uppdragTyps: [],
    });
  });
  return Array.from(byKey.values()).map((row) => ({
    text: row.text,
    id: row.id,
    periodKind: row.periodKind,
    uppdragTyps: row.uppdragTyps,
  }));
}

function extractOwnershipFromKyc(kyc) {
  const markers = [];
  const seen = new Set();
  const add = (name) => {
    const n = String(name || '').trim();
    if (!n || n.length < 2) return;
    const k = n.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    markers.push(n);
  };
  if (!kyc || typeof kyc !== 'object') return markers;
  if (kyc.huvudmanInfo) add(kyc.huvudmanInfo);
  if (Array.isArray(kyc.huvudman)) {
    kyc.huvudman.forEach((p) => add(typeof p === 'string' ? p : p && (p.namn || p.name)));
  }
  if (Array.isArray(kyc.foretradare)) {
    kyc.foretradare.forEach((p) => add(typeof p === 'string' ? p : p && (p.namn || p.name)));
  }
  return markers;
}

function extractOwnershipFromKontakt(persons) {
  const markers = [];
  const seen = new Set();
  (Array.isArray(persons) ? persons : []).forEach((p) => {
    const name = String((p && (p.namn || p.name)) || '').trim();
    if (!name) return;
    const roller = Array.isArray(p.roller) ? p.roller : (p.roll ? [p.roll] : []);
    const isUbo = roller.some((r) => /verklig huvudman|ägare|delägare|owner|ubo/i.test(String(r)));
    if (!isUbo) return;
    const k = name.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    markers.push(name);
  });
  return markers;
}

/**
 * Mappar KUNDDATA-fält → Minibok aml-risk payload.
 * @param {object} record Airtable record
 * @param {{ riskAtgarderAktiverade?: boolean, riskActionsAssigned?: { text: string, periodKind?: string, uppdragTyp?: string }[] }} [extra]
 */
function mapCustomerAmlRisk(record, extra) {
  const f = (record && record.fields) || {};
  const kyc = parseJsonField(f['KYC-formular (JSON)'] || f['KYC-formular'], {});
  const persons = (() => {
    const raw = f.Kontaktpersoner || '';
    if (!raw) return [];
    const s = String(raw).trim();
    if (s.startsWith('[')) return parseJsonField(s, []);
    return [];
  })();

  const riskRaw = firstFieldStr(f, [
    'Riskniva',
    'Risknivå',
    'sammanlagd risk',
    'Sammanlagd riskklass',
    'Riskklass',
    'Sammantagen risk',
    'AML-risk',
  ]);
  const overallRisk = mapOverallRisk(riskRaw);
  const assessedAt = firstFieldStr(f, ['Riskbedömning utförd datum', 'Riskbedomning utford datum']) || null;
  const approvedAt = firstFieldStr(f, ['Kundens riskbedömning godkänd', 'Kundens riskbedomning godkand']) || null;
  const expectedTurnoverRange =
    fieldStr(f, 'Omsättning') ||
    (kyc && kyc.omsattning ? String(kyc.omsattning).trim() : '') ||
    null;

  const ownershipMarkers = []
    .concat(extractOwnershipFromKontakt(persons))
    .concat(extractOwnershipFromKyc(kyc));
  const vh = firstFieldStr(f, ['Verklig huvudman', 'Ägare EF', 'Agare EF', 'Ägare']);
  if (vh && !ownershipMarkers.some((m) => m.toLowerCase() === vh.toLowerCase())) {
    ownershipMarkers.push(vh);
  }
  const form = fieldStr(f, 'Bolagsform');
  if (!ownershipMarkers.length && /enskild|\bef\b|e\.f/i.test(form)) {
    const namn = firstFieldStr(f, ['Namn', 'Företagsnamn', 'Kundnamn']);
    if (namn) ownershipMarkers.push(namn);
  }

  const pepInfo = pepFromFields(f, kyc);
  const measures = firstFieldStr(f, ['Atgarder riskbedomning', 'Åtgärder riskbedömning']);
  const hotspots = measures
    ? measures.split(/\n|;/).map((s) => s.trim()).filter(Boolean).slice(0, 20)
    : [];

  const rationale =
    firstFieldStr(f, ['Byrans riskbedomning', 'Byråns riskbedömning', 'Motivering']) ||
    '';

  const industryCodes = parseSniCodes(
    firstFieldStr(f, ['SNI kod', 'SNI-koder', 'SNI-kod', 'SNI-bransch', 'Bransch', 'Högrisk SNI match']) ||
      (kyc && (kyc.sniKoder || kyc.sniCodes)) ||
      ''
  );
  const internationalTrade = parseInternationalTrade(f, kyc);
  const businessSummary = pickLongestPlain([
    { key: 'Ytterligare beskrivning av kunden och verksamheten', text: fieldStr(f, 'Ytterligare beskrivning av kunden och verksamheten') },
    { key: 'Affärsmodell', text: fieldStr(f, 'Affärsmodell') },
    { key: 'Verksamhet', text: fieldStr(f, 'Verksamhet') },
    { key: 'Beskrivning av kunden', text: fieldStr(f, 'Beskrivning av kunden') },
    { key: 'verksamhet', text: kyc && kyc.verksamhet ? String(kyc.verksamhet).trim() : '' },
    { key: 'Verksamhetsbeskrivning', text: firstFieldStr(f, ['Verksamhetsbeskrivning']) },
  ]);

  const extraRisks = Array.isArray(extra && extra.linkedRiskFactors) ? extra.linkedRiskFactors : [];
  const riskRaisingFactors = []
    .concat(fieldChips(f, [
      'Kunden verkar i en högriskbransch',
      'Riskhöjande faktorer tjänster',
      'Riskhöjande faktorer övrigt',
      'Risker från KYC',
    ]))
    .concat(extraRisks);

  const extraBehoriga = Array.isArray(extra && extra.behoriga) ? extra.behoriga : [];
  const extraNotes = Array.isArray(extra && extra.clientflowNotes) ? extra.clientflowNotes : [];

  return {
    orgNr: String(f.Orgnr || f.orgnr || '').replace(/\D/g, '').slice(-10) || null,
    customerId: record.id,
    assessedAt,
    approvedAt,
    validUntil: null,
    overallRisk,
    overallRiskRaw: riskRaw || null,
    expectedTurnoverRange,
    riskAtgarderAktiverade: !!(extra && extra.riskAtgarderAktiverade),
    pep: !!pepInfo.pep,
    pepRaw: pepInfo.pepRaw,
    sanctionsHit: Number(fieldStr(f, 'Antal träffar PEP och sanktionslistor') || 0) > 0,
    sanctionsHitCount: Number(fieldStr(f, 'Antal träffar PEP och sanktionslistor') || 0) || 0,
    industryCodes,
    sniCodes: industryCodes.slice(),
    businessSummary,
    customerDescription: htmlToPlainText(firstFieldStr(f, ['Beskrivning av kunden']) || ''),
    bolagsverketSummary: firstFieldStr(f, ['Verksamhetsbeskrivning']) || '',
    ownershipSummary: vh || (ownershipMarkers.length ? ownershipMarkers.join(', ') : ''),
    ownershipMarkers,
    ubo: ownershipMarkers.map((name) => ({ name })),
    internationalTrade,
    hotspots,
    requiredActions: hotspots.slice(),
    riskActions: mergeRiskActions(hotspots, extra && extra.riskActionsAssigned),
    riskReducingMeasures: firstFieldStr(f, ['Risksänkande åtgjärder', 'Risksänkande åtgärder']) || '',
    riskReducingFactors: fieldChips(f, ['Risksänkande faktorer', 'KYC genomgången - Risksänkande faktorer']),
    riskRaisingFactors,
    riskFactorComment: firstFieldStr(f, [
      'Kommentar till riskfaktorerna ovan',
      'KYC genomgången - Kommentar riskfaktorer',
    ]) || '',
    rationale,
    klientansvarig: String((extra && extra.klientansvarig) || fieldStr(f, 'Klientansvarig') || '').trim(),
    behoriga: extraBehoriga,
    clientflowNotes: extraNotes,
    kycStatus: firstFieldStr(f, ['KYC UTFÖRD DATUM', 'Flik klar - KYC-formulär']) ? 'done' : 'unknown',
    kycDoneAt: firstFieldStr(f, ['KYC UTFÖRD DATUM', 'Flik klar - KYC-formulär']) || null,
    document: null,
  };
}

function mapAgencyAmlRisk(record) {
  const f = (record && record.fields) || {};
  const sections = {};
  ALLMAN_RISK_FIELDS.forEach((key) => {
    const v = fieldStr(f, key);
    if (v) sections[key.trim()] = v;
  });
  const summary =
    fieldStr(f, '8. Värdering av sammantagen risk') ||
    fieldStr(f, '5. Värdering av sammantagen risk') ||
    '';
  const overallRisk = mapOverallRisk(summary) || mapOverallRisk(fieldStr(f, 'Sammantagen risk'));
  const focusAreas = extractFocusAreas(f);
  return {
    byraRecordId: record.id,
    assessedAt: fieldStr(f, 'Uppdaterad datum') || null,
    overallRisk,
    focusAreas,
    geoHighRiskList: extractGeoHighRiskList(f),
    customerSegments: [],
    summary,
    sections,
    document: null,
  };
}

function mapAgencyAmlPolicy(record) {
  const f = (record && record.fields) || {};
  const sections = {};
  const rules = [];
  POLICY_FIELDS.forEach(({ key, ruleId }) => {
    const v = fieldStr(f, key);
    if (!v) return;
    sections[key.trim()] = v;
    // Exponera som rules[] — Minibok policy_match kräver match-objekt för auto-träff;
    // här ger vi label + id så byrån kan komplettera match senare.
    rules.push({
      id: ruleId,
      label: key.trim(),
      // Ingen automatisk match utan explicit match — okänt ≠ träff
    });
  });

  // Inbyggda deterministiska policyregler som speglar vanliga AML-rutiner
  // (kan överstyras/utökas av Minibok agencyPolicy).
  const builtin = [
    {
      id: 'cash_text',
      label: 'Kontantmönster i beskrivning',
      match: { textIncludes: 'kontant' },
    },
  ];
  builtin.forEach((b) => {
    if (!rules.some((r) => r.id === b.id)) rules.push(b);
  });

  const summaryParts = POLICY_FIELDS
    .map(({ key }) => fieldStr(f, key))
    .filter(Boolean);
  const revised = fieldStr(f, 'Policydokumentet reviderat och godkänt');
  try {
    const Riskaptit = require('./riskaptit');
    sections['9. Riskaptit'] = Riskaptit.policyText(fieldStr(f, '9. Riskaptit'));
  } catch (_) { /* policytext är kodad i ClientFlow och valfri i Minibok-export */ }

  return {
    byraRecordId: record.id,
    version: revised || 'airtable',
    updatedAt: fieldStr(f, 'Uppdaterad datum') || revised || null,
    title: 'AML-rutiner / policy (Byråer)',
    summaryMarkdown: summaryParts.slice(0, 3).join('\n\n').slice(0, 8000),
    rules,
    sections,
    focusAreas: extractFocusAreas(f),
    geoHighRiskList: extractGeoHighRiskList(f),
    document: null,
  };
}

function createMinibokAml({
  authenticateMinibokApi,
  resolveUserEmail,
  resolveMinibokUser,
  findCompanyForUser,
  getAirtableUser,
}) {
  const airtableBaseId = () => process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
  const airtableToken = () => process.env.AIRTABLE_ACCESS_TOKEN;
  const kunddataTableRef = () =>
    process.env.AIRTABLE_TABLE_KUNDDATA_ID ||
    process.env.AIRTABLE_KUNDDATA_TABLE_ID ||
    KUNDDATA_TABLE_DEFAULT;
  const byraerTableRef = () =>
    process.env.BYRAER_TABLE_ID || encodeURIComponent(BYRAER_TABLE_DEFAULT);
  const uppdragTableRef = () =>
    process.env.AIRTABLE_TABLE_UPPDRAG_ID || encodeURIComponent(UPPDRAG_TABLE_NAME);

  async function resolveUser(req) {
    const email = resolveUserEmail(req);
    if (!email) return { error: 'userEmail krävs (header X-User-Email, query eller body)', status: 400 };
    const user = resolveMinibokUser
      ? await resolveMinibokUser(email)
      : await getAirtableUser(email);
    if (!user?.id && !user?.byraId) {
      return { error: `Ingen Clientflow-användare för ${email}`, status: 404 };
    }
    const byraId = user?.byraId ? String(user.byraId).replace(/,/g, '').trim() : '';
    if (!byraId) {
      return { error: `Användaren ${email} saknar Byrå ID i Clientflow`, status: 400 };
    }
    return { email, user, byraId };
  }

  function byraFilterFormula(byraId) {
    const num = parseInt(byraId, 10);
    return Number.isNaN(num)
      ? `{Byrå ID}="${escAirtable(byraId)}"`
      : `OR({Byrå ID}="${escAirtable(byraId)}",{Byrå ID}=${num})`;
  }

  async function fetchKunddataById(recordId) {
    const token = airtableToken();
    if (!token) throw Object.assign(new Error('Airtable token saknas'), { status: 500 });
    const axios = getAxios();
    const url = `https://api.airtable.com/v0/${airtableBaseId()}/${kunddataTableRef()}/${encodeURIComponent(recordId)}`;
    const res = await axios.get(url, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 15000,
    });
    return res.data;
  }

  async function fetchByraerRecord(byraId) {
    const token = airtableToken();
    if (!token) throw Object.assign(new Error('Airtable token saknas'), { status: 500 });
    const axios = getAxios();
    const formula = byraFilterFormula(byraId);
    const url = `https://api.airtable.com/v0/${airtableBaseId()}/${byraerTableRef()}?filterByFormula=${encodeURIComponent(formula)}&maxRecords=1`;
    const res = await axios.get(url, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 15000,
    });
    return (res.data.records && res.data.records[0]) || null;
  }

  function recordBelongsToByra(fields, byraId) {
    const recByra = fields && fields['Byrå ID'] != null
      ? String(fields['Byrå ID']).replace(/,/g, '').trim()
      : '';
    if (!recByra || !byraId) return false;
    return recByra === String(byraId) || String(byraId).endsWith(recByra) || recByra.endsWith(String(byraId));
  }

  async function fetchRiskAtgarderFromUppdrag(customerId, byraId) {
    const empty = { riskAtgarderAktiverade: false, riskActionsAssigned: [] };
    const token = airtableToken();
    if (!token || !customerId) return empty;
    try {
      const axios = getAxios();
      const formula = `AND({Kund ID}="${escAirtable(customerId)}",${byraFilterFormula(byraId)})`;
      const url = `https://api.airtable.com/v0/${airtableBaseId()}/${uppdragTableRef()}?filterByFormula=${encodeURIComponent(formula)}&maxRecords=50`;
      const res = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 15000,
      });
      const records = res.data.records || [];
      const riskActionsAssigned = [];
      records.forEach((r) => {
        const f = (r && r.fields) || {};
        const typ = String(f.Typ || '').trim();
        const kind = periodKindForUppdragTyp(typ);
        parseActionLines(f['Riskåtgärder valda']).forEach((text) => {
          riskActionsAssigned.push({
            text,
            periodKind: kind,
            uppdragTyp: typ,
            id: riskActionId(text),
          });
        });
      });
      return {
        riskAtgarderAktiverade: records.some((r) =>
          truthyCheckbox(r.fields && r.fields['Riskåtgärder aktiverade'])
        ),
        riskActionsAssigned,
      };
    } catch (err) {
      console.warn('⚠️ minibok-aml: kunde inte läsa Riskåtgärder från uppdrag:', err.message);
      return empty;
    }
  }

  async function resolveApplicationUsers(ids) {
    const unique = Array.from(new Set((ids || []).map((id) => String(id || '').trim()).filter(Boolean)));
    if (!unique.length) return [];
    const token = airtableToken();
    if (!token) return unique.map((id) => ({ id, name: id, email: '' }));
    try {
      const axios = getAxios();
      const parts = unique.map((id) => `RECORD_ID()="${escAirtable(id)}"`).join(',');
      const url = `https://api.airtable.com/v0/${airtableBaseId()}/${encodeURIComponent('Application Users')}`;
      const res = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` },
        params: { filterByFormula: `OR(${parts})`, maxRecords: 50 },
        timeout: 15000,
      });
      const byId = new Map();
      (res.data.records || []).forEach((r) => {
        const f = (r && r.fields) || {};
        byId.set(r.id, {
          id: r.id,
          name: String(f['Full Name'] || f.Namn || f.Email || '').trim(),
          email: String(f.Email || '').trim(),
        });
      });
      return unique.map((id) => byId.get(id) || { id, name: id, email: '' });
    } catch (err) {
      console.warn('⚠️ minibok-aml: kunde inte slå upp behöriga användare:', err.message);
      return unique.map((id) => ({ id, name: id, email: '' }));
    }
  }

  async function fetchLinkedCustomerRisks(record) {
    const f = (record && record.fields) || {};
    const ids = parseLinkedIds(
      f['risker kopplat till tjänster'] || f['LINKED: Risker kopplad till tjänster']
    ).filter((id) => /^rec[A-Za-z0-9]+$/.test(id));
    if (!ids.length) return [];
    const token = airtableToken();
    if (!token) return [];
    const table = process.env.AIRTABLE_TABLE_RISKER_KUND_ID || 'tblWw6tM2YOTYFn2H';
    try {
      const axios = getAxios();
      const parts = ids.slice(0, 40).map((id) => `RECORD_ID()="${escAirtable(id)}"`).join(',');
      const res = await axios.get(
        `https://api.airtable.com/v0/${airtableBaseId()}/${encodeURIComponent(table)}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          params: { filterByFormula: `OR(${parts})`, maxRecords: 40 },
          timeout: 15000,
        }
      );
      const names = [];
      const seen = new Set();
      (res.data.records || []).forEach((r) => {
        const rf = (r && r.fields) || {};
        const namn = String(rf.Riskfaktor || rf.Namn || rf.Name || '').trim();
        const typ = String(rf['Typ av riskfaktor'] || '').trim();
        const niva = String(rf.Riskbedömning || rf.Riskniva || '').trim();
        if (!namn) return;
        const label = namn + (typ ? ` [${typ}]` : '') + (niva ? ` — ${niva}` : '');
        const k = label.toLowerCase();
        if (seen.has(k)) return;
        seen.add(k);
        names.push(label);
      });
      return names;
    } catch (err) {
      console.warn('⚠️ minibok-aml: kunde inte läsa länkade kundrisker:', err.message);
      return [];
    }
  }

  async function fetchCustomerNotes(record) {
    const empty = [];
    const token = airtableToken();
    const f = (record && record.fields) || {};
    const orgNr = String(f.Orgnr || f.orgnr || '').trim();
    const byraId = f['Byrå ID'] != null ? String(f['Byrå ID']).replace(/,/g, '').trim() : '';
    if (!token || (!orgNr && !record.id)) return empty;
    const notesTable = process.env.AIRTABLE_TABLE_NOTES_ID || 'tblXswCwopx7l02Mu';
    const orgVariants = Array.from(new Set([
      orgNr,
      orgNr.replace(/\D/g, ''),
      orgNr.replace(/\D/g, '').replace(/^(\d{6})(\d{4})$/, '$1-$2'),
    ].filter(Boolean)));
    const formulas = [];
    if (byraId && orgVariants.length) {
      orgVariants.forEach((org) => {
        formulas.push(`AND({Byrå ID}="${escAirtable(byraId)}",{Orgnr}="${escAirtable(org)}")`);
      });
    } else if (orgVariants.length) {
      orgVariants.forEach((org) => formulas.push(`{Orgnr}="${escAirtable(org)}"`));
    }
    const kundnamn = String(f.Namn || f.Kundnamn || f.Företagsnamn || '').trim();
    if (kundnamn) formulas.push(`{Företagsnamn}="${escAirtable(kundnamn)}"`);
    formulas.push(`{Kund ID}="${escAirtable(record.id)}"`);
    const axios = getAxios();
    for (const formula of formulas) {
      try {
        const url = `https://api.airtable.com/v0/${airtableBaseId()}/${encodeURIComponent(notesTable)}`;
        // eslint-disable-next-line no-await-in-loop
        const res = await axios.get(url, {
          headers: { Authorization: `Bearer ${token}` },
          params: { filterByFormula: formula, maxRecords: 50 },
          timeout: 15000,
        });
        const rows = (res.data.records || []).map((r) => {
          const nf = (r && r.fields) || {};
          const typ = nf['Typ av anteckning'];
          return {
            id: r.id,
            type: Array.isArray(typ) ? typ.join(', ') : String(typ || 'Anteckning').trim(),
            date: String(nf.Datum || nf.Date || '').trim(),
            text: String(nf.Notes || nf.Anteckning || nf.Text || '').trim(),
          };
        }).filter((n) => n.text || n.date);
        if (rows.length) return rows.slice(0, 30);
      } catch (err) {
        const msg = err.response?.data?.error?.message || err.message || '';
        if (!/Unknown field|INVALID_FILTER|422|404/i.test(String(msg))) {
          console.warn('⚠️ minibok-aml: kunde inte läsa Clientflow-anteckningar:', msg);
          return empty;
        }
      }
    }
    return empty;
  }

  async function buildCustomerPayload(record, byraId) {
    const extra = await fetchRiskAtgarderFromUppdrag(record.id, byraId);
    const f = (record && record.fields) || {};
    const [behoriga, clientflowNotes, linkedRiskFactors] = await Promise.all([
      resolveApplicationUsers(parseLinkedIds(
        f.Användare || f.Anvandare || f['Behöriga'] || f.Behoriga || f['Behöriga användare']
      )),
      fetchCustomerNotes(record),
      fetchLinkedCustomerRisks(record),
    ]);
    return mapCustomerAmlRisk(record, {
      ...extra,
      klientansvarig: fieldStr(f, 'Klientansvarig'),
      behoriga,
      clientflowNotes,
      linkedRiskFactors,
    });
  }

  function registerRoutes(app) {
    app.get('/api/v1/aml/meta', authenticateMinibokApi, async (_req, res) => {
      return res.json({
        endpoints: [
          'GET /api/v1/companies/:clientflowId/aml-risk',
          'GET /api/v1/companies/aml-risk?orgNr=',
          'GET /api/v1/agency/aml-risk',
          'GET /api/v1/agency/aml-policy',
        ],
        airtable: {
          kunddata: 'KUNDDATA',
          byraer: 'Byråer',
          uppdrag: 'Uppdrag (Riskåtgärder aktiverade)',
        },
        notes: [
          'clientflowId = Airtable KUNDDATA record id (rec…)',
          'overallRisk mappas Låg/Normal/Förhöjd/Hög/Oacceptabel (Medel→normal, Lag→low, Hog→high)',
          'expectedTurnoverRange från fältet Omsättning',
          'riskActions[].periodKind: vat=Momsredovisning, other=övriga uppdrag, unassigned=ej kopplad',
          'policy.rules utan match-objekt ger ingen auto-träff i Minibok',
        ],
      });
    });

    // Alt. lookup via orgNr (måste registreras före :clientflowId)
    app.get('/api/v1/companies/aml-risk', authenticateMinibokApi, async (req, res) => {
      try {
        const resolved = await resolveUser(req);
        if (resolved.error) return res.status(resolved.status).json({ error: resolved.error });
        const orgNr = String(req.query.orgNr || req.query.orgnr || '').trim();
        const name = String(req.query.name || req.query.customerName || '').trim();
        if (!orgNr) {
          return res.status(400).json({ error: 'orgNr eller path /companies/:clientflowId/aml-risk krävs' });
        }
        if (!findCompanyForUser) {
          return res.status(500).json({ error: 'findCompanyForUser saknas' });
        }
        const { record } = await findCompanyForUser(orgNr, resolved.email, { name });
        if (!record) {
          return res.status(404).json({ error: 'Kund hittades inte för orgNr / användare', orgNr });
        }
        const payload = await buildCustomerPayload(record, resolved.byraId);
        return res.json(payload);
      } catch (err) {
        console.error('❌ GET /api/v1/companies/aml-risk:', err.response?.data || err.message);
        const status = err.status || err.response?.status || 500;
        return res.status(status).json({
          error: err.response?.data?.error?.message || err.message || 'Serverfel',
        });
      }
    });

    app.get('/api/v1/companies/:clientflowId/aml-risk', authenticateMinibokApi, async (req, res) => {
      try {
        const resolved = await resolveUser(req);
        if (resolved.error) return res.status(resolved.status).json({ error: resolved.error });
        const clientflowId = String(req.params.clientflowId || '').trim();
        if (!clientflowId || clientflowId === 'aml-risk') {
          return res.status(400).json({ error: 'clientflowId krävs' });
        }
        const record = await fetchKunddataById(clientflowId);
        if (!record || !record.id) {
          return res.status(404).json({ error: 'Kund hittades inte', clientflowId });
        }
        if (!recordBelongsToByra(record.fields, resolved.byraId)) {
          return res.status(403).json({ error: 'Kunden tillhör inte användarens byrå' });
        }
        const payload = await buildCustomerPayload(record, resolved.byraId);
        return res.json(payload);
      } catch (err) {
        console.error('❌ GET /api/v1/companies/:id/aml-risk:', err.response?.data || err.message);
        const status = err.response?.status === 404 ? 404 : (err.status || err.response?.status || 500);
        return res.status(status).json({
          error: err.response?.data?.error?.message || err.message || 'Serverfel',
        });
      }
    });

    app.get('/api/v1/agency/aml-risk', authenticateMinibokApi, async (req, res) => {
      try {
        const resolved = await resolveUser(req);
        if (resolved.error) return res.status(resolved.status).json({ error: resolved.error });
        const record = await fetchByraerRecord(resolved.byraId);
        if (!record) {
          return res.status(404).json({
            error: 'Ingen Byråer-post hittades för er byrå',
            byraId: resolved.byraId,
          });
        }
        return res.json(mapAgencyAmlRisk(record));
      } catch (err) {
        console.error('❌ GET /api/v1/agency/aml-risk:', err.response?.data || err.message);
        const status = err.status || err.response?.status || 500;
        return res.status(status).json({
          error: err.response?.data?.error?.message || err.message || 'Serverfel',
        });
      }
    });

    app.get('/api/v1/agency/aml-policy', authenticateMinibokApi, async (req, res) => {
      try {
        const resolved = await resolveUser(req);
        if (resolved.error) return res.status(resolved.status).json({ error: resolved.error });
        const record = await fetchByraerRecord(resolved.byraId);
        if (!record) {
          return res.status(404).json({
            error: 'Ingen Byråer-post hittades för er byrå',
            byraId: resolved.byraId,
          });
        }
        return res.json(mapAgencyAmlPolicy(record));
      } catch (err) {
        console.error('❌ GET /api/v1/agency/aml-policy:', err.response?.data || err.message);
        const status = err.status || err.response?.status || 500;
        return res.status(status).json({
          error: err.response?.data?.error?.message || err.message || 'Serverfel',
        });
      }
    });
  }

  return {
    registerRoutes,
    mapCustomerAmlRisk,
    mapAgencyAmlRisk,
    mapAgencyAmlPolicy,
    mapOverallRisk,
  };
}

module.exports = {
  createMinibokAml,
  mapCustomerAmlRisk,
  mapAgencyAmlRisk,
  mapAgencyAmlPolicy,
  mapOverallRisk,
  parseSniCodes,
  parseInternationalTrade,
  parseChipList,
  parseLinkedIds,
  htmlToPlainText,
  fieldStr,
  airtableCellStr,
  normalizeFieldKey,
  ALLMAN_RISK_FIELDS,
  POLICY_FIELDS,
};
