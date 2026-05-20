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
            if (q) return `Momsredovisning Q${q.quarter} ${q.year}`;
        }
        const name = monthNameOnly(periodKey);
        if (name) {
            const y = (periodKey || '').slice(0, 4);
            return `Momsredovisning ${name} ${y}`;
        }
        return 'Momsredovisning';
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

    /** Visa körning i vald kalendermånad (bräda): öppna perioder + försenade. */
    function runVisibleInBoardMonth(runFields, boardYm, todayIso) {
        const status = String(runFields?.Status || '').trim();
        if (status === 'Klar') return false;
        const pk = String(runFields?.PeriodKey || '').trim();
        const deadline = String(runFields?.Deadline || '').trim().slice(0, 10);
        const freq = runFields?.Frekvens || 'Varje månad';
        const startIso = startIsoFromPeriodKey(pk, freq);
        if (!pk || !boardYm || !startIso) return false;
        const startYm = startIso.slice(0, 7);
        const deadlineYm = deadline ? deadline.slice(0, 7) : startYm;
        if (boardYm >= startYm && boardYm <= deadlineYm) return true;
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
        runMeta,
        isMonthlyFreq,
        isQuarterlyFreq,
        periodKeysAhead,
        currentYm,
        quarterOptionsForYear,
        monthOptionsAroundNow,
        runVisibleInBoardMonth,
        monthNameOnly
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = MomsPeriod;
    } else {
        global.MomsPeriod = MomsPeriod;
    }
})(typeof window !== 'undefined' ? window : global);
