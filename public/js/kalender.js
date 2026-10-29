/**
 * Kalender – månad / vecka / dag över uppdragskörningar (deadline).
 * Data: GET /api/uppdrag/byra (samma som Uppdrag översikt).
 */
(function () {
  const gridEl = document.getElementById('kal-grid');
  if (!gridEl) return;

  const KV = window.KalenderView;
  if (!KV) {
    console.error('Kalender: saknar kalender-view.js');
    return;
  }
  const KE = window.KalenderEvents;
  if (!KE || typeof KE.buildEventsFromRuns !== 'function') {
    console.error('Kalender: saknar kalender-events.js');
    return;
  }
  const SB = window.KalenderScheduleBlocks;
  if (!SB || typeof SB.parseBlocksFromFields !== 'function') {
    console.error('Kalender: saknar kalender-schedule-blocks.js');
    return;
  }
  const GA = window.KalenderGcalActions;
  const ME = window.KalenderMeetingEvents;

  const baseUrl = (window.apiConfig && window.apiConfig.baseUrl) || 'http://localhost:3001';
  const authOpts = () => (window.AuthManager && AuthManager.getAuthFetchOptions
    ? AuthManager.getAuthFetchOptions()
    : { credentials: 'include', headers: { 'Content-Type': 'application/json' } });

  const el = {
    loading: document.getElementById('kal-loading'),
    noAuth: document.getElementById('kal-no-auth'),
    content: document.getElementById('kal-content'),
    month: document.getElementById('kal-month'),
    prev: document.getElementById('kal-prev'),
    next: document.getElementById('kal-next'),
    today: document.getElementById('kal-today'),
    mine: document.getElementById('kal-scope-mine'),
    byra: document.getElementById('kal-scope-byra'),
    search: document.getElementById('kal-search'),
    sideList: document.getElementById('kal-side-list'),
    sideCount: document.getElementById('kal-side-count'),
    side: document.getElementById('kal-side'),
    gridWrap: document.getElementById('kal-grid-wrap'),
    weekdays: document.getElementById('kal-weekdays'),
    detail: document.getElementById('kal-detail'),
    detailTitle: document.getElementById('kal-detail-title'),
    detailBody: document.getElementById('kal-detail-body'),
    statusOpen: document.getElementById('kal-status-open'),
    statusDone: document.getElementById('kal-status-done'),
    modeDeadline: document.getElementById('kal-mode-deadline'),
    modeOpen: document.getElementById('kal-mode-open'),
    sideLabel: document.getElementById('kal-side-label'),
    filterBtn: document.getElementById('kal-filter-btn'),
    filterMenu: document.getElementById('kal-filter-menu'),
    filterBadge: document.getElementById('kal-filter-badge'),
    typeTabs: Array.from(document.querySelectorAll('[data-kal-typ]')),
    viewTabs: Array.from(document.querySelectorAll('[data-kal-view]'))
  };

  const LONE = 'Löneuppdrag';
  const OVRIGA = 'Övriga';
  const MAX_CHIPS_MONTH = 3;
  const MAX_CHIPS_WEEK = 8;

  let scope = 'byra';
  let activeType = 'Alla';
  let showOpen = true;
  let showDone = true;
  let q = '';
  let view = KV.loadStoredView();
  let eventMode = KV.loadStoredEventMode();
  let focus = KV.goToday(view, new Date());
  let records = [];
  let runRecords = [];
  let events = [];
  let byKey = new Map();
  let dragState = null;
  let saveToastTimer = null;
  /** Nyckel för öppnad detaljpanel – synkas efter drag/resize av tidblock. */
  let openDetailKey = null;
  let gcalStatus = null;
  /** Händelser hämtade från Google Calendar (source: google). */
  let googleEvents = [];
  let gcalPullSeq = 0;
  /** Bokade mötesinbjudningar från Airtable (source: meeting). */
  let meetingEvents = [];
  let meetingPullSeq = 0;
  /** Uppdaterar «nu»-markören i vecko-/dagsvy (varje minut). */
  let nowMarkerTimer = null;
  /** Kundlista för Google-möte → tid/anteckning. */
  let gcalCustomers = [];
  let gcalCustomersLoaded = false;
  /** Helg expand/kollaps: null = auto, true/false = användarval (localStorage). */
  let weekendExpandedPref = KV.loadStoredWeekendExpanded();
  /** Sidopanel: antal synliga rader per grupp (Visa N till). */
  let sideGroupVisible = {};
  /** Popover för «N deadlines» i heldagsrad. */
  let deadlinesPopover = null;

  function show(node, on) { if (node) node.style.display = on ? '' : 'none'; }
  function esc(s) {
    return String(s || '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }
  function toDate(iso) {
    const s = String(iso || '').slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
  }
  function today() { return KV.dateIso(new Date()); }
  function safeJson(raw, fb) {
    try {
      const v = raw ? JSON.parse(String(raw)) : fb;
      return v == null ? fb : v;
    } catch (_) { return fb; }
  }

  function isLone(typ) {
    return !!(window.LonePeriod && LonePeriod.isLoneTyp(typ));
  }
  function isOvriga(typ) {
    const t = String(typ || '').trim();
    if (!t) return false;
    if (window.UppdragTyp && UppdragTyp.isStandardUppdragTyp) {
      return !UppdragTyp.isStandardUppdragTyp(t);
    }
    return t === 'Eget uppdrag';
  }
  function typeMatch(typ) {
    if (activeType === 'Alla') return true;
    if (activeType === LONE) return isLone(typ);
    if (activeType === OVRIGA) return isOvriga(typ);
    return String(typ || '').trim() === activeType;
  }
  function displayName(typ, fields) {
    if (window.UppdragTyp && UppdragTyp.uppdragDisplayName) {
      return UppdragTyp.uppdragDisplayName(typ, fields);
    }
    if (isLone(typ) && window.LonePeriod && LonePeriod.typDisplayLabel) {
      return LonePeriod.typDisplayLabel(typ);
    }
    return String(typ || 'Uppdrag');
  }
  function typShort(typ) {
    const t = String(typ || '').trim();
    if (isLone(t)) return 'Lön';
    if (t === 'Momsredovisning') return 'Moms';
    if (t === 'Bokslut') return 'Bokslut';
    if (t === 'Deklaration') return 'Dekl.';
    return t ? (t.length > 8 ? `${t.slice(0, 7)}…` : t) : 'Övrigt';
  }

  function statusOf(ev) {
    // Per tillfälle: Klar bara för det block som är done — inte via körningens Status
    if (ev && ev.blockId && Array.isArray(ev.scheduleBlocks) && typeof SB.instanceStatus === 'function') {
      const block = ev.scheduleBlocks.find((b) => b && b.id === ev.blockId);
      const runSt = String(ev.status || ev.runRec?.fields?.Status || '').trim();
      return SB.instanceStatus(runSt, block || { id: ev.blockId, done: !!ev.blockDone }, ev.scheduleBlocks);
    }
    if (ev && ev.blockDone === true) return 'Klar';
    const st = String(ev.status || '').trim();
    if (st) return st;
    const pk = String(ev.periodKey || '').trim();
    const hist = safeJson(String(ev.record?.fields?.['Historik'] || '').trim(), []);
    if (pk && Array.isArray(hist)) {
      const hit = hist.find((h) => h && String(h.periodKey || '').trim() === pk);
      if (hit) return String(hit.status || '').trim() || 'Planerad';
    }
    return 'Planerad';
  }

  function statusClass(status, deadline) {
    const st = String(status || '').trim();
    if (st === 'Klar' || st === 'Avslutad') return 'klar';
    if (st === 'Sen') return 'sen';
    const KorVis = window.KoringVisibility;
    if (KorVis && KorVis.isOverdueNotDone({ Status: st, Deadline: deadline }, today())) return 'sen';
    if (st === 'Pågående') return 'pagande';
    return 'planerad';
  }

  function statusLabel(status, deadline) {
    const c = statusClass(status, deadline);
    if (c === 'sen') return 'Försenad';
    if (c === 'klar') return 'Klar';
    if (c === 'pagande') return 'Pågående';
    return 'Planerad';
  }

  function buildEvents() {
    // Endast riktiga Uppdragskörningar — inte föräldra-uppdrag / historik / syntetiska perioder.
    const cf = KE.buildEventsFromRuns({
      records,
      runRecords,
      range: KV.visibleRange(view, focus),
      helpers: {
        MomsPeriod: window.MomsPeriod || null,
        LonePeriod: window.LonePeriod || null,
        isLone,
        inVisibleRangeForEvent: (deadline, scheduledStart, range) =>
          KV.inVisibleRangeForEvent(deadline, scheduledStart, range)
      }
    });
    const expanded = typeof KE.expandScheduleInstances === 'function'
      ? KE.expandScheduleInstances(cf)
      : SB.expandScheduleInstances(cf);
    let gcal = Array.isArray(googleEvents) ? googleEvents : [];
    let meetings = Array.isArray(meetingEvents) ? meetingEvents : [];
    if (ME && typeof ME.mergeMeetingWithGoogleEvents === 'function') {
      const merged = ME.mergeMeetingWithGoogleEvents(meetings, gcal);
      gcal = merged.googleEvents;
      meetings = merged.meetingEvents;
    }
    return expanded.concat(gcal).concat(meetings);
  }

  function eventByKey(key) {
    const k = String(key || '');
    if (!k) return null;
    if (byKey.has(k)) return byKey.get(k);
    for (const ev of byKey.values()) {
      if (String(ev.runKey || '') === k) return ev;
    }
    return null;
  }

  function blocksOf(ev) {
    if (!ev || isOverlayCalendarEvent(ev)) return [];
    if (Array.isArray(ev.scheduleBlocks) && ev.scheduleBlocks.length) {
      return SB.sortBlocks(ev.scheduleBlocks);
    }
    if (ev.runRec) return SB.parseBlocksFromFields(ev.runRec.fields || {});
    const single = scheduleOf(ev);
    if (!single) return [];
    return [{ id: ev.blockId || 'legacy', start: single.start, end: single.end }];
  }

  function totalScheduledHours(ev) {
    const blocks = blocksOf(ev);
    if (blocks.length) {
      return Math.round(SB.totalHours(blocks, KV.durationHours) * 100) / 100;
    }
    const sched = scheduleOf(ev);
    return sched && sched.hours > 0 ? sched.hours : 0;
  }

  function estimatedHoursOf(ev) {
    if (!ev || isOverlayCalendarEvent(ev)) return null;
    if (ev.estimatedHours != null) return SB.parseEstimatedHours({ [SB.FIELD_ESTIMATE]: ev.estimatedHours });
    if (ev.runRec) return SB.parseEstimatedHours(ev.runRec.fields || {});
    return null;
  }

  function planningOf(ev) {
    return SB.planningProgress(estimatedHoursOf(ev), totalScheduledHours(ev));
  }

  async function persistEstimate(ev, hours) {
    const runId = String(ev.runRec?.id || '').trim();
    if (!runId) {
      showSaveToast('Saknar uppdragskörning.', true);
      return false;
    }
    try {
      const res = await fetch(`${baseUrl}/api/uppdrag/runs/${encodeURIComponent(runId)}/estimate`, {
        method: 'PATCH',
        ...authOpts(),
        headers: {
          ...(authOpts().headers || {}),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ hours })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      if (data.record) {
        ev.runRec = data.record;
        const idx = runRecords.findIndex((r) => r.id === data.record.id);
        if (idx >= 0) runRecords[idx] = data.record;
        else runRecords.push(data.record);
      }
      ev.estimatedHours = data.estimatedHours != null
        ? data.estimatedHours
        : SB.parseEstimatedHours((data.record && data.record.fields) || {});
      showSaveToast(ev.estimatedHours != null
        ? `Uppskattad tid: ${ev.estimatedHours} t`
        : 'Uppskattad tid borttagen');
      return true;
    } catch (err) {
      console.error('Kalender estimate:', err);
      showSaveToast(err.message || 'Kunde inte spara uppskattning', true);
      return false;
    }
  }

  async function buildTidPayloadForSchedule(ev, sched) {
    const f = ev.record?.fields || {};
    const runF = ev.runRec?.fields || {};
    const runId = String(ev.runRec?.id || '').trim();
    const kundId = String(f['Kund ID'] || runF['Kund ID'] || '').trim();
    const name = String(f['Kundnamn'] || f['Namn'] || 'Klient');
    const uppdragId = String(ev.record?.id || runF['Uppdrag ID'] || '').trim();
    if (!sched || !(sched.hours > 0)) throw new Error('Avsätt tid i kalendern först.');
    if (!kundId) throw new Error('Saknar kundkoppling.');
    const helper = window.KalenderKlarTid;
    const build = helper && helper.buildKalenderTidPayload ? helper.buildKalenderTidPayload : null;
    const args = {
      customerId: kundId,
      customerName: name,
      uppdragId,
      uppdragsnamn: displayName(ev.typ, f),
      koringId: runId,
      hours: sched.hours,
      date: sched.date,
      start: sched.start,
      end: sched.end,
      status: 'Klar'
    };
    if (build) return build(args);
    return {
      customerId: kundId,
      customerName: name,
      uppdragId,
      uppdragsnamn: displayName(ev.typ, f),
      koringId: runId,
      date: sched.date,
      hours: sched.hours,
      start: sched.start || '',
      end: sched.end || '',
      activity: 'Uppdragsarbete',
      description: `Avsatt tid ${KV.fmtTimeLabel(sched.startMin)}–${KV.fmtTimeLabel(sched.endMin)} (från kalender)`,
      status: 'Klar'
    };
  }

  async function postTidPayload(tidBody) {
    const tidRes = await fetch(`${baseUrl}/api/tidregistrering`, {
      method: 'POST',
      ...authOpts(),
      headers: {
        ...(authOpts().headers || {}),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(tidBody)
    });
    const tidData = await tidRes.json().catch(() => ({}));
    if (!tidRes.ok) throw new Error(tidData.error || 'Kunde inte registrera tid');
    return tidData;
  }

  async function patchRunStatus(ev, runId, status) {
    const stRes = await fetch(`${baseUrl}/api/uppdrag/runs/${encodeURIComponent(runId)}/status`, {
      method: 'PATCH',
      ...authOpts(),
      headers: {
        ...(authOpts().headers || {}),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ status })
    });
    const stData = await stRes.json().catch(() => ({}));
    if (!stRes.ok) throw new Error(stData.error || 'Statusuppdatering misslyckades');
    if (stData.record) {
      ev.runRec = stData.record;
      const idx = runRecords.findIndex((r) => r.id === stData.record.id);
      if (idx >= 0) runRecords[idx] = stData.record;
      else runRecords.push(stData.record);
    }
    return stData;
  }

  /**
   * Ångra klarmarkering av ETT tillfälle (clear block.done).
   * Om körningen var Klar och inte alla tillfällen längre är klara → Status Pågående.
   */
  async function angraKlarTillfalle(ev, opts) {
    const options = opts || {};
    const blockId = String(options.blockId || ev.blockId || '').trim();
    if (!blockId) {
      showSaveToast('Välj ett tillfälle i kalendern först.', true);
      return;
    }
    const block = blocksOf(ev).find((b) => b.id === blockId);
    if (!block) {
      showSaveToast('Tillfället hittades inte.', true);
      return;
    }
    const runId = String(ev.runRec?.id || '').trim();
    if (!runId) {
      showSaveToast('Saknar uppdragskörning.', true);
      return;
    }

    try {
      const ok = await persistSchedule(ev, null, null, { mode: 'uncomplete', blockId });
      if (!ok) return;
      const nextBlocks = blocksOf(ev);
      const everyDone = typeof SB.allBlocksDone === 'function'
        ? SB.allBlocksDone(nextBlocks)
        : nextBlocks.every((b) => SB.isBlockDone(b));
      const runStatus = String(ev.runRec?.fields?.Status || '').trim();
      if (!everyDone && (runStatus === 'Klar' || runStatus === 'Avslutad')) {
        try {
          await patchRunStatus(ev, runId, 'Pågående');
          ev.status = 'Pågående';
          const runKey = String(ev.runKey || String(ev.key || '').split('#')[0] || '').trim();
          if (runKey) {
            events.forEach((e) => {
              if (String(e.runKey || String(e.key || '').split('#')[0] || '') !== runKey) return;
              if (e.runRec) {
                e.runRec.fields = { ...(e.runRec.fields || {}), Status: 'Pågående' };
              }
            });
          }
        } catch (_) { /* best-effort */ }
      }
      showSaveToast('Klarmarkering ångrad');
      render();
      refreshOpenDetail();
    } catch (err) {
      console.error('Kalender ångra klar tillfälle:', err);
      showSaveToast((err && err.message) || 'Kunde inte ångra', true);
    }
  }

  /** Ångra hela körningens klarmarkering (alla tillfällen öppna + Status Pågående). */
  async function angraKlarHela(ev) {
    const runId = String(ev.runRec?.id || '').trim();
    if (!runId) {
      showSaveToast('Saknar uppdragskörning.', true);
      return;
    }
    try {
      const list = blocksOf(ev);
      if (list.length) {
        const ok = await persistSchedule(ev, null, null, { mode: 'uncomplete-all' });
        if (!ok) return;
      }
      const runStatus = String(ev.runRec?.fields?.Status || '').trim();
      if (runStatus === 'Klar' || runStatus === 'Avslutad' || !list.length) {
        await patchRunStatus(ev, runId, 'Pågående');
      }
      ev.status = 'Pågående';
      const runKey = String(ev.runKey || String(ev.key || '').split('#')[0] || '').trim();
      if (runKey) {
        events.forEach((e) => {
          if (String(e.runKey || String(e.key || '').split('#')[0] || '') !== runKey) return;
          e.status = 'Pågående';
          e.blockDone = false;
          if (e.runRec) {
            e.runRec.fields = { ...(e.runRec.fields || {}), Status: 'Pågående' };
          }
          if (Array.isArray(e.scheduleBlocks)) {
            e.scheduleBlocks = e.scheduleBlocks.map((b) => {
              if (!b || typeof b !== 'object') return b;
              const next = { id: b.id, start: b.start, end: b.end };
              if (b.note) next.note = b.note;
              return next;
            });
          }
        });
      }
      showSaveToast('Klarmarkering ångrad');
      render();
      refreshOpenDetail();
    } catch (err) {
      console.error('Kalender ångra klar hela:', err);
      showSaveToast((err && err.message) || 'Kunde inte ångra', true);
    }
  }

  /**
   * Delvis: klarmarkera ETT tillfälle (block.done).
   * Körningens Status blir Klar först när ALLA tillfällen är klara.
   */
  async function klarTillfalle(ev, opts) {
    const options = opts || {};
    const withTid = options.withTid !== false;
    const blockId = String(options.blockId || ev.blockId || '').trim();
    if (!blockId) {
      showSaveToast('Välj ett tillfälle i kalendern först.', true);
      return;
    }
    const block = blocksOf(ev).find((b) => b.id === blockId);
    if (!block) {
      showSaveToast('Tillfället hittades inte.', true);
      return;
    }
    const sched = KV.normalizeSchedule(block.start, block.end);
    if (!sched || !(sched.hours > 0)) {
      showSaveToast('Tillfället saknar giltig tid.', true);
      return;
    }
    const runId = String(ev.runRec?.id || '').trim();
    if (!runId) {
      showSaveToast('Saknar uppdragskörning.', true);
      return;
    }

    try {
      if (withTid) {
        const tidBody = await buildTidPayloadForSchedule(ev, sched);
        await postTidPayload(tidBody);
      }
      // Behåll blocket i kalendern — markera som done så man ser vad som gjorts
      const ok = await persistSchedule(ev, null, null, { mode: 'complete', blockId });
      if (!ok) return;
      if (!showDone) {
        showDone = true;
        syncUi();
      }
      const nextBlocks = blocksOf(ev);
      const everyDone = typeof SB.allBlocksDone === 'function'
        ? SB.allBlocksDone(nextBlocks)
        : nextBlocks.every((b) => SB.isBlockDone(b));
      // Viktigt: läs körningsstatus från runRec — inte ev.status (som är Klar för tillfället)
      const runStatus = String(ev.runRec?.fields?.Status || '').trim();
      if (everyDone) {
        await patchRunStatusKlar(ev, runId);
      } else if (runStatus === 'Planerad' || !runStatus) {
        try {
          await patchRunStatus(ev, runId, 'Pågående');
        } catch (_) { /* best-effort */ }
      }
      showSaveToast(withTid
        ? `Tillfälle klart · ${sched.hours} t registrerad`
        : (everyDone ? 'Sista tillfället klarmarkerat · körningen klar' : 'Tillfälle klarmarkerat'));
      render();
      refreshOpenDetail();
    } catch (err) {
      console.error('Kalender klar tillfälle:', err);
      showSaveToast((err && err.message) || 'Kunde inte spara', true);
    }
  }

  function isGoogleEvent(ev) {
    return !!(ev && (ev.source === 'google' || String(ev.key || '').startsWith('gcal:')));
  }

  function isMeetingEvent(ev) {
    return !!(ev && (ev.source === 'meeting' || String(ev.key || '').startsWith('meeting:')));
  }

  function isOverlayCalendarEvent(ev) {
    return isGoogleEvent(ev) || isMeetingEvent(ev);
  }

  function eventMeetingUrl(ev) {
    if (!ev) return '';
    if (GA && typeof GA.extractMeetingUrl === 'function') {
      const fromGa = GA.extractMeetingUrl(ev);
      if (fromGa) return fromGa;
    }
    if (ME && typeof ME.meetingUrlFromInvite === 'function') {
      const fromMe = ME.meetingUrlFromInvite(ev);
      if (fromMe) return fromMe;
    }
    return String(ev.meetingUrl || ev.hangoutLink || '').trim();
  }

  function meetLinkChipHtml(ev) {
    const url = eventMeetingUrl(ev);
    if (!url) return '';
    const label = (ME && typeof ME.shortMeetingLabel === 'function')
      ? ME.shortMeetingLabel(url)
      : 'Möteslänk';
    return `<a class="kalender-block-meet" href="${esc(url)}" target="_blank" rel="noopener noreferrer"
      title="${esc(url)}" onclick="event.stopPropagation()"><i class="fas fa-video" aria-hidden="true"></i> ${esc(label)}</a>`;
  }

  /** Säker CSS-färg från Google (hex/rgb) — används bara på source:google. */
  function safeCssColor(raw) {
    const s = String(raw || '').trim();
    if (/^#[0-9a-fA-F]{3}$/.test(s) || /^#[0-9a-fA-F]{6}$/.test(s) || /^#[0-9a-fA-F]{8}$/.test(s)) {
      return s;
    }
    const rgb = s.match(/^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i);
    if (rgb) {
      const nums = [rgb[1], rgb[2], rgb[3]].map((n) => Math.min(255, Math.max(0, Number(n))));
      return `rgb(${nums[0]}, ${nums[1]}, ${nums[2]})`;
    }
    return '';
  }

  /** Google-färg som liten prick — block/chip själva är neutrala. */
  function googleColorDotHtml(ev) {
    if (!isGoogleEvent(ev)) return '';
    const bg = safeCssColor(ev.backgroundColor) || '#9aa3ab';
    return `<span class="kalender-gcal-dot" style="background-color:${esc(bg)}" aria-hidden="true"></span>`;
  }

  function workHoursPerDay() {
    const user = window.AuthManager && AuthManager.getCurrentUser ? AuthManager.getCurrentUser() : null;
    const raw = user && (user.workHoursPerDay != null ? user.workHoursPerDay : user[KV.WORK_HOURS_FIELD]);
    return KV.parseWorkHoursPerDay(raw);
  }

  function mergeStyleAttr(...parts) {
    return parts
      .map((p) => String(p || '').trim().replace(/;+$/, ''))
      .filter(Boolean)
      .join(';');
  }

  function searchMatch(rec) {
    if (!q) return true;
    const f = rec.fields || {};
    const hay = [f['Kundnamn'], f['Namn'], f['Ansvarig'], f['Klientansvarig'], f['Typ'], f['Frekvens']]
      .filter(Boolean).join(' ').toLowerCase();
    return hay.includes(q.toLowerCase());
  }

  function eventVisibleInMode(ev) {
    if (eventMode !== 'open') return !!ev.inRange;
    const range = KV.visibleRange(view, focus);
    return KV.isOpenEventInRange(
      ev.startDate,
      ev.deadline,
      statusOf(ev),
      range,
      today(),
      ev.scheduledStart
    );
  }

  function placeDateOf(ev) {
    // Schemalagda tidblock ligger alltid på sin riktiga dag (även i Öppna-läge),
    // så de inte «flyttas» till deadline/idag när dagen ligger utanför synlig period.
    const sched = scheduleOf(ev);
    if (sched) return sched.date;
    if (eventMode === 'open') {
      return KV.placementDateOpen(
        ev.scheduledStart,
        ev.deadline,
        ev.startDate,
        KV.visibleRange(view, focus),
        today()
      ) || toDate(ev.deadline);
    }
    return KV.placementDate(ev.scheduledStart, ev.deadline) || toDate(ev.deadline);
  }

  function filtered() {
    return events.filter((ev) => {
      if (isOverlayCalendarEvent(ev)) {
        if (activeType !== 'Alla') return false;
        if (!eventVisibleInMode(ev)) return false;
        if (!searchMatch(ev.record)) return false;
        return true;
      }
      if (!eventVisibleInMode(ev)) return false;
      if (!typeMatch(ev.typ)) return false;
      if (!searchMatch(ev.record)) return false;
      const st = statusOf(ev);
      const done = st === 'Klar' || st === 'Avslutad';
      if (showOpen && showDone) return true;
      if (!showOpen && !showDone) return true;
      if (showOpen && !showDone) return !done;
      if (!showOpen && showDone) return done;
      return true;
    }).sort((a, b) => {
      const da = placeDateOf(a) || '';
      const db = placeDateOf(b) || '';
      const d = da.localeCompare(db);
      if (d) return d;
      const sa = scheduleOf(a);
      const sb = scheduleOf(b);
      const ta = sa ? sa.startMin : 9999;
      const tb = sb ? sb.startMin : 9999;
      if (ta !== tb) return ta - tb;
      const an = String(a.record?.fields?.['Kundnamn'] || a.summary || '').toLowerCase();
      const bn = String(b.record?.fields?.['Kundnamn'] || b.summary || '').toLowerCase();
      return an.localeCompare(bn, 'sv');
    });
  }

  function byDay(list) {
    const map = new Map();
    list.forEach((ev) => {
      const dl = placeDateOf(ev);
      if (!dl) return;
      const arr = map.get(dl) || [];
      arr.push(ev);
      map.set(dl, arr);
    });
    return map;
  }

  function cellsForMonth(focusDate) {
    const y = focusDate.getFullYear();
    const m = focusDate.getMonth();
    const pad = (new Date(y, m, 1).getDay() + 6) % 7;
    const days = new Date(y, m + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < pad; i++) cells.push(null);
    for (let d = 1; d <= days; d++) {
      cells.push(`${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    }
    while (cells.length % 7) cells.push(null);
    return cells;
  }

  function scheduleOf(ev) {
    return KV.normalizeSchedule(ev.scheduledStart, ev.scheduledEnd);
  }

  function hoursLabel(startMin, endMin) {
    const h = Math.round(((Number(endMin) - Number(startMin)) / 60) * 100) / 100;
    return Number.isFinite(h) && h > 0 ? h : 0;
  }

  /** Synka klarmarkeringsknappar när avsatt tid ändras i detaljpanelen. */
  function syncKlarActionButtons(hours, opts) {
    if (!el.detailBody) return;
    const options = opts || {};
    const focusHours = Number(hours) > 0 ? Number(hours) : 0;
    const totalHours = options.totalHours != null ? Number(options.totalHours) : focusHours;
    const hasFocusHours = focusHours > 0;
    const hasTotalHours = totalHours > 0;
    const klarTillfalleTidBtn = el.detailBody.querySelector('[data-klar-tillfalle-tid]');
    const klarTidBtn = el.detailBody.querySelector('[data-klar-tid]');
    const klarOnlyBtn = el.detailBody.querySelector('[data-klar-only]');
    if (klarTillfalleTidBtn) {
      klarTillfalleTidBtn.disabled = !hasFocusHours;
      klarTillfalleTidBtn.innerHTML = hasFocusHours
        ? `<i class="fas fa-check"></i> Klarmarkera tillfälle & tid (${focusHours} t)`
        : '<i class="fas fa-check"></i> Klarmarkera tillfälle & tid';
      klarTillfalleTidBtn.classList.toggle('btn-primary', hasFocusHours);
      klarTillfalleTidBtn.classList.toggle('btn-ghost', !hasFocusHours);
    }
    if (klarTidBtn) {
      klarTidBtn.disabled = !hasTotalHours;
      klarTidBtn.innerHTML = hasTotalHours
        ? `<i class="fas fa-check"></i> Klarmarkera hela & tid (${totalHours} t)`
        : '<i class="fas fa-check"></i> Klarmarkera hela & tid';
      // Hela-körningen är alltid sekundär när ett tillfälle är i fokus
      const focusScoped = !!el.detailBody.querySelector('[data-klar-tillfalle]');
      klarTidBtn.classList.toggle('btn-primary', hasTotalHours && !focusScoped);
      klarTidBtn.classList.toggle('btn-ghost', !hasTotalHours || focusScoped);
    }
    if (klarOnlyBtn) {
      const focusScoped = !!el.detailBody.querySelector('[data-klar-tillfalle]');
      klarOnlyBtn.classList.toggle('btn-primary', !hasTotalHours && !focusScoped);
      klarOnlyBtn.classList.toggle('btn-ghost', hasTotalHours || focusScoped);
    }
  }

  /** Uppdatera avsatt tid i öppen detaljpanel medan man drar/ändrar längd. */
  function previewDetailSchedule(key, startMin, endMin) {
    if (!openDetailKey || String(openDetailKey) !== String(key || '')) return;
    if (!el.detail || el.detail.hidden || !el.detailBody) return;
    const hours = hoursLabel(startMin, endMin);
    const label = `${KV.fmtTimeLabel(startMin)}–${KV.fmtTimeLabel(endMin)} (${hours} t)`;
    const dd = el.detailBody.querySelector('[data-avsatt-tid]');
    if (dd) dd.textContent = label;
    const openEv = eventByKey(openDetailKey);
    const totalH = openEv ? totalScheduledHours(openEv) : hours;
    syncKlarActionButtons(hours, { totalHours: totalH });
  }

  function applyKlarLocally(ev) {
    if (!ev) return;
    ev.status = 'Klar';
    if (ev.runRec) {
      ev.runRec.fields = { ...(ev.runRec.fields || {}), Status: 'Klar' };
    }
    const rid = String(ev.runRec?.id || '').trim();
    if (rid) {
      const rr = runRecords.find((r) => r.id === rid);
      if (rr) rr.fields = { ...(rr.fields || {}), Status: 'Klar' };
    }
  }

  async function patchRunStatusKlar(ev, runId) {
    const stRes = await fetch(`${baseUrl}/api/uppdrag/runs/${encodeURIComponent(runId)}/status`, {
      method: 'PATCH',
      ...authOpts(),
      headers: {
        ...(authOpts().headers || {}),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ status: 'Klar' })
    });
    const stData = await stRes.json().catch(() => ({}));
    if (!stRes.ok) throw new Error(stData.error || 'Klarmarkering misslyckades');
    if (stData.record) {
      ev.runRec = stData.record;
      const idx = runRecords.findIndex((r) => r.id === stData.record.id);
      if (idx >= 0) runRecords[idx] = stData.record;
    }
    applyKlarLocally(ev);
    // Behåll synlighet: Klara-filtret ska vara på så blocket inte försvinner.
    if (!showDone) {
      showDone = true;
      syncUi();
    }
  }

  /** Mejl skapat som uppgift: markera hanterat + fråga om svar i ClientFlow-inkorgen. */
  function afterKlarMejlLink(runId, uppdragId) {
    let navigatedToMejl = false;
    try {
      const linkApi =
        window.MejlTaskLink && MejlTaskLink.createApi ? MejlTaskLink.createApi() : null;
      if (linkApi && typeof linkApi.onKalenderKlar === 'function') {
        const result = linkApi.onKalenderKlar({
          runId,
          uppdragId,
          confirmFn: (msg) => window.confirm(msg),
          navigateFn: (url) => {
            navigatedToMejl = true;
            window.location.href = url;
          }
        });
        if (result && result.handled && !result.navigated) {
          showSaveToast('Mejlet markerat som hanterat');
        }
      }
    } catch (linkErr) {
      console.warn('Kalender mejl-länk:', linkErr);
    }
    return navigatedToMejl;
  }

  /** Markera alla tidblock som done innan hel-körning sätts till Klar. */
  async function completeAllScheduleBlocks(ev) {
    const list = blocksOf(ev);
    if (!list.length) return true;
    const open = list.filter((b) => !SB.isBlockDone(b));
    if (!open.length) return true;
    return persistSchedule(ev, null, null, { mode: 'complete-all' });
  }

  async function klarOnly(ev) {
    const runF = ev.runRec?.fields || {};
    const runId = String(ev.runRec?.id || '').trim();
    const uppdragId = String(ev.record?.id || runF['Uppdrag ID'] || '').trim();
    if (!runId) {
      showSaveToast('Saknar uppdragskörning – kan inte klarmarkera.', true);
      return;
    }

    const unfinished = blocksOf(ev).filter((b) => !SB.isBlockDone(b));
    if (unfinished.length > 1) {
      const okConfirm = window.confirm(
        `Klarmarkera hela körningen? Det markerar alla ${unfinished.length} tillfällen som klara.`
      );
      if (!okConfirm) return;
    }

    const btn = el.detailBody && el.detailBody.querySelector('[data-klar-only]');
    const tidBtn = el.detailBody && el.detailBody.querySelector('[data-klar-tid]');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sparar…';
    }
    if (tidBtn) tidBtn.disabled = true;

    try {
      // Markera alla tillfällen done så syskon inte «ärver» Klar utan egen done-flagga
      const blocksOk = await completeAllScheduleBlocks(ev);
      if (!blocksOk && blocksOf(ev).length) return;
      await patchRunStatusKlar(ev, runId);
      showSaveToast('Hela körningen klarmarkerad');
      const navigatedToMejl = afterKlarMejlLink(runId, uppdragId);
      if (navigatedToMejl) return;
      closeDetail();
      render();
    } catch (err) {
      console.error('Kalender klar:', err);
      showSaveToast((err && err.message) || 'Kunde inte klarmarkera', true);
      const totalH = totalScheduledHours(ev);
      const sched = scheduleOf(ev);
      const hours = sched && sched.hours > 0 ? sched.hours : 0;
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-check"></i> Klarmarkera hela';
      }
      syncKlarActionButtons(hours, { totalHours: totalH });
    }
  }

  async function klarAndRegisterTid(ev) {
    const f = ev.record?.fields || {};
    const runF = ev.runRec?.fields || {};
    const runId = String(ev.runRec?.id || '').trim();
    const kundId = String(f['Kund ID'] || runF['Kund ID'] || '').trim();
    const name = String(f['Kundnamn'] || f['Namn'] || 'Klient');
    const uppdragId = String(ev.record?.id || runF['Uppdrag ID'] || '').trim();
    const blockList = blocksOf(ev);
    const schedFallback = scheduleOf(ev);
    if (!blockList.length && (!schedFallback || !(schedFallback.hours > 0))) {
      showSaveToast('Avsätt tid i kalendern först (dra från listan eller i nederkant).', true);
      return;
    }
    if (!runId) {
      showSaveToast('Saknar uppdragskörning – kan inte klarmarkera.', true);
      return;
    }
    if (!kundId) {
      showSaveToast('Saknar kundkoppling.', true);
      return;
    }

    const unfinished = blockList.filter((b) => !SB.isBlockDone(b));
    if (unfinished.length > 1) {
      const okConfirm = window.confirm(
        `Klarmarkera hela körningen och registrera tid för alla ${unfinished.length} tillfällen?`
      );
      if (!okConfirm) return;
    }

    const helper = window.KalenderKlarTid;
    const build = helper && helper.buildKalenderTidPayload
      ? helper.buildKalenderTidPayload
      : null;
    const payloads = [];
    try {
      // Bara ej klara tillfällen — redan klarmarkerade ska inte dubbelregistreras
      const sources = blockList.length
        ? unfinished.map((b) => {
          const n = KV.normalizeSchedule(b.start, b.end);
          return n || { hours: 0, date: String(b.start || '').slice(0, 10), start: b.start, end: b.end, startMin: 0, endMin: 0 };
        })
        : [schedFallback];
      sources.forEach((sched) => {
        if (!sched || !(sched.hours > 0)) return;
        const args = {
          customerId: kundId,
          customerName: name,
          uppdragId,
          uppdragsnamn: displayName(ev.typ, f),
          koringId: runId,
          hours: sched.hours,
          date: sched.date,
          start: sched.start,
          end: sched.end,
          status: 'Klar'
        };
        payloads.push(build
          ? build(args)
          : {
            customerId: kundId,
            customerName: name,
            uppdragId,
            uppdragsnamn: displayName(ev.typ, f),
            koringId: runId,
            date: sched.date,
            hours: sched.hours,
            start: sched.start || '',
            end: sched.end || '',
            activity: 'Uppdragsarbete',
            description: `Avsatt tid ${KV.fmtTimeLabel(sched.startMin)}–${KV.fmtTimeLabel(sched.endMin)} (från kalender)`,
            status: 'Klar'
          });
      });
    } catch (err) {
      showSaveToast((err && err.message) || 'Kunde inte bygga tidpost', true);
      return;
    }
    if (!payloads.length && unfinished.length) {
      showSaveToast('Avsätt tid i kalendern först (dra från listan eller i nederkant).', true);
      return;
    }
    const totalH = Math.round(payloads.reduce((s, p) => s + Number(p.hours || 0), 0) * 100) / 100;

    const btn = el.detailBody && el.detailBody.querySelector('[data-klar-tid]');
    const onlyBtn = el.detailBody && el.detailBody.querySelector('[data-klar-only]');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sparar…';
    }
    if (onlyBtn) onlyBtn.disabled = true;

    try {
      for (const tidBody of payloads) {
        const tidRes = await fetch(`${baseUrl}/api/tidregistrering`, {
          method: 'POST',
          ...authOpts(),
          headers: {
            ...(authOpts().headers || {}),
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(tidBody)
        });
        const tidData = await tidRes.json().catch(() => ({}));
        if (!tidRes.ok) throw new Error(tidData.error || 'Kunde inte registrera tid');
      }

      const blocksOk = await completeAllScheduleBlocks(ev);
      if (!blocksOk && blockList.length) return;
      await patchRunStatusKlar(ev, runId);
      showSaveToast(totalH > 0
        ? `Hela körningen klarmarkerad · ${totalH} t registrerad`
        : 'Hela körningen klarmarkerad');

      const navigatedToMejl = afterKlarMejlLink(runId, uppdragId);
      if (navigatedToMejl) return;
      closeDetail();
      render();
    } catch (err) {
      console.error('Kalender klar+tid:', err);
      showSaveToast((err && err.message) || 'Kunde inte spara', true);
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<i class="fas fa-check"></i> Klarmarkera hela & tid (${totalH} t)`;
      }
      if (onlyBtn) onlyBtn.disabled = false;
      syncKlarActionButtons(totalH, { totalHours: totalH });
    }
  }

  function refreshOpenDetail() {
    if (!openDetailKey || !el.detail || el.detail.hidden) return;
    if (eventByKey(openDetailKey)) {
      openDetail(openDetailKey);
      return;
    }
    // Tillfälle borttaget: öppna kvarvarande syskon / körningen, annars stäng
    const runKey = String(openDetailKey).split('#')[0];
    if (runKey && eventByKey(runKey)) {
      openDetail(runKey);
      return;
    }
    closeDetail();
  }

  /**
   * Ta bort ett tidblock (tillfälle) — inte hela uppdragskörningen.
   * @returns {Promise<boolean>}
   */
  async function removeTillfalle(ev, blockId) {
    const id = String(blockId || '').trim();
    if (!ev || !id) return false;
    const blocks = blocksOf(ev);
    const target = blocks.find((b) => b && b.id === id);
    const sched = target ? KV.normalizeSchedule(target.start, target.end) : null;
    const when = sched
      ? `${fmtDate(sched.date)} · ${KV.fmtTimeLabel(sched.startMin)}–${KV.fmtTimeLabel(sched.endMin)}`
      : 'detta tillfälle';
    if (!confirm(
      `Ta bort ${when} från kalendern?\n\nBara detta tillfälle tas bort — uppdragskörningen behålls.`
    )) {
      return false;
    }
    const ok = await persistSchedule(ev, null, null, { mode: 'remove', blockId: id });
    if (!ok) return false;
    const remaining = blocksOf(ev);
    const runKey = String(ev.runKey || String(ev.key || '').split('#')[0] || '').trim();
    render();
    if (remaining.length && runKey) {
      const nextId = remaining[0].id;
      const nextKey = `${runKey}#${nextId}`;
      if (eventByKey(nextKey)) openDetail(nextKey);
      else if (eventByKey(runKey)) openDetail(runKey);
      else closeDetail();
    } else if (runKey && eventByKey(runKey)) {
      openDetail(runKey);
    } else {
      closeDetail();
    }
    return true;
  }

  function showSaveToast(msg, isError) {
    let toast = document.getElementById('kal-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'kal-toast';
      toast.className = 'kalender-toast';
      toast.setAttribute('role', 'status');
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.toggle('is-error', !!isError);
    toast.hidden = false;
    clearTimeout(saveToastTimer);
    saveToastTimer = setTimeout(() => { toast.hidden = true; }, 2800);
  }

  function applyScheduleLocal(ev, blocks) {
    const list = Array.isArray(blocks) ? SB.sortBlocks(blocks) : [];
    const primary = list[0] || null;
    const fieldPatch = SB.fieldsForBlocks(list);
    if (ev.runRec) {
      ev.runRec.fields = ev.runRec.fields || {};
      Object.assign(ev.runRec.fields, fieldPatch);
    }
    const rr = runRecords.find((r) => r.id === ev.runRec?.id);
    if (rr) {
      rr.fields = rr.fields || {};
      Object.assign(rr.fields, fieldPatch);
    }
    // Uppdatera alla lokala instanser av samma körning — inte bara den vi sparade från.
    // Annars kan syskon behålla gamla tider/scheduleBlocks tills nästa fulla rebuild.
    const runId = String(ev.runRec?.id || '').trim();
    const runKey = String(ev.runKey || String(ev.key || '').split('#')[0] || '').trim();
    const touch = (row) => {
      if (!row || isOverlayCalendarEvent(row)) return;
      const sameRun = (runId && String(row.runRec?.id || '') === runId)
        || (runKey && String(row.runKey || String(row.key || '').split('#')[0]) === runKey);
      if (!sameRun && row !== ev) return;
      row.scheduleBlocks = list;
      if (row.runRec && ev.runRec) row.runRec = ev.runRec;
      if (row.blockId) {
        const mine = list.find((b) => b.id === row.blockId);
        if (mine) {
          row.scheduledStart = mine.start;
          row.scheduledEnd = mine.end;
          row.blockDone = !!mine.done;
          row.blockNote = mine.note || '';
          row.status = SB.instanceStatus(
            String(row.runRec?.fields?.Status || row.status || '').trim(),
            mine,
            list
          );
          return;
        }
      }
      row.scheduledStart = primary ? primary.start : '';
      row.scheduledEnd = primary ? primary.end : '';
    };
    touch(ev);
    events.forEach(touch);
  }

  /**
   * @param {object} ev
   * @param {string|null} startIso
   * @param {string|null} endIso
   * @param {{ mode?: string, blockId?: string|null, note?: string|null }} [opts]
   */
  async function persistSchedule(ev, startIso, endIso, opts) {
    const runId = String(ev.runRec?.id || '').trim();
    if (!runId) {
      showSaveToast('Saknar uppdragskörning – tidblock kan inte sparas.', true);
      return false;
    }
    const options = opts || {};
    let mode = String(options.mode || '').trim().toLowerCase();
    const hasExplicitBlockId = Object.prototype.hasOwnProperty.call(options, 'blockId');
    // Vid mode=add: ärv aldrig syskonets blockId (eventByKey(runKey) hittar oftast
    // första expanderade tillfället). Annars återanvänds id → första blocket «hoppar».
    let blockId;
    if (hasExplicitBlockId) {
      blockId = options.blockId != null && options.blockId !== ''
        ? String(options.blockId).trim()
        : null;
    } else if (mode === 'add') {
      blockId = null;
    } else {
      blockId = ev.blockId || null;
    }
    const hasNote = Object.prototype.hasOwnProperty.call(options, 'note');
    if (!mode) {
      if (blockId) mode = 'update';
      else if (blocksOf(ev).length) mode = 'add';
      else mode = 'set';
    }
    if (mode === 'add' && !hasExplicitBlockId) blockId = null;
    const body = { start: startIso, end: endIso, mode };
    if (blockId) body.blockId = blockId;
    if (hasNote) body.note = options.note;
    if (mode === 'remove' || mode === 'complete' || mode === 'done'
      || mode === 'complete-all' || mode === 'done-all'
      || mode === 'uncomplete' || mode === 'reopen' || mode === 'undone'
      || mode === 'uncomplete-all' || mode === 'reopen-all' || mode === 'undone-all') {
      delete body.start;
      delete body.end;
    }
    if (mode === 'complete-all' || mode === 'done-all'
      || mode === 'uncomplete-all' || mode === 'reopen-all' || mode === 'undone-all') {
      delete body.blockId;
    }
    if (hasNote && mode === 'update' && (startIso == null || startIso === '') && (endIso == null || endIso === '')) {
      delete body.start;
      delete body.end;
    }
    try {
      const res = await fetch(`${baseUrl}/api/uppdrag/runs/${encodeURIComponent(runId)}/schedule`, {
        method: 'PATCH',
        ...authOpts(),
        headers: {
          ...(authOpts().headers || {}),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      if (data.record) {
        ev.runRec = data.record;
        const idx = runRecords.findIndex((r) => r.id === data.record.id);
        if (idx >= 0) runRecords[idx] = data.record;
        else runRecords.push(data.record);
      }
      const nextBlocks = Array.isArray(data.blocks)
        ? data.blocks
        : SB.parseBlocksFromFields((data.record && data.record.fields) || {});
      applyScheduleLocal(ev, nextBlocks);
      if (mode === 'complete' || mode === 'done') {
        ev.blockDone = true;
        ev.status = 'Klar';
        showSaveToast('Tillfälle kvar i kalendern som klart');
      } else if (mode === 'complete-all' || mode === 'done-all') {
        ev.blockDone = true;
        ev.status = 'Klar';
      } else if (mode === 'uncomplete' || mode === 'reopen' || mode === 'undone') {
        const saved = nextBlocks.find((b) => b.id === blockId);
        ev.blockDone = !!(saved && SB.isBlockDone(saved));
        ev.status = ev.blockDone ? 'Klar' : (String(ev.runRec?.fields?.Status || '').trim() || 'Pågående');
      } else if (mode === 'uncomplete-all' || mode === 'reopen-all' || mode === 'undone-all') {
        ev.blockDone = false;
      } else if (hasNote && !startIso && !endIso) {
        const saved = nextBlocks.find((b) => b.id === blockId);
        ev.blockNote = saved && saved.note ? saved.note : '';
        showSaveToast('Anteckning sparad');
      } else {
        showSaveToast(mode === 'remove' ? 'Tidblock borttaget' : 'Tidblock sparat');
      }
      return true;
    } catch (err) {
      console.error('Kalender schedule:', err);
      showSaveToast(err.message || 'Kunde inte spara tidblock', true);
      return false;
    }
  }

  function chip(ev) {
    if (isOverlayCalendarEvent(ev)) {
      const name = String(ev.summary || ev.record?.fields?.Kundnamn || (isMeetingEvent(ev) ? 'Möte' : 'Google'));
      const sched = scheduleOf(ev);
      const kind = isMeetingEvent(ev) ? 'Möte' : 'Google';
      const timeBit = sched ? `${KV.fmtTimeLabel(sched.startMin)}–${KV.fmtTimeLabel(sched.endMin)} · ` : (ev.allDay ? 'Heldag · ' : '');
      const meetUrl = eventMeetingUrl(ev);
      const title = `${timeBit}${name} · ${kind}${meetUrl ? ` · ${meetUrl}` : ''}`;
      const cls = isMeetingEvent(ev) ? 'kalender-chip--meeting' : 'kalender-chip--google';
      return `<button type="button" class="kalender-chip ${cls}" data-key="${esc(ev.key)}" title="${esc(title)}">
        ${isGoogleEvent(ev) ? googleColorDotHtml(ev) : '<i class="fas fa-video kalender-chip-meet-icon" aria-hidden="true"></i>'}
        <span class="kalender-chip-name">${esc(name)}</span>
        ${meetUrl ? '<i class="fas fa-link kalender-chip-meet-icon" aria-hidden="true" title="Möteslänk"></i>' : ''}
        ${sched ? `<span class="kalender-chip-time">${esc(KV.fmtTimeLabel(sched.startMin))}</span>` : ''}
      </button>`;
    }
    const f = ev.record?.fields || {};
    const name = String(f['Kundnamn'] || f['Namn'] || 'Klient');
    const st = statusOf(ev);
    const cls = statusClass(st, ev.deadline);
    const sched = scheduleOf(ev);
    const timeBit = sched ? `${KV.fmtTimeLabel(sched.startMin)}–${KV.fmtTimeLabel(sched.endMin)} · ` : '';
    const title = `${timeBit}${name} · ${displayName(ev.typ, f)} · ${statusLabel(st, ev.deadline)}`;
    const done = st === 'Klar' || st === 'Avslutad';
    const canDrag = !!ev.runRec?.id && !done;
    return `<button type="button" class="kalender-chip kalender-chip--${cls}${canDrag ? ' is-draggable' : ''}"
      data-key="${esc(ev.key)}" ${canDrag ? 'draggable="true"' : ''} title="${esc(title)}">
      <span class="kalender-chip-typ">${esc(typShort(ev.typ))}</span>
      <span class="kalender-chip-name">${esc(name)}</span>
      ${sched ? `<span class="kalender-chip-time">${esc(KV.fmtTimeLabel(sched.startMin))}</span>` : ''}
    </button>`;
  }

  function bindGridClicks(dayMap) {
    gridEl.querySelectorAll('[data-key]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        if (btn.dataset.suppressClick === '1') {
          btn.dataset.suppressClick = '';
          e.preventDefault();
          return;
        }
        e.preventDefault();
        openDetail(btn.getAttribute('data-key'));
      });
    });
    gridEl.querySelectorAll('.kalender-more').forEach((btn) => {
      btn.addEventListener('click', () => {
        const list = dayMap.get(btn.getAttribute('data-date')) || [];
        if (list[0]) openDetail(list[0].key, list);
      });
    });
  }

  function isCalendarDropMode(mode) {
    return mode === 'month-move' || mode === 'side-add' || mode === 'timed-move' || mode === 'untimed-to-grid';
  }

  function bindMonthDrag(dayMap) {
    gridEl.querySelectorAll('.kalender-chip[draggable="true"]').forEach((btn) => {
      btn.addEventListener('dragstart', (e) => {
        const key = btn.getAttribute('data-key');
        e.dataTransfer.setData('text/plain', key);
        e.dataTransfer.effectAllowed = 'move';
        btn.classList.add('is-dragging');
        dragState = { key, mode: 'month-move', blockId: eventByKey(key)?.blockId || null };
      });
      btn.addEventListener('dragend', () => {
        btn.classList.remove('is-dragging');
        dragState = null;
        gridEl.querySelectorAll('.kalender-cell.is-drop-target').forEach((c) => c.classList.remove('is-drop-target'));
      });
    });
    gridEl.querySelectorAll('.kalender-cell[data-date]').forEach((cell) => {
      cell.addEventListener('dragover', (e) => {
        if (!dragState || (dragState.mode !== 'month-move' && dragState.mode !== 'side-add')) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = dragState.mode === 'side-add' ? 'copy' : 'move';
        cell.classList.add('is-drop-target');
      });
      cell.addEventListener('dragleave', () => cell.classList.remove('is-drop-target'));
      cell.addEventListener('drop', async (e) => {
        e.preventDefault();
        cell.classList.remove('is-drop-target');
        const key = e.dataTransfer.getData('text/plain') || dragState?.key;
        const ev = eventByKey(key);
        const date = cell.getAttribute('data-date');
        if (!ev || !date) return;
        const fromSide = dragState?.mode === 'side-add';
        const existing = !fromSide ? scheduleOf(ev) : null;
        const startMin = existing ? existing.startMin : 9 * 60;
        const endMin = existing ? existing.endMin : startMin + KV.DEFAULT_BLOCK_MINUTES;
        const startIso = KV.toLocalDateTimeIso(date, startMin);
        const endIso = KV.toLocalDateTimeIso(date, Math.min(endMin, KV.dayEndMinutes()));
        const ok = await persistSchedule(ev, startIso, endIso, fromSide
          ? { mode: 'add', blockId: null }
          : { mode: ev.blockId ? 'update' : 'set', blockId: ev.blockId || null });
        if (ok) {
          render();
          refreshOpenDetail();
        }
      });
    });
  }

  function renderMonth(dayMap) {
    const t = today();
    const maxChips = MAX_CHIPS_MONTH;
    gridEl.className = 'kalender-grid kalender-grid--month';
    gridEl.setAttribute('aria-label', 'Månadskalender');
    gridEl.innerHTML = cellsForMonth(focus).map((iso) => {
      if (!iso) return '<div class="kalender-cell kalender-cell--empty" aria-hidden="true"></div>';
      const day = Number(iso.slice(8, 10));
      const list = dayMap.get(iso) || [];
      const shown = list.slice(0, maxChips);
      const more = list.length - shown.length;
      return `<div class="kalender-cell${iso === t ? ' is-today' : ''}" role="gridcell" data-date="${esc(iso)}">
        <div class="kalender-cell-head">
          <span class="kalender-daynum">${day}</span>
          ${list.length ? `<span class="kalender-cell-count">${list.length}</span>` : ''}
        </div>
        <div class="kalender-cell-events">
          ${shown.map(chip).join('')}
          ${more > 0 ? `<button type="button" class="kalender-more" data-date="${esc(iso)}">+${more} till</button>` : ''}
        </div>
      </div>`;
    }).join('');
    bindGridClicks(dayMap);
    bindMonthDrag(dayMap);
  }

  function timedBlockHtml(ev, laneInfo) {
    if (isOverlayCalendarEvent(ev)) {
      const name = String(ev.summary || ev.record?.fields?.Kundnamn || (isMeetingEvent(ev) ? 'Möte' : 'Google'));
      const sched = scheduleOf(ev);
      if (!sched) return '';
      const layout = KV.blockLayout(sched.startMin, sched.endMin, laneInfo);
      const kind = isMeetingEvent(ev) ? 'Möte' : 'Google';
      const meetUrl = eventMeetingUrl(ev);
      const blockCls = isMeetingEvent(ev) ? 'kalender-block--meeting' : 'kalender-block--google';
      const title = `${KV.fmtTimeLabel(sched.startMin)}–${KV.fmtTimeLabel(sched.endMin)} · ${name} · ${kind}${meetUrl ? ` · ${meetUrl}` : ''}`;
      return `<div class="kalender-block ${blockCls}" data-key="${esc(ev.key)}" data-timed="1"
        style="${KV.blockPositionStyleAttr(layout)}"
        title="${esc(title)}">
        <button type="button" class="kalender-block-main" data-key="${esc(ev.key)}">
          <span class="kalender-block-name">${isGoogleEvent(ev) ? googleColorDotHtml(ev) : ''}${esc(name)}</span>
          <span class="kalender-block-time">${esc(kind)} · ${esc(KV.fmtTimeLabel(sched.startMin))}–${esc(KV.fmtTimeLabel(sched.endMin))}</span>
          ${meetLinkChipHtml(ev)}
        </button>
      </div>`;
    }
    const f = ev.record?.fields || {};
    const name = String(f['Kundnamn'] || f['Namn'] || 'Klient');
    const st = statusOf(ev);
    const cls = statusClass(st, ev.deadline);
    const sched = scheduleOf(ev);
    if (!sched) return '';
    const layout = KV.blockLayout(sched.startMin, sched.endMin, laneInfo);
    const done = st === 'Klar' || st === 'Avslutad';
    const canDrag = !!ev.runRec?.id && !done;
    const note = String(ev.blockNote || (focusBlockNoteOf(ev)) || '').trim();
    const typLabel = done ? 'Klar' : typShort(ev.typ);
    const titleParts = [
      name,
      typLabel,
      `${KV.fmtTimeLabel(sched.startMin)}–${KV.fmtTimeLabel(sched.endMin)}`,
      note
    ].filter(Boolean);
    return `<div class="kalender-block kalender-block--${cls}${canDrag ? ' is-draggable' : ''}"
      data-key="${esc(ev.key)}" data-timed="1"
      style="${KV.blockPositionStyleAttr(layout)}"
      title="${esc(titleParts.join(' · '))}">
      ${canDrag ? '<span class="kalender-block-resize kalender-block-resize--start" data-resize="start" title="Ändra start" aria-hidden="true"></span>' : ''}
      <button type="button" class="kalender-block-main" data-key="${esc(ev.key)}">
        <span class="kalender-block-name">${esc(name)}</span>
        <span class="kalender-block-typ">${esc(typLabel)}</span>
        <span class="kalender-block-time">${esc(KV.fmtTimeLabel(sched.startMin))}–${esc(KV.fmtTimeLabel(sched.endMin))}</span>
        ${note ? `<span class="kalender-block-note">${esc(note)}</span>` : ''}
      </button>
      ${canDrag ? '<span class="kalender-block-resize kalender-block-resize--end" data-resize="end" title="Ändra slut" aria-hidden="true"></span>' : ''}
    </div>`;
  }

  /** Render tidblock för en dag med Google Calendar-liknande överlapp (lanes). */
  function timedBlocksHtml(events) {
    const list = Array.isArray(events) ? events : [];
    const packItems = [];
    const withSched = [];
    for (const ev of list) {
      const sched = scheduleOf(ev);
      if (!sched) continue;
      withSched.push(ev);
      packItems.push({ id: ev.key, startMin: sched.startMin, endMin: sched.endMin });
    }
    const packed = KV.packOverlapLanes(packItems);
    return withSched.map((ev) => timedBlockHtml(ev, packed.get(String(ev.key)))).join('');
  }

  function focusBlockNoteOf(ev) {
    if (!ev) return '';
    if (ev.blockNote) return String(ev.blockNote);
    const bid = String(ev.blockId || '').trim();
    if (!bid || !Array.isArray(ev.scheduleBlocks)) return '';
    const b = ev.scheduleBlocks.find((x) => x && x.id === bid);
    return b && b.note ? String(b.note) : '';
  }

  function untimedChipHtml(ev) {
    return chip(ev);
  }

  function bindTimedInteractions() {
    const columns = Array.from(gridEl.querySelectorAll('.kalender-time-col[data-date]'));

    const pointerYInCol = (clientY, col) => {
      const track = col.querySelector('.kalender-time-track') || col;
      const rect = track.getBoundingClientRect();
      return { y: clientY - rect.top, height: rect.height, date: col.getAttribute('data-date') };
    };

    const clearColDropTargets = () => {
      columns.forEach((c) => c.classList.remove('is-drop-target'));
    };

    const colUnderPoint = (clientX, clientY) => {
      const stack = typeof document.elementsFromPoint === 'function'
        ? document.elementsFromPoint(clientX, clientY)
        : [document.elementFromPoint(clientX, clientY)].filter(Boolean);
      for (const node of stack) {
        const col = node && node.closest && node.closest('.kalender-time-col[data-date]');
        if (col && columns.includes(col)) return col;
      }
      // Fallback: kolumn via X om pekaren är över tidsspåret men elementFromPoint missar
      for (const col of columns) {
        const rect = col.getBoundingClientRect();
        if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
          return col;
        }
      }
      return null;
    };

    const applyTimedBlockPreview = (block, startMin, endMin) => {
      // Under drag: full bredd så avsedd tid syns tydligt; lanes räknas om efter sparad flytt
      const layout = KV.blockLayout(startMin, endMin, { leftPct: 0, widthPct: 100, lane: 0, laneCount: 1 });
      const pos = KV.blockPositionStyle(layout);
      block.style.top = pos.top;
      block.style.height = pos.height;
      block.style.left = pos.left;
      block.style.width = pos.width;
      const timeEl = block.querySelector('.kalender-block-time');
      if (timeEl) {
        timeEl.textContent = `${KV.fmtTimeLabel(startMin)}–${KV.fmtTimeLabel(endMin)}`;
      }
    };

    // Pointer-baserad flytt: greppunkt bevaras, live-preview, snap en gång per frame
    gridEl.querySelectorAll('.kalender-block.is-draggable').forEach((block) => {
      const btn = block.querySelector('.kalender-block-main[data-key]');
      if (!btn) return;
      const key = btn.getAttribute('data-key');

      btn.addEventListener('click', (e) => {
        if (btn.dataset.suppressClick === '1' || block.dataset.suppressClick === '1') {
          btn.dataset.suppressClick = '';
          block.dataset.suppressClick = '';
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        openDetail(key);
      });

      btn.addEventListener('pointerdown', (e) => {
        if (e.button != null && e.button !== 0) return;
        if (dragState) return;
        const ev = eventByKey(key);
        const sched = ev && scheduleOf(ev);
        const col = block.closest('.kalender-time-col');
        if (!ev || !sched || !col) return;
        e.preventDefault();
        e.stopPropagation();
        const { y, height, date } = pointerYInCol(e.clientY, col);
        const pointerMin = KV.yToMinutesRaw(y, height);
        try { btn.setPointerCapture(e.pointerId); } catch (_) { /* */ }
        dragState = {
          key,
          mode: 'timed-move',
          blockId: ev.blockId || null,
          origStartMin: sched.startMin,
          origEndMin: sched.endMin,
          startMin: sched.startMin,
          endMin: sched.endMin,
          grabOffsetMin: KV.grabOffsetMinutes(pointerMin, sched.startMin),
          date,
          originX: e.clientX,
          originY: e.clientY,
          moved: false,
          block,
          btn
        };
        block.classList.add('is-moving');
      });

      btn.addEventListener('pointermove', (e) => {
        if (!dragState || dragState.mode !== 'timed-move' || dragState.key !== key) return;
        const dx = e.clientX - dragState.originX;
        const dy = e.clientY - dragState.originY;
        if (!dragState.moved && (dx * dx + dy * dy) < 16) return;

        const col = colUnderPoint(e.clientX, e.clientY) || block.closest('.kalender-time-col');
        if (!col) return;
        clearColDropTargets();
        col.classList.add('is-drop-target');

        const track = col.querySelector('.kalender-time-track');
        if (track && block.parentElement !== track) {
          track.appendChild(block);
        }

        const { y, height, date } = pointerYInCol(e.clientY, col);
        const pointerMin = KV.yToMinutesRaw(y, height);
        const moved = KV.moveBlockFromPointer(
          dragState.origStartMin,
          dragState.origEndMin,
          pointerMin,
          dragState.grabOffsetMin
        );
        // Undvik onödig DOM-uppdatering om snap-läge är oförändrat (mindre flimmer)
        if (
          dragState.moved
          && dragState.startMin === moved.startMin
          && dragState.endMin === moved.endMin
          && dragState.date === date
        ) {
          return;
        }
        dragState.moved = true;
        dragState.startMin = moved.startMin;
        dragState.endMin = moved.endMin;
        dragState.date = date;
        applyTimedBlockPreview(block, moved.startMin, moved.endMin);
        previewDetailSchedule(key, moved.startMin, moved.endMin);
      });

      const finishTimedMove = async (e) => {
        if (!dragState || dragState.mode !== 'timed-move' || dragState.key !== key) return;
        try { btn.releasePointerCapture(e.pointerId); } catch (_) { /* */ }
        block.classList.remove('is-moving');
        clearColDropTargets();
        const didMove = dragState.moved;
        const startMin = dragState.startMin;
        const endMin = dragState.endMin;
        const date = dragState.date;
        const blockId = dragState.blockId;
        dragState = null;
        if (!didMove) {
          // Låt klick-hanteraren öppna detaljen
          return;
        }
        btn.dataset.suppressClick = '1';
        block.dataset.suppressClick = '1';
        const ev = eventByKey(key);
        if (!ev || startMin == null || endMin == null || !date) {
          render();
          return;
        }
        const startIso = KV.toLocalDateTimeIso(date, startMin);
        const endIso = KV.toLocalDateTimeIso(date, endMin);
        const ok = await persistSchedule(ev, startIso, endIso, {
          mode: ev.blockId || blockId ? 'update' : 'set',
          blockId: ev.blockId || blockId || null
        });
        if (ok) {
          render();
          refreshOpenDetail();
        } else {
          render();
        }
      };
      btn.addEventListener('pointerup', finishTimedMove);
      btn.addEventListener('pointercancel', finishTimedMove);
    });

    gridEl.querySelectorAll('.kalender-chip[draggable="true"]').forEach((btn) => {
      btn.addEventListener('dragstart', (e) => {
        const key = btn.getAttribute('data-key');
        e.dataTransfer.setData('text/plain', key);
        e.dataTransfer.effectAllowed = 'move';
        btn.classList.add('is-dragging');
        dragState = { key, mode: 'untimed-to-grid', duration: KV.DEFAULT_BLOCK_MINUTES };
      });
      btn.addEventListener('dragend', () => {
        btn.classList.remove('is-dragging');
        dragState = null;
        clearColDropTargets();
      });
    });

    columns.forEach((col) => {
      col.addEventListener('dragover', (e) => {
        if (!dragState || !isCalendarDropMode(dragState.mode) || dragState.mode === 'month-move' || dragState.mode === 'timed-move') return;
        e.preventDefault();
        e.dataTransfer.dropEffect = dragState.mode === 'side-add' ? 'copy' : 'move';
        col.classList.add('is-drop-target');
      });
      col.addEventListener('dragleave', () => col.classList.remove('is-drop-target'));
      col.addEventListener('drop', async (e) => {
        e.preventDefault();
        col.classList.remove('is-drop-target');
        if (dragState?.mode === 'timed-move') return;
        const key = e.dataTransfer.getData('text/plain') || dragState?.key;
        const ev = eventByKey(key);
        if (!ev) return;
        const { y, height, date } = pointerYInCol(e.clientY, col);
        if (!date) return;
        const startMin = KV.yToMinutes(y, height);
        const moved = KV.moveBlock(startMin, startMin + (dragState?.duration || KV.DEFAULT_BLOCK_MINUTES), startMin);
        const startIso = KV.toLocalDateTimeIso(date, moved.startMin);
        const endIso = KV.toLocalDateTimeIso(date, moved.endMin);
        const elBtn = gridEl.querySelector(`[data-key="${String(key).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`);
        if (elBtn) elBtn.dataset.suppressClick = '1';
        const fromSide = dragState?.mode === 'side-add';
        const ok = await persistSchedule(ev, startIso, endIso, fromSide
          ? { mode: 'add', blockId: null }
          : {
            mode: dragState?.mode === 'untimed-to-grid' ? 'set' : (ev.blockId ? 'update' : 'set'),
            blockId: ev.blockId || dragState?.blockId || null
          });
        if (ok) {
          render();
          refreshOpenDetail();
        }
      });
    });

    gridEl.querySelectorAll('.kalender-block-resize').forEach((handle) => {
      const block = handle.closest('.kalender-block');
      const key = block?.getAttribute('data-key');
      const edge = handle.getAttribute('data-resize') === 'start' ? 'start' : 'end';
      handle.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const ev = byKey.get(String(key || ''));
        const sched = ev && scheduleOf(ev);
        const col = block?.closest('.kalender-time-col');
        if (!ev || !sched || !col) return;
        handle.setPointerCapture(e.pointerId);
        dragState = {
          key,
          mode: 'resize',
          edge,
          startMin: sched.startMin,
          endMin: sched.endMin,
          date: col.getAttribute('data-date')
        };
        block.classList.add('is-resizing');
      });
      handle.addEventListener('pointermove', (e) => {
        if (!dragState || dragState.mode !== 'resize' || dragState.key !== key) return;
        const col = block?.closest('.kalender-time-col');
        if (!col) return;
        const { y, height } = pointerYInCol(e.clientY, col);
        const atMin = KV.yToMinutes(y, height);
        const resized = dragState.edge === 'start'
          ? KV.resizeBlockStart(atMin, dragState.endMin)
          : KV.resizeBlock(dragState.startMin, atMin);
        if (resized.startMin === dragState.startMin && resized.endMin === dragState.endMin) return;
        // Behåll left/width under resize; lanes räknas om efter sparning
        const layout = KV.blockLayout(resized.startMin, resized.endMin);
        const pos = KV.blockPositionStyle(layout);
        block.style.top = pos.top;
        block.style.height = pos.height;
        const timeEl = block.querySelector('.kalender-block-time');
        if (timeEl) {
          timeEl.textContent = `${KV.fmtTimeLabel(resized.startMin)}–${KV.fmtTimeLabel(resized.endMin)}`;
        }
        dragState.startMin = resized.startMin;
        dragState.endMin = resized.endMin;
        previewDetailSchedule(key, resized.startMin, resized.endMin);
      });
      const finishResize = async (e) => {
        if (!dragState || dragState.mode !== 'resize' || dragState.key !== key) return;
        try { handle.releasePointerCapture(e.pointerId); } catch (_) { /* */ }
        block.classList.remove('is-resizing');
        const endMin = dragState.endMin;
        const date = dragState.date;
        const startMin = dragState.startMin;
        dragState = null;
        if (endMin == null || startMin == null || !date) return;
        const ev = byKey.get(String(key || ''));
        if (!ev) {
          render();
          return;
        }
        const startIso = KV.toLocalDateTimeIso(date, startMin);
        const endIso = KV.toLocalDateTimeIso(date, endMin);
        await persistSchedule(ev, startIso, endIso, {
          mode: ev.blockId ? 'update' : 'set',
          blockId: ev.blockId || null
        });
        render();
        refreshOpenDetail();
      };
      handle.addEventListener('pointerup', finishResize);
      handle.addEventListener('pointercancel', finishResize);
    });

    // Dra på tom yta → skapa tidblock kopplat till kund/uppdrag
    columns.forEach((col) => {
      const track = col.querySelector('.kalender-time-track');
      if (!track) return;
      track.addEventListener('pointerdown', (e) => {
        if (e.button != null && e.button !== 0) return;
        if (e.target.closest('.kalender-block') || e.target.closest('.kalender-block-resize')) return;
        if (dragState) return;
        const date = col.getAttribute('data-date');
        if (!date) return;
        e.preventDefault();
        const { y, height } = pointerYInCol(e.clientY, col);
        const startMin = KV.yToMinutes(y, height);
        track.setPointerCapture(e.pointerId);
        let draft = track.querySelector('.kalender-block-draft');
        if (!draft) {
          draft = document.createElement('div');
          draft.className = 'kalender-block kalender-block-draft';
          draft.setAttribute('aria-hidden', 'true');
          track.appendChild(draft);
        }
        const endMin = Math.min(startMin + KV.DEFAULT_BLOCK_MINUTES, KV.dayEndMinutes());
        const layout = KV.blockLayout(startMin, endMin);
        const pos = KV.blockPositionStyle(layout);
        draft.style.top = pos.top;
        draft.style.height = pos.height;
        draft.textContent = `${KV.fmtTimeLabel(startMin)}–${KV.fmtTimeLabel(endMin)}`;
        dragState = {
          mode: 'create-slot',
          date,
          originMin: startMin,
          startMin,
          endMin,
          draft,
          track,
          moved: false
        };
      });
      track.addEventListener('pointermove', (e) => {
        if (!dragState || dragState.mode !== 'create-slot' || dragState.track !== track) return;
        const { y, height } = pointerYInCol(e.clientY, col);
        const atMin = KV.yToMinutes(y, height);
        const a = Math.min(dragState.originMin, atMin);
        const b = Math.max(dragState.originMin, atMin);
        let startMin = a;
        let endMin = Math.max(b, a + KV.SNAP_MINUTES);
        if (endMin - startMin < KV.DEFAULT_BLOCK_MINUTES && !dragState.moved) {
          endMin = Math.min(startMin + KV.DEFAULT_BLOCK_MINUTES, KV.dayEndMinutes());
        }
        if (Math.abs(atMin - dragState.originMin) >= KV.SNAP_MINUTES) dragState.moved = true;
        const layout = KV.blockLayout(startMin, endMin);
        const pos = KV.blockPositionStyle(layout);
        if (dragState.draft) {
          dragState.draft.style.top = pos.top;
          dragState.draft.style.height = pos.height;
          dragState.draft.textContent = `${KV.fmtTimeLabel(startMin)}–${KV.fmtTimeLabel(endMin)}`;
        }
        dragState.startMin = startMin;
        dragState.endMin = endMin;
      });
      const finishCreate = (e) => {
        if (!dragState || dragState.mode !== 'create-slot' || dragState.track !== track) return;
        try { track.releasePointerCapture(e.pointerId); } catch (_) { /* */ }
        const date = dragState.date;
        let startMin = dragState.startMin;
        let endMin = dragState.endMin;
        if (dragState.draft) dragState.draft.remove();
        dragState = null;
        if (!date || startMin == null || endMin == null) return;
        if (endMin <= startMin) endMin = startMin + KV.DEFAULT_BLOCK_MINUTES;
        openCreateSlotPicker(date, startMin, endMin);
      };
      track.addEventListener('pointerup', finishCreate);
      track.addEventListener('pointercancel', finishCreate);
    });
  }

  function selectableRunsForSlot() {
    const list = filtered();
    const expanded = sidePanelEvents(list);
    return typeof KE.uniqueRunEvents === 'function'
      ? KE.uniqueRunEvents(expanded)
      : SB.uniqueRunEvents(expanded);
  }

  function currentUserName() {
    const u = (window.AuthManager && AuthManager.getCurrentUser && AuthManager.getCurrentUser()) || {};
    return String(u.name || u.Namn || '').trim();
  }

  async function loadCustomerMetaForUppgift(customerId) {
    try {
      const res = await fetch(`${baseUrl}/api/kunddata/${encodeURIComponent(customerId)}`, authOpts());
      const data = await res.json().catch(() => ({}));
      const fields =
        (data && data.record && data.record.fields) ||
        (data && data.fields) ||
        (data && data.data && data.data.fields) ||
        {};
      return {
        klientansvarig: String(fields['Klientansvarig'] || fields.Klientansvarig || '').trim(),
        byraId: String(fields['Byrå ID'] || fields['ByråID'] || fields.byraId || '').replace(/,/g, '').trim(),
        orgnr: String(fields.Orgnr || fields.orgnr || fields['Organisationsnummer'] || '').trim(),
        namn: String(fields.Namn || fields['Företagsnamn'] || '').trim()
      };
    } catch (_) {
      return { klientansvarig: '', byraId: '', orgnr: '', namn: '' };
    }
  }

  async function createStandaloneUppgiftAtSlot({
    customerId,
    title,
    note,
    date,
    startMin,
    endMin
  }) {
    const CU = window.KalenderCreateUppgift;
    if (!CU || typeof CU.buildEngangUppgiftUppdragPayload !== 'function') {
      throw new Error('Saknar kalender-create-uppgift.js');
    }
    const ansvarig = currentUserName();
    if (!ansvarig) throw new Error('Saknar inloggad användare.');
    const day = KV.dateIso(date) || today();
    const meta = await loadCustomerMetaForUppgift(customerId);
    const klientansvarig = meta.klientansvarig || ansvarig;
    const uppdragBody = CU.buildEngangUppgiftUppdragPayload({
      customerId,
      namn: title,
      ansvarig,
      klientansvarig,
      deadline: day,
      today: day
    });
    const uppdragRes = await fetch(`${baseUrl}/api/uppdrag`, {
      method: 'POST',
      ...authOpts(),
      headers: {
        ...(authOpts().headers || {}),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(uppdragBody)
    });
    const uppdragData = await uppdragRes.json().catch(() => ({}));
    if (!uppdragRes.ok) {
      throw new Error(uppdragData.error || uppdragData.message || `HTTP ${uppdragRes.status}`);
    }
    const uppdragRec = uppdragData.record || uppdragData;
    const uppdragId = String(uppdragRec && uppdragRec.id || '').trim();
    if (!uppdragId) throw new Error('Uppgiften skapades men id saknas');

    // Mina uppgifter / Att göra — samma ToDo-modell som mejl → Ny uppgift
    try {
      const notePayload = CU.buildStandaloneUppgiftNotePayload({
        text: title,
        ansvarig,
        byraId: meta.byraId,
        orgnr: meta.orgnr,
        foretagsnamn: meta.namn,
        today: day,
        extraNote: note
      });
      await fetch(`${baseUrl}/api/notes`, {
        method: 'POST',
        ...authOpts(),
        headers: {
          ...(authOpts().headers || {}),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(notePayload)
      });
    } catch (err) {
      console.warn('Kalender uppgift-anteckning:', err);
    }

    const runsRes = await fetch(
      `${baseUrl}/api/uppdrag/runs?customerId=${encodeURIComponent(customerId)}`,
      authOpts()
    );
    const runsData = await runsRes.json().catch(() => ({}));
    if (!runsRes.ok) {
      throw new Error(runsData.error || 'Kunde inte hämta körning för uppgiften');
    }
    const runs = Array.isArray(runsData.records) ? runsData.records
      : (Array.isArray(runsData.runs) ? runsData.runs : []);
    const runRec = CU.findRunForUppdrag(runs, uppdragId);
    if (!runRec || !runRec.id) {
      throw new Error('Uppgift skapad men körning saknas ännu — ladda om kalendern.');
    }

    // Se till att föräldra-uppdraget har kundnamn för kalenderraderna
    if (uppdragRec) {
      uppdragRec.fields = uppdragRec.fields || {};
      if (!uppdragRec.fields['Kundnamn'] && meta.namn) {
        uppdragRec.fields['Kundnamn'] = meta.namn;
      }
      if (!uppdragRec.fields['Kund ID']) {
        uppdragRec.fields['Kund ID'] = customerId;
      }
      if (!records.some((r) => r.id === uppdragRec.id)) {
        records.push(uppdragRec);
      }
    }
    const runIdx = runRecords.findIndex((r) => r.id === runRec.id);
    if (runIdx >= 0) runRecords[runIdx] = runRec;
    else runRecords.push(runRec);

    render();
    const findEvForRun = () =>
      events.find((e) => String(e.runRec?.id || '') === String(runRec.id)) || null;
    let ev = findEvForRun();
    if (!ev) {
      // Minimal event om synligt intervall ännu inte inkluderar engångskörningen
      const pk = day.slice(0, 7);
      const key = `${uppdragId}:${pk}`;
      ev = {
        key,
        runKey: key,
        typ: CU.EGET_TYP,
        record: uppdragRec,
        runRec,
        deadline: day,
        startDate: day,
        periodLabel: '',
        periodKey: pk,
        status: 'Planerad',
        scheduleBlocks: []
      };
      byKey.set(key, ev);
      events.push(ev);
    }

    const startIso = KV.toLocalDateTimeIso(date, startMin);
    const endIso = KV.toLocalDateTimeIso(date, endMin);
    const schedOpts = { mode: 'add', blockId: null };
    if (note) schedOpts.note = note;
    const ok = await persistSchedule(ev, startIso, endIso, schedOpts);
    if (!ok) throw new Error('Uppgift skapad men tidblocket sparades inte.');

    render();
    ev = findEvForRun() || ev;
    const blocks = blocksOf(ev);
    const newest = blocks.find((b) => b.start === startIso && b.end === endIso)
      || blocks[blocks.length - 1];
    const baseKey = String(ev.runKey || ev.key || '').split('#')[0];
    return { ev, blockId: newest && newest.id, baseKey };
  }

  function openCreateSlotPicker(date, startMin, endMin) {
    if (!el.detail || !el.detailBody) return;
    openDetailKey = null;
    const CU = window.KalenderCreateUppgift || null;
    const timeLabel = `${fmtDate(date)} · ${KV.fmtTimeLabel(startMin)}–${KV.fmtTimeLabel(endMin)}`;
    const runs = selectableRunsForSlot();
    let createMode = CU && CU.CREATE_MODES
      ? CU.CREATE_MODES.RUN
      : 'run';

    if (el.detailTitle) el.detailTitle.textContent = 'Ny tidsbokning';
    el.detailBody.innerHTML = `
      <p class="kalender-detail-blocks-hint">Vald tid: <strong>${esc(timeLabel)}</strong>.</p>
      <div class="kalender-detail-scope">
        <h4 class="kalender-detail-scope-title">Bjud in till möte</h4>
        <p class="kalender-detail-blocks-hint">Skicka en inbjudan med Google-kalender (och Meet vid Distans).</p>
        <button type="button" class="btn btn-primary btn-sm" data-open-meeting-invite>
          <i class="fas fa-envelope"></i> Bjud in till möte
        </button>
      </div>
      <div class="kalender-detail-scope">
        <h4 class="kalender-detail-scope-title">Lägg i kalendern</h4>
        <div class="kalender-seg kalender-create-mode" role="tablist" aria-label="Koppla eller uppgift">
          <button type="button" class="kalender-seg-btn is-active" data-create-mode="run" role="tab" aria-selected="true">Uppdragskörning</button>
          <button type="button" class="kalender-seg-btn" data-create-mode="uppgift" role="tab" aria-selected="false">Uppgift</button>
        </div>
        <div data-create-panel="run">
          <p class="kalender-detail-blocks-hint">Koppla till en befintlig uppdragskörning.</p>
          <div class="kalender-detail-note">
            <label for="kal-create-slot-q">Sök kund eller uppdrag</label>
            <input type="search" id="kal-create-slot-q" class="kunduppgifter-input" placeholder="T.ex. kundnamn eller bokslut" autocomplete="off">
          </div>
          <div class="kalender-create-slot-list" data-create-slot-list></div>
          ${runs.length ? '' : '<p class="kalender-side-empty">Inga öppna körningar i listan — byt filter, dra från Att planera, eller välj Uppgift.</p>'}
        </div>
        <div data-create-panel="uppgift" hidden>
          <p class="kalender-detail-blocks-hint">Lägg upp en enkel uppgift utan att koppla till en löpande uppdragskörning. Syns i kalendern och under Mina uppgifter.</p>
          <div class="kalender-detail-note">
            <label for="kal-create-uppgift-customer">Kund *</label>
            <input type="text" id="kal-create-uppgift-customer" class="kunduppgifter-input" list="kal-create-uppgift-customer-list"
              placeholder="Sök kund…" autocomplete="off">
            <input type="hidden" id="kal-create-uppgift-customer-id" value="">
            <datalist id="kal-create-uppgift-customer-list"></datalist>
          </div>
          <div class="kalender-detail-note">
            <label for="kal-create-uppgift-title">Vad ska göras? *</label>
            <input type="text" id="kal-create-uppgift-title" class="kunduppgifter-input" placeholder="T.ex. Mejla avtal för signering" maxlength="200" autocomplete="off">
          </div>
          <div class="kalender-detail-note">
            <label for="kal-create-uppgift-note">Anteckning (valfritt)</label>
            <textarea id="kal-create-uppgift-note" class="kunduppgifter-input kalender-detail-note-input" rows="2"
              maxlength="${SB.NOTE_MAX_LEN || 2000}"
              placeholder="Kort notering på tidblocket"></textarea>
          </div>
          <p class="kalender-detail-blocks-hint" data-create-uppgift-error style="color:var(--error,#b42318);display:none;"></p>
          <div class="kalender-detail-actions kalender-detail-actions--scope">
            <button type="button" class="btn btn-primary btn-sm" data-create-uppgift-submit>
              <i class="fas fa-plus"></i> Lägg upp uppgift
            </button>
          </div>
        </div>
      </div>`;
    el.detail.hidden = false;
    document.body.classList.add('kalender-detail-open');

    const inviteBtn = el.detailBody.querySelector('[data-open-meeting-invite]');
    if (inviteBtn) {
      inviteBtn.addEventListener('click', () => openMeetingInviteForm(date, startMin, endMin));
    }

    const syncModeUi = () => {
      const mode = CU && typeof CU.normalizeCreateMode === 'function'
        ? CU.normalizeCreateMode(createMode)
        : createMode;
      createMode = mode;
      el.detailBody.querySelectorAll('[data-create-mode]').forEach((btn) => {
        const on = btn.getAttribute('data-create-mode') === mode;
        btn.classList.toggle('is-active', on);
        btn.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      el.detailBody.querySelectorAll('[data-create-panel]').forEach((panel) => {
        panel.hidden = panel.getAttribute('data-create-panel') !== mode;
      });
    };
    el.detailBody.querySelectorAll('[data-create-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        createMode = btn.getAttribute('data-create-mode') || 'run';
        syncModeUi();
        if (createMode === 'uppgift') {
          const titleEl = el.detailBody.querySelector('#kal-create-uppgift-title');
          if (titleEl) setTimeout(() => titleEl.focus(), 0);
        } else {
          const qEl = el.detailBody.querySelector('#kal-create-slot-q');
          if (qEl) setTimeout(() => qEl.focus(), 0);
        }
      });
    });
    syncModeUi();

    const listEl = el.detailBody.querySelector('[data-create-slot-list]');
    const qInput = el.detailBody.querySelector('#kal-create-slot-q');

    const paint = () => {
      if (!listEl) return;
      const qq = String(qInput?.value || '').trim().toLowerCase();
      const matched = runs.filter((ev) => {
        if (!qq) return true;
        const f = ev.record?.fields || {};
        const blob = [
          f['Kundnamn'], f['Namn'], displayName(ev.typ, f),
          ev.periodLabel, ev.periodKey, f['Ansvarig']
        ].join(' ').toLowerCase();
        return blob.includes(qq);
      });
      if (!matched.length) {
        listEl.innerHTML = '<p class="kalender-side-empty">Inga träffar.</p>';
        return;
      }
      listEl.innerHTML = matched.map((ev) => {
        const f = ev.record?.fields || {};
        const name = String(f['Kundnamn'] || f['Namn'] || 'Klient');
        const period = ev.periodLabel || ev.periodKey || '';
        const runKey = String(ev.runKey || ev.key || '');
        return `<button type="button" class="kalender-side-item kalender-side-item--${statusClass(statusOf(ev), ev.deadline)}" data-create-run="${esc(runKey)}">
          <span class="kalender-side-main">
            <span class="kalender-side-name">${esc(name)}</span>
            <span class="kalender-side-meta">${esc(displayName(ev.typ, f))}${period ? ` · ${esc(period)}` : ''}</span>
          </span>
          <span class="kalender-side-status">Boka</span>
        </button>`;
      }).join('');
      listEl.querySelectorAll('[data-create-run]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const key = btn.getAttribute('data-create-run');
          const ev = eventByKey(key) || runs.find((r) => String(r.runKey || r.key) === key);
          if (!ev) return;
          btn.disabled = true;
          const startIso = KV.toLocalDateTimeIso(date, startMin);
          const endIso = KV.toLocalDateTimeIso(date, endMin);
          const ok = await persistSchedule(ev, startIso, endIso, { mode: 'add', blockId: null });
          if (ok) {
            closeDetail();
            render();
            const blocks = blocksOf(ev);
            const newest = blocks.find((b) => b.start === startIso && b.end === endIso)
              || blocks[blocks.length - 1];
            const base = String(ev.runKey || ev.key || '').split('#')[0];
            if (newest) openDetail(`${base}#${newest.id}`);
            else openDetail(base);
          } else {
            btn.disabled = false;
          }
        });
      });
    };
    paint();
    if (qInput) {
      qInput.addEventListener('input', paint);
      setTimeout(() => qInput.focus(), 0);
    }

    // Uppgift-panel: kundlista + skapa
    const custInput = el.detailBody.querySelector('#kal-create-uppgift-customer');
    const custIdInput = el.detailBody.querySelector('#kal-create-uppgift-customer-id');
    const custList = el.detailBody.querySelector('#kal-create-uppgift-customer-list');
    const titleInput = el.detailBody.querySelector('#kal-create-uppgift-title');
    const noteInput = el.detailBody.querySelector('#kal-create-uppgift-note');
    const errEl = el.detailBody.querySelector('[data-create-uppgift-error]');
    const submitBtn = el.detailBody.querySelector('[data-create-uppgift-submit]');

    const resolveUppgiftCustomer = () => {
      const name = String((custInput && custInput.value) || '').trim();
      const id = String((custIdInput && custIdInput.value) || '').trim();
      const byName = gcalCustomers.find((c) => c.namn === name);
      if (byName) {
        if (custIdInput) custIdInput.value = byName.id;
        return byName;
      }
      if (id) {
        const byId = gcalCustomers.find((c) => c.id === id);
        if (byId) return byId;
      }
      return null;
    };

    ensureGcalCustomers().then((list) => {
      if (!custList) return;
      custList.innerHTML = list.map((c) =>
        `<option value="${esc(c.namn)}"></option>`
      ).join('');
    });
    if (custInput) {
      custInput.addEventListener('change', () => {
        resolveUppgiftCustomer();
      });
      custInput.addEventListener('input', () => {
        if (custIdInput) custIdInput.value = '';
      });
    }

    if (submitBtn) {
      submitBtn.addEventListener('click', async () => {
        if (errEl) {
          errEl.style.display = 'none';
          errEl.textContent = '';
        }
        const customer = resolveUppgiftCustomer();
        const title = String((titleInput && titleInput.value) || '').trim();
        const note = String((noteInput && noteInput.value) || '').trim();
        if (!customer || !customer.id) {
          if (errEl) {
            errEl.textContent = 'Välj en kund från listan.';
            errEl.style.display = '';
          }
          return;
        }
        if (!title) {
          if (errEl) {
            errEl.textContent = 'Ange vad som ska göras.';
            errEl.style.display = '';
          }
          return;
        }
        submitBtn.disabled = true;
        const prevHtml = submitBtn.innerHTML;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sparar…';
        try {
          const created = await createStandaloneUppgiftAtSlot({
            customerId: customer.id,
            title,
            note,
            date,
            startMin,
            endMin
          });
          closeDetail();
          render();
          const base = String(created.baseKey || created.ev?.runKey || created.ev?.key || '');
          if (created.blockId && base) openDetail(`${base}#${created.blockId}`);
          else if (base) openDetail(base);
          showSaveToast('Uppgift lagd i kalendern');
        } catch (err) {
          console.error('Kalender skapa uppgift:', err);
          if (errEl) {
            errEl.textContent = (err && err.message) || 'Kunde inte skapa uppgift';
            errEl.style.display = '';
          }
          submitBtn.disabled = false;
          submitBtn.innerHTML = prevHtml;
        }
      });
    }
  }

  function openMeetingInviteForm(date, startMin, endMin) {
    if (!el.detail || !el.detailBody) return;
    openDetailKey = null;
    const timeLabel = `${fmtDate(date)} · ${KV.fmtTimeLabel(startMin)}–${KV.fmtTimeLabel(endMin)}`;
    const startIso = KV.toLocalDateTimeIso(date, startMin);
    const endIso = KV.toLocalDateTimeIso(date, endMin);
    if (el.detailTitle) el.detailTitle.textContent = 'Bjud in till möte';
    el.detailBody.innerHTML = `
      <p class="kalender-detail-blocks-hint">Tid: <strong>${esc(timeLabel)}</strong>. Mottagaren får en Google-kalenderinbjudan (och Meet vid Distans).</p>
      <form class="kalender-meeting-invite-form" data-meeting-invite-form>
        <label class="kalender-gcal-label" for="kal-invite-name">Namn</label>
        <input type="text" id="kal-invite-name" class="kunduppgifter-input" name="bookerName" required autocomplete="name" placeholder="Mottagarens namn">

        <label class="kalender-gcal-label" for="kal-invite-email">E-post</label>
        <input type="email" id="kal-invite-email" class="kunduppgifter-input" name="bookerEmail" required autocomplete="email" placeholder="namn@foretag.se">

        <label class="kalender-gcal-label" for="kal-invite-title">Mötestitel</label>
        <input type="text" id="kal-invite-title" class="kunduppgifter-input" name="title" value="Möte" placeholder="Möte">

        <label class="kalender-gcal-label" for="kal-invite-type">Typ</label>
        <select id="kal-invite-type" class="kunduppgifter-input" name="meetingType">
          <option value="Distans" selected>Distans (Google Meet)</option>
          <option value="På plats">På plats</option>
          <option value="Telefon">Telefon</option>
        </select>

        <div data-invite-location-wrap hidden>
          <label class="kalender-gcal-label" for="kal-invite-location">Adress / plats</label>
          <input type="text" id="kal-invite-location" class="kunduppgifter-input" name="location" placeholder="Kontorsadress">
        </div>

        <label class="kalender-gcal-label" for="kal-invite-note">Anteckning / agenda (valfritt)</label>
        <textarea id="kal-invite-note" class="kunduppgifter-input kalender-gcal-note" name="note" rows="3" placeholder="Vad ska ni gå igenom?"></textarea>

        <p class="kalender-detail-blocks-hint" data-invite-error style="color:var(--error,#b42318);display:none;"></p>
        <div class="kalender-detail-actions kalender-detail-actions--scope">
          <button type="button" class="btn btn-ghost btn-sm" data-invite-back>Tillbaka</button>
          <button type="submit" class="btn btn-primary btn-sm" data-invite-submit>
            <i class="fas fa-paper-plane"></i> Skicka inbjudan
          </button>
        </div>
      </form>`;
    el.detail.hidden = false;
    document.body.classList.add('kalender-detail-open');

    const form = el.detailBody.querySelector('[data-meeting-invite-form]');
    const typeEl = el.detailBody.querySelector('#kal-invite-type');
    const locWrap = el.detailBody.querySelector('[data-invite-location-wrap]');
    const errEl = el.detailBody.querySelector('[data-invite-error]');
    const backBtn = el.detailBody.querySelector('[data-invite-back]');
    const submitBtn = el.detailBody.querySelector('[data-invite-submit]');

    const syncType = () => {
      const t = typeEl?.value || 'Distans';
      if (locWrap) locWrap.hidden = t !== 'På plats';
    };
    if (typeEl) typeEl.addEventListener('change', syncType);
    syncType();

    if (backBtn) {
      backBtn.addEventListener('click', () => openCreateSlotPicker(date, startMin, endMin));
    }

    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (errEl) {
          errEl.style.display = 'none';
          errEl.textContent = '';
        }
        const fd = new FormData(form);
        const meetingType = String(fd.get('meetingType') || 'Distans').trim();
        const payload = {
          bookerName: String(fd.get('bookerName') || '').trim(),
          bookerEmail: String(fd.get('bookerEmail') || '').trim(),
          title: String(fd.get('title') || 'Möte').trim() || 'Möte',
          meetingType,
          location: meetingType === 'På plats' ? String(fd.get('location') || '').trim() : '',
          note: String(fd.get('note') || '').trim(),
          start: startIso,
          end: endIso
        };
        if (!payload.bookerName || !payload.bookerEmail) {
          if (errEl) {
            errEl.textContent = 'Namn och e-post krävs';
            errEl.style.display = '';
          }
          return;
        }
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Skickar...';
        }
        try {
          const res = await fetch(`${baseUrl}/api/motesbokning/invites/schedule`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(authOpts().headers || {}) },
            credentials: authOpts().credentials || 'same-origin',
            body: JSON.stringify(payload)
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || 'Kunde inte skicka inbjudan');
          closeDetail();
          const invite = data.invite || null;
          const meetUrl = invite
            ? (eventMeetingUrl(invite) || String(invite.location || '').trim())
            : '';
          const meetHint = meetUrl && /^https?:\/\//i.test(meetUrl)
            ? ' Möteslänken syns i kalendern.'
            : (data.meetCreated || meetingType === 'Distans'
              ? ' Google Meet skapas på händelsen.'
              : '');
          showSaveToast(`Inbjudan skickad till ${payload.bookerEmail}.${meetHint}`);
          if (invite && ME && typeof ME.mapInviteToCalendarEvent === 'function') {
            const mapped = ME.mapInviteToCalendarEvent(invite);
            if (mapped) {
              meetingEvents = meetingEvents.filter((m) => m.inviteId !== mapped.inviteId).concat([mapped]);
            }
          }
          try { await pullMeetingInvites({ quiet: true }); } catch (_) { /* ignore */ }
          if (gcalPullEnabled()) {
            try { await pullGoogleEvents(); } catch (_) { /* ignore */ }
          }
          render();
        } catch (err) {
          if (errEl) {
            errEl.textContent = err.message || 'Kunde inte skicka inbjudan';
            errEl.style.display = '';
          }
          showSaveToast(err.message || 'Kunde inte skicka inbjudan', true);
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Skicka inbjudan';
          }
        }
      });
    }
    setTimeout(() => el.detailBody.querySelector('#kal-invite-name')?.focus(), 0);
  }

  function nowMarkerHtml(dayIso) {
    if (!KV.shouldShowNowMarker(dayIso, new Date())) return '';
    const top = KV.nowMarkerOffsetPx(new Date());
    if (top == null) return '';
    return `<div class="kalender-now-marker" style="top:${top}px" aria-hidden="true">
      <span class="kalender-now-marker-dot"></span>
    </div>`;
  }

  /** Flytta/lägg till/ta bort nu-markör utan full omritning (minut-tick + midnatt). */
  function syncNowMarker() {
    if (view !== 'week' && view !== 'day') return;
    const now = new Date();
    const todayIso = KV.dateIso(now);
    const top = KV.nowMarkerOffsetPx(now);
    const todayTrack = gridEl.querySelector(`.kalender-time-col[data-date="${todayIso}"] .kalender-time-track`);
    let marker = gridEl.querySelector('.kalender-now-marker');

    if (!todayTrack || top == null) {
      if (marker) marker.remove();
      // Midnatt / byte av synlig dag: kolumnens is-today kan vara fel – rita om vid behov
      const staleToday = gridEl.querySelector('.kalender-time-col.is-today');
      if (staleToday && staleToday.getAttribute('data-date') !== todayIso) {
        render();
      }
      return;
    }

    if (!marker) {
      marker = document.createElement('div');
      marker.className = 'kalender-now-marker';
      marker.setAttribute('aria-hidden', 'true');
      marker.innerHTML = '<span class="kalender-now-marker-dot"></span>';
      todayTrack.appendChild(marker);
    } else if (marker.parentElement !== todayTrack) {
      todayTrack.appendChild(marker);
    }
    marker.style.top = `${top}px`;
  }

  function ensureNowMarkerTimer() {
    if (nowMarkerTimer != null) return;
    nowMarkerTimer = setInterval(syncNowMarker, 60000);
  }

  function dayCapacityHtml(iso, dayMap) {
    const list = dayMap.get(iso) || [];
    const booked = KV.bookedHoursForDay(list, KV.durationHours);
    const showCapacity = scope === 'mine';
    const cap = KV.dayCapacityDisplay(booked, workHoursPerDay(), { showCapacity });
    const statusCls = cap.status ? ` kalender-capacity--${cap.status}` : '';
    const bar = showCapacity && cap.barPct != null
      ? `<div class="kalender-capacity-bar" aria-hidden="true"><span style="width:${cap.barPct}%"></span></div>`
      : '';
    return `<div class="kalender-capacity${statusCls}">
      <span class="kalender-capacity-label">${esc(cap.label)}</span>
      ${bar}
    </div>`;
  }

  function allDayCellHtml(iso, dayMap) {
    const t = today();
    const list = (dayMap.get(iso) || []).filter((ev) => !scheduleOf(ev));
    const overlayAllDay = list.filter((ev) => isOverlayCalendarEvent(ev));
    const cfDeadlines = list.filter((ev) => !isOverlayCalendarEvent(ev));
    const parts = [];
    if (cfDeadlines.length) {
      const n = cfDeadlines.length;
      parts.push(`<button type="button" class="kalender-deadlines-chip" data-deadlines-date="${esc(iso)}"
        aria-haspopup="dialog" title="${esc(`${n} deadline${n === 1 ? '' : 's'}`)}">${esc(String(n))} deadline${n === 1 ? '' : 's'}</button>`);
    }
    overlayAllDay.forEach((ev) => {
      const name = String(ev.summary || (isMeetingEvent(ev) ? 'Möte' : 'Google'));
      const cls = isMeetingEvent(ev) ? 'kalender-allday-meeting' : 'kalender-allday-gcal';
      parts.push(`<button type="button" class="${cls}" data-key="${esc(ev.key)}" title="${esc(name)}">${esc(name)}</button>`);
    });
    return `<div class="kalender-untimed${iso === t ? ' is-today' : ''}" data-date="${esc(iso)}">
      ${parts.length ? parts.join('') : '<span class="kalender-untimed-hint">Utan tid · dra till rutnät</span>'}
    </div>`;
  }

  function closeDeadlinesPopover() {
    if (deadlinesPopover) {
      deadlinesPopover.remove();
      deadlinesPopover = null;
    }
  }

  function openDeadlinesPopover(dateIso, anchor) {
    closeDeadlinesPopover();
    const list = (byDay(filtered()).get(dateIso) || []).filter((ev) => !scheduleOf(ev) && !isOverlayCalendarEvent(ev));
    if (!list.length || !anchor) return;
    const pop = document.createElement('div');
    pop.className = 'kalender-deadlines-popover';
    pop.setAttribute('role', 'dialog');
    pop.innerHTML = `<div class="kalender-deadlines-popover-title">${esc(fmtDate(dateIso))}</div>
      ${list.map((ev) => {
        const f = ev.record?.fields || {};
        const name = String(f['Kundnamn'] || f['Namn'] || 'Klient');
        return `<button type="button" class="kalender-side-item kalender-side-item--${statusClass(statusOf(ev), ev.deadline)}" data-key="${esc(ev.key)}">
          <span class="kalender-side-main">
            <span class="kalender-side-name">${esc(name)}</span>
            <span class="kalender-side-meta">${esc(displayName(ev.typ, f))}${ev.deadline ? ` · ${esc(fmtDate(ev.deadline))}` : ''}</span>
          </span>
        </button>`;
      }).join('')}`;
    document.body.appendChild(pop);
    deadlinesPopover = pop;
    const rect = anchor.getBoundingClientRect();
    const top = Math.min(window.innerHeight - 12, rect.bottom + 6);
    let left = rect.left;
    pop.style.top = `${top}px`;
    pop.style.left = `${left}px`;
    requestAnimationFrame(() => {
      const w = pop.offsetWidth || 240;
      if (left + w > window.innerWidth - 8) {
        pop.style.left = `${Math.max(8, window.innerWidth - w - 8)}px`;
      }
    });
    pop.querySelectorAll('[data-key]').forEach((btn) => {
      btn.addEventListener('click', () => {
        closeDeadlinesPopover();
        openDetail(btn.getAttribute('data-key'));
      });
    });
  }

  function weekendHasBlocks(dayMap, weekIsos) {
    return (weekIsos || []).some((iso) => {
      if (!KV.isWeekendIso(iso)) return false;
      const list = dayMap.get(iso) || [];
      return list.length > 0;
    });
  }

  function scrollTimedGridIntoView(dayIsos) {
    requestAnimationFrame(() => {
      const track = gridEl.querySelector('.kalender-time-track');
      if (!track) return;
      const offsetInTrack = KV.timedScrollOffsetPx(new Date(), dayIsos);
      const abs = track.offsetTop + offsetInTrack - 4;
      gridEl.scrollTop = Math.max(0, abs);
    });
  }

  function renderTimedGrid(dayIsos, dayMap, ariaLabel, opts) {
    const t = today();
    const hours = KV.hourLabels();
    const trackH = (KV.DAY_END_HOUR - KV.DAY_START_HOUR) * KV.PX_PER_HOUR;
    const weekMode = !!(opts && opts.weekMode);
    const collapseWeekend = !!(opts && opts.collapseWeekend);
    const visibleIsos = collapseWeekend
      ? dayIsos.filter((iso) => !KV.isWeekendIso(iso))
      : dayIsos;
    const colCount = visibleIsos.length + (collapseWeekend ? 1 : 0);

    const heads = visibleIsos.map((iso) => {
      const day = Number(iso.slice(8, 10));
      const weekday = new Date(`${iso}T00:00:00`).toLocaleDateString('sv-SE', { weekday: 'short' });
      return `<div class="kalender-time-col-head${iso === t ? ' is-today' : ''}" data-date="${esc(iso)}">
        <div class="kalender-time-col-head-main">
          <span class="kalender-daynum"><span class="kalender-weekday-label">${esc(weekday)}</span> ${day}</span>
          ${dayCapacityHtml(iso, dayMap)}
        </div>
      </div>`;
    }).join('') + (collapseWeekend
      ? `<button type="button" class="kalender-time-col-head kalender-time-col-head--weekend-collapsed" data-kal-weekend-toggle="1" title="Visa lördag–söndag" aria-expanded="false">
          <span class="kalender-daynum">Lör–Sön</span>
        </button>`
      : '');

    const untimed = visibleIsos.map((iso) => allDayCellHtml(iso, dayMap)).join('')
      + (collapseWeekend ? '<div class="kalender-untimed kalender-untimed--weekend-collapsed" aria-hidden="true"></div>' : '');

    const tracks = visibleIsos.map((iso) => {
      const timed = (dayMap.get(iso) || []).filter((ev) => scheduleOf(ev));
      return `<div class="kalender-time-col${iso === t ? ' is-today' : ''}" data-date="${esc(iso)}">
        <div class="kalender-time-track" style="height:${trackH}px">
          ${hours.map(() => `<div class="kalender-time-hour" style="height:${KV.PX_PER_HOUR}px"></div>`).join('')}
          ${timedBlocksHtml(timed)}
          ${nowMarkerHtml(iso)}
        </div>
      </div>`;
    }).join('') + (collapseWeekend
      ? `<button type="button" class="kalender-time-col kalender-time-col--weekend-collapsed" data-kal-weekend-toggle="1" style="height:${trackH}px" title="Visa lördag–söndag" aria-label="Visa helg">
          <span class="kalender-weekend-collapsed-label">Helg</span>
        </button>`
      : '');

    // Expanded week: weekend heads also toggle collapse
    let headsHtml = heads;
    if (weekMode && !collapseWeekend) {
      headsHtml = dayIsos.map((iso) => {
        const day = Number(iso.slice(8, 10));
        const weekday = new Date(`${iso}T00:00:00`).toLocaleDateString('sv-SE', { weekday: 'short' });
        const weekendCls = KV.isWeekendIso(iso) ? ' kalender-time-col-head--weekend' : '';
        const toggleAttr = KV.isWeekendIso(iso) ? ' data-kal-weekend-toggle="1" title="Dölj helg"' : '';
        const tag = KV.isWeekendIso(iso) ? 'button type="button"' : 'div';
        const close = KV.isWeekendIso(iso) ? 'button' : 'div';
        return `<${tag} class="kalender-time-col-head${iso === t ? ' is-today' : ''}${weekendCls}" data-date="${esc(iso)}"${toggleAttr}>
          <div class="kalender-time-col-head-main">
            <span class="kalender-daynum"><span class="kalender-weekday-label">${esc(weekday)}</span> ${day}</span>
            ${dayCapacityHtml(iso, dayMap)}
          </div>
        </${close}>`;
      }).join('');
    }

    const gutter = hours.map((h) =>
      `<div class="kalender-time-gutter-label" style="height:${KV.PX_PER_HOUR}px">${esc(h)}</div>`
    ).join('');

    const gridMods = [
      'kalender-grid',
      'kalender-grid--timed',
      colCount === 1 ? 'kalender-grid--day' : 'kalender-grid--week',
      collapseWeekend ? 'kalender-grid--weekend-collapsed' : ''
    ].filter(Boolean).join(' ');

    gridEl.className = gridMods;
    gridEl.setAttribute('aria-label', ariaLabel);
    gridEl.innerHTML = `
      <div class="kalender-timed-wrap" style="--kal-cols:${weekMode && !collapseWeekend ? dayIsos.length : colCount}">
        <div class="kalender-timed-corner" aria-hidden="true"></div>
        <div class="kalender-timed-heads">${weekMode && !collapseWeekend ? headsHtml : heads}</div>
        <div class="kalender-timed-allday-label" aria-hidden="true">Heldag</div>
        <div class="kalender-timed-allday">${weekMode && !collapseWeekend
          ? dayIsos.map((iso) => allDayCellHtml(iso, dayMap)).join('')
          : untimed}</div>
        <div class="kalender-time-gutter">${gutter}</div>
        <div class="kalender-timed-cols">${weekMode && !collapseWeekend
          ? dayIsos.map((iso) => {
            const timed = (dayMap.get(iso) || []).filter((ev) => scheduleOf(ev));
            return `<div class="kalender-time-col${iso === t ? ' is-today' : ''}${KV.isWeekendIso(iso) ? ' kalender-time-col--weekend' : ''}" data-date="${esc(iso)}">
              <div class="kalender-time-track" style="height:${trackH}px">
                ${hours.map(() => `<div class="kalender-time-hour" style="height:${KV.PX_PER_HOUR}px"></div>`).join('')}
                ${timedBlocksHtml(timed)}
                ${nowMarkerHtml(iso)}
              </div>
            </div>`;
          }).join('')
          : tracks}</div>
      </div>`;

    bindGridClicks(dayMap);
    bindTimedInteractions();
    ensureNowMarkerTimer();
    bindAllDayInteractions(dayMap);
    bindWeekendToggle();
    scrollTimedGridIntoView(dayIsos);
  }

  function bindAllDayInteractions(dayMap) {
    gridEl.querySelectorAll('.kalender-deadlines-chip').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const date = btn.getAttribute('data-deadlines-date');
        if (deadlinesPopover) {
          closeDeadlinesPopover();
          return;
        }
        openDeadlinesPopover(date, btn);
      });
    });
    gridEl.querySelectorAll('.kalender-untimed[data-date]').forEach((strip) => {
      strip.addEventListener('dragover', (e) => {
        if (!dragState || !isCalendarDropMode(dragState.mode)) return;
        e.preventDefault();
        strip.classList.add('is-drop-target');
      });
      strip.addEventListener('dragleave', () => strip.classList.remove('is-drop-target'));
      strip.addEventListener('drop', async (e) => {
        e.preventDefault();
        strip.classList.remove('is-drop-target');
        const key = e.dataTransfer.getData('text/plain') || dragState?.key;
        const ev = eventByKey(key);
        const date = strip.getAttribute('data-date');
        if (!ev || !date) return;
        const startIso = KV.toLocalDateTimeIso(date, 9 * 60);
        const endIso = KV.toLocalDateTimeIso(date, 9 * 60 + KV.DEFAULT_BLOCK_MINUTES);
        const fromSide = dragState?.mode === 'side-add';
        const ok = await persistSchedule(ev, startIso, endIso, fromSide
          ? { mode: 'add', blockId: null }
          : { mode: ev.blockId ? 'update' : 'set', blockId: ev.blockId || null });
        if (ok) {
          render();
          refreshOpenDetail();
        }
      });
    });
  }

  function bindWeekendToggle() {
    gridEl.querySelectorAll('[data-kal-weekend-toggle]').forEach((node) => {
      node.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const currentlyExpanded = KV.resolveWeekendExpanded(
          weekendHasBlocks(byDay(filtered()), KV.weekDays(focus)),
          weekendExpandedPref
        );
        weekendExpandedPref = !currentlyExpanded;
        KV.saveStoredWeekendExpanded(weekendExpandedPref);
        render();
      });
    });
  }

  function renderWeek(dayMap) {
    const days = KV.weekDays(focus);
    const hasBlocks = weekendHasBlocks(dayMap, days);
    const expanded = KV.resolveWeekendExpanded(hasBlocks, weekendExpandedPref);
    renderTimedGrid(days, dayMap, 'Veckokalender med tider', {
      weekMode: true,
      collapseWeekend: !expanded
    });
  }

  function dayEventRow(ev) {
    const f = ev.record?.fields || {};
    const name = String(f['Kundnamn'] || f['Namn'] || 'Klient');
    const st = statusOf(ev);
    const cls = statusClass(st, ev.deadline);
    const period = ev.periodLabel || ev.periodKey || '';
    const ansvarig = String(f['Ansvarig'] || f['Klientansvarig'] || '').trim();
    const sched = scheduleOf(ev);
    const time = sched ? `${KV.fmtTimeLabel(sched.startMin)}–${KV.fmtTimeLabel(sched.endMin)} · ` : '';
    return `<button type="button" class="kalender-day-item kalender-day-item--${cls}" data-key="${esc(ev.key)}">
      <span class="kalender-day-item-accent" aria-hidden="true"></span>
      <span class="kalender-day-item-main">
        <span class="kalender-day-item-name">${esc(name)}</span>
        <span class="kalender-day-item-meta">${esc(time)}${esc(displayName(ev.typ, f))}${period ? ` · ${esc(period)}` : ''}${ansvarig ? ` · ${esc(ansvarig)}` : ''}</span>
      </span>
      <span class="kalender-day-item-status">${esc(statusLabel(st, ev.deadline))}</span>
    </button>`;
  }

  function renderDay(list) {
    const iso = KV.dateIso(focus);
    const dayMap = byDay(list);
    renderTimedGrid([iso], dayMap, 'Dagskalender med tider');
  }

  function fmtDate(iso) {
    const s = toDate(iso);
    if (!s) return '';
    return new Date(`${s}T00:00:00`).toLocaleDateString('sv-SE', {
      weekday: 'short', day: 'numeric', month: 'short'
    });
  }

  /**
   * Sidopanel (Deadlines/Öppna): ej klara ClientFlow-körningar som fortfarande är valbara.
   * Körningar med uppskattad tid där all tid är utlagd döljs (syns kvar i kalenderrutnätet).
   */
  function sidePanelEvents(list) {
    return (list || []).filter((ev) => {
      if (isOverlayCalendarEvent(ev)) return false;
      const st = statusOf(ev);
      if (st === 'Klar' || st === 'Avslutad') return false;
      return SB.isSelectableInPool(estimatedHoursOf(ev), totalScheduledHours(ev));
    });
  }

  function sideRowHtml(ev) {
    const f = ev.record?.fields || {};
    const name = String(f['Kundnamn'] || f['Namn'] || 'Klient');
    const st = statusOf(ev);
    const cls = statusClass(st, ev.deadline);
    const period = ev.periodLabel || ev.periodKey || '';
    const plan = planningOf(ev);
    const runKey = String(ev.runKey || ev.key || '');
    const canDrag = !!ev.runRec?.id;
    const deadlineBit = ev.deadline ? ` · deadline ${fmtDate(ev.deadline)}` : '';
    const meta = `${displayName(ev.typ, f)}${period ? ` · ${period}` : ''}${deadlineBit}`;
    let right = '';
    if (plan.hasEstimate) {
      const pct = plan.estimated > 0
        ? Math.min(100, Math.round((plan.scheduled / plan.estimated) * 100))
        : 0;
      right = `<span class="kalender-side-progress">
        <span class="kalender-side-progress-label">${esc(`${plan.scheduled} / ${plan.estimated} t`)}</span>
        <span class="kalender-side-progress-bar" aria-hidden="true"><span style="width:${pct}%"></span></span>
      </span>`;
    } else {
      right = '<span class="kalender-side-status">snabb</span>';
    }
    return `<button type="button" class="kalender-side-item kalender-side-item--${cls}${canDrag ? ' is-draggable' : ''}${plan.hasEstimate ? ' has-estimate' : ''}${cls === 'sen' ? ' is-overdue' : ''}"
      data-key="${esc(runKey)}" ${canDrag ? 'draggable="true"' : ''}
      title="${canDrag ? 'Dra till kalendern för att avsätta tid (kan göras flera gånger)' : ''}">
      <span class="kalender-side-main">
        <span class="kalender-side-name">${esc(name)}</span>
        <span class="kalender-side-meta">${esc(meta)}</span>
      </span>
      ${right}
    </button>`;
  }

  function bindSideItem(btn) {
    btn.addEventListener('click', () => {
      if (btn.dataset.suppressClick === '1') {
        btn.dataset.suppressClick = '';
        return;
      }
      openDetail(btn.getAttribute('data-key'));
    });
    if (btn.getAttribute('draggable') === 'true') {
      btn.addEventListener('dragstart', (e) => {
        const key = btn.getAttribute('data-key');
        e.dataTransfer.setData('text/plain', key);
        e.dataTransfer.effectAllowed = 'copy';
        btn.classList.add('is-dragging');
        dragState = { key, mode: 'side-add', duration: KV.DEFAULT_BLOCK_MINUTES };
      });
      btn.addEventListener('dragend', () => {
        btn.classList.remove('is-dragging');
        if (dragState && dragState.mode === 'side-add') {
          btn.dataset.suppressClick = '1';
        }
        dragState = null;
        gridEl.querySelectorAll('.is-drop-target').forEach((c) => c.classList.remove('is-drop-target'));
      });
    }
  }

  function renderSide(list) {
    if (!el.sideList) return;
    const expanded = sidePanelEvents(list);
    const items = typeof KE.uniqueRunEvents === 'function'
      ? KE.uniqueRunEvents(expanded)
      : SB.uniqueRunEvents(expanded);
    if (el.sideLabel) {
      el.sideLabel.textContent = eventMode === 'open' ? 'Kan göras nu' : 'Efter deadline';
    }
    if (el.sideCount) el.sideCount.textContent = items.length ? String(items.length) : '';
    const emptyWhen = KV.rangeEmptyLabel(view);
    const emptyNoun = eventMode === 'open' ? 'körningar att göra nu' : 'körningar efter deadline';
    if (!items.length) {
      el.sideList.innerHTML = `<p class="kalender-side-empty">Inga ${esc(emptyNoun)} ${esc(emptyWhen)} med aktuella filter.</p>`;
      return;
    }

    const weekRange = KV.visibleRange('week', focus);
    const groupItems = items.map((ev) => {
      const st = statusOf(ev);
      const cls = statusClass(st, ev.deadline);
      return {
        ev,
        deadline: toDate(ev.deadline) || placeDateOf(ev),
        placeDate: placeDateOf(ev),
        overdue: cls === 'sen'
      };
    });
    const groups = KV.groupSidePanelItems(groupItems, {
      todayIso: today(),
      weekStart: weekRange.start,
      weekEnd: weekRange.end
    });

    el.sideList.innerHTML = groups.map((g) => {
      const shown = sideGroupVisible[g.key] || KV.SIDE_GROUP_PAGE;
      const visible = g.items.slice(0, shown);
      const rest = g.count - visible.length;
      const headingCls = g.key === 'overdue' ? ' kalender-side-group-title--overdue' : '';
      return `<div class="kalender-side-group" data-side-group="${esc(g.key)}">
        <div class="kalender-side-group-title${headingCls}">${esc(g.label)} · ${g.count}</div>
        <div class="kalender-side-group-list">
          ${visible.map((row) => sideRowHtml(row.ev)).join('')}
        </div>
        ${rest > 0 ? `<button type="button" class="kalender-side-more" data-side-more="${esc(g.key)}">Visa ${rest} till</button>` : ''}
      </div>`;
    }).join('');

    el.sideList.querySelectorAll('.kalender-side-item[data-key]').forEach(bindSideItem);
    el.sideList.querySelectorAll('[data-side-more]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.getAttribute('data-side-more');
        const g = groups.find((x) => x.key === key);
        sideGroupVisible[key] = g ? g.count : (sideGroupVisible[key] || KV.SIDE_GROUP_PAGE) + KV.SIDE_GROUP_PAGE;
        renderSide(list);
      });
    });
  }

  async function ensureGcalCustomers() {
    if (gcalCustomersLoaded) return gcalCustomers;
    try {
      const res = await fetch(`${baseUrl}/api/kunddata`, {
        method: 'POST',
        ...authOpts(),
        body: JSON.stringify({})
      });
      if (!res.ok) return gcalCustomers;
      const data = await res.json().catch(() => ({}));
      const records = (data.success && data.data) ? data.data : [];
      gcalCustomers = records.map((r) => {
        const f = r.fields || {};
        return {
          id: r.id,
          namn: String(f.Namn || f['Företagsnamn'] || 'Namn saknas').trim(),
          orgnr: String(f.Orgnr || f.orgnr || '').trim(),
          byraId: String(f['Byrå ID'] || f.byraId || '').replace(/,/g, '').trim()
        };
      }).sort((a, b) => a.namn.localeCompare(b.namn, 'sv'));
      gcalCustomersLoaded = true;
    } catch (err) {
      console.warn('Kalender kundlista:', err);
    }
    return gcalCustomers;
  }

  function resolveGcalCustomerFromForm(root) {
    if (!root) return null;
    const search = root.querySelector('#kal-gcal-customer');
    const idInput = root.querySelector('#kal-gcal-customer-id');
    const name = String((search && search.value) || '').trim();
    const id = String((idInput && idInput.value) || '').trim();
    const byName = gcalCustomers.find((c) => c.namn === name);
    if (byName) {
      if (idInput) idInput.value = byName.id;
      return byName;
    }
    if (id) {
      const byId = gcalCustomers.find((c) => c.id === id);
      if (byId) return byId;
    }
    return name ? { id: '', namn: name, orgnr: '', byraId: '' } : null;
  }

  function gcalFormTimes(root, fallbackSched) {
    const startEl = root.querySelector('#kal-gcal-start');
    const endEl = root.querySelector('#kal-gcal-end');
    const startHm = String((startEl && startEl.value) || '').trim()
      || (fallbackSched ? KV.fmtTimeLabel(fallbackSched.startMin) : '');
    const endHm = String((endEl && endEl.value) || '').trim()
      || (fallbackSched ? KV.fmtTimeLabel(fallbackSched.endMin) : '');
    return { startHm, endHm };
  }

  function syncGcalHoursHint(root, fallbackSched) {
    const hint = root && root.querySelector('[data-gcal-hours]');
    if (!hint || !GA) return;
    const { startHm, endHm } = gcalFormTimes(root, fallbackSched);
    const a = GA.parseHm(startHm);
    const b = GA.parseHm(endHm);
    if (a == null || b == null || !(b > a)) {
      hint.textContent = 'Ange giltig start och slut';
      return;
    }
    hint.textContent = `${GA.hoursBetween(a, b)} t`;
  }

  async function submitGcalTid(ev, root) {
    if (!GA || typeof GA.buildGcalTidPayload !== 'function') {
      showSaveToast('Saknar kalender-gcal-actions.js', true);
      return;
    }
    const cust = resolveGcalCustomerFromForm(root);
    if (!cust || !cust.id) {
      showSaveToast('Välj kund från listan', true);
      return;
    }
    const sched = scheduleOf(ev);
    const date = toDate(ev.deadline) || (sched && sched.date) || '';
    const { startHm, endHm } = gcalFormTimes(root, sched);
    let tidBody;
    try {
      tidBody = GA.buildGcalTidPayload({
        customerId: cust.id,
        customerName: cust.namn,
        date,
        startHm,
        endHm,
        title: ev.summary || '',
        status: 'Klar'
      });
    } catch (err) {
      showSaveToast((err && err.message) || 'Kunde inte bygga tidpost', true);
      return;
    }
    const btn = root.querySelector('[data-gcal-tid]');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sparar…';
    }
    try {
      await postTidPayload(tidBody);
      // Uppdatera lokal vy så blocket speglar faktisk tid
      if (tidBody.start && tidBody.end) {
        ev.scheduledStart = tidBody.start;
        ev.scheduledEnd = tidBody.end;
        const idx = googleEvents.findIndex((g) => g.key === ev.key);
        if (idx >= 0) {
          googleEvents[idx] = { ...googleEvents[idx], scheduledStart: tidBody.start, scheduledEnd: tidBody.end };
        }
      }
      showSaveToast(`Tid registrerad · ${tidBody.hours} t`);
      render();
      refreshOpenDetail();
    } catch (err) {
      console.error('Kalender GCal tid:', err);
      showSaveToast((err && err.message) || 'Kunde inte registrera tid', true);
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-clock"></i> Registrera tid';
      }
    }
  }

  async function submitGcalNote(ev, root) {
    if (!GA || typeof GA.buildGcalNotePayload !== 'function') {
      showSaveToast('Saknar kalender-gcal-actions.js', true);
      return;
    }
    const cust = resolveGcalCustomerFromForm(root);
    if (!cust || !cust.id) {
      showSaveToast('Välj kund från listan', true);
      return;
    }
    const noteEl = root.querySelector('#kal-gcal-note');
    const sched = scheduleOf(ev);
    const { startHm, endHm } = gcalFormTimes(root, sched);
    const user = window.AuthManager && AuthManager.getCurrentUser ? AuthManager.getCurrentUser() : null;
    const userByra = user && (user.byraId || (user.byraIds && user.byraIds[0])) || '';
    let noteBody;
    try {
      noteBody = GA.buildGcalNotePayload({
        customerId: cust.id,
        customerName: cust.namn,
        byraId: cust.byraId || String(userByra || '').replace(/,/g, '').trim(),
        orgnr: cust.orgnr,
        date: toDate(ev.deadline) || (sched && sched.date) || '',
        title: ev.summary || '',
        startHm,
        endHm,
        notes: noteEl ? noteEl.value : ''
      });
    } catch (err) {
      showSaveToast((err && err.message) || 'Kunde inte bygga anteckning', true);
      return;
    }
    const btn = root.querySelector('[data-gcal-note]');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sparar…';
    }
    try {
      const res = await fetch(`${baseUrl}/api/notes`, {
        method: 'POST',
        ...authOpts(),
        headers: {
          ...(authOpts().headers || {}),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(noteBody)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || data.message || `HTTP ${res.status}`);
      showSaveToast('Mötesanteckning sparad på kunden');
      if (noteEl) noteEl.value = '';
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-sticky-note"></i> Spara mötesanteckning';
      }
    } catch (err) {
      console.error('Kalender GCal anteckning:', err);
      showSaveToast((err && err.message) || 'Kunde inte spara anteckning', true);
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-sticky-note"></i> Spara mötesanteckning';
      }
    }
  }

  function bindGoogleDetailActions(ev, sched) {
    const root = el.detailBody;
    if (!root) return;
    const search = root.querySelector('#kal-gcal-customer');
    const idInput = root.querySelector('#kal-gcal-customer-id');
    if (search) {
      const syncId = () => {
        const name = String(search.value || '').trim();
        const hit = gcalCustomers.find((c) => c.namn === name);
        if (idInput) idInput.value = hit ? hit.id : '';
      };
      search.addEventListener('change', syncId);
      search.addEventListener('blur', syncId);
    }
    root.querySelectorAll('#kal-gcal-start, #kal-gcal-end').forEach((inp) => {
      inp.addEventListener('input', () => syncGcalHoursHint(root, sched));
      inp.addEventListener('change', () => syncGcalHoursHint(root, sched));
    });
    const tidBtn = root.querySelector('[data-gcal-tid]');
    if (tidBtn) tidBtn.addEventListener('click', () => submitGcalTid(ev, root));
    const noteBtn = root.querySelector('[data-gcal-note]');
    if (noteBtn) noteBtn.addEventListener('click', () => submitGcalNote(ev, root));
    syncGcalHoursHint(root, sched);
  }

  function renderGoogleDetail(ev, group) {
    const name = String(ev.summary || 'Google-händelse');
    const sched = scheduleOf(ev);
    const dateIso = toDate(ev.deadline) || (sched && sched.date) || '';
    const startHm = sched ? KV.fmtTimeLabel(sched.startMin) : '09:00';
    const endHm = sched ? KV.fmtTimeLabel(sched.endMin) : '10:00';
    const blockLabel = sched
      ? `${KV.fmtTimeLabel(sched.startMin)}–${KV.fmtTimeLabel(sched.endMin)}`
      : (ev.allDay ? 'Heldag' : '—');
    const siblings = Array.isArray(group) && group.length > 1 ? group : null;
    const timed = !!(sched && !ev.allDay);
    openDetailKey = String(ev.key || '');

    const GA = window.KalenderGcalActions;
    const cleanedDesc = GA && typeof GA.cleanGcalDescription === 'function'
      ? GA.cleanGcalDescription(ev.description || '')
      : String(ev.description || '').trim();
    const meetingUrl = eventMeetingUrl(ev);

    if (el.detailTitle) el.detailTitle.textContent = name;
    el.detailBody.innerHTML = `
      <div class="kalender-detail-status kalender-detail-status--google">${googleColorDotHtml(ev)} Google-kalender</div>
      <dl class="kalender-detail-dl">
        <div><dt>Titel</dt><dd>${esc(name)}</dd></div>
        <div><dt>Datum</dt><dd>${esc(dateIso || '—')}</dd></div>
        <div><dt>Planerad tid</dt><dd>${esc(blockLabel)}</dd></div>
        ${ev.location && !/^https?:\/\//i.test(String(ev.location)) ? `<div><dt>Plats</dt><dd>${esc(ev.location)}</dd></div>` : ''}
        ${meetingUrl ? `<div><dt>Möteslänk</dt><dd><a class="kalender-meet-link" href="${esc(meetingUrl)}" target="_blank" rel="noopener noreferrer"><i class="fas fa-video"></i> ${esc(meetingUrl)}</a></dd></div>` : ''}
        ${cleanedDesc ? `<div><dt>Beskrivning</dt><dd class="kalender-detail-desc">${esc(cleanedDesc).slice(0, 800)}</dd></div>` : ''}
      </dl>
      <div class="kalender-detail-scope kalender-gcal-followup">
        <h4 class="kalender-detail-scope-title">Efter mötet</h4>
        <p class="kalender-detail-blocks-hint">Koppla kund, justera faktisk tid och registrera tid eller spara mötesanteckning på kunden.</p>
        <label class="kalender-gcal-label" for="kal-gcal-customer">Kund</label>
        <input type="text" id="kal-gcal-customer" class="kunduppgifter-input" list="kal-gcal-customer-list"
          placeholder="Sök kund…" autocomplete="off">
        <input type="hidden" id="kal-gcal-customer-id" value="">
        <datalist id="kal-gcal-customer-list"></datalist>
        ${timed ? `
        <div class="kalender-gcal-time-row">
          <div>
            <label class="kalender-gcal-label" for="kal-gcal-start">Start</label>
            <input type="time" id="kal-gcal-start" class="kunduppgifter-input" value="${esc(startHm)}">
          </div>
          <div>
            <label class="kalender-gcal-label" for="kal-gcal-end">Slut</label>
            <input type="time" id="kal-gcal-end" class="kunduppgifter-input" value="${esc(endHm)}">
          </div>
          <div class="kalender-gcal-hours" data-gcal-hours>—</div>
        </div>
        <p class="kalender-detail-blocks-hint">Justera om mötet tog annan tid — används vid tidregistrering.</p>
        ` : `<p class="kalender-detail-blocks-hint">Heldagshändelse — tidregistrering kräver start/slut; öppna i Google eller skapa tid manuellt under Tid.</p>`}
        <label class="kalender-gcal-label" for="kal-gcal-note">Mötesanteckning</label>
        <textarea id="kal-gcal-note" class="kunduppgifter-input kalender-gcal-note" rows="4"
          placeholder="Vad ni gick igenom, beslut, nästa steg…"></textarea>
        <div class="kalender-detail-actions kalender-detail-actions--scope">
          ${timed ? `<button type="button" class="btn btn-primary btn-sm" data-gcal-tid>
            <i class="fas fa-clock"></i> Registrera tid
          </button>` : ''}
          <button type="button" class="btn btn-ghost btn-sm" data-gcal-note>
            <i class="fas fa-sticky-note"></i> Spara mötesanteckning
          </button>
          ${ev.htmlLink ? `<a class="btn btn-ghost btn-sm" href="${esc(ev.htmlLink)}" target="_blank" rel="noopener noreferrer"><i class="fab fa-google"></i> Öppna i Google</a>` : ''}
        </div>
      </div>
      ${siblings ? `<div class="kalender-detail-siblings"><h4>Fler samma dag</h4>
        ${siblings.map((s) => {
          const label = isGoogleEvent(s) ? (s.summary || 'Google') : String(s.record?.fields?.Kundnamn || s.key);
          return `<button type="button" class="kalender-side-item${isGoogleEvent(s) ? ' kalender-side-item--google' : ''}" data-key="${esc(s.key)}"><span class="kalender-side-name">${isGoogleEvent(s) ? googleColorDotHtml(s) : ''}${esc(label)}</span></button>`;
        }).join('')}
      </div>` : ''}`;
    el.detail.hidden = false;
    document.body.classList.add('kalender-detail-open');
    el.detailBody.querySelectorAll('[data-key]').forEach((btn) => {
      btn.addEventListener('click', () => openDetail(btn.getAttribute('data-key')));
    });
    bindGoogleDetailActions(ev, sched);
    ensureGcalCustomers().then((list) => {
      const dl = el.detailBody && el.detailBody.querySelector('#kal-gcal-customer-list');
      if (!dl) return;
      dl.innerHTML = list.map((c) =>
        `<option value="${esc(c.namn)}"></option>`
      ).join('');
    });
  }

  function renderMeetingDetail(ev, group) {
    const name = String(ev.summary || ev.title || 'Möte');
    const sched = scheduleOf(ev);
    const dateIso = toDate(ev.deadline) || (sched && sched.date) || '';
    const blockLabel = sched
      ? `${KV.fmtTimeLabel(sched.startMin)}–${KV.fmtTimeLabel(sched.endMin)}`
      : '—';
    const meetingUrl = eventMeetingUrl(ev);
    const location = String(ev.location || '').trim();
    const showLocation = location && !/^https?:\/\//i.test(location);
    const siblings = Array.isArray(group) && group.length > 1 ? group : null;
    openDetailKey = String(ev.key || '');

    if (el.detailTitle) el.detailTitle.textContent = name;
    el.detailBody.innerHTML = `
      <div class="kalender-detail-status kalender-detail-status--meeting"><i class="fas fa-video" aria-hidden="true"></i> Mötesinbjudan</div>
      <dl class="kalender-detail-dl">
        <div><dt>Titel</dt><dd>${esc(name)}</dd></div>
        <div><dt>Datum</dt><dd>${esc(dateIso || '—')}</dd></div>
        <div><dt>Planerad tid</dt><dd>${esc(blockLabel)}</dd></div>
        ${ev.meetingType ? `<div><dt>Typ</dt><dd>${esc(ev.meetingType)}</dd></div>` : ''}
        ${ev.bookerName ? `<div><dt>Inbjuden</dt><dd>${esc(ev.bookerName)}${ev.bookerEmail ? ` · ${esc(ev.bookerEmail)}` : ''}</dd></div>` : ''}
        ${showLocation ? `<div><dt>Plats</dt><dd>${esc(location)}</dd></div>` : ''}
        ${meetingUrl ? `<div><dt>Möteslänk</dt><dd><a class="kalender-meet-link" href="${esc(meetingUrl)}" target="_blank" rel="noopener noreferrer"><i class="fas fa-video"></i> ${esc(meetingUrl)}</a></dd></div>` : ''}
        ${ev.description ? `<div><dt>Anteckning</dt><dd class="kalender-detail-desc">${esc(ev.description).slice(0, 800)}</dd></div>` : ''}
      </dl>
      ${meetingUrl ? `<div class="kalender-detail-actions"><a class="btn btn-primary btn-sm" href="${esc(meetingUrl)}" target="_blank" rel="noopener noreferrer"><i class="fas fa-video"></i> Öppna möteslänk</a></div>` : ''}
      ${siblings ? `<div class="kalender-detail-siblings"><h4>Fler samma dag</h4>
        ${siblings.map((s) => {
          const label = isOverlayCalendarEvent(s)
            ? (s.summary || (isMeetingEvent(s) ? 'Möte' : 'Google'))
            : String(s.record?.fields?.Kundnamn || s.key);
          const sideCls = isMeetingEvent(s)
            ? ' kalender-side-item--meeting'
            : (isGoogleEvent(s) ? ' kalender-side-item--google' : '');
          return `<button type="button" class="kalender-side-item${sideCls}" data-key="${esc(s.key)}"><span class="kalender-side-name">${esc(label)}</span></button>`;
        }).join('')}
      </div>` : ''}`;
    el.detail.hidden = false;
    document.body.classList.add('kalender-detail-open');
    el.detailBody.querySelectorAll('[data-key]').forEach((btn) => {
      btn.addEventListener('click', () => openDetail(btn.getAttribute('data-key')));
    });
  }

  function openDetail(key, group) {
    const ev = eventByKey(key) || (group || []).find((x) => x.key === key || x.runKey === key);
    if (!ev || !el.detail) return;
    openDetailKey = String(ev.blockId ? ev.key : (ev.runKey || ev.key || key || ''));

    if (isMeetingEvent(ev)) {
      renderMeetingDetail(ev, group);
      return;
    }
    if (isGoogleEvent(ev)) {
      renderGoogleDetail(ev, group);
      return;
    }

    const f = ev.record?.fields || {};
    const kundId = String(f['Kund ID'] || '').trim();
    const name = String(f['Kundnamn'] || f['Namn'] || 'Klient');
    const st = statusOf(ev);
    const cls = statusClass(st, ev.deadline);
    const ansvarig = String(f['Ansvarig'] || f['Klientansvarig'] || '').trim();
    const period = ev.periodLabel || ev.periodKey || '—';
    const siblings = Array.isArray(group) && group.length > 1 ? group : null;
    const blockList = blocksOf(ev);
    const totalH = totalScheduledHours(ev);
    const plan = planningOf(ev);
    const focusBlockId = String(ev.blockId || '').trim();
    const focusBlock = focusBlockId ? blockList.find((b) => b.id === focusBlockId) : null;
    const focusSched = focusBlock ? KV.normalizeSchedule(focusBlock.start, focusBlock.end) : null;
    const isKlar = cls === 'klar';
    const runStatusRaw = String(ev.runRec?.fields?.Status || '').trim();
    const isRunKlar = runStatusRaw === 'Klar' || runStatusRaw === 'Avslutad';
    // Tillfälle-knappar styrs av detta block; hela-körningen av run-status
    const canKlarTillfalle = !isKlar && !!ev.runRec?.id && !!focusSched;
    const canKlarHela = !isRunKlar && !!ev.runRec?.id;
    const canKlar = canKlarHela; // estimate/remove block medan körningen är öppen
    const canKlarTid = canKlarHela && !!kundId;
    const canKlarTillfalleTid = canKlarTillfalle && !!kundId;
    const hasHours = totalH > 0;
    const hasFocusHours = !!(focusSched && focusSched.hours > 0);
    let blockLabel = 'Ej avsatt — dra från listan till kalendern';
    if (blockList.length === 1) {
      const sched = KV.normalizeSchedule(blockList[0].start, blockList[0].end);
      if (sched) {
        blockLabel = `${KV.fmtTimeLabel(sched.startMin)}–${KV.fmtTimeLabel(sched.endMin)} (${sched.hours} t) · ${fmtDate(sched.date)}`;
      }
    } else if (blockList.length > 1) {
      blockLabel = `${blockList.length} tillfällen · ${totalH} t totalt`;
    }
    if (plan.hasEstimate) {
      blockLabel += plan.fullyPlanned
        ? ` · ${plan.estimated} t inplanerad`
        : ` · ${plan.scheduled}/${plan.estimated} t (${plan.remaining} t kvar)`;
    }

    const blocksHtml = blockList.length
      ? `<ul class="kalender-detail-blocks">
          ${blockList.map((b) => {
            const sched = KV.normalizeSchedule(b.start, b.end);
            if (!sched) return '';
            const isFocus = focusBlockId && b.id === focusBlockId;
            const rowNote = b.note ? ` — ${String(b.note).trim()}` : '';
            return `<li class="kalender-detail-block-row${isFocus ? ' is-focus' : ''}">
              <span>${esc(fmtDate(sched.date))} · ${esc(KV.fmtTimeLabel(sched.startMin))}–${esc(KV.fmtTimeLabel(sched.endMin))} (${esc(String(sched.hours))} t)${isFocus ? ' · valt' : ''}${esc(rowNote)}</span>
              ${canKlar ? `<button type="button" class="btn btn-ghost btn-sm kalender-detail-block-remove" data-remove-block="${esc(b.id)}" title="Ta bort tillfälle" aria-label="Ta bort tillfälle"><i class="fas fa-times" aria-hidden="true"></i></button>` : ''}
            </li>`;
          }).join('')}
        </ul>
        <p class="kalender-detail-blocks-hint">Dra från listan igen för fler tillfällen. Med uppskattad tid försvinner raden från listan när allt är utlagt. Ta bort ett enskilt tillfälle med × eller «Ta bort detta tillfälle».</p>`
      : '';

    const estimateVal = plan.hasEstimate ? String(plan.estimated) : '';
    const estimateHtml = canKlar || plan.hasEstimate
      ? `<div class="kalender-detail-estimate">
          <label for="kal-estimate-hours">Uppskattad tid (t)</label>
          <div class="kalender-detail-estimate-row">
            <input type="number" id="kal-estimate-hours" class="kunduppgifter-input" min="0" step="0.25" inputmode="decimal"
              value="${esc(estimateVal)}" placeholder="t.ex. 10" ${canKlar ? '' : 'disabled'}>
            ${canKlar ? `<button type="button" class="btn btn-ghost btn-sm" data-save-estimate>Spara</button>` : ''}
          </div>
          <p class="kalender-detail-blocks-hint">Tomt = snabbuppgift (syns alltid i listan tills den är klar). Med tid döljs den från listan när all tid är utlagd.</p>
        </div>`
      : '';

    const focusNote = focusBlock ? String(focusBlock.note || '').trim() : String(ev.blockNote || '').trim();
    const canEditNote = !!focusSched && !!focusBlockId && !!ev.runRec?.id;
    // Ta bort bokning = bara detta tillfälle, även om det är klarmarkerat (så länge körningen är öppen)
    const canRemoveTillfalle = canKlar && !!focusSched && !!focusBlockId && !!ev.runRec?.id;
    // Ångra klarmarkering även när hela körningen är Klar (öppnar tillfället + körningen igen)
    const canAngraTillfalle = isKlar && !!focusSched && !!focusBlockId && !!ev.runRec?.id;
    const canAngraHela = isRunKlar && !!ev.runRec?.id;
    const noteHtml = canEditNote
      ? `<div class="kalender-detail-note">
          <label for="kal-block-note">Anteckning</label>
          <textarea id="kal-block-note" class="kunduppgifter-input kalender-detail-note-input" rows="2"
            maxlength="${SB.NOTE_MAX_LEN || 2000}"
            placeholder="T.ex. mejla ut dokumenten för signering">${esc(focusNote)}</textarea>
          <div class="kalender-detail-estimate-row">
            <button type="button" class="btn btn-ghost btn-sm" data-save-note>Spara anteckning</button>
          </div>
        </div>`
      : (focusNote
        ? `<p class="kalender-detail-note-readonly">${esc(focusNote)}</p>`
        : '');
    let tillfalleActions = '';
    if (canKlarTillfalle || canRemoveTillfalle || canAngraTillfalle) {
      const klarBtns = canKlarTillfalle
        ? `<button type="button" class="btn btn-ghost btn-sm" data-klar-tillfalle>
            <i class="fas fa-check"></i> Klarmarkera tillfälle
          </button>
          ${canKlarTillfalleTid ? `<button type="button" class="btn btn-primary btn-sm" data-klar-tillfalle-tid ${hasFocusHours ? '' : 'disabled'}>
            <i class="fas fa-check"></i> Klarmarkera tillfälle & tid (${esc(String(focusSched.hours))} t)
          </button>` : ''}`
        : (canAngraTillfalle
          ? `<span class="kalender-detail-done-hint"><i class="fas fa-check-circle"></i> Tillfälle klarmarkerat</span>
            <button type="button" class="btn btn-ghost btn-sm" data-angra-klar-tillfalle>
              <i class="fas fa-undo"></i> Ångra klarmarkering
            </button>`
          : '');
      const removeBtn = canRemoveTillfalle
        ? `<button type="button" class="btn btn-danger btn-sm" data-remove-tillfalle>
            <i class="fas fa-trash-alt"></i> Ta bort detta tillfälle
          </button>`
        : '';
      tillfalleActions = `<div class="kalender-detail-actions kalender-detail-actions--scope">
          ${klarBtns}
          ${removeBtn}
        </div>`;
    } else if (isKlar) {
      tillfalleActions = `<div class="kalender-detail-actions kalender-detail-actions--scope">
          <span class="kalender-detail-done-hint"><i class="fas fa-check-circle"></i> Tillfälle klarmarkerat</span>
          ${canAngraTillfalle ? `<button type="button" class="btn btn-ghost btn-sm" data-angra-klar-tillfalle>
            <i class="fas fa-undo"></i> Ångra klarmarkering
          </button>` : ''}
        </div>`;
    }
    const tillfalleHtml = focusSched
      ? `<div class="kalender-detail-scope">
          <h4 class="kalender-detail-scope-title">Detta tillfälle</h4>
          <p class="kalender-detail-blocks-hint">${esc(fmtDate(focusSched.date))} · ${esc(KV.fmtTimeLabel(focusSched.startMin))}–${esc(KV.fmtTimeLabel(focusSched.endMin))} (${esc(String(focusSched.hours))} t)</p>
          ${noteHtml}
          ${tillfalleActions}
        </div>`
      : '';

    if (el.detailTitle) {
      if (kundId) {
        el.detailTitle.innerHTML = `<a class="kalender-detail-customer-link" href="kundkort.html?id=${encodeURIComponent(kundId)}" title="Öppna kundkort">${esc(name)}</a>`;
      } else {
        el.detailTitle.textContent = name;
      }
    }
    // När ett tillfälle är i fokus: tillfälle-knappar är primära; hela-körningen sekundär
    const focusScoped = !!focusSched;
    const klarOnlyCls = (hasHours || focusScoped) ? 'btn btn-ghost btn-sm' : 'btn btn-primary btn-sm';
    const klarTidCls = (hasHours && !focusScoped) ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm';
    const CU = window.KalenderCreateUppgift;
    const isUppgiftOnly = CU && typeof CU.isStandaloneUppgiftEvent === 'function'
      ? CU.isStandaloneUppgiftEvent(ev)
      : (String(ev.typ || '').trim() === 'Eget uppdrag');
    const metaDl = isUppgiftOnly
      ? `<dl class="kalender-detail-dl">
        <div><dt>Uppgift</dt><dd>${esc(displayName(ev.typ, f))}</dd></div>
        <div><dt>Deadline</dt><dd>${esc(toDate(ev.deadline) || '—')}</dd></div>
        <div><dt>Avsatt tid</dt><dd data-avsatt-tid>${esc(blockLabel)}</dd></div>
        ${ansvarig ? `<div><dt>Ansvarig</dt><dd>${esc(ansvarig)}</dd></div>` : ''}
      </dl>`
      : `<dl class="kalender-detail-dl">
        <div><dt>Uppdrag</dt><dd>${esc(displayName(ev.typ, f))}</dd></div>
        <div><dt>Period</dt><dd>${esc(period)}</dd></div>
        <div><dt>Öppet från</dt><dd>${esc(toDate(ev.startDate) || '—')}</dd></div>
        <div><dt>Deadline</dt><dd>${esc(toDate(ev.deadline) || '—')}</dd></div>
        <div><dt>Avsatt tid</dt><dd data-avsatt-tid>${esc(blockLabel)}</dd></div>
        ${ansvarig ? `<div><dt>Ansvarig</dt><dd>${esc(ansvarig)}</dd></div>` : ''}
      </dl>`;
    el.detailBody.innerHTML = `
      <div class="kalender-detail-status kalender-detail-status--${cls}">${esc(statusLabel(st, ev.deadline))}${plan.fullyPlanned ? ' · Inplanerad' : ''}</div>
      ${metaDl}
      ${estimateHtml}
      ${blocksHtml}
      ${tillfalleHtml}
      <div class="kalender-detail-scope">
        <h4 class="kalender-detail-scope-title">${isUppgiftOnly ? 'Åtgärder' : (focusSched ? 'Hela körningen' : 'Åtgärder')}</h4>
        <div class="kalender-detail-actions">
          ${canKlar ? `<button type="button" class="${klarOnlyCls}" data-klar-only>
            <i class="fas fa-check"></i> ${isUppgiftOnly ? 'Klarmarkera' : 'Klarmarkera hela'}
          </button>` : ''}
          ${canKlarTid ? `<button type="button" class="${klarTidCls}" data-klar-tid ${hasHours ? '' : 'disabled'}>
            <i class="fas fa-check"></i> ${isUppgiftOnly ? 'Klarmarkera & tid' : 'Klarmarkera hela & tid'}${hasHours ? ` (${esc(String(totalH))} t)` : ''}
          </button>` : ''}
          ${isRunKlar ? `<span class="kalender-detail-done-hint"><i class="fas fa-check-circle"></i> ${isUppgiftOnly ? 'Klarmarkerad' : 'Hela körningen klarmarkerad'}</span>
            ${canAngraHela ? `<button type="button" class="btn btn-ghost btn-sm" data-angra-klar-hela>
              <i class="fas fa-undo"></i> Ångra klarmarkering
            </button>` : ''}` : ''}
          <a class="btn btn-ghost btn-sm" href="uppdrag-oversikt.html"><i class="fas fa-briefcase"></i> Uppdragstavla</a>
        </div>
      </div>
      ${siblings ? `<div class="kalender-detail-siblings"><h4>Fler samma dag</h4>
        ${siblings.map((r) => {
          const rf = r.record?.fields || {};
          const rs = statusOf(r);
          return `<button type="button" class="kalender-side-item kalender-side-item--${statusClass(rs, r.deadline)}" data-key="${esc(r.key)}">
            <span class="kalender-side-main">
              <span class="kalender-side-name">${esc(String(rf['Kundnamn'] || 'Klient'))}</span>
              <span class="kalender-side-meta">${esc(displayName(r.typ, rf))}</span>
            </span>
          </button>`;
        }).join('')}
      </div>` : ''}`;
    el.detail.hidden = false;
    document.body.classList.add('kalender-detail-open');
    el.detailBody.querySelectorAll('[data-key]').forEach((btn) => {
      btn.addEventListener('click', () => openDetail(btn.getAttribute('data-key')));
    });
    const klarOnlyBtn = el.detailBody.querySelector('[data-klar-only]');
    if (klarOnlyBtn) {
      klarOnlyBtn.addEventListener('click', () => {
        klarOnly(ev);
      });
    }
    const klarBtn = el.detailBody.querySelector('[data-klar-tid]');
    if (klarBtn) {
      klarBtn.addEventListener('click', () => {
        klarAndRegisterTid(ev);
      });
    }
    const klarTillfalleBtn = el.detailBody.querySelector('[data-klar-tillfalle]');
    if (klarTillfalleBtn) {
      klarTillfalleBtn.addEventListener('click', () => {
        klarTillfalle(ev, { blockId: focusBlockId, withTid: false });
      });
    }
    const klarTillfalleTidBtn = el.detailBody.querySelector('[data-klar-tillfalle-tid]');
    if (klarTillfalleTidBtn) {
      klarTillfalleTidBtn.addEventListener('click', () => {
        klarTillfalle(ev, { blockId: focusBlockId, withTid: true });
      });
    }
    const angraKlarTillfalleBtn = el.detailBody.querySelector('[data-angra-klar-tillfalle]');
    if (angraKlarTillfalleBtn) {
      angraKlarTillfalleBtn.addEventListener('click', () => {
        angraKlarTillfalle(ev, { blockId: focusBlockId });
      });
    }
    const angraKlarHelaBtn = el.detailBody.querySelector('[data-angra-klar-hela]');
    if (angraKlarHelaBtn) {
      angraKlarHelaBtn.addEventListener('click', () => {
        angraKlarHela(ev);
      });
    }
    const saveEstBtn = el.detailBody.querySelector('[data-save-estimate]');
    if (saveEstBtn) {
      saveEstBtn.addEventListener('click', async () => {
        const input = el.detailBody.querySelector('#kal-estimate-hours');
        const raw = input ? String(input.value || '').trim() : '';
        const hours = raw === '' ? null : Number(raw.replace(',', '.'));
        if (raw !== '' && !Number.isFinite(hours)) {
          showSaveToast('Ogiltig uppskattad tid', true);
          return;
        }
        saveEstBtn.disabled = true;
        const ok = await persistEstimate(ev, hours);
        if (ok) {
          render();
          refreshOpenDetail();
        } else {
          saveEstBtn.disabled = false;
        }
      });
    }
    const saveNoteBtn = el.detailBody.querySelector('[data-save-note]');
    if (saveNoteBtn) {
      saveNoteBtn.addEventListener('click', async () => {
        const ta = el.detailBody.querySelector('#kal-block-note');
        const note = ta ? String(ta.value || '') : '';
        saveNoteBtn.disabled = true;
        const ok = await persistSchedule(ev, null, null, {
          mode: 'update',
          blockId: focusBlockId,
          note
        });
        if (ok) {
          render();
          refreshOpenDetail();
        } else {
          saveNoteBtn.disabled = false;
        }
      });
    }
    el.detailBody.querySelectorAll('[data-remove-block]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const blockId = btn.getAttribute('data-remove-block');
        if (!blockId) return;
        btn.disabled = true;
        const ok = await removeTillfalle(ev, blockId);
        if (!ok) btn.disabled = false;
      });
    });
    const removeTillfalleBtn = el.detailBody.querySelector('[data-remove-tillfalle]');
    if (removeTillfalleBtn) {
      removeTillfalleBtn.addEventListener('click', async () => {
        removeTillfalleBtn.disabled = true;
        const ok = await removeTillfalle(ev, focusBlockId);
        if (!ok) removeTillfalleBtn.disabled = false;
      });
    }
  }

  function closeDetail() {
    if (!el.detail) return;
    openDetailKey = null;
    el.detail.hidden = true;
    document.body.classList.remove('kalender-detail-open');
  }

  function syncNavLabels() {
    const labels = KV.navAria(view);
    if (el.prev) {
      el.prev.title = labels.prev;
      el.prev.setAttribute('aria-label', labels.prev);
    }
    if (el.next) {
      el.next.title = labels.next;
      el.next.setAttribute('aria-label', labels.next);
    }
  }

  function syncViewChrome() {
    if (el.gridWrap) el.gridWrap.setAttribute('data-view', view);
    if (el.weekdays) {
      // Vecka/dag använder eget tidshuvud; månad behåller veckodagsraden
      const showWeekdays = view === 'month';
      el.weekdays.hidden = !showWeekdays;
      el.weekdays.style.display = showWeekdays ? '' : 'none';
    }
    if (el.side) {
      const label = eventMode === 'open' ? 'Kan göras nu' : 'Efter deadline';
      el.side.setAttribute('aria-label', `Att planera · ${label}`);
    }
    if (el.sideLabel) {
      el.sideLabel.textContent = eventMode === 'open' ? 'Kan göras nu' : 'Efter deadline';
    }
    syncNavLabels();
  }

  function syncFilterBadge() {
    const n = KV.filterBadgeCount({ activeType, showOpen, showDone });
    if (!el.filterBadge) return;
    if (n > 0) {
      el.filterBadge.hidden = false;
      el.filterBadge.textContent = String(n);
    } else {
      el.filterBadge.hidden = true;
      el.filterBadge.textContent = '0';
    }
  }

  function setFilterMenuOpen(open) {
    if (!el.filterMenu || !el.filterBtn) return;
    el.filterMenu.hidden = !open;
    el.filterBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    el.filterBtn.classList.toggle('is-open', open);
  }

  function render() {
    if (el.month) el.month.textContent = KV.periodTitle(view, focus);
    syncViewChrome();
    events = buildEvents();
    byKey = new Map(events.map((e) => [e.key, e]));
    const list = filtered();
    const dayMap = byDay(list);
    if (view === 'week') renderWeek(dayMap);
    else if (view === 'day') renderDay(list);
    else renderMonth(dayMap);
    renderSide(list);
  }

  function setView(next) {
    const v = KV.normalizeView(next);
    if (v === view) return;
    const keep = KV.parseIso(KV.dateIso(focus)) || KV.startOfDay(new Date());
    view = v;
    KV.saveStoredView(view);
    focus = keep;
    syncUi();
    renderWithGooglePull();
  }

  function setEventMode(next) {
    const m = KV.normalizeEventMode(next);
    if (m === eventMode) return;
    eventMode = m;
    KV.saveStoredEventMode(eventMode);
    sideGroupVisible = {};
    syncUi();
    render();
  }

  function syncUi() {
    if (el.mine) el.mine.classList.toggle('is-active', scope === 'mine');
    if (el.byra) el.byra.classList.toggle('is-active', scope === 'byra');
    el.typeTabs.forEach((tab) => {
      tab.classList.toggle('is-active', tab.getAttribute('data-kal-typ') === activeType);
    });
    if (el.statusOpen) el.statusOpen.classList.toggle('is-active', showOpen);
    if (el.statusDone) el.statusDone.classList.toggle('is-active', showDone);
    if (el.modeDeadline) el.modeDeadline.classList.toggle('is-active', eventMode === 'deadline');
    if (el.modeOpen) el.modeOpen.classList.toggle('is-active', eventMode === 'open');
    el.viewTabs.forEach((tab) => {
      const on = tab.getAttribute('data-kal-view') === view;
      tab.classList.toggle('is-active', on);
      tab.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    syncFilterBadge();
  }

  function gcalPullEnabled() {
    const st = gcalStatus || {};
    // Auto-hämta när Gmail redan är kopplad med kalenderbehörighet (ingen UI-knapp).
    // syncEnabled styr fortfarande push av tidblock server-side; för pull räcker koppling.
    return !!(st.connected && st.hasCalendarScope && !st.needsReconnect);
  }

  async function pullGoogleEvents(opts = {}) {
    const quiet = !!opts.quiet;
    if (!gcalPullEnabled()) {
      googleEvents = [];
      return { skipped: true, events: [] };
    }
    const seq = ++gcalPullSeq;
    const range = KV.visibleRange(view, focus);
    try {
      const qs = new URLSearchParams({
        timeMin: range.start,
        timeMax: range.end
      });
      const res = await fetch(`${baseUrl}/api/google-calendar/events?${qs}`, authOpts());
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.needsReconnect) {
          gcalStatus = { ...gcalStatus, needsReconnect: true, hasCalendarScope: false };
        }
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      if (seq !== gcalPullSeq) return data;
      googleEvents = Array.isArray(data.events) ? data.events : [];
      return data;
    } catch (err) {
      console.warn('Kalender Google-pull:', err.message);
      if (!quiet) showSaveToast(err.message || 'Kunde inte hämta Google-händelser', true);
      return { error: err.message, events: [] };
    }
  }

  async function pullMeetingInvites(opts = {}) {
    const quiet = !!opts.quiet;
    const seq = ++meetingPullSeq;
    const user = window.AuthManager && AuthManager.getCurrentUser ? AuthManager.getCurrentUser() : null;
    const byraId = String(user?.byraId || '').trim();
    if (!byraId || !ME) {
      meetingEvents = [];
      return { skipped: true, events: [] };
    }
    const range = KV.visibleRange(view, focus);
    try {
      const qs = new URLSearchParams({ byraId });
      const res = await fetch(`${baseUrl}/api/motesbokning/invites?${qs}`, authOpts());
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      if (seq !== meetingPullSeq) return data;
      let invites = Array.isArray(data.invites) ? data.invites : [];
      if (scope === 'mine' && user?.email) {
        const meEmail = String(user.email || '').trim().toLowerCase();
        invites = invites.filter((inv) => String(inv.createdBy || '').trim().toLowerCase() === meEmail);
      }
      meetingEvents = ME.buildMeetingEventsFromInvites(invites, range);
      return { events: meetingEvents, invites: invites.length };
    } catch (err) {
      console.warn('Kalender mötesinbjudningar:', err.message);
      if (!quiet) { /* kompletterande */ }
      return { error: err.message, events: [] };
    }
  }

  async function renderWithGooglePull(opts = {}) {
    render();
    const quiet = opts.quiet !== false;
    const tasks = [pullMeetingInvites({ quiet: true })];
    if (gcalPullEnabled()) tasks.push(pullGoogleEvents({ quiet }));
    await Promise.all(tasks.map((p) => p.catch(() => null)));
    render();
  }

  async function loadGcalStatus() {
    if (!(window.AuthManager && AuthManager.getCurrentUser && AuthManager.getCurrentUser())) return;
    try {
      const res = await fetch(`${baseUrl}/api/google-calendar/status`, authOpts());
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      gcalStatus = data;
    } catch (err) {
      console.warn('Kalender Google-status:', err.message);
      gcalStatus = { configured: false, connected: false, syncEnabled: false };
    }
    const tasks = [pullMeetingInvites({ quiet: true })];
    if (gcalPullEnabled()) tasks.push(pullGoogleEvents({ quiet: true }));
    else googleEvents = [];
    Promise.all(tasks.map((p) => p.catch(() => null))).then(() => render());
  }

  async function load() {
    if (!(window.AuthManager && AuthManager.getCurrentUser && AuthManager.getCurrentUser())) {
      show(el.loading, false);
      show(el.content, false);
      show(el.noAuth, true);
      return;
    }
    show(el.noAuth, false);
    show(el.loading, true);
    show(el.content, false);
    try {
      const mine = scope === 'mine' ? '1' : '0';
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 25000);
      const res = await fetch(`${baseUrl}/api/uppdrag/byra?mine=${mine}`, {
        ...authOpts(),
        signal: ctrl.signal
      }).finally(() => clearTimeout(timer));
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      records = Array.isArray(data.records) ? data.records : [];
      runRecords = Array.isArray(data.runs) ? data.runs : [];
      render();
      show(el.loading, false);
      show(el.content, true);
      const overlayTasks = [pullMeetingInvites({ quiet: true })];
      if (gcalPullEnabled()) overlayTasks.push(pullGoogleEvents({ quiet: true }));
      Promise.all(overlayTasks.map((p) => p.catch(() => null))).then(() => render());
    } catch (err) {
      console.error('Kalender:', err);
      if (el.loading) {
        el.loading.innerHTML = `<p class="statistik-section-desc" style="color:#b91c1c;">Kunde inte ladda kalender: ${esc(err.message || 'fel')}</p>`;
      }
      show(el.loading, true);
      show(el.content, false);
    }
  }

  if (el.prev) el.prev.addEventListener('click', () => {
    focus = KV.shiftFocus(view, focus, -1);
    renderWithGooglePull();
  });
  if (el.next) el.next.addEventListener('click', () => {
    focus = KV.shiftFocus(view, focus, 1);
    renderWithGooglePull();
  });
  if (el.today) el.today.addEventListener('click', () => {
    focus = KV.goToday(view, new Date());
    renderWithGooglePull();
  });
  el.viewTabs.forEach((tab) => {
    tab.addEventListener('click', () => setView(tab.getAttribute('data-kal-view')));
  });
  if (el.mine) el.mine.addEventListener('click', () => {
    if (scope === 'mine') return;
    scope = 'mine';
    syncUi();
    load();
  });
  if (el.byra) el.byra.addEventListener('click', () => {
    if (scope === 'byra') return;
    scope = 'byra';
    syncUi();
    load();
  });
  el.typeTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      activeType = tab.getAttribute('data-kal-typ') || 'Alla';
      syncUi();
      render();
    });
  });
  if (el.statusOpen) el.statusOpen.addEventListener('click', () => {
    showOpen = !showOpen;
    syncUi();
    render();
  });
  if (el.statusDone) el.statusDone.addEventListener('click', () => {
    showDone = !showDone;
    syncUi();
    render();
  });
  if (el.modeDeadline) el.modeDeadline.addEventListener('click', () => setEventMode('deadline'));
  if (el.modeOpen) el.modeOpen.addEventListener('click', () => setEventMode('open'));
  if (el.filterBtn) {
    el.filterBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = el.filterMenu && el.filterMenu.hidden;
      setFilterMenuOpen(!!open);
    });
  }
  document.addEventListener('click', (e) => {
    if (el.filterMenu && !el.filterMenu.hidden) {
      const wrap = el.filterBtn && el.filterBtn.closest('.kalender-filter-wrap');
      if (wrap && !wrap.contains(e.target)) setFilterMenuOpen(false);
    }
    if (deadlinesPopover && !deadlinesPopover.contains(e.target)
      && !(e.target && e.target.closest && e.target.closest('.kalender-deadlines-chip'))) {
      closeDeadlinesPopover();
    }
  });
  if (el.search) {
    let t = null;
    el.search.addEventListener('input', () => {
      clearTimeout(t);
      t = setTimeout(() => {
        q = String(el.search.value || '').trim();
        render();
      }, 150);
    });
  }
  if (el.detail) {
    el.detail.querySelectorAll('[data-kal-close]').forEach((n) => {
      n.addEventListener('click', closeDetail);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeDeadlinesPopover();
        setFilterMenuOpen(false);
        closeDetail();
      }
    });
  }

  syncUi();
  syncViewChrome();

  // AuthManager hydrerar via cookie asynkront – vänta in clientflow:authReady
  // innan auth-gaten, annars visas "Logga in…" trots att användaren är inloggad.
  function init() {
    const user = window.AuthManager && AuthManager.getCurrentUser && AuthManager.getCurrentUser();
    if (user) {
      loadGcalStatus();
      load();
      return;
    }
    show(el.loading, true);
    show(el.noAuth, false);
    show(el.content, false);
    let settled = false;
    const go = () => {
      if (settled) return;
      settled = true;
      loadGcalStatus();
      load();
    };
    window.addEventListener('clientflow:authReady', go, { once: true });
    setTimeout(() => {
      if (settled) return;
      if (window.AuthManager && AuthManager.getCurrentUser && AuthManager.getCurrentUser()) {
        go();
      } else {
        settled = true;
        show(el.loading, false);
        show(el.content, false);
        show(el.noAuth, true);
      }
    }, 4000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
