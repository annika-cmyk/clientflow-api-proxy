/**
 * Rena hjälpfunktioner: lediga luckor givet arbetschema + upptagna intervall.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.MoteslankarAvailability = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const TZ = 'Europe/Stockholm';
  const SNAP_MIN = 15;

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function parseHm(raw) {
    const m = String(raw || '').trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (!Number.isFinite(h) || !Number.isFinite(min) || h > 23 || min > 59) return null;
    return h * 60 + min;
  }

  /** Lokal YYYY-MM-DD / HH:mm i Europe/Stockholm via Intl. */
  function partsInTz(date, timeZone) {
    const dtf = new Intl.DateTimeFormat('en-GB', {
      timeZone: timeZone || TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    });
    const parts = {};
    for (const p of dtf.formatToParts(date)) {
      if (p.type !== 'literal') parts[p.type] = p.value;
    }
    return {
      dateIso: `${parts.year}-${parts.month}-${parts.day}`,
      minutes: Number(parts.hour) * 60 + Number(parts.minute)
    };
  }

  function weekdayMon0(dateIso) {
    const d = new Date(`${dateIso}T12:00:00Z`);
    return (d.getUTCDay() + 6) % 7; // mån=0 … sön=6
  }

  function toUtcIso(dateIso, minutes) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    // Tolkning: Stockholm-lokal tid → approximera med Date parsning + offset
    // Använd noon trick: skapa UTC från format som saknar Z och låt engine…
    // Stabilare: räkna via Temporal saknas — använd fixed offset lookup.
    const guess = new Date(`${dateIso}T${pad2(h)}:${pad2(m)}:00`);
    // Om servern kör UTC: justera med Stockholm-offset för den dagen
    const asUtc = new Date(`${dateIso}T${pad2(h)}:${pad2(m)}:00Z`);
    const local = partsInTz(asUtc, TZ);
    const wantMin = h * 60 + m;
    let delta = wantMin - local.minutes;
    // Hantera midnatt-crossing grovt
    if (delta > 12 * 60) delta -= 24 * 60;
    if (delta < -12 * 60) delta += 24 * 60;
    return new Date(asUtc.getTime() + delta * 60000).toISOString();
  }

  function overlaps(aStart, aEnd, bStart, bEnd) {
    return aStart < bEnd && bStart < aEnd;
  }

  /**
   * Normalisera schema: { "0": [{start,end}, ...], ... } mån=0…sön=6.
   * Fallback från weekdays + dayStart/dayEnd om schema saknas.
   */
  function normalizeSchedule(raw, fallback) {
    const fb = fallback || {};
    let src = raw;
    if (typeof src === 'string') {
      try {
        src = JSON.parse(src);
      } catch (_) {
        src = null;
      }
    }
    const out = {};
    if (src && typeof src === 'object' && !Array.isArray(src)) {
      for (let d = 0; d <= 6; d++) {
        const key = String(d);
        const list = src[key] != null ? src[key] : src[d];
        if (!Array.isArray(list) || !list.length) continue;
        const intervals = [];
        for (const item of list) {
          const start = parseHm(item?.start || item?.from);
          const end = parseHm(item?.end || item?.to);
          if (start == null || end == null || !(end > start)) continue;
          intervals.push({
            start: `${pad2(Math.floor(start / 60))}:${pad2(start % 60)}`,
            end: `${pad2(Math.floor(end / 60))}:${pad2(end % 60)}`,
            startMin: start,
            endMin: end
          });
        }
        intervals.sort((a, b) => a.startMin - b.startMin);
        if (intervals.length) out[key] = intervals;
      }
    }
    if (Object.keys(out).length) return out;

    const weekdays = Array.isArray(fb.weekdays) && fb.weekdays.length
      ? fb.weekdays.map(Number)
      : [0, 1, 2, 3, 4];
    const dayStart = parseHm(fb.dayStart || '08:00');
    const dayEnd = parseHm(fb.dayEnd || '17:00');
    if (dayStart == null || dayEnd == null || !(dayEnd > dayStart)) return {};
    const interval = {
      start: `${pad2(Math.floor(dayStart / 60))}:${pad2(dayStart % 60)}`,
      end: `${pad2(Math.floor(dayEnd / 60))}:${pad2(dayEnd % 60)}`,
      startMin: dayStart,
      endMin: dayEnd
    };
    for (const d of weekdays) {
      if (d >= 0 && d <= 6) out[String(d)] = [interval];
    }
    return out;
  }

  function scheduleWeekdays(schedule) {
    return Object.keys(schedule || {})
      .map(Number)
      .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
      .sort((a, b) => a - b);
  }

  /**
   * @param {object} opts
   * @param {string} opts.rangeStartIso – YYYY-MM-DD
   * @param {string} opts.rangeEndIso – YYYY-MM-DD (inkl)
   * @param {number} opts.durationMin
   * @param {object} [opts.schedule] – per-dag intervall
   * @param {number[]} [opts.weekdays] – mån=0…sön=6, default mån–fre (fallback)
   * @param {string} [opts.dayStart] – HH:mm (fallback)
   * @param {string} [opts.dayEnd] – HH:mm (fallback)
   * @param {number} [opts.bufferBeforeMin]
   * @param {number} [opts.bufferAfterMin]
   * @param {number} [opts.noticeHours]
   * @param {Array<{start:string,end:string}>} [opts.busy]
   * @param {Date} [opts.now]
   */
  function generateSlots(opts) {
    const durationMin = Math.max(SNAP_MIN, Number(opts.durationMin) || 30);
    const schedule = normalizeSchedule(opts.schedule, {
      weekdays: opts.weekdays,
      dayStart: opts.dayStart,
      dayEnd: opts.dayEnd
    });
    const weekdays = scheduleWeekdays(schedule);
    if (!weekdays.length) return [];

    const bufferBefore = Math.max(0, Number(opts.bufferBeforeMin) || 0);
    const bufferAfter = Math.max(0, Number(opts.bufferAfterMin) || 0);
    const noticeMs = Math.max(0, Number(opts.noticeHours) || 0) * 3600000;
    const now = opts.now instanceof Date ? opts.now : new Date();
    const earliest = now.getTime() + noticeMs;

    const busy = (opts.busy || [])
      .map((b) => {
        const s = Date.parse(b.start);
        const e = Date.parse(b.end);
        if (!Number.isFinite(s) || !Number.isFinite(e) || !(e > s)) return null;
        return { start: s - bufferBefore * 60000, end: e + bufferAfter * 60000 };
      })
      .filter(Boolean);

    const startDate = String(opts.rangeStartIso || '').slice(0, 10);
    const endDate = String(opts.rangeEndIso || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) return [];

    const out = [];
    let cursor = new Date(`${startDate}T12:00:00Z`);
    const last = new Date(`${endDate}T12:00:00Z`);
    while (cursor.getTime() <= last.getTime()) {
      const dateIso = cursor.toISOString().slice(0, 10);
      const wd = weekdayMon0(dateIso);
      const intervals = schedule[String(wd)] || [];
      for (const iv of intervals) {
        const dayStart = iv.startMin;
        const dayEnd = iv.endMin;
        if (!(dayEnd > dayStart + durationMin - SNAP_MIN)) continue;
        for (let startMin = dayStart; startMin + durationMin <= dayEnd; startMin += SNAP_MIN) {
          const endMin = startMin + durationMin;
          const startIso = toUtcIso(dateIso, startMin);
          const endIso = toUtcIso(dateIso, endMin);
          const startMs = Date.parse(startIso);
          const endMs = Date.parse(endIso);
          if (!(endMs > startMs) || startMs < earliest) continue;
          const conflict = busy.some((b) => overlaps(startMs, endMs, b.start, b.end));
          if (conflict) continue;
          out.push({
            id: `${dateIso}T${pad2(Math.floor(startMin / 60))}${pad2(startMin % 60)}`,
            start: startIso,
            end: endIso,
            date: dateIso,
            startMin,
            endMin
          });
        }
      }
      cursor = new Date(cursor.getTime() + 24 * 3600000);
    }
    return out;
  }

  function busyFromGoogleEvents(events) {
    const out = [];
    for (const ev of events || []) {
      if (!ev || String(ev.status || '').toLowerCase() === 'cancelled') continue;
      const start = ev.start?.dateTime || (ev.start?.date ? `${ev.start.date}T00:00:00` : '');
      const end = ev.end?.dateTime || (ev.end?.date ? `${ev.end.date}T23:59:59` : '');
      if (!start || !end) continue;
      // Transparens transparent = ledig i Google – hoppa över
      if (String(ev.transparency || '').toLowerCase() === 'transparent') continue;
      out.push({ start, end });
    }
    return out;
  }

  return {
    TZ,
    SNAP_MIN,
    parseHm,
    partsInTz,
    weekdayMon0,
    toUtcIso,
    overlaps,
    normalizeSchedule,
    scheduleWeekdays,
    generateSlots,
    busyFromGoogleEvents
  };
});
