const axios = require('axios');

// OAuth 2.0 Token Management för Bolagsverket
let bolagsverketToken = null;
let tokenExpiry = null;

async function getBolagsverketToken() {
  const now = new Date();
  
  // Om vi har en giltig token, använd den
  if (bolagsverketToken && tokenExpiry && now < tokenExpiry) {
    return bolagsverketToken;
  }

  try {
    const clientId = 'ivtjfo81tY1J0H9aSdALV8pV6XIa';
    const clientSecret = 'JetRMoVWInJPuyJwfQsEtpZRW9Aa';
    const tokenUrl = 'https://portal-accept2.api.bolagsverket.se/oauth2/token';

    const response = await axios.post(tokenUrl, {
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret
    }, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    bolagsverketToken = response.data.access_token;
    // Sätt utgångstid till 50 minuter (token är giltig i 1 timme)
    tokenExpiry = new Date(now.getTime() + 50 * 60 * 1000);

    console.log('🔑 Ny Bolagsverket OAuth token genererad, utgång:', tokenExpiry.toISOString());
    return bolagsverketToken;

  } catch (error) {
    console.error('Error getting Bolagsverket token:', error.message);
    throw error;
  }
}

async function testBolagsverketData() {
  try {
    const token = await getBolagsverketToken();
    const environment = 'test';
    const orgUrl = 'https://gw-accept2.api.bolagsverket.se/vardefulla-datamangder/v1/organisationer';
    
    // Test med ett riktigt organisationsnummer
    const testOrgNumber = '5560021361'; // Testnummer

    const requestBody = {
      identitetsbeteckning: testOrgNumber
    };

    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': '*/*'
    };

    console.log('🔍 Hämtar data från Bolagsverket för:', testOrgNumber);
    
    const response = await axios.post(orgUrl, requestBody, {
      headers,
      timeout: 15000
    });

    if (!response.data?.organisationer?.[0]) {
      console.log('❌ Ingen data hittad');
      return;
    }

    const orgData = response.data.organisationer[0];
    
    console.log('\n📊 BOLAGSVERKET DATA STRUCTURE:');
    console.log('=====================================');
    console.log(JSON.stringify(orgData, null, 2));
    
    console.log('\n🔍 VIKTIGA FÄLT:');
    console.log('=====================================');
    console.log('Organisationsnamn:', orgData.organisationsnamn);
    console.log('Organisationsform:', orgData.organisationsform);
    console.log('Juridisk Form:', orgData.juridiskForm);
    console.log('Verksamhetsbeskrivning:', orgData.verksamhetsbeskrivning);
    console.log('Postadress:', orgData.postadressOrganisation);
    console.log('Organisationsdatum:', orgData.organisationsdatum);
    console.log('Registreringsland:', orgData.registreringsland);
    console.log('Verksam Organisation:', orgData.verksamOrganisation);
    console.log('Avregistrerad Organisation:', orgData.avregistreradOrganisation);

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
  }
}

testBolagsverketData();

