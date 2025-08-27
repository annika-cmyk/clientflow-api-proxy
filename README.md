# API Proxy Service

En Node.js-baserad API-proxy som fungerar som mellanhand mellan din Softr-applikation och externa API:er.

## Funktioner

- ✅ Säker API-proxy för organisationnummer
- ✅ Validering av organisationsnummer (svenskt format)
- ✅ Rate limiting för att skydda mot överbelastning
- ✅ CORS-konfiguration för säkerhet
- ✅ Felhantering och loggning
- ✅ Health check endpoint
- ✅ Konfigurerbar via miljövariabler
- ✅ Bolagsverket API integration
- ✅ Airtable integration med användar-ID och byrå-ID
- ✅ Automatisk data-mappning från Bolagsverket till Airtable

## Installation

1. **Klona eller ladda ner projektet**
2. **Installera beroenden:**
   ```bash
   npm install
   ```

3. **Konfigurera miljövariabler:**
   ```bash
   cp env.example .env
   ```
   
   Redigera `.env`-filen med dina inställningar:
   ```env
   # Server Configuration
   PORT=3001
   NODE_ENV=production
   ALLOWED_ORIGINS=https://din-softr-app.softr.app
   
   # Bolagsverket API
   BOLAGSVERKET_CLIENT_ID=din_client_id_från_bolagsverket
   BOLAGSVERKET_CLIENT_SECRET=din_client_secret_från_bolagsverket
   BOLAGSVERKET_ENVIRONMENT=test
   
   # Airtable API
   AIRTABLE_ACCESS_TOKEN=din_airtable_access_token
   AIRTABLE_BASE_ID=din_airtable_base_id
   AIRTABLE_TABLE_NAME=tblOIuLQS2DqmOQWe
   ```

## Användning

### Starta servern

**Option 1: Using Start Scripts (Recommended)**

**Windows Batch:**
```bash
start-server.bat
```

**PowerShell:**
```powershell
.\start-server.ps1
```

**Option 2: Manual Start**

**Utvecklingsläge:**
```bash
npm run dev
```

**Produktionsläge:**
```bash
npm start
```

**Important:** The API server runs on port 3001. All frontend files are configured to use this port.

### API Endpoints

#### 1. Health Check
```
GET /health
```
Returnerar serverstatus.

#### 2. Bolagsverket API - Hämta organisationsdata
```
POST /api/bolagsverket/organisationer
```

**Request Body:**
```json
{
  "organisationsnummer": "5561234567"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    // Organisationsdata från Bolagsverket
  },
  "timestamp": "2024-01-15T10:30:00.000Z",
  "duration": 1250,
  "environment": "test"
}
```

#### 3. Bolagsverket + Airtable - Spara data med användar-ID och byrå-ID
```
POST /api/bolagsverket/save-to-airtable
```

#### 4. Bolagsverket - Hämta dokumentlista (årsredovisningar)
```
POST /api/bolagsverket/dokumentlista
```

**Request Body:**
```json
{
  "organisationsnummer": "5561234567"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Dokumentlista hämtad från Bolagsverket",
  "organisationsnummer": "5561234567",
  "dokument": [
    {
      "filformat": "PDF",
      "registreringstidpunkt": "2023-12-31",
      "rapporteringsperiodTom": "2023-12-31",
      "dokumentId": "doc123456"
    }
  ],
  "antalDokument": 1,
  "timestamp": "2024-01-15T10:30:00.000Z",
  "duration": 1250,
  "environment": "test",
  "requestId": "req-1234567890-abc123"
}
```

#### 5. Bolagsverket - Hämta specifikt dokument (årsredovisning)
```
GET /api/bolagsverket/dokument/:dokumentId
```

**Parameters:**
- `dokumentId` - ID för dokumentet från dokumentlista

**Response:**
- ZIP-fil med årsredovisningen (binary data)
- Filnamn: `arsredovisning-{dokumentId}.zip`

**Request Body:**
```json
{
  "organisationsnummer": "5561234567",
  "anvandareId": "USER12345",
  "byraId": "BYRA67890"
}
```

**Stödda fältnamn för användar-ID:**
- `anvandareId`
- `anvId`
- `userId`
- `anv_id`
- `user_id`

**Stödda fältnamn för byrå-ID:**
- `byraId`
- `byra_id`
- `agencyId`
- `agency_id`

**Response:**
```json
{
  "success": true,
  "message": "Data sparad till Airtable",
  "airtableRecordId": "recXXXXXXXXXXXXXX",
  "organisationsnummer": "5561234567",
  "anvandareId": "USER12345",
  "byraId": "BYRA67890",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "duration": 2500,
  "environment": "test"
}
```

## Integration med Softr

### 1. Webhook-konfiguration i Softr för Bolagsverket + Airtable

I din Softr-applikation, konfigurera en webhook som skickar data till din API-proxy:

**URL:** `https://din-proxy-server.com/api/bolagsverket/save-to-airtable`
**Method:** `POST`
**Headers:** 
```
Content-Type: application/json
```

**Body:**
```json
{
  "organisationsnummer": "{{record.organisationsnummer}}",
  "anvandareId": "{{record.anvandare_id}}",
  "byraId": "{{record.byra_id}}"
}
```

### 2. Alternativa fältnamn

Softr kan använda olika fältnamn. API:et stöder följande varianter:

**Organisationsnummer:**
- `organisationsnummer`
- `orgnr`
- `Orgnr`
- `organization_number`
- `orgNumber`

**Användar-ID:**
- `anvandareId`
- `anvId`
- `userId`
- `anv_id`
- `user_id`

**Byrå-ID:**
- `byraId`
- `byra_id`
- `agencyId`
- `agency_id`

### 3. Vad händer när data skickas

1. **Validering:** API:et validerar organisationsnumret
2. **Bolagsverket:** Hämtar organisationsdata från Bolagsverket API
3. **Airtable:** Sparar data till Airtable med följande fält:
   - Organisationsnummer
   - Företagsnamn
   - Verksamhetsbeskrivning
   - Adress
   - Organisationsform
   - Juridisk form
   - Registreringsdatum
   - **Användar-ID** (från Softr)
   - **Byrå-ID** (från Softr)
   - Timestamp
   - Miljö (test/produktion)

### 4. Hantera svaret i Softr

I Softr kan du använda svaret för att:
- Bekräfta att data sparats
- Visa Airtable Record ID
- Hantera fel
- Visa användar-ID och byrå-ID som sparades

## Säkerhet

- **Rate Limiting:** Max 100 requests per 15 minuter per IP
- **CORS:** Konfigurerbar för specifika domäner
- **Input Validation:** Validerar organisationsnummer format
- **Error Handling:** Säker felhantering utan att exponera känslig information

## Deployment

### Lokalt
```bash
npm start
```

### På server (med PM2)
```bash
npm install -g pm2
pm2 start server.js --name "api-proxy"
pm2 save
pm2 startup
```

### Docker
```bash
docker build -t api-proxy .
docker run -p 3001:3001 --env-file .env api-proxy
```

## Testning

### Testa Airtable-anslutning
```bash
node debug_airtable.js
```

### Testa Softr-integration
```bash
node test_softr_integration.js
```

### Testa Bolagsverket API
```bash
node test_bolagsverket_data.js
```

## Felsökning

### Vanliga problem

1. **"Bolagsverket API inte konfigurerat"**
   - Kontrollera att `BOLAGSVERKET_CLIENT_ID` och `BOLAGSVERKET_CLIENT_SECRET` är satta i `.env`

2. **"Airtable API inte konfigurerat"**
   - Kontrollera att `AIRTABLE_ACCESS_TOKEN` och `AIRTABLE_BASE_ID` är satta i `.env`

3. **CORS-fel**
   - Kontrollera att din Softr-applikations URL är inkluderad i `ALLOWED_ORIGINS`

4. **"Användar-ID eller Byrå-ID saknas"**
   - Kontrollera att Softr skickar rätt fältnamn (se stödda fältnamn ovan)

### Loggar

Servern loggar alla API-anrop och fel. Kontrollera konsolen för detaljerad information.

## Support

För frågor eller problem, kontakta utvecklaren eller skapa en issue i projektet.
