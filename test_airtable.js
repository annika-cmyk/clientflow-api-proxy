const axios = require('axios');
require('dotenv').config();

async function testAirtable() {
  console.log('🔍 Testing Airtable connection...');
  
  const accessToken = process.env.AIRTABLE_ACCESS_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID;
  
  console.log('Access Token:', accessToken ? '✅ Present' : '❌ Missing');
  console.log('Base ID:', baseId ? `✅ ${baseId}` : '❌ Missing');
  
  if (!accessToken || !baseId) {
    console.log('❌ Missing required environment variables');
    return;
  }
  
  try {
    // Test 1: List all tables in the base
    console.log('\n📋 Testing: List tables in base...');
    const tablesUrl = `https://api.airtable.com/v0/meta/bases/${baseId}/tables`;
    
    const tablesResponse = await axios.get(tablesUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });
    
    console.log('✅ Tables found:');
    tablesResponse.data.tables.forEach(table => {
      console.log(`   - ${table.name} (${table.id})`);
    });
    
    // Test 2: Try to access the first table
    if (tablesResponse.data.tables.length > 0) {
      const firstTable = tablesResponse.data.tables[0];
      console.log(`\n📊 Testing: Access table "${firstTable.name}"...`);
      
      const recordsUrl = `https://api.airtable.com/v0/${baseId}/${firstTable.id}?maxRecords=1`;
      
      const recordsResponse = await axios.get(recordsUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });
      
      console.log(`✅ Successfully accessed table "${firstTable.name}"`);
      console.log(`   Records found: ${recordsResponse.data.records?.length || 0}`);
    }
    
  } catch (error) {
    console.log('❌ Error:', error.message);
    
    if (error.response) {
      console.log('Status:', error.response.status);
      console.log('Response:', error.response.data);
      
      if (error.response.status === 403) {
        console.log('\n🔧 403 Error - Possible solutions:');
        console.log('1. Check if your access token has the right permissions');
        console.log('2. Verify the base ID is correct');
        console.log('3. Make sure you have access to this base');
        console.log('4. Try regenerating your access token');
      }
    }
  }
}

testAirtable();
