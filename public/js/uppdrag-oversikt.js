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

  const TYPES = ['Löneuppdrag', 'Momsredovisning', 'Bokslut', 'Deklaration', 'Uppdragsavgörande åtgärder', 'Övriga'];
  const LONE_TAB = 'Löneuppdrag';
  const OVRIGA_TAB = 'Övriga';
  const UPPDRAGS_AVGORANDE_TAB = 'Uppdragsavgörande åtgärder';
  const UPPDRAGS_AVGORANDE_NAMN = 'Uppdragsavgörande åtgärder';

  function isLoneTyp(typ) {
    return !!(window.LonePeriod && LonePeriod.isLoneTyp(typ));
  }

  function typDisplayLabel(typ) {
    return (window.LonePeriod && LonePeriod.typDisplayLabel)
      ? LonePeriod.typDisplayLabel(typ)
      : String(typ || '');
  }

  function isUppdragsavgorande(recOrTyp) {
    if (recOrTyp && typeof recOrTyp === 'object') {
      const f = recOrTyp.fields || recOrTyp;
      const namn = String(f.Namn || f.namn || '').trim();
      const typ = String(f.Typ || recOrTyp.typ || '').trim();
      return namn === UPPDRAGS_AVGORANDE_NAMN || typ === UPPDRAGS_AVGORANDE_TAB;
    }
    return String(recOrTyp || '').trim() === UPPDRAGS_AVGORANDE_TAB;
  }

  function isOvrigaTyp(typ, rec) {
    const t = String(typ || '').trim();
    if (!t) return false;
    if (rec && isUppdragsavgorande(rec)) return false;
    if (t === UPPDRAGS_AVGORANDE_TAB) return false;
    if (window.UppdragTyp && UppdragTyp.isStandardUppdragTyp) {
      return !UppdragTyp.isStandardUppdragTyp(t);
    }
    return t === 'Eget uppdrag';
  }

  function uppdragDisplayName(typ, fields) {
    if (window.UppdragTyp && UppdragTyp.uppdragDisplayName) {
      return UppdragTyp.uppdragDisplayName(typ, fields);
    }
    return typDisplayLabel(typ);
  }

  function matchesActiveType(typ, rec) {
    const t = String(typ || '').trim();
    if (activeType === LONE_TAB) return isLoneTyp(t);
    if (activeType === UPPDRAGS_AVGORANDE_TAB) {
      return rec ? isUppdragsavgorande(rec) : isUppdragsavgorande(t);
    }
    if (activeType === OVRIGA_TAB) return isOvrigaTyp(t, rec);
    return t === activeType;
  }

  let scope = 'byra'; // 'byra' | 'mine'
  let allRecords = [];
  let allRunRecords = [];
  let runsByUppdragId = new Map();
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

  function indexRunsByUppdrag(runRecords) {
    const map = new Map();
    (Array.isArray(runRecords) ? runRecords : []).forEach((rr) => {
      const uid = String(rr?.fields?.['Uppdrag ID'] || '').trim();
      if (!uid) return;
      const arr = map.get(uid) || [];
      arr.push(rr);
      map.set(uid, arr);
    });
    return map;
  }

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
    else     if (freq.includes('årsvis')) start.setFullYear(start.getFullYear() - 1);
    else if (freq.includes('veck')) start.setDate(start.getDate() - 7);
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
      f['Klientansvarig'],
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
    if (f.includes('veck')) return 0;
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
    if (ff.includes('veck')) return 'week';
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
    if (mode === 'week') return dl;
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
    if (mode === 'week' && /^\d{4}-\d{2}-\d{2}$/.test(pk)) return pk;
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

    const addRun = (periodKey, deadlineIso, startIso, periodLabel, status, runRec) => {
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
      const statusResolved = String(status || '').trim()
        || runStatusFromHistory(f, pk)
        || String(runRec?.fields?.['Status'] || '').trim()
        || '';
      const prev = runs.get(key);
      if (!prev) {
        runs.set(key, {
          record: r,
          runRec: runRec || null,
          typ,
          deadline: dl,
          startDate: st,
          periodKey: pk,
          periodLabel: label,
          status: statusResolved,
          key
        });
        return;
      }
      // Prefer körningsrad + Klar-status om vi redan har en syntetisk rad
      if (!prev.runRec && runRec) prev.runRec = runRec;
      if ((!prev.status || prev.status === 'Planerad') && statusResolved) prev.status = statusResolved;
      if (statusResolved === 'Klar') prev.status = 'Klar';
      if (!prev.periodLabel && label) prev.periodLabel = label;
      if (!prev.startDate && st) prev.startDate = st;
    };

    // Riktiga Uppdragskörningar (statuskälla) – kompletteras alltid med historik/syntetiska
    // perioder så en trunkerad API-hämtning inte lämnar boarden tom.
    const airtableRuns = runsByUppdragId.get(String(r.id || '').trim()) || [];
    if (airtableRuns.length) {
      airtableRuns.forEach((rr) => {
        const ff = rr?.fields || {};
        if (typ && String(ff['Typ'] || '').trim() && String(ff['Typ'] || '').trim() !== typ) return;
        const pk = String(ff['PeriodKey'] || '').trim();
        let dl = toDateStr(ff['Deadline'] || '');
        // Moms: alltid SKV-deadline från PeriodKey (lagrad Deadline kan vara felräknad)
        if (typ === 'Momsredovisning' && window.MomsPeriod && pk) {
          const computedDl = MomsPeriod.deadlineIsoFromPeriodKey(pk, freq);
          if (computedDl) dl = computedDl;
        }
        if (!pk && !dl) return;
        let st = toDateStr(ff['Startdatum'] || '');
        if (typ === 'Momsredovisning' && window.MomsPeriod && pk) {
          st = MomsPeriod.startIsoFromPeriodKey(pk, freq) || st;
        }
        if (!st && dl) {
          if (isLoneTyp(typ) && window.LonePeriod && pk) {
            st = LonePeriod.startIsoFromPeriodKey(pk, typ, refStart || dl) || '';
          } else {
            st = startIsoForRun(pk || periodKeyFromDeadline(dl, typ, freq), dl, typ, freq, f);
          }
        }
        if (!st && dl) st = dl;
        const label = String(ff['Period Label'] || '').trim()
          || (typ === 'Momsredovisning' && window.MomsPeriod && pk ? MomsPeriod.displayLabel(pk, freq) : '')
          || (isLoneTyp(typ) && window.LonePeriod && pk ? LonePeriod.displayLabel(pk, typ) : '');
        addRun(pk, dl, st, label, String(ff['Status'] || '').trim(), rr);
      });
    }

    const hist = safeJson((f['Historik'] || '').toString().trim(), []);
    if (Array.isArray(hist)) {
      hist.forEach((h) => {
        const pk = String(h?.periodKey || '').trim();
        if (!pk) return;
        const dl = toDateStr(h?.deadline) || deadlineIsoFromPeriodKey(pk, typ, freq, refDeadline);
        const st = (isLoneTyp(typ) && window.LonePeriod)
          ? LonePeriod.startIsoFromPeriodKey(pk, typ, refStart || refDeadline)
          : '';
        addRun(pk, dl, st, '', String(h?.status || '').trim(), null);
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

    if (String(freq || '').toLowerCase().includes('veck')) {
      if (refDeadline) {
        const addDays = (iso, n) => {
          const s = toDateStr(iso);
          if (!s) return '';
          const [y, mo, da] = s.split('-').map(Number);
          const dt = new Date(y, mo - 1, da + n);
          return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
        };
        let d = refDeadline;
        let s = refStart || d;
        for (let guard = 0; guard < 60; guard++) {
          if (!d) break;
          const dlMonth = new Date(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, 1);
          if (dlMonth > monthMax) break;
          addRun(d, d, s, d);
          d = addDays(d, 7);
          s = addDays(s, 7);
        }
      }
      return Array.from(runs.values());
    }

    const step = monthsStepFromFreq(freq);
    if (step === 0) {
      if (refDeadline) {
        const pk = (typ === 'Bokslut' || typ === 'Deklaration' || getModeForUppdrag(typ, freq) === 'year')
          ? yearKeyForMonth(refDeadline.slice(0, 7))
          : refDeadline.slice(0, 7);
        addRun(pk, refDeadline, refStart);
      }
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
    const KV = window.KoringVisibility || null;
    for (const run of runs || []) {
      const startYm = toDateStr(run.startDate)?.slice(0, 7);
      const endYm = toDateStr(run.deadline)?.slice(0, 7);
      if (!startYm || !endYm) continue;
      const runStatus = run.status || runStatusFromHistory(run?.record?.fields || {}, run.periodKey);
      const overdue = !!(KV && KV.isOverdueNotDone({
        Deadline: run.deadline,
        Status: runStatus
      }, todayIso));
      let cursor = new Date(Number(startYm.slice(0, 4)), Number(startYm.slice(5, 7)) - 1, 1);
      const end = new Date(Number(endYm.slice(0, 4)), Number(endYm.slice(5, 7)) - 1, 1);
      const last = overdue ? monthMax : end;
      for (let guard = 0; guard < 48; guard++) {
        if (cursor > monthMax) break;
        if (cursor > last) break;
        if (cursor >= monthMin) {
          const mk = monthKey(cursor);
          const inWindow = cursor <= end;
          if (run.typ === 'Momsredovisning' && window.MomsPeriod) {
            const freq = String(run?.record?.fields?.['Frekvens'] || '').trim();
            const visible = MomsPeriod.runVisibleInBoardMonth({
              PeriodKey: run.periodKey,
              Deadline: run.deadline,
              Frekvens: freq,
              Status: runStatus
            }, mk, todayIso);
            if (!visible) {
              cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
              continue;
            }
          } else if (isLoneTyp(run.typ) && window.LonePeriod) {
            const visible = LonePeriod.runVisibleInBoardMonth({
              Startdatum: run.startDate,
              Deadline: run.deadline,
              Status: runStatus
            }, mk, todayIso) || overdue;
            if (!visible) {
              cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
              continue;
            }
          } else if (!inWindow && !overdue) {
            cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
            continue;
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
      const freq = String(x?.record?.fields?.['Frekvens'] || '').toLowerCase();
      const mapKey = freq.includes('veck')
        ? `${kid}:${mk}:${x.periodKey || x.deadline || ''}`
        : `${kid}:${mk}`;
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
    const fromRun = String(x?.status || x?.runRec?.fields?.['Status'] || '').trim();
    if (fromRun) return fromRun;
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

  function todayIso() {
    return new Date().toISOString().slice(0, 10);
  }

  function attentionForInstance(x, runStatus, done) {
    const KV = window.KoringVisibility || null;
    if (!KV || !KV.runAttentionKind) return '';
    return KV.runAttentionKind({
      Status: (done || runStatus === 'Klar') ? 'Klar' : runStatus,
      Deadline: x?.deadline
    }, todayIso());
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

  function parseRiskAtgarderList(raw) {
    const text = (raw == null) ? '' : String(raw).trim();
    if (!text) return [];
    if (text.startsWith('[')) {
      const arr = safeJson(text, []);
      if (!Array.isArray(arr)) return [];
      return arr.map((x) => {
        if (typeof x === 'string') return x.trim();
        if (x && typeof x === 'object') return String(x.text || x.name || x.label || '').trim();
        return '';
      }).filter(Boolean);
    }
    return text.split(/\r?\n/).map((s) => s.replace(/^\s*[-•]\s*/, '').trim()).filter(Boolean);
  }

  function parseRiskAtgarderDone(raw) {
    const text = (raw == null) ? '' : String(raw).trim();
    if (!text) return [];
    const arr = text.startsWith('[') ? safeJson(text, []) : text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    if (!Array.isArray(arr)) return [];
    return arr.map((x) => {
      if (typeof x === 'string') return { text: x.trim(), checkedAt: '', user: '' };
      return { text: String(x?.text || x?.name || '').trim(), checkedAt: x?.checkedAt || '', user: x?.user || '' };
    }).filter((x) => x.text);
  }

  function riskAtgarderAllChecked(required, done) {
    const need = (Array.isArray(required) ? required : []).map((s) => String(s || '').trim()).filter(Boolean);
    if (!need.length) return true;
    const have = new Set((Array.isArray(done) ? done : []).map((x) => String((x && x.text) || x || '').trim().toLowerCase()).filter(Boolean));
    return need.every((r) => have.has(r.toLowerCase()));
  }

  function getRiskState(fields, runFields) {
    const riskValda = parseRiskAtgarderList(fields?.['Riskåtgärder valda']);
    const riskOn = !!fields?.['Riskåtgärder aktiverade'] || riskValda.length > 0;
    const done = parseRiskAtgarderDone(runFields?.['Riskåtgärder utförda']);
    return { riskOn, riskValda, done };
  }

  async function savePtlUnderlagOnly(customerId, typ, uploadedItems, uppdragId) {
    // merge uploaded into existing record (first fetch from current allRecords)
    const id = String(uppdragId || '').trim();
    const rec = (id && allRecords.find((r) => String(r?.id || '') === id))
      || allRecords.find(r => String(r?.fields?.['Kund ID'] || '') === String(customerId) && String(r?.fields?.['Typ'] || '') === String(typ));
    const existing = safeJson((rec?.fields?.['PTL Underlag'] || '').toString().trim(), []);
    const merged = (Array.isArray(uploadedItems) ? uploadedItems : []).concat(Array.isArray(existing) ? existing : []).slice(0, 200);
    const res = await fetch(`${baseUrl}/api/uppdrag`, {
      method: 'POST',
      ...getAuthOpts(),
      body: JSON.stringify({
        customerId,
        typ,
        fields: { 'PTL Underlag': JSON.stringify(merged) },
        ...(id || rec?.id ? { uppdragId: id || rec.id } : {})
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  }

  function showCompleteModal({ customerId, typ, fields, periodKey, runFields, runId, doneAtgarder, uppdragId }) {
    const existing = document.getElementById('uppdrag-complete-modal');
    if (existing) existing.remove();

    const { riskOn, riskValda, done: storedDone } = getRiskState(fields || {}, runFields || {});
    const done = Array.isArray(doneAtgarder) && doneAtgarder.length ? doneAtgarder : storedDone;
    if (riskOn && riskValda.length && !riskAtgarderAllChecked(riskValda, done)) {
      alert('Bocka i alla åtgärder enligt kundens riskbedömning innan du klarmarkerar körningen.');
      return;
    }

    const modal = document.createElement('div');
    modal.id = 'uppdrag-complete-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-box" style="max-width:720px; width:96vw; max-height:90vh;">
        <div class="modal-header">
          <h3><i class="fas fa-check-circle"></i> Klarmarkera: ${esc(uppdragDisplayName(typ, fields))}</h3>
          <button class="modal-close" type="button" onclick="document.getElementById('uppdrag-complete-modal')?.remove()"><i class="fas fa-times"></i></button>
        </div>
        <div class="modal-body" style="overflow:auto;">
          ${riskOn && riskValda.length ? `
            <div class="uppdrag-riskbox" style="margin-top:0;">
              <div class="uppdrag-riskbox-title">Åtgärd enligt kundens riskbedömning</div>
              <div class="uppdrag-view-list" style="margin-top:0.5rem;">
                ${riskValda.map((a) => `<div class="uppdrag-view-list-item"><i class="fas fa-check"></i>${esc(a)}</div>`).join('')}
              </div>
              <div class="uppdrag-muted" style="margin-top:0.45rem;">Åtgärderna dokumenteras på denna körning.</div>
            </div>
          ` : `
            <div class="uppdrag-setup-desc" style="margin-top:0;">
              Vill du lämna en anteckning till denna körning? (valfritt)
            </div>
          `}

          <div class="form-group" style="margin-top:0.75rem;">
            <label>Anteckning</label>
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
      const confirmBtn = document.getElementById('uppdrag-complete-confirm');
      if (confirmBtn?.dataset.busy === '1') return;
      try {
        if (confirmBtn) {
          confirmBtn.dataset.busy = '1';
          confirmBtn.disabled = true;
          confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sparar...';
        }
        const note = (document.getElementById('uppdrag-complete-note')?.value || '').trim();
        if (riskOn && riskValda.length && !riskAtgarderAllChecked(riskValda, done)) {
          alert('Bocka i alla åtgärder enligt kundens riskbedömning innan du klarmarkerar körningen.');
          if (confirmBtn) {
            confirmBtn.dataset.busy = '0';
            confirmBtn.disabled = false;
            confirmBtn.innerHTML = '<i class="fas fa-check"></i> Klarmarkera';
          }
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
            await savePtlUnderlagOnly(customerId, typ, uploaded, uppdragId);
          }
        }

        const res = await fetch(`${baseUrl}/api/uppdrag/complete`, {
          method: 'POST',
          ...getAuthOpts(),
          body: JSON.stringify({
            customerId,
            typ,
            note,
            ...(periodKey ? { periodKey: String(periodKey).trim() } : {}),
            ...(uppdragId ? { uppdragId } : {}),
            ...(done.length ? { riskAtgarder: done } : (riskValda.length ? { riskAtgarder: riskValda.map((text) => ({ text })) } : {}))
          })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

        document.getElementById('uppdrag-complete-modal')?.remove();
        applyCompleteLocally({
          uppdragId,
          periodKey,
          runId,
          nextDeadline: data.nextDeadline || null,
          doneAt: (data.record?.fields?.['Senast utförd'] || '').toString().slice(0, 10) || null
        });
        // Bakgrundsuppdatering utan att tömma boarden
        load({ quiet: true });
      } catch (e) {
        alert('Kunde inte klarmarkera: ' + (e.message || 'fel'));
        if (confirmBtn) {
          confirmBtn.dataset.busy = '0';
          confirmBtn.disabled = false;
          confirmBtn.innerHTML = '<i class="fas fa-check"></i> Klarmarkera';
        }
      }
    });
  }

  function applyCompleteLocally({ uppdragId, periodKey, runId, nextDeadline, doneAt }) {
    const uid = String(uppdragId || '').trim();
    const pk = String(periodKey || '').trim();
    const rid = String(runId || '').trim();
    if (rid) {
      const rr = allRunRecords.find((r) => r && r.id === rid);
      if (rr) rr.fields = { ...(rr.fields || {}), Status: 'Klar' };
    } else if (uid && pk) {
      for (const rr of allRunRecords) {
        const f = rr?.fields || {};
        if (String(f['Uppdrag ID'] || '') === uid && String(f['PeriodKey'] || '') === pk) {
          rr.fields = { ...f, Status: 'Klar' };
        }
      }
    }
    if (uid) {
      const ur = allRecords.find((r) => r && r.id === uid);
      if (ur) {
        const patch = { ...(ur.fields || {}) };
        if (nextDeadline) patch['Nästa deadline'] = nextDeadline;
        if (doneAt) patch['Senast utförd'] = doneAt;
        ur.fields = patch;
      }
    }
    runsByUppdragId = indexRunsByUppdrag(allRunRecords);
    render();
  }

  function render() {
    const runLabel = (viewMode === 'open')
      ? 'Deadline'
      : (activeType === LONE_TAB
        ? 'Lönekörning'
        : (activeType === 'Momsredovisning' ? 'Momsperiod'
          : (activeType === 'Bokslut' ? 'Bokslut'
            : (activeType === 'Deklaration' ? 'Deklaration' : 'Uppdrag'))));
    if (els.colRun) els.colRun.textContent = runLabel;

    const instances = (viewMode === 'open') ? buildOpenInstances(allRecords) : buildInstances(allRecords);
    const filtered = (viewMode === 'open')
      ? instances
          .filter(x => matchesActiveType(x?.typ, x?.record))
          .filter(x => recordMatchesSearch(x.record))
          .filter(x => x.month === monthKey(monthCursor))
          .filter(x => matchesStatusFilter(x))
          .sort((a, b) => String(a.deadline || '').localeCompare(String(b.deadline || '')))
      : instances
          .filter(x => matchesActiveType(x?.typ, x?.record))
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
      const customName = isOvrigaTyp(x.typ) ? uppdragDisplayName(x.typ, f) : '';
      const runName = (x.typ === 'Momsredovisning' && window.MomsPeriod)
        ? MomsPeriod.runTitle(periodKey, MomsPeriod.inferFreq(freq, periodKey, null), x.month)
        : (customName
          ? (String(x.periodLabel || x.deadline || '').trim() ? `${customName} · ${String(x.periodLabel || x.deadline).slice(0, 10)}` : customName)
          : String(x.periodLabel || '').trim());
      const showRunName = (isLoneTyp(x.typ) || x.typ === 'Momsredovisning' || isOvrigaTyp(x.typ)) && runName;
      const runStatus = runStatusForInstance(x);
      const isKlar = done || runStatus === 'Klar';
      const attention = attentionForInstance(x, runStatus, done);
      const pillTone = isKlar
        ? 'is-done'
        : (attention === 'overdue' ? 'is-overdue' : (attention === 'due-soon' ? 'is-due-soon' : ''));
      const rowTone = attention === 'overdue'
        ? 'is-overdue'
        : (attention === 'due-soon' ? 'is-due-soon' : (isKlar ? 'is-done' : ''));
      const attentionHint = attention === 'overdue'
        ? '<div class="uppdragboard-deadline-hint is-overdue">Försenad</div>'
        : (attention === 'due-soon'
          ? '<div class="uppdragboard-deadline-hint is-due-soon">Deadline inom 5 dagar</div>'
          : '');
      const runPill = (viewMode === 'open')
        ? `<span class="uppdragboard-progress ${pillTone}">${esc(String(x.deadline || '–'))}</span>`
        : (showRunName)
          ? `<span class="uppdragboard-progress ${pillTone}" title="Klart senast ${esc(String(x.deadline || ''))}">${esc(runName)}</span>`
          : `<span class="uppdragboard-progress ${pillTone}">${done} / 1</span>`;
      const runCell = `<div class="uppdragboard-runcell">${runPill}${attentionHint}</div>`;

      const rutin = (f['Rutin'] || '').toString().trim();
      const runningNote = (f['Anteckning för denna körning'] || f['Anteckning'] || '').toString();
      const hasRunningNote = !!String(runningNote || '').trim();
      const runId = String(x.runRec?.id || '').trim();
      const { riskValda, done: riskDone } = getRiskState(f, x.runRec?.fields || {});
      const doneSet = new Set((riskDone || []).map((a) => String(a.text || '').toLowerCase()));
      const riskLocked = runStatus === 'Klar';
      const riskList = Array.isArray(riskValda) && riskValda.length
        ? `<div class="uppdrag-riskbox-items" data-risk-box="${esc(x.key)}">
            ${riskValda.slice(0, 20).map((a) => {
              const checked = doneSet.has(String(a).toLowerCase());
              return `<label class="uppdrag-risk-check">
                <input type="checkbox" data-action="toggle-risk-atgard" data-key="${esc(x.key)}" data-run-id="${esc(runId)}" value="${esc(a)}" ${checked ? 'checked' : ''} ${riskLocked ? 'disabled' : ''}>
                <span>${esc(a)}</span>
              </label>`;
            }).join('')}
            <div class="uppdrag-muted" data-risk-status-for="${esc(x.key)}" style="margin-top:0.35rem;"></div>
          </div>`
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
        <tr class="uppdragboard-row ${rowTone}" data-key="${esc(x.key)}" data-customer-id="${esc(kundId)}" data-typ="${esc(String(x.typ || ''))}">
          <td class="uppdragboard-client">
            ${link ? `<a class="uppdragboard-link" href="${esc(link)}">${esc(kundLabel)}</a>` : esc(kundLabel)}
          </td>
          <td>${runCell}</td>
          <td>
            <button type="button" class="uppdragboard-donebtn ${done ? 'is-done' : ''}" data-action="done" data-customer-id="${esc(kundId)}" data-typ="${esc(String(x.typ || ''))}" data-period-key="${esc(periodKey)}" data-run-id="${esc(runId)}" title="Klarmarkera">
              <i class="fas fa-check"></i>
            </button>
          </td>
          <td class="uppdragboard-arrow"><button type="button" class="uppdragboard-expandbtn" data-action="toggle" title="Visa mer"><i class="fas fa-chevron-down"></i></button></td>
        </tr>
        <tr class="uppdragboard-details" data-details-for="${esc(x.key)}" style="display:none;">
          <td colspan="4">
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
    }).join('') || `<tr><td colspan="4" class="uppdragboard-empty">Inga uppdrag för vald månad.</td></tr>`;

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
        const inst = filtered.find((it) => String(it.key) === String(key));
        const rec = (inst?.record)
          || allRecords.find(x => String(x?.fields?.['Kund ID'] || '') === String(customerId) && String(x?.fields?.['Typ'] || '') === String(rowTyp));
        const runId = doneBtn?.getAttribute('data-run-id') || '';
        const box = tbodyEl.querySelector(`[data-risk-box="${CSS.escape(key)}"]`);
        const checkedFromDom = box
          ? Array.from(box.querySelectorAll('input[data-action="toggle-risk-atgard"]:checked')).map((i) => ({ text: i.value }))
          : [];
        const runFields = inst?.runRec?.fields || {};
        const { riskOn, riskValda, done: storedDone } = getRiskState(rec?.fields || {}, runFields);
        const doneAtgarder = checkedFromDom.length ? checkedFromDom : storedDone;
        if (riskOn && riskValda.length && !riskAtgarderAllChecked(riskValda, doneAtgarder)) {
          if (details) details.style.display = '';
          row.classList.add('is-open');
          alert('Bocka i alla åtgärder enligt kundens riskbedömning innan du klarmarkerar körningen.');
          return;
        }
        showCompleteModal({
          customerId,
          typ: rowTyp,
          fields: rec?.fields || {},
          periodKey,
          runFields,
          runId,
          doneAtgarder,
          uppdragId: rec?.id || ''
        });
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

    tbodyEl.querySelectorAll('[data-action="toggle-risk-atgard"]').forEach((cb) => {
      cb.addEventListener('change', async (e) => {
        e.stopPropagation();
        const key = cb.getAttribute('data-key') || '';
        const runId = cb.getAttribute('data-run-id') || '';
        const box = tbodyEl.querySelector(`[data-risk-box="${CSS.escape(key)}"]`);
        const statusEl = tbodyEl.querySelector(`[data-risk-status-for="${CSS.escape(key)}"]`);
        const items = box
          ? Array.from(box.querySelectorAll('input[data-action="toggle-risk-atgard"]:checked')).map((i) => ({ text: i.value, checked: true }))
          : [];
        if (!runId) {
          if (statusEl) statusEl.textContent = 'Sparas när körningen klarmarkeras.';
          return;
        }
        if (statusEl) statusEl.textContent = 'Sparar...';
        try {
          const res = await fetch(`${baseUrl}/api/uppdrag/runs/${encodeURIComponent(runId)}/risk-atgarder`, {
            method: 'PATCH',
            ...getAuthOpts(),
            body: JSON.stringify({ items })
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
          const inst = filtered.find((it) => String(it.key) === String(key));
          if (inst?.runRec) {
            inst.runRec.fields = inst.runRec.fields || {};
            inst.runRec.fields['Riskåtgärder utförda'] = JSON.stringify(data.riskAtgarder || items);
          }
          if (statusEl) statusEl.textContent = data.warning ? String(data.warning) : 'Sparat.';
          setTimeout(() => { if (statusEl && statusEl.textContent === 'Sparat.') statusEl.textContent = ''; }, 2000);
        } catch (err) {
          if (statusEl) statusEl.textContent = 'Kunde inte spara: ' + (err.message || 'fel');
        }
      });
    });

    if (els.title) els.title.textContent = (activeType === 'Momsredovisning') ? 'Momsuppdrag'
      : (activeType === 'Bokslut') ? 'Bokslutsuppdrag'
      : (activeType === 'Deklaration') ? 'Deklarationsuppdrag'
      : (activeType === OVRIGA_TAB) ? 'Övriga uppdrag'
      : 'Löneuppdrag';
    if (els.month) els.month.textContent = monthLabel(monthCursor);
  }

  function fetchWithTimeout(url, init = {}, ms = 25000) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    const merged = { ...init, signal: ctrl.signal };
    return fetch(url, merged).finally(() => clearTimeout(timer));
  }

  async function load(opts = {}) {
    const quiet = !!opts.quiet;
    if (!(window.AuthManager && AuthManager.getCurrentUser && AuthManager.getCurrentUser())) {
      setVisible(els.loading, false);
      setVisible(els.content, false);
      setVisible(els.noAuth, true);
      return;
    }

    setVisible(els.noAuth, false);
    if (!quiet) {
      setVisible(els.loading, true);
      setVisible(els.content, false);
    }

    try {
      const mine = scope === 'mine' ? '1' : '0';
      const res = await fetchWithTimeout(`${baseUrl}/api/uppdrag/byra?mine=${mine}`, getAuthOpts(), 25000);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      allRecords = Array.isArray(data.records) ? data.records : [];
      allRunRecords = Array.isArray(data.runs) ? data.runs : [];
      runsByUppdragId = indexRunsByUppdrag(allRunRecords);
      render();
      setVisible(els.loading, false);
      setVisible(els.content, true);
    } catch (e) {
      const aborted = e && (e.name === 'AbortError' || /aborted/i.test(String(e.message || '')));
      console.error('❌ Uppdrag översikt:', e);
      if (!quiet) {
        tbodyEl.innerHTML = `<tr><td colspan="4" class="uppdragboard-empty">${aborted
          ? 'Hämtningen tog för lång tid. Ladda om sidan eller prova igen om en stund.'
          : `Kunde inte ladda uppdrag: ${esc(e.message || 'fel')}`}</td></tr>`;
      }
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

