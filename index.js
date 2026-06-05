const express = require('express');
const axios = require('axios');
const Airtable = require('airtable');
const crypto = require('crypto');
const AdmZip = require('adm-zip');
const { PDFDocument, StandardFonts } = require('pdf-lib');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
let puppeteer = null;
let chromium = null;
let _puppeteerLoadAttempted = false;
function loadPuppeteer() {
  if (_puppeteerLoadAttempted) return puppeteer;
  _puppeteerLoadAttempted = true;
  const isWin = process.platform === 'win32';
  const isServerless = !!process.env.AWS_LAMBDA_FUNCTION_NAME || !!process.env.VERCEL || !!process.env.RENDER;
  if (isWin || !isServerless) {
    try {
      puppeteer = require('puppeteer');
      console.log('✅ Puppeteer laddat (full, inkl. Chromium).');
      return puppeteer;
    } catch (err) {
      console.log('ℹ️ Full Puppeteer misslyckades:', err.message);
    }
  }
  try {
    puppeteer = require('puppeteer-core');
    chromium = require('@sparticuz/chromium');
    console.log('✅ Puppeteer/Chromium laddat (puppeteer-core + @sparticuz/chromium).');
    return puppeteer;
  } catch (err) {
    try {
      puppeteer = require('puppeteer');
      console.log('✅ Puppeteer laddat (full, fallback).');
      return puppeteer;
    } catch (err2) {
      puppeteer = null;
      console.log('ℹ️ Puppeteer inte installerat. PDF-generering ej tillgänglig.');
      return null;
    }
  }
}
const FormData = require('form-data');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Debug: Skriv ut miljövariabler för att verifiera .env läses korrekt
console.log('Environment Variables Debug:');
console.log('  PORT:', process.env.PORT);
console.log('  BOLAGSVERKET_ENVIRONMENT:', process.env.BOLAGSVERKET_ENVIRONMENT);
console.log('  BOLAGSVERKET_CLIENT_ID:', process.env.BOLAGSVERKET_CLIENT_ID ? 'SET' : 'NOT SET');
console.log('  BOLAGSVERKET_CLIENT_SECRET:', process.env.BOLAGSVERKET_CLIENT_SECRET ? 'SET' : 'NOT SET');
console.log('  BOLAGSVERKET_TOKEN_URL:', process.env.BOLAGSVERKET_TOKEN_URL);
console.log('  BOLAGSVERKET_BASE_URL:', process.env.BOLAGSVERKET_BASE_URL);
console.log('  AIRTABLE_ACCESS_TOKEN:', process.env.AIRTABLE_ACCESS_TOKEN ? 'SET' : 'NOT SET');
console.log('  AIRTABLE_BASE_ID:', process.env.AIRTABLE_BASE_ID ? 'SET' : 'NOT SET');
console.log('  AIRTABLE_TABLE_NAME:', process.env.AIRTABLE_TABLE_NAME ? 'SET' : 'NOT SET');
console.log('  OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? 'SET' : 'NOT SET');
console.log('  OPENAI_ASSISTANT_ID:', process.env.OPENAI_ASSISTANT_ID ? 'SET' : 'NOT SET');
console.log('  OPENAI_VECTOR_STORE_ID:', process.env.OPENAI_VECTOR_STORE_ID ? 'SET' : 'NOT SET');
console.log('  DILISENSE_API_KEY:', process.env.DILISENSE_API_KEY ? 'SET' : 'NOT SET');
console.log('');

const cookieParser = require('cookie-parser');

const app = express();
const PORT = process.env.PORT || 3001;

// Trust proxy för Render
app.set('trust proxy', 1);

app.use(cookieParser());

// Middleware – CORS (vid cookies måste origin sättas explicit, aldrig '*')
app.use((req, res, next) => {
    const origin = req.headers.origin;
    const allowOrigin = origin || (req.get('host') ? `${req.protocol || 'https'}://${req.get('host')}` : null);
    if (allowOrigin) {
        res.setHeader('Access-Control-Allow-Origin', allowOrigin);
    } else {
        res.setHeader('Access-Control-Allow-Origin', '*');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, credentials');
    res.setHeader('Access-Control-Allow-Credentials', allowOrigin ? 'true' : 'false');
    
    // Hantera preflight requests
    if (req.method === 'OPTIONS') {
        console.log('🌐 OPTIONS request handled');
        res.status(200).end();
        return;
    }
    
    // Logga alla requests
    console.log('🌐 Request from origin:', req.headers.origin);
    console.log('🌐 Request method:', req.method);
    console.log('🌐 Request URL:', req.url);
    
    next();
});
app.use(express.json({ limit: '50mb' }));
 
 // Serve static frontend
 // Force HTML/JS/CSS to always revalidate (via ETag) so updated frontend code
 // is picked up immediately instead of a stale cached copy lingering in the
 // browser or an intermediate CDN/proxy.
 app.use(express.static(path.join(__dirname, 'public'), {
   etag: true,
   lastModified: true,
   setHeaders: (res, filePath) => {
     if (/\.(html|js|css)$/i.test(filePath)) {
       res.setHeader('Cache-Control', 'no-cache, must-revalidate');
     }
   }
 }));

// Root endpoint for Render
app.get('/', (req, res) => {
  res.json({ 
    message: 'ClientFlow API Proxy Service is running!',
    status: 'OK', 
    timestamp: new Date().toISOString(),
    service: 'API Proxy Service',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      test: '/test',
      docs: 'https://clientflow.onrender.com'
    }
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    service: 'API Proxy Service',
    version: '1.0.0'
  });
});

// Test endpoint
app.get('/test', (req, res) => {
  res.json({
    message: 'API is working!',
    timestamp: new Date().toISOString()
  });
});

// SMTP-status (för felsökning – visar inte värden, bara om variablerna är satta)
app.get('/api/smtp-status', (req, res) => {
  const host = (process.env.SMTP_HOST || '').trim();
  const user = (process.env.SMTP_USER || '').trim();
  const passRaw = process.env.SMTP_PASS ?? process.env.SMTP_PASSWORD;
  const pass = typeof passRaw === 'string' ? passRaw.replace(/^["']|["']$/g, '').trim() : '';
  res.json({
    configured: !!(host && user && pass),
    SMTP_HOST: !!host,
    SMTP_USER: !!user,
    SMTP_PASS: !!pass,
    hint: !pass && (process.env.SMTP_PASS != null || process.env.SMTP_PASSWORD != null)
      ? 'SMTP_PASS/SMTP_PASSWORD finns men är tom – kontrollera värdet i Render och spara om, sedan Manuell Deploy'
      : undefined
  });
});

// Authentication endpoints
// Airtable Users table integration
const USERS_TABLE = 'Application Users';

// Get user from Airtable
async function getUser(email) {
  return getAirtableUser(email);
}

// Function to get user from Airtable
async function getAirtableUser(email) {
  try {
    console.log(`🔍 Fetching user from Airtable for email: ${email}`);
    
    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
    const airtableBaseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
    
    if (!airtableAccessToken) {
      console.error('❌ Airtable Access Token saknas');
      return null;
    }

    // Search for user by email
    const url = `https://api.airtable.com/v0/${airtableBaseId}/${USERS_TABLE}?filterByFormula={Email}="${email}"`;
    console.log(`🔍 Airtable URL: ${url}`);
    
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${airtableAccessToken}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });

    console.log(`🔍 Airtable response: ${response.data.records ? response.data.records.length : 0} records found`);

    if (response.data.records && response.data.records.length > 0) {
      const userRecord = response.data.records[0];
      const fields = userRecord.fields;
      
      // Hitta byrå-fältets värde robust (hanterar encoding-varianter av å/ä/ö)
      const findField = (keys) => {
        for (const k of keys) {
          if (fields[k] !== undefined && fields[k] !== null && fields[k] !== '') return fields[k];
        }
        // Fallback: sök på nyckelns prefix (case-insensitive, för encoding-problem)
        for (const k of keys) {
          const prefix = k.toLowerCase().replace(/[^a-z0-9]/g, '');
          const match = Object.keys(fields).find(f => f.toLowerCase().replace(/[^a-z0-9]/g, '') === prefix);
          if (match && fields[match]) return fields[match];
        }
        return '';
      };

      const user = {
        id: userRecord.id,
        email: fields['Email'] || '',
        password: fields['password'] || '',
        name: findField(['Full Name', 'fldU9goXGJs7wk7OZ']),
        role: fields['Role'] || 'user',
        byra: findField(['Byrå', 'Byra', 'fldcZZOiC9y5BKFWf']),
        orgnr: findField(['Orgnr Byrå', 'Orgnr Byra', 'OrgnrByra']),
        byraId: findField(['Byrå ID i text 2', 'Byra ID i text 2']),
        byraIds: fields['Byråer'] || fields['Byraer'] || [],
        logo: fields['Logga'] || ''
      };
      
      console.log(`🔍 User fields keys: ${Object.keys(fields).join(', ')}`);
      
      console.log(`🔍 User found: ${user.name} (${user.role}) from ${user.byra}`);
      return user;
    }
    
    console.log(`🔍 No user found for email: ${email}`);
    return null;
  } catch (error) {
    console.error('❌ Error fetching user from Airtable:', error.message);
    if (error.response) {
      console.error('❌ Airtable API Error:', {
        status: error.response.status,
        data: error.response.data
      });
    }
    return null;
  }
}

// JWT Secret – i produktion MÅSTE den sättas i miljövariabler
const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? null : 'your-secret-key-change-in-production');
if (process.env.NODE_ENV === 'production' && !JWT_SECRET) {
  console.error('❌ JWT_SECRET saknas. Sätt JWT_SECRET i miljövariabler i produktion.');
  process.exit(1);
}

/**
 * Auth-cookie: i produktion används Secure + SameSite=None (krävs för HTTPS / cross-site).
 * Om du kör NODE_ENV=production lokalt mot http://localhost måste Secure vara av — annars skickar
 * webbläsaren inte cookie (401 på t.ex. /api/ai-chat). Sätt då ALLOW_HTTP_AUTH_COOKIE=true i .env.
 * Använd aldrig ALLOW_HTTP_AUTH_COOKIE på publik HTTPS-produktion.
 */
function getAuthCookieFlags() {
  const isProd = process.env.NODE_ENV === 'production';
  const allowHttp = process.env.ALLOW_HTTP_AUTH_COOKIE === 'true';
  const secure = isProd && !allowHttp;
  return { secure, sameSite: (secure ? 'none' : 'lax') };
}

if (process.env.NODE_ENV === 'production' && process.env.ALLOW_HTTP_AUTH_COOKIE === 'true') {
  console.log('ℹ️ ALLOW_HTTP_AUTH_COOKIE: inloggningscookie utan Secure (enbart för lokal http).');
}

// Middleware to verify JWT token (från cookie eller Authorization header)
const authenticateToken = (req, res, next) => {
  const token = req.cookies?.authToken || (req.headers['authorization'] && req.headers['authorization'].split(' ')[1]);

  if (!token) {
    return res.status(401).json({ message: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ message: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

// Samma som authenticateToken men kräver inte token – sätter req.user om token finns och är giltig
const optionalAuthenticateToken = (req, res, next) => {
  const token = req.cookies?.authToken || (req.headers['authorization'] && req.headers['authorization'].split(' ')[1]);
  if (!token) return next();
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (!err && user) req.user = user;
    next();
  });
};

/** Server-interna axios-anrop till egna /api-rutter måste skicka samma JWT som klienten (cookie eller Authorization). */
function getAuthHeaderForInternalRequests(req) {
  const token = req.cookies?.authToken || (req.headers['authorization'] && req.headers['authorization'].split(' ')[1]);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * All AI i ClientFlow ska gå via er OpenAI-assistent (samma som i Assistants/ChatGPT-byggaren).
 * Sätt OPENAI_ASSISTANT_ID=asst_... och valfritt OPENAI_VECTOR_STORE_ID=vs_... (file_search för rutter som skickar vectorStoreId).
 * Annika-chatt (/api/ai-chat) går via assistenten; vector: OPENAI_CHAT_VECTOR_STORE_ID om satt, annars OPENAI_VECTOR_STORE_ID.
 */
function formatOpenAIAssistantError(err, step) {
  const status = err.response && err.response.status;
  const data = err.response && err.response.data;
  if (data) {
    const d = data;
    const msg = d.error?.message || d.message || (typeof d === 'string' ? d : JSON.stringify(d));
    // Friendly config hint for common misconfigurations
    if (status === 404 && /assistant/i.test(msg) && (/not found/i.test(msg) || /no assistant found/i.test(msg))) {
      return new Error(
        `${step}: OpenAI hittade inte assistenten. Kontrollera att OPENAI_ASSISTANT_ID pekar på en existerande assistent i rätt OpenAI-projekt (och att API-nyckeln tillhör samma projekt). (HTTP ${status})`
      );
    }
    return new Error(`${step}: ${msg} (HTTP ${status})`);
  }
  if (status) {
    return new Error(`${step}: HTTP ${status} (ingen detalj från OpenAI)`);
  }
  return err;
}

function maskId(id, keepStart = 8) {
  const s = (id || '').toString().trim();
  if (!s) return '';
  if (s.length <= keepStart) return s;
  return s.slice(0, keepStart) + '…';
}

// ============================================================
// AI Debug (server-side) — logga vad som skickas till OpenAI
// Aktiveras endast om AI_DEBUG_LOG_PROMPTS=true
// ============================================================
const AI_DEBUG_ENABLED = String(process.env.AI_DEBUG_LOG_PROMPTS || '').toLowerCase() === 'true';
const AI_DEBUG_MAX = Math.max(1, Math.min(parseInt(process.env.AI_DEBUG_MAX || '25', 10) || 25, 200));
const _aiDebugBuffer = [];
let _aiDebugSeq = 0;

function redactAiDebugText(s) {
  const t = (s || '').toString();
  if (!t) return '';
  return t
    // Svenska personnummer (YYYYMMDD-XXXX / YYYYMMDDXXXX)
    .replace(/\b(\d{4})(\d{2})(\d{2})-?(\d{4})\b/g, '$1$2$3-****')
    // E-post
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '***@***')
    // Airtable record ids (recXXXXXXXXXXXX)
    .replace(/\brec[a-zA-Z0-9]{12,}\b/g, 'rec************')
    // OpenAI ids
    .replace(/\basst_[a-zA-Z0-9]{10,}\b/g, 'asst_************')
    .replace(/\bvs_[a-zA-Z0-9]{10,}\b/g, 'vs_************');
}

function pushAiDebugEvent(evt) {
  if (!AI_DEBUG_ENABLED) return null;
  const id = (++_aiDebugSeq).toString();
  const safe = {
    id,
    ts: new Date().toISOString(),
    route: evt.route || '',
    user: evt.user || '',
    assistantIdMasked: evt.assistantIdMasked || null,
    vectorStoreIdMasked: evt.vectorStoreIdMasked || null,
    threadIdMasked: evt.threadIdMasked || null,
    runIdMasked: evt.runIdMasked || null,
    status: evt.status || 'start',
    promptLen: evt.prompt ? String(evt.prompt).length : 0,
    promptRedacted: evt.prompt ? redactAiDebugText(evt.prompt).slice(0, 12000) : ''
  };
  _aiDebugBuffer.unshift(safe);
  if (_aiDebugBuffer.length > AI_DEBUG_MAX) _aiDebugBuffer.length = AI_DEBUG_MAX;
  return id;
}

function updateAiDebugEvent(id, patch) {
  if (!AI_DEBUG_ENABLED || !id) return;
  const idx = _aiDebugBuffer.findIndex(x => x.id === String(id));
  if (idx === -1) return;
  _aiDebugBuffer[idx] = { ..._aiDebugBuffer[idx], ...patch };
}

async function runOpenAIAssistantRun(openaiKey, userContent, opts = {}) {
  const assistantId = opts.assistantId || process.env.OPENAI_ASSISTANT_ID;
  const vectorStoreId = opts.vectorStoreId !== undefined ? opts.vectorStoreId : (process.env.OPENAI_VECTOR_STORE_ID || null);
  const maxWaitMs = opts.maxWaitMs ?? 180000;
  const pollMs = opts.pollMs ?? 1500;
  const threadIdFromCaller = (opts.threadId || '').toString().trim();
  const instructions = (opts.instructions || '').toString().trim();
  const threadIdOut = opts.threadIdOut && typeof opts.threadIdOut === 'object' ? opts.threadIdOut : null;
  const debugMeta = opts.debugMeta || null;
  const debugId = pushAiDebugEvent({
    route: debugMeta?.route || '',
    user: debugMeta?.user || '',
    assistantIdMasked: assistantId ? maskId(assistantId, 12) : null,
    vectorStoreIdMasked: vectorStoreId ? maskId(vectorStoreId, 12) : null,
    status: 'start',
    prompt: userContent
  });

  if (!openaiKey) throw new Error('OPENAI_API_KEY saknas');
  if (!assistantId) {
    throw new Error('OPENAI_ASSISTANT_ID saknas. Lägg till ditt assistent-ID (asst_...) i miljövariabler.');
  }

  const apiBase = 'https://api.openai.com/v1';
  const axiosAssistantHeaders = {
    Authorization: `Bearer ${openaiKey}`,
    'Content-Type': 'application/json',
    'OpenAI-Beta': 'assistants=v2'
  };

  let threadId;
  try {
    if (threadIdFromCaller) {
      threadId = threadIdFromCaller;
      updateAiDebugEvent(debugId, { threadIdMasked: maskId(threadId, 12), status: 'thread_reused' });
    } else {
      const threadRes = await axios.post(
        `${apiBase}/threads`,
        {},
        { headers: axiosAssistantHeaders, timeout: 120000 }
      );
      threadId = threadRes.data?.id;
      updateAiDebugEvent(debugId, { threadIdMasked: threadId ? maskId(threadId, 12) : null, status: 'thread_created' });
    }
  } catch (e) {
    updateAiDebugEvent(debugId, { status: 'error_thread' });
    throw formatOpenAIAssistantError(e, 'OpenAI threads');
  }
  if (!threadId) throw new Error('Inget thread-id från OpenAI');
  if (threadIdOut) threadIdOut.value = threadId;

  // Lägg till användarmeddelandet i tråden
  try {
    await axios.post(
      `${apiBase}/threads/${threadId}/messages`,
      { role: 'user', content: userContent },
      { headers: axiosAssistantHeaders, timeout: 120000 }
    );
    updateAiDebugEvent(debugId, { status: 'message_added' });
  } catch (e) {
    updateAiDebugEvent(debugId, { status: 'error_add_message' });
    throw formatOpenAIAssistantError(e, 'OpenAI thread message');
  }

  const runBody = {
    assistant_id: assistantId,
    ...(instructions ? { instructions } : {}),
    ...(vectorStoreId && { tool_resources: { file_search: { vector_store_ids: [vectorStoreId] } } })
  };
  let runId;
  let runStatus;
  try {
    const runRes = await axios.post(
      `${apiBase}/threads/${threadId}/runs`,
      runBody,
      { headers: axiosAssistantHeaders, timeout: 120000 }
    );
    runId = runRes.data?.id;
    runStatus = runRes.data;
    updateAiDebugEvent(debugId, { runIdMasked: runId ? maskId(runId, 12) : null, status: 'run_created' });
  } catch (e) {
    updateAiDebugEvent(debugId, { status: 'error_run_create' });
    throw formatOpenAIAssistantError(e, 'OpenAI runs');
  }
  if (!runId) throw new Error('Inget run-id från OpenAI');

  const startMs = Date.now();
  while (['queued', 'in_progress', 'cancelling', 'requires_action'].includes(runStatus.status)) {
    if (Date.now() - startMs > maxWaitMs) {
      throw new Error('Timeout – OpenAI-assistenten svarade inte i tid');
    }
    await new Promise((r) => setTimeout(r, pollMs));
    let statusRes;
    try {
      statusRes = await axios.get(
        `${apiBase}/threads/${threadId}/runs/${runId}`,
        { headers: axiosAssistantHeaders, timeout: 60000 }
      );
    } catch (e) {
      updateAiDebugEvent(debugId, { status: 'error_run_status' });
      throw formatOpenAIAssistantError(e, 'OpenAI run status');
    }
    runStatus = statusRes.data;
  }

  if (runStatus.status !== 'completed') {
    updateAiDebugEvent(debugId, { status: `run_${runStatus.status || 'failed'}` });
    const errMsg = runStatus.last_error?.message || runStatus.incomplete_details?.reason || `Status: ${runStatus.status}`;
    throw new Error(errMsg);
  }
  updateAiDebugEvent(debugId, { status: 'completed' });

  let msgRes;
  try {
    msgRes = await axios.get(
      `${apiBase}/threads/${threadId}/messages?limit=25`,
      { headers: axiosAssistantHeaders, timeout: 60000 }
    );
  } catch (e) {
    updateAiDebugEvent(debugId, { status: 'error_messages' });
    throw formatOpenAIAssistantError(e, 'OpenAI messages');
  }
  const oaMessages = msgRes.data?.data || [];
  const assistantMsg = oaMessages.find((m) => m.role === 'assistant' && m.run_id === runId)
    || oaMessages.find((m) => m.role === 'assistant');
  const parts = assistantMsg?.content || [];
  return parts.map((c) => (c.type === 'text' ? (c.text?.value || '') : '')).join('\n').trim();
}

/** Samma assistent-anrop med enkel backoff vid 429/temporära fel. */
async function runOpenAIAssistantRunWithRetry(openaiKey, userContent, opts = {}, retryOpts = {}) {
  const maxAttempts = Math.max(1, Math.min(retryOpts.maxAttempts ?? 3, 8));
  const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      // eslint-disable-next-line no-await-in-loop
      return await runOpenAIAssistantRun(openaiKey, userContent, opts);
    } catch (e) {
      lastErr = e;
      const status = e.response?.status;
      const em = String(e.message || '');
      const shouldRetry =
        status === 429 ||
        status === 500 ||
        status === 502 ||
        status === 503 ||
        status === 504 ||
        /rate limit|429|timeout|temporar|unavailable/i.test(em);
      if (!shouldRetry || attempt === maxAttempts) break;
      const backoff = attempt === 1 ? 1500 : 2800;
      // eslint-disable-next-line no-await-in-loop
      await sleepMs(backoff);
    }
  }
  throw lastErr || new Error('Okänt AI-fel');
}

// Redantera känsliga fält vid loggning – använd aldrig full req.body i loggar
const SENSITIVE_KEYS = ['password', 'token', 'authToken', 'secret', 'authorization', 'cookie', 'lösenord'];
function redactForLog(obj, keysToRedact = SENSITIVE_KEYS) {
  if (obj == null || typeof obj !== 'object') return obj;
  const out = Array.isArray(obj) ? [...obj] : { ...obj };
  for (const key of Object.keys(out)) {
    const lower = String(key).toLowerCase();
    if (keysToRedact.some(k => lower.includes(k.toLowerCase()))) out[key] = '[REDACTED]';
    else if (typeof out[key] === 'object' && out[key] !== null && !Buffer.isBuffer(out[key])) out[key] = redactForLog(out[key], keysToRedact);
  }
  return out;
}

// Rate limiting för inloggning – skyddar mot brute force
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minuter
  max: 10, // max 10 försök per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'För många inloggningsförsök. Försök igen om 15 minuter.'
  }
});

// Login endpoint
app.post('/api/auth/login', loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    // Logga aldrig lösenord eller full body – endast e-post för felsökning
    console.log('🔐 Login attempt for email:', email ? String(email).slice(0, 3) + '…' : '(missing)');

    if (!email || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'E-post och lösenord krävs' 
      });
    }

    // Get user from Airtable
    let user;
    try {
      user = await getUser(email);
    } catch (getUserErr) {
      console.error('🔐 getUser error (Airtable):', getUserErr.message);
      return res.status(500).json({
        success: false,
        message: 'Kunde inte hämta användardata. Kontrollera att Airtable svarar.'
      });
    }
    if (!user) {
      console.log(`🔐 Login failed: User not found for email: ${email}`);
      return res.status(401).json({ 
        success: false, 
        message: 'Felaktig e-post eller lösenord' 
      });
    }

    console.log(`🔐 User found: ${user.name} (${user.role}) from ${user.byra}`);

    // Check password (plain text comparison)
    const isValidPassword = password === user.password;
    if (!isValidPassword) {
      console.log(`🔐 Login failed: Invalid password for user: ${email}`);
      return res.status(401).json({ 
        success: false, 
        message: 'Felaktig e-post eller lösenord' 
      });
    }

    console.log(`🔐 Password valid for user: ${email}`);

    // Generate JWT token
    const token = jwt.sign(
      { 
        id: user.id, 
        email: user.email, 
        name: user.name, 
        role: user.role,
        byra: user.byra,
        orgnr: user.orgnr,
        byraId: user.byraId,
        byraIds: user.byraIds,
        logo: user.logo
      }, 
      JWT_SECRET, 
      { expiresIn: '24h' }
    );

    // Return user data (without password) and token
    const userData = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      byra: user.byra,
      orgnr: user.orgnr,
      byraId: user.byraId,
      byraIds: user.byraIds,
      logo: user.logo
    };

    console.log(`🔐 Login successful: ${user.email} (${user.role}) from ${user.byra}`);

    // Sätt token i httpOnly cookie – inget ska sparas i localStorage
    const { secure: cookieSecure, sameSite: cookieSameSite } = getAuthCookieFlags();
    res.cookie('authToken', token, {
      httpOnly: true,
      secure: cookieSecure,
      sameSite: cookieSameSite,
      maxAge: 24 * 60 * 60 * 1000,
      path: '/'
    });

    res.json({
      success: true,
      message: 'Inloggning lyckades',
      user: userData
    });

  } catch (error) {
    console.error('🔐 Login error:', error);
    console.error('🔐 Error stack:', error.stack);
    res.status(500).json({ 
      success: false, 
      message: 'Ett fel uppstod vid inloggning' 
    });
  }
});

// Verify token endpoint
app.get('/api/auth/verify', authenticateToken, (req, res) => {
  res.json({
    success: true,
    message: 'Token is valid',
    user: req.user
  });
});

// Logout endpoint – rensa auth-cookie (kräver inte inloggning så att knappen alltid fungerar)
app.post('/api/auth/logout', (req, res) => {
  const { secure: cSec, sameSite: cSame } = getAuthCookieFlags();
  res.clearCookie('authToken', { path: '/', httpOnly: true, secure: cSec, sameSite: cSame });
  res.json({
    success: true,
    message: 'Utloggning lyckades'
  });
});

// ============================================================
// GET /api/ai-chat/status — Kontrollera att chat-routen är laddad (för felsökning)
// ============================================================
app.get('/api/ai-chat/status', (req, res) => {
  res.json({ ok: true, message: 'Annika-chat är tillgänglig' });
});

// ============================================================
// GET /api/ai/status — Visa AI-konfiguration (felsökning, ingen hemlig data)
// ============================================================
app.get('/api/ai/status', authenticateToken, (req, res) => {
  res.json({
    ok: true,
    openai: {
      hasApiKey: !!process.env.OPENAI_API_KEY,
      assistantId: process.env.OPENAI_ASSISTANT_ID ? maskId(process.env.OPENAI_ASSISTANT_ID, 12) : null,
      vectorStoreId: process.env.OPENAI_VECTOR_STORE_ID ? maskId(process.env.OPENAI_VECTOR_STORE_ID, 12) : null
    },
    debug: {
      enabled: AI_DEBUG_ENABLED,
      max: AI_DEBUG_MAX,
      count: AI_DEBUG_ENABLED ? _aiDebugBuffer.length : 0
    }
  });
});

// GET /api/ai/debug/requests — lista senaste AI-prompter (redacted)
app.get('/api/ai/debug/requests', authenticateToken, async (req, res) => {
  try {
    const user = await getAirtableUser(req.user.email);
    const allowedRoles = ['ClientFlowAdmin', 'Ledare'];
    if (!user || !allowedRoles.includes(user.role)) return res.status(403).json({ error: 'Saknar behörighet' });
    if (!AI_DEBUG_ENABLED) return res.status(400).json({ error: 'AI debug är avstängt. Sätt AI_DEBUG_LOG_PROMPTS=true och deploya om.' });
    const limit = Math.max(1, Math.min(parseInt(req.query.limit || '10', 10) || 10, AI_DEBUG_MAX));
    res.json({ ok: true, items: _aiDebugBuffer.slice(0, limit) });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Kunde inte lista AI debug' });
  }
});

// GET /api/ai/debug/requests/:id — visa en specifik prompt (redacted)
app.get('/api/ai/debug/requests/:id', authenticateToken, async (req, res) => {
  try {
    const user = await getAirtableUser(req.user.email);
    const allowedRoles = ['ClientFlowAdmin', 'Ledare'];
    if (!user || !allowedRoles.includes(user.role)) return res.status(403).json({ error: 'Saknar behörighet' });
    if (!AI_DEBUG_ENABLED) return res.status(400).json({ error: 'AI debug är avstängt. Sätt AI_DEBUG_LOG_PROMPTS=true och deploya om.' });
    const id = String(req.params.id || '').trim();
    const item = _aiDebugBuffer.find(x => x.id === id);
    if (!item) return res.status(404).json({ error: 'Hittade inte debug-id' });
    res.json({ ok: true, item });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Kunde inte läsa AI debug' });
  }
});

// ============================================================
// GET /api/ai/validate-assistant — Verifiera att assistent-id kan nås med API-nyckeln
// (felsökning, returnerar ingen hemlig data)
// ============================================================
app.get('/api/ai/validate-assistant', authenticateToken, async (req, res) => {
  const openaiKey = process.env.OPENAI_API_KEY;
  const assistantIdRaw = process.env.OPENAI_ASSISTANT_ID;
  const assistantId = (assistantIdRaw || '').toString().trim();
  if (!openaiKey) return res.status(500).json({ ok: false, error: 'OPENAI_API_KEY saknas.' });
  if (!assistantId) return res.status(500).json({ ok: false, error: 'OPENAI_ASSISTANT_ID saknas.' });

  const apiBase = 'https://api.openai.com/v1';
  const headers = {
    Authorization: `Bearer ${openaiKey}`,
    'Content-Type': 'application/json',
    'OpenAI-Beta': 'assistants=v2'
  };

  try {
    const r = await axios.get(`${apiBase}/assistants/${encodeURIComponent(assistantId)}`, {
      headers,
      timeout: 20000
    });
    const a = r.data || {};
    return res.json({
      ok: true,
      assistant: {
        id: a.id ? maskId(a.id, 12) : maskId(assistantId, 12),
        name: a.name || null,
        model: a.model || null
      },
      config: {
        assistantIdMasked: maskId(assistantId, 12),
        assistantIdTrimmed: assistantIdRaw ? (assistantIdRaw !== assistantId) : false
      }
    });
  } catch (e) {
    const status = e.response?.status;
    const msg = e.response?.data?.error?.message || e.response?.data?.message || e.message;
    let visibleAssistants = null;
    // Extra diagnos: lista vilka assistenter nyckeln ser
    if (status === 404 || status === 401) {
      try {
        const listRes = await axios.get(`${apiBase}/assistants`, {
          headers,
          timeout: 20000,
          params: { limit: 50 }
        });
        const items = Array.isArray(listRes.data?.data) ? listRes.data.data : [];
        visibleAssistants = items.slice(0, 50).map(x => ({
          id: x?.id ? maskId(String(x.id), 12) : null,
          name: x?.name || null,
          model: x?.model || null
        }));
      } catch (listErr) {
        visibleAssistants = {
          error: listErr.response?.data?.error?.message || listErr.message || 'Kunde inte lista assistenter'
        };
      }
    }
    return res.status(status || 500).json({
      ok: false,
      error: msg || 'Kunde inte verifiera assistenten',
      hint: (status === 404)
        ? '404 från OpenAI betyder nästan alltid att API-nyckeln inte tillhör samma OpenAI-projekt som assistenten (eller att ID:t innehåller whitespace/är felstavat). Kontrollera också att assistenten inte är borttagen.'
        : undefined,
      visibleAssistants,
      config: {
        assistantIdMasked: maskId(assistantId, 12),
        assistantIdTrimmed: assistantIdRaw ? (assistantIdRaw !== assistantId) : false
      }
    });
  }
});

// ============================================================
// POST /api/ai-chat — Chatta med AI (Annika) om systemet och riskbedömningar
// ============================================================
app.post('/api/ai-chat', authenticateToken, async (req, res) => {
  console.log('💬 POST /api/ai-chat anropad');
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) return res.status(500).json({ error: 'OPENAI_API_KEY saknas.' });
  if (!process.env.OPENAI_ASSISTANT_ID) return res.status(500).json({ error: 'OPENAI_ASSISTANT_ID saknas.' });

  const { message, history = [], threadId: threadIdBody } = req.body || {};
  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'Meddelande krävs.' });
  }

  const userName = (req.user && req.user.name) ? String(req.user.name).trim() : 'Okänd';
  const userByra = (req.user && req.user.byra) ? String(req.user.byra).trim() : '';
  const whoChats = userByra ? `${userName} från ${userByra}` : userName;

  try {
    const systemContent = `Du är en hjälpassistent i ClientFlow för svenska redovisningsbyråer. Du svarar på svenska, professionellt och sakligt.

Viktigt:
- Hitta aldrig på personer, kunder, företag eller detaljer. Om du saknar information, säg det och fråga efter det som behövs.
- Låtsas inte vara en riktig person (t.ex. "Annika"). Skriv i neutral assistent-ton.
- Använd inte smeknamn eller “skämtsam” jargong. Inga emojis.

Vem som chattar nu: ${whoChats}.

Du hjälper till med:
- Hur ClientFlow fungerar (kundkort, riskbedömning, KYC, tjänster, PEP/sanktionsscreening, åtgärder)
- Hur man dokumenterar och arbetar med AML/KYC och riskbedömning enligt PVML (penningtvättslagen)
- Konkreta, korta rekommendationer och tydliga nästa steg

Stil:
- Svara kort och tydligt. Använd gärna punktlistor.
- Referera till användarens fråga och den information som faktiskt finns i konversationen.`;

    const sanitizeChatText = (t, maxLen = 4000) => {
      const s = (t == null) ? '' : String(t);
      // Ta bort kontrolltecken (behåll radbrytningar)
      const cleaned = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
      return cleaned.length > maxLen ? cleaned.slice(0, maxLen) + '…' : cleaned;
    };
    const looksGarbled = (t) => {
      const s = String(t || '');
      if (!s) return true;
      // Mycket "replacement char" eller ovanliga tecken => sannolikt trasigt
      const badCharCount = (s.match(/\uFFFD/g) || []).length;
      if (badCharCount >= 3) return true;
      // Om andelen icke-vanliga tecken är hög (här: inte bokstav/siffra/space/punktuation/vanliga svenska)
      const ok = s.match(/[A-Za-zÅÄÖåäö0-9\s.,;:!?()\-\u2013\u2014"'\/\n]/g);
      const okCount = ok ? ok.length : 0;
      const ratio = okCount / Math.max(1, s.length);
      if (s.length > 200 && ratio < 0.75) return true;
      // Extremt långa "ord" utan mellanslag
      if (/[^\s]{80,}/.test(s)) return true;
      return false;
    };

    const safeMsg = sanitizeChatText(message, 2000);
    const threadIdIn = (threadIdBody && String(threadIdBody).trim()) ? String(threadIdBody).trim() : '';
    const hist = Array.isArray(history) ? history.slice(-10) : [];
    const chatVector =
      (process.env.OPENAI_CHAT_VECTOR_STORE_ID || '').toString().trim()
      || (process.env.OPENAI_VECTOR_STORE_ID || '').toString().trim()
      || null;

    let userContent;
    if (threadIdIn) {
      userContent = safeMsg;
    } else {
      const histLines = hist
        .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
        .map(m => `${m.role === 'user' ? 'Användare' : 'Assistent'}: ${sanitizeChatText(m.content, 1200)}`);
      userContent = [
        '[ClientFlow – roll och kontext]',
        systemContent,
        '',
        ...(histLines.length ? ['Tidigare i samtalet:', ...histLines, ''] : []),
        'Nuvarande fråga:',
        safeMsg
      ].join('\n');
    }

    const threadIdOut = { value: null };
    const reply = await runOpenAIAssistantRunWithRetry(
      openaiKey,
      userContent,
      {
        threadId: threadIdIn || undefined,
        threadIdOut,
        vectorStoreId: chatVector || undefined,
        maxWaitMs: 120000,
        pollMs: 1500,
        debugMeta: { route: '/api/ai-chat', user: req.user?.email || '' }
      },
      { maxAttempts: 3 }
    );

    const safeReply = sanitizeChatText(reply || '', 12000);
    if (!safeReply || looksGarbled(safeReply)) {
      return res.status(502).json({
        error: 'Chatten fick ett trasigt svar. Försök igen. Om det återkommer: korta ner frågan eller ladda om sidan.'
      });
    }
    const outThreadId = threadIdOut.value || threadIdIn || null;
    res.json({ reply: safeReply, threadId: outThreadId });
  } catch (error) {
    console.error('❌ AI-chat fel:', error.message, error.response && error.response.data);
    const msg = error.response?.data?.error?.message || error.message || 'Okänt fel';
    res.status(500).json({ error: 'Chatten svarade inte: ' + msg });
  }
});

// Get current user endpoint
app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    // Hämta komplett användardata från Airtable
    const userData = await getUser(req.user.email);
    
    if (!userData) {
      return res.status(404).json({
        success: false,
        message: 'Användare hittades inte'
      });
    }
    
    res.json({
      success: true,
      user: userData
    });
  } catch (error) {
    console.error('Error fetching user data:', error);
    res.status(500).json({
      success: false,
      message: 'Kunde inte hämta användardata'
    });
  }
});

// Endpoint för att ladda ner base64-fil
app.get('/api/download/:recordId/:fieldName', async (req, res) => {
  try {
    const { recordId, fieldName } = req.params;
    
    console.log(`📥 Begäran om nedladdning: ${fieldName} för record ${recordId}`);
    
    // Hämta data från Airtable (KUNDDATA – årsredovisningsfiler)
    const airtableBaseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
    const KUNDDATA_TABLE = 'tblOIuLQS2DqmOQWe';
    const airtableResponse = await axios.get(
      `https://api.airtable.com/v0/${airtableBaseId}/${KUNDDATA_TABLE}/${recordId}`,
      {
        headers: {
          'Authorization': `Bearer ${process.env.AIRTABLE_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    const base64Data = airtableResponse.data.fields[fieldName];
    
    if (!base64Data) {
      return res.status(404).json({ error: 'Fil hittades inte' });
    }
    
    // Konvertera base64 till buffer
    const fileBuffer = Buffer.from(base64Data, 'base64');
    
    // Bestäm filnamn och content-type baserat på fältnamn
    let filename = 'arsredovisning.pdf';
    let contentType = 'application/pdf';
    
    if (fieldName === 'Senaste årsredovisning fil') {
      filename = 'senaste-arsredovisning.pdf';
    } else if (fieldName === 'Fg årsredovisning fil') {
      filename = 'fg-arsredovisning.pdf';
    } else if (fieldName === 'Ffg årsredovisning fil') {
      filename = 'ffg-arsredovisning.pdf';
    }
    
    // Skicka fil
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(fileBuffer);
    
    console.log(`✅ Fil nedladdad: ${filename} (${(fileBuffer.length / 1024 / 1024).toFixed(2)} MB)`);
    
  } catch (error) {
    console.error('❌ Fel vid nedladdning:', error.message);
    res.status(500).json({ error: 'Kunde inte ladda ner fil' });
  }
});

// Simple POST test endpoint
app.post('/test-post', (req, res) => {
  res.json({
    success: true,
    message: 'POST test endpoint fungerar!',
    body: req.body,
    timestamp: new Date().toISOString()
  });
});

// Debug endpoint för Softr – endast i utveckling och kräver inloggning (ingen exponering av data utan auth)
const isProduction = process.env.NODE_ENV === 'production';
function debugSoftrHandler(method) {
  return (req, res, next) => {
    if (isProduction) {
      return res.status(404).json({ message: 'Not Found' });
    }
    return authenticateToken(req, res, next);
  };
}
app.post('/debug-softr', debugSoftrHandler('POST'), (req, res) => {
  console.log('🔍 DEBUG (auth): Softr POST – fält:', Object.keys(req.body || {}));
  res.json({
    success: true,
    message: 'Debug data mottaget (känsliga fält redantera i logg)',
    availableFields: Object.keys(req.body || {}),
    timestamp: new Date().toISOString()
  });
});

app.get('/debug-softr', debugSoftrHandler('GET'), (req, res) => {
  console.log('🔍 DEBUG (auth): Softr GET – fält:', Object.keys(req.query || {}));
  res.json({
    success: true,
    message: 'Debug GET mottaget',
    availableFields: Object.keys(req.query || {}),
    timestamp: new Date().toISOString()
  });
});

// Environment variables test endpoint
app.get('/test-env', (req, res) => {
  const envVars = {
    AIRTABLE_ACCESS_TOKEN: process.env.AIRTABLE_ACCESS_TOKEN ? 'SET' : 'MISSING',
    AIRTABLE_BASE_ID: process.env.AIRTABLE_BASE_ID ? 'SET' : 'MISSING',
    AIRTABLE_TABLE_NAME: process.env.AIRTABLE_TABLE_NAME ? 'SET' : 'MISSING',
    BOLAGSVERKET_CLIENT_ID: process.env.BOLAGSVERKET_CLIENT_ID ? 'SET' : 'MISSING',
    BOLAGSVERKET_CLIENT_SECRET: process.env.BOLAGSVERKET_CLIENT_SECRET ? 'SET' : 'MISSING',
    BOLAGSVERKET_ENVIRONMENT: process.env.BOLAGSVERKET_ENVIRONMENT ? 'SET' : 'MISSING',
    PORT: process.env.PORT || 'NOT SET (using default)'
  };
  
  console.log('🔍 Environment Variables Check:', envVars);
  
  res.json({
    message: 'Environment variables check',
    environment: envVars,
    timestamp: new Date().toISOString()
  });
});

// Airtable test endpoint
app.get('/api/airtable/test', async (req, res) => {
  const startTime = Date.now();
  
  try {
    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
    const airtableBaseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
    const airtableTableName = process.env.AIRTABLE_TABLE_NAME || 'KUNDDATA';

    if (!airtableAccessToken || !airtableBaseId) {
      throw new Error('Airtable Access Token eller Base ID saknas i miljövariabler');
    }

    console.log('🔍 Testing Airtable API based on documentation...');
    console.log('Token starts with:', airtableAccessToken.substring(0, 20) + '...');
    console.log('Base ID:', airtableBaseId);
    console.log('Table Name:', airtableTableName);

    // Test 1: List records from table (same as our working test)
    console.log('🔍 Test 1: List records from table...');
    const tableUrl = `https://api.airtable.com/v0/${airtableBaseId}/${airtableTableName}?maxRecords=3`;
    
    const tableResponse = await axios.get(tableUrl, {
      headers: {
        'Authorization': `Bearer ${airtableAccessToken}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });

    const records = tableResponse.data.records || [];
    console.log('✅ Success! Found', records.length, 'records');
    
    if (records.length > 0) {
      const firstRecord = records[0];
      const fields = Object.keys(firstRecord.fields || {});
      console.log('First record fields:', fields);
    }

    const duration = Date.now() - startTime;

    res.json({
      success: true,
      message: 'Airtable anslutning fungerar!',
      baseId: airtableBaseId,
      tableName: airtableTableName,
      recordCount: records.length,
      timestamp: new Date().toISOString(),
      duration: duration
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('Error testing Airtable connection:', error.message);
    
    if (error.response) {
      console.error('Airtable API Error:', {
        status: error.response.status,
        data: error.response.data
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Airtable-anslutning misslyckades',
      error: error.message,
      baseId: process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50',
      tableName: process.env.AIRTABLE_TABLE_NAME || 'KUNDDATA',
      timestamp: new Date().toISOString(),
      duration: duration
    });
  }
});

// GET: kontrollera om fältet "Dokumentation Kategorier" finns (Metadata API, read-only)
app.get('/api/setup/airtable-dokumentation-kategorier', authenticateToken, async (req, res) => {
  const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
  const airtableBaseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
  const KUNDDATA_TABLE_ID = 'tblOIuLQS2DqmOQWe';
  const FIELD_NAME = 'Dokumentation Kategorier';

  if (!airtableAccessToken) {
    return res.status(500).json({ success: false, error: 'AIRTABLE_ACCESS_TOKEN saknas' });
  }

  try {
    const metaUrl = `https://api.airtable.com/v0/meta/bases/${airtableBaseId}/tables`;
    const metaRes = await axios.get(metaUrl, {
      headers: { Authorization: `Bearer ${airtableAccessToken}` },
      timeout: 10000
    });
    const tables = metaRes.data?.tables || [];
    const kundTable = tables.find(t => t.id === KUNDDATA_TABLE_ID);
    if (!kundTable) {
      return res.json({ exists: false, error: 'KUNDDATA-tabellen hittades inte' });
    }
    const exists = (kundTable.fields || []).some(f => (f.name || '') === FIELD_NAME);
    return res.json({ exists, fieldName: FIELD_NAME, tableId: KUNDDATA_TABLE_ID });
  } catch (err) {
    const status = err.response?.status;
    return res.status(status && status >= 400 ? status : 500).json({
      exists: false,
      error: err.response?.data?.error?.message || err.message
    });
  }
});

// POST: skapa Airtable-fältet "Dokumentation Kategorier" i KUNDDATA (Metadata API)
// Kräver att AIRTABLE_ACCESS_TOKEN är en Personal Access Token med schema-rättigheter.
app.post('/api/setup/airtable-dokumentation-kategorier', authenticateToken, async (req, res) => {
  const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
  const airtableBaseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
  const KUNDDATA_TABLE_ID = 'tblOIuLQS2DqmOQWe';
  const FIELD_NAME = 'Dokumentation Kategorier';

  if (!airtableAccessToken) {
    return res.status(500).json({ success: false, error: 'AIRTABLE_ACCESS_TOKEN saknas' });
  }

  try {
    const metaUrl = `https://api.airtable.com/v0/meta/bases/${airtableBaseId}/tables`;
    const metaRes = await axios.get(metaUrl, {
      headers: { Authorization: `Bearer ${airtableAccessToken}` },
      timeout: 10000
    });
    const tables = metaRes.data?.tables || [];
    const kundTable = tables.find(t => t.id === KUNDDATA_TABLE_ID);
    if (!kundTable) {
      return res.status(404).json({
        success: false,
        error: `Tabell ${KUNDDATA_TABLE_ID} (KUNDDATA) hittades inte i basen.`
      });
    }

    const hasField = (kundTable.fields || []).some(f => (f.name || '') === FIELD_NAME);
    if (hasField) {
      return res.json({
        success: true,
        message: `Fältet "${FIELD_NAME}" finns redan i tabellen.`,
        alreadyExists: true
      });
    }

    const createUrl = `https://api.airtable.com/v0/meta/bases/${airtableBaseId}/tables/${KUNDDATA_TABLE_ID}/fields`;
    await axios.post(createUrl, {
      name: FIELD_NAME,
      type: 'multilineText'
    }, {
      headers: {
        Authorization: `Bearer ${airtableAccessToken}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });

    return res.json({
      success: true,
      message: `Fältet "${FIELD_NAME}" skapades i KUNDDATA-tabellen.`,
      alreadyExists: false
    });
  } catch (err) {
    const status = err.response?.status;
    const data = err.response?.data || {};
    const msg = data.error?.message || data.message || err.message;
    console.error('Setup Dokumentation Kategorier:', status, msg, data);

    if (status === 403 || status === 401) {
      return res.status(status).json({
        success: false,
        error: 'Token saknar behörighet. Använd en Airtable Personal Access Token med scope schema.bases:read och schema.bases:write.',
        details: msg
      });
    }
    if (status === 422) {
      return res.status(422).json({
        success: false,
        error: 'Airtable accepterade inte förfrågan (t.ex. ogiltigt fältnamn eller typ).',
        details: msg
      });
    }
    return res.status(500).json({
      success: false,
      error: msg || 'Kunde inte skapa fält i Airtable.'
    });
  }
});

// POST /api/setup/airtable-kyc-formular-field – Skapa fältet "KYC-formular (JSON)" i KUNDDATA
app.post('/api/setup/airtable-kyc-formular-field', authenticateToken, async (req, res) => {
  try {
    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
    const baseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
    const KUNDDATA_TABLE_ID = 'tblOIuLQS2DqmOQWe';
    const FIELD_NAME = 'KYC-formular (JSON)';

    // Kolla om fältet redan finns
    const metaUrl = `https://api.airtable.com/v0/meta/bases/${baseId}/tables`;
    const metaRes = await axios.get(metaUrl, { headers: { Authorization: `Bearer ${airtableAccessToken}` }, timeout: 10000 });
    const tables = metaRes.data.tables || [];
    const kundTable = tables.find(t => t.id === KUNDDATA_TABLE_ID);
    if (!kundTable) {
      return res.status(404).json({ success: false, error: `Tabell ${KUNDDATA_TABLE_ID} hittades inte.` });
    }
    const hasField = (kundTable.fields || []).some(f => (f.name || '') === FIELD_NAME);
    if (hasField) {
      return res.json({ success: true, message: `Fältet "${FIELD_NAME}" finns redan.`, alreadyExists: true });
    }

    const createUrl = `https://api.airtable.com/v0/meta/bases/${baseId}/tables/${KUNDDATA_TABLE_ID}/fields`;
    await axios.post(createUrl, { name: FIELD_NAME, type: 'multilineText' }, {
      headers: { Authorization: `Bearer ${airtableAccessToken}`, 'Content-Type': 'application/json' },
      timeout: 10000
    });

    return res.json({ success: true, message: `Fältet "${FIELD_NAME}" har skapats i KUNDDATA-tabellen.`, alreadyExists: false });
  } catch (err) {
    const status = err.response?.status;
    const msg = err.response?.data?.error?.message || err.message;
    console.error('Setup KYC-formular field:', status, msg);
    if (status === 403 || status === 401) {
      return res.status(status).json({ success: false, error: 'Token saknar schema-behörighet. Behöver scope schema.bases:read + schema.bases:write.', details: msg });
    }
    return res.status(500).json({ success: false, error: msg || 'Kunde inte skapa fält.' });
  }
});

// Bolagsverket test endpoint
app.get('/api/bolagsverket/test', (req, res) => {
  res.json({
    success: true,
    message: 'Bolagsverket test endpoint fungerar!',
    timestamp: new Date().toISOString()
  });
});

// OAuth 2.0 Token Management för Bolagsverket
let bolagsverketToken = null;
let tokenExpiry = null;

function getBolagsverketEnvironment() {
  const raw = (process.env.BOLAGSVERKET_ENVIRONMENT || '').toString().trim().toLowerCase();
  // Default: production in deployed environments (safer than accidentally hitting test).
  if (!raw) return 'production';
  if (['test', 'sandbox', 'accept', 'accept2'].includes(raw)) return 'test';
  if (['prod', 'production', 'live'].includes(raw)) return 'production';
  // If someone set an unexpected value, prefer production to avoid sandbox limitations.
  return 'production';
}

async function getBolagsverketToken() {
  // Kontrollera om vi har en giltig token
  if (bolagsverketToken && tokenExpiry && new Date() < tokenExpiry) {
    return bolagsverketToken;
  }

  try {
    const environment = getBolagsverketEnvironment();
    const tokenUrl = environment === 'test'
      ? 'https://portal-accept2.api.bolagsverket.se/oauth2/token'
      : 'https://portal.api.bolagsverket.se/oauth2/token';
     
    if (!process.env.BOLAGSVERKET_CLIENT_ID || !process.env.BOLAGSVERKET_CLIENT_SECRET) {
      throw new Error('Bolagsverket Client ID och Client Secret måste konfigureras');
    }

    const tokenData = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.BOLAGSVERKET_CLIENT_ID,
      client_secret: process.env.BOLAGSVERKET_CLIENT_SECRET,
      scope: 'vardefulla-datamangder:read vardefulla-datamangder:ping'
    });

    console.log(`🔑 Försöker hämta OAuth token från: ${tokenUrl}`);
    console.log(`🔑 Client ID: ${process.env.BOLAGSVERKET_CLIENT_ID.substring(0, 10)}...`);
    console.log(`🔑 Client Secret: ${process.env.BOLAGSVERKET_CLIENT_SECRET.substring(0, 10)}...`);
    
    const response = await axios.post(tokenUrl, tokenData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      timeout: 10000
    });

    bolagsverketToken = response.data.access_token;
    // Sätt utgångstid till 5 minuter före faktisk utgång för säkerhetsmarginal
    tokenExpiry = new Date(Date.now() + (response.data.expires_in - 300) * 1000);

    console.log(`🔑 Ny Bolagsverket OAuth token genererad, utgång: ${tokenExpiry.toISOString()}`);
    console.log(`🔑 Token börjar med: ${bolagsverketToken.substring(0, 20)}...`);
    return bolagsverketToken;

  } catch (error) {
    console.error('❌ Error getting Bolagsverket token:', error.message);
    if (error.response) {
      console.error('❌ Bolagsverket token response:', {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data,
        headers: error.response.headers
      });
    }
    throw error;
  }
}

// Bolagsverket isalive endpoint (health check)
app.get('/api/bolagsverket/isalive', async (req, res) => {
  const startTime = Date.now();
  
  try {
    // Kontrollera om Bolagsverket-credentials finns
    if (!process.env.BOLAGSVERKET_CLIENT_ID || !process.env.BOLAGSVERKET_CLIENT_SECRET) {
      console.log(`❌ Bolagsverket-credentials saknas`);
      
      const duration = Date.now() - startTime;
      
      return res.status(503).json({
        error: 'Bolagsverket-tjänsten är inte konfigurerad',
        message: 'Bolagsverket service is not configured. Please contact administrator.',
        timestamp: new Date().toISOString(),
        duration: duration
      });
    }

    const token = await getBolagsverketToken();
    const environment = getBolagsverketEnvironment();
    const isaliveUrl = environment === 'test'
      ? 'https://gw-accept2.api.bolagsverket.se/vardefulla-datamangder/v1/isalive'
      : 'https://gw.api.bolagsverket.se/vardefulla-datamangder/v1/isalive';

    const response = await axios.get(isaliveUrl, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': '*/*'
      },
      timeout: 10000
    });

    const duration = Date.now() - startTime;

    const responseData = {
      success: true,
      data: response.data,
      timestamp: new Date().toISOString(),
      duration: duration,
      environment: environment,
      source: 'Bolagsverket'
    };

    res.json(responseData);

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('Error in Bolagsverket isalive API:', error.message);
    
    if (error.response) {
      res.status(error.response.status).json({
        error: 'Bolagsverket API fel',
        message: error.response.data?.message || error.message,
        status: error.response.status,
        duration: duration
      });
    } else {
      res.status(500).json({
        error: 'Internt serverfel',
        message: error.message,
        duration: duration
      });
    }
  }
});

// Bolagsverket organisationer endpoint
app.post('/api/bolagsverket/organisationer', async (req, res) => {
  const startTime = Date.now();
  
  // Debug: Logga vad vi får från Softr
  console.log(`📥 Mottaget från Softr:`, {
    body: req.body,
    headers: req.headers,
    method: req.method,
    url: req.url
  });
  
  try {
    // Hantera olika fältnamn som Softr kan skicka
    const organisationsnummer = req.body.organisationsnummer || 
                               req.body.orgnr || 
                               req.body.Orgnr ||
                               req.body.organization_number || 
                               req.body.orgNumber;
    
    if (!organisationsnummer) {
      console.log(`❌ Organisationsnummer saknas. Tillgängliga fält:`, Object.keys(req.body));
      return res.status(400).json({
        error: 'Organisationsnummer är obligatoriskt',
        message: 'Organization number is required. Available fields: ' + Object.keys(req.body).join(', ')
      });
    }

    console.log(`✅ Organisationsnummer hittat:`, organisationsnummer);

    // Validera organisationsnummer
    const orgNumberRegex = /^\d{10}$|^\d{11}$|^\d{12}$/;
    if (!orgNumberRegex.test(organisationsnummer.replace(/[-\s]/g, ''))) {
      console.log(`❌ Ogiltigt organisationsnummer format:`, organisationsnummer);
      return res.status(400).json({
        error: 'Ogiltigt organisationsnummer format',
        message: 'Organization number should be 10-12 digits'
      });
    }

    // Ta bara siffror (stödjer format som 600816-8201, 19600816-8201 osv.)
    let cleanOrgNumber = (organisationsnummer || '').toString().replace(/[^\d]/g, '');
    
    // Använd produktionsmiljö för riktiga organisationsnummer
    const currentEnvironment = getBolagsverketEnvironment();
    if (currentEnvironment === 'test' && (cleanOrgNumber === '199105294475' || cleanOrgNumber === '5567223705')) {
      console.log(`⚠️ Använder känt fungerande testnummer istället för ${cleanOrgNumber}`);
      cleanOrgNumber = '193403223328';
    }
    
    // Kontrollera om Bolagsverket-credentials finns
    if (!process.env.BOLAGSVERKET_CLIENT_ID || !process.env.BOLAGSVERKET_CLIENT_SECRET) {
      console.log(`❌ Bolagsverket-credentials saknas för: ${cleanOrgNumber}`);
      
      const duration = Date.now() - startTime;
      
      return res.status(503).json({
        error: 'Bolagsverket-tjänsten är inte konfigurerad',
        message: 'Bolagsverket service is not configured. Please contact administrator.',
        organisationsnummer: cleanOrgNumber,
        timestamp: new Date().toISOString(),
        duration: duration
      });
    }

    const token = await getBolagsverketToken();
    const environment = getBolagsverketEnvironment();
    const orgUrl = environment === 'test'
      ? 'https://gw-accept2.api.bolagsverket.se/vardefulla-datamangder/v1/organisationer'
      : 'https://gw.api.bolagsverket.se/vardefulla-datamangder/v1/organisationer';

    // Funktion för att bygga 12-siffrigt personnummer (YY → 19YY/20YY)
    const toTwelveDigitPersonnummer = (tenDigits) => {
      const only = (tenDigits || '').toString().replace(/[^\d]/g, '');
      if (only.length !== 10) return only;
      const yy = parseInt(only.substring(0, 2), 10);
      const currentYear = new Date().getFullYear() % 100;
      const century = yy > currentYear ? '19' : '20';
      return century + only;
    };

    // Första försök: använd cleanOrgNumber som är 10–12 siffror
    let requestIdentitetsbeteckning = cleanOrgNumber;
    let response;
    try {
      const requestBody = { identitetsbeteckning: requestIdentitetsbeteckning };

      console.log(`🔍 Skickar till Bolagsverket:`, {
        url: orgUrl,
        body: requestBody,
        orgNumber: requestIdentitetsbeteckning,
        environment: environment
      });

      response = await axios.post(orgUrl, requestBody, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': '*/*'
        },
        timeout: 15000
      });
    } catch (err) {
      // Vid 10 siffror och 400 från Bolagsverket: försök med 12-siffrigt personnummer (enskild firma)
      if (err.response?.status === 400 && cleanOrgNumber.length === 10) {
        const twelve = toTwelveDigitPersonnummer(cleanOrgNumber);
        console.log(`⚠️ Bolagsverket accepterade inte 10 siffror. Försöker igen med 12-siffrigt: ${twelve}.`);
        requestIdentitetsbeteckning = twelve;
        cleanOrgNumber = twelve;
        const requestBody = { identitetsbeteckning: requestIdentitetsbeteckning };
        response = await axios.post(orgUrl, requestBody, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Accept': '*/*'
          },
          timeout: 15000
        });
      } else {
        throw err;
      }
    }

    console.log(`✅ Success från Bolagsverket:`, {
      status: response.status,
      hasData: !!response.data?.organisationer,
      organisationCount: response.data?.organisationer?.length || 0
    });

    if (!response.data?.organisationer?.length) {
      return res.status(404).json({
        error: 'Ingen organisation hittad',
        message: 'No organization found with the provided number',
        organisationsnummer: cleanOrgNumber,
        duration: Date.now() - startTime
      });
    }

    // Returnera alla organisationer för att få alla namnskyddslöpnummer
    const allOrganisations = response.data.organisationer;
    
    console.log(`📊 Organisationsdata tillgänglig:`, {
      totalOrganisations: allOrganisations.length,
      organisations: allOrganisations.map(org => ({
        namnskyddslopnummer: org.namnskyddslopnummer,
        organisationsnamn: org.organisationsnamn?.organisationsnamnLista?.length,
        organisationsform: org.organisationsform?.klartext,
        avregistreradOrganisation: !!org.avregistreradOrganisation,
        verksamOrganisation: org.verksamOrganisation?.kod
      }))
    });

    // Logga detaljerad information om första organisationen för debugging
    if (allOrganisations.length > 0) {
      const firstOrg = allOrganisations[0];
      console.log(`🔍 Detaljerad data för första organisationen:`, {
        organisationsidentitet: firstOrg.organisationsidentitet,
        organisationsnamn: firstOrg.organisationsnamn,
        organisationsform: firstOrg.organisationsform,
        organisationsdatum: firstOrg.organisationsdatum,
        registreringsland: firstOrg.registreringsland,
        verksamhetsbeskrivning: firstOrg.verksamhetsbeskrivning,
        naringsgrenOrganisation: firstOrg.naringsgrenOrganisation,
        postadressOrganisation: firstOrg.postadressOrganisation,
        verksamOrganisation: firstOrg.verksamOrganisation,
        avregistreradOrganisation: firstOrg.avregistreradOrganisation,
        avregistreringsorsak: firstOrg.avregistreringsorsak
      });
    }

    const duration = Date.now() - startTime;

    res.json({
      success: true,
      data: allOrganisations,
      timestamp: new Date().toISOString(),
      duration: duration,
      environment: environment,
      source: 'Bolagsverket'
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('Error in Bolagsverket organisationer API:', error.message);
    
    if (error.response) {
      console.error('❌ Bolagsverket svar:', JSON.stringify(error.response.data, null, 2));
      // Hantera specifika fel från Bolagsverket
      if (error.response.status === 404) {
        res.status(404).json({
          error: 'Ingen organisation hittad',
          message: 'Det angivna organisationsnumret finns inte i Bolagsverkets register',
          organisationsnummer: cleanOrgNumber,
          status: error.response.status,
          duration: duration
        });
      } else if (error.response.status === 403) {
        res.status(403).json({
          error: 'Åtkomst nekad av Bolagsverket',
          message: 'Din Bolagsverket-prenumeration saknar behörighet till denna tjänst. Kontakta Bolagsverket för att kontrollera vilka API-scopes som ingår i abonnemanget.',
          bolagsverketCode: error.response.data?.code,
          status: 403,
          duration: duration
        });
      } else if (error.response.status === 400) {
        res.status(400).json({
          error: 'Ogiltigt organisationsnummer',
          message: 'Bolagsverket accepterar inte det angivna numret. Kontrollera att det är ett giltigt organisationsnummer (ej personnummer för privatpersoner).',
          bolagsverketMessage: error.response.data?.message,
          status: 400,
          duration: duration
        });
      } else {
        res.status(error.response.status).json({
          error: 'Bolagsverket API fel',
          message: error.response.data?.message || error.message,
          status: error.response.status,
          duration: duration
        });
      }
    } else {
      res.status(500).json({
        error: 'Internt serverfel',
        message: error.message,
        duration: duration
      });
    }
  }
});

// Bolagsverket dokumentlista endpoint (för ClientFlow)
app.post('/api/bolagsverket/dokumentlista', async (req, res) => {
  const startTime = Date.now();
  
  try {
    // Debug: Logga vad vi får från Softr
    console.log(`📥 Mottaget dokumentlista-förfrågan från Softr:`, {
      body: req.body,
      headers: req.headers,
      method: req.method,
      url: req.url
    });
    
    // Hantera olika fältnamn som Softr kan skicka
    const organisationsnummer = req.body.organisationsnummer || 
                               req.body.orgnr || 
                               req.body.Orgnr ||
                               req.body.organization_number || 
                               req.body.orgNumber;
    
    if (!organisationsnummer) {
      return res.status(400).json({
        error: 'Organisationsnummer är obligatoriskt',
        message: 'Organization number is required. Available fields: ' + Object.keys(req.body).join(', ')
      });
    }

    const cleanOrgNumber = organisationsnummer.replace(/[-\s]/g, '');
    const token = await getBolagsverketToken();
    const environment = getBolagsverketEnvironment();
    const dokumentlistaUrl = environment === 'test'
      ? 'https://gw-accept2.api.bolagsverket.se/vardefulla-datamangder/v1/dokumentlista'
      : 'https://gw.api.bolagsverket.se/vardefulla-datamangder/v1/dokumentlista';

    // Generera unikt request ID (UUID format som Bolagsverket kräver)
    const requestId = crypto.randomUUID();

    // Hämta dokumentlista från Bolagsverket
    const requestBody = {
      identitetsbeteckning: cleanOrgNumber
    };

    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-Request-Id': requestId
    };

    console.log(`🔍 Hämtar dokumentlista för organisationsnummer: ${cleanOrgNumber}`);

    const bolagsverketResponse = await axios.post(dokumentlistaUrl, requestBody, {
      headers,
      timeout: 15000
    });

    const duration = Date.now() - startTime;

    const responseData = {
      success: true,
      message: 'Dokumentlista hämtad från Bolagsverket',
      organisationsnummer: cleanOrgNumber,
      dokument: bolagsverketResponse.data?.dokument || [],
      antalDokument: bolagsverketResponse.data?.dokument?.length || 0,
      timestamp: new Date().toISOString(),
      duration: duration,
      environment: environment,
      requestId: requestId
    };

    console.log(`✅ Dokumentlista hämtad:`, {
      organisationsnummer: cleanOrgNumber,
      antalDokument: responseData.antalDokument,
      duration: duration
    });

    res.json(responseData);

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('Error fetching dokumentlista:', error.message);
    
    if (error.response) {
      res.status(error.response.status).json({
        error: 'Bolagsverket API fel',
        message: error.response.data?.detail || error.response.data?.message || error.message,
        status: error.response.status,
        duration: duration,
        requestId: error.response.headers['x-request-id'] || null
      });
    } else {
      res.status(500).json({
        error: 'Internt serverfel',
        message: error.message,
        duration: duration
      });
    }
  }
});

// ClientFlow dokumentlista endpoint (enklare format)
app.post('/api/clientflow/dokumentlista', async (req, res) => {
  const startTime = Date.now();
  
  try {
    console.log(`📥 Mottaget ClientFlow dokumentlista-förfrågan:`, {
      body: req.body,
      headers: req.headers,
      method: req.method,
      url: req.url
    });
    
    const organisationsnummer = req.body.organisationsnummer || 
                               req.body.orgnr || 
                               req.body.Orgnr ||
                               req.body.organization_number || 
                               req.body.orgNumber;
    
    if (!organisationsnummer) {
      return res.status(400).json({
        error: 'Organisationsnummer är obligatoriskt',
        message: 'Organization number is required'
      });
    }

    const cleanOrgNumber = organisationsnummer.replace(/[-\s]/g, '');
    const token = await getBolagsverketToken();
    const environment = getBolagsverketEnvironment();
    const dokumentlistaUrl = environment === 'test'
      ? 'https://gw-accept2.api.bolagsverket.se/vardefulla-datamangder/v1/dokumentlista'
      : 'https://gw.api.bolagsverket.se/vardefulla-datamangder/v1/dokumentlista';

    const requestId = crypto.randomUUID();
    const requestBody = {
      identitetsbeteckning: cleanOrgNumber
    };

    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-Request-Id': requestId
    };

    console.log(`🔍 Hämtar dokumentlista för ClientFlow: ${cleanOrgNumber}`);

    const bolagsverketResponse = await axios.post(dokumentlistaUrl, requestBody, {
      headers,
      timeout: 15000
    });

    const duration = Date.now() - startTime;

    // Formatera för ClientFlow - enklare att använda
    const dokument = bolagsverketResponse.data?.dokument || [];
    const formateradeDokument = dokument.map(doc => ({
      id: doc.dokumentId,
      period: doc.rapporteringsperiodTom,
      format: doc.filformat,
      registreringstidpunkt: doc.registreringstidpunkt,
      downloadUrl: `${req.protocol}://${req.get('host')}/api/bolagsverket/dokument/${doc.dokumentId}`,
      displayName: `Årsredovisning ${doc.rapporteringsperiodTom} (${doc.filformat})`
    }));

    const responseData = {
      success: true,
      organisationsnummer: cleanOrgNumber,
      antalDokument: dokument.length,
      dokument: formateradeDokument,
      timestamp: new Date().toISOString(),
      duration: duration
    };

    console.log(`✅ ClientFlow dokumentlista hämtad: ${dokument.length} dokument`);

    res.json(responseData);

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('Error fetching ClientFlow dokumentlista:', error.message);
    
    if (error.response) {
      res.status(error.response.status).json({
        error: 'Bolagsverket API fel',
        message: error.response.data?.detail || error.response.data?.message || error.message,
        status: error.response.status,
        duration: duration
      });
    } else {
      res.status(500).json({
        error: 'Internt serverfel',
        message: error.message,
        duration: duration
      });
    }
  }
});

// Bolagsverket hämta dokument endpoint (GET)
app.get('/api/bolagsverket/dokument/:dokumentId', async (req, res) => {
  const startTime = Date.now();
  
  try {
    let dokumentId = (req.params.dokumentId || '').trim();
    dokumentId = decodeURIComponent(dokumentId);
    const orgnr = (req.query.orgnr || '').toString().replace(/[-\s]/g, '').trim();
    
    console.log(`📥 Mottaget dokument-förfrågan:`, { dokumentId, orgnr: orgnr || '(ej angivet)' });
    
    if (!dokumentId) {
      return res.status(400).json({
        error: 'Dokument-ID är obligatoriskt',
        message: 'Document ID is required'
      });
    }

    const token = await getBolagsverketToken();
    const environment = getBolagsverketEnvironment();
    const dokumentUrl = environment === 'test'
      ? `https://gw-accept2.api.bolagsverket.se/vardefulla-datamangder/v1/dokument/${dokumentId}`
      : `https://gw.api.bolagsverket.se/vardefulla-datamangder/v1/dokument/${dokumentId}`;

    const requestId = crypto.randomUUID ? crypto.randomUUID() : `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const headers = {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/zip',
      'X-Request-Id': requestId
    };

    console.log(`🔍 Hämtar dokument från Bolagsverket: dokumentId=${dokumentId}, orgnr=${orgnr || '(ej angivet)'}`);

    const bolagsverketResponse = await axios.get(dokumentUrl, {
      headers,
      responseType: 'arraybuffer',
      timeout: 30000
    });

    const duration = Date.now() - startTime;

    console.log(`✅ Dokument hämtat:`, {
      dokumentId: dokumentId,
      contentType: bolagsverketResponse.headers['content-type'],
      contentLength: bolagsverketResponse.headers['content-length'],
      duration: duration
    });

    // Skicka tillbaka ZIP-filen
    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="arsredovisning-${dokumentId}.zip"`,
      'Content-Length': bolagsverketResponse.headers['content-length']
    });

    res.send(bolagsverketResponse.data);

  } catch (error) {
    const duration = Date.now() - startTime;
    const bvDetail = error.response?.data;
    const bvMsg = typeof bvDetail === 'string' ? bvDetail : (bvDetail?.detail || bvDetail?.message || bvDetail?.error || (typeof bvDetail === 'object' ? JSON.stringify(bvDetail) : null));
    console.error('❌ Bolagsverket dokument fel:', error.message, '| Status:', error.response?.status, '| Bolagsverket svar:', bvMsg || '(ingen detalj)');
    
    if (error.response) {
      res.status(error.response.status).json({
        error: 'Bolagsverket API fel',
        message: bvMsg || error.message,
        status: error.response.status,
        duration: duration,
        requestId: error.response.headers['x-request-id'] || null,
        dokumentId: req.params?.dokumentId
      });
    } else {
      res.status(500).json({
        error: 'Internt serverfel',
        message: error.message,
        duration: duration
      });
    }
  }
});



// Airtable integration endpoint - Förenklad version för testning (valfri auth för att fylla byraId/anvandareId)
app.post('/api/bolagsverket/save-to-airtable', optionalAuthenticateToken, async (req, res) => {
  const startTime = Date.now();
  
  try {
    // Debug: Logga vad vi får från Softr
    console.log(`📥 Mottaget från Softr:`, {
      body: req.body,
      headers: req.headers,
      method: req.method,
      url: req.url
    });
    
    // Hantera olika fältnamn som Softr kan skicka
    const organisationsnummer = req.body.organisationsnummer || 
                               req.body.orgnr || 
                               req.body.Orgnr ||
                               req.body.organization_number || 
                               req.body.orgNumber;
    
    // Hämta användar-ID och byrå-ID från body; om tomt och användaren är inloggad, hämta från användardata
    let anvandareId = req.body.anvandareId || 
                       req.body.anvId || 
                       req.body.userId || 
                       req.body.anv_id ||
                       req.body.user_id ||
                       req.body['Användare'];
    
    let byraId = req.body.byraId || 
                   req.body.byra_id || 
                   req.body.agencyId || 
                   req.body.agency_id ||
                   req.body.byra_id ||
                   req.body['Byrå ID'];
    
    if ((!byraId || !anvandareId) && req.user && req.user.email) {
      try {
        const userData = await getUser(req.user.email);
        if (userData) {
          if (!byraId || (byraId === '' && userData.byraId)) byraId = byraId || userData.byraId || '';
          if (!anvandareId && userData.id) anvandareId = userData.id;
        }
      } catch (e) {
        console.warn('Kunde inte hämta användare för byraId/anvandareId:', e.message);
      }
    }
    
    if (!organisationsnummer) {
      return res.status(400).json({
        error: 'Organisationsnummer är obligatoriskt',
        message: 'Organization number is required. Available fields: ' + Object.keys(req.body).join(', ')
      });
    }

    // Ta bara siffror (samma normalisering som vid sökning)
    let cleanOrgNumber = (organisationsnummer || '').toString().replace(/[^\d]/g, '');
    
    // Använd produktionsmiljö för riktiga organisationsnummer
    const environment = getBolagsverketEnvironment();
    if (environment === 'test' && (cleanOrgNumber === '199105294475' || cleanOrgNumber === '5567223705')) {
      console.log(`⚠️ Använder känt fungerande testnummer istället för ${cleanOrgNumber}`);
      cleanOrgNumber = '193403223328';
    }

    const token = await getBolagsverketToken();
    const orgUrl = environment === 'test'
      ? 'https://gw-accept2.api.bolagsverket.se/vardefulla-datamangder/v1/organisationer'
      : 'https://gw.api.bolagsverket.se/vardefulla-datamangder/v1/organisationer';

    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': '*/*'
    };

    const toTwelveDigitPersonnummer = (tenDigits) => {
      const only = (tenDigits || '').toString().replace(/[^\d]/g, '');
      if (only.length !== 10) return only;
      const yy = parseInt(only.substring(0, 2), 10);
      const currentYear = new Date().getFullYear() % 100;
      const century = yy > currentYear ? '19' : '20';
      return century + only;
    };

    let bolagsverketResponse;
    let identitetsbeteckning = cleanOrgNumber;

    try {
      console.log('🔍 Calling Bolagsverket API (save-to-airtable):', { identitetsbeteckning });

      bolagsverketResponse = await axios.post(orgUrl, { identitetsbeteckning }, {
        headers,
        timeout: 15000
      });

      if (!bolagsverketResponse.data?.organisationer?.[0]) {
        throw new Error('Ingen organisationsdata hittad från Bolagsverket');
      }
    } catch (bolagsverketError) {
      // Vid 10 siffror och 400: försök med 12-siffrigt (enskild firma)
      if (bolagsverketError.response?.status === 400 && cleanOrgNumber.length === 10) {
        identitetsbeteckning = toTwelveDigitPersonnummer(cleanOrgNumber);
        cleanOrgNumber = identitetsbeteckning;
        console.log(`⚠️ Save-to-airtable: Bolagsverket accepterade inte 10 siffror. Försöker med 12: ${identitetsbeteckning}`);
        bolagsverketResponse = await axios.post(orgUrl, { identitetsbeteckning }, {
          headers,
          timeout: 15000
        });
        if (!bolagsverketResponse.data?.organisationer?.[0]) {
          throw new Error('Ingen organisationsdata hittad från Bolagsverket');
        }
      } else {
        console.error('❌ Bolagsverket API error (save-to-airtable):', {
          message: bolagsverketError.message,
          status: bolagsverketError.response?.status,
          data: bolagsverketError.response?.data
        });
        if (bolagsverketError.response?.status === 400) {
          return res.status(400).json({
            error: 'Bolagsverket API fel',
            message: 'Organisationsnummer kunde inte valideras av Bolagsverket',
            details: bolagsverketError.response?.data,
            organisationsnummer: cleanOrgNumber
          });
        }
        throw new Error(`Bolagsverket API fel: ${bolagsverketError.message}`);
      }
    }

    console.log('✅ Bolagsverket API response received (save-to-airtable):', {
      hasOrganisationer: !!bolagsverketResponse.data?.organisationer?.length
    });

    const orgData = bolagsverketResponse.data.organisationer[0];

    // Hämta dokumentlista och ladda ner årsredovisningar
    let dokumentInfo = null;
    let nedladdadeDokument = {};
    
    try {
      console.log(`🔍 Hämtar dokumentlista för organisationsnummer: ${cleanOrgNumber}`);
      
      const dokumentlistaUrl = environment === 'test'
        ? 'https://gw-accept2.api.bolagsverket.se/vardefulla-datamangder/v1/dokumentlista'
        : 'https://gw.api.bolagsverket.se/vardefulla-datamangder/v1/dokumentlista';

      const dokumentRequestId = crypto.randomUUID();
      const dokumentRequestBody = {
        identitetsbeteckning: cleanOrgNumber
      };

      const dokumentHeaders = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-Request-Id': dokumentRequestId
      };

      const dokumentResponse = await axios.post(dokumentlistaUrl, dokumentRequestBody, {
        headers: dokumentHeaders,
        timeout: 15000
      });

      dokumentInfo = {
        dokument: dokumentResponse.data?.dokument || [],
        antalDokument: dokumentResponse.data?.dokument?.length || 0
      };

      console.log(`✅ Dokumentlista hämtad: ${dokumentInfo.antalDokument} dokument hittade`);
      
      // Nedladdning av årsredovisningar skippas här så att Airtable-sparandet sker direkt.
      // (Nedladdning + PDF-konvertering kan ta flera minuter och gjorde att anropet hängde som "pending".)
      const skipDocumentDownloadInRequest = true;
      if (!skipDocumentDownloadInRequest && dokumentInfo.dokument.length > 0) {
        console.log(`📥 Laddar ner ${dokumentInfo.dokument.length} årsredovisningar...`);
        
        for (let i = 0; i < Math.min(dokumentInfo.dokument.length, 3); i++) {
          const doc = dokumentInfo.dokument[i];
          try {
            console.log(`📄 Laddar ner dokument ${i + 1}: ${doc.dokumentId}`);
            
            const dokumentUrl = environment === 'test'
              ? `https://gw-accept2.api.bolagsverket.se/vardefulla-datamangder/v1/dokument/${doc.dokumentId}`
              : `https://gw.api.bolagsverket.se/vardefulla-datamangder/v1/dokument/${doc.dokumentId}`;

            const downloadRequestId = crypto.randomUUID();
            const downloadHeaders = {
              'Authorization': `Bearer ${token}`,
              'Accept': 'application/zip',
              'X-Request-Id': downloadRequestId
            };

            const downloadResponse = await axios.get(dokumentUrl, {
              headers: downloadHeaders,
              responseType: 'arraybuffer',
              timeout: 30000
            });

            // Konvertera ZIP till PDF
            try {
              console.log(`🔄 Konverterar ZIP till PDF för dokument ${i + 1}...`);
              
              // Läs ZIP-filen
              const zip = new AdmZip(downloadResponse.data);
              const zipEntries = zip.getEntries();
              
              console.log(`📦 ZIP innehåller ${zipEntries.length} filer:`);
              zipEntries.forEach(entry => {
                console.log(`   - ${entry.entryName} (${entry.header.size} bytes)`);
              });
              
              // Hitta HTML-filen i ZIP:en (försök olika filnamn)
              const htmlEntry = zipEntries.find(entry => 
                entry.entryName.endsWith('.html') || 
                entry.entryName.endsWith('.htm') ||
                entry.entryName.endsWith('.xhtml') ||
                entry.entryName.includes('.html') ||
                entry.entryName.includes('.htm')
              );
              
              if (htmlEntry) {
                console.log(`📄 Hittade HTML-fil: ${htmlEntry.entryName}`);
                
                // Läs HTML-innehållet
                const htmlContent = htmlEntry.getData().toString('utf8');
                console.log(`📄 HTML-innehåll längd: ${htmlContent.length} tecken`);
                
                // Försök rendera fullständig PDF med Puppeteer
                let pdfBytes;
                const pup = loadPuppeteer();
                try {
                  if (pup) {
                    console.log('🖨️ Renderar fullständig PDF med Puppeteer...');
                    const launchOpts = { args: ['--no-sandbox', '--disable-setuid-sandbox'], headless: true };
                    if (chromium) launchOpts.executablePath = await chromium.executablePath();
                    const browser = await pup.launch(launchOpts);
                    const page = await browser.newPage();
                    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
                    pdfBytes = await page.pdf({
                      format: 'A4',
                      printBackground: true,
                      margin: { top: '20mm', right: '15mm', bottom: '20mm', left: '15mm' }
                    });
                    await browser.close();
                    console.log('✅ Puppeteer-PDF skapad');
                  } else {
                    throw new Error('Puppeteer inte tillgänglig');
                  }
                } catch (puppeteerError) {
                  console.log(`⚠️ Puppeteer misslyckades, använder enkel PDF: ${puppeteerError.message}`);
                  const simpleDoc = await PDFDocument.create();
                  const simplePage = simpleDoc.addPage([595.28, 841.89]);
                  simplePage.drawText('Årsredovisning (förenklad vy)', { x: 50, y: 780, size: 16 });
                  pdfBytes = await simpleDoc.save();
                }
                
                // Spara PDF lokalt
                const filename = i === 0 ? `senaste-arsredovisning-${doc.rapporteringsperiodTom}.pdf` :
                                i === 1 ? `fg-arsredovisning-${doc.rapporteringsperiodTom}.pdf` :
                                `ffg-arsredovisning-${doc.rapporteringsperiodTom}.pdf`;
                const fileUrl = await saveFileLocally(pdfBytes, filename, 'application/pdf');
                
                if (i === 0) {
                  nedladdadeDokument.senasteArsredovisning = fileUrl ? [{ url: fileUrl, filename }] : '';
                } else if (i === 1) {
                  nedladdadeDokument.fgArsredovisning = fileUrl ? [{ url: fileUrl, filename }] : '';
                } else if (i === 2) {
                  nedladdadeDokument.ffgArsredovisning = fileUrl ? [{ url: fileUrl, filename }] : '';
                }
                
                console.log(`✅ PDF skapad för dokument ${i + 1}`);
              } else {
                console.log(`⚠️ Ingen HTML-fil hittad i ZIP, skapar enkel PDF med dokumentinfo`);
                
                // Skapa en enkel PDF med bara dokumentinformation
                const pdfDoc = await PDFDocument.create();
                const page = pdfDoc.addPage([595.28, 841.89]);
                
                const { width, height } = page.getSize();
                
                page.drawText('Årsredovisning från Bolagsverket', {
                  x: 50,
                  y: height - 50,
                  size: 18
                });
                
                page.drawText(`Dokument ID: ${doc.dokumentId}`, {
                  x: 50,
                  y: height - 80,
                  size: 12
                });
                
                page.drawText(`Rapporteringsperiod: ${doc.rapporteringsperiodTom}`, {
                  x: 50,
                  y: height - 100,
                  size: 12
                });
                
                page.drawText('Detta är en sammanfattning av årsredovisningen.', {
                  x: 50,
                  y: height - 130,
                  size: 10
                });
                
                const pdfBytes = await pdfDoc.save();
                
                // Spara PDF lokalt
                const filename = i === 0 ? `senaste-arsredovisning-${doc.rapporteringsperiodTom}.pdf` :
                                i === 1 ? `fg-arsredovisning-${doc.rapporteringsperiodTom}.pdf` :
                                `ffg-arsredovisning-${doc.rapporteringsperiodTom}.pdf`;
                
                const fileUrl = await saveFileLocally(pdfBytes, filename, 'application/pdf');
                
                if (i === 0) {
                  nedladdadeDokument.senasteArsredovisning = fileUrl ? [{
                    url: fileUrl,
                    filename: filename
                  }] : '';
                } else if (i === 1) {
                  nedladdadeDokument.fgArsredovisning = fileUrl ? [{
                    url: fileUrl,
                    filename: filename
                  }] : '';
                } else if (i === 2) {
                  nedladdadeDokument.ffgArsredovisning = fileUrl ? [{
                    url: fileUrl,
                    filename: filename
                  }] : '';
                }
                
                console.log(`✅ Enkel PDF skapad för dokument ${i + 1}: ${(pdfBytes.length / 1024 / 1024).toFixed(2)} MB`);
              }
            } catch (conversionError) {
              console.log(`❌ Fel vid PDF-konvertering: ${conversionError.message}`);
              console.log(`❌ Stack trace: ${conversionError.stack}`);
              
              // Fallback: använd original ZIP
              console.log(`⚠️ Använder original ZIP som fallback`);
              const base64Data = Buffer.from(downloadResponse.data).toString('base64');
              
              // Spara ZIP lokalt som fallback
              const filename = i === 0 ? `senaste-arsredovisning-${doc.rapporteringsperiodTom}.zip` :
                              i === 1 ? `fg-arsredovisning-${doc.rapporteringsperiodTom}.zip` :
                              `ffg-arsredovisning-${doc.rapporteringsperiodTom}.zip`;
              
              const fileUrl = await saveFileLocally(downloadResponse.data, filename, 'application/zip');
              
              if (i === 0) {
                nedladdadeDokument.senasteArsredovisning = fileUrl ? [{
                  url: fileUrl,
                  filename: filename
                }] : '';
              } else if (i === 1) {
                nedladdadeDokument.fgArsredovisning = fileUrl ? [{
                  url: fileUrl,
                  filename: filename
                }] : '';
              } else if (i === 2) {
                nedladdadeDokument.ffgArsredovisning = fileUrl ? [{
                  url: fileUrl,
                  filename: filename
                }] : '';
              }
            }

            console.log(`✅ Dokument ${i + 1} nedladdat: ${(downloadResponse.data.length / 1024 / 1024).toFixed(2)} MB`);
            
          } catch (downloadError) {
            console.log(`⚠️ Kunde inte ladda ner dokument ${i + 1}: ${downloadError.message}`);
          }
        }
      }
      
    } catch (dokumentError) {
      console.log(`⚠️ Kunde inte hämta dokumentlista: ${dokumentError.message}`);
      if (dokumentError.response) {
        console.log(`📋 Bolagsverket dokumentlista fel:`, {
          status: dokumentError.response.status,
          data: dokumentError.response.data,
          headers: dokumentError.response.headers
        });
      }
      dokumentInfo = {
        dokument: [],
        antalDokument: 0,
        error: dokumentError.message,
        details: dokumentError.response?.data || null
      };
    }

            // Debug: Logga SNI-data från Bolagsverket
        console.log('🔍 SNI-data från Bolagsverket:', {
          naringsgrenOrganisation: orgData.naringsgrenOrganisation,
          sni: orgData.naringsgrenOrganisation?.sni,
          fel: orgData.naringsgrenOrganisation?.fel
        });
        
        // Debug: Logga nya fält från Bolagsverket
        console.log('🔍 Nya fält från Bolagsverket:', {
          registreringsland: orgData.registreringsland,
          avregistreringsorsak: orgData.avregistreringsorsak,
          avregistreradOrganisation: orgData.avregistreradOrganisation,
          organisationsnamn: orgData.organisationsnamn,
          sarskiltForeningsnamn: orgData.sarskiltForeningsnamn,
          verksamhetsbeskrivning: orgData.verksamhetsbeskrivning
        });

            // Kontrollera om företaget är aktivt (inte avregistrerat)
        const isActiveCompany = (() => {
            // Om verksamOrganisation är 'JA', är företaget aktivt
            if (orgData.verksamOrganisation?.kod === 'JA') {
                return true;
            }
            // Om avregistreradOrganisation har ett fel-objekt, betyder det att den inte är avregistrerad
            if (orgData.avregistreradOrganisation?.fel) {
                return true;
            }
            // Om avregistreringsorsak har ett fel-objekt, betyder det att den inte är avregistrerad
            if (orgData.avregistreringsorsak?.fel) {
                return true;
            }
            // Annars är den avregistrerad
            return false;
        })();
        
        // Samla företagsnamn (inklusive särskilt företagsnamn)
        const companyNames = [];
        if (orgData.organisationsnamn?.organisationsnamnLista) {
          orgData.organisationsnamn.organisationsnamnLista.forEach(namn => {
            if (namn.namn) companyNames.push(namn.namn);
          });
        }
        if (orgData.sarskiltForeningsnamn?.sarskiltForeningsnamnLista) {
          orgData.sarskiltForeningsnamn.sarskiltForeningsnamnLista.forEach(namn => {
            if (namn.namn) companyNames.push(namn.namn);
          });
        }
        
        // Samla verksamhetsbeskrivningar
        const descriptions = [];
        if (orgData.verksamhetsbeskrivning?.beskrivning) {
          descriptions.push(orgData.verksamhetsbeskrivning.beskrivning);
        }
        if (orgData.verksamhetsbeskrivning?.klartext) {
          descriptions.push(orgData.verksamhetsbeskrivning.klartext);
        }
        
        // Bygg SNI-sträng från flera källor
        const sniString = (() => {
          const candidates = [];
          const scbBlock = orgData?.naringsgrenOrganisation;
          if (scbBlock?.fel) {
            console.log('🔍 SNI från SCB ej tillgängligt:', scbBlock.fel);
          }
          const lists = [
            scbBlock?.sni || [],
            orgData?.sni || [],
          ];
          lists.forEach(list => {
            list.forEach(item => {
              const code = (item?.kod || '').trim();
              const text = (item?.klartext || item?.beskrivning || '').trim();
              if (code && text) candidates.push(`${code} - ${text}`);
            });
          });
          return Array.from(new Set(candidates)).join(', ');
        })();

        // Organisationsform (Bolagsform i Airtable) kan komma i olika format beroende på miljö/version
        const organisationsformText = (() => {
          const pick = (v) => {
            if (!v) return '';
            if (typeof v === 'string') return v;
            return v.klartext || v.beskrivning || v.text || v.name || v.kod || '';
          };
          return pick(orgData.organisationsform) || pick(orgData.juridiskForm) || '';
        })();

        // Förbered data för Airtable med förbättrad mappning
        const airtableData = {
          fields: {
            'Orgnr': cleanOrgNumber,
            'Namn': companyNames.join(', ') || '',
            'Verksamhetsbeskrivning': descriptions.join(', ') || '',
            'Address': orgData.postadressOrganisation?.postadress ?
              `${orgData.postadressOrganisation.postadress.utdelningsadress || ''}, ${orgData.postadressOrganisation.postadress.postnummer || ''} ${orgData.postadressOrganisation.postadress.postort || ''}` : '',
            'Bolagsform': organisationsformText,
            'regdatum': orgData.organisationsdatum?.registreringsdatum || '',
            'registreringsland': orgData.registreringsland?.klartext || '',
            'Aktivt företag': isActiveCompany ? 'Ja' : 'Nej',
            // Sätt Användare till inloggad användares Airtable-recordID (text),
            // så att filter/search på userData.id fungerar för rollen "Anställd".
            'Användare': anvandareId ? String(anvandareId) : '',
            'Byrå ID': byraId ? byraId.replace(/,/g, '') : '',
            'Senaste årsredovisning': dokumentInfo?.dokument?.sort((a, b) => 
              new Date(b.rapporteringsperiodTom) - new Date(a.rapporteringsperiodTom)
            )?.[0]?.rapporteringsperiodTom || '',
            'Senaste årsredovisning json': dokumentInfo?.dokument?.sort((a, b) => 
              new Date(b.rapporteringsperiodTom) - new Date(a.rapporteringsperiodTom)
            )?.[0]?.dokumentId || '',
            'Fg årsredovisning': dokumentInfo?.dokument?.sort((a, b) => 
              new Date(b.rapporteringsperiodTom) - new Date(a.rapporteringsperiodTom)
            )?.[1]?.rapporteringsperiodTom || '',
            'Fg årsredovisning json': dokumentInfo?.dokument?.sort((a, b) => 
              new Date(b.rapporteringsperiodTom) - new Date(a.rapporteringsperiodTom)
            )?.[1]?.dokumentId || '',
            'Ffg årsredovisning': dokumentInfo?.dokument?.sort((a, b) => 
              new Date(b.rapporteringsperiodTom) - new Date(a.rapporteringsperiodTom)
            )?.[2]?.rapporteringsperiodTom || '',
            'Ffg årsredovisning json': dokumentInfo?.dokument?.sort((a, b) => 
              new Date(b.rapporteringsperiodTom) - new Date(a.rapporteringsperiodTom)
            )?.[2]?.dokumentId || '',
            'Senaste årsredovisning fil': nedladdadeDokument.senasteArsredovisning || '',
            'Fg årsredovisning fil': nedladdadeDokument.fgArsredovisning || '',
            'Ffg årsredovisning fil': nedladdadeDokument.ffgArsredovisning || ''
          }
        };

        // Lägg bara till SNI om vi faktiskt har värden, så vi inte skriver över existerande data med tom sträng
        if (sniString) {
          airtableData.fields['SNI kod'] = sniString;
        } else {
          console.log('ℹ️ Ingen SNI kod att uppdatera (SCB otillgängligt eller tom lista)');
        }
        
        // Debug: Logga isActiveCompany-värdet
        console.log('🔍 Aktivt företag debug:', {
          isActiveCompany: isActiveCompany,
          isActiveCompanyType: typeof isActiveCompany,
          avregistreringsorsak: orgData.avregistreringsorsak,
          avregistreradOrganisation: orgData.avregistreradOrganisation
        });

    const byraIdClean = (byraId || '').toString().replace(/,/g, '').trim();
    if (!byraIdClean) {
      console.log('🔒 Dubblettkontroll: Byrå ID saknas – kräver inloggning för att spara (undviker dubbletter).');
      return res.status(400).json({
        error: 'byra_required',
        message: 'Logga in så att vi vet vilken byrå kunden tillhör. Då kan vi även hindra dubbletter.',
        loginRequired: true
      });
    }
    console.log('🔒 Dubblettkontroll (save-to-airtable): Orgnr=', cleanOrgNumber, 'Byrå ID=', byraIdClean);

    // Spara till Airtable (samma base och tabell som övriga KUNDDATA-anrop)
    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
    const airtableBaseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
    const KUNDDATA_TABLE = 'tblOIuLQS2DqmOQWe';

    if (!airtableAccessToken) {
      console.log('⚠️ Airtable inte konfigurerat (AIRTABLE_ACCESS_TOKEN saknas) - returnerar data utan att spara');
      const duration = Date.now() - startTime;
      return res.json({
        success: true,
        message: 'Data hämtad från Bolagsverket (Airtable inte konfigurerat)',
        data: {
          organisationsnummer: req.body.organisationsnummer || '',
          företagsnamn: 'Data hämtad från Bolagsverket',
          verksamhetsbeskrivning: 'Data hämtad från Bolagsverket',
          adress: 'Data hämtad från Bolagsverket',
          bolagsform: 'Data hämtad från Bolagsverket',
          registreringsdatum: 'Data hämtad från Bolagsverket',
          aktivt_företag: 'Data hämtad från Bolagsverket',
          årsredovisningar: dokumentInfo?.dokument?.length || 0,
          nedladdade_filer: nedladdadeDokument ? Object.keys(nedladdadeDokument).filter(key => nedladdadeDokument[key]).length : 0
        },
        airtableRecordId: null,
        airtableConfigured: false,
        airtableError: 'AIRTABLE_ACCESS_TOKEN saknas i miljövariabler',
        timestamp: new Date().toISOString(),
        duration: duration,
        source: 'Bolagsverket'
      });
    }

    // Kontrollera om API-nyckeln ser ut att vara giltig
    if (airtableAccessToken === 'patIV1TIf0PEQWwdI.3d142b13f622c153496ac7f4e2e6baa42b3a323cf905da341f9e850337f20e90' || 
        airtableAccessToken.includes('din_riktiga_airtable_api_nyckel') ||
        airtableAccessToken.length < 50) {
      console.log('⚠️ Ogiltig Airtable API-nyckel - returnerar data utan att spara');
      const duration = Date.now() - startTime;
      return res.json({
        success: true,
        message: 'Data hämtad från Bolagsverket (Ogiltig Airtable API-nyckel)',
        data: {
          organisationsnummer: req.body.organisationsnummer || '',
          företagsnamn: 'Data hämtad från Bolagsverket',
          verksamhetsbeskrivning: 'Data hämtad från Bolagsverket',
          adress: 'Data hämtad från Bolagsverket',
          bolagsform: 'Data hämtad från Bolagsverket',
          registreringsdatum: 'Data hämtad från Bolagsverket',
          aktivt_företag: 'Data hämtad från Bolagsverket',
          årsredovisningar: 0,
          nedladdade_filer: 0
        },
        airtableRecordId: null,
        airtableConfigured: false,
        airtableError: 'Ogiltig Airtable API-nyckel. Uppdatera AIRTABLE_ACCESS_TOKEN i .env filen.',
        timestamp: new Date().toISOString(),
        duration: duration,
        source: 'Bolagsverket'
      });
    }

    // Spärr: kund får bara finnas en gång per byrå (samma Orgnr + Byrå ID). Kontrollera alltid innan skapande.
    const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const orgnrVariants = [cleanOrgNumber];
    if (cleanOrgNumber.length === 10) {
      const yy = parseInt(cleanOrgNumber.substring(0, 2), 10);
      const currentYear = new Date().getFullYear() % 100;
      orgnrVariants.push((yy > currentYear ? '19' : '20') + cleanOrgNumber);
      orgnrVariants.push(cleanOrgNumber.replace(/^(\d{6})(\d{4})$/, '$1-$2')); // svenskt format 556722-3705
    } else if (cleanOrgNumber.length === 12) {
      orgnrVariants.push(cleanOrgNumber.substring(2));
      orgnrVariants.push(cleanOrgNumber.substring(2).replace(/^(\d{6})(\d{4})$/, '$1-$2'));
    }
    const byraIdNorm = (v) => (v == null || v === '') ? '' : String(v).trim();
    const getRecordByraId = (r) => {
      const raw = r.fields?.['Byrå ID'] ?? r.fields?.['Byra_ID'] ?? r.fields?.['ByraID'] ?? r.fields?.['Byra ID'] ?? r.fields?.['Byrå'] ?? r.fields?.Byrå;
      if (raw == null) return '';
      if (Array.isArray(raw)) return raw[0] != null ? String(raw[0]).trim() : '';
      return String(raw).trim();
    };
    const BYRAER_TBL = process.env.BYRAER_TABLE_ID || 'tblAIu1A83AyRTQ3B';
    let byraRecIdForMatch = null;
    try {
      const num = parseInt(byraIdClean, 10);
      const byraFormula = isNaN(num) ? `{Byrå ID}="${esc(byraIdClean)}"` : `OR({Byrå ID}="${byraIdClean}",{Byrå ID}=${byraIdClean})`;
      const byraUrl = `https://api.airtable.com/v0/${airtableBaseId}/${BYRAER_TBL}?filterByFormula=${encodeURIComponent(byraFormula)}&maxRecords=1&fields[]=id`;
      const byraRes = await axios.get(byraUrl, { headers: { Authorization: `Bearer ${airtableAccessToken}` } });
      if (byraRes.data.records?.[0]?.id) byraRecIdForMatch = byraRes.data.records[0].id;
    } catch (e) {
      console.log('ℹ️ Kunde inte hämta Byråer-record för match:', e.message);
    }
    const byraIdMatch = (recordByraId) => {
      const n = byraIdNorm(recordByraId);
      const c = byraIdNorm(byraIdClean);
      if (n === c) return true;
      if (byraRecIdForMatch && n && n.startsWith('rec') && n === byraRecIdForMatch) return true;
      return false;
    };
    const orgnrFromRecord = (r) => {
      const raw = r.fields?.['Orgnr'] ?? r.fields?.['orgnr'] ?? r.fields?.['Organisationsnummer'] ?? '';
      return String(raw).replace(/\D/g, '');
    };
    const recordMatchesOrgnr = (r) => {
      const rec = orgnrFromRecord(r);
      if (!rec) return false;
      const a = String(rec).trim();
      const b = String(cleanOrgNumber).trim();
      return a === b || a === b.substring(0, 10) || a === b.substring(2) || b === a.substring(0, 10) || b === a.substring(2);
    };

    const fetchKunddataByOrgnr = async (fieldName) => {
      const formula = orgnrVariants.length === 1
        ? `{${fieldName}}="${esc(cleanOrgNumber)}"`
        : `OR(${orgnrVariants.map(o => `{${fieldName}}="${esc(o)}"`).join(',')})`;
      const url = `https://api.airtable.com/v0/${airtableBaseId}/${KUNDDATA_TABLE}?filterByFormula=${encodeURIComponent(formula)}&maxRecords=100&fields[]=id&fields[]=Namn&fields[]=Byrå ID&fields[]=Orgnr`;
      const res = await axios.get(url, { headers: { Authorization: `Bearer ${airtableAccessToken}` } });
      return res.data.records || [];
    };

    // Dubblettkontroll: hämta kunder för denna byrå (enkel formel), kolla i koden om samma orgnr redan finns. Använd bara fält som finns (Orgnr, inte Organisationsnummer) för att undvika 422.
    let existing = null;
    const fetchRecordsForByra = async (formula) => {
      const url = `https://api.airtable.com/v0/${airtableBaseId}/${KUNDDATA_TABLE}?filterByFormula=${encodeURIComponent(formula)}&maxRecords=500&fields[]=id&fields[]=Namn&fields[]=Byrå ID&fields[]=Orgnr`;
      const res = await axios.get(url, { headers: { Authorization: `Bearer ${airtableAccessToken}` } });
      return res.data.records || [];
    };
    for (const formula of [
      /^\d+$/.test(byraIdClean) ? `{Byrå ID}=${byraIdClean}` : null,
      `{Byrå ID}="${esc(byraIdClean)}"`,
      byraRecIdForMatch ? `{Byrå ID}="${esc(byraRecIdForMatch)}"` : null
    ].filter(Boolean)) {
      try {
        const records = await fetchRecordsForByra(formula);
        existing = records.find(r => recordMatchesOrgnr(r) && byraIdMatch(getRecordByraId(r))) || null;
        if (existing) {
          console.log('🔒 Dubblettkontroll: befintlig kund med samma Orgnr + Byrå ID hittad:', existing.id);
          break;
        }
        if (records.length > 0) break; // vi har fått poster för byrån, ingen orgnr-träff
      } catch (e) {
        if (e.response?.status !== 422) console.log('ℹ️ Dubblettkontroll:', e.message);
      }
    }

    // Om alla formel-anrop 422:ade eller gav 0 poster – blädra igenom tabellen utan filter (max 3000) och kolla orgnr+byrå i kod. Utan fields[] för att undvika 422 på ogiltiga fältnamn.
    if (!existing) {
      const tryPaginatedList = async (queryFields) => {
        let offset = null;
        let totalChecked = 0;
        const maxToCheck = 3000;
        const pageSize = 100;
        while (totalChecked < maxToCheck) {
          let listUrl = `https://api.airtable.com/v0/${airtableBaseId}/${KUNDDATA_TABLE}?pageSize=${pageSize}`;
          if (queryFields) queryFields.forEach(f => { listUrl += `&fields[]=${encodeURIComponent(f)}`; });
          if (offset) listUrl += `&offset=${offset}`;
          const listRes = await axios.get(listUrl, { headers: { Authorization: `Bearer ${airtableAccessToken}` } });
          const page = listRes.data.records || [];
          totalChecked += page.length;
          const found = page.find(r => recordMatchesOrgnr(r) && byraIdMatch(getRecordByraId(r))) || null;
          if (found) return found;
          offset = listRes.data.offset || null;
          if (!offset || page.length === 0) return null;
        }
        return null;
      };
      try {
        existing = await tryPaginatedList(['Namn', 'Byrå ID', 'Orgnr']);
        if (!existing) existing = await tryPaginatedList(null); // utan fields[] = alla fält
        if (existing) console.log('🔒 Dubblettkontroll (paginerad sökning): befintlig kund hittad:', existing.id);
      } catch (e) {
        const errBody = e.response?.data;
        console.log('ℹ️ Dubblettkontroll paginerad sökning:', e.message, errBody ? JSON.stringify(errBody) : '');
      }
    }

    const runFallbackCheck = async () => {
      let records = [];
      // Försök först med Orgnr-fältet
      try {
        records = await fetchKunddataByOrgnr('Orgnr');
      } catch (e) {
        const status = e.response?.status;
        console.log('ℹ️ Dubblettkontroll: Orgnr-formel fel:', status || 'okänt', e.message);
      }

      // Om inga träffar: försök med Organisationsnummer-fältet
      if (records.length === 0) {
        try {
          records = await fetchKunddataByOrgnr('Organisationsnummer');
          if (records.length > 0) {
            console.log('🔒 Dubblettkontroll: hittade poster via fält Organisationsnummer');
          }
        } catch (e) {
          const status = e.response?.status;
          console.log('ℹ️ Dubblettkontroll: Organisationsnummer-formel fel:', status || 'okänt', e.message);
        }
      }

      // Sista fallback: hämta utan filter och filtrera i koden
      if (records.length === 0) {
        try {
          const url = `https://api.airtable.com/v0/${airtableBaseId}/${KUNDDATA_TABLE}?maxRecords=200&fields[]=id&fields[]=Namn&fields[]=Byrå ID&fields[]=Orgnr`;
          const res = await axios.get(url, { headers: { Authorization: `Bearer ${airtableAccessToken}` } });
          records = res.data.records || [];
          console.log('🔒 Dubblettkontroll: sista fallback utan filter, poster:', records.length);
        } catch (e) {
          console.log('ℹ️ Dubblettkontroll: sista fallback misslyckades:', e.message);
        }
      }

      if (records.length > 0) {
        const sample = records.slice(0, 3).map(r => ({ id: r.id, Orgnr: orgnrFromRecord(r), ByraId: getRecordByraId(r), raw: r.fields?.['Byrå ID'] }));
        console.log('🔒 Fallback-sökning: poster med samma Orgnr:', records.length, 'exempel:', JSON.stringify(sample));
      }
      const found = records.find(r => recordMatchesOrgnr(r) && byraIdMatch(getRecordByraId(r))) || null;
      console.log('🔒 Fallback-sökning: match på byrå:', !!found, found ? `befintlig id=${found.id}` : '');
      return found;
    };

    if (!existing) {
      try {
        existing = await runFallbackCheck();
        if (existing) console.log('ℹ️ Dubblettkontroll: hittade befintlig kund (fallback), returnerar 409.');
      } catch (fallbackErr) {
        console.log('ℹ️ Dubblettkontroll fallback misslyckades:', fallbackErr.message);
      }
    }

    if (existing) {
      console.log('⚠️ Kund finns redan – spärr, returnerar 409 (ingen dubblett skapas):', existing.id);
      return res.status(409).json({
        error: 'duplicate',
        duplicate: true,
        message: 'Kunden är redan upplagd hos er byrå. Gå till befintligt kundkort istället.',
        airtableRecordId: existing.id,
        existingId: existing.id,
        existingNamn: existing.fields?.Namn || airtableData.fields?.Namn || ''
      });
    }

    console.log('🔒 Dubblettkontroll: ingen befintlig kund med orgnr=' + cleanOrgNumber + ' och byrå=' + byraIdClean + ' – sparar ny post.');

    let recordId;

    if (!recordId) {
      const createUrl = `https://api.airtable.com/v0/${airtableBaseId}/${KUNDDATA_TABLE}`;
      try {
        console.log('📤 Sparar till Airtable KUNDDATA:', createUrl);
        const airtableResponse = await axios.post(createUrl, {
          records: [{ fields: airtableData.fields }]
        }, {
          headers: {
            'Authorization': `Bearer ${airtableAccessToken}`,
            'Content-Type': 'application/json'
          },
          timeout: 15000
        });
        recordId = airtableResponse.data.records?.[0]?.id;
        if (!recordId) {
          console.error('❌ Airtable svarade utan record-id:', airtableResponse.data);
          return res.status(502).json({
            success: false,
            message: 'Airtable returnerade inget record-id efter sparande',
            airtableResponse: airtableResponse.data
          });
        }
      } catch (airtableErr) {
        const status = airtableErr.response?.status;
        const body = airtableErr.response?.data;
        const msg = body?.error?.message || body?.message || airtableErr.message;
        console.error('❌ Airtable sparande misslyckades:', status, msg, body ? JSON.stringify(body) : '');
        return res.status(status && status >= 400 ? status : 502).json({
          success: false,
          message: 'Kunde inte spara till Airtable',
          error: msg,
          airtableError: body?.error
        });
      }
    }

    const duration = Date.now() - startTime;

    const responseData = {
      success: true,
      message: 'Data sparad till Airtable',
      airtableRecordId: recordId,
      id: recordId,
      organisationsnummer: req.body.organisationsnummer || '',
      anvandareId: anvandareId || null,
      byraId: byraId || null,
      dokumentInfo: dokumentInfo,
      timestamp: new Date().toISOString(),
      duration: duration,
      environment: environment
    };

    console.log(`✅ Data sparad till Airtable:`, {
      organisationsnummer: req.body.organisationsnummer || '',
      anvandareId: anvandareId || 'Ej angivet',
      byraId: byraId || 'Ej angivet',
      recordId,
      duration
    });
    console.log(`📊 Airtable fields sent:`, airtableData.fields);

    res.json(responseData);

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('Error saving to Airtable:', error.message);
    
    // Om det är ett Airtable-autentiseringsfel, returnera data utan att spara
    if (error.message.includes('You should provide valid api key') || 
        error.message.includes('API key') || 
        error.message.includes('authentication')) {
      console.log('⚠️ Ogiltig Airtable API-nyckel - returnerar data utan att spara');
      return res.json({
        success: true,
        message: 'Data hämtad från Bolagsverket (Airtable API-nyckel ogiltig)',
        data: {
          organisationsnummer: req.body.organisationsnummer || '',
          företagsnamn: 'Data hämtad från Bolagsverket',
          verksamhetsbeskrivning: 'Data hämtad från Bolagsverket',
          adress: 'Data hämtad från Bolagsverket',
          bolagsform: 'Data hämtad från Bolagsverket',
          registreringsdatum: 'Data hämtad från Bolagsverket',
          aktivt_företag: 'Data hämtad från Bolagsverket',
          årsredovisningar: 0,
          nedladdade_filer: 0
        },
        airtableRecordId: null,
        airtableConfigured: false,
        airtableError: error.message,
        timestamp: new Date().toISOString(),
        duration: duration,
        source: 'Bolagsverket'
      });
    }
    
    res.status(500).json({
      error: 'Fel vid sparande till Airtable',
      message: error.message,
      duration: duration
    });
  }
});

// Enkel save-to-airtable endpoint som inte anropar Bolagsverket
app.post('/api/simple/save-to-airtable', async (req, res) => {
  try {
    console.log('💾 Simple save-to-airtable called, keys:', Object.keys(req.body || {}));
    const { organisationsnummer, namn, anvandareId, byraId } = req.body;
    
    if (!organisationsnummer) {
      return res.status(400).json({
        error: 'Organisationsnummer är obligatoriskt',
        message: 'Organization number is required'
      });
    }
    
    // Skapa enkel data för Airtable
    const airtableData = {
      fields: {
        'Orgnr': organisationsnummer,
        'Namn': namn || 'Okänt företag',
        'Användare': anvandareId || null,
        'Byrå ID': byraId || '',
        'Timestamp': new Date().toISOString()
      }
    };
    
    console.log('💾 Would save to Airtable:', airtableData);
    
    // Kontrollera om Airtable är konfigurerat
    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
    const airtableBaseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
    const airtableTableName = process.env.AIRTABLE_TABLE_NAME || 'KUNDDATA';
    
    if (!airtableAccessToken) {
      return res.json({
        success: true,
        message: 'Data skulle sparas till Airtable (Airtable inte konfigurerat)',
        data: airtableData,
        airtableConfigured: false
      });
    }
    
    // Spara till Airtable
    const createUrl = `https://api.airtable.com/v0/${airtableBaseId}/${airtableTableName}`;
    
    try {
      const airtableResponse = await axios.post(createUrl, {
        records: [{ fields: airtableData.fields }]
      }, {
        headers: {
          'Authorization': `Bearer ${airtableAccessToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      });
      
      res.json({
        success: true,
        message: 'Data sparad till Airtable',
        airtableRecordId: airtableResponse.data.records[0].id,
        data: airtableData,
        timestamp: new Date().toISOString()
      });
    } catch (airtableError) {
      console.error('Airtable API error:', airtableError.response?.status, airtableError.response?.data);
      
      // Om Airtable misslyckas, returnera data utan att spara
      res.json({
        success: true,
        message: 'Data mottagen men kunde inte sparas till Airtable',
        data: airtableData,
        airtableError: airtableError.response?.data || airtableError.message,
        airtableStatus: airtableError.response?.status,
        timestamp: new Date().toISOString()
      });
    }
    
  } catch (error) {
    console.error('Simple save-to-airtable error:', error);
    res.status(500).json({
      error: 'Fel vid sparande till Airtable',
      message: error.message
    });
  }
});

// Test endpoint för datakälla (Airtable) – används av dashboard
async function handleTestDatasourceConnection(req, res) {
  try {
    console.log('🧪 Testing Airtable connection...');
    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
    const airtableBaseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
    const airtableTableName = process.env.AIRTABLE_TABLE_NAME || 'KUNDDATA';

    if (!airtableAccessToken) {
      return res.json({
        success: false,
        message: 'Airtable inte konfigurerat (AIRTABLE_ACCESS_TOKEN saknas)',
        dataSource: 'airtable',
        config: {
          hasToken: !!airtableAccessToken,
          hasBaseId: !!airtableBaseId,
          hasTableName: !!airtableTableName
        }
      });
    }

    const testUrl = `https://api.airtable.com/v0/${airtableBaseId}/${airtableTableName}?maxRecords=1`;
    try {
      const response = await axios.get(testUrl, {
        headers: {
          'Authorization': `Bearer ${airtableAccessToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });
      return res.json({
        success: true,
        message: 'Airtable-anslutning fungerar',
        dataSource: 'airtable',
        status: response.status,
        recordCount: response.data.records?.length || 0,
        config: {
          baseId: airtableBaseId,
          tableName: airtableTableName,
          hasToken: !!airtableAccessToken
        }
      });
    } catch (airtableError) {
      console.error('Airtable connection test failed:', airtableError.message);
      return res.json({
        success: false,
        message: 'Airtable-anslutning misslyckades',
        dataSource: 'airtable',
        error: {
          status: airtableError.response?.status,
          message: airtableError.message,
          details: airtableError.response?.data
        },
        config: {
          baseId: airtableBaseId,
          tableName: airtableTableName,
          hasToken: !!airtableAccessToken
        }
      });
    }
    
  } catch (error) {
    console.error('Test datasource connection error:', error);
    res.status(500).json({
      success: false,
      message: 'Fel vid test av datakälla',
      error: error.message
    });
  }
}
app.post('/api/test-airtable-connection', handleTestDatasourceConnection);
app.post('/api/test-datasource-connection', handleTestDatasourceConnection);

// Debug endpoint för att se användardata (utan autentisering för testning)
app.get('/api/debug/user-data', async (req, res) => {
  try {
    const userEmail = req.user.email;
    console.log('🔍 Debug user-data endpoint called for email:', userEmail);
    
    // Hämta användardata från Airtable
    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
    const airtableBaseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
    
    if (!airtableAccessToken) {
      return res.status(500).json({
        error: 'Airtable inte konfigurerat',
        message: 'AIRTABLE_ACCESS_TOKEN saknas'
      });
    }
    
    const airtableUrl = `https://api.airtable.com/v0/${airtableBaseId}/Application Users?filterByFormula={Email}="${userEmail}"`;
    
    const response = await axios.get(airtableUrl, {
      headers: {
        'Authorization': `Bearer ${airtableAccessToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (response.data.records && response.data.records.length > 0) {
      const userData = response.data.records[0];
      console.log('🔍 User data from Airtable:', userData);
      
      res.json({
        success: true,
        message: 'Användardata hämtad',
        userData: userData,
        fields: userData.fields,
        availableFields: Object.keys(userData.fields),
        recordId: userData.id
      });
    } else {
      res.status(404).json({
        error: 'Användare hittades inte',
        message: 'Ingen användare hittad med denna email'
      });
    }
    
  } catch (error) {
    console.error('Debug user-data endpoint error:', error);
    res.status(500).json({
      error: 'Fel vid hämtning av användardata',
      message: error.message
    });
  }
});

// Debug endpoint för att se vad som skickas från frontend
app.post('/api/debug/save-to-airtable', async (req, res) => {
  try {
    console.log('🔍 DEBUG: Frontend data received:', {
      body: req.body,
      headers: req.headers,
      method: req.method,
      url: req.url,
      timestamp: new Date().toISOString()
    });
    
    res.json({
      success: true,
      message: 'Debug data received',
      receivedData: req.body,
      headers: req.headers,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Debug endpoint error:', error);
    res.status(500).json({
      error: 'Debug endpoint error',
      message: error.message
    });
  }
});

// Test endpoint för att verifiera att save-to-airtable fungerar
app.post('/api/test/save-to-airtable', async (req, res) => {
  try {
    console.log('🧪 Test save-to-airtable called, keys:', Object.keys(req.body || {}));
    // Simulera en enkel Airtable-save
    const testData = {
      fields: {
        'Orgnr': req.body.organisationsnummer || 'TEST123',
        'Namn': req.body.namn || 'Test Företag',
        'Användare': req.body.anvandareId || 'TEST_USER',
        'Byrå ID': req.body.byraId || 'TEST_BUREAU'
      }
    };
    
    console.log('🧪 Would save to Airtable:', testData);
    
    res.json({
      success: true,
      message: 'Test data would be saved to Airtable',
      testData: testData,
      receivedKeys: Object.keys(req.body || {})
    });
    
  } catch (error) {
    console.error('Test endpoint error:', error);
    res.status(500).json({
      error: 'Test endpoint error',
      message: error.message
    });
  }
});

// Bolagsverket hämta dokument endpoint (POST) - för Softr webhooks
app.post('/api/bolagsverket/dokument/:dokumentId', async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { dokumentId } = req.params;
    
    console.log(`📥 Mottaget POST dokument-förfrågan:`, {
      dokumentId: dokumentId,
      body: req.body,
      headers: req.headers,
      method: req.method,
      url: req.url
    });
    
    if (!dokumentId) {
      return res.status(400).json({
        error: 'Dokument-ID är obligatoriskt',
        message: 'Document ID is required'
      });
    }

    const token = await getBolagsverketToken();
    const environment = process.env.BOLAGSVERKET_ENVIRONMENT || 'test';
    const dokumentUrl = environment === 'test'
      ? `https://gw-accept2.api.bolagsverket.se/vardefulla-datamangder/v1/dokument/${dokumentId}`
      : `https://gw.api.bolagsverket.se/vardefulla-datamangder/v1/dokument/${dokumentId}`;

    const requestId = crypto.randomUUID();

    const headers = {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/zip',
      'X-Request-Id': requestId
    };

    console.log(`🔍 Hämtar dokument med ID: ${dokumentId} (POST)`);

    const bolagsverketResponse = await axios.get(dokumentUrl, {
      headers,
      responseType: 'arraybuffer',
      timeout: 30000
    });

    const duration = Date.now() - startTime;

    console.log(`✅ Dokument hämtat (POST):`, {
      dokumentId: dokumentId,
      contentType: bolagsverketResponse.headers['content-type'],
      contentLength: bolagsverketResponse.headers['content-length'],
      duration: duration
    });

    // Skicka tillbaka ZIP-filen
    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="arsredovisning-${dokumentId}.zip"`,
      'Content-Length': bolagsverketResponse.headers['content-length']
    });

    res.send(bolagsverketResponse.data);

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('Error fetching dokument (POST):', error.message);
    
    if (error.response) {
      res.status(error.response.status).json({
        error: 'Bolagsverket API fel',
        message: error.response.data?.detail || error.response.data?.message || error.message,
        status: error.response.status,
        duration: duration,
        requestId: error.response.headers['x-request-id'] || null
      });
    } else {
      res.status(500).json({
        error: 'Internt serverfel',
        message: error.message,
        duration: duration
      });
    }
  }
});

// Endpoint för att ladda ner sparade filer
app.get('/api/download/:filename', (req, res) => {
  try {
    const { filename } = req.params;
    const filePath = path.join(__dirname, 'temp', filename);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        error: 'Fil hittades inte',
        message: 'File not found'
      });
    }
    
    // Bestäm content-type baserat på filändelse
    const ext = path.extname(filename).toLowerCase();
    let contentType = 'application/octet-stream';
    
    if (ext === '.pdf') {
      contentType = 'application/pdf';
    } else if (ext === '.zip') {
      contentType = 'application/zip';
    }
    
    res.set({
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`
    });
    
    res.sendFile(filePath);
    
  } catch (error) {
    console.error('Error serving file:', error.message);
    res.status(500).json({
      error: 'Internt serverfel',
      message: error.message
    });
  }
});

// Enkel cache för fält-id per tabell (för Content API uploadAttachment)
const AIRTABLE_FIELD_ID_CACHE = {};

// Hjälp: spara attachment till ett specifikt fält (för kategoriserad dokumentation)
async function uploadAttachmentToAirtableField(airtableToken, baseId, recordId, fileBuffer, filename, contentType, tableId, fieldName) {
  const base64 = fileBuffer.toString('base64');
  let url;
  let fieldId = null;

  try {
    if (tableId) {
      const cacheKey = `${tableId}:${fieldName}`;
      fieldId = AIRTABLE_FIELD_ID_CACHE[cacheKey] || null;
      if (!fieldId) {
        // Meta API: listar alla tabeller i basen (finns inget endpoint för en enskild tabell)
        const metaRes = await axios.get(
          `https://api.airtable.com/v0/meta/bases/${baseId}/tables`,
          { headers: { Authorization: `Bearer ${airtableToken}` }, timeout: 10000 }
        );
        const raw = metaRes.data;
        const tables = Array.isArray(raw?.tables) ? raw.tables : (Array.isArray(raw) ? raw : []);
        const table = tables.find(t => (t.id || '') === tableId);
        const fields = (table && table.fields) || [];
        const match = fields.find(f => (f.name || '').trim() === fieldName);
        if (match && match.id) {
          fieldId = match.id;
          AIRTABLE_FIELD_ID_CACHE[cacheKey] = fieldId;
        } else {
          console.warn('uploadAttachmentToAirtableField: fält "' + fieldName + '" hittades inte i tabell ' + tableId + ', tillgängliga: ' + fields.map(f => f.name).join(', '));
        }
      }
    }
  } catch (metaErr) {
    const msg = metaErr.response?.data?.error?.message || metaErr.message;
    console.error('uploadAttachmentToAirtableField meta lookup failed for field', fieldName, 'table', tableId, '-', msg);
  }

  if (fieldId) {
    // Rekommenderad Content API-path: baseId/recordId/fieldId/uploadAttachment
    url = `https://content.airtable.com/v0/${baseId}/${recordId}/${fieldId}/uploadAttachment`;
  } else {
    // Fallback med fältnamn (utan tableId, enligt Content API-dokumentation)
    url = `https://content.airtable.com/v0/${baseId}/${recordId}/${encodeURIComponent(fieldName)}/uploadAttachment`;
  }
  try {
    const res = await axios.post(url, {
      contentType: contentType || 'application/pdf',
      file: base64,
      filename
    }, {
      headers: { 'Authorization': `Bearer ${airtableToken}`, 'Content-Type': 'application/json' },
      timeout: 30000,
      // Tillåt större payload här; Airtable avgör maxstorlek.
      maxContentLength: 60 * 1024 * 1024,
      maxBodyLength: 60 * 1024 * 1024
    });
    const ok = !!(res.data && (res.data.url || res.data.id));
    if (!ok) {
      console.error('uploadAttachmentToAirtableField unexpected response for field', fieldName, 'record', recordId, 'url', url, 'res.data keys:', Object.keys(res.data || {}));
    }
    return ok;
  } catch (err) {
    const msg = err.response?.data?.error?.message || err.message;
    console.error('uploadAttachmentToAirtableField failed for field', fieldName, 'record', recordId, 'url', url, '-', msg);
    return false;
  }
}

// Hjälp: som uploadAttachmentToAirtableField, men returnerar attachment-objektet (url/id/filename)
async function uploadAttachmentToAirtableFieldReturnAttachment(airtableToken, baseId, recordId, fileBuffer, filename, contentType, tableId, fieldName) {
  const base64 = fileBuffer.toString('base64');
  let url;
  let fieldId = null;

  try {
    if (tableId) {
      const cacheKey = `${tableId}:${fieldName}`;
      fieldId = AIRTABLE_FIELD_ID_CACHE[cacheKey] || null;
      if (!fieldId) {
        const metaRes = await axios.get(
          `https://api.airtable.com/v0/meta/bases/${baseId}/tables`,
          { headers: { Authorization: `Bearer ${airtableToken}` }, timeout: 10000 }
        );
        const raw = metaRes.data;
        const tables = Array.isArray(raw?.tables) ? raw.tables : (Array.isArray(raw) ? raw : []);
        const table = tables.find(t => (t.id || '') === tableId);
        const fields = (table && table.fields) || [];
        const match = fields.find(f => (f.name || '').trim() === fieldName);
        if (match && match.id) {
          fieldId = match.id;
          AIRTABLE_FIELD_ID_CACHE[cacheKey] = fieldId;
        } else {
          console.warn('uploadAttachmentToAirtableFieldReturnAttachment: fält "' + fieldName + '" hittades inte i tabell ' + tableId);
        }
      }
    }
  } catch (metaErr) {
    const msg = metaErr.response?.data?.error?.message || metaErr.message;
    console.error('uploadAttachmentToAirtableFieldReturnAttachment meta lookup failed for field', fieldName, 'table', tableId, '-', msg);
  }

  if (fieldId) url = `https://content.airtable.com/v0/${baseId}/${recordId}/${fieldId}/uploadAttachment`;
  else url = `https://content.airtable.com/v0/${baseId}/${recordId}/${encodeURIComponent(fieldName)}/uploadAttachment`;

  try {
    const res = await axios.post(url, {
      contentType: contentType || 'application/octet-stream',
      file: base64,
      filename
    }, {
      headers: { 'Authorization': `Bearer ${airtableToken}`, 'Content-Type': 'application/json' },
      timeout: 30000,
      maxContentLength: 60 * 1024 * 1024,
      maxBodyLength: 60 * 1024 * 1024
    });
    if (!res.data) return null;
    // Content API kan returnera {id,url,filename,...} eller {attachment:{...}}
    const att = res.data.attachment || res.data;
    if (att && (att.url || att.id)) return att;
    return null;
  } catch (err) {
    const msg = err.response?.data?.error?.message || err.message;
    console.error('uploadAttachmentToAirtableFieldReturnAttachment failed for field', fieldName, 'record', recordId, '-', msg);
    return null;
  }
}

// Hjälp: spara attachment till Airtable via Content API (fungerar utan publik URL)
async function uploadAttachmentToAirtable(airtableToken, baseId, recordId, fileBuffer, filename, contentType, tableId) {
  const fieldNames = ['Dokumentation', 'Attachments', 'PEP rapporter', 'PEP rapport'];
  const base64 = fileBuffer.toString('base64');
  for (const fieldName of fieldNames) {
    try {
      const url = tableId
        ? `https://content.airtable.com/v0/${baseId}/${tableId}/${recordId}/${encodeURIComponent(fieldName)}/uploadAttachment`
        : `https://content.airtable.com/v0/${baseId}/${recordId}/${encodeURIComponent(fieldName)}/uploadAttachment`;
      const res = await axios.post(url, {
        contentType: contentType || 'application/pdf',
        file: base64,
        filename
      }, {
        headers: {
          'Authorization': `Bearer ${airtableToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000,
        maxContentLength: 60 * 1024 * 1024,
        maxBodyLength: 60 * 1024 * 1024
      });
      if (res.data && (res.data.url || res.data.id)) {
        console.log('✅ Fil uppladdad till Airtable via Content API, fält:', fieldName);
        return true;
      }
    } catch (err) {
      const status = err.response?.status;
      const msg = err.response?.data?.error?.message || err.message;
      if (status === 404 || status === 422) continue;
      console.warn('Upload till fält', fieldName, 'misslyckades:', status, msg);
    }
  }
  return false;
}

const KUNDDATA_TABLE_DOCS = 'tblOIuLQS2DqmOQWe';

/** Sparar PDF på kundens Dokumentation-flik (fält + kategori-metadata). */
async function savePdfToKundDokumentationTab(airtableToken, baseId, customerId, fileBuffer, filename, category, options = {}) {
  const contentType = options.contentType || 'application/pdf';
  const customCategory = (options.customCategory || '').trim();
  const baseUrl = options.baseUrl || null;

  let saved = await uploadAttachmentToAirtableField(
    airtableToken, baseId, customerId, fileBuffer, filename, contentType, KUNDDATA_TABLE_DOCS, 'Dokumentation'
  );
  if (!saved) {
    saved = await uploadAttachmentToAirtable(
      airtableToken, baseId, customerId, fileBuffer, filename, contentType, KUNDDATA_TABLE_DOCS
    );
  }

  if (!saved && baseUrl) {
    const fileUrl = await saveFileLocally(fileBuffer, filename, contentType, baseUrl);
    if (fileUrl) {
      try {
        const custRes = await axios.get(
          `https://api.airtable.com/v0/${baseId}/${KUNDDATA_TABLE_DOCS}/${customerId}`,
          { headers: { Authorization: `Bearer ${airtableToken}` } }
        );
        const f = custRes.data.fields || {};
        for (const fieldName of ['Dokumentation', 'Attachments']) {
          try {
            const existing = f[fieldName] || [];
            const arr = Array.isArray(existing) ? [...existing] : [];
            arr.push({ url: fileUrl, filename });
            await axios.patch(
              `https://api.airtable.com/v0/${baseId}/${KUNDDATA_TABLE_DOCS}/${customerId}`,
              { fields: { [fieldName]: arr } },
              { headers: { Authorization: `Bearer ${airtableToken}`, 'Content-Type': 'application/json' } }
            );
            saved = true;
            console.log('✅ PDF sparad i fält:', fieldName);
            break;
          } catch (e) {
            if (e.response?.status === 422) continue;
          }
        }
      } catch (_) { /* ignore */ }
    }
  }

  if (saved && category) {
    try {
      const custRes = await axios.get(
        `https://api.airtable.com/v0/${baseId}/${KUNDDATA_TABLE_DOCS}/${customerId}`,
        { headers: { Authorization: `Bearer ${airtableToken}` } }
      );
      const f = custRes.data.fields || {};
      let kategorier = [];
      const raw = (f['Dokumentation Kategorier'] || '').toString().trim();
      if (raw) kategorier = JSON.parse(raw);
      if (!Array.isArray(kategorier)) kategorier = [];
      kategorier.push({ filename, category, customCategory });
      await axios.patch(
        `https://api.airtable.com/v0/${baseId}/${KUNDDATA_TABLE_DOCS}/${customerId}`,
        { fields: { 'Dokumentation Kategorier': JSON.stringify(kategorier) } },
        { headers: { Authorization: `Bearer ${airtableToken}`, 'Content-Type': 'application/json' } }
      );
    } catch (e) {
      console.warn('⚠️ Kunde inte spara Dokumentation Kategorier:', e.message);
    }
  }

  return saved;
}

// Funktion för att spara fil lokalt och returnera URL
// baseUrlOverride: om req.get('host') används, gör URL:en åtkomlig för Airtable vid ngrok/tunnel
async function saveFileLocally(fileBuffer, filename, contentType, baseUrlOverride) {
  try {
    console.log(`💾 Sparar fil lokalt: ${filename}`);
    
    // Skapa en unik filnamn för att undvika konflikter
    const timestamp = Date.now();
    const uniqueFilename = `${timestamp}-${filename}`;
    
    // Spara filen i en temporär mapp
    const tempDir = path.join(__dirname, 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    const filePath = path.join(tempDir, uniqueFilename);
    fs.writeFileSync(filePath, fileBuffer);
    
    // Returnera en URL som pekar på vår download endpoint.
    // Prioritera PUBLIC_BASE_URL (för prod/ngrok) så Airtable kan hämta filen. Annars använd req-host.
    const baseUrl = process.env.PUBLIC_BASE_URL || baseUrlOverride || `http://localhost:${PORT}`;
    const fileUrl = `${baseUrl}/api/download/${uniqueFilename}`;
    
    console.log(`✅ Fil sparad lokalt: ${filename} -> ${fileUrl}`);
    return fileUrl;
  } catch (error) {
    console.log(`❌ Fel vid sparande av fil: ${error.message}`);
    return null;
  }
}

// Risk Assessment API Endpoints
const RISK_ASSESSMENT_TABLE = 'Risker kopplad till tjänster';

function isAirtableRecordIdStr(s) {
  return typeof s === 'string' && /^rec[A-Za-z0-9]{10,}$/.test(String(s).trim());
}

function extractRecIdsFromText(text) {
  if (!text) return [];
  const ids = new Set();
  const re = /rec[A-Za-z0-9]{10,}/g;
  let m;
  const s = String(text);
  while ((m = re.exec(s)) !== null) ids.add(m[0]);
  return [...ids];
}

function isEmptyRiskLabelValue(v) {
  const t = String(v == null ? '' : v).trim();
  return !t || /^[—\-–\s.]+$/.test(t);
}

async function fetchTjanstRecordName(id, airtableAccessToken, airtableBaseId) {
  try {
    const r = await axios.get(
      `https://api.airtable.com/v0/${airtableBaseId}/${encodeURIComponent(RISK_ASSESSMENT_TABLE)}/${id}`,
      { headers: { Authorization: `Bearer ${airtableAccessToken}` }, timeout: 8000 }
    );
    return (r.data.fields && r.data.fields['Task Name'] || '').trim();
  } catch (_) {
    return '';
  }
}

/** Byråns tjänster + eventuella rec-ID:n i text → id → Task Name */
async function buildTjanstIdToNamnMap(airtableAccessToken, airtableBaseId, byraId, extraTextOrIds = []) {
  const map = new Map();
  if (!byraId || !airtableAccessToken) return map;

  const formula = encodeURIComponent(`{Byrå ID}="${byraId}"`);
  let allRecords = [];
  let offset = null;
  do {
    let url = `https://api.airtable.com/v0/${airtableBaseId}/${encodeURIComponent(RISK_ASSESSMENT_TABLE)}?filterByFormula=${formula}`
      + `&fields[]=Task%20Name&pageSize=100`;
    if (offset) url += `&offset=${offset}`;
    const response = await axios.get(url, {
      headers: { Authorization: `Bearer ${airtableAccessToken}` }
    });
    allRecords = allRecords.concat(response.data.records || []);
    offset = response.data.offset;
  } while (offset);

  for (const r of allRecords) {
    const namn = (r.fields['Task Name'] || '').trim();
    if (r.id && namn && !isAirtableRecordIdStr(namn)) map.set(r.id, namn);
  }

  const extraIds = Array.isArray(extraTextOrIds)
    ? extraTextOrIds.filter(isAirtableRecordIdStr)
    : extractRecIdsFromText(extraTextOrIds);
  await Promise.all(extraIds.map(async (id) => {
    if (map.has(id)) return;
    const namn = await fetchTjanstRecordName(id, airtableAccessToken, airtableBaseId);
    if (namn && !isAirtableRecordIdStr(namn)) map.set(id, namn);
  }));
  return map;
}

function sanitizeIdentifieradeRiskerText(text, idToNamn) {
  if (!text || typeof text !== 'string') return text || '';
  const map = idToNamn instanceof Map ? idToNamn : new Map(Object.entries(idToNamn || {}));
  let out = text;

  for (const [id, namn] of map) {
    if (!id || !namn) continue;
    const escId = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`(\\*\\*Tjänst:\\s*)${escId}(\\s*\\*\\*)`, 'gi'), `$1${namn}$2`);
    out = out.replace(new RegExp(`(^|[\\r\\n])(Tjänst:\\s*)${escId}(?=\\s*(?:[\\r\\n]|$))`, 'gim'), `$1$2${namn}`);
  }

  out = out.replace(/(\*\*Tjänst:\s*)(rec[A-Za-z0-9]{10,})(\s*\*\*)/gi, (full, p1, id, p3) => {
    const namn = map.get(id);
    return namn ? `${p1}${namn}${p3}` : full;
  });
  out = out.replace(/(^|[\r\n])(Tjänst:\s*)(rec[A-Za-z0-9]{10,})(?=\s*(?:[\r\n]|$))/gim, (full, p1, p2, id) => {
    const namn = map.get(id);
    return namn ? `${p1}${p2}${namn}` : full;
  });

  return stripEmptyTjanstRiskSections(out);
}

/** Ta bort tomma tjänstsektioner (endast — under Hot/Sårbarhet/Risknivå) */
function stripEmptyTjanstRiskSections(text) {
  if (!text || typeof text !== 'string') return text || '';
  const blocks = text.split(/\n\n+/);
  const kept = blocks.filter((block) => {
    const trimmed = block.trim();
    if (!/^\*\*Tjänst:|^Tjänst:/im.test(trimmed)) return true;
    const hotM = trimmed.match(/\*\*Hot:\*\*\s*([^\n]*?)(?:\n|$)|^Hot:\s*([^\n]*?)(?:\n|$)/im);
    const sarM = trimmed.match(/\*\*Sårbarhet:\*\*\s*([^\n]*?)(?:\n|$)|^Sårbarhet:\s*([^\n]*?)(?:\n|$)/im);
    const riskM = trimmed.match(/\*\*Risknivå och åtgärder:\*\*\s*([^\n]*?)(?:\n|$)|^Risknivå och åtgärder:\s*([^\n]*?)(?:\n|$)/im);
    const h = hotM ? (hotM[1] != null ? hotM[1] : hotM[2]) : '';
    const s = sarM ? (sarM[1] != null ? sarM[1] : sarM[2]) : '';
    const r = riskM ? (riskM[1] != null ? riskM[1] : riskM[2]) : '';
    if (!isEmptyRiskLabelValue(h) || !isEmptyRiskLabelValue(s) || !isEmptyRiskLabelValue(r)) return true;
    let body = trimmed
      .replace(/^\*\*Tjänst:[^\n]+\*\*\s*/i, '')
      .replace(/^Tjänst:[^\n]+\s*/i, '');
    body = body
      .replace(/\*\*Hot:\*\*[^\n]*/gi, '')
      .replace(/\*\*Sårbarhet:\*\*[^\n]*/gi, '')
      .replace(/\*\*Risknivå och åtgärder:\*\*[^\n]*/gi, '')
      .replace(/^Hot:[^\n]*/gim, '')
      .replace(/^Sårbarhet:[^\n]*/gim, '')
      .replace(/^Risknivå och åtgärder:[^\n]*/gim, '')
      .trim();
    if (!body || /^[—\-–\s.]*$/.test(body)) return false;
    return true;
  });
  return kept.join('\n\n');
}

// GET /api/risk-assessments - Hämta alla riskbedömningar med pagination
app.get('/api/risk-assessments', async (req, res) => {
  const startTime = Date.now();
  
  try {
    console.log('Hämtar alla riskbedömningar från Airtable med pagination...');
    
    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
    const airtableBaseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
    
    if (!airtableAccessToken) {
      return res.status(500).json({
        error: 'Airtable API-nyckel saknas',
        message: 'AIRTABLE_ACCESS_TOKEN är inte konfigurerad'
      });
    }

    let allRecords = [];
    let offset = null;
    let pageCount = 0;
    
    do {
      pageCount++;
      console.log(`Hämtar sida ${pageCount}...`);
      
      let url = `https://api.airtable.com/v0/${airtableBaseId}/${RISK_ASSESSMENT_TABLE}?pageSize=100`;
      if (offset) {
        url += `&offset=${offset}`;
      }
      
      const response = await axios.get(url, {
        headers: {
          'Authorization': `Bearer ${airtableAccessToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      });

      // Lägg till poster från denna sida
      allRecords = allRecords.concat(response.data.records);
      
      // Hämta offset för nästa sida
      offset = response.data.offset;
      
      console.log(`Sida ${pageCount}: ${response.data.records.length} poster (total: ${allRecords.length})`);
      
    } while (offset);

    const duration = Date.now() - startTime;
    
    console.log(`Alla riskbedömningar hämtade: ${allRecords.length} st (${pageCount} sidor)`);
    
    res.json({
      success: true,
      records: allRecords,
      totalRecords: allRecords.length,
      pagesFetched: pageCount,
      duration: duration
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('Error fetching risk assessments:', error.message);
    
    res.status(500).json({
      error: 'Fel vid hämtning av riskbedömningar',
      message: error.message,
      duration: duration
    });
  }
});

// POST /api/risk-assessments - Skapa ny riskbedömning
app.post('/api/risk-assessments', async (req, res) => {
  const startTime = Date.now();
  
  try {
    console.log('📝 Skapar ny riskbedömning...');
    
    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
    const airtableBaseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
    
    if (!airtableAccessToken) {
      return res.status(500).json({
        error: 'Airtable API-nyckel saknas',
        message: 'AIRTABLE_ACCESS_TOKEN är inte konfigurerad'
      });
    }

    const riskData = req.body;
    console.log('📝 Mottaget riskbedömningsdata:', riskData);
    
    // Konvertera fältnamn till fält-ID:n för Airtable
    const fieldMapping = {
      'Task Name': 'fld4yI8yL4PyHO5LX',
      'TJÄNSTTYP': 'fldA3OjtA9IOnH0XL',
      'Beskrivning av riskfaktor': 'fldxHa72ao5Zpekt2',
      'Riskbedömning': 'fldFQcjlerFO8GGQf',
      'Åtgjärd': 'fldnrHoCosECXWaQM',
      'Åtgärd': 'fldnrHoCosECXWaQM',
      'Åtgjörd': 'fldnrHoCosECXWaQM'
    };
    
    // Skapa nytt objekt med fält-ID:n
    const airtableData = {};
    Object.keys(riskData).forEach(key => {
      const fieldId = fieldMapping[key];
      if (fieldId) {
        airtableData[fieldId] = riskData[key];
        console.log(`📝 Mappat ${key} -> ${fieldId}`);
      } else {
        airtableData[key] = riskData[key]; // Behåll andra fält som de är
      }
    });
    
    // Validera obligatoriska fält – numera räcker tjänstens namn (Task Name).
    // Övrigt innehåll (beskrivning, hot, sårbarheter, åtgärder) fylls i efterhand,
    // ofta via AI-förslag, så byrån kan skapa en tjänst med bara ett namn.
    const requiredFieldIds = ['fld4yI8yL4PyHO5LX'];
    const missingFields = requiredFieldIds.filter(fieldId => !airtableData[fieldId]);
    
    if (missingFields.length > 0) {
      console.log('📝 Riskbedömning data:', airtableData);
      console.log('📝 Missing field IDs:', missingFields);
      return res.status(400).json({
        error: 'Saknade obligatoriska fält',
        message: 'Tjänstens namn (Task Name) är obligatoriskt.',
        receivedData: airtableData
      });
    }

    const url = `https://api.airtable.com/v0/${airtableBaseId}/${RISK_ASSESSMENT_TABLE}`;
    
    const response = await axios.post(url, {
      records: [{ fields: airtableData }]
    }, {
      headers: {
        'Authorization': `Bearer ${airtableAccessToken}`,
        'Content-Type': 'application/json'
      },
      timeout: 15000
    });

    const duration = Date.now() - startTime;
    
    console.log(`✅ Riskbedömning skapad: ${response.data.records[0].id}`);
    
    res.json({
      success: true,
      record: response.data.records[0],
      duration: duration
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('Error creating risk assessment:', error.message);
    
    if (error.response) {
      console.error('Airtable API Error:', error.response.data);
      res.status(error.response.status).json({
        error: 'Airtable API-fel',
        message: error.response.data.error || error.message,
        airtableError: error.response.data,
        duration: duration
      });
    } else {
      res.status(500).json({
        error: 'Fel vid skapande av riskbedömning',
        message: error.message,
        duration: duration
      });
    }
  }
});

// PUT /api/risk-assessments/:id - Uppdatera riskbedömning
app.put('/api/risk-assessments/:id', async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { id } = req.params;
    console.log(`📝 Uppdaterar riskbedömning: ${id}`);
    
    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
    const airtableBaseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
    
    if (!airtableAccessToken) {
      return res.status(500).json({
        error: 'Airtable API-nyckel saknas',
        message: 'AIRTABLE_ACCESS_TOKEN är inte konfigurerad'
      });
    }

    const riskData = req.body;
    console.log(`📝 Mottaget uppdateringsdata för ${id}:`, riskData);
    
    // Konvertera fältnamn till fält-ID:n för Airtable
    const fieldMapping = {
      'Task Name': 'fld4yI8yL4PyHO5LX',
      'TJÄNSTTYP': 'fldA3OjtA9IOnH0XL',
      'Beskrivning av riskfaktor': 'fldxHa72ao5Zpekt2',
      'Riskbedömning': 'fldFQcjlerFO8GGQf',
      'Åtgjärd': 'fldnrHoCosECXWaQM',
      'Åtgärd': 'fldnrHoCosECXWaQM',
      'Åtgjörd': 'fldnrHoCosECXWaQM'
    };
    
    // Skapa nytt objekt med fält-ID:n
    const airtableData = {};
    Object.keys(riskData).forEach(key => {
      const fieldId = fieldMapping[key];
      if (fieldId) {
        airtableData[fieldId] = riskData[key];
        console.log(`📝 Mappat ${key} -> ${fieldId}`);
      } else {
        airtableData[key] = riskData[key]; // Behåll andra fält som de är
      }
    });
    
    const url = `https://api.airtable.com/v0/${airtableBaseId}/${RISK_ASSESSMENT_TABLE}/${id}`;
    
    const response = await axios.patch(url, {
      fields: airtableData
    }, {
      headers: {
        'Authorization': `Bearer ${airtableAccessToken}`,
        'Content-Type': 'application/json'
      },
      timeout: 15000
    });

    const duration = Date.now() - startTime;
    
    console.log(`✅ Riskbedömning uppdaterad: ${id}`);
    
    res.json({
      success: true,
      record: response.data,
      duration: duration
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('Error updating risk assessment:', error.message);
    
    res.status(500).json({
      error: 'Fel vid uppdatering av riskbedömning',
      message: error.message,
      duration: duration
    });
  }
});

// PUT /api/risk-assessments/:id/approve - Godkänn riskbedömning
app.put('/api/risk-assessments/:id/approve', async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { id } = req.params;
    console.log(`✅ Godkänner riskbedömning: ${id}`);
    
    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
    const airtableBaseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
    
    if (!airtableAccessToken) {
      return res.status(500).json({
        error: 'Airtable API-nyckel saknas',
        message: 'AIRTABLE_ACCESS_TOKEN är inte konfigurerad'
      });
    }

    const approvalData = req.body;
    
    const url = `https://api.airtable.com/v0/${airtableBaseId}/${RISK_ASSESSMENT_TABLE}/${id}`;
    
    const response = await axios.patch(url, {
      fields: approvalData
    }, {
      headers: {
        'Authorization': `Bearer ${airtableAccessToken}`,
        'Content-Type': 'application/json'
      },
      timeout: 15000
    });

    const duration = Date.now() - startTime;
    
    console.log(`✅ Riskbedömning godkänd: ${id}`);
    
    res.json({
      success: true,
      record: response.data,
      duration: duration
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('Error approving risk assessment:', error.message);
    
    res.status(500).json({
      error: 'Fel vid godkännande av riskbedömning',
      message: error.message,
      duration: duration
    });
  }
});

// DELETE /api/risk-assessments/:id - Ta bort riskbedömning
app.delete('/api/risk-assessments/:id', async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { id } = req.params;
    console.log(`🗑️ Tar bort riskbedömning: ${id}`);
    
    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
    const airtableBaseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
    
    if (!airtableAccessToken) {
      return res.status(500).json({
        error: 'Airtable API-nyckel saknas',
        message: 'AIRTABLE_ACCESS_TOKEN är inte konfigurerad'
      });
    }

    const url = `https://api.airtable.com/v0/${airtableBaseId}/${RISK_ASSESSMENT_TABLE}/${id}`;
    
    await axios.delete(url, {
      headers: {
        'Authorization': `Bearer ${airtableAccessToken}`,
        'Content-Type': 'application/json'
      },
      timeout: 15000
    });

    const duration = Date.now() - startTime;
    
    console.log(`✅ Riskbedömning borttagen: ${id}`);
    
    res.json({
      success: true,
      message: 'Riskbedömning borttagen',
      duration: duration
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('Error deleting risk assessment:', error.message);
    
    res.status(500).json({
      error: 'Fel vid borttagning av riskbedömning',
      message: error.message,
      duration: duration
    });
  }
});

// GET /api/data-source (och /data-source) – Vilken datakälla används (Airtable)
function handleDataSource(req, res) {
  res.json({
    dataSource: 'airtable',
    configured: !!(process.env.AIRTABLE_ACCESS_TOKEN && process.env.AIRTABLE_BASE_ID)
  });
}
app.get('/api/data-source', handleDataSource);
app.get('/data-source', handleDataSource);

// GET /api/datasource/config – Airtable-konfiguration
function handleDatasourceConfig(req, res) {
  const token = process.env.AIRTABLE_ACCESS_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
  res.json({
    dataSource: 'airtable',
    configured: !!token,
    baseId,
    tableName: process.env.AIRTABLE_TABLE_NAME || 'KUNDDATA',
    apiKey: token ? '***' : null
  });
}
app.get('/api/datasource/config', handleDatasourceConfig);

// GET /api/airtable/config – behålls för bakåtkompatibilitet, anropar samma som datasource
app.get('/api/airtable/config', handleDatasourceConfig);

// Befattningshavare – KYC-sidan sparar/laddar mot Airtable-tabell (en kund per byrå)
const BEFATTNINGSHAVARE_TABLE = process.env.AIRTABLE_TABLE_BEFATTNINGSHAVARE || 'Befattningshavare';

app.get('/api/airtable/befattningshavare', authenticateToken, async (req, res) => {
  try {
    const company = req.query.company;
    if (!company) {
      return res.status(400).json({ error: 'Query company (organisationsnummer) krävs' });
    }
    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
    const airtableBaseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
    if (!airtableAccessToken) {
      return res.status(500).json({ error: 'Airtable inte konfigurerad' });
    }
    const formula = encodeURIComponent(`{Företag}="${String(company).replace(/"/g, '\\"')}"`);
    const url = `https://api.airtable.com/v0/${airtableBaseId}/${encodeURIComponent(BEFATTNINGSHAVARE_TABLE)}?filterByFormula=${formula}`;
    const response = await axios.get(url, {
      headers: { 'Authorization': `Bearer ${airtableAccessToken}`, 'Content-Type': 'application/json' },
      timeout: 10000
    });
    const records = (response.data.records || []).map(r => ({ id: r.id, fields: r.fields }));
    return res.json({ records });
  } catch (err) {
    if (err.response?.status === 404) {
      return res.status(404).json({ error: 'Tabellen Befattningshavare hittades inte i Airtable', message: err.message });
    }
    console.error('GET befattningshavare:', err.message);
    return res.status(err.response?.status || 500).json({ error: err.message || 'Kunde inte hämta befattningshavare' });
  }
});

app.post('/api/airtable/befattningshavare', authenticateToken, async (req, res) => {
  try {
    const body = req.body?.records;
    if (!Array.isArray(body) || body.length === 0) {
      return res.status(400).json({ error: 'Body måste innehålla records (array med fields)' });
    }
    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
    const airtableBaseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
    if (!airtableAccessToken) {
      return res.status(500).json({ error: 'Airtable inte konfigurerad' });
    }
    const url = `https://api.airtable.com/v0/${airtableBaseId}/${encodeURIComponent(BEFATTNINGSHAVARE_TABLE)}`;
    const response = await axios.post(url, { records: body }, {
      headers: { 'Authorization': `Bearer ${airtableAccessToken}`, 'Content-Type': 'application/json' },
      timeout: 10000
    });
    const records = response.data.records || [];
    return res.json({ success: true, records });
  } catch (err) {
    if (err.response?.status === 404) {
      return res.status(404).json({ error: 'Tabellen Befattningshavare hittades inte i Airtable', message: err.message });
    }
    console.error('POST befattningshavare:', err.message);
    return res.status(err.response?.status || 500).json({ error: err.message || 'Kunde inte spara befattningshavare' });
  }
});

// GET /api/auth/test-users - Testa användaranslutning till Airtable
app.get('/api/auth/test-users', async (req, res) => {
  try {
    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
    const airtableBaseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
    
    if (!airtableAccessToken) {
      return res.status(500).json({
        error: 'Airtable API-nyckel saknas',
        message: 'AIRTABLE_ACCESS_TOKEN är inte konfigurerad'
      });
    }

    // Testa att hämta användare från Airtable
    const url = `https://api.airtable.com/v0/${airtableBaseId}/${USERS_TABLE}?maxRecords=5`;
    
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${airtableAccessToken}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });

    const users = response.data.records || [];
    console.log(`✅ Användare hämtade från Airtable: ${users.length} st`);

         // Visa alla användare med fältnamn (utan lösenord)
     const usersData = users.map(user => ({
       id: user.id,
       fields: Object.keys(user.fields),
       email: user.fields['Email'] || 'N/A',
       name: user.fields['fldU9goXGJs7wk7OZ'] || user.fields['Full Name'] || 'N/A',
       role: user.fields['Role'] || 'N/A',
       byra: user.fields['fldcZZOiC9y5BKFWf'] || user.fields['Byrå'] || 'N/A',
       logo: user.fields['Logga'] || 'N/A',
       hasPassword: !!user.fields['password']
     }));

    res.json({
      success: true,
      message: 'Användaranslutning till Airtable fungerar!',
      userCount: users.length,
      users: usersData,
      tableName: USERS_TABLE
    });

  } catch (error) {
    console.error('Error testing users connection:', error.message);
    
    res.status(500).json({
      error: 'Fel vid test av användaranslutning',
      message: error.message
    });
  }
});

// GET /api/kunddata/without-uppdragsavtal - Kunder som saknar uppdragsavtal (måste komma före /api/kunddata/:id)
app.get('/api/kunddata/without-uppdragsavtal', authenticateToken, async (req, res) => {
  try {
    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
    const airtableBaseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
    const KUNDDATA_TABLE = 'tblOIuLQS2DqmOQWe';

    if (!airtableAccessToken) {
      return res.status(500).json({ error: 'Airtable API-nyckel saknas' });
    }

    const userData = await getAirtableUser(req.user.email);
    if (!userData) {
      return res.status(404).json({ error: 'Användare hittades inte' });
    }

    let filterFormula = '';
    switch (userData.role) {
      case 'ClientFlowAdmin':
        break;
      case 'Ledare':
        if (userData.byraId) {
          const num = parseInt(userData.byraId);
          filterFormula = isNaN(num) ? `{Byrå ID}="${userData.byraId}"` : `{Byrå ID}=${userData.byraId}`;
        } else {
          return res.json({ records: [] });
        }
        break;
      case 'Anställd':
        if (!userData.id || !userData.byraId) return res.json({ records: [] });
        const _n1 = parseInt(userData.byraId);
        const _byra1 = isNaN(_n1)
          ? `{Byrå ID}="${String(userData.byraId).replace(/"/g, '\\"')}"`
          : `{Byrå ID}=${_n1}`;
        const _uid1 = String(userData.id).replace(/"/g, '\\"');
        const _u1 = `SEARCH("${_uid1}", {Användare}&"")`;
        filterFormula = `AND(${_byra1},${_u1})`;
        break;
      default:
        return res.json({ records: [] });
    }

    let kundUrl = `https://api.airtable.com/v0/${airtableBaseId}/${KUNDDATA_TABLE}`;
    if (filterFormula) kundUrl += `?filterByFormula=${encodeURIComponent(filterFormula)}`;

    const [kundRes, avtalRes] = await Promise.all([
      axios.get(kundUrl, { headers: { 'Authorization': `Bearer ${airtableAccessToken}` }, timeout: 15000 }),
      axios.get(`https://api.airtable.com/v0/${airtableBaseId}/tblpKIMpde6sFFqDH?maxRecords=500`, { headers: { 'Authorization': `Bearer ${airtableAccessToken}` }, timeout: 15000 })
    ]);

    const kundRecords = kundRes.data.records || [];
    const avtalRecords = avtalRes.data.records || [];
    const customerIdsWithAvtal = new Set();
    for (const a of avtalRecords) {
      const kid = a.fields?.KundID;
      if (kid) (Array.isArray(kid) ? kid : [kid]).forEach(id => customerIdsWithAvtal.add(id));
    }

    const utanUppdragsavtal = kundRecords
      .filter(r => !customerIdsWithAvtal.has(r.id))
      .map(r => ({
        id: r.id,
        namn: r.fields?.Namn || r.fields?.['Företagsnamn'] || 'Namn saknas',
        organisationsnummer: r.fields?.Orgnr || r.fields?.Organisationsnummer || '',
        bolagsform: r.fields?.Bolagsform || ''
      }))
      .sort((a, b) => (a.namn || '').localeCompare(b.namn || '', 'sv'));

    res.json({ records: utanUppdragsavtal });
  } catch (error) {
    console.error('❌ Fel vid hämtning av kunder utan uppdragsavtal:', error.message);
    res.status(500).json({ error: error.message, records: [] });
  }
});

// GET /api/kunddata/:id - Hämta en specifik kund baserat på ID (måste komma före /api/kunddata)
app.get('/api/kunddata/:id', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  
  try {
    const customerId = req.params.id;
    console.log(`🔍 Hämtar kund med ID: ${customerId}`);
    
    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
    const airtableBaseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
    const KUNDDATA_TABLE = 'tblOIuLQS2DqmOQWe';
    
    if (!airtableAccessToken) {
      return res.status(500).json({
        error: 'Airtable inte konfigurerad',
        message: 'Sätt AIRTABLE_ACCESS_TOKEN och AIRTABLE_BASE_ID'
      });
    }

    // Hämta komplett användardata för att få roll och byrå-ID
    const userData = await getUser(req.user.email);
    if (!userData) {
      return res.status(404).json({
        success: false,
        message: 'Användare hittades inte'
      });
    }

    console.log(`👤 Användare: ${userData.name} (${userData.role}) från ${userData.byra}`);
    console.log(`🏢 Byrå ID: ${userData.byraId}`);

    let customerRecord;
    const url = `https://api.airtable.com/v0/${airtableBaseId}/${KUNDDATA_TABLE}/${customerId}`;
    console.log(`🌐 Airtable URL: ${url}`);
    try {
      const response = await axios.get(url, {
        headers: {
          'Authorization': `Bearer ${airtableAccessToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      });
      customerRecord = response.data;
    } catch (error) {
      if (error.response && error.response.status === 404) {
        return res.status(404).json({
          success: false,
          message: 'Kund hittades inte',
          error: 'Kunden med det angivna ID:t finns inte i systemet'
        });
      }
      throw error;
    }

    // Kontrollera behörighet baserat på roll
    let hasAccess = false;
    
    switch (userData.role) {
      case 'ClientFlowAdmin':
        // Se allt
        hasAccess = true;
        console.log('🔓 ClientFlowAdmin: Har behörighet');
        break;
        
      case 'Ledare':
        // Se poster med samma Byrå ID
        const customerByraId = customerRecord.fields['Byra_ID'] || customerRecord.fields['ByraID'] || customerRecord.fields['Byrå ID'] || customerRecord.fields.Byrå;
        if (userData.byraId && customerByraId && userData.byraId.toString() === customerByraId.toString()) {
          hasAccess = true;
          console.log(`👔 Ledare: Har behörighet (Byrå ID matchar: ${userData.byraId})`);
        } else {
          console.log(`⚠️ Ledare: Ingen behörighet (Byrå ID: ${userData.byraId} vs ${customerByraId})`);
        }
        break;
        
        case 'Anställd':
        // Se poster där användarens ID finns i Användare-fältet
        const customerUsers = customerRecord.fields['Användare'];
        const userIdString = userData.id ? userData.id.toString() : '';
        const userList = customerUsers == null ? [] : (Array.isArray(customerUsers) ? customerUsers : [customerUsers]);
        if (userIdString && userList.some((u) => String(u) === userIdString)) {
          hasAccess = true;
          console.log(`👷 Anställd: Har behörighet (Användare matchar: ${userData.id})`);
        } else {
          console.log(`⚠️ Anställd: Ingen behörighet (Användare: ${userData.id} vs ${JSON.stringify(customerUsers)})`);
        }
        break;
        
      default:
        console.log(`⚠️ Okänd roll: ${userData.role} - ingen behörighet`);
    }

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Du har inte behörighet att se denna kund',
        error: 'Otillåten åtkomst'
      });
    }

    // Formatera svaret
    const formattedRecord = {
      id: customerRecord.id,
      createdTime: customerRecord.createdTime,
      fields: customerRecord.fields
    };

    const duration = Date.now() - startTime;

    res.json({
      success: true,
      ...formattedRecord,
      message: 'Kund hämtad',
      userRole: userData.role,
      timestamp: new Date().toISOString(),
      duration: duration
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('Error fetching customer:', error.message);
    
    if (error.response) {
      console.error('Airtable API Error:', {
        status: error.response.status,
        data: error.response.data
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Fel vid hämtning av kund',
      error: error.message,
      timestamp: new Date().toISOString(),
      duration: duration
    });
  }
});

// GET /api/risker-kunden?byraId= - Hämta byråns risker ur "Risker kopplade till kunden"
app.get('/api/risker-kunden', authenticateToken, async (req, res) => {
  try {
    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
    const airtableBaseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
    const TABLE_ID = 'tblWw6tM2YOTYFn2H'; // Risker kopplade till kunden

    const byraId = req.query.byraId;
    if (!byraId) return res.status(400).json({ error: 'byraId saknas' });

    const filter = encodeURIComponent(`{Byrå ID}="${byraId}"`);
    const url = `https://api.airtable.com/v0/${airtableBaseId}/${TABLE_ID}?filterByFormula=${filter}`;

    const airtableRes = await axios.get(url, {
      headers: { 'Authorization': `Bearer ${airtableAccessToken}` }
    });

    res.json({ records: airtableRes.data.records || [] });
  } catch (error) {
    console.error('❌ Fel vid hämtning av risker:', error.response?.data || error.message);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/kunddata/:id/tjanster - Hämta kundens länkade tjänster (expanderade med Task Name)
app.get('/api/kunddata/:id/tjanster', authenticateToken, async (req, res) => {
  try {
    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
    const airtableBaseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
    const KUNDDATA_TABLE = 'tblOIuLQS2DqmOQWe';

    // Hämta kundens länkade tjänst-ID:n
    const kundRes = await axios.get(
      `https://api.airtable.com/v0/${airtableBaseId}/${KUNDDATA_TABLE}/${req.params.id}`,
      { headers: { Authorization: `Bearer ${airtableAccessToken}` } }
    );
    const linkedIds = kundRes.data.fields?.['Kundens utvalda tjänster'] || [];

    if (linkedIds.length === 0) return res.json({ tjanster: [], linkedIds: [] });

    // Expandera varje länkat tjänst-record för att få Task Name
    const tjansterRes = await Promise.all(
      linkedIds.map(id =>
        axios.get(
          `https://api.airtable.com/v0/${airtableBaseId}/${RISK_ASSESSMENT_TABLE}/${id}`,
          { headers: { Authorization: `Bearer ${airtableAccessToken}` } }
        ).then(r => ({ id: r.data.id, namn: r.data.fields?.['Task Name'] || '' }))
         .catch(() => null)
      )
    );

    const tjanster = tjansterRes.filter(Boolean);
    res.json({ tjanster, linkedIds });
  } catch (err) {
    console.error('❌ kunddata tjanster:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/kunddata/:id/risker - Hämta kundens länkade riskposter (expanderade)
app.get('/api/kunddata/:id/risker', authenticateToken, async (req, res) => {
  try {
    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
    const airtableBaseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
    const KUNDDATA_TABLE = 'tblOIuLQS2DqmOQWe';
    const RISKER_TABLE = 'tblWw6tM2YOTYFn2H'; // Risker kopplade till kunden

    // Hämta kundens länkade risk-ID:n (det nya länkfältet)
    const kundRes = await axios.get(
      `https://api.airtable.com/v0/${airtableBaseId}/${KUNDDATA_TABLE}/${req.params.id}`,
      { headers: { 'Authorization': `Bearer ${airtableAccessToken}` } }
    );
    const linkedIds = kundRes.data.fields['risker kopplat till tjänster'] || [];

    if (linkedIds.length === 0) return res.json({ records: [], linkedIds: [] });

    // Hämta de länkade posterna
    const formula = encodeURIComponent('OR(' + linkedIds.map(id => `RECORD_ID()="${id}"`).join(',') + ')');
    const riskRes = await axios.get(
      `https://api.airtable.com/v0/${airtableBaseId}/${RISKER_TABLE}?filterByFormula=${formula}`,
      { headers: { 'Authorization': `Bearer ${airtableAccessToken}` } }
    );

    res.json({ records: riskRes.data.records || [], linkedIds });
  } catch (error) {
    console.error('❌ Fel vid hämtning av kundens risker:', error.response?.data || error.message);
    res.status(500).json({ error: error.message });
  }
});

// PATCH /api/kunddata/:id - Uppdatera specifika fält på en kund i KUNDDATA (Airtable, med behörighetskontroll)
app.patch('/api/kunddata/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { fields } = req.body;

    if (!fields) {
      return res.status(400).json({ error: 'Fält saknas i request body' });
    }

    const cleanedFields = Object.fromEntries(
      Object.entries(fields).filter(([, v]) => {
        if (Array.isArray(v)) return true;
        return v !== undefined && v !== null && v !== '';
      })
    );

    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
    const airtableBaseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
    const KUNDDATA_TABLE = 'tblOIuLQS2DqmOQWe';
    if (!airtableAccessToken) return res.status(500).json({ error: 'Airtable token saknas' });

    const userData = await getAirtableUser(req.user.email);
    if (!userData) return res.status(404).json({ error: 'Användare hittades inte' });
    let customerRecord;
    try {
      const getRes = await axios.get(`https://api.airtable.com/v0/${airtableBaseId}/${KUNDDATA_TABLE}/${id}`, {
        headers: { 'Authorization': `Bearer ${airtableAccessToken}` }
      });
      customerRecord = getRes.data;
    } catch (e) {
      if (e.response?.status === 404) return res.status(404).json({ error: 'Kund hittades inte' });
      throw e;
    }
    let hasAccess = false;
    if (userData.role === 'ClientFlowAdmin') hasAccess = true;
    else if (userData.role === 'Ledare') {
      const customerByraId = customerRecord.fields['Byra_ID'] || customerRecord.fields['Byrå ID'] || customerRecord.fields.Byrå;
      if (userData.byraId && customerByraId && String(userData.byraId) === String(customerByraId)) hasAccess = true;
    } else if (userData.role === 'Anställd') {
      const customerUsers = customerRecord.fields['Användare'];
      const uid = userData.id ? String(userData.id) : '';
      const list = customerUsers == null ? [] : (Array.isArray(customerUsers) ? customerUsers : [customerUsers]);
      if (uid && list.some((u) => String(u) === uid)) hasAccess = true;
    }
    if (!hasAccess) return res.status(403).json({ error: 'Du har inte behörighet att uppdatera denna kund' });

    if (cleanedFields['Orgnr'] != null) {
      let byraId = (cleanedFields['Byrå ID'] || '').toString().trim();
      if (!byraId) {
        const existingRes = await axios.get(
          `https://api.airtable.com/v0/${airtableBaseId}/${KUNDDATA_TABLE}/${id}?fields[]=Byrå ID`,
          { headers: { 'Authorization': `Bearer ${airtableAccessToken}` } }
        );
        byraId = (existingRes.data.fields?.['Byrå ID'] || '').toString().trim();
      }
      const orgnrRaw = (cleanedFields['Orgnr'] || '').toString().replace(/[^\d]/g, '');
      if (orgnrRaw && byraId) {
        const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        const orgnrVariants = [orgnrRaw];
        if (orgnrRaw.length === 10) {
          const yy = parseInt(orgnrRaw.substring(0, 2), 10);
          const currentYear = new Date().getFullYear() % 100;
          orgnrVariants.push((yy > currentYear ? '19' : '20') + orgnrRaw);
        } else if (orgnrRaw.length === 12) {
          orgnrVariants.push(orgnrRaw.substring(2));
        }
        const orgnrConditions = orgnrVariants.map(o => `{Orgnr}="${esc(o)}"`).join(',');
        const checkFormula = `AND(OR(${orgnrConditions}),{Byrå ID}="${esc(byraId)}",RECORD_ID()!="${id}")`;
        const checkUrl = `https://api.airtable.com/v0/${airtableBaseId}/${KUNDDATA_TABLE}?filterByFormula=${encodeURIComponent(checkFormula)}&maxRecords=1&fields[]=Namn`;
        const checkRes = await axios.get(checkUrl, {
          headers: { 'Authorization': `Bearer ${airtableAccessToken}` }
        });
        if (checkRes.data.records?.length > 0) {
          const existing = checkRes.data.records[0];
          return res.status(409).json({
            error: 'duplicate',
            message: 'Ett annat företag hos er byrå har redan detta organisationsnummer. Samma orgnr får bara förekomma en gång per byrå.',
            existingId: existing.id,
            existingNamn: existing.fields?.Namn || ''
          });
        }
      }
    }

    const url = `https://api.airtable.com/v0/${airtableBaseId}/${KUNDDATA_TABLE}/${id}`;
    const airtableRes = await axios.patch(url,
      { fields: cleanedFields },
      { headers: { 'Authorization': `Bearer ${airtableAccessToken}`, 'Content-Type': 'application/json' } }
    );
    console.log('✅ Kund uppdaterad i Airtable:', airtableRes.data.id);
    res.json({ success: true, id: airtableRes.data.id, record: airtableRes.data });

  } catch (error) {
    console.error('❌ Fel vid uppdatering av kund:', JSON.stringify(error.response?.data) || error.message);
    const status = error.response?.status || 500;
    const airtableErr = error.response?.data?.error;
    const message = airtableErr?.message || error.message || 'Okänt fel';
    res.status(status).json({ error: message, details: airtableErr });
  }
});

function pdfEscape(s) {
  return (s == null ? '' : String(s)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function pdfNl2br(s) {
  return pdfEscape(s).replace(/\n/g, '<br>');
}
function pdfToText(v) {
  if (v == null || v === '') return '';
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.map(b => b?.text ?? '').join('');
  return String(v);
}
function pdfFmtList(v) {
  return Array.isArray(v) ? v.filter(Boolean) : (v ? [v] : []);
}
function pdfRichToHtml(s) {
  if (s == null || s === '') return '';
  let t = pdfEscape(s);
  t = t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/\*([^*]+?)\*/g, '<em>$1</em>');
  return t.replace(/\n/g, '<br>');
}
function pdfJanej(v) {
  return v === 'Ja'
    ? '<span style="color:#dc2626;font-weight:600;">Ja</span>'
    : (v === 'Nej' ? '<span style="color:#16a34a;font-weight:600;">Nej</span>' : pdfEscape(v || '–'));
}

function buildKycFormularPdfHtml(kyc, byraNamn, logoHtml, datum) {
  const ACCENT_KYC = '#3b4a8a';
  const esc = pdfEscape;
  const nl2br = (s) => pdfNl2br(s);
  return `<!DOCTYPE html><html lang="sv"><head><meta charset="UTF-8">
<style>
  @page { margin: 18mm 20mm 22mm; }
  body { font-family: Arial, sans-serif; font-size: 8pt; color: #1a1a2e; line-height: 1.6; margin: 0; padding: 12px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; border-bottom: 3px solid ${ACCENT_KYC}; padding-bottom: 10px; }
  .header-left h1 { margin: 0; font-size: 18pt; font-weight: 900; color: #1a1a2e; }
  .header-left p { margin: 4px 0 0; font-size: 7.5pt; color: #888; }
  .section { margin-top: 14px; }
  .section h2 { font-size: 8pt; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; color: ${ACCENT_KYC}; border-bottom: 1.5px solid ${ACCENT_KYC}; padding-bottom: 3px; margin-bottom: 7px; }
  .field { margin-bottom: 4px; }
  .field-label { font-weight: 700; }
  .row { display: flex; gap: 24px; margin-bottom: 4px; }
  .row .col { flex: 1; }
  .attestation { margin-top: 20px; padding: 12px 14px; border: 1.5px solid #dce3f0; border-radius: 6px; background: #f4f6fb; }
</style></head><body>
  <div class="header">
    <div class="header-left">
      <h1>KYC — Kundkännedomsformulär (bilaga)</h1>
      <p>${esc(byraNamn)} | ${datum}</p>
    </div>
    <div class="header-right">${logoHtml || ''}</div>
  </div>
  <div class="section"><h2>1. Grunduppgifter om företaget</h2>
    <div class="row">
      <div class="col"><span class="field-label">Företagets namn:</span> ${esc(kyc.foretagsnamn)}</div>
      <div class="col"><span class="field-label">Organisationsnummer:</span> ${esc(kyc.orgnr)}</div>
    </div>
  </div>
  <div class="section"><h2>2. Företrädare</h2>
    <div class="row">
      <div class="col"><span class="field-label">Namn:</span> ${esc(kyc.foretradareNamn)}</div>
      <div class="col"><span class="field-label">Personnummer:</span> ${esc(kyc.foretradarePnr)}</div>
    </div>
  </div>
  <div class="section"><h2>3. Verklig huvudman</h2>
    <div class="field"><span class="field-label">Verklig(a) huvudman/-män:</span><br>${nl2br(kyc.huvudmanInfo || '—')}</div>
    ${kyc.huvudmanAnnatSatt ? `<div class="field"><span class="field-label">Kontroll genom avtal:</span><br>${nl2br(kyc.huvudmanAnnatSatt)}</div>` : ''}
  </div>
  <div class="section"><h2>4. PEP</h2>
    <div class="field"><span class="field-label">PEP-status:</span> ${pdfJanej(kyc.pep)}</div>
    ${kyc.pep === 'Ja' && kyc.pepDetaljer ? `<div class="field"><span class="field-label">Detaljer:</span> ${esc(kyc.pepDetaljer)}</div>` : ''}
    <div class="field"><span class="field-label">Familjemedlem/medarbetare till PEP:</span> ${pdfJanej(kyc.pepFamilj)}</div>
  </div>
  <div class="section"><h2>5. Affärsförbindelsens syfte och art</h2>
    <div class="field"><span class="field-label">Huvudsaklig verksamhet:</span><br>${nl2br(kyc.verksamhet || '—')}</div>
    <div class="field"><span class="field-label">Byråns tjänster (kundens valda):</span> ${esc(kyc.tjanster || '—')}</div>
    <div class="field"><span class="field-label">Pengarnas ursprung:</span> ${esc(kyc.kapitalUrsprung || '—')}</div>
    <div class="row">
      <div class="col"><span class="field-label">Antal anställda:</span> ${esc(kyc.anstallda || '—')}</div>
      <div class="col"><span class="field-label">Uppskattad årsomsättning:</span> ${esc(kyc.omsattning || '—')}</div>
    </div>
  </div>
  <div class="section"><h2>6. Internationell handel</h2>
    <div class="field"><span class="field-label">Handel utanför Sverige:</span> ${pdfJanej(kyc.internationellHandel)}</div>
    ${kyc.internationellHandel === 'Ja' && kyc.internationellaLander ? `<div class="field"><span class="field-label">Länder:</span> ${esc(kyc.internationellaLander)}</div>` : ''}
  </div>
  <div class="section"><h2>7. Kontanthantering</h2>
    <div class="field"><span class="field-label">Kontanthantering:</span> ${pdfJanej(kyc.kontanter)}</div>
  </div>
  <div class="attestation"><strong>Kundens intygande</strong><p>Jag intygar att lämnade uppgifter är korrekta och fullständiga.</p></div>
</body></html>`;
}

function buildKundRiskbedomningPdfHtml(data) {
  const ACCENT = '#2c4a8f';
  const esc = pdfEscape;
  const nl2br = (s) => pdfNl2br(s);
  const section = (title, body) => body ? `<h2>${title}</h2><div class="section">${body}</div>` : '';

  const bulletList = (items) => {
    const list = (items || []).filter(Boolean);
    if (!list.length) return '<p>—</p>';
    return `<ul style="margin:0;padding-left:1.2rem;">${list.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>`;
  };

  const rf = data.riskfaktorer || {};
  const riskfaktorerHtml = `
      <h3>Kundens tjänster</h3>${bulletList(rf.tjanster)}
      <h3>Geografiska riskfaktorer</h3>${bulletList(rf.geografiska)}
      <h3>Riskfaktorer kopplat till kunden</h3>${bulletList(rf.kund)}
      <h3>Distributionskanaler</h3>${bulletList(rf.distribution)}
      <h3>Verksamhetsspecifika riskfaktorer</h3>${bulletList(rf.verksamhet)}
      <h3>Riskhöjande faktorer övrigt</h3>${bulletList(rf.riskhojOvrigt)}
      <h3>Risksänkande faktorer</h3>${bulletList(rf.risksankande)}`;

  return `<!DOCTYPE html><html lang="sv"><head><meta charset="UTF-8"><style>
    @page { size: A4; margin: 14mm; }
    body{font-family:Arial,sans-serif;font-size:9pt;line-height:1.5;color:#1a1a2e;margin:0;padding:20px;}
    .doc-page { page-break-before: always; }
    h1{color:${ACCENT};font-size:14pt;margin-bottom:8px;}
    .meta{color:#666;font-size:8pt;margin-bottom:16px;}
    h2{color:${ACCENT};font-size:11pt;border-bottom:1px solid ${ACCENT};padding-bottom:4px;margin-top:16px;}
    h3{font-size:10pt;margin-top:12px;color:#334155;}
    .section{margin:10px 0;}
    .niva{display:inline-block;padding:4px 12px;border-radius:4px;font-weight:700;}
    .niva-lag{background:#dcfce7;color:#166534;}
    .niva-medel{background:#fef9c3;color:#854d0e;}
    .niva-hog{background:#fee2e2;color:#991b1b;}
    .chips{display:flex;flex-wrap:wrap;gap:4px;margin:4px 0;}
    .chip{display:inline-block;padding:2px 8px;border-radius:4px;font-size:8pt;}
    .chip-neg{background:#fee2e2;color:#991b1b;}
    .chip-pos{background:#dcfce7;color:#166534;}
    .tjanst{margin:10px 0;padding:8px;background:#f8fafc;border-radius:4px;border:1px solid #e2e8f0;}
    .tjanst-namn{font-weight:600;}
    .tjanst-meta{font-size:8pt;color:#64748b;margin-top:4px;}
  </style></head><body>
    <div>
      <h1>Riskbedömning — ${esc(data.kundnamn)}</h1>
      <p class="meta">Organisationsnummer: ${esc(data.orgnr)} | Exporterad: ${esc(data.exportStamp)}${data.riskUtford ? ' | Utförd: ' + esc(data.riskUtford) : ''}${data.riskGodkand ? ' | Godkänd: ' + esc(data.riskGodkand) : ''}</p>

      ${data.verksamhet ? section('Beskrivning av verksamheten', nl2br(data.verksamhet)) : ''}

      <h2>Sammanlagd risknivå</h2>
      <p><span class="niva niva-${data.nivaClass}">${esc(data.nivaLabel)}</span></p>

      ${data.motivering ? section('Motivering', nl2br(data.motivering)) : ''}

      <h2>Riskfaktorer</h2>
      <div class="section">${riskfaktorerHtml}</div>

      ${data.kommentarRisk ? section('Kommentar till riskfaktorerna ovan', nl2br(data.kommentarRisk)) : ''}
      ${data.risksankandeAtgarder ? section('Risksänkande åtgärder', nl2br(data.risksankandeAtgarder)) : ''}

      <h2>Byråns bedömning av kunden</h2>
      <div class="section">${data.byransRiskbedomning ? nl2br(data.byransRiskbedomning) : '—'}</div>
      <h2>Åtgärder</h2>
      <div class="section">${data.atgarder ? nl2br(data.atgarder) : '—'}</div>

      <h2>PEP &amp; sanktioner</h2>
      <div class="section">
        <p><strong>PEP-status:</strong> ${data.pepList.length ? esc(data.pepList.join(', ')) : '—'}${data.pepTraffar !== '' && data.pepTraffar != null ? ` | Antal träffar: ${esc(String(data.pepTraffar))}` : ''}</p>
        ${data.rapportPep ? `<p><strong>Rapport:</strong> ${esc(data.rapportPep)}</p>` : ''}
      </div>

      <p class="meta" style="margin-top:24px;">ClientFlow — riskbedömning dokumenterad ${esc(data.datumStr)}</p>
    </div>
  </body></html>`;
}

async function htmlToPdfBuffer(html) {
  const pup = loadPuppeteer();
  if (!pup) throw new Error('PDF-generering ej tillgänglig (puppeteer saknas)');
  const launchOpts = { args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'], headless: true, timeout: 30000 };
  if (chromium) launchOpts.executablePath = await chromium.executablePath();
  const browser = await pup.launch(launchOpts);
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });
    return await page.pdf({ format: 'A4', printBackground: true, margin: { top: '15mm', right: '15mm', bottom: '15mm', left: '15mm' } });
  } finally {
    await browser.close();
  }
}

async function mergePdfBuffers(buffers) {
  const merged = await PDFDocument.create();
  for (const buf of buffers) {
    if (!buf || !buf.length) continue;
    const doc = await PDFDocument.load(buf);
    const pages = await merged.copyPages(doc, doc.getPageIndices());
    pages.forEach(p => merged.addPage(p));
  }
  return Buffer.from(await merged.save());
}

function normTjanstKey(s) {
  return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function dedupeByraTjansterForPdf(tjanster) {
  const buckets = new Map();
  for (const t of tjanster) {
    const n = (t.namn || '').trim();
    if (!n || isAirtableRecordIdStr(n)) continue;
    const key = normTjanstKey(n);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(t);
  }
  const merged = [];
  for (const arr of buckets.values()) {
    arr.sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')));
    const primary = { ...arr[0] };
    primary.mergedIds = arr.map((x) => x.id);
    merged.push(primary);
  }
  merged.sort((a, b) => (a.namn || '').localeCompare(b.namn || '', 'sv'));
  return merged;
}

async function fetchByraTjansterRecordsForPdf(airtableAccessToken, airtableBaseId, byraId) {
  if (!byraId) return [];
  const formula = encodeURIComponent(`{Byrå ID}="${byraId}"`);
  let all = [];
  let offset = null;
  do {
    let url = `https://api.airtable.com/v0/${airtableBaseId}/${encodeURIComponent(RISK_ASSESSMENT_TABLE)}?filterByFormula=${formula}`
      + `&fields[]=Task%20Name&pageSize=100`;
    if (offset) url += `&offset=${offset}`;
    const r = await axios.get(url, {
      headers: { Authorization: `Bearer ${airtableAccessToken}` }
    });
    all = all.concat((r.data.records || []).map((rec) => ({
      id: rec.id,
      namn: (rec.fields['Task Name'] || '').trim()
    })));
    offset = r.data.offset;
  } while (offset);
  return all;
}

/**
 * Samma logik som kundkortet renderTjanster: byråns tjänster där minst ett record-ID finns i kundens länkfält.
 * Returnerar även allowedKeys för att filtrera bort byråtjänster som felaktigt hamnat under riskfaktorer.
 */
async function resolveKundAktivaTjansterNamn(airtableAccessToken, airtableBaseId, byraId, linkedRaw) {
  const linked = Array.isArray(linkedRaw) ? linkedRaw : [];
  const empty = { namn: [], allowedKeys: new Set(), linkedTjanstIdSet: new Set(), allByraKeys: new Set() };
  if (!linked.length) return empty;

  const byraRowsForKeys = byraId
    ? await fetchByraTjansterRecordsForPdf(airtableAccessToken, airtableBaseId, byraId)
    : [];
  const dedupedForKeys = dedupeByraTjansterForPdf(byraRowsForKeys);
  const allByraKeys = new Set(dedupedForKeys.map((t) => normTjanstKey(t.namn)).filter(Boolean));

  // Multi-select med tjänstenamn (text), inte record-ID — behåll bara namn som finns i byråns katalog
  if (!isAirtableRecordIdStr(String(linked[0]).trim())) {
    const seen = new Set();
    const namn = [];
    for (const raw of linked) {
      const s = String(raw).trim();
      if (!s || s === '---' || isAirtableRecordIdStr(s)) continue;
      const k = normTjanstKey(s);
      if (allByraKeys.size && !allByraKeys.has(k)) continue;
      if (seen.has(k)) continue;
      seen.add(k);
      namn.push(s);
    }
    namn.sort((a, b) => a.localeCompare(b, 'sv'));
    return { namn, allowedKeys: new Set(namn.map(normTjanstKey)), linkedTjanstIdSet: new Set(), allByraKeys };
  }

  const linkedSet = new Set(linked.filter(isAirtableRecordIdStr));
  const deduped = dedupedForKeys;
  const aktiv = deduped.filter((t) => (t.mergedIds || [t.id]).some((id) => linkedSet.has(id)));
  const namn = aktiv.map((t) => t.namn).filter(Boolean);
  const allowedKeys = new Set(namn.map(normTjanstKey));
  return { namn, allowedKeys, linkedTjanstIdSet: linkedSet, allByraKeys };
}

function riskPosterIsByraTjanstTemplate(riskfaktor, allowedKeys, allByraKeys) {
  const k = normTjanstKey(riskfaktor);
  if (!k) return false;
  if (allowedKeys.has(k)) return false;
  return allByraKeys.has(k);
}

/** Punktlistor i PDF – exkludera "Inga …" platshållare från flervalsfält */
function pdfRiskFactorNames(list) {
  return pdfFmtList(list).filter((item) => {
    const k = normTjanstKey(item);
    if (!k || k === 'inga') return false;
    if (/^inga\b/.test(k)) return false;
    return true;
  });
}

const PDF_RISK_TYP_MAP = {
  'Geografiska riskfaktorer': 'geografiska',
  'Riskfaktorer kopplat till kund': 'kund',
  'Distrubutionskanaler': 'distribution',
  'Distributionskanaler': 'distribution',
  'Verksamhetsspecifika riskfaktorer': 'verksamhet'
};

// POST /api/kunddata/:id/riskbedomning-pdf – Dokumentera riskbedömning som PDF, spara på kunden
app.post('/api/kunddata/:id/riskbedomning-pdf', authenticateToken, async (req, res) => {
  const KUNDDATA_TABLE = 'tblOIuLQS2DqmOQWe';
  const RISKER_KUND_TABLE = 'tblWw6tM2YOTYFn2H';
  try {
    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
    const airtableBaseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
    if (!airtableAccessToken) return res.status(500).json({ error: 'Airtable token saknas' });

    const { id: customerId } = req.params;
    const userData = await getAirtableUser(req.user.email);
    if (!userData) return res.status(404).json({ error: 'Användare hittades inte' });

    const custRes = await axios.get(
      `https://api.airtable.com/v0/${airtableBaseId}/${KUNDDATA_TABLE}/${customerId}`,
      { headers: { Authorization: `Bearer ${airtableAccessToken}` } }
    );
    const cust = custRes.data;
    const f = cust.fields || {};

    const byraId = userData.byraId ? String(userData.byraId).trim() : '';
    const custByraId = f['Byrå ID'] || f.Byrå || '';
    if (userData.role !== 'ClientFlowAdmin' && String(custByraId) !== byraId) {
      return res.status(403).json({ error: 'Ingen behörighet för denna kund' });
    }

    const kundnamn = f['Namn'] || f['Företagsnamn'] || 'Okänd';
    const orgnr = f['Orgnr'] || f['Organisationsnummer'] || '';
    const sammanlagdRisk = f['sammanlagd risk'] || f['Riskniva'] || '';
    const datumStr = new Date().toLocaleDateString('sv-SE');
    const datumIso = new Date().toISOString().split('T')[0];
    const exportStamp = new Date().toLocaleString('sv-SE', { dateStyle: 'long', timeStyle: 'short' });

    const nivaLabel = { 'Lag': 'Låg risk', 'Låg': 'Låg risk', 'Medel': 'Medel risk', 'Hog': 'Hög risk', 'Hög': 'Hög risk' }[sammanlagdRisk] || sammanlagdRisk || 'Ej angiven';
    const nivaClass = { 'Lag': 'lag', 'Låg': 'lag', 'Medel': 'medel', 'Hog': 'hog', 'Hög': 'hog' }[sammanlagdRisk] || 'medel';

    const linkedTjanstIds = f['Kundens utvalda tjänster'] || [];
    const {
      namn: tjansterNamn,
      allowedKeys: allowedTjanstKeys,
      linkedTjanstIdSet,
      allByraKeys
    } = await resolveKundAktivaTjansterNamn(airtableAccessToken, airtableBaseId, byraId, linkedTjanstIds);

    const filterRiskChipList = (list) => pdfFmtList(list).filter((item) => {
      const k = normTjanstKey(item);
      if (!k || k === 'inga') return true;
      return !allByraKeys.has(k) || allowedTjanstKeys.has(k);
    });

    const riskfaktorer = {
      tjanster: tjansterNamn,
      geografiska: [],
      kund: pdfRiskFactorNames(f['Kunden verkar i en högriskbransch']),
      distribution: [],
      verksamhet: [],
      riskhojOvrigt: pdfRiskFactorNames(filterRiskChipList(f['Riskhöjande faktorer övrigt'])),
      risksankande: pdfRiskFactorNames(pdfFmtList(f['Risksänkande faktorer']))
    };

    const linkedRiskIds = (f['risker kopplat till tjänster'] || []).filter((id) => {
      if (!isAirtableRecordIdStr(id)) return false;
      if (linkedTjanstIdSet.has(id)) return false;
      return true;
    });
    if (linkedRiskIds.length > 0) {
      const formula = encodeURIComponent('OR(' + linkedRiskIds.map(id => `RECORD_ID()="${id}"`).join(',') + ')');
      const riskRes = await axios.get(
        `https://api.airtable.com/v0/${airtableBaseId}/${RISKER_KUND_TABLE}?filterByFormula=${formula}`,
        { headers: { Authorization: `Bearer ${airtableAccessToken}` } }
      );
      for (const rec of (riskRes.data.records || [])) {
        const rfRec = rec.fields || {};
        const typ = (rfRec['Typ av riskfaktor'] || '').trim();
        if (/tjänst|produkt/i.test(typ)) continue;
        const riskfaktor = (rfRec['Riskfaktor'] || '').trim();
        if (!riskfaktor) continue;
        if (riskPosterIsByraTjanstTemplate(riskfaktor, allowedTjanstKeys, allByraKeys)) continue;
        if (riskfaktor.toLowerCase().includes('högriskbransch')) continue;
        const key = PDF_RISK_TYP_MAP[typ];
        if (!key) continue;
        riskfaktorer[key].push(riskfaktor);
      }
      for (const key of ['geografiska', 'kund', 'distribution', 'verksamhet']) {
        riskfaktorer[key].sort((a, b) => a.localeCompare(b, 'sv'));
      }
    }

    const riskData = {
      kundnamn, orgnr, datumStr, exportStamp,
      nivaLabel, nivaClass,
      verksamhet: pdfToText(f['Verksamhetsbeskrivning']) || pdfToText(f['Beskrivning av kunden']) || '',
      sammanlagdRisk,
      motivering: pdfToText(f['Motivering']),
      kommentarRisk: pdfToText(f['Kommentar till riskfaktorerna ovan']),
      risksankandeAtgarder: pdfToText(f['Risksänkande åtgjärder']),
      byransRiskbedomning: pdfToText(f['Byrans riskbedomning']),
      atgarder: pdfToText(f['Atgarder riskbedomning']),
      pepList: pdfFmtList(f['PEP']),
      pepTraffar: f['Antal träffar PEP och sanktionslistor'],
      rapportPep: f['Rapport PEP'] || '',
      riskUtford: f['Riskbedömning utförd datum'] ? new Date(f['Riskbedömning utförd datum']).toLocaleDateString('sv-SE') : '',
      riskGodkand: f['Kundens riskbedömning godkänd'] ? new Date(f['Kundens riskbedömning godkänd']).toLocaleDateString('sv-SE') : '',
      tjansterNamn,
      riskfaktorer
    };

    const pdfParts = [];

    // KYC-formulär (sparad JSON + komplettering från kunddata)
    let savedKyc = {};
    try { savedKyc = JSON.parse(f['KYC-formular (JSON)'] || '{}'); } catch (_) { savedKyc = {}; }
    const tjansterNamnLista = tjansterNamn.join(', ');
    const kycForPdf = {
      foretagsnamn: savedKyc.foretagsnamn || kundnamn,
      orgnr: savedKyc.orgnr || orgnr,
      foretradareNamn: savedKyc.foretradareNamn || '',
      foretradarePnr: savedKyc.foretradarePnr || '',
      huvudmanInfo: savedKyc.huvudmanInfo || pdfToText(f['Verklig huvudman']) || '',
      huvudmanAnnatSatt: savedKyc.huvudmanAnnatSatt || '',
      pep: savedKyc.pep || (pdfFmtList(f['PEP']).length && !pdfFmtList(f['PEP']).includes('Inte PEP') ? 'Ja' : 'Nej'),
      pepDetaljer: savedKyc.pepDetaljer || '',
      pepFamilj: savedKyc.pepFamilj || 'Nej',
      verksamhet: savedKyc.verksamhet || pdfToText(f['Verksamhetsbeskrivning']) || pdfToText(f['Beskrivning av kunden']) || '',
      tjanster: tjansterNamnLista,
      kapitalUrsprung: savedKyc.kapitalUrsprung || pdfFmtList(f['Vilket ursprung har företagets kapital?']).join(', ') || '',
      anstallda: savedKyc.anstallda || '',
      omsattning: savedKyc.omsattning || f['Omsättning'] || '',
      internationellHandel: savedKyc.internationellHandel || f['Har företaget transaktioner med andra länder?'] || '',
      internationellaLander: savedKyc.internationellaLander || '',
      kontanter: savedKyc.kontanter || ''
    };

    const pdfUser = await getAirtableUser(req.user.email);
    const byraNamn = pdfUser?.byra || '';
    let logoHtml = '';
    const logoRaw = pdfUser?.logo;
    const logoUrl = Array.isArray(logoRaw) && logoRaw.length > 0
      ? logoRaw[0].url
      : (typeof logoRaw === 'string' && logoRaw.startsWith('http') ? logoRaw : null);
    if (logoUrl) {
      try {
        const logoRes = await axios.get(logoUrl, { responseType: 'arraybuffer', timeout: 10000 });
        const b64 = Buffer.from(logoRes.data).toString('base64');
        const mime = logoRes.headers['content-type'] || 'image/png';
        logoHtml = `<img src="data:${mime};base64,${b64}" style="max-height:60px;max-width:200px;object-fit:contain;" alt="Logo">`;
      } catch (_) {}
    }

    const riskHtml = buildKundRiskbedomningPdfHtml(riskData);
    pdfParts.push(await htmlToPdfBuffer(riskHtml));

    if (kycForPdf.foretagsnamn) {
      const kycHtml = buildKycFormularPdfHtml(kycForPdf, byraNamn, logoHtml, datumStr);
      pdfParts.push(await htmlToPdfBuffer(kycHtml));
    }

    const pdfBuffer = await mergePdfBuffers(pdfParts);

    const safeNamn = (kundnamn || 'kund').replace(/[^a-zA-Z0-9\u00e5\u00e4\u00f6\u00c5\u00c4\u00d6 -]/g, '').trim().replace(/\s+/g, '-');
    const filename = `Riskbedomning-KYC-${safeNamn}-${datumIso}.pdf`;

    // Använd requestens host så Airtable kan hämta filen vid ngrok/tunnel
    const protocol = req.get('x-forwarded-proto') || req.protocol || (req.secure ? 'https' : 'http');
    const host = req.get('x-forwarded-host') || req.get('host');
    const baseUrl = host ? `${protocol}://${host}` : null;

    const fileUrl = await saveFileLocally(pdfBuffer, filename, 'application/pdf', baseUrl);
    let reloadedDocuments = false;

    if (fileUrl) {
      const docFields = ['Attachments', 'Riskbedömning dokument', 'Riskbedomning dokument', 'Dokumentation'];
      for (const fieldName of docFields) {
        try {
          const existing = f[fieldName] || [];
          const arr = Array.isArray(existing) ? [...existing] : [];
          arr.push({ url: fileUrl, filename });
          await axios.patch(
            `https://api.airtable.com/v0/${airtableBaseId}/${KUNDDATA_TABLE}/${customerId}`,
            {
              fields: {
                [fieldName]: arr,
                'Kundens riskbedömning godkänd': datumIso
              }
            },
            { headers: { Authorization: `Bearer ${airtableAccessToken}`, 'Content-Type': 'application/json' } }
          );
          reloadedDocuments = true;
          console.log('✅ Riskbedömning-PDF sparad i fält:', fieldName);
          break;
        } catch (patchErr) {
          if (patchErr.response?.status === 422) continue;
          console.warn('Kunde inte spara PDF till fält', fieldName, ':', patchErr.message);
        }
      }
    }

    const isLocalhost = !baseUrl || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(fileUrl || '');
    const message = reloadedDocuments
      ? 'PDF sparad på fliken Dokumentation.'
      : isLocalhost
        ? 'PDF genererad. Vid lokal drift kan Airtable inte hämta filer från localhost. För att spara till Dokumentation: kör appen på Render (med PUBLIC_BASE_URL) eller använd ngrok.'
        : 'PDF genererad. Lägg till fältet "Attachments" eller "Riskbedömning dokument" (Bilaga) i KUNDDATA för att spara automatiskt.';

    res.json({
      success: true,
      filnamn: filename,
      reloadedDocuments,
      fileUrl,
      message
    });
  } catch (error) {
    console.error('\u274c Riskbedömning PDF:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/documents?customerId=recXXX – Dokumentation för kund (Riskbedömning dokument m.m.)
app.get('/api/documents', authenticateToken, async (req, res) => {
  const KUNDDATA_TABLE = 'tblOIuLQS2DqmOQWe';
  try {
    const customerId = req.query.customerId || req.query.customerid;
    if (!customerId) return res.status(400).json({ error: 'customerId saknas' });

    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
    const airtableBaseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
    if (!airtableAccessToken) return res.status(500).json({ error: 'Airtable token saknas' });

    const userData = await getAirtableUser(req.user.email);
    if (!userData) return res.status(404).json({ error: 'Användare hittades inte' });

    const custRes = await axios.get(
      `https://api.airtable.com/v0/${airtableBaseId}/${KUNDDATA_TABLE}/${customerId}`,
      { headers: { Authorization: `Bearer ${airtableAccessToken}` } }
    );
    const f = custRes.data.fields || {};
    const byraId = userData.byraId ? String(userData.byraId).trim() : '';
    const custByraId = f['Byrå ID'] || f.Byrå || '';
    if (userData.role !== 'ClientFlowAdmin' && String(custByraId) !== byraId) {
      return res.status(403).json({ error: 'Ingen behörighet' });
    }

    const attachments = Array.isArray(f['Attachments']) ? f['Attachments'] : [];
    const dokumentationAttachments = Array.isArray(f['Dokumentation']) ? f['Dokumentation'] : [];
    let dokumentationKategorier = [];
    try {
      const raw = (f['Dokumentation Kategorier'] || '').toString().trim();
      if (raw) dokumentationKategorier = JSON.parse(raw);
      if (!Array.isArray(dokumentationKategorier)) dokumentationKategorier = [];
    } catch (_) { dokumentationKategorier = []; }

    const riskField = Array.isArray(f['Riskbedömning dokument']) ? 'Riskbedömning dokument' : 'Riskbedomning dokument';
    const pepField = Array.isArray(f['PEP rapporter']) ? 'PEP rapporter' : 'PEP rapport';
    const riskDocs = Array.isArray(f[riskField]) ? f[riskField] : [];
    const pepDocs = Array.isArray(f[pepField]) ? f[pepField] : [];

    const baseUrl = process.env.PUBLIC_BASE_URL || (req.protocol + '://' + req.get('host'));
    const orgnr = (f['Orgnr'] || '').toString().replace(/[-\s]/g, '').trim();
    const allItems = [];
    const arsredovisningFields = [
      { field: 'Senaste årsredovisning fil', dateField: 'Senaste årsredovisning', jsonField: 'Senaste årsredovisning json', label: 'Årsredovisning (senaste)' },
      { field: 'Fg årsredovisning fil', dateField: 'Fg årsredovisning', jsonField: 'Fg årsredovisning json', label: 'Årsredovisning (föregående)' },
      { field: 'Ffg årsredovisning fil', dateField: 'Ffg årsredovisning', jsonField: 'Ffg årsredovisning json', label: 'Årsredovisning (näst föregående)' }
    ];
    arsredovisningFields.forEach(({ field, dateField, jsonField, label }) => {
      const arr = Array.isArray(f[field]) ? f[field] : [];
      const datum = f[dateField] || '';
      let dokumentId = (f[jsonField] || '').toString().trim();
      if (dokumentId.startsWith('{') || dokumentId.startsWith('[')) {
        try {
          const parsed = JSON.parse(dokumentId);
          dokumentId = (parsed?.dokumentId ?? parsed?.id ?? parsed)?.toString() || dokumentId;
        } catch (_) { /* behåll råa värdet */ }
      } else {
        dokumentId = dokumentId.replace(/^["']|["']$/g, '');
      }
      const fallbackUrl = dokumentId ? `${baseUrl}/api/bolagsverket/dokument/${encodeURIComponent(dokumentId)}${orgnr ? '?orgnr=' + encodeURIComponent(orgnr) : ''}` : null;
      let added = false;
      arr.forEach((a, i) => {
        if (a && (a.url || a.filename)) {
          const hasWorkingUrl = a.url && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//i.test(a.url);
          const url = hasWorkingUrl ? a.url : (fallbackUrl || a.url);
          allItems.push({ ...a, url, _typ: 'arsredovisning', _sourceField: field, _sourceIndex: i, _label: label, _datum: datum || (a.filename || '').match(/\d{4}-\d{2}-\d{2}/)?.[0] || '' });
          added = true;
        }
      });
      if (!added && dokumentId) {
        allItems.push({ url: fallbackUrl, filename: `${label.replace(/\s*\([^)]*\)/g, '').trim()}-${datum || 'okänd-period'}.zip`, _typ: 'arsredovisning', _sourceField: null, _sourceIndex: null, _label: label, _datum: datum });
      }
    });
    riskDocs.forEach((a, i) => {
      if (a && (a.url || a.filename)) allItems.push({ ...a, _typ: 'riskbedomning', _sourceField: riskField, _sourceIndex: i });
    });
    pepDocs.forEach((a, i) => {
      if (a && (a.url || a.filename)) allItems.push({ ...a, _typ: 'pep', _sourceField: pepField, _sourceIndex: i });
    });
    attachments.forEach((a, i) => {
      if (!a || !(a.url || a.filename)) return;
      const fn = (a.filename || '').toLowerCase();
      if (fn.startsWith('riskbedomning-') || fn.includes('riskbedomning')) allItems.push({ ...a, _typ: 'riskbedomning', _sourceField: 'Attachments', _sourceIndex: i });
      else if (fn.startsWith('pep-screening_') || fn.includes('pep-screening')) allItems.push({ ...a, _typ: 'pep', _sourceField: 'Attachments', _sourceIndex: i });
      else allItems.push({ ...a, _typ: 'ovrigt', _sourceField: 'Attachments', _sourceIndex: i, _category: 'ovrigt' });
    });

    dokumentationAttachments.forEach((a, i) => {
      if (!a || !(a.url || a.filename)) return;
      const meta = dokumentationKategorier[i] || {};
      const cat = (meta.category || '').trim() || (meta.kategori || '').trim();
      const customCat = (meta.customCategory || meta.customKategori || '').trim();
      const category = ['riskbedomning', 'arsredovisning', 'uppdragsavtal', 'kyc', 'bolagsverket_skatteverket', 'ovrigt'].includes(cat) ? cat : 'ovrigt';
      allItems.push({ ...a, _typ: 'dokumentation', _sourceField: 'Dokumentation', _sourceIndex: i, _category: category, _customCategory: customCat });
    });

    const categoryLabels = {
      riskbedomning: 'Dokumentation riskbedömning',
      arsredovisning: 'Årsredovisningar',
      uppdragsavtal: 'Uppdragsavtal',
      kyc: 'KYC-formulär',
      bolagsverket_skatteverket: 'Bolagsverket och Skatteverket',
      ovrigt: 'Övrigt'
    };

    const documents = allItems.map((a, i) => {
      const isPep = a._typ === 'pep';
      const isArs = a._typ === 'arsredovisning';
      const isDok = a._typ === 'dokumentation';
      const category = a._category || (isPep || (a._typ === 'riskbedomning') ? 'riskbedomning' : isArs ? 'arsredovisning' : 'ovrigt');
      const customCategory = a._customCategory || '';
      const datum = a._datum || a.createdTime || (a.filename || '').match(/\d{4}-\d{2}-\d{2}/)?.[0] || '';
      let namn = a.filename || (isArs ? a._label : (isPep ? `PEP-screening ${i + 1}` : isDok ? 'Uppladdad fil' : (a._typ === 'riskbedomning' ? `Riskbedömning ${i + 1}` : 'Dokument')));
      const fnLower = (a.filename || '').toLowerCase();
      const autoDesc = fnLower.includes('uppdragsavtal') ? 'Uppdragsavtal' : fnLower.includes('kyc') ? 'KYC-formulär' : (a._typ === 'riskbedomning' ? 'Dokumenterad riskbedömning' : '');
      let beskrivning = isArs ? (a._label + ' från Bolagsverket') : (isPep ? 'PEP & sanktionsscreening' : isDok ? (customCategory || categoryLabels[category] || 'Dokument') : (autoDesc || categoryLabels[category] || ''));
      if (isDok && customCategory) beskrivning = customCategory;
      return {
        id: `${a._typ}-${i}`,
        sourceField: a._sourceField,
        sourceIndex: a._sourceIndex,
        category,
        customCategory: customCategory || undefined,
        categoryLabel: customCategory || categoryLabels[category] || category,
        fields: {
          Namn: namn,
          Filtyp: 'PDF',
          Beskrivning: beskrivning,
          UppladdadDatum: datum,
          UppladdadAv: ''
        },
        url: a.url,
        filename: a.filename
      };
    });

    res.set('Cache-Control', 'no-store');
    res.json({ documents });
  } catch (error) {
    console.error('\u274c GET documents:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/documents – Ta bort dokument från kund (body: { customerId, sourceField, sourceIndex })
app.delete('/api/documents', authenticateToken, async (req, res) => {
  const KUNDDATA_TABLE = 'tblOIuLQS2DqmOQWe';
  try {
    const { customerId, sourceField, sourceIndex } = req.body;
    if (!customerId || !sourceField || sourceIndex == null) {
      return res.status(400).json({ error: 'customerId, sourceField och sourceIndex krävs' });
    }

    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
    const airtableBaseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
    if (!airtableAccessToken) return res.status(500).json({ error: 'Airtable token saknas' });

    const userData = await getAirtableUser(req.user.email);
    if (!userData) return res.status(404).json({ error: 'Användare hittades inte' });

    const custRes = await axios.get(
      `https://api.airtable.com/v0/${airtableBaseId}/${KUNDDATA_TABLE}/${customerId}`,
      { headers: { Authorization: `Bearer ${airtableAccessToken}` } }
    );
    const f = custRes.data.fields || {};
    const byraId = userData.byraId ? String(userData.byraId).trim() : '';
    const custByraId = f['Byrå ID'] || f.Byrå || '';
    if (userData.role !== 'ClientFlowAdmin' && String(custByraId) !== byraId) {
      return res.status(403).json({ error: 'Ingen behörighet' });
    }

    const arr = Array.isArray(f[sourceField]) ? [...f[sourceField]] : [];
    const idx = parseInt(sourceIndex, 10);
    if (idx < 0 || idx >= arr.length) {
      return res.status(400).json({ error: 'Ogiltigt dokumentindex' });
    }

    arr.splice(idx, 1);

    await axios.patch(
      `https://api.airtable.com/v0/${airtableBaseId}/${KUNDDATA_TABLE}/${customerId}`,
      { fields: { [sourceField]: arr } },
      { headers: { Authorization: `Bearer ${airtableAccessToken}`, 'Content-Type': 'application/json' } }
    );

    if (sourceField === 'Dokumentation') {
      try {
        let kategorier = [];
        const raw = (f['Dokumentation Kategorier'] || '').toString().trim();
        if (raw) kategorier = JSON.parse(raw);
        if (!Array.isArray(kategorier)) kategorier = [];
        if (idx >= 0 && idx < kategorier.length) {
          kategorier.splice(idx, 1);
          await axios.patch(
            `https://api.airtable.com/v0/${airtableBaseId}/${KUNDDATA_TABLE}/${customerId}`,
            { fields: { 'Dokumentation Kategorier': JSON.stringify(kategorier) } },
            { headers: { Authorization: `Bearer ${airtableAccessToken}`, 'Content-Type': 'application/json' } }
          );
        }
      } catch (e) {
        console.warn('Kunde inte uppdatera Dokumentation Kategorier (fältet kan saknas):', e.message);
      }
    }

    res.json({ success: true, message: 'Dokument borttaget' });
  } catch (error) {
    console.error('\u274c DELETE document:', error.message);
    res.status(500).json({ error: error.message });
  }
});

const DOCUMENT_CATEGORIES = ['riskbedomning', 'arsredovisning', 'uppdragsavtal', 'kyc', 'bolagsverket_skatteverket', 'ovrigt'];

// POST /api/documents/upload – Ladda upp dokument med kategori (body: customerId, file [base64], filename, category, customCategory?)
app.post('/api/documents/upload', authenticateToken, async (req, res) => {
  const KUNDDATA_TABLE = 'tblOIuLQS2DqmOQWe';
  try {
    const { customerId, file: fileBase64, filename, category, customCategory } = req.body;
    if (!customerId || !filename) return res.status(400).json({ error: 'customerId och filename krävs' });
    const cat = (category || 'ovrigt').trim();
    if (!DOCUMENT_CATEGORIES.includes(cat)) return res.status(400).json({ error: 'Ogiltig kategori' });

    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
    const airtableBaseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
    if (!airtableAccessToken) return res.status(500).json({ error: 'Airtable token saknas' });

    const userData = await getAirtableUser(req.user.email);
    if (!userData) return res.status(404).json({ error: 'Användare hittades inte' });

    const custRes = await axios.get(
      `https://api.airtable.com/v0/${airtableBaseId}/${KUNDDATA_TABLE}/${customerId}`,
      { headers: { Authorization: `Bearer ${airtableAccessToken}` } }
    );
    const f = custRes.data.fields || {};
    const byraId = userData.byraId ? String(userData.byraId).trim() : '';
    const custByraId = f['Byrå ID'] || f.Byrå || '';
    if (userData.role !== 'ClientFlowAdmin' && String(custByraId) !== byraId) {
      return res.status(403).json({ error: 'Ingen behörighet' });
    }

    if (!fileBase64 || typeof fileBase64 !== 'string') return res.status(400).json({ error: 'Fil (base64) saknas' });
    let buffer;
    try {
      buffer = Buffer.from(fileBase64, 'base64');
    } catch (e) {
      return res.status(400).json({ error: 'Ogiltig fil (base64)' });
    }
    // Airtable Content API tenderar att ha en relativt låg filgräns; håll detta konservativt
    // så vi kan ge ett tydligt fel istället för "Bad Gateway".
    if (buffer.length > 10 * 1024 * 1024) {
      return res.status(400).json({ error: 'Filen är för stor. Maxstorlek för uppladdning är 10 MB.' });
    }

    const contentType = (filename.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream');
    // I många baser heter bilagefältet "Attachments" (inte "Dokumentation").
    // Vi laddar upp till Attachments och sparar kategorier i "Dokumentation Kategorier" om fältet finns.
    const uploadedToAttachments = await uploadAttachmentToAirtableField(
      airtableAccessToken,
      airtableBaseId,
      customerId,
      buffer,
      filename,
      contentType,
      KUNDDATA_TABLE,
      'Attachments'
    );
    const uploaded = uploadedToAttachments || await uploadAttachmentToAirtable(
      airtableAccessToken,
      airtableBaseId,
      customerId,
      buffer,
      filename,
      contentType,
      KUNDDATA_TABLE
    );
    if (!uploaded) {
      return res.status(500).json({
        error: 'Kunde inte ladda upp fil till Airtable. Kontrollera att Airtable-token har rätt behörigheter (data.records:write) och prova igen.'
      });
    }

    // Spara kategori-info separat (om fältet finns). Detta styr hur dokumenten grupperas i UI.
    try {
      let kategorier = [];
      const raw = (f['Dokumentation Kategorier'] || '').toString().trim();
      if (raw) kategorier = JSON.parse(raw);
      if (!Array.isArray(kategorier)) kategorier = [];
      kategorier.push({ filename, category: cat, customCategory: (customCategory || '').trim() });
      await axios.patch(
        `https://api.airtable.com/v0/${airtableBaseId}/${KUNDDATA_TABLE}/${customerId}`,
        { fields: { 'Dokumentation Kategorier': JSON.stringify(kategorier) } },
        { headers: { Authorization: `Bearer ${airtableAccessToken}`, 'Content-Type': 'application/json' } }
      );
    } catch (e) {
      console.warn('Kunde inte spara kategori (lägg till fältet "Dokumentation Kategorier" i Airtable om kategorier ska sparas):', e.message);
    }

    res.json({ success: true, message: 'Dokument uppladdat', category: cat });
  } catch (error) {
    console.error('\u274c POST documents/upload:', error.message);
    const status = error.response?.status;
    const detail = error.response?.data?.error?.message || error.response?.data?.message || error.response?.data || null;
    if (status === 401 || status === 403) {
      return res.status(500).json({
        error: 'Airtable nekade uppladdningen. Kontrollera att AIRTABLE_ACCESS_TOKEN har scope data.records:write (och att den har åtkomst till basen).',
        details: detail
      });
    }
    res.status(500).json({ error: error.message, details: detail });
  }
});

// ---------- Samarbete (begära underlag från kund) ----------
// Kräver Airtable-tabell "Samarbete" med fält: Kund ID, Mottagare namn, Mottagare e-post, Typ, Titel, Token, Status, Svar text, Svar bifogad fil, Besvarad
const KUNDDATA_TABLE_ID = 'tblOIuLQS2DqmOQWe';

async function ensureSamarbeteFieldsExist({ airtableAccessToken, airtableBaseId, samarbeteTableId }) {
  const metaRes = await axios.get(`https://api.airtable.com/v0/meta/bases/${airtableBaseId}/tables`, {
    headers: { Authorization: `Bearer ${airtableAccessToken}` },
    timeout: 10000
  });
  const tables = (metaRes.data?.tables || []);
  const samarbeteTable = tables.find(t => (t.id || '') === samarbeteTableId);
  if (!samarbeteTable) return { created: [], skipped: 0 };

  const existingNames = (samarbeteTable.fields || []).map(f => (f.name || '').trim());
  const toCreate = SAMARBETE_REQUIRED_FIELDS.filter(f => !existingNames.includes((f.name || '').trim()));
  const created = [];
  const createUrl = `https://api.airtable.com/v0/meta/bases/${airtableBaseId}/tables/${samarbeteTable.id}/fields`;
  for (const field of toCreate) {
    try {
      const body = { name: field.name, type: field.type };
      if (field.description) body.description = field.description;
      if (field.options) body.options = field.options;
      await axios.post(createUrl, body, {
        headers: { Authorization: `Bearer ${airtableAccessToken}`, 'Content-Type': 'application/json' },
        timeout: 10000
      });
      created.push(field.name);
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.message;
      console.warn('Kunde inte skapa fält', field.name, msg);
    }
  }
  const skipped = SAMARBETE_REQUIRED_FIELDS.length - toCreate.length;
  return { created, skipped };
}

// POST /api/setup/airtable-samarbete – Skapa tabellen "Samarbete" i Airtable (auth)
// Kräver Personal Access Token med schema.bases:read och schema.bases:write.
app.post('/api/setup/airtable-samarbete', authenticateToken, async (req, res) => {
  const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
  const airtableBaseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
  if (!airtableAccessToken) {
    return res.status(500).json({ success: false, error: 'AIRTABLE_ACCESS_TOKEN saknas' });
  }
  try {
    const metaRes = await axios.get(`https://api.airtable.com/v0/meta/bases/${airtableBaseId}/tables`, {
      headers: { Authorization: `Bearer ${airtableAccessToken}` },
      timeout: 10000
    });
    const tables = (metaRes.data?.tables || []);
    const existing = tables.find(t => (t.name || '').toLowerCase() === 'samarbete');
    if (existing) {
      const ensured = await ensureSamarbeteFieldsExist({ airtableAccessToken, airtableBaseId, samarbeteTableId: existing.id });
      return res.json({
        success: true,
        message: ensured.created.length
          ? `Tabellen "Samarbete" finns redan. ${ensured.created.length} fält lades till.`
          : 'Tabellen "Samarbete" finns redan.',
        tableId: existing.id,
        alreadyExists: true,
        createdFields: ensured.created
      });
    }
    const createRes = await axios.post(
      `https://api.airtable.com/v0/meta/bases/${airtableBaseId}/tables`,
      {
        name: 'Samarbete',
        description: 'Förfrågningar om underlag från kunder (fliken Samarbete i ClientFlow)',
        fields: [
          { name: 'Kund ID', type: 'singleLineText', description: 'Record-id för kunden i KUNDDATA' },
          { name: 'Mottagare namn', type: 'singleLineText' },
          { name: 'Mottagare e-post', type: 'email' },
          { name: 'Typ', type: 'singleSelect', options: { choices: [{ name: 'Filer' }, { name: 'Kommentar' }] } },
          { name: 'Titel', type: 'multilineText', description: 'Vad som begärs från kunden' },
          { name: 'Token', type: 'singleLineText', description: 'Unik token för kundlänk' },
          { name: 'Status', type: 'singleSelect', options: { choices: [{ name: 'Väntar' }, { name: 'Besvarad' }] } },
          { name: 'Svar text', type: 'multilineText', description: 'Kundens kommentar/svar' },
          { name: 'Svar bifogad fil', type: 'multipleAttachments', description: 'Fil som kunden laddade upp' },
          { name: 'Besvarad', type: 'dateTime', options: { dateFormat: { name: 'iso' }, timeFormat: { name: '24hour' }, timeZone: 'Europe/Stockholm' } },
          { name: 'Deadline', type: 'date', description: 'Deadline för kundens svar (valfri)' },
          { name: 'Senast påminnelse skickad', type: 'date', description: 'Intern: datum när senaste påminnelse skickades (för att begränsa till en per dag)' }
        ]
      },
      {
        headers: { Authorization: `Bearer ${airtableAccessToken}`, 'Content-Type': 'application/json' },
        timeout: 15000
      }
    );
    const newTable = createRes.data;
    const tableId = newTable?.id || (newTable?.tables && newTable.tables[0] && newTable.tables[0].id);
    if (tableId) {
      try {
        await ensureSamarbeteFieldsExist({ airtableAccessToken, airtableBaseId, samarbeteTableId: tableId });
      } catch (_) {}
    }
    return res.json({
      success: true,
      message: 'Tabellen "Samarbete" skapades i Airtable.',
      tableId: tableId || '',
      alreadyExists: false
    });
  } catch (err) {
    const status = err.response?.status;
    const data = err.response?.data || {};
    const msg = (data.error && data.error.message) || data.message || err.message;
    console.error('Setup Samarbete:', status, msg, data);
    if (status === 403 || status === 401) {
      return res.status(status).json({
        success: false,
        error: 'Token saknar behörighet. Använd en Airtable Personal Access Token med scope schema.bases:read och schema.bases:write.',
        details: msg
      });
    }
    return res.status(status || 500).json({
      success: false,
      error: msg || 'Kunde inte skapa tabellen'
    });
  }
});

// Lista fält som Samarbete-tabellen behöver (namn + typ + options)
const SAMARBETE_REQUIRED_FIELDS = [
  { name: 'Kund ID', type: 'singleLineText', description: 'Record-id för kunden i KUNDDATA' },
  { name: 'Mottagare namn', type: 'singleLineText' },
  { name: 'Mottagare e-post', type: 'email' },
  { name: 'Typ', type: 'singleSelect', options: { choices: [{ name: 'Filer' }, { name: 'Kommentar' }] } },
  { name: 'Meddelande', type: 'multilineText', description: 'Intern: meddelande som visas i mejlet till kunden (valfritt)' },
  { name: 'Titel', type: 'multilineText', description: 'Vad som begärs från kunden' },
  { name: 'Token', type: 'singleLineText', description: 'Unik token för kundlänk' },
  { name: 'Status', type: 'singleSelect', options: { choices: [{ name: 'Utkast' }, { name: 'Väntar' }, { name: 'Besvarad' }, { name: 'Arkiverad' }] } },
  { name: 'Skapad från uppdrag', type: 'checkbox', description: 'Intern: markerar att förfrågan skapats automatiskt från Uppdrag' },
  { name: 'Uppdrag ID', type: 'singleLineText', description: 'Intern: record-id för uppdraget som skapade förfrågan' },
  { name: 'Uppdrag typ', type: 'singleLineText', description: 'Intern: uppdragstyp (t.ex. Löneuppdrag)' },
  { name: 'Uppdrag period', type: 'singleLineText', description: 'Intern: periodnyckel för utskicket (t.ex. 2026-04)' },
  { name: 'Uppdragskörning ID', type: 'singleLineText', description: 'Intern: record-id för uppdragskörningen som förfrågan hör till' },
  { name: 'Deadline', type: 'date', description: 'Deadline för kundens svar (valfri)' },
  { name: 'Senast påminnelse skickad', type: 'date', description: 'Intern: datum när senaste påminnelse skickades (för att begränsa till en per dag)' },
  { name: 'Svar text', type: 'multilineText', description: 'Kundens kommentar/svar' },
  { name: 'Svar bifogad fil', type: 'multipleAttachments', description: 'Fil som kunden laddade upp' },
  { name: 'Besvarad', type: 'dateTime', options: { dateFormat: { name: 'iso' }, timeFormat: { name: '24hour' }, timeZone: 'Europe/Stockholm' } },
  { name: 'Stängd', type: 'checkbox', description: 'När ikryssad visas inte formuläret för kunden – förfrågan är avslutad' }
];

// POST /api/setup/airtable-samarbete-fields – Lägg till saknade fält i befintlig tabell "Samarbete" (auth)
app.post('/api/setup/airtable-samarbete-fields', authenticateToken, async (req, res) => {
  const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
  const airtableBaseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
  if (!airtableAccessToken) {
    return res.status(500).json({ success: false, error: 'AIRTABLE_ACCESS_TOKEN saknas' });
  }
  try {
    const metaRes = await axios.get(`https://api.airtable.com/v0/meta/bases/${airtableBaseId}/tables`, {
      headers: { Authorization: `Bearer ${airtableAccessToken}` },
      timeout: 10000
    });
    const tables = (metaRes.data?.tables || []);
    const samarbeteTable = tables.find(t => (t.name || '').toLowerCase() === 'samarbete');
    if (!samarbeteTable) {
      return res.status(404).json({
        success: false,
        error: 'Tabellen "Samarbete" hittades inte i basen. Skapa den först i Airtable.'
      });
    }
    const existingNames = (samarbeteTable.fields || []).map(f => (f.name || '').trim());
    const toCreate = SAMARBETE_REQUIRED_FIELDS.filter(f => !existingNames.includes((f.name || '').trim()));
    const created = [];
    const createUrl = `https://api.airtable.com/v0/meta/bases/${airtableBaseId}/tables/${samarbeteTable.id}/fields`;
    for (const field of toCreate) {
      try {
        const body = { name: field.name, type: field.type };
        if (field.description) body.description = field.description;
        if (field.options) body.options = field.options;
        await axios.post(createUrl, body, {
          headers: { Authorization: `Bearer ${airtableAccessToken}`, 'Content-Type': 'application/json' },
          timeout: 10000
        });
        created.push(field.name);
      } catch (err) {
        const msg = err.response?.data?.error?.message || err.message;
        console.warn('Kunde inte skapa fält', field.name, msg);
      }
    }
    const skipped = SAMARBETE_REQUIRED_FIELDS.length - toCreate.length;
    return res.json({
      success: true,
      message: created.length
        ? `${created.length} fält lades till i Samarbete. ${skipped} fanns redan.`
        : `Alla ${SAMARBETE_REQUIRED_FIELDS.length} fält finns redan i tabellen Samarbete.`,
      created,
      alreadyExisted: skipped
    });
  } catch (err) {
    const status = err.response?.status;
    const data = err.response?.data || {};
    const msg = (data.error && data.error.message) || data.message || err.message;
    console.error('Setup Samarbete fält:', status, msg);
    if (status === 403 || status === 401) {
      return res.status(status).json({
        success: false,
        error: 'Token saknar behörighet. Använd en Airtable Personal Access Token med schema.bases:read och schema.bases:write.',
        details: msg
      });
    }
    return res.status(status || 500).json({ success: false, error: msg || 'Kunde inte uppdatera tabellen' });
  }
});

async function getSamarbeteTableId(airtableToken, baseId) {
  const id = process.env.AIRTABLE_TABLE_SAMARBETE_ID;
  if (id && id.trim()) return id.trim();
  try {
    const res = await axios.get(`https://api.airtable.com/v0/meta/bases/${baseId}/tables`, {
      headers: { Authorization: `Bearer ${airtableToken}` }
    });
    const t = (res.data.tables || []).find(x => (x.name || '').toLowerCase() === 'samarbete');
    return t ? t.id : null;
  } catch (e) {
    return null;
  }
}

/**
 * Säkerställ att Status-fältet i tabellen Samarbete har alla val appen använder
 * (Utkast/Väntar/Besvarad/Arkiverad). Äldre baser skapades med endast Väntar/Besvarad,
 * vilket gör att t.ex. utkast (Status="Utkast") avvisas av Airtable.
 * Kräver Personal Access Token med schema.bases:write.
 */
async function ensureSamarbeteStatusChoices(airtableToken, baseId, tableId) {
  try {
    const metaRes = await axios.get(`https://api.airtable.com/v0/meta/bases/${baseId}/tables`, {
      headers: { Authorization: `Bearer ${airtableToken}` },
      timeout: 10000
    });
    const table = (metaRes.data?.tables || []).find(t => (t.id || '') === tableId);
    if (!table) return { ok: false, reason: 'Tabell saknas' };
    const statusField = (table.fields || []).find(f => (f.name || '').trim() === 'Status');
    if (!statusField || !statusField.id) return { ok: false, reason: 'Fältet "Status" saknas' };

    const desired = ['Utkast', 'Väntar', 'Besvarad', 'Arkiverad'];
    const current = (statusField.options?.choices || []).map(c => (c?.name || '').trim()).filter(Boolean);
    const missing = desired.filter(x => !current.includes(x));
    if (!missing.length) return { ok: true, updated: false };

    const patchUrl = `https://api.airtable.com/v0/meta/bases/${baseId}/tables/${tableId}/fields/${statusField.id}`;
    const choices = Array.from(new Set(current.concat(desired))).map(name => ({ name }));
    await axios.patch(patchUrl, {
      name: 'Status',
      type: 'singleSelect',
      options: { choices }
    }, {
      headers: { Authorization: `Bearer ${airtableToken}`, 'Content-Type': 'application/json' },
      timeout: 10000
    });
    return { ok: true, updated: true, added: missing };
  } catch (e) {
    const msg = e.response?.data?.error?.message || e.message;
    return { ok: false, reason: msg || 'Kunde inte uppdatera status-val' };
  }
}

/** Skapa fältet "Arkiverad" i tabell Samarbete om det saknas (för arkiv-funktionen). */
async function ensureSamarbeteArkiveradField(airtableToken, baseId, tableId) {
  try {
    const metaRes = await axios.get(`https://api.airtable.com/v0/meta/bases/${baseId}/tables`, {
      headers: { Authorization: `Bearer ${airtableToken}` },
      timeout: 10000
    });
    const table = (metaRes.data?.tables || []).find(t => (t.id || '') === tableId);
    const existingNames = (table?.fields || []).map(f => (f.name || '').trim());
    if (existingNames.includes('Arkiverad')) return true;
    const createUrl = `https://api.airtable.com/v0/meta/bases/${baseId}/tables/${tableId}/fields`;
    await axios.post(createUrl, {
      name: 'Arkiverad',
      type: 'checkbox',
      description: 'Arkiverade förfrågningar visas i kortet Arkiverade'
    }, {
      headers: { Authorization: `Bearer ${airtableToken}`, 'Content-Type': 'application/json' },
      timeout: 10000
    });
    return true;
  } catch (e) {
    console.warn('ensureSamarbeteArkiveradField:', e.response?.data?.error?.message || e.message);
    return false;
  }
}

/**
 * Skickar inbjudan till kund att lämna underlag via ClientFlow.
 * Mejlet skickas från MAIL_FROM; Reply-To sätts till avsändarens e-post så att svar når rätt person.
 * Kräver SMTP i .env: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM (t.ex. "ClientFlow <underlag@clientflow.se>").
 */
async function sendSamarbeteInviteEmail(options) {
  const { toEmail, toName, senderName, senderEmail, senderByra, senderLogoUrl, respondUrl, title, customerMessage, deadlineDate } = options;
  const host = (process.env.SMTP_HOST || '').trim();
  const user = (process.env.SMTP_USER || '').trim();
  const passRaw = process.env.SMTP_PASS ?? process.env.SMTP_PASSWORD;
  const pass = typeof passRaw === 'string' ? passRaw.replace(/^["']|["']$/g, '').trim() : '';
  if (!host || !user || !pass) {
    const msg = 'SMTP är inte konfigurerad på servern. Lägg till SMTP_HOST, SMTP_USER och SMTP_PASS i miljövariablerna (t.ex. på Render under Environment). Efter ändring: spara och kör Manuell Deploy. Kontrollera: GET /api/smtp-status';
    console.warn('sendSamarbeteInviteEmail:', msg);
    return { sent: false, error: msg };
  }
  const from = process.env.MAIL_FROM || 'ClientFlow Underlag <noreply@clientflow.se>';
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;

  const escapeHtml = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const titleLines = String(title || '').split(/\n/).map(s => s.trim()).filter(Boolean);
  const titleLinesHtml = titleLines.length ? titleLines.map(line => escapeHtml(line)).join('<br />') : '';
  const customerMessageHtml = (customerMessage && String(customerMessage).trim())
    ? `<p style="margin:0 0 24px 0; font-size:1rem; line-height:1.5; color:#334155; font-style:italic;">${escapeHtml(String(customerMessage).trim()).replace(/\n/g, '<br />')}</p>`
    : '';
  const safeToName = escapeHtml(String(toName || 'Kund'));
  const safeSenderName = escapeHtml(String(senderName || 'Vi'));
  const safeSenderByra = escapeHtml(String(senderByra || '').trim());
  const senderLine = safeSenderByra
    ? `${safeSenderName} på ${safeSenderByra} har bett dig lämna underlag eller besvara frågor via ClientFlow.`
    : `${safeSenderName} har bett dig lämna underlag eller besvara frågor via ClientFlow.`;
  const rawName = String(senderName || 'Vi').trim();
  const rawByra = String(senderByra || '').trim();
  const subjectLine = rawByra ? `${rawName}, ${rawByra}` : rawName;
  const logoImgInline = senderLogoUrl && senderLogoUrl.startsWith('http')
    ? `<img src="${escapeHtml(senderLogoUrl)}" alt="" style="max-height:73px; max-width:260px; object-fit:contain; display:inline-block;" />`
    : '';

  const fmtDeadlineSv = (d) => {
    if (!d) return '';
    try {
      const dt = new Date(String(d).trim());
      if (Number.isNaN(dt.getTime())) return '';
      return dt.toLocaleDateString('sv-SE');
    } catch (_) {
      return '';
    }
  };
  const deadlineStr = fmtDeadlineSv(deadlineDate);
  const deadlineHtml = deadlineStr
    ? `<p style="margin:0 0 12px 0; font-size:0.95rem; line-height:1.5; color:#0f172a;"><strong>Deadline:</strong> ${escapeHtml(deadlineStr)}</p>`
    : '';

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Lämna underlag – ClientFlow</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
</head>
<body style="margin:0; padding:0; font-family: 'Inter', system-ui, -apple-system, Segoe UI, sans-serif; background:#f0f4ff; color:#1e293b;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f0f4ff;">
    <tr>
      <td style="padding:32px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px; margin:0 auto; background:#fff; border-radius:12px; box-shadow:0 4px 20px rgba(0,0,0,0.08); overflow:hidden;">
          <tr>
            <td style="background:#fff; padding:24px 28px; text-align:center; border-bottom:1px solid #e5e7eb;">
              ${logoImgInline || '<span style="font-size:0.85rem; color:#94a3b8;">—</span>'}
            </td>
          </tr>
          <tr>
            <td style="padding:28px;">
              <p style="margin:0 0 16px 0; font-size:1rem; line-height:1.5; color:#334155;">Hej ${safeToName},</p>
              <p style="margin:0 0 20px 0; font-size:1rem; line-height:1.5; color:#475569;">${senderLine}</p>
              ${customerMessageHtml}
              ${deadlineHtml}
              ${titleLinesHtml ? `<p style="margin:0 0 24px 0; font-size:0.9rem; color:#64748b; background:#f8fafc; padding:12px 16px; border-radius:8px; line-height:1.6;">${titleLinesHtml}</p>` : ''}
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 auto;">
                <tr>
                  <td style="border-radius:8px; background:#6366f1;">
                    <a href="${respondUrl}" style="display:inline-block; padding:14px 28px; font-size:1rem; font-weight:600; color:#fff; text-decoration:none;">Öppna länk och lämna underlag</a>
                  </td>
                </tr>
              </table>
              <p style="margin:24px 0 0 0; font-size:0.85rem; color:#94a3b8;">Om knappen inte fungerar, kopiera och klistra in denna länk i webbläsaren:</p>
              <p style="margin:8px 0 0 0; font-size:0.8rem; word-break:break-all; color:#64748b;">${respondUrl}</p>
              <p style="margin:28px 0 0 0; font-size:0.8rem; color:#94a3b8;">Svara gärna på detta mejl om du har frågor – då når ditt svar direkt ${safeSenderName}${safeSenderByra ? ' på ' + safeSenderByra : ''}.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 28px 16px; background:#f8fafc; border-top:1px solid #e2e8f0; text-align:center;">
              <div style="font-family:'Inter', sans-serif; color:#6366f1; font-size:1rem; font-weight:600; letter-spacing:-0.02em; margin-bottom:10px;">Client<span style="font-weight:700;">Flow</span></div>
              <p style="margin:0; font-size:0.75rem; color:#94a3b8;">Detta mejl skickades från ClientFlow som är ett systemstöd för redovisnings- och revisionsbyråer.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  try {
    const transporterOpts = {
      host,
      port,
      secure,
      auth: user && pass ? { user, pass } : undefined
    };
    if (port === 587 && !secure) {
      transporterOpts.requireTLS = true;
    }
    const transporter = nodemailer.createTransport(transporterOpts);
    const textSenderLine = safeSenderByra
      ? `${safeSenderName} på ${safeSenderByra} har bett dig lämna underlag via ClientFlow.`
      : `${safeSenderName} har bett dig lämna underlag via ClientFlow.`;
    await transporter.sendMail({
      from,
      to: toEmail,
      replyTo: senderEmail || undefined,
      subject: `Lämna underlag – från ${subjectLine}`,
      text: `Hej ${safeToName},\n\n${textSenderLine}\n${deadlineStr ? `\nDeadline: ${deadlineStr}\n` : '\n'}\nÖppna denna länk för att lämna underlag eller besvara frågor:\n${respondUrl}\n\nMed vänliga hälsningar,\nClientFlow`,
      html
    });
    return { sent: true };
  } catch (err) {
    console.error('sendSamarbeteInviteEmail:', err.message);
    return { sent: false, error: err.message };
  }
}

// POST /api/samarbete/requests – Skapa förfrågan (auth), returnerar länk för kunden
app.post('/api/samarbete/requests', authenticateToken, async (req, res) => {
  try {
    const { customerId, recipientName, recipientEmail, type, title, customerMessage, deadline, uppdragId, uppdragTyp, uppdragPeriod, uppdragskorningId, status } = req.body;
    if (!customerId || !title) return res.status(400).json({ error: 'customerId och title krävs' });
    const typ = (type === 'comment' || type === 'Kommentar') ? 'Kommentar' : 'Filer';
    const desiredStatus = (String(status || '').trim() === 'Utkast') ? 'Utkast' : 'Väntar';
    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
    const airtableBaseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
    if (!airtableAccessToken) return res.status(500).json({ error: 'Airtable token saknas' });

    const userData = await getAirtableUser(req.user.email);
    if (!userData) return res.status(404).json({ error: 'Användare hittades inte' });
    const custRes = await axios.get(
      `https://api.airtable.com/v0/${airtableBaseId}/${KUNDDATA_TABLE_ID}/${customerId}`,
      { headers: { Authorization: `Bearer ${airtableAccessToken}` } }
    );
    const f = custRes.data.fields || {};
    const custByraId = (f['Byrå ID'] || f.Byrå || '').toString();
    if (userData.role !== 'ClientFlowAdmin' && String(custByraId) !== String(userData.byraId || '').trim()) {
      return res.status(403).json({ error: 'Ingen behörighet' });
    }

    const tableId = await getSamarbeteTableId(airtableAccessToken, airtableBaseId);
    if (!tableId) return res.status(503).json({ error: 'Tabellen "Samarbete" finns inte i Airtable. Skapa den och lägg till fält enligt dokumentationen.' });

    const token = crypto.randomBytes(32).toString('hex');
    const reqHost = (req.get('host') || '').toString().trim();
    const inferredBase = req.protocol + '://' + (reqHost || 'localhost:3001');
    // Kundlänken ska normalt peka till app-domänen (inte API-proxy-domänen),
    // annars kan Render visa "service waking up" eller blockera statiska filer.
    const defaultPublicBase =
      (reqHost.includes('localhost') || reqHost.includes('127.0.0.1'))
        ? inferredBase
        : 'https://www.app.clientflow.se';
    const publicBaseUrl = (process.env.PUBLIC_BASE_URL || '').toString().trim() || defaultPublicBase;
    const respondUrl = `${publicBaseUrl}/samarbete-svar.html?token=${token}`;

    const parseDeadlineDateOnly = (v) => {
      if (v == null) return null;
      const s = String(v).trim();
      if (!s) return null;
      // Expect YYYY-MM-DD from <input type="date">. Accept other formats but normalize to YYYY-MM-DD.
      const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (m) return `${m[1]}-${m[2]}-${m[3]}`;
      const d = new Date(s);
      if (Number.isNaN(d.getTime())) return null;
      // Normalize to date in Europe/Stockholm (best-effort) then YYYY-MM-DD
      try {
        const parts = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
        const y = parts.find(p => p.type === 'year')?.value;
        const mo = parts.find(p => p.type === 'month')?.value;
        const da = parts.find(p => p.type === 'day')?.value;
        if (y && mo && da) return `${y}-${mo}-${da}`;
      } catch (_) {}
      const iso = d.toISOString().slice(0, 10);
      return iso || null;
    };
    const deadlineDate = parseDeadlineDateOnly(deadline);

    const createPayload = {
      fields: {
        'Kund ID': customerId,
        'Mottagare namn': (recipientName || '').toString().trim() || 'Kund',
        'Mottagare e-post': (recipientEmail || '').toString().trim() || '',
        'Typ': typ,
        ...(customerMessage != null && String(customerMessage).trim() ? { 'Meddelande': String(customerMessage).trim().slice(0, 100000) } : {}),
        'Titel': String(title).trim(),
        'Token': token,
        'Status': desiredStatus,
        ...((uppdragId || uppdragTyp) ? {
          'Skapad från uppdrag': true,
          ...(uppdragId ? { 'Uppdrag ID': String(uppdragId).trim() } : {}),
          ...(uppdragTyp ? { 'Uppdrag typ': String(uppdragTyp).trim() } : {}),
          ...(uppdragPeriod ? { 'Uppdrag period': String(uppdragPeriod).trim() } : {}),
          ...(uppdragskorningId ? { 'Uppdragskörning ID': String(uppdragskorningId).trim() } : {})
        } : {}),
        ...(deadlineDate ? { 'Deadline': deadlineDate } : {})
      }
    };

    const createRequestRecord = async () =>
      axios.post(
        `https://api.airtable.com/v0/${airtableBaseId}/${tableId}`,
        createPayload,
        { headers: { Authorization: `Bearer ${airtableAccessToken}`, 'Content-Type': 'application/json' } }
      );

    let createRes;
    try {
      createRes = await createRequestRecord();
    } catch (e) {
      const status = e.response?.status;
      const msg = e.response?.data?.error?.message || e.message || '';
      const isUnknownField = status === 422 && /Unknown field name:/i.test(String(msg));
      const isMissingSelectOption = status === 422 && /select option/i.test(String(msg));
      if (isUnknownField) {
        // Försök skapa saknade fält automatiskt (kräver schema.bases:write) och gör om.
        try {
          await ensureSamarbeteFieldsExist({ airtableAccessToken, airtableBaseId, samarbeteTableId: tableId });
          createRes = await createRequestRecord();
        } catch (e2) {
          throw e2;
        }
      } else if (isMissingSelectOption) {
        // Status-värdet (t.ex. "Utkast") saknas som val i Airtable. Lägg till alla val
        // appen använder automatiskt (kräver schema.bases:write) och gör om.
        try {
          await ensureSamarbeteStatusChoices(airtableAccessToken, airtableBaseId, tableId);
          createRes = await createRequestRecord();
        } catch (e2) {
          throw e2;
        }
      } else {
        throw e;
      }
    }
    const record = createRes.data;
    let emailSent = false;
    let emailError = null;
    const toEmail = (recipientEmail || '').toString().trim();
    if (desiredStatus !== 'Utkast' && toEmail && toEmail.includes('@')) {
      const senderName = (userData.name || req.user.email || '').toString().trim() || 'Vi';
      const senderByra = (userData.byra || '').toString().trim() || null;
      const logoRaw = userData.logo;
      const senderLogoUrl = Array.isArray(logoRaw) && logoRaw.length > 0 && logoRaw[0].url
        ? logoRaw[0].url
        : (typeof logoRaw === 'string' && logoRaw.startsWith('http') ? logoRaw : null);
      const result = await sendSamarbeteInviteEmail({
        toEmail,
        toName: (recipientName || '').toString().trim() || 'Kund',
        senderName,
        senderEmail: (req.user && req.user.email) ? String(req.user.email).trim() : undefined,
        senderByra: senderByra || undefined,
        senderLogoUrl: senderLogoUrl || undefined,
        respondUrl,
        title: String(title).trim(),
        customerMessage: (customerMessage != null && String(customerMessage).trim()) ? String(customerMessage).trim() : undefined,
        deadlineDate: deadlineDate || undefined
      });
      emailSent = result.sent;
      emailError = result.error || null;
    }
    res.json({
      success: true,
      request: { id: record.id, title: String(title).trim(), type: typ, token, status: desiredStatus, deadline: deadlineDate || undefined },
      link: respondUrl,
      message: desiredStatus === 'Utkast'
        ? 'Utkast sparat.'
        : (emailSent ? `Förfrågan skapad och ett mejl har skickats till ${toEmail}.` : 'Förfrågan skapad. Dela länken med kunden.'),
      emailSent,
      emailError: emailError || undefined
    });
  } catch (error) {
    const status = error.response?.status || 500;
    const msg = error.response?.data?.error?.message || error.response?.data?.message || error.message;
    console.error('POST /api/samarbete/requests:', msg);
    res.status(status).json({
      error: msg,
      details: (status >= 400 && status !== 500) ? (error.response?.data || undefined) : undefined
    });
  }
});

// GET /api/samarbete/requests?customerId= – Lista förfrågningar för kund (auth)
app.get('/api/samarbete/requests', authenticateToken, async (req, res) => {
  try {
    const customerId = (req.query.customerId || '').toString().trim();
    if (!customerId) return res.status(400).json({ error: 'customerId krävs' });
    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
    const airtableBaseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
    if (!airtableAccessToken) return res.status(500).json({ error: 'Airtable token saknas' });

    const userData = await getAirtableUser(req.user.email);
    if (!userData) return res.status(404).json({ error: 'Användare hittades inte' });
    const custRes = await axios.get(
      `https://api.airtable.com/v0/${airtableBaseId}/${KUNDDATA_TABLE_ID}/${customerId}`,
      { headers: { Authorization: `Bearer ${airtableAccessToken}` } }
    );
    const f = custRes.data.fields || {};
    const custByraId = (f['Byrå ID'] || f.Byrå || '').toString();
    if (userData.role !== 'ClientFlowAdmin' && String(custByraId) !== String(userData.byraId || '').trim()) {
      return res.status(403).json({ error: 'Ingen behörighet' });
    }

    const tableId = await getSamarbeteTableId(airtableAccessToken, airtableBaseId);
    if (!tableId) return res.json({ requests: [] });

    const matchesCustomer = (fields) => {
      const kundId = fields['Kund ID'];
      if (kundId === customerId) return true;
      if (Array.isArray(kundId) && kundId.includes(customerId)) return true;
      if (typeof kundId === 'string' && kundId.trim() === customerId) return true;
      const kund = fields['Kund'];
      if (Array.isArray(kund) && kund.includes(customerId)) return true;
      for (const v of Object.values(fields || {})) {
        if (v === customerId) return true;
        if (Array.isArray(v) && v.includes(customerId)) return true;
      }
      return false;
    };

    const normalizeAttachments = (raw) => {
      if (!raw) return [];
      const arr = Array.isArray(raw) ? raw : [raw];
      return arr.filter(Boolean).map((a) => ({
        id: a.id,
        url: a.url || null,
        filename: a.filename || a.name || 'Bifogad fil'
      })).filter((a) => a.url || a.id);
    };

    const getAttachmentField = (fields) => {
      const v = fields['Svar bifogad fil'];
      if (v !== undefined && v !== null) return v;
      const key = Object.keys(fields || {}).find((k) => (k || '').toLowerCase().includes('bifogad'));
      return key ? fields[key] : undefined;
    };

    const mapRecord = (r) => {
      const fields = r.fields || {};
      const rawAtt = getAttachmentField(fields);
      return {
        id: r.id,
        token: fields['Token'],
        customerId: fields['Kund ID'] || (fields['Kund'] && fields['Kund'][0]),
        recipientName: fields['Mottagare namn'],
        recipientEmail: fields['Mottagare e-post'],
        type: fields['Typ'],
        customerMessage: fields['Meddelande'] || '',
        title: fields['Titel'],
        status: fields['Status'] || 'Väntar',
        fromUppdrag: !!fields['Skapad från uppdrag'] || !!fields['Uppdrag ID'],
        uppdragId: fields['Uppdrag ID'] || null,
        uppdragTyp: fields['Uppdrag typ'] || null,
        uppdragPeriod: fields['Uppdrag period'] || null,
        uppdragskorningId: fields['Uppdragskörning ID'] || null,
        createdAt: r.createdTime,
        deadline: fields['Deadline'] || fields['deadline'] || null,
        responseText: fields['Svar text'],
        responseAttachment: normalizeAttachments(rawAtt),
        answeredAt: fields['Besvarad'],
        closed: !!fields['Stängd'],
        archived: (fields['Status'] || '') === 'Arkiverad'
      };
    };

    let records = [];
    const escaped = String(customerId).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const formula = encodeURIComponent(`{Kund ID} = "${escaped}"`);
    const fetchAllAndFilter = async () => {
      const fallbackRes = await axios.get(
        `https://api.airtable.com/v0/${airtableBaseId}/${tableId}?pageSize=100`,
        { headers: { Authorization: `Bearer ${airtableAccessToken}` } }
      );
      const allRecords = fallbackRes.data.records || [];
      return allRecords.filter(r => matchesCustomer(r.fields || {}));
    };

    try {
      const listRes = await axios.get(
        `https://api.airtable.com/v0/${airtableBaseId}/${tableId}?filterByFormula=${formula}&pageSize=100`,
        { headers: { Authorization: `Bearer ${airtableAccessToken}` } }
      );
      records = listRes.data.records || [];
      if (records.length === 0) {
        records = await fetchAllAndFilter();
      }
    } catch (formulaErr) {
      if (formulaErr.response && formulaErr.response.status === 422) {
        try {
          records = await fetchAllAndFilter();
        } catch (fallbackErr) {
          console.warn('GET /api/samarbete/requests fallback:', fallbackErr.message);
        }
      } else {
        throw formulaErr;
      }
    }

    records.sort((a, b) => (new Date(b.createdTime || 0)).getTime() - (new Date(a.createdTime || 0)).getTime());
    const requests = records.map(mapRecord);
    res.json({ requests });
  } catch (error) {
    const msg = error.response?.data?.error?.message || error.message;
    console.error('GET /api/samarbete/requests:', msg);
    res.status(error.response?.status === 404 ? 404 : 500).json({ error: msg });
  }
});

// GET /api/samarbete/request/:token – Hämta förfrågan för kundsvar (publik, ingen auth)
app.get('/api/samarbete/request/:token', async (req, res) => {
  try {
    const token = (req.params.token || '').trim();
    if (!token) return res.status(400).json({ error: 'Token saknas' });
    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
    const airtableBaseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
    if (!airtableAccessToken) return res.status(500).json({ error: 'Airtable token saknas' });

    const tableId = await getSamarbeteTableId(airtableAccessToken, airtableBaseId);
    if (!tableId) return res.status(404).json({ error: 'Förfrågan hittades inte' });

    const formula = encodeURIComponent(`{Token} = "${token.replace(/"/g, '\\"')}"`);
    const listRes = await axios.get(
      `https://api.airtable.com/v0/${airtableBaseId}/${tableId}?filterByFormula=${formula}&maxRecords=1`,
      { headers: { Authorization: `Bearer ${airtableAccessToken}` } }
    );
    const record = (listRes.data.records || [])[0];
    if (!record) return res.status(404).json({ error: 'Förfrågan hittades inte' });
    const fields = record.fields || {};
    if (fields['Stängd']) return res.status(410).json({ error: 'Denna förfrågan är avslutad. Du kan inte längre lämna eller se underlag här.' });

    const responseText = fields['Svar text'] || '';
    let rawAtt = fields['Svar bifogad fil'];
    if (rawAtt === undefined) {
      const k = Object.keys(fields || {}).find((x) => (x || '').toLowerCase().includes('bifogad'));
      rawAtt = k ? fields[k] : undefined;
    }
    const normalizeAttachmentsForRequest = (raw) => {
      if (!raw) return [];
      const arr = Array.isArray(raw) ? raw : [raw];
      return arr.filter(Boolean).map((a) => ({ id: a.id, url: a.url || null, filename: a.filename || a.name || 'Bifogad fil' })).filter((a) => a.url || a.id);
    };
    const existingAttachments = normalizeAttachmentsForRequest(rawAtt);
    let existingAnswers = null;
    if (responseText.trim().startsWith('[')) {
      try { existingAnswers = JSON.parse(responseText); } catch (_) {}
    }

    let byraLogoUrl = null;
    const customerId = fields['Kund ID'] != null
      ? (Array.isArray(fields['Kund ID']) ? fields['Kund ID'][0] : fields['Kund ID'])
      : null;
    const KUNDDATA_TABLE_ID = 'tblOIuLQS2DqmOQWe';
    const BYRAER_TABLE_ID = process.env.BYRAER_TABLE_ID || 'tblAIu1A83AyRTQ3B';
    if (customerId && typeof customerId === 'string' && customerId.trim()) {
      try {
        const kundRes = await axios.get(
          `https://api.airtable.com/v0/${airtableBaseId}/${KUNDDATA_TABLE_ID}/${customerId.trim()}`,
          { headers: { Authorization: `Bearer ${airtableAccessToken}` } }
        );
        const kundFields = kundRes.data.fields || {};
        let byraId = kundFields['Byrå ID'] ?? kundFields['Byra ID'] ?? kundFields['ByraID'];
        if (Array.isArray(byraId)) byraId = byraId[0];
        if (byraId != null && String(byraId).trim()) {
          const byraIdStr = String(byraId).trim();
          const byraNum = parseInt(byraIdStr, 10);
          const byraFormula = isNaN(byraNum)
            ? `{Byrå ID}="${byraIdStr.replace(/"/g, '\\"')}"`
            : `OR({Byrå ID}="${byraIdStr}",{Byrå ID}=${byraNum})`;
          const byraRes = await axios.get(
            `https://api.airtable.com/v0/${airtableBaseId}/${BYRAER_TABLE_ID}?filterByFormula=${encodeURIComponent(byraFormula)}&maxRecords=1`,
            { headers: { Authorization: `Bearer ${airtableAccessToken}` } }
          );
          const byraRecord = (byraRes.data.records || [])[0];
          const logga = (byraRecord && (byraRecord.fields || {})['Logga']);
          const loggaArr = Array.isArray(logga) ? logga : (logga ? [logga] : []);
          const firstAtt = loggaArr[0];
          if (firstAtt && firstAtt.url) byraLogoUrl = firstAtt.url;
        }
      } catch (e) {
        if (e.response && e.response.status !== 404) console.warn('GET /api/samarbete/request/:token byra logo:', e.message);
      }
    }

    res.json({
      token,
      title: fields['Titel'] || 'Underlag',
      type: fields['Typ'] || 'Filer',
      recipientName: fields['Mottagare namn'],
      deadline: fields['Deadline'] || null,
      existingAnswers: Array.isArray(existingAnswers) ? existingAnswers : null,
      existingAttachments,
      byraLogoUrl: byraLogoUrl || undefined
    });
  } catch (error) {
    const msg = error.response?.data?.error?.message || error.message;
    console.error('GET /api/samarbete/request/:token:', msg);
    res.status(error.response?.status === 404 ? 404 : 500).json({ error: msg });
  }
});

// ============================================================
// Samarbete – automatiska påminnelser (deadline)
// ============================================================
function stockholmDateStr(d = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
    const y = parts.find(p => p.type === 'year')?.value;
    const mo = parts.find(p => p.type === 'month')?.value;
    const da = parts.find(p => p.type === 'day')?.value;
    if (y && mo && da) return `${y}-${mo}-${da}`;
  } catch (_) {}
  return new Date(d).toISOString().slice(0, 10);
}

function parseDateOnly(s) {
  if (!s) return null;
  const str = String(s).trim();
  if (!str) return null;
  const m = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const d = new Date(str);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function addDays(dateOnly, days) {
  const d = new Date(dateOnly + 'T00:00:00Z');
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function sendSamarbeteReminderEmail({ toEmail, toName, senderName, senderByra, senderLogoUrl, items, isOverdue }) {
  const host = (process.env.SMTP_HOST || '').trim();
  const user = (process.env.SMTP_USER || '').trim();
  const passRaw = process.env.SMTP_PASS ?? process.env.SMTP_PASSWORD;
  const pass = typeof passRaw === 'string' ? passRaw.replace(/^["']|["']$/g, '').trim() : '';
  if (!host || !user || !pass) return { sent: false, error: 'SMTP ej konfigurerad' };

  const from = process.env.MAIL_FROM || 'ClientFlow Underlag <noreply@clientflow.se>';
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;

  const escapeHtml = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const safeToName = escapeHtml(String(toName || 'Kund'));
  const safeSenderName = escapeHtml(String(senderName || 'Vi'));
  const safeSenderByra = escapeHtml(String(senderByra || '').trim());

  const intro = isOverdue
    ? 'Det finns en eller flera förfrågningar där deadline har passerat.'
    : 'Påminnelse: det finns en eller flera förfrågningar med deadline imorgon.';

  const listHtml = (items || []).map((it) => {
    const t = escapeHtml(it.title || 'Underlag');
    const dl = it.deadline ? escapeHtml(it.deadlineSv || it.deadline) : '';
    const link = escapeHtml(it.respondUrl || '');
    return `
      <div style="margin:0 0 12px 0; padding:12px 14px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px;">
        <div style="font-weight:600; color:#0f172a; margin-bottom:6px;">${t}</div>
        ${dl ? `<div style="font-size:0.9rem; color:#334155; margin-bottom:8px;"><strong>Deadline:</strong> ${dl}</div>` : ''}
        <a href="${link}" style="display:inline-block; padding:10px 14px; background:#6366f1; color:#fff; text-decoration:none; border-radius:8px; font-weight:600; font-size:0.95rem;">Öppna och svara</a>
      </div>
    `;
  }).join('');

  const logoImgInline = senderLogoUrl && senderLogoUrl.startsWith('http')
    ? `<img src="${escapeHtml(senderLogoUrl)}" alt="" style="max-height:73px; max-width:260px; object-fit:contain; display:inline-block;" />`
    : '';

  const senderLine = safeSenderByra
    ? `${safeSenderName} på ${safeSenderByra}`
    : safeSenderName;

  const subject = isOverdue
    ? `Påminnelse: deadline har passerat (${senderLine})`
    : `Påminnelse: deadline imorgon (${senderLine})`;

  const html = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0; padding:0; font-family:Inter,system-ui,-apple-system,Segoe UI,sans-serif; background:#f0f4ff; color:#1e293b;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f0f4ff;">
    <tr><td style="padding:32px 16px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px; margin:0 auto; background:#fff; border-radius:12px; box-shadow:0 4px 20px rgba(0,0,0,0.08); overflow:hidden;">
        <tr><td style="background:#fff; padding:24px 28px; text-align:center; border-bottom:1px solid #e5e7eb;">
          ${logoImgInline || '<span style="font-size:0.85rem; color:#94a3b8;">—</span>'}
        </td></tr>
        <tr><td style="padding:28px;">
          <p style="margin:0 0 10px 0; font-size:1rem; line-height:1.5; color:#334155;">Hej ${safeToName},</p>
          <p style="margin:0 0 18px 0; font-size:1rem; line-height:1.5; color:#475569;">${escapeHtml(intro)}</p>
          ${listHtml}
          <p style="margin:18px 0 0 0; font-size:0.8rem; color:#94a3b8;">Detta är en automatisk påminnelse från ClientFlow.</p>
        </td></tr>
        <tr><td style="padding:20px 28px 16px; background:#f8fafc; border-top:1px solid #e2e8f0; text-align:center;">
          <div style="font-family:Inter, sans-serif; color:#6366f1; font-size:1rem; font-weight:600; letter-spacing:-0.02em; margin-bottom:10px;">Client<span style="font-weight:700;">Flow</span></div>
          <p style="margin:0; font-size:0.75rem; color:#94a3b8;">Systemstöd för redovisnings- och revisionsbyråer.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  try {
    const transporterOpts = { host, port, secure, auth: user && pass ? { user, pass } : undefined };
    if (port === 587 && !secure) transporterOpts.requireTLS = true;
    const transporter = nodemailer.createTransport(transporterOpts);
    await transporter.sendMail({ from, to: toEmail, subject, html, text: `${intro}\n\n` + (items || []).map(it => `- ${it.title || 'Underlag'}${it.deadline ? ` (Deadline: ${it.deadlineSv || it.deadline})` : ''}\n  ${it.respondUrl || ''}`).join('\n') });
    return { sent: true };
  } catch (err) {
    return { sent: false, error: err.message };
  }
}

async function processSamarbeteReminders() {
  const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
  const airtableBaseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
  if (!airtableAccessToken) return;

  const today = stockholmDateStr(new Date());
  const tableId = await getSamarbeteTableId(airtableAccessToken, airtableBaseId);
  if (!tableId) return;

  // Säkerställ att fältet "Senast påminnelse skickad" finns, annars kan vi inte dedup:a.
  // (Utan detta kan Render-omstarter orsaka flera mejl samma dag.)
  try {
    await ensureSamarbeteFieldsExist({ airtableAccessToken, airtableBaseId, samarbeteTableId: tableId });
  } catch (_) {}

  // Hämta poster med deadline (försök med filterByFormula, fallback till all+filter)
  const fetchAll = async () => {
    const res = await axios.get(`https://api.airtable.com/v0/${airtableBaseId}/${tableId}?pageSize=100`, { headers: { Authorization: `Bearer ${airtableAccessToken}` } });
    return res.data.records || [];
  };

  const tryFiltered = async () => {
    const formula = encodeURIComponent(`AND({Deadline}!='', {Status}!='Besvarad')`);
    const res = await axios.get(`https://api.airtable.com/v0/${airtableBaseId}/${tableId}?filterByFormula=${formula}&pageSize=100`, { headers: { Authorization: `Bearer ${airtableAccessToken}` } });
    return res.data.records || [];
  };

  let records = [];
  try {
    records = await tryFiltered();
  } catch (e) {
    records = await fetchAll();
  }

  const dueByEmail = new Map();
  for (const r of records) {
    const f = r.fields || {};
    if (!f['Deadline']) continue;
    if (f['Stängd']) continue;
    const status = (f['Status'] || '').toString();
    if (status === 'Besvarad' || status === 'Arkiverad') continue;

    const deadline = parseDateOnly(f['Deadline']);
    if (!deadline) continue;

    const createdDate = parseDateOnly(r.createdTime);
    const lastSent = parseDateOnly(f['Senast påminnelse skickad'] || f['Last reminder date'] || f['Last reminder'] || '');
    if (lastSent === today) continue;

    const dayBefore = addDays(deadline, -1);
    const isOverdue = today > deadline;
    const isDayBefore = (today === dayBefore);
    if (!isOverdue && !isDayBefore) continue;

    // Ingen "dagen innan"-påminnelse om deadline är samma dag som förfrågan skapades.
    if (isDayBefore && createdDate && createdDate === deadline) continue;

    const toEmail = (f['Mottagare e-post'] || '').toString().trim();
    if (!toEmail || !toEmail.includes('@')) continue;

    const baseUrl = (process.env.PUBLIC_BASE_URL || '').toString().trim() || 'https://www.app.clientflow.se';
    const token = (f['Token'] || '').toString().trim();
    const respondUrl = token ? `${baseUrl}/samarbete-svar.html?token=${encodeURIComponent(token)}` : '';

    const deadlineSv = (() => {
      try { return new Date(deadline + 'T00:00:00Z').toLocaleDateString('sv-SE'); } catch { return deadline; }
    })();

    const item = { recordId: r.id, title: f['Titel'] || 'Underlag', deadline, deadlineSv, respondUrl };
    const existing = dueByEmail.get(toEmail) || { toEmail, toName: (f['Mottagare namn'] || 'Kund'), items: [], isOverdue };
    existing.items.push(item);
    // Om någon i samma email är overdue => överdue-mail (hårdare) annars day-before
    existing.isOverdue = existing.isOverdue || isOverdue;
    dueByEmail.set(toEmail, existing);
  }

  if (dueByEmail.size === 0) return;

  // Skicka max ett mejl per e-post per dag.
  // Viktigt: markera "Senast påminnelse skickad" FÖRE utskick.
  // Om vi inte kan markera (t.ex. fält saknas / patch nekas) så skickar vi inte,
  // annars kan kunden bli spammad vid server-omstarter.
  for (const group of dueByEmail.values()) {
    const markSentForRecord = async (recordId) => {
      try {
        await axios.patch(
          `https://api.airtable.com/v0/${airtableBaseId}/${tableId}/${recordId}`,
          { fields: { 'Senast påminnelse skickad': today } },
          { headers: { Authorization: `Bearer ${airtableAccessToken}`, 'Content-Type': 'application/json' } }
        );
        return true;
      } catch (e) {
        const status = e.response?.status;
        const msg = e.response?.data?.error?.message || e.message;
        const unknownField = status === 422 && /Unknown field name:\s*"?Senast påminnelse skickad"?/i.test(String(msg));
        if (unknownField) {
          try {
            await ensureSamarbeteFieldsExist({ airtableAccessToken, airtableBaseId, samarbeteTableId: tableId });
            await axios.patch(
              `https://api.airtable.com/v0/${airtableBaseId}/${tableId}/${recordId}`,
              { fields: { 'Senast påminnelse skickad': today } },
              { headers: { Authorization: `Bearer ${airtableAccessToken}`, 'Content-Type': 'application/json' } }
            );
            return true;
          } catch (_) {
            return false;
          }
        }
        return false;
      }
    };

    // Markera innan vi skickar (minskar risk för dubbletter vid omstart / parallella instanser).
    const markResults = await Promise.all((group.items || []).map(it => markSentForRecord(it.recordId)));
    const anyMarked = markResults.some(Boolean);
    if (!anyMarked) {
      console.warn('processSamarbeteReminders: kunde inte markera "Senast påminnelse skickad" – skippar utskick för', group.toEmail);
      continue;
    }

    // Försök hämta byrå-logga via första kund-id (best-effort)
    let senderLogoUrl;
    let senderByra;
    let senderName = 'ClientFlow';
    try {
      const firstRecId = group.items[0]?.recordId;
      if (firstRecId) {
        // Läs posten igen för att få Kund ID och ev. byrå ID
        const recRes = await axios.get(`https://api.airtable.com/v0/${airtableBaseId}/${tableId}/${firstRecId}`, { headers: { Authorization: `Bearer ${airtableAccessToken}` } });
        const rf = recRes.data.fields || {};
        const customerId = rf['Kund ID'] != null ? (Array.isArray(rf['Kund ID']) ? rf['Kund ID'][0] : rf['Kund ID']) : null;
        if (customerId) {
          const kundRes = await axios.get(`https://api.airtable.com/v0/${airtableBaseId}/tblOIuLQS2DqmOQWe/${customerId}`, { headers: { Authorization: `Bearer ${airtableAccessToken}` } });
          const kundFields = kundRes.data.fields || {};
          let byraId = kundFields['Byrå ID'] ?? kundFields['Byra ID'] ?? kundFields['ByraID'];
          if (Array.isArray(byraId)) byraId = byraId[0];
          if (byraId != null && String(byraId).trim()) {
            const byraIdStr = String(byraId).trim();
            const byraNum = parseInt(byraIdStr, 10);
            const byraFormula = isNaN(byraNum)
              ? `{Byrå ID}="${byraIdStr.replace(/"/g, '\\"')}"`
              : `OR({Byrå ID}="${byraIdStr}",{Byrå ID}=${byraNum})`;
            const byraRes = await axios.get(`https://api.airtable.com/v0/${airtableBaseId}/${process.env.BYRAER_TABLE_ID || 'tblAIu1A83AyRTQ3B'}?filterByFormula=${encodeURIComponent(byraFormula)}&maxRecords=1`, { headers: { Authorization: `Bearer ${airtableAccessToken}` } });
            const byraRecord = (byraRes.data.records || [])[0];
            senderByra = (byraRecord?.fields || {})['Namn'] || undefined;
            const logga = (byraRecord && (byraRecord.fields || {})['Logga']);
            const loggaArr = Array.isArray(logga) ? logga : (logga ? [logga] : []);
            const firstAtt = loggaArr[0];
            if (firstAtt && firstAtt.url) senderLogoUrl = firstAtt.url;
          }
        }
      }
    } catch (_) {}

    const result = await sendSamarbeteReminderEmail({
      toEmail: group.toEmail,
      toName: group.toName,
      senderName,
      senderByra,
      senderLogoUrl,
      items: group.items,
      isOverdue: !!group.isOverdue
    });
    if (!result.sent) {
      // Vi har redan markerat "skickad idag" för att undvika spam.
      // Om mejlet misslyckades vill vi inte försöka igen samma dag automatiskt.
      continue;
    }
  }
}

// Kör påminnelser regelbundet (Render kan sova – men skyddas med "senast skickad" och max en per dag/e-post).
if (!global.__clientflowSamarbeteReminderStarted) {
  global.__clientflowSamarbeteReminderStarted = true;
  setTimeout(() => { processSamarbeteReminders().catch(() => {}); }, 15000);
  setInterval(() => { processSamarbeteReminders().catch(() => {}); }, 60 * 60 * 1000);
}

// ============================================================
// Uppdrag → schemalagda underlagsförfrågningar (Samarbete)
// ============================================================
function clampDay(d) {
  const n = parseInt(d, 10);
  if (!Number.isFinite(n)) return null;
  if (n < 1) return 1;
  if (n > 28) return 28;
  return n;
}

function monthAdd(yyyyMm, delta) {
  const m = String(yyyyMm || '').match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10) - 1;
  const d = new Date(Date.UTC(y, mo + (delta || 0), 1));
  const yy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${yy}-${mm}`;
}

function monthLabelSv(yyyyMm) {
  const m = String(yyyyMm || '').match(/^(\d{4})-(\d{2})$/);
  if (!m) return '';
  const d = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, 1);
  return d.toLocaleDateString('sv-SE', { month: 'long', year: 'numeric' });
}

function currentQuarterFromYm(yyyyMm) {
  const m = String(yyyyMm || '').match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  if (!Number.isFinite(y) || !Number.isFinite(mo)) return null;
  const q = Math.ceil(mo / 3);
  return { year: y, quarter: q };
}

function prevQuarterKeyFromYm(yyyyMm) {
  const cur = currentQuarterFromYm(yyyyMm);
  if (!cur) return null;
  let { year, quarter } = cur;
  quarter -= 1;
  if (quarter <= 0) {
    quarter = 4;
    year -= 1;
  }
  return `${year}-Q${quarter}`;
}

function quarterLabelSv(qKey) {
  const m = String(qKey || '').match(/^(\d{4})-Q([1-4])$/);
  if (!m) return '';
  return `Kvartal ${m[2]} ${m[1]}`;
}

const MOMS_MONTHS_SV = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december'];

function momsParseYm(ym) {
  const m = String(ym || '').match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  if (!Number.isFinite(year) || month < 1 || month > 12) return null;
  return { year, month };
}

function momsParseQuarterKey(qKey) {
  const m = String(qKey || '').match(/^(\d{4})-Q([1-4])$/i);
  if (!m) return null;
  return { year: parseInt(m[1], 10), quarter: parseInt(m[2], 10) };
}

function momsQuarterAdd(qKey, delta) {
  const p = momsParseQuarterKey(qKey);
  if (!p) return null;
  let { year, quarter } = p;
  quarter += (delta || 0);
  while (quarter > 4) { quarter -= 4; year += 1; }
  while (quarter < 1) { quarter += 4; year -= 1; }
  return `${year}-Q${quarter}`;
}

function momsPeriodEndFromKey(periodKey, freq) {
  const f = String(freq || '').toLowerCase();
  if (f.includes('kvartal')) {
    const q = momsParseQuarterKey(periodKey);
    if (!q) return null;
    return { year: q.year, month: q.quarter * 3 };
  }
  return momsParseYm(periodKey);
}

function momsStartIsoFromPeriodKey(periodKey, freq) {
  const end = momsPeriodEndFromKey(periodKey, freq);
  if (!end) return '';
  let y = end.year;
  let m = end.month + 1;
  if (m > 12) { m = 1; y += 1; }
  return `${y}-${String(m).padStart(2, '0')}-01`;
}

function momsDeadlineIsoFromPeriodKey(periodKey, freq) {
  const end = momsPeriodEndFromKey(periodKey, freq);
  if (!end) return '';
  let y = end.year;
  let m = end.month + 1;
  if (m > 12) { m = 1; y += 1; }
  const day = (m === 1 || m === 8) ? 17 : 12;
  return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function momsDisplayLabel(periodKey, freq) {
  const f = String(freq || '').toLowerCase();
  if (f.includes('kvartal')) {
    const q = momsParseQuarterKey(periodKey);
    if (q) return `Momsredovisning Q${q.quarter} ${q.year}`;
  }
  const ym = momsParseYm(periodKey);
  if (ym) return `Momsredovisning ${MOMS_MONTHS_SV[ym.month - 1]} ${ym.year}`;
  return 'Momsredovisning';
}

function momsPeriodKeysAhead(firstPeriodKey, freq, count) {
  const f = String(freq || '').toLowerCase();
  const n = count || (f.includes('kvartal') ? 4 : 12);
  const keys = [];
  let pk = firstPeriodKey;
  for (let i = 0; i < n; i++) {
    if (!pk) break;
    keys.push(pk);
    pk = f.includes('kvartal') ? momsQuarterAdd(pk, 1) : monthAdd(pk, 1);
  }
  return keys;
}

function momsInferFirstPeriod(fields, freq) {
  const stored = String(fields['Första period'] || '').trim();
  if (stored) return stored;
  const start = toIsoDate(fields['Startdatum'] || '');
  if (start) {
    const f = String(freq || '').toLowerCase();
    if (f.includes('kvartal')) {
      const ym = start.slice(0, 7);
      const q = currentQuarterFromYm(ym);
      if (q) {
        let qq = q.quarter - 1;
        let yy = q.year;
        if (qq <= 0) { qq = 4; yy -= 1; }
        return `${yy}-Q${qq}`;
      }
    }
    const prev = monthAdd(start.slice(0, 7), -1);
    if (prev) return prev;
  }
  return null;
}

async function sendSamarbeteDigestEmail({ toEmail, toName, senderByra, senderLogoUrl, items }) {
  const host = (process.env.SMTP_HOST || '').trim();
  const user = (process.env.SMTP_USER || '').trim();
  const passRaw = process.env.SMTP_PASS ?? process.env.SMTP_PASSWORD;
  const pass = typeof passRaw === 'string' ? passRaw.replace(/^["']|["']$/g, '').trim() : '';
  if (!host || !user || !pass) return { sent: false, error: 'SMTP ej konfigurerad' };

  const from = process.env.MAIL_FROM || 'ClientFlow Underlag <noreply@clientflow.se>';
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;
  const escapeHtml = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const safeToName = escapeHtml(String(toName || 'Kund'));
  const safeByra = escapeHtml(String(senderByra || '').trim());
  const logoImgInline = senderLogoUrl && senderLogoUrl.startsWith('http')
    ? `<img src="${escapeHtml(senderLogoUrl)}" alt="" style="max-height:73px; max-width:260px; object-fit:contain; display:inline-block;" />`
    : '';

  const subject = safeByra ? `Underlagsförfrågningar från ${safeByra}` : 'Underlagsförfrågningar via ClientFlow';
  const listHtml = (items || []).map(it => `
    <div style="margin:0 0 12px 0; padding:12px 14px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px;">
      <div style="font-weight:600; color:#0f172a; margin-bottom:6px;">${escapeHtml(it.title || 'Underlag')}</div>
      ${it.deadlineSv ? `<div style="font-size:0.9rem; color:#334155; margin-bottom:8px;"><strong>Deadline:</strong> ${escapeHtml(it.deadlineSv)}</div>` : ''}
      <a href="${escapeHtml(it.respondUrl || '')}" style="display:inline-block; padding:10px 14px; background:#6366f1; color:#fff; text-decoration:none; border-radius:8px; font-weight:600; font-size:0.95rem;">Öppna och svara</a>
    </div>
  `).join('');

  const html = `
<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0; padding:0; font-family:Inter,system-ui,-apple-system,Segoe UI,sans-serif; background:#f0f4ff; color:#1e293b;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f0f4ff;">
    <tr><td style="padding:32px 16px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px; margin:0 auto; background:#fff; border-radius:12px; box-shadow:0 4px 20px rgba(0,0,0,0.08); overflow:hidden;">
        <tr><td style="background:#fff; padding:24px 28px; text-align:center; border-bottom:1px solid #e5e7eb;">${logoImgInline || '<span style="font-size:0.85rem; color:#94a3b8;">—</span>'}</td></tr>
        <tr><td style="padding:28px;">
          <p style="margin:0 0 10px 0; font-size:1rem; line-height:1.5; color:#334155;">Hej ${safeToName},</p>
          <p style="margin:0 0 18px 0; font-size:1rem; line-height:1.5; color:#475569;">Du har nya underlagsförfrågningar via ClientFlow.</p>
          ${listHtml}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  try {
    const transporterOpts = { host, port, secure, auth: { user, pass } };
    if (port === 587 && !secure) transporterOpts.requireTLS = true;
    const transporter = nodemailer.createTransport(transporterOpts);
    await transporter.sendMail({ from, to: toEmail, subject, html, text: (items || []).map(it => `- ${it.title || 'Underlag'}${it.deadlineSv ? ` (Deadline: ${it.deadlineSv})` : ''}\n  ${it.respondUrl || ''}`).join('\n') });
    return { sent: true };
  } catch (err) {
    return { sent: false, error: err.message };
  }
}

async function processUppdragUnderlagSchedule() {
  const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
  const airtableBaseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
  if (!airtableAccessToken) return;

  const toIsoDate = (v) => {
    const s = String(v || '').slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
  };

  // Försök säkerställa att Uppdrag-tabellen har fälten (kräver schema-token). Körs tyst.
  try {
    const t = await getUppdragTableMeta(airtableAccessToken, airtableBaseId);
    if (t && t.id) {
      const existingNames = (t.fields || []).map(f => (f.name || '').trim());
      const missing = UPPDRAG_REQUIRED_FIELDS.filter(f => !existingNames.includes((f.name || '').trim()));
      if (missing.length) {
        const createUrl = `https://api.airtable.com/v0/meta/bases/${airtableBaseId}/tables/${t.id}/fields`;
        for (const field of missing) {
          try {
            const body = { name: field.name, type: field.type };
            if (field.description) body.description = field.description;
            if (field.options) body.options = field.options;
            // eslint-disable-next-line no-await-in-loop
            await axios.post(createUrl, body, { headers: { Authorization: `Bearer ${airtableAccessToken}`, 'Content-Type': 'application/json' }, timeout: 10000 });
          } catch (_) {}
        }
      }
    }
  } catch (_) {}

  // Försök säkerställa att Uppdragskörningar-tabellen har fälten (kräver schema-token). Körs tyst.
  try {
    const t = await getUppdragRunsTableMeta(airtableAccessToken, airtableBaseId);
    if (t && t.id) {
      const existingNames = (t.fields || []).map(f => (f.name || '').trim());
      const missing = UPPDRAG_RUNS_REQUIRED_FIELDS.filter(f => !existingNames.includes((f.name || '').trim()));
      if (missing.length) {
        const createUrl = `https://api.airtable.com/v0/meta/bases/${airtableBaseId}/tables/${t.id}/fields`;
        for (const field of missing) {
          try {
            const body = { name: field.name, type: field.type };
            if (field.description) body.description = field.description;
            if (field.options) body.options = field.options;
            // eslint-disable-next-line no-await-in-loop
            await axios.post(createUrl, body, { headers: { Authorization: `Bearer ${airtableAccessToken}`, 'Content-Type': 'application/json' }, timeout: 10000 });
          } catch (_) {}
        }
      }
    }
  } catch (_) {}

  const todayIso = stockholmDateStr(new Date()); // YYYY-MM-DD
  const todayDay = parseInt(todayIso.slice(8, 10), 10);
  const todayYm = todayIso.slice(0, 7);
  const todayYear = todayIso.slice(0, 4);

  const uppdragTableIdOrName = process.env.AIRTABLE_TABLE_UPPDRAG_ID || encodeURIComponent(UPPDRAG_TABLE_NAME);
  const uppdragUrl = `https://api.airtable.com/v0/${airtableBaseId}/${uppdragTableIdOrName}`;

  const uppdragRunsTableId = await resolveUppdragRunsTableId(airtableAccessToken, airtableBaseId);
  const uppdragRunsUrl = uppdragRunsTableId
    ? `https://api.airtable.com/v0/${airtableBaseId}/${uppdragRunsTableId}`
    : null;
  if (!uppdragRunsUrl) {
    console.warn(`processUppdragUnderlagSchedule: tabellen "${UPPDRAG_RUNS_TABLE_NAME}" saknas – körningar skapas inte förrän tabellen installeras.`);
  }

  const fetchAll = async () => {
    const res = await axios.get(`${uppdragUrl}?pageSize=100`, { headers: { Authorization: `Bearer ${airtableAccessToken}` } });
    return res.data.records || [];
  };
  const fetchActive = async () => {
    const formula = encodeURIComponent(`{Status}="Aktiv"`);
    const res = await axios.get(`${uppdragUrl}?filterByFormula=${formula}&pageSize=100`, { headers: { Authorization: `Bearer ${airtableAccessToken}` } });
    return res.data.records || [];
  };

  let uppdragRecords = [];
  try { uppdragRecords = await fetchActive(); } catch (_) { uppdragRecords = await fetchAll(); }

  // Säkerställ att körningar finns 12 månader framåt (per uppdrag och frekvens).
  // Körs innan vi skapar dagens auto-underlag så att vi alltid kan koppla till en körning.
  const ensureRunsAheadForUppdrag = async (uppdragRec) => {
    const r = uppdragRec;
    const f = r?.fields || {};
    const uppdragId = String(r?.id || '').trim();
    if (!uppdragId) return;
    if ((f['Status'] || 'Aktiv') !== 'Aktiv') return;
    const typ = String(f['Typ'] || '').trim();
    if (!typ) return;
    const freq = String(f['Frekvens'] || '').trim();
    const deadline0 = toIsoDate(f['Nästa deadline'] || '');
    const freqLow = freq.toLowerCase();
    const isMomsSched = typ === 'Momsredovisning' && (freqLow.includes('månad') || freqLow.includes('kvartal'));
    if (!deadline0 && !isMomsSched) return;

    const horizonEnd = addMonthsIso(todayIso, 12) || todayIso;
    const horizonYm = horizonEnd.slice(0, 7);

    if (!uppdragRunsUrl) return;

    // Hämta existerande körningar för uppdraget
    const existing = new Set();
    try {
      const formula = encodeURIComponent(`{Uppdrag ID} = "${uppdragId.replace(/"/g, '\\"')}"`);
      const res = await axios.get(`${uppdragRunsUrl}?filterByFormula=${formula}&pageSize=100`, { headers: { Authorization: `Bearer ${airtableAccessToken}` } });
      (res.data.records || []).forEach(rr => {
        const key = String(rr?.fields?.['Run Key'] || '').trim();
        if (key) existing.add(key);
      });
    } catch (_) {}

    const nowIso = new Date().toISOString();
    const createRun = async ({ periodKey, periodLabel, deadlineIso }) => {
      const runKey = `${uppdragId}:${periodKey}`;
      if (existing.has(runKey)) return;
      try {
        await axios.post(
          uppdragRunsUrl,
          {
            fields: {
              'Run Key': runKey,
              'Uppdrag ID': uppdragId,
              'Kund ID': String(f['Kund ID'] || '').trim(),
              'Byrå ID': String(f['Byrå ID'] || '').trim(),
              'Typ': typ,
              'Frekvens': freq,
              'PeriodKey': periodKey,
              'Period Label': periodLabel,
              'Deadline': deadlineIso,
              'Status': 'Planerad',
              'Skapad': nowIso,
              'Uppdaterad': nowIso
            }
          },
          { headers: { Authorization: `Bearer ${airtableAccessToken}`, 'Content-Type': 'application/json' } }
        );
        existing.add(runKey);
      } catch (_) {}
    };

    // Momsredovisning: SKV-deadlines + tydliga periodetiketter, 12 månader (eller 4 kvartal) framåt.
    if (typ === 'Momsredovisning' && (freqLow.includes('månad') || freqLow.includes('kvartal'))) {
      let firstPk = momsInferFirstPeriod(f, freq);
      if (!firstPk) firstPk = freqLow.includes('kvartal') ? `${todayYear}-Q${Math.ceil(parseInt(todayYm.slice(5, 7), 10) / 3)}` : todayYm;
      const keys = momsPeriodKeysAhead(firstPk, freq, freqLow.includes('kvartal') ? 4 : 12);
      for (const pk of keys) {
        const deadlineIso = momsDeadlineIsoFromPeriodKey(pk, freq);
        if (!deadlineIso) continue;
        if (deadlineIso.slice(0, 7) > horizonYm) continue;
        // eslint-disable-next-line no-await-in-loop
        await createRun({
          periodKey: pk,
          periodLabel: momsDisplayLabel(pk, freq),
          deadlineIso
        });
      }
      return;
    }

    // Övriga månadsuppdrag (t.ex. lön): 12 körningar från innevarande månad.
    if (freqLow.includes('månad')) {
      const day = parseInt(String(deadline0).slice(8, 10), 10);
      const dayClamped = (Number.isFinite(day) && day >= 1 && day <= 28) ? day : 15;
      for (let i = 0; i < 12; i++) {
        const ym = monthAdd(todayYm, i);
        if (!ym) continue;
        if (ym > horizonYm) break;
        const deadlineIso = `${ym}-${String(dayClamped).padStart(2, '0')}`;
        // eslint-disable-next-line no-await-in-loop
        await createRun({ periodKey: ym, periodLabel: monthLabelSv(ym), deadlineIso });
      }
      return;
    }

    // Kvartal/År/Engång: behåll tidigare logik (iterera från nästa deadline fram till horisont)
    let cur = deadline0;
    for (let guard = 0; guard < 40; guard++) {
      if (!cur) break;
      if (cur > horizonEnd) break;

      let periodKey = cur.slice(0, 7);
      let periodLabel = monthLabelSv(periodKey);
      if (freqLow.includes('kvartal')) {
        const q = currentQuarterFromYm(periodKey);
        periodKey = q ? `${q.year}-Q${q.quarter}` : periodKey;
        periodLabel = quarterLabelSv(periodKey) || periodLabel;
      } else if (freqLow.includes('årsvis') || freqLow.includes('år')) {
        periodKey = cur.slice(0, 4);
        periodLabel = periodKey;
      }

      // eslint-disable-next-line no-await-in-loop
      await createRun({ periodKey, periodLabel, deadlineIso: cur });
      cur = calcNextDeadline(cur, freq) || '';
    }
  };

  // Batch: kör för alla uppdrag (best effort)
  for (const r of uppdragRecords) {
    // eslint-disable-next-line no-await-in-loop
    await ensureRunsAheadForUppdrag(r);
  }

  const toCreate = [];
  for (const r of uppdragRecords) {
    const f = r.fields || {};
    if (!f['Auto underlagsförfrågan']) continue;
    if ((f['Status'] || 'Aktiv') !== 'Aktiv') continue;
    const freq = String(f['Frekvens'] || '').toLowerCase();
    if (!freq.includes('månad')) continue; // v1: månad

    const sendDay = clampDay(f['Underlagsutskick dag']);
    const deadlineDay = clampDay(f['Underlagsdeadline dag']);
    if (!sendDay || !deadlineDay) continue;
    if (todayDay !== sendDay) continue;

    const periodSel = String(f['Underlagsperiod'] || 'Föregående månad').trim();
    let periodKey = null;
    let periodLabel = '';
    if (periodSel.toLowerCase().includes('kvartal')) {
      periodKey = prevQuarterKeyFromYm(todayYm);
      periodLabel = quarterLabelSv(periodKey);
    } else if (periodSel.toLowerCase().includes('år')) {
      const y = parseInt(todayYm.slice(0, 4), 10);
      periodKey = Number.isFinite(y) ? String(y - 1) : null;
      periodLabel = periodKey || '';
    } else {
      const offset = periodSel.includes('Nästa') ? 1 : (periodSel.includes('Denna') ? 0 : -1);
      const periodYm = monthAdd(todayYm, offset);
      if (!periodYm) continue;
      periodKey = periodYm;
      periodLabel = monthLabelSv(periodKey);
    }
    if (!periodKey) continue;
    const last = String(f['Senast underlagsutskick period'] || '').trim();
    if (last === periodKey) continue;

    const recipientEmail = String(f['Underlagsmottagare e-post'] || '').trim();
    const recipientName = String(f['Underlagsmottagare namn'] || '').trim() || 'Kund';
    const template = String(f['Underlagsmall'] || '').trim();
    const customerMessage = String(f['Underlagsmeddelande'] || '').trim();
    if (!recipientEmail || !recipientEmail.includes('@') || !template) continue;

    const byraId = String(f['Byrå ID'] || '').trim();
    const customerId = String(f['Kund ID'] || '').trim();
    const typ = String(f['Typ'] || '').trim();

    const lines = template.split(/\r?\n/).map(s => s.trim()).filter(Boolean).map(s => s.replace(/\{PERIOD\}/g, periodLabel || ''));
    const title = lines.join('\n');

    const deadlineIso = `${todayYm}-${String(deadlineDay).padStart(2, '0')}`;
    const baseUrl = (process.env.PUBLIC_BASE_URL || '').toString().trim() || 'https://www.app.clientflow.se';
    const token = crypto.randomBytes(32).toString('hex');
    const respondUrl = `${baseUrl}/samarbete-svar.html?token=${encodeURIComponent(token)}`;

    // Koppla till en specifik uppdragskörning (utifrån "innevarande" körningsperiod)
    const runPeriodKey = (() => {
      const fLow = String(freq || '').toLowerCase();
      if (fLow.includes('kvartal')) {
        const q = currentQuarterFromYm(todayYm);
        return q ? `${q.year}-Q${q.quarter}` : todayYm;
      }
      if (fLow.includes('årsvis') || fLow.includes('år')) return todayYear;
      return todayYm;
    })();
    const runKey = `${r.id}:${runPeriodKey}`;
    let runRecordId = '';
    try {
      const formula = encodeURIComponent(`{Run Key} = "${runKey.replace(/"/g, '\\"')}"`);
      const rr = await axios.get(`${uppdragRunsUrl}?filterByFormula=${formula}&maxRecords=1`, { headers: { Authorization: `Bearer ${airtableAccessToken}` } });
      runRecordId = String((rr.data.records || [])[0]?.id || '').trim();
    } catch (_) {}

    toCreate.push({ uppdragId: r.id, customerId, byraId, typ, periodKey, recipientEmail, recipientName, title, token, respondUrl, deadlineIso, runRecordId });
  }

  if (!toCreate.length) return;

  const samarbeteTableId = await getSamarbeteTableId(airtableAccessToken, airtableBaseId);
  if (!samarbeteTableId) return;
  try { await ensureSamarbeteFieldsExist({ airtableAccessToken, airtableBaseId, samarbeteTableId }); } catch (_) {}

  const byEmail = new Map();
  for (const it of toCreate) {
    try {
      await axios.post(
        `https://api.airtable.com/v0/${airtableBaseId}/${samarbeteTableId}`,
        {
          fields: {
            'Kund ID': it.customerId,
            'Mottagare namn': it.recipientName,
            'Mottagare e-post': it.recipientEmail,
            'Typ': 'Filer',
            ...(customerMessage ? { 'Meddelande': customerMessage } : {}),
            'Titel': it.title,
            'Token': it.token,
            'Status': 'Väntar',
            'Skapad från uppdrag': true,
            'Uppdrag ID': it.uppdragId,
            'Uppdrag typ': it.typ,
            'Uppdrag period': it.periodKey,
            ...(it.runRecordId ? { 'Uppdragskörning ID': it.runRecordId } : {}),
            'Deadline': it.deadlineIso
          }
        },
        { headers: { Authorization: `Bearer ${airtableAccessToken}`, 'Content-Type': 'application/json' } }
      );

      await axios.patch(
        `${uppdragUrl}/${it.uppdragId}`,
        { fields: { 'Senast underlagsutskick period': it.periodKey } },
        { headers: { Authorization: `Bearer ${airtableAccessToken}`, 'Content-Type': 'application/json' } }
      );

      const group = byEmail.get(it.recipientEmail) || { toEmail: it.recipientEmail, toName: it.recipientName, byraId: it.byraId, items: [] };
      group.items.push({
        title: it.title.split('\n')[0] || `${it.typ} – ${it.periodKey}`,
        deadlineSv: (() => { try { return new Date(it.deadlineIso + 'T00:00:00Z').toLocaleDateString('sv-SE'); } catch { return it.deadlineIso; } })(),
        respondUrl: it.respondUrl
      });
      byEmail.set(it.recipientEmail, group);
    } catch (e) {
      const msg = e.response?.data?.error?.message || e.message;
      console.warn('processUppdragUnderlagSchedule create failed:', msg);
    }
  }

  for (const group of byEmail.values()) {
    let senderByra;
    let senderLogoUrl;
    try {
      const byraIdStr = String(group.byraId || '').trim();
      if (byraIdStr) {
        const byraNum = parseInt(byraIdStr, 10);
        const byraFormula = isNaN(byraNum)
          ? `{Byrå ID}="${byraIdStr.replace(/"/g, '\\"')}"`
          : `OR({Byrå ID}="${byraIdStr}",{Byrå ID}=${byraNum})`;
        const byraRes = await axios.get(
          `https://api.airtable.com/v0/${airtableBaseId}/${process.env.BYRAER_TABLE_ID || 'tblAIu1A83AyRTQ3B'}?filterByFormula=${encodeURIComponent(byraFormula)}&maxRecords=1`,
          { headers: { Authorization: `Bearer ${airtableAccessToken}` } }
        );
        const byraRecord = (byraRes.data.records || [])[0];
        senderByra = (byraRecord?.fields || {})['Namn'] || undefined;
        const logga = (byraRecord && (byraRecord.fields || {})['Logga']);
        const loggaArr = Array.isArray(logga) ? logga : (logga ? [logga] : []);
        const firstAtt = loggaArr[0];
        if (firstAtt && firstAtt.url) senderLogoUrl = firstAtt.url;
      }
    } catch (_) {}

    await sendSamarbeteDigestEmail({
      toEmail: group.toEmail,
      toName: group.toName,
      senderByra,
      senderLogoUrl,
      items: group.items
    });
  }
}

if (!global.__clientflowUppdragUnderlagScheduleStarted) {
  global.__clientflowUppdragUnderlagScheduleStarted = true;
  setTimeout(() => { processUppdragUnderlagSchedule().catch(() => {}); }, 20000);
  setInterval(() => { processUppdragUnderlagSchedule().catch(() => {}); }, 60 * 60 * 1000);
}

// POST /api/samarbete/respond – Kund lämnar svar (publik)
// Body: antingen { token, comment?, file?, filename? } eller { token, answers: [ ... ] } eller { token, answerIndex, text?, file?, filename? } för ett enskilt "Klart"-svar
app.post('/api/samarbete/respond', async (req, res) => {
  try {
    const { token, comment, file: fileBase64, filename, answers: answersArr } = req.body || {};
    const tokenStr = (token || '').trim();
    if (!tokenStr) return res.status(400).json({ error: 'Token saknas' });
    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
    const airtableBaseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
    if (!airtableAccessToken) return res.status(500).json({ error: 'Airtable token saknas' });

    const tableId = await getSamarbeteTableId(airtableAccessToken, airtableBaseId);
    if (!tableId) return res.status(404).json({ error: 'Förfrågan hittades inte' });

    const formula = encodeURIComponent(`{Token} = "${tokenStr.replace(/"/g, '\\"')}"`);
    const listRes = await axios.get(
      `https://api.airtable.com/v0/${airtableBaseId}/${tableId}?filterByFormula=${formula}&maxRecords=1`,
      { headers: { Authorization: `Bearer ${airtableAccessToken}` } }
    );
    const record = (listRes.data.records || [])[0];
    if (!record) return res.status(404).json({ error: 'Förfrågan hittades inte' });
    if ((record.fields || {})['Stängd']) {
      return res.status(410).json({ error: 'Denna förfrågan är avslutad. Du kan inte längre lämna underlag.' });
    }

    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const fields = record.fields || {};
    let svarText = '';

    // Hjälpfunktion: räkna ut om alla punkter är besvarade
    const computeStatus = (answersArray) => {
      const title = (fields['Titel'] || '').toString().trim();
      let items = [];
      let fileReq = [];
      if (title) {
        const rawLines = title
          .split('\n')
          .map(s => s.replace(/^\d+\.\s*/, '').trim())
          .filter(Boolean);
        rawLines.forEach((line) => {
          let req = /\[fil obligatorisk\]\s*$/i.test(line);
          if (req) line = line.replace(/\s*\[fil obligatorisk\]\s*$/i, '').trim();
          items.push(line);
          fileReq.push(req);
        });
      }
      const total = items.length || answersArray.length || 0;
      if (!total) return { status: 'Väntar', besvaradAt: null };
      for (let i = 0; i < total; i++) {
        const a = answersArray[i] || {};
        const hasText = a.text && String(a.text).trim().length > 0;
        const hasFile = !!a.filename;
        if (!hasText && !hasFile) {
          return { status: 'Väntar', besvaradAt: null };
        }
        if (fileReq[i] && !hasFile) {
          return { status: 'Väntar', besvaradAt: null };
        }
      }
      return { status: 'Besvarad', besvaradAt: now };
    };

    const answerIndex = req.body.answerIndex;
    if (typeof answerIndex === 'number' && answerIndex >= 0) {
      let existingAnswers = [];
      const raw = (fields['Svar text'] || '').trim();
      if (raw.startsWith('[')) {
        try { existingAnswers = JSON.parse(raw); } catch (_) {}
      }
      while (existingAnswers.length <= answerIndex) existingAnswers.push({ text: '', filename: null });
      const ex = existingAnswers[answerIndex];
      const partText = (req.body.text != null) ? String(req.body.text).trim().slice(0, 50000) : (ex && ex.text) || '';
      // Stöd för flera filer: files: [{ filename, file }]
      const filesPayload = Array.isArray(req.body.files) ? req.body.files : [];
      const primaryFilename = (filesPayload[0] && filesPayload[0].filename && String(filesPayload[0].filename).trim())
        ? String(filesPayload[0].filename).slice(0, 255)
        : (req.body.filename && String(req.body.filename).trim())
          ? String(req.body.filename).slice(0, 255)
          : (ex && ex.filename) || null;
      existingAnswers[answerIndex] = { text: partText, filename: primaryFilename };

      const filesToUpload = filesPayload.length
        ? filesPayload
        : (req.body.file && req.body.filename
            ? [{ file: req.body.file, filename: req.body.filename }]
            : []);

      let primaryUploadMeta = null;
      for (const f of filesToUpload) {
        if (!f || typeof f.file !== 'string' || !f.filename) continue;
        let buffer;
        try { buffer = Buffer.from(f.file, 'base64'); } catch (e) {
          return res.status(400).json({ error: 'Ogiltig fil' });
        }
        if (buffer.length > 15 * 1024 * 1024) return res.status(400).json({ error: 'Filen får max vara 15 MB' });
        const fname = String(f.filename);
        const contentType = fname.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream';
        const uploadedAtt = await uploadAttachmentToAirtableFieldReturnAttachment(airtableAccessToken, airtableBaseId, record.id, buffer, fname, contentType, tableId, 'Svar bifogad fil');
        if (!uploadedAtt) return res.status(502).json({ error: 'Kunde inte ladda upp filen till Airtable.' });
        if (!primaryUploadMeta) primaryUploadMeta = uploadedAtt;
      }
      if (primaryUploadMeta) {
        existingAnswers[answerIndex] = {
          ...existingAnswers[answerIndex],
          attachmentId: primaryUploadMeta.id || null,
          attachmentUrl: primaryUploadMeta.url || null
        };
      }
      svarText = JSON.stringify(existingAnswers);
      const statusInfo = computeStatus(existingAnswers);
      const updateFields = {
        'Status': statusInfo.status,
        'Svar text': svarText,
        'Besvarad': statusInfo.besvaradAt
      };
      await axios.patch(
        `https://api.airtable.com/v0/${airtableBaseId}/${tableId}/${record.id}`,
        { fields: updateFields },
        { headers: { Authorization: `Bearer ${airtableAccessToken}`, 'Content-Type': 'application/json' } }
      );
      return res.json({ success: true, message: 'Sparat.' });
    }

    const hasMultiple = Array.isArray(answersArr) && answersArr.length > 0;

    if (hasMultiple) {
      let existingAnswers = [];
      const raw = (fields['Svar text'] || '').trim();
      if (raw.startsWith('[')) {
        try { existingAnswers = JSON.parse(raw); } catch (_) {}
      }
      const maxLen = Math.max(existingAnswers.length, answersArr.length);
      const merged = [];
      for (let i = 0; i < maxLen; i++) {
        const ex = existingAnswers[i];
        const a = answersArr[i];
        const text = (a && (a.text != null)) ? String(a.text).trim().slice(0, 50000) : (ex && (ex.text != null) ? String(ex.text).trim().slice(0, 50000) : '');
        const filename = (a && a.filename) ? String(a.filename).slice(0, 255) : (ex && ex.filename) ? String(ex.filename).slice(0, 255) : null;
        merged.push({ text, filename });
      }
      for (let i = 0; i < answersArr.length; i++) {
        const a = answersArr[i];
        if (a && a.file && typeof a.file === 'string' && a.filename) {
          let buffer;
          try { buffer = Buffer.from(a.file, 'base64'); } catch (e) { continue; }
          if (buffer.length <= 15 * 1024 * 1024) {
            const contentType = (String(a.filename).toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream');
            const uploadedAtt = await uploadAttachmentToAirtableFieldReturnAttachment(airtableAccessToken, airtableBaseId, record.id, buffer, a.filename, contentType, tableId, 'Svar bifogad fil');
            if (!uploadedAtt) {
              return res.status(502).json({ error: 'Kunde inte ladda upp filen till Airtable. Kontrollera att fältet \"Svar bifogad fil\" finns och är av typen bilaga (attachments).' });
            }
            merged[i] = {
              ...merged[i],
              filename: String(a.filename).slice(0, 255),
              attachmentId: uploadedAtt.id || null,
              attachmentUrl: uploadedAtt.url || null
            };
          }
        }
      }
      svarText = JSON.stringify(merged);
      const statusInfo = computeStatus(merged);
      const updateFields = {
        'Status': statusInfo.status,
        'Svar text': svarText,
        'Besvarad': statusInfo.besvaradAt
      };
      await axios.patch(
        `https://api.airtable.com/v0/${airtableBaseId}/${tableId}/${record.id}`,
        { fields: updateFields },
        { headers: { Authorization: `Bearer ${airtableAccessToken}`, 'Content-Type': 'application/json' } }
      );
      return res.json({ success: true, message: 'Tack! Ditt svar har sparats.' });
    } else {
      svarText = (comment || '').toString().trim().slice(0, 100000);
      if (fileBase64 && typeof fileBase64 === 'string' && filename) {
        let buffer;
        try { buffer = Buffer.from(fileBase64, 'base64'); } catch (e) {
          return res.status(400).json({ error: 'Ogiltig fil' });
        }
        if (buffer.length > 15 * 1024 * 1024) return res.status(400).json({ error: 'Filen får max vara 15 MB' });
        const contentType = (filename.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream');
        const uploaded = await uploadAttachmentToAirtableField(airtableAccessToken, airtableBaseId, record.id, buffer, filename, contentType, tableId, 'Svar bifogad fil');
        if (!uploaded) return res.status(502).json({ error: 'Kunde inte ladda upp filen' });
      }
    }

    // För gamla varianten utan per-punkt-svar: behåll befintligt beteende
    await axios.patch(
      `https://api.airtable.com/v0/${airtableBaseId}/${tableId}/${record.id}`,
      { fields: { 'Status': 'Besvarad', 'Svar text': svarText, 'Besvarad': now } },
      { headers: { Authorization: `Bearer ${airtableAccessToken}`, 'Content-Type': 'application/json' } }
    );
    res.json({ success: true, message: 'Tack! Ditt svar har sparats.' });
  } catch (error) {
    const msg = error.response?.data?.error?.message || error.message;
    console.error('POST /api/samarbete/respond:', msg);
    res.status(error.response?.status === 404 ? 404 : 500).json({ error: msg });
  }
});

// PUT /api/samarbete/requests/:requestId/respond – Konsult lägger till svar manuellt (auth)
app.put('/api/samarbete/requests/:requestId/respond', authenticateToken, async (req, res) => {
  try {
    const requestId = (req.params.requestId || '').trim();
    if (!requestId) return res.status(400).json({ error: 'requestId krävs' });
    const { comment, file: fileBase64, filename } = req.body || {};
    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
    const airtableBaseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
    if (!airtableAccessToken) return res.status(500).json({ error: 'Airtable token saknas' });

    const userData = await getAirtableUser(req.user.email);
    if (!userData) return res.status(404).json({ error: 'Användare hittades inte' });

    const tableId = await getSamarbeteTableId(airtableAccessToken, airtableBaseId);
    if (!tableId) return res.status(404).json({ error: 'Tabellen Samarbete hittades inte' });

    const recRes = await axios.get(
      `https://api.airtable.com/v0/${airtableBaseId}/${tableId}/${requestId}`,
      { headers: { Authorization: `Bearer ${airtableAccessToken}` } }
    );
    const record = recRes.data;
    const fields = record.fields || {};
    const customerId = fields['Kund ID'];
    if (!customerId) return res.status(404).json({ error: 'Förfrågan hittades inte' });

    const custRes = await axios.get(
      `https://api.airtable.com/v0/${airtableBaseId}/${KUNDDATA_TABLE_ID}/${customerId}`,
      { headers: { Authorization: `Bearer ${airtableAccessToken}` } }
    );
    const f = custRes.data.fields || {};
    const custByraId = (f['Byrå ID'] || f.Byrå || '').toString();
    if (userData.role !== 'ClientFlowAdmin' && String(custByraId) !== String(userData.byraId || '').trim()) {
      return res.status(403).json({ error: 'Ingen behörighet' });
    }

    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const updateFields = {
      'Status': 'Besvarad',
      'Svar text': (comment || '').toString().trim().slice(0, 100000),
      'Besvarad': now
    };

    if (fileBase64 && typeof fileBase64 === 'string' && filename) {
      let buffer;
      try { buffer = Buffer.from(fileBase64, 'base64'); } catch (e) {
        return res.status(400).json({ error: 'Ogiltig fil' });
      }
      if (buffer.length > 15 * 1024 * 1024) return res.status(400).json({ error: 'Filen får max vara 15 MB' });
      const contentType = (filename.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream');
      const uploaded = await uploadAttachmentToAirtableField(airtableAccessToken, airtableBaseId, requestId, buffer, filename, contentType, tableId, 'Svar bifogad fil');
      if (!uploaded) return res.status(502).json({ error: 'Kunde inte ladda upp filen' });
    }

    await axios.patch(
      `https://api.airtable.com/v0/${airtableBaseId}/${tableId}/${requestId}`,
      { fields: updateFields },
      { headers: { Authorization: `Bearer ${airtableAccessToken}`, 'Content-Type': 'application/json' } }
    );
    res.json({ success: true, message: 'Svar sparades.' });
  } catch (error) {
    const status = error.response?.status;
    const msg = error.response?.data?.error?.message || error.message;
    console.error('PUT /api/samarbete/requests/:requestId/respond:', msg);
    res.status(status || 500).json({ error: msg || 'Kunde inte spara svar' });
  }
});

// PUT /api/samarbete/requests/:requestId/close – Stäng förfrågan (auth), kunden kan då inte längre se/ändra
app.put('/api/samarbete/requests/:requestId/close', authenticateToken, async (req, res) => {
  try {
    const requestId = (req.params.requestId || '').trim();
    if (!requestId) return res.status(400).json({ error: 'requestId krävs' });
    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
    const airtableBaseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
    if (!airtableAccessToken) return res.status(500).json({ error: 'Airtable token saknas' });
    const tableId = await getSamarbeteTableId(airtableAccessToken, airtableBaseId);
    if (!tableId) return res.status(404).json({ error: 'Tabellen Samarbete hittades inte' });
    const recRes = await axios.get(
      `https://api.airtable.com/v0/${airtableBaseId}/${tableId}/${requestId}`,
      { headers: { Authorization: `Bearer ${airtableAccessToken}` } }
    );
    const customerId = (recRes.data.fields || {})['Kund ID'] || (recRes.data.fields || {})['Kund']?.[0];
    if (!customerId) return res.status(404).json({ error: 'Förfrågan hittades inte' });
    const userData = await getAirtableUser(req.user.email);
    if (!userData) return res.status(404).json({ error: 'Användare hittades inte' });
    const custRes = await axios.get(
      `https://api.airtable.com/v0/${airtableBaseId}/${KUNDDATA_TABLE_ID}/${customerId}`,
      { headers: { Authorization: `Bearer ${airtableAccessToken}` } }
    );
    const f = custRes.data.fields || {};
    const custByraId = (f['Byrå ID'] || f.Byrå || '').toString();
    if (userData.role !== 'ClientFlowAdmin' && String(custByraId) !== String(userData.byraId || '').trim()) {
      return res.status(403).json({ error: 'Ingen behörighet' });
    }
    await axios.patch(
      `https://api.airtable.com/v0/${airtableBaseId}/${tableId}/${requestId}`,
      { fields: { 'Stängd': true } },
      { headers: { Authorization: `Bearer ${airtableAccessToken}`, 'Content-Type': 'application/json' } }
    );
    res.json({ success: true, message: 'Förfrågan är nu stängd. Länken visar inte längre formuläret för kunden.' });
  } catch (error) {
    const msg = error.response?.data?.error?.message || error.message;
    console.error('PUT /api/samarbete/requests/:requestId/close:', msg);
    res.status(error.response?.status === 404 ? 404 : 500).json({ error: msg });
  }
});

// PUT /api/samarbete/requests/:requestId/archive – Arkivera förfrågan (auth)
app.put('/api/samarbete/requests/:requestId/archive', authenticateToken, async (req, res) => {
  try {
    const requestId = (req.params.requestId || '').trim();
    if (!requestId) return res.status(400).json({ error: 'requestId krävs' });
    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
    const airtableBaseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
    if (!airtableAccessToken) return res.status(500).json({ error: 'Airtable token saknas' });
    const tableId = await getSamarbeteTableId(airtableAccessToken, airtableBaseId);
    if (!tableId) return res.status(404).json({ error: 'Tabellen Samarbete hittades inte' });
    const recRes = await axios.get(
      `https://api.airtable.com/v0/${airtableBaseId}/${tableId}/${requestId}`,
      { headers: { Authorization: `Bearer ${airtableAccessToken}` } }
    );
    const customerId = (recRes.data.fields || {})['Kund ID'] || (recRes.data.fields || {})['Kund']?.[0];
    if (!customerId) return res.status(404).json({ error: 'Förfrågan hittades inte' });
    const userData = await getAirtableUser(req.user.email);
    if (!userData) return res.status(404).json({ error: 'Användare hittades inte' });
    const custRes = await axios.get(
      `https://api.airtable.com/v0/${airtableBaseId}/${KUNDDATA_TABLE_ID}/${customerId}`,
      { headers: { Authorization: `Bearer ${airtableAccessToken}` } }
    );
    const f = custRes.data.fields || {};
    const custByraId = (f['Byrå ID'] || f.Byrå || '').toString();
    if (userData.role !== 'ClientFlowAdmin' && String(custByraId) !== String(userData.byraId || '').trim()) {
      return res.status(403).json({ error: 'Ingen behörighet' });
    }
    await axios.patch(
      `https://api.airtable.com/v0/${airtableBaseId}/${tableId}/${requestId}`,
      { fields: { 'Status': 'Arkiverad' }, typecast: true },
      { headers: { Authorization: `Bearer ${airtableAccessToken}`, 'Content-Type': 'application/json' } }
    );
    res.json({ success: true, message: 'Förfrågan är arkiverad.' });
  } catch (error) {
    const msg = error.response?.data?.error?.message || error.message;
    console.error('PUT /api/samarbete/requests/:requestId/archive:', msg);
    res.status(error.response?.status === 404 ? 404 : 500).json({ error: msg });
  }
});

// PUT /api/samarbete/requests/:requestId/unarchive – Återställ från arkiv (auth)
app.put('/api/samarbete/requests/:requestId/unarchive', authenticateToken, async (req, res) => {
  try {
    const requestId = (req.params.requestId || '').trim();
    if (!requestId) return res.status(400).json({ error: 'requestId krävs' });
    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
    const airtableBaseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
    if (!airtableAccessToken) return res.status(500).json({ error: 'Airtable token saknas' });
    const tableId = await getSamarbeteTableId(airtableAccessToken, airtableBaseId);
    if (!tableId) return res.status(404).json({ error: 'Tabellen Samarbete hittades inte' });
    const recRes = await axios.get(
      `https://api.airtable.com/v0/${airtableBaseId}/${tableId}/${requestId}`,
      { headers: { Authorization: `Bearer ${airtableAccessToken}` } }
    );
    const customerId = (recRes.data.fields || {})['Kund ID'] || (recRes.data.fields || {})['Kund']?.[0];
    if (!customerId) return res.status(404).json({ error: 'Förfrågan hittades inte' });
    const userData = await getAirtableUser(req.user.email);
    if (!userData) return res.status(404).json({ error: 'Användare hittades inte' });
    const custRes = await axios.get(
      `https://api.airtable.com/v0/${airtableBaseId}/${KUNDDATA_TABLE_ID}/${customerId}`,
      { headers: { Authorization: `Bearer ${airtableAccessToken}` } }
    );
    const f = custRes.data.fields || {};
    const custByraId = (f['Byrå ID'] || f.Byrå || '').toString();
    if (userData.role !== 'ClientFlowAdmin' && String(custByraId) !== String(userData.byraId || '').trim()) {
      return res.status(403).json({ error: 'Ingen behörighet' });
    }
    const fields = recRes.data.fields || {};
    const hadAnswer = !!(fields['Besvarad'] || (fields['Svar text'] && String(fields['Svar text']).trim()));
    const newStatus = hadAnswer ? 'Besvarad' : 'Väntar';
    await axios.patch(
      `https://api.airtable.com/v0/${airtableBaseId}/${tableId}/${requestId}`,
      { fields: { 'Status': newStatus } },
      { headers: { Authorization: `Bearer ${airtableAccessToken}`, 'Content-Type': 'application/json' } }
    );
    res.json({ success: true, message: 'Förfrågan är återställd från arkivet.' });
  } catch (error) {
    const msg = error.response?.data?.error?.message || error.message;
    console.error('PUT /api/samarbete/requests/:requestId/unarchive:', msg);
    res.status(error.response?.status === 404 ? 404 : 500).json({ error: msg });
  }
});

// POST /api/samarbete/requests/:requestId/resend-email – skicka förfrågan igen via mejl (auth)
app.post('/api/samarbete/requests/:requestId/resend-email', authenticateToken, async (req, res) => {
  try {
    const requestId = (req.params.requestId || '').trim();
    if (!requestId) return res.status(400).json({ error: 'requestId krävs' });
    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
    const airtableBaseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
    if (!airtableAccessToken) return res.status(500).json({ error: 'Airtable token saknas' });

    const tableId = await getSamarbeteTableId(airtableAccessToken, airtableBaseId);
    if (!tableId) return res.status(404).json({ error: 'Tabellen Samarbete hittades inte' });

    const recRes = await axios.get(
      `https://api.airtable.com/v0/${airtableBaseId}/${tableId}/${requestId}`,
      { headers: { Authorization: `Bearer ${airtableAccessToken}` } }
    );
    const fields = recRes.data.fields || {};
    const customerId = fields['Kund ID'] || fields['Kund']?.[0];
    if (!customerId) return res.status(404).json({ error: 'Förfrågan hittades inte' });

    const userData = await getAirtableUser(req.user.email);
    if (!userData) return res.status(404).json({ error: 'Användare hittades inte' });

    const custRes = await axios.get(
      `https://api.airtable.com/v0/${airtableBaseId}/${KUNDDATA_TABLE_ID}/${customerId}`,
      { headers: { Authorization: `Bearer ${airtableAccessToken}` } }
    );
    const f = custRes.data.fields || {};
    const custByraId = (f['Byrå ID'] || f.Byrå || '').toString();
    if (userData.role !== 'ClientFlowAdmin' && String(custByraId) !== String(userData.byraId || '').trim()) {
      return res.status(403).json({ error: 'Ingen behörighet' });
    }

    const toEmail = (fields['Mottagare e-post'] || '').toString().trim();
    if (!toEmail || !toEmail.includes('@')) {
      return res.status(400).json({ error: 'Ingen giltig e-postadress finns sparad för mottagaren.' });
    }

    const recipientName = (fields['Mottagare namn'] || '').toString().trim() || 'Kund';
    const title = (fields['Titel'] || '').toString().trim();
    const token = (fields['Token'] || '').toString().trim();
    if (!token) {
      return res.status(400).json({ error: 'Ingen token är sparad för denna förfrågan – kan inte skicka om mejlet.' });
    }

    const baseUrl = (process.env.PUBLIC_BASE_URL || '').toString().trim()
      || ((req.get('host') || '').includes('localhost') ? (req.protocol + '://' + (req.get('host') || 'localhost:3001')) : 'https://www.app.clientflow.se');
    const respondUrl = `${baseUrl}/samarbete-svar.html?token=${encodeURIComponent(token)}`;

    const senderName = (userData.name || req.user.email || '').toString().trim() || 'Vi';
    const senderByra = (userData.byra || '').toString().trim() || null;
    const logoRaw = userData.logo;
    const senderLogoUrl = Array.isArray(logoRaw) && logoRaw.length > 0 && logoRaw[0].url
      ? logoRaw[0].url
      : (typeof logoRaw === 'string' && logoRaw.startsWith('http') ? logoRaw : null);

    const result = await sendSamarbeteInviteEmail({
      toEmail,
      toName: recipientName,
      senderName,
      senderEmail: (req.user && req.user.email) ? String(req.user.email).trim() : undefined,
      senderByra: senderByra || undefined,
      senderLogoUrl: senderLogoUrl || undefined,
      respondUrl,
      title,
      customerMessage: undefined
    });

    if (!result.sent) {
      return res.status(500).json({ error: result.error || 'Kunde inte skicka mejlet.' });
    }

    res.json({
      success: true,
      message: `Mejlet har skickats igen till ${toEmail}.`
    });
  } catch (error) {
    const msg = error.response?.data?.error?.message || error.message;
    console.error('POST /api/samarbete/requests/:requestId/resend-email:', msg);
    res.status(error.response?.status === 404 ? 404 : 500).json({ error: msg });
  }
});

// PUT /api/samarbete/requests/:requestId – uppdatera utkast (auth)
app.put('/api/samarbete/requests/:requestId', authenticateToken, async (req, res) => {
  try {
    const requestId = (req.params.requestId || '').trim();
    if (!requestId) return res.status(400).json({ error: 'requestId krävs' });
    const { recipientName, recipientEmail, title, customerMessage, deadline, uppdragId, uppdragTyp, uppdragPeriod, uppdragskorningId } = req.body || {};

    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
    const airtableBaseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
    if (!airtableAccessToken) return res.status(500).json({ error: 'Airtable token saknas' });

    const tableId = await getSamarbeteTableId(airtableAccessToken, airtableBaseId);
    if (!tableId) return res.status(404).json({ error: 'Tabellen Samarbete hittades inte' });

    // Read to verify access + byrå check
    const recRes = await axios.get(
      `https://api.airtable.com/v0/${airtableBaseId}/${tableId}/${requestId}`,
      { headers: { Authorization: `Bearer ${airtableAccessToken}` } }
    );
    const record = recRes.data;
    const fields = record.fields || {};
    const customerId = fields['Kund ID'] || (fields['Kund'] && fields['Kund'][0]);
    if (!customerId) return res.status(404).json({ error: 'Förfrågan hittades inte' });

    const userData = await getAirtableUser(req.user.email);
    if (!userData) return res.status(404).json({ error: 'Användare hittades inte' });
    const custRes = await axios.get(
      `https://api.airtable.com/v0/${airtableBaseId}/${KUNDDATA_TABLE_ID}/${customerId}`,
      { headers: { Authorization: `Bearer ${airtableAccessToken}` } }
    );
    const cf = custRes.data.fields || {};
    const custByraId = (cf['Byrå ID'] || cf.Byrå || '').toString();
    if (userData.role !== 'ClientFlowAdmin' && String(custByraId) !== String(userData.byraId || '').trim()) {
      return res.status(403).json({ error: 'Ingen behörighet' });
    }

    const parseDeadlineDateOnly = (v) => {
      if (v == null) return null;
      const s = String(v).trim();
      if (!s) return null;
      const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (m) return `${m[1]}-${m[2]}-${m[3]}`;
      const d = new Date(s);
      if (Number.isNaN(d.getTime())) return null;
      return d.toISOString().slice(0, 10);
    };
    const deadlineDate = parseDeadlineDateOnly(deadline);

    const updateFields = {};
    if (recipientName != null) updateFields['Mottagare namn'] = String(recipientName).trim();
    if (recipientEmail != null) updateFields['Mottagare e-post'] = String(recipientEmail).trim();
    if (title != null) updateFields['Titel'] = String(title).trim();
    if (customerMessage != null) updateFields['Meddelande'] = String(customerMessage).trim().slice(0, 100000);
    if (deadline != null) updateFields['Deadline'] = deadlineDate || null;

    if (uppdragId || uppdragTyp || uppdragPeriod || uppdragskorningId) {
      updateFields['Skapad från uppdrag'] = true;
      if (uppdragId != null) updateFields['Uppdrag ID'] = String(uppdragId).trim();
      if (uppdragTyp != null) updateFields['Uppdrag typ'] = String(uppdragTyp).trim();
      if (uppdragPeriod != null) updateFields['Uppdrag period'] = String(uppdragPeriod).trim();
      if (uppdragskorningId != null) updateFields['Uppdragskörning ID'] = String(uppdragskorningId).trim();
    }

    await axios.patch(
      `https://api.airtable.com/v0/${airtableBaseId}/${tableId}/${requestId}`,
      { fields: updateFields },
      { headers: { Authorization: `Bearer ${airtableAccessToken}`, 'Content-Type': 'application/json' } }
    );
    res.json({ success: true });
  } catch (error) {
    const msg = error.response?.data?.error?.message || error.message;
    console.error('PUT /api/samarbete/requests/:requestId:', msg);
    res.status(error.response?.status === 404 ? 404 : 500).json({ error: msg });
  }
});

// POST /api/samarbete/requests/:requestId/send – skicka utkast (auth)
app.post('/api/samarbete/requests/:requestId/send', authenticateToken, async (req, res) => {
  try {
    const requestId = (req.params.requestId || '').trim();
    if (!requestId) return res.status(400).json({ error: 'requestId krävs' });

    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
    const airtableBaseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
    if (!airtableAccessToken) return res.status(500).json({ error: 'Airtable token saknas' });

    const tableId = await getSamarbeteTableId(airtableAccessToken, airtableBaseId);
    if (!tableId) return res.status(404).json({ error: 'Tabellen Samarbete hittades inte' });

    const recRes = await axios.get(
      `https://api.airtable.com/v0/${airtableBaseId}/${tableId}/${requestId}`,
      { headers: { Authorization: `Bearer ${airtableAccessToken}` } }
    );
    const record = recRes.data;
    const fields = record.fields || {};
    const customerId = fields['Kund ID'] || (fields['Kund'] && fields['Kund'][0]);
    if (!customerId) return res.status(404).json({ error: 'Förfrågan hittades inte' });

    const userData = await getAirtableUser(req.user.email);
    if (!userData) return res.status(404).json({ error: 'Användare hittades inte' });

    const custRes = await axios.get(
      `https://api.airtable.com/v0/${airtableBaseId}/${KUNDDATA_TABLE_ID}/${customerId}`,
      { headers: { Authorization: `Bearer ${airtableAccessToken}` } }
    );
    const cf = custRes.data.fields || {};
    const custByraId = (cf['Byrå ID'] || cf.Byrå || '').toString();
    if (userData.role !== 'ClientFlowAdmin' && String(custByraId) !== String(userData.byraId || '').trim()) {
      return res.status(403).json({ error: 'Ingen behörighet' });
    }

    const toEmail = (fields['Mottagare e-post'] || '').toString().trim();
    const toName = (fields['Mottagare namn'] || '').toString().trim() || 'Kund';
    const title = (fields['Titel'] || '').toString().trim();
    const token = (fields['Token'] || '').toString().trim();
    if (!title) return res.status(400).json({ error: 'Titel saknas på utkastet.' });
    if (!toEmail || !toEmail.includes('@')) return res.status(400).json({ error: 'Ange en giltig mottagare e-post innan du skickar.' });
    if (!token) return res.status(400).json({ error: 'Token saknas på utkastet.' });

    const reqHost = (req.get('host') || '').toString().trim();
    const inferredBase = req.protocol + '://' + (reqHost || 'localhost:3001');
    const defaultPublicBase = (reqHost.includes('localhost') || reqHost.includes('127.0.0.1')) ? inferredBase : 'https://www.app.clientflow.se';
    const publicBaseUrl = (process.env.PUBLIC_BASE_URL || '').toString().trim() || defaultPublicBase;
    const respondUrl = `${publicBaseUrl}/samarbete-svar.html?token=${encodeURIComponent(token)}`;

    const senderName = (userData.name || req.user.email || '').toString().trim() || 'Vi';
    const senderByra = (userData.byra || '').toString().trim() || null;
    const logoRaw = userData.logo;
    const senderLogoUrl = Array.isArray(logoRaw) && logoRaw.length > 0 && logoRaw[0].url
      ? logoRaw[0].url
      : (typeof logoRaw === 'string' && logoRaw.startsWith('http') ? logoRaw : null);

    const result = await sendSamarbeteInviteEmail({
      toEmail,
      toName,
      senderName,
      senderEmail: (req.user && req.user.email) ? String(req.user.email).trim() : undefined,
      senderByra: senderByra || undefined,
      senderLogoUrl: senderLogoUrl || undefined,
      respondUrl,
      title,
      customerMessage: (fields['Meddelande'] || '').toString().trim() || undefined,
      deadlineDate: fields['Deadline'] || undefined
    });
    if (!result.sent) return res.status(502).json({ error: result.error || 'Kunde inte skicka mejlet.' });

    await axios.patch(
      `https://api.airtable.com/v0/${airtableBaseId}/${tableId}/${requestId}`,
      { fields: { 'Status': 'Väntar' } },
      { headers: { Authorization: `Bearer ${airtableAccessToken}`, 'Content-Type': 'application/json' } }
    );

    res.json({ success: true });
  } catch (error) {
    const msg = error.response?.data?.error?.message || error.message;
    console.error('POST /api/samarbete/requests/:requestId/send:', msg);
    res.status(error.response?.status === 404 ? 404 : 500).json({ error: msg });
  }
});

// POST /api/kunddata/create - Skapa ny kund i KUNDDATA (Airtable)
app.post('/api/kunddata/create', authenticateToken, async (req, res) => {
  try {
    const { fields } = req.body;
    if (!fields) {
      return res.status(400).json({ error: 'Fält saknas i request body' });
    }

    const orgnrRaw = (fields['Orgnr'] || '').toString().replace(/[^\d]/g, '');
    const byraId = (fields['Byrå ID'] != null ? fields['Byrå ID'] : fields['ByraID'] || fields['Byra_ID'] || '').toString().trim();
    const byraIdClean = byraId.replace(/,/g, '').trim();

    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
    const airtableBaseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
    const KUNDDATA_TABLE = 'tblOIuLQS2DqmOQWe';
    if (!airtableAccessToken) {
      return res.status(500).json({ error: 'Airtable token saknas' });
    }

    if (orgnrRaw) {
      const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      const orgnrVariants = [orgnrRaw];
      if (orgnrRaw.length === 10) {
        const yy = parseInt(orgnrRaw.substring(0, 2), 10);
        const currentYear = new Date().getFullYear() % 100;
        orgnrVariants.push((yy > currentYear ? '19' : '20') + orgnrRaw);
        orgnrVariants.push(orgnrRaw.replace(/^(\d{6})(\d{4})$/, '$1-$2'));
      } else if (orgnrRaw.length === 12) {
        orgnrVariants.push(orgnrRaw.substring(2));
        orgnrVariants.push(orgnrRaw.substring(2).replace(/^(\d{6})(\d{4})$/, '$1-$2'));
      }
      const byraIdNorm = (v) => (v == null || v === '') ? '' : String(v).trim();
      const byraIdMatch = (recordByraId) => byraIdNorm(recordByraId) === byraIdNorm(byraIdClean);
      const orgnrFromRecord = (r) => (r.fields?.['Orgnr'] || r.fields?.['orgnr'] || '').toString().replace(/\D/g, '');
      const recordMatchesOrgnr = (r) => {
        const rec = orgnrFromRecord(r);
        if (!rec) return false;
        return rec === orgnrRaw || rec === orgnrRaw.substring(0, 10) || rec === orgnrRaw.substring(2);
      };
      const runFallback = async () => {
        const orgnrOnlyFormula = orgnrVariants.length === 1
          ? `{Orgnr}="${esc(orgnrRaw)}"`
          : `OR(${orgnrVariants.map(o => `{Orgnr}="${esc(o)}"`).join(',')})`;
        const fallbackUrl = `https://api.airtable.com/v0/${airtableBaseId}/${KUNDDATA_TABLE}?filterByFormula=${encodeURIComponent(orgnrOnlyFormula)}&maxRecords=100&fields[]=id&fields[]=Namn&fields[]=Byrå ID&fields[]=Orgnr`;
        const fallbackRes = await axios.get(fallbackUrl, { headers: { 'Authorization': `Bearer ${airtableAccessToken}` } });
        const records = fallbackRes.data.records || [];
        return records.find(r => recordMatchesOrgnr(r) && byraIdMatch(r.fields?.['Byrå ID'] || r.fields?.['Byra_ID'])) || null;
      };

      let existingRecord = null;
      if (byraIdClean === '') {
        existingRecord = await runFallback();
      } else {
        const byraIdFormula = /^\d+$/.test(byraIdClean) ? `{Byrå ID}=${byraIdClean}` : `{Byrå ID}="${esc(byraIdClean)}"`;
        const orgnrConditions = orgnrVariants.map(o => `{Orgnr}="${esc(o)}"`).join(',');
        const checkFormula = `AND(OR(${orgnrConditions}),${byraIdFormula})`;
        const checkUrl = `https://api.airtable.com/v0/${airtableBaseId}/${KUNDDATA_TABLE}?filterByFormula=${encodeURIComponent(checkFormula)}&maxRecords=1&fields[]=Namn`;
        try {
          const checkRes = await axios.get(checkUrl, { headers: { 'Authorization': `Bearer ${airtableAccessToken}` } });
          existingRecord = checkRes.data.records?.[0] || null;
        } catch (e) {
          if (e.response?.status === 422 || e.response?.status === 400) existingRecord = await runFallback();
        }
        if (!existingRecord) existingRecord = await runFallback();
      }
      if (existingRecord) {
        return res.status(409).json({
          error: 'duplicate',
          message: 'Företaget är redan upplagt som kund hos er byrå. Samma organisationsnummer kan bara förekomma en gång per byrå.',
          existingId: existingRecord.id,
          existingNamn: existingRecord.fields?.Namn || ''
        });
      }
    }

    const url = `https://api.airtable.com/v0/${airtableBaseId}/${KUNDDATA_TABLE}`;
    const airtableRes = await axios.post(url,
      { fields },
      { headers: { 'Authorization': `Bearer ${airtableAccessToken}`, 'Content-Type': 'application/json' } }
    );
    console.log('✅ Kund skapad i Airtable KUNDDATA:', airtableRes.data.id);
    res.json({ success: true, id: airtableRes.data.id, record: airtableRes.data });

  } catch (error) {
    console.error('❌ Fel vid skapande av kund i KUNDDATA:', error.response?.data || error.message);
    const status = error.response?.status || 500;
    const message = error.response?.data?.error?.message || error.message || 'Okänt fel';
    res.status(status).json({ error: message });
  }
});

// GET /api/byra-rutiner - Hämta Byråer-post för inloggad byrå (grund för Byrårutiner)
app.get('/api/byra-rutiner', authenticateToken, async (req, res) => {
  try {
    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
    const airtableBaseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
    const BYRAER_TABLE = 'Byråer';

    if (!airtableAccessToken) {
      return res.status(500).json({ error: 'Airtable token saknas' });
    }

    const userData = await getAirtableUser(req.user.email);
    if (!userData) {
      return res.status(404).json({ success: false, message: 'Användare hittades inte' });
    }

    const byraId = userData.byraId ? String(userData.byraId).trim() : '';
    if (!byraId) {
      return res.status(400).json({
        success: false,
        message: 'Ingen byrå kopplad till användaren',
        byraId: null
      });
    }

    const num = parseInt(byraId);
    const filterFormula = isNaN(num)
      ? `{Byrå ID}="${byraId}"`
      : `OR({Byrå ID}="${byraId}",{Byrå ID}=${byraId})`;

    const url = `https://api.airtable.com/v0/${airtableBaseId}/${encodeURIComponent(BYRAER_TABLE)}?filterByFormula=${encodeURIComponent(filterFormula)}&maxRecords=1`;
    const airtableRes = await axios.get(url, {
      headers: { 'Authorization': `Bearer ${airtableAccessToken}` }
    });

    if (!airtableRes.data.records || airtableRes.data.records.length === 0) {
      return res.json({
        success: true,
        record: null,
        fields: {},
        message: 'Ingen Byråer-post hittades för er byrå'
      });
    }

    const record = airtableRes.data.records[0];
    const fields = { ...record.fields };
    const riskKey = '4. Identifierade Risker och Sårbarheter';
    const riskRaw = fields[riskKey];
    if (riskRaw && typeof riskRaw === 'string' && /rec[A-Za-z0-9]{10,}/.test(riskRaw)) {
      const idMap = await buildTjanstIdToNamnMap(airtableAccessToken, airtableBaseId, byraId, riskRaw);
      fields[riskKey] = sanitizeIdentifieradeRiskerText(riskRaw, idMap);
    } else if (riskRaw && typeof riskRaw === 'string') {
      fields[riskKey] = stripEmptyTjanstRiskSections(riskRaw);
    }

    res.json({
      success: true,
      record: { id: record.id, fields },
      fields,
      id: record.id
    });
  } catch (error) {
    console.error('❌ GET /api/byra-rutiner:', error.response?.data || error.message);
    const status = error.response?.status || 500;
    res.status(status).json({ success: false, error: error.response?.data?.error?.message || error.message });
  }
});

// Hjälp: hämta Byråer-record för inloggad användares byraId
async function getByraerRecordForUser(req) {
  const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
  const airtableBaseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
  const BYRAER_TABLE = 'Byråer';
  if (!airtableAccessToken) return { error: 'Airtable token saknas', status: 500 };
  const userData = await getAirtableUser(req.user.email);
  if (!userData) return { error: 'Användare hittades inte', status: 404 };
  const byraId = userData.byraId ? String(userData.byraId).trim() : '';
  if (!byraId) return { error: 'Ingen byrå kopplad till användaren', status: 400 };
  const num = parseInt(byraId);
  const filterFormula = isNaN(num)
    ? `{Byrå ID}="${byraId}"`
    : `OR({Byrå ID}="${byraId}",{Byrå ID}=${byraId})`;
  const url = `https://api.airtable.com/v0/${airtableBaseId}/${encodeURIComponent(BYRAER_TABLE)}?filterByFormula=${encodeURIComponent(filterFormula)}&maxRecords=1`;
  const airtableRes = await axios.get(url, {
    headers: { 'Authorization': `Bearer ${airtableAccessToken}` }
  });
  if (!airtableRes.data.records || airtableRes.data.records.length === 0) {
    return { error: 'Ingen Byråer-post hittades för er byrå', status: 404 };
  }
  return { record: airtableRes.data.records[0], byraId, userData };
}

// BYRÅNS PROFIL – kalibreringsfält (lagras i Airtable-tabellen "Byråer")
function mapByraProfilFromAirtable(fields) {
  const f = fields || {};
  return {
    antalKunder: f['Antal kunder'] ?? '',
    vanligasteBolagsformer: f['Vanligaste bolagsformer'] ?? '',
    branscherKundstock: f['Branscher i kundstocken'] ?? '',
    andelInternationellHandel: f['Andel kunder med internationell handel'] ?? f['Andel internationell handel'] ?? '',
    andelKontantintensiva: f['Andel kontantintensiva kunder'] ?? '',
    leveranssatt: f['Leveranssätt'] ?? f['Leveranssatt'] ?? '',
    geografiskMarknad: f['Geografisk marknad'] ?? ''
  };
}

function formatByraProfilPromptBlock(profil) {
  const p = profil || {};
  const fmtPct = (v) => {
    if (v === '' || v == null) return '–';
    const n = Number(String(v).replace(',', '.'));
    return Number.isFinite(n) ? `${n}%` : String(v);
  };
  const fmtNum = (v) => (v === '' || v == null ? '–' : String(v));
  return [
    'BYRÅPROFIL (för kalibrering av risknivåer):',
    `- Antal kunder: ${fmtNum(p.antalKunder)}`,
    `- Vanligaste bolagsformer: ${p.vanligasteBolagsformer || '–'}`,
    `- Branscher i kundstocken: ${p.branscherKundstock || '–'}`,
    `- Andel kunder med internationell handel: ${fmtPct(p.andelInternationellHandel)}`,
    `- Andel kontantintensiva kunder: ${fmtPct(p.andelKontantintensiva)}`,
    `- Tjänster erbjuds via: ${p.leveranssatt || '–'}`,
    `- Geografisk marknad: ${p.geografiskMarknad || '–'}`
  ].join('\n');
}

async function getByraProfilForRequest(req) {
  const result = await getByraerRecordForUser(req);
  if (result.error) return result;
  return { ...result, profil: mapByraProfilFromAirtable(result.record.fields) };
}

// GET /api/byra/info – Hämta byråinfo (samma data som Allmän riskbedömning använder)
app.get('/api/byra/info', authenticateToken, async (req, res) => {
  try {
    const result = await getByraerRecordForUser(req);
    if (result.error) return res.status(result.status || 500).json({ error: result.error });
    const record = result.record;
    const fields = record.fields || {};
    const prislistaJson = fields['Tjänstepriser (JSON)'] ?? fields['Tjanstepriser (JSON)'] ?? fields['Prislista (JSON)'] ?? '';
    const fritextJson = fields['Fritexttjänster (JSON)'] ?? fields['Fritexttjanster (JSON)'] ?? '';
    res.json({
      success: true,
      id: record.id,
      byraId: result.byraId,
      fields: {
        antalAnstallda: fields['Antal anställda'] ?? '',
        omsattning: fields['Omsättning'] ?? '',
        antalKundforetag: fields['Antal kundföretag'] ?? '',
        logga: fields['Logga'] ?? '',
        bransch: fields['Typ av byrå'] ?? '',
        defaultUppsagningstid: fields['Default uppsägningstid'] ?? fields['Default uppsagningstid'] ?? '',
        defaultFakturaperiod: fields['Default faktureringsperiod'] ?? fields['Default faktureringsperiod'] ?? fields['Default fakturaperiod'] ?? '',
        defaultBetalningsvillkor: fields['Default betalningsvillkor'] ?? fields['Default betalningsvillkor (dagar)'] ?? '',
        tjanstepriserJson: typeof prislistaJson === 'string' ? prislistaJson : JSON.stringify(prislistaJson),
        fritexttjansterJson: typeof fritextJson === 'string' ? fritextJson : JSON.stringify(fritextJson),
        uppdragsbrevInformationstext: fields['Uppdragsbrev informationstext'] ?? '',
        ...mapByraProfilFromAirtable(fields)
      },
      raw: fields
    });
  } catch (error) {
    console.error('❌ GET /api/byra/info:', error.response?.data || error.message);
    const status = error.response?.status || 500;
    res.status(status).json({ error: error.response?.data?.error?.message || error.message });
  }
});

// PUT /api/byra/info – Uppdatera byråinfo (Antal anställda, Omsättning, Antal kundföretag, Logga, Typ av byrå)
app.put('/api/byra/info', authenticateToken, async (req, res) => {
  try {
    const result = await getByraerRecordForUser(req);
    if (result.error) return res.status(result.status || 500).json({ error: result.error });
    const recordId = result.record.id;
    const body = req.body || {};
    const allowedRoles = ['ClientFlowAdmin', 'Ledare'];
    if (!allowedRoles.includes(result.userData.role)) {
      return res.status(403).json({ error: 'Endast Ledare och ClientFlowAdmin får redigera byråinfo' });
    }
    const toNumberOrNull = (v) => {
      if (v == null) return null;
      if (typeof v === 'number') return Number.isFinite(v) ? v : null;
      const s = String(v).trim();
      if (!s) return null;
      // Tillåt både "10" och "10,5" från UI
      const n = Number(s.replace(',', '.'));
      return Number.isFinite(n) ? n : null;
    };
    const fields = {};
    if (body.antalAnstallda !== undefined) fields['Antal anställda'] = body.antalAnstallda;
    if (body.omsattning !== undefined) fields['Omsättning'] = body.omsattning;
    if (body.antalKundforetag !== undefined) fields['Antal kundföretag'] = body.antalKundforetag;
    if (body.logga !== undefined) fields['Logga'] = body.logga;
    if (body.bransch !== undefined) fields['Typ av byrå'] = body.bransch;
    if (body.defaultUppsagningstid !== undefined) fields['Default uppsägningstid'] = toNumberOrNull(body.defaultUppsagningstid);
    if (body.defaultFakturaperiod !== undefined) fields['Default faktureringsperiod'] = body.defaultFakturaperiod;
    if (body.defaultBetalningsvillkor !== undefined) fields['Default betalningsvillkor'] = toNumberOrNull(body.defaultBetalningsvillkor);
    if (body.tjanstepriserJson !== undefined) fields['Tjänstepriser (JSON)'] = body.tjanstepriserJson;
    if (body.fritexttjansterJson !== undefined) fields['Fritexttjänster (JSON)'] = body.fritexttjansterJson;
    if (body.uppdragsbrevInformationstext !== undefined) fields['Uppdragsbrev informationstext'] = body.uppdragsbrevInformationstext;
    const toPercentOrNull = (v, label) => {
      const n = toNumberOrNull(v);
      if (n == null) return v === '' || v == null ? null : { error: `${label} måste vara ett tal mellan 0 och 100` };
      if (n < 0 || n > 100) return { error: `${label} måste vara mellan 0 och 100` };
      return n;
    };
    if (body.antalKunder !== undefined) {
      const n = toNumberOrNull(body.antalKunder);
      if (n != null && n < 0) return res.status(400).json({ error: 'Antal kunder måste vara 0 eller högre' });
      fields['Antal kunder'] = n;
    }
    if (body.vanligasteBolagsformer !== undefined) fields['Vanligaste bolagsformer'] = body.vanligasteBolagsformer;
    if (body.branscherKundstock !== undefined) fields['Branscher i kundstocken'] = body.branscherKundstock;
    if (body.andelInternationellHandel !== undefined) {
      const pct = toPercentOrNull(body.andelInternationellHandel, 'Andel internationell handel');
      if (pct && typeof pct === 'object' && pct.error) return res.status(400).json({ error: pct.error });
      fields['Andel kunder med internationell handel'] = pct;
    }
    if (body.andelKontantintensiva !== undefined) {
      const pct = toPercentOrNull(body.andelKontantintensiva, 'Andel kontantintensiva kunder');
      if (pct && typeof pct === 'object' && pct.error) return res.status(400).json({ error: pct.error });
      fields['Andel kontantintensiva kunder'] = pct;
    }
    if (body.leveranssatt !== undefined) fields['Leveranssätt'] = body.leveranssatt;
    if (body.geografiskMarknad !== undefined) fields['Geografisk marknad'] = body.geografiskMarknad;
    if (Object.keys(fields).length === 0) {
      return res.status(400).json({ error: 'Inga fält att uppdatera' });
    }
    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
    const airtableBaseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
    const BYRAER_TABLE = 'Byråer';
    const patchUrl = `https://api.airtable.com/v0/${airtableBaseId}/${encodeURIComponent(BYRAER_TABLE)}/${recordId}`;
    try {
      await axios.patch(patchUrl, { fields }, {
        headers: { 'Authorization': `Bearer ${airtableAccessToken}`, 'Content-Type': 'application/json' }
      });
    } catch (e) {
      const msg = e.response?.data?.error?.message || e.message || 'Kunde inte uppdatera byråinfo';
      // Vanligt fel när fälten inte finns i tabellen Byråer
      if (String(msg).toLowerCase().includes('unknown field name') && (body.tjanstepriserJson !== undefined || body.fritexttjansterJson !== undefined)) {
        return res.status(400).json({
          error: 'Prisfält saknas i Airtable-tabellen "Byråer". Skapa fälten "Tjänstepriser (JSON)" och "Fritexttjänster (JSON)" (kan även göras via /api/setup/airtable-byra-priser-fields om token har schema-scope).',
          details: msg
        });
      }
      if (String(msg).toLowerCase().includes('unknown field name') && (body.defaultUppsagningstid !== undefined || body.defaultFakturaperiod !== undefined || body.defaultBetalningsvillkor !== undefined)) {
        return res.status(400).json({
          error: 'Avtals-defaults saknas i Airtable-tabellen "Byråer". Skapa fälten "Default uppsägningstid", "Default faktureringsperiod" och "Default betalningsvillkor" (kan även göras via /api/setup/airtable-byra-avtalsdefaults-fields om token har schema-scope).',
          details: msg
        });
      }
      if (String(msg).toLowerCase().includes('unknown field name') && body.uppdragsbrevInformationstext !== undefined) {
        return res.status(400).json({
          error: 'Fältet "Uppdragsbrev informationstext" saknas i Airtable-tabellen "Byråer". Skapa ett fält av typen "Long text" med det namnet.',
          details: msg
        });
      }
      const profilFieldKeys = ['antalKunder', 'vanligasteBolagsformer', 'branscherKundstock', 'andelInternationellHandel', 'andelKontantintensiva', 'leveranssatt', 'geografiskMarknad'];
      if (String(msg).toLowerCase().includes('unknown field name') && profilFieldKeys.some(k => body[k] !== undefined)) {
        return res.status(400).json({
          error: 'BYRÅNS PROFIL-fält saknas i Airtable-tabellen "Byråer". Skapa fälten manuellt eller via POST /api/setup/airtable-byra-profil-fields (kräver schema-token).',
          details: msg
        });
      }
      throw e;
    }
    res.json({ success: true, id: recordId });
  } catch (error) {
    console.error('❌ PUT /api/byra/info:', error.response?.data || error.message);
    const status = error.response?.status || 500;
    res.status(status).json({ error: error.response?.data?.error?.message || error.message });
  }
});

// POST /api/byra/logo – Ladda upp byrålogga (klick på placeholder)
app.post('/api/byra/logo', authenticateToken, async (req, res) => {
  try {
    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
    const airtableBaseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
    if (!airtableAccessToken) return res.status(500).json({ error: 'Airtable token saknas' });

    const result = await getByraerRecordForUser(req);
    if (result.error) return res.status(result.status || 500).json({ error: result.error });

    const allowedRoles = ['ClientFlowAdmin', 'Ledare'];
    if (!allowedRoles.includes(result.userData?.role)) {
      return res.status(403).json({ error: 'Endast Ledare och ClientFlowAdmin får ladda upp logga' });
    }

    const body = req.body || {};
    const fileBase64 = (body.fileBase64 || '').toString();
    const filename = (body.filename || 'logga.png').toString();
    const contentType = (body.contentType || 'image/png').toString();
    if (!fileBase64) return res.status(400).json({ error: 'fileBase64 saknas' });
    if (!/^image\//i.test(contentType)) return res.status(400).json({ error: 'Endast bildfiler tillåts' });

    const buf = Buffer.from(fileBase64, 'base64');
    if (!buf.length) return res.status(400).json({ error: 'Tom fil' });
    if (buf.length > 8 * 1024 * 1024) return res.status(413).json({ error: 'Filen är för stor (max 8MB)' });

    const recordId = result.record.id;
    const BYRAER_TABLE_ID = process.env.BYRAER_TABLE_ID || 'tblAIu1A83AyRTQ3B';
    const att = await uploadAttachmentToAirtableFieldReturnAttachment(
      airtableAccessToken,
      airtableBaseId,
      recordId,
      buf,
      filename,
      contentType,
      BYRAER_TABLE_ID,
      'Logga'
    );
    if (!att) return res.status(500).json({ error: 'Kunde inte ladda upp logga till Airtable' });

    res.json({ success: true, attachment: att });
  } catch (e) {
    console.error('❌ POST /api/byra/logo:', e.response?.data || e.message);
    res.status(500).json({ error: e.response?.data?.error?.message || e.message });
  }
});

// Uppdragsbrev: Byrå-bilagor (sparas i tabellen "Byråer" som attachments)
const BYRA_UPPDRAGSBREV_BILAGOR_FIELD = 'Uppdragsbrev bilagor';
const BYRA_UPPDRAGSBREV_BILAGOR_META_FIELD = 'Uppdragsbrev bilagor meta (JSON)';
const BYRA_UPPDRAGSBREV_BILAGOR_MAX = 6;

function parseByraBilagorMeta(raw) {
  if (!raw) return [];
  try {
    const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (Array.isArray(obj)) return obj;
    return [];
  } catch (_) {
    return [];
  }
}

function labelFromFilename(filename) {
  const s = (filename || '').toString().trim();
  if (!s) return '';
  return s.replace(/\.[a-z0-9]{2,6}$/i, '').trim();
}

function safeFilenameFromLabel(label, fallbackBase = 'bilaga', ext = 'pdf') {
  const base = (label || '').toString().trim() || fallbackBase;
  const cleaned = base
    .replace(/[\\/:*?"<>|]/g, '-')   // windows-forbidden chars
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  const e = (ext || 'pdf').toString().replace(/[^a-z0-9]/gi, '').toLowerCase() || 'pdf';
  return `${cleaned || fallbackBase}.${e}`;
}

app.get('/api/byra/uppdragsbrev/bilagor', authenticateToken, async (req, res) => {
  try {
    const result = await getByraerRecordForUser(req);
    if (result.error) return res.status(result.status || 500).json({ error: result.error });
    const fields = result.record.fields || {};
    const bilagor = Array.isArray(fields[BYRA_UPPDRAGSBREV_BILAGOR_FIELD]) ? fields[BYRA_UPPDRAGSBREV_BILAGOR_FIELD] : [];
    const meta = parseByraBilagorMeta(fields[BYRA_UPPDRAGSBREV_BILAGOR_META_FIELD]);
    const labelById = {};
    meta.forEach(m => { if (m && m.id) labelById[m.id] = (m.label || '').toString(); });
    const out = bilagor.map(b => ({
      ...b,
      label: (b && b.id && labelById[b.id]) ? labelById[b.id] : labelFromFilename(b?.filename)
    }));
    return res.json({ success: true, bilagor: out, max: BYRA_UPPDRAGSBREV_BILAGOR_MAX });
  } catch (error) {
    console.error('❌ GET /api/byra/uppdragsbrev/bilagor:', error.response?.data || error.message);
    const status = error.response?.status || 500;
    return res.status(status).json({ error: error.response?.data?.error?.message || error.message });
  }
});

app.post('/api/byra/uppdragsbrev/bilagor', authenticateToken, async (req, res) => {
  try {
    const result = await getByraerRecordForUser(req);
    if (result.error) return res.status(result.status || 500).json({ error: result.error });
    const allowedRoles = ['ClientFlowAdmin', 'Ledare'];
    if (!allowedRoles.includes(result.userData.role)) {
      return res.status(403).json({ error: 'Endast Ledare och ClientFlowAdmin får lägga upp bilagor' });
    }

    const body = req.body || {};
    const label = (body.label || body.namn || body.name || '').toString().trim();
    const originalFilename = (body.originalFilename || body.filename || '').toString();
    const contentType = (body.contentType || body.mime || 'application/octet-stream').toString();
    const base64 = (body.base64 || '').toString();
    if (!base64 || base64.length < 16) return res.status(400).json({ error: 'base64 saknas' });
    if (!label) return res.status(400).json({ error: 'Bilagan måste ha ett namn (label).' });
    // Endast PDF
    const isPdf = contentType === 'application/pdf' || originalFilename.toLowerCase().endsWith('.pdf');
    if (!isPdf) return res.status(400).json({ error: 'Endast PDF är tillåtet.' });

    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
    const airtableBaseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
    if (!airtableAccessToken) return res.status(500).json({ error: 'Airtable inte konfigurerad (AIRTABLE_ACCESS_TOKEN saknas)' });

    // Max 6 bilagor
    const currentFields = result.record.fields || {};
    const currentList = Array.isArray(currentFields[BYRA_UPPDRAGSBREV_BILAGOR_FIELD]) ? currentFields[BYRA_UPPDRAGSBREV_BILAGOR_FIELD] : [];
    if (currentList.length >= BYRA_UPPDRAGSBREV_BILAGOR_MAX) {
      return res.status(400).json({ error: `Max ${BYRA_UPPDRAGSBREV_BILAGOR_MAX} bilagor.` });
    }

    const fileBuffer = Buffer.from(base64, 'base64');
    const filename = safeFilenameFromLabel(label, 'bilaga', 'pdf');
    const att = await uploadAttachmentToAirtableFieldReturnAttachment(
      airtableAccessToken,
      airtableBaseId,
      result.record.id,
      fileBuffer,
      filename,
      contentType,
      null,
      BYRA_UPPDRAGSBREV_BILAGOR_FIELD
    );

    if (!att) {
      return res.status(400).json({
        error: `Kunde inte ladda upp till Airtable-fältet "${BYRA_UPPDRAGSBREV_BILAGOR_FIELD}". Kontrollera att fältet finns i tabellen "Byråer" och är av typen Attachment.`,
      });
    }

    // Uppdatera meta-JSON med label per attachment-id
    try {
      const prevMeta = parseByraBilagorMeta(currentFields[BYRA_UPPDRAGSBREV_BILAGOR_META_FIELD]);
      const without = prevMeta.filter(m => m && m.id && m.id !== att.id);
      const nextMeta = [...without, { id: att.id, label }].slice(0, 50);
      const patchUrl = `https://api.airtable.com/v0/${airtableBaseId}/${encodeURIComponent('Byråer')}/${result.record.id}`;
      await axios.patch(patchUrl, { fields: { [BYRA_UPPDRAGSBREV_BILAGOR_META_FIELD]: JSON.stringify(nextMeta) } }, {
        headers: { 'Authorization': `Bearer ${airtableAccessToken}`, 'Content-Type': 'application/json' },
        timeout: 15000
      });
    } catch (e) {
      console.warn('ℹ️ Kunde inte uppdatera bilage-metadata:', e.response?.status, e.response?.data || e.message);
    }

    // Läs tillbaka uppdaterade bilagor + meta
    const refreshed = await getByraerRecordForUser(req);
    const refreshedFields = refreshed.record?.fields || {};
    const bilagorRaw = Array.isArray(refreshedFields[BYRA_UPPDRAGSBREV_BILAGOR_FIELD]) ? refreshedFields[BYRA_UPPDRAGSBREV_BILAGOR_FIELD] : [];
    const meta2 = parseByraBilagorMeta(refreshedFields[BYRA_UPPDRAGSBREV_BILAGOR_META_FIELD]);
    const labelById = {};
    meta2.forEach(m => { if (m && m.id) labelById[m.id] = (m.label || '').toString(); });
    const bilagor = bilagorRaw.map(b => ({ ...b, label: (b && b.id && labelById[b.id]) ? labelById[b.id] : labelFromFilename(b?.filename) }));

    return res.json({
      success: true,
      attachment: att,
      bilagor,
      max: BYRA_UPPDRAGSBREV_BILAGOR_MAX
    });
  } catch (error) {
    console.error('❌ POST /api/byra/uppdragsbrev/bilagor:', error.response?.data || error.message);
    const status = error.response?.status || 500;
    return res.status(status).json({ error: error.response?.data?.error?.message || error.message });
  }
});

app.delete('/api/byra/uppdragsbrev/bilagor/:attachmentId', authenticateToken, async (req, res) => {
  try {
    const result = await getByraerRecordForUser(req);
    if (result.error) return res.status(result.status || 500).json({ error: result.error });
    const allowedRoles = ['ClientFlowAdmin', 'Ledare'];
    if (!allowedRoles.includes(result.userData.role)) {
      return res.status(403).json({ error: 'Endast Ledare och ClientFlowAdmin får ta bort bilagor' });
    }

    const attachmentId = (req.params.attachmentId || '').toString().trim();
    if (!attachmentId) return res.status(400).json({ error: 'attachmentId saknas' });

    const current = result.record.fields?.[BYRA_UPPDRAGSBREV_BILAGOR_FIELD];
    const list = Array.isArray(current) ? current : [];
    const remaining = list.filter(a => (a && a.id) ? a.id !== attachmentId : true);

    const toSend = remaining.map(a => {
      if (a && a.id) return { id: a.id };
      if (a && a.url) return { url: a.url };
      return null;
    }).filter(Boolean);

    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
    const airtableBaseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
    if (!airtableAccessToken) return res.status(500).json({ error: 'Airtable inte konfigurerad (AIRTABLE_ACCESS_TOKEN saknas)' });

    const BYRAER_TABLE = 'Byråer';
    const patchUrl = `https://api.airtable.com/v0/${airtableBaseId}/${encodeURIComponent(BYRAER_TABLE)}/${result.record.id}`;
    // Uppdatera även meta så label försvinner
    const prevMeta = parseByraBilagorMeta(result.record.fields?.[BYRA_UPPDRAGSBREV_BILAGOR_META_FIELD]);
    const nextMeta = prevMeta.filter(m => m && m.id && m.id !== attachmentId);
    await axios.patch(patchUrl, { fields: { [BYRA_UPPDRAGSBREV_BILAGOR_FIELD]: toSend, [BYRA_UPPDRAGSBREV_BILAGOR_META_FIELD]: JSON.stringify(nextMeta) } }, {
      headers: { 'Authorization': `Bearer ${airtableAccessToken}`, 'Content-Type': 'application/json' },
      timeout: 15000
    });

    // Läs tillbaka uppdaterade bilagor
    const refreshed = await getByraerRecordForUser(req);
    const refreshedFields = refreshed.record?.fields || {};
    const bilagorRaw = Array.isArray(refreshedFields[BYRA_UPPDRAGSBREV_BILAGOR_FIELD]) ? refreshedFields[BYRA_UPPDRAGSBREV_BILAGOR_FIELD] : [];
    const meta2 = parseByraBilagorMeta(refreshedFields[BYRA_UPPDRAGSBREV_BILAGOR_META_FIELD]);
    const labelById = {};
    meta2.forEach(m => { if (m && m.id) labelById[m.id] = (m.label || '').toString(); });
    const bilagor = bilagorRaw.map(b => ({ ...b, label: (b && b.id && labelById[b.id]) ? labelById[b.id] : labelFromFilename(b?.filename) }));
    return res.json({ success: true, bilagor, max: BYRA_UPPDRAGSBREV_BILAGOR_MAX });
  } catch (error) {
    console.error('❌ DELETE /api/byra/uppdragsbrev/bilagor:', error.response?.data || error.message);
    const status = error.response?.status || 500;
    return res.status(status).json({ error: error.response?.data?.error?.message || error.message });
  }
});

// POST /api/setup/airtable-byra-avtalsdefaults-fields – Lägg till default-fält för uppdragsavtal i tabellen "Byråer" (auth)
// Kräver Personal Access Token med schema.bases:read och schema.bases:write.
app.post('/api/setup/airtable-byra-avtalsdefaults-fields', authenticateToken, async (req, res) => {
  const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
  if (!airtableAccessToken) return res.status(500).json({ success: false, error: 'AIRTABLE_ACCESS_TOKEN saknas' });
  try {
    const metaRes = await axios.get(`https://api.airtable.com/v0/meta/bases/${baseId}/tables`, {
      headers: { Authorization: `Bearer ${airtableAccessToken}` },
      timeout: 15000
    });
    const tables = metaRes.data?.tables || [];
    const byraTable = tables.find(t => (t.name || '').trim().toLowerCase() === 'byråer' || (t.name || '').trim().toLowerCase() === 'byraer');
    if (!byraTable) return res.status(404).json({ success: false, error: 'Tabellen "Byråer" hittades inte i basen.' });

    const required = [
      { name: 'Default uppsägningstid', type: 'number', description: 'Default uppsägningstid i månader för nya uppdragsavtal' },
      { name: 'Default faktureringsperiod', type: 'singleSelect', description: 'Default faktureringsperiod för nya uppdragsavtal', options: { choices: [{ name: 'Månadsvis' }, { name: 'Kvartalsvis' }, { name: 'Halvårsvis' }, { name: 'Årsvis' }, { name: 'Löpande' }] } },
      { name: 'Default betalningsvillkor', type: 'number', description: 'Default betalningsvillkor i dagar för nya uppdragsavtal' }
    ];

    const existingNames = (byraTable.fields || []).map(f => (f.name || '').trim());
    const toCreate = required.filter(f => !existingNames.includes((f.name || '').trim()));
    const created = [];
    const createUrl = `https://api.airtable.com/v0/meta/bases/${baseId}/tables/${byraTable.id}/fields`;

    for (const field of toCreate) {
      try {
        const body = { name: field.name, type: field.type };
        if (field.description) body.description = field.description;
        if (field.options) body.options = field.options;
        await axios.post(createUrl, body, {
          headers: { Authorization: `Bearer ${airtableAccessToken}`, 'Content-Type': 'application/json' },
          timeout: 10000
        });
        created.push(field.name);
      } catch (e) {
        const msg = e.response?.data?.error?.message || e.message;
        console.warn('Kunde inte skapa avtals-default-fält', field.name, msg);
      }
    }

    const skipped = required.length - toCreate.length;
    return res.json({
      success: true,
      message: created.length
        ? `${created.length} fält lades till i Byråer. ${skipped} fanns redan.`
        : `Alla ${required.length} avtals-defaults finns redan i tabellen Byråer.`,
      created,
      alreadyExisted: skipped
    });
  } catch (err) {
    const status = err.response?.status;
    const data = err.response?.data || {};
    const msg = (data.error && data.error.message) || data.message || err.message;
    console.error('Setup Byrå avtals-defaults fält:', status, msg);
    if (status === 403 || status === 401) {
      return res.status(status).json({
        success: false,
        error: 'Token saknar behörighet. Använd en Airtable Personal Access Token med scope schema.bases:read och schema.bases:write.',
        details: msg
      });
    }
    return res.status(status || 500).json({ success: false, error: msg || 'Kunde inte uppdatera tabellen Byråer' });
  }
});

// POST /api/setup/airtable-byra-uppdragsbrev-bilagor-field – Lägg till attachment-fält för uppdragsbrev-bilagor i tabellen "Byråer"
// Kräver Personal Access Token med schema.bases:read och schema.bases:write.
app.post('/api/setup/airtable-byra-uppdragsbrev-bilagor-field', authenticateToken, async (req, res) => {
  const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
  if (!airtableAccessToken) return res.status(500).json({ success: false, error: 'AIRTABLE_ACCESS_TOKEN saknas' });
  try {
    const metaRes = await axios.get(`https://api.airtable.com/v0/meta/bases/${baseId}/tables`, {
      headers: { Authorization: `Bearer ${airtableAccessToken}` },
      timeout: 15000
    });
    const tables = metaRes.data?.tables || [];
    const byraTable = tables.find(t => (t.name || '').trim().toLowerCase() === 'byråer' || (t.name || '').trim().toLowerCase() === 'byraer');
    if (!byraTable) return res.status(404).json({ success: false, error: 'Tabellen "Byråer" hittades inte i basen.' });

    const existingNames = (byraTable.fields || []).map(f => (f.name || '').trim());
    if (existingNames.includes(BYRA_UPPDRAGSBREV_BILAGOR_FIELD)) {
      return res.json({ success: true, message: `Fältet "${BYRA_UPPDRAGSBREV_BILAGOR_FIELD}" finns redan i tabellen Byråer.` });
    }

    const createUrl = `https://api.airtable.com/v0/meta/bases/${baseId}/tables/${byraTable.id}/fields`;
    await axios.post(createUrl, {
      name: BYRA_UPPDRAGSBREV_BILAGOR_FIELD,
      type: 'multipleAttachments',
      description: 'Bilagor som byrån själv kan använda i uppdragsbrev/uppdragsavtal.'
    }, {
      headers: { Authorization: `Bearer ${airtableAccessToken}`, 'Content-Type': 'application/json' },
      timeout: 10000
    });

    return res.json({ success: true, message: `Fältet "${BYRA_UPPDRAGSBREV_BILAGOR_FIELD}" skapades i tabellen Byråer.` });
  } catch (err) {
    const status = err.response?.status;
    const data = err.response?.data || {};
    const msg = (data.error && data.error.message) || data.message || err.message;
    console.error('Setup Byrå uppdragsbrev bilagor-fält:', status, msg);
    if (status === 403 || status === 401) {
      return res.status(status).json({
        success: false,
        error: 'Token saknar behörighet. Använd en Airtable Personal Access Token med scope schema.bases:read och schema.bases:write.',
        details: msg
      });
    }
    return res.status(status || 500).json({ success: false, error: msg || 'Kunde inte uppdatera tabellen Byråer' });
  }
});

// POST /api/setup/airtable-byra-priser-fields – Lägg till fält för prislista i tabellen "Byråer" (auth)
// Kräver Personal Access Token med schema.bases:read och schema.bases:write.
app.post('/api/setup/airtable-byra-priser-fields', authenticateToken, async (req, res) => {
  const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
  if (!airtableAccessToken) return res.status(500).json({ success: false, error: 'AIRTABLE_ACCESS_TOKEN saknas' });
  try {
    const metaRes = await axios.get(`https://api.airtable.com/v0/meta/bases/${baseId}/tables`, {
      headers: { Authorization: `Bearer ${airtableAccessToken}` },
      timeout: 15000
    });
    const tables = metaRes.data?.tables || [];
    const byraTable = tables.find(t => (t.name || '').trim().toLowerCase() === 'byråer' || (t.name || '').trim().toLowerCase() === 'byraer');
    if (!byraTable) return res.status(404).json({ success: false, error: 'Tabellen "Byråer" hittades inte i basen.' });

    const required = [
      { name: 'Tjänstepriser (JSON)', type: 'multilineText', description: 'JSON med pris per tjänst (nyckel = tjänstnamn). Ex: {\"Löpande bokföring\": {\"pris\": 1200, \"enhet\": \"h\"}}' },
      { name: 'Fritexttjänster (JSON)', type: 'multilineText', description: 'JSON-array med extra tjänster och priser. Ex: [{\"namn\":\"Rådgivning ad hoc\",\"pris\":1200,\"enhet\":\"h\"}]' }
    ];

    const existingNames = (byraTable.fields || []).map(f => (f.name || '').trim());
    const toCreate = required.filter(f => !existingNames.includes((f.name || '').trim()));
    const created = [];
    const createUrl = `https://api.airtable.com/v0/meta/bases/${baseId}/tables/${byraTable.id}/fields`;

    for (const field of toCreate) {
      try {
        const body = { name: field.name, type: field.type };
        if (field.description) body.description = field.description;
        await axios.post(createUrl, body, {
          headers: { Authorization: `Bearer ${airtableAccessToken}`, 'Content-Type': 'application/json' },
          timeout: 10000
        });
        created.push(field.name);
      } catch (e) {
        const msg = e.response?.data?.error?.message || e.message;
        console.warn('Kunde inte skapa pris-fält', field.name, msg);
      }
    }

    const skipped = required.length - toCreate.length;
    return res.json({
      success: true,
      message: created.length
        ? `${created.length} fält lades till i Byråer. ${skipped} fanns redan.`
        : `Alla ${required.length} prisfält finns redan i tabellen Byråer.`,
      created,
      alreadyExisted: skipped
    });
  } catch (err) {
    const status = err.response?.status;
    const data = err.response?.data || {};
    const msg = (data.error && data.error.message) || data.message || err.message;
    console.error('Setup Byrå-priser fält:', status, msg);
    if (status === 403 || status === 401) {
      return res.status(status).json({
        success: false,
        error: 'Token saknar behörighet. Använd en Airtable Personal Access Token med scope schema.bases:read och schema.bases:write.',
        details: msg
      });
    }
    return res.status(status || 500).json({ success: false, error: msg || 'Kunde inte uppdatera tabellen Byråer' });
  }
});

// POST /api/setup/airtable-byra-profil-fields – BYRÅNS PROFIL-fält i tabellen "Byråer" (auth)
// Kräver Personal Access Token med schema.bases:read och schema.bases:write.
app.post('/api/setup/airtable-byra-profil-fields', authenticateToken, async (req, res) => {
  const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
  if (!airtableAccessToken) return res.status(500).json({ success: false, error: 'AIRTABLE_ACCESS_TOKEN saknas' });
  try {
    const metaRes = await axios.get(`https://api.airtable.com/v0/meta/bases/${baseId}/tables`, {
      headers: { Authorization: `Bearer ${airtableAccessToken}` },
      timeout: 15000
    });
    const tables = metaRes.data?.tables || [];
    const byraTable = tables.find(t => {
      const n = (t.name || '').trim().toLowerCase();
      return n === 'byråer' || n === 'byraer' || n === 'byråns profil' || n === 'byrans profil';
    });
    if (!byraTable) return res.status(404).json({ success: false, error: 'Tabellen "Byråer" (BYRÅNS PROFIL) hittades inte i basen.' });

    const required = [
      { name: 'Antal kunder', type: 'number', description: 'Antal kunder i byråns kundstock (för riskkalibrering)' },
      { name: 'Vanligaste bolagsformer', type: 'multilineText', description: 'Vanligaste bolagsformer i kundstocken' },
      { name: 'Branscher i kundstocken', type: 'multilineText', description: 'Branscher som förekommer i kundstocken' },
      { name: 'Andel kunder med internationell handel', type: 'number', description: 'Andel kunder med internationell handel (0–100 %)' },
      { name: 'Andel kontantintensiva kunder', type: 'number', description: 'Andel kontantintensiva kunder (0–100 %)' },
      { name: 'Leveranssätt', type: 'singleSelect', description: 'Hur tjänster erbjuds', options: { choices: [{ name: 'På plats' }, { name: 'Distans' }, { name: 'Blandat' }] } },
      { name: 'Geografisk marknad', type: 'multilineText', description: 'Geografisk marknad för byråns kunder' }
    ];

    const existingNames = (byraTable.fields || []).map(f => (f.name || '').trim());
    const toCreate = required.filter(f => !existingNames.includes((f.name || '').trim()));
    const created = [];
    const createUrl = `https://api.airtable.com/v0/meta/bases/${baseId}/tables/${byraTable.id}/fields`;

    for (const field of toCreate) {
      try {
        const body = { name: field.name, type: field.type };
        if (field.description) body.description = field.description;
        if (field.options) body.options = field.options;
        await axios.post(createUrl, body, {
          headers: { Authorization: `Bearer ${airtableAccessToken}`, 'Content-Type': 'application/json' },
          timeout: 10000
        });
        created.push(field.name);
      } catch (e) {
        const msg = e.response?.data?.error?.message || e.message;
        console.warn('Kunde inte skapa BYRÅNS PROFIL-fält', field.name, msg);
      }
    }

    const skipped = required.length - toCreate.length;
    return res.json({
      success: true,
      message: created.length
        ? `${created.length} BYRÅNS PROFIL-fält lades till i "${byraTable.name}". ${skipped} fanns redan.`
        : `Alla ${required.length} BYRÅNS PROFIL-fält finns redan i tabellen ${byraTable.name}.`,
      table: byraTable.name,
      created,
      alreadyExisted: skipped
    });
  } catch (err) {
    const status = err.response?.status;
    const data = err.response?.data || {};
    const msg = (data.error && data.error.message) || data.message || err.message;
    console.error('Setup BYRÅNS PROFIL-fält:', status, msg);
    if (status === 403 || status === 401) {
      return res.status(status).json({
        success: false,
        error: 'Token saknar behörighet. Använd en Airtable Personal Access Token med scope schema.bases:read och schema.bases:write.',
        details: msg
      });
    }
    return res.status(status || 500).json({ success: false, error: msg || 'Kunde inte uppdatera BYRÅNS PROFIL-fält' });
  }
});

// GET /api/byra/anvandare – Lista användare som tillhör inloggad byrå (Application Users)
app.get('/api/byra/anvandare', authenticateToken, async (req, res) => {
  try {
    const result = await getByraerRecordForUser(req);
    if (result.error) return res.status(result.status || 500).json({ error: result.error });
    const byraId = result.byraId;
    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
    const airtableBaseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
    const byraIdEsc = String(byraId).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const filterFormula = `{Byrå ID i text 2}="${byraIdEsc}"`;
    const url = `https://api.airtable.com/v0/${airtableBaseId}/${encodeURIComponent(USERS_TABLE)}?filterByFormula=${encodeURIComponent(filterFormula)}`;
    const airtableRes = await axios.get(url, {
      headers: { 'Authorization': `Bearer ${airtableAccessToken}` }
    });
    const users = (airtableRes.data.records || []).map(r => {
      const f = r.fields || {};
      return {
        id: r.id,
        email: f['Email'] || '',
        name: f['Full Name'] || f['Namn'] || '',
        role: f['Role'] || '',
        byra: f['Byrå'] || f['fldcZZOiC9y5BKFWf'] || '',
        byraId: f['Byrå ID i text 2'] || ''
      };
    });
    res.json({ success: true, users });
  } catch (error) {
    console.error('❌ GET /api/byra/anvandare:', error.response?.data || error.message);
    const status = error.response?.status || 500;
    res.status(status).json({ error: error.response?.data?.error?.message || error.message });
  }
});

// POST /api/byra/anvandare – Skapa ny användare i Application Users (samma byrå)
app.post('/api/byra/anvandare', authenticateToken, async (req, res) => {
  try {
    const result = await getByraerRecordForUser(req);
    if (result.error) return res.status(result.status || 500).json({ error: result.error });
    const allowedRoles = ['ClientFlowAdmin', 'Ledare'];
    if (!allowedRoles.includes(result.userData.role)) {
      return res.status(403).json({ error: 'Endast Ledare och ClientFlowAdmin får skapa användare' });
    }
    const body = req.body || {};
    const email = (body.email || '').toString().trim();
    const name = (body.name || body.fullName || '').toString().trim();
    const role = (body.role || 'Användare').toString().trim();
    const password = (body.password || '').toString();
    if (!email) return res.status(400).json({ error: 'E-post krävs' });
    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
    const airtableBaseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
    const byraRecordId = result.record.id;
    const byraId = result.byraId;
    const fields = {
      'Email': email,
      'Full Name': name || email,
      'Role': role || 'Användare',
      'Byrå ID i text 2': byraId
    };
    if (password) fields['password'] = password;
    const linkField = 'Byråer';
    try {
      const existing = await axios.get(
        `https://api.airtable.com/v0/${airtableBaseId}/${encodeURIComponent(USERS_TABLE)}?filterByFormula=${encodeURIComponent(`{Email}="${email.replace(/"/g, '\\"')}"`)}&maxRecords=1`,
        { headers: { 'Authorization': `Bearer ${airtableAccessToken}` } }
      );
      if (existing.data.records && existing.data.records.length > 0) {
        return res.status(409).json({ error: 'En användare med denna e-post finns redan' });
      }
    } catch (_) {}
    fields[linkField] = [byraRecordId];
    const createUrl = `https://api.airtable.com/v0/${airtableBaseId}/${encodeURIComponent(USERS_TABLE)}`;
    const createRes = await axios.post(createUrl, { fields }, {
      headers: { 'Authorization': `Bearer ${airtableAccessToken}`, 'Content-Type': 'application/json' }
    });
    const record = createRes.data;
    res.status(201).json({
      success: true,
      id: record.id,
      user: {
        id: record.id,
        email: fields['Email'],
        name: fields['Full Name'],
        role: fields['Role'],
        byraId
      }
    });
  } catch (error) {
    console.error('❌ POST /api/byra/anvandare:', error.response?.data || error.message);
    const status = error.response?.status || 500;
    res.status(status).json({ error: error.response?.data?.error?.message || error.message });
  }
});

// PUT /api/byra/anvandare/:id – Uppdatera användare (samma byrå)
app.put('/api/byra/anvandare/:id', authenticateToken, async (req, res) => {
  try {
    const result = await getByraerRecordForUser(req);
    if (result.error) return res.status(result.status || 500).json({ error: result.error });
    const allowedRoles = ['ClientFlowAdmin', 'Ledare'];
    if (!allowedRoles.includes(result.userData.role)) {
      return res.status(403).json({ error: 'Endast Ledare och ClientFlowAdmin får redigera användare' });
    }
    const { id } = req.params;
    const body = req.body || {};
    const byraId = result.byraId;
    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
    const airtableBaseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
    const getUrl = `https://api.airtable.com/v0/${airtableBaseId}/${encodeURIComponent(USERS_TABLE)}/${id}`;
    const getRes = await axios.get(getUrl, { headers: { 'Authorization': `Bearer ${airtableAccessToken}` } });
    const existing = getRes.data;
    const userByraId = (existing.fields || {})['Byrå ID i text 2'];
    if (String(userByraId).trim() !== String(byraId).trim()) {
      return res.status(403).json({ error: 'Du kan bara redigera användare i din egen byrå' });
    }
    const fields = {};
    if (body.email !== undefined) fields['Email'] = String(body.email).trim();
    if (body.name !== undefined) fields['Full Name'] = String(body.name).trim();
    if (body.fullName !== undefined) fields['Full Name'] = String(body.fullName).trim();
    if (body.role !== undefined) fields['Role'] = String(body.role).trim();
    if (body.password !== undefined && body.password !== '') fields['password'] = String(body.password);
    if (Object.keys(fields).length === 0) {
      return res.status(400).json({ error: 'Inga fält att uppdatera' });
    }
    const patchUrl = `https://api.airtable.com/v0/${airtableBaseId}/${encodeURIComponent(USERS_TABLE)}/${id}`;
    const patchRes = await axios.patch(patchUrl, { fields }, {
      headers: { 'Authorization': `Bearer ${airtableAccessToken}`, 'Content-Type': 'application/json' }
    });
    res.json({ success: true, id: patchRes.data.id, record: patchRes.data });
  } catch (error) {
    if (error.response && error.response.status === 404) {
      return res.status(404).json({ error: 'Användaren hittades inte' });
    }
    console.error('❌ PUT /api/byra/anvandare:', error.response?.data || error.message);
    const status = error.response?.status || 500;
    res.status(status).json({ error: error.response?.data?.error?.message || error.message });
  }
});

// Utbildningar – Airtable-tabell "Utbildningar" (samma som Registrera utbildning)
const UTBILDNINGAR_TABLE = 'Utbildningar';

// GET /api/byra/utbildningar – Lista utbildningar för inloggad byrå
app.get('/api/byra/utbildningar', authenticateToken, async (req, res) => {
  try {
    const result = await getByraerRecordForUser(req);
    if (result.error) return res.status(result.status || 500).json({ error: result.error });
    const byraId = result.byraId;
    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
    const airtableBaseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
    const byraIdEsc = String(byraId).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const filterFormula = `{Byrå ID}="${byraIdEsc}"`;
    let url = `https://api.airtable.com/v0/${airtableBaseId}/${encodeURIComponent(UTBILDNINGAR_TABLE)}?filterByFormula=${encodeURIComponent(filterFormula)}`;
    const all = [];
    do {
      const airtableRes = await axios.get(url, {
        headers: { 'Authorization': `Bearer ${airtableAccessToken}` }
      });
      const records = airtableRes.data.records || [];
      all.push(...records);
      url = airtableRes.data.offset
        ? `https://api.airtable.com/v0/${airtableBaseId}/${encodeURIComponent(UTBILDNINGAR_TABLE)}?offset=${airtableRes.data.offset}&filterByFormula=${encodeURIComponent(filterFormula)}`
        : null;
    } while (url);
    const list = all.map(r => {
      const f = r.fields || {};
      return {
        id: r.id,
        namn: f['Namn'] || f['Utbildningsnamn'] || '',
        datum: f['Datum'] || '',
        beskrivning: f['Beskrivning'] || '',
        typ: f['Typ'] || f['Utbildningstyp'] || '',
        kategori: f['Kategori'] || '',
        plats: f['Plats'] || '',
        deltagare: f['Deltagare'] || []
      };
    });
    res.json({ success: true, utbildningar: list });
  } catch (error) {
    if (error.response && error.response.status === 404) {
      return res.json({ success: true, utbildningar: [] });
    }
    console.error('❌ GET /api/byra/utbildningar:', error.response?.data || error.message);
    const status = error.response?.status || 500;
    res.status(status).json({ error: error.response?.data?.error?.message || error.message });
  }
});

// POST /api/byra/utbildningar – Skapa utbildning (kopplad till byrå)
app.post('/api/byra/utbildningar', authenticateToken, async (req, res) => {
  try {
    const result = await getByraerRecordForUser(req);
    if (result.error) return res.status(result.status || 500).json({ error: result.error });
    const body = req.body || {};
    const byraRecordId = result.record.id;
    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
    const airtableBaseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
    const fields = {
      'Namn': (body.namn || body.name || '').toString().trim() || 'Namnlös utbildning',
      'Byrå': [byraRecordId],
      'Byrå ID': result.byraId
    };
    if (body.datum !== undefined) fields['Datum'] = body.datum;
    if (body.beskrivning !== undefined) fields['Beskrivning'] = String(body.beskrivning || '');
    if (body.typ !== undefined) fields['Typ'] = String(body.typ || '');
    if (body.kategori !== undefined) fields['Kategori'] = String(body.kategori || '');
    if (body.plats !== undefined) fields['Plats'] = String(body.plats || '');
    if (body.deltagare && Array.isArray(body.deltagare) && body.deltagare.length > 0) {
      fields['Deltagare'] = body.deltagare;
    }
    const createUrl = `https://api.airtable.com/v0/${airtableBaseId}/${encodeURIComponent(UTBILDNINGAR_TABLE)}`;
    const createRes = await axios.post(createUrl, { fields }, {
      headers: { 'Authorization': `Bearer ${airtableAccessToken}`, 'Content-Type': 'application/json' }
    });
    const record = createRes.data;
    res.status(201).json({
      success: true,
      id: record.id,
      utbildning: {
        id: record.id,
        namn: fields['Namn'],
        datum: fields['Datum'],
        beskrivning: fields['Beskrivning'],
        typ: fields['Typ']
      }
    });
  } catch (error) {
    console.error('❌ POST /api/byra/utbildningar:', error.response?.data || error.message);
    const status = error.response?.status || 500;
    res.status(status).json({ error: error.response?.data?.error?.message || error.message });
  }
});

// AML Grundkurs – genomförda registreras i tabell "Utbildningsslutförande" (Användare, Byrå ID, Kurs, Genomförd)
const UTBILDNING_SLUTFORANDE_TABLE = 'Utbildningsslutförande';
const AML_KURS_NAMN = 'AML Grundkurs';

// GET /api/utbildning/aml-status – Har inloggad användare slutfört AML Grundkurs?
app.get('/api/utbildning/aml-status', authenticateToken, async (req, res) => {
  try {
    const userData = await getAirtableUser(req.user.email);
    if (!userData || !userData.id) return res.status(404).json({ error: 'Användare hittades inte' });
    const byraId = (userData.byraId != null) ? String(userData.byraId).trim() : '';
    if (!byraId) return res.json({ completed: false });
    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
    const airtableBaseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
    const byraEsc = byraId.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const kursEsc = String(AML_KURS_NAMN).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const formula = `AND({Byrå ID}="${byraEsc}", {Kurs}="${kursEsc}")`;
    let url = `https://api.airtable.com/v0/${airtableBaseId}/${encodeURIComponent(UTBILDNING_SLUTFORANDE_TABLE)}?filterByFormula=${encodeURIComponent(formula)}`;
    let completed = false;
    do {
      const atRes = await axios.get(url, { headers: { 'Authorization': `Bearer ${airtableAccessToken}` } });
      const records = atRes.data.records || [];
      const hasUser = records.some(r => {
        const ids = r.fields && r.fields['Användare'];
        const arr = Array.isArray(ids) ? ids : (ids ? [ids] : []);
        return arr.includes(userData.id);
      });
      if (hasUser) { completed = true; break; }
      url = atRes.data.offset ? `https://api.airtable.com/v0/${airtableBaseId}/${encodeURIComponent(UTBILDNING_SLUTFORANDE_TABLE)}?offset=${atRes.data.offset}&filterByFormula=${encodeURIComponent(formula)}` : null;
    } while (url);
    res.json({ completed });
  } catch (err) {
    if (err.response && err.response.status === 404) return res.json({ completed: false });
    console.error('GET /api/utbildning/aml-status:', err.message);
    res.status(500).json({ error: err.response?.data?.error?.message || err.message });
  }
});

// POST /api/utbildning/aml-complete – Registrera att användaren slutfört AML Grundkurs
app.post('/api/utbildning/aml-complete', authenticateToken, async (req, res) => {
  try {
    const userData = await getAirtableUser(req.user.email);
    if (!userData || !userData.id) return res.status(404).json({ error: 'Användare hittades inte' });
    const byraId = (userData.byraId != null) ? String(userData.byraId).trim() : '';
    if (!byraId) return res.status(400).json({ error: 'Ingen byrå kopplad till användaren' });
    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
    const airtableBaseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
    const fields = {
      'Användare': [userData.id],
      'Byrå ID': byraId,
      'Kurs': AML_KURS_NAMN,
      'Genomförd': new Date().toISOString().slice(0, 10)
    };
    const createUrl = `https://api.airtable.com/v0/${airtableBaseId}/${encodeURIComponent(UTBILDNING_SLUTFORANDE_TABLE)}`;
    await axios.post(createUrl, { fields }, {
      headers: { 'Authorization': `Bearer ${airtableAccessToken}`, 'Content-Type': 'application/json' }
    });
    res.json({ success: true, completed: true });
  } catch (err) {
    console.error('POST /api/utbildning/aml-complete:', err.response?.data || err.message);
    res.status(err.response?.status || 500).json({ error: err.response?.data?.error?.message || err.message });
  }
});

// GET /api/utbildning/genomforda – Lista genomförda AML (Ledare: alla på byrån, Anställd: bara sig själv)
app.get('/api/utbildning/genomforda', authenticateToken, async (req, res) => {
  try {
    const userData = await getAirtableUser(req.user.email);
    if (!userData || !userData.byraId) return res.status(400).json({ error: 'Användare eller byrå saknas' });
    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
    const airtableBaseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
    const byraId = String(userData.byraId).trim();
    const role = (userData.role || '').toLowerCase();
    const isAnstalld = role === 'anställd' || role === 'anstald';
    const byraEsc = byraId.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const kursEsc = String(AML_KURS_NAMN).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const formula = `AND({Byrå ID}="${byraEsc}", {Kurs}="${kursEsc}")`;
    let url = `https://api.airtable.com/v0/${airtableBaseId}/${encodeURIComponent(UTBILDNING_SLUTFORANDE_TABLE)}?filterByFormula=${encodeURIComponent(formula)}`;
    const all = [];
    do {
      const atRes = await axios.get(url, { headers: { 'Authorization': `Bearer ${airtableAccessToken}` } });
      const records = atRes.data.records || [];
      all.push(...records);
      url = atRes.data.offset ? `https://api.airtable.com/v0/${airtableBaseId}/${encodeURIComponent(UTBILDNING_SLUTFORANDE_TABLE)}?offset=${atRes.data.offset}&filterByFormula=${encodeURIComponent(formula)}` : null;
    } while (url);
    let filtered = all;
    if (isAnstalld) {
      filtered = all.filter(r => {
        const ids = r.fields && r.fields['Användare'];
        const arr = Array.isArray(ids) ? ids : (ids ? [ids] : []);
        return arr.includes(userData.id);
      });
    }
    const list = [];
    for (const r of filtered) {
      const f = r.fields || {};
      const userId = Array.isArray(f['Användare']) ? f['Användare'][0] : f['Användare'];
      let namn = '';
      if (userId && airtableAccessToken && airtableBaseId) {
        try {
          const uRes = await axios.get(`https://api.airtable.com/v0/${airtableBaseId}/${encodeURIComponent(USERS_TABLE)}/${userId}`, { headers: { 'Authorization': `Bearer ${airtableAccessToken}` } });
          const uf = (uRes.data && uRes.data.fields) || {};
          namn = uf['Full Name'] || uf['Email'] || userId;
        } catch (_) { namn = userId; }
      } else { namn = userId || ''; }
      list.push({
        id: r.id,
        användarId: userId,
        användarNamn: namn,
        byråId: f['Byrå ID'],
        kurs: f['Kurs'],
        genomförd: f['Genomförd']
      });
    }
    res.json({ success: true, genomforda: list });
  } catch (err) {
    if (err.response && err.response.status === 404) return res.json({ success: true, genomforda: [] });
    console.error('GET /api/utbildning/genomforda:', err.message);
    res.status(500).json({ error: err.response?.data?.error?.message || err.message });
  }
});

// GET /api/settings/dokumentation-pdfs – Hämta sparad PDF-lista från Byråer (databas)
const DOKUMENTATION_PDF_FIELD = 'Dokumentation PDF-lista';
app.get('/api/settings/dokumentation-pdfs', authenticateToken, async (req, res) => {
  try {
    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
    const airtableBaseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
    const BYRAER_TABLE = 'Byråer';
    if (!airtableAccessToken) return res.status(500).json({ error: 'Airtable token saknas' });
    const userData = await getAirtableUser(req.user.email);
    if (!userData) return res.status(404).json({ error: 'Användare hittades inte' });
    const byraId = userData.byraId ? String(userData.byraId).trim() : '';
    if (!byraId) return res.status(400).json({ error: 'Ingen byrå kopplad' });
    const num = parseInt(byraId);
    const filterFormula = isNaN(num) ? `{Byrå ID}="${byraId}"` : `OR({Byrå ID}="${byraId}",{Byrå ID}=${byraId})`;
    const url = `https://api.airtable.com/v0/${airtableBaseId}/${encodeURIComponent(BYRAER_TABLE)}?filterByFormula=${encodeURIComponent(filterFormula)}&maxRecords=1`;
    const airtableRes = await axios.get(url, { headers: { 'Authorization': `Bearer ${airtableAccessToken}` } });
    if (!airtableRes.data.records?.length) return res.json({ list: [] });
    const raw = airtableRes.data.records[0].fields[DOKUMENTATION_PDF_FIELD];
    let list = [];
    if (raw && typeof raw === 'string') { try { list = JSON.parse(raw); } catch (_) {} }
    if (!Array.isArray(list)) list = [];
    res.json({ list });
  } catch (error) {
    console.error('❌ GET /api/settings/dokumentation-pdfs:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/settings/dokumentation-pdfs – Spara PDF-lista till Byråer (databas)
app.put('/api/settings/dokumentation-pdfs', authenticateToken, async (req, res) => {
  try {
    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
    const airtableBaseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
    const BYRAER_TABLE = 'Byråer';
    if (!airtableAccessToken) return res.status(500).json({ error: 'Airtable token saknas' });
    const userData = await getAirtableUser(req.user.email);
    if (!userData) return res.status(404).json({ error: 'Användare hittades inte' });
    const byraId = userData.byraId ? String(userData.byraId).trim() : '';
    if (!byraId) return res.status(400).json({ error: 'Ingen byrå kopplad' });
    const { list } = req.body;
    if (!Array.isArray(list)) return res.status(400).json({ error: 'Body måste innehålla { list: array }' });
    const num = parseInt(byraId);
    const filterFormula = isNaN(num) ? `{Byrå ID}="${byraId}"` : `OR({Byrå ID}="${byraId}",{Byrå ID}=${byraId})`;
    const listUrl = `https://api.airtable.com/v0/${airtableBaseId}/${encodeURIComponent(BYRAER_TABLE)}?filterByFormula=${encodeURIComponent(filterFormula)}&maxRecords=1`;
    const listRes = await axios.get(listUrl, { headers: { 'Authorization': `Bearer ${airtableAccessToken}` } });
    if (!listRes.data.records?.length) return res.status(404).json({ error: 'Ingen Byråer-post hittades för er byrå' });
    const recordId = listRes.data.records[0].id;
    const patchUrl = `https://api.airtable.com/v0/${airtableBaseId}/${encodeURIComponent(BYRAER_TABLE)}/${recordId}`;
    await axios.patch(patchUrl, {
      fields: { [DOKUMENTATION_PDF_FIELD]: JSON.stringify(list) }
    }, { headers: { 'Authorization': `Bearer ${airtableAccessToken}`, 'Content-Type': 'application/json' } });
    res.json({ success: true });
  } catch (error) {
    console.error('❌ PUT /api/settings/dokumentation-pdfs:', error.response?.data || error.message);
    const status = error.response?.status || 500;
    res.status(status).json({ error: error.response?.data?.error?.message || error.message || 'Okänt fel' });
  }
});

// GET /api/settings/kom-igang – Hämta Kom igång-checkboxar från Byråer (databas)
const KOM_IGANG_FIELD = 'Kom igång state';
app.get('/api/settings/kom-igang', authenticateToken, async (req, res) => {
  try {
    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
    const airtableBaseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
    const BYRAER_TABLE = 'Byråer';

    if (!airtableAccessToken) {
      return res.status(500).json({ error: 'Airtable token saknas' });
    }

    const userData = await getAirtableUser(req.user.email);
    if (!userData) return res.status(404).json({ error: 'Användare hittades inte' });

    const byraId = userData.byraId ? String(userData.byraId).trim() : '';
    if (!byraId) return res.status(400).json({ error: 'Ingen byrå kopplad' });

    const num = parseInt(byraId);
    const filterFormula = isNaN(num) ? `{Byrå ID}="${byraId}"` : `OR({Byrå ID}="${byraId}",{Byrå ID}=${byraId})`;
    const url = `https://api.airtable.com/v0/${airtableBaseId}/${encodeURIComponent(BYRAER_TABLE)}?filterByFormula=${encodeURIComponent(filterFormula)}&maxRecords=1`;
    const airtableRes = await axios.get(url, { headers: { 'Authorization': `Bearer ${airtableAccessToken}` } });

    if (!airtableRes.data.records?.length) {
      return res.json({ state: {} });
    }

    const raw = airtableRes.data.records[0].fields[KOM_IGANG_FIELD];
    let state = {};
    if (raw && typeof raw === 'string') {
      try {
        state = JSON.parse(raw);
      } catch (_) {}
    }
    res.json({ state });
  } catch (error) {
    console.error('❌ GET /api/settings/kom-igang:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/settings/kom-igang – Spara Kom igång-checkboxar till Byråer (databas)
app.put('/api/settings/kom-igang', authenticateToken, async (req, res) => {
  try {
    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
    const airtableBaseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
    const BYRAER_TABLE = 'Byråer';

    if (!airtableAccessToken) {
      return res.status(500).json({ error: 'Airtable token saknas' });
    }

    const userData = await getAirtableUser(req.user.email);
    if (!userData) return res.status(404).json({ error: 'Användare hittades inte' });

    const byraId = userData.byraId ? String(userData.byraId).trim() : '';
    if (!byraId) return res.status(400).json({ error: 'Ingen byrå kopplad' });

    const { state } = req.body;
    if (!state || typeof state !== 'object') {
      return res.status(400).json({ error: 'Body måste innehålla { state: object }' });
    }

    const num = parseInt(byraId);
    const filterFormula = isNaN(num) ? `{Byrå ID}="${byraId}"` : `OR({Byrå ID}="${byraId}",{Byrå ID}=${byraId})`;
    const listUrl = `https://api.airtable.com/v0/${airtableBaseId}/${encodeURIComponent(BYRAER_TABLE)}?filterByFormula=${encodeURIComponent(filterFormula)}&maxRecords=1`;
    const listRes = await axios.get(listUrl, { headers: { 'Authorization': `Bearer ${airtableAccessToken}` } });

    if (!listRes.data.records?.length) {
      return res.status(404).json({ error: 'Ingen Byråer-post hittades för er byrå' });
    }

    const recordId = listRes.data.records[0].id;
    const patchUrl = `https://api.airtable.com/v0/${airtableBaseId}/${encodeURIComponent(BYRAER_TABLE)}/${recordId}`;
    await axios.patch(patchUrl, {
      fields: { [KOM_IGANG_FIELD]: JSON.stringify(state) }
    }, { headers: { 'Authorization': `Bearer ${airtableAccessToken}`, 'Content-Type': 'application/json' } });

    res.json({ success: true });
  } catch (error) {
    console.error('❌ PUT /api/settings/kom-igang:', error.response?.data || error.message);
    const status = error.response?.status || 500;
    const message = error.response?.data?.error?.message || error.message || 'Okänt fel';
    res.status(status).json({ error: message });
  }
});

// GET /api/byra-rutiner/:id - Hämta specifik Byråer-post (för deep-linking / direktåtkomst)
app.get('/api/byra-rutiner/:id', authenticateToken, async (req, res) => {
  try {
    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
    const airtableBaseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
    const BYRAER_TBL = process.env.BYRAER_TABLE_ID || 'tblAIu1A83AyRTQ3B';
    const { id } = req.params;

    if (!airtableAccessToken) {
      return res.status(500).json({ error: 'Airtable token saknas' });
    }

    const userData = await getAirtableUser(req.user.email);
    if (!userData) {
      return res.status(404).json({ success: false, message: 'Användare hittades inte' });
    }

    const byraId = userData.byraId ? String(userData.byraId).trim() : '';
    if (!byraId) {
      return res.status(400).json({ success: false, message: 'Ingen byrå kopplad till användaren' });
    }

    const getUrl = `https://api.airtable.com/v0/${airtableBaseId}/${BYRAER_TBL}/${id}`;
    const airtableRes = await axios.get(getUrl, {
      headers: { 'Authorization': `Bearer ${airtableAccessToken}` }
    });

    const record = airtableRes.data;
    const recordByraId = record.fields?.['Byrå ID'];
    const recordByraIdStr = recordByraId != null ? String(recordByraId).trim() : '';
    if (recordByraIdStr !== byraId) {
      return res.status(403).json({ error: 'Du får bara visa er egen byrås rutiner' });
    }

    res.json({
      success: true,
      record: { id: record.id, fields: record.fields },
      fields: record.fields,
      id: record.id
    });
  } catch (error) {
    if (error.response?.status === 404) {
      return res.status(404).json({ success: false, message: 'Posten hittades inte' });
    }
    console.error('❌ GET /api/byra-rutiner/:id:', error.response?.data || error.message);
    const status = error.response?.status || 500;
    const message = error.response?.data?.error?.message || error.message || 'Okänt fel';
    res.status(status).json({ error: message });
  }
});

async function patchByraerFieldToAirtable(recordId, fieldName, fieldValue) {
  const token = process.env.AIRTABLE_ACCESS_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
  const tbl = process.env.BYRAER_TABLE_ID || 'tblAIu1A83AyRTQ3B';
  const url = `https://api.airtable.com/v0/${baseId}/${tbl}/${recordId}`;
  const res = await axios.patch(url, { fields: { [fieldName]: fieldValue ?? '' } }, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  });
  return res.data;
}

// PATCH /api/byra-rutiner/:id - Uppdatera fält i Byråer
app.patch('/api/byra-rutiner/:id', authenticateToken, async (req, res) => {
  const BYRAER_TABLE = 'Byråer';
  try {
    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
    const airtableBaseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';

    if (!airtableAccessToken) {
      return res.status(500).json({ error: 'Airtable token saknas' });
    }

    const userData = await getAirtableUser(req.user.email);
    if (!userData) {
      return res.status(404).json({ success: false, message: 'Användare hittades inte' });
    }

    const { id } = req.params;
    const { fields } = req.body;
    console.log('📋 PATCH byra-rutiner mottagen:', id, 'fields keys:', fields ? Object.keys(fields) : []);

    if (!fields || typeof fields !== 'object') {
      return res.status(400).json({ error: 'Fält saknas i request body' });
    }

    const allowedRoles = ['ClientFlowAdmin', 'Ledare'];
    if (!allowedRoles.includes(userData.role)) {
      return res.status(403).json({ error: 'Endast Ledare och ClientFlowAdmin får redigera byrårutiner' });
    }

    const byraId = userData.byraId ? String(userData.byraId).trim() : '';
    if (!byraId) {
      return res.status(400).json({ error: 'Ingen byrå kopplad till användaren' });
    }

    function sanitizeString(s) {
      if (typeof s !== 'string') return s;
      return s.replace(/\uFEFF/g, '').replace(/\0/g, '').replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
    }
    function sanitizeKey(k) {
      if (typeof k !== 'string') return k;
      return k.replace(/\uFEFF/g, '').replace(/[\u200B-\u200D\uFEFF]/g, '');
    }
    function normalizeFieldName(name) {
      try {
        return String(name).normalize('NFC');
      } catch (_) { return name; }
    }
    const cleanedFields = Object.fromEntries(
      Object.entries(fields).filter(([, v]) => {
        if (Array.isArray(v)) return true;
        return v !== undefined && v !== null && v !== '';
      }).map(([k, v]) => {
        const key = sanitizeKey(k);
        let val = v;
        if (['Antal anställda', 'Omsättning', 'Antal kundföretag'].includes(key) && typeof v === 'number') {
          val = String(v);
        }
        if (typeof val === 'string') val = sanitizeString(val);
        return [key, val];
      })
    );

    if (Object.keys(cleanedFields).length === 0) {
      return res.status(400).json({ error: 'Inga fält att uppdatera', message: 'Inga fält att uppdatera' });
    }

    console.log('📋 PATCH byra-rutiner fält:', Object.keys(cleanedFields));

    let updated = null;
    for (const [k, v] of Object.entries(cleanedFields)) {
      const airtableKey = normalizeFieldName(k);
      const rawVal = (typeof v === 'string' || typeof v === 'number') ? v : String(v);
      try {
        updated = await patchByraerFieldToAirtable(id, airtableKey, rawVal);
      } catch (err) {
        err.fieldThatFailed = k;
        err.fieldValue = v;
        throw err;
      }
    }
    res.json({ success: true, id: updated.id, record: { id: updated.id, fields: updated.fields } });
  } catch (error) {
    const at = error.response?.data || error.error || {};
    const status = error.response?.status || error.statusCode || 500;
    const message = at.error?.message || at.message || error.message || 'Okänt fel';
    console.error('❌ PATCH /api/byra-rutiner:', at || error.message);
    if (status === 422) {
      try {
        const sent = error.config?.data ? JSON.parse(error.config.data) : { fields: req.body?.fields };
        console.error('📋 Vid 422 – skickad body till Airtable:', JSON.stringify(sent, null, 2));
      } catch (_) {}
    }
    const json = {
      error: message,
      message: message,
      airtableError: error.response?.data || (error.error ? { error: at } : undefined)
    };
    if (status === 422) {
      try { json.attemptedPayload = error.config?.data ? JSON.parse(error.config.data) : { fields: req.body?.fields }; } catch (_) {}
      json.receivedFields = req.body?.fields ? Object.keys(req.body.fields) : [];
      if (error.fieldThatFailed) {
        json.fieldThatFailed = error.fieldThatFailed;
        json.fieldValue = error.fieldValue;
      }
    }
    res.status(status).json(json);
  }
});

// POST /api/debug/byraer-patch-test - Test minimal PATCH (ett fält) för felsökning
app.post('/api/debug/byraer-patch-test', authenticateToken, async (req, res) => {
  try {
    const { recordId, fieldName, fieldValue } = req.body || {};
    if (!recordId || !fieldName) return res.status(400).json({ error: 'recordId och fieldName krävs' });

    const record = await patchByraerFieldToAirtable(recordId, fieldName, fieldValue ?? 'test');
    res.json({ success: true, record });
  } catch (e) {
    const status = e.response?.status || 500;
    const data = e.response?.data || {};
    res.status(status).json({
      error: data.error?.message || e.message,
      airtableError: data,
      attemptedUrl: `.../${req.body?.recordId}`,
      attemptedField: req.body?.fieldName
    });
  }
});

// GET /api/debug/byraer-schema - Hämta Byråer-tabellens schema (felsökning)
app.get('/api/debug/byraer-schema', authenticateToken, async (req, res) => {
  try {
    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
    const airtableBaseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
    if (!airtableAccessToken) return res.status(500).json({ error: 'Token saknas' });
    const metaRes = await axios.get(
      `https://api.airtable.com/v0/meta/bases/${airtableBaseId}/tables`,
      { headers: { Authorization: `Bearer ${airtableAccessToken}` } }
    );
    const byraer = (metaRes.data.tables || []).find(t => t.name === 'Byråer');
    if (!byraer) return res.json({ error: 'Byråer-tabell hittades inte', tables: (metaRes.data.tables || []).map(t => ({ id: t.id, name: t.name })) });
    res.json({ tableId: byraer.id, tableName: byraer.name, fields: byraer.fields });
  } catch (e) {
    res.status(500).json({ error: e.message, details: e.response?.data });
  }
});

// GET /api/kunddata - Hämta KUNDDATA med rollbaserad filtrering
app.get('/api/kunddata', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  
  try {
    console.log('🔍 Hämtar KUNDDATA med rollbaserad filtrering...');
    
    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
    const airtableBaseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
    const KUNDDATA_TABLE = 'tblOIuLQS2DqmOQWe';
    
    if (!airtableAccessToken) {
      return res.status(500).json({
        error: 'Airtable inte konfigurerad',
        message: 'Sätt AIRTABLE_ACCESS_TOKEN och AIRTABLE_BASE_ID'
      });
    }

    // Hämta komplett användardata för att få roll och byrå-ID
    const userData = await getUser(req.user.email);
    if (!userData) {
      return res.status(404).json({
        success: false,
        message: 'Användare hittades inte'
      });
    }

    console.log(`👤 Användare: ${userData.name} (${userData.role}) från ${userData.byra}`);
    console.log(`🏢 Byrå ID: ${userData.byraId}`);

    let records = [];
    let filterFormula = '';

    // Rollbaserad filtrering för Airtable
    switch (userData.role) {
        case 'ClientFlowAdmin':
          console.log('🔓 ClientFlowAdmin: Visar alla poster');
          break;
        case 'Ledare':
          if (userData.byraId) {
            const _byraIdNum1 = parseInt(userData.byraId);
            filterFormula = isNaN(_byraIdNum1) ? `{Byrå ID}="${userData.byraId}"` : `{Byrå ID}=${_byraIdNum1}`;
            console.log(`👔 Ledare: Filtrerar på Byrå ID: ${userData.byraId}`);
          } else {
            return res.json({
              success: true,
              message: 'Ledare utan Byrå ID - inga poster att visa',
              records: [],
              userRole: userData.role,
              userByraId: userData.byraId,
              timestamp: new Date().toISOString(),
              duration: Date.now() - startTime
            });
          }
          break;
        case 'Anställd':
          // Anställd: filtrera på både Byrå ID och Användare (recordID)
          if (!userData.id || !userData.byraId) {
            return res.json({
              success: true,
              message: userData.id ? 'Anställd utan Byrå ID - inga poster att visa' : 'Anställd utan användar-ID - inga poster att visa',
              records: [],
              userRole: userData.role,
              userByraId: userData.byraId,
              userId: userData.id,
              timestamp: new Date().toISOString(),
              duration: Date.now() - startTime
            });
          }
          const _byraIdNumA = parseInt(userData.byraId);
          const byraPart = isNaN(_byraIdNumA)
            ? `{Byrå ID}="${String(userData.byraId).replace(/"/g, '\\"')}"`
            : `{Byrå ID}=${_byraIdNumA}`;
          const escId = String(userData.id).replace(/"/g, '\\"');
          const userPart = `SEARCH("${escId}", {Användare}&"")`;
          filterFormula = `AND(${byraPart},${userPart})`;
          console.log(`👷 Anställd: Filtrerar på Byrå ID ${userData.byraId} OCH användar-ID (Användare): ${userData.id}`);
          break;
        default:
          return res.json({
            success: true,
            message: `Okänd användarroll: ${userData.role}`,
            records: [],
            userRole: userData.role,
            timestamp: new Date().toISOString(),
            duration: Date.now() - startTime
          });
    }

    const baseUrl = `https://api.airtable.com/v0/${airtableBaseId}/${KUNDDATA_TABLE}`;
    const baseParams = new URLSearchParams();
    baseParams.append('pageSize', '100');
    if (filterFormula) baseParams.append('filterByFormula', filterFormula);

    let offset = null;
    do {
      const params = new URLSearchParams(baseParams);
      if (offset) params.append('offset', offset);
      const response = await axios.get(`${baseUrl}?${params.toString()}`, {
        headers: { 'Authorization': `Bearer ${airtableAccessToken}`, 'Content-Type': 'application/json' },
        timeout: 15000
      });
      const page = response.data.records || [];
      records.push(...page);
      offset = response.data.offset || null;
    } while (offset);

    console.log(`✅ Hämtade ${records.length} poster från KUNDDATA (Airtable)`);

    const formattedRecords = records.map(record => ({
      id: record.id,
      createdTime: record.createdTime,
      fields: record.fields
    }));

    const duration = Date.now() - startTime;
    const filterApplied = filterFormula || 'Ingen filtrering (ClientFlowAdmin)';

    res.json({
      success: true,
      message: `KUNDDATA hämtad för ${userData.role}`,
      records: formattedRecords,
      recordCount: records.length,
      userRole: userData.role,
      userByraId: userData.byraId,
      userId: userData.id,
      filterApplied,
      timestamp: new Date().toISOString(),
      duration: duration
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('Error fetching KUNDDATA:', error.message);
    
    if (error.response) {
      console.error('Airtable API Error:', {
        status: error.response.status,
        data: error.response.data
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Fel vid hämtning av KUNDDATA',
      error: error.message,
      timestamp: new Date().toISOString(),
      duration: duration
    });
  }
});

// GET /api/statistik-riskbedomning – Aggregerad statistik för inloggad byrå (risknivåer, tjänster, riskfaktorer)
app.get('/api/statistik-riskbedomning', authenticateToken, async (req, res) => {
  try {
    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
    const airtableBaseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
    const KUNDDATA_TABLE = 'tblOIuLQS2DqmOQWe';

    if (!airtableAccessToken) {
      return res.status(500).json({ error: 'Airtable API-nyckel saknas' });
    }

    const userData = await getAirtableUser(req.user.email);
    if (!userData) {
      return res.status(404).json({ error: 'Användare hittades inte' });
    }

    let filterFormula = '';
    switch (userData.role) {
      case 'ClientFlowAdmin':
        break;
      case 'Ledare':
        if (userData.byraId) {
          const num = parseInt(userData.byraId);
          filterFormula = isNaN(num) ? `{Byrå ID}="${userData.byraId}"` : `{Byrå ID}=${userData.byraId}`;
        } else {
          return res.json({ antalKunder: 0, riskniva: {}, tjänster: [], högriskbransch: [], riskfaktorerKund: [] });
        }
        break;
      case 'Anställd':
        if (!userData.id || !userData.byraId) return res.json({ antalKunder: 0, riskniva: {}, tjänster: [], högriskbransch: [], riskfaktorerKund: [] });
        const _n2 = parseInt(userData.byraId);
        const _byra2 = isNaN(_n2)
          ? `{Byrå ID}="${String(userData.byraId).replace(/"/g, '\\"')}"`
          : `{Byrå ID}=${_n2}`;
        const _uid2 = String(userData.id).replace(/"/g, '\\"');
        const _u2 = `SEARCH("${_uid2}", {Användare}&"")`;
        filterFormula = `AND(${_byra2},${_u2})`;
        break;
      default:
        return res.json({ antalKunder: 0, riskniva: {}, tjänster: [], högriskbransch: [], riskfaktorerKund: [] });
    }

    let allRecords = [];
    let offset = null;
    do {
      let url = `https://api.airtable.com/v0/${airtableBaseId}/${KUNDDATA_TABLE}?pageSize=100`;
      if (filterFormula) url += `&filterByFormula=${encodeURIComponent(filterFormula)}`;
      if (offset) url += `&offset=${offset}`;
      const r = await axios.get(url, {
        headers: { Authorization: `Bearer ${airtableAccessToken}`, 'Content-Type': 'application/json' },
        timeout: 15000
      });
      allRecords = allRecords.concat(r.data.records || []);
      offset = r.data.offset || null;
    } while (offset);

    const riskniva = { Låg: 0, Medel: 0, Hög: 0, Övrigt: 0 };
    const tjänstAntal = {};
    const högriskbranschAntal = {};
    const riskfaktorIdAntal = {};
    let antalKunderMedRiskfaktor = 0;
    const pepEllerSanktionKundIds = [];

    for (const rec of allRecords) {
      const f = rec.fields || {};
      const rn = (f['Riskniva'] || '').trim();
      if (rn === 'Lag' || rn === 'Låg') riskniva['Låg']++;
      else if (rn === 'Medel') riskniva['Medel']++;
      else if (rn === 'Hog' || rn === 'Hög') riskniva['Hög']++;
      else if (rn) riskniva['Övrigt']++;

      const tjanstIds = f['Kundens utvalda tjänster'];
      if (Array.isArray(tjanstIds)) {
        for (const id of tjanstIds) {
          tjänstAntal[id] = (tjänstAntal[id] || 0) + 1;
        }
      }

      const hogrisk = f['Kunden verkar i en högriskbransch'];
      const hogriskList = Array.isArray(hogrisk) ? hogrisk : (hogrisk ? [hogrisk] : []);
      for (const b of hogriskList) {
        const namn = (b && String(b).trim()) || 'Övrig';
        if (namn !== '---') högriskbranschAntal[namn] = (högriskbranschAntal[namn] || 0) + 1;
      }

      const riskerKund = f['risker kopplat till tjänster'];
      const riskIds = Array.isArray(riskerKund) ? riskerKund : (riskerKund ? [riskerKund] : []);
      if (riskIds.length > 0) antalKunderMedRiskfaktor++;
      for (const rid of riskIds) {
        riskfaktorIdAntal[rid] = (riskfaktorIdAntal[rid] || 0) + 1;
      }

      const pepFält = f['PEP'];
      const pepList = Array.isArray(pepFält) ? pepFält : (pepFält ? [pepFält] : []);
      const ärPep = pepList.some(v => v && String(v).trim() && String(v).trim() !== 'Inte PEP');
      const traffar = parseInt(f['Antal träffar PEP och sanktionslistor'], 10) || 0;
      const harSanktioner = !isNaN(traffar) && traffar > 0;
      if (ärPep || harSanktioner) pepEllerSanktionKundIds.push(rec.id);
    }

    const tjanstIdToName = {};
    const uniqueTjanstIds = [...new Set(Object.keys(tjänstAntal))];
    const tablePath = encodeURIComponent(RISK_ASSESSMENT_TABLE);
    await Promise.all(
      uniqueTjanstIds.map(async (id) => {
        try {
          const r = await axios.get(
            `https://api.airtable.com/v0/${airtableBaseId}/${tablePath}/${id}`,
            { headers: { Authorization: `Bearer ${airtableAccessToken}` } }
          );
          const namn = (r.data.fields && r.data.fields['Task Name'] || '').trim();
          if (namn) tjanstIdToName[id] = namn;
        } catch (_) { /* behåll id som namn om hämtning misslyckas */ }
      })
    );
    // Gruppera per tjänstenamn så samma namn (olika record-ID) inte visas dubbelt
    const tjanstByName = {};
    for (const [id, antal] of Object.entries(tjänstAntal)) {
      let namn = (tjanstIdToName[id] || '').trim();
      // Visa aldrig rått Airtable record-ID som namn (hämtning kan ha misslyckats)
      if (!namn && /^rec[A-Za-z0-9]{10,}$/.test(String(id))) continue;
      if (!namn) namn = String(id);
      tjanstByName[namn] = (tjanstByName[namn] || 0) + antal;
    }
    const tjänsterMedNamn = Object.entries(tjanstByName).map(([namn, antal]) => ({
      namn,
      antal
    })).sort((a, b) => b.antal - a.antal);

    const högriskbransch = Object.entries(högriskbranschAntal).map(([namn, antal]) => ({ namn, antal })).sort((a, b) => b.antal - a.antal);

    const RISKER_KUND_TABLE = 'tblWw6tM2YOTYFn2H';
    const riskfaktorIdToLabel = {};
    const riskfaktorIdToTyp = {};
    const uniqueRiskfaktorIds = [...new Set(Object.keys(riskfaktorIdAntal))];
    await Promise.all(
      uniqueRiskfaktorIds.map(async (id) => {
        try {
          const r = await axios.get(
            `https://api.airtable.com/v0/${airtableBaseId}/${RISKER_KUND_TABLE}/${id}`,
            { headers: { Authorization: `Bearer ${airtableAccessToken}` } }
          );
          const f = r.data.fields || {};
          const typ = (f['Typ av riskfaktor'] || '').trim() || 'Övriga';
          riskfaktorIdToTyp[id] = typ;
          const riskfaktorNamn = (f['Riskfaktor'] || '').trim();
          riskfaktorIdToLabel[id] = riskfaktorNamn || id;
        } catch (_) {
          riskfaktorIdToTyp[id] = 'Övriga';
          riskfaktorIdToLabel[id] = id;
        }
      })
    );

    const typToCustomerIds = {};
    for (const rec of allRecords) {
      const riskIds = rec.fields?.['risker kopplat till tjänster'];
      const ids = Array.isArray(riskIds) ? riskIds : (riskIds ? [riskIds] : []);
      for (const rid of ids) {
        const t = riskfaktorIdToTyp[rid] || 'Övriga';
        if (!typToCustomerIds[t]) typToCustomerIds[t] = new Set();
        typToCustomerIds[t].add(rec.id);
      }
    }

    const typToRiskfaktorer = {};
    for (const [id, antal] of Object.entries(riskfaktorIdAntal)) {
      const typ = riskfaktorIdToTyp[id] || 'Övriga';
      if (!typToRiskfaktorer[typ]) typToRiskfaktorer[typ] = [];
      typToRiskfaktorer[typ].push({ id, namn: riskfaktorIdToLabel[id] || id, antal });
    }
    for (const arr of Object.values(typToRiskfaktorer)) {
      arr.sort((a, b) => b.antal - a.antal);
    }

    const riskfaktorerPerTyp = Object.keys(typToRiskfaktorer).map(typ => ({
      typ,
      antalKunder: (typToCustomerIds[typ] || new Set()).size,
      riskfaktorer: typToRiskfaktorer[typ] || []
    })).sort((a, b) => b.antalKunder - a.antalKunder);

    res.json({
      antalKunder: allRecords.length,
      riskniva,
      antalPepEllerSanktion: pepEllerSanktionKundIds.length,
      tjänster: tjänsterMedNamn,
      högriskbransch,
      antalKunderMedRiskfaktor,
      riskfaktorerPerTyp
    });
  } catch (err) {
    console.error('❌ statistik-riskbedomning:', err.message);
    res.status(500).json({ error: err.message || 'Kunde inte hämta statistik' });
  }
});

// GET /api/statistik-riskbedomning/kunder – lista kunder för en tjänst, högriskbransch eller riskfaktor
app.get('/api/statistik-riskbedomning/kunder', authenticateToken, async (req, res) => {
  try {
    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
    const airtableBaseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
    const KUNDDATA_TABLE = 'tblOIuLQS2DqmOQWe';
    const { typ, id: paramId, namn: paramNamn } = req.query;

    if (!airtableAccessToken) {
      return res.status(500).json({ error: 'Airtable API-nyckel saknas' });
    }

    const userData = await getAirtableUser(req.user.email);
    if (!userData) {
      return res.status(404).json({ error: 'Användare hittades inte' });
    }

    let filterFormula = '';
    switch (userData.role) {
      case 'ClientFlowAdmin':
        break;
      case 'Ledare':
        if (userData.byraId) {
          const num = parseInt(userData.byraId);
          filterFormula = isNaN(num) ? `{Byrå ID}="${userData.byraId}"` : `{Byrå ID}=${userData.byraId}`;
        } else {
          return res.json({ kunder: [] });
        }
        break;
      case 'Anställd':
        if (!userData.id || !userData.byraId) return res.json({ kunder: [] });
        const _n3 = parseInt(userData.byraId);
        const _byra3 = isNaN(_n3)
          ? `{Byrå ID}="${String(userData.byraId).replace(/"/g, '\\"')}"`
          : `{Byrå ID}=${_n3}`;
        const _uid3 = String(userData.id).replace(/"/g, '\\"');
        const _u3 = `SEARCH("${_uid3}", {Användare}&"")`;
        filterFormula = `AND(${_byra3},${_u3})`;
        break;
      default:
        return res.json({ kunder: [] });
    }

    let allRecords = [];
    let offset = null;
    do {
      let url = `https://api.airtable.com/v0/${airtableBaseId}/${KUNDDATA_TABLE}?pageSize=100`;
      if (filterFormula) url += `&filterByFormula=${encodeURIComponent(filterFormula)}`;
      if (offset) url += `&offset=${offset}`;
      const r = await axios.get(url, {
        headers: { Authorization: `Bearer ${airtableAccessToken}`, 'Content-Type': 'application/json' },
        timeout: 15000
      });
      allRecords = allRecords.concat(r.data.records || []);
      offset = r.data.offset || null;
    } while (offset);

    let kunder = [];
    if (typ === 'tjanst') {
      let tjanstIdsToMatch = [];
      if (paramNamn !== undefined && paramNamn !== '') {
        const sokNamn = String(paramNamn).trim();
        const tablePath = encodeURIComponent(RISK_ASSESSMENT_TABLE);
        let offsetT = null;
        do {
          let url = `https://api.airtable.com/v0/${airtableBaseId}/${tablePath}?pageSize=100&filterByFormula=${encodeURIComponent(`{Task Name}="${sokNamn.replace(/"/g, '\\"')}"`)}`;
          if (offsetT) url += `&offset=${offsetT}`;
          const tr = await axios.get(url, { headers: { Authorization: `Bearer ${airtableAccessToken}` }, timeout: 10000 });
          (tr.data.records || []).forEach(r => { if (r.id) tjanstIdsToMatch.push(r.id); });
          offsetT = tr.data.offset || null;
        } while (offsetT);
      } else if (paramId) {
        tjanstIdsToMatch = [paramId];
      }
      const idSet = new Set(tjanstIdsToMatch);
      for (const rec of allRecords) {
        const tjanstIds = rec.fields?.['Kundens utvalda tjänster'];
        if (!Array.isArray(tjanstIds)) continue;
        if (tjanstIds.some(id => idSet.has(id))) {
          kunder.push({ id: rec.id, namn: (rec.fields?.['Namn'] || rec.fields?.['Kundnamn'] || '').trim() || 'Namn saknas' });
        }
      }
    } else if (typ === 'hogriskbransch' && paramNamn !== undefined) {
      const sokNamn = String(paramNamn).trim();
      for (const rec of allRecords) {
        const hogrisk = rec.fields?.['Kunden verkar i en högriskbransch'];
        const list = Array.isArray(hogrisk) ? hogrisk : (hogrisk ? [hogrisk] : []);
        if (list.some(b => (b && String(b).trim()) === sokNamn)) {
          kunder.push({ id: rec.id, namn: (rec.fields?.['Namn'] || rec.fields?.['Kundnamn'] || '').trim() || 'Namn saknas' });
        }
      }
    } else if (typ === 'riskfaktor') {
      const RISKER_KUND_TABLE = 'tblWw6tM2YOTYFn2H';
      let riskfaktorIdsToMatch = [];
      if (paramId) {
        riskfaktorIdsToMatch = [paramId];
      } else if (paramNamn !== undefined && paramNamn !== '') {
        const sokNamn = String(paramNamn).trim();
        let offsetR = null;
        do {
          let url = `https://api.airtable.com/v0/${airtableBaseId}/${RISKER_KUND_TABLE}?pageSize=100&filterByFormula=${encodeURIComponent(`{Typ av riskfaktor}="${sokNamn.replace(/"/g, '\\"')}"`)}`;
          if (offsetR) url += `&offset=${offsetR}`;
          const rr = await axios.get(url, { headers: { Authorization: `Bearer ${airtableAccessToken}` }, timeout: 10000 });
          (rr.data.records || []).forEach(r => { if (r.id) riskfaktorIdsToMatch.push(r.id); });
          offsetR = rr.data.offset || null;
        } while (offsetR);
      }
      const idSet = new Set(riskfaktorIdsToMatch);
      for (const rec of allRecords) {
        const risker = rec.fields?.['risker kopplat till tjänster'];
        const ids = Array.isArray(risker) ? risker : (risker ? [risker] : []);
        if (paramId || (paramNamn !== undefined && paramNamn !== '')) {
          if (idSet.size > 0 && ids.some(id => idSet.has(id))) {
            kunder.push({ id: rec.id, namn: (rec.fields?.['Namn'] || rec.fields?.['Kundnamn'] || '').trim() || 'Namn saknas' });
          }
        } else {
          if (ids.length > 0) {
            kunder.push({ id: rec.id, namn: (rec.fields?.['Namn'] || rec.fields?.['Kundnamn'] || '').trim() || 'Namn saknas' });
          }
        }
      }
    } else if (typ === 'pep-sanktion') {
      for (const rec of allRecords) {
        const pepFält = rec.fields?.['PEP'];
        const pepList = Array.isArray(pepFält) ? pepFält : (pepFält ? [pepFält] : []);
        const ärPep = pepList.some(v => v && String(v).trim() && String(v).trim() !== 'Inte PEP');
        const traffar = parseInt(rec.fields?.['Antal träffar PEP och sanktionslistor'], 10) || 0;
        const harSanktioner = !isNaN(traffar) && traffar > 0;
        if (ärPep || harSanktioner) {
          kunder.push({ id: rec.id, namn: (rec.fields?.['Namn'] || rec.fields?.['Kundnamn'] || '').trim() || 'Namn saknas' });
        }
      }
    }

    res.json({ kunder });
  } catch (err) {
    console.error('❌ statistik-riskbedomning/kunder:', err.message);
    res.status(500).json({ error: err.message || 'Kunde inte hämta kunder' });
  }
});

// POST /api/kunddata - Hämta KUNDDATA med rollbaserad filtrering (POST version för frontend)
app.post('/api/kunddata', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  
  try {
    console.log('🔍 Hämtar KUNDDATA med rollbaserad filtrering (POST)...');
    
    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
    const airtableBaseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
    const KUNDDATA_TABLE = 'tblOIuLQS2DqmOQWe';
    
    if (!airtableAccessToken) {
      return res.status(500).json({
        error: 'Airtable inte konfigurerad',
        message: 'Sätt AIRTABLE_ACCESS_TOKEN och AIRTABLE_BASE_ID'
      });
    }

    const userData = await getUser(req.user.email);
    if (!userData) {
      return res.status(404).json({
        success: false,
        message: 'Användare hittades inte'
      });
    }

    console.log(`👤 Användare: ${userData.name} (${userData.role}) från ${userData.byra}`);
    console.log(`🏢 Byrå ID: ${userData.byraId}`);

    const { filterFormula: customFilter, maxRecords } = req.body || {};
    let records = [];
    let filterFormula = '';

    // Rollbaserad filtrering med Airtable-formel
    switch (userData.role) {
      case 'ClientFlowAdmin':
        console.log('🔓 ClientFlowAdmin: Visar alla poster');
        break;
      case 'Ledare':
        if (userData.byraId) {
          const _byraIdNum2 = parseInt(userData.byraId);
          filterFormula = isNaN(_byraIdNum2) ? `{Byrå ID}="${userData.byraId}"` : `{Byrå ID}=${_byraIdNum2}`;
          console.log(`👔 Ledare: Filtrerar på Byrå ID: ${userData.byraId} (formel: ${filterFormula})`);
        } else {
          return res.json({
            success: true,
            data: [],
            message: 'Ledare utan Byrå ID - inga poster att visa',
            userRole: userData.role,
            userByraId: userData.byraId,
            timestamp: new Date().toISOString(),
            duration: Date.now() - startTime
          });
        }
        break;
      case 'Anställd':
        if (!userData.id || !userData.byraId) {
          return res.json({
            success: true,
            data: [],
            message: userData.id ? 'Anställd utan Byrå ID - inga poster att visa' : 'Anställd utan användar-ID - inga poster att visa',
            userRole: userData.role,
            userByraId: userData.byraId,
            userId: userData.id,
            timestamp: new Date().toISOString(),
            duration: Date.now() - startTime
          });
        }
        const _byraNumPost = parseInt(userData.byraId);
        const byraPartPost = isNaN(_byraNumPost)
          ? `{Byrå ID}="${String(userData.byraId).replace(/"/g, '\\"')}"`
          : `{Byrå ID}=${_byraNumPost}`;
        const escIdPost = String(userData.id).replace(/"/g, '\\"');
        const userPartPost = `SEARCH("${escIdPost}", {Användare}&"")`;
        filterFormula = `AND(${byraPartPost},${userPartPost})`;
        console.log(`👷 Anställd: Filtrerar på Byrå ID ${userData.byraId} OCH användar-ID (Användare): ${userData.id}`);
        break;
      default:
        return res.json({
          success: true,
          data: [],
          message: `Okänd användarroll: ${userData.role}`,
          userRole: userData.role,
          timestamp: new Date().toISOString(),
          duration: Date.now() - startTime
        });
    }

    const baseUrl = `https://api.airtable.com/v0/${airtableBaseId}/${KUNDDATA_TABLE}`;
    const baseParams = new URLSearchParams();
    baseParams.append('pageSize', '100');
    if (filterFormula) baseParams.append('filterByFormula', filterFormula);
    if (maxRecords) baseParams.append('maxRecords', maxRecords);

    let offset = null;
    do {
      const params = new URLSearchParams(baseParams);
      if (offset) params.append('offset', offset);
      const response = await axios.get(`${baseUrl}?${params.toString()}`, {
        headers: {
          'Authorization': `Bearer ${airtableAccessToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      });
      const page = response.data.records || [];
      records.push(...page.map(record => ({
        id: record.id,
        createdTime: record.createdTime,
        fields: record.fields
      })));
      offset = response.data.offset || null;
    } while (offset);

    console.log(`✅ Hämtade ${records.length} poster från KUNDDATA (Airtable)`);

    const duration = Date.now() - startTime;
    res.json({
      success: true,
      data: records,
      message: `KUNDDATA hämtad för ${userData.role}`,
      recordCount: records.length,
      userRole: userData.role,
      userByraId: userData.byraId,
      userId: userData.id,
      filterApplied: filterFormula || 'Ingen filtrering (ClientFlowAdmin)',
      timestamp: new Date().toISOString(),
      duration
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('Error fetching KUNDDATA:', error.message);
    if (error.response) {
      console.error('API Error:', { status: error.response.status, data: error.response.data });
    }
    res.status(500).json({
      success: false,
      message: 'Fel vid hämtning av KUNDDATA',
      error: error.message,
      timestamp: new Date().toISOString(),
      duration
    });
  }
});

// GET /api/kunddata/debug - Debug endpoint för att se fältnamn och exempeldata
app.get('/api/kunddata/debug', async (req, res) => {
  try {
    console.log('🔍 Debug: Hämtar KUNDDATA för att analysera fältnamn...');
    
    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
    const airtableBaseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
    const KUNDDATA_TABLE = 'tblOIuLQS2DqmOQWe';
    
    if (!airtableAccessToken) {
      return res.status(500).json({
        error: 'Airtable API-nyckel saknas',
        message: 'AIRTABLE_ACCESS_TOKEN är inte konfigurerad'
      });
    }

    // Hämta bara 5 poster för att analysera strukturen
    const url = `https://api.airtable.com/v0/${airtableBaseId}/${KUNDDATA_TABLE}?maxRecords=5`;
    
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${airtableAccessToken}`,
        'Content-Type': 'application/json'
      },
      timeout: 15000
    });

    const records = response.data.records || [];
    
    // Analysera fältnamn från första posten
    let fieldNames = [];
    let sampleData = {};
    
    if (records.length > 0) {
      const firstRecord = records[0];
      fieldNames = Object.keys(firstRecord.fields || {});
      
      // Skapa exempeldata för varje fält
      fieldNames.forEach(fieldName => {
        const value = firstRecord.fields[fieldName];
        sampleData[fieldName] = {
          value: value,
          type: typeof value,
          isArray: Array.isArray(value)
        };
      });
    }

    res.json({
      success: true,
      message: 'Debug information för KUNDDATA-tabellen',
      recordCount: records.length,
      fieldNames: fieldNames,
      sampleData: sampleData,
      firstRecord: records[0] ? {
        id: records[0].id,
        createdTime: records[0].createdTime,
        fields: records[0].fields
      } : null,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error in KUNDDATA debug:', error.message);
    res.status(500).json({
      success: false,
      message: 'Fel vid debug av KUNDDATA',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// GET /api/kunddata/byra-ids - Visa alla Byrå ID som finns i KUNDDATA
app.get('/api/kunddata/byra-ids', async (req, res) => {
  try {
    console.log('🔍 Debug: Hämtar alla Byrå ID från KUNDDATA...');
    
    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
    const airtableBaseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
    const KUNDDATA_TABLE = 'tblOIuLQS2DqmOQWe';
    
    if (!airtableAccessToken) {
      return res.status(500).json({
        error: 'Airtable API-nyckel saknas',
        message: 'AIRTABLE_ACCESS_TOKEN är inte konfigurerad'
      });
    }

    // Hämta alla poster för att analysera Byrå ID
    const url = `https://api.airtable.com/v0/${airtableBaseId}/${KUNDDATA_TABLE}?maxRecords=1000`;
    
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${airtableAccessToken}`,
        'Content-Type': 'application/json'
      },
      timeout: 15000
    });

    const records = response.data.records || [];
    
    // Samla alla Byrå ID
    const byraIds = records
      .map(record => record.fields['Byrå ID'])
      .filter(id => id) // Ta bort null/undefined
      .sort();
    
    // Räkna förekomster av varje Byrå ID
    const byraIdCounts = {};
    byraIds.forEach(id => {
      byraIdCounts[id] = (byraIdCounts[id] || 0) + 1;
    });

    res.json({
      success: true,
      message: 'Alla Byrå ID från KUNDDATA-tabellen',
      totalRecords: records.length,
      uniqueByraIds: [...new Set(byraIds)],
      byraIdCounts: byraIdCounts,
      allByraIds: byraIds,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error in KUNDDATA byra-ids:', error.message);
    res.status(500).json({
      success: false,
      message: 'Fel vid hämtning av Byrå ID',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// GET /api/kunddata/test - Test endpoint för KUNDDATA (utan autentisering för utveckling)
app.get('/api/kunddata/test', async (req, res) => {
  const startTime = Date.now();
  
  try {
    console.log('🧪 Test: Hämtar KUNDDATA med rollbaserad filtrering...');
    
    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
    const airtableBaseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
    const KUNDDATA_TABLE = 'tblOIuLQS2DqmOQWe';
    
    if (!airtableAccessToken) {
      return res.status(500).json({
        error: 'Airtable API-nyckel saknas',
        message: 'AIRTABLE_ACCESS_TOKEN är inte konfigurerad'
      });
    }

    // Test med olika roller
    const testRoles = [
      { role: 'ClientFlowAdmin', byraId: null, userId: null },
      { role: 'Ledare', byraId: 'BYRA123', userId: null },
      { role: 'Anställd', byraId: null, userId: 'recF3IYVte4066KMx' }
    ];

    const results = [];

    for (const testRole of testRoles) {
      console.log(`🧪 Testar roll: ${testRole.role}`);
      
      let filterFormula = '';
      
      // Rollbaserad filtrering
      switch (testRole.role) {
        case 'ClientFlowAdmin':
          console.log('🔓 ClientFlowAdmin: Visar alla poster');
          break;
          
        case 'Ledare':
          if (testRole.byraId) {
            filterFormula = `{Byrå ID}="${testRole.byraId}"`;
            console.log(`👔 Ledare: Filtrerar på Byrå ID: ${testRole.byraId}`);
          }
          break;
          
        case 'Anställd':
          if (testRole.userId && testRole.byraId) {
            filterFormula = `AND({Byrå ID}="${testRole.byraId}",SEARCH("${testRole.userId}", {Användare}&""))`;
            console.log(`👷 Anställd: Filtrerar på Byrå ID ${testRole.byraId} OCH användar-ID: ${testRole.userId}`);
          }
          break;
      }

      // Bygg URL för Airtable API
      let url = `https://api.airtable.com/v0/${airtableBaseId}/${KUNDDATA_TABLE}`;
      if (filterFormula) {
        url += `?filterByFormula=${encodeURIComponent(filterFormula)}`;
      }
      
      console.log(`🌐 Airtable URL: ${url}`);

      try {
        // Hämta data från Airtable
        const response = await axios.get(url, {
          headers: {
            'Authorization': `Bearer ${airtableAccessToken}`,
            'Content-Type': 'application/json'
          },
          timeout: 15000
        });

        const records = response.data.records || [];
        console.log(`✅ Hämtade ${records.length} poster för ${testRole.role}`);

        results.push({
          role: testRole.role,
          success: true,
          recordCount: records.length,
          filterApplied: filterFormula || 'Ingen filtrering',
          records: records.map(record => ({
            id: record.id,
            createdTime: record.createdTime,
            fields: record.fields
          }))
        });

      } catch (error) {
        console.error(`❌ Fel för ${testRole.role}:`, error.message);
        results.push({
          role: testRole.role,
          success: false,
          error: error.message,
          filterApplied: filterFormula || 'Ingen filtrering'
        });
      }
    }

    const duration = Date.now() - startTime;

    res.json({
      success: true,
      message: 'Test av KUNDDATA med rollbaserad filtrering',
      results: results,
      timestamp: new Date().toISOString(),
      duration: duration
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('Error in KUNDDATA test:', error.message);
    
    res.status(500).json({
      success: false,
      message: 'Fel vid test av KUNDDATA',
      error: error.message,
      timestamp: new Date().toISOString(),
      duration: duration
    });
  }
});

// Risk Factors API endpoints
const RISK_FACTORS_TABLE = 'Risker kopplade till kunden';

// GET /api/risk-factors - Hämta alla riskfaktorer med pagination
app.get('/api/risk-factors', async (req, res) => {
  const startTime = Date.now();
  
  try {
    console.log('Hämtar alla riskfaktorer från Airtable med pagination...');
    
    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
    const airtableBaseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
    
    if (!airtableAccessToken) {
      return res.status(500).json({
        error: 'Airtable API-nyckel saknas',
        message: 'AIRTABLE_ACCESS_TOKEN är inte konfigurerad'
      });
    }

    let allRecords = [];
    let offset = null;
    let pageCount = 0;
    
    do {
      pageCount++;
      console.log(`Hämtar sida ${pageCount}...`);
      
      let url = `https://api.airtable.com/v0/${airtableBaseId}/${RISK_FACTORS_TABLE}?pageSize=100`;
      if (offset) {
        url += `&offset=${offset}`;
      }
      
      const response = await axios.get(url, {
        headers: {
          'Authorization': `Bearer ${airtableAccessToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      });

      // Lägg till poster från denna sida
      allRecords = allRecords.concat(response.data.records);
      
      // Hämta offset för nästa sida
      offset = response.data.offset;
      
      console.log(`Sida ${pageCount}: ${response.data.records.length} poster (total: ${allRecords.length})`);
      
    } while (offset);

    const duration = Date.now() - startTime;
    
    console.log(`Alla riskfaktorer hämtade: ${allRecords.length} st (${pageCount} sidor)`);
    
    res.json({
      success: true,
      records: allRecords,
      totalRecords: allRecords.length,
      pagesFetched: pageCount,
      duration: duration
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('Error fetching risk factors:', error.message);
    
    res.status(500).json({
      error: 'Fel vid hämtning av riskfaktorer',
      message: error.message,
      duration: duration
    });
  }
});

// POST /api/risk-factors - Skapa ny riskfaktor
app.post('/api/risk-factors', async (req, res) => {
  const startTime = Date.now();
  
  try {
    console.log('Skapar ny riskfaktor...');
    
    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
    const airtableBaseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
    
    if (!airtableAccessToken) {
      return res.status(500).json({
        error: 'Airtable API-nyckel saknas',
        message: 'AIRTABLE_ACCESS_TOKEN är inte konfigurerad'
      });
    }

    const riskData = req.body;
    console.log('Mottaget riskfaktordata:', riskData);
    
    // Konvertera fältnamn till fält-ID:n för Airtable
    const fieldMapping = {
      'Typ av riskfaktor': 'fldpwh7655qQRsfd2',
      'Riskfaktor': 'fldBXz24TIPi0dayY',
      'Beskrivning': 'fld4epowAz3n7gYxl',
      'Riskbedömning': 'flddfJfl5yru8rKyp',
      'Åtgjärd': 'fld9EOySG5oGUNUJ0',
      'Åtgärd': 'fld9EOySG5oGUNUJ0',
      'Byrå ID': 'fld14CLMCwvjr8ReH',
      'Riskbedömning godkänd datum': 'fld4VBsWkW7GmBFt5'
    };

    // Skapa Airtable-fält
    const airtableFields = {};
    Object.keys(riskData).forEach(key => {
      if (fieldMapping[key]) {
        airtableFields[fieldMapping[key]] = riskData[key];
      }
      // Ignorera fält som inte finns i mappningen (som 'Aktuell')
    });

    console.log('Airtable-fält:', airtableFields);

    const url = `https://api.airtable.com/v0/${airtableBaseId}/${RISK_FACTORS_TABLE}`;
    
    const response = await axios.post(url, {
      fields: airtableFields
    }, {
      headers: {
        'Authorization': `Bearer ${airtableAccessToken}`,
        'Content-Type': 'application/json'
      },
      timeout: 15000
    });

    const duration = Date.now() - startTime;
    
    console.log('Riskfaktor skapad:', response.data);
    
    res.json({
      success: true,
      record: response.data,
      duration: duration
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('Error creating risk factor:', error.message);
    
    res.status(500).json({
      error: 'Fel vid skapande av riskfaktor',
      message: error.message,
      duration: duration
    });
  }
});

// PUT /api/risk-factors/:id - Uppdatera riskfaktor
app.put('/api/risk-factors/:id', async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { id } = req.params;
    console.log(`Uppdaterar riskfaktor: ${id}`);
    
    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
    const airtableBaseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
    
    if (!airtableAccessToken) {
      return res.status(500).json({
        error: 'Airtable API-nyckel saknas',
        message: 'AIRTABLE_ACCESS_TOKEN är inte konfigurerad'
      });
    }

    const riskData = req.body;
    console.log('Uppdateringsdata:', riskData);
    
    // Konvertera fältnamn till fält-ID:n för Airtable
    const fieldMapping = {
      'Typ av riskfaktor': 'fldpwh7655qQRsfd2',
      'Riskfaktor': 'fldBXz24TIPi0dayY',
      'Beskrivning': 'fld4epowAz3n7gYxl',
      'Riskbedömning': 'flddfJfl5yru8rKyp',
      'Åtgjärd': 'fld9EOySG5oGUNUJ0',
      'Åtgärd': 'fld9EOySG5oGUNUJ0',
      'Byrå ID': 'fld14CLMCwvjr8ReH',
      'Riskbedömning godkänd datum': 'fld4VBsWkW7GmBFt5',
      'Aktuell': 'fldAktuell' // Detta fält behöver läggas till i Airtable
    };

    // Skapa Airtable-fält
    const airtableFields = {};
    Object.keys(riskData).forEach(key => {
      if (fieldMapping[key]) {
        airtableFields[fieldMapping[key]] = riskData[key];
      } else {
        // Om fältet inte finns i mappningen, använd fältnamnet direkt
        airtableFields[key] = riskData[key];
      }
    });

    console.log('Airtable-fält:', airtableFields);

    const url = `https://api.airtable.com/v0/${airtableBaseId}/${RISK_FACTORS_TABLE}/${id}`;
    
    const response = await axios.patch(url, {
      fields: airtableFields
    }, {
      headers: {
        'Authorization': `Bearer ${airtableAccessToken}`,
        'Content-Type': 'application/json'
      },
      timeout: 15000
    });

    const duration = Date.now() - startTime;
    
    console.log('Riskfaktor uppdaterad:', response.data);
    
    res.json({
      success: true,
      record: response.data,
      duration: duration
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('Error updating risk factor:', error.message);
    
    res.status(500).json({
      error: 'Fel vid uppdatering av riskfaktor',
      message: error.message,
      duration: duration
    });
  }
});

// DELETE /api/risk-factors/:id - Ta bort riskfaktor
app.delete('/api/risk-factors/:id', async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { id } = req.params;
    console.log(`Tar bort riskfaktor: ${id}`);
    
    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
    const airtableBaseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
    
    if (!airtableAccessToken) {
      return res.status(500).json({
        error: 'Airtable API-nyckel saknas',
        message: 'AIRTABLE_ACCESS_TOKEN är inte konfigurerad'
      });
    }

    const url = `https://api.airtable.com/v0/${airtableBaseId}/${RISK_FACTORS_TABLE}/${id}`;
    
    await axios.delete(url, {
      headers: {
        'Authorization': `Bearer ${airtableAccessToken}`,
        'Content-Type': 'application/json'
      },
      timeout: 15000
    });

    const duration = Date.now() - startTime;
    
    console.log(`Riskfaktor borttagen: ${id}`);
    
    res.json({
      success: true,
      message: 'Riskfaktor borttagen',
      duration: duration
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('Error deleting risk factor:', error.message);
    
    res.status(500).json({
      error: 'Fel vid borttagning av riskfaktor',
      message: error.message,
      duration: duration
    });
  }
});

// GET /api/notes - Hämta anteckningar för en kund
app.get('/api/notes', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { customerId } = req.query;
    
    if (!customerId) {
      return res.status(400).json({
        success: false,
        message: 'customerId parameter saknas'
      });
    }

    console.log(`🔍 Hämtar anteckningar för kund: ${customerId}`);
    
    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
    const airtableBaseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
    const KUNDDATA_TABLE = 'tblOIuLQS2DqmOQWe';
    
    // Tabell-ID för Anteckningar från Airtable API-dokumentation
    // Tabell-ID: tblXswCwopx7l02Mu (kan också använda "Anteckningar")
    const NOTES_TABLE_NAMES = [
      'tblXswCwopx7l02Mu', // Tabell-ID (rekommenderat)
      'Anteckningar',       // Tabellnamn (fungerar också)
      'Notes'               // Fallback
    ];
    
    if (!airtableAccessToken) {
      return res.status(500).json({
        error: 'Airtable API-nyckel saknas',
        message: 'AIRTABLE_ACCESS_TOKEN är inte konfigurerad'
      });
    }

    // Hämta användardata för rollbaserad filtrering
    const userData = await getAirtableUser(req.user.email);
    if (!userData) {
      return res.status(404).json({
        success: false,
        message: 'Användare hittades inte'
      });
    }

    // Först: Hämta kunddata för att få Byrå ID och Orgnr
    console.log(`🔍 Hämtar kunddata för ID: ${customerId}`);
    const customerUrl = `https://api.airtable.com/v0/${airtableBaseId}/${KUNDDATA_TABLE}/${customerId}`;
    
    let customerData = null;
    let byraId = null;
    let orgnr = null;
    
    try {
      const customerResponse = await axios.get(customerUrl, {
        headers: {
          'Authorization': `Bearer ${airtableAccessToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      });

      customerData = customerResponse.data;
      const fields = customerData.fields || {};
      
      // Hämta Byrå ID och Orgnr med olika möjliga fältnamn
      byraId = fields['Byrå ID'] || fields['ByråID'] || fields['Byra ID'] || fields['ByraID'] || fields['Byrå'] || null;
      orgnr = fields['Orgnr'] || fields['Orgnr.'] || fields['Org.nr'] || fields['Organisationsnummer'] || fields['Org nr'] || null;
      
      console.log(`📋 Kunddata hämtad - Byrå ID: ${byraId}, Orgnr: ${orgnr}`);
      
      if (!byraId && !orgnr) {
        console.warn('⚠️ Varken Byrå ID eller Orgnr hittades i kunddata');
      }
    } catch (error) {
      console.error('❌ Kunde inte hämta kunddata:', error.message);
      return res.status(404).json({
        success: false,
        message: 'Kund hittades inte',
        error: error.message
      });
    }

    // Nu: Hämta anteckningar baserat på Byrå ID och Orgnr
    let notes = [];
    let workingTableName = null;
    
    // Exakta fältnamn för Byrå ID och Orgnr i Anteckningar-tabellen
    // Från Airtable API-dokumentation:
    // - Byrå ID: fldudECe6P466Aau6 (Text)
    // - Orgnr: fldUWIzd230yo60pj (Text)
    const BYRA_ID_FIELD_NAMES = ['Byrå ID', 'fldudECe6P466Aau6']; // Exakt fältnamn först
    const ORGNR_FIELD_NAMES = ['Orgnr', 'fldUWIzd230yo60pj']; // Exakt fältnamn först
    
    if (!byraId && !orgnr) {
      console.warn('⚠️ Inga filterkriterier tillgängliga (varken Byrå ID eller Orgnr)');
      return res.json({
        success: true,
        notes: [],
        count: 0,
        customerId: customerId,
        byraId: null,
        orgnr: null,
        message: 'Inga filterkriterier tillgängliga',
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime
      });
    }
    
    for (const tableName of NOTES_TABLE_NAMES) {
      // Försök alla kombinationer av fältnamn
      for (const byraFieldName of byraId ? BYRA_ID_FIELD_NAMES : [null]) {
        for (const orgnrFieldName of orgnr ? ORGNR_FIELD_NAMES : [null]) {
          try {
            // Bygg filterformel
            let filterFormula = '';
            
            if (byraId && byraFieldName && orgnr && orgnrFieldName) {
              // Både Byrå ID och Orgnr
              filterFormula = `AND({${byraFieldName}}="${byraId}", {${orgnrFieldName}}="${orgnr}")`;
            } else if (byraId && byraFieldName) {
              // Endast Byrå ID
              filterFormula = `{${byraFieldName}}="${byraId}"`;
            } else if (orgnr && orgnrFieldName) {
              // Endast Orgnr
              filterFormula = `{${orgnrFieldName}}="${orgnr}"`;
            } else {
              continue; // Hoppa över om ingen filter kan byggas
            }
            
            const url = `https://api.airtable.com/v0/${airtableBaseId}/${tableName}?filterByFormula=${encodeURIComponent(filterFormula)}`;
            
            console.log(`🌐 Försöker hämta från tabell: ${tableName}`);
            console.log(`🌐 Byrå ID fält: ${byraFieldName || 'N/A'}, Orgnr fält: ${orgnrFieldName || 'N/A'}`);
            console.log(`🌐 Filter: ${filterFormula}`);
            
            const response = await axios.get(url, {
              headers: {
                'Authorization': `Bearer ${airtableAccessToken}`,
                'Content-Type': 'application/json'
              },
              timeout: 15000
            });

            const records = response.data.records || [];
            console.log(`✅ Hittade ${records.length} anteckningar i tabell: ${tableName}`);
            
            if (records.length > 0) {
              notes = records;
              workingTableName = tableName;
              break; // Hittade poster, avbryt looparna
            }
          } catch (error) {
            // Om det är ett 404 eller 422, tabellen/fältet finns inte - hoppa över
            if (error.response && (error.response.status === 404 || error.response.status === 422)) {
              console.log(`⚠️ Tabell/fält verkar inte finnas: ${tableName}`);
              continue;
            }
            console.log(`⚠️ Fel vid hämtning från ${tableName}:`, error.message);
            if (error.response) {
              console.log(`⚠️ Airtable error:`, error.response.data);
            }
            continue;
          }
        }
        if (notes.length > 0) break; // Hittade poster, avbryt yttre loopen
      }
      if (notes.length > 0) break; // Hittade poster, avbryt tabellnamn-loopen
      
      // Om första tabellnamnet inte gav resultat, testa om tabellen finns
      if (tableName === NOTES_TABLE_NAMES[0] && notes.length === 0) {
        try {
          const testUrl = `https://api.airtable.com/v0/${airtableBaseId}/${tableName}?maxRecords=1`;
          await axios.get(testUrl, {
            headers: {
              'Authorization': `Bearer ${airtableAccessToken}`,
              'Content-Type': 'application/json'
            },
            timeout: 15000
          });
          console.log(`✅ Tabell ${tableName} finns, men inga poster matchade filtret`);
          workingTableName = tableName;
        } catch (testError) {
          console.log(`⚠️ Tabell ${tableName} verkar inte finnas:`, testError.message);
        }
      }
    }

    // Om vi inte hittade några notes, logga information
    if (notes.length === 0) {
      console.log('⚠️ Inga anteckningar hittades.');
      console.log(`💡 Sökte med Byrå ID: ${byraId}, Orgnr: ${orgnr}`);
      console.log(`💡 Tabellnamn som testades: ${NOTES_TABLE_NAMES.join(', ')}`);
    }

    const duration = Date.now() - startTime;

    res.json({
      success: true,
      notes: notes.map(record => ({
        id: record.id,
        createdTime: record.createdTime,
        fields: record.fields
      })),
      count: notes.length,
      customerId: customerId,
      byraId: byraId,
      orgnr: orgnr,
      userRole: userData.role,
      timestamp: new Date().toISOString(),
      duration: duration
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('Error fetching notes:', error.message);
    
    if (error.response) {
      console.error('Airtable API Error:', {
        status: error.response.status,
        data: error.response.data
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Fel vid hämtning av anteckningar',
      error: error.message,
      timestamp: new Date().toISOString(),
      duration: duration
    });
  }
});

// POST /api/notes - Skapa ny anteckning
app.post('/api/notes', authenticateToken, async (req, res) => {
  const startTime = Date.now();
  
  console.log('📥 POST /api/notes - Request received, field keys:', req.body ? Object.keys(req.body) : []);
  let cleanedFields = {};
  
  try {
    const noteData = req.body;
    
    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
    const airtableBaseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
    const NOTES_TABLE = 'tblXswCwopx7l02Mu'; // Anteckningar tabell-ID
    
    if (!airtableAccessToken) {
      return res.status(500).json({
        error: 'Airtable API-nyckel saknas',
        message: 'AIRTABLE_ACCESS_TOKEN är inte konfigurerad'
      });
    }

    // Hämta användardata
    const userData = await getAirtableUser(req.user.email);
    if (!userData) {
      return res.status(404).json({
        success: false,
        message: 'Användare hittades inte'
      });
    }

    // Bygg Airtable-fält
    // "Typ av anteckning" är ett multiple select-fält i Airtable, så det måste vara en array
    let typAvAnteckning = noteData.typAvAnteckning;
    if (!Array.isArray(typAvAnteckning)) {
      // Om det inte är en array, gör om till array
      typAvAnteckning = typAvAnteckning ? [typAvAnteckning] : [];
    }
    
    const airtableFields = {
      'Typ av anteckning': typAvAnteckning,
      'Datum': noteData.datum || new Date().toISOString().split('T')[0],
      'Notes': noteData.notes || ''
    };
    
    // Lägg till Byrå ID och Orgnr endast om de finns
    if (noteData.byraId && noteData.byraId.trim() !== '') {
      airtableFields['Byrå ID'] = noteData.byraId.trim();
    }
    if (noteData.orgnr && noteData.orgnr.trim() !== '') {
      airtableFields['Orgnr'] = noteData.orgnr.trim();
    }
    
    // Lägg till valfria fält
    if (noteData.foretagsnamn) {
      airtableFields['Företagsnamn'] = noteData.foretagsnamn;
    }
    
    if (noteData.person) {
      airtableFields['Person'] = noteData.person;
    }
    
    // Lägg till UserID — bara om det är numeriskt (Airtable-fältet är number)
    if (userData.id) {
      const userId = parseInt(userData.id);
      if (!isNaN(userId)) {
        airtableFields['UserID'] = userId;
      }
      // userData.id är ett Airtable record ID ("recXXX") — hoppa över det
    }
    
    // Lägg till Name (användarens namn) - endast om det finns
    if (userData.name && userData.name.trim() !== '') {
      airtableFields['Name'] = userData.name.trim();
    }
    
    // Lägg till ToDo-uppgifter - endast om de har innehåll
    for (let i = 1; i <= 8; i++) {
      if (noteData[`ToDo${i}`] && noteData[`ToDo${i}`].trim() !== '') {
        airtableFields[`ToDo${i}`] = noteData[`ToDo${i}`].trim();
      }
      if (noteData[`Status${i}`] && noteData[`Status${i}`].trim() !== '') {
        airtableFields[`Status${i}`] = noteData[`Status${i}`].trim();
      }
    }
    
    // Ta bort tomma fält innan vi skickar till Airtable (tomma strängar kan orsaka 422-fel)
    cleanedFields = {};
    for (const [key, value] of Object.entries(airtableFields)) {
      // Behåll fältet om det inte är tomt
      if (value !== null && value !== undefined && value !== '') {
        if (Array.isArray(value) && value.length > 0) {
          cleanedFields[key] = value;
        } else if (!Array.isArray(value)) {
          cleanedFields[key] = value;
        }
      }
    }
    
    const url = `https://api.airtable.com/v0/${airtableBaseId}/${NOTES_TABLE}`;
    
    console.log('🌐 Skapar anteckning i Airtable:', url);
    console.log('📋 Fält som skickas till Airtable:', JSON.stringify(cleanedFields, null, 2));
    
    const response = await axios.post(url, {
      fields: cleanedFields
    }, {
      headers: {
        'Authorization': `Bearer ${airtableAccessToken}`,
        'Content-Type': 'application/json'
      },
      timeout: 15000
    });

    const duration = Date.now() - startTime;
    
    console.log('✅ Anteckning skapad:', response.data);
    
    res.json({
      success: true,
      record: response.data,
      message: 'Anteckning skapad',
      timestamp: new Date().toISOString(),
      duration: duration
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('❌ Error creating note:', error.message);
    console.error('❌ Error stack:', error.stack);
    
    if (error.response) {
      console.error('❌ Airtable API Error:', {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data
      });
      
      // Om det är ett 422-fel, visa mer detaljerad information
      if (error.response.status === 422) {
        console.error('❌ Validation Error Details:', JSON.stringify(error.response.data, null, 2));
        console.error('❌ Fält som skickades:', JSON.stringify(cleanedFields, null, 2));
      }
      
      // Returnera fel-svar istället för att krascha
      return res.status(error.response.status || 500).json({
        success: false,
        message: 'Fel vid skapande av anteckning',
        error: error.message,
        airtableError: error.response.data || null,
        airtableStatus: error.response.status || null,
        sentFields: error.response.status === 422 ? cleanedFields : null,
        timestamp: new Date().toISOString(),
        duration: duration
      });
    }
    
    // Om det inte är ett Airtable-fel, returnera generiskt fel
    res.status(500).json({
      success: false,
      message: 'Fel vid skapande av anteckning',
      error: error.message,
      airtableError: null,
      airtableStatus: null,
      sentFields: null,
      timestamp: new Date().toISOString(),
      duration: duration
    });
  }
});

// PATCH /api/notes/:id – Uppdatera anteckning
app.patch('/api/notes/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { fields: noteData } = req.body;
    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
    const airtableBaseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
    const NOTES_TABLE = 'tblXswCwopx7l02Mu';

    const airtableFields = {};

    if (noteData.typAvAnteckning) {
      airtableFields['Typ av anteckning'] = Array.isArray(noteData.typAvAnteckning)
        ? noteData.typAvAnteckning : [noteData.typAvAnteckning];
    }
    if (noteData.datum) airtableFields['Datum'] = noteData.datum;
    if (noteData.notes !== undefined) airtableFields['Notes'] = noteData.notes;
    if (noteData.person !== undefined) airtableFields['Person'] = noteData.person;
    if (noteData.foretagsnamn) airtableFields['Företagsnamn'] = noteData.foretagsnamn;

    for (let i = 1; i <= 8; i++) {
      if (noteData[`ToDo${i}`] !== undefined) airtableFields[`ToDo${i}`] = noteData[`ToDo${i}`];
      if (noteData[`Status${i}`] !== undefined) airtableFields[`Status${i}`] = noteData[`Status${i}`];
    }

    // Ta bort tomma strängar
    Object.keys(airtableFields).forEach(k => {
      if (airtableFields[k] === '') delete airtableFields[k];
    });

    const response = await axios.patch(
      `https://api.airtable.com/v0/${airtableBaseId}/${NOTES_TABLE}/${id}`,
      { fields: airtableFields },
      { headers: { Authorization: `Bearer ${airtableAccessToken}`, 'Content-Type': 'application/json' } }
    );

    res.json({ success: true, note: response.data });
  } catch (error) {
    console.error('❌ Error updating note:', error.message);
    if (error.response) {
      console.error('❌ Airtable svar:', JSON.stringify(error.response.data, null, 2));
      return res.status(error.response.status || 500).json({ error: error.response.data?.error?.message || error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

// GET /api/my-tasks – Användarens oklara uppgifter (från anteckningar)
app.get('/api/my-tasks', authenticateToken, async (req, res) => {
  try {
    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
    const airtableBaseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
    const NOTES_TABLE = 'tblXswCwopx7l02Mu';
    const KUNDDATA_TABLE = 'tblOIuLQS2DqmOQWe';

    const userData = await getAirtableUser(req.user.email);
    if (!userData) return res.status(404).json({ error: 'Användare hittades inte' });
    const byraId = userData.byraId || userData.byraIds?.[0] || '';

    if (!byraId) {
      return res.json({ tasks: [] });
    }

    const notesFilter = isNaN(parseInt(byraId)) ? `{Byrå ID}="${String(byraId).replace(/"/g, '\\"')}"` : `{Byrå ID}=${byraId}`;
    const notesUrl = `https://api.airtable.com/v0/${airtableBaseId}/${NOTES_TABLE}?filterByFormula=${encodeURIComponent(notesFilter)}&maxRecords=200`;
    const notesRes = await axios.get(notesUrl, {
      headers: { Authorization: `Bearer ${airtableAccessToken}` }
    });
    const notes = notesRes.data.records || [];

    const orgNrToCustomer = {};
    const custFilter = isNaN(parseInt(byraId)) ? `{Byrå ID}="${String(byraId).replace(/"/g, '\\"')}"` : `{Byrå ID}=${byraId}`;
    const custUrl = `https://api.airtable.com/v0/${airtableBaseId}/${KUNDDATA_TABLE}?filterByFormula=${encodeURIComponent(custFilter)}&maxRecords=500&fields[]=Namn&fields[]=Orgnr`;
    try {
      const custRes = await axios.get(custUrl, { headers: { Authorization: `Bearer ${airtableAccessToken}` } });
      for (const r of custRes.data.records || []) {
        const o = (r.fields?.Orgnr || '').replace(/\D/g, '');
        if (o) orgNrToCustomer[o] = { id: r.id, namn: r.fields?.Namn || '' };
      }
    } catch (_) {}

    const tasks = [];
    const userName = (userData.name || '').trim();
    for (const note of notes) {
      const f = note.fields || {};
      const noteName = (f['Name'] || '').trim();
      if (userName && noteName && noteName !== userName) continue;
      const orgnr = String(f['Orgnr'] || '').replace(/\D/g, '');
      const customer = orgnr ? orgNrToCustomer[orgnr] : null;
      for (let i = 1; i <= 8; i++) {
        const todo = f[`ToDo${i}`];
        const status = (f[`Status${i}`] || '').trim();
        if (!todo || (typeof todo === 'string' && !todo.trim())) continue;
        const statusLower = status.toLowerCase();
        if (statusLower === 'klart' || statusLower === 'klar') continue;
        tasks.push({
          noteId: note.id,
          index: i,
          text: typeof todo === 'string' ? todo.trim() : String(todo),
          status: status || 'Att göra',
          customerId: customer?.id || null,
          customerName: customer?.namn || f['Företagsnamn'] || 'Okänd kund',
          datum: f['Datum'] || ''
        });
      }
    }
    tasks.sort((a, b) => (b.datum || '').localeCompare(a.datum || ''));
    res.json({ tasks });
  } catch (error) {
    console.error('❌ GET /api/my-tasks:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/notes/:id – Ta bort anteckning
app.delete('/api/notes/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
    const airtableBaseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
    const NOTES_TABLE = 'tblXswCwopx7l02Mu';

    await axios.delete(
      `https://api.airtable.com/v0/${airtableBaseId}/${NOTES_TABLE}/${id}`,
      { headers: { Authorization: `Bearer ${airtableAccessToken}` } }
    );

    res.json({ success: true });
  } catch (error) {
    console.error('❌ Error deleting note:', error.message);
    if (error.response) {
      return res.status(error.response.status || 500).json({ error: error.response.data?.error?.message || error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

const server = app.listen(PORT, () => {
  console.log(`🚀 API Proxy Service running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🧪 Test endpoint: http://localhost:${PORT}/test`);
  console.log(`📋 Airtable endpoints:`);
  console.log(`   • Test connection: GET http://localhost:${PORT}/api/airtable/test`);
  console.log(`   • Config: GET http://localhost:${PORT}/api/airtable/config`);
  console.log(`🏢 Bolagsverket endpoints:`);
  console.log(`   • Health check: GET http://localhost:${PORT}/api/bolagsverket/isalive`);
  console.log(`   • Get organization: POST http://localhost:${PORT}/api/bolagsverket/organisationer`);
  console.log(`   • Save to Airtable: POST http://localhost:${PORT}/api/bolagsverket/save-to-airtable`);
  console.log(`👥 User Management endpoints:`);
  console.log(`   • Test users: GET http://localhost:${PORT}/api/auth/test-users`);
      console.log(`   • Get KUNDDATA: GET http://localhost:${PORT}/api/kunddata`);
    console.log(`   • Get KUNDDATA by ID: GET http://localhost:${PORT}/api/kunddata/:id`);
    console.log(`   • Post KUNDDATA: POST http://localhost:${PORT}/api/kunddata`);
    console.log(`   • Debug KUNDDATA: GET http://localhost:${PORT}/api/kunddata/debug`);
    console.log(`   • Test KUNDDATA: GET http://localhost:${PORT}/api/kunddata/test`);
    console.log(`📝 Notes endpoints:`);
    console.log(`   • Get notes: GET http://localhost:${PORT}/api/notes?customerId=:id`);
  console.log(`⚠️ Risk Assessment endpoints:`);
  console.log(`   • Get all: GET http://localhost:${PORT}/api/risk-assessments`);
  console.log(`   • Create: POST http://localhost:${PORT}/api/risk-assessments`);
  console.log(`   • Update: PUT http://localhost:${PORT}/api/risk-assessments/:id`);
  console.log(`   • Approve: PUT http://localhost:${PORT}/api/risk-assessments/:id/approve`);
  console.log(`   • Delete: DELETE http://localhost:${PORT}/api/risk-assessments/:id`);
  console.log(`⚠️ Risk Factors endpoints:`);
  console.log(`   • Get all: GET http://localhost:${PORT}/api/risk-factors`);
  console.log(`   • Create: POST http://localhost:${PORT}/api/risk-factors`);
  console.log(`   • Update: PUT http://localhost:${PORT}/api/risk-factors/:id`);
  console.log(`   • Delete: DELETE http://localhost:${PORT}/api/risk-factors/:id`);
}).on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} är redan i bruk!`);
    console.error(`\n🔧 Lösning:`);
    console.error(`   1. Hitta processen som använder port ${PORT}:`);
    console.error(`      netstat -ano | findstr :${PORT}`);
    console.error(`   2. Stäng processen:`);
    console.error(`      taskkill /F /PID <PID-nummer>`);
    console.error(`   3. Eller använd en annan port genom att sätta miljövariabeln:`);
    console.error(`      set PORT=3002`);
    console.error(`      node index.js`);
    process.exit(1);
  } else {
    console.error('❌ Server error:', err);
    process.exit(1);
  }
});

// Test endpoint för att lista alla tillgängliga tabeller i Airtable
app.get('/api/airtable/list-tables', async (req, res) => {
  try {
    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
    const airtableBaseId = process.env.AIRTABLE_BASE_ID;

    if (!airtableAccessToken || !airtableBaseId) {
      return res.status(400).json({
        error: 'Airtable credentials saknas',
        hasToken: !!airtableAccessToken,
        hasBaseId: !!airtableBaseId
      });
    }

    // Hämta base metadata för att se alla tabeller
    const baseUrl = `https://api.airtable.com/v0/meta/bases/${airtableBaseId}/tables`;
    
    const response = await axios.get(baseUrl, {
      headers: {
        'Authorization': `Bearer ${airtableAccessToken}`,
        'Content-Type': 'application/json'
      },
      timeout: 15000
    });

    const tables = response.data.tables.map(table => ({
      id: table.id,
      name: table.name,
      description: table.description,
      fields: table.fields.map(field => ({
        id: field.id,
        name: field.name,
        type: field.type
      }))
    }));

    res.json({
      success: true,
      baseId: airtableBaseId,
      tableCount: tables.length,
      tables: tables
    });

  } catch (error) {
    console.error('Error listing Airtable tables:', error.message);
    
    if (error.response) {
      console.error('Airtable error response:', {
        status: error.response.status,
        data: error.response.data
      });
    }

    res.status(500).json({
      error: 'Fel vid hämtning av Airtable-tabeller',
      message: error.message,
      details: error.response?.data || null
    });
  }
});

const AVVIKELSER_TABLE = 'tblywoL6wHuErTWBK';

// GET /api/avvikelser - Hämta avvikelser för en kund eller hela byrån
app.get('/api/avvikelser', authenticateToken, async (req, res) => {
  try {
    const { customerId, byraOnly } = req.query;
    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
    const airtableBaseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';

    if (!airtableAccessToken) {
      return res.status(500).json({ error: 'Airtable API-nyckel saknas' });
    }

    // Hämta orgnr och byråID från kunddata om customerId är angivet
    // Eller endast ByråID om byraOnly=1 (alla avvikelser för byrån)
    let filterFormula = '';
    if (byraOnly === '1' || byraOnly === 'true') {
      const userData = await getAirtableUser(req.user.email);
      if (!userData) return res.status(404).json({ success: false, message: 'Användare hittades inte' });
      const byraId = userData.byraId;
      if (byraId) {
        const num = parseInt(byraId);
        filterFormula = isNaN(num) ? `{ByråID}="${byraId}"` : `{ByråID}=${byraId}`;
      }
    } else if (customerId) {
      const kundResponse = await axios.get(
        `https://api.airtable.com/v0/${airtableBaseId}/tblOIuLQS2DqmOQWe/${customerId}`,
        { headers: { Authorization: `Bearer ${airtableAccessToken}` } }
      );
      const orgnr = kundResponse.data?.fields?.Orgnr;
      const byraId = kundResponse.data?.fields?.['Byrå ID'];
      if (orgnr && byraId) {
        filterFormula = `AND({ByråID}=${byraId},{orgnr}="${orgnr}")`;
      }
    }

    const params = {
      sort: [{ field: 'Date', direction: 'desc' }]
    };
    if (filterFormula) params.filterByFormula = filterFormula;

    const response = await axios.get(
      `https://api.airtable.com/v0/${airtableBaseId}/${AVVIKELSER_TABLE}`,
      {
        headers: { Authorization: `Bearer ${airtableAccessToken}` },
        params
      }
    );

    res.json({ success: true, avvikelser: response.data.records || [] });
  } catch (error) {
    console.error('❌ Error fetching avvikelser:', error.message);
    res.status(500).json({ success: false, message: 'Fel vid hämtning av avvikelser', error: error.message });
  }
});

// POST /api/avvikelser - Skapa ny avvikelse
app.post('/api/avvikelser', authenticateToken, async (req, res) => {
  try {
    const avvikelseData = req.body;
    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
    const airtableBaseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';

    if (!airtableAccessToken) {
      return res.status(500).json({ error: 'Airtable API-nyckel saknas' });
    }

    const userData = await getAirtableUser(req.user.email);
    if (!userData) {
      return res.status(404).json({ success: false, message: 'Användare hittades inte' });
    }

    const fields = {};

    if (avvikelseData.typ) fields['Typ av avvikelse'] = avvikelseData.typ;
    if (avvikelseData.datum) fields['Date'] = avvikelseData.datum;
    const rappDatum = (avvikelseData.rapporteratDatum || '').trim();
    if (rappDatum) fields['Date 2'] = rappDatum;
    if (avvikelseData.beskrivning) fields['Förklararing'] = avvikelseData.beskrivning;
    if (avvikelseData.status) fields['Status'] = avvikelseData.status;
    if (avvikelseData.orgnr) fields['orgnr'] = avvikelseData.orgnr;
    const foretagsnamn = (avvikelseData.foretagsnamn || '').trim();
    if (foretagsnamn) fields['Företagsnamn'] = foretagsnamn;

    // ByråID är number-fält – använd kundens byraId eller användarens byraId som fallback
    let byraId = avvikelseData.byraId || userData.byraId;
    if (byraId != null && byraId !== '') {
      const byraIdNum = parseInt(String(byraId));
      if (!isNaN(byraIdNum)) fields['ByråID'] = byraIdNum;
    }

    if (!fields['ByråID']) {
      return res.status(400).json({
        success: false,
        message: 'Byrå ID saknas. Kontrollera att kunden är kopplad till en byrå.',
        error: 'MISSING_BYRA_ID'
      });
    }

    console.log('📋 Sparar avvikelse:', JSON.stringify(fields, null, 2));

    const response = await axios.post(
      `https://api.airtable.com/v0/${airtableBaseId}/${AVVIKELSER_TABLE}`,
      { fields },
      {
        headers: {
          Authorization: `Bearer ${airtableAccessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('✅ Avvikelse sparad:', response.data.id);
    res.json({ success: true, record: response.data, message: 'Avvikelse sparad' });
  } catch (error) {
    console.error('❌ Error saving avvikelse:', error.message);
    if (error.response) {
      const at = error.response.data || {};
      const atMsg = at.error?.message || at.message || JSON.stringify(at);
      console.error('❌ Airtable error:', JSON.stringify(error.response.data, null, 2));
      return res.status(error.response.status || 500).json({
        success: false,
        message: atMsg || 'Fel vid sparande av avvikelse',
        error: error.message,
        airtableError: error.response.data
      });
    }
    res.status(500).json({ success: false, message: 'Fel vid sparande av avvikelse', error: error.message });
  }
});

// ─── KYC-FORMULÄR ────────────────────────────────────────────────────────────

const KUNDDATA_TABLE_KYC = 'tblOIuLQS2DqmOQWe';

function parseInleedDocumentsList(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.documents)) return data.documents;
  return [];
}

async function fetchInleedDocumentById(docsignApiKey, inleedDocId) {
  if (!docsignApiKey || !inleedDocId) return null;
  const matchId = (d) => String(d.id || d.document_id || '') === String(inleedDocId);
  for (const state of ['completed', 'pending', 'signed']) {
    try {
      const docsRes = await axios.get('https://docsign.se/api/documents', {
        params: { api_key: docsignApiKey, state },
        headers: { 'Content-Type': 'application/json' },
        timeout: 15000
      });
      const doc = parseInleedDocumentsList(docsRes.data).find(matchId);
      if (doc) return doc;
    } catch (_) { /* prova nästa state */ }
  }
  return null;
}

function getInleedSignedPdfUrl(doc) {
  if (!doc) return null;
  return doc.signed_pdf_url || doc.signed_document_url || doc.download_url || null;
}

function isInleedDocumentSigned(doc) {
  if (!doc) return false;
  if (getInleedSignedPdfUrl(doc)) return true;
  const st = (doc.status || doc.state || '').toString().toLowerCase();
  return ['completed', 'signed', 'done', 'finished'].includes(st);
}

// GET /api/kyc-formular/:customerId – Hämta sparat KYC-formulär
app.get('/api/kyc-formular/:customerId', authenticateToken, async (req, res) => {
  try {
    const { customerId } = req.params;
    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
    const baseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';

    const custRes = await axios.get(
      `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(process.env.AIRTABLE_TABLE_NAME || 'Kunder')}/${customerId}`,
      { headers: { Authorization: `Bearer ${airtableAccessToken}` } }
    );
    const f = custRes.data.fields || {};
    const raw = f['KYC-formular (JSON)'] || '';
    let kyc = {};
    try { kyc = raw ? JSON.parse(raw) : {}; } catch (_) { kyc = {}; }

    // Synka status från Inleed om dokumentet är färdigsignerat men JSON fortfarande säger "Skickat till kund"
    const inleedId = kyc.inleedDokumentId;
    const docsignApiKey = process.env.DOCSIGN_API_KEY;
    if (inleedId && docsignApiKey && (kyc.status || '') === 'Skickat till kund') {
      try {
        const doc = await fetchInleedDocumentById(docsignApiKey, inleedId);
        if (isInleedDocumentSigned(doc)) {
          const datum = (doc.completed_at || doc.signed_at || doc.updated_at || '')
            .toString().split(' ')[0].split('T')[0] || new Date().toISOString().split('T')[0];
          kyc.status = 'Signerat';
          kyc.signeringsdatum = /^\d{4}-\d{2}-\d{2}$/.test(datum) ? datum : new Date().toISOString().split('T')[0];
          await axios.patch(
            `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(process.env.AIRTABLE_TABLE_NAME || 'Kunder')}/${customerId}`,
            { fields: { 'KYC-formular (JSON)': JSON.stringify(kyc) } },
            { headers: { Authorization: `Bearer ${airtableAccessToken}`, 'Content-Type': 'application/json' } }
          );
        }
      } catch (_) { /* GET ska inte fallera om Inleed är otillgängligt */ }
    }

    res.json({ kyc });
  } catch (error) {
    console.error('❌ Error fetching KYC-formular:', error.message);
    res.status(500).json({ error: 'Kunde inte hämta KYC-formulär.' });
  }
});

// POST /api/kyc-formular/:customerId – Spara KYC-formulär
app.post('/api/kyc-formular/:customerId', authenticateToken, async (req, res) => {
  try {
    const { customerId } = req.params;
    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
    const baseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
    const tableName = process.env.AIRTABLE_TABLE_NAME || 'Kunder';

    const kycData = {
      ...req.body,
      status: req.body.status || 'Sparat',
      updatedAt: new Date().toISOString(),
      updatedBy: req.user?.email || ''
    };

    await axios.patch(
      `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}/${customerId}`,
      { fields: { 'KYC-formular (JSON)': JSON.stringify(kycData) } },
      { headers: { Authorization: `Bearer ${airtableAccessToken}`, 'Content-Type': 'application/json' } }
    );

    res.json({ success: true, message: 'KYC-formulär sparat.' });
  } catch (error) {
    console.error('❌ Error saving KYC-formular:', error.message);
    if (error.response?.status === 422) {
      console.error('   Airtable 422 – fältet "KYC-formular (JSON)" kanske saknas. Skapa ett "Long text"-fält med det namnet i tabellen Kunder.');
    }
    res.status(500).json({ error: 'Kunde inte spara KYC-formulär.' });
  }
});

// POST /api/kyc-formular/:customerId/pdf – Generera PDF
app.post('/api/kyc-formular/:customerId/pdf', authenticateToken, async (req, res) => {
  try {
    const { customerId } = req.params;
    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
    const baseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
    const tableName = process.env.AIRTABLE_TABLE_NAME || 'Kunder';

    const custRes = await axios.get(
      `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}/${customerId}`,
      { headers: { Authorization: `Bearer ${airtableAccessToken}` } }
    );
    const f = custRes.data.fields || {};
    const raw = f['KYC-formular (JSON)'] || '';
    let kyc = {};
    try { kyc = JSON.parse(raw); } catch (_) { kyc = {}; }

    if (!kyc.foretagsnamn) {
      return res.status(400).json({ error: 'Inget sparat KYC-formulär hittades. Spara först.' });
    }

    // Hämta byråinfo (logotyp, byrånamn)
    const pdfUser = await getAirtableUser(req.user.email);
    const logoRaw = pdfUser?.logo;
    const logoUrl = Array.isArray(logoRaw) && logoRaw.length > 0
      ? logoRaw[0].url
      : (typeof logoRaw === 'string' && logoRaw.startsWith('http') ? logoRaw : null);

    const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    const nl2br = (s) => esc(s).replace(/\n/g, '<br>');

    const janej = (v) => v === 'Ja' ? '<span style="color:#dc2626;font-weight:600;">Ja</span>' : (v === 'Nej' ? '<span style="color:#16a34a;font-weight:600;">Nej</span>' : esc(v || '–'));

    let logoHtml = '';
    if (logoUrl) {
      try {
        const logoRes = await axios.get(logoUrl, { responseType: 'arraybuffer', timeout: 10000 });
        const b64 = Buffer.from(logoRes.data).toString('base64');
        const mime = logoRes.headers['content-type'] || 'image/png';
        logoHtml = `<img src="data:${mime};base64,${b64}" style="max-height:60px;max-width:200px;object-fit:contain;" alt="Logo">`;
      } catch (_) {}
    }

    const byraNamn = pdfUser?.byra || '';
    const datum = new Date().toLocaleDateString('sv-SE');

    const ACCENT_KYC = '#3b4c8a';
    const html = `<!DOCTYPE html>
<html lang="sv"><head><meta charset="UTF-8">
<style>
  @page { margin: 18mm 20mm 22mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, 'Helvetica Neue', sans-serif; font-size: 8pt; color: #1a1a2e; line-height: 1.6; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; border-bottom: 3px solid ${ACCENT_KYC}; padding-bottom: 10px; }
  .header-left h1 { margin: 0; font-size: 18pt; font-weight: 900; letter-spacing: 0.03em; color: #1a1a2e; line-height: 1; }
  .header-left p { margin: 4px 0 0; font-size: 7.5pt; color: #888; }
  .section { margin-top: 14px; }
  .section h2 { font-size: 8pt; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; color: ${ACCENT_KYC}; border-bottom: 1.5px solid ${ACCENT_KYC}; padding-bottom: 3px; margin-bottom: 7px; }
  .field { margin-bottom: 4px; }
  .field-label { font-weight: 700; color: #1a1a2e; font-size: 8pt; }
  .field-value { margin-left: 4px; font-size: 8pt; }
  .row { display: flex; gap: 24px; margin-bottom: 4px; }
  .row .col { flex: 1; }
  .attestation { margin-top: 20px; padding: 12px 14px; border: 1.5px solid #dce3f0; border-radius: 6px; background: #f4f6fb; }
  .attestation h2 { font-size: 8pt; border: none; padding: 0; margin: 0 0 6px; }
  .attestation p { font-size: 8pt; line-height: 1.55; margin: 0; color: #334155; }
  .footer { position: fixed; bottom: 0; left: 0; right: 0; text-align: center; font-size: 6.5pt; color: #94a3b8; padding: 6px 20mm; border-top: 1px solid #e2e8f0; }
</style></head><body>
  <div class="header">
    <div class="header-left">
      <h1>KYC \u2014 Kundkännedomsformulär</h1>
      <p>${esc(byraNamn)} | ${datum}</p>
    </div>
    <div class="header-right">${logoHtml}</div>
  </div>

  <div class="section">
    <h2>1. Grunduppgifter om företaget</h2>
    <div class="row">
      <div class="col"><span class="field-label">Företagets namn:</span> <span class="field-value">${esc(kyc.foretagsnamn)}</span></div>
      <div class="col"><span class="field-label">Organisationsnummer:</span> <span class="field-value">${esc(kyc.orgnr)}</span></div>
    </div>
    <div class="row">
      <div class="col"><span class="field-label">Bolagsform:</span> <span class="field-value">${esc(kyc.bolagsform || '\u2014')}</span></div>
      <div class="col"><span class="field-label">Bransch:</span> <span class="field-value">${esc(kyc.bransch || '\u2014')}</span></div>
    </div>
    <div class="row">
      <div class="col"><span class="field-label">SNI-kod:</span> <span class="field-value">${esc(kyc.sni_kod || '\u2014')}</span></div>
      <div class="col"><span class="field-label">Skatterättslig hemvist:</span> <span class="field-value">${esc(kyc.skatterattslig_hemvist_foretag || '\u2014')}</span></div>
    </div>
    ${(kyc.skatterattslig_hemvist_foretag && kyc.skatterattslig_hemvist_foretag.trim().toLowerCase() !== 'sverige' && kyc.tin_foretag) ? `<div class="field"><span class="field-label">TIN:</span> <span class="field-value">${esc(kyc.tin_foretag)}</span></div>` : ''}
  </div>

  <div class="section">
    <h2>2. Företrädare</h2>
    ${(() => {
      const list = (Array.isArray(kyc.foretradare) && kyc.foretradare.length)
        ? kyc.foretradare
        : ((kyc.foretradareNamn || kyc.foretradarePnr) ? [{ namn: kyc.foretradareNamn, personnr: kyc.foretradarePnr, skatterattslig_hemvist: kyc.skatterattslig_hemvist_foretradare, tin: kyc.tin_foretradare }] : []);
      if (!list.length) return '<div class="field"><span class="field-value">\u2014</span></div>';
      return list.map(p => {
        const hemvist = (p.skatterattslig_hemvist || '').toString();
        const tinHtml = (hemvist && hemvist.trim().toLowerCase() !== 'sverige' && p.tin)
          ? `<div class="field"><span class="field-label">TIN:</span> <span class="field-value">${esc(p.tin)}</span></div>` : '';
        return `
    <div class="row">
      <div class="col"><span class="field-label">Namn:</span> <span class="field-value">${esc(p.namn || '\u2014')}</span></div>
      <div class="col"><span class="field-label">Personnummer:</span> <span class="field-value">${esc(p.personnr || '\u2014')}</span></div>
    </div>
    <div class="field"><span class="field-label">Skatterättslig hemvist:</span> <span class="field-value">${esc(hemvist || '\u2014')}</span></div>
    ${tinHtml}`;
      }).join('<div style="border-top:0.5px solid #e2e8f0;margin:6px 0;"></div>');
    })()}
  </div>

  <div class="section">
    <h2>3. Verklig huvudman</h2>
    <div class="field"><span class="field-label">Verklig(a) huvudman/-män:</span><br><span class="field-value">${nl2br(kyc.huvudmanInfo || '\u2014')}</span></div>
    ${kyc.huvudmanAnnatSatt ? `<div class="field" style="margin-top:6px;"><span class="field-label">Kontroll genom avtal el. dyl.:</span><br><span class="field-value">${nl2br(kyc.huvudmanAnnatSatt)}</span></div>` : ''}
    ${(kyc.vh_agarandel !== null && kyc.vh_agarandel !== undefined && kyc.vh_agarandel !== '') ? `<div class="field"><span class="field-label">Total ägarandel:</span> <span class="field-value">${esc(kyc.vh_agarandel)} %</span></div>` : ''}
    <div class="row">
      <div class="col"><span class="field-label">Börsnoterat bolag:</span> ${janej(kyc.vh_noterat_bolag ? 'Ja' : 'Nej')}</div>
      <div class="col"><span class="field-label">Utländska ägare:</span> ${janej(kyc.vh_utlandska_agare ? 'Ja' : 'Nej')}</div>
    </div>
  </div>

  <div class="section">
    <h2>4. Politiskt exponerad person (PEP)</h2>
    <div class="field"><span class="field-label">PEP-status:</span> ${janej(kyc.pep)}</div>
    ${kyc.pep === 'Ja' && kyc.pepDetaljer ? `<div class="field"><span class="field-label">Detaljer:</span> <span class="field-value">${esc(kyc.pepDetaljer)}</span></div>` : ''}
    <div class="field"><span class="field-label">Familjemedlem/medarbetare till PEP:</span> ${janej(kyc.pepFamilj)}</div>
    ${kyc.pepFamilj === 'Ja' && kyc.pepFamiljDetaljer ? `<div class="field"><span class="field-label">Detaljer:</span> <span class="field-value">${esc(kyc.pepFamiljDetaljer)}</span></div>` : ''}
  </div>

  <div class="section">
    <h2>5. Affärsförbindelsens syfte och art</h2>
    <div class="field"><span class="field-label">Huvudsaklig verksamhet:</span><br><span class="field-value">${nl2br(kyc.verksamhet || '\u2014')}</span></div>
    ${kyc.syfte_affarsrelation ? `<div class="field"><span class="field-label">Syfte med affärsrelationen:</span><br><span class="field-value">${nl2br(kyc.syfte_affarsrelation)}</span></div>` : ''}
    <div class="field"><span class="field-label">Byråns tjänster:</span> <span class="field-value">${esc(kyc.tjanster || '\u2014')}</span></div>
    <div class="field"><span class="field-label">Pengarnas ursprung:</span> <span class="field-value">${esc(kyc.kapitalUrsprung || '\u2014')}</span></div>
    <div class="row">
      <div class="col"><span class="field-label">Antal anställda:</span> <span class="field-value">${esc(kyc.anstallda || '\u2014')}</span></div>
      <div class="col"><span class="field-label">Uppskattad årsomsättning:</span> <span class="field-value">${esc(kyc.omsattning || '\u2014')}</span></div>
    </div>
  </div>

  <div class="section">
    <h2>6. Internationell handel</h2>
    <div class="field"><span class="field-label">Handel utanför Sverige:</span> ${janej(kyc.internationellHandel)}</div>
    ${kyc.internationellHandel === 'Ja' && kyc.internationellaLander ? `<div class="field"><span class="field-label">Länder:</span> <span class="field-value">${esc(kyc.internationellaLander)}</span></div>` : ''}
  </div>

  <div class="section">
    <h2>7. Kontanthantering</h2>
    <div class="field"><span class="field-label">Kontanthantering:</span> ${janej(kyc.kontanter)}</div>
    ${kyc.kontanter === 'Ja' && kyc.kontanterAndel ? `<div class="field"><span class="field-label">Andel kontanter:</span> <span class="field-value">${esc(kyc.kontanterAndel)}</span></div>` : ''}
  </div>

  <div class="attestation">
    <h2>Kundens intygande</h2>
    <p>Jag intygar att lämnade uppgifter är korrekta och fullständiga. Jag förbinder mig att meddela redovisningsbyrån vid väsentliga förändringar i verksamheten, ägarstrukturen eller gällande vem som är verklig huvudman.</p>
  </div>

  <div class="footer">${esc(byraNamn)} | KYC-formulär genererat ${datum}</div>
</body></html>`;

    // Generera PDF med Puppeteer
    const pup = loadPuppeteer();
    if (!pup) {
      return res.status(500).json({ error: 'Puppeteer ej tillgängligt – kan inte generera PDF.' });
    }
    const launchOpts = chromium
      ? { args: chromium.args, defaultViewport: chromium.defaultViewport, executablePath: await chromium.executablePath(), headless: chromium.headless }
      : { headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] };
    const browser = await pup.launch(launchOpts);
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '15mm', bottom: '20mm', left: '15mm', right: '15mm' } });
    await browser.close();

    const safeNamn = (kyc.foretagsnamn || 'Kund').replace(/[^a-zA-Z0-9åäöÅÄÖ _-]/g, '');
    const filename = `${safeNamn}-KYC-formular-${datum}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.send(Buffer.from(pdfBuffer));

  } catch (error) {
    console.error('❌ Error generating KYC-formular PDF:', error.message);
    res.status(500).json({ error: 'Kunde inte generera KYC PDF.' });
  }
});

// POST /api/kyc-formular/:customerId/skicka-for-signering – Inleed BankID-signering
app.post('/api/kyc-formular/:customerId/skicka-for-signering', authenticateToken, async (req, res) => {
  try {
    const { customerId } = req.params;
    let { signerare } = req.body;
    const signerareList = Array.isArray(signerare) ? signerare : (signerare?.namn && signerare?.epost ? [signerare] : []);

    if (signerareList.length === 0 || signerareList.some(s => !s.namn || !s.epost)) {
      return res.status(400).json({ error: 'Välj minst en signerare med namn och e-post.' });
    }

    const docsignApiKey = process.env.DOCSIGN_API_KEY;
    if (!docsignApiKey) {
      return res.status(500).json({ error: 'DOCSIGN_API_KEY saknas.' });
    }

    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
    const baseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
    const tableName = process.env.AIRTABLE_TABLE_NAME || 'Kunder';

    // Hämta kunddata och KYC
    const custRes = await axios.get(
      `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}/${customerId}`,
      { headers: { Authorization: `Bearer ${airtableAccessToken}` } }
    );
    const custFields = custRes.data.fields || {};
    const kundnamn = custFields['Namn'] || 'Kund';

    // Generera PDF internt
    const kycInternalHeaders = {};
    if (req.headers.authorization) kycInternalHeaders['Authorization'] = req.headers.authorization;
    if (req.cookies?.authToken) kycInternalHeaders['Cookie'] = `authToken=${req.cookies.authToken}`;
    const pdfRes = await axios.post(
      `http://localhost:${process.env.PORT || 3001}/api/kyc-formular/${customerId}/pdf`,
      {},
      { responseType: 'arraybuffer', headers: kycInternalHeaders, timeout: 60000 }
    );
    const pdfBuffer = Buffer.from(pdfRes.data);

    // Inleed: bara kunden signerar (KYC är kundens intygande, inte byråns)
    const kundPartyIds = [];
    for (const s of signerareList) {
      const p = {
        api_key: docsignApiKey,
        name: s.namn,
        email: s.epost,
        company: kundnamn,
        sign_method: 'bankid',
        external_id: `kyc-kund-${(s.personnr || 'x')}-${Date.now()}`,
        debug: false
      };
      if (s.telefon) p.phone_number = s.telefon;
      const r = await axios.post('https://docsign.se/api/parties', p, { headers: { 'Content-Type': 'application/json' } });
      if (!r.data?.success) {
        return res.status(500).json({ error: `Kunde inte skapa ${s.namn} som undertecknare.` });
      }
      kundPartyIds.push(r.data.party_id);
    }

    const pdfBase64 = pdfBuffer.toString('base64');
    const docPayload = {
      api_key: docsignApiKey,
      name: `KYC-formulär - ${kundnamn}`,
      parties: kundPartyIds,
      send_reminders: true,
      send_receipt: true,
      attachments: [{ name: 'kyc-formular.pdf', base64_content: pdfBase64 }]
    };
    const docRes = await axios.post('https://docsign.se/api/documents', docPayload, { headers: { 'Content-Type': 'application/json' } });
    if (!docRes.data?.success) {
      return res.status(500).json({ error: 'Kunde inte skapa dokument i Inleed.' });
    }

    const documentId = docRes.data.document_id;
    const utskickningsdatum = new Date().toISOString().split('T')[0];

    // Uppdatera KYC-formulär med Inleed-status
    const rawKyc = custFields['KYC-formular (JSON)'] || '{}';
    let kycData = {};
    try { kycData = JSON.parse(rawKyc); } catch (_) {}
    kycData.status = 'Skickat till kund';
    kycData.inleedDokumentId = String(documentId);
    kycData.utskickningsdatum = utskickningsdatum;

    await axios.patch(
      `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}/${customerId}`,
      { fields: { 'KYC-formular (JSON)': JSON.stringify(kycData) } },
      { headers: { Authorization: `Bearer ${airtableAccessToken}`, 'Content-Type': 'application/json' } }
    );

    res.json({
      success: true,
      document_id: documentId,
      message: `KYC-formuläret har skickats till ${signerareList.length} signerare för BankID-signering.`
    });

  } catch (error) {
    console.error('❌ Fel vid KYC skicka-för-signering:', error.message);
    res.status(500).json({ error: 'Kunde inte skicka KYC-formuläret för signering.' });
  }
});

// POST /api/kyc-formular/:customerId/hamta-signerat – Hämta signerat KYC-dokument från Inleed
app.post('/api/kyc-formular/:customerId/hamta-signerat', authenticateToken, async (req, res) => {
  try {
    const { customerId } = req.params;
    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
    const baseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
    const tableName = process.env.AIRTABLE_TABLE_NAME || 'Kunder';
    const docsignApiKey = process.env.DOCSIGN_API_KEY;
    if (!docsignApiKey || !airtableAccessToken) {
      return res.status(500).json({ error: 'DOCSIGN_API_KEY eller Airtable-token saknas.' });
    }

    const custRes = await axios.get(
      `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}/${customerId}`,
      { headers: { Authorization: `Bearer ${airtableAccessToken}` } }
    );
    const custFields = custRes.data.fields || {};
    const kundnamn = custFields['Namn'] || 'Kund';

    const rawKyc = custFields['KYC-formular (JSON)'] || '{}';
    let kycData = {};
    try { kycData = JSON.parse(rawKyc); } catch (_) {}
    const inleedId = kycData.inleedDokumentId;
    if (!inleedId) {
      return res.status(400).json({ error: 'Inget InleedDokumentId hittat.' });
    }

    const doc = await fetchInleedDocumentById(docsignApiKey, inleedId);
    const pdfUrl = getInleedSignedPdfUrl(doc);
    if (!doc) {
      return res.status(404).json({ error: 'Dokumentet hittades inte i Inleed.' });
    }
    if (!pdfUrl || !isInleedDocumentSigned(doc)) {
      const st = doc.status || doc.state || 'okänd';
      return res.status(400).json({
        error: 'Dokumentet är ännu inte färdigsignerat.',
        hint: `Status i Inleed: ${st}. Kontrollera att alla parter har signerat.`,
      });
    }

    const pdfDownload = await axios.get(pdfUrl, { responseType: 'arraybuffer', timeout: 60000 });
    const signedPdfBuffer = Buffer.from(pdfDownload.data);

    const datum = new Date().toISOString().split('T')[0];
    const safeNamn = (kundnamn).replace(/[^a-zA-Z0-9åäöÅÄÖ _-]/g, '');
    const docFilename = `${safeNamn}-KYC-signerat-${datum}.pdf`;

    const protocol = req.get('x-forwarded-proto') || req.protocol || 'https';
    const host = req.get('x-forwarded-host') || req.get('host');
    const publicBaseUrl = process.env.PUBLIC_BASE_URL || (host ? `${protocol}://${host}` : null);

    const savedToDocs = await savePdfToKundDokumentationTab(
      airtableAccessToken,
      baseId,
      customerId,
      signedPdfBuffer,
      docFilename,
      'kyc',
      { baseUrl: publicBaseUrl, customCategory: 'KYC-formulär (signerat)' }
    );
    if (!savedToDocs) {
      console.warn('⚠️ KYC signerat: kunde inte spara till Dokumentation');
    }

    // Uppdatera KYC-status till Signerat
    kycData.status = 'Signerat';
    kycData.signeringsdatum = datum;
    await axios.patch(
      `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}/${customerId}`,
      { fields: { 'KYC-formular (JSON)': JSON.stringify(kycData) } },
      { headers: { Authorization: `Bearer ${airtableAccessToken}`, 'Content-Type': 'application/json' } }
    );

    res.json({
      success: true,
      savedToDocs,
      message: savedToDocs
        ? 'Signerat KYC-dokument hämtat och sparat på Dokumentation.'
        : 'Signerat KYC-dokument hämtat men kunde inte sparas på Dokumentation – kontakta support.'
    });

  } catch (error) {
    console.error('❌ Fel vid hämtning av signerat KYC:', error.message);
    res.status(500).json({ error: 'Kunde inte hämta signerat KYC-dokument.' });
  }
});

// ─── UPPDRAGSAVTAL ───────────────────────────────────────────────────────────
const UPPDRAGSAVTAL_TABLE = 'tblpKIMpde6sFFqDH'; // Uppdragsavtal tabell-ID
const airtableBaseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50'; // Global för alla uppdragsavtal-endpoints

// GET /api/uppdragsavtal/status-map – Kund-ID → avtalsstatus (för kundlista m.m.)
app.get('/api/uppdragsavtal/status-map', authenticateToken, async (req, res) => {
  try {
    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
    if (!airtableAccessToken) {
      return res.status(500).json({ error: 'Airtable API-nyckel saknas', map: {} });
    }
    const map = {};
    let offset = null;
    do {
      const params = { pageSize: 100 };
      if (offset) params.offset = offset;
      const response = await axios.get(
        `https://api.airtable.com/v0/${airtableBaseId}/${UPPDRAGSAVTAL_TABLE}`,
        { headers: { Authorization: `Bearer ${airtableAccessToken}` }, params, timeout: 15000 }
      );
      for (const a of response.data.records || []) {
        const kid = a.fields?.KundID;
        const ids = kid ? (Array.isArray(kid) ? kid : [kid]) : [];
        const status = (a.fields?.['Avtalsstatus'] || a.fields?.Status || '').toString().trim();
        for (const id of ids) {
          if (!map[id] || status === 'Signerat') map[id] = status;
        }
      }
      offset = response.data.offset || null;
    } while (offset);
    res.json({ map });
  } catch (error) {
    console.error('❌ Fel vid hämtning av uppdragsavtal status-map:', error.message);
    res.status(500).json({ error: error.message, map: {} });
  }
});

// GET /api/uppdragsavtal?customerId=recXXX
app.get('/api/uppdragsavtal', authenticateToken, async (req, res) => {
  try {
    const { customerId } = req.query;
    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
    const params = { maxRecords: 1 };
    if (customerId) params.filterByFormula = `{KundID} = '${customerId}'`;

    const response = await axios.get(
      `https://api.airtable.com/v0/${airtableBaseId}/${UPPDRAGSAVTAL_TABLE}`,
      { headers: { Authorization: `Bearer ${airtableAccessToken}` }, params }
    );
    const records = response.data.records || [];
    let avtal = records[0] || null;

    // Backfill Utskickningsdatum för äldre avtal som saknar det – hämta från Inleed
    if (avtal) {
      const fields = avtal.fields || {};
      const status = fields['Avtalsstatus'] || fields['Status'] || '';
      const inleedId = fields['InleedDokumentId'];
      const utskickningsdatum = fields['Utskickningsdatum'] || fields['fldCfjnBetFm03KES'];
      if (inleedId && status === 'Skickat till kund' && !utskickningsdatum && process.env.DOCSIGN_API_KEY) {
        try {
          for (const state of ['pending', 'completed']) {
            const docsRes = await axios.get('https://docsign.se/api/documents', {
              params: { api_key: process.env.DOCSIGN_API_KEY, state },
              headers: { 'Content-Type': 'application/json' }
            });
            const docs = Array.isArray(docsRes.data) ? docsRes.data : [];
            const doc = docs.find(d => String(d.id) === String(inleedId));
            if (doc) {
              if (doc.created_at) {
                const datum = (doc.created_at + '').split(' ')[0].split('T')[0] || (doc.created_at + '').slice(0, 10);
                if (datum && /^\d{4}-\d{2}-\d{2}$/.test(datum)) {
                  await axios.patch(
                    `https://api.airtable.com/v0/${airtableBaseId}/${UPPDRAGSAVTAL_TABLE}/${avtal.id}`,
                    { fields: { Utskickningsdatum: datum } },
                    { headers: { Authorization: `Bearer ${airtableAccessToken}`, 'Content-Type': 'application/json' } }
                  );
                  avtal = { ...avtal, fields: { ...fields, Utskickningsdatum: datum } };
                }
              }
              break;
            }
          }
        } catch (e) { /* ignorerar – avtal returneras utan datum */ }
      }
    }

    res.json({ avtal });
  } catch (error) {
    console.error('❌ Error fetching uppdragsavtal:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Normalisera fältnamn för uppdragsavtal: svenska → ASCII (robusthet mot cache)
function normalizeAvtalFields(rawFields) {
  const MAP = {
    'Ups\u00e4gningstid':                                    'Uppsagningstid',
    'Valda tj\u00e4nster':                                   'Valda tjanster',
    'Ers\u00e4ttningsmodell':                                'Ersattningsmodell',
    '\u00d6vrigt uppdrag':                                   'Ovrigt uppdrag',
    'Kunden godk\u00e4nner allm\u00e4nna villkor':           'Kunden godkanner allm villkor',
    'Kunden godk\u00e4nner personuppgiftsbitr\u00e4desavtal':'Kunden godkanner puba',
    'Avtalet g\u00e4ller ifr\u00e5n':                       'Avtalet galler fran',
    'Signerat av byr\u00e5':                                 'Signerat av byra',
    'Byr\u00e5 ID':                                          'Byra ID',
    'Status':                                                'Avtalsstatus',
  };
  return Object.fromEntries(
    Object.entries(rawFields).map(([k, v]) => [MAP[k] || k, v])
  );
}

// POST /api/uppdragsavtal – Skapa nytt avtal
app.post('/api/uppdragsavtal', authenticateToken, async (req, res) => {
  try {
    const { fields: rawFields } = req.body;
    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;

    // Rensa tomma värden — behåll arrays även om tomma (linked fields)
    const fields = Object.fromEntries(
      Object.entries(normalizeAvtalFields(rawFields)).filter(([, v]) => {
        if (Array.isArray(v)) return true;
        return v !== null && v !== undefined && v !== '';
      })
    );

    console.log('📤 POST /api/uppdragsavtal – skickar fält:', JSON.stringify(fields, null, 2));

    const response = await axios.post(
      `https://api.airtable.com/v0/${airtableBaseId}/${UPPDRAGSAVTAL_TABLE}`,
      { fields },
      { headers: { Authorization: `Bearer ${airtableAccessToken}`, 'Content-Type': 'application/json' } }
    );
    res.json({ avtal: response.data });
  } catch (error) {
    console.error('❌ Error creating uppdragsavtal:', error.message);
    if (error.response) {
      console.error('❌ Airtable svar:', JSON.stringify(error.response.data, null, 2));
      return res.status(error.response.status || 500).json({ error: error.response.data?.error?.message || error.message, airtableError: error.response.data });
    }
    res.status(500).json({ error: error.message });
  }
});

// PATCH /api/uppdragsavtal/:id – Uppdatera befintligt avtal
app.patch('/api/uppdragsavtal/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { fields: rawFields } = req.body;
    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;

    // Filtrera bort tomma värden — behåll arrays
    const fields = Object.fromEntries(
      Object.entries(normalizeAvtalFields(rawFields)).filter(([, v]) => {
        if (Array.isArray(v)) return true;
        return v !== null && v !== undefined && v !== '';
      })
    );

    console.log('📤 PATCH /api/uppdragsavtal/:id – skickar fält:', JSON.stringify(fields, null, 2));

    const response = await axios.patch(
      `https://api.airtable.com/v0/${airtableBaseId}/${UPPDRAGSAVTAL_TABLE}/${id}`,
      { fields },
      { headers: { Authorization: `Bearer ${airtableAccessToken}`, 'Content-Type': 'application/json' } }
    );
    res.json({ avtal: response.data });
  } catch (error) {
    console.error('❌ Error updating uppdragsavtal:', error.message);
    if (error.response) {
      console.error('❌ Airtable svar:', JSON.stringify(error.response.data, null, 2));
      return res.status(error.response.status || 500).json({ error: error.response.data?.error?.message || error.message, airtableError: error.response.data });
    }
    res.status(500).json({ error: error.message });
  }
});

// ─── UPPDRAG (Lön/Moms/Bokslut/Deklaration) ──────────────────────────────────
const UPPDRAG_TABLE_NAME = 'Uppdrag';

// ─── UPPDRAGSKÖRNINGAR (instanser per period) ───────────────────────────────
// En rad per (uppdragId + körningsperiod). Används för att kunna koppla underlag till specifika körningar.
const UPPDRAG_RUNS_TABLE_NAME = 'Uppdragskörningar';

// Fält som Uppdrag-tabellen behöver (namn + typ + options)
const UPPDRAG_REQUIRED_FIELDS = [
  { name: 'Kund ID', type: 'singleLineText', description: 'Record-id för kunden i KUNDDATA (rec...)' },
  { name: 'Byrå ID', type: 'singleLineText', description: 'Byrå-id för dataseparering' },
  { name: 'Typ', type: 'singleSelect', options: { choices: [{ name: 'Löneuppdrag' }, { name: 'Momsredovisning' }, { name: 'Bokslut' }, { name: 'Deklaration' }] } },
  { name: 'Namn', type: 'singleLineText', description: 'Valfritt namn på uppdraget' },
  { name: 'Frekvens', type: 'singleSelect', options: { choices: [{ name: 'Varje månad' }, { name: 'Varje kvartal' }, { name: 'Årsvis' }, { name: 'Årsvis med deklaration' }, { name: 'Engång' }] } },
  { name: 'Startdatum', type: 'date', description: 'Tidigast datum uppdraget ska börja synas i att-göra', options: { dateFormat: { name: 'iso' } } },
  { name: 'Första period', type: 'singleLineText', description: 'Första momsperiod (YYYY-MM eller YYYY-Qn) – sätts vid upplägg av moms' },
  { name: 'Nästa deadline', type: 'date', options: { dateFormat: { name: 'iso' } } },
  { name: 'Ansvarig', type: 'singleLineText', description: 'Handläggare (namn eller user-id)' },
  { name: 'Rutin', type: 'multilineText', description: 'Instruktion/rutin för uppdraget' },
  { name: 'Anteckning', type: 'multilineText', description: 'Anteckning om uppdraget (generellt)' },
  { name: 'Dokumentation', type: 'multipleAttachments', description: 'Bilagor för dokumentation (t.ex. per körning/deadline)' },
  // Checkbox kräver options i Meta API
  { name: 'Riskåtgärder aktiverade', type: 'checkbox', options: { icon: 'check', color: 'greenBright' } },
  { name: 'Riskåtgärder valda', type: 'multilineText', description: 'Valda åtgärder (text/JSON)' },
  { name: 'PTL Underlag', type: 'multilineText', description: 'JSON-lista med uppladdade underlag kopplade till åtgärder (för dokumentation)' },
  { name: 'Senast utförd', type: 'date', options: { dateFormat: { name: 'iso' } } },
  { name: 'Status', type: 'singleSelect', options: { choices: [{ name: 'Aktiv' }, { name: 'Pausad' }, { name: 'Avslutad' }] } },
  { name: 'Historik', type: 'multilineText', description: 'JSON-array med körningar (datum/anteckning)' },
  // Underlagsförfrågningar (Samarbete) – schemalagda utskick
  { name: 'Auto underlagsförfrågan', type: 'checkbox', options: { icon: 'check', color: 'blueBright' } },
  { name: 'Underlagsmeddelande', type: 'multilineText', description: 'Valfritt meddelande som visas i mejlet vid auto-utskick' },
  { name: 'Underlagsmall', type: 'multilineText', description: 'Underlagsfrågor (en punkt per rad). Stöd: {PERIOD} ersätts med t.ex. mars 2026.' },
  { name: 'Underlagsmottagare namn', type: 'singleLineText', description: 'Mottagare (kund)' },
  { name: 'Underlagsmottagare e-post', type: 'email', description: 'Mottagarens e-post' },
  { name: 'Underlagsutskick dag', type: 'number', description: 'Dag i månaden då förfrågan ska skickas (1–28)' },
  { name: 'Underlagsdeadline dag', type: 'number', description: 'Dag i månaden för deadline (1–28)' },
  { name: 'Underlagsperiod', type: 'singleSelect', options: { choices: [{ name: 'Föregående månad' }, { name: 'Denna månad' }, { name: 'Nästa månad' }] } },
  { name: 'Senast underlagsutskick period', type: 'singleLineText', description: 'Lås per period, t.ex. 2026-03' },
  { name: 'Underlagsavsändare e-post', type: 'email', description: 'Valfri Reply-To för utskick (t.ex. handläggare)' },
  { name: 'Deklaration rader', type: 'multilineText', description: 'JSON-array med deklarationstyper + fritext (kan förekomma flera gånger)' },
  { name: 'Deklarationstyp', type: 'singleSelect', options: { choices: [{ name: 'Inkomstdeklaration' }, { name: 'K10' }, { name: 'NE' }] } },
  { name: 'Ägare', type: 'multilineText', description: 'Ägare (en per rad) för K10/ägar-deklaration' },
  { name: 'Uppdaterad', type: 'dateTime', options: { dateFormat: { name: 'iso' }, timeFormat: { name: '24hour' }, timeZone: 'Europe/Stockholm' } }
];

// Fält som Uppdragskörningar-tabellen behöver
const UPPDRAG_RUNS_REQUIRED_FIELDS = [
  { name: 'Run Key', type: 'singleLineText', description: 'Unik nyckel: <uppdragId>:<periodKey>' },
  { name: 'Uppdrag ID', type: 'singleLineText', description: 'Record-id för uppdraget i Uppdrag-tabellen (rec...)' },
  { name: 'Kund ID', type: 'singleLineText', description: 'Record-id för kunden i KUNDDATA (rec...)' },
  { name: 'Byrå ID', type: 'singleLineText', description: 'Byrå-id för dataseparering' },
  { name: 'Typ', type: 'singleSelect', options: { choices: [{ name: 'Löneuppdrag' }, { name: 'Momsredovisning' }, { name: 'Bokslut' }, { name: 'Deklaration' }] } },
  { name: 'Frekvens', type: 'singleLineText', description: 'Kopia för enklare filtrering/diagnostik' },
  { name: 'PeriodKey', type: 'singleLineText', description: 'Periodnyckel, t.ex. 2026-04 eller 2026-Q2 eller 2026' },
  { name: 'Period Label', type: 'singleLineText', description: 'Visningsnamn för perioden (sv)' },
  { name: 'Anteckning', type: 'multilineText', description: 'Anteckning specifikt för denna uppdragskörning' },
  { name: 'Dokumentation', type: 'multipleAttachments', description: 'Bilagor kopplade till denna uppdragskörning' },
  { name: 'Utskick datum', type: 'date', options: { dateFormat: { name: 'iso' } } },
  { name: 'Deadline', type: 'date', options: { dateFormat: { name: 'iso' } } },
  { name: 'Status', type: 'singleSelect', options: { choices: [{ name: 'Planerad' }, { name: 'Pågående' }, { name: 'Klar' }, { name: 'Sen' }] } },
  { name: 'Skapad', type: 'dateTime', options: { dateFormat: { name: 'iso' }, timeFormat: { name: '24hour' }, timeZone: 'Europe/Stockholm' } },
  { name: 'Uppdaterad', type: 'dateTime', options: { dateFormat: { name: 'iso' }, timeFormat: { name: '24hour' }, timeZone: 'Europe/Stockholm' } }
];

async function getUppdragTableMeta(airtableToken, baseId) {
  const forcedId = process.env.AIRTABLE_TABLE_UPPDRAG_ID;
  try {
    const res = await axios.get(`https://api.airtable.com/v0/meta/bases/${baseId}/tables`, {
      headers: { Authorization: `Bearer ${airtableToken}` },
      timeout: 10000
    });
    const tables = res.data?.tables || [];
    const t = forcedId
      ? tables.find(x => (x.id || '').trim() === forcedId.trim())
      : tables.find(x => (x.name || '').trim().toLowerCase() === UPPDRAG_TABLE_NAME.toLowerCase());
    return t || null;
  } catch (e) {
    return null;
  }
}

async function getUppdragRunsTableMeta(airtableToken, baseId) {
  const forcedId = (process.env.AIRTABLE_TABLE_UPPDRAG_RUNS_ID || '').trim();
  try {
    const res = await axios.get(`https://api.airtable.com/v0/meta/bases/${baseId}/tables`, {
      headers: { Authorization: `Bearer ${airtableToken}` },
      timeout: 10000
    });
    const tables = res.data?.tables || [];
    const byName = tables.find(x => (x.name || '').trim().toLowerCase() === UPPDRAG_RUNS_TABLE_NAME.toLowerCase());
    if (byName) return byName;
    if (forcedId) {
      const byId = tables.find(x => (x.id || '').trim() === forcedId);
      if (byId) return byId;
      console.warn(`getUppdragRunsTableMeta: AIRTABLE_TABLE_UPPDRAG_RUNS_ID=${forcedId} hittades inte i basen – tabell "${UPPDRAG_RUNS_TABLE_NAME}" saknas troligen.`);
    }
    return null;
  } catch (e) {
    return null;
  }
}

async function resolveUppdragRunsTableId(airtableToken, baseId) {
  const meta = await getUppdragRunsTableMeta(airtableToken, baseId);
  return meta?.id || null;
}

async function listUppdragRunsForCustomer({ airtableToken, baseId, customerId }) {
  const tableId = await resolveUppdragRunsTableId(airtableToken, baseId);
  if (!tableId) {
    return { records: [], tableMissing: true };
  }
  const url = `https://api.airtable.com/v0/${baseId}/${tableId}`;
  const esc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const cust = esc(customerId);
  const formulas = [
    `{Kund ID} = "${cust}"`,
    `FIND("${cust}", ARRAYJOIN({Kund ID}))`
  ];
  const fetchPages = async (baseParams) => {
    let out = [];
    let offset = null;
    do {
      const params = { ...baseParams, pageSize: 100 };
      if (offset) params.offset = offset;
      const r = await axios.get(url, { headers: { Authorization: `Bearer ${airtableToken}` }, params });
      out = out.concat(r.data.records || []);
      offset = r.data.offset || null;
    } while (offset);
    return out;
  };
  let records = [];
  for (const formula of formulas) {
    try {
      records = await fetchPages({ filterByFormula: formula, sort: [{ field: 'Deadline', direction: 'asc' }] });
      if (records.length) break;
    } catch (e) {
      const msg = e.response?.data?.error?.message || e.message || '';
      if (/Invalid permissions|not found/i.test(msg) && !records.length) {
        return { records: [], tableMissing: true, error: msg };
      }
      if (/Unknown field|sort/i.test(String(msg))) {
        try {
          records = await fetchPages({ filterByFormula: formula });
          if (records.length) break;
        } catch (e2) {
          const msg2 = e2.response?.data?.error?.message || e2.message || '';
          if (/Invalid permissions|not found/i.test(msg2)) {
            return { records: [], tableMissing: true, error: msg2 };
          }
        }
      } else {
        throw e;
      }
    }
  }
  if (!records.length) {
    try {
      let offset = null;
      do {
        const params = { pageSize: 100 };
        if (offset) params.offset = offset;
        const r = await axios.get(url, { headers: { Authorization: `Bearer ${airtableToken}` }, params });
        const all = r.data.records || [];
        records = all.filter(rec => {
          const f = rec.fields || {};
          const k = f['Kund ID'];
          if (k === customerId) return true;
          if (Array.isArray(k) && k.includes(customerId)) return true;
          return false;
        });
        offset = r.data.offset || null;
        if (records.length) break;
      } while (offset);
    } catch (e) {
      const msg = e.response?.data?.error?.message || e.message || '';
      if (/Invalid permissions|not found/i.test(String(msg))) {
        return { records: [], tableMissing: true, error: msg };
      }
      throw e;
    }
  }
  records.sort((a, b) => {
    const da = String(a?.fields?.['Deadline'] || '');
    const db = String(b?.fields?.['Deadline'] || '');
    return da.localeCompare(db);
  });
  return { records, tableId };
}

async function ensureUppdragRunsStatusChoices(airtableToken, baseId, tableMeta) {
  try {
    const t = tableMeta || await getUppdragRunsTableMeta(airtableToken, baseId);
    if (!t || !t.id) return { ok: false, reason: 'Tabell saknas' };
    const statusField = (t.fields || []).find(f => (f.name || '').trim() === 'Status');
    if (!statusField || !statusField.id) return { ok: false, reason: 'Fältet "Status" saknas' };

    const desired = ['Planerad', 'Pågående', 'Klar', 'Sen'];
    const current = (statusField.options?.choices || []).map(c => (c?.name || '').trim()).filter(Boolean);
    const missing = desired.filter(x => !current.includes(x));
    if (!missing.length) return { ok: true, updated: false };

    const patchUrl = `https://api.airtable.com/v0/meta/bases/${baseId}/tables/${t.id}/fields/${statusField.id}`;
    const choices = Array.from(new Set(current.concat(desired))).map(name => ({ name }));
    await axios.patch(patchUrl, {
      name: 'Status',
      type: 'singleSelect',
      options: { choices }
    }, {
      headers: { Authorization: `Bearer ${airtableToken}`, 'Content-Type': 'application/json' },
      timeout: 10000
    });
    return { ok: true, updated: true, added: missing };
  } catch (e) {
    const msg = e.response?.data?.error?.message || e.message;
    return { ok: false, reason: msg || 'Kunde inte uppdatera status-val' };
  }
}

// POST /api/setup/airtable-uppdrag – Skapa tabellen "Uppdrag" i Airtable (auth)
// Kräver Personal Access Token med schema.bases:read och schema.bases:write.
app.post('/api/setup/airtable-uppdrag', authenticateToken, async (req, res) => {
  const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
  if (!airtableAccessToken) return res.status(500).json({ success: false, error: 'AIRTABLE_ACCESS_TOKEN saknas' });
  try {
    const existing = await getUppdragTableMeta(airtableAccessToken, baseId);
    if (existing) {
      return res.json({ success: true, message: `Tabellen "${UPPDRAG_TABLE_NAME}" finns redan.`, tableId: existing.id, alreadyExists: true });
    }
    const createRes = await axios.post(
      `https://api.airtable.com/v0/meta/bases/${baseId}/tables`,
      {
        name: UPPDRAG_TABLE_NAME,
        description: 'Återkommande uppdrag per kund (lön/moms/bokslut/deklaration) med deadline och historik',
        fields: UPPDRAG_REQUIRED_FIELDS
      },
      { headers: { Authorization: `Bearer ${airtableAccessToken}`, 'Content-Type': 'application/json' }, timeout: 15000 }
    );
    const newTable = createRes.data;
    const tableId = newTable?.id || (newTable?.tables && newTable.tables[0] && newTable.tables[0].id);
    return res.json({ success: true, message: `Tabellen "${UPPDRAG_TABLE_NAME}" skapades i Airtable.`, tableId: tableId || '', alreadyExists: false });
  } catch (err) {
    const status = err.response?.status;
    const data = err.response?.data || {};
    const msg = (data.error && data.error.message) || data.message || err.message;
    console.error('Setup Uppdrag:', status, msg, data);
    if (status === 403 || status === 401) {
      return res.status(status).json({
        success: false,
        error: 'Token saknar behörighet. Använd en Airtable Personal Access Token med scope schema.bases:read och schema.bases:write.',
        details: msg
      });
    }
    return res.status(status || 500).json({ success: false, error: msg || 'Kunde inte skapa tabellen' });
  }
});

// POST /api/setup/airtable-uppdrag-runs – Skapa tabellen "Uppdragskörningar" i Airtable (auth)
// Kräver Personal Access Token med schema.bases:read och schema.bases:write.
app.post('/api/setup/airtable-uppdrag-runs', authenticateToken, async (req, res) => {
  const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
  if (!airtableAccessToken) return res.status(500).json({ success: false, error: 'AIRTABLE_ACCESS_TOKEN saknas' });
  try {
    const existing = await getUppdragRunsTableMeta(airtableAccessToken, baseId);
    if (existing) {
      return res.json({ success: true, message: `Tabellen "${UPPDRAG_RUNS_TABLE_NAME}" finns redan.`, tableId: existing.id, alreadyExists: true });
    }
    const createRes = await axios.post(
      `https://api.airtable.com/v0/meta/bases/${baseId}/tables`,
      {
        name: UPPDRAG_RUNS_TABLE_NAME,
        description: 'En rad per uppdragskörning (period) för att kunna koppla underlag och status per körning',
        fields: UPPDRAG_RUNS_REQUIRED_FIELDS
      },
      { headers: { Authorization: `Bearer ${airtableAccessToken}`, 'Content-Type': 'application/json' }, timeout: 15000 }
    );
    const newTable = createRes.data;
    const tableId = newTable?.id || (newTable?.tables && newTable.tables[0] && newTable.tables[0].id);
    // Best-effort: säkerställ att statusfältets val finns (ifall Airtable normaliserat options)
    try { await ensureUppdragRunsStatusChoices(airtableAccessToken, baseId); } catch (_) {}
    return res.json({ success: true, message: `Tabellen "${UPPDRAG_RUNS_TABLE_NAME}" skapades i Airtable.`, tableId: tableId || '', alreadyExists: false });
  } catch (err) {
    const status = err.response?.status;
    const data = err.response?.data || {};
    const msg = (data.error && data.error.message) || data.message || err.message;
    console.error('Setup Uppdragskörningar:', status, msg, data);
    if (status === 403 || status === 401) {
      return res.status(status).json({
        success: false,
        error: 'Token saknar behörighet. Använd en Airtable Personal Access Token med scope schema.bases:read och schema.bases:write.',
        details: msg
      });
    }
    return res.status(status || 500).json({ success: false, error: msg || 'Kunde inte skapa tabellen' });
  }
});

// POST /api/setup/airtable-uppdrag-runs-fields – Lägg till saknade fält i befintlig tabell "Uppdragskörningar" (auth)
app.post('/api/setup/airtable-uppdrag-runs-fields', authenticateToken, async (req, res) => {
  const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
  if (!airtableAccessToken) return res.status(500).json({ success: false, error: 'AIRTABLE_ACCESS_TOKEN saknas' });
  try {
    const t = await getUppdragRunsTableMeta(airtableAccessToken, baseId);
    if (!t) return res.status(404).json({ success: false, error: `Tabellen "${UPPDRAG_RUNS_TABLE_NAME}" hittades inte i basen. Skapa den först.` });
    const existingNames = (t.fields || []).map(f => (f.name || '').trim());
    const toCreate = UPPDRAG_RUNS_REQUIRED_FIELDS.filter(f => !existingNames.includes((f.name || '').trim()));
    const created = [];
    const createUrl = `https://api.airtable.com/v0/meta/bases/${baseId}/tables/${t.id}/fields`;
    for (const field of toCreate) {
      try {
        const body = { name: field.name, type: field.type };
        if (field.description) body.description = field.description;
        if (field.options) body.options = field.options;
        await axios.post(createUrl, body, {
          headers: { Authorization: `Bearer ${airtableAccessToken}`, 'Content-Type': 'application/json' },
          timeout: 10000
        });
        created.push(field.name);
      } catch (e) {
        const msg = e.response?.data?.error?.message || e.message;
        console.warn('Kunde inte skapa uppdragskörning-fält', field.name, msg);
      }
    }
    const skipped = UPPDRAG_RUNS_REQUIRED_FIELDS.length - toCreate.length;
    // Best-effort: säkerställ att Status har rätt val
    const statusEnsure = await ensureUppdragRunsStatusChoices(airtableAccessToken, baseId, t);
    return res.json({
      success: true,
      message: created.length
        ? `${created.length} fält lades till i ${UPPDRAG_RUNS_TABLE_NAME}. ${skipped} fanns redan.`
        : `Alla ${UPPDRAG_RUNS_REQUIRED_FIELDS.length} fält finns redan i tabellen ${UPPDRAG_RUNS_TABLE_NAME}.`,
      created,
      alreadyExisted: skipped,
      statusChoices: statusEnsure
    });
  } catch (err) {
    const status = err.response?.status;
    const data = err.response?.data || {};
    const msg = (data.error && data.error.message) || data.message || err.message;
    console.error('Setup Uppdragskörningar fält:', status, msg);
    if (status === 403 || status === 401) {
      return res.status(status).json({
        success: false,
        error: 'Token saknar behörighet. Använd en Airtable Personal Access Token med scope schema.bases:read och schema.bases:write.',
        details: msg
      });
    }
    return res.status(status || 500).json({ success: false, error: msg || 'Kunde inte uppdatera tabellen' });
  }
});

// POST /api/setup/airtable-uppdrag-runs-status-choices – säkerställ att Status-val finns i "Uppdragskörningar" (auth)
app.post('/api/setup/airtable-uppdrag-runs-status-choices', authenticateToken, async (req, res) => {
  const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
  if (!airtableAccessToken) return res.status(500).json({ success: false, error: 'AIRTABLE_ACCESS_TOKEN saknas' });
  try {
    const t = await getUppdragRunsTableMeta(airtableAccessToken, baseId);
    if (!t) return res.status(404).json({ success: false, error: `Tabellen "${UPPDRAG_RUNS_TABLE_NAME}" hittades inte i basen. Skapa den först.` });
    const r = await ensureUppdragRunsStatusChoices(airtableAccessToken, baseId, t);
    if (!r.ok) return res.status(500).json({ success: false, error: r.reason || 'Kunde inte uppdatera status-val' });
    return res.json({ success: true, result: r });
  } catch (e) {
    const msg = e.response?.data?.error?.message || e.message;
    return res.status(e.response?.status || 500).json({ success: false, error: msg });
  }
});

// POST /api/setup/airtable-uppdrag-fields – Lägg till saknade fält i befintlig tabell "Uppdrag" (auth)
app.post('/api/setup/airtable-uppdrag-fields', authenticateToken, async (req, res) => {
  const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
  if (!airtableAccessToken) return res.status(500).json({ success: false, error: 'AIRTABLE_ACCESS_TOKEN saknas' });
  try {
    const t = await getUppdragTableMeta(airtableAccessToken, baseId);
    if (!t) return res.status(404).json({ success: false, error: `Tabellen "${UPPDRAG_TABLE_NAME}" hittades inte i basen. Skapa den först.` });
    const existingNames = (t.fields || []).map(f => (f.name || '').trim());
    const toCreate = UPPDRAG_REQUIRED_FIELDS.filter(f => !existingNames.includes((f.name || '').trim()));
    const created = [];
    const createUrl = `https://api.airtable.com/v0/meta/bases/${baseId}/tables/${t.id}/fields`;
    for (const field of toCreate) {
      try {
        const body = { name: field.name, type: field.type };
        if (field.description) body.description = field.description;
        if (field.options) body.options = field.options;
        await axios.post(createUrl, body, {
          headers: { Authorization: `Bearer ${airtableAccessToken}`, 'Content-Type': 'application/json' },
          timeout: 10000
        });
        created.push(field.name);
      } catch (e) {
        const msg = e.response?.data?.error?.message || e.message;
        console.warn('Kunde inte skapa uppdrag-fält', field.name, msg);
      }
    }
    const skipped = UPPDRAG_REQUIRED_FIELDS.length - toCreate.length;
    return res.json({
      success: true,
      message: created.length
        ? `${created.length} fält lades till i ${UPPDRAG_TABLE_NAME}. ${skipped} fanns redan.`
        : `Alla ${UPPDRAG_REQUIRED_FIELDS.length} fält finns redan i tabellen ${UPPDRAG_TABLE_NAME}.`,
      created,
      alreadyExisted: skipped
    });
  } catch (err) {
    const status = err.response?.status;
    const data = err.response?.data || {};
    const msg = (data.error && data.error.message) || data.message || err.message;
    console.error('Setup Uppdrag fält:', status, msg);
    if (status === 403 || status === 401) {
      return res.status(status).json({
        success: false,
        error: 'Token saknar behörighet. Använd en Airtable Personal Access Token med scope schema.bases:read och schema.bases:write.',
        details: msg
      });
    }
    return res.status(status || 500).json({ success: false, error: msg || 'Kunde inte uppdatera tabellen' });
  }
});

function addMonthsIso(dateIso, months) {
  const d = new Date(dateIso + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return null;
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  // Justera om vi hamnar i nästa månad pga kortare månad
  if (d.getDate() !== day) d.setDate(0);
  return d.toISOString().slice(0, 10);
}

function addYearsIso(dateIso, years) {
  const d = new Date(dateIso + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return null;
  d.setFullYear(d.getFullYear() + years);
  return d.toISOString().slice(0, 10);
}

function calcNextDeadline(currentIso, freq) {
  if (!currentIso) return null;
  const f = (freq || '').toString().toLowerCase();
  if (f.includes('kvartal')) return addMonthsIso(currentIso, 3);
  if (f.includes('månad')) return addMonthsIso(currentIso, 1);
  if (f.includes('årsvis')) return addYearsIso(currentIso, 1);
  return null;
}

function buildUppdragFilterFormulas(customerId, typ) {
  const cust = String(customerId || '').replace(/'/g, "\\'");
  const t = typ != null ? String(typ).replace(/'/g, "\\'") : null;
  const kundFields = ['Kund ID', 'KundID', 'kund id', 'kundid'];
  const typFields = ['Typ', 'typ'];

  // customer-only formulas
  const custOnly = kundFields.map(kf => `{${kf}} = '${cust}'`);

  if (!t) return custOnly;

  const both = [];
  for (const kf of kundFields) {
    for (const tf of typFields) {
      both.push(`AND({${kf}}='${cust}', {${tf}}='${t}')`);
    }
  }
  return both.concat(custOnly.map(f => `AND(${f}, {Typ}='${t}')`));
}

async function airtableListWithFormulaFallback({ url, headers, baseParams, formulas }) {
  let lastErr = null;
  for (const formula of formulas) {
    try {
      const params = { ...(baseParams || {}), filterByFormula: formula };
      const r = await axios.get(url, { headers, params });
      return r;
    } catch (e) {
      lastErr = e;
      const msg = e.response?.data?.error?.message || e.message || '';
      // Only fall back on "Unknown field names" / formula problems
      if (!/Unknown field names|formula/i.test(String(msg))) throw e;
    }
  }
  throw lastErr;
}

// GET /api/uppdrag?customerId=recXXX – lista uppdrag för kund
app.get('/api/uppdrag', authenticateToken, async (req, res) => {
  try {
    const { customerId } = req.query;
    if (!customerId) return res.status(400).json({ error: 'customerId saknas' });
    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
    const tableIdOrName = process.env.AIRTABLE_TABLE_UPPDRAG_ID || encodeURIComponent(UPPDRAG_TABLE_NAME);
    const url = `https://api.airtable.com/v0/${airtableBaseId}/${tableIdOrName}`;
    const response = await airtableListWithFormulaFallback({
      url,
      headers: { Authorization: `Bearer ${airtableAccessToken}` },
      baseParams: { pageSize: 100 },
      formulas: buildUppdragFilterFormulas(customerId)
    });
    const records = response.data.records || [];
    res.json({ records });
  } catch (error) {
    console.error('❌ GET /api/uppdrag:', error.response?.data || error.message);
    const status = error.response?.status || 500;
    const msg = error.response?.data?.error?.message || error.message;
    if (/Unknown field names/i.test(String(msg))) {
      return res.status(500).json({
        error: 'Uppdrag-tabellen i Airtable saknar fält (t.ex. "Kund ID" och "Typ"). Skapa/uppdatera tabellen via /api/setup/airtable-uppdrag (kräver schema-token).',
        details: msg
      });
    }
    res.status(status).json({ error: msg });
  }
});

// GET /api/uppdrag/runs?customerId=recXXX – lista uppdragskörningar för kund
app.get('/api/uppdrag/runs', authenticateToken, async (req, res) => {
  try {
    const { customerId } = req.query;
    if (!customerId) return res.status(400).json({ error: 'customerId saknas' });
    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
    if (!airtableAccessToken) return res.status(500).json({ error: 'AIRTABLE_ACCESS_TOKEN saknas' });
    const result = await listUppdragRunsForCustomer({
      airtableToken: airtableAccessToken,
      baseId: airtableBaseId,
      customerId: String(customerId).trim()
    });
    if (result.tableMissing) {
      return res.json({
        records: [],
        tableMissing: true,
        hint: `Tabellen "${UPPDRAG_RUNS_TABLE_NAME}" saknas i Airtable (eller AIRTABLE_TABLE_UPPDRAG_RUNS_ID pekar fel). Installera via Uppdrag-fliken eller POST /api/setup/airtable-uppdrag-runs.`,
        details: result.error || null
      });
    }
    res.json({ records: result.records || [], tableId: result.tableId || null });
  } catch (error) {
    console.error('❌ GET /api/uppdrag/runs:', error.response?.data || error.message);
    const status = error.response?.status || 500;
    const msg = error.response?.data?.error?.message || error.message;
    res.status(status).json({ error: msg });
  }
});

// PATCH /api/uppdrag/runs/:runId/status – uppdatera status på en uppdragskörning
// Body: { status }
app.patch('/api/uppdrag/runs/:runId/status', authenticateToken, async (req, res) => {
  try {
    const { runId } = req.params || {};
    const { status } = req.body || {};
    const id = String(runId || '').trim();
    if (!id) return res.status(400).json({ error: 'runId saknas' });

    const nextStatus = String(status || '').trim();
    const allowed = new Set(['Planerad', 'Pågående', 'Klar', 'Sen']);
    if (!allowed.has(nextStatus)) {
      return res.status(400).json({ error: 'Ogiltig status. Tillåtna: Planerad, Pågående, Klar, Sen.' });
    }

    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
    if (!airtableAccessToken) return res.status(500).json({ error: 'AIRTABLE_ACCESS_TOKEN saknas' });
    const runsTableId = await resolveUppdragRunsTableId(airtableAccessToken, airtableBaseId);
    if (!runsTableId) {
      return res.status(404).json({ error: `Tabellen "${UPPDRAG_RUNS_TABLE_NAME}" saknas. Installera via /api/setup/airtable-uppdrag-runs.` });
    }
    const url = `https://api.airtable.com/v0/${airtableBaseId}/${runsTableId}/${encodeURIComponent(id)}`;
    const headers = { Authorization: `Bearer ${airtableAccessToken}`, 'Content-Type': 'application/json' };

    // Behörighetskontroll: samma byrå som inloggad användare
    const userData = await getUser(req.user.email);
    const byraIdClean = userData?.byraId ? String(userData.byraId).replace(/,/g, '').trim() : '';
    if (!byraIdClean) return res.status(403).json({ error: 'Saknar byråkoppling (user.byraId)' });

    const existing = await axios.get(url, { headers });
    const f = existing.data?.fields || {};
    const recordByra = (f['Byrå ID'] != null) ? String(f['Byrå ID']).replace(/,/g, '').trim() : '';
    if (!recordByra || recordByra !== byraIdClean) {
      return res.status(403).json({ error: 'Du saknar behörighet att uppdatera denna uppdragskörning.' });
    }

    const patchRes = await axios.patch(url, {
      fields: {
        'Status': nextStatus,
        'Uppdaterad': new Date().toISOString()
      }
    }, { headers });

    return res.json({ record: patchRes.data });
  } catch (error) {
    console.error('❌ PATCH /api/uppdrag/runs/:runId/status:', error.response?.data || error.message);
    const status = error.response?.status || 500;
    const msg = error.response?.data?.error?.message || error.message;
    return res.status(status).json({ error: msg, airtableError: error.response?.data });
  }
});

// GET /api/uppdrag/byra?mine=0|1 – lista uppdrag för byrån (eller bara mina)
app.get('/api/uppdrag/byra', authenticateToken, async (req, res) => {
  try {
    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
    const tableIdOrName = process.env.AIRTABLE_TABLE_UPPDRAG_ID || encodeURIComponent(UPPDRAG_TABLE_NAME);
    if (!airtableAccessToken) return res.status(500).json({ error: 'AIRTABLE_ACCESS_TOKEN saknas' });

    const userData = await getUser(req.user.email);
    const byraIdClean = userData?.byraId ? String(userData.byraId).replace(/,/g, '').trim() : '';
    if (!byraIdClean) return res.json({ records: [] });

    const mine = String(req.query.mine || '0') === '1';
    const url = `https://api.airtable.com/v0/${airtableBaseId}/${tableIdOrName}`;
    const headers = { Authorization: `Bearer ${airtableAccessToken}` };

    const esc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const num = parseInt(byraIdClean, 10);
    const byraFormula = isNaN(num)
      ? `OR({Byrå ID}="${esc(byraIdClean)}")`
      : `OR({Byrå ID}="${esc(byraIdClean)}",{Byrå ID}=${num})`;

    let records = [];
    let offset = null;
    do {
      const params = { pageSize: 100, filterByFormula: byraFormula };
      if (offset) params.offset = offset;
      const r = await axios.get(url, { headers, params });
      records = records.concat(r.data.records || []);
      offset = r.data.offset || null;
    } while (offset);

    // "Mina" = filtrera på Ansvarig = användarens namn (lagras som text i uppdrag idag)
    if (mine) {
      const myName = (userData?.name || '').toString().trim().toLowerCase();
      records = records.filter(rec => {
        const a = (rec.fields?.['Ansvarig'] || '').toString().trim().toLowerCase();
        return myName && a === myName;
      });
    }

    // Enrich: kundnamn via Kund ID -> KUNDDATA
    const custIds = Array.from(new Set(records.map(r => (r.fields?.['Kund ID'] || '').toString().trim()).filter(Boolean)));
    const nameById = {};
    const fetchBatch = async (ids) => {
      if (!ids.length) return;
      const parts = ids.map(id => `RECORD_ID()="${esc(id)}"`).join(',');
      const formula = `OR(${parts})`;
      // KUNDDATA-tabellen används på flera ställen i koden med fast table-id.
      // Tillåter override via env om man vill.
      const KUNDDATA_TABLE_ID = process.env.AIRTABLE_TABLE_KUNDDATA_ID || process.env.AIRTABLE_KUNDDATA_TABLE_ID || 'tblOIuLQS2DqmOQWe';
      const custUrl = `https://api.airtable.com/v0/${airtableBaseId}/${encodeURIComponent(KUNDDATA_TABLE_ID)}`;
      let custRes;
      try {
        custRes = await axios.get(custUrl, {
          headers,
          params: { filterByFormula: formula, maxRecords: 100, fields: ['Namn', 'Företagsnamn'] }
        });
      } catch (e) {
        const msg = e.response?.data?.error?.message || e.message || '';
        // Airtable kan returnera 422 om man ber om fields[] som inte finns.
        if (/Unknown field name/i.test(String(msg))) {
          custRes = await axios.get(custUrl, {
            headers,
            params: { filterByFormula: formula, maxRecords: 100, fields: ['Namn'] }
          });
        } else {
          throw e;
        }
      }
      (custRes.data.records || []).forEach(r => {
        const f = r.fields || {};
        nameById[r.id] = (f['Namn'] || f['Företagsnamn'] || f['Foretagsnamn'] || '').toString();
      });
    };
    for (let i = 0; i < custIds.length; i += 50) {
      // eslint-disable-next-line no-await-in-loop
      await fetchBatch(custIds.slice(i, i + 50));
    }
    records.forEach(r => {
      const cid = (r.fields?.['Kund ID'] || '').toString().trim();
      if (cid && nameById[cid]) r.fields['Kundnamn'] = nameById[cid];
    });

    res.json({ records });
  } catch (error) {
    console.error('❌ GET /api/uppdrag/byra:', error.response?.data || error.message);
    const status = error.response?.status || 500;
    const msg = error.response?.data?.error?.message || error.message;
    res.status(status).json({ error: msg });
  }
});

// POST /api/uppdrag – skapa/uppdatera ett uppdrag (upsert per kund+typ)
// Body: { customerId, typ, fields }
app.post('/api/uppdrag', authenticateToken, async (req, res) => {
  try {
    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
    const tableIdOrName = process.env.AIRTABLE_TABLE_UPPDRAG_ID || encodeURIComponent(UPPDRAG_TABLE_NAME);
    const { customerId, typ, fields: rawFields } = req.body || {};
    if (!customerId || !typ) return res.status(400).json({ error: 'customerId och typ krävs' });

    const userData = await getUser(req.user.email);
    const byraId = userData?.byraId ? String(userData.byraId).replace(/,/g, '') : '';

    const url = `https://api.airtable.com/v0/${airtableBaseId}/${tableIdOrName}`;
    const existingRes = await airtableListWithFormulaFallback({
      url,
      headers: { Authorization: `Bearer ${airtableAccessToken}` },
      baseParams: { maxRecords: 1 },
      formulas: buildUppdragFilterFormulas(customerId, typ)
    });
    const existing = (existingRes.data.records || [])[0];

    // Normalisera inkommande fält (frontend kan ha äldre/fel fältnamn)
    const normalizedFields = { ...(rawFields || {}) };
    // Backwards compatibility: "PTL uppdrag" -> "PTL Underlag"
    const ptlLegacyKey = Object.keys(normalizedFields).find(k => String(k).toLowerCase().replace(/\s+/g, ' ').trim() === 'ptl uppdrag');
    if (ptlLegacyKey && normalizedFields[ptlLegacyKey] != null && normalizedFields['PTL Underlag'] == null) {
      normalizedFields['PTL Underlag'] = normalizedFields[ptlLegacyKey];
    }
    if (ptlLegacyKey) delete normalizedFields[ptlLegacyKey];

    const fields = {
      'Kund ID': customerId,
      'Byrå ID': byraId,
      'Typ': typ,
      ...normalizedFields,
      'Uppdaterad': new Date().toISOString()
    };

    const tryWriteWithFallback = async (writeFn) => {
      try {
        return await writeFn(fields);
      } catch (e) {
        const msg = e.response?.data?.error?.message || e.message || '';
        // Airtable kan ge 422 "Unknown field name" om tabellen saknar ett av våra fält.
        // För att inte blockera sparning av övriga uppgifter så provar vi igen utan fältet.
        const m = String(msg).match(/Unknown field name:\s*"([^"]+)"/i);
        if (!m) throw e;
        const unknown = m[1];
        if (!unknown || !(unknown in fields)) throw e;
        const retryFields = { ...fields };
        delete retryFields[unknown];
        const r = await writeFn(retryFields);
        // Lägg med varning till klienten så man kan installera/uppdatera schema.
        r.__clientflow_warning = `Airtable saknar fältet "${unknown}". Sparade övriga ändringar, men detta fält ignorerades. Kör Installera/uppdatera Airtable för Uppdrag-tabellen.`;
        return r;
      }
    };

    if (existing) {
      const write = async (payloadFields) => {
        const updateRes = await axios.patch(
          `https://api.airtable.com/v0/${airtableBaseId}/${tableIdOrName}/${existing.id}`,
          { fields: payloadFields },
          { headers: { Authorization: `Bearer ${airtableAccessToken}`, 'Content-Type': 'application/json' } }
        );
        return updateRes.data;
      };
      const record = await tryWriteWithFallback(write);
      const warning = record && record.__clientflow_warning;
      if (warning) delete record.__clientflow_warning;
      setImmediate(() => {
        processUppdragUnderlagSchedule().catch((e) => console.warn('ensure runs after uppdrag update:', e.message));
      });
      return res.json({ record, updated: true, warning });
    }

    const write = async (payloadFields) => {
      const createRes = await axios.post(
        `https://api.airtable.com/v0/${airtableBaseId}/${tableIdOrName}`,
        // Skicka inte default för singleSelect-fält (Airtable kan annars försöka skapa nytt val och neka)
        { fields: payloadFields },
        { headers: { Authorization: `Bearer ${airtableAccessToken}`, 'Content-Type': 'application/json' } }
      );
      return createRes.data;
    };
    const record = await tryWriteWithFallback(write);
    const warning = record && record.__clientflow_warning;
    if (warning) delete record.__clientflow_warning;
    setImmediate(() => {
      processUppdragUnderlagSchedule().catch((e) => console.warn('ensure runs after uppdrag create:', e.message));
    });
    return res.json({ record, created: true, warning });
  } catch (error) {
    console.error('❌ POST /api/uppdrag:', error.response?.data || error.message);
    const status = error.response?.status || 500;
    const msg = error.response?.data?.error?.message || error.message;
    if (/Unknown field names/i.test(String(msg))) {
      return res.status(500).json({
        error: 'Uppdrag-tabellen i Airtable saknar fält (t.ex. "Kund ID" och "Typ"). Skapa/uppdatera tabellen via /api/setup/airtable-uppdrag (kräver schema-token).',
        details: msg
      });
    }
    res.status(status).json({ error: msg, airtableError: error.response?.data });
  }
});

// POST /api/uppdrag/complete – klarmarkera en körning för ett uppdrag och uppdatera nästa deadline
// Body: { customerId, typ, note?, doneAt? }
app.post('/api/uppdrag/complete', authenticateToken, async (req, res) => {
  try {
    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
    const tableIdOrName = process.env.AIRTABLE_TABLE_UPPDRAG_ID || encodeURIComponent(UPPDRAG_TABLE_NAME);
    const { customerId, typ, note, doneAt } = req.body || {};
    if (!customerId || !typ) return res.status(400).json({ error: 'customerId och typ krävs' });
    const doneIso = (doneAt && /^\d{4}-\d{2}-\d{2}$/.test(String(doneAt))) ? String(doneAt) : new Date().toISOString().slice(0, 10);

    const url = `https://api.airtable.com/v0/${airtableBaseId}/${tableIdOrName}`;
    const existingRes = await airtableListWithFormulaFallback({
      url,
      headers: { Authorization: `Bearer ${airtableAccessToken}` },
      baseParams: { maxRecords: 1 },
      formulas: buildUppdragFilterFormulas(customerId, typ)
    });
    const existing = (existingRes.data.records || [])[0];
    if (!existing) return res.status(404).json({ error: 'Uppdrag saknas för kund+typ (skapa uppdraget först)' });

    const f = existing.fields || {};
    const freq = f['Frekvens'] || '';
    const currentDeadline = f['Nästa deadline'] || doneIso;

    const toDateStr = (iso) => {
      const s = String(iso || '').slice(0, 10);
      return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
    };
    const monthKey = (iso) => {
      const s = toDateStr(iso);
      return s ? s.slice(0, 7) : '';
    };
    const quarterKey = (iso) => {
      const s = toDateStr(iso);
      if (!s) return '';
      const y = Number(s.slice(0, 4));
      const m = Number(s.slice(5, 7));
      if (!y || !m) return '';
      const q = Math.ceil(m / 3);
      return `${y}-Q${q}`;
    };
    const yearKey = (iso) => {
      const s = toDateStr(iso);
      return s ? s.slice(0, 4) : '';
    };
    const getModeForUppdrag = (typStr, freqStr) => {
      const tt = String(typStr || '').trim();
      const ff = String(freqStr || '').toLowerCase();
      if (tt === 'Momsredovisning') {
        if (ff.includes('kvartal')) return 'quarter';
        if (ff.includes('år')) return 'year';
        return 'month';
      }
      if (tt === 'Bokslut' || tt === 'Deklaration') return 'year';
      return 'month';
    };
    const mode = getModeForUppdrag(typ, freq);
    const periodKey = (mode === 'quarter')
      ? quarterKey(currentDeadline || doneIso)
      : (mode === 'year')
        ? yearKey(currentDeadline || doneIso)
        : monthKey(currentDeadline || doneIso);

    let history = [];
    try {
      const raw = (f['Historik'] || '').toString().trim();
      if (raw) history = JSON.parse(raw);
      if (!Array.isArray(history)) history = [];
    } catch (_) { history = []; }

    history.unshift({
      doneAt: doneIso,
      ...(periodKey ? { periodKey } : {}),
      status: 'Klar',
      note: (note || '').toString().trim(),
      user: req.user?.email || ''
    });
    history = history.slice(0, 200);

    const next = calcNextDeadline(currentDeadline, freq);

    const fields = {
      'Senast utförd': doneIso,
      'Historik': JSON.stringify(history),
      'Uppdaterad': new Date().toISOString()
    };
    if (next) fields['Nästa deadline'] = next;

    const updateRes = await axios.patch(
      `https://api.airtable.com/v0/${airtableBaseId}/${tableIdOrName}/${existing.id}`,
      { fields },
      { headers: { Authorization: `Bearer ${airtableAccessToken}`, 'Content-Type': 'application/json' } }
    );

    return res.json({ record: updateRes.data, nextDeadline: next || null });
  } catch (error) {
    console.error('❌ POST /api/uppdrag/complete:', error.response?.data || error.message);
    const status = error.response?.status || 500;
    const msg = error.response?.data?.error?.message || error.message;
    if (/Unknown field names/i.test(String(msg))) {
      return res.status(500).json({
        error: 'Uppdrag-tabellen i Airtable saknar fält (t.ex. "Kund ID" och "Typ"). Skapa/uppdatera tabellen via /api/setup/airtable-uppdrag (kräver schema-token).',
        details: msg
      });
    }
    res.status(status).json({ error: msg, airtableError: error.response?.data });
  }
});

// PATCH /api/uppdrag/run-status – sätt status för en period (fallback om Uppdragskörningar ej används/åtkomlig)
// Body: { customerId, typ, periodKey, status, runId? }
// Sparas i fältet "Historik" som JSON-array (vi lägger/uppdaterar entry { periodKey, status, updatedAt, user })
app.patch('/api/uppdrag/run-status', authenticateToken, async (req, res) => {
  try {
    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
    const tableIdOrName = process.env.AIRTABLE_TABLE_UPPDRAG_ID || encodeURIComponent(UPPDRAG_TABLE_NAME);
    const { customerId, typ, periodKey, status, runId } = req.body || {};
    if (!customerId || !typ) return res.status(400).json({ error: 'customerId och typ krävs' });
    const pk = String(periodKey || '').trim();
    if (!pk) return res.status(400).json({ error: 'periodKey krävs' });

    const nextStatus = String(status || '').trim();
    const allowed = new Set(['Planerad', 'Pågående', 'Klar', 'Sen']);
    if (!allowed.has(nextStatus)) {
      return res.status(400).json({ error: 'Ogiltig status. Tillåtna: Planerad, Pågående, Klar, Sen.' });
    }

    const url = `https://api.airtable.com/v0/${airtableBaseId}/${tableIdOrName}`;
    const existingRes = await airtableListWithFormulaFallback({
      url,
      headers: { Authorization: `Bearer ${airtableAccessToken}` },
      baseParams: { maxRecords: 1 },
      formulas: buildUppdragFilterFormulas(customerId, typ)
    });
    const existing = (existingRes.data.records || [])[0];
    if (!existing) return res.status(404).json({ error: 'Uppdrag saknas för kund+typ (skapa uppdraget först)' });

    const f = existing.fields || {};
    let history = [];
    try {
      const raw = (f['Historik'] || '').toString().trim();
      if (raw) history = JSON.parse(raw);
      if (!Array.isArray(history)) history = [];
    } catch (_) { history = []; }

    const nowIso = new Date().toISOString();
    const user = req.user?.email || '';
    const idx = history.findIndex(it => it && String(it.periodKey || '').trim() === pk);
    const entry = { periodKey: pk, status: nextStatus, updatedAt: nowIso, user };
    if (idx >= 0) history[idx] = { ...(history[idx] || {}), ...entry };
    else history.unshift(entry);
    history = history.slice(0, 250);

    const updateRes = await axios.patch(
      `https://api.airtable.com/v0/${airtableBaseId}/${tableIdOrName}/${existing.id}`,
      { fields: { 'Historik': JSON.stringify(history), 'Uppdaterad': nowIso } },
      { headers: { Authorization: `Bearer ${airtableAccessToken}`, 'Content-Type': 'application/json' } }
    );

    // Best effort: om vi även har en uppdragskörning (Uppdragskörningar-tabellen) så håll den synkad.
    // Ignorera fel här, eftersom vissa installationer saknar rättighet/tabell.
    const runIdClean = String(runId || '').trim();
    if (runIdClean) {
      try {
        const runsTableId = await resolveUppdragRunsTableId(airtableAccessToken, airtableBaseId);
        if (!runsTableId) throw new Error('runs table missing');
        await axios.patch(
          `https://api.airtable.com/v0/${airtableBaseId}/${runsTableId}/${encodeURIComponent(runIdClean)}`,
          { fields: { 'Status': nextStatus, 'Uppdaterad': nowIso } },
          { headers: { Authorization: `Bearer ${airtableAccessToken}`, 'Content-Type': 'application/json' } }
        );
      } catch (_) {}
    }

    return res.json({ record: updateRes.data, periodKey: pk, status: nextStatus, syncedRun: !!runIdClean });
  } catch (error) {
    console.error('❌ PATCH /api/uppdrag/run-status:', error.response?.data || error.message);
    const status = error.response?.status || 500;
    const msg = error.response?.data?.error?.message || error.message;
    return res.status(status).json({ error: msg, airtableError: error.response?.data });
  }
});

// ============================================================
// POST /api/uppdrag/run-docs — Ladda upp dokumentation för en körning (bilaga)
// Body: { customerId, typ, deadline, filename, contentType, base64 }
// ============================================================
app.post('/api/uppdrag/run-docs', authenticateToken, async (req, res) => {
  try {
    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
    const tableIdOrName = process.env.AIRTABLE_TABLE_UPPDRAG_ID || encodeURIComponent(UPPDRAG_TABLE_NAME);
    const tableId = process.env.AIRTABLE_TABLE_UPPDRAG_ID || null;
    const { customerId, typ, deadline, filename, contentType, base64 } = req.body || {};

    if (!customerId || !typ) return res.status(400).json({ error: 'customerId och typ krävs' });
    if (!deadline || !/^\d{4}-\d{2}-\d{2}$/.test(String(deadline))) {
      return res.status(400).json({ error: 'deadline krävs (YYYY-MM-DD)' });
    }
    if (!filename || typeof filename !== 'string') return res.status(400).json({ error: 'filename krävs' });
    if (!base64 || typeof base64 !== 'string') return res.status(400).json({ error: 'base64 krävs' });

    // Normalisera base64 (tillåt data:-URL)
    const rawB64 = String(base64).includes(',') ? String(base64).split(',').pop() : String(base64);
    const buf = Buffer.from(rawB64, 'base64');
    if (!buf || !buf.length) return res.status(400).json({ error: 'Filen var tom' });
    if (buf.length > 12 * 1024 * 1024) {
      return res.status(413).json({ error: 'Filen är för stor. Max 12 MB per fil.' });
    }

    const safeDeadline = String(deadline);
    const cleanName = String(filename).replace(/[^a-zA-Z0-9\u00e5\u00e4\u00f6\u00c5\u00c4\u00d6 ._\-()]/g, '').trim().slice(0, 120) || 'bilaga';
    const finalFilename = `${safeDeadline} - ${cleanName}`;

    const url = `https://api.airtable.com/v0/${airtableBaseId}/${tableIdOrName}`;
    const existingRes = await airtableListWithFormulaFallback({
      url,
      headers: { Authorization: `Bearer ${airtableAccessToken}` },
      baseParams: { maxRecords: 1 },
      formulas: buildUppdragFilterFormulas(customerId, typ)
    });
    const existing = (existingRes.data.records || [])[0];
    if (!existing) return res.status(404).json({ error: 'Uppdrag saknas för kund+typ (skapa uppdraget först)' });

    // Försök ladda upp till Dokumentation/Attachments i Uppdrag-tabellen
    const candidates = ['Dokumentation', 'Attachments'];
    let uploaded = null;
    let usedField = null;
    for (const fName of candidates) {
      // eslint-disable-next-line no-await-in-loop
      const att = await uploadAttachmentToAirtableFieldReturnAttachment(
        airtableAccessToken,
        airtableBaseId,
        existing.id,
        buf,
        finalFilename,
        contentType || 'application/octet-stream',
        tableId,
        fName
      );
      if (att) {
        uploaded = att;
        usedField = fName;
        break;
      }
    }
    if (!uploaded) {
      return res.status(500).json({
        error: 'Kunde inte ladda upp filen till Airtable. Kontrollera att Uppdrag-tabellen har ett bilagefält (t.ex. "Dokumentation" eller "Attachments").'
      });
    }

    // Returnera uppdaterad post så klienten kan visa listan direkt.
    const refreshed = await axios.get(
      `https://api.airtable.com/v0/${airtableBaseId}/${tableIdOrName}/${existing.id}`,
      { headers: { Authorization: `Bearer ${airtableAccessToken}` }, timeout: 15000 }
    );

    return res.json({
      ok: true,
      attachment: uploaded,
      fieldName: usedField,
      record: refreshed.data
    });
  } catch (error) {
    console.error('❌ POST /api/uppdrag/run-docs:', error.response?.data || error.message);
    const status = error.response?.status || 500;
    const msg = error.response?.data?.error?.message || error.message;
    res.status(status).json({ error: msg });
  }
});

// GET /api/falt-alternativ?tabell=KUNDDATA&falt=Riskhöjande faktorer övrigt – Hämta choices för ett multiselect-fält
app.get('/api/falt-alternativ', authenticateToken, async (req, res) => {
  try {
    const { falt } = req.query;
    if (!falt) return res.status(400).json({ error: 'falt saknas' });
    const token = process.env.AIRTABLE_ACCESS_TOKEN;
    const baseId = process.env.AIRTABLE_BASE_ID;
    const r = await axios.get(`https://api.airtable.com/v0/meta/bases/${baseId}/tables`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const kundTable = r.data.tables.find(t => t.name === 'KUNDDATA');
    const field = kundTable?.fields?.find(f => f.name === falt);
    const choices = field?.options?.choices?.map(c => c.name) || [];
    res.json({ choices });
  } catch (err) {
    console.error('❌ falt-alternativ:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/byra-tjanster?byraId=XXX – Hämta byråns tjänster från "Risker kopplad till tjänster"
app.get('/api/byra-tjanster', authenticateToken, async (req, res) => {
  try {
    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
    const byraId = req.query.byraId;

    if (!byraId) return res.status(400).json({ error: 'byraId saknas' });

    const formula = encodeURIComponent(`{Byrå ID}="${byraId}"`);
    let allRecords = [];
    let offset = null;

    do {
      let url = `https://api.airtable.com/v0/${airtableBaseId}/${RISK_ASSESSMENT_TABLE}?filterByFormula=${formula}`
        + `&fields[]=Task Name&fields[]=Beskrivning av riskfaktor&fields[]=Riskbedömning&fields[]=Åtgjärd&fields[]=TJÄNSTTYP`
        + `&pageSize=100`;
      if (offset) url += `&offset=${offset}`;

      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${airtableAccessToken}` }
      });
      allRecords = allRecords.concat(response.data.records || []);
      offset = response.data.offset;
    } while (offset);

    const tjanster = allRecords
      .filter(r => r.fields?.['Task Name'])
      .map(r => ({
        id: r.id,
        namn: (r.fields['Task Name'] || '').trim(),
        beskrivning: r.fields['Beskrivning av riskfaktor'] || '',
        riskbedomning: r.fields['Riskbedömning'] || '',
        atgard: r.fields['Åtgjärd'] || '',
        typ: r.fields['TJÄNSTTYP'] || ''
      }));

    console.log(`✅ Byråns tjänster (${byraId}):`, tjanster.map(t => t.namn));
    res.json({ tjanster });
  } catch (err) {
    console.error('❌ byra-tjanster:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/byra-info – Hämta byrånamn, konsulter och tjänster för inloggad användares byrå
app.get('/api/byra-info', authenticateToken, async (req, res) => {
  try {
    const userEmail = req.user.email;
    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
    const requestedByraId = (req.query.byraId || '').toString().trim();

    // Hämta inloggad användare för att få byraId och byranamn
    const inloggedUser = await getAirtableUser(userEmail);
    if (!inloggedUser) return res.status(404).json({ error: 'Användaren hittades inte' });

    // Behörighet: admin får hämta valfri byrå. Övriga får bara hämta byråer de är kopplade till.
    const userData = await getUser(userEmail).catch(() => null);
    const role = userData?.role || inloggedUser.role || req.user.role || '';
    const isClientFlowAdmin = role === 'ClientFlowAdmin';
    const allowedByraIds = Array.isArray(userData?.byraIds)
      ? userData.byraIds.map(x => String(x).trim()).filter(Boolean)
      : [(inloggedUser.byraId || '').toString().trim()].filter(Boolean);
    const canUseRequested = !!requestedByraId && (isClientFlowAdmin || allowedByraIds.includes(requestedByraId));
    const byraId = canUseRequested ? requestedByraId : (inloggedUser.byraId || '');
    const byraNamnFallback = inloggedUser.byra || '';

    // Hämta alla konsulter på samma byrå
    const filterFormula = byraId
      ? `{Byrå ID i text 2}="${byraId}"`
      : `{Byrå}="${byraNamnFallback}"`;

    const konsultRes = await axios.get(
      `https://api.airtable.com/v0/${airtableBaseId}/${USERS_TABLE}`,
      {
        headers: { Authorization: `Bearer ${airtableAccessToken}` },
        params: { filterByFormula: filterFormula, fields: ['fldU9goXGJs7wk7OZ', 'Full Name', 'Email', 'Role'] }
      }
    );

    const konsulter = (konsultRes.data.records || []).map(r => ({
      id: r.id,
      namn: r.fields['fldU9goXGJs7wk7OZ'] || r.fields['Full Name'] || r.fields['Email'] || '',
      email: r.fields['Email'] || '',
      roll: r.fields['Role'] || ''
    })).filter(k => k.namn);

    // Hämta tillåtna tjänster via Airtable Metadata API (choices på "Kundens utvalda tjänster")
    let byransTjanster = [];
    let byransHighRisk = [];
    try {
      const metaRes = await axios.get(
        `https://api.airtable.com/v0/meta/bases/${airtableBaseId}/tables`,
        { headers: { Authorization: `Bearer ${airtableAccessToken}` } }
      );
      const kundTable = (metaRes.data.tables || []).find(
        t => t.id === 'tblOIuLQS2DqmOQWe' || t.name === 'KUNDDATA'
      );
      if (kundTable) {
        // Hitta "Kundens utvalda tjänster"-fältet och läs dess choices
        const tjansterField = kundTable.fields.find(
          f => f.name === 'Kundens utvalda tjänster'
        );
        if (tjansterField?.options?.choices) {
          byransTjanster = tjansterField.options.choices.map(c => c.name);
        }
        // Hitta "Lookup Byråns högrisktjänster" om det finns
        const highRiskField = kundTable.fields.find(
          f => f.name === 'Lookup Byråns högrisktjänster'
        );
        // highRiskField är en lookup — hämta värden via ett kundpost istället
        if (byraId) {
          const hrRes = await axios.get(
            `https://api.airtable.com/v0/${airtableBaseId}/tblOIuLQS2DqmOQWe`,
            {
              headers: { Authorization: `Bearer ${airtableAccessToken}` },
              params: {
                filterByFormula: `{Byrå ID}="${byraId}"`,
                fields: ['Lookup Byråns högrisktjänster'],
                maxRecords: 1
              }
            }
          );
          byransHighRisk = hrRes.data.records?.[0]?.fields?.['Lookup Byråns högrisktjänster'] || [];
        }
      }
    } catch (metaErr) {
      console.warn('⚠️ Kunde inte hämta tjänster via metadata:', metaErr.message);
    }

    // Hämta byråns orgnr från Application Users-posten (fallback)
    let byraOrgnr = inloggedUser.orgnr || '';
    let byraNamn = byraNamnFallback;

    // Hämta avtals-defaults från Byråer-tabellen (om fälten finns)
    let avtalDefaults = {};
    let uppdragsbrevBilagor = [];
    try {
      // Hämta Byråer-record för vald byrå (om admin kan den vara annan än inloggad)
      const BYRAER_TABLE = 'Byråer';
      const num = parseInt(String(byraId));
      const ff = isNaN(num)
        ? `{Byrå ID}="${byraId}"`
        : `OR({Byrå ID}="${byraId}",{Byrå ID}=${byraId})`;
      const url = `https://api.airtable.com/v0/${airtableBaseId}/${encodeURIComponent(BYRAER_TABLE)}?filterByFormula=${encodeURIComponent(ff)}&maxRecords=1`;
      const atRes = await axios.get(url, { headers: { Authorization: `Bearer ${airtableAccessToken}` } });
      const record = atRes.data.records?.[0];
      const bf = record?.fields || {};

      byraNamn = bf['Byrå'] || bf['Namn'] || byraNamnFallback || '';
      byraOrgnr = bf['Orgnr'] || bf['OrgNr'] || bf['Organisationsnummer'] || byraOrgnr || '';
      const toNumberOrNull = (v) => {
        if (v == null) return null;
        if (typeof v === 'number') return Number.isFinite(v) ? v : null;
        const s = String(v).trim();
        if (!s) return null;
        const n = Number(s.replace(',', '.'));
        return Number.isFinite(n) ? n : null;
      };
      avtalDefaults = {
        defaultUppsagningstid: toNumberOrNull(bf['Default uppsägningstid'] ?? bf['Default uppsagningstid']),
        defaultFakturaperiod: bf['Default faktureringsperiod'] ?? bf['Default faktureringsperiod'] ?? bf['Default fakturaperiod'] ?? '',
        defaultBetalningsvillkor: toNumberOrNull(bf['Default betalningsvillkor'])
      };
      const bilagorRaw = Array.isArray(bf[BYRA_UPPDRAGSBREV_BILAGOR_FIELD]) ? bf[BYRA_UPPDRAGSBREV_BILAGOR_FIELD] : [];
      const meta = parseByraBilagorMeta(bf[BYRA_UPPDRAGSBREV_BILAGOR_META_FIELD]);
      const labelById = {};
      meta.forEach(m => { if (m && m.id) labelById[m.id] = (m.label || '').toString(); });
      uppdragsbrevBilagor = bilagorRaw
        .slice(0, BYRA_UPPDRAGSBREV_BILAGOR_MAX)
        .map(b => ({
          id: b?.id,
          url: b?.url,
          filename: b?.filename,
          label: (b && b.id && labelById[b.id]) ? labelById[b.id] : labelFromFilename(b?.filename)
        }))
        .filter(b => b.url);
    } catch (_) {}

    res.json({
      byraNamn,
      byraOrgnr,
      byraId,
      inloggadNamn: inloggedUser.name || '',
      konsulter,
      tjanster: byransTjanster,
      highRiskTjanster: byransHighRisk,
      avtalDefaults,
      uppdragsbrevBilagor
    });
  } catch (error) {
    console.error('❌ Error fetching byra-info:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/uppdragsavtal/:id/pdf – Generera PDF för uppdragsavtal
app.post('/api/uppdragsavtal/:id/pdf', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;

    const avtalRes = await axios.get(
      `https://api.airtable.com/v0/${airtableBaseId}/${UPPDRAGSAVTAL_TABLE}/${id}`,
      { headers: { Authorization: `Bearer ${airtableAccessToken}` } }
    );
    const f = avtalRes.data.fields || {};

    // Valbara bilagor (per avtal)
    // Om fälten saknas (nytt avtal ej sparat än) -> default = inkludera prislista + alla byråbilagor
    const hasPrislistaField = Object.prototype.hasOwnProperty.call(f || {}, 'Bifoga prislista');
    const includePrislista = hasPrislistaField
      ? !!(f['Bifoga prislista'] || f['Bifoga prislista'] === 1 || f['Bifoga prislista'] === '1')
      : true;

    const hasBilagorField = Object.prototype.hasOwnProperty.call(f || {}, 'Valda byråbilagor (JSON)');
    const rawSelectedBilagor = (f['Valda byråbilagor (JSON)'] || '').toString().trim();
    let selectedByraBilagaIds = [];
    try {
      const arr = rawSelectedBilagor ? JSON.parse(rawSelectedBilagor) : [];
      selectedByraBilagaIds = Array.isArray(arr) ? arr.map(x => String(x)) : [];
    } catch (_) { selectedByraBilagaIds = []; }
    // Viktigt: bifoga INTE byråbilagor automatiskt. Endast explicit valda bilagor ska följa med.
    // (Annars kan t.ex. PUBA/Bilaga 2 råka bifogas för alla kunder.)
    const defaultIncludeAllByraBilagor = false;

    // Välj rätt byrå för prislista/bilagor (utgå från avtalet, inte inloggad användare)
    const avtalByraIdRaw = (f['Byra ID'] ?? f['Byrå ID'] ?? f['ByråID'] ?? f['Byra_ID'] ?? f['ByraID'] ?? '').toString().trim();
    let targetByraId = avtalByraIdRaw;
    try {
      const userData = await getUser(req.user.email);
      const allowedByraIds = Array.isArray(userData?.byraIds)
        ? userData.byraIds.map(x => String(x).trim()).filter(Boolean)
        : [];
      const isAdmin = userData?.role === 'ClientFlowAdmin';
      if (!targetByraId) targetByraId = (userData?.byraId || '').toString().trim();
      if (targetByraId && !isAdmin && allowedByraIds.length && !allowedByraIds.includes(targetByraId)) {
        // Saknar rätt till efterfrågad byrå → fallback till egen byrå
        targetByraId = (userData?.byraId || '').toString().trim();
      }
    } catch (_) {}

    // Hämta byråinfo för den inloggade användaren
    const pdfUser = await getAirtableUser(req.user.email);
    // Logga-fältet i Airtable är en attachment-array: [{url, filename, ...}]
    const logoRaw = pdfUser?.logo;
    const logoUrl = Array.isArray(logoRaw) && logoRaw.length > 0
      ? logoRaw[0].url
      : (typeof logoRaw === 'string' && logoRaw.startsWith('http') ? logoRaw : null);
    const byraInfo = {
      namn: pdfUser?.byra || 'Byrån',
      orgnr: pdfUser?.orgnr || '',
      email: pdfUser?.email || '',
      logoUrl
    };
    console.log('\ud83d\uddbc\ufe0f Logo URL:', logoUrl);

    const fmtDate = (d) => d ? new Date(d).toLocaleDateString('sv-SE') : '\u2014';

    // Normalisera fältnamn: Airtable sparar med ASCII-namn från frontend
    // → Prioritera ASCII-namn (det vi sparar) framför svenska tecken (äldre fält)
    // Ansvarig hos byrån = den som genererar PDF:en (inloggad användare), inte bara värdet från avtalet
    const nf = {};
    nf['Kundnamn']           = f['Kundnamn'] || f['Namn'] || '\u2014';
    nf['Orgnr']              = f['Orgnr'] || '';
    nf['Uppdragsansvarig']   = (pdfUser?.name && pdfUser.name.trim()) ? pdfUser.name.trim() : (f['Uppdragsansvarig'] || '\u2014');
    nf['Avtalsdatum']        = f['Avtalsdatum'] || null;
    nf['Avtalet g\u00e4ller ifr\u00e5n'] = f['Avtalet galler fran'] || f['Avtalet g\u00e4ller ifr\u00e5n'] || null;
    nf['Upps\u00e4gningstid']     = f['Uppsagningstid'] ?? f['Upps\u00e4gningstid'] ?? null;
    nf['Ersättningsmodell']  = f['Ersattningsmodell'] || f['Ersättningsmodell'] || '';
    nf['Arvode']             = f['Arvode'] ?? null;
    nf['Arvodesperiod']      = f['Arvodesperiod'] || 'm\u00e5nad';
    nf['Arvodekommentar']    = f['Arvodekommentar'] || '';
    nf['Fakturaperiod']      = f['Fakturaperiod'] || '';
    nf['Betalningsvillkor']  = f['Betalningsvillkor'] ?? null;
    nf['Kunden godkänner allmänna villkor']         = f['Kunden godkanner allm villkor'] || f['Kunden godkänner allmänna villkor'] || false;
    nf['Kunden godkänner personuppgiftsbiträdesavtal'] = f['Kunden godkanner puba'] || f['Kunden godkänner personuppgiftsbiträdesavtal'] || false;
    nf['Avtalsstatus']       = f['Avtalsstatus'] || f['Status'] || '';
    nf['Signeringsdatum']    = f['Signeringsdatum'] || null;
    nf['Signerat av kund']   = f['Signerat av kund'] || '';
    nf['Signerat av byr\u00e5']  = f['Signerat av byra'] || f['Signerat av byr\u00e5'] || '';
    nf['\u00d6vrigt uppdrag']    = f['Ovrigt uppdrag'] || f['\u00d6vrigt uppdrag'] || '';

    // Valda tjänster sparas som kommaseparerad sträng
    const valdaTjansterRaw = f['Valda tjanster'] || f['Valda tj\u00e4nster'] || '';
    const tjanster = typeof valdaTjansterRaw === 'string'
      ? valdaTjansterRaw.split(',').map(t => t.trim()).filter(Boolean)
      : (Array.isArray(valdaTjansterRaw) ? valdaTjansterRaw : []);

    // Hämta prislista + informationstext + bilagor från Byråer (om fälten finns)
    let prislista = { tjanster: {}, fritext: [] };
    let byraInformationstext = '';
    let byraBilagorForPdf = [];
    try {
      let bf = {};
      if (targetByraId) {
        const BYRAER_TABLE = 'Byråer';
        const num = parseInt(String(targetByraId));
        const ff = isNaN(num)
          ? `{Byrå ID}="${targetByraId}"`
          : `OR({Byrå ID}="${targetByraId}",{Byrå ID}=${targetByraId})`;
        const url = `https://api.airtable.com/v0/${airtableBaseId}/${encodeURIComponent(BYRAER_TABLE)}?filterByFormula=${encodeURIComponent(ff)}&maxRecords=1`;
        const atRes = await axios.get(url, { headers: { Authorization: `Bearer ${airtableAccessToken}` } });
        bf = atRes.data.records?.[0]?.fields || {};
      } else {
        const byraRes = await getByraerRecordForUser(req);
        bf = byraRes?.record?.fields || {};
      }
      const pJson = bf['Tjänstepriser (JSON)'] ?? bf['Tjanstepriser (JSON)'] ?? bf['Prislista (JSON)'] ?? '';
      const fJson = bf['Fritexttjänster (JSON)'] ?? bf['Fritexttjanster (JSON)'] ?? '';
      const safeParseObj = (s) => {
        try {
          const o = JSON.parse(s || '{}');
          return (o && typeof o === 'object' && !Array.isArray(o)) ? o : {};
        } catch (_) { return {}; }
      };
      const safeParseArr = (s) => {
        try {
          const a = JSON.parse(s || '[]');
          return Array.isArray(a) ? a : [];
        } catch (_) { return []; }
      };
      prislista = {
        tjanster: safeParseObj(pJson),
        fritext: safeParseArr(fJson)
      };
      byraInformationstext = (bf['Uppdragsbrev informationstext'] || '').toString().trim();
      console.log('📝 PDF informationstext:', byraInformationstext ? `"${byraInformationstext.substring(0, 80)}..."` : '(tom – använder standardtext)');

      // Spara byråbilagor (PDF:er som byrån laddat upp) för merge längre ner
      const bilagorRaw = Array.isArray(bf[BYRA_UPPDRAGSBREV_BILAGOR_FIELD]) ? bf[BYRA_UPPDRAGSBREV_BILAGOR_FIELD] : [];
      const bilagorMeta = parseByraBilagorMeta(bf[BYRA_UPPDRAGSBREV_BILAGOR_META_FIELD]);
      const bilagaLabelById = {};
      bilagorMeta.forEach(m => { if (m && m.id) bilagaLabelById[m.id] = (m.label || '').toString(); });
      byraBilagorForPdf = bilagorRaw
        .filter(b => b?.url)
        .map(b => ({
          id: (b?.id || '').toString(),
          url: b.url,
          filename: b?.filename || 'bilaga.pdf',
          label: (b?.id && bilagaLabelById[b.id]) ? bilagaLabelById[b.id] : (b?.filename || 'bilaga.pdf')
        }));
    } catch (priceBilagaErr) {
      console.warn('⚠️ Kunde inte hämta prislista/bilagor/informationstext:', priceBilagaErr.message);
    }

    const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    const applyInlineFormatting = (text) => {
      let s = esc(text);
      s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      s = s.replace(/\*(.+?)\*/g, '<em>$1</em>');
      return s;
    };

    const informationstextToHtml = (rawText) => {
      if (!rawText) return '';
      const lines = rawText.split('\n');
      let html = '';
      let currentParagraph = [];
      let inList = false;
      const flushParagraph = () => {
        if (currentParagraph.length) {
          html += `<p>${currentParagraph.join('<br>')}</p>\n`;
          currentParagraph = [];
        }
      };
      const flushList = () => {
        if (inList) { html += '</ul>\n'; inList = false; }
      };
      for (const line of lines) {
        const trimmed = line.trim();
        if (/^#{1,4}\s*/.test(trimmed) && trimmed !== '#') {
          flushParagraph();
          flushList();
          const heading = trimmed.replace(/^#{1,4}\s*/, '').replace(/\s*#{1,4}\s*$/, '');
          html += `<h4 style="color:#1a1a2e;">${applyInlineFormatting(heading)}</h4>\n`;
        } else if (/^[-•]\s+/.test(trimmed)) {
          flushParagraph();
          if (!inList) { html += '<ul>\n'; inList = true; }
          const item = trimmed.replace(/^[-•]\s+/, '');
          html += `  <li>${applyInlineFormatting(item)}</li>\n`;
        } else if (trimmed === '') {
          flushParagraph();
          flushList();
        } else {
          flushList();
          currentParagraph.push(applyInlineFormatting(trimmed));
        }
      }
      flushParagraph();
      flushList();
      return html;
    };

    const fmtPris = (v) => {
      if (v == null || v === '') return '';
      const n = Number(v);
      if (!Number.isFinite(n)) return '';
      return `${n.toLocaleString('sv-SE')} kr`;
    };

    const normalizeEnhet = (raw) => {
      const e = (raw || '').toString().trim().toLowerCase();
      if (!e) return '';
      if (e === 'timme' || e === 'h' || e === 'hr' || e === 'hour') return 'h';
      if (e === 'st' || e === 'st.' || e === 'styck' || e === 'pcs' || e === 'piece') return 'st';
      return raw;
    };

    const prislistaTjansterRows = Object.entries(prislista?.tjanster || {})
      .map(([namn, v]) => {
        const obj = (v && typeof v === 'object') ? v : { pris: v, enhet: '', visible: true };
        const prisText = fmtPris(obj.pris) || '—';
        const enhet = normalizeEnhet(obj.enhet);
        return { namn: (namn || '').toString().trim(), prisText, enhet, visible: obj.visible !== false };
      })
      .filter(x => x.namn && x.visible)
      .sort((a, b) => a.namn.localeCompare(b.namn, 'sv'));

    const prislistaFritextRows = (prislista?.fritext || [])
      .map(x => {
        const namn = (x?.namn || '').toString().trim();
        const prisText = fmtPris(x?.pris) || '—';
        const enhet = normalizeEnhet(x?.enhet);
        return { namn, prisText, enhet, visible: x?.visible !== false };
      })
      .filter(x => x.namn && x.visible)
      .sort((a, b) => a.namn.localeCompare(b.namn, 'sv'));

    const ACCENT = '#2c4a8f';
    const htmlContent = `<!DOCTYPE html>
<html lang="sv">
<head>
<meta charset="UTF-8">
<style>
  @page { margin: 18mm 20mm 22mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, 'Helvetica Neue', sans-serif; font-size: 9.5pt; color: #1a1a2e; line-height: 1.6; }

  /* ── Header ── */
  .header { display: flex; justify-content: space-between; align-items: flex-start;
            border-bottom: 3px solid ${ACCENT}; padding-bottom: 12px; margin-bottom: 20px; }
  .header-left { display: flex; flex-direction: column; gap: 4px; }
  .doc-title { font-size: 22pt; font-weight: 900; letter-spacing: 0.05em; text-transform: uppercase;
               color: ${ACCENT}; margin: 0; line-height: 1; }
  .welcome { font-size: 9pt; color: #666; font-style: italic; margin: 4px 0 0; }
  .logo-placeholder { width: 110px; height: 38px; border: 1.5px dashed #ccc; border-radius: 4px;
                      display: flex; align-items: center; justify-content: center;
                      font-size: 7pt; color: #bbb; text-align: center; line-height: 1.3; }

  /* ── Parter ── */
  .parter { display: flex; gap: 32px; margin-bottom: 20px; }
  .part { flex: 1; padding: 0; }
  .part-label { font-size: 7pt; text-transform: uppercase; letter-spacing: 0.08em;
                color: ${ACCENT}; margin-bottom: 4px; font-weight: 700; }
  .part-name { font-size: 11pt; font-weight: 700; color: #1a1a2e; }
  .part-sub { font-size: 8.5pt; color: #666; margin-top: 2px; }

  /* ── Meta-rad ── */
  .meta-grid { display: flex; gap: 24px; margin-bottom: 20px; }
  .meta-item { flex: 1; padding: 0; }
  .meta-label { font-size: 6.5pt; text-transform: uppercase; letter-spacing: 0.08em;
                color: #888; font-weight: 700; margin-bottom: 3px; }
  .meta-value { font-size: 9.5pt; font-weight: 700; color: #1a1a2e; }

  /* ── Sektioner ── */
  .section { margin-bottom: 14px; }
  .section-title { font-size: 8pt; font-weight: 800; text-transform: uppercase;
                   letter-spacing: 0.1em; color: ${ACCENT};
                   border-bottom: 1.5px solid ${ACCENT}; padding-bottom: 3px; margin-bottom: 9px; }

  /* ── Tjänster ── */
  .tjanster-grid { display: flex; flex-wrap: wrap; gap: 3px 24px; padding: 2px 0; }
  .tjanst-item { font-size: 9.5pt; min-width: 170px; line-height: 1.7; }

  /* ── Ersättning ── */
  .check-row { font-size: 9.5pt; margin-bottom: 6px; }
  .arvode-box { display: inline-block; background: #f4f6fb; border: 1px solid #dce3f0;
                border-radius: 4px; padding: 6px 16px; margin-top: 6px; }
  .arvode-label { font-size: 7pt; color: #888; text-transform: uppercase;
                  letter-spacing: 0.06em; margin-bottom: 2px; }
  .arvode-value { font-size: 12pt; font-weight: 800; color: ${ACCENT}; }
  .fastpris-note { font-size: 8pt; color: #555; margin-top: 8px; line-height: 1.55;
                   background: #fafbfe; border-left: 3px solid #b0bedd;
                   padding: 6px 10px; border-radius: 0 4px 4px 0; }

  /* ── Betalning ── */
  .betal-text { font-size: 9.5pt; line-height: 1.6; }

  /* ── Bekräftelse-rad ── */
  .confirm-row { font-size: 8.5pt; color: #333; margin-top: 8px; padding: 5px 8px;
                 background: #f4f6fb; border-radius: 4px; }

  /* ── Villkorstext ── */
  .bilaga-wrap { padding: 0; }
  .villkor-text { font-size: 8pt; color: #333; line-height: 1.6; }
  .villkor-text h4 { font-size: 8pt; font-weight: 800; margin: 10px 0 4px;
                     text-transform: uppercase; letter-spacing: 0.06em; color: ${ACCENT}; }
  .villkor-text ul { padding-left: 16px; margin: 4px 0 6px; }
  .villkor-text ol { padding-left: 16px; margin: 4px 0 6px; }
  .villkor-text li { margin-bottom: 3px; }
  .villkor-text p { margin-bottom: 5px; }

  /* ── Underskrifter ── */
  .sign-grid { display: flex; gap: 40px; margin-top: 16px; }
  .sign-box { flex: 1; border-top: 2px solid ${ACCENT}; padding-top: 12px; }
  .sign-label { font-size: 8pt; color: #555; margin-bottom: 30px; font-weight: 600; }
  .sign-name { font-size: 9pt; font-weight: 700; color: #1a1a2e; }
  .sign-datum { font-size: 8pt; color: #666; margin-top: 4px; }

  /* ── Sidfot ── */
  .footer { display: none; }

  /* ── Sidbrytning ── */
  .page-break { page-break-before: always; }

  /* ── Prislista (Bilaga 3) ── */
  .prislist-note { font-size: 8.5pt; color:#475569; line-height:1.55; margin: 6px 0 10px; }
  table.prislista { width:100%; border-collapse: collapse; font-size: 9pt; }
  table.prislista th, table.prislista td { border: 1px solid #dce3f0; padding: 6px 8px; vertical-align: top; }
  table.prislista th { background:#fafbfe; color:#334155; font-size: 8pt; text-transform: uppercase; letter-spacing: .06em; }
  .muted { color:#64748b; font-style: italic; }
</style>
</head>
<body>

<div class="footer"></div>

<!-- ═══════════ SIDA 1: AVTALSSIDAN ═══════════ -->
<div class="header">
  <div class="header-left">
    <div class="doc-title">Uppdragsavtal</div>
    <div class="welcome">Varmt v\u00e4lkommen som kund hos oss. Vi ser fram emot ett l\u00e5ngt och givande samarbete.</div>
  </div>
  ${byraInfo.logoUrl
    ? `<img src="${byraInfo.logoUrl}" style="max-height:60px; max-width:180px; object-fit:contain;" alt="Logotyp">`
    : `<div class="logo-placeholder">Logotyp<br>placeras h\u00e4r</div>`}
</div>

<div class="parter">
  <div class="part">
    <div class="part-label">Uppdragstagare</div>
    <div class="part-name">${byraInfo.namn}</div>
    ${byraInfo.orgnr ? `<div class="part-sub">${byraInfo.orgnr}</div>` : ''}
  </div>
  <div class="part">
    <div class="part-label">Uppdragsgivare</div>
    <div class="part-name">${nf['Kundnamn']}</div>
    <div class="part-sub">${nf['Orgnr']}</div>
  </div>
</div>

<div class="meta-grid">
  <div class="meta-item"><div class="meta-label">Ansvarig hos byr\u00e5n</div><div class="meta-value">${nf['Uppdragsansvarig']}</div></div>
  <div class="meta-item"><div class="meta-label">Avtalsdatum</div><div class="meta-value">${fmtDate(nf['Avtalsdatum'])}</div></div>
  <div class="meta-item"><div class="meta-label">G\u00e4ller fr.o.m.</div><div class="meta-value">${fmtDate(nf['Avtalet g\u00e4ller ifr\u00e5n'])}</div></div>
  <div class="meta-item"><div class="meta-label">Upps\u00e4gningstid</div><div class="meta-value">${nf['Upps\u00e4gningstid'] != null ? nf['Upps\u00e4gningstid'] + '\u00a0m\u00e5nader' : '3\u00a0m\u00e5nader'}</div></div>
</div>

<div class="section">
  <div class="section-title">Arbetet omfattar f\u00f6ljande tj\u00e4nster</div>
  <div class="tjanster-grid">
    ${tjanster.length ? tjanster.map(t => `<div class="tjanst-item">&#9746;&nbsp;${t}</div>`).join('') : '<span style="font-size:9pt;color:#999;font-style:italic;">Inga tj\u00e4nster angivna</span>'}
    ${nf['\u00d6vrigt uppdrag'] ? `<div class="tjanst-item" style="min-width:100%;margin-top:2px;">&#9746;&nbsp;\u00d6vrigt: ${nf['\u00d6vrigt uppdrag']}</div>` : ''}
    ${includePrislista ? `<div class="tjanst-item" style="min-width:100%;margin-top:6px;color:#475569;font-style:italic;">
      Pris per tjänst framgår av bifogad prislista.
    </div>` : ''}
  </div>
</div>

<div class="section">
  <div class="section-title">Ers\u00e4ttning</div>
  <div class="check-row">
    ${nf['Ersättningsmodell'] === 'Löpande räkning' ? '&#9746;' : '&#9744;'}&nbsp; P\u00e5 l\u00f6pande r\u00e4kning &emsp;
    ${nf['Ersättningsmodell'] === 'Fast pris' ? '&#9746;' : '&#9744;'}&nbsp; Fast pris
  </div>
  ${nf['Arvode'] != null ? `
  <div class="arvode-box">
    <div class="arvode-label">Arvode per ${nf['Arvodesperiod'] || 'm\u00e5nad'} (exkl. moms)</div>
    <div class="arvode-value">${Number(nf['Arvode']).toLocaleString('sv-SE')} kr</div>
  </div>` : ''}
  ${nf['Arvodekommentar'] ? `<p style="font-size:8.5pt;color:#555;font-style:italic;margin-top:6px;">${nf['Arvodekommentar']}</p>` : ''}
  ${nf['Ersättningsmodell'] === 'Fast pris' ? `<div class="fastpris-note">Vid fast pris har byr\u00e5n d\u00e4rutöver r\u00e4tt till ers\u00e4ttning f\u00f6r kostnader och utl\u00e4gg som ans\u00f6knings- och registreringsavgifter, utl\u00e4gg f\u00f6r resor, kost, logi, porto, bud, etc. Till\u00e4ggsarbeten och \u00f6vertidsarbete p\u00e5 grund av f\u00f6rsenad eller ofullst\u00e4ndig materialleverans fr\u00e5n kunden, ej avtalade extraarbeten till f\u00f6ljd av lag\u00e4ndringar eller liknande \u00e4r aldrig inr\u00e4knade i det fasta priset utan ska ers\u00e4ttas separat.</div>` : ''}
</div>

<div class="section">
  <div class="section-title">Betalningsvillkor</div>
  <p class="betal-text">Betalning g\u00f6rs mot faktura. Fakturering sker ${nf['Fakturaperiod'] ? nf['Fakturaperiod'].toLowerCase() : 'l\u00f6pande'}. Betalning ska g\u00f6ras inom <strong>${nf['Betalningsvillkor'] || 10}&nbsp;dagar</strong> fr\u00e5n fakturadatum. Vid f\u00f6r sen betalning utg\u00e5r dr\u00f6jsm\u00e5lsr\u00e4nta enligt r\u00e4ntelagen.</p>
</div>

<!-- ═══════════ INFORMATION ═══════════ -->
<div class="section">
  <div class="section-title">Information</div>
  <div class="villkor-text">
    ${byraInformationstext ? informationstextToHtml(byraInformationstext) : `
    <h4 style="color:#1a1a2e;">Utf\u00f6rande</h4>
    <p>Uppdraget kommer att utf\u00f6ras i enlighet med den branschstandard som fastst\u00e4llts under Rex - Svensk standard f\u00f6r redovisningsuppdrag.</p>
    <p>Standarden har framtagits av branschorganisationen Srf konsulternas f\u00f6rbund. Standarden har som m\u00e5ls\u00e4ttning att uppn\u00e5 en h\u00f6g kvalitet p\u00e5 redovisningen och rapporteringen samt att det utf\u00f6rda arbetet utg\u00f6r ett bra beslutsunderlag i uppdragsgivarens verksamhet.</p>

    <h4 style="color:#1a1a2e;">Ansvar</h4>
    <p>Uppdragsgivaren har ett sj\u00e4lvst\u00e4ndigt ansvar f\u00f6r sin redovisning och rapportering mot myndigheter och utomst\u00e5ende. Det avser s\u00e5v\u00e4l brister i inl\u00e4mnade underlag som i rapporter d\u00e4r redovisningskonsulten har bitr\u00e4tt i arbetet. Detta f\u00f6ljer av lagstiftning och kan inte avtalas bort.</p>
    <p>Byr\u00e5n har ett utf\u00f6randeansvar mot uppdragsgivaren. Detta inneb\u00e4r att det arbete som omfattas av avtalet ska utf\u00f6ras enligt lagar och regler, samt enligt Rex - Svensk standard f\u00f6r redovisningsuppdrag.</p>

    <h4 style="color:#1a1a2e;">Uppdragsgivarens r\u00e4kenskapsinformation</h4>
    <p>Enligt kraven i bokf\u00f6ringslagen har uppdragsgivaren ansvar att bevara komplett r\u00e4kenskapsinformation i 7 \u00e5r efter r\u00e4kenskaps\u00e5rets utg\u00e5ng. Redovisningskonsulten ska upprätta och tillhandah\u00e5lla uppdragsgivaren den r\u00e4kenskapsinformation som f\u00f6ljer av uppdraget.</p>

    <h4 style="color:#1a1a2e;">Rapportmottagare</h4>
    <p>Den som \u00e4r angiven som kontaktperson hos uppdragsgivaren \u00e4r den som \u00e4r utsedd att mottaga den rapportering och \u00f6vrig kommunikation som sker fr\u00e5n byr\u00e5n till uppdragsgivaren. Kontaktpersonen ansvarar f\u00f6r att erh\u00e5llen information vidarebefordras till ber\u00f6rda personer inom sin organisation. Rapportering till annan \u00e4n angiven person kr\u00e4ver s\u00e4rskilt godk\u00e4nnande av uppdragsgivaren.</p>
    <p>Om inget avtalats f\u00e5r uppdragstagaren l\u00e4mna information till bolagets revisor i samband med revision.</p>

    <h4 style="color:#1a1a2e;">Kvalitetsuppf\u00f6ljning</h4>
    <p>Hos byr\u00e5n anst\u00e4llda Auktoriserade Redovisningskonsulter genomg\u00e5r minst vart sj\u00e4tte \u00e5r kvalitetsuppf\u00f6ljning som genomf\u00f6rs av Srf konsulternas f\u00f6rbund. Kvalitetsuppf\u00f6ljningen \u00e4r en granskning av att den Auktoriserade Redovisningskonsulten f\u00f6ljt Rex - Svensk standard f\u00f6r redovisningsuppdrag. Kvalitetsuppf\u00f6ljningen innefattas av tystnadplikt och sekretess. Kvalitetsuppf\u00f6ljningen inneb\u00e4r bl.a. att ett antal av byr\u00e5ns uppdrag kommer att granskas. Som underlag f\u00f6r kontrollen anv\u00e4nds ett antal transaktionsfiler fr\u00e5n bokf\u00f6ringssystemet. Filerna makuleras efter avslutad kvalitetsuppf\u00f6ljning. Uppdragsgivaren godk\u00e4nner genom detta avtal s\u00e5dan anv\u00e4ndning av material.</p>

    <h4 style="color:#1a1a2e;">Bilagor</h4>
    <p>Eventuella bilagor till uppdragsavtalet framg\u00e5r av bilagevalet p\u00e5 kundkortet och bifogas i den genererade PDF:en.</p>
    `}
  </div>
</div>

<!-- Bilaga 1 (Allmänna villkor) och Bilaga 2 (PUBA) borttagna — hanteras som valbara byråbilagor -->
<!-- ═══════════ SIDA 4: BILAGA 3 ═══════════ -->
<div style="display:${includePrislista ? 'block' : 'none'};">
<div class="page-break"></div>
<div class="section">
  <div class="section-title">Prislista</div>
  <div class="villkor-text">
    <p class="prislist-note"><strong>Giltighet:</strong> Denna prislista gäller vid uppdragsavtalets ingång. Prislistan revideras årligen. Vid ändring informeras kunden och uppdaterad prislista gäller från angivet datum om inte annat avtalas skriftligen.</p>
    <p class="prislist-note"><strong>Arvode:</strong> Arvode debiteras enligt gällande prislista om inte annat framgår av avtalets ersättningsmodell och eventuella särskilda villkor.</p>
  </div>

  <div style="margin-top:8px;">
    <div style="font-size:8pt;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:${ACCENT};margin:10px 0 6px;">Byråns tjänster</div>
    ${prislistaTjansterRows.length ? `
      <table class="prislista">
        <thead><tr><th style="width:58%;">Tjänst</th><th style="width:22%;">Pris</th><th style="width:20%;">Enhet</th></tr></thead>
        <tbody>
          ${prislistaTjansterRows.map(r => `<tr><td>${esc(r.namn)}</td><td>${esc(r.prisText)}</td><td>${esc(r.enhet || '—')}</td></tr>`).join('')}
        </tbody>
      </table>
    ` : `<div class="muted">Ingen prislista är ifylld för byråns tjänster.</div>`}
  </div>

  <div style="margin-top:14px;">
    <div style="font-size:8pt;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:${ACCENT};margin:10px 0 6px;">Övriga tjänster</div>
    ${prislistaFritextRows.length ? `
      <table class="prislista">
        <thead><tr><th style="width:58%;">Tjänst</th><th style="width:22%;">Pris</th><th style="width:20%;">Enhet</th></tr></thead>
        <tbody>
          ${prislistaFritextRows.map(r => `<tr><td>${esc(r.namn)}</td><td>${esc(r.prisText)}</td><td>${esc(r.enhet || '—')}</td></tr>`).join('')}
        </tbody>
      </table>
    ` : `<div class="muted">Inga övriga tjänster är ifyllda.</div>`}
  </div>
</div>
</div>

<!-- Underskrifter visas ej i PDF (signeras via BankID) -->

</body>
</html>`;

    const pup = loadPuppeteer();
    if (!pup) {
      return res.status(501).json({ error: 'PDF-generering ej tillgänglig (puppeteer saknas). Kör: npm install puppeteer-core @sparticuz/chromium' });
    }

    console.log('\ud83d\udda8\ufe0f Startar Puppeteer för PDF-generering...');
    const launchOpts = { args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'], headless: true, timeout: 30000 };
    if (chromium) launchOpts.executablePath = await chromium.executablePath();
    const browser = await pup.launch(launchOpts);
    console.log('\ud83d\udda8\ufe0f Puppeteer startat, öppnar sida...');
    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: 'networkidle0', timeout: 30000 });
    console.log('\ud83d\udda8\ufe0f Sida laddad, genererar PDF...');
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' }
    });
    await browser.close();
    console.log(`\u2705 PDF genererad: ${pdfBuffer.length} bytes`);

    // Slå ihop kundens egna bilagor (PDF) i samma PDF (append som extra sidor)
    let outPdfBuffer = Buffer.from(pdfBuffer);
    try {
      // Hitta "kundbilagor" i avtalsrecordet: attachment-fält vars namn innehåller "bilag"
      const customerBilagor = [];
      for (const [fieldName, v] of Object.entries(f || {})) {
        if (!/bilag/i.test(fieldName || '')) continue;
        if (!Array.isArray(v)) continue;
        for (const a of v) {
          const url = a?.url;
          const filename = a?.filename || a?.name || '';
          const isPdf = (a?.type && String(a.type).toLowerCase() === 'application/pdf') || /\.pdf$/i.test(String(filename));
          if (url && isPdf) customerBilagor.push({ url, filename: String(filename || 'bilaga.pdf') });
        }
      }

      if (customerBilagor.length) {
        const mainDoc = await PDFDocument.load(outPdfBuffer);
        const merged = await PDFDocument.create();
        const mainPages = await merged.copyPages(mainDoc, mainDoc.getPageIndices());
        mainPages.forEach(p => merged.addPage(p));

        for (const b of customerBilagor) {
          try {
            const fileRes = await axios.get(b.url, { responseType: 'arraybuffer', timeout: 30000 });
            const attBuf = Buffer.from(fileRes.data);
            const attDoc = await PDFDocument.load(attBuf);
            const attPages = await merged.copyPages(attDoc, attDoc.getPageIndices());
            attPages.forEach(p => merged.addPage(p));
          } catch (e) {
            console.warn('ℹ️ Kunde inte merga kundbilaga i PDF:', b.filename, e.message);
          }
        }

        const mergedBytes = await merged.save();
        outPdfBuffer = Buffer.from(mergedBytes);
        console.log(`✅ PDF efter kundbilagor: ${outPdfBuffer.length} bytes (kundbilagor: ${customerBilagor.length})`);
      }
    } catch (e) {
      console.warn('ℹ️ Kunde inte merga kundbilagor i PDF:', e.message);
    }

    // Merga valda byråbilagor (uppladdade på byråsidan, valda per kund på uppdragsavtalsfliken)
    try {
      const bilagorToMerge = (byraBilagorForPdf || []).filter(b => {
        if (!selectedByraBilagaIds.length && !defaultIncludeAllByraBilagor) return false;
        if (!selectedByraBilagaIds.length && defaultIncludeAllByraBilagor) return true;
        return selectedByraBilagaIds.includes(b.id);
      });

      if (bilagorToMerge.length) {
        console.log(`📎 Mergar ${bilagorToMerge.length} valda byråbilagor: ${bilagorToMerge.map(b => b.label).join(', ')}`);
        const mainDoc = await PDFDocument.load(outPdfBuffer);
        const merged = await PDFDocument.create();
        const mainPages = await merged.copyPages(mainDoc, mainDoc.getPageIndices());
        mainPages.forEach(p => merged.addPage(p));

        for (const b of bilagorToMerge) {
          try {
            const isPdf = /\.pdf$/i.test(b.filename) || true;
            if (!isPdf) continue;
            const fileRes = await axios.get(b.url, { responseType: 'arraybuffer', timeout: 30000 });
            const attBuf = Buffer.from(fileRes.data);
            const attDoc = await PDFDocument.load(attBuf, { ignoreEncryption: true });
            const attPages = await merged.copyPages(attDoc, attDoc.getPageIndices());
            attPages.forEach(p => merged.addPage(p));
            console.log(`  ✅ Bifogade byråbilaga: ${b.label} (${attPages.length} sidor)`);
          } catch (e) {
            console.warn(`  ⚠️ Kunde inte merga byråbilaga "${b.label}":`, e.message);
          }
        }

        const mergedBytes = await merged.save();
        outPdfBuffer = Buffer.from(mergedBytes);
        console.log(`✅ PDF efter byråbilagor: ${outPdfBuffer.length} bytes`);
      }
    } catch (e) {
      console.warn('ℹ️ Kunde inte merga byråbilagor i PDF:', e.message);
    }

    const safeNamn = (f['Kundnamn'] || 'kund').replace(/[^a-zA-Z0-9\u00e5\u00e4\u00f6\u00c5\u00c4\u00d6 -]/g, '').trim().replace(/\s+/g, '-');
    const datum = (f['Avtalsdatum'] || new Date().toISOString()).split('T')[0];
    const filename = `${safeNamn}-Uppdragsavtal-${datum}.pdf`;

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Content-Length': outPdfBuffer.length
    });
    res.send(Buffer.from(outPdfBuffer));

  } catch (error) {
    console.error('\u274c Error generating uppdragsavtal PDF:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/byra/lansstyrelsen-pdf – Generera samlad PDF för Länsstyrelsen (tillsyn)
app.post('/api/byra/lansstyrelsen-pdf', authenticateToken, async (req, res) => {
  try {
    const userData = await getAirtableUser(req.user.email);
    if (!userData) return res.status(404).json({ error: 'Användare hittades inte' });
    const byraId = userData.byraId ? String(userData.byraId).trim() : '';
    if (!byraId) return res.status(400).json({ error: 'Ingen byrå kopplad' });

    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
    const airtableBaseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
    const BYRAER_TBL = process.env.BYRAER_TABLE_ID || 'tblAIu1A83AyRTQ3B';
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '') || '';
    const baseUrl = process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`;

    const fmtDate = (d) => d ? new Date(d).toLocaleDateString('sv-SE') : '—';

    const [byraRes, tjansterRes, statRes, riskRes] = await Promise.all([
      axios.get(`https://api.airtable.com/v0/${airtableBaseId}/${BYRAER_TBL}?filterByFormula=${encodeURIComponent(`{Byrå ID}="${byraId}"`)}&maxRecords=1`, { headers: { Authorization: `Bearer ${airtableAccessToken}` } }),
      axios.get(`${baseUrl}/api/byra-tjanster?byraId=${encodeURIComponent(byraId)}`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => ({ data: { tjanster: [] } })),
      axios.get(`${baseUrl}/api/statistik-riskbedomning`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => ({ data: { antalKunder: 0, riskniva: {}, tjänster: [], högriskbransch: [], riskfaktorerPerTyp: [] } })),
      axios.get(`${baseUrl}/api/risk-factors`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => ({ data: { records: [] } }))
    ]);

    const byraRec = byraRes.data.records?.[0];
    const byraFields = { ...(byraRec?.fields || {}) };
    const riskKey = '4. Identifierade Risker och Sårbarheter';
    const riskRaw = byraFields[riskKey];
    if (riskRaw && typeof riskRaw === 'string') {
      if (/rec[A-Za-z0-9]{10,}/.test(riskRaw)) {
        const idMap = await buildTjanstIdToNamnMap(airtableAccessToken, airtableBaseId, byraId, riskRaw);
        byraFields[riskKey] = sanitizeIdentifieradeRiskerText(riskRaw, idMap);
      } else {
        byraFields[riskKey] = stripEmptyTjanstRiskSections(riskRaw);
      }
    }
    const byraNamn = byraFields['Byrå'] || byraFields['Namn'] || 'Byrån';
    const exportStamp = new Date().toLocaleString('sv-SE', { dateStyle: 'long', timeStyle: 'short' });
    const tjanster = (tjansterRes.data?.tjanster || []);
    const stat = statRes.data || {};
    const riskRecords = riskRes.data?.records || [];

    const escape = (s) => (s == null ? '' : String(s)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const nl2br = (s) => (s == null ? '' : String(s)).replace(/\n/g, '<br>');
    const richToHtml = (s) => {
      if (s == null || s === '') return '';
      let t = String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      t = t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      t = t.replace(/\*([^*]+?)\*/g, '<em>$1</em>');
      return t.replace(/\n/g, '<br>');
    };

    const ACCENT = '#2c4a8f';
    const htmlParts = [];

    htmlParts.push(`<div class="doc-page"><h1 class="doc-main-title">Byråns allmänna riskbedömning och rutiner</h1><p class="doc-meta">Byrå: ${escape(byraNamn)} | Exporterad: ${escape(exportStamp)}</p><p class="doc-meta">Dokumentation enligt penningtvättslagen (4 kap. 3 §) – för tillsyn och arkivering.</p></div>`);

    const rutinerFields = [
      ['1. Syfte och omfattning policy', '1. Syfte och omfattning policy'],
      ['2. Centralt Funktionsansvarig', '2. Centralt Funktionsansvarig '],
      ['3. Kundkännedomsåtgärder', '3. Kundkännedomsåtgärder '],
      ['4. Övervakning och Rapportering', '4. Övervakning och Rapportering '],
      ['5. Intern Kontroll', '5. Intern Kontroll '],
      ['6. Anställda och Utbildning', '6. Anställda och Utbildning'],
      ['7. Arkivering av dokumentation', '7. Arkivering av dokumentation'],
      ['8. Uppdatering och Utvärdering', '8. Uppdatering och Utvärdering '],
      ['9. Kommunikation', '9. Kommunikation'],
      ['10. Registrering Byrån', '10. Registrering Byrån ']
    ];
    const getByraField = (key) => byraFields[key] ?? byraFields[key?.trim()] ?? '';

    htmlParts.push(`<div class="doc-page"><h2>1. Byrårutiner</h2>`);
    for (const [label, airtableKey] of rutinerFields) {
      const val = getByraField(airtableKey) || '';
      htmlParts.push(`<h3>${escape(label)}</h3><div class="doc-text">${richToHtml(val || '—')}</div>`);
    }
    const policyRev = getByraField('Policydokumentet reviderat och godkänt') || '';
    htmlParts.push(`<p><strong>Policydokumentet reviderat och godkänt:</strong> ${escape(policyRev) || '—'}</p></div>`);

    const allmanKeys = ['1. Syfte och Omfattning', '2. Beskrivning av Byråns verksamhet', '3. Metod för Riskbedömning ', '4. Identifierade Risker och Sårbarheter', '5. Riskreducerande Åtgärder och Rutiner', '6. Utvärdering och Uppdatering', '7. Kommunikation.', '8. Värdering av sammantagen risk'];
    htmlParts.push(`<div class="doc-page"><h2>2. Allmän riskbedömning byrå</h2>`);
    for (const k of allmanKeys) {
      const val = getByraField(k) || '';
      htmlParts.push(`<h3>${escape(k)}</h3><div class="doc-text">${richToHtml(val || '—')}</div>`);
    }
    const uppdateradDatum = getByraField('Uppdaterad datum') || '';
    htmlParts.push(`<p><strong>Reviderad och godkänd:</strong> ${uppdateradDatum ? fmtDate(uppdateradDatum) : '—'}</p></div>`);

    const fullHtml = `<!DOCTYPE html><html lang="sv"><head><meta charset="UTF-8"><style>
      @page { size: A4; margin: 14mm; }
      @page landscape { size: A4 landscape; margin: 14mm; }
      body { font-family: Arial, sans-serif; font-size: 8pt; line-height: 1.4; color: #1a1a2e; margin: 0; padding: 12px; }
      .doc-page { page-break-after: always; }
      .doc-page:last-child { page-break-after: auto; }
      .doc-page-landscape { page: landscape; }
      .doc-main-title { color: ${ACCENT}; font-size: 12pt; margin-bottom: 6px; }
      .doc-meta { color: #666; font-size: 7pt; margin-bottom: 16px; }
      h2 { color: ${ACCENT}; font-size: 10pt; border-bottom: 1px solid ${ACCENT}; padding-bottom: 3px; margin-top: 10px; }
      h3 { font-size: 8.5pt; margin-top: 8px; }
      .doc-table { width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 7.5pt; }
      .doc-table th, .doc-table td { border: 1px solid #ddd; padding: 4px 6px; text-align: left; }
      .doc-table th { background: #f4f6fb; font-weight: 700; }
      .doc-text { margin: 6px 0; }
      .doc-text strong, .doc-text b, .doc-table strong, .doc-table b { font-weight: 700; }
      .doc-text em, .doc-text i, .doc-table em, .doc-table i { font-style: italic; }
      ul, p { margin: 4px 0; }
    </style></head><body>${htmlParts.join('')}</body></html>`;

    const pup = loadPuppeteer();
    if (!pup) return res.status(501).json({ error: 'PDF-generering ej tillgänglig (puppeteer saknas)' });
    const launchOpts = { args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'], headless: true, timeout: 30000 };
    if (chromium) launchOpts.executablePath = await chromium.executablePath();
    const browser = await pup.launch(launchOpts);
    const page = await browser.newPage();
    await page.setContent(fullHtml, { waitUntil: 'networkidle0', timeout: 30000 });
    const pdfBuffer = await page.pdf({ format: 'A4', preferCSSPageSize: true, printBackground: true, margin: { top: '15mm', right: '15mm', bottom: '15mm', left: '15mm' } });
    await browser.close();

    const datumIso = new Date().toISOString().split('T')[0];
    const safeByra = (byraNamn || 'byra').replace(/[^a-zA-Z0-9\u00e5\u00e4\u00f6\u00c5\u00c4\u00d6 -]/g, '').trim().replace(/\s+/g, '-');
    const filename = `Allman-riskbedomning-och-rutiner-${safeByra}-${datumIso}.pdf`;

    if (byraRec && byraRec.id) {
      try {
        await patchByraerFieldToAirtable(byraRec.id, 'Senast Länsstyrelsen-PDF export', new Date().toISOString().split('T')[0]);
      } catch (_) { /* fält finns kanske inte i Airtable */ }
    }

    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`, 'Content-Length': pdfBuffer.length });
    res.send(Buffer.from(pdfBuffer));
  } catch (error) {
    console.error('\u274c Länsstyrelsen PDF:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// DILISENSE — PEP & Sanktionsscreening
// ============================================================

// POST /api/pep-screening/:kundId
// Body: { namn, personnr, dob } — screena en person och spara PDF till dokumentationsfliken
app.post('/api/pep-screening/:kundId', authenticateToken, async (req, res) => {
    const { kundId } = req.params;
    const { namn, personnr, dob } = req.body;

    if (!namn) return res.status(400).json({ error: 'namn krävs' });

    const dilisenseKey = process.env.DILISENSE_API_KEY;
    if (!dilisenseKey || dilisenseKey === 'din_dilisense_api_nyckel') {
        return res.status(500).json({ error: 'DILISENSE_API_KEY är inte konfigurerad i .env' });
    }

    try {
        // Bygg query-parametrar
        const params = new URLSearchParams({ names: namn, fuzzy_search: '1' });
        if (dob) params.append('dob', dob);

        // 1. Hämta PDF-rapport från Dilisense
        const reportUrl = `https://api.dilisense.com/v1/generateIndividualReport?${params.toString()}`;
        console.log(`🔍 PEP-screening för: ${namn} → ${reportUrl}`);

        const reportRes = await axios.get(reportUrl, {
            headers: { 'x-api-key': dilisenseKey },
            responseType: 'text'
        });

        // Svaret är en base64-sträng (PDF)
        const rawPdfBase64 = reportRes.data;
        if (!rawPdfBase64 || typeof rawPdfBase64 !== 'string') {
            throw new Error('Inget PDF-svar från Dilisense');
        }
        const normalizePdfBase64 = (b64) => {
            const s = String(b64 || '').trim();
            if (!s) return '';
            const m = s.match(/^data:application\/pdf;base64,(.+)$/i);
            return (m ? m[1] : s).replace(/\s+/g, '');
        };
        let pdfBase64 = normalizePdfBase64(rawPdfBase64);
        if (!pdfBase64) throw new Error('Tom PDF från Dilisense');

        const token = process.env.AIRTABLE_ACCESS_TOKEN;
        const baseId = process.env.AIRTABLE_BASE_ID;
        const KUNDDATA_TABLE = 'tblOIuLQS2DqmOQWe';
        const datumStr = new Date().toISOString().split('T')[0];
        const filnamn = `PEP-screening_${namn.replace(/\s+/g, '_')}_${datumStr}.pdf`;

        // Hämta snabb JSON-sökning för att visa träffar i UI
        const checkUrl = `https://api.dilisense.com/v1/checkIndividual?${params.toString()}`;
        const checkRes = await axios.get(checkUrl, {
            headers: { 'x-api-key': dilisenseKey }
        });
        const checkData = checkRes.data;

        const totalHits = checkData.total_hits || 0;

        // Bygg "ClientFlow PEP-sammanfattning" (sida 1) och slå ihop med Dilisense-PDF (sida 2+)
        const buildPepSummaryPdf = async ({ namn, totalHits, foundRecords, timestampIso }) => {
            const doc = await PDFDocument.create();
            const font = await doc.embedFont(StandardFonts.Helvetica);
            const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
            const pageSize = [595.28, 841.89]; // A4

            const fmt = (s) => (s ? new Date(s).toLocaleString('sv-SE') : new Date().toLocaleString('sv-SE'));
            const safe = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();

            const wrapLines = (text, maxChars) => {
                const t = safe(text);
                if (!t) return [];
                const words = t.split(' ');
                const lines = [];
                let cur = '';
                for (const w of words) {
                    const next = cur ? (cur + ' ' + w) : w;
                    if (next.length <= maxChars) cur = next;
                    else {
                        if (cur) lines.push(cur);
                        cur = w;
                    }
                }
                if (cur) lines.push(cur);
                return lines;
            };

            let page = doc.addPage(pageSize);
            let y = 800;
            const x = 48;
            const line = (txt, opts = {}) => {
                page.drawText(String(txt || ''), { x, y, size: opts.size || 11, font: opts.bold ? fontBold : font, ...opts.draw });
                y -= (opts.gap || 16);
            };
            const ensureSpace = (need = 40) => {
                if (y > need) return;
                page = doc.addPage(pageSize);
                y = 800;
            };

            line('ClientFlow – PEP & sanktionsscreening (sammanfattning)', { size: 16, bold: true, gap: 22 });
            line(`Namn: ${safe(namn)}`, { size: 12, bold: true, gap: 18 });
            line(`Sökning utförd: ${fmt(timestampIso)}`, { size: 10, gap: 16 });
            line(`Antal träffar: ${Number(totalHits) || 0}`, { size: 12, bold: true, gap: 18 });

            const recs = Array.isArray(foundRecords) ? foundRecords : [];
            if (!recs.length) {
                line('Inga träffar hittades i snabbkontrollen.', { size: 11, gap: 18 });
                line('Bilaga: Dilisense-rapport (PDF) följer på nästa sida.', { size: 10, gap: 14 });
                return await doc.save();
            }

            line('Träffar (från snabbkontroll):', { size: 12, bold: true, gap: 18 });

            const maxItems = 25;
            const items = recs.slice(0, maxItems);
            for (let i = 0; i < items.length; i++) {
                const r = items[i] || {};
                ensureSpace(90);
                const name = safe(r.name);
                const src = safe(r.source_type);
                const pos = Array.isArray(r.positions) && r.positions.length ? safe(r.positions[0]) : '';
                const desc = Array.isArray(r.description) && r.description.length ? safe(r.description[0]) : '';

                line(`${i + 1}. ${name || '—'}${src ? ` (${src})` : ''}`, { size: 11, bold: true, gap: 14 });
                if (pos) {
                    for (const l of wrapLines(`Roll/position: ${pos}`, 92).slice(0, 3)) {
                        ensureSpace(40);
                        line(l, { size: 10, gap: 13 });
                    }
                }
                if (desc) {
                    for (const l of wrapLines(`Beskrivning: ${desc}`, 92).slice(0, 4)) {
                        ensureSpace(40);
                        line(l, { size: 10, gap: 13 });
                    }
                }
                y -= 6;
            }

            if (recs.length > maxItems) {
                ensureSpace(60);
                line(`(Visar ${maxItems} av ${recs.length} träffar. Se bilagan för mer information.)`, { size: 10, gap: 14 });
            } else {
                ensureSpace(60);
                line('Bilaga: Dilisense-rapport (PDF) följer på nästa sida.', { size: 10, gap: 14 });
            }

            return await doc.save();
        };

        try {
            const summaryBytes = await buildPepSummaryPdf({
                namn,
                totalHits,
                foundRecords: checkData.found_records || [],
                timestampIso: new Date().toISOString()
            });

            const reportBytes = Buffer.from(pdfBase64, 'base64');
            const reportDoc = await PDFDocument.load(reportBytes);
            const summaryDoc = await PDFDocument.load(summaryBytes);

            const merged = await PDFDocument.create();
            const sumPages = await merged.copyPages(summaryDoc, summaryDoc.getPageIndices());
            sumPages.forEach(p => merged.addPage(p));
            const repPages = await merged.copyPages(reportDoc, reportDoc.getPageIndices());
            repPages.forEach(p => merged.addPage(p));

            const mergedBytes = await merged.save();
            pdfBase64 = Buffer.from(mergedBytes).toString('base64');
        } catch (mergeErr) {
            console.warn('⚠️ Kunde inte bygga/merga ClientFlow-sammanfattning:', mergeErr.message);
            // Fallback: behåll original Dilisense-PDF
        }

        // Spara PDF till KUNDDATA (Attachments / PEP rapporter) om möjligt
        let savedToDocs = false;
        if (token && kundId) {
            try {
                const pdfBuffer = Buffer.from(pdfBase64, 'base64');
                savedToDocs = await uploadAttachmentToAirtable(token, baseId, kundId, pdfBuffer, filnamn, 'application/pdf', KUNDDATA_TABLE);
                if (!savedToDocs) {
                    const protocol = req.get('x-forwarded-proto') || req.protocol || (req.secure ? 'https' : 'http');
                    const host = req.get('x-forwarded-host') || req.get('host');
                    const reqBaseUrl = host ? `${protocol}://${host}` : null;
                    const fileUrl = await saveFileLocally(pdfBuffer, filnamn, 'application/pdf', reqBaseUrl);
                if (fileUrl) {
                    const custRes = await axios.get(
                        `https://api.airtable.com/v0/${baseId}/${KUNDDATA_TABLE}/${kundId}`,
                        { headers: { Authorization: `Bearer ${token}` } }
                    );
                    const f = custRes.data.fields || {};
                    const docFields = ['Attachments', 'PEP rapporter', 'PEP rapport', 'Dokumentation'];
                    for (const fieldName of docFields) {
                        try {
                            const existing = f[fieldName] || [];
                            const arr = Array.isArray(existing) ? [...existing] : [];
                            arr.push({ url: fileUrl, filename: filnamn });
                            await axios.patch(
                                `https://api.airtable.com/v0/${baseId}/${KUNDDATA_TABLE}/${kundId}`,
                                { fields: { [fieldName]: arr } },
                                { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
                            );
                            savedToDocs = true;
                            console.log('✅ PEP-rapport sparad i fält:', fieldName);
                            break;
                        } catch (patchErr) {
                            if (patchErr.response?.status === 422) continue;
                            if (!savedToDocs) console.warn('PATCH till', fieldName, ':', patchErr.message);
                        }
                    }
                }
                }
            } catch (saveErr) {
                console.warn('Kunde inte spara PEP-rapport till Airtable:', saveErr.message);
            }
        }

        console.log(`✅ PEP-screening klar: ${totalHits} träffar för ${namn}`);

        // PEP-status sätts av användaren på fliken Riskbedömning (Airtable), inte från rapporten.
        // Screening ger endast PDF + träffar i svaret; användaren bockar i PEP själv om det gäller.

        res.json({
            namn,
            total_hits: totalHits,
            found_records: checkData.found_records || [],
            pdf_base64: pdfBase64,
            filnamn,
            savedToDocs,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        const status = error.response?.status;
        const data = error.response?.data;
        console.error('❌ Fel vid PEP-screening:', status, data || error.message);

        if (status === 429) {
            return res.status(429).json({
                error: 'Dilisense API har nått sin gräns för antal anrop. Försök igen om några minuter.'
            });
        }
        res.status(status && status >= 400 && status < 500 ? status : 500).json({
            error: data?.error_message || data?.error || error.message || 'Okänt fel vid PEP-screening'
        });
    }
});

// POST /api/entity-screening/:kundId
// Body: { namn, orgnr } — screena ett företag/enhet och spara PDF till dokumentationsfliken
app.post('/api/entity-screening/:kundId', authenticateToken, async (req, res) => {
    const { kundId } = req.params;
    const { namn, orgnr } = req.body || {};

    if (!namn) return res.status(400).json({ error: 'namn krävs' });

    const dilisenseKey = process.env.DILISENSE_API_KEY;
    if (!dilisenseKey || dilisenseKey === 'din_dilisense_api_nyckel') {
        return res.status(500).json({ error: 'DILISENSE_API_KEY är inte konfigurerad i .env' });
    }

    try {
        const normalizePdfBase64 = (b64) => {
            const s = String(b64 || '').trim();
            if (!s) return '';
            const m = s.match(/^data:application\/pdf;base64,(.+)$/i);
            return (m ? m[1] : s).replace(/\s+/g, '');
        };
        const safeName = (s) => String(s || '').replace(/\s+/g, ' ').trim();
        const org = String(orgnr || '').trim();
        const orgDigits = org.replace(/\D/g, '');

        // 1) PDF-rapport (base64) för enhet (kräver names)
        const reportParams = new URLSearchParams({ names: namn });
        // fuzzy_search stöds enligt docs (exempel). Vi använder 1 som default.
        reportParams.append('fuzzy_search', '1');
        const reportUrl = `https://api.dilisense.com/v1/generateEntityReport?${reportParams.toString()}`;
        console.log(`🔍 Entity-screening (PDF) för: ${namn} → ${reportUrl}`);
        const reportRes = await axios.get(reportUrl, {
            headers: { 'x-api-key': dilisenseKey },
            responseType: 'text'
        });
        const rawPdfBase64 = reportRes.data;
        let pdfBase64 = normalizePdfBase64(rawPdfBase64);
        if (!pdfBase64) throw new Error('Inget PDF-svar från Dilisense (entity)');

        // 2) Snabb JSON-koll (för UI): använd orgnr om möjligt, annars namn
        const checkParams = new URLSearchParams();
        if (orgDigits) checkParams.append('search_all', orgDigits);
        else checkParams.append('names', namn);
        checkParams.append('fuzzy_search', '1');
        const checkUrl = `https://api.dilisense.com/v1/checkEntity?${checkParams.toString()}`;
        const checkRes = await axios.get(checkUrl, {
            headers: { 'x-api-key': dilisenseKey }
        });
        const checkData = checkRes.data || {};
        const totalHits = Number(checkData.total_hits || 0) || 0;

        // 3) Bygg sammanfattning (sida 1) + merge med Dilisense-PDF (sida 2+)
        const buildEntitySummaryPdf = async ({ namn, orgnr, totalHits, foundRecords, timestampIso }) => {
            const doc = await PDFDocument.create();
            const font = await doc.embedFont(StandardFonts.Helvetica);
            const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
            const pageSize = [595.28, 841.89]; // A4

            const fmt = (s) => (s ? new Date(s).toLocaleString('sv-SE') : new Date().toLocaleString('sv-SE'));
            const safe = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();

            const wrapLines = (text, maxChars) => {
                const t = safe(text);
                if (!t) return [];
                const words = t.split(' ');
                const lines = [];
                let cur = '';
                for (const w of words) {
                    const next = cur ? (cur + ' ' + w) : w;
                    if (next.length <= maxChars) cur = next;
                    else {
                        if (cur) lines.push(cur);
                        cur = w;
                    }
                }
                if (cur) lines.push(cur);
                return lines;
            };

            let page = doc.addPage(pageSize);
            let y = 800;
            const x = 48;
            const line = (txt, opts = {}) => {
                page.drawText(String(txt || ''), { x, y, size: opts.size || 11, font: opts.bold ? fontBold : font, ...opts.draw });
                y -= (opts.gap || 16);
            };
            const ensureSpace = (need = 40) => {
                if (y > need) return;
                page = doc.addPage(pageSize);
                y = 800;
            };

            line('ClientFlow – Sanktionsscreening företag/enhet (sammanfattning)', { size: 16, bold: true, gap: 22 });
            line(`Företag: ${safe(namn)}`, { size: 12, bold: true, gap: 18 });
            if (orgnr) line(`Orgnr: ${safe(orgnr)}`, { size: 10, gap: 16 });
            line(`Sökning utförd: ${fmt(timestampIso)}`, { size: 10, gap: 16 });
            line(`Antal träffar: ${Number(totalHits) || 0}`, { size: 12, bold: true, gap: 18 });

            const recs = Array.isArray(foundRecords) ? foundRecords : [];
            if (!recs.length) {
                line('Inga träffar hittades i snabbkontrollen.', { size: 11, gap: 18 });
                line('Bilaga: Dilisense-rapport (PDF) följer på nästa sida.', { size: 10, gap: 14 });
                return await doc.save();
            }

            line('Träffar (från snabbkontroll):', { size: 12, bold: true, gap: 18 });
            const maxItems = 25;
            const items = recs.slice(0, maxItems);
            for (let i = 0; i < items.length; i++) {
                const r = items[i] || {};
                ensureSpace(100);
                const nm = safe(r.name);
                const src = safe(r.source_type);
                const juris = Array.isArray(r.jurisdiction) && r.jurisdiction.length ? safe(r.jurisdiction[0]) : '';
                const addr = Array.isArray(r.address) && r.address.length ? safe(r.address.slice(0, 3).join(', ')) : '';
                const sanc = Array.isArray(r.sanction_details) && r.sanction_details.length ? safe(r.sanction_details[0]) : '';

                line(`${i + 1}. ${nm || '—'}${src ? ` (${src})` : ''}`, { size: 11, bold: true, gap: 14 });
                if (juris) for (const l of wrapLines(`Jurisdiktion: ${juris}`, 92).slice(0, 2)) { ensureSpace(40); line(l, { size: 10, gap: 13 }); }
                if (addr) for (const l of wrapLines(`Adress: ${addr}`, 92).slice(0, 2)) { ensureSpace(40); line(l, { size: 10, gap: 13 }); }
                if (sanc) for (const l of wrapLines(`Sanktionsdetaljer: ${sanc}`, 92).slice(0, 4)) { ensureSpace(40); line(l, { size: 10, gap: 13 }); }
                y -= 6;
            }

            if (recs.length > maxItems) {
                ensureSpace(60);
                line(`(Visar ${maxItems} av ${recs.length} träffar. Se bilagan för mer information.)`, { size: 10, gap: 14 });
            } else {
                ensureSpace(60);
                line('Bilaga: Dilisense-rapport (PDF) följer på nästa sida.', { size: 10, gap: 14 });
            }

            return await doc.save();
        };

        try {
            const summaryBytes = await buildEntitySummaryPdf({
                namn,
                orgnr: safeName(orgnr),
                totalHits,
                foundRecords: checkData.found_records || [],
                timestampIso: new Date().toISOString()
            });

            const reportBytes = Buffer.from(pdfBase64, 'base64');
            const reportDoc = await PDFDocument.load(reportBytes);
            const summaryDoc = await PDFDocument.load(summaryBytes);

            const merged = await PDFDocument.create();
            const sumPages = await merged.copyPages(summaryDoc, summaryDoc.getPageIndices());
            sumPages.forEach(p => merged.addPage(p));
            const repPages = await merged.copyPages(reportDoc, reportDoc.getPageIndices());
            repPages.forEach(p => merged.addPage(p));
            const mergedBytes = await merged.save();
            pdfBase64 = Buffer.from(mergedBytes).toString('base64');
        } catch (mergeErr) {
            console.warn('⚠️ Kunde inte bygga/merga Entity-sammanfattning:', mergeErr.message);
        }

        const token = process.env.AIRTABLE_ACCESS_TOKEN;
        const baseId = process.env.AIRTABLE_BASE_ID;
        const KUNDDATA_TABLE = 'tblOIuLQS2DqmOQWe';
        const datumStr = new Date().toISOString().split('T')[0];
        const filnamn = `Entity-screening_${String(namn).replace(/\s+/g, '_')}_${datumStr}.pdf`;

        // Spara PDF till KUNDDATA (Dokumentation/Attachments) om möjligt
        let savedToDocs = false;
        if (token && kundId) {
            try {
                const pdfBuffer = Buffer.from(pdfBase64, 'base64');
                savedToDocs = await uploadAttachmentToAirtable(token, baseId, kundId, pdfBuffer, filnamn, 'application/pdf', KUNDDATA_TABLE);
            } catch (saveErr) {
                console.warn('Kunde inte spara entity-rapport till Airtable:', saveErr.message);
            }
        }

        console.log(`✅ Entity-screening klar: ${totalHits} träffar för ${namn}`);

        return res.json({
            namn,
            orgnr: orgnr || '',
            total_hits: totalHits,
            found_records: checkData.found_records || [],
            pdf_base64: pdfBase64,
            filnamn,
            savedToDocs,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        const status = error.response?.status;
        const data = error.response?.data;
        console.error('❌ Fel vid Entity-screening:', status, data || error.message);
        if (status === 429) {
            return res.status(429).json({
                error: 'Dilisense API har nått sin gräns för antal anrop. Försök igen om några minuter.'
            });
        }
        return res.status(status && status >= 400 && status < 500 ? status : 500).json({
            error: data?.error_message || data?.error || error.message || 'Okänt fel vid entity-screening'
        });
    }
});

// ============================================================
// INLEED DOCSIGN — Skicka uppdragsavtal för BankID-signering
// ============================================================

// POST /api/uppdragsavtal/:id/skicka-for-signering
// Body: { signerare: { namn, epost, personnr, telefon? } | [{ namn, epost, personnr, telefon? }, ...] }
// Skickar till BÅDE kund OCH inloggad konsult – alla måste signera
app.post('/api/uppdragsavtal/:id/skicka-for-signering', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    let { signerare } = req.body;
    const signerareList = Array.isArray(signerare) ? signerare : (signerare && signerare.namn && signerare.epost ? [signerare] : []);

    if (signerareList.length === 0 || signerareList.some(s => !s.namn || !s.epost)) {
      return res.status(400).json({ error: 'Välj minst en signerare med namn och e-post.' });
    }

    const docsignApiKey = process.env.DOCSIGN_API_KEY;
    if (!docsignApiKey) {
      return res.status(500).json({ error: 'DOCSIGN_API_KEY saknas i milj\u00f6variablerna.' });
    }

    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;

    // Hämta inloggad konsult (ansvarig) för signering
    let inloggedUser = await getAirtableUser(req.user.email);
    if (!inloggedUser || !inloggedUser.email) {
      // Fallback: använd JWT-payload – användaren är autentiserad och har loggat in
      if (req.user?.email) {
        inloggedUser = {
          id: req.user.id,
          email: req.user.email,
          name: req.user.name || req.user.email.split('@')[0],
          byra: req.user.byra || 'Byrån'
        };
      }
    }
    if (!inloggedUser || !inloggedUser.email) {
      return res.status(400).json({ error: 'Kunde inte hämta inloggad användare – konsulten måste vara känd för signering.' });
    }

    // 1. Hämta avtalsinformation från Airtable
    const avtalRes = await axios.get(
      `https://api.airtable.com/v0/${airtableBaseId}/${UPPDRAGSAVTAL_TABLE}/${id}`,
      { headers: { Authorization: `Bearer ${airtableAccessToken}` } }
    );
    const avtalFields = avtalRes.data.fields || {};
    const kundnamn = avtalFields['Kundnamn'] || avtalFields['Namn'] || 'Kund';

    // 2. Generera PDF via intern anrop
    console.log('📄 Genererar PDF för signering, avtal:', id);
    let pdfBuffer;
    try {
      const internalHeaders = {};
      if (req.headers.authorization) {
        internalHeaders['Authorization'] = req.headers.authorization;
      }
      if (req.cookies?.authToken) {
        internalHeaders['Cookie'] = `authToken=${req.cookies.authToken}`;
      }
      const pdfRes = await axios.post(
        `http://localhost:${process.env.PORT || 3001}/api/uppdragsavtal/${id}/pdf`,
        {},
        {
          responseType: 'arraybuffer',
          headers: internalHeaders,
          timeout: 60000
        }
      );
      pdfBuffer = Buffer.from(pdfRes.data);
      console.log('✅ PDF genererad för signering:', pdfBuffer.length, 'bytes');
    } catch (pdfErr) {
      const errBody = pdfErr.response?.data ? Buffer.from(pdfErr.response.data).toString('utf8').substring(0, 500) : '';
      console.error('❌ PDF-generering misslyckades:', pdfErr.message, '| Status:', pdfErr.response?.status, '| Body:', errBody);
      return res.status(500).json({ error: 'Kunde inte generera PDF för signering.', details: errBody || pdfErr.message });
    }

    // 3. Skapa undertecknare i Inleed: först konsult (byrå), sedan kund
    const konsultPayload = {
      api_key: docsignApiKey,
      name: inloggedUser.name || req.user.email.split('@')[0],
      email: inloggedUser.email,
      company: inloggedUser.byra || 'Byrån',
      sign_method: 'bankid',
      external_id: `konsult-${inloggedUser.id}-${(inloggedUser.email || '').replace(/[^a-zA-Z0-9@._-]/g, '_')}`,
      debug: false
    };
    console.log('📤 Skapar konsult som undertecknare i Inleed:', konsultPayload.name, konsultPayload.email);
    const konsultPartyRes = await axios.post('https://docsign.se/api/parties', konsultPayload, {
      headers: { 'Content-Type': 'application/json' }
    });
    if (!konsultPartyRes.data?.success) {
      console.error('❌ Inleed konsult-party fel:', konsultPartyRes.data);
      return res.status(500).json({ error: 'Kunde inte skapa konsult som undertecknare.', details: konsultPartyRes.data });
    }
    const konsultPartyId = konsultPartyRes.data.party_id;
    console.log('✅ Konsult skapad som undertecknare, party_id:', konsultPartyId);

    const kundPartyIds = [];
    for (const s of signerareList) {
      const kundPartyPayload = {
        api_key: docsignApiKey,
        name: s.namn,
        email: s.epost,
        company: kundnamn,
        sign_method: 'bankid',
        external_id: `kund-${(s.personnr || 'x')}-${(s.epost || '').replace(/[^a-zA-Z0-9@._-]/g, '_')}-${Date.now()}`,
        debug: false
      };
      if (s.telefon) kundPartyPayload.phone_number = s.telefon;
      console.log('📤 Skapar kund som undertecknare i Inleed:', kundPartyPayload.name, kundPartyPayload.email);
      const kundPartyRes = await axios.post('https://docsign.se/api/parties', kundPartyPayload, {
        headers: { 'Content-Type': 'application/json' }
      });
      if (!kundPartyRes.data?.success) {
        console.error('❌ Inleed kund-party fel:', kundPartyRes.data);
        return res.status(500).json({ error: `Kunde inte skapa ${s.namn} som undertecknare.`, details: kundPartyRes.data });
      }
      kundPartyIds.push(kundPartyRes.data.party_id);
    }
    console.log('✅ Kundsignerare skapade:', kundPartyIds);

    // 4. Skapa dokument i Inleed med alla parter – konsult först, sedan alla kunder
    const pdfBase64 = pdfBuffer.toString('base64');
    const docPayload = {
      api_key: docsignApiKey,
      name: `Uppdragsavtal - ${kundnamn}`,
      parties: [konsultPartyId, ...kundPartyIds],
      send_reminders: true,
      send_receipt: true,
      attachments: [{
        name: 'uppdragsavtal.pdf',
        base64_content: pdfBase64
      }]
    };

    // 4b. Lägg till kundens egna bilagor (PDF) i DocSign (attachment-fält vars namn innehåller "bilag")
    try {
      const customerBilagor = [];
      for (const [fieldName, v] of Object.entries(avtalFields || {})) {
        if (!/bilag/i.test(fieldName || '')) continue;
        if (!Array.isArray(v)) continue;
        for (const a of v) {
          const url = a?.url;
          const filename = a?.filename || a?.name || '';
          const isPdf = (a?.type && String(a.type).toLowerCase() === 'application/pdf') || /\.pdf$/i.test(String(filename));
          if (url && isPdf) customerBilagor.push({ url, filename: String(filename || 'bilaga.pdf') });
        }
      }

      for (const b of customerBilagor) {
        try {
          const fileRes = await axios.get(b.url, { responseType: 'arraybuffer', timeout: 30000 });
          const buf = Buffer.from(fileRes.data);
          const attName = safeFilenameFromLabel(b.filename || 'Bilaga', 'bilaga', 'pdf');
          docPayload.attachments.push({
            name: attName,
            base64_content: buf.toString('base64')
          });
        } catch (e) {
          console.warn('ℹ️ Kunde inte hämta kundbilaga för DocSign:', b.filename, e.message);
        }
      }
    } catch (e) {
      console.warn('ℹ️ Kunde inte lägga till kundbilagor i DocSign:', e.message);
    }

    console.log('📤 Skapar dokument i Inleed för:', kundnamn, '| PDF:', pdfBuffer.length, 'bytes | Konsult:', konsultPartyId, 'Kunder:', kundPartyIds);

    const docRes = await axios.post('https://docsign.se/api/documents', docPayload, {
      headers: { 'Content-Type': 'application/json' }
    });

    console.log('\ud83d\udd0d Inleed documents svar:', JSON.stringify(docRes.data));

    if (!docRes.data?.success) {
      console.error('\u274c Inleed documents fel:', docRes.data);
      return res.status(500).json({ error: 'Kunde inte skapa dokument i Inleed.', details: docRes.data });
    }

    const documentId = docRes.data.document_id;
    console.log('\u2705 Dokument skapat i Inleed, document_id:', documentId);

    const utskickningsdatum = new Date().toISOString().split('T')[0];
    // 5. Uppdatera avtalsstatus, InleedDokumentId och Utskickningsdatum i Airtable
    const patchFields = {
      Avtalsstatus: 'Skickat till kund',
      InleedDokumentId: String(documentId),
      Utskickningsdatum: utskickningsdatum
    };
    try {
      await axios.patch(
        `https://api.airtable.com/v0/${airtableBaseId}/${UPPDRAGSAVTAL_TABLE}/${id}`,
        { fields: patchFields },
        { headers: { Authorization: `Bearer ${airtableAccessToken}`, 'Content-Type': 'application/json' } }
      );
      console.log('\u2705 Airtable uppdaterad: Avtalsstatus, InleedDokumentId, Utskickningsdatum');
    } catch (e) {
      console.error('\u274c Airtable PATCH misslyckades:', e.response?.status, e.response?.data?.error || e.message);
      if (e.response?.status === 422) {
        console.error('   Fel:', JSON.stringify(e.response?.data, null, 2));
      }
      return res.status(500).json({
        error: 'Kunde inte uppdatera avtalet i Airtable.',
        details: e.response?.data?.error?.message || e.message
      });
    }

    res.json({
      success: true,
      document_id: documentId,
      party_ids: [konsultPartyId, ...kundPartyIds],
      message: `Uppdragsavtalet har skickats till konsult (${inloggedUser.email}) och ${signerareList.length} kundsignerare f\u00f6r BankID-signering.`
    });

  } catch (error) {
    console.error('\u274c Fel vid skicka-f\u00f6r-signering:');
    console.error('  Message:', error.message);
    console.error('  Status:', error.response?.status);
    console.error('  Data:', JSON.stringify(error.response?.data));
    console.error('  Stack:', error.stack?.split('\n').slice(0,3).join(' | '));
    res.status(500).json({
      error: error.response?.data?.message || error.message,
      details: error.response?.data
    });
  }
});

// POST /api/uppdragsavtal/:id/hamta-signerat
// Hämtar signerat dokument från Inleed och sparar till Dokumentation
app.post('/api/uppdragsavtal/:id/hamta-signerat', authenticateToken, async (req, res) => {
  const KUNDDATA_TABLE = 'tblOIuLQS2DqmOQWe';
  try {
    const { id: avtalId } = req.params;
    const docsignApiKey = process.env.DOCSIGN_API_KEY;
    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;

    if (!docsignApiKey || !airtableAccessToken) {
      return res.status(500).json({ error: 'DOCSIGN_API_KEY eller Airtable-token saknas.' });
    }

    const avtalRes = await axios.get(
      `https://api.airtable.com/v0/${airtableBaseId}/${UPPDRAGSAVTAL_TABLE}/${avtalId}`,
      { headers: { Authorization: `Bearer ${airtableAccessToken}` } }
    );
    const avtalFields = avtalRes.data.fields || {};
    const inleedDocId = avtalFields['InleedDokumentId'];
    const kundId = avtalFields['KundID'];

    if (!inleedDocId || !kundId) {
      return res.status(400).json({ error: 'Avtalet saknar Inleed-dokument-ID eller KundID.' });
    }

    const userData = await getAirtableUser(req.user.email);
    if (!userData) return res.status(404).json({ error: 'Användare hittades inte.' });
    const custByraId = avtalFields['Byra ID'] || avtalFields['Byrå ID'] || '';
    if (userData.role !== 'ClientFlowAdmin' && String(custByraId) !== String(userData.byraId || '')) {
      return res.status(403).json({ error: 'Ingen behörighet för denna kund.' });
    }

    const docsRes = await axios.get('https://docsign.se/api/documents', {
      params: { api_key: docsignApiKey, state: 'completed' },
      headers: { 'Content-Type': 'application/json' }
    });

    const docs = Array.isArray(docsRes.data) ? docsRes.data : [];
    const doc = docs.find(d => String(d.id) === String(inleedDocId));
    if (!doc || !doc.signed_pdf_url) {
      return res.status(404).json({
        error: 'Dokumentet är ännu inte färdigsignerat.',
        hint: 'Kontrollera att både konsult och kund har signerat i Inleed.'
      });
    }

    const kundnamn = avtalFields['Kundnamn'] || avtalFields['Namn'] || 'Kund';
    const datumStr = new Date().toISOString().split('T')[0];
    const filnamn = `Uppdragsavtal-signerat_${(kundnamn || 'kund').replace(/\s+/g, '_')}_${datumStr}.pdf`;

    const pdfRes = await axios.get(doc.signed_pdf_url, { responseType: 'arraybuffer' });
    const pdfBuffer = Buffer.from(pdfRes.data);

    const custRes = await axios.get(
      `https://api.airtable.com/v0/${airtableBaseId}/${KUNDDATA_TABLE}/${kundId}`,
      { headers: { Authorization: `Bearer ${airtableAccessToken}` } }
    );
    const f = custRes.data.fields || {};
    const docFields = ['Dokumentation', 'Attachments', 'PEP rapporter', 'PEP rapport', 'Riskbedömning dokument', 'Riskbedomning dokument'];
    let saved = false;

    // Försök alltid Airtable Content API först (fungerar både lokalt och på Render)
    saved = await uploadAttachmentToAirtable(airtableAccessToken, airtableBaseId, kundId, pdfBuffer, filnamn, 'application/pdf', KUNDDATA_TABLE);
    if (!saved) {
      const baseUrl = process.env.PUBLIC_BASE_URL || (req.get('host') ? `${req.protocol}://${req.get('host')}` : null);
      const fileUrl = await saveFileLocally(pdfBuffer, filnamn, 'application/pdf', baseUrl);
      if (fileUrl) {
        for (const fieldName of docFields) {
          try {
            const existing = f[fieldName] || [];
            const arr = Array.isArray(existing) ? [...existing] : [];
            arr.push({ url: fileUrl, filename: filnamn });
            await axios.patch(
              `https://api.airtable.com/v0/${airtableBaseId}/${KUNDDATA_TABLE}/${kundId}`,
              { fields: { [fieldName]: arr } },
              { headers: { Authorization: `Bearer ${airtableAccessToken}`, 'Content-Type': 'application/json' } }
            );
            saved = true;
            console.log('✅ Signerat uppdragsavtal sparad i fält:', fieldName);
            break;
          } catch (e) {
            if (e.response?.status === 422) continue;
          }
        }
      }
    }

    if (saved) {
      await axios.patch(
        `https://api.airtable.com/v0/${airtableBaseId}/${UPPDRAGSAVTAL_TABLE}/${avtalId}`,
        { fields: { Avtalsstatus: 'Signerat', Signeringsdatum: datumStr } },
        { headers: { Authorization: `Bearer ${airtableAccessToken}`, 'Content-Type': 'application/json' } }
      ).catch(() => {});

      // Spara kategori-metadata så dokumentet visas under rätt rubrik
      try {
        let kategorier = [];
        const raw = (f['Dokumentation Kategorier'] || '').toString().trim();
        if (raw) kategorier = JSON.parse(raw);
        if (!Array.isArray(kategorier)) kategorier = [];
        kategorier.push({ filename: filnamn, category: 'uppdragsavtal' });
        await axios.patch(
          `https://api.airtable.com/v0/${airtableBaseId}/${KUNDDATA_TABLE}/${kundId}`,
          { fields: { 'Dokumentation Kategorier': JSON.stringify(kategorier) } },
          { headers: { Authorization: `Bearer ${airtableAccessToken}`, 'Content-Type': 'application/json' } }
        );
      } catch (_) {}
    }

    res.json({
      success: saved,
      message: saved ? 'Signerat uppdragsavtal har sparats på fliken Dokumentation.' : 'Kunde inte spara dokumentet.',
      savedToDocs: saved
    });
  } catch (error) {
    console.error('❌ Fel vid hämta-signerat:', error.message);
    res.status(500).json({ error: error.message || 'Okänt fel.' });
  }
});

// ============================================================
// POST /api/ai-riskbedomning/:kundId
// Genererar AI-baserad riskbedömning och åtgärdsförslag
// ============================================================
app.post('/api/ai-riskbedomning/:kundId', authenticateToken, async (req, res) => {
  const { kundId } = req.params;
  const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
  const openaiKey = process.env.OPENAI_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;
  const RISKER_TABLE = 'tblWw6tM2YOTYFn2H'; // Risker kopplade till kunden

  if (!openaiKey) return res.status(500).json({ error: 'OPENAI_API_KEY saknas.' });
  if (!process.env.OPENAI_ASSISTANT_ID) return res.status(500).json({ error: 'OPENAI_ASSISTANT_ID saknas.' });

  try {
    const kundRes = await axios.get(
      `https://api.airtable.com/v0/${baseId}/KUNDDATA/${kundId}`,
      { headers: { Authorization: `Bearer ${airtableAccessToken}` } }
    );
    const f = kundRes.data.fields || {};

    const arr = (v) => Array.isArray(v) ? v.join(', ') : (v || '–');

    // Hämta kundens valda tjänster (samma tabell som byråns tjänstanalys: "Risker kopplad till tjänster") + länkade riskposter
    let tjansterText = '–';
    /** Byråns sparade analys per tjänst — endast poster som ligger i "Kundens utvalda tjänster" */
    let byraValdaTjansterDetaljText = '  (Inga tjänster är valda för kunden — inget byråunderlag per tjänst att visa.)';
    let lankadeRiskerText = '';

    const tjansterTableEnc = encodeURIComponent(RISK_ASSESSMENT_TABLE);

    await Promise.all([
      // Tjänster + byråns fält (analys, risknivå, åtgärder) endast för valda tjänst-ID:n
      (async () => {
        try {
          const tjansterIds = f['Kundens utvalda tjänster'] || [];
          if (Array.isArray(tjansterIds) && tjansterIds.length > 0) {
            const expanded = await Promise.all(tjansterIds.map(async (id) => {
              try {
                const r = await axios.get(
                  `https://api.airtable.com/v0/${baseId}/${tjansterTableEnc}/${id}`,
                  { headers: { Authorization: `Bearer ${airtableAccessToken}` } }
                );
                const tf = r.data.fields || {};
                const namn = (tf['Task Name'] || '').trim() || id;
                return { namn, tf };
              } catch {
                return null;
              }
            }));
            const ok = expanded.filter(Boolean);
            if (ok.length > 0) {
              tjansterText = ok.map((x) => x.namn).join(', ');
              const parseJsonArr = (v) => {
                if (!v) return [];
                if (Array.isArray(v)) return v;
                try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; }
              };
              byraValdaTjansterDetaljText = ok.map(({ namn, tf }) => {
                const typ = (tf['TJÄNSTTYP'] || '').trim();
                const tjBeskr = (tf['Tjänstebeskrivning'] || '').trim();
                const brf = (tf['Beskrivning av riskfaktor'] || '').trim();
                const risk = (tf['Riskbedömning'] || '').trim();
                const atgLegacy = (tf['Åtgjärd'] || '').trim();
                const hot = parseJsonArr(tf['Hot']);
                const sarbarheter = parseJsonArr(tf['Sårbarheter']);
                const atgarder = parseJsonArr(tf['Tjänstespecifika åtgärder']);

                let line = `  • ${namn}${typ ? ` (${typ})` : ''}`;
                if (tjBeskr) line += `\n    Tjänstebeskrivning: ${tjBeskr}`;
                if (brf) line += `\n    Byråns beskrivning av riskfaktor: ${brf}`;
                if (risk) line += `\n    Byråns riskbedömning för tjänsten: ${risk}`;
                if (hot.length) {
                  line += `\n    Hot (penningtvätt/terrorfinansiering) kopplade till tjänsten:`;
                  hot.forEach(h => {
                    const t = (h && (h.typ || '')).toString().toUpperCase() === 'TF' ? 'TF' : 'PT';
                    const titel = (h && h.titel || '').toString().trim();
                    const besk = (h && h.beskrivning || '').toString().trim();
                    if (titel || besk) line += `\n      - [${t}] ${titel}${besk ? `: ${besk}` : ''}`;
                  });
                }
                if (sarbarheter.length) {
                  line += `\n    Sårbarheter/riskfaktorer kopplade till tjänsten:`;
                  sarbarheter.forEach(s => {
                    const kat = (s && s.kategori || '').toString().trim();
                    const titel = (s && s.titel || '').toString().trim();
                    const besk = (s && s.beskrivning || '').toString().trim();
                    if (titel || besk) line += `\n      - ${kat ? `[${kat}] ` : ''}${titel}${besk ? `: ${besk}` : ''}`;
                  });
                }
                if (atgarder.length) {
                  line += `\n    Byråns tjänstespecifika åtgärder:`;
                  atgarder.forEach(a => {
                    const titel = (a && a.titel || '').toString().trim();
                    const besk = (a && a.beskrivning || '').toString().trim();
                    if (titel || besk) line += `\n      - ${titel}${besk ? `: ${besk}` : ''}`;
                  });
                } else if (atgLegacy) {
                  line += `\n    Byråns åtgärder kopplade till tjänsten: ${atgLegacy}`;
                }
                return line;
              }).join('\n\n');
            }
          }
        } catch (e) { /* ignorera */ }
      })(),

      // Länkade riskposter (per tjänst och riskfaktortyp)
      (async () => {
        try {
          const linkedIds = f['risker kopplat till tjänster'] || [];
          if (Array.isArray(linkedIds) && linkedIds.length > 0) {
            const formula = encodeURIComponent('OR(' + linkedIds.map(id => `RECORD_ID()="${id}"`).join(',') + ')');
            const riskRes = await axios.get(
              `https://api.airtable.com/v0/${baseId}/${RISKER_TABLE}?filterByFormula=${formula}`,
              { headers: { Authorization: `Bearer ${airtableAccessToken}` } }
            );
            const riskPoster = riskRes.data.records || [];
            if (riskPoster.length > 0) {
              lankadeRiskerText = riskPoster.map(r => {
                const rf = r.fields;
                const namn = rf['Riskfaktor'] || '–';
                const typ = rf['Typ av riskfaktor'] || '';
                const niva = rf['Riskbedömning'] || '';
                const beskr = rf['Beskrivning'] || '';
                const atg = rf['Åtgjärd'] || '';
                return `  • ${namn}${typ ? ` [${typ}]` : ''}${niva ? ` — ${niva}` : ''}` +
                  (beskr ? `\n    Beskrivning: ${beskr}` : '') +
                  (atg ? `\n    Åtgärd: ${atg}` : '');
              }).join('\n');
            }
          }
        } catch (e) { /* ignorera */ }
      })()
    ]);

    // Syfte (fritext) — tjänster hanteras separat i kanonisk lista nedan
    const syfteRaw = arr(f['Syfte med affärsförbindelsen']);
    const tjansterTrim = String(tjansterText || '').trim();
    const tjansterListaCanonical =
      !tjansterTrim || tjansterTrim === '–'
        ? 'Inga tjänster är kopplade till kunden i ClientFlow (fältet "Kundens utvalda tjänster" är tomt).'
        : tjansterTrim;

    // Anonymiserat underlag till AI: inget kundnamn/orgnr; beskrivningsfält i sin helhet (inkl. namn användaren skrivit där)
    const rawBesk = f['Beskrivning av kunden'];
    const beskrivningKundFull =
      rawBesk == null || String(rawBesk).trim() === '' ? '–' : String(rawBesk);
    const rawExtra = f['Ytterligare beskrivning av kunden och verksamheten'];
    const beskrivningExtraFull =
      rawExtra == null || String(rawExtra).trim() === '' ? '–' : String(rawExtra);
    const verkligHuvudmanAnon = (() => {
      const v = f['Verklig huvudman'];
      if (v == null || String(v).trim() === '' || String(v).trim() === '–') return '–';
      return 'Uppgift finns i ClientFlow (namn/identifierare skickas inte till AI)';
    })();

    const pepStatus = arr(f['PEP']);
    const pepTraffar = f['Antal träffar PEP och sanktionslistor'] ?? '–';

    const sparadRiskniva = f['Riskniva'] || '';
    const sparadBedomning = (f['Byrans riskbedomning'] || '').trim();
    const sparadeAtgarder = (f['Atgarder riskbedomning'] || '').trim();
    const harSparadBedomning = sparadBedomning.length > 0 || sparadeAtgarder.length > 0;

    const prompt = `Du är en erfaren AML/KYC-specialist på en svensk redovisningsbyrå.
Analysera SAMTLIGA nedanstående kunduppgifter och gör en professionell riskbedömning enligt PVML (Penningtvättslagen).
Väg in all tillgänglig information — varje ifyllt fält bidrar till helhetsbilden av kunden.
${harSparadBedomning ? `
BEFINTLIG BEDÖMNING: Byrån har redan sparade texter för denna kund. Ta hänsyn till dem och förfina/uppdatera istället för att skriva om från noll. Behåll formuleringar som fortfarande stämmer.
- Sparad risknivå: ${sparadRiskniva || '–'}
- Sparad riskbedömning: ${sparadBedomning || '–'}
- Sparade åtgärder: ${sparadeAtgarder || '–'}
` : ''}

VIKTIGT: Syftet med affärsförbindelsen ska stämma med underlaget nedan. Nämn endast tjänster enligt reglerna under "TJÄNSTLISTA".
Skriv på enkel, korrekt svenska. Undvik “intern logik/UI-termer” som kryss/bockat/markerat/flik/formulär och hänvisa aldrig till hur informationen valts i systemet — beskriv istället fakta.
Använd inte fraser som “Detta är utan PEP-status” eller “som kryss särskilt högrisk”. Skriv hellre t.ex. “Inga PEP-indikationer har noterats” och “Tjänsterna omfattar … vilket bedöms riskhöjande”.

KUNSKAPSBAS (vector store / file_search — om tillgängligt i denna körning):
- Om du har tillgång till uppladdade dokument via file_search: använd dem ENBART för generell vägledning om PVML och vedertagen praxis (metodik, kontrollfrekvens, vägledning). Det är ett komplement till — inte ersättning för — kundens faktiska uppgifter nedan.
- KRITISKT: Kunskapsbasen kan innehålla information om tjänster och risker som gäller byråns GENERELLA riskbedömning (alla tjänster byrån erbjuder). Applicera ALDRIG denna information på den enskilda kunden om tjänsten inte finns i kundens TJÄNSTLISTA nedan. T.ex. om kunskapsbasen nämner ROT/RUT som en generell risk för byrån, men kunden inte har ROT/RUT i sin tjänstlista — nämn det INTE.
- Koppla resonemanget till kundunderlaget; hitta inte på kundspecifika fakta bara för att något liknar ett dokument.
- Om sökningen inte ger relevant träff: fortsätt utifrån fälten nedan och dessa regler.

TJÄNSTLISTA — ENDA AUKTORITATIVA KÄLLAN FÖR VILKA TJÄNSTER BYRÅN UTFÖR ÅT DENNA KUND I CLIENTFLOW:
${tjansterListaCanonical}
REGLER FÖR TJÄNSTER (KRITISKT — BROTT MOT DESSA REGLER GER FELAKTIG RISKBEDÖMNING):
- Du får ENBART nämna konkreta tjänster som (1) står i TJÄNSTLISTA ovan ordagrant, ELLER (2) uttryckligen framgår i fältet "Byråns beskrivning av kunden" eller "Ytterligare beskrivning av kunden och verksamheten" nedan.
- TOTALFÖRBUD: Nämn ALDRIG tjänster som ROT/RUT, bokslut, årsredovisning, deklaration, lönehantering eller andra tjänster om de INTE finns i TJÄNSTLISTA eller i beskrivningarna ovan. Att en tjänst är vanlig i branschen är INTE skäl att nämna den.
- Analysera ALDRIG risk kopplad till tjänster som kunden inte har. Om kunden t.ex. inte har ROT/RUT i sin tjänstlista, får du under inga omständigheter diskutera ROT/RUT-relaterade risker.
- Om tjänstlistan säger att inga tjänster är kopplade och beskrivningarna inte nämner tjänster: skriv att uppdragets omfattning inte är tydligt specificerat i underlaget — gissa inte.
- Fältet "Syfte med affärsförbindelsen" är fritext; det får inte ersätta tjänstlistan om de säger olika — prioritera tjänstlistan + beskrivningarna.

BYRÅNS ANALYS AV VALDA TJÄNSTER (endast tjänster som finns i TJÄNSTLISTA ovan — samma poster som "Kundens utvalda tjänster"):
Detta är byråns förhandsbedömning per tjänst (beskrivning av riskfaktor, riskbedömning, åtgärder) från ClientFlow. Väg in det när du bedömer denna kunds risk; generalisera inte från tjänster som inte är valda för kunden.
${byraValdaTjansterDetaljText}

KUNDUPPGIFTER (anonymiserade: kundnamn och organisationsnummer skickas inte till AI):
- Organisationsform: ${f['Bolagsform'] || '–'}
- Bransch/SNI: ${f['SNI-bransch'] || f['Bransch'] || '–'}
- Omsättning (valt intervall, t.ex. 0–200 000 kr): ${f['Omsättning'] || '–'}
- Verklig huvudman: ${verkligHuvudmanAnon}
- Skatterättslig hemvist: ${arr(f['Skatterättslig hemvist'])}
- Betalningar: ${arr(f['Betalningar'])}
- Syfte med affärsförbindelsen (fritext i ClientFlow): ${syfteRaw}
- Transaktioner med andra länder: ${f['Har företaget transaktioner med andra länder?'] || '–'}
- Kapitalets ursprung: ${arr(f['Vilket ursprung har företagets kapital?'])}
- Affärsmodell: ${f['Affärsmodell'] || '–'}
- Byråns beskrivning av kunden (hela texten, kan innehålla namn om byrån skrivit det): ${beskrivningKundFull}
- Ytterligare beskrivning av kunden och verksamheten (hela texten): ${beskrivningExtraFull}

PEP & SANKTIONER (från fliken Riskbedömning — vad som är bockat/registrerat i Airtable):
- PEP-status: ${pepStatus}
- Antal träffar PEP/sanktionslistor: ${pepTraffar}

RISKFAKTORER (övergripande):
- Kunden verkar i högriskbransch: ${arr(f['Kunden verkar i en högriskbransch'])}
- Riskhöjande faktorer övrigt: ${arr(f['Riskhöjande faktorer övrigt'])}
- Risksänkande faktorer: ${arr(f['Risksänkande faktorer'])}
- Kommentar till riskfaktorer: ${f['Kommentar till riskfaktorerna ovan'] || '–'}

IDENTIFIERADE RISKFAKTORER PER TJÄNST/KATEGORI (detta är vad användaren har valt på fliken Riskbedömning — t.ex. "PEP, familjemedlem till PEP..." med nivå Förhöjd/Medel/Låg, eller "Privatkunder" med Medel):
${lankadeRiskerText || '  Inga specifika riskfaktorer registrerade.'}

Basera din bedömning på helheten av all information ovan. Om ett fält är tomt (–) ska det inte påverka bedömningen negativt.

FORMULERINGSREGLER FÖR BRANSCH OCH VERKSAMHET:
- Beskriv kundens verksamhet på ett naturligt och sammanhängande sätt. Använd inte enbart branschkoden/SNI-koden ordagrant (t.ex. skriv inte "Kunden verkar inom onkologi" utan "Kunden driver en konsultverksamhet/hyrläkarverksamhet inom onkologi" eller liknande, baserat på vad beskrivningsfälten säger).
- Läs ALLTID "Byråns beskrivning av kunden" och "Ytterligare beskrivning" noggrant — de ger viktig kontext om vad kunden faktiskt gör (t.ex. hyrläkare, konsult, e-handel, restaurang). Använd den informationen för att ge en verklighetstrogen bild av verksamheten.
- Undvik generiska fraser som inte tillför något. Var specifik utifrån underlaget.

RISKNIVÅ — ANVÄND "Lag" ENDAST NÄR DET ÄR TYDLIGT MOTIVERAT:
- Sätt "Lag" bara om helhetsbilden entydigt är låg risk: inga relevanta riskhöjande faktorer som motiverar högre nivå, inga PEP-/sanktionslägen som enligt reglerna nedan kräver "Medel" eller "Hog", och tjänster/exponering är okontroversiella utifrån underlaget.
- Vid tvekan, sparsamt ifyllt underlag, eller minsta konkreta riskhöjande omständighet: välj "Medel" eller "Hog" — inte "Lag".

ABSOLUTA REGLER — FÖLJ DESSA EXAKT:

1. PEP: Om i "IDENTIFIERADE RISKFAKTORER" ovan någon riskfaktor innehåller "PEP" (t.ex. "PEP, familjemedlem till PEP eller känd medarbetare till PEP") och har nivå "Förhöjd", ska kundens sammanlagda risknivå vara "Hog" och PEP MÅSTE nämnas som huvudorsak i riskbedömningen. Vid nivå "Medel" på PEP-faktorn ska sammanlagd risk vara minst "Medel". Detta gäller oavsett fältet "PEP-status" ovan — prioritera alltid de identifierade riskfaktorerna från fliken Riskbedömning.

2. ÅTGÄRDER — detta är kritiskt:
   - FORMATKRAV (gäller när atgarder inte är tom sträng): Varje punkt MÅSTE vara praktiskt genomförbar och innehålla:
     (a) VAD som ska göras, (b) HUR/VAR det görs (verktyg/källa), (c) VAD som ska dokumenteras i ClientFlow.
     Exempel på format: "- Sanktion/PEP-kontroll: kör Dilisense (person/bolag) och spara PDF-rapporten i Dokumentation." (detta är bara exempel).
   - PROPORTIONALITET / ARBETSINSATS: Åtgärderna ska vara rimliga för en redovisningsbyrå. Vi ska inte agera “polis” eller skapa onödigt merarbete.
     Välj hellre 1-3 högsignal-kontroller med låg insats än många breda kontroller. Sikta på åtgärder som normalt tar totalt ca 10–30 minuter att genomföra och dokumentera.
     Förbjudna formuleringar/krav: “övervakning i realtid”, “kontinuerlig övervakning”, “granska alla transaktioner”, eller andra åtgärder som kräver löpande manuellt arbete utan tydlig nytta.
   - "Hog": Lista 3-5 åtgärder enligt formatkravet ovan, specifikt anpassade till just denna kunds riskbild (bransch, identifierade riskfaktorer, geografik, PEP, tjänster enligt TJÄNSTLISTA m.m.). Varje punkt ska kunna motiveras utifrån denna kund — generiska mallar är FÖRBJUDNA.
   - "Medel": Sätt atgarder = "" SÅVIDA INTE något verkligen sticker ut (PEP, utländska transaktioner, okänt kapitalursprung, högriskbransch). Om du ändå anger åtgärder måste de följa formatkravet och vara max 1-3 punkter.
   - "Lag": Sätt alltid atgarder = "". Inga åtgärder för lågrisk-kunder.

   SÄRSKILT vid "sanktionslistor/PEP": Om du föreslår kontroller ska du ange exakt vilka källor som kontrolleras (minst två av):
   - EU:s konsoliderade sanktionslista
   - FN (UN) Consolidated List
   - OFAC (SDN)
   - UK HMT Sanctions List
   Om systemet använder Dilisense: skriv "Kör Dilisense screening" och ange om det är individ- eller företagsscreening + spara Dilisense-PDF:en.

   SÄRSKILT vid "stickprov/seriositet": Ange konkret vad som granskas, t.ex. Bolagsverket-uppgifter, verklig huvudman, hemsida/affärsmodell, nyhets-/media-sökning, betalflöden (länder/belopp), och att underlaget (screenshot/länk/anteckning/PDF) sparas.

   SÄRSKILT vid "förstärkt kundkännedom (EDD)": Beskriv vad det innebär i praktiken för detta case, t.ex. bekräfta verklig huvudman, inhämta/bedöm källa till medel, affärsrational, förväntade betalningar (länder/belopp/frekvens), och dokumentera beslut/underlag.

3. RISKBEDÖMNINGSTEXT: Skriv en utförlig riskbedömning på 5-10 meningar (MINST 5 meningar, gärna fler). Texten ska vara professionell, konkret och bygga på kundens faktiska underlag. Nämn BARA tjänster som finns i TJÄNSTLISTA — inga andra.

   STRUKTURERA TEXTEN SÅ HÄR (alla relevanta punkter ska beröras):
   a) VERKSAMHETSBESKRIVNING: Beskriv kort vad kunden gör (baserat på bransch, beskrivningsfält och affärsmodell). Var specifik — inte bara branschkoden.
   b) RISKSÄNKANDE FAKTORER: Vad talar för lägre risk? T.ex. enkel affärsstruktur, inhemska transaktioner, transparent verksamhet, känd bransch.
   c) RISKHÖJANDE FAKTORER: Vad talar för högre risk? T.ex. kontantintensiv bransch, internationella transaktioner, PEP, komplex ägarstruktur. Nämn BARA saker som faktiskt framgår av underlaget.
   d) TJÄNSTER OCH DERAS RISKPROFIL: Beskriv kort riskprofilen kopplad till de tjänster byrån faktiskt utför åt kunden (ENBART från TJÄNSTLISTA).
   e) SAMMANVÄGD BEDÖMNING: Motivera den valda risknivån genom att väga samman ovanstående.

   VIKTIG REGEL: Om det inte finns riskhöjande faktorer, skriv tydligt att inga riskhöjande faktorer noterats — hitta INTE PÅ risker för att "balansera" texten.

Svara EXAKT i detta JSON-format (inget annat):
{
  "riskniva": "Lag" eller "Medel" eller "Hog",
  "riskbedomning": "5-10 meningar som motiverar risknivån konkret enligt strukturen ovan.",
  "atgarder": "Punkter med bindestreck (-) vid Hog eller specifik risk, annars exakt tom sträng."
}`;

    const extractFirstJsonObject = (text) => {
      if (!text) return null;
      const start = text.indexOf('{');
      if (start === -1) return null;
      let depth = 0;
      for (let i = start; i < text.length; i++) {
        const ch = text[i];
        if (ch === '{') depth++;
        else if (ch === '}') {
          depth--;
          if (depth === 0) return text.slice(start, i + 1);
        }
      }
      return null;
    };

    const stripCodeFences = (text) => {
      if (!text) return '';
      let t = String(text);
      // Ta bort BOM/konstiga prefix som kan sabotera JSON.parse
      t = t.replace(/^\uFEFF/, '').trim();
      // Vanligt när modeller returnerar ```json ... ```
      if (/^```/m.test(t)) {
        t = t.replace(/```[a-zA-Z0-9_-]*\s*/g, '```');
        t = t.replace(/^```/g, '').replace(/```$/g, '').trim();
      }
      return t.trim();
    };

    const parseAssistantJson = (rawText) => {
      const cleaned = stripCodeFences(rawText);
      const jsonCandidate = extractFirstJsonObject(cleaned) || extractFirstJsonObject(rawText) || cleaned || rawText || '';
      try {
        return JSON.parse(jsonCandidate);
      } catch (e) {
        const preview = String(jsonCandidate).slice(0, 180);
        const msg = `Kunde inte tolka AI-svar som JSON. Förhandsvisning: ${preview}${String(jsonCandidate).length > 180 ? '…' : ''}`;
        const err = new Error(msg);
        err.cause = e;
        throw err;
      }
    };

    const isLowQualityRiskText = (s) => {
      if (!s) return true;
      const t = String(s).trim();
      if (t.length < 80) return true;
      // Undvik att svaret läcker UI/implementation-termer.
      if (/(kryss|bocka(t|de)?|markerad|checkbox|flik|formulär|klicka|modal|dropdown|fältet\s+")/i.test(t)) return true;
      // Vanliga “knas-artefakter”
      if (/�/.test(t)) return true;
      if (/(Annika AI\s*){2,}/i.test(t)) return true;
      // För många repetitioner tyder på trasig generation.
      const words = t.toLowerCase().split(/\s+/).filter(Boolean);
      if (words.length > 0) {
        const freq = new Map();
        for (const w of words) freq.set(w, (freq.get(w) || 0) + 1);
        const max = Math.max(...freq.values());
        if (max >= 8) return true;
      }
      return false;
    };

    // Vector: OPENAI_RISK_VECTOR_STORE_ID om satt, annars OPENAI_VECTOR_STORE_ID (file_search i assistentkörning när ID finns).
    const riskVectorStoreId =
      (process.env.OPENAI_RISK_VECTOR_STORE_ID || '').toString().trim()
      || (process.env.OPENAI_VECTOR_STORE_ID || '').toString().trim()
      || null;

    // Via samma OpenAI-assistent som övriga ClientFlow (OPENAI_ASSISTANT_ID). Run-instruktioner säkerställer JSON-svar.
    const assistantInstructions =
      'Du är en AML/KYC-specialist på en svensk redovisningsbyrå. Följ användarmeddelandet exakt. Om file_search finns: använd kunskapsbasen som komplement till kundunderlaget, inte som ersättning. Svara endast med giltig JSON enligt formatet i slutet av meddelandet, ingen text utanför JSON.';

    const aiText = await runOpenAIAssistantRunWithRetry(
      openaiKey,
      prompt,
      {
        instructions: assistantInstructions,
        vectorStoreId: riskVectorStoreId || undefined,
        maxWaitMs: 180000,
        pollMs: 1500,
        debugMeta: { route: '/api/ai-riskbedomning', user: req.user?.email || '' }
      },
      { maxAttempts: 3 }
    );
    let result = parseAssistantJson(aiText);

    // Om modellen svarar “konstigt”, gör en enkel omskrivningsrunda med tydliga krav.
    if (!result || isLowQualityRiskText(result.riskbedomning)) {
      const rewritePrompt = `Du ska förbättra (skriva om) en kundriskbedömning enligt PVML på tydlig svenska.
Skriv om texten så att den är lätt att förstå, utan UI-termer (kryss/bockat/markerat/flik/formulär).
Håll dig till fakta i underlaget. Hitta inte på nya detaljer.
Returnera EXAKT samma JSON-format som tidigare.

UNDERLAG (kunddata + regler):
${prompt}

NUVARANDE AI-SVAR (att förbättra):
${aiText}`;
      const rewriteText = await runOpenAIAssistantRunWithRetry(
        openaiKey,
        rewritePrompt,
        {
          instructions: assistantInstructions,
          vectorStoreId: riskVectorStoreId || undefined,
          maxWaitMs: 180000,
          pollMs: 1500,
          debugMeta: { route: '/api/ai-riskbedomning-rewrite', user: req.user?.email || '' }
        },
        { maxAttempts: 3 }
      );
      result = parseAssistantJson(rewriteText);
    }

    if (!result) throw new Error('Kunde inte tolka AI-svar');

    res.json({
      riskniva: result.riskniva || 'Medel',
      riskbedomning: result.riskbedomning || '',
      atgarder: result.atgarder || ''
    });

  } catch (error) {
    const status = error.response?.status || 500;
    const msg = error.response?.data?.error?.message || error.message || 'Okänt fel';
    console.error('❌ AI-riskbedömning fel:', status, msg);
    if (status === 429) {
      return res.status(429).json({
        error: 'AI är tillfälligt hårt belastad (rate limit). Vänta 10–30 sek och försök igen.'
      });
    }
    res.status(status).json({ error: 'Kunde inte generera AI-analys: ' + msg });
  }
});

// ============================================================
// POST /api/ai-byra-tjanst
// Genererar AI-förslag för en av byråns tjänster: tjänstebeskrivning,
// hot (PT/TF), sårbarheter och tjänstespecifika åtgärder.
// ============================================================
app.post('/api/ai-byra-tjanst', authenticateToken, async (req, res) => {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) return res.status(500).json({ error: 'OPENAI_API_KEY saknas.' });
  if (!process.env.OPENAI_ASSISTANT_ID) return res.status(500).json({ error: 'OPENAI_ASSISTANT_ID saknas.' });

  const namn = (req.body?.namn || '').toString().trim();
  if (!namn) return res.status(400).json({ error: 'Tjänstens namn (namn) saknas.' });
  const tjanstetyp = (req.body?.tjanstetyp || '').toString().trim();
  const befintligt = req.body?.befintligt || {};

  const befintligtText = (() => {
    try {
      const parts = [];
      if (befintligt.tjanstebeskrivning) parts.push(`Tjänstebeskrivning: ${befintligt.tjanstebeskrivning}`);
      if (befintligt.riskniva) parts.push(`Risknivå: ${befintligt.riskniva}`);
      return parts.length ? parts.join('\n') : '';
    } catch (_) { return ''; }
  })();

  const riskniva = (befintligt.riskniva || '').toString().trim() || 'Medel';

  let byraProfilBlock = '';
  try {
    const profilResult = await getByraProfilForRequest(req);
    if (!profilResult.error && profilResult.profil) {
      byraProfilBlock = formatByraProfilPromptBlock(profilResult.profil) + '\n\n';
    }
  } catch (_) { /* profil är valfritt underlag */ }

  const prompt = `Du är en expert på redovisning och AML-compliance för svenska redovisningsbyråer.

Din uppgift är att föreslå innehåll för en tjänst som en redovisningsbyrå utför åt sina kunder, utifrån tjänstens namn och risknivå.

REGLER:
- Håll dig strikt till tjänstens domän
- Blanda INTE in KYC, verkliga huvudmän eller penningtvättskontroller om tjänsten inte handlar om det
- Utgå från svensk redovisningssed, BAS-kontoplanen och god revisionspraxis
- Om tjänsten är av redovisningskaraktär: fokusera på avstämningar, kontroller och dokumentationskrav kopplade till just den tjänsten
- Om tjänsten är av compliance-karaktär (t.ex. AML, KYC): fokusera på identitetskontroll, riskbedömning och dokumentation
- Hot ska grundas på kända tillvägagångssätt från myndigheter och organisationer — ange alltid källan för varje hot

KÄLLOR ATT UTGÅ FRÅN (använd de som är relevanta per hot):
- Polismyndigheten / Finanspolisen (polisen.se)
- Samordningsfunktionen mot penningtvätt och finansiering av terrorism
- Ekobrottsmyndigheten (ekobrottsmyndigheten.se)
- Skatteverket (skatteverket.se)
- FATF — Financial Action Task Force (fatf-gafi.org)
- Europol (europol.europa.eu)
- EU-kommissionen (commission.europa.eu)
- Brottsförebyggande rådet, Brå (bra.se)
- Säkerhetspolisen, Säpo (sakerhetspolisen.se)

${byraProfilBlock}TJÄNST: ${namn}
RISKNIVÅ: ${riskniva} (Låg / Medel / Hög — högre risknivå = fler och striktare kontroller)

Väg in BYRÅPROFIL ovan när du kalibrerar risknivåer, hot, sårbarheter och åtgärder (t.ex. hög andel internationell handel eller kontantintensiva kunder kan motivera striktare bedömning).

Svara ENDAST med ett JSON-objekt, ingen annan text, inga markdown-backticks:

{
  "beskrivning": "2-3 meningar om vad tjänsten innebär, byråns roll och varför den är relevant ur ett AML-perspektiv.",
  "hot": [ { "typ": "PT eller TF", "titel": "Kort titel, max 5 ord", "beskrivning": "Konkret beskrivning av hotet kopplat till just denna tjänst.", "kalla": "Källans namn, t.ex. Finanspolisen eller FATF" } ],
  "sarbarheter": [ { "kategori": "Verksamhet/Kunder/Produkter/Leveranskanaler/Geografi", "titel": "Kort titel, max 5 ord", "beskrivning": "Konkret sårbarhet kopplad till tjänsten och kategorin." } ],
  "atgarder": [ { "namn": "Kort namn, max 5 ord", "beskrivning": "Konkret åtgärd byrån ska vidta för denna tjänst." } ]
}

ANTAL (anpassa efter risknivå):
- hot: 2 (Låg), 3 (Medel), 4 (Hög)
- sarbarheter: 2 (Låg), 2 (Medel), 3 (Hög)
- atgarder: 3 (Låg), 4 (Medel), 5 (Hög)`;

  const extractFirstJsonObject = (text) => {
    if (!text) return null;
    const start = text.indexOf('{');
    if (start === -1) return null;
    let depth = 0;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) return text.slice(start, i + 1);
      }
    }
    return null;
  };
  const stripCodeFences = (text) => {
    if (!text) return '';
    let t = String(text).replace(/^\uFEFF/, '').trim();
    if (/^```/m.test(t)) {
      t = t.replace(/```[a-zA-Z0-9_-]*\s*/g, '```');
      t = t.replace(/^```/g, '').replace(/```$/g, '').trim();
    }
    return t.trim();
  };
  const parseAssistantJson = (rawText) => {
    const cleaned = stripCodeFences(rawText);
    const candidate = extractFirstJsonObject(cleaned) || extractFirstJsonObject(rawText) || cleaned || rawText || '';
    return JSON.parse(candidate);
  };

  const normRisk = (v) => {
    const t = (v || '').toString().trim().toLowerCase();
    if (t.startsWith('hög') || t.startsWith('hog') || t === 'high') return 'Hög';
    if (t.startsWith('låg') || t.startsWith('lag') || t === 'low') return 'Låg';
    return 'Medel';
  };
  const normHotTyp = (v) => ((v || '').toString().trim().toUpperCase() === 'TF' ? 'TF' : 'PT');
  const KATEGORIER = ['Kunder', 'Distribution', 'Geografi', 'Verksamhet'];
  // Frontend-dropdownen har 4 kategorier. Prompten kan föreslå fler (t.ex.
  // "Leveranskanaler", "Produkter") – mappa dem till närmaste giltiga kategori.
  const KATEGORI_ALIAS = {
    'leveranskanaler': 'Distribution',
    'leveranskanal': 'Distribution',
    'produkter': 'Verksamhet',
    'produkt': 'Verksamhet'
  };
  const normKategori = (v) => {
    const t = (v || '').toString().trim().toLowerCase();
    if (KATEGORI_ALIAS[t]) return KATEGORI_ALIAS[t];
    return KATEGORIER.find(k => k.toLowerCase() === t) || 'Verksamhet';
  };
  const cleanStr = (v) => (v == null ? '' : String(v).trim());

  try {
    const assistantInstructions =
      'Du är en AML/KYC-specialist på en svensk redovisningsbyrå. Följ användarmeddelandet exakt. Svara endast med giltig JSON enligt formatet i slutet av meddelandet, ingen text utanför JSON.';
    const riskVectorStoreId =
      (process.env.OPENAI_RISK_VECTOR_STORE_ID || '').toString().trim()
      || (process.env.OPENAI_VECTOR_STORE_ID || '').toString().trim()
      || null;

    const aiText = await runOpenAIAssistantRunWithRetry(
      openaiKey,
      prompt,
      {
        instructions: assistantInstructions,
        vectorStoreId: riskVectorStoreId || undefined,
        maxWaitMs: 180000,
        pollMs: 1500,
        debugMeta: { route: '/api/ai-byra-tjanst', user: req.user?.email || '' }
      },
      { maxAttempts: 3 }
    );

    const result = parseAssistantJson(aiText);
    if (!result || typeof result !== 'object') throw new Error('Kunde inte tolka AI-svar.');

    const hot = Array.isArray(result.hot) ? result.hot
      .map(h => ({ typ: normHotTyp(h?.typ), titel: cleanStr(h?.titel), beskrivning: cleanStr(h?.beskrivning), kalla: cleanStr(h?.kalla ?? h?.källa ?? h?.source) }))
      .filter(h => h.titel || h.beskrivning) : [];
    const sarbarheter = Array.isArray(result.sarbarheter) ? result.sarbarheter
      .map(s => ({ kategori: normKategori(s?.kategori), titel: cleanStr(s?.titel), beskrivning: cleanStr(s?.beskrivning) }))
      .filter(s => s.titel || s.beskrivning) : [];
    const atgarder = Array.isArray(result.atgarder) ? result.atgarder
      .map(a => ({ titel: cleanStr(a?.titel ?? a?.namn), beskrivning: cleanStr(a?.beskrivning) }))
      .filter(a => a.titel || a.beskrivning) : [];

    res.json({
      tjanstebeskrivning: cleanStr(result.beskrivning ?? result.tjanstebeskrivning),
      riskniva: normRisk(result.riskniva || riskniva),
      hot,
      sarbarheter,
      atgarder
    });
  } catch (error) {
    const status = error.response?.status || 500;
    const msg = error.response?.data?.error?.message || error.message || 'Okänt fel';
    console.error('❌ AI-byrå-tjänst fel:', status, msg);
    if (status === 429) {
      return res.status(429).json({ error: 'AI är tillfälligt hårt belastad (rate limit). Vänta 10–30 sek och försök igen.' });
    }
    res.status(status).json({ error: 'Kunde inte generera AI-förslag: ' + msg });
  }
});

// POST /api/ai-ovriga-riskfaktor
// Genererar AI-förslag för en övrig riskfaktor (beskrivning, riskbedömning, åtgärd)
app.post('/api/ai-ovriga-riskfaktor', authenticateToken, async (req, res) => {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) return res.status(500).json({ error: 'OPENAI_API_KEY saknas.' });
  if (!process.env.OPENAI_ASSISTANT_ID) return res.status(500).json({ error: 'OPENAI_ASSISTANT_ID saknas.' });

  const riskfaktor = (req.body?.riskfaktor || req.body?.namn || '').toString().trim();
  const typ = (req.body?.typ || req.body?.risktyp || '').toString().trim();
  if (!riskfaktor) return res.status(400).json({ error: 'Riskfaktorn (riskfaktor) saknas.' });

  let byraProfilBlock = '';
  try {
    const profilResult = await getByraProfilForRequest(req);
    if (!profilResult.error && profilResult.profil) {
      byraProfilBlock = formatByraProfilPromptBlock(profilResult.profil) + '\n\n';
    }
  } catch (_) { /* profil är valfritt underlag */ }

  const befintligt = req.body?.befintligt || {};
  const prompt = `Du är en AML/KYC-specialist på en svensk redovisningsbyrå.

Din uppgift är att föreslå innehåll för en övrig riskfaktor i byråns riskbedömning (inte kopplad till en specifik tjänst).

${byraProfilBlock}TYP AV RISKFAKTOR: ${typ || '–'}
RISKFAKTOR: ${riskfaktor}
${befintligt.beskrivning ? `Befintlig beskrivning: ${befintligt.beskrivning}` : ''}
${befintligt.riskbedomning ? `Befintlig riskbedömning: ${befintligt.riskbedomning}` : ''}

Väg in BYRÅPROFIL ovan när du kalibrerar risknivå och åtgärder.

Svara ENDAST med ett JSON-objekt, ingen annan text, inga markdown-backticks:

{
  "beskrivning": "2-4 meningar om riskfaktorn och varför den är relevant för byrån.",
  "riskbedomning": "Låg, Medel eller Förhöjd",
  "atgard": "Konkreta åtgärder byrån bör vidta (2-4 meningar)."
}`;

  const extractFirstJsonObject = (text) => {
    if (!text) return null;
    const start = text.indexOf('{');
    if (start === -1) return null;
    let depth = 0;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) return text.slice(start, i + 1);
      }
    }
    return null;
  };
  const stripCodeFences = (text) => {
    if (!text) return '';
    let t = String(text).replace(/^\uFEFF/, '').trim();
    if (/^```/m.test(t)) {
      t = t.replace(/```[a-zA-Z0-9_-]*\s*/g, '```');
      t = t.replace(/^```/g, '').replace(/```$/g, '').trim();
    }
    return t.trim();
  };
  const parseAssistantJson = (rawText) => {
    const cleaned = stripCodeFences(rawText);
    const candidate = extractFirstJsonObject(cleaned) || extractFirstJsonObject(rawText) || cleaned || rawText || '';
    return JSON.parse(candidate);
  };
  const normRiskfaktorNiva = (v) => {
    const t = (v || '').toString().trim().toLowerCase();
    if (t.startsWith('förhöjd') || t.startsWith('forhojd') || t === 'hog' || t === 'hög') return 'Förhöjd';
    if (t.startsWith('låg') || t.startsWith('lag') || t === 'low') return 'Låg';
    return 'Medel';
  };

  try {
    const aiText = await runOpenAIAssistantRunWithRetry(
      openaiKey,
      prompt,
      {
        instructions: 'Du är en AML/KYC-specialist. Svara endast med giltig JSON enligt formatet, ingen text utanför JSON.',
        maxWaitMs: 120000,
        pollMs: 1500,
        debugMeta: { route: '/api/ai-ovriga-riskfaktor', user: req.user?.email || '' }
      },
      { maxAttempts: 3 }
    );
    const result = parseAssistantJson(aiText);
    if (!result || typeof result !== 'object') throw new Error('Kunde inte tolka AI-svar.');
    res.json({
      beskrivning: (result.beskrivning || '').toString().trim(),
      riskbedomning: normRiskfaktorNiva(result.riskbedomning || result.riskniva),
      atgard: (result.atgard || result.åtgärd || result.atgardText || '').toString().trim()
    });
  } catch (error) {
    const status = error.response?.status || 500;
    const msg = error.response?.data?.error?.message || error.message || 'Okänt fel';
    console.error('❌ AI-övriga-riskfaktor fel:', status, msg);
    if (status === 429) {
      return res.status(429).json({ error: 'AI är tillfälligt hårt belastad (rate limit). Vänta 10–30 sek och försök igen.' });
    }
    res.status(status).json({ error: 'Kunde inte generera AI-förslag: ' + msg });
  }
});

// POST /api/ai-vardering-risk-byra
// Genererar AI-förslag för stycket "5. Värdering av sammantagen risk" utifrån statistik, identifierade risker och tjänster
app.post('/api/ai-vardering-risk-byra', authenticateToken, async (req, res) => {
  const openaiKey = process.env.OPENAI_API_KEY;
  const baseUrl = `http://127.0.0.1:${process.env.PORT || 3001}`;
  const authHeader = getAuthHeaderForInternalRequests(req);

  if (!openaiKey) return res.status(500).json({ error: 'OPENAI_API_KEY saknas.' });
  if (!process.env.OPENAI_ASSISTANT_ID) return res.status(500).json({ error: 'OPENAI_ASSISTANT_ID saknas.' });

  try {
    const userData = await getAirtableUser(req.user.email);
    if (!userData) return res.status(404).json({ error: 'Användaren hittades inte.' });
    const byraId = (userData.byraId || '').toString().trim();
    if (!byraId) return res.status(400).json({ error: 'Ingen byrå kopplad till användaren.' });

    const [statRes, tjansterRes, rutinerRes] = await Promise.all([
      axios.get(`${baseUrl}/api/statistik-riskbedomning`, { headers: authHeader, timeout: 15000 }),
      axios.get(`${baseUrl}/api/byra-tjanster?byraId=${encodeURIComponent(byraId)}`, { headers: authHeader, timeout: 10000 }),
      axios.get(`${baseUrl}/api/byra-rutiner`, { headers: authHeader, timeout: 10000 })
    ]);

    const statistik = statRes.data || {};
    const tjanster = (tjansterRes.data && tjansterRes.data.tjanster) || [];
    const rutinerFields = (rutinerRes.data && rutinerRes.data.fields) || {};

    const identifieradeRisker = rutinerFields['4. Identifierade Risker och Sårbarheter'] || '';
    const befintligVardering = rutinerFields['8. Värdering av sammantagen risk'] || '';
    const syfteOmfattning = rutinerFields['1. Syfte och Omfattning'] || rutinerFields['Syfte och Omfattning'] || '';
    const beskrivning = rutinerFields['2. Beskrivning av Byråns verksamhet'] || rutinerFields['Beskrivning av Byråns verksamhet'] || '';

    const statistikText = [
      'STATISTIK FÖR RISKBEDÖMNING:',
      `- Antal kunder: ${statistik.antalKunder ?? '–'}`,
      `- Risknivåer: Låg ${statistik.riskniva?.Låg ?? 0}, Medel ${statistik.riskniva?.Medel ?? 0}, Hög ${statistik.riskniva?.Hög ?? 0}`,
      statistik.tjänster && statistik.tjänster.length
        ? '- Tjänster: ' + statistik.tjänster.map(t => `${t.namn} (${t.antal})`).join(', ')
        : '',
      statistik.högriskbransch && statistik.högriskbransch.length
        ? '- Högriskbranscher: ' + statistik.högriskbransch.map(b => `${b.namn} (${b.antal})`).join(', ')
        : ''
    ].filter(Boolean).join('\n');

    const tjansterText = tjanster.length
      ? 'BYRÅNS TJÄNSTER OCH RISKFAKTORER:\n' + tjanster.map(t =>
          `- ${t.namn}: Riskbedömning: ${(t.riskbedomning || '').slice(0, 150)}${t.atgard ? ` | Åtgärd: ${(t.atgard || '').slice(0, 80)}` : ''}`
        ).join('\n')
      : 'Inga tjänster med riskanalyser.';

    const byraProfilBlock = formatByraProfilPromptBlock(mapByraProfilFromAirtable(rutinerFields));

    const systemPrompt = `Du är en AML/KYC-specialist på en svensk redovisningsbyrå. Din uppgift är att skriva stycket "8. Värdering av sammantagen risk" i en allmän riskbedömning (PVML, Penningtvättslagen).
Baserat på statistik, identifierade risker och sårbarheter samt tjänsteanalyser ska du sammanfatta byråns sammantagna risknivå och motivera den. Följ Länsstyrelsens vägledning och råd (t.ex. "Ett riskbaserat förhållningssätt").
Skriv på svenska. Var professionell och konkret. Ge en tydlig slutsats om den sammantagna risken (t.ex. normal, förhöjd, betydande) och motivera utifrån underlagen.`;

    const userPrompt = `Skriv stycket "8. Värdering av sammantagen risk" för byråns allmänna riskbedömning.

${byraProfilBlock}

${statistikText}

${tjansterText}

IDENTIFIERADE RISKER OCH SÅRBARHETER (punkt 4):
${identifieradeRisker || 'Ingen text angiven ännu.'}

BEFINTLIG KONTEXT:
- Syfte och omfattning: ${(syfteOmfattning || '').slice(0, 400)}
- Beskrivning av verksamheten: ${(beskrivning || '').slice(0, 400)}
${befintligVardering ? `\nBefintlig värdering (förfina/uppdatera): ${befintligVardering.slice(0, 600)}` : ''}

Ge endast den färdiga texten för stycket, utan rubrik eller inledning.`;

    const text = await runOpenAIAssistantRun(openaiKey, `${systemPrompt}\n\n---\n\n${userPrompt}`, {
      maxWaitMs: 120000,
      debugMeta: { route: '/api/ai-vardering-risk-byra', user: req.user?.email || '' }
    });
    if (!text) return res.status(500).json({ error: 'AI genererade ingen text.' });

    res.json({ text });
  } catch (error) {
    console.error('❌ AI värdering risk byrå:', error.message);
    const msg = error.response?.data?.error || error.message || 'Kunde inte generera AI-förslag';
    res.status(500).json({ error: typeof msg === 'string' ? msg : 'Kunde inte generera AI-förslag.' });
  }
});

// POST /api/ai-identifierade-risker-byra
// Genererar AI-förslag för stycket "4. Identifierade Risker och Sårbarheter" med statistik, byråns tjänster och riktlinjer
app.post('/api/ai-identifierade-risker-byra', authenticateToken, async (req, res) => {
  const openaiKey = process.env.OPENAI_API_KEY;
  const baseUrl = `http://127.0.0.1:${process.env.PORT || 3001}`;
  const authHeader = getAuthHeaderForInternalRequests(req);

  if (!openaiKey) return res.status(500).json({ error: 'OPENAI_API_KEY saknas.' });
  if (!process.env.OPENAI_ASSISTANT_ID) return res.status(500).json({ error: 'OPENAI_ASSISTANT_ID saknas.' });

  try {
    const userData = await getAirtableUser(req.user.email);
    if (!userData) return res.status(404).json({ error: 'Användaren hittades inte.' });
    const byraId = (userData.byraId || '').toString().trim();
    if (!byraId) return res.status(400).json({ error: 'Ingen byrå kopplad till användaren.' });

    const [statRes, tjansterRes, rutinerRes] = await Promise.all([
      axios.get(`${baseUrl}/api/statistik-riskbedomning`, { headers: authHeader, timeout: 15000 }),
      axios.get(`${baseUrl}/api/byra-tjanster?byraId=${encodeURIComponent(byraId)}`, { headers: authHeader, timeout: 10000 }),
      axios.get(`${baseUrl}/api/byra-rutiner`, { headers: authHeader, timeout: 10000 })
    ]);

    const statistik = statRes.data || {};
    const tjansterFromByra = (tjansterRes.data && tjansterRes.data.tjanster) || [];
    const rutinerFields = (rutinerRes.data && rutinerRes.data.fields) || {};

    const syfteOmfattning = rutinerFields['1. Syfte och Omfattning'] || rutinerFields['Syfte och Omfattning'] || '';
    const beskrivning = rutinerFields['2. Beskrivning av Byråns verksamhet'] || rutinerFields['Beskrivning av Byråns verksamhet'] || '';
    const metod = rutinerFields['3. Metod för Riskbedömning '] || rutinerFields['Metod för Riskbedömning'] || '';
    const befintligText = rutinerFields['4. Identifierade Risker och Sårbarheter'] || '';

    // Airtable-ID:n (rec…) får aldrig visas som tjänstnamn — mappa till Task Name från byråns tjänster.
    const tjanstIdToNamn = new Map();
    for (const t of tjansterFromByra) {
      if (t.id && t.namn) tjanstIdToNamn.set(t.id, String(t.namn).trim());
    }
    const isAirtableRecordId = (s) => typeof s === 'string' && /^rec[A-Za-z0-9]{10,}$/.test(s.trim());
    const resolveTjanstNamn = (raw) => {
      if (raw == null) return '';
      let s = String(raw).trim();
      if (!s) return '';
      if (isAirtableRecordId(s)) return tjanstIdToNamn.get(s) || '';
      return s;
    };
    const mergeTjanstRad = (prev, nu) => {
      if (!prev) return nu;
      const pick = (a, b) => ((b || '').trim() ? b : a);
      return {
        namn: prev.namn,
        beskrivning: pick(prev.beskrivning, nu.beskrivning),
        riskbedomning: pick(prev.riskbedomning, nu.riskbedomning),
        atgard: pick(prev.atgard, nu.atgard),
        typ: pick(prev.typ, nu.typ),
        antal: prev.antal != null ? prev.antal : nu.antal
      };
    };

    // Slå ihop ALLA tjänster: byra-tjanster (med riskanalys) + statistik.tjänster (från kunder). OTROLIGT VIKTIGT att alla aktuella tjänster med i analysen.
    const tjanstByName = new Map();
    for (const t of tjansterFromByra) {
      let n = (t.namn || '').trim();
      if (!n && t.id) n = tjanstIdToNamn.get(t.id) || '';
      n = resolveTjanstNamn(n);
      if (!n) continue;
      const rad = { namn: n, beskrivning: t.beskrivning || '', riskbedomning: t.riskbedomning || '', atgard: t.atgard || '', typ: t.typ || '', antal: null };
      tjanstByName.set(n, mergeTjanstRad(tjanstByName.get(n), rad));
    }
    const statistikTjanster = statistik.tjänster || [];
    for (const t of statistikTjanster) {
      const n = resolveTjanstNamn((t.namn || '').trim());
      if (!n) continue;
      if (!tjanstByName.has(n)) {
        tjanstByName.set(n, { namn: n, beskrivning: '', riskbedomning: '', atgard: '', typ: '', antal: t.antal });
      } else {
        const existing = tjanstByName.get(n);
        if (existing.antal == null) existing.antal = t.antal;
      }
    }
    const valdaTjansterRaw = rutinerFields['Valda tjänster'] || rutinerFields['Valda tjanster'] || '';
    const valdaTjanster = typeof valdaTjansterRaw === 'string'
      ? valdaTjansterRaw.split(',').map(s => s.trim()).filter(Boolean)
      : (Array.isArray(valdaTjansterRaw) ? valdaTjansterRaw.map(s => String(s).trim()).filter(Boolean) : []);
    for (const raw of valdaTjanster) {
      const n = resolveTjanstNamn(raw);
      if (!n) continue;
      if (!tjanstByName.has(n)) {
        tjanstByName.set(n, { namn: n, beskrivning: '', riskbedomning: '', atgard: '', typ: '', antal: null });
      }
    }
    const tjanster = Array.from(tjanstByName.values()).filter((row) => {
      const n = (row.namn || '').trim();
      return n && !isAirtableRecordId(n);
    });

    const statistikText = [
      'STATISTIK FÖR RISKBEDÖMNING (byråns kunder):',
      `- Antal kunder: ${statistik.antalKunder ?? '–'}`,
      `- Risknivåer: Låg ${statistik.riskniva?.Låg ?? 0}, Medel ${statistik.riskniva?.Medel ?? 0}, Hög ${statistik.riskniva?.Hög ?? 0}`,
      statistik.tjänster && statistik.tjänster.length
        ? '- Tjänster (antal kunder): ' + statistik.tjänster.map(t => `${t.namn} (${t.antal})`).join(', ')
        : '',
      statistik.högriskbransch && statistik.högriskbransch.length
        ? '- Högriskbranscher: ' + statistik.högriskbransch.map(b => `${b.namn} (${b.antal})`).join(', ')
        : '',
      statistik.riskfaktorerPerTyp && statistik.riskfaktorerPerTyp.length
        ? '- Riskfaktorer per typ: ' + statistik.riskfaktorerPerTyp.map(r =>
            `${r.typ}: ${(r.riskfaktorer || []).map(rf => `${rf.namn} (${rf.antal})`).join(', ')}`
          ).join('; ')
        : ''
    ].filter(Boolean).join('\n');

    const allaRiskfaktorerText = statistik.riskfaktorerPerTyp && statistik.riskfaktorerPerTyp.length
      ? '\n\nALLA RISKFAKTORER SOM MÅSTE INKLUDERAS I ANALYSEN (Kunder/övergripande):\n' + statistik.riskfaktorerPerTyp.map(r =>
          `${r.typ}: ${(r.riskfaktorer || []).map(rf => `${rf.namn} (${rf.antal} kunder)`).join(', ')}`
        ).join('\n')
      : '';

    const allaTjansterLista = tjanster.length
      ? '\n\nALLA TJÄNSTER SOM MÅSTE HA EGEN SEKTION (du MÅSTE skriva en sektion för varje, utelämna INGEN):\n' + tjanster.map(t => `- ${t.namn}${t.antal != null ? ` (${t.antal} kunder)` : ''}`).join('\n')
      : '';

    const tjansterText = tjanster.length
      ? 'BYRÅNS TJÄNSTER OCH RISKFAKTORER (grunden – använd dessa analyser där tillgängliga; för tjänster utan analys, skriv utifrån tjänstens namn):\n' + tjanster.map(t =>
          `\n--- Tjänst: ${t.namn}${t.typ ? ` [${t.typ}]` : ''}${t.antal != null ? ` (${t.antal} kunder)` : ''} ---\nBeskrivning av riskfaktor: ${(t.beskrivning || '').trim() || '—'}\nRiskbedömning: ${(t.riskbedomning || '').trim() || '—'}\nÅtgärd: ${(t.atgard || '').trim() || '—'}`
        ).join('\n')
      : 'Inga tjänster hittades.';

    const byraProfilBlock = formatByraProfilPromptBlock(mapByraProfilFromAirtable(rutinerFields));

    const formatExample = `FORMAT – Enligt penningtvättslagen och Länsstyrelsens vägledning MÅSTE en godkänd allmän riskbedömning analysera hot och sårbarheter utifrån fyra obligatoriska huvudområden (plus ett femte valfritt). Du ska skriva ALLA:

1) PRODUKTER OCH TJÄNSTER – Skriv för varje tjänst en sektion med rubriken "Tjänst: [namn]"
2) KUNDER – Obligatoriskt. Analysera varför just era kundtyper medför en viss risk (t.ex. småföretag, hantverkare, konsulter). Länsstyrelsen delar ut sanktionsavgifter till byråer som endast analyserar tjänster och glömmer kunder.
3) DISTRIBUTIONSKANALER – Obligatoriskt. Hur levererar ni tjänster? Fysiska möten vs digitalt på distans. Kunder ni aldrig träffar innebär högre risk.
4) GEOGRAFISKA RISKFAKTORER – Obligatoriskt. Var är kunderna verksamma, varifrån kommer pengarna? Lokala kunder vs internationella transaktioner.
5) VERKSAMHETSSPECIFIKA OMSTÄNDIGHETER – Valfritt men rekommenderat. Byråns struktur (enstaka byrå, antal anställda, omsättning). Sårbarheter som avsaknad av intern kontroll, styrkor som full insyn.

Varje sektion ska ha EXAKT samma struktur (korta labels):

[Rubrik: t.ex. Tjänst: Löpande bokföring, eller Kunder, eller Distributionskanaler, eller Geografiska riskfaktorer, eller Verksamhetsspecifika omständigheter]

[Beskrivning – första stycket UTAN label.]

Hot: [text]

Sårbarhet: [text]

Risknivå och åtgärder: [text]

Skriv INTE "Beskrivning av tjänsten:" eller långa förklaringar i parentes. Använd endast "Hot:", "Sårbarhet:", "Risknivå och åtgärder:". Avsluta med en KORT övergripande slutsats som knyter ihop alla områden.

Exempel för "Löpande bokföring" (Tjänster):

Tjänst: Löpande bokföring

Byrån sköter den löpande bokföringen åt majoriteten av våra kunder, vilka i regel är småföretagare och hantverkare med 0–3 anställda. Tjänsten innebär att vi registrerar affärshändelser utifrån de underlag kunden lämnar in till oss digitalt eller fysiskt.

Hot: Löpande bokföring kan utnyttjas av kriminella för att integrera svarta pengar i det legala systemet. Ett typiskt hot är att kunden lämnar in osanna eller förfalskade fakturor för tjänster som aldrig utförts, i syfte att motivera överföringar mellan bolag. Ett annat hot är inbetalningar på företagskontot som saknar underlag eller vars avsändare är oklar, vilket kan vara ett försök att tvätta kontanter.

Sårbarhet: Vår främsta sårbarhet är att vi i stor utsträckning är beroende av att kunden lämnar in korrekta underlag. En annan sårbarhet är om underlag lämnas in sent eller klumpvis, vilket skapar tidspress och minskar möjligheten att hinna göra en rimlighetsbedömning av enskilda transaktioner.

Risknivå och åtgärder: Vi bedömer den sammantagna risken för tjänsten "Löpande bokföring" som Normal. Även om tjänsten i sig har en betydande inneboende risk, sänks risken av att vi har en nära och långvarig relation med våra kunder och förstår deras normala affärsmönster. För att hantera risken tillämpar vi skriftliga rutiner...`;

    const systemPrompt = `Du är en AML/KYC-specialist på en svensk redovisningsbyrå. Din uppgift är att skriva stycket "4. Identifierade Risker och Sårbarheter" i en allmän riskbedömning (PVML, Penningtvättslagen).

KUNSKAPSBAS (vector store / file_search): Du har tillgång till uppladdade officiella och rekommenderade dokument. Använd file_search FLITIGT innan du färdigställer texten. Väg in vägledning och krav från svenska och relevanta källor som kan finnas i arkivet, t.ex. Länsstyrelsen, Finansinspektionen, regeringens propositioner och förordningar, BRÅ, Polisen, internationella standarder där de är tillämpliga, och annan dokumentation om penningtvätt, riskbedömning och redovisningsbyråers skyldigheter. Din analys får INTE enbart återge byråns egna korta tjänstanalyser — den ska vara förenlig med ett riskbaserat förhållningssätt och vedertagen praxis enligt vad som framgår av kunskapsbasen. Om underlaget i arkivet stödjer mer detaljerade hot, sårbarheter eller åtgärder än byrån skrivit, ska du utveckla detta.

OTROLIGT VIKTIGT – Du MÅSTE inkludera VARJE tjänst och VARJE riskfaktor som listas i underlagen. Utelämna INGEN. Länsstyrelsen delar ut sanktionsavgifter till byråer som glömmer tjänster eller riskfaktorer. Skriv en egen sektion för varje tjänst.

En godkänd riskbedömning MÅSTE innehålla: 1) Produkter och tjänster – en sektion per tjänst, alla måste vara med, 2) Kunder – inklusive alla riskfaktorer, 3) Distributionskanaler, 4) Geografiska riskfaktorer. Valfritt: 5) Verksamhetsspecifika omständigheter.

Varje område ska ha samma struktur: beskrivning (utan label), Hot:, Sårbarhet:, Risknivå och åtgärder:. Avsluta med en kort övergripande slutsats. Följ Länsstyrelsens vägledning. Skriv på svenska. Var professionell, noggrann och konkret.

Skriv aldrig tekniska databas-ID som börjar med "rec" som tjänstnamn — använd endast riktiga tjänstenamn (t.ex. Löpande bokföring).`;

    const userPrompt = `Skriv stycket "4. Identifierade Risker och Sårbarheter" för byråns allmänna riskbedömning.

INNAN DU SKRIVER FÄRDIGT: Genomför en eller flera sökningar (file_search) i vector store efter relevant vägledning för varje huvudområde (tjänster, kunder, kanaler, geografi, verksamhet) och för tjänster med särskild exponering (t.ex. betalningsuppdrag, löner, moms). Kombinera det du hittar där med byråns statistik och egna texter nedan — byråns ifyllda analyser är underlag, inte den enda sanningen.

OTROLIGT VIKTIGT: Du MÅSTE inkludera VARJE tjänst och VARJE riskfaktor nedan. Utelämna INGEN. Länsstyrelsen kräver att alla tjänster och riskfaktorer som är aktuella för byrån analyseras.

1) Tjänster – en sektion per tjänst (Tjänst: [namn]). VARJE tjänst i listan nedan måste ha en egen sektion.
2) Kunder – analysera varför era kundtyper medför risk (småföretag, hantverkare etc.). Inkludera alla riskfaktorer från listan nedan. Hot, sårbarhet, risknivå.
3) Distributionskanaler – hur levererar ni tjänster? Fysiskt vs digitalt på distans. Kunder ni aldrig träffar = högre risk.
4) Geografiska riskfaktorer – var är kunderna verksamma? Lokala vs internationella transaktioner.
5) Verksamhetsspecifika omständigheter – byråns storlek, struktur. Enmansbyrå = sårbarhet (ingen kollega att bolla med) men också styrka (full insyn).

${formatExample}

---
${byraProfilBlock}

${allaTjansterLista}
${allaRiskfaktorerText}

UNDERLAG – Statistik och byråns tjänster:
${statistikText}

${tjansterText}

BEFINTLIG KONTEXT:
- Syfte och omfattning: ${(syfteOmfattning || '').slice(0, 500)}
- Beskrivning av verksamheten: ${(beskrivning || '').slice(0, 500)}
- Metod för riskbedömning: ${(metod || '').slice(0, 500)}
${befintligText ? `\nBefintlig text (förfina/uppdatera om relevant): ${befintligText.slice(0, 1200)}` : ''}

Ge endast den färdiga texten, utan ytterligare rubrik eller inledning. Skriv en sektion för VARJE tjänst i listan ovan – utelämna INGEN. Inkludera alla riskfaktorer i Kunder-analysen. Skriv också Kunder, Distributionskanaler, Geografiska riskfaktorer, och gärna Verksamhetsspecifika omständigheter. Avsluta med en kort övergripande slutsats.`;

    const fullPrompt = `${systemPrompt}\n\n---\n\n${userPrompt}`;
    const vectorS4 = process.env.OPENAI_VECTOR_STORE_ID_BYRA_S4 || process.env.OPENAI_VECTOR_STORE_ID || null;
    let text = await runOpenAIAssistantRun(openaiKey, fullPrompt, {
      maxWaitMs: 180000,
      vectorStoreId: vectorS4,
      debugMeta: { route: '/api/ai-identifierade-risker-byra', user: req.user?.email || '' }
    });

    if (!text) return res.status(500).json({ error: 'AI genererade ingen text.' });

    // Post-processing: ersätt gamla labels med önskat format (g = alla förekomster)
    text = text
      .replace(/\*\*Beskrivning av tjänsten:\*\*\s*/gi, '')
      .replace(/Beskrivning av tjänsten:\s*/gi, '')
      .replace(/\*\*Hot \(Hur kan tjänsten utnyttjas för penningtvätt\?\):\*\*\s*/gi, 'Hot: ')
      .replace(/Hot \(Hur kan tjänsten utnyttjas för penningtvätt\?\):\s*/gi, 'Hot: ')
      .replace(/\*\*Sårbarhet \(Vad gör vår byrå sårbar\?\):\*\*\s*/gi, 'Sårbarhet: ')
      .replace(/Sårbarhet \(Vad gör vår byrå sårbar\?\):\s*/gi, 'Sårbarhet: ')
      .replace(/\*\*Bedömd risknivå och åtgärder:\*\*\s*/gi, 'Risknivå och åtgärder: ')
      .replace(/Bedömd risknivå och åtgärder:\s*/gi, 'Risknivå och åtgärder: ');

    // Fetstil för rubriker (markdown **) – visning använder markdownToHtml som renderar ** som <strong>
    text = text
      .replace(/^Tjänst: (.+)$/gm, '**Tjänst: $1**')
      .replace(/^Kunder:?$/gm, '**Kunder**')
      .replace(/^Distributionskanaler:?$/gm, '**Distributionskanaler**')
      .replace(/^Geografiska riskfaktorer:?$/gm, '**Geografiska riskfaktorer**')
      .replace(/^Verksamhetsspecifika omständigheter:?$/gm, '**Verksamhetsspecifika omständigheter**')
      .replace(/^Hot: /gm, '**Hot:** ')
      .replace(/^Sårbarhet: /gm, '**Sårbarhet:** ')
      .replace(/^Risknivå och åtgärder: /gm, '**Risknivå och åtgärder:** ');

    // Ta bort tomrader inom samma sektion, men lägg en tomrad mellan varje sektion
    text = text.replace(/\n\n+/g, '\n');
    text = text.replace(/\n\*\*Tjänst: /g, '\n\n**Tjänst: ');
    text = text.replace(/\n\*\*Kunder\*\*/g, '\n\n**Kunder**');
    text = text.replace(/\n\*\*Distributionskanaler\*\*/g, '\n\n**Distributionskanaler**');
    text = text.replace(/\n\*\*Geografiska riskfaktorer\*\*/g, '\n\n**Geografiska riskfaktorer**');
    text = text.replace(/\n\*\*Verksamhetsspecifika omständigheter\*\*/g, '\n\n**Verksamhetsspecifika omständigheter**');

    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
    const airtableBaseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
    if (airtableAccessToken) {
      const idMap = await buildTjanstIdToNamnMap(airtableAccessToken, airtableBaseId, byraId, text);
      text = sanitizeIdentifieradeRiskerText(text, idMap);
    } else {
      text = stripEmptyTjanstRiskSections(text);
    }

    res.json({ text });
  } catch (error) {
    console.error('❌ AI identifierade risker byrå:', error.message);
    const msg = error.response?.data?.error || error.message || 'Kunde inte generera AI-förslag';
    res.status(500).json({ error: typeof msg === 'string' ? msg : 'Kunde inte generera AI-förslag.' });
  }
});

// POST /api/ai-beskrivning-byra
// Genererar AI-förslag för "2. Beskrivning av Byråns verksamhet" utifrån tjänster, statistik och syfte
app.post('/api/ai-beskrivning-byra', authenticateToken, async (req, res) => {
  const openaiKey = process.env.OPENAI_API_KEY;
  const baseUrl = `http://127.0.0.1:${process.env.PORT || 3001}`;
  const authHeader = getAuthHeaderForInternalRequests(req);

  if (!openaiKey) return res.status(500).json({ error: 'OPENAI_API_KEY saknas.' });
  if (!process.env.OPENAI_ASSISTANT_ID) return res.status(500).json({ error: 'OPENAI_ASSISTANT_ID saknas.' });

  try {
    const userData = await getAirtableUser(req.user.email);
    if (!userData) return res.status(404).json({ error: 'Användaren hittades inte.' });
    const byraId = (userData.byraId || '').toString().trim();
    if (!byraId) return res.status(400).json({ error: 'Ingen byrå kopplad till användaren.' });

    const [statRes, tjansterRes, rutinerRes] = await Promise.all([
      axios.get(`${baseUrl}/api/statistik-riskbedomning`, { headers: authHeader, timeout: 15000 }),
      axios.get(`${baseUrl}/api/byra-tjanster?byraId=${encodeURIComponent(byraId)}`, { headers: authHeader, timeout: 10000 }),
      axios.get(`${baseUrl}/api/byra-rutiner`, { headers: authHeader, timeout: 10000 })
    ]);

    const statistik = statRes.data || {};
    const tjanster = (tjansterRes.data && tjansterRes.data.tjanster) || [];
    const rutinerFields = (rutinerRes.data && rutinerRes.data.fields) || {};

    const syfteOmfattning = rutinerFields['1. Syfte och Omfattning'] || rutinerFields['Syfte och Omfattning'] || '';
    const befintligBeskrivning = rutinerFields['2. Beskrivning av Byråns verksamhet'] || rutinerFields['Beskrivning av Byråns verksamhet'] || '';
    const antalAnstallda = rutinerFields['Antal anställda'] ?? '';
    const omsattning = rutinerFields['Omsättning'] ?? '';
    const antalKundforetag = rutinerFields['Antal kundföretag'] ?? '';

    const statistikText = [
      'STATISTIK:',
      `- Antal kunder: ${statistik.antalKunder ?? '–'}`,
      `- Risknivåer: Låg ${statistik.riskniva?.Låg ?? 0}, Medel ${statistik.riskniva?.Medel ?? 0}, Hög ${statistik.riskniva?.Hög ?? 0}`,
      statistik.tjänster && statistik.tjänster.length
        ? '- Tjänster (antal kunder per tjänst): ' + statistik.tjänster.map(t => `${t.namn} (${t.antal})`).join(', ')
        : '',
      statistik.högriskbransch && statistik.högriskbransch.length
        ? '- Högriskbranscher: ' + statistik.högriskbransch.map(b => `${b.namn} (${b.antal})`).join(', ')
        : ''
    ].filter(Boolean).join('\n');

    const tjansterLista = tjanster.length
      ? tjanster.map(t => t.namn).join(', ')
      : 'Inga tjänster registrerade';

    const byraProfilBlock = formatByraProfilPromptBlock(mapByraProfilFromAirtable(rutinerFields));

    const systemPrompt = `Du är en AML/KYC-specialist på en svensk redovisningsbyrå. Din uppgift är att skriva stycket "2. Beskrivning av Byråns verksamhet" i en allmän riskbedömning (PVML, Penningtvättslagen).

Beskriv byråns verksamhet utifrån underlagen: vilka tjänster ni erbjuder, vilken typ av kunder ni har, byråns storlek (antal anställda, omsättning, antal kundföretag) och hur verksamheten bedrivs. Följ Länsstyrelsens vägledning. Skriv på svenska. Var professionell, konkret och kortfattad. Text ska kunna användas direkt i riskbedömningen.`;

    const userPrompt = `Skriv stycket "2. Beskrivning av Byråns verksamhet" för byråns allmänna riskbedömning.

UNDERLAG:
${byraProfilBlock}

${statistikText}

Tjänster byrån erbjuder: ${tjansterLista}

Byråns nyckeltal: Antal anställda ${antalAnstallda || '–'}, Omsättning ${omsattning ? omsattning + ' SEK' : '–'}, Antal kundföretag ${antalKundforetag || '–'}

Syfte och omfattning (kontext): ${(syfteOmfattning || '').slice(0, 600)}
${befintligBeskrivning ? `\nBefintlig beskrivning (förfina/uppdatera om relevant): ${befintligBeskrivning.slice(0, 1000)}` : ''}

Ge endast den färdiga texten, utan rubrik eller inledning.`;

    const text = await runOpenAIAssistantRun(openaiKey, `${systemPrompt}\n\n---\n\n${userPrompt}`, {
      maxWaitMs: 120000,
      debugMeta: { route: '/api/ai-beskrivning-byra', user: req.user?.email || '' }
    });
    if (!text) return res.status(500).json({ error: 'AI genererade ingen text.' });

    res.json({ text });
  } catch (error) {
    console.error('❌ AI beskrivning byrå:', error.message);
    const msg = error.response?.data?.error || error.message || 'Kunde inte generera AI-förslag';
    res.status(500).json({ error: typeof msg === 'string' ? msg : 'Kunde inte generera AI-förslag.' });
  }
});

// Data-source (Airtable) – explicit före 404 så den alltid finns
app.get('/api/data-source', handleDataSource);

// API-rutter som inte matchar → alltid JSON (inga HTML-svar)
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Endpoint hittades inte', path: req.path });
});

// Global felhanterare så att oväntade fel ger JSON, inte HTML
app.use((err, req, res, next) => {
  console.error('❌ Oväntat serverfel:', err.message);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Serverfel: ' + (err.message || 'Något gick fel') });
});
