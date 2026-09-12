/**
 * Kundformulär – samma formulär som kunden ska besvara.
 * Byrån kan prefilla; kunden redigerar och (senare) signerar med BankID.
 * Sparast som JSON på KUNDDATA-fältet "Kundformulär (JSON)".
 */

const FIELD = 'Kundformulär (JSON)';
const VERSION = 1;

const STATUSES = ['utkast', 'prefillad', 'skickat', 'besvarat', 'signerat'];

const STATUS_LABELS = {
  utkast: 'Utkast',
  prefillad: 'Prefillat av byrån',
  skickat: 'Skickat till kund',
  besvarat: 'Besvarat av kund',
  signerat: 'Signerat (BankID)'
};

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

function emptyAnswers() {
  return {
    foretagsnamn: '',
    orgnr: '',
    syfte_affarsrelation: '',
    verksamhet: '',
    kapitalUrsprung: '',
    anstallda: '',
    omsattning: '',
    foretradare: [emptyPerson()],
    huvudman: [emptyPerson()],
    pep: '',
    pepDetaljer: '',
    pepFamilj: '',
    pepFamiljDetaljer: '',
    internationellHandel: '',
    internationellaLander: '',
    kontanter: '',
    kontanterAndel: '',
    kryptovaluta: '',
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
    syfte_affarsrelation: trimStr(src.syfte_affarsrelation),
    verksamhet: trimStr(src.verksamhet),
    kapitalUrsprung: trimStr(src.kapitalUrsprung),
    anstallda: trimStr(src.anstallda),
    omsattning: trimStr(src.omsattning),
    foretradare: normalizePersonList(src.foretradare),
    huvudman: normalizePersonList(src.huvudman),
    pep: normalizeJaNej(src.pep) || trimStr(src.pep),
    pepDetaljer: trimStr(src.pepDetaljer),
    pepFamilj: normalizeJaNej(src.pepFamilj) || trimStr(src.pepFamilj),
    pepFamiljDetaljer: trimStr(src.pepFamiljDetaljer),
    internationellHandel: normalizeJaNej(src.internationellHandel) || trimStr(src.internationellHandel),
    internationellaLander: trimStr(src.internationellaLander),
    kontanter: normalizeJaNej(src.kontanter) || trimStr(src.kontanter),
    kontanterAndel: trimStr(src.kontanterAndel),
    kryptovaluta: normalizeJaNej(src.kryptovaluta) || trimStr(src.kryptovaluta),
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
  if (key === 'foretradare' || key === 'huvudman') {
    return !Array.isArray(value) || !value.some((p) => p && (p.namn || p.personnr));
  }
  return !trimStr(value);
}

function mergeAnswersPreferExisting(existing, incoming) {
  const a = normalizeAnswers(existing);
  const b = normalizeAnswers(incoming);
  const out = { ...a };
  const filledKeys = [];
  for (const key of Object.keys(b)) {
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

function buildPrefillAnswers({ fields = {}, kyc = {}, kontaktPersoner } = {}) {
  const f = fields || {};
  const k = kyc && typeof kyc === 'object' ? kyc : {};
  const people = Array.isArray(kontaktPersoner) ? kontaktPersoner : parseKontaktPersoner(f);

  const foretradareFromKontakt = people
    .filter((p) => {
      const roller = Array.isArray(p.roller) ? p.roller : (p.roll ? [p.roll] : []);
      return roller.some((r) =>
        ['Styrelseledamot', 'VD', 'Firmatecknare', 'Ägare EF', 'Suppleant', 'Ombud'].includes(r)
      );
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

  const pepPeople = people.filter((p) => p.pepMarkerad || p.pepMarked || p.pep);
  const riskhojande = Array.isArray(f['Riskhöjande faktorer övrigt'])
    ? f['Riskhöjande faktorer övrigt']
    : (f['Riskhöjande faktorer övrigt'] ? [f['Riskhöjande faktorer övrigt']] : []);
  const harKontant = riskhojande.some((r) => /kontant/i.test(String(r || '')));
  const transaktioner = trimStr(f['Har företaget transaktioner med andra länder?']);

  return normalizeAnswers({
    foretagsnamn: k.foretagsnamn || f['Namn'] || '',
    orgnr: k.orgnr || f['Orgnr'] || '',
    syfte_affarsrelation: k.syfte_affarsrelation || 'sedvanliga redovisningstjänster',
    verksamhet: k.verksamhet || f['Verksamhet'] || f['Beskrivning av kunden'] || f['Verksamhetsbeskrivning'] || '',
    kapitalUrsprung: k.kapitalUrsprung || '',
    anstallda: k.anstallda || '',
    omsattning: k.omsattning || f['Omsättning'] || '',
    foretradare,
    huvudman,
    pep: k.pep || (pepPeople.length ? 'Ja' : ''),
    pepDetaljer: k.pepDetaljer || pepPeople.map((p) => p.namn).filter(Boolean).join(', '),
    pepFamilj: k.pepFamilj || '',
    pepFamiljDetaljer: k.pepFamiljDetaljer || '',
    internationellHandel: k.internationellHandel || (transaktioner === 'Ja' || transaktioner === 'Nej' ? transaktioner : ''),
    internationellaLander: k.internationellaLander || '',
    kontanter: k.kontanter || (harKontant ? 'Ja' : ''),
    kontanterAndel: k.kontanterAndel || '',
    kryptovaluta: k.kryptovaluta || '',
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

module.exports = {
  FIELD,
  VERSION,
  STATUSES,
  STATUS_LABELS,
  emptyPerson,
  emptyAnswers,
  emptyForm,
  parseForm,
  serializeForm,
  normalizeAnswers,
  normalizePerson,
  buildPrefillAnswers,
  applyPrefill,
  applySave,
  mergeAnswersPreferExisting,
  statusLabel,
  isAnswered,
  summaryForUi,
  parseKontaktPersoner
};
