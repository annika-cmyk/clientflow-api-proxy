const axios = require('axios');

async function testRiskFactor() {
    console.log('🧪 Testing risk factor creation...');
    
    const testData = {
        'Typ av riskfaktor': 'Geografiska riskfaktorer',
        'Riskfaktor': 'Test Risk',
        'Beskrivning': 'Test beskrivning',
        'Riskbedömning': 'Låg',
        'Åtgärd': 'Test åtgärd',
        'Byrå ID': '49'
    };
    
    try {
        const response = await axios.post('http://localhost:3001/api/risk-factors', testData, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        console.log('✅ Risk factor created successfully!');
        console.log('Response:', response.data);
    } catch (error) {
        console.log('❌ Error creating risk factor:');
        console.log('Status:', error.response?.status);
        console.log('Message:', error.response?.data?.message || error.message);
        console.log('Full error:', error.response?.data);
    }
}

testRiskFactor();
