/**
 * Lönekörningar – namngivning och perioder för innevarande/efterhand.
 * Delas av kundkort, uppdrag-oversikt; speglas i index.js på servern.
 */
(function (global) {
    const TYP_LEGACY = 'Löneuppdrag';
    const TYP_INNEVARANDE = 'Löneuppdrag innevarande';
    const TYP_EFTERHAND = 'Löneuppdrag efterhand';
    const MONTHS_SV = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december'];

    function pad2(n) {
        return String(n).padStart(2, '0');
    }

    function toDateStr(iso) {
        const s = String(iso || '').slice(0, 10);
        return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
    }

    function parseYm(ym) {
        const m = String(ym || '').match(/^(\d{4})-(\d{2})$/);
        if (!m) return null;
        const year = parseInt(m[1], 10);
        const month = parseInt(m[2], 10);
        if (!Number.isFinite(year) || month < 1 || month > 12) return null;
        return { year, month };
    }

    function monthAdd(ym, delta) {
        const p = parseYm(ym);
        if (!p) return null;
        const d = new Date(Date.UTC(p.year, p.month - 1 + (delta || 0), 1));
        return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;
    }

    function monthNameOnly(ym) {
        const p = parseYm(ym);
        if (!p) return '';
        return MONTHS_SV[p.month - 1] || '';
    }

    function dayFromIso(iso, fallback) {
        const d = parseInt(String(iso || '').slice(8, 10), 10);
        return (Number.isFinite(d) && d >= 1 && d <= 28) ? d : (fallback || 15);
    }

    function isoWithDay(ym, day) {
        const p = parseYm(ym);
        if (!p) return '';
        const last = new Date(p.year, p.month, 0).getDate();
        const dd = Math.min(Math.max(1, day), Math.min(last, 28));
        return `${p.year}-${pad2(p.month)}-${pad2(dd)}`;
    }

    function isLoneTyp(typ) {
        const t = String(typ || '').trim();
        return t === TYP_LEGACY || t === TYP_INNEVARANDE || t === TYP_EFTERHAND;
    }

    function isInnevarande(typ) {
        const t = String(typ || '').trim();
        return t === TYP_INNEVARANDE;
    }

    function isEfterhand(typ) {
        const t = String(typ || '').trim();
        return t === TYP_EFTERHAND || t === TYP_LEGACY;
    }

    function displayLabel(payoutYm, typ) {
        const name = monthNameOnly(payoutYm);
        if (!name) return 'Lönekörning';
        if (isInnevarande(typ)) return `Lön som ska utbetalas i ${name}`;
        return `Lön som utbetals i ${name}`;
    }

    /** En körning utifrån mall (första start/deadline) och månadsindex (0 = första körningen). */
    function buildRun(runIndex, templateStartIso, templateDeadlineIso, typ) {
        const startTpl = toDateStr(templateStartIso);
        const deadlineTpl = toDateStr(templateDeadlineIso);
        if (!startTpl || !deadlineTpl) return null;
        const anchorYm = startTpl.slice(0, 7);
        const workYm = monthAdd(anchorYm, runIndex);
        if (!workYm) return null;
        const startDay = dayFromIso(startTpl, 1);
        const deadlineDay = dayFromIso(deadlineTpl, 15);
        const startIso = isoWithDay(workYm, startDay);
        const deadlineIso = isoWithDay(workYm, deadlineDay);
        const payoutYm = isInnevarande(typ) ? workYm : monthAdd(workYm, -1);
        if (!payoutYm) return null;
        return {
            runIndex,
            periodKey: payoutYm,
            periodLabel: displayLabel(payoutYm, typ),
            startIso,
            deadlineIso,
            payoutYm,
            workYm
        };
    }

    /** Rullande fönster: alla körningar t.o.m. deadline-månad = todayYm + 11 månader. */
    function runsThroughHorizon(templateStartIso, templateDeadlineIso, typ, todayYm) {
        const horizonYm = monthAdd(String(todayYm || '').slice(0, 7), 11);
        if (!horizonYm) return [];
        const runs = [];
        for (let i = 0; i < 120; i++) {
            const run = buildRun(i, templateStartIso, templateDeadlineIso, typ);
            if (!run) break;
            if (run.deadlineIso.slice(0, 7) > horizonYm) break;
            runs.push(run);
        }
        return runs;
    }

    function periodKeyFromDeadline(deadlineIso, typ) {
        const dl = toDateStr(deadlineIso);
        if (!dl) return '';
        const workYm = dl.slice(0, 7);
        if (isInnevarande(typ)) return workYm;
        return monthAdd(workYm, -1) || workYm;
    }

    function deadlineIsoFromPeriodKey(periodKey, typ, refDeadline) {
        const pk = String(periodKey || '').trim();
        if (!/^\d{4}-\d{2}$/.test(pk)) return '';
        const day = dayFromIso(refDeadline, 15);
        if (isInnevarande(typ)) return isoWithDay(pk, day);
        const workYm = monthAdd(pk, 1);
        return workYm ? isoWithDay(workYm, day) : '';
    }

    function startIsoFromPeriodKey(periodKey, typ, refStart) {
        const pk = String(periodKey || '').trim();
        if (!/^\d{4}-\d{2}$/.test(pk)) return '';
        const day = dayFromIso(refStart, 1);
        if (isInnevarande(typ)) return isoWithDay(pk, day);
        const workYm = monthAdd(pk, 1);
        return workYm ? isoWithDay(workYm, day) : '';
    }

    global.LonePeriod = {
        TYP_LEGACY,
        TYP_INNEVARANDE,
        TYP_EFTERHAND,
        isLoneTyp,
        isInnevarande,
        isEfterhand,
        displayLabel,
        buildRun,
        runsThroughHorizon,
        periodKeyFromDeadline,
        deadlineIsoFromPeriodKey,
        startIsoFromPeriodKey,
        monthAdd,
        monthNameOnly,
        toDateStr
    };
})(typeof window !== 'undefined' ? window : global);
