const Airtable = require('airtable');

// Använd samma token som fungerade
const AIRTABLE_ACCESS_TOKEN = 'patIV1TIf0PEQWwdI.3d142b13f622c153496ac7f4e2e6baa42b3a323cf905da341f9e850337f20e90';
const AIRTABLE_BASE_ID = 'appPF8F7VvO5XYB50';
const AIRTABLE_TABLE_NAME = 'tblOIuLQS2DqmOQWe';

async function listAirtableFields() {
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
    
    console.log('\n📋 AIRTABLE TABLE FIELDS:');
    console.log('=====================================');
    
    if (records.length > 0) {
      const fields = Object.keys(records[0].fields);
      fields.forEach((field, index) => {
        console.log(`${index + 1}. "${field}"`);
      });
      
      console.log(`\n📊 Total fields: ${fields.length}`);
      console.log('\n💡 SUGGESTED MAPPING:');
      console.log('=====================================');
      console.log('Orgnr → Organisationsnummer');
      console.log('Namn → Företagsnamn');
      console.log('Verksamhetsbeskrivning → Verksamhet');
      console.log('Address → Adress');
      console.log('Organisationsform → Bolagsform');
      console.log('Juridisk Form → Juridisk form');
      console.log('Registreringsdatum → Registreringsdatum');
      console.log('Verksam Organisation → Status');
      console.log('Registreringsland → Land');
      console.log('Avregistrerad → Avregistrerad');
      console.log('Beskrivning av kunden → Beskrivning');
      
    } else {
      console.log('❌ No records found in table');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Full error:', error);
  }
}

listAirtableFields();
