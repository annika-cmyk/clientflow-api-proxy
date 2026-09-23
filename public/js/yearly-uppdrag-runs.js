/**
 * Årsvisa uppdragskörningar: behåll arbetsfönstrets månad/dag och flytta
 * både start och deadline ett år per körning.
 */
(function (global) {
  'use strict';

  function toIsoDate(value) {
    const s = String(value == null ? '' : value).slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
  }

  function addYearsIso(dateIso, years) {
    const s = toIsoDate(dateIso);
    if (!s) return '';
    const [y, m, d] = s.split('-').map(Number);
    const dt = new Date(y + (Number(years) || 0), m - 1, d);
    const yy = dt.getFullYear();
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    const dd = String(dt.getDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
  }

  function isYearlyFreq(freq) {
    const f = String(freq || '').toLowerCase();
    return f.includes('årsvis') || f.includes('år');
  }

  /**
   * Om mallens startdatum halkat efter en framflyttad deadline (t.ex. start 2025-10-01
   * med deadline 2027-03-31) flyttas starten fram årsvis tills den ligger i
   * arbetsfönstret före deadline — utan att ändra månad/dag.
   */
  function alignYearlyStartToDeadline(startIso, deadlineIso) {
    const deadline = toIsoDate(deadlineIso);
    let start = toIsoDate(startIso);
    if (!deadline) return '';
    if (!start) return addYearsIso(deadline, -1);
    for (let i = 0; i < 40 && start > deadline; i++) {
      start = addYearsIso(start, -1);
      if (!start) return '';
    }
    for (let i = 0; i < 40; i++) {
      const next = addYearsIso(start, 1);
      if (!next || next > deadline) break;
      start = next;
    }
    return start;
  }

  function advanceYearlyTemplate({ startIso, deadlineIso } = {}) {
    const deadline0 = toIsoDate(deadlineIso);
    if (!deadline0) return null;
    const start0 = alignYearlyStartToDeadline(startIso, deadline0);
    return {
      deadlineIso: addYearsIso(deadline0, 1),
      startIso: start0 ? addYearsIso(start0, 1) : ''
    };
  }

  function yearlyRunAtIndex({ startIso, deadlineIso, index } = {}) {
    const i = Number(index) || 0;
    const deadline0 = toIsoDate(deadlineIso);
    if (!deadline0 || i < 0) return null;
    const startAligned = alignYearlyStartToDeadline(startIso, deadline0);
    const deadline = i === 0 ? deadline0 : addYearsIso(deadline0, i);
    if (!deadline) return null;
    let start = '';
    if (startAligned) start = i === 0 ? startAligned : addYearsIso(startAligned, i);
    else start = addYearsIso(deadline, -1);
    return {
      periodKey: deadline.slice(0, 4),
      periodLabel: deadline.slice(0, 4),
      deadlineIso: deadline,
      startIso: start || undefined
    };
  }

  function yearlyRunsThroughHorizon({ startIso, deadlineIso, freq, horizonEnd, maxRuns } = {}) {
    const first = yearlyRunAtIndex({ startIso, deadlineIso, index: 0 });
    if (!first) return [];
    const out = [first];
    if (!isYearlyFreq(freq)) return out;
    const limit = Number.isFinite(maxRuns) ? maxRuns : 40;
    const horizon = toIsoDate(horizonEnd);
    for (let i = 1; i < limit; i++) {
      const run = yearlyRunAtIndex({ startIso, deadlineIso, index: i });
      if (!run) break;
      if (horizon && run.deadlineIso > horizon) break;
      out.push(run);
    }
    return out;
  }

  const api = {
    toIsoDate,
    addYearsIso,
    isYearlyFreq,
    alignYearlyStartToDeadline,
    advanceYearlyTemplate,
    yearlyRunAtIndex,
    yearlyRunsThroughHorizon
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  global.YearlyUppdragRuns = api;
})(typeof window !== 'undefined' ? window : globalThis);
