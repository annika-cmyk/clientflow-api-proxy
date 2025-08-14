const axios = require('axios');

const BASE_URL = 'https://clientflow-api-proxy.onrender.com'; // Render URL

async function testDokumentlista() {
  console.log('🧪 Testar dokumentlista endpoint...');
  
  try {
    const response = await axios.post(`${BASE_URL}/api/bolagsverket/dokumentlista`, {
      organisationsnummer: '5560021361'
    });
    
    console.log('✅ Dokumentlista hämtad framgångsrikt!');
    console.log('📊 Antal dokument:', response.data.antalDokument);
    console.log('📄 Dokument:', JSON.stringify(response.data.dokument, null, 2));
    
  } catch (error) {
    console.error('❌ Fel vid hämtning av dokumentlista:', error.response?.data || error.message);
  }
}

testDokumentlista();
