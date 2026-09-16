/**
 * Tidregistrering – tidposter kopplade till kund/uppdrag, strukturerade för fakturaunderlag.
 * Airtable-tabell: "Tidregistrering"
 */
const axios = require('axios');

const TABLE_NAME = 'Tidregistrering';
const TABLE_ENV = 'AIRTABLE_TABLE_TIDREGISTRERING_ID';

const STATUS = {
  DRAFT: 'Utkast',
  READY: 'Klar',
  INVOICED: 'Fakturerad'
};

const STATUS_SET = new Set(Object.values(STATUS));

function airtableToken() {
  return String(process.env.AIRTABLE_ACCESS_TOKEN || '').trim();
}

function airtableBaseId() {
  return String(process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50').trim();
}

function escapeFormula(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function roundHours(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) return null;
  return Math.round(v * 100) / 100;
}

function roundMoney(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) return null;
  return Math.round(v * 100) / 100;
}

function computeAmount(hours, rate) {
  const h = roundHours(hours);
  const r = roundMoney(rate);
  if (h == null || h <= 0 || r == null) return null;
  return roundMoney(h * r);
}


function normalizeUnit(raw) {
  const e = String(raw || '').trim().toLowerCase();
  if (!e || e === 'timme' || e === 'timmar' || e === 'hour' || e === 'hours' || e === 'hr') return 'h';
  if (e === 'styck' || e === 'st.' || e === 'pcs' || e === 'piece') return 'st';
  return e;
}

function isHourlyUnit(unit) {
  return normalizeUnit(unit) === 'h';
}

/** Parse byrå prislista JSON fields into { tjanster, fritext }. */
function parsePrislista(tjanstepriserJson, fritextJson) {
  const prislista = { tjanster: {}, fritext: [] };
  try {
    const obj = typeof tjanstepriserJson === 'string'
      ? (tjanstepriserJson ? JSON.parse(tjanstepriserJson) : null)
      : tjanstepriserJson;
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) prislista.tjanster = obj;
  } catch (_) { /* ignore */ }
  try {
    const arr = typeof fritextJson === 'string'
      ? (fritextJson ? JSON.parse(fritextJson) : null)
      : fritextJson;
    if (Array.isArray(arr)) prislista.fritext = arr;
  } catch (_) { /* ignore */ }

  for (const [k, v] of Object.entries(prislista.tjanster || {})) {
    if (v && typeof v === 'object') {
      if (v.visible === undefined) v.visible = true;
      v.enhet = normalizeUnit(v.enhet || 'h');
      continue;
    }
    const n = Number(v);
    prislista.tjanster[k] = {
      pris: Number.isFinite(n) ? n : null,
      enhet: 'h',
      visible: true
    };
  }
  prislista.fritext = (prislista.fritext || [])
    .map((x) => ({
      namn: String(x?.namn || '').trim(),
      pris: x?.pris != null && x.pris !== '' ? Number(x.pris) : null,
      enhet: normalizeUnit(x?.enhet || 'h'),
      visible: x?.visible === undefined ? true : !!x.visible
    }))
    .filter((x) => x.namn);
  return prislista;
}

function collectHourlyRates(prislista) {
  const items = [];
  const tjanster = prislista?.tjanster || {};
  for (const [namn, v] of Object.entries(tjanster)) {
    if (!v || typeof v !== 'object') continue;
    if (!isHourlyUnit(v.enhet)) continue;
    const pris = roundMoney(v.pris);
    if (pris == null || pris <= 0) continue;
    items.push({ namn: String(namn || '').trim(), pris, source: 'tjanst' });
  }
  for (const x of prislista?.fritext || []) {
    if (!x || !isHourlyUnit(x.enhet)) continue;
    const pris = roundMoney(x.pris);
    if (pris == null || pris <= 0) continue;
    const namn = String(x.namn || '').trim();
    if (!namn) continue;
    items.push({ namn, pris, source: 'fritext' });
  }
  return items;
}

function nameLooksLikeDefaultHourly(namn) {
  const n = String(namn || '').trim().toLowerCase();
  if (!n) return false;
  return (
    n === 'timpris' ||
    n === 'timme' ||
    n === 'timmar' ||
    n === 'konsulttimme' ||
    n === 'konsulttimpris' ||
    n === 'ordinarie timpris' ||
    n === 'standard timpris' ||
    n === 'default timpris' ||
    n.includes('timpris') ||
    /^tim(me|mar)?\b/.test(n)
  );
}

/**
 * Resolve hourly rate from byrå prislista (timlista).
 * Preference: exact activity → exact uppdrag → partial match → named default → single unique hourly price.
 */
function resolveHourlyRateFromPrislista(prislista, { activity, uppdragsnamn } = {}) {
  const items = collectHourlyRates(prislista);
  if (!items.length) return null;

  const needles = [activity, uppdragsnamn]
    .map((s) => String(s || '').trim().toLowerCase())
    .filter(Boolean);

  const findExact = (needle) =>
    items.find((it) => it.namn.toLowerCase() === needle) || null;
  const findPartial = (needle) => {
    if (needle.length < 3) return null;
    return (
      items.find((it) => {
        const n = it.namn.toLowerCase();
        if (n.length < 3) return false;
        return n.includes(needle) || needle.includes(n);
      }) || null
    );
  };

  for (const needle of needles) {
    const hit = findExact(needle);
    if (hit) return { rate: hit.pris, matchedName: hit.namn, match: 'exact' };
  }
  for (const needle of needles) {
    const hit = findPartial(needle);
    if (hit) return { rate: hit.pris, matchedName: hit.namn, match: 'partial' };
  }

  const namedDefault = items.find((it) => nameLooksLikeDefaultHourly(it.namn));
  if (namedDefault) {
    return { rate: namedDefault.pris, matchedName: namedDefault.namn, match: 'default-name' };
  }

  const uniquePrices = [...new Set(items.map((it) => it.pris))];
  if (uniquePrices.length === 1) {
    return { rate: uniquePrices[0], matchedName: items[0].namn, match: 'single-rate' };
  }

  return null;
}

function prislistaFromByraFields(fields) {
  const f = fields || {};
  const prislistaJson =
    f['Tjänstepriser (JSON)'] ?? f['Tjanstepriser (JSON)'] ?? f['Prislista (JSON)'] ?? '';
  const fritextJson =
    f['Fritexttjänster (JSON)'] ?? f['Fritexttjanster (JSON)'] ?? '';
  return parsePrislista(prislistaJson, fritextJson);
}

function normalizeStatus(raw) {
  const s = String(raw || '').trim();
  return STATUS_SET.has(s) ? s : STATUS.DRAFT;
}

function dateOnly(isoOrDate) {
  const s = String(isoOrDate || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const ms = Date.parse(s);
  if (!Number.isFinite(ms)) return '';
  return new Date(ms).toISOString().slice(0, 10);
}

function recordToEntry(rec) {
  const f = rec?.fields || {};
  const hours = roundHours(f.Timmar);
  const rate = roundMoney(f.Timpris);
  const storedAmount = roundMoney(f.Belopp);
  return {
    id: rec.id,
    byraId: String(f['Byrå ID'] || '').trim(),
    customerId: String(f['Kund ID'] || '').trim(),
    customerName: String(f.Kundnamn || '').trim(),
    uppdragId: String(f['Uppdrag ID'] || '').trim(),
    uppdragsnamn: String(f.Uppdragsnamn || '').trim(),
    koringId: String(f['Körning ID'] || '').trim(),
    motesbokningId: String(f['Mötesbokning ID'] || '').trim(),
    date: dateOnly(f.Datum),
    start: String(f.Start || '').trim(),
    end: String(f.Slut || '').trim(),
    hours: hours == null ? 0 : hours,
    description: String(f.Beskrivning || '').trim(),
    activity: String(f.Aktivitet || '').trim(),
    performedBy: String(f['Utförd av'] || '').trim(),
    performedByName: String(f['Utförd av namn'] || '').trim(),
    status: normalizeStatus(f.Status),
    rate: rate,
    amount: storedAmount != null ? storedAmount : computeAmount(hours, rate),
    createdAt: String(f.Skapad || rec.createdTime || '').trim(),
    createdBy: String(f['Skapad av'] || '').trim(),
    updatedAt: String(f.Uppdaterad || '').trim()
  };
}

/** Normaliserad rad för framtida fakturering / export. */
function toInvoiceLine(entry) {
  if (!entry) return null;
  return {
    id: entry.id,
    customerId: entry.customerId,
    customerName: entry.customerName,
    date: entry.date,
    hours: entry.hours,
    rate: entry.rate,
    amount: entry.amount,
    description: entry.description || entry.activity || '',
    activity: entry.activity,
    uppdragId: entry.uppdragId,
    uppdragsnamn: entry.uppdragsnamn,
    status: entry.status,
    performedBy: entry.performedBy,
    performedByName: entry.performedByName,
    invoiceReady: entry.status === STATUS.READY || entry.status === STATUS.INVOICED
  };
}

function summarizeEntries(entries) {
  const list = Array.isArray(entries) ? entries : [];
  const byStatus = {
    [STATUS.DRAFT]: { count: 0, hours: 0, amount: 0 },
    [STATUS.READY]: { count: 0, hours: 0, amount: 0 },
    [STATUS.INVOICED]: { count: 0, hours: 0, amount: 0 }
  };
  let totalHours = 0;
  let totalAmount = 0;
  const byCustomer = new Map();

  for (const e of list) {
    const st = normalizeStatus(e.status);
    const hours = roundHours(e.hours) || 0;
    const amount = roundMoney(e.amount) || 0;
    byStatus[st].count += 1;
    byStatus[st].hours = roundHours(byStatus[st].hours + hours) || 0;
    byStatus[st].amount = roundMoney(byStatus[st].amount + amount) || 0;
    totalHours = roundHours(totalHours + hours) || 0;
    totalAmount = roundMoney(totalAmount + amount) || 0;

    const key = e.customerId || e.customerName || 'okänd';
    if (!byCustomer.has(key)) {
      byCustomer.set(key, {
        customerId: e.customerId || '',
        customerName: e.customerName || 'Okänd kund',
        hours: 0,
        amount: 0,
        readyHours: 0,
        readyAmount: 0,
        count: 0
      });
    }
    const row = byCustomer.get(key);
    row.count += 1;
    row.hours = roundHours(row.hours + hours) || 0;
    row.amount = roundMoney(row.amount + amount) || 0;
    if (st === STATUS.READY) {
      row.readyHours = roundHours(row.readyHours + hours) || 0;
      row.readyAmount = roundMoney(row.readyAmount + amount) || 0;
    }
  }

  return {
    totalCount: list.length,
    totalHours,
    totalAmount,
    byStatus,
    invoiceBasis: {
      hours: byStatus[STATUS.READY].hours,
      amount: byStatus[STATUS.READY].amount,
      count: byStatus[STATUS.READY].count,
      lines: list.filter((e) => e.status === STATUS.READY).map(toInvoiceLine)
    },
    byCustomer: Array.from(byCustomer.values()).sort((a, b) =>
      String(a.customerName).localeCompare(String(b.customerName), 'sv')
    )
  };
}

function buildEntryFields(input, { forCreate = false, user } = {}) {
  const hours = roundHours(input.hours ?? input.Timmar);
  if (hours == null || hours <= 0) {
    const err = new Error('Timmar måste vara större än 0');
    err.status = 400;
    throw err;
  }
  const date = dateOnly(input.date || input.Datum);
  if (!date) {
    const err = new Error('Datum krävs (YYYY-MM-DD)');
    err.status = 400;
    throw err;
  }
  const customerId = String(input.customerId || input['Kund ID'] || '').trim();
  const customerName = String(input.customerName || input.Kundnamn || '').trim();
  if (!customerId && !customerName) {
    const err = new Error('Kund krävs (customerId eller customerName)');
    err.status = 400;
    throw err;
  }

  const rate =
    input.rate != null && input.rate !== ''
      ? roundMoney(input.rate)
      : input.Timpris != null && input.Timpris !== ''
        ? roundMoney(input.Timpris)
        : null;
  const amountExplicit =
    input.amount != null && input.amount !== ''
      ? roundMoney(input.amount)
      : input.Belopp != null && input.Belopp !== ''
        ? roundMoney(input.Belopp)
        : null;
  const amount = amountExplicit != null ? amountExplicit : computeAmount(hours, rate);

  const status = input.status != null ? normalizeStatus(input.status) : undefined;
  const nowIso = new Date().toISOString();

  const fields = {
    'Kund ID': customerId,
    Kundnamn: customerName,
    'Uppdrag ID': String(input.uppdragId || input['Uppdrag ID'] || '').trim(),
    Uppdragsnamn: String(input.uppdragsnamn || input.Uppdragsnamn || '').trim(),
    'Körning ID': String(input.koringId || input['Körning ID'] || '').trim(),
    'Mötesbokning ID': String(input.motesbokningId || input['Mötesbokning ID'] || '').trim(),
    Datum: date,
    Timmar: hours,
    Beskrivning: String(input.description || input.Beskrivning || '').trim(),
    Aktivitet: String(input.activity || input.Aktivitet || '').trim(),
    Uppdaterad: nowIso
  };

  if (input.start || input.Start) fields.Start = String(input.start || input.Start).trim();
  if (input.end || input.Slut) fields.Slut = String(input.end || input.End || input.Slut).trim();
  if (rate != null) fields.Timpris = rate;
  if (amount != null) fields.Belopp = amount;
  if (status) fields.Status = status;

  if (forCreate) {
    fields['Byrå ID'] = String(input.byraId || '').trim();
    fields.Status = status || STATUS.DRAFT;
    fields.Skapad = nowIso;
    fields['Skapad av'] = String(user?.email || '').trim();
    fields['Utförd av'] = String(input.performedBy || user?.email || '').trim();
    fields['Utförd av namn'] = String(
      input.performedByName || user?.name || user?.fullName || user?.email || ''
    ).trim();
  } else if (input.performedBy != null || input.performedByName != null) {
    if (input.performedBy != null) fields['Utförd av'] = String(input.performedBy).trim();
    if (input.performedByName != null) {
      fields['Utförd av namn'] = String(input.performedByName).trim();
    }
  }

  return fields;
}

async function getTableId(token, baseId) {
  const envId = String(process.env[TABLE_ENV] || '').trim();
  if (envId) return envId;
  const res = await axios.get(`https://api.airtable.com/v0/meta/bases/${baseId}/tables`, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 10000
  });
  const t = (res.data?.tables || []).find((x) => String(x.name || '').trim() === TABLE_NAME);
  return t ? t.id : null;
}

const REQUIRED_FIELDS = [
  { name: 'Byrå ID', type: 'singleLineText' },
  { name: 'Kund ID', type: 'singleLineText' },
  { name: 'Kundnamn', type: 'singleLineText' },
  { name: 'Uppdrag ID', type: 'singleLineText' },
  { name: 'Uppdragsnamn', type: 'singleLineText' },
  { name: 'Körning ID', type: 'singleLineText' },
  { name: 'Mötesbokning ID', type: 'singleLineText' },
  {
    name: 'Datum',
    type: 'date',
    options: { dateFormat: { name: 'iso' } }
  },
  {
    name: 'Start',
    type: 'dateTime',
    options: { dateFormat: { name: 'iso' }, timeFormat: { name: '24hour' }, timeZone: 'Europe/Stockholm' }
  },
  {
    name: 'Slut',
    type: 'dateTime',
    options: { dateFormat: { name: 'iso' }, timeFormat: { name: '24hour' }, timeZone: 'Europe/Stockholm' }
  },
  { name: 'Timmar', type: 'number', options: { precision: 2 } },
  { name: 'Beskrivning', type: 'multilineText' },
  { name: 'Aktivitet', type: 'singleLineText' },
  { name: 'Utförd av', type: 'singleLineText' },
  { name: 'Utförd av namn', type: 'singleLineText' },
  {
    name: 'Status',
    type: 'singleSelect',
    options: {
      choices: [{ name: STATUS.DRAFT }, { name: STATUS.READY }, { name: STATUS.INVOICED }]
    }
  },
  { name: 'Timpris', type: 'number', options: { precision: 2 } },
  { name: 'Belopp', type: 'number', options: { precision: 2 } },
  {
    name: 'Skapad',
    type: 'dateTime',
    options: { dateFormat: { name: 'iso' }, timeFormat: { name: '24hour' }, timeZone: 'Europe/Stockholm' }
  },
  { name: 'Skapad av', type: 'singleLineText' },
  {
    name: 'Uppdaterad',
    type: 'dateTime',
    options: { dateFormat: { name: 'iso' }, timeFormat: { name: '24hour' }, timeZone: 'Europe/Stockholm' }
  }
];

async function ensureTableAndFields({ token, baseId }) {
  const metaRes = await axios.get(`https://api.airtable.com/v0/meta/bases/${baseId}/tables`, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 15000
  });
  const tables = metaRes.data?.tables || [];
  let table = tables.find((t) => String(t.name || '').trim() === TABLE_NAME);
  const createdFields = [];

  if (!table) {
    const createRes = await axios.post(
      `https://api.airtable.com/v0/meta/bases/${baseId}/tables`,
      {
        name: TABLE_NAME,
        description: 'Tidregistrering som underlag för fakturering (ClientFlow)',
        fields: REQUIRED_FIELDS
      },
      {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        timeout: 20000
      }
    );
    return {
      tableId: createRes.data.id,
      alreadyExists: false,
      createdFields: REQUIRED_FIELDS.map((f) => f.name)
    };
  }

  const existingNames = new Set((table.fields || []).map((f) => String(f.name || '').trim()));
  for (const field of REQUIRED_FIELDS) {
    if (existingNames.has(field.name)) continue;
    try {
      await axios.post(
        `https://api.airtable.com/v0/meta/bases/${baseId}/tables/${table.id}/fields`,
        field,
        {
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          timeout: 15000
        }
      );
      createdFields.push(field.name);
    } catch (err) {
      console.warn('Tidregistrering fält:', field.name, err.response?.data || err.message);
    }
  }
  return { tableId: table.id, alreadyExists: true, createdFields };
}

async function listEntries({ token, baseId, tableId, byraId, customerId, status, from, to }) {
  const parts = [`{Byrå ID}='${escapeFormula(byraId)}'`];
  if (customerId) parts.push(`{Kund ID}='${escapeFormula(customerId)}'`);
  if (status && STATUS_SET.has(status)) parts.push(`{Status}='${escapeFormula(status)}'`);
  const fromDate = dateOnly(from);
  const toDate = dateOnly(to);
  if (fromDate) parts.push(`IS_AFTER({Datum}, DATEADD('${fromDate}', -1, 'days'))`);
  if (toDate) parts.push(`IS_BEFORE({Datum}, DATEADD('${toDate}', 1, 'days'))`);

  const formula = parts.length === 1 ? parts[0] : `AND(${parts.join(',')})`;
  const records = [];
  let offset;
  do {
    const res = await axios.get(`https://api.airtable.com/v0/${baseId}/${tableId}`, {
      headers: { Authorization: `Bearer ${token}` },
      params: {
        filterByFormula: formula,
        pageSize: 100,
        ...(offset ? { offset } : {})
      },
      timeout: 20000
    });
    records.push(...(res.data?.records || []));
    offset = res.data?.offset;
  } while (offset);

  return records
    .map(recordToEntry)
    .sort((a, b) => {
      const d = String(b.date).localeCompare(String(a.date));
      if (d) return d;
      return String(b.createdAt).localeCompare(String(a.createdAt));
    });
}

async function getEntry({ token, baseId, tableId, id }) {
  const res = await axios.get(`https://api.airtable.com/v0/${baseId}/${tableId}/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 15000
  });
  return recordToEntry(res.data);
}

async function createEntry({ token, baseId, tableId, fields }) {
  const res = await axios.post(
    `https://api.airtable.com/v0/${baseId}/${tableId}`,
    { fields },
    {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      timeout: 20000
    }
  );
  return recordToEntry(res.data);
}

async function updateEntry({ token, baseId, tableId, id, fields }) {
  const res = await axios.patch(
    `https://api.airtable.com/v0/${baseId}/${tableId}/${id}`,
    { fields },
    {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      timeout: 20000
    }
  );
  return recordToEntry(res.data);
}

async function deleteEntry({ token, baseId, tableId, id }) {
  await axios.delete(`https://api.airtable.com/v0/${baseId}/${tableId}/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 15000
  });
}


async function fetchByraPrislista({ token, baseId, byraId }) {
  const id = String(byraId || '').trim();
  if (!token || !baseId || !id) return { tjanster: {}, fritext: [] };
  try {
    const num = parseInt(id, 10);
    const filterFormula = Number.isNaN(num)
      ? `{Byrå ID}="${escapeFormula(id)}"`
      : `OR({Byrå ID}="${escapeFormula(id)}",{Byrå ID}=${num})`;
    const res = await axios.get(
      `https://api.airtable.com/v0/${baseId}/${encodeURIComponent('Byråer')}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        params: { filterByFormula: filterFormula, maxRecords: 1 },
        timeout: 15000
      }
    );
    const record = res.data?.records?.[0];
    if (!record) return { tjanster: {}, fritext: [] };
    return prislistaFromByraFields(record.fields);
  } catch (err) {
    console.warn('fetchByraPrislista:', err.message);
    return { tjanster: {}, fritext: [] };
  }
}

function applyResolvedRate(input, prislista) {
  const body = { ...(input || {}) };
  const hasExplicit =
    (body.rate != null && body.rate !== '') ||
    (body.Timpris != null && body.Timpris !== '');
  if (hasExplicit) return { input: body, resolved: null };

  const resolved = resolveHourlyRateFromPrislista(prislista, {
    activity: body.activity || body.Aktivitet,
    uppdragsnamn: body.uppdragsnamn || body.Uppdragsnamn
  });
  if (resolved?.rate != null) {
    body.rate = resolved.rate;
  }
  return { input: body, resolved };
}

function enrichEntryWithPrislista(entry, prislista) {
  if (!entry) return entry;
  const hasRate = entry.rate != null && Number(entry.rate) > 0;
  const hasAmount = entry.amount != null && Number(entry.amount) > 0;
  if (hasRate && hasAmount) {
    return { ...entry, rateFromPrislista: false };
  }
  const resolved = resolveHourlyRateFromPrislista(prislista, {
    activity: entry.activity,
    uppdragsnamn: entry.uppdragsnamn
  });
  if (!resolved?.rate) {
    return { ...entry, rateFromPrislista: false };
  }
  const rate = hasRate ? entry.rate : resolved.rate;
  const amount = hasAmount ? entry.amount : computeAmount(entry.hours, rate);
  return {
    ...entry,
    rate,
    amount,
    rateFromPrislista: !hasRate,
    rateMatchedName: resolved.matchedName || null
  };
}

function createTidregistrering(deps) {
  const { authenticateToken, getAirtableUser } = deps;

  async function requireUser(req, res) {
    const user = await getAirtableUser(req.user.email);
    if (!user) {
      res.status(401).json({ error: 'Användare hittades inte' });
      return null;
    }
    const byraId = String(user.byraId || '').trim();
    if (!byraId && user.role !== 'ClientFlowAdmin') {
      res.status(403).json({ error: 'Byrå saknas' });
      return null;
    }
    return user;
  }

  async function ctxOrFail(res) {
    const token = airtableToken();
    const baseId = airtableBaseId();
    if (!token) {
      res.status(500).json({ error: 'AIRTABLE_ACCESS_TOKEN saknas' });
      return null;
    }
    let tableId = null;
    try {
      tableId = await getTableId(token, baseId);
    } catch (err) {
      console.warn('getTableId tidregistrering:', err.message);
    }
    if (!tableId) {
      res.status(503).json({
        error: 'Tabellen "Tidregistrering" saknas. Kör setup via knappen på Tid-sidan.',
        needsSetup: true
      });
      return null;
    }
    return { token, baseId, tableId };
  }

  function assertByraAccess(user, byraId, res) {
    if (user.role !== 'ClientFlowAdmin' && String(user.byraId) !== String(byraId)) {
      res.status(403).json({ error: 'Ingen behörighet' });
      return false;
    }
    return true;
  }

  function registerRoutes(app) {
    app.post('/api/setup/airtable-tidregistrering', authenticateToken, async (req, res) => {
      try {
        const user = await requireUser(req, res);
        if (!user) return;
        const token = airtableToken();
        const baseId = airtableBaseId();
        if (!token) return res.status(500).json({ success: false, error: 'AIRTABLE_ACCESS_TOKEN saknas' });
        const result = await ensureTableAndFields({ token, baseId });
        res.json({
          success: true,
          message: result.alreadyExists
            ? (result.createdFields.length
              ? `Tabellen finns. ${result.createdFields.length} fält lades till.`
              : 'Tabellen "Tidregistrering" finns redan.')
            : 'Tabellen "Tidregistrering" skapades.',
          ...result
        });
      } catch (err) {
        const status = err.response?.status || 500;
        const msg = err.response?.data?.error?.message || err.message;
        console.error('setup airtable-tidregistrering:', msg);
        res.status(status).json({
          success: false,
          error: msg || 'Kunde inte skapa tabellen',
          hint: status === 403 || status === 401
            ? 'Kräver Airtable-token med schema.bases:read och schema.bases:write'
            : undefined
        });
      }
    });

    app.get('/api/tidregistrering', authenticateToken, async (req, res) => {
      try {
        const user = await requireUser(req, res);
        if (!user) return;
        const ctx = await ctxOrFail(res);
        if (!ctx) return;
        const byraId = String(req.query.byraId || user.byraId || '').trim();
        if (!byraId) return res.status(400).json({ error: 'byraId saknas' });
        if (!assertByraAccess(user, byraId, res)) return;

        const [rawEntries, prislista] = await Promise.all([
          listEntries({
            ...ctx,
            byraId,
            customerId: String(req.query.customerId || '').trim() || undefined,
            status: String(req.query.status || '').trim() || undefined,
            from: String(req.query.from || '').trim() || undefined,
            to: String(req.query.to || '').trim() || undefined
          }),
          fetchByraPrislista({ ...ctx, byraId })
        ]);
        const entries = rawEntries.map((e) => enrichEntryWithPrislista(e, prislista));
        const hourlyRates = collectHourlyRates(prislista);
        res.json({
          entries,
          summary: summarizeEntries(entries),
          invoiceLines: entries.map(toInvoiceLine),
          prislista: {
            hourlyRates,
            tjanster: prislista.tjanster || {},
            fritext: prislista.fritext || []
          }
        });
      } catch (err) {
        console.error('GET /api/tidregistrering:', err.message);
        res.status(500).json({ error: err.message || 'Kunde inte hämta tid' });
      }
    });

    app.get('/api/tidregistrering/summary', authenticateToken, async (req, res) => {
      try {
        const user = await requireUser(req, res);
        if (!user) return;
        const ctx = await ctxOrFail(res);
        if (!ctx) return;
        const byraId = String(req.query.byraId || user.byraId || '').trim();
        if (!byraId) return res.status(400).json({ error: 'byraId saknas' });
        if (!assertByraAccess(user, byraId, res)) return;

        const entries = await listEntries({
          ...ctx,
          byraId,
          customerId: String(req.query.customerId || '').trim() || undefined,
          from: String(req.query.from || '').trim() || undefined,
          to: String(req.query.to || '').trim() || undefined
        });
        res.json(summarizeEntries(entries));
      } catch (err) {
        console.error('GET /api/tidregistrering/summary:', err.message);
        res.status(500).json({ error: err.message || 'Kunde inte summera tid' });
      }
    });

    app.post('/api/tidregistrering', authenticateToken, async (req, res) => {
      try {
        const user = await requireUser(req, res);
        if (!user) return;
        const ctx = await ctxOrFail(res);
        if (!ctx) return;

        const body = req.body || {};
        const byraId = String(user.byraId || body.byraId || '').trim();
        if (!byraId) return res.status(400).json({ error: 'byraId saknas' });

        const prislista = await fetchByraPrislista({ ...ctx, byraId });
        const { input, resolved } = applyResolvedRate({ ...body, byraId }, prislista);
        const fields = buildEntryFields(input, {
          forCreate: true,
          user: { email: user.email || req.user.email, name: user.name || user.fullName }
        });
        const entry = await createEntry({ ...ctx, fields });
        res.status(201).json({
          entry,
          invoiceLine: toInvoiceLine(entry),
          rateResolved: resolved || undefined
        });
      } catch (err) {
        const status = err.status || err.response?.status || 500;
        const msg = err.response?.data?.error?.message || err.message;
        console.error('POST /api/tidregistrering:', msg);
        res.status(status).json({ error: msg || 'Kunde inte spara tid' });
      }
    });

    app.put('/api/tidregistrering/:id', authenticateToken, async (req, res) => {
      try {
        const user = await requireUser(req, res);
        if (!user) return;
        const ctx = await ctxOrFail(res);
        if (!ctx) return;
        const id = String(req.params.id || '').trim();
        if (!id) return res.status(400).json({ error: 'id saknas' });

        const existing = await getEntry({ ...ctx, id });
        if (!assertByraAccess(user, existing.byraId, res)) return;
        if (existing.status === STATUS.INVOICED) {
          return res.status(409).json({ error: 'Fakturerad tid kan inte ändras' });
        }

        const body = req.body || {};
        const merged = {
          customerId: body.customerId != null ? body.customerId : existing.customerId,
          customerName: body.customerName != null ? body.customerName : existing.customerName,
          uppdragId: body.uppdragId != null ? body.uppdragId : existing.uppdragId,
          uppdragsnamn: body.uppdragsnamn != null ? body.uppdragsnamn : existing.uppdragsnamn,
          koringId: body.koringId != null ? body.koringId : existing.koringId,
          motesbokningId: body.motesbokningId != null ? body.motesbokningId : existing.motesbokningId,
          date: body.date != null ? body.date : existing.date,
          start: body.start != null ? body.start : existing.start,
          end: body.end != null ? body.end : existing.end,
          hours: body.hours != null ? body.hours : existing.hours,
          description: body.description != null ? body.description : existing.description,
          activity: body.activity != null ? body.activity : existing.activity,
          rate: body.rate !== undefined ? body.rate : existing.rate,
          amount: body.amount !== undefined ? body.amount : undefined,
          status: body.status != null ? body.status : existing.status,
          performedBy: body.performedBy,
          performedByName: body.performedByName
        };
        const prislista = await fetchByraPrislista({ ...ctx, byraId: existing.byraId });
        const { input, resolved } = applyResolvedRate(merged, prislista);
        const fields = buildEntryFields(input, { forCreate: false, user });
        delete fields['Byrå ID'];
        delete fields.Skapad;
        delete fields['Skapad av'];

        const entry = await updateEntry({ ...ctx, id, fields });
        res.json({
          entry,
          invoiceLine: toInvoiceLine(entry),
          rateResolved: resolved || undefined
        });
      } catch (err) {
        const status = err.status || err.response?.status || 500;
        const msg = err.response?.data?.error?.message || err.message;
        console.error('PUT /api/tidregistrering:', msg);
        res.status(status).json({ error: msg || 'Kunde inte uppdatera tid' });
      }
    });

    app.put('/api/tidregistrering/bulk/status', authenticateToken, async (req, res) => {
      try {
        const user = await requireUser(req, res);
        if (!user) return;
        const ctx = await ctxOrFail(res);
        if (!ctx) return;

        const ids = Array.isArray(req.body?.ids)
          ? req.body.ids.map((x) => String(x || '').trim()).filter(Boolean)
          : [];
        const statusRaw = String(req.body?.status || '').trim();
        if (!ids.length) return res.status(400).json({ error: 'Inga poster valda' });
        if (!STATUS_SET.has(statusRaw)) {
          return res.status(400).json({ error: 'Ogiltig status' });
        }
        const status = normalizeStatus(statusRaw);
        if (ids.length > 100) {
          return res.status(400).json({ error: 'Max 100 poster per bulk-åtgärd' });
        }

        const updated = [];
        const skipped = [];
        const errors = [];
        const nowIso = new Date().toISOString();

        for (const id of ids) {
          try {
            const existing = await getEntry({ ...ctx, id });
            if (user.role !== 'ClientFlowAdmin' && String(user.byraId) !== String(existing.byraId)) {
              skipped.push({ id, reason: 'Ingen behörighet' });
              continue;
            }
            if (existing.status === STATUS.INVOICED && status !== STATUS.INVOICED) {
              skipped.push({ id, reason: 'Fakturerad tid kan inte ändras' });
              continue;
            }
            if (status === STATUS.INVOICED && existing.status !== STATUS.READY && existing.status !== STATUS.INVOICED) {
              skipped.push({ id, reason: 'Endast Klar kan markeras fakturerad', status: existing.status });
              continue;
            }
            const entry = await updateEntry({
              ...ctx,
              id,
              fields: { Status: status, Uppdaterad: nowIso }
            });
            updated.push(entry);
          } catch (err) {
            errors.push({ id, error: err.response?.data?.error?.message || err.message });
          }
        }

        res.json({
          success: errors.length === 0 && skipped.length === 0,
          status,
          updated: updated.map((e) => ({ id: e.id, status: e.status })),
          skipped,
          errors,
          count: updated.length
        });
      } catch (err) {
        const msg = err.response?.data?.error?.message || err.message;
        console.error('PUT /api/tidregistrering/bulk/status:', msg);
        res.status(err.response?.status || 500).json({ error: msg || 'Kunde inte uppdatera status' });
      }
    });

    app.put('/api/tidregistrering/:id/status', authenticateToken, async (req, res) => {
      try {
        const user = await requireUser(req, res);
        if (!user) return;
        const ctx = await ctxOrFail(res);
        if (!ctx) return;
        const id = String(req.params.id || '').trim();
        const status = normalizeStatus(req.body?.status);
        if (!id) return res.status(400).json({ error: 'id saknas' });
        if (!STATUS_SET.has(String(req.body?.status || '').trim())) {
          return res.status(400).json({ error: 'Ogiltig status' });
        }

        const existing = await getEntry({ ...ctx, id });
        if (!assertByraAccess(user, existing.byraId, res)) return;

        const entry = await updateEntry({
          ...ctx,
          id,
          fields: { Status: status, Uppdaterad: new Date().toISOString() }
        });
        res.json({ entry, invoiceLine: toInvoiceLine(entry) });
      } catch (err) {
        const msg = err.response?.data?.error?.message || err.message;
        console.error('PUT /api/tidregistrering status:', msg);
        res.status(err.response?.status || 500).json({ error: msg || 'Kunde inte uppdatera status' });
      }
    });

    app.delete('/api/tidregistrering/:id', authenticateToken, async (req, res) => {
      try {
        const user = await requireUser(req, res);
        if (!user) return;
        const ctx = await ctxOrFail(res);
        if (!ctx) return;
        const id = String(req.params.id || '').trim();
        if (!id) return res.status(400).json({ error: 'id saknas' });

        const existing = await getEntry({ ...ctx, id });
        if (!assertByraAccess(user, existing.byraId, res)) return;
        if (existing.status === STATUS.INVOICED) {
          return res.status(409).json({ error: 'Fakturerad tid kan inte raderas' });
        }

        await deleteEntry({ ...ctx, id });
        res.json({ success: true, id });
      } catch (err) {
        const msg = err.response?.data?.error?.message || err.message;
        console.error('DELETE /api/tidregistrering:', msg);
        res.status(err.response?.status || 500).json({ error: msg || 'Kunde inte radera tid' });
      }
    });
  }

  return { registerRoutes };
}

module.exports = {
  createTidregistrering,
  TABLE_NAME,
  STATUS,
  recordToEntry,
  toInvoiceLine,
  summarizeEntries,
  buildEntryFields,
  computeAmount,
  roundHours,
  normalizeStatus,
  dateOnly,
  parsePrislista,
  collectHourlyRates,
  resolveHourlyRateFromPrislista,
  prislistaFromByraFields,
  applyResolvedRate,
  enrichEntryWithPrislista
};
