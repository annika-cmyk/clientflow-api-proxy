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
   PORT=3000
   EXTERNAL_API_URL=https://api.example.com/organizations
   EXTERNAL_API_KEY=din_api_nyckel_här
   ALLOWED_ORIGINS=https://din-softr-app.softr.app
   ```

## Användning

### Starta servern

**Utvecklingsläge:**
```bash
npm run dev
```

**Produktionsläge:**
```bash
npm start
```

### API Endpoints

#### 1. Health Check
```
GET /health
```
Returnerar serverstatus.

#### 2. Organisation Lookup
```
POST /api/lookup
```

**Request Body:**
```json
{
  "orgNumber": "556123-4567"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    // Data från externt API
  },
  "timestamp": "2024-01-15T10:30:00.000Z",
  "orgNumber": "5561234567"
}
```

## Integration med Softr

### 1. Webhook-konfiguration i Softr

I din Softr-applikation, konfigurera en webhook som skickar data till din API-proxy:

**URL:** `https://din-proxy-server.com/api/lookup`
**Method:** `POST`
**Headers:** 
```
Content-Type: application/json
```

**Body:**
```json
{
  "orgNumber": "{{record.organization_number}}"
}
```

### 2. Hantera svaret i Softr

I Softr kan du använda svaret för att:
- Uppdatera befintliga poster
- Skapa nya poster
- Visa information i din applikation

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
docker run -p 3000:3000 --env-file .env api-proxy
```

## Felsökning

### Vanliga problem

1. **"Externt API inte konfigurerat"**
   - Kontrollera att `EXTERNAL_API_URL` är satt i `.env`

2. **CORS-fel**
   - Kontrollera att din Softr-applikations URL är inkluderad i `ALLOWED_ORIGINS`

3. **API-nyckel fel**
   - Kontrollera att `EXTERNAL_API_KEY` är korrekt

### Loggar

Servern loggar alla API-anrop och fel. Kontrollera konsolen för detaljerad information.

## Support

För frågor eller problem, kontakta utvecklaren eller skapa en issue i projektet.
