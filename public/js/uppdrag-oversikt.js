/**
 * Uppdrag (översikt/board) – enkel tabell per uppdragstyp och månad.
 * Inspirerad av "board"-layouten användaren skickade.
 */
(function () {
  const tbodyEl = document.getElementById('uppdragboard-tbody');
  if (!tbodyEl) return;

  const baseUrl = (window.apiConfig && window.apiConfig.baseUrl) || 'http://localhost:3001';
  const getAuthOpts = () => (window.AuthManager && AuthManager.getAuthFetchOptions && AuthManager.getAuthFetchOptions()) || {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' }
  };

  const els = {
    loading: document.getElementById('uppdrag-loading'),
    noAuth: document.getElementById('uppdrag-no-auth'),
    content: document.getElementById('uppdrag-content'),
    mineBtn: document.getElementById('uppdrag-scope-mine'),
    byraBtn: document.getElementById('uppdrag-scope-byra'),
    search: document.getElementById('uppdrag-search'),
    title: document.getElementById('uppdragboard-title'),
    month: document.getElementById('uppdragboard-month'),
    prev: document.getElementById('uppdragboard-prev'),
    next: document.getElementById('uppdragboard-next'),
    typeTabs: Array.from(document.querySelectorAll('.uppdragboard-tab[data-typ]')),
    colRun: document.getElementById('uppdragboard-col-run'),
    createBtn: document.getElementById('uppdragboard-create'),
    viewDeadline: document.getElementById('uppdrag-view-deadline'),
    viewOpen: document.getElementById('uppdrag-view-open'),
    statusKlara: document.getElementById('uppdrag-status-klara'),
    statusEjKlara: document.getElementById('uppdrag-status-ej-klara')
  };

  const TYPES = ['Löneuppdrag', 'Momsredovisning', 'Bokslut', 'Deklaration'];
  const LONE_TAB = 'Löneuppdrag';

  function isLoneTyp(typ) {
    return !!(window.LonePeriod && LonePeriod.isLoneTyp(typ));
  }

  function typDisplayLabel(typ) {
    return (window.LonePeriod && LonePeriod.typDisplayLabel)
      ? LonePeriod.typDisplayLabel(typ)
      : String(typ || '');
  }

  function matchesActiveType(typ) {
    const t = String(typ || '').trim();
    if (activeType === LONE_TAB) return isLoneTyp(t);
    return t === activeType;
  }

  let scope = 'byra'; // 'byra' | 'mine'
  let allRecords = [];
  let q = '';
  let activeType = 'Löneuppdrag';
  let monthCursor = new Date(); // current month
  let viewMode = 'deadline'; // 'deadline' | 'open'
  let showKlara = false;
  let showEjKlara = true;
  let handlerFilter = '';
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const monthMin = new Date(monthStart.getFullYear(), monthStart.getMonth() - 12, 1);
  const monthMax = new Date(monthStart.getFullYear(), monthStart.getMonth() + 11, 1);

  function setVisible(el, show) { if (el) el.style.display = show ? '' : 'none'; }
  function esc(s) { return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  function toDateStr(iso) {
    const s = String(iso || '').slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
  }

  function monthKey(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }
  function monthLabel(d) { return d.toLocaleDateString('sv-SE', { month: 'long', year: 'numeric' }).replace(/^\w/, c => c.toUpperCase()); }
  function sameMonth(iso, d) {
    const s = toDateStr(iso);
    if (!s) return false;
    return s.slice(0, 7) === monthKey(d);
  }

  function sortByClient(a, b) {
    const an = String(a?.fields?.['Kundnamn'] || '').toLowerCase();
    const bn = String(b?.fields?.['Kundnamn'] || '').toLowerCase();
    return an.localeCompare(bn, 'sv');
  }

  function safeJson(raw, fallback) {
    try {
      const v = raw ? JSON.parse(String(raw)) : fallback;
      return v == null ? fallback : v;
    } catch (_) {
      return fallback;
    }
  }

  function isDoneForPeriod(fields, instanceDeadlineIso) {
    const doneAt = String(fields?.['Senast utförd'] || '').trim();
    // Viktigt: när vi visar 12 månader framåt måste "klar för perioden" beräknas per instans (deadline),
    // annars blir alla framtida rader gröna om en tidigare period är klar.
    const nextDeadline = String(instanceDeadlineIso || fields?.['Nästa deadline'] || '').trim();
    const freq = String(fields?.['Frekvens'] || '').toLowerCase();
    if (!doneAt || !nextDeadline) return false;
    const toD = (iso) => {
      const d = new Date(String(iso).slice(0, 10) + 'T00:00:00');
      return Number.isNaN(d.getTime()) ? null : d;
    };
    const doneD = toD(doneAt);
    const nextD = toD(nextDeadline);
    if (!doneD || !nextD) return false;
    const start = new Date(nextD.getTime());
    if (freq.includes('kvartal')) start.setMonth(start.getMonth() - 3);
    else if (freq.includes('månad')) start.setMonth(start.getMonth() - 1);
    else if (freq.includes('årsvis')) start.setFullYear(start.getFullYear() - 1);
    else start.setMonth(start.getMonth() - 1);
    return doneD >= start && doneD < nextD;
  }

  function recordMatchesSearch(r) {
    if (!q) return true;
    const f = r.fields || {};
    const hay = [
      f['Kundnamn'],
      f['Namn'],
      f['Ansvarig'],
      f['Typ'],
      f['Frekvens'],
      f['Nästa deadline'],
      f['Startdatum']
    ].filter(Boolean).join(' ').toLowerCase();
    return hay.includes(q.toLowerCase());
  }

  function addMonthsIso(iso, n) {
    const s = toDateStr(iso);
    if (!s) return '';
    const [y, m, d] = s.split('-').map(Number);
    const base = new Date(y, (m - 1) + n, 1);
    // clamp day to last day of month
    const last = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
    const day = Math.min(d, last);
    const out = new Date(base.getFullYear(), base.getMonth(), day);
    const yyyy = out.getFullYear();
    const mm = String(out.getMonth() + 1).padStart(2, '0');
    const dd = String(out.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  function monthsStepFromFreq(freqRaw) {
    const f = String(freqRaw || '').toLowerCase();
    if (f.includes('kvartal')) return 3;
    if (f.includes('månad')) return 1;
    if (f.includes('årsvis')) return 12;
    if (f.includes('engång')) return 0;
    return 1;
  }

  function quarterKeyForMonth(ym) {
    const y = Number(String(ym || '').slice(0, 4));
    const m = Number(String(ym || '').slice(5, 7));
    if (!y || !m) return '';
    const qtr = Math.ceil(m / 3);
    return `${y}-Q${qtr}`;
  }

  function yearKeyForMonth(ym) {
    const y = Number(String(ym || '').slice(0, 4));
    return y ? String(y) : '';
  }

  function getModeForUppdrag(typ, freqStr) {
    const tt = (typ || '').toString().trim();
    const ff = (freqStr || '').toString().toLowerCase();
    if (tt === 'Momsredovisning') {
      if (ff.includes('kvartal')) return 'quarter';
      if (ff.includes('år')) return 'year';
      return 'month';
    }
    if (tt === 'Bokslut' || tt === 'Deklaration') return 'year';
    return 'month';
  }

  function runStatusFromHistory(fields, periodKey) {
    const pk = String(periodKey || '').trim();
    if (!pk) return '';
    const hist = safeJson((fields?.['Historik'] || '').toString().trim(), []);
    if (!Array.isArray(hist)) return '';
    const hit = hist.find(it => it && String(it.periodKey || '').trim() === pk);
    return hit ? String(hit.status || '').trim() : '';
  }

  function periodKeyForInstance(x) {
    if (x?.periodKey) return String(x.periodKey).trim();
    const f = x?.record?.fields || {};
    const freq = String(f['Frekvens'] || '').trim();
    if (activeType === 'Momsredovisning' && window.MomsPeriod) {
      const momsFreq = MomsPeriod.inferFreq(freq, '', null);
      if (MomsPeriod.isQuarterlyFreq(momsFreq) || MomsPeriod.isMonthlyFreq(momsFreq)) {
        return MomsPeriod.defaultPeriodKeyForBoard(x.month, momsFreq) || x.month;
      }
    }
    const modeForPrefill = getModeForUppdrag(activeType, freq);
    if (modeForPrefill === 'quarter') return quarterKeyForMonth(x.month);
    if (modeForPrefill === 'year') return yearKeyForMonth(x.month);
    return x.month;
  }

  function dayFromDeadlinePattern(refIso) {
    const d = parseInt(String(refIso || '').slice(8, 10), 10);
    return (Number.isFinite(d) && d >= 1 && d <= 28) ? d : 15;
  }

  function periodKeyFromDeadline(deadlineIso, typ, freq) {
    const dl = toDateStr(deadlineIso);
    if (!dl) return '';
    const mode = getModeForUppdrag(typ, freq);
    if (typ === 'Momsredovisning' && window.MomsPeriod && MomsPeriod.isQuarterlyFreq(freq)) {
      const pk = MomsPeriod.periodKeyFromDeadlineYm(dl.slice(0, 7), freq);
      if (pk) return pk;
    }
    if (mode === 'quarter') return quarterKeyForMonth(dl.slice(0, 7));
    if (mode === 'year') return yearKeyForMonth(dl.slice(0, 7));
    if (isLoneTyp(typ) && window.LonePeriod) {
      return LonePeriod.periodKeyFromDeadline(dl, typ) || dl.slice(0, 7);
    }
    return dl.slice(0, 7);
  }

  function deadlineIsoFromPeriodKey(periodKey, typ, freq, refDeadline) {
    const pk = String(periodKey || '').trim();
    if (!pk) return '';
    const mode = getModeForUppdrag(typ, freq);
    if (typ === 'Momsredovisning' && window.MomsPeriod) {
      const dl = MomsPeriod.deadlineIsoFromPeriodKey(pk, freq);
      if (dl) return dl;
    }
    if (mode === 'quarter') {
      const m = pk.match(/^(\d{4})-Q([1-4])$/i);
      if (m) {
        const y = Number(m[1]);
        const q = Number(m[2]);
        const endMonth = q * 3;
        const day = dayFromDeadlinePattern(refDeadline);
        return `${y}-${String(endMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
    }
    if (mode === 'year' && /^\d{4}$/.test(pk)) {
      const day = dayFromDeadlinePattern(refDeadline);
      const month = String(refDeadline || '').slice(5, 7);
      const mm = /^\d{2}$/.test(month) ? month : '12';
      return `${pk}-${mm}-${String(day).padStart(2, '0')}`;
    }
    if (/^\d{4}-\d{2}$/.test(pk)) {
      const day = String(dayFromDeadlinePattern(refDeadline)).padStart(2, '0');
      if (isLoneTyp(typ) && window.LonePeriod) {
        const dl = LonePeriod.deadlineIsoFromPeriodKey(pk, typ, refDeadline);
        if (dl) return dl;
      }
      return `${pk}-${day}`;
    }
    return toDateStr(refDeadline) || '';
  }

  function startIsoForRun(periodKey, deadlineIso, typ, freq, fields) {
    const dl = toDateStr(deadlineIso);
    if (!dl) return '';
    if (typ === 'Momsredovisning' && window.MomsPeriod) {
      const st = MomsPeriod.startIsoFromPeriodKey(String(periodKey || '').trim(), freq);
      if (st) return st;
    }
    const step = monthsStepFromFreq(freq);
    if (step === 0) {
      const explicit = toDateStr(fields?.['Startdatum'] || '');
      return explicit || dl;
    }
    return addMonthsIso(dl, -step) || toDateStr(fields?.['Startdatum'] || '') || dl;
  }

  function collectRunsForRecord(r) {
    const f = r.fields || {};
    const typ = String(f['Typ'] || '');
    const freq = String(f['Frekvens'] || '');
    const refDeadline = toDateStr(f['Nästa deadline'] || '');
    const refStart = toDateStr(f['Startdatum'] || '');
    const runs = new Map();

    const addRun = (periodKey, deadlineIso, startIso, periodLabel) => {
      const dl = toDateStr(deadlineIso);
      if (!dl) return;
      const pk = String(periodKey || '').trim() || periodKeyFromDeadline(dl, typ, freq);
      const st = toDateStr(startIso) || startIsoForRun(pk, dl, typ, freq, f);
      const momsFreq = (typ === 'Momsredovisning' && window.MomsPeriod)
        ? MomsPeriod.inferFreq(freq, pk, null)
        : freq;
      const label = (typ === 'Momsredovisning' && window.MomsPeriod)
        ? MomsPeriod.runTitle(pk, momsFreq, dl.slice(0, 7))
        : (String(periodLabel || '').trim()
          || (isLoneTyp(typ) && window.LonePeriod ? LonePeriod.displayLabel(pk, typ) : ''));
      const key = `${r.id}:${pk}`;
      if (!runs.has(key)) {
        runs.set(key, { record: r, typ, deadline: dl, startDate: st, periodKey: pk, periodLabel: label, key });
      }
    };

    const hist = safeJson((f['Historik'] || '').toString().trim(), []);
    if (Array.isArray(hist)) {
      hist.forEach((h) => {
        const pk = String(h?.periodKey || '').trim();
        if (!pk) return;
        const dl = toDateStr(h?.deadline) || deadlineIsoFromPeriodKey(pk, typ, freq, refDeadline);
        const st = (isLoneTyp(typ) && window.LonePeriod)
          ? LonePeriod.startIsoFromPeriodKey(pk, typ, refStart || refDeadline)
          : '';
        addRun(pk, dl, st, '');
      });
    }

    if (isLoneTyp(typ) && window.LonePeriod && refDeadline) {
      const templateStart = refStart || refDeadline;
      const todayYm = monthKey(monthStart);
      const loneRuns = LonePeriod.runsThroughHorizon(templateStart, refDeadline, typ, todayYm);
      loneRuns.forEach((run) => {
        addRun(run.periodKey, run.deadlineIso, run.startIso, run.periodLabel);
      });
      return Array.from(runs.values());
    }

    if (typ === 'Momsredovisning' && window.MomsPeriod
      && (MomsPeriod.isMonthlyFreq(freq) || MomsPeriod.isQuarterlyFreq(freq))) {
      const firstPk = MomsPeriod.inferFirstPeriod(f, freq);
      if (firstPk) {
        const todayYm = monthKey(monthStart);
        const momsRuns = MomsPeriod.runsThroughHorizon(firstPk, freq, todayYm);
        momsRuns.forEach((run) => {
          addRun(run.periodKey, run.deadlineIso, run.startIso, run.periodLabel);
        });
        return Array.from(runs.values());
      }
    }

    const step = monthsStepFromFreq(freq);
    if (step === 0) {
      if (refDeadline) addRun(refDeadline.slice(0, 7), refDeadline);
      return Array.from(runs.values());
    }
    if (!refDeadline) return Array.from(runs.values());

    let d = refDeadline;
    for (let guard = 0; guard < 60; guard++) {
      if (!d) break;
      const dlMonth = new Date(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, 1);
      if (dlMonth > monthMax) break;
      addRun(periodKeyFromDeadline(d, typ, freq), d);
      d = addMonthsIso(d, step);
      if (!d) break;
    }

    return Array.from(runs.values());
  }

  function expandRunsToMonthInstances(runs) {
    const inst = [];
    const todayIso = new Date().toISOString().slice(0, 10);
    for (const run of runs || []) {
      const startYm = toDateStr(run.startDate)?.slice(0, 7);
      const endYm = toDateStr(run.deadline)?.slice(0, 7);
      if (!startYm || !endYm) continue;
      let cursor = new Date(Number(startYm.slice(0, 4)), Number(startYm.slice(5, 7)) - 1, 1);
      const end = new Date(Number(endYm.slice(0, 4)), Number(endYm.slice(5, 7)) - 1, 1);
      for (let guard = 0; guard < 36; guard++) {
        if (cursor > monthMax) break;
        if (cursor > end) break;
        if (cursor >= monthMin) {
          const mk = monthKey(cursor);
          if (run.typ === 'Momsredovisning' && window.MomsPeriod) {
            const freq = String(run?.record?.fields?.['Frekvens'] || '').trim();
            const visible = MomsPeriod.runVisibleInBoardMonth({
              PeriodKey: run.periodKey,
              Deadline: run.deadline,
              Frekvens: freq,
              Status: runStatusFromHistory(run?.record?.fields || {}, run.periodKey)
            }, mk, todayIso);
            if (!visible) {
              cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
              continue;
            }
          }
          inst.push({
            ...run,
            month: mk,
            key: `${run.key}:${mk}`
          });
        }
        cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
      }
    }
    return inst;
  }

  function dedupeInstancesByClientMonth(instances) {
    const best = new Map();
    for (const x of instances || []) {
      const kid = String(x?.record?.id || '');
      const mk = String(x?.month || '');
      if (!kid || !mk) continue;
      const mapKey = `${kid}:${mk}`;
      const prev = best.get(mapKey);
      if (!prev) {
        best.set(mapKey, x);
        continue;
      }
      const xPk = String(x?.periodKey || '');
      const prevPk = String(prev?.periodKey || '');
      if (xPk === mk && prevPk !== mk) best.set(mapKey, x);
    }
    return Array.from(best.values());
  }

  function buildMonthInstances(records) {
    const inst = [];
    for (const r of records || []) {
      inst.push(...expandRunsToMonthInstances(collectRunsForRecord(r)));
    }
    return dedupeInstancesByClientMonth(inst);
  }

  function runStatusForInstance(x) {
    const f = x?.record?.fields || {};
    return runStatusFromHistory(f, periodKeyForInstance(x)) || 'Planerad';
  }

  function matchesStatusFilter(x) {
    if (!showKlara && !showEjKlara) return true;
    if (showKlara && showEjKlara) return true;
    const isKlar = runStatusForInstance(x) === 'Klar';
    if (showKlara) return isKlar;
    if (showEjKlara) return !isKlar;
    return true;
  }

  function runStatusOptionsHtml(selected) {
    const opts = ['Planerad', 'Pågående', 'Klar', 'Sen'];
    const sel = String(selected || '').trim();
    return opts.map(o => `<option value="${esc(o)}" ${o === sel ? 'selected' : ''}>${esc(o)}</option>`).join('');
  }

  function buildInstances(records) {
    return buildMonthInstances(records);
  }

  function buildOpenInstances(records) {
    return buildMonthInstances(records);
  }

  function setViewMode(next) {
    viewMode = next === 'open' ? 'open' : 'deadline';
    if (els.viewDeadline) els.viewDeadline.classList.toggle('is-active', viewMode === 'deadline');
    if (els.viewOpen) els.viewOpen.classList.toggle('is-active', viewMode === 'open');

    render();
  }

  function syncStatusFilterUi() {
    if (els.statusKlara) els.statusKlara.classList.toggle('is-active', showKlara);
    if (els.statusEjKlara) els.statusEjKlara.classList.toggle('is-active', showEjKlara);
  }

  function toggleStatusFilter(which) {
    if (which === 'klara') showKlara = !showKlara;
    else showEjKlara = !showEjKlara;
    syncStatusFilterUi();
    render();
  }

  async function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
      reader.onerror = () => reject(new Error('Kunde inte läsa fil'));
      reader.readAsDataURL(file);
    });
  }

  function getRiskState(fields) {
    let riskValda = [];
    try { riskValda = safeJson((fields?.['Riskåtgärder valda'] || '').toString().trim(), []); } catch (_) { riskValda = []; }
    if (!Array.isArray(riskValda)) riskValda = [];
    const riskOn = !!fields?.['Riskåtgärder aktiverade'] || riskValda.length > 0;
    return { riskOn, riskValda };
  }

  async function savePtlUnderlagOnly(customerId, typ, uploadedItems) {
    // merge uploaded into existing record (first fetch from current allRecords)
    const rec = allRecords.find(r => String(r?.fields?.['Kund ID'] || '') === String(customerId) && String(r?.fields?.['Typ'] || '') === String(typ));
    const existing = safeJson((rec?.fields?.['PTL Underlag'] || '').toString().trim(), []);
    const merged = (Array.isArray(uploadedItems) ? uploadedItems : []).concat(Array.isArray(existing) ? existing : []).slice(0, 200);
    const res = await fetch(`${baseUrl}/api/uppdrag`, {
      method: 'POST',
      ...getAuthOpts(),
      body: JSON.stringify({ customerId, typ, fields: { 'PTL Underlag': JSON.stringify(merged) } })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  }

  function showCompleteModal({ customerId, typ, fields, periodKey }) {
    const existing = document.getElementById('uppdrag-complete-modal');
    if (existing) existing.remove();

    const { riskOn, riskValda } = getRiskState(fields || {});

    const modal = document.createElement('div');
    modal.id = 'uppdrag-complete-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-box" style="max-width:720px; width:96vw; max-height:90vh;">
        <div class="modal-header">
          <h3><i class="fas fa-check-circle"></i> Klarmarkera: ${esc(typDisplayLabel(typ))}</h3>
          <button class="modal-close" type="button" onclick="document.getElementById('uppdrag-complete-modal')?.remove()"><i class="fas fa-times"></i></button>
        </div>
        <div class="modal-body" style="overflow:auto;">
          ${riskOn ? `
            <div class="uppdrag-riskbox" style="margin-top:0;">
              <div class="uppdrag-setup-desc" style="margin:0;">
                PTL-åtgärd är aktiverad för detta uppdrag. För dokumentation behöver du skriva en anteckning och du kan även ladda upp underlag.
              </div>
            </div>
          ` : `
            <div class="uppdrag-setup-desc" style="margin-top:0;">
              Vill du lämna en anteckning till denna körning? (valfritt)
            </div>
          `}

          <div class="form-group" style="margin-top:0.75rem;">
            <label>${riskOn ? 'Anteckning *' : 'Anteckning'}</label>
            <textarea id="uppdrag-complete-note" class="kunduppgifter-input" rows="3" placeholder="Skriv anteckning..."></textarea>
          </div>

          ${riskOn ? `
            <div class="form-group" style="margin-top:0.75rem;">
              <label>Underlag (valfritt)</label>
              <input type="file" id="uppdrag-complete-files" class="kunduppgifter-input" multiple>
              <div class="uppdrag-muted" style="margin-top:0.35rem;">Filerna sparas på fliken Dokumentation (kategori: riskbedömning).</div>
            </div>
          ` : ''}
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost btn-sm" type="button" onclick="document.getElementById('uppdrag-complete-modal')?.remove()">Avbryt</button>
          <button class="btn btn-primary btn-sm" type="button" id="uppdrag-complete-confirm"><i class="fas fa-check"></i> Klarmarkera</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('uppdrag-complete-confirm').addEventListener('click', async () => {
      try {
        const note = (document.getElementById('uppdrag-complete-note')?.value || '').trim();
        if (riskOn && !note) {
          alert('Anteckning krävs när PTL-åtgärd är aktiverad.');
          return;
        }
        if (riskOn && (!riskValda || riskValda.length === 0)) {
          alert('Du måste välja minst en PTL-åtgärd på kundkortet innan du kan klarmarkera här.');
          return;
        }

        if (riskOn) {
          const input = document.getElementById('uppdrag-complete-files');
          const files = input ? Array.from(input.files || []) : [];
          if (files.length) {
            const uploaded = [];
            for (const file of files) {
              const base64 = await fileToBase64(file);
              const filename = `PTL-${typ}-${(new Date().toISOString().slice(0, 10))}-${file.name}`;
              const res = await fetch(`${baseUrl}/api/documents/upload`, {
                method: 'POST',
                ...getAuthOpts(),
                body: JSON.stringify({
                  customerId,
                  file: base64,
                  filename,
                  category: 'riskbedomning',
                  customCategory: 'ptl-underlag'
                })
              });
              const data = await res.json().catch(() => ({}));
              if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
              uploaded.push({ filename, uploadedAt: new Date().toISOString() });
            }
            await savePtlUnderlagOnly(customerId, typ, uploaded);
          }
        }

        const res = await fetch(`${baseUrl}/api/uppdrag/complete`, {
          method: 'POST',
          ...getAuthOpts(),
          body: JSON.stringify({
            customerId,
            typ,
            note,
            ...(periodKey ? { periodKey: String(periodKey).trim() } : {})
          })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

        document.getElementById('uppdrag-complete-modal')?.remove();
        await load();
      } catch (e) {
        alert('Kunde inte klarmarkera: ' + (e.message || 'fel'));
      }
    });
  }

  function render() {
    const runLabel = (viewMode === 'open')
      ? 'Deadline'
      : (activeType === LONE_TAB
        ? 'Lönekörning'
        : (activeType === 'Momsredovisning' ? 'Momsperiod' : (activeType === 'Bokslut' ? 'Bokslut' : 'Deklaration')));
    if (els.colRun) els.colRun.textContent = runLabel;

    const instances = (viewMode === 'open') ? buildOpenInstances(allRecords) : buildInstances(allRecords);
    const filtered = (viewMode === 'open')
      ? instances
          .filter(x => matchesActiveType(x?.typ))
          .filter(x => recordMatchesSearch(x.record))
          .filter(x => x.month === monthKey(monthCursor))
          .filter(x => matchesStatusFilter(x))
          .sort((a, b) => String(a.deadline || '').localeCompare(String(b.deadline || '')))
      : instances
          .filter(x => matchesActiveType(x?.typ))
          .filter(x => recordMatchesSearch(x.record))
          .filter(x => x.month === monthKey(monthCursor))
          .filter(x => matchesStatusFilter(x))
          .sort((a, b) => sortByClient(a.record, b.record));

    const rowsHtml = filtered.map(x => {
      const r = x.record;
      const f = r.fields || {};
      const kundId = String(f['Kund ID'] || '');
      const kundNamn = String(f['Kundnamn'] || '').trim();
      const kundLabel = kundNamn || (kundId ? kundId : 'Kund');
      const link = kundId ? `kundkort.html?id=${encodeURIComponent(kundId)}` : '';

      const done = isDoneForPeriod(f, x.deadline) ? 1 : 0;
      const freq = String(f['Frekvens'] || '').trim();
      const modeForPrefill = getModeForUppdrag(activeType, freq);
      const periodKey = x.periodKey || ((modeForPrefill === 'quarter')
        ? quarterKeyForMonth(x.month)
        : (modeForPrefill === 'year')
          ? yearKeyForMonth(x.month)
          : x.month);
      const runName = (x.typ === 'Momsredovisning' && window.MomsPeriod)
        ? MomsPeriod.runTitle(periodKey, MomsPeriod.inferFreq(freq, periodKey, null), x.month)
        : String(x.periodLabel || '').trim();
      const showRunName = (isLoneTyp(x.typ) || x.typ === 'Momsredovisning') && runName;
      const runCell = (viewMode === 'open')
        ? `<span class="uppdragboard-progress ${done ? 'is-done' : ''}">${esc(String(x.deadline || '–'))}</span>`
        : (showRunName)
          ? `<span class="uppdragboard-progress ${done ? 'is-done' : ''}" title="Klart senast ${esc(String(x.deadline || ''))}">${esc(runName)}</span>`
          : `<span class="uppdragboard-progress ${done ? 'is-done' : ''}">${done} / 1</span>`;
      const runStatus = runStatusFromHistory(f, periodKey) || 'Planerad';
      const statusCell = `
        <div class="uppdragboard-statuscell">
          <select class="form-select uppdragboard-status-select"
            aria-label="Status"
            title="Ändra status"
            data-action="set-run-status"
            data-customer-id="${esc(kundId)}"
            data-typ="${esc(String(x.typ || activeType))}"
            data-periodkey="${esc(periodKey)}"
          >
            ${runStatusOptionsHtml(runStatus)}
          </select>
          <span class="uppdrag-muted uppdragboard-status-msg" data-status-msg-for="${esc(kundId)}:${esc(activeType)}:${esc(periodKey)}"></span>
        </div>
      `;

      const rutin = (f['Rutin'] || '').toString().trim();
      const runningNote = (f['Anteckning för denna körning'] || f['Anteckning'] || '').toString();
      const hasRunningNote = !!String(runningNote || '').trim();
      const riskValda = safeJson((f['Riskåtgärder valda'] || '').toString().trim(), []);
      const riskList = Array.isArray(riskValda) && riskValda.length
        ? `<div class="uppdrag-view-list">${riskValda.slice(0, 20).map(a => `<div class="uppdrag-view-list-item"><i class="fas fa-check"></i>${esc(a)}</div>`).join('')}</div>`
        : '';
      const hist = safeJson((f['Historik'] || '').toString().trim(), []);
      const histHtml = Array.isArray(hist) && hist.length
        ? hist.slice(0, 6).map(h => {
            const d = esc(String(h?.doneAt || '').slice(0, 10));
            const n = esc(String(h?.note || ''));
            return `<div class="uppdrag-prev-note"><div class="uppdrag-prev-note-date"><i class="fas fa-check-circle"></i> ${d || 'Klarmarkerad'}</div>${n ? `<div class="uppdrag-prev-note-text">${n}</div>` : ''}</div>`;
          }).join('')
        : `<div class="uppdrag-muted">Inga tidigare anteckningar.</div>`;

      const attFieldName = Array.isArray(f['Dokumentation']) ? 'Dokumentation' : (Array.isArray(f['Attachments']) ? 'Attachments' : null);
      const allAtt = attFieldName ? (f[attFieldName] || []) : [];
      const deadlineKey = String(x.deadline || '').slice(0, 10);
      const runAtt = Array.isArray(allAtt) && deadlineKey
        ? allAtt.filter(a => String(a?.filename || '').includes(deadlineKey)).slice(0, 10)
        : [];
      const runAttHtml = runAtt.length
        ? `<div class="uppdrag-view-list">${runAtt.map(a => {
            const fn = esc(String(a?.filename || 'Bilaga'));
            const url = esc(String(a?.url || ''));
            return url
              ? `<div class="uppdrag-view-list-item"><i class="fas fa-paperclip"></i><a href="${url}" target="_blank" rel="noopener noreferrer">${fn}</a></div>`
              : `<div class="uppdrag-view-list-item"><i class="fas fa-paperclip"></i>${fn}</div>`;
          }).join('')}</div>`
        : ``;

      return `
        <tr class="uppdragboard-row" data-key="${esc(x.key)}" data-customer-id="${esc(kundId)}" data-typ="${esc(String(x.typ || ''))}">
          <td class="uppdragboard-client">
            ${link ? `<a class="uppdragboard-link" href="${esc(link)}">${esc(kundLabel)}</a>` : esc(kundLabel)}
          </td>
          <td>${runCell}</td>
          <td>${statusCell}</td>
          <td>
            <button type="button" class="uppdragboard-donebtn ${done ? 'is-done' : ''}" data-action="done" data-customer-id="${esc(kundId)}" data-typ="${esc(String(x.typ || ''))}" data-period-key="${esc(periodKey)}" title="Klarmarkera">
              <i class="fas fa-check"></i>
            </button>
          </td>
          <td class="uppdragboard-arrow"><button type="button" class="uppdragboard-expandbtn" data-action="toggle" title="Visa mer"><i class="fas fa-chevron-down"></i></button></td>
        </tr>
        <tr class="uppdragboard-details" data-details-for="${esc(x.key)}" style="display:none;">
          <td colspan="5">
            <div class="uppdragboard-details-inner">
              <div class="uppdragboard-details-top">
                <div class="uppdrag-view-field">
                  <div class="uppdrag-view-label">Rutin / instruktion</div>
                  <div class="uppdrag-view-text">${rutin ? esc(rutin) : '<span class="uppdrag-muted">Ingen rutin sparad.</span>'}</div>
                </div>
                ${riskList ? `
                <div class="uppdrag-view-field">
                  <div class="uppdrag-view-label">Åtgärd enligt kundens riskbedömning</div>
                  ${riskList}
                </div>` : ''}
              </div>
              <div class="uppdragboard-details-history" style="margin-top:1rem;">
                <div class="form-group" style="margin-top:0.5rem; margin-bottom:0;">
                  <textarea
                    class="kunduppgifter-input uppdrag-run-note"
                    rows="3"
                    data-note-for="${esc(x.key)}"
                    placeholder="Anteckning"
                    ${hasRunningNote ? 'readonly' : ''}
                  >${esc(runningNote)}</textarea>
                  <div style="display:flex; gap:0.5rem; align-items:center; margin-top:0.5rem; flex-wrap:wrap;">
                    <button
                      type="button"
                      class="btn btn-secondary btn-sm"
                      data-action="toggle-note"
                      data-mode="${hasRunningNote ? 'edit' : 'save'}"
                      data-key="${esc(x.key)}"
                      data-customer-id="${esc(kundId)}"
                    >
                      ${hasRunningNote ? '<i class="fas fa-pen"></i> Redigera' : '<i class="fas fa-save"></i> Spara anteckning'}
                    </button>
                    <span class="uppdrag-muted" data-note-status-for="${esc(x.key)}" style="margin:0;"></span>
                  </div>
                </div>
                <div class="form-group" style="margin-top:0.9rem; margin-bottom:0;">
                  <div class="uppdrag-view-label" style="margin-bottom:0.35rem;">Dokumentation för denna körning</div>
                  <div style="display:flex; gap:0.5rem; align-items:center; flex-wrap:wrap;">
                    <input type="file" class="kunduppgifter-input" style="padding:0.45rem;" data-docs-input-for="${esc(x.key)}" multiple />
                    <button type="button" class="btn btn-secondary btn-sm" data-action="upload-docs" data-key="${esc(x.key)}" data-customer-id="${esc(kundId)}" data-deadline="${esc(String(x.deadline || ''))}">
                      <i class="fas fa-upload"></i> Ladda upp
                    </button>
                    <span class="uppdrag-muted" data-docs-status-for="${esc(x.key)}" style="margin:0;"></span>
                  </div>
                  <div data-docs-list-for="${esc(x.key)}" style="margin-top:0.5rem;">${runAttHtml}</div>
                </div>
              </div>
            </div>
          </td>
        </tr>
      `;
    }).join('') || `<tr><td colspan="5" class="uppdragboard-empty">Inga uppdrag för vald månad.</td></tr>`;

    tbodyEl.innerHTML = rowsHtml;

    // bind row toggles + done buttons
    tbodyEl.querySelectorAll('.uppdragboard-row').forEach(row => {
      const key = row.getAttribute('data-key') || '';
      const details = tbodyEl.querySelector(`.uppdragboard-details[data-details-for="${CSS.escape(key)}"]`);
      row.querySelector('[data-action="toggle"]')?.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const open = details && details.style.display !== 'none';
        if (details) details.style.display = open ? 'none' : '';
        row.classList.toggle('is-open', !open);
        // Markera att listan har ett aktivt kort (för dimning av övriga)
        const anyOpen = !!tbodyEl.querySelector('.uppdragboard-row.is-open');
        tbodyEl.classList.toggle('uppdragboard-has-open', anyOpen);
      });
      // done
      row.querySelector('[data-action="done"]')?.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const customerId = row.getAttribute('data-customer-id') || '';
        const doneBtn = row.querySelector('[data-action="done"]');
        const periodKey = doneBtn?.getAttribute('data-period-key') || '';
        const rowTyp = doneBtn?.getAttribute('data-typ') || row.getAttribute('data-typ') || activeType;
        const rec = allRecords.find(x => String(x?.fields?.['Kund ID'] || '') === String(customerId) && String(x?.fields?.['Typ'] || '') === String(rowTyp));
        showCompleteModal({ customerId, typ: rowTyp, fields: rec?.fields || {}, periodKey });
      });
    });

    // bind edit/save note buttons
    tbodyEl.querySelectorAll('[data-action="toggle-note"]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const mode = (btn.getAttribute('data-mode') || 'save').toLowerCase();
        const key = btn.getAttribute('data-key') || '';
        const customerId = btn.getAttribute('data-customer-id') || '';
        if (!customerId || !key) return;
        const textarea = tbodyEl.querySelector(`textarea[data-note-for="${CSS.escape(key)}"]`);
        const statusEl = tbodyEl.querySelector(`[data-note-status-for="${CSS.escape(key)}"]`);

        if (mode === 'edit') {
          if (textarea) {
            textarea.removeAttribute('readonly');
            try { textarea.focus(); } catch (_) {}
          }
          btn.setAttribute('data-mode', 'save');
          btn.innerHTML = '<i class="fas fa-save"></i> Spara anteckning';
          if (statusEl) statusEl.textContent = '';
          return;
        }

        const note = (textarea?.value || '').toString();
        if (statusEl) statusEl.textContent = 'Sparar...';
        try {
          const res = await fetch(`${baseUrl}/api/uppdrag`, {
            method: 'POST',
            ...getAuthOpts(),
            body: JSON.stringify({
              customerId,
              typ: activeType,
              fields: {
                'Anteckning för denna körning': note
              }
            })
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
          if (statusEl) statusEl.textContent = 'Sparat.';
          // Uppdatera lokalt cache för att slippa reload
          const rec = allRecords.find(x => String(x?.fields?.['Kund ID'] || '') === String(customerId) && String(x?.fields?.['Typ'] || '') === String(activeType));
          if (rec && rec.fields) rec.fields['Anteckning för denna körning'] = note;
          // Visa varning om Airtable saknar fältet
          if (data.warning && statusEl) statusEl.textContent = String(data.warning);
          setTimeout(() => { if (statusEl && statusEl.textContent === 'Sparat.') statusEl.textContent = ''; }, 2000);

          // om anteckning finns: lås och byt tillbaka till penna
          if (String(note || '').trim()) {
            if (textarea) textarea.setAttribute('readonly', 'readonly');
            btn.setAttribute('data-mode', 'edit');
            btn.innerHTML = '<i class="fas fa-pen"></i> Redigera';
          } else {
            // tom anteckning: låt användaren fortsätta skriva och spara
            btn.setAttribute('data-mode', 'save');
            btn.innerHTML = '<i class="fas fa-save"></i> Spara anteckning';
          }
        } catch (err) {
          if (statusEl) statusEl.textContent = 'Kunde inte spara: ' + (err.message || 'fel');
        }
      });
    });

    // bind upload-docs buttons
    tbodyEl.querySelectorAll('[data-action="upload-docs"]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const key = btn.getAttribute('data-key') || '';
        const customerId = btn.getAttribute('data-customer-id') || '';
        const deadline = btn.getAttribute('data-deadline') || '';
        if (!customerId || !key || !deadline) return;
        const input = tbodyEl.querySelector(`input[type="file"][data-docs-input-for="${CSS.escape(key)}"]`);
        const statusEl = tbodyEl.querySelector(`[data-docs-status-for="${CSS.escape(key)}"]`);
        const listEl = tbodyEl.querySelector(`[data-docs-list-for="${CSS.escape(key)}"]`);
        const files = input && input.files ? Array.from(input.files) : [];
        if (!files.length) {
          if (statusEl) statusEl.textContent = 'Välj minst en fil.';
          return;
        }
        if (statusEl) statusEl.textContent = 'Laddar upp...';
        btn.disabled = true;
        try {
          const readAsDataUrl = (file) => new Promise((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(String(r.result || ''));
            r.onerror = () => reject(new Error('Kunde inte läsa fil'));
            r.readAsDataURL(file);
          });

          for (const file of files.slice(0, 5)) {
            // eslint-disable-next-line no-await-in-loop
            const dataUrl = await readAsDataUrl(file);
            const res = await fetch(`${baseUrl}/api/uppdrag/run-docs`, {
              method: 'POST',
              ...getAuthOpts(),
              body: JSON.stringify({
                customerId,
                typ: activeType,
                deadline: String(deadline).slice(0, 10),
                filename: file.name,
                contentType: file.type || 'application/octet-stream',
                base64: dataUrl
              })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

            // Uppdatera lokalt cache + UI-lista
            const rec = allRecords.find(x => String(x?.fields?.['Kund ID'] || '') === String(customerId) && String(x?.fields?.['Typ'] || '') === String(activeType));
            if (rec && data.record && data.record.fields) rec.fields = data.record.fields;

            if (listEl && rec && rec.fields) {
              const f = rec.fields || {};
              const attFieldName = Array.isArray(f['Dokumentation']) ? 'Dokumentation' : (Array.isArray(f['Attachments']) ? 'Attachments' : (data.fieldName || null));
              const allAtt = attFieldName ? (f[attFieldName] || []) : [];
              const dl = String(deadline || '').slice(0, 10);
              const runAtt = Array.isArray(allAtt) && dl ? allAtt.filter(a => String(a?.filename || '').includes(dl)).slice(0, 10) : [];
              listEl.innerHTML = runAtt.length
                ? `<div class="uppdrag-view-list">${runAtt.map(a => {
                    const fn = esc(String(a?.filename || 'Bilaga'));
                    const url = esc(String(a?.url || ''));
                    return url
                      ? `<div class="uppdrag-view-list-item"><i class="fas fa-paperclip"></i><a href="${url}" target="_blank" rel="noopener noreferrer">${fn}</a></div>`
                      : `<div class="uppdrag-view-list-item"><i class="fas fa-paperclip"></i>${fn}</div>`;
                  }).join('')}</div>`
                : ``;
            }
          }

          if (statusEl) statusEl.textContent = 'Uppladdat.';
          if (input) input.value = '';
          setTimeout(() => { if (statusEl && statusEl.textContent === 'Uppladdat.') statusEl.textContent = ''; }, 2500);
        } catch (err) {
          if (statusEl) statusEl.textContent = 'Kunde inte ladda upp: ' + (err.message || 'fel');
        } finally {
          btn.disabled = false;
        }
      });
    });

    if (els.title) els.title.textContent = (activeType === 'Momsredovisning') ? 'Momsuppdrag'
      : (activeType === 'Bokslut') ? 'Bokslutsuppdrag'
      : (activeType === 'Deklaration') ? 'Deklarationsuppdrag'
      : 'Löneuppdrag';
    if (els.month) els.month.textContent = monthLabel(monthCursor);
  }

  async function load() {
    if (!(window.AuthManager && AuthManager.getCurrentUser && AuthManager.getCurrentUser())) {
      setVisible(els.loading, false);
      setVisible(els.content, false);
      setVisible(els.noAuth, true);
      return;
    }

    setVisible(els.noAuth, false);
    setVisible(els.loading, true);
    setVisible(els.content, false);

    try {
      const mine = scope === 'mine' ? '1' : '0';
      const res = await fetch(`${baseUrl}/api/uppdrag/byra?mine=${mine}`, getAuthOpts());
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      allRecords = Array.isArray(data.records) ? data.records : [];
      render();
      setVisible(els.loading, false);
      setVisible(els.content, true);
    } catch (e) {
      console.error('❌ Uppdrag översikt:', e);
      tbodyEl.innerHTML = `<tr><td colspan="5" class="uppdragboard-empty">Kunde inte ladda uppdrag: ${esc(e.message || 'fel')}</td></tr>`;
      setVisible(els.loading, false);
      setVisible(els.content, true);
    }
  }

  function setScope(next) {
    scope = next;
    if (els.mineBtn) els.mineBtn.classList.toggle('is-active', scope === 'mine');
    if (els.byraBtn) els.byraBtn.classList.toggle('is-active', scope !== 'mine');
    load();
  }

  if (els.mineBtn) els.mineBtn.addEventListener('click', () => setScope('mine'));
  if (els.byraBtn) els.byraBtn.addEventListener('click', () => setScope('byra'));
  if (els.search) els.search.addEventListener('input', () => { q = els.search.value || ''; render(); });
  if (els.viewDeadline) els.viewDeadline.addEventListener('click', () => setViewMode('deadline'));
  if (els.viewOpen) els.viewOpen.addEventListener('click', () => setViewMode('open'));
  if (els.statusKlara) els.statusKlara.addEventListener('click', () => toggleStatusFilter('klara'));
  if (els.statusEjKlara) els.statusEjKlara.addEventListener('click', () => toggleStatusFilter('ej-klara'));

  if (els.prev) els.prev.addEventListener('click', () => {
    const next = new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1);
    monthCursor = next;
    render();
  });
  if (els.next) els.next.addEventListener('click', () => {
    const next = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1);
    if (next > monthMax) return;
    monthCursor = next;
    render();
  });

  if (els.typeTabs && els.typeTabs.length) {
    els.typeTabs.forEach(btn => btn.addEventListener('click', () => {
      const t = btn.getAttribute('data-typ') || 'Löneuppdrag';
      if (!TYPES.includes(t)) return;
      activeType = t;
      els.typeTabs.forEach(b => b.classList.toggle('is-active', b === btn));
      render();
    }));
  }

  if (els.createBtn) {
    els.createBtn.addEventListener('click', () => {
      // Skapa sker idag på kundkortet. Vi håller detta enkelt och länkar till kundlistan.
      window.location.href = 'kundlista.html';
    });

    // status change
    tbodyEl.querySelectorAll('[data-action="set-run-status"]').forEach(sel => {
      sel.addEventListener('change', async () => {
        const customerId = sel.getAttribute('data-customer-id') || '';
        const typ = sel.getAttribute('data-typ') || '';
        const periodKey = sel.getAttribute('data-periodkey') || '';
        const status = sel.value || '';
        const msgKey = `${customerId}:${typ}:${periodKey}`;
        const msgEl = tbodyEl.querySelector(`[data-status-msg-for="${CSS.escape(msgKey)}"]`);
        if (msgEl) msgEl.textContent = 'Sparar...';
        try {
          const res = await fetch(`${baseUrl}/api/uppdrag/run-status`, {
            method: 'PATCH',
            ...getAuthOpts(),
            body: JSON.stringify({ customerId, typ, periodKey, status })
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
          if (msgEl) msgEl.textContent = 'Sparat.';
          setTimeout(() => { if (msgEl && msgEl.textContent === 'Sparat.') msgEl.textContent = ''; }, 1500);
          await load();
        } catch (e) {
          if (msgEl) msgEl.textContent = 'Kunde inte spara: ' + (e.message || 'fel');
        }
      });
    });
  }

  window.addEventListener('clientflow:authReady', () => load());
  monthCursor = new Date(monthStart.getFullYear(), monthStart.getMonth(), 1);
  syncStatusFilterUi();
  setViewMode('deadline');
  activeType = 'Löneuppdrag';
  if (els.typeTabs && els.typeTabs.length) {
    els.typeTabs.forEach(b => b.classList.toggle('is-active', (b.getAttribute('data-typ') || '') === activeType));
  }
  setScope('byra');
})();

