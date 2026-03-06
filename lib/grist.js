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
  return { apiKey, docId, server, tableUsers, tableKunddata };
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
  const records = await getRecords(docId, tableUsers, {
    filter: { Email: [email] },
    limit: 1
  });
  if (!records || records.length === 0) return null;

  const r = records[0];
  const fields = r.fields || {};
  const id = r.id; // Grist använder heltal som id

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

  return {
    id: String(id), // Behåll sträng för kompatibilitet med JWT/cookies
    email: fields['Email'] || '',
    password: fields['password'] || '',
    name: findField(['Full Name', 'fldU9goXGJs7wk7OZ', 'Name']),
    role: fields['Role'] || 'user',
    byra: findField(['Byrå', 'Byra', 'fldcZZOiC9y5BKFWf']),
    orgnr: findField(['Orgnr Byrå', 'Orgnr Byra', 'OrgnrByra']),
    byraId: findField(['Byrå ID i text 2', 'Byra ID i text 2', 'ByraId']),
    byraIds: fields['Byråer'] || fields['Byraer'] || fields['Byraer'] || [],
    logo: fields['Logga'] || ''
  };
}

module.exports = {
  getGristConfig,
  isGristConfigured,
  gristRequest,
  getRecords,
  getGristUser
};
