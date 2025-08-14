const Airtable = require('airtable');

// Simulera miljövariabler (kopiera från Render)
const AIRTABLE_ACCESS_TOKEN = 'patIV1TIf0PEQWwdI.3d142b13f622c153496ac7f4e2e6baa42b3a323cf905da341f9e850337f20e90';
const AIRTABLE_BASE_ID = 'appPF8F7VvO5XYB50';
const AIRTABLE_TABLE_NAME = 'tblOIuLQS2DqmOQWe';

console.log('🔍 Debug Airtable Connection med Användar-ID och Byrå-ID');
console.log('Token length:', AIRTABLE_ACCESS_TOKEN.length);
console.log('Token starts with:', AIRTABLE_ACCESS_TOKEN.substring(0, 10) + '...');
console.log('Base ID:', AIRTABLE_BASE_ID);
console.log('Table Name:', AIRTABLE_TABLE_NAME);

try {
  // Configure Airtable
  Airtable.configure({ apiKey: AIRTABLE_ACCESS_TOKEN });
  console.log('✅ Airtable configured');
  
  // Create base instance
  const base = Airtable.base(AIRTABLE_BASE_ID);
  console.log('✅ Base instance created');
  
  // Get table
  const table = base(AIRTABLE_TABLE_NAME);
  console.log('✅ Table instance created');
  
  // Test data med användar-ID och byrå-ID (som från Softr)
  const testData = {
    fields: {
      'Orgnr': 'TEST123456',
      'Namn': 'Test Företag AB',
      'Verksamhetsbeskrivning': 'Test verksamhet',
      'Address': 'Testgatan 1, 12345 Stockholm',
      'Beskrivning av kunden': 'Test från debug script med användar-ID och byrå-ID',
      'Användar ID': 'USER123',
      'Byrå ID': 'BYRA456'
    }
  };
  
  console.log('📝 Test data prepared:', testData);
  console.log('👤 Användar ID:', testData.fields['Användar ID']);
  console.log('🏢 Byrå ID:', testData.fields['Byrå ID']);
  
  // Try to create record
  table.create([{ fields: testData.fields }])
    .then(records => {
      console.log('✅ Record created successfully!');
      console.log('Record ID:', records[0].id);
      console.log('Record fields:', records[0].fields);
      console.log('👤 Användar ID saved:', records[0].fields['Användar ID']);
      console.log('🏢 Byrå ID saved:', records[0].fields['Byrå ID']);
    })
    .catch(error => {
      console.error('❌ Error creating record:', error.message);
      console.error('Full error:', error);
    });
    
} catch (error) {
  console.error('❌ Error in setup:', error.message);
  console.error('Full error:', error);
}
