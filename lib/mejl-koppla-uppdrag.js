/**
 * Hjälpare för mejl → koppla till uppdrag (enstaka/engång) och skapa uppgift (anteckning-ToDo).
 */
const { mejlDeepLink, appendMejlLink, extractMejlLink } = require('./mejl-link');
function buildEngangUppdragPayload({ customerId, namn, ansvarig, klientansvarig, deadline, today }) {
  const name = String(namn || '').trim();
  const ans = String(ansvarig || '').trim();
  const klient = String(klientansvarig || '').trim();
  const dl = String(deadline || '').trim();
  const day = String(today || '').trim();
  if (!customerId) throw new Error('customerId saknas');
  if (!name) throw new Error('Ange ett namn på uppdraget (t.ex. Lön).');
  if (!klient) throw new Error('Välj klientansvarig.');
  if (!ans) throw new Error('Välj handläggare.');
  if (!dl) throw new Error('Ange deadline.');
  if (!day) throw new Error('Startdatum saknas');
  return {
    customerId,
    typ: 'Eget uppdrag',
    fields: {
      Namn: name,
      Ansvarig: ans,
      Klientansvarig: klient,
      Frekvens: 'Engång',
      Startdatum: day,
      'Nästa deadline': dl,
      Status: 'Aktiv'
    }
  };
}

/**
 * Payload för anteckning med ToDo – samma modell som kundkortets Att göra-lista
 * (syns under Mina uppgifter).
 */
function buildUppgiftNotePayload({
  text,
  ansvarig,
  byraId,
  orgnr,
  foretagsnamn,
  mejlSubject,
  today,
  messageId,
  mejlUrl
}) {
  const todo = String(text || '').trim();
  const name = String(ansvarig || '').trim();
  const day = String(today || '').trim();
  if (!todo) throw new Error('Ange vad som ska göras.');
  if (!name) throw new Error('Välj handläggare.');
  if (!day) throw new Error('Datum saknas');
  const subject = String(mejlSubject || '').trim();
  const link = String(mejlUrl || '').trim() || mejlDeepLink(messageId);
  const noteBody = appendMejlLink(
    subject ? `Uppgift från mejl: ${subject}\n\n${todo}` : `Uppgift från mejl\n\n${todo}`,
    link
  );
  const payload = {
    typAvAnteckning: ['Emailkonversation'],
    datum: day,
    notes: noteBody,
    ToDo1: todo,
    Status1: 'Att göra',
    name
  };
  if (link) payload.mejlUrl = link;
  if (byraId) payload.byraId = String(byraId).trim();
  if (orgnr) payload.orgnr = String(orgnr).trim();
  if (foretagsnamn) payload.foretagsnamn = String(foretagsnamn).trim();
  return payload;
}

/**
 * Öppna ToDo-rader från kundens anteckningar (Att göra / Pågående / Akut m.m.).
 * Stängda = Klart / Klar.
 */
function listOpenUppgifterFromNotes(notes) {
  const out = [];
  const list = Array.isArray(notes) ? notes : [];
  for (const note of list) {
    const id = String((note && note.id) || '').trim();
    if (!id) continue;
    const f = (note && (note.fields || note)) || {};
    for (let i = 1; i <= 8; i++) {
      const todo = f[`ToDo${i}`];
      const text = typeof todo === 'string' ? todo.trim() : String(todo || '').trim();
      if (!text) continue;
      const status = String(f[`Status${i}`] || '').trim();
      const statusLower = status.toLowerCase();
      if (statusLower === 'klart' || statusLower === 'klar') continue;
      const name = String(f.Name || f.name || '').trim();
      const datum = String(f.Datum || f.datum || '').trim();
      out.push({
        noteId: id,
        index: i,
        text,
        status: status || 'Att göra',
        name,
        datum,
        notes: String(f.Notes || f.notes || ''),
        mejlUrl: String(f['Mejl-länk'] || f.mejlUrl || '').trim() || extractMejlLink(f.Notes || f.notes || ''),
        value: id + ':' + i
      });
    }
  }
  out.sort((a, b) => String(b.datum || '').localeCompare(String(a.datum || '')));
  return out;
}

function parseUppgiftValue(value) {
  const raw = String(value || '').trim();
  const m = raw.match(/^(rec[A-Za-z0-9]+):([1-8])$/);
  if (!m) return null;
  return { noteId: m[1], index: Number(m[2]) };
}

/**
 * PATCH-fält för att koppla mejl till befintlig öppet uppgift (anteckning-ToDo).
 */
function buildLinkExistingUppgiftPatch({ notesText, mejlUrl, messageId } = {}) {
  const link = String(mejlUrl || '').trim() || mejlDeepLink(messageId);
  if (!link) throw new Error('Mejllänk saknas');
  const notes = appendMejlLink(notesText, link);
  const payload = { notes };
  payload.mejlUrl = link;
  return payload;
}

/**
 * Kopplingsmål i «Koppla mejl / bilagor».
 * mode: dokumentation | korning | uppdrag | new-uppdrag | uppgift | existing-uppgift
 * splitOn gäller inte skapa-/uppgift-lägen.
 */
function resolveKopplaSelection({ mode, splitOn } = {}) {
  const raw = String(mode || 'dokumentation').trim();
  const split = !!splitOn;
  if (raw === 'uppgift') return { effective: 'uppgift', create: 'uppgift' };
  if (raw === 'existing-uppgift') return { effective: 'existing-uppgift', create: null };
  if (raw === 'new-uppdrag') return { effective: 'uppdrag', create: 'uppdrag' };
  if (split && (raw === 'dokumentation' || raw === 'korning' || raw === 'uppdrag')) {
    return { effective: 'split', create: null };
  }
  const known = raw === 'korning' || raw === 'uppdrag' || raw === 'dokumentation';
  return { effective: known ? raw : 'dokumentation', create: null };
}

/** Vilka fält som ska synas för valt Kopplingsmål. */
function kopplaFieldVisibility({ mode, splitOn } = {}) {
  const raw = String(mode || 'dokumentation').trim();
  const split =
    !!splitOn &&
    raw !== 'uppgift' &&
    raw !== 'new-uppdrag' &&
    raw !== 'existing-uppgift';
  return {
    run: raw === 'korning' || split,
    uppdrag: raw === 'uppdrag' || split,
    newUppdrag: raw === 'new-uppdrag',
    uppgift: raw === 'uppgift',
    existingUppgift: raw === 'existing-uppgift'
  };
}

module.exports = {
  buildEngangUppdragPayload,
  buildUppgiftNotePayload,
  listOpenUppgifterFromNotes,
  parseUppgiftValue,
  buildLinkExistingUppgiftPatch,
  mejlDeepLink,
  resolveKopplaSelection,
  kopplaFieldVisibility
};
