const express = require('express');
const axios = require('axios');
const Airtable = require('airtable');
const crypto = require('crypto');
const AdmZip = require('adm-zip');
const { PDFDocument } = require('pdf-lib');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const OpenAI = require('openai');
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
console.log('  DILISENSE_API_KEY:', process.env.DILISENSE_API_KEY ? 'SET' : 'NOT SET');
console.log('');

const app = express();
const PORT = process.env.PORT || 3001;

// Trust proxy för Render
app.set('trust proxy', 1);

// Middleware
// CORS-konfiguration - tillåt alla origins
app.use((req, res, next) => {
    // Sätt CORS headers för alla requests
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    
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
app.use(express.json());
 
 // Serve static frontend
 app.use(express.static(path.join(__dirname, 'public')));

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

// Authentication endpoints
// Airtable Users table integration
const USERS_TABLE = 'Application Users';

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

// JWT Secret (in production, use a strong secret from environment variables)
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

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

// Login endpoint
app.post('/api/auth/login', async (req, res) => {
  try {
    console.log('🔐 Login attempt received:', {
      body: req.body,
      headers: req.headers,
      origin: req.headers.origin,
      hostname: req.hostname
    });

    const { email, password } = req.body;

    if (!email || !password) {
      console.log('🔐 Login failed: Missing email or password');
      return res.status(400).json({ 
        success: false, 
        message: 'E-post och lösenord krävs' 
      });
    }

    console.log(`🔐 Attempting login for email: ${email}`);

    // Get user from Airtable
    const user = await getAirtableUser(email);
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

    res.json({
      success: true,
      message: 'Inloggning lyckades',
      token,
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

// Logout endpoint
app.post('/api/auth/logout', authenticateToken, (req, res) => {
  console.log(`🔐 User logged out: ${req.user.email}`);
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

// Kända användare – extra kontext så Annika AI kan skoja/vara personlig (nycklar: namn i lowercase)
const CHAT_PERSONAS = {
  fredrik: 'Fredrik bor i Alvesta och jobbar på Slipp Redovisning. Hans särbo Marit bor i Jönköping – Fredrik vill flytta dit också. Han har två barn: Siri och Lilly (Lilly är transtjej). Du får gärna skoja vänligt med honom och nämna Alvesta, Jönköping, flytten, Marit, Slipp eller barnen när det passar.',
  annika: 'Det är Annika själv – hon bor i Ljungby. Du kan vara extra avslappnad och kanske skoja om att hon pratar med sig själv.'
};

// ============================================================
// POST /api/ai-chat — Chatta med AI (Annika) om systemet och riskbedömningar
// ============================================================
app.post('/api/ai-chat', authenticateToken, async (req, res) => {
  console.log('💬 POST /api/ai-chat anropad');
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) return res.status(500).json({ error: 'OPENAI_API_KEY saknas.' });

  const { message, history = [] } = req.body;
  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'Meddelande krävs.' });
  }

  const userName = (req.user && req.user.name) ? String(req.user.name).trim() : 'Okänd';
  const userByra = (req.user && req.user.byra) ? String(req.user.byra).trim() : '';
  const whoChats = userByra ? `${userName} från ${userByra}` : userName;
  const nameLower = userName.toLowerCase();
  let personaExtra = '';
  for (const [key, text] of Object.entries(CHAT_PERSONAS)) {
    if (nameLower.includes(key)) {
      personaExtra = `\nKontext om den som chattar: ${text}`;
      break;
    }
  }

  try {
    const openai = new OpenAI({ apiKey: openaiKey });
    const systemContent = `Du är Annika – en vänlig, kunnig och klämkäck person som hjälper användare av ClientFlow (kundhantering och riskbedömning på svenska redovisningsbyråer). Du svarar alltid i första person som Annika, på svenska.

Om mig: Jag bor i Ljungby och har tre barn – Rakel som är 2, Lilly 15 och Tove 18. Fredrik Grengby är min kompis och driver också egen redovisningsbyrå. Du kan nämna det när det passar i samtalet.

Vem som chattar nu: ${whoChats}.${personaExtra}

Du hjälper till med:
- Hur systemet fungerar (kundkort, riskbedömning, KYC, tjänster, PEP, åtgärder)
- Hur man tänker och arbetar vid riskbedömning av kunder och tjänster enligt PVML (penningtvättslagen)
- Rekommendationer och bästa praxis för motiveringar och risksänkande åtgärder
Var varm och professionell men också lite käck och rolig – t.ex. "Hallå brottsbekämpare" eller "Inte alla hjältar bär cape, en del bär terminalglasögon och miniräknare". Håll svaren tydliga och koncisa, med en lätt humor när det passar. Om du inte vet något, säg det ärligt.`;

    const messages = [
      { role: 'system', content: systemContent },
      ...history.slice(-20).map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: message.trim() }
    ];

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages,
      temperature: 0.5
    });

    const reply = completion.choices[0]?.message?.content?.trim() || 'Kunde inte generera svar.';
    res.json({ reply });
  } catch (error) {
    console.error('❌ AI-chat fel:', error.message);
    res.status(500).json({ error: 'Chatten svarade inte: ' + error.message });
  }
});

// Get current user endpoint
app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    // Hämta komplett användardata från Airtable
    const userData = await getAirtableUser(req.user.email);
    
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
    
    // Hämta data från Airtable
    const airtableResponse = await axios.get(
      `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${process.env.AIRTABLE_TABLE_NAME}/${recordId}`,
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

// Debug endpoint för Softr
app.post('/debug-softr', (req, res) => {
  console.log('🔍 DEBUG: Vad Softr skickar:', {
    body: req.body,
    headers: req.headers,
    method: req.method,
    url: req.url,
    availableFields: Object.keys(req.body || {})
  });
  
  res.json({
    success: true,
    message: 'Debug data mottaget',
    receivedBody: req.body,
    availableFields: Object.keys(req.body || {}),
    timestamp: new Date().toISOString()
  });
});

// GET version av debug endpoint för Softr
app.get('/debug-softr', (req, res) => {
  console.log('🔍 DEBUG GET: Vad Softr skickar:', {
    query: req.query,
    headers: req.headers,
    method: req.method,
    url: req.url,
    availableFields: Object.keys(req.query || {})
  });
  
  res.json({
    success: true,
    message: 'Debug GET data mottaget',
    receivedQuery: req.query,
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
    const airtableBaseId = process.env.AIRTABLE_BASE_ID;
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

async function getBolagsverketToken() {
  // Kontrollera om vi har en giltig token
  if (bolagsverketToken && tokenExpiry && new Date() < tokenExpiry) {
    return bolagsverketToken;
  }

  try {
    const environment = process.env.BOLAGSVERKET_ENVIRONMENT || 'test';
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
    const environment = process.env.BOLAGSVERKET_ENVIRONMENT || 'test';
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

    let cleanOrgNumber = organisationsnummer.replace(/[-\s]/g, '');
    
    // Använd produktionsmiljö för riktiga organisationsnummer
    const currentEnvironment = process.env.BOLAGSVERKET_ENVIRONMENT || 'prod';
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
    const environment = process.env.BOLAGSVERKET_ENVIRONMENT || 'test';
    const orgUrl = environment === 'test'
      ? 'https://gw-accept2.api.bolagsverket.se/vardefulla-datamangder/v1/organisationer'
      : 'https://gw.api.bolagsverket.se/vardefulla-datamangder/v1/organisationer';

    // Använd rätt JSON-format för Bolagsverket API enligt Swagger-dokumentationen
    const requestBody = {
      identitetsbeteckning: cleanOrgNumber
    };

    console.log(`🔍 Skickar till Bolagsverket:`, {
      url: orgUrl,
      body: requestBody,
      orgNumber: cleanOrgNumber,
      environment: environment
    });

    const response = await axios.post(orgUrl, requestBody, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': '*/*'
      },
      timeout: 15000
    });

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
    const environment = process.env.BOLAGSVERKET_ENVIRONMENT || 'test';
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
    const environment = process.env.BOLAGSVERKET_ENVIRONMENT || 'test';
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
    const { dokumentId } = req.params;
    
    console.log(`📥 Mottaget dokument-förfrågan:`, {
      dokumentId: dokumentId,
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

    // Generera unikt request ID
    const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const headers = {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/zip',
      'X-Request-Id': requestId
    };

    console.log(`🔍 Hämtar dokument med ID: ${dokumentId}`);

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
    console.error('Error fetching dokument:', error.message);
    
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



// Airtable integration endpoint - Förenklad version för testning
app.post('/api/bolagsverket/save-to-airtable', async (req, res) => {
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
    
    // Hämta användar-ID och byrå-ID från Softr
    const anvandareId = req.body.anvandareId || 
                       req.body.anvId || 
                       req.body.userId || 
                       req.body.anv_id ||
                       req.body.user_id ||
                       req.body['Användare'];
    
    const byraId = req.body.byraId || 
                   req.body.byra_id || 
                   req.body.agencyId || 
                   req.body.agency_id ||
                   req.body.byra_id ||
                   req.body['Byrå ID'];
    
    if (!organisationsnummer) {
      return res.status(400).json({
        error: 'Organisationsnummer är obligatoriskt',
        message: 'Organization number is required. Available fields: ' + Object.keys(req.body).join(', ')
      });
    }

    let cleanOrgNumber = organisationsnummer.replace(/[-\s]/g, '');
    
    // Använd produktionsmiljö för riktiga organisationsnummer
    const environment = process.env.BOLAGSVERKET_ENVIRONMENT || 'prod';
    if (environment === 'test' && (cleanOrgNumber === '199105294475' || cleanOrgNumber === '5567223705')) {
      console.log(`⚠️ Använder känt fungerande testnummer istället för ${cleanOrgNumber}`);
      cleanOrgNumber = '193403223328';
    }
    
    const token = await getBolagsverketToken();
    const orgUrl = environment === 'test'
      ? 'https://gw-accept2.api.bolagsverket.se/vardefulla-datamangder/v1/organisationer'
      : 'https://gw.api.bolagsverket.se/vardefulla-datamangder/v1/organisationer';

    // Hämta data från Bolagsverket
    const requestBody = {
      identitetsbeteckning: cleanOrgNumber
    };

    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': '*/*'
    };

    console.log('🔍 Calling Bolagsverket API:', {
      url: orgUrl,
      requestBody: requestBody,
      headers: headers,
      orgNumber: cleanOrgNumber
    });

    let bolagsverketResponse;
    
    try {
      bolagsverketResponse = await axios.post(orgUrl, requestBody, {
        headers,
        timeout: 15000
      });

      console.log('✅ Bolagsverket API response received:', {
        status: bolagsverketResponse.status,
        hasData: !!bolagsverketResponse.data,
        hasOrganisationer: !!bolagsverketResponse.data?.organisationer,
        organisationerCount: bolagsverketResponse.data?.organisationer?.length || 0
      });

      if (!bolagsverketResponse.data?.organisationer?.[0]) {
        throw new Error('Ingen organisationsdata hittad från Bolagsverket');
      }
    } catch (bolagsverketError) {
      console.error('❌ Bolagsverket API error:', {
        message: bolagsverketError.message,
        status: bolagsverketError.response?.status,
        data: bolagsverketError.response?.data,
        stack: bolagsverketError.stack
      });
      
      // Om det är ett Bolagsverket-fel, returnera ett tydligt felmeddelande
      if (bolagsverketError.response?.status === 400) {
        return res.status(400).json({
          error: 'Bolagsverket API fel',
          message: 'Organisationsnummer kunde inte valideras av Bolagsverket',
          details: bolagsverketError.response.data,
          organisationsnummer: cleanOrgNumber
        });
      }
      
      throw new Error(`Bolagsverket API fel: ${bolagsverketError.message}`);
    }

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
      
      // Ladda ner alla årsredovisningar
      if (dokumentInfo.dokument.length > 0) {
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

        // Förbered data för Airtable med förbättrad mappning
        const airtableData = {
          fields: {
            'Orgnr': cleanOrgNumber,
            'Namn': companyNames.join(', ') || '',
            'Verksamhetsbeskrivning': descriptions.join(', ') || '',
            'Address': orgData.postadressOrganisation?.postadress ?
              `${orgData.postadressOrganisation.postadress.utdelningsadress || ''}, ${orgData.postadressOrganisation.postadress.postnummer || ''} ${orgData.postadressOrganisation.postadress.postort || ''}` : '',
            'Bolagsform': orgData.organisationsform?.klartext || '',
            'regdatum': orgData.organisationsdatum?.registreringsdatum || '',
            'registreringsland': orgData.registreringsland?.klartext || '',
            'Aktivt företag': isActiveCompany ? 'Ja' : 'Nej',
            'Användare': anvandareId ? Math.max(1, parseInt(anvandareId) || 1) : null,
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

    // Spara till Airtable
    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
    const airtableBaseId = process.env.AIRTABLE_BASE_ID;
    const airtableTableName = process.env.AIRTABLE_TABLE_NAME || 'KUNDDATA';

    if (!airtableAccessToken || !airtableBaseId) {
      console.log('⚠️ Airtable inte konfigurerat - returnerar data utan att spara');
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
        airtableError: 'AIRTABLE_ACCESS_TOKEN eller AIRTABLE_BASE_ID saknas i miljövariabler',
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

    // Create record in Airtable using axios directly
    console.log('💾 Saving to Airtable using axios...');
    
    const createUrl = `https://api.airtable.com/v0/${airtableBaseId}/${airtableTableName}`;
    
    const airtableResponse = await axios.post(createUrl, {
      records: [{ fields: airtableData.fields }]
    }, {
      headers: {
        'Authorization': `Bearer ${airtableAccessToken}`,
        'Content-Type': 'application/json'
      },
      timeout: 15000
    });

    const duration = Date.now() - startTime;

    const responseData = {
      success: true,
      message: 'Data sparad till Airtable',
      airtableRecordId: airtableResponse.data.records[0].id,
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
      recordId: airtableResponse.data.records[0].id,
      duration: duration
    });
    
    console.log(`📊 Airtable fields sent:`, airtableData.fields);
    console.log(`📊 Airtable response fields:`, airtableResponse.data.records[0].fields);

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
    console.log('💾 Simple save-to-airtable called with:', req.body);
    
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
    const airtableBaseId = process.env.AIRTABLE_BASE_ID;
    const airtableTableName = process.env.AIRTABLE_TABLE_NAME || 'KUNDDATA';
    
    if (!airtableAccessToken || !airtableBaseId) {
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

// Test endpoint för att verifiera Airtable-anslutning
app.post('/api/test-airtable-connection', async (req, res) => {
  try {
    console.log('🧪 Testing Airtable connection...');
    
    // Kontrollera om Airtable är konfigurerat
    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
    const airtableBaseId = process.env.AIRTABLE_BASE_ID;
    const airtableTableName = process.env.AIRTABLE_TABLE_NAME || 'KUNDDATA';
    
    console.log('🔧 Airtable config check:', {
      hasToken: !!airtableAccessToken,
      hasBaseId: !!airtableBaseId,
      hasTableName: !!airtableTableName,
      tokenLength: airtableAccessToken ? airtableAccessToken.length : 0,
      baseId: airtableBaseId,
      tableName: airtableTableName
    });
    
    if (!airtableAccessToken || !airtableBaseId) {
      return res.json({
        success: false,
        message: 'Airtable inte konfigurerat',
        config: {
          hasToken: !!airtableAccessToken,
          hasBaseId: !!airtableBaseId,
          hasTableName: !!airtableTableName
        }
      });
    }
    
    // Testa anslutning genom att hämta en post
    const testUrl = `https://api.airtable.com/v0/${airtableBaseId}/${airtableTableName}?maxRecords=1`;
    
    try {
      const response = await axios.get(testUrl, {
        headers: {
          'Authorization': `Bearer ${airtableAccessToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });
      
      res.json({
        success: true,
        message: 'Airtable-anslutning fungerar',
        status: response.status,
        recordCount: response.data.records?.length || 0,
        config: {
          baseId: airtableBaseId,
          tableName: airtableTableName,
          hasToken: !!airtableAccessToken
        }
      });
      
    } catch (airtableError) {
      console.error('Airtable connection test failed:', {
        status: airtableError.response?.status,
        data: airtableError.response?.data,
        message: airtableError.message
      });
      
      res.json({
        success: false,
        message: 'Airtable-anslutning misslyckades',
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
    console.error('Test Airtable connection error:', error);
    res.status(500).json({
      success: false,
      message: 'Fel vid test av Airtable-anslutning',
      error: error.message
    });
  }
});

// Debug endpoint för att se användardata (utan autentisering för testning)
app.get('/api/debug/user-data', async (req, res) => {
  try {
    const userEmail = req.user.email;
    console.log('🔍 Debug user-data endpoint called for email:', userEmail);
    
    // Hämta användardata från Airtable
    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
    const airtableBaseId = process.env.AIRTABLE_BASE_ID;
    
    if (!airtableAccessToken || !airtableBaseId) {
      return res.status(500).json({
        error: 'Airtable inte konfigurerat',
        message: 'AIRTABLE_ACCESS_TOKEN eller AIRTABLE_BASE_ID saknas'
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
    console.log('🧪 Test endpoint called with:', req.body);
    
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
      receivedData: req.body
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

// Hjälp: spara attachment till Airtable via base64 (när localhost-URL inte fungerar för Airtable)
async function uploadAttachmentToAirtable(airtableToken, baseId, recordId, fileBuffer, filename, contentType) {
  const fieldNames = ['Dokumentation', 'Attachments', 'PEP rapporter', 'PEP rapport'];
  const base64 = fileBuffer.toString('base64');
  for (const fieldName of fieldNames) {
    try {
      const url = `https://content.airtable.com/v0/${baseId}/${recordId}/${encodeURIComponent(fieldName)}/uploadAttachment`;
      const res = await axios.post(url, {
        contentType: contentType || 'application/pdf',
        file: base64,
        filename
      }, {
        headers: {
          'Authorization': `Bearer ${airtableToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 20000,
        maxContentLength: 10 * 1024 * 1024,
        maxBodyLength: 10 * 1024 * 1024
      });
      if (res.data && (res.data.url || res.data.id)) {
        console.log('✅ PEP-rapport uppladdad till Airtable via Content API, fält:', fieldName);
        return true;
      }
    } catch (err) {
      if (err.response?.status === 404 || err.response?.status === 422) continue;
      console.warn('Upload till fält', fieldName, 'misslyckades:', err.message);
    }
  }
  return false;
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
    
    // Validera obligatoriska fält
    const requiredFieldIds = ['fld4yI8yL4PyHO5LX', 'fldA3OjtA9IOnH0XL', 'fldxHa72ao5Zpekt2', 'fldFQcjlerFO8GGQf', 'fldnrHoCosECXWaQM'];
    const missingFields = requiredFieldIds.filter(fieldId => !airtableData[fieldId]);
    
    if (missingFields.length > 0) {
      console.log('📝 Riskbedömning data:', airtableData);
      console.log('📝 Missing field IDs:', missingFields);
      return res.status(400).json({
        error: 'Saknade obligatoriska fält',
        message: `Följande fält är obligatoriska: ${missingFields.join(', ')}`,
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

// GET /api/airtable/config - Hämta Airtable-konfiguration
app.get('/api/airtable/config', (req, res) => {
  const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
  const airtableBaseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
  
  res.json({
    configured: !!airtableAccessToken,
    baseId: airtableBaseId,
    apiKey: airtableAccessToken ? '***' : null
  });
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
        error: 'Airtable API-nyckel saknas',
        message: 'AIRTABLE_ACCESS_TOKEN är inte konfigurerad'
      });
    }

    // Hämta komplett användardata för att få roll och byrå-ID
    const userData = await getAirtableUser(req.user.email);
    if (!userData) {
      return res.status(404).json({
        success: false,
        message: 'Användare hittades inte'
      });
    }

    console.log(`👤 Användare: ${userData.name} (${userData.role}) från ${userData.byra}`);
    console.log(`🏢 Byrå ID: ${userData.byraId}`);

    // Hämta kunden från Airtable
    const url = `https://api.airtable.com/v0/${airtableBaseId}/${KUNDDATA_TABLE}/${customerId}`;
    console.log(`🌐 Airtable URL: ${url}`);

    let customerRecord;
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
        const customerByraId = customerRecord.fields['Byrå ID'] || customerRecord.fields.Byrå;
        if (userData.byraId && customerByraId && userData.byraId.toString() === customerByraId.toString()) {
          hasAccess = true;
          console.log(`👔 Ledare: Har behörighet (Byrå ID matchar: ${userData.byraId})`);
        } else {
          console.log(`⚠️ Ledare: Ingen behörighet (Byrå ID: ${userData.byraId} vs ${customerByraId})`);
        }
        break;
        
      case 'Anställd':
        // Se poster där användarens ID finns i Användare-fältet
        const customerUsers = customerRecord.fields['Användare'] || [];
        const userIdString = userData.id ? userData.id.toString() : '';
        if (userIdString && (Array.isArray(customerUsers) ? customerUsers.includes(userIdString) : customerUsers === userIdString)) {
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

// PATCH /api/kunddata/:id - Uppdatera specifika fält på en kund i KUNDDATA
app.patch('/api/kunddata/:id', authenticateToken, async (req, res) => {
  try {
    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
    const airtableBaseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
    const KUNDDATA_TABLE = 'tblOIuLQS2DqmOQWe';

    if (!airtableAccessToken) {
      return res.status(500).json({ error: 'Airtable token saknas' });
    }

    const { id } = req.params;
    const { fields } = req.body;

    if (!fields) {
      return res.status(400).json({ error: 'Fält saknas i request body' });
    }

    // Ta bort tomma/undefined-värden — men behåll arrays (även tomma) för länkfält
    const cleanedFields = Object.fromEntries(
      Object.entries(fields).filter(([, v]) => {
        if (Array.isArray(v)) return true; // Behåll alltid arrays (länkfält)
        return v !== undefined && v !== null && v !== '';
      })
    );

    console.log(`📝 Uppdaterar kund ${id} i KUNDDATA:`, JSON.stringify(cleanedFields));

    const url = `https://api.airtable.com/v0/${airtableBaseId}/${KUNDDATA_TABLE}/${id}`;
    const airtableRes = await axios.patch(url,
      { fields: cleanedFields },
      { headers: { 'Authorization': `Bearer ${airtableAccessToken}`, 'Content-Type': 'application/json' } }
    );

    console.log('✅ Kund uppdaterad:', airtableRes.data.id);
    res.json({ success: true, id: airtableRes.data.id, record: airtableRes.data });

  } catch (error) {
    console.error('❌ Fel vid uppdatering av kund:', JSON.stringify(error.response?.data) || error.message);
    const status = error.response?.status || 500;
    const airtableErr = error.response?.data?.error;
    const message = airtableErr?.message || error.message || 'Okänt fel';
    res.status(status).json({ error: message, details: airtableErr });
  }
});

// POST /api/kunddata/:id/riskbedomning-pdf – Dokumentera riskbedömning som PDF, spara på kunden
app.post('/api/kunddata/:id/riskbedomning-pdf', authenticateToken, async (req, res) => {
  const KUNDDATA_TABLE = 'tblOIuLQS2DqmOQWe';
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
    const riskniva = f['Riskniva'] || f['sammanlagd risk'] || '';
    const riskbedomning = f['Byrans riskbedomning'] || '';
    const atgarder = f['Atgarder riskbedomning'] || '';
    const datumStr = new Date().toLocaleDateString('sv-SE');
    const datumIso = new Date().toISOString().split('T')[0];

    const escape = (s) => (s == null ? '' : String(s)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const nl2br = (s) => (s == null ? '' : String(s)).replace(/\n/g, '<br>');
    const toText = (v) => {
      if (v == null || v === '') return '';
      if (typeof v === 'string') return v;
      if (Array.isArray(v)) return v.map(b => b?.text ?? '').join('');
      return String(v);
    };
    const fmtList = (v) => Array.isArray(v) ? v.filter(Boolean) : (v ? [v] : []);
    const ACCENT = '#2c4a8f';

    const nivaLabel = { 'Lag': 'Låg risk', 'Låg': 'Låg risk', 'Medel': 'Medel risk', 'Hog': 'Hög risk', 'Hög': 'Hög risk' }[riskniva] || riskniva || 'Ej angiven';
    const nivaClass = { 'Lag': 'lag', 'Låg': 'lag', 'Medel': 'medel', 'Hog': 'hog', 'Hög': 'hog' }[riskniva] || 'medel';

    const section = (title, body) => body ? `<h2>${title}</h2><div class="section">${body}</div>` : '';

    // Hämta länkade tjänster
    let tjanster = [];
    const linkedIds = f['Kundens utvalda tjänster'] || [];
    if (linkedIds.length > 0) {
      try {
        const tjanstRes = await Promise.all(linkedIds.map(id =>
          axios.get(`https://api.airtable.com/v0/${airtableBaseId}/${RISK_ASSESSMENT_TABLE}/${id}`,
            { headers: { Authorization: `Bearer ${airtableAccessToken}` } }
          ).then(r => ({
            namn: r.data.fields?.['Task Name'] || '',
            beskrivning: toText(r.data.fields?.['Beskrivning av riskfaktor']),
            riskbedomning: r.data.fields?.['Riskbedömning'] || '',
            atgard: toText(r.data.fields?.['Åtgjärd'])
          })).catch(() => null)
        ));
        tjanster = tjanstRes.filter(Boolean).filter(t => t.namn);
      } catch (e) { console.warn('Tjänster för PDF:', e.message); }
    }

    const verksamhet = toText(f['Verksamhetsbeskrivning']) || toText(f['Beskrivning av kunden']) || '';
    const hogriskbransch = fmtList(f['Kunden verkar i en högriskbransch']);
    const riskhojTjanster = fmtList(f['Riskhöjande faktorer tjänster']);
    const riskhojOvrigt = fmtList(f['Riskhöjande faktorer övrigt']);
    const risksankande = fmtList(f['Risksänkande faktorer']);
    const pepList = fmtList(f['PEP']);
    const pepTräffar = f['Antal träffar PEP och sanktionslistor'];
    const riskUtford = f['Riskbedömning utförd datum'] ? new Date(f['Riskbedömning utförd datum']).toLocaleDateString('sv-SE') : '';
    const riskGodkand = f['Kundens riskbedömning godkänd'] ? new Date(f['Kundens riskbedömning godkänd']).toLocaleDateString('sv-SE') : '';

    const html = `<!DOCTYPE html><html lang="sv"><head><meta charset="UTF-8"><style>
      body{font-family:Arial,sans-serif;font-size:9pt;line-height:1.5;color:#1a1a2e;margin:0;padding:20px;}
      h1{color:${ACCENT};font-size:14pt;margin-bottom:8px;}
      .meta{color:#666;font-size:8pt;margin-bottom:20px;}
      h2{color:${ACCENT};font-size:11pt;border-bottom:1px solid ${ACCENT};padding-bottom:4px;margin-top:16px;}
      .section{margin:12px 0;}
      .niva{display:inline-block;padding:4px 12px;border-radius:4px;font-weight:700;}
      .niva-lag{background:#dcfce7;color:#166534;}
      .niva-medel{background:#fef9c3;color:#854d0e;}
      .niva-hog{background:#fee2e2;color:#991b1b;}
      .chips{display:flex;flex-wrap:wrap;gap:4px;margin:4px 0;}
      .chip{display:inline-block;padding:2px 8px;border-radius:4px;font-size:8pt;}
      .chip-neg{background:#fee2e2;color:#991b1b;}
      .chip-pos{background:#dcfce7;color:#166534;}
      .tjanst{margin:10px 0;padding:8px;background:#f8fafc;border-radius:4px;}
      .tjanst-namn{font-weight:600;}
      .tjanst-meta{font-size:8pt;color:#64748b;margin-top:4px;}
    </style></head><body>
      <h1>Riskbedömning – ${escape(kundnamn)}</h1>
      <p class="meta">Organisationsnummer: ${escape(orgnr)} | Dokumenterat: ${datumStr}${riskUtford ? ' | Utförd: ' + riskUtford : ''}${riskGodkand ? ' | Godkänd: ' + riskGodkand : ''}</p>

      ${verksamhet ? section('Beskrivning av verksamheten', nl2br(verksamhet)) : ''}

      <h2>Sammanlagd risknivå</h2>
      <p><span class="niva niva-${nivaClass}">${escape(nivaLabel)}</span></p>

      ${tjanster.length ? `
      <h2>Tjänster aktuella för kunden</h2>
      <div class="section">
        <ul style="margin:0;padding-left:1.2rem;">
          ${tjanster.map(t => `<li>${escape(t.namn)}${t.riskbedomning ? ' – ' + escape(t.riskbedomning) : ''}</li>`).join('')}
        </ul>
      </div>` : ''}

      ${(hogriskbransch.length || riskhojTjanster.length || riskhojOvrigt.length || risksankande.length) ? `
      <h2>Riskfaktorer aktuella för kunden</h2>
      <div class="section">
        ${hogriskbransch.length ? `<p><strong>Högriskbransch:</strong> ${hogriskbransch.map(i => escape(i)).join(', ')}</p>` : ''}
        ${riskhojTjanster.length ? `<p><strong>Riskhöjande – tjänster:</strong> ${riskhojTjanster.map(i => escape(i)).join(', ')}</p>` : ''}
        ${riskhojOvrigt.length ? `<p><strong>Riskhöjande – övrigt:</strong> ${riskhojOvrigt.map(i => escape(i)).join(', ')}</p>` : ''}
        ${risksankande.length ? `<p><strong>Risksänkande:</strong> ${risksankande.map(i => escape(i)).join(', ')}</p>` : ''}
      </div>` : ''}

      <h2>Byråns riskbedömning av kunden</h2>
      <div class="section">${riskbedomning ? nl2br(riskbedomning) : '—'}</div>
      <h2>Åtgärder</h2>
      <div class="section">${atgarder ? nl2br(atgarder) : '—'}</div>

      ${(pepList.length || (pepTräffar !== undefined && pepTräffar !== '')) ? `
      <h2>PEP &amp; sanktioner</h2>
      <div class="section">
        <p><strong>PEP-status:</strong> ${pepList.length ? escape(pepList.join(', ')) : '—'}${pepTräffar !== undefined && pepTräffar !== '' ? ` | Antal träffar: ${escape(String(pepTräffar))}` : ''}</p>
      </div>` : ''}

      <p class="meta" style="margin-top:24px;">ClientFlow – dokumenterat ${datumStr}</p>
    </body></html>`;

    const pup = loadPuppeteer();
    if (!pup) return res.status(501).json({ error: 'PDF-generering ej tillgänglig (puppeteer saknas)' });
    const launchOpts = { args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'], headless: true, timeout: 30000 };
    if (chromium) launchOpts.executablePath = await chromium.executablePath();
    const browser = await pup.launch(launchOpts);
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });
    const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '15mm', right: '15mm', bottom: '15mm', left: '15mm' } });
    await browser.close();

    const safeNamn = (kundnamn || 'kund').replace(/[^a-zA-Z0-9\u00e5\u00e4\u00f6\u00c5\u00c4\u00d6 -]/g, '').trim().replace(/\s+/g, '-');
    const filename = `Riskbedomning-${safeNamn}-${datumIso}.pdf`;

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
    const { customerId } = req.query;
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
    const riskField = Array.isArray(f['Riskbedömning dokument']) ? 'Riskbedömning dokument' : 'Riskbedomning dokument';
    const pepField = Array.isArray(f['PEP rapporter']) ? 'PEP rapporter' : 'PEP rapport';
    const riskDocs = Array.isArray(f[riskField]) ? f[riskField] : [];
    const pepDocs = Array.isArray(f[pepField]) ? f[pepField] : [];

    const allItems = [];
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
    });

    const documents = allItems.map((a, i) => {
      const isPep = a._typ === 'pep';
      const datum = a.createdTime || (a.filename || '').match(/\d{4}-\d{2}-\d{2}/)?.[0] || '';
      return {
        id: `${a._typ}-${i}`,
        sourceField: a._sourceField,
        sourceIndex: a._sourceIndex,
        fields: {
          Namn: a.filename || (isPep ? `PEP-screening ${i + 1}` : `Riskbedömning ${i + 1}`),
          Filtyp: 'PDF',
          Beskrivning: isPep ? 'PEP & sanktionsscreening' : 'Dokumenterad riskbedömning',
          UppladdadDatum: datum,
          UppladdadAv: ''
        },
        url: a.url,
        filename: a.filename
      };
    });

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

    res.json({ success: true, message: 'Dokument borttaget' });
  } catch (error) {
    console.error('\u274c DELETE document:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/kunddata/create - Skapa ny kund i KUNDDATA
app.post('/api/kunddata/create', authenticateToken, async (req, res) => {
  try {
    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
    const airtableBaseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
    const KUNDDATA_TABLE = 'tblOIuLQS2DqmOQWe';

    if (!airtableAccessToken) {
      return res.status(500).json({ error: 'Airtable token saknas' });
    }

    const { fields } = req.body;
    if (!fields) {
      return res.status(400).json({ error: 'Fält saknas i request body' });
    }

    // Dubblettcheck: samma Orgnr + samma Byrå ID för denna byrå
    const orgnr  = fields['Orgnr']   || '';
    const byraId = fields['Byrå ID'] || '';
    if (orgnr && byraId) {
      const checkFormula = `AND({Orgnr}="${orgnr}",{Byrå ID}="${byraId}")`;
      const checkUrl = `https://api.airtable.com/v0/${airtableBaseId}/${KUNDDATA_TABLE}?filterByFormula=${encodeURIComponent(checkFormula)}&maxRecords=1&fields[]=Namn`;
      const checkRes = await axios.get(checkUrl, {
        headers: { 'Authorization': `Bearer ${airtableAccessToken}` }
      });
      if (checkRes.data.records?.length > 0) {
        const existing = checkRes.data.records[0];
        console.log(`⚠️ Dublett: ${orgnr} finns redan för byrå ${byraId} (id: ${existing.id})`);
        return res.status(409).json({
          error: 'duplicate',
          message: `Företaget är redan upplagt som kund hos er byrå.`,
          existingId: existing.id,
          existingNamn: existing.fields?.Namn || ''
        });
      }
    }

    console.log('📤 Skapar ny kund i KUNDDATA:', fields);

    const url = `https://api.airtable.com/v0/${airtableBaseId}/${KUNDDATA_TABLE}`;
    const airtableRes = await axios.post(url,
      { fields },
      { headers: { 'Authorization': `Bearer ${airtableAccessToken}`, 'Content-Type': 'application/json' } }
    );

    console.log('✅ Kund skapad i KUNDDATA:', airtableRes.data.id);
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
    res.json({
      success: true,
      record: { id: record.id, fields: record.fields },
      fields: record.fields,
      id: record.id
    });
  } catch (error) {
    console.error('❌ GET /api/byra-rutiner:', error.response?.data || error.message);
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
        error: 'Airtable API-nyckel saknas',
        message: 'AIRTABLE_ACCESS_TOKEN är inte konfigurerad'
      });
    }

    // Hämta komplett användardata för att få roll och byrå-ID
    const userData = await getAirtableUser(req.user.email);
    if (!userData) {
      return res.status(404).json({
        success: false,
        message: 'Användare hittades inte'
      });
    }

    console.log(`👤 Användare: ${userData.name} (${userData.role}) från ${userData.byra}`);
    console.log(`🏢 Byrå ID: ${userData.byraId}`);

    let filterFormula = '';
    
    // Rollbaserad filtrering
    switch (userData.role) {
      case 'ClientFlowAdmin':
        // Se allt - ingen filtrering
        console.log('🔓 ClientFlowAdmin: Visar alla poster');
        break;
        
      case 'Ledare':
        // Se alla poster med samma Byrå ID
        if (userData.byraId) {
          const _byraIdNum1 = parseInt(userData.byraId);
          filterFormula = isNaN(_byraIdNum1) ? `{Byrå ID}="${userData.byraId}"` : `{Byrå ID}=${_byraIdNum1}`;
          console.log(`👔 Ledare: Filtrerar på Byrå ID: ${userData.byraId} (formel: ${filterFormula})`);
        } else {
          console.log('⚠️ Ledare utan Byrå ID: Visar inga poster');
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
        // Se poster där användarens ID finns i Användare-fältet
        if (userData.id) {
          filterFormula = `SEARCH("${userData.id}", {Användare})`;
          console.log(`👷 Anställd: Filtrerar på användar-ID: ${userData.id}`);
        } else {
          console.log('⚠️ Anställd utan användar-ID: Visar inga poster');
          return res.json({
            success: true,
            message: 'Anställd utan användar-ID - inga poster att visa',
            records: [],
            userRole: userData.role,
            userId: userData.id,
            timestamp: new Date().toISOString(),
            duration: Date.now() - startTime
          });
        }
        break;
        
      default:
        console.log(`⚠️ Okänd roll: ${userData.role} - visar inga poster`);
        return res.json({
          success: true,
          message: `Okänd användarroll: ${userData.role}`,
          records: [],
          userRole: userData.role,
          timestamp: new Date().toISOString(),
          duration: Date.now() - startTime
        });
    }

    // Bygg URL för Airtable API
    let url = `https://api.airtable.com/v0/${airtableBaseId}/${KUNDDATA_TABLE}`;
    if (filterFormula) {
      url += `?filterByFormula=${encodeURIComponent(filterFormula)}`;
    }
    
    console.log(`🌐 Airtable URL: ${url}`);

    // Hämta data från Airtable
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${airtableAccessToken}`,
        'Content-Type': 'application/json'
      },
      timeout: 15000
    });

    const records = response.data.records || [];
    console.log(`✅ Hämtade ${records.length} poster från KUNDDATA`);

    // Formatera svaret
    const formattedRecords = records.map(record => ({
      id: record.id,
      createdTime: record.createdTime,
      fields: record.fields
    }));

    const duration = Date.now() - startTime;

    res.json({
      success: true,
      message: `KUNDDATA hämtad för ${userData.role}`,
      records: formattedRecords,
      recordCount: records.length,
      userRole: userData.role,
      userByraId: userData.byraId,
      userId: userData.id,
      filterApplied: filterFormula || 'Ingen filtrering (ClientFlowAdmin)',
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
        if (userData.id) filterFormula = `SEARCH("${userData.id}", {Användare})`;
        else return res.json({ antalKunder: 0, riskniva: {}, tjänster: [], högriskbransch: [], riskfaktorerKund: [] });
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
      const namn = (tjanstIdToName[id] || id).trim() || id;
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
        if (userData.id) filterFormula = `SEARCH("${userData.id}", {Användare})`;
        else return res.json({ kunder: [] });
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
        error: 'Airtable API-nyckel saknas',
        message: 'AIRTABLE_ACCESS_TOKEN är inte konfigurerad'
      });
    }

    // Hämta komplett användardata för att få roll och byrå-ID
    const userData = await getAirtableUser(req.user.email);
    if (!userData) {
      return res.status(404).json({
        success: false,
        message: 'Användare hittades inte'
      });
    }

    console.log(`👤 Användare: ${userData.name} (${userData.role}) från ${userData.byra}`);
    console.log(`🏢 Byrå ID: ${userData.byraId}`);

    // Hämta filterFormula från request body om det finns
    const { filterFormula: customFilter, maxRecords } = req.body;
    
    let filterFormula = '';
    
    // Rollbaserad filtrering
    switch (userData.role) {
      case 'ClientFlowAdmin':
        // Se allt - ingen filtrering
        console.log('🔓 ClientFlowAdmin: Visar alla poster');
        break;
        
      case 'Ledare':
        // Se alla poster med samma Byrå ID
        if (userData.byraId) {
          const _byraIdNum2 = parseInt(userData.byraId);
          filterFormula = isNaN(_byraIdNum2) ? `{Byrå ID}="${userData.byraId}"` : `{Byrå ID}=${_byraIdNum2}`;
          console.log(`👔 Ledare: Filtrerar på Byrå ID: ${userData.byraId} (formel: ${filterFormula})`);
        } else {
          console.log('⚠️ Ledare utan Byrå ID: Visar inga poster');
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
        // Se poster där användarens ID finns i Användare-fältet
        if (userData.id) {
          filterFormula = `SEARCH("${userData.id}", {Användare})`;
          console.log(`👷 Anställd: Filtrerar på användar-ID: ${userData.id}`);
        } else {
          console.log('⚠️ Anställd utan användar-ID: Visar inga poster');
          return res.json({
            success: true,
            data: [],
            message: 'Anställd utan användar-ID - inga poster att visa',
            userRole: userData.role,
            userId: userData.id,
            timestamp: new Date().toISOString(),
            duration: Date.now() - startTime
          });
        }
        break;
        
      default:
        console.log(`⚠️ Okänd roll: ${userData.role} - visar inga poster`);
        return res.json({
          success: true,
          data: [],
          message: `Okänd användarroll: ${userData.role}`,
          userRole: userData.role,
          timestamp: new Date().toISOString(),
          duration: Date.now() - startTime
        });
    }

    // Bygg URL för Airtable API
    let url = `https://api.airtable.com/v0/${airtableBaseId}/${KUNDDATA_TABLE}`;
    const params = new URLSearchParams();
    
    if (filterFormula) {
      params.append('filterByFormula', filterFormula);
    }
    
    if (maxRecords) {
      params.append('maxRecords', maxRecords);
    }
    
    if (params.toString()) {
      url += `?${params.toString()}`;
    }
    
    console.log(`🌐 Airtable URL: ${url}`);

    // Hämta data från Airtable
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${airtableAccessToken}`,
        'Content-Type': 'application/json'
      },
      timeout: 15000
    });

    const records = response.data.records || [];
    console.log(`✅ Hämtade ${records.length} poster från KUNDDATA`);

    // Formatera svaret
    const formattedRecords = records.map(record => ({
      id: record.id,
      createdTime: record.createdTime,
      fields: record.fields
    }));

    const duration = Date.now() - startTime;

    res.json({
      success: true,
      data: formattedRecords,
      message: `KUNDDATA hämtad för ${userData.role}`,
      recordCount: records.length,
      userRole: userData.role,
      userByraId: userData.byraId,
      userId: userData.id,
      filterApplied: filterFormula || 'Ingen filtrering (ClientFlowAdmin)',
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
          if (testRole.userId) {
            filterFormula = `SEARCH("${testRole.userId}", {Användare})`;
            console.log(`👷 Anställd: Filtrerar på användar-ID: ${testRole.userId}`);
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
  
  console.log('📥 POST /api/notes - Request received');
  console.log('📥 Headers:', JSON.stringify(req.headers, null, 2));
  console.log('📥 Body:', JSON.stringify(req.body, null, 2));
  
  let cleanedFields = {};
  
  try {
    const noteData = req.body;
    
    console.log('🔍 Skapar ny anteckning:', noteData);
    
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

// ─── UPPDRAGSAVTAL ───────────────────────────────────────────────────────────
const UPPDRAGSAVTAL_TABLE = 'tblpKIMpde6sFFqDH'; // Uppdragsavtal tabell-ID
const airtableBaseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50'; // Global för alla uppdragsavtal-endpoints

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

    // Hämta inloggad användare för att få byraId och byranamn
    const inloggedUser = await getAirtableUser(userEmail);
    if (!inloggedUser) return res.status(404).json({ error: 'Användaren hittades inte' });

    const byraId   = inloggedUser.byraId || '';
    const byraNamn = inloggedUser.byra   || '';

    // Hämta alla konsulter på samma byrå
    const filterFormula = byraId
      ? `{Byrå ID i text 2}="${byraId}"`
      : `{Byrå}="${byraNamn}"`;

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

    // Hämta byråns orgnr från Application Users-posten
    const byraOrgnr = inloggedUser.orgnr || '';

    res.json({
      byraNamn,
      byraOrgnr,
      byraId,
      inloggadNamn: inloggedUser.name || '',
      konsulter,
      tjanster: byransTjanster,
      highRiskTjanster: byransHighRisk
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
    const nf = {};
    nf['Kundnamn']           = f['Kundnamn'] || f['Namn'] || '\u2014';
    nf['Orgnr']              = f['Orgnr'] || '';
    nf['Uppdragsansvarig']   = f['Uppdragsansvarig'] || '\u2014';
    nf['Avtalsdatum']        = f['Avtalsdatum'] || null;
    nf['Avtalet g\u00e4ller ifr\u00e5n'] = f['Avtalet g\u00e4ller ifr\u00e5n'] || f['Avtalet galler fran'] || null;
    nf['Upps\u00e4gningstid']     = f['Upps\u00e4gningstid'] ?? f['Uppsagningstid'] ?? null;
    nf['Ersättningsmodell']  = f['Ersättningsmodell'] || f['Ersattningsmodell'] || '';
    nf['Arvode']             = f['Arvode'] ?? null;
    nf['Arvodesperiod']      = f['Arvodesperiod'] || f['Arvodesperiod'] || 'm\u00e5nad';
    nf['Arvodekommentar']    = f['Arvodekommentar'] || '';
    nf['Fakturaperiod']      = f['Fakturaperiod'] || '';
    nf['Betalningsvillkor']  = f['Betalningsvillkor'] ?? null;
    nf['Kunden godkänner allmänna villkor']         = f['Kunden godkänner allmänna villkor'] || f['Kunden godkanner allm villkor'] || false;
    nf['Kunden godkänner personuppgiftsbiträdesavtal'] = f['Kunden godkänner personuppgiftsbiträdesavtal'] || f['Kunden godkanner puba'] || false;
    nf['Avtalsstatus']       = f['Avtalsstatus'] || f['Status'] || '';
    nf['Signeringsdatum']    = f['Signeringsdatum'] || null;
    nf['Signerat av kund']   = f['Signerat av kund'] || f['Signerat av kund'] || '';
    nf['Signerat av byr\u00e5']  = f['Signerat av byr\u00e5'] || f['Signerat av byra'] || '';
    nf['\u00d6vrigt uppdrag']    = f['\u00d6vrigt uppdrag'] || f['Ovrigt uppdrag'] || '';

    // Valda tjänster sparas som kommaseparerad sträng
    const valdaTjansterRaw = f['Valda tj\u00e4nster'] || f['Valda tjanster'] || '';
    const tjanster = typeof valdaTjansterRaw === 'string'
      ? valdaTjansterRaw.split(',').map(t => t.trim()).filter(Boolean)
      : (Array.isArray(valdaTjansterRaw) ? valdaTjansterRaw : []);

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
  .parter { display: flex; gap: 16px; margin-bottom: 18px; }
  .part { flex: 1; background: #f4f6fb; border: 1px solid #dce3f0;
          border-left: 4px solid ${ACCENT}; border-radius: 5px; padding: 10px 14px; }
  .part-label { font-size: 7pt; text-transform: uppercase; letter-spacing: 0.08em;
                color: ${ACCENT}; margin-bottom: 4px; font-weight: 700; }
  .part-name { font-size: 11pt; font-weight: 700; color: #1a1a2e; }
  .part-sub { font-size: 8.5pt; color: #666; margin-top: 2px; }

  /* ── Meta-rad ── */
  .meta-grid { display: flex; gap: 0; margin-bottom: 18px;
               border: 1px solid #dce3f0; border-radius: 5px; overflow: hidden; }
  .meta-item { flex: 1; padding: 8px 14px; border-right: 1px solid #dce3f0; background: #fafbfe; }
  .meta-item:last-child { border-right: none; }
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
    <h4 style="color:#007fa3;">Utf\u00f6rande</h4>
    <p>Uppdraget kommer att utf\u00f6ras i enlighet med den branschstandard som fastst\u00e4llts under Rex - Svensk standard f\u00f6r redovisningsuppdrag.</p>
    <p>Standarden har framtagits av branschorganisationen Srf konsulternas f\u00f6rbund. Standarden har som m\u00e5ls\u00e4ttning att uppn\u00e5 en h\u00f6g kvalitet p\u00e5 redovisningen och rapporteringen samt att det utf\u00f6rda arbetet utg\u00f6r ett bra beslutsunderlag i uppdragsgivarens verksamhet.</p>

    <h4 style="color:#007fa3;">Ansvar</h4>
    <p>Uppdragsgivaren har ett sj\u00e4lvst\u00e4ndigt ansvar f\u00f6r sin redovisning och rapportering mot myndigheter och utomst\u00e5ende. Det avser s\u00e5v\u00e4l brister i inl\u00e4mnade underlag som i rapporter d\u00e4r redovisningskonsulten har bitr\u00e4tt i arbetet. Detta f\u00f6ljer av lagstiftning och kan inte avtalas bort.</p>
    <p>Byr\u00e5n har ett utf\u00f6randeansvar mot uppdragsgivaren. Detta inneb\u00e4r att det arbete som omfattas av avtalet ska utf\u00f6ras enligt lagar och regler, samt enligt Rex - Svensk standard f\u00f6r redovisningsuppdrag.</p>

    <h4 style="color:#007fa3;">Uppdragsgivarens r\u00e4kenskapsinformation</h4>
    <p>Enligt kraven i bokf\u00f6ringslagen har uppdragsgivaren ansvar att bevara komplett r\u00e4kenskapsinformation i 7 \u00e5r efter r\u00e4kenskaps\u00e5rets utg\u00e5ng. Redovisningskonsulten ska upprätta och tillhandah\u00e5lla uppdragsgivaren den r\u00e4kenskapsinformation som f\u00f6ljer av uppdraget.</p>

    <h4 style="color:#007fa3;">Rapportmottagare</h4>
    <p>Den som \u00e4r angiven som kontaktperson hos uppdragsgivaren \u00e4r den som \u00e4r utsedd mottaga den rapportering och \u00f6vrig kommunikation som sker fr\u00e5n byr\u00e5n till uppdragsgivaren. Kontaktpersonen ansvarar f\u00f6r att erh\u00e5llen information vidarebefordras till ber\u00f6rda personer inom sin organisation. Rapportering till annan \u00e4n angiven person kr\u00e4ver s\u00e4rskilt godk\u00e4nnande av uppdragsgivaren.</p>
    <p>Om inget avtalats f\u00e5r uppdragstagaren l\u00e4mna information till bolagets revisor i samband med revision.</p>

    <h4 style="color:#007fa3;">Kvalitetsuppf\u00f6ljning</h4>
    <p>Hos byr\u00e5n anst\u00e4llda Auktoriserade Redovisningskonsulter genomg\u00e5r minst vart sj\u00e4tte \u00e5r kvalitetsuppf\u00f6ljning som genomf\u00f6rs av Srf konsulternas f\u00f6rbund. Kvalitetsuppf\u00f6ljningen \u00e4r en granskning av att den Auktoriserade Redovisningskonsulten f\u00f6ljt Rex - Svensk Standad f\u00f6r redovisningsuppdrag. Kvalitetsuppf\u00f6ljningen innefattas av tystnadplikt och sekretess. Kvalitetsuppf\u00f6ljningen inneb\u00e4r bl.a. att ett antal av byr\u00e5ns uppdrag kommer att granskas. Som underlag f\u00f6r kontrollen anv\u00e4nds ett antal transaktionsfiler fr\u00e5n bokf\u00f6ringssystemet. Filerna makuleras efter avslutad kvalitetsuppf\u00f6ljning. Uppdragsgivaren godk\u00e4nner genom detta avtal s\u00e5dan anv\u00e4ndning av material.</p>

    <h4 style="color:#007fa3;">Allm\u00e4nna villkor</h4>
    <p>Utöver vad som anges i detta avtal g\u00e4ller \u00e4ven Allm\u00e4nna villkor Srf konsulterna, vilka bifogas som bilaga.</p>
  </div>
</div>

<!-- ═══════════ SIDA 2: BILAGA 2 ═══════════ -->
<div class="page-break"></div>
<div class="section">
  <div class="section-title">Bilaga 2 \u2013 Allm\u00e4nna villkor</div>
  <div class="bilaga-wrap"><div class="villkor-text">
      <p>Dessa allm\u00e4nna villkor g\u00e4ller f\u00f6r uppdrag avseende redovisnings-, r\u00e5dgivnings- och andra granskningstj\u00e4nster som inte utg\u00f6r lagstadgad revision eller lagstadgade till\u00e4ggsuppdrag (\u201dUppdraget\u201d) som Byr\u00e5n \u00e5tar sig att utf\u00f6ra f\u00f6r Uppdragsgivarens r\u00e4kning.</p>
      <p>Dessa allm\u00e4nna villkor utg\u00f6r tillsammans med uppdragsavtalet (\u201dUppdragsavtalet\u201d), eller annan skriftlig \u00f6verenskommelse, hela avtalet mellan Byr\u00e5n och Uppdragsgivaren. Vid eventuella motstridigheter ska Uppdragsavtalet ha f\u00f6retr\u00e4de.</p>
      <h4>Byr\u00e5ns ansvar</h4>
      <ul>
        <li>Byr\u00e5n ska utf\u00f6ra Uppdraget med s\u00e5dan skicklighet och omsorg som f\u00f6ljer av till\u00e4mpliga lagar, f\u00f6rordningar och f\u00f6reskrifter samt god yrkessed i branschen.</li>
        <li>Byr\u00e5n ansvarar inte f\u00f6r slutsatser, rekommendationer och rapporter baserade p\u00e5 felaktig eller bristf\u00e4llig information fr\u00e5n Uppdragsgivaren eller tredje man som Uppdragsgivaren anvisat.</li>
        <li>Byr\u00e5n f\u00f6rpliktas att ta ansvar f\u00f6r skador som orsakats till f\u00f6ljd av Byr\u00e5ns brott mot \u00f6verenskommet avtal eller om fel i den levererade tj\u00e4nsten har beg\u00e5tts.</li>
        <li>Byr\u00e5n ska meddela Uppdragsgivaren avseende betydande fel eller uppgifter som uppt\u00e4cks i r\u00e4kenskapsmaterialet.</li>
        <li>Byr\u00e5n kan inte g\u00f6ras skadest\u00e5ndsskyldig f\u00f6r skador orsakade av att Uppdragsgivaren l\u00e4mnat ofullst\u00e4ndiga eller felaktiga uppgifter eller anvisningar.</li>
      </ul>
      <h4>Uppdragsgivarens ansvar</h4>
      <ul>
        <li>Uppdragsgivaren ansvarar f\u00f6r att de upplysningar och anvisningar som l\u00e4mnas till Byr\u00e5n \u00e4r korrekta och inte strider mot g\u00e4llande lagar.</li>
        <li>Uppdragsgivaren f\u00f6rpliktas att f\u00f6retagets skatter och avgifter redovisas och betalas och att aktuella tillst\u00e5nd f\u00f6r verksamheten \u00e4r aktuella.</li>
        <li>Uppdragsgivaren f\u00f6rpliktas till att r\u00e4kenskapsmaterial samlas in och bevaras.</li>
        <li>Uppdragsgivaren ska p\u00e5 beg\u00e4ran av Byr\u00e5n utan dr\u00f6jsm\u00e5l tillhandah\u00e5lla s\u00e5dan komplett och korrekt information som beh\u00f6vs f\u00f6r Uppdragets genomf\u00f6rande. Om Uppdragsgivaren dr\u00f6jer med att tillhandah\u00e5lla information kan detta orsaka f\u00f6rseningar och \u00f6kade kostnader. Byr\u00e5n ansvarar inte f\u00f6r s\u00e5dana f\u00f6rseningar och \u00f6kade kostnader.</li>
      </ul>
      <h4>Materialleveranser</h4>
      <p>Material ska levereras till Byr\u00e5n i s\u00e5 god tid att Byr\u00e5n kan utf\u00f6ra sina tj\u00e4nster p\u00e5 normal arbetstid och inom g\u00e4llande tidsfrister. Om parterna inte avtalat annat ska Uppdragsgivaren l\u00e4mna material enligt f\u00f6ljande:</p>
      <ul>
        <li>Underlag f\u00f6r den l\u00f6pande bokf\u00f6ringen l\u00e4mnas senast tio dagar efter utg\u00e5ngen av den period redovisningen g\u00e4ller.</li>
        <li>Underlag f\u00f6r l\u00f6neadministration och l\u00f6neber\u00e4kning l\u00e4mnas minst sju dagar f\u00f6re attest- och l\u00f6neutbetalningsdag.</li>
        <li>Bokslutsmaterial l\u00e4mnas senast 30 dagar efter r\u00e4kenskapsperiodens slut.</li>
        <li>Deklarations- och beskattningsmaterial l\u00e4mnas senast 30 dagar efter beskattnings\u00e5rets slut.</li>
      </ul>
      <h4>Sekretess och elektronisk kommunikation</h4>
      <p>Respektive Part f\u00f6rbinder sig att inte l\u00e4mna konfidentiell information om Uppdraget till utomst\u00e5ende, inte heller information om den andra Partens verksamhet, utan den andra Partens skriftliga samtycke \u2013 med undantag f\u00f6r vad som f\u00f6ljer av lag, professionell skyldighet eller myndighetsbeslut. Denna sekretessskyldighet forts\u00e4tter att g\u00e4lla \u00e4ven efter att avtalet har upph\u00f6rt. Parterna accepterar elektronisk kommunikation dem emellan och de risker denna medf\u00f6r.</p>
      <h4>Upps\u00e4gning</h4>
      <p>Uppdragsavtalet b\u00f6rjar g\u00e4lla fr\u00e5n den dag som anges i Uppdragsavtalet. En Part f\u00e5r, om inget annat avtalats, genom skriftligt meddelande s\u00e4ga upp Uppdragsavtal som g\u00e4ller tillsvidare med tre (3) m\u00e5naders upps\u00e4gningstid.</p>
      <h4>Upps\u00e4gning \u2013 arvode</h4>
      <p>Vid upps\u00e4gning av Uppdragsavtalet ska Uppdragsgivaren betala Byr\u00e5n arvode, utl\u00e4gg och kostnader enligt Uppdragsavtalet fram till upph\u00f6randetidpunkten. Om upps\u00e4gningen inte grundar sig p\u00e5 ett v\u00e4sentligt avtalsbrott fr\u00e5n Byr\u00e5ns sida ska Uppdragsgivaren \u00e4ven ers\u00e4tta Byr\u00e5n f\u00f6r andra rimliga kostnader som uppst\u00e5tt i samband med Uppdraget.</p>
      <h4>Byr\u00e5ns r\u00e4tt att omedelbart h\u00e4va avtalet</h4>
      <ul>
        <li>Uppdragsgivaren \u00e4r mer \u00e4n sju dagar f\u00f6rsenad med sina betalningar.</li>
        <li>Uppdragsgivaren levererar inte material eller orsakar p\u00e5 annat s\u00e4tt att uppdraget inte kan utf\u00f6ras s\u00e5som avtalats.</li>
        <li>Uppdragsgivaren bryter mot ing\u00e5nget avtal, lagar eller regler och underl\u00e5ter att korrigera det p\u00e5talade felet inom sju dagar efter meddelande fr\u00e5n Byr\u00e5n.</li>
        <li>Uppdragsgivaren bem\u00f6ter Byr\u00e5ns personal p\u00e5 ett oetiskt eller kr\u00e4nkande s\u00e4tt.</li>
        <li>Uppdragsgivaren kan inte betala sina skulder, har konkursf\u00f6rvaltare, f\u00f6retagsrekonstrukt\u00f6r eller likvidator utsedd.</li>
      </ul>
      <h4>Uppdragsgivarens r\u00e4tt att omedelbart h\u00e4va avtalet</h4>
      <p>Om Byr\u00e5n bryter mot avtalet och underl\u00e5ter att vidta \u00e5tg\u00e4rder f\u00f6r att korrigera avtalsbrottet inom rimlig tid har Uppdragsgivaren r\u00e4tt att med omedelbar verkan s\u00e4ga upp avtalet.</p>
      <h4>Force majeure</h4>
      <p>Yttre h\u00e4ndelser utanf\u00f6r parternas kontroll (t.ex. myndighets\u00e5tg\u00e4rder, krig, mobilisering, arbetsmarknadskonflikt, naturkatastrof) och som inte endast \u00e4r av tillf\u00e4llig natur och som f\u00f6rhindrar uppdragets genomf\u00f6rande ber\u00e4ttigar vardera parten att helt inst\u00e4lla uppdraget utan r\u00e4tt till skadest\u00e5nd. Avtalspart ska genast meddela den andra parten n\u00e4r force majeure uppkommer och n\u00e4r den upph\u00f6r.</p>
      <h4>Tvist</h4>
      <p>Tvist mellan parterna ska i f\u00f6rsta hand l\u00f6sas genom f\u00f6rhandling och i andra hand av allm\u00e4n domstol p\u00e5 den ort d\u00e4r Byr\u00e5n har sitt s\u00e4te.</p>
      <h4>\u00d6verl\u00e5telse</h4>
      <p>Parts r\u00e4ttigheter och skyldigheter enligt detta avtal kan \u00f6verl\u00e5tas endast om den andra parten ger sitt samtycke till \u00f6verl\u00e5telsen.</p>
      <h4>Prioritetsordning</h4>
      <ol><li>Uppdragsavtal</li><li>Bilagor till uppdragsavtal</li><li>Dessa allm\u00e4nna villkor</li></ol>
    </div></div>
  ${nf['Kunden godkänner allmänna villkor'] ? '<div class="confirm-row">&#9746;&nbsp; Kunden bekr\u00e4ftar att allm\u00e4nna villkoren (Bilaga 2) har l\u00e4sts och godk\u00e4nts.</div>' : ''}
</div>

<!-- ═══════════ SIDA 3: BILAGA 3 ═══════════ -->
<div class="page-break"></div>
<div class="section">
  <div class="section-title">Bilaga 3 \u2013 Personuppgiftsbir\u00e4desavtal</div>
  <div class="bilaga-wrap"><div class="villkor-text">
      <h4>1 Bakgrund</h4>
      <p>Parterna har i samband med detta Avtal ing\u00e5tt Tj\u00e4nsteavtal avseende redovisningstj\u00e4nster (\u201dTj\u00e4nsteavtalet\u201d). Inom \u00e5tagandena som f\u00f6ljer av Tj\u00e4nsteavtalet kan Byr\u00e5n komma att behandla personuppgifter samt annan information f\u00f6r Uppdragsgivarens r\u00e4kning. Med anledning h\u00e4rav ing\u00e5r Parterna detta Avtal f\u00f6r att reglera f\u00f6ruts\u00e4ttningarna f\u00f6r behandling av \u2013 och tillg\u00e5ng till \u2013 Personuppgifter tillh\u00f6riga Uppdragsgivaren. Avtalet g\u00e4ller s\u00e5 l\u00e4nge Byr\u00e5n behandlar Personuppgifter f\u00f6r Uppdragsgivarens r\u00e4kning.</p>
      <h4>2 Definitioner</h4>
      <p><strong>\u201dBehandling\u201d</strong> \u2013 en \u00e5tg\u00e4rd eller kombination av \u00e5tg\u00e4rder betr\u00e4ffande Personuppgifter, s\u00e5som insamling, registrering, lagring, bearbetning, utl\u00e4mning eller radering.</p>
      <p><strong>\u201dDataskyddsf\u00f6rordningen\u201d</strong> \u2013 Europaparlamentets och R\u00e5dets F\u00f6rordning (EU) 2016/679 (GDPR).</p>
      <p><strong>\u201dPersonuppgifter\u201d</strong> \u2013 varje upplysning som avser en identifierad eller identifierbar fysisk person.</p>
      <p><strong>\u201dPersonuppgiftsansvarig\u201d</strong> \u2013 den som best\u00e4mmer \u00e4ndam\u00e5len och medlen f\u00f6r Behandlingen av Personuppgifter.</p>
      <p><strong>\u201dPersonuppgiftsbir\u00e4de\u201d</strong> \u2013 den som Behandlar Personuppgifter f\u00f6r den Personuppgiftsansvariges r\u00e4kning.</p>
      <p><strong>\u201dPersonuppgiftsincident\u201d</strong> \u2013 en s\u00e4kerhetsincident som leder till oavsiktlig eller olaglig f\u00f6rst\u00f6ring, f\u00f6rlust, \u00e4ndring eller obeh\u00f6rigt r\u00f6jande av Personuppgifter.</p>
      <h4>4 Allm\u00e4nt om personuppgiftsbehandlingen</h4>
      <p>Uppdragsgivaren \u00e4r Personuppgiftsansvarig f\u00f6r de Personuppgifter som Behandlas inom ramen f\u00f6r Uppdraget. Byr\u00e5n \u00e4r att betrakta som Personuppgiftsbir\u00e4de \u00e5t Uppdragsgivaren. Byr\u00e5n har gett tillr\u00e4ckliga garantier om att genomf\u00f6ra l\u00e4mpliga tekniska och organisatoriska \u00e5tg\u00e4rder f\u00f6r att Behandlingen uppfyller kraven i Dataskyddsf\u00f6rordningen och att den Registrerades r\u00e4ttigheter skyddas.</p>
      <h4>6 Personal</h4>
      <p>Byr\u00e5ns anst\u00e4llda och andra personer som utf\u00f6r arbete under dess \u00f6verinseende och som f\u00e5r del av Personuppgifter tillh\u00f6riga Uppdragsgivaren, f\u00e5r endast Behandla dessa p\u00e5 instruktion fr\u00e5n Uppdragsgivaren. Byr\u00e5n ska tillse att dessa personer \u00e5tagit sig att iaktta konfidentialitet.</p>
      <h4>7 S\u00e4kerhet</h4>
      <p>Byr\u00e5n ska vidta alla \u00e5tg\u00e4rder avseende s\u00e4kerhet som kr\u00e4vs enligt artikel 32 i Dataskyddsf\u00f6rordningen. Vid bed\u00f6mningen av l\u00e4mplig s\u00e4kerhetsniv\u00e5 ska s\u00e4rskild h\u00e4nsyn tas till de risker som Behandling medf\u00f6r, i synnerhet fr\u00e5n oavsiktlig eller olaglig f\u00f6rst\u00f6ring, f\u00f6rlust eller obeh\u00f6rigt r\u00f6jande.</p>
      <h4>8 Personuppgiftsincident</h4>
      <p>Byr\u00e5n ska, med beaktande av typen av Behandling och den information Byr\u00e5n har att tillg\u00e5, bist\u00e5 Uppdragsgivaren med att tillse att skyldigheterna i samband med eventuell Personuppgiftsincident kan fullg\u00f6ras p\u00e5 s\u00e4tt som f\u00f6ljer av artikel 33\u201334 i Dataskyddsf\u00f6rordningen.</p>
      <h4>10 Underbir\u00e4de</h4>
      <p>Genom att teckna avtal med Byr\u00e5n ska Uppdragsgivaren anses ha l\u00e4mnat ett generellt skriftligt godk\u00e4nnande att anlita underbir\u00e4de. Byr\u00e5n ska digitalt informera Uppdragsgivaren om ett nytt underbir\u00e4de ska anlitas och ge Uppdragsgivaren m\u00f6jlighet att g\u00f6ra inv\u00e4ndningar. Byr\u00e5n ska tillse att nytt underbir\u00e4de ing\u00e5r ett skriftligt personuppgiftsbir\u00e4desavtal innan arbetet p\u00e5b\u00f6rjas. Om underbir\u00e4det inte fullg\u00f6r sina skyldigheter ska Byr\u00e5n vara ansvarig gentemot Uppdragsgivaren.</p>
      <h4>11 \u00d6verf\u00f6ring till tredje land</h4>
      <p>Byr\u00e5n f\u00e5r f\u00f6rflytta, f\u00f6rvara, \u00f6verf\u00f6ra eller p\u00e5 annat s\u00e4tt Behandla Personuppgifter utanf\u00f6r EU/EES om s\u00e5dan \u00f6verf\u00f6ring uppfyller de krav som f\u00f6ljer av Dataskyddsf\u00f6rordningen.</p>
      <h4>12 R\u00e4tt till insyn</h4>
      <p>Byr\u00e5n ska ge Uppdragsgivaren tillg\u00e5ng till all information som kr\u00e4vs f\u00f6r att visa att skyldigheterna enligt artikel 28 i Dataskyddsf\u00f6rordningen har fullgjorts. Byr\u00e5n ska alltid ha r\u00e4tt till sk\u00e4ligt varsel inf\u00f6r en granskning och Uppdragsgivaren ska ers\u00e4tta Byr\u00e5n f\u00f6r kostnader i samband med s\u00e5dan granskning.</p>
      <h4>13 Register \u00f6ver behandlingen</h4>
      <p>Byr\u00e5n ska f\u00f6ra ett elektroniskt register \u00f6ver alla kategorier av Behandling som utf\u00f6rts f\u00f6r Uppdragsgivarens r\u00e4kning, inneh\u00e5llande bl.a. \u00e4ndam\u00e5len med Behandlingen, kategorier av Registrerade och Personuppgifter, kategorier av mottagare och tidsfristerna f\u00f6r radering.</p>
      <h4>14 Ansvar</h4>
      <p>De ansvarsbegr\u00e4nsningar som framg\u00e5r av Tj\u00e4nsteavtalet g\u00e4ller ocks\u00e5 i detta Avtal. Om dessa ansvarsbegr\u00e4nsningar inte skulle visa sig g\u00e4lla begr\u00e4nsas ansvar till etthundratusen (100\u00a0000) kronor.</p>
      <h4>15 Avtalets upph\u00f6rande</h4>
      <p>N\u00e4r Byr\u00e5n upph\u00f6r med Behandling av Personuppgifter f\u00f6r Uppdragsgivarens r\u00e4kning ska Byr\u00e5n \u00e5terl\u00e4mna alla Personuppgifter till Uppdragsgivaren \u2013 eller, om Uppdragsgivaren s\u00e5 skriftligen meddelar, f\u00f6rst\u00f6ra och radera dem. Efter att Avtalet upph\u00f6r \u00e4ger Byr\u00e5n inte r\u00e4tt att spara Personuppgifter tillh\u00f6riga Uppdragsgivaren.</p>
      <h4>17 Till\u00e4mplig lag och tvister</h4>
      <p>Svensk lag ska till\u00e4mpas p\u00e5 Avtalet. Tvister som uppst\u00e5r i anledning av Avtalet ska slutligt avg\u00f6ras genom skiljedomsf\u00f6rfarande administrerat av Stockholms Handelskammares Skiljedomsinstitut (SCC). Skiljedomsf\u00f6rfarandets s\u00e4te ska vara Stockholm och spr\u00e5ket ska vara svenska. Skiljedom omfattas av sekretess. Part har r\u00e4tt att vid svensk domstol anh\u00e4ngig\u00f6ra tvist om tvistem\u00e5lets storlek understiger 100\u00a0000 kr.</p>
    </div></div>
  ${nf['Kunden godkänner personuppgiftsbiträdesavtal'] ? '<div class="confirm-row">&#9746;&nbsp; Kunden bekr\u00e4ftar att personuppgiftsbir\u00e4desavtalet (Bilaga 3) har l\u00e4sts och godk\u00e4nts.</div>' : ''}
</div>

<!-- ═══════════ UNDERSKRIFTER ═══════════ -->
<div class="section" style="margin-top:32px;">
  <div class="section-title">Underskrifter</div>
  <p style="font-size:8.5pt;color:#555;margin-bottom:24px;">Undertecknade parter bekr\u00e4ftar att de tagit del av och godk\u00e4nner detta uppdragsavtal med tillh\u00f6rande bilagor.</p>
  <div class="sign-grid">
    <div class="sign-box">
      <div class="sign-label">Uppdragstagare &mdash; Redovisningsbyr\u00e5n Ryd\u00e9n &amp; Co AB</div>
      <div class="sign-name">${nf['Signerat av byr\u00e5'] || '&nbsp;'}</div>
      <div class="sign-datum">Datum: ${nf['Signeringsdatum'] ? fmtDate(nf['Signeringsdatum']) : '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;'}</div>
    </div>
    <div class="sign-box">
      <div class="sign-label">Uppdragsgivare &mdash; ${nf['Kundnamn']}</div>
      <div class="sign-name">${nf['Signerat av kund'] || '&nbsp;'}</div>
      <div class="sign-datum">Datum: ${nf['Signeringsdatum'] ? fmtDate(nf['Signeringsdatum']) : '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;'}</div>
    </div>
  </div>
</div>

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

    const safeNamn = (f['Kundnamn'] || 'kund').replace(/[^a-zA-Z0-9\u00e5\u00e4\u00f6\u00c5\u00c4\u00d6 -]/g, '').trim().replace(/\s+/g, '-');
    const datum = (f['Avtalsdatum'] || new Date().toISOString()).split('T')[0];
    const filename = `${safeNamn}-Uppdragsavtal-${datum}.pdf`;

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Content-Length': pdfBuffer.length
    });
    res.send(Buffer.from(pdfBuffer));

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
    const byraFields = byraRec?.fields || {};
    const byraNamn = byraFields['Byrå'] || byraFields['Namn'] || 'Byrån';
    const tjanster = (tjansterRes.data?.tjanster || []);
    const stat = statRes.data || {};
    const riskRecords = riskRes.data?.records || [];

    const escape = (s) => (s == null ? '' : String(s)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const nl2br = (s) => (s == null ? '' : String(s)).replace(/\n/g, '<br>');

    const ACCENT = '#2c4a8f';
    const htmlParts = [];

    htmlParts.push(`<div class="doc-page"><h1 class="doc-main-title">Länsstyrelsen – Dokumentation penningtvätt</h1><p class="doc-meta">Byrå: ${escape(byraNamn)} | Export: ${fmtDate(new Date())}</p></div>`);

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
      htmlParts.push(`<h3>${escape(label)}</h3><div class="doc-text">${nl2br(val || '—')}</div>`);
    }
    const policyRev = getByraField('Policydokumentet reviderat och godkänt') || '';
    htmlParts.push(`<p><strong>Policydokumentet reviderat och godkänt:</strong> ${escape(policyRev) || '—'}</p></div>`);

    const allmanKeys = ['1. Syfte och Omfattning', '2. Beskrivning av Byråns verksamhet', '3. Metod för Riskbedömning ', '4. Identifierade Risker och Sårbarheter', '5. Värdering av sammantagen risk', '6. Riskreducerande Åtgärder och Rutiner', '7. Utvärdering och Uppdatering', '8. Kommunikation.'];
    htmlParts.push(`<div class="doc-page"><h2>2. Allmän riskbedömning byrå</h2>`);
    for (const k of allmanKeys) {
      const val = getByraField(k) || '';
      htmlParts.push(`<h3>${escape(k)}</h3><div class="doc-text">${nl2br(val || '—')}</div>`);
    }
    const uppdateradDatum = getByraField('Uppdaterad datum') || '';
    htmlParts.push(`<p><strong>Reviderad och godkänd:</strong> ${uppdateradDatum ? fmtDate(uppdateradDatum) : '—'}</p></div>`);

    htmlParts.push(`<div class="doc-page"><h2>Bilaga 1. Riskbedömning av byråns tjänster</h2>`);
    if (tjanster.length === 0) htmlParts.push(`<p>Inga tjänster registrerade.</p>`);
    else {
      htmlParts.push(`<table class="doc-table"><thead><tr><th>Tjänst</th><th>Riskbedömning</th><th>Åtgärd</th></tr></thead><tbody>`);
      for (const t of tjanster) {
        htmlParts.push(`<tr><td>${escape(t.namn)}</td><td>${nl2br(t.riskbedomning || '')}</td><td>${nl2br(t.atgard || '')}</td></tr>`);
      }
      htmlParts.push(`</tbody></table>`);
    }
    htmlParts.push(`</div>`);

    htmlParts.push(`<div class="doc-page"><h2>Bilaga 2. Övriga riskfaktorer</h2>`);
    const riskForByra = riskRecords;
    if (riskForByra.length === 0) htmlParts.push(`<p>Inga övriga riskfaktorer registrerade.</p>`);
    else {
      htmlParts.push(`<table class="doc-table"><thead><tr><th>Typ</th><th>Riskfaktor</th><th>Beskrivning</th></tr></thead><tbody>`);
      for (const r of riskForByra.slice(0, 100)) {
        const f = r.fields || {};
        htmlParts.push(`<tr><td>${escape(f['Typ av riskfaktor'])}</td><td>${escape(f['Riskfaktor'])}</td><td>${nl2br(f['Beskrivning'] || '')}</td></tr>`);
      }
      htmlParts.push(`</tbody></table>`);
    }
    htmlParts.push(`</div>`);

    htmlParts.push(`<div class="doc-page"><h2>Bilaga 3. Statistik</h2>`);
    htmlParts.push(`<p><strong>Antal kunder:</strong> ${stat.antalKunder || 0}</p>`);
    const rn = stat.riskniva || {};
    htmlParts.push(`<p><strong>Risknivåer:</strong> Låg: ${rn.Låg || 0}, Medel: ${rn.Medel || 0}, Hög: ${rn.Hög || 0}</p>`);
    if ((stat.tjänster || []).length > 0) {
      htmlParts.push(`<h3>Tjänster (antal kunder)</h3><ul>`);
      for (const t of stat.tjänster) htmlParts.push(`<li>${escape(t.namn)}: ${t.antal}</li>`);
      htmlParts.push(`</ul>`);
    }
    if ((stat.riskfaktorerPerTyp || []).length > 0) {
      htmlParts.push(`<h3>Riskfaktorer per typ</h3>`);
      for (const rpt of stat.riskfaktorerPerTyp) {
        htmlParts.push(`<p><strong>${escape(rpt.typ)}</strong> (${rpt.antalKunder} kunder)</p><ul>`);
        for (const rf of (rpt.riskfaktorer || []).slice(0, 10)) htmlParts.push(`<li>${escape(rf.namn)}: ${rf.antal}</li>`);
        htmlParts.push(`</ul>`);
      }
    }
    htmlParts.push(`</div>`);

    const fullHtml = `<!DOCTYPE html><html lang="sv"><head><meta charset="UTF-8"><style>
      @page { margin: 14mm; }
      body { font-family: Arial, sans-serif; font-size: 8pt; line-height: 1.4; color: #1a1a2e; margin: 0; padding: 12px; }
      .doc-page { page-break-after: always; }
      .doc-page:last-child { page-break-after: auto; }
      .doc-main-title { color: ${ACCENT}; font-size: 12pt; margin-bottom: 6px; }
      .doc-meta { color: #666; font-size: 7pt; margin-bottom: 16px; }
      h2 { color: ${ACCENT}; font-size: 10pt; border-bottom: 1px solid ${ACCENT}; padding-bottom: 3px; margin-top: 10px; }
      h3 { font-size: 8.5pt; margin-top: 8px; }
      .doc-table { width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 7.5pt; }
      .doc-table th, .doc-table td { border: 1px solid #ddd; padding: 4px 6px; text-align: left; }
      .doc-table th { background: #f4f6fb; font-weight: 700; }
      .doc-text { margin: 6px 0; }
      ul, p { margin: 4px 0; }
    </style></head><body>${htmlParts.join('')}</body></html>`;

    const pup = loadPuppeteer();
    if (!pup) return res.status(501).json({ error: 'PDF-generering ej tillgänglig (puppeteer saknas)' });
    const launchOpts = { args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'], headless: true, timeout: 30000 };
    if (chromium) launchOpts.executablePath = await chromium.executablePath();
    const browser = await pup.launch(launchOpts);
    const page = await browser.newPage();
    await page.setContent(fullHtml, { waitUntil: 'networkidle0', timeout: 30000 });
    const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '15mm', right: '15mm', bottom: '15mm', left: '15mm' } });
    await browser.close();

    const ar = new Date().getFullYear();
    const safeByra = (byraNamn || 'byra').replace(/[^a-zA-Z0-9\u00e5\u00e4\u00f6\u00c5\u00c4\u00d6 -]/g, '').trim().replace(/\s+/g, '-');
    const filename = `Lansstyrelsen-${safeByra}-${ar}.pdf`;

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

        // Svaret är en base64-sträng
        const pdfBase64 = reportRes.data;
        if (!pdfBase64 || typeof pdfBase64 !== 'string') {
            throw new Error('Inget PDF-svar från Dilisense');
        }

        const token = process.env.AIRTABLE_ACCESS_TOKEN;
        const baseId = process.env.AIRTABLE_BASE_ID;
        const KUNDDATA_TABLE = 'tblOIuLQS2DqmOQWe';
        const datumStr = new Date().toISOString().split('T')[0];
        const filnamn = `PEP-screening_${namn.replace(/\s+/g, '_')}_${datumStr}.pdf`;

        // Spara PDF till KUNDDATA (Attachments / PEP rapporter) om möjligt
        let savedToDocs = false;
        if (token && kundId) {
            try {
                const protocol = req.get('x-forwarded-proto') || req.protocol || (req.secure ? 'https' : 'http');
                const host = req.get('x-forwarded-host') || req.get('host');
                const reqBaseUrl = host ? `${protocol}://${host}` : null;
                const pdfBuffer = Buffer.from(pdfBase64, 'base64');
                const fileUrl = await saveFileLocally(pdfBuffer, filnamn, 'application/pdf', reqBaseUrl);
                const isLocalhost = !fileUrl || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(fileUrl || '');

                if (isLocalhost) {
                    // Airtable kan inte hämta från localhost – använd Content API med base64
                    savedToDocs = await uploadAttachmentToAirtable(token, baseId, kundId, pdfBuffer, filnamn, 'application/pdf');
                } else if (fileUrl) {
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
            } catch (saveErr) {
                console.warn('Kunde inte spara PEP-rapport till Airtable:', saveErr.message);
            }
        }

        // Hämta snabb JSON-sökning för att visa träffar i UI
        const checkUrl = `https://api.dilisense.com/v1/checkIndividual?${params.toString()}`;
        const checkRes = await axios.get(checkUrl, {
            headers: { 'x-api-key': dilisenseKey }
        });
        const checkData = checkRes.data;

        const totalHits = checkData.total_hits || 0;
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
        console.error('❌ Fel vid PEP-screening:', error.response?.data || error.message);
        res.status(500).json({ error: error.response?.data?.error_message || error.message });
    }
});

// ============================================================
// INLEED DOCSIGN — Skicka uppdragsavtal för BankID-signering
// ============================================================

// POST /api/uppdragsavtal/:id/skicka-for-signering
// Body: { signerare: { namn, epost, personnr, telefon? } }
// Skickar till BÅDE kund OCH inloggad konsult – båda måste signera
app.post('/api/uppdragsavtal/:id/skicka-for-signering', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { signerare } = req.body; // { namn, epost, personnr, telefon }

    if (!signerare || !signerare.namn || !signerare.epost) {
      return res.status(400).json({ error: 'Signerare (kund) saknar namn eller e-post.' });
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
    const pdfRes = await axios.post(
      `http://localhost:${process.env.PORT || 3001}/api/uppdragsavtal/${id}/pdf`,
      {},
      {
        responseType: 'arraybuffer',
        headers: { Authorization: req.headers.authorization }
      }
    );
    const pdfBuffer = Buffer.from(pdfRes.data);

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

    const kundPartyPayload = {
      api_key: docsignApiKey,
      name: signerare.namn,
      email: signerare.epost,
      company: kundnamn,
      sign_method: 'bankid',
      debug: false
    };
    if (signerare.personnr) kundPartyPayload.external_id = signerare.personnr;
    if (signerare.telefon) kundPartyPayload.phone_number = signerare.telefon;
    console.log('📤 Skapar kund som undertecknare i Inleed:', kundPartyPayload.name, kundPartyPayload.email);
    const kundPartyRes = await axios.post('https://docsign.se/api/parties', kundPartyPayload, {
      headers: { 'Content-Type': 'application/json' }
    });
    if (!kundPartyRes.data?.success) {
      console.error('❌ Inleed kund-party fel:', kundPartyRes.data);
      return res.status(500).json({ error: 'Kunde inte skapa kund som undertecknare.', details: kundPartyRes.data });
    }
    const kundPartyId = kundPartyRes.data.party_id;
    console.log('✅ Kund skapad som undertecknare, party_id:', kundPartyId);

    // 4. Skapa dokument i Inleed med båda parter – konsult först, sedan kund
    const pdfBase64 = pdfBuffer.toString('base64');
    const docPayload = {
      api_key: docsignApiKey,
      name: `Uppdragsavtal - ${kundnamn}`,
      parties: [konsultPartyId, kundPartyId],
      send_reminders: true,
      send_receipt: true,
      attachments: [{
        name: 'uppdragsavtal.pdf',
        base64_content: pdfBase64
      }]
    };

    console.log('📤 Skapar dokument i Inleed för:', kundnamn, '| PDF:', pdfBuffer.length, 'bytes | Konsult:', konsultPartyId, 'Kund:', kundPartyId);

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
      party_ids: [konsultPartyId, kundPartyId],
      message: `Uppdragsavtalet har skickats till konsult (${inloggedUser.email}) och kund (${signerare.epost}) f\u00f6r BankID-signering.`
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

    const baseUrl = process.env.PUBLIC_BASE_URL || (req.get('host') ? `${req.protocol}://${req.get('host')}` : null);
    const isLocalhost = !baseUrl || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(baseUrl);
    if (isLocalhost) {
      saved = await uploadAttachmentToAirtable(airtableAccessToken, airtableBaseId, kundId, pdfBuffer, filnamn, 'application/pdf');
    } else {
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
  const assistantId = process.env.OPENAI_ASSISTANT_ID || 'asst_OOsa6mD2D2aQHAFqsh0ch5Rs';
  const vectorStoreId = process.env.OPENAI_VECTOR_STORE_ID || 'vs_6849e4132d7c8191a60176f4403d6da4';

  if (!openaiKey) return res.status(500).json({ error: 'OPENAI_API_KEY saknas.' });
  if (!assistantId) return res.status(500).json({ error: 'OPENAI_ASSISTANT_ID saknas.' });

  try {
    const kundRes = await axios.get(
      `https://api.airtable.com/v0/${baseId}/KUNDDATA/${kundId}`,
      { headers: { Authorization: `Bearer ${airtableAccessToken}` } }
    );
    const f = kundRes.data.fields || {};

    const arr = (v) => Array.isArray(v) ? v.join(', ') : (v || '–');

    // Hämta kundens aktiva tjänster parallellt med länkade riskposter
    let tjansterText = '–';
    let lankadeRiskerText = '';

    await Promise.all([
      // Tjänster
      (async () => {
        try {
          const tjansterIds = f['Kundens utvalda tjänster'] || [];
          if (Array.isArray(tjansterIds) && tjansterIds.length > 0) {
            const tjNamn = await Promise.all(tjansterIds.map(async (id) => {
              try {
                const r = await axios.get(
                  `https://api.airtable.com/v0/${baseId}/Olika%20valbara%20uppdrag/${id}`,
                  { headers: { Authorization: `Bearer ${airtableAccessToken}` } }
                );
                return r.data.fields?.['Task Name'] || id;
              } catch { return id; }
            }));
            tjansterText = tjNamn.join(', ');
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

    // Syftet med affärsförbindelsen: använd registrerat syfte om finns, annars tjänsterna
    const syfteRaw = arr(f['Syfte med affärsförbindelsen']);
    const syfteMedTjanster = syfteRaw !== '–'
      ? `${syfteRaw} (Tjänster byrån utför: ${tjansterText})`
      : `Byråns tjänster till kunden (= syftet med affärsförbindelsen): ${tjansterText}`;

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

VIKTIGT: Syftet med affärsförbindelsen definieras av vilka tjänster byrån utför åt kunden. Dessa tjänster ska framgå tydligt i riskbedömningen.

KUNDUPPGIFTER:
- Företagsnamn: ${f['Name'] || f['Namn'] || '–'}
- Organisationsform: ${f['Bolagsform'] || '–'}
- Bransch/SNI: ${f['SNI-bransch'] || f['Bransch'] || '–'}
- Omsättning: ${f['Omsättning'] || '–'}
- Verklig huvudman: ${f['Verklig huvudman'] || '–'}
- Skatterättslig hemvist: ${arr(f['Skatterättslig hemvist'])}
- Betalningar: ${arr(f['Betalningar'])}
- Syfte med affärsförbindelsen / Tjänster: ${syfteMedTjanster}
- Transaktioner med andra länder: ${f['Har företaget transaktioner med andra länder?'] || '–'}
- Kapitalets ursprung: ${arr(f['Vilket ursprung har företagets kapital?'])}
- Affärsmodell: ${f['Affärsmodell'] || '–'}
- Byråns beskrivning av kunden: ${f['Beskrivning av kunden'] || '–'}
- Ytterligare beskrivning av kunden och verksamheten: ${f['Ytterligare beskrivning av kunden och verksamheten'] || '–'}

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

ABSOLUTA REGLER — FÖLJ DESSA EXAKT:

1. PEP: Om i "IDENTIFIERADE RISKFAKTORER" ovan någon riskfaktor innehåller "PEP" (t.ex. "PEP, familjemedlem till PEP eller känd medarbetare till PEP") och har nivå "Förhöjd", ska kundens sammanlagda risknivå vara "Hog" och PEP MÅSTE nämnas som huvudorsak i riskbedömningen. Vid nivå "Medel" på PEP-faktorn ska sammanlagd risk vara minst "Medel". Detta gäller oavsett fältet "PEP-status" ovan — prioritera alltid de identifierade riskfaktorerna från fliken Riskbedömning.

2. ÅTGÄRDER — detta är kritiskt:
   - "Hog": Lista 3-5 konkreta åtgärder specifikt anpassade till just denna kunds riskbild (PEP, sanktioner, högriskbransch etc.).
   - "Medel": Sätt atgarder = "" SÅVIDA INTE något verkligen sticker ut (PEP, utländska transaktioner, okänt kapitalursprung, högriskbransch). Generella formuleringar är FÖRBJUDNA.
   - "Lag": Sätt alltid atgarder = "". Inga åtgärder för lågrisk-kunder. Övervakningsrutiner, uppdatering av dokumentation och liknande standardpåminnelser ska ALDRIG listas.

3. RISKBEDÖMNINGSTEXT: 2-4 meningar. Motivera risknivån konkret utifrån kundens faktiska profil. Nämn vilka tjänster byrån utför.

Svara EXAKT i detta JSON-format (inget annat):
{
  "riskniva": "Lag" eller "Medel" eller "Hog",
  "riskbedomning": "2-4 meningar som motiverar risknivån konkret.",
  "atgarder": "Punkter med bindestreck (-) vid Hog eller specifik risk, annars exakt tom sträng."
}`;

    const openai = new OpenAI({ apiKey: openaiKey });
    const apiBase = 'https://api.openai.com/v1';
    const authHeader = { Authorization: `Bearer ${openaiKey}` };

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

    let result = null;

    try {
      // Assistants API via REST (tydliga URL:er, undviker SDK undefined-bug)
      const threadRes = await axios.post(
        `${apiBase}/threads`,
        { messages: [{ role: 'user', content: prompt }] },
        { headers: { ...authHeader, 'Content-Type': 'application/json' } }
      );
      const threadId = threadRes.data?.id;
      if (!threadId) throw new Error('Inget thread-id i svar');

      const runBody = {
        assistant_id: assistantId,
        ...(vectorStoreId && { tool_resources: { file_search: { vector_store_ids: [vectorStoreId] } } })
      };
      const runRes = await axios.post(
        `${apiBase}/threads/${threadId}/runs`,
        runBody,
        { headers: { ...authHeader, 'Content-Type': 'application/json' } }
      );
      const runId = runRes.data?.id;
      if (!runId) throw new Error('Inget run-id i svar');

      let runStatus = runRes.data;
      const startMs = Date.now();
      while (['queued', 'in_progress', 'cancelling'].includes(runStatus.status)) {
        if (Date.now() - startMs > 60000) throw new Error('Timeout – assistenten svarade inte i tid');
        await new Promise(r => setTimeout(r, 1000));
        const statusRes = await axios.get(
          `${apiBase}/threads/${threadId}/runs/${runId}`,
          { headers: authHeader }
        );
        runStatus = statusRes.data;
      }

      if (runStatus.status !== 'completed') {
        throw new Error(runStatus.last_error?.message || `Run status: ${runStatus.status}`);
      }

      const msgRes = await axios.get(
        `${apiBase}/threads/${threadId}/messages?limit=10`,
        { headers: authHeader }
      );
      const messages = msgRes.data?.data || [];
      const assistantMsg = messages.find(m => m.role === 'assistant' && m.run_id === runId) || messages.find(m => m.role === 'assistant');
      const parts = assistantMsg?.content || [];
      const assistantText = parts.map(c => (c.type === 'text' ? (c.text?.value || '') : '')).join('\n').trim();

      const jsonText = extractFirstJsonObject(assistantText) || assistantText;
      result = JSON.parse(jsonText);
    } catch (assistantErr) {
      console.warn('⚠️ Assistants API misslyckades, använder Chat Completions:', assistantErr.message);
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.4,
        response_format: { type: 'json_object' }
      });
      const rawContent = completion.choices[0]?.message?.content || '';
      const jsonText = extractFirstJsonObject(rawContent) || rawContent;
      result = JSON.parse(jsonText);
    }

    if (!result) throw new Error('Kunde inte tolka AI-svar');

    res.json({
      riskniva: result.riskniva || 'Medel',
      riskbedomning: result.riskbedomning || '',
      atgarder: result.atgarder || ''
    });

  } catch (error) {
    console.error('❌ AI-riskbedömning fel:', error.message);
    res.status(500).json({ error: 'Kunde inte generera AI-analys: ' + error.message });
  }
});

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
