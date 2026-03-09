/**
 * Grist API-klient för ClientFlow.
 * Används när GRIST_API_KEY och GRIST_DOC_ID är satta (ersätter Airtable).
 * Dokumentation: https://support.getgrist.com/rest-api/
 */

const axios = require('axios');

function getGristConfig() {
  const apiKey = process.env.GRIST_API_KEY;
  const docId = process.env.GRIST_DOC_ID;
  const server = (process.env.GRIST_SERVER || 'https://docs.getgrist.com').replace(/\/$/, '');
  const tableUsers = process.env.GRIST_TABLE_USERS || 'Application_Users';
  const tableKunddata = process.env.GRIST_TABLE_KUNDDATA || 'KUNDDATA';
  const columnAirtableRecId = process.env.GRIST_COLUMN_AIRTABLE_REC_ID || '';
  return { apiKey, docId, server, tableUsers, tableKunddata, columnAirtableRecId };
}

function isGristConfigured() {
  const { apiKey, docId } = getGristConfig();
  return !!(apiKey && docId);
}

/**
 * Gör ett anrop till Grist REST API.
 * @param {string} method - GET, POST, PATCH, PUT
 * @param {string} path - t.ex. /api/docs/{docId}/tables/{tableId}/records
 * @param {object} [options] - { params, data }
 */
async function gristRequest(method, path, options = {}) {
  const { apiKey, server } = getGristConfig();
  if (!apiKey) throw new Error('GRIST_API_KEY saknas');
  const url = path.startsWith('http') ? path : `${server}${path.startsWith('/') ? '' : '/'}${path}`;
  const res = await axios({
    method,
    url,
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    params: options.params,
    data: options.data,
    timeout: 20000
  });
  return res.data;
}

/**
 * Hämta records från en tabell.
 * @param {string} docId
 * @param {string} tableId - tabellens ID i Grist (Raw Data)
 * @param {object} [opts] - { filter: { ColumnName: ['value'] }, limit }
 */
async function getRecords(docId, tableId, opts = {}) {
  const { server } = getGristConfig();
  let path = `${server}/api/docs/${docId}/tables/${encodeURIComponent(tableId)}/records`;
  const params = {};
  if (opts.filter && Object.keys(opts.filter).length) {
    params.filter = JSON.stringify(opts.filter);
  }
  if (opts.limit != null) params.limit = opts.limit;
  if (Object.keys(params).length) path += '?' + new URLSearchParams(params).toString();
  const data = await gristRequest('GET', path);
  return data.records || [];
}

/**
 * Hämta en användare från Grist (Application Users) per e-post.
 * Returnerar samma "user"-objektform som getAirtableUser (id, email, password, name, role, byra, etc.)
 */
async function getGristUser(email) {
  if (!email) return null;
  const { docId, tableUsers } = getGristConfig();
  const emailStr = String(email).trim();
  if (!emailStr) return null;

  // Grist filter använder kolumnnamn – prova "Email" och "email"
  let records = await getRecords(docId, tableUsers, {
    filter: { Email: [emailStr] },
    limit: 1
  });
  if (!records || records.length === 0) {
    records = await getRecords(docId, tableUsers, {
      filter: { email: [emailStr] },
      limit: 1
    });
  }
  if (!records || records.length === 0) return null;

  const r = records[0];
  const fields = r.fields || {};
  const id = r.id;

  const findField = (keys) => {
    for (const k of keys) {
      if (fields[k] !== undefined && fields[k] !== null && fields[k] !== '') return fields[k];
    }
    const prefixMatch = (key) => key.toLowerCase().replace(/[^a-z0-9]/g, '');
    for (const k of keys) {
      const match = Object.keys(fields).find(f => prefixMatch(f) === prefixMatch(k));
      if (match && fields[match]) return fields[match];
    }
    return '';
  };

  const rawByraId = findField(['Byra_ID_i_text_2', 'Byrå ID i text 2', 'Byra ID i text 2', 'ByraId']);
  const rawByraIds = fields['Byraer'] || fields['Byråer'] || fields['Byraer'] || [];

  return {
    id: String(id),
    email: (fields['Email'] || fields['email'] || '').toString().trim(),
    password: (findField(['password', 'Password']) || '').toString(),
    name: (findField(['Full_Name', 'Full Name', 'fldU9goXGJs7wk7OZ', 'Name']) || '').toString().trim(),
    role: (fields['Role'] || fields['role'] || 'user').toString(),
    byra: (findField(['Byra', 'Byrå', 'fldcZZOiC9y5BKFWf']) || '').toString(),
    orgnr: (findField(['Orgnr_Byra', 'Orgnr Byrå', 'Orgnr Byra', 'OrgnrByra']) || '').toString(),
    byraId: rawByraId != null && rawByraId !== '' ? String(rawByraId) : '',
    byraIds: Array.isArray(rawByraIds) ? rawByraIds.map((x) => String(x)) : [],
    logo: fields['Logga'] || ''
  };
}

/**
 * Hämta en record från en tabell via Grist SQL (effektivt för get-by-id).
 * Returnerar Airtable-lik format: { id, fields } eller null.
 */
async function getRecordById(docId, tableId, recordId) {
  const numId = parseInt(recordId, 10);
  if (isNaN(numId)) return null;
  const { server } = getGristConfig();
  const path = `${server}/api/docs/${docId}/sql`;
  const data = await gristRequest('POST', path, {
    data: {
      sql: `SELECT * FROM ${tableId} WHERE id = ?`,
      args: [numId],
      timeout: 5000
    }
  });
  const records = data.records || [];
  if (records.length === 0) return null;
  const fields = records[0].fields || {};
  const id = fields.id != null ? fields.id : numId;
  return { id: String(id), fields };
}

/**
 * Lägg till records i en tabell.
 * @param {object[]} records - [ { fields: { ... } } ]
 * @returns {object[]} - [ { id } ] från Grist
 */
async function addRecords(docId, tableId, records) {
  const { server } = getGristConfig();
  const path = `${server}/api/docs/${docId}/tables/${encodeURIComponent(tableId)}/records`;
  const data = await gristRequest('POST', path, { data: { records } });
  return data.records || [];
}

/**
 * Uppdatera records (patch).
 * @param {object[]} records - [ { id, fields: { ... } } ]
 */
async function patchRecords(docId, tableId, records) {
  const { server } = getGristConfig();
  const path = `${server}/api/docs/${docId}/tables/${encodeURIComponent(tableId)}/records`;
  await gristRequest('PATCH', path, { data: { records } });
}

// Kolumnnamn för gamla Airtable record-id (Grist använder Airtable_Id)
const AIRTABLE_ID_COLUMN_NAMES = ['Airtable_Id', 'Airtable Record ID', 'AirtableId', 'Record ID', 'Airtable_ID'];

/**
 * Hämta en kund från KUNDDATA (Grist) via Airtable record-id (recXXX).
 * Provar antingen GRIST_COLUMN_AIRTABLE_REC_ID eller vanliga kolumnnamn.
 * Returnerar { id, fields } eller null.
 */
async function getGristKunddataRecordByAirtableId(airtableRecId) {
  const { docId, tableKunddata, columnAirtableRecId } = getGristConfig();
  if (!airtableRecId) return null;
  const idStr = String(airtableRecId).trim();
  const columnsToTry = columnAirtableRecId ? [columnAirtableRecId] : AIRTABLE_ID_COLUMN_NAMES;

  for (const colName of columnsToTry) {
    try {
      const records = await getRecords(docId, tableKunddata, {
        filter: { [colName]: [idStr] },
        limit: 1
      });
      if (records && records.length > 0) {
        const r = records[0];
        return { id: String(r.id), fields: r.fields || {} };
      }
    } catch (_) {
      // Kolumnen finns kanske inte – prova nästa
      continue;
    }
  }
  return null;
}

/**
 * Hämta en kund från KUNDDATA (Grist). Returnerar Airtable-lik: { id, fields } eller null.
 * recordId kan vara Grist-numeriskt id eller Airtable recXXX (då söks vanliga kolumner för gamla id).
 */
async function getGristKunddataRecord(recordId) {
  const { docId, tableKunddata } = getGristConfig();
  const idStr = String(recordId);
  if (/^rec[A-Za-z0-9]+$/.test(idStr)) {
    const byAirtable = await getGristKunddataRecordByAirtableId(idStr);
    if (byAirtable) return byAirtable;
  }
  return getRecordById(docId, tableKunddata, recordId);
}

/**
 * Hämta kundlista från KUNDDATA med filter på Byra_ID (byrå).
 * filterOpts: { byraId } för Ledare/Anställd med byrå, {} för Admin.
 * AnvändarID används inte för listning – endast Byra_ID matchar.
 */
function _filterValuesForColumn(value) {
  if (value == null || value === '') return [];
  const str = String(value).trim();
  const num = parseInt(str, 10);
  const out = [value];
  if (str && !out.includes(str)) out.push(str);
  if (!Number.isNaN(num) && num.toString() === str && !out.includes(num)) out.push(num);
  return out;
}

async function getGristKunddataList(filterOpts = {}) {
  const { docId, tableKunddata } = getGristConfig();
  const filter = {};
  if (filterOpts.byraId != null && filterOpts.byraId !== '') {
    const byraVals = _filterValuesForColumn(filterOpts.byraId);
    if (byraVals.length) filter['Byra_ID'] = [...new Set(byraVals)];
  }
  let records = await getRecords(docId, tableKunddata, {
    filter: Object.keys(filter).length ? filter : undefined,
    limit: 5000
  });

  if (records.length === 0 && Object.keys(filter).length > 0) {
    const byraId = String(filterOpts.byraId).trim();
    const numByra = parseInt(byraId, 10);
    const all = await getRecords(docId, tableKunddata, { limit: 5000 });
    records = all.filter((r) => {
      const f = r.fields || {};
      const rByra = f['Byra_ID'] ?? f['ByraID'] ?? f['Byra ID'] ?? f['Byrå ID'];
      return String(rByra) === byraId || (Number.isFinite(numByra) && rByra === numByra);
    });
  }

  return records.map(r => ({
    id: String(r.id),
    fields: r.fields || {}
  }));
}

/** Mappning från Airtable/frontend-fältnamn till Grist KUNDDATA-kolumnnamn (Byra_ID i Grist) */
const KUNDDATA_FIELD_MAP = {
  'Byrå ID': 'Byra_ID',
  'ByraID': 'Byra_ID',
  'Användare': 'Anvandare',
  'SNI kod': 'SNI_kod',
  'Aktivt företag': 'aktiv_inaktiv',
  'Senaste årsredovisning': 'Senaste_arsredovisning',
  'Senaste årsredovisning json': 'Senaste_arsredovisning_json',
  'Fg årsredovisning': 'Fg_arsredovisning',
  'Fg årsredovisning json': 'Fg_arsredovisning_json',
  'Ffg årsredovisning': 'Ffg_arsredovisning',
  'Ffg årsredovisning json': 'Ffg_arsredovisning_json'
};

function mapToGristKunddataFields(fields) {
  if (!fields || typeof fields !== 'object') return {};
  const out = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null) continue;
    const gristKey = KUNDDATA_FIELD_MAP[key] || key;
    out[gristKey] = value;
  }
  return out;
}

module.exports = {
  getGristConfig,
  isGristConfigured,
  gristRequest,
  getRecords,
  getRecordById,
  addRecords,
  patchRecords,
  getGristUser,
  getGristKunddataRecord,
  getGristKunddataList,
  mapToGristKunddataFields
};
