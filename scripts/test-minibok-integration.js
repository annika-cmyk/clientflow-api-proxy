#!/usr/bin/env node
/**
 * Testar Minibok ↔ Clientflow integration.
 * Kör: node scripts/test-minibok-integration.js
 *
 * Miljövariabler:
 *   CLIENTFLOW_BASE_URL  (default http://localhost:3001)
 *   MINIBOK_API_KEY      (krävs)
 *   MINIBOK_WEBHOOK_URL  (default https://minibok.onrender.com/api/clientflow/webhook)
 *   TEST_USER_EMAIL      (default annika@rydenredovisning.se)
 *   TEST_ORG_NR          (default 5567223705 – Bolagsverket-testnummer)
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({
  path: fs.existsSync(path.join(process.cwd(), '.env')) ? '.env' : 'env.env'
});

const axios = require('axios');

const CLIENTFLOW_BASE = (process.env.CLIENTFLOW_BASE_URL || 'http://localhost:3001').replace(/\/$/, '');
const MINIBOK_WEBHOOK = process.env.MINIBOK_WEBHOOK_URL || 'https://minibok.onrender.com/api/clientflow/webhook';
const API_KEY = process.env.MINIBOK_API_KEY || process.env.CLIENTFLOW_API_KEY;
const USER_EMAIL = process.env.TEST_USER_EMAIL || 'annika@rydenredovisning.se';
const TEST_ORG = process.env.TEST_ORG_NR || '5567223705';

function log(title, data) {
  console.log(`\n=== ${title} ===`);
  if (data !== undefined) console.log(typeof data === 'string' ? data : JSON.stringify(data, null, 2));
}

async function runStep(name, fn) {
  try {
    const result = await fn();
    console.log(`✅ ${name}`);
    return { ok: true, result };
  } catch (err) {
    const status = err.response?.status;
    const body = err.response?.data;
    console.error(`❌ ${name}`);
    if (status) console.error(`   HTTP ${status}`);
    if (body) console.error('  ', JSON.stringify(body));
    else console.error(`   ${err.message}`);
    return { ok: false, error: err };
  }
}

async function main() {
  console.log('Minibok ↔ Clientflow integration test');
  console.log(`Clientflow: ${CLIENTFLOW_BASE}`);
  console.log(`Minibok webhook: ${MINIBOK_WEBHOOK}`);
  console.log(`User: ${USER_EMAIL}, orgNr: ${TEST_ORG}`);

  if (!API_KEY) {
    console.error('\n❌ MINIBOK_API_KEY saknas. Sätt samma nyckel som Miniboks CLIENTFLOW_API_KEY i .env/env.env.');
    process.exit(1);
  }

  const authHeaders = {
    Authorization: `Bearer ${API_KEY}`,
    'Content-Type': 'application/json',
    'X-User-Email': USER_EMAIL
  };

  // 1. Minibok health
  await runStep('Minibok /api/health', async () => {
    const res = await axios.get('https://minibok.onrender.com/api/health', { timeout: 15000 });
    log('Minibok health', res.data);
    return res.data;
  });

  // 2. Clientflow health
  await runStep('Clientflow /health', async () => {
    const res = await axios.get(`${CLIENTFLOW_BASE}/health`, { timeout: 15000 });
    return res.data;
  });

  // 3. GET company (may not exist)
  const getBefore = await runStep('GET /api/v1/companies (before)', async () => {
    const res = await axios.get(`${CLIENTFLOW_BASE}/api/v1/companies`, {
      params: { orgNr: TEST_ORG, userEmail: USER_EMAIL },
      headers: authHeaders,
      timeout: 20000
    });
    log('GET response', res.data);
    return res.data;
  });

  // 4. POST create (if not exists)
  let created = false;
  if (getBefore.ok && getBefore.result?.exists) {
    console.log('ℹ️ Kunden finns redan – hoppar över POST create');
  } else {
    const postRes = await runStep('POST /api/v1/companies (create)', async () => {
      const res = await axios.post(`${CLIENTFLOW_BASE}/api/v1/companies`, {
        orgNr: TEST_ORG,
        name: 'Minibok integrationstest AB',
        email: 'test@example.com',
        userEmail: USER_EMAIL,
        minibokCompanyId: `mb-test-${Date.now()}`,
        source: 'minibok'
      }, { headers: authHeaders, timeout: 60000 });
      log('POST response', res.data);
      created = !!res.data.created;
      return res.data;
    });
    if (!postRes.ok) process.exitCode = 1;
  }

  // 5. GET after create
  await runStep('GET /api/v1/companies (after)', async () => {
    const res = await axios.get(`${CLIENTFLOW_BASE}/api/v1/companies`, {
      params: { orgNr: TEST_ORG, userEmail: USER_EMAIL },
      headers: authHeaders,
      timeout: 20000
    });
    log('GET after', res.data);
    if (!res.data.exists) throw new Error('Expected exists:true after create');
    return res.data;
  });

  // 6. Webhook till Minibok (simulera Clientflow → Minibok)
  await runStep('POST webhook till Minibok', async () => {
    const payload = {
      event: created ? 'client.created' : 'client.updated',
      userEmail: USER_EMAIL,
      company: {
        id: 'cf-integration-test',
        name: 'Minibok integrationstest AB',
        orgNr: TEST_ORG.replace(/\D/g, '').slice(-10),
        email: 'test@example.com'
      },
      contacts: [{ id: 'c1', name: 'Test Kontakt', email: 'kontakt@example.com', phone: '', role: 'kontaktperson' }],
      officers: [{ id: 'o1', name: 'Test VD', email: 'vd@example.com', phone: '', title: 'VD' }]
    };
    const res = await axios.post(MINIBOK_WEBHOOK, payload, {
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        'X-Clientflow-Secret': API_KEY
      },
      timeout: 20000,
      validateStatus: () => true
    });
    log('Webhook response', { status: res.status, data: res.data });
    if (res.status >= 400) throw new Error(`Webhook returned ${res.status}`);
    return res.data;
  });

  // 7. Auth ska nekas utan nyckel
  await runStep('GET utan Bearer ska ge 401/503', async () => {
    const res = await axios.get(`${CLIENTFLOW_BASE}/api/v1/companies`, {
      params: { orgNr: TEST_ORG, userEmail: USER_EMAIL },
      timeout: 10000,
      validateStatus: () => true
    });
    if (![401, 503].includes(res.status)) throw new Error(`Expected 401/503, got ${res.status}`);
    return res.status;
  });

  console.log('\n✅ Integrationstest klart.');
}

main().catch((err) => {
  console.error('\n❌ Test avbröts:', err.message);
  process.exit(1);
});
