const Airtable = require('airtable');
require('dotenv').config();

async function testSaveToAirtable() {
  console.log('🔍 Testing save to Airtable...');
  
  const accessToken = process.env.AIRTABLE_ACCESS_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID;
  const tableName = process.env.AIRTABLE_TABLE_NAME || 'tblOIuLQS2DqmOQWe';
  
  console.log('Token starts with:', accessToken ? accessToken.substring(0, 10) + '...' : 'Missing');
  console.log('Base ID:', baseId);
  console.log('Table Name:', tableName);
  
  if (!accessToken || !baseId) {
    console.log('❌ Missing required environment variables');
    return;
  }
  
  try {
    // Configure Airtable with your access token
    Airtable.configure({ apiKey: accessToken });
    
    // Create a base instance
    const base = Airtable.base(baseId);
    
    // Get the table
    const table = base(tableName);
    
    // Test data
    const testData = {
      'Orgnr': '556123-4567',
      'Namn': 'Testföretag AB',
      'Verksamhetsbeskrivning': 'Test av API-integration',
      'Address': 'Testgatan 1, 12345 Stockholm',
      'Beskrivning av kunden': 'Testdata från API Proxy Service'
    };
    
    console.log('\n📊 Testing: Save test data to Airtable...');
    console.log('Test data:', testData);
    
    // Create the record
    const response = await table.create([{ fields: testData }]);
    
    console.log('✅ Success!');
    console.log('Record created with ID:', response[0].id);
    console.log('Record fields:', response[0].fields);
    
  } catch (error) {
    console.log('❌ Error:', error.message);
    
    if (error.error) {
      console.log('Error details:', error.error);
    }
  }
}

testSaveToAirtable();
