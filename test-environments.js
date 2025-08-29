// Test script för att verifiera båda miljöerna
require('dotenv').config();
const axios = require('axios');

async function testEnvironments() {
    console.log('🔍 Testing both environments...\n');
    
    // Test 1: Lokal miljö
    console.log('1️⃣ Testing local environment (localhost:3001)...');
    try {
        const localResponse = await axios.get('http://localhost:3001/health', { timeout: 5000 });
        console.log('✅ Local API: OK');
        console.log('   Status:', localResponse.data.status);
    } catch (error) {
        console.log('❌ Local API: FAILED');
        console.log('   Error:', error.message);
    }
    
    // Test 2: Render miljö
    console.log('\n2️⃣ Testing Render environment (clientflow-api-proxy-1.onrender.com)...');
    try {
        const renderResponse = await axios.get('https://clientflow-api-proxy-1.onrender.com/health', { timeout: 10000 });
        console.log('✅ Render API: OK');
        console.log('   Status:', renderResponse.data.status);
    } catch (error) {
        console.log('❌ Render API: FAILED');
        console.log('   Error:', error.message);
    }
    
    // Test 3: Airtable connection (om lokal API fungerar)
    console.log('\n3️⃣ Testing Airtable connection...');
    try {
        const airtableResponse = await axios.get('http://localhost:3001/api/airtable/test', { timeout: 10000 });
        console.log('✅ Airtable: OK');
        console.log('   Success:', airtableResponse.data.success);
    } catch (error) {
        console.log('❌ Airtable: FAILED');
        console.log('   Error:', error.response?.data?.message || error.message);
    }
    
    console.log('\n📋 Summary:');
    console.log('- Local development: Use http://localhost:3001');
    console.log('- Production: Use https://clientflow-api-proxy-1.onrender.com');
    console.log('- Frontend: https://app.clientflow.se');
}

testEnvironments();
