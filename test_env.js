const express = require('express');
const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());

// Test endpoint för att kolla miljövariabler
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

app.listen(PORT, () => {
  console.log(`🔍 Environment Test Server running on port ${PORT}`);
  console.log(`🔍 Test: http://localhost:${PORT}/test-env`);
});

