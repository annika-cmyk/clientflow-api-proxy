/**
 * Bygg payloads för att skapa uppdrag eller uppgift (anteckning+ToDo) från mejl.
 * Speglar anteckningars Att göra-lista respektive Eget uppdrag (engång) med deadline.
 */

const EGET_UPPDRAG_TYP = 'Eget uppdrag';
const UPPGIFT_NOTE_TYP = 'Emailkonversation';
const DEFAULT_FREQ = 'Engång';
const DEFAULT_STATUS = 'Att göra';

function todayIso(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function trimStr(v) {
  return String(v == null ? '' : v).trim();
}

function snippetFromEmail({ text, snippet, maxLen = 900 } = {}) {
  const raw = trimStr(text) || trimStr(snippet);
  if (!raw) return '';
  const collapsed = raw.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (collapsed.length <= maxLen) return collapsed;
  return collapsed.slice(0, Math.max(0, maxLen - 1)).trimEnd() + '…';
}

function defaultTitleFromSubject(subject) {
  const s = trimStr(subject);
  if (!s) return 'Uppföljning från mejl';
  return s.replace(/^(re|fw|fwd)\s*:\s*/i, '').trim() || 'Uppföljning från mejl';
}

/**
 * @param {{ kind: 'uppdrag'|'uppgift', customerId?: string, title?: string, deadline?: string }} input
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
function validateCreateWorkInput(input = {}) {
  const kind = trimStr(input.kind);
  if (kind !== 'uppdrag' && kind !== 'uppgift') {
    return { ok: false, error: 'Välj uppdrag eller uppgift.' };
  }
  if (!trimStr(input.customerId)) {
    return { ok: false, error: 'Koppla mejlet till en kund först, eller välj kund.' };
  }
  if (!trimStr(input.title)) {
    return { ok: false, error: 'Ange en titel.' };
  }
  const deadline = trimStr(input.deadline);
  if (!deadline || !/^\d{4}-\d{2}-\d{2}$/.test(deadline)) {
    return { ok: false, error: 'Ange en giltig deadline (ÅÅÅÅ-MM-DD).' };
  }
  return { ok: true };
}

/**
 * Uppgift = anteckning (Emailkonversation) med ToDo1, som i anteckningar.
 * Deadline sparas i Datum (syns i Mina uppgifter) och i ToDo-texten.
 */
function buildUppgiftNotePayload({
  title,
  deadline,
  description,
  customer = {},
  fromName = '',
  emailSubject = ''
} = {}) {
  const t = trimStr(title) || defaultTitleFromSubject(emailSubject);
  const dl = trimStr(deadline);
  const desc = trimStr(description);
  const todoText = dl ? `${t} (deadline ${dl})` : t;
  const notesParts = [];
  if (dl) notesParts.push(`Deadline: ${dl}`);
  if (emailSubject) notesParts.push(`Ämne: ${trimStr(emailSubject)}`);
  if (desc) notesParts.push(desc);
  return {
    typAvAnteckning: [UPPGIFT_NOTE_TYP],
    datum: dl || todayIso(),
    foretagsnamn: trimStr(customer.namn || customer.name),
    orgnr: trimStr(customer.orgnr),
    byraId: trimStr(customer.byraId),
    person: trimStr(fromName),
    notes: notesParts.join('\n\n'),
    ToDo1: todoText,
    Status1: DEFAULT_STATUS
  };
}

/**
 * Uppdrag = Eget uppdrag, engång, med deadline (samma API som kundkortet).
 */
function buildUppdragPayload({
  customerId,
  title,
  deadline,
  startDate,
  description,
  ansvarig,
  klientansvarig,
  emailSubject = ''
} = {}) {
  const namn = trimStr(title) || defaultTitleFromSubject(emailSubject);
  const dl = trimStr(deadline);
  const start = trimStr(startDate) || todayIso();
  const rutin = trimStr(description);
  const handlaggare = trimStr(ansvarig);
  const klient = trimStr(klientansvarig) || handlaggare;
  return {
    customerId: trimStr(customerId),
    typ: EGET_UPPDRAG_TYP,
    fields: {
      Namn: namn,
      Frekvens: DEFAULT_FREQ,
      Startdatum: start,
      'Nästa deadline': dl,
      Rutin: rutin,
      Ansvarig: handlaggare,
      Klientansvarig: klient,
      Status: 'Aktiv'
    }
  };
}

module.exports = {
  EGET_UPPDRAG_TYP,
  UPPGIFT_NOTE_TYP,
  DEFAULT_FREQ,
  snippetFromEmail,
  defaultTitleFromSubject,
  validateCreateWorkInput,
  buildUppgiftNotePayload,
  buildUppdragPayload,
  todayIso
};
