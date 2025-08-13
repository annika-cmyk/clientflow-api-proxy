const axios = require('axios');
require('dotenv').config();

async function simpleTest() {
  console.log('🔍 Simple Airtable test...');
  
  const accessToken = process.env.AIRTABLE_ACCESS_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID;
  
  console.log('Token starts with:', accessToken ? accessToken.substring(0, 10) + '...' : 'Missing');
  console.log('Base ID:', baseId);
  
  try {
    // Test 1: Just list the base metadata
    console.log('\n📋 Testing: Get base metadata...');
    const baseUrl = `https://api.airtable.com/v0/meta/bases/${baseId}`;
    
    const response = await axios.get(baseUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });
    
    console.log('✅ Base access successful!');
    console.log('Base name:', response.data.name);
    console.log('Tables:', response.data.tables?.length || 0);
    
    if (response.data.tables) {
      console.log('\n📊 Available tables:');
      response.data.tables.forEach(table => {
        console.log(`   - "${table.name}" (ID: ${table.id})`);
      });
    }
    
  } catch (error) {
    console.log('❌ Error:', error.message);
    
    if (error.response) {
      console.log('Status:', error.response.status);
      console.log('Response:', JSON.stringify(error.response.data, null, 2));
      
      if (error.response.status === 403) {
        console.log('\n🔧 403 Error - This means:');
        console.log('1. Your token does not have access to this base');
        console.log('2. The base ID is incorrect');
        console.log('3. You need to add this specific base to your token permissions');
      }
    }
  }
}

simpleTest();
