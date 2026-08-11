/**
 * Minibok ↔ Clientflow AML API (Airtable)
 *
 * Exponerar kundrisk, byråns allmänna riskbedömning och AML-policy/rutiner
 * för Miniboks lager-3-regelmotor.
 *
 * Auth: samma som övriga /api/v1/* (Bearer MINIBOK_API_KEY + userEmail)
 *
 * Routes:
 *   GET /api/v1/companies/:clientflowId/aml-risk
 *   GET /api/v1/companies/aml-risk?orgNr=...   (alt. lookup)
 *   GET /api/v1/agency/aml-risk
 *   GET /api/v1/agency/aml-policy
 *   GET /api/v1/aml/meta
 */

// axios lazy-loadas så rena mappers kan testas utan node_modules.
function getAxios() {
  return require('axios');
}

const KUNDDATA_TABLE_DEFAULT = 'tblOIuLQS2DqmOQWe';
const BYRAER_TABLE_DEFAULT = 'Byråer';
const UPPDRAG_TABLE_NAME = 'Uppdrag';

const ALLMAN_RISK_FIELDS = [
  '1. Syfte och Omfattning',
  '2. Beskrivning av Byråns verksamhet',
  'Antal anställda',
  'Omsättning',
  'Antal kundföretag',
  '3. Metod för Riskbedömning ',
  '4. Identifierade Risker och Sårbarheter',
  '5. Riskreducerande Åtgärder och Rutiner',
  '6. Utvärdering och Uppdatering',
  '7. Kommunikation.',
  '8. Värdering av sammantagen risk',
  'Uppdaterad datum',
];

const POLICY_FIELDS = [
  { key: '1. Syfte och omfattning policy', ruleId: 'syfte' },
  { key: '2. Centralt Funktionsansvarig ', ruleId: 'centralt_funktion' },
  { key: 'Centralt funktionsansvarig', ruleId: 'centralt_person' },
  { key: '3. Kundkännedomsåtgärder ', ruleId: 'kundkannedom' },
  { key: '4. Övervakning och Rapportering ', ruleId: 'overvakning' },
  { key: '5. Intern Kontroll ', ruleId: 'intern_kontroll' },
  { key: '6. Anställda och Utbildning', ruleId: 'utbildning' },
  { key: '7. Arkivering av dokumentation', ruleId: 'arkivering' },
  { key: '8. Uppdatering och Utvärdering ', ruleId: 'uppdatering' },
  { key: '9. Kommunikation', ruleId: 'kommunikation' },
  { key: '10. Registrering Byrån ', ruleId: 'registrering' },
  { key: 'Policydokumentet reviderat och godkänt', ruleId: 'policy_reviderat' },
];

function escAirtable(s) {
  return String(s || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function fieldStr(fields, key) {
  if (!fields) return '';
  let val = fields[key];
  if (val === undefined || val === null) val = fields[String(key).trim()];
  if (val === undefined || val === null) return '';
  if (Array.isArray(val)) return val.map((v) => String(v)).join(', ');
  if (typeof val === 'object') return '';
  return String(val).trim();
}

function parseJsonField(raw, fallback) {
  if (raw == null || raw === '') return fallback;
  if (typeof raw === 'object') return raw;
  try {
    const v = JSON.parse(String(raw));
    return v == null ? fallback : v;
  } catch (_) {
    return fallback;
  }
}

/** Lag|Medel|Hog|… → low|medium|high */
function mapOverallRisk(raw) {
  const s = String(raw || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (!s) return null;
  if (s === 'lag' || s === 'low' || s === 'låg' || s.startsWith('lag')) return 'low';
  if (s === 'medel' || s === 'medium' || s === 'med') return 'medium';
  if (s === 'hog' || s === 'high' || s === 'hög' || s.startsWith('hog')) return 'high';
  return null;
}

function truthyCheckbox(v) {
  return v === true || v === 1 || v === '1' || String(v).toLowerCase() === 'true';
}

function extractOwnershipFromKyc(kyc) {
  const markers = [];
  const seen = new Set();
  const add = (name) => {
    const n = String(name || '').trim();
    if (!n || n.length < 2) return;
    const k = n.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    markers.push(n);
  };
  if (!kyc || typeof kyc !== 'object') return markers;
  if (kyc.huvudmanInfo) add(kyc.huvudmanInfo);
  if (Array.isArray(kyc.foretradare)) {
    kyc.foretradare.forEach((p) => add(typeof p === 'string' ? p : p && (p.namn || p.name)));
  }
  return markers;
}

function extractOwnershipFromKontakt(persons) {
  const markers = [];
  const seen = new Set();
  (Array.isArray(persons) ? persons : []).forEach((p) => {
    const name = String((p && (p.namn || p.name)) || '').trim();
    if (!name) return;
    const roller = Array.isArray(p.roller) ? p.roller : (p.roll ? [p.roll] : []);
    const isUbo = roller.some((r) => /verklig huvudman|ägare|delägare|owner|ubo/i.test(String(r)));
    if (!isUbo) return;
    const k = name.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    markers.push(name);
  });
  return markers;
}

/**
 * Mappar KUNDDATA-fält → Minibok aml-risk payload.
 * @param {object} record Airtable record
 * @param {{ riskAtgarderAktiverade?: boolean }} [extra]
 */
function mapCustomerAmlRisk(record, extra) {
  const f = (record && record.fields) || {};
  const kyc = parseJsonField(f['KYC-formular (JSON)'] || f['KYC-formular'], {});
  const persons = (() => {
    const raw = f.Kontaktpersoner || '';
    if (!raw) return [];
    const s = String(raw).trim();
    if (s.startsWith('[')) return parseJsonField(s, []);
    return [];
  })();

  const riskRaw = fieldStr(f, 'Riskniva') || fieldStr(f, 'sammanlagd risk') || fieldStr(f, 'Riskklass');
  const overallRisk = mapOverallRisk(riskRaw);
  const assessedAt = fieldStr(f, 'Riskbedömning utförd datum') || null;
  const expectedTurnoverRange =
    fieldStr(f, 'Omsättning') ||
    (kyc && kyc.omsattning ? String(kyc.omsattning).trim() : '') ||
    null;

  const ownershipMarkers = []
    .concat(extractOwnershipFromKontakt(persons))
    .concat(extractOwnershipFromKyc(kyc));
  const vh = fieldStr(f, 'Verklig huvudman');
  if (vh && !ownershipMarkers.some((m) => m.toLowerCase() === vh.toLowerCase())) {
    ownershipMarkers.push(vh);
  }

  const pepField = f.PEP;
  const pep =
    truthyCheckbox(pepField) ||
    !!(kyc && (kyc.pep === true || kyc.pep === 'Ja' || kyc.pep === 'ja')) ||
    Number(fieldStr(f, 'Antal träffar PEP och sanktionslistor') || 0) > 0;

  const measures = fieldStr(f, 'Atgarder riskbedomning');
  const hotspots = measures
    ? measures.split(/\n|;/).map((s) => s.trim()).filter(Boolean).slice(0, 20)
    : [];

  const rationale =
    fieldStr(f, 'Byrans riskbedomning') ||
    fieldStr(f, 'Motivering') ||
    '';

  return {
    orgNr: String(f.Orgnr || f.orgnr || '').replace(/\D/g, '').slice(-10) || null,
    customerId: record.id,
    assessedAt,
    validUntil: null,
    overallRisk,
    overallRiskRaw: riskRaw || null,
    expectedTurnoverRange,
    riskAtgarderAktiverade: !!(extra && extra.riskAtgarderAktiverade),
    pep: !!pep,
    sanctionsHit: Number(fieldStr(f, 'Antal träffar PEP och sanktionslistor') || 0) > 0,
    industryCodes: [],
    businessSummary: fieldStr(f, 'Verksamhet') || (kyc && kyc.verksamhet) || '',
    ownershipSummary: vh || (ownershipMarkers.length ? ownershipMarkers.join(', ') : ''),
    ownershipMarkers,
    ubo: ownershipMarkers.map((name) => ({ name })),
    hotspots,
    requiredActions: hotspots.slice(),
    rationale,
    kycStatus: fieldStr(f, 'KYC UTFÖRD DATUM') ? 'done' : 'unknown',
    document: null,
  };
}

function mapAgencyAmlRisk(record) {
  const f = (record && record.fields) || {};
  const sections = {};
  ALLMAN_RISK_FIELDS.forEach((key) => {
    const v = fieldStr(f, key);
    if (v) sections[key.trim()] = v;
  });
  const summary =
    fieldStr(f, '8. Värdering av sammantagen risk') ||
    fieldStr(f, '5. Värdering av sammantagen risk') ||
    '';
  const overallRisk = mapOverallRisk(summary) || mapOverallRisk(fieldStr(f, 'Sammantagen risk'));
  const focusAreas = [];
  const idRisk = fieldStr(f, '4. Identifierade Risker och Sårbarheter');
  if (idRisk) {
    idRisk.split(/\n+/).forEach((line) => {
      const t = line.replace(/^[-*•]\s*/, '').trim();
      if (t && t.length < 120) focusAreas.push(t);
    });
  }
  return {
    byraRecordId: record.id,
    assessedAt: fieldStr(f, 'Uppdaterad datum') || null,
    overallRisk,
    focusAreas: focusAreas.slice(0, 30),
    customerSegments: [],
    summary,
    sections,
    document: null,
  };
}

function mapAgencyAmlPolicy(record) {
  const f = (record && record.fields) || {};
  const sections = {};
  const rules = [];
  POLICY_FIELDS.forEach(({ key, ruleId }) => {
    const v = fieldStr(f, key);
    if (!v) return;
    sections[key.trim()] = v;
    // Exponera som rules[] — Minibok policy_match kräver match-objekt för auto-träff;
    // här ger vi label + id så byrån kan komplettera match senare.
    rules.push({
      id: ruleId,
      label: key.trim(),
      // Ingen automatisk match utan explicit match — okänt ≠ träff
    });
  });

  // Inbyggda deterministiska policyregler som speglar vanliga AML-rutiner
  // (kan överstyras/utökas av Minibok agencyPolicy).
  const builtin = [
    {
      id: 'cash_text',
      label: 'Kontantmönster i beskrivning',
      match: { textIncludes: 'kontant' },
    },
  ];
  builtin.forEach((b) => {
    if (!rules.some((r) => r.id === b.id)) rules.push(b);
  });

  const summaryParts = POLICY_FIELDS
    .map(({ key }) => fieldStr(f, key))
    .filter(Boolean);
  const revised = fieldStr(f, 'Policydokumentet reviderat och godkänt');

  return {
    byraRecordId: record.id,
    version: revised || 'airtable',
    updatedAt: fieldStr(f, 'Uppdaterad datum') || revised || null,
    title: 'AML-rutiner / policy (Byråer)',
    summaryMarkdown: summaryParts.slice(0, 3).join('\n\n').slice(0, 8000),
    rules,
    sections,
    document: null,
  };
}

function createMinibokAml({
  authenticateMinibokApi,
  resolveUserEmail,
  resolveMinibokUser,
  findCompanyForUser,
  getAirtableUser,
}) {
  const airtableBaseId = () => process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
  const airtableToken = () => process.env.AIRTABLE_ACCESS_TOKEN;
  const kunddataTableRef = () =>
    process.env.AIRTABLE_TABLE_KUNDDATA_ID ||
    process.env.AIRTABLE_KUNDDATA_TABLE_ID ||
    KUNDDATA_TABLE_DEFAULT;
  const byraerTableRef = () =>
    process.env.BYRAER_TABLE_ID || encodeURIComponent(BYRAER_TABLE_DEFAULT);
  const uppdragTableRef = () =>
    process.env.AIRTABLE_TABLE_UPPDRAG_ID || encodeURIComponent(UPPDRAG_TABLE_NAME);

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

  function byraFilterFormula(byraId) {
    const num = parseInt(byraId, 10);
    return Number.isNaN(num)
      ? `{Byrå ID}="${escAirtable(byraId)}"`
      : `OR({Byrå ID}="${escAirtable(byraId)}",{Byrå ID}=${num})`;
  }

  async function fetchKunddataById(recordId) {
    const token = airtableToken();
    if (!token) throw Object.assign(new Error('Airtable token saknas'), { status: 500 });
    const axios = getAxios();
    const url = `https://api.airtable.com/v0/${airtableBaseId()}/${kunddataTableRef()}/${encodeURIComponent(recordId)}`;
    const res = await axios.get(url, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 15000,
    });
    return res.data;
  }

  async function fetchByraerRecord(byraId) {
    const token = airtableToken();
    if (!token) throw Object.assign(new Error('Airtable token saknas'), { status: 500 });
    const axios = getAxios();
    const formula = byraFilterFormula(byraId);
    const url = `https://api.airtable.com/v0/${airtableBaseId()}/${byraerTableRef()}?filterByFormula=${encodeURIComponent(formula)}&maxRecords=1`;
    const res = await axios.get(url, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 15000,
    });
    return (res.data.records && res.data.records[0]) || null;
  }

  function recordBelongsToByra(fields, byraId) {
    const recByra = fields && fields['Byrå ID'] != null
      ? String(fields['Byrå ID']).replace(/,/g, '').trim()
      : '';
    if (!recByra || !byraId) return false;
    return recByra === String(byraId) || String(byraId).endsWith(recByra) || recByra.endsWith(String(byraId));
  }

  async function fetchRiskAtgarderAktiverade(customerId, byraId) {
    const token = airtableToken();
    if (!token || !customerId) return false;
    try {
      const axios = getAxios();
      const formula = `AND({Kund ID}="${escAirtable(customerId)}",${byraFilterFormula(byraId)})`;
      const url = `https://api.airtable.com/v0/${airtableBaseId()}/${uppdragTableRef()}?filterByFormula=${encodeURIComponent(formula)}&maxRecords=50`;
      const res = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 15000,
      });
      return (res.data.records || []).some((r) =>
        truthyCheckbox(r.fields && r.fields['Riskåtgärder aktiverade'])
      );
    } catch (err) {
      console.warn('⚠️ minibok-aml: kunde inte läsa Riskåtgärder aktiverade:', err.message);
      return false;
    }
  }

  async function buildCustomerPayload(record, byraId) {
    const riskAtgarderAktiverade = await fetchRiskAtgarderAktiverade(record.id, byraId);
    return mapCustomerAmlRisk(record, { riskAtgarderAktiverade });
  }

  function registerRoutes(app) {
    app.get('/api/v1/aml/meta', authenticateMinibokApi, async (_req, res) => {
      return res.json({
        endpoints: [
          'GET /api/v1/companies/:clientflowId/aml-risk',
          'GET /api/v1/companies/aml-risk?orgNr=',
          'GET /api/v1/agency/aml-risk',
          'GET /api/v1/agency/aml-policy',
        ],
        airtable: {
          kunddata: 'KUNDDATA',
          byraer: 'Byråer',
          uppdrag: 'Uppdrag (Riskåtgärder aktiverade)',
        },
        notes: [
          'clientflowId = Airtable KUNDDATA record id (rec…)',
          'overallRisk mappas Lag/Medel/Hog → low/medium/high',
          'expectedTurnoverRange från fältet Omsättning',
          'policy.rules utan match-objekt ger ingen auto-träff i Minibok',
        ],
      });
    });

    // Alt. lookup via orgNr (måste registreras före :clientflowId)
    app.get('/api/v1/companies/aml-risk', authenticateMinibokApi, async (req, res) => {
      try {
        const resolved = await resolveUser(req);
        if (resolved.error) return res.status(resolved.status).json({ error: resolved.error });
        const orgNr = String(req.query.orgNr || req.query.orgnr || '').trim();
        if (!orgNr) {
          return res.status(400).json({ error: 'orgNr eller path /companies/:clientflowId/aml-risk krävs' });
        }
        if (!findCompanyForUser) {
          return res.status(500).json({ error: 'findCompanyForUser saknas' });
        }
        const { record } = await findCompanyForUser(orgNr, resolved.email);
        if (!record) {
          return res.status(404).json({ error: 'Kund hittades inte för orgNr / användare', orgNr });
        }
        const payload = await buildCustomerPayload(record, resolved.byraId);
        return res.json(payload);
      } catch (err) {
        console.error('❌ GET /api/v1/companies/aml-risk:', err.response?.data || err.message);
        const status = err.status || err.response?.status || 500;
        return res.status(status).json({
          error: err.response?.data?.error?.message || err.message || 'Serverfel',
        });
      }
    });

    app.get('/api/v1/companies/:clientflowId/aml-risk', authenticateMinibokApi, async (req, res) => {
      try {
        const resolved = await resolveUser(req);
        if (resolved.error) return res.status(resolved.status).json({ error: resolved.error });
        const clientflowId = String(req.params.clientflowId || '').trim();
        if (!clientflowId || clientflowId === 'aml-risk') {
          return res.status(400).json({ error: 'clientflowId krävs' });
        }
        const record = await fetchKunddataById(clientflowId);
        if (!record || !record.id) {
          return res.status(404).json({ error: 'Kund hittades inte', clientflowId });
        }
        if (!recordBelongsToByra(record.fields, resolved.byraId)) {
          return res.status(403).json({ error: 'Kunden tillhör inte användarens byrå' });
        }
        const payload = await buildCustomerPayload(record, resolved.byraId);
        return res.json(payload);
      } catch (err) {
        console.error('❌ GET /api/v1/companies/:id/aml-risk:', err.response?.data || err.message);
        const status = err.response?.status === 404 ? 404 : (err.status || err.response?.status || 500);
        return res.status(status).json({
          error: err.response?.data?.error?.message || err.message || 'Serverfel',
        });
      }
    });

    app.get('/api/v1/agency/aml-risk', authenticateMinibokApi, async (req, res) => {
      try {
        const resolved = await resolveUser(req);
        if (resolved.error) return res.status(resolved.status).json({ error: resolved.error });
        const record = await fetchByraerRecord(resolved.byraId);
        if (!record) {
          return res.status(404).json({
            error: 'Ingen Byråer-post hittades för er byrå',
            byraId: resolved.byraId,
          });
        }
        return res.json(mapAgencyAmlRisk(record));
      } catch (err) {
        console.error('❌ GET /api/v1/agency/aml-risk:', err.response?.data || err.message);
        const status = err.status || err.response?.status || 500;
        return res.status(status).json({
          error: err.response?.data?.error?.message || err.message || 'Serverfel',
        });
      }
    });

    app.get('/api/v1/agency/aml-policy', authenticateMinibokApi, async (req, res) => {
      try {
        const resolved = await resolveUser(req);
        if (resolved.error) return res.status(resolved.status).json({ error: resolved.error });
        const record = await fetchByraerRecord(resolved.byraId);
        if (!record) {
          return res.status(404).json({
            error: 'Ingen Byråer-post hittades för er byrå',
            byraId: resolved.byraId,
          });
        }
        return res.json(mapAgencyAmlPolicy(record));
      } catch (err) {
        console.error('❌ GET /api/v1/agency/aml-policy:', err.response?.data || err.message);
        const status = err.status || err.response?.status || 500;
        return res.status(status).json({
          error: err.response?.data?.error?.message || err.message || 'Serverfel',
        });
      }
    });
  }

  return {
    registerRoutes,
    mapCustomerAmlRisk,
    mapAgencyAmlRisk,
    mapAgencyAmlPolicy,
    mapOverallRisk,
  };
}

module.exports = {
  createMinibokAml,
  mapCustomerAmlRisk,
  mapAgencyAmlRisk,
  mapAgencyAmlPolicy,
  mapOverallRisk,
  ALLMAN_RISK_FIELDS,
  POLICY_FIELDS,
};
