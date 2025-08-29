require('dotenv').config();
const axios = require('axios');

async function testAirtableToken() {
    const token = process.env.AIRTABLE_ACCESS_TOKEN;
    const baseId = process.env.AIRTABLE_BASE_ID || 'appPF8F7VvO5XYB50';
    
    console.log('🔍 Testing Airtable connection...');
    console.log('Token exists:', !!token);
    console.log('Base ID:', baseId);
    
    if (!token) {
        console.log('❌ No token found!');
        return;
    }
    
    try {
        const response = await axios.get(`https://api.airtable.com/v0/${baseId}/Application Users?maxRecords=1`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        console.log('✅ Airtable connection successful!');
        console.log('Records found:', response.data.records?.length || 0);
        
    } catch (error) {
        console.log('❌ Airtable connection failed!');
        console.log('Error:', error.response?.status, error.response?.statusText);
        console.log('Message:', error.response?.data?.error?.message || error.message);
    }
}

testAirtableToken();
