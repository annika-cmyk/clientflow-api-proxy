/**
 * Kalender – månadsvy över uppdragskörningar (deadline).
 * Data: GET /api/uppdrag/byra (samma som Uppdrag översikt).
 */
(function () {
  const gridEl = document.getElementById('kal-grid');
  if (!gridEl) return;

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
    detail: document.getElementById('kal-detail'),
    detailTitle: document.getElementById('kal-detail-title'),
    detailBody: document.getElementById('kal-detail-body'),
    statusOpen: document.getElementById('kal-status-open'),
    statusDone: document.getElementById('kal-status-done'),
    typeTabs: Array.from(document.querySelectorAll('[data-kal-typ]'))
  };

  const LONE = 'Löneuppdrag';
  const OVRIGA = 'Övriga';
  const MAX_CHIPS = 3;

  let scope = 'byra';
  let activeType = 'Alla';
  let showOpen = true;
  let showDone = false;
  let q = '';
  let cursor = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  let records = [];
  let runRecords = [];
  let events = [];
  let byKey = new Map();

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
  function ym(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
  function monthTitle(d) {
    return d.toLocaleDateString('sv-SE', { month: 'long', year: 'numeric' })
      .replace(/^\w/, (c) => c.toUpperCase());
  }
  function today() { return new Date().toISOString().slice(0, 10); }
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
    const KV = window.KoringVisibility;
    if (KV && KV.isOverdueNotDone({ Status: st, Deadline: deadline }, today())) return 'sen';
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

  function indexRuns(runs) {
    const map = new Map();
    (runs || []).forEach((rr) => {
      const id = String(rr?.fields?.['Uppdrag ID'] || '').trim();
      if (!id) return;
      const arr = map.get(id) || [];
      arr.push(rr);
      map.set(id, arr);
    });
    return map;
  }

  function addMonths(iso, n) {
    const s = toDate(iso);
    if (!s) return '';
    const [y, m, d] = s.split('-').map(Number);
    const base = new Date(y, m - 1 + n, 1);
    const last = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
    const day = Math.min(d, last);
    const out = new Date(base.getFullYear(), base.getMonth(), day);
    return `${out.getFullYear()}-${String(out.getMonth() + 1).padStart(2, '0')}-${String(out.getDate()).padStart(2, '0')}`;
  }

  function buildEvents() {
    const runsById = indexRuns(runRecords);
    const map = new Map();
    const y = cursor.getFullYear();
    const m = cursor.getMonth();
    const monthStart = `${y}-${String(m + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(y, m + 1, 0).getDate();
    const monthEnd = `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    const todayYm = ym(new Date());
    const horizonStart = new Date(y, m - 1, 1);
    const horizonEnd = new Date(y, m + 2, 1);

    const put = (rec, opts) => {
      const dl = toDate(opts.deadline);
      if (!dl) return;
      const pk = String(opts.periodKey || dl.slice(0, 7)).trim();
      const key = `${rec.id}:${pk}`;
      const status = String(opts.status || '').trim();
      const prev = map.get(key);
      if (!prev) {
        map.set(key, {
          key,
          record: rec,
          runRec: opts.runRec || null,
          typ: String(rec.fields?.['Typ'] || opts.typ || ''),
          deadline: dl,
          startDate: toDate(opts.startDate) || '',
          periodKey: pk,
          periodLabel: String(opts.periodLabel || '').trim(),
          status: status || 'Planerad',
          inMonth: dl >= monthStart && dl <= monthEnd
        });
        return;
      }
      if (!prev.runRec && opts.runRec) prev.runRec = opts.runRec;
      if (status === 'Klar') prev.status = 'Klar';
      else if ((!prev.status || prev.status === 'Planerad') && status) prev.status = status;
      if (!prev.periodLabel && opts.periodLabel) prev.periodLabel = String(opts.periodLabel);
      if (!prev.startDate && opts.startDate) prev.startDate = toDate(opts.startDate);
      prev.inMonth = prev.deadline >= monthStart && prev.deadline <= monthEnd;
    };

    (records || []).forEach((r) => {
      const f = r.fields || {};
      const typ = String(f['Typ'] || '');
      const freq = String(f['Frekvens'] || '');
      const refDl = toDate(f['Nästa deadline'] || '');
      const refSt = toDate(f['Startdatum'] || '');

      (runsById.get(String(r.id || '').trim()) || []).forEach((rr) => {
        const ff = rr.fields || {};
        if (typ && String(ff['Typ'] || '').trim() && String(ff['Typ'] || '').trim() !== typ) return;
        const pk = String(ff['PeriodKey'] || '').trim();
        let dl = toDate(ff['Deadline'] || '');
        if (typ === 'Momsredovisning' && window.MomsPeriod && pk) {
          dl = MomsPeriod.deadlineIsoFromPeriodKey(pk, freq) || dl;
        }
        if (!dl && !pk) return;
        let st = toDate(ff['Startdatum'] || '');
        if (typ === 'Momsredovisning' && window.MomsPeriod && pk) {
          st = MomsPeriod.startIsoFromPeriodKey(pk, freq) || st;
        }
        if (isLone(typ) && window.LonePeriod && pk && !st) {
          st = LonePeriod.startIsoFromPeriodKey(pk, typ, refSt || dl) || '';
        }
        const label = String(ff['Period Label'] || '').trim()
          || (typ === 'Momsredovisning' && window.MomsPeriod && pk ? MomsPeriod.displayLabel(pk, freq) : '')
          || (isLone(typ) && window.LonePeriod && pk ? LonePeriod.displayLabel(pk, typ) : '');
        put(r, {
          typ, periodKey: pk || (dl ? dl.slice(0, 7) : ''), deadline: dl,
          startDate: st, periodLabel: label, status: String(ff['Status'] || '').trim(), runRec: rr
        });
      });

      const hist = safeJson(String(f['Historik'] || '').trim(), []);
      if (Array.isArray(hist)) {
        hist.forEach((h) => {
          const pk = String(h?.periodKey || '').trim();
          if (!pk) return;
          let dl = toDate(h?.deadline);
          if (!dl && typ === 'Momsredovisning' && window.MomsPeriod) {
            dl = MomsPeriod.deadlineIsoFromPeriodKey(pk, freq) || '';
          }
          if (!dl && isLone(typ) && window.LonePeriod) {
            dl = LonePeriod.deadlineIsoFromPeriodKey(pk, typ, refDl) || '';
          }
          if (!dl && /^\d{4}-\d{2}$/.test(pk)) dl = `${pk}-15`;
          if (!dl && /^\d{4}-\d{2}-\d{2}$/.test(pk)) dl = pk;
          put(r, { typ, periodKey: pk, deadline: dl, status: String(h?.status || '').trim() });
        });
      }

      if (isLone(typ) && window.LonePeriod && refDl) {
        LonePeriod.runsThroughHorizon(refSt || refDl, refDl, typ, todayYm).forEach((run) => {
          put(r, {
            typ, periodKey: run.periodKey, deadline: run.deadlineIso,
            startDate: run.startIso, periodLabel: run.periodLabel
          });
        });
        return;
      }

      if (typ === 'Momsredovisning' && window.MomsPeriod
        && (MomsPeriod.isMonthlyFreq(freq) || MomsPeriod.isQuarterlyFreq(freq))) {
        const first = MomsPeriod.inferFirstPeriod(f, freq);
        if (first) {
          MomsPeriod.runsThroughHorizon(first, freq, todayYm).forEach((run) => {
            put(r, {
              typ, periodKey: run.periodKey, deadline: run.deadlineIso,
              startDate: run.startIso, periodLabel: run.periodLabel
            });
          });
          return;
        }
      }

      if (!refDl) return;
      const fl = freq.toLowerCase();
      let step = 1;
      if (fl.includes('kvartal')) step = 3;
      else if (fl.includes('årsvis') || (fl.includes('år') && !fl.includes('månad'))) step = 12;
      else if (fl.includes('veck') || fl.includes('engång')) step = 0;

      if (step === 0) {
        put(r, { typ, periodKey: refDl.slice(0, 7), deadline: refDl, startDate: refSt });
        return;
      }

      let d = refDl;
      for (let i = 0; i < 36; i++) {
        if (!d) break;
        const dm = new Date(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, 1);
        if (dm > horizonEnd) break;
        if (dm >= horizonStart) {
          put(r, { typ, periodKey: d.slice(0, 7), deadline: d, startDate: refSt });
        }
        d = addMonths(d, step);
      }
      d = refDl;
      for (let i = 0; i < 24; i++) {
        d = addMonths(d, -step);
        if (!d) break;
        const dm = new Date(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, 1);
        if (dm < horizonStart) break;
        put(r, { typ, periodKey: d.slice(0, 7), deadline: d, startDate: refSt });
      }
    });

    return Array.from(map.values());
  }

  function searchMatch(rec) {
    if (!q) return true;
    const f = rec.fields || {};
    const hay = [f['Kundnamn'], f['Namn'], f['Ansvarig'], f['Klientansvarig'], f['Typ'], f['Frekvens']]
      .filter(Boolean).join(' ').toLowerCase();
    return hay.includes(q.toLowerCase());
  }

  function filtered() {
    return events.filter((ev) => {
      if (!ev.inMonth) return false;
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
      const d = String(a.deadline).localeCompare(String(b.deadline));
      if (d) return d;
      const an = String(a.record?.fields?.['Kundnamn'] || '').toLowerCase();
      const bn = String(b.record?.fields?.['Kundnamn'] || '').toLowerCase();
      return an.localeCompare(bn, 'sv');
    });
  }

  function byDay(list) {
    const map = new Map();
    list.forEach((ev) => {
      const dl = toDate(ev.deadline);
      if (!dl) return;
      const arr = map.get(dl) || [];
      arr.push(ev);
      map.set(dl, arr);
    });
    return map;
  }

  function cellsFor(cursorDate) {
    const y = cursorDate.getFullYear();
    const m = cursorDate.getMonth();
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

  function chip(ev) {
    const f = ev.record?.fields || {};
    const name = String(f['Kundnamn'] || f['Namn'] || 'Klient');
    const st = statusOf(ev);
    const cls = statusClass(st, ev.deadline);
    const title = `${name} · ${displayName(ev.typ, f)} · ${statusLabel(st, ev.deadline)}`;
    return `<button type="button" class="kalender-chip kalender-chip--${cls}" data-key="${esc(ev.key)}" title="${esc(title)}">
      <span class="kalender-chip-typ">${esc(typShort(ev.typ))}</span>
      <span class="kalender-chip-name">${esc(name)}</span>
    </button>`;
  }

  function renderGrid(dayMap) {
    const t = today();
    gridEl.innerHTML = cellsFor(cursor).map((iso) => {
      if (!iso) return '<div class="kalender-cell kalender-cell--empty" aria-hidden="true"></div>';
      const day = Number(iso.slice(8, 10));
      const list = dayMap.get(iso) || [];
      const shown = list.slice(0, MAX_CHIPS);
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

    gridEl.querySelectorAll('[data-key]').forEach((btn) => {
      btn.addEventListener('click', (e) => { e.preventDefault(); openDetail(btn.getAttribute('data-key')); });
    });
    gridEl.querySelectorAll('.kalender-more').forEach((btn) => {
      btn.addEventListener('click', () => {
        const list = dayMap.get(btn.getAttribute('data-date')) || [];
        if (list[0]) openDetail(list[0].key, list);
      });
    });
  }

  function fmtDate(iso) {
    const s = toDate(iso);
    if (!s) return '';
    return new Date(`${s}T00:00:00`).toLocaleDateString('sv-SE', {
      weekday: 'short', day: 'numeric', month: 'short'
    });
  }

  function renderSide(list) {
    if (!el.sideList) return;
    if (el.sideCount) el.sideCount.textContent = list.length ? `(${list.length})` : '';
    if (!list.length) {
      el.sideList.innerHTML = '<p class="kalender-side-empty">Inga deadlines denna månad med aktuella filter.</p>';
      return;
    }
    let last = '';
    el.sideList.innerHTML = list.map((ev) => {
      const f = ev.record?.fields || {};
      const name = String(f['Kundnamn'] || f['Namn'] || 'Klient');
      const st = statusOf(ev);
      const cls = statusClass(st, ev.deadline);
      const dl = toDate(ev.deadline);
      const head = dl !== last ? `<div class="kalender-side-date">${esc(fmtDate(dl))}</div>` : '';
      last = dl;
      const period = ev.periodLabel || ev.periodKey || '';
      return `${head}
        <button type="button" class="kalender-side-item kalender-side-item--${cls}" data-key="${esc(ev.key)}">
          <span class="kalender-side-main">
            <span class="kalender-side-name">${esc(name)}</span>
            <span class="kalender-side-meta">${esc(displayName(ev.typ, f))}${period ? ` · ${esc(period)}` : ''}</span>
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
    const f = ev.record?.fields || {};
    const kundId = String(f['Kund ID'] || '').trim();
    const name = String(f['Kundnamn'] || f['Namn'] || 'Klient');
    const st = statusOf(ev);
    const cls = statusClass(st, ev.deadline);
    const ansvarig = String(f['Ansvarig'] || f['Klientansvarig'] || '').trim();
    const period = ev.periodLabel || ev.periodKey || '—';
    const siblings = Array.isArray(group) && group.length > 1 ? group : null;

    if (el.detailTitle) el.detailTitle.textContent = name;
    el.detailBody.innerHTML = `
      <div class="kalender-detail-status kalender-detail-status--${cls}">${esc(statusLabel(st, ev.deadline))}</div>
      <dl class="kalender-detail-dl">
        <div><dt>Uppdrag</dt><dd>${esc(displayName(ev.typ, f))}</dd></div>
        <div><dt>Period</dt><dd>${esc(period)}</dd></div>
        <div><dt>Öppet från</dt><dd>${esc(toDate(ev.startDate) || '—')}</dd></div>
        <div><dt>Deadline</dt><dd>${esc(toDate(ev.deadline) || '—')}</dd></div>
        ${ansvarig ? `<div><dt>Ansvarig</dt><dd>${esc(ansvarig)}</dd></div>` : ''}
      </dl>
      <div class="kalender-detail-actions">
        ${kundId ? `<a class="btn btn-primary btn-sm" href="kundkort.html?id=${encodeURIComponent(kundId)}"><i class="fas fa-user"></i> Öppna kundkort</a>` : ''}
        ${kundId ? `<a class="btn btn-ghost btn-sm" href="tid.html?new=1&customerId=${encodeURIComponent(kundId)}&customerName=${encodeURIComponent(name)}&uppdrag=${encodeURIComponent(displayName(ev.typ, f))}"><i class="fas fa-clock"></i> Registrera tid</a>` : ''}
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
  }

  function closeDetail() {
    if (!el.detail) return;
    el.detail.hidden = true;
    document.body.classList.remove('kalender-detail-open');
  }

  function render() {
    if (el.month) el.month.textContent = monthTitle(cursor);
    events = buildEvents();
    byKey = new Map(events.map((e) => [e.key, e]));
    const list = filtered();
    const dayMap = byDay(list);
    renderGrid(dayMap);
    renderSide(list);
  }

  function syncUi() {
    if (el.mine) el.mine.classList.toggle('is-active', scope === 'mine');
    if (el.byra) el.byra.classList.toggle('is-active', scope === 'byra');
    el.typeTabs.forEach((tab) => {
      tab.classList.toggle('is-active', tab.getAttribute('data-kal-typ') === activeType);
    });
    if (el.statusOpen) el.statusOpen.classList.toggle('is-active', showOpen);
    if (el.statusDone) el.statusDone.classList.toggle('is-active', showDone);
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
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1);
    render();
  });
  if (el.next) el.next.addEventListener('click', () => {
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    render();
  });
  if (el.today) el.today.addEventListener('click', () => {
    cursor = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    render();
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

  // AuthManager hydrerar via cookie asynkront – vänta in clientflow:authReady
  // innan auth-gaten, annars visas "Logga in…" trots att användaren är inloggad.
  function init() {
    const user = window.AuthManager && AuthManager.getCurrentUser && AuthManager.getCurrentUser();
    if (user) {
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
