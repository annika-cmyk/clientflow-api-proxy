/**
 * Bygg payload för tidregistrering från kalender-körning (klarmarkera + regga tid).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.KalenderKlarTid = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function fmtHm(iso) {
    const s = String(iso || '');
    const m = s.match(/T(\d{2}):(\d{2})/);
    if (m) return m[1] + ':' + m[2];
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
  }

  function buildKalenderTidPayload({
    customerId,
    customerName,
    uppdragId,
    uppdragsnamn,
    koringId,
    hours,
    date,
    start,
    end,
    status
  }) {
    const cid = String(customerId || '').trim();
    const cname = String(customerName || '').trim();
    if (!cid && !cname) throw new Error('Kund saknas');
    const h = Number(hours);
    if (!(h > 0)) throw new Error('Avsätt tid i kalendern först (dra i nederkant).');
    const d = String(date || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error('Datum saknas');
    const startIso = String(start || '').trim();
    const endIso = String(end || '').trim();
    const desc =
      startIso && endIso
        ? 'Avsatt tid ' + fmtHm(startIso) + '–' + fmtHm(endIso) + ' (från kalender)'
        : 'Registrerad från kalender';
    return {
      customerId: cid,
      customerName: cname,
      uppdragId: String(uppdragId || '').trim(),
      uppdragsnamn: String(uppdragsnamn || '').trim(),
      koringId: String(koringId || '').trim(),
      date: d,
      hours: Math.round(h * 100) / 100,
      start: startIso,
      end: endIso,
      activity: 'Uppdragsarbete',
      description: desc,
      status: status || 'Klar'
    };
  }

  return { buildKalenderTidPayload };
});
