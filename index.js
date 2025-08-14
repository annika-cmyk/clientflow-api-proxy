const express = require('express');
const cors = require('cors');
const axios = require('axios');
const Airtable = require('airtable');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 10000;

// Trust proxy för Render
app.set('trust proxy', 1);

// Middleware
app.use(cors());
app.use(express.json());

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
    const airtableTableName = process.env.AIRTABLE_TABLE_NAME || 'tblOIuLQS2DqmOQWe';

    if (!airtableAccessToken || !airtableBaseId) {
      throw new Error('Airtable Access Token eller Base ID saknas i miljövariabler');
    }

    // Configure Airtable with your access token
    Airtable.configure({ apiKey: airtableAccessToken });
    
    // Create a base instance
    const base = Airtable.base(airtableBaseId);
    
    // Try to get the table
    const table = base(airtableTableName);
    
    // Try to get the first record
    const records = await table.select({ maxRecords: 1 }).firstPage();

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
    
    res.status(500).json({
      error: 'Airtable anslutningsfel',
      message: error.message,
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
    return bolagsverketToken;

  } catch (error) {
    console.error('Error getting Bolagsverket token:', error.message);
    throw error;
  }
}

// Bolagsverket isalive endpoint (health check)
app.get('/api/bolagsverket/isalive', async (req, res) => {
  const startTime = Date.now();
  
  try {
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

    const cleanOrgNumber = organisationsnummer.replace(/[-\s]/g, '');
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

    const org = response.data.organisationer[0];
    
    console.log(`📊 Organisationsdata tillgänglig:`, {
      identitetsbeteckning: org.identitetsbeteckning,
      namnskyddslopnummer: org.namnskyddslopnummer,
      registreringsland: org.registreringsland,
      reklamsparr: org.reklamsparr,
      organisationsnamn: org.organisationsnamn?.organisationsnamnLista?.length,
      organisationsform: org.organisationsform?.klartext,
      avregistreradOrganisation: !!org.avregistreradOrganisation,
      avregistreringsorsak: org.avregistreringsorsak?.klartext,
      pagandeAvvecklingsEllerOmstruktureringsforfarande: org.pagandeAvvecklingsEllerOmstruktureringsforfarandeLista?.length || 0,
              juridiskForm: org.juridiskForm?.klartext,
      verksamOrganisation: org.verksamOrganisation?.kod,
      organisationsdatum: org.organisationsdatum?.registreringsdatum,
      verksamhetsbeskrivning: org.verksamhetsbeskrivning?.beskrivning,
      naringsgrenOrganisation: org.naringsgrenOrganisation?.naringsgrenOrganisationLista?.length,
      postadressOrganisation: !!org.postadressOrganisation,
      felBolagsverket: org.felBolagsverket,
      felSCB: org.felSCB
    });

    const duration = Date.now() - startTime;

    res.json({
      success: true,
      data: org,
      timestamp: new Date().toISOString(),
      duration: duration,
      environment: environment,
      source: 'Bolagsverket'
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('Error in Bolagsverket organisationer API:', error.message);
    
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

// Bolagsverket hämta dokument endpoint
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

// Airtable integration endpoint
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

    const cleanOrgNumber = organisationsnummer.replace(/[-\s]/g, '');
    const token = await getBolagsverketToken();
    const environment = process.env.BOLAGSVERKET_ENVIRONMENT || 'test';
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

    const bolagsverketResponse = await axios.post(orgUrl, requestBody, {
      headers,
      timeout: 15000
    });

    if (!bolagsverketResponse.data?.organisationer?.[0]) {
      throw new Error('Ingen organisationsdata hittad från Bolagsverket');
    }

    const orgData = bolagsverketResponse.data.organisationer[0];

    // Hämta dokumentlista från Bolagsverket
    let dokumentInfo = null;
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
        const isActiveCompany = !orgData.avregistreringsorsak && !orgData.avregistreradOrganisation;
        
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
        
        // Förbered data för Airtable med förbättrad mappning
        const airtableData = {
          fields: {
            'Orgnr': cleanOrgNumber,
            'Namn': companyNames.join(', ') || '',
            'Verksamhetsbeskrivning': descriptions.join(', ') || '',
            'Address': orgData.postadressOrganisation?.postadress ?
              `${orgData.postadressOrganisation.postadress.utdelningsadress || ''}, ${orgData.postadressOrganisation.postadress.postnummer || ''} ${orgData.postadressOrganisation.postadress.postort || ''}` : '',
            'Bolagsform': orgData.organisationsform?.klartext || '',
            'SNI kod': orgData.naringsgrenOrganisation?.sni?.filter(item => 
              item.kod && item.kod.trim() && item.klartext && item.klartext.trim()
            ).map(item => 
              `${item.kod.trim()} - ${item.klartext.trim()}`
            ).join(', ') || '',
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
            )?.[2]?.dokumentId || ''
          }
        };
        
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
    const airtableTableName = process.env.AIRTABLE_TABLE_NAME || 'tblOIuLQS2DqmOQWe';

    if (!airtableAccessToken || !airtableBaseId) {
      throw new Error('Airtable Access Token eller Base ID saknas i miljövariabler');
    }

    // Configure Airtable with your access token
    Airtable.configure({ apiKey: airtableAccessToken });
    
    // Create a base instance
    const base = Airtable.base(airtableBaseId);
    
    // Get the table
    const table = base(airtableTableName);
    
    // Create the record
    const airtableResponse = await table.create([{ fields: airtableData.fields }]);

    const duration = Date.now() - startTime;

    const responseData = {
      success: true,
      message: 'Data sparad till Airtable',
      airtableRecordId: airtableResponse[0].id,
      organisationsnummer: cleanOrgNumber,
      anvandareId: anvandareId || null,
      byraId: byraId || null,
      dokumentInfo: dokumentInfo,
      timestamp: new Date().toISOString(),
      duration: duration,
      environment: environment
    };

    console.log(`✅ Data sparad till Airtable:`, {
      organisationsnummer: cleanOrgNumber,
      anvandareId: anvandareId || 'Ej angivet',
      byraId: byraId || 'Ej angivet',
      recordId: airtableResponse[0].id,
      duration: duration
    });
    
    console.log(`📊 Airtable fields sent:`, airtableData.fields);
    console.log(`📊 Airtable response fields:`, airtableResponse[0].fields);

    res.json(responseData);

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('Error saving to Airtable:', error.message);
    
    res.status(500).json({
      error: 'Fel vid sparande till Airtable',
      message: error.message,
      duration: duration
    });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 API Proxy Service running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🧪 Test endpoint: http://localhost:${PORT}/test`);
  console.log(`📋 Airtable endpoints:`);
  console.log(`   • Test connection: GET http://localhost:${PORT}/api/airtable/test`);
  console.log(`🏢 Bolagsverket endpoints:`);
  console.log(`   • Health check: GET http://localhost:${PORT}/api/bolagsverket/isalive`);
  console.log(`   • Get organization: POST http://localhost:${PORT}/api/bolagsverket/organisationer`);
  console.log(`   • Save to Airtable: POST http://localhost:${PORT}/api/bolagsverket/save-to-airtable`);
});
