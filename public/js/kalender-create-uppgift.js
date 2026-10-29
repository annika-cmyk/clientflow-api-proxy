/**
 * Kalender: skapa enkel uppgift (Eget uppdrag/Engång + anteckning-ToDo)
 * från drag-på-tom-yta — samma datamodell som mejl → Ny uppgift.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.KalenderCreateUppgift = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const EGET_TYP = 'Eget uppdrag';
  const CREATE_MODES = Object.freeze({
    RUN: 'run',
    UPPGIFT: 'uppgift'
  });

  function normalizeCreateMode(raw) {
    const m = String(raw || '').trim().toLowerCase();
    if (m === CREATE_MODES.UPPGIFT || m === 'task' || m === 'todo') {
      return CREATE_MODES.UPPGIFT;
    }
    return CREATE_MODES.RUN;
  }

  /**
   * Engångs-Eget uppdrag som landar i kalendern som uppdragskörning.
   * Deadline default = bokningsdagen (ingen separat period krävs).
   */
  function buildEngangUppgiftUppdragPayload({
    customerId,
    namn,
    ansvarig,
    klientansvarig,
    deadline,
    today
  }) {
    const name = String(namn || '').trim();
    const ans = String(ansvarig || '').trim();
    const klient = String(klientansvarig || ans).trim();
    const dl = String(deadline || today || '').trim();
    const day = String(today || dl || '').trim();
    if (!customerId) throw new Error('Välj kund.');
    if (!name) throw new Error('Ange vad som ska göras.');
    if (!ans) throw new Error('Saknar handläggare — logga in igen.');
    if (!klient) throw new Error('Saknar klientansvarig.');
    if (!dl) throw new Error('Ange deadline.');
    if (!day) throw new Error('Startdatum saknas');
    return {
      customerId: String(customerId).trim(),
      typ: EGET_TYP,
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
   * Anteckning-ToDo → Mina uppgifter / Att göra (utan mejl-prefix).
   */
  function buildStandaloneUppgiftNotePayload({
    text,
    ansvarig,
    byraId,
    orgnr,
    foretagsnamn,
    today,
    extraNote
  }) {
    const todo = String(text || '').trim();
    const name = String(ansvarig || '').trim();
    const day = String(today || '').trim();
    if (!todo) throw new Error('Ange vad som ska göras.');
    if (!name) throw new Error('Saknar handläggare — logga in igen.');
    if (!day) throw new Error('Datum saknas');
    const extra = String(extraNote || '').trim();
    const notes = extra ? `${todo}\n\n${extra}` : todo;
    const payload = {
      typAvAnteckning: ['Arbetsanteckningar'],
      datum: day,
      notes,
      ToDo1: todo,
      Status1: 'Att göra',
      name
    };
    if (byraId) payload.byraId = String(byraId).trim();
    if (orgnr) payload.orgnr = String(orgnr).trim();
    if (foretagsnamn) payload.foretagsnamn = String(foretagsnamn).trim();
    return payload;
  }

  /** Hitta körning som hör till nyskapat engångsuppdrag. */
  function findRunForUppdrag(runs, uppdragId) {
    const id = String(uppdragId || '').trim();
    if (!id) return null;
    const list = Array.isArray(runs) ? runs : [];
    return list.find((r) => {
      const f = (r && (r.fields || r)) || {};
      return String(f['Uppdrag ID'] || '').trim() === id;
    }) || null;
  }

  function isStandaloneUppgiftEvent(ev) {
    if (!ev || ev.source === 'google') return false;
    const typ = String(ev.typ || ev.record?.fields?.Typ || ev.runRec?.fields?.Typ || '').trim();
    const freq = String(
      ev.record?.fields?.Frekvens || ev.runRec?.fields?.Frekvens || ''
    ).trim();
    if (typ === EGET_TYP) return true;
    return freq === 'Engång' && typ === EGET_TYP;
  }

  return {
    EGET_TYP,
    CREATE_MODES,
    normalizeCreateMode,
    buildEngangUppgiftUppdragPayload,
    buildStandaloneUppgiftNotePayload,
    findRunForUppdrag,
    isStandaloneUppgiftEvent
  };
});
