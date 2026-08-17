/**
 * Synlighet för uppdragskörningar i en vald period.
 * Visa om körningen är öppen i perioden, eller om deadline passerat och den inte är klar.
 */
(function (global) {
    function toDateStr(value) {
        const s = String(value == null ? '' : value).trim();
        if (!s) return '';
        const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
        return m ? m[1] : '';
    }

    function parseYm(value) {
        const s = String(value == null ? '' : value).trim();
        const m = s.match(/^(\d{4})-(\d{2})/);
        if (!m) return '';
        const month = Number(m[2]);
        if (month < 1 || month > 12) return '';
        return `${m[1]}-${m[2]}`;
    }

    function field(fields, keys) {
        const src = fields || {};
        for (let i = 0; i < keys.length; i++) {
            const raw = src[keys[i]];
            if (raw != null && String(raw).trim()) return raw;
        }
        return '';
    }

    function statusOf(fields) {
        return String(field(fields, ['Status', 'status'])).trim();
    }

    function isDoneStatus(status) {
        const st = String(status || '').trim();
        return st === 'Klar' || st === 'Avslutad';
    }

    function isYearlyAssignment(fields) {
        const typ = String(field(fields, ['Typ', 'type', 'assignmentType'])).trim();
        const freq = String(field(fields, ['Frekvens', 'frequency'])).toLowerCase();
        return typ === 'Bokslut' || typ === 'Deklaration' || freq.includes('år');
    }

    function isOpenInWindow(startIso, deadlineIso, ym) {
        const boardYm = parseYm(ym);
        if (!boardYm) return false;
        const startYm = parseYm(startIso);
        const dueYm = parseYm(deadlineIso);
        if (startYm && dueYm) {
            const from = startYm <= dueYm ? startYm : dueYm;
            const to = startYm <= dueYm ? dueYm : startYm;
            return boardYm >= from && boardYm <= to;
        }
        if (dueYm) return boardYm === dueYm;
        if (startYm) return boardYm === startYm;
        return false;
    }

    function isRunOpenInMonth(fields, ym) {
        const start = toDateStr(field(fields, ['Startdatum', 'startDate']));
        const deadline = toDateStr(field(fields, ['Deadline', 'deadline']));
        return isOpenInWindow(start, deadline, ym);
    }

    function isOverdueNotDone(fields, todayIso) {
        const today = toDateStr(todayIso);
        const deadline = toDateStr(field(fields, ['Deadline', 'Nästa deadline', 'deadline']));
        if (!deadline || !today) return false;
        if (isDoneStatus(statusOf(fields))) return false;
        return deadline < today;
    }

    function isAssignmentOpenInMonth(fields, ym) {
        const start = toDateStr(field(fields, ['Startdatum', 'startDate']));
        const deadline = toDateStr(field(fields, ['Nästa deadline', 'Deadline', 'deadline']));
        const boardYm = parseYm(ym);
        if (!boardYm) return false;
        const startYm = parseYm(start);
        if (startYm && boardYm < startYm) return false;
        if (isYearlyAssignment(fields)) {
            return isOpenInWindow(start, deadline, boardYm);
        }
        if (startYm) return boardYm >= startYm;
        return true;
    }

    function isAssignmentOverdueNotDone(fields, todayIso) {
        if (isDoneStatus(statusOf(fields))) return false;
        const today = toDateStr(todayIso);
        const deadline = toDateStr(field(fields, ['Nästa deadline', 'Deadline', 'deadline']));
        if (!deadline || !today) return false;
        return deadline < today;
    }

    function shouldShowRunInPeriod(fields, ym, todayIso) {
        return isRunOpenInMonth(fields, ym) || isOverdueNotDone(fields, todayIso);
    }

    function shouldShowAssignmentInPeriod(fields, ym, todayIso) {
        return isAssignmentOpenInMonth(fields, ym) || isAssignmentOverdueNotDone(fields, todayIso);
    }

    const api = {
        toDateStr,
        parseYm,
        isRunOpenInMonth,
        isOverdueNotDone,
        isAssignmentOpenInMonth,
        isAssignmentOverdueNotDone,
        shouldShowRunInPeriod,
        shouldShowAssignmentInPeriod
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    global.KoringVisibility = api;
})(typeof window !== 'undefined' ? window : globalThis);
