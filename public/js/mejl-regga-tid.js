/**
 * Bygg payload för tidregistrering från ett mejl (Regga tid i mejldetaljen).
 * Fälten matchar POST /api/tidregistrering (lib/tidregistrering buildEntryFields).
 * Uppdrag är valfritt — samma regel som Tid-formuläret.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.MejlReggaTid = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function todayIsoDate(now) {
    const d = now instanceof Date ? now : new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function parseNonNegative(raw, label) {
    if (raw == null || String(raw).trim() === '') return 0;
    const n = Number(String(raw).trim().replace(',', '.'));
    if (!Number.isFinite(n) || n < 0) {
      const err = new Error(label + ' måste vara ett tal större än eller lika med 0');
      err.status = 400;
      throw err;
    }
    return n;
  }

  /** Timmar + minuter → decimal timmar (två decimaler), som Tid-API:t lagrar. */
  function hoursFromParts(hoursRaw, minutesRaw) {
    const hours = parseNonNegative(hoursRaw, 'Timmar');
    const minutes = parseNonNegative(minutesRaw, 'Minuter');
    if (minutes >= 60) {
      const err = new Error('Minuter måste vara 0–59');
      err.status = 400;
      throw err;
    }
    const total = Math.round((hours + minutes / 60) * 100) / 100;
    if (!(total > 0)) {
      const err = new Error('Ange timmar eller minuter');
      err.status = 400;
      throw err;
    }
    return total;
  }

  function collapseWs(s) {
    return String(s || '').replace(/\s+/g, ' ').trim();
  }

  /** Ämne, annars utdrag — samma text som hamnar i Beskrivning. */
  function descriptionFromMejl(message) {
    const m = message || {};
    const subject = collapseWs(m.subject);
    if (subject) return subject;
    const snippet = collapseWs(m.snippet || m.text || '');
    if (snippet) return snippet.slice(0, 500);
    return '';
  }

  function buildMejlTidPayload(input) {
    const src = input || {};
    const customerId = String(src.customerId || '').trim();
    const customerName = String(src.customerName || '').trim();
    if (!customerId) {
      const err = new Error('Välj kund');
      err.status = 400;
      throw err;
    }

    const hours = hoursFromParts(src.hours, src.minutes);
    const dateRaw = String(src.date || '').trim();
    const date = dateRaw || String(src.today || '').trim() || todayIsoDate(src.now);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      const err = new Error('Datum krävs (YYYY-MM-DD)');
      err.status = 400;
      throw err;
    }

    const explicitDesc = src.description != null ? collapseWs(src.description) : '';
    const description = explicitDesc || descriptionFromMejl(src);
    const activity =
      src.activity == null || String(src.activity).trim() === ''
        ? 'Mejl'
        : String(src.activity).trim();
    const status = String(src.status || 'Utkast').trim() || 'Utkast';

    return {
      customerId,
      customerName,
      uppdragId: String(src.uppdragId || '').trim(),
      uppdragsnamn: String(src.uppdragsnamn || '').trim(),
      date,
      hours,
      description,
      activity,
      status
    };
  }

  return {
    todayIsoDate,
    hoursFromParts,
    descriptionFromMejl,
    buildMejlTidPayload
  };
});
