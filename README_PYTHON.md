# API Proxy Service - Python Version

En Python Flask-baserad API-proxy som fungerar som mellanhand mellan din Softr-applikation och externa API:er.

## Snabbstart

### 1. Installera Python (om du inte redan har det)

Ladda ner Python från [python.org](https://www.python.org/downloads/) och installera det.

### 2. Installera beroenden

```bash
pip install -r requirements.txt
```

### 3. Konfigurera miljövariabler

Skapa en `.env`-fil i projektmappen:

```env
PORT=3000
EXTERNAL_API_URL=https://api.example.com/organizations
EXTERNAL_API_KEY=din_api_nyckel_här
ALLOWED_ORIGINS=https://din-softr-app.softr.app
```

### 4. Starta servern

```bash
python api_proxy.py
```

### 5. Testa API:et

Öppna `test_api.html` i din webbläsare för att testa API:et.

## Funktioner

- ✅ Säker API-proxy för organisationnummer
- ✅ Validering av organisationsnummer (svenskt format)
- ✅ CORS-konfiguration för säkerhet
- ✅ Felhantering och loggning
- ✅ Health check endpoint
- ✅ Konfigurerbar via miljövariabler

## API Endpoints

### Health Check
```
GET /health
```

### Organisation Lookup
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

### Webhook-konfiguration

I din Softr-applikation, konfigurera en webhook:

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

## Deployment

### Lokalt
```bash
python api_proxy.py
```

### På server (med Gunicorn)
```bash
pip install gunicorn
gunicorn -w 4 -b 0.0.0.0:3000 api_proxy:app
```

### Docker
```bash
docker build -t api-proxy-python .
docker run -p 3000:3000 --env-file .env api-proxy-python
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

## Skillnader från Node.js-versionen

- Enklare installation (endast Python krävs)
- Mindre beroenden
- Snabbare startup
- Inbyggd loggning
