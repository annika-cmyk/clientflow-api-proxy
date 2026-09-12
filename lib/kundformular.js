/**
 * Kundformulär – samma formulär som kunden ska besvara (Lager C, fas 2 steg 4).
 * Neutral faktayta: ingen riskpoäng/flagga synlig för kunden.
 * Byrån kan prefilla; kunden redigerar och (senare) signerar med BankID.
 * Sparast som JSON på KUNDDATA-fältet "Kundformulär (JSON)".
 *
 * Fältmodell (3 kap 4/7/12/13 §§):
 * - Tjänster: prefill från byrå, redigerbart (reaktivt mot villkorade kontroller)
 * - Syfte, verksamhetens art, förväntad omfattning, källa till kapital, internationell koppling: självrapport
 * - VH: prefill från register, aktiv bekräftelse Ja/Osäker/Nej (+ ägarstruktur vid komplexitet)
 * - Ombud: separat om annan än VH
 * - Skärpta åtgärder: djupare källa till specifika tillgångar
 */

const FIELD = 'Kundformulär (JSON)';
const VERSION = 2;

const STATUSES = ['utkast', 'prefillad', 'skickat', 'besvarat', 'signerat'];

const STATUS_LABELS = {
  utkast: 'Utkast',
  prefillad: 'Prefillat av byrån',
  skickat: 'Skickat till kund',
  besvarat: 'Besvarat av kund',
  signerat: 'Signerat (BankID)'
};

/** Datakälla per fält – badge i UI, styr inte sidindelning. */
const FIELD_SOURCES = {
  foretagsnamn: 'hamtas',
  orgnr: 'hamtas',
  tjanster: 'byra',
  syfte_affarsrelation: 'sjalvrapport',
  verksamhet: 'sjalvrapport',
  forvantad_omfattning: 'sjalvrapport',
  kapitalUrsprung: 'sjalvrapport',
  kapitalUrsprungSkarpt: 'sjalvrapport',
  internationellHandel: 'sjalvrapport',
  internationellaLander: 'sjalvrapport',
  huvudman: 'hamtas',
  vh_bekraftelse: 'sjalvrapport',
  vh_agarstruktur: 'sjalvrapport',
  ombud_annan: 'sjalvrapport',
  ombud: 'sjalvrapport',
  foretradare: 'hamtas',
  kontanter: 'sjalvrapport',
  kontanterAndel: 'sjalvrapport',
  kryptovaluta: 'sjalvrapport',
  pep: 'sjalvrapport',
  pepDetaljer: 'sjalvrapport',
  pepFamilj: 'sjalvrapport',
  pepFamiljDetaljer: 'sjalvrapport',
  anstallda: 'sjalvrapport',
  omsattning: 'sjalvrapport',
  villkorade_svar: 'sjalvrapport',
  bekraftelse: 'sjalvrapport'
};

const FIELD_SOURCE_LABELS = {
  hamtas: 'Hämtas',
  byra: 'Byråns val',
  sjalvrapport: 'Självrapport'
};

const VH_BEKRAFTELSE = ['', 'Ja', 'Osaker', 'Nej'];

/**
 * Enskild firma / fysisk person: verklig huvudman är inte aktuell
 * (ägaren är alltid densamma) — samma regel som KYC-formuläret.
 */
function isEnskildFirmaOrFysiskPerson(bolagsform) {
  const raw = String(bolagsform || '').trim().toLowerCase();
  if (!raw) return false;
  return raw === 'enskild firma'
    || raw === 'enskild näringsidkare'
    || raw === 'enskild naringsidkare'
    || raw === 'enskild näringsverksamhet'
    || raw === 'enskild naringsverksamhet'
    || raw === 'fysiska personer'
    || raw === 'fysisk person';
}

function vhIsRelevant(bolagsform) {
  return !isEnskildFirmaOrFysiskPerson(bolagsform);
}

/**
 * Villkorade kontrollfrågor kopplade till tjänster (regelmotor-embryo).
 * Matchas mot tjänstnamn; svar lagras i answers.villkorade_svar[id].
 */
const VILLKORADE_KONTROLLER = [
  {
    id: 'bokforing_kontantflode',
    tjanstMatch: /bokf|löpande|lopande|avstäm|avstam/i,
    frage: 'Förekommer kontantflöden eller kontantbetalningar som byrån behöver känna till i uppdraget?',
    typ: 'ja_nej'
  },
  {
    id: 'bokslut_ovanliga_transaktioner',
    tjanstMatch: /bokslut|årsredovis|arsredovis/i,
    frage: 'Finns ovanliga eller engångstransaktioner (t.ex. stora ägaruttag, koncerninterna lån) som påverkar uppdraget?',
    typ: 'ja_nej_varfor'
  },
  {
    id: 'lon_utbetalning_ombud',
    tjanstMatch: /lön|lon|payroll|skattekonto/i,
    frage: 'Sker löneutbetalningar eller skatteinbetalningar via ombud eller annat konto än företagets?',
    typ: 'ja_nej'
  },
  {
    id: 'deklaration_utland',
    tjanstMatch: /deklar|inkomst|moms/i,
    frage: 'Finns utländska inkomster, filialer eller momsregistreringar utanför Sverige som påverkar uppdraget?',
    typ: 'ja_nej_varfor'
  }
];

function trimStr(value) {
  return value == null ? '' : String(value).trim();
}

function emptyPerson() {
  return { namn: '', personnr: '', hemvist: 'Sverige', tin: '', agarandel: '', roll: '' };
}

function normalizePerson(p) {
  const src = p && typeof p === 'object' ? p : {};
  return {
    namn: trimStr(src.namn || src.name),
    personnr: trimStr(src.personnr || src.personnummer),
    hemvist: trimStr(src.skatterattslig_hemvist || src.hemvist) || 'Sverige',
    tin: trimStr(src.tin),
    agarandel: src.agarandel == null || src.agarandel === '' ? '' : String(src.agarandel),
    roll: trimStr(src.roll)
  };
}

function normalizeJaNej(value) {
  const v = trimStr(value).toLowerCase();
  if (v === 'ja' || v === 'yes' || v === 'true') return 'Ja';
  if (v === 'nej' || v === 'no' || v === 'false') return 'Nej';
  return '';
}

function normalizeVhBekraftelse(value) {
  const v = trimStr(value).toLowerCase();
  if (v === 'ja' || v === 'yes' || v === 'true' || v === 'stämmer' || v === 'stammer') return 'Ja';
  if (v === 'osaker' || v === 'osäker' || v === 'osakert' || v === 'uncertain') return 'Osaker';
  if (v === 'nej' || v === 'no' || v === 'false') return 'Nej';
  return '';
}

function normalizeTjanst(row) {
  if (row == null) return null;
  if (typeof row === 'string') {
    const namn = trimStr(row);
    if (!namn) return null;
    return { id: '', namn };
  }
  if (typeof row !== 'object') return null;
  const namn = trimStr(row.namn || row.name || row.label);
  const id = trimStr(row.id || row.recordId || '');
  if (!namn && !id) return null;
  return { id, namn: namn || id };
}

function normalizeTjanster(list) {
  const rows = Array.isArray(list) ? list : [];
  const out = [];
  const seen = new Set();
  for (const raw of rows) {
    const t = normalizeTjanst(raw);
    if (!t) continue;
    const key = `${t.id}|${t.namn}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

function normalizeVillkoradeSvar(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!k) continue;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      out[String(k)] = {
        svar: normalizeJaNej(v.svar) || trimStr(v.svar),
        varfor: trimStr(v.varfor || v.motivering)
      };
    } else {
      out[String(k)] = { svar: normalizeJaNej(v) || trimStr(v), varfor: '' };
    }
  }
  return out;
}

function emptyAnswers() {
  return {
    foretagsnamn: '',
    orgnr: '',
    tjanster: [],
    syfte_affarsrelation: '',
    verksamhet: '',
    forvantad_omfattning: '',
    kapitalUrsprung: '',
    kapitalUrsprungSkarpt: '',
    anstallda: '',
    omsattning: '',
    foretradare: [emptyPerson()],
    huvudman: [emptyPerson()],
    vh_bekraftelse: '',
    vh_agarstruktur: '',
    ombud_annan: '',
    ombud: [emptyPerson()],
    pep: '',
    pepDetaljer: '',
    pepFamilj: '',
    pepFamiljDetaljer: '',
    internationellHandel: '',
    internationellaLander: '',
    kontanter: '',
    kontanterAndel: '',
    kryptovaluta: '',
    villkorade_svar: {},
    bekraftelse: false
  };
}

function emptyForm() {
  return {
    version: VERSION,
    status: 'utkast',
    prefacedAt: null,
    sentAt: null,
    answeredAt: null,
    signedAt: null,
    answeredBy: '',
    updatedAt: null,
    updatedBy: '',
    prefillMeta: { fields: [], at: null },
    answers: emptyAnswers()
  };
}

function normalizePersonList(list, { keepEmpty = true } = {}) {
  const rows = (Array.isArray(list) ? list : []).map(normalizePerson);
  const filtered = rows.filter((p) => p.namn || p.personnr || p.tin);
  if (filtered.length) return filtered;
  return keepEmpty ? [emptyPerson()] : [];
}

function normalizeAnswers(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const base = emptyAnswers();
  return {
    ...base,
    foretagsnamn: trimStr(src.foretagsnamn),
    orgnr: trimStr(src.orgnr),
    tjanster: normalizeTjanster(src.tjanster),
    syfte_affarsrelation: trimStr(src.syfte_affarsrelation),
    verksamhet: trimStr(src.verksamhet),
    forvantad_omfattning: trimStr(src.forvantad_omfattning || src.forvantadOmfattning),
    kapitalUrsprung: trimStr(src.kapitalUrsprung),
    kapitalUrsprungSkarpt: trimStr(src.kapitalUrsprungSkarpt || src.kalla_specifika_tillgangar),
    anstallda: trimStr(src.anstallda),
    omsattning: trimStr(src.omsattning),
    foretradare: normalizePersonList(src.foretradare),
    huvudman: normalizePersonList(src.huvudman),
    vh_bekraftelse: normalizeVhBekraftelse(src.vh_bekraftelse),
    vh_agarstruktur: trimStr(src.vh_agarstruktur),
    ombud_annan: normalizeJaNej(src.ombud_annan) || trimStr(src.ombud_annan),
    ombud: normalizePersonList(src.ombud),
    pep: normalizeJaNej(src.pep) || trimStr(src.pep),
    pepDetaljer: trimStr(src.pepDetaljer),
    pepFamilj: normalizeJaNej(src.pepFamilj) || trimStr(src.pepFamilj),
    pepFamiljDetaljer: trimStr(src.pepFamiljDetaljer),
    internationellHandel: normalizeJaNej(src.internationellHandel) || trimStr(src.internationellHandel),
    internationellaLander: trimStr(src.internationellaLander),
    kontanter: normalizeJaNej(src.kontanter) || trimStr(src.kontanter),
    kontanterAndel: trimStr(src.kontanterAndel),
    kryptovaluta: normalizeJaNej(src.kryptovaluta) || trimStr(src.kryptovaluta),
    villkorade_svar: normalizeVillkoradeSvar(src.villkorade_svar),
    bekraftelse: src.bekraftelse === true || src.bekraftelse === 'true' || src.bekraftelse === 'Ja'
  };
}

function normalizeStatus(status) {
  const v = trimStr(status).toLowerCase();
  return STATUSES.includes(v) ? v : 'utkast';
}

function parseForm(raw) {
  let obj = raw;
  if (typeof raw === 'string') {
    try {
      obj = raw.trim() ? JSON.parse(raw) : {};
    } catch (_) {
      obj = {};
    }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) obj = {};
  const base = emptyForm();
  return {
    ...base,
    version: Number(obj.version) || VERSION,
    status: normalizeStatus(obj.status),
    prefacedAt: obj.prefacedAt || null,
    sentAt: obj.sentAt || null,
    answeredAt: obj.answeredAt || null,
    signedAt: obj.signedAt || null,
    answeredBy: trimStr(obj.answeredBy),
    updatedAt: obj.updatedAt || null,
    updatedBy: trimStr(obj.updatedBy),
    prefillMeta: {
      fields: Array.isArray(obj.prefillMeta?.fields) ? obj.prefillMeta.fields.map(String) : [],
      at: obj.prefillMeta?.at || null
    },
    answers: normalizeAnswers(obj.answers || obj)
  };
}

function serializeForm(form) {
  return JSON.stringify(parseForm(form));
}

function isBlankAnswerValue(key, value) {
  if (key === 'bekraftelse') return value !== true;
  if (key === 'foretradare' || key === 'huvudman' || key === 'ombud') {
    return !Array.isArray(value) || !value.some((p) => p && (p.namn || p.personnr));
  }
  if (key === 'tjanster') {
    return !Array.isArray(value) || value.length === 0;
  }
  if (key === 'villkorade_svar') {
    return !value || typeof value !== 'object' || !Object.keys(value).length;
  }
  return !trimStr(value);
}

function mergeAnswersPreferExisting(existing, incoming) {
  const a = normalizeAnswers(existing);
  const b = normalizeAnswers(incoming);
  const out = { ...a };
  const filledKeys = [];
  for (const key of Object.keys(b)) {
    if (key === 'villkorade_svar') {
      const merged = { ...(a.villkorade_svar || {}) };
      let filled = false;
      for (const [id, row] of Object.entries(b.villkorade_svar || {})) {
        const cur = merged[id];
        const curBlank = !cur || (!trimStr(cur.svar) && !trimStr(cur.varfor));
        const nextBlank = !row || (!trimStr(row.svar) && !trimStr(row.varfor));
        if (curBlank && !nextBlank) {
          merged[id] = row;
          filled = true;
        }
      }
      if (filled) {
        out.villkorade_svar = merged;
        filledKeys.push(key);
      }
      continue;
    }
    if (isBlankAnswerValue(key, a[key]) && !isBlankAnswerValue(key, b[key])) {
      out[key] = b[key];
      filledKeys.push(key);
    }
  }
  return { answers: out, filledKeys };
}

function parseKontaktPersoner(fields) {
  const raw = fields?.['Kontaktpersoner'] || fields?.['Befattningshavare'] || '';
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }
  return [];
}

function personFromKontakt(p) {
  const roller = Array.isArray(p.roller) ? p.roller : (p.roll ? [p.roll] : []);
  return normalizePerson({
    namn: p.namn || p.name,
    personnr: p.personnr || p.personnummer,
    hemvist: p.skatterattslig_hemvist || p.hemvist || 'Sverige',
    tin: p.tin,
    agarandel: p.agarandel,
    roll: roller.join(', ')
  });
}

/**
 * Komplex ägarstruktur (3 kap): fler än ett ägarled, utländskt bolag i kedjan,
 * eller ägarandel under redovisningströskeln 25 %.
 */
function isKomplexAgarstruktur(huvudman, { riskFlags = [], kyc = {} } = {}) {
  if (normalizeJaNej(kyc.komplexAgarstruktur) === 'Ja') return true;
  if (normalizeJaNej(kyc.komplexaAgarstrukturer) === 'Ja') return true;
  const flags = Array.isArray(riskFlags) ? riskFlags : [];
  if (flags.some((f) => /komplex|ägarstruktur|agarstruktur/i.test(String(f || '')))) return true;

  const list = normalizePersonList(huvudman, { keepEmpty: false });
  if (list.length > 1) return true;
  for (const p of list) {
    const hemvist = trimStr(p.hemvist);
    if (hemvist && !/^sverige$/i.test(hemvist)) return true;
    const andelRaw = String(p.agarandel || '').replace(',', '.').replace(/%/g, '').trim();
    const andel = parseFloat(andelRaw);
    if (!Number.isNaN(andel) && andel > 0 && andel < 25) return true;
  }
  return false;
}

function vhBekraftelseKraverAgarstruktur(answers, opts = {}) {
  const a = normalizeAnswers(answers);
  const bek = a.vh_bekraftelse;
  if (bek === 'Osaker' || bek === 'Nej') return true;
  return isKomplexAgarstruktur(a.huvudman, opts);
}

/**
 * Skärpta åtgärder-triggers (PEP / högriskland / distans) → djupare kapitalfråga.
 */
function needsSkarptKapitalUrsprung(answers, { riskFlags = [], hogrisksland = false } = {}) {
  const a = normalizeAnswers(answers);
  if (a.pep === 'Ja' || a.pepFamilj === 'Ja') return true;
  if (hogrisksland) return true;
  const flags = Array.isArray(riskFlags) ? riskFlags : [];
  if (flags.some((f) => /distans|pep|högriskland|hogriskland/i.test(String(f || '')))) return true;
  return false;
}

function villkoradeForTjanster(tjanster) {
  const list = normalizeTjanster(tjanster);
  const names = list.map((t) => t.namn || t.id).filter(Boolean);
  if (!names.length) return [];
  return VILLKORADE_KONTROLLER.filter((c) =>
    names.some((n) => c.tjanstMatch.test(String(n)))
  ).map((c) => ({
    id: c.id,
    frage: c.frage,
    typ: c.typ
  }));
}

function fieldSource(key) {
  return FIELD_SOURCES[key] || 'sjalvrapport';
}

function fieldSourceLabel(key) {
  return FIELD_SOURCE_LABELS[fieldSource(key)] || FIELD_SOURCE_LABELS.sjalvrapport;
}

function buildPrefillAnswers({
  fields = {},
  kyc = {},
  kontaktPersoner,
  tjanster = [],
  forvantadOmfattningFromMinibok = ''
} = {}) {
  const f = fields || {};
  const k = kyc && typeof kyc === 'object' ? kyc : {};
  const people = Array.isArray(kontaktPersoner) ? kontaktPersoner : parseKontaktPersoner(f);

  const foretradareFromKontakt = people
    .filter((p) => {
      const roller = Array.isArray(p.roller) ? p.roller : (p.roll ? [p.roll] : []);
      return roller.some((r) =>
        ['Styrelseledamot', 'VD', 'Firmatecknare', 'Ägare EF', 'Suppleant'].includes(r)
      );
    })
    .map(personFromKontakt);

  const ombudFromKontakt = people
    .filter((p) => {
      const roller = Array.isArray(p.roller) ? p.roller : (p.roll ? [p.roll] : []);
      return roller.some((r) => /ombud/i.test(String(r || '')));
    })
    .map(personFromKontakt);

  const huvudmanFromKontakt = people
    .filter((p) => {
      const roller = Array.isArray(p.roller) ? p.roller : (p.roll ? [p.roll] : []);
      return roller.some((r) => /verklig\s+huvudman/i.test(String(r || '')));
    })
    .map(personFromKontakt);

  let foretradare = normalizePersonList(k.foretradare, { keepEmpty: false });
  if (!foretradare.length && (k.foretradareNamn || k.foretradarePnr)) {
    foretradare = [normalizePerson({
      namn: k.foretradareNamn,
      personnr: k.foretradarePnr,
      hemvist: k.skatterattslig_hemvist_foretradare,
      tin: k.tin_foretradare
    })];
  }
  if (!foretradare.length) foretradare = foretradareFromKontakt;
  if (!foretradare.length) foretradare = [emptyPerson()];

  let huvudman = normalizePersonList(k.huvudman || k.verkligaHuvudman, { keepEmpty: false });
  if (!huvudman.length && trimStr(k.huvudmanInfo)) {
    huvudman = String(k.huvudmanInfo)
      .split(/\n/)
      .map((line) => trimStr(line))
      .filter(Boolean)
      .map((line) => {
        const paren = line.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
        if (paren) return normalizePerson({ namn: paren[1], personnr: paren[2] });
        return normalizePerson({ namn: line });
      });
  }
  if (!huvudman.length) huvudman = huvudmanFromKontakt;
  if (!huvudman.length) huvudman = [emptyPerson()];

  let ombud = normalizePersonList(k.ombud, { keepEmpty: false });
  if (!ombud.length) ombud = ombudFromKontakt;
  if (!ombud.length) ombud = [emptyPerson()];

  const pepPeople = people.filter((p) => p.pepMarkerad || p.pepMarked || p.pep);
  const riskhojande = Array.isArray(f['Riskhöjande faktorer övrigt'])
    ? f['Riskhöjande faktorer övrigt']
    : (f['Riskhöjande faktorer övrigt'] ? [f['Riskhöjande faktorer övrigt']] : []);
  const harKontant = riskhojande.some((r) => /kontant/i.test(String(r || '')));
  const transaktioner = trimStr(f['Har företaget transaktioner med andra länder?']);

  const linkedTjanster = normalizeTjanster(
    tjanster.length
      ? tjanster
      : (k.tjanster || f['Kundens utvalda tjänster'] || [])
  );

  const ombudAnnan = k.ombud_annan
    || (ombudFromKontakt.length || normalizePersonList(k.ombud, { keepEmpty: false }).length ? 'Ja' : '');

  return normalizeAnswers({
    foretagsnamn: k.foretagsnamn || f['Namn'] || '',
    orgnr: k.orgnr || f['Orgnr'] || '',
    tjanster: linkedTjanster,
    syfte_affarsrelation: k.syfte_affarsrelation || '',
    verksamhet: k.verksamhet || f['Verksamhet'] || f['Beskrivning av kunden'] || f['Verksamhetsbeskrivning'] || '',
    forvantad_omfattning: k.forvantad_omfattning || forvantadOmfattningFromMinibok || '',
    kapitalUrsprung: k.kapitalUrsprung || '',
    kapitalUrsprungSkarpt: k.kapitalUrsprungSkarpt || '',
    anstallda: k.anstallda || '',
    omsattning: k.omsattning || f['Omsättning'] || '',
    foretradare,
    huvudman,
    vh_bekraftelse: k.vh_bekraftelse || '',
    vh_agarstruktur: k.vh_agarstruktur || '',
    ombud_annan: ombudAnnan,
    ombud,
    pep: k.pep || (pepPeople.length ? 'Ja' : ''),
    pepDetaljer: k.pepDetaljer || pepPeople.map((p) => p.namn).filter(Boolean).join(', '),
    pepFamilj: k.pepFamilj || '',
    pepFamiljDetaljer: k.pepFamiljDetaljer || '',
    internationellHandel: k.internationellHandel || (transaktioner === 'Ja' || transaktioner === 'Nej' ? transaktioner : ''),
    internationellaLander: k.internationellaLander || '',
    kontanter: k.kontanter || (harKontant ? 'Ja' : ''),
    kontanterAndel: k.kontanterAndel || '',
    kryptovaluta: k.kryptovaluta || '',
    villkorade_svar: k.villkorade_svar || {},
    bekraftelse: false
  });
}

function applyPrefill(form, sources = {}) {
  const current = parseForm(form);
  const suggested = buildPrefillAnswers(sources);
  const { answers, filledKeys } = mergeAnswersPreferExisting(current.answers, suggested);
  const now = new Date().toISOString();
  const status = current.status === 'utkast' || current.status === 'prefillad'
    ? 'prefillad'
    : current.status;
  return {
    ...current,
    version: VERSION,
    status,
    prefacedAt: now,
    updatedAt: now,
    updatedBy: 'byra',
    prefillMeta: {
      fields: [...new Set([...(current.prefillMeta?.fields || []), ...filledKeys])],
      at: now
    },
    answers
  };
}

function applySave(form, incomingAnswers, { actor = 'byra', action = 'save' } = {}) {
  const current = parseForm(form);
  const answers = normalizeAnswers({
    ...current.answers,
    ...(incomingAnswers && typeof incomingAnswers === 'object' ? incomingAnswers : {})
  });
  const now = new Date().toISOString();
  let status = current.status;
  let answeredAt = current.answeredAt;
  let sentAt = current.sentAt;
  let signedAt = current.signedAt;
  let answeredBy = current.answeredBy;
  let prefacedAt = current.prefacedAt;

  if (action === 'mark_sent') {
    status = 'skickat';
    sentAt = now;
  } else if (action === 'mark_answered') {
    status = 'besvarat';
    answeredAt = now;
    answeredBy = actor === 'kund' ? 'kund' : (answeredBy || 'byra (simulerat kundsvar)');
  } else if (action === 'mark_signed') {
    status = 'signerat';
    signedAt = now;
    if (!answeredAt) answeredAt = now;
  } else if (status === 'utkast' && actor === 'byra') {
    status = 'prefillad';
    if (!prefacedAt) prefacedAt = now;
  }

  return {
    ...current,
    version: VERSION,
    status,
    prefacedAt,
    sentAt,
    answeredAt,
    signedAt,
    answeredBy,
    updatedAt: now,
    updatedBy: actor,
    answers
  };
}

function statusLabel(status) {
  return STATUS_LABELS[normalizeStatus(status)] || STATUS_LABELS.utkast;
}

function isAnswered(form) {
  const f = parseForm(form);
  return f.status === 'besvarat' || f.status === 'signerat' || !!f.answeredAt;
}

function summaryForUi(form) {
  const f = parseForm(form);
  return {
    status: f.status,
    statusLabel: statusLabel(f.status),
    answeredAt: f.answeredAt,
    sentAt: f.sentAt,
    signedAt: f.signedAt,
    prefacedAt: f.prefacedAt,
    answeredBy: f.answeredBy,
    isAnswered: isAnswered(f)
  };
}

function resolveBolagsform({ bolagsform, fields = {}, kyc = {} } = {}) {
  return String(
    bolagsform
    || kyc.bolagsform
    || fields.Bolagsform
    || fields['Bolagsform']
    || ''
  ).trim();
}

function buildUiMeta(form, {
  tjansterOptions = [],
  riskFlags = [],
  kyc = {},
  hogrisksland = false,
  bolagsform = '',
  fields = {}
} = {}) {
  const answers = parseForm(form).answers;
  const resolvedBolagsform = resolveBolagsform({ bolagsform, fields, kyc });
  const vhRelevant = vhIsRelevant(resolvedBolagsform);
  const vhKomplex = vhRelevant
    ? isKomplexAgarstruktur(answers.huvudman, { riskFlags, kyc })
    : false;
  const submitted = isAnswered(form);
  return {
    fieldSources: FIELD_SOURCES,
    fieldSourceLabels: FIELD_SOURCE_LABELS,
    tjansterOptions: normalizeTjanster(tjansterOptions),
    villkoradeKontroller: villkoradeForTjanster(answers.tjanster),
    /** Full katalog så UI kan filtrera reaktivt när tjänster ändras utan omrendering från server. */
    villkoradeKatalog: VILLKORADE_KONTROLLER.map((c) => ({
      id: c.id,
      frage: c.frage,
      typ: c.typ,
      tjanstMatchSource: String(c.tjanstMatch)
    })),
    bolagsform: resolvedBolagsform,
    vhRelevant,
    vhKomplex,
    vhKraverAgarstruktur: vhRelevant
      ? vhBekraftelseKraverAgarstruktur(answers, { riskFlags, kyc })
      : false,
    skarptKapital: needsSkarptKapitalUrsprung(answers, { riskFlags, hogrisksland }),
    /** Byråvyn ska spegla kundvyn 1:1 — samma fält, samma synlighet. */
    customerParity: true,
    submitted,
    readOnly: submitted
  };
}

module.exports = {
  FIELD,
  VERSION,
  STATUSES,
  STATUS_LABELS,
  FIELD_SOURCES,
  FIELD_SOURCE_LABELS,
  VH_BEKRAFTELSE,
  VILLKORADE_KONTROLLER,
  emptyPerson,
  emptyAnswers,
  emptyForm,
  parseForm,
  serializeForm,
  normalizeAnswers,
  normalizePerson,
  normalizeTjanster,
  buildPrefillAnswers,
  applyPrefill,
  applySave,
  mergeAnswersPreferExisting,
  statusLabel,
  isAnswered,
  summaryForUi,
  parseKontaktPersoner,
  isKomplexAgarstruktur,
  vhBekraftelseKraverAgarstruktur,
  needsSkarptKapitalUrsprung,
  villkoradeForTjanster,
  fieldSource,
  fieldSourceLabel,
  buildUiMeta,
  isEnskildFirmaOrFysiskPerson,
  vhIsRelevant,
  resolveBolagsform
};
