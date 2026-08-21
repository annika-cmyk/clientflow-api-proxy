/**
 * Register över företrädare och verkliga huvudmän.
 * Sök på personnummer eller organisationsnummer över alla kunder,
 * inklusive dolda och avslutade, plus sparad personhistorik.
 */

const kundDold = require('./kund-dold');

const PERSONHISTORIK_FIELD = 'Personhistorik';
const DEFAULT_YEARS = 5;
const MIN_QUERY_DIGITS = 6;

const FORETRADARE_ROLES = new Set([
  'Styrelseledamot',
  'Styrelseordförande',
  'VD',
  'Firmatecknare',
  'Ägare EF',
  'Suppleant',
  'Ombud'
]);

const HUVUDMAN_ROLES = new Set([
  'Verklig huvudman',
  'Delägare',
  'Företag med ägarandelar',
  'Ägare EF'
]);

function parseJsonMaybe(raw, fallback) {
  if (Array.isArray(raw) || (raw && typeof raw === 'object' && !Array.isArray(raw) && raw !== fallback)) {
    if (typeof raw === 'object' && !Array.isArray(raw) && fallback && Array.isArray(fallback)) return fallback;
  }
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object') return raw;
  const s = String(raw == null ? '' : raw).trim();
  if (!s) return fallback;
  try {
    return JSON.parse(s);
  } catch (_) {
    return fallback;
  }
}

function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '');
}

function normalizeIdentity(value) {
  let digits = digitsOnly(value);
  if (!digits) return '';
  if (digits.length === 12 && digits.startsWith('16')) digits = digits.slice(2);
  if (digits.length > 12) digits = digits.slice(-12);
  return digits;
}

function identitiesMatch(a, b) {
  const x = normalizeIdentity(a);
  const y = normalizeIdentity(b);
  if (!x || !y) return false;
  if (x === y) return true;
  if (x.length >= 10 && y.length >= 10 && x.slice(-10) === y.slice(-10)) return true;
  if (x.length === 12 && y.length === 10 && x.slice(2) === y) return true;
  if (y.length === 12 && x.length === 10 && y.slice(2) === x) return true;
  return false;
}

function classifyQuery(query) {
  const digits = normalizeIdentity(query);
  if (digits.length < MIN_QUERY_DIGITS) return { ok: false, error: 'Ange minst 6 siffror i personnummer eller organisationsnummer.' };
  const type = digits.length === 10 || digits.length === 12 ? (digits.length === 12 ? 'personnummer' : 'identitet') : 'identitet';
  return { ok: true, digits, type };
}

function classifyRoles(roller) {
  const list = Array.isArray(roller) ? roller.map((r) => String(r || '').trim()).filter(Boolean) : [];
  const kinds = [];
  if (list.some((r) => FORETRADARE_ROLES.has(r))) kinds.push('foretradare');
  if (list.some((r) => HUVUDMAN_ROLES.has(r))) kinds.push('huvudman');
  return { roller: list, kinds };
}

function extractIdsFromText(text) {
  const s = String(text || '');
  const found = [];
  const re = /\b(\d{6,8}[- ]?\d{4})\b/g;
  let m;
  while ((m = re.exec(s))) {
    const id = normalizeIdentity(m[1]);
    if (id.length >= 10) found.push(id);
  }
  return [...new Set(found)];
}

function pushPerson(list, person) {
  const namn = String(person.namn || '').trim();
  const personnr = normalizeIdentity(person.personnr);
  if (!namn && !personnr) return;
  const { roller, kinds } = classifyRoles(person.roller);
  let nextKinds = kinds.slice();
  if (person.kind === 'foretradare' && !nextKinds.includes('foretradare')) nextKinds.push('foretradare');
  if (person.kind === 'huvudman' && !nextKinds.includes('huvudman')) nextKinds.push('huvudman');
  if (!nextKinds.length && person.kind) nextKinds.push(person.kind);
  list.push({
    namn: namn || 'Namn saknas',
    personnr,
    roller,
    kinds: nextKinds,
    source: person.source || 'kontaktpersoner',
    current: person.current !== false,
    firstSeen: person.firstSeen || '',
    lastSeen: person.lastSeen || '',
    removedAt: person.removedAt || ''
  });
}

function parseKontaktPersoner(fields) {
  const raw = fields?.Kontaktpersoner || fields?.Befattningshavare || '';
  const s = String(raw || '').trim();
  if (!s) return [];
  if (s.startsWith('[')) {
    const parsed = parseJsonMaybe(s, []);
    return Array.isArray(parsed) ? parsed : [];
  }
  return s.split('\n').map((row) => row.trim()).filter(Boolean).map((row) => {
    const match = row.match(/^(.+?)\s*\((.+)\)$/);
    return {
      namn: match ? match[1].trim() : row,
      roller: match ? [match[2].trim()] : [],
      personnr: ''
    };
  });
}

function extractPeopleFromFields(fields) {
  const f = fields || {};
  const people = [];

  parseKontaktPersoner(f).forEach((p) => {
    pushPerson(people, {
      namn: p.namn || p.name,
      personnr: p.personnr || p.personnummer || p.id,
      roller: p.roller || (p.roll ? [p.roll] : []),
      source: 'kontaktpersoner',
      current: true
    });
  });

  const historik = parseJsonMaybe(f[PERSONHISTORIK_FIELD], []);
  if (Array.isArray(historik)) {
    historik.forEach((p) => {
      pushPerson(people, {
        namn: p.namn || p.name,
        personnr: p.personnr || p.personnummer,
        roller: p.roller || (p.roll ? [p.roll] : []),
        source: 'historik',
        current: !p.removedAt,
        firstSeen: p.firstSeen,
        lastSeen: p.lastSeen,
        removedAt: p.removedAt
      });
    });
  }

  const kyc = parseJsonMaybe(f['KYC-formular (JSON)'] || f['KYC-formular'], {});
  const kycObj = kyc && typeof kyc === 'object' && !Array.isArray(kyc) ? kyc : {};
  const foretradare = Array.isArray(kycObj.foretradare) ? kycObj.foretradare : [];
  if (!foretradare.length && (kycObj.foretradareNamn || kycObj.foretradarePnr)) {
    foretradare.push({ namn: kycObj.foretradareNamn, personnr: kycObj.foretradarePnr });
  }
  foretradare.forEach((p) => {
    pushPerson(people, {
      namn: p.namn || p.name,
      personnr: p.personnr || p.personnummer,
      roller: p.roller || ['Firmatecknare'],
      kind: 'foretradare',
      source: 'kyc',
      current: true
    });
  });

  const huvudmanInfo = String(kycObj.huvudmanInfo || '').trim();
  if (huvudmanInfo) {
    const ids = extractIdsFromText(huvudmanInfo);
    if (ids.length) {
      ids.forEach((id) => {
        const line = huvudmanInfo.split('\n').find((row) => identitiesMatch(row, id)) || huvudmanInfo;
        const namn = String(line).replace(/\(?\d{6,8}[- ]?\d{4}\)?/g, '').replace(/\s+/g, ' ').trim();
        pushPerson(people, {
          namn: namn || 'Verklig huvudman',
          personnr: id,
          roller: ['Verklig huvudman'],
          kind: 'huvudman',
          source: 'kyc',
          current: true
        });
      });
    } else {
      pushPerson(people, {
        namn: huvudmanInfo.split('\n')[0].trim(),
        personnr: '',
        roller: ['Verklig huvudman'],
        kind: 'huvudman',
        source: 'kyc',
        current: true
      });
    }
  }

  const vhText = String(f['Verklig huvudman'] || '').trim();
  if (vhText) {
    const ids = extractIdsFromText(vhText);
    if (ids.length) {
      ids.forEach((id) => {
        pushPerson(people, {
          namn: vhText.replace(/\(?\d{6,8}[- ]?\d{4}\)?/g, '').replace(/\s+/g, ' ').trim() || 'Verklig huvudman',
          personnr: id,
          roller: ['Verklig huvudman'],
          kind: 'huvudman',
          source: 'verklig-huvudman',
          current: true
        });
      });
    }
  }

  return people;
}

function personKey(person) {
  const id = normalizeIdentity(person.personnr);
  if (id) return `id:${id.slice(-10)}`;
  return `namn:${String(person.namn || '').trim().toLowerCase()}`;
}

function mergePersonRows(rows) {
  const byKey = new Map();
  rows.forEach((row) => {
    const key = personKey(row);
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, { ...row, roller: row.roller.slice(), kinds: row.kinds.slice() });
      return;
    }
    prev.namn = prev.namn && prev.namn !== 'Namn saknas' ? prev.namn : row.namn;
    prev.personnr = prev.personnr || row.personnr;
    prev.roller = [...new Set(prev.roller.concat(row.roller))];
    prev.kinds = [...new Set(prev.kinds.concat(row.kinds))];
    prev.current = prev.current || row.current;
    prev.firstSeen = [prev.firstSeen, row.firstSeen].filter(Boolean).sort()[0] || '';
    prev.lastSeen = [prev.lastSeen, row.lastSeen].filter(Boolean).sort().slice(-1)[0] || '';
    if (row.removedAt && !prev.current) prev.removedAt = prev.removedAt || row.removedAt;
    if (prev.current) prev.removedAt = '';
  });
  return [...byKey.values()];
}

function mergePersonhistorik(existingRaw, currentPeople, nowIso = new Date().toISOString()) {
  const existing = Array.isArray(parseJsonMaybe(existingRaw, [])) ? parseJsonMaybe(existingRaw, []) : [];
  const current = (currentPeople || []).map((p) => ({
    namn: String(p.namn || p.name || '').trim(),
    personnr: normalizeIdentity(p.personnr || p.personnummer || p.id),
    roller: classifyRoles(p.roller || (p.roll ? [p.roll] : [])).roller
  })).filter((p) => p.namn || p.personnr);

  const next = existing.map((row) => ({
    namn: row.namn || '',
    personnr: normalizeIdentity(row.personnr),
    roller: Array.isArray(row.roller) ? row.roller.slice() : [],
    firstSeen: row.firstSeen || nowIso,
    lastSeen: row.lastSeen || row.firstSeen || nowIso,
    removedAt: row.removedAt || ''
  }));

  current.forEach((person) => {
    const hit = next.find((row) => (
      (person.personnr && identitiesMatch(row.personnr, person.personnr))
      || (!person.personnr && !row.personnr && String(row.namn || '').toLowerCase() === person.namn.toLowerCase())
    ));
    if (hit) {
      hit.namn = person.namn || hit.namn;
      hit.personnr = person.personnr || hit.personnr;
      hit.roller = [...new Set(hit.roller.concat(person.roller))];
      hit.lastSeen = nowIso;
      hit.removedAt = '';
    } else {
      next.push({
        namn: person.namn,
        personnr: person.personnr,
        roller: person.roller.slice(),
        firstSeen: nowIso,
        lastSeen: nowIso,
        removedAt: ''
      });
    }
  });

  next.forEach((row) => {
    const stillThere = current.some((person) => (
      (person.personnr && identitiesMatch(row.personnr, person.personnr))
      || (!person.personnr && !row.personnr && String(row.namn || '').toLowerCase() === String(person.namn || '').toLowerCase())
    ));
    if (!stillThere && !row.removedAt) row.removedAt = nowIso;
  });

  return next;
}

function parseIsoDate(value) {
  const s = String(value || '').trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function uppdragOverlapsWindow(uppdrag, years = DEFAULT_YEARS, now = new Date()) {
  const windowStart = new Date(now);
  windowStart.setFullYear(windowStart.getFullYear() - years);
  const start = parseIsoDate(uppdrag.startdatum) || parseIsoDate(uppdrag.createdTime);
  const end = parseIsoDate(uppdrag.avslutas) || (start ? now : parseIsoDate(uppdrag.senastUtford) || now);
  if (!start && !uppdrag.senastUtford && !uppdrag.avslutas && !uppdrag.createdTime) return true;
  const from = start || windowStart;
  const to = end || now;
  return to >= windowStart && from <= now;
}

function mapUppdragRecord(record) {
  const f = (record && record.fields) || {};
  return {
    id: record.id || '',
    kundId: String(f['Kund ID'] || '').trim(),
    typ: f.Typ || '',
    namn: f.Namn || f.Typ || 'Uppdrag',
    status: f.Status || '',
    startdatum: f.Startdatum || '',
    avslutas: f.Avslutas || '',
    senastUtford: f['Senast utförd'] || '',
    createdTime: record.createdTime || ''
  };
}

function kindLabels(kinds) {
  const labels = [];
  if ((kinds || []).includes('foretradare')) labels.push('Företrädare');
  if ((kinds || []).includes('huvudman')) labels.push('Verklig huvudman');
  return labels;
}

function customerMeta(record) {
  const f = (record && record.fields) || {};
  return {
    kundId: record.id,
    namn: f.Namn || f['Företagsnamn'] || 'Namn saknas',
    orgnr: f.Orgnr || f.Organisationsnummer || f['Org.nr'] || '',
    kundstatus: f.Kundstatus || '',
    dold: kundDold.isKundDold(f),
    avslutad: kundDold.isAvslutadKund(f)
  };
}

function searchPersonRegister({ customers, uppdrag, query, years = DEFAULT_YEARS, now = new Date() }) {
  const parsed = classifyQuery(query);
  if (!parsed.ok) return { error: parsed.error, years, people: [] };

  const uppdragByKund = new Map();
  (uppdrag || []).forEach((raw) => {
    const item = raw.kundId ? raw : mapUppdragRecord(raw);
    if (!item.kundId) return;
    if (!uppdragOverlapsWindow(item, years, now)) return;
    if (!uppdragByKund.has(item.kundId)) uppdragByKund.set(item.kundId, []);
    uppdragByKund.get(item.kundId).push(item);
  });

  const peopleByKey = new Map();

  function addHit(person, company) {
    const relevant = person.kinds.length > 0 || person.personnr || person.source === 'historik';
    if (!relevant) return;
    const key = personKey(person);
    if (!peopleByKey.has(key)) {
      peopleByKey.set(key, {
        namn: person.namn,
        identitet: person.personnr,
        identitetTyp: person.personnr && person.personnr.length === 12 ? 'personnummer' : (person.personnr ? 'identitet' : ''),
        kopplingar: kindLabels(person.kinds),
        bolag: []
      });
    }
    const entry = peopleByKey.get(key);
    if (person.namn && entry.namn === 'Namn saknas') entry.namn = person.namn;
    kindLabels(person.kinds).forEach((label) => {
      if (!entry.kopplingar.includes(label)) entry.kopplingar.push(label);
    });
    const already = entry.bolag.find((b) => b.kundId === company.kundId);
    const uppdragList = uppdragByKund.get(company.kundId) || [];
    if (already) {
      already.roller = [...new Set(already.roller.concat(person.roller))];
      already.aktiv = already.aktiv || person.current;
      if (person.removedAt && !already.senastTrad) already.senastTrad = person.removedAt;
      return;
    }
    entry.bolag.push({
      kundId: company.kundId,
      namn: company.namn,
      orgnr: company.orgnr,
      kundstatus: company.kundstatus,
      dold: company.dold,
      avslutad: company.avslutad,
      roller: person.roller.slice(),
      kopplingar: kindLabels(person.kinds),
      aktiv: person.current,
      forstaTrad: person.firstSeen || '',
      senastTrad: person.removedAt || person.lastSeen || '',
      uppdrag: uppdragList.map((u) => ({
        id: u.id,
        typ: u.typ,
        namn: u.namn,
        status: u.status,
        startdatum: u.startdatum,
        avslutas: u.avslutas
      }))
    });
  }

  (customers || []).forEach((record) => {
    const company = customerMeta(record);
    const people = mergePersonRows(extractPeopleFromFields(record.fields || {}));
    const companyMatch = identitiesMatch(company.orgnr, parsed.digits);
    people.forEach((person) => {
      const personMatch = identitiesMatch(person.personnr, parsed.digits);
      if (personMatch || companyMatch) addHit(person, company);
    });
  });

  const people = [...peopleByKey.values()].sort((a, b) => String(a.namn).localeCompare(String(b.namn), 'sv'));
  return {
    query: String(query || '').trim(),
    queryDigits: parsed.digits,
    years,
    people,
    bolagCount: new Set(people.flatMap((p) => p.bolag.map((b) => b.kundId))).size,
    uppdragCount: people.reduce((sum, p) => sum + p.bolag.reduce((n, b) => n + b.uppdrag.length, 0), 0)
  };
}

module.exports = {
  PERSONHISTORIK_FIELD,
  DEFAULT_YEARS,
  MIN_QUERY_DIGITS,
  FORETRADARE_ROLES,
  HUVUDMAN_ROLES,
  normalizeIdentity,
  identitiesMatch,
  classifyQuery,
  classifyRoles,
  extractIdsFromText,
  parseKontaktPersoner,
  extractPeopleFromFields,
  mergePersonRows,
  mergePersonhistorik,
  uppdragOverlapsWindow,
  mapUppdragRecord,
  searchPersonRegister
};
