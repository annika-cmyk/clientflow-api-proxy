/**
 * Google-kalenderhändelse → tidregistrering + mötesanteckning på kund.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.KalenderGcalActions = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function parseHm(raw) {
    const s = String(raw || '').trim();
    const m = s.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (!Number.isFinite(h) || !Number.isFinite(min) || h < 0 || h > 23 || min < 0 || min > 59) {
      return null;
    }
    return h * 60 + min;
  }

  function fmtHm(mins) {
    const m = Math.max(0, Number(mins) || 0);
    return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
  }

  function toLocalDateTimeIso(dateIso, mins) {
    const d = String(dateIso || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return '';
    return `${d}T${fmtHm(mins)}:00`;
  }

  function hoursBetween(startMin, endMin) {
    const a = Number(startMin);
    const b = Number(endMin);
    if (!Number.isFinite(a) || !Number.isFinite(b) || !(b > a)) return 0;
    return Math.round(((b - a) / 60) * 100) / 100;
  }

  /**
   * Bygg tidpayload från Google-möte + valda tider.
   * @param {object} input
   */
  function buildGcalTidPayload(input) {
    const src = input || {};
    const customerId = String(src.customerId || '').trim();
    const customerName = String(src.customerName || '').trim();
    if (!customerId && !customerName) {
      throw new Error('Välj kund');
    }

    const date = String(src.date || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new Error('Datum saknas');
    }

    let startMin = src.startMin;
    let endMin = src.endMin;
    if (src.startHm != null) startMin = parseHm(src.startHm);
    if (src.endHm != null) endMin = parseHm(src.endHm);
    if (startMin == null || endMin == null) {
      throw new Error('Ange start- och sluttid (HH:MM)');
    }
    if (!(endMin > startMin)) {
      throw new Error('Slut måste vara efter start');
    }

    const hours = hoursBetween(startMin, endMin);
    if (!(hours > 0)) throw new Error('Ange en giltig tidsåtgång');

    const start = toLocalDateTimeIso(date, startMin);
    const end = toLocalDateTimeIso(date, endMin);
    const title = String(src.title || src.summary || '').trim();
    const description = title
      ? `Möte: ${title} (${fmtHm(startMin)}–${fmtHm(endMin)}, från Google-kalender)`
      : `Möte ${fmtHm(startMin)}–${fmtHm(endMin)} (från Google-kalender)`;

    return {
      customerId,
      customerName,
      date,
      hours,
      start,
      end,
      activity: String(src.activity || 'Möte').trim() || 'Möte',
      description,
      status: String(src.status || 'Klar').trim() || 'Klar'
    };
  }

  function decodeBasicEntities(s) {
    return String(s || '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/<br\s*\/?>/gi, '\n');
  }

  /** Ta bort HTML-taggar och normalisera whitespace. */
  function stripHtml(raw) {
    let s = decodeBasicEntities(raw);
    s = s.replace(/<[^>]+>/g, ' ');
    s = s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ');
    return s.trim();
  }

  /**
   * Ta bort Reclaim.ai:s standardboilerplate men behåll övrig beskrivning/agenda.
   */
  function cleanGcalDescription(raw) {
    let s = String(raw || '');
    if (!s) return '';

    // Reclaim lägger sin footer sist – klipp bort från den meningen och framåt
    const reclaimIdx = s.search(/This event was created by Reclaim\./i);
    if (reclaimIdx >= 0) {
      s = s.slice(0, reclaimIdx);
    }
    // Variant utan rubrikraden
    s = s.replace(/You can edit it[\s\S]*?reschedule(?:<\/a>)?\.?/gi, '');
    s = s.replace(/https?:\/\/(?:app\.)?reclaim\.ai\/[^\s<>"']+/gi, '');

    return stripHtml(s);
  }

  /**
   * Hitta videomöteslänk: hangoutLink, conferenceData eller URL i beskrivning.
   */
  function extractMeetingUrl(input) {
    const src = input || {};
    const direct = String(src.hangoutLink || src.meetingUrl || '').trim();
    if (/^https?:\/\//i.test(direct)) return direct;

    const entries = Array.isArray(src.conferenceEntryPoints)
      ? src.conferenceEntryPoints
      : Array.isArray(src.conferenceData?.entryPoints)
        ? src.conferenceData.entryPoints
        : [];
    for (const ep of entries) {
      const type = String(ep?.entryPointType || '').toLowerCase();
      const uri = String(ep?.uri || '').trim();
      if (type === 'video' && /^https?:\/\//i.test(uri)) return uri;
    }
    for (const ep of entries) {
      const uri = String(ep?.uri || '').trim();
      if (/^https?:\/\/meet\.google\.com\//i.test(uri)) return uri;
    }

    const blob = [src.description, src.location, src.htmlLink].map((x) => String(x || '')).join('\n');
    const meet = blob.match(/https:\/\/meet\.google\.com\/[a-z0-9-]+/i);
    if (meet) return meet[0];
    const zoom = blob.match(/https:\/\/[\w.-]*zoom\.us\/j\/[^\s<>"']+/i);
    if (zoom) return zoom[0].replace(/[),.;]+$/g, '');
    const teams = blob.match(/https:\/\/teams\.microsoft\.com\/l\/meetup-join\/[^\s<>"']+/i);
    if (teams) return teams[0].replace(/[),.;]+$/g, '');
    return '';
  }

  /**
   * Bygg POST /api/notes-payload för mötesanteckning.
   */
  function buildGcalNotePayload(input) {
    const src = input || {};
    const notes = String(src.notes || '').trim();
    if (!notes) throw new Error('Skriv en anteckning');
    const customerId = String(src.customerId || '').trim();
    const foretagsnamn = String(src.customerName || src.foretagsnamn || '').trim();
    if (!customerId && !foretagsnamn) throw new Error('Välj kund');

    const date = String(src.date || '').slice(0, 10);
    const title = String(src.title || src.summary || '').trim();
    const startHm = src.startHm ? String(src.startHm) : '';
    const endHm = src.endHm ? String(src.endHm) : '';
    const timeBit = startHm && endHm ? ` (${startHm}–${endHm})` : '';
    const header = title ? `Möte: ${title}${timeBit}` : `Möte${timeBit}`;
    const body = notes.startsWith('Möte:') ? notes : `${header}\n\n${notes}`;

    return {
      typAvAnteckning: ['Mötesanteckningar'],
      datum: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : new Date().toISOString().slice(0, 10),
      notes: body,
      foretagsnamn,
      byraId: String(src.byraId || '').trim(),
      orgnr: String(src.orgnr || '').trim(),
      person: String(src.person || '').trim()
    };
  }

  return {
    parseHm,
    fmtHm,
    toLocalDateTimeIso,
    hoursBetween,
    buildGcalTidPayload,
    buildGcalNotePayload,
    stripHtml,
    cleanGcalDescription,
    extractMeetingUrl
  };
});
