const axios = require('axios');

// Simulera data från Softr med användar-ID och byrå-ID
const testSoftrData = {
  organisationsnummer: '5560021361', // Test organisationsnummer
  anvandareId: 'SOFTR_USER_12345',
  byraId: 'SOFTR_BYRA_67890',
  // Alternativa fältnamn som Softr kan använda
  // anvId: 'ALT_USER_12345',
  // byra_id: 'ALT_BYRA_67890',
  // userId: 'USER_12345',
  // agencyId: 'AGENCY_67890'
};

// API endpoint
const API_URL = 'http://localhost:3000/api/bolagsverket/save-to-airtable';

async function testSoftrIntegration() {
  console.log('🧪 Testar Softr integration med användar-ID och byrå-ID');
  console.log('📤 Skickar data till API:', testSoftrData);
  
  try {
    const response = await axios.post(API_URL, testSoftrData, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });
    
    console.log('✅ API Response:');
    console.log('Status:', response.status);
    console.log('Success:', response.data.success);
    console.log('Message:', response.data.message);
    console.log('Airtable Record ID:', response.data.airtableRecordId);
    console.log('Organisationsnummer:', response.data.organisationsnummer);
    console.log('Användar ID:', response.data.anvandareId);
    console.log('Byrå ID:', response.data.byraId);
    console.log('Duration:', response.data.duration + 'ms');
    console.log('Environment:', response.data.environment);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

// Testa olika fältnamn som Softr kan använda
async function testDifferentFieldNames() {
  console.log('\n🔄 Testar olika fältnamn som Softr kan använda');
  
  const testCases = [
    {
      name: 'Standard fältnamn',
      data: {
        organisationsnummer: '5560021361',
        anvandareId: 'USER_123',
        byraId: 'BYRA_456'
      }
    },
    {
      name: 'Alternativa fältnamn 1',
      data: {
        orgnr: '5560021361',
        anvId: 'USER_123',
        byra_id: 'BYRA_456'
      }
    },
    {
      name: 'Alternativa fältnamn 2',
      data: {
        organization_number: '5560021361',
        userId: 'USER_123',
        agencyId: 'BYRA_456'
      }
    },
    {
      name: 'Blandade fältnamn',
      data: {
        Orgnr: '5560021361',
        anvandareId: 'USER_123',
        agency_id: 'BYRA_456'
      }
    }
  ];
  
  for (const testCase of testCases) {
    console.log(`\n📝 Test: ${testCase.name}`);
    console.log('Data:', testCase.data);
    
    try {
      const response = await axios.post(API_URL, testCase.data, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 30000
      });
      
      console.log('✅ Success:', response.data.success);
      console.log('Användar ID detected:', response.data.anvandareId);
      console.log('Byrå ID detected:', response.data.byraId);
      
    } catch (error) {
      console.error('❌ Error:', error.message);
    }
  }
}

// Kör testerna
async function runTests() {
  await testSoftrIntegration();
  await testDifferentFieldNames();
}

// Kör om detta är huvudfilen
if (require.main === module) {
  runTests();
}

module.exports = {
  testSoftrIntegration,
  testDifferentFieldNames
};
