const Airtable = require('airtable');

// Använd samma token som fungerade
const AIRTABLE_ACCESS_TOKEN = 'patIV1TIf0PEQWwdI.3d142b13f622c153496ac7f4e2e6baa42b3a323cf905da341f9e850337f20e90';
const AIRTABLE_BASE_ID = 'appPF8F7VvO5XYB50';
const AIRTABLE_TABLE_NAME = 'tblOIuLQS2DqmOQWe';

async function testAirtableFields() {
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
    
    // Testa olika fältnamn för användare
    const userFieldNames = [
      'Användare',
      'Användar ID',
      'Användar-ID',
      'User',
      'User ID',
      'UserId',
      'anvandare',
      'anvandare_id'
    ];
    
    // Testa olika fältnamn för byrå
    const agencyFieldNames = [
      'Byrå ID',
      'Byrå-ID',
      'ByråID',
      'Agency',
      'Agency ID',
      'AgencyID',
      'byra_id',
      'byra'
    ];
    
    // Skapa en test record först
    console.log('\n🧪 Creating test record...');
    const testRecord = await table.create([{ 
      fields: {
        'Orgnr': 'TEST123456',
        'Namn': 'Test Företag AB'
      }
    }]);
    
    console.log('✅ Test record created:', testRecord[0].id);
    
    // Testa användar-ID fält
    console.log('\n🧪 Testing user ID field names...');
    for (const fieldName of userFieldNames) {
      try {
        console.log(`Testing: "${fieldName}"`);
        await table.update(testRecord[0].id, { [fieldName]: 35 });
        console.log(`✅ "${fieldName}" works!`);
        break; // Hitta första som fungerar
      } catch (error) {
        console.log(`❌ "${fieldName}" failed: ${error.message}`);
      }
    }
    
    // Testa byrå-ID fält
    console.log('\n🧪 Testing agency ID field names...');
    for (const fieldName of agencyFieldNames) {
      try {
        console.log(`Testing: "${fieldName}"`);
        await table.update(testRecord[0].id, { [fieldName]: '42' });
        console.log(`✅ "${fieldName}" works!`);
        break; // Hitta första som fungerar
      } catch (error) {
        console.log(`❌ "${fieldName}" failed: ${error.message}`);
      }
    }
    
    // Visa slutresultatet
    console.log('\n📊 Final record:');
    const finalRecord = await table.select({
      filterByFormula: `RECORD_ID() = '${testRecord[0].id}'`
    }).firstPage();
    
    if (finalRecord.length > 0) {
      console.log('Record fields:', finalRecord[0].fields);
    }
    
    // Ta bort test record
    await table.destroy(testRecord[0].id);
    console.log('✅ Test record cleaned up');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Full error:', error);
  }
}

testAirtableFields();
