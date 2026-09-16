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
    return cf.concat(Array.isArray(googleEvents) ? googleEvents : []);
  }

  function isGoogleEvent(ev) {
    return !!(ev && (ev.source === 'google' || String(ev.key || '').startsWith('gcal:')));
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
      if (isGoogleEvent(ev)) {
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

  /** Uppdatera avsatt tid i öppen detaljpanel medan man drar/ändrar längd. */
  function previewDetailSchedule(key, startMin, endMin) {
    if (!openDetailKey || String(openDetailKey) !== String(key || '')) return;
    if (!el.detail || el.detail.hidden || !el.detailBody) return;
    const hours = hoursLabel(startMin, endMin);
    const label = `${KV.fmtTimeLabel(startMin)}–${KV.fmtTimeLabel(endMin)} (${hours} t)`;
    const dd = el.detailBody.querySelector('[data-avsatt-tid]');
    if (dd) dd.textContent = label;
    const klarBtn = el.detailBody.querySelector('[data-klar-tid]');
    if (klarBtn) {
      klarBtn.disabled = !(hours > 0);
      klarBtn.innerHTML = `<i class="fas fa-check"></i> Klarmarkera & registrera tid (${hours} t)`;
    }
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

  async function klarAndRegisterTid(ev) {
    const f = ev.record?.fields || {};
    const runF = ev.runRec?.fields || {};
    const runId = String(ev.runRec?.id || '').trim();
    const kundId = String(f['Kund ID'] || runF['Kund ID'] || '').trim();
    const name = String(f['Kundnamn'] || f['Namn'] || 'Klient');
    const uppdragId = String(ev.record?.id || runF['Uppdrag ID'] || '').trim();
    const sched = scheduleOf(ev);
    if (!sched || !(sched.hours > 0)) {
      showSaveToast('Avsätt tid i kalendern först (dra i nederkant).', true);
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

    let tidBody;
    try {
      const helper = window.KalenderKlarTid;
      const build = helper && helper.buildKalenderTidPayload
        ? helper.buildKalenderTidPayload
        : null;
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
      if (build) {
        tidBody = build(args);
      } else {
        tidBody = {
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
    } catch (err) {
      showSaveToast((err && err.message) || 'Kunde inte bygga tidpost', true);
      return;
    }

    const btn = el.detailBody && el.detailBody.querySelector('[data-klar-tid]');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sparar…';
    }

    try {
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
      if (!stRes.ok) throw new Error(stData.error || 'Tid sparad, men klarmarkering misslyckades');

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
      showSaveToast(`Klarmarkerad · ${sched.hours} t registrerad`);
      closeDetail();
      render();
    } catch (err) {
      console.error('Kalender klar+tid:', err);
      showSaveToast((err && err.message) || 'Kunde inte spara', true);
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<i class="fas fa-check"></i> Klarmarkera & registrera tid (${sched.hours} t)`;
      }
    }
  }

  function refreshOpenDetail() {
    if (!openDetailKey || !el.detail || el.detail.hidden) return;
    if (!byKey.has(String(openDetailKey))) return;
    openDetail(openDetailKey);
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

  function applyScheduleLocal(ev, startIso, endIso) {
    ev.scheduledStart = startIso || '';
    ev.scheduledEnd = endIso || '';
    if (ev.runRec) {
      ev.runRec.fields = ev.runRec.fields || {};
      ev.runRec.fields['Planerad start'] = startIso || '';
      ev.runRec.fields['Planerad slut'] = endIso || '';
    }
    const rr = runRecords.find((r) => r.id === ev.runRec?.id);
    if (rr) {
      rr.fields = rr.fields || {};
      rr.fields['Planerad start'] = startIso || '';
      rr.fields['Planerad slut'] = endIso || '';
    }
  }

  async function persistSchedule(ev, startIso, endIso) {
    const runId = String(ev.runRec?.id || '').trim();
    if (!runId) {
      showSaveToast('Saknar uppdragskörning – tidblock kan inte sparas.', true);
      return false;
    }
    try {
      const res = await fetch(`${baseUrl}/api/uppdrag/runs/${encodeURIComponent(runId)}/schedule`, {
        method: 'PATCH',
        ...authOpts(),
        headers: {
          ...(authOpts().headers || {}),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ start: startIso, end: endIso })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      if (data.record) {
        ev.runRec = data.record;
        const idx = runRecords.findIndex((r) => r.id === data.record.id);
        if (idx >= 0) runRecords[idx] = data.record;
        else runRecords.push(data.record);
      }
      applyScheduleLocal(ev, startIso, endIso);
      showSaveToast('Tidblock sparat');
      return true;
    } catch (err) {
      console.error('Kalender schedule:', err);
      showSaveToast(err.message || 'Kunde inte spara tidblock', true);
      return false;
    }
  }

  function chip(ev) {
    if (isGoogleEvent(ev)) {
      const name = String(ev.summary || ev.record?.fields?.Kundnamn || 'Google');
      const sched = scheduleOf(ev);
      const timeBit = sched ? `${KV.fmtTimeLabel(sched.startMin)}–${KV.fmtTimeLabel(sched.endMin)} · ` : (ev.allDay ? 'Heldag · ' : '');
      const title = `${timeBit}${name} · Google`;
      return `<button type="button" class="kalender-chip kalender-chip--google" data-key="${esc(ev.key)}" title="${esc(title)}">
        <span class="kalender-chip-typ">GCal</span>
        <span class="kalender-chip-name">${esc(name)}</span>
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
    const canDrag = !!ev.runRec?.id;
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

  function bindMonthDrag(dayMap) {
    gridEl.querySelectorAll('.kalender-chip[draggable="true"]').forEach((btn) => {
      btn.addEventListener('dragstart', (e) => {
        const key = btn.getAttribute('data-key');
        e.dataTransfer.setData('text/plain', key);
        e.dataTransfer.effectAllowed = 'move';
        btn.classList.add('is-dragging');
        dragState = { key, mode: 'month-move' };
      });
      btn.addEventListener('dragend', () => {
        btn.classList.remove('is-dragging');
        dragState = null;
        gridEl.querySelectorAll('.kalender-cell.is-drop-target').forEach((c) => c.classList.remove('is-drop-target'));
      });
    });
    gridEl.querySelectorAll('.kalender-cell[data-date]').forEach((cell) => {
      cell.addEventListener('dragover', (e) => {
        if (!dragState || dragState.mode !== 'month-move') return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        cell.classList.add('is-drop-target');
      });
      cell.addEventListener('dragleave', () => cell.classList.remove('is-drop-target'));
      cell.addEventListener('drop', async (e) => {
        e.preventDefault();
        cell.classList.remove('is-drop-target');
        const key = e.dataTransfer.getData('text/plain') || dragState?.key;
        const ev = byKey.get(String(key || ''));
        const date = cell.getAttribute('data-date');
        if (!ev || !date) return;
        const existing = scheduleOf(ev);
        const startMin = existing ? existing.startMin : 9 * 60;
        const endMin = existing ? existing.endMin : startMin + KV.DEFAULT_BLOCK_MINUTES;
        const startIso = KV.toLocalDateTimeIso(date, startMin);
        const endIso = KV.toLocalDateTimeIso(date, Math.min(endMin, KV.dayEndMinutes()));
        const ok = await persistSchedule(ev, startIso, endIso);
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

  function timedBlockHtml(ev) {
    if (isGoogleEvent(ev)) {
      const name = String(ev.summary || ev.record?.fields?.Kundnamn || 'Google');
      const sched = scheduleOf(ev);
      if (!sched) return '';
      const layout = KV.blockLayout(sched.startMin, sched.endMin);
      return `<div class="kalender-block kalender-block--google" data-key="${esc(ev.key)}" data-timed="1"
        style="${KV.blockPositionStyleAttr(layout)}"
        title="${esc(`${KV.fmtTimeLabel(sched.startMin)}–${KV.fmtTimeLabel(sched.endMin)} · ${name} · Google`)}">
        <button type="button" class="kalender-block-main" data-key="${esc(ev.key)}">
          <span class="kalender-block-time">${esc(KV.fmtTimeLabel(sched.startMin))}–${esc(KV.fmtTimeLabel(sched.endMin))}</span>
          <span class="kalender-block-name">${esc(name)}</span>
          <span class="kalender-block-typ">GCal</span>
        </button>
      </div>`;
    }
    const f = ev.record?.fields || {};
    const name = String(f['Kundnamn'] || f['Namn'] || 'Klient');
    const st = statusOf(ev);
    const cls = statusClass(st, ev.deadline);
    const sched = scheduleOf(ev);
    if (!sched) return '';
    const layout = KV.blockLayout(sched.startMin, sched.endMin);
    const canDrag = !!ev.runRec?.id;
    return `<div class="kalender-block kalender-block--${cls}${canDrag ? ' is-draggable' : ''}"
      data-key="${esc(ev.key)}" data-timed="1"
      style="${KV.blockPositionStyleAttr(layout)}"
      title="${esc(`${KV.fmtTimeLabel(sched.startMin)}–${KV.fmtTimeLabel(sched.endMin)} · ${name}`)}">
      <button type="button" class="kalender-block-main" data-key="${esc(ev.key)}" ${canDrag ? 'draggable="true"' : ''}>
        <span class="kalender-block-time">${esc(KV.fmtTimeLabel(sched.startMin))}–${esc(KV.fmtTimeLabel(sched.endMin))}</span>
        <span class="kalender-block-name">${esc(name)}</span>
        <span class="kalender-block-typ">${esc(typShort(ev.typ))}</span>
      </button>
      ${canDrag ? '<span class="kalender-block-resize" data-resize="1" title="Ändra längd" aria-hidden="true"></span>' : ''}
    </div>`;
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

    gridEl.querySelectorAll('.kalender-block-main[draggable="true"]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        if (btn.dataset.suppressClick === '1') {
          btn.dataset.suppressClick = '';
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        e.preventDefault();
        openDetail(btn.getAttribute('data-key'));
      });
      btn.addEventListener('dragstart', (e) => {
        const key = btn.getAttribute('data-key');
        const ev = byKey.get(key);
        const sched = ev && scheduleOf(ev);
        e.dataTransfer.setData('text/plain', key);
        e.dataTransfer.effectAllowed = 'move';
        btn.closest('.kalender-block')?.classList.add('is-dragging');
        dragState = {
          key,
          mode: 'timed-move',
          duration: sched ? (sched.endMin - sched.startMin) : KV.DEFAULT_BLOCK_MINUTES
        };
      });
      btn.addEventListener('dragend', () => {
        btn.closest('.kalender-block')?.classList.remove('is-dragging');
        dragState = null;
        columns.forEach((c) => c.classList.remove('is-drop-target'));
      });
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
        columns.forEach((c) => c.classList.remove('is-drop-target'));
      });
    });

    columns.forEach((col) => {
      col.addEventListener('dragover', (e) => {
        if (!dragState || (dragState.mode !== 'timed-move' && dragState.mode !== 'untimed-to-grid')) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        col.classList.add('is-drop-target');
      });
      col.addEventListener('dragleave', () => col.classList.remove('is-drop-target'));
      col.addEventListener('drop', async (e) => {
        e.preventDefault();
        col.classList.remove('is-drop-target');
        const key = e.dataTransfer.getData('text/plain') || dragState?.key;
        const ev = byKey.get(String(key || ''));
        if (!ev) return;
        const { y, height, date } = pointerYInCol(e.clientY, col);
        if (!date) return;
        const startMin = KV.yToMinutes(y, height);
        const moved = KV.moveBlock(startMin, startMin + (dragState?.duration || KV.DEFAULT_BLOCK_MINUTES), startMin);
        const startIso = KV.toLocalDateTimeIso(date, moved.startMin);
        const endIso = KV.toLocalDateTimeIso(date, moved.endMin);
        const elBtn = gridEl.querySelector(`[data-key="${String(key).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`);
        if (elBtn) elBtn.dataset.suppressClick = '1';
        const ok = await persistSchedule(ev, startIso, endIso);
        if (ok) {
          render();
          refreshOpenDetail();
        }
      });
    });

    gridEl.querySelectorAll('.kalender-block-resize').forEach((handle) => {
      const block = handle.closest('.kalender-block');
      const key = block?.getAttribute('data-key');
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
          startMin: sched.startMin,
          date: col.getAttribute('data-date')
        };
        block.classList.add('is-resizing');
      });
      handle.addEventListener('pointermove', (e) => {
        if (!dragState || dragState.mode !== 'resize' || dragState.key !== key) return;
        const col = block?.closest('.kalender-time-col');
        if (!col) return;
        const { y, height } = pointerYInCol(e.clientY, col);
        const endMin = KV.yToMinutes(y, height) + KV.SNAP_MINUTES;
        const resized = KV.resizeBlock(dragState.startMin, endMin);
        const layout = KV.blockLayout(resized.startMin, resized.endMin);
        const pos = KV.blockPositionStyle(layout);
        block.style.top = pos.top;
        block.style.height = pos.height;
        const timeEl = block.querySelector('.kalender-block-time');
        if (timeEl) {
          timeEl.textContent = `${KV.fmtTimeLabel(resized.startMin)}–${KV.fmtTimeLabel(resized.endMin)}`;
        }
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
        if (endMin == null || !date) return;
        const ev = byKey.get(String(key || ''));
        if (!ev) {
          render();
          return;
        }
        const startIso = KV.toLocalDateTimeIso(date, startMin);
        const endIso = KV.toLocalDateTimeIso(date, endMin);
        await persistSchedule(ev, startIso, endIso);
        render();
        refreshOpenDetail();
      };
      handle.addEventListener('pointerup', finishResize);
      handle.addEventListener('pointercancel', finishResize);
    });
  }

  function renderTimedGrid(dayIsos, dayMap, ariaLabel) {
    const t = today();
    const hours = KV.hourLabels();
    const trackH = (KV.DAY_END_HOUR - KV.DAY_START_HOUR) * KV.PX_PER_HOUR;
    const colCount = dayIsos.length;

    const heads = dayIsos.map((iso) => {
      const list = dayMap.get(iso) || [];
      const day = Number(iso.slice(8, 10));
      const weekday = new Date(`${iso}T00:00:00`).toLocaleDateString('sv-SE', { weekday: 'short' });
      return `<div class="kalender-time-col-head${iso === t ? ' is-today' : ''}" data-date="${esc(iso)}">
        <span class="kalender-daynum"><span class="kalender-weekday-label">${esc(weekday)}</span> ${day}</span>
        ${list.length ? `<span class="kalender-cell-count">${list.length}</span>` : ''}
      </div>`;
    }).join('');

    const untimed = dayIsos.map((iso) => {
      const list = (dayMap.get(iso) || []).filter((ev) => !scheduleOf(ev));
      return `<div class="kalender-untimed${iso === t ? ' is-today' : ''}" data-date="${esc(iso)}">
        ${list.length ? list.map(untimedChipHtml).join('') : '<span class="kalender-untimed-hint">Utan tid · dra till rutnät</span>'}
      </div>`;
    }).join('');

    const tracks = dayIsos.map((iso) => {
      const timed = (dayMap.get(iso) || []).filter((ev) => scheduleOf(ev));
      return `<div class="kalender-time-col${iso === t ? ' is-today' : ''}" data-date="${esc(iso)}">
        <div class="kalender-time-track" style="height:${trackH}px">
          ${hours.map(() => `<div class="kalender-time-hour" style="height:${KV.PX_PER_HOUR}px"></div>`).join('')}
          ${timed.map(timedBlockHtml).join('')}
        </div>
      </div>`;
    }).join('');

    const gutter = hours.map((h) =>
      `<div class="kalender-time-gutter-label" style="height:${KV.PX_PER_HOUR}px">${esc(h)}</div>`
    ).join('');

    gridEl.className = `kalender-grid kalender-grid--timed kalender-grid--${colCount === 1 ? 'day' : 'week'}`;
    gridEl.setAttribute('aria-label', ariaLabel);
    gridEl.innerHTML = `
      <div class="kalender-timed-wrap" style="--kal-cols:${colCount}">
        <div class="kalender-timed-corner" aria-hidden="true"></div>
        <div class="kalender-timed-heads">${heads}</div>
        <div class="kalender-timed-allday-label" aria-hidden="true">Heldag</div>
        <div class="kalender-timed-allday">${untimed}</div>
        <div class="kalender-time-gutter">${gutter}</div>
        <div class="kalender-timed-cols">${tracks}</div>
      </div>`;

    bindGridClicks(dayMap);
    bindTimedInteractions();

    gridEl.querySelectorAll('.kalender-untimed[data-date]').forEach((strip) => {
      strip.addEventListener('dragover', (e) => {
        if (!dragState) return;
        e.preventDefault();
        strip.classList.add('is-drop-target');
      });
      strip.addEventListener('dragleave', () => strip.classList.remove('is-drop-target'));
      strip.addEventListener('drop', async (e) => {
        e.preventDefault();
        strip.classList.remove('is-drop-target');
        const key = e.dataTransfer.getData('text/plain') || dragState?.key;
        const ev = byKey.get(String(key || ''));
        const date = strip.getAttribute('data-date');
        if (!ev || !date) return;
        const startIso = KV.toLocalDateTimeIso(date, 9 * 60);
        const endIso = KV.toLocalDateTimeIso(date, 9 * 60 + KV.DEFAULT_BLOCK_MINUTES);
        const ok = await persistSchedule(ev, startIso, endIso);
        if (ok) {
          render();
          refreshOpenDetail();
        }
      });
    });
  }

  function renderWeek(dayMap) {
    renderTimedGrid(KV.weekDays(focus), dayMap, 'Veckokalender med tider');
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

  /** Sidopanel (Deadlines/Öppna): bara ClientFlow-körningar — inte Google-händelser. */
  function sidePanelEvents(list) {
    return (list || []).filter((ev) => !isGoogleEvent(ev));
  }

  function renderSide(list) {
    if (!el.sideList) return;
    const items = sidePanelEvents(list);
    if (el.sideLabel) el.sideLabel.textContent = eventMode === 'open' ? 'Öppna' : 'Deadlines';
    if (el.sideCount) el.sideCount.textContent = items.length ? `(${items.length})` : '';
    const emptyWhen = KV.rangeEmptyLabel(view);
    const emptyNoun = eventMode === 'open' ? 'öppna körningar' : 'deadlines';
    if (!items.length) {
      el.sideList.innerHTML = `<p class="kalender-side-empty">Inga ${esc(emptyNoun)} ${esc(emptyWhen)} med aktuella filter.</p>`;
      return;
    }
    let last = '';
    el.sideList.innerHTML = items.map((ev) => {
      const f = ev.record?.fields || {};
      const name = String(f['Kundnamn'] || f['Namn'] || 'Klient');
      const st = statusOf(ev);
      const cls = statusClass(st, ev.deadline);
      const place = placeDateOf(ev);
      const head = place !== last ? `<div class="kalender-side-date">${esc(fmtDate(place))}</div>` : '';
      last = place;
      const period = ev.periodLabel || ev.periodKey || '';
      const sched = scheduleOf(ev);
      const timeMeta = sched ? `${KV.fmtTimeLabel(sched.startMin)}–${KV.fmtTimeLabel(sched.endMin)} · ` : '';
      return `${head}
        <button type="button" class="kalender-side-item kalender-side-item--${cls}" data-key="${esc(ev.key)}">
          <span class="kalender-side-main">
            <span class="kalender-side-name">${esc(name)}</span>
            <span class="kalender-side-meta">${esc(timeMeta)}${esc(displayName(ev.typ, f))}${period ? ` · ${esc(period)}` : ''}</span>
          </span>
          <span class="kalender-side-status">${esc(statusLabel(st, ev.deadline))}</span>
        </button>`;
    }).join('');
    el.sideList.querySelectorAll('[data-key]').forEach((btn) => {
      btn.addEventListener('click', () => openDetail(btn.getAttribute('data-key')));
    });
  }

  function openDetail(key, group) {
    const ev = byKey.get(String(key || '')) || (group || []).find((x) => x.key === key);
    if (!ev || !el.detail) return;
    openDetailKey = String(ev.key || key || '');

    if (isGoogleEvent(ev)) {
      const name = String(ev.summary || 'Google-händelse');
      const sched = scheduleOf(ev);
      const blockLabel = sched
        ? `${KV.fmtTimeLabel(sched.startMin)}–${KV.fmtTimeLabel(sched.endMin)}`
        : (ev.allDay ? 'Heldag' : '—');
      const siblings = Array.isArray(group) && group.length > 1 ? group : null;
      if (el.detailTitle) el.detailTitle.textContent = name;
      el.detailBody.innerHTML = `
        <div class="kalender-detail-status kalender-detail-status--google">Google-kalender</div>
        <dl class="kalender-detail-dl">
          <div><dt>Titel</dt><dd>${esc(name)}</dd></div>
          <div><dt>Datum</dt><dd>${esc(toDate(ev.deadline) || '—')}</dd></div>
          <div><dt>Tid</dt><dd>${esc(blockLabel)}</dd></div>
          ${ev.location ? `<div><dt>Plats</dt><dd>${esc(ev.location)}</dd></div>` : ''}
          ${ev.description ? `<div><dt>Beskrivning</dt><dd class="kalender-detail-desc">${esc(ev.description).slice(0, 800)}</dd></div>` : ''}
        </dl>
        <div class="kalender-detail-actions">
          ${ev.htmlLink ? `<a class="btn btn-ghost btn-sm" href="${esc(ev.htmlLink)}" target="_blank" rel="noopener noreferrer"><i class="fab fa-google"></i> Öppna i Google</a>` : ''}
        </div>
        ${siblings ? `<div class="kalender-detail-siblings"><h4>Fler samma dag</h4>
          ${siblings.map((s) => {
            const label = isGoogleEvent(s) ? (s.summary || 'Google') : String(s.record?.fields?.Kundnamn || s.key);
            return `<button type="button" class="kalender-side-item" data-key="${esc(s.key)}"><span class="kalender-side-name">${esc(label)}</span></button>`;
          }).join('')}
        </div>` : ''}`;
      el.detail.hidden = false;
      document.body.classList.add('kalender-detail-open');
      el.detailBody.querySelectorAll('[data-key]').forEach((btn) => {
        btn.addEventListener('click', () => openDetail(btn.getAttribute('data-key')));
      });
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
    const sched = scheduleOf(ev);
    const isKlar = cls === 'klar';
    const canKlarTid = !isKlar && !!ev.runRec?.id && !!kundId;
    const blockLabel = sched
      ? `${KV.fmtTimeLabel(sched.startMin)}–${KV.fmtTimeLabel(sched.endMin)} (${sched.hours} t)`
      : 'Ej avsatt — dra i vecko-/dagsvy';

    if (el.detailTitle) {
      if (kundId) {
        el.detailTitle.innerHTML = `<a class="kalender-detail-customer-link" href="kundkort.html?id=${encodeURIComponent(kundId)}" title="Öppna kundkort">${esc(name)}</a>`;
      } else {
        el.detailTitle.textContent = name;
      }
    }
    el.detailBody.innerHTML = `
      <div class="kalender-detail-status kalender-detail-status--${cls}">${esc(statusLabel(st, ev.deadline))}</div>
      <dl class="kalender-detail-dl">
        <div><dt>Uppdrag</dt><dd>${esc(displayName(ev.typ, f))}</dd></div>
        <div><dt>Period</dt><dd>${esc(period)}</dd></div>
        <div><dt>Öppet från</dt><dd>${esc(toDate(ev.startDate) || '—')}</dd></div>
        <div><dt>Deadline</dt><dd>${esc(toDate(ev.deadline) || '—')}</dd></div>
        <div><dt>Avsatt tid</dt><dd data-avsatt-tid>${esc(blockLabel)}</dd></div>
        ${ansvarig ? `<div><dt>Ansvarig</dt><dd>${esc(ansvarig)}</dd></div>` : ''}
      </dl>
      <div class="kalender-detail-actions">
        ${canKlarTid ? `<button type="button" class="btn btn-primary btn-sm" data-klar-tid ${sched && sched.hours > 0 ? '' : 'disabled'}>
          <i class="fas fa-check"></i> Klarmarkera & registrera tid${sched && sched.hours > 0 ? ` (${esc(String(sched.hours))} t)` : ''}
        </button>` : ''}
        ${isKlar ? `<span class="kalender-detail-done-hint"><i class="fas fa-check-circle"></i> Klarmarkerad</span>` : ''}
        <a class="btn btn-ghost btn-sm" href="uppdrag-oversikt.html"><i class="fas fa-briefcase"></i> Uppdragstavla</a>
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
    const klarBtn = el.detailBody.querySelector('[data-klar-tid]');
    if (klarBtn) {
      klarBtn.addEventListener('click', () => {
        klarAndRegisterTid(ev);
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
      const label = eventMode === 'open' ? 'Öppna' : 'Deadlines';
      el.side.setAttribute('aria-label', `${label} ${KV.rangeEmptyLabel(view)}`);
    }
    if (el.sideLabel) el.sideLabel.textContent = eventMode === 'open' ? 'Öppna' : 'Deadlines';
    syncNavLabels();
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

  async function renderWithGooglePull(opts = {}) {
    render();
    if (!gcalPullEnabled()) return;
    const data = await pullGoogleEvents({ quiet: opts.quiet !== false });
    if (data && !data.error) render();
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
    if (gcalPullEnabled()) {
      pullGoogleEvents({ quiet: true }).then(() => render());
    } else {
      googleEvents = [];
    }
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
      if (gcalPullEnabled()) {
        pullGoogleEvents({ quiet: true }).then(() => render());
      }
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
      if (e.key === 'Escape') closeDetail();
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
