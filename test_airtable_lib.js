const Airtable = require('airtable');
require('dotenv').config();

async function testAirtableLib() {
  console.log('🔍 Testing Airtable with official library...');
  
  const accessToken = process.env.AIRTABLE_ACCESS_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID;
  const tableName = process.env.AIRTABLE_TABLE_NAME || 'KUNDDATA';
  
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
    
    console.log('\n📋 Testing: List tables...');
    
    // Try to get the table
    const table = base(tableName);
    
    // Try to get the first record
    console.log(`\n📊 Testing: Get first record from "${tableName}"...`);
    const records = await table.select({ maxRecords: 1 }).firstPage();
    
    console.log('✅ Success!');
    console.log(`Records found: ${records.length}`);
    
    if (records.length > 0) {
      console.log('First record fields:', Object.keys(records[0].fields));
    }
    
  } catch (error) {
    console.log('❌ Error:', error.message);
    
    if (error.error) {
      console.log('Error details:', error.error);
    }
    
    if (error.message.includes('403')) {
      console.log('\n🔧 403 Error - Possible solutions:');
      console.log('1. Check if your access token has the right permissions');
      console.log('2. Verify the base ID is correct');
      console.log('3. Make sure you have access to this base');
      console.log('4. Check if the table name is correct');
    }
  }
}

testAirtableLib();
