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

function yearlyRunAtIndex({ startIso, deadlineIso, index } = {}) {
  const i = Number(index) || 0;
  const deadline0 = toIsoDate(deadlineIso);
  const start0 = toIsoDate(startIso);
  if (!deadline0 || i < 0) return null;
  const deadline = i === 0 ? deadline0 : addYearsIso(deadline0, i);
  if (!deadline) return null;
  let start = '';
  if (start0) start = i === 0 ? start0 : addYearsIso(start0, i);
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

module.exports = {
  toIsoDate,
  addYearsIso,
  isYearlyFreq,
  yearlyRunAtIndex,
  yearlyRunsThroughHorizon
};
