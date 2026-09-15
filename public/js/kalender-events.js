/**
 * Kalender – bygg synliga events enbart från Uppdragskörningar.
 * Används av kalender.js i webbläsaren och av tester i Node.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.KalenderEvents = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function toDate(iso) {
    const s = String(iso || '').slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
  }

  function isLoneTyp(typ, helpers) {
    if (helpers && typeof helpers.isLone === 'function') return !!helpers.isLone(typ);
    return false;
  }

  /**
   * Bygg kalender-events från riktiga Uppdragskörningar.
   * Syntetiska perioder från föräldra-uppdrag / historik / horizon används inte.
   *
   * @param {object} opts
   * @param {Array} opts.records – Uppdrag (förälder) med Kundnamn m.m.
   * @param {Array} opts.runRecords – Uppdragskörningar
   * @param {{start:string,end:string}} opts.range – synligt intervall (ISO datum)
   * @param {object} [opts.helpers] – MomsPeriod/LonePeriod-hjälpare + inVisibleRangeForEvent
   * @returns {Array}
   */
  function buildEventsFromRuns(opts) {
    const records = opts?.records || [];
    const runRecords = opts?.runRecords || [];
    const range = opts?.range || { start: '', end: '' };
    const helpers = opts?.helpers || {};
    const MomsPeriod = helpers.MomsPeriod || null;
    const LonePeriod = helpers.LonePeriod || null;
    const inVisibleRangeForEvent = typeof helpers.inVisibleRangeForEvent === 'function'
      ? helpers.inVisibleRangeForEvent
      : (deadline) => {
        const d = toDate(deadline);
        if (!d || !range.start || !range.end) return false;
        return d >= range.start && d <= range.end;
      };

    const recordsById = new Map();
    records.forEach((r) => {
      const id = String(r?.id || '').trim();
      if (id) recordsById.set(id, r);
    });

    const map = new Map();

    const put = (rec, putOpts) => {
      const dl = toDate(putOpts.deadline);
      if (!dl) return;
      const pk = String(putOpts.periodKey || dl.slice(0, 7)).trim();
      const key = `${rec.id}:${pk}`;
      const status = String(putOpts.status || '').trim();
      const prev = map.get(key);
      if (!prev) {
        map.set(key, {
          key,
          record: rec,
          runRec: putOpts.runRec || null,
          typ: String(rec.fields?.['Typ'] || putOpts.typ || ''),
          deadline: dl,
          startDate: toDate(putOpts.startDate) || '',
          periodKey: pk,
          periodLabel: String(putOpts.periodLabel || '').trim(),
          status: status || 'Planerad',
          scheduledStart: String(putOpts.scheduledStart || '').trim(),
          scheduledEnd: String(putOpts.scheduledEnd || '').trim(),
          inRange: false
        });
      } else {
        if (!prev.runRec && putOpts.runRec) prev.runRec = putOpts.runRec;
        if (status === 'Klar') prev.status = 'Klar';
        else if ((!prev.status || prev.status === 'Planerad') && status) prev.status = status;
        if (!prev.periodLabel && putOpts.periodLabel) prev.periodLabel = String(putOpts.periodLabel);
        if (!prev.startDate && putOpts.startDate) prev.startDate = toDate(putOpts.startDate);
        if (!prev.scheduledStart && putOpts.scheduledStart) {
          prev.scheduledStart = String(putOpts.scheduledStart).trim();
        }
        if (!prev.scheduledEnd && putOpts.scheduledEnd) {
          prev.scheduledEnd = String(putOpts.scheduledEnd).trim();
        }
      }
      const cur = map.get(key);
      cur.inRange = inVisibleRangeForEvent(cur.deadline, cur.scheduledStart, range);
    };

    runRecords.forEach((rr) => {
      const ff = rr?.fields || {};
      const uppdragId = String(ff['Uppdrag ID'] || '').trim();
      if (!uppdragId) return;
      const rec = recordsById.get(uppdragId);
      if (!rec) return;

      const f = rec.fields || {};
      const typ = String(f['Typ'] || ff['Typ'] || '');
      const freq = String(f['Frekvens'] || ff['Frekvens'] || '');
      const refSt = toDate(f['Startdatum'] || '');

      if (typ && String(ff['Typ'] || '').trim() && String(ff['Typ'] || '').trim() !== typ) return;

      const pk = String(ff['PeriodKey'] || '').trim();
      let dl = toDate(ff['Deadline'] || '');
      if (typ === 'Momsredovisning' && MomsPeriod && pk) {
        dl = MomsPeriod.deadlineIsoFromPeriodKey(pk, freq) || dl;
      }
      if (!dl && !pk) return;

      let st = toDate(ff['Startdatum'] || '');
      if (typ === 'Momsredovisning' && MomsPeriod && pk) {
        st = MomsPeriod.startIsoFromPeriodKey(pk, freq) || st;
      }
      if (isLoneTyp(typ, helpers) && LonePeriod && pk && !st) {
        st = LonePeriod.startIsoFromPeriodKey(pk, typ, refSt || dl) || '';
      }

      const label = String(ff['Period Label'] || '').trim()
        || (typ === 'Momsredovisning' && MomsPeriod && pk ? MomsPeriod.displayLabel(pk, freq) : '')
        || (isLoneTyp(typ, helpers) && LonePeriod && pk ? LonePeriod.displayLabel(pk, typ) : '');

      put(rec, {
        typ,
        periodKey: pk || (dl ? dl.slice(0, 7) : ''),
        deadline: dl,
        startDate: st,
        periodLabel: label,
        status: String(ff['Status'] || '').trim(),
        runRec: rr,
        scheduledStart: ff['Planerad start'] || '',
        scheduledEnd: ff['Planerad slut'] || ''
      });
    });

    return Array.from(map.values());
  }

  return {
    toDate,
    buildEventsFromRuns
  };
});
