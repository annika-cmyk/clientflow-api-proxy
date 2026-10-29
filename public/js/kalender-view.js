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

  /** Timmar i tidsrutnät (inkl. start, exkl. slut): 07–20 → 13 timmar. */
  const DAY_START_HOUR = 7;
  const DAY_END_HOUR = 20;
  const SNAP_MINUTES = 15;
  const DEFAULT_BLOCK_MINUTES = 60;
  const PX_PER_HOUR = 60;

  function dayStartMinutes() {
    return DAY_START_HOUR * 60;
  }

  function dayEndMinutes() {
    return DAY_END_HOUR * 60;
  }

  function daySpanMinutes() {
    return dayEndMinutes() - dayStartMinutes();
  }

  function hourLabels() {
    const out = [];
    for (let h = DAY_START_HOUR; h < DAY_END_HOUR; h++) {
      out.push(`${pad2(h)}:00`);
    }
    return out;
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function snapMinutes(mins, step) {
    const s = Number(step) > 0 ? Number(step) : SNAP_MINUTES;
    return Math.round(Number(mins) / s) * s;
  }

  /** Minuter från midnatt för en Date/ISO; NaN om ogiltig. */
  function minutesOfDay(isoOrDate) {
    let d = isoOrDate;
    if (!(d instanceof Date)) {
      const raw = String(isoOrDate || '').trim();
      if (!raw) return NaN;
      d = new Date(raw);
    }
    if (!(d instanceof Date) || Number.isNaN(d.getTime())) return NaN;
    return d.getHours() * 60 + d.getMinutes();
  }

  function parseDateTime(iso) {
    const raw = String(iso || '').trim();
    if (!raw) return null;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return null;
    return d;
  }

  /**
   * Bygg lokal ISO-sträng (utan Z) för Airtable dateTime: YYYY-MM-DDTHH:mm:ss
   * Används med Europe/Stockholm-semantik via klientens lokala tid.
   */
  function toLocalDateTimeIso(dateIsoStr, minutesFromMidnight) {
    const day = parseIso(dateIsoStr);
    if (!day) return '';
    const mins = clamp(Number(minutesFromMidnight) || 0, 0, 24 * 60 - 1);
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${dateIso(day)}T${pad2(h)}:${pad2(m)}:00`;
  }

  function durationHours(startIso, endIso) {
    const a = parseDateTime(startIso);
    const b = parseDateTime(endIso);
    if (!a || !b) return null;
    const ms = b.getTime() - a.getTime();
    if (!(ms > 0)) return null;
    return Math.round((ms / 3600000) * 100) / 100;
  }

  function durationMinutes(startIso, endIso) {
    const a = parseDateTime(startIso);
    const b = parseDateTime(endIso);
    if (!a || !b) return null;
    const mins = Math.round((b.getTime() - a.getTime()) / 60000);
    return mins > 0 ? mins : null;
  }

  /**
   * Normalisera planerat block från körningsfält.
   * @returns {{ start: string, end: string, date: string, startMin: number, endMin: number, hours: number }|null}
   */
  function normalizeSchedule(startRaw, endRaw) {
    const start = parseDateTime(startRaw);
    if (!start) return null;
    let end = parseDateTime(endRaw);
    if (!end || end.getTime() <= start.getTime()) {
      end = new Date(start.getTime() + DEFAULT_BLOCK_MINUTES * 60000);
    }
    const date = dateIso(start);
    const startMin = start.getHours() * 60 + start.getMinutes();
    const endMin = end.getHours() * 60 + end.getMinutes()
      + (dateIso(end) > date ? 24 * 60 : 0);
    const hours = Math.round(((end.getTime() - start.getTime()) / 3600000) * 100) / 100;
    return {
      start: toLocalDateTimeIso(date, startMin),
      end: toLocalDateTimeIso(dateIso(end), end.getHours() * 60 + end.getMinutes()),
      date,
      startMin,
      endMin: Math.max(startMin + SNAP_MINUTES, endMin),
      hours
    };
  }

  /**
   * Placering i tidsrutnät (0–100 % av synlig höjd).
   * Klampas till [DAY_START, DAY_END]; block kortare än snap behåller minhöjd via CSS.
   */
  function blockLayout(startMin, endMin) {
    const gridStart = dayStartMinutes();
    const gridEnd = dayEndMinutes();
    const span = daySpanMinutes();
    const s = clamp(Number(startMin) || gridStart, gridStart, gridEnd - SNAP_MINUTES);
    let e = clamp(Number(endMin) || (s + DEFAULT_BLOCK_MINUTES), s + SNAP_MINUTES, gridEnd);
    if (e <= s) e = Math.min(gridEnd, s + SNAP_MINUTES);
    const topPct = ((s - gridStart) / span) * 100;
    const heightPct = ((e - s) / span) * 100;
    return { topPct, heightPct, startMin: s, endMin: e };
  }

  /** Visuell lucka mellan tidblock så back-to-back-rutor inte smälter ihop. */
  const BLOCK_GAP_PX = 3;

  /** CSS top/height för absolutplacerat block (med gap i nederkant). */
  function blockPositionStyle(layout) {
    const top = Number(layout && layout.topPct) || 0;
    const height = Math.max(0, Number(layout && layout.heightPct) || 0);
    return {
      top: `${top}%`,
      height: `max(1.1rem, calc(${height}% - ${BLOCK_GAP_PX}px))`
    };
  }

  function blockPositionStyleAttr(layout) {
    const s = blockPositionStyle(layout);
    return `top:${s.top};height:${s.height};`;
  }

  /** Y-position → minuter från midnatt, snappat. */
  function yToMinutes(y, columnHeight) {
    const h = Number(columnHeight) || 1;
    const ratio = clamp(Number(y) / h, 0, 1);
    const raw = dayStartMinutes() + ratio * daySpanMinutes();
    return clamp(snapMinutes(raw, SNAP_MINUTES), dayStartMinutes(), dayEndMinutes() - SNAP_MINUTES);
  }

  function moveBlock(startMin, endMin, newStartMin) {
    const dur = Math.max(SNAP_MINUTES, (Number(endMin) || 0) - (Number(startMin) || 0));
    const gridStart = dayStartMinutes();
    const gridEnd = dayEndMinutes();
    let s = snapMinutes(newStartMin, SNAP_MINUTES);
    s = clamp(s, gridStart, gridEnd - SNAP_MINUTES);
    let e = s + dur;
    if (e > gridEnd) {
      e = gridEnd;
      s = Math.max(gridStart, e - dur);
      s = snapMinutes(s, SNAP_MINUTES);
      e = Math.min(gridEnd, s + dur);
    }
    return { startMin: s, endMin: e };
  }

  function resizeBlock(startMin, newEndMin) {
    const gridEnd = dayEndMinutes();
    const s = Number(startMin) || dayStartMinutes();
    let e = snapMinutes(newEndMin, SNAP_MINUTES);
    e = clamp(e, s + SNAP_MINUTES, gridEnd);
    return { startMin: s, endMin: e };
  }

  /** Förläng/korta från övre kanten — ändrar start, behåller slut. */
  function resizeBlockStart(newStartMin, endMin) {
    const gridStart = dayStartMinutes();
    const e = Number(endMin) || dayEndMinutes();
    let s = snapMinutes(newStartMin, SNAP_MINUTES);
    s = clamp(s, gridStart, e - SNAP_MINUTES);
    return { startMin: s, endMin: e };
  }

  /** Kalenderdag för placering: planerad start om satt, annars deadline. */
  function placementDate(scheduledStart, deadlineIso) {
    const sched = normalizeSchedule(scheduledStart, null);
    if (sched) return sched.date;
    return String(deadlineIso || '').slice(0, 10);
  }

  function inVisibleRangeForEvent(deadlineIso, scheduledStart, range) {
    if (inVisibleRange(deadlineIso, range)) return true;
    const d = placementDate(scheduledStart, '');
    return d ? inVisibleRange(d, range) : false;
  }

  const EVENT_MODES = ['deadline', 'open'];
  const EVENT_MODE_STORAGE_KEY = 'clientflow-kalender-event-mode';

  function normalizeEventMode(raw) {
    const v = String(raw || '').trim().toLowerCase();
    if (v === 'open' || v === 'opna' || v === 'öppna') return 'open';
    return 'deadline';
  }

  function loadStoredEventMode(storage) {
    try {
      const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
      if (!store || !store.getItem) return 'deadline';
      return normalizeEventMode(store.getItem(EVENT_MODE_STORAGE_KEY));
    } catch (_) {
      return 'deadline';
    }
  }

  function saveStoredEventMode(mode, storage) {
    try {
      const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
      if (!store || !store.setItem) return;
      store.setItem(EVENT_MODE_STORAGE_KEY, normalizeEventMode(mode));
    } catch (_) { /* ignore */ }
  }

  function isDoneStatus(status) {
    const st = String(status || '').trim();
    return st === 'Klar' || st === 'Avslutad';
  }

  /**
   * Öppna-läge: körning syns om den inte är klar och arbetsfönstret överlappar synligt intervall,
   * eller om den är försenad (deadline före idag) och perioden ligger efter deadlinen.
   * Klara körningar syns om planerad tid eller deadline ligger i synligt intervall
   * (så klarmarkerade tidblock inte försvinner från kalendern).
   */
  function isOpenEventInRange(startIso, deadlineIso, status, range, todayIso, scheduledStart) {
    if (!range || !range.start || !range.end) return false;
    if (isDoneStatus(status)) {
      const sched = normalizeSchedule(scheduledStart, null);
      if (sched && inVisibleRange(sched.date, range)) return true;
      const deadlineDone = String(deadlineIso || '').slice(0, 10);
      return !!(deadlineDone && inVisibleRange(deadlineDone, range));
    }
    const start = String(startIso || '').slice(0, 10);
    const deadline = String(deadlineIso || '').slice(0, 10);
    const today = String(todayIso || '').slice(0, 10);
    if (deadline && today && deadline < today) {
      return range.end >= deadline;
    }
    const winStart = start || deadline;
    const winEnd = deadline || start;
    if (!winStart || !winEnd) {
      return deadline ? inVisibleRange(deadline, range) : false;
    }
    return winStart <= range.end && winEnd >= range.start;
  }

  /**
   * Placering i Öppna-läge: planerad tid → deadline i intervall → idag → startdatum → första synliga dag.
   */
  function placementDateOpen(scheduledStart, deadlineIso, startIso, range, todayIso) {
    const sched = normalizeSchedule(scheduledStart, null);
    if (sched && inVisibleRange(sched.date, range)) return sched.date;

    const deadline = String(deadlineIso || '').slice(0, 10);
    if (deadline && inVisibleRange(deadline, range)) return deadline;

    const today = String(todayIso || '').slice(0, 10);
    if (today && inVisibleRange(today, range)) {
      const start = String(startIso || '').slice(0, 10);
      if (!start || start <= today) return today;
    }

    const start = String(startIso || '').slice(0, 10);
    if (start && inVisibleRange(start, range)) return start;

    if (range && range.start && range.end) {
      if (start && start > range.start && start <= range.end) return start;
      if (deadline && deadline >= range.start && deadline <= range.end) return deadline;
      return range.start;
    }
    return deadline || start || '';
  }

  function fmtTimeLabel(minutesFromMidnight) {
    const m = clamp(Number(minutesFromMidnight) || 0, 0, 24 * 60 - 1);
    return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
  }

  function tidPrefillHours(startIso, endIso) {
    const h = durationHours(startIso, endIso);
    if (h == null || !(h > 0)) return '';
    // Tidregistrering använder decimaltimmar; max 2 decimaler
    return String(h);
  }

  /**
   * Pixel-offset för «nu»-markör i tidsrutnätet (från trackens topp).
   * null om tiden ligger utanför [DAY_START, DAY_END].
   */
  function nowMarkerOffsetPx(now) {
    const d = now instanceof Date ? now : new Date();
    if (Number.isNaN(d.getTime())) return null;
    const mins = d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
    const start = dayStartMinutes();
    const end = dayEndMinutes();
    if (mins < start || mins > end) return null;
    return ((mins - start) / 60) * PX_PER_HOUR;
  }

  /** Visa nu-markör i given dags kolumn om datumet är idag och tiden i rutnätet. */
  function shouldShowNowMarker(dayIso, now) {
    const d = now instanceof Date ? now : new Date();
    if (Number.isNaN(d.getTime())) return false;
    if (dateIso(d) !== String(dayIso || '').slice(0, 10)) return false;
    return nowMarkerOffsetPx(d) != null;
  }

  /** Helg (lör–sön) kollapsad som standard; auto-expand om helgen har block. */
  const WEEKEND_STORAGE_KEY = 'clientflow-kalender-weekend';

  function loadStoredWeekendExpanded(storage) {
    try {
      const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
      if (!store || !store.getItem) return null;
      const raw = String(store.getItem(WEEKEND_STORAGE_KEY) || '').trim().toLowerCase();
      if (raw === '1' || raw === 'true' || raw === 'expanded') return true;
      if (raw === '0' || raw === 'false' || raw === 'collapsed') return false;
      return null;
    } catch (_) {
      return null;
    }
  }

  function saveStoredWeekendExpanded(expanded, storage) {
    try {
      const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
      if (!store || !store.setItem) return;
      store.setItem(WEEKEND_STORAGE_KEY, expanded ? 'expanded' : 'collapsed');
    } catch (_) { /* ignore */ }
  }

  /**
   * null-sparat = auto: expandera om helgen har block, annars kollapsa.
   * Explicit true/false från localStorage vinner över auto.
   */
  function resolveWeekendExpanded(hasWeekendBlocks, stored) {
    if (stored === true || stored === false) return stored;
    return !!hasWeekendBlocks;
  }

  function isWeekendIso(iso) {
    const d = parseIso(iso);
    if (!d) return false;
    const wd = d.getDay();
    return wd === 0 || wd === 6;
  }

  /** Filter-badge: antal avvikelser från standard (Alla typer + Ej klara + Klara). */
  function filterBadgeCount({ activeType, showOpen, showDone } = {}) {
    let n = 0;
    if (String(activeType || 'Alla').trim() !== 'Alla') n += 1;
    if (!showOpen) n += 1;
    if (!showDone) n += 1;
    return n;
  }

  const SIDE_GROUP_KEYS = ['overdue', 'thisWeek', 'nextWeek', 'later'];
  const SIDE_GROUP_LABELS = {
    overdue: 'Försenade',
    thisWeek: 'Den här veckan',
    nextWeek: 'Nästa vecka',
    later: 'Senare'
  };
  const SIDE_GROUP_PAGE = 5;

  /**
   * Gruppera sidopanelrader efter deadline (fallback: placeDate).
   * @param {Array<{ deadline?: string, placeDate?: string, overdue?: boolean }>} items
   * @param {{ todayIso: string, weekStart: string, weekEnd: string }} ctx
   */
  function groupSidePanelItems(items, ctx) {
    const todayIso = String((ctx && ctx.todayIso) || '').slice(0, 10);
    const weekStart = String((ctx && ctx.weekStart) || '').slice(0, 10);
    const weekEnd = String((ctx && ctx.weekEnd) || '').slice(0, 10);
    const nextStart = weekEnd ? dateIso(addDays(parseIso(weekEnd) || new Date(), 1)) : '';
    const nextEnd = nextStart ? dateIso(addDays(parseIso(nextStart) || new Date(), 6)) : '';
    const groups = {
      overdue: [],
      thisWeek: [],
      nextWeek: [],
      later: []
    };
    (items || []).forEach((item) => {
      if (!item) return;
      const deadline = String(item.deadline || item.placeDate || '').slice(0, 10);
      const overdue = item.overdue === true
        || (!!deadline && !!todayIso && deadline < todayIso && item.overdue !== false);
      if (overdue) {
        groups.overdue.push(item);
        return;
      }
      if (deadline && weekStart && weekEnd && deadline >= weekStart && deadline <= weekEnd) {
        groups.thisWeek.push(item);
        return;
      }
      if (deadline && nextStart && nextEnd && deadline >= nextStart && deadline <= nextEnd) {
        groups.nextWeek.push(item);
        return;
      }
      groups.later.push(item);
    });
    return SIDE_GROUP_KEYS.map((key) => ({
      key,
      label: SIDE_GROUP_LABELS[key],
      items: groups[key],
      count: groups[key].length
    })).filter((g) => g.count > 0);
  }

  /** Arbetstid per dag (t) – default 8 om tomt/ogiltigt. */
  const DEFAULT_WORK_HOURS_PER_DAY = 8;
  const WORK_HOURS_FIELD = 'Arbetstid per dag (t)';

  function parseWorkHoursPerDay(raw) {
    if (raw == null || raw === '') return DEFAULT_WORK_HOURS_PER_DAY;
    const n = Number(String(raw).replace(',', '.'));
    if (!Number.isFinite(n) || n <= 0) return DEFAULT_WORK_HOURS_PER_DAY;
    return Math.round(n * 100) / 100;
  }

  /**
   * Bokad tid för en dag: ClientFlow-block + timed Google (ej heldag, ej free/transparent).
   * Förväntar expanderade kalenderinstanser (en post per synligt tidblock).
   * @param {Array} dayEvents
   * @param {(start:string,end:string)=>number|null} durationHoursFn
   */
  function bookedHoursForDay(dayEvents, durationHoursFn) {
    const dur = typeof durationHoursFn === 'function' ? durationHoursFn : durationHours;
    let total = 0;
    (dayEvents || []).forEach((ev) => {
      if (!ev || !ev.scheduledStart) return;
      if (ev.allDay) return;
      const isGoogle = ev.source === 'google' || String(ev.key || '').startsWith('gcal:');
      if (isGoogle) {
        const tr = String(ev.transparency || '').toLowerCase();
        if (tr === 'transparent' || tr === 'free') return;
      }
      const h = dur(ev.scheduledStart, ev.scheduledEnd);
      if (h != null && h > 0) total += h;
    });
    return Math.round(total * 100) / 100;
  }

  /**
   * Kapacitetsvisning i dagshuvud.
   * @param {number} booked
   * @param {number} capacity
   * @param {{ showCapacity?: boolean }} opts showCapacity=false → bara bokade timmar (Byrån)
   */
  function dayCapacityDisplay(booked, capacity, opts) {
    const showCapacity = !opts || opts.showCapacity !== false;
    const b = Math.round((Number(booked) || 0) * 100) / 100;
    const cap = parseWorkHoursPerDay(capacity);
    if (!showCapacity) {
      return {
        booked: b,
        capacity: null,
        pct: null,
        label: `${formatHoursShort(b)} t`,
        status: null,
        statusLabel: '',
        barPct: null
      };
    }
    const pct = cap > 0 ? (b / cap) * 100 : 0;
    let status = null;
    let statusLabel = '';
    if (pct > 110) {
      status = 'overbooked';
      statusLabel = 'Överbokad';
    } else if (pct >= 100) {
      status = 'full';
      statusLabel = 'Fullt';
    }
    const label = statusLabel || `${formatHoursShort(b)} / ${formatHoursShort(cap)} t`;
    return {
      booked: b,
      capacity: cap,
      pct: Math.round(pct * 10) / 10,
      label,
      status,
      statusLabel,
      barPct: Math.min(100, Math.round(pct))
    };
  }

  function formatHoursShort(n) {
    const x = Math.round((Number(n) || 0) * 100) / 100;
    if (Number.isInteger(x)) return String(x);
    return String(x).replace(/\.?0+$/, '');
  }

  /**
   * Pixel-offset att scrolla tidsrutnät till (08:00, eller «nu» om idag ingår).
   * Relativt trackens topp.
   */
  function timedScrollOffsetPx(now, weekDayIsos) {
    const d = now instanceof Date ? now : new Date();
    const todayStr = dateIso(d);
    const days = Array.isArray(weekDayIsos) ? weekDayIsos : [];
    const hasToday = days.some((iso) => String(iso).slice(0, 10) === todayStr);
    let targetMin = 8 * 60;
    if (hasToday) {
      const mins = d.getHours() * 60 + d.getMinutes();
      if (mins >= dayStartMinutes() && mins <= dayEndMinutes()) {
        targetMin = mins;
      }
    }
    return ((targetMin - dayStartMinutes()) / 60) * PX_PER_HOUR;
  }

  return {
    VIEWS,
    STORAGE_KEY,
    DAY_START_HOUR,
    DAY_END_HOUR,
    SNAP_MINUTES,
    DEFAULT_BLOCK_MINUTES,
    PX_PER_HOUR,
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
    weekDays,
    dayStartMinutes,
    dayEndMinutes,
    daySpanMinutes,
    hourLabels,
    snapMinutes,
    minutesOfDay,
    parseDateTime,
    toLocalDateTimeIso,
    durationHours,
    durationMinutes,
    normalizeSchedule,
    blockLayout,
    BLOCK_GAP_PX,
    blockPositionStyle,
    blockPositionStyleAttr,
    yToMinutes,
    moveBlock,
    resizeBlock,
    resizeBlockStart,
    placementDate,
    inVisibleRangeForEvent,
    EVENT_MODES,
    EVENT_MODE_STORAGE_KEY,
    normalizeEventMode,
    loadStoredEventMode,
    saveStoredEventMode,
    isDoneStatus,
    isOpenEventInRange,
    placementDateOpen,
    fmtTimeLabel,
    tidPrefillHours,
    nowMarkerOffsetPx,
    shouldShowNowMarker,
    WEEKEND_STORAGE_KEY,
    loadStoredWeekendExpanded,
    saveStoredWeekendExpanded,
    resolveWeekendExpanded,
    isWeekendIso,
    filterBadgeCount,
    SIDE_GROUP_KEYS,
    SIDE_GROUP_LABELS,
    SIDE_GROUP_PAGE,
    groupSidePanelItems,
    DEFAULT_WORK_HOURS_PER_DAY,
    WORK_HOURS_FIELD,
    parseWorkHoursPerDay,
    bookedHoursForDay,
    dayCapacityDisplay,
    formatHoursShort,
    timedScrollOffsetPx
  };
});
