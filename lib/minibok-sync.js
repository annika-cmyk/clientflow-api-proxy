/**
 * Minibok ↔ Clientflow kundsynk
 * API: GET/POST /api/v1/companies
 * Webhook till Minibok vid kundändringar i Clientflow
 */

const axios = require('axios');

const KUNDDATA_TABLE = 'tblOIuLQS2DqmOQWe';
const OFFICER_ROLES = new Set([
  'VD', 'Styrelseledamot', 'Styrelseordförande', 'Suppleant', 'Revisor',
  'Firmatecknare', 'Verklig huvudman', 'Ägare EF', 'Ombud'
]);

function normalizeOrgNr(orgNr) {
  let digits = String(orgNr || '').replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('16')) {
    digits = digits.slice(2);
  }
  if (digits.length > 10) {
    digits = digits.slice(-10);
  }
  return digits;
}

function orgNrVariants(orgNr) {
  const base = normalizeOrgNr(orgNr);
  if (!base) return [];
  const variants = [base];
  if (base.length === 10) {
    const yy = parseInt(base.substring(0, 2), 10);
    const currentYear = new Date().getFullYear() % 100;
    variants.push((yy > currentYear ? '19' : '20') + base);
    variants.push(base.replace(/^(\d{6})(\d{4})$/, '$1-$2'));
  }
  return [...new Set(variants)];
}

function escAirtable(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function recordOrgNr(fields) {
  return String(fields?.Orgnr || fields?.orgnr || '').replace(/\D/g, '');
}

function userOwnsRecord(fields, userId) {
  if (!userId) return false;
  const uid = String(userId);
  const raw = fields?.['Användare'];
  const list = raw == null ? [] : (Array.isArray(raw) ? raw : [raw]);
  return list.some((u) => String(u) === uid);
}

function parseKontaktPersonerRaw(fields) {
  const raw = fields?.Kontaktpersoner || fields?.Befattningshavare || '';
  if (!raw) return [];
  const s = String(raw).trim();
  if (s.startsWith('[')) {
    try {
      return JSON.parse(s) || [];
    } catch (_) {
      return [];
    }
  }
  return s.split('\n').map((r) => r.trim()).filter(Boolean).map((r) => {
    const match = r.match(/^(.+?)\s*\((.+)\)$/);
    return {
      namn: match ? match[1].trim() : r,
      roller: match ? [match[2].trim()] : []
    };
  });
}

function splitContactsAndOfficers(persons, befattningRecords = []) {
  const contacts = [];
  const officers = [];
  const seen = new Set();

  const addOfficer = (p, title) => {
    const key = `${(p.name || '').toLowerCase()}|${title}`;
    if (!p.name || seen.has(key)) return;
    seen.add(key);
    officers.push({
      id: p.id || key,
      name: p.name,
      email: p.email || '',
      phone: p.phone || '',
      title: title || 'Befattningshavare'
    });
  };

  const addContact = (p) => {
    const key = `contact|${(p.name || '').toLowerCase()}|${p.email || ''}`;
    if (!p.name || seen.has(key)) return;
    seen.add(key);
    contacts.push({
      id: p.id || key,
      name: p.name,
      email: p.email || '',
      phone: p.phone || '',
      role: 'kontaktperson'
    });
  };

  for (const p of persons) {
    const roller = Array.isArray(p.roller) ? p.roller : (p.roll ? [p.roll] : []);
    const person = {
      id: p.id || p.personnr || '',
      name: p.namn || p.name || '',
      email: p.epost || p.email || '',
      phone: p.telefon || p.phone || ''
    };
    const isKontakt = roller.some((r) => /kontaktperson/i.test(String(r)));
    const officerTitles = roller.filter((r) => OFFICER_ROLES.has(String(r)));

    if (isKontakt) addContact(person);
    if (officerTitles.length) {
      officerTitles.forEach((t) => addOfficer(person, t));
    } else if (roller.length) {
      addOfficer(person, roller.join(', '));
    }
  }

  for (const rec of befattningRecords) {
    const f = rec.fields || rec;
    addOfficer({
      id: rec.id || '',
      name: f.Namn || f.name || '',
      email: f['E-post'] || f.epost || f.email || '',
      phone: f.Telefon || f.telefon || f.phone || ''
    }, f.Roll || f.roll || f.title || 'Befattningshavare');
  }

  return { contacts, officers };
}

function formatCompany(record, contacts, officers) {
  const f = record.fields || {};
  return {
    id: record.id,
    name: f.Namn || '',
    orgNr: normalizeOrgNr(f.Orgnr || recordOrgNr(f)),
    email: f['e-post'] || f.Email || f['E-post'] || f.mailaddress || ''
  };
}

function createMinibokSync(deps) {
  const {
    getAirtableUser,
    getBolagsverketToken,
    getBolagsverketEnvironment,
    authenticateToken,
    BEFATTNINGSHAVARE_TABLE = 'Befattningshavare'
  } = deps;

  const airtableBaseId = () => process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
  const airtableToken = () => process.env.AIRTABLE_ACCESS_TOKEN;
  const minibokApiKey = () => process.env.MINIBOK_API_KEY || process.env.CLIENTFLOW_API_KEY;
  const minibokWebhookUrl = () => process.env.MINIBOK_WEBHOOK_URL;

  function authenticateMinibokApi(req, res, next) {
    const expected = minibokApiKey();
    if (!expected) {
      return res.status(503).json({ error: 'MINIBOK_API_KEY är inte konfigurerad' });
    }
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    const alt = req.headers['x-api-key'] || req.headers['x-clientflow-secret'] || '';
    if (token !== expected && alt !== expected) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
  }

  function resolveUserEmail(req) {
    const fromHeader = req.headers['x-user-email'];
    const fromQuery = req.query?.userEmail;
    const fromBody = req.body?.userEmail;
    const email = (fromHeader || fromQuery || fromBody || '').toString().trim().toLowerCase();
    return email || null;
  }

  async function fetchBefattningshavare(orgNr) {
    const token = airtableToken();
    if (!token) return [];
    try {
      const formula = encodeURIComponent(`{Företag}="${escAirtable(orgNr)}"`);
      const url = `https://api.airtable.com/v0/${airtableBaseId()}/${encodeURIComponent(BEFATTNINGSHAVARE_TABLE)}?filterByFormula=${formula}`;
      const res = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 10000
      });
      return res.data.records || [];
    } catch (_) {
      return [];
    }
  }

  async function loadCompanyPayload(record) {
    const orgNr = normalizeOrgNr(recordOrgNr(record.fields));
    const persons = parseKontaktPersonerRaw(record.fields);
    const befattningRecords = await fetchBefattningshavare(orgNr);
    const { contacts, officers } = splitContactsAndOfficers(persons, befattningRecords);
    return {
      company: formatCompany(record, contacts, officers),
      contacts,
      officers
    };
  }

  async function findCompanyForUser(orgNr, userEmail) {
    const token = airtableToken();
    if (!token) throw new Error('Airtable token saknas');

    const user = await getAirtableUser(userEmail);
    if (!user?.id) return { user: null, record: null };

    const variants = orgNrVariants(orgNr);
    if (!variants.length) return { user, record: null };

    const orgConditions = variants.map((o) => `{Orgnr}="${escAirtable(o)}"`).join(',');
    const formula = orgConditions.includes(',') ? `OR(${orgConditions})` : orgConditions;
    const url = `https://api.airtable.com/v0/${airtableBaseId()}/${KUNDDATA_TABLE}?filterByFormula=${encodeURIComponent(formula)}&maxRecords=50`;
    const res = await axios.get(url, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 15000
    });

    const target = normalizeOrgNr(orgNr);
    const record = (res.data.records || []).find((r) => {
      const recOrg = recordOrgNr(r.fields);
      const orgMatch = recOrg === target || recOrg.endsWith(target) || target.endsWith(recOrg.slice(-10));
      return orgMatch && userOwnsRecord(r.fields, user.id);
    }) || null;

    return { user, record };
  }

  async function patchOptionalFields(recordId, fields) {
    const token = airtableToken();
    if (!token || !recordId || !fields || !Object.keys(fields).length) return;
    try {
      await axios.patch(
        `https://api.airtable.com/v0/${airtableBaseId()}/${KUNDDATA_TABLE}/${recordId}`,
        { fields },
        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, timeout: 10000 }
      );
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.message || '';
      if (/UNKNOWN_FIELD_NAME/i.test(msg)) {
        console.warn('⚠️ Minibok: valfria Airtable-fält saknas:', Object.keys(fields).join(', '));
        return;
      }
      throw err;
    }
  }

  async function fetchBolagsverketOrg(orgNr) {
    const environment = getBolagsverketEnvironment();
    const token = await getBolagsverketToken();
    const orgUrl = environment === 'test'
      ? 'https://gw-accept2.api.bolagsverket.se/vardefulla-datamangder/v1/organisationer'
      : 'https://gw.api.bolagsverket.se/vardefulla-datamangder/v1/organisationer';

    let ident = normalizeOrgNr(orgNr);
    const headers = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: '*/*'
    };

    const toTwelve = (ten) => {
      const only = String(ten).replace(/\D/g, '');
      if (only.length !== 10) return only;
      const yy = parseInt(only.substring(0, 2), 10);
      const century = yy > (new Date().getFullYear() % 100) ? '19' : '20';
      return century + only;
    };

    try {
      let res = await axios.post(orgUrl, { identitetsbeteckning: ident }, { headers, timeout: 15000 });
      if (res.data?.organisationer?.[0]) return { orgData: res.data.organisationer[0], cleanOrgNumber: ident };
    } catch (err) {
      if (err.response?.status === 400 && ident.length === 10) {
        ident = toTwelve(ident);
        const res = await axios.post(orgUrl, { identitetsbeteckning: ident }, { headers, timeout: 15000 });
        if (res.data?.organisationer?.[0]) return { orgData: res.data.organisationer[0], cleanOrgNumber: ident };
      }
      console.warn('⚠️ Minibok Bolagsverket:', err.message);
    }
    return { orgData: null, cleanOrgNumber: ident };
  }

  function mapBolagsverketToFields(orgData, cleanOrgNumber, user, body) {
    const companyNames = [];
    if (orgData?.organisationsnamn?.organisationsnamnLista) {
      orgData.organisationsnamn.organisationsnamnLista.forEach((n) => {
        if (n.namn) companyNames.push(n.namn);
      });
    }
    const addr = orgData?.postadressOrganisation?.postadress;
    const addressStr = addr
      ? [addr.utdelningsadress, addr.postnummer, addr.postort].filter(Boolean).join(', ')
      : '';

    const pickForm = (v) => {
      if (!v) return '';
      if (typeof v === 'string') return v;
      return v.klartext || v.beskrivning || v.text || v.kod || '';
    };

    const isActive = (() => {
      if (orgData?.verksamOrganisation?.kod === 'JA') return true;
      if (orgData?.avregistreradOrganisation?.fel) return true;
      if (orgData?.avregistreringsorsak?.fel) return true;
      return false;
    })();

    const fields = {
      Orgnr: cleanOrgNumber,
      Namn: companyNames[0] || body.name || '',
      'e-post': body.email || '',
      'Användare': user.id ? String(user.id) : '',
      'Byrå ID': user.byraId ? String(user.byraId).replace(/,/g, '') : '',
      Kundstatus: 'Lead',
      Address: addressStr,
      Bolagsform: pickForm(orgData?.organisationsform) || pickForm(orgData?.juridiskForm) || '',
      regdatum: orgData?.organisationsdatum?.registreringsdatum || '',
      'Aktivt företag': isActive ? 'Ja' : 'Nej',
      Verksamhetsbeskrivning: orgData?.verksamhetsbeskrivning?.beskrivning
        || orgData?.verksamhetsbeskrivning?.klartext || '',
      'Minibok pending': true,
      'Minibok källa': body.source || 'minibok'
    };

    if (body.minibokCompanyId) {
      fields['Minibok company id'] = String(body.minibokCompanyId);
    }

    return fields;
  }

  async function createAirtableRecord(fields) {
    const token = airtableToken();
    const url = `https://api.airtable.com/v0/${airtableBaseId()}/${KUNDDATA_TABLE}`;
    try {
      const res = await axios.post(url, { fields }, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        timeout: 15000
      });
      return res.data;
    } catch (err) {
      const msg = err.response?.data?.error?.message || '';
      if (err.response?.status === 422 && /UNKNOWN_FIELD_NAME/i.test(msg)) {
        const safe = { ...fields };
        ['Minibok pending', 'Minibok källa', 'Minibok company id', 'Kundstatus'].forEach((k) => delete safe[k]);
        const res = await axios.post(url, { fields: safe }, {
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          timeout: 15000
        });
        return res.data;
      }
      throw err;
    }
  }

  async function sendMinibokWebhook(event, userEmail, record) {
    const url = minibokWebhookUrl();
    const key = minibokApiKey();
    if (!url || !key || !record) return;

    try {
      const payload = await loadCompanyPayload(record);
      const body = {
        event,
        userEmail: userEmail.toLowerCase(),
        company: payload.company,
        contacts: payload.contacts,
        officers: payload.officers
      };

      await axios.post(url, body, {
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          'X-Clientflow-Secret': key
        },
        timeout: 15000
      });
      console.log(`✅ Minibok webhook skickad (${event}) för ${payload.company.orgNr}`);
    } catch (err) {
      console.error('❌ Minibok webhook misslyckades:', err.response?.data || err.message);
    }
  }

  async function notifyMinibokClientChange(event, userEmail, recordOrId, options = {}) {
    if (options.skipWebhook) return;
    const token = airtableToken();
    if (!token || !userEmail) return;

    let record = recordOrId;
    if (typeof recordOrId === 'string') {
      try {
        const res = await axios.get(
          `https://api.airtable.com/v0/${airtableBaseId()}/${KUNDDATA_TABLE}/${recordOrId}`,
          { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 }
        );
        record = res.data;
      } catch (_) {
        return;
      }
    }
    if (!record?.id) return;
    await sendMinibokWebhook(event, userEmail, record);
  }

  function registerRoutes(app) {
    // GET /api/v1/companies
    app.get('/api/v1/companies', authenticateMinibokApi, async (req, res) => {
      try {
        const orgNr = req.query.orgNr;
        const userEmail = resolveUserEmail(req);
        if (!orgNr || !userEmail) {
          return res.status(400).json({ error: 'orgNr och userEmail krävs' });
        }

        const { user, record } = await findCompanyForUser(orgNr, userEmail);
        if (!user) {
          return res.status(404).json({ error: 'Användare hittades inte', exists: false });
        }
        if (!record) {
          return res.json({ exists: false });
        }

        const payload = await loadCompanyPayload(record);
        return res.json({
          exists: true,
          company: payload.company,
          contacts: payload.contacts,
          officers: payload.officers
        });
      } catch (err) {
        console.error('❌ GET /api/v1/companies:', err.message);
        return res.status(500).json({ error: err.message || 'Serverfel' });
      }
    });

    // POST /api/v1/companies
    app.post('/api/v1/companies', authenticateMinibokApi, async (req, res) => {
      try {
        const { orgNr, name, email, userEmail, minibokCompanyId, source } = req.body || {};
        const resolvedEmail = (userEmail || resolveUserEmail(req) || '').toLowerCase();
        if (!orgNr || !resolvedEmail) {
          return res.status(400).json({ error: 'orgNr och userEmail krävs' });
        }

        const user = await getAirtableUser(resolvedEmail);
        if (!user?.id) {
          return res.status(404).json({ error: 'Användare hittades inte i Clientflow' });
        }
        if (!user.byraId) {
          return res.status(400).json({ error: 'Användaren saknar kopplad byrå' });
        }

        const { record: existing } = await findCompanyForUser(orgNr, resolvedEmail);
        if (existing) {
          const payload = await loadCompanyPayload(existing);
          return res.json({
            created: false,
            company: payload.company,
            contacts: payload.contacts,
            officers: payload.officers
          });
        }

        const normalized = normalizeOrgNr(orgNr);
        const { orgData, cleanOrgNumber } = await fetchBolagsverketOrg(normalized);
        if (deps.ensureMinibokFields) {
          try { await deps.ensureMinibokFields(airtableToken(), airtableBaseId()); } catch (_) {}
        }
        const fields = mapBolagsverketToFields(orgData, cleanOrgNumber || normalized, user, {
          name, email, minibokCompanyId, source: source || 'minibok'
        });
        if (name && !orgData) fields.Namn = name;
        if (email) fields['e-post'] = email;

        let createdRecord;
        try {
          createdRecord = await createAirtableRecord(fields);
        } catch (createErr) {
          const status = createErr.response?.status;
          if (status === 422 || status === 409) {
            const dupMsg = createErr.response?.data?.error?.message || '';
            if (/duplicate|already/i.test(dupMsg)) {
              return res.status(409).json({
                error: 'duplicate',
                message: 'Organisationsnumret finns redan hos byrån men tillhör en annan användare'
              });
            }
          }
          throw createErr;
        }

        const record = { id: createdRecord.id, fields: createdRecord.fields || fields };
        await patchOptionalFields(createdRecord.id, {
          'Minibok pending': true,
          'Minibok källa': source || 'minibok'
        });

        const payload = await loadCompanyPayload(record);
        return res.status(201).json({
          created: true,
          notificationQueued: true,
          company: payload.company,
          contacts: payload.contacts,
          officers: payload.officers
        });
      } catch (err) {
        console.error('❌ POST /api/v1/companies:', err.response?.data || err.message);
        const status = err.response?.status || 500;
        return res.status(status >= 400 && status < 600 ? status : 500).json({
          error: err.response?.data?.error?.message || err.message || 'Serverfel'
        });
      }
    });

    // GET /api/minibok/notifications – pending Minibok-kunder för inloggad användare
    app.get('/api/minibok/notifications', authenticateToken, async (req, res) => {
      try {
        const token = airtableToken();
        if (!token) return res.status(500).json({ error: 'Airtable token saknas' });

        const user = await getAirtableUser(req.user.email);
        if (!user?.id) return res.status(404).json({ error: 'Användare hittades inte' });

        const uid = escAirtable(user.id);
        const formula = `AND(SEARCH("${uid}", {Användare}&""), {Minibok pending}=TRUE())`;
        let records = [];
        try {
          const url = `https://api.airtable.com/v0/${airtableBaseId()}/${KUNDDATA_TABLE}?filterByFormula=${encodeURIComponent(formula)}&maxRecords=20&fields[]=Namn&fields[]=Orgnr&fields[]=Minibok pending&fields[]=Minibok källa`;
          const airtableRes = await axios.get(url, { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 });
          records = airtableRes.data.records || [];
        } catch (err) {
          if (err.response?.status === 422) {
            const fallbackFormula = `SEARCH("${uid}", {Användare}&"")`;
            const url = `https://api.airtable.com/v0/${airtableBaseId()}/${KUNDDATA_TABLE}?filterByFormula=${encodeURIComponent(fallbackFormula)}&maxRecords=100&fields[]=Namn&fields[]=Orgnr&fields[]=Minibok källa&fields[]=Kundstatus`;
            const airtableRes = await axios.get(url, { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 });
            records = (airtableRes.data.records || []).filter((r) => {
              const src = r.fields?.['Minibok källa'] || r.fields?.['Minibok kalla'];
              return src === 'minibok' && r.fields?.['Minibok pending'] !== false;
            });
          } else {
            throw err;
          }
        }

        const notifications = records.map((r) => ({
          id: r.id,
          companyId: r.id,
          name: r.fields?.Namn || '',
          orgNr: normalizeOrgNr(r.fields?.Orgnr || ''),
          message: 'Ny kund från Minibok som bör hanteras'
        }));

        return res.json({ notifications });
      } catch (err) {
        console.error('❌ GET /api/minibok/notifications:', err.message);
        return res.status(500).json({ error: err.message || 'Serverfel' });
      }
    });

    // POST /api/minibok/notifications/:id/dismiss
    app.post('/api/minibok/notifications/:id/dismiss', authenticateToken, async (req, res) => {
      try {
        const { id } = req.params;
        const user = await getAirtableUser(req.user.email);
        if (!user?.id) return res.status(404).json({ error: 'Användare hittades inte' });

        const token = airtableToken();
        const getRes = await axios.get(
          `https://api.airtable.com/v0/${airtableBaseId()}/${KUNDDATA_TABLE}/${id}`,
          { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 }
        );
        if (!userOwnsRecord(getRes.data.fields, user.id)) {
          return res.status(403).json({ error: 'Du har inte behörighet till denna notis' });
        }

        await patchOptionalFields(id, { 'Minibok pending': false });
        return res.json({ success: true });
      } catch (err) {
        console.error('❌ POST dismiss minibok notification:', err.message);
        return res.status(500).json({ error: err.message || 'Serverfel' });
      }
    });
  }

  return {
    registerRoutes,
    notifyMinibokClientChange,
    normalizeOrgNr,
    authenticateMinibokApi,
    resolveUserEmail,
    findCompanyForUser,
    loadCompanyPayload
  };
}

module.exports = { createMinibokSync, normalizeOrgNr };
