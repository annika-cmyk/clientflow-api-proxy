const express = require('express');
const cors = require('cors');
const axios = require('axios');
const Airtable = require('airtable');
require('dotenv').config();

const app = express();
const PORT = 3002;

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

// Bolagsverket test endpoint
app.get('/api/bolagsverket/test', (req, res) => {
  res.json({
    success: true,
    message: 'Bolagsverket test endpoint fungerar!',
    timestamp: new Date().toISOString()
  });
});

// Simple save-to-airtable endpoint
app.post('/api/bolagsverket/save-to-airtable', async (req, res) => {
  try {
    const organisationsnummer = req.body.organisationsnummer || req.body.Orgnr;
    
    if (!organisationsnummer) {
      return res.status(400).json({
        error: 'Organisationsnummer är obligatoriskt',
        message: 'Organization number is required'
      });
    }

    // Förbered data för Airtable
    const airtableData = {
      fields: {
        'Orgnr': organisationsnummer,
        'Namn': 'Test företag',
        'Verksamhetsbeskrivning': 'Test beskrivning',
        'Address': 'Test adress',
        'Beskrivning av kunden': 'Test kundbeskrivning'
      }
    };

    // Spara till Airtable
    const airtableAccessToken = process.env.AIRTABLE_ACCESS_TOKEN;
    const airtableBaseId = process.env.AIRTABLE_BASE_ID;
    const airtableTableName = process.env.AIRTABLE_TABLE_NAME || 'tblOIuLQS2DqmOQWe';

    if (!airtableAccessToken || !airtableBaseId) {
      throw new Error('Airtable Access Token eller Base ID saknas');
    }

    // Configure Airtable
    Airtable.configure({ apiKey: airtableAccessToken });
    const base = Airtable.base(airtableBaseId);
    const table = base(airtableTableName);
    
    // Create the record
    const airtableResponse = await table.create([{ fields: airtableData.fields }]);

    res.json({
      success: true,
      message: 'Data sparad till Airtable',
      airtableRecordId: airtableResponse[0].id,
      organisationsnummer: organisationsnummer,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error saving to Airtable:', error.message);
    res.status(500).json({
      error: 'Fel vid sparande till Airtable',
      message: error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Simple API Proxy Service running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🧪 Test endpoint: http://localhost:${PORT}/test`);
  console.log(`📝 POST test: http://localhost:${PORT}/test-post`);
  console.log(`🏢 Bolagsverket test: http://localhost:${PORT}/api/bolagsverket/test`);
  console.log(`💾 Save to Airtable: http://localhost:${PORT}/api/bolagsverket/save-to-airtable`);
});
