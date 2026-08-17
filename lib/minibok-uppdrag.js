/**
 * Minibok ↔ Clientflow Uppdrag API
 *
 * Exponerar samma Airtable-data som Clientflow-sidan "Uppdrag (översikt)"
 * så att Minibok kan lista och klarmarkera uppdrag. Klarmarkering skriver
 * tillbaka till Airtable → synkas automatiskt i Clientflow.
 *
 * Auth: Bearer MINIBOK_API_KEY (eller x-api-key / x-clientflow-secret)
 * + userEmail (header X-User-Email, query eller body)
 */

const axios = require('axios');
const path = require('path');

// Samma periodmotorer som Clientflow-UI (uppdrag-oversikt.js)
require(path.join(__dirname, '..', 'public', 'js', 'lone-period.js'));
const MomsPeriod = require(path.join(__dirname, '..', 'public', 'js', 'moms-period.js'));
const LonePeriod = global.LonePeriod;

const UPPDRAG_TABLE_NAME = 'Uppdrag';
const UPPDRAG_RUNS_TABLE_NAME = 'Uppdragskörningar';
const KUNDDATA_TABLE_DEFAULT = 'tblOIuLQS2DqmOQWe';

const LONE_TYP_LEGACY = 'Löneuppdrag';
const LONE_TYP_INNEVARANDE = 'Löneuppdrag innevarande';
const LONE_TYP_EFTERHAND = 'Löneuppdrag efterhand';

function escAirtable(s) {
  return String(s || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function isLoneTyp(typ) {
  return LonePeriod ? LonePeriod.isLoneTyp(typ) : (
    [LONE_TYP_LEGACY, LONE_TYP_INNEVARANDE, LONE_TYP_EFTERHAND].includes(String(typ || '').trim())
  );
}

function toDateStr(iso) {
  const s = String(iso || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
}

function monthKey(isoOrDate) {
  if (isoOrDate instanceof Date) {
    return `${isoOrDate.getFullYear()}-${String(isoOrDate.getMonth() + 1).padStart(2, '0')}`;
  }
  const s = toDateStr(isoOrDate);
  return s ? s.slice(0, 7) : '';
}

function quarterKey(iso) {
  const s = toDateStr(iso);
  if (!s) return '';
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(5, 7));
  if (!y || !m) return '';
  return `${y}-Q${Math.ceil(m / 3)}`;
}

function yearKey(iso) {
  const s = toDateStr(iso);
  return s ? s.slice(0, 4) : '';
}

function getModeForUppdrag(typ, freqStr) {
  const tt = String(typ || '').trim();
  const ff = String(freqStr || '').toLowerCase();
  if (tt === 'Momsredovisning') {
    if (ff.includes('kvartal')) return 'quarter';
    if (ff.includes('år')) return 'year';
    return 'month';
  }
  if (tt === 'Bokslut' || tt === 'Deklaration') return 'year';
  return 'month';
}

function addMonthsIso(iso, n) {
  const s = toDateStr(iso);
  if (!s) return '';
  const [y, m, d] = s.split('-').map(Number);
  const base = new Date(y, (m - 1) + n, 1);
  const last = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
  const day = Math.min(d, last);
  const out = new Date(base.getFullYear(), base.getMonth(), day);
  return `${out.getFullYear()}-${String(out.getMonth() + 1).padStart(2, '0')}-${String(out.getDate()).padStart(2, '0')}`;
}

function monthsStepFromFreq(freqRaw) {
  const f = String(freqRaw || '').toLowerCase();
  if (f.includes('kvartal')) return 3;
  if (f.includes('månad')) return 1;
  if (f.includes('årsvis')) return 12;
  if (f.includes('engång')) return 0;
  return 1;
}

function calcNextDeadline(currentIso, freq) {
  if (!currentIso) return null;
  const f = String(freq || '').toLowerCase();
  if (f.includes('kvartal')) return addMonthsIso(currentIso, 3);
  if (f.includes('månad')) return addMonthsIso(currentIso, 1);
  if (f.includes('årsvis')) {
    const s = toDateStr(currentIso);
    if (!s) return null;
    const d = new Date(`${s}T00:00:00`);
    d.setFullYear(d.getFullYear() + 1);
    return d.toISOString().slice(0, 10);
  }
  return null;
}

function safeJson(raw, fallback) {
  try {
    const v = raw ? JSON.parse(String(raw)) : fallback;
    return v == null ? fallback : v;
  } catch (_) {
    return fallback;
  }
}

function runStatusFromHistory(fields, periodKey) {
  const pk = String(periodKey || '').trim();
  if (!pk) return '';
  const hist = safeJson((fields?.['Historik'] || '').toString().trim(), []);
  if (!Array.isArray(hist)) return '';
  const hit = hist.find((it) => it && String(it.periodKey || '').trim() === pk);
  return hit ? String(hit.status || '').trim() : '';
}

function periodKeyFromDeadline(deadlineIso, typ, freq) {
  const dl = toDateStr(deadlineIso);
  if (!dl) return '';
  if (isLoneTyp(typ) && LonePeriod) {
    return LonePeriod.periodKeyFromDeadline(dl, typ) || dl.slice(0, 7);
  }
  const mode = getModeForUppdrag(typ, freq);
  if (typ === 'Momsredovisning' && MomsPeriod && MomsPeriod.isQuarterlyFreq(freq)) {
    return MomsPeriod.periodKeyFromDeadlineYm(dl.slice(0, 7), freq) || quarterKey(dl);
  }
  if (mode === 'quarter') return quarterKey(dl);
  if (mode === 'year') return yearKey(dl);
  return dl.slice(0, 7);
}

function deadlineIsoFromPeriodKey(periodKey, typ, freq, refDeadline) {
  const pk = String(periodKey || '').trim();
  if (!pk) return '';
  if (typ === 'Momsredovisning' && MomsPeriod) {
    const dl = MomsPeriod.deadlineIsoFromPeriodKey(pk, freq);
    if (dl) return dl;
  }
  if (isLoneTyp(typ) && LonePeriod) {
    const dl = LonePeriod.deadlineIsoFromPeriodKey(pk, typ, refDeadline);
    if (dl) return dl;
  }
  const mode = getModeForUppdrag(typ, freq);
  const day = (() => {
    const d = parseInt(String(refDeadline || '').slice(8, 10), 10);
    return (Number.isFinite(d) && d >= 1 && d <= 28) ? d : 15;
  })();
  if (mode === 'quarter') {
    const m = pk.match(/^(\d{4})-Q([1-4])$/i);
    if (m) {
      const endMonth = Number(m[2]) * 3;
      return `${m[1]}-${String(endMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }
  if (mode === 'year' && /^\d{4}$/.test(pk)) {
    const month = String(refDeadline || '').slice(5, 7);
    const mm = /^\d{2}$/.test(month) ? month : '12';
    return `${pk}-${mm}-${String(day).padStart(2, '0')}`;
  }
  if (/^\d{4}-\d{2}$/.test(pk)) return `${pk}-${String(day).padStart(2, '0')}`;
  return toDateStr(refDeadline) || '';
}

function startIsoForRun(periodKey, deadlineIso, typ, freq, fields) {
  const dl = toDateStr(deadlineIso);
  if (!dl) return '';
  if (typ === 'Momsredovisning' && MomsPeriod) {
    const st = MomsPeriod.startIsoFromPeriodKey(String(periodKey || '').trim(), freq);
    if (st) return st;
  }
  if (isLoneTyp(typ) && LonePeriod) {
    const st = LonePeriod.startIsoFromPeriodKey(periodKey, typ, fields?.['Startdatum'] || dl);
    if (st) return st;
  }
  const step = monthsStepFromFreq(freq);
  if (step === 0) return toDateStr(fields?.['Startdatum'] || '') || dl;
  return addMonthsIso(dl, -step) || toDateStr(fields?.['Startdatum'] || '') || dl;
}

function createMinibokUppdrag({
  authenticateMinibokApi,
  resolveUserEmail,
  resolveMinibokUser,
  getAirtableUser
}) {
  const airtableBaseId = () => process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
  const airtableToken = () => process.env.AIRTABLE_ACCESS_TOKEN;
  const uppdragTableRef = () => process.env.AIRTABLE_TABLE_UPPDRAG_ID || encodeURIComponent(UPPDRAG_TABLE_NAME);
  const kunddataTableRef = () =>
    process.env.AIRTABLE_TABLE_KUNDDATA_ID || process.env.AIRTABLE_KUNDDATA_TABLE_ID || KUNDDATA_TABLE_DEFAULT;

  async function resolveUser(req) {
    const email = resolveUserEmail(req);
    if (!email) return { error: 'userEmail krävs (header X-User-Email, query eller body)', status: 400 };
    const user = resolveMinibokUser
      ? await resolveMinibokUser(email)
      : await getAirtableUser(email);
    if (!user?.id && !user?.byraId) {
      return { error: `Ingen Clientflow-användare för ${email}`, status: 404 };
    }
    const byraId = user?.byraId ? String(user.byraId).replace(/,/g, '').trim() : '';
    if (!byraId) {
      return { error: `Användaren ${email} saknar Byrå ID i Clientflow`, status: 400 };
    }
    return { email, user, byraId };
  }

  async function listUppdragForByra(byraId, { mine = false, userName = '' } = {}) {
    const token = airtableToken();
    if (!token) throw new Error('AIRTABLE_ACCESS_TOKEN saknas');
    const url = `https://api.airtable.com/v0/${airtableBaseId()}/${uppdragTableRef()}`;
    const headers = { Authorization: `Bearer ${token}` };
    const num = parseInt(byraId, 10);
    const byraFormula = Number.isNaN(num)
      ? `OR({Byrå ID}="${escAirtable(byraId)}")`
      : `OR({Byrå ID}="${escAirtable(byraId)}",{Byrå ID}=${num})`;

    let records = [];
    let offset = null;
    do {
      const params = { pageSize: 100, filterByFormula: byraFormula };
      if (offset) params.offset = offset;
      // eslint-disable-next-line no-await-in-loop
      const r = await axios.get(url, { headers, params });
      records = records.concat(r.data.records || []);
      offset = r.data.offset || null;
    } while (offset);

    if (mine) {
      const myName = String(userName || '').trim().toLowerCase();
      records = records.filter((rec) => {
        const a = String(rec.fields?.['Ansvarig'] || '').trim().toLowerCase();
        return myName && a === myName;
      });
    }

    // Enrich with Kundnamn from KUNDDATA
    const custIds = Array.from(
      new Set(records.map((r) => String(r.fields?.['Kund ID'] || '').trim()).filter(Boolean))
    );
    const nameById = {};
    const fetchBatch = async (ids) => {
      if (!ids.length) return;
      const parts = ids.map((id) => `RECORD_ID()="${escAirtable(id)}"`).join(',');
      const formula = `OR(${parts})`;
      const custUrl = `https://api.airtable.com/v0/${airtableBaseId()}/${encodeURIComponent(kunddataTableRef())}`;
      let custRes;
      try {
        custRes = await axios.get(custUrl, {
          headers,
          params: { filterByFormula: formula, maxRecords: 100, fields: ['Namn', 'Företagsnamn', 'Orgnr'] }
        });
      } catch (e) {
        const msg = e.response?.data?.error?.message || e.message || '';
        if (/Unknown field name/i.test(String(msg))) {
          custRes = await axios.get(custUrl, {
            headers,
            params: { filterByFormula: formula, maxRecords: 100, fields: ['Namn', 'Orgnr'] }
          });
        } else {
          throw e;
        }
      }
      (custRes.data.records || []).forEach((r) => {
        const f = r.fields || {};
        nameById[r.id] = {
          name: String(f['Namn'] || f['Företagsnamn'] || '').trim(),
          orgNr: String(f['Orgnr'] || '').replace(/\D/g, '')
        };
      });
    };
    for (let i = 0; i < custIds.length; i += 50) {
      // eslint-disable-next-line no-await-in-loop
      await fetchBatch(custIds.slice(i, i + 50));
    }
    records.forEach((r) => {
      const cid = String(r.fields?.['Kund ID'] || '').trim();
      if (cid && nameById[cid]) {
        r.fields['Kundnamn'] = nameById[cid].name;
        r.fields['Orgnr'] = nameById[cid].orgNr;
      }
    });

    return records;
  }

  async function findUppdrag(customerId, typ) {
    const token = airtableToken();
    const url = `https://api.airtable.com/v0/${airtableBaseId()}/${uppdragTableRef()}`;
    const formulas = [
      `AND({Kund ID}="${escAirtable(customerId)}",{Typ}="${escAirtable(typ)}")`,
      `{Kund ID}="${escAirtable(customerId)}"`
    ];
    for (const formula of formulas) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const res = await axios.get(url, {
          headers: { Authorization: `Bearer ${token}` },
          params: { filterByFormula: formula, maxRecords: 20 }
        });
        const records = res.data.records || [];
        const hit = records.find((r) => String(r.fields?.['Typ'] || '').trim() === String(typ).trim());
        if (hit) return hit;
        if (records.length && formula.includes('Typ')) continue;
      } catch (e) {
        const msg = e.response?.data?.error?.message || e.message || '';
        if (!/Unknown field/i.test(String(msg))) throw e;
      }
    }
    return null;
  }

  async function syncRunStatusKlar({ uppdragId, customerId, typ, periodKey, byraId }) {
    const token = airtableToken();
    if (!token || !periodKey) return { synced: false, reason: 'missing_period' };
    const runsTableId = (process.env.AIRTABLE_TABLE_UPPDRAG_RUNS_ID || '').trim()
      || encodeURIComponent(UPPDRAG_RUNS_TABLE_NAME);
    const url = `https://api.airtable.com/v0/${airtableBaseId()}/${runsTableId}`;
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const formula = encodeURIComponent(
      `AND({Uppdrag ID}="${escAirtable(uppdragId)}",{PeriodKey}="${escAirtable(periodKey)}")`
    );
    try {
      const list = await axios.get(`${url}?filterByFormula=${formula}&maxRecords=5`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const runs = list.data.records || [];
      if (!runs.length) {
        // skapa saknad körning best-effort
        const nowIso = new Date().toISOString();
        try {
          const createRes = await axios.post(url, {
            fields: {
              'Run Key': `${uppdragId}:${periodKey}`,
              'Uppdrag ID': uppdragId,
              'Kund ID': customerId,
              'Byrå ID': byraId,
              Typ: typ,
              PeriodKey: periodKey,
              Status: 'Klar',
              Skapad: nowIso,
              Uppdaterad: nowIso
            }
          }, { headers });
          return { synced: true, created: true, runId: createRes.data?.id };
        } catch (_) {
          return { synced: false, reason: 'run_not_found' };
        }
      }
      const nowIso = new Date().toISOString();
      await Promise.all(runs.map((rr) => axios.patch(
        `${url}/${encodeURIComponent(rr.id)}`,
        { fields: { Status: 'Klar', Uppdaterad: nowIso } },
        { headers }
      )));
      return { synced: true, updated: runs.length, runId: runs[0].id };
    } catch (e) {
      return { synced: false, reason: e.response?.data?.error?.message || e.message };
    }
  }

  async function completeUppdrag({ customerId, typ, note, doneAt, periodKey: periodKeyRaw, userEmail, byraId }) {
    const existing = await findUppdrag(customerId, typ);
    if (!existing) {
      const err = new Error('Uppdrag saknas för kund+typ (skapa uppdraget i Clientflow först)');
      err.status = 404;
      throw err;
    }

    const f = existing.fields || {};
    const recordByra = f['Byrå ID'] != null ? String(f['Byrå ID']).replace(/,/g, '').trim() : '';
    if (byraId && recordByra && recordByra !== byraId) {
      const err = new Error('Du saknar behörighet till detta uppdrag');
      err.status = 403;
      throw err;
    }

    const freq = f['Frekvens'] || '';
    const currentDeadline = f['Nästa deadline'] || doneAt;
    const doneIso = (doneAt && /^\d{4}-\d{2}-\d{2}$/.test(String(doneAt)))
      ? String(doneAt)
      : new Date().toISOString().slice(0, 10);

    const mode = getModeForUppdrag(typ, freq);
    const clientPeriodKey = String(periodKeyRaw || '').trim();
    const periodKeyFromDl = (() => {
      const dl = toDateStr(currentDeadline || doneIso);
      if (!dl) return '';
      return periodKeyFromDeadline(dl, typ, freq);
    })();
    const periodKeyValid = (pk) => {
      if (!pk) return false;
      if (mode === 'quarter') return /^\d{4}-Q[1-4]$/.test(pk);
      if (mode === 'year') return /^\d{4}$/.test(pk);
      return /^\d{4}-\d{2}$/.test(pk);
    };
    const periodKey = periodKeyValid(clientPeriodKey) ? clientPeriodKey : periodKeyFromDl;
    const completedDeadline = toDateStr(currentDeadline) || doneIso;

    let history = safeJson((f['Historik'] || '').toString().trim(), []);
    if (!Array.isArray(history)) history = [];

    const historyEntry = {
      doneAt: doneIso,
      ...(periodKey ? { periodKey } : {}),
      ...(completedDeadline ? { deadline: completedDeadline } : {}),
      status: 'Klar',
      note: String(note || '').trim(),
      user: userEmail || '',
      source: 'minibok'
    };
    const prevIdx = history.findIndex((it) => it && String(it.periodKey || '').trim() === periodKey);
    if (prevIdx >= 0) history[prevIdx] = { ...(history[prevIdx] || {}), ...historyEntry };
    else history.unshift(historyEntry);
    history = history.slice(0, 200);

    const next = calcNextDeadline(currentDeadline, freq);
    const fields = {
      'Senast utförd': doneIso,
      Historik: JSON.stringify(history),
      Uppdaterad: new Date().toISOString()
    };
    if (next) fields['Nästa deadline'] = next;

    const token = airtableToken();
    const tableRef = uppdragTableRef();
    const updateRes = await axios.patch(
      `https://api.airtable.com/v0/${airtableBaseId()}/${tableRef}/${existing.id}`,
      { fields },
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
    );

    const runSync = await syncRunStatusKlar({
      uppdragId: existing.id,
      customerId,
      typ,
      periodKey,
      byraId: recordByra || byraId
    });

    return {
      record: updateRes.data,
      nextDeadline: next || null,
      periodKey,
      runSync
    };
  }

  /**
   * Speglar Clientflow uppdrag-oversikt.js:
   * collectRunsForRecord → expandRunsToMonthInstances → filter på vald månad.
   * Löneuppdrag syns under hela fönstret startdatum→deadline (inte bara deadline-månad).
   */
  function collectRunsForRecord(r, todayYm) {
    const f = r.fields || {};
    const typ = String(f['Typ'] || '').trim();
    const freq = String(f['Frekvens'] || '').trim();
    const refDeadline = toDateStr(f['Nästa deadline'] || '');
    const refStart = toDateStr(f['Startdatum'] || '');
    const runs = new Map();

    const addRun = (periodKey, deadlineIso, startIso, periodLabel) => {
      const dl = toDateStr(deadlineIso);
      if (!dl) return;
      const pk = String(periodKey || '').trim() || periodKeyFromDeadline(dl, typ, freq);
      const st = toDateStr(startIso) || startIsoForRun(pk, dl, typ, freq, f);
      let label = String(periodLabel || '').trim();
      if (!label && typ === 'Momsredovisning' && MomsPeriod) {
        const momsFreq = MomsPeriod.inferFreq(freq, pk, null);
        label = MomsPeriod.runTitle(pk, momsFreq, dl.slice(0, 7)) || '';
      }
      if (!label && isLoneTyp(typ) && LonePeriod) {
        label = LonePeriod.displayLabel(pk, typ) || '';
      }
      const key = `${r.id}:${pk}`;
      if (!runs.has(key)) {
        runs.set(key, {
          record: r,
          typ,
          deadline: dl,
          startDate: st,
          periodKey: pk,
          periodLabel: label,
          key
        });
      }
    };

    const hist = safeJson((f['Historik'] || '').toString().trim(), []);
    if (Array.isArray(hist)) {
      hist.forEach((h) => {
        const pk = String(h?.periodKey || '').trim();
        if (!pk) return;
        const dl = toDateStr(h?.deadline) || deadlineIsoFromPeriodKey(pk, typ, freq, refDeadline);
        const st = (isLoneTyp(typ) && LonePeriod)
          ? LonePeriod.startIsoFromPeriodKey(pk, typ, refStart || refDeadline)
          : '';
        addRun(pk, dl, st, '');
      });
    }

    if (isLoneTyp(typ) && LonePeriod && refDeadline) {
      const templateStart = refStart || refDeadline;
      const loneRuns = LonePeriod.runsThroughHorizon(templateStart, refDeadline, typ, todayYm);
      loneRuns.forEach((run) => {
        addRun(run.periodKey, run.deadlineIso, run.startIso, run.periodLabel);
      });
      return Array.from(runs.values());
    }

    if (typ === 'Momsredovisning' && MomsPeriod
      && (MomsPeriod.isMonthlyFreq(freq) || MomsPeriod.isQuarterlyFreq(freq))) {
      const firstPk = MomsPeriod.inferFirstPeriod(f, freq);
      if (firstPk) {
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

    // Expandera framåt från Nästa deadline (samma som Clientflow fallback)
    const monthMax = (() => {
      const [y, m] = String(todayYm).split('-').map(Number);
      return new Date(y, (m - 1) + 11, 1);
    })();
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

  function expandRunsToMonthInstances(runs, { monthMin, monthMax, todayIso }) {
    const inst = [];
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
          if (run.typ === 'Momsredovisning' && MomsPeriod) {
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
          inst.push({ ...run, month: mk, key: `${run.key}:${mk}` });
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

  function matchesTypFilter(uppdragTyp, typFilter) {
    const filter = String(typFilter || '').trim();
    if (!filter) return true;
    if (filter === LONE_TYP_LEGACY || filter === 'Löne' || filter === 'Löneuppdrag') {
      return isLoneTyp(uppdragTyp);
    }
    return String(uppdragTyp || '').trim() === filter;
  }

  function buildBoardRows(records, { month, typ } = {}) {
    const targetMonth = /^\d{4}-\d{2}$/.test(String(month || '')) ? String(month) : monthKey(new Date());
    const typFilter = String(typ || '').trim();
    const todayYm = monthKey(new Date());
    const todayIso = new Date().toISOString().slice(0, 10);
    const [ty, tm] = todayYm.split('-').map(Number);
    const monthMin = new Date(ty, tm - 1 - 12, 1);
    const monthMax = new Date(ty, tm - 1 + 11, 1);

    const activeRecords = (records || []).filter((r) => {
      const f = r.fields || {};
      const status = String(f['Status'] || 'Aktiv').trim();
      if (status === 'Avslutad') return false;
      return matchesTypFilter(f['Typ'], typFilter);
    });

    const instances = [];
    for (const r of activeRecords) {
      instances.push(...expandRunsToMonthInstances(
        collectRunsForRecord(r, todayYm),
        { monthMin, monthMax, todayIso }
      ));
    }
    const forMonth = dedupeInstancesByClientMonth(instances)
      .filter((x) => x.month === targetMonth);

    const rows = forMonth.map((x) => {
      const f = x.record.fields || {};
      const runStatus = runStatusFromHistory(f, x.periodKey) || 'Planerad';
      return {
        uppdragId: x.record.id,
        customerId: String(f['Kund ID'] || '').trim(),
        customerName: String(f['Kundnamn'] || '').trim(),
        orgNr: String(f['Orgnr'] || '').trim(),
        typ: x.typ,
        frekvens: String(f['Frekvens'] || '').trim(),
        ansvarig: String(f['Ansvarig'] || '').trim(),
        periodKey: x.periodKey,
        periodLabel: x.periodLabel || '',
        deadline: x.deadline,
        startDate: x.startDate || '',
        boardMonth: x.month,
        status: runStatus,
        done: runStatus === 'Klar',
        senastUtford: toDateStr(f['Senast utförd'] || ''),
        nastaDeadline: toDateStr(f['Nästa deadline'] || ''),
        uppdragStatus: String(f['Status'] || 'Aktiv').trim(),
        riskAtgarderAktiverade: !!f['Riskåtgärder aktiverade'],
        riskAtgarderValda: (function () {
          const raw = (f['Riskåtgärder valda'] || '').toString().trim();
          const parsed = safeJson(raw, null);
          if (Array.isArray(parsed)) return parsed.map((x) => String(x || '').trim()).filter(Boolean);
          return raw ? raw.split(/\r?\n/).map((s) => s.trim()).filter(Boolean) : [];
        }())
      };
    });

    rows.sort((a, b) => String(a.customerName || '').localeCompare(String(b.customerName || ''), 'sv'));
    return rows;
  }

  function registerRoutes(app) {
    // GET /api/v1/uppdrag – samma data som Clientflow Uppdrag (översikt)
    // Query: userEmail, mine=0|1, month=YYYY-MM (för board), typ=Löneuppdrag|Momsredovisning|...
    //        view=raw|board (default board om month anges, annars raw)
    app.get('/api/v1/uppdrag', authenticateMinibokApi, async (req, res) => {
      try {
        const resolved = await resolveUser(req);
        if (resolved.error) return res.status(resolved.status).json({ error: resolved.error });

        const mine = String(req.query.mine || '0') === '1';
        const month = String(req.query.month || '').trim();
        const typ = String(req.query.typ || '').trim();
        const view = String(req.query.view || (month ? 'board' : 'raw')).trim();

        const records = await listUppdragForByra(resolved.byraId, {
          mine,
          userName: resolved.user?.name || ''
        });

        if (view === 'board') {
          const boardMonth = /^\d{4}-\d{2}$/.test(month) ? month : monthKey(new Date());
          const board = buildBoardRows(records, { month: boardMonth, typ });
          return res.json({
            view: 'board',
            month: boardMonth,
            typ: typ || null,
            mine,
            byraId: resolved.byraId,
            count: board.length,
            rows: board,
            // rådata för avancerad rendering (samma som Clientflow frontend)
            records
          });
        }

        return res.json({
          view: 'raw',
          mine,
          byraId: resolved.byraId,
          count: records.length,
          records
        });
      } catch (err) {
        console.error('❌ GET /api/v1/uppdrag:', err.response?.data || err.message);
        const status = err.response?.status || 500;
        return res.status(status).json({
          error: err.response?.data?.error?.message || err.message || 'Serverfel'
        });
      }
    });

    // GET /api/v1/uppdrag/meta – tabeller/fält som översikten använder (för Minibok-utveckling)
    app.get('/api/v1/uppdrag/meta', authenticateMinibokApi, async (req, res) => {
      return res.json({
        page: 'Uppdrag (översikt)',
        clientflowPath: '/uppdrag-oversikt.html',
        airtable: {
          baseIdEnv: 'AIRTABLE_BASE_ID',
          tables: [
            {
              name: UPPDRAG_TABLE_NAME,
              role: 'Primär – en rad per kund + uppdragstyp. Översikten läser främst denna.',
              envId: 'AIRTABLE_TABLE_UPPDRAG_ID',
              keyFields: [
                'Kund ID', 'Byrå ID', 'Typ', 'Frekvens', 'Startdatum', 'Nästa deadline',
                'Ansvarig', 'Senast utförd', 'Status', 'Historik', 'Riskåtgärder aktiverade',
                'Riskåtgärder valda', 'PTL Underlag', 'Anteckning', 'Rutin'
              ]
            },
            {
              name: UPPDRAG_RUNS_TABLE_NAME,
              role: 'Valfri/sekundär – en rad per uppdrag + period. Används för per-körning status/anteckning/docs.',
              envId: 'AIRTABLE_TABLE_UPPDRAG_RUNS_ID',
              keyFields: [
                'Run Key', 'Uppdrag ID', 'Kund ID', 'Byrå ID', 'Typ', 'PeriodKey',
                'Period Label', 'Deadline', 'Status', 'Anteckning', 'Dokumentation'
              ]
            },
            {
              name: 'KUNDDATA',
              role: 'Enrichment – kundnamn/orgnr via Kund ID',
              envId: 'AIRTABLE_TABLE_KUNDDATA_ID',
              tableIdDefault: KUNDDATA_TABLE_DEFAULT,
              keyFields: ['Namn', 'Företagsnamn', 'Orgnr']
            }
          ],
          typValues: [
            LONE_TYP_LEGACY,
            LONE_TYP_INNEVARANDE,
            LONE_TYP_EFTERHAND,
            'Momsredovisning',
            'Bokslut',
            'Deklaration'
          ],
          runStatusValues: ['Planerad', 'Pågående', 'Klar', 'Sen'],
          uppdragStatusValues: ['Aktiv', 'Pausad', 'Avslutad']
        },
        endpoints: {
          list: 'GET /api/v1/uppdrag?userEmail=&month=YYYY-MM&typ=&mine=0|1&view=board|raw',
          complete: 'POST /api/v1/uppdrag/complete',
          runStatus: 'PATCH /api/v1/uppdrag/run-status',
          legacyJwt: {
            listByra: 'GET /api/uppdrag/byra?mine=0|1',
            complete: 'POST /api/uppdrag/complete',
            runStatus: 'PATCH /api/uppdrag/run-status'
          }
        },
        syncNote:
          'Klarmarkering skriver till Airtable-tabellen Uppdrag (Historik, Senast utförd, Nästa deadline) ' +
          'och synkar Status=Klar i Uppdragskörningar när periodKey matchar. Clientflow läser samma tabeller → synkas direkt.'
      });
    });

    // POST /api/v1/uppdrag/complete – klarmarkera (synkar med Clientflow via Airtable)
    // Body: { userEmail, customerId, typ, note?, doneAt?, periodKey? }
    app.post('/api/v1/uppdrag/complete', authenticateMinibokApi, async (req, res) => {
      try {
        const resolved = await resolveUser(req);
        if (resolved.error) return res.status(resolved.status).json({ error: resolved.error });

        const { customerId, typ, note, doneAt, periodKey } = req.body || {};
        if (!customerId || !typ) {
          return res.status(400).json({ error: 'customerId och typ krävs' });
        }

        const result = await completeUppdrag({
          customerId: String(customerId).trim(),
          typ: String(typ).trim(),
          note,
          doneAt,
          periodKey,
          userEmail: resolved.email,
          byraId: resolved.byraId
        });

        return res.json({
          ok: true,
          syncedWithClientflow: true,
          ...result
        });
      } catch (err) {
        console.error('❌ POST /api/v1/uppdrag/complete:', err.response?.data || err.message);
        const status = err.status || err.response?.status || 500;
        return res.status(status).json({
          error: err.response?.data?.error?.message || err.message || 'Serverfel'
        });
      }
    });

    // PATCH /api/v1/uppdrag/run-status – ändra status för period (synkar Historik + ev. Uppdragskörningar)
    // Body: { userEmail, customerId, typ, periodKey, status }
    app.patch('/api/v1/uppdrag/run-status', authenticateMinibokApi, async (req, res) => {
      try {
        const resolved = await resolveUser(req);
        if (resolved.error) return res.status(resolved.status).json({ error: resolved.error });

        const { customerId, typ, periodKey, status } = req.body || {};
        if (!customerId || !typ) return res.status(400).json({ error: 'customerId och typ krävs' });
        const pk = String(periodKey || '').trim();
        if (!pk) return res.status(400).json({ error: 'periodKey krävs' });

        const nextStatus = String(status || '').trim();
        const allowed = new Set(['Planerad', 'Pågående', 'Klar', 'Sen']);
        if (!allowed.has(nextStatus)) {
          return res.status(400).json({ error: 'Ogiltig status. Tillåtna: Planerad, Pågående, Klar, Sen.' });
        }

        const existing = await findUppdrag(String(customerId).trim(), String(typ).trim());
        if (!existing) return res.status(404).json({ error: 'Uppdrag saknas för kund+typ' });

        const f = existing.fields || {};
        const recordByra = f['Byrå ID'] != null ? String(f['Byrå ID']).replace(/,/g, '').trim() : '';
        if (recordByra && recordByra !== resolved.byraId) {
          return res.status(403).json({ error: 'Du saknar behörighet till detta uppdrag' });
        }

        let history = safeJson((f['Historik'] || '').toString().trim(), []);
        if (!Array.isArray(history)) history = [];
        const nowIso = new Date().toISOString();
        const entry = {
          periodKey: pk,
          status: nextStatus,
          updatedAt: nowIso,
          user: resolved.email,
          source: 'minibok'
        };
        const idx = history.findIndex((it) => it && String(it.periodKey || '').trim() === pk);
        if (idx >= 0) history[idx] = { ...(history[idx] || {}), ...entry };
        else history.unshift(entry);
        history = history.slice(0, 250);

        const token = airtableToken();
        const updateRes = await axios.patch(
          `https://api.airtable.com/v0/${airtableBaseId()}/${uppdragTableRef()}/${existing.id}`,
          { fields: { Historik: JSON.stringify(history), Uppdaterad: nowIso } },
          { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
        );

        let runSync = { synced: false };
        if (nextStatus === 'Klar') {
          runSync = await syncRunStatusKlar({
            uppdragId: existing.id,
            customerId: String(customerId).trim(),
            typ: String(typ).trim(),
            periodKey: pk,
            byraId: recordByra || resolved.byraId
          });
        } else {
          // best-effort update run status
          try {
            const runsTableId = (process.env.AIRTABLE_TABLE_UPPDRAG_RUNS_ID || '').trim()
              || encodeURIComponent(UPPDRAG_RUNS_TABLE_NAME);
            const url = `https://api.airtable.com/v0/${airtableBaseId()}/${runsTableId}`;
            const formula = encodeURIComponent(
              `AND({Uppdrag ID}="${escAirtable(existing.id)}",{PeriodKey}="${escAirtable(pk)}")`
            );
            const list = await axios.get(`${url}?filterByFormula=${formula}&maxRecords=5`, {
              headers: { Authorization: `Bearer ${token}` }
            });
            const runs = list.data.records || [];
            await Promise.all(runs.map((rr) => axios.patch(
              `${url}/${encodeURIComponent(rr.id)}`,
              { fields: { Status: nextStatus, Uppdaterad: nowIso } },
              { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
            )));
            runSync = { synced: runs.length > 0, updated: runs.length };
          } catch (e) {
            runSync = { synced: false, reason: e.message };
          }
        }

        return res.json({
          ok: true,
          syncedWithClientflow: true,
          record: updateRes.data,
          periodKey: pk,
          status: nextStatus,
          runSync
        });
      } catch (err) {
        console.error('❌ PATCH /api/v1/uppdrag/run-status:', err.response?.data || err.message);
        const status = err.response?.status || 500;
        return res.status(status).json({
          error: err.response?.data?.error?.message || err.message || 'Serverfel'
        });
      }
    });
  }

  return {
    registerRoutes,
    listUppdragForByra,
    completeUppdrag,
    buildBoardRows
  };
}

module.exports = { createMinibokUppdrag, UPPDRAG_TABLE_NAME, UPPDRAG_RUNS_TABLE_NAME };
