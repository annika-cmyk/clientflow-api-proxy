const axios = require('axios');

// Test configuration
const API_BASE_URL = 'http://localhost:3000';
const TEST_ORG_NUMBER = '556123-4567'; // Exempel organisationsnummer

async function testAPI() {
  console.log('🧪 Testing API Proxy Service...\n');

  try {
    // Test 1: Health check
    console.log('1. Testing health check...');
    const healthResponse = await axios.get(`${API_BASE_URL}/health`);
    console.log('✅ Health check passed:', healthResponse.data);
    console.log('');

    // Test 2: API lookup with valid org number
    console.log('2. Testing API lookup...');
    const lookupResponse = await axios.post(`${API_BASE_URL}/api/lookup`, {
      orgNumber: TEST_ORG_NUMBER
    });
    console.log('✅ API lookup successful:', lookupResponse.data);
    console.log('');

    // Test 3: API lookup with invalid org number
    console.log('3. Testing with invalid org number...');
    try {
      await axios.post(`${API_BASE_URL}/api/lookup`, {
        orgNumber: '123'
      });
    } catch (error) {
      if (error.response && error.response.status === 400) {
        console.log('✅ Invalid org number correctly rejected:', error.response.data);
      } else {
        console.log('❌ Unexpected error:', error.message);
      }
    }
    console.log('');

    // Test 4: API lookup without org number
    console.log('4. Testing without org number...');
    try {
      await axios.post(`${API_BASE_URL}/api/lookup`, {});
    } catch (error) {
      if (error.response && error.response.status === 400) {
        console.log('✅ Missing org number correctly rejected:', error.response.data);
      } else {
        console.log('❌ Unexpected error:', error.message);
      }
    }

    console.log('\n🎉 All tests completed!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      console.log('\n💡 Make sure the server is running: npm run dev');
    }
  }
}

// Run tests
testAPI();
