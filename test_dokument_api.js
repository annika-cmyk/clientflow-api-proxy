const axios = require('axios');

const BASE_URL = 'http://localhost:3000'; // Ändra till din server URL

async function testDokumentlista() {
  console.log('🧪 Testar dokumentlista endpoint...');
  
  try {
    const response = await axios.post(`${BASE_URL}/api/bolagsverket/dokumentlista`, {
      organisationsnummer: '5560021361' // Samma test-organisationsnummer som tidigare
    });
    
    console.log('✅ Dokumentlista hämtad framgångsrikt!');
    console.log('📊 Response:', JSON.stringify(response.data, null, 2));
    
    // Om det finns dokument, testa att hämta det första
    if (response.data.dokument && response.data.dokument.length > 0) {
      const firstDocument = response.data.dokument[0];
      console.log(`\n📄 Första dokumentet:`, firstDocument);
      
      // Testa att hämta dokumentet
      await testHämtaDokument(firstDocument.dokumentId);
    } else {
      console.log('ℹ️ Inga dokument tillgängliga för detta organisationsnummer');
    }
    
  } catch (error) {
    console.error('❌ Fel vid hämtning av dokumentlista:', error.response?.data || error.message);
  }
}

async function testHämtaDokument(dokumentId) {
  console.log(`\n🧪 Testar hämta dokument med ID: ${dokumentId}...`);
  
  try {
    const response = await axios.get(`${BASE_URL}/api/bolagsverket/dokument/${dokumentId}`, {
      responseType: 'arraybuffer' // Viktigt för att få binary data
    });
    
    console.log('✅ Dokument hämtat framgångsrikt!');
    console.log('📊 Response headers:', response.headers);
    console.log('📊 Content-Type:', response.headers['content-type']);
    console.log('📊 Content-Length:', response.headers['content-length']);
    console.log('📊 Content-Disposition:', response.headers['content-disposition']);
    
    // Spara filen lokalt för test
    const fs = require('fs');
    const filename = `test-arsredovisning-${dokumentId}.zip`;
    fs.writeFileSync(filename, response.data);
    console.log(`💾 Dokument sparat som: ${filename}`);
    
  } catch (error) {
    console.error('❌ Fel vid hämtning av dokument:', error.response?.data || error.message);
  }
}

async function testOlikaOrganisationsnummer() {
  console.log('\n🧪 Testar olika organisationsnummer...');
  
  const testNumbers = [
    '5560021361', // Testbolag som vi använt tidigare
    '5561234567', // Ett annat testnummer
    '5567890123'  // Ett tredje testnummer
  ];
  
  for (const orgNumber of testNumbers) {
    console.log(`\n📋 Testar organisationsnummer: ${orgNumber}`);
    
    try {
      const response = await axios.post(`${BASE_URL}/api/bolagsverket/dokumentlista`, {
        organisationsnummer: orgNumber
      });
      
      console.log(`✅ Hittade ${response.data.antalDokument} dokument för ${orgNumber}`);
      
    } catch (error) {
      console.log(`❌ Fel för ${orgNumber}:`, error.response?.data?.message || error.message);
    }
  }
}

// Kör testerna
async function runTests() {
  console.log('🚀 Startar test av Bolagsverket dokument-API...\n');
  
  await testDokumentlista();
  await testOlikaOrganisationsnummer();
  
  console.log('\n✅ Alla tester slutförda!');
}

runTests().catch(console.error);
