/**
 * Momsperioder enligt Skatteverket (deklarationsdag 12:e, 17:e i jan/aug).
 * Delas av kundkort (uppdrag) och kan speglas i index.js på servern.
 */
(function (global) {
    const MONTHS_SV = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december'];

    function pad2(n) {
        return String(n).padStart(2, '0');
    }

    function parseYm(ym) {
        const m = String(ym || '').match(/^(\d{4})-(\d{2})$/);
        if (!m) return null;
        const year = parseInt(m[1], 10);
        const month = parseInt(m[2], 10);
        if (!Number.isFinite(year) || month < 1 || month > 12) return null;
        return { year, month };
    }

    function parseQuarterKey(qKey) {
        const m = String(qKey || '').match(/^(\d{4})-Q([1-4])$/i);
        if (!m) return null;
        return { year: parseInt(m[1], 10), quarter: parseInt(m[2], 10) };
    }

    function monthAdd(ym, delta) {
        const p = parseYm(ym);
        if (!p) return null;
        const d = new Date(Date.UTC(p.year, p.month - 1 + (delta || 0), 1));
        return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;
    }

    function quarterAdd(qKey, delta) {
        const p = parseQuarterKey(qKey);
        if (!p) return null;
        let { year, quarter } = p;
        quarter += (delta || 0);
        while (quarter > 4) { quarter -= 4; year += 1; }
        while (quarter < 1) { quarter += 4; year -= 1; }
        return `${year}-Q${quarter}`;
    }

    /** Sista dag i momsperiod = kalendermånad (månad) eller kvartalets sista månad. */
    function periodEndFromKey(periodKey, freq) {
        const f = String(freq || '').toLowerCase();
        if (f.includes('kvartal')) {
            const q = parseQuarterKey(periodKey);
            if (!q) return null;
            return { year: q.year, month: q.quarter * 3 };
        }
        const ym = parseYm(periodKey);
        if (ym) return ym;
        return null;
    }

    /** Startdatum = 1:a i månaden efter momsperiodens utgång. */
    function startIsoFromPeriodKey(periodKey, freq) {
        const end = periodEndFromKey(periodKey, freq);
        if (!end) return '';
        let y = end.year;
        let m = end.month + 1;
        if (m > 12) { m = 1; y += 1; }
        return `${y}-${pad2(m)}-01`;
    }

    /** SKV: 12:e i deadline-månaden, utom januari och augusti → 17:e. */
    function deadlineIsoFromPeriodKey(periodKey, freq) {
        const end = periodEndFromKey(periodKey, freq);
        if (!end) return '';
        let y = end.year;
        let m = end.month + 1;
        if (m > 12) { m = 1; y += 1; }
        const day = (m === 1 || m === 8) ? 17 : 12;
        return `${y}-${pad2(m)}-${pad2(day)}`;
    }

    function monthNameOnly(ym) {
        const p = parseYm(ym);
        if (!p) return '';
        return MONTHS_SV[p.month - 1] || '';
    }

    function displayLabel(periodKey, freq) {
        const f = String(freq || '').toLowerCase();
        if (f.includes('kvartal')) {
            const q = parseQuarterKey(periodKey);
            if (q) return `Moms Q${q.quarter}`;
        }
        const name = monthNameOnly(periodKey);
        if (name) return `Momsperiod ${name}`;
        return 'Momsredovisning';
    }

    /** Arbetsfönster (YYYY-MM) för en momsperiod: från månaden efter periodens slut t.o.m. deadline-månad. */
    function workWindowYm(periodKey, freq) {
        const startIso = startIsoFromPeriodKey(periodKey, freq);
        const deadlineIso = deadlineIsoFromPeriodKey(periodKey, freq);
        if (!startIso || !deadlineIso) return null;
        return {
            startYm: startIso.slice(0, 7),
            deadlineYm: deadlineIso.slice(0, 7)
        };
    }

    /** Kvartalsmoms: periodnyckel från deadline-månad (månaden efter kvartalets slut). */
    function periodKeyFromDeadlineYm(deadlineYm, freq) {
        const f = String(freq || '').toLowerCase();
        if (!f.includes('kvartal')) return '';
        const p = parseYm(deadlineYm);
        if (!p) return '';
        if (p.month === 1) return `${p.year - 1}-Q4`;
        const quarter = Math.ceil((p.month - 1) / 3);
        return quarter >= 1 && quarter <= 4 ? `${p.year}-Q${quarter}` : '';
    }

    /**
     * Periodnyckel som är öppen i vald brädemånad.
     * Kvartal: moms Q2 (apr–jun) syns i juli–deadline, inte under Q2.
     * Månad: perioden är månaden före arbetsfönstret (t.ex. jan-moms i februari).
     */
    function defaultPeriodKeyForBoard(boardYm, freq) {
        const ym = String(boardYm || '').trim();
        const f = String(freq || '').toLowerCase();
        if (!/^\d{4}-\d{2}$/.test(ym)) return '';
        const y = Number(ym.slice(0, 4));
        if (!y) return '';
        if (f.includes('kvartal')) {
            for (const qy of [y - 1, y, y + 1]) {
                for (let q = 1; q <= 4; q++) {
                    const pk = `${qy}-Q${q}`;
                    const win = workWindowYm(pk, freq);
                    if (win && ym >= win.startYm && ym <= win.deadlineYm) return pk;
                }
            }
            return '';
        }
        if (f.includes('år')) return String(y);
        return monthAdd(ym, -1) || ym;
    }

    /** Visningsnamn för moms-körning; faller tillbaka till aktiv period i brädemånad vid ogiltig PeriodKey. */
    function runTitle(periodKey, freq, boardYm) {
        const pk = String(periodKey || '').trim();
        if (pk) {
            const computed = displayLabel(pk, freq);
            if (computed !== 'Momsredovisning') return computed;
        }
        const defaultKey = defaultPeriodKeyForBoard(boardYm, freq);
        return defaultKey ? displayLabel(defaultKey, freq) : 'Momsredovisning';
    }

    function inferFreq(freqRaw, periodKey, runRecords) {
        const f = String(freqRaw || '').trim();
        if (f && f !== '—') return f;
        const runs = Array.isArray(runRecords) ? runRecords : [];
        const rr = runs.find((r) => String(r?.fields?.['Typ'] || '').trim() === 'Momsredovisning');
        const rf = String(rr?.fields?.['Frekvens'] || '').trim();
        if (rf) return rf;
        const pk = String(periodKey || '').trim();
        if (/^\d{4}-Q[1-4]$/i.test(pk)) return 'Varje kvartal';
        // YYYY-MM utan sparad frekvens är tvetydigt (brädans kalendermånad) — anta kvartalsmoms.
        return 'Varje kvartal';
    }

    function currentQuarterFromYm(yyyyMm) {
        const p = parseYm(yyyyMm);
        if (!p) return null;
        return { year: p.year, quarter: Math.ceil(p.month / 3) };
    }

    /** Första momsperiod från sparad nyckel eller startdatum (månaden/kvartalet före arbetsfönstret). */
    function inferFirstPeriod(fields, freq) {
        const stored = String(fields?.['Första period'] || fields?.forstaPeriod || '').trim();
        if (stored) return stored;
        const start = String(fields?.['Startdatum'] || fields?.startdatum || '').slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return '';
        const f = String(freq || '').toLowerCase();
        if (f.includes('kvartal')) {
            const q = currentQuarterFromYm(start.slice(0, 7));
            if (!q) return '';
            let qq = q.quarter - 1;
            let yy = q.year;
            if (qq <= 0) { qq = 4; yy -= 1; }
            return `${yy}-Q${qq}`;
        }
        return monthAdd(start.slice(0, 7), -1) || '';
    }

    /** Rullande fönster: alla körningar t.o.m. deadline-månad = todayYm + 11 månader. */
    function runsThroughHorizon(firstPeriodKey, freq, todayYm) {
        const f = String(freq || '').toLowerCase();
        const isQ = f.includes('kvartal');
        const horizonYm = monthAdd(String(todayYm || '').slice(0, 7), 11);
        if (!horizonYm || !firstPeriodKey) return [];
        const runs = [];
        let pk = firstPeriodKey;
        for (let i = 0; i < 120; i++) {
            if (!pk) break;
            const meta = runMeta(pk, freq);
            if (!meta.deadlineIso) break;
            if (meta.deadlineIso.slice(0, 7) > horizonYm) break;
            runs.push({
                runIndex: i,
                periodKey: pk,
                periodLabel: meta.periodLabel,
                startIso: meta.startIso,
                deadlineIso: meta.deadlineIso
            });
            pk = isQ ? quarterAdd(pk, 1) : monthAdd(pk, 1);
        }
        return runs;
    }

    function runMeta(periodKey, freq) {
        return {
            periodKey,
            periodLabel: displayLabel(periodKey, freq),
            startIso: startIsoFromPeriodKey(periodKey, freq),
            deadlineIso: deadlineIsoFromPeriodKey(periodKey, freq)
        };
    }

    function isMonthlyFreq(freq) {
        return String(freq || '').toLowerCase().includes('månad');
    }

    function isQuarterlyFreq(freq) {
        return String(freq || '').toLowerCase().includes('kvartal');
    }

    /** Lista periodnycklar: 12 månader eller 4 kvartal framåt från första. */
    function periodKeysAhead(firstPeriodKey, freq, count) {
        const f = String(freq || '').toLowerCase();
        const n = count || (f.includes('kvartal') ? 4 : 12);
        const keys = [];
        let pk = firstPeriodKey;
        for (let i = 0; i < n; i++) {
            if (!pk) break;
            keys.push(pk);
            pk = f.includes('kvartal') ? quarterAdd(pk, 1) : monthAdd(pk, 1);
        }
        return keys;
    }

    function currentYm() {
        const d = new Date();
        return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
    }

    function quarterOptionsForYear(year) {
        const y = year || new Date().getFullYear();
        return [1, 2, 3, 4].map((q) => ({ value: `${y}-Q${q}`, label: `Q${q} ${y}` }));
    }

    function monthOptionsAroundNow() {
        const base = currentYm();
        const opts = [];
        for (let i = -3; i <= 14; i++) {
            const ym = monthAdd(base, i);
            if (!ym) continue;
            const p = parseYm(ym);
            opts.push({
                value: ym,
                label: `${MONTHS_SV[p.month - 1]} ${p.year}`
            });
        }
        return opts;
    }

    /** Visa körning i vald kalendermånad (bräda): från månaden efter momsperiod t.o.m. deadline, plus försenade. */
    function runVisibleInBoardMonth(runFields, boardYm, todayIso) {
        const status = String(runFields?.Status || '').trim();
        if (status === 'Klar') return false;
        const pk = String(runFields?.PeriodKey || '').trim();
        const deadline = String(runFields?.Deadline || '').trim().slice(0, 10);
        const freq = runFields?.Frekvens || 'Varje månad';
        if (!pk || !boardYm) return false;
        const win = workWindowYm(pk, freq);
        if (!win) return false;
        const { startYm, deadlineYm } = win;
        const effectiveDeadlineYm = deadline ? deadline.slice(0, 7) : deadlineYm;
        if (boardYm >= startYm && boardYm <= effectiveDeadlineYm) return true;
        if (todayIso && deadline && todayIso > deadline && boardYm >= startYm) return true;
        return false;
    }

    const MomsPeriod = {
        parseYm,
        parseQuarterKey,
        monthAdd,
        quarterAdd,
        periodEndFromKey,
        startIsoFromPeriodKey,
        deadlineIsoFromPeriodKey,
        displayLabel,
        workWindowYm,
        periodKeyFromDeadlineYm,
        defaultPeriodKeyForBoard,
        runTitle,
        inferFreq,
        runMeta,
        isMonthlyFreq,
        isQuarterlyFreq,
        periodKeysAhead,
        currentYm,
        quarterOptionsForYear,
        monthOptionsAroundNow,
        runVisibleInBoardMonth,
        monthNameOnly,
        currentQuarterFromYm,
        inferFirstPeriod,
        runsThroughHorizon
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = MomsPeriod;
    } else {
        global.MomsPeriod = MomsPeriod;
    }
})(typeof window !== 'undefined' ? window : global);
