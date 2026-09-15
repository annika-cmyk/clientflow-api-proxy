/**
 * Kalender – vyhjälpare (månad / vecka / dag).
 * Används av kalender.js i webbläsaren och av tester i Node.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.KalenderView = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const VIEWS = ['month', 'week', 'day'];
  const STORAGE_KEY = 'clientflow-kalender-view';

  function normalizeView(raw) {
    const v = String(raw || '').trim().toLowerCase();
    if (v === 'month' || v === 'manad' || v === 'månad') return 'month';
    if (v === 'week' || v === 'vecka') return 'week';
    if (v === 'day' || v === 'dag') return 'day';
    return 'month';
  }

  function loadStoredView(storage) {
    try {
      const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
      if (!store || !store.getItem) return 'month';
      return normalizeView(store.getItem(STORAGE_KEY));
    } catch (_) {
      return 'month';
    }
  }

  function saveStoredView(view, storage) {
    try {
      const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
      if (!store || !store.setItem) return;
      store.setItem(STORAGE_KEY, normalizeView(view));
    } catch (_) { /* ignore quota / private mode */ }
  }

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function dateIso(d) {
    if (!(d instanceof Date) || Number.isNaN(d.getTime())) return '';
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  function parseIso(iso) {
    const s = String(iso || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    const y = Number(s.slice(0, 4));
    const m = Number(s.slice(5, 7));
    const d = Number(s.slice(8, 10));
    const dt = new Date(y, m - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
    return dt;
  }

  function startOfDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function addDays(d, n) {
    const out = startOfDay(d);
    out.setDate(out.getDate() + n);
    return out;
  }

  /** Måndag som startar veckan som innehåller d (ISO-vecka, mån–sön). */
  function mondayOf(d) {
    const day = startOfDay(d);
    const wd = (day.getDay() + 6) % 7; // mån=0 … sön=6
    return addDays(day, -wd);
  }

  function isoWeekNumber(d) {
    // ISO-8601: vecka med årets första torsdag
    const date = startOfDay(d);
    const thursday = addDays(date, 3 - ((date.getDay() + 6) % 7));
    const yearStart = new Date(thursday.getFullYear(), 0, 1);
    return 1 + Math.round((thursday - yearStart) / 86400000 / 7);
  }

  /**
   * Synligt intervall för vald vy.
   * @returns {{ start: string, end: string }} ISO-datum inklusive båda ändar
   */
  function visibleRange(view, focus) {
    const v = normalizeView(view);
    const f = startOfDay(focus instanceof Date ? focus : new Date());
    if (v === 'day') {
      const iso = dateIso(f);
      return { start: iso, end: iso };
    }
    if (v === 'week') {
      const mon = mondayOf(f);
      return { start: dateIso(mon), end: dateIso(addDays(mon, 6)) };
    }
    const y = f.getFullYear();
    const m = f.getMonth();
    const last = new Date(y, m + 1, 0).getDate();
    return {
      start: `${y}-${pad2(m + 1)}-01`,
      end: `${y}-${pad2(m + 1)}-${pad2(last)}`
    };
  }

  function inVisibleRange(deadlineIso, range) {
    const dl = String(deadlineIso || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dl) || !range) return false;
    return dl >= range.start && dl <= range.end;
  }

  function periodTitle(view, focus) {
    const v = normalizeView(view);
    const f = startOfDay(focus instanceof Date ? focus : new Date());
    if (v === 'day') {
      return f.toLocaleDateString('sv-SE', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
      }).replace(/^\w/, (c) => c.toUpperCase());
    }
    if (v === 'week') {
      const mon = mondayOf(f);
      const sun = addDays(mon, 6);
      const weekNo = isoWeekNumber(mon);
      const sameMonth = mon.getMonth() === sun.getMonth();
      const sameYear = mon.getFullYear() === sun.getFullYear();
      const startLbl = mon.toLocaleDateString('sv-SE', {
        day: 'numeric', month: sameMonth ? undefined : 'short'
      });
      const endLbl = sun.toLocaleDateString('sv-SE', {
        day: 'numeric', month: 'short', year: sameYear ? 'numeric' : 'numeric'
      });
      return `Vecka ${weekNo} · ${startLbl}–${endLbl}`;
    }
    return f.toLocaleDateString('sv-SE', { month: 'long', year: 'numeric' })
      .replace(/^\w/, (c) => c.toUpperCase());
  }

  function shiftFocus(view, focus, delta) {
    const v = normalizeView(view);
    const f = startOfDay(focus instanceof Date ? focus : new Date());
    const step = Number(delta) || 0;
    if (v === 'day') return addDays(f, step);
    if (v === 'week') return addDays(f, step * 7);
    return new Date(f.getFullYear(), f.getMonth() + step, 1);
  }

  function goToday(view, now) {
    const v = normalizeView(view);
    const n = startOfDay(now instanceof Date ? now : new Date());
    if (v === 'month') return new Date(n.getFullYear(), n.getMonth(), 1);
    return n;
  }

  function navAria(view) {
    const v = normalizeView(view);
    if (v === 'day') {
      return { prev: 'Föregående dag', next: 'Nästa dag' };
    }
    if (v === 'week') {
      return { prev: 'Föregående vecka', next: 'Nästa vecka' };
    }
    return { prev: 'Föregående månad', next: 'Nästa månad' };
  }

  function rangeEmptyLabel(view) {
    const v = normalizeView(view);
    if (v === 'day') return 'denna dag';
    if (v === 'week') return 'denna vecka';
    return 'denna månad';
  }

  /** ISO-dagar för veckovy (mån–sön). */
  function weekDays(focus) {
    const mon = mondayOf(focus instanceof Date ? focus : new Date());
    const out = [];
    for (let i = 0; i < 7; i++) out.push(dateIso(addDays(mon, i)));
    return out;
  }

  return {
    VIEWS,
    STORAGE_KEY,
    normalizeView,
    loadStoredView,
    saveStoredView,
    dateIso,
    parseIso,
    startOfDay,
    addDays,
    mondayOf,
    isoWeekNumber,
    visibleRange,
    inVisibleRange,
    periodTitle,
    shiftFocus,
    goToday,
    navAria,
    rangeEmptyLabel,
    weekDays
  };
});
