/**
 * Bygg payload för tidregistrering från ett mejl (Regga tid i mejldetaljen).
 * Fälten matchar POST /api/tidregistrering (lib/tidregistrering buildEntryFields).
 * Uppdrag är valfritt — samma regel som Tid-formuläret.
 * Ämne hamnar i Beskrivning, datum i Datum, mejllänk i mejlUrl (inte i brödtexten).
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

  /** Stabil djuplänk: mejlsidan + message id. Tom för delade list-id. */
  function mejlDeepLink(messageId) {
    const mid = String(messageId || '').trim();
    if (!mid || mid.startsWith('shared:')) return '';
    return 'mejl.html?messageId=' + encodeURIComponent(mid);
  }

  function localIsoDate(raw) {
    if (raw == null || raw === '') return '';
    const s = String(raw).trim();
    const day = s.match(/^(\d{4}-\d{2}-\d{2})/);
    if (day) return day[1];
    const n = Number(s);
    const d =
      Number.isFinite(n) && String(Math.trunc(Math.abs(n))).length >= 12
        ? new Date(n)
        : new Date(s);
    if (Number.isNaN(d.getTime())) return '';
    return todayIsoDate(d);
  }

  /** Mejlets datum till datumfältet. Saknas det används fallback (ofta idag). */
  function dateFromMejl(message, fallback) {
    const m = message || {};
    const fromMail = localIsoDate(m.internalDate) || localIsoDate(m.date) || localIsoDate(m.emailDate);
    if (fromMail) return fromMail;
    const fb = String(fallback || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(fb)) return fb;
    return todayIsoDate(m.now);
  }

  function messageIdForLink(src) {
    const explicit = String((src && src.messageId) || '').trim();
    if (explicit && !explicit.startsWith('shared:')) return explicit;
    const gmail = String((src && src.gmailMessageId) || '').trim();
    if (gmail && !gmail.startsWith('shared:')) return gmail;
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
    const date = dateRaw || dateFromMejl(src, src.today);
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
    const mejlUrl = String(src.mejlUrl || '').trim() || mejlDeepLink(messageIdForLink(src));

    return {
      customerId,
      customerName,
      uppdragId: String(src.uppdragId || '').trim(),
      uppdragsnamn: String(src.uppdragsnamn || '').trim(),
      date,
      hours,
      description,
      activity,
      status,
      mejlUrl
    };
  }

  return {
    todayIsoDate,
    hoursFromParts,
    descriptionFromMejl,
    dateFromMejl,
    mejlDeepLink,
    buildMejlTidPayload
  };
});
