const express = require('express');
const axios = require('axios');
const Airtable = require('airtable');
const crypto = require('crypto');
const AdmZip = require('adm-zip');
const { PDFDocument } = require('pdf-lib');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
let chromium = null;
let puppeteer = null;
try {
  chromium = require('@sparticuz/chromium');
  puppeteer = require('puppeteer-core');
} catch (err) {
  console.log('ℹ️ Puppeteer/Chromium inte installerat. Förenklad PDF-rendering kommer användas.');
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
console.log('');

const app = express();
const PORT = process.env.PORT || 10000;

// Trust proxy för Render
app.set('trust proxy', 1);

// CORS-konfiguration - tillåt alla origins
app.use((req, res, next) => {
    // Sätt CORS headers för alla requests
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
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
    cors: 'enabled',
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
    version: '1.0.0',
    cors: 'enabled'
  });
});

// Test endpoint
app.get('/test', (req, res) => {
  res.json({
    message: 'API is working!',
    timestamp: new Date().toISOString(),
    cors: 'enabled'
  });
});

app.listen(PORT, () => {
  console.log(`🚀 API Proxy Service running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🧪 Test endpoint: http://localhost:${PORT}/test`);
  console.log(`🌐 CORS: ENABLED`);
});
