const Airtable = require('airtable');

// Använd samma token som fungerade
const AIRTABLE_ACCESS_TOKEN = 'patIV1TIf0PEQWwdI.3d142b13f622c153496ac7f4e2e6baa42b3a323cf905da341f9e850337f20e90';
const AIRTABLE_BASE_ID = 'appPF8F7VvO5XYB50';
const AIRTABLE_TABLE_NAME = 'tblOIuLQS2DqmOQWe';

async function checkAirtableSchema() {
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
    
    // Get table metadata to see fields
    const records = await table.select({
      maxRecords: 1,
      fields: [] // Empty fields to get metadata
    }).firstPage();
    
    console.log('\n📋 AIRTABLE TABLE SCHEMA:');
    console.log('=====================================');
    
    if (records.length > 0) {
      const fields = Object.keys(records[0].fields);
      fields.forEach((field, index) => {
        const value = records[0].fields[field];
        const type = typeof value;
        console.log(`${index + 1}. "${field}" (${type}) = ${JSON.stringify(value)}`);
      });
      
      console.log(`\n📊 Total fields: ${fields.length}`);
      
      // Testa att skapa en record med minimal data för att se vad som fungerar
      console.log('\n🧪 Testing minimal record creation...');
      
      const testData = {
        fields: {
          'Orgnr': 'TEST123456'
        }
      };
      
      const testRecord = await table.create([{ fields: testData.fields }]);
      console.log('✅ Minimal record created successfully!');
      console.log('Record ID:', testRecord[0].id);
      
      // Uppdatera record med mer data för att testa fält
      console.log('\n🧪 Testing field by field...');
      
      const updateData = {
        'Namn': 'Test Företag AB',
        'Verksamhetsbeskrivning': 'Test verksamhet',
        'Address': 'Testgatan 1, 12345 Stockholm',
        'Beskrivning av kunden': 'Test beskrivning',
        'Bolagsform': 'Aktiebolag'
      };
      
      // Testa varje fält individuellt
      for (const [fieldName, fieldValue] of Object.entries(updateData)) {
        try {
          console.log(`Testing field: "${fieldName}" with value: "${fieldValue}"`);
          await table.update(testRecord[0].id, { [fieldName]: fieldValue });
          console.log(`✅ Field "${fieldName}" works!`);
        } catch (error) {
          console.log(`❌ Field "${fieldName}" failed: ${error.message}`);
        }
      }
      
      // Testa användar-ID fält
      console.log('\n🧪 Testing user ID field...');
      try {
        await table.update(testRecord[0].id, { 'Användare': 123 });
        console.log('✅ "Användare" field works with number!');
      } catch (error) {
        console.log(`❌ "Användare" field failed: ${error.message}`);
      }
      
      // Testa byrå-ID fält
      console.log('\n🧪 Testing agency ID field...');
      try {
        await table.update(testRecord[0].id, { 'Byrå ID': 'BYRA456' });
        console.log('✅ "Byrå ID" field works!');
      } catch (error) {
        console.log(`❌ "Byrå ID" field failed: ${error.message}`);
      }
      
      // Ta bort test record
      await table.destroy(testRecord[0].id);
      console.log('✅ Test record cleaned up');
      
    } else {
      console.log('❌ No records found in table');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Full error:', error);
  }
}

checkAirtableSchema();
