'use strict';

function toIsoDate(value) {
  const s = String(value == null ? '' : value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
}

function addDaysIso(dateIso, days) {
  const s = toIsoDate(dateIso);
  if (!s) return '';
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d + (Number(days) || 0));
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function isWeeklyFreq(freq) {
  const f = String(freq || '').toLowerCase();
  return f.includes('veck');
}

function weeklyRunAtIndex({ startIso, deadlineIso, index } = {}) {
  const i = Number(index) || 0;
  const deadline0 = toIsoDate(deadlineIso);
  const start0 = toIsoDate(startIso);
  if (!deadline0 || i < 0) return null;
  const deadline = i === 0 ? deadline0 : addDaysIso(deadline0, i * 7);
  if (!deadline) return null;
  let start = '';
  if (start0) start = i === 0 ? start0 : addDaysIso(start0, i * 7);
  else start = addDaysIso(deadline, -6);
  return {
    periodKey: deadline,
    periodLabel: deadline,
    deadlineIso: deadline,
    startIso: start || undefined
  };
}

function weeklyRunsThroughHorizon({ startIso, deadlineIso, horizonEnd, maxRuns } = {}) {
  const first = weeklyRunAtIndex({ startIso, deadlineIso, index: 0 });
  if (!first) return [];
  const out = [first];
  const limit = Number.isFinite(maxRuns) ? maxRuns : 60;
  const horizon = toIsoDate(horizonEnd);
  for (let i = 1; i < limit; i++) {
    const run = weeklyRunAtIndex({ startIso, deadlineIso, index: i });
    if (!run) break;
    if (horizon && run.deadlineIso > horizon) break;
    out.push(run);
  }
  return out;
}

module.exports = {
  toIsoDate,
  addDaysIso,
  isWeeklyFreq,
  weeklyRunAtIndex,
  weeklyRunsThroughHorizon
};
